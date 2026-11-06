import type { ArquivoAnexo } from "@/lib/portal";
import type { CategoriaPrestador } from "@/modulos/prestadores/tipos";

export const SITUACOES_SERVICO = ["Solicitado", "Aceito", "Em execução", "Concluído", "Recusado", "Cancelado"] as const;
export type SituacaoServico = (typeof SITUACOES_SERVICO)[number];

export type PassoServico = { quando: string; autor: string; texto: string };

/** O que o prestador informa ao concluir: vira o recibo. */
export type ExecucaoServico = {
  valor: number;
  data: string;
  observacao: string;
  comprovantes: ArquivoAnexo[];
};

/**
 * Pedido de serviço da equipe a um prestador escolhido. O prestador vê no
 * portal, aceita ou recusa, executa e conclui; ao concluir nasce o recibo.
 */
export type Servico = {
  id: string;
  /** SV-0001 — no banco real o número é dado pelo servidor. */
  numero: string;
  categoria: CategoriaPrestador;
  prestadorId: string;
  solicitanteId: string;
  solicitante: string;
  /** Cliente / caso, como no recibo. */
  cliente: string;
  /** Instruções para o prestador. */
  descricao: string;
  /** Data desejada (YYYY-MM-DD) e horário opcional (HH:MM). */
  data: string;
  horario: string;
  urgente: boolean;
  /** Campos próprios da categoria (retirada, entrega, cartório...). */
  detalhes: Record<string, string>;
  situacao: SituacaoServico;
  criadoEm: string;
  aceitoEm: string | null;
  iniciadoEm: string | null;
  concluidoEm: string | null;
  motivoRecusa: string;
  motivoCancelamento: string;
  /** Prestadores que já recusaram este pedido (reencaminhado depois). */
  recusadoPor: string[];
  execucao: ExecucaoServico | null;
  reciboId: string | null;
  historico: PassoServico[];
};

export type CampoCategoria = { chave: string; rotulo: string; obrigatorio?: boolean; placeholder?: string; opcoes?: string[]; largo?: boolean };

/** O formulário se adapta ao tipo de serviço. */
export const CAMPOS_DA_CATEGORIA: Record<CategoriaPrestador, CampoCategoria[]> = {
  Motoboy: [
    { chave: "origem", rotulo: "Retirar em", obrigatorio: true, placeholder: "Endereço de retirada", largo: true },
    { chave: "destino", rotulo: "Entregar em", obrigatorio: true, placeholder: "Endereço de entrega", largo: true },
    { chave: "contato", rotulo: "Falar com", placeholder: "Nome e telefone no local" },
    { chave: "trajeto", rotulo: "Trajeto", opcoes: ["Só ida", "Ida e volta"] },
  ],
  Cartório: [
    { chave: "cartorio", rotulo: "Cartório", obrigatorio: true, placeholder: "Ex.: 2º Tabelião de Notas" },
    { chave: "ato", rotulo: "Ato / documento", obrigatorio: true, placeholder: "Ex.: reconhecimento de firma, certidão" },
    { chave: "quantidade", rotulo: "Quantidade", placeholder: "Ex.: 3 vias" },
  ],
  Correio: [
    { chave: "modalidade", rotulo: "Modalidade", obrigatorio: true, opcoes: ["Sedex", "Sedex 10", "PAC", "Carta registrada", "Carta com AR"] },
    { chave: "retirada", rotulo: "Retirar em", placeholder: "Onde buscar o envio" },
    { chave: "destinatario", rotulo: "Destinatário e endereço", obrigatorio: true, largo: true },
  ],
  SAESP: [
    { chave: "local", rotulo: "Órgão / local", obrigatorio: true, placeholder: "Ex.: Fórum João Mendes" },
    { chave: "processo", rotulo: "Nº do processo / protocolo" },
    { chave: "ato", rotulo: "O que fazer", obrigatorio: true, placeholder: "Ex.: protocolar petição, retirar alvará" },
  ],
  Outros: [{ chave: "local", rotulo: "Local", placeholder: "Onde o serviço acontece", largo: true }],
};
