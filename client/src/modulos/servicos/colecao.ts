import { criarColecao } from "@/_core/armazenamento/colecao";
import { SERVICOS_DEMO } from "./dadosMock";
import type { Servico } from "./tipos";

/** Pedidos de serviço: o escritório pede, o portal do prestador executa. */
export const servicos = criarColecao<Servico[]>("servicos", () => SERVICOS_DEMO, {
  remota: { tipo: "lista", tabela: "servicos", maisNovosPrimeiro: true },
  vazio: () => [],
});
