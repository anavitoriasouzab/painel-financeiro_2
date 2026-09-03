-- =============================================================================
-- Corrige perda de dados em "rendas": Storage._writeAll() salvava essa tabela
-- com um DELETE e um INSERT em duas chamadas HTTP separadas (não atômico).
-- Se o INSERT falhasse ou fosse interrompido por qualquer motivo (rede
-- instável, aba fechada/recarregada no meio do save), o DELETE já tinha sido
-- efetivado e a tabela ficava vazia até o próximo salvamento funcionar —
-- apagando TODAS as rendas da pessoa, não só a que estava sendo editada.
--
-- Mesma classe de bug já corrigida em despesas_recorrentes/parcelamentos na
-- migration 0010 (delete+insert dentro de uma função plpgsql = uma transação
-- só; se o insert falhar, o delete desfaz junto). Replicando o padrão aqui.
--
-- Nota: ao contrário de despesas_recorrentes/parcelamentos, "rendas" tem a
-- coluna `criado_em timestamptz not null default now()`, que o client nunca
-- envia — por isso o INSERT abaixo lista as colunas explicitamente (em vez
-- de `insert into rendas select *`), deixando `criado_em` de fora pra usar o
-- default. Com `select *`, jsonb_populate_recordset preenche colunas
-- ausentes no JSON com NULL (não com o default da coluna), o que violaria o
-- "not null" de criado_em em todo insert.
-- 2026-09-01
-- =============================================================================

create or replace function public.replace_rendas(p_user_id uuid, p_rows jsonb)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if p_user_id is distinct from auth.uid() then
    raise exception 'Não autorizado';
  end if;

  delete from public.rendas where user_id = p_user_id;
  if jsonb_array_length(p_rows) > 0 then
    insert into public.rendas (id, user_id, nome, valor, frequencia, dia_recebimento, observacao, data, mes_referencia)
    select id, user_id, nome, valor, frequencia, dia_recebimento, observacao, data, mes_referencia
    from jsonb_populate_recordset(null::public.rendas, p_rows);
  end if;
end;
$$;

grant execute on function public.replace_rendas(uuid, jsonb) to authenticated;
