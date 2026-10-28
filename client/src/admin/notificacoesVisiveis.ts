import { useColecao } from "@/_core/armazenamento/colecao";
import { pode, veModulo, type Usuario } from "@/_core/identidade/permissoes";
import { notificacoes, type Notificacao } from "@/modulos/notificacoes/colecao";
import { exigenciaDaRota, moduloDaRota } from "./menu";

/**
 * A pessoa só vê o aviso do que ela pode resolver: precisa da permissão que o
 * aviso pede (ex.: conferir pagamentos) e de acesso à página para onde ele leva.
 */
export function notificacaoVisivel(usuario: Usuario | null, aviso: Notificacao) {
  if (!usuario?.ativo) return false;
  if (aviso.exige && !pode(usuario, aviso.exige)) return false;
  if (!aviso.destino) return true;
  const modulo = moduloDaRota(aviso.destino);
  if (modulo && !veModulo(usuario, modulo)) return false;
  const exige = exigenciaDaRota(aviso.destino);
  return !exige || pode(usuario, exige);
}

/** As notificações da pessoa logada, já filtradas pelas permissões dela. */
export function useNotificacoesVisiveis(usuario: Usuario | null) {
  return useColecao(notificacoes).filter((aviso) => notificacaoVisivel(usuario, aviso));
}
