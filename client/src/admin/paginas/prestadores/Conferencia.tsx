import { pode } from "@/_core/identidade/permissoes";
import { useUsuarioAtual } from "@/_core/identidade/sessao";
import { formatarData, formatarDataHora } from "@/_core/tempo";
import Cabecalho from "@/admin/componentes/Cabecalho";
import Gaveta from "@/admin/componentes/Gaveta";
import Selo, { type Tom } from "@/admin/componentes/Selo";
import Vazio from "@/admin/componentes/Vazio";
import StatusPill from "@/components/StatusPill";
import { formatBRL, formatMonth, type Receipt } from "@/lib/portal";
import ReceiptModal from "@/components/ReceiptModal";
import { aprovarRecibo, atualizarRecibo, devolverRecibo, excluirRecibo, finalizarConferencia } from "@/modulos/prestadores/acoes";
import { AcoesRecibo, bloqueioDoRecibo, BotaoAnexo, BotaoLotePdf, BotaoReciboPdf, ConfirmarExclusaoRecibo, DetalhesRecibo } from "./ReciboDetalhe";
import { solicitarDoLote } from "@/modulos/pagamentos/acoes";
import { pagamentos } from "@/modulos/pagamentos/colecoes";
import { useColecao } from "@/_core/armazenamento/colecao";
import { useLocation } from "wouter";
import { montarLotes, podeFinalizarConferencia, podeMarcarPago, type Lote } from "@/modulos/prestadores/regras";
import type { SituacaoLote } from "@/modulos/prestadores/tipos";
import { useDadosPrestadores } from "@/modulos/prestadores/usarDados";
import { AlertCircle, Check, ChevronDown, ChevronUp, ClipboardCheck, FileText, Undo2, Wallet } from "lucide-react";
import { useState } from "react";

const TOM_SITUACAO: Record<SituacaoLote, Tom> = {
  "Aguardando conferência": "amber",
  "Recibos avulsos": "neutral",
  Conferido: "blue",
  Pago: "green",
};

const FILTROS: (SituacaoLote | "Todos")[] = ["Todos", "Aguardando conferência", "Recibos avulsos", "Conferido", "Pago"];

export default function Conferencia() {
  const { prestadores, recibos, fechamentos } = useDadosPrestadores();
  const usuario = useUsuarioAtual();
  const podeAgir = pode(usuario, "registros.editar");
  const podeExcluir = pode(usuario, "registros.excluir");
  const [editando, setEditando] = useState<Receipt | null>(null);
  const [removendo, setRemovendo] = useState<Receipt | null>(null);
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]>("Todos");
  const [chaveAberta, setChaveAberta] = useState<string | null>(null);

  const lotes = montarLotes(recibos, fechamentos, prestadores);
  const visiveis = filtro === "Todos" ? lotes : lotes.filter((lote) => lote.situacao === filtro);
  // O lote é remontado a cada mudança: a gaveta acompanha a decisão recém-tomada.
  const aberto = lotes.find((lote) => lote.chave === chaveAberta) ?? null;

  return (
    <>
      <Cabecalho
        rotulo="Prestadores de serviço"
        titulo="Conferência de recibos"
        descricao="Cada lote é um prestador numa competência. Aprove ou devolva cada recibo, finalize e registre o pagamento."
      />

      <section className="operations-surface">
        <div className="surface-toolbar">
          <div className="filter-chips" role="group" aria-label="Filtrar por situação">
            {FILTROS.map((opcao) => (
              <button
                key={opcao}
                type="button"
                className={filtro === opcao ? "filter-chip filter-chip-active" : "filter-chip"}
                aria-pressed={filtro === opcao}
                onClick={() => setFiltro(opcao)}
              >
                {opcao}
                <span className="filter-chip-count" aria-hidden="true">
                  {opcao === "Todos" ? lotes.length : lotes.filter((lote) => lote.situacao === opcao).length}
                </span>
              </button>
            ))}
          </div>
        </div>

        {visiveis.length === 0 ? (
          <Vazio icone={ClipboardCheck} titulo="Nenhum lote nesta situação" texto="Quando um prestador enviar recibos, eles aparecem aqui." />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Prestador</th>
                  <th>Competência</th>
                  <th>Recibos</th>
                  <th>Valor</th>
                  <th>Situação</th>
                  <th>
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((lote) => (
                  <tr key={lote.chave}>
                    <td className="cell-main">
                      <strong>{lote.prestador.nome}</strong>
                      <span>{lote.prestador.categoria}</span>
                    </td>
                    <td>{formatMonth(lote.competencia)}</td>
                    <td>
                      {lote.recibos.length}
                      {lote.pendentes > 0 ? ` · ${lote.pendentes} a decidir` : ""}
                    </td>
                    <td className="money">{formatBRL(lote.total)}</td>
                    <td>
                      <Selo tom={TOM_SITUACAO[lote.situacao]}>{lote.situacao}</Selo>
                    </td>
                    <td>
                      <div className="cell-actions">
                        <button type="button" className="text-button" onClick={() => setChaveAberta(lote.chave)}>
                          {lote.pendentes > 0 && podeAgir ? "Conferir" : "Abrir"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* A gaveta some enquanto o formulário de um recibo dela está aberto, e volta depois. */}
      {aberto && !editando && !removendo ? (
        <GavetaLote lote={aberto} podeAgir={podeAgir} podeExcluir={podeExcluir} aoEditar={setEditando} aoExcluir={setRemovendo} aoFechar={() => setChaveAberta(null)} />
      ) : null}
      {editando ? (
        <ReceiptModal
          receipt={editando}
          competencia={editando.competencia}
          prestadorId={editando.prestadorId}
          descricao="Correção pelo escritório: o prestador vê a alteração no portal."
          onClose={() => setEditando(null)}
          onSave={(draft) => {
            atualizarRecibo(editando.id, draft);
            setEditando(null);
          }}
        />
      ) : null}
      {removendo ? (
        <ConfirmarExclusaoRecibo
          recibo={removendo}
          nomePrestador={prestadores.find((prestador) => prestador.id === removendo.prestadorId)?.nome ?? "Prestador"}
          aoFechar={() => setRemovendo(null)}
          aoConfirmar={() => {
            excluirRecibo(removendo.id);
            setRemovendo(null);
          }}
        />
      ) : null}
    </>
  );
}

function GavetaLote({
  lote,
  podeAgir,
  podeExcluir,
  aoEditar,
  aoExcluir,
  aoFechar,
}: {
  lote: Lote;
  podeAgir: boolean;
  podeExcluir: boolean;
  aoEditar: (recibo: Receipt) => void;
  aoExcluir: (recibo: Receipt) => void;
  aoFechar: () => void;
}) {
  const finalizar = podeAgir && podeFinalizarConferencia(lote);
  const usuario = useUsuarioAtual();
  const [, navegar] = useLocation();
  const listaPagamentos = useColecao(pagamentos);
  const chave = `${lote.prestador.id}|${lote.competencia}`;
  // O lote conferido vira pedido de pagamento: o pago vem da aprovação, não de um clique aqui.
  const pedido = listaPagamentos.find((p) => p.origemId === chave && p.status !== "Cancelado" && p.status !== "Reprovado") ?? null;
  const pagar = podeAgir && podeMarcarPago(lote) && !pedido;
  const enviados = lote.situacao !== "Recibos avulsos";

  return (
    <Gaveta
      rotulo={`Lote · ${formatMonth(lote.competencia)}`}
      titulo={lote.prestador.nome}
      subtitulo={<Selo tom={TOM_SITUACAO[lote.situacao]}>{lote.situacao}</Selo>}
      aoFechar={aoFechar}
      rodape={
        <>
          <span className="field-hint alinhar-centro">
            {!podeAgir
              ? "Seu papel só permite consultar."
              : lote.situacao === "Recibos avulsos"
                ? "O prestador ainda não enviou o fechamento do mês."
                : lote.pendentes > 0
                  ? `Decida ${lote.pendentes} recibo(s) para finalizar.`
                  : lote.situacao === "Pago"
                    ? "Lote encerrado."
                    : ""}
          </span>
          {finalizar ? (
            <button type="button" className="button-primary" onClick={() => finalizarConferencia(lote.prestador.id, lote.competencia)}>
              <Check size={15} strokeWidth={2.2} /> Finalizar conferência
            </button>
          ) : null}
          {pagar && usuario ? (
            <button type="button" className="button-primary" onClick={() => solicitarDoLote(lote, usuario)}>
              <Wallet size={15} strokeWidth={2} /> Solicitar pagamento
            </button>
          ) : null}
          {pedido && lote.situacao !== "Pago" ? (
            <button type="button" className="button-secondary" onClick={() => navegar("/contas/pagamentos")}>
              <Wallet size={15} strokeWidth={2} /> {pedido.numero}: {pedido.status.toLowerCase()}
            </button>
          ) : null}
        </>
      }
    >
      <dl className="data-list">
        <div>
          <dt>Valor do lote</dt>
          <dd className="money">{formatBRL(lote.total)}</dd>
        </div>
        <div>
          <dt>Recibos</dt>
          <dd>{lote.recibos.length}</dd>
        </div>
        <div>
          <dt>Fechamento</dt>
          <dd>
            {enviados && lote.fechamento?.submittedAt ? `Enviado em ${formatarDataHora(lote.fechamento.submittedAt)}` : "Não enviado"}
          </dd>
        </div>
        <div className="data-list-cheio">
          <dt>Documento de faturamento</dt>
          <dd>
            <BotaoAnexo id={lote.fechamento?.documentId ?? null} nome={lote.fechamento?.documentName ?? null} rotulo="Documento em PDF" />
          </dd>
        </div>
        <div className="data-list-cheio">
          <dt>Para conferir ou arquivar</dt>
          <dd>
            <BotaoLotePdf recibos={lote.recibos} nomePrestador={lote.prestador.nome} competencia={lote.competencia} fechamento={lote.fechamento ?? null} />
          </dd>
        </div>
      </dl>

      <div className="section-header secao-seguinte">
        <div>
          <span className="eyebrow">Recibos</span>
          <h3>Decisão por recibo</h3>
        </div>
      </div>
      <div className="ged-list">
        {lote.recibos.map((recibo) => (
          <ReciboConferido
            key={recibo.id}
            recibo={recibo}
            nomePrestador={lote.prestador.nome}
            podeAgir={podeAgir}
            podeExcluir={podeExcluir}
            bloqueio={bloqueioDoRecibo(recibo, lote.fechamento)}
            aoEditar={aoEditar}
            aoExcluir={aoExcluir}
          />
        ))}
      </div>
    </Gaveta>
  );
}

function ReciboConferido({
  recibo,
  nomePrestador,
  podeAgir,
  podeExcluir,
  bloqueio,
  aoEditar,
  aoExcluir,
}: {
  recibo: Receipt;
  nomePrestador: string;
  podeAgir: boolean;
  podeExcluir: boolean;
  bloqueio: string | null;
  aoEditar: (recibo: Receipt) => void;
  aoExcluir: (recibo: Receipt) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [devolvendo, setDevolvendo] = useState(false);
  const [nota, setNota] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const decidir = podeAgir && recibo.status === "Enviado";

  function confirmarDevolucao() {
    // Devolver sem dizer o porquê obriga o prestador a adivinhar o que corrigir.
    if (!nota.trim()) {
      setErro("Diga ao prestador o que corrigir.");
      return;
    }
    devolverRecibo(recibo.id, nota);
    setDevolvendo(false);
  }

  return (
    <div className="ged-line ged-line-topo">
      <span className="doc-icon" aria-hidden="true">
        <FileText size={16} strokeWidth={1.9} />
      </span>
      <div className="ged-line-copy">
        <strong>
          {recibo.client} · {recibo.category}
        </strong>
        <span>
          {recibo.id} · {formatarData(recibo.serviceDate)}
        </span>
        <p className="ged-line-descricao">{recibo.description}</p>
        <div className="inline-row espaco-acima-curto">
          <BotaoReciboPdf recibo={recibo} nomePrestador={nomePrestador} />
          <BotaoAnexo id={recibo.attachmentId ?? null} nome={recibo.attachmentName} />
        </div>
        {recibo.reviewNote ? (
          <p className="cell-note">
            <AlertCircle size={13} strokeWidth={2} />
            {recibo.reviewNote}
          </p>
        ) : null}
      </div>
      <div className="ged-line-meta">
        <span className="money">{formatBRL(recibo.amount)}</span>
        <StatusPill status={recibo.status} />
      </div>

      <div className="inline-row inline-row-justo recibo-rodape">
        <button type="button" className="text-button text-button-neutro" onClick={() => setAberto(!aberto)} aria-expanded={aberto}>
          {aberto ? <ChevronUp size={14} strokeWidth={2} /> : <ChevronDown size={14} strokeWidth={2} />} {aberto ? "Fechar recibo" : "Abrir recibo"}
        </button>
        <AcoesRecibo recibo={recibo} podeEditar={podeAgir} podeExcluir={podeExcluir} bloqueio={bloqueio} aoEditar={aoEditar} aoExcluir={aoExcluir} />
      </div>
      {aberto ? <DetalhesRecibo recibo={recibo} /> : null}

      {decidir && !devolvendo ? (
        <div className="inline-row inline-row-fim">
          <button type="button" className="button-secondary" onClick={() => setDevolvendo(true)}>
            <Undo2 size={14} strokeWidth={2} /> Devolver
          </button>
          <button type="button" className="button-primary" onClick={() => aprovarRecibo(recibo.id)} aria-label={`Aprovar ${recibo.id}`}>
            <Check size={14} strokeWidth={2.2} /> Aprovar
          </button>
        </div>
      ) : null}

      {devolvendo ? (
        <div className="field-group field-group-cheio">
          <label className="field-label" htmlFor={`nota-${recibo.id}`}>
            Motivo da devolução
          </label>
          <textarea
            id={`nota-${recibo.id}`}
            className="field-input"
            value={nota}
            onChange={(evento) => {
              setNota(evento.target.value);
              setErro(null);
            }}
            placeholder="Ex.: o comprovante está ilegível, anexe novamente."
            aria-invalid={erro ? true : undefined}
            aria-describedby={erro ? `nota-${recibo.id}-erro` : undefined}
            autoFocus
          />
          {erro ? (
            <span id={`nota-${recibo.id}-erro`} className="field-error" role="alert">
              <AlertCircle size={13} strokeWidth={2} />
              {erro}
            </span>
          ) : null}
          <div className="inline-row inline-row-fim">
            <button type="button" className="button-secondary" onClick={() => setDevolvendo(false)}>
              Cancelar
            </button>
            <button type="button" className="button-primary" onClick={confirmarDevolucao}>
              Devolver ao prestador
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
