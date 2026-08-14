import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CONSTRUCTION_STEPS, MehrazScene } from './mehraz-scene.js';

function exportFixture() {
  const scene = Object.create(MehrazScene.prototype);
  scene.constructionStepIndex = CONSTRUCTION_STEPS.length - 1;
  scene.constructionStepProgress = 1;
  scene.buildingGroup = new THREE.Group();
  scene.archInfillGroup = new THREE.Group();
  scene.zoneDecorationGroup = new THREE.Group();
  scene.placementGroup = new THREE.Group();

  const walls = new THREE.Group();
  walls.userData.wallSystem = true;
  walls.add(new THREE.Mesh(new THREE.BoxGeometry(4, 3, 0.35), new THREE.MeshStandardMaterial({ color: '#d8b678' })));
  scene.buildingGroup.add(walls);

  const hiddenHelper = new THREE.Mesh(new THREE.BoxGeometry(20, 20, 20));
  hiddenHelper.visible = false;
  scene.placementGroup.add(hiddenHelper);
  return scene;
}

class TestFileReader {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((result) => {
      this.result = result;
      this.onloadend?.();
    });
  }
}

test('STL export produces a valid binary model and excludes hidden construction geometry', async () => {
  const blob = exportFixture().exportStlBlob();
  const data = await blob.arrayBuffer();
  const view = new DataView(data);
  const triangles = view.getUint32(80, true);

  assert.equal(blob.type, 'model/stl');
  assert.equal(triangles, 12);
  assert.equal(data.byteLength, 84 + triangles * 50);
});

test('STL export handles hydrated Muqarnas runtime placement references', async () => {
  const scene = exportFixture();
  const placement = new THREE.Group();
  placement.userData.assetType = 'muqarnas_assembly';
  const moduleRoot = new THREE.Group();
  const module = new THREE.Mesh(new THREE.TetrahedronGeometry(0.5));
  moduleRoot.add(module);
  moduleRoot.userData.exactMuqarnasGeometry = true;
  moduleRoot.userData.placementRoot = placement;
  module.userData.exactMuqarnasGeometry = true;
  module.userData.placementRoot = placement;
  placement.add(moduleRoot);
  scene.placementGroup.add(placement);

  const blob = scene.exportStlBlob();
  const data = await blob.arrayBuffer();
  const triangles = new DataView(data).getUint32(80, true);

  assert.equal(triangles, 16, 'the wall and four Muqarnas tetrahedron faces are exported');
  assert.equal(module.userData.placementRoot, placement, 'the live runtime placement reference is restored');
});

test('STL and GLB snapshots bake visible Karbandi rib clipping into the geometry', () => {
  const scene = exportFixture();
  const material = new THREE.MeshStandardMaterial({ color: '#3490b7' });
  material.clippingPlanes = [
    new THREE.Plane(new THREE.Vector3(1, 0, 0), 1),
    new THREE.Plane(new THREE.Vector3(-1, 0, 0), 1),
  ];
  const rib = new THREE.Mesh(new THREE.BoxGeometry(4, 0.3, 0.2), material);
  rib.userData.isKarbandi = true;
  rib.userData.karbandiRibIndex = 2;
  scene.buildingGroup.children[0].add(rib);

  const exportRoot = scene.createExportModelRoot();
  let exportedRib = null;
  exportRoot.traverse((child) => {
    if (child.userData?.isKarbandi === true) exportedRib = child;
  });
  assert.ok(exportedRib, 'the visible Karbandi rib remains in the shared STL/GLB snapshot');
  exportedRib.geometry.computeBoundingBox();

  assert.ok(exportedRib.geometry.boundingBox.min.x >= -1.000001);
  assert.ok(exportedRib.geometry.boundingBox.max.x <= 1.000001);
  assert.ok(exportedRib.geometry.getAttribute('position').count > 0);
  rib.geometry.computeBoundingBox();
  assert.equal(rib.geometry.boundingBox.min.x, -2, 'the live rib geometry remains unchanged');
  assert.equal(rib.geometry.boundingBox.max.x, 2, 'the live rib geometry remains unchanged');
});

test('GLB export produces a valid GLB 2 binary model', async () => {
  const originalFileReader = globalThis.FileReader;
  globalThis.FileReader = TestFileReader;
  try {
    const blob = await exportFixture().exportGlbBlob();
    const data = await blob.arrayBuffer();
    const view = new DataView(data);

    assert.equal(blob.type, 'model/gltf-binary');
    assert.equal(view.getUint32(0, true), 0x46546c67);
    assert.equal(view.getUint32(4, true), 2);
    assert.equal(view.getUint32(8, true), data.byteLength);
  } finally {
    if (originalFileReader === undefined) delete globalThis.FileReader;
    else globalThis.FileReader = originalFileReader;
  }
});
