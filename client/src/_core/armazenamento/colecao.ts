import { useSyncExternalStore } from "react";
import { MODO_REAL } from "../supabase/modo";
import { gravar, ler } from "./deposito";
import { avisarRenovacao, VERSAO_DA_SEMENTE } from "./semente";

/**
 * Coleção: um dado do app com dono único. Hidrata uma vez a partir do
 * depósito, guarda a referência viva em memória e grava pelo depósito.
 *
 * Por que não ler do depósito a cada render: ele reserializa o JSON, então o
 * que volta é uma cópia — alterar a cópia não grava nada. Quem lê usa sempre
 * `ler()` (ou o hook), que devolve a mesma referência até a próxima mudança.
 *
 * É um store externo (useSyncExternalStore), então o portal e o admin
 * enxergam a mesma lista: o recibo aprovado no admin aparece aprovado no
 * portal sem recarregar.
 */

type Envelope<T> = { versao: number; dados: T };

/**
 * Onde a coleção mora no Supabase (modo real). "lista": um registro por item,
 * na tabela `id + dados`; "unico": um registro só (configurações).
 */
export type Remota<T> =
  | {
      tipo: "lista";
      tabela: string;
      /** Identidade do item; padrão `item.id`. */
      chave?: (item: never) => string;
      /** Linha do banco → item; `null` descarta (ex.: perfis de prestador na lista de usuários). */
      deLinha?: (linha: Record<string, unknown>) => unknown | null;
      /** Item → colunas gravadas; padrão `{ id, dados: item }`. */
      paraLinha?: (item: never) => Record<string, unknown>;
      /** Só altera registros existentes (perfis nascem no cadastro, não no app). */
      somenteAlterar?: boolean;
      /** Mais novos primeiro (notificações). */
      maisNovosPrimeiro?: boolean;
      /**
       * Grava sem ler de volta: quem grava pode não ter permissão de ver o que
       * gravou (o prestador avisa o escritório, mas não lê as notificações).
       */
      semRetorno?: boolean;
    }
  | { tipo: "unico"; tabela: string; id: string; inicial: () => T };

/** Quem grava no banco: o sincronizador do Supabase se registra aqui. */
type Escritor = (colecao: Colecao<unknown>, anterior: unknown, proximo: unknown) => void;
let escritor: Escritor | null = null;
export function definirEscritor(novo: Escritor | null) {
  escritor = novo;
}

export interface Colecao<T> {
  readonly nome: string;
  readonly remota?: Remota<T>;
  /** Estado inicial no modo real, antes de o banco responder (e ao sair). */
  inicialReal(): T;
  /** Aplica o que veio do banco sem gravar de volta. */
  aplicarRemoto(valor: T): void;
  ler(): T;
  atualizar(transformar: (atual: T) => T): void;
  assinar(ouvinte: () => void): () => void;
  /** Volta à semente de demonstração. */
  restaurar(): void;
  /** Esvazia, se a coleção sabe ficar vazia (ver `vazio` em criarColecao). */
  zerar(): void;
}

type Opcoes<T> = {
  remota?: Remota<T>;
  /**
   * Estado de "começar do zero". Sem ele a coleção atravessa o zeramento
   * intacta — é o caso de usuários e sessões, que trancariam o admin fora.
   */
  vazio?: () => T;
};

const registradas: Colecao<unknown>[] = [];

export function criarColecao<T>(nome: string, semente: () => T, opcoes: Opcoes<T> = {}): Colecao<T> {
  let atual: T | undefined;
  const ouvintes = new Set<() => void>();
  let gravacaoAgendada = false;

  // Modo real: nada de semente fictícia nem cópia de dado real no navegador.
  const inicialReal = (): T => {
    if (opcoes.remota?.tipo === "unico") return opcoes.remota.inicial();
    if (opcoes.vazio) return opcoes.vazio();
    return (opcoes.remota ? [] : semente()) as T;
  };

  function hidratar(): T {
    if (MODO_REAL) return inicialReal();
    const salvo = ler<Envelope<T>>(nome);
    // Envelope de outra versão é dado de formato antigo: recomeça da semente.
    if (salvo && salvo.versao === VERSAO_DA_SEMENTE) return salvo.dados;
    if (salvo) avisarRenovacao();
    const novo = semente();
    gravar<Envelope<T>>(nome, { versao: VERSAO_DA_SEMENTE, dados: novo });
    return novo;
  }

  function agendarGravacao() {
    if (MODO_REAL) return;
    // Várias mudanças no mesmo tique viram uma gravação só.
    if (gravacaoAgendada) return;
    gravacaoAgendada = true;
    queueMicrotask(() => {
      gravacaoAgendada = false;
      gravar<Envelope<T>>(nome, { versao: VERSAO_DA_SEMENTE, dados: atual as T });
    });
  }

  const colecao: Colecao<T> = {
    nome,
    remota: opcoes.remota,
    inicialReal,
    aplicarRemoto(valor) {
      if (Object.is(valor, atual)) return;
      atual = valor;
      ouvintes.forEach((ouvinte) => ouvinte());
    },
    ler() {
      if (atual === undefined) atual = hidratar();
      return atual;
    },
    atualizar(transformar) {
      const anterior = colecao.ler();
      const proximo = transformar(anterior);
      if (Object.is(proximo, atual)) return;
      atual = proximo;
      agendarGravacao();
      if (MODO_REAL && opcoes.remota && escritor) escritor(colecao as Colecao<unknown>, anterior, proximo);
      ouvintes.forEach((ouvinte) => ouvinte());
    },
    assinar(ouvinte) {
      ouvintes.add(ouvinte);
      return () => ouvintes.delete(ouvinte);
    },
    restaurar() {
      if (MODO_REAL) return; // dado real não "volta à semente"
      atual = semente();
      agendarGravacao();
      ouvintes.forEach((ouvinte) => ouvinte());
    },
    zerar() {
      if (!opcoes.vazio || MODO_REAL) return;
      atual = opcoes.vazio();
      agendarGravacao();
      ouvintes.forEach((ouvinte) => ouvinte());
    },
  };
  registradas.push(colecao as Colecao<unknown>);
  return colecao;
}

export function useColecao<T>(colecao: Colecao<T>): T {
  return useSyncExternalStore(colecao.assinar, colecao.ler, colecao.ler);
}

/** Todas as coleções criadas — quem restaura ou zera é o `semente.ts`. */
export function colecoesRegistradas(): readonly Colecao<unknown>[] {
  return registradas;
}

/** Substitui o registro de mesmo id ou o acrescenta no fim. */
export function gravarItem<T extends { id: string }>(lista: T[], item: T): T[] {
  return lista.some((atual) => atual.id === item.id) ? lista.map((atual) => (atual.id === item.id ? item : atual)) : [...lista, item];
}
