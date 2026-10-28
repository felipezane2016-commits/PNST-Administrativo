import { apagarAnexo } from "@/_core/armazenamento/anexos";
import { criarColecao, useColecao } from "@/_core/armazenamento/colecao";
import {
  anexosDoRecibo,
  closingTotal,
  documentosDoFechamento,
  formatBRL,
  formatMonthTitle,
  nextReceiptId,
  receiptsForClosing,
  type ArquivoAnexo,
  type Closing,
  type PrototypeReceiptStatus,
  type Provider,
  type Receipt,
  type ReceiptDraft,
} from "@/lib/portal";
import { DEMO_COMPETENCIA } from "@/lib/portalSeed";
import { apagarArquivosRemovidos, autenticarPrestador, avisarFechamentoRecebido, camposDoRascunho, registrar } from "@/modulos/prestadores/acoes";
import { fechamentos, prestadores, recibos } from "@/modulos/prestadores/colecoes";
import { MODO_REAL } from "@/_core/supabase/modo";
import { HOJE } from "@/_core/tempo";
import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";

/**
 * Estado do Portal do Prestador. Os dados não moram aqui: recibos, fechamentos
 * e cadastro são coleções compartilhadas com o admin (`modulos/prestadores`).
 * Este contexto só filtra pelo prestador logado e traduz as ações do portal.
 */

type SessaoPortal = { prestadorId: string | null };
export const sessaoPortal = criarColecao<SessaoPortal>("sessao-portal", () => ({ prestadorId: null }));

type PortalContextValue = {
  provider: Provider;
  /** Id do prestador logado: pasta dos arquivos dele. */
  prestadorId: string;
  signedIn: boolean;
  receipts: Receipt[];
  closings: Closing[];
  currentCompetencia: string;
  /** Demonstração: código + senha do cadastro. Modo real: e-mail + senha do Supabase. */
  signIn: (code: string, password: string) => Promise<{ ok: true } | { ok: false; message: string }>;
  signOut: () => void;
  createReceipt: (draft: ReceiptDraft) => Receipt;
  updateReceipt: (id: string, draft: ReceiptDraft) => void;
  /** Rascunho → pendente de envio; ajuste solicitado → de volta à conferência. */
  setReceiptStatus: (id: string, status: PrototypeReceiptStatus) => void;
  removeReceipt: (id: string) => void;
  closingFor: (competencia: string) => Closing;
  /** Envia o mês para conferência, com a NF/fatura/boleto (opcionais). */
  submitClosing: (competencia: string, documentos: ArquivoAnexo[]) => { quantidade: number; total: number };
  /** Anota no histórico um arquivo gerado (relatório mensal) e guardado na pasta. */
  registerFile: (competencia: string, acao: string, arquivo: ArquivoAnexo) => void;
};

const PortalContext = createContext<PortalContextValue | null>(null);

const SEM_PRESTADOR: Provider = { name: "", code: "", document: "", email: "", contract: "" };

function proximoReciboDoPrestador(lista: Receipt[], codigo: string) {
  const prefixo = `REC-${codigo.replace(/^PNST-/i, "")}-`;
  const maior = lista.reduce((max, recibo) => (recibo.id.startsWith(prefixo) ? Math.max(max, Number(recibo.id.slice(prefixo.length)) || 0) : max), 0);
  return `${prefixo}${String(maior + 1).padStart(4, "0")}`;
}

function emptyClosing(prestadorId: string, competencia: string): Closing {
  return { prestadorId, competencia, submitted: false, submittedAt: null, review: null };
}

export function PortalProvider({ children }: { children: ReactNode }) {
  const sessao = useColecao(sessaoPortal);
  const todosPrestadores = useColecao(prestadores);
  const todosRecibos = useColecao(recibos);
  const todosFechamentos = useColecao(fechamentos);

  // Prestador desativado no admin perde o acesso mesmo com sessão aberta.
  const prestador = todosPrestadores.find((item) => item.id === sessao.prestadorId && item.portalAtivo) ?? null;
  const meuId = prestador?.id ?? "";

  const receipts = useMemo(() => todosRecibos.filter((recibo) => recibo.prestadorId === meuId), [todosRecibos, meuId]);
  const closings = useMemo(
    () => todosFechamentos.filter((fechamento) => fechamento.prestadorId === meuId),
    [todosFechamentos, meuId],
  );

  const provider = useMemo<Provider>(
    () =>
      prestador
        ? {
            name: prestador.nome,
            code: prestador.codigoAcesso,
            document: prestador.documento,
            email: prestador.email,
            contract: prestador.contrato,
          }
        : SEM_PRESTADOR,
    [prestador],
  );

  const signIn = useCallback(async (code: string, password: string) => {
    if (MODO_REAL) {
      const { entrarComSenha } = await import("@/_core/supabase/autenticacao");
      const resultado = await entrarComSenha(code, password, "prestador");
      return resultado.ok ? { ok: true as const } : { ok: false as const, message: resultado.mensagem };
    }
    const encontrado = autenticarPrestador(code, password);
    if (!encontrado) return { ok: false as const, message: "Código de acesso ou senha incorretos, ou acesso desativado." };
    sessaoPortal.atualizar(() => ({ prestadorId: encontrado.id }));
    return { ok: true as const };
  }, []);

  const signOut = useCallback(() => {
    if (MODO_REAL) void import("@/_core/supabase/autenticacao").then(({ sair }) => sair());
    else sessaoPortal.atualizar(() => ({ prestadorId: null }));
  }, []);

  /** Só mexe em recibo do próprio prestador — a coleção é de todos. */
  const meus = useCallback((recibo: Receipt) => recibo.prestadorId === meuId, [meuId]);

  const createReceipt = useCallback(
    (draft: ReceiptDraft) => {
      // O número é global: dois prestadores nunca recebem o mesmo REC-xxxx.
      const created: Receipt = {
        // No banco real cada prestador só enxerga os próprios recibos: o código
        // dele no número evita colisão com o de outro prestador.
        id: MODO_REAL ? proximoReciboDoPrestador(recibos.ler(), prestador?.codigoAcesso ?? meuId) : nextReceiptId(recibos.ler()),
        prestadorId: meuId,
        ...camposDoRascunho(draft),
        status: "Rascunho",
        reviewNote: null,
        createdAt: new Date().toISOString(),
      };
      recibos.atualizar((lista) => [created, ...lista]);
      registrar(meuId, "criacao", "Recibo criado", provider.name, `Cliente: ${created.client}`, created.id);
      if (draft.anexos.length) registrar(meuId, "upload", `${draft.anexos.length} arquivo(s) anexado(s)`, provider.name, draft.anexos.map((a) => a.nome).join(", "), created.id);
      return created;
    },
    [meuId, prestador?.codigoAcesso, provider.name],
  );

  // Como na referência: editar mantém a situação do recibo.
  const updateReceipt = useCallback(
    (id: string, draft: ReceiptDraft) => {
      const alvo = recibos.ler().find((recibo) => recibo.id === id && meus(recibo));
      if (!alvo) return;
      const antes = anexosDoRecibo(alvo);
      recibos.atualizar((lista) => lista.map((recibo) => (recibo.id === id ? { ...recibo, ...camposDoRascunho(draft) } : recibo)));
      apagarArquivosRemovidos(antes, draft.anexos);
      registrar(meuId, "edicao", "Recibo editado", provider.name, `Status: ${alvo.status}`, id);
      const novos = draft.anexos.filter((arquivo) => !antes.some((velho) => velho.id === arquivo.id));
      if (novos.length) registrar(meuId, "upload", `${novos.length} arquivo(s) anexado(s)`, provider.name, novos.map((a) => a.nome).join(", "), id);
    },
    [meus, meuId, provider.name],
  );

  const setReceiptStatus = useCallback(
    (id: string, status: PrototypeReceiptStatus) => {
      recibos.atualizar((lista) =>
        lista.map((recibo) => (recibo.id === id && meus(recibo) ? { ...recibo, status, updatedAt: new Date().toISOString() } : recibo)),
      );
      registrar(
        meuId,
        "status",
        status === "Pendente de envio" ? "Recibo marcado como pendente de envio" : "Recibo reenviado para conferência",
        provider.name,
        "",
        id,
      );
    },
    [meus, meuId, provider.name],
  );

  const removeReceipt = useCallback(
    (id: string) => {
      const alvo = recibos.ler().find((recibo) => recibo.id === id && meus(recibo));
      if (!alvo) return;
      recibos.atualizar((lista) => lista.filter((recibo) => recibo.id !== id));
      anexosDoRecibo(alvo).forEach((arquivo) => arquivo.id && void apagarAnexo(arquivo.id));
      registrar(meuId, "exclusao", "Recibo excluído", provider.name, `${alvo.client} · ${formatBRL(alvo.amount)}`, id);
    },
    [meus, meuId, provider.name],
  );

  const closingFor = useCallback(
    (competencia: string) =>
      closings.find((closing) => closing.competencia === competencia) ?? emptyClosing(meuId, competencia),
    [closings, meuId],
  );

  const upsertClosing = useCallback(
    (competencia: string, patch: Partial<Closing>) => {
      fechamentos.atualizar((lista) => {
        const existente = lista.find((item) => item.prestadorId === meuId && item.competencia === competencia);
        if (!existente) return [...lista, { ...emptyClosing(meuId, competencia), ...patch }];
        return lista.map((item) => (item === existente ? { ...item, ...patch } : item));
      });
    },
    [meuId],
  );

  const submitClosing = useCallback(
    (competencia: string, documentos: ArquivoAnexo[]) => {
      // Vão todos os recibos do mês, menos os rejeitados e arquivados.
      const itens = receiptsForClosing(recibos.ler().filter(meus), competencia);
      const ids = new Set(itens.map((recibo) => recibo.id));
      const total = closingTotal(itens);
      const agora = new Date().toISOString();
      recibos.atualizar((lista) => lista.map((recibo) => (ids.has(recibo.id) ? { ...recibo, status: "Enviado", updatedAt: agora } : recibo)));
      const anterior = fechamentos.ler().find((item) => item.prestadorId === meuId && item.competencia === competencia);
      upsertClosing(competencia, {
        submitted: true,
        submittedAt: agora,
        review: "Aguardando conferência",
        reciboIds: itens.map((recibo) => recibo.id),
        valorTotal: total,
        documentos,
        obs: null,
        documentName: null,
        documentId: null,
      });
      // Reenvio de lote rejeitado: os documentos antigos que não foram de novo saem.
      if (anterior) apagarArquivosRemovidos(documentosDoFechamento(anterior), documentos);
      registrar(
        meuId,
        "status",
        `Fechamento ${formatMonthTitle(competencia)} enviado`,
        provider.name,
        `${itens.length} recibo(s) · ${formatBRL(total)}${documentos.length ? ` · ${documentos.length} doc(s) complementar(es)` : ""}`,
      );
      avisarFechamentoRecebido(meuId, competencia, itens.length, total);
      return { quantidade: itens.length, total };
    },
    [meus, meuId, upsertClosing, provider.name],
  );

  const registerFile = useCallback(
    (competencia: string, acao: string, arquivo: ArquivoAnexo) => {
      registrar(meuId, "arquivo", acao, provider.name, arquivo.nome, null, { ...arquivo, competencia });
    },
    [meuId, provider.name],
  );

  const value = useMemo<PortalContextValue>(
    () => ({
      provider,
      prestadorId: meuId,
      signedIn: Boolean(prestador),
      receipts,
      closings,
      currentCompetencia: MODO_REAL ? HOJE.slice(0, 7) : DEMO_COMPETENCIA,
      signIn,
      signOut,
      createReceipt,
      updateReceipt,
      setReceiptStatus,
      removeReceipt,
      closingFor,
      submitClosing,
      registerFile,
    }),
    [
      provider,
      meuId,
      prestador,
      receipts,
      closings,
      signIn,
      signOut,
      createReceipt,
      updateReceipt,
      setReceiptStatus,
      removeReceipt,
      closingFor,
      submitClosing,
      registerFile,
    ],
  );

  return <PortalContext.Provider value={value}>{children}</PortalContext.Provider>;
}

export function usePortal() {
  const context = useContext(PortalContext);
  if (!context) throw new Error("usePortal precisa estar dentro de <PortalProvider>.");
  return context;
}
