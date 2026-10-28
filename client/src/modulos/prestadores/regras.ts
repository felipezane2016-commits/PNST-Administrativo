import { closingTotal, type Closing, type Receipt } from "@/lib/portal";
import type { CategoriaPrestador, Prestador, SituacaoLote } from "./tipos";

/**
 * Regras puras da conferência de recibos. Um "lote" é o fechamento que o
 * prestador enviou: os recibos de uma competência, com a NF do mês. É a
 * unidade que o escritório confere (finaliza, rejeita ou pede ajuste) e paga.
 */

export type Lote = {
  chave: string;
  prestador: Prestador;
  competencia: string;
  recibos: Receipt[];
  fechamento: Closing;
  situacao: SituacaoLote;
  total: number;
  enviadoEm: string | null;
};

/** Recibos que foram no envio (os recibos excluídos depois somem do lote). */
export function recibosDoLote(recibos: Receipt[], fechamento: Closing) {
  const doMes = recibos.filter((recibo) => recibo.prestadorId === fechamento.prestadorId && recibo.competencia === fechamento.competencia);
  if (fechamento.reciboIds) return doMes.filter((recibo) => fechamento.reciboIds!.includes(recibo.id));
  return doMes.filter((recibo) => recibo.status !== "Rascunho" && recibo.status !== "Pendente de envio");
}

/** Os lotes da conferência: todo fechamento enviado, o que pede ação primeiro. */
export function montarLotes(recibos: Receipt[], fechamentos: Closing[], prestadores: Prestador[]): Lote[] {
  const porId = new Map(prestadores.map((prestador) => [prestador.id, prestador]));
  const lotes: Lote[] = [];
  for (const fechamento of fechamentos) {
    const prestador = porId.get(fechamento.prestadorId);
    if (!prestador || !fechamento.submitted || !fechamento.review) continue;
    const doLote = recibosDoLote(recibos, fechamento);
    lotes.push({
      chave: `${fechamento.prestadorId}|${fechamento.competencia}`,
      prestador,
      competencia: fechamento.competencia,
      recibos: doLote,
      fechamento,
      situacao: fechamento.review,
      total: closingTotal(doLote),
      enviadoEm: fechamento.submittedAt,
    });
  }
  const ordem: Record<SituacaoLote, number> = {
    "Aguardando conferência": 0,
    "Em conferência": 1,
    Conferido: 2,
    Rejeitado: 3,
    Pago: 4,
  };
  return lotes.sort(
    (a, b) => ordem[a.situacao] - ordem[b.situacao] || (b.enviadoEm ?? "").localeCompare(a.enviadoEm ?? "") || b.competencia.localeCompare(a.competencia),
  );
}

/** Finalizar, rejeitar e pedir ajuste: enquanto a conferência está aberta. */
export function conferenciaAberta(lote: Pick<Lote, "situacao">) {
  return lote.situacao === "Aguardando conferência" || lote.situacao === "Em conferência";
}

export const podeFinalizarConferencia = (lote: Lote) => conferenciaAberta(lote) && lote.recibos.length > 0;

export function podeMarcarPago(lote: Pick<Lote, "situacao">) {
  return lote.situacao === "Conferido";
}

/** Aprovado ou pago: o que o escritório aceitou. */
const aceito = (recibo: Receipt) => recibo.status === "Aprovado" || recibo.status === "Pago";

export type LinhaRanking = { prestador: Prestador; valor: number; servicos: number };

/** Valor aprovado e serviços por prestador, do maior para o menor valor. */
export function rankingPrestadores(recibos: Receipt[], prestadores: Prestador[]): LinhaRanking[] {
  return prestadores
    .map((prestador) => {
      const aprovados = recibos.filter((recibo) => recibo.prestadorId === prestador.id && aceito(recibo));
      return {
        prestador,
        valor: aprovados.reduce((total, recibo) => total + recibo.amount, 0),
        servicos: aprovados.length,
      };
    })
    .sort((a, b) => b.valor - a.valor);
}

export function totalPorCategoria(recibos: Receipt[], prestadores: Prestador[]) {
  const categoriaDe = new Map(prestadores.map((prestador) => [prestador.id, prestador.categoria]));
  const totais = new Map<CategoriaPrestador, number>();
  for (const recibo of recibos) {
    if (!aceito(recibo)) continue;
    const categoria = categoriaDe.get(recibo.prestadorId);
    if (!categoria) continue;
    totais.set(categoria, (totais.get(categoria) ?? 0) + recibo.amount);
  }
  return totais;
}

/** Valor aprovado por competência, em ordem cronológica. */
export function evolucaoMensal(recibos: Receipt[]) {
  const porMes = new Map<string, { valor: number; servicos: number }>();
  for (const recibo of recibos) {
    if (!aceito(recibo)) continue;
    const atual = porMes.get(recibo.competencia) ?? { valor: 0, servicos: 0 };
    porMes.set(recibo.competencia, { valor: atual.valor + recibo.amount, servicos: atual.servicos + 1 });
  }
  return Array.from(porMes.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([competencia, dados]) => ({ competencia, ...dados }));
}

/** Código de acesso livre? Ignora o próprio prestador ao editar. */
export function codigoDisponivel(codigo: string, prestadores: Prestador[], ignorarId?: string) {
  const alvo = codigo.trim().toUpperCase();
  return !prestadores.some((prestador) => prestador.id !== ignorarId && prestador.codigoAcesso.toUpperCase() === alvo);
}
