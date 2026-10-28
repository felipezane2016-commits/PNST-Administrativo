import { gravarItem } from "@/_core/armazenamento/colecao";
import { pode } from "@/_core/identidade/permissoes";
import { useUsuarioAtual } from "@/_core/identidade/sessao";
import { formatarData, gerarId, HOJE } from "@/_core/tempo";
import Cabecalho from "@/admin/componentes/Cabecalho";
import Vazio from "@/admin/componentes/Vazio";
import { taxas, useDadosContas } from "@/modulos/contas/colecoes";
import { formatarDelta, formatarTaxa } from "@/modulos/contas/formato";
import { ordenarTaxas, spread } from "@/modulos/contas/regras";
import { AlertCircle, Banknote, Download, Trash2 } from "lucide-react";
import { useState } from "react";

const CAMPOS = [
  ["bibUsd", "BIB · USD"],
  ["bibEur", "BIB · EUR"],
  ["itauUsd", "Itaú · USD"],
  ["itauEur", "Itaú · EUR"],
] as const;
type CampoTaxa = (typeof CAMPOS)[number][0];

function numero(texto: string) {
  const valor = Number.parseFloat(texto.replace(",", "."));
  return Number.isFinite(valor) ? valor : Number.NaN;
}

export default function Taxas() {
  const { taxas: lista } = useDadosContas();
  const usuario = useUsuarioAtual();
  const podeEditar = pode(usuario, "contas.banco.editar");
  const [mes, setMes] = useState(HOJE.slice(0, 7));
  const [data, setData] = useState(HOJE);
  const [horario, setHorario] = useState("10:30");
  const [valores, setValores] = useState<Record<CampoTaxa, string>>({ bibUsd: "", bibEur: "", itauUsd: "", itauEur: "" });
  const [observacao, setObservacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  const numeros = Object.fromEntries(CAMPOS.map(([campo]) => [campo, numero(valores[campo])])) as Record<CampoTaxa, number>;
  const completo = CAMPOS.every(([campo]) => numeros[campo] > 0);
  const doMes = ordenarTaxas(lista)
    .filter((taxa) => taxa.data.startsWith(mes))
    .reverse();

  function registrar() {
    // Cotação fora de 1–20 é quase sempre vírgula no lugar errado.
    if (!completo || CAMPOS.some(([campo]) => numeros[campo] < 1 || numeros[campo] > 20)) {
      setErro("Preencha as quatro cotações com valores entre 1 e 20 (ex.: 5,6234).");
      return;
    }
    const existente = lista.find((taxa) => taxa.data === data && taxa.horario === horario);
    taxas.atualizar((atual) => gravarItem(atual, { id: existente?.id ?? gerarId("tx"), data, horario, ...numeros, observacao: observacao.trim() }));
    setValores({ bibUsd: "", bibEur: "", itauUsd: "", itauEur: "" });
    setObservacao("");
    setErro(null);
    setSalvo(true);
  }

  function exportar() {
    const linhas = [
      ["Data", "Horário", "BIB USD", "BIB EUR", "Itaú USD", "Itaú EUR", "Δ USD", "Δ EUR", "Observação"],
      ...doMes.map((taxa) => [
        taxa.data,
        taxa.horario,
        formatarTaxa(taxa.bibUsd),
        formatarTaxa(taxa.bibEur),
        formatarTaxa(taxa.itauUsd),
        formatarTaxa(taxa.itauEur),
        formatarDelta(spread(taxa, "USD")),
        formatarDelta(spread(taxa, "EUR")),
        taxa.observacao,
      ]),
    ];
    // Ponto e vírgula + BOM: o Excel em português abre com colunas e acentos certos.
    const csv = "﻿" + linhas.map((linha) => linha.map((celula) => `"${String(celula).replace(/"/g, '""')}"`).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `taxas-${mes}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <Cabecalho rotulo="Banco Industrial" titulo="Taxas diárias" descricao="Registre a cotação dos dois bancos; o spread sai calculado." />
      {podeEditar ? (
        <section className="operations-surface espaco-abaixo">
          <div className="section-header">
            <div>
              <span className="eyebrow">Registro</span>
              <h3>Cotações do dia</h3>
            </div>
          </div>
          <form
            className="stack"
            noValidate
            onSubmit={(evento) => {
              evento.preventDefault();
              registrar();
            }}
          >
            <div className="field-grid">
              <div className="field-group">
                <label className="field-label" htmlFor="tx-data">
                  Data
                </label>
                <input id="tx-data" className="field-input" type="date" value={data} onChange={(e) => setData(e.target.value)} />
              </div>
              <div className="field-group">
                <label className="field-label" htmlFor="tx-horario">
                  Horário
                </label>
                <input id="tx-horario" className="field-input" type="time" value={horario} onChange={(e) => setHorario(e.target.value)} />
              </div>
            </div>
            <div className="grid-3 grid-fluido">
              {CAMPOS.map(([campo, nome]) => (
                <div className="field-group" key={campo}>
                  <label className="field-label" htmlFor={`tx-${campo}`}>
                    {nome} <span className="field-hint">R$ por unidade</span>
                  </label>
                  <input
                    id={`tx-${campo}`}
                    className="field-input"
                    inputMode="decimal"
                    placeholder="0,0000"
                    value={valores[campo]}
                    aria-invalid={erro && !(numeros[campo] > 0) ? true : undefined}
                    aria-describedby={erro ? "tx-erro" : undefined}
                    onChange={(e) => {
                      setValores({ ...valores, [campo]: e.target.value });
                      setSalvo(false);
                    }}
                  />
                </div>
              ))}
            </div>
            <dl className="data-list">
              <div>
                <dt>Δ USD (BIB − Itaú)</dt>
                <dd className="money">{numeros.bibUsd > 0 && numeros.itauUsd > 0 ? formatarDelta(numeros.bibUsd - numeros.itauUsd) : "—"}</dd>
              </div>
              <div>
                <dt>Δ EUR (BIB − Itaú)</dt>
                <dd className="money">{numeros.bibEur > 0 && numeros.itauEur > 0 ? formatarDelta(numeros.bibEur - numeros.itauEur) : "—"}</dd>
              </div>
            </dl>
            <div className="field-group">
              <label className="field-label" htmlFor="tx-obs">
                Observação
              </label>
              <input id="tx-obs" className="field-input" value={observacao} onChange={(e) => setObservacao(e.target.value)} />
            </div>
            {erro ? (
              <span id="tx-erro" className="field-error" role="alert">
                <AlertCircle size={13} strokeWidth={2} />
                {erro}
              </span>
            ) : null}
            {salvo ? (
              <p className="acesso-alerta-sucesso" role="status">
                Taxas registradas.
              </p>
            ) : null}
            <div className="inline-row inline-row-fim">
              <button type="submit" className="button-primary">
                Registrar taxas
              </button>
            </div>
          </form>
        </section>
      ) : null}
      <section className="operations-surface">
        <div className="section-header">
          <div>
            <span className="eyebrow">Histórico</span>
            <h3>{doMes.length} leitura(s) no mês</h3>
          </div>
          <div className="inline-row">
            <input className="field-input field-input-compacto" type="month" value={mes} onChange={(e) => setMes(e.target.value)} aria-label="Mês" />
            <button type="button" className="button-secondary" onClick={exportar} disabled={!doMes.length}>
              <Download size={14} strokeWidth={2} /> Exportar CSV
            </button>
          </div>
        </div>
        {doMes.length === 0 ? (
          <Vazio icone={Banknote} titulo="Nenhuma taxa neste mês" />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>BIB USD</th>
                  <th>Itaú USD</th>
                  <th>Δ USD</th>
                  <th>BIB EUR</th>
                  <th>Itaú EUR</th>
                  <th>Δ EUR</th>
                  <th>
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {doMes.map((taxa) => (
                  <tr key={taxa.id}>
                    <td className="cell-main">
                      <strong>{formatarData(taxa.data)}</strong>
                      <span>{taxa.horario}</span>
                    </td>
                    <td>{formatarTaxa(taxa.bibUsd)}</td>
                    <td>{formatarTaxa(taxa.itauUsd)}</td>
                    <td className="money">{formatarDelta(spread(taxa, "USD"))}</td>
                    <td>{formatarTaxa(taxa.bibEur)}</td>
                    <td>{formatarTaxa(taxa.itauEur)}</td>
                    <td className="money">{formatarDelta(spread(taxa, "EUR"))}</td>
                    <td>
                      {pode(usuario, "contas.banco.excluir") ? (
                        <button type="button" className="icon-button icon-button-danger" aria-label={`Excluir taxa de ${formatarData(taxa.data)}`} onClick={() => taxas.atualizar((atual) => atual.filter((item) => item.id !== taxa.id))}>
                          <Trash2 size={14} strokeWidth={1.9} />
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
    </>
  );
}
