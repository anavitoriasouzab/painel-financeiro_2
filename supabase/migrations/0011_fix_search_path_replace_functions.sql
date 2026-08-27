-- As duas funções criadas na 0010 (replace_despesas_recorrentes,
-- replace_parcelamentos) não tinham search_path fixo — o advisor de
-- segurança do Supabase aponta isso como risco (alguém poderia manipular o
-- search_path da sessão pra fazer a função resolver nomes de objeto num
-- schema diferente do esperado). Fixar pra `public, pg_temp` remove esse
-- risco sem mudar nenhum comportamento das funções.
-- 2026-08-26

alter function public.replace_despesas_recorrentes(uuid, jsonb) set search_path = public, pg_temp;
alter function public.replace_parcelamentos(uuid, jsonb) set search_path = public, pg_temp;
