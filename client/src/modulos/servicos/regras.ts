import { pode, type Usuario } from "@/_core/identidade/permissoes";
import { parseAmount } from "@/lib/portal";
import type { Prestador } from "@/modulos/prestadores/tipos";
import { CAMPOS_DA_CATEGORIA, type Servico, type SituacaoServico } from "./tipos";

/** Regras dos pedidos de serviço. Espelha public.servico_transicao() no banco. */

export const ABERTAS: SituacaoServico[] = ["Solicitado", "Aceito", "Em execução"];
export const emAndamento = (s: Servico) => s.situacao === "Aceito" || s.situacao === "Em execução";

export const podeSolicitarServico = (usuario: Usuario | null) => pode(usuario, "prestadores.servicos.solicitar");
export const gerenciaServicos = (usuario: Usuario | null) => pode(usuario, "prestadores.servicos.gerenciar");

/** Quem acompanha todos vê tudo; os demais, só os próprios pedidos. */
export function servicosVisiveis(usuario: Usuario | null, lista: Servico[]) {
  if (gerenciaServicos(usuario)) return lista;
  if (!podeSolicitarServico(usuario)) return [];
  return lista.filter((s) => s.solicitanteId === usuario!.id);
}

const responde = (usuario: Usuario | null, s: Servico) => gerenciaServicos(usuario) || (podeSolicitarServico(usuario) && s.solicitanteId === usuario?.id);

export const podeCancelarServico = (usuario: Usuario | null, s: Servico) => responde(usuario, s) && (ABERTAS.includes(s.situacao) || s.situacao === "Recusado");
export const podeReencaminhar = (usuario: Usuario | null, s: Servico) => responde(usuario, s) && s.situacao === "Recusado";
export const podeExcluirServico = (usuario: Usuario | null, s: Servico) => gerenciaServicos(usuario) && (s.situacao === "Cancelado" || s.situacao === "Recusado");

/** Prestadores que podem receber o pedido: da categoria e com o portal ativo. */
export function prestadoresParaServico(prestadores: Prestador[], categoria: string, excluir: string[] = []) {
  return prestadores.filter((p) => p.categoria === categoria && p.portalAtivo && !excluir.includes(p.id)).sort((a, b) => a.nome.localeCompare(b.nome));
}

export type RascunhoServico = {
  categoria: Servico["categoria"];
  prestadorId: string;
  cliente: string;
  descricao: string;
  data: string;
  horario: string;
  urgente: boolean;
  detalhes: Record<string, string>;
};

export function validarSolicitacao(r: RascunhoServico): string | null {
  if (!r.prestadorId) return "Escolha o prestador que vai receber o pedido.";
  if (!r.cliente.trim()) return "Informe o cliente / caso.";
  if (!r.data) return "Informe a data do serviço.";
  for (const campo of CAMPOS_DA_CATEGORIA[r.categoria])
    if (campo.obrigatorio && !(r.detalhes[campo.chave] ?? "").trim()) return `Preencha "${campo.rotulo}".`;
  if (!r.descricao.trim()) return "Descreva o serviço para o prestador.";
  return null;
}

/** Passos do prestador no portal. */
export const podeAceitar = (s: Servico) => s.situacao === "Solicitado";
export const podeIniciar = (s: Servico) => s.situacao === "Aceito";
export const podeConcluir = (s: Servico) => emAndamento(s);

export type RascunhoConclusao = { valor: string; data: string; observacao: string };

export function validarConclusao(c: RascunhoConclusao): string | null {
  if (!(parseAmount(c.valor) > 0)) return "Informe o valor do serviço.";
  if (!c.data) return "Informe a data em que o serviço foi feito.";
  return null;
}

export function proximoNumeroServico(lista: Servico[]) {
  const maior = lista.reduce((max, s) => Math.max(max, Number(s.numero.replace(/\D/g, "")) || 0), 0);
  return `SV-${String(maior + 1).padStart(4, "0")}`;
}

/** Resumo de uma linha dos campos da categoria (ex.: "Rua A → Fórum"). */
export function resumoDoServico(s: Pick<Servico, "categoria" | "detalhes">) {
  const d = s.detalhes;
  if (s.categoria === "Motoboy" && d.origem && d.destino) return `${d.origem} → ${d.destino}`;
  return CAMPOS_DA_CATEGORIA[s.categoria]
    .map((campo) => d[campo.chave])
    .filter(Boolean)
    .join(" · ");
}

export const TOM_DA_SITUACAO: Record<SituacaoServico, string> = {
  Solicitado: "status-pill status-amber",
  Aceito: "status-pill status-blue",
  "Em execução": "status-pill status-blue",
  Concluído: "status-pill status-green",
  Recusado: "status-pill status-red",
  Cancelado: "status-pill status-neutral",
};
