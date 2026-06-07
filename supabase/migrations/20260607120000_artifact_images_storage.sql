-- AI artifact reference images in Storage (public read so the hosted URL can be
-- baked into artifact HTML via <img src> / background-image: url(...)).
-- Backend uploads with service role (bypasses RLS); policies allow direct client uploads if added later.
-- Bucket id must match backend setting SUPABASE_ARTIFACT_IMAGES_BUCKET (default: artifact-images).
-- Object paths are artifacts/<user-or-anon>/<id>.<ext>; anonymous PoC uploads use the literal "anon" segment.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'artifact-images',
  'artifact-images',
  true,
  10485760,
  array[
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/webp',
    'image/gif',
    'image/svg+xml'
  ]::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "artifact_images_select_public" on storage.objects;
create policy "artifact_images_select_public"
  on storage.objects
  for select
  to public
  using (bucket_id = 'artifact-images');

drop policy if exists "artifact_images_insert_own" on storage.objects;
create policy "artifact_images_insert_own"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'artifact-images'
    and split_part(name, '/', 1) = 'artifacts'
    and split_part(name, '/', 2) = auth.uid()::text
  );

drop policy if exists "artifact_images_update_own" on storage.objects;
create policy "artifact_images_update_own"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'artifact-images'
    and split_part(name, '/', 1) = 'artifacts'
    and split_part(name, '/', 2) = auth.uid()::text
  )
  with check (
    bucket_id = 'artifact-images'
    and split_part(name, '/', 1) = 'artifacts'
    and split_part(name, '/', 2) = auth.uid()::text
  );

drop policy if exists "artifact_images_delete_own" on storage.objects;
create policy "artifact_images_delete_own"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'artifact-images'
    and split_part(name, '/', 1) = 'artifacts'
    and split_part(name, '/', 2) = auth.uid()::text
  );
