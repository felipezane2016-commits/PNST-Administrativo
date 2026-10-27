import { describe, expect, it } from "vitest";
import type { Usuario } from "../client/src/_core/identidade/permissoes";
import { USUARIOS_DEMO } from "../client/src/_core/identidade/sessao";
import { razao } from "../client/src/modulos/conciliacao/colecoes";
import { aprovar, conferir, devolver, registrarPagamento, reenviar, salvarFornecedor, solicitarDoLote, solicitarPagamento, type Pedido } from "../client/src/modulos/pagamentos/acoes";
import { configAprovacao, fornecedores, pagamentos } from "../client/src/modulos/pagamentos/colecoes";
import { CONFIG_APROVACAO_DEMO, PAGAMENTOS_DEMO } from "../client/src/modulos/pagamentos/dadosMock";
import {
  alertasDePagamentos,
  aprovadorVigente,
  podeAprovar,
  podeConferir,
  podePagar,
  proximoNumero,
  validarPedido,
  visiveisPara,
} from "../client/src/modulos/pagamentos/regras";
import type { Pagamento } from "../client/src/modulos/pagamentos/tipos";
import { fechamentos } from "../client/src/modulos/prestadores/colecoes";
import { montarLotes } from "../client/src/modulos/prestadores/regras";
import { prestadores, recibos } from "../client/src/modulos/prestadores/colecoes";

const HOJE = "2026-06-30";
const pessoa = (id: string) => USUARIOS_DEMO.find((u) => u.id === id) as Usuario;
const fernanda = pessoa("usr-fernanda"); // admin, financeiro
const ricardo = pessoa("usr-ricardo"); // gestor, financeiro, substituto
const marcos = pessoa("usr-marcos"); // chefe da administração, aprovador
const helena = pessoa("usr-helena"); // operadora, outra área
const felipe = pessoa("usr-felipe"); // admin
const caio = pessoa("usr-caio"); // leitor
const bianca = pessoa("usr-bianca"); // operadora
const pessoas = USUARIOS_DEMO;

const pedido = (extra: Partial<Pedido> = {}): Pedido => ({
  empresa: "PNST", fornecedorId: null, favorecido: "Tribunal de Justiça de São Paulo", descricao: "Custas", categoria: "Custas processuais", valor: 500,
  vencimento: "2026-07-03", forma: "Pix", dadosPagamento: "chave@pix", cliente: "Cliente X", caso: "123", reembolsavel: true, urgente: false,
  justificativaUrgencia: "", documentos: [{ anexoId: null, nome: "guia.pdf" }], origem: "Solicitação", origemId: null, ...extra,
});

const em = (status: Pagamento["status"], extra: Partial<Pagamento> = {}): Pagamento => ({ ...PAGAMENTOS_DEMO[0], status, solicitanteId: "usr-helena", conferencia: null, aprovacao: null, pagamento: null, ...extra });

describe("quem aprova", () => {
  it("o substituto só vale dentro do período", () => {
    const config = { aprovadorId: "usr-marcos", substitutoId: "usr-ricardo", substitutoDe: "2026-07-01", substitutoAte: "2026-07-15" };
    expect(aprovadorVigente(config, "2026-06-30")).toBe("usr-marcos");
    expect(aprovadorVigente(config, "2026-07-01")).toBe("usr-ricardo");
    expect(aprovadorVigente(config, "2026-07-16")).toBe("usr-marcos");
  });
});

describe("segregação de funções", () => {
  const config = CONFIG_APROVACAO_DEMO;
  it("quem pede não confere; quem não é do financeiro não confere", () => {
    expect(podeConferir(fernanda, em("Em conferência", { solicitanteId: "usr-fernanda" })).ok).toBe(false);
    expect(podeConferir(helena, em("Em conferência")).ok).toBe(false);
    expect(podeConferir(fernanda, em("Em conferência")).ok).toBe(true);
  });
  it("aprova um nível acima de quem pediu, e nunca quem pediu ou conferiu", () => {
    const conferido = { porId: "usr-fernanda", por: "Fernanda", em: "" };
    const aguardando = (solicitanteId: string, extra: Partial<Pagamento> = {}) => em("Aguardando aprovação", { solicitanteId, conferencia: conferido, ...extra });
    // Operadora pediu → gestor ou administrador aprova; operador e leitor não.
    expect(podeAprovar(ricardo, aguardando("usr-helena"), config, HOJE, pessoas).ok).toBe(true);
    expect(podeAprovar(felipe, aguardando("usr-helena"), config, HOJE, pessoas).ok).toBe(true);
    expect(podeAprovar(bianca, aguardando("usr-helena"), config, HOJE, pessoas)).toMatchObject({ ok: false, motivo: expect.stringMatching(/gestor ou administrador/) });
    expect(podeAprovar(caio, aguardando("usr-helena"), config, HOJE, pessoas).ok).toBe(false);
    // Gestor pediu → administrador aprova; outro gestor não (a não ser o chefe vigente).
    expect(podeAprovar(felipe, aguardando("usr-ricardo"), config, HOJE, pessoas).ok).toBe(true);
    expect(podeAprovar(marcos, aguardando("usr-ricardo"), config, HOJE, pessoas).ok).toBe(true);
    // Administrador pediu → só o chefe da administração (ou o substituto no período).
    expect(podeAprovar(felipe, aguardando("usr-fernanda", { conferencia: { porId: "usr-ricardo", por: "Ricardo", em: "" } }), config, HOJE, pessoas)).toMatchObject({ ok: false, motivo: expect.stringMatching(/chefe da administração/) });
    expect(podeAprovar(marcos, aguardando("usr-fernanda", { conferencia: { porId: "usr-ricardo", por: "Ricardo", em: "" } }), config, HOJE, pessoas).ok).toBe(true);
    // Quem pediu ou conferiu não aprova.
    expect(podeAprovar(marcos, aguardando("usr-marcos"), config, HOJE, pessoas)).toMatchObject({ ok: false, motivo: expect.stringMatching(/Você pediu/) });
    expect(podeAprovar(felipe, aguardando("usr-marcos"), config, HOJE, pessoas).ok).toBe(true);
    expect(podeAprovar(ricardo, aguardando("usr-helena", { conferencia: { porId: "usr-ricardo", por: "Ricardo", em: "" } }), config, HOJE, pessoas).ok).toBe(false);
  });
  it("quem aprovou não paga", () => {
    const aprovado = em("Aprovado", { aprovacao: { porId: "usr-ricardo", por: "Ricardo", em: "" } });
    expect(podePagar(ricardo, aprovado).ok).toBe(false);
    expect(podePagar(fernanda, aprovado).ok).toBe(true);
    expect(podePagar(helena, aprovado).ok).toBe(false);
  });
  it("outras áreas veem só os próprios pedidos", () => {
    const lista = [em("Em conferência"), em("Pago", { solicitanteId: "usr-fernanda" })];
    expect(visiveisPara(helena, lista, config, HOJE, pessoas)).toHaveLength(1);
    expect(visiveisPara(marcos, lista, config, HOJE, pessoas)).toHaveLength(2);
    // Leitor não vê pedido alheio, nem aguardando aprovação.
    expect(visiveisPara(caio, [em("Aguardando aprovação", { conferencia: { porId: "usr-fernanda", por: "F", em: "" } })], config, HOJE, pessoas)).toHaveLength(0);
  });
});

describe("validação do pedido", () => {
  it("documento obrigatório, linha digitável, urgência justificada e cliente quando reembolsável", () => {
    expect(validarPedido(pedido(), HOJE)).toEqual({});
    expect(validarPedido(pedido({ documentos: [] }), HOJE).documentos).toBeTruthy();
    expect(validarPedido(pedido({ forma: "Boleto", dadosPagamento: "123" }), HOJE).dadosPagamento).toBeTruthy();
    expect(validarPedido(pedido({ vencimento: "2026-06-20" }), HOJE).vencimento).toBeTruthy();
    expect(validarPedido(pedido({ vencimento: "2026-06-20", urgente: true }), HOJE).justificativa).toBeTruthy();
    expect(validarPedido(pedido({ cliente: "" }), HOJE).cliente).toBeTruthy();
  });
  it("numeração sequencial", () => {
    expect(proximoNumero(PAGAMENTOS_DEMO)).toBe("PG-0011");
  });
});

describe("alertas", () => {
  it("vencido, vencendo e fornecedor com dados a validar", () => {
    const alertas = alertasDePagamentos(PAGAMENTOS_DEMO, fornecedores.ler(), HOJE);
    const textos = alertas.map((a) => a.texto).join(" | ");
    expect(textos).toMatch(/Vencido há 1 dia\(s\) e não pago: PG-0010/);
    expect(textos).toMatch(/Vence hoje: PG-0005/);
    expect(textos).toMatch(/Dados bancários de Papelaria Central Ltda mudaram/);
    expect(alertas[0].tom).toBe("red");
  });
});

describe("fluxo completo pelas ações", () => {
  it("pedido de outra área → conferência → aprovação → pagamento no razão", () => {
    const novo = solicitarPagamento(pedido(), helena);
    expect(novo.status).toBe("Em conferência");
    expect(conferir(novo.id, helena)).toMatch(/financeiro/);
    expect(conferir(novo.id, fernanda)).toBeNull();
    expect(aprovar(novo.id, fernanda)).toMatch(/conferiu/);
    expect(aprovar(novo.id, bianca)).toMatch(/gestor ou administrador/);
    expect(aprovar(novo.id, marcos)).toBeNull();
    expect(registrarPagamento(novo.id, { data: HOJE, contaId: "cb-itau-pnst", comprovante: null }, marcos)).toMatch(/financeiro|aprovou/);
    expect(registrarPagamento(novo.id, { data: HOJE, contaId: "cb-itau-pnst", comprovante: null }, ricardo)).toBeNull();
    const pago = pagamentos.ler().find((p) => p.id === novo.id)!;
    expect(pago.status).toBe("Pago");
    expect(pago.historico.map((h) => h.texto)).toEqual(["Pagamento solicitado.", "Conferido: documento, valor e dados de pagamento ok.", "Aprovado.", "Pago no Itaú · PNST em 30/06/2026."]);
    const lancamento = razao.ler().find((r) => r.origemId === novo.id)!;
    expect(lancamento).toMatchObject({ contaId: "cb-itau-pnst", valor: -500, origem: "Contas a pagar" });
  });

  it("devolvido volta para quem pediu e reenvia para conferência", () => {
    const novo = solicitarPagamento(pedido({ valor: 90 }), helena);
    expect(devolver(novo.id, "", fernanda)).toMatch(/corrigido/);
    expect(devolver(novo.id, "Falta a guia", fernanda)).toBeNull();
    expect(reenviar(novo.id, pedido({ valor: 95 }), helena)).toBeNull();
    const corrigido = pagamentos.ler().find((p) => p.id === novo.id)!;
    expect(corrigido).toMatchObject({ status: "Em conferência", valor: 95, motivo: "" });
  });

  it("fornecedor que trocou a conta exige confirmação na aprovação", () => {
    const papelaria = fornecedores.ler().find((f) => f.id === "forn-papelaria")!;
    const novo = solicitarPagamento(pedido({ fornecedorId: papelaria.id, favorecido: papelaria.nome }), helena);
    conferir(novo.id, fernanda);
    expect(aprovar(novo.id, marcos)).toMatch(/confirme com o fornecedor/);
    expect(aprovar(novo.id, marcos, true)).toBeNull();
    expect(fornecedores.ler().find((f) => f.id === papelaria.id)!.dadosValidados).toBe(true);
    salvarFornecedor({ ...papelaria, dadosValidados: true, conta: "999-9" }, "Fernanda");
    expect(fornecedores.ler().find((f) => f.id === papelaria.id)!.dadosValidados).toBe(false);
  });

  it("lote de prestador vai direto para aprovação e, pago, fica Pago na conferência", () => {
    configAprovacao.restaurar();
    const lote = montarLotes(recibos.ler(), fechamentos.ler(), prestadores.ler()).find((l) => l.situacao === "Conferido")!;
    const pedidoLote = solicitarDoLote(lote, fernanda)!;
    expect(pedidoLote.status).toBe("Aguardando aprovação");
    expect(solicitarDoLote(lote, fernanda)!.id).toBe(pedidoLote.id);
    expect(aprovar(pedidoLote.id, marcos)).toBeNull();
    expect(registrarPagamento(pedidoLote.id, { data: HOJE, contaId: "cb-itau-pnst", comprovante: null }, fernanda)).toBeNull();
    const depois = montarLotes(recibos.ler(), fechamentos.ler(), prestadores.ler()).find((l) => l.chave === lote.chave)!;
    expect(depois.situacao).toBe("Pago");
    expect(razao.ler().filter((r) => r.origemId === `${lote.prestador.id}|${lote.competencia}`)).toHaveLength(1);
  });
});
