-- ════════════════════════════════════════════════════════════════════════════
-- Pagamentos vira uma área com chave própria (como Prestadores e o Account
-- Management): sem a área, a pessoa não pede, confere, aprova nem paga.
-- Quem já é da equipe ganha a área, para ninguém perder o acesso que tinha.
-- ════════════════════════════════════════════════════════════════════════════

update public.permissoes_catalogo set modulo = 'pagamentos' where acao like 'pagamentos.%';

update public.perfis
set modulos = array_append(modulos, 'pagamentos')
where tipo = 'equipe' and not ('pagamentos' = any (modulos));
