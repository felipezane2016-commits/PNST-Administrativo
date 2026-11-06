import { guardarAnexo, pastaDoPrestador } from "@/_core/armazenamento/anexos";
import { useColecao } from "@/_core/armazenamento/colecao";
import { HOJE } from "@/_core/tempo";
import Campo from "@/admin/componentes/Campo";
import Painel from "@/admin/componentes/Painel";
import Vazio from "@/admin/componentes/Vazio";
import CabecalhoPagina from "@/components/CabecalhoPagina";
import PortalShell from "@/components/PortalShell";
import { FORMATOS_DOCUMENTO } from "@/components/ReceiptModal";
import { DetalhesServico, ExecucaoServico, HistoricoServico, SeloServico } from "@/components/ServicoDetalhes";
import { usePortal } from "@/contexts/PortalContext";
import { competenciaOf, maskAmount, type ArquivoAnexo } from "@/lib/portal";
import { aceitarServico, concluirServico, descartarComprovantes, iniciarServico, recusarServico } from "@/modulos/servicos/acoes";
import { servicos } from "@/modulos/servicos/colecao";
import { emAndamento, podeAceitar, podeConcluir, podeIniciar, type RascunhoConclusao } from "@/modulos/servicos/regras";
import type { Servico } from "@/modulos/servicos/tipos";
import { Check, CheckCircle2, ChevronDown, ChevronUp, Inbox, Paperclip, Play, Upload, X } from "lucide-react";
import { useRef, useState, type ChangeEvent } from "react";
import { useLocation } from "wouter";

type Aba = "novos" | "andamento" | "concluidos" | "encerrados";
const ABAS: { chave: Aba; rotulo: string; filtro: (s: Servico) => boolean }[] = [
  { chave: "novos", rotulo: "Novos", filtro: (s) => s.situacao === "Solicitado" },
  { chave: "andamento", rotulo: "Em andamento", filtro: emAndamento },
  { chave: "concluidos", rotulo: "Concluídos", filtro: (s) => s.situacao === "Concluído" },
  { chave: "encerrados", rotulo: "Recusados e cancelados", filtro: (s) => s.situacao === "Recusado" || s.situacao === "Cancelado" },
];

const LIMITE_ARQUIVO = 20 * 1024 * 1024;

/**
 * Serviços pedidos pelo escritório a este prestador: aceitar ou recusar,
 * executar e concluir com o valor e o comprovante — o recibo é criado na hora
 * e entra no fechamento do mês.
 */
export default function Services() {
  const { prestadorId, provider, createReceipt } = usePortal();
  const todos = useColecao(servicos);
  const [, navegar] = useLocation();
  const meus = todos.filter((s) => s.prestadorId === prestadorId);
  const [aba, setAba] = useState<Aba>(() => (meus.some((s) => s.situacao === "Solicitado") ? "novos" : "andamento"));
  const [recusando, setRecusando] = useState<Servico | null>(null);
  const [concluindo, setConcluindo] = useState<Servico | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const daAba = meus
    .filter(ABAS.find((item) => item.chave === aba)!.filtro)
    .sort((a, b) => Number(b.urgente) - Number(a.urgente) || (aba === "novos" || aba === "andamento" ? a.data.localeCompare(b.data) : b.criadoEm.localeCompare(a.criadoEm)));

  function executar(falha: string | null, sucesso: string) {
    setAviso(falha ?? sucesso);
  }

  return (
    <PortalShell title="Serviços">
      <CabecalhoPagina rotulo="Solicitações do escritório" titulo="Serviços" descricao="Aceite os pedidos do escritório, execute e conclua informando o valor — o recibo é criado automaticamente." />

      {aviso ? (
        <p className="acesso-alerta-aviso espaco-abaixo" role="status">
          {aviso}
        </p>
      ) : null}

      <div className="filter-chips espaco-abaixo" role="tablist" aria-label="Serviços">
        {ABAS.map((item) => {
          const total = meus.filter(item.filtro).length;
          return (
            <button key={item.chave} type="button" role="tab" aria-selected={aba === item.chave} className={aba === item.chave ? "filter-chip filter-chip-active" : "filter-chip"} onClick={() => setAba(item.chave)}>
              {item.rotulo}
              <span className="filter-chip-count" aria-hidden="true">
                {total}
              </span>
            </button>
          );
        })}
      </div>

      {daAba.length === 0 ? (
        <section className="operations-surface">
          <Vazio icone={Inbox} titulo={aba === "novos" ? "Nenhum pedido novo" : "Nada por aqui"} texto={aba === "novos" ? "Quando o escritório pedir um serviço a você, ele aparece aqui e no sino." : undefined} />
        </section>
      ) : (
        <ul className="servico-lista">
          {daAba.map((s) => (
            <CartaoServico
              key={s.id}
              servico={s}
              aoAceitar={() => executar(aceitarServico(s.id, prestadorId, provider.name), `${s.numero} aceito. O escritório foi avisado.`)}
              aoRecusar={() => setRecusando(s)}
              aoIniciar={() => executar(iniciarServico(s.id, prestadorId, provider.name), `${s.numero} em execução.`)}
              aoConcluir={() => setConcluindo(s)}
              aoVerRecibo={() => navegar("/recibos")}
            />
          ))}
        </ul>
      )}

      {recusando ? (
        <Recusar
          servico={recusando}
          aoFechar={() => setRecusando(null)}
          aoRecusar={(motivo) => {
            const falha = recusarServico(recusando.id, prestadorId, motivo, provider.name);
            if (falha) return falha;
            setRecusando(null);
            setAviso(`${recusando.numero} recusado. O escritório vai escolher outro prestador.`);
            return null;
          }}
        />
      ) : null}

      {concluindo ? (
        <Concluir
          servico={concluindo}
          prestadorId={prestadorId}
          aoFechar={() => setConcluindo(null)}
          aoConcluir={(conclusao, comprovantes) => {
            const resultado = concluirServico(concluindo.id, prestadorId, conclusao, comprovantes, provider.name, createReceipt);
            if (!resultado.ok) return resultado.erro;
            setConcluindo(null);
            setAba("concluidos");
            setAviso(`${concluindo.numero} concluído. Recibo ${resultado.recibo.id} criado e pronto para o fechamento do mês.`);
            return null;
          }}
        />
      ) : null}
    </PortalShell>
  );
}

function CartaoServico({
  servico,
  aoAceitar,
  aoRecusar,
  aoIniciar,
  aoConcluir,
  aoVerRecibo,
}: {
  servico: Servico;
  aoAceitar: () => void;
  aoRecusar: () => void;
  aoIniciar: () => void;
  aoConcluir: () => void;
  aoVerRecibo: () => void;
}) {
  const [historico, setHistorico] = useState(false);
  const novo = servico.situacao === "Solicitado";
  return (
    <li className={novo ? "servico-cartao servico-cartao-novo" : "servico-cartao"}>
      <div className="servico-cartao-topo">
        <div>
          <span className="eyebrow">
            {servico.numero} · {servico.categoria}
          </span>
          <h3>
            {servico.cliente}
            {servico.urgente ? <span className="marca-urgente"> Urgente</span> : null}
          </h3>
        </div>
        <SeloServico servico={servico} />
      </div>
      <DetalhesServico servico={servico} semCliente />
      {servico.execucao ? (
        <>
          <h4 className="drawer-secao">Sua execução</h4>
          <ExecucaoServico servico={servico} />
        </>
      ) : null}
      {historico ? (
        <>
          <h4 className="drawer-secao">Andamento</h4>
          <HistoricoServico servico={servico} />
        </>
      ) : null}
      <div className="servico-cartao-acoes">
        {podeAceitar(servico) ? (
          <>
            <button type="button" className="button-primary" onClick={aoAceitar}>
              <Check size={15} strokeWidth={2.2} /> Aceitar
            </button>
            <button type="button" className="button-secondary" onClick={aoRecusar}>
              <X size={15} strokeWidth={2.2} /> Recusar
            </button>
          </>
        ) : null}
        {podeIniciar(servico) ? (
          <button type="button" className="button-secondary" onClick={aoIniciar}>
            <Play size={14} strokeWidth={2.2} /> Iniciar execução
          </button>
        ) : null}
        {podeConcluir(servico) ? (
          <button type="button" className="button-primary" onClick={aoConcluir}>
            <CheckCircle2 size={15} strokeWidth={2.2} /> Concluir e informar valor
          </button>
        ) : null}
        {servico.reciboId ? (
          <button type="button" className="button-secondary" onClick={aoVerRecibo}>
            Ver recibo {servico.reciboId}
          </button>
        ) : null}
        <button type="button" className="text-button text-button-neutro" aria-expanded={historico} onClick={() => setHistorico((v) => !v)}>
          {historico ? <ChevronUp size={14} strokeWidth={2} /> : <ChevronDown size={14} strokeWidth={2} />} Andamento
        </button>
      </div>
    </li>
  );
}

function Recusar({ servico, aoFechar, aoRecusar }: { servico: Servico; aoFechar: () => void; aoRecusar: (motivo: string) => string | null }) {
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  return (
    <Painel rotulo={servico.numero} titulo="Recusar serviço" descricao="O escritório vê o motivo e escolhe outro prestador." aoFechar={aoFechar} textoEnviar="Recusar" aoEnviar={() => setErro(aoRecusar(motivo))}>
      <Campo id="sv-recusa" rotulo="Motivo *" erro={erro ?? undefined}>
        {(aria) => <textarea {...aria} className="field-input" rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: sem disponibilidade nesse horário" autoFocus />}
      </Campo>
    </Painel>
  );
}

function Concluir({
  servico,
  prestadorId,
  aoFechar,
  aoConcluir,
}: {
  servico: Servico;
  prestadorId: string;
  aoFechar: () => void;
  aoConcluir: (conclusao: RascunhoConclusao, comprovantes: ArquivoAnexo[]) => string | null;
}) {
  const [dados, setDados] = useState<RascunhoConclusao>({ valor: "", data: servico.data <= HOJE ? servico.data : HOJE, observacao: "" });
  const [comprovantes, setComprovantes] = useState<ArquivoAnexo[]>([]);
  const [enviando, setEnviando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const concluiu = useRef(false);

  function fechar() {
    // Comprovantes enviados e abandonados não ficam guardados.
    if (!concluiu.current) void descartarComprovantes(comprovantes);
    aoFechar();
  }

  async function anexar(evento: ChangeEvent<HTMLInputElement>) {
    const arquivos = Array.from(evento.target.files ?? []);
    evento.target.value = "";
    const pasta = pastaDoPrestador(prestadorId, competenciaOf(dados.data) || HOJE.slice(0, 7));
    for (const arquivo of arquivos) {
      if (arquivo.size > LIMITE_ARQUIVO) {
        setErro(`${arquivo.name} tem mais de 20 MB.`);
        continue;
      }
      setEnviando(arquivo.name);
      try {
        const anexo = await guardarAnexo(arquivo, pasta);
        setComprovantes((atual) => [...atual, { id: anexo.id, nome: anexo.nome, tipo: anexo.tipo, tamanho: arquivo.size }]);
      } catch {
        setErro(`Não foi possível enviar ${arquivo.name}. Tente de novo.`);
      }
    }
    setEnviando(null);
  }

  return (
    <Painel
      rotulo={`${servico.numero} · ${servico.cliente}`}
      titulo="Concluir serviço"
      descricao="Informe o valor e anexe o comprovante. O recibo é criado como pendente de envio e entra no fechamento do mês."
      aoFechar={fechar}
      textoEnviar={enviando ? "Enviando arquivo…" : "Concluir e gerar recibo"}
      aoEnviar={() => {
        if (enviando) return;
        const falha = aoConcluir(dados, comprovantes);
        if (falha) return setErro(falha);
        concluiu.current = true;
      }}
    >
      <div className="field-grid">
        <Campo id="sv-valor" rotulo="Valor do serviço *">
          {(aria) => (
            <span className="campo-moeda">
              <span className="campo-moeda-simbolo" aria-hidden="true">
                R$
              </span>
              <input {...aria} className="field-input" value={dados.valor} onChange={(e) => setDados({ ...dados, valor: maskAmount(e.target.value) })} placeholder="0,00" inputMode="numeric" autoComplete="off" autoFocus />
            </span>
          )}
        </Campo>
        <Campo id="sv-feito" rotulo="Feito em *">
          {(aria) => <input {...aria} className="field-input" type="date" max={HOJE} value={dados.data} onChange={(e) => setDados({ ...dados, data: e.target.value })} />}
        </Campo>
      </div>
      <Campo id="sv-obs" rotulo="Observação" dica="Opcional — entra na descrição do recibo.">
        {(aria) => <textarea {...aria} className="field-input" rows={2} value={dados.observacao} onChange={(e) => setDados({ ...dados, observacao: e.target.value })} placeholder="Ex.: entregue em mãos na recepção" />}
      </Campo>
      <div className="field-group">
        <span className="field-label">Comprovantes</span>
        {comprovantes.length ? (
          <ul className="anexo-chips" aria-label="Comprovantes anexados">
            {comprovantes.map((arquivo, indice) => (
              <li className="anexo-chip" key={`${arquivo.id ?? arquivo.nome}-${indice}`}>
                <span className="anexo-chip-abrir">
                  <Paperclip size={12} strokeWidth={2} /> {arquivo.nome}
                </span>
                <button
                  type="button"
                  className="anexo-chip-tirar"
                  aria-label={`Tirar ${arquivo.nome}`}
                  onClick={() => {
                    void descartarComprovantes([arquivo]);
                    setComprovantes((atual) => atual.filter((item) => item !== arquivo));
                  }}
                >
                  <X size={12} strokeWidth={2.2} />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <label className="upload-zone upload-zone-compacta">
          <input type="file" multiple accept={FORMATOS_DOCUMENTO} onChange={anexar} disabled={Boolean(enviando)} aria-label="Anexar comprovantes" />
          <Upload size={17} strokeWidth={1.9} />
          <span className="upload-zone-texto">
            <strong>{enviando ? `Enviando ${enviando}…` : "Anexar comprovante"}</strong>
            <span>Foto, PDF ou documento — até 20 MB cada</span>
          </span>
        </label>
      </div>
      {erro ? (
        <p className="field-error" role="alert">
          {erro}
        </p>
      ) : null}
    </Painel>
  );
}
