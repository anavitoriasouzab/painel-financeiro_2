-- =============================================================================
-- Corrige o nome da coluna de prazo em metas — aplicado em 2026-08-22.
-- js/goals.js grava item.prazoMeses (não item.prazo, que nunca era usado em
-- lugar nenhum do app). A coluna original "prazo" foi renomeada para
-- "prazo_meses" pra bater com o campo real gravado pelo front-end.
-- =============================================================================
alter table public.metas rename column prazo to prazo_meses;
