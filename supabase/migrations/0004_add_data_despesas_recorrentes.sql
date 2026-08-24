-- =============================================================================
-- Adiciona coluna de data opcional em despesas_recorrentes — 2026-08-22.
-- js/accounts.js agora permite informar uma data (opcional) tanto pra
-- despesas variáveis quanto recorrentes. "vencimento" continua existindo
-- e representa o dia do mês em que a conta normalmente vence (ex.: "dia 05");
-- "data" é opcional e serve pra registrar quando essa cobrança específica
-- efetivamente ocorreu, igual já funciona em despesas_variaveis.
-- =============================================================================
alter table public.despesas_recorrentes add column data date;
