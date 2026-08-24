-- =============================================================================
-- Otimizações apontadas pelo advisor de performance do Supabase logo após
-- aplicar 0001_init.sql — aplicado em 2026-08-22.
-- =============================================================================

-- As policies "dono_do_registro" usavam auth.uid() direto, que é reavaliado
-- linha a linha. Trocado por (select auth.uid()), avaliado uma vez por query.
do $$
declare
  t text;
begin
  foreach t in array array[
    'perfil', 'rendas', 'cartoes', 'categorias', 'despesas_recorrentes',
    'despesas_variaveis', 'parcelamentos', 'metas', 'investimentos',
    'reserva_emergencia', 'historico_mensal', 'pendencias', 'inconsistencias_detectadas'
  ]
  loop
    execute format('drop policy "dono_do_registro" on public.%I;', t);
    execute format(
      'create policy "dono_do_registro" on public.%I for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);',
      t
    );
  end loop;
end $$;

-- Índices que faltavam para as demais foreign keys (user_id / cartao_id)
create index idx_cartoes_user on public.cartoes (user_id);
create index idx_inconsistencias_user on public.inconsistencias_detectadas (user_id);
create index idx_investimentos_user on public.investimentos (user_id);
create index idx_metas_user on public.metas (user_id);
create index idx_parcelamentos_cartao on public.parcelamentos (cartao_id);
create index idx_pendencias_user on public.pendencias (user_id);
create index idx_rendas_user on public.rendas (user_id);
