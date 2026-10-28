import { criarColecao } from "@/_core/armazenamento/colecao";
import type { Closing, Receipt, RegistroRecibo } from "@/lib/portal";
import { FECHAMENTOS_DEMO, PRESTADORES_DEMO, RECIBOS_DEMO, REGISTROS_DEMO } from "./dadosMock";
import type { Prestador } from "./tipos";

/** Donas únicas desses dados: o portal e o admin leem e gravam só por aqui. */
export const prestadores = criarColecao<Prestador[]>("prestadores", () => PRESTADORES_DEMO, { remota: { tipo: "lista", tabela: "prestadores" }, vazio: () => [] });
export const recibos = criarColecao<Receipt[]>("recibos", () => RECIBOS_DEMO, { remota: { tipo: "lista", tabela: "recibos" }, vazio: () => [] });
export const fechamentos = criarColecao<Closing[]>("fechamentos", () => FECHAMENTOS_DEMO, {
  // Fechamento não tem id: é um por prestador e competência.
  remota: { tipo: "lista", tabela: "fechamentos", chave: (f: Closing) => `${f.prestadorId}|${f.competencia}` },
  vazio: () => [] });
/** Histórico de atividades dos recibos (criação, edição, envio, conferência, pagamento). */
export const registros = criarColecao<RegistroRecibo[]>("recibos-registros", () => REGISTROS_DEMO, {
  remota: { tipo: "lista", tabela: "recibos_registros", maisNovosPrimeiro: true },
  vazio: () => [],
});
