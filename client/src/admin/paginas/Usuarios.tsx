import { gravarItem, useColecao } from "@/_core/armazenamento/colecao";
import { comecarDoZero, restaurarDemonstracao } from "@/_core/armazenamento/semente";
import { ACOES, acoesDaArea, AREAS, iniciais, MODULOS, PAPEIS, padraoDoPapel, permissoesEfetivas, type Acao, type Area, type Modulo, type Papel, type Usuario } from "@/_core/identidade/permissoes";
import { sessaoAdmin, useUsuarioAtual, usuarios } from "@/_core/identidade/sessao";
import { formatarDataHora, gerarId } from "@/_core/tempo";
import Cabecalho from "@/admin/componentes/Cabecalho";
import Campo from "@/admin/componentes/Campo";
import Painel from "@/admin/componentes/Painel";
import Selo from "@/admin/componentes/Selo";
import { MODO_REAL } from "@/_core/supabase/modo";
import { Eraser, Plus, RotateCcw, Search } from "lucide-react";
import { useState } from "react";

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
    usuario ?? { id: gerarId("usr"), nome: "", email: "", senha: "", departamento: "Operações", papel: "operador", modulos: ["visao"], ativo: true, ultimoAcesso: null },
  );
  const [novaSenha, setNovaSenha] = useState("");
  const [erros, setErros] = useState<Erros>({});
  const [enviando, setEnviando] = useState(false);
  const [erroConvite, setErroConvite] = useState<string | null>(null);
  const souEu = usuario?.id === euId;

  function alternarModulo(modulo: Modulo) {
    setDados((atual) => ({
      ...atual,
      modulos: atual.modulos.includes(modulo) ? atual.modulos.filter((item) => item !== modulo) : [...atual.modulos, modulo],
    }));
    setErros((atual) => ({ ...atual, modulos: undefined }));
  }

  async function salvar() {
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
    if (MODO_REAL && !usuario) {
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

  return (
    <Painel
      rotulo="Usuários e acessos"
      titulo={usuario ? usuario.nome : MODO_REAL ? "Convidar usuário" : "Novo usuário"}
      descricao={MODO_REAL && !usuario ? "A pessoa recebe um e-mail com o link para criar a própria senha." : undefined}
      aoFechar={aoFechar}
      aoEnviar={salvar}
      textoEnviar={MODO_REAL && !usuario ? (enviando ? "Enviando…" : "Enviar convite") : undefined}
    >
      {erroConvite ? (
        <div className="acesso-alerta-erro espaco-abaixo" role="alert">
          <span>{erroConvite}</span>
        </div>
      ) : null}
      <div className="field-grid">
        <Campo id="us-nome" rotulo="Nome completo" erro={erros.nome}>
          {(aria) => <input {...aria} className="field-input" value={dados.nome} onChange={(e) => setDados({ ...dados, nome: e.target.value })} />}
        </Campo>
        <Campo id="us-email" rotulo="E-mail" erro={erros.email} dica={MODO_REAL && usuario ? "O e-mail é o login: não muda por aqui." : undefined}>
          {(aria) => <input {...aria} className="field-input" type="email" value={dados.email} disabled={MODO_REAL && Boolean(usuario)} onChange={(e) => setDados({ ...dados, email: e.target.value })} />}
        </Campo>
      </div>
      <div className="field-grid">
        {MODO_REAL ? null : (
          <Campo id="us-senha" rotulo="Senha" erro={erros.senha} dica={usuario ? "Em branco mantém a atual" : "Mínimo de 6 caracteres"}>
            {(aria) => <input {...aria} className="field-input" type="password" value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} autoComplete="new-password" />}
          </Campo>
        )}
        <Campo id="us-departamento" rotulo="Departamento">
          {(aria) => (
            <select {...aria} className="field-input" value={dados.departamento} onChange={(e) => setDados({ ...dados, departamento: e.target.value })}>
              {DEPARTAMENTOS.map((departamento) => (
                <option key={departamento}>{departamento}</option>
              ))}
            </select>
          )}
        </Campo>
      </div>
      <Campo id="us-papel" rotulo="Papel" erro={erros.papel} dica={PAPEIS[dados.papel].descricao}>
        {(aria) => (
          <select {...aria} className="field-input" value={dados.papel} onChange={(e) => setDados({ ...dados, papel: e.target.value as Papel })}>
            {(Object.keys(PAPEIS) as Papel[]).map((papel) => (
              <option key={papel} value={papel}>
                {PAPEIS[papel].nome}
              </option>
            ))}
          </select>
        )}
      </Campo>
      <Permissoes dados={dados} erroModulos={erros.modulos} alternarModulo={alternarModulo} mudar={(permissoes) => setDados((atual) => ({ ...atual, permissoes }))} />
      <div className="toggle-row">
        <div>
          <strong className="field-label" id="us-ativo-rotulo">
            Usuário ativo
          </strong>
          <p className="field-hint">Inativo perde o acesso na hora, mesmo com sessão aberta.</p>
        </div>
        <button type="button" className="switch" role="switch" aria-checked={dados.ativo} aria-labelledby="us-ativo-rotulo" onClick={() => setDados({ ...dados, ativo: !dados.ativo })} />
      </div>
    </Painel>
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
    <fieldset className="field-group field-group-fieldset permissoes" aria-describedby={erroModulos ? "us-modulos-erro" : undefined}>
      <legend className="field-label rotulo-acima">Áreas e permissões</legend>
      <p className="field-hint">
        {admin
          ? "Administrador tem todas as permissões das áreas liberadas, e gerencia usuários."
          : personalizadas
            ? "Permissões personalizadas para esta pessoa."
            : `Usando as permissões padrão do papel ${PAPEIS[dados.papel].nome}. Marque ou desmarque para personalizar.`}
        {personalizadas ? (
          <>
            {" "}
            <button type="button" className="text-button" onClick={() => mudar(null)}>
              Voltar ao padrão do papel
            </button>
          </>
        ) : null}
      </p>

      <div className="permissoes-area">
        <div className="permissoes-area-topo">
          <strong>{MODULOS.visao}</strong>
          <button
            type="button"
            className="switch"
            role="switch"
            aria-checked={dados.modulos.includes("visao")}
            aria-label={`Acesso à ${MODULOS.visao}`}
            onClick={() => alternarModulo("visao")}
          />
        </div>
      </div>

      {(Object.keys(AREAS) as Area[]).map((area) => {
        const { nome, modulo } = AREAS[area];
        const liberada = !modulo || dados.modulos.includes(modulo);
        const acoes = acoesDaArea(area);
        const todas = acoes.every((acao) => efetivas.has(acao));
        return (
          <div className={liberada ? "permissoes-area" : "permissoes-area permissoes-area-fechada"} key={area}>
            <div className="permissoes-area-topo">
              <strong>{nome}</strong>
              {liberada && !admin ? (
                <button type="button" className="text-button" onClick={() => marcarArea(area, !todas)}>
                  {todas ? "Desmarcar todas" : "Marcar todas"}
                </button>
              ) : null}
              {modulo ? (
                <button
                  type="button"
                  className="switch"
                  role="switch"
                  aria-checked={liberada}
                  aria-label={`Acesso à área ${nome}`}
                  onClick={() => alternarModulo(modulo)}
                />
              ) : (
                <span className="field-hint">Toda a equipe</span>
              )}
            </div>
            {liberada ? (
              <ul className="permissoes-lista">
                {acoes.map((acao) => (
                  <li key={acao}>
                    <label className={padraoDoPapel(dados.papel, dados.modulos, acao) === efetivas.has(acao) || admin ? "permissao" : "permissao permissao-alterada"}>
                      <input type="checkbox" checked={efetivas.has(acao)} disabled={admin} onChange={() => alternar(acao)} />
                      <span>{ACOES[acao].nome}</span>
                    </label>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="field-hint">Sem acesso a esta área.</p>
            )}
          </div>
        );
      })}
      {erroModulos ? (
        <span id="us-modulos-erro" className="field-error" role="alert">
          {erroModulos}
        </span>
      ) : null}
    </fieldset>
  );
}
