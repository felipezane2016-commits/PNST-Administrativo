import { guardarAnexo } from "@/_core/armazenamento/anexos";
import { useColecao } from "@/_core/armazenamento/colecao";
import type { Usuario } from "@/_core/identidade/permissoes";
import { usuarios } from "@/_core/identidade/sessao";
import { HOJE } from "@/_core/tempo";
import Campo from "@/admin/componentes/Campo";
import Painel from "@/admin/componentes/Painel";
import { parseAmount } from "@/lib/portal";
import { EMPRESAS, type Empresa } from "@/modulos/conciliacao/tipos";
import { ordens } from "@/modulos/contas/colecoes";
import { reenviar, solicitarPagamento, type Pedido } from "@/modulos/pagamentos/acoes";
import { useDadosPagamentos } from "@/modulos/pagamentos/colecoes";
import { quemAprova, validarPedido, type ErrosPedido } from "@/modulos/pagamentos/regras";
import { CATEGORIAS_PAGAMENTO, FORMAS_PAGAMENTO, type AnexoRef, type CategoriaPagamento, type FormaPagamento, type Pagamento } from "@/modulos/pagamentos/tipos";
import { recibos } from "@/modulos/prestadores/colecoes";
import { Paperclip, X } from "lucide-react";
import { useState } from "react";

/** Pedido novo, ou correção de um pedido devolvido (que volta para a conferência). */
export default function FormularioPagamento({ usuario, devolvido, aoFechar, aoSalvar }: { usuario: Usuario; devolvido: Pagamento | null; aoFechar: () => void; aoSalvar: (id: string) => void }) {
  const { pagamentos, fornecedores, config } = useDadosPagamentos();
  const pessoas = useColecao(usuarios);
  const listaOrdens = useColecao(ordens);
  const listaRecibos = useColecao(recibos);
  // Clientes já conhecidos pelo sistema, para o centro de custo não virar texto solto.
  const clientes = Array.from(new Set([...pagamentos.map((p) => p.cliente), ...listaOrdens.map((o) => o.cliente), ...listaRecibos.map((r) => r.client)].filter(Boolean))).sort();

  const base = devolvido;
  const [dados, setDados] = useState({
    empresa: (base?.empresa ?? "PNST") as Empresa,
    fornecedorId: base?.fornecedorId ?? "",
    favorecido: base?.favorecido ?? "",
    descricao: base?.descricao ?? "",
    categoria: (base?.categoria ?? "Custas processuais") as CategoriaPagamento,
    valor: base ? base.valor.toFixed(2).replace(".", ",") : "",
    vencimento: base?.vencimento ?? HOJE,
    forma: (base?.forma ?? "Boleto") as FormaPagamento,
    dadosPagamento: base?.dadosPagamento ?? "",
    cliente: base?.cliente ?? "",
    caso: base?.caso ?? "",
    reembolsavel: base?.reembolsavel ?? false,
    urgente: base?.urgente ?? false,
    justificativaUrgencia: base?.justificativaUrgencia ?? "",
  });
  const [documentos, setDocumentos] = useState<AnexoRef[]>(base?.documentos ?? []);
  const [erros, setErros] = useState<ErrosPedido>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);

  function escolherFornecedor(id: string) {
    const fornecedor = fornecedores.find((f) => f.id === id);
    if (!fornecedor) return setDados({ ...dados, fornecedorId: "" });
    const forma: FormaPagamento = fornecedor.chavePix ? "Pix" : fornecedor.conta ? "TED" : "Boleto";
    const dadosPagamento = forma === "Pix" ? fornecedor.chavePix : forma === "TED" ? `${fornecedor.banco} · ag. ${fornecedor.agencia} · c/c ${fornecedor.conta}` : "";
    setDados({ ...dados, fornecedorId: id, favorecido: fornecedor.nome, forma, dadosPagamento });
  }

  async function anexar(arquivos: FileList | null) {
    if (!arquivos) return;
    const novos: AnexoRef[] = [];
    for (const arquivo of Array.from(arquivos)) {
      try {
        const anexo = await guardarAnexo(arquivo);
        novos.push({ anexoId: anexo.id, nome: anexo.nome });
      } catch {
        novos.push({ anexoId: null, nome: arquivo.name });
      }
    }
    setDocumentos((atual) => [...atual, ...novos]);
    setErros((atual) => ({ ...atual, documentos: undefined }));
  }

  function salvar() {
    const pedido: Pedido = {
      empresa: dados.empresa,
      fornecedorId: dados.fornecedorId || null,
      favorecido: dados.favorecido.trim(),
      descricao: dados.descricao.trim(),
      categoria: dados.categoria,
      valor: parseAmount(dados.valor),
      vencimento: dados.vencimento,
      forma: dados.forma,
      dadosPagamento: dados.dadosPagamento.trim(),
      cliente: dados.cliente.trim(),
      caso: dados.caso.trim(),
      reembolsavel: dados.reembolsavel,
      urgente: dados.urgente,
      justificativaUrgencia: dados.justificativaUrgencia.trim(),
      documentos,
      origem: base?.origem ?? "Solicitação",
      origemId: base?.origemId ?? null,
    };
    const encontrados = validarPedido(pedido, HOJE);
    if (Object.values(encontrados).some(Boolean)) {
      setErros(encontrados);
      return;
    }
    if (base) {
      const erro = reenviar(base.id, pedido, usuario);
      if (erro) return setErroGeral(erro);
      aoSalvar(base.id);
    } else aoSalvar(solicitarPagamento(pedido, usuario).id);
  }

  const dicaDados = dados.forma === "Boleto" ? "Linha digitável do boleto" : dados.forma === "Pix" ? "Chave Pix" : dados.forma === "TED" ? "Banco, agência e conta" : "Não precisa";

  return (
    <Painel
      rotulo={base ? `Correção de ${base.numero}` : "Contas a pagar"}
      titulo={base ? "Corrigir e reenviar" : "Solicitar pagamento"}
      descricao={`Vai para a conferência do financeiro e depois para a aprovação de ${quemAprova({ solicitanteId: base?.solicitanteId ?? usuario.id }, pessoas, config, HOJE)}.`}
      aoFechar={aoFechar}
      aoEnviar={salvar}
      textoEnviar={base ? "Reenviar" : "Enviar pedido"}
    >
      {base?.motivo ? (
        <div className="acesso-alerta-erro espaco-abaixo" role="status">
          <span>
            <strong>Devolvido:</strong> {base.motivo}
          </span>
        </div>
      ) : null}
      <div className="field-grid">
        <Campo id="pg-empresa" rotulo="Empresa que paga">
          {(aria) => (
            <select {...aria} className="field-input" value={dados.empresa} onChange={(e) => setDados({ ...dados, empresa: e.target.value as Empresa })}>
              {EMPRESAS.map((empresa) => (
                <option key={empresa}>{empresa}</option>
              ))}
            </select>
          )}
        </Campo>
        <Campo id="pg-categoria" rotulo="Categoria">
          {(aria) => (
            <select {...aria} className="field-input" value={dados.categoria} onChange={(e) => setDados({ ...dados, categoria: e.target.value as CategoriaPagamento })}>
              {CATEGORIAS_PAGAMENTO.map((categoria) => (
                <option key={categoria}>{categoria}</option>
              ))}
            </select>
          )}
        </Campo>
      </div>
      <Campo id="pg-fornecedor" rotulo="Fornecedor cadastrado" dica="Ou deixe em branco e escreva o favorecido abaixo (custas, reembolsos).">
        {(aria) => (
          <select {...aria} className="field-input" value={dados.fornecedorId} onChange={(e) => escolherFornecedor(e.target.value)}>
            <option value="">— Outro favorecido —</option>
            {fornecedores.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
                {f.dadosValidados ? "" : " (dados bancários a validar)"}
              </option>
            ))}
          </select>
        )}
      </Campo>
      <Campo id="pg-favorecido" rotulo="Favorecido" erro={erros.favorecido}>
        {(aria) => <input {...aria} className="field-input" value={dados.favorecido} onChange={(e) => setDados({ ...dados, favorecido: e.target.value })} disabled={Boolean(dados.fornecedorId)} />}
      </Campo>
      <Campo id="pg-descricao" rotulo="O que está sendo pago" erro={erros.descricao}>
        {(aria) => <input {...aria} className="field-input" value={dados.descricao} onChange={(e) => setDados({ ...dados, descricao: e.target.value })} placeholder="Custas de distribuição, honorários do correspondente…" />}
      </Campo>
      <div className="field-grid">
        <Campo id="pg-valor" rotulo="Valor (R$)" erro={erros.valor}>
          {(aria) => <input {...aria} className="field-input" inputMode="decimal" value={dados.valor} onChange={(e) => setDados({ ...dados, valor: e.target.value })} placeholder="1.234,56" />}
        </Campo>
        <Campo id="pg-vencimento" rotulo="Vencimento" erro={erros.vencimento}>
          {(aria) => <input {...aria} className="field-input" type="date" value={dados.vencimento} onChange={(e) => setDados({ ...dados, vencimento: e.target.value })} />}
        </Campo>
      </div>
      <div className="field-grid">
        <Campo id="pg-forma" rotulo="Forma de pagamento">
          {(aria) => (
            <select {...aria} className="field-input" value={dados.forma} onChange={(e) => setDados({ ...dados, forma: e.target.value as FormaPagamento })}>
              {FORMAS_PAGAMENTO.map((forma) => (
                <option key={forma}>{forma}</option>
              ))}
            </select>
          )}
        </Campo>
        <Campo id="pg-dados" rotulo={dicaDados} erro={erros.dadosPagamento}>
          {(aria) => <input {...aria} className="field-input" value={dados.dadosPagamento} onChange={(e) => setDados({ ...dados, dadosPagamento: e.target.value })} disabled={dados.forma === "Débito automático"} />}
        </Campo>
      </div>

      <fieldset className="field-group-fieldset">
        <legend className="field-label">Centro de custo</legend>
        <div className="field-grid">
          <Campo id="pg-cliente" rotulo="Cliente" erro={erros.cliente}>
            {(aria) => (
              <>
                <input {...aria} className="field-input" list="pg-clientes" value={dados.cliente} onChange={(e) => setDados({ ...dados, cliente: e.target.value })} placeholder="Escritório (sem cliente)" />
                <datalist id="pg-clientes">
                  {clientes.map((cliente) => (
                    <option key={cliente} value={cliente} />
                  ))}
                </datalist>
              </>
            )}
          </Campo>
          <Campo id="pg-caso" rotulo="Caso / processo">
            {(aria) => <input {...aria} className="field-input" value={dados.caso} onChange={(e) => setDados({ ...dados, caso: e.target.value })} placeholder="0000000-00.0000.0.00.0000" />}
          </Campo>
        </div>
        <label className="check-label">
          <input type="checkbox" checked={dados.reembolsavel} onChange={(e) => setDados({ ...dados, reembolsavel: e.target.checked })} />
          Reembolsável pelo cliente (entra no relatório de despesas a cobrar)
        </label>
      </fieldset>

      <div className="field-group">
        <span className="field-label">Documentos (nota, boleto, recibo, guia)</span>
        {documentos.length ? (
          <ul className="lista-documentos">
            {documentos.map((documento, indice) => (
              <li key={`${documento.nome}-${indice}`}>
                <Paperclip size={14} strokeWidth={1.9} aria-hidden="true" />
                <span>{documento.nome}</span>
                <button type="button" className="icon-button icon-button-pequeno" aria-label={`Remover ${documento.nome}`} onClick={() => setDocumentos(documentos.filter((_, i) => i !== indice))}>
                  <X size={13} strokeWidth={2} />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <input className="field-input" type="file" multiple accept="application/pdf,image/*" aria-label="Anexar documentos" onChange={(e) => anexar(e.target.files)} />
        {erros.documentos ? <span className="field-error">{erros.documentos}</span> : null}
      </div>

      <label className="check-label">
        <input type="checkbox" checked={dados.urgente} onChange={(e) => setDados({ ...dados, urgente: e.target.checked })} />
        Urgente
      </label>
      {dados.urgente ? (
        <Campo id="pg-urgencia" rotulo="Por que é urgente?" erro={erros.justificativa}>
          {(aria) => <input {...aria} className="field-input" value={dados.justificativaUrgencia} onChange={(e) => setDados({ ...dados, justificativaUrgencia: e.target.value })} placeholder="Prazo processual vence hoje…" />}
        </Campo>
      ) : null}
      {erroGeral ? <p className="field-error">{erroGeral}</p> : null}
    </Painel>
  );
}
