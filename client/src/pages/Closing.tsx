import { abrirAnexo, guardarAnexo, pastaDoPrestador } from "@/_core/armazenamento/anexos";
import Painel from "@/admin/componentes/Painel";
import PortalShell from "@/components/PortalShell";
import ReceiptModal, { FORMATOS_DOCUMENTO } from "@/components/ReceiptModal";
import StatusPill from "@/components/StatusPill";
import { usePortal } from "@/contexts/PortalContext";
import {
  closingSent,
  documentosDoFechamento,
  formatBRL,
  formatDate,
  formatMonthTitle,
  receiptsForClosing,
  receiptsOfCompetencia,
  ROTULO_LOTE,
  shiftMonth,
  type ArquivoAnexo,
  type Receipt,
} from "@/lib/portal";
import { baixarRelatorioMensal } from "@/lib/reciboPdf";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, FileBarChart2, FileText, Paperclip, Pencil, Send, Upload } from "lucide-react";
import { useState, type ChangeEvent } from "react";
import CabecalhoPagina from "@/components/CabecalhoPagina";

const LIMITE_ARQUIVO = 20 * 1024 * 1024;

/** Fechamento mensal: consolida o mês e envia para a conferência do escritório. */
export default function Closing() {
  const { receipts, currentCompetencia, closingFor, submitClosing, registerFile, updateReceipt, prestadorId, provider } = usePortal();
  const [mes, setMes] = useState(currentCompetencia);
  const [editing, setEditing] = useState<Receipt | null>(null);
  const [envioAberto, setEnvioAberto] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);

  const itens = receiptsOfCompetencia(receipts, mes);
  const vaoNoEnvio = receiptsForClosing(receipts, mes);
  const totalBruto = itens.reduce((soma, recibo) => soma + recibo.amount, 0);
  const pendentes = itens.filter((recibo) => recibo.status === "Rascunho" || recibo.status === "Pendente de envio").length;
  const fechamento = closingFor(mes);
  const enviado = closingSent(fechamento);

  function abrirEnvio() {
    setAviso(null);
    if (!vaoNoEnvio.length) return setAviso("Nenhum recibo para enviar neste mês.");
    if (enviado) return setAviso("Este mês já possui um fechamento enviado.");
    setEnvioAberto(true);
  }

  async function gerarRelatorio() {
    setGerando(true);
    try {
      const arquivo = await baixarRelatorioMensal(itens, provider.name, mes);
      // Como na referência: o relatório também fica na pasta do prestador.
      const guardado = await guardarAnexo(arquivo, pastaDoPrestador(prestadorId, mes));
      registerFile(mes, "Relatório mensal salvo na pasta do portal", { id: guardado.id, nome: guardado.nome, tipo: "application/pdf", tamanho: arquivo.size });
      setAviso(`Relatório salvo na pasta do portal — ${formatMonthTitle(mes)}.`);
    } catch {
      setAviso("Não foi possível gerar o relatório. Tente de novo.");
    } finally {
      setGerando(false);
    }
  }

  return (
    <PortalShell title="Fechamento mensal">
      <CabecalhoPagina rotulo="Fechamento" titulo="Fechamento mensal" descricao="Consolide e envie seus recibos para conferência." />

      <div className="mes-navegacao">
        <button type="button" className="icon-button" aria-label="Mês anterior" onClick={() => setMes(shiftMonth(mes, -1))}>
          <ChevronLeft size={16} strokeWidth={2} />
        </button>
        <strong aria-live="polite">{formatMonthTitle(mes)}</strong>
        <button type="button" className="icon-button" aria-label="Próximo mês" onClick={() => setMes(shiftMonth(mes, 1))}>
          <ChevronRight size={16} strokeWidth={2} />
        </button>
        <button type="button" className="button-primary mes-navegacao-acao" onClick={abrirEnvio}>
          <Send size={15} strokeWidth={2} /> Enviar para conferência
        </button>
      </div>

      {aviso ? (
        <p className="acesso-alerta-info espaco-abaixo" role="status">
          {aviso}
        </p>
      ) : null}

      {fechamento.submitted && fechamento.review ? (
        <div className={fechamento.review === "Rejeitado" ? "risk-card" : "risk-card risk-card-ok"} role="status">
          <span className="risk-icon">
            {fechamento.review === "Rejeitado" ? <AlertTriangle size={16} strokeWidth={2} /> : <CheckCircle2 size={16} strokeWidth={2} />}
          </span>
          <div className="risk-card-head">
            <strong>
              Fechamento de {formatMonthTitle(mes)} {fechamento.review === "Rejeitado" ? "rejeitado pelo escritório" : "já enviado"} — Status: {ROTULO_LOTE[fechamento.review]}
            </strong>
            <p>
              {fechamento.obs
                ? `Observação do escritório: ${fechamento.obs}`
                : fechamento.submittedAt
                  ? `Enviado em ${formatDate(fechamento.submittedAt.slice(0, 10))}.`
                  : ""}
            </p>
            {documentosDoFechamento(fechamento).length ? (
              <span className="inline-row">
                {documentosDoFechamento(fechamento).map((documento, indice) =>
                  documento.id ? (
                    <button key={indice} type="button" className="text-button" onClick={() => void abrirAnexo(documento.id!, documento.nome)}>
                      <Paperclip size={13} strokeWidth={2} /> {documento.nome}
                    </button>
                  ) : (
                    <span key={indice} className="field-hint">
                      <Paperclip size={13} strokeWidth={2} /> {documento.nome}
                    </span>
                  ),
                )}
              </span>
            ) : null}
          </div>
          {fechamento.review !== "Rejeitado" ? (
            <button type="button" className="button-secondary" onClick={() => void gerarRelatorio()} disabled={gerando || !itens.length}>
              <FileBarChart2 size={14} strokeWidth={2} /> {gerando ? "Gerando..." : "Relatório mensal PDF"}
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="kpi-grid kpi-grid-tres">
        <div className="kpi-card kpi-neutro">
          <span className="kpi-label">Total de recibos</span>
          <p className="kpi-value">{itens.length}</p>
        </div>
        <div className="kpi-card kpi-neutro">
          <span className="kpi-label">Valor bruto</span>
          <p className="kpi-value">{formatBRL(totalBruto)}</p>
        </div>
        <div className="kpi-card kpi-neutro">
          <span className="kpi-label">Vão no envio</span>
          <p className="kpi-value">{formatBRL(vaoNoEnvio.reduce((soma, recibo) => soma + recibo.amount, 0))}</p>
          <p className="kpi-detail">sem rejeitados e arquivados</p>
        </div>
      </div>

      {pendentes > 0 ? (
        <p className="acesso-alerta-aviso espaco-abaixo" role="status">
          <AlertTriangle size={14} strokeWidth={2} /> {pendentes} recibo(s) em rascunho ou pendente de envio.
        </p>
      ) : null}

      <section className="operations-surface">
        <div className="section-header">
          <div>
            <span className="eyebrow">Recibos</span>
            <h3>Recibos de {formatMonthTitle(mes)}</h3>
          </div>
        </div>
        {itens.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Cliente</th>
                  <th>Categoria</th>
                  <th>Valor</th>
                  <th>Status</th>
                  <th>
                    <span className="sr-only">Editar</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {itens.map((recibo) => (
                  <tr key={recibo.id}>
                    <td>{formatDate(recibo.serviceDate)}</td>
                    <td>{recibo.client || "—"}</td>
                    <td>{recibo.category || "—"}</td>
                    <td className="money">{formatBRL(recibo.amount)}</td>
                    <td>
                      <StatusPill status={recibo.status} />
                    </td>
                    <td>
                      <button type="button" className="icon-button icon-button-pequeno" aria-label={`Editar ${recibo.id}`} onClick={() => setEditing(recibo)}>
                        <Pencil size={14} strokeWidth={1.9} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <FileText size={19} strokeWidth={1.8} />
            <strong>Nenhum recibo neste mês.</strong>
          </div>
        )}
      </section>

      {envioAberto ? (
        <EnvioFechamento
          mes={mes}
          quantidade={vaoNoEnvio.length}
          total={vaoNoEnvio.reduce((soma, recibo) => soma + recibo.amount, 0)}
          prestadorId={prestadorId}
          aoFechar={() => setEnvioAberto(false)}
          aoConfirmar={(documentos) => {
            const { quantidade, total } = submitClosing(mes, documentos);
            setEnvioAberto(false);
            setAviso(
              `Fechamento enviado com sucesso! ${quantidade} recibo(s) · ${formatBRL(total)}${documentos.length ? ` · ${documentos.length} documento(s) complementar(es) incluído(s)` : ""}. A equipe financeira receberá os dados para conferência.`,
            );
          }}
        />
      ) : null}
      {editing ? (
        <ReceiptModal
          receipt={editing}
          competencia={mes}
          prestadorId={prestadorId}
          onClose={() => setEditing(null)}
          onSave={(draft) => {
            updateReceipt(editing.id, draft);
            setEditing(null);
          }}
        />
      ) : null}
    </PortalShell>
  );
}

/** Janela de envio: lembra a NF do mês, mostra o resumo e recebe os documentos. */
function EnvioFechamento({
  mes,
  quantidade,
  total,
  prestadorId,
  aoFechar,
  aoConfirmar,
}: {
  mes: string;
  quantidade: number;
  total: number;
  prestadorId: string;
  aoFechar: () => void;
  aoConfirmar: (documentos: ArquivoAnexo[]) => void;
}) {
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function escolher(evento: ChangeEvent<HTMLInputElement>) {
    const escolhidos = Array.from(evento.target.files ?? []);
    evento.target.value = "";
    const grandes = escolhidos.filter((arquivo) => arquivo.size > LIMITE_ARQUIVO);
    setErro(grandes.length ? `Maior que 20 MB, não incluído: ${grandes.map((a) => a.name).join(", ")}.` : null);
    setArquivos((atuais) => [...atuais, ...escolhidos.filter((arquivo) => arquivo.size <= LIMITE_ARQUIVO)]);
  }

  async function confirmar() {
    setEnviando(true);
    setErro(null);
    const guardados: ArquivoAnexo[] = [];
    try {
      for (const arquivo of arquivos) {
        const anexo = await guardarAnexo(arquivo, pastaDoPrestador(prestadorId, mes));
        guardados.push({ id: anexo.id, nome: anexo.nome, tipo: anexo.tipo, tamanho: arquivo.size });
      }
      aoConfirmar(guardados);
    } catch {
      setErro("Não foi possível enviar os documentos. Verifique a conexão e tente de novo.");
      setEnviando(false);
    }
  }

  return (
    <Painel rotulo="Fechamento" titulo="Enviar para conferência" aoFechar={enviando ? () => undefined : aoFechar}>
      <>
        <div className="acesso-alerta-aviso">
          <Paperclip size={15} strokeWidth={2} />
          <span>
            <strong>Inclua a Nota Fiscal do fechamento.</strong> Anexe a Nota Fiscal, Fatura ou Boleto com o valor total dos recibos deste mês ({formatBRL(total)}). Um único
            documento para o fechamento completo.
          </span>
        </div>

        <div className="kpi-grid kpi-grid-dois espaco-acima">
          <div className="kpi-card kpi-neutro">
            <span className="kpi-label">Recibos</span>
            <p className="kpi-value">{quantidade}</p>
          </div>
          <div className="kpi-card kpi-neutro">
            <span className="kpi-label">Valor total</span>
            <p className="kpi-value">{formatBRL(total)}</p>
          </div>
        </div>

        <div className="field-group">
          <span className="field-label" id="fech-docs-rotulo">
            NF / Fatura / Boleto do fechamento
          </span>
          <span className="field-hint">
            Anexe a NF ou documento equivalente referente ao total de {formatMonthTitle(mes)}. Você pode incluir mais de um arquivo se necessário.
          </span>
          <label className="upload-zone">
            <input type="file" multiple accept={FORMATOS_DOCUMENTO} onChange={escolher} disabled={enviando} aria-labelledby="fech-docs-rotulo" />
            <Upload size={19} strokeWidth={1.9} />
            <strong>Clique para selecionar arquivos</strong>
            <span>PDF, imagem, Word, Excel — múltiplos permitidos</span>
          </label>
          {arquivos.length ? (
            <ul className="anexo-chips" aria-label="Documentos escolhidos">
              {arquivos.map((arquivo, indice) => (
                <li className="anexo-chip" key={`${arquivo.name}-${indice}`}>
                  <span className="anexo-chip-abrir">
                    <Paperclip size={12} strokeWidth={2} /> {arquivo.name} · {(arquivo.size / 1024).toFixed(0)} KB
                  </span>
                  <button
                    type="button"
                    className="anexo-chip-tirar"
                    aria-label={`Tirar ${arquivo.name}`}
                    onClick={() => setArquivos((atuais) => atuais.filter((_, i) => i !== indice))}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {erro ? (
            <span className="field-error" role="alert">
              {erro}
            </span>
          ) : null}
        </div>

        <p className="field-hint">Após o envio, os recibos seguem para a conferência do escritório.</p>

        <div className="modal-panel-footer">
          <button type="button" className="button-secondary" onClick={aoFechar} disabled={enviando}>
            Cancelar
          </button>
          <button type="button" className="button-primary" onClick={() => void confirmar()} disabled={enviando}>
            <Send size={14} strokeWidth={2} /> {enviando ? "Enviando..." : "Confirmar envio"}
          </button>
        </div>
      </>
    </Painel>
  );
}
