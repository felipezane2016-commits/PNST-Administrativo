import { describe, expect, it } from "vitest";
import {
  canEditReceipt,
  officeCanChangeReceipt,
  type Closing,
  canSubmitClosing,
  closingSteps,
  closingTotal,
  competenciaOf,
  filterReceipts,
  formatDate,
  listCompetencias,
  nextReceiptId,
  parseAmount,
  receiptsOfCompetencia,
  summarizeReceipts,
  validateReceiptDraft,
  type PrototypeReceiptStatus,
  type Receipt,
  type ReceiptDraft,
} from "../client/src/lib/portal";
import { DEMO_RECEIPTS } from "../client/src/lib/portalSeed";

function receipt(
  id: string,
  status: PrototypeReceiptStatus,
  amount: number,
  competencia = "2026-06"
): Receipt {
  return {
    id,
    prestadorId: "prest-teste",
    competencia,
    serviceDate: `${competencia}-10`,
    category: "Diligência",
    client: "Cliente Exemplo",
    caseRef: "0001",
    requester: "Dra. Exemplo",
    description: "Serviço de exemplo",
    amount,
    status,
    attachmentName: null,
    reviewNote: null,
    createdAt: `${competencia}-10T12:00:00.000Z`,
  };
}

const draft: ReceiptDraft = {
  serviceDate: "2026-06-12",
  category: "Diligência",
  client: "Vertti",
  caseRef: "0001",
  requester: "Dra. Helena",
  description: "Retirada de carta de sentença",
  amount: "480,00",
  attachmentName: null,
};

describe("Competências e identificadores", () => {
  it("deriva a competência da data do serviço", () => {
    expect(competenciaOf("2026-06-18")).toBe("2026-06");
  });

  it("formata a data do serviço no padrão brasileiro", () => {
    expect(formatDate("2026-06-18")).toBe("18/06/2026");
  });

  it("gera o próximo identificador sequencial com zeros à esquerda", () => {
    expect(nextReceiptId([])).toBe("REC-0001");
    expect(
      nextReceiptId([
        receipt("REC-0148", "Rascunho", 10),
        receipt("REC-0009", "Enviado", 10),
      ])
    ).toBe("REC-0149");
  });

  it("lista as competências da mais recente para a mais antiga", () => {
    expect(listCompetencias(DEMO_RECEIPTS)).toEqual(["2026-06", "2026-05"]);
  });

  it("filtra os recibos de uma competência", () => {
    expect(
      receiptsOfCompetencia(DEMO_RECEIPTS, "2026-05").map(item => item.id)
    ).toEqual(["REC-0141", "REC-0139"]);
  });
});

describe("Totais do fechamento", () => {
  const receipts = [
    receipt("REC-0001", "Aprovado", 1000),
    receipt("REC-0002", "Enviado", 250.5),
    receipt("REC-0003", "Rascunho", 100),
    receipt("REC-0004", "Rejeitado", 900),
  ];

  it("soma apenas os recibos que não foram rejeitados", () => {
    expect(closingTotal(receipts)).toBe(1350.5);
  });

  it("resume os valores por status", () => {
    const summary = summarizeReceipts(receipts);
    expect(summary.count).toBe(4);
    expect(summary.gross).toBe(2250.5);
    expect(summary.approvedAmount).toBe(1000);
    expect(summary.sentAmount).toBe(250.5);
    expect(summary.draftAmount).toBe(100);
    expect(summary.rejectedAmount).toBe(900);
    expect(summary.byStatus).toEqual({
      Rascunho: 1,
      Enviado: 1,
      Aprovado: 1,
      Rejeitado: 1,
    });
  });

  it("marca as etapas concluídas na ordem do progresso", () => {
    expect(closingSteps(["Rascunho"], false, false)).toEqual([
      true,
      false,
      false,
      false,
    ]);
    expect(closingSteps(["Aprovado", "Enviado"], true, false)).toEqual([
      true,
      true,
      true,
      false,
    ]);
    expect(closingSteps(["Aprovado"], true, true)).toEqual([
      true,
      true,
      true,
      true,
    ]);
  });
});

describe("Regras de envio", () => {
  it("o prestador edita até o mês ser conferido; o escritório, até ser pago", () => {
    const fechamento = (review: Closing["review"]): Closing => ({ prestadorId: "p", competencia: "2026-10", documentName: null, submitted: true, submittedAt: null, review });
    expect(canEditReceipt(receipt("REC-0001", "Aprovado", 10))).toBe(true);
    expect(canEditReceipt(receipt("REC-0002", "Rejeitado", 10), fechamento("Aguardando conferência"))).toBe(true);
    expect(canEditReceipt(receipt("REC-0003", "Rascunho", 10), fechamento("Conferido"))).toBe(false);
    expect(officeCanChangeReceipt(fechamento("Conferido"))).toBe(true);
    expect(officeCanChangeReceipt(fechamento("Pago"))).toBe(false);
  });

  it("exige documento e ao menos um recibo aproveitável para enviar o fechamento", () => {
    const valid = [receipt("REC-0001", "Aprovado", 10)];
    expect(canSubmitClosing(valid, false, false)).toBe(false);
    expect(canSubmitClosing([], true, false)).toBe(false);
    expect(
      canSubmitClosing([receipt("REC-0002", "Rejeitado", 10)], true, false)
    ).toBe(false);
    expect(canSubmitClosing(valid, true, false)).toBe(true);
  });

  it("não permite reenviar um fechamento já enviado", () => {
    expect(
      canSubmitClosing([receipt("REC-0001", "Aprovado", 10)], true, true)
    ).toBe(false);
  });
});

describe("Formulário de recibo", () => {
  it("interpreta valores digitados no padrão brasileiro e americano", () => {
    expect(parseAmount("1.280,50")).toBe(1280.5);
    expect(parseAmount("480")).toBe(480);
    expect(Number.isNaN(parseAmount("abc"))).toBe(true);
  });

  it("aceita um rascunho completo", () => {
    expect(validateReceiptDraft(draft)).toEqual({});
  });

  it("aponta os campos obrigatórios que faltam", () => {
    const errors = validateReceiptDraft({
      ...draft,
      client: "  ",
      description: "",
      amount: "0",
    });
    expect(Object.keys(errors).sort()).toEqual([
      "amount",
      "client",
      "description",
    ]);
  });
});

describe("Busca e filtro da lista", () => {
  it("filtra por status", () => {
    expect(
      filterReceipts(DEMO_RECEIPTS, "", "Aprovado").map(item => item.id)
    ).toEqual(["REC-0146", "REC-0145", "REC-0141", "REC-0139"]);
  });

  it("busca por cliente, categoria, processo e número do recibo", () => {
    expect(
      filterReceipts(DEMO_RECEIPTS, "meridiano", "Todos").map(item => item.id)
    ).toEqual(["REC-0145", "REC-0141"]);
    expect(
      filterReceipts(DEMO_RECEIPTS, "cartório", "Todos").map(item => item.id)
    ).toEqual(["REC-0147"]);
    expect(
      filterReceipts(DEMO_RECEIPTS, "rec-0144", "Todos").map(item => item.id)
    ).toEqual(["REC-0144"]);
  });

  it("combina busca e status", () => {
    expect(
      filterReceipts(DEMO_RECEIPTS, "vertti", "Rascunho").map(item => item.id)
    ).toEqual(["REC-0148"]);
  });
});
