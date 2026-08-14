import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CONSTRUCTION_STEPS, coverSystemAllowsPlacement, moduleTopExtrusionGeometry, normalizePreview, objectIsSelectable, previewWorldBounds } from './mehraz-scene.js';

test('Ahang subsection builds every lower wall, two guides, south under-arch infill, then the arch cover', () => {
  assert.deepEqual(
    CONSTRUCTION_STEPS.filter((step) => !step.id.startsWith('karbandi-')).slice(0, 6).map((step) => step.id),
    ['empty', 'lower-walls', 'south-arch-guide', 'north-arch-guide', 'south-wall', 'arch-fill'],
  );
  assert.equal(CONSTRUCTION_STEPS[1].detail, 'Raise the south, east, west, and north-side walls together to the arch spring line.');
  assert.equal(CONSTRUCTION_STEPS.find((step) => step.id === 'south-wall').title, 'South wall under arch');
  assert.equal(CONSTRUCTION_STEPS.find((step) => step.id === 'arch-fill').title, 'Cover the guide arches');
});

test('Karbandi subsection follows walls with the north guide, clipped ribs, roof cover, and north wall', () => {
  assert.deepEqual(
    CONSTRUCTION_STEPS.filter((step) => !['south-arch-guide', 'south-wall', 'arch-fill'].includes(step.id)).slice(1, 7).map((step) => step.id),
    ['lower-walls', 'north-arch-guide', 'karbandi-reference-rib', 'karbandi-ribs', 'karbandi-roof', 'north-upper-wall'],
  );
});

test('cover Muqarnas hides for Karbandi and returns for Ahang without removing its placement', () => {
  const placement = { id: 'muqarnas-1', role: 'arch-muqarnas', assetType: 'muqarnas_assembly' };
  assert.equal(coverSystemAllowsPlacement(placement, { karbandi: { enabled: true } }), false);
  assert.equal(coverSystemAllowsPlacement(placement, { karbandi: { enabled: false }, ahang: { enabled: true } }), true);
  assert.equal(coverSystemAllowsPlacement({ ...placement, role: 'general-placement' }, { karbandi: { enabled: true } }), true);
  assert.equal(placement.id, 'muqarnas-1', 'switching cover visibility must not remove or replace the placement');
});

test('a Muqarnas hidden by Karbandi cannot be selected through its visible child meshes', () => {
  const placementGroup = new THREE.Group();
  const muqarnas = new THREE.Group();
  const module = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  placementGroup.add(muqarnas);
  muqarnas.add(module);

  muqarnas.visible = false;
  muqarnas.userData.hiddenByCoverSystem = true;
  assert.equal(objectIsSelectable(module, placementGroup), false);
  assert.equal(objectIsSelectable(muqarnas, placementGroup), false);

  muqarnas.visible = true;
  muqarnas.userData.hiddenByCoverSystem = false;
  assert.equal(objectIsSelectable(module, placementGroup), true);
});

test('Muqarnas infill extrudes the module top exactly to the arch without overlap', () => {
  const module = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 1));
  module.position.set(0, 1, 0);
  const geometry = moduleTopExtrusionGeometry(module, (x) => 4 + x * 0.5);

  assert.ok(geometry);
  assert.ok(Math.abs(geometry.boundingBox.min.y - 1.5) < 1e-6);
  assert.ok(Math.abs(geometry.boundingBox.max.y - 4.5) < 1e-6);
  assert.equal(geometry.userData.extrusionAxis, 'global-y');
  assert.equal(geometry.userData.upperBoundary, 'arch-curve');
  const positions = geometry.getAttribute('position');
  const topOffset = positions.count / 2;
  for (let index = 0; index < topOffset; index += 1) {
    assert.ok(Math.abs(positions.getX(index) - positions.getX(index + topOffset)) < 1e-7);
    assert.ok(Math.abs(positions.getZ(index) - positions.getZ(index + topOffset)) < 1e-7);
    assert.ok(Math.abs(positions.getY(index + topOffset) - (4 + positions.getX(index) * 0.5)) < 1e-6);
  }
});

test('Muqarnas infill closes the portion of a top surface that has not reached the arch', () => {
  const module = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 1));
  module.position.set(0, 1, 0);
  const geometry = moduleTopExtrusionGeometry(module, (x) => 1.5 + (x + 1));

  assert.ok(geometry, 'a partly touching top face must still produce infill');
  assert.ok(geometry.boundingBox.min.x > -1, 'the infill must begin at the arch contact line');
  assert.ok(Math.abs(geometry.boundingBox.max.x - 1) < 1e-6);
  assert.ok(Math.abs(geometry.boundingBox.max.y - 3.5) < 1e-6);
  const positions = geometry.getAttribute('position');
  const topOffset = positions.count / 2;
  for (let index = 0; index < topOffset; index += 1) {
    assert.ok(
      positions.getY(index + topOffset) >= positions.getY(index) + 0.0009,
      'every generated infill vertex must remain below its matching arch point',
    );
  }
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
