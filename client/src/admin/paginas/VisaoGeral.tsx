import { useColecao } from "@/_core/armazenamento/colecao";
import { veModulo } from "@/_core/identidade/permissoes";
import { useUsuarioAtual } from "@/_core/identidade/sessao";
import { formatarData, HOJE, horaDeBrasilia, somarDias } from "@/_core/tempo";
import Cabecalho from "@/admin/componentes/Cabecalho";
import Kpi from "@/admin/componentes/Kpi";
import Selo, { type Tom } from "@/admin/componentes/Selo";
import Vazio from "@/admin/componentes/Vazio";
import { formatBRL, ROTULO_LOTE } from "@/lib/portal";
import { tarefasContas } from "@/modulos/contas/colecoes";
import { saudacao as saudacaoDaHora } from "@/modulos/contas/emails";
import { eventosDoDia, montarAgenda, vencendoEmBreve, type TipoEvento } from "@/modulos/escritorio/agenda";
import { reunioes } from "@/modulos/escritorio/colecoes";
import { conferenciaAberta, montarLotes } from "@/modulos/prestadores/regras";
import { useDadosPrestadores } from "@/modulos/prestadores/usarDados";
import { ArrowRight, CalendarCheck, CalendarDays, ClipboardCheck, Clock3 } from "lucide-react";
import { useLocation } from "wouter";

export const TOM_EVENTO: Record<TipoEvento, Tom> = { Reunião: "blue", Pagamento: "amber" };

function saudacao(nome: string) {
  const texto = saudacaoDaHora(horaDeBrasilia());
  return `${texto[0].toUpperCase()}${texto.slice(1)}, ${nome.split(" ")[0]}`;
}

export default function VisaoGeral() {
  const usuario = useUsuarioAtual();
  const [, navegar] = useLocation();
  const listaReunioes = useColecao(reunioes);
  const contas = useColecao(tarefasContas);
  const prestadores = useDadosPrestadores();

  if (!usuario) return null;
  const agenda = montarAgenda({ reunioes: listaReunioes, tarefasContas: contas });
  const hoje = eventosDoDia(agenda, HOJE);
  const emBreve = vencendoEmBreve(contas, HOJE, somarDias(HOJE, 7));
  const lotes = montarLotes(prestadores.recibos, prestadores.fechamentos, prestadores.prestadores).filter(conferenciaAberta);

  const veContas = veModulo(usuario, "contas");
  const vePrestadores = veModulo(usuario, "prestadores");
  const veCalendario = veModulo(usuario, "calendario");

  return (
    <>
      <Cabecalho
        rotulo={`Hoje · ${formatarData(HOJE)}`}
        titulo={saudacao(usuario.nome)}
        descricao="O que vence, o que espera decisão e a agenda do dia — de todos os módulos que você acompanha."
      />

      <div className="kpi-grid kpi-grid-fluido">
        {veContas ? (
          <Kpi rotulo="Vencendo em 7 dias" valor={String(emBreve.length)} detalhe="contas e tributos pendentes" icone={Clock3} tom="ambar" aoClicar={() => navegar("/contas")} />
        ) : null}
        {veCalendario ? (
          <Kpi rotulo="Eventos hoje" valor={String(hoje.length)} detalhe="reuniões e vencimentos" icone={CalendarDays} tom="neutro" aoClicar={() => navegar("/calendario")} />
        ) : null}
        {vePrestadores ? (
          <Kpi
            rotulo="Conferência pendente"
            valor={String(lotes.length)}
            detalhe={formatBRL(lotes.reduce((soma, lote) => soma + lote.total, 0))}
            icone={ClipboardCheck}
            tom="laranja"
            aoClicar={() => navegar("/prestadores/conferencia")}
          />
        ) : null}
      </div>

      <div className="grid-2">
        {veCalendario ? (
          <section className="operations-surface">
            <div className="section-header">
              <div>
                <span className="eyebrow">Agenda</span>
                <h3>Hoje</h3>
              </div>
              <button type="button" className="text-button" onClick={() => navegar("/calendario")}>
                Calendário <ArrowRight size={13} strokeWidth={2.2} />
              </button>
            </div>
            {hoje.length === 0 ? (
              <Vazio icone={CalendarCheck} titulo="Nada agendado para hoje" />
            ) : (
              <ul className="item-list">
                {hoje.map((evento) => (
                  <li className="item-row" key={`${evento.tipo}-${evento.id}`}>
                    <Selo tom={TOM_EVENTO[evento.tipo]}>{evento.hora ?? evento.tipo}</Selo>
                    <div className="item-row-copy">
                      <strong>{evento.titulo}</strong>
                      <span>{evento.detalhe}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}

        {veContas ? (
          <section className="operations-surface">
            <div className="section-header">
              <div>
                <span className="eyebrow">Account Management</span>
                <h3>Vencendo nos próximos 7 dias</h3>
              </div>
              <button type="button" className="text-button" onClick={() => navegar("/contas")}>
                Ver todas <ArrowRight size={13} strokeWidth={2.2} />
              </button>
            </div>
            {emBreve.length === 0 ? (
              <Vazio icone={CalendarCheck} titulo="Nada vencendo esta semana" />
            ) : (
              <ul className="item-list">
                {emBreve.slice(0, 6).map((tarefa) => (
                  <li className="item-row" key={tarefa.id}>
                    <Selo tom={tarefa.vencimento === HOJE ? "red" : "amber"}>{formatarData(tarefa.vencimento)}</Selo>
                    <div className="item-row-copy">
                      <strong>{tarefa.nome}</strong>
                      <span>{tarefa.categoria}</span>
                    </div>
                  </li>
                ))}
                {emBreve.length > 6 ? (
                  <li className="item-row">
                    <span className="field-hint">e mais {emBreve.length - 6}</span>
                  </li>
                ) : null}
              </ul>
            )}
          </section>
        ) : null}

        {vePrestadores ? (
          <section className="operations-surface">
            <div className="section-header">
              <div>
                <span className="eyebrow">Prestadores</span>
                <h3>Aguardando conferência</h3>
              </div>
              <button type="button" className="text-button" onClick={() => navegar("/prestadores/conferencia")}>
                Conferir <ArrowRight size={13} strokeWidth={2.2} />
              </button>
            </div>
            {lotes.length === 0 ? (
              <Vazio icone={ClipboardCheck} titulo="Nenhum lote pendente" />
            ) : (
              <ul className="item-list">
                {lotes.map((lote) => (
                  <li className="item-row" key={lote.chave}>
                    <div className="item-row-copy">
                      <strong>{lote.prestador.nome}</strong>
                      <span>
                        {lote.recibos.length} recibo(s) · {formatBRL(lote.total)}
                      </span>
                    </div>
                    <Selo tom={lote.situacao === "Aguardando conferência" ? "amber" : "blue"}>{ROTULO_LOTE[lote.situacao]}</Selo>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}
      </div>
    </>
  );
}
