-- ════════════════════════════════════════════════════════════════════════════
-- Recibos com arquivo, edição e exclusão; aprovação pela hierarquia
--
-- 1) O prestador guarda os arquivos dele (comprovante do recibo, documento do
--    fechamento) em anexos/prestadores/<id do prestador>/... e só mexe ali.
--    A equipe já lê todo o bucket (política anexos_ver).
-- 2) Recibo muda (edição ou exclusão) enquanto não foi aprovado e o mês ainda
--    não foi conferido nem pago — pelo prestador e pelo escritório.
-- 3) Pagamento é aprovado um nível acima de quem pediu: operador ou leitor →
--    gestor (ou administrador); gestor → administrador; administrador → chefe
--    da administração (ou o substituto no período). O chefe vigente aprova
--    qualquer nível. Quem pediu ou conferiu nunca aprova; quem aprovou não paga.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1) Arquivos do prestador ─────────────────────────────────────────────────

create policy anexos_prestador_ver on storage.objects for select to authenticated
  using (bucket_id = 'anexos' and (storage.foldername(name))[1] = 'prestadores' and (storage.foldername(name))[2] = public.meu_prestador());
create policy anexos_prestador_incluir on storage.objects for insert to authenticated
  with check (bucket_id = 'anexos' and (storage.foldername(name))[1] = 'prestadores' and (storage.foldername(name))[2] = public.meu_prestador());
create policy anexos_prestador_excluir on storage.objects for delete to authenticated
  using (bucket_id = 'anexos' and (storage.foldername(name))[1] = 'prestadores' and (storage.foldername(name))[2] = public.meu_prestador());

-- ── 2) Recibos: editar e excluir ─────────────────────────────────────────────

-- Mês do prestador já conferido ou pago: os recibos dele não mudam mais.
create function public.lote_fechado(prestador text, competencia text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.fechamentos f
    where f.prestador_id = prestador and f.dados ->> 'competencia' = competencia and f.dados ->> 'review' in ('Conferido', 'Pago')
  )
$$;

drop policy portal_alterar on public.recibos;
create policy portal_alterar on public.recibos for update to authenticated
  using (prestador_id = public.meu_prestador() and dados ->> 'status' <> 'Aprovado' and not public.lote_fechado(prestador_id, dados ->> 'competencia'))
  with check (prestador_id = public.meu_prestador() and dados ->> 'status' in ('Rascunho', 'Enviado'));

drop policy portal_excluir on public.recibos;
create policy portal_excluir on public.recibos for delete to authenticated
  using (prestador_id = public.meu_prestador() and dados ->> 'status' <> 'Aprovado' and not public.lote_fechado(prestador_id, dados ->> 'competencia'));

drop policy equipe_excluir on public.recibos;
create policy equipe_excluir on public.recibos for delete to authenticated
  using (public.pode_editar() and public.ve_modulo('prestadores') and dados ->> 'status' <> 'Aprovado' and not public.lote_fechado(prestador_id, dados ->> 'competencia'));

-- ── 3) Aprovação pela hierarquia ────────────────────────────────────────────

-- Nível de uma pessoa da equipe: leitor e operador 1, gestor 2, administrador 3.
create function public.nivel_de(pessoa text) returns int
language sql stable security definer set search_path = '' as $$
  select case p.papel when 'admin' then 3 when 'gestor' then 2 else 1 end
  from public.perfis p where p.id::text = pessoa
$$;

-- Quem está logado pode aprovar um pedido feito por `solicitante`?
create function public.pode_aprovar_pagamento(solicitante text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.eh_equipe()
    and auth.uid()::text is distinct from solicitante
    and (
      auth.uid() = public.aprovador_vigente()
      or (coalesce(public.nivel_de(solicitante), 1) <= 1 and coalesce(public.nivel_de(auth.uid()::text), 0) >= 2)
      or (public.nivel_de(solicitante) = 2 and coalesce(public.nivel_de(auth.uid()::text), 0) >= 3)
    )
$$;

revoke execute on function public.lote_fechado(text, text), public.nivel_de(text), public.pode_aprovar_pagamento(text) from public, anon;
grant execute on function public.lote_fechado(text, text), public.nivel_de(text), public.pode_aprovar_pagamento(text) to authenticated;

-- Pagamentos: além de quem pediu, do financeiro e do chefe, veem (e decidem) os
-- que aguardam a aprovação da pessoa e os que ela já decidiu.
drop policy ver on public.pagamentos;
create policy ver on public.pagamentos for select to authenticated
  using (public.eh_equipe() and (
    solicitante_id = auth.uid()::text or public.eh_financeiro() or public.eh_aprovador()
    or dados #>> '{decisao,porId}' = auth.uid()::text or dados #>> '{aprovacao,porId}' = auth.uid()::text
    or (status = 'Aguardando aprovação' and public.pode_aprovar_pagamento(solicitante_id))
  ));
drop policy alterar on public.pagamentos;
create policy alterar on public.pagamentos for update to authenticated
  using (public.eh_equipe() and (
    solicitante_id = auth.uid()::text or public.eh_financeiro() or public.eh_aprovador()
    or (status = 'Aguardando aprovação' and public.pode_aprovar_pagamento(solicitante_id))
  ))
  with check (public.eh_equipe());

-- Quem aprova também confirma os dados bancários novos do fornecedor.
drop policy incluir on public.pagamentos_fornecedores;
create policy incluir on public.pagamentos_fornecedores for insert to authenticated
  with check (public.eh_financeiro() or public.eh_aprovador() or (public.eh_equipe() and public.nivel_de(auth.uid()::text) >= 2));
drop policy alterar on public.pagamentos_fornecedores;
create policy alterar on public.pagamentos_fornecedores for update to authenticated
  using (public.eh_financeiro() or public.eh_aprovador() or (public.eh_equipe() and public.nivel_de(auth.uid()::text) >= 2))
  with check (public.eh_financeiro() or public.eh_aprovador() or (public.eh_equipe() and public.nivel_de(auth.uid()::text) >= 2));

-- Segregação de funções com a hierarquia (espelha modulos/pagamentos/regras.ts).
create or replace function public.pagamento_transicao() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  eu text := auth.uid()::text;
  de text := old.dados ->> 'status';
  para text := new.dados ->> 'status';
  solicitante text := old.dados ->> 'solicitanteId';
  conferente text := old.dados #>> '{conferencia,porId}';
begin
  if auth.uid() is null then return new; end if; -- manutenção pelo painel do Supabase
  new.dados := jsonb_set(new.dados, '{numero}', old.dados -> 'numero');
  new.dados := jsonb_set(new.dados, '{solicitanteId}', old.dados -> 'solicitanteId');

  if de = para then
    if not (public.eh_financeiro() or (eu = solicitante and de = 'Devolvido')) then
      raise exception 'Só o financeiro altera um pedido em andamento.';
    end if;
    return new;
  end if;

  if para = 'Cancelado' then
    if de not in ('Em conferência', 'Devolvido', 'Aguardando aprovação', 'Aprovado') then
      raise exception 'Este pagamento não pode mais ser cancelado.';
    end if;
    if not (eu = solicitante or public.eh_financeiro()) then
      raise exception 'Só quem pediu ou o financeiro cancela.';
    end if;
    return new;
  end if;

  if de = 'Em conferência' and para in ('Aguardando aprovação', 'Devolvido') then
    if not public.eh_financeiro() then raise exception 'A conferência é do financeiro.'; end if;
    if eu = solicitante then raise exception 'Quem pediu o pagamento não confere o próprio pedido.'; end if;
    if para = 'Aguardando aprovação' and new.dados #>> '{conferencia,porId}' is distinct from eu then
      raise exception 'A conferência precisa ser registrada em nome de quem conferiu.';
    end if;
    return new;
  end if;

  if de = 'Aguardando aprovação' and para in ('Aprovado', 'Reprovado', 'Devolvido') then
    if eu = solicitante or eu = conferente then
      raise exception 'Quem pediu ou conferiu não aprova este pedido.';
    end if;
    if not public.pode_aprovar_pagamento(solicitante) then
      raise exception 'A aprovação deste pedido é de um nível acima de quem pediu (gestor, administrador ou chefe da administração).';
    end if;
    if para = 'Aprovado' and new.dados #>> '{aprovacao,porId}' is distinct from eu then
      raise exception 'A aprovação precisa ser registrada em nome de quem aprovou.';
    end if;
    return new;
  end if;

  if de = 'Aprovado' and para = 'Pago' then
    if not public.eh_financeiro() then raise exception 'O pagamento é registrado pelo financeiro.'; end if;
    if eu = old.dados #>> '{aprovacao,porId}' then raise exception 'Quem aprovou não executa o pagamento.'; end if;
    return new;
  end if;

  if de = 'Devolvido' and para = 'Em conferência' then
    if not (eu = solicitante or public.eh_financeiro()) then
      raise exception 'Só quem pediu ou o financeiro reenvia.';
    end if;
    return new;
  end if;

  raise exception 'Mudança de situação não permitida: % → %.', de, para;
end $$;
