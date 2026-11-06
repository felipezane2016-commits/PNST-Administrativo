import { beforeEach, describe, expect, it } from "vitest";
import type { Usuario } from "../client/src/_core/identidade/permissoes";
import { USUARIOS_DEMO } from "../client/src/_core/identidade/sessao";
import type { Receipt, ReceiptDraft } from "../client/src/lib/portal";
import { parseAmount } from "../client/src/lib/portal";
import { notificacoes } from "../client/src/modulos/notificacoes/colecao";
import { notificacaoVisivel } from "../client/src/admin/notificacoesVisiveis";
import {
  aceitarServico,
  cancelarServico,
  concluirServico,
  iniciarServico,
  recusarServico,
  reencaminharServico,
  solicitarServico,
} from "../client/src/modulos/servicos/acoes";
import { servicos } from "../client/src/modulos/servicos/colecao";
import { SERVICOS_DEMO } from "../client/src/modulos/servicos/dadosMock";
import { prestadoresParaServico, servicosVisiveis, validarSolicitacao, type RascunhoServico } from "../client/src/modulos/servicos/regras";
import { prestadores } from "../client/src/modulos/prestadores/colecoes";

const pessoa = (id: string) => USUARIOS_DEMO.find((u) => u.id === id) as Usuario;
const felipe = pessoa("usr-felipe"); // admin: gerencia todos
const helena = pessoa("usr-helena"); // operadora com prestadores
const marcos = pessoa("usr-marcos"); // sem a área de prestadores

const pedido = (extra: Partial<RascunhoServico> = {}): RascunhoServico => ({
  categoria: "Motoboy",
  prestadorId: "prest-rota",
  cliente: "Cliente X — Proc. 1",
  descricao: "Levar contrato",
  data: "2026-07-01",
  horario: "",
  urgente: false,
  detalhes: { origem: "Escritório", destino: "Fórum" },
  ...extra,
});

/** Recibo criado como o portal faria (pendente de envio, ligado ao serviço). */
const criarRecibo = (draft: ReceiptDraft, extras: { servicoId: string }): Receipt => ({
  id: "REC-9999",
  prestadorId: "prest-rota",
  competencia: draft.serviceDate.slice(0, 7),
  serviceDate: draft.serviceDate,
  category: draft.category,
  client: draft.client,
  caseRef: "",
  requester: draft.requester,
  description: draft.description,
  amount: parseAmount(draft.amount),
  anexos: draft.anexos,
  status: "Pendente de envio",
  reviewNote: null,
  servicoId: extras.servicoId,
  createdAt: new Date().toISOString(),
});

beforeEach(() => {
  servicos.atualizar(() => SERVICOS_DEMO);
  notificacoes.atualizar(() => []);
});

describe("solicitação de serviços", () => {
  it("valida campos da categoria e o prestador", () => {
    expect(validarSolicitacao(pedido({ prestadorId: "" }))).toMatch(/prestador/);
    expect(validarSolicitacao(pedido({ detalhes: { origem: "A" } }))).toMatch(/Entregar em/);
    expect(validarSolicitacao(pedido({ categoria: "Correio", detalhes: {} }))).toMatch(/Modalidade/);
    expect(validarSolicitacao(pedido())).toBeNull();
  });

  it("só oferece prestadores da categoria com portal ativo", () => {
    const lista = prestadoresParaServico(prestadores.ler(), "Motoboy");
    expect(lista.every((p) => p.categoria === "Motoboy" && p.portalAtivo)).toBe(true);
    expect(prestadoresParaServico(prestadores.ler(), "Motoboy", ["prest-rota"]).some((p) => p.id === "prest-rota")).toBe(false);
  });

  it("quem não tem a área de prestadores não pede nem vê", () => {
    expect(solicitarServico(pedido(), marcos)).toMatchObject({ ok: false });
    expect(servicosVisiveis(marcos, servicos.ler())).toEqual([]);
  });

  it("colaborador vê só os próprios; quem gerencia vê todos", () => {
    const soEla = { ...helena, permissoes: ["prestadores.servicos.solicitar" as const] };
    expect(servicosVisiveis(soEla, servicos.ler()).every((s) => s.solicitanteId === helena.id)).toBe(true);
    expect(servicosVisiveis(felipe, servicos.ler())).toHaveLength(servicos.ler().length);
  });

  it("fluxo completo: pedir → aceitar → executar → concluir gera o recibo e avisa quem pediu", () => {
    const r = solicitarServico(pedido({ urgente: true }), helena);
    if (!r.ok) throw new Error(r.erro);
    const id = r.servico.id;
    expect(r.servico.situacao).toBe("Solicitado");
    expect(r.servico.numero).toMatch(/^SV-\d{4}$/);

    // Outro prestador não mexe no pedido.
    expect(aceitarServico(id, "prest-marina", "Marina")).not.toBeNull();
    expect(concluirServico(id, "prest-rota", { valor: "90,00", data: "2026-07-01", observacao: "" }, [], "Rota", criarRecibo)).toMatchObject({ ok: false });

    expect(aceitarServico(id, "prest-rota", "Rota Leve")).toBeNull();
    expect(iniciarServico(id, "prest-rota", "Rota Leve")).toBeNull();
    expect(concluirServico(id, "prest-rota", { valor: "", data: "2026-07-01", observacao: "" }, [], "Rota Leve", criarRecibo)).toMatchObject({ ok: false, erro: expect.stringMatching(/valor/) });

    const fim = concluirServico(id, "prest-rota", { valor: "1.280,50", data: "2026-07-01", observacao: "Entregue" }, [{ id: "a", nome: "foto.jpg" }], "Rota Leve", criarRecibo);
    if (!fim.ok) throw new Error(fim.erro);
    expect(fim.recibo).toMatchObject({ amount: 1280.5, client: "Cliente X — Proc. 1", requester: "Helena Prado", servicoId: id, status: "Pendente de envio" });
    expect(fim.recibo.description).toContain("Entregue");

    const final = servicos.ler().find((s) => s.id === id)!;
    expect(final).toMatchObject({ situacao: "Concluído", reciboId: "REC-9999", execucao: { valor: 1280.5 } });
    expect(final.historico.map((p) => p.texto)).toEqual(expect.arrayContaining(["Serviço aceito.", "Execução iniciada."]));

    // Avisos pessoais: só Helena vê.
    const avisos = notificacoes.ler();
    expect(avisos.length).toBe(3);
    expect(avisos.every((a) => notificacaoVisivel(helena, a))).toBe(true);
    expect(avisos.some((a) => notificacaoVisivel(felipe, a))).toBe(false);
  });

  it("recusa exige motivo; quem pediu reencaminha a outro prestador", () => {
    const r = solicitarServico(pedido(), felipe);
    if (!r.ok) throw new Error(r.erro);
    const id = r.servico.id;
    expect(recusarServico(id, "prest-rota", "  ", "Rota")).toMatch(/por que/);
    expect(recusarServico(id, "prest-rota", "Sem agenda", "Rota")).toBeNull();
    expect(servicos.ler().find((s) => s.id === id)).toMatchObject({ situacao: "Recusado", recusadoPor: ["prest-rota"] });

    expect(reencaminharServico(id, "prest-rota", felipe)).toMatch(/outro/);
    const outro = { ...prestadores.ler().find((p) => p.id === "prest-rota")!, id: "prest-rota-2", nome: "Moto Dois" };
    prestadores.atualizar((lista) => [...lista, outro]);
    expect(reencaminharServico(id, "prest-rota-2", felipe)).toBeNull();
    expect(servicos.ler().find((s) => s.id === id)).toMatchObject({ situacao: "Solicitado", prestadorId: "prest-rota-2", motivoRecusa: "" });
    prestadores.atualizar((lista) => lista.filter((p) => p.id !== "prest-rota-2"));
  });

  it("cancelar pede motivo e não vale para concluído", () => {
    expect(cancelarServico("sv-demo-3", "", felipe)).toMatch(/por que/);
    expect(cancelarServico("sv-demo-3", "Cliente desistiu", felipe)).toBeNull();
    expect(cancelarServico("sv-demo-4", "x", felipe)).not.toBeNull();
    // Helena não pediu o sv-demo-1 e só tem as permissões padrão de operadora (gerencia).
    const soEla = { ...helena, permissoes: ["prestadores.servicos.solicitar" as const] };
    expect(cancelarServico("sv-demo-1", "x", soEla)).not.toBeNull();
  });
});
