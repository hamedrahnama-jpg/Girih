import test from 'node:test';
import assert from 'node:assert/strict';
import { fittedOrthographicHalfHeight } from './thumbnail-frame.js';

test('front thumbnail fits a wide model with padding', () => {
  const aspect = 1.5;
  const halfHeight = fittedOrthographicHalfHeight({ frameWidth: 18, frameHeight: 8, aspect });
  assert.ok(halfHeight * aspect >= 18 * 0.5 * 1.14);
  assert.ok(halfHeight >= 8 * 0.5);
});

test('front thumbnail fits a tall model with padding', () => {
  const aspect = 1.5;
  const halfHeight = fittedOrthographicHalfHeight({ frameWidth: 5, frameHeight: 16, aspect });
  assert.ok(halfHeight >= 16 * 0.5 * 1.14);
  assert.ok(halfHeight * aspect >= 5 * 0.5);
});
