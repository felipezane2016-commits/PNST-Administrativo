import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import type { Anexo } from "./anexos";

/**
 * Tudo que o sistema abre sai em PDF: o recibo vira uma página com os dados e
 * o comprovante entra logo depois (páginas do PDF original ou a imagem
 * encaixada numa página A4).
 */

export const A4 = { largura: 595.28, altura: 841.89 };
export const MARGEM = 48;
const TINTA = rgb(0.13, 0.15, 0.19);
const APOIO = rgb(0.42, 0.45, 0.5);
const LINHA = rgb(0.86, 0.87, 0.9);

export type Fontes = { normal: PDFFont; negrito: PDFFont };

export async function novoPdf(titulo: string) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(titulo);
  pdf.setProducer("PNST Administrativo");
  pdf.setCreator("PNST Administrativo");
  const fontes: Fontes = { normal: await pdf.embedFont(StandardFonts.Helvetica), negrito: await pdf.embedFont(StandardFonts.HelveticaBold) };
  return { pdf, fontes };
}

/** As fontes padrão do PDF só têm o alfabeto latino; o resto vira "?" em vez de quebrar. */
export function textoSeguro(fonte: PDFFont, texto: string) {
  const limpo = texto.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/→/g, "->").replace(/\s+/g, " ");
  return Array.from(limpo)
    .map((letra) => {
      try {
        fonte.encodeText(letra);
        return letra;
      } catch {
        return "?";
      }
    })
    .join("");
}

/** Quebra o texto em linhas que cabem na largura. */
export function quebrarLinhas(fonte: PDFFont, texto: string, tamanho: number, largura: number) {
  const linhas: string[] = [];
  for (const paragrafo of textoSeguro(fonte, texto).split("\n")) {
    let atual = "";
    for (const palavra of paragrafo.split(" ")) {
      const tentativa = atual ? `${atual} ${palavra}` : palavra;
      if (fonte.widthOfTextAtSize(tentativa, tamanho) <= largura) atual = tentativa;
      else {
        if (atual) linhas.push(atual);
        atual = palavra;
      }
    }
    linhas.push(atual);
  }
  return linhas;
}

/** Escreve um bloco de texto e devolve o y logo abaixo dele. */
export function escrever(pagina: PDFPage, fonte: PDFFont, texto: string, x: number, y: number, tamanho: number, largura: number, cor = TINTA) {
  let cursor = y;
  for (const linha of quebrarLinhas(fonte, texto, tamanho, largura)) {
    pagina.drawText(linha, { x, y: cursor, size: tamanho, font: fonte, color: cor });
    cursor -= tamanho * 1.35;
  }
  return cursor;
}

export function rodape(pagina: PDFPage, fontes: Fontes, texto: string) {
  pagina.drawLine({ start: { x: MARGEM, y: 40 }, end: { x: A4.largura - MARGEM, y: 40 }, thickness: 0.6, color: LINHA });
  pagina.drawText(textoSeguro(fontes.normal, texto), { x: MARGEM, y: 28, size: 8, font: fontes.normal, color: APOIO });
}

export const cores = { TINTA, APOIO, LINHA };

/** Imagens que o pdf-lib não lê (webp, gif, heic...) passam por um canvas e viram PNG. */
async function bytesDaImagem(blob: Blob): Promise<{ bytes: ArrayBuffer; png: boolean }> {
  if (blob.type === "image/jpeg" || blob.type === "image/jpg") return { bytes: await blob.arrayBuffer(), png: false };
  if (blob.type === "image/png") return { bytes: await blob.arrayBuffer(), png: true };
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
  const png = await new Promise<Blob>((resolver, rejeitar) => canvas.toBlob((saida) => (saida ? resolver(saida) : rejeitar(new Error("imagem"))), "image/png"));
  return { bytes: await png.arrayBuffer(), png: true };
}

const ehPdf = (anexo: Anexo) => (anexo.tipo || anexo.blob.type) === "application/pdf" || /\.pdf$/i.test(anexo.nome);
const ehImagem = (anexo: Anexo) => /^image\//.test(anexo.tipo || anexo.blob.type);

/**
 * Junta o anexo ao PDF: copia as páginas de um PDF ou encaixa a imagem numa
 * página A4. Devolve false quando o formato não tem como virar PDF.
 */
export async function anexarAoPdf(pdf: PDFDocument, fontes: Fontes, anexo: Anexo, legenda: string): Promise<boolean> {
  if (ehPdf(anexo)) {
    try {
      const origem = await PDFDocument.load(await anexo.blob.arrayBuffer(), { ignoreEncryption: true });
      const paginas = await pdf.copyPages(origem, origem.getPageIndices());
      paginas.forEach((pagina) => pdf.addPage(pagina));
      return true;
    } catch {
      return false;
    }
  }
  if (ehImagem(anexo)) {
    try {
      const { bytes, png } = await bytesDaImagem(anexo.blob);
      const imagem = png ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
      const pagina = pdf.addPage([A4.largura, A4.altura]);
      pagina.drawText(textoSeguro(fontes.negrito, legenda), { x: MARGEM, y: A4.altura - MARGEM, size: 10, font: fontes.negrito, color: TINTA });
      const caixa = { largura: A4.largura - MARGEM * 2, altura: A4.altura - MARGEM * 2 - 40 };
      const escala = Math.min(caixa.largura / imagem.width, caixa.altura / imagem.height, 1);
      const largura = imagem.width * escala;
      const altura = imagem.height * escala;
      pagina.drawImage(imagem, { x: (A4.largura - largura) / 2, y: A4.altura - MARGEM - 24 - altura, width: largura, height: altura });
      rodape(pagina, fontes, legenda);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

/** Um anexo sozinho (documento do fechamento, por exemplo) em PDF. */
export async function anexoEmPdf(anexo: Anexo): Promise<Blob | null> {
  if (ehPdf(anexo)) return anexo.blob.type === "application/pdf" ? anexo.blob : new Blob([await anexo.blob.arrayBuffer()], { type: "application/pdf" });
  const { pdf, fontes } = await novoPdf(anexo.nome);
  if (!(await anexarAoPdf(pdf, fontes, anexo, anexo.nome))) return null;
  return paraBlob(pdf);
}

export async function paraBlob(pdf: PDFDocument) {
  const bytes = await pdf.save();
  return new Blob([bytes as BlobPart], { type: "application/pdf" });
}
