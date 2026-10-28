/**
 * Tradução para o inglês dos textos livres da nota e do recibo (descrição do
 * serviço), pelo mesmo serviço gratuito que o sistema de referência usa
 * (MyMemory). Sem resposta, o texto sai como foi escrito — o PDF nunca deixa
 * de ser gerado por causa da tradução.
 */

const LIMITE = 450; // o serviço aceita até 500 caracteres por pedido

/** Divide em pedaços que cabem no limite, cortando entre frases ou palavras. */
export function pedacos(texto: string, limite = LIMITE) {
  const partes: string[] = [];
  let atual = "";
  for (const frase of texto.split(/(?<=[.!?;\n])\s+/)) {
    const palavras = frase.length > limite ? frase.split(/\s+/) : [frase];
    for (const palavra of palavras) {
      const junto = atual ? `${atual} ${palavra}` : palavra;
      if (junto.length > limite && atual) {
        partes.push(atual);
        atual = palavra;
      } else atual = junto;
    }
  }
  if (atual) partes.push(atual);
  return partes;
}

async function traduzirPedaco(texto: string) {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(texto)}&langpair=pt-BR|en-US`;
  const resposta = await fetch(url, { signal: AbortSignal.timeout(8000) });
  const dados = (await resposta.json()) as { responseStatus?: number | string; responseData?: { translatedText?: string } };
  const traduzido = dados.responseData?.translatedText;
  if (Number(dados.responseStatus) !== 200 || !traduzido || /MYMEMORY WARNING|QUERY LENGTH LIMIT/i.test(traduzido)) throw new Error("tradução");
  return traduzido;
}

/** Português → inglês; devolve o original se o serviço não responder. */
export async function traduzirParaIngles(texto: string): Promise<{ texto: string; traduzido: boolean }> {
  if (!texto.trim()) return { texto, traduzido: false };
  try {
    const partes = await Promise.all(pedacos(texto.trim()).map(traduzirPedaco));
    return { texto: partes.join(" "), traduzido: true };
  } catch {
    return { texto, traduzido: false };
  }
}

/** Categorias do formulário em inglês. */
export const CATEGORIA_EN: Record<string, string> = {
  Motoboy: "Courier",
  Cartório: "Notary office",
  Correio: "Postal service",
  SAESP: "SAESP",
  Outros: "Other",
  Diligência: "Field service",
  Honorários: "Fees",
  Custas: "Court costs",
  Transporte: "Transportation",
  Postagem: "Postage",
};
