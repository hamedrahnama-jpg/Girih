-- Run this once in the Supabase SQL editor for the Girih Studio project.
create table if not exists public.brick_bond_patterns (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  bond_pattern jsonb not null check (jsonb_typeof(bond_pattern) = 'object'),
  source_pattern jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, name)
);

-- Older installations referenced public.profiles. Existing authenticated users may
-- not have a profile row, so ownership must use Supabase Auth as the source of truth.
alter table public.brick_bond_patterns
  drop constraint if exists brick_bond_patterns_owner_id_fkey;
alter table public.brick_bond_patterns
  add constraint brick_bond_patterns_owner_id_fkey
  foreign key (owner_id) references auth.users(id) on delete cascade;

create index if not exists brick_bond_patterns_owner_updated_idx
  on public.brick_bond_patterns (owner_id, updated_at desc);

alter table public.brick_bond_patterns enable row level security;
revoke all on public.brick_bond_patterns from anon;
grant select, insert, update, delete on public.brick_bond_patterns to authenticated;
grant all on public.brick_bond_patterns to service_role;

drop policy if exists "Users can read their own brick bonds" on public.brick_bond_patterns;
create policy "Users can read their own brick bonds"
  on public.brick_bond_patterns for select to authenticated
  using ((select auth.uid()) = owner_id);

drop policy if exists "Users can create their own brick bonds" on public.brick_bond_patterns;
create policy "Users can create their own brick bonds"
  on public.brick_bond_patterns for insert to authenticated
  with check ((select auth.uid()) = owner_id);

drop policy if exists "Users can update their own brick bonds" on public.brick_bond_patterns;
create policy "Users can update their own brick bonds"
  on public.brick_bond_patterns for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists "Users can delete their own brick bonds" on public.brick_bond_patterns;
create policy "Users can delete their own brick bonds"
  on public.brick_bond_patterns for delete to authenticated
  using ((select auth.uid()) = owner_id);
