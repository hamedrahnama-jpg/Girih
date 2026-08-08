import test from 'node:test';
import assert from 'node:assert/strict';
import { muqarnasPreviewMetrics, portalMuqarnasTransform } from './arch-muqarnas-placement.js';

test('Muqarnas preview is normalized to a stable portal-fitting width', () => {
  const metrics = muqarnasPreviewMetrics({
    instances: [
      { transform: { position: [-3, 0, 0], scale: [2, 1, 1] } },
      { transform: { position: [3, 2, 0], scale: [2, 1, 1] } },
    ],
  });

  assert.equal(metrics.width, 2.4);
  assert.ok(metrics.height > 0);
  assert.ok(metrics.depth > 0);
  assert.ok(metrics.minY < 0);
});

test('arch Muqarnas fits the portal and faces global south', () => {
  const transform = portalMuqarnasTransform({
    width: 8,
    depth: 6,
    height: 7,
    wallThickness: 0.4,
    openingWidth: 5,
  }, {
    extraHeights: { east: 0, west: 1 },
    sideOffsets: { south: 0.75 },
  });

  assert.deepEqual(transform.rotation, [0, 180, 0]);
  assert.equal(transform.position[2], 0);
  assert.equal(transform.scale[0] * 2.4, 5);
  assert.deepEqual(transform.scale, [transform.scale[0], transform.scale[0], transform.scale[0]]);
});

test('portal fit never exceeds the building clear width', () => {
  const transform = portalMuqarnasTransform({
    width: 4,
    depth: 2,
    height: 6,
    wallThickness: 0.35,
    openingWidth: 9,
  }, {
    extraHeights: {},
    sideOffsets: {},
  });

  assert.equal(transform.scale[0] * 2.4, 4);
  assert.equal(transform.position[2], 0);
});
