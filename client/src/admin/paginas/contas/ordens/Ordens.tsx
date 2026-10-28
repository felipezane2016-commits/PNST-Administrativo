import { baixarBlob } from "@/_core/armazenamento/anexos";
import { pode } from "@/_core/identidade/permissoes";
import { useUsuarioAtual } from "@/_core/identidade/sessao";
import { formatarData, HOJE } from "@/_core/tempo";
import Cabecalho from "@/admin/componentes/Cabecalho";
import Campo from "@/admin/componentes/Campo";
import Kpi from "@/admin/componentes/Kpi";
import Painel from "@/admin/componentes/Painel";
import Selo, { type Tom } from "@/admin/componentes/Selo";
import Vazio from "@/admin/componentes/Vazio";
import { configEmailsOrdens, useDadosContas } from "@/modulos/contas/colecoes";
import { formatarMoeda } from "@/modulos/contas/formato";
import { exportarPlanilha } from "@/modulos/contas/planilha";
import { excluirOrdem } from "@/modulos/contas/acoesOrdens";
import { alertasDasOrdens, ETAPAS, etapaDaOrdem, PROXIMO_PASSO, tipoDaOrdem, type Etapa } from "@/modulos/contas/regras";
import type { ConfigEmailsOrdens, Ordem } from "@/modulos/contas/tipos";
import { CalendarClock, FileSpreadsheet, Gavel, Inbox, Pencil, Plus, Search, SearchX, Send, Settings2, Trash2, Wallet } from "lucide-react";
import { useState } from "react";
import FichaOrdem from "./FichaOrdem";
import FormularioOrdem from "./FormularioOrdem";
import PainelSuperiores from "./PainelSuperiores";

const TOM_ETAPA: Record<Etapa, Tom> = {
  Recebida: "neutral",
  "Invoice enviada": "neutral",
  "Liberada pelo banco": "blue",
  "Aguardando decisão": "amber",
  "Aguardando câmbio": "amber",
  "Fechamento agendado": "blue",
  Fechada: "blue",
  "Baixa pendente": "amber",
  Concluída: "green",
};

type Filtro = "Em andamento" | Etapa;

export default function Ordens() {
  const { ordens, taxas, configEmails } = useDadosContas();
  const usuario = useUsuarioAtual();
  const podeEditar = pode(usuario, "contas.banco.editar");
  const podeExcluir = pode(usuario, "contas.banco.excluir");
  const [filtro, setFiltro] = useState<Filtro>("Em andamento");
  const [busca, setBusca] = useState("");
  const [aberta, setAberta] = useState<string | null>(null);
  const [painel, setPainel] = useState<{ tipo: "nova" } | { tipo: "editar"; id: string } | { tipo: "superiores"; ids: string[] } | { tipo: "config" } | { tipo: "excluir"; id: string } | null>(null);
  const [exportando, setExportando] = useState(false);

  const comEtapa = ordens.map((ordem) => ({ ordem, etapa: etapaDaOrdem(ordem) }));
  const contagem = (etapa: Etapa) => comEtapa.filter((item) => item.etapa === etapa).length;
  const termo = busca.trim().toLowerCase();
  const visiveis = comEtapa
    .filter((item) => (filtro === "Em andamento" ? item.etapa !== "Concluída" : item.etapa === filtro))
    .filter(({ ordem }) => !termo || `${ordem.cliente} ${ordem.numeroOrdem} ${ordem.invoices.map((i) => i.numero).join(" ")}`.toLowerCase().includes(termo))
    .sort((a, b) => ETAPAS.indexOf(a.etapa) - ETAPAS.indexOf(b.etapa) || b.ordem.dataRecebimento.localeCompare(a.ordem.dataRecebimento));
  const alertas = alertasDasOrdens(ordens, taxas, HOJE);
  const ordemAberta = ordens.find((ordem) => ordem.id === aberta) ?? null;
  const fecharHoje = comEtapa.filter(({ ordem, etapa }) => etapa === "Fechamento agendado" && (ordem.decisao?.dataFechamento ?? "") <= HOJE).length;

  async function exportar() {
    setExportando(true);
    try {
      const ano = HOJE.slice(0, 4);
      baixarBlob(await exportarPlanilha(ordens, ano), `Controle de Fechamento de Ordens ${ano} BIB.xlsx`);
    } finally {
      setExportando(false);
    }
  }

  function prazo(item: (typeof comEtapa)[number]) {
    const { ordem, etapa } = item;
    if (etapa === "Fechamento agendado" && ordem.decisao?.dataFechamento) return `${ordem.decisao.prazo} · ${formatarData(ordem.decisao.dataFechamento)}`;
    if (etapa === "Aguardando câmbio") return ordem.decisao?.taxaAlvo ? `alvo ${ordem.decisao.taxaAlvo.toFixed(4).replace(".", ",")}` : "aguardar";
    return PROXIMO_PASSO[etapa];
  }

  return (
    <>
      <Cabecalho
        rotulo="Banco Industrial"
        titulo="Ordens de pagamento"
        descricao="Do e-mail do banco à baixa no Sisjuri: cada ordem mostra a etapa em que está e o próximo passo."
        acoes={
          <>
            <button type="button" className="icon-button" aria-label="Configurar e-mails" title="Configurar e-mails" onClick={() => setPainel({ tipo: "config" })}>
              <Settings2 size={16} strokeWidth={1.9} />
            </button>
            <button type="button" className="button-secondary" onClick={exportar} disabled={exportando}>
              <FileSpreadsheet size={15} strokeWidth={2} /> {exportando ? "Gerando…" : "Exportar planilha"}
            </button>
            {podeEditar ? (
              <>
                <button type="button" className="button-secondary" onClick={() => setPainel({ tipo: "superiores", ids: [] })}>
                  <Send size={15} strokeWidth={2} /> E-mail aos superiores
                </button>
                <button type="button" className="button-primary" onClick={() => setPainel({ tipo: "nova" })}>
                  <Plus size={15} strokeWidth={2.2} /> Nova ordem do e-mail
                </button>
              </>
            ) : null}
          </>
        }
      />

      {alertas.length ? (
        <ul className="alertas-ordens" aria-label="Alertas">
          {alertas.map((alerta) => (
            <li key={`${alerta.ordemId}-${alerta.texto}`} className={`alerta-ordem alerta-${alerta.tom}`}>
              <span>{alerta.texto}</span>
              <button type="button" className="text-button" onClick={() => setAberta(alerta.ordemId)}>
                Abrir
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="kpi-grid">
        <Kpi rotulo="Em andamento" valor={String(comEtapa.filter((i) => i.etapa !== "Concluída").length)} detalhe="ordens no fluxo" icone={Inbox} tom="laranja" aoClicar={() => setFiltro("Em andamento")} />
        <Kpi rotulo="Aguardando decisão" valor={String(contagem("Aguardando decisão"))} detalhe="dos superiores" icone={Gavel} tom="ambar" aoClicar={() => setFiltro("Aguardando decisão")} />
        <Kpi rotulo="Fechar hoje" valor={String(fecharHoje)} detalhe="D+n vencendo" icone={CalendarClock} tom={fecharHoje ? "vermelho" : "neutro"} aoClicar={() => setFiltro("Fechamento agendado")} />
        <Kpi rotulo="Baixa pendente" valor={String(contagem("Baixa pendente") + contagem("Fechada"))} detalhe="fechadas sem baixa completa" icone={Wallet} tom="neutro" aoClicar={() => setFiltro("Baixa pendente")} />
      </div>

      <section className="operations-surface">
        <div className="surface-toolbar">
          <label className="inline-search">
            <Search size={15} strokeWidth={1.9} />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Cliente, nº da ordem ou invoice" aria-label="Buscar ordens" />
          </label>
        </div>
        <div className="filter-chips espaco-abaixo" role="group" aria-label="Filtrar por etapa">
          {(["Em andamento", ...ETAPAS] as Filtro[]).map((opcao) => {
            const total = opcao === "Em andamento" ? comEtapa.filter((i) => i.etapa !== "Concluída").length : contagem(opcao);
            if (opcao !== "Em andamento" && opcao !== "Concluída" && total === 0) return null;
            return (
              <button key={opcao} type="button" className={filtro === opcao ? "filter-chip filter-chip-active" : "filter-chip"} aria-pressed={filtro === opcao} onClick={() => setFiltro(opcao)}>
                {opcao}
                <span className="filter-chip-count" aria-hidden="true">
                  {total}
                </span>
              </button>
            );
          })}
        </div>
        {visiveis.length === 0 ? (
          <Vazio icone={SearchX} titulo="Nenhuma ordem aqui" texto="Mude o filtro ou a busca." />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Recebida</th>
                  <th>Ordem</th>
                  <th>Valor</th>
                  <th>Tipo</th>
                  <th>Etapa</th>
                  <th>Próximo passo</th>
                  {podeEditar || podeExcluir ? (
                    <th>
                      <span className="sr-only">Ações</span>
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {visiveis.map((item) => (
                  <tr key={item.ordem.id} className="linha-clicavel" onClick={() => setAberta(item.ordem.id)}>
                    <td>{formatarData(item.ordem.dataRecebimento)}</td>
                    <td className="cell-main">
                      <button type="button" className="link-linha" onClick={() => setAberta(item.ordem.id)}>
                        {item.ordem.cliente}
                      </button>
                      <span>
                        Nº {item.ordem.numeroOrdem}
                        {item.ordem.invoices.length ? ` · invoices ${item.ordem.invoices.map((i) => i.numero).join(", ")}` : ""}
                      </span>
                    </td>
                    <td className="money">{formatarMoeda(item.ordem.valor, item.ordem.moeda)}</td>
                    <td>{tipoDaOrdem(item.ordem) ?? "—"}</td>
                    <td>
                      <Selo tom={TOM_ETAPA[item.etapa]}>{item.etapa}</Selo>
                    </td>
                    <td className="celula-passo">{prazo(item)}</td>
                    {podeEditar || podeExcluir ? (
                      <td>
                        {/* Os botões não abrem a ficha: o clique fica neles. */}
                        <div className="inline-row" onClick={(evento) => evento.stopPropagation()}>
                          {podeEditar ? (
                            <button type="button" className="icon-button icon-button-pequeno" aria-label={`Editar ordem nº ${item.ordem.numeroOrdem}`} title="Editar" onClick={() => setPainel({ tipo: "editar", id: item.ordem.id })}>
                              <Pencil size={14} strokeWidth={1.9} />
                            </button>
                          ) : null}
                          {podeExcluir ? (
                            <button type="button" className="icon-button icon-button-pequeno icon-button-danger" aria-label={`Excluir ordem nº ${item.ordem.numeroOrdem}`} title="Excluir" onClick={() => setPainel({ tipo: "excluir", id: item.ordem.id })}>
                              <Trash2 size={14} strokeWidth={1.9} />
                            </button>
                          ) : null}
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {ordemAberta && !painel ? (
        <FichaOrdem
          ordem={ordemAberta}
          usuario={usuario}
          aoFechar={() => setAberta(null)}
          aoEditar={() => setPainel({ tipo: "editar", id: ordemAberta.id })}
          aoExcluir={podeExcluir ? () => setPainel({ tipo: "excluir", id: ordemAberta.id }) : undefined}
          aoEnviarSuperiores={() => setPainel({ tipo: "superiores", ids: [ordemAberta.id] })}
        />
      ) : null}
      {painel?.tipo === "nova" || painel?.tipo === "editar" ? (
        <FormularioOrdem
          ordem={painel.tipo === "editar" ? (ordens.find((ordem) => ordem.id === painel.id) ?? null) : null}
          autor={usuario?.nome ?? ""}
          aoFechar={() => setPainel(null)}
          aoSalvar={(id) => {
            setPainel(null);
            setAberta(id);
          }}
        />
      ) : null}
      {painel?.tipo === "superiores" ? <PainelSuperiores selecionadas={painel.ids} autor={usuario?.nome ?? ""} aoFechar={() => setPainel(null)} /> : null}
      {painel?.tipo === "config" ? <PainelConfig config={configEmails} podeEditar={podeEditar} aoFechar={() => setPainel(null)} /> : null}
      {painel?.tipo === "excluir" ? (
        <ConfirmarExclusao
          ordem={ordens.find((ordem) => ordem.id === painel.id) ?? null}
          aoFechar={() => setPainel(null)}
          aoConfirmar={(id) => {
            excluirOrdem(id);
            if (aberta === id) setAberta(null);
            setPainel(null);
          }}
        />
      ) : null}
    </>
  );
}

function ConfirmarExclusao({ ordem, aoFechar, aoConfirmar }: { ordem: Ordem | null; aoFechar: () => void; aoConfirmar: (id: string) => void }) {
  if (!ordem) return null;
  const etapa = etapaDaOrdem(ordem);
  return (
    <Painel rotulo="Excluir ordem" titulo={`Excluir a ordem nº ${ordem.numeroOrdem}?`} aoFechar={aoFechar} aoEnviar={() => aoConfirmar(ordem.id)} textoEnviar="Excluir ordem">
      <p>
        <strong>{ordem.cliente}</strong> — {formatarMoeda(ordem.valor, ordem.moeda)}, recebida em {formatarData(ordem.dataRecebimento)}, etapa <Selo tom={TOM_ETAPA[etapa]}>{etapa}</Selo>
      </p>
      <p className="texto-perigo">
        A ordem sai da lista e da planilha exportada, com o histórico
        {ordem.invoices.length === 1 ? " e a invoice anexada" : ordem.invoices.length ? ` e as ${ordem.invoices.length} invoices anexadas` : ""}. Não dá para desfazer.
      </p>
    </Painel>
  );
}

function PainelConfig({ config, podeEditar, aoFechar }: { config: ConfigEmailsOrdens; podeEditar: boolean; aoFechar: () => void }) {
  const [dados, setDados] = useState(config);
  return (
    <Painel
      rotulo="Ordens de pagamento"
      titulo="Destinatários e assinatura"
      descricao="Usados nos e-mails prontos. Vários endereços separados por ponto e vírgula."
      aoFechar={aoFechar}
      aoEnviar={
        podeEditar
          ? () => {
              configEmailsOrdens.atualizar(() => dados);
              aoFechar();
            }
          : undefined
      }
    >
      <Campo id="cfg-banco" rotulo="E-mail do câmbio no Banco Industrial">
        {(aria) => <input {...aria} className="field-input" value={dados.emailBanco} onChange={(e) => setDados({ ...dados, emailBanco: e.target.value })} disabled={!podeEditar} />}
      </Campo>
      <Campo id="cfg-copia" rotulo="Cópia nos e-mails ao banco">
        {(aria) => <input {...aria} className="field-input" value={dados.copiaBanco} onChange={(e) => setDados({ ...dados, copiaBanco: e.target.value })} disabled={!podeEditar} />}
      </Campo>
      <Campo id="cfg-sup" rotulo="Superiores (cotação do dia)">
        {(aria) => <input {...aria} className="field-input" value={dados.emailsSuperiores} onChange={(e) => setDados({ ...dados, emailsSuperiores: e.target.value })} disabled={!podeEditar} />}
      </Campo>
      <Campo id="cfg-ass" rotulo="Assinatura">
        {(aria) => <textarea {...aria} className="field-input" rows={3} value={dados.assinatura} onChange={(e) => setDados({ ...dados, assinatura: e.target.value })} disabled={!podeEditar} />}
      </Campo>
    </Painel>
  );
}
