-- ════════════════════════════════════════════════════════════════════════════
-- Solicitação de serviços aos prestadores
--
-- A equipe pede um serviço (motoboy, cartório, correio, SAESP, outros) a um
-- prestador escolhido. O prestador vê o pedido no portal, aceita ou recusa,
-- executa e conclui informando o valor e o comprovante — e o recibo nasce do
-- serviço. Espelha modulos/servicos/regras.ts.
--
--   Solicitado → Aceito | Recusado | Cancelado
--   Aceito → Em execução | Concluído | Cancelado
--   Em execução → Concluído | Cancelado
--   Recusado → Solicitado (reencaminhado a outro prestador) | Cancelado
-- ════════════════════════════════════════════════════════════════════════════

insert into public.permissoes_catalogo (acao, modulo, nivel) values
  ('prestadores.servicos.solicitar', 'prestadores', 'todos'),
  ('prestadores.servicos.gerenciar', 'prestadores', 'editar');

create table public.servicos (
  id text primary key,
  dados jsonb not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid default auth.uid()
);
alter table public.servicos enable row level security;
revoke all on public.servicos from anon;
alter table public.servicos add column prestador_id text generated always as (dados ->> 'prestadorId') stored;
alter table public.servicos add column solicitante_id text generated always as (dados ->> 'solicitanteId') stored;
create index servicos_prestador on public.servicos (prestador_id);
create index servicos_solicitante on public.servicos (solicitante_id);

-- Quem pediu, quem acompanha todos e o prestador escolhido.
create policy ver on public.servicos for select to authenticated
  using (
    public.tem('prestadores.servicos.gerenciar')
    or (solicitante_id = auth.uid()::text and public.tem('prestadores.servicos.solicitar'))
    or prestador_id = public.meu_prestador()
  );
create policy incluir on public.servicos for insert to authenticated
  with check (public.tem('prestadores.servicos.solicitar') and solicitante_id = auth.uid()::text);
create policy equipe_alterar on public.servicos for update to authenticated
  using (public.tem('prestadores.servicos.gerenciar') or (solicitante_id = auth.uid()::text and public.tem('prestadores.servicos.solicitar')))
  with check (public.tem('prestadores.servicos.gerenciar') or (solicitante_id = auth.uid()::text and public.tem('prestadores.servicos.solicitar')));
create policy portal_alterar on public.servicos for update to authenticated
  using (prestador_id = public.meu_prestador())
  with check (prestador_id = public.meu_prestador());
create policy excluir on public.servicos for delete to authenticated
  using (public.tem('prestadores.servicos.gerenciar') and dados ->> 'situacao' in ('Cancelado', 'Recusado'));

-- Numeração SV-0001 única no banco (quem só vê os próprios pedidos não saberia o próximo).
create sequence public.servicos_numero;

create function public.servico_novo() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null then
    if new.dados ->> 'situacao' is distinct from 'Solicitado' then
      raise exception 'Pedido de serviço novo começa como solicitado.';
    end if;
    if new.dados ->> 'reciboId' is not null or coalesce(new.dados -> 'execucao', 'null'::jsonb) <> 'null'::jsonb then
      raise exception 'Pedido de serviço novo não tem execução.';
    end if;
  end if;
  new.dados := jsonb_set(new.dados, '{numero}', to_jsonb('SV-' || lpad(nextval('public.servicos_numero')::text, 4, '0')));
  return new;
end $$;

-- O prestador só anda com o próprio serviço (aceitar, recusar, executar,
-- concluir); a equipe só pede, cancela, edita o pedido e reencaminha.
create function public.servico_transicao() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  de text := old.dados ->> 'situacao';
  para text := new.dados ->> 'situacao';
  -- O que o prestador pode preencher; o resto do pedido é da equipe.
  do_prestador text[] := array['situacao', 'historico', 'execucao', 'motivoRecusa', 'reciboId', 'aceitoEm', 'iniciadoEm', 'concluidoEm', 'recusadoPor'];
begin
  if auth.uid() is null then return new; end if; -- manutenção pelo painel do Supabase
  new.dados := jsonb_set(new.dados, '{numero}', old.dados -> 'numero');
  new.dados := jsonb_set(new.dados, '{solicitanteId}', old.dados -> 'solicitanteId');

  if public.eh_equipe() then
    if de = para then
      if de not in ('Solicitado', 'Aceito', 'Em execução', 'Recusado') then
        raise exception 'Este serviço já foi encerrado.';
      end if;
      if new.dados ->> 'prestadorId' is distinct from old.dados ->> 'prestadorId' then
        raise exception 'Para trocar de prestador, cancele ou aguarde a recusa e reencaminhe.';
      end if;
    elsif para = 'Cancelado' then
      if de not in ('Solicitado', 'Aceito', 'Em execução', 'Recusado') then
        raise exception 'Este serviço não pode mais ser cancelado.';
      end if;
    elsif not (de = 'Recusado' and para = 'Solicitado') then
      raise exception 'Só o prestador aceita, executa e conclui o serviço.';
    end if;
    -- A execução é do prestador.
    new.dados := jsonb_set(new.dados, '{execucao}', coalesce(old.dados -> 'execucao', 'null'::jsonb));
    new.dados := jsonb_set(new.dados, '{reciboId}', coalesce(old.dados -> 'reciboId', 'null'::jsonb));
    return new;
  end if;

  -- Prestador.
  if (new.dados - do_prestador) is distinct from (old.dados - do_prestador) then
    raise exception 'O prestador não altera o pedido do escritório.';
  end if;
  if de is distinct from para and not (
    (de = 'Solicitado' and para in ('Aceito', 'Recusado'))
    or (de = 'Aceito' and para in ('Em execução', 'Concluído'))
    or (de = 'Em execução' and para = 'Concluído')
  ) then
    raise exception 'Passo inválido para este serviço (% → %).', de, para;
  end if;
  if de = para and de not in ('Aceito', 'Em execução') then
    raise exception 'Este serviço não está com você agora.';
  end if;
  if para = 'Concluído' and coalesce((new.dados #>> '{execucao,valor}')::numeric, 0) <= 0 then
    raise exception 'Informe o valor do serviço para concluir.';
  end if;
  return new;
end $$;
revoke execute on function public.servico_novo() from public, anon, authenticated;
revoke execute on function public.servico_transicao() from public, anon, authenticated;

create trigger servico_novo before insert on public.servicos for each row execute function public.servico_novo();
create trigger servico_transicao before update on public.servicos for each row execute function public.servico_transicao();
create trigger carimbar before insert or update on public.servicos for each row execute function public.carimbar();
create trigger auditar after insert or update or delete on public.servicos for each row execute function public.auditar();
alter publication supabase_realtime add table public.servicos;
