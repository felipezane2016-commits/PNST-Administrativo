import { describe, expect, it } from "vitest";
import {
  anexosDoRecibo,
  closingSent,
  type Closing,
  closingTotal,
  formatAmount,
  maskAmount,
  portalKpis,
  receiptSendAction,
  receiptsForClosing,
  shiftMonth,
  statusDistribution,
  validateClosing,
  competenciaOf,
  filterReceipts,
  formatDate,
  listCompetencias,
  nextReceiptId,
  parseAmount,
  receiptsOfCompetencia,
  validateReceiptDraft,
  type PrototypeReceiptStatus,
  type Receipt,
  type ReceiptDraft,
} from "../client/src/lib/portal";
import { DEMO_RECEIPTS } from "../client/src/lib/portalSeed";
import { pedacos } from "../client/src/lib/traducao";

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
    anexos: [],
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
  anexos: [],
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
    receipt("REC-0005", "Arquivado", 40),
  ];

  it("soma só o que entra no fechamento (sem rejeitados e arquivados)", () => {
    expect(closingTotal(receipts)).toBe(1350.5);
    expect(receiptsForClosing(receipts, "2026-06").map((item) => item.id)).toEqual(["REC-0001", "REC-0002", "REC-0003"]);
  });

  it("calcula os nove indicadores do painel do prestador", () => {
    const k = portalKpis(
      [
        receipt("A", "Rascunho", 100),
        receipt("B", "Pendente de envio", 50),
        receipt("C", "Ajuste solicitado", 30),
        receipt("D", "Aprovado", 200),
        receipt("E", "Pago", 300),
        receipt("F", "Enviado", 20, "2026-05"),
      ],
      "2026-06"
    );
    expect(k).toEqual({
      recibosDoMes: 5,
      receitaMes: 680,
      receitaAprovada: 500,
      receitaPendente: 170,
      ticketMedio: 136,
      pendentesDeEnvio: 2,
      ajustes: 1,
      aprovados: 1,
      pagos: 1,
    });
  });

  it("distribui por status só os que aparecem, na ordem do fluxo", () => {
    expect(statusDistribution(receipts)).toEqual([
      { status: "Rascunho", quantidade: 1 },
      { status: "Enviado", quantidade: 1 },
      { status: "Aprovado", quantidade: 1 },
      { status: "Rejeitado", quantidade: 1 },
      { status: "Arquivado", quantidade: 1 },
    ]);
  });
});

describe("Regras de envio", () => {
  const fechamento = (review: Closing["review"]): Closing => ({ prestadorId: "p", competencia: "2026-10", submitted: review !== null, submittedAt: null, review });

  it("rascunho fica pronto; ajuste solicitado volta para a conferência", () => {
    expect(receiptSendAction(receipt("A", "Rascunho", 10))?.status).toBe("Pendente de envio");
    expect(receiptSendAction(receipt("B", "Ajuste solicitado", 10))?.status).toBe("Enviado");
    expect(receiptSendAction(receipt("C", "Aprovado", 10))).toBeNull();
  });

  it("um mês enviado não é enviado de novo, a não ser que tenha sido rejeitado", () => {
    expect(closingSent(null)).toBe(false);
    expect(closingSent(fechamento("Aguardando conferência"))).toBe(true);
    expect(closingSent(fechamento("Pago"))).toBe(true);
    expect(closingSent(fechamento("Rejeitado"))).toBe(false);
  });

  it("aponta inconsistências antes do envio", () => {
    expect(validateClosing([{ ...receipt("A", "Rascunho", 0), client: "", description: "" }])).toEqual([
      "Recibo A: cliente vazio",
      "Recibo A: valor zerado",
      "Recibo A: descrição vazia",
    ]);
  });

  it("lê os documentos no formato antigo (um arquivo só) e no novo", () => {
    expect(anexosDoRecibo({ attachmentName: "nf.pdf", attachmentId: "x" })).toEqual([{ id: "x", nome: "nf.pdf" }]);
    expect(anexosDoRecibo({ anexos: [{ id: "a", nome: "a.pdf" }, { id: "b", nome: "b.xlsx" }] })).toHaveLength(2);
    expect(anexosDoRecibo({ attachmentName: null })).toEqual([]);
  });

  it("anda de mês para trás e para frente, virando o ano", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });
});

describe("Formulário de recibo", () => {
  it("interpreta valores digitados no padrão brasileiro e americano", () => {
    expect(parseAmount("1.280,50")).toBe(1280.5);
    expect(parseAmount("480")).toBe(480);
    expect(parseAmount("1280.50")).toBe(1280.5);
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
    expect(filterReceipts(DEMO_RECEIPTS, { status: "Pendente de envio" }).map((item) => item.id)).toEqual(["REC-0147", "REC-0146"]);
  });

  it("busca por cliente, categoria, processo e número do recibo", () => {
    expect(filterReceipts(DEMO_RECEIPTS, { busca: "meridiano" }).map((item) => item.id)).toEqual(["REC-0145", "REC-0141"]);
    expect(filterReceipts(DEMO_RECEIPTS, { busca: "cartório" }).map((item) => item.id)).toEqual(["REC-0147"]);
    expect(filterReceipts(DEMO_RECEIPTS, { busca: "rec-0144" }).map((item) => item.id)).toEqual(["REC-0144"]);
  });

  it("combina busca, status, categoria e mês", () => {
    expect(filterReceipts(DEMO_RECEIPTS, { busca: "vertti", status: "Rascunho" }).map((item) => item.id)).toEqual(["REC-0148"]);
    expect(filterReceipts(DEMO_RECEIPTS, { competencia: "2026-05", categoria: "Custas" }).map((item) => item.id)).toEqual(["REC-0139"]);
  });
});

describe("Valor em formato contábil", () => {
  it("os dígitos viram centavos com milhar e duas casas", () => {
    expect(maskAmount("5")).toBe("0,05");
    expect(maskAmount("128050")).toBe("1.280,50");
    expect(maskAmount("R$ 1.280,5")).toBe("128,05");
    expect(maskAmount("0001")).toBe("0,01");
    expect(maskAmount("abc")).toBe("");
    expect(parseAmount(maskAmount("123456789"))).toBe(1234567.89);
  });

  it("mostra o valor gravado no mesmo formato", () => {
    expect(formatAmount(2000)).toBe("2.000,00");
  });
});

describe("Tradução da descrição", () => {
  it("divide textos longos em pedaços que o serviço aceita", () => {
    const longo = Array.from({ length: 80 }, (_, i) => `Frase número ${i} do serviço.`).join(" ");
    const partes = pedacos(longo);
    expect(partes.length).toBeGreaterThan(1);
    expect(partes.every((parte) => parte.length <= 450)).toBe(true);
    expect(partes.join(" ")).toBe(longo);
  });
});
