-- Compact structured facts for LLM injection (hex, roles, typography, logo); regenerated on save.
alter table public.brand_profiles
  add column if not exists brand_facts jsonb not null default '{}'::jsonb;

comment on column public.brand_profiles.brand_facts is
  'Small JSON: colors + hierarchy, typography slots, logo URL — paired with prompt_brand_guidelines.';
