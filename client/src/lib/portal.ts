/**
 * Portal do Prestador — regras de domínio dos recibos.
 *
 * Funções puras: são a fonte da verdade do comportamento do portal e da
 * conferência, cobertas pelos testes em `server/portal*.test.ts`. O fluxo segue
 * o sistema de referência do escritório: o prestador lança, marca como pronto e
 * envia o mês inteiro para conferência; o escritório finaliza (aprova), rejeita
 * ou pede ajuste do lote e depois registra o pagamento.
 */

export type PrototypeReceiptStatus =
  | "Rascunho"
  | "Pendente de envio"
  | "Enviado"
  | "Em análise"
  | "Ajuste solicitado"
  | "Aprovado"
  | "Pago"
  | "Rejeitado"
  | "Arquivado";

export const RECEIPT_STATUSES: PrototypeReceiptStatus[] = [
  "Rascunho",
  "Pendente de envio",
  "Enviado",
  "Em análise",
  "Ajuste solicitado",
  "Aprovado",
  "Pago",
  "Rejeitado",
  "Arquivado",
];

/**
 * Classe de selo do design system para cada status: neutro é rascunho, âmbar
 * pede ação do prestador, azul está com o escritório, verde foi aceito e
 * vermelho foi recusado. O selo sempre leva o nome — nunca a cor sozinha.
 */
export const STATUS_CLASS: Record<PrototypeReceiptStatus, string> = {
  Rascunho: "status-neutral",
  "Pendente de envio": "status-amber",
  Enviado: "status-blue",
  "Em análise": "status-blue",
  "Ajuste solicitado": "status-amber",
  Aprovado: "status-green",
  Pago: "status-green",
  Rejeitado: "status-red",
  Arquivado: "status-neutral",
};

/** Categorias do formulário do portal (as mesmas do cadastro de prestadores). */
export const RECEIPT_CATEGORIES = ["Motoboy", "Cartório", "Correio", "SAESP", "Outros"] as const;

/** Recibos antigos podem ter categorias que saíram da lista; continuam válidos. */
export type ReceiptCategory = string;

/** Arquivo anexado (recibo ou fechamento). `id` null: recibo antigo, só com o nome. */
export type ArquivoAnexo = { id: string | null; nome: string; tipo?: string; tamanho?: number };

export type Receipt = {
  id: string;
  /** Dono do recibo. O portal mostra só os do prestador logado; o admin, todos. */
  prestadorId: string;
  /** Competência no formato `YYYY-MM`, derivada da data do serviço. */
  competencia: string;
  /** Data do serviço no formato `YYYY-MM-DD`. */
  serviceDate: string;
  category: ReceiptCategory;
  client: string;
  caseRef: string;
  requester: string;
  description: string;
  amount: number;
  status: PrototypeReceiptStatus;
  /** Documentos do recibo (NF, boleto, comprovante...). */
  anexos?: ArquivoAnexo[];
  /** Formato antigo (um arquivo só); `anexosDoRecibo` junta os dois. */
  attachmentName?: string | null;
  attachmentId?: string | null;
  /** Observação do escritório ao pedir ajuste ou rejeitar. */
  reviewNote: string | null;
  createdAt: string;
  updatedAt?: string;
};

/** Andamento do lote (fechamento enviado) do lado do escritório. */
export type ClosingReview = "Aguardando conferência" | "Em conferência" | "Conferido" | "Rejeitado" | "Pago";

/** Como cada situação do lote aparece na tela. */
export const ROTULO_LOTE: Record<ClosingReview, string> = {
  "Aguardando conferência": "Conferência pendente",
  "Em conferência": "Em conferência",
  Conferido: "Conferência finalizada",
  Rejeitado: "Rejeitado",
  Pago: "Pago",
};

/** Fechamento do mês: um por prestador e competência. Enviado, vira o lote da conferência. */
export type Closing = {
  prestadorId: string;
  competencia: string;
  submitted: boolean;
  submittedAt: string | null;
  /** null enquanto o prestador não envia; o escritório avança daí em diante. */
  review: ClosingReview | null;
  /** Recibos que foram no envio e o valor total na hora do envio. */
  reciboIds?: string[];
  valorTotal?: number;
  /** NF, fatura ou boleto do fechamento (opcionais, um ou vários). */
  documentos?: ArquivoAnexo[];
  /** Observação do escritório (ajuste ou rejeição). */
  obs?: string | null;
  /** Documento único gerado ao finalizar a conferência (recibos + comprovantes + NF). */
  documentoUnico?: ArquivoAnexo | null;
  conferidoEm?: string | null;
  /** Dia em que o escritório pagou o lote; alimenta o razão da conciliação. */
  paidAt?: string | null;
  /** Formato antigo (um documento só); `documentosDoFechamento` junta os dois. */
  documentName?: string | null;
  documentId?: string | null;
};

export type Provider = {
  name: string;
  code: string;
  document: string;
  email: string;
  contract: string;
};

/** Rascunho editável usado pelo formulário de recibo. */
export type ReceiptDraft = {
  serviceDate: string;
  category: ReceiptCategory;
  client: string;
  caseRef: string;
  requester: string;
  description: string;
  amount: string;
  anexos: ArquivoAnexo[];
};

/** Registro do histórico de atividades (quem fez o quê, quando). */
export type TipoRegistro = "criacao" | "edicao" | "status" | "upload" | "aprovacao" | "pagamento" | "exclusao" | "arquivo";

export type RegistroRecibo = {
  id: string;
  prestadorId: string;
  tipo: TipoRegistro;
  acao: string;
  reciboId: string | null;
  usuario: string;
  dataHora: string;
  detalhes: string;
  /** Arquivo gerado e guardado na pasta do prestador (relatório, documento único). */
  arquivo?: ArquivoAnexo & { competencia: string };
};

export const ROTULO_REGISTRO: Record<TipoRegistro, string> = {
  criacao: "Criação",
  edicao: "Edição",
  status: "Status",
  upload: "Upload",
  aprovacao: "Aprovação",
  pagamento: "Pagamento",
  exclusao: "Exclusão",
  arquivo: "Arquivo",
};

export function formatBRL(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
    .format(value)
    .replace(/\u00a0/g, " ");
}

export function formatMonth(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(new Date(`${value}-01T12:00:00`));
}

/** "Junho 2026", como no cabeçalho do fechamento. */
export function formatMonthTitle(value: string) {
  const texto = new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(new Date(`${value}-01T12:00:00`));
  return `${texto.charAt(0).toUpperCase()}${texto.slice(1)} ${value.slice(0, 4)}`;
}

/** Mês anterior ou seguinte de uma competência `YYYY-MM`. */
export function shiftMonth(competencia: string, delta: number) {
  const [ano, mes] = competencia.split("-").map(Number);
  const data = new Date(ano, mes - 1 + delta, 1);
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}`;
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR").format(new Date(`${value}T12:00:00`));
}

/** Competência (`YYYY-MM`) de uma data de serviço (`YYYY-MM-DD`). */
export function competenciaOf(serviceDate: string) {
  return serviceDate.slice(0, 7);
}

/** Próximo identificador sequencial, no formato `REC-0001`. */
export function nextReceiptId(receipts: Receipt[]) {
  const highest = receipts.reduce((max, receipt) => {
    const parsed = Number.parseInt(receipt.id.replace(/\D/g, ""), 10);
    return Number.isNaN(parsed) ? max : Math.max(max, parsed);
  }, 0);
  return `REC-${String(highest + 1).padStart(4, "0")}`;
}

/** Documentos do recibo, inclusive o do formato antigo (um arquivo só). */
export function anexosDoRecibo(receipt: Pick<Receipt, "anexos" | "attachmentName" | "attachmentId">): ArquivoAnexo[] {
  if (receipt.anexos) return receipt.anexos;
  return receipt.attachmentName ? [{ id: receipt.attachmentId ?? null, nome: receipt.attachmentName }] : [];
}

/** Documentos do fechamento, inclusive o do formato antigo. */
export function documentosDoFechamento(closing: Closing | null | undefined): ArquivoAnexo[] {
  if (!closing) return [];
  if (closing.documentos) return closing.documentos;
  return closing.documentName ? [{ id: closing.documentId ?? null, nome: closing.documentName }] : [];
}

/** Recusados e arquivados não entram no fechamento nem na soma. */
export function entraNoFechamento(receipt: Receipt) {
  return receipt.status !== "Rejeitado" && receipt.status !== "Arquivado";
}

/** Valor que entra no fechamento. */
export function closingTotal(receipts: Receipt[]) {
  return receipts.filter(entraNoFechamento).reduce((total, receipt) => total + receipt.amount, 0);
}

export function receiptsOfCompetencia(receipts: Receipt[], competencia: string) {
  return receipts.filter(receipt => receipt.competencia === competencia);
}

/** Competências com recibos, da mais recente para a mais antiga. */
export function listCompetencias(receipts: Receipt[]) {
  return Array.from(new Set(receipts.map(receipt => receipt.competencia)))
    .sort()
    .reverse();
}

export type FiltroRecibos = {
  busca?: string;
  status?: PrototypeReceiptStatus | "";
  categoria?: string;
  competencia?: string;
};

/** Filtros da lista "Meus recibos" (e do histórico): mais recentes primeiro. */
export function filterReceipts(receipts: Receipt[], filtro: FiltroRecibos) {
  const termo = (filtro.busca ?? "").trim().toLowerCase();
  return receipts
    .filter(receipt => !filtro.status || receipt.status === filtro.status)
    .filter(receipt => !filtro.categoria || receipt.category === filtro.categoria)
    .filter(receipt => !filtro.competencia || receipt.competencia === filtro.competencia)
    .filter(
      receipt =>
        !termo ||
        [receipt.id, receipt.client, receipt.description, receipt.category, receipt.caseRef]
          .join(" ")
          .toLowerCase()
          .includes(termo)
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

const soma = (receipts: Receipt[]) => receipts.reduce((total, receipt) => total + receipt.amount, 0);

/** Indicadores do painel do prestador (os nove da referência). */
export function portalKpis(receipts: Receipt[], mesAtual: string) {
  const doMes = receipts.filter(receipt => receipt.serviceDate.slice(0, 7) === mesAtual);
  const receitaMes = soma(doMes);
  return {
    recibosDoMes: doMes.length,
    receitaMes,
    receitaAprovada: soma(receipts.filter(receipt => receipt.status === "Aprovado" || receipt.status === "Pago")),
    receitaPendente: soma(
      receipts.filter(receipt => (["Rascunho", "Pendente de envio", "Enviado", "Em análise"] as PrototypeReceiptStatus[]).includes(receipt.status))
    ),
    ticketMedio: doMes.length ? receitaMes / doMes.length : 0,
    pendentesDeEnvio: receipts.filter(receipt => receipt.status === "Rascunho" || receipt.status === "Pendente de envio").length,
    ajustes: receipts.filter(receipt => receipt.status === "Ajuste solicitado").length,
    aprovados: receipts.filter(receipt => receipt.status === "Aprovado").length,
    pagos: receipts.filter(receipt => receipt.status === "Pago").length,
  };
}

/** Quantos recibos há em cada status (só os status que aparecem). */
export function statusDistribution(receipts: Receipt[]) {
  return RECEIPT_STATUSES.map(status => ({ status, quantidade: receipts.filter(receipt => receipt.status === status).length })).filter(
    linha => linha.quantidade > 0
  );
}

/**
 * O botão de envio da lista: rascunho vira "pronto" (pendente de envio); o que
 * o escritório devolveu para ajuste volta para a conferência.
 */
export function receiptSendAction(receipt: Receipt): { rotulo: string; status: PrototypeReceiptStatus } | null {
  if (receipt.status === "Rascunho") return { rotulo: "Marcar como pronto", status: "Pendente de envio" };
  if (receipt.status === "Ajuste solicitado") return { rotulo: "Reenviar para conferência", status: "Enviado" };
  return null;
}

/** Fechamento do mês já com o escritório (um rejeitado pode ser reenviado). */
export function closingSent(closing: Closing | null | undefined) {
  return Boolean(closing?.submitted && closing.review && closing.review !== "Rejeitado");
}

/** Recibos que vão no envio do fechamento do mês. */
export function receiptsForClosing(receipts: Receipt[], competencia: string) {
  return receiptsOfCompetencia(receipts, competencia).filter(entraNoFechamento);
}

/** Inconsistências do mês antes do envio (validação do fechamento). */
export function validateClosing(receipts: Receipt[]) {
  const erros: string[] = [];
  for (const receipt of receipts) {
    if (!receipt.client.trim()) erros.push(`Recibo ${receipt.id}: cliente vazio`);
    if (!(receipt.amount > 0)) erros.push(`Recibo ${receipt.id}: valor zerado`);
    if (!receipt.description.trim()) erros.push(`Recibo ${receipt.id}: descrição vazia`);
  }
  return erros;
}

export type ValidationErrors = Partial<Record<keyof ReceiptDraft, string>>;

/**
 * Máscara contábil do campo de valor: os dígitos digitados são centavos e o
 * campo mostra sempre "1.280,50" (milhar com ponto, duas casas com vírgula).
 */
export function maskAmount(digitado: string) {
  const digitos = digitado.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 13);
  if (!digitos) return "";
  return formatAmount(Number(digitos) / 100);
}

/** Valor no formato contábil, sem o símbolo: 1280.5 → "1.280,50". */
export function formatAmount(valor: number) {
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(valor);
}

/** Converte o valor digitado (`1.280,50` ou `1280.50`) em número. */
export function parseAmount(value: string) {
  const texto = value.trim();
  // "1280.50" (ponto decimal, sem vírgula) também vale.
  const normalized = /^\d+\.\d{1,2}$/.test(texto) ? texto : texto.replace(/\./g, "").replace(",", ".");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function validateReceiptDraft(draft: ReceiptDraft): ValidationErrors {
  const errors: ValidationErrors = {};
  if (!draft.serviceDate) errors.serviceDate = "Informe a data do serviço.";
  if (!draft.client.trim()) errors.client = "Informe o cliente.";
  if (!draft.description.trim())
    errors.description = "Descreva o serviço prestado.";
  const amount = parseAmount(draft.amount);
  if (Number.isNaN(amount) || amount <= 0)
    errors.amount = "Informe um valor maior que zero.";
  return errors;
}
