import { abrirAnexo } from "@/_core/armazenamento/anexos";
import { formatarData, formatarDataHora } from "@/_core/tempo";
import Painel from "@/admin/componentes/Painel";
import { formatBRL, lotClosed, type Closing, type Receipt } from "@/lib/portal";
import { Paperclip, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";

/**
 * O recibo como o prestador lançou: todos os campos e o comprovante anexado,
 * que abre numa aba nova. Usado na conferência e no histórico.
 */
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
        <dt>Processo / caso</dt>
        <dd>{recibo.caseRef || "—"}</dd>
      </div>
      <div>
        <dt>Quem pediu</dt>
        <dd>{recibo.requester || "—"}</dd>
      </div>
      <div className="data-list-cheio">
        <dt>Descrição do serviço</dt>
        <dd>{recibo.description || "—"}</dd>
      </div>
      <div className="data-list-cheio">
        <dt>Comprovante</dt>
        <dd>
          <BotaoAnexo id={recibo.attachmentId ?? null} nome={recibo.attachmentName} />
        </dd>
      </div>
      <div className="data-list-cheio">
        <dt>Lançado em</dt>
        <dd>{formatarDataHora(recibo.createdAt)}</dd>
      </div>
    </dl>
  );
}

/** Abre o arquivo; recibos antigos (só com o nome) dizem que o arquivo não foi guardado. */
export function BotaoAnexo({ id, nome, rotulo = "Abrir comprovante" }: { id: string | null; nome: string | null; rotulo?: string }) {
  const [falhou, setFalhou] = useState(false);
  if (!nome && !id) return <span className="texto-apoio">Nenhum arquivo anexado</span>;
  if (!id)
    return (
      <span className="texto-apoio">
        {nome} — arquivo não guardado (enviado antes desta versão do portal; peça ao prestador para anexar de novo).
      </span>
    );
  return (
    <span className="inline-row">
      <button
        type="button"
        className="button-secondary button-compacto"
        onClick={async () => setFalhou(!(await abrirAnexo(id, nome ?? "anexo")))}
        aria-label={`${rotulo}: ${nome ?? ""}`}
      >
        <Paperclip size={13} strokeWidth={2} /> {rotulo}
      </button>
      <span className="texto-apoio">{nome}</span>
      {falhou ? <span className="field-error">Não foi possível abrir o arquivo.</span> : null}
    </span>
  );
}

/** Por que o recibo não pode mais mudar (ou null quando pode). */
export function bloqueioDoRecibo(recibo: Receipt, fechamento: Closing | null | undefined) {
  if (recibo.status === "Aprovado") return "Recibo aprovado: não muda mais.";
  if (lotClosed(fechamento)) return `Mês já ${fechamento?.review === "Pago" ? "pago" : "conferido"}: não muda mais.`;
  return null;
}

/** Editar / excluir, com o motivo quando não pode. */
export function AcoesRecibo({
  recibo,
  podeEditar,
  podeExcluir,
  bloqueio,
  aoEditar,
  aoExcluir,
}: {
  recibo: Receipt;
  podeEditar: boolean;
  podeExcluir: boolean;
  /** Por que não dá para mexer (aprovado, lote conferido...). */
  bloqueio: string | null;
  aoEditar: (recibo: Receipt) => void;
  aoExcluir: (recibo: Receipt) => void;
}) {
  if (!podeEditar && !podeExcluir) return null;
  if (bloqueio) return <span className="texto-apoio">{bloqueio}</span>;
  return (
    <span className="inline-row">
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
  );
}

export function ConfirmarExclusaoRecibo({ recibo, nomePrestador, aoFechar, aoConfirmar }: { recibo: Receipt; nomePrestador: string; aoFechar: () => void; aoConfirmar: () => void }) {
  return (
    <Painel rotulo="Excluir recibo" titulo={`Excluir o recibo ${recibo.id}?`} aoFechar={aoFechar} aoEnviar={aoConfirmar} textoEnviar="Excluir recibo">
      <p>
        <strong>{nomePrestador}</strong> · {recibo.client} — {formatBRL(recibo.amount)}, serviço em {formatarData(recibo.serviceDate)}.
      </p>
      <p className="texto-perigo">O recibo sai da conferência e do portal do prestador, com o arquivo anexado. Não dá para desfazer.</p>
    </Painel>
  );
}

