import { abrirAnexo, apagarAnexo, guardarAnexo, pastaDoPrestador } from "@/_core/armazenamento/anexos";
import {
  anexosDoRecibo,
  competenciaOf,
  formatAmount,
  maskAmount,
  RECEIPT_CATEGORIES,
  validateReceiptDraft,
  type ArquivoAnexo,
  type Receipt,
  type ReceiptDraft,
  type ValidationErrors,
} from "@/lib/portal";
import { AlertCircle, Paperclip, Upload, X } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";

function emptyDraft(competencia: string): ReceiptDraft {
  return {
    serviceDate: `${competencia}-01`,
    category: "Motoboy",
    client: "",
    caseRef: "",
    requester: "",
    description: "",
    amount: "",
    anexos: [],
  };
}

function receiptToDraft(receipt: Receipt): ReceiptDraft {
  return {
    serviceDate: receipt.serviceDate,
    category: receipt.category,
    client: receipt.client,
    caseRef: receipt.caseRef,
    requester: receipt.requester,
    description: receipt.description,
    amount: formatAmount(receipt.amount),
    anexos: anexosDoRecibo(receipt),
  };
}

type FieldProps = {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: (aria: {
    id: string;
    "aria-invalid"?: true;
    "aria-describedby"?: string;
  }) => ReactNode;
};

/** Liga rótulo, dica e erro ao campo, para leitor de tela anunciar os três. */
function Field({ id, label, error, hint, children }: FieldProps) {
  const describedBy = [error ? `${id}-erro` : null, hint ? `${id}-dica` : null]
    .filter(Boolean)
    .join(" ");
  return (
    <div className="field-group">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      {children({
        id,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": describedBy || undefined,
      })}
      {hint ? (
        <span id={`${id}-dica`} className="field-hint">
          {hint}
        </span>
      ) : null}
      {error ? (
        <span id={`${id}-erro`} className="field-error" role="alert">
          <AlertCircle size={13} strokeWidth={2} />
          {error}
        </span>
      ) : null}
    </div>
  );
}

type ReceiptModalProps = {
  receipt: Receipt | null;
  competencia: string;
  /** Dono do recibo: os arquivos vão para a pasta dele. */
  prestadorId: string;
  /** Texto do topo; o escritório usa um próprio ao editar recibo de prestador. */
  descricao?: string;
  onClose: () => void;
  onSave: (draft: ReceiptDraft) => void;
};

/** Tamanho máximo de cada documento (o bucket aceita até 20 MB). */
const LIMITE_ARQUIVO = 20 * 1024 * 1024;

/** Os formatos da referência: PDF, imagem, Word e Excel. */
export const FORMATOS_DOCUMENTO = ".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx";

export default function ReceiptModal({
  receipt,
  competencia,
  prestadorId,
  descricao,
  onClose: fecharSemSalvar,
  onSave,
}: ReceiptModalProps) {
  // Arquivos enviados enquanto o formulário esteve aberto: os que não ficarem
  // no recibo (trocados ou cancelados) são apagados para não sobrar lixo.
  const enviadosAgora = useRef<string[]>([]);
  const [enviando, setEnviando] = useState<string | null>(null);
  const [erroArquivo, setErroArquivo] = useState<string | null>(null);
  const onClose = () => {
    enviadosAgora.current.forEach((id) => void apagarAnexo(id));
    fecharSemSalvar();
  };
  const [draft, setDraft] = useState<ReceiptDraft>(() =>
    receipt ? receiptToDraft(receipt) : emptyDraft(competencia)
  );
  const [errors, setErrors] = useState<ValidationErrors>({});
  const firstFieldRef = useRef<HTMLInputElement>(null);
  // onClose muda a cada render do pai; guardado em ref, o efeito abaixo roda uma
  // vez só e não devolve o foco ao primeiro campo no meio da digitação.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    firstFieldRef.current?.focus();
    const onKey = (event: KeyboardEvent) =>
      event.key === "Escape" && onCloseRef.current();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function update<K extends keyof ReceiptDraft>(
    field: K,
    value: ReceiptDraft[K]
  ) {
    setDraft(current => ({ ...current, [field]: value }));
    // Erro corrigido some na hora, sem esperar o próximo envio.
    if (errors[field])
      setErrors(current => ({ ...current, [field]: undefined }));
  }

  async function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const arquivos = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!arquivos.length) return;
    const grandes = arquivos.filter((arquivo) => arquivo.size > LIMITE_ARQUIVO);
    setErroArquivo(grandes.length ? `Maior que 20 MB, não enviado: ${grandes.map((a) => a.name).join(", ")}.` : null);
    const pasta = pastaDoPrestador(prestadorId, competenciaOf(draft.serviceDate) || competencia);
    for (const arquivo of arquivos.filter((item) => item.size <= LIMITE_ARQUIVO)) {
      setEnviando(arquivo.name);
      try {
        const anexo = await guardarAnexo(arquivo, pasta);
        enviadosAgora.current.push(anexo.id);
        const novo: ArquivoAnexo = { id: anexo.id, nome: anexo.nome, tipo: anexo.tipo, tamanho: arquivo.size };
        setDraft((atual) => ({ ...atual, anexos: [...atual.anexos, novo] }));
      } catch {
        setErroArquivo(`Não foi possível enviar ${arquivo.name}. Verifique a conexão e tente de novo.`);
      }
    }
    setEnviando(null);
  }

  function removerAnexo(alvo: ArquivoAnexo) {
    setDraft((atual) => ({ ...atual, anexos: atual.anexos.filter((arquivo) => arquivo !== alvo) }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = validateReceiptDraft(draft);
    if (Object.values(found).some(Boolean)) {
      setErrors(found);
      return;
    }
    // Enviados agora e tirados da lista antes de salvar não ficam guardados.
    const ficam = new Set(draft.anexos.map((arquivo) => arquivo.id));
    enviadosAgora.current.filter((id) => !ficam.has(id)).forEach((id) => void apagarAnexo(id));
    enviadosAgora.current = [];
    onSave(draft);
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={event => event.target === event.currentTarget && onClose()}
    >
      <div
        className="modal-panel modal-recibo"
        role="dialog"
        aria-modal="true"
        aria-labelledby="recibo-titulo"
      >
        <div className="modal-panel-header">
          <div>
            <span className="eyebrow">
              {receipt ? `${receipt.id} · ${receipt.status}` : "Novo lançamento"}
            </span>
            <h2 id="recibo-titulo">
              {receipt ? "Editar recibo" : "Novo recibo"}
            </h2>
            <p>
              {descricao ?? (receipt ? "As alterações ficam registradas no histórico." : "Começa como rascunho e vai para o escritório no envio do fechamento do mês.")}
            </p>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Fechar"
            onClick={onClose}
          >
            <X size={17} strokeWidth={2} />
          </button>
        </div>

        <form className="modal-panel-body" onSubmit={handleSubmit} noValidate>
          <fieldset className="form-secao">
            <legend>Serviço</legend>
            <div className="form-grade-3">
              <Field id="recibo-data" label="Data do serviço *" error={errors.serviceDate}>
                {aria => (
                  <input
                    {...aria}
                    ref={firstFieldRef}
                    className="field-input"
                    type="date"
                    value={draft.serviceDate}
                    onChange={event => update("serviceDate", event.target.value)}
                  />
                )}
              </Field>
              <Field id="recibo-categoria" label="Categoria *">
                {aria => (
                  <select
                    {...aria}
                    className="field-input"
                    value={draft.category}
                    onChange={event => update("category", event.target.value)}
                  >
                    {(RECEIPT_CATEGORIES as readonly string[]).includes(draft.category) ? null : (
                      <option value={draft.category}>{draft.category}</option>
                    )}
                    {RECEIPT_CATEGORIES.map(category => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <Field id="recibo-valor" label="Valor *" error={errors.amount}>
                {aria => (
                  <span className="campo-moeda">
                    <span className="campo-moeda-simbolo" aria-hidden="true">R$</span>
                    <input
                      {...aria}
                      className="field-input"
                      value={draft.amount}
                      onChange={event => update("amount", maskAmount(event.target.value))}
                      placeholder="0,00"
                      inputMode="numeric"
                      autoComplete="off"
                    />
                  </span>
                )}
              </Field>
            </div>
            <div className="field-grid">
              <Field id="recibo-cliente" label="Cliente / Caso *" error={errors.client}>
                {aria => (
                  <input
                    {...aria}
                    className="field-input"
                    value={draft.client}
                    onChange={event => update("client", event.target.value)}
                    placeholder="Ex.: Vertti Participações — Proc. 0021458-70"
                  />
                )}
              </Field>
              <Field id="recibo-solicitante" label="Solicitante">
                {aria => (
                  <input
                    {...aria}
                    className="field-input"
                    value={draft.requester}
                    onChange={event => update("requester", event.target.value)}
                    placeholder="Quem pediu o serviço"
                  />
                )}
              </Field>
            </div>
            <Field id="recibo-descricao" label="Descrição do serviço *" error={errors.description}>
              {aria => (
                <textarea
                  {...aria}
                  className="field-input"
                  rows={3}
                  value={draft.description}
                  onChange={event => update("description", event.target.value)}
                  placeholder="O que foi feito, onde e para quê."
                />
              )}
            </Field>
          </fieldset>

          <fieldset className="form-secao">
            <legend id="recibo-anexo-rotulo">
              Documentos <span className="form-secao-dica">NF, boleto, comprovante — PDF, imagem, Word ou Excel</span>
            </legend>
            {draft.anexos.length ? (
              <ul className="anexo-chips" aria-label="Documentos anexados">
                {draft.anexos.map((arquivo, indice) => (
                  <li className="anexo-chip" key={`${arquivo.id ?? arquivo.nome}-${indice}`}>
                    {arquivo.id ? (
                      <button type="button" className="anexo-chip-abrir" onClick={() => void abrirAnexo(arquivo.id!, arquivo.nome)} title="Abrir em PDF">
                        <Paperclip size={12} strokeWidth={2} /> {arquivo.nome}
                      </button>
                    ) : (
                      <span className="anexo-chip-abrir" title="Recibo antigo: o arquivo não foi guardado; anexe de novo.">
                        <Paperclip size={12} strokeWidth={2} /> {arquivo.nome} (não guardado)
                      </span>
                    )}
                    <button type="button" className="anexo-chip-tirar" aria-label={`Tirar ${arquivo.nome}`} onClick={() => removerAnexo(arquivo)}>
                      <X size={12} strokeWidth={2.2} />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <label className="upload-zone upload-zone-compacta">
              <input
                type="file"
                multiple
                accept={FORMATOS_DOCUMENTO}
                onChange={handleFiles}
                disabled={Boolean(enviando)}
                aria-labelledby="recibo-anexo-rotulo"
              />
              <Upload size={17} strokeWidth={1.9} />
              <span className="upload-zone-texto">
                <strong>{enviando ? `Enviando ${enviando}…` : "Selecionar arquivos"}</strong>
                <span>Vários de uma vez, até 20 MB cada</span>
              </span>
            </label>
            {erroArquivo ? (
              <span className="field-error" role="alert">
                <AlertCircle size={13} strokeWidth={2} />
                {erroArquivo}
              </span>
            ) : null}
          </fieldset>

          <div className="modal-panel-footer modal-recibo-rodape">
            <span className="modal-recibo-total">
              Total <strong>R$ {draft.amount || "0,00"}</strong>
            </span>
            <button type="button" className="button-secondary" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="button-primary" disabled={Boolean(enviando)}>
              {receipt ? "Salvar alterações" : "Salvar recibo"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
