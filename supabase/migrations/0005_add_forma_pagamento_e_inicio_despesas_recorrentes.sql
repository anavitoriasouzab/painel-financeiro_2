-- =============================================================================
-- Adiciona forma de pagamento e mês de início em despesas_recorrentes — 2026-08-22.
-- "forma_pagamento" espelha a coluna já existente em despesas_variaveis
-- (cartão/dinheiro/pix), agora disponível pro formulário de recorrentes também.
-- "inicio_mes_referencia" ('YYYY-MM') marca a partir de qual mês essa despesa
-- recorrente passa a entrar nos cálculos de despesas fixas — usado quando ela
-- é cadastrada com data de compra no cartão depois do fechamento da fatura,
-- caso em que só deve contar a partir do mês seguinte (ver
-- Calc.calculateExpenseMonth e Calc.calculateFixedExpenses). Null = sempre
-- conta, comportamento igual ao de antes desta coluna existir.
-- =============================================================================
alter table public.despesas_recorrentes add column forma_pagamento text;
alter table public.despesas_recorrentes add column inicio_mes_referencia text;
