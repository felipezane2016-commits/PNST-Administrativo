import { useColecao } from "@/_core/armazenamento/colecao";
import { usuarios, useUsuarioAtual } from "@/_core/identidade/sessao";
import { formatarData, HOJE } from "@/_core/tempo";
import Cabecalho from "@/admin/componentes/Cabecalho";
import Kpi from "@/admin/componentes/Kpi";
import Vazio from "@/admin/componentes/Vazio";
import { formatBRL } from "@/lib/portal";
import { useDadosPagamentos } from "@/modulos/pagamentos/colecoes";
import { alertasDePagamentos, aprovadorVigente, diasAte, ehFinanceiro, visiveisPara } from "@/modulos/pagamentos/regras";
import { STATUS_PAGAMENTO, type StatusPagamento } from "@/modulos/pagamentos/tipos";
import { CheckCircle2, ClipboardCheck, Plus, Search, SearchX, ShieldCheck, Wallet } from "lucide-react";
import { useState } from "react";
import { SeloStatus } from "./comum";
import FichaPagamento from "./FichaPagamento";
import FormularioPagamento from "./FormularioPagamento";

type Filtro = "Em aberto" | StatusPagamento | "Todos";
const ABERTOS: StatusPagamento[] = ["Em conferência", "Devolvido", "Aguardando aprovação", "Aprovado"];

export default function Pagamentos() {
  const usuario = useUsuarioAtual();
  const { pagamentos, fornecedores, config } = useDadosPagamentos();
  const pessoas = useColecao(usuarios);
  const [filtro, setFiltro] = useState<Filtro>("Em aberto");
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<string | null>(null);
  const [formulario, setFormulario] = useState<{ devolvidoId: string | null } | null>(null);
  if (!usuario) return null;

  const financeiro = ehFinanceiro(usuario);
  const aprovador = pessoas.find((p) => p.id === aprovadorVigente(config, HOJE));
  const visiveis = visiveisPara(usuario, pagamentos, config, HOJE, pessoas);
  const termo = busca.trim().toLowerCase();
  const lista = visiveis
    .filter((p) => (filtro === "Todos" ? true : filtro === "Em aberto" ? ABERTOS.includes(p.status) : p.status === filtro))
    .filter((p) => !termo || `${p.numero} ${p.favorecido} ${p.descricao} ${p.cliente} ${p.caso}`.toLowerCase().includes(termo))
    .sort((a, b) => Number(b.urgente) - Number(a.urgente) || a.vencimento.localeCompare(b.vencimento));
  const alertas = financeiro || usuario.id === aprovador?.id ? alertasDePagamentos(visiveis, fornecedores, HOJE) : [];
  const soma = (status: StatusPagamento) => visiveis.filter((p) => p.status === status);
  const pagosMes = visiveis.filter((p) => p.status === "Pago" && p.pagamento?.data.startsWith(HOJE.slice(0, 7)));
  const selecionado = visiveis.find((p) => p.id === aberto) ?? null;
  const devolvido = formulario?.devolvidoId ? (visiveis.find((p) => p.id === formulario.devolvidoId) ?? null) : null;

  return (
    <>
      <Cabecalho
        rotulo="Contas a pagar"
        titulo="Pagamentos"
        descricao="Pedido → conferência do financeiro → aprovação um nível acima de quem pediu → pagamento com comprovante."
        acoes={
          <button type="button" className="button-primary" onClick={() => setFormulario({ devolvidoId: null })}>
            <Plus size={15} strokeWidth={2.2} /> Solicitar pagamento
          </button>
        }
      />

      {alertas.length ? (
        <ul className="alertas-ordens" aria-label="Alertas">
          {alertas.map((alerta) => (
            <li key={`${alerta.pagamentoId}-${alerta.texto}`} className={`alerta-ordem alerta-${alerta.tom}`}>
              <span>{alerta.texto}</span>
              <button type="button" className="text-button" onClick={() => setAberto(alerta.pagamentoId)}>
                Abrir
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="kpi-grid">
        <Kpi rotulo="Em conferência" valor={String(soma("Em conferência").length)} detalhe={formatBRL(soma("Em conferência").reduce((t, p) => t + p.valor, 0))} icone={ClipboardCheck} tom="neutro" aoClicar={() => setFiltro("Em conferência")} />
        <Kpi rotulo="Aguardando aprovação" valor={String(soma("Aguardando aprovação").length)} detalhe={formatBRL(soma("Aguardando aprovação").reduce((t, p) => t + p.valor, 0))} icone={ShieldCheck} tom="ambar" aoClicar={() => setFiltro("Aguardando aprovação")} />
        <Kpi rotulo="Aprovados a pagar" valor={String(soma("Aprovado").length)} detalhe={formatBRL(soma("Aprovado").reduce((t, p) => t + p.valor, 0))} icone={Wallet} tom="laranja" aoClicar={() => setFiltro("Aprovado")} />
        <Kpi rotulo="Pagos no mês" valor={String(pagosMes.length)} detalhe={formatBRL(pagosMes.reduce((t, p) => t + p.valor, 0))} icone={CheckCircle2} tom="verde" aoClicar={() => setFiltro("Pago")} />
      </div>

      <section className="operations-surface">
        {!financeiro && usuario.id !== aprovador?.id ? (
          <p className="field-hint espaco-abaixo">Você vê os pagamentos que pediu e os que aguardam (ou já tiveram) a sua aprovação.</p>
        ) : null}
        <div className="surface-toolbar">
          <label className="inline-search">
            <Search size={15} strokeWidth={1.9} />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nº, favorecido, cliente ou processo" aria-label="Buscar pagamentos" />
          </label>
        </div>
        <div className="filter-chips espaco-abaixo" role="group" aria-label="Filtrar por situação">
          {(["Em aberto", ...STATUS_PAGAMENTO, "Todos"] as Filtro[]).map((opcao) => {
            const total = opcao === "Todos" ? visiveis.length : opcao === "Em aberto" ? visiveis.filter((p) => ABERTOS.includes(p.status)).length : visiveis.filter((p) => p.status === opcao).length;
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
        {lista.length === 0 ? (
          <Vazio icone={SearchX} titulo="Nenhum pagamento aqui" texto="Mude o filtro ou solicite um pagamento." />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Nº</th>
                  <th>Favorecido</th>
                  <th>Centro de custo</th>
                  <th>Vencimento</th>
                  <th>Valor</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((p) => {
                  const dias = diasAte(p.vencimento, HOJE);
                  const emAberto = ABERTOS.includes(p.status);
                  return (
                    <tr key={p.id} className="linha-clicavel" onClick={() => setAberto(p.id)}>
                      <td className="cell-code">{p.numero}</td>
                      <td className="cell-main">
                        <button type="button" className="link-linha" onClick={() => setAberto(p.id)}>
                          {p.favorecido}
                          {p.urgente ? <span className="marca-urgente"> Urgente</span> : null}
                        </button>
                        <span>
                          {p.descricao} · {p.empresa}
                        </span>
                      </td>
                      <td className="cell-main celula-quebra-conc">
                        <strong className="texto-medio">{p.cliente || "Escritório"}</strong>
                        <span>
                          {p.categoria}
                          {p.reembolsavel ? " · reembolsável" : ""}
                        </span>
                      </td>
                      <td className={emAberto && dias < 0 ? "texto-vencido" : emAberto && dias <= 2 ? "texto-vencendo" : undefined}>
                        {formatarData(p.vencimento)}
                        {emAberto && dias <= 2 ? <span className="vencimento-nota">{dias < 0 ? "vencido" : dias === 0 ? "hoje" : dias === 1 ? "amanhã" : "em 2 dias"}</span> : null}
                      </td>
                      <td className="money">{formatBRL(p.valor)}</td>
                      <td>
                        <SeloStatus status={p.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selecionado && !formulario ? (
        <FichaPagamento pagamento={selecionado} usuario={usuario} aoFechar={() => setAberto(null)} aoCorrigir={() => setFormulario({ devolvidoId: selecionado.id })} />
      ) : null}
      {formulario ? (
        <FormularioPagamento
          usuario={usuario}
          devolvido={devolvido}
          aoFechar={() => setFormulario(null)}
          aoSalvar={(id) => {
            setFormulario(null);
            setAberto(id);
          }}
        />
      ) : null}
    </>
  );
}
