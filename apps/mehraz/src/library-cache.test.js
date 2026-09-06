import assert from 'node:assert/strict';
import test from 'node:test';
import {
  readLibraryCatalogueCache,
  readLibraryVersionCache,
  readLibraryVersionListCache,
  writeLibraryCatalogueCache,
  writeLibraryVersionCache,
  writeLibraryVersionListCache,
} from './library-cache.js';

test('library cache retains catalogue summaries and immutable payloads independently', async () => {
  await writeLibraryCatalogueCache('cache-user', {
    assets: [{ id: 'asset-1', name: 'Cached summary' }],
    nextCursor: { updatedAt: '2026-09-03T10:00:00Z', id: 'asset-1' },
    hasMore: true,
  });
  await writeLibraryVersionListCache('asset-1', [{ id: 'version-1', version_number: 1 }]);
  await writeLibraryVersionCache({ id: 'version-1', payload: { building: { width: 4 } } });

  const catalogue = await readLibraryCatalogueCache('cache-user');
  const versions = await readLibraryVersionListCache('asset-1');
  const payload = await readLibraryVersionCache('version-1');
  assert.equal(catalogue.assets[0].name, 'Cached summary');
  assert.equal(catalogue.hasMore, true);
  assert.equal(versions.versions[0].version_number, 1);
  assert.equal(payload.version.payload.building.width, 4);
});

