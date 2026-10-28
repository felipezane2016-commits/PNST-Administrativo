import { pode, type Papel, type Usuario } from "@/_core/identidade/permissoes";
import type { Contrapartida } from "@/modulos/conciliacao/tipos";
import type { CategoriaPagamento, ConfigAprovacao, Fornecedor, Pagamento, StatusPagamento } from "./tipos";

/**
 * Regras puras da aprovação de pagamentos. A segregação de funções é a
 * espinha: quem pede não confere, quem confere não aprova, quem aprova não
 * paga. Cada `pode…` devolve o motivo quando a resposta é não.
 */

export type Resposta = { ok: true } | { ok: false; motivo: string };
const sim: Resposta = { ok: true };
const nao = (motivo: string): Resposta => ({ ok: false, motivo });

/** Financeiro: confere, paga ou vê todos os pedidos (permissões de Pagamentos). */
export function ehFinanceiro(usuario: Usuario | null) {
  return pode(usuario, "pagamentos.ver_todos") || pode(usuario, "pagamentos.conferir") || pode(usuario, "pagamentos.pagar");
}

/** O substituto aprova só dentro do período; fora dele, o titular. */
export function aprovadorVigente(config: ConfigAprovacao, hoje: string) {
  const { substitutoId, substitutoDe, substitutoAte } = config;
  if (substitutoId && substitutoDe && substitutoAte && hoje >= substitutoDe && hoje <= substitutoAte) return substitutoId;
  return config.aprovadorId;
}

export function podeConferir(usuario: Usuario | null, pagamento: Pagamento): Resposta {
  if (pagamento.status !== "Em conferência") return nao("Só se confere o que está em conferência.");
  if (!pode(usuario, "pagamentos.conferir")) return nao("Você não tem permissão para conferir pagamentos.");
  if (usuario!.id === pagamento.solicitanteId) return nao("Quem pediu o pagamento não confere o próprio pedido.");
  return sim;
}

// ── Hierarquia da aprovação ─────────────────────────────────────────────────
//
// O pedido é aprovado um nível acima de quem pediu: operador ou leitor →
// gestor (ou administrador); gestor → administrador; administrador → chefe da
// administração (ou o substituto no período). O chefe vigente aprova qualquer
// nível. Quem pediu ou conferiu nunca aprova. Espelha o banco (pode_aprovar_pagamento).

export const NIVEL_DO_PAPEL: Record<Papel, number> = { viewer: 1, operador: 1, gestor: 2, admin: 3 };

export type Alcada = "gestor" | "admin" | "chefe";

export const ROTULO_ALCADA: Record<Alcada, string> = {
  gestor: "um gestor ou administrador",
  admin: "um administrador",
  chefe: "o chefe da administração",
};

/** Quem precisa aprovar, pelo papel de quem pediu (pessoa desconhecida conta como operador). */
export function alcadaDoPedido(pagamento: Pick<Pagamento, "solicitanteId">, pessoas: Usuario[]): Alcada {
  const solicitante = pessoas.find((pessoa) => pessoa.id === pagamento.solicitanteId);
  const nivel = solicitante ? NIVEL_DO_PAPEL[solicitante.papel] : 1;
  return nivel <= 1 ? "gestor" : nivel === 2 ? "admin" : "chefe";
}

/** Texto de quem aprova este pedido, para as telas. */
export function quemAprova(pagamento: Pick<Pagamento, "solicitanteId">, pessoas: Usuario[], config: ConfigAprovacao, hoje: string) {
  const alcada = alcadaDoPedido(pagamento, pessoas);
  if (alcada !== "chefe") return ROTULO_ALCADA[alcada];
  const chefe = pessoas.find((pessoa) => pessoa.id === aprovadorVigente(config, hoje));
  return chefe ? `${chefe.nome} (chefe da administração)` : ROTULO_ALCADA.chefe;
}

export function podeAprovar(usuario: Usuario | null, pagamento: Pagamento, config: ConfigAprovacao, hoje: string, pessoas: Usuario[]): Resposta {
  if (pagamento.status !== "Aguardando aprovação") return nao("Este pagamento não está aguardando aprovação.");
  if (!usuario) return nao("Entre para aprovar.");
  const alcada = alcadaDoPedido(pagamento, pessoas);
  if (usuario.id === pagamento.solicitanteId)
    return nao(`Você pediu este pagamento: a aprovação fica com ${alcada === "chefe" ? "o substituto do chefe da administração (configure em Regras de aprovação)" : ROTULO_ALCADA[alcada]}.`);
  if (usuario.id === pagamento.conferencia?.porId) return nao("Você conferiu este pagamento: a aprovação fica com outra pessoa.");
  const nivel = NIVEL_DO_PAPEL[usuario.papel];
  const naAlcada = usuario.id === aprovadorVigente(config, hoje) || (alcada === "gestor" && nivel >= 2) || (alcada === "admin" && nivel >= 3);
  if (!naAlcada) return nao(`A aprovação deste pedido é de ${ROTULO_ALCADA[alcada]}.`);
  if (!pode(usuario, "pagamentos.aprovar")) return nao("Você não tem permissão para aprovar pagamentos.");
  return sim;
}

export function podePagar(usuario: Usuario | null, pagamento: Pagamento): Resposta {
  if (pagamento.status !== "Aprovado") return nao("Só se paga o que foi aprovado.");
  if (!pode(usuario, "pagamentos.pagar")) return nao("Você não tem permissão para registrar pagamentos.");
  if (usuario!.id === pagamento.aprovacao?.porId) return nao("Quem aprovou não executa o pagamento.");
  return sim;
}

/** Excluir de vez: quem tem a permissão, e nunca o que já foi pago (está no razão). */
export function podeExcluirPagamento(usuario: Usuario | null, pagamento: Pagamento): Resposta {
  if (pagamento.status === "Pago") return nao("Pedido já pago: fica no histórico e no razão da conciliação, não pode ser excluído.");
  if (!pode(usuario, "pagamentos.excluir")) return nao("Você não tem permissão para excluir pedidos de pagamento.");
  return sim;
}

/** O pedido volta para quem pediu quando devolvido; cancela-se o que ainda não foi pago. */
export function podeCorrigir(usuario: Usuario | null, pagamento: Pagamento) {
  return Boolean(usuario && pagamento.status === "Devolvido" && (usuario.id === pagamento.solicitanteId || ehFinanceiro(usuario)));
}

export function podeCancelar(usuario: Usuario | null, pagamento: Pagamento) {
  const aberto: StatusPagamento[] = ["Em conferência", "Devolvido", "Aguardando aprovação", "Aprovado"];
  return Boolean(usuario && aberto.includes(pagamento.status) && (usuario.id === pagamento.solicitanteId || ehFinanceiro(usuario)));
}

/**
 * Financeiro e chefe da administração veem tudo. Os demais veem os próprios
 * pedidos, os que aguardam a aprovação deles e os que eles já decidiram.
 */
export function visiveisPara(usuario: Usuario | null, pagamentos: Pagamento[], config: ConfigAprovacao, hoje: string, pessoas: Usuario[]) {
  if (!usuario) return [];
  if (pode(usuario, "pagamentos.ver_todos") || usuario.id === aprovadorVigente(config, hoje) || usuario.id === config.aprovadorId) return pagamentos;
  return pagamentos.filter(
    (pagamento) =>
      pagamento.solicitanteId === usuario.id ||
      pagamento.decisao?.porId === usuario.id ||
      pagamento.aprovacao?.porId === usuario.id ||
      podeAprovar(usuario, pagamento, config, hoje, pessoas).ok,
  );
}

// ── Validação do pedido ────────────────────────────────────────────────────

export type ErrosPedido = Partial<Record<"favorecido" | "descricao" | "valor" | "vencimento" | "dadosPagamento" | "documentos" | "justificativa" | "cliente", string>>;

export function validarPedido(pedido: Pick<Pagamento, "favorecido" | "descricao" | "valor" | "vencimento" | "forma" | "dadosPagamento" | "documentos" | "urgente" | "justificativaUrgencia" | "reembolsavel" | "cliente">, hoje: string): ErrosPedido {
  const erros: ErrosPedido = {};
  if (!pedido.favorecido.trim()) erros.favorecido = "Informe quem recebe.";
  if (!pedido.descricao.trim()) erros.descricao = "Descreva o que está sendo pago.";
  if (!(pedido.valor > 0)) erros.valor = "Informe o valor.";
  if (!pedido.vencimento) erros.vencimento = "Informe o vencimento.";
  else if (pedido.vencimento < hoje && !pedido.urgente) erros.vencimento = "Vencimento no passado: marque como urgente e justifique.";
  if (pedido.forma !== "Débito automático" && !pedido.dadosPagamento.trim())
    erros.dadosPagamento = pedido.forma === "Boleto" ? "Informe a linha digitável." : pedido.forma === "Pix" ? "Informe a chave Pix." : "Informe banco, agência e conta.";
  if (pedido.forma === "Boleto" && pedido.dadosPagamento.trim() && pedido.dadosPagamento.replace(/\D/g, "").length < 44)
    erros.dadosPagamento = "Linha digitável com 47 ou 48 dígitos.";
  if (pedido.documentos.length === 0) erros.documentos = "Anexe a nota, o boleto ou o recibo: sem documento o pagamento não segue.";
  if (pedido.urgente && !pedido.justificativaUrgencia.trim()) erros.justificativa = "Diga por que é urgente.";
  if (pedido.reembolsavel && !pedido.cliente.trim()) erros.cliente = "Reembolsável precisa do cliente.";
  return erros;
}

// ── Prazos e alertas ───────────────────────────────────────────────────────

export function diasAte(data: string, hoje: string) {
  return Math.round((Date.parse(`${data}T12:00:00Z`) - Date.parse(`${hoje}T12:00:00Z`)) / 86_400_000);
}

const EM_ABERTO: StatusPagamento[] = ["Em conferência", "Devolvido", "Aguardando aprovação", "Aprovado"];

export type AlertaPagamento = { pagamentoId: string; tom: "red" | "amber"; texto: string };

/** Vencido sem pagamento; vence em até 2 dias e ainda falta etapa; fornecedor com dados bancários a validar. */
export function alertasDePagamentos(pagamentos: Pagamento[], fornecedores: Fornecedor[], hoje: string): AlertaPagamento[] {
  const alertas: AlertaPagamento[] = [];
  for (const pagamento of pagamentos) {
    if (!EM_ABERTO.includes(pagamento.status)) continue;
    const dias = diasAte(pagamento.vencimento, hoje);
    const quem = `${pagamento.numero} · ${pagamento.favorecido}`;
    if (dias < 0) alertas.push({ pagamentoId: pagamento.id, tom: "red", texto: `Vencido há ${-dias} dia(s) e não pago: ${quem} (${pagamento.status.toLowerCase()}).` });
    else if (dias <= 2) alertas.push({ pagamentoId: pagamento.id, tom: "amber", texto: `Vence ${dias === 0 ? "hoje" : dias === 1 ? "amanhã" : "em 2 dias"}: ${quem} (${pagamento.status.toLowerCase()}).` });
    const fornecedor = fornecedores.find((item) => item.id === pagamento.fornecedorId);
    if (fornecedor && !fornecedor.dadosValidados && pagamento.status !== "Devolvido")
      alertas.push({ pagamentoId: pagamento.id, tom: "red", texto: `Dados bancários de ${fornecedor.nome} mudaram e não foram validados: ${pagamento.numero}.` });
  }
  return alertas.sort((a, b) => (a.tom === b.tom ? 0 : a.tom === "red" ? -1 : 1));
}

export function proximoNumero(pagamentos: Pagamento[]) {
  const maior = pagamentos.reduce((max, pagamento) => Math.max(max, Number(pagamento.numero.replace(/\D/g, "")) || 0), 0);
  return `PG-${String(maior + 1).padStart(4, "0")}`;
}

/** A conta do razão que recebe a outra perna do pagamento. */
export function contrapartidaDa(categoria: CategoriaPagamento): Contrapartida {
  const mapa: Partial<Record<CategoriaPagamento, Contrapartida>> = {
    "Correspondentes e prestadores": "Fornecedores — prestadores",
    "Aluguel e condomínio": "Aluguéis",
    "Energia e telefonia": "Energia e telefonia",
    "Impostos e taxas": "Impostos e contribuições",
    "Folha e benefícios": "Folha de pagamento",
  };
  return mapa[categoria] ?? "Outras despesas";
}

/** Muda banco, agência, conta ou Pix? Então os dados precisam ser validados de novo. */
export function dadosBancariosMudaram(antes: Fornecedor, depois: Fornecedor) {
  return antes.banco !== depois.banco || antes.agencia !== depois.agencia || antes.conta !== depois.conta || antes.chavePix !== depois.chavePix;
}

/** Totais por status, para os indicadores. */
export function totais(pagamentos: Pagamento[]) {
  const soma = (status: StatusPagamento) => pagamentos.filter((p) => p.status === status).reduce((total, p) => total + p.valor, 0);
  return {
    emConferencia: soma("Em conferência"),
    aguardandoAprovacao: soma("Aguardando aprovação"),
    aprovado: soma("Aprovado"),
    pago: soma("Pago"),
  };
}
