-- ════════════════════════════════════════════════════════════════════════════
-- Sai a página "Tarefas" do escritório: as tarefas do dia a dia ficam só no
-- Account Management (tabela contas_tarefas, que não muda).
--
--   - o módulo "tarefas" sai dos perfis (ninguém fica com permissão órfã);
--   - o primeiro administrador nasce sem ele;
--   - a tabela escritorio_tarefas sai (estava vazia; com ela saem as
--     políticas, os gatilhos e a publicação do tempo real dela).
-- ════════════════════════════════════════════════════════════════════════════

update public.perfis set modulos = array_remove(modulos, 'tarefas') where 'tarefas' = any (modulos);

create or replace function public.novo_usuario() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  prestador text;
  nome text := coalesce(new.raw_user_meta_data ->> 'nome', split_part(new.email, '@', 1));
begin
  select pr.id into prestador from public.prestadores pr
  where lower(pr.dados ->> 'email') = lower(new.email) and coalesce((pr.dados ->> 'portalAtivo')::boolean, false)
  limit 1;

  if prestador is not null then
    insert into public.perfis (id, email, nome, tipo, prestador_id, papel)
    values (new.id, new.email, nome, 'prestador', prestador, 'viewer');
  elsif not exists (select 1 from public.perfis p where p.papel = 'admin') then
    insert into public.perfis (id, email, nome, papel, modulos)
    values (new.id, new.email, nome, 'admin', array['visao', 'calendario', 'documentos', 'prestadores', 'contas']);
  else
    -- Papel e módulos NUNCA vêm dos metadados do cadastro (quem se cadastra
    -- escreveria o que quisesse): o convite, no servidor, é que os define.
    insert into public.perfis (id, email, nome) values (new.id, new.email, nome);
  end if;
  return new;
end $$;

drop table if exists public.escritorio_tarefas;
