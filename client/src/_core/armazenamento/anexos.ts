import { MODO_REAL } from "../supabase/modo";

/**
 * Arquivos anexados (PDF das invoices) no IndexedDB do navegador: o
 * localStorage não comporta binários. Com backend, vira upload para o
 * servidor e este módulo passa a falar com ele.
 */

export type Anexo = { id: string; nome: string; tipo: string; blob: Blob };

const BANCO = "pnst-anexos";
const LOJA = "arquivos";

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolver, rejeitar) => {
    const pedido = indexedDB.open(BANCO, 1);
    pedido.onupgradeneeded = () => pedido.result.createObjectStore(LOJA, { keyPath: "id" });
    pedido.onsuccess = () => resolver(pedido.result);
    pedido.onerror = () => rejeitar(pedido.error);
  });
}

async function operar<T>(modo: IDBTransactionMode, acao: (loja: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const banco = await abrir();
  return new Promise((resolver, rejeitar) => {
    const pedido = acao(banco.transaction(LOJA, modo).objectStore(LOJA));
    pedido.onsuccess = () => resolver(pedido.result);
    pedido.onerror = () => rejeitar(pedido.error);
  });
}

// Modo real: bucket privado `anexos` do Supabase Storage. O id do anexo é o
// caminho do arquivo no bucket; só a equipe logada lê (política do bucket).
async function storage() {
  const { supabase } = await import("../supabase/cliente");
  return supabase().storage.from("anexos");
}

/**
 * `pasta` separa os arquivos de quem não é da equipe: o prestador só lê e
 * grava em `prestadores/<id dele>/...` (política do bucket).
 */
export async function guardarAnexo(arquivo: File, pasta?: string): Promise<Anexo> {
  if (MODO_REAL) {
    const nomeSeguro = arquivo.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w.\-]+/g, "_");
    const caminho = `${pasta ?? new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}/${nomeSeguro}`;
    const { error } = await (await storage()).upload(caminho, arquivo, { contentType: arquivo.type || "application/pdf" });
    if (error) throw error;
    return { id: caminho, nome: arquivo.name, tipo: arquivo.type || "application/pdf", blob: arquivo };
  }
  const anexo: Anexo = { id: `anx-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, nome: arquivo.name, tipo: arquivo.type || "application/pdf", blob: arquivo };
  await operar("readwrite", (loja) => loja.put(anexo));
  return anexo;
}

export async function lerAnexo(id: string): Promise<Anexo | null> {
  if (MODO_REAL) {
    const { data, error } = await (await storage()).download(id);
    if (error || !data) return null;
    return { id, nome: id.split("/").pop() ?? id, tipo: data.type, blob: data };
  }
  try {
    return (await operar<Anexo | undefined>("readonly", (loja) => loja.get(id))) ?? null;
  } catch {
    return null;
  }
}

export async function apagarAnexo(id: string) {
  if (MODO_REAL) {
    await (await storage()).remove([id]);
    return;
  }
  try {
    await operar("readwrite", (loja) => loja.delete(id));
  } catch {
    // Sem IndexedDB (aba privada, por exemplo) não há o que apagar.
  }
}

/** Pasta dos arquivos que o prestador anexa (recibos e fechamento). */
export const pastaDoPrestador = (prestadorId: string, competencia: string) => `prestadores/${prestadorId}/${competencia}`;

/**
 * Abre o anexo numa aba nova (PDF e imagem o navegador mostra; o resto baixa).
 * A aba é aberta antes de buscar o arquivo: aberta depois, o navegador bloqueia.
 */
export async function abrirAnexo(id: string, nome: string): Promise<boolean> {
  const aba = window.open("", "_blank");
  const anexo = await lerAnexo(id);
  if (!anexo) {
    aba?.close();
    return false;
  }
  const visivel = /^(application\/pdf|image\/)/.test(anexo.tipo || anexo.blob.type);
  if (aba && visivel) {
    const url = URL.createObjectURL(anexo.blob);
    aba.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } else {
    aba?.close();
    baixarBlob(anexo.blob, nome);
  }
  return true;
}

export function baixarBlob(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nome;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
