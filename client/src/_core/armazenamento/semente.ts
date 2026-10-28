import { useSyncExternalStore } from "react";
import { colecoesRegistradas } from "./colecao";

/**
 * A demonstração: a versão da semente e as duas maneiras de recomeçar.
 *
 * Trocar VERSAO_DA_SEMENTE faz cada coleção gravada numa versão anterior
 * voltar à semente na próxima leitura — dado de formato antigo quebraria a
 * tela em silêncio. Quando isso acontece, a pessoa é avisada uma vez, para não
 * achar que perdeu o que fez.
 */
export const VERSAO_DA_SEMENTE = 7;

/** Volta todas as coleções aos dados de demonstração. */
export function restaurarDemonstracao() {
  colecoesRegistradas().forEach((colecao) => colecao.restaurar());
}

/** Esvazia os dados de trabalho; usuários e sessões ficam. */
export function comecarDoZero() {
  colecoesRegistradas().forEach((colecao) => colecao.zerar());
}

let renovada = false;
const ouvintes = new Set<() => void>();

/** Chamado pela coleção que encontrou dado de uma versão anterior. */
export function avisarRenovacao() {
  if (renovada) return;
  renovada = true;
  // Pode acontecer no meio de um render (a coleção hidrata ao ser lida):
  // avisa no próximo tique para não atualizar outro componente durante ele.
  queueMicrotask(() => ouvintes.forEach((ouvinte) => ouvinte()));
}

export function dispensarAvisoDeRenovacao() {
  renovada = false;
  ouvintes.forEach((ouvinte) => ouvinte());
}

function assinar(ouvinte: () => void) {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}

export function demonstracaoFoiRenovada() {
  return renovada;
}

export function useDemonstracaoRenovada() {
  return useSyncExternalStore(assinar, demonstracaoFoiRenovada, () => false);
}
