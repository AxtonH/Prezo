-- Plain-text LLM injection payload (regenerated on every brand profile save).
alter table public.brand_profiles
  add column if not exists prompt_brand_guidelines text not null default '';

comment on column public.brand_profiles.prompt_brand_guidelines is
  'Curated text brief for LLM context: colors, typography, tone, visual style, logo — not raw JSON.';
