import { sessaoAdmin } from "@/_core/identidade/sessao";
import { sessaoPortal } from "@/contexts/PortalContext";
import { encerrarAbaIsolada, supabase } from "./cliente";
import { iniciarSincronizacao, pararSincronizacao } from "./sincronizar";

/**
 * Login de verdade (modo real). A senha nunca passa pelo app: o Supabase Auth
 * guarda o hash, emite a sessão e o banco sabe quem é quem por `auth.uid()`.
 * O perfil (papel, módulos, prestador) vem da tabela `perfis`.
 */

export type Resultado = { ok: true; tipo: "equipe" | "prestador" } | { ok: false; mensagem: string };

let sessaoAtual: { usuarioId: string; pronta: Promise<Resultado> } | null = null;

/** Quem esta aba carregou (para notar quando outra aba troca de usuário). */
export const usuarioDaAba = () => sessaoAtual?.usuarioId ?? null;

/** Carrega perfil e dados do usuário logado. Idempotente por usuário. */
export function prepararSessao(usuarioId: string): Promise<Resultado> {
  if (sessaoAtual?.usuarioId === usuarioId) return sessaoAtual.pronta;
  const pronta = (async (): Promise<Resultado> => {
    const { data: perfil, error } = await supabase().from("perfis").select("*").eq("id", usuarioId).maybeSingle();
    if (error || !perfil) return recusar("Seu usuário ainda não tem perfil no sistema. Fale com um administrador.");
    if (!perfil.ativo) return recusar("Este usuário está inativo. Fale com um administrador.");
    if (perfil.tipo === "prestador" && !perfil.prestador_id) return recusar("Seu acesso ao portal não está ligado a um prestador.");
    await iniciarSincronizacao();
    if (perfil.tipo === "equipe") {
      sessaoAdmin.atualizar(() => ({ usuarioId }));
      void supabase().rpc("registrar_acesso");
      return { ok: true, tipo: "equipe" };
    }
    sessaoPortal.atualizar(() => ({ prestadorId: perfil.prestador_id }));
    void supabase().rpc("registrar_acesso");
    return { ok: true, tipo: "prestador" };
  })();
  sessaoAtual = { usuarioId, pronta };
  return pronta;
}

async function recusar(mensagem: string): Promise<Resultado> {
  sessaoAtual = null;
  await supabase().auth.signOut({ scope: "local" });
  return { ok: false, mensagem };
}

function mensagemDeLogin(mensagem: string) {
  if (/invalid login credentials/i.test(mensagem)) return "E-mail ou senha incorretos.";
  if (/email not confirmed/i.test(mensagem)) return "Confirme o e-mail pelo link do convite antes de entrar.";
  if (/rate limit|too many/i.test(mensagem)) return "Muitas tentativas. Espere alguns minutos e tente de novo.";
  if (/session missing|session_not_found|session from session_id/i.test(mensagem))
    return "O acesso deste link foi encerrado. Na tela de login, use \"Esqueci minha senha\" para receber um link novo.";
  if (/same.*password|different from the old/i.test(mensagem)) return "A senha nova precisa ser diferente da anterior.";
  if (/password should be|weak password/i.test(mensagem)) return "Senha fraca: use ao menos 10 caracteres, misturando letras e números.";
  return mensagem;
}

/** Entrar com e-mail e senha. `esperado` barra a equipe no portal e o prestador no escritório. */
export async function entrarComSenha(email: string, senha: string, esperado: "equipe" | "prestador"): Promise<Resultado> {
  const { data, error } = await supabase().auth.signInWithPassword({ email: email.trim(), password: senha });
  if (error || !data.user) return { ok: false, mensagem: mensagemDeLogin(error?.message ?? "Não foi possível entrar.") };
  const resultado = await prepararSessao(data.user.id);
  if (resultado.ok && resultado.tipo !== esperado) {
    await sair();
    return {
      ok: false,
      mensagem: esperado === "equipe" ? "Este acesso é do Portal do Prestador: entre por lá." : "Este acesso é do escritório: entre pelo login do escritório.",
    };
  }
  return resultado;
}

/** Limpa o que está na tela (sessão expirada, revogada ou saída). */
export async function limparSessaoLocal() {
  sessaoAtual = null;
  await pararSincronizacao();
  sessaoAdmin.atualizar(() => ({ usuarioId: null }));
  sessaoPortal.atualizar(() => ({ prestadorId: null }));
}

/** Sai só deste navegador: os outros aparelhos da pessoa continuam logados. */
export async function sair() {
  await limparSessaoLocal();
  await supabase().auth.signOut({ scope: "local" });
  encerrarAbaIsolada();
}

/** "Esqueci minha senha": o Supabase manda o link; ele volta para o app. */
export async function pedirNovaSenha(email: string) {
  const { error } = await supabase().auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
  return error ? mensagemDeLogin(error.message) : null;
}

export async function definirSenha(senha: string): Promise<Resultado> {
  const { data, error } = await supabase().auth.updateUser({ password: senha });
  if (error || !data.user) return { ok: false, mensagem: mensagemDeLogin(error?.message ?? "Não foi possível definir a senha.") };
  return prepararSessao(data.user.id);
}

/** Convite por e-mail (Edge Function `convidar`, que usa a chave de serviço no servidor). */
export async function convidar(dados: {
  email: string;
  nome: string;
  tipo: "equipe" | "prestador";
  departamento?: string;
  papel?: string;
  modulos?: string[];
  permissoes?: string[] | null;
  prestadorId?: string;
}): Promise<string | null> {
  const { data, error } = await supabase().functions.invoke("convidar", { body: { ...dados, redirectTo: window.location.origin } });
  if (error) {
    // A função responde { erro } com status 4xx; o supabase-js embrulha num FunctionsHttpError.
    const corpo = await (error as { context?: Response }).context?.json?.().catch(() => null);
    return corpo?.erro ?? "Não foi possível enviar o convite. A função `convidar` foi publicada no Supabase?";
  }
  return data?.erro ?? null;
}
