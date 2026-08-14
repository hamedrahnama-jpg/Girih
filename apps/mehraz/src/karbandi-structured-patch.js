import * as THREE from 'three';

const clone = (point) => ({ x: point.x, y: point.y, z: point.z });
const mix = (a, b, t) => ({
  x: THREE.MathUtils.lerp(a.x, b.x, t),
  y: THREE.MathUtils.lerp(a.y, b.y, t),
  z: THREE.MathUtils.lerp(a.z, b.z, t),
});
const addScaled = (target, value, scale) => {
  target.x += value.x * scale;
  target.y += value.y * scale;
  target.z += value.z * scale;
};
const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
const curveLength = (points) => points.slice(1).reduce((sum, point, index) => sum + distance(points[index], point), 0);

function pointSegmentDistance(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dz = end.z - start.z;
  const lengthSquared = dx * dx + dy * dy + dz * dz;
  const parameter = lengthSquared > 1e-12
    ? THREE.MathUtils.clamp(((point.x - start.x) * dx + (point.y - start.y) * dy + (point.z - start.z) * dz) / lengthSquared, 0, 1)
    : 0;
  return distance(point, {
    x: start.x + dx * parameter,
    y: start.y + dy * parameter,
    z: start.z + dz * parameter,
  });
}

function pointPolylineDistance(point, points) {
  let result = Infinity;
  for (let index = 1; index < points.length; index += 1) {
    result = Math.min(result, pointSegmentDistance(point, points[index - 1], points[index]));
  }
  return Number.isFinite(result) ? result : 0;
}

function resample(points, count) {
  if (points.length < 2) return Array.from({ length: count }, () => clone(points[0] || { x: 0, y: 0, z: 0 }));
  const lengths = [0];
  for (let index = 1; index < points.length; index += 1) lengths.push(lengths[index - 1] + distance(points[index - 1], points[index]));
  const total = lengths[lengths.length - 1];
  if (total < 1e-9) return Array.from({ length: count }, () => clone(points[0]));
  return Array.from({ length: count }, (_, sample) => {
    const target = total * sample / (count - 1);
    let segment = 0;
    while (segment < lengths.length - 2 && lengths[segment + 1] < target) segment += 1;
    const span = lengths[segment + 1] - lengths[segment];
    return mix(points[segment], points[segment + 1], span > 0 ? (target - lengths[segment]) / span : 0);
  });
}

function reverseIfNeeded(points, desiredStart) {
  return distance(points[0], desiredStart) <= distance(points[points.length - 1], desiredStart) ? points : [...points].reverse();
}

function curveBreakFractions(points) {
  const lengths = [0];
  for (let index = 1; index < points.length; index += 1) lengths.push(lengths[index - 1] + distance(points[index - 1], points[index]));
  const total = lengths[lengths.length - 1];
  return total > 1e-9 ? lengths.map((length) => length / total) : [0, 1];
}

function sampleCurveAt(points, parameter) {
  const lengths = [0];
  for (let index = 1; index < points.length; index += 1) lengths.push(lengths[index - 1] + distance(points[index - 1], points[index]));
  const total = lengths[lengths.length - 1];
  if (total < 1e-9) return clone(points[0]);
  const target = THREE.MathUtils.clamp(parameter, 0, 1) * total;
  let segment = 0;
  while (segment < lengths.length - 2 && lengths[segment + 1] < target) segment += 1;
  const span = lengths[segment + 1] - lengths[segment];
  return mix(points[segment], points[segment + 1], span > 0 ? (target - lengths[segment]) / span : 0);
}

function computeNormals(vertices, triangles) {
  const normals = vertices.map(() => new THREE.Vector3());
  triangles.forEach(([a, b, c]) => {
    const first = vertices[a];
    const second = vertices[c];
    const third = vertices[b];
    const normal = new THREE.Vector3(second.x - first.x, second.y - first.y, second.z - first.z)
      .cross(new THREE.Vector3(third.x - first.x, third.y - first.y, third.z - first.z));
    normals[a].add(normal); normals[b].add(normal); normals[c].add(normal);
  });
  normals.forEach((normal) => {
    if (normal.y < 0) normal.multiplyScalar(-1);
    if (normal.lengthSq() < 1e-18) normal.set(0, 1, 0);
    else normal.normalize();
  });
  return normals;
}

function bestFitRegionNormal(vertices, boundaryIndices) {
  const normal = new THREE.Vector3();
  for (let index = 0; index < boundaryIndices.length; index += 1) {
    const current = vertices[boundaryIndices[index]];
    const next = vertices[boundaryIndices[(index + 1) % boundaryIndices.length]];
    // Newell's method gives a stable normal for a slightly non-planar region
    // and does not collapse when small-cell triangle normals cancel out.
    normal.x += (current.y - next.y) * (current.z + next.z);
    normal.y += (current.z - next.z) * (current.x + next.x);
    normal.z += (current.x - next.x) * (current.y + next.y);
  }
  if (normal.lengthSq() < 1e-18) {
    for (let index = 2; index < boundaryIndices.length; index += 1) {
      const origin = vertices[boundaryIndices[0]];
      const first = vertices[boundaryIndices[index - 1]];
      const second = vertices[boundaryIndices[index]];
      normal.add(new THREE.Vector3(first.x - origin.x, first.y - origin.y, first.z - origin.z)
        .cross(new THREE.Vector3(second.x - origin.x, second.y - origin.y, second.z - origin.z)));
    }
  }
  if (normal.lengthSq() < 1e-18) normal.set(0, 1, 0);
  else normal.normalize();
  if (normal.y < 0) normal.multiplyScalar(-1);
  return normal;
}

function finalize(type, vertices, triangles, boundarySegments, details = {}) {
  let positive = 0;
  let negative = 0;
  triangles.forEach(([a, b, c]) => {
    const first = vertices[a]; const second = vertices[b]; const third = vertices[c];
    const area = (second.x - first.x) * (third.z - first.z) - (second.z - first.z) * (third.x - first.x);
    if (area > 1e-10) positive += 1;
    else if (area < -1e-10) negative += 1;
  });
  return {
    type,
    vertices,
    triangles,
    boundarySegments,
    normals: computeNormals(vertices, triangles),
    invertedTriangleCount: Math.min(positive, negative),
    ...details,
  };
}

function coonsPatch(curves, resolution, courseWidth) {
  const physicalRibIds = curves.map((curve) => (
    String(curve.sourceId ?? '').match(/^(\d+):(?:[01]|centerline)$/)?.[1] ?? null
  ));
  const fourRibRegion = curves.length === 4
    && curves.every((curve) => curve.kind === 'rib-seat')
    && (
      physicalRibIds.every((ribId) => ribId == null)
      || (physicalRibIds.every(Boolean) && new Set(physicalRibIds).size === 4)
    );
  const denseCount = 257;
  const bottom = resample(curves[0].points, denseCount);
  const right = resample(curves[1].points, denseCount);
  const top = resample([...curves[2].points].reverse(), denseCount);
  const left = resample([...curves[3].points].reverse(), denseCount);
  const sample = (curve, parameter) => {
    const scaled = THREE.MathUtils.clamp(parameter, 0, 1) * (curve.length - 1);
    const index = Math.min(curve.length - 2, Math.floor(scaled));
    return mix(curve[index], curve[index + 1], scaled - index);
  };
  const p00 = bottom[0]; const p10 = bottom[denseCount - 1];
  const p01 = top[0]; const p11 = top[denseCount - 1];
  const evaluate = (u, v) => {
    const point = { x: 0, y: 0, z: 0 };
    addScaled(point, sample(bottom, u), 1 - v);
    addScaled(point, sample(top, u), v);
    addScaled(point, sample(left, v), 1 - u);
    addScaled(point, sample(right, v), u);
    addScaled(point, p00, -(1 - u) * (1 - v));
    addScaled(point, p10, -u * (1 - v));
    addScaled(point, p01, -(1 - u) * v);
    addScaled(point, p11, -u * v);
    return point;
  };
  const midpoint = (curve) => sample(curve, 0.5);
  const spanV = distance(midpoint(bottom), midpoint(top));
  const spanU = distance(midpoint(left), midpoint(right));
  const transverseSpan = Math.min(spanU, spanV);
  const scaledCourseWidth = Math.max(0.01, Number(courseWidth) || transverseSpan / 6);
  const courseCount = Math.max(0, Math.min(10, Math.floor(transverseSpan / (scaledCourseWidth * 2))));
  const smallCellFallback = courseCount < 2;
  const ringCount = smallCellFallback ? 1 : courseCount;
  const segmentsPerSide = smallCellFallback ? 4 : Math.max(4, Math.min(12, resolution));
  const vertices = [];
  const masonryUvs = [];
  const sideLengths = curves.map((curve) => curveLength(curve.points));
  const rings = [];
  for (let ringIndex = 0; ringIndex < ringCount; ringIndex += 1) {
    const uInset = smallCellFallback ? 0 : Math.min(0.46, ringIndex * scaledCourseWidth / Math.max(0.0001, spanU));
    const vInset = smallCellFallback ? 0 : Math.min(0.46, ringIndex * scaledCourseWidth / Math.max(0.0001, spanV));
    const uSpan = 1 - uInset * 2;
    const vSpan = 1 - vInset * 2;
    const ring = [];
    for (let side = 0; side < 4; side += 1) for (let index = 0; index < segmentsPerSide; index += 1) {
      const progress = index / segmentsPerSide;
      let u; let v;
      if (side === 0) { u = uInset + uSpan * progress; v = vInset; }
      else if (side === 1) { u = 1 - uInset; v = vInset + vSpan * progress; }
      else if (side === 2) { u = 1 - uInset - uSpan * progress; v = 1 - vInset; }
      else { u = uInset; v = 1 - vInset - vSpan * progress; }
      ring.push(vertices.length);
      vertices.push(evaluate(u, v));
      masonryUvs.push({
        u: sideLengths[side] * progress,
        v: ringIndex * scaledCourseWidth,
      });
    }
    rings.push(ring);
  }
  const triangles = [];
  for (let ringIndex = 0; ringIndex < rings.length - 1; ringIndex += 1) {
    const outer = rings[ringIndex];
    const inner = rings[ringIndex + 1];
    for (let index = 0; index < outer.length; index += 1) {
      const next = (index + 1) % outer.length;
      triangles.push([outer[index], outer[next], inner[next]], [outer[index], inner[next], inner[index]]);
    }
  }
  const centerPoint = evaluate(0.5, 0.5);
  const centerIndices = sideLengths.map((sideLength) => {
    const index = vertices.length;
    vertices.push(clone(centerPoint));
    masonryUvs.push({ u: sideLength * 0.5, v: ringCount * scaledCourseWidth });
    return index;
  });
  const inner = rings[rings.length - 1];
  for (let index = 0; index < inner.length; index += 1) {
    const side = Math.floor(index / segmentsPerSide);
    triangles.push([inner[index], inner[(index + 1) % inner.length], centerIndices[side]]);
  }
  const boundarySegments = [];
  const outer = rings[0];
  for (let side = 0; side < 4; side += 1) for (let index = 0; index < segmentsPerSide; index += 1) {
    const current = side * segmentsPerSide + index;
    boundarySegments.push({ a: outer[current], b: outer[(current + 1) % outer.length], metadata: curves[side] });
  }
  const patch = finalize(
    smallCellFallback ? 'small-four-edge-cap' : 'four-edge-inward-courses',
    vertices,
    triangles,
    boundarySegments,
    {
      courseCount: smallCellFallback ? 0 : courseCount,
      courseWidth: scaledCourseWidth,
      smallCellFallback,
      wallStarted: curves.some((curve) => curve.kind === 'support'),
      masonryUvs,
      brickMapping: fourRibRegion ? 'offset-rib-courses' : 'world-aligned',
    },
  );
  if (fourRibRegion) {
    const regionNormal = bestFitRegionNormal(vertices, rings[0]);
    patch.normals = vertices.map(() => regionNormal.clone());
    patch.regionNormal = regionNormal;
    patch.normalMode = 'best-fit-four-rib-region-90-degree';
    patch.fourRibRegion = true;
    patch.regionCorners = curves.map((curve) => clone(curve.points[0]));
    patch.regionBoundary = rings[0].map((vertexIndex) => clone(vertices[vertexIndex]));
  }
  return patch;
}

function triangularPatch(curves, resolution) {
  const count = resolution + 1;
  const ab = resample(curves[0].points, count);
  const bc = resample(curves[1].points, count);
  const ca = resample(curves[2].points, count);
  const a = ab[0]; const b = ab[resolution]; const c = bc[resolution];
  const vertices = [];
  const rows = [];
  for (let betaIndex = 0; betaIndex <= resolution; betaIndex += 1) {
    rows[betaIndex] = [];
    for (let gammaIndex = 0; gammaIndex <= resolution - betaIndex; gammaIndex += 1) {
      const beta = betaIndex / resolution;
      const gamma = gammaIndex / resolution;
      const alpha = 1 - beta - gamma;
      rows[betaIndex][gammaIndex] = vertices.length;
      vertices.push({ x: a.x * alpha + b.x * beta + c.x * gamma, y: a.y * alpha + b.y * beta + c.y * gamma, z: a.z * alpha + b.z * beta + c.z * gamma });
    }
  }
  const triangles = [];
  for (let row = 0; row < resolution; row += 1) for (let column = 0; column < resolution - row; column += 1) {
    triangles.push([rows[row][column], rows[row + 1][column], rows[row][column + 1]]);
    if (column < resolution - row - 1) triangles.push([rows[row + 1][column], rows[row + 1][column + 1], rows[row][column + 1]]);
  }
  const fixed = new Set();
  for (let index = 0; index <= resolution; index += 1) {
    const abIndex = rows[index][0];
    const bcIndex = rows[resolution - index][index];
    const caIndex = rows[0][resolution - index];
    vertices[abIndex] = clone(ab[index]);
    vertices[bcIndex] = clone(bc[index]);
    vertices[caIndex] = clone(ca[index]);
    fixed.add(abIndex); fixed.add(bcIndex); fixed.add(caIndex);
  }
  const neighbors = vertices.map(() => new Set());
  triangles.forEach(([first, second, third]) => {
    neighbors[first].add(second); neighbors[first].add(third);
    neighbors[second].add(first); neighbors[second].add(third);
    neighbors[third].add(first); neighbors[third].add(second);
  });
  // A regular triangular parameter grid with its perimeter fixed to the two
  // rib seats and wall guide. Harmonic relaxation of only the interior avoids
  // the folds produced by a direct curved transfinite formula.
  for (let iteration = 0; iteration < 80; iteration += 1) {
    const next = vertices.map(clone);
    vertices.forEach((vertex, index) => {
      if (fixed.has(index) || !neighbors[index].size) return;
      const average = { x: 0, y: 0, z: 0 };
      neighbors[index].forEach((neighbor) => addScaled(average, vertices[neighbor], 1 / neighbors[index].size));
      next[index] = average;
    });
    next.forEach((vertex, index) => { vertices[index] = vertex; });
  }
  const boundarySegments = [];
  for (let index = 0; index < resolution; index += 1) {
    boundarySegments.push({ a: rows[index][0], b: rows[index + 1][0], metadata: curves[0] });
    boundarySegments.push({ a: rows[resolution - index][index], b: rows[resolution - index - 1][index + 1], metadata: curves[1] });
    boundarySegments.push({ a: rows[0][resolution - index], b: rows[0][resolution - index - 1], metadata: curves[2] });
  }
  const wallStarted = curves.some((curve) => curve.kind === 'support');
  return finalize(
    wallStarted ? 'wall-started-bent-infill' : 'three-curve-transfinite',
    vertices,
    triangles,
    boundarySegments,
    { wallStarted },
  );
}

function slicedNorthCrownPatch(supportCurve, oppositeCurves, resolution, courseWidth) {
  // Face curves run from the right support end back toward the left. Reverse
  // both their order and direction so every lower crown segment runs left to
  // right and can become the exact base of one independent fan slice.
  const lowerCurves = [...oppositeCurves]
    .reverse()
    .map((curve) => ({ ...curve, points: [...curve.points].reverse().map(clone) }))
    .filter((curve) => curve.points.length >= 2 && curveLength(curve.points) > 1e-7);
  if (!lowerCurves.length) return null;
  const lowerEnvelope = [];
  lowerCurves.forEach((curve) => lowerEnvelope.push(...curve.points.slice(lowerEnvelope.length ? 1 : 0)));

  const apex = sampleCurveAt(supportCurve.points, 0.5);
  const archSamples = Math.max(8, Math.min(24, resolution * 2));
  const leftArch = Array.from(
    { length: archSamples + 1 },
    (_, index) => sampleCurveAt(supportCurve.points, 0.5 * (1 - index / archSamples)),
  );
  const rightArch = Array.from(
    { length: archSamples + 1 },
    (_, index) => sampleCurveAt(supportCurve.points, 1 - 0.5 * index / archSamples),
  );
  const scaledCourseWidth = Math.max(0.01, Number(courseWidth) || 0.1);
  const vertices = [];
  const triangles = [];
  const boundarySegments = [];
  const masonryUvs = [];
  const crownSliceVertexRanges = [];
  let maximumInset = 0;

  lowerCurves.forEach((lowerCurve, sliceIndex) => {
    const lowerStart = lowerCurve.points[0];
    const lowerEnd = lowerCurve.points[lowerCurve.points.length - 1];
    const leftBoundary = sliceIndex === 0 ? leftArch : [clone(apex), clone(lowerStart)];
    const rightBoundary = sliceIndex === lowerCurves.length - 1 ? rightArch : [clone(lowerEnd), clone(apex)];
    const leftMetadata = sliceIndex === 0
      ? supportCurve
      : { kind: 'guide', sourceId: `north-crown-radial-${sliceIndex}` };
    const rightMetadata = sliceIndex === lowerCurves.length - 1
      ? supportCurve
      : { kind: 'guide', sourceId: `north-crown-radial-${sliceIndex + 1}` };
    const sliceResolution = Math.max(12, Math.min(24, Math.max(resolution * 2, lowerCurve.points.length * 2)));
    const slice = triangularPatch([
      { ...leftMetadata, points: leftBoundary },
      lowerCurve,
      { ...rightMetadata, points: rightBoundary },
    ], sliceResolution);
    const vertexOffset = vertices.length;
    vertices.push(...slice.vertices.map(clone));
    triangles.push(...slice.triangles.map(([a, b, c]) => [a + vertexOffset, b + vertexOffset, c + vertexOffset]));
    boundarySegments.push(...slice.boundarySegments.map((segment) => ({
      ...segment,
      a: segment.a + vertexOffset,
      b: segment.b + vertexOffset,
    })));
    slice.vertices.forEach((vertex) => {
      // All crown slices share one distance field measured from the complete
      // lower rib envelope. Equal V values therefore form continuous nested
      // U-shaped brick courses across hidden slice seams, matching masonry
      // laid progressively upward from the crown's lower rib boundary.
      const inset = pointPolylineDistance(vertex, lowerEnvelope);
      maximumInset = Math.max(maximumInset, inset);
      masonryUvs.push({ u: distance(apex, vertex), v: inset });
    });
    crownSliceVertexRanges.push({
      sliceIndex,
      start: vertexOffset,
      count: slice.vertices.length,
      lowerSourceId: lowerCurve.sourceId ?? null,
    });
  });

  return finalize(
    'north-crown-sliced-inward-courses',
    vertices,
    triangles,
    boundarySegments,
    {
      wallStarted: true,
      courseCount: Math.max(1, Math.floor(maximumInset / scaledCourseWidth)),
      courseWidth: scaledCourseWidth,
      masonryUvs,
      brickMapping: 'offset-rib-courses',
      preservedBoundaryVertexCount: supportCurve.points.length
        + lowerCurves.reduce((sum, curve) => sum + curve.points.length, 0),
      courseDistanceMode: 'shared-lower-envelope-physical-offset',
      crownSliceCount: lowerCurves.length,
      crownSliceVertexRanges,
    },
  );
}

function ruledPerimeterPatch(curves, resolution, courseWidth) {
  const supportIndex = curves.findIndex((curve) => curve.kind === 'support');
  if (supportIndex < 0) return null;
  const supportCurve = curves[supportIndex];
  const oppositeCurves = [];
  for (let offset = 1; offset < curves.length; offset += 1) oppositeCurves.push(curves[(supportIndex + offset) % curves.length]);
  if (supportCurve.supportSide === 'north') {
    return slicedNorthCrownPatch(supportCurve, oppositeCurves, resolution, courseWidth);
  }
  const oppositePoints = [];
  oppositeCurves.forEach((curve) => oppositePoints.push(...curve.points.slice(oppositePoints.length ? 1 : 0)));
  const orientedOpposite = reverseIfNeeded(oppositePoints, supportCurve.points[0]);
  // Include the normalized arc position of every original vertex from both
  // boundaries. This prevents the crown mesh from cutting across rib bends.
  const parameters = [...new Set([
    ...curveBreakFractions(supportCurve.points),
    ...curveBreakFractions(orientedOpposite),
    ...Array.from({ length: resolution + 1 }, (_, index) => index / resolution),
  ].map((value) => Math.round(value * 1e8) / 1e8))].sort((a, b) => a - b);
  const support = parameters.map((parameter) => sampleCurveAt(supportCurve.points, parameter));
  const opposite = parameters.map((parameter) => sampleCurveAt(orientedOpposite, parameter));
  const localSpans = parameters.map((_, index) => distance(support[index], opposite[index]));
  const transverseSpan = localSpans.reduce((sum, span) => sum + span, 0) / parameters.length;
  const scaledCourseWidth = Math.max(0.01, Number(courseWidth) || transverseSpan / 6);
  const rowCount = Math.max(2, Math.min(16, Math.ceil(transverseSpan / scaledCourseWidth)));
  const count = parameters.length;
  const vertices = [];
  const masonryUvs = [];
  const alongLength = Math.max(curveLength(supportCurve.points), curveLength(orientedOpposite));
  for (let vIndex = 0; vIndex <= rowCount; vIndex += 1) {
    const v = vIndex / rowCount;
    for (let uIndex = 0; uIndex < count; uIndex += 1) {
      vertices.push(mix(support[uIndex], opposite[uIndex], v));
      // Use the actual local arch-to-rib distance. Constant texture-V contours
      // are therefore true physical offsets and remain parallel as the crown
      // narrows, instead of squeezing against the north wall.
      masonryUvs.push({ u: parameters[uIndex] * alongLength, v: Math.min(v, 1 - v) * localSpans[uIndex] });
    }
  }
  const at = (u, v) => v * count + u;
  const triangles = [];
  for (let v = 0; v < rowCount; v += 1) for (let u = 0; u < count - 1; u += 1) {
    triangles.push([at(u, v), at(u + 1, v), at(u + 1, v + 1)], [at(u, v), at(u + 1, v + 1), at(u, v + 1)]);
  }
  const compositeMetadata = { kind: 'rib-seat', sourceId: 'composite-rib-envelope' };
  const boundarySegments = [];
  for (let index = 0; index < count - 1; index += 1) {
    boundarySegments.push({ a: at(index, 0), b: at(index + 1, 0), metadata: supportCurve });
    boundarySegments.push({ a: at(count - index - 1, rowCount), b: at(count - index - 2, rowCount), metadata: compositeMetadata });
  }
  return finalize(
    'wall-arch-ruled-strip',
    vertices,
    triangles,
    boundarySegments,
    {
      wallStarted: true,
      courseCount: Math.max(1, Math.floor(transverseSpan / (scaledCourseWidth * 2))),
      courseWidth: scaledCourseWidth,
      masonryUvs: null,
      brickMapping: 'world-aligned',
      preservedBoundaryVertexCount: supportCurve.points.length + orientedOpposite.length,
      courseDistanceMode: null,
      crownColumnCount: 0,
      crownRowCount: 0,
    },
  );
}

function boundaryTriangulatedPatch(curves) {
  const vertices = [];
  const boundarySegments = [];
  const samePoint = (left, right) => left && right && distance(left, right) < 1e-7;
  const vertexIndex = (point, allowFirst = false) => {
    if (allowFirst && samePoint(point, vertices[0])) return 0;
    if (samePoint(point, vertices[vertices.length - 1])) return vertices.length - 1;
    vertices.push(clone(point));
    return vertices.length - 1;
  };
  curves.forEach((curve, curveIndex) => {
    for (let pointIndex = 0; pointIndex < curve.points.length - 1; pointIndex += 1) {
      const a = vertexIndex(curve.points[pointIndex]);
      const closesBoundary = curveIndex === curves.length - 1 && pointIndex === curve.points.length - 2;
      const b = vertexIndex(curve.points[pointIndex + 1], closesBoundary);
      if (a !== b) boundarySegments.push({ a, b, metadata: curve });
    }
  });
  if (vertices.length < 3) return null;
  const triangles = THREE.ShapeUtils.triangulateShape(
    vertices.map((point) => new THREE.Vector2(point.x, point.z)),
    [],
  );
  if (!triangles.length) return null;
  return finalize('boundary-constrained-polygon', vertices, triangles, boundarySegments, {
    wallStarted: curves.some((curve) => curve.kind === 'support'),
    courseCount: 1,
    courseWidth: 0,
    masonryUvs: null,
    brickMapping: 'world-aligned',
    boundaryFallback: true,
    preservedBoundaryVertexCount: vertices.length,
  });
}

export function buildStructuredWebPatch(curves, options = {}) {
  const resolution = Math.max(4, Math.min(20, Math.round(Number(options.resolution) || 8)));
  let preferred = null;
  if (curves.length === 4) preferred = coonsPatch(curves, resolution, options.courseWidth);
  else if (curves.length === 3) preferred = triangularPatch(curves, resolution);
  else if (curves.length > 4 && curves.filter((curve) => curve.kind === 'support').length === 1) {
    preferred = ruledPerimeterPatch(curves, resolution, options.courseWidth);
  }
  if (preferred && preferred.invertedTriangleCount === 0) return preferred;
  const fallback = boundaryTriangulatedPatch(curves);
  if (fallback) {
    fallback.replacedPatchType = preferred?.type ?? null;
    fallback.replacedInvertedTriangleCount = preferred?.invertedTriangleCount ?? 0;
    return fallback;
  }
  return preferred;
}
