import { abrirAnexo } from "@/_core/armazenamento/anexos";
import { formatarData, formatarDataHora } from "@/_core/tempo";
import Painel from "@/admin/componentes/Painel";
import StatusPill from "@/components/StatusPill";
import { anexosDoRecibo, formatBRL, type ArquivoAnexo, type Closing, type Receipt } from "@/lib/portal";
import { abrirLoteEmPdf, abrirNota, abrirReciboEmPdf, type Idioma } from "@/lib/reciboPdf";
import { AlertCircle, FileDown, FileText, Languages, Paperclip, Pencil, Receipt as IconeRecibo, Trash2 } from "lucide-react";
import { useState } from "react";

/**
 * Peças da conferência e do histórico: o cartão de cada recibo (como na
 * referência: dados, documentos enviados, Recibo PDF e Nota / Unificar), os
 * botões de PDF e a confirmação de exclusão.
 */

/** O recibo como o prestador lançou, em lista de campos (gaveta do histórico). */
export function DetalhesRecibo({ recibo }: { recibo: Receipt }) {
  return (
    <dl className="data-list data-list-recibo">
      <div>
        <dt>Cliente</dt>
        <dd>{recibo.client || "—"}</dd>
      </div>
      <div>
        <dt>Categoria</dt>
        <dd>{recibo.category}</dd>
      </div>
      <div>
        <dt>Data do serviço</dt>
        <dd>{formatarData(recibo.serviceDate)}</dd>
      </div>
      <div>
        <dt>Valor</dt>
        <dd className="money">{formatBRL(recibo.amount)}</dd>
      </div>
      <div>
        <dt>Caso / Projeto</dt>
        <dd>{recibo.caseRef || "—"}</dd>
      </div>
      <div>
        <dt>Solicitante</dt>
        <dd>{recibo.requester || "—"}</dd>
      </div>
      <div className="data-list-cheio">
        <dt>Descrição</dt>
        <dd>{recibo.description || "—"}</dd>
      </div>
      <div className="data-list-cheio">
        <dt>Documentos enviados</dt>
        <dd>
          <ListaDocumentos arquivos={anexosDoRecibo(recibo)} />
        </dd>
      </div>
      <div className="data-list-cheio">
        <dt>Lançado em</dt>
        <dd>{formatarDataHora(recibo.createdAt)}</dd>
      </div>
    </dl>
  );
}

/** Documentos como botões que abrem em PDF (Word e Excel são baixados como estão). */
export function ListaDocumentos({ arquivos, vazio = "Nenhum documento enviado" }: { arquivos: ArquivoAnexo[]; vazio?: string }) {
  if (!arquivos.length)
    return (
      <span className="texto-apoio">
        <AlertCircle size={13} strokeWidth={2} /> {vazio}
      </span>
    );
  return (
    <span className="documentos-lista">
      {arquivos.map((arquivo, indice) => (
        <BotaoAnexo key={`${arquivo.id ?? arquivo.nome}-${indice}`} id={arquivo.id} nome={arquivo.nome} rotulo={arquivo.nome} />
      ))}
    </span>
  );
}

/** Abre o arquivo; recibos antigos (só com o nome) dizem que o arquivo não foi guardado. */
export function BotaoAnexo({ id, nome, rotulo = "Abrir em PDF" }: { id: string | null; nome: string | null; rotulo?: string }) {
  const [falhou, setFalhou] = useState(false);
  if (!nome && !id) return <span className="texto-apoio">Nenhum arquivo anexado</span>;
  if (!id)
    return (
      <span className="documento-botao documento-botao-sem-arquivo" title="Enviado antes desta versão do portal: peça ao prestador para anexar de novo.">
        <Paperclip size={13} strokeWidth={2} /> {nome} — arquivo não guardado
      </span>
    );
  return (
    <span className="inline-row">
      <button
        type="button"
        className="documento-botao"
        onClick={async () => setFalhou(!(await abrirAnexo(id, nome ?? "anexo")))}
        aria-label={`Abrir ${nome ?? "documento"}`}
        title="Abrir em PDF"
      >
        <Paperclip size={13} strokeWidth={2} /> {rotulo}
      </button>
      {falhou ? <span className="field-error">Não foi possível abrir o arquivo.</span> : null}
    </span>
  );
}

/** Botão que gera um PDF e mostra "Gerando PDF..." enquanto isso. */
function BotaoPdf({ rotulo, descricao, icone = FileDown, gerar, classe = "button-secondary button-compacto" }: { rotulo: string; descricao: string; icone?: typeof FileDown; gerar: () => Promise<boolean>; classe?: string }) {
  const [gerando, setGerando] = useState(false);
  const [falhou, setFalhou] = useState(false);
  const Icone = icone;
  return (
    <span className="inline-row">
      <button
        type="button"
        className={classe}
        disabled={gerando}
        aria-label={descricao}
        onClick={async () => {
          setGerando(true);
          setFalhou(!(await gerar()));
          setGerando(false);
        }}
      >
        <Icone size={13} strokeWidth={2} /> {gerando ? "Gerando PDF..." : rotulo}
      </button>
      {falhou ? <span className="field-error">Não foi possível gerar o PDF.</span> : null}
    </span>
  );
}

/** Recibo de despesa em PDF, com os documentos anexados em seguida. */
export function BotaoReciboPdf({ recibo, nomePrestador, rotulo = "Recibo PDF" }: { recibo: Receipt; nomePrestador: string; rotulo?: string }) {
  return <BotaoPdf rotulo={rotulo} descricao={`${rotulo}: ${recibo.id}`} icone={IconeRecibo} gerar={() => abrirReciboEmPdf(recibo, nomePrestador)} classe="button-secondary button-compacto botao-laranja" />;
}

/** O mês do prestador num PDF só: resumo, recibos com documentos e a NF do fechamento. */
export function BotaoLotePdf({ recibos, nomePrestador, competencia, fechamento }: { recibos: Receipt[]; nomePrestador: string; competencia: string; fechamento: Closing | null }) {
  return <BotaoPdf rotulo="Documento único (PDF)" descricao="Documento único do mês em PDF" gerar={() => abrirLoteEmPdf(recibos, nomePrestador, competencia, fechamento)} />;
}

/** Nota de despesas: português ou inglês, sozinha ou unificada com o recibo. */
export function EscolherNota({ recibo, nomePrestador, aoFechar }: { recibo: Receipt; nomePrestador: string; aoFechar: () => void }) {
  const [gerando, setGerando] = useState<string | null>(null);
  async function gerar(idioma: Idioma, unificar: boolean) {
    setGerando(`${idioma}-${unificar}`);
    await abrirNota(recibo, nomePrestador, idioma, unificar);
    setGerando(null);
    aoFechar();
  }
  const botao = (idioma: Idioma, unificar: boolean, rotulo: string, primario = false) => (
    <button
      type="button"
      className={primario ? "button-primary" : "button-secondary"}
      disabled={Boolean(gerando)}
      onClick={() => void gerar(idioma, unificar)}
    >
      {gerando === `${idioma}-${unificar}` ? "Gerando..." : rotulo}
    </button>
  );
  return (
    <Painel rotulo={`Recibo ${recibo.id}`} titulo="Idioma da Nota de Despesas" descricao="Escolha o idioma para geração:" aoFechar={aoFechar}>
      <div className="escolha-nota">
        {botao("pt", false, "Português", true)}
        {botao("en", false, "English")}
      </div>
      <p className="field-label espaco-acima">Ou gerar unificado (Recibo + Nota):</p>
      <div className="escolha-nota">
        {botao("pt", true, "PT Unificado")}
        {botao("en", true, "EN Unificado")}
      </div>
      <p className="field-hint espaco-acima">Em inglês, os rótulos e o status são traduzidos; a descrição e o solicitante saem como o prestador escreveu.</p>
    </Painel>
  );
}

/** O cartão do recibo na conferência (como na referência). */
export function CartaoRecibo({
  recibo,
  nomePrestador,
  podeEditar,
  podeExcluir,
  aoEditar,
  aoExcluir,
}: {
  recibo: Receipt;
  nomePrestador: string;
  podeEditar: boolean;
  podeExcluir: boolean;
  aoEditar: (recibo: Receipt) => void;
  aoExcluir: (recibo: Receipt) => void;
}) {
  const [nota, setNota] = useState(false);
  return (
    <article className="recibo-cartao" aria-label={`Recibo ${recibo.id}`}>
      <header className="recibo-cartao-topo">
        <span className="doc-icon" aria-hidden="true">
          <FileText size={16} strokeWidth={1.9} />
        </span>
        <div className="recibo-cartao-titulo">
          <strong>
            {recibo.client || "—"} {recibo.caseRef ? <span className="texto-apoio">· {recibo.caseRef}</span> : null}
          </strong>
          <span>
            {formatarData(recibo.serviceDate)} · {recibo.category || "—"} · {recibo.id}
          </span>
        </div>
        <div className="recibo-cartao-valor">
          <strong className="money">{formatBRL(recibo.amount)}</strong>
          <StatusPill status={recibo.status} />
        </div>
      </header>
      <div className="recibo-cartao-corpo">
        <p>{recibo.description || "—"}</p>
        {recibo.requester ? <p className="texto-apoio">Solicitante: {recibo.requester}</p> : null}
        {recibo.reviewNote && (recibo.status === "Ajuste solicitado" || recibo.status === "Rejeitado") ? (
          <p className="cell-note">
            <AlertCircle size={13} strokeWidth={2} /> {recibo.reviewNote}
          </p>
        ) : null}
        <div className="recibo-cartao-docs">
          <span className="eyebrow">Documentos enviados</span>
          <ListaDocumentos arquivos={anexosDoRecibo(recibo)} />
        </div>
        <div className="recibo-cartao-acoes">
          <BotaoReciboPdf recibo={recibo} nomePrestador={nomePrestador} />
          <button type="button" className="button-secondary button-compacto" onClick={() => setNota(true)} aria-label={`Nota / Unificar: ${recibo.id}`}>
            <Languages size={13} strokeWidth={2} /> Nota / Unificar
          </button>
          <span className="recibo-cartao-acoes-fim">
            {podeEditar ? (
              <button type="button" className="text-button text-button-neutro" onClick={() => aoEditar(recibo)} aria-label={`Editar ${recibo.id}`}>
                <Pencil size={13} strokeWidth={2} /> Editar
              </button>
            ) : null}
            {podeExcluir ? (
              <button type="button" className="text-button text-button-perigo" onClick={() => aoExcluir(recibo)} aria-label={`Excluir ${recibo.id}`}>
                <Trash2 size={13} strokeWidth={2} /> Excluir
              </button>
            ) : null}
          </span>
        </div>
      </div>
      {nota ? <EscolherNota recibo={recibo} nomePrestador={nomePrestador} aoFechar={() => setNota(false)} /> : null}
    </article>
  );
}

export function ConfirmarExclusaoRecibo({ recibo, nomePrestador, aoFechar, aoConfirmar }: { recibo: Receipt; nomePrestador: string; aoFechar: () => void; aoConfirmar: () => void }) {
  return (
    <Painel rotulo="Excluir recibo" titulo={`Excluir o recibo ${recibo.id}?`} aoFechar={aoFechar} aoEnviar={aoConfirmar} textoEnviar="Excluir recibo">
      <p>
        <strong>{nomePrestador}</strong> · {recibo.client} — {formatBRL(recibo.amount)}, serviço em {formatarData(recibo.serviceDate)}.
      </p>
      <p className="texto-perigo">O recibo sai da conferência e do portal do prestador, com os documentos anexados. Não dá para desfazer.</p>
    </Painel>
  );
}
