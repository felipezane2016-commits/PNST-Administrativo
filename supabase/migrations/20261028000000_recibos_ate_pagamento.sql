-- ════════════════════════════════════════════════════════════════════════════
-- Recibos: quem mexe e até quando
--
-- Prestador: edita e exclui qualquer recibo dele até o escritório finalizar a
-- conferência do mês (editar um aprovado devolve para a conferência, como
-- "Enviado"). Escritório: corrige e exclui até o mês ser pago.
-- ════════════════════════════════════════════════════════════════════════════

create function public.lote_pago(prestador text, competencia text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.fechamentos f
    where f.prestador_id = prestador and f.dados ->> 'competencia' = competencia and f.dados ->> 'review' = 'Pago'
  )
$$;
revoke execute on function public.lote_pago(text, text) from public, anon;
grant execute on function public.lote_pago(text, text) to authenticated;

drop policy portal_alterar on public.recibos;
create policy portal_alterar on public.recibos for update to authenticated
  using (prestador_id = public.meu_prestador() and not public.lote_fechado(prestador_id, dados ->> 'competencia'))
  with check (prestador_id = public.meu_prestador() and dados ->> 'status' in ('Rascunho', 'Enviado')
    and not public.lote_fechado(prestador_id, dados ->> 'competencia'));

drop policy portal_excluir on public.recibos;
create policy portal_excluir on public.recibos for delete to authenticated
  using (prestador_id = public.meu_prestador() and not public.lote_fechado(prestador_id, dados ->> 'competencia'));

drop policy equipe_alterar on public.recibos;
create policy equipe_alterar on public.recibos for update to authenticated
  using (public.pode_editar() and public.ve_modulo('prestadores') and not public.lote_pago(prestador_id, dados ->> 'competencia'))
  with check (public.pode_editar() and public.ve_modulo('prestadores') and not public.lote_pago(prestador_id, dados ->> 'competencia'));

drop policy equipe_excluir on public.recibos;
create policy equipe_excluir on public.recibos for delete to authenticated
  using (public.pode_editar() and public.ve_modulo('prestadores') and not public.lote_pago(prestador_id, dados ->> 'competencia'));
