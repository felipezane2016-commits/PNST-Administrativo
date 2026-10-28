import type { Usuario } from "@/_core/identidade/permissoes";
import { formatarData } from "@/_core/tempo";
import Painel from "@/admin/componentes/Painel";
import { formatBRL } from "@/lib/portal";
import { excluirPagamento } from "@/modulos/pagamentos/acoes";
import type { Pagamento } from "@/modulos/pagamentos/tipos";
import { useState } from "react";

/** Confirmação para excluir um pedido de pagamento de vez. */
export default function ExcluirPagamento({ pagamento, usuario, aoFechar, aoExcluir }: { pagamento: Pagamento; usuario: Usuario; aoFechar: () => void; aoExcluir: () => void }) {
  const [erro, setErro] = useState<string | null>(null);
  return (
    <Painel
      rotulo={`${pagamento.numero} · ${pagamento.status}`}
      titulo="Excluir este pedido de pagamento?"
      aoFechar={aoFechar}
      aoEnviar={() => {
        const motivo = excluirPagamento(pagamento.id, usuario);
        if (motivo) return setErro(motivo);
        aoExcluir();
      }}
      textoEnviar="Excluir pedido"
    >
      <p>
        <strong>{pagamento.favorecido}</strong> — {formatBRL(pagamento.valor)}, vence {formatarData(pagamento.vencimento)}.
      </p>
      <p className="field-hint">{pagamento.descricao}</p>
      <p className="texto-perigo">
        O pedido some da lista, das aprovações e do histórico, com os documentos anexados. Não dá para desfazer. Para manter o registro, prefira cancelar.
      </p>
      {erro ? (
        <p className="acesso-alerta-erro" role="alert">
          {erro}
        </p>
      ) : null}
    </Painel>
  );
}
