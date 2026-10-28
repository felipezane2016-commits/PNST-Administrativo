import { formatarData } from "@/_core/tempo";
import Cabecalho from "@/admin/componentes/Cabecalho";
import Vazio from "@/admin/componentes/Vazio";
import { anexosDoRecibo, documentosDoFechamento, formatMonthTitle, nomeDoUnificado, type ArquivoAnexo, type Receipt } from "@/lib/portal";
import { abrirNota } from "@/lib/reciboPdf";
import { recibosDoLote } from "@/modulos/prestadores/regras";
import { CATEGORIAS_PRESTADOR, type CategoriaPrestador, type Prestador } from "@/modulos/prestadores/tipos";
import { useDadosPrestadores } from "@/modulos/prestadores/usarDados";
import { ChevronRight, Folder, FolderOpen, Paperclip } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearch } from "wouter";
import { BotaoAnexo } from "./ReciboDetalhe";

type Tipo = "Recibo + nota" | "Documento do prestador" | "NF / fatura / boleto" | "Relatório mensal";
type Arquivo = ArquivoAnexo & {
  tipo: Tipo;
  referencia: string;
  data: string;
  prestadorId: string;
  competencia: string;
  /** Recibo + nota ainda não guardado (lote anterior a esta versão): é gerado ao abrir. */
  gerarDe?: Receipt;
};
type Caminho = { categoria?: CategoriaPrestador; prestadorId?: string; competencia?: string };

const ORDEM: Record<Tipo, number> = { "Recibo + nota": 0, "NF / fatura / boleto": 1, "Documento do prestador": 2, "Relatório mensal": 3 };

/**
 * O que fica na pasta do mês de cada prestador: o recibo + nota unificado de
 * cada recibo enviado (nomeado com cliente/caso, data e valor), a NF e os
 * documentos que o prestador anexou, e o relatório mensal (o mais recente).
 */
function juntarArquivos({ recibos, fechamentos, registros }: ReturnType<typeof useDadosPrestadores>): Arquivo[] {
  const arquivos: Arquivo[] = [];
  for (const fechamento of fechamentos) {
    if (!fechamento.submitted) continue;
    const base = { prestadorId: fechamento.prestadorId, competencia: fechamento.competencia };
    const enviadoEm = (fechamento.submittedAt ?? `${fechamento.competencia}-01`).slice(0, 10);
    for (const recibo of recibosDoLote(recibos, fechamento)) {
      const guardado = fechamento.unificados?.find((item) => item.reciboId === recibo.id);
      const nome = `${nomeDoUnificado(recibo)}.pdf`;
      arquivos.push(
        guardado
          ? { ...guardado, ...base, nome, tipo: "Recibo + nota", referencia: recibo.id, data: recibo.serviceDate }
          : { id: null, nome, ...base, tipo: "Recibo + nota", referencia: recibo.id, data: recibo.serviceDate, gerarDe: recibo },
      );
      for (const anexo of anexosDoRecibo(recibo))
        arquivos.push({ ...anexo, ...base, tipo: "Documento do prestador", referencia: `${recibo.id} · ${recibo.client}`, data: recibo.serviceDate });
    }
    for (const documento of documentosDoFechamento(fechamento))
      arquivos.push({ ...documento, ...base, tipo: "NF / fatura / boleto", referencia: "Fechamento do mês", data: enviadoEm });
  }
  // Relatório mensal: só o mais recente de cada prestador no mês.
  const relatorios = new Map<string, Arquivo>();
  for (const registro of [...registros].sort((a, b) => a.dataHora.localeCompare(b.dataHora))) {
    if (registro.tipo !== "arquivo" || !registro.arquivo || !/relatório/i.test(registro.acao)) continue;
    relatorios.set(`${registro.prestadorId}|${registro.arquivo.competencia}`, {
      ...registro.arquivo,
      tipo: "Relatório mensal",
      referencia: `Gerado por ${registro.usuario}`,
      data: registro.dataHora.slice(0, 10),
      prestadorId: registro.prestadorId,
      competencia: registro.arquivo.competencia,
    });
  }
  return [...arquivos, ...Array.from(relatorios.values())];
}

/**
 * Os arquivos em pastas, como num explorador: categoria (Motoboy, Cartório...)
 * › prestador › mês › documentos. Cada documento cai na pasta do prestador que
 * o enviou e no mês do serviço.
 */
export default function Arquivos() {
  const dados = useDadosPrestadores();
  const busca = useSearch();
  // Vindo da conferência (?prestador=...&mes=...), abre direto na pasta do mês.
  const pastaPedida = (): Caminho => {
    const parametros = new URLSearchParams(busca);
    const alvo = dados.prestadores.find((item) => item.id === parametros.get("prestador"));
    return alvo ? { categoria: alvo.categoria, prestadorId: alvo.id, competencia: parametros.get("mes") ?? undefined } : {};
  };
  const [caminho, setCaminho] = useState<Caminho>(pastaPedida);
  // No banco real o cadastro chega depois da primeira tela: abre a pasta quando ele chegar.
  const cadastroCarregado = dados.prestadores.length > 0;
  useEffect(() => {
    if (cadastroCarregado) setCaminho((atual) => (atual.categoria ? atual : pastaPedida()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cadastroCarregado, busca]);
  const arquivos = juntarArquivos(dados);
  const prestadorDe = new Map(dados.prestadores.map((prestador) => [prestador.id, prestador]));
  const categoriaDe = (arquivo: Arquivo) => prestadorDe.get(arquivo.prestadorId)?.categoria;
  const conhecidos = arquivos.filter((arquivo) => categoriaDe(arquivo));

  const naCategoria = conhecidos.filter((arquivo) => categoriaDe(arquivo) === caminho.categoria);
  const doPrestador = naCategoria.filter((arquivo) => arquivo.prestadorId === caminho.prestadorId);
  const doMes = doPrestador.filter((arquivo) => arquivo.competencia === caminho.competencia).sort((a, b) => ORDEM[a.tipo] - ORDEM[b.tipo] || a.data.localeCompare(b.data) || a.nome.localeCompare(b.nome));
  const prestador = caminho.prestadorId ? prestadorDe.get(caminho.prestadorId) : undefined;

  const trilha: { rotulo: string; ir: Caminho }[] = [{ rotulo: "Arquivos", ir: {} }];
  if (caminho.categoria) trilha.push({ rotulo: caminho.categoria, ir: { categoria: caminho.categoria } });
  if (prestador) trilha.push({ rotulo: prestador.nome, ir: { categoria: caminho.categoria, prestadorId: prestador.id } });
  if (caminho.competencia) trilha.push({ rotulo: formatMonthTitle(caminho.competencia), ir: caminho });

  return (
    <>
      <Cabecalho
        rotulo="Prestadores de serviço"
        titulo="Arquivos"
        descricao="Uma pasta por categoria, dentro dela uma por prestador e, em cada prestador, uma por mês com o recibo + nota de cada serviço, a NF e os documentos do prestador e o relatório mensal."
      />
      <section className="operations-surface">
        <nav className="pasta-trilha" aria-label="Caminho da pasta">
          {trilha.map((passo, indice) => (
            <span key={passo.rotulo + indice} className="pasta-trilha-passo">
              {indice > 0 ? <ChevronRight size={14} strokeWidth={2} aria-hidden="true" /> : null}
              {indice === trilha.length - 1 ? (
                <strong aria-current="page">{passo.rotulo}</strong>
              ) : (
                <button type="button" className="text-button text-button-neutro" onClick={() => setCaminho(passo.ir)}>
                  {passo.rotulo}
                </button>
              )}
            </span>
          ))}
        </nav>

        {!caminho.categoria ? (
          <Pastas
            itens={CATEGORIAS_PRESTADOR.map((categoria) => {
              const deles = conhecidos.filter((arquivo) => categoriaDe(arquivo) === categoria);
              const pessoas = new Set(deles.map((arquivo) => arquivo.prestadorId)).size;
              return { chave: categoria, nome: categoria, detalhe: `${pessoas} prestador(es) · ${deles.length} arquivo(s)`, vazia: !deles.length, abrir: () => setCaminho({ categoria }) };
            })}
          />
        ) : !prestador ? (
          <Pastas
            vazio={`Nenhum prestador de ${caminho.categoria} com arquivos.`}
            itens={dados.prestadores
              .filter((item: Prestador) => item.categoria === caminho.categoria)
              .map((item) => {
                const deles = naCategoria.filter((arquivo) => arquivo.prestadorId === item.id);
                const meses = new Set(deles.map((arquivo) => arquivo.competencia)).size;
                return { chave: item.id, nome: item.nome, detalhe: `${meses} mês(es) · ${deles.length} arquivo(s)`, vazia: !deles.length, abrir: () => setCaminho({ categoria: caminho.categoria, prestadorId: item.id }) };
              })}
          />
        ) : !caminho.competencia ? (
          <Pastas
            vazio={`${prestador.nome} ainda não tem arquivos.`}
            itens={Array.from(new Set(doPrestador.map((arquivo) => arquivo.competencia)))
              .sort()
              .reverse()
              .map((competencia) => ({
                chave: competencia,
                nome: formatMonthTitle(competencia),
                detalhe: `${doPrestador.filter((arquivo) => arquivo.competencia === competencia).length} arquivo(s)`,
                vazia: false,
                abrir: () => setCaminho({ ...caminho, competencia }),
              }))}
          />
        ) : doMes.length === 0 ? (
          <Vazio icone={FolderOpen} titulo="Pasta vazia" />
        ) : (
          <div className="ged-list">
            {doMes.map((arquivo, indice) => (
              <div className="ged-line" key={`${arquivo.id ?? arquivo.nome}-${indice}`}>
                <div className="ged-line-copy">
                  {arquivo.gerarDe ? (
                    <button
                      type="button"
                      className="documento-botao"
                      aria-label={`Abrir ${arquivo.nome}`}
                      title="Abrir em PDF"
                      onClick={() => void abrirNota(arquivo.gerarDe!, prestadorDe.get(arquivo.prestadorId)?.nome ?? "Prestador", "pt", true)}
                    >
                      <Paperclip size={13} strokeWidth={2} /> {arquivo.nome}
                    </button>
                  ) : (
                    <BotaoAnexo id={arquivo.id} nome={arquivo.nome} rotulo={arquivo.nome} />
                  )}
                  <span>{arquivo.referencia}</span>
                </div>
                <div className="ged-line-meta">
                  <span className="field-hint">{formatarData(arquivo.data)}</span>
                  <span className={arquivo.tipo === "Recibo + nota" ? "status-pill status-amber" : arquivo.tipo === "Relatório mensal" ? "status-pill status-blue" : "status-pill status-neutral"}>{arquivo.tipo}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function Pastas({ itens, vazio }: { itens: { chave: string; nome: string; detalhe: string; vazia: boolean; abrir: () => void }[]; vazio?: string }) {
  if (!itens.length) return <Vazio icone={FolderOpen} titulo={vazio ?? "Nenhuma pasta"} />;
  return (
    <ul className="pastas-grade">
      {itens.map((item) => (
        <li key={item.chave}>
          <button type="button" className={item.vazia ? "pasta pasta-vazia" : "pasta"} onClick={item.abrir} aria-label={`Abrir pasta ${item.nome}`}>
            <Folder size={26} strokeWidth={1.6} aria-hidden="true" />
            <strong>{item.nome}</strong>
            <span>{item.detalhe}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
