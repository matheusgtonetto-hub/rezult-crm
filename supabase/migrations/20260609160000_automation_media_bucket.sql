-- Bucket público para mídias usadas nas automações (áudios, anexos enviados pelo
-- bloco Mensagem). Precisa ser PÚBLICO porque a Z-API busca o arquivo pela URL.
insert into storage.buckets (id, name, public)
values ('automation-media', 'automation-media', true)
on conflict (id) do update set public = true;

-- Leitura pública (a Z-API e o destinatário acessam pela URL pública)
drop policy if exists "automation_media_public_read" on storage.objects;
create policy "automation_media_public_read" on storage.objects
  for select using (bucket_id = 'automation-media');

-- Upload: usuário autenticado, apenas na sua própria pasta ({uid}/...)
drop policy if exists "automation_media_insert" on storage.objects;
create policy "automation_media_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'automation-media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "automation_media_update" on storage.objects;
create policy "automation_media_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'automation-media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "automation_media_delete" on storage.objects;
create policy "automation_media_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'automation-media' and (storage.foldername(name))[1] = auth.uid()::text);
