import { formatarData, formatarDataHora } from "@/_core/tempo";
import { BotaoAnexo } from "@/admin/paginas/prestadores/ReciboDetalhe";
import { formatBRL } from "@/lib/portal";
import { TOM_DA_SITUACAO } from "@/modulos/servicos/regras";
import { CAMPOS_DA_CATEGORIA, type Servico } from "@/modulos/servicos/tipos";

/** Selo da situação do serviço (sempre com texto). */
export function SeloServico({ servico }: { servico: Pick<Servico, "situacao"> }) {
  return (
    <span className={TOM_DA_SITUACAO[servico.situacao]}>
      <span className="status-dot" aria-hidden="true" />
      {servico.situacao}
    </span>
  );
}

/** O pedido como o escritório escreveu: usado na gaveta do admin e no portal. */
export function DetalhesServico({ servico, prestador, semCliente }: { servico: Servico; prestador?: string; semCliente?: boolean }) {
  const campos = CAMPOS_DA_CATEGORIA[servico.categoria].filter((campo) => servico.detalhes[campo.chave]);
  return (
    <dl className="data-list data-list-recibo">
      {semCliente ? null : (
        <div>
          <dt>Cliente / Caso</dt>
          <dd>{servico.cliente}</dd>
        </div>
      )}
      <div>
        <dt>Quando</dt>
        <dd>
          {formatarData(servico.data)}
          {servico.horario ? ` às ${servico.horario}` : ""}
          {servico.urgente && !semCliente ? <span className="marca-urgente"> Urgente</span> : null}
        </dd>
      </div>
      {prestador ? (
        <div>
          <dt>Prestador</dt>
          <dd>{prestador}</dd>
        </div>
      ) : null}
      <div>
        <dt>Pedido por</dt>
        <dd>
          {servico.solicitante} · {formatarDataHora(servico.criadoEm)}
        </dd>
      </div>
      {campos.map((campo) => (
        <div key={campo.chave} className={campo.largo ? "data-list-cheio" : undefined}>
          <dt>{campo.rotulo}</dt>
          <dd>{servico.detalhes[campo.chave]}</dd>
        </div>
      ))}
      <div className="data-list-cheio">
        <dt>Instruções</dt>
        <dd>{servico.descricao}</dd>
      </div>
      {servico.motivoRecusa ? (
        <div className="data-list-cheio">
          <dt>Motivo da recusa</dt>
          <dd>{servico.motivoRecusa}</dd>
        </div>
      ) : null}
      {servico.motivoCancelamento ? (
        <div className="data-list-cheio">
          <dt>Motivo do cancelamento</dt>
          <dd>{servico.motivoCancelamento}</dd>
        </div>
      ) : null}
    </dl>
  );
}

/** O que o prestador informou ao concluir. */
export function ExecucaoServico({ servico }: { servico: Servico }) {
  const execucao = servico.execucao;
  if (!execucao) return null;
  return (
    <dl className="data-list data-list-recibo">
      <div>
        <dt>Valor informado</dt>
        <dd className="money">{formatBRL(execucao.valor)}</dd>
      </div>
      <div>
        <dt>Feito em</dt>
        <dd>{formatarData(execucao.data)}</dd>
      </div>
      <div>
        <dt>Recibo</dt>
        <dd className="texto-mono">{servico.reciboId ?? "—"}</dd>
      </div>
      {execucao.observacao ? (
        <div className="data-list-cheio">
          <dt>Observação do prestador</dt>
          <dd>{execucao.observacao}</dd>
        </div>
      ) : null}
      <div className="data-list-cheio">
        <dt>Comprovantes</dt>
        <dd>
          {execucao.comprovantes.length ? (
            <span className="anexo-chips">
              {execucao.comprovantes.map((arquivo, indice) => (
                <BotaoAnexo key={`${arquivo.id ?? arquivo.nome}-${indice}`} id={arquivo.id} nome={arquivo.nome} rotulo={arquivo.nome} />
              ))}
            </span>
          ) : (
            <span className="texto-apoio">Nenhum comprovante anexado</span>
          )}
        </dd>
      </div>
    </dl>
  );
}

/** Linha do tempo do pedido (mais recente em cima). */
export function HistoricoServico({ servico }: { servico: Servico }) {
  return (
    <ol className="log-lista">
      {[...servico.historico].reverse().map((passo, indice) => (
        <li key={`${passo.quando}-${indice}`} className="log-linha">
          <div>
            <strong>{passo.texto}</strong>
            <span className="texto-apoio">
              {passo.autor} · {formatarDataHora(passo.quando)}
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}
