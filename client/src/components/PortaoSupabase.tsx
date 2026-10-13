import { CHEGOU_POR_LINK, ERRO_DO_LINK, supabase } from "@/_core/supabase/cliente";
import { MODO_DEMO, MODO_REAL } from "@/_core/supabase/modo";
import { dispensarErro, useErroSincronizacao } from "@/_core/supabase/sincronizar";
import logoPnst from "@/assets/pnst-logo.webp";
import { AlertCircle, Loader2, X } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";

/**
 * Porta de entrada do modo real: retoma a sessão do Supabase, carrega os
 * dados antes da primeira tela e trata os links de convite e de nova senha.
 * Na demonstração, só devolve o app.
 */
export default function PortaoSupabase({ children }: { children: ReactNode }) {
  if (MODO_REAL) return <Portao>{children}</Portao>;
  if (MODO_DEMO) return <>{children}</>;
  return <NaoConfigurado />;
}

/** Publicado sem as chaves: avisa em vez de abrir a demonstração. */
function NaoConfigurado() {
  return (
    <div className="acesso">
      <section className="acesso-palco">
        <div className="acesso-cartao">
          <div className="auth-badge">
            <img src={logoPnst} alt="PNST — Pacheco Neto Sanden Teisseire Advogados" />
          </div>
          <span className="accent-eyebrow">Configuração</span>
          <h2>Sistema ainda não ligado ao banco</h2>
          <p>
            Faltam as variáveis <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> na hospedagem (ou no
            <code> .env.local</code>). O passo a passo está no arquivo <code>SUPABASE.md</code> do projeto.
          </p>
        </div>
      </section>
    </div>
  );
}

function Portao({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<"carregando" | "pronto" | "definir-senha">(CHEGOU_POR_LINK ? "definir-senha" : "carregando");
  // Link de convite ou de nova senha vencido ou já usado (o Outlook às vezes
  // "abre" o link sozinho ao verificar o e-mail): avisa na tela de login.
  const [aviso, setAviso] = useState<string | null>(
    ERRO_DO_LINK ? "Este link de acesso expirou ou já foi usado. Na tela de login, use \"Esqueci minha senha\" para receber um novo." : null,
  );

  useEffect(() => {
    const { data } = supabase().auth.onAuthStateChange((evento, sessao) => {
      // Nada de await aqui dentro: o supabase-js trava se o callback esperar outra chamada dele.
      setTimeout(async () => {
        if (evento === "PASSWORD_RECOVERY") return setEstado("definir-senha");
        // As abas dividem a sessão: se outra aba entrou com outra pessoa, esta
        // recarrega para não seguir mostrando um usuário e gravando como outro.
        if (evento === "SIGNED_IN" && sessao?.user && !CHEGOU_POR_LINK) {
          const { usuarioDaAba } = await import("@/_core/supabase/autenticacao");
          const daAba = usuarioDaAba();
          if (daAba && daAba !== sessao.user.id) window.location.reload();
          return;
        }
        if (evento === "SIGNED_OUT") {
          const { limparSessaoLocal } = await import("@/_core/supabase/autenticacao");
          return limparSessaoLocal();
        }
        if (evento === "INITIAL_SESSION") {
          if (sessao?.user && !CHEGOU_POR_LINK) {
            const { prepararSessao } = await import("@/_core/supabase/autenticacao");
            const resultado = await prepararSessao(sessao.user.id);
            if (!resultado.ok) setAviso(resultado.mensagem);
          }
          setEstado((atual) => (atual === "definir-senha" ? atual : "pronto"));
        }
      }, 0);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (estado === "carregando")
    return (
      <div className="acesso">
        <div className="acesso-palco">
          <div className="acesso-cartao portao-carregando" role="status">
            <Loader2 size={20} strokeWidth={1.8} className="animate-spin" />
            <span>Carregando os dados do escritório…</span>
          </div>
        </div>
      </div>
    );
  if (estado === "definir-senha") return <DefinirSenha aoConcluir={() => setEstado("pronto")} />;
  return (
    <>
      {aviso ? <Faixa texto={aviso} aoFechar={() => setAviso(null)} /> : null}
      <ErroDeGravacao />
      {children}
    </>
  );
}

function ErroDeGravacao() {
  const erro = useErroSincronizacao();
  return erro ? <Faixa texto={`${erro} A tela voltou ao que está gravado no banco.`} aoFechar={dispensarErro} /> : null;
}

function Faixa({ texto, aoFechar }: { texto: string; aoFechar: () => void }) {
  return (
    <div className="faixa-erro" role="alert">
      <AlertCircle size={16} strokeWidth={2} />
      <span>{texto}</span>
      <button type="button" className="icon-button icon-button-pequeno" aria-label="Fechar aviso" onClick={aoFechar}>
        <X size={14} strokeWidth={2} />
      </button>
    </div>
  );
}

function DefinirSenha({ aoConcluir }: { aoConcluir: () => void }) {
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (senha.length < 10) return setErro("Use ao menos 10 caracteres.");
    if (senha !== confirmacao) return setErro("As duas senhas não são iguais.");
    setEnviando(true);
    const { definirSenha } = await import("@/_core/supabase/autenticacao");
    const resultado = await definirSenha(senha);
    setEnviando(false);
    if (!resultado.ok) return setErro(resultado.mensagem);
    // Prestador vai para o portal; equipe, para o escritório.
    window.history.replaceState(null, "", resultado.tipo === "prestador" ? "/portal" : "/");
    aoConcluir();
  }

  return (
    <div className="acesso">
      <section className="acesso-palco">
        <div className="acesso-cartao">
          <div className="auth-badge">
            <img src={logoPnst} alt="PNST — Pacheco Neto Sanden Teisseire Advogados" />
          </div>
          <span className="accent-eyebrow">{CHEGOU_POR_LINK === "convite" ? "Bem-vindo" : "Nova senha"}</span>
          <h2>Defina sua senha</h2>
          <p>Ela é só sua: nem o escritório consegue vê-la.</p>
          <form className="acesso-form" onSubmit={enviar} noValidate>
            <div className="field-group">
              <label className="field-label" htmlFor="nova-senha">
                Senha nova
              </label>
              <input id="nova-senha" className="field-input" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="new-password" />
            </div>
            <div className="field-group">
              <label className="field-label" htmlFor="nova-senha-2">
                Repita a senha
              </label>
              <input id="nova-senha-2" className="field-input" type="password" value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} autoComplete="new-password" />
            </div>
            {erro ? (
              <div className="acesso-alerta-erro" role="alert">
                <AlertCircle size={15} strokeWidth={2} />
                <span>{erro}</span>
              </div>
            ) : null}
            <button type="submit" className="button-primary button-block" disabled={enviando}>
              {enviando ? "Salvando…" : "Salvar e entrar"}
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
