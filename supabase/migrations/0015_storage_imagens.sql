-- Bucket privado para comprovantes de despesa e foto de perfil, substituindo
-- o base64 gravado direto nas colunas `despesas_variaveis.comprovante` e
-- `perfil.foto` (era o item "Pendente" nº 1 do CLAUDE.md). Guardar imagem na
-- linha estoura o tamanho de linha do Postgres e o plano gratuito rápido:
-- ~1,5MB de imagem viram ~2MB de base64 em CADA leitura de despesa, e
-- Storage.load() lê a tabela inteira de uma vez.
--
-- As colunas continuam `text` e continuam sendo a única referência à imagem —
-- só o CONTEÚDO muda: agora guardam o path do objeto no bucket
-- (`<user_id>/<tipo>/<arquivo>`) em vez do base64. O app distingue os dois
-- pelo prefixo "data:" (ver Storage.isDataUrl em js/storage.js), então
-- imagens antigas continuam funcionando até serem convertidas.
--
-- Privado de propósito: comprovante é documento financeiro. A leitura é
-- sempre por URL assinada de curta duração (createSignedUrl), nunca por URL
-- pública — mesma lógica do RLS das tabelas, o dado é só do dono.
-- 2026-09-20

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'imagens',
  'imagens',
  false,
  5242880,                                           -- 5MB por arquivo
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic']
)
on conflict (id) do nothing;

-- Policies no padrão "dono do registro" das tabelas (ver 0001/0002): o
-- primeiro segmento do path É o user_id, então `storage.foldername(name)[1]`
-- faz o mesmo papel que a coluna user_id nas outras policies. O
-- `(select auth.uid())` em vez de `auth.uid()` direto é o mesmo ajuste de
-- performance aplicado na 0002 (avaliação única por query, não por linha).
create policy "imagens_dono_select"
  on storage.objects for select to authenticated
  using (bucket_id = 'imagens' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "imagens_dono_insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'imagens' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "imagens_dono_update"
  on storage.objects for update to authenticated
  using (bucket_id = 'imagens' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'imagens' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "imagens_dono_delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'imagens' and (storage.foldername(name))[1] = (select auth.uid())::text);
