import { useColecao } from "@/_core/armazenamento/colecao";
import { pode } from "@/_core/identidade/permissoes";
import { useUsuarioAtual } from "@/_core/identidade/sessao";
import { formatarData, gerarId, HOJE } from "@/_core/tempo";
import Cabecalho from "@/admin/componentes/Cabecalho";
import Campo from "@/admin/componentes/Campo";
import Painel from "@/admin/componentes/Painel";
import Selo from "@/admin/componentes/Selo";
import Vazio from "@/admin/componentes/Vazio";
import { tarefasContas } from "@/modulos/contas/colecoes";
import { eventosDoDia, montarAgenda } from "@/modulos/escritorio/agenda";
import { reunioes } from "@/modulos/escritorio/colecoes";
import { CalendarCheck, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { TOM_EVENTO } from "./VisaoGeral";

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function nomeMes(ano: number, mes: number) {
  const texto = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(ano, mes, 1));
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function iso(ano: number, mes: number, dia: number) {
  return `${ano}-${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

export default function Calendario() {
  const usuario = useUsuarioAtual();
  const [, navegar] = useLocation();
  const agenda = montarAgenda({
    reunioes: useColecao(reunioes),
    tarefasContas: useColecao(tarefasContas),
  });
  const [ano, setAno] = useState(Number(HOJE.slice(0, 4)));
  const [mes, setMes] = useState(Number(HOJE.slice(5, 7)) - 1);
  const [selecionado, setSelecionado] = useState(HOJE);
  const [agendando, setAgendando] = useState(false);

  const primeiroDia = new Date(ano, mes, 1).getDay();
  const totalDias = new Date(ano, mes + 1, 0).getDate();
  const celulas: (number | null)[] = [...Array(primeiroDia).fill(null), ...Array.from({ length: totalDias }, (_, i) => i + 1)];
  while (celulas.length % 7) celulas.push(null);
  const doDia = eventosDoDia(agenda, selecionado);

  function mudarMes(delta: number) {
    const alvo = new Date(ano, mes + delta, 1);
    setAno(alvo.getFullYear());
    setMes(alvo.getMonth());
  }

  return (
    <>
      <Cabecalho
        rotulo="Escritório"
        titulo="Calendário"
        descricao="Reuniões e vencimentos de contas num só calendário."
        acoes={
          <>
            <button type="button" className="icon-button" aria-label="Mês anterior" onClick={() => mudarMes(-1)}>
              <ChevronLeft size={17} strokeWidth={2} />
            </button>
            <strong className="calendar-mes" aria-live="polite">
              {nomeMes(ano, mes)}
            </strong>
            <button type="button" className="icon-button" aria-label="Próximo mês" onClick={() => mudarMes(1)}>
              <ChevronRight size={17} strokeWidth={2} />
            </button>
            {pode(usuario, "calendario.editar") ? (
              <button type="button" className="button-primary" onClick={() => setAgendando(true)}>
                <Plus size={15} strokeWidth={2.2} /> Agendar reunião
              </button>
            ) : null}
          </>
        }
      />

      <div className="grid-main">
        <section className="operations-surface">
          <div className="inline-row espaco-abaixo-curto">
            <Selo tom="blue">Reunião</Selo>
            <Selo tom="amber">Pagamento</Selo>
          </div>
          <div className="calendar-grid">
            {DIAS_SEMANA.map((dia) => (
              <div key={dia} className="calendar-weekday" aria-hidden="true">
                {dia}
              </div>
            ))}
            {celulas.map((dia, indice) => {
              if (dia === null) return <div key={`v-${indice}`} className="calendar-day calendar-day-out" aria-hidden="true" />;
              const data = iso(ano, mes, dia);
              const eventos = eventosDoDia(agenda, data);
              const classes = [
                "calendar-day",
                data === HOJE ? "calendar-day-today" : "",
                data === selecionado ? "calendar-day-selected" : "",
              ].join(" ");
              return (
                <button
                  key={data}
                  type="button"
                  className={classes}
                  aria-pressed={data === selecionado}
                  aria-label={`${formatarData(data)}: ${eventos.length} evento(s)`}
                  onClick={() => setSelecionado(data)}
                >
                  <span className="calendar-day-number">{dia}</span>
                  {eventos.slice(0, 2).map((evento) => (
                    <span key={`${evento.tipo}-${evento.id}`} className={`calendar-chip status-${TOM_EVENTO[evento.tipo]}`}>
                      {evento.titulo}
                    </span>
                  ))}
                  {eventos.length > 2 ? <span className="calendar-more">+{eventos.length - 2}</span> : null}
                  {eventos.length > 0 ? <span className="calendar-dot" aria-hidden="true" /> : null}
                </button>
              );
            })}
          </div>
        </section>

        <section className="operations-surface">
          <div className="section-header">
            <div>
              <span className="eyebrow">Dia selecionado</span>
              <h3>{formatarData(selecionado)}</h3>
            </div>
          </div>
          {doDia.length === 0 ? (
            <Vazio icone={CalendarCheck} titulo="Nada neste dia" />
          ) : (
            <ul className="item-list">
              {doDia.map((evento) => (
                <li key={`${evento.tipo}-${evento.id}`} className="item-row">
                  <Selo tom={TOM_EVENTO[evento.tipo]}>{evento.tipo}</Selo>
                  <div className="item-row-copy">
                    <strong>
                      {evento.hora ? `${evento.hora} · ` : ""}
                      {evento.titulo}
                    </strong>
                    <span>{evento.detalhe}</span>
                  </div>
                  {evento.tipo !== "Reunião" ? (
                    <button type="button" className="text-button" onClick={() => navegar(evento.destino)}>
                      Abrir
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {agendando ? <FormularioReuniao data={selecionado} aoFechar={() => setAgendando(false)} /> : null}
    </>
  );
}

function FormularioReuniao({ data, aoFechar }: { data: string; aoFechar: () => void }) {
  const [dados, setDados] = useState({ titulo: "", data, hora: "10:00", local: "", participantes: "", pauta: "" });
  const [erros, setErros] = useState<{ titulo?: string; data?: string }>({});

  function salvar() {
    const encontrados = { titulo: dados.titulo.trim() ? undefined : "Informe o objetivo da reunião.", data: dados.data ? undefined : "Informe a data." };
    if (encontrados.titulo || encontrados.data) {
      setErros(encontrados);
      return;
    }
    reunioes.atualizar((lista) => [...lista, { id: gerarId("re"), ...dados, titulo: dados.titulo.trim() }]);
    aoFechar();
  }

  return (
    <Painel rotulo="Calendário" titulo="Agendar reunião" aoFechar={aoFechar} aoEnviar={salvar} textoEnviar="Agendar">
      <Campo id="re-titulo" rotulo="Título" erro={erros.titulo}>
        {(aria) => <input {...aria} className="field-input" value={dados.titulo} onChange={(e) => setDados({ ...dados, titulo: e.target.value })} />}
      </Campo>
      <div className="field-grid">
        <Campo id="re-data" rotulo="Data" erro={erros.data}>
          {(aria) => <input {...aria} className="field-input" type="date" value={dados.data} onChange={(e) => setDados({ ...dados, data: e.target.value })} />}
        </Campo>
        <Campo id="re-hora" rotulo="Horário">
          {(aria) => <input {...aria} className="field-input" type="time" value={dados.hora} onChange={(e) => setDados({ ...dados, hora: e.target.value })} />}
        </Campo>
      </div>
      <Campo id="re-local" rotulo="Local ou link">
        {(aria) => <input {...aria} className="field-input" value={dados.local} onChange={(e) => setDados({ ...dados, local: e.target.value })} placeholder="Sala, Teams, Zoom…" />}
      </Campo>
      <Campo id="re-participantes" rotulo="Participantes">
        {(aria) => <input {...aria} className="field-input" value={dados.participantes} onChange={(e) => setDados({ ...dados, participantes: e.target.value })} placeholder="Nomes separados por vírgula" />}
      </Campo>
      <Campo id="re-pauta" rotulo="Pauta">
        {(aria) => <textarea {...aria} className="field-input" value={dados.pauta} onChange={(e) => setDados({ ...dados, pauta: e.target.value })} />}
      </Campo>
    </Painel>
  );
}
