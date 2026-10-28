import { pode } from "@/_core/identidade/permissoes";
import { gerarId, formatarDataHora } from "@/_core/tempo";
import { useUsuarioAtual } from "@/_core/identidade/sessao";
import Cabecalho from "@/admin/componentes/Cabecalho";
import Campo from "@/admin/componentes/Campo";
import Painel from "@/admin/componentes/Painel";
import Selo from "@/admin/componentes/Selo";
import Vazio from "@/admin/componentes/Vazio";
import { salvarFornecedor, validarFornecedor } from "@/modulos/pagamentos/acoes";
import { useDadosPagamentos } from "@/modulos/pagamentos/colecoes";
import type { Fornecedor } from "@/modulos/pagamentos/tipos";
import { Building2, Plus, ShieldCheck } from "lucide-react";
import { useState } from "react";

export default function Fornecedores() {
  const usuario = useUsuarioAtual();
  const { fornecedores } = useDadosPagamentos();
  const [editando, setEditando] = useState<Fornecedor | "novo" | null>(null);
  const [validando, setValidando] = useState<Fornecedor | null>(null);
  const podeEditar = pode(usuario, "pagamentos.fornecedores");
  const pendentes = fornecedores.filter((f) => !f.dadosValidados);

  return (
    <>
      <Cabecalho
        rotulo="Contas a pagar"
        titulo="Fornecedores"
        descricao="Quem recebe pagamentos do escritório. Troca de dados bancários bloqueia novos pagamentos até ser confirmada por telefone."
        acoes={
          podeEditar ? (
            <button type="button" className="button-primary" onClick={() => setEditando("novo")}>
              <Plus size={15} strokeWidth={2.2} /> Novo fornecedor
            </button>
          ) : null
        }
      />
      {pendentes.length ? (
        <ul className="alertas-ordens">
          {pendentes.map((f) => (
            <li key={f.id} className="alerta-ordem alerta-red">
              <span>{f.nome}: dados bancários alterados e ainda não validados.</span>
              {podeEditar ? (
                <button type="button" className="text-button" onClick={() => setValidando(f)}>
                  Validar
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      <section className="operations-surface">
        {fornecedores.length === 0 ? (
          <Vazio icone={Building2} titulo="Nenhum fornecedor cadastrado" />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Fornecedor</th>
                  <th>Dados bancários</th>
                  <th>Pix</th>
                  <th>Situação</th>
                  <th>
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {fornecedores.map((f) => (
                  <tr key={f.id}>
                    <td className="cell-main">
                      <strong>{f.nome}</strong>
                      <span>{f.documento}</span>
                    </td>
                    <td>{f.banco ? `${f.banco} · ag. ${f.agencia} · c/c ${f.conta}` : "Boleto / débito"}</td>
                    <td>{f.chavePix || "—"}</td>
                    <td>{f.dadosValidados ? <Selo tom="green">Validado</Selo> : <Selo tom="red">A validar</Selo>}</td>
                    <td>
                      {podeEditar ? (
                        <button type="button" className="text-button" onClick={() => setEditando(f)}>
                          Editar
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {editando ? <FormularioFornecedor fornecedor={editando === "novo" ? null : editando} autor={usuario?.nome ?? ""} aoFechar={() => setEditando(null)} /> : null}
      {validando ? (
        <Painel
          rotulo="Validação"
          titulo={validando.nome}
          descricao="Ligue para um contato que você já conhecia (não para o telefone do e-mail que pediu a troca) e confirme banco, agência, conta e Pix."
          aoFechar={() => setValidando(null)}
          aoEnviar={() => {
            validarFornecedor(validando.id, usuario?.nome ?? "");
            setValidando(null);
          }}
          textoEnviar="Confirmei por telefone"
        >
          <dl className="data-list">
            <div>
              <dt>Banco</dt>
              <dd>{validando.banco ? `${validando.banco} · ag. ${validando.agencia} · c/c ${validando.conta}` : "—"}</dd>
            </div>
            <div>
              <dt>Pix</dt>
              <dd>{validando.chavePix || "—"}</dd>
            </div>
          </dl>
          <ul className="historico-ordem espaco-acima">
            {[...validando.historico].reverse().map((evento, i) => (
              <li key={i}>
                <strong>{evento.texto}</strong>
                <span>
                  {formatarDataHora(evento.quando)} · {evento.autor}
                </span>
              </li>
            ))}
          </ul>
        </Painel>
      ) : null}
    </>
  );
}

function FormularioFornecedor({ fornecedor, autor, aoFechar }: { fornecedor: Fornecedor | null; autor: string; aoFechar: () => void }) {
  const [dados, setDados] = useState({
    nome: fornecedor?.nome ?? "",
    documento: fornecedor?.documento ?? "",
    email: fornecedor?.email ?? "",
    banco: fornecedor?.banco ?? "",
    agencia: fornecedor?.agencia ?? "",
    conta: fornecedor?.conta ?? "",
    chavePix: fornecedor?.chavePix ?? "",
  });
  const [erro, setErro] = useState<string | null>(null);
  const campo = (chave: keyof typeof dados, rotulo: string) => (
    <Campo id={`forn-${chave}`} rotulo={rotulo} erro={chave === "nome" ? (erro ?? undefined) : undefined}>
      {(aria) => <input {...aria} className="field-input" value={dados[chave]} onChange={(e) => setDados({ ...dados, [chave]: e.target.value })} />}
    </Campo>
  );
  return (
    <Painel
      rotulo="Fornecedores"
      titulo={fornecedor ? fornecedor.nome : "Novo fornecedor"}
      descricao={fornecedor ? "Mudar banco, agência, conta ou Pix exige nova validação antes do próximo pagamento." : undefined}
      aoFechar={aoFechar}
      aoEnviar={() => {
        if (!dados.nome.trim()) return setErro("Informe o nome.");
        salvarFornecedor({ id: fornecedor?.id ?? gerarId("forn"), dadosValidados: fornecedor?.dadosValidados ?? true, historico: fornecedor?.historico ?? [], ...dados }, autor);
        aoFechar();
      }}
    >
      {campo("nome", "Razão social / nome")}
      <div className="field-grid">
        {campo("documento", "CNPJ / CPF")}
        {campo("email", "E-mail")}
      </div>
      <div className="field-grid">
        {campo("banco", "Banco")}
        {campo("agencia", "Agência")}
      </div>
      <div className="field-grid">
        {campo("conta", "Conta")}
        {campo("chavePix", "Chave Pix")}
      </div>
    </Painel>
  );
}
