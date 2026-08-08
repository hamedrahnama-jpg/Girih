import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(
  new URL('../supabase/migrations/202607270001_shared_asset_library.sql', import.meta.url),
  'utf8',
);

const requiredFragments = [
  'create table if not exists public.library_assets',
  'create table if not exists public.library_asset_versions',
  'create table if not exists public.library_asset_entitlements',
  'create or replace function public.can_access_library_asset',
  'create or replace function public.create_library_asset_version',
  'create or replace function public.create_library_asset_with_version',
  'create or replace function public.library_capabilities',
  'alter table public.library_assets enable row level security',
  'alter table public.library_asset_versions enable row level security',
  'alter table public.library_asset_entitlements enable row level security',
  "'library-assets'",
  'on storage.objects for select to authenticated',
  'on storage.objects for insert to authenticated',
];

requiredFragments.forEach((fragment) => {
  assert.ok(source.toLowerCase().includes(fragment.toLowerCase()), `Missing migration fragment: ${fragment}`);
});

assert.ok(
  !/grant\s+[^;]*\b(update|delete)\b[^;]*on\s+public\.library_asset_versions\s+to\s+authenticated/i.test(source),
  'Immutable versions must never grant update or delete to authenticated users.',
);

[
  'create_library_asset_version',
  'create_library_asset_with_version',
].forEach((functionName) => {
  const functionStart = source.toLowerCase().indexOf(`create or replace function public.${functionName}`);
  assert.notEqual(functionStart, -1, `Missing secure write RPC: ${functionName}`);
  const functionBody = source.slice(functionStart, functionStart + 2600).toLowerCase();
  assert.ok(functionBody.includes('security definer'), `${functionName} must bypass table RLS only through its guarded RPC.`);
  assert.ok(functionBody.includes('auth.uid()'), `${functionName} must explicitly require or verify the authenticated user.`);
});

console.log('Phase 2 library migration structure passed.');
