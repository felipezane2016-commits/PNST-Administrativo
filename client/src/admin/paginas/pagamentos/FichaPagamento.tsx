import { guardarAnexo } from "@/_core/armazenamento/anexos";
import { useColecao } from "@/_core/armazenamento/colecao";
import type { Usuario } from "@/_core/identidade/permissoes";
import { usuarios } from "@/_core/identidade/sessao";
import { formatarData, formatarDataHora, HOJE } from "@/_core/tempo";
import Gaveta from "@/admin/componentes/Gaveta";
import { formatBRL } from "@/lib/portal";
import { useDadosConciliacao } from "@/modulos/conciliacao/colecoes";
import { aprovar, cancelar, conferir, devolver, registrarPagamento, reprovar } from "@/modulos/pagamentos/acoes";
import { useDadosPagamentos } from "@/modulos/pagamentos/colecoes";
import { diasAte, podeAprovar, podeCancelar, podeExcluirPagamento, podeConferir, podeCorrigir, podePagar, quemAprova } from "@/modulos/pagamentos/regras";
import type { AnexoRef, Pagamento } from "@/modulos/pagamentos/tipos";
import { AlertTriangle, Ban, Check, CornerUpLeft, Pencil, ShieldCheck, Wallet, X, Trash2 } from "lucide-react";
import { useState } from "react";
import { LinkDocumento, SeloStatus } from "./comum";

const PASSOS: { rotulo: string; feito: (p: Pagamento) => string | null }[] = [
  { rotulo: "Solicitado", feito: (p) => `${p.solicitante} · ${formatarData(p.solicitadoEm)}` },
  { rotulo: "Conferido pelo financeiro", feito: (p) => (p.conferencia ? `${p.conferencia.por} · ${formatarDataHora(p.conferencia.em)}` : null) },
  { rotulo: "Aprovado", feito: (p) => (p.aprovacao ? `${p.aprovacao.por} · ${formatarDataHora(p.aprovacao.em)}` : null) },
  { rotulo: "Pago", feito: (p) => (p.pagamento ? `${p.pagamento.por} · ${formatarData(p.pagamento.data)}` : null) },
];

export default function FichaPagamento({ pagamento, usuario, aoFechar, aoCorrigir, aoExcluir }: { pagamento: Pagamento; usuario: Usuario; aoFechar: () => void; aoCorrigir: () => void; aoExcluir?: () => void }) {
  const { config, fornecedores } = useDadosPagamentos();
  const pessoas = useColecao(usuarios);
  const fornecedor = fornecedores.find((f) => f.id === pagamento.fornecedorId) ?? null;
  const [mensagem, setMensagem] = useState<string | null>(null);
  const resultado = (erro: string | null) => setMensagem(erro);
  const dias = diasAte(pagamento.vencimento, HOJE);
  const encerrado = pagamento.status === "Pago" || pagamento.status === "Reprovado" || pagamento.status === "Cancelado";

  const conferivel = podeConferir(usuario, pagamento);
  const aprovavel = podeAprovar(usuario, pagamento, config, HOJE, pessoas);
  const pagavel = podePagar(usuario, pagamento);

  return (
    <Gaveta
      rotulo={`${pagamento.numero} · ${pagamento.empresa}`}
      titulo={pagamento.favorecido}
      subtitulo={
        <>
          {formatBRL(pagamento.valor)} · vence {formatarData(pagamento.vencimento)} · <SeloStatus status={pagamento.status} />
          {pagamento.urgente ? <span className="marca-urgente"> Urgente</span> : null}
        </>
      }
      aoFechar={aoFechar}
      rodape={
        <div className="inline-row inline-row-justo">
          {podeCorrigir(usuario, pagamento) ? (
            <button type="button" className="text-button" onClick={aoCorrigir}>
              <Pencil size={14} strokeWidth={2} /> Corrigir e reenviar
            </button>
          ) : null}
          {podeCancelar(usuario, pagamento) ? <BotaoCancelar pagamento={pagamento} usuario={usuario} aoResultado={resultado} /> : null}
          {aoExcluir && podeExcluirPagamento(usuario, pagamento).ok ? (
            <button type="button" className="text-button text-button-perigo" onClick={aoExcluir}>
              <Trash2 size={14} strokeWidth={2} /> Excluir pedido
            </button>
          ) : null}
        </div>
      }
    >
      {pagamento.motivo && (pagamento.status === "Devolvido" || pagamento.status === "Reprovado" || pagamento.status === "Cancelado") ? (
        <div className="acesso-alerta-erro espaco-abaixo" role="status">
          <span>
            <strong>{pagamento.status}:</strong> {pagamento.motivo}
          </span>
        </div>
      ) : null}
      {pagamento.urgente && pagamento.justificativaUrgencia ? (
        <div className="acesso-alerta-info espaco-abaixo">
          <AlertTriangle size={15} strokeWidth={2} />
          <span>
            <strong>Urgente:</strong> {pagamento.justificativaUrgencia}
          </span>
        </div>
      ) : null}

      {!encerrado ? (
        <section className="ficha-passo ficha-passo-topo">
          <span className="eyebrow accent-eyebrow">Próximo passo</span>
          {pagamento.status === "Em conferência" ? (
            conferivel.ok ? (
              <AcaoComMotivo
                titulo="Conferir documento, valor e dados de pagamento"
                principal={{ rotulo: "Conferido", icone: Check, agir: () => resultado(conferir(pagamento.id, usuario)) }}
                alternativas={[{ rotulo: "Devolver", icone: CornerUpLeft, agir: (motivo) => resultado(devolver(pagamento.id, motivo, usuario)) }]}
              />
            ) : (
              <p className="field-hint">Aguardando a conferência do financeiro. {conferivel.motivo.includes("próprio") ? conferivel.motivo : ""}</p>
            )
          ) : null}
          {pagamento.status === "Aguardando aprovação" ? (
            aprovavel.ok ? (
              <AprovarPagamento pagamento={pagamento} usuario={usuario} dadosPendentes={Boolean(fornecedor && !fornecedor.dadosValidados)} aoResultado={resultado} />
            ) : (
              <p className="field-hint">
                Aguardando a aprovação de {quemAprova(pagamento, pessoas, config, HOJE)}.{" "}
                {!aprovavel.ok && aprovavel.motivo.startsWith("Você") ? aprovavel.motivo : ""}
              </p>
            )
          ) : null}
          {pagamento.status === "Aprovado" ? (
            pagavel.ok ? (
              <RegistrarPagamento pagamento={pagamento} usuario={usuario} aoResultado={resultado} />
            ) : (
              <p className="field-hint">Aprovado. Aguardando o financeiro pagar. {usuario.id === pagamento.aprovacao?.porId ? pagavel.motivo : ""}</p>
            )
          ) : null}
          {pagamento.status === "Devolvido" ? <p className="field-hint">Voltou para {pagamento.solicitante} corrigir e reenviar.</p> : null}
          {mensagem ? (
            <p className="field-error espaco-acima-curto" role="alert">
              {mensagem}
            </p>
          ) : null}
        </section>
      ) : null}

      <ol className="next-step-list espaco-acima">
        {PASSOS.map((passo, indice) => {
          const detalhe = passo.feito(pagamento);
          return (
            <li key={passo.rotulo} className={`next-step${detalhe ? " next-step-done" : ""}`}>
              <span className="step-number">{detalhe ? <Check size={13} strokeWidth={2.6} /> : indice + 1}</span>
              <div className="next-step-copy">
                <strong>{passo.rotulo}</strong>
                {detalhe ? <span>{detalhe}</span> : null}
              </div>
            </li>
          );
        })}
      </ol>

      <dl className="data-list espaco-acima">
        <div className="data-list-cheio">
          <dt>Descrição</dt>
          <dd>{pagamento.descricao}</dd>
        </div>
        <div>
          <dt>Categoria</dt>
          <dd>{pagamento.categoria}</dd>
        </div>
        <div>
          <dt>Vencimento</dt>
          <dd>
            {formatarData(pagamento.vencimento)}
            {!encerrado ? ` (${dias < 0 ? `vencido há ${-dias} dia(s)` : dias === 0 ? "hoje" : `em ${dias} dia(s)`})` : ""}
          </dd>
        </div>
        <div>
          <dt>Forma</dt>
          <dd>{pagamento.forma}</dd>
        </div>
        <div>
          <dt>Dados de pagamento</dt>
          <dd className="cell-code">{pagamento.dadosPagamento || "—"}</dd>
        </div>
        <div>
          <dt>Centro de custo</dt>
          <dd>
            {pagamento.cliente || "Escritório"}
            {pagamento.caso ? ` · ${pagamento.caso}` : ""}
            {pagamento.reembolsavel ? " · reembolsável" : ""}
          </dd>
        </div>
        <div>
          <dt>Origem</dt>
          <dd>{pagamento.origem === "Prestadores" ? "Conferência de prestadores" : `Pedido de ${pagamento.solicitante}`}</dd>
        </div>
        {fornecedor ? (
          <div className="data-list-cheio">
            <dt>Fornecedor</dt>
            <dd>
              {fornecedor.nome} · {fornecedor.documento}
              {fornecedor.dadosValidados ? "" : " · dados bancários alterados, a validar"}
            </dd>
          </div>
        ) : null}
      </dl>

      <section className="espaco-acima">
        <span className="eyebrow">Documentos</span>
        <ul className="lista-documentos espaco-acima-curto">
          {pagamento.documentos.map((documento, indice) => (
            <li key={indice}>
              <LinkDocumento anexo={documento} />
            </li>
          ))}
          {pagamento.pagamento?.comprovante ? (
            <li>
              <LinkDocumento anexo={pagamento.pagamento.comprovante} />
            </li>
          ) : null}
        </ul>
      </section>

      <section className="espaco-acima">
        <span className="eyebrow">Histórico</span>
        <ul className="historico-ordem">
          {[...pagamento.historico].reverse().map((evento, indice) => (
            <li key={indice}>
              <strong>{evento.texto}</strong>
              <span>
                {formatarDataHora(evento.quando)} · {evento.autor}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </Gaveta>
  );
}

type Acao = { rotulo: string; icone: typeof Check; agir: (motivo: string) => void };

/** Ação principal com um clique; as alternativas (devolver, reprovar) pedem motivo. */
function AcaoComMotivo({ titulo, principal, alternativas }: { titulo: string; principal: Acao; alternativas: Acao[] }) {
  const [escolhida, setEscolhida] = useState<Acao | null>(null);
  const [motivo, setMotivo] = useState("");
  const Principal = principal.icone;
  return (
    <>
      <h3>{titulo}</h3>
      {escolhida ? (
        <div className="form-decisao">
          <label className="field-group">
            <span className="field-label">Motivo ({escolhida.rotulo.toLowerCase()})</span>
            <input className="field-input" value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus placeholder="O que precisa mudar ou por que não segue" />
          </label>
          <div className="inline-row">
            <button type="button" className="button-secondary" onClick={() => setEscolhida(null)}>
              Voltar
            </button>
            <button type="button" className="button-primary" onClick={() => escolhida.agir(motivo)}>
              Confirmar: {escolhida.rotulo.toLowerCase()}
            </button>
          </div>
        </div>
      ) : (
        <div className="inline-row">
          <button type="button" className="button-primary" onClick={() => principal.agir("")}>
            <Principal size={15} strokeWidth={2.2} /> {principal.rotulo}
          </button>
          {alternativas.map((alternativa) => {
            const Icone = alternativa.icone;
            return (
              <button key={alternativa.rotulo} type="button" className="button-secondary" onClick={() => setEscolhida(alternativa)}>
                <Icone size={15} strokeWidth={2} /> {alternativa.rotulo}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

function AprovarPagamento({ pagamento, usuario, dadosPendentes, aoResultado }: { pagamento: Pagamento; usuario: Usuario; dadosPendentes: boolean; aoResultado: (erro: string | null) => void }) {
  const [confirmado, setConfirmado] = useState(false);
  return (
    <>
      {dadosPendentes ? (
        <label className="check-label confirma-dados">
          <input type="checkbox" checked={confirmado} onChange={(e) => setConfirmado(e.target.checked)} />
          Os dados bancários deste fornecedor mudaram. Confirmei por telefone, com um contato já conhecido, que a conta nova é dele.
        </label>
      ) : null}
      <AcaoComMotivo
        titulo="Aprovar o pagamento"
        principal={{ rotulo: "Aprovar", icone: ShieldCheck, agir: () => aoResultado(aprovar(pagamento.id, usuario, confirmado)) }}
        alternativas={[
          { rotulo: "Devolver", icone: CornerUpLeft, agir: (motivo) => aoResultado(devolver(pagamento.id, motivo, usuario)) },
          { rotulo: "Reprovar", icone: X, agir: (motivo) => aoResultado(reprovar(pagamento.id, motivo, usuario)) },
        ]}
      />
    </>
  );
}

function RegistrarPagamento({ pagamento, usuario, aoResultado }: { pagamento: Pagamento; usuario: Usuario; aoResultado: (erro: string | null) => void }) {
  const { contas } = useDadosConciliacao();
  const daEmpresa = contas.filter((conta) => conta.ativa && conta.empresa === pagamento.empresa);
  const [contaId, setContaId] = useState(daEmpresa[0]?.id ?? "");
  const [data, setData] = useState(HOJE);
  const [comprovante, setComprovante] = useState<AnexoRef | null>(null);

  async function anexar(arquivo: File | undefined) {
    if (!arquivo) return;
    try {
      const anexo = await guardarAnexo(arquivo);
      setComprovante({ anexoId: anexo.id, nome: anexo.nome });
    } catch {
      setComprovante({ anexoId: null, nome: arquivo.name });
    }
  }

  return (
    <div className="form-decisao">
      <h3>Pagar no banco e registrar</h3>
      <div className="field-grid">
        <label className="field-group">
          <span className="field-label">Conta de saída</span>
          <select className="field-input" value={contaId} onChange={(e) => setContaId(e.target.value)}>
            {daEmpresa.map((conta) => (
              <option key={conta.id} value={conta.id}>
                {conta.banco} · {conta.empresa} — {conta.numero}
              </option>
            ))}
            <option value="">Outra (fora da conciliação)</option>
          </select>
        </label>
        <label className="field-group">
          <span className="field-label">Data do pagamento</span>
          <input className="field-input" type="date" value={data} onChange={(e) => setData(e.target.value)} />
        </label>
      </div>
      <label className="field-group">
        <span className="field-label">Comprovante</span>
        <input className="field-input" type="file" accept="application/pdf,image/*" onChange={(e) => anexar(e.target.files?.[0])} />
        <span className="field-hint">O pagamento entra no razão da conta escolhida e casa com o débito do extrato na conciliação.</span>
      </label>
      <button type="button" className="button-primary" onClick={() => aoResultado(registrarPagamento(pagamento.id, { data, contaId: contaId || null, comprovante }, usuario))}>
        <Wallet size={15} strokeWidth={2.2} /> Registrar pagamento
      </button>
    </div>
  );
}

function BotaoCancelar({ pagamento, usuario, aoResultado }: { pagamento: Pagamento; usuario: Usuario; aoResultado: (erro: string | null) => void }) {
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState("");
  if (!aberto)
    return (
      <button type="button" className="text-button text-button-neutro" onClick={() => setAberto(true)}>
        <Ban size={14} strokeWidth={2} /> Cancelar pedido
      </button>
    );
  return (
    <span className="inline-row">
      <input className="field-input field-input-compacto" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo do cancelamento" aria-label="Motivo do cancelamento" />
      <button type="button" className="text-button text-button-perigo" onClick={() => aoResultado(cancelar(pagamento.id, motivo, usuario))}>
        Cancelar
      </button>
    </span>
  );
}
