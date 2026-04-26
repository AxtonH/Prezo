-- Schema for the embed_instances table.
--
-- One row per PowerPoint content add-in instance inserted into a presentation.
-- The row ID matches the UUID that the iframe stores in
-- Office.context.document.settings under the key "embedId". That UUID travels
-- with the .pptx (as a <we:webextensionproperty>), so any user who opens the
-- file and has the Prezo add-in installed will reconnect to the same row.

create extension if not exists "pgcrypto";

create table if not exists public.embed_instances (
  id uuid primary key,
  owner_user_id uuid references auth.users(id) on delete set null,
  session_id uuid,
  poll_id uuid,
  artifact_kind text not null default 'poll-game',
  artifact_name text,
  screen_mode text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

-- Idempotent migration for projects that already ran an earlier version of
-- this script before artifact_name existed.
alter table public.embed_instances
  add column if not exists artifact_name text;

create index if not exists embed_instances_owner_user_id_idx
  on public.embed_instances (owner_user_id);

create index if not exists embed_instances_session_id_idx
  on public.embed_instances (session_id);

-- updated_at auto-touch.
create or replace function public.touch_embed_instances_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists embed_instances_touch_updated_at on public.embed_instances;
create trigger embed_instances_touch_updated_at
  before update on public.embed_instances
  for each row
  execute function public.touch_embed_instances_updated_at();
