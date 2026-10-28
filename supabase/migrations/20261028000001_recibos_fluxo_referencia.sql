-- ════════════════════════════════════════════════════════════════════════════
-- Recibos no fluxo do sistema de referência
--
-- 1) Histórico de atividades (recibos_registros): quem lançou, editou, enviou,
--    conferiu e pagou. O prestador anota os dele; a equipe, todos.
-- 2) Prestador edita e exclui os próprios recibos a qualquer momento (como na
--    referência), mas só o escritório muda a situação além de rascunho,
--    pendente de envio e enviado — o gatilho garante isso.
-- 3) Escritório edita e exclui recibos e lotes a qualquer momento.
-- 4) Lote rejeitado pode ser reenviado pelo prestador.
-- ════════════════════════════════════════════════════════════════════════════

create table public.recibos_registros (
  id text primary key,
  dados jsonb not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid default auth.uid()
);
alter table public.recibos_registros enable row level security;
revoke all on public.recibos_registros from anon;
alter table public.recibos_registros add column prestador_id text generated always as (dados ->> 'prestadorId') stored;
create index recibos_registros_prestador on public.recibos_registros (prestador_id);

create policy ver on public.recibos_registros for select to authenticated
  using (public.ve_modulo('prestadores') or prestador_id = public.meu_prestador());
create policy incluir on public.recibos_registros for insert to authenticated
  with check (
    (public.eh_equipe() and (public.ve_modulo('prestadores') or public.eh_financeiro()))
    or prestador_id = public.meu_prestador()
  );

create trigger carimbar before insert or update on public.recibos_registros for each row execute function public.carimbar();
alter publication supabase_realtime add table public.recibos_registros;

-- ── Recibos ─────────────────────────────────────────────────────────────────

drop policy portal_incluir on public.recibos;
create policy portal_incluir on public.recibos for insert to authenticated
  with check (prestador_id = public.meu_prestador() and dados ->> 'status' in ('Rascunho', 'Pendente de envio'));

drop policy portal_alterar on public.recibos;
create policy portal_alterar on public.recibos for update to authenticated
  using (prestador_id = public.meu_prestador())
  with check (prestador_id = public.meu_prestador());

drop policy portal_excluir on public.recibos;
create policy portal_excluir on public.recibos for delete to authenticated
  using (prestador_id = public.meu_prestador());

drop policy equipe_alterar on public.recibos;
create policy equipe_alterar on public.recibos for update to authenticated
  using (public.pode_editar() and public.ve_modulo('prestadores'))
  with check (public.pode_editar() and public.ve_modulo('prestadores'));

drop policy equipe_excluir on public.recibos;
create policy equipe_excluir on public.recibos for delete to authenticated
  using (public.pode_editar() and public.ve_modulo('prestadores'));

-- O pagamento (financeiro) marca os recibos do lote como pagos.
create policy financeiro_alterar on public.recibos for update to authenticated
  using (public.eh_financeiro()) with check (public.eh_financeiro());

-- Só o escritório aprova, rejeita, pede ajuste ou paga.
create function public.recibo_situacao_portal() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or public.eh_equipe() then return new; end if;
  if new.dados ->> 'status' is distinct from old.dados ->> 'status'
     and (new.dados ->> 'status' not in ('Rascunho', 'Pendente de envio', 'Enviado')
          or old.dados ->> 'status' in ('Aprovado', 'Pago')) then
    raise exception 'Só o escritório muda a situação deste recibo.';
  end if;
  -- A observação do escritório não é do prestador.
  new.dados := jsonb_set(new.dados, '{reviewNote}', coalesce(old.dados -> 'reviewNote', 'null'::jsonb));
  return new;
end $$;
revoke execute on function public.recibo_situacao_portal() from public, anon, authenticated;
create trigger recibo_situacao_portal before update on public.recibos for each row execute function public.recibo_situacao_portal();

-- ── Fechamentos: reenviar lote rejeitado ───────────────────────────────────

drop policy portal_alterar on public.fechamentos;
create policy portal_alterar on public.fechamentos for update to authenticated
  using (prestador_id = public.meu_prestador() and coalesce(dados ->> 'review', 'Aguardando conferência') in ('Aguardando conferência', 'Rejeitado'))
  with check (prestador_id = public.meu_prestador() and dados ->> 'review' = 'Aguardando conferência');
