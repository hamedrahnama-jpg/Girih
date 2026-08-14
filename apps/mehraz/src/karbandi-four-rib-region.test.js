import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRibCenterlines,
  fourRibCenterlineRegion,
  ribCenteredPerimeterRegion,
} from './karbandi-four-rib-region.js';
import { buildStructuredWebPatch } from './karbandi-structured-patch.js';

const segment = (rib, side, index, a, b) => ({
  sourceId: `${rib}:${side}`,
  ribSegmentIndex: index,
  a,
  b,
});

test('four-rib region follows the four centerline intersections instead of the inset seats', () => {
  const raw = [
    segment(0, 0, 0, { x: -2, y: 0.8, z: -0.1 }, { x: 2, y: 1.2, z: -0.1 }),
    segment(0, 1, 0, { x: -2, y: 0.8, z: 0.1 }, { x: 2, y: 1.2, z: 0.1 }),
    segment(1, 0, 0, { x: 2.1, y: 1.2, z: -2 }, { x: 2.1, y: 1.6, z: 2 }),
    segment(1, 1, 0, { x: 1.9, y: 1.2, z: -2 }, { x: 1.9, y: 1.6, z: 2 }),
    segment(2, 0, 0, { x: 2, y: 1.6, z: 2.1 }, { x: -2, y: 1.2, z: 2.1 }),
    segment(2, 1, 0, { x: 2, y: 1.6, z: 1.9 }, { x: -2, y: 1.2, z: 1.9 }),
    segment(3, 0, 0, { x: -2.1, y: 1.2, z: 2 }, { x: -2.1, y: 0.8, z: -2 }),
    segment(3, 1, 0, { x: -1.9, y: 1.2, z: 2 }, { x: -1.9, y: 0.8, z: -2 }),
  ];
  const seatCurves = [
    { kind: 'rib-seat', sourceId: '0:0', points: [{ x: -1.9, y: 1, z: -0.1 }, { x: 1.9, y: 1, z: -0.1 }] },
    { kind: 'rib-seat', sourceId: '1:1', points: [{ x: 1.9, y: 1, z: -0.1 }, { x: 1.9, y: 1, z: 1.9 }] },
    { kind: 'rib-seat', sourceId: '2:1', points: [{ x: 1.9, y: 1, z: 1.9 }, { x: -1.9, y: 1, z: 1.9 }] },
    { kind: 'rib-seat', sourceId: '3:0', points: [{ x: -1.9, y: 1, z: 1.9 }, { x: -1.9, y: 1, z: -0.1 }] },
  ];

  const region = fourRibCenterlineRegion(seatCurves, buildRibCenterlines(raw));
  assert.ok(region);
  assert.deepEqual(region.map((curve) => [curve.points[0].x, curve.points[0].z]), [
    [-2, 0],
    [2, 0],
    [2, 2],
    [-2, 2],
  ]);
  assert.deepEqual(region.map((curve) => curve.sourceId), [
    '0:centerline', '1:centerline', '2:centerline', '3:centerline',
  ]);
});

test('non-four-rib and repeated-rib faces retain their topology boundaries', () => {
  const curves = Array.from({ length: 4 }, (_, index) => ({
    kind: 'rib-seat',
    sourceId: `${index % 3}:0`,
    points: [{ x: index, y: 0, z: 0 }, { x: index + 1, y: 0, z: 1 }],
  }));
  assert.equal(fourRibCenterlineRegion(curves, new Map()), null);
});

test('a four-rib cell with a split seating-side boundary still uses four centerlines', () => {
  const centerlines = new Map([
    ['0', [{ x: -2, y: 1, z: 0 }, { x: 2, y: 1, z: 0 }]],
    ['1', [{ x: 2, y: 1, z: -2 }, { x: 2, y: 1, z: 2 }]],
    ['2', [{ x: 2, y: 1, z: 2 }, { x: -2, y: 1, z: 2 }]],
    ['3', [{ x: -2, y: 1, z: 2 }, { x: -2, y: 1, z: 0 }]],
  ]);
  const curves = [
    { kind: 'rib-seat', sourceId: '0:0', points: [{ x: -1.9, y: 1, z: 0.1 }, { x: 0, y: 1, z: 0.1 }] },
    { kind: 'rib-seat', sourceId: '0:1', points: [{ x: 0, y: 1, z: 0.1 }, { x: 1.9, y: 1, z: 0.1 }] },
    { kind: 'rib-seat', sourceId: '1:0', points: [{ x: 1.9, y: 1, z: 0.1 }, { x: 1.9, y: 1, z: 1.9 }] },
    { kind: 'rib-seat', sourceId: '2:0', points: [{ x: 1.9, y: 1, z: 1.9 }, { x: -1.9, y: 1, z: 1.9 }] },
    { kind: 'rib-seat', sourceId: '3:0', points: [{ x: -1.9, y: 1, z: 1.9 }, { x: -1.9, y: 1, z: 0.1 }] },
  ];

  const region = fourRibCenterlineRegion(curves, centerlines);
  assert.ok(region);
  assert.equal(region.length, 4);
  assert.deepEqual(region.map((curve) => curve.sourceId), ['0:centerline', '1:centerline', '2:centerline', '3:centerline']);
  assert.deepEqual(region[0].originalSeatSourceIds, ['0:0', '0:1']);
  const patch = buildStructuredWebPatch(region, { resolution: 8, courseWidth: 0.1 });
  assert.equal(patch.normalMode, 'best-fit-four-rib-region-90-degree');
  assert.ok(patch.normals.every((normal) => normal.distanceTo(patch.regionNormal) < 1e-12));
  region.forEach((curve) => {
    const tangent = {
      x: curve.points.at(-1).x - curve.points[0].x,
      y: curve.points.at(-1).y - curve.points[0].y,
      z: curve.points.at(-1).z - curve.points[0].z,
    };
    const dot = tangent.x * patch.regionNormal.x + tangent.y * patch.regionNormal.y + tangent.z * patch.regionNormal.z;
    assert.ok(Math.abs(dot) < 1e-9, 'the recovered roof extrusion must be perpendicular to every planar boundary tangent');
  });
});

test('clipped rib axes extend their terminal segments to the red-polyline corner', () => {
  const centerlines = new Map([
    ['0', [{ x: -2, y: 0, z: 0 }, { x: -0.1, y: 0, z: 0 }]],
    ['1', [{ x: 0, y: 0, z: -2 }, { x: 0, y: 0, z: -0.1 }]],
    ['2', [{ x: 2, y: 0, z: 2 }, { x: 0.1, y: 0, z: 2 }]],
    ['3', [{ x: -2, y: 0, z: 2 }, { x: -2, y: 0, z: 0.1 }]],
  ]);
  const curves = [
    { kind: 'rib-seat', sourceId: '0:0', points: [{ x: -2, y: 0, z: 0.1 }, { x: -0.1, y: 0, z: 0.1 }] },
    { kind: 'rib-seat', sourceId: '1:0', points: [{ x: -0.1, y: 0, z: 0.1 }, { x: 0.1, y: 0, z: 1.9 }] },
    { kind: 'rib-seat', sourceId: '2:0', points: [{ x: 0.1, y: 0, z: 1.9 }, { x: -1.9, y: 0, z: 1.9 }] },
    { kind: 'rib-seat', sourceId: '3:0', points: [{ x: -1.9, y: 0, z: 1.9 }, { x: -2, y: 0, z: 0.1 }] },
  ];
  const region = fourRibCenterlineRegion(curves, centerlines);
  assert.ok(region);
  assert.ok(Math.hypot(region[1].points[0].x, region[1].points[0].z) < 1e-12);
});

test('a remote lower rib-axis intersection stays anchored to the vertical wall top', () => {
  const centerlines = new Map([
    ['0', [{ x: -2, y: 2, z: 0 }, { x: -0.2, y: 2, z: 0 }]],
    ['1', [{ x: 0, y: 2, z: -2 }, { x: 0, y: 2, z: -0.2 }]],
    ['2', [{ x: 2, y: 3, z: 2 }, { x: 0.2, y: 3, z: 2 }]],
    ['3', [{ x: -2, y: 3, z: 2 }, { x: -2, y: 3, z: 0.2 }]],
  ]);
  const wallCorner = { x: -0.2, y: 2.4, z: -0.18 };
  const curves = [
    { kind: 'rib-seat', sourceId: '0:0', points: [wallCorner, { x: 0, y: 2, z: -0.2 }] },
    { kind: 'rib-seat', sourceId: '1:0', points: [{ x: 0, y: 2, z: -0.2 }, { x: 0.2, y: 3, z: 2 }] },
    { kind: 'rib-seat', sourceId: '2:0', points: [{ x: 0.2, y: 3, z: 2 }, { x: -2, y: 3, z: 2 }] },
    { kind: 'rib-seat', sourceId: '3:0', points: [{ x: -2, y: 3, z: 2 }, wallCorner] },
  ];
  const region = fourRibCenterlineRegion(curves, centerlines, {
    wallTopY: 2,
    wallBoundaryTolerance: 0.05,
    wallBoundaries: [{ axis: 'z', value: -0.2, height: 2 }],
  });
  assert.ok(region);
  assert.deepEqual(region[0].points[0], { x: -0.2, y: 2, z: -0.2 });
  assert.equal(region[0].wallTopAnchoredStart, true);
  const shortRegion = fourRibCenterlineRegion(curves, centerlines, {
    wallTopY: 2,
    wallBoundaryTolerance: 0.05,
    wallBoundaries: [{ axis: 'z', value: -0.2, height: 2 }],
    anchorWallBoundary: false,
  });
  assert.ok(shortRegion);
  assert.equal(shortRegion[0].wallTopAnchoredStart, false);
  assert.notDeepEqual(shortRegion[0].points[0], { x: -0.2, y: 2, z: -0.2 });
});

test('perimeter roof keeps its wall support but moves rib sides to their centerlines', () => {
  const centerlines = new Map([
    ['0', [{ x: 0, y: 1, z: 0 }, { x: 1, y: 2, z: 1 }]],
    ['1', [{ x: 2, y: 1, z: 0 }, { x: 1, y: 2, z: 1 }]],
  ]);
  const curves = [
    { kind: 'rib-seat', sourceId: '0:0', points: [{ x: 0.1, y: 1, z: 0 }, { x: 1, y: 2, z: 0.9 }] },
    { kind: 'rib-seat', sourceId: '1:1', points: [{ x: 1, y: 2, z: 0.9 }, { x: 1.9, y: 1, z: 0 }] },
    { kind: 'support', supportSide: 'north', points: [{ x: 1.9, y: 1, z: 0 }, { x: 0.1, y: 1, z: 0 }] },
  ];
  const region = ribCenteredPerimeterRegion(curves, centerlines);
  assert.ok(region);
  assert.deepEqual(region[0].points[0], { x: 0, y: 1, z: 0 });
  assert.deepEqual(region[1].points.at(-1), { x: 2, y: 1, z: 0 });
  assert.equal(region[0].sourceId, '0:centerline');
  assert.equal(region[1].sourceId, '1:centerline');
  assert.equal(region[2].kind, 'support');
  assert.equal(region[2].supportSide, 'north');
});
