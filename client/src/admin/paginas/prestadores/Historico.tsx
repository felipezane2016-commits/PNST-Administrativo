import { pode } from "@/_core/identidade/permissoes";
import { useUsuarioAtual } from "@/_core/identidade/sessao";
import { formatarData } from "@/_core/tempo";
import Cabecalho from "@/admin/componentes/Cabecalho";
import Gaveta from "@/admin/componentes/Gaveta";
import ReceiptModal from "@/components/ReceiptModal";
import { atualizarRecibo, excluirRecibo } from "@/modulos/prestadores/acoes";
import { BotaoReciboPdf, ConfirmarExclusaoRecibo, DetalhesRecibo } from "./ReciboDetalhe";
import Vazio from "@/admin/componentes/Vazio";
import StatusPill from "@/components/StatusPill";
import { anexosDoRecibo, formatBRL, formatMonth, listCompetencias, RECEIPT_STATUSES, ROTULO_REGISTRO, type PrototypeReceiptStatus, type Receipt, type TipoRegistro } from "@/lib/portal";
import { useDadosPrestadores } from "@/modulos/prestadores/usarDados";
import { Banknote, CheckCircle2, FileText, History, Paperclip, Pencil, Plus, RefreshCw, Search, SearchX, Trash2, Upload } from "lucide-react";
import { useState } from "react";

type FiltroStatus = PrototypeReceiptStatus | "Todos";

const ICONE_REGISTRO: Record<TipoRegistro, typeof Plus> = {
  criacao: Plus,
  edicao: Pencil,
  status: RefreshCw,
  upload: Upload,
  aprovacao: CheckCircle2,
  pagamento: Banknote,
  exclusao: Trash2,
  arquivo: FileText,
};

/** Histórico: o registro de atividades (como na referência) e a lista de todos os recibos. */
export default function Historico() {
  const [aba, setAba] = useState<"atividades" | "recibos">("atividades");
  return (
    <>
      <Cabecalho
        rotulo="Prestadores de serviço"
        titulo="Histórico"
        descricao="Tudo o que aconteceu com os recibos — quem lançou, editou, enviou, conferiu e pagou — e a lista completa de recibos."
      />
      <div className="filter-chips espaco-abaixo" role="tablist" aria-label="Histórico">
        <button type="button" role="tab" aria-selected={aba === "atividades"} className={aba === "atividades" ? "filter-chip filter-chip-active" : "filter-chip"} onClick={() => setAba("atividades")}>
          <History size={13} strokeWidth={2} /> Atividades
        </button>
        <button type="button" role="tab" aria-selected={aba === "recibos"} className={aba === "recibos" ? "filter-chip filter-chip-active" : "filter-chip"} onClick={() => setAba("recibos")}>
          <FileText size={13} strokeWidth={2} /> Recibos
        </button>
      </div>
      {aba === "atividades" ? <Atividades /> : <ListaDeRecibos />}
    </>
  );
}

function Atividades() {
  const { prestadores, registros } = useDadosPrestadores();
  const [tipo, setTipo] = useState<TipoRegistro | "">("");
  const [prestadorId, setPrestadorId] = useState("todos");
  const nomeDe = new Map(prestadores.map((prestador) => [prestador.id, prestador.nome]));
  const visiveis = registros
    .filter((registro) => !tipo || registro.tipo === tipo)
    .filter((registro) => prestadorId === "todos" || registro.prestadorId === prestadorId)
    .sort((a, b) => b.dataHora.localeCompare(a.dataHora))
    .slice(0, 100);
  return (
    <section className="operations-surface">
      <div className="surface-toolbar">
        <select className="field-input field-input-compacto" value={tipo} onChange={(evento) => setTipo(evento.target.value as TipoRegistro | "")} aria-label="Tipo de atividade">
          <option value="">Todos os tipos</option>
          {(Object.keys(ROTULO_REGISTRO) as TipoRegistro[]).map((opcao) => (
            <option key={opcao} value={opcao}>
              {ROTULO_REGISTRO[opcao]}
            </option>
          ))}
        </select>
        <select className="field-input field-input-compacto" value={prestadorId} onChange={(evento) => setPrestadorId(evento.target.value)} aria-label="Prestador">
          <option value="todos">Todos os prestadores</option>
          {prestadores.map((prestador) => (
            <option key={prestador.id} value={prestador.id}>
              {prestador.nome}
            </option>
          ))}
        </select>
      </div>
      {visiveis.length === 0 ? (
        <Vazio icone={History} titulo="Nenhum registro no histórico" />
      ) : (
        <ul className="log-lista">
          {visiveis.map((registro) => {
            const Icone = ICONE_REGISTRO[registro.tipo] ?? FileText;
            return (
              <li className="log-linha" key={registro.id}>
                <span className="doc-icon" aria-hidden="true">
                  <Icone size={15} strokeWidth={1.9} />
                </span>
                <div>
                  <strong>
                    {registro.acao}
                    {registro.reciboId ? <span className="cell-code"> · {registro.reciboId}</span> : null}
                  </strong>
                  <span className="texto-apoio">
                    {registro.usuario} · {new Date(registro.dataHora).toLocaleString("pt-BR")}
                    {nomeDe.get(registro.prestadorId) && nomeDe.get(registro.prestadorId) !== registro.usuario ? ` · ${nomeDe.get(registro.prestadorId)}` : ""}
                    {registro.detalhes ? ` · ${registro.detalhes}` : ""}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function ListaDeRecibos() {
  const { prestadores, recibos } = useDadosPrestadores();
  const usuario = useUsuarioAtual();
  const autor = usuario?.nome ?? "Escritório";
  const podeEditar = pode(usuario, "registros.editar");
  const podeExcluir = pode(usuario, "registros.excluir");
  const [abertoId, setAbertoId] = useState<string | null>(null);
  const [editando, setEditando] = useState<Receipt | null>(null);
  const [removendo, setRemovendo] = useState<Receipt | null>(null);
  const aberto = recibos.find((recibo) => recibo.id === abertoId) ?? null;
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState<FiltroStatus>("Todos");
  const [prestadorId, setPrestadorId] = useState("todos");
  const [competencia, setCompetencia] = useState("todas");

  const nomeDe = new Map(prestadores.map((prestador) => [prestador.id, prestador.nome]));
  const termo = busca.trim().toLowerCase();
  const visiveis = recibos
    .filter((recibo) => status === "Todos" || recibo.status === status)
    .filter((recibo) => prestadorId === "todos" || recibo.prestadorId === prestadorId)
    .filter((recibo) => competencia === "todas" || recibo.competencia === competencia)
    .filter(
      (recibo) =>
        !termo ||
        [recibo.id, recibo.client, recibo.description, recibo.category, nomeDe.get(recibo.prestadorId) ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(termo),
    )
    .sort((a, b) => b.serviceDate.localeCompare(a.serviceDate));
  const total = visiveis.reduce((soma, recibo) => soma + recibo.amount, 0);

  return (
    <>
      <section className="operations-surface">
        <div className="surface-toolbar">
          <label className="inline-search">
            <Search size={15} strokeWidth={1.9} />
            <input value={busca} onChange={(evento) => setBusca(evento.target.value)} placeholder="Buscar recibo, cliente ou prestador" aria-label="Buscar recibos" />
          </label>
          <div className="inline-row">
            <select className="field-input field-input-compacto" value={prestadorId} onChange={(evento) => setPrestadorId(evento.target.value)} aria-label="Prestador">
              <option value="todos">Todos os prestadores</option>
              {prestadores.map((prestador) => (
                <option key={prestador.id} value={prestador.id}>
                  {prestador.nome}
                </option>
              ))}
            </select>
            <select className="field-input field-input-compacto" value={competencia} onChange={(evento) => setCompetencia(evento.target.value)} aria-label="Competência">
              <option value="todas">Todas as competências</option>
              {listCompetencias(recibos).map((opcao) => (
                <option key={opcao} value={opcao}>
                  {formatMonth(opcao)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="filter-chips espaco-abaixo" role="group" aria-label="Filtrar por status">
          {(["Todos", ...RECEIPT_STATUSES] as FiltroStatus[]).map((opcao) => (
            <button
              key={opcao}
              type="button"
              className={status === opcao ? "filter-chip filter-chip-active" : "filter-chip"}
              aria-pressed={status === opcao}
              onClick={() => setStatus(opcao)}
            >
              {opcao}
            </button>
          ))}
        </div>

        {visiveis.length === 0 ? (
          <Vazio icone={SearchX} titulo="Nenhum recibo encontrado" texto="Ajuste a busca ou os filtros." />
        ) : (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Recibo</th>
                    <th>Prestador</th>
                    <th>Serviço</th>
                    <th>Data</th>
                    <th>Anexo</th>
                    <th>Valor</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map((recibo) => (
                    <tr key={recibo.id} className="linha-clicavel" onClick={() => setAbertoId(recibo.id)}>
                      <td>
                        <button type="button" className="link-linha cell-code" onClick={() => setAbertoId(recibo.id)}>
                          {recibo.id}
                        </button>
                      </td>
                      <td>{nomeDe.get(recibo.prestadorId) ?? "—"}</td>
                      <td className="cell-main">
                        <strong>{recibo.client}</strong>
                        <span>{recibo.category}</span>
                      </td>
                      <td>{formatarData(recibo.serviceDate)}</td>
                      <td>
                        {anexosDoRecibo(recibo).length ? (
                          <span className="anexo-contagem">
                            <Paperclip size={12} strokeWidth={2} /> {anexosDoRecibo(recibo).length}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="money">{formatBRL(recibo.amount)}</td>
                      <td>
                        <StatusPill status={recibo.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="surface-footnote">
              <span>{visiveis.length} recibo(s)</span>
              <span>Total listado: {formatBRL(total)}</span>
            </div>
          </>
        )}
      </section>

      {aberto && !editando && !removendo ? (
        <Gaveta
          rotulo={`Recibo ${aberto.id}`}
          titulo={aberto.client || aberto.id}
          subtitulo={
            <>
              {nomeDe.get(aberto.prestadorId) ?? "—"} · {formatMonth(aberto.competencia)} · <StatusPill status={aberto.status} />
            </>
          }
          aoFechar={() => setAbertoId(null)}
          rodape={
            <>
              <BotaoReciboPdf recibo={aberto} nomePrestador={nomeDe.get(aberto.prestadorId) ?? "Prestador"} />
              <span className="inline-row">
                {podeEditar ? (
                  <button type="button" className="text-button text-button-neutro" onClick={() => setEditando(aberto)} aria-label={`Editar ${aberto.id}`}>
                    <Pencil size={13} strokeWidth={2} /> Editar
                  </button>
                ) : null}
                {podeExcluir ? (
                  <button type="button" className="text-button text-button-perigo" onClick={() => setRemovendo(aberto)} aria-label={`Excluir ${aberto.id}`}>
                    <Trash2 size={13} strokeWidth={2} /> Excluir
                  </button>
                ) : null}
              </span>
            </>
          }
        >
          {aberto.reviewNote ? <p className="cell-note espaco-abaixo">Devolvido: {aberto.reviewNote}</p> : null}
          <DetalhesRecibo recibo={aberto} />
        </Gaveta>
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
          nomePrestador={nomeDe.get(removendo.prestadorId) ?? "Prestador"}
          aoFechar={() => setRemovendo(null)}
          aoConfirmar={() => {
            excluirRecibo(removendo.id, autor);
            setRemovendo(null);
            setAbertoId(null);
          }}
        />
      ) : null}
    </>
  );
}
