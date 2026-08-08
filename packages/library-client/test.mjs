import assert from 'node:assert/strict';
import { LIBRARY_CONTRACT } from './index.js';

assert.equal(LIBRARY_CONTRACT.id, 'girihstudio.library-asset');
assert.equal(LIBRARY_CONTRACT.version, 1);
assert.deepEqual(LIBRARY_CONTRACT.appByType, {
  girih_pattern: 'girih',
  brick_bond: 'bricks',
  muqarnas_assembly: 'muqarnas',
  surface_sticker: 'girih',
  mehraz_project: 'mehraz',
});

console.log('Phase 3 shared library client contract passed.');
