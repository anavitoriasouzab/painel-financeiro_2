-- Registra quando a pessoa aceitou os Termos de Uso e a Política de
-- Privacidade — null significa "ainda não aceitou" (bloqueia o app com um
-- modal obrigatório, ver js/app.js). Nullable de propósito: toda linha já
-- existente em perfil nasce sem aceite e passa pelo mesmo fluxo de quem
-- está se cadastrando agora, em vez de presumir um aceite que nunca
-- aconteceu.
-- 2026-09-04

alter table public.perfil
  add column if not exists termos_aceitos_em timestamptz;
