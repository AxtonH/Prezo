-- Allow authenticated users to insert their own profile row when missing
-- (e.g. legacy users before handle_new_user trigger, or trigger failure).
-- Fixes: UPDATE ... .single() returning 0 rows → "Cannot coerce the result to a single JSON object".

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own
  on public.profiles
  for insert
  to authenticated
  with check ((select auth.uid()) = id);
