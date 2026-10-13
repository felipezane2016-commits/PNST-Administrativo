import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { CONFIG_SUPABASE, MODO_REAL } from "./modo";

/**
 * O link do convite e o de "esqueci a senha" chegam com `#...type=invite` ou
 * `type=recovery` na URL. O supabase-js consome e apaga esse trecho ao
 * iniciar, então ele é lido antes — é o que decide mostrar "Defina sua senha".
 */
const hashInicial = typeof window !== "undefined" ? window.location.hash : "";
export const CHEGOU_POR_LINK: "convite" | "recuperacao" | null = /type=invite/.test(hashInicial)
  ? "convite"
  : /type=recovery/.test(hashInicial)
    ? "recuperacao"
    : null;

const parametros = new URLSearchParams(hashInicial.replace(/^#/, ""));

/**
 * As abas de um navegador dividem uma sessão só. A aba aberta por um link de
 * convite ou de nova senha ganha sessão própria (guardada só nela): assim ela
 * não toma o lugar de quem está logado nas outras abas, e um "Sair" lá não
 * derruba a pessoa que está criando a senha aqui. Vale até a aba fechar ou sair.
 */
const MARCA_ABA_ISOLADA = "pnst-aba-do-link";
function abaIsolada() {
  try {
    if (CHEGOU_POR_LINK) sessionStorage.setItem(MARCA_ABA_ISOLADA, "1");
    return sessionStorage.getItem(MARCA_ABA_ISOLADA) === "1";
  } catch {
    return false;
  }
}
export function encerrarAbaIsolada() {
  try {
    sessionStorage.removeItem(MARCA_ABA_ISOLADA);
  } catch {
    /* sem sessionStorage: nada a limpar */
  }
}

/** O link veio com erro (expirado, já usado)? O Supabase manda error_description no hash. */
export const ERRO_DO_LINK = parametros.get("error_description")?.replace(/\+/g, " ") ?? null;

let cliente: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!MODO_REAL) throw new Error("Supabase não configurado: defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.");
  const isolada = typeof window !== "undefined" && abaIsolada();
  cliente ??= createClient(CONFIG_SUPABASE.url, CONFIG_SUPABASE.chave, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      ...(isolada ? { storage: window.sessionStorage, storageKey: "pnst-sessao-do-link" } : {}),
    },
  });
  return cliente;
}
