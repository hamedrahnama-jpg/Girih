import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWallSystem, DEFAULT_WALL_SYSTEM } from './wall-system.js';

test('web covers use structured rib-bound surfaces without artificial centre points', () => {
  const building = {
    type: 'iwan',
    width: 4,
    depth: 2,
    height: 6,
    wallThickness: 0.35,
    openingWidth: 4,
  };
  const walls = {
    ...DEFAULT_WALL_SYSTEM,
    bricks: { ...DEFAULT_WALL_SYSTEM.bricks, enabled: false },
    ahang: { enabled: false },
    karbandi: {
      ...DEFAULT_WALL_SYSTEM.karbandi,
      enabled: true,
      coverEnabled: true,
      coverFinish: 'bricks',
    },
  };
  const group = buildWallSystem(building, walls);
  assert.equal(group.userData.karbandiHiddenCornerGuideCount, 2);
  assert.equal(group.userData.karbandiCornerGuideConstraint, 'hidden-rib-left-right-full-profile');
  assert.equal(group.userData.karbandiCornerGuides.length, 2);
  group.userData.karbandiCornerGuides.forEach((guide) => {
    assert.match(guide.label, /^south-/);
    assert.ok(guide.adjacentRibIds.length >= 2);
    assert.notEqual(guide.leftRibId, guide.rightRibId);
    assert.equal(guide.profileConstraint, 'average-full-left-right-rib-bend-and-slope');
    assert.equal(guide.guidePoints.length, 17);
    assert.ok(Math.abs(Math.hypot(...guide.startTangent) - 1) < 0.000001);
    assert.ok(Math.abs(Math.hypot(...guide.endTangent) - 1) < 0.000001);
    assert.ok(guide.startTangent[1] > guide.endTangent[1]);
  });
  const [southWestGuide, southEastGuide] = group.userData.karbandiCornerGuides;
  southWestGuide.guidePoints.forEach((point, index) => {
    const mirror = southEastGuide.guidePoints[index];
    assert.ok(Math.abs(point[0] + mirror[0]) < 0.000001);
    assert.ok(Math.abs(point[1] - mirror[1]) < 0.000001);
    assert.ok(Math.abs(point[2] - mirror[2]) < 0.000001);
  });
  const northSupportPanels = [];
  group.traverse((object) => {
    if (!object.userData?.webSupportSides?.includes('north')) return;
    northSupportPanels.push(object);
  });
  assert.ok(northSupportPanels.length > 0);
  northSupportPanels.forEach((panel) => {
    assert.equal(panel.userData.karbandiRoofRaisedCenter, false);
    assert.equal(panel.userData.karbandiRoofCurved, true);
    assert.ok(['four-edge-inward-courses', 'small-four-edge-cap', 'wall-started-bent-infill', 'wall-arch-ruled-strip', 'north-crown-sliced-inward-courses'].includes(panel.userData.webPatchSolver));
    assert.equal(panel.userData.northWallClipped, true);
    assert.ok(panel.material.clippingPlanes.length >= 1);
    assert.ok(panel.material.clippingPlanes.some((plane) => plane.normal.z === 1));
  });
  const crownPanels = northSupportPanels.filter((panel) => panel.userData.webPatchSolver === 'north-crown-sliced-inward-courses');
  assert.ok(crownPanels.length > 0);
  crownPanels.forEach((panel) => {
    assert.equal(panel.userData.roofBrickMapping, 'offset-rib-courses');
    assert.equal(panel.userData.roofBrickHorizontalMortarOnly, true);
    assert.ok(panel.userData.crownBoundaryVertexCount > 8);
    assert.equal(panel.userData.crownCourseDistanceMode, 'shared-lower-envelope-physical-offset');
    assert.ok(panel.userData.crownSliceCount > 1);
    assert.equal(panel.material.userData.isRoofInfillBrickCourse, true);
  });
  const perimeterPanels = [];
  const interiorPanels = [];
  group.traverse((object) => {
    if (!object.userData?.isKarbandiCover) return;
    if (object.userData.webSupportSides?.length) perimeterPanels.push(object);
    if (object.userData.webCellClassification === 'InteriorCell') interiorPanels.push(object);
  });
  assert.ok(interiorPanels.length > 0);
  interiorPanels.forEach((panel) => {
    assert.ok(['four-edge-inward-courses', 'small-four-edge-cap'].includes(panel.userData.webPatchSolver));
    assert.ok(panel.userData.webInwardCourseWidth > 0);
    assert.equal(
      panel.userData.roofBrickMapping,
      'offset-rib-courses',
    );
    assert.equal(panel.userData.roofBrickHorizontalMortarOnly, true);
    assert.equal(panel.userData.roofInfillBrickColor, '#b9824f');
    assert.equal(panel.userData.roofInfillBrickColor2, '#9f663b');
    assert.equal(panel.userData.roofInfillBrickHeight, 0.06);
    assert.equal(panel.material.userData.isRoofInfillBrickCourse, true);
  });
  assert.ok(interiorPanels.some((panel) => panel.userData.roofBrickMapping === 'offset-rib-courses'));
  interiorPanels.filter((panel) => panel.userData.roofBrickMapping === 'offset-rib-courses').forEach((panel) => {
    const uv = panel.geometry.getAttribute('uv');
    const count = panel.userData.webPatchSurfaceVertexCount;
    const courseWidth = panel.userData.webInwardCourseWidth;
    const inwardValues = new Set(Array.from({ length: count }, (_, index) => Math.round(uv.getY(index) / courseWidth)));
    assert.ok(inwardValues.size >= (panel.userData.webSmallCellFallback ? 2 : 3));
  });
  assert.ok(perimeterPanels.some((panel) => panel.userData.hiddenGuideBoundaryCount > 0));
  const southCornerGuidePanels = perimeterPanels.filter(
    (panel) => panel.userData.wallContinuationFollowsCornerGuide,
  );
  assert.equal(southCornerGuidePanels.length, 4);
  assert.deepEqual(
    [...new Set(southCornerGuidePanels.map((panel) => panel.userData.southCornerGuideId))].sort(),
    ['south-corner:east', 'south-corner:west'],
  );
  southCornerGuidePanels.forEach((panel) => {
    assert.equal(panel.userData.wallRoofGuide, 'south-corner-curved-guide-rib');
    assert.equal(panel.userData.wallContinuationMethod, 'bent-topology-patch');
    assert.equal(panel.userData.southCornerGuideProfileConstraint, 'average-full-left-right-rib-bend-and-slope');
    assert.ok(['east', 'south', 'west'].includes(panel.userData.wallContinuationSide));
    assert.ok(panel.userData.ribFootFlangeCount >= 1);
    assert.ok(panel.userData.ribFootClosureOverlap > panel.userData.ribEmbedTolerance);
  });
  assert.ok(perimeterPanels.some((panel) => panel.userData.webSupportSides.includes('south')));
  assert.ok(perimeterPanels.some((panel) => panel.userData.webSupportSides.includes('east')));
  assert.ok(perimeterPanels.some((panel) => panel.userData.webSupportSides.includes('west')));
  const wallContinuationPanels = perimeterPanels.filter(
    (panel) => panel.userData.webPatchSolver !== 'north-crown-sliced-inward-courses',
  );
  assert.ok(wallContinuationPanels.length > 0);
  wallContinuationPanels.forEach((panel) => {
    assert.equal(panel.userData.roofBrickMapping, 'wall-continuation');
    assert.ok(['east', 'south', 'west'].includes(panel.userData.wallContinuationSide));
    assert.equal(panel.userData.wallContinuationPatternSide, panel.userData.wallContinuationSide);
    assert.equal(panel.userData.wallContinuationClippedByRibs, true);
    assert.equal(panel.userData.wallContinuationCourseAxis, 'world-y');
  });
  perimeterPanels
    .filter((panel) => panel.userData.webCellClassification === 'CornerPerimeterCell')
    .forEach((panel) => {
      assert.equal(
        panel.userData.wallContinuationSide,
        panel.userData.webSupportSides.includes('east') ? 'east' : 'west',
      );
    });
  perimeterPanels.forEach((panel) => {
    assert.equal(panel.userData.karbandiRoofRaisedCenter, false);
    assert.equal(panel.userData.karbandiRoofCurved, true);
    assert.ok(['four-edge-inward-courses', 'small-four-edge-cap', 'wall-started-bent-infill', 'wall-arch-ruled-strip', 'north-crown-sliced-inward-courses'].includes(panel.userData.webPatchSolver));
    assert.equal(panel.userData.webSurfaceSubdivision, 8);
    assert.equal(panel.userData.ribEmbedApplied, true);
    assert.equal(panel.userData.ribCrackClosure, 'hidden-mitered-seating-flange');
    assert.equal(panel.userData.thicknessDirection, 'surface-normal');
    assert.equal(panel.userData.webStartsAtWall, true);
    assert.equal(panel.userData.webPatchInvertedTriangleCount, 0);
    assert.ok(['north-arch-curve', 'wall-leg-centerline', 'south-corner-curved-guide-rib'].includes(panel.userData.wallRoofGuide));
    assert.equal(panel.material.clippingPlanes.length, panel.userData.wallClippedSides.length);
    const positions = panel.geometry.getAttribute('position');
    const indices = panel.geometry.getIndex();
    assert.ok(positions.count > 20);
    for (let index = 0; index < positions.count; index += 1) {
      assert.ok(Number.isFinite(positions.getX(index)));
      assert.ok(Number.isFinite(positions.getY(index)));
      assert.ok(Number.isFinite(positions.getZ(index)));
    }
    for (let index = 0; index < indices.count; index += 3) {
      const ids = [indices.getX(index), indices.getX(index + 1), indices.getX(index + 2)];
      const points = ids.map((id) => [positions.getX(id), positions.getY(id), positions.getZ(id)]);
      const first = points[1].map((value, axis) => value - points[0][axis]);
      const second = points[2].map((value, axis) => value - points[0][axis]);
      const areaSquared = (
        (first[1] * second[2] - first[2] * second[1]) ** 2
        + (first[2] * second[0] - first[0] * second[2]) ** 2
        + (first[0] * second[1] - first[1] * second[0]) ** 2
      );
      assert.ok(areaSquared > 1e-18);
    }
  });

  const thicknessGroup = buildWallSystem(building, {
    ...walls,
    karbandi: {
      ...walls.karbandi,
      web: { ...walls.karbandi.web, roofThickness: 0.24 },
    },
  });
  const thicknessPanels = [];
  thicknessGroup.traverse((object) => {
    if (object.userData?.isKarbandiCover) thicknessPanels.push(object);
  });
  assert.ok(thicknessPanels.length > 0);
  thicknessPanels.forEach((panel) => assert.equal(panel.userData.roofThickness, 0.24));
});
