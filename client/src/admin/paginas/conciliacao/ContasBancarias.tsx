import { pode } from "@/_core/identidade/permissoes";
import { useUsuarioAtual } from "@/_core/identidade/sessao";
import { formatarData, formatarDataHora, gerarId, HOJE } from "@/_core/tempo";
import Cabecalho from "@/admin/componentes/Cabecalho";
import Campo from "@/admin/componentes/Campo";
import Painel from "@/admin/componentes/Painel";
import Selo from "@/admin/componentes/Selo";
import Vazio from "@/admin/componentes/Vazio";
import { formatBRL, parseAmount } from "@/lib/portal";
import { salvarContaBancaria } from "@/modulos/conciliacao/acoes";
import { useDadosConciliacao } from "@/modulos/conciliacao/colecoes";
import { EMPRESAS, type ContaBancaria, type Empresa } from "@/modulos/conciliacao/tipos";
import { FileUp, Landmark, Plus } from "lucide-react";
import { useState } from "react";
import { rotuloConta } from "./comum";

export default function ContasBancarias() {
  const { contas, extrato, importacoes } = useDadosConciliacao();
  const usuario = useUsuarioAtual();
  const podeEditar = pode(usuario, "contas.conciliacao.editar");
  const [editando, setEditando] = useState<ContaBancaria | "nova" | null>(null);
  const nomeConta = new Map(contas.map((conta) => [conta.id, rotuloConta(conta)]));

  return (
    <>
      <Cabecalho
        rotulo="Conciliação bancária"
        titulo="Contas bancárias"
        descricao="Cada conta do banco e a conta contábil que a espelha no razão, com o saldo de abertura da conciliação."
        acoes={
          podeEditar ? (
            <button type="button" className="button-primary" onClick={() => setEditando("nova")}>
              <Plus size={15} strokeWidth={2.2} /> Nova conta
            </button>
          ) : null
        }
      />
      <section className="operations-surface">
        {contas.length === 0 ? (
          <Vazio icone={Landmark} titulo="Nenhuma conta cadastrada" />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Conta</th>
                  <th>Agência / conta</th>
                  <th>Conta contábil</th>
                  <th>Saldo de abertura</th>
                  <th>Lançamentos no extrato</th>
                  <th>Situação</th>
                  <th>
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {contas.map((conta) => (
                  <tr key={conta.id}>
                    <td className="cell-main">
                      <strong>{conta.banco}</strong>
                      <span>{conta.empresa}</span>
                    </td>
                    <td>
                      {conta.agencia} / {conta.numero}
                    </td>
                    <td className="cell-code">{conta.contaContabil}</td>
                    <td className="cell-main">
                      <strong className="money">{formatBRL(conta.saldoInicial)}</strong>
                      <span>em {formatarData(conta.dataSaldoInicial)}</span>
                    </td>
                    <td>{extrato.filter((item) => item.contaId === conta.id).length}</td>
                    <td>{conta.ativa ? <Selo tom="green">Ativa</Selo> : <Selo tom="neutral">Inativa</Selo>}</td>
                    <td>
                      {podeEditar ? (
                        <button type="button" className="text-button" onClick={() => setEditando(conta)}>
                          Editar
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="operations-surface espaco-acima">
        <div className="section-header">
          <div>
            <span className="eyebrow">Histórico</span>
            <h3>Importações de extrato</h3>
            <p>Cada arquivo importado, com quantas linhas entraram e quantas já existiam.</p>
          </div>
        </div>
        {importacoes.length === 0 ? (
          <Vazio icone={FileUp} titulo="Nenhuma importação ainda" texto="Importe um OFX ou CSV na tela Conciliar." />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Conta</th>
                  <th>Arquivo</th>
                  <th>Novas</th>
                  <th>Já existiam</th>
                  <th>Por</th>
                </tr>
              </thead>
              <tbody>
                {importacoes.map((item) => (
                  <tr key={item.id}>
                    <td>{formatarDataHora(item.quando)}</td>
                    <td>{nomeConta.get(item.contaId) ?? "—"}</td>
                    <td className="cell-main">
                      <strong>{item.arquivo}</strong>
                      <span>{item.formato}</span>
                    </td>
                    <td>{item.novas}</td>
                    <td>{item.duplicadas}</td>
                    <td>{item.autor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editando ? <FormularioConta conta={editando === "nova" ? null : editando} temMovimento={editando !== "nova" && extrato.some((item) => item.contaId === editando.id)} aoFechar={() => setEditando(null)} /> : null}
    </>
  );
}

type Erros = Partial<Record<"banco" | "numero" | "contaContabil" | "saldo", string>>;

function FormularioConta({ conta, temMovimento, aoFechar }: { conta: ContaBancaria | null; temMovimento: boolean; aoFechar: () => void }) {
  const [dados, setDados] = useState({
    banco: conta?.banco ?? "",
    empresa: conta?.empresa ?? ("PNST" as Empresa),
    agencia: conta?.agencia ?? "",
    numero: conta?.numero ?? "",
    contaContabil: conta?.contaContabil ?? "",
    saldo: conta ? conta.saldoInicial.toFixed(2).replace(".", ",") : "",
    dataSaldo: conta?.dataSaldoInicial ?? HOJE,
    ativa: conta?.ativa ?? true,
  });
  const [erros, setErros] = useState<Erros>({});

  function salvar() {
    const negativo = dados.saldo.trim().startsWith("-");
    const saldo = parseAmount(dados.saldo.trim().replace(/^-/, ""));
    const encontrados: Erros = {};
    if (!dados.banco.trim()) encontrados.banco = "Informe o banco.";
    if (!dados.numero.trim()) encontrados.numero = "Informe o número da conta.";
    if (!dados.contaContabil.trim()) encontrados.contaContabil = "Informe a conta contábil.";
    if (!dados.saldo.trim() || Number.isNaN(saldo)) encontrados.saldo = "Informe o saldo de abertura (pode ser 0,00).";
    if (Object.values(encontrados).some(Boolean)) {
      setErros(encontrados);
      return;
    }
    salvarContaBancaria({
      id: conta?.id ?? gerarId("cb"),
      banco: dados.banco.trim(),
      empresa: dados.empresa,
      agencia: dados.agencia.trim(),
      numero: dados.numero.trim(),
      contaContabil: dados.contaContabil.trim(),
      saldoInicial: negativo ? -saldo : saldo,
      dataSaldoInicial: dados.dataSaldo,
      ativa: dados.ativa,
    });
    aoFechar();
  }

  return (
    <Painel rotulo="Contas bancárias" titulo={conta ? rotuloConta(conta) : "Nova conta"} aoFechar={aoFechar} aoEnviar={salvar}>
      <div className="field-grid">
        <Campo id="cb-banco" rotulo="Banco" erro={erros.banco}>
          {(aria) => <input {...aria} className="field-input" value={dados.banco} onChange={(e) => setDados({ ...dados, banco: e.target.value })} />}
        </Campo>
        <Campo id="cb-empresa" rotulo="Empresa">
          {(aria) => (
            <select {...aria} className="field-input" value={dados.empresa} onChange={(e) => setDados({ ...dados, empresa: e.target.value as Empresa })}>
              {EMPRESAS.map((empresa) => (
                <option key={empresa}>{empresa}</option>
              ))}
            </select>
          )}
        </Campo>
      </div>
      <div className="field-grid">
        <Campo id="cb-agencia" rotulo="Agência">
          {(aria) => <input {...aria} className="field-input" value={dados.agencia} onChange={(e) => setDados({ ...dados, agencia: e.target.value })} />}
        </Campo>
        <Campo id="cb-numero" rotulo="Conta" erro={erros.numero}>
          {(aria) => <input {...aria} className="field-input" value={dados.numero} onChange={(e) => setDados({ ...dados, numero: e.target.value })} />}
        </Campo>
      </div>
      <Campo id="cb-contabil" rotulo="Conta contábil no razão" erro={erros.contaContabil} dica="Ex.: 1.1.1.02.001 — Bancos conta movimento">
        {(aria) => <input {...aria} className="field-input" value={dados.contaContabil} onChange={(e) => setDados({ ...dados, contaContabil: e.target.value })} />}
      </Campo>
      <div className="field-grid">
        <Campo
          id="cb-saldo"
          rotulo="Saldo de abertura"
          erro={erros.saldo}
          dica={temMovimento ? "Mudar o saldo de abertura muda todos os saldos calculados." : "Saldo conciliado, igual no banco e no razão."}
        >
          {(aria) => <input {...aria} className="field-input" inputMode="decimal" value={dados.saldo} onChange={(e) => setDados({ ...dados, saldo: e.target.value })} placeholder="0,00" />}
        </Campo>
        <Campo id="cb-data" rotulo="Na data">
          {(aria) => <input {...aria} className="field-input" type="date" value={dados.dataSaldo} onChange={(e) => setDados({ ...dados, dataSaldo: e.target.value })} />}
        </Campo>
      </div>
      <label className="check-label">
        <input type="checkbox" checked={dados.ativa} onChange={(e) => setDados({ ...dados, ativa: e.target.checked })} />
        Conta ativa
      </label>
    </Painel>
  );
}
