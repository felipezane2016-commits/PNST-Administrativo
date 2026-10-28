import { apagarAnexo } from "@/_core/armazenamento/anexos";
import { gravarItem } from "@/_core/armazenamento/colecao";
import { usuarios } from "@/_core/identidade/sessao";
import type { Usuario } from "@/_core/identidade/permissoes";
import { gerarId, HOJE } from "@/_core/tempo";
import { documentosDoFechamento, formatBRL, formatMonth } from "@/lib/portal";
import { contasBancarias, razao } from "@/modulos/conciliacao/colecoes";
import { notificar } from "@/modulos/notificacoes/colecao";
import { marcarPago } from "@/modulos/prestadores/acoes";
import type { Lote } from "@/modulos/prestadores/regras";
import { configAprovacao, fornecedores, pagamentos } from "./colecoes";
import { contrapartidaDa, dadosBancariosMudaram, podeExcluirPagamento, podeAprovar, quemAprova, podeCancelar, podeConferir, podeCorrigir, podePagar, proximoNumero, type Resposta } from "./regras";
import type { AnexoRef, ConfigAprovacao, Fornecedor, Pagamento } from "./tipos";

/**
 * Passos da aprovação de pagamentos. Toda ação passa pelas regras de
 * `regras.ts` (quem pode o quê) e deixa uma linha no histórico do pedido.
 */

const agora = () => new Date().toISOString();
const rotulo = (p: Pagamento) => `${p.numero} · ${p.favorecido} · ${formatBRL(p.valor)}`;

function alterar(id: string, autor: string, texto: string, mudar: (p: Pagamento) => Partial<Pagamento>) {
  pagamentos.atualizar((lista) => lista.map((p) => (p.id === id ? { ...p, ...mudar(p), historico: [...p.historico, { quando: agora(), autor, texto }] } : p)));
}

const achar = (id: string) => pagamentos.ler().find((p) => p.id === id) ?? null;
const recusa = (resposta: Resposta) => (resposta.ok ? null : resposta.motivo);

export type Pedido = Omit<Pagamento, "id" | "numero" | "status" | "solicitanteId" | "solicitante" | "solicitadoEm" | "conferencia" | "aprovacao" | "pagamento" | "motivo" | "historico">;

export function solicitarPagamento(pedido: Pedido, usuario: Usuario): Pagamento {
  const novo: Pagamento = {
    ...pedido,
    id: gerarId("pg"),
    numero: proximoNumero(pagamentos.ler()),
    status: "Em conferência",
    solicitanteId: usuario.id,
    solicitante: usuario.nome,
    solicitadoEm: HOJE,
    conferencia: null,
    aprovacao: null,
    pagamento: null,
    motivo: "",
    historico: [{ quando: agora(), autor: usuario.nome, texto: pedido.urgente ? "Pagamento solicitado (urgente)." : "Pagamento solicitado." }],
  };
  pagamentos.atualizar((lista) => [...lista, novo]);
  notificar({ tipo: pedido.urgente ? "atencao" : "tarefa", titulo: `${pedido.urgente ? "Pagamento urgente" : "Novo pagamento"} para conferir`, corpo: `${rotulo(novo)} — pedido por ${usuario.nome}.`, destino: "/contas/pagamentos", exige: "pagamentos.conferir" });
  return novo;
}

/** Quem pediu corrige o que foi devolvido e reenvia para conferência. */
export function reenviar(id: string, pedido: Pedido, usuario: Usuario): string | null {
  const pagamento = achar(id);
  if (!pagamento || !podeCorrigir(usuario, pagamento)) return "Só se corrige pedido devolvido, por quem pediu ou pelo financeiro.";
  alterar(id, usuario.nome, "Corrigido e reenviado para conferência.", () => ({ ...pedido, status: "Em conferência", motivo: "", conferencia: null, aprovacao: null }));
  return null;
}

export function conferir(id: string, usuario: Usuario): string | null {
  const pagamento = achar(id);
  if (!pagamento) return "Pagamento não encontrado.";
  const erro = recusa(podeConferir(usuario, pagamento));
  if (erro) return erro;
  alterar(id, usuario.nome, "Conferido: documento, valor e dados de pagamento ok.", () => ({ status: "Aguardando aprovação", conferencia: { porId: usuario.id, por: usuario.nome, em: agora() } }));
  notificar({
    tipo: pagamento.urgente ? "atencao" : "tarefa",
    titulo: "Pagamento aguardando aprovação",
    corpo: `${rotulo(pagamento)} — aprova: ${quemAprova(pagamento, usuarios.ler(), configAprovacao.ler(), HOJE)}.`,
    destino: "/contas/pagamentos/aprovacoes",
    exige: "pagamentos.aprovar",
  });
  return null;
}

/** Devolver: na conferência (financeiro) ou na aprovação (aprovador). Motivo obrigatório. */
export function devolver(id: string, motivo: string, usuario: Usuario): string | null {
  const pagamento = achar(id);
  if (!pagamento) return "Pagamento não encontrado.";
  if (!motivo.trim()) return "Diga o que precisa ser corrigido.";
  const permitido = pagamento.status === "Em conferência" ? podeConferir(usuario, pagamento) : podeAprovar(usuario, pagamento, configAprovacao.ler(), HOJE, usuarios.ler());
  const erro = recusa(permitido);
  if (erro) return erro;
  const naAprovacao = pagamento.status === "Aguardando aprovação";
  alterar(id, usuario.nome, `Devolvido: ${motivo.trim()}`, () => ({
    status: "Devolvido",
    motivo: motivo.trim(),
    ...(naAprovacao ? { decisao: { porId: usuario.id, por: usuario.nome, em: agora() } } : {}),
  }));
  notificar({ tipo: "atencao", titulo: "Pagamento devolvido para correção", corpo: `${rotulo(pagamento)} — ${motivo.trim()}`, destino: "/contas/pagamentos" });
  return null;
}

/**
 * Aprovar. Se o fornecedor trocou os dados bancários, o aprovador precisa
 * confirmar que os validou por telefone — e o fornecedor fica validado.
 */
export function aprovar(id: string, usuario: Usuario, dadosConfirmados = false): string | null {
  const pagamento = achar(id);
  if (!pagamento) return "Pagamento não encontrado.";
  const erro = recusa(podeAprovar(usuario, pagamento, configAprovacao.ler(), HOJE, usuarios.ler()));
  if (erro) return erro;
  const fornecedor = fornecedores.ler().find((f) => f.id === pagamento.fornecedorId);
  if (fornecedor && !fornecedor.dadosValidados) {
    if (!dadosConfirmados) return `Os dados bancários de ${fornecedor.nome} mudaram: confirme com o fornecedor por telefone antes de aprovar.`;
    validarFornecedor(fornecedor.id, usuario.nome);
  }
  const quem = { porId: usuario.id, por: usuario.nome, em: agora() };
  alterar(id, usuario.nome, "Aprovado.", () => ({ status: "Aprovado", aprovacao: quem, decisao: quem }));
  notificar({ tipo: "sucesso", titulo: "Pagamento aprovado", corpo: `${rotulo(pagamento)} — pode ser pago.`, destino: "/contas/pagamentos", exige: "pagamentos.pagar" });
  return null;
}

export function reprovar(id: string, motivo: string, usuario: Usuario): string | null {
  const pagamento = achar(id);
  if (!pagamento) return "Pagamento não encontrado.";
  if (!motivo.trim()) return "Diga por que o pagamento foi reprovado.";
  const erro = recusa(podeAprovar(usuario, pagamento, configAprovacao.ler(), HOJE, usuarios.ler()));
  if (erro) return erro;
  alterar(id, usuario.nome, `Reprovado: ${motivo.trim()}`, () => ({ status: "Reprovado", motivo: motivo.trim(), decisao: { porId: usuario.id, por: usuario.nome, em: agora() } }));
  notificar({ tipo: "atencao", titulo: "Pagamento reprovado", corpo: `${rotulo(pagamento)} — ${motivo.trim()}`, destino: "/contas/pagamentos" });
  return null;
}

/**
 * Registrar o pagamento feito no banco. Lança a saída no razão da conta
 * escolhida (a conciliação casa com o débito do extrato) e, se o pedido veio
 * de um lote de prestador, marca o lote como pago — o portal vê na hora.
 */
export function registrarPagamento(id: string, dados: { data: string; contaId: string | null; comprovante: AnexoRef | null }, usuario: Usuario): string | null {
  const pagamento = achar(id);
  if (!pagamento) return "Pagamento não encontrado.";
  const erro = recusa(podePagar(usuario, pagamento));
  if (erro) return erro;
  const conta = contasBancarias.ler().find((c) => c.id === dados.contaId) ?? null;
  alterar(id, usuario.nome, `Pago${conta ? ` no ${conta.banco} · ${conta.empresa}` : ""} em ${dados.data.split("-").reverse().join("/")}.`, () => ({
    status: "Pago",
    pagamento: { porId: usuario.id, por: usuario.nome, ...dados },
  }));
  if (conta) {
    razao.atualizar((lista) => [
      ...lista,
      {
        id: gerarId("raz"),
        contaId: conta.id,
        data: dados.data,
        descricao: `${pagamento.numero} — ${pagamento.favorecido}`,
        documento: pagamento.numero,
        valor: -pagamento.valor,
        origem: pagamento.origem === "Prestadores" ? "Prestadores" : "Contas a pagar",
        // Para lote de prestador, a mesma chave que a conciliação usa: não entra duas vezes.
        origemId: pagamento.origemId ?? pagamento.id,
        contrapartida: contrapartidaDa(pagamento.categoria),
      },
    ]);
  }
  if (pagamento.origem === "Prestadores" && pagamento.origemId) {
    const [prestadorId, competencia] = pagamento.origemId.split("|");
    marcarPago(prestadorId, competencia, usuario.nome);
  }
  notificar({ tipo: "sucesso", titulo: "Pagamento realizado", corpo: rotulo(pagamento), destino: "/contas/pagamentos" });
  return null;
}

export function cancelar(id: string, motivo: string, usuario: Usuario): string | null {
  const pagamento = achar(id);
  if (!pagamento || !podeCancelar(usuario, pagamento)) return "Só quem pediu ou o financeiro cancela, e só antes do pagamento.";
  if (!motivo.trim()) return "Diga por que o pedido foi cancelado.";
  alterar(id, usuario.nome, `Cancelado: ${motivo.trim()}`, () => ({ status: "Cancelado", motivo: motivo.trim() }));
  return null;
}

/** Exclui o pedido (e os documentos anexados). Pedido pago não sai: está no razão. */
export function excluirPagamento(id: string, usuario: Usuario): string | null {
  const pagamento = achar(id);
  if (!pagamento) return "Pagamento não encontrado.";
  const erro = recusa(podeExcluirPagamento(usuario, pagamento));
  if (erro) return erro;
  pagamentos.atualizar((lista) => lista.filter((p) => p.id !== id));
  pagamento.documentos.forEach((documento) => documento.anexoId && void apagarAnexo(documento.anexoId));
  return null;
}

/** Lote de prestador conferido vira pedido de pagamento já conferido: vai direto para aprovação. */
export function solicitarDoLote(lote: Lote, usuario: Usuario): Pagamento | null {
  const chave = `${lote.prestador.id}|${lote.competencia}`;
  const existente = pagamentos.ler().find((p) => p.origemId === chave && p.status !== "Cancelado" && p.status !== "Reprovado");
  if (existente) return existente;
  const novo: Pagamento = {
    id: gerarId("pg"),
    numero: proximoNumero(pagamentos.ler()),
    empresa: "PNST",
    fornecedorId: null,
    favorecido: lote.prestador.nome,
    descricao: `Recibos de ${formatMonth(lote.competencia)} — ${lote.recibos.length} recibo(s) conferido(s)`,
    categoria: "Correspondentes e prestadores",
    valor: Math.round(lote.total * 100) / 100,
    vencimento: HOJE,
    forma: "Pix",
    dadosPagamento: lote.prestador.documento || lote.prestador.email,
    cliente: "",
    caso: "",
    reembolsavel: false,
    urgente: false,
    justificativaUrgencia: "",
    documentos: documentosDoFechamento(lote.fechamento).length
      ? documentosDoFechamento(lote.fechamento).map((documento) => ({ anexoId: documento.id, nome: documento.nome }))
      : [{ anexoId: lote.fechamento.documentoUnico?.id ?? null, nome: lote.fechamento.documentoUnico?.nome ?? `Fechamento ${lote.competencia}.pdf` }],
    status: "Aguardando aprovação",
    solicitanteId: usuario.id,
    solicitante: usuario.nome,
    solicitadoEm: HOJE,
    // A conferência dos recibos já foi feita na tela de Conferência.
    conferencia: { porId: usuario.id, por: usuario.nome, em: agora() },
    aprovacao: null,
    pagamento: null,
    motivo: "",
    origem: "Prestadores",
    origemId: chave,
    historico: [{ quando: agora(), autor: usuario.nome, texto: "Pedido gerado pela conferência de prestadores (recibos conferidos)." }],
  };
  pagamentos.atualizar((lista) => [...lista, novo]);
  notificar({ tipo: "tarefa", titulo: "Pagamento aguardando aprovação", corpo: `${rotulo(novo)} — aprova: ${quemAprova(novo, usuarios.ler(), configAprovacao.ler(), HOJE)}.`, destino: "/contas/pagamentos/aprovacoes", exige: "pagamentos.aprovar" });
  return novo;
}

// ── Fornecedores e configuração ────────────────────────────────────────────

export function salvarFornecedor(dados: Fornecedor, autor: string) {
  const antes = fornecedores.ler().find((f) => f.id === dados.id);
  const mudou = antes ? dadosBancariosMudaram(antes, dados) : false;
  const texto = !antes ? "Fornecedor cadastrado." : mudou ? "Dados bancários alterados. Aguardando validação." : "Cadastro editado.";
  const registro: Fornecedor = {
    ...dados,
    dadosValidados: antes ? (mudou ? false : antes.dadosValidados) : true,
    historico: [...(antes?.historico ?? []), { quando: agora(), autor, texto }],
  };
  fornecedores.atualizar((lista) => gravarItem(lista, registro));
  if (mudou) notificar({ tipo: "atencao", titulo: "Dados bancários de fornecedor alterados", corpo: `${dados.nome}: confirme por telefone antes do próximo pagamento.`, destino: "/contas/pagamentos/fornecedores", exige: "pagamentos.fornecedores" });
}

/** Pedidos ainda em andamento que usam o fornecedor: enquanto houver, ele não sai. */
export function pedidosAbertosDoFornecedor(id: string) {
  const abertos = ["Em conferência", "Devolvido", "Aguardando aprovação", "Aprovado"];
  return pagamentos.ler().filter((p) => p.fornecedorId === id && abertos.includes(p.status));
}

/** Exclui o fornecedor. Pedidos já pagos ou encerrados guardam o nome do favorecido. */
export function excluirFornecedor(id: string): string | null {
  const abertos = pedidosAbertosDoFornecedor(id);
  if (abertos.length) return `Há ${abertos.length} pedido(s) em andamento com este fornecedor (${abertos.map((p) => p.numero).join(", ")}). Conclua ou cancele antes de excluir.`;
  fornecedores.atualizar((lista) => lista.filter((f) => f.id !== id));
  return null;
}

export function validarFornecedor(id: string, autor: string) {
  fornecedores.atualizar((lista) =>
    lista.map((f) => (f.id === id ? { ...f, dadosValidados: true, historico: [...f.historico, { quando: agora(), autor, texto: "Dados bancários validados por telefone." }] } : f)),
  );
}

export function salvarConfig(config: ConfigAprovacao) {
  configAprovacao.atualizar(() => config);
}
