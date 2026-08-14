export const SUPPORT_BOUNDARY_MODES = Object.freeze([
  'automatic-walls',
  'selected-walls',
  'existing-curve',
  'manual',
]);

export const SOFFIT_TERMINATIONS = Object.freeze(['inner-edge', 'wall-centre', 'custom-offset']);
export const SPRINGING_TANGENTS = Object.freeze(['infer', 'average', 'custom-angle', 'position-only']);
export const CORNER_SEAT_MODES = Object.freeze(['rib-profile', 'chamfer', 'radius', 'custom-curve']);

const EPSILON = 1e-7;

const clonePoint = (point) => ({ x: Number(point.x), y: Number(point.y), z: Number(point.z) });
const lerpPoint = (a, b, t) => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  z: a.z + (b.z - a.z) * t,
});

export function normalizeKarbandiWebOptions(value = {}) {
  const supportBoundaryMode = SUPPORT_BOUNDARY_MODES.includes(value.supportBoundaryMode)
    ? value.supportBoundaryMode
    : 'automatic-walls';
  const soffitTermination = SOFFIT_TERMINATIONS.includes(value.soffitTermination)
    ? value.soffitTermination
    : 'inner-edge';
  const springingTangent = SPRINGING_TANGENTS.includes(value.springingTangent)
    ? value.springingTangent
    : 'infer';
  const cornerSeatMode = CORNER_SEAT_MODES.includes(value.cornerSeatMode)
    ? value.cornerSeatMode
    : 'rib-profile';
  const number = (input, fallback, minimum, maximum) => {
    const parsed = Number(input);
    return Math.max(minimum, Math.min(maximum, Number.isFinite(parsed) ? parsed : fallback));
  };
  const points = (input) => Array.isArray(input)
    ? input.filter((point) => point && [point.x, point.y, point.z].every(Number.isFinite)).map(clonePoint)
    : [];
  const brickColor = typeof value.infillBrickColor === 'string' && /^#[0-9a-f]{6}$/i.test(value.infillBrickColor)
    ? value.infillBrickColor
    : '#e5d41f';
  const brickColor2 = typeof value.infillBrickColor2 === 'string' && /^#[0-9a-f]{6}$/i.test(value.infillBrickColor2)
    ? value.infillBrickColor2
    : '#9f663b';
  return {
    supportBoundaryMode,
    selectedWallSides: ['north', 'east', 'south', 'west'].filter((side) => value.selectedWallSides?.includes(side)),
    existingSpringingCurve: points(value.existingSpringingCurve),
    manualSpringingBoundary: points(value.manualSpringingBoundary),
    soffitTermination,
    soffitCustomOffset: number(value.soffitCustomOffset, 0, -5, 5),
    springingTangent,
    springingAngle: number(value.springingAngle, 45, -89, 89),
    roofThickness: 0.05,
    infillBrickColor: brickColor,
    infillBrickColor2: brickColor2,
    infillBrickHeight: number(value.infillBrickHeight, 0.06, 0.01, 0.5),
    wallBearingDepth: number(value.wallBearingDepth, 0, 0, 5),
    wallEmbedTolerance: number(value.wallEmbedTolerance, 0, 0, 0.1),
    ribEmbedTolerance: number(value.ribEmbedTolerance, 0, 0, 0.1),
    seatingOffset: number(value.seatingOffset, 0, -1, 1),
    southWestGuideBlend: number(value.southWestGuideBlend, 0.5, 0, 1),
    southEastGuideBlend: number(value.southEastGuideBlend, 0.5, 0, 1),
    cornerSeatMode,
    cornerRadius: number(value.cornerRadius, 0.08, 0.001, 2),
    customCornerCurve: points(value.customCornerCurve),
    allowUnsupportedFreeEdge: value.allowUnsupportedFreeEdge === true,
    planarFallback: value.planarFallback === true,
    intentionalOpenings: Array.isArray(value.intentionalOpenings)
      ? value.intentionalOpenings.map(points).filter((loop) => loop.length >= 3)
      : [],
  };
}

function terminationOffset(options, wallThickness) {
  if (options.soffitTermination === 'wall-centre') return wallThickness / 2;
  if (options.soffitTermination === 'custom-offset') return options.soffitCustomOffset;
  return 0;
}

function polylineSegments(points, closed, properties = {}) {
  const result = [];
  const count = closed ? points.length : points.length - 1;
  for (let index = 0; index < count; index += 1) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    if (!a || !b || ((a.x - b.x) ** 2 + (a.z - b.z) ** 2) < EPSILON) continue;
    result.push({ a: clonePoint(a), b: clonePoint(b), kind: 'support', ...properties });
  }
  return result;
}

/** Extracts room-facing wall-head edges from parametric wall data. */
export function extractSpringingBoundary(layout, rawOptions = {}, openSides = []) {
  const options = normalizeKarbandiWebOptions(rawOptions);
  const selected = options.supportBoundaryMode === 'selected-walls'
    ? new Set(options.selectedWallSides)
    : new Set(['north', 'east', 'south', 'west']);
  const unavailable = new Set(openSides);
  if (options.supportBoundaryMode === 'existing-curve' || options.supportBoundaryMode === 'manual') {
    const points = options.supportBoundaryMode === 'existing-curve'
      ? options.existingSpringingCurve
      : options.manualSpringingBoundary;
    return {
      segments: polylineSegments(points, points.length > 2, { source: options.supportBoundaryMode }),
      continuous: points.length > 2,
      missingSides: points.length > 2 ? [] : ['custom-boundary'],
    };
  }

  const offset = terminationOffset(options, Number(layout.wallThickness) || 0);
  const west = layout.westX - offset;
  const east = layout.eastX + offset;
  const north = layout.northZ - offset;
  const south = layout.southZ + offset;
  const heights = {
    north: Number(layout.wallHeights?.north ?? layout.sideTop),
    east: Number(layout.wallHeights?.east ?? layout.sideTop),
    south: Number(layout.wallHeights?.south ?? layout.sideTop),
    west: Number(layout.wallHeights?.west ?? layout.sideTop),
  };
  const corners = {
    nw: { x: west, y: Math.max(heights.north, heights.west), z: north },
    ne: { x: east, y: Math.max(heights.north, heights.east), z: north },
    se: { x: east, y: Math.max(heights.south, heights.east), z: south },
    sw: { x: west, y: Math.max(heights.south, heights.west), z: south },
  };
  const definitions = [
    ['north', corners.nw, corners.ne, heights.north],
    ['east', corners.ne, corners.se, heights.east],
    ['south', corners.se, corners.sw, heights.south],
    ['west', corners.sw, corners.nw, heights.west],
  ];
  const segments = [];
  const missingSides = [];
  const allWallSidesAvailable = definitions.every(([side]) => selected.has(side) && !unavailable.has(side));
  const cornerInset = Math.min(options.cornerRadius, Math.abs(east - west) / 4, Math.abs(south - north) / 4);
  const trimmedDefinitions = allWallSidesAvailable && ['chamfer', 'radius'].includes(options.cornerSeatMode)
    ? [
      ['north', { x: west + cornerInset, y: heights.north, z: north }, { x: east - cornerInset, y: heights.north, z: north }, heights.north],
      ['east', { x: east, y: heights.east, z: north + cornerInset }, { x: east, y: heights.east, z: south - cornerInset }, heights.east],
      ['south', { x: east - cornerInset, y: heights.south, z: south }, { x: west + cornerInset, y: heights.south, z: south }, heights.south],
      ['west', { x: west, y: heights.west, z: south - cornerInset }, { x: west, y: heights.west, z: north + cornerInset }, heights.west],
    ]
    : definitions;
  trimmedDefinitions.forEach(([side, start, end, height]) => {
    if (!selected.has(side) || unavailable.has(side)) {
      missingSides.push(side);
      return;
    }
    // Vertical corner transitions retain unequal wall elevations without
    // flattening either wall head. In plan they share the corner node.
    segments.push({
      a: { ...start, y: height },
      b: { ...end, y: height },
      kind: 'support',
      source: 'wall-topology',
      supportSide: side,
    });
  });
  if (allWallSidesAvailable && ['chamfer', 'radius'].includes(options.cornerSeatMode)) {
    const bySide = Object.fromEntries(trimmedDefinitions.map(([side, start, end]) => [side, { start, end }]));
    const cornerPairs = [
      ['north', 'east', bySide.north.end, bySide.east.start, { x: east, z: north }],
      ['east', 'south', bySide.east.end, bySide.south.start, { x: east, z: south }],
      ['south', 'west', bySide.south.end, bySide.west.start, { x: west, z: south }],
      ['west', 'north', bySide.west.end, bySide.north.start, { x: west, z: north }],
    ];
    cornerPairs.forEach(([fromSide, toSide, start, end, corner]) => {
      const curve = options.cornerSeatMode === 'chamfer'
        ? [start, end]
        : Array.from({ length: 5 }, (_, index) => {
          const t = index / 4;
          // Quadratic corner interpolation retains the configured wall corner
          // as the radius control while preserving unequal endpoint heights.
          const oneMinus = 1 - t;
          return {
            x: oneMinus * oneMinus * start.x + 2 * oneMinus * t * corner.x + t * t * end.x,
            y: start.y + (end.y - start.y) * t,
            z: oneMinus * oneMinus * start.z + 2 * oneMinus * t * corner.z + t * t * end.z,
          };
        });
      segments.push(...polylineSegments(curve, false, { source: `corner-${options.cornerSeatMode}`, supportSides: [fromSide, toSide] }));
    });
  }
  if (options.cornerSeatMode === 'custom-curve' && options.customCornerCurve.length >= 2) {
    segments.push(...polylineSegments(options.customCornerCurve, false, { source: 'custom-corner', supportSide: 'custom-corner' }));
  }
  return { segments, continuous: missingSides.length === 0, missingSides, corners };
}

/** Fallback seating derivation for ribs without B-Rep/profile side edges. */
export function deriveRibSeatingCurves(centerline, ribWidth, seatingOffset = 0) {
  const points = Array.isArray(centerline) ? centerline.map(clonePoint) : [];
  const distance = Math.max(0, Number(ribWidth) / 2 + Number(seatingOffset || 0));
  const sides = [-1, 1].map((side) => points.map((point, index) => {
    const previous = points[Math.max(0, index - 1)] || point;
    const next = points[Math.min(points.length - 1, index + 1)] || point;
    const dx = next.x - previous.x;
    const dz = next.z - previous.z;
    const length = Math.hypot(dx, dz) || 1;
    return { x: point.x - side * (dz / length) * distance, y: point.y, z: point.z + side * (dx / length) * distance };
  }));
  return { left: sides[0], right: sides[1] };
}

function crossing(first, second, tolerance) {
  const rx = first.b.x - first.a.x;
  const rz = first.b.z - first.a.z;
  const sx = second.b.x - second.a.x;
  const sz = second.b.z - second.a.z;
  const denominator = rx * sz - rz * sx;
  if (Math.abs(denominator) < EPSILON) return null;
  const qx = second.a.x - first.a.x;
  const qz = second.a.z - first.a.z;
  const t = (qx * sz - qz * sx) / denominator;
  const u = (qx * rz - qz * rx) / denominator;
  if (t < -tolerance || t > 1 + tolerance || u < -tolerance || u > 1 + tolerance) return null;
  return { t: Math.max(0, Math.min(1, t)), u: Math.max(0, Math.min(1, u)) };
}

function signedArea(ids, nodes) {
  return ids.reduce((sum, id, index) => {
    const a = nodes[id];
    const b = nodes[ids[(index + 1) % ids.length]];
    return sum + a.x * b.z - b.x * a.z;
  }, 0) / 2;
}

function polygonContains(point, loop) {
  let inside = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i, i += 1) {
    const a = loop[i];
    const b = loop[j];
    if (((a.z > point.z) !== (b.z > point.z))
      && point.x < ((b.x - a.x) * (point.z - a.z)) / ((b.z - a.z) || EPSILON) + a.x) inside = !inside;
  }
  return inside;
}

function convexHull(points) {
  const sorted = [...new Map(points.map((entry) => [`${entry.x}:${entry.z}`, entry])).values()]
    .sort((a, b) => a.x - b.x || a.z - b.z);
  if (sorted.length <= 3) return sorted;
  const cross = (origin, a, b) => (a.x - origin.x) * (b.z - origin.z) - (a.z - origin.z) * (b.x - origin.x);
  const half = (input) => {
    const result = [];
    input.forEach((entry) => {
      while (result.length >= 2 && cross(result[result.length - 2], result[result.length - 1], entry) <= 0) result.pop();
      result.push(entry);
    });
    return result;
  };
  return [...half(sorted).slice(0, -1), ...half([...sorted].reverse()).slice(0, -1)];
}

/** Builds bounded faces from rib seats and structural support curves in room UV (XZ). */
export function buildWebTopology(inputSegments, rawOptions = {}, config = {}) {
  const options = normalizeKarbandiWebOptions(rawOptions);
  const tolerance = Math.max(1e-6, Number(config.snapTolerance) || 0.0025);
  const segments = inputSegments
    .filter((segment) => segment?.a && segment?.b)
    .map((segment, index) => ({ ...segment, id: segment.id ?? index, a: clonePoint(segment.a), b: clonePoint(segment.b), splits: [0, 1] }));
  const supports = segments.filter((segment) => segment.kind === 'support');
  const snapEndpoint = (point) => {
    let nearest = null;
    supports.forEach((support) => {
      const dx = support.b.x - support.a.x;
      const dz = support.b.z - support.a.z;
      const denominator = dx * dx + dz * dz;
      if (denominator < EPSILON) return;
      const t = Math.max(0, Math.min(1, ((point.x - support.a.x) * dx + (point.z - support.a.z) * dz) / denominator));
      const projected = lerpPoint(support.a, support.b, t);
      const distance = Math.hypot(projected.x - point.x, projected.z - point.z);
      if (distance <= tolerance && (!nearest || distance < nearest.distance)) nearest = { ...projected, distance };
    });
    return nearest ? { x: nearest.x, y: nearest.y, z: nearest.z } : point;
  };
  segments.forEach((segment) => {
    if (segment.kind === 'support') return;
    segment.a = snapEndpoint(segment.a);
    segment.b = snapEndpoint(segment.b);
  });
  // Trim profile-derived seats at their first wall-head crossing. Offset rib
  // edges commonly begin just outside a corner even though the centreline foot
  // is exactly at that corner; retaining the exterior tail creates a false
  // unsupported edge.
  const supportLoop = supports.some((support) => support.supportSide || support.supportSides?.length)
    ? convexHull(supports.flatMap((support) => [support.a, support.b]))
    : supports.map((support) => support.a);
  if (supportLoop.length >= 3) segments.forEach((segment) => {
    if (segment.kind !== 'rib-seat') return;
    const hits = supports.map((support) => crossing(segment, support, tolerance)).filter(Boolean);
    if (!hits.length) return;
    const originalA = segment.a;
    const originalB = segment.b;
    if (!polygonContains(segment.a, supportLoop)) {
      const first = hits.reduce((nearest, hit) => (hit.t < nearest.t ? hit : nearest));
      segment.a = lerpPoint(originalA, originalB, first.t);
    }
    if (!polygonContains(segment.b, supportLoop)) {
      const last = hits.reduce((nearest, hit) => (hit.t > nearest.t ? hit : nearest));
      segment.b = lerpPoint(originalA, originalB, last.t);
    }
  });
  for (let first = 0; first < segments.length; first += 1) {
    for (let second = first + 1; second < segments.length; second += 1) {
      const hit = crossing(segments[first], segments[second], tolerance);
      if (!hit) continue;
      segments[first].splits.push(hit.t);
      segments[second].splits.push(hit.u);
    }
  }

  const nodes = [];
  const nodeFor = (point) => {
    const existing = nodes.findIndex((node) => Math.hypot(node.x - point.x, node.z - point.z) <= tolerance);
    if (existing >= 0) {
      // Prefer the structural wall elevation at support intersections.
      if (point.kind === 'support') nodes[existing].y = point.y;
      else nodes[existing].y = Math.max(nodes[existing].y, point.y);
      return existing;
    }
    nodes.push({ ...clonePoint(point), neighbors: new Set() });
    return nodes.length - 1;
  };
  const edges = new Map();
  segments.forEach((segment) => {
    const values = [...new Set(segment.splits.map((value) => Math.round(value * 1e8) / 1e8))].sort((a, b) => a - b);
    for (let index = 0; index < values.length - 1; index += 1) {
      const aPoint = { ...lerpPoint(segment.a, segment.b, values[index]), kind: segment.kind };
      const bPoint = { ...lerpPoint(segment.a, segment.b, values[index + 1]), kind: segment.kind };
      const a = nodeFor(aPoint);
      const b = nodeFor(bPoint);
      if (a === b) continue;
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      const previous = edges.get(key);
      const edge = previous?.kind === 'support' ? previous : { a, b, kind: segment.kind || 'rib-seat', supportSide: segment.supportSide, supportSides: segment.supportSides, sourceId: segment.sourceId };
      edges.set(key, edge);
      nodes[a].neighbors.add(b);
      nodes[b].neighbors.add(a);
    }
  });
  // Record unsupported endpoints before cleaning the face graph. A dangling
  // rib/guide is useful diagnostic information but cannot bound masonry; if it
  // remains in the half-edge walk it appears as an A-B-C-B-A spur and creates
  // self-touching corner contours (notably at the two north-wall cells).
  const unsupportedEdges = [];
  nodes.forEach((node, id) => {
    if (node.neighbors.size !== 1) return;
    const neighbor = [...node.neighbors][0];
    const edge = edges.get(id < neighbor ? `${id}:${neighbor}` : `${neighbor}:${id}`);
    if (edge?.kind !== 'support') unsupportedEdges.push({ node: id, edge });
  });
  const pruneQueue = nodes.map((node, id) => ({ node, id }))
    .filter(({ node, id }) => {
      if (node.neighbors.size !== 1) return false;
      const neighbor = [...node.neighbors][0];
      const edge = edges.get(id < neighbor ? `${id}:${neighbor}` : `${neighbor}:${id}`);
      return edge?.kind !== 'support' && edge?.kind !== 'unsupported';
    })
    .map(({ id }) => id);
  for (let queueIndex = 0; queueIndex < pruneQueue.length; queueIndex += 1) {
    const id = pruneQueue[queueIndex];
    const node = nodes[id];
    if (node.neighbors.size !== 1) continue;
    const neighbor = [...node.neighbors][0];
    const key = id < neighbor ? `${id}:${neighbor}` : `${neighbor}:${id}`;
    const edge = edges.get(key);
    if (edge?.kind === 'support' || edge?.kind === 'unsupported') continue;
    node.neighbors.delete(neighbor);
    nodes[neighbor].neighbors.delete(id);
    edges.delete(key);
    if (nodes[neighbor].neighbors.size === 1) pruneQueue.push(neighbor);
  }
  nodes.forEach((node) => {
    node.sortedNeighbors = [...node.neighbors].sort((a, b) => (
      Math.atan2(nodes[a].z - node.z, nodes[a].x - node.x)
      - Math.atan2(nodes[b].z - node.z, nodes[b].x - node.x)
    ));
  });

  const visited = new Set();
  const faces = [];
  nodes.forEach((node, start) => node.sortedNeighbors.forEach((next) => {
    const initial = `${start}:${next}`;
    if (visited.has(initial)) return;
    const ids = [];
    let from = start;
    let to = next;
    for (let guard = 0; guard < edges.size * 2 + 8; guard += 1) {
      const half = `${from}:${to}`;
      if (visited.has(half)) break;
      visited.add(half);
      ids.push(from);
      const neighbors = nodes[to].sortedNeighbors;
      const incoming = neighbors.indexOf(from);
      if (incoming < 0) break;
      const following = neighbors[(incoming - 1 + neighbors.length) % neighbors.length];
      from = to;
      to = following;
      if (from === start && to === next) break;
    }
    if (ids.length < 3 || from !== start || to !== next) return;
    const area = signedArea(ids, nodes);
    if (area <= Math.max(EPSILON, Number(config.minimumArea) || 0.00001)) return; // exterior is clockwise
    const centroid = ids.reduce((result, id) => ({ x: result.x + nodes[id].x / ids.length, z: result.z + nodes[id].z / ids.length }), { x: 0, z: 0 });
    const boundaryEdges = ids.map((id, index) => {
      const other = ids[(index + 1) % ids.length];
      return edges.get(id < other ? `${id}:${other}` : `${other}:${id}`);
    });
    const supportEdges = boundaryEdges.filter((edge) => edge?.kind === 'support');
    const freeEdges = boundaryEdges.filter((edge) => edge?.kind === 'unsupported');
    const supportSides = new Set(supportEdges.flatMap((edge) => edge.supportSides || (edge.supportSide ? [edge.supportSide] : [])));
    const intentional = options.intentionalOpenings.some((loop) => polygonContains(centroid, loop));
    let classification = 'InteriorCell';
    if (intentional) classification = 'IntentionalOpening';
    else if (freeEdges.length) classification = 'UnsupportedCell';
    else if (supportEdges.length && supportSides.size >= 2) classification = 'CornerPerimeterCell';
    else if (supportEdges.length) classification = 'EdgePerimeterCell';
    faces.push({ ids, area, centroid, boundaryEdges, supportEdges, freeEdges, supportSides: [...supportSides], classification });
  }));

  return {
    nodes,
    edges: [...edges.values()],
    faces: faces.filter((face) => face.classification !== 'IntentionalOpening'
      && (face.classification !== 'UnsupportedCell' || options.allowUnsupportedFreeEdge)),
    intentionalOpenings: faces.filter((face) => face.classification === 'IntentionalOpening'),
    unsupportedEdges,
    warning: unsupportedEdges.length || faces.some((face) => face.classification === 'UnsupportedCell')
      ? 'This cell has an unsupported perimeter edge. Select a wall, edge arch, beam, or springing boundary.'
      : null,
  };
}

export function bearingVectorForSupportSides(sides, distance) {
  const vector = { x: 0, z: 0 };
  sides.forEach((side) => {
    if (side === 'west') vector.x -= distance;
    if (side === 'east') vector.x += distance;
    if (side === 'north') vector.z -= distance;
    if (side === 'south') vector.z += distance;
  });
  return vector;
}

/** True when a bounded face occupies a physical rib band rather than web. */
export function isRibBandFace(face) {
  const seatsByRib = new Map();
  (face?.boundaryEdges || [])
    .filter((edge) => edge?.kind === 'rib-seat' && edge.sourceId != null)
    .forEach((edge) => {
      const [ribId, seatingSide] = String(edge.sourceId).split(':');
      if (seatingSide !== '0' && seatingSide !== '1') return;
      if (!seatsByRib.has(ribId)) seatsByRib.set(ribId, new Set());
      seatsByRib.get(ribId).add(seatingSide);
    });
  return [...seatsByRib.values()].some((sides) => sides.size === 2);
}

export function buildRibBandQuads(segments = []) {
  const byRib = new Map();
  segments.forEach((segment) => {
    const match = String(segment?.sourceId ?? '').match(/^(\d+):([01])$/);
    if (!match || !segment.a || !segment.b) return;
    if (!byRib.has(match[1])) byRib.set(match[1], { 0: new Map(), 1: new Map() });
    const side = byRib.get(match[1])[match[2]];
    const segmentIndex = Number.isInteger(segment.ribSegmentIndex) ? segment.ribSegmentIndex : side.size;
    side.set(segmentIndex, segment);
  });
  const quads = [];
  byRib.forEach((sides, ribId) => {
    const sharedIndices = [...sides[0].keys()].filter((index) => sides[1].has(index));
    sharedIndices.forEach((index) => {
      quads.push({
        ribId,
        points: [sides[0].get(index).a, sides[0].get(index).b, sides[1].get(index).b, sides[1].get(index).a],
      });
    });
  });
  return quads;
}

export function pointInsideRibBands(point, quads = []) {
  return quads.some((quad) => polygonContains(point, quad.points));
}

/** Group the many split graph edges of a face back into architectural curves. */
export function groupFaceBoundaryCurves(face, nodes = []) {
  if (!face?.ids?.length || face.ids.length !== face.boundaryEdges?.length) return [];
  const curveKey = (edge, index) => {
    if (!edge) return `missing:${index}`;
    if (edge.kind === 'support') return `support:${edge.supportSide || (edge.supportSides || []).join('+')}`;
    if (edge.kind === 'guide') return `guide:${edge.sourceId ?? index}`;
    if (edge.kind === 'rib-seat') return `rib:${edge.sourceId ?? index}`;
    return `${edge.kind || 'edge'}:${edge.sourceId ?? index}`;
  };
  const curves = [];
  face.boundaryEdges.forEach((edge, index) => {
    const key = curveKey(edge, index);
    const start = nodes[face.ids[index]];
    const end = nodes[face.ids[(index + 1) % face.ids.length]];
    const previous = curves[curves.length - 1];
    if (previous?.key === key) previous.points.push(end);
    else curves.push({ key, kind: edge?.kind, sourceId: edge?.sourceId, supportSide: edge?.supportSide, points: [start, end] });
  });
  if (curves.length > 1 && curves[0].key === curves[curves.length - 1].key) {
    const last = curves.pop();
    curves[0].points = [...last.points.slice(0, -1), ...curves[0].points];
  }
  return curves;
}

/**
 * Reject a face as rib material only when the physical rib bands occupy most
 * of its interior.  A centroid-only test is unstable for the very small cells
 * around rib crossings: their centroid can fall inside a neighbouring band
 * even though nearly all of the cell is valid web.
 */
export function polygonMostlyInsideRibBands(points = [], quads = [], threshold = 0.7) {
  if (points.length < 3 || quads.length === 0) return false;
  const centre = points.reduce((sum, point) => ({
    x: sum.x + point.x / points.length,
    z: sum.z + point.z / points.length,
  }), { x: 0, z: 0 });
  const samples = [centre];
  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length];
    // Pull samples away from graph boundaries so tolerance and shared seating
    // edges cannot decide whether a valid web cell disappears.
    samples.push({ x: centre.x * 0.55 + point.x * 0.45, z: centre.z * 0.55 + point.z * 0.45 });
    samples.push({
      x: centre.x * 0.55 + (point.x + next.x) * 0.225,
      z: centre.z * 0.55 + (point.z + next.z) * 0.225,
    });
  });
  const occupied = samples.filter((sample) => pointInsideRibBands(sample, quads)).length;
  return occupied / samples.length >= threshold;
}
