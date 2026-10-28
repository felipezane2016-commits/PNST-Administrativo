import PortalShell from "@/components/PortalShell";
import ReceiptModal from "@/components/ReceiptModal";
import StatusPill from "@/components/StatusPill";
import { usePortal } from "@/contexts/PortalContext";
import { formatBRL, portalKpis, statusDistribution, type Receipt } from "@/lib/portal";
import { AlertTriangle, ArrowRight, Plus, Receipt as ReceiptIcon } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import CabecalhoPagina from "@/components/CabecalhoPagina";

/** Painel do prestador: resumo dos recibos e receitas, como na referência. */
export default function Dashboard() {
  const { receipts, currentCompetencia, provider, prestadorId, updateReceipt, createReceipt } = usePortal();
  const [, navigate] = useLocation();
  const [editing, setEditing] = useState<Receipt | null>(null);
  const [novo, setNovo] = useState(false);

  const k = portalKpis(receipts, currentCompetencia);
  const distribuicao = statusDistribution(receipts);
  const recentes = [...receipts].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);
  const firstName = provider.name.split(" ")[0];

  const kpis: { label: string; value: string; detail: string; alerta?: boolean }[] = [
    { label: "Recibos do mês", value: String(k.recibosDoMes), detail: "serviços" },
    { label: "Receita do mês", value: formatBRL(k.receitaMes), detail: "bruto" },
    { label: "Receita aprovada", value: formatBRL(k.receitaAprovada), detail: "aprovado + pago" },
    { label: "Receita pendente", value: formatBRL(k.receitaPendente), detail: "aguardando" },
    { label: "Ticket médio", value: formatBRL(k.ticketMedio), detail: "por serviço" },
    { label: "Pendentes de envio", value: String(k.pendentesDeEnvio), detail: "recibos" },
    { label: "Ajustes solicitados", value: String(k.ajustes), detail: "recibos", alerta: k.ajustes > 0 },
    { label: "Aprovados", value: String(k.aprovados), detail: "recibos" },
    { label: "Pagos", value: String(k.pagos), detail: "recibos" },
  ];

  return (
    <PortalShell title="Dashboard">
      <CabecalhoPagina
        rotulo="Dashboard"
        titulo={`Olá, ${firstName}`}
        descricao="Resumo dos seus recibos e receitas."
        acoes={
          <button type="button" className="button-primary" onClick={() => setNovo(true)}>
            <Plus size={15} strokeWidth={2.2} /> Novo recibo
          </button>
        }
      />

      {k.ajustes > 0 ? (
        <div className="risk-card" role="status">
          <span className="risk-icon">
            <AlertTriangle size={16} strokeWidth={2} />
          </span>
          <div className="risk-card-head">
            <strong>{k.ajustes} recibo(s) com ajuste solicitado.</strong>
            <p>Revise e reenvie para conferência.</p>
          </div>
          <button type="button" className="text-button" onClick={() => navigate("/recibos")}>
            Revisar <ArrowRight size={13} strokeWidth={2.2} />
          </button>
        </div>
      ) : null}

      <div className="kpi-grid kpi-grid-nove">
        {kpis.map((kpi) => (
          <div className={kpi.alerta ? "kpi-card kpi-alerta" : "kpi-card kpi-neutro"} key={kpi.label}>
            <span className="kpi-label">{kpi.label}</span>
            <p className="kpi-value">{kpi.value}</p>
            <p className="kpi-detail">{kpi.detail}</p>
          </div>
        ))}
      </div>

      <div className="grid-dupla">
        <section className="operations-surface">
          <div className="section-header">
            <div>
              <span className="eyebrow">Situação</span>
              <h3>Status dos recibos</h3>
            </div>
          </div>
          {distribuicao.length ? (
            <ul className="stat-list">
              {distribuicao.map((linha) => (
                <li key={linha.status}>
                  <StatusPill status={linha.status} />
                  <strong>{linha.quantidade}</strong>
                </li>
              ))}
            </ul>
          ) : (
            <p className="field-hint">Nenhum recibo cadastrado</p>
          )}
        </section>

        <section className="operations-surface">
          <div className="section-header">
            <div>
              <span className="eyebrow">Atividade</span>
              <h3>Últimos recibos</h3>
            </div>
            <button type="button" className="text-button" onClick={() => navigate("/recibos")}>
              Ver todos <ArrowRight size={13} strokeWidth={2.2} />
            </button>
          </div>
          {recentes.length ? (
            <ul className="stat-list">
              {recentes.map((recibo) => (
                <li key={recibo.id}>
                  <button type="button" className="stat-list-botao" onClick={() => setEditing(recibo)}>
                    {recibo.client || "—"} · {recibo.category || "—"}
                  </button>
                  <span className="inline-row">
                    <StatusPill status={recibo.status} />
                    <strong className="money">{formatBRL(recibo.amount)}</strong>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty-state">
              <ReceiptIcon size={19} strokeWidth={1.8} />
              <strong>Nenhum recibo cadastrado</strong>
            </div>
          )}
        </section>
      </div>

      {editing || novo ? (
        <ReceiptModal
          receipt={editing}
          competencia={currentCompetencia}
          prestadorId={prestadorId}
          onClose={() => {
            setEditing(null);
            setNovo(false);
          }}
          onSave={(draft) => {
            if (editing) updateReceipt(editing.id, draft);
            else createReceipt(draft);
            setEditing(null);
            setNovo(false);
          }}
        />
      ) : null}
    </PortalShell>
  );
}
