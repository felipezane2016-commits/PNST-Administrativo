import { criarColecao } from "@/_core/armazenamento/colecao";

export type TipoNotificacao = "atencao" | "tarefa" | "sucesso" | "agenda" | "documento" | "informacao";

export type Notificacao = {
  id: string;
  tipo: TipoNotificacao;
  titulo: string;
  corpo: string;
  /** ISO. */
  quando: string;
  lida: boolean;
  /** Rota do admin que resolve o assunto. */
  destino: string | null;
};

const NOTIFICACOES_DEMO: Notificacao[] = [
  {
    id: "not-1",
    tipo: "documento",
    titulo: "Fechamento de junho recebido",
    corpo: "Rota Leve Entregas enviou 3 recibos (R$ 375,00) para conferência.",
    quando: "2026-06-28T18:00:00.000Z",
    lida: false,
    destino: "/prestadores/conferencia",
  },
  {
    id: "not-2",
    tipo: "atencao",
    titulo: "Recibo devolvido sem correção",
    corpo: "Marina Corrêa Diligências — REC-0144 foi devolvido e ainda não voltou corrigido.",
    quando: "2026-06-26T09:10:00.000Z",
    lida: false,
    destino: "/prestadores/historico",
  },
  {
    id: "not-3",
    tipo: "tarefa",
    titulo: "FGTS vence em 19/07",
    corpo: "Tarefa de Impostos pendente no Account Management.",
    quando: "2026-06-25T08:00:00.000Z",
    lida: true,
    destino: "/contas",
  },
  {
    id: "not-4",
    tipo: "sucesso",
    titulo: "Conferência finalizada",
    corpo: "Apoio Forense Paulista — junho de 2026 conferido, aguardando pagamento.",
    quando: "2026-06-27T16:30:00.000Z",
    lida: true,
    destino: "/prestadores/conferencia",
  },
];

export const notificacoes = criarColecao<Notificacao[]>("notificacoes", () => NOTIFICACOES_DEMO, {
  // O prestador avisa o escritório mas não lê as notificações: grava sem ler de volta.
  remota: { tipo: "lista", tabela: "notificacoes", maisNovosPrimeiro: true, semRetorno: true },
  vazio: () => [] });

/** Ponto único para qualquer módulo avisar o escritório. */
export function notificar(aviso: Omit<Notificacao, "id" | "quando" | "lida">) {
  notificacoes.atualizar((lista) => [
    { ...aviso, id: `not-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, quando: new Date().toISOString(), lida: false },
    ...lista,
  ]);
}
