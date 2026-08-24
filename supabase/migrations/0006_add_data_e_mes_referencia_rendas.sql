-- =============================================================================
-- Adiciona data e mês de referência em rendas — aplicado em 2026-08-23
-- (via migration "add_rendas_data_mes_referencia").
-- js/profile.js agora permite cadastrar renda "fixa" (mensal, sempre conta —
-- comportamento igual ao de antes) ou "extra" (pontual, conta só no mês
-- informado em "mes_referencia", igual já funciona em despesas_variaveis).
-- "data" guarda opcionalmente o dia exato em que a renda extra foi recebida.
-- Null em ambas = renda fixa mensal, comportamento inalterado.
-- =============================================================================
alter table public.rendas add column data date;
alter table public.rendas add column mes_referencia text;
