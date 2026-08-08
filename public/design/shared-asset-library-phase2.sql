-- Girih Studio / Mehraz shared library (Phases 2–4)
-- Shared, versioned asset library for Girih App, Bricks App, Muqarnas App,
-- and the future Mehraz App.
--
-- This migration is idempotent and can be run from the Supabase SQL editor.

create table if not exists public.library_assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  asset_type text not null check (
    asset_type in (
      'girih_pattern',
      'brick_bond',
      'muqarnas_assembly',
      'surface_sticker',
      'mehraz_project'
    )
  ),
  source_app text not null check (source_app in ('girih', 'bricks', 'muqarnas', 'mehraz')),
  name text not null check (char_length(name) between 1 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  visibility text not null default 'private' check (visibility in ('private', 'unlisted', 'public')),
  lifecycle_status text not null default 'active' check (lifecycle_status in ('active', 'archived')),
  current_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (asset_type in ('girih_pattern', 'surface_sticker') and source_app = 'girih')
    or (asset_type = 'brick_bond' and source_app = 'bricks')
    or (asset_type = 'muqarnas_assembly' and source_app = 'muqarnas')
    or (asset_type = 'mehraz_project' and source_app = 'mehraz')
  )
);

create table if not exists public.library_asset_versions (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.library_assets(id) on delete restrict,
  version_number integer not null check (version_number > 0),
  contract_id text not null default 'girihstudio.library-asset'
    check (contract_id = 'girihstudio.library-asset'),
  contract_version integer not null default 1 check (contract_version > 0),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  artifacts jsonb not null default '{}'::jsonb check (jsonb_typeof(artifacts) = 'object'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  content_hash text check (content_hash is null or char_length(content_hash) between 16 and 128),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (asset_id, version_number),
  unique (asset_id, id)
);

alter table public.library_assets
  drop constraint if exists library_assets_current_version_id_fkey;
alter table public.library_assets
  add constraint library_assets_current_version_id_fkey
  foreign key (id, current_version_id)
  references public.library_asset_versions(asset_id, id)
  on delete restrict
  deferrable initially deferred;

create table if not exists public.library_asset_entitlements (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.library_assets(id) on delete restrict,
  grantee_id uuid not null references auth.users(id) on delete cascade,
  permission text not null default 'use' check (permission in ('view', 'use', 'edit')),
  source text not null default 'share' check (source in ('share', 'marketplace', 'admin')),
  marketplace_purchase_id uuid,
  granted_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique (asset_id, grantee_id)
);

-- Marketplace is optional in shared Supabase projects used only by Bricks,
-- Muqarnas, or Mehraz. Add the purchase relationship when that table exists,
-- without preventing the shared library from being installed when it does not.
do $$
begin
  if to_regclass('public.marketplace_purchases') is not null
     and not exists (
       select 1
       from pg_constraint
       where conname = 'library_asset_entitlements_marketplace_purchase_id_fkey'
         and conrelid = 'public.library_asset_entitlements'::regclass
     ) then
    execute $sql$
      alter table public.library_asset_entitlements
        add constraint library_asset_entitlements_marketplace_purchase_id_fkey
        foreign key (marketplace_purchase_id)
        references public.marketplace_purchases(id)
        on delete set null
    $sql$;
  end if;
end;
$$;

create index if not exists library_assets_owner_updated_idx
  on public.library_assets (owner_id, updated_at desc);
create index if not exists library_assets_type_visibility_idx
  on public.library_assets (asset_type, visibility, updated_at desc);
create index if not exists library_asset_versions_asset_created_idx
  on public.library_asset_versions (asset_id, version_number desc);
create index if not exists library_asset_entitlements_grantee_idx
  on public.library_asset_entitlements (grantee_id, created_at desc);
create index if not exists library_asset_entitlements_asset_idx
  on public.library_asset_entitlements (asset_id, created_at desc);

create or replace function public.touch_library_asset_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_library_assets_updated_at on public.library_assets;
create trigger touch_library_assets_updated_at
  before update on public.library_assets
  for each row execute procedure public.touch_library_asset_updated_at();

create or replace function public.can_manage_library_asset(check_asset_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.library_assets asset
    where asset.id = check_asset_id
      and asset.owner_id = (select auth.uid())
  );
$$;

create or replace function public.can_access_library_asset(check_asset_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.library_assets asset
    where asset.id = check_asset_id
      and (
        asset.owner_id = (select auth.uid())
        or (
          asset.lifecycle_status = 'active'
          and (
            asset.visibility in ('public', 'unlisted')
            or exists (
              select 1
              from public.library_asset_entitlements entitlement
              where entitlement.asset_id = asset.id
                and entitlement.grantee_id = (select auth.uid())
                and (entitlement.expires_at is null or entitlement.expires_at > now())
            )
          )
        )
      )
  );
$$;

create or replace function public.library_asset_id_from_storage_path(object_name text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
declare
  folders text[];
begin
  folders := storage.foldername(object_name);
  if coalesce(array_length(folders, 1), 0) < 3 then
    return null;
  end if;
  return folders[2]::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

revoke all on function public.can_manage_library_asset(uuid) from public;
revoke all on function public.can_access_library_asset(uuid) from public;
revoke all on function public.library_asset_id_from_storage_path(text) from public;
grant execute on function public.can_manage_library_asset(uuid) to authenticated, service_role;
grant execute on function public.can_access_library_asset(uuid) to authenticated, service_role;
grant execute on function public.library_asset_id_from_storage_path(text) to authenticated, service_role;

create or replace function public.create_library_asset_version(
  target_asset_id uuid,
  next_payload jsonb,
  next_artifacts jsonb default '{}'::jsonb,
  next_metadata jsonb default '{}'::jsonb,
  next_content_hash text default null
)
returns public.library_asset_versions
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_version public.library_asset_versions;
  next_version_number integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required to save a library version.';
  end if;

  if not public.can_manage_library_asset(target_asset_id) then
    raise exception 'The current user does not own this library asset.';
  end if;

  perform 1
  from public.library_assets
  where id = target_asset_id
  for update;

  select coalesce(max(version_number), 0) + 1
    into next_version_number
  from public.library_asset_versions
  where asset_id = target_asset_id;

  insert into public.library_asset_versions (
    asset_id,
    version_number,
    payload,
    artifacts,
    metadata,
    content_hash,
    created_by
  ) values (
    target_asset_id,
    next_version_number,
    next_payload,
    coalesce(next_artifacts, '{}'::jsonb),
    coalesce(next_metadata, '{}'::jsonb),
    nullif(next_content_hash, ''),
    (select auth.uid())
  )
  returning * into inserted_version;

  update public.library_assets
  set current_version_id = inserted_version.id
  where id = target_asset_id;

  return inserted_version;
end;
$$;

revoke all on function public.create_library_asset_version(uuid, jsonb, jsonb, jsonb, text)
  from public, anon;
grant execute on function public.create_library_asset_version(uuid, jsonb, jsonb, jsonb, text)
  to authenticated, service_role;

create or replace function public.create_library_asset_with_version(
  new_asset_type text,
  new_source_app text,
  new_name text,
  new_description text default '',
  new_visibility text default 'private',
  new_payload jsonb default '{}'::jsonb,
  new_artifacts jsonb default '{}'::jsonb,
  new_metadata jsonb default '{}'::jsonb,
  new_content_hash text default null
)
returns table (asset_id uuid, version_id uuid, version_number integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_asset public.library_assets;
  inserted_version public.library_asset_versions;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required to save a library asset.';
  end if;

  insert into public.library_assets (
    owner_id,
    asset_type,
    source_app,
    name,
    description,
    visibility
  ) values (
    (select auth.uid()),
    new_asset_type,
    new_source_app,
    new_name,
    coalesce(new_description, ''),
    coalesce(new_visibility, 'private')
  )
  returning * into inserted_asset;

  select *
  into inserted_version
  from public.create_library_asset_version(
    inserted_asset.id,
    new_payload,
    new_artifacts,
    new_metadata,
    new_content_hash
  );

  return query
  select inserted_asset.id, inserted_version.id, inserted_version.version_number;
end;
$$;

revoke all on function public.create_library_asset_with_version(text, text, text, text, text, jsonb, jsonb, jsonb, text)
  from public, anon;
grant execute on function public.create_library_asset_with_version(text, text, text, text, text, jsonb, jsonb, jsonb, text)
  to authenticated, service_role;

create or replace function public.library_capabilities()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'phase', 3,
    'contractVersion', 1,
    'assetTypes', jsonb_build_array(
      'girih_pattern',
      'brick_bond',
      'muqarnas_assembly',
      'surface_sticker',
      'mehraz_project'
    ),
    'immutableVersions', true,
    'privateArtifacts', true
  );
$$;

revoke all on function public.library_capabilities() from public;
grant execute on function public.library_capabilities() to anon, authenticated, service_role;

alter table public.library_assets enable row level security;
alter table public.library_asset_versions enable row level security;
alter table public.library_asset_entitlements enable row level security;

revoke all on public.library_assets from anon;
revoke all on public.library_asset_versions from anon;
revoke all on public.library_asset_entitlements from anon;

grant select, insert, update on public.library_assets to authenticated;
grant select, insert on public.library_asset_versions to authenticated;
grant select, insert, update, delete on public.library_asset_entitlements to authenticated;
grant all on public.library_assets to service_role;
grant all on public.library_asset_versions to service_role;
grant all on public.library_asset_entitlements to service_role;

drop policy if exists "Library assets are visible to entitled users" on public.library_assets;
create policy "Library assets are visible to entitled users"
  on public.library_assets for select to authenticated
  using (public.can_access_library_asset(id));

drop policy if exists "Users can create their own library assets" on public.library_assets;
create policy "Users can create their own library assets"
  on public.library_assets for insert to authenticated
  with check ((select auth.uid()) = owner_id);

-- RLS repair policy for projects that installed an earlier copy of this
-- migration before the direct-save fallback existed. Multiple INSERT policies
-- are ORed by Postgres, so this safely restores direct authenticated saves
-- without weakening ownership: the row owner must still be the signed-in user.
drop policy if exists "Authenticated users may insert owned library assets" on public.library_assets;
create policy "Authenticated users may insert owned library assets"
  on public.library_assets for insert to authenticated
  with check (
    auth.role() = 'authenticated'
    and owner_id = auth.uid()
  );

drop policy if exists "Owners can update library asset metadata" on public.library_assets;
create policy "Owners can update library asset metadata"
  on public.library_assets for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists "Library versions are visible to entitled users" on public.library_asset_versions;
create policy "Library versions are visible to entitled users"
  on public.library_asset_versions for select to authenticated
  using (public.can_access_library_asset(asset_id));

drop policy if exists "Owners can create immutable library versions" on public.library_asset_versions;
create policy "Owners can create immutable library versions"
  on public.library_asset_versions for insert to authenticated
  with check (
    public.can_manage_library_asset(asset_id)
    and created_by = (select auth.uid())
  );

drop policy if exists "Authenticated owners may insert library versions" on public.library_asset_versions;
create policy "Authenticated owners may insert library versions"
  on public.library_asset_versions for insert to authenticated
  with check (
    auth.role() = 'authenticated'
    and public.can_manage_library_asset(asset_id)
    and created_by = auth.uid()
  );

drop policy if exists "Entitlements are visible to owners and recipients" on public.library_asset_entitlements;
create policy "Entitlements are visible to owners and recipients"
  on public.library_asset_entitlements for select to authenticated
  using (
    grantee_id = (select auth.uid())
    or public.can_manage_library_asset(asset_id)
  );

drop policy if exists "Owners can grant library entitlements" on public.library_asset_entitlements;
create policy "Owners can grant library entitlements"
  on public.library_asset_entitlements for insert to authenticated
  with check (
    public.can_manage_library_asset(asset_id)
    and granted_by = (select auth.uid())
  );

drop policy if exists "Owners can update library entitlements" on public.library_asset_entitlements;
create policy "Owners can update library entitlements"
  on public.library_asset_entitlements for update to authenticated
  using (public.can_manage_library_asset(asset_id))
  with check (public.can_manage_library_asset(asset_id));

drop policy if exists "Owners can revoke library entitlements" on public.library_asset_entitlements;
create policy "Owners can revoke library entitlements"
  on public.library_asset_entitlements for delete to authenticated
  using (public.can_manage_library_asset(asset_id));

-- Private artifact storage.
-- Required object path:
--   {owner_uuid}/{asset_uuid}/{version_uuid}/{filename}
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'library-assets',
  'library-assets',
  false,
  104857600,
  array[
    'application/json',
    'application/pdf',
    'image/png',
    'image/svg+xml',
    'model/gltf-binary',
    'video/webm'
  ]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Entitled users can read library artifacts" on storage.objects;
create policy "Entitled users can read library artifacts"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'library-assets'
    and public.can_access_library_asset(public.library_asset_id_from_storage_path(name))
  );

drop policy if exists "Owners can upload library artifacts" on storage.objects;
create policy "Owners can upload library artifacts"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'library-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.can_manage_library_asset(public.library_asset_id_from_storage_path(name))
  );

drop policy if exists "Owners can update library artifacts" on storage.objects;
create policy "Owners can update library artifacts"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'library-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.can_manage_library_asset(public.library_asset_id_from_storage_path(name))
  )
  with check (
    bucket_id = 'library-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.can_manage_library_asset(public.library_asset_id_from_storage_path(name))
  );

drop policy if exists "Owners can delete library artifacts" on storage.objects;
create policy "Owners can delete library artifacts"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'library-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.can_manage_library_asset(public.library_asset_id_from_storage_path(name))
  );

comment on table public.library_assets is
  'Stable identities and ownership metadata for cross-app Girih Studio library assets.';
comment on table public.library_asset_versions is
  'Immutable, contract-versioned payload snapshots. Authenticated clients receive no update or delete privilege.';
comment on table public.library_asset_entitlements is
  'Explicit access grants used for sharing and marketplace purchases.';

-- Make newly created tables and RPC functions immediately visible through
-- Supabase's PostgREST API after this migration is run in the SQL editor.
notify pgrst, 'reload schema';
