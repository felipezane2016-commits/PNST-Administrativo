import { apagarAnexo } from "@/_core/armazenamento/anexos";
import { criarColecao, useColecao } from "@/_core/armazenamento/colecao";
import {
  closingTotal,
  competenciaOf,
  nextReceiptId,
  parseAmount,
  type Closing,
  type Provider,
  type Receipt,
  type ReceiptDraft,
} from "@/lib/portal";
import { DEMO_COMPETENCIA } from "@/lib/portalSeed";
import { autenticarPrestador, avisarFechamentoRecebido } from "@/modulos/prestadores/acoes";
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
  submitReceipt: (id: string) => void;
  removeReceipt: (id: string) => void;
  closingFor: (competencia: string) => Closing;
  attachClosingDocument: (competencia: string, documentName: string | null, documentId?: string | null) => void;
  submitClosing: (competencia: string) => void;
};

const PortalContext = createContext<PortalContextValue | null>(null);

const SEM_PRESTADOR: Provider = { name: "", code: "", document: "", email: "", contract: "" };

function proximoReciboDoPrestador(lista: Receipt[], codigo: string) {
  const prefixo = `REC-${codigo.replace(/^PNST-/i, "")}-`;
  const maior = lista.reduce((max, recibo) => (recibo.id.startsWith(prefixo) ? Math.max(max, Number(recibo.id.slice(prefixo.length)) || 0) : max), 0);
  return `${prefixo}${String(maior + 1).padStart(4, "0")}`;
}

function emptyClosing(prestadorId: string, competencia: string): Closing {
  return { prestadorId, competencia, documentName: null, submitted: false, submittedAt: null, review: null };
}

function draftToFields(draft: ReceiptDraft) {
  return {
    competencia: competenciaOf(draft.serviceDate),
    serviceDate: draft.serviceDate,
    category: draft.category,
    client: draft.client.trim(),
    caseRef: draft.caseRef.trim(),
    requester: draft.requester.trim(),
    description: draft.description.trim(),
    amount: parseAmount(draft.amount),
    attachmentName: draft.attachmentName,
    attachmentId: draft.attachmentId,
  };
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
        ...draftToFields(draft),
        status: "Rascunho",
        reviewNote: null,
        createdAt: new Date().toISOString(),
      };
      recibos.atualizar((lista) => [created, ...lista]);
      return created;
    },
    [meuId, prestador?.codigoAcesso],
  );

  const updateReceipt = useCallback(
    (id: string, draft: ReceiptDraft) => {
      const fields = draftToFields(draft);
      recibos.atualizar((lista) =>
        lista.map((recibo) =>
          recibo.id === id && meus(recibo)
            ? {
                ...recibo,
                ...fields,
                // Reeditar um recibo devolvido volta à fila: limpa a devolutiva
                // e reabre como rascunho para novo envio.
                status: recibo.status === "Rejeitado" ? "Rascunho" : recibo.status,
                reviewNote: recibo.status === "Rejeitado" ? null : recibo.reviewNote,
              }
            : recibo,
        ),
      );
    },
    [meus],
  );

  const submitReceipt = useCallback(
    (id: string) => {
      recibos.atualizar((lista) =>
        lista.map((recibo) =>
          recibo.id === id && meus(recibo) && recibo.status !== "Aprovado"
            ? { ...recibo, status: "Enviado", reviewNote: null }
            : recibo,
        ),
      );
    },
    [meus],
  );

  const removeReceipt = useCallback(
    (id: string) => {
      const alvo = recibos.ler().find((recibo) => recibo.id === id && meus(recibo));
      if (!alvo) return;
      recibos.atualizar((lista) => lista.filter((recibo) => recibo !== alvo && recibo.id !== id));
      if (alvo.attachmentId) void apagarAnexo(alvo.attachmentId);
    },
    [meus],
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

  const attachClosingDocument = useCallback(
    (competencia: string, documentName: string | null, documentId: string | null = null) => {
      const anterior = closingFor(competencia).documentId;
      upsertClosing(competencia, { documentName, documentId });
      if (anterior && anterior !== documentId) void apagarAnexo(anterior);
    },
    [upsertClosing, closingFor],
  );

  const submitClosing = useCallback(
    (competencia: string) => {
      // Enviar o fechamento também encaminha os rascunhos da competência.
      recibos.atualizar((lista) =>
        lista.map((recibo) =>
          meus(recibo) && recibo.competencia === competencia && recibo.status === "Rascunho"
            ? { ...recibo, status: "Enviado" }
            : recibo,
        ),
      );
      upsertClosing(competencia, {
        submitted: true,
        submittedAt: new Date().toISOString(),
        review: "Aguardando conferência",
      });
      const doMes = recibos.ler().filter((recibo) => meus(recibo) && recibo.competencia === competencia);
      const validos = doMes.filter((recibo) => recibo.status !== "Rejeitado");
      avisarFechamentoRecebido(meuId, competencia, validos.length, closingTotal(doMes));
    },
    [meus, meuId, upsertClosing],
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
      submitReceipt,
      removeReceipt,
      closingFor,
      attachClosingDocument,
      submitClosing,
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
      submitReceipt,
      removeReceipt,
      closingFor,
      attachClosingDocument,
      submitClosing,
    ],
  );

  return <PortalContext.Provider value={value}>{children}</PortalContext.Provider>;
}

export function usePortal() {
  const context = useContext(PortalContext);
  if (!context) throw new Error("usePortal precisa estar dentro de <PortalProvider>.");
  return context;
}
