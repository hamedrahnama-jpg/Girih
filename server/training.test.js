import test from 'node:test';
import assert from 'node:assert/strict';
import { moduleTaskIds } from './training.js';

test('embedded training gives every instruction a stable task id', () => {
  const ids = moduleTaskIds({
    lessons: [
      { title: 'First', steps: ['Open the tool', 'Place a piece'] },
      { title: 'Second', steps: ['Check the result'] },
    ],
  });
  assert.deepEqual(ids, ['0:0', '0:1', '1:0']);
});

test('a lesson without instructions remains completable', () => {
  assert.deepEqual(moduleTaskIds({ lessons: [{ title: 'Overview', steps: [] }] }), ['0:lesson']);
});
