import { describe, expect, it } from "vitest";
import { formatBRL, formatMonth, formatMonthTitle, ROTULO_LOTE } from "../client/src/lib/portal";

describe("Portal do Prestador — formatação", () => {
  it("formata valores em reais no padrão brasileiro", () => {
    expect(formatBRL(1280.5)).toBe("R$ 1.280,50");
  });

  it("formata a competência mensal para exibição", () => {
    expect(formatMonth("2026-06")).toBe("junho de 2026");
    expect(formatMonthTitle("2026-06")).toBe("Junho 2026");
  });

  it("mostra a situação do lote com os nomes da conferência", () => {
    expect(ROTULO_LOTE["Aguardando conferência"]).toBe("Conferência pendente");
    expect(ROTULO_LOTE.Conferido).toBe("Conferência finalizada");
  });
});
