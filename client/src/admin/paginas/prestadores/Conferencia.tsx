import { guardarAnexo, pastaDoPrestador } from "@/_core/armazenamento/anexos";
import { useColecao } from "@/_core/armazenamento/colecao";
import { pode } from "@/_core/identidade/permissoes";
import { useUsuarioAtual } from "@/_core/identidade/sessao";
import { formatarData, formatarDataHora } from "@/_core/tempo";
import Cabecalho from "@/admin/componentes/Cabecalho";
import Gaveta from "@/admin/componentes/Gaveta";
import Painel from "@/admin/componentes/Painel";
import Selo, { type Tom } from "@/admin/componentes/Selo";
import Vazio from "@/admin/componentes/Vazio";
import ReceiptModal from "@/components/ReceiptModal";
import { documentosDoFechamento, formatBRL, formatMonthTitle, ROTULO_LOTE, type Receipt } from "@/lib/portal";
import { gerarPdfLote } from "@/lib/reciboPdf";
import { solicitarDoLote } from "@/modulos/pagamentos/acoes";
import { pagamentos } from "@/modulos/pagamentos/colecoes";
import {
  atualizarRecibo,
  excluirLote,
  excluirRecibo,
  finalizarConferencia,
  guardarDocumentoUnico,
  marcarPago,
  rejeitarLote,
  solicitarAjusteLote,
} from "@/modulos/prestadores/acoes";
import { conferenciaAberta, montarLotes, podeFinalizarConferencia, podeMarcarPago, type Lote } from "@/modulos/prestadores/regras";
import type { SituacaoLote } from "@/modulos/prestadores/tipos";
import { useDadosPrestadores } from "@/modulos/prestadores/usarDados";
import { AlertCircle, Check, ClipboardCheck, Eye, FolderOpen, Undo2, Wallet, X, Trash2, Banknote } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { BotaoAnexo, BotaoLotePdf, CartaoRecibo, ConfirmarExclusaoRecibo, ListaDocumentos } from "./ReciboDetalhe";

/** A pasta do prestador no mês do lote, na página Arquivos. */
const pastaDoLote = (lote: Lote) => `/prestadores/arquivos?prestador=${encodeURIComponent(lote.prestador.id)}&mes=${lote.competencia}`;

const TOM_SITUACAO: Record<SituacaoLote, Tom> = {
  "Aguardando conferência": "amber",
  "Em conferência": "blue",
  Conferido: "green",
  Rejeitado: "red",
  Pago: "green",
};

const FILTROS: (SituacaoLote | "Todos")[] = ["Todos", "Aguardando conferência", "Em conferência", "Conferido", "Rejeitado", "Pago"];

type Confirmacao = { tipo: "finalizar" | "rejeitar" | "ajuste" | "pago" | "excluir"; lote: Lote };

/** Conferência: os lotes (fechamentos enviados) e o que o escritório faz com cada um. */
export default function Conferencia() {
  const { prestadores, recibos, fechamentos } = useDadosPrestadores();
  const usuario = useUsuarioAtual();
  const autor = usuario?.nome ?? "Escritório";
  const podeAgir = pode(usuario, "registros.editar");
  const podeExcluir = pode(usuario, "registros.excluir");
  const [, navegar] = useLocation();
  const [editando, setEditando] = useState<Receipt | null>(null);
  const [removendo, setRemovendo] = useState<Receipt | null>(null);
  const [confirmando, setConfirmando] = useState<Confirmacao | null>(null);
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]>("Todos");
  const [chaveAberta, setChaveAberta] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const lotes = montarLotes(recibos, fechamentos, prestadores);
  const visiveis = filtro === "Todos" ? lotes : lotes.filter((lote) => lote.situacao === filtro);
  // O lote é remontado a cada mudança: a gaveta acompanha a decisão recém-tomada.
  const aberto = lotes.find((lote) => lote.chave === chaveAberta) ?? null;

  /** Finalizar: aprova tudo, gera o documento único na pasta do prestador e leva para Arquivos. */
  async function finalizar(lote: Lote) {
    finalizarConferencia(lote.prestador.id, lote.competencia, autor);
    setChaveAberta(null);
    setAviso(`Conferência finalizada — ${lote.prestador.nome} · ${formatMonthTitle(lote.competencia)}. Gerando o documento único...`);
    try {
      const aprovados = lote.recibos.map((recibo) => ({ ...recibo, status: "Aprovado" as const }));
      const blob = await gerarPdfLote(aprovados, lote.prestador.nome, lote.competencia, lote.fechamento);
      const nome = `${lote.prestador.nome.replace(/\s+/g, "-")}_${lote.competencia}_completo.pdf`;
      const anexo = await guardarAnexo(new File([blob], nome, { type: "application/pdf" }), pastaDoPrestador(lote.prestador.id, lote.competencia));
      guardarDocumentoUnico(lote.prestador.id, lote.competencia, { id: anexo.id, nome, tipo: "application/pdf", tamanho: blob.size }, autor);
      setAviso(`Documento único gerado — ${lote.prestador.nome} · ${formatMonthTitle(lote.competencia)}.`);
      setTimeout(() => navegar(pastaDoLote(lote)), 1500);
    } catch {
      setAviso("Conferência finalizada, mas não foi possível gerar o documento único. Gere de novo pelo botão do lote.");
    }
  }

  return (
    <>
      <Cabecalho
        rotulo="Prestadores de serviço"
        titulo="Conferência de recibos"
        descricao="Cada lote é o fechamento que um prestador enviou. Abra, confira os recibos e os documentos e finalize, rejeite ou peça ajuste; depois registre o pagamento."
      />

      {aviso ? (
        <p className="acesso-alerta-info espaco-abaixo" role="status">
          {aviso}
        </p>
      ) : null}

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
                {opcao === "Todos" ? "Todos" : ROTULO_LOTE[opcao]}
                <span className="filter-chip-count" aria-hidden="true">
                  {opcao === "Todos" ? lotes.length : lotes.filter((lote) => lote.situacao === opcao).length}
                </span>
              </button>
            ))}
          </div>
          <span className="field-hint">{lotes.length} lote(s)</span>
        </div>

        {visiveis.length === 0 ? (
          <Vazio icone={ClipboardCheck} titulo="Nenhum lote recebido" texto="Quando um prestador enviar o fechamento do mês, o lote aparece aqui." />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Competência</th>
                  <th>Prestador</th>
                  <th>Recibos</th>
                  <th>Valor total</th>
                  <th>Status</th>
                  <th>Enviado em</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((lote) => (
                  <tr key={lote.chave}>
                    <td>
                      <strong>{formatMonthTitle(lote.competencia)}</strong>
                    </td>
                    <td className="cell-main">
                      <strong>{lote.prestador.nome}</strong>
                      <span>{lote.prestador.categoria}</span>
                    </td>
                    <td>{lote.recibos.length}</td>
                    <td className="money">
                      <strong>{formatBRL(lote.total)}</strong>
                    </td>
                    <td>
                      <Selo tom={TOM_SITUACAO[lote.situacao]}>{ROTULO_LOTE[lote.situacao]}</Selo>
                    </td>
                    <td>{lote.enviadoEm ? formatarData(lote.enviadoEm.slice(0, 10)) : "—"}</td>
                    <td>
                      <div className="cell-actions">
                        <button type="button" className="icon-button icon-button-pequeno" aria-label={`Abrir lote de ${lote.prestador.nome}`} title="Abrir" onClick={() => setChaveAberta(lote.chave)}>
                          <Eye size={14} strokeWidth={1.9} />
                        </button>
                        {podeAgir && podeFinalizarConferencia(lote) ? (
                          <button type="button" className="icon-button icon-button-pequeno icon-button-primario" aria-label={`Finalizar conferência de ${lote.prestador.nome}`} title="Finalizar conferência" onClick={() => setConfirmando({ tipo: "finalizar", lote })}>
                            <Check size={14} strokeWidth={2.2} />
                          </button>
                        ) : null}
                        {podeAgir && conferenciaAberta(lote) ? (
                          <button type="button" className="icon-button icon-button-pequeno icon-button-danger" aria-label={`Rejeitar lote de ${lote.prestador.nome}`} title="Rejeitar" onClick={() => setConfirmando({ tipo: "rejeitar", lote })}>
                            <X size={14} strokeWidth={2.2} />
                          </button>
                        ) : null}
                        {podeAgir && podeMarcarPago(lote) ? (
                          <button type="button" className="icon-button icon-button-pequeno icon-button-primario" aria-label={`Marcar como pago: ${lote.prestador.nome}`} title="Marcar como pago" onClick={() => setConfirmando({ tipo: "pago", lote })}>
                            <Banknote size={14} strokeWidth={1.9} />
                          </button>
                        ) : null}
                        {podeExcluir ? (
                          <button type="button" className="icon-button icon-button-pequeno icon-button-danger" aria-label={`Excluir lote de ${lote.prestador.nome}`} title="Excluir lote" onClick={() => setConfirmando({ tipo: "excluir", lote })}>
                            <Trash2 size={14} strokeWidth={1.9} />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* A gaveta some enquanto um formulário dela está aberto, e volta depois. */}
      {aberto && !editando && !removendo && !confirmando ? (
        <GavetaLote
          lote={aberto}
          podeAgir={podeAgir}
          podeExcluir={podeExcluir}
          aoEditar={setEditando}
          aoExcluir={setRemovendo}
          aoConfirmar={(tipo) => setConfirmando({ tipo, lote: aberto })}
          aoFechar={() => setChaveAberta(null)}
        />
      ) : null}
      {editando ? (
        <ReceiptModal
          receipt={editando}
          competencia={editando.competencia}
          prestadorId={editando.prestadorId}
          descricao="Correção pelo escritório: o prestador vê a alteração no portal e ela fica no histórico."
          onClose={() => setEditando(null)}
          onSave={(draft) => {
            atualizarRecibo(editando.id, draft, autor);
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
            excluirRecibo(removendo.id, autor);
            setRemovendo(null);
          }}
        />
      ) : null}
      {confirmando ? (
        <ConfirmarLote
          confirmacao={confirmando}
          aoFechar={() => setConfirmando(null)}
          aoConfirmar={(texto) => {
            const { tipo, lote } = confirmando;
            const [id, mes] = [lote.prestador.id, lote.competencia];
            setConfirmando(null);
            if (tipo === "finalizar") void finalizar(lote);
            if (tipo === "rejeitar") rejeitarLote(id, mes, texto, autor);
            if (tipo === "ajuste") solicitarAjusteLote(id, mes, texto, autor);
            if (tipo === "pago") marcarPago(id, mes, autor);
            if (tipo === "excluir") {
              excluirLote(id, mes, autor);
              setChaveAberta(null);
            }
          }}
        />
      ) : null}
    </>
  );
}

const TEXTOS: Record<Confirmacao["tipo"], { titulo: string; botao: string; corpo: string; campo?: string; obrigatorio?: boolean }> = {
  finalizar: {
    titulo: "Finalizar a conferência?",
    botao: "Finalizar conferência",
    corpo: "Todos os recibos do lote ficam aprovados. O documento único (recibos, documentos e NF) é gerado e guardado em Arquivos.",
  },
  rejeitar: { titulo: "Rejeitar este lote?", botao: "Rejeitar lote", corpo: "Todos os recibos do lote ficam rejeitados. O prestador vê o motivo no portal.", campo: "Motivo (opcional)" },
  ajuste: {
    titulo: "Solicitar ajuste ao prestador?",
    botao: "Solicitar ajuste",
    corpo: "Os recibos do lote voltam ao prestador como \"Ajuste solicitado\". Ele corrige e reenvia cada um para a conferência.",
    campo: "O que precisa ser ajustado",
    obrigatorio: true,
  },
  pago: { titulo: "Marcar o lote como pago?", botao: "Marcar como pago", corpo: "O lote e os recibos dele ficam como pagos no portal do prestador." },
  excluir: {
    titulo: "Excluir este lote definitivamente?",
    botao: "Excluir lote",
    corpo: "Os recibos vinculados, os documentos e o fechamento do mês também são excluídos. Não dá para desfazer.",
  },
};

function ConfirmarLote({ confirmacao, aoFechar, aoConfirmar }: { confirmacao: Confirmacao; aoFechar: () => void; aoConfirmar: (texto: string) => void }) {
  const textos = TEXTOS[confirmacao.tipo];
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const { lote } = confirmacao;
  return (
    <Painel
      rotulo={`${lote.prestador.nome} · ${formatMonthTitle(lote.competencia)}`}
      titulo={textos.titulo}
      aoFechar={aoFechar}
      aoEnviar={() => {
        if (textos.obrigatorio && !texto.trim()) return setErro("Diga ao prestador o que ajustar.");
        aoConfirmar(texto);
      }}
      textoEnviar={textos.botao}
    >
      <p>
        {lote.recibos.length} recibo(s) · <strong>{formatBRL(lote.total)}</strong>
      </p>
      <p className={confirmacao.tipo === "excluir" || confirmacao.tipo === "rejeitar" ? "texto-perigo" : undefined}>{textos.corpo}</p>
      {textos.campo ? (
        <div className="field-group">
          <label className="field-label" htmlFor="lote-texto">
            {textos.campo}
          </label>
          <textarea
            id="lote-texto"
            className="field-input"
            value={texto}
            onChange={(evento) => {
              setTexto(evento.target.value);
              setErro(null);
            }}
            aria-invalid={erro ? true : undefined}
            autoFocus
          />
          {erro ? (
            <span className="field-error" role="alert">
              <AlertCircle size={13} strokeWidth={2} /> {erro}
            </span>
          ) : null}
        </div>
      ) : null}
    </Painel>
  );
}

function GavetaLote({
  lote,
  podeAgir,
  podeExcluir,
  aoEditar,
  aoExcluir,
  aoConfirmar,
  aoFechar,
}: {
  lote: Lote;
  podeAgir: boolean;
  podeExcluir: boolean;
  aoEditar: (recibo: Receipt) => void;
  aoExcluir: (recibo: Receipt) => void;
  aoConfirmar: (tipo: Confirmacao["tipo"]) => void;
  aoFechar: () => void;
}) {
  const usuario = useUsuarioAtual();
  const [, navegar] = useLocation();
  const listaPagamentos = useColecao(pagamentos);
  // O lote conferido também pode virar pedido de pagamento (Account Management → Pagamentos).
  const pedido = listaPagamentos.find((p) => p.origemId === lote.chave && p.status !== "Cancelado" && p.status !== "Reprovado") ?? null;
  const aberta = conferenciaAberta(lote);
  const documentos = documentosDoFechamento(lote.fechamento);

  return (
    <Gaveta
      rotulo={`Lote · ${formatMonthTitle(lote.competencia)}`}
      titulo={`${lote.prestador.nome} — ${formatMonthTitle(lote.competencia)}`}
      subtitulo={<Selo tom={TOM_SITUACAO[lote.situacao]}>{ROTULO_LOTE[lote.situacao]}</Selo>}
      aoFechar={aoFechar}
      rodape={
        <>
          {podeExcluir ? (
            <button type="button" className="button-secondary botao-perigo" onClick={() => aoConfirmar("excluir")}>
              <Trash2 size={14} strokeWidth={2} /> Excluir lote
            </button>
          ) : (
            <span />
          )}
          <span className="inline-row">
            {!podeAgir ? <span className="field-hint alinhar-centro">Seu papel só permite consultar.</span> : null}
            {podeAgir && aberta ? (
              <>
                <button type="button" className="button-secondary" onClick={() => aoConfirmar("ajuste")}>
                  <Undo2 size={14} strokeWidth={2} /> Solicitar ajuste
                </button>
                <button type="button" className="button-secondary botao-perigo" onClick={() => aoConfirmar("rejeitar")}>
                  <X size={14} strokeWidth={2} /> Rejeitar
                </button>
              </>
            ) : null}
            {podeAgir && podeFinalizarConferencia(lote) ? (
              <button type="button" className="button-primary" onClick={() => aoConfirmar("finalizar")}>
                <Check size={15} strokeWidth={2.2} /> Finalizar conferência
              </button>
            ) : null}
            {podeAgir && podeMarcarPago(lote) && usuario && !pedido ? (
              <button type="button" className="button-secondary" onClick={() => solicitarDoLote(lote, usuario)}>
                <Wallet size={15} strokeWidth={2} /> Solicitar pagamento
              </button>
            ) : null}
            {pedido && lote.situacao !== "Pago" ? (
              <button type="button" className="button-secondary" onClick={() => navegar("/contas/pagamentos")}>
                <Wallet size={15} strokeWidth={2} /> {pedido.numero}: {pedido.status.toLowerCase()}
              </button>
            ) : null}
            {podeAgir && podeMarcarPago(lote) ? (
              <button type="button" className="button-primary" onClick={() => aoConfirmar("pago")}>
                <Banknote size={15} strokeWidth={2} /> Marcar como pago
              </button>
            ) : null}
          </span>
        </>
      }
    >
      <dl className="data-list">
        <div>
          <dt>Prestador</dt>
          <dd>{lote.prestador.nome}</dd>
        </div>
        <div>
          <dt>Competência</dt>
          <dd>{formatMonthTitle(lote.competencia)}</dd>
        </div>
        <div>
          <dt>Valor total</dt>
          <dd className="money">
            <strong>{formatBRL(lote.total)}</strong>
          </dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>
            <Selo tom={TOM_SITUACAO[lote.situacao]}>{ROTULO_LOTE[lote.situacao]}</Selo>
          </dd>
        </div>
        <div className="data-list-cheio">
          <dt>Enviado em</dt>
          <dd>{lote.enviadoEm ? formatarDataHora(lote.enviadoEm) : "—"}</dd>
        </div>
        {lote.fechamento.obs ? (
          <div className="data-list-cheio">
            <dt>Observação</dt>
            <dd>{lote.fechamento.obs}</dd>
          </div>
        ) : null}
        <div className="data-list-cheio">
          <dt>Documentos complementares do fechamento ({documentos.length})</dt>
          <dd>
            <ListaDocumentos arquivos={documentos} vazio="O prestador não anexou NF, fatura ou boleto" />
          </dd>
        </div>
        <div className="data-list-cheio">
          <dt>Documento único</dt>
          <dd className="inline-row">
            {lote.fechamento.documentoUnico ? (
              <BotaoAnexo id={lote.fechamento.documentoUnico.id} nome={lote.fechamento.documentoUnico.nome} rotulo={lote.fechamento.documentoUnico.nome} />
            ) : null}
            <BotaoLotePdf recibos={lote.recibos} nomePrestador={lote.prestador.nome} competencia={lote.competencia} fechamento={lote.fechamento} />
            <button type="button" className="text-button" onClick={() => navegar(pastaDoLote(lote))}>
              <FolderOpen size={13} strokeWidth={2} /> Arquivos
            </button>
          </dd>
        </div>
      </dl>

      <div className="section-header secao-seguinte">
        <div>
          <span className="eyebrow">Recibos</span>
          <h3>{lote.recibos.length} recibo(s) do lote</h3>
        </div>
      </div>
      {lote.recibos.length ? (
        <div className="stack">
          {lote.recibos.map((recibo) => (
            <CartaoRecibo
              key={recibo.id}
              recibo={recibo}
              nomePrestador={lote.prestador.nome}
              podeEditar={podeAgir}
              podeExcluir={podeExcluir}
              aoEditar={aoEditar}
              aoExcluir={aoExcluir}
            />
          ))}
        </div>
      ) : (
        <p className="field-hint">Os recibos deste lote foram excluídos.</p>
      )}
    </Gaveta>
  );
}
