/**
 * Identidade do admin. Permissões efetivas = o que o PAPEL concede ∩ os MÓDULOS
 * liberados para a pessoa. Papel responde "esta pessoa pode editar?"; módulo
 * responde "esta área existe para ela?". Uma operadora de prestadores continua
 * operadora, mas só enxerga as áreas liberadas para ela.
 */

export type Papel = "admin" | "gestor" | "operador" | "viewer";

export const PAPEIS: Record<Papel, { nome: string; descricao: string }> = {
  admin: { nome: "Administrador", descricao: "Tudo, incluindo usuários e acessos" },
  gestor: { nome: "Gestor", descricao: "Tudo, menos usuários e acessos" },
  operador: { nome: "Operador", descricao: "Cria e edita; não exclui nem gerencia usuários" },
  viewer: { nome: "Leitor", descricao: "Só consulta" },
};

export type Modulo =
  | "visao"
  | "calendario"
  | "documentos"
  | "prestadores"
  | "pagamentos"
  | "contas";

export const MODULOS: Record<Modulo, string> = {
  visao: "Visão geral",
  calendario: "Calendário",
  documentos: "Documentos",
  prestadores: "Prestadores",
  pagamentos: "Pagamentos",
  contas: "Account Management",
};

/**
 * Permissões por ação. Cada ação pertence a uma área; a área (módulo) libera a
 * entrada, a ação libera o que a pessoa faz lá dentro. Sem ajuste na ficha
 * (`permissoes` vazio), valem as do papel — o "nível" de cada ação abaixo.
 * A mesma tabela existe no banco (`permissoes_catalogo`): as políticas de RLS
 * consultam `tem('acao')`, então o que a tela esconde o banco também recusa.
 */
type Nivel = "ver" | "editar" | "excluir" | "financeiro" | "gestao" | "admin" | "todos";

export type Area = "prestadores" | "pagamentos" | "contas" | "calendario" | "documentos";

export const AREAS: Record<Area, { nome: string; modulo: Modulo | null }> = {
  prestadores: { nome: "Prestadores", modulo: "prestadores" },
  pagamentos: { nome: "Pagamentos", modulo: "pagamentos" },
  contas: { nome: "Account Management", modulo: "contas" },
  calendario: { nome: "Calendário", modulo: "calendario" },
  documentos: { nome: "Documentos", modulo: "documentos" },
};

export const ACOES = {
  "prestadores.painel.ver": { area: "prestadores", nome: "Ver o painel", nivel: "ver" },
  "prestadores.conferencia.ver": { area: "prestadores", nome: "Ver a conferência e os lotes", nivel: "ver" },
  "prestadores.conferencia.conferir": { area: "prestadores", nome: "Finalizar, rejeitar e pedir ajuste de lotes", nivel: "editar" },
  "prestadores.conferencia.pagar": { area: "prestadores", nome: "Marcar lote como pago e pedir o pagamento", nivel: "editar" },
  "prestadores.recibos.editar": { area: "prestadores", nome: "Editar recibos dos prestadores", nivel: "editar" },
  "prestadores.recibos.excluir": { area: "prestadores", nome: "Excluir recibos e lotes", nivel: "excluir" },
  "prestadores.historico.ver": { area: "prestadores", nome: "Ver o histórico", nivel: "ver" },
  "prestadores.arquivos.ver": { area: "prestadores", nome: "Ver e abrir os arquivos", nivel: "ver" },
  "prestadores.cadastro.ver": { area: "prestadores", nome: "Ver o cadastro de prestadores", nivel: "ver" },
  "prestadores.cadastro.editar": { area: "prestadores", nome: "Cadastrar, editar e convidar prestadores", nivel: "editar" },
  "prestadores.cadastro.excluir": { area: "prestadores", nome: "Excluir prestadores", nivel: "excluir" },

  "pagamentos.pedir": { area: "pagamentos", nome: "Pedir pagamentos", nivel: "todos" },
  "pagamentos.ver_todos": { area: "pagamentos", nome: "Ver todos os pedidos (não só os próprios)", nivel: "financeiro" },
  "pagamentos.conferir": { area: "pagamentos", nome: "Conferir pedidos (financeiro)", nivel: "financeiro" },
  "pagamentos.aprovar": { area: "pagamentos", nome: "Aprovar pedidos (segue a hierarquia)", nivel: "todos" },
  "pagamentos.pagar": { area: "pagamentos", nome: "Registrar o pagamento", nivel: "financeiro" },
  "pagamentos.fornecedores": { area: "pagamentos", nome: "Cadastrar fornecedores e dados bancários", nivel: "gestao" },
  "pagamentos.regras": { area: "pagamentos", nome: "Alterar as regras de aprovação", nivel: "admin" },

  "contas.tarefas.ver": { area: "contas", nome: "Ver tarefas", nivel: "ver" },
  "contas.tarefas.editar": { area: "contas", nome: "Criar e editar tarefas", nivel: "editar" },
  "contas.tarefas.excluir": { area: "contas", nome: "Excluir tarefas", nivel: "excluir" },
  "contas.banco.ver": { area: "contas", nome: "Ver Banco Industrial (câmbio, taxas, ordens)", nivel: "ver" },
  "contas.banco.editar": { area: "contas", nome: "Lançar taxas e ordens de pagamento", nivel: "editar" },
  "contas.banco.excluir": { area: "contas", nome: "Excluir taxas e ordens", nivel: "excluir" },
  "contas.conciliacao.ver": { area: "contas", nome: "Ver a conciliação bancária", nivel: "ver" },
  "contas.conciliacao.editar": { area: "contas", nome: "Conciliar, importar extratos e fechar o mês", nivel: "editar" },

  "calendario.ver": { area: "calendario", nome: "Ver o calendário", nivel: "ver" },
  "calendario.editar": { area: "calendario", nome: "Criar e editar reuniões", nivel: "editar" },
  "calendario.excluir": { area: "calendario", nome: "Excluir reuniões", nivel: "excluir" },

  "documentos.ver": { area: "documentos", nome: "Ver documentos", nivel: "ver" },
  "documentos.editar": { area: "documentos", nome: "Enviar e editar documentos", nivel: "editar" },
  "documentos.excluir": { area: "documentos", nome: "Excluir documentos", nivel: "excluir" },
} as const satisfies Record<string, { area: Area; nome: string; nivel: Nivel }>;

export type Acao = keyof typeof ACOES;
/** Ações por ação + gerenciar usuários (só administrador). */
export type Permissao = Acao | "usuarios.gerenciar";

export const acoesDaArea = (area: Area) => (Object.keys(ACOES) as Acao[]).filter((acao) => ACOES[acao].area === area);

/** O que o papel concede por padrão (sem ajuste na ficha). */
export function padraoDoPapel(papel: Papel, modulos: Modulo[], acao: Acao) {
  const editor = papel === "admin" || papel === "gestor" || papel === "operador";
  switch (ACOES[acao].nivel as Nivel) {
    case "todos":
    case "ver":
      return true;
    case "editar":
      return editor;
    case "excluir":
      return papel === "admin" || papel === "gestor";
    case "financeiro":
      return editor && modulos.includes("contas");
    case "gestao":
      return papel === "admin" || papel === "gestor" || (editor && modulos.includes("contas"));
    case "admin":
      return papel === "admin";
  }
}

/** As permissões que a pessoa tem hoje (ajustadas na ficha ou as do papel). */
export function permissoesEfetivas(usuario: Pick<Usuario, "papel" | "modulos" | "permissoes">): Acao[] {
  return (Object.keys(ACOES) as Acao[]).filter((acao) => {
    if (usuario.papel === "admin") return true;
    return usuario.permissoes ? usuario.permissoes.includes(acao) : padraoDoPapel(usuario.papel, usuario.modulos, acao);
  });
}

export type Usuario = {
  id: string;
  nome: string;
  email: string;
  /** Texto puro só porque não há backend; ver nota em Prestador.senha. */
  senha: string;
  departamento: string;
  papel: Papel;
  modulos: Modulo[];
  /** Ajuste por pessoa; null ou ausente = as do papel. Administrador tem todas. */
  permissoes?: Acao[] | null;
  ativo: boolean;
  ultimoAcesso: string | null;
};

/**
 * A pessoa pode fazer isto? Precisa estar ativa, ter a área liberada (módulo)
 * e a ação — ajustada na ficha ou, sem ajuste, a do papel.
 */
export function pode(usuario: Usuario | null, permissao: Permissao) {
  if (!usuario?.ativo) return false;
  if (permissao === "usuarios.gerenciar") return usuario.papel === "admin";
  const modulo = AREAS[ACOES[permissao].area].modulo;
  if (modulo && !usuario.modulos.includes(modulo)) return false;
  return permissoesEfetivas(usuario).includes(permissao);
}

export function veModulo(usuario: Usuario | null, modulo: Modulo) {
  return Boolean(usuario?.ativo && usuario.modulos.includes(modulo));
}

export function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}
