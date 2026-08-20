-- Schema for the widget_preset_libraries table.
--
-- One row per user holding their widget design presets as a single JSON
-- document (shape: {kind: {presets: [{id, name, style, updatedAt}],
-- defaultId}}). The backend service role is the only writer; the add-in
-- syncs the document through /library/widgets/presets.
--
-- Run on Supabase BEFORE deploying the /library/widgets endpoints.

create table if not exists public.widget_preset_libraries (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.widget_preset_libraries enable row level security;
