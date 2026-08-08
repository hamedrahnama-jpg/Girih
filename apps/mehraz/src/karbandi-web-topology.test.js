import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bearingVectorForSupportSides,
  buildRibBandQuads,
  buildWebTopology,
  deriveRibSeatingCurves,
  extractSpringingBoundary,
  isRibBandFace,
  pointInsideRibBands,
  polygonMostlyInsideRibBands,
  normalizeKarbandiWebOptions,
} from './karbandi-web-topology.js';

const point = (x, z, y = 3) => ({ x, y, z });
const segment = (a, b, kind = 'rib-seat', extra = {}) => ({ a, b, kind, ...extra });
const squareLayout = (heights = { north: 3, east: 3, south: 3, west: 3 }) => ({
  westX: 0,
  eastX: 10,
  northZ: 0,
  southZ: 10,
  sideTop: 3,
  wallThickness: 1,
  wallHeights: heights,
});

function squareBoundary(options = {}, openSides = []) {
  return extractSpringingBoundary(squareLayout(), options, openSides).segments;
}

test('square wall loop accepts ribs whose finite-width feet terminate at wall corners', () => {
  const seats = deriveRibSeatingCurves([point(0, 0), point(5, 5, 6), point(10, 10)], 0.4);
  assert.notDeepEqual(seats.left[0], seats.right[0]);
  const topology = buildWebTopology([
    ...squareBoundary(),
    ...seats.left.slice(1).map((end, index) => segment(seats.left[index], end, 'rib-seat', { sourceId: 'left' })),
    ...seats.right.slice(1).map((end, index) => segment(seats.right[index], end, 'rib-seat', { sourceId: 'right' })),
  ]);
  assert.ok(topology.faces.length > 0);
  assert.equal(topology.unsupportedEdges.length, 0);
});

test('wall-top segments close perimeter cells without a rib-only cycle', () => {
  const topology = buildWebTopology([
    ...squareBoundary(),
    segment(point(3, 0), point(5, 5, 6), 'rib-seat', { sourceId: 'a' }),
    segment(point(5, 5, 6), point(7, 0), 'rib-seat', { sourceId: 'b' }),
  ]);
  assert.ok(topology.faces.some((face) => face.classification === 'EdgePerimeterCell'));
});

test('three-sided edge cell is classified and keeps one support edge', () => {
  const topology = buildWebTopology([
    segment(point(0, 0), point(10, 0), 'support', { supportSide: 'north' }),
    segment(point(10, 0), point(5, 5, 7), 'rib-seat', { sourceId: 'right' }),
    segment(point(5, 5, 7), point(0, 0), 'rib-seat', { sourceId: 'left' }),
  ]);
  assert.equal(topology.faces.length, 1);
  assert.equal(topology.faces[0].classification, 'EdgePerimeterCell');
  assert.equal(topology.faces[0].supportEdges.length, 1);
});

test('corner cell touching two wall segments is an irregular corner perimeter cell', () => {
  const topology = buildWebTopology([
    segment(point(0, 0), point(5, 0), 'support', { supportSide: 'north' }),
    segment(point(5, 0), point(5, 5), 'support', { supportSide: 'east' }),
    segment(point(5, 5), point(0, 0, 6), 'rib-seat', { sourceId: 'corner-rib' }),
  ]);
  assert.equal(topology.faces[0].classification, 'CornerPerimeterCell');
  assert.deepEqual(new Set(topology.faces[0].supportSides), new Set(['north', 'east']));
});

test('several rib centrelines at one corner retain distinct finite-width seating endpoints', () => {
  const first = deriveRibSeatingCurves([point(0, 0), point(5, 2, 6)], 0.3);
  const second = deriveRibSeatingCurves([point(0, 0), point(2, 5, 6)], 0.3);
  const endpoints = [first.left[0], first.right[0], second.left[0], second.right[0]];
  assert.ok(new Set(endpoints.map((entry) => `${entry.x.toFixed(4)}:${entry.z.toFixed(4)}`)).size >= 3);
});

for (const [label, footZ] of [['outside', -0.001], ['inside', 0.001]]) {
  test(`rib feet slightly ${label} snapping tolerance close against springing support`, () => {
    const topology = buildWebTopology([
      segment(point(0, 0), point(10, 0), 'support', { supportSide: 'north' }),
      segment(point(10, footZ), point(5, 5, 7), 'rib-seat', { sourceId: 'right' }),
      segment(point(5, 5, 7), point(0, footZ), 'rib-seat', { sourceId: 'left' }),
    ], {}, { snapTolerance: 0.0025 });
    assert.equal(topology.faces.length, 1);
    assert.equal(topology.unsupportedEdges.length, 0);
  });
}

test('unequal wall tops remain piecewise 3D instead of being flattened', () => {
  const boundary = extractSpringingBoundary(squareLayout({ north: 3, east: 4, south: 5, west: 6 }));
  assert.deepEqual(boundary.segments.map((entry) => entry.a.y), [3, 4, 5, 6]);
  assert.equal(new Set(boundary.segments.flatMap((entry) => [entry.a.y, entry.b.y])).size, 4);
});

test('wall loop with an unavailable wall reports a discontinuous support boundary', () => {
  const boundary = extractSpringingBoundary(squareLayout(), {}, ['south']);
  assert.equal(boundary.continuous, false);
  assert.deepEqual(boundary.missingSides, ['south']);
});

test('intentional central opening remains unfilled', () => {
  const dividers = [3, 7].flatMap((coordinate) => [
    segment(point(coordinate, 0), point(coordinate, 10), 'rib-seat', { sourceId: `v${coordinate}` }),
    segment(point(0, coordinate), point(10, coordinate), 'rib-seat', { sourceId: `h${coordinate}` }),
  ]);
  const opening = [[point(3.1, 3.1), point(6.9, 3.1), point(6.9, 6.9), point(3.1, 6.9)]];
  const topology = buildWebTopology([...squareBoundary(), ...dividers], { intentionalOpenings: opening });
  assert.equal(topology.intentionalOpenings.length, 1);
  assert.ok(!topology.faces.some((face) => face.centroid.x === 5 && face.centroid.z === 5));
});

test('missing wall support produces the required unsupported-edge warning', () => {
  const topology = buildWebTopology([
    ...squareBoundary({}, ['south']),
    segment(point(5, 5), point(5, 10), 'rib-seat', { sourceId: 'dangling' }),
  ]);
  assert.ok(topology.unsupportedEdges.length > 0);
  assert.equal(topology.warning, 'This cell has an unsupported perimeter edge. Select a wall, edge arch, beam, or springing boundary.');
});

test('soffit termination defaults to the inner wall-top edge and supports wall centre', () => {
  const inner = extractSpringingBoundary(squareLayout()).segments;
  const centre = extractSpringingBoundary(squareLayout(), { soffitTermination: 'wall-centre' }).segments;
  assert.equal(inner.find((entry) => entry.supportSide === 'west').a.x, 0);
  assert.equal(centre.find((entry) => entry.supportSide === 'west').a.x, -0.5);
});

test('roof thickness and bearing remain independent from embed tolerance', () => {
  const options = normalizeKarbandiWebOptions({
    roofThickness: 0.18,
    wallBearingDepth: 0.2,
    wallEmbedTolerance: 0.006,
    infillBrickColor: '#aa6633',
    infillBrickColor2: '#774422',
    infillBrickHeight: 0.075,
  });
  assert.equal(options.roofThickness, 0.18);
  assert.equal(options.wallBearingDepth, 0.2);
  assert.equal(options.wallEmbedTolerance, 0.006);
  assert.equal(options.infillBrickColor, '#aa6633');
  assert.equal(options.infillBrickColor2, '#774422');
  assert.equal(options.infillBrickHeight, 0.075);
  assert.deepEqual(bearingVectorForSupportSides(['west', 'north'], 0.206), { x: -0.206, z: -0.206 });
});

test('saved web options normalize on load and wall-height regeneration changes springing geometry', () => {
  const saved = normalizeKarbandiWebOptions({ supportBoundaryMode: 'selected-walls', selectedWallSides: ['east'], springingTangent: 'custom-angle', springingAngle: 32 });
  assert.equal(saved.springingAngle, 32);
  assert.deepEqual(saved.selectedWallSides, ['east']);
  const before = extractSpringingBoundary(squareLayout()).segments;
  const after = extractSpringingBoundary(squareLayout({ north: 3, east: 5, south: 3, west: 3 })).segments;
  assert.notEqual(before.find((entry) => entry.supportSide === 'east').a.y, after.find((entry) => entry.supportSide === 'east').a.y);
});

test('rib width/profile regeneration updates seating curves without collapsing feet', () => {
  const centerline = [point(0, 0), point(5, 5, 7)];
  const narrow = deriveRibSeatingCurves(centerline, 0.1);
  const wide = deriveRibSeatingCurves(centerline, 0.5);
  const narrowGap = Math.hypot(narrow.left[0].x - narrow.right[0].x, narrow.left[0].z - narrow.right[0].z);
  const wideGap = Math.hypot(wide.left[0].x - wide.right[0].x, wide.left[0].z - wide.right[0].z);
  assert.ok(wideGap > narrowGap);
  assert.ok(wideGap > 0);
});

test('roof panelization excludes cells spanning both seating sides of one rib', () => {
  assert.equal(isRibBandFace({ boundaryEdges: [
    { kind: 'rib-seat', sourceId: '4:0' },
    { kind: 'rib-seat', sourceId: '7:1' },
  ] }), false);
  assert.equal(isRibBandFace({ boundaryEdges: [
    { kind: 'rib-seat', sourceId: '4:0' },
    { kind: 'rib-seat', sourceId: '4:1' },
    { kind: 'rib-seat', sourceId: '7:0' },
  ] }), true);
});

test('rib-band rejection uses physical area instead of boundary references alone', () => {
  const quads = buildRibBandQuads([
    segment(point(0, 0), point(10, 0), 'rib-seat', { sourceId: '4:0', ribSegmentIndex: 3 }),
    segment(point(0, 1), point(10, 1), 'rib-seat', { sourceId: '4:1', ribSegmentIndex: 3 }),
  ]);
  assert.equal(quads.length, 1);
  assert.equal(pointInsideRibBands({ x: 5, z: 0.5 }, quads), true);
  // A small valid web may reference both seating sides elsewhere in its loop,
  // but its centroid outside the actual band must remain fillable.
  assert.equal(pointInsideRibBands({ x: 5, z: 1.5 }, quads), false);

  // A small valid cell may have one interior sample touching the band, but it
  // must not be discarded unless the band occupies most of the polygon.
  assert.equal(polygonMostlyInsideRibBands([
    { x: 4.9, z: 0.45 },
    { x: 5.1, z: 0.45 },
    { x: 5.8, z: 1.8 },
    { x: 4.2, z: 1.8 },
  ], quads), false);
  assert.equal(polygonMostlyInsideRibBands([
    { x: 4.5, z: 0.2 },
    { x: 5.5, z: 0.2 },
    { x: 5.5, z: 0.8 },
    { x: 4.5, z: 0.8 },
  ], quads), true);
});

test('dangling guide branches are pruned before perimeter face extraction', () => {
  const topology = buildWebTopology([
    ...squareBoundary(),
    segment(point(0, 0), point(2, 2, 5), 'guide'),
  ]);
  assert.equal(topology.faces.length, 1);
  assert.equal(topology.faces[0].ids.length, 4);
  assert.equal(new Set(topology.faces[0].ids).size, topology.faces[0].ids.length);
});
