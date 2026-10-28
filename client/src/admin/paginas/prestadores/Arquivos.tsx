import { formatarData } from "@/_core/tempo";
import Cabecalho from "@/admin/componentes/Cabecalho";
import Vazio from "@/admin/componentes/Vazio";
import { anexosDoRecibo, documentosDoFechamento, formatMonthTitle, listCompetencias, shiftMonth, type ArquivoAnexo } from "@/lib/portal";
import { CATEGORIAS_PRESTADOR, type CategoriaPrestador } from "@/modulos/prestadores/tipos";
import { useDadosPrestadores } from "@/modulos/prestadores/usarDados";
import { ChevronLeft, ChevronRight, FolderOpen } from "lucide-react";
import { useState } from "react";
import { BotaoAnexo } from "./ReciboDetalhe";

type Tipo = "Documento do recibo" | "NF / fatura / boleto" | "Documento único" | "Relatório mensal";
type Arquivo = ArquivoAnexo & { tipo: Tipo; referencia: string; data: string };

/**
 * A pasta de cada prestador, mês a mês: documentos dos recibos, NF do
 * fechamento, o documento único gerado na conferência e os relatórios mensais.
 */
export default function Arquivos() {
  const { prestadores, recibos, fechamentos, registros } = useDadosPrestadores();
  const [competencia, setCompetencia] = useState(() => listCompetencias(recibos)[0] ?? new Date().toISOString().slice(0, 7));
  const [categoria, setCategoria] = useState<CategoriaPrestador | "Todas">("Todas");

  const porPrestador = new Map<string, Arquivo[]>();
  const guardar = (prestadorId: string, arquivo: Arquivo) => porPrestador.set(prestadorId, [...(porPrestador.get(prestadorId) ?? []), arquivo]);

  for (const recibo of recibos) {
    if (recibo.competencia !== competencia || recibo.status === "Rascunho") continue;
    for (const anexo of anexosDoRecibo(recibo))
      guardar(recibo.prestadorId, { ...anexo, tipo: "Documento do recibo", referencia: `${recibo.id} · ${recibo.client}`, data: recibo.serviceDate });
  }
  for (const fechamento of fechamentos) {
    if (fechamento.competencia !== competencia || !fechamento.submitted) continue;
    const data = (fechamento.submittedAt ?? `${competencia}-01`).slice(0, 10);
    for (const documento of documentosDoFechamento(fechamento)) guardar(fechamento.prestadorId, { ...documento, tipo: "NF / fatura / boleto", referencia: "Fechamento do mês", data });
    if (fechamento.documentoUnico)
      guardar(fechamento.prestadorId, { ...fechamento.documentoUnico, tipo: "Documento único", referencia: "Recibos + documentos + NF", data: (fechamento.conferidoEm ?? data).slice(0, 10) });
  }
  for (const registro of registros) {
    if (registro.arquivo?.competencia !== competencia || registro.tipo !== "arquivo" || /único/i.test(registro.acao)) continue;
    guardar(registro.prestadorId, { ...registro.arquivo, tipo: "Relatório mensal", referencia: registro.usuario, data: registro.dataHora.slice(0, 10) });
  }

  const grupos = prestadores
    .filter((prestador) => categoria === "Todas" || prestador.categoria === categoria)
    .map((prestador) => ({ prestador, arquivos: porPrestador.get(prestador.id) ?? [] }))
    .filter((grupo) => grupo.arquivos.length);
  const total = grupos.reduce((soma, grupo) => soma + grupo.arquivos.length, 0);

  return (
    <>
      <Cabecalho
        rotulo="Prestadores de serviço"
        titulo={`Arquivos — ${formatMonthTitle(competencia)}`}
        descricao="A pasta de cada prestador no mês: documentos dos recibos, NF do fechamento, documento único da conferência e relatórios mensais. Clique para abrir em PDF."
        acoes={
          <div className="mes-navegacao mes-navegacao-compacta">
            <button type="button" className="icon-button" aria-label="Mês anterior" onClick={() => setCompetencia(shiftMonth(competencia, -1))}>
              <ChevronLeft size={16} strokeWidth={2} />
            </button>
            <strong>{formatMonthTitle(competencia)}</strong>
            <button type="button" className="icon-button" aria-label="Próximo mês" onClick={() => setCompetencia(shiftMonth(competencia, 1))}>
              <ChevronRight size={16} strokeWidth={2} />
            </button>
          </div>
        }
      />
      <section className="operations-surface">
        <div className="filter-chips espaco-abaixo" role="group" aria-label="Filtrar por categoria">
          {(["Todas", ...CATEGORIAS_PRESTADOR] as const).map((opcao) => (
            <button
              key={opcao}
              type="button"
              className={categoria === opcao ? "filter-chip filter-chip-active" : "filter-chip"}
              aria-pressed={categoria === opcao}
              onClick={() => setCategoria(opcao)}
            >
              {opcao}
            </button>
          ))}
        </div>
        {total === 0 ? (
          <Vazio icone={FolderOpen} titulo={`Nenhum arquivo salvo para ${formatMonthTitle(competencia)}`} />
        ) : (
          <div className="stack">
            {grupos.map(({ prestador, arquivos }) => (
              <div key={prestador.id}>
                <p className="eyebrow rotulo-acima">
                  {prestador.nome} · {prestador.categoria} · {arquivos.length}
                </p>
                <div className="ged-list">
                  {arquivos.map((arquivo, indice) => (
                    <div className="ged-line" key={`${arquivo.id ?? arquivo.nome}-${indice}`}>
                      <div className="ged-line-copy">
                        <BotaoAnexo id={arquivo.id} nome={arquivo.nome} rotulo={arquivo.nome} />
                        <span>{arquivo.referencia}</span>
                      </div>
                      <div className="ged-line-meta">
                        <span className="field-hint">{formatarData(arquivo.data)}</span>
                        <span className={arquivo.tipo === "Documento do recibo" ? "status-pill status-neutral" : "status-pill status-blue"}>{arquivo.tipo}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
