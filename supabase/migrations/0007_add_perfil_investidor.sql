-- Adiciona o perfil de investidor (conservador/equilibrado/agressivo) à
-- tabela perfil. Usado para calcular o "Potencial de investimento" do
-- Dashboard como uma fração do saldo disponível (50% / 75% / 100%),
-- escolhida em Planejamento > Potencial de investimento — cenários.
-- 2026-08-23

alter table public.perfil
  add column if not exists perfil_investidor text not null default 'equilibrado';

alter table public.perfil
  add constraint perfil_investidor_valido
  check (perfil_investidor in ('conservador', 'equilibrado', 'agressivo'));
