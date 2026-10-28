import { abrirAbaDeEspera, baixarBlob, lerAnexo, mostrarPdf } from "@/_core/armazenamento/anexos";
import { formatarData, formatarDataHora } from "@/_core/tempo";
import { anexosDoRecibo, closingTotal, documentosDoFechamento, formatBRL, formatMonthTitle, type Closing, type Receipt } from "@/lib/portal";
import { CATEGORIA_EN, traduzirParaIngles } from "@/lib/traducao";
import type { RGB } from "pdf-lib";

/**
 * Os PDFs dos recibos, no desenho do sistema de referência do escritório:
 * - Recibo de despesa (cabeçalho laranja PNST ADVOGADOS), seguido dos documentos anexados;
 * - Nota de despesas (português ou inglês) e o unificado (recibo + nota);
 * - Documento único do mês (resumo + recibos + documentos + NF), gerado ao finalizar a conferência;
 * - Relatório mensal de serviços do prestador.
 * O pdf-lib só carrega quando alguém pede um PDF.
 */

const pdfLib = () => import("@/_core/armazenamento/pdf");
type Lib = Awaited<ReturnType<typeof pdfLib>>;
type Doc = Awaited<ReturnType<Lib["novoPdf"]>>;
export type Idioma = "pt" | "en";

const MM = 72 / 25.4;
const W = 210;

function cores(lib: Lib) {
  const hex = (valor: string): RGB => {
    const n = Number.parseInt(valor.slice(1), 16);
    return lib.rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
  };
  return {
    laranja: hex("#F97316"),
    laranjaClaro: hex("#FFF7ED"),
    grafite: hex("#374151"),
    grafiteEscuro: hex("#1F2937"),
    grafiteClaro: hex("#F9FAFB"),
    cinza: hex("#6B7280"),
    cinzaClaro: hex("#E5E7EB"),
    branco: hex("#FFFFFF"),
    zebra: hex("#F8FAFC"),
    faixa: hex("#F0F4F8"),
    hex,
  };
}

/** Desenho em milímetros a partir do topo, como no gerador da referência. */
function prancheta(lib: Lib, doc: Doc) {
  const pagina = doc.pdf.addPage([lib.A4.largura, lib.A4.altura]);
  const y = (mm: number) => lib.A4.altura - mm * MM;
  const texto = (
    conteudo: string,
    x: number,
    topo: number,
    tamanho: number,
    opcoes: { negrito?: boolean; cor?: RGB; alinhar?: "esquerda" | "direita" | "centro"; largura?: number } = {},
  ) => {
    const fonte = opcoes.negrito ? doc.fontes.negrito : doc.fontes.normal;
    let seguro = lib.textoSeguro(fonte, conteudo);
    if (opcoes.largura) {
      // Corta com reticências o que não cabe na coluna.
      while (seguro.length > 1 && fonte.widthOfTextAtSize(seguro, tamanho) > opcoes.largura * MM) seguro = `${seguro.slice(0, -2)}…`;
    }
    const largura = fonte.widthOfTextAtSize(seguro, tamanho);
    const xPt = opcoes.alinhar === "direita" ? x * MM - largura : opcoes.alinhar === "centro" ? x * MM - largura / 2 : x * MM;
    pagina.drawText(seguro, { x: xPt, y: y(topo), size: tamanho, font: fonte, color: opcoes.cor });
  };
  const retangulo = (x: number, topo: number, largura: number, altura: number, cor: RGB, borda?: RGB) =>
    pagina.drawRectangle({ x: x * MM, y: y(topo + altura), width: largura * MM, height: altura * MM, color: cor, borderColor: borda, borderWidth: borda ? 1.2 : 0 });
  const linha = (x1: number, topo: number, x2: number, cor: RGB, espessura = 0.5) =>
    pagina.drawLine({ start: { x: x1 * MM, y: y(topo) }, end: { x: x2 * MM, y: y(topo) }, thickness: espessura * MM, color: cor });
  /** Parágrafo com quebra de linha; devolve quantas linhas ocupou. */
  const paragrafo = (conteudo: string, x: number, topo: number, tamanho: number, largura: number, cor: RGB) => {
    const linhas = lib.quebrarLinhas(doc.fontes.normal, conteudo, tamanho, largura * MM);
    linhas.forEach((parte, i) => pagina.drawText(parte, { x: x * MM, y: y(topo + i * tamanho * 0.45), size: tamanho, font: doc.fontes.normal, color: cor }));
    return linhas.length;
  };
  return { pagina, texto, retangulo, linha, paragrafo };
}

const STATUS_EN: Record<string, string> = {
  Rascunho: "Draft",
  "Pendente de envio": "Pending",
  Enviado: "Sent",
  "Em análise": "Under review",
  "Ajuste solicitado": "Adjustment requested",
  Aprovado: "Approved",
  Pago: "Paid",
  Rejeitado: "Rejected",
  Arquivado: "Archived",
};

/** "Cliente / Caso" num campo só (recibos antigos tinham o caso à parte). */
const clienteCaso = (rec: Receipt) => [rec.client, rec.caseRef].filter((parte) => parte?.trim()).join(" — ");

const agoraTexto = (idioma: Idioma) =>
  new Intl.DateTimeFormat(idioma === "en" ? "en-US" : "pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date());

/** Recibo de despesa (o "Recibo PDF" da conferência). */
function desenharRecibo(lib: Lib, doc: Doc, rec: Receipt, prestador: string, idioma: Idioma = "pt") {
  const en = idioma === "en";
  const c = cores(lib);
  const p = prancheta(lib, doc);
  p.retangulo(0, 0, W, 32, c.laranja);
  p.texto("PNST ADVOGADOS", 15, 16, 18, { negrito: true, cor: c.branco });
  p.texto(en ? "EXPENSE RECEIPT" : "RECIBO DE DESPESA", W - 15, 16, 13, { negrito: true, cor: c.branco, alinhar: "direita" });
  p.texto(`${en ? "No." : "Nº"} ${rec.id}`, W - 15, 24, 9, { cor: c.branco, alinhar: "direita" });
  p.retangulo(0, 32, W, 8, c.laranjaClaro);
  p.texto(en ? "SERVICE INFORMATION" : "INFORMAÇÕES DO SERVIÇO PRESTADO", 15, 37.5, 8, { negrito: true, cor: c.laranja });
  let y = 50;
  const campo = (rotulo: string, valor: string) => {
    p.texto(rotulo.toUpperCase(), 15, y, 8, { cor: c.cinza });
    p.texto(valor || "—", 15, y + 6, 11, { negrito: true, cor: c.grafite, largura: W - 30 });
    y += 16;
  };
  const campo2 = (r1: string, v1: string, r2: string, v2: string) => {
    p.texto(r1.toUpperCase(), 15, y, 8, { cor: c.cinza });
    p.texto(r2.toUpperCase(), W / 2 + 5, y, 8, { cor: c.cinza });
    p.texto(v1 || "—", 15, y + 6, 11, { negrito: true, cor: c.grafite, largura: W / 2 - 20 });
    p.texto(v2 || "—", W / 2 + 5, y + 6, 11, { negrito: true, cor: c.grafite, largura: W / 2 - 20 });
    y += 16;
  };
  campo(en ? "Service Provider" : "Prestador de Serviço", prestador);
  campo2(en ? "Service Date" : "Data do Serviço", formatarData(rec.serviceDate), en ? "Category" : "Categoria", rec.category);
  campo2(en ? "Client / Case" : "Cliente / Caso", clienteCaso(rec), en ? "Requested by" : "Solicitante", rec.requester);
  p.texto(en ? "DESCRIPTION" : "DESCRIÇÃO", 15, y, 8, { cor: c.cinza });
  const linhas = p.paragrafo(rec.description || "—", 15, y + 6, 10, W - 30, c.grafite);
  y += 6 + linhas * 5 + 8;
  p.retangulo(15, y, W - 30, 20, c.laranjaClaro, c.laranja);
  p.texto(en ? "TOTAL AMOUNT" : "VALOR TOTAL", 25, y + 7, 8, { cor: c.cinza });
  p.texto(formatBRL(rec.amount), 25, y + 16, 18, { negrito: true, cor: c.laranja });
  p.texto(`Status: ${en ? STATUS_EN[rec.status] ?? rec.status : rec.status}`, W - 20, y + 14, 9, { cor: c.grafite, alinhar: "direita" });
  y += 28;
  const anexos = anexosDoRecibo(rec);
  if (anexos.length) {
    p.texto(en ? "ATTACHED DOCUMENTS" : "DOCUMENTOS ANEXADOS", 15, y, 8, { cor: c.cinza });
    anexos.forEach((arquivo, i) => p.texto(`• ${arquivo.nome}${arquivo.id ? "" : en ? " (file not stored)" : " (arquivo não guardado)"}`, 15, y + 6 + i * 5, 9, { cor: c.grafite, largura: W - 30 }));
  }
  p.linha(15, 282, W - 15, c.laranja);
  p.texto(`${en ? "Generated on" : "Gerado em"} ${agoraTexto(idioma)}`, W / 2, 288, 8, { cor: c.cinza, alinhar: "centro" });
}

/** Nota de despesas (português, ou inglês com os rótulos bilíngues da referência). */
function desenharNota(lib: Lib, doc: Doc, rec: Receipt, idioma: Idioma) {
  const pt = idioma === "pt";
  const c = cores(lib);
  const p = prancheta(lib, doc);
  p.retangulo(0, 0, W, 32, c.grafiteEscuro);
  p.texto("PNST ADVOGADOS", 15, 16, 18, { negrito: true, cor: c.branco });
  p.texto(pt ? "NOTA DE DESPESAS" : "EXPENSES REPORT / NOTA DE DESPESAS", W - 15, 16, 12, { negrito: true, cor: c.branco, alinhar: "direita" });
  p.retangulo(0, 32, W, 8, c.grafiteClaro);
  p.texto(pt ? "DETALHES DA DESPESA" : "EXPENSE DETAILS / DETALHES DA DESPESA", 15, 37.5, 8, { negrito: true, cor: c.grafite });
  let y = 50;
  let par = false;
  const linha = (rotulo: string, valor: string) => {
    p.retangulo(15, y - 5, W - 30, 12, par ? c.grafiteClaro : c.branco);
    par = !par;
    p.texto(rotulo, 20, y + 1, 8, { negrito: true, cor: c.cinza });
    p.texto(valor || "—", 20, y + 7, 10, { cor: c.grafite, largura: W - 40 });
    y += 14;
  };
  linha(pt ? "DATA" : "DATE / DATA", formatarData(rec.serviceDate));
  linha(pt ? "CLIENTE / CASO" : "CLIENT / CASE — CLIENTE / CASO", clienteCaso(rec));
  p.retangulo(15, y, W - 30, 22, c.grafite);
  p.texto(pt ? "VALOR TOTAL" : "TOTAL PAYMENT / VALOR TOTAL", 25, y + 8, 8, { negrito: true, cor: c.cinzaClaro });
  p.texto(formatBRL(rec.amount), 25, y + 18, 20, { negrito: true, cor: c.branco });
  y += 30;
  linha(pt ? "DESCRIÇÃO" : "DESCRIPTION / DESCRIÇÃO", rec.description);
  linha(pt ? "SOLICITANTE" : "REQUEST BY / SOLICITANTE", rec.requester);
  p.linha(15, 282, W - 15, c.grafite);
  p.texto(`${pt ? "Gerado em" : "Generated on"} ${agoraTexto(idioma)}`, W / 2, 288, 8, { cor: c.cinza, alinhar: "centro" });
}

/** Junta os documentos do recibo; os que não viram PDF (Word, Excel) são listados numa página de aviso. */
async function anexarDocumentos(lib: Lib, doc: Doc, rec: Receipt) {
  const fora: string[] = [];
  for (const arquivo of anexosDoRecibo(rec)) {
    if (!arquivo.id) {
      fora.push(`${arquivo.nome} — arquivo não guardado (enviado antes desta versão do portal)`);
      continue;
    }
    const lido = await lerAnexo(arquivo.id);
    if (!lido) {
      fora.push(`${arquivo.nome} — não foi possível ler o arquivo`);
      continue;
    }
    if (!(await lib.anexarAoPdf(doc.pdf, doc.fontes, { ...lido, nome: arquivo.nome }, `Documento do recibo ${rec.id}: ${arquivo.nome}`)))
      fora.push(`${arquivo.nome} — formato que não vira PDF; baixe o original na conferência`);
  }
  if (fora.length) {
    const c = cores(lib);
    const p = prancheta(lib, doc);
    p.texto(`Documentos do recibo ${rec.id} fora deste PDF`, 15, 20, 12, { negrito: true, cor: c.grafite });
    fora.forEach((linha, i) => p.texto(`• ${linha}`, 15, 30 + i * 6, 9, { cor: c.cinza, largura: W - 30 }));
  }
}

/** Recibo de despesa + documentos anexados. */
export async function gerarPdfRecibo(recibo: Receipt, nomePrestador: string) {
  const lib = await pdfLib();
  const doc = await lib.novoPdf(`Recibo ${recibo.id}`);
  desenharRecibo(lib, doc, recibo, nomePrestador);
  await anexarDocumentos(lib, doc, recibo);
  return lib.paraBlob(doc.pdf);
}

/** O recibo com a descrição e a categoria em inglês. */
async function emIngles(recibo: Receipt): Promise<Receipt> {
  const descricao = await traduzirParaIngles(recibo.description);
  return { ...recibo, description: descricao.texto, category: CATEGORIA_EN[recibo.category] ?? recibo.category };
}

/** Nota de despesas; unificada, vem depois do recibo. */
export async function gerarNota(original: Receipt, nomePrestador: string, idioma: Idioma, unificar: boolean) {
  // Em inglês, a descrição do serviço também vai traduzida.
  const recibo = idioma === "en" ? await emIngles(original) : original;
  const lib = await pdfLib();
  const doc = await lib.novoPdf(`${unificar ? "Unificado" : "Nota de despesas"} ${recibo.id}`);
  if (unificar) desenharRecibo(lib, doc, recibo, nomePrestador, idioma);
  desenharNota(lib, doc, recibo, idioma);
  return lib.paraBlob(doc.pdf);
}

/**
 * Documento único do mês: resumo, cada recibo com os documentos dele e, por
 * fim, a NF/fatura/boleto do fechamento.
 */
export async function gerarPdfLote(recibos: Receipt[], nomePrestador: string, competencia: string, fechamento: Closing | null) {
  const lib = await pdfLib();
  const doc = await lib.novoPdf(`Fechamento ${formatMonthTitle(competencia)} — ${nomePrestador}`);
  const c = cores(lib);
  const total = closingTotal(recibos);
  let p = prancheta(lib, doc);
  p.retangulo(0, 0, W, 32, c.laranja);
  p.texto("PNST ADVOGADOS", 15, 15, 18, { negrito: true, cor: c.branco });
  p.texto("Documento único do fechamento", 15, 22, 11, { cor: c.branco });
  p.texto(formatMonthTitle(competencia), W - 15, 15, 13, { negrito: true, cor: c.branco, alinhar: "direita" });
  p.texto(nomePrestador, W - 15, 22, 10, { cor: c.branco, alinhar: "direita", largura: 100 });
  p.texto(
    `${recibos.length} recibo(s) · total ${formatBRL(total)} · ${documentosDoFechamento(fechamento).length} documento(s) do fechamento`,
    15,
    44,
    10,
    { cor: c.grafite },
  );
  let y = 54;
  recibos.forEach((recibo, i) => {
    if (y > 270) {
      p = prancheta(lib, doc);
      y = 20;
    }
    p.retangulo(15, y, W - 30, 10, i % 2 === 0 ? c.zebra : c.branco);
    p.texto(formatarData(recibo.serviceDate), 17, y + 6.5, 8, { cor: c.grafite });
    p.texto(recibo.client, 40, y + 6.5, 8, { cor: c.grafite, largura: 60 });
    p.texto(recibo.category, 102, y + 6.5, 8, { cor: c.grafite, largura: 30 });
    p.texto(recibo.status, 135, y + 6.5, 8, { cor: c.cinza, largura: 30 });
    p.texto(formatBRL(recibo.amount), W - 17, y + 6.5, 8, { negrito: true, cor: c.grafite, alinhar: "direita" });
    y += 10;
  });
  for (const recibo of recibos) {
    desenharRecibo(lib, doc, recibo, nomePrestador);
    await anexarDocumentos(lib, doc, recibo);
  }
  for (const documento of documentosDoFechamento(fechamento)) {
    const lido = documento.id ? await lerAnexo(documento.id) : null;
    if (lido) await lib.anexarAoPdf(doc.pdf, doc.fontes, { ...lido, nome: documento.nome }, `Documento do fechamento: ${documento.nome}`);
  }
  return lib.paraBlob(doc.pdf);
}

/** Relatório mensal de serviços do prestador (tabela, totais e assinaturas). */
export async function gerarRelatorioMensal(itens: Receipt[], nomePrestador: string, mes: string) {
  const lib = await pdfLib();
  const doc = await lib.novoPdf(`Relatório mensal ${formatMonthTitle(mes)} — ${nomePrestador}`);
  const c = cores(lib);
  let p = prancheta(lib, doc);
  p.retangulo(0, 0, W, 36, c.grafiteEscuro);
  p.texto("PNST ADVOGADOS", 15, 15, 18, { negrito: true, cor: c.branco });
  p.texto("Portal do Prestador de Serviços", 15, 22, 11, { cor: c.branco });
  p.texto("RELATÓRIO MENSAL DE SERVIÇOS", W - 15, 15, 13, { negrito: true, cor: c.branco, alinhar: "direita" });
  p.texto(formatMonthTitle(mes), W - 15, 22, 10, { cor: c.branco, alinhar: "direita" });
  p.retangulo(0, 36, W, 14, c.faixa);
  p.texto("PRESTADOR", 15, 42, 8, { negrito: true, cor: c.cinza });
  p.texto(nomePrestador || "—", 15, 48, 10, { negrito: true, cor: c.grafite });

  const ordenados = [...itens].sort((a, b) => a.serviceDate.localeCompare(b.serviceDate));
  const total = ordenados.reduce((soma, recibo) => soma + recibo.amount, 0);
  let y = 62;
  const kpiW = (W - 35) / 2;
  (
    [
      [String(ordenados.length), "QTD. SERVIÇOS", c.grafiteEscuro],
      [formatBRL(total), "VALOR BRUTO", c.laranja],
    ] as const
  ).forEach(([valor, rotulo, cor], i) => {
    const x = 15 + i * (kpiW + 5);
    p.retangulo(x, y, kpiW, 16, cor);
    p.texto(rotulo, x + kpiW / 2, y + 5.5, 7, { negrito: true, cor: c.branco, alinhar: "centro" });
    p.texto(valor, x + kpiW / 2, y + 13, 11, { negrito: true, cor: c.branco, alinhar: "centro" });
  });
  y += 24;
  // Colunas dentro da margem (15 a 195 mm); textos longos quebram em várias
  // linhas e a linha da tabela cresce — nada é cortado.
  const colunas = {
    data: { x: 17, largura: 18 },
    cliente: { x: 36, largura: 40 },
    categoria: { x: 78, largura: 22 },
    descricao: { x: 102, largura: 50 },
    valor: { direita: 174 },
    status: { x: 176, largura: 18 },
  };
  const ALTURA_LINHA = 3.6;
  const quebrar = (texto: string, largura: number, tamanho = 7.5) => lib.quebrarLinhas(doc.fontes.normal, texto || "—", tamanho, largura * MM);
  const cabecalho = () => {
    p.retangulo(15, y, W - 30, 7, c.grafiteEscuro);
    (
      [
        [colunas.data.x, "DATA"],
        [colunas.cliente.x, "CLIENTE / CASO"],
        [colunas.categoria.x, "CATEGORIA"],
        [colunas.descricao.x, "DESCRIÇÃO"],
        [colunas.status.x, "STATUS"],
      ] as const
    ).forEach(([x, rotulo]) => p.texto(rotulo, x, y + 4.5, 7, { negrito: true, cor: c.branco }));
    p.texto("VALOR", colunas.valor.direita, y + 4.5, 7, { negrito: true, cor: c.branco, alinhar: "direita" });
    y += 7;
  };
  cabecalho();
  ordenados.forEach((recibo, i) => {
    const cliente = quebrar([recibo.client, recibo.caseRef].filter((parte) => parte?.trim()).join(" — "), colunas.cliente.largura);
    const categoria = quebrar(recibo.category, colunas.categoria.largura);
    const descricao = quebrar(recibo.description, colunas.descricao.largura);
    const status = quebrar(recibo.status.toUpperCase(), colunas.status.largura, 6.5);
    const altura = Math.max(10, Math.max(cliente.length, categoria.length, descricao.length, status.length) * ALTURA_LINHA + 5);
    if (y + altura > 272) {
      p = prancheta(lib, doc);
      y = 15;
      cabecalho();
    }
    p.retangulo(15, y, W - 30, altura, i % 2 === 0 ? c.zebra : c.branco);
    const topo = y + 5.5;
    const escrever = (linhas: string[], x: number, tamanho = 7.5) =>
      linhas.forEach((linha, n) => p.texto(linha, x, topo + n * ALTURA_LINHA, tamanho, { cor: c.grafite }));
    p.texto(formatarData(recibo.serviceDate), colunas.data.x, topo, 7.5, { cor: c.grafite });
    escrever(cliente, colunas.cliente.x);
    escrever(categoria, colunas.categoria.x);
    escrever(descricao, colunas.descricao.x);
    p.texto(formatBRL(recibo.amount), colunas.valor.direita, topo, 7.5, { negrito: true, cor: c.grafite, alinhar: "direita" });
    escrever(status, colunas.status.x, 6.5);
    y += altura;
  });
  if (y > 250) {
    p = prancheta(lib, doc);
    y = 15;
  }
  y += 2;
  p.retangulo(15, y, W - 30, 10, c.grafiteEscuro);
  p.texto("TOTAL GERAL", 17, y + 6.5, 8, { negrito: true, cor: c.branco });
  p.texto(formatBRL(total), 174, y + 6.5, 8, { negrito: true, cor: c.branco, alinhar: "direita" });
  y += 26;
  p.linha(15, y, 95, c.grafiteEscuro, 0.4);
  p.linha(115, y, W - 15, c.grafiteEscuro, 0.4);
  p.texto(nomePrestador || "Prestador", 55, y + 5, 8, { cor: c.cinza, alinhar: "centro" });
  p.texto("PNST Advogados", W / 2 + 50, y + 5, 8, { cor: c.cinza, alinhar: "centro" });
  p.linha(15, 285, W - 15, c.grafiteEscuro, 0.3);
  p.texto(`Gerado em ${formatarDataHora(new Date().toISOString())} — Portal do Prestador de Serviços`, W / 2, 289, 7.5, { cor: c.cinza, alinhar: "centro" });
  return lib.paraBlob(doc.pdf);
}

const nomeDeArquivo = (texto: string) => texto.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.-]+/g, "-");

/** Gera, baixa e devolve o relatório (para guardar na pasta do prestador). */
export async function baixarRelatorioMensal(itens: Receipt[], nomePrestador: string, mes: string) {
  const blob = await gerarRelatorioMensal(itens, nomePrestador, mes);
  const nome = `Relatorio_${nomeDeArquivo(nomePrestador)}_${mes}.pdf`;
  baixarBlob(blob, nome);
  return new File([blob], `Relatorio_Mensal_${mes}.pdf`, { type: "application/pdf" });
}

/** Abre o recibo de despesa (com os documentos) em PDF numa aba nova. */
export function abrirReciboEmPdf(recibo: Receipt, nomePrestador: string) {
  return abrirGerado(() => gerarPdfRecibo(recibo, nomePrestador), `Recibo_${recibo.id}.pdf`);
}

export function abrirNota(recibo: Receipt, nomePrestador: string, idioma: Idioma, unificar: boolean) {
  return abrirGerado(() => gerarNota(recibo, nomePrestador, idioma, unificar), `${unificar ? "Unificado" : "Notinha"}_${recibo.id}_${idioma}.pdf`);
}

export function abrirLoteEmPdf(recibos: Receipt[], nomePrestador: string, competencia: string, fechamento: Closing | null) {
  return abrirGerado(() => gerarPdfLote(recibos, nomePrestador, competencia, fechamento), `${nomeDeArquivo(nomePrestador)}_${competencia}_completo.pdf`);
}

/** A aba abre já no clique (depois de um await o navegador bloqueia) e recebe o PDF quando ele fica pronto. */
async function abrirGerado(gerar: () => Promise<Blob>, nome: string) {
  const aba = abrirAbaDeEspera();
  try {
    mostrarPdf(aba, await gerar(), nome);
    return true;
  } catch {
    aba?.close();
    return false;
  }
}
