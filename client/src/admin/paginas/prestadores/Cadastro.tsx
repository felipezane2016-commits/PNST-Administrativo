import { iniciais, pode } from "@/_core/identidade/permissoes";
import { useUsuarioAtual } from "@/_core/identidade/sessao";
import { MODO_REAL } from "@/_core/supabase/modo";
import { formatarData, formatarDataHora, gerarId, HOJE } from "@/_core/tempo";
import Cabecalho from "@/admin/componentes/Cabecalho";
import Campo from "@/admin/componentes/Campo";
import Gaveta from "@/admin/componentes/Gaveta";
import Kpi from "@/admin/componentes/Kpi";
import Painel from "@/admin/componentes/Painel";
import Selo, { type Tom } from "@/admin/componentes/Selo";
import Vazio from "@/admin/componentes/Vazio";
import { closingTotal, formatBRL, formatMonth, type Closing, type Receipt } from "@/lib/portal";
import { registrarConvitePortal, salvarPrestador } from "@/modulos/prestadores/acoes";
import { codigoDisponivel, montarLotes } from "@/modulos/prestadores/regras";
import { CATEGORIAS_PRESTADOR, type CategoriaPrestador, type Prestador } from "@/modulos/prestadores/tipos";
import { useDadosPrestadores } from "@/modulos/prestadores/usarDados";
import { AlertTriangle, ClipboardCheck, Mail, Pencil, Plus, Search, SearchX, Send, UserCheck, Users, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";

/**
 * Cadastro dos prestadores e do acesso de cada um ao Portal do Prestador.
 * No modo real o login do portal é o e-mail e a pessoa cria a senha pelo
 * convite; aqui o escritório vê em que pé está cada acesso.
 */

/** Conta do portal no Supabase (perfis tipo prestador). Só o administrador enxerga. */
type ContaPortal = { ativo: boolean; ultimoAcesso: string | null };

function useContasDoPortal(ehAdmin: boolean) {
  const [contas, setContas] = useState<Map<string, ContaPortal> | null>(null);
  useEffect(() => {
    if (!MODO_REAL || !ehAdmin) return;
    let vivo = true;
    void (async () => {
      const { supabase } = await import("@/_core/supabase/cliente");
      const { data, error } = await supabase().from("perfis").select("prestador_id, ativo, ultimo_acesso").eq("tipo", "prestador");
      if (!vivo || error || !data) return;
      setContas(new Map(data.map((linha) => [linha.prestador_id as string, { ativo: linha.ativo as boolean, ultimoAcesso: linha.ultimo_acesso as string | null }])));
    })();
    return () => {
      vivo = false;
    };
  }, [ehAdmin]);
  return contas;
}

type SituacaoAcesso = "Desativado" | "Sem e-mail" | "Sem convite" | "Convite enviado" | "Com acesso" | "Ativo";

const TOM_ACESSO: Record<SituacaoAcesso, Tom> = {
  Desativado: "neutral",
  "Sem e-mail": "red",
  "Sem convite": "amber",
  "Convite enviado": "blue",
  "Com acesso": "green",
  Ativo: "green",
};

function situacaoDoAcesso(prestador: Prestador, conta: ContaPortal | null | undefined): SituacaoAcesso {
  if (!prestador.portalAtivo) return "Desativado";
  if (!MODO_REAL) return "Ativo";
  if (!prestador.email) return "Sem e-mail";
  if (conta) return "Com acesso";
  return prestador.convidadoEm ? "Convite enviado" : "Sem convite";
}

function detalheDoAcesso(prestador: Prestador, situacao: SituacaoAcesso, conta: ContaPortal | null | undefined) {
  if (!MODO_REAL) return `Código ${prestador.codigoAcesso}`;
  if (situacao === "Com acesso") return conta?.ultimoAcesso ? `Último acesso ${formatarDataHora(conta.ultimoAcesso)}` : "Senha criada";
  if (situacao === "Convite enviado") return `Enviado em ${formatarData(prestador.convidadoEm)}`;
  if (situacao === "Sem convite") return "Falta enviar o convite";
  if (situacao === "Sem e-mail") return "O e-mail é o login do portal";
  return "Não entra no portal";
}

const incompleto = (prestador: Prestador) => !prestador.email || !prestador.documento || !prestador.telefone;

type Atividade = { recibosNoAno: number; totalNoAno: number; aguardando: number; ultimoPago: Closing | null; ultimoRecibo: Receipt | null };

function atividadeDe(prestador: Prestador, recibos: Receipt[], fechamentos: Closing[], aguardando: Map<string, number>): Atividade {
  const ano = HOJE.slice(0, 4);
  const enviados = recibos.filter((recibo) => recibo.prestadorId === prestador.id && recibo.status !== "Rascunho");
  const doAno = enviados.filter((recibo) => recibo.serviceDate.startsWith(ano));
  const pagos = fechamentos.filter((fechamento) => fechamento.prestadorId === prestador.id && fechamento.review === "Pago");
  return {
    recibosNoAno: doAno.length,
    totalNoAno: closingTotal(doAno),
    aguardando: aguardando.get(prestador.id) ?? 0,
    ultimoPago: pagos.sort((a, b) => b.competencia.localeCompare(a.competencia))[0] ?? null,
    ultimoRecibo: [...enviados].sort((a, b) => b.serviceDate.localeCompare(a.serviceDate))[0] ?? null,
  };
}

type Filtro = "Todos" | "Portal ativo" | "Pendentes" | "Desativados" | "Incompletos";

export default function Cadastro() {
  const { prestadores, recibos, fechamentos } = useDadosPrestadores();
  const usuario = useUsuarioAtual();
  const [, navegar] = useLocation();
  const podeEditar = pode(usuario, "registros.editar");
  const contas = useContasDoPortal(usuario?.papel === "admin");
  const [editando, setEditando] = useState<Prestador | "novo" | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("Todos");
  const [categoria, setCategoria] = useState<CategoriaPrestador | "">("");
  const [aviso, setAviso] = useState<{ tom: "sucesso" | "erro"; texto: string } | null>(null);
  const [convidando, setConvidando] = useState<string | null>(null);

  // Lotes que esperam o escritório, por prestador.
  const aguardando = new Map<string, number>();
  for (const lote of montarLotes(recibos, fechamentos, prestadores))
    if (lote.situacao === "Aguardando conferência" || lote.pendentes > 0) aguardando.set(lote.prestador.id, (aguardando.get(lote.prestador.id) ?? 0) + 1);

  const linhas = prestadores
    .map((prestador) => {
      const conta = contas?.get(prestador.id);
      const situacao = situacaoDoAcesso(prestador, conta);
      return { prestador, conta, situacao, atividade: atividadeDe(prestador, recibos, fechamentos, aguardando) };
    })
    .sort((a, b) => a.prestador.nome.localeCompare(b.prestador.nome, "pt-BR"));

  const pendente = (situacao: SituacaoAcesso) => situacao === "Sem convite" || situacao === "Sem e-mail" || situacao === "Convite enviado";
  const PASSA: Record<Filtro, (linha: (typeof linhas)[number]) => boolean> = {
    Todos: () => true,
    "Portal ativo": (linha) => linha.prestador.portalAtivo,
    Pendentes: (linha) => pendente(linha.situacao),
    Desativados: (linha) => !linha.prestador.portalAtivo,
    Incompletos: (linha) => incompleto(linha.prestador),
  };
  const termo = busca.trim().toLowerCase();
  const visiveis = linhas
    .filter(PASSA[filtro])
    .filter((linha) => !categoria || linha.prestador.categoria === categoria)
    .filter(({ prestador }) => !termo || `${prestador.nome} ${prestador.documento} ${prestador.email} ${prestador.telefone} ${prestador.codigoAcesso}`.toLowerCase().includes(termo));

  const totalAtivos = linhas.filter(PASSA["Portal ativo"]).length;
  const totalPendentes = linhas.filter(PASSA.Pendentes).length;
  const totalIncompletos = linhas.filter(PASSA.Incompletos).length;
  const lotesAguardando = Array.from(aguardando.values()).reduce((soma, n) => soma + n, 0);
  const categoriasUsadas = CATEGORIAS_PRESTADOR.filter((opcao) => prestadores.some((prestador) => prestador.categoria === opcao));
  const linhaAberta = linhas.find((linha) => linha.prestador.id === aberto) ?? null;

  /** Modo real: o prestador recebe um e-mail para criar a senha do portal. */
  async function convidarPortal(prestador: Prestador) {
    setConvidando(prestador.id);
    const { convidar } = await import("@/_core/supabase/autenticacao");
    const erro = await convidar({ tipo: "prestador", email: prestador.email, nome: prestador.nome, prestadorId: prestador.id });
    setConvidando(null);
    if (!erro) registrarConvitePortal(prestador.id);
    setAviso(erro ? { tom: "erro", texto: erro } : { tom: "sucesso", texto: `Convite do portal enviado para ${prestador.email}.` });
  }
  const podeConvidar = (prestador: Prestador, situacao: SituacaoAcesso) =>
    MODO_REAL && podeEditar && prestador.portalAtivo && Boolean(prestador.email) && situacao !== "Com acesso";

  return (
    <>
      <Cabecalho
        rotulo="Prestadores de serviço"
        titulo="Cadastro e acesso"
        descricao="Quem presta serviço ao escritório e o acesso de cada um ao Portal do Prestador."
        acoes={
          podeEditar ? (
            <button type="button" className="button-primary" onClick={() => setEditando("novo")}>
              <Plus size={15} strokeWidth={2.2} /> Novo prestador
            </button>
          ) : null
        }
      />

      {aviso ? (
        <div className={`acesso-alerta-${aviso.tom} aviso-fechavel espaco-abaixo`} role="status">
          <span>{aviso.texto}</span>
          <button type="button" className="icon-button icon-button-pequeno" aria-label="Fechar aviso" onClick={() => setAviso(null)}>
            <X size={14} strokeWidth={2} />
          </button>
        </div>
      ) : null}

      <div className="kpi-grid">
        <Kpi rotulo="Prestadores" valor={String(prestadores.length)} detalhe={`${categoriasUsadas.length} categoria(s)`} icone={Users} tom="laranja" aoClicar={() => setFiltro("Todos")} />
        <Kpi rotulo="Portal ativo" valor={String(totalAtivos)} detalhe="com acesso liberado" icone={UserCheck} tom="verde" aoClicar={() => setFiltro("Portal ativo")} />
        {MODO_REAL ? (
          <Kpi rotulo="Acesso pendente" valor={String(totalPendentes)} detalhe="sem convite ou sem senha criada" icone={Mail} tom={totalPendentes ? "ambar" : "neutro"} aoClicar={() => setFiltro("Pendentes")} />
        ) : (
          <Kpi rotulo="Cadastro incompleto" valor={String(totalIncompletos)} detalhe="sem e-mail, documento ou telefone" icone={AlertTriangle} tom={totalIncompletos ? "ambar" : "neutro"} aoClicar={() => setFiltro("Incompletos")} />
        )}
        <Kpi
          rotulo="Recibos a conferir"
          valor={String(lotesAguardando)}
          detalhe="lote(s) esperando o escritório"
          icone={ClipboardCheck}
          tom={lotesAguardando ? "vermelho" : "neutro"}
          aoClicar={() => navegar("/prestadores/conferencia")}
        />
      </div>

      <section className="operations-surface">
        <div className="surface-toolbar">
          <label className="inline-search">
            <Search size={15} strokeWidth={1.9} />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar prestador" aria-label="Buscar prestadores" />
          </label>
          {categoriasUsadas.length > 1 ? (
            <select className="field-input campo-filtro" value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaPrestador | "")} aria-label="Filtrar por categoria">
              <option value="">Todas as categorias</option>
              {categoriasUsadas.map((opcao) => (
                <option key={opcao}>{opcao}</option>
              ))}
            </select>
          ) : null}
        </div>
        <div className="filter-chips espaco-abaixo" role="group" aria-label="Filtrar por situação">
          {(["Todos", "Portal ativo", ...(MODO_REAL ? (["Pendentes"] as Filtro[]) : []), "Desativados", "Incompletos"] as Filtro[]).map((opcao) => (
            <button key={opcao} type="button" className={filtro === opcao ? "filter-chip filter-chip-active" : "filter-chip"} aria-pressed={filtro === opcao} onClick={() => setFiltro(opcao)}>
              {opcao}
              <span className="filter-chip-count" aria-hidden="true">
                {linhas.filter(PASSA[opcao]).length}
              </span>
            </button>
          ))}
        </div>

        {prestadores.length === 0 ? (
          <Vazio
            icone={Users}
            titulo="Nenhum prestador cadastrado"
            texto={podeEditar ? "Cadastre o primeiro em “Novo prestador”. Depois, convide-o para o portal." : "O escritório ainda não cadastrou prestadores."}
          />
        ) : visiveis.length === 0 ? (
          <Vazio icone={SearchX} titulo="Nenhum prestador aqui" texto="Mude o filtro ou a busca." />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Prestador</th>
                  <th>Acesso ao portal</th>
                  <th>Contato</th>
                  <th>Atividade em {HOJE.slice(0, 4)}</th>
                  <th>
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map(({ prestador, conta, situacao, atividade }) => (
                  <tr key={prestador.id} className="linha-clicavel" onClick={() => setAberto(prestador.id)}>
                    <td>
                      <div className="inline-row inline-row-fixo">
                        <span className="avatar" aria-hidden="true">
                          {iniciais(prestador.nome)}
                        </span>
                        <div className="cell-main">
                          <button type="button" className="link-linha" onClick={() => setAberto(prestador.id)}>
                            {prestador.nome}
                          </button>
                          <span>
                            {prestador.categoria}
                            {prestador.documento ? ` · ${prestador.documento}` : ""}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="celula-pilha">
                        <Selo tom={TOM_ACESSO[situacao]}>{situacao}</Selo>
                        <span className="texto-apoio">{detalheDoAcesso(prestador, situacao, conta)}</span>
                      </div>
                    </td>
                    <td className="cell-main">
                      {prestador.email ? <strong className="texto-medio">{prestador.email}</strong> : <strong className="texto-apoio">Sem e-mail</strong>}
                      <span>{prestador.telefone || "Sem telefone"}</span>
                    </td>
                    <td className="cell-main">
                      <strong className="texto-medio">{atividade.recibosNoAno ? `${atividade.recibosNoAno} recibo(s) · ${formatBRL(atividade.totalNoAno)}` : "Sem recibos"}</strong>
                      <span>
                        {atividade.aguardando
                          ? `${atividade.aguardando} lote(s) a conferir`
                          : atividade.ultimoPago
                            ? `Último pago: ${formatMonth(atividade.ultimoPago.competencia)}`
                            : `Desde ${formatarData(prestador.desde)}`}
                      </span>
                    </td>
                    <td>
                      {/* Os botões não abrem a ficha: o clique fica neles. */}
                      <div className="cell-actions" onClick={(evento) => evento.stopPropagation()}>
                        {podeConvidar(prestador, situacao) ? (
                          <button type="button" className="button-secondary button-compacto" onClick={() => convidarPortal(prestador)} disabled={convidando === prestador.id}>
                            <Send size={13} strokeWidth={2} /> {convidando === prestador.id ? "Enviando…" : situacao === "Convite enviado" ? "Reenviar convite" : "Convidar"}
                          </button>
                        ) : null}
                        {podeEditar ? (
                          <button type="button" className="icon-button icon-button-pequeno" aria-label={`Editar ${prestador.nome}`} title="Editar" onClick={() => setEditando(prestador)}>
                            <Pencil size={14} strokeWidth={1.9} />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {linhaAberta && !editando ? (
        <FichaPrestador
          {...linhaAberta}
          podeEditar={podeEditar}
          podeConvidar={podeConvidar(linhaAberta.prestador, linhaAberta.situacao)}
          convidando={convidando === linhaAberta.prestador.id}
          aoConvidar={() => convidarPortal(linhaAberta.prestador)}
          aoEditar={() => setEditando(linhaAberta.prestador)}
          aoFechar={() => setAberto(null)}
          aoAbrirConferencia={() => navegar("/prestadores/conferencia")}
        />
      ) : null}

      {editando ? (
        <FormularioPrestador prestador={editando === "novo" ? null : editando} todos={prestadores} aoFechar={() => setEditando(null)} />
      ) : null}
    </>
  );
}

function FichaPrestador({
  prestador,
  conta,
  situacao,
  atividade,
  podeEditar,
  podeConvidar,
  convidando,
  aoConvidar,
  aoEditar,
  aoFechar,
  aoAbrirConferencia,
}: {
  prestador: Prestador;
  conta: ContaPortal | undefined;
  situacao: SituacaoAcesso;
  atividade: Atividade;
  podeEditar: boolean;
  podeConvidar: boolean;
  convidando: boolean;
  aoConvidar: () => void;
  aoEditar: () => void;
  aoFechar: () => void;
  aoAbrirConferencia: () => void;
}) {
  return (
    <Gaveta
      rotulo={prestador.categoria}
      titulo={prestador.nome}
      subtitulo={
        <>
          Prestador desde {formatarData(prestador.desde)} · <Selo tom={TOM_ACESSO[situacao]}>{situacao}</Selo>
        </>
      }
      aoFechar={aoFechar}
      rodape={
        podeEditar ? (
          <div className="inline-row inline-row-justo">
            <button type="button" className="text-button text-button-neutro" onClick={aoEditar}>
              <Pencil size={14} strokeWidth={2} /> Editar cadastro
            </button>
            {podeConvidar ? (
              <button type="button" className="button-primary" onClick={aoConvidar} disabled={convidando}>
                <Send size={14} strokeWidth={2} /> {convidando ? "Enviando…" : situacao === "Convite enviado" ? "Reenviar convite" : "Convidar para o portal"}
              </button>
            ) : null}
          </div>
        ) : null
      }
    >
      <section>
        <span className="eyebrow">Acesso ao portal</span>
        <dl className="data-list espaco-acima-curto">
          <div>
            <dt>Situação</dt>
            <dd>{MODO_REAL ? detalheDoAcesso(prestador, situacao, conta) : prestador.portalAtivo ? "Entra com código e senha" : "Não entra no portal"}</dd>
          </div>
          <div>
            <dt>Login</dt>
            <dd>{MODO_REAL ? prestador.email || "— (cadastre o e-mail)" : `Código ${prestador.codigoAcesso}`}</dd>
          </div>
          {MODO_REAL && prestador.convidadoEm ? (
            <div>
              <dt>Último convite</dt>
              <dd>{formatarData(prestador.convidadoEm)}</dd>
            </div>
          ) : null}
          {MODO_REAL ? (
            <div>
              <dt>Código do prestador</dt>
              <dd className="texto-mono">{prestador.codigoAcesso}</dd>
            </div>
          ) : null}
        </dl>
        {situacao === "Convite enviado" ? (
          <p className="field-hint espaco-acima-curto">
            O prestador ainda não criou a senha. Se o e-mail não chegou ou o link expirou, reenvie o convite.
          </p>
        ) : null}
      </section>

      <section className="espaco-acima">
        <span className="eyebrow">Atividade em {HOJE.slice(0, 4)}</span>
        <div className="mini-kpis espaco-acima-curto">
          <div>
            <span>Recibos</span>
            <strong>{atividade.recibosNoAno}</strong>
          </div>
          <div>
            <span>Total</span>
            <strong>{formatBRL(atividade.totalNoAno)}</strong>
          </div>
          <div>
            <span>A conferir</span>
            <strong className={atividade.aguardando ? "texto-perigo" : undefined}>{atividade.aguardando}</strong>
          </div>
        </div>
        <dl className="data-list espaco-acima-curto">
          <div>
            <dt>Último recibo</dt>
            <dd>{atividade.ultimoRecibo ? `${formatarData(atividade.ultimoRecibo.serviceDate)} · ${formatBRL(atividade.ultimoRecibo.amount)}` : "—"}</dd>
          </div>
          <div>
            <dt>Último pagamento</dt>
            <dd>{atividade.ultimoPago ? `${formatMonth(atividade.ultimoPago.competencia)}${atividade.ultimoPago.paidAt ? ` · pago em ${formatarData(atividade.ultimoPago.paidAt)}` : ""}` : "—"}</dd>
          </div>
        </dl>
        {atividade.aguardando ? (
          <button type="button" className="text-button espaco-acima-curto" onClick={aoAbrirConferencia}>
            <ClipboardCheck size={14} strokeWidth={2} /> Abrir a conferência
          </button>
        ) : null}
      </section>

      <section className="espaco-acima">
        <span className="eyebrow">Cadastro</span>
        <dl className="data-list espaco-acima-curto">
          <div>
            <dt>CPF ou CNPJ</dt>
            <dd>{prestador.documento || "—"}</dd>
          </div>
          <div>
            <dt>E-mail</dt>
            <dd>{prestador.email ? <a href={`mailto:${prestador.email}`}>{prestador.email}</a> : "—"}</dd>
          </div>
          <div>
            <dt>Telefone</dt>
            <dd>{prestador.telefone ? <a href={`tel:${prestador.telefone.replace(/[^\d+]/g, "")}`}>{prestador.telefone}</a> : "—"}</dd>
          </div>
          <div>
            <dt>Contrato</dt>
            <dd>{prestador.contrato || "—"}</dd>
          </div>
        </dl>
        {incompleto(prestador) ? (
          <p className="field-hint espaco-acima-curto">
            <AlertTriangle size={13} strokeWidth={2} /> Cadastro incompleto: {[!prestador.email && "e-mail", !prestador.documento && "CPF/CNPJ", !prestador.telefone && "telefone"].filter(Boolean).join(", ")}.
          </p>
        ) : null}
      </section>
    </Gaveta>
  );
}

type Erros = Partial<Record<"nome" | "email" | "codigoAcesso" | "senha", string>>;

function FormularioPrestador({ prestador, todos, aoFechar }: { prestador: Prestador | null; todos: Prestador[]; aoFechar: () => void }) {
  const [dados, setDados] = useState({
    nome: prestador?.nome ?? "",
    categoria: prestador?.categoria ?? ("Motoboy" as CategoriaPrestador),
    documento: prestador?.documento ?? "",
    email: prestador?.email ?? "",
    telefone: prestador?.telefone ?? "",
    codigoAcesso: prestador?.codigoAcesso ?? "",
    senha: "",
    portalAtivo: prestador?.portalAtivo ?? true,
  });
  const [erros, setErros] = useState<Erros>({});

  function mudar<K extends keyof typeof dados>(campo: K, valor: (typeof dados)[K]) {
    setDados((atual) => ({ ...atual, [campo]: valor }));
    if (campo in erros) setErros((atual) => ({ ...atual, [campo]: undefined }));
  }

  function salvar() {
    const encontrados: Erros = {};
    if (!dados.nome.trim()) encontrados.nome = "Informe o nome ou a razão social.";
    if (dados.email && !/^\S+@\S+\.\S+$/.test(dados.email)) encontrados.email = "E-mail inválido.";
    if (!dados.codigoAcesso.trim()) encontrados.codigoAcesso = MODO_REAL ? "Defina o código do prestador." : "Defina o código de acesso ao portal.";
    else if (!codigoDisponivel(dados.codigoAcesso, todos, prestador?.id)) encontrados.codigoAcesso = "Este código já é de outro prestador.";
    // Na edição, senha em branco mantém a atual; no cadastro, é obrigatória.
    // No modo real não há senha aqui: o prestador cria a dele pelo convite.
    if (MODO_REAL) {
      if (dados.portalAtivo && !dados.email.trim()) encontrados.email = "O e-mail é o login do portal.";
    } else if ((!prestador || dados.senha) && dados.senha.length < 6) encontrados.senha = "Mínimo de 6 caracteres.";
    if (Object.values(encontrados).some(Boolean)) {
      setErros(encontrados);
      return;
    }
    const email = dados.email.trim();
    salvarPrestador({
      id: prestador?.id ?? gerarId("prest"),
      nome: dados.nome.trim(),
      categoria: dados.categoria,
      documento: dados.documento.trim(),
      email,
      telefone: dados.telefone.trim(),
      codigoAcesso: dados.codigoAcesso.trim().toUpperCase(),
      senha: MODO_REAL ? "" : dados.senha || prestador?.senha || "",
      portalAtivo: dados.portalAtivo,
      contrato: prestador?.contrato ?? `Contrato de prestação ${dados.codigoAcesso.trim().toUpperCase()}`,
      desde: prestador?.desde ?? HOJE,
      // Trocar o e-mail invalida o convite anterior: ele foi para o endereço antigo.
      convidadoEm: prestador && prestador.email === email ? (prestador.convidadoEm ?? null) : null,
    });
    aoFechar();
  }

  return (
    <Painel
      rotulo={prestador ? "Editar prestador" : "Novo prestador"}
      titulo={prestador?.nome ?? "Cadastrar prestador"}
      descricao={MODO_REAL ? "O e-mail é o login do portal; depois de salvar, envie o convite pela lista ou pela ficha." : "O código e a senha são o acesso do prestador ao Portal do Prestador."}
      aoFechar={aoFechar}
      aoEnviar={salvar}
    >
      <div className="field-grid">
        <Campo id="prest-nome" rotulo="Nome ou razão social" erro={erros.nome}>
          {(aria) => <input {...aria} className="field-input" value={dados.nome} onChange={(e) => mudar("nome", e.target.value)} />}
        </Campo>
        <Campo id="prest-categoria" rotulo="Categoria">
          {(aria) => (
            <select {...aria} className="field-input" value={dados.categoria} onChange={(e) => mudar("categoria", e.target.value as CategoriaPrestador)}>
              {CATEGORIAS_PRESTADOR.map((categoria) => (
                <option key={categoria}>{categoria}</option>
              ))}
            </select>
          )}
        </Campo>
      </div>
      <div className="field-grid">
        <Campo id="prest-email" rotulo="E-mail" erro={erros.email} dica={MODO_REAL ? "Login do portal" : undefined}>
          {(aria) => <input {...aria} className="field-input" type="email" value={dados.email} onChange={(e) => mudar("email", e.target.value)} />}
        </Campo>
        <Campo id="prest-telefone" rotulo="Telefone">
          {(aria) => <input {...aria} className="field-input" value={dados.telefone} onChange={(e) => mudar("telefone", e.target.value)} placeholder="(11) 99999-9999" />}
        </Campo>
      </div>
      <div className="field-grid">
        <Campo id="prest-documento" rotulo="CPF ou CNPJ">
          {(aria) => <input {...aria} className="field-input" value={dados.documento} onChange={(e) => mudar("documento", e.target.value)} />}
        </Campo>
        <Campo
          id="prest-codigo"
          rotulo={MODO_REAL ? "Código do prestador" : "Código de acesso"}
          erro={erros.codigoAcesso}
          dica={MODO_REAL ? "Numera os recibos: REC-código-0001" : "Ex.: PNST-0000"}
        >
          {(aria) => (
            <input {...aria} className="field-input" value={dados.codigoAcesso} onChange={(e) => mudar("codigoAcesso", e.target.value)} autoCapitalize="characters" autoComplete="off" />
          )}
        </Campo>
      </div>
      {MODO_REAL ? null : (
        <Campo id="prest-senha" rotulo="Senha do portal" erro={erros.senha} dica={prestador ? "Em branco mantém a atual" : "Mínimo de 6 caracteres"}>
          {(aria) => <input {...aria} className="field-input" type="password" value={dados.senha} onChange={(e) => mudar("senha", e.target.value)} autoComplete="new-password" />}
        </Campo>
      )}
      <div className="toggle-row">
        <div>
          <strong className="field-label" id="prest-ativo-rotulo">
            Acesso ao portal ativo
          </strong>
          <p className="field-hint">Desativar encerra a sessão aberta do prestador.</p>
        </div>
        <button
          type="button"
          className="switch"
          role="switch"
          aria-checked={dados.portalAtivo}
          aria-labelledby="prest-ativo-rotulo"
          onClick={() => mudar("portalAtivo", !dados.portalAtivo)}
        />
      </div>
    </Painel>
  );
}
