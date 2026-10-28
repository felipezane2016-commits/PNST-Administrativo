import type { Modulo, Permissao } from "@/_core/identidade/permissoes";
import {
  Banknote,
  Bell,
  BookOpen,
  Building2,
  CalendarDays,
  ClipboardCheck,
  FileSpreadsheet,
  FileText,
  GitCompareArrows,
  FolderOpen,
  Gauge,
  History,
  Landmark,
  LayoutDashboard,
  LineChart,
  ListChecks,
  PiggyBank,
  Scale,
  Settings2,
  ShieldCheck,
  Truck,
  UserCog,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export type Contador = "notificacoes" | "conferencia" | "ordens" | "pagamentos" | "aprovacoes" | "contas";

export type ItemMenu = {
  rota: string;
  rotulo: string;
  icone: LucideIcon;
  /** Sem módulo: aparece para qualquer pessoa logada (ex.: notificações). */
  modulo?: Modulo;
  /** Some para quem tem este módulo (ele já chega à página por dentro do módulo). */
  ocultarCom?: Modulo;
  exige?: Permissao;
  contador?: Contador;
};

export type Grupo = { rotulo: string; itens: ItemMenu[] };

/** Menu da casca principal (escritório). */
export const MENU_ESCRITORIO: Grupo[] = [
  {
    rotulo: "Principal",
    itens: [
      { rota: "/", rotulo: "Visão geral", icone: LayoutDashboard, modulo: "visao" },
      { rota: "/notificacoes", rotulo: "Notificações", icone: Bell, contador: "notificacoes" },
      { rota: "/calendario", rotulo: "Calendário", icone: CalendarDays, modulo: "calendario" },
      { rota: "/documentos", rotulo: "Documentos", icone: FileText, modulo: "documentos" },
    ],
  },
  {
    rotulo: "Workflows",
    itens: [
      { rota: "/prestadores", rotulo: "Prestadores", icone: Truck, modulo: "prestadores", contador: "conferencia" },
      { rota: "/contas", rotulo: "Account Management", icone: Landmark, modulo: "contas", contador: "contas" },
      // Quem pede pagamento sem ter o Account Management (outras áreas) entra por aqui.
      { rota: "/contas/pagamentos", rotulo: "Pagamentos", icone: Wallet, ocultarCom: "contas", contador: "pagamentos" },
    ],
  },
  {
    rotulo: "Administração",
    itens: [{ rota: "/usuarios", rotulo: "Usuários e acessos", icone: UserCog, exige: "usuarios.gerenciar" }],
  },
];

/**
 * Módulos com casca própria: ao entrar, a barra troca para o menu do módulo,
 * com volta para o escritório — como o GED e o Backoffice do modelo.
 */
export type MenuModulo = { modulo?: Modulo; titulo: string; prefixo: string; grupos: Grupo[] };

export const MENUS_MODULO: MenuModulo[] = [
  {
    modulo: "prestadores",
    titulo: "Prestadores",
    prefixo: "/prestadores",
    grupos: [
      {
        rotulo: "Principal",
        itens: [
          { rota: "/prestadores", rotulo: "Painel", icone: Gauge },
          { rota: "/prestadores/conferencia", rotulo: "Conferência", icone: ClipboardCheck, contador: "conferencia" },
          { rota: "/prestadores/historico", rotulo: "Histórico", icone: History },
        ],
      },
      {
        rotulo: "Gestão",
        itens: [
          { rota: "/prestadores/cadastro", rotulo: "Cadastro e acesso", icone: BookOpen },
          { rota: "/prestadores/arquivos", rotulo: "Arquivos", icone: FolderOpen },
        ],
      },
    ],
  },
  {
    modulo: "contas",
    titulo: "Account Management",
    prefixo: "/contas",
    grupos: [
      { rotulo: "Principal", itens: [{ rota: "/contas", rotulo: "Tarefas", icone: ListChecks, modulo: "contas" }] },
      {
        // Sem módulo: quem pede pagamento de outra área também usa estas páginas
        // (as próprias páginas e o banco decidem o que cada um vê e faz).
        rotulo: "Pagamentos",
        itens: [
          { rota: "/contas/pagamentos", rotulo: "Pagamentos", icone: Wallet, contador: "pagamentos" },
          { rota: "/contas/pagamentos/aprovacoes", rotulo: "Aprovações", icone: ShieldCheck, contador: "aprovacoes" },
          { rota: "/contas/pagamentos/fornecedores", rotulo: "Fornecedores", icone: Building2 },
          { rota: "/contas/pagamentos/regras", rotulo: "Regras de aprovação", icone: Settings2 },
        ],
      },
      {
        rotulo: "Banco Industrial",
        itens: [
          { rota: "/contas/banco", rotulo: "Painel de câmbio", icone: LineChart, modulo: "contas" },
          { rota: "/contas/taxas", rotulo: "Taxas diárias", icone: Banknote, modulo: "contas" },
          { rota: "/contas/ordens", rotulo: "Ordens de pagamento", icone: ClipboardCheck, contador: "ordens", modulo: "contas" },
          { rota: "/contas/economia", rotulo: "Economia potencial", icone: PiggyBank, modulo: "contas" },
        ],
      },
      {
        rotulo: "Conciliação bancária",
        itens: [
          { rota: "/contas/conciliacao", rotulo: "Painel da conciliação", icone: Scale, modulo: "contas" },
          { rota: "/contas/conciliacao/conciliar", rotulo: "Conciliar", icone: GitCompareArrows, modulo: "contas" },
          { rota: "/contas/conciliacao/demonstrativo", rotulo: "Demonstrativo", icone: FileSpreadsheet, modulo: "contas" },
          { rota: "/contas/conciliacao/contas", rotulo: "Contas bancárias", icone: Landmark, modulo: "contas" },
        ],
      },
    ],
  },
];

/** Endereços antigos de pagamentos (antes de irem para o Account Management). */
export function rotaNovaDePagamentos(caminho: string) {
  return casa(caminho, "/pagamentos") ? `/contas${caminho}` : null;
}

function casa(caminho: string, prefixo: string) {
  return caminho === prefixo || caminho.startsWith(`${prefixo}/`);
}

export function menuDaRota(caminho: string): MenuModulo | null {
  return MENUS_MODULO.find((menu) => casa(caminho, menu.prefixo)) ?? null;
}

/** Módulo dono da rota — o que decide se a pessoa pode abrir a página. */
export function moduloDaRota(caminho: string): Modulo | null {
  const mapa: [string, Modulo][] = [
    ["/calendario", "calendario"],
    ["/documentos", "documentos"],
    ["/prestadores", "prestadores"],
    ["/contas", "contas"],
  ];
  if (caminho === "/") return "visao";
  // Pagamentos vive no Account Management, mas qualquer pessoa da equipe pede.
  if (casa(caminho, "/contas/pagamentos")) return null;
  return mapa.find(([prefixo]) => casa(caminho, prefixo))?.[1] ?? null;
}

/** Item ativo: o de prefixo mais longo que casa com a rota. */
export function itemAtivo(itens: ItemMenu[], caminho: string) {
  return itens
    .filter((item) => (item.rota === "/" ? caminho === "/" : casa(caminho, item.rota)))
    .sort((a, b) => b.rota.length - a.rota.length)[0];
}
