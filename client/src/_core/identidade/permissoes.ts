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
  | "contas";

export const MODULOS: Record<Modulo, string> = {
  visao: "Visão geral",
  calendario: "Calendário",
  documentos: "Documentos",
  prestadores: "Prestadores",
  contas: "Account Management",
};

export type Permissao = "registros.editar" | "registros.excluir" | "usuarios.gerenciar";

const DO_PAPEL: Record<Papel, Permissao[]> = {
  admin: ["registros.editar", "registros.excluir", "usuarios.gerenciar"],
  gestor: ["registros.editar", "registros.excluir"],
  operador: ["registros.editar"],
  viewer: [],
};

export type Usuario = {
  id: string;
  nome: string;
  email: string;
  /** Texto puro só porque não há backend; ver nota em Prestador.senha. */
  senha: string;
  departamento: string;
  papel: Papel;
  modulos: Modulo[];
  ativo: boolean;
  ultimoAcesso: string | null;
};

export function pode(usuario: Usuario | null, permissao: Permissao) {
  return Boolean(usuario?.ativo && DO_PAPEL[usuario.papel].includes(permissao));
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
