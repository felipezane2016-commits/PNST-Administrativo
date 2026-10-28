import { iniciais, pode } from "@/_core/identidade/permissoes";
import { usuarios, useUsuarioAtual } from "@/_core/identidade/sessao";
import { useColecao } from "@/_core/armazenamento/colecao";
import { MODO_REAL } from "@/_core/supabase/modo";
import { formatarData, formatarDataHora, gerarId, HOJE } from "@/_core/tempo";
import Cabecalho from "@/admin/componentes/Cabecalho";
import Campo from "@/admin/componentes/Campo";
import Gaveta from "@/admin/componentes/Gaveta";
import Kpi from "@/admin/componentes/Kpi";
import { usarModal } from "@/admin/componentes/usarModal";
import Selo, { type Tom } from "@/admin/componentes/Selo";
import Vazio from "@/admin/componentes/Vazio";
import { closingTotal, formatBRL, formatMonth, type Closing, type Receipt } from "@/lib/portal";
import { excluirPrestador, impactoDaExclusao, registrarConvitePortal, salvarPrestador } from "@/modulos/prestadores/acoes";
import { codigoDisponivel, conferenciaAberta, montarLotes } from "@/modulos/prestadores/regras";
import { CATEGORIAS_PRESTADOR, type CategoriaPrestador, type Prestador } from "@/modulos/prestadores/tipos";
import { useDadosPrestadores } from "@/modulos/prestadores/usarDados";
import { AlertTriangle, Check, ClipboardCheck, FileText, IdCard, Mail, MessageCircle, Pencil, Phone, Plus, Search, SearchX, Send, Trash2, Truck, UserCheck, Users, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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

type SituacaoAcesso = "Desativado" | "Sem e-mail" | "E-mail da equipe" | "Sem convite" | "Convite enviado" | "Com acesso" | "Ativo";

const TOM_ACESSO: Record<SituacaoAcesso, Tom> = {
  Desativado: "neutral",
  "Sem e-mail": "red",
  "E-mail da equipe": "red",
  "Sem convite": "amber",
  "Convite enviado": "blue",
  "Com acesso": "green",
  Ativo: "green",
};

/**
 * Cada acesso ao sistema tem um e-mail só: o login de alguém da equipe não
 * pode virar também login do portal (o Supabase recusa o convite).
 */
function situacaoDoAcesso(prestador: Prestador, conta: ContaPortal | null | undefined, donoDoEmail: string | null): SituacaoAcesso {
  if (!prestador.portalAtivo) return "Desativado";
  if (!MODO_REAL) return "Ativo";
  if (!prestador.email) return "Sem e-mail";
  if (conta) return "Com acesso";
  if (donoDoEmail) return "E-mail da equipe";
  return prestador.convidadoEm ? "Convite enviado" : "Sem convite";
}

function detalheDoAcesso(prestador: Prestador, situacao: SituacaoAcesso, conta: ContaPortal | null | undefined) {
  if (!MODO_REAL) return `Código ${prestador.codigoAcesso}`;
  if (situacao === "Com acesso") return conta?.ultimoAcesso ? `Último acesso ${formatarDataHora(conta.ultimoAcesso)}` : "Senha criada";
  if (situacao === "Convite enviado") return `Enviado em ${formatarData(prestador.convidadoEm)}`;
  if (situacao === "Sem convite") return "Falta enviar o convite";
  if (situacao === "Sem e-mail") return "O e-mail é o login do portal";
  if (situacao === "E-mail da equipe") return "Este e-mail já é login da equipe";
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
  const podeEditar = pode(usuario, "prestadores.cadastro.editar");
  // Excluir o prestador apaga junto os recibos e os lotes dele: precisa das duas permissões.
  const podeExcluirPrestador = pode(usuario, "prestadores.cadastro.excluir") && pode(usuario, "prestadores.recibos.excluir");
  const contas = useContasDoPortal(usuario?.papel === "admin");
  const equipe = useColecao(usuarios);
  const donoNaEquipe = (email: string) => equipe.find((pessoa) => email && pessoa.email.trim().toLowerCase() === email.trim().toLowerCase())?.nome ?? null;
  const [editando, setEditando] = useState<Prestador | "novo" | null>(null);
  const [comecarExcluindo, setComecarExcluindo] = useState(false);
  const [aberto, setAberto] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("Todos");
  const [categoria, setCategoria] = useState<CategoriaPrestador | "">("");
  const [aviso, setAviso] = useState<{ tom: "sucesso" | "erro"; texto: string; prestadorId: string } | null>(null);
  const [convidando, setConvidando] = useState<string | null>(null);

  // Lotes que esperam o escritório, por prestador.
  const aguardando = new Map<string, number>();
  for (const lote of montarLotes(recibos, fechamentos, prestadores))
    if (conferenciaAberta(lote)) aguardando.set(lote.prestador.id, (aguardando.get(lote.prestador.id) ?? 0) + 1);

  const linhas = prestadores
    .map((prestador) => {
      const conta = contas?.get(prestador.id);
      const donoDoEmail = donoNaEquipe(prestador.email);
      const situacao = situacaoDoAcesso(prestador, conta, donoDoEmail);
      return { prestador, conta, situacao, donoDoEmail, atividade: atividadeDe(prestador, recibos, fechamentos, aguardando) };
    })
    .sort((a, b) => a.prestador.nome.localeCompare(b.prestador.nome, "pt-BR"));

  const pendente = (situacao: SituacaoAcesso) =>
    situacao === "Sem convite" || situacao === "Sem e-mail" || situacao === "E-mail da equipe" || situacao === "Convite enviado";
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
    const texto = !erro
      ? `Convite do portal enviado para ${prestador.email}.`
      : /já existe um acesso/i.test(erro)
        ? `${prestador.email} já é login de outro acesso do sistema. Cada acesso precisa de um e-mail próprio: edite o cadastro e use outro e-mail do prestador.`
        : erro;
    setAviso({ tom: erro ? "erro" : "sucesso", texto, prestadorId: prestador.id });
  }
  const podeConvidar = (prestador: Prestador, situacao: SituacaoAcesso) =>
    MODO_REAL && podeEditar && prestador.portalAtivo && Boolean(prestador.email) && situacao !== "Com acesso" && situacao !== "E-mail da equipe";

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
          aviso={aviso?.prestadorId === linhaAberta.prestador.id ? aviso : null}
          aoConvidar={() => convidarPortal(linhaAberta.prestador)}
          aoEditar={() => setEditando(linhaAberta.prestador)}
          aoExcluir={
            podeExcluirPrestador
              ? () => {
                  setComecarExcluindo(true);
                  setEditando(linhaAberta.prestador);
                }
              : undefined
          }
          aoFechar={() => setAberto(null)}
          aoAbrirConferencia={() => navegar("/prestadores/conferencia")}
        />
      ) : null}

      {editando ? (
        <FormularioPrestador
          prestador={editando === "novo" ? null : editando}
          todos={prestadores}
          donoNaEquipe={donoNaEquipe}
          podeExcluir={podeExcluirPrestador}
          autor={usuario?.nome ?? "Escritório"}
          aoFechar={() => {
            setEditando(null);
            setComecarExcluindo(false);
          }}
          aoExcluido={() => setAberto(null)}
          comecarExcluindo={comecarExcluindo}
        />
      ) : null}
    </>
  );
}

/** Telefone brasileiro para o link do WhatsApp (55 + DDD + número). */
function linkWhatsApp(telefone: string) {
  const digitos = telefone.replace(/\D/g, "");
  if (digitos.length < 10) return null;
  return `https://wa.me/${digitos.length <= 11 ? `55${digitos}` : digitos}`;
}

/** As etapas do acesso ao portal no modo real, na ordem em que acontecem. */
function passosDoAcesso(prestador: Prestador, situacao: SituacaoAcesso, conta: ContaPortal | undefined) {
  const comAcesso = situacao === "Com acesso";
  const convidado = comAcesso || situacao === "Convite enviado";
  return [
    {
      rotulo: "Cadastro",
      detalhe: !prestador.email ? "Falta o e-mail" : situacao === "E-mail da equipe" ? "E-mail já usado" : "E-mail informado",
      feito: Boolean(prestador.email) && situacao !== "E-mail da equipe",
    },
    { rotulo: "Convite", detalhe: prestador.convidadoEm ? `Enviado em ${formatarData(prestador.convidadoEm)}` : convidado ? "Enviado" : "Não enviado", feito: convidado },
    {
      rotulo: "Senha criada",
      detalhe: comAcesso ? (conta?.ultimoAcesso ? `Último acesso ${formatarData(conta.ultimoAcesso.slice(0, 10))}` : "Já pode entrar") : "Aguardando",
      feito: comAcesso,
    },
  ];
}

/** O que falta para o prestador entrar — o texto do próximo passo. */
function proximoPasso(situacao: SituacaoAcesso, donoDoEmail?: string | null) {
  if (situacao === "Desativado") return "O acesso está desligado. Para liberar, edite o cadastro e ative o portal.";
  if (situacao === "Sem e-mail") return "Cadastre o e-mail do prestador: ele é o login do portal.";
  if (situacao === "E-mail da equipe")
    return `Este e-mail já é o login de ${donoDoEmail ?? "alguém da equipe"} no escritório, e cada acesso precisa de um e-mail próprio. Edite o cadastro e use outro e-mail do prestador.`;
  if (situacao === "Sem convite") return "Envie o convite: o prestador recebe um e-mail para criar a própria senha.";
  if (situacao === "Convite enviado") return "O prestador ainda não criou a senha. Se o e-mail não chegou ou o link expirou, reenvie.";
  return null;
}

function FichaPrestador({
  prestador,
  conta,
  situacao,
  donoDoEmail,
  atividade,
  podeEditar,
  podeConvidar,
  convidando,
  aviso,
  aoConvidar,
  aoEditar,
  aoExcluir,
  aoFechar,
  aoAbrirConferencia,
}: {
  aoExcluir?: () => void;
  prestador: Prestador;
  conta: ContaPortal | undefined;
  situacao: SituacaoAcesso;
  donoDoEmail: string | null;
  atividade: Atividade;
  podeEditar: boolean;
  podeConvidar: boolean;
  convidando: boolean;
  /** Resultado do último convite deste prestador: aparece aqui, ao lado do botão. */
  aviso: { tom: "sucesso" | "erro"; texto: string } | null;
  aoConvidar: () => void;
  aoEditar: () => void;
  aoFechar: () => void;
  aoAbrirConferencia: () => void;
}) {
  const whatsapp = prestador.telefone ? linkWhatsApp(prestador.telefone) : null;
  const passo = MODO_REAL ? proximoPasso(situacao, donoDoEmail) : prestador.portalAtivo ? null : proximoPasso("Desativado");
  const faltando = [!prestador.email && "e-mail", !prestador.documento && "CPF/CNPJ", !prestador.telefone && "telefone"].filter(Boolean) as string[];
  const ano = HOJE.slice(0, 4);

  return (
    <Gaveta
      rotulo="Prestador"
      titulo={prestador.nome}
      subtitulo={`${prestador.categoria} · prestador desde ${formatarData(prestador.desde)}`}
      aoFechar={aoFechar}
      rodape={
        podeEditar || aoExcluir ? (
          <>
            {aoExcluir ? (
              <button type="button" className="text-button text-button-perigo" onClick={aoExcluir}>
                <Trash2 size={14} strokeWidth={2} /> Excluir prestador
              </button>
            ) : (
              <span />
            )}
            {podeEditar ? (
              <button type="button" className="button-secondary" onClick={aoEditar}>
                <Pencil size={14} strokeWidth={2} /> Editar cadastro
              </button>
            ) : null}
          </>
        ) : null
      }
    >
      {/* Acesso ao portal: situação, etapas e o próximo passo com a ação ao lado */}
      <section className="ficha-cartao">
        <div className="ficha-cartao-cabeca">
          <h3>Acesso ao portal</h3>
          <Selo tom={TOM_ACESSO[situacao]}>{situacao}</Selo>
        </div>
        {MODO_REAL ? (
          <ol className="passos-acesso">
            {passosDoAcesso(prestador, situacao, conta).map((etapa) => (
              <li key={etapa.rotulo} className={etapa.feito ? "passo-feito" : undefined}>
                <span className="passo-marca" aria-hidden="true">
                  {etapa.feito ? <Check size={12} strokeWidth={3} /> : null}
                </span>
                <strong>{etapa.rotulo}</strong>
                <span>{etapa.detalhe}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="ficha-texto">{prestador.portalAtivo ? `Entra no portal com o código ${prestador.codigoAcesso} e a senha cadastrada.` : "Não entra no portal."}</p>
        )}
        {passo ? (
          <div className="ficha-proximo">
            <p>{passo}</p>
            {podeConvidar ? (
              <button type="button" className="button-primary" onClick={aoConvidar} disabled={convidando}>
                <Send size={14} strokeWidth={2} /> {convidando ? "Enviando…" : situacao === "Convite enviado" ? "Reenviar convite" : "Enviar convite"}
              </button>
            ) : null}
          </div>
        ) : null}
        {aviso ? (
          <div className={`acesso-alerta-${aviso.tom} espaco-acima-curto`} role="status">
            <span>{aviso.texto}</span>
          </div>
        ) : null}
      </section>

      {/* Contato e cadastro: com atalhos para falar com o prestador */}
      <section className="ficha-cartao">
        <div className="ficha-cartao-cabeca">
          <h3>Contato e cadastro</h3>
          {faltando.length ? <Selo tom="amber">Incompleto</Selo> : null}
        </div>
        <ul className="contato-lista">
          <li>
            <span className="contato-icone" aria-hidden="true">
              <Mail size={15} strokeWidth={1.9} />
            </span>
            <div>
              <span>E-mail{MODO_REAL && prestador.email ? " · login do portal" : ""}</span>
              {prestador.email ? <a href={`mailto:${prestador.email}`}>{prestador.email}</a> : <em>Não informado</em>}
            </div>
          </li>
          <li>
            <span className="contato-icone" aria-hidden="true">
              <Phone size={15} strokeWidth={1.9} />
            </span>
            <div>
              <span>Telefone</span>
              {prestador.telefone ? <a href={`tel:${prestador.telefone.replace(/[^\d+]/g, "")}`}>{prestador.telefone}</a> : <em>Não informado</em>}
            </div>
            {whatsapp ? (
              <a className="button-secondary button-compacto" href={whatsapp} target="_blank" rel="noreferrer">
                <MessageCircle size={13} strokeWidth={2} /> WhatsApp
              </a>
            ) : null}
          </li>
          <li>
            <span className="contato-icone" aria-hidden="true">
              <IdCard size={15} strokeWidth={1.9} />
            </span>
            <div>
              <span>CPF ou CNPJ</span>
              {prestador.documento ? <strong>{prestador.documento}</strong> : <em>Não informado</em>}
            </div>
          </li>
          <li>
            <span className="contato-icone" aria-hidden="true">
              <FileText size={15} strokeWidth={1.9} />
            </span>
            <div>
              <span>Contrato · código do prestador</span>
              <strong>
                {prestador.contrato || "—"} · <span className="texto-mono">{prestador.codigoAcesso}</span>
              </strong>
            </div>
          </li>
        </ul>
        {faltando.length ? <p className="ficha-aviso">Falta: {faltando.join(", ")}.</p> : null}
      </section>

      {/* Atividade do ano: números quando há recibos; um aviso quando não há */}
      <section className="ficha-cartao">
        <div className="ficha-cartao-cabeca">
          <h3>Atividade em {ano}</h3>
          {atividade.aguardando ? <Selo tom="red">{atividade.aguardando} a conferir</Selo> : null}
        </div>
        {atividade.recibosNoAno || atividade.ultimoPago ? (
          <>
            <div className="mini-kpis">
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
          </>
        ) : (
          <p className="ficha-texto">
            Nenhum recibo em {ano}. {situacao === "Com acesso" || (!MODO_REAL && prestador.portalAtivo) ? "Os recibos que o prestador lançar no portal aparecem aqui." : "Depois que o prestador entrar no portal, os recibos que ele lançar aparecem aqui."}
          </p>
        )}
      </section>
    </Gaveta>
  );
}

type Erros = Partial<Record<"nome" | "email" | "codigoAcesso" | "senha", string>>;

function FormularioPrestador({
  prestador,
  todos,
  donoNaEquipe,
  podeExcluir,
  autor,
  aoFechar,
  aoExcluido,
  comecarExcluindo,
}: {
  comecarExcluindo?: boolean;
  prestador: Prestador | null;
  todos: Prestador[];
  donoNaEquipe: (email: string) => string | null;
  podeExcluir: boolean;
  autor: string;
  aoFechar: () => void;
  aoExcluido?: () => void;
}) {
  const [excluindo, setExcluindo] = useState(comecarExcluindo ?? false);
  const [erroExclusao, setErroExclusao] = useState<string | null>(null);
  const confirmacao = useRef<HTMLElement>(null);
  // A confirmação fica no fim do formulário: rola até ela ao abrir.
  useEffect(() => {
    if (excluindo) confirmacao.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [excluindo]);
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
    else if (MODO_REAL && dados.email.trim() && donoNaEquipe(dados.email))
      encontrados.email = `Este e-mail já é o login de ${donoNaEquipe(dados.email)} no escritório. Use outro e-mail do prestador.`;
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

  const raiz = usarModal(aoFechar);
  const impacto = prestador ? impactoDaExclusao(prestador.id) : null;

  return (
    <div className="modal-backdrop" onMouseDown={(evento) => evento.target === evento.currentTarget && aoFechar()}>
      <div ref={raiz} className="modal-panel ficha-usuario ficha-prestador" role="dialog" aria-modal="true" aria-labelledby="ficha-prestador-titulo">
        <header className="ficha-usuario-topo">
          <span className="avatar avatar-grande" aria-hidden="true">
            {dados.nome.trim() ? iniciais(dados.nome) : <Truck size={20} strokeWidth={1.8} />}
          </span>
          <div className="ficha-usuario-identidade">
            <span className="eyebrow">{prestador ? "Editar prestador" : "Novo prestador"}</span>
            <h2 id="ficha-prestador-titulo">{dados.nome.trim() || "Cadastrar prestador"}</h2>
            <span className="ficha-usuario-meta">
              <Selo tom="neutral">{dados.categoria}</Selo>
              {dados.portalAtivo ? <Selo tom="green">Portal ativo</Selo> : <Selo tom="neutral">Portal desativado</Selo>}
              {dados.codigoAcesso ? <span className="texto-mono">{dados.codigoAcesso.toUpperCase()}</span> : null}
            </span>
          </div>
          <button type="button" className="icon-button" aria-label="Fechar" data-fechar onClick={aoFechar}>
            <X size={17} strokeWidth={2} />
          </button>
        </header>

        <form
          className="ficha-usuario-corpo ficha-prestador-corpo"
          onSubmit={(evento) => {
            evento.preventDefault();
            salvar();
          }}
          noValidate
        >
          <section className="ficha-secao">
            <h3>Identificação</h3>
            <Campo id="prest-nome" rotulo="Nome ou razão social" erro={erros.nome}>
              {(aria) => <input {...aria} className="field-input" value={dados.nome} onChange={(e) => mudar("nome", e.target.value)} placeholder="Ex.: Rota Leve Entregas" />}
            </Campo>
            <div className="field-grid">
              <Campo id="prest-documento" rotulo="CPF ou CNPJ">
                {(aria) => <input {...aria} className="field-input" value={dados.documento} onChange={(e) => mudar("documento", e.target.value)} placeholder="00.000.000/0000-00" />}
              </Campo>
              <div className="field-group">
                <span className="field-label" id="prest-categoria-rotulo">
                  Categoria
                </span>
                <div className="categoria-opcoes" role="radiogroup" aria-labelledby="prest-categoria-rotulo">
                  {CATEGORIAS_PRESTADOR.map((categoria) => (
                    <button
                      key={categoria}
                      type="button"
                      role="radio"
                      aria-checked={dados.categoria === categoria}
                      className={dados.categoria === categoria ? "filter-chip filter-chip-active" : "filter-chip"}
                      onClick={() => mudar("categoria", categoria)}
                    >
                      {categoria}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="ficha-secao">
            <h3>Contato</h3>
            <div className="field-grid">
              <Campo id="prest-email" rotulo={MODO_REAL ? "E-mail · login do portal" : "E-mail"} erro={erros.email}>
                {(aria) => <input {...aria} className="field-input" type="email" value={dados.email} onChange={(e) => mudar("email", e.target.value)} placeholder="nome@empresa.com.br" />}
              </Campo>
              <Campo id="prest-telefone" rotulo="Telefone / WhatsApp">
                {(aria) => <input {...aria} className="field-input" value={dados.telefone} onChange={(e) => mudar("telefone", e.target.value)} placeholder="(11) 99999-9999" />}
              </Campo>
            </div>
          </section>

          <section className="ficha-secao">
            <h3>Acesso ao portal</h3>
            <div className="field-grid">
              <Campo id="prest-codigo" rotulo={MODO_REAL ? "Código do prestador" : "Código de acesso"} erro={erros.codigoAcesso}>
                {(aria) => (
                  <input {...aria} className="field-input texto-mono" value={dados.codigoAcesso} onChange={(e) => mudar("codigoAcesso", e.target.value)} autoCapitalize="characters" autoComplete="off" placeholder="PNST-0000" />
                )}
              </Campo>
              {MODO_REAL ? (
                <p className="field-hint ficha-prestador-dica">
                  O código numera os recibos (REC-código-0001). O login é o e-mail: depois de salvar, envie o convite pela lista ou pela ficha.
                </p>
              ) : (
                <Campo id="prest-senha" rotulo="Senha do portal" erro={erros.senha}>
                  {(aria) => (
                    <input {...aria} className="field-input" type="password" value={dados.senha} onChange={(e) => mudar("senha", e.target.value)} autoComplete="new-password" placeholder={prestador ? "Em branco mantém a atual" : "Mínimo de 6 caracteres"} />
                  )}
                </Campo>
              )}
            </div>
            <div className="toggle-row">
              <div>
                <strong className="field-label" id="prest-ativo-rotulo">
                  Acesso ao portal ativo
                </strong>
                <p className="field-hint">Desativar encerra a sessão aberta do prestador.</p>
              </div>
              <button type="button" className="switch" role="switch" aria-checked={dados.portalAtivo} aria-labelledby="prest-ativo-rotulo" onClick={() => mudar("portalAtivo", !dados.portalAtivo)} />
            </div>
          </section>

          {excluindo && prestador && impacto ? (
            <section ref={confirmacao} className="ficha-secao ficha-secao-perigo" role="alert">
              <h3>Excluir {prestador.nome}?</h3>
              {impacto.emAndamento.length ? (
                <p className="texto-perigo">
                  Há {impacto.emAndamento.length} lote(s) em conferência ou esperando pagamento. Pague ou exclua esses lotes na Conferência antes de excluir o prestador.
                </p>
              ) : (
                <p>
                  Saem junto {impacto.recibos} recibo(s), {impacto.fechamentos} fechamento(s) e os arquivos deles. O acesso ao portal é encerrado. Não dá para desfazer.
                </p>
              )}
              {erroExclusao ? <p className="texto-perigo">{erroExclusao}</p> : null}
              <div className="inline-row inline-row-fim">
                <button type="button" className="button-secondary" onClick={() => setExcluindo(false)}>
                  Manter prestador
                </button>
                {!impacto.emAndamento.length ? (
                  <button
                    type="button"
                    className="button-primary botao-excluir"
                    onClick={() => {
                      const erro = excluirPrestador(prestador.id, autor);
                      if (erro) return setErroExclusao(erro);
                      aoExcluido?.();
                      aoFechar();
                    }}
                  >
                    <Trash2 size={14} strokeWidth={2} /> Excluir definitivamente
                  </button>
                ) : null}
              </div>
            </section>
          ) : null}

          <footer className="ficha-usuario-rodape">
            {prestador && podeExcluir && !excluindo ? (
              <button type="button" className="text-button text-button-perigo" onClick={() => setExcluindo(true)}>
                <Trash2 size={14} strokeWidth={2} /> Excluir prestador
              </button>
            ) : null}
            <span className="ficha-usuario-rodape-espaco" />
            <button type="button" className="button-secondary" onClick={aoFechar}>
              Cancelar
            </button>
            <button type="submit" className="button-primary">
              {prestador ? "Salvar alterações" : "Cadastrar prestador"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
