import { abrirAbaDeEspera, lerAnexo, mostrarPdf } from "@/_core/armazenamento/anexos";
import { formatarData, formatarDataHora } from "@/_core/tempo";
import { closingTotal, formatBRL, formatMonth, type Closing, type Receipt } from "@/lib/portal";

/**
 * Recibo (ou o mês inteiro do prestador) em PDF: página de dados e, em
 * seguida, o comprovante anexado. O pdf-lib só carrega quando alguém abre.
 */

const pdfLib = () => import("@/_core/armazenamento/pdf");
type Lib = Awaited<ReturnType<typeof pdfLib>>;
type Doc = Awaited<ReturnType<Lib["novoPdf"]>>;

const geradoEm = () => `Gerado em ${formatarDataHora(new Date().toISOString())} pelo PNST Administrativo`;

function paginaDoRecibo(lib: Lib, { pdf, fontes }: Doc, recibo: Receipt, nomePrestador: string, situacaoAnexo: string) {
  const { A4, MARGEM, cores, escrever, rodape, textoSeguro } = lib;
  const pagina = pdf.addPage([A4.largura, A4.altura]);
  const largura = A4.largura - MARGEM * 2;
  let y = A4.altura - MARGEM;

  pagina.drawText("RECIBO DE PRESTAÇÃO DE SERVIÇO", { x: MARGEM, y, size: 8.5, font: fontes.negrito, color: cores.APOIO });
  y -= 26;
  pagina.drawText(textoSeguro(fontes.negrito, recibo.id), { x: MARGEM, y, size: 22, font: fontes.negrito, color: cores.TINTA });
  const valor = formatBRL(recibo.amount);
  pagina.drawText(valor, { x: A4.largura - MARGEM - fontes.negrito.widthOfTextAtSize(valor, 20), y, size: 20, font: fontes.negrito, color: cores.TINTA });
  y -= 18;
  y = escrever(pagina, fontes.normal, `${nomePrestador} · ${formatMonth(recibo.competencia)} · Situação: ${recibo.status}`, MARGEM, y, 10, largura, cores.APOIO);
  y -= 8;
  pagina.drawLine({ start: { x: MARGEM, y }, end: { x: A4.largura - MARGEM, y }, thickness: 0.8, color: cores.LINHA });
  y -= 24;

  const campos: [string, string][] = [
    ["Cliente", recibo.client || "—"],
    ["Categoria", recibo.category],
    ["Data do serviço", formatarData(recibo.serviceDate)],
    ["Valor", valor],
    ["Processo / caso", recibo.caseRef || "—"],
    ["Quem pediu", recibo.requester || "—"],
    ["Lançado em", formatarDataHora(recibo.createdAt)],
    ["Prestador", nomePrestador],
  ];
  const coluna = largura / 2;
  for (let i = 0; i < campos.length; i += 2) {
    let menor = y;
    campos.slice(i, i + 2).forEach(([rotulo, texto], lado) => {
      const x = MARGEM + lado * coluna;
      pagina.drawText(textoSeguro(fontes.normal, rotulo.toUpperCase()), { x, y, size: 7.5, font: fontes.normal, color: cores.APOIO });
      menor = Math.min(menor, escrever(pagina, fontes.negrito, texto, x, y - 14, 11, coluna - 16));
    });
    y = menor - 12;
  }

  const blocos: [string, string][] = [["Descrição do serviço", recibo.description || "—"]];
  if (recibo.reviewNote) blocos.push(["Devolutiva do escritório", recibo.reviewNote]);
  blocos.push(["Comprovante", situacaoAnexo]);
  for (const [rotulo, texto] of blocos) {
    pagina.drawText(textoSeguro(fontes.normal, rotulo.toUpperCase()), { x: MARGEM, y, size: 7.5, font: fontes.normal, color: cores.APOIO });
    y = escrever(pagina, fontes.normal, texto, MARGEM, y - 14, 10.5, largura) - 12;
  }
  rodape(pagina, fontes, `${recibo.id} · ${geradoEm()}`);
}

/** Página do recibo + comprovante, dentro de um PDF já aberto. */
async function adicionarRecibo(lib: Lib, doc: Doc, recibo: Receipt, nomePrestador: string) {
  const anexo = recibo.attachmentId ? await lerAnexo(recibo.attachmentId) : null;
  const nome = recibo.attachmentName ?? "comprovante";
  // Monta a página de dados depois de saber se o anexo entra.
  const indice = doc.pdf.getPageCount();
  let situacao = recibo.attachmentName ? `${nome} — nas páginas seguintes.` : "Nenhum arquivo anexado.";
  if (recibo.attachmentName && !recibo.attachmentId) situacao = `${nome} — arquivo não guardado (enviado antes desta versão do portal; peça ao prestador para anexar de novo).`;
  else if (recibo.attachmentId && !anexo) situacao = `${nome} — não foi possível ler o arquivo.`;
  paginaDoRecibo(lib, doc, recibo, nomePrestador, situacao);
  if (anexo && !(await lib.anexarAoPdf(doc.pdf, doc.fontes, { ...anexo, nome }, `Comprovante do recibo ${recibo.id}: ${nome}`))) {
    // Formato que não vira PDF: a página de dados avisa.
    doc.pdf.removePage(indice);
    paginaDoRecibo(lib, doc, recibo, nomePrestador, `${nome} — formato que não pode ser convertido em PDF; baixe o arquivo original.`);
  }
}

export async function gerarPdfRecibo(recibo: Receipt, nomePrestador: string) {
  const lib = await pdfLib();
  const doc = await lib.novoPdf(`Recibo ${recibo.id}`);
  await adicionarRecibo(lib, doc, recibo, nomePrestador);
  return lib.paraBlob(doc.pdf);
}

/** O mês do prestador para a conferência: resumo, cada recibo com o comprovante e o documento de faturamento. */
export async function gerarPdfLote(recibos: Receipt[], nomePrestador: string, competencia: string, fechamento: Closing | null) {
  const lib = await pdfLib();
  const doc = await lib.novoPdf(`Fechamento ${formatMonth(competencia)} — ${nomePrestador}`);
  const { A4, MARGEM, cores, escrever, rodape, textoSeguro } = lib;
  const { pdf, fontes } = doc;
  const largura = A4.largura - MARGEM * 2;
  const total = closingTotal(recibos);

  let pagina = pdf.addPage([A4.largura, A4.altura]);
  let y = A4.altura - MARGEM;
  pagina.drawText("FECHAMENTO DO MÊS", { x: MARGEM, y, size: 8.5, font: fontes.negrito, color: cores.APOIO });
  y -= 26;
  y = escrever(pagina, fontes.negrito, `${nomePrestador} · ${formatMonth(competencia)}`, MARGEM, y, 18, largura);
  y = escrever(pagina, fontes.normal, `${recibos.length} recibo(s) · total ${formatBRL(total)} (sem os devolvidos) · documento de faturamento: ${fechamento?.documentName ?? "não anexado"}`, MARGEM, y - 2, 10, largura, cores.APOIO);
  y -= 14;
  for (const recibo of recibos) {
    if (y < 80) {
      rodape(pagina, fontes, geradoEm());
      pagina = pdf.addPage([A4.largura, A4.altura]);
      y = A4.altura - MARGEM;
    }
    pagina.drawLine({ start: { x: MARGEM, y: y + 10 }, end: { x: A4.largura - MARGEM, y: y + 10 }, thickness: 0.5, color: cores.LINHA });
    const valor = formatBRL(recibo.amount);
    pagina.drawText(textoSeguro(fontes.negrito, `${recibo.id}  ${recibo.client}`).slice(0, 70), { x: MARGEM, y: y - 4, size: 10, font: fontes.negrito, color: cores.TINTA });
    pagina.drawText(valor, { x: A4.largura - MARGEM - fontes.negrito.widthOfTextAtSize(valor, 10), y: y - 4, size: 10, font: fontes.negrito, color: cores.TINTA });
    pagina.drawText(textoSeguro(fontes.normal, `${recibo.category} · ${formatarData(recibo.serviceDate)} · ${recibo.status}`), { x: MARGEM, y: y - 18, size: 8.5, font: fontes.normal, color: cores.APOIO });
    y -= 34;
  }
  rodape(pagina, fontes, geradoEm());

  for (const recibo of recibos) await adicionarRecibo(lib, doc, recibo, nomePrestador);

  if (fechamento?.documentId) {
    const documento = await lerAnexo(fechamento.documentId);
    const nome = fechamento.documentName ?? "documento";
    if (documento) await lib.anexarAoPdf(pdf, fontes, { ...documento, nome }, `Documento de faturamento: ${nome}`);
  }
  return lib.paraBlob(pdf);
}

/** Abre o recibo em PDF numa aba nova. */
export function abrirReciboEmPdf(recibo: Receipt, nomePrestador: string) {
  return abrirGerado(() => gerarPdfRecibo(recibo, nomePrestador), `Recibo ${recibo.id}.pdf`);
}

export function abrirLoteEmPdf(recibos: Receipt[], nomePrestador: string, competencia: string, fechamento: Closing | null) {
  return abrirGerado(() => gerarPdfLote(recibos, nomePrestador, competencia, fechamento), `Fechamento ${competencia} ${nomePrestador}.pdf`);
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
