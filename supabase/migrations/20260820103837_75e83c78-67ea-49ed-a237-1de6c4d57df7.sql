alter table public.generations
  add column if not exists raw_responses jsonb not null default '[]'::jsonb,
  add column if not exists reference_files jsonb not null default '[]'::jsonb,
  add column if not exists warnings jsonb not null default '[]'::jsonb,
  add column if not exists user_memo text;