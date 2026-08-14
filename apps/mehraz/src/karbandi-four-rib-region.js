const EPSILON = 1e-8;

const clone = (point) => ({ x: point.x, y: point.y, z: point.z });
const mix = (a, b, t) => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  z: a.z + (b.z - a.z) * t,
});

const ribSource = (sourceId) => String(sourceId ?? '').match(/^(\d+):([01])$/);

function mergeAdjacentSeatCurvesByRib(curves) {
  if (!curves.length || !curves.every((curve) => curve.kind === 'rib-seat')) return curves;
  const merged = [];
  curves.forEach((curve) => {
    const ribId = ribSource(curve.sourceId)?.[1] ?? null;
    if (!ribId) {
      merged.push({ ...curve, ribId: null });
      return;
    }
    const previous = merged[merged.length - 1];
    if (previous?.ribId === ribId) {
      previous.points = [...previous.points, ...curve.points.slice(1)];
      previous.fragmentSourceIds.push(curve.sourceId);
    } else {
      merged.push({ ...curve, points: [...curve.points], ribId, fragmentSourceIds: [curve.sourceId] });
    }
  });
  if (merged.length > 1 && merged[0].ribId && merged[0].ribId === merged[merged.length - 1].ribId) {
    const last = merged.pop();
    merged[0].points = [...last.points.slice(0, -1), ...merged[0].points];
    merged[0].fragmentSourceIds = [...last.fragmentSourceIds, ...merged[0].fragmentSourceIds];
  }
  return merged;
}

export function buildRibCenterlines(segments = []) {
  const ribs = new Map();
  segments.forEach((segment) => {
    const match = ribSource(segment?.sourceId);
    if (!match || !Number.isInteger(segment.ribSegmentIndex)) return;
    if (!ribs.has(match[1])) ribs.set(match[1], { 0: new Map(), 1: new Map() });
    ribs.get(match[1])[match[2]].set(segment.ribSegmentIndex, segment);
  });

  const centerlines = new Map();
  ribs.forEach((sides, ribId) => {
    const indices = [...sides[0].keys()]
      .filter((index) => sides[1].has(index))
      .sort((a, b) => a - b);
    if (!indices.length) return;
    const points = indices.map((index) => {
      const left = sides[0].get(index).a;
      const right = sides[1].get(index).a;
      return mix(left, right, 0.5);
    });
    const finalLeft = sides[0].get(indices[indices.length - 1]).b;
    const finalRight = sides[1].get(indices[indices.length - 1]).b;
    points.push(mix(finalLeft, finalRight, 0.5));
    centerlines.set(ribId, points);
  });
  return centerlines;
}

function intersections(first, second) {
  const hits = [];
  for (let firstIndex = 0; firstIndex < first.length - 1; firstIndex += 1) {
    const a = first[firstIndex];
    const b = first[firstIndex + 1];
    const rx = b.x - a.x;
    const rz = b.z - a.z;
    for (let secondIndex = 0; secondIndex < second.length - 1; secondIndex += 1) {
      const c = second[secondIndex];
      const d = second[secondIndex + 1];
      const sx = d.x - c.x;
      const sz = d.z - c.z;
      const denominator = rx * sz - rz * sx;
      if (Math.abs(denominator) < EPSILON) continue;
      const qx = c.x - a.x;
      const qz = c.z - a.z;
      const t = (qx * sz - qz * sx) / denominator;
      const u = (qx * rz - qz * rx) / denominator;
      const firstUsesTerminalExtension = (
        (t >= -EPSILON && t <= 1 + EPSILON)
        || (t < 0 && firstIndex === 0)
        || (t > 1 && firstIndex === first.length - 2)
      );
      const secondUsesTerminalExtension = (
        (u >= -EPSILON && u <= 1 + EPSILON)
        || (u < 0 && secondIndex === 0)
        || (u > 1 && secondIndex === second.length - 2)
      );
      // A visible rib is clipped when its band first touches another band, so
      // its axis can stop just short of the requested red-polyline corner.
      // Extend only terminal segments, never an interior segment, and cap the
      // extrapolation to avoid selecting a remote crossing of curved ribs.
      if (!firstUsesTerminalExtension || !secondUsesTerminalExtension) continue;
      if (t < -12 || t > 13 || u < -12 || u > 13) continue;
      const onFirst = mix(a, b, t);
      const onSecond = mix(c, d, u);
      hits.push({
        point: mix(onFirst, onSecond, 0.5),
        firstPosition: firstIndex + Math.max(0, Math.min(1, t)),
        secondPosition: secondIndex + Math.max(0, Math.min(1, u)),
      });
    }
  }
  return hits;
}

function nearestIntersection(first, second, target) {
  return intersections(first, second).reduce((nearest, hit) => {
    const distance = (hit.point.x - target.x) ** 2 + (hit.point.z - target.z) ** 2;
    return !nearest || distance < nearest.distance ? { ...hit, distance } : nearest;
  }, null);
}

function nearestPosition(points, target) {
  let nearest = null;
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const denominator = dx * dx + dz * dz;
    if (denominator < EPSILON) continue;
    const progress = Math.max(0, Math.min(1, (
      (target.x - start.x) * dx + (target.z - start.z) * dz
    ) / denominator));
    const point = mix(start, end, progress);
    const distance = (point.x - target.x) ** 2 + (point.z - target.z) ** 2;
    if (!nearest || distance < nearest.distance) nearest = { position: index + progress, distance };
  }
  return nearest;
}

function slicePolyline(points, startPosition, endPosition, startPoint, endPoint) {
  const result = [clone(startPoint)];
  if (startPosition <= endPosition) {
    for (let index = Math.floor(startPosition) + 1; index <= Math.floor(endPosition); index += 1) {
      if (index > startPosition + EPSILON && index < endPosition - EPSILON && points[index]) result.push(clone(points[index]));
    }
  } else {
    for (let index = Math.ceil(startPosition) - 1; index >= Math.ceil(endPosition); index -= 1) {
      if (index < startPosition - EPSILON && index > endPosition + EPSILON && points[index]) result.push(clone(points[index]));
    }
  }
  result.push(clone(endPoint));
  return result;
}

/**
 * Replace the offset rib-seat face with the cell bounded by the four rib
 * centerlines. This is the architectural region represented by the red
 * four-sided polyline, including the portions hidden beneath the rib widths.
 */
export function fourRibCenterlineRegion(curves = [], centerlines = new Map(), options = {}) {
  // A graph face can split one physical rib boundary into multiple adjacent
  // seat fragments when it crosses from one side of that rib band to the
  // other. It is still a four-rib cell and must not be left as a roof hole.
  const regionCurves = mergeAdjacentSeatCurvesByRib(curves);
  if (regionCurves.length !== 4 || !regionCurves.every((curve) => curve.kind === 'rib-seat')) return null;
  const ribIds = regionCurves.map((curve) => curve.ribId ?? ribSource(curve.sourceId)?.[1] ?? null);
  if (ribIds.some((ribId) => !ribId) || new Set(ribIds).size !== 4) return null;
  const lines = ribIds.map((ribId) => centerlines.get(ribId));
  if (lines.some((line) => !line || line.length < 2)) return null;

  const corners = regionCurves.map((curve, index) => {
    const previousIndex = (index + regionCurves.length - 1) % regionCurves.length;
    const hit = nearestIntersection(lines[previousIndex], lines[index], curve.points[0]);
    if (!hit) return null;
    const wallBoundaryTolerance = Math.max(0, Number(options.wallBoundaryTolerance) || 0);
    const wallBoundary = (options.wallBoundaries || []).reduce((nearest, boundary) => {
      const distance = Math.abs(curve.points[0][boundary.axis] - boundary.value);
      return !nearest || distance < nearest.distance ? { ...boundary, distance } : nearest;
    }, null);
    const wallTopY = Number(options.wallTopY);
    const atWallTop = Number.isFinite(wallTopY)
      && curve.points[0].y <= wallTopY + Math.max(0.001, Number(options.wallTopTolerance) || 0.01);
    const meetsWallBoundary = wallBoundary && wallBoundary.distance <= wallBoundaryTolerance;
    if (options.anchorWallBoundary !== false && (atWallTop || meetsWallBoundary)) {
      const incoming = nearestPosition(lines[previousIndex], curve.points[0]);
      const outgoing = nearestPosition(lines[index], curve.points[0]);
      if (!incoming || !outgoing) return null;
      const anchoredPoint = clone(curve.points[0]);
      if (meetsWallBoundary) {
        anchoredPoint[wallBoundary.axis] = wallBoundary.value;
        anchoredPoint.y = wallBoundary.height;
      }
      return {
        point: anchoredPoint,
        incomingPosition: incoming.position,
        outgoingPosition: outgoing.position,
        wallTopAnchored: true,
      };
    }
    return {
      point: hit.point,
      incomingPosition: hit.firstPosition,
      outgoingPosition: hit.secondPosition,
    };
  });
  if (corners.some((corner) => !corner)) return null;

  return regionCurves.map((curve, index) => {
    const next = (index + 1) % regionCurves.length;
    return {
      ...curve,
      sourceId: `${ribIds[index]}:centerline`,
      originalSeatSourceId: curve.sourceId,
      originalSeatSourceIds: curve.fragmentSourceIds || [curve.sourceId],
      wallTopAnchoredStart: corners[index].wallTopAnchored === true,
      points: slicePolyline(
        lines[index],
        corners[index].outgoingPosition,
        corners[next].incomingPosition,
        corners[index].point,
        corners[next].point,
      ),
    };
  });
}

/**
 * Move the rib sides of a wall/perimeter roof cell onto the rib axes while
 * leaving its support or guide sides on their architectural boundaries.
 */
export function ribCenteredPerimeterRegion(curves = [], centerlines = new Map()) {
  if (curves.length < 3 || !curves.some((curve) => curve.kind === 'support')) return null;
  const ribIds = curves.map((curve) => ribSource(curve.sourceId)?.[1] ?? null);
  if (!ribIds.some(Boolean)) return null;
  const lines = curves.map((curve, index) => (
    ribIds[index] ? centerlines.get(ribIds[index]) : curve.points
  ));
  if (lines.some((line) => !line || line.length < 2)) return null;

  const corners = curves.map((curve, index) => {
    const previousIndex = (index + curves.length - 1) % curves.length;
    const target = curve.points[0];
    const hit = nearestIntersection(lines[previousIndex], lines[index], target);
    if (hit) {
      return {
        point: hit.point,
        incomingPosition: hit.firstPosition,
        outgoingPosition: hit.secondPosition,
      };
    }
    // Curved guides can meet a clipped rib at a sampled endpoint without a
    // numerically exact segment crossing. Preserve that architectural corner.
    const incoming = nearestPosition(lines[previousIndex], target);
    const outgoing = nearestPosition(lines[index], target);
    if (!incoming || !outgoing) return null;
    return {
      point: clone(target),
      incomingPosition: incoming.position,
      outgoingPosition: outgoing.position,
    };
  });
  if (corners.some((corner) => !corner)) return null;

  return curves.map((curve, index) => {
    const next = (index + 1) % curves.length;
    const centeredRib = Boolean(ribIds[index]);
    return {
      ...curve,
      sourceId: centeredRib ? `${ribIds[index]}:centerline` : curve.sourceId,
      originalSeatSourceId: centeredRib ? curve.sourceId : undefined,
      ribCenterlineBoundary: centeredRib,
      points: slicePolyline(
        lines[index],
        corners[index].outgoingPosition,
        corners[next].incomingPosition,
        corners[index].point,
        corners[next].point,
      ),
    };
  });
}
