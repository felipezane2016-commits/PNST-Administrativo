import { pode, veModulo } from "@/_core/identidade/permissoes";
import { useUsuarioAtual } from "@/_core/identidade/sessao";
import { Loader2, ShieldOff } from "lucide-react";
import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from "react";
import { Redirect, Route, Switch, useLocation } from "wouter";
import CascaAdmin, { rotaInicial } from "./CascaAdmin";
import Vazio from "./componentes/Vazio";
import { moduloDaRota } from "./menu";
import VisaoGeral from "./paginas/VisaoGeral";
import Cabecalho from "./componentes/Cabecalho";

/**
 * Rotas do admin. A visão geral é estática — é o primeiro quadro depois do
 * login; o resto entra sob demanda, e o Suspense fica dentro da casca para a
 * barra não piscar.
 */

type Pagina = { padrao: string; titulo: string; Componente: ComponentType | LazyExoticComponent<ComponentType> };

const PAGINAS: Pagina[] = [
  { padrao: "/", titulo: "Visão geral", Componente: VisaoGeral },
  { padrao: "/notificacoes", titulo: "Notificações", Componente: lazy(() => import("./paginas/Notificacoes")) },
  { padrao: "/calendario", titulo: "Calendário", Componente: lazy(() => import("./paginas/Calendario")) },
  { padrao: "/documentos", titulo: "Documentos", Componente: lazy(() => import("./paginas/Documentos")) },
  { padrao: "/usuarios", titulo: "Usuários e acessos", Componente: lazy(() => import("./paginas/Usuarios")) },

  { padrao: "/prestadores", titulo: "Painel", Componente: lazy(() => import("./paginas/prestadores/PainelPrestadores")) },
  { padrao: "/prestadores/conferencia", titulo: "Conferência", Componente: lazy(() => import("./paginas/prestadores/Conferencia")) },
  { padrao: "/prestadores/historico", titulo: "Histórico de recibos", Componente: lazy(() => import("./paginas/prestadores/Historico")) },
  { padrao: "/prestadores/cadastro", titulo: "Cadastro e acesso", Componente: lazy(() => import("./paginas/prestadores/Cadastro")) },
  { padrao: "/prestadores/arquivos", titulo: "Arquivos", Componente: lazy(() => import("./paginas/prestadores/Arquivos")) },

  { padrao: "/contas", titulo: "Tarefas", Componente: lazy(() => import("./paginas/contas/TarefasContas")) },
  { padrao: "/contas/banco", titulo: "Painel de câmbio", Componente: lazy(() => import("./paginas/contas/PainelCambio")) },
  { padrao: "/contas/taxas", titulo: "Taxas diárias", Componente: lazy(() => import("./paginas/contas/Taxas")) },
  { padrao: "/contas/ordens", titulo: "Ordens de pagamento", Componente: lazy(() => import("./paginas/contas/ordens/Ordens")) },
  { padrao: "/contas/economia", titulo: "Economia potencial", Componente: lazy(() => import("./paginas/contas/Economia")) },
  { padrao: "/pagamentos", titulo: "Pagamentos", Componente: lazy(() => import("./paginas/pagamentos/Pagamentos")) },
  { padrao: "/pagamentos/aprovacoes", titulo: "Aprovações", Componente: lazy(() => import("./paginas/pagamentos/Aprovacoes")) },
  { padrao: "/pagamentos/fornecedores", titulo: "Fornecedores", Componente: lazy(() => import("./paginas/pagamentos/Fornecedores")) },
  { padrao: "/pagamentos/regras", titulo: "Regras de aprovação", Componente: lazy(() => import("./paginas/pagamentos/RegrasAprovacao")) },
  { padrao: "/contas/conciliacao", titulo: "Painel da conciliação", Componente: lazy(() => import("./paginas/conciliacao/PainelConciliacao")) },
  { padrao: "/contas/conciliacao/conciliar", titulo: "Conciliar", Componente: lazy(() => import("./paginas/conciliacao/Conciliar")) },
  { padrao: "/contas/conciliacao/demonstrativo", titulo: "Demonstrativo", Componente: lazy(() => import("./paginas/conciliacao/Demonstrativo")) },
  { padrao: "/contas/conciliacao/contas", titulo: "Contas bancárias", Componente: lazy(() => import("./paginas/conciliacao/ContasBancarias")) },

];

function Carregando() {
  return (
    <div className="empty-state" role="status">
      <Loader2 size={19} strokeWidth={1.8} className="animate-spin" />
      <span>Carregando…</span>
    </div>
  );
}

export default function RotasAdmin() {
  const usuario = useUsuarioAtual();
  const [caminho] = useLocation();

  if (!usuario) return <Redirect to="/login" />;

  const pagina =
    PAGINAS.find((item) => item.padrao === caminho) ??
    PAGINAS.find((item) => item.padrao.includes(":") && caminho.startsWith(item.padrao.split(":")[0]));
  const modulo = moduloDaRota(caminho);

  // A visão geral é o destino padrão; quem não a vê cai na primeira área que vê.
  if (caminho === "/" && !veModulo(usuario, "visao")) return <Redirect to={rotaInicial(usuario)} />;

  const semAcesso =
    (modulo !== null && !veModulo(usuario, modulo)) ||
    (caminho.startsWith("/usuarios") && !pode(usuario, "usuarios.gerenciar"));

  return (
    <CascaAdmin usuario={usuario} titulo={pagina?.titulo ?? "Página não encontrada"}>
      {semAcesso ? (
        <section className="operations-surface">
          <Cabecalho titulo={pagina?.titulo ?? "Sem acesso"} descricao="Área fora dos módulos liberados para você." />
          <Vazio
            icone={ShieldOff}
            titulo="Sem acesso a esta área"
            texto="Seu usuário não tem este módulo liberado. Peça a um administrador em Usuários e acessos."
          />
        </section>
      ) : (
        <Suspense fallback={<Carregando />}>
          <Switch>
            {PAGINAS.map(({ padrao, Componente }) => (
              <Route key={padrao} path={padrao}>
                <Componente />
              </Route>
            ))}
            <Route>
              <section className="operations-surface">
                <Cabecalho titulo="Página não encontrada" />
                <Vazio icone={ShieldOff} titulo="Página não encontrada" texto="O endereço não existe no escritório." />
              </section>
            </Route>
          </Switch>
        </Suspense>
      )}
    </CascaAdmin>
  );
}
