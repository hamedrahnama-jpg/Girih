import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStructuredWebPatch } from './karbandi-structured-patch.js';

const curve = (kind, points, extra = {}) => ({ kind, points, ...extra });
const distance3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

test('complex boundary cells remain covered with every curved boundary vertex preserved', () => {
  const patch = buildStructuredWebPatch([
    curve('support', [{ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }], { supportSide: 'south' }),
    curve('rib-seat', [{ x: 2, y: 0, z: 0 }, { x: 2.3, y: 0.5, z: 0.8 }]),
    curve('rib-seat', [{ x: 2.3, y: 0.5, z: 0.8 }, { x: 1.5, y: 1.1, z: 1.8 }]),
    curve('support', [{ x: 1.5, y: 1.1, z: 1.8 }, { x: 0.7, y: 0.8, z: 1.6 }], { supportSide: 'west' }),
    curve('rib-seat', [{ x: 0.7, y: 0.8, z: 1.6 }, { x: 0, y: 0, z: 0 }]),
  ]);
  assert.ok(patch);
  assert.equal(patch.type, 'boundary-constrained-polygon');
  assert.equal(patch.boundaryFallback, true);
  assert.equal(patch.preservedBoundaryVertexCount, 5);
  assert.equal(patch.boundarySegments.length, 5);
  assert.ok(patch.triangles.length >= 3);
  assert.equal(patch.invertedTriangleCount, 0);
});

test('four rib edges produce inward masonry courses spaced by rib thickness', () => {
  const patch = buildStructuredWebPatch([
    curve('rib-seat', [{ x: 0, y: 0, z: 0 }, { x: 2, y: 0.6, z: 0 }]),
    curve('rib-seat', [{ x: 2, y: 0.6, z: 0 }, { x: 2, y: 1.1, z: 2 }]),
    curve('rib-seat', [{ x: 2, y: 1.1, z: 2 }, { x: 0, y: 0.5, z: 2 }]),
    curve('rib-seat', [{ x: 0, y: 0.5, z: 2 }, { x: 0, y: 0, z: 0 }]),
  ], { resolution: 8, courseWidth: 0.2 });
  assert.equal(patch.type, 'four-edge-inward-courses');
  assert.equal(patch.courseWidth, 0.2);
  assert.ok(patch.courseCount >= 2);
  assert.equal(patch.brickMapping, 'offset-rib-courses');
  assert.equal(patch.masonryUvs.length, patch.vertices.length);
  assert.ok(patch.masonryUvs.some((uv) => Math.abs(uv.v - 0.2) < 1e-9));
  assert.equal(patch.boundarySegments.length, 32);
  assert.equal(patch.invertedTriangleCount, 0);
  assert.ok(patch.normals.every((normal) => normal.y >= 0));
  assert.equal(patch.fourRibRegion, true);
  assert.equal(patch.regionCorners.length, 4);
  assert.equal(patch.regionBoundary.length, 32);
  assert.equal(patch.normalMode, 'best-fit-four-rib-region-90-degree');
  assert.ok(patch.normals.every((normal) => normal.distanceTo(patch.regionNormal) < 1e-12));
});

test('two ribs and a curved wall guide produce a non-folding structured wall region', () => {
  const patch = buildStructuredWebPatch([
    curve('rib-seat', [{ x: 0, y: 0, z: 0 }, { x: 1, y: 1.5, z: 1 }]),
    curve('rib-seat', [{ x: 1, y: 1.5, z: 1 }, { x: 2, y: 0, z: 0 }]),
    curve('support', [{ x: 2, y: 0, z: 0 }, { x: 1, y: 0.25, z: 0 }, { x: 0, y: 0, z: 0 }], { supportSide: 'north' }),
  ], { resolution: 8 });
  assert.equal(patch.type, 'wall-started-bent-infill');
  assert.equal(patch.wallStarted, true);
  assert.equal(patch.invertedTriangleCount, 0);
  assert.equal(patch.boundarySegments.filter((segment) => segment.metadata.kind === 'support').length, 8);
});

test('very small four-edge openings use one simple thickened cap region', () => {
  const patch = buildStructuredWebPatch([
    curve('rib-seat', [{ x: 0, y: 0, z: 0 }, { x: 0.18, y: 0.05, z: 0 }]),
    curve('rib-seat', [{ x: 0.18, y: 0.05, z: 0 }, { x: 0.18, y: 0.08, z: 0.16 }]),
    curve('rib-seat', [{ x: 0.18, y: 0.08, z: 0.16 }, { x: 0, y: 0.03, z: 0.16 }]),
    curve('rib-seat', [{ x: 0, y: 0.03, z: 0.16 }, { x: 0, y: 0, z: 0 }]),
  ], { resolution: 8, courseWidth: 0.1 });
  assert.equal(patch.type, 'small-four-edge-cap');
  assert.equal(patch.smallCellFallback, true);
  assert.equal(patch.courseCount, 0);
  assert.equal(patch.brickMapping, 'offset-rib-courses');
  assert.equal(patch.invertedTriangleCount, 0);
  assert.equal(patch.normalMode, 'best-fit-four-rib-region-90-degree');
  assert.ok(Math.abs(patch.regionNormal.x) > 0.1, 'the tilted region must not extrude in global Y');
  assert.ok(Math.abs(patch.regionNormal.z) > 0.1, 'the tilted region must not extrude in global Y');
  const firstEdge = {
    x: patch.vertices[1].x - patch.vertices[0].x,
    y: patch.vertices[1].y - patch.vertices[0].y,
    z: patch.vertices[1].z - patch.vertices[0].z,
  };
  const normalDotEdge = patch.regionNormal.x * firstEdge.x
    + patch.regionNormal.y * firstEdge.y
    + patch.regionNormal.z * firstEdge.z;
  assert.ok(Math.abs(normalDotEdge) < 1e-7, 'the extrusion normal must be 90 degrees to the selected region');
  assert.ok(patch.normals.every((normal) => normal.distanceTo(patch.regionNormal) < 1e-12));
});

test('only four distinct physical ribs activate the shared inward brick pattern', () => {
  const points = [
    [{ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }],
    [{ x: 2, y: 0, z: 0 }, { x: 2, y: 0, z: 2 }],
    [{ x: 2, y: 0, z: 2 }, { x: 0, y: 0, z: 2 }],
    [{ x: 0, y: 0, z: 2 }, { x: 0, y: 0, z: 0 }],
  ];
  const fourRibs = buildStructuredWebPatch(points.map((edge, index) => (
    curve('rib-seat', edge, { sourceId: `${index}:centerline` })
  )), { courseWidth: 0.1 });
  assert.equal(fourRibs.fourRibRegion, true);
  assert.equal(fourRibs.brickMapping, 'offset-rib-courses');

  const repeatedRib = buildStructuredWebPatch(points.map((edge, index) => (
    curve('rib-seat', edge, { sourceId: `${index % 3}:0` })
  )), { courseWidth: 0.1 });
  assert.notEqual(repeatedRib.fourRibRegion, true);
  assert.equal(repeatedRib.brickMapping, 'world-aligned');
});

test('north crown slices share continuous courses offset from the lower rib envelope', () => {
  const curves = [
    curve('support', [{ x: -2, y: 0, z: 0 }, { x: 0, y: 0.5, z: 0 }, { x: 2, y: 0, z: 0 }], { supportSide: 'north' }),
    curve('rib-seat', [{ x: 2, y: 0, z: 0 }, { x: 0.7, y: 1.1, z: 0.7 }]),
    curve('rib-seat', [{ x: 0.7, y: 1.1, z: 0.7 }, { x: -0.7, y: 1.1, z: 0.7 }]),
    curve('rib-seat', [{ x: -0.7, y: 1.1, z: 0.7 }, { x: -2, y: 0, z: 0 }]),
    curve('rib-seat', [{ x: -2, y: 0, z: 0 }, { x: -2, y: 0, z: 0 }]),
  ];
  const patch = buildStructuredWebPatch(curves, { resolution: 8, courseWidth: 0.2 });
  assert.equal(patch.type, 'north-crown-sliced-inward-courses');
  assert.equal(patch.brickMapping, 'offset-rib-courses');
  assert.equal(patch.masonryUvs.length, patch.vertices.length);
  assert.equal(patch.courseDistanceMode, 'shared-lower-envelope-physical-offset');
  assert.equal(patch.crownSliceCount, 3);
  assert.equal(patch.crownSliceVertexRanges.length, 3);
  assert.ok(patch.masonryUvs.some((uv) => uv.v < 1e-8));
  assert.ok(patch.masonryUvs.some((uv) => uv.v > 0.05));
  // The same position on a hidden radial seam must have the same course V on
  // both neighboring slices, otherwise a visible mortar discontinuity forms.
  const coincidentUvs = new Map();
  patch.vertices.forEach((vertex, index) => {
    const key = `${vertex.x.toFixed(7)}:${vertex.y.toFixed(7)}:${vertex.z.toFixed(7)}`;
    const values = coincidentUvs.get(key) || [];
    values.push(patch.masonryUvs[index].v);
    coincidentUvs.set(key, values);
  });
  coincidentUvs.forEach((values) => {
    assert.ok(Math.max(...values) - Math.min(...values) < 1e-7);
  });
  curves.slice(0, -1).flatMap((entry) => entry.points).forEach((boundaryPoint) => {
    assert.ok(patch.vertices.some((vertex) => distance3(vertex, boundaryPoint) < 1e-7));
  });
  assert.equal(patch.invertedTriangleCount, 0);
});
