import { criarColecao, useColecao } from "@/_core/armazenamento/colecao";
import { MODO_REAL } from "@/_core/supabase/modo";
import { ACOES, MODULOS, type Acao, type Modulo, type Usuario } from "./permissoes";

const MODULOS_TODOS: Modulo[] = [
  "visao",
  "calendario",
  "documentos",
  "prestadores",
  "contas",
];

/** Pessoas fictícias: o link do protótipo é compartilhável. */
export const USUARIOS_DEMO: Usuario[] = [
  {
    id: "usr-fernanda",
    nome: "Fernanda Moraes",
    email: "fernanda@nexus.demo",
    senha: "nexus2026",
    departamento: "Administrativo",
    papel: "admin",
    modulos: MODULOS_TODOS,
    ativo: true,
    ultimoAcesso: "2026-06-30T08:12:00.000Z",
  },
  {
    id: "usr-felipe",
    nome: "Felipe Zanetti",
    email: "felipe@nexus.demo",
    senha: "nexus2026",
    departamento: "Account Management",
    papel: "admin",
    modulos: MODULOS_TODOS,
    ativo: true,
    ultimoAcesso: null,
  },
  {
    id: "usr-ricardo",
    nome: "Ricardo Alves",
    email: "ricardo@nexus.demo",
    senha: "nexus2026",
    departamento: "Operações",
    papel: "gestor",
    modulos: ["visao", "calendario", "documentos", "prestadores", "contas"],
    ativo: true,
    ultimoAcesso: "2026-06-29T17:40:00.000Z",
  },
  {
    id: "usr-marcos",
    nome: "Marcos Teixeira",
    email: "marcos@nexus.demo",
    senha: "nexus2026",
    departamento: "Chefe da Administração",
    papel: "gestor",
    modulos: ["visao", "calendario", "documentos", "contas"],
    ativo: true,
    ultimoAcesso: "2026-06-30T08:40:00.000Z",
  },
  {
    id: "usr-helena",
    nome: "Helena Prado",
    email: "helena@nexus.demo",
    senha: "nexus2026",
    departamento: "Operações",
    papel: "operador",
    modulos: ["calendario", "prestadores"],
    ativo: true,
    ultimoAcesso: "2026-06-30T09:05:00.000Z",
  },
  {
    id: "usr-caio",
    nome: "Caio Lemos",
    email: "caio@nexus.demo",
    senha: "nexus2026",
    departamento: "Financeiro",
    papel: "viewer",
    modulos: ["visao", "prestadores", "contas"],
    ativo: true,
    ultimoAcesso: "2026-06-26T11:20:00.000Z",
  },
  {
    id: "usr-bianca",
    nome: "Bianca Torres",
    email: "bianca@nexus.demo",
    senha: "nexus2026",
    departamento: "RH",
    papel: "operador",
    modulos: ["visao", "calendario", "documentos"],
    ativo: false,
    ultimoAcesso: "2026-03-14T10:00:00.000Z",
  },
];

/**
 * Modo real: a lista vem da tabela `perfis` (só a equipe; prestadores ficam
 * no portal). Gente nova entra por convite, nunca por esta lista — por isso
 * só se alteram perfis existentes, e a senha não existe aqui.
 */
export const usuarios = criarColecao<Usuario[]>("usuarios", () => USUARIOS_DEMO, {
  remota: {
    tipo: "lista",
    tabela: "perfis",
    somenteAlterar: true,
    deLinha: (linha) =>
      linha.tipo === "equipe"
        ? {
            id: linha.id,
            nome: linha.nome,
            email: linha.email,
            senha: "",
            departamento: linha.departamento,
            papel: linha.papel,
            // Só módulos que existem hoje (um módulo retirado some do perfil).
            modulos: (linha.modulos as string[]).filter((modulo): modulo is Modulo => modulo in MODULOS),
            // Só ações que existem hoje; null = as do papel.
            permissoes: Array.isArray(linha.permissoes) ? (linha.permissoes as string[]).filter((acao): acao is Acao => acao in ACOES) : null,
            ativo: linha.ativo,
            ultimoAcesso: linha.ultimo_acesso,
          }
        : null,
    paraLinha: (usuario: Usuario) => ({
      id: usuario.id,
      nome: usuario.nome,
      departamento: usuario.departamento,
      papel: usuario.papel,
      modulos: usuario.modulos,
      permissoes: usuario.permissoes ?? null,
      ativo: usuario.ativo,
    }),
  },
});

type Sessao = { usuarioId: string | null };
export const sessaoAdmin = criarColecao<Sessao>("sessao-admin", () => ({ usuarioId: null }));

/** Usuário logado — desativado no meio da sessão perde o acesso na hora. */
export function useUsuarioAtual(): Usuario | null {
  const sessao = useColecao(sessaoAdmin);
  const lista = useColecao(usuarios);
  return lista.find((usuario) => usuario.id === sessao.usuarioId && usuario.ativo) ?? null;
}

export async function entrar(email: string, senha: string): Promise<{ ok: true } | { ok: false; mensagem: string }> {
  if (MODO_REAL) {
    const { entrarComSenha } = await import("@/_core/supabase/autenticacao");
    const resultado = await entrarComSenha(email, senha, "equipe");
    return resultado.ok ? { ok: true } : resultado;
  }
  const alvo = email.trim().toLowerCase();
  const usuario = usuarios.ler().find((item) => item.email.toLowerCase() === alvo);
  if (!usuario || usuario.senha !== senha) return { ok: false, mensagem: "E-mail ou senha incorretos." };
  if (!usuario.ativo) return { ok: false, mensagem: "Este usuário está inativo. Fale com um administrador." };
  const agora = new Date().toISOString();
  usuarios.atualizar((lista) => lista.map((item) => (item.id === usuario.id ? { ...item, ultimoAcesso: agora } : item)));
  sessaoAdmin.atualizar(() => ({ usuarioId: usuario.id }));
  return { ok: true };
}

export function sair() {
  if (MODO_REAL) {
    void import("@/_core/supabase/autenticacao").then(({ sair: sairReal }) => sairReal());
    return;
  }
  sessaoAdmin.atualizar(() => ({ usuarioId: null }));
}

