import { PAPEIS } from "@/_core/identidade/permissoes";
import { entrar, USUARIOS_DEMO, useUsuarioAtual } from "@/_core/identidade/sessao";
import { AlertCircle, Eye, EyeOff, Info } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, Redirect, useLocation } from "wouter";
import logoPnst from "@/assets/pnst-logo.webp";
import { MODO_REAL } from "@/_core/supabase/modo";
import EsqueciSenha from "@/components/EsqueciSenha";
import { marcarChegada } from "@/admin/RotasAdmin";

export default function Entrar() {
  const usuario = useUsuarioAtual();
  const [, navegar] = useLocation();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (usuario) return <Redirect to="/" />;

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setEnviando(true);
    const resultado = await entrar(email, senha);
    setEnviando(false);
    if (!resultado.ok) {
      setErro(resultado.mensagem);
      return;
    }
    setErro(null);
    marcarChegada();
    navegar("/");
  }

  return (
    <div className="acesso">

      <section className="acesso-palco">
        <div className="acesso-cartao">
          <div className="auth-badge">
            <img src={logoPnst} alt="PNST — Pacheco Neto Sanden Teisseire Advogados" />
          </div>
          <span className="accent-eyebrow">Escritório · Entrar</span>
          <h2>Bem-vindo de volta</h2>
          <p>Entre com o e-mail corporativo.</p>

          <form className="acesso-form" onSubmit={enviar} noValidate>
            <div className="field-group">
              <label className="field-label" htmlFor="admin-email">
                E-mail
              </label>
              <input
                id="admin-email"
                className="field-input"
                type="email"
                value={email}
                onChange={(evento) => setEmail(evento.target.value)}
                autoComplete="username"
                aria-invalid={erro ? true : undefined}
                aria-describedby={erro ? "admin-erro" : undefined}
              />
            </div>
            <div className="field-group">
              <label className="field-label" htmlFor="admin-senha">
                Senha
              </label>
              <div className="campo-senha">
                <input
                  id="admin-senha"
                  className="field-input"
                  type={mostrarSenha ? "text" : "password"}
                  value={senha}
                  onChange={(evento) => setSenha(evento.target.value)}
                  autoComplete="current-password"
                  aria-invalid={erro ? true : undefined}
                  aria-describedby={erro ? "admin-erro" : undefined}
                />
                <button
                  type="button"
                  className="icon-button"
                  aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
                  aria-pressed={mostrarSenha}
                  onClick={() => setMostrarSenha((atual) => !atual)}
                >
                  {mostrarSenha ? <EyeOff size={16} strokeWidth={1.9} /> : <Eye size={16} strokeWidth={1.9} />}
                </button>
              </div>
            </div>

            {erro ? (
              <div id="admin-erro" className="acesso-alerta-erro" role="alert">
                <AlertCircle size={15} strokeWidth={2} />
                <span>{erro}</span>
              </div>
            ) : null}

            <button type="submit" className="button-primary button-block" disabled={enviando}>
              {enviando ? "Entrando…" : "Entrar"}
            </button>

            {MODO_REAL ? (
              <EsqueciSenha emailInicial={email} />
            ) : (
              <>
            <div className="acesso-alerta-info">
              <Info size={15} strokeWidth={2} />
              <span>
                <strong>Ambiente de demonstração.</strong> Senha <code>nexus2026</code> para todas as contas. Cada uma mostra
                um papel diferente:
              </span>
            </div>
            <div className="filter-chips" role="group" aria-label="Contas de demonstração">
              {USUARIOS_DEMO.filter((item) => item.ativo).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="filter-chip"
                  onClick={() => {
                    setEmail(item.email);
                    setSenha(item.senha);
                    setErro(null);
                  }}
                >
                  {item.nome.split(" ")[0]} · {PAPEIS[item.papel].nome}
                </button>
              ))}
            </div>
              </>
            )}
          </form>

          <p className="acesso-rodape">
            É prestador de serviço? <Link href="/portal/login">Entrar no Portal do Prestador</Link>
          </p>
        </div>
      </section>
    </div>
  );
}
