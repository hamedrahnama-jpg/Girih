import assert from 'node:assert/strict';
import test from 'node:test';
import { isKarbandiRibArchEditorTarget } from './karbandi-editor-target.js';

function target({ insideArch = false, inputControl = false } = {}) {
  return {
    closest(selector) {
      if (selector === '[data-karbandi-arch]') return insideArch ? {} : null;
      return inputControl ? {} : null;
    },
  };
}

test('Rib arch inputs and stepper arrows keep construction guides active', () => {
  assert.equal(isKarbandiRibArchEditorTarget(target({ insideArch: true, inputControl: true })), true);
  assert.equal(isKarbandiRibArchEditorTarget(target({ insideArch: true, inputControl: false })), false);
  assert.equal(isKarbandiRibArchEditorTarget(target({ insideArch: false, inputControl: true })), false);
});
