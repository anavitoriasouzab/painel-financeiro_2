-- Substituição atômica de despesas_variaveis, mesmo tratamento que
-- despesas_recorrentes/parcelamentos (0010) e rendas (0013) já tinham.
-- Era a última tabela de risco fora dessa proteção, e virou o elo mais frágil
-- quando o formulário de despesa passou a CONVERTER uma despesa variável em
-- parcelamento (ver Accounts._submitAsInstallment).
--
-- O problema concreto: Storage._writeAll() apaga todas as tabelas "genéricas"
-- (incluindo despesas_variaveis) e só depois grava parcelamentos, que é
-- atômico e é gravado por ÚLTIMO. Numa conversão, isso significa que a
-- despesa já foi apagada quando o parcelamento é inserido — se esse insert
-- falhar (rede, aba fechada no meio, ou a constraint
-- parcelamentos_sem_duplicata), a compra sumia inteira: não estava mais em
-- despesas_variaveis e nunca chegou em parcelamentos. E como Storage.save()
-- só mostra um toast no erro, a tela seguia exibindo um parcelamento que não
-- existia no banco até a próxima recarga.
--
-- Com o delete+insert numa transação só, uma falha no insert desfaz o delete
-- junto e a despesa continua lá — a pessoa vê o erro e tenta de novo, sem
-- perder o lançamento.
--
-- Sem constraint de unicidade aqui, de propósito (diferente da 0010): duas
-- despesas variáveis idênticas no mesmo mês são legítimas — dois cafés do
-- mesmo valor, duas corridas de app iguais. O que a 0010 bloqueou foram
-- recorrentes/parcelamentos repetidos, que são cadastros duradouros.
-- 2026-09-21

create or replace function public.replace_despesas_variaveis(p_user_id uuid, p_rows jsonb)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if p_user_id is distinct from auth.uid() then
    raise exception 'Não autorizado';
  end if;

  delete from public.despesas_variaveis where user_id = p_user_id;
  if jsonb_array_length(p_rows) > 0 then
    insert into public.despesas_variaveis
    select * from jsonb_populate_recordset(null::public.despesas_variaveis, p_rows);
  end if;
end;
$$;

grant execute on function public.replace_despesas_variaveis(uuid, jsonb) to authenticated;
