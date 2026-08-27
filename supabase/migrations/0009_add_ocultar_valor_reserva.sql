-- Adiciona a preferência de ocultar o valor da Reserva de emergência no
-- Dashboard, seguindo o mesmo padrão de ocultar_valor_renda/ocultar_valor_saldo
-- já existentes na tabela perfil (0001_init.sql).
-- 2026-08-26

alter table public.perfil
  add column if not exists ocultar_valor_reserva boolean not null default false;
