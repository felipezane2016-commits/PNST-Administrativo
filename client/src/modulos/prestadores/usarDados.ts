import { useColecao } from "@/_core/armazenamento/colecao";
import { fechamentos, prestadores, recibos, registros } from "./colecoes";

/** As coleções do módulo, já reativas. */
export function useDadosPrestadores() {
  return {
    prestadores: useColecao(prestadores),
    recibos: useColecao(recibos),
    fechamentos: useColecao(fechamentos),
    registros: useColecao(registros),
  };
}
