/**
 * Portal do Prestador — regras de domínio do protótipo.
 *
 * Todas as funções aqui são puras: são a fonte da verdade do comportamento do
 * protótipo e são cobertas pelos testes em `server/portal.test.ts` e
 * `server/portal.rules.test.ts`.
 */

export type PrototypeReceiptStatus =
  | "Rascunho"
  | "Enviado"
  | "Aprovado"
  | "Rejeitado";

export const RECEIPT_STATUSES: PrototypeReceiptStatus[] = [
  "Rascunho",
  "Enviado",
  "Aprovado",
  "Rejeitado",
];

/**
 * Classe de selo do design system para cada status. Segue o significado do
 * modelo: neutro é rascunho, azul é em andamento, verde é aprovado e vermelho é
 * bloqueado — nunca a cor sozinha, o selo sempre leva o nome do status.
 */
export const STATUS_CLASS: Record<PrototypeReceiptStatus, string> = {
  Rascunho: "status-neutral",
  Enviado: "status-blue",
  Aprovado: "status-green",
  Rejeitado: "status-red",
};

export const RECEIPT_CATEGORIES = [
  "Diligência",
  "Honorários",
  "Custas",
  "Transporte",
  "Postagem",
  "Cartório",
  "Outros",
] as const;

export type ReceiptCategory = (typeof RECEIPT_CATEGORIES)[number];

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
  attachmentName: string | null;
  /** Arquivo guardado (Storage no modo real; navegador na demonstração). Recibos antigos só têm o nome. */
  attachmentId?: string | null;
  /** Devolutiva do escritório — preenchida quando o recibo é rejeitado. */
  reviewNote: string | null;
  createdAt: string;
};

/** Andamento do fechamento do lado do escritório, depois do envio. */
export type ClosingReview = "Aguardando conferência" | "Conferido" | "Pago";

export type Closing = {
  prestadorId: string;
  competencia: string;
  documentName: string | null;
  /** Arquivo do documento de faturamento, guardado como os anexos dos recibos. */
  documentId?: string | null;
  submitted: boolean;
  submittedAt: string | null;
  /** null enquanto o prestador não envia; o escritório avança daí em diante. */
  review: ClosingReview | null;
  /** Dia em que o escritório pagou o lote; alimenta o razão da conciliação. */
  paidAt?: string | null;
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
  attachmentName: string | null;
  attachmentId: string | null;
};

export function formatBRL(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
    .format(value)
    .replace(/ /g, " ");
}

export function formatMonth(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(new Date(`${value}-01T12:00:00`));
}

export function calculateClosingProgress(
  statuses: PrototypeReceiptStatus[],
  documentAttached: boolean,
  submitted: boolean
) {
  const receiptStep = statuses.length > 0;
  const reviewStep = statuses.some(status => status === "Aprovado");
  const documentStep = documentAttached;
  const sentStep = submitted;
  return Math.min(
    100,
    Math.round(
      ([receiptStep, reviewStep, documentStep, sentStep].filter(Boolean)
        .length /
        4) *
        100
    )
  );
}

export function receiptsIncludedInClosing(statuses: PrototypeReceiptStatus[]) {
  return statuses.filter(status => status !== "Rejeitado").length;
}

/** Etapas do fechamento, na mesma ordem usada por `calculateClosingProgress`. */
export const CLOSING_STEPS = [
  "Recibos lançados",
  "Revisão aprovada",
  "Documento anexado",
  "Enviado ao escritório",
] as const;

/**
 * Quais das quatro etapas do fechamento já foram concluídas. Espelha a ordem de
 * `CLOSING_STEPS` e os mesmos critérios de `calculateClosingProgress`.
 */
export function closingSteps(
  statuses: PrototypeReceiptStatus[],
  documentAttached: boolean,
  submitted: boolean
) {
  return [
    statuses.length > 0,
    statuses.some(status => status === "Aprovado"),
    documentAttached,
    submitted,
  ];
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

export type ReceiptSummary = {
  count: number;
  gross: number;
  draftAmount: number;
  sentAmount: number;
  approvedAmount: number;
  rejectedAmount: number;
  byStatus: Record<PrototypeReceiptStatus, number>;
};

export function summarizeReceipts(receipts: Receipt[]): ReceiptSummary {
  const byStatus: Record<PrototypeReceiptStatus, number> = {
    Rascunho: 0,
    Enviado: 0,
    Aprovado: 0,
    Rejeitado: 0,
  };
  const totals: Record<PrototypeReceiptStatus, number> = {
    Rascunho: 0,
    Enviado: 0,
    Aprovado: 0,
    Rejeitado: 0,
  };

  for (const receipt of receipts) {
    byStatus[receipt.status] += 1;
    totals[receipt.status] += receipt.amount;
  }

  return {
    count: receipts.length,
    gross: receipts.reduce((total, receipt) => total + receipt.amount, 0),
    draftAmount: totals.Rascunho,
    sentAmount: totals.Enviado,
    approvedAmount: totals.Aprovado,
    rejectedAmount: totals.Rejeitado,
    byStatus,
  };
}

/** Valor que entra no fechamento: tudo que não foi rejeitado. */
export function closingTotal(receipts: Receipt[]) {
  return receipts
    .filter(receipt => receipt.status !== "Rejeitado")
    .reduce((total, receipt) => total + receipt.amount, 0);
}

export function receiptsOfCompetencia(
  receipts: Receipt[],
  competencia: string
) {
  return receipts.filter(receipt => receipt.competencia === competencia);
}

/** Competências com recibos, da mais recente para a mais antiga. */
export function listCompetencias(receipts: Receipt[]) {
  return Array.from(new Set(receipts.map(receipt => receipt.competencia)))
    .sort()
    .reverse();
}

export function filterReceipts(
  receipts: Receipt[],
  search: string,
  status: PrototypeReceiptStatus | "Todos"
) {
  const term = search.trim().toLowerCase();
  return receipts.filter(receipt => {
    if (status !== "Todos" && receipt.status !== status) return false;
    if (!term) return true;
    return [
      receipt.id,
      receipt.client,
      receipt.caseRef,
      receipt.description,
      receipt.category,
    ]
      .join(" ")
      .toLowerCase()
      .includes(term);
  });
}

/** Um recibo só pode ser editado pelo prestador enquanto não estiver aprovado. */
/**
 * Recibo ainda mexível: não aprovado e com o mês ainda aberto no escritório
 * (lote conferido ou pago não muda mais — nem pelo prestador, nem pelo escritório).
 */
export function canEditReceipt(receipt: Receipt, closing?: Closing | null) {
  return receipt.status !== "Aprovado" && !lotClosed(closing);
}

/** O prestador remove nas mesmas condições em que edita. */
export const canRemoveReceipt = canEditReceipt;

/** Lote conferido ou pago: os recibos dele ficam congelados. */
export function lotClosed(closing?: Closing | null) {
  return closing?.review === "Conferido" || closing?.review === "Pago";
}

/**
 * O fechamento só pode ser enviado com pelo menos um recibo aproveitável e o
 * documento de faturamento anexado.
 */
export function canSubmitClosing(
  receipts: Receipt[],
  documentAttached: boolean,
  submitted: boolean
) {
  if (submitted) return false;
  if (!documentAttached) return false;
  return receiptsIncludedInClosing(receipts.map(receipt => receipt.status)) > 0;
}

export type ValidationErrors = Partial<Record<keyof ReceiptDraft, string>>;

/** Converte o valor digitado (`1.280,50` ou `1280.50`) em número. */
export function parseAmount(value: string) {
  const normalized = value.trim().replace(/\./g, "").replace(",", ".");
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
