import { abrirAnexo, guardarAnexo, pastaDoPrestador } from "@/_core/armazenamento/anexos";
import PortalShell from "@/components/PortalShell";
import StatusPill from "@/components/StatusPill";
import { usePortal } from "@/contexts/PortalContext";
import {
  calculateClosingProgress,
  canSubmitClosing,
  closingSteps,
  CLOSING_STEPS,
  closingTotal,
  formatBRL,
  formatDate,
  formatMonth,
  listCompetencias,
  receiptsIncludedInClosing,
  receiptsOfCompetencia,
} from "@/lib/portal";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  FileText,
  Send,
  Upload,
} from "lucide-react";
import { useState, type ChangeEvent } from "react";
import CabecalhoPagina from "@/components/CabecalhoPagina";

export default function Closing() {
  const {
    receipts,
    currentCompetencia,
    closingFor,
    attachClosingDocument,
    submitClosing,
    prestadorId,
  } = usePortal();
  const competencias = listCompetencias(receipts);
  const [competencia, setCompetencia] = useState(
    competencias.includes(currentCompetencia)
      ? currentCompetencia
      : (competencias[0] ?? currentCompetencia)
  );

  const monthReceipts = receiptsOfCompetencia(receipts, competencia);
  const closing = closingFor(competencia);
  const statuses = monthReceipts.map(receipt => receipt.status);
  const hasDocument = Boolean(closing.documentName);
  const progress = calculateClosingProgress(
    statuses,
    hasDocument,
    closing.submitted
  );
  const steps = closingSteps(statuses, hasDocument, closing.submitted);
  const included = receiptsIncludedInClosing(statuses);
  const total = closingTotal(monthReceipts);
  const rejected = monthReceipts.filter(
    receipt => receipt.status === "Rejeitado"
  );
  const canSubmit = canSubmitClosing(
    monthReceipts,
    hasDocument,
    closing.submitted
  );

  const [enviando, setEnviando] = useState(false);
  const [erroArquivo, setErroArquivo] = useState<string | null>(null);

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const arquivo = event.target.files?.[0];
    event.target.value = "";
    if (!arquivo) return;
    if (arquivo.size > 20 * 1024 * 1024) return setErroArquivo("Arquivo maior que 20 MB. Envie uma versão menor.");
    setErroArquivo(null);
    setEnviando(true);
    try {
      const anexo = await guardarAnexo(arquivo, pastaDoPrestador(prestadorId, competencia));
      attachClosingDocument(competencia, anexo.nome, anexo.id);
    } catch {
      setErroArquivo("Não foi possível enviar o arquivo. Verifique a conexão e tente de novo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <PortalShell title="Fechamento mensal">
      <CabecalhoPagina
        rotulo={"Fechamento"}
        titulo="Fechamento mensal"
        descricao="Consolide os recibos da competência, anexe o documento de faturamento e envie ao escritório."
        acoes={
          <select
            id="competencia"
            className="field-input field-input-compacto"
            aria-label="Competência"
            value={competencia}
            onChange={event => setCompetencia(event.target.value)}
          >
            {competencias.map(option => (
              <option key={option} value={option}>
                {formatMonth(option)}
              </option>
            ))}
          </select>
        }
      />

      <div
        className={closing.submitted ? "risk-card risk-card-ok" : "risk-card"}
        data-estado={closing.submitted ? "enviado" : "aberto"}
        role="status"
      >
        <span className="risk-icon">
          {closing.submitted ? (
            <CheckCircle2 size={16} strokeWidth={2} />
          ) : (
            <AlertTriangle size={16} strokeWidth={2} />
          )}
        </span>
        <div className="risk-card-head">
          <strong>
            {closing.submitted
              ? `Fechamento enviado${closing.submittedAt ? ` em ${formatDate(closing.submittedAt.slice(0, 10))}` : ""}`
              : "Fechamento em aberto"}
          </strong>
          <p>
            {closing.submitted
              ? closing.review === "Pago"
                ? "Pagamento registrado pelo escritório. Nada mais a fazer nesta competência."
                : closing.review === "Conferido"
                  ? "Conferência concluída pelo escritório. O pagamento é o próximo passo."
                  : "Aguarde a conferência final. Você será avisada se algum recibo precisar de ajuste."
              : `${included} de ${monthReceipts.length} recibos entram no fechamento.${
                  rejected.length === 1
                    ? " O rejeitado fica de fora até ser corrigido."
                    : rejected.length > 1
                      ? ` Os ${rejected.length} rejeitados ficam de fora até serem corrigidos.`
                      : ""
                }`}
          </p>
        </div>
        <span
          className={`status-pill ${
            !closing.submitted
              ? "status-amber"
              : closing.review === "Pago"
                ? "status-green"
                : "status-blue"
          }`}
        >
          <span className="status-dot" aria-hidden="true" />
          {closing.submitted ? (closing.review ?? "Enviado") : "Em aberto"}
        </span>
      </div>

      <div className="grid-main">
        <section className="operations-surface">
          <div className="section-header">
            <div>
              <span className="eyebrow">Recibos</span>
              <h3>{formatMonth(competencia)}</h3>
              <p>Rejeitados ficam listados, mas não entram na soma.</p>
            </div>
          </div>

          {monthReceipts.length === 0 ? (
            <div className="empty-state">
              <FileText size={19} strokeWidth={1.8} />
              <strong>Nenhum recibo nesta competência</strong>
              <span>Lance os serviços prestados para montar o fechamento.</span>
            </div>
          ) : (
            <>
              <div className="ged-list">
                {monthReceipts.map(receipt => (
                  <div className="ged-line" key={receipt.id}>
                    <span className="doc-icon" aria-hidden="true">
                      <FileText size={16} strokeWidth={1.9} />
                    </span>
                    <div className="ged-line-copy">
                      <strong>
                        {receipt.client} · {receipt.category}
                      </strong>
                      <span>
                        {receipt.id} · {formatDate(receipt.serviceDate)}
                      </span>
                    </div>
                    <div className="ged-line-meta">
                      <span className="money">{formatBRL(receipt.amount)}</span>
                      <StatusPill status={receipt.status} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="total-line">
                <span>{included} recibo(s) no fechamento</span>
                <strong>{formatBRL(total)}</strong>
              </div>
            </>
          )}
        </section>

        <section className="operations-surface">
          <div className="section-header">
            <div>
              <span className="eyebrow">Envio</span>
              <h3>Documento de faturamento</h3>
              <p>Nota fiscal ou recibo consolidado da competência.</p>
            </div>
          </div>

          <label
            className={
              hasDocument ? "upload-zone upload-zone-filled" : "upload-zone"
            }
          >
            <input
              type="file"
              accept="application/pdf,image/*"
              onChange={handleUpload}
              disabled={closing.submitted || enviando}
              aria-label="Documento de faturamento"
            />
            {hasDocument ? (
              <CheckCircle2 size={19} strokeWidth={1.9} />
            ) : (
              <Upload size={19} strokeWidth={1.9} />
            )}
            <strong>{enviando ? "Enviando arquivo…" : (closing.documentName ?? "Selecionar arquivo")}</strong>
            <span>
              {hasDocument
                ? closing.submitted
                  ? "Enviado"
                  : "Clique para trocar"
                : "PDF ou imagem até 10 MB"}
            </span>
          </label>
          {closing.documentId ? (
            <button type="button" className="text-button" onClick={() => void abrirAnexo(closing.documentId!, closing.documentName ?? "documento")}>
              <FileText size={14} strokeWidth={2} /> Ver documento anexado (PDF)
            </button>
          ) : null}
          {erroArquivo ? (
            <p className="field-error" role="alert">
              {erroArquivo}
            </p>
          ) : null}
          <p className="field-hint">
            O valor do documento deve bater com {formatBRL(total)}.
          </p>

          <div className="progress-meter espaco-acima">
            <div
              className="progress-track"
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Progresso do fechamento"
            >
              <span style={{ width: `${progress}%` }} />
            </div>
            <span className="progress-value">{progress}%</span>
          </div>
          <ol className="next-step-list">
            {CLOSING_STEPS.map((label, index) => (
              <li
                className={
                  steps[index] ? "next-step next-step-done" : "next-step"
                }
                key={label}
              >
                <span className="step-number">
                  {steps[index] ? (
                    <Check size={13} strokeWidth={2.4} />
                  ) : (
                    index + 1
                  )}
                </span>
                <span className="next-step-copy">
                  <strong>{label}</strong>
                </span>
              </li>
            ))}
          </ol>

          <button
            type="button"
            className="button-primary button-block espaco-acima"
            disabled={!canSubmit}
            onClick={() => submitClosing(competencia)}
          >
            <Send size={15} strokeWidth={2} />{" "}
            {closing.submitted
              ? "Fechamento enviado"
              : "Enviar para conferência"}
          </button>
          <p
            className="field-hint field-hint-centro"
          >
            {closing.submitted
              ? "Este fechamento já foi enviado ao escritório."
              : canSubmit
                ? "Os rascunhos da competência seguem junto."
                : "Anexe o documento e tenha ao menos um recibo válido."}
          </p>
        </section>
      </div>
    </PortalShell>
  );
}
