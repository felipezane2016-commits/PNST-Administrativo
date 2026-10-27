import PortalShell from "@/components/PortalShell";
import ReceiptModal from "@/components/ReceiptModal";
import StatusPill from "@/components/StatusPill";
import { usePortal } from "@/contexts/PortalContext";
import { abrirAnexo } from "@/_core/armazenamento/anexos";
import Painel from "@/admin/componentes/Painel";
import {
  canEditReceipt,
  canRemoveReceipt,
  filterReceipts,
  formatBRL,
  formatDate,
  formatMonth,
  RECEIPT_STATUSES,
  summarizeReceipts,
  type PrototypeReceiptStatus,
  type Receipt,
  type ReceiptDraft,
} from "@/lib/portal";
import {
  AlertCircle,
  Paperclip,
  Plus,
  Search,
  SearchX,
  Send,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import CabecalhoPagina from "@/components/CabecalhoPagina";

/** Filete de cada indicador, na ordem em que aparecem. */
const TONS_KPI = ["laranja", "verde", "ambar", "neutro"];

type StatusFilter = PrototypeReceiptStatus | "Todos";

export default function Receipts() {
  const {
    receipts,
    currentCompetencia,
    createReceipt,
    updateReceipt,
    submitReceipt,
    removeReceipt,
    closingFor,
    prestadorId,
  } = usePortal();
  const [removendo, setRemovendo] = useState<Receipt | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("Todos");
  const [editing, setEditing] = useState<Receipt | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const visible = filterReceipts(receipts, search, status);
  const summary = summarizeReceipts(receipts);

  function openNew() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(receipt: Receipt) {
    setEditing(receipt);
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

  const kpis = [
    {
      label: "Recibos lançados",
      value: String(summary.count),
      detail: "todas as competências",
    },
    {
      label: "Valor bruto",
      value: formatBRL(summary.gross),
      detail: "inclui rejeitados",
    },
    {
      label: "Aprovado",
      value: formatBRL(summary.approvedAmount),
      detail: `${summary.byStatus.Aprovado} recibo(s)`,
    },
    {
      label: "Em rascunho",
      value: formatBRL(summary.draftAmount),
      detail: `${summary.byStatus.Rascunho} a enviar`,
    },
  ];

  const filters: StatusFilter[] = ["Todos", ...RECEIPT_STATUSES];

  return (
    <PortalShell title="Meus recibos">
      <CabecalhoPagina
        rotulo={"Recibos"}
        titulo="Meus recibos"
        descricao={`Competência aberta · ${formatMonth(currentCompetencia)}. Lance, revise e envie cada serviço para conferência.`}
        acoes={
          <button type="button" className="button-primary" onClick={openNew}>
            <Plus size={15} strokeWidth={2.2} /> Lançar recibo
          </button>
        }
      />

      <div className="kpi-grid">
        {kpis.map((kpi, indice) => (
          <div className={`kpi-card kpi-${TONS_KPI[indice] ?? "neutro"}`} key={kpi.label}>
            <span className="kpi-label">{kpi.label}</span>
            <p className="kpi-value">{kpi.value}</p>
            <p className="kpi-detail">{kpi.detail}</p>
          </div>
        ))}
      </div>

      <section className="operations-surface">
        <div className="surface-toolbar">
          <label className="inline-search">
            <Search size={15} strokeWidth={1.9} />
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Buscar por cliente, processo, categoria ou nº"
              aria-label="Buscar recibos"
            />
          </label>
          <div
            className="filter-chips"
            role="group"
            aria-label="Filtrar por status"
          >
            {filters.map(option => {
              const count =
                option === "Todos" ? summary.count : summary.byStatus[option];
              return (
                <button
                  key={option}
                  type="button"
                  className={
                    status === option
                      ? "filter-chip filter-chip-active"
                      : "filter-chip"
                  }
                  aria-pressed={status === option}
                  onClick={() => setStatus(option)}
                >
                  {option}
                  <span className="filter-chip-count" aria-hidden="true">
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {visible.length === 0 ? (
          <div className="empty-state">
            <SearchX size={19} strokeWidth={1.8} />
            <strong>Nenhum recibo encontrado</strong>
            <span>
              {receipts.length === 0
                ? "Lance o primeiro serviço da competência."
                : "Ajuste a busca ou o filtro de status."}
            </span>
            {receipts.length > 0 ? (
              <button
                type="button"
                className="button-secondary"
                onClick={() => {
                  setSearch("");
                  setStatus("Todos");
                }}
              >
                Limpar filtros
              </button>
            ) : null}
          </div>
        ) : (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Recibo</th>
                    <th>Serviço</th>
                    <th>Competência</th>
                    <th>Data</th>
                    <th>Anexo</th>
                    <th>Valor</th>
                    <th>Status</th>
                    <th>
                      <span className="sr-only">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map(receipt => (
                    <tr key={receipt.id}>
                      <td>
                        <span className="cell-code">{receipt.id}</span>
                      </td>
                      <td className="cell-main">
                        <strong>{receipt.client}</strong>
                        <span>
                          {receipt.category} ·{" "}
                          {receipt.caseRef || "sem processo"}
                        </span>
                        {receipt.reviewNote ? (
                          <span className="cell-note">
                            <AlertCircle size={13} strokeWidth={2} />
                            {receipt.reviewNote}
                          </span>
                        ) : null}
                      </td>
                      <td>{formatMonth(receipt.competencia)}</td>
                      <td>{formatDate(receipt.serviceDate)}</td>
                      <td>
                        {receipt.attachmentId ? (
                          <button
                            type="button"
                            className="icon-button icon-button-pequeno"
                            aria-label={`Abrir anexo de ${receipt.id}: ${receipt.attachmentName ?? ""}`}
                            title={receipt.attachmentName ?? "Abrir anexo"}
                            onClick={() => void abrirAnexo(receipt.attachmentId!, receipt.attachmentName ?? receipt.id)}
                          >
                            <Paperclip size={14} strokeWidth={1.9} />
                          </button>
                        ) : receipt.attachmentName ? (
                          <Paperclip
                            size={14}
                            strokeWidth={1.9}
                            aria-label={`Anexo: ${receipt.attachmentName}`}
                          />
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="money">{formatBRL(receipt.amount)}</td>
                      <td>
                        <StatusPill status={receipt.status} />
                      </td>
                      <td>
                        <div className="cell-actions">
                          {canEditReceipt(receipt, closingFor(receipt.competencia)) ? (
                            <button
                              type="button"
                              className="text-button"
                              onClick={() => openEdit(receipt)}
                            >
                              Editar
                            </button>
                          ) : null}
                          {receipt.status === "Rascunho" ||
                          receipt.status === "Rejeitado" ? (
                            <button
                              type="button"
                              className="icon-button"
                              aria-label={`Enviar ${receipt.id} para conferência`}
                              title="Enviar para conferência"
                              onClick={() => submitReceipt(receipt.id)}
                            >
                              <Send size={15} strokeWidth={1.9} />
                            </button>
                          ) : null}
                          {canRemoveReceipt(receipt, closingFor(receipt.competencia)) ? (
                            <button
                              type="button"
                              className="icon-button icon-button-danger"
                              aria-label={`Excluir ${receipt.id}`}
                              title="Excluir recibo"
                              onClick={() => setRemovendo(receipt)}
                            >
                              <Trash2 size={15} strokeWidth={1.9} />
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="surface-footnote">
              <span>
                {visible.length} de {receipts.length} recibo(s)
              </span>
              <span>Recibos aprovados, ou de um mês já conferido pelo escritório, não podem mais ser editados nem excluídos</span>
            </div>
          </>
        )}
      </section>

      {modalOpen ? (
        <ReceiptModal
          receipt={editing}
          competencia={currentCompetencia}
          prestadorId={prestadorId}
          onClose={closeModal}
          onSave={handleSave}
        />
      ) : null}
      {removendo ? (
        <Painel
          rotulo="Excluir recibo"
          titulo={`Excluir o recibo ${removendo.id}?`}
          aoFechar={() => setRemovendo(null)}
          aoEnviar={() => {
            removeReceipt(removendo.id);
            setRemovendo(null);
          }}
          textoEnviar="Excluir recibo"
        >
          <p>
            <strong>{removendo.client}</strong> — {formatBRL(removendo.amount)}, serviço em {formatDate(removendo.serviceDate)}.
          </p>
          <p className="texto-perigo">
            {removendo.status === "Enviado"
              ? "O recibo já foi enviado: ele sai também da conferência do escritório. "
              : ""}
            O arquivo anexado é apagado junto. Não dá para desfazer.
          </p>
        </Painel>
      ) : null}
    </PortalShell>
  );
}
