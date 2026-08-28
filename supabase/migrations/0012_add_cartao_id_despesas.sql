-- Adiciona cartao_id em despesas_recorrentes/despesas_variaveis — 2026-08-27.
-- Antes desta coluna, Calc.calculateExpenseMonth (js/calculations.js) sempre
-- usava data.cartoes[0] (o primeiro cartão cadastrado) pra decidir se uma
-- despesa no cartão cai na fatura do mês seguinte, mesmo que a compra tenha
-- sido feita em outro cartão com um dia de fechamento diferente. Agora cada
-- despesa pode referenciar o cartão usado de fato, igual a parcelamentos
-- (ver cartao_id em parcelamentos, 0001_init.sql). Null = comportamento
-- antigo (cai no fechamento do primeiro cartão cadastrado) — mantém
-- compatível com despesas já lançadas antes desta coluna existir.
alter table public.despesas_recorrentes add column cartao_id text references public.cartoes(id) on delete set null;
alter table public.despesas_variaveis add column cartao_id text references public.cartoes(id) on delete set null;

create index idx_despesas_recorrentes_cartao on public.despesas_recorrentes (cartao_id);
create index idx_despesas_variaveis_cartao on public.despesas_variaveis (cartao_id);
