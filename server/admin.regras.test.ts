import { describe, expect, it } from "vitest";
import { permissoesEfetivas, pode, veModulo, type Acao, type Usuario } from "../client/src/_core/identidade/permissoes";
import { exigenciaDaRota } from "../client/src/admin/menu";
import type { Closing, Receipt } from "../client/src/lib/portal";
import { economiaPotencial, mediaMovel, spread } from "../client/src/modulos/contas/regras";
import type { Taxa, TarefaConta } from "../client/src/modulos/contas/tipos";
import { montarAgenda, vencendoEmBreve } from "../client/src/modulos/escritorio/agenda";
import { codigoDisponivel, montarLotes, podeFinalizarConferencia, podeMarcarPago, rankingPrestadores } from "../client/src/modulos/prestadores/regras";
import type { Prestador } from "../client/src/modulos/prestadores/tipos";

const HOJE = "2026-06-30";

function prestador(id: string, codigo = id.toUpperCase()): Prestador {
  return { id, nome: id, categoria: "Motoboy", documento: "", email: "", telefone: "", codigoAcesso: codigo, senha: "x", portalAtivo: true, contrato: "", desde: "2026-01-01" };
}

function recibo(id: string, prestadorId: string, status: Receipt["status"], amount = 100, competencia = "2026-06"): Receipt {
  return {
    id, prestadorId, competencia, serviceDate: `${competencia}-10`, category: "Transporte", client: "C", caseRef: "", requester: "",
    description: "", amount, status, anexos: [], reviewNote: null, createdAt: `${competencia}-10T00:00:00Z`,
  };
}

function fechamento(prestadorId: string, review: Closing["review"], competencia = "2026-06"): Closing {
  return { prestadorId, competencia, documentos: [{ id: null, nome: "nf.pdf" }], submitted: review !== null, submittedAt: null, review };
}

describe("Conferência de recibos", () => {
  const prestadores = [prestador("a"), prestador("b"), prestador("c")];

  it("cada fechamento enviado é um lote; recibo avulso ou mês não enviado não aparece", () => {
    const lotes = montarLotes(
      [recibo("1", "a", "Enviado"), recibo("2", "a", "Rascunho"), recibo("3", "b", "Pendente de envio")],
      [fechamento("a", "Aguardando conferência"), fechamento("b", null)],
      prestadores,
    );
    expect(lotes).toHaveLength(1);
    expect(lotes[0].situacao).toBe("Aguardando conferência");
    // Sem a lista do envio, o rascunho do mesmo mês não entra no lote.
    expect(lotes[0].recibos.map((item) => item.id)).toEqual(["1"]);
  });

  it("o lote leva os recibos que foram no envio", () => {
    const [lote] = montarLotes(
      [recibo("1", "a", "Enviado"), recibo("2", "a", "Rascunho")],
      [{ ...fechamento("a", "Aguardando conferência"), reciboIds: ["1", "2"] }],
      prestadores,
    );
    expect(lote.recibos.map((item) => item.id)).toEqual(["1", "2"]);
  });

  it("põe primeiro o que pede ação", () => {
    const lotes = montarLotes(
      [recibo("1", "a", "Pago"), recibo("2", "b", "Enviado"), recibo("3", "c", "Aprovado")],
      [fechamento("a", "Pago"), fechamento("b", "Aguardando conferência"), fechamento("c", "Conferido")],
      prestadores,
    );
    expect(lotes.map((lote) => lote.situacao)).toEqual(["Aguardando conferência", "Conferido", "Pago"]);
  });

  it("finaliza enquanto a conferência está aberta; paga depois de finalizada", () => {
    const [aberto] = montarLotes([recibo("1", "a", "Enviado")], [fechamento("a", "Aguardando conferência")], prestadores);
    expect(podeFinalizarConferencia(aberto)).toBe(true);
    expect(podeMarcarPago(aberto)).toBe(false);
    const [conferido] = montarLotes([recibo("1", "a", "Aprovado")], [fechamento("a", "Conferido")], prestadores);
    expect(podeFinalizarConferencia(conferido)).toBe(false);
    expect(podeMarcarPago(conferido)).toBe(true);
  });

  it("o total do lote exclui recibos rejeitados", () => {
    const [lote] = montarLotes([recibo("1", "a", "Aprovado", 300), recibo("2", "a", "Rejeitado", 900)], [fechamento("a", "Aguardando conferência")], prestadores);
    expect(lote.total).toBe(300);
  });

  it("ranking soma só o aprovado ou pago", () => {
    const [primeiro] = rankingPrestadores([recibo("1", "b", "Aprovado", 300), recibo("3", "b", "Pago", 200), recibo("2", "a", "Enviado", 900)], prestadores);
    expect(primeiro.prestador.id).toBe("b");
    expect(primeiro.valor).toBe(500);
  });

  it("código de acesso é único, sem diferenciar maiúsculas, e livre para o próprio prestador", () => {
    const lista = [prestador("a", "PNST-1"), prestador("b", "PNST-2")];
    expect(codigoDisponivel("pnst-1", lista)).toBe(false);
    expect(codigoDisponivel("PNST-1", lista, "a")).toBe(true);
    expect(codigoDisponivel("PNST-3", lista)).toBe(true);
  });
});

describe("Banco Industrial", () => {
  const taxa = (bibUsd: number, itauUsd: number): Taxa => ({ id: "t", data: HOJE, horario: "10:00", bibUsd, bibEur: 6, itauUsd, itauEur: 6, observacao: "" });

  it("spread é BIB menos Itaú", () => {
    expect(spread(taxa(5.62, 5.6), "USD")).toBeCloseTo(0.02, 6);
  });

  it("média móvel usa só a janela final", () => {
    expect(mediaMovel([1, 2, 3, 4, 5], 2)).toBe(4.5);
    expect(mediaMovel([2, 4], 30)).toBe(3);
  });

  it("economia é o que a melhor cotação rende a mais sobre a mesma quantidade de moeda", () => {
    const resultado = economiaPotencial(100_000, 5.0, 5.05);
    expect(resultado.valor).toBeCloseTo(1000, 6);
    expect(resultado.percentual).toBeCloseTo(1, 6);
    expect(economiaPotencial(0, 5, 5.1).valor).toBe(0);
  });
});

describe("Agenda", () => {
  const tarefa = (id: string, vencimento: string | null, concluida = false): TarefaConta => ({
    id, nome: id, categoria: "Impostos", concluida, vencimento, periodo: "", observacoes: "",
  });

  it("junta reuniões e contas a pagar pendentes", () => {
    const agenda = montarAgenda({
      reunioes: [{ id: "r", titulo: "Reunião", data: HOJE, hora: "09:00", local: "", participantes: "", pauta: "" }],
      tarefasContas: [tarefa("paga", HOJE, true), tarefa("aberta", HOJE)],
    });
    expect(agenda.map((evento) => evento.id)).toEqual(["r", "aberta"]);
  });

  it("vencendo em breve vai de hoje até o limite, sem vencidas nem concluídas", () => {
    const lista = vencendoEmBreve([tarefa("ontem", "2026-06-29"), tarefa("hoje", HOJE), tarefa("semana", "2026-07-07"), tarefa("depois", "2026-07-08")], HOJE, "2026-07-07");
    expect(lista.map((item) => item.id)).toEqual(["hoje", "semana"]);
  });
});

describe("Permissões", () => {
  const usuario = (papel: Usuario["papel"], modulos: Usuario["modulos"], ativo = true): Usuario => ({
    id: "u", nome: "U", email: "u@x", senha: "x", departamento: "", papel, modulos, ativo, ultimoAcesso: null,
  });

  it("sem ajuste na ficha, o papel decide o que a pessoa pode fazer", () => {
    const tudo: Usuario["modulos"] = ["prestadores", "contas", "calendario", "documentos"];
    expect(pode(usuario("admin", []), "usuarios.gerenciar")).toBe(true);
    expect(pode(usuario("gestor", []), "usuarios.gerenciar")).toBe(false);
    expect(pode(usuario("operador", tudo), "prestadores.conferencia.conferir")).toBe(true);
    expect(pode(usuario("operador", tudo), "prestadores.recibos.excluir")).toBe(false);
    expect(pode(usuario("gestor", tudo), "prestadores.recibos.excluir")).toBe(true);
    expect(pode(usuario("viewer", tudo), "prestadores.conferencia.conferir")).toBe(false);
    expect(pode(usuario("viewer", tudo), "prestadores.conferencia.ver")).toBe(true);
    // Financeiro = edita e tem o Account Management.
    expect(pode(usuario("operador", ["contas", "pagamentos"]), "pagamentos.pagar")).toBe(true);
    expect(pode(usuario("operador", ["prestadores", "pagamentos"]), "pagamentos.pagar")).toBe(false);
    expect(pode(usuario("viewer", ["pagamentos"]), "pagamentos.pedir")).toBe(true);
    // Sem a área Pagamentos, nada de pagamentos.
    expect(pode(usuario("admin", ["contas"]), "pagamentos.pedir")).toBe(false);
    expect(pode(usuario("gestor", tudo), "pagamentos.regras")).toBe(false);
  });

  it("ajuste na ficha substitui o padrão do papel; a área continua obrigatória", () => {
    const conferente = { ...usuario("viewer", ["prestadores"]), permissoes: ["prestadores.conferencia.ver", "prestadores.conferencia.conferir"] as Acao[] };
    expect(pode(conferente, "prestadores.conferencia.conferir")).toBe(true);
    expect(pode(conferente, "prestadores.arquivos.ver")).toBe(false);
    expect(pode(conferente, "pagamentos.pedir")).toBe(false);
    const semArea = { ...conferente, modulos: [] as Usuario["modulos"] };
    expect(pode(semArea, "prestadores.conferencia.conferir")).toBe(false);
    // Administrador tem tudo, mesmo com uma lista curta.
    expect(pode({ ...usuario("admin", ["prestadores"]), permissoes: [] }, "prestadores.recibos.excluir")).toBe(true);
    expect(permissoesEfetivas(conferente)).toEqual(["prestadores.conferencia.ver", "prestadores.conferencia.conferir"]);
  });

  it("o módulo decide onde ela entra; inativo não entra em nada", () => {
    expect(veModulo(usuario("admin", ["prestadores"]), "prestadores")).toBe(true);
    expect(veModulo(usuario("admin", ["prestadores"]), "contas")).toBe(false);
    expect(veModulo(usuario("admin", ["prestadores"], false), "prestadores")).toBe(false);
    expect(pode(usuario("admin", ["prestadores"], false), "prestadores.conferencia.ver")).toBe(false);
  });

  it("cada página pede a permissão do item de menu mais específico", () => {
    expect(exigenciaDaRota("/prestadores")).toBe("prestadores.painel.ver");
    expect(exigenciaDaRota("/prestadores/arquivos")).toBe("prestadores.arquivos.ver");
    expect(exigenciaDaRota("/contas/ordens/ord-1")).toBe("contas.banco.ver");
    expect(exigenciaDaRota("/contas/pagamentos/aprovacoes")).toBeUndefined();
    expect(exigenciaDaRota("/contas")).toBe("contas.tarefas.ver");
  });
});
