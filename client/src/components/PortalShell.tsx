import { useTheme } from "@/contexts/ThemeContext";
import { usePortal } from "@/contexts/PortalContext";
import { formatBRL, formatDate } from "@/lib/portal";
import {
  CalendarCheck,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Receipt,
  Sun,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import Marca from "@/components/Marca";
import AvisoRenovacao from "@/components/AvisoRenovacao";
import BuscaGlobal from "@/components/BuscaGlobal";
import MenuConta from "@/components/MenuConta";
import MenuSino from "@/components/MenuSino";

const NAV_ITEMS = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard },
  { path: "/recibos", label: "Meus recibos", icon: Receipt },
  { path: "/fechamento", label: "Fechamento mensal", icon: CalendarCheck },
] as const;

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() ?? "")
    .join("");
}

export default function PortalShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const { provider, receipts, signOut } = usePortal();
  const { theme, toggleTheme } = useTheme();
  const [location, navigate] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    document.title = `${title} — Portal do Prestador · PNST`;
  }, [title]);

  // Fecha a gaveta a cada navegação, senão ela cobre a página recém-aberta.
  useEffect(() => setMenuOpen(false), [location]);

  const draftCount = receipts.filter(
    receipt => receipt.status === "Rascunho"
  ).length;
  // Avisos do sino: o que o escritório devolveu (ajuste) ou recusou.
  const rejected = receipts.filter(receipt => receipt.status === "Ajuste solicitado" || receipt.status === "Rejeitado");

  const buscar = useCallback(
    () => [
      ...NAV_ITEMS.map(item => ({
        id: `pg-${item.path}`,
        grupo: "Páginas",
        titulo: item.label,
        abrir: () => navigate(item.path),
      })),
      ...receipts.map(receipt => ({
        id: `re-${receipt.id}`,
        grupo: "Recibos",
        titulo: `${receipt.id} · ${receipt.client}`,
        detalhe: `${receipt.category} · ${formatDate(receipt.serviceDate)} · ${formatBRL(receipt.amount)} · ${receipt.status}`,
        abrir: () => navigate("/recibos"),
      })),
    ],
    [receipts, navigate]
  );

  function handleSignOut() {
    signOut();
    navigate("/login");
  }

  return (
    <div className="app-shell">
      <aside
        className={menuOpen ? "sidebar sidebar-aberta" : "sidebar"}
        aria-label="Navegação principal"
      >
        <div className="brand-row">
          <Marca legenda="Portal do Prestador" />
          <button
            type="button"
            className="sidebar-close"
            aria-label="Fechar menu"
            onClick={() => setMenuOpen(false)}
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        <div className="sidebar-scroll">
          <p className="sidebar-section-label">Navegação</p>
          <nav className="sidebar-nav" aria-label="Navegação">
            {NAV_ITEMS.map(item => {
              const Icon = item.icon;
              const active = location === item.path;
              const badge =
                item.path === "/recibos" && draftCount > 0 ? draftCount : null;
              return (
                <button
                  key={item.path}
                  type="button"
                  className={active ? "nav-item nav-active" : "nav-item"}
                  aria-current={active ? "page" : undefined}
                  onClick={() => navigate(item.path)}
                >
                  <Icon size={17} strokeWidth={active ? 2.2 : 1.7} />
                  <span>{item.label}</span>
                  {badge ? (
                    <span className="nav-count" aria-label={`${badge} rascunho(s)`}>
                      {badge}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="sidebar-footer">
          <div className="sidebar-rule" />
          <div className="profile-row">
            <span className="avatar avatar-sm" aria-hidden="true">
              {initials(provider.name)}
            </span>
            <div>
              <strong>{provider.name}</strong>
              <span>{provider.code}</span>
            </div>
            <button
              type="button"
              className="icon-button subtle"
              aria-label="Sair do portal"
              title="Sair do portal"
              onClick={handleSignOut}
            >
              <LogOut size={15} strokeWidth={1.9} />
            </button>
          </div>
        </div>
      </aside>

      {menuOpen ? (
        <button
          type="button"
          className="sidebar-overlay"
          aria-label="Fechar menu"
          onClick={() => setMenuOpen(false)}
        />
      ) : null}

      <div className="main-shell">
        <header className="topbar">
          <button
            type="button"
            className="menu-button"
            aria-label="Abrir menu"
            onClick={() => setMenuOpen(true)}
          >
            <Menu size={19} strokeWidth={1.9} />
          </button>
          <div className="breadcrumbs">
            <strong>{title}</strong>
          </div>
          <div className="topbar-actions">
            <BuscaGlobal itens={buscar} placeholder="Buscar recibos e páginas…" />
            {toggleTheme ? (
              <button
                type="button"
                className="icon-button theme-toggle"
                aria-label={theme === "dark" ? "Usar tema claro" : "Usar tema escuro"}
                aria-pressed={theme === "dark"}
                onClick={toggleTheme}
              >
                {theme === "dark" ? (
                  <Sun size={17} strokeWidth={1.9} />
                ) : (
                  <Moon size={17} strokeWidth={1.9} />
                )}
              </button>
            ) : null}
            <MenuSino
              avisos={rejected.map(receipt => ({
                id: receipt.id,
                titulo: receipt.status === "Rejeitado" ? `${receipt.id} rejeitado` : `${receipt.id}: ajuste solicitado`,
                detalhe: receipt.reviewNote ?? "Revise e reenvie o recibo.",
                abrir: () => navigate("/recibos"),
              }))}
              vazio="Você está em dia. Nenhum ajuste solicitado."
            />
            <MenuConta
              iniciais={initials(provider.name)}
              nome={provider.name}
              detalhe={`Código ${provider.code}`}
              acoes={[
                {
                  rotulo: "Sair do portal",
                  icone: <LogOut size={14} />,
                  aoClicar: handleSignOut,
                },
              ]}
            />
          </div>
        </header>

        <main className="page-content page-enter" key={location}>
          <AvisoRenovacao />
          {children}
        </main>
      </div>
    </div>
  );
}
