-- Fornecedor pode ser excluído por quem cadastra fornecedores, desde que não
-- tenha pedido de pagamento em andamento (pago ou encerrado guarda o nome).
create policy excluir on public.pagamentos_fornecedores for delete to authenticated
  using (
    (public.tem('pagamentos.fornecedores') or public.eh_aprovador())
    and not exists (
      select 1 from public.pagamentos p
      where p.dados ->> 'fornecedorId' = pagamentos_fornecedores.id
        and p.status in ('Em conferência', 'Devolvido', 'Aguardando aprovação', 'Aprovado')
    )
  );
