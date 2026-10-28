-- ════════════════════════════════════════════════════════════════════════════
-- Permissões por ação
--
-- Cada pessoa da equipe tem áreas (perfis.modulos) e, opcionalmente, uma lista
-- de ações (perfis.permissoes). Sem lista, valem as do papel — o "nível" de
-- cada ação no catálogo, igual ao do app (_core/identidade/permissoes.ts).
-- Administrador tem todas as ações das áreas liberadas. As políticas usam
-- public.tem('acao'): o que a tela esconde, o banco também recusa.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.perfis add column permissoes text[];

create table public.permissoes_catalogo (
  acao text primary key,
  modulo text,
  nivel text not null check (nivel in ('ver', 'editar', 'excluir', 'financeiro', 'gestao', 'admin', 'todos'))
);
alter table public.permissoes_catalogo enable row level security;
create policy ver on public.permissoes_catalogo for select to authenticated using (true);
revoke all on public.permissoes_catalogo from anon;

insert into public.permissoes_catalogo (acao, modulo, nivel) values
  ('prestadores.painel.ver', 'prestadores', 'ver'),
  ('prestadores.conferencia.ver', 'prestadores', 'ver'),
  ('prestadores.conferencia.conferir', 'prestadores', 'editar'),
  ('prestadores.conferencia.pagar', 'prestadores', 'editar'),
  ('prestadores.recibos.editar', 'prestadores', 'editar'),
  ('prestadores.recibos.excluir', 'prestadores', 'excluir'),
  ('prestadores.historico.ver', 'prestadores', 'ver'),
  ('prestadores.arquivos.ver', 'prestadores', 'ver'),
  ('prestadores.cadastro.ver', 'prestadores', 'ver'),
  ('prestadores.cadastro.editar', 'prestadores', 'editar'),
  ('prestadores.cadastro.excluir', 'prestadores', 'excluir'),
  ('pagamentos.pedir', null, 'todos'),
  ('pagamentos.ver_todos', null, 'financeiro'),
  ('pagamentos.conferir', null, 'financeiro'),
  ('pagamentos.aprovar', null, 'todos'),
  ('pagamentos.pagar', null, 'financeiro'),
  ('pagamentos.fornecedores', null, 'gestao'),
  ('pagamentos.regras', null, 'admin'),
  ('contas.tarefas.ver', 'contas', 'ver'),
  ('contas.tarefas.editar', 'contas', 'editar'),
  ('contas.tarefas.excluir', 'contas', 'excluir'),
  ('contas.banco.ver', 'contas', 'ver'),
  ('contas.banco.editar', 'contas', 'editar'),
  ('contas.banco.excluir', 'contas', 'excluir'),
  ('contas.conciliacao.ver', 'contas', 'ver'),
  ('contas.conciliacao.editar', 'contas', 'editar'),
  ('calendario.ver', 'calendario', 'ver'),
  ('calendario.editar', 'calendario', 'editar'),
  ('calendario.excluir', 'calendario', 'excluir'),
  ('documentos.ver', 'documentos', 'ver'),
  ('documentos.editar', 'documentos', 'editar'),
  ('documentos.excluir', 'documentos', 'excluir');

-- A pessoa logada pode fazer esta ação?
create function public.tem(acao text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.perfis p
    join public.permissoes_catalogo c on c.acao = tem.acao
    where p.id = auth.uid() and p.ativo and p.tipo = 'equipe'
      and (c.modulo is null or c.modulo = any (p.modulos))
      and (
        p.papel = 'admin'
        or (p.permissoes is not null and tem.acao = any (p.permissoes))
        or (p.permissoes is null and case c.nivel
              when 'todos' then true
              when 'ver' then true
              when 'editar' then p.papel in ('gestor', 'operador')
              when 'excluir' then p.papel = 'gestor'
              when 'financeiro' then p.papel in ('gestor', 'operador') and 'contas' = any (p.modulos)
              when 'gestao' then p.papel = 'gestor' or (p.papel = 'operador' and 'contas' = any (p.modulos))
              else false
            end)
      )
  )
$$;
revoke execute on function public.tem(text) from public, anon;
grant execute on function public.tem(text) to authenticated;

-- ── Prestadores ─────────────────────────────────────────────────────────────

drop policy incluir on public.prestadores;
create policy incluir on public.prestadores for insert to authenticated with check (public.tem('prestadores.cadastro.editar'));
drop policy alterar on public.prestadores;
create policy alterar on public.prestadores for update to authenticated
  using (public.tem('prestadores.cadastro.editar')) with check (public.tem('prestadores.cadastro.editar'));
drop policy excluir on public.prestadores;
create policy excluir on public.prestadores for delete to authenticated using (public.tem('prestadores.cadastro.excluir'));

drop policy equipe_incluir on public.recibos;
create policy equipe_incluir on public.recibos for insert to authenticated with check (public.tem('prestadores.recibos.editar'));
drop policy equipe_alterar on public.recibos;
create policy equipe_alterar on public.recibos for update to authenticated
  using (public.tem('prestadores.recibos.editar') or public.tem('prestadores.conferencia.conferir') or public.tem('prestadores.conferencia.pagar'))
  with check (public.tem('prestadores.recibos.editar') or public.tem('prestadores.conferencia.conferir') or public.tem('prestadores.conferencia.pagar'));
drop policy equipe_excluir on public.recibos;
create policy equipe_excluir on public.recibos for delete to authenticated using (public.tem('prestadores.recibos.excluir'));

drop policy equipe_gravar on public.fechamentos;
create policy equipe_incluir on public.fechamentos for insert to authenticated
  with check (public.tem('prestadores.conferencia.conferir') or public.tem('prestadores.conferencia.pagar') or public.eh_financeiro());
create policy equipe_alterar on public.fechamentos for update to authenticated
  using (public.tem('prestadores.conferencia.conferir') or public.tem('prestadores.conferencia.pagar') or public.tem('prestadores.recibos.editar') or public.eh_financeiro())
  with check (public.tem('prestadores.conferencia.conferir') or public.tem('prestadores.conferencia.pagar') or public.tem('prestadores.recibos.editar') or public.eh_financeiro());
create policy equipe_excluir on public.fechamentos for delete to authenticated using (public.tem('prestadores.recibos.excluir'));

-- ── Account Management ─────────────────────────────────────────────────────

do $$
declare t text; editar text; excluir text;
begin
  for t, editar, excluir in values
    ('contas_tarefas', 'contas.tarefas.editar', 'contas.tarefas.excluir'),
    ('contas_eventos', 'contas.tarefas.editar', 'contas.tarefas.excluir'),
    ('contas_taxas', 'contas.banco.editar', 'contas.banco.excluir'),
    ('contas_ordens', 'contas.banco.editar', 'contas.banco.excluir'),
    ('conciliacao_contas', 'contas.conciliacao.editar', 'contas.conciliacao.editar'),
    ('conciliacao_extrato', 'contas.conciliacao.editar', 'contas.conciliacao.editar'),
    ('conciliacao_razao', 'contas.conciliacao.editar', 'contas.conciliacao.editar'),
    ('conciliacao_casamentos', 'contas.conciliacao.editar', 'contas.conciliacao.editar'),
    ('conciliacao_importacoes', 'contas.conciliacao.editar', 'contas.conciliacao.editar'),
    ('conciliacao_saldos', 'contas.conciliacao.editar', 'contas.conciliacao.editar'),
    ('conciliacao_fechamentos', 'contas.conciliacao.editar', 'contas.conciliacao.editar'),
    ('escritorio_reunioes', 'calendario.editar', 'calendario.excluir'),
    ('escritorio_documentos', 'documentos.editar', 'documentos.excluir')
  loop
    execute format('drop policy incluir on public.%I', t);
    execute format('drop policy alterar on public.%I', t);
    execute format('drop policy excluir on public.%I', t);
    execute format('create policy incluir on public.%I for insert to authenticated with check (public.tem(%L))', t, editar);
    execute format('create policy alterar on public.%I for update to authenticated using (public.tem(%L)) with check (public.tem(%L))', t, editar, editar);
    execute format('create policy excluir on public.%I for delete to authenticated using (public.tem(%L))', t, excluir);
  end loop;
end $$;

drop policy gravar_emails on public.configuracoes;
create policy gravar_emails on public.configuracoes for all to authenticated
  using (id = 'contas-config-emails' and public.tem('contas.banco.editar'))
  with check (id = 'contas-config-emails' and public.tem('contas.banco.editar'));

-- ── Pagamentos ─────────────────────────────────────────────────────────────

-- "Financeiro" agora é quem vê todos os pedidos, confere ou paga.
create or replace function public.eh_financeiro() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.tem('pagamentos.ver_todos') or public.tem('pagamentos.conferir') or public.tem('pagamentos.pagar')
$$;

create or replace function public.pode_aprovar_pagamento(solicitante text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.eh_equipe()
    and public.tem('pagamentos.aprovar')
    and auth.uid()::text is distinct from solicitante
    and (
      auth.uid() = public.aprovador_vigente()
      or (coalesce(public.nivel_de(solicitante), 1) <= 1 and coalesce(public.nivel_de(auth.uid()::text), 0) >= 2)
      or (public.nivel_de(solicitante) = 2 and coalesce(public.nivel_de(auth.uid()::text), 0) >= 3)
    )
$$;

drop policy incluir on public.pagamentos;
create policy incluir on public.pagamentos for insert to authenticated with check (public.tem('pagamentos.pedir'));

drop policy incluir on public.pagamentos_fornecedores;
create policy incluir on public.pagamentos_fornecedores for insert to authenticated
  with check (public.tem('pagamentos.fornecedores') or public.eh_aprovador());
drop policy alterar on public.pagamentos_fornecedores;
create policy alterar on public.pagamentos_fornecedores for update to authenticated
  using (public.tem('pagamentos.fornecedores') or public.eh_aprovador())
  with check (public.tem('pagamentos.fornecedores') or public.eh_aprovador());

drop policy gravar_aprovacao on public.configuracoes;
create policy gravar_aprovacao on public.configuracoes for all to authenticated
  using (id = 'pagamentos-config' and (public.tem('pagamentos.regras') or auth.uid() = public.aprovador_titular()))
  with check (id = 'pagamentos-config' and (public.tem('pagamentos.regras') or auth.uid() = public.aprovador_titular()));

-- Conferir e pagar passam a ser permissões separadas.
create or replace function public.pagamento_transicao() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  eu text := auth.uid()::text;
  de text := old.dados ->> 'status';
  para text := new.dados ->> 'status';
  solicitante text := old.dados ->> 'solicitanteId';
  conferente text := old.dados #>> '{conferencia,porId}';
begin
  if auth.uid() is null then return new; end if;
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
    if not public.tem('pagamentos.conferir') then raise exception 'Você não tem permissão para conferir pagamentos.'; end if;
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
      raise exception 'A aprovação deste pedido é de um nível acima de quem pediu (gestor, administrador ou chefe da administração), com permissão para aprovar.';
    end if;
    if para = 'Aprovado' and new.dados #>> '{aprovacao,porId}' is distinct from eu then
      raise exception 'A aprovação precisa ser registrada em nome de quem aprovou.';
    end if;
    return new;
  end if;

  if de = 'Aprovado' and para = 'Pago' then
    if not public.tem('pagamentos.pagar') then raise exception 'Você não tem permissão para registrar pagamentos.'; end if;
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
