import { useUsuarioAtual } from "@/_core/identidade/sessao";
import { useNotificacoesVisiveis } from "@/admin/notificacoesVisiveis";
import { useColecao } from "@/_core/armazenamento/colecao";
import { formatarDataHora } from "@/_core/tempo";
import Cabecalho from "@/admin/componentes/Cabecalho";
import Vazio from "@/admin/componentes/Vazio";
import { notificacoes, type TipoNotificacao } from "@/modulos/notificacoes/colecao";
import { AlertTriangle, BellOff, CalendarDays, CheckCircle2, FileText, Info, ListChecks, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";

const ICONE: Record<TipoNotificacao, LucideIcon> = {
  atencao: AlertTriangle,
  tarefa: ListChecks,
  sucesso: CheckCircle2,
  agenda: CalendarDays,
  documento: FileText,
  informacao: Info,
};

export default function Notificacoes() {
  const usuario = useUsuarioAtual();
  // Só o que a pessoa pode resolver, pelas permissões dela.
  const lista = useNotificacoesVisiveis(usuario);
  const ids = new Set(lista.map((aviso) => aviso.id));
  const [, navegar] = useLocation();
  const [soNaoLidas, setSoNaoLidas] = useState(false);
  const naoLidas = lista.filter((aviso) => !aviso.lida).length;
  const visiveis = soNaoLidas ? lista.filter((aviso) => !aviso.lida) : lista;

  function abrir(id: string, destino: string | null) {
    notificacoes.atualizar((atual) => atual.map((aviso) => (aviso.id === id ? { ...aviso, lida: true } : aviso)));
    if (destino) navegar(destino);
  }

  return (
    <>
      <Cabecalho
        rotulo="Escritório"
        titulo="Notificações"
        descricao={naoLidas ? `${naoLidas} não lida${naoLidas > 1 ? "s" : ""}.` : "Tudo em dia."}
        acoes={
          naoLidas ? (
            <button
              type="button"
              className="button-secondary"
              onClick={() => notificacoes.atualizar((atual) => atual.map((aviso) => (ids.has(aviso.id) ? { ...aviso, lida: true } : aviso)))}
            >
              Marcar todas como lidas
            </button>
          ) : null
        }
      />
      <section className="operations-surface">
        <div className="filter-chips espaco-abaixo-curto" role="group" aria-label="Filtrar">
          <button type="button" className={!soNaoLidas ? "filter-chip filter-chip-active" : "filter-chip"} aria-pressed={!soNaoLidas} onClick={() => setSoNaoLidas(false)}>
            Todas
          </button>
          <button type="button" className={soNaoLidas ? "filter-chip filter-chip-active" : "filter-chip"} aria-pressed={soNaoLidas} onClick={() => setSoNaoLidas(true)}>
            Não lidas <span className="filter-chip-count">{naoLidas}</span>
          </button>
        </div>
        {visiveis.length === 0 ? (
          <Vazio icone={BellOff} titulo="Nenhuma notificação" />
        ) : (
          <ul className="item-list">
            {visiveis.map((aviso) => {
              const Icone = ICONE[aviso.tipo];
              return (
                <li key={aviso.id} className={aviso.lida ? "item-row" : "item-row item-row-unread"}>
                  <span className="doc-icon" aria-hidden="true">
                    <Icone size={16} strokeWidth={1.9} />
                  </span>
                  <div className="item-row-copy">
                    <strong>
                      {aviso.titulo}
                      {!aviso.lida ? <span className="sr-only"> (não lida)</span> : null}
                    </strong>
                    <span>{aviso.corpo}</span>
                    <time dateTime={aviso.quando}>{formatarDataHora(aviso.quando)}</time>
                  </div>
                  {aviso.destino ? (
                    <button type="button" className="text-button" onClick={() => abrir(aviso.id, aviso.destino)}>
                      Abrir
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
