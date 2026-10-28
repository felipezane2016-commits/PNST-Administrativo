import { closingTotal, type Closing, type Receipt, type RegistroRecibo } from "@/lib/portal";
import { DEMO_CLOSINGS, DEMO_CREDENTIALS, DEMO_PROVIDER, DEMO_RECEIPTS, MARINA_ID } from "@/lib/portalSeed";
import type { Prestador } from "./tipos";

/**
 * Prestadores e recibos de demonstração. Nomes e documentos são fictícios —
 * o link do protótipo é compartilhável e não pode carregar dado real.
 */

export const PRESTADORES_DEMO: Prestador[] = [
  {
    id: MARINA_ID,
    nome: DEMO_PROVIDER.name,
    categoria: "Outros",
    documento: DEMO_PROVIDER.document,
    email: DEMO_PROVIDER.email,
    telefone: "(11) 98812-4410",
    codigoAcesso: DEMO_CREDENTIALS.code,
    senha: DEMO_CREDENTIALS.password,
    portalAtivo: true,
    contrato: DEMO_PROVIDER.contract,
    desde: "2025-02-10",
  },
  {
    id: "prest-rota",
    nome: "Rota Leve Entregas",
    categoria: "Motoboy",
    documento: "CNPJ 38.104.662/0001-09",
    email: "contato@rotaleve.com.br",
    telefone: "(11) 97730-1188",
    codigoAcesso: "PNST-3107",
    senha: "rotaleve26",
    portalAtivo: true,
    contrato: "Contrato de prestação PNST-3107",
    desde: "2024-08-01",
  },
  {
    id: "prest-apoio",
    nome: "Apoio Forense Paulista",
    categoria: "SAESP",
    documento: "CNPJ 29.551.840/0001-73",
    email: "financeiro@apoioforense.com.br",
    telefone: "(11) 3104-2290",
    codigoAcesso: "PNST-1180",
    senha: "apoio2026",
    portalAtivo: true,
    contrato: "Contrato de prestação PNST-1180",
    desde: "2023-11-15",
  },
  {
    id: "prest-oficio",
    nome: "Ofício Central de Notas",
    categoria: "Cartório",
    documento: "CNPJ 45.902.118/0001-50",
    email: "atendimento@oficiocentral.com.br",
    telefone: "(11) 3255-7781",
    codigoAcesso: "PNST-2204",
    senha: "oficio2026",
    portalAtivo: true,
    contrato: "Contrato de prestação PNST-2204",
    desde: "2024-03-20",
  },
  {
    id: "prest-postal",
    nome: "Agência Postal Vila Nova",
    categoria: "Correio",
    documento: "CNPJ 33.678.205/0001-31",
    email: "agencia@postalvilanova.com.br",
    telefone: "(11) 3011-4502",
    codigoAcesso: "PNST-0942",
    senha: "postal2026",
    portalAtivo: false,
    contrato: "Contrato de prestação PNST-0942",
    desde: "2025-06-02",
  },
];

type Base = Omit<Receipt, "competencia" | "reviewNote" | "requester" | "caseRef" | "attachmentName"> &
  Partial<Pick<Receipt, "reviewNote" | "requester" | "caseRef" | "attachmentName">>;

function recibo(base: Base): Receipt {
  return {
    requester: "Equipe de operações",
    caseRef: "",
    attachmentName: `${base.id.toLowerCase()}.pdf`,
    reviewNote: null,
    ...base,
    competencia: base.serviceDate.slice(0, 7),
  };
}

const OUTROS_RECIBOS: Receipt[] = [
  // Rota Leve — motoboy: abril pago, maio pago, junho enviado para conferência.
  recibo({ id: "REC-0101", prestadorId: "prest-rota", serviceDate: "2026-04-08", category: "Transporte", client: "Grupo Sanches Alimentos", description: "Entrega de documentos originais no Fórum Central.", amount: 95, status: "Aprovado", createdAt: "2026-04-08T15:00:00.000Z" }),
  recibo({ id: "REC-0102", prestadorId: "prest-rota", serviceDate: "2026-04-22", category: "Transporte", client: "Meridiano Logística", description: "Retirada de procuração assinada em Barueri.", amount: 140, status: "Aprovado", createdAt: "2026-04-22T11:00:00.000Z" }),
  recibo({ id: "REC-0113", prestadorId: "prest-rota", serviceDate: "2026-05-06", category: "Transporte", client: "Vertti Participações", description: "Protocolo físico na Junta Comercial.", amount: 110, status: "Aprovado", createdAt: "2026-05-06T10:20:00.000Z" }),
  recibo({ id: "REC-0114", prestadorId: "prest-rota", serviceDate: "2026-05-19", category: "Transporte", client: "Grupo Sanches Alimentos", description: "Coleta de vias originais com o cliente.", amount: 85, status: "Aprovado", createdAt: "2026-05-19T16:40:00.000Z" }),
  recibo({ id: "REC-0125", prestadorId: "prest-rota", serviceDate: "2026-06-03", category: "Transporte", client: "Meridiano Logística", description: "Entrega de notificação extrajudicial em mãos.", amount: 120, status: "Enviado", createdAt: "2026-06-03T09:30:00.000Z" }),
  recibo({ id: "REC-0126", prestadorId: "prest-rota", serviceDate: "2026-06-12", category: "Transporte", client: "Vertti Participações", description: "Retirada de certidões em três cartórios.", amount: 165, status: "Enviado", createdAt: "2026-06-12T14:10:00.000Z" }),
  recibo({ id: "REC-0127", prestadorId: "prest-rota", serviceDate: "2026-06-20", category: "Transporte", client: "Grupo Sanches Alimentos", description: "Entrega urgente de minuta para assinatura.", amount: 90, status: "Enviado", attachmentName: null, createdAt: "2026-06-20T17:45:00.000Z" }),

  // Apoio Forense — SAESP: maio pago, junho já conferido (aguardando pagamento).
  recibo({ id: "REC-0115", prestadorId: "prest-apoio", serviceDate: "2026-05-12", category: "Custas", client: "Vertti Participações", description: "Recolhimento de guia de diligência do oficial de justiça.", amount: 412.6, status: "Aprovado", createdAt: "2026-05-12T12:00:00.000Z" }),
  recibo({ id: "REC-0116", prestadorId: "prest-apoio", serviceDate: "2026-05-28", category: "Custas", client: "Meridiano Logística", description: "Custas de distribuição de embargos.", amount: 287.4, status: "Aprovado", createdAt: "2026-05-28T12:00:00.000Z" }),
  recibo({ id: "REC-0128", prestadorId: "prest-apoio", serviceDate: "2026-06-09", category: "Custas", client: "Grupo Sanches Alimentos", description: "Preparo recursal — apelação cível.", amount: 638.2, status: "Aprovado", createdAt: "2026-06-09T12:00:00.000Z" }),
  recibo({ id: "REC-0129", prestadorId: "prest-apoio", serviceDate: "2026-06-17", category: "Custas", client: "Vertti Participações", description: "Porte de remessa e retorno dos autos.", amount: 96.3, status: "Aprovado", createdAt: "2026-06-17T12:00:00.000Z" }),

  // Ofício Central — cartório: junho com rascunho e recibo avulso enviado.
  recibo({ id: "REC-0117", prestadorId: "prest-oficio", serviceDate: "2026-05-14", category: "Cartório", client: "Grupo Sanches Alimentos", description: "Reconhecimento de firma por autenticidade (6 assinaturas).", amount: 214.8, status: "Aprovado", createdAt: "2026-05-14T12:00:00.000Z" }),
  recibo({ id: "REC-0130", prestadorId: "prest-oficio", serviceDate: "2026-06-11", category: "Cartório", client: "Meridiano Logística", description: "Autenticação de cópias de contrato social.", amount: 158.4, status: "Pendente de envio", createdAt: "2026-06-11T12:00:00.000Z" }),
  recibo({ id: "REC-0131", prestadorId: "prest-oficio", serviceDate: "2026-06-24", category: "Cartório", client: "Vertti Participações", description: "Escritura de procuração pública.", amount: 389, status: "Rascunho", attachmentName: null, createdAt: "2026-06-24T12:00:00.000Z" }),

  // Agência Postal — correio: só abril e maio, portal desativado.
  recibo({ id: "REC-0103", prestadorId: "prest-postal", serviceDate: "2026-04-15", category: "Postagem", client: "Grupo Sanches Alimentos", description: "Postagem de 20 cartas com AR.", amount: 268, status: "Aprovado", createdAt: "2026-04-15T12:00:00.000Z" }),
  recibo({ id: "REC-0118", prestadorId: "prest-postal", serviceDate: "2026-05-21", category: "Postagem", client: "Meridiano Logística", description: "Sedex 10 para Curitiba e Porto Alegre.", amount: 174.5, status: "Aprovado", createdAt: "2026-05-21T12:00:00.000Z" }),
];

const TODOS_RECIBOS: Receipt[] = [...DEMO_RECEIPTS, ...OUTROS_RECIBOS];

function fechamento(prestadorId: string, competencia: string, review: Closing["review"], enviadoEm: string): Closing {
  const doLote = TODOS_RECIBOS.filter((item) => item.prestadorId === prestadorId && item.competencia === competencia && item.status !== "Rascunho");
  return {
    prestadorId,
    competencia,
    documentos: [{ id: null, nome: `nf-${competencia}.pdf` }],
    submitted: true,
    submittedAt: enviadoEm,
    review,
    reciboIds: doLote.map((item) => item.id),
    valorTotal: closingTotal(doLote),
    paidAt: review === "Pago" ? enviadoEm.slice(0, 10) : null,
  };
}

export const FECHAMENTOS_DEMO: Closing[] = [
  ...DEMO_CLOSINGS,
  fechamento("prest-rota", "2026-04", "Pago", "2026-05-02T10:00:00.000Z"),
  fechamento("prest-rota", "2026-05", "Pago", "2026-06-01T10:00:00.000Z"),
  fechamento("prest-rota", "2026-06", "Aguardando conferência", "2026-06-28T18:00:00.000Z"),
  fechamento("prest-apoio", "2026-05", "Pago", "2026-06-02T09:00:00.000Z"),
  fechamento("prest-apoio", "2026-06", "Conferido", "2026-06-27T09:00:00.000Z"),
  fechamento("prest-oficio", "2026-05", "Pago", "2026-06-03T15:00:00.000Z"),
  fechamento("prest-postal", "2026-04", "Pago", "2026-05-04T15:00:00.000Z"),
  fechamento("prest-postal", "2026-05", "Pago", "2026-06-04T15:00:00.000Z"),
];

/** Recibos de lote pago aparecem como "Pago", como no fluxo da referência. */
export const RECIBOS_DEMO: Receipt[] = TODOS_RECIBOS.map((item) => {
  const lote = FECHAMENTOS_DEMO.find((f) => f.prestadorId === item.prestadorId && f.competencia === item.competencia);
  return lote?.review === "Pago" && item.status === "Aprovado" ? { ...item, status: "Pago" } : item;
});

export const REGISTROS_DEMO: RegistroRecibo[] = [
  { id: "log-3", prestadorId: "prest-rota", tipo: "status", acao: "Fechamento Junho 2026 enviado", reciboId: null, usuario: "Rota Leve Entregas", dataHora: "2026-06-28T18:00:00.000Z", detalhes: "3 recibo(s) · R$ 375,00" },
  { id: "log-2", prestadorId: "prest-apoio", tipo: "aprovacao", acao: "Conferência finalizada", reciboId: null, usuario: "Fernanda Lima", dataHora: "2026-06-29T11:20:00.000Z", detalhes: "Apoio Forense Paulista · Junho 2026 · R$ 734,50" },
  { id: "log-1", prestadorId: "prest-marina", tipo: "criacao", acao: "Recibo criado", reciboId: "REC-0148", usuario: "Marina Corrêa Diligências", dataHora: "2026-06-18T13:00:00.000Z", detalhes: "Cliente: Vertti Participações" },
];
