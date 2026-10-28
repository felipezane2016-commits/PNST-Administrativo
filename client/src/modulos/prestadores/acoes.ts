import { HOJE, gerarId } from "@/_core/tempo";
import { apagarAnexo } from "@/_core/armazenamento/anexos";
import {
  anexosDoRecibo,
  competenciaOf,
  documentosDoFechamento,
  formatBRL,
  formatMonth,
  formatMonthTitle,
  parseAmount,
  type ArquivoAnexo,
  type Closing,
  type PrototypeReceiptStatus,
  type Receipt,
  type ReceiptDraft,
  type RegistroRecibo,
  type TipoRegistro,
} from "@/lib/portal";
import { notificar } from "@/modulos/notificacoes/colecao";
import { fechamentos, prestadores, recibos, registros } from "./colecoes";
import { recibosDoLote } from "./regras";
import type { Prestador } from "./tipos";

/** Mutações da conferência e do cadastro. Toda escrita passa pelas coleções. */

const agora = () => new Date().toISOString();
const nomeDoPrestador = (id: string) => prestadores.ler().find((prestador) => prestador.id === id)?.nome ?? "Prestador";
const chaveDe = (prestadorId: string, competencia: string) => (f: Closing) => f.prestadorId === prestadorId && f.competencia === competencia;

/** Anota no histórico de atividades (quem, o quê, quando). */
export function registrar(
  prestadorId: string,
  tipo: TipoRegistro,
  acao: string,
  usuario: string,
  detalhes = "",
  reciboId: string | null = null,
  arquivo?: RegistroRecibo["arquivo"],
) {
  const registro: RegistroRecibo = { id: gerarId("log"), prestadorId, tipo, acao, reciboId, usuario, dataHora: agora(), detalhes, ...(arquivo ? { arquivo } : {}) };
  registros.atualizar((lista) => [registro, ...lista]);
}

/** Campos do recibo que vêm do formulário. */
export function camposDoRascunho(draft: ReceiptDraft) {
  return {
    competencia: competenciaOf(draft.serviceDate),
    serviceDate: draft.serviceDate,
    category: draft.category,
    client: draft.client.trim(),
    caseRef: draft.caseRef.trim(),
    requester: draft.requester.trim(),
    description: draft.description.trim(),
    amount: parseAmount(draft.amount),
    anexos: draft.anexos,
    attachmentName: null,
    attachmentId: null,
    updatedAt: agora(),
  };
}

/** Apaga do armazenamento os arquivos que saíram da lista. */
export function apagarArquivosRemovidos(antes: ArquivoAnexo[], depois: ArquivoAnexo[]) {
  const ficam = new Set(depois.map((arquivo) => arquivo.id));
  antes.filter((arquivo) => arquivo.id && !ficam.has(arquivo.id)).forEach((arquivo) => void apagarAnexo(arquivo.id!));
}

/** O escritório corrige um recibo; a situação não muda. */
export function atualizarRecibo(id: string, draft: ReceiptDraft, autor: string) {
  const alvo = recibos.ler().find((recibo) => recibo.id === id);
  if (!alvo) return;
  recibos.atualizar((lista) => lista.map((recibo) => (recibo.id === id ? { ...recibo, ...camposDoRascunho(draft) } : recibo)));
  apagarArquivosRemovidos(anexosDoRecibo(alvo), draft.anexos);
  registrar(alvo.prestadorId, "edicao", "Recibo editado pelo escritório", autor, `Status: ${alvo.status}`, id);
}

/** Remove o recibo e os arquivos anexados a ele. */
export function excluirRecibo(id: string, autor: string) {
  const alvo = recibos.ler().find((recibo) => recibo.id === id);
  if (!alvo) return;
  recibos.atualizar((lista) => lista.filter((recibo) => recibo.id !== id));
  anexosDoRecibo(alvo).forEach((arquivo) => arquivo.id && void apagarAnexo(arquivo.id));
  registrar(alvo.prestadorId, "exclusao", "Recibo excluído", autor, `${alvo.client} · ${formatBRL(alvo.amount)}`, id);
}

/** Muda a situação de todos os recibos do lote (e, se vier, a observação). */
function mudarRecibosDoLote(fechamento: Closing, status: PrototypeReceiptStatus, nota?: string | null) {
  const ids = new Set(recibosDoLote(recibos.ler(), fechamento).map((recibo) => recibo.id));
  recibos.atualizar((lista) =>
    lista.map((recibo) =>
      ids.has(recibo.id) ? { ...recibo, status, updatedAt: agora(), ...(nota !== undefined ? { reviewNote: nota } : {}) } : recibo,
    ),
  );
}

function mudarLote(prestadorId: string, competencia: string, mudanca: Partial<Closing>) {
  fechamentos.atualizar((lista) => lista.map((item) => (chaveDe(prestadorId, competencia)(item) ? { ...item, ...mudanca } : item)));
}

const fechamentoDe = (prestadorId: string, competencia: string) => fechamentos.ler().find(chaveDe(prestadorId, competencia)) ?? null;

/** Finaliza a conferência: todos os recibos do lote ficam aprovados. */
export function finalizarConferencia(prestadorId: string, competencia: string, autor = "Escritório") {
  const fechamento = fechamentoDe(prestadorId, competencia);
  if (!fechamento) return;
  mudarRecibosDoLote(fechamento, "Aprovado", null);
  mudarLote(prestadorId, competencia, { review: "Conferido", conferidoEm: agora(), obs: null });
  const nome = nomeDoPrestador(prestadorId);
  registrar(prestadorId, "aprovacao", "Conferência finalizada", autor, `${nome} · ${formatMonthTitle(competencia)} · ${formatBRL(fechamento.valorTotal ?? 0)}`);
  notificar({
    tipo: "sucesso",
    titulo: "Conferência finalizada",
    corpo: `${nome} — ${formatMonth(competencia)} conferido, aguardando pagamento.`,
    destino: "/prestadores/conferencia",
  });
}

/** Rejeita o lote inteiro: os recibos ficam rejeitados, com o motivo. */
export function rejeitarLote(prestadorId: string, competencia: string, motivo: string, autor: string) {
  const fechamento = fechamentoDe(prestadorId, competencia);
  if (!fechamento) return;
  mudarRecibosDoLote(fechamento, "Rejeitado", motivo.trim() || null);
  mudarLote(prestadorId, competencia, { review: "Rejeitado", obs: motivo.trim() || null });
  registrar(prestadorId, "status", "Lote rejeitado", autor, `Competência: ${formatMonthTitle(competencia)}${motivo.trim() ? ` · ${motivo.trim()}` : ""}`);
}

/** Devolve o lote para o prestador ajustar: os recibos voltam com a observação. */
export function solicitarAjusteLote(prestadorId: string, competencia: string, observacao: string, autor: string) {
  const fechamento = fechamentoDe(prestadorId, competencia);
  if (!fechamento) return;
  mudarRecibosDoLote(fechamento, "Ajuste solicitado", observacao.trim());
  mudarLote(prestadorId, competencia, { review: "Em conferência", obs: observacao.trim() });
  registrar(prestadorId, "status", "Ajuste solicitado", autor, observacao.trim());
}

/** Lote pago: pelo botão da conferência ou pelo pagamento aprovado e pago. */
export function marcarPago(prestadorId: string, competencia: string, autor = "Financeiro") {
  const fechamento = fechamentoDe(prestadorId, competencia);
  if (!fechamento || fechamento.review !== "Conferido") return;
  mudarRecibosDoLote(fechamento, "Pago");
  mudarLote(prestadorId, competencia, { review: "Pago", paidAt: HOJE });
  registrar(prestadorId, "pagamento", "Lote marcado como pago", autor, formatBRL(fechamento.valorTotal ?? 0));
}

/** Exclui o lote: some o fechamento e os recibos dele, com os arquivos. */
export function excluirLote(prestadorId: string, competencia: string, autor: string) {
  const fechamento = fechamentoDe(prestadorId, competencia);
  if (!fechamento) return;
  const doLote = recibosDoLote(recibos.ler(), fechamento);
  const ids = new Set(doLote.map((recibo) => recibo.id));
  recibos.atualizar((lista) => lista.filter((recibo) => !ids.has(recibo.id)));
  fechamentos.atualizar((lista) => lista.filter((item) => !chaveDe(prestadorId, competencia)(item)));
  const arquivos = [...doLote.flatMap(anexosDoRecibo), ...documentosDoFechamento(fechamento), ...(fechamento.documentoUnico ? [fechamento.documentoUnico] : [])];
  arquivos.forEach((arquivo) => arquivo.id && void apagarAnexo(arquivo.id));
  registrar(prestadorId, "exclusao", "Lote excluído", autor, `Competência: ${formatMonthTitle(competencia)} · ${nomeDoPrestador(prestadorId)}`);
}

/** Guarda o documento único (recibos + comprovantes + NF) gerado na finalização. */
export function guardarDocumentoUnico(prestadorId: string, competencia: string, arquivo: ArquivoAnexo, autor: string) {
  const anterior = fechamentoDe(prestadorId, competencia)?.documentoUnico;
  mudarLote(prestadorId, competencia, { documentoUnico: arquivo });
  if (anterior?.id && anterior.id !== arquivo.id) void apagarAnexo(anterior.id);
  registrar(prestadorId, "arquivo", "Documento único gerado", autor, arquivo.nome, null, { ...arquivo, competencia });
}

export function salvarPrestador(dados: Prestador) {
  prestadores.atualizar((lista) =>
    lista.some((prestador) => prestador.id === dados.id)
      ? lista.map((prestador) => (prestador.id === dados.id ? dados : prestador))
      : [...lista, dados],
  );
}

/** Guarda o dia do convite do portal (o e-mail saiu pela função `convidar`). */
export function registrarConvitePortal(id: string) {
  prestadores.atualizar((lista) => lista.map((prestador) => (prestador.id === id ? { ...prestador, convidadoEm: HOJE } : prestador)));
}

/** O portal autentica contra o cadastro feito no admin. */
export function autenticarPrestador(codigo: string, senha: string): Prestador | null {
  const alvo = codigo.trim().toUpperCase();
  const encontrado = prestadores.ler().find((prestador) => prestador.codigoAcesso.toUpperCase() === alvo);
  if (!encontrado || encontrado.senha !== senha || !encontrado.portalAtivo) return null;
  return encontrado;
}

/** Avisa o escritório quando um prestador envia o fechamento pelo portal. */
export function avisarFechamentoRecebido(prestadorId: string, competencia: string, quantidade: number, total: number) {
  notificar({
    tipo: "documento",
    titulo: `Fechamento de ${formatMonth(competencia).split(" ")[0]} recebido`,
    corpo: `${nomeDoPrestador(prestadorId)} enviou ${quantidade} recibo(s) (${formatBRL(total)}) para conferência.`,
    destino: "/prestadores/conferencia",
  });
}
