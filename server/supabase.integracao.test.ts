import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * Testa o banco de verdade: migração, RLS e gatilhos, contra um Supabase
 * local (`supabase start` + `supabase db reset`). Só roda com as variáveis:
 *   SUPABASE_TESTE_URL, SUPABASE_TESTE_ANON, SUPABASE_TESTE_SERVICE
 * Sem elas (CI comum), o bloco é pulado.
 */

const URL = process.env.SUPABASE_TESTE_URL ?? "";
const ANON = process.env.SUPABASE_TESTE_ANON ?? "";
const SERVICE = process.env.SUPABASE_TESTE_SERVICE ?? "";
const SENHA = "senha-de-teste-123";

const sufixo = Date.now().toString(36);
const email = (nome: string) => `${nome}.${sufixo}@teste.pnst`;

type Pessoa = { id: string; db: SupabaseClient };

describe.skipIf(!URL)("Supabase: RLS e regras no banco", () => {
  let servico: SupabaseClient;
  const pessoas: Record<string, Pessoa> = {};

  async function criar(nome: string, perfil?: { papel: string; modulos: string[] }) {
    const { data, error } = await servico.auth.admin.createUser({ email: email(nome), password: SENHA, email_confirm: true, user_metadata: { nome } });
    if (error) throw error;
    if (perfil) await servico.from("perfis").update(perfil).eq("id", data.user.id);
    const db = createClient(URL, ANON, { auth: { persistSession: false } });
    const login = await db.auth.signInWithPassword({ email: email(nome), password: SENHA });
    if (login.error) throw login.error;
    pessoas[nome] = { id: data.user.id, db };
    return pessoas[nome];
  }

  const pagamento = (solicitanteId: string, extra: Record<string, unknown> = {}) => ({
    id: `pg-${sufixo}-${Math.random().toString(36).slice(2, 7)}`,
    dados: { numero: "PG-9999", status: "Em conferência", solicitanteId, favorecido: "TJSP", valor: 100, origem: "Solicitação", historico: [], ...extra },
  });

  beforeAll(async () => {
    servico = createClient(URL, SERVICE, { auth: { persistSession: false } });
    // Banco zerado a cada `db reset`: o primeiro usuário vira administrador.
    const { count } = await servico.from("perfis").select("*", { count: "exact", head: true });
    if (count) throw new Error("Rode `supabase db reset` antes: o teste precisa do banco vazio.");
    await criar("admin");
    await criar("financeiro", { papel: "gestor", modulos: ["contas", "prestadores"] });
    await criar("aprovador", { papel: "gestor", modulos: ["contas"] });
    await criar("advogada", { papel: "operador", modulos: ["documentos"] });
    await criar("leitor", { papel: "viewer", modulos: ["contas"] });
    await servico.from("configuracoes").insert({ id: "pagamentos-config", dados: { aprovadorId: pessoas.aprovador.id, substitutoId: null, substitutoDe: null, substitutoAte: null } });
  }, 60_000);

  it("o primeiro usuário vira administrador; os demais nascem sem módulos", async () => {
    const { data } = await servico.from("perfis").select("papel, modulos").eq("id", pessoas.admin.id).single();
    expect(data).toMatchObject({ papel: "admin" });
    const novo = await servico.auth.admin.createUser({ email: email("novato"), password: SENHA, email_confirm: true, user_metadata: { papel: "admin", modulos: ["contas"] } });
    const { data: perfil } = await servico.from("perfis").select("papel, modulos").eq("id", novo.data.user!.id).single();
    expect(perfil).toEqual({ papel: "viewer", modulos: [] });
  });

  it("anônimo não lê nada", async () => {
    const anonimo = createClient(URL, ANON, { auth: { persistSession: false } });
    const { data } = await anonimo.from("contas_ordens").select("*");
    expect(data ?? []).toHaveLength(0);
  });

  it("módulo decide quem vê; papel decide quem grava", async () => {
    const ordem = { id: `ord-${sufixo}`, dados: { cliente: "ACME", valor: 10 } };
    expect((await pessoas.financeiro.db.from("contas_ordens").insert(ordem)).error).toBeNull();
    expect((await pessoas.advogada.db.from("contas_ordens").select("*")).data).toHaveLength(0);
    expect((await pessoas.leitor.db.from("contas_ordens").select("*")).data).toHaveLength(1);
    const escrita = await pessoas.leitor.db.from("contas_ordens").update({ dados: { cliente: "X" } }).eq("id", ordem.id).select();
    expect(escrita.data ?? []).toHaveLength(0);
  });

  it("ninguém se promove: só o administrador altera perfis", async () => {
    await pessoas.advogada.db.from("perfis").update({ papel: "admin", modulos: ["contas"] }).eq("id", pessoas.advogada.id);
    const { data } = await servico.from("perfis").select("papel").eq("id", pessoas.advogada.id).single();
    expect(data!.papel).toBe("operador");
    const { error } = await pessoas.admin.db.from("perfis").update({ papel: "gestor" }).eq("id", pessoas.admin.id);
    expect(error?.message).toMatch(/último administrador/);
  });

  it("pagamento: número do banco, segregação de funções em cada passo", async () => {
    const pedido = pagamento(pessoas.advogada.id);
    const criado = await pessoas.advogada.db.from("pagamentos").insert(pedido).select().single();
    expect(criado.error).toBeNull();
    expect(criado.data!.dados.numero).toMatch(/^PG-\d{4}$/);
    expect(criado.data!.dados.numero).not.toBe("PG-9999");

    // Pedido em nome de outra pessoa é recusado.
    const falso = await pessoas.advogada.db.from("pagamentos").insert(pagamento(pessoas.financeiro.id));
    expect(falso.error?.message).toMatch(/em nome de quem está logado/);

    const atualizar = (quem: Pessoa, dados: Record<string, unknown>) =>
      quem.db.from("pagamentos").update({ dados: { ...criado.data!.dados, ...dados } }).eq("id", pedido.id).select();

    // Quem pede não confere; quem não é do financeiro não confere.
    expect((await atualizar(pessoas.advogada, { status: "Aguardando aprovação", conferencia: { porId: pessoas.advogada.id } })).error?.message).toMatch(/financeiro/);
    // O financeiro confere.
    const conferido = await atualizar(pessoas.financeiro, { status: "Aguardando aprovação", conferencia: { porId: pessoas.financeiro.id } });
    expect(conferido.error).toBeNull();
    const dadosConferido = conferido.data![0].dados;

    // Só o aprovador aprova.
    const aprovarComo = (quem: Pessoa) =>
      quem.db.from("pagamentos").update({ dados: { ...dadosConferido, status: "Aprovado", aprovacao: { porId: quem.id } } }).eq("id", pedido.id).select();
    expect((await aprovarComo(pessoas.financeiro)).error?.message).toMatch(/chefe da administração/);
    const aprovado = await aprovarComo(pessoas.aprovador);
    expect(aprovado.error).toBeNull();

    // Quem aprovou não paga (o aprovador também é financeiro aqui).
    const pagarComo = (quem: Pessoa) =>
      quem.db.from("pagamentos").update({ dados: { ...aprovado.data![0].dados, status: "Pago", pagamento: { porId: quem.id } } }).eq("id", pedido.id).select();
    expect((await pagarComo(pessoas.aprovador)).error?.message).toMatch(/Quem aprovou não executa/);
    expect((await pagarComo(pessoas.financeiro)).error).toBeNull();

    // Pago não volta, e pagamento não se apaga.
    expect((await pessoas.financeiro.db.from("pagamentos").update({ dados: { ...aprovado.data![0].dados, status: "Em conferência" } }).eq("id", pedido.id)).error?.message).toMatch(/não permitida/);
    await pessoas.admin.db.from("pagamentos").delete().eq("id", pedido.id);
    expect((await servico.from("pagamentos").select("id").eq("id", pedido.id)).data).toHaveLength(1);
  });

  it("quem pede vê só os próprios pedidos; financeiro e aprovador veem todos", async () => {
    await pessoas.financeiro.db.from("pagamentos").insert(pagamento(pessoas.financeiro.id));
    const daAdvogada = (await pessoas.advogada.db.from("pagamentos").select("solicitante_id")).data!;
    expect(daAdvogada.every((p) => p.solicitante_id === pessoas.advogada.id)).toBe(true);
    const doAprovador = (await pessoas.aprovador.db.from("pagamentos").select("solicitante_id")).data!;
    expect(new Set(doAprovador.map((p) => p.solicitante_id)).size).toBeGreaterThan(1);
  });

  it("trocar a conta do fornecedor derruba a validação, mesmo se o cliente mandar validado", async () => {
    const id = `forn-${sufixo}`;
    await pessoas.financeiro.db.from("pagamentos_fornecedores").insert({ id, dados: { nome: "Papelaria", banco: "Itaú", agencia: "1", conta: "1", chavePix: "", dadosValidados: true } });
    await pessoas.financeiro.db.from("pagamentos_fornecedores").update({ dados: { nome: "Papelaria", banco: "Itaú", agencia: "1", conta: "999", chavePix: "", dadosValidados: true } }).eq("id", id);
    const { data } = await servico.from("pagamentos_fornecedores").select("dados").eq("id", id).single();
    expect(data!.dados.dadosValidados).toBe(false);
  });

  it("portal: o prestador vê só o que é dele e não aprova recibo", async () => {
    const prestadorId = `prest-${sufixo}`;
    await pessoas.financeiro.db.from("prestadores").insert({ id: prestadorId, dados: { nome: "Rota", email: email("prestador"), portalAtivo: true } });
    await pessoas.financeiro.db.from("prestadores").insert({ id: `${prestadorId}-outro`, dados: { nome: "Outro", email: "x@y", portalAtivo: true } });
    await pessoas.financeiro.db.from("recibos").insert({ id: `REC-${sufixo}-outro`, dados: { prestadorId: `${prestadorId}-outro`, status: "Enviado" } });
    const prestador = await criar("prestador");
    const { data: perfil } = await servico.from("perfis").select("tipo, prestador_id").eq("id", prestador.id).single();
    expect(perfil).toEqual({ tipo: "prestador", prestador_id: prestadorId });

    expect((await prestador.db.from("prestadores").select("id")).data!.map((p) => p.id)).toEqual([prestadorId]);
    expect((await prestador.db.from("contas_ordens").select("*")).data).toHaveLength(0);
    expect((await prestador.db.from("pagamentos").select("*")).data).toHaveLength(0);

    const recibo = { id: `REC-${sufixo}-1`, dados: { prestadorId, status: "Rascunho", amount: 50 } };
    expect((await prestador.db.from("recibos").insert(recibo)).error).toBeNull();
    expect((await prestador.db.from("recibos").select("id")).data!.map((r) => r.id)).toEqual([recibo.id]);
    const autoAprovar = await prestador.db.from("recibos").update({ dados: { ...recibo.dados, status: "Aprovado" } }).eq("id", recibo.id);
    expect(autoAprovar.error).not.toBeNull();
    const deOutro = await prestador.db.from("recibos").insert({ id: `REC-${sufixo}-2`, dados: { prestadorId: `${prestadorId}-outro`, status: "Rascunho" } });
    expect(deOutro.error).not.toBeNull();

    // Portal desativado no cadastro: o acesso cai na hora.
    await pessoas.financeiro.db.from("prestadores").update({ dados: { nome: "Rota", email: email("prestador"), portalAtivo: false } }).eq("id", prestadorId);
    expect((await prestador.db.from("recibos").select("id")).data).toHaveLength(0);
  });

  it("toda mudança fica na auditoria, que só o administrador lê", async () => {
    const { data } = await pessoas.admin.db.from("auditoria").select("tabela, operacao").eq("tabela", "pagamentos");
    expect(data!.length).toBeGreaterThan(0);
    expect((await pessoas.financeiro.db.from("auditoria").select("*")).data).toHaveLength(0);
  });
});
