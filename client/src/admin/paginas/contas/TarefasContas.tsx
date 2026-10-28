import { gravarItem } from "@/_core/armazenamento/colecao";
import { pode } from "@/_core/identidade/permissoes";
import { useUsuarioAtual } from "@/_core/identidade/sessao";
import { formatarData, gerarId, HOJE, somarDias } from "@/_core/tempo";
import Cabecalho from "@/admin/componentes/Cabecalho";
import Campo from "@/admin/componentes/Campo";
import Kpi from "@/admin/componentes/Kpi";
import Painel from "@/admin/componentes/Painel";
import { tarefasContas, useDadosContas } from "@/modulos/contas/colecoes";
import { CATEGORIAS_CONTAS, type CategoriaConta, type TarefaConta } from "@/modulos/contas/tipos";
import { AlertTriangle, CheckCircle2, Clock3, ListChecks, Plus } from "lucide-react";
import { useState } from "react";

type Filtro = "pendentes" | "todas" | "concluidas";

export default function TarefasContas() {
  const { tarefas } = useDadosContas();
  const usuario = useUsuarioAtual();
  const podeEditar = pode(usuario, "contas.tarefas.editar");
  const [filtro, setFiltro] = useState<Filtro>("pendentes");
  const [editando, setEditando] = useState<TarefaConta | "nova" | null>(null);

  const pendentes = tarefas.filter((tarefa) => !tarefa.concluida);
  const vencidas = pendentes.filter((tarefa) => tarefa.vencimento && tarefa.vencimento < HOJE);
  const semana = pendentes.filter((tarefa) => tarefa.vencimento && tarefa.vencimento >= HOJE && tarefa.vencimento <= somarDias(HOJE, 7));
  const visiveis = tarefas.filter((tarefa) => (filtro === "todas" ? true : filtro === "pendentes" ? !tarefa.concluida : tarefa.concluida));

  function alternar(tarefa: TarefaConta) {
    tarefasContas.atualizar((lista) => gravarItem(lista, { ...tarefa, concluida: !tarefa.concluida }));
  }

  return (
    <>
      <Cabecalho
        rotulo="Account Management"
        titulo="Tarefas e compromissos"
        descricao="Contas a pagar, tributos, câmbio e rotinas do financeiro, por categoria."
        acoes={
          podeEditar ? (
            <button type="button" className="button-primary" onClick={() => setEditando("nova")}>
              <Plus size={15} strokeWidth={2.2} /> Nova tarefa
            </button>
          ) : null
        }
      />
      <div className="kpi-grid">
        <Kpi rotulo="Pendentes" valor={String(pendentes.length)} detalhe={`de ${tarefas.length} tarefas`} icone={ListChecks} aoClicar={() => setFiltro("pendentes")} />
        <Kpi rotulo="Vencendo em 7 dias" valor={String(semana.length)} detalhe="a partir de hoje" icone={Clock3} />
        <Kpi rotulo="Vencidas" valor={String(vencidas.length)} detalhe={vencidas.length ? "resolver primeiro" : "nada atrasado"} icone={AlertTriangle} />
        <Kpi rotulo="Concluídas" valor={String(tarefas.length - pendentes.length)} icone={CheckCircle2} aoClicar={() => setFiltro("concluidas")} />
      </div>
      <section className="operations-surface">
        <div className="filter-chips espaco-abaixo" role="group" aria-label="Situação">
          {(
            [
              ["pendentes", "Pendentes"],
              ["todas", "Todas"],
              ["concluidas", "Concluídas"],
            ] as [Filtro, string][]
          ).map(([chave, nome]) => (
            <button key={chave} type="button" className={filtro === chave ? "filter-chip filter-chip-active" : "filter-chip"} aria-pressed={filtro === chave} onClick={() => setFiltro(chave)}>
              {nome}
            </button>
          ))}
        </div>
        <div className="board">
          {CATEGORIAS_CONTAS.map((categoria) => {
            const daCategoria = visiveis
              .filter((tarefa) => tarefa.categoria === categoria)
              .sort((a, b) => (a.vencimento ?? "9999").localeCompare(b.vencimento ?? "9999"));
            return (
              <div className="board-column" key={categoria}>
                <div className="board-column-head">
                  {categoria}
                  <span className="board-count">{daCategoria.length}</span>
                </div>
                {daCategoria.length === 0 ? <p className="board-empty">Nada aqui</p> : null}
                {daCategoria.map((tarefa) => {
                  const atrasada = !tarefa.concluida && tarefa.vencimento !== null && tarefa.vencimento < HOJE;
                  return (
                    <div className="board-card" key={tarefa.id} style={tarefa.concluida ? { opacity: 0.6 } : undefined}>
                      <label className="check-label check-label-tarefa">
                        <input type="checkbox" checked={tarefa.concluida} disabled={!podeEditar} onChange={() => alternar(tarefa)} />
                        <strong className={tarefa.concluida ? "riscado" : undefined}>{tarefa.nome}</strong>
                      </label>
                      <div className="board-card-meta">
                        <span style={atrasada ? { color: "var(--status-red-fg)" } : undefined}>
                          {tarefa.vencimento ? `${atrasada ? "Venceu " : "Vence "}${formatarData(tarefa.vencimento)}` : "Sem data"}
                        </span>
                        <span>{tarefa.periodo}</span>
                      </div>
                      {podeEditar ? (
                        <button type="button" className="text-button text-button-inicio" onClick={() => setEditando(tarefa)}>
                          Editar
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </section>
      {editando ? <FormularioTarefaConta tarefa={editando === "nova" ? null : editando} podeExcluir={pode(usuario, "contas.tarefas.excluir")} aoFechar={() => setEditando(null)} /> : null}
    </>
  );
}

function FormularioTarefaConta({ tarefa, podeExcluir, aoFechar }: { tarefa: TarefaConta | null; podeExcluir: boolean; aoFechar: () => void }) {
  const [dados, setDados] = useState<TarefaConta>(
    tarefa ?? { id: gerarId("acc"), nome: "", categoria: "Contas a pagar — PNST", concluida: false, vencimento: null, periodo: "Mensal", observacoes: "" },
  );
  const [erro, setErro] = useState<string | undefined>();

  return (
    <Painel
      rotulo="Account Management"
      titulo={tarefa ? "Editar tarefa" : "Nova tarefa"}
      aoFechar={aoFechar}
      aoEnviar={() => {
        if (!dados.nome.trim()) {
          setErro("Dê um nome à tarefa.");
          return;
        }
        tarefasContas.atualizar((lista) => gravarItem(lista, { ...dados, nome: dados.nome.trim() }));
        aoFechar();
      }}
      rodapeExtra={
        tarefa && podeExcluir ? (
          <button
            type="button"
            className="text-button text-button-perigo"
            onClick={() => {
              tarefasContas.atualizar((lista) => lista.filter((item) => item.id !== tarefa.id));
              aoFechar();
            }}
          >
            Excluir
          </button>
        ) : null
      }
    >
      <Campo id="acc-nome" rotulo="Nome da tarefa" erro={erro}>
        {(aria) => <input {...aria} className="field-input" value={dados.nome} onChange={(e) => (setDados({ ...dados, nome: e.target.value }), setErro(undefined))} placeholder="Ex.: Pagamento do FGTS" />}
      </Campo>
      <div className="field-grid">
        <Campo id="acc-categoria" rotulo="Categoria">
          {(aria) => (
            <select {...aria} className="field-input" value={dados.categoria} onChange={(e) => setDados({ ...dados, categoria: e.target.value as CategoriaConta })}>
              {CATEGORIAS_CONTAS.map((categoria) => (
                <option key={categoria}>{categoria}</option>
              ))}
            </select>
          )}
        </Campo>
        <Campo id="acc-situacao" rotulo="Situação">
          {(aria) => (
            <select {...aria} className="field-input" value={dados.concluida ? "1" : "0"} onChange={(e) => setDados({ ...dados, concluida: e.target.value === "1" })}>
              <option value="0">Pendente</option>
              <option value="1">Concluída</option>
            </select>
          )}
        </Campo>
      </div>
      <div className="field-grid">
        <Campo id="acc-vencimento" rotulo="Vencimento">
          {(aria) => <input {...aria} className="field-input" type="date" value={dados.vencimento ?? ""} onChange={(e) => setDados({ ...dados, vencimento: e.target.value || null })} />}
        </Campo>
        <Campo id="acc-periodo" rotulo="Periodicidade">
          {(aria) => <input {...aria} className="field-input" value={dados.periodo} onChange={(e) => setDados({ ...dados, periodo: e.target.value })} placeholder="Mensal, quinzenal…" />}
        </Campo>
      </div>
      <Campo id="acc-obs" rotulo="Observações">
        {(aria) => <textarea {...aria} className="field-input" value={dados.observacoes} onChange={(e) => setDados({ ...dados, observacoes: e.target.value })} />}
      </Campo>
    </Painel>
  );
}
