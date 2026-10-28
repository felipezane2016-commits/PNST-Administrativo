import type { RealtimeChannel } from "@supabase/supabase-js";
import { useSyncExternalStore } from "react";
import { colecoesRegistradas, definirEscritor, type Colecao, type Remota } from "../armazenamento/colecao";
import { supabase } from "./cliente";

/**
 * Ponte entre as coleções do app e as tabelas do Supabase.
 *
 * - Ao entrar: lê todas as tabelas (o que a RLS deixa ver) e preenche as coleções.
 * - Ao gravar: compara o antes e o depois de cada `atualizar` e manda só o que
 *   mudou (insert dos novos, update dos alterados, delete dos removidos). O que o
 *   banco devolve (número de pagamento, por exemplo) volta para a tela.
 * - Tempo real: o que outra pessoa grava chega pelas mudanças do Postgres.
 * - Erro (RLS, regra de pagamento): avisa e recarrega a coleção do banco, que
 *   é sempre quem manda.
 */

type Lista = Extract<Remota<unknown>, { tipo: "lista" }>;
type Item = Record<string, unknown>;

const remotas = () => colecoesRegistradas().filter((c) => c.remota) as Colecao<unknown>[];

function chaveDe(remota: Lista, item: Item): string {
  return remota.chave ? remota.chave(item as never) : String(item.id);
}
function deLinha(remota: Lista, linha: Item) {
  return remota.deLinha ? remota.deLinha(linha) : linha.dados;
}
function paraLinha(remota: Lista, item: Item) {
  return remota.paraLinha ? remota.paraLinha(item as never) : { id: chaveDe(remota, item), dados: item };
}
const igual = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

// ── Avisos de erro para a tela ─────────────────────────────────────────────

let erro: string | null = null;
const ouvintesErro = new Set<() => void>();
function avisar(mensagem: string | null) {
  erro = mensagem;
  ouvintesErro.forEach((ouvinte) => ouvinte());
}
export function useErroSincronizacao() {
  return useSyncExternalStore(
    (ouvinte) => {
      ouvintesErro.add(ouvinte);
      return () => ouvintesErro.delete(ouvinte);
    },
    () => erro,
  );
}
export const dispensarErro = () => avisar(null);

/** Erro do Supabase vem como objeto { message, code }, não como Error. */
function mensagemDe(falha: unknown) {
  if (falha instanceof Error) return falha.message;
  if (falha && typeof falha === "object" && "message" in falha) return String((falha as { message: unknown }).message);
  return String(falha);
}

/** Mensagem do Postgres (gatilho) em português vem como está; RLS vira algo legível. */
function traduzir(mensagem: string) {
  if (/row-level security|violates row-level/i.test(mensagem)) return "Seu usuário não tem permissão para esta alteração.";
  return mensagem;
}

// ── Leitura ────────────────────────────────────────────────────────────────

async function lerTabela(tabela: string, maisNovosPrimeiro = false) {
  const linhas: Item[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await supabase()
      .from(tabela)
      .select("*")
      .order("criado_em", { ascending: !maisNovosPrimeiro })
      .range(de, de + 999);
    if (error) throw error;
    linhas.push(...(data as Item[]));
    if (!data || data.length < 1000) return linhas;
  }
}

async function carregar(colecao: Colecao<unknown>) {
  const remota = colecao.remota!;
  if (remota.tipo === "unico") {
    const { data, error } = await supabase().from(remota.tabela).select("dados").eq("id", remota.id).maybeSingle();
    if (error) throw error;
    colecao.aplicarRemoto(data?.dados ?? remota.inicial());
    return;
  }
  const linhas = await lerTabela(remota.tabela, remota.maisNovosPrimeiro);
  colecao.aplicarRemoto(linhas.map((linha) => deLinha(remota, linha)).filter((item) => item !== null));
}

// ── Escrita ────────────────────────────────────────────────────────────────

const pendentes = new Map<Colecao<unknown>, { anterior: unknown; proximo: unknown }>();
const filas = new Map<Colecao<unknown>, Promise<void>>();
let agendado = false;

function anotar(colecao: Colecao<unknown>, anterior: unknown, proximo: unknown) {
  const ja = pendentes.get(colecao);
  pendentes.set(colecao, { anterior: ja ? ja.anterior : anterior, proximo });
  if (agendado) return;
  agendado = true;
  queueMicrotask(() => {
    agendado = false;
    const lote = Array.from(pendentes.entries());
    pendentes.clear();
    // Uma fila por coleção: as gravações chegam ao banco na ordem em que aconteceram.
    for (const [colecao, mudanca] of lote) {
      const anteriorFila = filas.get(colecao) ?? Promise.resolve();
      filas.set(colecao, anteriorFila.then(() => enviar(colecao, mudanca.anterior, mudanca.proximo)));
    }
  });
}

/**
 * O que mudou entre duas versões de uma lista. Novo vira INSERT e alterado
 * vira UPDATE — nunca upsert: o gatilho de "pedido novo" do Postgres roda em
 * todo INSERT, inclusive no upsert de um registro que já existe.
 * Exportado para os testes.
 */
export function diferenca(remota: Lista, anterior: Item[], proximo: Item[]) {
  const antes = new Map(anterior.map((item) => [chaveDe(remota, item), item]));
  const depois = new Map(proximo.map((item) => [chaveDe(remota, item), item]));
  const novos = remota.somenteAlterar ? [] : proximo.filter((item) => !antes.has(chaveDe(remota, item)));
  const alterados = proximo.filter((item) => {
    const antigo = antes.get(chaveDe(remota, item));
    return antigo !== undefined && antigo !== item && !igual(antigo, item);
  });
  const apagar = remota.somenteAlterar ? [] : Array.from(antes.keys()).filter((chave) => !depois.has(chave));
  return { novos, alterados, apagar };
}

async function enviar(colecao: Colecao<unknown>, anterior: unknown, proximo: unknown) {
  const remota = colecao.remota!;
  try {
    if (remota.tipo === "unico") {
      if (igual(anterior, proximo)) return;
      const { error } = await supabase().from(remota.tabela).upsert({ id: remota.id, dados: proximo });
      if (error) throw error;
      return;
    }
    const { novos, alterados, apagar } = diferenca(remota, anterior as Item[], proximo as Item[]);
    if (novos.length && remota.semRetorno) {
      const { error } = await supabase().from(remota.tabela).insert(novos.map((item) => paraLinha(remota, item)));
      if (error) throw error;
    } else if (novos.length) {
      const { data, error } = await supabase().from(remota.tabela).insert(novos.map((item) => paraLinha(remota, item))).select();
      if (error) throw error;
      mesclar(colecao, data as Item[]);
    }
    for (const item of alterados) {
      const { id, ...campos } = paraLinha(remota, item);
      const { data, error } = await supabase().from(remota.tabela).update(campos).eq("id", id as string).select();
      if (error) throw error;
      // RLS que filtra em silêncio (update sem permissão) devolve zero linhas.
      if (!data || data.length === 0) throw new Error("row-level security");
      mesclar(colecao, data as Item[]);
    }
    if (apagar.length) {
      const { error } = await supabase().from(remota.tabela).delete().in("id", apagar);
      if (error) throw error;
    }
  } catch (falha) {
    avisar(`Não foi possível gravar: ${traduzir(mensagemDe(falha))}`);
    await carregar(colecao).catch(() => undefined);
  }
}

/** Aplica linhas do banco (resposta de gravação ou tempo real) na coleção. */
function mesclar(colecao: Colecao<unknown>, linhas: Item[]) {
  const remota = colecao.remota!;
  if (remota.tipo === "unico") {
    const linha = linhas.find((item) => item.id === remota.id);
    if (linha && !igual(linha.dados, colecao.ler())) colecao.aplicarRemoto(linha.dados);
    return;
  }
  let lista = colecao.ler() as Item[];
  let mudou = false;
  for (const linha of linhas) {
    const item = deLinha(remota, linha) as Item | null;
    const chave = String(linha.id);
    const posicao = lista.findIndex((atual) => chaveDe(remota, atual) === chave);
    if (item === null) {
      if (posicao >= 0) {
        lista = lista.filter((_, i) => i !== posicao);
        mudou = true;
      }
      continue;
    }
    if (posicao >= 0) {
      if (igual(lista[posicao], item)) continue;
      lista = lista.map((atual, i) => (i === posicao ? item : atual));
    } else lista = remota.maisNovosPrimeiro ? [item, ...lista] : [...lista, item];
    mudou = true;
  }
  if (mudou) colecao.aplicarRemoto(lista);
}

function remover(colecao: Colecao<unknown>, id: string) {
  const remota = colecao.remota!;
  if (remota.tipo === "unico") return;
  const lista = colecao.ler() as Item[];
  if (lista.some((item) => chaveDe(remota, item) === id)) colecao.aplicarRemoto(lista.filter((item) => chaveDe(remota, item) !== id));
}

// ── Ciclo de vida ──────────────────────────────────────────────────────────

let canal: RealtimeChannel | null = null;

export async function iniciarSincronizacao() {
  definirEscritor(anotar);
  await Promise.all(remotas().map(carregar));
  const porTabela = new Map<string, Colecao<unknown>[]>();
  for (const colecao of remotas()) porTabela.set(colecao.remota!.tabela, [...(porTabela.get(colecao.remota!.tabela) ?? []), colecao]);
  canal = supabase().channel("pnst-dados");
  for (const [tabela, colecoes] of Array.from(porTabela.entries())) {
    canal.on("postgres_changes", { event: "*", schema: "public", table: tabela }, (mudanca) => {
      for (const colecao of colecoes) {
        if (mudanca.eventType === "DELETE") remover(colecao, String((mudanca.old as Item).id));
        else mesclar(colecao, [mudanca.new as Item]);
      }
    });
  }
  canal.subscribe();
}

export async function pararSincronizacao() {
  definirEscritor(null);
  if (canal) await supabase().removeChannel(canal);
  canal = null;
  pendentes.clear();
  for (const colecao of remotas()) colecao.aplicarRemoto(colecao.inicialReal());
}
