-- Brand identity: logo images in Storage (public read for <img src>).
-- Backend uploads with service role (bypasses RLS); policies allow direct client uploads if added later.
-- Bucket id must match backend setting SUPABASE_BRAND_LOGOS_BUCKET (default: brand-logos).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'brand-logos',
  'brand-logos',
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

drop policy if exists "brand_logos_select_public" on storage.objects;
create policy "brand_logos_select_public"
  on storage.objects
  for select
  to public
  using (bucket_id = 'brand-logos');

drop policy if exists "brand_logos_insert_own" on storage.objects;
create policy "brand_logos_insert_own"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'brand-logos'
    and split_part(name, '/', 1) = 'logos'
    and split_part(name, '/', 2) = auth.uid()::text
  );

drop policy if exists "brand_logos_update_own" on storage.objects;
create policy "brand_logos_update_own"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'brand-logos'
    and split_part(name, '/', 1) = 'logos'
    and split_part(name, '/', 2) = auth.uid()::text
  )
  with check (
    bucket_id = 'brand-logos'
    and split_part(name, '/', 1) = 'logos'
    and split_part(name, '/', 2) = auth.uid()::text
  );

drop policy if exists "brand_logos_delete_own" on storage.objects;
create policy "brand_logos_delete_own"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'brand-logos'
    and split_part(name, '/', 1) = 'logos'
    and split_part(name, '/', 2) = auth.uid()::text
  );
