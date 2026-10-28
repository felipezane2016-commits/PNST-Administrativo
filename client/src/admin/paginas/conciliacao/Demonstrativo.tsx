import { pode } from "@/_core/identidade/permissoes";
import { useUsuarioAtual } from "@/_core/identidade/sessao";
import { formatarData, formatarDataHora } from "@/_core/tempo";
import Cabecalho from "@/admin/componentes/Cabecalho";
import Campo from "@/admin/componentes/Campo";
import Vazio from "@/admin/componentes/Vazio";
import { formatBRL, parseAmount } from "@/lib/portal";
import { aprovarFechamento, enviarParaRevisao, informarSaldo, reabrirMes } from "@/modulos/conciliacao/acoes";
import { useDadosConciliacao, useSelecao } from "@/modulos/conciliacao/colecoes";
import { centavos, checklistFechamento, fechamentoDo, montarDemonstrativo, somar } from "@/modulos/conciliacao/regras";
import { Banknote, CheckCircle2, Circle, Download, Printer, RotateCcw, Send, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { rotuloConta, SeletorContaMes, SeloFechamento, Valor } from "./comum";

type ItemDem = { id: string; data: string; texto: string; documento: string; valor: number };

export default function Demonstrativo() {
  const dados = useDadosConciliacao();
  const { conta, mes } = useSelecao();
  const usuario = useUsuarioAtual();
  const [observacao, setObservacao] = useState("");
  const [saldoDigitado, setSaldoDigitado] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<{ tom: "erro" | "sucesso"; texto: string } | null>(null);

  if (!conta) {
    return (
      <>
        <Cabecalho rotulo="Conciliação bancária" titulo="Demonstrativo" />
        <Vazio icone={Banknote} titulo="Nenhuma conta bancária" texto="Cadastre uma conta em Contas bancárias." />
      </>
    );
  }

  const d = montarDemonstrativo(conta, dados.extrato, dados.razao, dados.casamentos, mes);
  const fechamento = fechamentoDo(dados.fechamentos, conta.id, mes);
  const informado = dados.saldos.find((item) => item.contaId === conta.id && item.mes === mes)?.saldo ?? null;
  const checklist = checklistFechamento(conta, mes, d, informado, dados.fechamentos);
  const pronto = checklist.every((item) => item.ok);
  const nome = usuario?.nome ?? "";
  const podeEditar = pode(usuario, "contas.conciliacao.editar");
  const ehRevisor = Boolean(usuario && (usuario.papel === "admin" || usuario.papel === "gestor"));
  const competencia = `${mes.slice(5)}/${mes.slice(0, 4)}`;

  const deRazao = (lista: typeof d.depositosEmTransito): ItemDem[] =>
    lista.map((item) => ({ id: item.id, data: item.data, texto: item.descricao, documento: item.documento, valor: item.valor }));
  const deExtrato = (lista: typeof d.creditosNaoContabilizados): ItemDem[] =>
    lista.map((item) => ({ id: item.id, data: item.data, texto: item.historico, documento: item.documento, valor: item.valor }));

  function salvarSaldo() {
    if (saldoDigitado === null) return;
    const texto = saldoDigitado.trim();
    const negativo = texto.startsWith("-");
    const valor = parseAmount(texto.replace(/^-/, ""));
    informarSaldo(conta!.id, mes, texto ? (negativo ? -valor : valor) : null);
    setSaldoDigitado(null);
  }

  function exportarCsv() {
    const linhas: (string | number)[][] = [
      ["Conciliação bancária", rotuloConta(conta!), `Ag. ${conta!.agencia} C/C ${conta!.numero}`, `Competência ${competencia}`],
      [],
      ["Saldo conforme extrato", "", "", d.saldoExtrato],
      ...d.depositosEmTransito.map((i) => ["(+) Depósito em trânsito", i.data, i.descricao, i.valor]),
      ...d.pagamentosNaoCompensados.map((i) => ["(−) Pagamento não compensado", i.data, i.descricao, i.valor]),
      ["= Saldo bancário ajustado", "", "", d.saldoBancoAjustado],
      [],
      [`Saldo conforme razão (${conta!.contaContabil})`, "", "", d.saldoRazao],
      ...d.creditosNaoContabilizados.map((i) => ["(+) Crédito não contabilizado", i.data, i.historico, i.valor]),
      ...d.debitosNaoContabilizados.map((i) => ["(−) Débito não contabilizado", i.data, i.historico, i.valor]),
      ["= Saldo contábil ajustado", "", "", d.saldoRazaoAjustado],
      [],
      ["Diferença", "", "", d.diferenca],
    ];
    const csv = linhas.map((linha) => linha.map((celula) => (typeof celula === "number" ? celula.toFixed(2).replace(".", ",") : `"${String(celula).replace(/"/g, '""')}"`)).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `conciliacao-${conta!.banco.toLowerCase().replace(/\s+/g, "-")}-${conta!.empresa.toLowerCase()}-${mes}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <Cabecalho
        rotulo="Conciliação bancária"
        titulo="Demonstrativo"
        descricao="O relatório de conciliação: do saldo do banco e do saldo do razão até o mesmo saldo ajustado."
        acoes={<SeletorContaMes />}
      />

      <div className="grid-main">
        <section className="operations-surface demonstrativo">
          <div className="section-header">
            <div>
              <span className="eyebrow">
                {rotuloConta(conta)} · Ag. {conta.agencia} · C/C {conta.numero}
              </span>
              <h3>Conciliação de {competencia}</h3>
              <p>Data de corte {formatarData(d.corte)} · conta contábil {conta.contaContabil}</p>
            </div>
            <div className="inline-row nao-imprimir">
              <button type="button" className="icon-button" aria-label="Exportar CSV" title="Exportar CSV" onClick={exportarCsv}>
                <Download size={16} strokeWidth={1.9} />
              </button>
              <button type="button" className="icon-button" aria-label="Imprimir" title="Imprimir" onClick={() => window.print()}>
                <Printer size={16} strokeWidth={1.9} />
              </button>
            </div>
          </div>

          <table className="dem-tabela">
            <tbody>
              <LinhaTotal rotulo="Saldo conforme extrato bancário" valor={d.saldoExtrato} />
              <Grupo rotulo="(+) Depósitos em trânsito" ajuda="Entradas lançadas no razão que o banco ainda não creditou." itens={deRazao(d.depositosEmTransito)} />
              <Grupo rotulo="(−) Pagamentos não compensados" ajuda="Cheques e pagamentos registrados que o banco ainda não debitou." itens={deRazao(d.pagamentosNaoCompensados)} />
              <LinhaTotal rotulo="= Saldo bancário ajustado" valor={d.saldoBancoAjustado} destaque />
              <tr className="dem-espaco" aria-hidden="true">
                <td colSpan={3} />
              </tr>
              <LinhaTotal rotulo={`Saldo conforme razão (${conta.contaContabil})`} valor={d.saldoRazao} />
              <Grupo rotulo="(+) Créditos não contabilizados" ajuda="Rendimentos e recebimentos que o banco creditou e o razão ainda não tem." itens={deExtrato(d.creditosNaoContabilizados)} />
              <Grupo rotulo="(−) Débitos não contabilizados" ajuda="Tarifas, IOF e débitos automáticos ainda fora do razão." itens={deExtrato(d.debitosNaoContabilizados)} />
              <LinhaTotal rotulo="= Saldo contábil ajustado" valor={d.saldoRazaoAjustado} destaque />
            </tbody>
          </table>
          <div className={centavos(d.diferenca) === 0 ? "dem-resultado dem-resultado-ok" : "dem-resultado dem-resultado-erro"} role="status">
            <span>Diferença não explicada</span>
            <strong>{formatBRL(d.diferenca)}</strong>
          </div>
        </section>

        <div className="stack">
          <section className="operations-surface">
            <div className="section-header">
              <div>
                <span className="eyebrow">Fechamento</span>
                <h3>Situação do mês</h3>
              </div>
              <SeloFechamento fechamento={fechamento} />
            </div>

            <div className="field-group espaco-abaixo">
              <span className="field-label">Saldo final informado pelo banco</span>
              {saldoDigitado !== null ? (
                <form
                  className="inline-row"
                  onSubmit={(e) => {
                    e.preventDefault();
                    salvarSaldo();
                  }}
                >
                  <input className="field-input field-input-compacto" inputMode="decimal" autoFocus value={saldoDigitado} onChange={(e) => setSaldoDigitado(e.target.value)} aria-label="Saldo final informado pelo banco" placeholder="1.234,56" />
                  <button type="submit" className="button-secondary">
                    Salvar
                  </button>
                </form>
              ) : (
                <div className="inline-row inline-row-justo">
                  <strong className="money">{informado === null ? "Não informado" : formatBRL(informado)}</strong>
                  {podeEditar && !fechamento ? (
                    <button type="button" className="text-button" onClick={() => setSaldoDigitado(informado === null ? "" : informado.toFixed(2).replace(".", ","))}>
                      {informado === null ? "Informar" : "Alterar"}
                    </button>
                  ) : null}
                </div>
              )}
            </div>

            <ul className="checklist">
              {checklist.map((item) => (
                <li key={item.rotulo} className={item.ok ? "checklist-ok" : ""}>
                  {item.ok ? <CheckCircle2 size={17} strokeWidth={2} aria-hidden="true" /> : <Circle size={17} strokeWidth={1.8} aria-hidden="true" />}
                  <div>
                    <strong>
                      {item.rotulo}
                      <span className="sr-only">{item.ok ? " — ok" : " — pendente"}</span>
                    </strong>
                    <span>{item.detalhe}</span>
                  </div>
                </li>
              ))}
            </ul>

            {mensagem ? (
              <div className={`acesso-alerta-${mensagem.tom} espaco-acima-curto`} role="status">
                <span>{mensagem.texto}</span>
              </div>
            ) : null}

            {fechamento ? (
              <dl className="data-list espaco-acima">
                <div>
                  <dt>Preparado por</dt>
                  <dd>
                    {fechamento.preparadoPor} · {formatarDataHora(fechamento.preparadoEm)}
                  </dd>
                </div>
                <div>
                  <dt>Revisado por</dt>
                  <dd>{fechamento.revisadoPor ? `${fechamento.revisadoPor} · ${formatarDataHora(fechamento.revisadoEm ?? "")}` : "Aguardando"}</dd>
                </div>
                {fechamento.observacao ? (
                  <div className="data-list-cheio">
                    <dt>Observação</dt>
                    <dd>{fechamento.observacao}</dd>
                  </div>
                ) : null}
              </dl>
            ) : null}

            {!fechamento && podeEditar ? (
              <div className="espaco-acima">
                <Campo id="fch-obs" rotulo="Observação para o revisor" dica="Opcional: explique pendências relevantes.">
                  {(aria) => <textarea {...aria} className="field-input" value={observacao} onChange={(e) => setObservacao(e.target.value)} />}
                </Campo>
                <button
                  type="button"
                  className="button-primary button-block espaco-acima-curto"
                  disabled={!pronto}
                  onClick={() => {
                    enviarParaRevisao(conta, mes, nome, observacao);
                    setObservacao("");
                    setMensagem({ tom: "sucesso", texto: "Enviada para revisão. O mês está travado até a aprovação." });
                  }}
                >
                  <Send size={15} strokeWidth={2.2} /> Enviar para revisão
                </button>
                {!pronto ? <p className="field-hint espaco-acima-curto">Conclua o checklist para enviar.</p> : null}
              </div>
            ) : null}

            {fechamento?.status === "Em revisão" && ehRevisor ? (
              <div className="inline-row espaco-acima">
                <button
                  type="button"
                  className="button-primary"
                  onClick={() => {
                    const erro = aprovarFechamento(conta, mes, nome);
                    setMensagem(erro ? { tom: "erro", texto: erro } : { tom: "sucesso", texto: "Conciliação aprovada e mês fechado." });
                  }}
                >
                  <ShieldCheck size={15} strokeWidth={2.2} /> Aprovar e fechar
                </button>
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => {
                    reabrirMes(conta, mes, nome, "devolvida para ajustes");
                    setMensagem({ tom: "sucesso", texto: "Devolvida: o mês voltou a ficar em aberto." });
                  }}
                >
                  <RotateCcw size={15} strokeWidth={2} /> Devolver
                </button>
              </div>
            ) : null}

            {fechamento?.status === "Fechada" && usuario?.papel === "admin" ? (
              <button
                type="button"
                className="text-button text-button-neutro espaco-acima"
                onClick={() => {
                  reabrirMes(conta, mes, nome, "reaberta pelo administrador");
                  setMensagem({ tom: "sucesso", texto: "Mês reaberto." });
                }}
              >
                <RotateCcw size={14} strokeWidth={2} /> Reabrir mês
              </button>
            ) : null}
          </section>

          <section className="operations-surface">
            <div className="section-header">
              <div>
                <span className="eyebrow">Resumo</span>
                <h3>Movimento do mês</h3>
              </div>
            </div>
            <dl className="data-list">
              <div>
                <dt>Entradas no extrato</dt>
                <dd>{formatBRL(somar(dados.extrato.filter((i) => i.contaId === conta.id && i.data.startsWith(mes) && i.valor > 0)))}</dd>
              </div>
              <div>
                <dt>Saídas no extrato</dt>
                <dd>{formatBRL(Math.abs(somar(dados.extrato.filter((i) => i.contaId === conta.id && i.data.startsWith(mes) && i.valor < 0))))}</dd>
              </div>
              <div>
                <dt>Itens pendentes</dt>
                <dd>{d.pendencias}</dd>
              </div>
              <div>
                <dt>Diferença de saldos</dt>
                <dd>{formatBRL(d.saldoExtrato - d.saldoRazao)}</dd>
              </div>
            </dl>
          </section>
        </div>
      </div>
    </>
  );
}

function LinhaTotal({ rotulo, valor, destaque }: { rotulo: string; valor: number; destaque?: boolean }) {
  return (
    <tr className={destaque ? "dem-total dem-total-destaque" : "dem-total"}>
      <th scope="row" colSpan={2}>
        {rotulo}
      </th>
      <td>
        <Valor valor={valor} sinal={false} />
      </td>
    </tr>
  );
}

function Grupo({ rotulo, ajuda, itens }: { rotulo: string; ajuda: string; itens: ItemDem[] }) {
  return (
    <>
      <tr className="dem-grupo">
        <th scope="row" colSpan={2}>
          {rotulo}
          <span>{ajuda}</span>
        </th>
        <td>
          <Valor valor={somar(itens)} sinal={false} />
        </td>
      </tr>
      {itens.length === 0 ? (
        <tr className="dem-item dem-item-vazio">
          <td colSpan={3}>Nenhum</td>
        </tr>
      ) : (
        itens.map((item) => (
          <tr key={item.id} className="dem-item">
            <td>{formatarData(item.data)}</td>
            <td>
              {item.texto}
              {item.documento ? <span> · {item.documento}</span> : null}
            </td>
            <td>
              <Valor valor={item.valor} sinal={false} />
            </td>
          </tr>
        ))
      )}
    </>
  );
}
