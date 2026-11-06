import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Redirect, Route, Router as WouterRouter, Switch } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import RotasAdmin from "./admin/RotasAdmin";
import Entrar from "./admin/paginas/Entrar";
import ErrorBoundary from "./components/ErrorBoundary";
import PortaoSupabase from "./components/PortaoSupabase";
import { PortalProvider, usePortal } from "./contexts/PortalContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import Closing from "./pages/Closing";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import Receipts from "./pages/Receipts";
import Services from "./pages/Services";

/**
 * Zonas da plataforma, no modelo do documento de arquitetura:
 *   /portal/*  Portal do Prestador (zona do prestador) — aninhado, então as
 *              telas do portal navegam com caminhos relativos ("/recibos").
 *   /login     acesso do escritório
 *   /*         admin do escritório (casca própria, rotas em RotasAdmin)
 */

function RotaPrivadaPortal({ children }: { children: React.ReactNode }) {
  const { signedIn } = usePortal();
  if (!signedIn) return <Redirect to="/login" />;
  return <>{children}</>;
}

function RotasPortal() {
  const { signedIn } = usePortal();
  return (
    <Switch>
      <Route path="/login">{signedIn ? <Redirect to="/" /> : <Login />}</Route>
      <Route path="/">
        <RotaPrivadaPortal>
          <Dashboard />
        </RotaPrivadaPortal>
      </Route>
      <Route path="/recibos">
        <RotaPrivadaPortal>
          <Receipts />
        </RotaPrivadaPortal>
      </Route>
      <Route path="/servicos">
        <RotaPrivadaPortal>
          <Services />
        </RotaPrivadaPortal>
      </Route>
      <Route path="/fechamento">
        <RotaPrivadaPortal>
          <Closing />
        </RotaPrivadaPortal>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function Rotas() {
  return (
    <Switch>
      <Route path="/portal" nest>
        <RotasPortal />
      </Route>
      <Route path="/login" component={Entrar} />
      <Route>
        <RotasAdmin />
      </Route>
    </Switch>
  );
}

// Tema alternável: o ThemeContext põe a classe .dark na raiz e guarda a
// escolha na chave "theme"; o index.css só redefine os tokens semânticos.

// Builds estáticos publicados fora de um servidor com fallback de SPA (preview
// por link, GitHub Pages) não conseguem servir /portal/recibos direto. Com
// VITE_HASH_ROUTER=1 as rotas passam a viver no hash (#/portal/recibos) e
// funcionam em qualquer caminho. O dev e o build normal seguem com rotas em path.
const hashRouting = import.meta.env.VITE_HASH_ROUTER === "1";

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light" switchable>
        <TooltipProvider>
          <Toaster />
          <PortalProvider>
            <PortaoSupabase>
              {hashRouting ? (
                <WouterRouter hook={useHashLocation}>
                  <Rotas />
                </WouterRouter>
              ) : (
                <Rotas />
              )}
            </PortaoSupabase>
          </PortalProvider>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
