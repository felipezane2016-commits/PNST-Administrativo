-- Excluir pedido de pagamento: permissão própria (padrão: gestor e
-- administrador) e nunca o que já foi pago (está no razão da conciliação).
insert into public.permissoes_catalogo (acao, modulo, nivel) values ('pagamentos.excluir', 'pagamentos', 'excluir');

create policy excluir on public.pagamentos for delete to authenticated
  using (public.tem('pagamentos.excluir') and status is distinct from 'Pago');
