import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CONSTRUCTION_STEPS, moduleTopExtrusionGeometry, normalizePreview, previewWorldBounds } from './mehraz-scene.js';

test('Ahang subsection follows lower walls with two guides, south wall, then arch courses', () => {
  assert.deepEqual(
    CONSTRUCTION_STEPS.slice(0, 6).map((step) => step.id),
    ['empty', 'lower-walls', 'south-arch-guide', 'north-arch-guide', 'south-wall', 'arch-fill'],
  );
});

test('Muqarnas infill extrudes the module top exactly to the arch without overlap', () => {
  const module = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 1));
  module.position.set(0, 1, 0);
  const geometry = moduleTopExtrusionGeometry(module, (x) => 4 + x * 0.5);

  assert.ok(geometry);
  assert.ok(Math.abs(geometry.boundingBox.min.y - 1.5) < 1e-6);
  assert.ok(Math.abs(geometry.boundingBox.max.y - 4.5) < 1e-6);
});

test('preview normalization stays local after placement under a transformed cover', () => {
  const scene = new THREE.Scene();
  const placement = new THREE.Group();
  placement.position.set(18, 9, 7);
  placement.rotation.y = Math.PI;
  placement.scale.setScalar(0.5);
  scene.add(placement);

  const preview = new THREE.Group();
  placement.add(preview);
  const model = new THREE.Mesh(new THREE.BoxGeometry(4, 2, 1));
  preview.add(model);

  normalizePreview(preview, 2.4, 'x');

  assert.ok(Math.abs(model.scale.x - 0.6) < 1e-9);
  assert.ok(model.position.length() < 1e-9);
});

test('detailed Muqarnas width ignores temporary proxy extents', () => {
  const preview = new THREE.Group();
  const detailedModel = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 1));
  detailedModel.userData.exactMuqarnasGeometry = true;
  preview.add(detailedModel);

  const proxy = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  proxy.position.x = 5;
  preview.add(proxy);

  normalizePreview(preview, 2.4, 'x', (object) => object.userData.exactMuqarnasGeometry === true);

  assert.ok(Math.abs(detailedModel.scale.x * 2 - 2.4) < 1e-9);
});

test('Muqarnas world boundary excludes non-model proxy geometry', () => {
  const preview = new THREE.Group();
  preview.position.set(3, 2, 0);
  const detailedModel = new THREE.Mesh(new THREE.BoxGeometry(4, 2, 1));
  detailedModel.userData.exactMuqarnasGeometry = true;
  preview.add(detailedModel);
  const proxy = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  proxy.position.x = 10;
  preview.add(proxy);

  const bounds = previewWorldBounds(preview, (object) => object.userData.exactMuqarnasGeometry === true);

  assert.ok(Math.abs((bounds.max.x - bounds.min.x) - 4) < 1e-9);
  assert.ok(Math.abs((bounds.max.y - bounds.min.y) - 2) < 1e-9);
});
