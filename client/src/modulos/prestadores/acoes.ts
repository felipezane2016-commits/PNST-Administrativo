import { HOJE } from "@/_core/tempo";
import { formatBRL, formatMonth } from "@/lib/portal";
import { notificar } from "@/modulos/notificacoes/colecao";
import { fechamentos, prestadores, recibos } from "./colecoes";
import type { Prestador } from "./tipos";

/** Mutações da conferência e do cadastro. Toda escrita passa pelas coleções. */

export function aprovarRecibo(id: string) {
  recibos.atualizar((lista) =>
    lista.map((recibo) => (recibo.id === id && recibo.status === "Enviado" ? { ...recibo, status: "Aprovado", reviewNote: null } : recibo)),
  );
}

export function devolverRecibo(id: string, nota: string) {
  recibos.atualizar((lista) =>
    lista.map((recibo) =>
      recibo.id === id && recibo.status === "Enviado" ? { ...recibo, status: "Rejeitado", reviewNote: nota.trim() } : recibo,
    ),
  );
}

export function finalizarConferencia(prestadorId: string, competencia: string) {
  fechamentos.atualizar((lista) =>
    lista.map((item) =>
      item.prestadorId === prestadorId && item.competencia === competencia && item.review === "Aguardando conferência"
        ? { ...item, review: "Conferido" }
        : item,
    ),
  );
  const nome = prestadores.ler().find((prestador) => prestador.id === prestadorId)?.nome ?? "Prestador";
  notificar({
    tipo: "sucesso",
    titulo: "Conferência finalizada",
    corpo: `${nome} — ${formatMonth(competencia)} conferido, aguardando pagamento.`,
    destino: "/prestadores/conferencia",
  });
}

export function marcarPago(prestadorId: string, competencia: string) {
  fechamentos.atualizar((lista) =>
    lista.map((item) =>
      item.prestadorId === prestadorId && item.competencia === competencia && item.review === "Conferido"
        ? { ...item, review: "Pago", paidAt: HOJE }
        : item,
    ),
  );
}

export function salvarPrestador(dados: Prestador) {
  prestadores.atualizar((lista) =>
    lista.some((prestador) => prestador.id === dados.id)
      ? lista.map((prestador) => (prestador.id === dados.id ? dados : prestador))
      : [...lista, dados],
  );
}

/** Guarda o dia do convite do portal (o e-mail saiu pela função `convidar`). */
export function registrarConvitePortal(id: string) {
  prestadores.atualizar((lista) => lista.map((prestador) => (prestador.id === id ? { ...prestador, convidadoEm: HOJE } : prestador)));
}

/** O portal autentica contra o cadastro feito no admin. */
export function autenticarPrestador(codigo: string, senha: string): Prestador | null {
  const alvo = codigo.trim().toUpperCase();
  const encontrado = prestadores.ler().find((prestador) => prestador.codigoAcesso.toUpperCase() === alvo);
  if (!encontrado || encontrado.senha !== senha || !encontrado.portalAtivo) return null;
  return encontrado;
}

/** Avisa o escritório quando um prestador envia o fechamento pelo portal. */
export function avisarFechamentoRecebido(prestadorId: string, competencia: string, quantidade: number, total: number) {
  const nome = prestadores.ler().find((prestador) => prestador.id === prestadorId)?.nome ?? "Prestador";
  notificar({
    tipo: "documento",
    titulo: `Fechamento de ${formatMonth(competencia).split(" ")[0]} recebido`,
    corpo: `${nome} enviou ${quantidade} recibo(s) (${formatBRL(total)}) para conferência.`,
    destino: "/prestadores/conferencia",
  });
}
