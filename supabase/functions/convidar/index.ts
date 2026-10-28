// Edge Function "convidar": cria o acesso de alguém e manda o e-mail para a
// pessoa definir a própria senha. Roda no Supabase com a chave de serviço,
// que nunca vai para o navegador.
//
//   equipe    → só administrador convida; define papel, áreas e permissões.
//   prestador → quem tem "Cadastrar, editar e convidar prestadores" convida; o
//               e-mail precisa ser o do cadastro do prestador, com o portal ativo.

// Sem dependências externas: fala direto com as APIs HTTP do Auth e do banco
// (nada a baixar na hora de publicar ou de subir a função).

const PAPEIS = ["admin", "gestor", "operador", "viewer"];
const MODULOS = ["visao", "calendario", "documentos", "prestadores", "contas"];
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** Mesma regra de public.tem('prestadores.cadastro.editar') no banco. */
function podeConvidarPrestador(eu: { papel: string; modulos: string[]; permissoes: string[] | null }) {
  if (!eu.modulos?.includes("prestadores")) return false;
  if (eu.papel === "admin") return true;
  if (Array.isArray(eu.permissoes)) return eu.permissoes.includes("prestadores.cadastro.editar");
  return ["gestor", "operador"].includes(eu.papel);
}

const responder = (status: number, corpo: Record<string, unknown>) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return responder(405, { erro: "Use POST." });

  const URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICO = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const comServico = { apikey: SERVICO, Authorization: `Bearer ${SERVICO}`, "Content-Type": "application/json" };
  const banco = async (caminho: string, init: RequestInit = {}) => {
    const r = await fetch(`${URL}/rest/v1/${caminho}`, { ...init, headers: { ...comServico, ...(init.headers ?? {}) } });
    return r.ok ? (r.status === 204 ? null : r.json()) : Promise.reject(new Error(await r.text()));
  };

  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const quem = await fetch(`${URL}/auth/v1/user`, { headers: { apikey: SERVICO, Authorization: `Bearer ${jwt}` } });
  if (!quem.ok) return responder(401, { erro: "Sessão inválida. Entre de novo." });
  const { id: euId } = await quem.json();
  const [eu] = await banco(`perfis?id=eq.${euId}&select=*`);
  if (!eu?.ativo || eu.tipo !== "equipe") return responder(403, { erro: "Seu usuário não pode convidar ninguém." });

  const corpo = await req.json().catch(() => ({}));
  const email = String(corpo.email ?? "").trim().toLowerCase();
  const nome = String(corpo.nome ?? "").trim();
  const tipo = corpo.tipo === "prestador" ? "prestador" : "equipe";
  if (!/^\S+@\S+\.\S+$/.test(email)) return responder(400, { erro: "E-mail inválido." });

  let perfil: Record<string, unknown>;
  if (tipo === "equipe") {
    if (eu.papel !== "admin") return responder(403, { erro: "Só o administrador convida pessoas da equipe." });
    const papel = PAPEIS.includes(corpo.papel) ? corpo.papel : "viewer";
    const modulos = Array.isArray(corpo.modulos) ? corpo.modulos.filter((m: string) => MODULOS.includes(m)) : [];
    // null = as permissões do papel; lista = personalizadas na ficha.
    const permissoes = Array.isArray(corpo.permissoes) ? corpo.permissoes.filter((a: unknown) => typeof a === "string" && /^[a-z_.]+$/.test(a)) : null;
    perfil = { nome, departamento: String(corpo.departamento ?? ""), papel, modulos, permissoes, tipo: "equipe", prestador_id: null };
  } else {
    if (!podeConvidarPrestador(eu))
      return responder(403, { erro: "Você não tem permissão para cadastrar e convidar prestadores." });
    const [prestador] = await banco(`prestadores?id=eq.${encodeURIComponent(String(corpo.prestadorId ?? ""))}&select=id,dados`);
    if (!prestador) return responder(404, { erro: "Prestador não encontrado. Salve o cadastro antes de convidar." });
    if (String(prestador.dados?.email ?? "").trim().toLowerCase() !== email)
      return responder(400, { erro: "O e-mail do convite precisa ser o do cadastro do prestador." });
    if (!prestador.dados?.portalAtivo) return responder(400, { erro: "Ative o acesso ao portal no cadastro antes de convidar." });
    perfil = { nome: nome || prestador.dados?.nome, papel: "viewer", modulos: [], tipo: "prestador", prestador_id: prestador.id };
  }

  const redirectTo = typeof corpo.redirectTo === "string" ? `?redirect_to=${encodeURIComponent(corpo.redirectTo)}` : "";
  const convite = await fetch(`${URL}/auth/v1/invite${redirectTo}`, { method: "POST", headers: comServico, body: JSON.stringify({ email, data: { nome } }) });
  const usuario = await convite.json();
  if (!convite.ok) {
    const motivo = String(usuario.msg ?? usuario.message ?? usuario.error_description ?? convite.status);
    if (/already been registered|already exists/i.test(motivo)) return responder(409, { erro: "Já existe um acesso com este e-mail." });
    return responder(400, { erro: `O Supabase recusou o convite: ${motivo}` });
  }

  // O gatilho de cadastro criou o perfil sem permissões; aqui ele ganha as do convite.
  try {
    await banco(`perfis?id=eq.${usuario.id}`, { method: "PATCH", body: JSON.stringify(perfil), headers: { Prefer: "return=minimal" } });
  } catch (falha) {
    return responder(500, { erro: `Convite enviado, mas o perfil não foi ajustado: ${(falha as Error).message}` });
  }
  return responder(200, { ok: true });
});
