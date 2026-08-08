alter table public.training_modules
  add column if not exists owner_id uuid references public.profiles(id) on delete set null,
  add column if not exists status text not null default 'draft',
  add column if not exists archived_at timestamptz;

alter table public.training_modules drop constraint if exists training_modules_status_check;
alter table public.training_modules add constraint training_modules_status_check
  check (status in ('draft', 'published', 'archived'));

update public.training_modules
set status = case when is_published then 'published' else 'draft' end
where owner_id is null;

create index if not exists training_modules_owner_status_idx
  on public.training_modules (owner_id, status, updated_at desc);

drop policy if exists "Authenticated users can read published training" on public.training_modules;
create policy "Authenticated users can read published training" on public.training_modules
  for select to authenticated
  using (status = 'published' and is_published = true);
