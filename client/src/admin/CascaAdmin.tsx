import { useNotificacoesVisiveis } from "./notificacoesVisiveis";
import { useColecao } from "@/_core/armazenamento/colecao";
import { iniciais, pode, PAPEIS, veModulo, type Usuario } from "@/_core/identidade/permissoes";
import { sair, usuarios } from "@/_core/identidade/sessao";
import { useTheme } from "@/contexts/ThemeContext";
import { notificacoes } from "@/modulos/notificacoes/colecao";
import { fechamentos, prestadores, recibos } from "@/modulos/prestadores/colecoes";
import { conferenciaAberta, montarLotes } from "@/modulos/prestadores/regras";
import { ArrowLeft, Building2, FileText, Landmark, LayoutGrid, LogOut, Menu, Moon, Receipt, Sun, UserCog, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { itemAtivo, MENU_ESCRITORIO, MENUS_MODULO, menuDaRota, type Contador, type Grupo, type ItemMenu } from "./menu";
import Marca from "@/components/Marca";
import AvisoRenovacao from "@/components/AvisoRenovacao";
import BuscaGlobal, { type ItemBusca } from "@/components/BuscaGlobal";
import MenuConta from "@/components/MenuConta";
import MenuSino from "@/components/MenuSino";
import { documentos } from "@/modulos/escritorio/colecoes";
import { ordens, taxas, tarefasContas } from "@/modulos/contas/colecoes";
import { alertasDasOrdens } from "@/modulos/contas/regras";
import { configAprovacao, pagamentos } from "@/modulos/pagamentos/colecoes";
import { ehFinanceiro, podeAprovar } from "@/modulos/pagamentos/regras";
import type { ConfigAprovacao, Pagamento } from "@/modulos/pagamentos/tipos";
import { formatarData, HOJE } from "@/_core/tempo";

/** Primeira rota que a pessoa pode abrir no escritório. */
export function rotaInicial(usuario: Usuario) {
  for (const grupo of MENU_ESCRITORIO) {
    for (const item of grupo.itens) {
      if (item.modulo && veModulo(usuario, item.modulo)) return item.rota;
    }
  }
  return "/notificacoes";
}

function visivel(usuario: Usuario, item: ItemMenu) {
  if (item.exige && !pode(usuario, item.exige)) return false;
  if (item.modulo && !veModulo(usuario, item.modulo)) return false;
  if (item.ocultarCom && veModulo(usuario, item.ocultarCom)) return false;
  return true;
}

/**
 * O que cada pessoa tem a fazer em pagamentos: o aprovador vê a fila de
 * aprovação; o financeiro, o que conferir e pagar; quem pediu, o que voltou.
 */
function contadoresPagamentos(usuario: Usuario, lista: Pagamento[], config: ConfigAprovacao, pessoas: Usuario[]) {
  // Cada um conta só o que é da alçada dele (um nível acima de quem pediu).
  const aprovacoes = lista.filter((p) => podeAprovar(usuario, p, config, HOJE, pessoas).ok).length;
  const doFinanceiro = ehFinanceiro(usuario) ? lista.filter((p) => p.status === "Em conferência" || p.status === "Aprovado").length : 0;
  const devolvidos = lista.filter((p) => p.status === "Devolvido" && p.solicitanteId === usuario.id).length;
  return { aprovacoes, pagamentos: aprovacoes + doFinanceiro + devolvidos };
}

function useContadores(usuario: Usuario): Record<Contador, number> {
  const avisos = useNotificacoesVisiveis(usuario);
  const listaRecibos = useColecao(recibos);
  const listaFechamentos = useColecao(fechamentos);
  const listaPrestadores = useColecao(prestadores);
  const listaOrdens = useColecao(ordens);
  const listaTaxas = useColecao(taxas);
  const listaPagamentos = useColecao(pagamentos);
  const config = useColecao(configAprovacao);
  const pessoas = useColecao(usuarios);
  return useMemo(() => {
    // Ordens que pedem ação hoje: fechar D+n, taxa-alvo atingida, OK do banco atrasado.
    const ordensHoje = alertasDasOrdens(listaOrdens, listaTaxas, HOJE).length;
    const doPagamento = contadoresPagamentos(usuario, listaPagamentos, config, pessoas);
    return {
      notificacoes: avisos.filter(aviso => !aviso.lida).length,
      conferencia: montarLotes(listaRecibos, listaFechamentos, listaPrestadores).filter(conferenciaAberta).length,
      ordens: ordensHoje,
      ...doPagamento,
      // Na entrada do Account Management: tudo o que espera a pessoa lá dentro.
      contas: ordensHoje + doPagamento.pagamentos,
    };
  },
    [avisos, listaRecibos, listaFechamentos, listaPrestadores, listaOrdens, listaTaxas, usuario, listaPagamentos, config, pessoas]
  );
}

type Props = { usuario: Usuario; titulo: string; children: ReactNode };

/** Itens da busca do topo: páginas do menu e registros que a pessoa pode ver. */
function itensDeBusca(usuario: Usuario, navegar: (rota: string) => void): ItemBusca[] {
  const itens: ItemBusca[] = [];
  // Páginas do menu inicial e das áreas (ex.: Pagamentos, dentro do Account Management).
  const daArea = MENUS_MODULO.flatMap((menu) => menu.grupos.flatMap((grupo) => grupo.itens).filter((item) => item.rota !== menu.prefixo));
  const paginas = [...MENU_ESCRITORIO.flatMap((grupo) => grupo.itens), ...daArea]
    .filter((item) => visivel(usuario, item))
    .filter((item, i, lista) => lista.findIndex((outro) => outro.rota === item.rota) === i);
  for (const pagina of paginas) {
    itens.push({ id: `pg-${pagina.rota}`, grupo: "Páginas", titulo: pagina.rotulo, icone: <LayoutGrid size={14} />, abrir: () => navegar(pagina.rota) });
  }
  if (veModulo(usuario, "prestadores")) {
    for (const prestador of prestadores.ler()) {
      itens.push({ id: `pr-${prestador.id}`, grupo: "Prestadores", titulo: prestador.nome, detalhe: `${prestador.categoria} · ${prestador.codigoAcesso}`, icone: <Building2 size={14} />, abrir: () => navegar("/prestadores/cadastro") });
    }
    for (const recibo of recibos.ler()) {
      itens.push({ id: `re-${recibo.id}`, grupo: "Recibos", titulo: `${recibo.id} · ${recibo.client}`, detalhe: `${recibo.category} · ${formatarData(recibo.serviceDate)} · ${recibo.status}`, icone: <Receipt size={14} />, abrir: () => navegar("/prestadores/historico") });
    }
  }
  if (veModulo(usuario, "documentos")) {
    for (const documento of documentos.ler()) {
      itens.push({ id: `dc-${documento.id}`, grupo: "Documentos", titulo: documento.nome, detalhe: documento.categoria, icone: <FileText size={14} />, abrir: () => navegar("/documentos") });
    }
  }
  if (veModulo(usuario, "contas")) {
    for (const conta of tarefasContas.ler()) {
      itens.push({ id: `ct-${conta.id}`, grupo: "Account Management", titulo: conta.nome, detalhe: conta.categoria, icone: <Landmark size={14} />, abrir: () => navegar("/contas") });
    }
  }
  return itens;
}

export default function CascaAdmin({ usuario, titulo, children }: Props) {
  const { theme, toggleTheme } = useTheme();
  const [caminho, navegar] = useLocation();
  const [menuAberto, setMenuAberto] = useState(false);
  const contadores = useContadores(usuario);
  const avisos = useNotificacoesVisiveis(usuario);

  // Fecha a gaveta a cada navegação, senão ela cobre a página recém-aberta.
  useEffect(() => {
    setMenuAberto(false);
  }, [caminho]);

  useEffect(() => {
    document.title = `${titulo} — PNST Administrativo`;
  }, [titulo]);

  const menuModulo = menuDaRota(caminho);
  const grupos: Grupo[] = (menuModulo ? menuModulo.grupos : MENU_ESCRITORIO)
    .map((grupo) => ({ ...grupo, itens: grupo.itens.filter((item) => visivel(usuario, item)) }))
    .filter((grupo) => grupo.itens.length > 0);
  const ativo = itemAtivo(
    grupos.flatMap((grupo) => grupo.itens),
    caminho,
  );
  const buscar = useCallback(() => itensDeBusca(usuario, navegar), [usuario, navegar]);
  const naoLidas = avisos.filter((aviso) => !aviso.lida);

  function sairDoAdmin() {
    sair();
    navegar("/login");
  }

  return (
    <div className="app-shell">
      <aside className={menuAberto ? "sidebar sidebar-aberta" : "sidebar"} aria-label="Navegação principal">
        <div className="brand-row">
          <Marca legenda="Escritório" />
          <button type="button" className="sidebar-close" aria-label="Fechar menu" onClick={() => setMenuAberto(false)}>
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        <div className="sidebar-scroll">
          {menuModulo ? (
            <>
              <button type="button" className="nav-item sidebar-back" onClick={() => navegar(rotaInicial(usuario))}>
                <ArrowLeft size={16} strokeWidth={1.7} />
                <span>Voltar ao escritório</span>
              </button>
              <p className="sidebar-module-title">{menuModulo.titulo}</p>
            </>
          ) : null}

          {grupos.map((grupo) => (
            <div key={grupo.rotulo}>
              <p className="sidebar-section-label">{grupo.rotulo}</p>
              <nav className="sidebar-nav" aria-label={grupo.rotulo}>
                {grupo.itens.map((item) => {
                  const Icone = item.icone;
                  const estaAtivo = ativo?.rota === item.rota;
                  const contagem = item.contador ? contadores[item.contador] : 0;
                  return (
                    <button
                      key={item.rota}
                      type="button"
                      className={estaAtivo ? "nav-item nav-active" : "nav-item"}
                      aria-current={estaAtivo ? "page" : undefined}
                      onClick={() => navegar(item.rota)}
                    >
                      <Icone size={17} strokeWidth={estaAtivo ? 2.2 : 1.7} />
                      <span>{item.rotulo}</span>
                      {contagem > 0 ? (
                        <span className="nav-count" aria-label={`${contagem} pendente(s)`}>
                          {contagem}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </nav>
            </div>
          ))}
        </div>

        <div className="sidebar-footer">
          <div className="sidebar-rule" />
          <div className="profile-row">
            <span className="avatar avatar-sm" aria-hidden="true">
              {iniciais(usuario.nome)}
            </span>
            <div>
              <strong>{usuario.nome}</strong>
              <span>
                {PAPEIS[usuario.papel].nome} · {usuario.departamento}
              </span>
            </div>
            <button type="button" className="icon-button subtle" aria-label="Sair" title="Sair" onClick={sairDoAdmin}>
              <LogOut size={15} strokeWidth={1.9} />
            </button>
          </div>
        </div>
      </aside>

      {menuAberto ? <button type="button" className="sidebar-overlay" aria-label="Fechar menu" onClick={() => setMenuAberto(false)} /> : null}

      <div className="main-shell">
        <header className="topbar">
          <button type="button" className="menu-button" aria-label="Abrir menu" onClick={() => setMenuAberto(true)}>
            <Menu size={19} strokeWidth={1.9} />
          </button>
          <div className="breadcrumbs">
            {menuModulo ? (
              <>
                <span>{menuModulo.titulo}</span>
                <span aria-hidden="true">/</span>
              </>
            ) : null}
            <strong>{titulo}</strong>
          </div>
          <div className="topbar-actions">
            <BuscaGlobal itens={buscar} placeholder="Buscar páginas, prestadores, recibos, tarefas…" />
            {toggleTheme ? (
              <button
                type="button"
                className="icon-button theme-toggle"
                aria-label={theme === "dark" ? "Usar tema claro" : "Usar tema escuro"}
                aria-pressed={theme === "dark"}
                onClick={toggleTheme}
              >
                {theme === "dark" ? <Sun size={17} strokeWidth={1.9} /> : <Moon size={17} strokeWidth={1.9} />}
              </button>
            ) : null}
            <MenuSino
              avisos={naoLidas.map((aviso) => ({
                id: aviso.id,
                titulo: aviso.titulo,
                detalhe: aviso.corpo,
                abrir: () => navegar(aviso.destino ?? "/notificacoes"),
              }))}
              vazio="Você está em dia. Nenhuma notificação nova."
              rodape={{ rotulo: "Ver todas as notificações", abrir: () => navegar("/notificacoes") }}
            />
            <MenuConta
              iniciais={iniciais(usuario.nome)}
              nome={usuario.nome}
              detalhe={`${PAPEIS[usuario.papel].nome} · ${usuario.departamento}`}
              acoes={[
                ...(pode(usuario, "usuarios.gerenciar")
                  ? [{ rotulo: "Usuários e acessos", icone: <UserCog size={14} />, aoClicar: () => navegar("/usuarios") }]
                  : []),
                { rotulo: "Sair", icone: <LogOut size={14} />, aoClicar: sairDoAdmin },
              ]}
            />
          </div>
        </header>
        <main className="page-content page-enter" key={caminho}>
          <AvisoRenovacao />
          {children}
        </main>
      </div>
    </div>
  );
}
