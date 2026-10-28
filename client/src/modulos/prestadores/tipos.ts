import type { ClosingReview } from "@/lib/portal";

export const CATEGORIAS_PRESTADOR = ["Motoboy", "SAESP", "Cartório", "Correio", "Outros"] as const;
export type CategoriaPrestador = (typeof CATEGORIAS_PRESTADOR)[number];

export type Prestador = {
  id: string;
  nome: string;
  categoria: CategoriaPrestador;
  documento: string;
  email: string;
  telefone: string;
  /** Login do portal. Único entre prestadores. */
  codigoAcesso: string;
  /**
   * Senha do portal em texto puro: aceitável só porque não há backend e tudo
   * vive no navegador de quem demonstra. Com servidor, vira hash do lado dele.
   */
  senha: string;
  portalAtivo: boolean;
  contrato: string;
  desde: string;
  /** Modo real: dia em que o último convite do portal foi enviado. */
  convidadoEm?: string | null;
};

/** Situação de um lote (fechamento enviado) na conferência. */
export type SituacaoLote = ClosingReview;
