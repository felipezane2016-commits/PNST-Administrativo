import { apagarAnexo, baixarBlob, guardarAnexo, lerAnexo } from "@/_core/armazenamento/anexos";
import { useColecao } from "@/_core/armazenamento/colecao";
import { pode, type Usuario } from "@/_core/identidade/permissoes";
import { usuarios } from "@/_core/identidade/sessao";
import { formatarData, formatarDataHora, HOJE, horaDeBrasilia } from "@/_core/tempo";
import Gaveta from "@/admin/componentes/Gaveta";
import Selo from "@/admin/componentes/Selo";
import { formatBRL, parseAmount } from "@/lib/portal";
import {
  marcarBaixa,
  registrarDecisao,
  registrarFechamento,
  registrarInvoiceEnviada,
  registrarOkBanco,
  registrarResposta,
  voltarEtapa,
  type ItemBaixa,
} from "@/modulos/contas/acoesOrdens";
import { ordens as colecaoOrdens, useDadosContas } from "@/modulos/contas/colecoes";
import { emailInvoiceAoBanco, emailRespostaAoBanco } from "@/modulos/contas/emails";
import { formatarMoeda, formatarTaxa } from "@/modulos/contas/formato";
import { CONTA_BIB_PNST } from "@/modulos/conciliacao/dadosMock";
import { escolher } from "@/modulos/conciliacao/colecoes";
import { etapaDaOrdem, PROXIMO_PASSO, somaInvoices, taxaDoBanco, tipoDaOrdem, ultimaTaxa, valorEmReais, type Etapa } from "@/modulos/contas/regras";
import { PRAZOS_DECISAO, TIPOS_INVOICE, type Invoice, type Ordem, type PrazoDecisao, type TipoInvoice } from "@/modulos/contas/tipos";
import { Check, Download, FileText, Pencil, Plus, Send, Trash2, Undo2 } from "lucide-react";
import { useState, type ChangeEvent } from "react";
import { useLocation } from "wouter";
import AcoesEmail from "./AcoesEmail";

/** Linha do tempo: cada passo está feito quando a data correspondente existe. */
const PASSOS: { rotulo: string; feito: (ordem: Ordem) => boolean }[] = [
  { rotulo: "Ordem recebida do banco", feito: () => true },
  { rotulo: "Invoice gerada no Sisjuri e enviada ao banco", feito: (o) => Boolean(o.invoiceEnviadaEm) },
  { rotulo: "OK do banco para fechamento", feito: (o) => Boolean(o.okBancoEm) },
  { rotulo: "Cotação enviada aos superiores", feito: (o) => Boolean(o.enviadaSuperioresEm) },
  { rotulo: "Decisão: aguardar ou D+0 / D+1 / D+2", feito: (o) => Boolean(o.decisao) },
  { rotulo: "Câmbio fechado com o banco", feito: (o) => Boolean(o.fechamento) },
  { rotulo: "Resposta ao banco com cotação e invoices", feito: (o) => Boolean(o.respostaBancoEm) },
  { rotulo: "Baixa no Sisjuri, extrato e contrato de câmbio", feito: (o) => Boolean(o.baixa.sisjuri && o.baixa.extrato && o.baixa.contrato) },
];

export default function FichaOrdem({ ordem, usuario, aoFechar, aoEditar, aoExcluir, aoEnviarSuperiores }: {
  ordem: Ordem;
  usuario: Usuario | null;
  aoFechar: () => void;
  aoEditar: () => void;
  /** Só para quem pode excluir registros. */
  aoExcluir?: () => void;
  aoEnviarSuperiores: () => void;
}) {
  const etapa = etapaDaOrdem(ordem);
  const podeEditar = pode(usuario, "contas.banco.editar");
  const autor = usuario?.nome ?? "";
  const reais = valorEmReais(ordem);

  return (
    <Gaveta
      rotulo={`Ordem nº ${ordem.numeroOrdem}`}
      titulo={ordem.cliente}
      subtitulo={
        <>
          {formatarMoeda(ordem.valor, ordem.moeda)} · recebida em {formatarData(ordem.dataRecebimento)} · <Selo tom={etapa === "Concluída" ? "green" : "amber"}>{etapa}</Selo>
        </>
      }
      aoFechar={aoFechar}
      rodape={
        podeEditar ? (
          <div className="inline-row inline-row-justo">
            <button type="button" className="text-button text-button-neutro" onClick={aoEditar}>
              <Pencil size={14} strokeWidth={2} /> Editar dados
            </button>
            {aoExcluir ? (
              <button type="button" className="text-button text-button-perigo" onClick={aoExcluir}>
                <Trash2 size={14} strokeWidth={2} /> Excluir ordem
              </button>
            ) : null}
            {etapa !== "Recebida" && !Object.values(ordem.baixa).some(Boolean) ? (
              <button type="button" className="text-button text-button-neutro" onClick={() => voltarEtapa(ordem.id, autor)}>
                <Undo2 size={14} strokeWidth={2} /> Desfazer última etapa
              </button>
            ) : null}
          </div>
        ) : null
      }
    >

      {etapa !== "Concluída" ? (
        <section className="ficha-passo ficha-passo-topo">
          <span className="eyebrow accent-eyebrow">Próximo passo</span>
          <h3>{PROXIMO_PASSO[etapa]}</h3>
          {podeEditar || etapa === "Aguardando decisão" || etapa === "Aguardando câmbio" ? (
            <AcaoDaEtapa ordem={ordem} etapa={etapa} usuario={usuario} autor={autor} podeEditar={podeEditar} aoEnviarSuperiores={aoEnviarSuperiores} />
          ) : (
            <p className="field-hint">Seu perfil só consulta.</p>
          )}
        </section>
      ) : null}

      <section className="espaco-acima">
        <span className="eyebrow">Etapas</span>
      <ol className="next-step-list espaco-acima-curto">
        {PASSOS.map((passo, indice) => {
          const feito = passo.feito(ordem);
          const corrente = !feito && PASSOS.slice(0, indice).every((anterior) => anterior.feito(ordem));
          return (
            <li key={passo.rotulo} className={`next-step${feito ? " next-step-done" : ""}${corrente ? " next-step-atual" : ""}`} aria-current={corrente ? "step" : undefined}>
              <span className="step-number">{feito ? <Check size={13} strokeWidth={2.6} /> : indice + 1}</span>
              <div className="next-step-copy">
                <strong>{passo.rotulo}</strong>
              </div>
            </li>
          );
        })}
      </ol>
      </section>

      <section className="espaco-acima">
        <span className="eyebrow">Invoices</span>
        <ListaInvoices ordem={ordem} editavel={podeEditar && !ordem.fechamento} />
      </section>

      <dl className="data-list espaco-acima">
        <div>
          <dt>Ordenante</dt>
          <dd>{ordem.cliente}</dd>
        </div>
        <div>
          <dt>Beneficiário</dt>
          <dd>{ordem.beneficiario || "—"}</dd>
        </div>
        <div>
          <dt>Tipo</dt>
          <dd>{tipoDaOrdem(ordem) ?? "Sem invoice"}</dd>
        </div>
        <div>
          <dt>Bloqueia e-mails de vencidas</dt>
          <dd>{ordem.bloqueiaEmails ? "Sim" : "Não"}</dd>
        </div>
        <div>
          <dt>Decisão</dt>
          <dd>
            {ordem.decisao
              ? `${ordem.decisao.prazo}${ordem.decisao.dataFechamento ? ` · fechar em ${formatarData(ordem.decisao.dataFechamento)}` : ""}${ordem.decisao.taxaAlvo ? ` · alvo ${formatarTaxa(ordem.decisao.taxaAlvo)}` : ""} — ${ordem.decisao.decididoPor} (${ordem.decisao.canal.toLowerCase()})`
              : "—"}
          </dd>
        </div>
        <div>
          <dt>Fechamento</dt>
          <dd>
            {ordem.fechamento
              ? `${formatarTaxa(ordem.fechamento.cotacao)} em ${formatarData(ordem.fechamento.data)} = ${formatBRL(reais ?? 0)} · ${ordem.fechamento.quemFechou}`
              : "—"}
          </dd>
        </div>
        {ordem.observacoes ? (
          <div className="data-list-cheio">
            <dt>Observações</dt>
            <dd>{ordem.observacoes}</dd>
          </div>
        ) : null}
      </dl>

      <section className="espaco-acima">
        <span className="eyebrow">Histórico</span>
        <ul className="historico-ordem">
          {[...ordem.historico].reverse().map((evento, indice) => (
            <li key={indice}>
              <strong>{evento.texto}</strong>
              <span>
                {formatarDataHora(evento.quando)} · {evento.autor}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </Gaveta>
  );
}

function AcaoDaEtapa({ ordem, etapa, usuario, autor, podeEditar, aoEnviarSuperiores }: {
  ordem: Ordem;
  etapa: Etapa;
  usuario: Usuario | null;
  autor: string;
  podeEditar: boolean;
  aoEnviarSuperiores: () => void;
}) {
  const { configEmails } = useDadosContas();
  const hora = horaDeBrasilia();
  switch (etapa) {
    case "Recebida":
      return ordem.invoices.length === 0 ? (
        <p className="field-hint">Gere a invoice no Sisjuri e cadastre-a abaixo em Invoices (número, valor, honorários ou despesas e o PDF). O e-mail ao banco aparece aqui em seguida.</p>
      ) : Math.abs(somaInvoices(ordem) - ordem.valor) > 0.005 ? (
        <>
          <p className="field-error">
            As invoices somam {formatarMoeda(somaInvoices(ordem), ordem.moeda)}, mas a ordem é de {formatarMoeda(ordem.valor, ordem.moeda)}. Confira antes de enviar.
          </p>
          <AcoesEmail email={emailInvoiceAoBanco(ordem, configEmails, hora)} aoMarcarEnviado={() => registrarInvoiceEnviada(ordem.id, autor)} textoMarcar="Enviar mesmo assim" />
        </>
      ) : (
        <AcoesEmail email={emailInvoiceAoBanco(ordem, configEmails, hora)} aoMarcarEnviado={() => registrarInvoiceEnviada(ordem.id, autor)} textoMarcar="Marcar invoice como enviada" />
      );
    case "Invoice enviada":
      return (
        <button type="button" className="button-primary" onClick={() => registrarOkBanco(ordem.id, autor)}>
          <Check size={15} strokeWidth={2.2} /> Banco deu OK
        </button>
      );
    case "Liberada pelo banco":
      return (
        <button type="button" className="button-primary" onClick={aoEnviarSuperiores}>
          <Send size={15} strokeWidth={2.2} /> Montar e-mail aos superiores
        </button>
      );
    case "Aguardando decisão":
      return <FormDecisao ordem={ordem} usuario={usuario} autor={autor} />;
    case "Aguardando câmbio":
    case "Fechamento agendado":
      return (
        <>
          {etapa === "Aguardando câmbio" ? <FormDecisao ordem={ordem} usuario={usuario} autor={autor} nova /> : null}
          {podeEditar ? <FormFechamento ordem={ordem} autor={autor} /> : null}
        </>
      );
    case "Fechada":
      return <AcoesEmail email={emailRespostaAoBanco(ordem, configEmails, hora)} aoMarcarEnviado={() => registrarResposta(ordem.id, autor)} textoMarcar="Marcar resposta como enviada" />;
    case "Baixa pendente":
      return <ChecklistBaixa ordem={ordem} autor={autor} />;
    default:
      return null;
  }
}

/**
 * Superior (gestor ou administrador) decide no sistema. Os demais registram a
 * decisão que chegou por e-mail, dizendo quem decidiu.
 */
function FormDecisao({ ordem, usuario, autor, nova }: { ordem: Ordem; usuario: Usuario | null; autor: string; nova?: boolean }) {
  const lista = useColecao(usuarios);
  const superiores = lista.filter((pessoa) => pessoa.ativo && (pessoa.papel === "admin" || pessoa.papel === "gestor"));
  const ehSuperior = Boolean(usuario && (usuario.papel === "admin" || usuario.papel === "gestor"));
  const podeRegistrar = ehSuperior || pode(usuario, "contas.banco.editar");
  const [aberto, setAberto] = useState(!nova);
  const [prazo, setPrazo] = useState<PrazoDecisao>("D+0");
  const [alvo, setAlvo] = useState("");
  const [obs, setObs] = useState("");
  const [quem, setQuem] = useState(superiores[0]?.nome ?? "");
  if (!podeRegistrar) return null;
  if (!aberto)
    return (
      <button type="button" className="text-button espaco-abaixo-curto" onClick={() => setAberto(true)}>
        Mudar a decisão (ex.: fechar agora)
      </button>
    );

  function decidir() {
    const taxaAlvo = prazo === "Aguardar" && alvo.trim() ? Number.parseFloat(alvo.replace(",", ".")) : null;
    registrarDecisao(
      ordem.id,
      { prazo, taxaAlvo: taxaAlvo && Number.isFinite(taxaAlvo) ? taxaAlvo : null, observacao: obs.trim(), canal: ehSuperior ? "Sistema" : "E-mail", decididoPor: ehSuperior ? autor : quem },
      autor,
    );
  }

  return (
    <div className="form-decisao">
      <div className="filter-chips" role="group" aria-label="Decisão">
        {PRAZOS_DECISAO.map((opcao) => (
          <button key={opcao} type="button" className={prazo === opcao ? "filter-chip filter-chip-active" : "filter-chip"} aria-pressed={prazo === opcao} onClick={() => setPrazo(opcao)}>
            {opcao === "Aguardar" ? "Aguardar câmbio" : `Fechar ${opcao}`}
          </button>
        ))}
      </div>
      <div className="field-grid espaco-acima-curto">
        {prazo === "Aguardar" ? (
          <label className="field-group">
            <span className="field-label">Taxa-alvo do BIB (opcional)</span>
            <input className="field-input" inputMode="decimal" value={alvo} onChange={(e) => setAlvo(e.target.value)} placeholder="6,1500" />
          </label>
        ) : null}
        {!ehSuperior ? (
          <label className="field-group">
            <span className="field-label">Quem decidiu (por e-mail)</span>
            <select className="field-input" value={quem} onChange={(e) => setQuem(e.target.value)}>
              {superiores.map((pessoa) => (
                <option key={pessoa.id}>{pessoa.nome}</option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      <label className="field-group">
        <span className="field-label">Observação</span>
        <input className="field-input" value={obs} onChange={(e) => setObs(e.target.value)} />
      </label>
      <button type="button" className="button-primary espaco-acima-curto" onClick={decidir}>
        <Check size={15} strokeWidth={2.2} /> {ehSuperior ? "Registrar minha decisão" : "Registrar decisão recebida"}
      </button>
    </div>
  );
}

function FormFechamento({ ordem, autor }: { ordem: Ordem; autor: string }) {
  const { taxas } = useDadosContas();
  const ultima = ultimaTaxa(taxas);
  const sugestao = ultima ? taxaDoBanco(ultima, "bib", ordem.moeda) : 0;
  // "Quem fechou" repete o último usado: costuma ser a mesma dupla.
  const ultimoQuem = colecaoOrdens.ler().filter((item) => item.fechamento).sort((a, b) => (a.fechamento!.data < b.fechamento!.data ? 1 : -1))[0]?.fechamento?.quemFechou ?? "";
  const [cotacao, setCotacao] = useState(sugestao ? sugestao.toFixed(4).replace(".", ",") : "");
  const [data, setData] = useState(HOJE);
  const [quem, setQuem] = useState(ultimoQuem);
  const [erro, setErro] = useState<string | null>(null);
  const numero = Number.parseFloat(cotacao.replace(",", "."));

  function fechar() {
    if (!(numero >= 1 && numero <= 20)) return setErro("Cotação entre 1 e 20 (ex.: 6,1245).");
    if (!quem.trim()) return setErro("Informe quem fechou (ex.: FM / operador do banco).");
    registrarFechamento(ordem.id, { cotacao: numero, data, quemFechou: quem.trim() }, autor);
  }

  return (
    <div className="form-decisao espaco-acima-curto">
      <div className="field-grid">
        <label className="field-group">
          <span className="field-label">Cotação fechada</span>
          <input className="field-input" inputMode="decimal" value={cotacao} onChange={(e) => setCotacao(e.target.value)} />
          {numero > 0 ? <span className="field-hint">= {formatBRL(numero * ordem.valor)}</span> : null}
        </label>
        <label className="field-group">
          <span className="field-label">Data do fechamento</span>
          <input className="field-input" type="date" value={data} onChange={(e) => setData(e.target.value)} />
        </label>
      </div>
      <label className="field-group">
        <span className="field-label">Quem fechou</span>
        <input className="field-input" value={quem} onChange={(e) => setQuem(e.target.value)} placeholder="FM / operador do banco" />
      </label>
      {erro ? <p className="field-error">{erro}</p> : null}
      <button type="button" className="button-primary espaco-acima-curto" onClick={fechar}>
        <Check size={15} strokeWidth={2.2} /> Registrar fechamento
      </button>
    </div>
  );
}

const ITENS_BAIXA: { item: ItemBaixa; rotulo: string; dica: string }[] = [
  { item: "sisjuri", rotulo: "Baixa das invoices no Sisjuri", dica: "Registre o recebimento das invoices no Sisjuri." },
  { item: "extrato", rotulo: "Extrato do Banco Industrial lançado", dica: "Importe o extrato na conciliação: o crédito do câmbio casa sozinho." },
  { item: "contrato", rotulo: "Contrato de câmbio assinado", dica: "Assinatura na plataforma do Banco Industrial." },
];

function ChecklistBaixa({ ordem, autor }: { ordem: Ordem; autor: string }) {
  const [, navegar] = useLocation();
  return (
    <ul className="checklist">
      {ITENS_BAIXA.map(({ item, rotulo, dica }) => (
        <li key={item} className={ordem.baixa[item] ? "checklist-ok" : ""}>
          <input type="checkbox" checked={Boolean(ordem.baixa[item])} onChange={(e) => marcarBaixa(ordem.id, item, e.target.checked, autor)} aria-label={rotulo} />
          <div>
            <strong>{rotulo}</strong>
            <span>
              {ordem.baixa[item] ? `Feito em ${formatarData(ordem.baixa[item])}.` : dica}{" "}
              {item === "extrato" && !ordem.baixa.extrato ? (
                <button
                  type="button"
                  className="text-button text-button-inicio"
                  onClick={() => {
                    escolher({ contaId: CONTA_BIB_PNST, mes: (ordem.fechamento?.data ?? HOJE).slice(0, 7) });
                    navegar("/contas/conciliacao/conciliar");
                  }}
                >
                  Abrir conciliação do BIB
                </button>
              ) : null}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function ListaInvoices({ ordem, editavel }: { ordem: Ordem; editavel: boolean }) {
  const [numero, setNumero] = useState("");
  const [valor, setValor] = useState("");
  const [tipo, setTipo] = useState<TipoInvoice>("Honorários");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const restante = Math.round((ordem.valor - somaInvoices(ordem)) * 100) / 100;

  function gravar(invoices: Invoice[]) {
    colecaoOrdens.atualizar((lista) => lista.map((item) => (item.id === ordem.id ? { ...item, invoices } : item)));
  }

  async function adicionar() {
    const quantia = parseAmount(valor || (restante > 0 ? restante.toFixed(2).replace(".", ",") : ""));
    if (!numero.trim()) return setErro("Informe o número da invoice do Sisjuri.");
    if (!(quantia > 0)) return setErro("Informe o valor da invoice.");
    let anexoId: string | null = null;
    let nome: string | null = null;
    if (arquivo) {
      try {
        const anexo = await guardarAnexo(arquivo);
        anexoId = anexo.id;
        nome = anexo.nome;
      } catch {
        return setErro("Não foi possível guardar o PDF neste navegador.");
      }
    }
    gravar([...ordem.invoices, { numero: numero.trim(), valor: quantia, tipo, anexoId, arquivo: nome }]);
    setNumero("");
    setValor("");
    setArquivo(null);
    setErro(null);
  }

  async function baixar(invoice: Invoice) {
    if (!invoice.anexoId) return;
    const anexo = await lerAnexo(invoice.anexoId);
    if (anexo) baixarBlob(anexo.blob, anexo.nome);
  }

  async function anexar(invoice: Invoice, evento: ChangeEvent<HTMLInputElement>) {
    const escolhido = evento.target.files?.[0];
    if (!escolhido) return;
    const anexo = await guardarAnexo(escolhido);
    gravar(ordem.invoices.map((item) => (item === invoice ? { ...item, anexoId: anexo.id, arquivo: anexo.nome } : item)));
  }

  return (
    <>
      {ordem.invoices.length === 0 ? (
        <p className="field-hint">Nenhuma invoice ainda.</p>
      ) : (
        <ul className="lista-invoices">
          {ordem.invoices.map((invoice) => (
            <li key={invoice.numero}>
              <FileText size={16} strokeWidth={1.8} aria-hidden="true" />
              <div>
                <strong>Invoice {invoice.numero}</strong>
                <span>
                  {invoice.tipo} · {formatarMoeda(invoice.valor, ordem.moeda)} · {invoice.anexoId ? invoice.arquivo : "sem PDF"}
                </span>
              </div>
              {invoice.anexoId ? (
                <button type="button" className="icon-button icon-button-pequeno" aria-label={`Baixar invoice ${invoice.numero}`} onClick={() => baixar(invoice)}>
                  <Download size={14} strokeWidth={1.9} />
                </button>
              ) : editavel ? (
                <label className="text-button">
                  Anexar PDF
                  <input type="file" accept="application/pdf" className="sr-only" onChange={(e) => anexar(invoice, e)} />
                </label>
              ) : null}
              {editavel ? (
                <button
                  type="button"
                  className="icon-button icon-button-pequeno"
                  aria-label={`Remover invoice ${invoice.numero}`}
                  onClick={() => {
                    if (invoice.anexoId) void apagarAnexo(invoice.anexoId);
                    gravar(ordem.invoices.filter((item) => item !== invoice));
                  }}
                >
                  <Trash2 size={14} strokeWidth={1.9} />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {editavel ? (
        <div className="form-invoice">
          <div className="grade-invoice">
            <label className="field-group">
              <span className="field-label">Nº da invoice</span>
              <input className="field-input" value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="52260" />
            </label>
            <label className="field-group">
              <span className="field-label">Valor ({ordem.moeda})</span>
              <input className="field-input" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder={restante > 0 ? restante.toFixed(2).replace(".", ",") : "0,00"} />
            </label>
            <label className="field-group">
              <span className="field-label">Tipo</span>
              <select className="field-input" value={tipo} onChange={(e) => setTipo(e.target.value as TipoInvoice)}>
                {TIPOS_INVOICE.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="field-group">
            <span className="field-label">PDF da invoice (opcional)</span>
            <input className="field-input" type="file" accept="application/pdf" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
          </label>
          {erro ? <p className="field-error">{erro}</p> : null}
          <button type="button" className="button-secondary espaco-acima-curto" onClick={adicionar}>
            <Plus size={15} strokeWidth={2} /> Adicionar invoice
          </button>
        </div>
      ) : null}
    </>
  );
}
