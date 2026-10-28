import PortalShell from "@/components/PortalShell";
import ReceiptModal from "@/components/ReceiptModal";
import StatusPill from "@/components/StatusPill";
import { usePortal } from "@/contexts/PortalContext";
import { abrirReciboEmPdf } from "@/lib/reciboPdf";
import Painel from "@/admin/componentes/Painel";
import {
  anexosDoRecibo,
  filterReceipts,
  formatBRL,
  formatDate,
  formatMonthTitle,
  listCompetencias,
  RECEIPT_CATEGORIES,
  RECEIPT_STATUSES,
  receiptSendAction,
  type PrototypeReceiptStatus,
  type Receipt,
  type ReceiptDraft,
} from "@/lib/portal";
import { AlertCircle, FileDown, Paperclip, Pencil, Plus, Search, SearchX, Send, Trash2 } from "lucide-react";
import { useState } from "react";
import CabecalhoPagina from "@/components/CabecalhoPagina";

/** Meus recibos: busca, filtros (status, categoria, mês) e as ações de cada recibo. */
export default function Receipts() {
  const { receipts, currentCompetencia, createReceipt, updateReceipt, setReceiptStatus, removeReceipt, prestadorId, provider } = usePortal();
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState<PrototypeReceiptStatus | "">("");
  const [categoria, setCategoria] = useState("");
  const [mes, setMes] = useState("");
  const [editing, setEditing] = useState<Receipt | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [removendo, setRemovendo] = useState<Receipt | null>(null);
  const [enviando, setEnviando] = useState<Receipt | null>(null);

  const visible = filterReceipts(receipts, { busca, status, categoria, competencia: mes });
  const categorias = Array.from(new Set([...RECEIPT_CATEGORIES, ...receipts.map((recibo) => recibo.category)]));
  const filtrando = Boolean(busca || status || categoria || mes);

  function openNew() {
    setEditing(null);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
  }

  function handleSave(draft: ReceiptDraft) {
    if (editing) updateReceipt(editing.id, draft);
    else createReceipt(draft);
    closeModal();
  }

  const acaoEnvio = enviando ? receiptSendAction(enviando) : null;

  return (
    <PortalShell title="Meus recibos">
      <CabecalhoPagina
        rotulo="Recibos"
        titulo="Meus recibos"
        descricao="Gerencie seus recibos de serviço. Eles vão para o escritório no envio do fechamento do mês."
        acoes={
          <button type="button" className="button-primary" onClick={openNew}>
            <Plus size={15} strokeWidth={2.2} /> Novo recibo
          </button>
        }
      />

      <section className="operations-surface">
        <div className="surface-toolbar surface-toolbar-filtros">
          <label className="inline-search">
            <Search size={15} strokeWidth={1.9} />
            <input value={busca} onChange={(event) => setBusca(event.target.value)} placeholder="Buscar recibo..." aria-label="Buscar recibos" />
          </label>
          <div className="inline-row">
            <select className="field-input field-input-compacto" value={status} onChange={(event) => setStatus(event.target.value as PrototypeReceiptStatus | "")} aria-label="Status">
              <option value="">Todos os status</option>
              {RECEIPT_STATUSES.map((opcao) => (
                <option key={opcao} value={opcao}>
                  {opcao}
                </option>
              ))}
            </select>
            <select className="field-input field-input-compacto" value={categoria} onChange={(event) => setCategoria(event.target.value)} aria-label="Categoria">
              <option value="">Todas as categorias</option>
              {categorias.map((opcao) => (
                <option key={opcao} value={opcao}>
                  {opcao}
                </option>
              ))}
            </select>
            <select className="field-input field-input-compacto" value={mes} onChange={(event) => setMes(event.target.value)} aria-label="Mês">
              <option value="">Todos os meses</option>
              {listCompetencias(receipts).map((opcao) => (
                <option key={opcao} value={opcao}>
                  {formatMonthTitle(opcao)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="section-header">
          <div>
            <span className="eyebrow">Recibos</span>
          </div>
          <span className="field-hint">{visible.length} registro(s)</span>
        </div>

        {visible.length === 0 ? (
          <div className="empty-state">
            <SearchX size={19} strokeWidth={1.8} />
            <strong>Nenhum recibo encontrado</strong>
            <span>{receipts.length === 0 ? "Clique em Novo recibo para adicionar." : "Ajuste a busca ou os filtros."}</span>
            {filtrando ? (
              <button
                type="button"
                className="button-secondary"
                onClick={() => {
                  setBusca("");
                  setStatus("");
                  setCategoria("");
                  setMes("");
                }}
              >
                Limpar filtros
              </button>
            ) : null}
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Cliente</th>
                  <th>Categoria</th>
                  <th>Descrição</th>
                  <th>Valor</th>
                  <th>Status</th>
                  <th>Anexos</th>
                  <th>
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((receipt) => {
                  const anexos = anexosDoRecibo(receipt);
                  const envio = receiptSendAction(receipt);
                  return (
                    <tr key={receipt.id}>
                      <td>{formatDate(receipt.serviceDate)}</td>
                      <td className="cell-main">
                        <strong>{receipt.client || "—"}</strong>
                        <span className="cell-code">{receipt.id}</span>
                        {receipt.reviewNote && (receipt.status === "Ajuste solicitado" || receipt.status === "Rejeitado") ? (
                          <span className="cell-note">
                            <AlertCircle size={13} strokeWidth={2} />
                            {receipt.reviewNote}
                          </span>
                        ) : null}
                      </td>
                      <td>{receipt.category || "—"}</td>
                      <td className="cell-truncar" title={receipt.description}>
                        {receipt.description || "—"}
                      </td>
                      <td className="money">{formatBRL(receipt.amount)}</td>
                      <td>
                        <StatusPill status={receipt.status} />
                      </td>
                      <td>
                        {anexos.length ? (
                          <span className="anexo-contagem" title={anexos.map((arquivo) => arquivo.nome).join(", ")}>
                            <Paperclip size={12} strokeWidth={2} /> {anexos.length}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        <div className="cell-actions">
                          <button
                            type="button"
                            className="icon-button icon-button-pequeno"
                            aria-label={`Editar ${receipt.id}`}
                            title="Editar"
                            onClick={() => {
                              setEditing(receipt);
                              setModalOpen(true);
                            }}
                          >
                            <Pencil size={14} strokeWidth={1.9} />
                          </button>
                          {envio ? (
                            <button
                              type="button"
                              className="icon-button icon-button-pequeno icon-button-primario"
                              aria-label={`${envio.rotulo}: ${receipt.id}`}
                              title={envio.rotulo}
                              onClick={() => setEnviando(receipt)}
                            >
                              <Send size={14} strokeWidth={1.9} />
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="icon-button icon-button-pequeno"
                            aria-label={`Abrir ${receipt.id} em PDF`}
                            title="Recibo em PDF (com os documentos)"
                            onClick={() => void abrirReciboEmPdf(receipt, provider.name)}
                          >
                            <FileDown size={14} strokeWidth={1.9} />
                          </button>
                          <button
                            type="button"
                            className="icon-button icon-button-pequeno icon-button-danger"
                            aria-label={`Excluir ${receipt.id}`}
                            title="Excluir"
                            onClick={() => setRemovendo(receipt)}
                          >
                            <Trash2 size={14} strokeWidth={1.9} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {modalOpen ? (
        <ReceiptModal receipt={editing} competencia={currentCompetencia} prestadorId={prestadorId} onClose={closeModal} onSave={handleSave} />
      ) : null}
      {removendo ? (
        <Painel
          rotulo="Excluir recibo"
          titulo="Excluir este recibo?"
          aoFechar={() => setRemovendo(null)}
          aoEnviar={() => {
            removeReceipt(removendo.id);
            setRemovendo(null);
          }}
          textoEnviar="Excluir"
        >
          <p>
            <strong>{removendo.client}</strong> — {formatBRL(removendo.amount)}, serviço em {formatDate(removendo.serviceDate)} ({removendo.status}).
          </p>
          <p className="texto-perigo">Os documentos anexados são apagados junto. Não dá para desfazer.</p>
        </Painel>
      ) : null}
      {enviando && acaoEnvio ? (
        <Painel
          rotulo="Recibo"
          titulo={acaoEnvio.status === "Pendente de envio" ? "Marcar este recibo como \"Pendente de envio\"?" : "Reenviar este recibo para conferência?"}
          aoFechar={() => setEnviando(null)}
          aoEnviar={() => {
            setReceiptStatus(enviando.id, acaoEnvio.status);
            setEnviando(null);
          }}
          textoEnviar={acaoEnvio.status === "Pendente de envio" ? "Marcar como pronto" : "Reenviar"}
        >
          <p>
            <strong>{enviando.client}</strong> — {formatBRL(enviando.amount)}.
          </p>
          <p>
            {acaoEnvio.status === "Pendente de envio"
              ? "O recibo fica pronto e segue para o escritório no envio do fechamento do mês."
              : "O recibo volta para a conferência do escritório com as correções."}
          </p>
        </Painel>
      ) : null}
    </PortalShell>
  );
}
