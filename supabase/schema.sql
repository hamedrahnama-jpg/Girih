create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'free' check (role in ('free', 'paid', 'admin')),
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  subscription_status text not null default 'inactive',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists public_name text;
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists stripe_connect_account_id text unique;
alter table public.profiles add column if not exists stripe_connect_enabled boolean not null default false;

create table if not exists public.user_activity_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_key text not null check (char_length(session_key) between 8 and 120),
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  unique (user_id, session_key)
);

create index if not exists user_activity_sessions_user_idx
  on public.user_activity_sessions (user_id, last_seen_at desc);
create index if not exists user_activity_sessions_seen_idx
  on public.user_activity_sessions (last_seen_at desc);

alter table public.user_activity_sessions enable row level security;
revoke all on public.user_activity_sessions from anon, authenticated;
grant all on public.user_activity_sessions to service_role;

alter table public.profiles enable row level security;

revoke all on public.profiles from anon;
revoke insert, update, delete on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant all on public.profiles to service_role;

drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile"
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, nullif(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create table if not exists public.marketplace_listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  category text not null check (category in ('10 Tond', '10 Kond', '8 Morocco', '8 Persian', 'Mixed', 'Stickers')),
  price_cents integer not null check (price_cents between 100 and 10000000),
  currency text not null default 'usd' check (currency ~ '^[a-z]{3}$'),
  piece_count integer not null default 0 check (piece_count >= 0),
  preview_image text not null,
  model_data jsonb not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  sales_count integer not null default 0 check (sales_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Migrate the original misspelled category without breaking existing listings.
alter table public.marketplace_listings
  drop constraint if exists marketplace_listings_category_check;
update public.marketplace_listings
  set category = '8 Morocco'
  where category = '8 Morroco';
alter table public.marketplace_listings
  add constraint marketplace_listings_category_check
  check (category in ('10 Tond', '10 Kond', '8 Morocco', '8 Persian', 'Mixed', 'Stickers'));

create index if not exists marketplace_listings_status_created_idx
  on public.marketplace_listings (status, created_at desc);
create index if not exists marketplace_listings_seller_idx
  on public.marketplace_listings (seller_id, created_at desc);
create index if not exists marketplace_listings_category_idx
  on public.marketplace_listings (category, created_at desc);

create table if not exists public.user_patterns (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  piece_count integer not null default 0 check (piece_count >= 0),
  preview_image text not null,
  model_data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_patterns_owner_idx
  on public.user_patterns (owner_id, updated_at desc);

create table if not exists public.marketplace_purchases (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.marketplace_listings(id) on delete restrict,
  buyer_id uuid not null references public.profiles(id) on delete restrict,
  seller_id uuid not null references public.profiles(id) on delete restrict,
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null check (currency ~ '^[a-z]{3}$'),
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text,
  created_at timestamptz not null default now(),
  unique (listing_id, buyer_id)
);

create index if not exists marketplace_purchases_buyer_idx
  on public.marketplace_purchases (buyer_id, created_at desc);
create index if not exists marketplace_purchases_seller_idx
  on public.marketplace_purchases (seller_id, created_at desc);

alter table public.marketplace_listings enable row level security;
alter table public.marketplace_purchases enable row level security;
alter table public.user_patterns enable row level security;

revoke all on public.marketplace_listings from anon, authenticated;
revoke all on public.marketplace_purchases from anon, authenticated;
grant all on public.marketplace_listings to service_role;
grant all on public.marketplace_purchases to service_role;
revoke all on public.user_patterns from anon, authenticated;
grant all on public.user_patterns to service_role;

drop function if exists public.increment_marketplace_sales(uuid);

create or replace function public.record_marketplace_purchase(
  purchase_listing uuid,
  purchase_buyer uuid,
  purchase_seller uuid,
  purchase_amount integer,
  purchase_currency text,
  checkout_session text,
  payment_intent text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_purchase uuid;
begin
  insert into public.marketplace_purchases (
    listing_id,
    buyer_id,
    seller_id,
    amount_cents,
    currency,
    stripe_checkout_session_id,
    stripe_payment_intent_id
  ) values (
    purchase_listing,
    purchase_buyer,
    purchase_seller,
    purchase_amount,
    purchase_currency,
    checkout_session,
    nullif(payment_intent, '')
  )
  on conflict (listing_id, buyer_id) do nothing
  returning id into inserted_purchase;

  if inserted_purchase is null then
    return false;
  end if;

  update public.marketplace_listings
  set sales_count = sales_count + 1,
      updated_at = now()
  where id = purchase_listing;

  return true;
end;
$$;

revoke all on function public.record_marketplace_purchase(uuid, uuid, uuid, integer, text, text, text)
  from public, anon, authenticated;
grant execute on function public.record_marketplace_purchase(uuid, uuid, uuid, integer, text, text, text)
  to service_role;

-- Brick bonds authored in Bricks App and reused by the same account in Muqarnas App.
create table if not exists public.brick_bond_patterns (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  bond_pattern jsonb not null check (jsonb_typeof(bond_pattern) = 'object'),
  source_pattern jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, name)
);

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

-- After creating your own account, promote only that account to admin:
-- update public.profiles set role = 'admin' where email = 'your-admin@email.com';
