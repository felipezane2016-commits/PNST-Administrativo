import { gravarItem, useColecao } from "@/_core/armazenamento/colecao";
import { comecarDoZero, restaurarDemonstracao } from "@/_core/armazenamento/semente";
import { ACOES, acoesDaArea, AREAS, iniciais, MODULOS, PAPEIS, padraoDoPapel, permissoesEfetivas, type Acao, type Area, type Modulo, type Papel, type Usuario } from "@/_core/identidade/permissoes";
import { sessaoAdmin, useUsuarioAtual, usuarios } from "@/_core/identidade/sessao";
import { formatarDataHora, gerarId } from "@/_core/tempo";
import Cabecalho from "@/admin/componentes/Cabecalho";
import Campo from "@/admin/componentes/Campo";
import { usarModal } from "@/admin/componentes/usarModal";
import Selo from "@/admin/componentes/Selo";
import { MODO_REAL } from "@/_core/supabase/modo";
import { ChevronRight, Eraser, Mail, Plus, RotateCcw, Search, UserRound, X } from "lucide-react";
import { useState, type FormEvent } from "react";

const DEPARTAMENTOS = ["Jurídico", "Operações", "Financeiro", "TI", "RH", "Administrativo"];

export default function Usuarios() {
  const lista = useColecao(usuarios);
  const atual = useUsuarioAtual();
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<Usuario | "novo" | null>(null);
  // Ações que apagam dados pedem um segundo clique: o primeiro só arma.
  const [confirmando, setConfirmando] = useState<"restaurar" | "zerar" | null>(null);

  function executar(acao: "restaurar" | "zerar") {
    if (confirmando !== acao) return setConfirmando(acao);
    // A sessão é uma coleção também: guarda quem está logado e devolve.
    const usuarioId = sessaoAdmin.ler().usuarioId;
    if (acao === "restaurar") restaurarDemonstracao();
    else comecarDoZero();
    sessaoAdmin.atualizar(() => ({ usuarioId }));
    setConfirmando(null);
  }
  const termo = busca.trim().toLowerCase();
  const visiveis = lista.filter((usuario) => !termo || `${usuario.nome} ${usuario.email} ${usuario.departamento}`.toLowerCase().includes(termo));
  const ativos = lista.filter((usuario) => usuario.ativo).length;

  return (
    <>
      <Cabecalho
        rotulo="Administração"
        titulo="Usuários e acessos"
        descricao={`${ativos} usuário(s) ativo(s). O papel define o que a pessoa pode fazer; os módulos, onde ela entra.`}
        acoes={
          <>
            {MODO_REAL ? null : (
              <>
            <button type="button" className="button-secondary" onClick={() => executar("zerar")} onBlur={() => setConfirmando(null)}>
              <Eraser size={15} strokeWidth={2.2} /> {confirmando === "zerar" ? "Confirmar: esvaziar tudo" : "Começar do zero"}
            </button>
            <button type="button" className="button-secondary" onClick={() => executar("restaurar")} onBlur={() => setConfirmando(null)}>
              <RotateCcw size={15} strokeWidth={2.2} /> {confirmando === "restaurar" ? "Confirmar: apagar alterações" : "Restaurar demonstração"}
            </button>
              </>
            )}
            <button type="button" className="button-primary" onClick={() => setEditando("novo")}>
              <Plus size={15} strokeWidth={2.2} /> {MODO_REAL ? "Convidar usuário" : "Novo usuário"}
            </button>
          </>
        }
      />
      <section className="operations-surface">
        <div className="surface-toolbar">
          <label className="inline-search">
            <Search size={15} strokeWidth={1.9} />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, e-mail ou departamento" aria-label="Buscar usuários" />
          </label>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Usuário</th>
                <th>Departamento</th>
                <th>Papel</th>
                <th>Áreas e permissões</th>
                <th>Status</th>
                <th>Último acesso</th>
                <th>
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((usuario) => (
                <tr key={usuario.id}>
                  <td>
                    <div className="inline-row inline-row-fixo">
                      <span className="avatar" aria-hidden="true">
                        {iniciais(usuario.nome)}
                      </span>
                      <div className="cell-main">
                        <strong>{usuario.nome}</strong>
                        <span>{usuario.email}</span>
                      </div>
                    </div>
                  </td>
                  <td>{usuario.departamento}</td>
                  <td>{PAPEIS[usuario.papel].nome}</td>
                  <td className="celula-quebra">
                    <div className="inline-row inline-row-justo">
                      {usuario.modulos.map((modulo) => (
                        <span key={modulo} className="status-pill status-neutral">
                          {MODULOS[modulo]}
                        </span>
                      ))}
                    </div>
                    <span className="texto-apoio">
                      {usuario.papel === "admin" ? "Todas as permissões" : usuario.permissoes ? `Permissões personalizadas (${permissoesEfetivas(usuario).length})` : "Permissões do papel"}
                    </span>
                  </td>
                  <td>{usuario.ativo ? <Selo tom="green">Ativo</Selo> : <Selo tom="neutral">Inativo</Selo>}</td>
                  <td>{usuario.ultimoAcesso ? formatarDataHora(usuario.ultimoAcesso) : "—"}</td>
                  <td>
                    <div className="cell-actions">
                      <button type="button" className="text-button" onClick={() => setEditando(usuario)}>
                        Editar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {editando ? (
        <FormularioUsuario usuario={editando === "novo" ? null : editando} todos={lista} euId={atual?.id ?? ""} aoFechar={() => setEditando(null)} />
      ) : null}
    </>
  );
}

type Erros = Partial<Record<"nome" | "email" | "senha" | "modulos" | "papel", string>>;

function FormularioUsuario({ usuario, todos, euId, aoFechar }: { usuario: Usuario | null; todos: Usuario[]; euId: string; aoFechar: () => void }) {
  const [dados, setDados] = useState<Usuario>(
    usuario ?? { id: gerarId("usr"), nome: "", email: "", senha: "", departamento: "Operações", papel: "operador", modulos: ["visao", "pagamentos"], ativo: true, ultimoAcesso: null },
  );
  const [novaSenha, setNovaSenha] = useState("");
  const [erros, setErros] = useState<Erros>({});
  const [enviando, setEnviando] = useState(false);
  const [erroConvite, setErroConvite] = useState<string | null>(null);
  const souEu = usuario?.id === euId;
  const raiz = usarModal(aoFechar);
  const convite = MODO_REAL && !usuario;

  function alternarModulo(modulo: Modulo) {
    setDados((atual) => ({
      ...atual,
      modulos: atual.modulos.includes(modulo) ? atual.modulos.filter((item) => item !== modulo) : [...atual.modulos, modulo],
    }));
    setErros((atual) => ({ ...atual, modulos: undefined }));
  }

  async function salvar(evento?: FormEvent) {
    evento?.preventDefault();
    const encontrados: Erros = {};
    if (!dados.nome.trim()) encontrados.nome = "Informe o nome.";
    if (!/^\S+@\S+\.\S+$/.test(dados.email)) encontrados.email = "E-mail inválido.";
    else if (todos.some((item) => item.id !== dados.id && item.email.toLowerCase() === dados.email.toLowerCase()))
      encontrados.email = "Já existe um usuário com este e-mail.";
    // No modo real a senha é da pessoa: ela cria pelo link do convite.
    if (!MODO_REAL && (!usuario || novaSenha) && novaSenha.length < 6) encontrados.senha = "Mínimo de 6 caracteres.";
    if (dados.modulos.length === 0) encontrados.modulos = "Libere ao menos uma área.";
    // Quem edita a si mesmo não pode se rebaixar nem se desativar: ficaria sem
    // ninguém para desfazer o erro.
    if (souEu && (dados.papel !== "admin" || !dados.ativo)) encontrados.papel = "Você não pode tirar o próprio acesso de administrador.";
    if (Object.values(encontrados).some(Boolean)) {
      setErros(encontrados);
      return;
    }
    if (convite) {
      setEnviando(true);
      const { convidar } = await import("@/_core/supabase/autenticacao");
      const erro = await convidar({ tipo: "equipe", email: dados.email.trim(), nome: dados.nome.trim(), departamento: dados.departamento, papel: dados.papel, modulos: dados.modulos, permissoes: dados.permissoes ?? null });
      setEnviando(false);
      if (erro) return setErroConvite(erro);
      aoFechar();
      return;
    }
    usuarios.atualizar((lista) => gravarItem(lista, { ...dados, nome: dados.nome.trim(), email: dados.email.trim(), senha: novaSenha || dados.senha }));
    aoFechar();
  }

  const areasLiberadas = (Object.keys(AREAS) as Area[]).filter((area) => !AREAS[area].modulo || dados.modulos.includes(AREAS[area].modulo!));
  const total = permissoesEfetivas(dados).filter((acao) => areasLiberadas.includes(ACOES[acao].area)).length;

  return (
    <div className="modal-backdrop" onMouseDown={(evento) => evento.target === evento.currentTarget && aoFechar()}>
      <div ref={raiz} className="modal-panel ficha-usuario" role="dialog" aria-modal="true" aria-labelledby="ficha-usuario-titulo">
        <header className="ficha-usuario-topo">
          <span className="avatar avatar-grande" aria-hidden="true">
            {dados.nome.trim() ? iniciais(dados.nome) : <UserRound size={20} strokeWidth={1.8} />}
          </span>
          <div className="ficha-usuario-identidade">
            <span className="eyebrow">{usuario ? "Usuários e acessos" : convite ? "Convidar usuário" : "Novo usuário"}</span>
            <h2 id="ficha-usuario-titulo">{dados.nome.trim() || (convite ? "Convidar para a equipe" : "Novo usuário")}</h2>
            <span className="ficha-usuario-meta">
              {dados.email || "sem e-mail"} · <Selo tom={dados.papel === "admin" ? "amber" : "neutral"}>{PAPEIS[dados.papel].nome}</Selo>{" "}
              {dados.ativo ? <Selo tom="green">Ativo</Selo> : <Selo tom="neutral">Inativo</Selo>}
            </span>
          </div>
          <button type="button" className="icon-button" aria-label="Fechar" data-fechar onClick={aoFechar}>
            <X size={17} strokeWidth={2} />
          </button>
        </header>

        <form className="ficha-usuario-corpo" onSubmit={(evento) => void salvar(evento)} noValidate>
          {erroConvite ? (
            <div className="acesso-alerta-erro ficha-usuario-cheio" role="alert">
              <span>{erroConvite}</span>
            </div>
          ) : null}
          {convite ? (
            <p className="acesso-alerta-info ficha-usuario-cheio">
              <Mail size={15} strokeWidth={2} />
              <span>A pessoa recebe um e-mail com o link para criar a própria senha.</span>
            </p>
          ) : null}

          <div className="ficha-usuario-coluna">
            <section className="ficha-secao">
              <h3>Dados da pessoa</h3>
              <Campo id="us-nome" rotulo="Nome completo" erro={erros.nome}>
                {(aria) => <input {...aria} className="field-input" value={dados.nome} onChange={(e) => setDados({ ...dados, nome: e.target.value })} />}
              </Campo>
              <Campo id="us-email" rotulo="E-mail" erro={erros.email} dica={MODO_REAL && usuario ? "O e-mail é o login e não muda por aqui." : undefined}>
                {(aria) => (
                  <input {...aria} className="field-input" type="email" value={dados.email} disabled={MODO_REAL && Boolean(usuario)} onChange={(e) => setDados({ ...dados, email: e.target.value })} />
                )}
              </Campo>
              <Campo id="us-departamento" rotulo="Departamento">
                {(aria) => (
                  <select {...aria} className="field-input" value={dados.departamento} onChange={(e) => setDados({ ...dados, departamento: e.target.value })}>
                    {DEPARTAMENTOS.map((departamento) => (
                      <option key={departamento}>{departamento}</option>
                    ))}
                  </select>
                )}
              </Campo>
              {MODO_REAL ? null : (
                <Campo id="us-senha" rotulo="Senha" erro={erros.senha} dica={usuario ? "Em branco mantém a atual." : "Mínimo de 6 caracteres."}>
                  {(aria) => <input {...aria} className="field-input" type="password" value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} autoComplete="new-password" />}
                </Campo>
              )}
            </section>

            <section className="ficha-secao">
              <h3>Situação</h3>
              <div className="toggle-row">
                <div>
                  <strong className="field-label" id="us-ativo-rotulo">
                    Usuário ativo
                  </strong>
                  <p className="field-hint">Inativo perde o acesso na hora, mesmo com a sessão aberta.</p>
                </div>
                <button type="button" className="switch" role="switch" aria-checked={dados.ativo} aria-labelledby="us-ativo-rotulo" onClick={() => setDados({ ...dados, ativo: !dados.ativo })} />
              </div>
              {usuario?.ultimoAcesso ? <p className="field-hint">Último acesso em {formatarDataHora(usuario.ultimoAcesso)}.</p> : null}
            </section>
          </div>

          <div className="ficha-usuario-coluna">
            <section className="ficha-secao">
              <h3>Papel</h3>
              <div className="papel-opcoes" role="radiogroup" aria-label="Papel">
                {(Object.keys(PAPEIS) as Papel[]).map((papel) => (
                  <label key={papel} className={dados.papel === papel ? "papel-opcao papel-opcao-ativa" : "papel-opcao"}>
                    <input
                      type="radio"
                      name="us-papel"
                      value={papel}
                      checked={dados.papel === papel}
                      onChange={() => {
                        setDados({ ...dados, papel });
                        setErros((atual) => ({ ...atual, papel: undefined }));
                      }}
                    />
                    <strong>{PAPEIS[papel].nome}</strong>
                    <span>{PAPEIS[papel].descricao}</span>
                  </label>
                ))}
              </div>
              {erros.papel ? (
                <span className="field-error" role="alert">
                  {erros.papel}
                </span>
              ) : null}
            </section>

            <Permissoes dados={dados} erroModulos={erros.modulos} alternarModulo={alternarModulo} mudar={(permissoes) => setDados((atual) => ({ ...atual, permissoes }))} />
          </div>

          <footer className="ficha-usuario-rodape">
            <span className="field-hint">
              {dados.papel === "admin" ? "Tudo liberado" : `${total} permissões`} em {areasLiberadas.length} área(s){dados.modulos.includes("visao") ? " + Visão geral" : ""}
            </span>
            <button type="button" className="button-secondary" onClick={aoFechar}>
              Cancelar
            </button>
            <button type="submit" className="button-primary" disabled={enviando}>
              {convite ? (enviando ? "Enviando…" : "Enviar convite") : usuario ? "Salvar alterações" : "Criar usuário"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

/**
 * Permissões da pessoa: cada área tem a chave de acesso (módulo) e as ações.
 * Sem mexer, valem as do papel; ao marcar ou desmarcar qualquer caixa, a ficha
 * passa a ter permissões personalizadas (dá para voltar ao padrão).
 */
function Permissoes({
  dados,
  erroModulos,
  alternarModulo,
  mudar,
}: {
  dados: Usuario;
  erroModulos?: string;
  alternarModulo: (modulo: Modulo) => void;
  mudar: (permissoes: Acao[] | null) => void;
}) {
  const admin = dados.papel === "admin";
  const efetivas = new Set(permissoesEfetivas(dados));
  const personalizadas = Boolean(dados.permissoes) && !admin;
  const [aberta, setAberta] = useState<Area | null>("prestadores");

  function alternar(acao: Acao) {
    const atuais = new Set(permissoesEfetivas(dados));
    if (atuais.has(acao)) atuais.delete(acao);
    else atuais.add(acao);
    mudar(Array.from(atuais));
  }

  function marcarArea(area: Area, marcar: boolean) {
    const atuais = new Set(permissoesEfetivas(dados));
    acoesDaArea(area).forEach((acao) => (marcar ? atuais.add(acao) : atuais.delete(acao)));
    mudar(Array.from(atuais));
  }

  return (
    <section className="ficha-secao" aria-describedby={erroModulos ? "us-modulos-erro" : undefined}>
      <div className="ficha-secao-topo">
        <h3>Áreas e permissões</h3>
        {admin ? (
          <Selo tom="amber">Tudo liberado</Selo>
        ) : personalizadas ? (
          <span className="inline-row">
            <Selo tom="blue">Personalizadas</Selo>
            <button type="button" className="text-button" onClick={() => mudar(null)}>
              <RotateCcw size={13} strokeWidth={2} /> Padrão do papel
            </button>
          </span>
        ) : (
          <Selo tom="neutral">Padrão do papel</Selo>
        )}
      </div>
      <p className="field-hint">
        {admin
          ? "Administrador faz tudo nas áreas ligadas abaixo e gerencia usuários. Desligue uma área para tirar o acesso."
          : "Ligue as áreas que a pessoa usa e marque o que ela pode fazer em cada uma. Itens em laranja diferem do padrão do papel."}
      </p>

      <div className="area-linha area-linha-simples">
        <span className="area-linha-nome">
          <strong>{MODULOS.visao}</strong>
          <span>Painel inicial do escritório</span>
        </span>
        <button type="button" className="switch" role="switch" aria-checked={dados.modulos.includes("visao")} aria-label={`Acesso à ${MODULOS.visao}`} onClick={() => alternarModulo("visao")} />
      </div>

      {(Object.keys(AREAS) as Area[]).map((area) => {
        const { nome, modulo } = AREAS[area];
        const liberada = !modulo || dados.modulos.includes(modulo);
        const acoes = acoesDaArea(area);
        const marcadas = acoes.filter((acao) => efetivas.has(acao)).length;
        const expandida = aberta === area && liberada && !admin;
        return (
          <div className={liberada ? "area-linha" : "area-linha area-linha-fechada"} key={area}>
            <div className="area-linha-topo">
              <button
                type="button"
                className="area-linha-abrir"
                aria-expanded={expandida}
                disabled={!liberada || admin}
                onClick={() => setAberta(expandida ? null : area)}
              >
                {liberada && !admin ? <ChevronRight size={15} strokeWidth={2} className={expandida ? "girar-90" : undefined} aria-hidden="true" /> : null}
                <span className="area-linha-nome">
                  <strong>{nome}</strong>
                  <span>{!liberada ? "Sem acesso" : admin ? "Tudo liberado" : `${marcadas} de ${acoes.length} permissões`}</span>
                </span>
              </button>
              {modulo ? (
                <button type="button" className="switch" role="switch" aria-checked={liberada} aria-label={`Acesso à área ${nome}`} onClick={() => alternarModulo(modulo)} />
              ) : (
                <span className="field-hint">Toda a equipe</span>
              )}
            </div>
            {expandida ? (
              <div className="area-linha-corpo">
                <div className="area-linha-atalhos">
                  <button type="button" className="text-button" onClick={() => marcarArea(area, true)}>
                    Marcar todas
                  </button>
                  <button type="button" className="text-button text-button-neutro" onClick={() => marcarArea(area, false)}>
                    Desmarcar todas
                  </button>
                </div>
                <ul className="permissoes-lista">
                  {acoes.map((acao) => (
                    <li key={acao}>
                      <label className={padraoDoPapel(dados.papel, dados.modulos, acao) === efetivas.has(acao) ? "permissao" : "permissao permissao-alterada"}>
                        <input type="checkbox" checked={efetivas.has(acao)} onChange={() => alternar(acao)} />
                        <span>{ACOES[acao].nome}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        );
      })}
      {erroModulos ? (
        <span id="us-modulos-erro" className="field-error" role="alert">
          {erroModulos}
        </span>
      ) : null}
    </section>
  );
}
