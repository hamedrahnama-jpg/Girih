create table if not exists public.training_self_progress (
  user_id uuid not null references public.profiles(id) on delete cascade,
  module_id uuid not null references public.training_modules(id) on delete cascade,
  completed_tasks jsonb not null default '[]'::jsonb
    check (jsonb_typeof(completed_tasks) = 'array'),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, module_id)
);

alter table public.training_self_progress enable row level security;

-- Self-guided progress is served only through the authenticated training API.
-- Keep the exposed Data API closed and let the server-side service role perform
-- ownership checks before reading or updating progress.
revoke all on public.training_self_progress from anon, authenticated;
grant select, insert, update, delete on public.training_self_progress to service_role;

