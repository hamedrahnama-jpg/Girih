import assert from 'node:assert/strict';
import test from 'node:test';
import {
  listLibraryAssets,
  getLibraryAssetVersion,
  listLibraryAssetVersions,
  listLibraryAssetVersionsForAssets,
} from './library-client.generated.js';

class FakeQuery {
  constructor(result, calls) {
    this.result = result;
    this.calls = calls;
  }

  select(columns) { this.calls.selects.push(columns); return this; }
  eq() { return this; }
  in() { return this; }
  order() { return this; }
  limit() { return this; }
  or() { return this; }
  lt() { return this; }
  single() { return this; }
  abortSignal(signal) {
    this.calls.signals.push(signal);
    return this;
  }

  then(resolve, reject) {
    return Promise.resolve(this.result).then(resolve, reject);
  }
}

function fakeSupabase(resultsByTable) {
  const calls = { getUser: 0, tables: [], signals: [], selects: [] };
  return {
    calls,
    auth: {
      async getUser() {
        calls.getUser += 1;
        return { data: { user: { id: 'user-1' } }, error: null };
      },
      async signOut() {},
    },
    from(table) {
      calls.tables.push(table);
      const queue = resultsByTable[table] || [];
      return new FakeQuery(queue.shift() || { data: [], error: null }, calls);
    },
  };
}

test('library reads reuse a recent verified user and pass abort signals to PostgREST', async () => {
  const client = fakeSupabase({
    library_assets: [{
      data: [{ id: 'asset-1', owner_id: 'user-1', current_version_id: 'version-1' }],
      error: null,
    }],
    library_asset_versions: [
      { data: [{ id: 'version-1', asset_id: 'asset-1', version_number: 1 }], error: null },
      { data: [{ id: 'version-1', asset_id: 'asset-1', version_number: 1 }], error: null },
    ],
  });
  const controller = new AbortController();
  const page = await listLibraryAssets(client, { signal: controller.signal });
  await listLibraryAssetVersions(client, 'asset-1', { signal: controller.signal });
  assert.equal(page.assets[0].owned, true);
  assert.equal(page.hasMore, false);
  assert.equal(client.calls.getUser, 1, 'rapid library reads must share one remote account verification');
  assert.equal(client.calls.signals.length, 3);
  assert.ok(client.calls.signals.every((signal) => signal instanceof AbortSignal));
  assert.ok(client.calls.selects.slice(0, 3).every((columns) => !String(columns).includes('payload')),
    'catalogue and history reads must not eagerly download payloads');
});

test('a complete payload is fetched only for one requested immutable version', async () => {
  const client = fakeSupabase({
    library_asset_versions: [{
      data: { id: 'version-7', asset_id: 'asset-1', version_number: 7, payload: { building: {} } },
      error: null,
    }],
  });
  const version = await getLibraryAssetVersion(client, 'version-7');
  assert.equal(version.version_number, 7);
  assert.deepEqual(client.calls.tables, ['library_asset_versions']);
  assert.match(client.calls.selects[0], /payload/);
});

test('catalogue pages are bounded and expose a stable next cursor', async () => {
  const rows = Array.from({ length: 4 }, (_, index) => ({
    id: `asset-${4 - index}`,
    owner_id: 'user-1',
    current_version_id: null,
    updated_at: `2026-09-0${4 - index}T10:00:00Z`,
  }));
  const client = fakeSupabase({ library_assets: [{ data: rows, error: null }] });
  const page = await listLibraryAssets(client, { pageSize: 3 });
  assert.equal(page.assets.length, 3);
  assert.equal(page.hasMore, true);
  assert.deepEqual(page.nextCursor, { updatedAt: rows[2].updated_at, id: rows[2].id });
});

test('transient catalogue failures retry without retrying successful requests', async () => {
  const client = fakeSupabase({
    library_assets: [
      { data: null, error: { status: 503, message: 'temporarily unavailable' } },
      { data: [], error: null },
    ],
  });
  const page = await listLibraryAssets(client);
  assert.deepEqual(page.assets, []);
  assert.deepEqual(client.calls.tables, ['library_assets', 'library_assets']);
});

test('all Mehraz project histories load in one batched version query', async () => {
  const client = fakeSupabase({
    library_asset_versions: [{
      data: [
        { id: 'v3', asset_id: 'project-a', version_number: 3 },
        { id: 'v2', asset_id: 'project-a', version_number: 2 },
        { id: 'v1', asset_id: 'project-b', version_number: 1 },
      ],
      error: null,
    }],
  });
  const grouped = await listLibraryAssetVersionsForAssets(client, ['project-a', 'project-b']);
  assert.deepEqual(grouped['project-a'].map((version) => version.id), ['v3', 'v2']);
  assert.deepEqual(grouped['project-b'].map((version) => version.id), ['v1']);
  assert.deepEqual(client.calls.tables, ['library_asset_versions']);
});
