import { useColecao } from "@/_core/armazenamento/colecao";
import { iniciais, type Usuario } from "@/_core/identidade/permissoes";
import { useUsuarioAtual } from "@/_core/identidade/sessao";
import { formatarData, HOJE } from "@/_core/tempo";
import Cabecalho from "@/admin/componentes/Cabecalho";
import Campo from "@/admin/componentes/Campo";
import Gaveta from "@/admin/componentes/Gaveta";
import Kpi from "@/admin/componentes/Kpi";
import Painel from "@/admin/componentes/Painel";
import { usarModal } from "@/admin/componentes/usarModal";
import Vazio from "@/admin/componentes/Vazio";
import { DetalhesServico, ExecucaoServico, HistoricoServico, SeloServico } from "@/components/ServicoDetalhes";
import { formatBRL } from "@/lib/portal";
import { prestadores } from "@/modulos/prestadores/colecoes";
import { CATEGORIAS_PRESTADOR, type CategoriaPrestador, type Prestador } from "@/modulos/prestadores/tipos";
import { cancelarServico, excluirServico, reencaminharServico, solicitarServico } from "@/modulos/servicos/acoes";
import { servicos } from "@/modulos/servicos/colecao";
import {
  ABERTAS,
  emAndamento,
  gerenciaServicos,
  podeCancelarServico,
  podeExcluirServico,
  podeReencaminhar,
  podeSolicitarServico,
  prestadoresParaServico,
  resumoDoServico,
  servicosVisiveis,
  type RascunhoServico,
} from "@/modulos/servicos/regras";
import { CAMPOS_DA_CATEGORIA, type Servico, type SituacaoServico } from "@/modulos/servicos/tipos";
import { CheckCircle2, Clock, Plus, Search, SearchX, Send, Trash2, Truck, Undo2, X, XCircle } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";

type Filtro = "Em aberto" | SituacaoServico | "Todos";
const FILTROS: Filtro[] = ["Em aberto", "Solicitado", "Aceito", "Em execução", "Recusado", "Concluído", "Cancelado", "Todos"];

/**
 * Serviços pedidos aos prestadores. Quem pede escolhe o prestador; ele recebe
 * o alerta no portal, aceita (ou recusa), executa e conclui com o valor e o
 * comprovante — o recibo nasce daí e segue para a conferência do mês.
 */
export default function Servicos() {
  const usuario = useUsuarioAtual();
  const todos = useColecao(servicos);
  const cadastro = useColecao(prestadores);
  const [, navegar] = useLocation();
  const [filtro, setFiltro] = useState<Filtro>("Em aberto");
  const [busca, setBusca] = useState("");
  const [novo, setNovo] = useState(false);
  const [aberto, setAberto] = useState<string | null>(null);
  if (!usuario) return null;

  const gerencia = gerenciaServicos(usuario);
  const visiveis = servicosVisiveis(usuario, todos);
  const nomeDe = new Map(cadastro.map((p) => [p.id, p.nome]));
  const termo = busca.trim().toLowerCase();
  const passa = (s: Servico, f: Filtro) => (f === "Todos" ? true : f === "Em aberto" ? ABERTAS.includes(s.situacao) || s.situacao === "Recusado" : s.situacao === f);
  const lista = visiveis
    .filter((s) => passa(s, filtro))
    .filter((s) => !termo || `${s.numero} ${s.cliente} ${s.categoria} ${nomeDe.get(s.prestadorId) ?? ""} ${s.solicitante} ${s.descricao}`.toLowerCase().includes(termo))
    .sort((a, b) => Number(b.situacao === "Recusado") - Number(a.situacao === "Recusado") || Number(b.urgente) - Number(a.urgente) || b.criadoEm.localeCompare(a.criadoEm));
  const conta = (situacao: SituacaoServico) => visiveis.filter((s) => s.situacao === situacao).length;
  const concluidosMes = visiveis.filter((s) => s.situacao === "Concluído" && (s.concluidoEm ?? "").startsWith(HOJE.slice(0, 7)));
  const selecionado = visiveis.find((s) => s.id === aberto) ?? null;

  return (
    <>
      <Cabecalho
        rotulo="Prestadores de serviço"
        titulo="Serviços"
        descricao="Peça motoboy, cartório, correio ou SAESP ao prestador escolhido. Ele recebe o alerta no portal, aceita, executa e conclui com o valor — o recibo vai direto para o fechamento do mês."
        acoes={
          podeSolicitarServico(usuario) ? (
            <button type="button" className="button-primary" onClick={() => setNovo(true)}>
              <Plus size={15} strokeWidth={2.2} /> Solicitar serviço
            </button>
          ) : null
        }
      />

      <div className="kpi-grid">
        <Kpi rotulo="Aguardando aceite" valor={String(conta("Solicitado"))} detalhe="Prestador ainda não respondeu" icone={Clock} tom="ambar" aoClicar={() => setFiltro("Solicitado")} />
        <Kpi rotulo="Em andamento" valor={String(visiveis.filter(emAndamento).length)} detalhe="Aceitos ou em execução" icone={Truck} tom="laranja" aoClicar={() => setFiltro("Em aberto")} />
        <Kpi rotulo="Recusados" valor={String(conta("Recusado"))} detalhe="Escolha outro prestador" icone={XCircle} tom="vermelho" aoClicar={() => setFiltro("Recusado")} />
        <Kpi
          rotulo="Concluídos no mês"
          valor={String(concluidosMes.length)}
          detalhe={formatBRL(concluidosMes.reduce((t, s) => t + (s.execucao?.valor ?? 0), 0))}
          icone={CheckCircle2}
          tom="verde"
          aoClicar={() => setFiltro("Concluído")}
        />
      </div>

      <section className="operations-surface">
        {!gerencia ? <p className="field-hint espaco-abaixo">Você vê os serviços que pediu.</p> : null}
        <div className="surface-toolbar">
          <label className="inline-search">
            <Search size={15} strokeWidth={1.9} />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nº, cliente, prestador ou quem pediu" aria-label="Buscar serviços" />
          </label>
        </div>
        <div className="filter-chips espaco-abaixo" role="group" aria-label="Filtrar por situação">
          {FILTROS.map((opcao) => (
            <button key={opcao} type="button" className={filtro === opcao ? "filter-chip filter-chip-active" : "filter-chip"} aria-pressed={filtro === opcao} onClick={() => setFiltro(opcao)}>
              {opcao}
              <span className="filter-chip-count" aria-hidden="true">
                {visiveis.filter((s) => passa(s, opcao)).length}
              </span>
            </button>
          ))}
        </div>

        {lista.length === 0 ? (
          <Vazio icone={SearchX} titulo="Nenhum serviço aqui" texto={podeSolicitarServico(usuario) ? "Mude o filtro ou solicite um serviço." : "Mude o filtro."} />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Nº</th>
                  <th>Serviço</th>
                  <th>Prestador</th>
                  <th>Quando</th>
                  {gerencia ? <th>Pedido por</th> : null}
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((s) => (
                  <tr key={s.id} className="linha-clicavel" onClick={() => setAberto(s.id)}>
                    <td className="cell-code">{s.numero}</td>
                    <td className="cell-main celula-quebra-conc">
                      <button type="button" className="link-linha" onClick={() => setAberto(s.id)}>
                        {s.cliente}
                        {s.urgente ? <span className="marca-urgente"> Urgente</span> : null}
                      </button>
                      <span>
                        {s.categoria}
                        {resumoDoServico(s) ? ` · ${resumoDoServico(s)}` : ""}
                      </span>
                    </td>
                    <td>{nomeDe.get(s.prestadorId) ?? "—"}</td>
                    <td>
                      {formatarData(s.data)}
                      {s.horario ? <span className="vencimento-nota">{s.horario}</span> : null}
                    </td>
                    {gerencia ? <td>{s.solicitante}</td> : null}
                    <td>
                      <SeloServico servico={s} />
                      {s.execucao ? <span className="vencimento-nota money">{formatBRL(s.execucao.valor)}</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selecionado ? (
        <FichaServico
          servico={selecionado}
          usuario={usuario}
          cadastro={cadastro}
          aoFechar={() => setAberto(null)}
          abrirConferencia={() => navegar("/prestadores/conferencia")}
        />
      ) : null}
      {novo ? (
        <FormularioServico
          usuario={usuario}
          cadastro={cadastro}
          aoFechar={() => setNovo(false)}
          aoCriar={(id) => {
            setNovo(false);
            setFiltro("Em aberto");
            setAberto(id);
          }}
        />
      ) : null}
    </>
  );
}

// ── Nova solicitação ──────────────────────────────────────────────────────

function vazio(categoria: CategoriaPrestador): RascunhoServico {
  return { categoria, prestadorId: "", cliente: "", descricao: "", data: HOJE, horario: "", urgente: false, detalhes: {} };
}

function FormularioServico({ usuario, cadastro, aoFechar, aoCriar }: { usuario: Usuario; cadastro: Prestador[]; aoFechar: () => void; aoCriar: (id: string) => void }) {
  const [dados, setDados] = useState<RascunhoServico>(() => vazio("Motoboy"));
  const [erro, setErro] = useState<string | null>(null);
  const raiz = usarModal(aoFechar);
  const opcoes = prestadoresParaServico(cadastro, dados.categoria);
  const escolhido = cadastro.find((p) => p.id === dados.prestadorId);
  const mudar = <K extends keyof RascunhoServico>(campo: K, valor: RascunhoServico[K]) => {
    setErro(null);
    setDados((atual) => ({ ...atual, [campo]: valor }));
  };

  function trocarCategoria(categoria: CategoriaPrestador) {
    const lista = prestadoresParaServico(cadastro, categoria);
    // Mantém o que é comum; os campos da categoria recomeçam.
    setErro(null);
    setDados((atual) => ({ ...atual, categoria, detalhes: {}, prestadorId: lista.length === 1 ? lista[0].id : "" }));
  }

  function enviar() {
    const resultado = solicitarServico(dados, usuario);
    if (!resultado.ok) return setErro(resultado.erro);
    aoCriar(resultado.servico.id);
  }

  return (
    <div className="modal-backdrop" onMouseDown={(evento) => evento.target === evento.currentTarget && aoFechar()}>
      <div ref={raiz} className="modal-panel ficha-usuario ficha-servico" role="dialog" aria-modal="true" aria-labelledby="ficha-servico-titulo">
        <header className="ficha-usuario-topo">
          <span className="avatar avatar-grande" aria-hidden="true">
            <Send size={19} strokeWidth={1.8} />
          </span>
          <div className="ficha-usuario-identidade">
            <span className="eyebrow">Nova solicitação</span>
            <h2 id="ficha-servico-titulo">Solicitar serviço</h2>
            <span className="ficha-usuario-meta">
              <span className="status-pill status-neutral">{dados.categoria}</span>
              {escolhido ? <span>para {escolhido.nome}</span> : <span className="texto-apoio">escolha o prestador</span>}
              {dados.urgente ? <span className="marca-urgente">Urgente</span> : null}
            </span>
          </div>
          <button type="button" className="icon-button" aria-label="Fechar" data-fechar onClick={aoFechar}>
            <X size={17} strokeWidth={2} />
          </button>
        </header>

        <form
          className="ficha-usuario-corpo ficha-servico-corpo"
          onSubmit={(evento) => {
            evento.preventDefault();
            enviar();
          }}
          noValidate
        >
          <section className="ficha-secao">
            <h3>Tipo de serviço e prestador</h3>
            <div className="categoria-opcoes" role="radiogroup" aria-label="Tipo de serviço">
              {CATEGORIAS_PRESTADOR.map((categoria) => (
                <button
                  key={categoria}
                  type="button"
                  role="radio"
                  aria-checked={dados.categoria === categoria}
                  className={dados.categoria === categoria ? "filter-chip filter-chip-active" : "filter-chip"}
                  onClick={() => trocarCategoria(categoria)}
                >
                  {categoria}
                </button>
              ))}
            </div>
            {opcoes.length === 0 ? (
              <p className="ficha-aviso">Nenhum prestador de {dados.categoria} com o portal ativo. Cadastre ou ative um em Cadastro e acesso.</p>
            ) : (
              <div className="prestador-opcoes" role="radiogroup" aria-label="Prestador">
                {opcoes.map((p) => (
                  <button key={p.id} type="button" role="radio" aria-checked={dados.prestadorId === p.id} className={dados.prestadorId === p.id ? "prestador-opcao prestador-opcao-ativa" : "prestador-opcao"} onClick={() => mudar("prestadorId", p.id)}>
                    <span className="avatar avatar-sm" aria-hidden="true">
                      {iniciais(p.nome)}
                    </span>
                    <span>
                      <strong>{p.nome}</strong>
                      <small>{p.telefone || p.email}</small>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="ficha-secao">
            <h3>O serviço</h3>
            <Campo id="sv-cliente" rotulo="Cliente / Caso *">
              {(aria) => <input {...aria} className="field-input" value={dados.cliente} onChange={(e) => mudar("cliente", e.target.value)} placeholder="Ex.: Grupo Sanches — Proc. 0001234-56" />}
            </Campo>
            <div className="field-grid">
              <Campo id="sv-data" rotulo="Data *">
                {(aria) => <input {...aria} className="field-input" type="date" value={dados.data} onChange={(e) => mudar("data", e.target.value)} />}
              </Campo>
              <Campo id="sv-horario" rotulo="Horário" dica="Opcional">
                {(aria) => <input {...aria} className="field-input" type="time" value={dados.horario} onChange={(e) => mudar("horario", e.target.value)} />}
              </Campo>
            </div>
            <div className="field-grid">
              {CAMPOS_DA_CATEGORIA[dados.categoria].map((campo) => (
                <div key={campo.chave} className={campo.largo ? "field-grid-cheio" : undefined}>
                  <Campo id={`sv-${campo.chave}`} rotulo={`${campo.rotulo}${campo.obrigatorio ? " *" : ""}`}>
                    {(aria) =>
                      campo.opcoes ? (
                        <select {...aria} className="field-input" value={dados.detalhes[campo.chave] ?? ""} onChange={(e) => mudar("detalhes", { ...dados.detalhes, [campo.chave]: e.target.value })}>
                          <option value="">Escolha…</option>
                          {campo.opcoes.map((opcao) => (
                            <option key={opcao}>{opcao}</option>
                          ))}
                        </select>
                      ) : (
                        <input {...aria} className="field-input" value={dados.detalhes[campo.chave] ?? ""} onChange={(e) => mudar("detalhes", { ...dados.detalhes, [campo.chave]: e.target.value })} placeholder={campo.placeholder} />
                      )
                    }
                  </Campo>
                </div>
              ))}
            </div>
            <Campo id="sv-descricao" rotulo="Instruções para o prestador *">
              {(aria) => <textarea {...aria} className="field-input" rows={3} value={dados.descricao} onChange={(e) => mudar("descricao", e.target.value)} placeholder="O que levar, o que trazer, com quem falar…" />}
            </Campo>
            <div className="toggle-row">
              <div>
                <strong className="field-label" id="sv-urgente-rotulo">
                  Urgente
                </strong>
                <p className="field-hint">Aparece destacado no portal do prestador.</p>
              </div>
              <button type="button" className="switch" role="switch" aria-checked={dados.urgente} aria-labelledby="sv-urgente-rotulo" onClick={() => mudar("urgente", !dados.urgente)} />
            </div>
          </section>

          {erro ? (
            <p className="field-error ficha-erro" role="alert">
              {erro}
            </p>
          ) : null}

          <footer className="ficha-usuario-rodape">
            <span className="field-hint">O prestador recebe o alerta no portal e o valor é informado por ele ao concluir.</span>
            <span className="ficha-usuario-rodape-espaco" />
            <button type="button" className="button-secondary" onClick={aoFechar}>
              Cancelar
            </button>
            <button type="submit" className="button-primary" disabled={opcoes.length === 0}>
              <Send size={14} strokeWidth={2} /> Enviar ao prestador
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

// ── Ficha do serviço ──────────────────────────────────────────────────────

type Passo = null | "cancelar" | "reencaminhar" | "excluir";

function FichaServico({ servico, usuario, cadastro, aoFechar, abrirConferencia }: { servico: Servico; usuario: Usuario; cadastro: Prestador[]; aoFechar: () => void; abrirConferencia: () => void }) {
  const [passo, setPasso] = useState<Passo>(null);
  const [motivo, setMotivo] = useState("");
  const [novoPrestador, setNovoPrestador] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const nome = cadastro.find((p) => p.id === servico.prestadorId)?.nome ?? "—";
  const outros = prestadoresParaServico(cadastro, servico.categoria, [servico.prestadorId, ...(servico.recusadoPor ?? [])]);
  const fecharPasso = () => {
    setPasso(null);
    setErro(null);
    setMotivo("");
  };

  const rodape = (
    <>
      {podeExcluirServico(usuario, servico) ? (
        <button type="button" className="text-button text-button-perigo" onClick={() => setPasso("excluir")}>
          <Trash2 size={14} strokeWidth={2} /> Excluir
        </button>
      ) : null}
      <span className="ficha-usuario-rodape-espaco" />
      {podeCancelarServico(usuario, servico) ? (
        <button type="button" className="button-secondary" onClick={() => setPasso("cancelar")}>
          <XCircle size={14} strokeWidth={2} /> Cancelar serviço
        </button>
      ) : null}
      {podeReencaminhar(usuario, servico) ? (
        <button type="button" className="button-primary" onClick={() => setPasso("reencaminhar")}>
          <Undo2 size={14} strokeWidth={2} /> Escolher outro prestador
        </button>
      ) : null}
      {servico.reciboId ? (
        <button type="button" className="button-secondary" onClick={abrirConferencia}>
          Ver na conferência
        </button>
      ) : null}
    </>
  );

  return (
    <>
      {!passo ? (
      <Gaveta
        rotulo={`${servico.numero} · ${servico.categoria}`}
        titulo={servico.cliente}
        subtitulo={
          <span className="inline-row">
            <SeloServico servico={servico} />
            <span>{nome}</span>
          </span>
        }
        aoFechar={aoFechar}
        rodape={rodape}
      >
        {servico.situacao === "Recusado" ? (
          <p className="ficha-aviso">
            {nome} recusou: {servico.motivoRecusa}. Escolha outro prestador de {servico.categoria} ou cancele.
          </p>
        ) : null}
        <h3 className="drawer-secao">Pedido</h3>
        <DetalhesServico servico={servico} prestador={nome} />
        {servico.execucao ? (
          <>
            <h3 className="drawer-secao">Execução</h3>
            <ExecucaoServico servico={servico} />
          </>
        ) : null}
        <h3 className="drawer-secao">Andamento</h3>
        <HistoricoServico servico={servico} />
      </Gaveta>
      ) : null}

      {passo === "cancelar" ? (
        <Painel
          rotulo={servico.numero}
          titulo="Cancelar serviço"
          descricao="O prestador vê o cancelamento no portal."
          aoFechar={fecharPasso}
          textoEnviar="Cancelar serviço"
          aoEnviar={() => {
            const falha = cancelarServico(servico.id, motivo, usuario);
            if (falha) return setErro(falha);
            fecharPasso();
          }}
        >
          <Campo id="sv-cancelar" rotulo="Motivo" erro={erro ?? undefined}>
            {(aria) => <textarea {...aria} className="field-input" rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus />}
          </Campo>
        </Painel>
      ) : null}

      {passo === "reencaminhar" ? (
        <Painel
          rotulo={servico.numero}
          titulo="Escolher outro prestador"
          descricao={`O pedido volta a "Solicitado" e o novo prestador recebe o alerta no portal.`}
          aoFechar={fecharPasso}
          textoEnviar="Reencaminhar"
          aoEnviar={() => {
            const falha = reencaminharServico(servico.id, novoPrestador, usuario);
            if (falha) return setErro(falha);
            fecharPasso();
          }}
        >
          {outros.length === 0 ? (
            <p className="ficha-aviso">Não há outro prestador de {servico.categoria} com o portal ativo.</p>
          ) : (
            <div className="prestador-opcoes" role="radiogroup" aria-label="Novo prestador">
              {outros.map((p) => (
                <button key={p.id} type="button" role="radio" aria-checked={novoPrestador === p.id} className={novoPrestador === p.id ? "prestador-opcao prestador-opcao-ativa" : "prestador-opcao"} onClick={() => setNovoPrestador(p.id)}>
                  <span className="avatar avatar-sm" aria-hidden="true">
                    {iniciais(p.nome)}
                  </span>
                  <span>
                    <strong>{p.nome}</strong>
                    <small>{p.telefone || p.email}</small>
                  </span>
                </button>
              ))}
            </div>
          )}
          {erro ? (
            <p className="field-error" role="alert">
              {erro}
            </p>
          ) : null}
        </Painel>
      ) : null}

      {passo === "excluir" ? (
        <Painel
          rotulo={servico.numero}
          titulo="Excluir serviço"
          descricao="Some da lista de todos. Não dá para desfazer."
          aoFechar={fecharPasso}
          textoEnviar="Excluir"
          aoEnviar={() => {
            const falha = excluirServico(servico.id, usuario);
            if (falha) return setErro(falha);
            aoFechar();
          }}
        >
          {erro ? (
            <p className="field-error" role="alert">
              {erro}
            </p>
          ) : (
            <p>
              {servico.numero} · {servico.cliente}
            </p>
          )}
        </Painel>
      ) : null}
    </>
  );
}
