import assert from 'node:assert/strict';
import { ASSET_CONTRACT_EXAMPLES } from './examples.js';
import { ASSET_TYPES, createLibraryAsset, validateLibraryAsset } from './index.js';

ASSET_CONTRACT_EXAMPLES.forEach((asset) => {
  const result = validateLibraryAsset(asset);
  assert.equal(result.valid, true, `${asset.assetType}: ${JSON.stringify(result.errors)}`);
});

const invalid = createLibraryAsset({
  assetType: ASSET_TYPES.BRICK_BOND,
  name: 'Invalid dimensions',
  payload: { brickWidth: 0, brickHeight: 0, mortar: 0, pattern: {} },
});
assert.equal(validateLibraryAsset(invalid).valid, false);

console.log(`Asset contract v1: ${ASSET_CONTRACT_EXAMPLES.length} examples passed.`);
