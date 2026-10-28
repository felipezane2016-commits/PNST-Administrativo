import Barras from "@/admin/componentes/Barras";
import Cabecalho from "@/admin/componentes/Cabecalho";
import { GraficoBarras } from "@/admin/componentes/Graficos";
import Kpi from "@/admin/componentes/Kpi";
import Selo from "@/admin/componentes/Selo";
import { formatBRL, formatMonth } from "@/lib/portal";
import { evolucaoMensal, conferenciaAberta, montarLotes, rankingPrestadores, totalPorCategoria } from "@/modulos/prestadores/regras";
import { CATEGORIAS_PRESTADOR } from "@/modulos/prestadores/tipos";
import { useDadosPrestadores } from "@/modulos/prestadores/usarDados";
import { BadgeCheck, ClipboardCheck, Truck, Wallet } from "lucide-react";
import { useLocation } from "wouter";

function mesCurto(competencia: string) {
  return new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(new Date(`${competencia}-01T12:00:00`)).replace(".", "");
}

export default function PainelPrestadores() {
  const { prestadores, recibos, fechamentos } = useDadosPrestadores();
  const [, navegar] = useLocation();

  const ranking = rankingPrestadores(recibos, prestadores);
  const porCategoria = totalPorCategoria(recibos, prestadores);
  const evolucao = evolucaoMensal(recibos).map((ponto) => ({
    mes: `${mesCurto(ponto.competencia)}/${ponto.competencia.slice(2, 4)}`,
    valor: ponto.valor,
    servicos: ponto.servicos,
  }));
  const lotes = montarLotes(recibos, fechamentos, prestadores);
  const aguardando = lotes.filter(conferenciaAberta);
  const aPagar = lotes.filter((lote) => lote.situacao === "Conferido");
  const totalAprovado = ranking.reduce((soma, linha) => soma + linha.valor, 0);
  const servicos = ranking.reduce((soma, linha) => soma + linha.servicos, 0);

  return (
    <>
      <Cabecalho
        rotulo="Prestadores de serviço"
        titulo="Painel"
        descricao="Quanto cada prestador custa, o que espera conferência e o que falta pagar."
        acoes={
          <button type="button" className="button-primary" onClick={() => navegar("/prestadores/conferencia")}>
            <ClipboardCheck size={15} strokeWidth={2} /> Abrir conferência
          </button>
        }
      />

      <div className="kpi-grid">
        <Kpi
          rotulo="Prestadores ativos"
          valor={String(prestadores.filter((item) => item.portalAtivo).length)}
          detalhe={`${prestadores.length} cadastrados`}
          icone={Truck}
        />
        <Kpi rotulo="Valor aprovado" valor={formatBRL(totalAprovado)} detalhe={`${servicos} serviços aprovados`} icone={BadgeCheck} />
        <Kpi
          rotulo="Aguardando conferência"
          valor={String(aguardando.length)}
          detalhe={aguardando.length ? "lotes pedem decisão" : "nada pendente"}
          icone={ClipboardCheck}
          aoClicar={() => navegar("/prestadores/conferencia")}
        />
        <Kpi
          rotulo="A pagar"
          valor={formatBRL(aPagar.reduce((soma, lote) => soma + lote.total, 0))}
          detalhe={`${aPagar.length} lote(s) conferido(s)`}
          icone={Wallet}
        />
      </div>

      <div className="grid-2">
        <section className="operations-surface">
          <div className="section-header">
            <div>
              <span className="eyebrow">Evolução</span>
              <h3>Valor aprovado por mês</h3>
            </div>
          </div>
          <GraficoBarras
            dados={evolucao}
            chaveX="mes"
            chaveY="valor"
            nome="Valor aprovado"
            formatar={formatBRL}
            formatarEixo={(valor) => `R$ ${Math.round(valor / 100) / 10} mil`}
            rotulo={`Valor aprovado por mês: ${evolucao.map((ponto) => `${ponto.mes} ${formatBRL(ponto.valor)}`).join(", ")}`}
          />
        </section>

        <section className="operations-surface">
          <div className="section-header">
            <div>
              <span className="eyebrow">Ranking</span>
              <h3>Valor aprovado por prestador</h3>
            </div>
          </div>
          <Barras
            rotuloAcessivel="Valor aprovado por prestador"
            linhas={ranking.map((linha) => ({
              rotulo: linha.prestador.nome,
              valor: linha.valor,
              texto: `${formatBRL(linha.valor)} · ${linha.servicos} serv.`,
            }))}
          />
        </section>
      </div>

      <div className="grid-2 espaco-acima">
        <section className="operations-surface">
          <div className="section-header">
            <div>
              <span className="eyebrow">Distribuição</span>
              <h3>Por categoria</h3>
            </div>
          </div>
          <Barras
            rotuloAcessivel="Valor aprovado por categoria"
            linhas={CATEGORIAS_PRESTADOR.map((categoria) => ({
              rotulo: categoria,
              valor: porCategoria.get(categoria) ?? 0,
              texto: formatBRL(porCategoria.get(categoria) ?? 0),
            }))}
          />
        </section>

        <section className="operations-surface">
          <div className="section-header">
            <div>
              <span className="eyebrow">Análise</span>
              <h3>Ticket médio por prestador</h3>
            </div>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Prestador</th>
                  <th>Serviços</th>
                  <th>Ticket médio</th>
                  <th>Portal</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((linha) => (
                  <tr key={linha.prestador.id}>
                    <td className="cell-main">
                      <strong>{linha.prestador.nome}</strong>
                      <span>{linha.prestador.categoria}</span>
                    </td>
                    <td>{linha.servicos}</td>
                    <td className="money">{formatBRL(linha.servicos ? linha.valor / linha.servicos : 0)}</td>
                    <td>{linha.prestador.portalAtivo ? <Selo tom="green">Ativo</Selo> : <Selo tom="neutral">Desativado</Selo>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="field-hint espaco-acima-curto">
            Considera só recibos aprovados, de {evolucao.length ? formatMonth(evolucaoMensal(recibos)[0].competencia) : "—"} em diante.
          </p>
        </section>
      </div>
    </>
  );
}
