-- Hoje Storage._writeAll() substitui despesas_recorrentes/parcelamentos com
-- DELETE e depois INSERT em duas chamadas separadas (não atômico): se o
-- INSERT falhar por qualquer motivo — rede, ou a constraint de unicidade
-- criada aqui embaixo —, o DELETE já foi efetivado e a tabela fica vazia
-- até o próximo salvamento funcionar. Essas duas funções fazem as duas
-- coisas dentro de uma única transação (corpo de função plpgsql já roda
-- em transação implícita) — se o insert falhar, o delete desfaz junto.
--
-- A constraint de unicidade evita a classe de bug corrigida nesta sessão
-- (condição de corrida na criação da conta duplicando despesas
-- recorrentes/parcelamentos idênticos). Em parcelamentos, parcelas_restantes
-- entra na constraint de propósito: duas compras parceladas com o mesmo
-- nome/categoria/valor mas em estágios diferentes de pagamento são
-- legítimas (confirmado com a usuária — "remedio"/"Pr Saúde" comprados em
-- momentos diferentes), só bloqueia a duplicata exata.
-- 2026-08-26

alter table public.despesas_recorrentes
  add constraint despesas_recorrentes_sem_duplicata
  unique (user_id, nome, categoria, valor);

alter table public.parcelamentos
  add constraint parcelamentos_sem_duplicata
  unique (user_id, nome, categoria, valor_parcela, parcelas_restantes);

create or replace function public.replace_despesas_recorrentes(p_user_id uuid, p_rows jsonb)
returns void
language plpgsql
security invoker
as $$
begin
  if p_user_id is distinct from auth.uid() then
    raise exception 'Não autorizado';
  end if;

  delete from public.despesas_recorrentes where user_id = p_user_id;
  if jsonb_array_length(p_rows) > 0 then
    insert into public.despesas_recorrentes
    select * from jsonb_populate_recordset(null::public.despesas_recorrentes, p_rows);
  end if;
end;
$$;

create or replace function public.replace_parcelamentos(p_user_id uuid, p_rows jsonb)
returns void
language plpgsql
security invoker
as $$
begin
  if p_user_id is distinct from auth.uid() then
    raise exception 'Não autorizado';
  end if;

  delete from public.parcelamentos where user_id = p_user_id;
  if jsonb_array_length(p_rows) > 0 then
    insert into public.parcelamentos
    select * from jsonb_populate_recordset(null::public.parcelamentos, p_rows);
  end if;
end;
$$;

grant execute on function public.replace_despesas_recorrentes(uuid, jsonb) to authenticated;
grant execute on function public.replace_parcelamentos(uuid, jsonb) to authenticated;
