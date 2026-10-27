import { useColecao } from "@/_core/armazenamento/colecao";
import { pode } from "@/_core/identidade/permissoes";
import { usuarios, useUsuarioAtual } from "@/_core/identidade/sessao";
import { formatarData, HOJE } from "@/_core/tempo";
import Cabecalho from "@/admin/componentes/Cabecalho";
import { salvarConfig } from "@/modulos/pagamentos/acoes";
import { useDadosPagamentos } from "@/modulos/pagamentos/colecoes";
import { aprovadorVigente } from "@/modulos/pagamentos/regras";
import { Save } from "lucide-react";
import { useState } from "react";

const REGRAS = [
  "Quem pede o pagamento não confere o próprio pedido.",
  "Quem confere ou pede não aprova: nesse caso a aprovação vai para o substituto.",
  "Quem aprova não registra o pagamento no banco.",
  "Sem documento anexado (nota, boleto, recibo, guia) o pedido não sai.",
  "Fornecedor que trocou os dados bancários só é pago depois da confirmação por telefone.",
  "Urgência e vencimento no passado exigem justificativa.",
];

export default function RegrasAprovacao() {
  const usuario = useUsuarioAtual();
  const { config } = useDadosPagamentos();
  const pessoas = useColecao(usuarios);
  const elegiveis = pessoas.filter((p) => p.ativo && (p.papel === "admin" || p.papel === "gestor"));
  const podeEditar = pode(usuario, "usuarios.gerenciar") || usuario?.id === config.aprovadorId;
  const [dados, setDados] = useState(config);
  const [salvo, setSalvo] = useState(false);
  const vigente = pessoas.find((p) => p.id === aprovadorVigente(config, HOJE));
  const nome = (id: string | null) => pessoas.find((p) => p.id === id)?.nome ?? "—";

  return (
    <>
      <Cabecalho
        rotulo="Contas a pagar"
        titulo="Regras de aprovação"
        descricao="O pedido é aprovado um nível acima de quem pediu. Quem pediu ou conferiu nunca aprova; quem aprovou não paga."
      />
      <section className="operations-surface espaco-abaixo">
        <span className="eyebrow">Hierarquia</span>
        <ul className="lista-alcadas espaco-acima-curto">
          <li>
            <strong>Pedido de operador ou leitor</strong>
            <span>aprova um gestor ou administrador</span>
          </li>
          <li>
            <strong>Pedido de gestor</strong>
            <span>aprova um administrador</span>
          </li>
          <li>
            <strong>Pedido de administrador</strong>
            <span>aprova o chefe da administração (ou o substituto no período)</span>
          </li>
        </ul>
        <p className="field-hint espaco-acima-curto">O chefe da administração aprova pedidos de qualquer nível. O nível de cada pessoa é o papel dela em Usuários e acessos.</p>
      </section>
      <div className="grid-2">
        <section className="operations-surface">
          <span className="eyebrow">Hoje, quem aprova os pedidos de administradores</span>
          <h3 className="espaco-acima-curto">{vigente?.nome ?? "—"}</h3>
          <p className="field-hint">
            {vigente?.id === config.aprovadorId ? "Chefe da administração." : `Substituindo ${nome(config.aprovadorId)} até ${formatarData(config.substitutoAte)}.`}
          </p>
          <form
            className="stack espaco-acima"
            onSubmit={(e) => {
              e.preventDefault();
              salvarConfig(dados);
              setSalvo(true);
            }}
          >
            <label className="field-group">
              <span className="field-label">Aprovador (chefe da administração)</span>
              <select className="field-input" value={dados.aprovadorId} disabled={!podeEditar} onChange={(e) => setDados({ ...dados, aprovadorId: e.target.value })}>
                {elegiveis.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome} — {p.departamento}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-group">
              <span className="field-label">Substituto (férias, ausências, e quando o próprio aprovador pede ou confere)</span>
              <select className="field-input" value={dados.substitutoId ?? ""} disabled={!podeEditar} onChange={(e) => setDados({ ...dados, substitutoId: e.target.value || null })}>
                <option value="">Sem substituto</option>
                {elegiveis
                  .filter((p) => p.id !== dados.aprovadorId)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome} — {p.departamento}
                    </option>
                  ))}
              </select>
            </label>
            <div className="field-grid">
              <label className="field-group">
                <span className="field-label">Substitui de</span>
                <input className="field-input" type="date" value={dados.substitutoDe ?? ""} disabled={!podeEditar} onChange={(e) => setDados({ ...dados, substitutoDe: e.target.value || null })} />
              </label>
              <label className="field-group">
                <span className="field-label">Até</span>
                <input className="field-input" type="date" value={dados.substitutoAte ?? ""} disabled={!podeEditar} onChange={(e) => setDados({ ...dados, substitutoAte: e.target.value || null })} />
              </label>
            </div>
            {podeEditar ? (
              <button type="submit" className="button-primary">
                <Save size={15} strokeWidth={2.2} /> Salvar
              </button>
            ) : (
              <p className="field-hint">Só o administrador ou o próprio aprovador altera.</p>
            )}
            {salvo ? (
              <p className="field-hint" role="status">
                Regras salvas.
              </p>
            ) : null}
          </form>
        </section>
        <section className="operations-surface">
          <span className="eyebrow">Segregação de funções</span>
          <ul className="checklist espaco-acima">
            {REGRAS.map((regra) => (
              <li key={regra} className="checklist-ok">
                <div>
                  <strong>{regra}</strong>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
