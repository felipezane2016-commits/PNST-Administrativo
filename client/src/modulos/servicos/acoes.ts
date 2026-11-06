import { apagarAnexo } from "@/_core/armazenamento/anexos";
import type { Usuario } from "@/_core/identidade/permissoes";
import { formatarData, gerarId } from "@/_core/tempo";
import { formatBRL, parseAmount, type ArquivoAnexo, type Receipt, type ReceiptDraft } from "@/lib/portal";
import { notificar } from "@/modulos/notificacoes/colecao";
import { registrar } from "@/modulos/prestadores/acoes";
import { prestadores } from "@/modulos/prestadores/colecoes";
import { servicos } from "./colecao";
import {
  podeAceitar,
  podeCancelarServico,
  podeConcluir,
  podeExcluirServico,
  podeIniciar,
  podeReencaminhar,
  podeSolicitarServico,
  proximoNumeroServico,
  validarConclusao,
  validarSolicitacao,
  type RascunhoConclusao,
  type RascunhoServico,
} from "./regras";
import type { Servico } from "./tipos";

/**
 * Passos do pedido de serviço. A equipe pede, cancela e reencaminha; o
 * prestador (no portal) aceita, recusa, executa e conclui. Cada passo fica no
 * histórico do pedido e quem pediu é avisado pelo sino do escritório.
 */

const agora = () => new Date().toISOString();
const achar = (id: string) => servicos.ler().find((s) => s.id === id) ?? null;
const nomeDoPrestador = (id: string) => prestadores.ler().find((p) => p.id === id)?.nome ?? "prestador";
export const rotuloDoServico = (s: Pick<Servico, "numero" | "categoria" | "cliente">) => `${s.numero} · ${s.categoria} · ${s.cliente}`;

function alterar(id: string, autor: string, texto: string, mudar: (s: Servico) => Partial<Servico>) {
  servicos.atualizar((lista) => lista.map((s) => (s.id === id ? { ...s, ...mudar(s), historico: [...s.historico, { quando: agora(), autor, texto }] } : s)));
}

/** Aviso pessoal para quem pediu o serviço. */
function avisarSolicitante(s: Servico, tipo: "sucesso" | "atencao" | "informacao", titulo: string, corpo: string) {
  notificar({ tipo, titulo, corpo, destino: "/prestadores/servicos", exige: "prestadores.servicos.solicitar", paraId: s.solicitanteId });
}

// ── Escritório ────────────────────────────────────────────────────────────

export function solicitarServico(r: RascunhoServico, usuario: Usuario): { ok: true; servico: Servico } | { ok: false; erro: string } {
  if (!podeSolicitarServico(usuario)) return { ok: false, erro: "Você não tem permissão para solicitar serviços." };
  const erro = validarSolicitacao(r);
  if (erro) return { ok: false, erro };
  const quando = agora();
  const detalhes = Object.fromEntries(Object.entries(r.detalhes).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v));
  const novo: Servico = {
    id: gerarId("sv"),
    numero: proximoNumeroServico(servicos.ler()),
    categoria: r.categoria,
    prestadorId: r.prestadorId,
    solicitanteId: usuario.id,
    solicitante: usuario.nome,
    cliente: r.cliente.trim(),
    descricao: r.descricao.trim(),
    data: r.data,
    horario: r.horario,
    urgente: r.urgente,
    detalhes,
    situacao: "Solicitado",
    criadoEm: quando,
    aceitoEm: null,
    iniciadoEm: null,
    concluidoEm: null,
    motivoRecusa: "",
    motivoCancelamento: "",
    recusadoPor: [],
    execucao: null,
    reciboId: null,
    historico: [{ quando, autor: usuario.nome, texto: `Serviço solicitado${r.urgente ? " (urgente)" : ""} a ${nomeDoPrestador(r.prestadorId)}.` }],
  };
  servicos.atualizar((lista) => [novo, ...lista]);
  registrar(r.prestadorId, "criacao", `Serviço solicitado: ${r.categoria}`, usuario.nome, `${novo.cliente} — ${formatarData(novo.data)}`);
  return { ok: true, servico: novo };
}

export function cancelarServico(id: string, motivo: string, usuario: Usuario): string | null {
  const s = achar(id);
  if (!s || !podeCancelarServico(usuario, s)) return "Este serviço não pode ser cancelado por você.";
  if (!motivo.trim()) return "Diga por que o serviço foi cancelado.";
  alterar(id, usuario.nome, `Serviço cancelado: ${motivo.trim()}`, () => ({ situacao: "Cancelado", motivoCancelamento: motivo.trim() }));
  return null;
}

/** Recusado → outro prestador da mesma categoria. */
export function reencaminharServico(id: string, prestadorId: string, usuario: Usuario): string | null {
  const s = achar(id);
  if (!s || !podeReencaminhar(usuario, s)) return "Só se reencaminha um serviço recusado.";
  if (!prestadorId || prestadorId === s.prestadorId) return "Escolha outro prestador.";
  alterar(id, usuario.nome, `Reencaminhado a ${nomeDoPrestador(prestadorId)}.`, () => ({ situacao: "Solicitado", prestadorId, motivoRecusa: "", aceitoEm: null }));
  registrar(prestadorId, "criacao", `Serviço solicitado: ${s.categoria}`, usuario.nome, `${s.cliente} — ${formatarData(s.data)}`);
  return null;
}

export function excluirServico(id: string, usuario: Usuario): string | null {
  const s = achar(id);
  if (!s || !podeExcluirServico(usuario, s)) return "Só se exclui serviço cancelado ou recusado.";
  servicos.atualizar((lista) => lista.filter((item) => item.id !== id));
  return null;
}

// ── Portal do prestador ───────────────────────────────────────────────────

/** O serviço é deste prestador? O portal só mexe nos próprios. */
const doPrestador = (s: Servico | null, prestadorId: string): s is Servico => Boolean(s && s.prestadorId === prestadorId);

export function aceitarServico(id: string, prestadorId: string, autor: string): string | null {
  const s = achar(id);
  if (!doPrestador(s, prestadorId) || !podeAceitar(s)) return "Este pedido não está mais aguardando resposta.";
  alterar(id, autor, "Serviço aceito.", () => ({ situacao: "Aceito", aceitoEm: agora() }));
  avisarSolicitante(s, "sucesso", `${s.numero} aceito`, `${autor} aceitou o serviço de ${s.categoria} para ${s.cliente}.`);
  return null;
}

export function recusarServico(id: string, prestadorId: string, motivo: string, autor: string): string | null {
  const s = achar(id);
  if (!doPrestador(s, prestadorId) || !podeAceitar(s)) return "Este pedido não está mais aguardando resposta.";
  if (!motivo.trim()) return "Diga por que não vai atender, para o escritório escolher outro prestador.";
  alterar(id, autor, `Serviço recusado: ${motivo.trim()}`, (atual) => ({
    situacao: "Recusado",
    motivoRecusa: motivo.trim(),
    recusadoPor: Array.from(new Set([...(atual.recusadoPor ?? []), prestadorId])),
  }));
  avisarSolicitante(s, "atencao", `${s.numero} recusado`, `${autor} não pode atender (${motivo.trim()}). Reencaminhe a outro prestador.`);
  return null;
}

export function iniciarServico(id: string, prestadorId: string, autor: string): string | null {
  const s = achar(id);
  if (!doPrestador(s, prestadorId) || !podeIniciar(s)) return "Aceite o serviço antes de iniciar.";
  alterar(id, autor, "Execução iniciada.", () => ({ situacao: "Em execução", iniciadoEm: agora() }));
  avisarSolicitante(s, "informacao", `${s.numero} em execução`, `${autor} está executando o serviço para ${s.cliente}.`);
  return null;
}

/** Rascunho do recibo que nasce do serviço concluído. */
export function reciboDoServico(s: Servico, conclusao: RascunhoConclusao, comprovantes: ArquivoAnexo[]): ReceiptDraft {
  return {
    serviceDate: conclusao.data,
    category: s.categoria,
    client: s.cliente,
    caseRef: "",
    requester: s.solicitante,
    description: conclusao.observacao.trim() ? `${s.descricao} — ${conclusao.observacao.trim()}` : s.descricao,
    amount: conclusao.valor,
    anexos: comprovantes,
  };
}

/**
 * Conclui: grava a execução, cria o recibo (pendente de envio, já com o
 * comprovante) pelo `criarRecibo` do portal e liga um ao outro.
 */
export function concluirServico(
  id: string,
  prestadorId: string,
  conclusao: RascunhoConclusao,
  comprovantes: ArquivoAnexo[],
  autor: string,
  criarRecibo: (draft: ReceiptDraft, extras: { servicoId: string }) => Receipt,
): { ok: true; recibo: Receipt } | { ok: false; erro: string } {
  const s = achar(id);
  if (!doPrestador(s, prestadorId) || !podeConcluir(s)) return { ok: false, erro: "Este serviço não está em andamento." };
  const erro = validarConclusao(conclusao);
  if (erro) return { ok: false, erro };
  const valor = parseAmount(conclusao.valor);
  const recibo = criarRecibo(reciboDoServico(s, conclusao, comprovantes), { servicoId: s.id });
  alterar(id, autor, `Serviço concluído — ${formatBRL(valor)}. Recibo ${recibo.id} gerado.`, () => ({
    situacao: "Concluído",
    concluidoEm: agora(),
    execucao: { valor, data: conclusao.data, observacao: conclusao.observacao.trim(), comprovantes },
    reciboId: recibo.id,
  }));
  avisarSolicitante(s, "sucesso", `${s.numero} concluído`, `${autor} concluiu o serviço para ${s.cliente} (${formatBRL(valor)}).`);
  return { ok: true, recibo };
}

/** Comprovantes enviados e abandonados (modal fechado sem concluir). */
export async function descartarComprovantes(arquivos: ArquivoAnexo[]) {
  await Promise.all(arquivos.filter((a) => a.id).map((a) => apagarAnexo(a.id!).catch(() => undefined)));
}
