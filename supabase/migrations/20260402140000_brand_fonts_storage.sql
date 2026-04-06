-- Brand identity: custom font files in Storage (public read for @font-face).
-- Backend uploads with service role (bypasses RLS); policies allow direct client uploads if added later.
-- Bucket id must match backend setting SUPABASE_BRAND_FONTS_BUCKET (default: brand-fonts).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'brand-fonts',
  'brand-fonts',
  true,
  5242880,
  array[
    'font/woff2',
    'font/woff',
    'font/ttf',
    'font/otf',
    'application/font-woff2',
    'application/font-woff',
    'application/x-font-ttf',
    'application/x-font-otf',
    'application/octet-stream'
  ]::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "brand_fonts_select_public" on storage.objects;
create policy "brand_fonts_select_public"
  on storage.objects
  for select
  to public
  using (bucket_id = 'brand-fonts');

drop policy if exists "brand_fonts_insert_own" on storage.objects;
create policy "brand_fonts_insert_own"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'brand-fonts'
    and split_part(name, '/', 1) = 'fonts'
    and split_part(name, '/', 2) = auth.uid()::text
  );

drop policy if exists "brand_fonts_update_own" on storage.objects;
create policy "brand_fonts_update_own"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'brand-fonts'
    and split_part(name, '/', 1) = 'fonts'
    and split_part(name, '/', 2) = auth.uid()::text
  )
  with check (
    bucket_id = 'brand-fonts'
    and split_part(name, '/', 1) = 'fonts'
    and split_part(name, '/', 2) = auth.uid()::text
  );

drop policy if exists "brand_fonts_delete_own" on storage.objects;
create policy "brand_fonts_delete_own"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'brand-fonts'
    and split_part(name, '/', 1) = 'fonts'
    and split_part(name, '/', 2) = auth.uid()::text
  );
