import type { Empresa } from "@/modulos/conciliacao/tipos";

/**
 * Aprovação de pagamentos: quem precisa pagar pede; o financeiro confere o
 * documento e os dados; o chefe da administração aprova; o financeiro paga e
 * anexa o comprovante; o pagamento cai no razão e se concilia com o extrato.
 */

export const CATEGORIAS_PAGAMENTO = [
  "Custas processuais",
  "Correspondentes e prestadores",
  "Fornecedores",
  "Aluguel e condomínio",
  "Energia e telefonia",
  "Impostos e taxas",
  "Folha e benefícios",
  "Reembolso de despesas",
  "TI e software",
  "Outras despesas",
] as const;
export type CategoriaPagamento = (typeof CATEGORIAS_PAGAMENTO)[number];

export const FORMAS_PAGAMENTO = ["Boleto", "Pix", "TED", "Débito automático"] as const;
export type FormaPagamento = (typeof FORMAS_PAGAMENTO)[number];

export const STATUS_PAGAMENTO = ["Em conferência", "Devolvido", "Aguardando aprovação", "Aprovado", "Pago", "Reprovado", "Cancelado"] as const;
export type StatusPagamento = (typeof STATUS_PAGAMENTO)[number];

export type Fornecedor = {
  id: string;
  nome: string;
  documento: string;
  email: string;
  banco: string;
  agencia: string;
  conta: string;
  chavePix: string;
  /**
   * Dados bancários conferidos com o fornecedor. Volta a falso sempre que
   * banco, agência, conta ou Pix mudam: troca de conta é o golpe mais comum
   * contra o financeiro, e quem aprova precisa confirmar por telefone.
   */
  dadosValidados: boolean;
  historico: { quando: string; autor: string; texto: string }[];
};

export type AnexoRef = { anexoId: string | null; nome: string };

export type Pagamento = {
  id: string;
  /** PG-0001, sequencial: é o que se fala no telefone e se escreve no banco. */
  numero: string;
  empresa: Empresa;
  fornecedorId: string | null;
  favorecido: string;
  descricao: string;
  categoria: CategoriaPagamento;
  valor: number;
  vencimento: string;
  forma: FormaPagamento;
  /** Linha digitável, chave Pix ou banco/agência/conta, conforme a forma. */
  dadosPagamento: string;
  /** Centro de custo: cliente e caso a que o gasto pertence. */
  cliente: string;
  caso: string;
  reembolsavel: boolean;
  urgente: boolean;
  justificativaUrgencia: string;
  documentos: AnexoRef[];
  status: StatusPagamento;
  solicitanteId: string;
  solicitante: string;
  solicitadoEm: string;
  conferencia: { porId: string; por: string; em: string } | null;
  aprovacao: { porId: string; por: string; em: string } | null;
  /** Quem decidiu na etapa de aprovação (aprovou, reprovou ou devolveu). */
  decisao?: { porId: string; por: string; em: string } | null;
  pagamento: { porId: string; por: string; data: string; contaId: string | null; comprovante: AnexoRef | null } | null;
  /** Motivo da última devolução, reprovação ou cancelamento. */
  motivo: string;
  origem: "Solicitação" | "Prestadores";
  /** Lote de prestador (prestadorId|competência) quando veio da conferência. */
  origemId: string | null;
  historico: { quando: string; autor: string; texto: string }[];
};

/** Quem aprova. O substituto vale só no período informado (férias, ausência). */
export type ConfigAprovacao = {
  aprovadorId: string;
  substitutoId: string | null;
  substitutoDe: string | null;
  substitutoAte: string | null;
};
