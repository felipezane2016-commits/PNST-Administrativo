import type { Closing, Provider, Receipt } from "./portal";

/**
 * Dados de demonstração da prestadora Marina, a conta do portal usada na
 * demonstração. Os demais prestadores ficam em `modulos/prestadores/dadosMock`.
 */

export const MARINA_ID = "prest-marina";

export const DEMO_CREDENTIALS = { code: "PNST-2481", password: "nexus2026" };

export const DEMO_PROVIDER: Provider = {
  name: "Marina Corrêa Diligências",
  code: DEMO_CREDENTIALS.code,
  document: "CNPJ 41.882.507/0001-16",
  email: "marina@correadiligencias.com.br",
  contract: "Contrato de prestação PNST-2481",
};

/** Competência aberta no protótipo — a mesma usada pelos testes. */
export const DEMO_COMPETENCIA = "2026-06";

export const DEMO_RECEIPTS: Receipt[] = [
  {
    id: "REC-0148",
    prestadorId: MARINA_ID,
    competencia: "2026-06",
    serviceDate: "2026-06-18",
    category: "Diligência",
    client: "Vertti Participações",
    caseRef: "0021458-70.2025.8.26.0100",
    requester: "Dra. Helena Prado",
    description:
      "Diligência no Fórum João Mendes para retirada de carta de sentença.",
    amount: 480,
    status: "Rascunho",
    attachmentName: null,
    reviewNote: null,
    createdAt: "2026-06-18T13:20:00.000Z",
  },
  {
    id: "REC-0147",
    prestadorId: MARINA_ID,
    competencia: "2026-06",
    serviceDate: "2026-06-16",
    category: "Cartório",
    client: "Grupo Sanches Alimentos",
    caseRef: "Due diligence societária",
    requester: "Dr. Rafael Bueno",
    description:
      "Certidões de ônus reais em dois cartórios de registro de imóveis.",
    amount: 312.4,
    status: "Pendente de envio",
    attachmentName: "certidoes-cartorio.pdf",
    reviewNote: null,
    createdAt: "2026-06-16T17:05:00.000Z",
  },
  {
    id: "REC-0146",
    prestadorId: MARINA_ID,
    competencia: "2026-06",
    serviceDate: "2026-06-11",
    category: "Honorários",
    client: "Vertti Participações",
    caseRef: "0021458-70.2025.8.26.0100",
    requester: "Dra. Helena Prado",
    description: "Acompanhamento de audiência de conciliação com preposto.",
    amount: 1280.5,
    status: "Pendente de envio",
    attachmentName: "nf-1280-junho.pdf",
    reviewNote: null,
    createdAt: "2026-06-11T11:40:00.000Z",
  },
  {
    id: "REC-0145",
    prestadorId: MARINA_ID,
    competencia: "2026-06",
    serviceDate: "2026-06-09",
    category: "Transporte",
    client: "Meridiano Logística",
    caseRef: "Contencioso trabalhista",
    requester: "Dr. Caio Lemos",
    description:
      "Deslocamento até Guarulhos para coleta de assinatura de testemunha.",
    amount: 186.9,
    status: "Rascunho",
    attachmentName: "comprovante-corrida.pdf",
    reviewNote: null,
    createdAt: "2026-06-09T09:15:00.000Z",
  },
  {
    id: "REC-0144",
    prestadorId: MARINA_ID,
    competencia: "2026-06",
    serviceDate: "2026-06-04",
    category: "Postagem",
    client: "Grupo Sanches Alimentos",
    caseRef: "Notificações extrajudiciais",
    requester: "Dr. Rafael Bueno",
    description: "Postagem de 12 notificações com aviso de recebimento.",
    amount: 143.28,
    status: "Ajuste solicitado",
    attachmentName: "postagens-junho.pdf",
    reviewNote:
      "Anexe os códigos de rastreio individuais — o comprovante enviado está ilegível.",
    createdAt: "2026-06-04T15:52:00.000Z",
  },
  {
    id: "REC-0141",
    prestadorId: MARINA_ID,
    competencia: "2026-05",
    serviceDate: "2026-05-27",
    category: "Diligência",
    client: "Meridiano Logística",
    caseRef: "Contencioso trabalhista",
    requester: "Dr. Caio Lemos",
    description:
      "Protocolo físico de petição intercorrente na 4ª Vara do Trabalho.",
    amount: 395,
    status: "Aprovado",
    attachmentName: "protocolo-4vt.pdf",
    reviewNote: null,
    createdAt: "2026-05-27T16:10:00.000Z",
  },
  {
    id: "REC-0139",
    prestadorId: MARINA_ID,
    competencia: "2026-05",
    serviceDate: "2026-05-20",
    category: "Custas",
    client: "Vertti Participações",
    caseRef: "0021458-70.2025.8.26.0100",
    requester: "Dra. Helena Prado",
    description: "Recolhimento de custas de preparo recursal.",
    amount: 874.65,
    status: "Aprovado",
    attachmentName: "guia-custas.pdf",
    reviewNote: null,
    createdAt: "2026-05-20T10:05:00.000Z",
  },
];

export const DEMO_CLOSINGS: Closing[] = [
  {
    prestadorId: MARINA_ID,
    competencia: "2026-06",
    documentName: null,
    submitted: false,
    submittedAt: null,
    review: null,
  },
  {
    prestadorId: MARINA_ID,
    competencia: "2026-05",
    documentName: "nf-maio-2026.pdf",
    submitted: true,
    submittedAt: "2026-06-02T12:30:00.000Z",
    review: "Pago",
  },
];
