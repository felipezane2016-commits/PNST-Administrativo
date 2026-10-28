import { pode } from "@/_core/identidade/permissoes";
import { useUsuarioAtual } from "@/_core/identidade/sessao";
import { formatarData, gerarId, HOJE } from "@/_core/tempo";
import Cabecalho from "@/admin/componentes/Cabecalho";
import Campo from "@/admin/componentes/Campo";
import Kpi from "@/admin/componentes/Kpi";
import Painel from "@/admin/componentes/Painel";
import Selo from "@/admin/componentes/Selo";
import Vazio from "@/admin/componentes/Vazio";
import { formatBRL, parseAmount } from "@/lib/portal";
import {
  conciliar,
  conciliarAutomaticamente,
  desfazerCasamento,
  excluirLancamento,
  importarExtrato,
  lancarAjustes,
  salvarLancamentoExtrato,
  salvarLancamentoRazao,
  trazerDoSistema,
} from "@/modulos/conciliacao/acoes";
import { useDadosConciliacao, useSelecao } from "@/modulos/conciliacao/colecoes";
import { centavos, fechamentoDo, fimDoMes, lerExtrato, saldoAte, situacoesNoCorte, somar, type Leitura } from "@/modulos/conciliacao/regras";
import { CONTRAPARTIDAS, type ContaBancaria, type Contrapartida, type LancamentoExtrato, type LancamentoRazao } from "@/modulos/conciliacao/tipos";
import { ArrowDownToLine, Banknote, BookOpenCheck, FileUp, Link2, Lock, Plus, Sparkles, Trash2, Undo2, Wand2 } from "lucide-react";
import { useState, type ChangeEvent } from "react";
import { rotuloConta, SeletorContaMes, Valor } from "./comum";

type Filtro = "Pendentes" | "Conciliados" | "Todos";
const FILTROS: Filtro[] = ["Pendentes", "Conciliados", "Todos"];

/** Palpite de contrapartida pelo histórico do banco. A pessoa confirma. */
function sugerirContrapartida(historico: string, valor: number): Contrapartida {
  const texto = historico.toUpperCase();
  if (texto.includes("IOF")) return "IOF";
  if (/TARIFA|TAR |CESTA|PACOTE/.test(texto)) return "Despesas bancárias";
  if (/REND|APLIC|JUROS/.test(texto) && valor > 0) return "Receitas financeiras";
  return valor > 0 ? "Outras receitas" : "Outras despesas";
}

export default function Conciliar() {
  const dados = useDadosConciliacao();
  const { conta, mes } = useSelecao();
  const usuario = useUsuarioAtual();
  const [filtro, setFiltro] = useState<Filtro>("Pendentes");
  const [selExtrato, setSelExtrato] = useState<string[]>([]);
  const [selRazao, setSelRazao] = useState<string[]>([]);
  const [aviso, setAviso] = useState<{ tom: "info" | "erro" | "sucesso"; texto: string } | null>(null);
  const [painel, setPainel] = useState<"ajuste" | "importar" | "novo" | null>(null);

  if (!conta) {
    return (
      <>
        <Cabecalho rotulo="Conciliação bancária" titulo="Conciliar" />
        <Vazio icone={Banknote} titulo="Nenhuma conta bancária" texto="Cadastre uma conta em Contas bancárias." />
      </>
    );
  }

  const fechamento = fechamentoDo(dados.fechamentos, conta.id, mes);
  const podeEditar = pode(usuario, "contas.conciliacao.editar") && !fechamento;
  const autor = usuario?.nome ?? "";
  const inicio = `${mes}-01`;
  const corte = fimDoMes(mes);
  const situacoes = situacoesNoCorte(conta, dados.extrato, dados.razao, dados.casamentos, corte);
  // O mês mostra o que é dele e as pendências que vieram de meses anteriores.
  const doMes = <T extends { item: { data: string }; situacao: string }>(linhas: T[]) =>
    linhas
      .filter((linha) => linha.item.data >= inicio || linha.situacao === "Pendente")
      .filter((linha) => filtro === "Todos" || (filtro === "Pendentes" ? linha.situacao === "Pendente" : linha.situacao === "Conciliado"))
      .sort((a, b) => a.item.data.localeCompare(b.item.data));
  const linhasExtrato = doMes(situacoes.extrato);
  const linhasRazao = doMes(situacoes.razao);
  const pendExtrato = situacoes.extrato.filter((linha) => linha.situacao === "Pendente").map((linha) => linha.item);
  const pendRazao = situacoes.razao.filter((linha) => linha.situacao === "Pendente").map((linha) => linha.item);
  const casamentosDoMes = dados.casamentos
    .filter((casamento) => casamento.contaId === conta.id)
    .map((casamento) => ({
      casamento,
      extrato: dados.extrato.filter((item) => casamento.extratoIds.includes(item.id)),
      razao: dados.razao.filter((item) => casamento.razaoIds.includes(item.id)),
    }))
    .filter((grupo) => grupo.extrato.some((item) => item.data.startsWith(mes)))
    .sort((a, b) => (a.extrato[0]?.data ?? "").localeCompare(b.extrato[0]?.data ?? ""));

  const selecionadosExtrato = dados.extrato.filter((item) => selExtrato.includes(item.id));
  const selecionadosRazao = dados.razao.filter((item) => selRazao.includes(item.id));
  const diferencaSel = (centavos(somar(selecionadosExtrato)) - centavos(somar(selecionadosRazao))) / 100;
  const temSelecao = selExtrato.length + selRazao.length > 0;

  function limpar() {
    setSelExtrato([]);
    setSelRazao([]);
  }
  function resultado(erro: string | null, sucesso: string) {
    setAviso(erro ? { tom: "erro", texto: erro } : { tom: "sucesso", texto: sucesso });
    if (!erro) limpar();
  }
  function alternar(lista: string[], definir: (ids: string[]) => void, id: string) {
    definir(lista.includes(id) ? lista.filter((item) => item !== id) : [...lista, id]);
  }

  function automatico() {
    const casados = conciliarAutomaticamente(conta!, corte, autor);
    setAviso(
      casados
        ? { tom: "sucesso", texto: `${casados} conciliação(ões) automática(s): mesmo valor, até 3 dias de diferença, e lotes que somam o débito do banco.` }
        : { tom: "info", texto: "Nada mais para casar com segurança. O que sobrou pede decisão: conciliar à mão ou lançar no razão." },
    );
    limpar();
  }

  function trazer() {
    const novos = trazerDoSistema();
    setAviso(
      novos
        ? { tom: "sucesso", texto: `${novos} lançamento(s) trazido(s) para o razão: pagamentos de prestadores e câmbio fechado.` }
        : { tom: "info", texto: "O razão já tem todos os pagamentos de prestadores e câmbios fechados do sistema." },
    );
  }

  return (
    <>
      <Cabecalho
        rotulo="Conciliação bancária"
        titulo="Conciliar"
        descricao="Case cada lançamento do extrato com o razão. O que sobra é pendência: em trânsito, não compensado ou ainda não contabilizado."
        acoes={<SeletorContaMes />}
      />

      {fechamento ? (
        <div className="acesso-alerta-info espaco-abaixo" role="status">
          <Lock size={15} strokeWidth={2} />
          <span>
            <strong>{fechamento.status === "Fechada" ? "Mês fechado." : "Mês em revisão."}</strong> {rotuloConta(conta)} em {mes.slice(5)}/{mes.slice(0, 4)} está travado
            para alterações. {fechamento.status === "Em revisão" ? "O revisor pode devolver no Demonstrativo." : "Um administrador pode reabrir no Demonstrativo."}
          </span>
        </div>
      ) : null}

      <div className="kpi-grid">
        <Kpi rotulo="Saldo do extrato" valor={formatBRL(saldoAte(conta, dados.extrato, corte))} detalhe={`em ${formatarData(corte)}`} icone={Banknote} tom="laranja" />
        <Kpi rotulo="Saldo do razão" valor={formatBRL(saldoAte(conta, dados.razao, corte))} detalhe={`conta ${conta.contaContabil}`} icone={BookOpenCheck} tom="neutro" />
        <Kpi rotulo="Pendentes no extrato" valor={String(pendExtrato.length)} detalhe={`${formatBRL(somar(pendExtrato))} sem par no razão`} tom={pendExtrato.length ? "ambar" : "verde"} />
        <Kpi rotulo="Pendentes no razão" valor={String(pendRazao.length)} detalhe={`${formatBRL(somar(pendRazao))} sem par no banco`} tom={pendRazao.length ? "ambar" : "verde"} />
      </div>

      <section className="operations-surface">
        <div className="surface-toolbar">
          <div className="filter-chips" role="group" aria-label="Filtrar lançamentos">
            {FILTROS.map((opcao) => (
              <button
                key={opcao}
                type="button"
                className={filtro === opcao ? "filter-chip filter-chip-active" : "filter-chip"}
                aria-pressed={filtro === opcao}
                onClick={() => setFiltro(opcao)}
              >
                {opcao}
              </button>
            ))}
          </div>
          {podeEditar ? (
            <div className="inline-row">
              <button type="button" className="button-secondary" onClick={() => setPainel("importar")}>
                <FileUp size={15} strokeWidth={2} /> Importar extrato
              </button>
              <button type="button" className="button-secondary" onClick={trazer}>
                <ArrowDownToLine size={15} strokeWidth={2} /> Trazer do sistema
              </button>
              <button type="button" className="button-secondary" onClick={() => setPainel("novo")}>
                <Plus size={15} strokeWidth={2} /> Novo lançamento
              </button>
              <button type="button" className="button-primary" onClick={automatico}>
                <Wand2 size={15} strokeWidth={2.2} /> Conciliar automaticamente
              </button>
            </div>
          ) : null}
        </div>

        {aviso ? (
          <div className={`acesso-alerta-${aviso.tom} espaco-abaixo`} role="status">
            {aviso.tom === "sucesso" ? <Sparkles size={15} strokeWidth={2} /> : null}
            <span>{aviso.texto}</span>
          </div>
        ) : null}

        <div className="conc-colunas">
          <LadoConciliacao
            titulo="Extrato bancário"
            subtitulo={`${conta.banco} · Ag. ${conta.agencia} · C/C ${conta.numero}`}
            linhas={linhasExtrato.map((linha) => ({ ...linha, texto: linha.item.historico }))}
            selecionados={selExtrato}
            podeEditar={podeEditar}
            inicio={inicio}
            aoAlternar={(id) => alternar(selExtrato, setSelExtrato, id)}
            aoExcluir={(id) => resultado(excluirLancamento("extrato", id), "Lançamento do extrato excluído.")}
          />
          <LadoConciliacao
            titulo="Razão"
            subtitulo={`Conta contábil ${conta.contaContabil} · ${rotuloConta(conta)}`}
            linhas={linhasRazao.map((linha) => ({ ...linha, texto: linha.item.descricao, detalhe: `${linha.item.origem} · ${linha.item.contrapartida}` }))}
            selecionados={selRazao}
            podeEditar={podeEditar}
            inicio={inicio}
            aoAlternar={(id) => alternar(selRazao, setSelRazao, id)}
            aoExcluir={(id) => resultado(excluirLancamento("razao", id), "Lançamento do razão excluído.")}
          />
        </div>

        {temSelecao ? (
          <div className="conc-barra" role="region" aria-label="Seleção">
            <dl>
              <div>
                <dt>Extrato ({selExtrato.length})</dt>
                <dd>{formatBRL(somar(selecionadosExtrato))}</dd>
              </div>
              <div>
                <dt>Razão ({selRazao.length})</dt>
                <dd>{formatBRL(somar(selecionadosRazao))}</dd>
              </div>
              <div>
                <dt>Diferença</dt>
                <dd className={diferencaSel === 0 ? "conc-barra-ok" : "conc-barra-erro"}>{formatBRL(diferencaSel)}</dd>
              </div>
            </dl>
            <div className="inline-row">
              <button type="button" className="button-secondary" onClick={limpar}>
                Limpar
              </button>
              {selRazao.length === 0 && selExtrato.length > 0 ? (
                <button type="button" className="button-secondary" onClick={() => setPainel("ajuste")}>
                  <BookOpenCheck size={15} strokeWidth={2} /> Lançar no razão
                </button>
              ) : null}
              <button
                type="button"
                className="button-primary"
                disabled={!selExtrato.length || !selRazao.length || diferencaSel !== 0}
                onClick={() => resultado(conciliar(selExtrato, selRazao, autor), "Lançamentos conciliados.")}
              >
                <Link2 size={15} strokeWidth={2.2} /> Conciliar selecionados
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="operations-surface espaco-acima">
        <div className="section-header">
          <div>
            <span className="eyebrow">Trilha</span>
            <h3>Conciliações do mês</h3>
            <p>Quem casou o quê, e como. Desfazer devolve os lançamentos para pendentes; desfazer um ajuste também apaga o lançamento criado no razão.</p>
          </div>
        </div>
        {casamentosDoMes.length === 0 ? (
          <Vazio icone={Link2} titulo="Nenhuma conciliação neste mês" texto="Use Conciliar automaticamente ou selecione os pares à mão." />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Extrato</th>
                  <th>Razão</th>
                  <th>Valor</th>
                  <th>Modo</th>
                  <th>Por</th>
                  <th>
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {casamentosDoMes.map(({ casamento, extrato, razao }) => (
                  <tr key={casamento.id}>
                    <td className="cell-main celula-quebra-conc">
                      {extrato.map((item) => (
                        <span key={item.id}>
                          {formatarData(item.data)} · {item.historico}
                        </span>
                      ))}
                    </td>
                    <td className="cell-main celula-quebra-conc">
                      {razao.map((item) => (
                        <span key={item.id}>
                          {formatarData(item.data)} · {item.descricao}
                        </span>
                      ))}
                    </td>
                    <td>
                      <Valor valor={somar(extrato)} />
                    </td>
                    <td>
                      <Selo tom={casamento.modo === "Automático" ? "blue" : casamento.modo === "Ajuste" ? "amber" : "neutral"}>{casamento.modo}</Selo>
                    </td>
                    <td>{casamento.autor}</td>
                    <td>
                      {podeEditar ? (
                        <button
                          type="button"
                          className="icon-button icon-button-pequeno"
                          aria-label="Desfazer conciliação"
                          title="Desfazer conciliação"
                          onClick={() => resultado(desfazerCasamento(casamento.id), "Conciliação desfeita.")}
                        >
                          <Undo2 size={14} strokeWidth={2} />
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

      {painel === "ajuste" ? (
        <PainelAjuste
          linhas={selecionadosExtrato}
          aoFechar={() => setPainel(null)}
          aoConfirmar={(contrapartida) => {
            resultado(lancarAjustes(selExtrato, contrapartida, autor), `${selExtrato.length} lançamento(s) contabilizado(s) em ${contrapartida} e conciliado(s).`);
            setPainel(null);
          }}
        />
      ) : null}
      {painel === "importar" ? (
        <PainelImportar
          conta={conta}
          aoFechar={() => setPainel(null)}
          aoImportar={(arquivo, leitura) => {
            const r = importarExtrato(conta, arquivo, leitura.formato, leitura.linhas, leitura.saldoFinal, autor);
            setAviso({
              tom: "sucesso",
              texto: `${r.novas} lançamento(s) importado(s)${r.duplicadas ? `, ${r.duplicadas} já existia(m) e ficou(aram) de fora` : ""}${r.travadas ? `, ${r.travadas} de mês travado ignorado(s)` : ""}.`,
            });
            setPainel(null);
          }}
        />
      ) : null}
      {painel === "novo" ? (
        <PainelNovoLancamento
          conta={conta}
          mes={mes}
          aoFechar={() => setPainel(null)}
          aoSalvar={(erro, lado) => {
            resultado(erro, lado === "extrato" ? "Lançamento incluído no extrato." : "Lançamento incluído no razão.");
            if (!erro) setPainel(null);
          }}
        />
      ) : null}
    </>
  );
}

type LinhaLado = {
  item: { id: string; data: string; documento: string; valor: number };
  situacao: "Conciliado" | "Pendente";
  casamento: { modo: string } | null;
  texto: string;
  detalhe?: string;
};

function LadoConciliacao({
  titulo,
  subtitulo,
  linhas,
  selecionados,
  podeEditar,
  inicio,
  aoAlternar,
  aoExcluir,
}: {
  titulo: string;
  subtitulo: string;
  linhas: LinhaLado[];
  selecionados: string[];
  podeEditar: boolean;
  inicio: string;
  aoAlternar: (id: string) => void;
  aoExcluir: (id: string) => void;
}) {
  return (
    <div className="conc-lado">
      <div className="conc-lado-head">
        <div>
          <span className="eyebrow">{titulo}</span>
          <p>{subtitulo}</p>
        </div>
        <span className="conc-lado-total">{linhas.length} lanç.</span>
      </div>
      {linhas.length === 0 ? (
        <Vazio icone={BookOpenCheck} titulo="Nada aqui" texto="Mude o filtro ou o mês." />
      ) : (
        <ul className="conc-lista">
          {linhas.map(({ item, situacao, casamento, texto, detalhe }) => {
            const pendente = situacao === "Pendente";
            const marcado = selecionados.includes(item.id);
            const id = `sel-${item.id}`;
            return (
              <li key={item.id} className={marcado ? "conc-item conc-item-marcado" : pendente ? "conc-item" : "conc-item conc-item-ok"}>
                {podeEditar && pendente && !casamento ? (
                  <input id={id} type="checkbox" checked={marcado} onChange={() => aoAlternar(item.id)} aria-label={`Selecionar ${texto}`} />
                ) : (
                  <span className="conc-item-vazio" aria-hidden="true" />
                )}
                <label htmlFor={id} className="conc-item-copy">
                  <strong>{texto || "—"}</strong>
                  <span>
                    {formatarData(item.data)}
                    {item.data < inicio ? " · mês anterior" : ""}
                    {item.documento ? ` · ${item.documento}` : ""}
                    {detalhe ? ` · ${detalhe}` : ""}
                  </span>
                </label>
                <div className="conc-item-fim">
                  <Valor valor={item.valor} />
                  {pendente ? (
                    casamento ? <Selo tom="blue">Compensa depois</Selo> : <Selo tom="amber">Pendente</Selo>
                  ) : (
                    <Selo tom="green">Conciliado</Selo>
                  )}
                </div>
                {podeEditar && pendente && !casamento ? (
                  <button type="button" className="icon-button icon-button-pequeno" aria-label={`Excluir ${texto}`} onClick={() => aoExcluir(item.id)}>
                    <Trash2 size={14} strokeWidth={1.9} />
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function PainelAjuste({ linhas, aoFechar, aoConfirmar }: { linhas: LancamentoExtrato[]; aoFechar: () => void; aoConfirmar: (c: Contrapartida) => void }) {
  const [contrapartida, setContrapartida] = useState<Contrapartida>(sugerirContrapartida(linhas[0]?.historico ?? "", linhas[0]?.valor ?? 0));
  return (
    <Painel
      rotulo="Ajuste de conciliação"
      titulo="Lançar no razão"
      descricao="Contabiliza o que só o banco registrou — tarifa, IOF, rendimento — e já concilia com o extrato."
      aoFechar={aoFechar}
      aoEnviar={() => aoConfirmar(contrapartida)}
      textoEnviar="Lançar e conciliar"
    >
      <ul className="conc-resumo">
        {linhas.map((linha) => (
          <li key={linha.id}>
            <span>
              {formatarData(linha.data)} · {linha.historico}
            </span>
            <Valor valor={linha.valor} />
          </li>
        ))}
      </ul>
      <Campo id="aj-contrapartida" rotulo="Contrapartida (conta do plano)" dica="A outra perna do lançamento: onde a despesa ou a receita entra no resultado.">
        {(aria) => (
          <select {...aria} className="field-input" value={contrapartida} onChange={(e) => setContrapartida(e.target.value as Contrapartida)}>
            {CONTRAPARTIDAS.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        )}
      </Campo>
    </Painel>
  );
}

const MODELO_CSV = "Data;Histórico;Documento;Valor\n01/07/2026;TARIFA PACOTE SERVICOS;;-189,90\n02/07/2026;TED RECEBIDA CLIENTE;NF 51001;12.500,00\n31/07/2026;SALDO FINAL;;12.310,10\n";

function PainelImportar({ conta, aoFechar, aoImportar }: { conta: ContaBancaria; aoFechar: () => void; aoImportar: (arquivo: string, leitura: Leitura & { formato: "CSV" | "OFX" }) => void }) {
  const [arquivo, setArquivo] = useState("");
  const [leitura, setLeitura] = useState<(Leitura & { formato: "CSV" | "OFX" }) | null>(null);
  const [erro, setErro] = useState("");

  async function escolherArquivo(evento: ChangeEvent<HTMLInputElement>) {
    const escolhido = evento.target.files?.[0];
    if (!escolhido) return;
    setArquivo(escolhido.name);
    const lido = lerExtrato(escolhido.name, await escolhido.text());
    setLeitura(lido);
    setErro("");
  }

  function confirmar() {
    if (!leitura || leitura.linhas.length === 0) {
      setErro("Escolha um arquivo com lançamentos válidos.");
      return;
    }
    aoImportar(arquivo, leitura);
  }

  return (
    <Painel
      rotulo={`Importar extrato · ${rotuloConta(conta)}`}
      titulo="Importar extrato bancário"
      descricao="OFX do internet banking ou CSV com data, histórico, documento e valor. Linhas já importadas ficam de fora."
      aoFechar={aoFechar}
      aoEnviar={confirmar}
      textoEnviar="Importar"
      rodapeExtra={
        <a className="text-button" href={`data:text/csv;charset=utf-8,${encodeURIComponent(MODELO_CSV)}`} download="modelo-extrato.csv">
          Baixar modelo CSV
        </a>
      }
    >
      <Campo id="imp-arquivo" rotulo="Arquivo" erro={erro || undefined}>
        {(aria) => <input {...aria} className="field-input" type="file" accept=".ofx,.csv,.txt" onChange={escolherArquivo} />}
      </Campo>
      {leitura ? (
        <dl className="data-list">
          <div>
            <dt>Formato</dt>
            <dd>{leitura.formato}</dd>
          </div>
          <div>
            <dt>Lançamentos lidos</dt>
            <dd>{leitura.linhas.length}</dd>
          </div>
          <div>
            <dt>Período</dt>
            <dd>
              {leitura.linhas.length
                ? `${formatarData(leitura.linhas.map((l) => l.data).sort()[0])} a ${formatarData(leitura.linhas.map((l) => l.data).sort().at(-1))}`
                : "—"}
            </dd>
          </div>
          <div>
            <dt>Saldo final informado</dt>
            <dd>{leitura.saldoFinal === null ? "não veio no arquivo" : formatBRL(leitura.saldoFinal)}</dd>
          </div>
        </dl>
      ) : null}
      {leitura?.erros.length ? (
        <div className="acesso-alerta-erro espaco-acima-curto" role="alert">
          <span>
            {leitura.erros.length} linha(s) ignorada(s): {leitura.erros.slice(0, 3).join(" ")}
            {leitura.erros.length > 3 ? " …" : ""}
          </span>
        </div>
      ) : null}
    </Painel>
  );
}

type ErrosNovo = Partial<Record<"texto" | "valor" | "data", string>>;

function PainelNovoLancamento({
  conta,
  mes,
  aoFechar,
  aoSalvar,
}: {
  conta: ContaBancaria;
  mes: string;
  aoFechar: () => void;
  aoSalvar: (erro: string | null, lado: "extrato" | "razao") => void;
}) {
  const [lado, setLado] = useState<"extrato" | "razao">("razao");
  const [dados, setDados] = useState({
    data: HOJE.startsWith(mes) ? HOJE : fimDoMes(mes),
    texto: "",
    documento: "",
    sentido: "saida" as "entrada" | "saida",
    valor: "",
    contrapartida: "Outras despesas" as Contrapartida,
  });
  const [erros, setErros] = useState<ErrosNovo>({});

  function salvar() {
    const valor = parseAmount(dados.valor);
    const encontrados: ErrosNovo = {};
    if (!dados.texto.trim()) encontrados.texto = "Descreva o lançamento.";
    if (!(valor > 0)) encontrados.valor = "Informe um valor maior que zero.";
    if (dados.data <= conta.dataSaldoInicial) encontrados.data = `Use data depois de ${formatarData(conta.dataSaldoInicial)} (saldo de abertura).`;
    if (Object.values(encontrados).some(Boolean)) {
      setErros(encontrados);
      return;
    }
    const comSinal = dados.sentido === "saida" ? -valor : valor;
    if (lado === "extrato") {
      const item: LancamentoExtrato = {
        id: gerarId("ext"),
        contaId: conta.id,
        data: dados.data,
        historico: dados.texto.trim().toUpperCase(),
        documento: dados.documento.trim(),
        valor: comSinal,
        origem: "Manual",
        importacaoId: null,
        chave: `manual:${gerarId("m")}`,
      };
      aoSalvar(salvarLancamentoExtrato(item), lado);
    } else {
      const item: LancamentoRazao = {
        id: gerarId("raz"),
        contaId: conta.id,
        data: dados.data,
        descricao: dados.texto.trim(),
        documento: dados.documento.trim(),
        valor: comSinal,
        origem: "Manual",
        origemId: null,
        contrapartida: dados.contrapartida,
      };
      aoSalvar(salvarLancamentoRazao(item), lado);
    }
  }

  return (
    <Painel rotulo={rotuloConta(conta)} titulo="Novo lançamento" aoFechar={aoFechar} aoEnviar={salvar}>
      <div className="filter-chips espaco-abaixo-curto" role="group" aria-label="Onde lançar">
        {(["razao", "extrato"] as const).map((opcao) => (
          <button key={opcao} type="button" className={lado === opcao ? "filter-chip filter-chip-active" : "filter-chip"} aria-pressed={lado === opcao} onClick={() => setLado(opcao)}>
            {opcao === "razao" ? "No razão" : "No extrato"}
          </button>
        ))}
      </div>
      <div className="field-grid">
        <Campo id="nl-data" rotulo="Data" erro={erros.data}>
          {(aria) => <input {...aria} className="field-input" type="date" value={dados.data} onChange={(e) => setDados({ ...dados, data: e.target.value })} />}
        </Campo>
        <Campo id="nl-doc" rotulo="Documento">
          {(aria) => <input {...aria} className="field-input" value={dados.documento} onChange={(e) => setDados({ ...dados, documento: e.target.value })} placeholder="CHQ 000982, NF 51002…" />}
        </Campo>
      </div>
      <Campo id="nl-texto" rotulo={lado === "razao" ? "Descrição" : "Histórico do banco"} erro={erros.texto}>
        {(aria) => <input {...aria} className="field-input" value={dados.texto} onChange={(e) => setDados({ ...dados, texto: e.target.value })} />}
      </Campo>
      <div className="field-grid">
        <Campo id="nl-sentido" rotulo="Sentido">
          {(aria) => (
            <select {...aria} className="field-input" value={dados.sentido} onChange={(e) => setDados({ ...dados, sentido: e.target.value as "entrada" | "saida" })}>
              <option value="saida">Saída (débito no banco)</option>
              <option value="entrada">Entrada (crédito no banco)</option>
            </select>
          )}
        </Campo>
        <Campo id="nl-valor" rotulo="Valor" erro={erros.valor}>
          {(aria) => <input {...aria} className="field-input" inputMode="decimal" value={dados.valor} onChange={(e) => setDados({ ...dados, valor: e.target.value })} placeholder="1.234,56" />}
        </Campo>
      </div>
      {lado === "razao" ? (
        <Campo id="nl-contra" rotulo="Contrapartida">
          {(aria) => (
            <select {...aria} className="field-input" value={dados.contrapartida} onChange={(e) => setDados({ ...dados, contrapartida: e.target.value as Contrapartida })}>
              {CONTRAPARTIDAS.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          )}
        </Campo>
      ) : null}
    </Painel>
  );
}
