import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { archCourseDistanceAtPoint, buildWallSystem, configureStoneBaseMaterial, createRoomPlanOpening, DEFAULT_WALL_SYSTEM, karbandiGroupYForWallTopLegCenters, karbandiGroupZForWallLegCenters, normalizeKarbandiRibCount, karbandiReferenceZForRibCount, karbandiReferenceZSolutions, karbandiSpanForWallLegCenters, normalizeWallSystem, pointedArchConstruction, portalDefaultWallSystem, roomPlanOpeningsWithDefaultDoor, sampledCurveIntervalsAtOrAbove, solveKarbandiWallSeating, southOpeningProfile, wallConnectedRibIndexes, wallContextLibraryAsset } from './wall-system.js';
import { buildingForSelectedType, buildingSurfaces, CONSTRUCTION_STEPS, constructionStepsForBuilding, defaultZoneBounds, MehrazScene, moveZoneVerticallyByBrick, normalizeBuilding, resizeZoneHeightByBrick, zoneBrickHeightStep, zonePatternMapTransform, zoneSoldierCourses, zoneWorldTransform } from './mehraz-scene.js';

function constructionScene() {
  const scene = Object.create(MehrazScene.prototype);
  scene.building = normalizeBuilding();
  scene.walls = normalizeWallSystem({
    bricks: { ...DEFAULT_WALL_SYSTEM.bricks, enabled: false },
  }, scene.building);
  scene.buildingGroup = new THREE.Group();
  scene.buildingGroup.add(buildWallSystem(scene.building, scene.walls));
  ['constructionGuideGroup', 'archInfillGroup', 'placementGroup', 'placementMaskGroup', 'zoneGroup', 'zoneDecorationGroup']
    .forEach((key) => { scene[key] = new THREE.Group(); });
  scene.constructionGuideKey = null;
  scene.selectedWallSide = null;
  scene.wallSurfaceHighlight = null;
  scene.updateWallSurfaceHighlight = () => {};
  scene.shadowInvalidations = [];
  scene.invalidate = (shadows) => { scene.shadowInvalidations.push(shadows === true); };
  return scene;
}

function karbandiConstructionScene() {
  const scene = constructionScene();
  scene.walls = normalizeWallSystem({
    ...DEFAULT_WALL_SYSTEM,
    bricks: { ...DEFAULT_WALL_SYSTEM.bricks, enabled: false },
    ahang: { enabled: false },
    karbandi: {
      ...DEFAULT_WALL_SYSTEM.karbandi,
      enabled: true,
      coverEnabled: true,
    },
  }, scene.building);
  scene.buildingGroup.clear();
  scene.buildingGroup.add(buildWallSystem(scene.building, scene.walls));
  return scene;
}

function visibleStructuralMeshes(scene, side) {
  return scene.wallSystemRoot().children.filter((child) => (
    child.isMesh
    && child.userData?.wallSide === side
    && !child.userData?.isBrickFace
    && !child.userData?.isWallEdgeLine
    && child.visible
  ));
}

function buildWallSystemWithCanvasMock(building, walls, zones = []) {
  const previousDocument = globalThis.document;
  globalThis.document = {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({ fillRect() {} }),
    }),
  };
  try {
    return buildWallSystem(building, walls, zones);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
}

test('Room floor-plan settings normalize direct-bearing cover constraints', () => {
  const circle = normalizeBuilding({
    type: 'room',
    roomPlanShape: 'circle',
    domeCoverType: 'pyramid',
    domeTransitionCoverEnabled: true,
  });
  assert.equal(circle.roomPlanShape, 'circle');
  assert.equal(circle.domeCoverType, 'dome');
  assert.equal(circle.domeTransitionCoverEnabled, false);

  assert.equal(normalizeBuilding({ type: 'room', roomPlanShape: 'polygon', roomPolygonSides: 2 }).roomPolygonSides, 3);
  assert.equal(normalizeBuilding({ type: 'room', roomPlanShape: 'polygon', roomPolygonSides: 100 }).roomPolygonSides, 32);
  assert.equal(normalizeBuilding({ type: 'room', roomPlanShape: 'unknown' }).roomPlanShape, 'square');
});

test('Building types expose Portal compatibility and force Vestibule to an octagonal room plan', () => {
  const portal = normalizeBuilding();
  assert.equal(portal.type, 'iwan');
  assert.equal(portal.buildingType, 'portal');
  assert.equal(portal.portalPlanShape, 'square');
  assert.equal(normalizeBuilding({ portalPlanShape: 'octagon' }).portalPlanShape, 'octagon');
  assert.equal(normalizeBuilding({ portalPlanShape: 'circle' }).portalPlanShape, 'circle');
  assert.equal(normalizeBuilding({ portalPlanShape: 'polygon' }).portalPlanShape, 'square');

  const vestibule = normalizeBuilding({ type: 'vestibule', roomPlanShape: 'circle' });
  assert.equal(vestibule.type, 'room');
  assert.equal(vestibule.buildingType, 'vestibule');
  assert.equal(vestibule.roomPlanShape, 'octagon');
  assert.equal(vestibule.domeTransition, 'karbandi');
  assert.equal(vestibule.domeTransitionCoverEnabled, false);
  assert.equal(normalizeBuilding({ ...vestibule, domeTransitionCoverEnabled: true }).domeTransitionCoverEnabled, true);

  const savedVestibule = normalizeBuilding({ type: 'room', buildingType: 'vestibule', roomPlanShape: 'polygon' });
  assert.equal(savedVestibule.type, 'room');
  assert.equal(savedVestibule.buildingType, 'vestibule');
  assert.equal(savedVestibule.roomPlanShape, 'octagon');

  const selectedPortal = buildingForSelectedType(
    normalizeBuilding({ type: 'room', buildingType: 'room', portalPlanShape: 'circle' }),
    'portal',
  );
  assert.equal(selectedPortal.portalPlanShape, 'square');

  for (const portalTransition of ['karbandi', 'squinch', 'muqarnas']) {
    const squareWalls = normalizeWallSystem({
      portalTransition,
      karbandi: { enabled: portalTransition === 'karbandi' },
    }, normalizeBuilding({ type: 'iwan', buildingType: 'portal', portalPlanShape: 'square' }));
    assert.equal(squareWalls.portalTransition, portalTransition,
      `Square Portal must retain the ${portalTransition} transition`);
  }
  for (const portalPlanShape of ['octagon', 'circle']) {
    for (const requestedTransition of ['squinch', 'muqarnas']) {
      const regularPortalWalls = normalizeWallSystem({
        portalTransition: requestedTransition,
        karbandi: { enabled: false },
      }, normalizeBuilding({ type: 'iwan', buildingType: 'portal', portalPlanShape }));
      assert.equal(regularPortalWalls.portalTransition, 'karbandi',
        `${portalPlanShape} Portal must reject ${requestedTransition}`);
      assert.equal(regularPortalWalls.karbandi.enabled, true,
        `${portalPlanShape} Portal must enable its only valid transition`);
    }
  }
});

test('Portal Octagon and Circle plans build only the half behind the square-plan facade', () => {
  const buildPortalPlan = (portalPlanShape) => {
    const building = normalizeBuilding({
      type: 'iwan',
      buildingType: 'portal',
      portalPlanShape,
      width: 6,
      iwanDepth: 3,
      height: 4,
    });
    const walls = normalizeWallSystem({
      ...DEFAULT_WALL_SYSTEM,
      ahang: { enabled: false },
      karbandi: { ...DEFAULT_WALL_SYSTEM.karbandi, enabled: false },
      bricks: { ...DEFAULT_WALL_SYSTEM.bricks, enabled: false },
    }, building);
    return buildWallSystemWithCanvasMock(building, walls);
  };

  [['octagon', 5], ['circle', 32]].forEach(([shape, expectedSegments]) => {
    const portal = buildPortalPlan(shape);
    const plan = portal.getObjectByName(`Portal half-${shape} floor-plan walls`);
    assert.ok(plan);
    assert.equal(plan.children.length, expectedSegments);
    assert.equal(plan.userData.portalHalfPlan, true);
    assert.equal(portal.userData.portalPlanShape, shape);
    assert.equal(portal.userData.portalHalfPlanFullSideCount, shape === 'circle' ? 64 : 8);
    assert.ok(plan.children.every((segment) => (
      segment.userData.portalHalfPlan === true
      && segment.userData.portalPlanShape === shape
    )));
    const cutLineZ = portal.userData.portalHalfPlanCutLineZ;
    assert.ok(plan.children.every((segment) => {
      const start = segment.userData.roomPlanInnerStart;
      const end = segment.userData.roomPlanInnerEnd;
      return (start[1] + end[1]) / 2 >= cutLineZ - 0.000001;
    }));
    assert.equal(portal.children.some((child) => child.userData?.wallSide === 'east' && child.isMesh), false);
    assert.equal(portal.children.some((child) => child.userData?.wallSide === 'west' && child.isMesh), false);
    assert.equal(portal.children.some((child) => child.userData?.wallSide === 'south' && child.isMesh), false);
    assert.ok(portal.children.some((child) => ['north_sides', 'north_top'].includes(child.userData?.wallSide)));
    if (shape === 'octagon') {
      assert.equal(portal.userData.portalHalfVestibuleFootprint, true);
      assert.equal(
        portal.userData.roomPlanFootprintSource,
        'south-half-of-vestibule-eight-visible-karbandi-rib-feet',
      );
      assert.ok(new Set(
        portal.userData.portalHalfPlanVisibleSegmentLengths.map((length) => length.toFixed(4)),
      ).size > 2, 'the half Vestibule must retain its unequal short and long wall edges');
    }
  });
});

test('Portal Octagon Karbandi is the clipped half of the same unequal Vestibule bearing solution', () => {
  const building = normalizeBuilding({
    type: 'iwan',
    buildingType: 'portal',
    portalPlanShape: 'octagon',
    width: 6,
    iwanDepth: 3,
    height: 4,
  });
  const walls = portalDefaultWallSystem({
    ...DEFAULT_WALL_SYSTEM,
    bricks: { ...DEFAULT_WALL_SYSTEM.bricks, enabled: false },
  }, building);
  const portal = buildWallSystem(building, walls);
  const plan = portal.getObjectByName('Portal half-octagon floor-plan walls');
  const karbandiMeshes = [];
  portal.traverse((object) => {
    if (object.isMesh && object.userData?.portalHalfVestibuleKarbandi === true) karbandiMeshes.push(object);
  });

  assert.equal(portal.userData.portalHalfVestibuleKarbandi, true);
  assert.equal(portal.userData.portalKarbandiBearingPlan, 'south-half-of-vestibule-wall-foot-octagon');
  assert.equal(plan.children.length, 5);
  assert.ok(new Set(
    portal.userData.portalHalfPlanVisibleSegmentLengths.map((length) => length.toFixed(4)),
  ).size > 2);
  assert.equal(portal.userData.roomKarbandiWallSupportFootOctagon.length, 8);
  assert.ok(portal.userData.karbandiClosestWallLegs.every((leg) => leg.distance < 0.000001));
  assert.ok(karbandiMeshes.length > 0);
  assert.ok(karbandiMeshes.every((mesh) => {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    return materials.every((material) => material.clippingPlanes?.some((plane) => (
      plane.normal.z === 1
      && Math.abs(plane.constant + portal.userData.portalKarbandiHalfPlaneZ) < 0.000001
    )));
  }), 'every visible Karbandi mesh must be cut at the Portal facade plane');
  assert.deepEqual(
    portal.userData.roomPlanVertices.map(([x, z]) => [Number(x.toFixed(6)), Number(z.toFixed(6))]),
    portal.userData.roomKarbandiWallSupportFootOctagon.map(({ point: [x, , z] }) => [
      Number(x.toFixed(6)),
      Number(z.toFixed(6)),
    ]),
  );
});

test('Vestibule Karbandi ribs seat on its octagonal wall top and carry the transition cover', () => {
  const building = normalizeBuilding({
    type: 'vestibule',
    width: 6,
    length: 5,
    height: 4,
    domeTransition: 'squinch',
    domeTransitionCoverEnabled: true,
  });
  let walls = normalizeWallSystem({
    ...DEFAULT_WALL_SYSTEM,
    bricks: { ...DEFAULT_WALL_SYSTEM.bricks, enabled: false },
  }, building);
  const karbandiDesign = {
    ...walls.karbandi,
    enabled: true,
    coverEnabled: true,
    referenceRotation: 10,
  };
  const karbandi = {
    ...karbandiDesign,
    ...solveKarbandiWallSeating(karbandiDesign, building, walls),
    referenceRotation: 10,
  };
  walls = normalizeWallSystem({ ...walls, karbandi }, building);

  const vestibule = buildWallSystem(building, walls);
  const seatingGroups = [];
  const transitionParts = [];
  vestibule.traverse((object) => {
    if (object.userData?.karbandiLegBasesOnWallTop != null) seatingGroups.push(object);
    if (object.userData?.roomDomeTransitionType === 'karbandi') transitionParts.push(object);
  });

  assert.equal(vestibule.getObjectByName('Room octagon floor-plan walls')?.userData.roomPlanSideCount, 8);
  assert.equal(
    vestibule.userData.roomKarbandiBearingPlan,
    'vestibule-walls-follow-eight-visible-karbandi-rib-feet-on-square-reference-walls',
  );
  assert.equal(
    vestibule.userData.roomPlanFootprintSource,
    'eight-visible-karbandi-rib-feet-on-square-reference-walls',
  );
  assert.deepEqual(
    vestibule.userData.roomPlanVertices.map(([x, z]) => [Number(x.toFixed(6)), Number(z.toFixed(6))]),
    vestibule.userData.roomKarbandiWallSupportFootOctagon.map(({ point: [x, , z] }) => [
      Number(x.toFixed(6)),
      Number(z.toFixed(6)),
    ]),
  );
  assert.ok(new Set(
    vestibule.userData.roomPlanInteriorSegmentLengths.map((length) => length.toFixed(4)),
  ).size > 2, 'the Vestibule must preserve the unequal eight-sided footprint generated by its visible rib legs');
  assert.ok(seatingGroups.length > 0);
  assert.ok(seatingGroups.every((group) => group.userData.karbandiLegBasesOnWallTop === true));
  assert.ok(transitionParts.some((part) => part.userData.isKarbandi === true));
  assert.ok(transitionParts.some((part) => part.userData.isKarbandiCover === true));
  assert.equal(
    vestibule.userData.karbandiRoomRoofWallRule,
    'eight-octagonal-wall-edge-covers-bounded-by-adjacent-ribs',
  );
  assert.equal(vestibule.userData.karbandiCornerRoofExtrusions.length, 0,
    'the Vestibule must not reuse the square-room corner cover construction');
  assert.equal(vestibule.userData.karbandiVestibuleEdgeRoofExtrusions.length, 8);
  assert.deepEqual(vestibule.userData.karbandiVestibuleRibOccludedEdgeRoofIndexes, []);
  assert.deepEqual(vestibule.userData.karbandiVestibuleShortEdgeRoofClosureIndexes, [0, 4],
    'the two short corner edges need low closures for the wall-top gap, not full roof panels');
  assert.deepEqual(
    vestibule.userData.karbandiSpringingBoundary.map(({ side }) => side),
    Array.from({ length: 8 }, (_, index) => `vestibule-edge-${index}`),
  );
  const octagonalEdgeCovers = transitionParts.filter((part) => (
    part.userData.webPatchSolver === 'single-octagonal-wall-edge-ruled-cover'
  ));
  assert.equal(octagonalEdgeCovers.length, 8,
    'every octagonal wall edge must meet a cover, including low closures at the two short edges');
  octagonalEdgeCovers.forEach((cover) => {
    const edgeIndex = Number(cover.userData.webSupportSides[0].replace('vestibule-edge-', ''));
    assert.deepEqual(cover.userData.webSupportSides, [`vestibule-edge-${edgeIndex}`]);
    assert.equal(cover.userData.wallContinuationClippedByRibs, true);
    assert.equal(cover.userData.wallContinuationSeamlessAtWallTop, true);
    assert.equal(cover.userData.wallContinuationPatternSide, 'room_plan_interior');
    assert.equal(cover.userData.wallContinuationCourseAxis, 'world-y');
    assert.equal(
      cover.userData.ribInteriorEdgeClip,
      'soffit-on-inner-rib-edge-upper-skin-overlapped-behind-rib',
    );
    assert.equal(
      cover.userData.terminalThicknessClosure,
      'open-hidden-beneath-adjacent-rib-intersection',
    );
    assert.equal(cover.material.polygonOffset, true);
    assert.ok(cover.material.polygonOffsetFactor > 0);
    assert.ok(Math.abs(
      cover.userData.wallContinuationBondPhase
      - vestibule.userData.roomPlanInteriorSegmentStarts[edgeIndex]
    ) < 0.000001);
    assert.ok(Math.abs(
      cover.userData.wallContinuationBondCycle
      - vestibule.userData.roomPlanInteriorPerimeter
    ) < 0.000001);
    assert.equal(cover.userData.adjacentRibIds.length, 2);
    assert.equal(
      cover.userData.cornerRoofMethod,
      'single-octagonal-wall-edge-ruled-cover-clipped-under-two-adjacent-ribs',
    );
    assert.deepEqual(
      cover.userData.wallEdge.map(([x, , z]) => [Number(x.toFixed(6)), Number(z.toFixed(6))]),
      [
        vestibule.userData.roomPlanVertices[edgeIndex],
        vestibule.userData.roomPlanVertices[(edgeIndex + 1) % 8],
      ].map(([x, z]) => [Number(x.toFixed(6)), Number(z.toFixed(6))]),
    );
    const coverUvs = cover.geometry.getAttribute('uv');
    const edgeLength = vestibule.userData.roomPlanInteriorSegmentLengths[edgeIndex];
    assert.ok(coverUvs.getX(0) >= -0.000001 && coverUvs.getX(0) <= edgeLength + 0.000001);
    assert.ok(coverUvs.getX(1) >= coverUvs.getX(0) && coverUvs.getX(1) <= edgeLength + 0.000001);
    assert.ok(Math.abs(coverUvs.getY(0) - building.height) < 0.000001);
    assert.ok(Math.abs(coverUvs.getY(1) - building.height) < 0.000001);
    assert.equal(
      cover.geometry.userData.vestibuleWallBondUvMapping,
      'connected-wall-local-u-and-continuous-world-y-courses',
    );
    const edgeData = vestibule.userData.karbandiVestibuleEdgeRoofExtrusions.find((edge) => edge.edgeIndex === edgeIndex);
    assert.ok(edgeData.supportedWallSpan > 0.001);
    if ([0, 4].includes(edgeIndex)) {
      assert.equal(
        edgeData.terminalBoundaryMethod,
        'short-wall-gap-closure-stops-at-overlapping-inner-rib-contact-height',
      );
      assert.ok(Math.max(...edgeData.terminalBoundary.map(([, y]) => y)) < building.height + 0.7,
        'short-edge closure must stop below the unsupported upper triangular bay');
    } else {
      assert.notEqual(
        edgeData.terminalBoundaryMethod,
        'short-wall-gap-closure-stops-at-overlapping-inner-rib-contact-height',
      );
    }
    const coverTriangleCount = cover.geometry.getIndex().count / 3;
    assert.ok(
      coverTriangleCount <= (edgeData.startPoints.length - 1) * 8 + 2
        && coverTriangleCount < (edgeData.startPoints.length - 1) * 8 + 4,
      'the terminal thickness face must remain open behind the rib intersection',
    );
    const coverPositions = cover.geometry.getAttribute('position');
    const wallStart = new THREE.Vector3(...cover.userData.wallEdge[0]);
    const wallEnd = new THREE.Vector3(...cover.userData.wallEdge[1]);
    const wallDirection = wallEnd.clone().sub(wallStart).setY(0).normalize();
    const bottomStartU = new THREE.Vector3().fromBufferAttribute(coverPositions, 0)
      .sub(wallStart).dot(wallDirection);
    const bottomEndU = new THREE.Vector3().fromBufferAttribute(coverPositions, 1)
      .sub(wallStart).dot(wallDirection);
    const topStartU = new THREE.Vector3().fromBufferAttribute(coverPositions, 2)
      .sub(wallStart).dot(wallDirection);
    const topEndU = new THREE.Vector3().fromBufferAttribute(coverPositions, 3)
      .sub(wallStart).dot(wallDirection);
    assert.ok(topStartU < bottomStartU && topEndU > bottomEndU,
      'the upper cover skin must overlap behind both internal rib edges');
    assert.equal(cover.material.color.getHexString(), walls.color.slice(1));
  });
  assert.ok(vestibule.getObjectByName('Room circular dome cover'));
});

test('Octagon and Circle plans seed the requested default arched door', () => {
  const defaultDoor = createRoomPlanOpening('door', 'default-door');
  assert.deepEqual(defaultDoor, {
    id: 'default-door',
    type: 'door',
    rotation: 0,
    width: 1,
    height: 1.8,
    sillHeight: 0,
    head: 'arch',
    arch: {
      redOffset: -0.15,
      greenOffset: 0.55,
      greenHeight: 0.8,
      greenHeightOffset: -1,
    },
  });
  for (const roomPlanShape of ['octagon', 'circle']) {
    const seeded = roomPlanOpeningsWithDefaultDoor([], roomPlanShape, `${roomPlanShape}-door`);
    assert.equal(seeded.length, 1);
    assert.deepEqual(seeded[0], { ...defaultDoor, id: `${roomPlanShape}-door` });
  }
  assert.deepEqual(roomPlanOpeningsWithDefaultDoor([], 'polygon', 'unused'), []);
  assert.equal(roomPlanOpeningsWithDefaultDoor([defaultDoor], 'circle', 'unused')[0], defaultDoor);

  const normalized = normalizeWallSystem({ roomPlanOpenings: [{ id: 'normalized-door', type: 'door' }] }, normalizeBuilding({ type: 'room', roomPlanShape: 'octagon' }));
  assert.equal(normalized.roomPlanOpenings[0].rotation, 0);
  assert.equal(normalized.roomPlanOpenings[0].head, 'arch');
  assert.equal(normalized.roomPlanOpenings[0].width, 1);
  assert.equal(normalized.roomPlanOpenings[0].height, 1.8);
  assert.equal(normalized.roomPlanOpenings[0].arch.redOffset, -0.15);
  assert.equal(normalized.roomPlanOpenings[0].arch.greenOffset, 0.55);
  assert.equal(normalized.roomPlanOpenings[0].arch.greenHeight, 0.8);
});

test('Room exterior edge column settings default off and normalize their dimensions', () => {
  const defaults = normalizeBuilding({ type: 'room' });
  assert.equal(defaults.roomExteriorColumnsEnabled, false);
  assert.equal(defaults.roomExteriorColumnProfile, 'circle');
  assert.equal(defaults.roomExteriorColumnRadius, 0.2);
  assert.equal(defaults.roomExteriorSquareColumnRotation, 0);
  assert.equal(defaults.roomExteriorCircleColumnCount, 8);

  const clamped = normalizeBuilding({
    type: 'room',
    roomExteriorColumnsEnabled: true,
    roomExteriorColumnProfile: 'square',
    roomExteriorColumnRadius: 9,
    roomExteriorSquareColumnRotation: 900,
    roomExteriorCircleColumnCount: 100,
  });
  assert.equal(clamped.roomExteriorColumnsEnabled, true);
  assert.equal(clamped.roomExteriorColumnProfile, 'square');
  assert.equal(clamped.roomExteriorColumnRadius, 2);
  assert.equal(clamped.roomExteriorSquareColumnRotation, 360);
  assert.equal(clamped.roomExteriorCircleColumnCount, 64);
  assert.equal(normalizeBuilding({ type: 'room', roomExteriorColumnProfile: 'triangle' }).roomExteriorColumnProfile, 'circle');
});

test('Room exterior columns follow polygon vertices and Circle count on the exterior edge', () => {
  const wallsFor = (building) => normalizeWallSystem({
    ...DEFAULT_WALL_SYSTEM,
    bricks: { ...DEFAULT_WALL_SYSTEM.bricks, enabled: false },
  }, building);
  const hiddenBuilding = normalizeBuilding({ type: 'room', roomPlanShape: 'square' });
  assert.equal(buildWallSystem(hiddenBuilding, wallsFor(hiddenBuilding)).getObjectByName('Room exterior edge columns'), undefined);

  for (const [roomPlanShape, roomPolygonSides, expectedCount] of [
    ['square', 6, 4],
    ['octagon', 6, 8],
    ['polygon', 7, 7],
  ]) {
    const building = normalizeBuilding({
      type: 'room',
      roomPlanShape,
      roomPolygonSides,
      width: 8,
      length: 6,
      height: 4,
      roomExteriorColumnsEnabled: true,
      roomExteriorColumnRadius: 0.35,
    });
    const room = buildWallSystem(building, wallsFor(building));
    const columns = room.getObjectByName('Room exterior edge columns');
    assert.equal(columns.children.length, expectedCount);
    assert.equal(columns.userData.roomExteriorColumnRadius, 0.35);
    assert.ok(columns.children.every((column) => column.geometry.parameters.radiusTop === 0.35));
    assert.ok(columns.children.every((column) => column.geometry.parameters.height === 4));
    if (roomPlanShape === 'square') {
      assert.deepEqual(columns.children.map((column) => column.userData.roomExteriorColumnCenter), [
        [-4.4, -3.4],
        [4.4, -3.4],
        [4.4, 3.4],
        [-4.4, 3.4],
      ]);
    } else {
      assert.deepEqual(
        columns.children.map((column) => column.userData.roomExteriorColumnCenter),
        room.userData.roomPlanOuterVertices,
      );
    }
  }

  const circleBuilding = normalizeBuilding({
    type: 'room',
    roomPlanShape: 'circle',
    width: 8,
    length: 6,
    wallThickness: 0.4,
    roomExteriorColumnsEnabled: true,
    roomExteriorCircleColumnCount: 12,
  });
  const circleColumns = buildWallSystem(circleBuilding, wallsFor(circleBuilding))
    .getObjectByName('Room exterior edge columns');
  assert.equal(circleColumns.children.length, 12);
  const expectedExteriorRadius = 3 * Math.cos(Math.PI / 64) + 0.4;
  circleColumns.children.forEach((column) => {
    assert.ok(Math.abs(Math.hypot(column.position.x, column.position.z) - expectedExteriorRadius) < 0.000001);
  });

  const resizedCircle = normalizeBuilding({ ...circleBuilding, width: 10, length: 10 });
  const resizedColumn = buildWallSystem(resizedCircle, wallsFor(resizedCircle))
    .getObjectByName('Room exterior edge column 1');
  assert.ok(Math.abs(Math.hypot(resizedColumn.position.x, resizedColumn.position.z) - (5 * Math.cos(Math.PI / 64) + 0.4)) < 0.000001);
});

test('Room exterior columns continue the exterior wall brick bond and vertical courses', () => {
  const building = normalizeBuilding({
    type: 'room',
    roomPlanShape: 'octagon',
    width: 7,
    length: 6,
    height: 4.5,
    roomExteriorColumnsEnabled: true,
    roomExteriorColumnRadius: 0.2,
  });
  const walls = normalizeWallSystem({
    bricks: {
      ...DEFAULT_WALL_SYSTEM.bricks,
      sideBonds: {
        ...DEFAULT_WALL_SYSTEM.bricks.sideBonds,
        room_plan_exterior: { source: 'builtin', builtIn: 'stack', scale: 1 },
      },
    },
  }, building);
  const room = buildWallSystemWithCanvasMock(building, walls);
  const plan = room.getObjectByName('Room octagon floor-plan walls');
  const columns = room.getObjectByName('Room exterior edge columns');
  const exteriorMaterial = plan.children[0].material[1];

  assert.equal(columns.userData.roomExteriorBondCycle, plan.userData.roomPlanExteriorPerimeter);
  assert.equal(columns.userData.roomExteriorBondContinuity, 'shared-with-developed-exterior-wall-perimeter');
  assert.equal(exteriorMaterial.userData.brickBondSelection, 'stack');
  columns.children.forEach((column, index) => {
    assert.equal(column.material.userData.brickBondSide, 'room_plan_exterior');
    assert.equal(column.material.userData.brickBondSelection, exteriorMaterial.userData.brickBondSelection);
    assert.equal(column.material.map.repeat.x, exteriorMaterial.map.repeat.x);
    assert.equal(column.material.map.repeat.y, exteriorMaterial.map.repeat.y);
    assert.equal(column.userData.roomExteriorBondPhase, index * plan.userData.roomPlanExteriorSegmentLength);
    assert.equal(column.geometry.userData.roomExteriorColumnBondUvMapping, 'developed-cylinder-world-height-metres');
  });
});

test('Square exterior columns keep their size and rotate as a polar array from the north tangent reference', () => {
  const building = normalizeBuilding({
    type: 'room',
    roomPlanShape: 'circle',
    width: 7,
    length: 7,
    height: 4,
    roomExteriorColumnsEnabled: true,
    roomExteriorColumnProfile: 'square',
    roomExteriorColumnRadius: 0.3,
    roomExteriorSquareColumnRotation: 27,
    roomExteriorCircleColumnCount: 8,
  });
  const walls = normalizeWallSystem({
    ...DEFAULT_WALL_SYSTEM,
    bricks: { ...DEFAULT_WALL_SYSTEM.bricks, enabled: false },
    roomPlanOpenings: [],
  }, building);
  const room = buildWallSystem(building, walls);
  const columns = room.getObjectByName('Room exterior edge columns');

  assert.equal(columns.userData.roomExteriorColumnProfile, 'square');
  assert.equal(columns.userData.roomExteriorSquareColumnRotation, 27);
  assert.equal(columns.userData.roomExteriorSquareColumnRotationReference, 'north-column-relative-to-local-exterior-tangent');
  assert.equal(columns.children.length, 8);
  columns.children.forEach((column) => {
    assert.equal(column.geometry.type, 'BoxGeometry');
    assert.equal(column.geometry.parameters.width, 0.6);
    assert.equal(column.geometry.parameters.depth, 0.6);
    const [x, z] = column.userData.roomExteriorColumnCenter;
    assert.equal(column.position.x, x);
    assert.equal(column.position.z, z);
    const polarAngle = Math.atan2(z, x);
    const expectedRotation = THREE.MathUtils.degToRad(27) + Math.PI / 2 - polarAngle;
    assert.ok(Math.abs(column.rotation.y - expectedRotation) < 0.000001);
    assert.equal(column.userData.roomExteriorColumnProfile, 'square');
    assert.ok(Math.abs(column.userData.roomExteriorSquareColumnEffectiveRotation - THREE.MathUtils.radToDeg(expectedRotation)) < 0.000001);
    assert.equal(column.userData.roomExteriorSquareColumnRotationReference, 'north-column-relative-to-local-exterior-tangent');
    assert.equal(column.geometry.userData.roomExteriorColumnBondUvMapping, 'developed-square-perimeter-world-height-metres');
  });
  const northColumn = columns.children[0];
  assert.ok(Math.abs(northColumn.position.x) < 0.000001);
  assert.ok(northColumn.position.z > 0);
  assert.ok(Math.abs(northColumn.rotation.y - THREE.MathUtils.degToRad(27)) < 0.000001);
});

test('A radial door cuts through an overlapping rotated square exterior column', () => {
  const building = normalizeBuilding({
    type: 'room',
    roomPlanShape: 'octagon',
    width: 7,
    length: 7,
    height: 4,
    roomExteriorColumnsEnabled: true,
    roomExteriorColumnProfile: 'square',
    roomExteriorColumnRadius: 0.2,
    roomExteriorSquareColumnRotation: 45,
  });
  const door = {
    ...createRoomPlanOpening('door', 'column-door'),
    rotation: 202.5,
  };
  const walls = normalizeWallSystem({
    ...DEFAULT_WALL_SYSTEM,
    bricks: { ...DEFAULT_WALL_SYSTEM.bricks, enabled: false },
    roomPlanOpenings: [door],
  }, building);
  const columns = buildWallSystem(building, walls).getObjectByName('Room exterior edge columns');
  const cutColumnPieces = columns.children.filter((column) => column.userData.roomExteriorColumnIndex === 0);

  assert.ok(cutColumnPieces.length > 0);
  assert.ok(cutColumnPieces.every((column) => column.userData.roomExteriorColumnCutByOpeningIds.includes('column-door')));
  assert.ok(cutColumnPieces.every((column) => column.userData.roomExteriorColumnSegmentBaseY > 0));
  assert.equal(columns.userData.roomExteriorColumnOpeningPolicy, 'doors-and-windows-cut-through-overlapping-columns');
});

test('Octagon Room is inscribed in the room bounds and its Pyramid carries a matching octagonal drum', () => {
  const building = normalizeBuilding({
    type: 'room',
    roomPlanShape: 'octagon',
    width: 8,
    length: 6,
    height: 4,
    domeDrumHeight: 0.8,
    domeCoverType: 'pyramid',
  });
  const walls = normalizeWallSystem({
    ...DEFAULT_WALL_SYSTEM,
    bricks: { ...DEFAULT_WALL_SYSTEM.bricks, enabled: false },
  }, building);
  const room = buildWallSystemWithCanvasMock(building, walls);
  const plan = room.getObjectByName('Room octagon floor-plan walls');
  assert.equal(plan.children.filter((child) => child.userData?.isRoomWallBody).length, 8);
  assert.equal(room.userData.roomPlanDiameter, undefined);
  assert.equal(plan.userData.roomPlanDiameter, 6);
  assert.ok(room.userData.roomPlanVertices.every(([x, z]) => Math.abs(x) <= 3.000001 && Math.abs(z) <= 3.000001));
  assert.equal(room.children.filter((child) => child.userData?.isRoomDomeTransition).length, 0);
  const drum = room.getObjectByName('Room dome cylindrical drum');
  assert.equal(drum.userData.roomDomeDrumSideCount, 8);
  assert.equal(drum.userData.roomDomeDrumBaseY, 4);
  const roomInteriorApothem = 3 * Math.cos(Math.PI / 8);
  assert.ok(Math.abs(drum.geometry.userData.roomDomeDrumInnerApothem - roomInteriorApothem) < 0.000001);
  assert.equal(drum.userData.roomDomeDrumInteriorAlignment, 'flush-with-room-wall-interior-face');
  plan.children.forEach((segment, index) => {
    const next = plan.children[(index + 1) % plan.children.length];
    assert.deepEqual(segment.userData.roomPlanInnerEnd, next.userData.roomPlanInnerStart);
    assert.deepEqual(segment.userData.roomPlanOuterEnd, next.userData.roomPlanOuterStart);
  });
});

test('Circle and custom polygon Rooms use bounded regular walls and matching direct drums', () => {
  for (const [roomPlanShape, roomPolygonSides, expectedWalls, expectedDrumSides] of [
    ['circle', 6, 64, 64],
    ['polygon', 7, 7, 14],
  ]) {
    const building = normalizeBuilding({
      type: 'room',
      roomPlanShape,
      roomPolygonSides,
      width: 5,
      length: 9,
      height: 3.5,
      domeDrumHeight: 0.4,
      domeCoverType: 'cone',
    });
    const walls = normalizeWallSystem({
      ...DEFAULT_WALL_SYSTEM,
      bricks: { ...DEFAULT_WALL_SYSTEM.bricks, enabled: false },
    }, building);
    const room = buildWallSystemWithCanvasMock(building, walls);
    const plan = room.getObjectByName(`Room ${roomPlanShape} floor-plan walls`);
    assert.equal(plan.children.filter((child) => child.userData?.isRoomWallBody).length, expectedWalls);
    assert.equal(plan.userData.roomPlanDiameter, 5);
    assert.equal(room.getObjectByName('Room dome cylindrical drum').userData.roomDomeDrumSideCount, expectedDrumSides);
    plan.children.forEach((segment, index) => {
      const next = plan.children[(index + 1) % plan.children.length];
      assert.deepEqual(segment.userData.roomPlanInnerEnd, next.userData.roomPlanInnerStart);
      assert.deepEqual(segment.userData.roomPlanOuterEnd, next.userData.roomPlanOuterStart);
    });
  }
});

test('Direct-bearing Pyramid drums and cavity supports follow the room polygon sides', () => {
  for (const [roomPlanShape, roomPolygonSides, expectedSides] of [
    ['octagon', 8, 8],
    ['polygon', 5, 5],
    ['polygon', 11, 11],
  ]) {
    const building = normalizeBuilding({
      type: 'room',
      roomPlanShape,
      roomPolygonSides,
      width: 7,
      length: 6,
      height: 4,
      domeDrumHeight: 0.7,
      domeCoverType: 'pyramid',
      domeCoverHeight: 6.2,
      innerDomeEnabled: true,
    });
    const room = buildWallSystem(building, normalizeWallSystem({
      bricks: { ...DEFAULT_WALL_SYSTEM.bricks, enabled: false },
    }, building));
    const drum = room.getObjectByName('Room dome cylindrical drum');
    const cover = room.getObjectByName('Room circular dome cover');
    const supports = room.getObjectByName('Between domes supporting walls');
    assert.equal(drum.userData.roomDomeDrumSideCount, expectedSides);
    assert.equal(drum.geometry.parameters.segments, expectedSides);
    assert.equal(cover.userData.roomDomePlanSides, expectedSides);
    assert.equal(supports.userData.betweenDomeSupportWallCount, expectedSides);
    assert.equal(supports.children.length, expectedSides);
    supports.children.forEach((support, index) => {
      assert.ok(Math.abs(support.rotation.y + index * Math.PI * 2 / expectedSides) < 0.000001);
    });
  }
});

test('Cone and Pyramid cavity supports resize from the current cover profile and keep vertical brick axes', () => {
  const makeSupports = (domeCoverType, domeCoverHeight, legExtension = 0.4) => {
    const building = normalizeBuilding({
      type: 'room',
      roomPlanShape: 'octagon',
      width: 6,
      length: 6,
      height: 4,
      domeDrumHeight: 0.6,
      domeCoverType,
      domeCoverHeight,
      domeArch: { legExtension },
      innerDomeEnabled: true,
    });
    return buildWallSystemWithCanvasMock(building, normalizeWallSystem({}, building))
      .getObjectByName('Between domes supporting walls');
  };

  for (const domeCoverType of ['cone', 'pyramid']) {
    const lowSupports = makeSupports(domeCoverType, 6.5);
    const tallSupports = makeSupports(domeCoverType, 9);
    assert.ok(lowSupports && tallSupports);
    const lowGeometry = lowSupports.children[0].geometry;
    const tallGeometry = tallSupports.children[0].geometry;
    assert.ok(
      tallGeometry.userData.betweenDomeSupportWallTopY
        > lowGeometry.userData.betweenDomeSupportWallTopY,
      `${domeCoverType} support walls must grow when the outer cover grows`,
    );
    assert.equal(
      tallSupports.userData.betweenDomeSupportWallSizing,
      'sampled-from-current-inner-dome-and-outer-cover-profiles',
    );
    assert.equal(
      tallSupports.children[0].material.userData.betweenDomeSupportWallTextureAxes,
      'radial-horizontal-by-world-y-vertical',
    );
    const bearingEmbed = tallGeometry.userData.betweenDomeSupportWallBearingEmbed;
    const outerClipInset = tallGeometry.userData.betweenDomeSupportWallOuterClipInset;
    assert.ok(bearingEmbed >= 0.01);
    assert.ok(
      tallGeometry.userData.betweenDomeSupportWallBottomY
        <= Math.min(...tallGeometry.userData.betweenDomeSupportWallInnerContactY) - bearingEmbed + 0.000001,
      `${domeCoverType} support walls must overlap the inner dome instead of stopping above it`,
    );
    assert.ok(
      tallGeometry.userData.betweenDomeSupportWallTopY
        <= Math.max(...tallGeometry.userData.betweenDomeSupportWallOuterContactY) - outerClipInset + 0.000001,
      `${domeCoverType} support walls must remain clipped under the outer cover interior`,
    );
    assert.equal(
      tallSupports.children[0].userData.betweenDomeSupportWallConnection,
      'lower-bearing-embed-with-upper-interior-surface-clip',
    );
    assert.ok(outerClipInset >= 0.0001);
    assert.ok(tallGeometry.userData.betweenDomeSupportWallOuterSampleRadius.every((radius, index) => (
      radius >= tallGeometry.userData.betweenDomeSupportWallRadius[index] - 0.000001
    )), `${domeCoverType} clip sampling must include the complete support prism`);
    if (domeCoverType === 'pyramid') {
      assert.equal(tallGeometry.userData.betweenDomeSupportWallOuterPlanSides, 8);
      assert.ok(Math.abs(
        tallGeometry.userData.betweenDomeSupportWallOuterFaceApothemScale - Math.cos(Math.PI / 8)
      ) < 0.000001);
    }

    const noLegGeometry = makeSupports(domeCoverType, 9, 0).children[0].geometry;
    const twoMetreLegGeometry = makeSupports(domeCoverType, 9, 2).children[0].geometry;
    const noLegContacts = noLegGeometry.userData.betweenDomeSupportWallOuterContactY;
    const raisedContacts = twoMetreLegGeometry.userData.betweenDomeSupportWallOuterContactY;
    assert.equal(raisedContacts.length, noLegContacts.length);
    raisedContacts.forEach((height, index) => {
      assert.ok(Math.abs(height - noLegContacts[index] - 2) < 0.03,
        `${domeCoverType} support contact must rise by the complete Outer vertical leg value`);
    });
    assert.equal(twoMetreLegGeometry.userData.betweenDomeSupportWallBoundary,
      'embedded-into-inner-dome-and-clipped-under-outer-cover-interior');
    assert.equal(makeSupports(domeCoverType, 9, 2).userData.betweenDomeSupportWallOuterLegExtension, 2);
  }
});

test('Direct-bearing Room drum and dome radii update from the current room size', () => {
  const buildCircle = (size) => {
    const building = normalizeBuilding({
      type: 'room',
      roomPlanShape: 'circle',
      width: size,
      length: size,
      domeDrumHeight: 0.5,
    });
    const walls = normalizeWallSystem({
      ...DEFAULT_WALL_SYSTEM,
      bricks: { ...DEFAULT_WALL_SYSTEM.bricks, enabled: false },
    }, building);
    return buildWallSystemWithCanvasMock(building, walls);
  };
  const small = buildCircle(4);
  const large = buildCircle(10);
  const smallDome = small.getObjectByName('Room circular dome cover');
  const largeDome = large.getObjectByName('Room circular dome cover');
  const smallDrum = small.getObjectByName('Room dome cylindrical drum');
  const largeDrum = large.getObjectByName('Room dome cylindrical drum');
  assert.ok(Math.abs(smallDrum.geometry.userData.roomDomeDrumInnerApothem - 2) < 0.000001);
  assert.ok(Math.abs(largeDrum.geometry.userData.roomDomeDrumInnerApothem - 5) < 0.000001);
  assert.equal(smallDome.userData.roomDomeRadius, smallDrum.geometry.userData.roomDomeDrumOuterApothem);
  assert.equal(largeDome.userData.roomDomeRadius, largeDrum.geometry.userData.roomDomeDrumOuterApothem);
  assert.ok(largeDome.userData.roomDomeRadius > smallDome.userData.roomDomeRadius);
  assert.ok(largeDrum.geometry.userData.roomDomeDrumOuterRadius > smallDrum.geometry.userData.roomDomeDrumOuterRadius);
});

test('Regular-plan Room bonds close seamlessly around interior and exterior faces', () => {
  const building = normalizeBuilding({
    type: 'room',
    roomPlanShape: 'octagon',
    width: 7,
    length: 7,
    domeEnabled: false,
  });
  const walls = normalizeWallSystem({
    ...DEFAULT_WALL_SYSTEM,
    stoneBase: { ...DEFAULT_WALL_SYSTEM.stoneBase, enabled: false },
    bricks: {
      ...DEFAULT_WALL_SYSTEM.bricks,
      sideBonds: {
        ...DEFAULT_WALL_SYSTEM.bricks.sideBonds,
        room_plan_interior: { source: 'builtin', builtIn: 'stack' },
        room_plan_exterior: { source: 'builtin', builtIn: 'flemish' },
      },
    },
  }, building);
  const room = buildWallSystemWithCanvasMock(building, walls);
  const plan = room.getObjectByName('Room octagon floor-plan walls');
  const nearInteger = (value) => Math.abs(value - Math.round(value)) < 0.000001;

  plan.children.forEach((segment, index) => {
    const next = plan.children[(index + 1) % plan.children.length];
    const interior = segment.material[segment.userData.roomWallInteriorMaterialIndex];
    const exterior = segment.material[segment.userData.roomWallExteriorMaterialIndex];
    const nextInterior = next.material[next.userData.roomWallInteriorMaterialIndex];
    const nextExterior = next.material[next.userData.roomWallExteriorMaterialIndex];
    const interiorLength = segment.userData.roomPlanInnerStart
      ? new THREE.Vector2(...segment.userData.roomPlanInnerStart).distanceTo(new THREE.Vector2(...segment.userData.roomPlanInnerEnd))
      : 0;
    const exteriorLength = new THREE.Vector2(...segment.userData.roomPlanOuterStart)
      .distanceTo(new THREE.Vector2(...segment.userData.roomPlanOuterEnd));
    assert.equal(segment.geometry.userData.roomPlanBondUvMapping, 'developed-continuous-interior-and-exterior-perimeters');
    assert.equal(segment.userData.roomWallHasSeamlessInteriorBond, true);
    assert.equal(segment.userData.roomWallHasSeamlessExteriorBond, true);
    assert.equal(segment.userData.roomPlanInteriorSurface, 'room_plan_interior');
    assert.equal(segment.userData.roomPlanExteriorSurface, 'room_plan_exterior');
    assert.equal(segment.userData.roomPlanSurfacePolicy, 'one-continuous-interior-face-and-one-continuous-exterior-face');
    assert.equal(interior.userData.brickBondSide, 'room_plan_interior');
    assert.equal(exterior.userData.brickBondSide, 'room_plan_exterior');
    assert.equal(interior.userData.brickBondSelection, 'stack');
    assert.equal(exterior.userData.brickBondSelection, 'flemish');
    assert.ok(nearInteger(interior.map.offset.x + interiorLength * interior.map.repeat.x - nextInterior.map.offset.x));
    assert.ok(nearInteger(exterior.map.offset.x + exteriorLength * exterior.map.repeat.x - nextExterior.map.offset.x));
  });

  const availableSurfaces = buildingSurfaces(building);
  assert.deepEqual(availableSurfaces.map((surface) => surface.id), [
    'room_plan_interior',
    'room_plan_exterior',
    'floor',
  ]);
  plan.updateMatrixWorld(true);
  const interiorHit = new THREE.Raycaster(
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, 0, -1),
  ).intersectObjects(plan.children, false)[0];
  const exteriorHit = new THREE.Raycaster(
    new THREE.Vector3(0, 1, -10),
    new THREE.Vector3(0, 0, 1),
  ).intersectObjects(plan.children, false)[0];
  const scene = Object.create(MehrazScene.prototype);
  scene.building = building;
  assert.equal(scene.wallSideForHit(interiorHit), 'room_plan_interior');
  assert.equal(scene.wallSideForHit(exteriorHit), 'room_plan_exterior');
});

test('Regular-plan doors and windows cut the wall and rotate around the room perimeter', () => {
  const buildOpenedRoom = (roomPlanOpenings) => {
    const building = normalizeBuilding({
      type: 'room',
      roomPlanShape: 'octagon',
      width: 7,
      length: 7,
      height: 4,
      domeEnabled: false,
    });
    const walls = normalizeWallSystem({
      ...DEFAULT_WALL_SYSTEM,
      roomPlanOpenings,
      bricks: { ...DEFAULT_WALL_SYSTEM.bricks, enabled: false },
    }, building);
    return buildWallSystemWithCanvasMock(building, walls).getObjectByName('Room octagon floor-plan walls');
  };
  const hitsFromCenter = (plan, direction, y) => new THREE.Raycaster(
    new THREE.Vector3(0, y, 0),
    new THREE.Vector3(...direction).normalize(),
  ).intersectObjects(plan.children, false);

  const northDoor = buildOpenedRoom([{ id: 'door-1', type: 'door', rotation: 0, width: 1.4, height: 2.2 }]);
  assert.equal(hitsFromCenter(northDoor, [0, 0, -1], 1).length, 0);
  assert.ok(hitsFromCenter(northDoor, [0, 0, -1], 3).length > 0);
  assert.ok(hitsFromCenter(northDoor, [1, 0, 0], 1).length > 0);

  const eastDoor = buildOpenedRoom([{ id: 'door-1', type: 'door', rotation: 90, width: 1.4, height: 2.2 }]);
  assert.equal(hitsFromCenter(eastDoor, [1, 0, 0], 1).length, 0);
  assert.ok(hitsFromCenter(eastDoor, [0, 0, -1], 1).length > 0);

  const southWindow = buildOpenedRoom([{ id: 'window-1', type: 'window', rotation: 180, width: 1.4, height: 1.2, sillHeight: 1.1 }]);
  assert.ok(hitsFromCenter(southWindow, [0, 0, 1], 0.6).length > 0);
  assert.equal(hitsFromCenter(southWindow, [0, 0, 1], 1.5).length, 0);
  assert.ok(hitsFromCenter(southWindow, [0, 0, 1], 3).length > 0);
});

test('Octagon and Circle Room openings use their saved four-centre arch instead of a lintel cut', () => {
  for (const roomPlanShape of ['octagon', 'circle']) {
    const building = normalizeBuilding({
      type: 'room',
      roomPlanShape,
      width: 7,
      length: 7,
      height: 4,
      domeEnabled: false,
    });
    const walls = normalizeWallSystem({
      roomPlanOpenings: [{
        id: `${roomPlanShape}-arch-door`,
        type: 'door',
        rotation: 0,
        width: 1.4,
        height: 2.2,
        head: 'arch',
        arch: { redOffset: -0.45, greenOffset: 1.05, greenHeight: 1 },
      }],
      bricks: { ...DEFAULT_WALL_SYSTEM.bricks, enabled: false },
    }, building);
    const opening = walls.roomPlanOpenings[0];
    assert.equal(opening.head, 'arch');
    assert.equal(opening.arch.redOffset, -0.45);
    assert.equal(opening.arch.greenOffset, 1.05);
    assert.equal(opening.arch.greenHeight, 1);

    const plan = buildWallSystemWithCanvasMock(building, walls)
      .getObjectByName(`Room ${roomPlanShape} floor-plan walls`);
    const northHits = (x, y) => new THREE.Raycaster(
      new THREE.Vector3(x, y, 0),
      new THREE.Vector3(0, 0, -1),
    ).intersectObjects(plan.children, false);
    assert.equal(northHits(0, 2.5).length, 0, 'the arch crown must remain open above its spring line');
    assert.ok(northHits(0.6, 2.5).length > 0, 'masonry beside the curved arch head must remain solid');
    assert.ok(plan.children.some((segment) => segment.geometry.userData.roomPlanOpeningCutouts
      .some((cutout) => cutout.head === 'arch' && cutout.archPoints.length > 2)));

    const windowWalls = normalizeWallSystem({
      roomPlanOpenings: [{
        id: `${roomPlanShape}-arch-window`,
        type: 'window',
        rotation: 0,
        width: 1.4,
        height: 1,
        sillHeight: 1,
        head: 'arch',
        arch: { redOffset: -0.25, greenOffset: 0.75, greenHeight: 0.8 },
      }],
      bricks: { ...DEFAULT_WALL_SYSTEM.bricks, enabled: false },
    }, building);
    const windowPlan = buildWallSystemWithCanvasMock(building, windowWalls)
      .getObjectByName(`Room ${roomPlanShape} floor-plan walls`);
    const windowHits = (y) => new THREE.Raycaster(
      new THREE.Vector3(0, y, 0),
      new THREE.Vector3(0, 0, -1),
    ).intersectObjects(windowPlan.children, false);
    assert.ok(windowHits(0.5).length > 0, 'wall masonry must remain below an arched window sill');
    assert.equal(windowHits(2.3).length, 0, 'the arched window crown must remain open above its spring line');
  }
});

test('a selected radial Room opening shows red and green circles, centers, arcs, and radii', () => {
  const building = normalizeBuilding({
    type: 'room',
    roomPlanShape: 'circle',
    width: 7,
    length: 7,
    height: 4,
    domeEnabled: false,
  });
  const walls = normalizeWallSystem({
    roomPlanOpenings: [{
      id: 'guided-circle-window',
      type: 'window',
      rotation: 0,
      width: 1.4,
      height: 1,
      sillHeight: 1,
      head: 'arch',
      arch: { redOffset: -0.25, greenOffset: 0.75, greenHeight: 0.8 },
    }],
    bricks: { ...DEFAULT_WALL_SYSTEM.bricks, enabled: false },
  }, building);
  const scene = Object.create(MehrazScene.prototype);
  scene.building = building;
  scene.walls = walls;
  scene.buildingGroup = new THREE.Group();
  scene.buildingGroup.add(buildWallSystemWithCanvasMock(building, walls));
  scene.selectedOpeningGuide = 'plan:guided-circle-window';
  const root = new THREE.Group();
  scene.addRoomPlanOpeningConstructionGuide(root);
  root.updateMatrixWorld(true);

  const guide = root.getObjectByName(
    'Room plan window guided-circle-window arch symmetric red and green construction circles and radii',
  );
  assert.ok(guide);
  assert.equal(guide.userData.roomPlanOpeningId, 'guided-circle-window');
  assert.equal(guide.userData.openingHostSurface, 'circle-wall');
  assert.ok(Math.abs(guide.userData.openingHostCenterWorld[0]) < 0.01);
  assert.ok(guide.userData.openingHostCenterWorld[2] < 0);
  assert.equal(guide.children.filter((child) => child.userData.archConstructionRole === 'red-center').length, 2);
  assert.equal(guide.children.filter((child) => child.userData.archConstructionRole === 'green-center').length, 2);
  assert.equal(guide.children.filter((child) => child.userData.archConstructionRole === 'red-circle').length, 2);
  assert.equal(guide.children.filter((child) => child.userData.archConstructionRole === 'green-circle').length, 2);
  assert.equal(guide.children.filter((child) => child.name.includes('radius')).length, 6);
  assert.equal(guide.children.filter((child) => child.name.includes('arch construction segment')).length, 4);
});

test('Ahang brick courses keep physical height while bending symmetrically to the crown', () => {
  const arch = [
    new THREE.Vector2(-2, 4),
    new THREE.Vector2(-1, 5),
    new THREE.Vector2(0, 6),
    new THREE.Vector2(1, 5),
    new THREE.Vector2(2, 4),
  ];
  assert.equal(archCourseDistanceAtPoint(-2, 4, arch), 0);
  assert.equal(archCourseDistanceAtPoint(2, 4, arch), 0);
  assert.ok(Math.abs(archCourseDistanceAtPoint(0, 6, arch) - Math.sqrt(8)) < 1e-9);
  assert.ok(Math.abs(archCourseDistanceAtPoint(-1, 5, arch) - archCourseDistanceAtPoint(1, 5, arch)) < 1e-9);
});

test('construction remains cumulative through the guide, south wall, and arch steps', () => {
  const scene = constructionScene();
  const stepIndex = (id) => CONSTRUCTION_STEPS.findIndex((step) => step.id === id);

  scene.applyConstructionStep(stepIndex('lower-walls'), 0.5);
  scene.applyConstructionStep(stepIndex('lower-walls'), 0.6);
  assert.equal(scene.shadowInvalidations.filter(Boolean).length, 1,
    'construction frames within one step must not rebuild the shadow map continuously');
  scene.applyConstructionStep(stepIndex('lower-walls'), 1);
  assert.equal(scene.shadowInvalidations.filter(Boolean).length, 2,
    'the completed construction step must refresh its final shadow once');
  assert.equal(visibleStructuralMeshes(scene, 'east').length, 1);
  assert.equal(visibleStructuralMeshes(scene, 'west').length, 1);
  assert.equal(visibleStructuralMeshes(scene, 'south').length, 1);
  assert.equal(visibleStructuralMeshes(scene, 'south_arch').length, 0);

  scene.applyConstructionStep(stepIndex('south-arch-guide'), 1);
  assert.equal(scene.constructionGuideGroup.children.length, 1);
  const southGuide = scene.constructionGuideGroup.children[0];
  assert.equal(southGuide.userData.constructionGuideEnd, 'south');

  scene.applyConstructionStep(stepIndex('north-arch-guide'), 1);
  assert.equal(visibleStructuralMeshes(scene, 'east').length, 1);
  assert.equal(visibleStructuralMeshes(scene, 'west').length, 1);
  assert.equal(visibleStructuralMeshes(scene, 'south').length, 1);
  assert.equal(visibleStructuralMeshes(scene, 'south_arch').length, 0);
  assert.equal(scene.constructionGuideGroup.children.length, 2);
  const northGuide = scene.constructionGuideGroup.children.find((guide) => guide.userData.constructionGuideEnd === 'north');
  const archMesh = scene.wallSystemRoot().children.find((child) => child.userData?.isPointedArch);
  const currentSouthGuide = scene.constructionGuideGroup.children.find((guide) => guide.userData.constructionGuideEnd === 'south');
  const southGuideBounds = new THREE.Box3().setFromObject(currentSouthGuide);
  const northGuideBounds = new THREE.Box3().setFromObject(northGuide);
  const archBounds = new THREE.Box3().setFromObject(archMesh);
  assert.ok(Math.abs(southGuideBounds.max.z - (archBounds.max.z + scene.building.wallThickness)) < 0.000001, 'south guide must shift through the wall thickness to the south wall outer face');
  assert.ok(Math.abs(northGuideBounds.min.z - (archBounds.min.z - scene.building.wallThickness)) < 0.000001, 'north guide must shift through the wall thickness to the north wall outer face');
  assert.ok(Math.abs((southGuideBounds.max.z - southGuideBounds.min.z) - scene.building.wallThickness) < 0.000001, 'south guide depth must equal the wall thickness');
  assert.ok(Math.abs((northGuideBounds.max.z - northGuideBounds.min.z) - scene.building.wallThickness) < 0.000001, 'north guide depth must equal the wall thickness');
  assert.equal(currentSouthGuide.userData.wallThicknessOffset, scene.building.wallThickness);
  assert.equal(northGuide.userData.wallThicknessOffset, -scene.building.wallThickness);
  assert.equal(currentSouthGuide.userData.guideArchThickness, scene.building.wallThickness);
  assert.equal(northGuide.userData.guideArchThickness, scene.building.wallThickness);
  assert.ok(northGuideBounds.max.z < southGuideBounds.min.z, 'the arch cover must have space between both guide ribs');
  const guides = [...scene.constructionGuideGroup.children];
  scene.applyConstructionStep(stepIndex('north-arch-guide'), 1);
  assert.deepEqual(scene.constructionGuideGroup.children, guides, 'static guides should be reused between animation frames');

  scene.applyConstructionStep(stepIndex('south-wall'), 1);
  assert.equal(visibleStructuralMeshes(scene, 'east').length, 1);
  assert.equal(visibleStructuralMeshes(scene, 'west').length, 1);
  assert.equal(visibleStructuralMeshes(scene, 'south').length, 1);
  assert.equal(visibleStructuralMeshes(scene, 'south_arch').length, 1);
  assert.equal(scene.constructionGuideGroup.children.length, 2);

  scene.applyConstructionStep(stepIndex('arch-fill'), 1);
  assert.equal(visibleStructuralMeshes(scene, 'east').length, 1);
  assert.equal(visibleStructuralMeshes(scene, 'west').length, 1);
  assert.equal(visibleStructuralMeshes(scene, 'south').length, 1);
  assert.equal(visibleStructuralMeshes(scene, 'south_arch').length, 1);
  assert.ok(visibleStructuralMeshes(scene, 'arch').length > 0);

  scene.applyConstructionStep(stepIndex('north-upper-wall'), 0.5);
  assert.equal(scene.constructionGuideGroup.children.length, 1, 'Ahang also retains only the north guide while the upper wall builds');
  assert.equal(scene.constructionGuideGroup.children[0].userData.isNorthWallArchGuide, true);
  const northArchParts = scene.wallSystemRoot().children.filter((child) => (
    child.userData?.isNorthRaisedArchRing || child.userData?.isNorthCurveBorderBrick
  ));
  assert.ok(northArchParts.length > 0);
  assert.ok(northArchParts.every((child) => !child.visible), 'Ahang must not animate a duplicate north guide arch');
});

test('construction animation omits wall-decoration steps that have no decoration', () => {
  const scene = constructionScene();
  const decorationSteps = CONSTRUCTION_STEPS.filter((step) => step.id.startsWith('decorate-'));
  assert.ok(decorationSteps.every((step) => scene.hasConstructionStepContent(step.id) === false));

  const eastDecoration = new THREE.Object3D();
  eastDecoration.userData.isBrickFace = true;
  eastDecoration.userData.wallSide = 'east';
  scene.wallSystemRoot().add(eastDecoration);
  assert.equal(scene.hasConstructionStepContent('decorate-east'), true);
  assert.equal(scene.hasConstructionStepContent('decorate-west'), false);
});

test('construction playback keeps orbit and editing enabled without recompiling unchanged reveal materials', () => {
  const scene = constructionScene();
  scene.controls = {
    enabled: false,
    state: 0,
    _pointers: [17],
    _pointerPositions: { 17: { x: 10, y: 20 } },
  };
  scene.transformControls = { enabled: false, dragging: false };
  scene.renderer = { domElement: { style: { pointerEvents: 'none' } } };
  scene.nightLightDrag = null;
  scene.transformHandleActive = false;
  assert.equal(scene.ensureConstructionInteractionAvailable(), true);
  assert.equal(scene.controls.enabled, true);
  assert.equal(scene.transformControls.enabled, true);
  assert.equal(scene.renderer.domElement.style.pointerEvents, 'auto');

  scene.transformControls.dragging = true;
  assert.equal(scene.ensureConstructionInteractionAvailable(), false,
    'orbit may pause only while the transform handle itself is being dragged');
  assert.equal(scene.transformControls.enabled, true, 'model editing must stay enabled during construction');
  scene.transformHandleActive = true;
  scene.nightLightDrag = { id: 'stale-light-drag' };
  assert.equal(scene.ensureConstructionInteractionAvailable(true), true,
    'finishing construction must force-release every stale drag lock');
  assert.equal(scene.transformControls.dragging, false);
  assert.equal(scene.transformControls.axis, null);
  assert.equal(scene.transformHandleActive, false);
  assert.equal(scene.nightLightDrag, null);
  assert.equal(scene.controls.enabled, true);
  assert.equal(scene.controls.state, -1);
  assert.deepEqual(scene.controls._pointers, []);
  assert.deepEqual(scene.controls._pointerPositions, {});

  const wall = scene.wallSystemRoot().children.find((child) => child.isMesh && child.userData?.wallSide === 'east');
  scene.setConstructionClip(wall, 0.25, 'y');
  const constructionMaterial = Array.isArray(wall.material) ? wall.material[0] : wall.material;
  const materialVersion = constructionMaterial.version;
  const revealPlane = constructionMaterial.userData.constructionRevealPlane;
  scene.setConstructionClip(wall, 0.5, 'y');
  assert.equal(constructionMaterial.version, materialVersion,
    'advancing an existing construction plane must not trigger shader recompilation every frame');
  assert.equal(constructionMaterial.userData.constructionRevealPlane, revealPlane);
  assert.notEqual(revealPlane.constant, 0);
});

test('construction playback applies the complete snapshot once and releases interaction immediately', () => {
  const scene = Object.create(MehrazScene.prototype);
  scene.constructionTimer = null;
  scene.constructionAnimationFrame = null;
  scene.restoreConstructionMaterials = () => { scene.restoreCount = (scene.restoreCount || 0) + 1; };
  scene.ensureConstructionInteractionAvailable = (forceRelease = false) => {
    if (forceRelease) scene.released = true;
    return true;
  };
  scene.hasConstructionStepContent = (id) => id === 'complete';
  scene.applyConstructionStep = (index, progress) => {
    scene.applied = [...(scene.applied || []), { index, progress }];
  };
  let done = 0;
  scene.playConstructionSequence(15, null, () => { done += 1; });
  assert.deepEqual(scene.applied, [{ index: CONSTRUCTION_STEPS.length - 1, progress: 1 }]);
  assert.equal(scene.released, true);
  assert.equal(scene.constructionAnimationFrame, null);
  assert.equal(done, 1);
});

test('Karbandi construction builds the north guide arch before clipped ribs and finishes the north wall afterward', () => {
  const scene = karbandiConstructionScene();
  const stepIndex = (id) => CONSTRUCTION_STEPS.findIndex((step) => step.id === id);
  const ribMeshes = () => scene.wallSystemRoot().children.filter((child) => child.isMesh && child.userData?.isKarbandi);
  const coverMeshes = () => scene.wallSystemRoot().children.filter((child) => child.isMesh && child.userData?.isKarbandiCover);
  const visible = (items) => items.filter((item) => item.visible);
  const ribs = ribMeshes();
  const covers = coverMeshes();
  const referenceRib = ribs.find((rib) => rib.userData.isKarbandiReference);
  const supportRib = ribs.find((rib) => (
    rib.userData.isKarbandiClosestWallSupport && !rib.userData.isKarbandiReference
  ));

  assert.ok(ribs.length > 2);
  assert.ok(covers.length > 0);
  assert.ok(referenceRib && supportRib);
  assert.equal(scene.wallSystemRoot().children.some((child) => (
    child.userData?.isKarbandiReferenceHighlight || child.userData?.isKarbandiWallSupportHighlight
  )), false, 'Karbandi highlighting must use clipped mesh colors, never line outlines');
  const normalRibColor = new THREE.Color(scene.walls.karbandi.ribColor).getHex();
  assert.equal(referenceRib.material.color.getHex(), normalRibColor);
  assert.equal(supportRib.material.color.getHex(), normalRibColor);
  scene.setKarbandiReferenceEditing(true);
  assert.equal(referenceRib.material.color.getHexString(), scene.walls.karbandi.referenceRibColor.slice(1));
  assert.equal(supportRib.material.color.getHexString(), 'ff6b35');
  assert.ok(supportRib.material.clippingPlanes.length > 0, 'mesh-color highlighting must retain the rib clipping planes');
  scene.setKarbandiReferenceEditing(false);
  assert.equal(referenceRib.material.color.getHex(), normalRibColor);
  assert.equal(supportRib.material.color.getHex(), normalRibColor);
  assert.ok(ribs.some((rib) => rib.userData.karbandiPortalCuts.length > 0), 'generated construction ribs must retain portal clipping');
  assert.equal(scene.hasConstructionStepContent('south-arch-guide'), false);
  assert.equal(scene.hasConstructionStepContent('north-arch-guide'), true);
  assert.equal(scene.hasConstructionStepContent('arch-fill'), false);
  assert.ok(stepIndex('north-arch-guide') < stepIndex('karbandi-reference-rib'));
  assert.ok(stepIndex('karbandi-roof') < stepIndex('north-upper-wall'));

  scene.applyConstructionStep(stepIndex('lower-walls'), 1);
  assert.equal(visible(ribs).length, 0);
  assert.equal(visible(covers).length, 0);

  scene.applyConstructionStep(stepIndex('north-arch-guide'), 1);
  assert.equal(scene.constructionGuideGroup.children.length, 1);
  const northGuide = scene.constructionGuideGroup.children[0];
  assert.equal(northGuide.userData.isKarbandiNorthArchGuide, true);
  assert.equal(northGuide.userData.constructionGuideEnd, 'north');
  assert.equal(northGuide.userData.guideArchBandThickness, scene.building.wallThickness);
  assert.equal(northGuide.userData.guideArchProfile, 'uniform-normal-offset');
  assert.equal(
    northGuide.userData.guideArchShiftY,
    scene.wallSystemRoot().userData.portalKarbandiNorthWallShiftY,
    'the north construction arch must use the same regenerated Karbandi shift as the wall',
  );
  assert.ok(northGuide.userData.guideArchWidthSamples.every((width) => (
    Math.abs(width - scene.building.wallThickness) < 0.000001
  )), 'guide arch width must remain uniform from both feet to the crown');
  assert.equal(visible(ribs).length, 0, 'the guide arch must finish before the first Karbandi rib starts');
  const northGuideBounds = new THREE.Box3().setFromObject(northGuide);
  assert.ok(Math.abs(northGuideBounds.max.z - scene.northOpeningMetrics().northZ) < 0.000001);
  assert.ok(Math.abs((northGuideBounds.max.z - northGuideBounds.min.z) - scene.building.wallThickness) < 0.000001);

  scene.applyConstructionStep(stepIndex('karbandi-reference-rib'), 1);
  assert.equal(scene.constructionGuideGroup.children.length, 1, 'north guide remains while the ribs are constructed');
  assert.equal(new Set(visible(ribs).map((rib) => rib.userData.karbandiRibIndex)).size, 1);
  assert.ok(visible(ribs).every((rib) => rib.userData.isKarbandiReference));
  assert.ok(visible(ribs)[0].material.clippingPlanes.length > 2, 'reference reveal must retain portal clipping alongside its animation plane');

  scene.applyConstructionStep(stepIndex('karbandi-ribs'), 0.01);
  assert.equal(
    new Set(visible(ribs).map((rib) => rib.userData.karbandiRibIndex)).size,
    2,
    'only one additional clipped rib index should appear first, including all retained components',
  );
  scene.applyConstructionStep(stepIndex('karbandi-ribs'), 1);
  assert.equal(visible(ribs).length, ribs.length);
  assert.ok(visible(ribs).every((rib) => rib.material.clippingPlanes?.length >= 2), 'every animated rib must remain clipped to the portal');
  assert.equal(visible(covers).length, 0);

  scene.applyConstructionStep(stepIndex('karbandi-roof'), 0.01);
  assert.equal(visible(covers).length, 1, 'roof panels should begin only after every rib is visible');
  scene.applyConstructionStep(stepIndex('karbandi-roof'), 1);
  assert.equal(visible(covers).length, covers.length);
  assert.ok(covers.every((cover) => cover.userData.roofThickness === scene.walls.karbandi.web.roofThickness));

  scene.applyConstructionStep(stepIndex('north-upper-wall'), 1);
  assert.equal(scene.constructionGuideGroup.children.length, 1, 'the completed guide arch remains while upper brickwork is constructed');
  const finishedNorthArchParts = scene.wallSystemRoot().children.filter((child) => (
    child.userData?.isNorthRaisedArchRing || child.userData?.isNorthCurveBorderBrick
  ));
  assert.ok(finishedNorthArchParts.length > 0);
  assert.ok(finishedNorthArchParts.every((child) => !child.visible), 'the finished north arch must not be constructed a second time over its guide');

  scene.applyConstructionStep(stepIndex('complete'), 1);
  assert.equal(scene.constructionGuideGroup.children.length, 0, 'the construction guide hands off to the finished north wall');
  assert.ok(finishedNorthArchParts.every((child) => child.visible));
});

test('Room construction progresses from walls through ribs, roof, drum, and layered dome', () => {
  const scene = Object.create(MehrazScene.prototype);
  scene.building = normalizeBuilding({
    type: 'room',
    width: 5,
    length: 5,
    domeTransition: 'karbandi',
    domeTransitionCoverEnabled: true,
    domeDrumHeight: 0.5,
  });
  scene.walls = normalizeWallSystem({
    ...DEFAULT_WALL_SYSTEM,
    bricks: { ...DEFAULT_WALL_SYSTEM.bricks, enabled: false },
    karbandi: { ...DEFAULT_WALL_SYSTEM.karbandi, enabled: true, coverEnabled: true },
  }, scene.building);
  scene.walls = normalizeWallSystem({
    ...scene.walls,
    karbandi: {
      ...scene.walls.karbandi,
      ...solveKarbandiWallSeating(scene.walls.karbandi, scene.building, scene.walls),
      enabled: true,
      coverEnabled: true,
    },
  }, scene.building);
  scene.buildingGroup = new THREE.Group();
  scene.buildingGroup.add(buildWallSystem(scene.building, scene.walls));
  ['constructionGuideGroup', 'archInfillGroup', 'placementGroup', 'placementMaskGroup', 'zoneGroup', 'zoneDecorationGroup']
    .forEach((key) => { scene[key] = new THREE.Group(); });
  scene.selectedWallSide = null;
  scene.wallSurfaceHighlight = null;
  scene.updateWallSurfaceHighlight = () => {};
  const stepIndex = (id) => CONSTRUCTION_STEPS.findIndex((step) => step.id === id);
  const meshes = [];
  scene.wallSystemRoot().traverse((child) => { if (child.isMesh) meshes.push(child); });
  const partMeshes = (part) => meshes.filter((mesh) => mesh.userData?.roomDomePart === part);
  const ribs = meshes.filter((mesh) => mesh.userData?.isKarbandi === true);
  const roofs = meshes.filter((mesh) => mesh.userData?.isKarbandiCover === true);
  const drums = partMeshes('dome-drum');
  const domes = partMeshes('dome-shell');
  const verticalWalls = meshes.filter((mesh) => (
    ['north', 'east', 'south', 'west'].includes(mesh.userData?.wallSide)
      && !mesh.userData?.roomDomePart
      && mesh.userData?.isBrickFace !== true
  ));
  assert.ok(ribs.length > 4 && roofs.length && drums.length && domes.length);
  assert.deepEqual(
    constructionStepsForBuilding('room').map((step) => step.id),
    ['empty', 'lower-walls', 'room-karbandi-ribs', 'room-karbandi-roof', 'room-transition-cover', 'room-drum', 'room-dome', 'room-decoration', 'complete'],
  );
  assert.equal(scene.hasConstructionStepContent('north-arch-guide'), false);
  assert.equal(scene.hasConstructionStepContent('decorate-arch'), false);
  assert.equal(scene.hasConstructionStepContent('room-karbandi-ribs'), true);

  const originalWallMaterial = Array.isArray(verticalWalls[0].material)
    ? verticalWalls[0].material[0]
    : verticalWalls[0].material;
  assert.match(originalWallMaterial.customProgramCacheKey(), /stone-base/);
  scene.applyConstructionStep(stepIndex('lower-walls'), 1);
  const animatedWallMaterial = Array.isArray(verticalWalls[0].material)
    ? verticalWalls[0].material[0]
    : verticalWalls[0].material;
  assert.equal(animatedWallMaterial.onBeforeCompile, originalWallMaterial.onBeforeCompile,
    'construction material cloning must preserve the stone-skirt shader');
  assert.match(animatedWallMaterial.customProgramCacheKey(), /stone-base/);
  assert.ok(verticalWalls.length > 0 && verticalWalls.every((mesh) => (
    mesh.visible
      && mesh.userData.roomConstructionIncludesStoneBase === true
      && mesh.userData.roomConstructionStoneBaseSequence === 'bottom-stone-first-then-wall-brick-courses'
  )), 'Room stone bases must animate from the bottom as the first part of the vertical-wall stage');
  assert.equal(ribs.some((mesh) => mesh.visible), false);
  assert.equal(scene.constructionGuideGroup.visible, false, 'Room construction must not use the Iwan guide arch');

  const decoration = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.1, 0.1),
    new THREE.MeshStandardMaterial(),
  );
  decoration.userData.isBrickFace = true;
  decoration.userData.isStructuralWallBondFace = true;
  decoration.userData.isImportedWallDecoration = false;
  decoration.userData.wallSide = 'east';
  scene.wallSystemRoot().add(decoration);
  assert.equal(scene.hasConstructionStepContent('room-decoration'), false,
    'built-in Room wall bonding must not create a second decoration animation step');
  scene.applyConstructionStep(stepIndex('room-decoration'), 0.5);
  assert.equal(decoration.visible, true);
  assert.equal(decoration.userData.constructionOriginalMaterial, undefined,
    'Room decoration playback must batch visibility without cloning and recompiling every brick material');

  scene.applyConstructionStep(stepIndex('room-karbandi-ribs'), 0.01);
  assert.equal(new Set(ribs.filter((mesh) => mesh.visible).map((mesh) => mesh.userData.karbandiRibIndex)).size, 1,
    'Room ribs must begin one rib index at a time');
  scene.applyConstructionStep(stepIndex('room-karbandi-ribs'), 1);
  assert.ok(ribs.every((mesh) => mesh.visible));
  assert.equal(roofs.some((mesh) => mesh.visible), false);

  scene.applyConstructionStep(stepIndex('room-karbandi-roof'), 1);
  assert.ok(roofs.every((mesh) => mesh.visible));
  scene.applyConstructionStep(stepIndex('room-transition-cover'), 1);
  assert.equal(drums.some((mesh) => mesh.visible), false);
  scene.applyConstructionStep(stepIndex('room-drum'), 0.5);
  assert.ok(drums.every((mesh) => (
    mesh.visible
      && (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).every((material) => (
        material.userData.roomConstructionRevealMode === 'continuous-circular-brick-by-brick-bottom-to-top'
      ))
      && mesh.userData.roomConstructionCourseSequence?.courseOrder === 'complete-current-ring-before-next-course'
      && mesh.userData.roomConstructionCourseSequence?.progress === 0.5
  )), 'the drum must rotate brick by brick around each course before advancing upward');
  assert.equal(domes.some((mesh) => mesh.visible), false);
  scene.applyConstructionStep(stepIndex('room-dome'), 0.5);
  assert.ok(domes.every((mesh) => (
    mesh.visible
      && (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).every((material) => (
        material.userData.roomConstructionRevealMode === 'continuous-circular-brick-by-brick-bottom-to-top'
      ))
      && mesh.userData.roomConstructionCourseSequence?.brickOrder === 'continuous-rotation-one-brick-at-a-time'
      && mesh.userData.roomConstructionCourseSequence?.courseHeight
        === scene.walls.bricks.brickHeight + scene.walls.bricks.mortar
  )), 'the dome must complete each rotating brick course before starting the next layer');
});

test('optional Karbandi rotation guide shows rib divisions, clipped ghosts, and layered support highlights at wall top', () => {
  const scene = karbandiConstructionScene();
  scene.walls = normalizeWallSystem({
    ...scene.walls,
    karbandi: {
      ...scene.walls.karbandi,
      guideVisible: true,
      archIntersectionGuideVisible: true,
    },
  }, scene.building);
  scene.buildingGroup.clear();
  scene.buildingGroup.add(buildWallSystem(scene.building, scene.walls));
  scene.karbandiReferenceEditing = false;
  scene.updateKarbandiReferenceHighlight();
  const wallSystem = scene.wallSystemRoot();
  const guide = wallSystem.getObjectByName('Karbandi rib rotation visual guide');
  assert.ok(guide);
  assert.equal(wallSystem.userData.karbandiVisualGuideVisible, true);
  assert.equal(wallSystem.userData.karbandiVisualGuideDivisionCount, scene.walls.karbandi.ribCount);
  assert.ok(wallSystem.userData.karbandiVisualGuideRadius > 0);
  assert.ok(wallSystem.userData.karbandiVisualGuideLevel > wallSystem.userData.karbandiWallTopY);
  assert.ok(wallSystem.userData.karbandiVisualGuideLevel - wallSystem.userData.karbandiWallTopY <= 0.03);
  assert.ok(guide.getObjectByName('Karbandi rib rotation circle'));
  const centerMarker = guide.getObjectByName('Karbandi rib rotation center');
  assert.ok(centerMarker);
  assert.equal(centerMarker.material.color.getHexString(), 'ffff00');
  assert.equal(centerMarker.userData.karbandiGuideColor, 'yellow');
  assert.equal(guide.userData.karbandiGuideRadiusMethod, 'mean-transformed-rib-leg-base-radius');
  const guideCenter = new THREE.Vector3(...guide.userData.karbandiGuideCenter);
  const divisionMarkers = guide.children.filter((child) => child.userData.karbandiGuideRole === 'rib-division-point');
  assert.equal(divisionMarkers.length, scene.walls.karbandi.ribCount);
  divisionMarkers.forEach((marker) => {
    assert.ok(Math.abs(
      Math.hypot(marker.position.x - guideCenter.x, marker.position.z - guideCenter.z)
      - guide.userData.karbandiGuideRadius
    ) < 0.000001, 'every division point must lie on the measured leg circle');
    assert.equal(marker.userData.karbandiGuideLegs.length, 2);
    assert.equal(marker.userData.karbandiGuideLegBasePositions.length, 2);
    const junction = marker.userData.karbandiGuideLegBasePositions
      .map((position) => new THREE.Vector3(...position))
      .reduce((sum, point) => sum.add(point), new THREE.Vector3())
      .multiplyScalar(0.5);
    const markerDirection = marker.position.clone().sub(guideCenter).setY(0).normalize();
    const junctionDirection = junction.sub(guideCenter).setY(0).normalize();
    assert.ok(markerDirection.distanceTo(junctionDirection) < 0.000001, 'each point must sit radially beneath its paired rib-leg junction');
  });
  assert.ok(guide.userData.karbandiGuideMaximumLegRadiusDeviation < 0.000001);

  const northContactGuide = wallSystem.getObjectByName('Karbandi rib arch intersection guide');
  assert.ok(northContactGuide);
  assert.equal(wallSystem.userData.karbandiNorthWallContactGuideVisible, true);
  assert.equal(northContactGuide.userData.karbandiNorthWallSurface, 'south-facing-interior-surface');
  const northProfiles = northContactGuide.children.filter((child) => (
    child.userData.karbandiGuideRole === 'north-wall-rib-profile'
  ));
  const retainedVisibleRibIndexes = [...new Set(wallSystem.children.filter((child) => (
    child.isMesh
    && child.userData?.isKarbandi === true
    && child.userData?.isKarbandiVisualGuide !== true
    && Array.isArray(child.userData?.karbandiVisibleRange)
  )).map((rib) => rib.userData.karbandiRibIndex))].sort((left, right) => left - right);
  const profileRibIndexes = northProfiles
    .map((profile) => profile.userData.karbandiRibIndex)
    .sort((left, right) => left - right);
  assert.ok(profileRibIndexes.every((ribIndex) => retainedVisibleRibIndexes.includes(ribIndex)));
  assert.ok(new Set(profileRibIndexes).size <= profileRibIndexes.length);
  assert.equal(
    northContactGuide.userData.karbandiNorthWallProfileSource,
    'visible-rib-transverse-intersections-with-north-wall-surface-after-all-clipping',
  );
  assert.equal(northContactGuide.userData.karbandiNorthWallVisibleRibProfileCount, profileRibIndexes.length);
  assert.ok(northProfiles.some((profile) => profile.userData.karbandiNorthWallContact === true));
  assert.ok(northProfiles.some((profile) => profile.userData.karbandiNorthWallContact === false));
  const openingProfile = northContactGuide.userData.karbandiNorthWallOpeningProfile;
  const openingLeft = Math.min(...openingProfile.map(([x]) => x));
  const openingRight = Math.max(...openingProfile.map(([x]) => x));
  const openingHeightAtX = (x) => {
    for (let index = 0; index < openingProfile.length - 1; index += 1) {
      const [startX, startY] = openingProfile[index];
      const [endX, endY] = openingProfile[index + 1];
      if (x < Math.min(startX, endX) - 0.000001 || x > Math.max(startX, endX) + 0.000001) continue;
      const progress = Math.abs(endX - startX) < 0.000001 ? 0 : (x - startX) / (endX - startX);
      return THREE.MathUtils.lerp(startY, endY, progress);
    }
    return Infinity;
  };
  northProfiles.forEach((profile) => {
    const touchesWall = profile.userData.karbandiNorthWallContact;
    assert.equal(profile.material.color.getHexString(), touchesWall ? 'ffffff' : 'ff2d2d');
    assert.equal(profile.userData.karbandiNorthWallHatched, true);
    assert.ok(profile.userData.karbandiNorthWallOutlineSegmentCount > 0);
    assert.ok(profile.userData.karbandiNorthWallHatchSegmentCount > 0);
    assert.equal(profile.userData.karbandiNorthWallHatchStyle, '45-degree-even-odd-section-fill');
    assert.equal(profile.userData.karbandiNorthWallHatchColor, touchesWall ? 'white' : 'red');
    if (touchesWall) {
      assert.ok([
        'exact-visible-rib-transverse-section-on-visible-north-wall-masonry',
        'tangent-visible-clipped-rib-end-contact-on-visible-north-wall-masonry',
      ].includes(profile.userData.karbandiNorthWallProfileMethod));
      assert.ok(
        profile.userData.karbandiNorthWallSurfaceGap
          <= profile.userData.karbandiNorthWallPhysicalContactTolerance,
      );
    } else {
      assert.equal(
        profile.userData.karbandiNorthWallProfileMethod,
        'exact-visible-rib-transverse-section-on-open-north-wall-surface',
      );
      assert.equal(profile.userData.karbandiNorthWallSurfaceGap, 0);
    }
    assert.equal(profile.userData.karbandiNorthWallMasonryMask, 'white-on-masonry-red-on-open-arch-surface');
    if (!touchesWall) {
      profile.geometry.computeBoundingBox();
      const size = profile.geometry.boundingBox.getSize(new THREE.Vector3());
      assert.ok(Math.max(size.x, size.y) < 0.5, 'a red surface intersection must be a local transverse rib profile, never a full coplanar arc');
    }
    assert.ok(profile.userData.karbandiNorthWallProfileDisplayZ > profile.userData.karbandiNorthWallPlaneZ);
    const positions = profile.geometry.getAttribute('position');
    assert.equal(
      positions.count / 2,
      profile.userData.karbandiNorthWallOutlineSegmentCount
        + profile.userData.karbandiNorthWallHatchSegmentCount,
    );
    for (let index = 0; index < positions.count; index += 1) {
      assert.ok(Math.abs(positions.getZ(index) - profile.userData.karbandiNorthWallProfileDisplayZ) < 0.000001);
    }
    for (let index = 0; index < positions.count; index += 2) {
      const midpointX = (positions.getX(index) + positions.getX(index + 1)) / 2;
      const midpointY = (positions.getY(index) + positions.getY(index + 1)) / 2;
      if (midpointX >= openingLeft && midpointX <= openingRight) {
        if (touchesWall) {
          assert.ok(
            midpointY >= openingHeightAtX(midpointX) - 0.00001,
            'white sections must lie on visible north-wall masonry',
          );
        } else {
          assert.ok(
            midpointY < openingHeightAtX(midpointX) + 0.00001,
            'red sections must lie on the open north-wall surface inside the portal',
          );
        }
      }
    }
  });

  const clippedGhosts = wallSystem.children.filter((child) => child.userData?.isKarbandiClippedRibGuide === true);
  assert.ok(clippedGhosts.length > 0);
  assert.equal(clippedGhosts.length, wallSystem.userData.karbandiClippedRibGuideCount);
  assert.equal(wallSystem.userData.karbandiClippedRibGuideOpacity, 0.3);
  assert.equal(wallSystem.userData.karbandiClippedRibGuideIncludesPortalClips, true);
  clippedGhosts.forEach((ghost) => {
    assert.equal(ghost.material.transparent, true);
    assert.equal(ghost.material.opacity, 0.3);
    assert.equal(ghost.userData.karbandiGuideOpacity, 0.3);
    assert.equal(ghost.material.depthWrite, false);
    assert.ok(!ghost.material.clippingPlanes?.length);
    assert.ok(ghost.userData.karbandiClippedRange[1] > ghost.userData.karbandiClippedRange[0]);
  });

  const visibleRibs = wallSystem.children.filter((child) => (
    child.isMesh && child.userData?.isKarbandi === true && child.userData?.isKarbandiVisualGuide !== true
  ));
  const referenceRibs = visibleRibs.filter((rib) => rib.userData.isKarbandiReference);
  const supportedRibs = visibleRibs.filter((rib) => rib.userData.isKarbandiClosestWallSupport && !rib.userData.isKarbandiReference);
  assert.ok(referenceRibs.length > 0);
  assert.ok(supportedRibs.length > 0);
  assert.ok(visibleRibs.every((rib) => rib.material.opacity === 1));
  assert.ok(referenceRibs.every((rib) => rib.material.color.getHexString() === scene.walls.karbandi.referenceRibColor.slice(1)));
  assert.ok(supportedRibs.every((rib) => rib.material.color.getHexString() === 'ff6b35'));
  const overlappingReference = referenceRibs.find((rib) => rib.userData.isKarbandiClosestWallSupport);
  assert.ok(overlappingReference, 'the test design must verify reference highlight priority over wall support orange');
  assert.equal(overlappingReference.material.color.getHexString(), scene.walls.karbandi.referenceRibColor.slice(1));

  const hiddenWalls = normalizeWallSystem({
    ...scene.walls,
    karbandi: {
      ...scene.walls.karbandi,
      guideVisible: false,
      archIntersectionGuideVisible: false,
    },
  }, scene.building);
  const hidden = buildWallSystem(scene.building, hiddenWalls);
  assert.equal(hidden.getObjectByName('Karbandi rib rotation visual guide'), undefined);
  assert.equal(hidden.userData.karbandiVisualGuideVisible, false);
  assert.equal(hidden.getObjectByName('Karbandi rib arch intersection guide'), undefined);
  assert.equal(hidden.userData.karbandiNorthWallContactGuideVisible, false);
  assert.equal(hidden.userData.karbandiClippedRibGuideCount, 0);
  assert.equal(hidden.userData.karbandiClippedRibGuideIncludesPortalClips, false);
  const intersectionOnly = buildWallSystem(scene.building, normalizeWallSystem({
    ...scene.walls,
    karbandi: {
      ...scene.walls.karbandi,
      guideVisible: false,
      archIntersectionGuideVisible: true,
    },
  }, scene.building));
  assert.equal(intersectionOnly.getObjectByName('Karbandi rib rotation visual guide'), undefined);
  assert.ok(intersectionOnly.getObjectByName('Karbandi rib arch intersection guide'));
  assert.equal(intersectionOnly.userData.karbandiClippedRibGuideCount, 0);
  const rotationOnly = buildWallSystem(scene.building, normalizeWallSystem({
    ...scene.walls,
    karbandi: {
      ...scene.walls.karbandi,
      guideVisible: true,
      archIntersectionGuideVisible: false,
    },
  }, scene.building));
  assert.ok(rotationOnly.getObjectByName('Karbandi rib rotation visual guide'));
  assert.equal(rotationOnly.getObjectByName('Karbandi rib arch intersection guide'), undefined);
  assert.ok(rotationOnly.userData.karbandiClippedRibGuideCount > 0);
  const guideExcludedBounds = scene.completeModelBounds();
  const hiddenBounds = new THREE.Box3().setFromObject(hidden);
  assert.ok(guideExcludedBounds.min.distanceTo(hiddenBounds.min) < 0.000001);
  assert.ok(guideExcludedBounds.max.distanceTo(hiddenBounds.max) < 0.000001);
});

test('Portal Karbandi shifts the north arch and wall crown to the lowest rib intersection after every rib change', () => {
  const building = normalizeBuilding({
    type: 'iwan',
    buildingType: 'portal',
    width: 6,
    iwanDepth: 3,
    depth: 3,
    height: 4,
  });
  const defaults = portalDefaultWallSystem(DEFAULT_WALL_SYSTEM, building);
  const walls = normalizeWallSystem({
    ...defaults,
    bricks: { ...defaults.bricks, enabled: false },
  }, building);
  const portal = buildWallSystem(building, walls);
  const baseHeight = portal.userData.portalKarbandiNorthWallBaseHeight;
  const adjustedHeight = portal.userData.portalKarbandiNorthWallHeight;
  const shiftY = portal.userData.portalKarbandiNorthWallShiftY;
  const lowestRange = portal.userData.portalKarbandiNorthWallLowestVisibleRibRange;
  const lowestPoint = portal.userData.portalKarbandiNorthWallLowestVisiblePoint;
  const archBefore = portal.userData.portalKarbandiNorthWallArchHeightBeforeShift;
  const archAfter = portal.userData.portalKarbandiNorthWallArchHeightAfterShift;
  const clearance = portal.userData.portalKarbandiNorthWallRibClearance;
  assert.ok(shiftY > 0);
  assert.ok(adjustedHeight > baseHeight);
  assert.ok(Math.abs(adjustedHeight - baseHeight - shiftY) < 0.000002);
  assert.equal(lowestRange.length, 4);
  assert.equal(lowestPoint.length, 2);
  assert.ok(Math.abs(archAfter - archBefore - shiftY) < 0.000002);
  assert.ok(
    Math.abs(lowestPoint[1] - archAfter - clearance) < 0.000002,
    'the shifted opening must reach the lowest rib section with a small masonry overlap',
  );
  assert.equal(
    portal.userData.portalKarbandiNorthWallHeightRule,
    'shift-complete-north-arch-to-lowest-rib-section-at-north-interior-face',
  );
  const adjustedNorthSections = portal.children.filter((child) => (
    child.isMesh
      && ['north_sides', 'north_top'].includes(child.userData?.wallSide)
      && child.userData?.portalKarbandiAdjustedNorthHeight != null
  ));
  assert.ok(adjustedNorthSections.length >= 4, 'both side piers and both arch-top halves must be adjusted');
  adjustedNorthSections.forEach((section) => {
    section.geometry.computeBoundingBox();
    assert.ok(Math.abs(section.geometry.boundingBox.max.y - adjustedHeight) < 0.000002);
    assert.equal(section.userData.portalKarbandiAdjustedNorthHeight, adjustedHeight);
    assert.equal(section.userData.portalKarbandiNorthWallShiftY, shiftY);
  });
  const shiftedWalls = normalizeWallSystem({
    ...walls,
    karbandi: { ...walls.karbandi, groupY: walls.karbandi.groupY + 0.5 },
  }, building);
  const shiftedPortal = buildWallSystem(building, shiftedWalls);
  assert.ok(
    shiftedPortal.userData.portalKarbandiNorthWallShiftY > shiftY + 0.49,
    'regenerating higher ribs must recompute and raise the complete north-wall arch assembly',
  );
});

test('legacy manual Karbandi clipping state is removed during normalization', () => {
  const normalized = normalizeWallSystem({
    karbandi: {
      cutMode: true,
      manualCuts: [
        { ribIndex: 3, side: 'right' },
        { ribIndex: 3, side: 'right', steps: 2 },
      ],
    },
  });
  assert.equal(normalized.karbandi.cutMode, false);
  assert.deepEqual(normalized.karbandi.manualCuts, []);
});

test('north-plane clipping separates rib islands before unsupported fragments are rendered', () => {
  assert.deepEqual(
    sampledCurveIntervalsAtOrAbove([-1, -0.5, 0.5, 1, 0.5, -0.5, -1], 0, 6, 0),
    [{ start: 1.5, end: 4.5 }],
    'only the continuous portion inside the north interior face should remain',
  );
  assert.deepEqual(
    sampledCurveIntervalsAtOrAbove([1, -1, 1], 0, 2, 0),
    [{ start: 0, end: 0.5 }, { start: 1.5, end: 2 }],
    'separate north-wall islands must remain separate so junction pruning can remove unsupported pieces',
  );
});

test('automatic Karbandi clipping can be applied and reset independently of portal clipping', () => {
  const building = normalizeBuilding({ width: 4, depth: 2, height: 6, wallThickness: 0.35, openingWidth: 4 });
  const build = (autoClip) => buildWallSystem(building, normalizeWallSystem({
    ...DEFAULT_WALL_SYSTEM,
    bricks: { ...DEFAULT_WALL_SYSTEM.bricks, enabled: false },
    ahang: { enabled: false },
    karbandi: { ...DEFAULT_WALL_SYSTEM.karbandi, groupScale: 0.95, enabled: true, autoClip },
  }, building));
  const automatic = build(true);
  const reset = build(false);

  assert.equal(automatic.userData.karbandiAutoClipEnabled, true);
  assert.ok(automatic.userData.karbandiAutomaticCutCount > 0);
  assert.deepEqual(
    [...new Set(automatic.userData.karbandiClosestWallLegs.map((leg) => leg.wall))].sort(),
    ['east', 'south', 'west'],
    'auto clip must retain the closest rib feet for every vertical interior wall face',
  );
  assert.equal(
    automatic.userData.karbandiClosestWallLegs.filter((leg) => leg.wall === 'south').length,
    2,
    'the two equally close feet of the wall-parallel south rib must both remain supported',
  );
  assert.ok(
    automatic.userData.karbandiRedundantWallLegCutCount > 0,
    'additional rib feet touching a wall must stop at their first rib junction',
  );
  assert.equal(
    automatic.userData.karbandiRedundantWallLegCuts.length,
    automatic.userData.karbandiRedundantWallLegCutCount,
  );
  const sideWallCuts = automatic.userData.karbandiRedundantWallLegCuts.filter((cut) => (
    cut.walls.some((wall) => wall === 'east' || wall === 'west')
  ));
  assert.ok(sideWallCuts.length > 0,
    'a non-bearing leg of a wall-supported rib must still be shortened');
  sideWallCuts.forEach((cut) => {
    assert.ok(!automatic.userData.karbandiWallSupportedLegKeys.includes(`${cut.ribIndex}:${cut.side}`));
    assert.ok(
      automatic.userData.karbandiHighlightedWallSupportRibIndexes.includes(cut.supportRibIndex),
      'a non-bearing east/west leg must trim at its first junction with a supported-frame rib',
    );
  });
  const wallCutLegKeys = new Set(automatic.userData.karbandiRedundantWallLegCuts.map(
    ({ ribIndex, side }) => `${ribIndex}:${side}`,
  ));
  assert.ok(automatic.userData.karbandiAutomaticHangingClipIntervals.every(
    ({ ribIndex, side }) => !wallCutLegKeys.has(`${ribIndex}:${side}`),
  ), 'hanging-span clipping must not invert a wall-foot cut');
  assert.ok(automatic.userData.karbandiAutomaticHangingClipCount > 0);
  assert.equal(
    automatic.userData.karbandiAutomaticHangingClipIntervals.length,
    automatic.userData.karbandiAutomaticHangingClipCount,
  );
  assert.ok(automatic.userData.karbandiAutomaticHangingClipIntervals.every((interval) => interval.end > interval.start));
  const wallSupportedRibIndexes = new Set(automatic.userData.karbandiWallSupportedRibIndexes);
  const directWallSupportedRibIndexes = new Set(automatic.userData.karbandiDirectWallSupportedRibIndexes);
  const baseTouchingRibIndexes = new Set(automatic.userData.karbandiBaseTouchingWallSupportedRibIndexes);
  const baseTouchingLegKeys = new Set(automatic.userData.karbandiBaseTouchingWallSupportedLegKeys);
  const wallSupportedLegKeys = new Set(automatic.userData.karbandiWallSupportedLegKeys);
  const wallTouchingLegKeys = new Set(automatic.userData.karbandiAllWallTouchingLegs.map(
    ({ ribIndex, side }) => `${ribIndex}:${side}`,
  ));
  assert.ok(baseTouchingRibIndexes.size > 0, 'at least one rib base must seat against a wall-supported rib base');
  assert.ok([...baseTouchingLegKeys].every((key) => wallTouchingLegKeys.has(key)),
    'base contact may promote a leg only when that same base is close to an interior wall surface');
  assert.deepEqual(
    wallSupportedRibIndexes,
    new Set([...directWallSupportedRibIndexes, ...baseTouchingRibIndexes]),
    'base-touching ribs must be promoted into the wall-supported clipping frame',
  );
  assert.deepEqual(new Set(automatic.userData.karbandiAutoClipSupportedFrameRibIndexes), wallSupportedRibIndexes);
  const unsupportedLegCuts = automatic.userData.karbandiAutomaticHangingClipIntervals.filter(
    (interval) => !wallSupportedRibIndexes.has(interval.ribIndex),
  );
  assert.ok(unsupportedLegCuts.length > 0);
  assert.ok(unsupportedLegCuts.every(({ supportRibIndex }) => (
    supportRibIndex != null && wallSupportedRibIndexes.has(supportRibIndex)
  )), 'hanging legs must clip at a junction with the expanded wall-supported frame');
  assert.ok([
    ...automatic.userData.karbandiRedundantWallLegCuts,
    ...automatic.userData.karbandiAutomaticHangingClipIntervals,
  ].every(({ ribIndex, side }) => !wallSupportedLegKeys.has(`${ribIndex}:${side}`)),
  'the actual wall/base-bearing leg must never receive an automatic cut');
  assert.ok(automatic.userData.karbandiAutomaticHangingClipIntervals.some(({ ribIndex, side }) => (
    baseTouchingRibIndexes.has(ribIndex) && !baseTouchingLegKeys.has(`${ribIndex}:${side}`)
  )), 'a remote opposite leg on a base-promoted rib must clip to the supported frame');
  const supportTargetsByUnsupportedRib = new Map();
  [
    ...automatic.userData.karbandiRedundantWallLegCuts,
    ...automatic.userData.karbandiAutomaticHangingClipIntervals,
  ].forEach(({ ribIndex, supportRibIndex }) => {
    if (wallSupportedRibIndexes.has(ribIndex) || supportRibIndex == null) return;
    if (!supportTargetsByUnsupportedRib.has(ribIndex)) supportTargetsByUnsupportedRib.set(ribIndex, new Set());
    supportTargetsByUnsupportedRib.get(ribIndex).add(supportRibIndex);
  });
  assert.ok([...supportTargetsByUnsupportedRib.values()].every((targets) => targets.size === 2),
    'each unsupported rib must be bounded by intersections with two distinct wall-supported ribs');
  assert.deepEqual(
    automatic.userData.karbandiNetworkRootRibIndexes,
    [...wallSupportedRibIndexes].sort((a, b) => a - b),
    'direct and base-promoted wall-supported ribs must root the retained network',
  );
  assert.equal(reset.userData.karbandiAutoClipEnabled, false);
  assert.equal(reset.userData.karbandiAutomaticCutCount, 0);
  assert.deepEqual(reset.userData.karbandiClosestWallLegs, []);
  assert.equal(reset.userData.karbandiRedundantWallLegCutCount, 0);
  assert.equal(reset.userData.karbandiAutomaticHangingClipCount, 0);
  const resetRibs = reset.children.filter((child) => child.isMesh && child.userData?.isKarbandi);
  const automaticRibs = automatic.children.filter((child) => child.isMesh && child.userData?.isKarbandi);
  const highlightedIndexes = automatic.userData.karbandiHighlightedWallSupportRibIndexes;
  assert.equal(automatic.userData.karbandiAutoClipSupportFrame, 'nearest-interior-wall-ribs');
  assert.equal(automatic.children.some((child) => child.userData?.isKarbandiWallSupportHighlight), false);
  assert.ok(automaticRibs.every((rib) => (
    rib.userData.isKarbandiClosestWallSupport === highlightedIndexes.includes(rib.userData.karbandiRibIndex)
  )));
  assert.ok(automaticRibs.filter((rib) => rib.userData.isKarbandiClosestWallSupport).every((rib) => (
    rib.userData.karbandiWallSupportedLegs.length > 0
      && rib.userData.karbandiWallSupportedLegs.every((side) => !rib.userData.karbandiPortalCuts.includes(side))
  )), 'the bearing leg of every wall-supported rib must remain uncut');
  automaticRibs.filter((rib) => wallSupportedRibIndexes.has(rib.userData.karbandiRibIndex)).forEach((rib) => {
    const resetRib = resetRibs.find((candidate) => candidate.userData.karbandiRibIndex === rib.userData.karbandiRibIndex);
    rib.userData.karbandiWallSupportedLegs.forEach((side) => {
      const boundaryIndex = side === 'left' ? 0 : 1;
      assert.equal(rib.userData.karbandiVisibleRange[boundaryIndex], resetRib.userData.karbandiVisibleRange[boundaryIndex]);
    });
    ['left', 'right'].filter((side) => !rib.userData.karbandiWallSupportedLegs.includes(side)).forEach((side) => {
      assert.ok(rib.userData.karbandiPortalCuts.includes(side),
        'the non-bearing leg of a wall-supported rib must clip to the supported frame');
    });
  });
  const clippedWallLegKeys = new Set(automatic.userData.karbandiRedundantWallLegCuts.flatMap((cut) => (
    cut.walls.map((wall) => `${wall}:${cut.ribIndex}:${cut.side}`)
  )));
  assert.ok(automatic.userData.karbandiAllWallTouchingLegs.every(({ wall, ribIndex, side }) => (
    wallSupportedLegKeys.has(`${ribIndex}:${side}`)
      || clippedWallLegKeys.has(`${wall}:${ribIndex}:${side}`)
  )), 'only the bearing leg of a wall-supported rib may remain at a wall without a cut');
  assert.equal(reset.userData.karbandiAutoClipSupportFrame, null);
  assert.deepEqual(reset.userData.karbandiHighlightedWallSupportRibIndexes, []);
  const highlightScene = Object.create(MehrazScene.prototype);
  highlightScene.buildingGroup = new THREE.Group();
  highlightScene.buildingGroup.add(automatic);
  highlightScene.walls = normalizeWallSystem({
    ...DEFAULT_WALL_SYSTEM,
    ahang: { enabled: false },
    karbandi: { ...DEFAULT_WALL_SYSTEM.karbandi, groupScale: 0.95, enabled: true, autoClip: true },
  }, building);
  highlightScene.karbandiReferenceEditing = true;
  MehrazScene.prototype.updateKarbandiReferenceHighlight.call(highlightScene);
  assert.ok(automaticRibs.filter((rib) => rib.userData.isKarbandiClosestWallSupport && !rib.userData.isKarbandiReference)
    .every((rib) => rib.material.color.getHexString() === 'ff6b35'));
  assert.ok(automaticRibs.filter((rib) => rib.userData.isKarbandiReference)
    .every((rib) => rib.material.color.getHexString() === DEFAULT_WALL_SYSTEM.karbandi.referenceRibColor.slice(1)));
  highlightScene.karbandiReferenceEditing = false;
  MehrazScene.prototype.updateKarbandiReferenceHighlight.call(highlightScene);
  assert.ok(automaticRibs.every((rib) => rib.material.color.getHexString() === DEFAULT_WALL_SYSTEM.karbandi.ribColor.slice(1)));
  automatic.userData.karbandiRedundantWallLegCuts.forEach((cut) => {
    const cutRib = automaticRibs.find((rib) => rib.userData.karbandiRibIndex === cut.ribIndex);
    assert.ok(cutRib, 'a wall-foot clip must retain the inward part of its rib');
    assert.equal(cutRib.userData.karbandiRibComponentCount, 1);
    const retainedBoundary = cut.side === 'left'
      ? cutRib.userData.karbandiVisibleRange[0]
      : cutRib.userData.karbandiVisibleRange[1];
    assert.ok(Math.abs(retainedBoundary - cut.originalIndex) < 0.001);
  });
  automatic.userData.karbandiAutomaticHangingClipIntervals.forEach((cut) => {
    const cutRib = automaticRibs.find((rib) => rib.userData.karbandiRibIndex === cut.ribIndex);
    if (!cutRib) {
      assert.ok(automatic.userData.karbandiNorthDetachedFragmentsRemoved.some(
        ({ ribIndex }) => ribIndex === cut.ribIndex,
      ), 'a fully removed hanging rib must be recorded as an unsupported north-wall fragment');
      return;
    }
    const retainedBoundary = cut.side === 'left'
      ? cutRib.userData.karbandiVisibleRange[0]
      : cutRib.userData.karbandiVisibleRange[1];
    const junctionBoundary = cut.side === 'left' ? cut.end : cut.start;
    assert.ok(
      cut.side === 'left'
        ? retainedBoundary >= junctionBoundary - 0.001
        : retainedBoundary <= junctionBoundary + 0.001,
      'the removed interval must reach the first junction and may continue inward to remove a detached north-wall island',
    );
  });
  assert.ok(resetRibs.length > 0);
  const automaticRibIndexes = new Set(automaticRibs.map((rib) => rib.userData.karbandiRibIndex));
  const resetRibIndexes = new Set(resetRibs.map((rib) => rib.userData.karbandiRibIndex));
  assert.ok([...automaticRibIndexes].every((ribIndex) => resetRibIndexes.has(ribIndex)));
  assert.ok([...resetRibIndexes].filter((ribIndex) => !automaticRibIndexes.has(ribIndex)).every((ribIndex) => (
    automatic.userData.karbandiNorthDetachedFragmentsRemoved.some((fragment) => fragment.ribIndex === ribIndex)
  )), 'auto clipping may delete a whole rib only when its remaining geometry is an unsupported north-wall fragment');
  assert.ok(automaticRibs.every((rib) => rib.userData.karbandiRibComponentCount === 1),
    'auto clipping must keep one continuous inward span instead of restoring wall-side fragments');
  assert.ok(resetRibs.every((rib) => rib.userData.karbandiPortalCuts.length === 0));
  assert.ok(resetRibs.every((rib) => rib.material.clippingPlanes.length > 0), 'reset must preserve clipping at the wall planes');
  assert.equal(normalizeWallSystem({ karbandi: { enabled: true } }).karbandi.autoClip, true);
});

test('new Mehraz projects use the requested architectural defaults', () => {
  const building = normalizeBuilding();
  assert.equal(building.type, 'iwan');
  assert.equal(building.depth, 2);
  assert.equal(building.iwanDepth, 2);
  assert.equal(building.domeEnabled, true);
  assert.equal(building.domeCoverType, 'dome');
  assert.equal(building.domeCoverHeight, 5);
  assert.equal(building.domeTransition, 'karbandi');
  assert.equal(building.domeDrumHeight, 0.5);
  assert.equal(building.domeColor, '#49b5ca');
  assert.equal(building.domeExtraLegColor, '#49b5ca');
  assert.equal(building.domeRingColor, '#49b5ca');
  assert.deepEqual(building.domeOuterRingEnabledByCoverType, {
    dome: true,
    cone: true,
    pyramid: true,
  });
  assert.equal(building.domePatternCoverage, 85);
  assert.equal(building.innerDomeEnabled, false);
  assert.deepEqual(building.innerDomeEnabledByTransition, {
    karbandi: false,
    squinch: true,
    pendentive: false,
    muqarnas: false,
  });
  assert.equal(building.innerDomeColor, '#b88b5f');
  assert.equal(building.innerDomePatternCoverage, 85);
  assert.equal(building.betweenDomeSupportWallsEnabled, true);
  assert.equal(building.betweenDomeSupportWallsCoverage, 60);
  assert.equal(building.innerDomeArch.redOffset, -0.75);
  assert.equal(building.innerDomeArch.greenOffset, 0.95);
  assert.equal(building.height + building.domeTransitionHeight + building.domeDrumHeight + building.innerDomeArch.greenHeightOffset, 5.95);
  const defaultSquinchInnerDome = normalizeBuilding({ type: 'room', domeTransition: 'squinch' });
  assert.equal(defaultSquinchInnerDome.innerDomeEnabled, true);
  const editedSquinchInnerDome = normalizeBuilding({
    ...defaultSquinchInnerDome,
    innerDomeEnabledByTransition: {
      ...defaultSquinchInnerDome.innerDomeEnabledByTransition,
      squinch: false,
    },
  });
  assert.equal(editedSquinchInnerDome.innerDomeEnabled, false);
  assert.equal(normalizeBuilding({ ...editedSquinchInnerDome, domeTransition: 'karbandi' }).innerDomeEnabled, false);
  assert.equal(normalizeBuilding({ domeTransition: 'karbandi', innerDomeEnabled: true }).innerDomeEnabled, true,
    'the old single visibility value must migrate only to its saved transition');
  assert.equal(building.domeDrumColor, '#b3a62c');
  assert.equal(building.domeArch.redOffset, 0);
  assert.equal(building.domeArch.greenOffset, 2);
  assert.equal(building.domeArch.legExtension, 0);
  assert.deepEqual(building.domeOuterLegExtensionByCoverType, { dome: 0, cone: 1, pyramid: 1 });
  const coneLegBuilding = normalizeBuilding({ ...building, domeCoverType: 'cone' });
  assert.equal(coneLegBuilding.domeArch.legExtension, 1);
  const editedConeLegBuilding = normalizeBuilding({
    ...coneLegBuilding,
    domeOuterLegExtensionByCoverType: {
      ...coneLegBuilding.domeOuterLegExtensionByCoverType,
      cone: 2.25,
    },
  });
  assert.equal(editedConeLegBuilding.domeArch.legExtension, 2.25);
  assert.equal(normalizeBuilding({ ...editedConeLegBuilding, domeCoverType: 'pyramid' }).domeArch.legExtension, 1);
  assert.equal(normalizeBuilding({ ...editedConeLegBuilding, domeCoverType: 'dome' }).domeArch.legExtension, 0);
  assert.equal(normalizeBuilding({
    type: 'room',
    domeCoverType: 'cone',
    domeColor: '#ab6723',
    domeArch: { legExtension: 0.4 },
  }).domeOuterLegExtensionByCoverType.cone, 0.4, 'legacy shared legs migrate to their saved cover type');
  assert.equal(normalizeBuilding({ domeColor: '#ab6723' }).domeExtraLegColor, '#ab6723',
    'legacy projects inherit their dome color for the newly independent extra leg');
  assert.equal(building.height + building.domeTransitionHeight + building.domeDrumHeight + building.domeArch.greenHeightOffset, 4);
  assert.equal(building.domeTransitionSettings.karbandi.ribCount, 16);
  assert.equal(building.domeTransitionSettings.squinch.facetCount, 8);
  assert.equal(building.domeTransitionSettings.squinch.archCount, 8);
  assert.equal(building.domeTransitionSettings.squinch.ribWidth, 0.1);
  assert.equal(building.domeTransitionSettings.squinch.ribDepth, 0.46);
  assert.equal(building.domeTransitionSettings.squinch.ribColor, '#3490b7');
  assert.equal(building.domeTransitionSettings.squinch.legGap, 0);
  assert.equal(building.domeTransitionSettings.squinch.legExtension, 1);
  assert.equal(building.domeTransitionSettings.squinch.springHeightOffset, 0);
  assert.equal(building.domeTransitionSettings.squinch.redOffset, -0.1);
  assert.equal(building.domeTransitionSettings.squinch.greenOffset, 0.45);
  assert.equal(building.domeTransitionSettings.squinch.greenHeightOffset, -0.65);
  assert.equal(building.domeTransitionSettings.squinch.roofThickness, undefined);
  assert.equal(building.domeTransitionSettings.pendentive.curvature, 1.45);
  assert.equal(building.domeTransitionSettings.muqarnas.courseCount, 6);
  assert.equal(normalizeBuilding({ type: 'room' }).length, 4);
  assert.equal(normalizeBuilding({ type: 'room' }).depth, 4);
  assert.equal(
    normalizeWallSystem().bricks.sideBonds.room_dome_transition_exterior.builtIn,
    'running',
  );
  assert.equal(normalizeBuilding({ domePatternCoverage: -1 }).domePatternCoverage, 0);
  assert.equal(normalizeBuilding({ domePatternCoverage: 101 }).domePatternCoverage, 100);
  const editedRoom = normalizeBuilding({ ...building, type: 'room', length: 7 });
  assert.equal(editedRoom.depth, 7);
  assert.equal(editedRoom.iwanDepth, 2);
  const restoredIwan = normalizeBuilding({ ...editedRoom, type: 'iwan' });
  assert.equal(restoredIwan.depth, 2);
  assert.equal(restoredIwan.length, 7);
  const editedIwan = normalizeBuilding({ ...restoredIwan, iwanDepth: 3, depth: 3 });
  assert.equal(editedIwan.depth, 3);
  assert.equal(normalizeBuilding({ ...editedIwan, type: 'room' }).depth, 7);
  const walls = normalizeWallSystem();
  const portalDefaults = portalDefaultWallSystem(DEFAULT_WALL_SYSTEM, building);
  assert.equal(walls.northWall.archTopExtension, 0.7);
  assert.equal(walls.northWall.outwardWidth, 1);
  assert.equal(walls.northBoundary.enabled, true);
  assert.equal(walls.southOpenings.door.enabled, true);
  assert.equal(walls.southOpenings.door.head, 'lintel');
  assert.equal(walls.southOpenings.door.width, 2);
  assert.equal(walls.southOpenings.door.height, 1.6);
  assert.equal(walls.southOpenings.door.arch.redOffset, -0.4);
  assert.equal(walls.southOpenings.door.arch.redRadius, 0.55);
  assert.equal(walls.southOpenings.door.arch.greenOffset, 1.05);
  assert.ok(Math.abs(walls.southOpenings.door.arch.greenHeight - 0.0036) < 1e-9);
  assert.equal(walls.southOpenings.window.enabled, false);
  assert.equal(walls.southOpenings.window.head, 'lintel');
  assert.equal(walls.southOpenings.window.width, 1);
  assert.equal(walls.southOpenings.window.height, 0.5);
  assert.equal(walls.southOpenings.window.sillHeight, 4.7);
  assert.equal(walls.southOpenings.window.arch.redOffset, 0);
  assert.equal(walls.southOpenings.window.arch.redRadius, 0.5);
  assert.equal(walls.southOpenings.window.arch.greenOffset, 0.5);
  assert.equal(walls.southOpenings.window.arch.greenHeight, 4.7);
  assert.equal(walls.roomWallOpenings.north.door.enabled, true);
  assert.equal(walls.roomWallOpenings.north.door.head, 'arch');
  assert.equal(walls.roomWallOpenings.north.door.width, 2);
  assert.equal(walls.roomWallOpenings.north.door.height, 3);
  assert.equal(walls.roomWallOpenings.north.door.position, 0);
  assert.equal(walls.roomWallOpenings.north.door.arch.redOffset, -0.45);
  assert.equal(walls.roomWallOpenings.north.door.arch.greenOffset, 1.05);
  assert.equal(walls.roomWallOpenings.north.door.arch.greenHeight, 1);
  assert.equal(walls.roomWallOpenings.north.door.arch.greenHeightOffset, -2);
  assert.equal(walls.roomWallOpenings.south.door.enabled, false);
  assert.equal(walls.bricks.sideBonds.room_dome_drum.builtIn, 'running');
  assert.equal(walls.bricks.sideBonds.room_dome_extra_leg.builtIn, 'running');
  assert.equal(walls.bricks.sideBonds.room_dome_extra_leg_interior.builtIn, 'running');
  assert.equal(walls.bricks.sideBonds.room_dome_interior.builtIn, 'running');
  assert.equal(walls.bricks.sideBonds.room_inner_dome_exterior.builtIn, 'running');
  assert.equal(walls.bricks.sideBonds.room_inner_dome_interior.builtIn, 'running');
  assert.equal(walls.stoneBase.enabled, true);
  assert.equal(walls.stoneBase.height, 1);
  assert.equal(walls.stoneBase.slabWidth, 0.6);
  assert.equal(walls.stoneBase.color, '#b7a68a');
  assert.equal(walls.stoneBase.mortar, 0.001);
  assert.equal(walls.stoneBase.mortarColor, '#9a8f7e');
  assert.equal(walls.interiorGypsum.enabled, false);
  assert.equal(walls.interiorGypsum.color, '#f1eee7');
  assert.equal(portalDefaults.portalTransition, 'karbandi');
  assert.equal(portalDefaults.portalCover, 'none');
  assert.equal(portalDefaults.karbandi.enabled, true);
  assert.equal(portalDefaults.ahang.enabled, false, 'new Portals default to No cover');
  assert.equal(normalizeWallSystem({ portalTransition: 'muqarnas' }).portalTransition, 'muqarnas');
  assert.equal(
    normalizeWallSystem({ karbandi: { enabled: true } }).portalTransition,
    'karbandi',
    'legacy Portal projects with Karbandi enabled must migrate to the Karbandi transition tab',
  );
  const portalAhangWithKarbandiTransition = normalizeWallSystem({
    ...DEFAULT_WALL_SYSTEM,
    portalTransition: 'karbandi',
    ahang: { enabled: true },
    karbandi: { ...DEFAULT_WALL_SYSTEM.karbandi, enabled: true },
  }, normalizeBuilding());
  assert.equal(portalAhangWithKarbandiTransition.ahang.enabled, true,
    'Ahang remains the Portal cover while Karbandi is selected as its transition');
  assert.equal(portalAhangWithKarbandiTransition.portalCover, 'ahang');
  assert.equal(portalAhangWithKarbandiTransition.karbandi.enabled, true);
  for (const portalCover of ['none', 'ahang', 'dome']) {
    const normalizedCover = normalizeWallSystem({ portalCover });
    assert.equal(normalizedCover.portalCover, portalCover);
    assert.equal(normalizedCover.ahang.enabled, portalCover === 'ahang');
  }
  assert.equal(normalizeWallSystem({ portalCover: 'pyramid' }).portalCover, 'dome');
  assert.equal(normalizeWallSystem({ portalCover: 'cone' }).portalCover, 'dome');
  assert.equal(walls.karbandi.span, 4.1);
  assert.equal(walls.karbandi.groupScale, 0.95);
  assert.equal(walls.karbandi.redOffset, -0.6);
  assert.equal(walls.karbandi.greenOffset, 0.6);
  assert.equal(walls.karbandi.greenHeightOffset, -1);
  assert.equal(6 + walls.karbandi.greenHeightOffset, 5);
  const migratedKarbandi = normalizeWallSystem({ karbandi: { groupScale: 1 } }).karbandi;
  assert.equal(migratedKarbandi.groupScale, 0.95);
  assert.ok(Math.abs(migratedKarbandi.groupY - 0.3) < 0.000001);
  assert.equal(walls.karbandi.ribColor, '#3490b7');
  assert.equal(walls.karbandi.referenceRibColor, '#ffd400');
  assert.equal(walls.karbandi.guideVisible, false);
  assert.equal(normalizeWallSystem({ karbandi: { guideVisible: true } }).karbandi.guideVisible, true);
  assert.equal(walls.karbandi.archIntersectionGuideVisible, false);
  assert.equal(
    normalizeWallSystem({ karbandi: { archIntersectionGuideVisible: true } }).karbandi.archIntersectionGuideVisible,
    true,
  );
  assert.equal(walls.karbandi.web.infillBrickColor, '#e5d41f');
});

test('selecting Vestibule applies its independent ring, drum, and outer-dome defaults', () => {
  const room = normalizeBuilding({
    type: 'room',
    buildingType: 'room',
    height: 6.5,
    domeDrumHeight: 1.25,
    domePatternCoverage: 42,
    domeOuterRingEnabledByCoverType: { dome: true, cone: true, pyramid: true },
    domeArch: { redOffset: 0.4, greenOffset: 2.4, greenHeightOffset: -1 },
  });
  const vestibule = buildingForSelectedType(room, 'vestibule', {
    north: 0.25,
    east: 0,
    south: 0,
    west: 0,
  });
  assert.equal(vestibule.buildingType, 'vestibule');
  assert.equal(vestibule.roomPlanShape, 'octagon');
  assert.equal(vestibule.domeDrumHeight, 0);
  assert.deepEqual(vestibule.domeOuterRingEnabledByCoverType, {
    dome: false,
    cone: false,
    pyramid: false,
  });
  assert.equal(vestibule.domeArch.redOffset, -1.2);
  assert.equal(vestibule.domeArch.greenOffset, 1.75);
  assert.equal(vestibule.domePatternCoverage, 85);
  const outerSpringHeight = 6.75
    + vestibule.domeTransitionHeight
    + vestibule.domeDrumHeight
    + vestibule.domeArch.legExtension;
  assert.ok(Math.abs(outerSpringHeight + vestibule.domeArch.greenHeightOffset - 2) < 0.000001);

  const roomAgain = buildingForSelectedType(vestibule, 'room');
  assert.equal(roomAgain.buildingType, 'room');
  assert.equal(roomAgain.roomPlanShape, 'square');
});

test('Iwan and Room Karbandi rib counts start at eight and advance only in multiples of four', () => {
  assert.equal(DEFAULT_WALL_SYSTEM.karbandi.ribCount, 16);
  assert.deepEqual(
    [undefined, 2, 7, 8, 9, 10, 11, 12, 18, 63, 80].map(normalizeKarbandiRibCount),
    [16, 8, 8, 8, 8, 12, 12, 12, 20, 64, 64],
  );
  ['iwan', 'room'].forEach((type) => {
    const building = normalizeBuilding({ type });
    assert.equal(normalizeWallSystem({ karbandi: { ribCount: 2 } }, building).karbandi.ribCount, 8);
    assert.equal(normalizeWallSystem({ karbandi: { ribCount: 18 } }, building).karbandi.ribCount, 20);
    assert.equal(normalizeWallSystem({}, building).karbandi.ribCount, 16);
  });
});

test('Room building type closes four walls and builds selectable square-to-circle dome transitions', () => {
  const transitionTypes = ['karbandi', 'squinch', 'pendentive', 'muqarnas'];
  transitionTypes.forEach((domeTransition) => {
    const building = normalizeBuilding({
      type: 'room',
      width: 6,
      depth: 5,
      height: 4,
      wallThickness: 0.4,
      domeEnabled: true,
      domeTransition,
      domeTransitionHeight: 1.4,
      domeTransitionCoverEnabled: true,
      domeArch: { redOffset: -0.45, greenOffset: 0.72, greenHeightOffset: 0.15 },
      domeTransitionSettings: {
        karbandi: { ribCount: 12, ribWidth: 0.055 },
        squinch: { facetCount: 10, tierCount: 2 },
        pendentive: { curvature: 1.8, subdivisions: 12 },
        muqarnas: { courseCount: 7, courseWidth: 0.06 },
      },
      domeColor: '#ba783f',
    });
    let walls = normalizeWallSystem({
      ...DEFAULT_WALL_SYSTEM,
      bricks: { ...DEFAULT_WALL_SYSTEM.bricks, enabled: false },
      northBoundary: { ...DEFAULT_WALL_SYSTEM.northBoundary, enabled: false },
      pointedArch: { ...DEFAULT_WALL_SYSTEM.pointedArch, enabled: true },
      ahang: { enabled: true },
      karbandi: { ...DEFAULT_WALL_SYSTEM.karbandi, enabled: true, coverEnabled: true, ribCount: 12, ribWidth: 0.055 },
    }, building);
    if (domeTransition === 'karbandi') {
      walls = normalizeWallSystem({
        ...walls,
        karbandi: { ...walls.karbandi, ...solveKarbandiWallSeating(walls.karbandi, building, walls) },
      }, building);
    }
    const room = buildWallSystem(building, walls);
    const dome = room.getObjectByName('Room circular dome cover');
    const transition = domeTransition === 'karbandi'
      ? null
      : room.getObjectByName(`Room ${domeTransition} square-to-circle transition cover`);
    assert.ok(dome, `${domeTransition} room must have a dome`);
    assert.equal(dome.userData.roomDomeTransitionType, domeTransition);
    assert.equal(dome.userData.roomDomeProfileSystem, 'four-centre-red-green-circle-arch-revolved');
    assert.ok(dome.userData.roomDomeArchConstruction);
    if (domeTransition === 'karbandi') {
      assert.equal(room.userData.roomKarbandiUsesIwanGenerator, true);
      assert.deepEqual(room.userData.roomKarbandiRotationCenter, [0, 0]);
      assert.ok(room.children.some((child) => child.userData?.isKarbandi === true && child.userData?.isKarbandiVisualGuide !== true), 'Karbandi transition must use retained Iwan rib geometry');
    } else {
      assert.ok(transition, `${domeTransition} room must have a square-to-circle transition`);
      assert.equal(transition.userData.roomDomeTransitionType, domeTransition);
      assert.deepEqual(transition.userData.roomDomeTransitionSettings, building.domeTransitionSettings[domeTransition]);
    }
    const domeExteriorMaterial = Array.isArray(dome.material)
      ? dome.material[dome.userData.roomDomeExteriorMaterialIndex]
      : dome.material;
    assert.equal(domeExteriorMaterial.color.getHexString(), 'ba783f');
    assert.ok(!room.children.some((child) => child.userData?.isPointedArch === true));
    assert.equal(room.children.some((child) => child.userData?.isKarbandi === true), domeTransition === 'karbandi');
    ['north', 'east', 'south', 'west'].forEach((side) => {
      const roomWall = room.getObjectByName(`Room ${side} south-style wall`);
      assert.ok(roomWall, `Room ${side} wall must use the South wall construction system`);
      assert.equal(roomWall.userData.roomWallConstructionMethod, 'south-wall-options-and-opening-design');
    });
    const closedNorthPanel = room.getObjectByName('Room north south-style wall');
    assert.ok(closedNorthPanel, 'Room must have a continuous fourth wall instead of the Iwan portal');
    const northBounds = new THREE.Box3().setFromObject(closedNorthPanel);
    assert.ok(northBounds.min.x < -2.9 && northBounds.max.x > 2.9 && northBounds.max.y >= 3.99);
    assert.ok(!room.children.some((child) => ['north_sides', 'north_top'].includes(child.userData?.wallSide)), 'Room north wall must not retain Iwan side/top roles');
    const domeBounds = new THREE.Box3().setFromObject(dome);
    assert.ok(Math.abs(domeBounds.max.y - dome.userData.roomDomeArchConstruction.apexPoint[1]) < 0.01);
    if (domeTransition === 'karbandi') {
      const ribIndexes = new Set(room.children.filter((child) => child.userData?.isKarbandi === true && child.userData?.isKarbandiVisualGuide !== true).map((child) => child.userData.karbandiRibIndex));
      assert.equal(room.userData.karbandiConfiguredRibCount, 12);
      assert.ok(ribIndexes.size >= 1 && ribIndexes.size <= 12, 'Iwan auto clipping may fully remove unsupported Room ribs');
      const roomRibs = room.children.filter((child) => child.userData?.isKarbandi === true && child.userData?.isKarbandiVisualGuide !== true);
      assert.ok(roomRibs.every((rib) => Array.isArray(rib.userData.karbandiRoomBearingWallsUnclipped)));
    }
    if (domeTransition === 'muqarnas') {
      assert.equal(room.children.filter((child) => child.name.startsWith('Room Muqarnas transition course ')).length, 0, 'Room Muqarnas must come from a selected library assembly, not placeholder rings');
    }
  });
  const exposedBuilding = normalizeBuilding({ type: 'room', domeTransition: 'karbandi', domeDrumHeight: 0 });
  const exposedRoom = buildWallSystem(exposedBuilding, normalizeWallSystem({
    bricks: { ...DEFAULT_WALL_SYSTEM.bricks, enabled: false },
  }, exposedBuilding));
  assert.equal(exposedBuilding.domeTransitionCoverEnabled, false);
  assert.equal(exposedRoom.getObjectByName('Room karbandi square-to-circle transition cover'), undefined);
  const exposedRibs = exposedRoom.children.filter((child) => child.userData?.isKarbandi === true && child.userData?.isKarbandiVisualGuide !== true);
  assert.ok(exposedRibs.length, 'the uncovered transition must retain its Iwan Karbandi structure');
  const exposedDome = exposedRoom.getObjectByName('Room circular dome cover');
  const crownY = Math.max(...exposedRibs.map((rib) => {
    rib.geometry.computeBoundingBox();
    return rib.geometry.boundingBox.max.y;
  }));
  assert.equal(crownY, exposedDome.userData.roomDomeSpringY, 'without a drum, the dome must spring exactly at the Iwan-generated Karbandi rib crown');
  ['squinch', 'pendentive'].forEach((domeTransition) => {
    const structuralBuilding = normalizeBuilding({ type: 'room', domeTransition });
    const structuralRoom = buildWallSystem(structuralBuilding, normalizeWallSystem({
      bricks: { ...DEFAULT_WALL_SYSTEM.bricks, enabled: false },
    }, structuralBuilding));
    const label = `${domeTransition.charAt(0).toUpperCase()}${domeTransition.slice(1)}`;
    assert.ok(structuralRoom.children.some((child) => child.name.startsWith(`Room ${label} transition rib `)), `${label} must retain its structural ribs when uncovered`);
  });
  const uncoveredBuilding = normalizeBuilding({ type: 'room', domeEnabled: false });
  const uncovered = buildWallSystem(uncoveredBuilding, normalizeWallSystem({
    bricks: { ...DEFAULT_WALL_SYSTEM.bricks, enabled: false },
  }, uncoveredBuilding));
  assert.equal(uncovered.getObjectByName('Room circular dome cover'), undefined);
});

test('Room Squinch builds eight configurable arches, four wall and four corner roofs, and a sixteen-sided drum', () => {
  const building = normalizeBuilding({
    type: 'room',
    width: 6,
    length: 5,
    height: 4,
    domeTransition: 'squinch',
    domeTransitionCoverEnabled: true,
    domeDrumHeight: 0.7,
    domeTransitionSettings: {
      squinch: {
        facetCount: 20,
        tierCount: 4,
        ribWidth: 0.16,
        ribDepth: 0.22,
        ribColor: '#ff00aa',
        legGap: 0.08,
        legExtension: 0.5,
        springHeightOffset: 0.15,
        redOffset: -0.3,
        redRadius: 1.4,
        greenOffset: 0.9,
        greenHeightOffset: 0.75,
        roofThickness: 0.18,
      },
    },
  });
  assert.equal(building.domeTransitionSettings.squinch.archCount, 8, 'legacy facet/tier values cannot change the eight-arch topology');
  assert.equal(building.domeTransitionSettings.squinch.redRadius, undefined, 'the Squinch red radius must remain automatic');
  const room = buildWallSystem(building, normalizeWallSystem({
    bricks: { ...DEFAULT_WALL_SYSTEM.bricks, enabled: false },
  }, building));
  const arches = [];
  const roofPanels = [];
  room.traverse((child) => {
    if (child.userData?.roomSquinchArchCount === 8) arches.push(child);
    if (child.userData?.roomSquinchRoofPanelType) roofPanels.push(child);
  });
  assert.equal(arches.length, 8);
  assert.equal(arches.filter((arch) => arch.userData.roomSquinchArchType === 'wall').length, 4);
  assert.equal(arches.filter((arch) => arch.userData.roomSquinchArchType === 'corner').length, 4);
  assert.ok(arches.every((arch) => arch.userData.roomSquinchRibWidth === 0.16));
  assert.ok(arches.every((arch) => arch.userData.roomSquinchRibDepth === 0.22));
  const referenceArch = arches[0];
  const referenceProfile = JSON.stringify(referenceArch.geometry.userData.squinchArchProfile);
  const referenceOuterProfile = JSON.stringify(referenceArch.geometry.userData.squinchArchOuterProfile);
  const referenceInnerProfile = JSON.stringify(referenceArch.geometry.userData.squinchArchInnerProfile);
  assert.ok(arches.every((arch) => (
    Math.abs(
      arch.userData.roomSquinchArchHalfSpan
        - referenceArch.userData.roomSquinchArchHalfSpan,
    ) < 0.000001
    && Math.abs(
      arch.userData.roomSquinchArchCenterlineSetback
        - referenceArch.userData.roomSquinchArchCenterlineSetback,
    ) < 0.000001
    && JSON.stringify(arch.geometry.userData.squinchArchProfile) === referenceProfile
    && JSON.stringify(arch.geometry.userData.squinchArchOuterProfile) === referenceOuterProfile
    && JSON.stringify(arch.geometry.userData.squinchArchInnerProfile) === referenceInnerProfile
  )), 'all eight Squinch arches must retain one identical span, crown, and rib-band profile');
  assert.ok(arches
    .filter((arch) => arch.userData.roomSquinchArchType === 'wall')
    .every((arch) => arch.userData.roomSquinchRibInteriorProjection === DEFAULT_WALL_SYSTEM.bricks.brickWidth * 0.5));
  assert.ok(arches
    .filter((arch) => arch.userData.roomSquinchArchType === 'corner')
    .every((arch) => arch.userData.roomSquinchRibInteriorProjection === 0));
  assert.ok(arches.every((arch) => arch.userData.roomSquinchRibDepthGrowthDirection === 'outward-only-toward-room-wall-exterior'));
  assert.ok(arches
    .filter((arch) => arch.userData.roomSquinchArchType === 'wall')
    .every((arch) => arch.userData.roomSquinchRibInteriorAnchor === 'half-brick-length-inside-room-interior-wall-surface'));
  assert.ok(arches
    .filter((arch) => arch.userData.roomSquinchArchType === 'corner')
    .every((arch) => arch.userData.roomSquinchRibInteriorAnchor === 'corner-room-facing-edge-on-adjoining-vertical-wall-interior-edges'));
  arches
    .filter((arch) => arch.userData.roomSquinchArchType === 'corner')
    .forEach((arch) => {
      const endpointCandidates = [
        arch.geometry.userData.squinchArchOuterProfile[0],
        arch.geometry.userData.squinchArchInnerProfile[0],
        arch.geometry.userData.squinchArchOuterProfile.at(-1),
        arch.geometry.userData.squinchArchInnerProfile.at(-1),
      ];
      const leftEdge = endpointCandidates.reduce((best, point) => (point[0] < best[0] ? point : best));
      const rightEdge = endpointCandidates.reduce((best, point) => (point[0] > best[0] ? point : best));
      const leftWorld = arch.localToWorld(new THREE.Vector3(leftEdge[0], leftEdge[1], arch.userData.roomSquinchRibDepth / 2));
      const rightWorld = arch.localToWorld(new THREE.Vector3(rightEdge[0], rightEdge[1], arch.userData.roomSquinchRibDepth / 2));
      assert.ok(leftWorld.distanceTo(new THREE.Vector3(...arch.userData.roomSquinchCornerWallEdgeStart)) < 0.000001,
        'the first highlighted corner-rib leg edge must touch its vertical-wall interior face');
      assert.ok(rightWorld.distanceTo(new THREE.Vector3(...arch.userData.roomSquinchCornerWallEdgeEnd)) < 0.000001,
        'the second highlighted corner-rib leg edge must touch its vertical-wall interior face');
    });
  assert.ok(arches.every((arch) => {
    const chord = new THREE.Vector2(
      arch.userData.roomSquinchArchPlanEnd[0] - arch.userData.roomSquinchArchPlanStart[0],
      arch.userData.roomSquinchArchPlanEnd[1] - arch.userData.roomSquinchArchPlanStart[1],
    ).normalize();
    const outward = new THREE.Vector2(
      arch.userData.roomSquinchRibOutwardNormal[0],
      arch.userData.roomSquinchRibOutwardNormal[2],
    );
    return Math.abs(chord.dot(outward)) < 0.000001;
  }), 'every Squinch rib depth axis must remain normal to its wall or corner support edge');
  assert.ok(arches.every((arch) => arch.userData.roomSquinchRibColor === '#ff00aa'));
  assert.equal(building.domeTransitionSettings.squinch.legGap, 0, 'legacy saved gaps must be removed');
  assert.ok(arches.every((arch) => arch.userData.roomSquinchLegGap === 0));
  assert.ok(arches.every((arch) => arch.userData.roomSquinchLegExtension === 0.5));
  assert.ok(arches.every((arch) => arch.material.map == null));
  assert.ok(arches.every((arch) => arch.material.userData.squinchRibFinish === 'solid-color-no-brick-bond-or-texture'));
  assert.ok(arches.every((arch) => arch.material.color.getHexString() === 'ff00aa'));
  assert.ok(arches.every((arch) => {
    const profile = arch.geometry.userData.squinchArchProfile;
    return Math.abs(profile[0][1] - (arch.userData.roomSquinchSpringY - 0.5)) < 0.000001
      && Math.abs(profile.at(-1)[1] - (arch.userData.roomSquinchSpringY - 0.5)) < 0.000001;
  }));
  const expectedLegSetback = 0.16 / 2
    + (0.22 / 2) / Math.tan(THREE.MathUtils.degToRad(67.5));
  assert.ok(Math.abs(arches[0].userData.roomSquinchArchCenterlineSetback - expectedLegSetback) < 0.000001,
    'Squinch rib legs must retain only the automatic butt-joint setback with no added gap');
  assert.equal(roofPanels.length, 12);
  assert.equal(roofPanels.filter((panel) => panel.userData.roomSquinchRoofPanelType === 'wall').length, 4);
  assert.equal(roofPanels.filter((panel) => panel.userData.roomSquinchRoofPanelType === 'corner').length, 8);
  const drum = room.getObjectByName('Room dome cylindrical drum');
  assert.ok(drum);
  assert.equal(drum.userData.roomDomeDrumSideCount, 16);
  assert.equal(drum.geometry.parameters.segments, 16);
  assert.ok(Math.abs(
    drum.userData.roomDomeDrumBaseY
      - (arches[0].userData.roomDomeCrownY + building.domeTransitionSettings.squinch.ribWidth / 2)
  ) < 0.000001, 'the sixteen-sided drum must start at the actual outer top of the Squinch rib crown');
  assert.equal(drum.userData.roomDomeDrumBaseSource, 'actual-squinch-rib-outer-crown-top');
  assert.equal(drum.userData.roomDomeDrumThicknessSource, 'nominal-vertical-room-wall-thickness');
  assert.ok(Math.abs(drum.userData.roomDomeDrumThickness - building.wallThickness) < 0.000001);
  assert.equal(drum.userData.roomDomeDrumBrickColor, DEFAULT_WALL_SYSTEM.color);
  assert.equal(drum.userData.roomDomeDrumFinishSide, 'room_dome_drum');
  assert.equal(
    drum.userData.roomDomeDrumFinishIndependence,
    'independent-sixteen-sided-drum-not-shared-with-lower-octagon',
  );
  const dome = room.getObjectByName('Room circular dome cover');
  const expectedArchCenterlineApothem = Math.min(
    building.width + building.wallThickness,
    building.depth + building.wallThickness,
  ) / 2;
  const expectedFootprintApothem = expectedArchCenterlineApothem + building.wallThickness / 2;
  assert.ok(Math.abs(dome.userData.roomDomeRadius - expectedFootprintApothem) < 0.000001);
  assert.ok(Math.abs(drum.userData.roomSquinchFootprintApothem - expectedFootprintApothem) < 0.000001);
  assert.ok(Math.abs(drum.userData.roomSquinchArchCenterlineApothem - expectedArchCenterlineApothem) < 0.000001);
  assert.ok(Math.abs(
    drum.geometry.userData.roomDomeDrumOuterRadius * Math.cos(Math.PI / 16)
      - expectedFootprintApothem
  ) < 0.000001, 'each polygonal drum face must bear exactly on the Squinch arch footprint');
  assert.ok(Math.abs(
    drum.geometry.userData.roomDomeDrumInnerRadius * Math.cos(Math.PI / 16)
      - (expectedFootprintApothem - building.wallThickness)
  ) < 0.000001, 'the drum inner and outer faces must align with the equally thick octagonal spandrel faces');
  const coverAssembly = room.getObjectByName('Room squinch square-to-circle transition cover');
  assert.ok(coverAssembly);
  assert.equal(coverAssembly.userData.roomSquinchRoofAssembly.construction, 'arch-derived-three-part-cover');
  assert.ok(roofPanels
    .filter((panel) => panel.userData.roomSquinchRoofPanelType === 'corner')
    .every((panel) => panel.userData.roomSquinchCornerRoofMethod === 'two-ruled-vault-halves-meet-on-curved-inner-edge-groin'));
  assert.ok(roofPanels
    .filter((panel) => panel.userData.roomSquinchRoofPanelType === 'corner')
    .every((panel) => (
      panel.userData.roomSquinchCornerRoofBoundary === 'physical-rib-band-intersections-with-vertical-wall-interior-top-edges'
      && panel.userData.roomSquinchCornerRoofBrickStart === 'exact-shared-room-interior-wall-corner'
      && panel.userData.roomSquinchCornerRoofRibEdge === 'wall-clipped-outer-band-at-vertical-wall-interior-top-edge'
      && panel.userData.roomSquinchCornerRoofPlanFace === 'curved-groin-above-exact-shared-room-interior-corner'
      && Math.abs(panel.userData.roomSquinchCornerRoofIntersectionY - building.height) < 0.000001
      && panel.userData.roomSquinchCornerRoofCourseSourceWall === panel.userData.wallSide
      && panel.userData.roomSquinchCornerRoofWallFaceAnchor === true
      && panel.geometry.userData.roomSquinchCornerRoofCourseSide === panel.userData.wallSide
      && panel.geometry.userData.roomSquinchCornerRoofCourseMapping === 'world-y-and-adjoining-wall-longitudinal-axis'
      && panel.geometry.userData.roomSquinchCornerRoofIntersectionMethod === 'curved-groin-from-exact-shared-room-interior-corner'
      && panel.userData.roomSquinchRoofThicknessSource === 'nominal-vertical-room-wall-thickness'
      && panel.userData.roomSquinchRoofThicknessDirection === 'horizontal-plan-to-vertical-wall-exterior-faces'
      && Math.abs(panel.userData.roomSquinchRoofThickness - building.wallThickness) < 0.000001
    )));
  roofPanels
    .filter((panel) => panel.userData.roomSquinchRoofPanelType === 'corner')
    .forEach((panel) => {
      const groin = panel.userData.roomSquinchCornerRoofGroinCurve;
      const sharedCorner = panel.userData.roomSquinchCornerRoofSharedCornerPoint;
      assert.deepEqual(groin[0], sharedCorner);
      const sharedCornerPlanes = panel.userData.roomSquinchCornerRoofWallSides.map((side) => {
        if (side === 'north') return { axis: 2, value: -building.depth / 2 };
        if (side === 'south') return { axis: 2, value: building.depth / 2 };
        if (side === 'east') return { axis: 0, value: building.width / 2 };
        return { axis: 0, value: -building.width / 2 };
      });
      assert.ok(sharedCornerPlanes.every((plane) => (
        Math.abs(sharedCorner[plane.axis] - plane.value) < 0.000001
      )), 'both cover halves must meet where the two room interior wall planes intersect');
      assert.ok(Math.abs(sharedCorner[1] - building.height) < 0.000001);
      const anchor = panel.userData.roomSquinchCornerRoofWallFaceAnchorPoint;
      if (panel.userData.wallSide === 'north') assert.ok(Math.abs(anchor[2] + building.depth / 2) < 0.000001);
      if (panel.userData.wallSide === 'south') assert.ok(Math.abs(anchor[2] - building.depth / 2) < 0.000001);
      if (panel.userData.wallSide === 'east') assert.ok(Math.abs(anchor[0] - building.width / 2) < 0.000001);
      if (panel.userData.wallSide === 'west') assert.ok(Math.abs(anchor[0] + building.width / 2) < 0.000001);
      assert.ok(Math.abs(anchor[1] - building.height) < 0.000001);
      assert.ok(groin.length > 2);
      assert.ok(Math.abs(groin[0][1] - building.height) < 0.000001);
      assert.deepEqual(panel.geometry.userData.roomSquinchCornerRoofMeetingCurve, groin);
      assert.equal(panel.geometry.userData.roomSquinchCornerRoofMeetingLine, null);
      assert.equal(panel.geometry.index, null);
      assert.ok(panel.geometry.userData.roomSquinchCornerRoofWallSeatOverlap >= 0.008);
      assert.equal(
        panel.geometry.userData.roomSquinchCornerRoofNormalMode,
        'non-indexed-flat-face-normals-no-inward-cancellation',
      );
      assert.equal(
        panel.userData.roomSquinchCornerRoofWallSeat,
        'embedded-below-vertical-wall-top-for-flush-interior-joint',
      );
      const normals = panel.geometry.getAttribute('normal');
      assert.ok(Array.from({ length: normals.count }, (_, index) => (
        Math.hypot(normals.getX(index), normals.getY(index), normals.getZ(index))
      )).every((length) => length > 0.99), 'every corner-cover face must retain a valid lit normal');
      const start = new THREE.Vector3(...groin[0]);
      const end = new THREE.Vector3(...groin.at(-1));
      const chord = end.clone().sub(start);
      assert.ok(groin.slice(1, -1).some((point) => {
        const offset = new THREE.Vector3(...point).sub(start);
        return offset.clone().cross(chord).length() > 0.000001;
      }), 'the two corner-cover halves must meet on a curved groin, never a straight fan line');
      assert.equal(panel.geometry.userData.roomSquinchCornerRoofThicknessDirection, 'plan-to-room-wall-exterior-not-downward-y');
      assert.ok(Math.abs(panel.geometry.userData.roomSquinchCornerRoofThicknessVector[1]) < 0.000001);
    });
  assert.ok(roofPanels
    .filter((panel) => panel.userData.roomSquinchRoofPanelType === 'wall')
    .every((panel) => panel.userData.roomSquinchWallExtensionClip === 'vertical-room-wall-bricks-clipped-to-arch-underside'));
  const drumSkirt = room.getObjectByName('Room Squinch vertical drum brick extension clipped above arches');
  assert.ok(drumSkirt);
  assert.equal(drumSkirt.userData.roomSquinchDrumSkirtSideCount, 8);
  assert.equal(drumSkirt.userData.roomSquinchDrumSkirtClip, 'drum-wall-starts-immediately-above-actual-rib-outer-edges');
  assert.equal(drumSkirt.userData.roomSquinchDrumSkirtExtrusion, 'constant-arch-plane-xz-with-no-inward-sixteen-face-bends');
  assert.equal(drumSkirt.children.length, 8);
  drumSkirt.children.forEach((panel) => {
    assert.equal(panel.userData.roomSquinchVerticalExtrusion, true);
    assert.equal(panel.userData.wallSide, 'room_dome_transition');
    assert.equal(panel.userData.roomSquinchFinishSide, 'room_dome_transition');
    assert.equal(
      panel.userData.roomSquinchFinishIndependence,
      'lower-octagon-independent-from-sixteen-sided-drum',
    );
    assert.equal(
      panel.geometry.userData.roomSquinchExteriorBrickMapping,
      'planar-face-x-and-world-y-straight-courses',
    );
    assert.equal(panel.userData.roomSquinchDrumWallBottomBoundary, 'actual-arch-upper-edge-no-below-spring-wedges');
    assert.equal(panel.geometry.userData.roomSquinchVerticalSpandrelBottomBoundary, 'actual-rib-outer-profile-with-spring-top-joint-extensions');
    const positions = panel.geometry.getAttribute('position');
    const planDepths = new Set(Array.from(
      { length: positions.count },
      (_, index) => positions.getZ(index).toFixed(6),
    ));
    assert.equal(planDepths.size, 2, 'each lower drum panel must stay on one vertical arch plane without an inward fold');
  });
  assert.equal(drum.userData.roomSquinchBrickCourseMapping, 'shared-metric-circumference-and-drum-foot-origin');
  assert.equal(drumSkirt.userData.roomSquinchBrickCourseMapping, 'one-continuous-unequal-octagon-perimeter-running-course-aligned-to-drum-foot');
  assert.equal(drumSkirt.userData.roomSquinchSpandrelJoint, 'four-widened-corner-faces-overlap-four-straight-faces-with-continuous-bond-phase');
  let expectedSpandrelPhase = 0;
  drumSkirt.children.forEach((panel) => {
    assert.ok(Math.abs(panel.userData.roomSquinchSpandrelPhase - expectedSpandrelPhase) < 0.000001);
    assert.equal(panel.userData.roomSquinchSpandrelPerimeter, drumSkirt.userData.roomSquinchSpandrelPerimeter);
    assert.equal(
      panel.userData.roomSquinchSpandrelJoint,
      panel.userData.roomSquinchArchIndex % 2 === 1
        ? 'widened-corner-solid-overlaps-adjoining-straight-faces-no-gap'
        : 'straight-face-embedded-in-widened-corner-solids-no-gap',
    );
    assert.equal(panel.userData.roomSquinchSpandrelThicknessSource, 'nominal-vertical-room-wall-thickness');
    assert.equal(panel.userData.roomSquinchSpandrelExteriorJoint, 'overlapping-unequal-octagon-end-solids-no-gap');
    assert.equal(panel.geometry.userData.roomSquinchExteriorJoint, 'shared-45-degree-octagon-miter-no-gap');
    assert.equal(
      panel.geometry.userData.roomSquinchExteriorArchBoundary,
      'unscaled-rib-outer-profile-with-mitered-joint-side-infill',
    );
    assert.ok(Math.abs(panel.userData.roomSquinchSpandrelThickness - building.wallThickness) < 0.000001);
    if (panel.userData.roomSquinchArchIndex % 2 === 1) {
      assert.equal(panel.userData.roomSquinchSpandrelFaceSizing, 'corner-face-widened-to-cover-complete-identical-arch-band');
      assert.ok(
        panel.userData.roomSquinchSpandrelSpan / 2
          >= panel.userData.roomSquinchSpandrelArchCoverHalfSpan,
        'each wider corner wall must cover the complete identical corner-arch band',
      );
    } else {
      assert.equal(panel.userData.roomSquinchSpandrelFaceSizing, 'straight-face-retains-room-wall-footprint');
    }
    const profile = panel.geometry.userData.roomSquinchVerticalSpandrelProfile;
    assert.ok(Math.abs(profile[0][0] + panel.userData.roomSquinchSpandrelSpan / 2) < 0.000001);
    assert.ok(Math.abs(profile.at(-1)[0] - panel.userData.roomSquinchSpandrelSpan / 2) < 0.000001);
    assert.ok(Math.abs(profile[0][1] - profile[1][1]) < 0.000001,
      'the drum wall must start at the left arch spring-top edge, never below it');
    assert.ok(Math.abs(profile.at(-1)[1] - profile.at(-2)[1]) < 0.000001,
      'the drum wall must start at the right arch spring-top edge, never below it');
    expectedSpandrelPhase += panel.userData.roomSquinchSpandrelSpan;
  });
  assert.ok(Math.abs(expectedSpandrelPhase - drumSkirt.userData.roomSquinchSpandrelPerimeter) < 0.000001);
  assert.ok(roofPanels
    .filter((panel) => panel.userData.roomSquinchRoofPanelType === 'corner')
    .every((panel) => panel.userData.roomSquinchBrickCourseMapping === 'continuous-from-adjoining-vertical-wall-world-y-courses'));
  assert.ok(arches.every((arch) => arch.userData.roomSquinchArchJoint === 'symmetrically-scaled-full-arch-butt-joint'));
  assert.ok(arches.every((arch) => arch.userData.roomSquinchArchCenterlineSetback > 0));
  assert.ok(arches.every((arch) => arch.userData.roomSquinchArchScale > 0 && arch.userData.roomSquinchArchScale < 1));
  assert.ok(arches.every((arch) => {
    const profileStartX = arch.geometry.userData.squinchArchProfile[0][0];
    const profileEndX = arch.geometry.userData.squinchArchProfile.at(-1)[0];
    return arch.geometry.userData.squinchArchProfileComplete === true
      && arch.geometry.userData.squinchArchOuterProfile.length === arch.geometry.userData.squinchArchProfile.length
      && Math.abs(profileStartX + arch.userData.roomSquinchArchHalfSpan) < 0.000001
      && Math.abs(profileEndX - arch.userData.roomSquinchArchHalfSpan) < 0.000001;
  }), 'each scaled arch must preserve both complete springing legs and its crown');
  const thickerRibBuilding = normalizeBuilding({
    ...building,
    domeTransitionSettings: {
      ...building.domeTransitionSettings,
      squinch: { ...building.domeTransitionSettings.squinch, ribDepth: 0.62 },
    },
  });
  const thickerRibRoom = buildWallSystem(thickerRibBuilding, normalizeWallSystem({
    bricks: { ...DEFAULT_WALL_SYSTEM.bricks, enabled: false },
  }, thickerRibBuilding));
  const thickerArches = [];
  thickerRibRoom.traverse((child) => {
    if (child.userData?.roomSquinchArchCount === 8) thickerArches.push(child);
  });
  thickerArches.sort((a, b) => a.userData.roomSquinchArchIndex - b.userData.roomSquinchArchIndex);
  arches.sort((a, b) => a.userData.roomSquinchArchIndex - b.userData.roomSquinchArchIndex);
  arches.forEach((arch, index) => {
    const thickerArch = thickerArches[index];
    assert.ok(Math.abs(
      thickerArch.userData.roomSquinchRibRoomFaceRadialOffset
        - arch.userData.roomSquinchRibRoomFaceRadialOffset
    ) < 0.000001, 'changing rib thickness must not move the room-facing rib surface');
    assert.ok(Math.abs(
      thickerArch.userData.roomSquinchRibCenterRadialOffset
        - arch.userData.roomSquinchRibCenterRadialOffset
        - 0.2
    ) < 0.000001, 'the additional rib thickness must grow only toward the exterior');
  });
  const referenceHalfWidth = (building.width + building.wallThickness) / 2;
  const referenceHalfDepth = (building.depth + building.wallThickness) / 2;
  const cornerCut = Math.min(referenceHalfWidth, referenceHalfDepth) * (2 - Math.sqrt(2));
  const referenceSpringY = building.height + building.domeTransitionSettings.squinch.springHeightOffset;
  const referenceConstruction = pointedArchConstruction(
    0,
    referenceHalfWidth - cornerCut,
    referenceSpringY,
    building.domeTransitionSettings.squinch.greenOffset,
    referenceSpringY + building.domeTransitionSettings.squinch.greenHeightOffset,
    { redOffset: building.domeTransitionSettings.squinch.redOffset },
  );
  assert.ok(Math.abs(
    dome.userData.roomDomeSpringY
      - (referenceConstruction.apexPoint.y + building.domeTransitionSettings.squinch.ribWidth / 2 + building.domeDrumHeight)
  ) < 0.000001, 'the north-wall reference arch apex must automatically set the Squinch transition height');
  const differentLegacyHeight = normalizeBuilding({ ...building, domeTransitionHeight: 9 });
  const differentLegacyHeightRoom = buildWallSystem(differentLegacyHeight, normalizeWallSystem({
    bricks: { ...DEFAULT_WALL_SYSTEM.bricks, enabled: false },
  }, differentLegacyHeight));
  assert.ok(Math.abs(
    differentLegacyHeightRoom.getObjectByName('Room circular dome cover').userData.roomDomeSpringY
      - dome.userData.roomDomeSpringY
  ) < 0.000001, 'legacy transition height must not affect a Squinch');

  const guideScene = Object.create(MehrazScene.prototype);
  guideScene.building = building;
  guideScene.walls = normalizeWallSystem({ bricks: { ...DEFAULT_WALL_SYSTEM.bricks, enabled: false } }, building);
  guideScene.squinchArchEditing = true;
  guideScene.renderer = null;
  const guideRoot = new THREE.Group();
  guideScene.addRoomSquinchArchConstructionGuides(guideRoot);
  const guide = guideRoot.getObjectByName('Room Squinch north-wall reference arch construction circles and radii');
  assert.ok(guide);
  assert.equal(guide.userData.roomSquinchReferenceWall, 'north');
  assert.equal(guide.userData.roomSquinchReferenceRib, true);
  assert.ok(guide.children.some((child) => child.userData?.archConstructionRole === 'red-circle'));
  assert.ok(guide.children.some((child) => child.userData?.archConstructionRole === 'green-circle'));
  assert.ok(guide.children.some((child) => child.name.includes('radius')));

  guideScene.sectionViewEnabled = true;
  const sectionGuideRoot = new THREE.Group();
  guideScene.addRoomSquinchArchConstructionGuides(sectionGuideRoot);
  const sectionSquinchGuide = sectionGuideRoot.getObjectByName('Room Squinch north-wall reference arch construction circles and radii');
  assert.equal(sectionSquinchGuide.userData.archConstructionGuidePlane, 'room-north-south-section-facing-east-camera');
  const sectionHorizontal = new THREE.Vector3(1, 0, 0).applyQuaternion(
    sectionSquinchGuide.getWorldQuaternion(new THREE.Quaternion()),
  );
  assert.ok(Math.abs(sectionHorizontal.x) < 0.000001 && sectionHorizontal.z > 0.999999,
    'the Squinch arch diagram must face the east-side section camera');

  guideScene.buildingGroup = new THREE.Group();
  guideScene.buildingGroup.add(room);
  guideScene.selectedWallSide = 'room_dome';
  const sectionDomeGuideRoot = new THREE.Group();
  guideScene.addRoomDomeArchConstructionGuides(sectionDomeGuideRoot);
  const sectionDomeGuide = sectionDomeGuideRoot.getObjectByName('Room dome symmetric red and green construction circles');
  assert.equal(sectionDomeGuide.userData.archConstructionGuidePlane, 'room-north-south-section-facing-east-camera');
  const domeSectionHorizontal = new THREE.Vector3(1, 0, 0).applyQuaternion(
    sectionDomeGuide.getWorldQuaternion(new THREE.Quaternion()),
  );
  assert.ok(Math.abs(domeSectionHorizontal.x) < 0.000001 && domeSectionHorizontal.z > 0.999999,
    'the dome diagram must face the east-side section camera');
  guideScene.selectedWallSide = 'room_dome_inner';
  const sectionInnerDomeGuideRoot = new THREE.Group();
  guideScene.addRoomDomeArchConstructionGuides(sectionInnerDomeGuideRoot);
  const sectionInnerDomeGuide = sectionInnerDomeGuideRoot.getObjectByName('Room inner dome symmetric red and green construction circles');
  assert.equal(sectionInnerDomeGuide.userData.archConstructionGuidePlane, 'room-north-south-section-facing-east-camera');
  const innerDomeSectionHorizontal = new THREE.Vector3(1, 0, 0).applyQuaternion(
    sectionInnerDomeGuide.getWorldQuaternion(new THREE.Quaternion()),
  );
  assert.ok(Math.abs(innerDomeSectionHorizontal.x) < 0.000001 && innerDomeSectionHorizontal.z > 0.999999,
    'the inner-dome diagram must face the east-side section camera');

  const unevenWalls = normalizeWallSystem({
    bricks: { ...DEFAULT_WALL_SYSTEM.bricks, enabled: false },
    roomWallThicknesses: { west: 0.2, east: 0.6, north: 0.3, south: 0.7 },
  }, building);
  const unevenRoom = buildWallSystem(building, unevenWalls);
  const expectedCenterX = (0.6 - 0.2) / 4;
  const expectedCenterZ = (0.7 - 0.3) / 4;
  assert.ok(Math.abs(unevenRoom.userData.roomSquinchWallCenterlineFootprint.center[0] - expectedCenterX) < 0.000001);
  assert.ok(Math.abs(unevenRoom.userData.roomSquinchWallCenterlineFootprint.center[1] - expectedCenterZ) < 0.000001);
  const unevenDome = unevenRoom.getObjectByName('Room circular dome cover');
  const unevenDrum = unevenRoom.getObjectByName('Room dome cylindrical drum');
  assert.ok(Math.abs(unevenDome.userData.roomDomeCenter[0] - expectedCenterX) < 0.000001);
  assert.ok(Math.abs(unevenDome.userData.roomDomeCenter[1] - expectedCenterZ) < 0.000001);
  assert.ok(Math.abs(unevenDrum.position.x - expectedCenterX) < 0.000001);
  assert.ok(Math.abs(unevenDrum.position.z - expectedCenterZ) < 0.000001);
  const unevenNorthArch = unevenRoom.getObjectByName('Room Squinch transition rib arch 1');
  assert.ok(Math.abs(
    unevenNorthArch.userData.roomSquinchArchPlanStart[1]
      - (-building.depth / 2 - unevenWalls.roomWallThicknesses.north / 2)
  ) < 0.000001, 'the north Squinch arch must sit on the north vertical-wall centerline');
});

test('Room Squinch uses an independent masonry extra leg with the ring between it and the outer dome', () => {
  const legExtension = 0.8;
  const building = normalizeBuilding({
    type: 'room',
    width: 6,
    length: 5,
    height: 4,
    domeTransition: 'squinch',
    domeDrumHeight: 0.7,
    domeArch: { legExtension },
  });
  const supportWalls = normalizeWallSystem({}, building);
  const room = buildWallSystemWithCanvasMock(building, supportWalls);
  const outerDome = room.getObjectByName('Room circular dome cover');
  const innerDome = room.getObjectByName('Room inner dome cover');
  const drum = room.getObjectByName('Room dome cylindrical drum');
  const extraLeg = room.getObjectByName('Room dome independent extra leg');
  const ring = room.getObjectByName('Room dome springing ring');
  const supports = room.getObjectByName('Between domes supporting walls');
  assert.ok(outerDome && innerDome && drum && extraLeg && ring && supports);
  assert.equal(supports.children.length, 8);
  assert.equal(supports.userData.betweenDomeSupportWallCoverage, 60);
  assert.ok(supports.children.every((support) => (
    support.userData.isBetweenDomeSupportWall === true
    && support.userData.betweenDomeSupportWallThicknessSource === 'one-normal-brick-width'
    && Math.abs(support.userData.betweenDomeSupportWallThickness - DEFAULT_WALL_SYSTEM.bricks.brickWidth) < 0.000001
  )));
  supports.children.forEach((support, index) => {
    assert.ok(Math.abs(support.rotation.y + index * Math.PI / 4) < 0.000001,
      'the eight cavity supports must rotate radially toward the dome center');
  });
  const supportMaterial = supports.children[0].material;
  const northWallBody = room.getObjectByName('Room north south-style wall')
    .children.find((child) => child.userData?.isRoomWallBody === true);
  const northInteriorMaterial = northWallBody.material[northWallBody.userData.roomWallInteriorMaterialIndex];
  assert.equal(supportMaterial.userData.brickBondSelection, 'running');
  assert.equal(supportMaterial.userData.betweenDomeSupportWallCourseSource, 'room-vertical-walls-world-y-origin');
  assert.equal(supportMaterial.userData.betweenDomeSupportWallBrickWidth, supportWalls.bricks.brickWidth);
  assert.equal(supportMaterial.userData.betweenDomeSupportWallBrickHeight, supportWalls.bricks.brickHeight);
  assert.equal(supportMaterial.userData.betweenDomeSupportWallBrickScale, 1);
  assert.ok(Math.abs(supportMaterial.map.repeat.y - northInteriorMaterial.map.repeat.y) < 0.000001,
    'supporting-wall courses must use the exact vertical-wall brick-height module');
  assert.ok(Math.abs(supportMaterial.map.offset.y - northInteriorMaterial.map.offset.y) < 0.000001,
    'supporting-wall courses must share the vertical walls world-Y course origin');
  const supportGeometry = supports.children[0].geometry;
  assert.ok(Math.abs(
    supportGeometry.userData.betweenDomeSupportWallCenterwardRadius
      - supportGeometry.userData.betweenDomeSupportWallFootRadius * 0.2
  ) < 0.000001, '60% must extend 0.30R toward the center from the R/2 midpoint');
  assert.ok(Math.abs(
    supportGeometry.userData.betweenDomeSupportWallOutwardRadius
      - supportGeometry.userData.betweenDomeSupportWallFootRadius * 0.8
  ) < 0.000001, '60% must extend 0.30R toward the dome foot from the R/2 midpoint');
  assert.ok(Math.abs(
    supportGeometry.userData.betweenDomeSupportWallReferenceInwardFromFoot
      - supportGeometry.userData.betweenDomeSupportWallFootRadius / 2
  ) < 0.000001, 'the supporting wall reference must stay at the R/2 midpoint');
  assert.ok(Math.abs(
    supportGeometry.userData.betweenDomeSupportWallHalfCoverageExtent
      - supportGeometry.userData.betweenDomeSupportWallFootRadius * 0.3
  ) < 0.000001, '60% of each R/2 half must extend 0.30R on each side');
  assert.equal(
    supportGeometry.userData.betweenDomeSupportWallCoverageDirection,
    'symmetric-about-r-half-midpoint-of-dome-radius',
  );
  const fullSupportBuilding = normalizeBuilding({
    ...building,
    betweenDomeSupportWallsCoverage: 100,
  });
  const fullSupportRoom = buildWallSystem(fullSupportBuilding, normalizeWallSystem({
    bricks: { ...DEFAULT_WALL_SYSTEM.bricks, enabled: false },
  }, fullSupportBuilding));
  const fullSupportGeometry = fullSupportRoom
    .getObjectByName('Between domes supporting walls').children[0].geometry;
  assert.ok(Math.abs(fullSupportGeometry.userData.betweenDomeSupportWallCenterwardRadius) < 0.000001);
  assert.ok(Math.abs(
    fullSupportGeometry.userData.betweenDomeSupportWallOutwardRadius
      - fullSupportGeometry.userData.betweenDomeSupportWallFootRadius
  ) < 0.000001, '100% must cover the complete radius from center to dome foot');
  const drumTopY = drum.userData.roomDomeDrumBaseY + drum.userData.roomDomeDrumHeight;
  assert.ok(Math.abs(outerDome.userData.roomDomeFootY - drumTopY - legExtension) < 0.000001);
  assert.ok(Math.abs(outerDome.userData.roomDomeSpringY - drumTopY - legExtension) < 0.000001);
  assert.equal(outerDome.userData.roomDomeLegExtension, legExtension);
  assert.equal(outerDome.userData.roomDomeLegScope, 'independent-extra-leg-section-below-springing-ring');
  assert.equal(extraLeg.userData.wallSide, 'room_dome_extra_leg');
  assert.equal(extraLeg.userData.roomDomePart, 'dome-extra-leg');
  assert.equal(extraLeg.userData.roomDomeExtraLegHeight, legExtension);
  assert.ok(Math.abs(extraLeg.userData.roomDomeExtraLegBaseY - drumTopY) < 0.000001);
  assert.ok(Math.abs(extraLeg.userData.roomDomeExtraLegTopY - outerDome.userData.roomDomeSpringY) < 0.000001);
  assert.ok(Math.abs(innerDome.userData.roomDomeSpringY - drumTopY) < 0.000001,
    'the independent inner dome must continue to spring directly from the drum top');
  const drumInnerFaceApothem = drum.geometry.userData.roomDomeDrumInnerRadius * Math.cos(Math.PI / 16);
  const innerRoomProfile = innerDome.geometry.userData.domeShellRoomFacingProfile;
  const innerCavityProfile = innerDome.geometry.userData.domeShellCavityFacingProfile;
  assert.ok(Math.abs(innerRoomProfile.at(-1)[0] - drumInnerFaceApothem) < 0.000001,
    'the inner dome room-facing spring edge must be flush with the Squinch drum interior face');
  assert.equal(
    innerDome.userData.roomDomeSpringAlignment,
    'room-facing-shell-flush-with-sixteen-sided-drum-inner-face-apothem',
  );
  innerRoomProfile.forEach(([roomRadius, roomY], index) => {
    const [cavityRadius, cavityY] = innerCavityProfile[index];
    assert.ok(Math.abs(
      Math.hypot(cavityRadius - roomRadius, cavityY - roomY)
        - innerDome.userData.roomDomeShellThickness
    ) < 0.000001, 'the aligned inner dome must retain its one-brick normal thickness');
  });
  assert.ok(Math.abs(ring.position.y - extraLeg.userData.roomDomeExtraLegTopY) < 0.000001,
    'the ring must sit between the independent extra leg and outer dome');
  assert.equal(ring.userData.roomDomeRingAnchor, 'between-independent-extra-leg-and-outer-cover');
  const outerProfile = outerDome.geometry.userData.domeShellOuterProfile;
  assert.ok(Math.abs(outerProfile.at(-1)[1] - outerDome.userData.roomDomeSpringY) < 0.000001,
    'the outer-dome mesh must start above the ring without containing the extra leg');

  const nonSquinchBuilding = normalizeBuilding({
    ...building,
    domeTransition: 'pendentive',
  });
  const nonSquinchRoom = buildWallSystem(nonSquinchBuilding, normalizeWallSystem({
    bricks: { ...DEFAULT_WALL_SYSTEM.bricks, enabled: false },
  }, nonSquinchBuilding));
  assert.equal(nonSquinchRoom.getObjectByName('Room circular dome cover').userData.roomDomeLegExtension, legExtension,
    'the outer-cover leg setting must remain available for every transition');
  assert.equal(nonSquinchRoom.getObjectByName('Room dome independent extra leg').userData.roomDomeExtraLegHeight, legExtension);
});

test('Room Cone and octagonal Pyramid covers replace only the exterior dome shell', () => {
  const makeCover = (domeCoverType, domeCoverHeight) => {
    const building = normalizeBuilding({
      type: 'room',
      width: 6,
      length: 5,
      height: 4,
      domeTransition: 'squinch',
      domeCoverType,
      domeCoverHeight,
      domeArch: { legExtension: 0.5 },
    });
    return {
      building,
      room: buildWallSystem(building, normalizeWallSystem({
        bricks: { ...DEFAULT_WALL_SYSTEM.bricks, enabled: false },
      }, building)),
    };
  };

  const cone = makeCover('cone', 3.4);
  const coneCover = cone.room.getObjectByName('Room circular dome cover');
  const coneInnerDome = cone.room.getObjectByName('Room inner dome cover');
  assert.ok(coneCover && coneInnerDome);
  assert.equal(coneCover.userData.roomDomeCoverType, 'cone');
  assert.equal(coneCover.userData.roomDomeCoverHeight, 3.4);
  assert.equal(coneCover.userData.roomDomeRise, 3.4);
  assert.equal(coneCover.userData.roomDomePlanSides, 64);
  assert.equal(coneCover.userData.roomDomeProfileSystem, 'straight-cone-profile-revolved');
  assert.equal(coneCover.userData.roomDomeArchConstruction, null);
  assert.equal(coneInnerDome.userData.roomDomeProfileSystem, 'independent-four-centre-red-green-circle-arch-revolved',
    'the inner shell must remain an independently designed dome');
  const coneProfile = coneCover.geometry.userData.domeShellOuterProfile;
  const coneExtraLeg = cone.room.getObjectByName('Room dome independent extra leg');
  assert.ok(Math.abs(coneProfile[0][1] - coneCover.userData.roomDomeSpringY - 3.4) < 0.000001);
  assert.ok(Math.abs(coneProfile[1][0] - coneCover.userData.roomDomeRadius) < 0.000001);
  assert.equal(coneCover.userData.roomDomeLegExtension, 0.5);
  assert.ok(Math.abs(coneProfile.at(-1)[1] - coneCover.userData.roomDomeFootY) < 0.000001);
  assert.equal(coneProfile.length, 2, 'the cone cover profile must not contain the independent extra leg');
  assert.equal(coneExtraLeg.userData.roomDomeExtraLegHeight, 0.5);

  const pyramid = makeCover('pyramid', 2.7);
  const pyramidCover = pyramid.room.getObjectByName('Room circular dome cover');
  const pyramidDrum = pyramid.room.getObjectByName('Room dome cylindrical drum');
  assert.equal(pyramidCover.userData.roomDomeCoverType, 'pyramid');
  assert.equal(pyramidCover.userData.roomDomeRise, 2.7);
  assert.equal(pyramidCover.userData.roomDomePlanSides, 8);
  assert.equal(pyramidCover.userData.roomDomeProfileSystem, 'straight-octagonal-pyramid-profile');
  assert.equal(pyramidCover.userData.roomDomeLegExtension, 0.5);
  const pyramidProfile = pyramidCover.geometry.userData.domeShellOuterProfile;
  const pyramidExtraLeg = pyramid.room.getObjectByName('Room dome independent extra leg');
  assert.ok(Math.abs(pyramidProfile.at(-1)[1] - pyramidCover.userData.roomDomeFootY) < 0.000001);
  assert.equal(pyramidProfile.length, 2, 'the pyramid cover profile must not contain the independent extra leg');
  assert.equal(pyramidExtraLeg.userData.roomDomeExtraLegSideCount, 8);
  assert.ok(Math.abs(
    pyramidCover.userData.roomDomeGeometryBaseRadius * Math.cos(Math.PI / 8)
      - pyramidCover.userData.roomDomeRadius
  ) < 0.000001, 'the octagonal pyramid face apothem must match the transition footprint');
  assert.equal(pyramidDrum.userData.roomDomeDrumSideCount, 8);
  assert.equal(pyramidDrum.geometry.parameters.segments, 8);
  assert.equal(pyramidDrum.userData.roomDomeDrumPlan, 'eight-sided-polygon-aligned-with-octagonal-pyramid');
  assert.ok(Math.abs(
    pyramidDrum.geometry.userData.roomDomeDrumOuterRadius
      - pyramidCover.userData.roomDomeGeometryBaseRadius
  ) < 0.000001, 'the octagonal drum and pyramid must share the same outer footprint');

  ['cone', 'pyramid'].forEach((domeCoverType) => {
    const textured = makeCover(domeCoverType, 2.8);
    const texturedRoom = buildWallSystemWithCanvasMock(
      textured.building,
      normalizeWallSystem({}, textured.building),
    );
    const cover = texturedRoom.getObjectByName('Room circular dome cover');
    const exterior = cover.material[cover.userData.roomDomeExteriorMaterialIndex];
    const interior = cover.material[cover.userData.roomDomeInteriorMaterialIndex];
    assert.ok(Number.isInteger(exterior.map.repeat.x), `${domeCoverType} exterior bond must close at its circumference seam`);
    assert.ok(Number.isInteger(interior.map.repeat.x), `${domeCoverType} interior bond must close at its circumference seam`);
    assert.equal(exterior.userData.brickBondSeamlessCircumference, true);
    assert.equal(interior.userData.brickBondSeamlessCircumference, true);
    const expectedConvergingMapping = domeCoverType === 'pyramid'
      ? 'facet-edge-distance-rays-converge-to-pyramid-apex'
      : 'angular-rays-converge-to-cone-apex';
    assert.equal(exterior.userData.domeBondMapping, expectedConvergingMapping);
    assert.equal(interior.userData.domeBondMapping, expectedConvergingMapping);
    assert.equal(exterior.userData.domeBondFacetCount, domeCoverType === 'pyramid' ? 8 : 0);
    const shader = {
      uniforms: {},
      vertexShader: '#include <common>\n#include <begin_vertex>\n#include <worldpos_vertex>',
      fragmentShader: '#include <common>\n#include <map_fragment>',
    };
    exterior.onBeforeCompile(shader, {});
    assert.match(shader.fragmentShader, /domeBondPerimeterU/);
    assert.match(shader.fragmentShader, /vDomeBondPosition/);
    assert.match(shader.fragmentShader, /tan\(domeBondDelta\)/);
    assert.equal(
      cover.geometry.userData.domeUvCircumferenceClosure,
      'single-continuous-zero-to-one-loop-shared-by-exterior-and-interior',
    );
    assert.equal(
      cover.geometry.userData.domeUvFacetPolicy,
      domeCoverType === 'pyramid'
        ? 'facet-edge-distance-rays-converge-to-pyramid-apex'
        : 'angular-rays-converge-to-cone-apex',
    );
    const interiorBaseRadius = cover.geometry.userData.domeShellInnerProfile.at(-1)[0];
    const expectedInteriorPerimeter = domeCoverType === 'pyramid'
      ? 8 * 2 * interiorBaseRadius * Math.sin(Math.PI / 8)
      : Math.PI * 2 * interiorBaseRadius;
    assert.ok(Math.abs(
      cover.userData.roomDomeInteriorBondPerimeter - expectedInteriorPerimeter
    ) < 0.000001, `${domeCoverType} interior bond must use its own exact closed perimeter`);
    assert.ok(cover.userData.roomDomeInteriorBondPerimeter < cover.userData.roomDomeExteriorBondPerimeter);
    if (domeCoverType === 'pyramid') {
      cover.material.forEach((material) => assert.equal(material.flatShading, true));
    }
  });

  const ringVisibility = { dome: false, cone: true, pyramid: false };
  Object.entries(ringVisibility).forEach(([domeCoverType, visible]) => {
    const building = normalizeBuilding({
      type: 'room',
      domeTransition: 'squinch',
      domeCoverType,
      domeOuterRingEnabledByCoverType: ringVisibility,
    });
    const room = buildWallSystem(building, normalizeWallSystem({
      bricks: { ...DEFAULT_WALL_SYSTEM.bricks, enabled: false },
    }, building));
    const ring = room.getObjectByName('Room dome springing ring');
    const cover = room.getObjectByName('Room circular dome cover');
    assert.equal(ring.visible, visible, `${domeCoverType} must retain its independent outer-ring visibility`);
    assert.equal(ring.userData.roomDomeRingCoverType, domeCoverType);
    assert.equal(ring.userData.roomDomeRingFootprint, domeCoverType === 'pyramid' ? 'polygon' : 'circle');
    assert.equal(ring.userData.roomDomeRingSideCount, domeCoverType === 'pyramid' ? 8 : 64);
    assert.equal(ring.userData.roomDomeRingProfile, 'circle');
    assert.equal(ring.userData.roomDomeRingFootprintSource, 'selected-outer-cover-base');
    assert.equal(ring.geometry.userData.roomDomeRingProfile, 'circle');
    assert.equal(ring.geometry.userData.roomDomeRingProfileSegments, 10);
    if (domeCoverType === 'pyramid') {
      assert.equal(ring.geometry.userData.roomDomeRingFootprint, 'polygon');
      assert.equal(ring.geometry.userData.roomDomeRingSideCount, 8);
      assert.ok(Math.abs(
        ring.geometry.userData.roomDomeRingCenterlineApothem - cover.userData.roomDomeRadius
      ) < 0.000001, 'the round-profile ring centerline must share the pyramid base apothem');
      const ringPositions = ring.geometry.getAttribute('position');
      const centerlineVertexRadius = cover.userData.roomDomeRadius / Math.cos(Math.PI / 8);
      const centerlineAngle = -Math.PI / 8;
      const centerlineVertex = new THREE.Vector3(
        Math.sin(centerlineAngle) * centerlineVertexRadius,
        0,
        Math.cos(centerlineAngle) * centerlineVertexRadius,
      );
      for (let profileIndex = 0; profileIndex < 10; profileIndex += 1) {
        assert.ok(Math.abs(
          new THREE.Vector3().fromBufferAttribute(ringPositions, profileIndex)
            .distanceTo(centerlineVertex)
          - ring.geometry.userData.roomDomeRingTubeRadius
        ) < 0.000001, 'every Pyramid ring cross-section vertex must lie on its circular tube profile');
      }
      assert.equal(ring.rotation.x, 0);
    } else {
      assert.equal(ring.geometry.userData.roomDomeRingFootprint, 'circle');
      assert.equal(ring.geometry.userData.roomDomeRingSideCount, 64);
      assert.equal(ring.geometry.type, 'TorusGeometry');
      assert.ok(Math.abs(
        ring.geometry.userData.roomDomeRingCenterlineRadius - cover.userData.roomDomeRadius
      ) < 0.000001, `${domeCoverType} ring centerline must use the circular springing radius`);
      assert.ok(Math.abs(ring.rotation.x - Math.PI / 2) < 0.000001);
    }
  });

  const customPolygonBuilding = normalizeBuilding({
    type: 'room',
    roomPlanShape: 'polygon',
    roomPolygonSides: 7,
    domeCoverType: 'pyramid',
  });
  const customPolygonRing = buildWallSystem(customPolygonBuilding, normalizeWallSystem({
    bricks: { ...DEFAULT_WALL_SYSTEM.bricks, enabled: false },
  }, customPolygonBuilding)).getObjectByName('Room dome springing ring');
  assert.equal(customPolygonRing.userData.roomDomeRingFootprint, 'polygon');
  assert.equal(customPolygonRing.userData.roomDomeRingSideCount, 7);
  assert.equal(customPolygonRing.userData.roomDomeRingProfile, 'circle');
  assert.equal(customPolygonRing.geometry.userData.roomDomeRingSideCount, 7);
  assert.equal(customPolygonRing.geometry.userData.roomDomeRingProfile, 'circle');
});

test('Room Squinch can leave all four non-corner arch bays fully open', () => {
  const building = normalizeBuilding({
    type: 'room',
    width: 6,
    length: 5,
    height: 4,
    domeTransition: 'squinch',
    domeTransitionCoverEnabled: true,
    domeTransitionSettings: {
      squinch: { openWallArchBays: true },
    },
  });
  assert.equal(building.domeTransitionSettings.squinch.openWallArchBays, true);

  const room = buildWallSystem(building, normalizeWallSystem({
    bricks: { ...DEFAULT_WALL_SYSTEM.bricks, enabled: false },
  }, building));
  const roofPanels = [];
  room.traverse((child) => {
    if (child.userData?.roomSquinchRoofPanelType) roofPanels.push(child);
  });

  assert.equal(
    roofPanels.filter((panel) => panel.userData.roomSquinchRoofPanelType === 'wall').length,
    0,
  );
  assert.equal(
    roofPanels.filter((panel) => panel.userData.roomSquinchRoofPanelType === 'corner').length,
    8,
  );
  const coverAssembly = room.getObjectByName('Room squinch square-to-circle transition cover');
  assert.equal(coverAssembly.userData.roomSquinchRoofAssembly.wallPanelCount, 0);
  assert.equal(coverAssembly.userData.roomSquinchRoofAssembly.openWallArchBays, true);
});

test('Portal Squinch reuses the rear half of the square-room transition behind its facade', () => {
  const building = normalizeBuilding({
    type: 'iwan',
    buildingType: 'portal',
    width: 6,
    iwanDepth: 3,
    depth: 3,
    height: 4,
    domeTransitionCoverEnabled: true,
    domeTransitionSettings: {
      squinch: {
        ribWidth: 0.12,
        ribDepth: 0.38,
        ribColor: '#287ca4',
        legExtension: 0.8,
        springHeightOffset: 0.1,
        redOffset: -0.2,
        greenOffset: 0.6,
        greenHeightOffset: -0.5,
      },
    },
  });
  const walls = normalizeWallSystem({
    ...DEFAULT_WALL_SYSTEM,
    portalTransition: 'squinch',
    portalCover: 'dome',
    ahang: { enabled: false },
    karbandi: { ...DEFAULT_WALL_SYSTEM.karbandi, enabled: false },
    bricks: { ...DEFAULT_WALL_SYSTEM.bricks, enabled: false },
  }, building);
  const portal = buildWallSystem(building, walls);
  const sliceZ = -building.depth / 2 - walls.sideOffsets.north;
  const ribs = [];
  portal.traverse((object) => {
    if (object.userData?.roomDomePart === 'squinch-transition-rib') ribs.push(object);
  });
  assert.deepEqual(
    ribs.map((rib) => rib.userData.roomSquinchArchIndex).sort((left, right) => left - right),
    [2, 3, 4, 5, 6],
  );
  assert.ok(ribs.every((rib) => rib.userData.portalSquinchHalfSquareRoom === true));
  assert.deepEqual(portal.userData.portalSquinchSupportWalls, ['south', 'east', 'west']);
  assert.equal(portal.userData.portalSquinchSlicePlaneZ, sliceZ);
  assert.equal(portal.userData.portalSquinchFullRoomDepth, building.depth * 2);
  assert.equal(portal.userData.portalSquinchFacadeToRearDepth, building.depth);
  const northArchCurveStartY = building.height
    + Math.max(walls.extraHeights.east, walls.extraHeights.west);
  assert.equal(portal.userData.portalSquinchNorthArchCurveStartY, northArchCurveStartY);
  assert.equal(
    portal.userData.portalSquinchCrownAlignment,
    'visible-rib-crown-top-equals-portal-north-arch-curve-start',
  );
  assert.equal(
    portal.userData.portalSquinchSliceRule,
    'literal-south-half-of-complete-square-room-transition',
  );
  const squinchArchSpringY = ribs[0].userData.roomSquinchSpringY;
  assert.ok(Math.abs(
    portal.userData.portalSquinchVerticalWallTopY - squinchArchSpringY,
  ) < 0.000002);
  assert.equal(
    portal.userData.portalSquinchVerticalWallTopRule,
    'south-east-west-walls-stop-at-squinch-arch-spring',
  );
  for (const side of ['south', 'east', 'west']) {
    const wall = portal.children.find((child) => (
      child.isMesh
      && child.userData?.wallSide === side
      && child.userData?.roomDomePart == null
    ));
    assert.ok(wall, `${side} Portal wall must remain present below the Squinch`);
    const wallBounds = new THREE.Box3().setFromObject(wall, true);
    assert.ok(Math.abs(wallBounds.max.y - squinchArchSpringY) < 0.000002,
      `${side} Portal wall must stop where its Squinch arch starts`);
  }
  ribs.forEach((rib) => {
    const bounds = new THREE.Box3().setFromObject(rib, true);
    assert.ok(bounds.min.z >= sliceZ - 0.000002, `rib ${rib.userData.roomSquinchArchIndex} crosses the facade slice`);
  });
  [2, 6].forEach((archIndex) => {
    const sideRib = ribs.find((rib) => rib.userData.roomSquinchArchIndex === archIndex);
    const bounds = new THREE.Box3().setFromObject(sideRib, true);
    assert.ok(Math.abs(bounds.min.z - sliceZ) <= 0.000002, `side rib ${archIndex} must terminate on the facade slice plane`);
  });
  assert.equal(portal.getObjectByName('Room circular dome cover'), undefined);
  assert.equal(portal.getObjectByName('Room dome cylindrical drum'), undefined);
  assert.equal(portal.getObjectByName('Room dome springing ring'), undefined);
  const dome = portal.getObjectByName('Portal circular dome cover');
  const drum = portal.getObjectByName('Portal dome cylindrical drum');
  const ring = portal.getObjectByName('Portal dome springing ring');
  assert.ok(dome);
  assert.ok(drum, 'a square Portal Squinch Dome must include its upper drum');
  assert.equal(drum.userData.roomDomeDrumSideCount, 16);
  assert.equal(drum.userData.roomDomeDrumHeight, 0.5);
  assert.equal(drum.userData.portalCoverDrumRule, 'square-squinch-sixteen-sided-drum-beneath-dome');
  assert.equal(ring, undefined, 'Portal covers do not include a springing ring');
  assert.equal(portal.getObjectByName('Portal dome independent extra leg'), undefined,
    'Portal covers do not include a vertical extra leg');
  assert.equal(portal.userData.portalSquinchIncludesHalfDome, true);
  assert.equal(portal.userData.portalSquinchUpperDrumSideCount, 16);
  assert.equal(portal.userData.portalCoverHasDrum, true);
  assert.equal(portal.userData.portalCoverHasVerticalLeg, false);
  assert.ok(ribs.every((rib) => Math.abs(
    rib.userData.roomDomeCrownY + rib.userData.roomSquinchRibWidth / 2 - northArchCurveStartY,
  ) < 0.000002), 'every visible Squinch rib crown top must meet the north arch curve start');
  assert.ok(Math.abs(
    dome.userData.roomDomeFootY - portal.userData.portalCoverNorthArchFaceY,
  ) < 0.000002, 'the Portal Dome must begin at the north-wall green-circle tangent');
  const drumBounds = new THREE.Box3().setFromObject(drum, true);
  assert.ok(Math.abs(drumBounds.min.y - northArchCurveStartY) < 0.000002,
    'the sixteen-sided drum must start on the Squinch rib crown');
  assert.ok(Math.abs(drumBounds.max.y - dome.userData.roomDomeFootY) < 0.000002,
    'the sixteen-sided drum must touch the Dome springing without a gap');
  [dome, drum].forEach((object) => {
    const bounds = new THREE.Box3().setFromObject(object, true);
    assert.ok(bounds.min.z >= sliceZ - 0.000002, `${object.name} crosses in front of the north facade`);
    assert.equal(object.userData.portalSquinchSlicePlaneZ, sliceZ);
  });
  const cover = portal.getObjectByName('Portal Squinch half-square transition cover');
  assert.ok(cover);
  assert.equal(cover.userData.portalSquinchHalfSquareRoom, true);
  assert.deepEqual(cover.userData.portalSquinchRetainedArchIndexes, [2, 3, 4, 5, 6]);
  let drumSkirtCount = 0;
  cover.traverse((object) => {
    if (object.userData?.roomSquinchDrumSkirt === true) drumSkirtCount += 1;
    const archIndex = object.userData?.roomSquinchCornerArchIndex
      ?? object.userData?.roomSquinchWallArchIndex
      ?? object.userData?.roomSquinchArchIndex;
    if (Number.isInteger(archIndex)) assert.ok([2, 3, 4, 5, 6].includes(archIndex));
    if (object.isMesh) {
      const bounds = new THREE.Box3().setFromObject(object, true);
      assert.ok(bounds.min.z >= sliceZ - 0.000002, `${object.name} crosses the facade slice`);
      assert.equal(object.userData.portalSquinchSlicePlaneZ, sliceZ);
    }
  });
  assert.equal(drumSkirtCount, 1);
  assert.equal(cover.userData.roomSquinchRoofAssembly.upperDrumSideCount, 16);

  const guideScene = Object.create(MehrazScene.prototype);
  guideScene.building = building;
  guideScene.walls = walls;
  guideScene.buildingGroup = new THREE.Group();
  guideScene.buildingGroup.add(portal);
  guideScene.squinchArchEditing = true;
  guideScene.sectionViewEnabled = false;
  guideScene.renderer = null;
  const guideRoot = new THREE.Group();
  guideScene.addRoomSquinchArchConstructionGuides(guideRoot);
  const guide = guideRoot.getObjectByName('Portal Squinch south-wall reference arch construction circles and radii');
  const southReferenceRib = ribs.find((rib) => rib.userData.roomSquinchArchIndex === 4);
  assert.ok(guide);
  assert.equal(guide.userData.portalSquinchGuideSource, 'generated-south-wall-reference-rib');
  assert.equal(guide.userData.portalSquinchReferenceRibIndex, 4);
  assert.ok(Math.abs(
    guide.userData.archConstructionSpringY - southReferenceRib.userData.roomSquinchSpringY,
  ) < 0.000002, 'Portal Squinch guide spring must follow the placed south arch');
  assert.ok(Math.abs(
    guide.userData.archConstructionApexY - southReferenceRib.userData.roomDomeCrownY,
  ) < 0.000002, 'Portal Squinch guide apex must follow the placed south arch');
  guideRoot.updateMatrixWorld(true);
  const rightGreenGuide = guide.getObjectByName('Right green arch construction segment');
  const greenGuideEnds = rightGreenGuide.geometry.getAttribute('instanceEnd');
  const renderedGuideApex = new THREE.Vector3(
    greenGuideEnds.getX(greenGuideEnds.count - 1),
    greenGuideEnds.getY(greenGuideEnds.count - 1),
    greenGuideEnds.getZ(greenGuideEnds.count - 1),
  ).applyMatrix4(rightGreenGuide.matrixWorld);
  assert.ok(Math.abs(
    renderedGuideApex.y - southReferenceRib.userData.roomDomeCrownY,
  ) < 0.000002, 'the visibly rendered Portal Squinch guide curve must reach the placed rib apex');
  assert.ok(Math.abs(
    guide.userData.portalSquinchReferenceRibHalfSpan
      - southReferenceRib.userData.roomSquinchArchHalfSpan,
  ) < 0.000002, 'Portal Squinch guide span must come from the placed south arch');
  const southReferencePosition = southReferenceRib.getWorldPosition(new THREE.Vector3());
  const southReferenceOutward = new THREE.Vector3().fromArray(
    southReferenceRib.userData.roomSquinchRibOutwardNormal,
  ).normalize();
  const expectedGuideZ = southReferencePosition.z
    + southReferenceOutward.z * (southReferenceRib.userData.roomSquinchRibDepth / 2 + 0.035);
  assert.ok(Math.abs(
    guide.userData.portalSquinchReferenceRibGuideZ - expectedGuideZ,
  ) < 0.000002, 'Portal Squinch guide plane must sit directly on the placed south arch face');
});

test('Portal Dome adds a clipped shell while No cover and Ahang do not', () => {
  const building = normalizeBuilding({
    type: 'iwan',
    buildingType: 'portal',
    width: 6,
    iwanDepth: 3,
    depth: 3,
    height: 4,
  });
  const sliceZ = -building.depth / 2;
  for (const portalCover of ['dome']) {
    const walls = normalizeWallSystem({
      ...DEFAULT_WALL_SYSTEM,
      portalTransition: 'squinch',
      portalCover,
      karbandi: { ...DEFAULT_WALL_SYSTEM.karbandi, enabled: false },
      bricks: { ...DEFAULT_WALL_SYSTEM.bricks, enabled: false },
    }, building);
    const portal = buildWallSystem(building, walls);
    const shell = portal.children.find((child) => child.userData?.roomDomePart === 'dome-shell');
    assert.ok(shell, `${portalCover} must add an upper Portal shell`);
    assert.equal(shell.userData.roomDomeCoverType, portalCover);
    const drum = portal.children.find((child) => child.userData?.roomDomePart === 'dome-drum');
    assert.ok(drum, `${portalCover} over a square Squinch must add a Portal drum`);
    assert.equal(drum.userData.roomDomeDrumSideCount, 16);
    assert.equal(drum.userData.roomDomeDrumHeight, 0.5);
    assert.equal(shell.userData.roomDomeLegExtension, 0);
    assert.ok(Math.abs(
      shell.userData.roomDomeFootY - portal.userData.portalCoverBearingY,
    ) < 0.000002, `${portalCover} must sit on top of the Squinch drum`);
    const drumBounds = new THREE.Box3().setFromObject(drum, true);
    assert.ok(Math.abs(drumBounds.max.y - shell.userData.roomDomeFootY) < 0.000002);
    assert.equal(shell.userData.portalCoverHasDrum, true);
    assert.equal(shell.userData.portalCoverHasVerticalLeg, false);
    assert.equal(shell.userData.portalCoverBearingSource, 'north-wall-green-circle-tangent');
    assert.equal(shell.userData.portalCoverInteriorFaceFlush, true);
    assert.ok(Math.abs(
      shell.userData.portalCoverInteriorBaseRadius
        - shell.userData.portalCoverInteriorBearingTargetRadius,
    ) < 0.00005, `${portalCover} interior face must be flush with the north-wall arch bearing face: ${shell.userData.portalCoverInteriorBaseRadius} vs ${shell.userData.portalCoverInteriorBearingTargetRadius}`);
    assert.ok(Math.abs(
      shell.userData.portalCoverInteriorBearingTargetRadius
        - portal.userData.portalCoverInteriorTargetRadius,
    ) < 0.000002, `${portalCover} must start behind the sampled north-wall arch face`);
    assert.ok(Math.abs(
      portal.userData.portalCoverNorthArchFaceRadius
        - portal.userData.portalCoverInteriorTargetRadius
        - portal.userData.portalCoverNorthArchSetback,
    ) < 0.000002);
    assert.ok(Math.abs(
      portal.userData.portalCoverNorthArchFaceY - portal.userData.portalCoverBearingY,
    ) < 0.000002);
    assert.ok(shell.userData.portalCoverExteriorRadiusAdjustment < 0);
    assert.equal(portal.userData.portalCoverType, portalCover);
    assert.ok(new THREE.Box3().setFromObject(shell, true).min.z >= sliceZ - 0.000002);
    assert.equal(portal.getObjectByName('Portal dome independent extra leg'), undefined);
    assert.equal(portal.getObjectByName('Portal dome springing ring'), undefined);

    const guideScene = Object.create(MehrazScene.prototype);
    guideScene.building = building;
    guideScene.walls = walls;
    guideScene.buildingGroup = new THREE.Group();
    guideScene.buildingGroup.add(portal);
    guideScene.selectedWallSide = 'room_dome';
    guideScene.renderer = null;
    guideScene.sectionViewEnabled = false;
    const guideRoot = new THREE.Group();
    guideScene.addRoomDomeArchConstructionGuides(guideRoot);
    const guide = guideRoot.getObjectByName('Portal dome symmetric red and green construction circles');
    assert.ok(guide, 'Portal Dome must expose the complete dome arch construction diagram');
    assert.equal(guide.userData.isRoomDomeArchConstructionGuide, true);
    assert.equal(guide.userData.isPortalDomeArchConstructionGuide, true);
    assert.equal(
      guide.userData.archConstructionSource,
      'north-wall-green-circle-and-generated-portal-dome-interior-profile',
    );
    const greenConstruction = shell.userData.portalDomeGreenCircleConstruction;
    assert.ok(greenConstruction);
    assert.equal(
      greenConstruction.profileRule,
      'interior-meridian-is-exact-north-wall-green-circle-arc',
    );
    assert.ok(shell.geometry.userData.domeShellInnerProfile.every(([x, y]) => (
      Math.abs(
        Math.hypot(x - greenConstruction.center[0], y - greenConstruction.center[1])
          - greenConstruction.radius,
      ) < 0.00005
    )), 'every Portal Dome interior profile point must lie on the north-wall green circle');
    assert.ok(Math.abs(
      guide.userData.archConstructionSpringY
        - greenConstruction.sidePoint[1],
    ) < 0.000002);
    assert.ok(Math.abs(
      guide.userData.archConstructionApexY
        - greenConstruction.apexPoint[1],
    ) < 0.000002);
    for (const role of ['green-center', 'green-circle']) {
      assert.equal(guide.children.filter((child) => child.userData?.archConstructionRole === role).length, 2);
    }
    assert.equal(guide.children.some((child) => child.userData?.archConstructionRole?.startsWith('red-')), false);
    assert.equal(guide.children.some((child) => child.name.includes('red arch')), false);
    assert.equal(guide.children.filter((child) => child.name.includes('radius')).length, 4);
  }

  for (const portalCover of ['none', 'ahang']) {
    const walls = normalizeWallSystem({
      ...DEFAULT_WALL_SYSTEM,
      portalTransition: 'squinch',
      portalCover,
      karbandi: { ...DEFAULT_WALL_SYSTEM.karbandi, enabled: false },
      bricks: { ...DEFAULT_WALL_SYSTEM.bricks, enabled: false },
    }, building);
    const portal = buildWallSystem(building, walls);
    assert.equal(
      portal.children.find((child) => child.userData?.roomDomePart === 'dome-shell'),
      undefined,
      `${portalCover} must not inherit a dome-family shell`,
    );
  }

  const seatedKarbandiWalls = portalDefaultWallSystem(DEFAULT_WALL_SYSTEM, building);
  for (const portalCover of ['dome']) {
    const karbandiPortal = buildWallSystem(building, normalizeWallSystem({
      ...seatedKarbandiWalls,
      portalCover,
      bricks: { ...seatedKarbandiWalls.bricks, enabled: false },
    }, building));
    const shell = karbandiPortal.children.find((child) => child.userData?.roomDomePart === 'dome-shell');
    const drum = karbandiPortal.children.find((child) => child.userData?.roomDomePart === 'dome-drum');
    assert.ok(shell, `${portalCover} remains visible independently of the Karbandi transition`);
    assert.equal(drum, undefined, `${portalCover} must not add a Portal drum over Karbandi`);
    assert.ok(Number.isFinite(karbandiPortal.userData.portalKarbandiCrownEnvelopeY));
    assert.ok(Number.isFinite(karbandiPortal.userData.portalKarbandiCrownContactY));
    assert.ok(Number.isFinite(karbandiPortal.userData.portalKarbandiCrownRadius));
    assert.ok(Number.isFinite(karbandiPortal.userData.portalKarbandiNorthWallLowestVisibleRibRange?.[2]));
    const generatedRibs = [];
    karbandiPortal.traverse((child) => {
      if (child.isMesh
        && child.userData?.isKarbandi === true
        && child.userData?.isKarbandiVisualGuide !== true) {
        generatedRibs.push(child);
      }
    });
    const generatedRibCrownY = Math.max(...generatedRibs.map((rib) => (
      new THREE.Box3().setFromObject(rib, true).max.y
    )));
    assert.ok(Math.abs(
      karbandiPortal.userData.portalKarbandiCrownContactY - generatedRibCrownY,
    ) < 0.000002, `${portalCover} contact elevation must come from the actual generated ribs`);
    assert.ok(Math.abs(
      shell.userData.roomDomeFootY
        - karbandiPortal.userData.portalCoverNorthArchFaceY,
    ) < 0.000002, `${portalCover} shell must start at the shifted north-wall green-circle tangent`);
    assert.ok(Math.abs(
      shell.userData.roomDomeFootY
        - karbandiPortal.userData.portalKarbandiDomeWallTopY,
    ) < 0.000002, `${portalCover} must continue to the top of the vertical walls`);
    assert.ok(
      shell.userData.roomDomeFootY < karbandiPortal.userData.portalKarbandiNorthWallLowestVisibleRibRange[2],
      `${portalCover} cutoff must continue below the north-wall rib intersection`,
    );
    assert.equal(shell.userData.portalCoverBearingSource, 'vertical-wall-top-on-wall-supported-rib-leg-centerlines');
    assert.equal(shell.userData.portalCoverHasDrum, false);
    assert.equal(shell.userData.portalCoverHasVerticalLeg, false);
    assert.equal(shell.userData.portalCoverInteriorFaceFlush, true);
    assert.ok(Math.abs(
      shell.userData.portalCoverInteriorBaseRadius
        - shell.userData.portalCoverInteriorBearingTargetRadius,
    ) < 0.00005, `${portalCover} interior face must be flush with the north-wall green-circle tangent: ${shell.userData.portalCoverInteriorBaseRadius} vs ${shell.userData.portalCoverInteriorBearingTargetRadius}`);
    assert.ok(Math.abs(
      shell.userData.portalCoverInteriorBearingTargetRadius
        - karbandiPortal.userData.portalCoverInteriorTargetRadius,
    ) < 0.000002, `${portalCover} must start behind the shifted north-wall arch face`);
    assert.ok(Math.abs(
      karbandiPortal.userData.portalCoverNorthArchFaceRadius
        - karbandiPortal.userData.portalCoverInteriorTargetRadius
        - karbandiPortal.userData.portalCoverNorthArchSetback,
    ) < 0.000002);
    assert.ok(Math.abs(
      karbandiPortal.userData.portalCoverNorthArchFaceY
        - shell.userData.roomDomeFootY,
    ) < 0.000002);
    const expectedCrownCoverRadius = karbandiPortal.userData.portalKarbandiCrownRadius;
    assert.ok(
      shell.userData.portalKarbandiCrownCoverRadius >= expectedCrownCoverRadius,
      `${portalCover} must cover the outer crown-rib orbit in plan`,
    );
    assert.ok(
      shell.userData.roomDomeRadius >= shell.userData.portalKarbandiCrownCoverRadius,
      `${portalCover} exterior footprint must reach its Karbandi crown bearing return`,
    );
    const outerProfileFoot = shell.geometry.userData.domeShellOuterProfile.at(-1);
    assert.ok(Math.abs(
      outerProfileFoot[0] - shell.userData.portalKarbandiCrownCoverRadius,
    ) < 0.000002, `${portalCover} outer profile must end over the crown ribs`);
    assert.ok(Math.abs(
      outerProfileFoot[1] - shell.userData.roomDomeFootY,
    ) < 0.000002, `${portalCover} exterior curve must be cut at the supported-rib lower level`);
    const greenConstruction = shell.userData.portalDomeGreenCircleConstruction;
    assert.ok(shell.geometry.userData.domeShellOuterProfile.every(([x, y]) => (
      Math.abs(
        Math.hypot(x - greenConstruction.center[0], y - greenConstruction.center[1])
          - greenConstruction.outerRadius,
      ) < 0.00005
    )), `${portalCover} exterior profile must remain one uninterrupted circular arc`);
    assert.equal(
      greenConstruction.bearingRule,
      'continuous-dome-curves-to-wall-top-clipped-on-wall-supported-rib-leg-centerline-plane',
    );
    const supportedBoundary = shell.userData.portalKarbandiWallSupportedRibBoundary;
    assert.ok(supportedBoundary?.legs?.length >= 1, `${portalCover} clip accepts a visible rib with either supported leg`);
    assert.equal(supportedBoundary.visible, true);
    assert.equal(supportedBoundary.selectionRule, 'rendered-wall-top-component-with-at-least-one-supported-leg');
    const supportedBoundaries = shell.userData.portalKarbandiWallSupportedRibBoundaries;
    assert.ok(supportedBoundaries.some(({ legs }) => legs.length === 1), `${portalCover} must include visible one-leg wall supports`);
    const ribClipPlanes = shell.userData.portalKarbandiWallSupportedRibClipPlanes;
    assert.equal(
      ribClipPlanes.length,
      supportedBoundaries.length,
      `${portalCover} center cap must stop at every visible wall-supported rib centerline`,
    );
    karbandiPortal.updateMatrixWorld(true);
    const domePositions = shell.geometry.getAttribute('position');
    ribClipPlanes.forEach((ribClipPlane) => {
      let minimumRibPlaneDistance = Infinity;
      for (let vertexIndex = 0; vertexIndex < domePositions.count; vertexIndex += 1) {
        const point = new THREE.Vector3()
          .fromBufferAttribute(domePositions, vertexIndex)
          .applyMatrix4(shell.matrixWorld);
        minimumRibPlaneDistance = Math.min(
          minimumRibPlaneDistance,
          ribClipPlane.normal[0] * point.x
            + ribClipPlane.normal[1] * point.z
            + ribClipPlane.constant,
        );
      }
      assert.ok(minimumRibPlaneDistance >= -0.00001, `${portalCover} must remain behind visible supported rib ${ribClipPlane.ribIndex}`);
    });
    let minimumDomeY = Infinity;
    for (let vertexIndex = 0; vertexIndex < domePositions.count; vertexIndex += 1) {
      const point = new THREE.Vector3()
        .fromBufferAttribute(domePositions, vertexIndex)
        .applyMatrix4(shell.matrixWorld);
      minimumDomeY = Math.min(minimumDomeY, point.y);
    }
    assert.ok(
      minimumDomeY > karbandiPortal.userData.portalKarbandiDomeWallTopY,
      `${portalCover} must retain only the cap above the wall-supported rib intersections`,
    );
    assert.equal(
      karbandiPortal.getObjectByProperty('name', 'Portal Karbandi dome wall bay 1'),
      undefined,
      `${portalCover} must not add dome panels below the supported-rib intersection`,
    );
    assert.equal(
      shell.userData.portalKarbandiDomeClipRule,
      'wall-top-behind-visible-rib-centerline-with-at-least-one-supported-leg',
    );
    assert.deepEqual(shell.userData.roomDomeCenter, karbandiPortal.userData.portalKarbandiCoverCenter);
  }
});

test('Room Squinch non-corner covers inherit both connected wall faces and bonds', () => {
  const building = normalizeBuilding({
    type: 'room',
    width: 6,
    length: 5,
    height: 4,
    domeTransition: 'squinch',
    domeTransitionCoverEnabled: true,
  });
  const walls = normalizeWallSystem({
    stoneBase: { ...DEFAULT_WALL_SYSTEM.stoneBase, enabled: false },
    bricks: {
      ...DEFAULT_WALL_SYSTEM.bricks,
      enabled: true,
      sideBonds: {
        ...DEFAULT_WALL_SYSTEM.bricks.sideBonds,
        room_dome_transition_exterior: {
          ...DEFAULT_WALL_SYSTEM.bricks.sideBonds.room_dome_transition_exterior,
          builtIn: 'flemish',
        },
      },
    },
    roomWallThicknesses: { north: 0.3, east: 0.45, south: 0.55, west: 0.25 },
  }, building);
  const room = buildWallSystemWithCanvasMock(building, walls);
  room.updateMatrixWorld(true);
  const panels = [];
  room.traverse((child) => {
    if (child.userData?.roomSquinchRoofPanelType === 'wall') panels.push(child);
  });
  assert.equal(panels.length, 4);

  panels.forEach((panel) => {
    const side = panel.userData.roomSquinchWallExtensionSide;
    const lowerWall = room.getObjectByName(`Room ${side} south-style wall`);
    const lowerBody = lowerWall.children.find((child) => child.userData?.isRoomWallBody === true);
    const interiorIndex = lowerBody.userData.roomWallInteriorMaterialIndex;
    const exteriorIndex = lowerBody.userData.roomWallExteriorMaterialIndex;
    assert.ok(Array.isArray(panel.material));
    assert.equal(panel.material[0].map, lowerBody.material[interiorIndex].map);
    assert.equal(panel.material[0].userData.brickBondSide, side);
    assert.notEqual(panel.material[1].map, lowerBody.material[exteriorIndex].map);
    assert.equal(panel.material[1].userData.brickBondSide, 'room_dome_transition_exterior');
    assert.equal(panel.material[1].userData.brickBondSelection, 'flemish');
    assert.equal(panel.geometry.userData.roomWallInteriorMaterialIndex, 0);
    assert.equal(panel.geometry.userData.roomWallExteriorMaterialIndex, 1);
    assert.equal(
      panel.geometry.userData.roomSquinchWallFaceBondMapping,
      'exact-connected-room-wall-interior-and-exterior',
    );
    const materialGroups = new Set(panel.geometry.groups.map((group) => group.materialIndex));
    assert.ok(materialGroups.has(0) && materialGroups.has(1) && materialGroups.has(2));

    const panelBounds = new THREE.Box3().setFromObject(panel);
    const wallBounds = new THREE.Box3().setFromObject(lowerBody);
    if (side === 'north' || side === 'south') {
      assert.ok(Math.abs(panelBounds.min.z - wallBounds.min.z) < 0.000001);
      assert.ok(Math.abs(panelBounds.max.z - wallBounds.max.z) < 0.000001);
    } else {
      assert.ok(Math.abs(panelBounds.min.x - wallBounds.min.x) < 0.000001);
      assert.ok(Math.abs(panelBounds.max.x - wallBounds.max.x) < 0.000001);
    }
  });

  const cornerPanels = [];
  room.traverse((child) => {
    if (child.userData?.roomSquinchRoofPanelType === 'corner') cornerPanels.push(child);
  });
  assert.equal(cornerPanels.length, 8);
  const sharedExteriorMaterial = panels[0].material[1];
  [...panels, ...cornerPanels].forEach((panel) => {
    assert.equal(panel.material[1], sharedExteriorMaterial);
    assert.equal(panel.userData.roomSquinchExteriorBondSide, 'room_dome_transition_exterior');
    assert.equal(panel.userData.roomSquinchExteriorBondAssembly, 'all-transition-covers-one-object');
  });
  cornerPanels.forEach((panel) => {
    assert.ok(Array.isArray(panel.material));
    assert.equal(panel.material[0].userData.brickBondSide, panel.userData.wallSide);
    assert.equal(panel.geometry.userData.roomSquinchCornerRoofInteriorMaterialIndex, 0);
    assert.equal(panel.geometry.userData.roomSquinchCornerRoofExteriorMaterialIndex, 1);
    assert.equal(panel.geometry.userData.roomSquinchCornerRoofReturnMaterialIndex, 2);
  });
});

test('Room dome, extra leg, drum, and transition use independent bonds and brick colors', () => {
  const building = normalizeBuilding({
    type: 'room',
    width: 4,
    length: 4,
    domeTransition: 'karbandi',
    domeTransitionCoverEnabled: true,
    domeDrumHeight: 0.8,
    domeColor: '#2468ac',
    domeExtraLegColor: '#3a8f5d',
    domeOuterLegExtensionByCoverType: { dome: 0.6 },
    domeRingColor: '#7a36c4',
    domePatternCoverage: 85,
    innerDomeEnabled: true,
    innerDomeColor: '#9b4fbd',
    innerDomePatternCoverage: 72,
    innerDomeArch: {
      redOffset: 0.3,
      greenOffset: 0.65,
      greenHeightOffset: -1.4,
    },
    domeDrumColor: '#c86432',
  });
  let texturedWalls = normalizeWallSystem({
    stoneBase: { ...DEFAULT_WALL_SYSTEM.stoneBase, enabled: false },
    bricks: {
      ...DEFAULT_WALL_SYSTEM.bricks,
      enabled: true,
      sideBonds: {
        ...DEFAULT_WALL_SYSTEM.bricks.sideBonds,
        room_dome: { ...DEFAULT_WALL_SYSTEM.bricks.sideBonds.room_dome, builtIn: 'stack' },
        room_dome_interior: { ...DEFAULT_WALL_SYSTEM.bricks.sideBonds.room_dome_interior, builtIn: 'flemish' },
        room_inner_dome_exterior: { ...DEFAULT_WALL_SYSTEM.bricks.sideBonds.room_inner_dome_exterior, builtIn: 'running' },
        room_inner_dome_interior: { ...DEFAULT_WALL_SYSTEM.bricks.sideBonds.room_inner_dome_interior, builtIn: 'stack' },
        room_dome_extra_leg: { ...DEFAULT_WALL_SYSTEM.bricks.sideBonds.room_dome_extra_leg, builtIn: 'flemish' },
        room_dome_extra_leg_interior: { ...DEFAULT_WALL_SYSTEM.bricks.sideBonds.room_dome_extra_leg_interior, builtIn: 'stack' },
        room_dome_drum: { ...DEFAULT_WALL_SYSTEM.bricks.sideBonds.room_dome_drum, builtIn: 'flemish' },
        room_dome_drum_interior: { ...DEFAULT_WALL_SYSTEM.bricks.sideBonds.room_dome_drum_interior, builtIn: 'stack' },
        room_dome_transition: { ...DEFAULT_WALL_SYSTEM.bricks.sideBonds.room_dome_transition, builtIn: 'running' },
      },
    },
  }, building);
  texturedWalls = normalizeWallSystem({
    ...texturedWalls,
    karbandi: {
      ...texturedWalls.karbandi,
      ...solveKarbandiWallSeating(texturedWalls.karbandi, building, texturedWalls),
      autoClip: true,
    },
  }, building);
  const texturedRoom = buildWallSystemWithCanvasMock(building, texturedWalls);
  const texturedDome = texturedRoom.getObjectByName('Room circular dome cover');
  const texturedExtraLeg = texturedRoom.getObjectByName('Room dome independent extra leg');
  const texturedInnerDome = texturedRoom.getObjectByName('Room inner dome cover');
  const texturedRing = texturedRoom.getObjectByName('Room dome springing ring');
  const transitionCovers = [];
  texturedRoom.traverse((child) => {
    if (child.isMesh && child.userData?.isKarbandiCover === true) transitionCovers.push(child);
  });
  const expectedOpeningRadius = texturedDome.userData.roomDomeRadius - texturedWalls.bricks.brickWidth;
  assert.ok(transitionCovers.length > 0);
  assert.ok(transitionCovers.every((cover) => (
    cover.userData.roomDomeOpeningVoid === true
      && Math.abs(cover.userData.roomDomeOpeningVoidRadius - expectedOpeningRadius) < 0.000001
      && cover.material.userData.roomCircularVoid === true
  )), 'Cover transition panels must preserve the circular drum interior opening to the Room');
  assert.equal(texturedWalls.bricks.sideBonds.room_dome.builtIn, 'stack');
  assert.ok(texturedExtraLeg);
  assert.ok(Array.isArray(texturedExtraLeg.material));
  const extraLegExteriorMaterial = texturedExtraLeg.material[texturedExtraLeg.userData.roomDomeExtraLegExteriorMaterialIndex];
  const extraLegInteriorMaterial = texturedExtraLeg.material[texturedExtraLeg.userData.roomDomeExtraLegInteriorMaterialIndex];
  assert.equal(extraLegExteriorMaterial.userData.brickBondSide, 'room_dome_extra_leg');
  assert.equal(extraLegExteriorMaterial.userData.brickBondSelection, 'flemish');
  assert.equal(extraLegExteriorMaterial.userData.surfaceBrickColor, '#3a8f5d');
  assert.equal(extraLegInteriorMaterial.userData.brickBondSide, 'room_dome_extra_leg_interior');
  assert.equal(extraLegInteriorMaterial.userData.brickBondSelection, 'stack');
  assert.equal(texturedExtraLeg.userData.roomDomeExtraLegBrickColor, '#3a8f5d');
  assert.ok(Math.abs(texturedRing.position.y - texturedExtraLeg.userData.roomDomeExtraLegTopY) < 0.000001);
  assert.ok(Array.isArray(texturedDome.material));
  const domeExteriorMaterial = texturedDome.material[texturedDome.userData.roomDomeExteriorMaterialIndex];
  const domeInteriorMaterial = texturedDome.material[texturedDome.userData.roomDomeInteriorMaterialIndex];
  assert.ok(domeExteriorMaterial.map, 'the dome exterior must use its room_dome brick-bond texture');
  assert.equal(domeExteriorMaterial.userData.isFlatBrickBond, true);
  assert.equal(domeExteriorMaterial.userData.brickBondSide, 'room_dome');
  assert.equal(domeExteriorMaterial.userData.brickBondSource, 'builtin');
  assert.equal(domeExteriorMaterial.userData.brickBondSelection, 'stack');
  assert.equal(domeExteriorMaterial.userData.surfaceBrickColor, '#2468ac');
  assert.equal(domeExteriorMaterial.userData.domePatternCoverage, 85);
  assert.equal(domeExteriorMaterial.userData.domePatternSolidColor, '#2468ac');
  assert.equal(domeInteriorMaterial.userData.brickBondSide, 'room_dome_interior');
  assert.equal(domeInteriorMaterial.userData.brickBondSelection, 'flemish');
  assert.equal(domeInteriorMaterial.userData.roomDomeAutomaticRunningBond, undefined);
  assert.equal(texturedDome.material[texturedDome.userData.roomDomeReturnMaterialIndex].userData.roomDomeAutomaticRunningBond, true);
  assert.equal(texturedDome.userData.roomDomeBrickColor, '#2468ac');
  assert.equal(texturedDome.userData.roomDomePatternCoverage, 85);
  assert.ok(texturedInnerDome, 'an enabled inner dome must be built as a separate mesh');
  assert.notEqual(texturedInnerDome.geometry, texturedDome.geometry);
  assert.equal(texturedInnerDome.userData.wallSide, 'room_dome_inner');
  assert.equal(texturedInnerDome.userData.roomDomePart, 'inner-dome-shell');
  assert.equal(texturedInnerDome.userData.isRoomInnerDome, true);
  assert.equal(texturedInnerDome.userData.roomDomeBrickColor, '#9b4fbd');
  assert.equal(texturedInnerDome.userData.roomDomePatternCoverage, 72);
  assert.ok(Array.isArray(texturedInnerDome.material));
  const innerDomeExteriorMaterial = texturedInnerDome.material[texturedInnerDome.userData.roomDomeExteriorMaterialIndex];
  const innerDomeInteriorMaterial = texturedInnerDome.material[texturedInnerDome.userData.roomDomeInteriorMaterialIndex];
  assert.equal(innerDomeExteriorMaterial.userData.brickBondSide, 'room_inner_dome_exterior');
  assert.equal(innerDomeExteriorMaterial.userData.brickBondSelection, 'running');
  assert.equal(innerDomeInteriorMaterial.userData.brickBondSide, 'room_inner_dome_interior');
  assert.equal(innerDomeInteriorMaterial.userData.brickBondSelection, 'stack');
  assert.equal(innerDomeInteriorMaterial.userData.surfaceBrickColor, '#9b4fbd');
  assert.equal(innerDomeInteriorMaterial.userData.domePatternCoverage, 72);
  assert.equal(texturedInnerDome.material[texturedInnerDome.userData.roomDomeReturnMaterialIndex].userData.roomDomeAutomaticRunningBond, true);
  assert.ok(texturedInnerDome.userData.roomDomeRadius < texturedDome.userData.roomDomeRadius);
  assert.equal(texturedInnerDome.userData.roomDomeProfileSystem, 'independent-four-centre-red-green-circle-arch-revolved');
  assert.ok(texturedInnerDome.geometry.userData.domeShellRoomFacingProfile.length > 3);
  assert.equal(
    texturedInnerDome.geometry.userData.domeShellRoomFacingProfile.length,
    texturedInnerDome.geometry.userData.domeShellCavityFacingProfile.length,
  );
  texturedInnerDome.geometry.userData.domeShellRoomFacingProfile.forEach(([roomRadius, roomY], index) => {
    const [cavityRadius, cavityY] = texturedInnerDome.geometry.userData.domeShellCavityFacingProfile[index];
    assert.ok(Math.abs(Math.hypot(cavityRadius - roomRadius, cavityY - roomY) - texturedWalls.bricks.brickWidth) < 0.000001,
      'the independent inner dome must retain one-brick normal shell thickness');
  });
  assert.ok(texturedRing);
  assert.equal(texturedRing.userData.wallSide, 'room_dome_ring');
  assert.equal(texturedRing.userData.roomDomeRingColor, '#7a36c4');
  assert.equal(texturedRing.userData.roomDomeRingFinish, 'independent-solid-color-no-brick-bond-or-texture');
  assert.equal(texturedRing.material.userData.roomDomeRingFinish, 'independent-solid-color-no-brick-bond-or-texture');
  assert.equal(texturedRing.material.color.getHexString(), '7a36c4');
  assert.equal(texturedRing.material.map, null);
  assert.ok(Math.abs(texturedDome.userData.roomDomePatternCutoffY - (
    texturedDome.userData.roomDomeSpringY + texturedDome.userData.roomDomeRise * 0.85
  )) < 1e-9);
  assert.equal(texturedDome.geometry.userData.domeUvMapping, 'seamless-circumference-and-meridian-arc-length');
  assert.ok(texturedDome.geometry.userData.domeMeridianLength > 0);
  assert.equal(texturedDome.userData.roomDomeShellThicknessSource, 'one-normal-brick-length');
  assert.ok(Math.abs(texturedDome.userData.roomDomeShellThickness - texturedWalls.bricks.brickWidth) < 0.000001);
  assert.ok(Math.abs(texturedDome.geometry.userData.domeShellThickness - texturedWalls.bricks.brickWidth) < 0.000001);
  const domeOuterProfile = texturedDome.geometry.userData.domeShellOuterProfile;
  const domeInnerProfile = texturedDome.geometry.userData.domeShellInnerProfile;
  assert.equal(domeOuterProfile.length, domeInnerProfile.length);
  domeOuterProfile.forEach(([outerRadius, outerY], index) => {
    const [innerRadius, innerY] = domeInnerProfile[index];
    assert.ok(Math.abs(Math.hypot(outerRadius - innerRadius, outerY - innerY) - texturedWalls.bricks.brickWidth) < 0.000001,
      'every dome meridian section must have one-brick normal shell thickness');
  });
  assert.ok(Number.isInteger(domeExteriorMaterial.map.repeat.x), 'the dome bond must complete a whole number of repeats around its seam');
  const texturedOctagonWalls = texturedRoom.children.filter((child) => child.userData?.roomDomePart === 'exterior-aligned-octagon-wall');
  const texturedRoofInfills = texturedRoom.children.filter((child) => child.userData?.roomDomePart === 'karbandi-roof-to-drum-infill');
  const texturedRoofBackings = texturedRoom.children.filter((child) => child.userData?.roomDomePart === 'karbandi-rib-top-backing');
  const texturedRoofInfillTops = texturedRoom.children.filter((child) => child.userData?.roomDomePart === 'karbandi-roof-to-drum-infill-top');
  assert.equal(texturedRoom.children.filter((child) => child.userData?.roomDomePart === 'vertical-wall-extension').length, 0);
  assert.equal(texturedRoom.children.filter((child) => child.userData?.roomDomePart === 'karbandi-roof-to-vertical-wall-infill').length, 0);
  assert.equal(texturedRoom.children.filter((child) => child.userData?.roomDomePart === 'karbandi-roof-to-octagon-infill').length, 0);
  assert.equal(texturedOctagonWalls.length, 0, 'the removed upper transition walls must not be generated');
  assert.ok(texturedOctagonWalls.every((wall) => (
    wall.userData.roomKarbandiOctagonTransitionCoverClip === 'interior-bearing-clipped-above-transition-cover-underside-exterior-preserved'
      && wall.userData.roomKarbandiOctagonTransitionCoverClearance === 0
      && wall.userData.roomKarbandiOctagonTransitionCoverProbeDepth > 0
      && wall.userData.roomKarbandiOctagonTransitionCoverProbeDepth < wall.userData.roomKarbandiOctagonWallThickness
      && wall.userData.roomKarbandiOctagonTransitionCoverProbeRule === 'interior-bearing-band-only-exterior-masonry-preserved'
      && wall.geometry.userData.roomKarbandiOctagonRoofClip === 'subdivided-interior-face-clip-above-transition-cover-underside'
      && wall.geometry.userData.roomKarbandiOctagonRoofClipProbeDepth > 0
      && wall.geometry.userData.roomKarbandiOctagonRoofClipProbeDepth < wall.userData.roomKarbandiOctagonWallThickness
      && wall.geometry.userData.roomKarbandiOctagonRoofClipProbeRule === 'interior-bearing-band-only-exterior-masonry-preserved'
  )), 'Cover transition must physically trim every octagon wall before the roof underside');
  assert.equal(texturedRoofInfills.length, 0, 'the roof-to-drum masonry infill must be removed');
  assert.equal(texturedRoofBackings.length, 0, 'the removed masonry infill must not leave a backing mesh');
  assert.equal(texturedRoofInfillTops.length, 0, 'the removed transition walls must not leave a checker cap behind');
  assert.ok(texturedOctagonWalls.every((wall) => wall.material.map), 'octagon walls must continue the touched wall-exterior brick mapping');
  assert.ok(texturedOctagonWalls.every((wall) => (
    wall.material.userData.isDirectRoomWallFaceMaterial === true
      && wall.material.userData.roomTransitionWallMaterialMode === 'direct-structural-face-no-overlay'
      && wall.material.polygonOffset === false
  )), 'transition walls must use the same direct structural-face material path as lower Room walls');
  assert.ok(texturedOctagonWalls.every((wall) => ['north_exterior', 'east_exterior', 'south_exterior', 'west_exterior'].includes(wall.material.userData.brickBondSide)));
  assert.ok(texturedOctagonWalls.every((wall) => wall.material.userData.surfaceBrickColor === texturedWalls.color));
  assert.ok(texturedOctagonWalls.every((wall) => wall.userData.roomKarbandiBrickCourseMapping === 'continuous-wall-exterior-aligned-octagon-perimeter-and-absolute-world-height'));
  texturedOctagonWalls.forEach((wall) => {
    const side = wall.userData.roomKarbandiOctagonBondSide.replace('_exterior', '');
    const lowerWall = texturedRoom.getObjectByName(`Room ${side} south-style wall`);
    const lowerBody = lowerWall.children.find((child) => child.userData?.isRoomWallBody === true);
    const lowerExterior = lowerBody.material[lowerBody.userData.roomWallExteriorMaterialIndex];
    assert.equal(wall.material.roughness, lowerExterior.roughness);
    assert.equal(wall.material.metalness, lowerExterior.metalness);
    assert.equal(wall.material.color.getHexString(), lowerExterior.color.getHexString());
    assert.equal(wall.material.map, lowerExterior.map,
      'transition and lower wall must share the exact exterior texture object');
    assert.equal(
      wall.material.userData.roomTransitionWallMaterialSource,
      'exact-clone-of-touched-lower-room-wall-exterior',
    );
    assert.equal(wall.castShadow, lowerBody.castShadow);
    assert.equal(wall.receiveShadow, lowerBody.receiveShadow);
  });
  texturedOctagonWalls
    .filter((wall) => wall.userData.roomKarbandiOctagonTouchedWalls.length === 1)
    .forEach((wall) => {
      const side = wall.userData.roomKarbandiOctagonTouchedWalls[0];
      const lowerWall = texturedRoom.getObjectByName(`Room ${side} south-style wall`);
      const lowerBody = lowerWall.children.find((child) => child.userData?.isRoomWallBody === true);
      const lowerExteriorMaterial = lowerBody?.material?.[lowerBody.userData.roomWallExteriorMaterialIndex];
      assert.ok(lowerExteriorMaterial?.map);
      assert.ok(Math.abs(wall.material.map.repeat.y - lowerExteriorMaterial.map.repeat.y) < 0.000001);
      assert.ok(Math.abs(wall.material.map.offset.y - lowerExteriorMaterial.map.offset.y) < 0.000001,
        `${side} octagon and vertical wall brick courses must share the same world-height phase`);
    });
  assert.ok(texturedOctagonWalls.every((wall) => (
    wall.geometry.userData.roomKarbandiOctagonTopMapping === 'plan-view-running-brick-course-across-wall-thickness'
  )), 'octagon wall caps must retain a normal wall-brick course in plan view');
  texturedOctagonWalls.forEach((wall) => {
    const positions = wall.geometry.getAttribute('position');
    const uncutTopY = texturedDome.userData.roomDomeSpringY - building.domeDrumHeight;
    let uncutTopTriangleCount = 0;
    for (let triangle = 0; triangle < positions.count; triangle += 3) {
      if ([0, 1, 2].every((offset) => Math.abs(positions.getY(triangle + offset) - uncutTopY) < 0.000001)) {
        uncutTopTriangleCount += 1;
      }
    }
    assert.ok(uncutTopTriangleCount > 0,
      'covered octagon walls must preserve the exterior top masonry while clipping only the interior bearing overlap');
  });
  texturedRoofInfillTops.forEach((infillTop) => {
    assert.equal(infillTop.geometry.userData.roomKarbandiInfillTopMapping, 'world-plan-checker-grid-at-normal-brick-length');
    assert.equal(infillTop.geometry.userData.roomKarbandiInfillTopConstruction, 'single-closed-annular-checker-slab-with-one-drum-hole');
    assert.equal(infillTop.userData.roomKarbandiInfillTopConstruction, 'one-closed-checker-roof-slab-no-wedge-overlap');
    assert.ok(infillTop.userData.roomKarbandiInfillTopClearance > 0);
    assert.equal(infillTop.userData.excludeWallEdges, true);
    assert.equal(infillTop.material.userData.topBrickShape, 'square');
    assert.equal(infillTop.material.userData.topBrickPattern, 'checker-grid');
    assert.equal(infillTop.material.polygonOffset, true);
    assert.ok(infillTop.material.polygonOffsetFactor < 0);
    assert.equal(infillTop.renderOrder, 3);
    assert.equal(infillTop.userData.roomKarbandiInfillTopDrumClip, '128-segment-circumscribed-drum-footprint-plus-circular-fragment-clip');
    const [checkerCenterX, checkerCenterZ] = texturedRoom.userData.roomKarbandiRotationCenter;
    const checkerPositions = infillTop.geometry.getAttribute('position');
    const drumFootprintRadius = texturedDome.userData.roomDomeRadius;
    const drumClipRadius = infillTop.userData.roomKarbandiInfillTopDrumClipRadius;
    assert.ok(drumClipRadius > drumFootprintRadius);
    for (let vertex = 8; vertex < 8 + 128; vertex += 1) {
      assert.ok(Math.hypot(
        checkerPositions.getX(vertex) - checkerCenterX,
        checkerPositions.getZ(vertex) - checkerCenterZ,
      ) > drumClipRadius,
      'every checker-hole vertex must lie outside the complete drum footprint');
      const nextVertex = vertex === 8 + 127 ? 8 : vertex + 1;
      const midpointX = (checkerPositions.getX(vertex) + checkerPositions.getX(nextVertex)) / 2;
      const midpointZ = (checkerPositions.getZ(vertex) + checkerPositions.getZ(nextVertex)) / 2;
      assert.ok(Math.hypot(midpointX - checkerCenterX, midpointZ - checkerCenterZ) >= drumClipRadius - 0.00001,
        'every checker-hole chord must remain outside the complete circular drum footprint');
    }
    assert.ok(Math.abs(infillTop.material.userData.topBrickSize - texturedWalls.bricks.brickWidth) < 0.000001);
    assert.ok(Math.abs(infillTop.material.map.repeat.x - (1 / texturedWalls.bricks.brickWidth)) < 0.000001);
    assert.ok(Math.abs(infillTop.material.map.repeat.y - (1 / texturedWalls.bricks.brickWidth)) < 0.000001);
    const topUv = infillTop.geometry.getAttribute('uv');
    const topPositions = infillTop.geometry.getAttribute('position');
    const uValues = [];
    const vValues = [];
    for (let vertex = 0; vertex < topUv.count; vertex += 1) {
      uValues.push(topUv.getX(vertex));
      vValues.push(topUv.getY(vertex));
      assert.ok(Math.abs(topUv.getX(vertex) - infillTop.geometry.getAttribute('position').getX(vertex)) < 0.000001);
      assert.ok(Math.abs(topUv.getY(vertex) - infillTop.geometry.getAttribute('position').getZ(vertex)) < 0.000001);
      if (vertex < topPositions.count / 2) {
        assert.ok(topPositions.getY(vertex) > texturedRoom.userData.roomKarbandiRoofCoverTopY,
          'the checker slab top must remain above the Karbandi cover');
      }
    }
    assert.ok(Math.max(...uValues) - Math.min(...uValues) > 0.001);
    assert.ok(Math.max(...vValues) - Math.min(...vValues) > 0.001);
  });
  assert.ok(texturedOctagonWalls.every((wall) => (
    Math.abs(wall.material.userData.brickBondSeamlessCycleLength - texturedRoom.userData.roomKarbandiMasonryTransition.octagonPerimeter) < 0.000001
  )), 'the vertical octagon bond must use one seamless cycle around all eight faces');
  const domeUv = texturedDome.geometry.getAttribute('uv');
  const domePositions = texturedDome.geometry.getAttribute('position');
  const seamVertices = [];
  for (let vertex = 0; vertex < domeUv.count; vertex += 1) {
    if (Math.abs(domeUv.getX(vertex)) < 0.000001) seamVertices.push(vertex);
  }
  const exteriorSeamVertices = seamVertices.slice(0, domeOuterProfile.length);
  const verticalScales = exteriorSeamVertices.slice(1).map((vertex, index) => {
    const previous = exteriorSeamVertices[index];
    const distance = new THREE.Vector3().fromBufferAttribute(domePositions, previous)
      .distanceTo(new THREE.Vector3().fromBufferAttribute(domePositions, vertex));
    return distance > 0.000001 ? Math.abs(domeUv.getY(vertex) - domeUv.getY(previous)) / distance : null;
  }).filter(Number.isFinite);
  assert.ok(verticalScales.length > 2);
  const verticalScaleMaximum = Math.max(...verticalScales);
  const verticalScaleVariation = verticalScaleMaximum - Math.min(...verticalScales);
  assert.ok(verticalScaleVariation / verticalScaleMaximum < 0.001, `vertical UV scale must stay constant along the curved meridian; relative variation=${verticalScaleVariation / verticalScaleMaximum}`);
  const texturedTransition = texturedRoom.getObjectByName('Room dome springing ring');
  assert.equal(texturedTransition.material.userData.brickBondSide, undefined);
  assert.equal(texturedTransition.material.userData.brickBondSelection, undefined);
  assert.equal(texturedTransition.material.map, null);
  const domeParts = texturedRoom.children.filter((child) => child.isMesh && child.userData?.wallSide === 'room_dome');
  const drumParts = texturedRoom.children.filter((child) => child.isMesh && child.userData?.wallSide === 'room_dome_drum');
  const transitionParts = texturedRoom.children.filter((child) => child.isMesh && child.userData?.wallSide === 'room_dome_transition');
  const ringParts = texturedRoom.children.filter((child) => child.isMesh && child.userData?.wallSide === 'room_dome_ring');
  assert.ok(domeParts.length >= 1);
  assert.equal(drumParts.length, 1);
  assert.equal(ringParts.length, 1);
  assert.ok(transitionParts.length > 3);
  assert.ok(domeParts.every((child) => child.userData.roomDomePart));
  assert.ok(drumParts.every((child) => child.userData.roomDomePart));
  assert.ok(transitionParts.every((child) => child.userData.roomDomePart));
  const drum = texturedRoom.getObjectByName('Room dome cylindrical drum');
  assert.ok(drum);
  assert.ok(Array.isArray(drum.material));
  const drumExteriorMaterial = drum.material[drum.userData.roomDomeDrumExteriorMaterialIndex];
  const drumInteriorMaterial = drum.material[drum.userData.roomDomeDrumInteriorMaterialIndex];
  assert.equal(drumExteriorMaterial.userData.brickBondSide, 'room_dome_drum');
  assert.equal(drumExteriorMaterial.userData.brickBondSelection, 'flemish');
  assert.equal(drumExteriorMaterial.userData.surfaceBrickColor, '#c86432');
  assert.equal(drumInteriorMaterial.userData.brickBondSide, 'room_dome_drum_interior');
  assert.equal(drumInteriorMaterial.userData.brickBondSelection, 'stack');
  assert.equal(drum.userData.roomDomeDrumBrickColor, '#c86432');
  assert.equal(drum.userData.roomDomeDrumThicknessSource, 'one-normal-brick-length');
  assert.ok(Math.abs(drum.userData.roomDomeDrumThickness - texturedWalls.bricks.brickWidth) < 0.000001);
  assert.ok(Math.abs(
    drum.geometry.userData.roomDomeDrumOuterRadius - drum.geometry.userData.roomDomeDrumInnerRadius
      - texturedWalls.bricks.brickWidth
  ) < 0.000001);
  assert.ok(Math.abs(drum.geometry.userData.roomDomeDrumThickness - texturedWalls.bricks.brickWidth) < 0.000001);
  assert.ok(Number.isInteger(drumExteriorMaterial.map.repeat.x), 'the drum bond must complete a whole number of repeats around its seam');
  assert.equal(drum.userData.roomDomeDrumHeight, 0.8);
  assert.ok(Math.abs(texturedDome.userData.roomDomeArchConstruction.apexPoint[1] - (texturedDome.userData.roomDomeSpringY + texturedDome.userData.roomDomeRise)) < 0.01);

  const singleDomeBuilding = normalizeBuilding({
    ...building,
    innerDomeEnabledByTransition: {
      ...building.innerDomeEnabledByTransition,
      karbandi: false,
    },
  });
  const singleDomeWalls = normalizeWallSystem(texturedWalls, singleDomeBuilding);
  const singleDomeRoom = buildWallSystemWithCanvasMock(singleDomeBuilding, singleDomeWalls);
  const singleDome = singleDomeRoom.getObjectByName('Room circular dome cover');
  assert.equal(singleDomeRoom.getObjectByName('Room inner dome cover'), undefined);
  assert.equal(singleDomeRoom.getObjectByName('Between domes supporting walls'), undefined,
    'supporting walls must not exist when the inner dome is off');
  const singleInteriorMaterial = singleDome.material[singleDome.userData.roomDomeInteriorMaterialIndex];
  assert.equal(singleInteriorMaterial.userData.brickBondSide, 'room_dome_interior');
  assert.equal(singleInteriorMaterial.userData.brickBondSelection, 'flemish',
    'with one dome, the user interior bond must move onto the outer shell room-facing surface');
  assert.equal(singleDome.material[singleDome.userData.roomDomeReturnMaterialIndex].userData.brickBondSelection, 'running');
  assert.equal(singleDome.material[singleDome.userData.roomDomeReturnMaterialIndex].userData.roomDomeAutomaticRunningBond, true);

  const scene = Object.create(MehrazScene.prototype);
  scene.building = building;
  scene.walls = normalizeWallSystem({
    bricks: { ...DEFAULT_WALL_SYSTEM.bricks, enabled: false },
  }, building);
  scene.buildingGroup = new THREE.Group();
  const plainRoom = buildWallSystem(building, scene.walls);
  scene.buildingGroup.add(plainRoom);
  scene.scene = new THREE.Scene();
  scene.wallSurfaceHighlight = null;
  scene.selectedWallSide = 'room_dome';
  scene.karbandiRibArchEditing = false;
  scene.invalidate = () => {};
  scene.updateWallSurfaceHighlight();
  assert.ok(scene.wallSurfaceHighlight);
  const plainDomeParts = plainRoom.children.filter((child) => child.isMesh && child.userData?.wallSide === 'room_dome');
  const highlightedDomeParts = scene.wallSurfaceHighlight.children.filter((child) => child.userData?.isWallSideHighlight === true);
  assert.equal(highlightedDomeParts.length, plainDomeParts.length, 'selecting the dome must highlight the shell and its drum');
  const archGuide = scene.wallSurfaceHighlight.getObjectByName('Room dome symmetric red and green construction circles');
  assert.ok(archGuide);
  assert.equal(archGuide.userData.isRoomDomeArchConstructionGuide, true);
  assert.equal(archGuide.children.filter((child) => child.userData.archConstructionRole === 'red-center').length, 2);
  assert.equal(archGuide.children.filter((child) => child.userData.archConstructionRole === 'green-center').length, 2);

  scene.selectedWallSide = 'room_dome_inner';
  scene.updateWallSurfaceHighlight();
  const plainInnerDomeParts = plainRoom.children.filter((child) => child.isMesh && child.userData?.wallSide === 'room_dome_inner');
  const highlightedInnerDomeParts = scene.wallSurfaceHighlight.children.filter((child) => child.userData?.isWallSideHighlight === true);
  assert.equal(plainInnerDomeParts.length, 1);
  assert.equal(highlightedInnerDomeParts.length, plainInnerDomeParts.length);
  const innerArchGuide = scene.wallSurfaceHighlight.getObjectByName('Room inner dome symmetric red and green construction circles');
  assert.ok(innerArchGuide);
  assert.equal(innerArchGuide.userData.isRoomInnerDomeArchConstructionGuide, true);
  assert.equal(innerArchGuide.children.filter((child) => child.userData.archConstructionRole === 'red-center').length, 2);
  assert.equal(innerArchGuide.children.filter((child) => child.userData.archConstructionRole === 'green-center').length, 2);

  scene.selectedWallSide = 'room_dome_transition';
  scene.updateWallSurfaceHighlight();
  const plainTransitionParts = [];
  plainRoom.traverse((child) => {
    if (child.isMesh && child.userData?.wallSide === 'room_dome_transition') plainTransitionParts.push(child);
  });
  const highlightedTransitionParts = scene.wallSurfaceHighlight.children.filter((child) => child.userData?.isWallSideHighlight === true);
  assert.equal(highlightedTransitionParts.length, plainTransitionParts.length, 'selecting the transition must highlight only its independently finished components');
  assert.equal(scene.wallSurfaceHighlight.getObjectByName('Room dome symmetric red and green construction circles'), undefined);

  scene.selectedWallSide = 'room_dome_drum';
  scene.updateWallSurfaceHighlight();
  const plainDrumParts = plainRoom.children.filter((child) => child.isMesh && child.userData?.wallSide === 'room_dome_drum');
  const highlightedDrumParts = scene.wallSurfaceHighlight.children.filter((child) => child.userData?.isWallSideHighlight === true);
  assert.equal(highlightedDrumParts.length, plainDrumParts.length, 'selecting the drum must highlight only its independently finished cylinder');

  scene.selectedWallSide = 'room_dome_extra_leg';
  scene.updateWallSurfaceHighlight();
  const plainExtraLegParts = plainRoom.children.filter((child) => child.isMesh && child.userData?.wallSide === 'room_dome_extra_leg');
  const highlightedExtraLegParts = scene.wallSurfaceHighlight.children.filter((child) => child.userData?.isWallSideHighlight === true);
  assert.equal(plainExtraLegParts.length, 1);
  assert.equal(highlightedExtraLegParts.length, plainExtraLegParts.length,
    'selecting the extra leg must highlight only its independently finished shell');
});

test('Room Karbandi uses the Iwan rib generator and solutions around the Room center', () => {
  const building = normalizeBuilding({ type: 'room', width: 5, length: 5, domeTransition: 'karbandi', domeTransitionCoverEnabled: false });
  let walls = normalizeWallSystem({
    bricks: { ...DEFAULT_WALL_SYSTEM.bricks, enabled: false },
    karbandi: {
      ...DEFAULT_WALL_SYSTEM.karbandi,
      enabled: false,
      coverEnabled: false,
      autoClip: false,
      guideVisible: true,
      ribCount: 10,
      groupX: 0,
      groupZ: 0,
    },
  }, building);
  const solved = solveKarbandiWallSeating(walls.karbandi, building, walls);
  assert.equal(solved.groupZ, 0, 'Room seating keeps the Karbandi orbit centered');
  walls = normalizeWallSystem({ ...walls, karbandi: { ...walls.karbandi, ...solved, enabled: false, guideVisible: true, autoClip: false } }, building);
  const room = buildWallSystem(building, walls);
  assert.equal(room.userData.roomKarbandiUsesIwanGenerator, true);
  assert.deepEqual(room.userData.roomKarbandiRotationCenter, [0, 0]);
  assert.equal(room.userData.karbandiConfiguredRibCount, 12);
  const guide = room.getObjectByName('Karbandi rib rotation visual guide');
  assert.ok(guide);
  assert.ok(Math.abs(guide.userData.karbandiGuideCenter[0]) < 0.000001);
  assert.ok(Math.abs(guide.userData.karbandiGuideCenter[2]) < 0.000001);
  const ribs = room.children.filter((child) => child.userData?.isKarbandi === true && child.userData?.isKarbandiVisualGuide !== true);
  assert.ok(ribs.length >= 12);
  assert.ok(ribs.every((rib) => rib.userData.karbandiRotationCenterMode === 'room-center'));
  const crownY = Math.max(...ribs.map((rib) => {
    rib.geometry.computeBoundingBox();
    return rib.geometry.boundingBox.max.y;
  }));
  const crownRadii = ribs
    .map((rib) => Number(rib.userData.karbandiCrownCenterlineRadius))
    .filter(Number.isFinite);
  const crownRadius = crownRadii.reduce((sum, radius) => sum + radius, 0) / crownRadii.length;
  const dome = room.getObjectByName('Room circular dome cover');
  assert.equal(dome.userData.roomDomeSpringY, crownY + building.domeDrumHeight);
  assert.ok(Math.abs(room.userData.roomKarbandiCrownRadius - crownRadius) < 0.000001);
  assert.ok(Math.abs(dome.userData.roomDomeRadius - crownRadius) < 0.000001);
  assert.equal(dome.userData.roomDomeDiameterSource, 'retained-karbandi-rib-crown-centerline-ring');

  const tallerWalls = normalizeWallSystem({
    ...walls,
    karbandi: { ...walls.karbandi, greenHeightOffset: walls.karbandi.greenHeightOffset + 0.4 },
  }, building);
  const tallerRoom = buildWallSystem(building, tallerWalls);
  assert.ok(tallerRoom.getObjectByName('Room circular dome cover').userData.roomDomeSpringY > crownY, 'the shared Iwan rib-arch input must move the Room dome with the new rib crown');
});

test.skip('removed feature: Room Karbandi upper transition-wall symmetry', () => {
  const building = normalizeBuilding({
    type: 'room',
    width: 5,
    length: 5,
    domeTransition: 'karbandi',
    domeTransitionCoverEnabled: true,
  });
  let walls = normalizeWallSystem({
    bricks: { ...DEFAULT_WALL_SYSTEM.bricks, enabled: false },
    karbandi: { ...DEFAULT_WALL_SYSTEM.karbandi, ribCount: 16, autoClip: true },
  }, building);
  walls = normalizeWallSystem({
    ...walls,
    karbandi: { ...walls.karbandi, ...solveKarbandiWallSeating(walls.karbandi, building, walls), autoClip: true },
  }, building);
  const room = buildWallSystem(building, walls);
  assert.equal(room.userData.karbandiRoomPerimeterRule, 'all-four-walls-use-south-wall-support-and-auto-clipping');
  assert.equal(room.userData.karbandiRoomRoofWallRule, 'four-equivalent-wall-supported-sides-with-iwan-ruled-corner-roofs');
  assert.equal(room.userData.roomKarbandiFirstJunctionOctagon.length, 8);
  assert.equal(
    room.userData.roomKarbandiFirstJunctionOctagonSource,
    '8-first-intersections-of-visible-wall-supported-rib-legs',
  );
  assert.equal(room.userData.roomKarbandiWallSupportFootOctagon.length, 8);
  assert.equal(room.userData.roomKarbandiWallSupportFootOctagonSource, '8-visible-wall-supported-rib-feet-on-all-four-walls');
  const octagonWalls = room.children.filter((child) => child.userData?.roomDomePart === 'exterior-aligned-octagon-wall');
  const roofInfills = room.children.filter((child) => child.userData?.roomDomePart === 'karbandi-roof-to-drum-infill');
  const roofBackings = room.children.filter((child) => child.userData?.roomDomePart === 'karbandi-rib-top-backing');
  const roofInfillTops = room.children.filter((child) => child.userData?.roomDomePart === 'karbandi-roof-to-drum-infill-top');
  assert.equal(room.children.filter((child) => child.userData?.roomDomePart === 'vertical-wall-extension').length, 0);
  assert.equal(room.children.filter((child) => child.userData?.roomDomePart === 'karbandi-roof-to-vertical-wall-infill').length, 0);
  assert.equal(room.children.filter((child) => child.userData?.roomDomePart === 'karbandi-roof-to-octagon-infill').length, 0);
  assert.equal(octagonWalls.length, 8);
  assert.equal(roofInfills.length, 0);
  assert.equal(roofBackings.length, 0);
  assert.equal(roofInfillTops.length, 1);
  assert.ok(roofInfillTops.every((top) => top.userData.roomKarbandiInfillTopBrickShape === 'square'));
  assert.ok(octagonWalls.every((wall) => wall.userData.roomKarbandiOctagonJoint === 'zero-overlap-shared-inner-and-outer-vertices'));
  octagonWalls.forEach((wall, index) => {
    const nextWall = octagonWalls[(index + 1) % octagonWalls.length];
    assert.deepEqual(wall.userData.roomKarbandiOctagonEnd, nextWall.userData.roomKarbandiOctagonStart);
    assert.deepEqual(wall.userData.roomKarbandiOctagonInnerEnd, nextWall.userData.roomKarbandiOctagonInnerStart);
    assert.deepEqual(wall.userData.roomKarbandiOctagonTopEnd, nextWall.userData.roomKarbandiOctagonTopStart);
  });
  octagonWalls.forEach((wall) => {
    const [bottomX, , bottomZ] = wall.userData.roomKarbandiOctagonStart;
    const [topX, , topZ] = wall.userData.roomKarbandiOctagonTopStart;
    assert.ok(Math.abs(bottomX - topX) < 0.000001 && Math.abs(bottomZ - topZ) < 0.000001,
      'the octagon wall must extrude vertically without tapering toward the drum');
  });
  assert.equal(room.userData.roomKarbandiMasonryTransition.stage, 'vertical-wall-exterior-aligned-octagon-plus-brick-height-checker-roof-only');
  assert.equal(room.userData.roomKarbandiMasonryTransition.octagonAlignment, 'exterior-face-on-room-wall-exterior-finish-planes-inner-cardinal-faces-on-room-wall-interior-planes');
  assert.equal(room.userData.roomKarbandiMasonryTransition.octagonJoint, '8-mitered-vertical-walls-with-shared-corner-vertices-and-no-overlap');
  assert.equal(room.userData.roomKarbandiMasonryTransition.octagonSolidPolicy, 'one-closed-ring-with-shared-boundaries-and-no-overlapping-internal-miter-caps');
  assert.equal(room.userData.roomKarbandiMasonryTransition.verticalWallJoint, 'embedded-without-overlapping-horizontal-cap');
  assert.ok(room.userData.roomKarbandiMasonryTransition.verticalWallJointEmbed > 0);
  assert.equal(room.userData.roomKarbandiMasonryTransition.octagonSidePolicy, 'unequal-rib-derived-red-edges-extruded-to-wall-exterior-green-boundaries');
  assert.equal(room.userData.roomKarbandiMasonryTransition.roofGapFill, 'removed');
  assert.equal(room.userData.roomKarbandiMasonryTransition.roofBacking, 'removed');
  assert.equal(room.userData.roomKarbandiMasonryTransition.roofInfillBoundary, 'none-checker-roof-slab-only');
  assert.ok(Math.abs(room.userData.roomKarbandiMasonryTransition.infillTopThickness - walls.bricks.brickHeight) < 0.000001);
  assert.equal(room.userData.roomKarbandiMasonryTransition.extendedWallsRemoved, true);
  const finishProjection = 0;
  const wallExteriorPlanes = {
    west: -building.width / 2 - walls.sideOffsets.west - walls.roomWallThicknesses.west - finishProjection,
    east: building.width / 2 + walls.sideOffsets.east + walls.roomWallThicknesses.east + finishProjection,
    north: -building.length / 2 - walls.sideOffsets.north - walls.roomWallThicknesses.north - finishProjection,
    south: building.length / 2 + walls.sideOffsets.south + walls.roomWallThicknesses.south + finishProjection,
  };
  room.userData.roomKarbandiMasonryTransition.bottomOctagon.forEach(([x, , z]) => {
    assert.ok(
      Math.abs(x - wallExteriorPlanes.west) < 0.000001
        || Math.abs(x - wallExteriorPlanes.east) < 0.000001
        || Math.abs(z - wallExteriorPlanes.north) < 0.000001
        || Math.abs(z - wallExteriorPlanes.south) < 0.000001,
      'each octagon exterior corner must touch an original Room wall exterior finish plane',
    );
  });
  const octagonSideLengths = room.userData.roomKarbandiMasonryTransition.bottomOctagon.map((point, index, polygon) => (
    new THREE.Vector3(...point).distanceTo(new THREE.Vector3(...polygon[(index + 1) % polygon.length]))
  ));
  assert.ok(new Set(octagonSideLengths.map((lengthValue) => lengthValue.toFixed(4))).size > 1,
    'the rib-derived octagon must allow unequal cardinal and corner side lengths');
  octagonWalls.forEach((wall) => {
    const touchedWalls = wall.userData.roomKarbandiOctagonTouchedWalls;
    assert.ok(touchedWalls.length >= 1);
    const expectedThickness = touchedWalls.reduce((sum, side) => sum + walls.roomWallThicknesses[side], 0) / touchedWalls.length;
    assert.ok(Math.abs(wall.userData.roomKarbandiOctagonBaseWallThickness - expectedThickness) < 0.000001);
    assert.equal(wall.userData.roomKarbandiOctagonInnerFaceRule, 'cardinal-faces-coplanar-with-original-room-wall-interior-surfaces-and-mitered-corners');
    assert.equal(wall.userData.roomKarbandiOctagonExtrusionRule, 'room-wall-interior-plane-to-wall-exterior-finish-boundary');
    assert.equal(wall.userData.roomKarbandiOctagonInternalMiterCaps, false);
    assert.equal(wall.userData.roomKarbandiVerticalWallJoint, 'embedded-without-overlapping-horizontal-cap');
    wall.geometry.computeBoundingBox();
    assert.ok(Math.abs(wall.geometry.boundingBox.min.y - (
      wall.userData.roomKarbandiMasonryBaseY - wall.userData.roomKarbandiVerticalWallJointEmbed
    )) < 0.00001, 'the octagon must embed slightly into the vertical wall instead of leaving a precision gap');
    const redSourceStart = new THREE.Vector3(...wall.userData.roomKarbandiOctagonRedGuideSourceStart);
    const redSourceEnd = new THREE.Vector3(...wall.userData.roomKarbandiOctagonRedGuideSourceEnd);
    const redInnerStart = new THREE.Vector3(...wall.userData.roomKarbandiOctagonInnerStart);
    const redInnerEnd = new THREE.Vector3(...wall.userData.roomKarbandiOctagonInnerEnd);
    const sourceDirection = redSourceEnd.clone().sub(redSourceStart).setY(0).normalize();
    const innerDirection = redInnerEnd.clone().sub(redInnerStart).setY(0).normalize();
    assert.ok(Math.abs(sourceDirection.x * innerDirection.z - sourceDirection.z * innerDirection.x) < 0.000001,
      'each red interior edge must remain parallel to its two supported rib feet');
    const positions = wall.geometry.getAttribute('position');
    const edgeStart = new THREE.Vector3(...wall.userData.roomKarbandiOctagonStart);
    const edgeEnd = new THREE.Vector3(...wall.userData.roomKarbandiOctagonEnd);
    const edgeDirection = edgeEnd.clone().sub(edgeStart).setY(0);
    const edgeLengthForCaps = edgeDirection.length();
    edgeDirection.normalize();
    for (let triangle = 0; triangle < positions.count; triangle += 3) {
      const projected = [0, 1, 2].map((offset) => (
        new THREE.Vector3().fromBufferAttribute(positions, triangle + offset)
          .sub(edgeStart).dot(edgeDirection)
      ));
      assert.ok(!projected.every((value) => Math.abs(value) < 0.00001),
        'the shared start joint must not contain a duplicate internal cap');
      assert.ok(!projected.every((value) => Math.abs(value - edgeLengthForCaps) < 0.00001),
        'the shared end joint must not contain a duplicate internal cap');
      const triangleYs = [0, 1, 2].map((offset) => positions.getY(triangle + offset));
      assert.ok(!triangleYs.every((value) => Math.abs(value - wall.geometry.boundingBox.min.y) < 0.00001),
        'the vertical-wall joint must not contain a coplanar horizontal bottom cap');
    }
    const start = new THREE.Vector3(...wall.userData.roomKarbandiOctagonStart);
    const end = new THREE.Vector3(...wall.userData.roomKarbandiOctagonEnd);
    const edgeLength = start.distanceTo(end);
    const direction = end.clone().sub(start).setY(0).normalize();
    const inward = new THREE.Vector3(-direction.z, 0, direction.x);
    if (inward.dot(start.clone().negate().setY(0)) < 0) inward.negate();
    if (touchedWalls.length === 1) {
      const side = touchedWalls[0];
      const expectedInterior = {
        west: -building.width / 2 - walls.sideOffsets.west,
        east: building.width / 2 + walls.sideOffsets.east,
        north: -building.length / 2 - walls.sideOffsets.north,
        south: building.length / 2 + walls.sideOffsets.south,
      }[side];
      const innerStart = new THREE.Vector3(...wall.userData.roomKarbandiOctagonInnerStart);
      const innerEnd = new THREE.Vector3(...wall.userData.roomKarbandiOctagonInnerEnd);
      const startCoordinate = side === 'west' || side === 'east' ? innerStart.x : innerStart.z;
      const endCoordinate = side === 'west' || side === 'east' ? innerEnd.x : innerEnd.z;
      assert.ok(Math.abs(startCoordinate - expectedInterior) < 0.000001
        && Math.abs(endCoordinate - expectedInterior) < 0.000001,
      `${side} octagon interior face must continue the original vertical wall interior plane`);
    }
    assert.ok(touchedWalls.some((side) => wall.userData.roomKarbandiOctagonBondSide === `${side}_exterior`));
    assert.equal(wall.userData.roomKarbandiOctagonBrickColor, walls.color);
  });
  const roomDome = room.getObjectByName('Room circular dome cover');
  const drumBottomY = roomDome.userData.roomDomeSpringY - building.domeDrumHeight;
  room.userData.roomKarbandiMasonryTransition.topOctagon.forEach(([x, y, z], index) => {
    assert.ok(Math.abs(y - drumBottomY) < 0.000001);
    const [bottomX, , bottomZ] = room.userData.roomKarbandiMasonryTransition.bottomOctagon[index];
    assert.ok(Math.abs(x - bottomX) < 0.000001 && Math.abs(z - bottomZ) < 0.000001);
  });
  const ribFootY = room.userData.roomKarbandiWallSupportFootOctagon
    .reduce((sum, entry) => sum + entry.point[1], 0) / 8;
  assert.ok(octagonWalls.every((wall) => (
    Math.abs(wall.userData.roomKarbandiMasonryBaseY - ribFootY) < 0.000001
      && Math.abs(wall.userData.roomKarbandiMasonryTopY - drumBottomY) < 0.000001
  )), 'the vertical octagon masonry must rise from the supported rib-foot level to the bottom of the drum');
  assert.ok(roofInfills.every((infill) => (
    Math.abs(infill.userData.roomKarbandiMasonryBaseY - room.userData.roomKarbandiFirstJunctionLevel) < 0.000001
      && Math.abs(infill.userData.roomKarbandiMasonryTopY - drumBottomY) < 0.000001
  )), 'the masonry infill must close the gap from the Karbandi roof junction to the drum bottom');
  const octagonPhases = octagonWalls.map((wall) => wall.userData.brickBondPhaseU);
  assert.equal(octagonPhases[0], 0);
  octagonWalls.slice(1).forEach((wall, index) => {
    const previousStart = new THREE.Vector3(...octagonWalls[index].userData.roomKarbandiOctagonStart);
    const previousEnd = new THREE.Vector3(...octagonWalls[index].userData.roomKarbandiOctagonEnd);
    assert.ok(Math.abs(octagonPhases[index + 1] - (octagonPhases[index] + previousStart.distanceTo(previousEnd))) < 0.000001);
  });
  const supports = room.userData.karbandiHighlightedWallSupportRibIndexesByWall;
  ['north', 'east', 'south', 'west'].forEach((side) => {
    assert.ok(supports[side]?.length > 0, `${side} must participate in Room wall-support auto clipping`);
  });
  const roomRibs = room.children.filter((child) => child.userData?.isKarbandi === true && child.userData?.isKarbandiVisualGuide !== true);
  assert.ok(room.userData.karbandiAutomaticHangingClipIntervals.every((cut) => (
    cut.cutBoundary === 'support-rib-centerline'
      && Number.isFinite(cut.outerOriginalIndex)
  )), 'Room hanging ribs must independently trim their outer edge at the supporting rib centerline');
  assert.ok(room.userData.karbandiRedundantWallLegCuts.every((cut) => (
    cut.cutBoundary === 'support-rib-centerline'
      && Number.isFinite(cut.outerOriginalIndex)
  )), 'Room redundant wall legs must use the same centerline boundary');
  assert.ok(roomRibs.every((rib) => (
    rib.userData.karbandiAutomaticCutBoundary
      === 'support-rib-centerline-with-independent-inner-and-outer-edge-intersections'
  )));
  assert.ok(roomRibs.some((rib) => (
    Math.abs(rib.userData.karbandiOuterVisibleRange[0] - rib.userData.karbandiVisibleRange[0]) > 0.000001
      || Math.abs(rib.userData.karbandiOuterVisibleRange[1] - rib.userData.karbandiVisibleRange[1]) > 0.000001
  )), 'at least one finite-width Room rib must remove the outer wedge left by a shared cut index');
  const planeMatchesWall = (plane, wall) => (
    (wall === 'north' && plane.normal.z === 1)
    || (wall === 'south' && plane.normal.z === -1)
    || (wall === 'west' && plane.normal.x === 1)
    || (wall === 'east' && plane.normal.x === -1)
  );
  roomRibs.forEach((rib) => {
    const bearingWalls = rib.userData.karbandiRoomBearingWallsUnclipped;
    ['north', 'east', 'south', 'west'].forEach((wall) => {
      assert.equal(
        rib.material.clippingPlanes.some((plane) => planeMatchesWall(plane, wall)),
        !bearingWalls.includes(wall),
        `${wall} must use the same bearing-leg clipping rule as every other Room wall`,
      );
    });
  });
  const interiorPlaneConstants = {
    north: -(-building.length / 2 - walls.sideOffsets.north),
    east: building.width / 2 + walls.sideOffsets.east,
    south: building.length / 2 + walls.sideOffsets.south,
    west: -(-building.width / 2 - walls.sideOffsets.west),
  };
  ['north', 'east', 'south', 'west'].forEach((wall) => {
    roomRibs.filter((rib) => !rib.userData.karbandiRoomBearingWallsUnclipped.includes(wall)).forEach((rib) => {
      const plane = rib.material.clippingPlanes.find((candidate) => planeMatchesWall(candidate, wall));
      assert.ok(plane, `${wall} non-bearing ribs must clip at its interior face`);
      assert.ok(Math.abs(plane.constant - interiorPlaneConstants[wall]) < 0.000001);
    });
  });
  const supportedLegKeys = new Set(room.userData.karbandiWallSupportedLegKeys);
  const expectedBearingWallsByRib = new Map();
  room.userData.karbandiAllWallTouchingLegs.forEach(({ wall, ribIndex, side }) => {
    if (!supportedLegKeys.has(`${ribIndex}:${side}`)) return;
    if (!expectedBearingWallsByRib.has(ribIndex)) expectedBearingWallsByRib.set(ribIndex, new Set());
    expectedBearingWallsByRib.get(ribIndex).add(wall);
  });
  expectedBearingWallsByRib.forEach((expectedWalls, ribIndex) => {
    const rib = roomRibs.find((candidate) => candidate.userData.karbandiRibIndex === ribIndex);
    assert.ok(rib, `wall-supported Room rib ${ribIndex} must remain rendered`);
    rib.geometry.computeBoundingBox();
    const bounds = rib.geometry.boundingBox;
    expectedWalls.forEach((wall) => {
      assert.ok(rib.userData.karbandiRoomBearingWallsUnclipped.includes(wall), `${wall} bearing rib ${ribIndex} must remain embedded in its wall`);
      assert.equal(rib.material.clippingPlanes.some((plane) => planeMatchesWall(plane, wall)), false);
      const crossesInteriorFace = wall === 'north'
        ? bounds.min.z < -interiorPlaneConstants.north - 0.000001
        : wall === 'south'
          ? bounds.max.z > interiorPlaneConstants.south + 0.000001
          : wall === 'west'
            ? bounds.min.x < -interiorPlaneConstants.west - 0.000001
            : bounds.max.x > interiorPlaneConstants.east + 0.000001;
      assert.ok(crossesInteriorFace, `${wall} bearing rib ${ribIndex} must physically enter the wall instead of ending at its inner surface`);
    });
  });
  const roofPanels = [];
  room.traverse((object) => {
    if (object.userData?.isKarbandiCover) roofPanels.push(object);
  });
  assert.ok(roofPanels.length > 0);
  assert.deepEqual(
    room.userData.karbandiCornerRoofExtrusions.map((corner) => corner.label).sort(),
    ['north-east', 'north-west', 'south-east', 'south-west'],
    'Room must rotate the Iwan ruled corner-roof construction around all four corners',
  );
  room.userData.karbandiCornerRoofExtrusions.forEach((corner) => {
    assert.equal(corner.primaryPoints.length, corner.sidePoints.length);
    assert.equal(corner.primaryPoints.length, corner.intersectionPoints.length);
    assert.ok(corner.primaryPoints.length >= 3);
    assert.ok(
      new THREE.Vector3(...corner.primaryPoints.at(-1)).distanceTo(new THREE.Vector3(...corner.sidePoints.at(-1))) < 0.000001,
      `${corner.label} strips must terminate at one exact rib intersection`,
    );
    assert.equal(corner.primaryPoints[0][1], building.height);
    assert.equal(corner.sidePoints[0][1], building.height);
  });
  assert.ok(roofPanels.every((panel) => panel.userData.northVisibleRibExtrusion !== true));
  assert.ok(roofPanels.every((panel) => panel.userData.roofType !== 'crown'));
  assert.ok(roofPanels.every((panel) => !panel.name.startsWith('Karbandi north ')),
    'Room roofs must not add Iwan north-wall fallback panels');

  const supportKey = (panel) => [...panel.userData.webSupportSides].sort().join('+');
  const panelsBySupport = new Map();
  roofPanels.forEach((panel) => {
    const key = supportKey(panel);
    if (!key) return;
    if (!panelsBySupport.has(key)) panelsBySupport.set(key, []);
    panelsBySupport.get(key).push(panel);
  });
  ['north', 'east', 'south', 'west'].forEach((key) => {
    assert.equal(panelsBySupport.get(key)?.length, 1, `${key} must have one topology-driven Room perimeter panel`);
  });
  ['east+north', 'east+south', 'north+west', 'south+west'].forEach((key) => {
    assert.equal(panelsBySupport.get(key)?.length, 2, `${key} must have two intersecting ruled Room corner strips`);
    assert.ok(panelsBySupport.get(key).every((panel) => (
      panel.userData.cornerRoofIntersection === 'direct-surface-intersection-no-guide'
      && panel.userData.cornerRoofDevelopment === 'rotated-from-bearing-rib-legs-to-adjoining-room-wall-intersection'
    )));
  });
  const boundsFor = (key) => {
    const bounds = new THREE.Box3();
    panelsBySupport.get(key).forEach((panel) => {
      panel.geometry.computeBoundingBox();
      bounds.union(panel.geometry.boundingBox);
    });
    return bounds;
  };
  const assertMirroredBounds = (firstKey, secondKey, mirrorX, mirrorZ) => {
    const first = boundsFor(firstKey);
    const second = boundsFor(secondKey);
    const tolerance = 0.00001;
    const expectedMinX = mirrorX ? -first.max.x : first.min.x;
    const expectedMaxX = mirrorX ? -first.min.x : first.max.x;
    const expectedMinZ = mirrorZ ? -first.max.z : first.min.z;
    const expectedMaxZ = mirrorZ ? -first.min.z : first.max.z;
    assert.ok(Math.abs(second.min.x - expectedMinX) < tolerance);
    assert.ok(Math.abs(second.max.x - expectedMaxX) < tolerance);
    assert.ok(Math.abs(second.min.z - expectedMinZ) < tolerance);
    assert.ok(Math.abs(second.max.z - expectedMaxZ) < tolerance);
    assert.ok(Math.abs(second.min.y - first.min.y) < tolerance);
    assert.ok(Math.abs(second.max.y - first.max.y) < tolerance);
  };
  assertMirroredBounds('north', 'south', false, true);
  assertMirroredBounds('east', 'west', true, false);
  assertMirroredBounds('east+north', 'south+west', true, true);
  assertMirroredBounds('north+west', 'east+south', true, true);
});

test.skip('removed feature: four Room Karbandi wall legs build an upper square transition', () => {
  const building = normalizeBuilding({
    type: 'room',
    width: 5,
    length: 5,
    domeTransition: 'karbandi',
    roomKarbandiOctagonWallsVisible: true,
  });
  let walls = normalizeWallSystem({
    bricks: { ...DEFAULT_WALL_SYSTEM.bricks, enabled: false },
    karbandi: { ...DEFAULT_WALL_SYSTEM.karbandi, ribCount: 8, autoClip: true },
  }, building);
  walls = normalizeWallSystem({
    ...walls,
    karbandi: {
      ...walls.karbandi,
      ...solveKarbandiWallSeating(walls.karbandi, building, walls),
      autoClip: true,
    },
  }, building);
  const room = buildWallSystem(building, walls);
  const transitionWalls = room.children.filter((child) => child.userData?.roomDomePart === 'exterior-aligned-octagon-wall');
  const roofInfills = room.children.filter((child) => child.userData?.roomDomePart === 'karbandi-roof-to-drum-infill');
  assert.equal(room.userData.roomKarbandiTransitionSideCount, 4);
  assert.equal(room.userData.roomKarbandiTransitionPlan, 'square');
  assert.equal(room.userData.roomKarbandiMasonryTransition.transitionSideCount, 4);
  assert.equal(room.userData.roomKarbandiMasonryTransition.transitionPlan, 'square');
  assert.equal(room.userData.roomKarbandiWallSupportFootOctagon.length, 4);
  assert.equal(new Set(room.userData.roomKarbandiWallSupportFootOctagon.map((entry) => entry.wall)).size, 4);
  assert.equal(transitionWalls.length, 4);
  assert.equal(roofInfills.length, 0);
  assert.equal(room.children.filter((child) => child.userData?.roomDomePart === 'karbandi-rib-top-backing').length, 0);
  assert.ok(transitionWalls.every((wall) => wall.userData.roomKarbandiOctagonTouchedWalls.length === 1));
  const squareInteriorPlanes = {
    west: -building.width / 2 - walls.sideOffsets.west,
    east: building.width / 2 + walls.sideOffsets.east,
    north: -building.length / 2 - walls.sideOffsets.north,
    south: building.length / 2 + walls.sideOffsets.south,
  };
  const squareExteriorPlanes = {
    west: squareInteriorPlanes.west - walls.roomWallThicknesses.west,
    east: squareInteriorPlanes.east + walls.roomWallThicknesses.east,
    north: squareInteriorPlanes.north - walls.roomWallThicknesses.north,
    south: squareInteriorPlanes.south + walls.roomWallThicknesses.south,
  };
  transitionWalls.forEach((wall) => {
    const side = wall.userData.roomKarbandiOctagonTouchedWalls[0];
    const coordinateIndex = side === 'west' || side === 'east' ? 0 : 2;
    const outerStart = wall.userData.roomKarbandiOctagonStart;
    const outerEnd = wall.userData.roomKarbandiOctagonEnd;
    const innerStart = wall.userData.roomKarbandiOctagonInnerStart;
    const innerEnd = wall.userData.roomKarbandiOctagonInnerEnd;
    assert.ok(Math.abs(outerStart[coordinateIndex] - squareExteriorPlanes[side]) < 0.000001);
    assert.ok(Math.abs(outerEnd[coordinateIndex] - squareExteriorPlanes[side]) < 0.000001);
    assert.ok(Math.abs(innerStart[coordinateIndex] - squareInteriorPlanes[side]) < 0.000001);
    assert.ok(Math.abs(innerEnd[coordinateIndex] - squareInteriorPlanes[side]) < 0.000001);
    if (side === 'north' || side === 'south') {
      assert.equal(wall.userData.roomKarbandiSquareButtJointRole, 'long-wall');
      assert.ok(Math.abs(Math.min(outerStart[0], outerEnd[0]) - squareExteriorPlanes.west) < 0.000001);
      assert.ok(Math.abs(Math.max(outerStart[0], outerEnd[0]) - squareExteriorPlanes.east) < 0.000001);
      assert.ok(Math.abs(Math.min(innerStart[0], innerEnd[0]) - squareExteriorPlanes.west) < 0.000001);
      assert.ok(Math.abs(Math.max(innerStart[0], innerEnd[0]) - squareExteriorPlanes.east) < 0.000001);
    } else {
      assert.equal(wall.userData.roomKarbandiSquareButtJointRole, 'short-wall');
      assert.ok(Math.abs(Math.min(outerStart[2], outerEnd[2]) - squareInteriorPlanes.north) < 0.000001);
      assert.ok(Math.abs(Math.max(outerStart[2], outerEnd[2]) - squareInteriorPlanes.south) < 0.000001);
      assert.ok(Math.abs(Math.min(innerStart[2], innerEnd[2]) - squareInteriorPlanes.north) < 0.000001);
      assert.ok(Math.abs(Math.max(innerStart[2], innerEnd[2]) - squareInteriorPlanes.south) < 0.000001);
    }
  });
  transitionWalls.forEach((first, firstIndex) => {
    first.geometry.computeBoundingBox();
    transitionWalls.slice(firstIndex + 1).forEach((second) => {
      second.geometry.computeBoundingBox();
      const overlap = first.geometry.boundingBox.clone().intersect(second.geometry.boundingBox);
      const overlapSize = new THREE.Vector3();
      overlap.getSize(overlapSize);
      assert.ok(overlap.isEmpty() || overlapSize.x * overlapSize.y * overlapSize.z < 1e-12,
        'square transition walls may touch at butt joints but must never overlap in volume');
    });
  });
  const squareCorners = room.userData.roomKarbandiMasonryTransition.bottomOctagon;
  squareCorners.forEach((corner, index) => {
    const next = squareCorners[(index + 1) % squareCorners.length];
    assert.ok(Math.abs(corner[0] - next[0]) < 0.000001 || Math.abs(corner[2] - next[2]) < 0.000001,
      'every four-leg transition edge must follow a cardinal Room wall plane');
  });
  assert.equal(
    room.userData.roomKarbandiMasonryTransition.octagonSidePolicy,
    'four-cardinal-room-wall-planes-with-independent-wall-thicknesses',
  );
  assert.equal(room.children.filter((child) => child.userData?.roomDomePart === 'karbandi-roof-to-drum-infill-top').length, 1);
  const squareCheckerRoof = room.children.find((child) => (
    child.userData?.roomDomePart === 'karbandi-roof-to-drum-infill-top'
  ));
  const squareCheckerPositions = squareCheckerRoof.geometry.getAttribute('position');
  const [squareCheckerCenterX, squareCheckerCenterZ] = squareCheckerRoof.userData.roomKarbandiInfillTopDrumFootprintCenter;
  const squareDrumClipRadius = squareCheckerRoof.userData.roomKarbandiInfillTopDrumClipRadius;
  for (let vertex = 0; vertex < squareCheckerPositions.count; vertex += 1) {
    assert.ok(Math.hypot(
      squareCheckerPositions.getX(vertex) - squareCheckerCenterX,
      squareCheckerPositions.getZ(vertex) - squareCheckerCenterZ,
    ) >= squareDrumClipRadius - 0.00001,
    'square-transition checker roof must contain no geometry inside the drum footprint');
  }
  const drumBottomY = room.userData.roomKarbandiMasonryTransition.drumBottomY;
  assert.ok(transitionWalls.every((wall) => Math.abs(wall.userData.roomKarbandiMasonryTopY - drumBottomY) < 0.000001));
  assert.ok(transitionWalls.every((wall) => (
    wall.userData.roomKarbandiMasonryBaseY === building.height
      && wall.userData.roomKarbandiVerticalWallJointEmbed === 0
      && Array.isArray(wall.material)
      && wall.material.length === 3
      && wall.geometry.userData.roomSquareTransitionFaceMaterials === true
      && wall.geometry.userData.roomSquareTransitionUvRule === 'exact-lower-room-wall-local-u-and-absolute-world-y'
      && new Set(wall.geometry.groups.map((entry) => entry.materialIndex)).has(0)
      && new Set(wall.geometry.groups.map((entry) => entry.materialIndex)).has(1)
  )), 'square transition must begin at the exact Room wall top and separate exterior/interior materials');
  transitionWalls.forEach((wall) => {
    const side = wall.userData.roomKarbandiOctagonTouchedWalls[0];
    const lowerWall = room.getObjectByName(`Room ${side} south-style wall`);
    const lowerBody = lowerWall.children.find((child) => child.userData?.isRoomWallBody === true);
    const exterior = lowerBody.material[lowerBody.userData.roomWallExteriorMaterialIndex];
    const interior = lowerBody.material[lowerBody.userData.roomWallInteriorMaterialIndex];
    assert.equal(wall.material[0].color.getHexString(), exterior.color.getHexString());
    assert.equal(wall.material[1].color.getHexString(), interior.color.getHexString());
    assert.equal(
      wall.material[0].userData.roomTransitionWallMaterialSource,
      'exact-clone-of-touched-lower-room-wall-exterior',
    );
    assert.equal(
      wall.material[1].userData.roomTransitionWallMaterialSource,
      'exact-clone-of-touched-lower-room-wall-interior',
    );
    assert.equal(lowerBody.geometry.userData.roomWallTopInterfaceRemoved, true);
    assert.equal(lowerBody.receiveShadow, false);
    assert.equal(wall.receiveShadow, false);
    assert.equal(lowerBody.userData.roomContinuousWallShadowRule, 'shared-no-self-shadow-reception');
    assert.equal(wall.userData.roomContinuousWallShadowRule, 'shared-no-self-shadow-reception');
    lowerBody.geometry.computeBoundingBox();
    const lowerPositions = lowerBody.geometry.getAttribute('position');
    const lowerTopY = lowerBody.geometry.boundingBox.max.y;
    for (let triangle = 0; triangle < lowerPositions.count; triangle += 3) {
      assert.equal([0, 1, 2].every((offset) => (
        Math.abs(lowerPositions.getY(triangle + offset) - lowerTopY) <= 0.000001
      )), false, 'the lower wall must not retain a horizontal cap inside the square extension joint');
    }
    const lowerBounds = new THREE.Box3().setFromObject(lowerBody);
    const transitionBounds = new THREE.Box3().setFromObject(wall);
    ['x', 'z'].forEach((axis) => {
      assert.ok(Math.abs(lowerBounds.min[axis] - transitionBounds.min[axis]) < 0.000001);
      assert.ok(Math.abs(lowerBounds.max[axis] - transitionBounds.max[axis]) < 0.000001);
    });
  });
});

test.skip('removed feature: corner rib feet build an upper square transition', () => {
  const building = normalizeBuilding({
    type: 'room',
    width: 4,
    length: 4,
    domeTransition: 'karbandi',
    roomKarbandiOctagonWallsVisible: true,
  });
  let walls = normalizeWallSystem({
    bricks: { ...DEFAULT_WALL_SYSTEM.bricks, enabled: false },
    karbandi: {
      ...DEFAULT_WALL_SYSTEM.karbandi,
      ribCount: 8,
      referenceAngle: 175,
      autoClip: true,
    },
  }, building);
  walls = normalizeWallSystem({
    ...walls,
    karbandi: {
      ...walls.karbandi,
      ...solveKarbandiWallSeating(walls.karbandi, building, walls),
      autoClip: true,
    },
  }, building);
  const room = buildWallSystem(building, walls);
  const cornerSupports = room.userData.roomKarbandiFirstJunctionCandidates;
  assert.equal(cornerSupports.length, 4);
  assert.ok(cornerSupports.every((support) => support.walls.length === 2));
  assert.equal(new Set(cornerSupports.flatMap((support) => support.walls)).size, 4);
  assert.equal(room.userData.roomKarbandiTransitionSideCount, 4);
  assert.equal(room.userData.roomKarbandiTransitionPlan, 'square');
  const squareWalls = room.children.filter((child) => (
    child.userData?.roomDomePart === 'exterior-aligned-octagon-wall'
  ));
  assert.equal(squareWalls.length, 4);
  assert.ok(squareWalls.every((wall) => wall.userData.roomKarbandiMasonryTopY
    === room.userData.roomKarbandiMasonryTransition.drumBottomY));
});

test.skip('removed feature: high windows transfer into upper octagon transition walls', () => {
  const building = normalizeBuilding({
    type: 'room',
    width: 5,
    length: 5,
    height: 4,
    domeTransition: 'karbandi',
    roomKarbandiOctagonWallsVisible: true,
  });
  const extendingWindow = {
    enabled: true,
    width: 1,
    height: 1.2,
    position: 0,
    sillHeight: 3.4,
    head: 'lintel',
  };
  let walls = normalizeWallSystem({
    bricks: { ...DEFAULT_WALL_SYSTEM.bricks, enabled: true },
    karbandi: { ...DEFAULT_WALL_SYSTEM.karbandi, ribCount: 16, autoClip: true },
    roomWallOpenings: Object.fromEntries(['north', 'east', 'south', 'west'].map((side) => [side, {
      ...DEFAULT_WALL_SYSTEM.roomWallOpenings[side],
      window: extendingWindow,
    }])),
  }, building);
  walls = normalizeWallSystem({
    ...walls,
    karbandi: { ...walls.karbandi, ...solveKarbandiWallSeating(walls.karbandi, building, walls), autoClip: true },
  }, building);
  const room = buildWallSystemWithCanvasMock(building, walls);
  room.updateMatrixWorld(true);
  const cardinalWalls = room.children.filter((child) => (
    child.userData?.roomDomePart === 'exterior-aligned-octagon-wall'
      && child.userData.roomKarbandiOctagonTouchedWalls.length === 1
  ));
  assert.equal(cardinalWalls.length, 4);
  cardinalWalls.forEach((wall) => {
    const side = wall.userData.roomKarbandiOctagonTouchedWalls[0];
    const inheritedWindow = wall.userData.roomKarbandiInheritedOpenings.find((opening) => opening.openingType === 'window');
    assert.ok(inheritedWindow, `${side} octagon face must inherit its window opening`);
    assert.ok(inheritedWindow.bottomY > wall.userData.roomKarbandiMasonryBaseY);
    assert.ok(inheritedWindow.topY > wall.userData.roomKarbandiMasonryBaseY);
    const originalWall = room.getObjectByName(`Room ${side} south-style wall`);
    assert.ok(!originalWall.userData.roomWallOpeningTypes.includes('window'), `${side} high window must not be duplicated below`);
    const soldierGroup = room.getObjectByName(`Room Karbandi ${side} octagon inherited opening soldiers`);
    assert.ok(soldierGroup, `${side} octagon window must move its soldier courses with it`);
    const soldierRoles = soldierGroup.children.map((child) => child.userData.soldierCourseRole);
    assert.ok(soldierRoles.includes('lintel'));
    assert.ok(soldierRoles.includes('sill'));
    assert.ok(soldierGroup.children.some((child) => child.userData.soldierCourseRole === 'jamb' && child.userData.jambSide === 'left'));
    assert.ok(soldierGroup.children.some((child) => child.userData.soldierCourseRole === 'jamb' && child.userData.jambSide === 'right'));
    const start = new THREE.Vector3(...wall.userData.roomKarbandiOctagonStart);
    const openingY = inheritedWindow.bottomY + 0.1;
    const rayBySide = {
      north: [new THREE.Vector3(0, openingY, start.z - 1), new THREE.Vector3(0, 0, 1)],
      east: [new THREE.Vector3(start.x + 1, openingY, 0), new THREE.Vector3(-1, 0, 0)],
      south: [new THREE.Vector3(0, openingY, start.z + 1), new THREE.Vector3(0, 0, -1)],
      west: [new THREE.Vector3(start.x - 1, openingY, 0), new THREE.Vector3(1, 0, 0)],
    };
    const [origin, direction] = rayBySide[side];
    const intersections = new THREE.Raycaster(origin, direction, 0, 3).intersectObject(wall, false);
    assert.equal(intersections.length, 0, `${side} window must cut completely through the octagon wall`);
  });
  const roomRibs = room.children.filter((child) => child.userData?.isKarbandi === true
    && child.userData?.isKarbandiVisualGuide !== true);
  assert.ok(roomRibs.length > 0);
  assert.ok(roomRibs.every((rib) => (
    rib.material.userData.roomKarbandiOpeningClipRule
      === 'discard-rib-fragments-inside-inherited-octagon-openings'
      && ['north', 'east', 'south', 'west'].every((side) => (
        rib.material.userData.roomKarbandiOpeningClipRegions.some((region) => (
          region.side === side && region.openingType === 'window'
        ))
      ))
  )), 'all Room ribs must clip against the four inherited octagon windows');
});

test.skip('removed feature: window guides transfer into upper octagon transition walls', () => {
  const building = normalizeBuilding({
    type: 'room',
    width: 5,
    length: 5,
    height: 4,
    domeTransition: 'karbandi',
    roomKarbandiOctagonWallsVisible: true,
  });
  const window = {
    ...DEFAULT_WALL_SYSTEM.roomWallOpenings.north.window,
    enabled: true,
    width: 1,
    height: 1.2,
    position: 0,
    sillHeight: 3.4,
    head: 'arch',
    arch: {
      ...DEFAULT_WALL_SYSTEM.roomWallOpenings.north.window.arch,
      redOffset: -0.2,
      greenOffset: 0.7,
      greenHeightOffset: -0.25,
    },
  };
  let walls = normalizeWallSystem({
    bricks: { ...DEFAULT_WALL_SYSTEM.bricks, enabled: true },
    karbandi: { ...DEFAULT_WALL_SYSTEM.karbandi, enabled: true, ribCount: 16, autoClip: true },
    roomWallOpenings: {
      ...DEFAULT_WALL_SYSTEM.roomWallOpenings,
      north: {
        ...DEFAULT_WALL_SYSTEM.roomWallOpenings.north,
        window,
      },
    },
  }, building);
  walls = normalizeWallSystem({
    ...walls,
    karbandi: { ...walls.karbandi, ...solveKarbandiWallSeating(walls.karbandi, building, walls), autoClip: true },
  }, building);
  const builtWallSystem = buildWallSystemWithCanvasMock(building, walls);
  const octagonHost = builtWallSystem.children.find((child) => (
    child.userData?.roomDomePart === 'exterior-aligned-octagon-wall'
      && child.userData?.roomKarbandiOctagonTouchedWalls?.length === 1
      && child.userData.roomKarbandiOctagonTouchedWalls[0] === 'north'
  ));
  const inheritedOpening = octagonHost.userData.roomKarbandiInheritedOpenings
    .find((entry) => entry.openingType === 'window');
  assert.ok(inheritedOpening);
  const originalNorthWall = builtWallSystem.getObjectByName('Room north south-style wall');
  assert.ok(!originalNorthWall.userData.roomWallOpeningTypes.includes('window'));
  assert.ok(originalNorthWall.userData.roomWallTransferredOpeningTypes.includes('window'));
  const windowArchSoldiers = [];
  builtWallSystem.traverse((child) => {
    if (child.userData?.openingType === 'window' && child.userData?.soldierCourseRole === 'arch-head') {
      windowArchSoldiers.push(child);
    }
  });
  assert.equal(windowArchSoldiers.length, 1, 'the transferred arched window must have one octagon soldier arch and no vertical-wall duplicate');

  const scene = Object.create(MehrazScene.prototype);
  scene.building = building;
  scene.walls = walls;
  scene.buildingGroup = new THREE.Group();
  scene.buildingGroup.add(builtWallSystem);
  scene.selectedOpeningGuide = 'north:window';
  const guideRoot = new THREE.Group();
  MehrazScene.prototype.addRoomWallOpeningConstructionGuides.call(scene, guideRoot);
  guideRoot.updateMatrixWorld(true);
  const guide = guideRoot.getObjectByName('north wall window arch symmetric red and green construction circles');
  assert.ok(guide);
  assert.equal(guide.userData.openingHostSurface, 'octagon-wall');
  assert.equal(guide.userData.openingHostBottomY, inheritedOpening.bottomY);
  assert.equal(guide.userData.openingHostTopY, inheritedOpening.topY);
  assert.equal(guide.userData.openingHostSpringY, inheritedOpening.springY);

  const start = new THREE.Vector3(...octagonHost.userData.roomKarbandiOctagonStart);
  const end = new THREE.Vector3(...octagonHost.userData.roomKarbandiOctagonEnd);
  const direction = end.clone().sub(start).setY(0).normalize();
  const expectedCenter = start.clone().addScaledVector(
    direction,
    (inheritedOpening.left + inheritedOpening.right) / 2,
  );
  const redCenters = guide.children.filter((child) => child.userData.archConstructionRole === 'red-center');
  const renderedCenter = redCenters
    .map((point) => point.getWorldPosition(new THREE.Vector3()))
    .reduce((sum, point) => sum.add(point), new THREE.Vector3())
    .multiplyScalar(1 / redCenters.length);
  const centerDelta = renderedCenter.clone().sub(expectedCenter).setY(0);
  assert.ok(Math.abs(centerDelta.dot(direction)) < 0.000001,
    'the guide must use the inherited octagon opening center along its face');
  assert.ok(centerDelta.length() >= 0.035 && centerDelta.length() <= 0.04,
    'the guide must sit only at its intended visibility offset from the octagon face');
  const expectedConstruction = pointedArchConstruction(
    (inheritedOpening.left + inheritedOpening.right) / 2,
    (inheritedOpening.right - inheritedOpening.left) / 2,
    inheritedOpening.springY,
    window.arch.greenOffset,
    inheritedOpening.greenHeight,
    { redOffset: window.arch.redOffset, redRadius: window.arch.redRadius },
  );
  redCenters.forEach((point) => {
    assert.ok(Math.abs(point.getWorldPosition(new THREE.Vector3()).y - expectedConstruction.redCenter.y) < 0.000001,
      'the octagon host base height must not be added twice to the guide');
  });
  const greenCenters = guide.children.filter((child) => child.userData.archConstructionRole === 'green-center');
  greenCenters.forEach((point) => {
    assert.ok(Math.abs(point.getWorldPosition(new THREE.Vector3()).y - expectedConstruction.greenCenter.y) < 0.000001,
      'the guide green centers must share the inherited opening world height');
  });
  assert.ok(Math.abs(guide.userData.archConstructionSpringY - inheritedOpening.springY) < 0.000001);
  assert.ok(Math.abs(guide.userData.archConstructionApexY - inheritedOpening.topY) < 0.000001);
});

test('Room section view clips the east half at the north-south center plane and restores materials', () => {
  const scene = Object.create(MehrazScene.prototype);
  scene.building = normalizeBuilding({ type: 'room', width: 6, length: 5, height: 4 });
  scene.walls = normalizeWallSystem({
    sideOffsets: { ...DEFAULT_WALL_SYSTEM.sideOffsets, west: 0.2, east: 0.4 },
  }, scene.building);
  scene.sectionViewEnabled = false;
  scene.sectionViewCameraState = null;
  scene.sectionMaterialClipping = new Map();
  scene.sectionClipPlane = null;
  scene.sectionCapGroup = new THREE.Group();
  scene.buildingGroup = new THREE.Group();
  scene.archInfillGroup = new THREE.Group();
  scene.zoneDecorationGroup = new THREE.Group();
  scene.placementGroup = new THREE.Group();
  scene.placementMaskGroup = new THREE.Group();
  const permanentPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1);
  const material = new THREE.MeshStandardMaterial({ clippingPlanes: [permanentPlane] });
  scene.buildingGroup.add(new THREE.Mesh(new THREE.BoxGeometry(6, 4, 5), material));
  scene.camera = new THREE.PerspectiveCamera(42, 1, 0.05, 160);
  scene.camera.position.set(-8, 6, -9);
  scene.controls = { target: new THREE.Vector3(0, 2, 0), update() {} };
  scene.completeModelBounds = () => new THREE.Box3(
    new THREE.Vector3(-3.2, 0, -2.5),
    new THREE.Vector3(3.4, 8, 2.5),
  );
  scene.invalidate = () => {};
  const originalPosition = scene.camera.position.clone();
  assert.equal(MehrazScene.prototype.setRoomSectionView.call(scene, true), true);
  assert.equal(material.clippingPlanes.length, 2);
  assert.equal(material.clippingPlanes[0], permanentPlane);
  assert.ok(scene.sectionCapGroup.children.length > 0);
  assert.ok(scene.sectionCapGroup.children.every((cap) => (
    cap.userData.roomSectionCutFace === true
      && cap.material.userData.roomSectionFillColor === '#62666a'
      && cap.material.userData.roomSectionHatch === 'black-45-degree'
  )));
  const sectionPlane = material.clippingPlanes[1];
  const expectedCenterX = ((-3 - 0.2) + (3 + 0.4)) / 2;
  assert.ok(Math.abs(sectionPlane.distanceToPoint(new THREE.Vector3(expectedCenterX, 2, 0))) < 0.000001);
  assert.ok(sectionPlane.distanceToPoint(new THREE.Vector3(expectedCenterX + 1, 2, 0)) < 0,
    'the east half must be removed while the north-south center section remains visible');
  assert.ok(scene.camera.position.x > expectedCenterX, 'the section preview must look toward the cut from the east');
  assert.equal(MehrazScene.prototype.setRoomSectionView.call(scene, false), false);
  assert.deepEqual(material.clippingPlanes, [permanentPlane]);
  assert.equal(scene.sectionCapGroup.children.length, 0);
  assert.ok(scene.camera.position.distanceTo(originalPosition) < 0.000001);
});

test('Portal enables X and Y slices for its own walls, transition, and cover geometry', () => {
  const scene = Object.create(MehrazScene.prototype);
  scene.building = normalizeBuilding({
    type: 'iwan',
    buildingType: 'portal',
    width: 6,
    depth: 5,
    height: 4,
  });
  scene.walls = normalizeWallSystem({}, scene.building);
  scene.sectionViewEnabled = false;
  scene.sectionViewAxis = 'x';
  scene.sectionViewCameraState = null;
  scene.sectionMaterialClipping = new Map();
  scene.sectionClipPlane = null;
  scene.sectionCapGroup = new THREE.Group();
  scene.buildingGroup = new THREE.Group();
  scene.archInfillGroup = new THREE.Group();
  scene.zoneDecorationGroup = new THREE.Group();
  scene.placementGroup = new THREE.Group();
  scene.placementMaskGroup = new THREE.Group();
  scene.projectInstanceGroup = new THREE.Group();
  const material = new THREE.MeshStandardMaterial();
  scene.buildingGroup.add(new THREE.Mesh(new THREE.BoxGeometry(6, 4, 5), material));
  scene.camera = new THREE.PerspectiveCamera(42, 1, 0.05, 160);
  scene.camera.position.set(-8, 6, -9);
  scene.controls = { target: new THREE.Vector3(0, 2, 0), update() {} };
  scene.completeModelBounds = () => new THREE.Box3(
    new THREE.Vector3(-3, 0, -2.5),
    new THREE.Vector3(3, 4, 2.5),
  );
  scene.invalidate = () => {};

  assert.equal(MehrazScene.prototype.setRoomSectionView.call(scene, true, 'x'), true);
  assert.equal(scene.sectionViewAxis, 'x');
  assert.equal(material.clippingPlanes.length, 1);
  assert.ok(scene.sectionCapGroup.children.length > 0);
  assert.ok(scene.sectionCapGroup.children.every((cap) => cap.userData.roomSectionAxis === 'x'));

  assert.equal(MehrazScene.prototype.setRoomSectionView.call(scene, true, 'y'), true);
  assert.equal(scene.sectionViewAxis, 'y');
  assert.equal(material.clippingPlanes.length, 1);
  assert.ok(scene.sectionCapGroup.children.length > 0);
  assert.ok(scene.sectionCapGroup.children.every((cap) => cap.userData.roomSectionAxis === 'y'));

  assert.equal(MehrazScene.prototype.setRoomSectionView.call(scene, false), false);
  assert.equal(material.clippingPlanes, null);
  assert.equal(scene.sectionCapGroup.children.length, 0);
});

test('Slice applies a transformed local-center clipping plane to every staged project', () => {
  const scene = Object.create(MehrazScene.prototype);
  scene.building = normalizeBuilding({ type: 'iwan', width: 5, depth: 6, height: 4 });
  scene.walls = normalizeWallSystem({}, scene.building);
  scene.sectionViewEnabled = false;
  scene.sectionViewCameraState = null;
  scene.sectionMaterialClipping = new Map();
  scene.sectionClipPlane = null;
  scene.sectionCapGroup = new THREE.Group();
  scene.buildingGroup = new THREE.Group();
  scene.archInfillGroup = new THREE.Group();
  scene.zoneDecorationGroup = new THREE.Group();
  scene.placementGroup = new THREE.Group();
  scene.placementMaskGroup = new THREE.Group();
  scene.projectInstanceGroup = new THREE.Group();
  const project = new THREE.Group();
  project.userData.isProjectInstance = true;
  project.userData.sectionCenterX = 0.25;
  project.userData.sectionCenterZ = -0.4;
  project.position.set(7, 0, -3);
  project.rotation.y = Math.PI / 4;
  project.scale.setScalar(1.6);
  const permanentPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.5);
  const material = new THREE.MeshStandardMaterial({ clippingPlanes: [permanentPlane] });
  project.add(new THREE.Mesh(new THREE.BoxGeometry(4, 4, 4), material));
  scene.projectInstanceGroup.add(project);
  scene.camera = new THREE.PerspectiveCamera(42, 1, 0.05, 160);
  scene.camera.position.set(-8, 6, -9);
  scene.controls = { target: new THREE.Vector3(0, 2, 0), update() {} };
  scene.completeModelBounds = () => new THREE.Box3(
    new THREE.Vector3(-3, 0, -6),
    new THREE.Vector3(11, 7, 3),
  );
  scene.invalidate = () => {};

  assert.equal(MehrazScene.prototype.setRoomSectionView.call(scene, true), true);
  assert.equal(material.clippingPlanes.length, 2);
  assert.equal(material.clippingPlanes[0], permanentPlane);
  project.updateWorldMatrix(true, true);
  const center = new THREE.Vector3(0.25, 1, 0).applyMatrix4(project.matrixWorld);
  const removedSide = new THREE.Vector3(1.25, 1, 0).applyMatrix4(project.matrixWorld);
  const projectPlane = material.clippingPlanes[1];
  assert.ok(Math.abs(projectPlane.distanceToPoint(center)) < 0.000001);
  assert.ok(projectPlane.distanceToPoint(removedSide) < 0,
    'each project must remove its own local east half after move, rotation, and scale');

  assert.equal(MehrazScene.prototype.setRoomSectionView.call(scene, true, 'y'), true);
  assert.equal(material.clippingPlanes.length, 2);
  const perpendicularCenter = new THREE.Vector3(0, 1, -0.4).applyMatrix4(project.matrixWorld);
  const perpendicularRemovedSide = new THREE.Vector3(0, 1, 0.6).applyMatrix4(project.matrixWorld);
  const perpendicularPlane = material.clippingPlanes[1];
  assert.ok(Math.abs(perpendicularPlane.distanceToPoint(perpendicularCenter)) < 0.000001);
  assert.ok(perpendicularPlane.distanceToPoint(perpendicularRemovedSide) < 0,
    'Y Slice must remove each project local south half on the perpendicular center plane');
  assert.equal(scene.sectionViewAxis, 'y');
  assert.ok(scene.camera.position.z > scene.controls.target.z,
    'Y Slice must look toward its cut from the positive local Y-plan direction');

  assert.equal(MehrazScene.prototype.setRoomSectionView.call(scene, false), false);
  assert.deepEqual(material.clippingPlanes, [permanentPlane]);
});

test('Y Slice builds perpendicular center caps on the world Z plane', () => {
  const scene = Object.create(MehrazScene.prototype);
  scene.building = normalizeBuilding({ type: 'room', width: 4, length: 6, height: 4 });
  scene.walls = normalizeWallSystem({}, scene.building);
  scene.buildingGroup = new THREE.Group();
  scene.buildingGroup.add(new THREE.Mesh(
    new THREE.BoxGeometry(4, 4, 6),
    new THREE.MeshStandardMaterial(),
  ));
  scene.archInfillGroup = new THREE.Group();
  scene.sectionCapGroup = new THREE.Group();
  scene.groundMesh = null;

  MehrazScene.prototype.buildRoomSectionCaps.call(scene, 0, 'y');
  assert.ok(scene.sectionCapGroup.children.length > 0);
  scene.sectionCapGroup.children.forEach((cap) => {
    assert.equal(cap.userData.roomSectionAxis, 'y');
    const positions = cap.geometry.getAttribute('position');
    for (let vertex = 0; vertex < positions.count; vertex += 1) {
      assert.ok(Math.abs(positions.getZ(vertex) - 0.0005) < 0.000001);
    }
  });
});

test('Room section caps hatch dome and drum thickness without closing their interior void', () => {
  const building = normalizeBuilding({
    type: 'room',
    width: 5,
    length: 5,
    domeTransition: 'karbandi',
    domeTransitionCoverEnabled: true,
    domeDrumHeight: 0.5,
    innerDomeEnabled: true,
  });
  let walls = normalizeWallSystem({
    bricks: { ...DEFAULT_WALL_SYSTEM.bricks, enabled: false },
    karbandi: { ...DEFAULT_WALL_SYSTEM.karbandi, ribCount: 16, autoClip: true },
  }, building);
  walls = normalizeWallSystem({
    ...walls,
    karbandi: {
      ...walls.karbandi,
      ...solveKarbandiWallSeating(walls.karbandi, building, walls),
      autoClip: true,
    },
  }, building);
  const wallSystem = buildWallSystem(building, walls);
  const roomWallCoverPanels = [];
  wallSystem.traverse((object) => {
    if (object.userData?.isKarbandiCover && object.userData.wallContinuationSide) {
      roomWallCoverPanels.push(object);
    }
  });
  assert.ok(roomWallCoverPanels.length >= 8);
  const roomPerimeter = (building.width + building.length) * 2;
  const roomWallPhases = {
    south: building.width / 2,
    east: building.width + building.length / 2,
    north: building.width + building.length + building.width / 2,
    west: building.width * 2 + building.length + building.length / 2,
  };
  const roomWallAxes = { south: '+world-x', east: '-world-z', north: '-world-x', west: '+world-z' };
  roomWallCoverPanels.forEach((panel) => {
    const side = panel.userData.wallContinuationSide;
    assert.equal(panel.userData.wallContinuationSeamlessAtWallTop, true);
    assert.equal(panel.userData.wallContinuationCourseAxis, 'world-y');
    assert.equal(panel.userData.wallContinuationUAxis, roomWallAxes[side]);
    assert.ok(Math.abs(panel.userData.wallContinuationBondPhase - roomWallPhases[side]) < 0.000001);
    assert.ok(Math.abs(panel.userData.wallContinuationBondCycle - roomPerimeter) < 0.000001);
    assert.equal(
      panel.geometry.userData.roomWallContinuationUvMapping,
      'same-local-horizontal-axis-and-world-y-as-connected-room-wall',
    );
  });
  const scene = Object.create(MehrazScene.prototype);
  scene.building = building;
  scene.walls = walls;
  scene.buildingGroup = new THREE.Group();
  scene.buildingGroup.add(wallSystem);
  scene.archInfillGroup = new THREE.Group();
  scene.sectionCapGroup = new THREE.Group();
  scene.groundMesh = null;
  MehrazScene.prototype.buildRoomSectionCaps.call(scene, 0);
  const domeCaps = scene.sectionCapGroup.children.filter((cap) => cap.userData.roomSectionSourcePart === 'dome-shell');
  const innerDomeCaps = scene.sectionCapGroup.children.filter((cap) => cap.userData.roomSectionSourcePart === 'inner-dome-shell');
  const drumCaps = scene.sectionCapGroup.children.filter((cap) => cap.userData.roomSectionSourcePart === 'dome-drum');
  const transitionWallCaps = scene.sectionCapGroup.children.filter((cap) => (
    cap.userData.roomSectionSourcePart === 'exterior-aligned-octagon-wall'
  ));
  const checkerRoofCaps = scene.sectionCapGroup.children.filter((cap) => (
    cap.userData.roomSectionSourcePart === 'karbandi-roof-to-drum-infill-top'
  ));
  const transitionCoverCaps = scene.sectionCapGroup.children.filter((cap) => (
    cap.userData.roomSectionSourcePart === 'transition-cover-octagon-bearing-interface'
  ));
  const karbandiRoofCaps = scene.sectionCapGroup.children.filter((cap) => (
    cap.userData.roomSectionSourcePart === 'transition-cover-roof-section'
      && cap.userData.roomSectionCapSource === 'continuous-karbandi-roof-envelope-without-boundary-padding'
  ));
  assert.equal(domeCaps.length, 1, 'the dome shell section must be one continuous masonry band');
  assert.equal(innerDomeCaps.length, 2, 'the independent inner dome section must cap both symmetric shell cuts');
  assert.ok(innerDomeCaps.every((cap) => cap.userData.roomSectionVoidPreserved === true));
  assert.equal(drumCaps.length, 2, 'the drum section must expose two wall-thickness bands around one central void');
  assert.equal(transitionWallCaps.length, 0, 'section view must not restore removed transition walls');
  assert.equal(checkerRoofCaps.length, 0, 'section view must not restore the removed checker slab');
  assert.ok(checkerRoofCaps.every((cap) => (
    cap.userData.roomSectionCapSource === 'checker-roof-section-clipped-outside-actual-drum-footprint'
      && cap.material.userData.roomSectionFillColor === '#62666a'
      && cap.material.userData.roomSectionHatch === 'black-45-degree'
  )));
  assert.equal(transitionCoverCaps.length, 0,
    'section view must not invent a cap for the invisible roof-to-octagon volume');
  assert.ok(karbandiRoofCaps.length > 0,
    'Karbandi roof must also have its own continuous section envelope across panel boundaries');
  const coverVoid = wallSystem.userData.roomKarbandiCoverOpeningVoid;
  karbandiRoofCaps.forEach((cap) => {
    const positions = cap.geometry.getAttribute('position');
    for (let vertex = 0; vertex < positions.count; vertex += 1) {
      assert.ok(Math.abs(positions.getZ(vertex) - coverVoid.center[1]) >= coverVoid.radius - 0.0001,
        'transition-cover section caps must remain outside the circular drum opening');
    }
  });
  assert.ok(karbandiRoofCaps.every((cap) => (
    cap.userData.roomSectionHatchSpacing === 0.08
      && cap.material.userData.roomSectionFillColor === '#62666a'
      && cap.material.userData.roomSectionHatch === 'black-45-degree'
      && cap.userData.roomSectionClosureThreshold >= 0.012
      && cap.userData.roomSectionBoundaryPadding === 0
      && cap.userData.roomSectionBoundaryPolicy === 'roof-only-continuous-envelope-no-exterior-bleed'
      && cap.userData.roomSectionRoofProfile === 'smoothed-monotonic-visible-top-with-constant-physical-thickness'
      && cap.material.depthTest === true
      && cap.material.depthWrite === true
      && cap.material.side === THREE.FrontSide
      && cap.material.userData.roomSectionVisibilityPolicy === 'east-facing-cut-interface-depth-occluded-by-intact-masonry'
  )), 'the Karbandi roof section must be continuous without expanding beyond its real boundary');
  karbandiRoofCaps.forEach((cap) => {
    const vertexCount = cap.geometry.getAttribute('position').count;
    assert.equal(cap.geometry.index.count / 3, vertexCount - 2,
      'each visible Karbandi roof side must triangulate as one continuous cap without scattered islands');
  });
  assert.ok(transitionWallCaps.every((cap) => (
    cap.userData.roomSectionCapSource === 'complete-transition-wall-section-on-exact-true-boundary'
      && cap.userData.roomSectionHatchSpacing === 0.08
      && cap.material.userData.roomSectionFillColor === '#62666a'
      && cap.material.userData.roomSectionHatch === 'black-45-degree'
      && cap.material.depthTest === true
      && cap.material.depthWrite === true
      && cap.material.side === THREE.FrontSide
  )), 'the octagon wall section must be fully closed with the same dense dark hatch');
  const individualKarbandiCaps = scene.sectionCapGroup.children.filter((cap) => (
    cap.userData.roomSectionSourceIsKarbandi === true
      && cap.userData.roomSectionSourceIsKarbandiCover !== true
  ));
  assert.equal(individualKarbandiCaps.length, 0,
    'hidden and individual Karbandi ribs must not create isolated section-cap fragments');
  assert.ok([...domeCaps, ...drumCaps].every((cap) => cap.userData.roomSectionVoidPreserved === true));
  const dome = wallSystem.getObjectByName('Room circular dome cover');
  const voidY = dome.userData.roomDomeSpringY + Math.min(0.25, dome.userData.roomDomeRise * 0.25);
  scene.sectionCapGroup.updateMatrixWorld(true);
  const voidHits = new THREE.Raycaster(
    new THREE.Vector3(1, voidY, 0),
    new THREE.Vector3(-1, 0, 0),
    0,
    2,
  ).intersectObjects([...domeCaps, ...drumCaps], false);
  assert.equal(voidHits.length, 0, 'the center of the dome and drum must remain open to the Room below');
});

test('Room Karbandi transition walls cannot be restored by legacy saved settings', () => {
  const baseBuilding = normalizeBuilding({
    type: 'room',
    width: 5,
    length: 5,
    domeTransition: 'karbandi',
    roomKarbandiOctagonWallsVisible: true,
  });
  assert.equal(baseBuilding.roomKarbandiOctagonWallsVisible, undefined);
  let walls = normalizeWallSystem({
    bricks: { ...DEFAULT_WALL_SYSTEM.bricks, enabled: false },
    karbandi: { ...DEFAULT_WALL_SYSTEM.karbandi, ribCount: 16, autoClip: true },
  }, baseBuilding);
  walls = normalizeWallSystem({
    ...walls,
    karbandi: { ...walls.karbandi, ...solveKarbandiWallSeating(walls.karbandi, baseBuilding, walls), autoClip: true },
  }, baseBuilding);
  const room = buildWallSystem(baseBuilding, walls);
  assert.equal(room.children.filter((child) => child.userData?.roomDomePart === 'vertical-wall-extension').length, 0);
  assert.equal(room.children.filter((child) => child.userData?.roomDomePart === 'exterior-aligned-octagon-wall').length, 0);
  assert.equal(room.children.filter((child) => child.userData?.roomDomePart === 'karbandi-roof-to-drum-infill-top').length, 0);
  assert.equal(room.userData.roomKarbandiMasonryTransition.octagonWallsVisible, false);
});

test('Room walls expose independent interior and exterior settings with one whole-wall highlight', () => {
  const building = normalizeBuilding({ type: 'room', width: 6, length: 5, wallThickness: 0.4 });
  const walls = normalizeWallSystem({
    bricks: { ...DEFAULT_WALL_SYSTEM.bricks, enabled: false },
    sideOffsets: { north: 0.2, east: 0.1, south: 0.3, west: 0.4 },
    roomExteriorOffsets: { north: 1, east: 0.7, south: 1, west: 0.9 },
  }, building);
  assert.deepEqual(walls.roomExteriorOffsets, { north: 1, east: 0.7, south: 1, west: 0.9 });
  assert.deepEqual(walls.roomWallThicknesses, { north: 0.8, east: 0.6, south: 0.7, west: 0.5 });
  const movedNorthInterior = normalizeWallSystem({
    ...walls,
    sideOffsets: { ...walls.sideOffsets, north: 0.35 },
  }, building);
  assert.equal(movedNorthInterior.roomExteriorOffsets.north, 1);
  assert.ok(Math.abs(movedNorthInterior.roomWallThicknesses.north - 0.65) < 0.000001);
  const room = buildWallSystem(building, walls);
  const expectedDepths = walls.roomWallThicknesses;
  ['north', 'east', 'south', 'west'].forEach((side) => {
    const wall = room.getObjectByName(`Room ${side} south-style wall`);
    const body = wall.children.find((child) => child.userData?.isRoomWallBody === true);
    assert.ok(body, `${side} must expose its selectable structural wall body`);
    assert.equal(body.userData.roomWallDepth, expectedDepths[side]);
    body.geometry.computeBoundingBox();
    assert.ok(Math.abs(body.geometry.boundingBox.min.z) < 0.000001);
    assert.ok(Math.abs(body.geometry.boundingBox.max.z - expectedDepths[side]) < 0.000001);
    assert.equal(body.userData.roomWallInteriorFace, 0);
    assert.equal(body.userData.roomWallExteriorFace, expectedDepths[side]);
  });

  const scene = Object.create(MehrazScene.prototype);
  scene.building = building;
  scene.walls = walls;
  scene.buildingGroup = new THREE.Group();
  scene.buildingGroup.add(room);
  scene.scene = new THREE.Scene();
  scene.wallSurfaceHighlight = null;
  scene.selectedWallSide = 'north';
  scene.selectedOpeningGuide = null;
  scene.karbandiRibArchEditing = false;
  scene.invalidate = () => {};
  const northInteriorZ = -building.depth / 2 - walls.sideOffsets.north;

  scene.selectedWallFace = 'interior';
  MehrazScene.prototype.updateWallSurfaceHighlight.call(scene);
  const interiorBounds = new THREE.Box3().setFromObject(scene.wallSurfaceHighlight);
  const northExteriorZ = -building.depth / 2 - walls.roomExteriorOffsets.north;
  assert.ok(Math.abs(interiorBounds.min.z - northExteriorZ) < 0.0001);
  assert.ok(Math.abs(interiorBounds.max.z - northInteriorZ) < 0.0001);

  scene.selectedWallFace = 'exterior';
  MehrazScene.prototype.updateWallSurfaceHighlight.call(scene);
  const exteriorBounds = new THREE.Box3().setFromObject(scene.wallSurfaceHighlight);
  assert.ok(Math.abs(exteriorBounds.min.z - northExteriorZ) < 0.0001);
  assert.ok(Math.abs(exteriorBounds.max.z - northInteriorZ) < 0.0001);
  assert.ok(interiorBounds.equals(exteriorBounds), 'clicking either surface must highlight the same complete wall');

  const finishWalls = normalizeWallSystem({
    ...walls,
    stoneBase: { ...DEFAULT_WALL_SYSTEM.stoneBase, enabled: false },
    bricks: {
      ...DEFAULT_WALL_SYSTEM.bricks,
      enabled: true,
      sideBonds: {
        ...DEFAULT_WALL_SYSTEM.bricks.sideBonds,
        north: { source: 'builtin', builtIn: 'stack' },
        north_exterior: { source: 'builtin', builtIn: 'flemish' },
        east_exterior: { source: 'builtin', builtIn: 'flemish' },
        south_exterior: { source: 'builtin', builtIn: 'flemish' },
        west_exterior: { source: 'builtin', builtIn: 'flemish' },
      },
    },
  }, building);
  const finishedRoom = buildWallSystemWithCanvasMock(building, finishWalls);
  const northWall = finishedRoom.getObjectByName('Room north south-style wall');
  const northBody = northWall.children.find((child) => child.userData?.isRoomWallBody === true);
  assert.equal(northWall.children.some((child) => child.userData?.isBrickFace === true), false,
    'Room walls must not contain separate interior or exterior bond overlays');
  assert.ok(Array.isArray(northBody.material) && northBody.material.length === 5);
  assert.equal(northBody.geometry.userData.directRoomWallFaceMaterials, true);
  assert.deepEqual(
    [...new Set(northBody.geometry.groups.map((group) => group.materialIndex))].sort(),
    [0, 1, 2, 3, 4],
    'one long structural wall must directly own its interior, exterior, reveals, and two exposed corner returns',
  );
  assert.equal(northBody.material[northBody.userData.roomWallInteriorMaterialIndex].userData.brickBondSide, 'north');
  assert.equal(northBody.material[northBody.userData.roomWallExteriorMaterialIndex].userData.brickBondSide, 'north_exterior');
  const interiorWidth = building.width + finishWalls.sideOffsets.west + finishWalls.sideOffsets.east;
  const interiorDepth = building.depth + finishWalls.sideOffsets.north + finishWalls.sideOffsets.south;
  const interiorPerimeter = (interiorWidth + interiorDepth) * 2;
  const orderedInteriorFaces = ['south', 'east', 'north', 'west'].map((side) => {
    const body = finishedRoom.getObjectByName(`Room ${side} south-style wall`).children
      .find((child) => child.userData?.isRoomWallBody === true);
    const interiorMaterial = body.material[body.userData.roomWallInteriorMaterialIndex];
    assert.ok(interiorMaterial?.map, `${side} structural wall must own its interior bond material`);
    assert.ok(Math.abs(interiorMaterial.userData.brickBondSeamlessCycleLength - interiorPerimeter) < 0.000001);
    return interiorMaterial;
  });
  const interiorIntervals = orderedInteriorFaces.map((material) => ({
    start: material.userData.brickBondPhaseU - material.userData.brickBondSurfaceWidth / 2,
    end: material.userData.brickBondPhaseU + material.userData.brickBondSurfaceWidth / 2,
  }));
  assert.ok(Math.abs(interiorIntervals[0].start) < 0.000001);
  interiorIntervals.slice(1).forEach((interval, index) => {
    assert.ok(Math.abs(interval.start - interiorIntervals[index].end) < 0.000001,
      'adjacent interior patterns must share one corner phase');
  });
  assert.ok(Math.abs(interiorIntervals.at(-1).end - interiorPerimeter) < 0.000001);
  const interiorRepeatCount = orderedInteriorFaces[0].map.repeat.x * interiorPerimeter;
  assert.ok(Math.abs(interiorRepeatCount - Math.round(interiorRepeatCount)) < 0.000001,
    'the full interior loop must close on a whole pattern repeat');
  const outerWidth = building.width + finishWalls.sideOffsets.west + finishWalls.sideOffsets.east
    + finishWalls.roomWallThicknesses.west + finishWalls.roomWallThicknesses.east;
  const outerDepth = building.depth + finishWalls.sideOffsets.north + finishWalls.sideOffsets.south
    + finishWalls.roomWallThicknesses.north + finishWalls.roomWallThicknesses.south;
  const exteriorPerimeter = (outerWidth + outerDepth) * 2;
  const orderedExteriorFaces = ['south', 'east', 'north', 'west'].map((side) => {
    const body = finishedRoom.getObjectByName(`Room ${side} south-style wall`).children
      .find((child) => child.userData?.isRoomWallBody === true);
    const exteriorMaterial = body.material[body.userData.roomWallExteriorMaterialIndex];
    assert.ok(exteriorMaterial?.map, `${side} structural wall must own its exterior bond material`);
    body.geometry.computeBoundingBox();
    assert.ok(Math.abs(exteriorMaterial.userData.brickBondSeamlessCycleLength - exteriorPerimeter) < 0.000001);
    return { body, material: exteriorMaterial };
  });
  const exteriorWidths = orderedExteriorFaces.map(({ body }) => body.geometry.boundingBox.max.x - body.geometry.boundingBox.min.x);
  assert.ok(Math.abs(exteriorWidths[0] - outerWidth) < 0.000001);
  assert.ok(Math.abs(exteriorWidths[1] - interiorDepth) < 0.000001);
  assert.ok(Math.abs(exteriorWidths[2] - outerWidth) < 0.000001);
  assert.ok(Math.abs(exteriorWidths[3] - interiorDepth) < 0.000001);
  const exteriorSegments = orderedExteriorFaces.flatMap(({ body, material }, index) => {
    const segments = [material.userData.roomWallExteriorPerimeterInterval];
    if (index === 0 || index === 2) {
      segments.push(
        body.material[body.userData.roomWallLeftEndMaterialIndex].userData.roomWallExteriorPerimeterInterval,
        body.material[body.userData.roomWallRightEndMaterialIndex].userData.roomWallExteriorPerimeterInterval,
      );
    }
    return segments;
  }).sort((left, right) => left[0] - right[0]);
  assert.equal(exteriorSegments.length, 8, 'four wall faces and four corner returns must form the exterior loop');
  assert.ok(Math.abs(exteriorSegments[0][0]) < 0.000001);
  exteriorSegments.slice(1).forEach((interval, index) => {
    assert.ok(Math.abs(interval[0] - exteriorSegments[index][1]) < 0.000001,
      'adjacent exterior wall and return patterns must share one corner phase');
  });
  assert.ok(Math.abs(exteriorSegments.at(-1)[1] - exteriorPerimeter) < 0.000001);
  const exteriorRepeatCount = orderedExteriorFaces[0].material.map.repeat.x * exteriorPerimeter;
  assert.ok(Math.abs(exteriorRepeatCount - Math.round(exteriorRepeatCount)) < 0.000001, 'the full exterior loop must close on a whole pattern repeat');

  const structuralBodies = ['north', 'east', 'south', 'west'].map((side) => {
    const body = finishedRoom.getObjectByName(`Room ${side} south-style wall`).children
      .find((child) => child.userData?.isRoomWallBody === true);
    body.updateWorldMatrix(true, false);
    return { side, body, bounds: new THREE.Box3().setFromObject(body) };
  });
  for (let first = 0; first < structuralBodies.length; first += 1) {
    for (let second = first + 1; second < structuralBodies.length; second += 1) {
      const overlap = structuralBodies[first].bounds.clone().intersect(structuralBodies[second].bounds);
      if (overlap.isEmpty()) continue;
      const overlapSize = overlap.getSize(new THREE.Vector3());
      assert.ok(overlapSize.x <= 0.000001 || overlapSize.y <= 0.000001 || overlapSize.z <= 0.000001,
        `${structuralBodies[first].side} and ${structuralBodies[second].side} walls must meet without overlapping volume`);
    }
  }
  assert.equal(structuralBodies.filter(({ body }) => body.userData.roomWallButtJointRole === 'long-wall').length, 2);
  assert.equal(structuralBodies.filter(({ body }) => body.userData.roomWallButtJointRole === 'short-wall-between-long-wall-interior-faces').length, 2);
});

test('every Room wall accepts independent South-style door and window designs', () => {
  const building = normalizeBuilding({ type: 'room', width: 6, length: 5, height: 4 });
  const roomWallOpenings = Object.fromEntries(['north', 'east', 'south', 'west'].map((side, index) => [
    side,
    {
      door: { ...DEFAULT_WALL_SYSTEM.roomWallOpenings[side].door, enabled: index % 2 === 0, head: 'arch' },
      window: {
        ...DEFAULT_WALL_SYSTEM.roomWallOpenings[side].window,
        enabled: index % 2 === 1,
        sillHeight: 1.5,
        head: 'arch',
      },
    },
  ]));
  const walls = normalizeWallSystem({
    bricks: { ...DEFAULT_WALL_SYSTEM.bricks, enabled: false },
    roomWallOpenings,
  }, building);
  const room = buildWallSystem(building, walls);
  ['north', 'east', 'south', 'west'].forEach((side, index) => {
    const wall = room.getObjectByName(`Room ${side} south-style wall`);
    assert.deepEqual(wall.userData.roomWallOpeningTypes, [index % 2 === 0 ? 'door' : 'window']);
  });

  const brickWalls = normalizeWallSystem({
    ...walls,
    stoneBase: { ...walls.stoneBase, enabled: false },
    bricks: { ...walls.bricks, enabled: true },
  }, building);
  const trimmedRoom = buildWallSystemWithCanvasMock(building, brickWalls);
  ['north', 'east', 'south', 'west'].forEach((side, index) => {
    const wall = trimmedRoom.getObjectByName(`Room ${side} south-style wall`);
    const trim = wall.children.filter((child) => child.userData?.isRoomWallOpeningSoldierCourse === true
      || child.userData?.isRoomWallOpeningArchCourse === true);
    const interior = trim.filter((child) => child.userData.wallFace === 'interior');
    const exterior = trim.filter((child) => child.userData.wallFace === 'exterior');
    assert.ok(interior.length > 0, `${side} opening must have interior soldier bricks`);
    assert.equal(exterior.length, interior.length, `${side} exterior soldier bricks must match the interior set`);
    assert.deepEqual(
      exterior.map((child) => child.userData.soldierCourseRole).sort(),
      interior.map((child) => child.userData.soldierCourseRole).sort(),
    );
    assert.ok(interior.every((child) => child.userData.openingTrimBondSide === side));
    assert.ok(exterior.every((child) => child.userData.openingTrimBondSide === `${side}_exterior`));
    assert.ok(trim.every((child) => child.material.userData.raisedBorderCoordinateSpace === 'local'),
      `${side} opening soldiers must use the same wall-local mapping before the wall rotates`);
    const archCourse = trim.find((child) => child.userData.isRoomWallOpeningArchCourse === true);
    assert.ok(archCourse, `${side} arched opening must keep its curved soldier course`);
    const shader = {
      uniforms: {},
      vertexShader: '#include <common>\n#include <defaultnormal_vertex>\n#include <worldpos_vertex>',
      fragmentShader: '#include <common>\n#include <map_fragment>',
    };
    archCourse.material.onBeforeCompile(shader);
    assert.equal(shader.uniforms.raisedBorderUsesLocalCoordinates.value, 1);
    assert.match(shader.fragmentShader, /mix\(vRaisedBrickWorldPosition, vRaisedBrickLocalPosition, raisedBorderUsesLocalCoordinates\)/);
    interior.forEach((child) => {
      child.geometry.computeBoundingBox();
      assert.ok(child.geometry.boundingBox.max.z < 0, `${side} interior trim must project inward`);
    });
    exterior.forEach((child) => {
      child.geometry.computeBoundingBox();
      assert.ok(child.geometry.boundingBox.min.z > brickWalls.roomWallThicknesses[side], `${side} exterior trim must project beyond the exterior face`);
    });
    const expectedType = index % 2 === 0 ? 'door' : 'window';
    assert.ok(trim.every((child) => child.userData.openingType === expectedType));
  });
});

test('normalized scale-0.95 Karbandi solution builds a valid roof', () => {
  const building = { type: 'iwan', width: 4, depth: 2, height: 6, wallThickness: 0.35, openingWidth: 4 };
  const karbandi = { ...DEFAULT_WALL_SYSTEM.karbandi, enabled: true, coverEnabled: true };
  karbandi.span = karbandiSpanForWallLegCenters(karbandi, building, DEFAULT_WALL_SYSTEM);
  karbandi.referenceZ = karbandiReferenceZForRibCount(karbandi, building.depth);
  karbandi.span = karbandiSpanForWallLegCenters(karbandi, building, DEFAULT_WALL_SYSTEM);
  karbandi.referenceZ = karbandiReferenceZForRibCount(karbandi, building.depth);
  karbandi.groupY = karbandiGroupYForWallTopLegCenters(karbandi, building, DEFAULT_WALL_SYSTEM);
  karbandi.groupZ = karbandiGroupZForWallLegCenters(karbandi, building, DEFAULT_WALL_SYSTEM);
  const group = buildWallSystem(building, {
    ...DEFAULT_WALL_SYSTEM,
    bricks: { ...DEFAULT_WALL_SYSTEM.bricks, enabled: false },
    ahang: { enabled: false },
    karbandi,
  });
  const panels = [];
  group.traverse((object) => {
    if (object.userData?.isKarbandiCover) panels.push(object);
  });
  assert.equal(karbandi.groupScale, 0.95);
  assert.ok(panels.length > 0);
  assert.ok(panels.every((panel) => panel.userData.webPatchInvertedTriangleCount === 0));
  const wallSupportedOverlapPanels = panels.filter((panel) => (
    panel.userData.wallSupportedRoofRibClip === 'continuous-hidden-two-sided-overlap-beneath-full-physical-rib'
  ));
  assert.ok(wallSupportedOverlapPanels.length > 0);
  assert.ok(wallSupportedOverlapPanels.every((panel) => (
    panel.userData.wallSupportedRoofRibOverlap >= karbandi.ribWidth * karbandi.groupScale * 0.5
  )));
  assert.equal(group.userData.karbandiCornerRoofExtrusions.length, 2);
  assert.ok(group.userData.karbandiBaseEdgeContactCount > 0);
});

test('portal gypsum excludes north, clears stone slabs and covers the Ahang soffit', () => {
  const building = normalizeBuilding({ width: 8, depth: 8, height: 6, wallThickness: 0.4 });
  const walls = normalizeWallSystem({
    interiorGypsum: { enabled: true, color: '#d8d2c5' },
    southOpenings: {
      door: { ...DEFAULT_WALL_SYSTEM.southOpenings.door, enabled: true, head: 'arch' },
      window: { ...DEFAULT_WALL_SYSTEM.southOpenings.window, enabled: true },
    },
  }, building);
  const root = buildWallSystemWithCanvasMock(building, walls);
  const gypsum = [];
  root.traverse((child) => {
    if (child.isMesh && child.userData?.isPortalInteriorGypsum) gypsum.push(child);
  });

  assert.ok(gypsum.length >= 4, 'east, west, south, and the Ahang cover must receive an interior finish');
  assert.ok(['east', 'west', 'south', 'arch'].every((side) => (
    gypsum.some((mesh) => mesh.userData.wallSide === side)
  )));
  assert.equal(gypsum.some((mesh) => mesh.userData.wallSide === 'north_sides' || mesh.userData.wallSide === 'north_top'), false);
  assert.ok(gypsum.some((mesh) => mesh.userData.isAhangSoffitGypsum), 'the underside of the Ahang cover must receive gypsum');
  assert.ok(gypsum.every((mesh) => mesh.material.color.getHexString() === 'd8d2c5'));
  assert.ok(gypsum.every((mesh) => mesh.material.map == null), 'gypsum must not inherit the brick texture');
  ['east', 'west', 'south'].forEach((side) => {
    const face = gypsum.find((mesh) => mesh.userData.wallSide === side);
    assert.equal(face.material.clippingPlanes.length, 1);
    assert.equal(face.material.clippingPlanes[0].constant, -walls.stoneBase.height);
  });
  const southGypsum = gypsum.find((mesh) => mesh.userData.wallSide === 'south');
  assert.equal(southGypsum.geometry.parameters.shapes.holes.length, 1, 'the enabled window must remain cut out of the gypsum');
  assert.ok(
    southGypsum.material.userData.gypsumStaticCutouts.some((cutout) => cutout.kind === 'capsule'),
    'gypsum must be clipped along curved opening soldier rings instead of showing through their joints',
  );

  const zone = {
    id: 'gypsum-cutout-zone',
    surfaceId: 'south_interior',
    bounds: { u: 0.4, v: 3, width: 2, height: 1 },
    soldierCourses: true,
  };
  const zonedRoot = buildWallSystemWithCanvasMock(building, walls, [zone]);
  const zonedSouthGypsum = zonedRoot.children.find((child) => child.userData?.isPortalInteriorGypsum && child.userData.wallSide === 'south');
  const zoneCutout = zonedSouthGypsum.material.userData.gypsumZoneCutouts[0];
  assert.ok(zoneCutout.minY < zone.bounds.v - zone.bounds.height / 2, 'zone clipping must include the bottom soldier course');
  assert.ok(zoneCutout.maxY > zone.bounds.v + zone.bounds.height / 2, 'zone clipping must include the top soldier course');
  assert.equal(zonedSouthGypsum.material.userData.gypsumCutoutUniforms.rectCount.value > 0, true);

  const brickWalls = [];
  root.traverse((child) => {
    if (child.isMesh && child.userData?.wallSide && !child.userData?.isPortalInteriorGypsum) brickWalls.push(child);
  });
  assert.ok(brickWalls.length > 0, 'the structural exterior wall material must remain present');

  const withoutGypsum = buildWallSystemWithCanvasMock(building, normalizeWallSystem({ interiorGypsum: { enabled: false } }, building));
  assert.equal(withoutGypsum.children.some((child) => child.userData?.isPortalInteriorGypsum), false);
});

test('new wall zones span their wall and optionally create two soldier courses', () => {
  const building = normalizeBuilding({ width: 8, depth: 10, height: 6, wallThickness: 0.4 });
  const walls = normalizeWallSystem({
    sideOffsets: { north: 0.3, east: 0.2, south: 0.5, west: 0.1 },
  }, building);
  const east = defaultZoneBounds('east_interior', building, walls);
  const south = defaultZoneBounds('south_interior', building, walls);
  assert.ok(Math.abs(east.width - 10.8) < 1e-9, 'east zone must span only the clear interior wall depth');
  assert.ok(Math.abs(east.u - 0.1) < 1e-9, 'east zone must use the clear interior wall center after unequal offsets');
  assert.ok(Math.abs(south.width - 8.3) < 1e-9, 'south zone must span only the clear interior wall width');
  assert.ok(Math.abs(south.u - 0.05) < 1e-9, 'south zone must use the clear interior wall center');
  const northBounds = defaultZoneBounds('north_interior', building, walls);
  const northWorld = zoneWorldTransform({ surfaceId: 'north_interior', bounds: northBounds }, building, walls);
  const eastWorld = zoneWorldTransform({ surfaceId: 'east_interior', bounds: east }, building, walls);
  const westWorld = zoneWorldTransform({ surfaceId: 'west_interior', bounds: defaultZoneBounds('west_interior', building, walls) }, building, walls);
  const southWorld = zoneWorldTransform({ surfaceId: 'south_interior', bounds: south }, building, walls);
  const southFacadeWorld = zoneWorldTransform({ surfaceId: 'south_facade', bounds: south }, building, walls);
  assert.ok(buildingSurfaces({ type: 'iwan' }).some((surface) => surface.id === 'south_interior'), 'iwan zone targets must expose the south interior face');
  assert.equal(buildingSurfaces({ type: 'iwan' }).some((surface) => surface.id === 'south_facade'), false, 'new zones must not target the hidden south exterior face');
  assert.ok(Math.abs(northWorld.position[2] - (-5.6)) < 1e-9, 'north zone must sit on the recessed front face');
  assert.deepEqual(northWorld.rotation, [0, 180, 0], 'north zone must face outward instead of toward the wall back');
  assert.ok(Math.abs(eastWorld.position[0] - 4.2) < 1e-9, 'east zone must be coplanar with the interior face');
  assert.ok(Math.abs(westWorld.position[0] - (-4.1)) < 1e-9, 'west zone must be coplanar with the interior face');
  assert.ok(Math.abs(southWorld.position[2] - 5.5) < 1e-9, 'south interior zone must be coplanar with the interior face');
  assert.ok(Math.abs(southFacadeWorld.position[2] - 5.5) < 1e-9, 'legacy south facade zones must migrate to the interior face');
  assert.deepEqual(southFacadeWorld.rotation, [0, 180, 0], 'legacy south facade zones must face into the portal');

  const bondedWalls = normalizeWallSystem({
    sideOffsets: walls.sideOffsets,
    bricks: {
      ...walls.bricks,
      sideBonds: {
        ...walls.bricks.sideBonds,
        east: { ...walls.bricks.sideBonds.east, builtIn: 'stack' },
        west: { ...walls.bricks.sideBonds.west, builtIn: 'stack' },
        south: { ...walls.bricks.sideBonds.south, builtIn: 'stack' },
        north_sides: { ...walls.bricks.sideBonds.north_sides, builtIn: 'stack' },
      },
    },
  }, building);
  const bondedEastWorld = zoneWorldTransform({ surfaceId: 'east_interior', bounds: east }, building, bondedWalls);
  const bondedWestWorld = zoneWorldTransform({ surfaceId: 'west_interior', bounds: defaultZoneBounds('west_interior', building, bondedWalls) }, building, bondedWalls);
  const bondedSouthWorld = zoneWorldTransform({ surfaceId: 'south_interior', bounds: south }, building, bondedWalls);
  const bondedNorthWorld = zoneWorldTransform({ surfaceId: 'north_interior', bounds: northBounds }, building, bondedWalls);
  assert.ok(Math.abs(bondedEastWorld.position[0] - 4.184) < 1e-9, 'east zones must sit physically above a custom wall bond');
  assert.ok(Math.abs(bondedWestWorld.position[0] - (-4.084)) < 1e-9, 'west zones must sit physically above a custom wall bond');
  assert.ok(Math.abs(bondedSouthWorld.position[2] - 5.484) < 1e-9, 'south zones must sit physically above a custom wall bond');
  assert.ok(Math.abs(bondedNorthWorld.position[2] - (northWorld.position[2] - 0.007)) < 1e-9, 'north zones must sit physically above its shallower decorative face');

  const gypsumWalls = normalizeWallSystem({
    sideOffsets: walls.sideOffsets,
    interiorGypsum: { enabled: true, color: '#f1eee7' },
  }, building);
  const gypsumEastWorld = zoneWorldTransform({ surfaceId: 'east_interior', bounds: east }, building, gypsumWalls);
  const gypsumWestWorld = zoneWorldTransform({ surfaceId: 'west_interior', bounds: defaultZoneBounds('west_interior', building, gypsumWalls) }, building, gypsumWalls);
  const gypsumSouthWorld = zoneWorldTransform({ surfaceId: 'south_interior', bounds: south }, building, gypsumWalls);
  const gypsumNorthWorld = zoneWorldTransform({ surfaceId: 'north_interior', bounds: northBounds }, building, gypsumWalls);
  assert.ok(Math.abs(gypsumEastWorld.position[0] - 4.179) < 1e-9, 'east zones must sit in front of the gypsum finish');
  assert.ok(Math.abs(gypsumWestWorld.position[0] - (-4.079)) < 1e-9, 'west zones must sit in front of the gypsum finish');
  assert.ok(Math.abs(gypsumSouthWorld.position[2] - 5.479) < 1e-9, 'south zones must sit in front of the gypsum finish');
  assert.ok(Math.abs(gypsumNorthWorld.position[2] - northWorld.position[2]) < 1e-9, 'north zones must not receive the excluded gypsum offset');

  const zone = {
    id: 'zone-soldiers',
    surfaceId: 'east_interior',
    bounds: east,
    soldierCourses: true,
  };
  const courses = zoneSoldierCourses(zone, zoneWorldTransform(zone, building, walls), walls);
  const courseBands = courses.children.filter((child) => child.userData.isZoneSoldierCourse);
  assert.equal(courses.userData.zoneSoldierCourseRows, 2);
  assert.equal(courseBands.length, 2, 'top and bottom must use two integrated masonry bands');
  assert.equal(courses.userData.surfaceId, 'east_interior');
  assert.equal(courses.userData.zoneSoldierCourseAxis, 'z', 'east/west soldier joints must follow the wall depth axis');
  assert.ok(courseBands.every((band) => band.material.userData.raisedBorderOrientation === 'horizontal'));
  assert.ok(courseBands.every((band) => band.material.userData.raisedBorderCourseAxis === 'z'));
  assert.equal(courses.children.some((child) => child.userData.isZoneSoldierMortar), false, 'the course must not use a solid mortar backing slab');
  assert.ok(courseBands.every((band) => Math.abs(band.position.y) > east.height / 2), 'soldier courses must remain outside the zone area');
  const southCourses = zoneSoldierCourses(
    { ...zone, surfaceId: 'south_interior', bounds: south },
    southWorld,
    walls,
  );
  assert.equal(southCourses.userData.zoneSoldierCourseAxis, 'x', 'north/south soldier joints must follow the wall width axis');
  assert.equal(zoneSoldierCourses({ ...zone, soldierCourses: false }, zoneWorldTransform(zone, building, walls), walls), null);
  assert.equal(zoneSoldierCourses(zone, zoneWorldTransform(zone, building, walls), { ...walls, bricks: { ...walls.bricks, enabled: false } }), null);
  courses.traverse((child) => {
    child.geometry?.dispose?.();
    child.material?.dispose?.();
  });
});

test('wall zones disappear when the camera moves behind the south wall', () => {
  const scene = Object.create(MehrazScene.prototype);
  scene.building = normalizeBuilding({ depth: 10 });
  scene.walls = normalizeWallSystem({ sideOffsets: { south: 0.5 } }, scene.building);
  scene.zoneGroup = new THREE.Group();
  scene.zoneDecorationGroup = new THREE.Group();
  scene.zones = [{ id: 'wall-zone', surfaceId: 'east_interior' }, { id: 'floor-zone', surfaceId: 'floor' }];
  scene.selectedZoneId = 'wall-zone';
  scene.selectionOutline = new THREE.Group();
  [scene.zoneGroup, scene.zoneDecorationGroup].forEach((group) => {
    scene.zones.forEach((zone) => {
      const root = new THREE.Group();
      root.userData.surfaceId = zone.surfaceId;
      group.add(root);
    });
  });

  const rearCamera = new THREE.PerspectiveCamera();
  rearCamera.position.z = 6;
  assert.equal(scene.updateZonePortalSideVisibility(rearCamera), false);
  assert.equal(scene.zoneGroup.children[0].visible, false, 'east/west/south wall zones must not leak through rear openings');
  assert.equal(scene.zoneDecorationGroup.children[0].visible, false);
  assert.equal(scene.zoneGroup.children[1].visible, true, 'floor zones are not wall-face decorations');
  assert.equal(scene.selectionOutline.visible, false, 'a selected hidden wall zone must not leave an outline behind');

  const frontCamera = new THREE.PerspectiveCamera();
  frontCamera.position.z = -8;
  assert.equal(scene.updateZonePortalSideVisibility(frontCamera), true);
  assert.equal(scene.zoneGroup.children[0].visible, true);
  assert.equal(scene.zoneDecorationGroup.children[0].visible, true);
  assert.equal(scene.selectionOutline.visible, true);

  const eastRearCamera = new THREE.PerspectiveCamera();
  eastRearCamera.position.set(5, 2, 0);
  assert.equal(scene.updateZonePortalSideVisibility(eastRearCamera), false, 'zones must not leak through the back of the east wall');
  assert.equal(scene.zoneDecorationGroup.children[0].visible, false);

  const westRearCamera = new THREE.PerspectiveCamera();
  westRearCamera.position.set(-5, 2, 0);
  assert.equal(scene.updateZonePortalSideVisibility(westRearCamera), false, 'zones must not leak through the back of the west wall');
  assert.equal(scene.zoneDecorationGroup.children[0].visible, false);

  const frontIsometricCamera = new THREE.PerspectiveCamera();
  frontIsometricCamera.position.set(8, 6, -8);
  assert.equal(scene.updateZonePortalSideVisibility(frontIsometricCamera), true, 'front isometric views must retain interior wall zones');
});

test('wall zone height and vertical movement stay aligned to brick courses', () => {
  const walls = normalizeWallSystem({
    bricks: { ...DEFAULT_WALL_SYSTEM.bricks, brickHeight: 0.08, mortar: 0.01 },
  });
  const step = zoneBrickHeightStep(walls);
  const initial = { u: 0, v: 3, width: 4, height: 2.96 };
  const resized = resizeZoneHeightByBrick(initial, 3.03, walls);
  assert.equal(resized.height, 3.04, 'height must round to a whole number of brick courses');
  assert.equal(resized.v, 3.04, 'resizing must preserve the snapped lower bed joint');
  assert.ok(Math.abs((resized.v - resized.height / 2) / step - Math.round((resized.v - resized.height / 2) / step)) < 1e-9);
  assert.ok(Math.abs((resized.v + resized.height / 2) / step - Math.round((resized.v + resized.height / 2) / step)) < 1e-9);

  const moved = moveZoneVerticallyByBrick(resized, resized.v + step, walls);
  assert.equal(moved.v, 3.12, 'one number-field step must move one complete brick course');
  assert.equal(moved.height, resized.height);
  assert.ok(Math.abs((moved.v - moved.height / 2) / step - Math.round((moved.v - moved.height / 2) / step)) < 1e-9);
});

test('each zone controls its pattern scale and position independently', () => {
  const transformed = zonePatternMapTransform({
    patternScale: 2,
    patternOffsetU: 0.5,
    patternOffsetV: -0.25,
  }, { width: 4, height: 2 }, 1, 0.5);
  assert.deepEqual(transformed.repeat, [2, 2], 'doubling pattern scale must halve the tile repetition');
  assert.deepEqual(transformed.offset, [0.25, -0.25], 'metre offsets must be converted using the scaled tile size');
  assert.equal(transformed.tileWidth, 2);
  assert.equal(transformed.tileHeight, 1);

  const defaults = zonePatternMapTransform({}, { width: 4, height: 2 }, 1, 0.5);
  assert.equal(defaults.userScale, 1, 'legacy zones must preserve the current pattern scale');
  assert.deepEqual(defaults.offset, [0, 0], 'legacy zones must keep their existing pattern origin');
});

test('rib count and fold angle snap reference Z to touching paired leg bases', () => {
  [6, 8, 16, 20].forEach((ribCount) => {
    const settings = {
      ...DEFAULT_WALL_SYSTEM.karbandi,
      ribCount,
      span: 4.1,
      referenceAngle: 160,
    };
    const referenceZ = karbandiReferenceZForRibCount(settings, 30);
    const halfLeg = settings.span / 2;
    const halfFold = THREE.MathUtils.degToRad((180 - settings.referenceAngle) / 2);
    const foldedX = Math.cos(halfFold) * halfLeg;
    const foldedZ = Math.sin(halfFold) * halfLeg + referenceZ;
    const angle = Math.PI * 2 / ribCount;
    const rotatedOpposite = new THREE.Vector3(-foldedX, 0, foldedZ)
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
    const referenceLegBase = new THREE.Vector3(foldedX, 0, foldedZ);
    assert.ok(Math.abs(referenceLegBase.distanceTo(rotatedOpposite) - settings.ribDepth / 2) < 0.000002);
  });
  assert.notEqual(
    karbandiReferenceZForRibCount({ ...DEFAULT_WALL_SYSTEM.karbandi, ribCount: 8 }),
    karbandiReferenceZForRibCount({ ...DEFAULT_WALL_SYSTEM.karbandi, ribCount: 12 }),
  );
  const flatReferenceZ = karbandiReferenceZForRibCount({
    ...DEFAULT_WALL_SYSTEM.karbandi,
    referenceAngle: 180,
  }, 8);
  const foldedReferenceZ = karbandiReferenceZForRibCount({
    ...DEFAULT_WALL_SYSTEM.karbandi,
    referenceAngle: 179,
  }, 8);
  assert.ok(Math.abs(flatReferenceZ - foldedReferenceZ) < 0.05,
    'changing 180 to 179 degrees must stay on the same overlap root instead of jumping to a separated leg pairing');

  const twentyRibs = { ...DEFAULT_WALL_SYSTEM.karbandi, ribCount: 20, span: 4.1, referenceAngle: 180 };
  const limitedZ = karbandiReferenceZForRibCount(twentyRibs, 8);
  const legBase = new THREE.Vector3(twentyRibs.span / 2, 0, limitedZ);
  const oppositeLegBase = new THREE.Vector3(-twentyRibs.span / 2, 0, limitedZ);
  const matchingCopy = Array.from({ length: twentyRibs.ribCount - 1 }, (_, index) => index + 1)
    .find((copyIndex) => Math.abs(legBase.distanceTo(
      oppositeLegBase.clone().applyAxisAngle(
        new THREE.Vector3(0, 1, 0),
        Math.PI * 2 * copyIndex / twentyRibs.ribCount,
      ),
    ) - twentyRibs.ribDepth / 2) < 0.000002);
  assert.ok(matchingCopy != null, '20 ribs must use the first center-to-edge contact that fits inside an 8 m depth');
});

test('reference rib Z remains strictly inside the building depth', () => {
  const shallowDepth = 2;
  [4, 8, 16, 32, 64].forEach((ribCount) => {
    const referenceZ = karbandiReferenceZForRibCount({
      ...DEFAULT_WALL_SYSTEM.karbandi,
      ribCount,
      referenceZ: 100,
    }, shallowDepth);
    assert.ok(referenceZ > 0);
    assert.ok(referenceZ < shallowDepth);
  });
  const normalizedLow = normalizeWallSystem({
    karbandi: { ...DEFAULT_WALL_SYSTEM.karbandi, referenceZ: -4 },
  }, { depth: shallowDepth });
  const normalizedHigh = normalizeWallSystem({
    karbandi: { ...DEFAULT_WALL_SYSTEM.karbandi, referenceZ: 12 },
  }, { depth: shallowDepth });
  const currentSolutions = karbandiReferenceZSolutions(DEFAULT_WALL_SYSTEM.karbandi, shallowDepth);
  assert.ok(currentSolutions.includes(normalizedLow.karbandi.referenceZ));
  assert.ok(currentSolutions.includes(normalizedHigh.karbandi.referenceZ));
});

test('reference Z overlap solutions are unique, ordered, and depth limited for spinner navigation', () => {
  const depth = 8;
  const settings = { ...DEFAULT_WALL_SYSTEM.karbandi, ribCount: 20, span: 4.1, referenceAngle: 180 };
  const solutions = karbandiReferenceZSolutions(settings, depth);
  assert.ok(solutions.length > 2);
  assert.deepEqual(solutions, [...solutions].sort((left, right) => left - right));
  assert.equal(new Set(solutions).size, solutions.length);
  assert.ok(solutions.every((solution) => solution > 0 && solution < depth));
  assert.ok(solutions.some((solution) => solution < 0.701));
  assert.ok(solutions.some((solution) => solution > 0.701));
});

test('Karbandi design changes reseat wall-leg centerlines by solving whole-assembly Move Z', () => {
  const building = { type: 'iwan', width: 4, depth: 2, height: 6, wallThickness: 0.35, openingWidth: 4 };
  [
    {},
    { ribCount: 12 },
    { referenceAngle: 179 },
    { referenceAngle: 150 },
    { groupRotationY: 12 },
    { groupScale: 1.1 },
  ].forEach((patch) => {
    const karbandi = { ...DEFAULT_WALL_SYSTEM.karbandi, ...patch, enabled: true };
    karbandi.referenceZ = karbandiReferenceZForRibCount(karbandi, building.depth);
    const solvedZ = karbandiGroupZForWallLegCenters(karbandi, building, DEFAULT_WALL_SYSTEM);
    assert.ok(Number.isFinite(solvedZ));
    assert.ok(Math.abs(solvedZ - karbandi.groupZ) < 1, 'solver must select the nearest valid seating solution');
    const group = buildWallSystem(building, {
      ...DEFAULT_WALL_SYSTEM,
      bricks: { ...DEFAULT_WALL_SYSTEM.bricks, enabled: false },
      ahang: { enabled: false },
      karbandi: { ...karbandi, groupZ: solvedZ },
    });
    const southLegs = group.userData.karbandiClosestWallLegs.filter((leg) => leg.wall === 'south');
    assert.ok(southLegs.length > 0);
    assert.ok(southLegs.every((leg) => leg.distance < 0.000001), 'south wall leg centers must land on its interior face');
  });
});

test('angle, rib count, and Rib Z edits reproduce one fresh wall-support and autoclip solution', () => {
  const building = { type: 'iwan', width: 4, depth: 2, height: 6, wallThickness: 0.35, openingWidth: 4 };
  const walls = {
    ...DEFAULT_WALL_SYSTEM,
    bricks: { ...DEFAULT_WALL_SYSTEM.bricks, enabled: false },
    ahang: { enabled: false },
  };
  const initial = solveKarbandiWallSeating({
    ...DEFAULT_WALL_SYSTEM.karbandi,
    enabled: true,
    referenceAngle: 180,
  }, building, walls);
  const angleThenCount = solveKarbandiWallSeating(
    { ...solveKarbandiWallSeating({ ...initial, referenceAngle: 150 }, building, walls), ribCount: 12 },
    building,
    walls,
  );
  const countThenAngle = solveKarbandiWallSeating(
    { ...solveKarbandiWallSeating({ ...initial, ribCount: 12 }, building, walls), referenceAngle: 150 },
    building,
    walls,
  );
  const fresh = solveKarbandiWallSeating({
    ...DEFAULT_WALL_SYSTEM.karbandi,
    enabled: true,
    ribCount: 12,
    referenceAngle: 150,
  }, building, walls);
  const build = (karbandi) => buildWallSystem(building, { ...walls, karbandi });
  const cutSignature = (group) => [
    ...group.userData.karbandiRedundantWallLegCuts,
    ...group.userData.karbandiAutomaticHangingClipIntervals,
  ].map(({ ribIndex, side, supportRibIndex, originalIndex, start, end }) => ({
    ribIndex,
    side,
    supportRibIndex,
    position: Math.round((originalIndex ?? (side === 'left' ? end : start)) * 1e6) / 1e6,
  })).sort((left, right) => left.ribIndex - right.ribIndex || left.side.localeCompare(right.side));
  const freshGroup = build(fresh);
  const assertMatchesFresh = (candidate, label, expected = fresh, expectedGroup = freshGroup) => {
    ['span', 'referenceZ', 'groupY', 'groupZ'].forEach((key) => {
      assert.ok(Math.abs(candidate[key] - expected[key]) < 0.000000001, `${key} must not depend on the ${label} edit path`);
    });
    const candidateGroup = build(candidate);
    assert.deepEqual(candidateGroup.userData.karbandiWallSupportedRibIndexes, expectedGroup.userData.karbandiWallSupportedRibIndexes);
    assert.deepEqual(candidateGroup.userData.karbandiWallSupportedLegKeys, expectedGroup.userData.karbandiWallSupportedLegKeys);
    assert.deepEqual(cutSignature(candidateGroup), cutSignature(expectedGroup));
  };
  assertMatchesFresh(angleThenCount, 'angle then count');
  assertMatchesFresh(countThenAngle, 'count then angle');

  const explicitZ = karbandiReferenceZSolutions(fresh, building.depth).at(-1);
  assert.ok(Number.isFinite(explicitZ));
  const changedZ = solveKarbandiWallSeating(
    { ...angleThenCount, referenceZ: explicitZ },
    building,
    walls,
    { preserveReferenceZ: true },
  );
  const freshZ = solveKarbandiWallSeating(
    { ...DEFAULT_WALL_SYSTEM.karbandi, enabled: true, ribCount: 12, referenceAngle: 150, referenceZ: explicitZ },
    building,
    walls,
    { preserveReferenceZ: true },
  );
  assert.equal(changedZ.referenceZ, explicitZ, 'an explicit Rib Z selection must not be replaced by the automatic overlap Z');
  assertMatchesFresh(changedZ, 'Rib Z', freshZ, build(freshZ));
});

test('Karbandi design solutions resize the reference rib span to the interior wall faces', () => {
  const building = { type: 'iwan', width: 4, depth: 2, height: 6, wallThickness: 0.35, openingWidth: 4 };
  [
    { patch: {}, expectedSpan: 4 / DEFAULT_WALL_SYSTEM.karbandi.groupScale },
    {
      patch: { referenceAngle: 150 },
      expectedSpan: 4 / (DEFAULT_WALL_SYSTEM.karbandi.groupScale * Math.cos(THREE.MathUtils.degToRad(15))),
    },
    { patch: { groupScale: 1.1 }, expectedSpan: 4 / 1.1 },
  ].forEach(({ patch, expectedSpan }) => {
    const karbandi = { ...DEFAULT_WALL_SYSTEM.karbandi, ...patch, enabled: true };
    karbandi.span = karbandiSpanForWallLegCenters(karbandi, building, DEFAULT_WALL_SYSTEM);
    karbandi.referenceZ = karbandiReferenceZForRibCount(karbandi, building.depth);
    karbandi.span = karbandiSpanForWallLegCenters(karbandi, building, DEFAULT_WALL_SYSTEM);
    karbandi.referenceZ = karbandiReferenceZForRibCount(karbandi, building.depth);
    karbandi.groupY = karbandiGroupYForWallTopLegCenters(karbandi, building, DEFAULT_WALL_SYSTEM);
    karbandi.groupZ = karbandiGroupZForWallLegCenters(karbandi, building, DEFAULT_WALL_SYSTEM);
    assert.ok(Math.abs(karbandi.span - expectedSpan) < 0.000001);
    const group = buildWallSystem(building, {
      ...DEFAULT_WALL_SYSTEM,
      bricks: { ...DEFAULT_WALL_SYSTEM.bricks, enabled: false },
      ahang: { enabled: false },
      karbandi,
    });
    const referenceLegs = group.userData.karbandiClosestWallLegs.filter((leg) => leg.ribIndex === 0);
    assert.ok(referenceLegs.some((leg) => leg.side === 'left' && leg.distance < 0.000001));
    assert.ok(referenceLegs.some((leg) => leg.side === 'right' && leg.distance < 0.000001));
  });
});

test('Karbandi solutions keep paired rib leg bands touching exactly at wall-top level', () => {
  const building = { type: 'iwan', width: 4, depth: 2, height: 6, wallThickness: 0.35, openingWidth: 4 };
  [
    {},
    { ribCount: 10 },
    { referenceAngle: 179 },
    { referenceAngle: 150 },
    { groupRotationY: 12 },
    { groupScale: 1.1 },
    { springHeightOffset: 0.4 },
  ].forEach((patch) => {
    const karbandi = { ...DEFAULT_WALL_SYSTEM.karbandi, ...patch, enabled: true };
    karbandi.span = karbandiSpanForWallLegCenters(karbandi, building, DEFAULT_WALL_SYSTEM);
    karbandi.referenceZ = karbandiReferenceZForRibCount(karbandi, building.depth);
    karbandi.span = karbandiSpanForWallLegCenters(karbandi, building, DEFAULT_WALL_SYSTEM);
    karbandi.referenceZ = karbandiReferenceZForRibCount(karbandi, building.depth);
    karbandi.groupY = karbandiGroupYForWallTopLegCenters(karbandi, building, DEFAULT_WALL_SYSTEM);
    karbandi.groupZ = karbandiGroupZForWallLegCenters(karbandi, building, DEFAULT_WALL_SYSTEM);
    const group = buildWallSystem(building, {
      ...DEFAULT_WALL_SYSTEM,
      bricks: { ...DEFAULT_WALL_SYSTEM.bricks, enabled: false },
      ahang: { enabled: false },
      karbandi,
    });
    assert.equal(group.userData.karbandiLegBasesOnWallTop, true);
    assert.ok(Math.abs(group.userData.karbandiTransformedLegBaseY - group.userData.karbandiWallTopY) < 0.000001);
    assert.equal(group.userData.karbandiReferenceBaseCentersCollide, false);
    assert.equal(group.userData.karbandiReferenceBaseCenterTouchesEdge, true);
    assert.ok(Math.abs(
      group.userData.karbandiReferenceBaseCenterCollisionDistance
        - karbandi.ribDepth * karbandi.groupScale / 2
    ) < 0.000005);
    assert.equal(group.userData.karbandiRibBaseOverlapRule, 'solve-center-to-supporting-base-edge-on-wall-top');
    assert.equal(group.userData.karbandiBaseButtJointCount, 0);
    assert.ok(group.userData.karbandiBaseEdgeContactCount > 0);
    assert.ok(group.userData.karbandiBaseEdgeContacts.every((contact) => (
      Math.abs(contact.contactY - building.height) < 0.000001
        && Math.abs(contact.centerDistance - contact.edgeOffset) < 0.000005
    )));
  });
  assert.ok(Math.abs(karbandiGroupYForWallTopLegCenters(
    { ...DEFAULT_WALL_SYSTEM.karbandi, groupScale: 0.95 },
    building,
    DEFAULT_WALL_SYSTEM,
  ) - 0.3) < 0.000001);
});

test('wall context editing resolves the exact Girih wall section and source app', () => {
  const sideBonds = {
    north: { source: 'library', assetId: 'brick-general', assetVersionId: 'brick-v1', assetType: 'brick_bond', name: 'General brick' },
    north_top: {
      source: 'library',
      assetId: 'girih-top',
      assetVersionId: 'girih-v3',
      assetType: null,
      name: 'Portal Girih',
      payload: { kind: 'girih-model', mehrazFlatPattern: { pieces: [] } },
    },
    arch: { source: 'library', assetId: 'girih-arch', assetVersionId: 'girih-v2', assetType: 'girih_pattern', name: 'Arch Girih' },
  };

  assert.deepEqual(wallContextLibraryAsset(sideBonds, 'north_top'), {
    assetId: 'girih-top',
    versionId: 'girih-v3',
    assetType: 'girih_pattern',
    name: 'Portal Girih',
  });
  assert.equal(wallContextLibraryAsset(sideBonds, 'south_arch').assetId, 'girih-arch');
});

test('stone base uses full-height vertical slabs and clips decorative patterns at its top', () => {
  const walls = normalizeWallSystem({ stoneBase: { enabled: true, height: 1.25, slabWidth: 0.72, color: '#667788', mortar: 0.025, mortarColor: '#223344' } });
  const structural = configureStoneBaseMaterial(new THREE.MeshStandardMaterial({ color: '#ffffff' }), walls);
  assert.equal(structural.userData.stoneBaseHeight, 1.25);
  assert.equal(structural.userData.stoneBaseSlabWidth, 0.72);
  assert.equal(structural.userData.stoneBaseColor, '#667788');
  assert.equal(structural.userData.stoneBaseMortar, 0.025);
  assert.equal(structural.userData.stoneBaseMortarColor, '#223344');
  const shader = {
    uniforms: {},
    vertexShader: '#include <common>\n#include <defaultnormal_vertex>\n#include <worldpos_vertex>',
    fragmentShader: '#include <common>\n#include <roughnessmap_fragment>',
  };
  structural.onBeforeCompile(shader);
  assert.match(shader.fragmentShader, /vStoneBaseWorldPosition\.y <= stoneBaseHeight/);
  assert.match(shader.fragmentShader, /slabWidth = stoneBaseSlabWidth/);
  assert.match(shader.fragmentShader, /jointHalf = stoneBaseMortar \* 0\.5/);
  assert.doesNotMatch(shader.fragmentShader, /blockHeight|blockY|horizontalJoint/);
  assert.match(shader.fragmentShader, /stoneBaseMortarColor/);

  const pattern = configureStoneBaseMaterial(new THREE.MeshStandardMaterial(), walls, { clipPattern: true });
  assert.equal(pattern.userData.stoneBasePatternClipHeight, 1.25);
  assert.equal(pattern.clippingPlanes.length, 1);
  assert.ok(pattern.clippingPlanes[0].distanceToPoint(new THREE.Vector3(0, 1.24, 0)) < 0);
  assert.ok(pattern.clippingPlanes[0].distanceToPoint(new THREE.Vector3(0, 1.26, 0)) > 0);
});

test('north stone base stays flush when the north wall field is sunken', () => {
  const building = normalizeBuilding({ width: 8, wallThickness: 0.5, openingWidth: 4 });
  const walls = normalizeWallSystem({
    northBoundary: { enabled: true, depth: 0.2, inset: 0.2 },
    stoneBase: { enabled: true, height: 1.1 },
    bricks: { ...DEFAULT_WALL_SYSTEM.bricks, enabled: false },
  }, building);
  const root = buildWallSystem(building, walls);
  const basePanels = [];
  const raisedRings = [];
  root.traverse((child) => {
    if (child.userData?.isNorthFlushStoneBase) basePanels.push(child);
    if (child.userData?.isNorthRaisedRing) raisedRings.push(child);
  });

  assert.equal(basePanels.length, 2, 'both sides of the north portal need a flush stone skirt');
  basePanels.forEach((panel) => {
    panel.geometry.computeBoundingBox();
    assert.ok(Math.abs(panel.geometry.boundingBox.min.z - (-building.depth / 2 - building.wallThickness)) < 1e-6);
    assert.ok(Math.abs(panel.geometry.boundingBox.max.z - (-building.depth / 2 - building.wallThickness + walls.northBoundary.depth)) < 1e-6);
    assert.ok(Math.abs(panel.geometry.boundingBox.max.y - walls.stoneBase.height) < 1e-6);
  });
  assert.ok(raisedRings.every((panel) => {
    panel.geometry.computeBoundingBox();
    return panel.geometry.boundingBox.min.y >= walls.stoneBase.height - 1e-6;
  }), 'the sunken boundary must start above the flush stone skirt');
  const soldierCourse = raisedRings.find((panel) => {
    panel.geometry.computeBoundingBox();
    return panel.material.userData.isSoldierBoundaryCourse
      && Math.abs(panel.geometry.boundingBox.min.y - walls.stoneBase.height) < 1e-6;
  });
  assert.ok(soldierCourse, 'a soldier boundary course must sit directly above the stone skirt');
  assert.ok(Math.abs(soldierCourse.material.userData.raisedStraightBottomY - (walls.stoneBase.height + walls.northBoundary.inset)) < 1e-6);
});

test('door and window arch heads normalize independent four-centre construction controls', () => {
  const walls = normalizeWallSystem({
    southOpenings: {
      door: {
        enabled: true,
        width: 2,
        height: 2.2,
        head: 'arch',
        arch: { redOffset: 0.15, redRadius: 1.25, greenOffset: 0.8, greenHeightOffset: -0.65 },
      },
      window: {
        enabled: true,
        width: 1.2,
        height: 1,
        sillHeight: 1.4,
        head: 'arch',
        arch: { redOffset: -0.1, redRadius: 0.8, greenOffset: 0.55, greenHeightOffset: -0.4 },
      },
    },
  });

  assert.equal(walls.southOpenings.door.head, 'arch');
  assert.equal(walls.southOpenings.door.arch.redOffset, 0.15);
  assert.ok(Math.abs(walls.southOpenings.door.arch.greenHeight - 1.55) < 1e-9);
  assert.equal(walls.southOpenings.window.head, 'arch');
  assert.equal(walls.southOpenings.window.arch.redOffset, -0.1);
  assert.ok(Math.abs(walls.southOpenings.window.arch.greenHeight - 2) < 1e-9);
});

test('north, door, and window green construction points accept negative heights', () => {
  const building = normalizeBuilding({ height: 6 });
  const walls = normalizeWallSystem({
    pointedArch: { greenHeight: -3 },
    southOpenings: {
      door: { height: 2, arch: { greenHeightOffset: -5 } },
      window: { height: 1, sillHeight: 1.5, arch: { greenHeightOffset: -4 } },
    },
  }, building);

  assert.equal(walls.pointedArch.greenHeight, -3);
  assert.equal(walls.southOpenings.door.arch.greenHeight, -3);
  assert.equal(walls.southOpenings.window.arch.greenHeight, -1.5);
});

test('arched door cuts the wall above the horizontal lintel while preserving its spring line', () => {
  const building = normalizeBuilding({ width: 8, depth: 8, height: 6, wallThickness: 0.4 });
  const archWalls = normalizeWallSystem({
    southOpenings: {
      door: { enabled: true, width: 2, height: 2.2, head: 'arch' },
      window: { enabled: false },
    },
    bricks: { ...DEFAULT_WALL_SYSTEM.bricks, enabled: false },
  }, building);
  const lintelWalls = normalizeWallSystem({
    ...archWalls,
    southOpenings: { ...archWalls.southOpenings, door: { ...archWalls.southOpenings.door, head: 'lintel' } },
  }, building);
  const profile = southOpeningProfile(archWalls.southOpenings.door, 0, building.width, building.height, 0);

  assert.equal(profile.head, 'arch');
  assert.ok(profile.archPoints.length > 20);
  assert.ok(Math.abs(profile.archPoints[0].y - profile.springTop) < 1e-6);
  assert.ok(Math.abs(profile.archPoints.at(-1).y - profile.springTop) < 1e-6);
  assert.ok(profile.top > profile.springTop);

  const intersectsSouthWallAt = (walls, y) => {
    const root = buildWallSystem(building, walls);
    root.updateMatrixWorld(true);
    const southWall = root.children.find((child) => child.isMesh && child.userData.wallSide === 'south');
    southWall.material.side = THREE.DoubleSide;
    const ray = new THREE.Raycaster(
      new THREE.Vector3(0, y, building.depth / 2 - 1),
      new THREE.Vector3(0, 0, 1),
    );
    return ray.intersectObject(southWall, false).length > 0;
  };
  const pointInsideArchHead = (profile.springTop + profile.top) / 2;
  assert.equal(intersectsSouthWallAt(lintelWalls, pointInsideArchHead), true, 'lintel wall remains solid above the opening');
  assert.equal(intersectsSouthWallAt(archWalls, pointInsideArchHead), false, 'arched wall is cut through to the curved head');
});

test('Portal doors and windows cut through the vertical wall beneath the Ahang arch', () => {
  const building = normalizeBuilding({ type: 'iwan', width: 8, depth: 8, height: 6, wallThickness: 0.4 });
  const walls = normalizeWallSystem({
    southOpenings: {
      door: { enabled: true, width: 1, height: 6.8, position: -1.8, head: 'lintel' },
      window: { enabled: true, width: 1, height: 0.7, sillHeight: 6.2, position: 1.8, head: 'arch' },
    },
    bricks: { ...DEFAULT_WALL_SYSTEM.bricks, enabled: false },
  }, building);
  const root = buildWallSystem(building, walls);
  root.updateMatrixWorld(true);
  const archWall = root.children.find((child) => child.isMesh && child.userData.wallSide === 'south_arch');
  assert.ok(archWall, 'Ahang must build the vertical wall beneath its outer arch');
  archWall.material.side = THREE.DoubleSide;

  const intersectsArchWallAt = (x, y) => new THREE.Raycaster(
    new THREE.Vector3(x, y, building.depth / 2 - 1),
    new THREE.Vector3(0, 0, 1),
  ).intersectObject(archWall, false).length > 0;

  assert.equal(intersectsArchWallAt(-1.8, 6.4), false, 'a tall door must continue cutting above the lower wall');
  assert.equal(intersectsArchWallAt(1.8, 6.5), false, 'a high window must cut the arch vertical wall');
  const windowProfile = southOpeningProfile(walls.southOpenings.window, 0, building.width, 20, 6.2);
  assert.equal(
    intersectsArchWallAt(1.8, (windowProfile.springTop + windowProfile.top) / 2),
    false,
    'the high window arch head must also cut the arch vertical wall',
  );
  assert.equal(intersectsArchWallAt(0, 6.5), true, 'masonry between the two openings must remain');
});

test('door and window soldier lintels are supported raised masonry bands with mortar joints', () => {
  const building = normalizeBuilding({ width: 8, depth: 8, height: 6, wallThickness: 0.4 });
  const walls = normalizeWallSystem({
    southOpenings: {
      door: { enabled: true, width: 2, height: 2.2, head: 'lintel' },
      window: { enabled: true, width: 1.2, height: 1, sillHeight: 1.4, head: 'lintel' },
    },
  }, building);
  const root = buildWallSystemWithCanvasMock(building, walls);
  const lintels = [];
  let windowSill = null;
  const jambsByOpening = { door: [], window: [] };
  root.traverse((child) => {
    if (child.userData?.isSouthOpeningSoldierCourse && child.userData.soldierCourseRole === 'lintel') lintels.push(child);
    if (child.userData?.isSouthOpeningSoldierCourse && child.userData.soldierCourseRole === 'sill') windowSill = child;
    if (child.userData?.soldierCourseRole === 'jamb') jambsByOpening[child.userData.openingType]?.push(child);
  });

  assert.equal(lintels.length, 2);
  assert.ok(windowSill, 'the window sill must use the same raised soldier masonry as its lintel');
  assert.equal(windowSill.material.userData.raisedBorderOrientation, 'horizontal');
  assert.ok(windowSill.userData.soldierBearing >= walls.bricks.brickHeight);
  lintels.forEach((lintel) => {
    lintel.geometry.computeBoundingBox();
    const width = lintel.geometry.boundingBox.max.x - lintel.geometry.boundingBox.min.x;
    const jambs = jambsByOpening[lintel.userData.openingType];
    jambs.forEach((jamb) => jamb.geometry.computeBoundingBox());
    const jambMinX = Math.min(...jambs.map((jamb) => jamb.geometry.boundingBox.min.x));
    const jambMaxX = Math.max(...jambs.map((jamb) => jamb.geometry.boundingBox.max.x));
    assert.ok(Math.abs(width - (lintel.userData.openingWidth + lintel.userData.soldierBearing * 2)) < 0.000001);
    assert.ok(lintel.geometry.boundingBox.min.x <= jambMinX + 0.000001, `${lintel.userData.openingType} lintel must finish behind the left jamb`);
    assert.ok(lintel.geometry.boundingBox.max.x >= jambMaxX - 0.000001, `${lintel.userData.openingType} lintel must finish behind the right jamb`);
    assert.ok(lintel.userData.soldierBearing >= walls.bricks.brickHeight);
    assert.equal(lintel.material.userData.raisedBorderOrientation, 'horizontal');
    const shader = {
      uniforms: {},
      vertexShader: '#include <common>\n#include <defaultnormal_vertex>\n#include <worldpos_vertex>',
      fragmentShader: '#include <common>\n#include <map_fragment>\n#include <roughnessmap_fragment>',
    };
    lintel.material.onBeforeCompile(shader);
    assert.equal(shader.uniforms.raisedBrickMortarColor.value.getHexString(), walls.bricks.mortarColor.slice(1));
    assert.equal(shader.uniforms.raisedBorderIsSoldier.value, 1);
    assert.match(shader.fragmentShader, /raisedBorderIsSoldier > 0\.5/);
  });
  windowSill.geometry.computeBoundingBox();
  jambsByOpening.window.forEach((jamb) => jamb.geometry.computeBoundingBox());
  assert.ok(windowSill.geometry.boundingBox.min.x <= Math.min(...jambsByOpening.window.map((jamb) => jamb.geometry.boundingBox.min.x)) + 0.000001);
  assert.ok(windowSill.geometry.boundingBox.max.x >= Math.max(...jambsByOpening.window.map((jamb) => jamb.geometry.boundingBox.max.x)) - 0.000001);
});

test('arched door and window heads use continuous mortared soldier rings', () => {
  const building = normalizeBuilding({ width: 8, depth: 8, height: 6, wallThickness: 0.4 });
  const walls = normalizeWallSystem({
    southOpenings: {
      door: { enabled: true, width: 2, height: 2.2, head: 'arch' },
      window: { enabled: true, width: 1.2, height: 1, sillHeight: 1.4, head: 'arch' },
    },
  }, building);
  const root = buildWallSystemWithCanvasMock(building, walls);
  const archCourses = [];
  root.traverse((child) => {
    if (child.userData?.isSouthOpeningArchCourse) archCourses.push(child);
  });

  assert.deepEqual(archCourses.map((course) => course.userData.openingType).sort(), ['door', 'window']);
  archCourses.forEach((course) => {
    assert.equal(course.userData.soldierCourseRole, 'arch-head');
    assert.equal(course.material.userData.raisedBorderOrientation, 'horizontal');
    const shader = {
      uniforms: {},
      vertexShader: '#include <common>\n#include <defaultnormal_vertex>\n#include <worldpos_vertex>',
      fragmentShader: '#include <common>\n#include <map_fragment>\n#include <roughnessmap_fragment>',
    };
    course.material.onBeforeCompile(shader);
    assert.equal(shader.uniforms.raisedArchEnabled.value, 1);
    assert.equal(shader.uniforms.raisedBrickMortarColor.value.getHexString(), walls.bricks.mortarColor.slice(1));
  });
});

test('opening soldier jambs continue to the sill, stone base, or ground', () => {
  const building = normalizeBuilding({ width: 8, depth: 8, height: 6, wallThickness: 0.4 });
  const walls = normalizeWallSystem({
    stoneBase: { enabled: true, height: 0.8 },
    southOpenings: {
      door: { enabled: true, width: 2, height: 2.2, position: -1.6, head: 'arch' },
      window: { enabled: true, width: 1.2, height: 1, position: 1.5, sillHeight: 1.4, head: 'arch' },
    },
  }, building);
  const root = buildWallSystemWithCanvasMock(building, walls);
  const jambs = [];
  root.traverse((child) => {
    if (child.userData?.soldierCourseRole === 'jamb') jambs.push(child);
  });

  assert.equal(jambs.length, 4);
  jambs.forEach((jamb) => {
    jamb.geometry.computeBoundingBox();
    const expectedBottom = jamb.userData.openingType === 'door'
      ? walls.stoneBase.height
      : walls.southOpenings.window.sillHeight;
    assert.ok(Math.abs(jamb.geometry.boundingBox.min.y - expectedBottom) < 0.000001);
    assert.equal(jamb.material.userData.raisedBorderOrientation, 'vertical');
    const shader = {
      uniforms: {},
      vertexShader: '#include <common>\n#include <defaultnormal_vertex>\n#include <worldpos_vertex>',
      fragmentShader: '#include <common>\n#include <map_fragment>\n#include <roughnessmap_fragment>',
    };
    jamb.material.onBeforeCompile(shader);
    assert.equal(shader.uniforms.raisedBorderIsJamb.value, 1);
    assert.equal(shader.uniforms.raisedBrickMortarColor.value.getHexString(), walls.bricks.mortarColor.slice(1));
  });

  const groundWalls = normalizeWallSystem({
    stoneBase: { enabled: false },
    southOpenings: { door: { enabled: true, width: 2, height: 2.2, head: 'arch' } },
  }, building);
  const groundRoot = buildWallSystemWithCanvasMock(building, groundWalls);
  const doorJambs = [];
  groundRoot.traverse((child) => {
    if (child.userData?.soldierCourseRole === 'jamb' && child.userData.openingType === 'door') doorJambs.push(child);
  });
  assert.equal(doorJambs.length, 2);
  doorJambs.forEach((jamb) => {
    jamb.geometry.computeBoundingBox();
    assert.ok(Math.abs(jamb.geometry.boundingBox.min.y) < 0.000001, 'door jamb soldiers must reach ground without a stone base');
  });
});

test('changing building height translates the pointed arch without changing its construction', () => {
  const lowBuilding = normalizeBuilding({ height: 6 });
  const highBuilding = normalizeBuilding({ ...lowBuilding, height: 10 });
  const lowWalls = normalizeWallSystem({
    pointedArch: { ...DEFAULT_WALL_SYSTEM.pointedArch, greenHeight: 5 },
  }, lowBuilding);
  const highWalls = normalizeWallSystem(lowWalls, highBuilding);

  assert.equal(lowWalls.pointedArch.greenHeightOffset, -1);
  assert.equal(highWalls.pointedArch.greenHeight, 9);

  const low = pointedArchConstruction(0, 2, 6, 1, lowWalls.pointedArch.greenHeight);
  const high = pointedArchConstruction(0, 2, 10, 1, highWalls.pointedArch.greenHeight);
  const heightChange = highBuilding.height - lowBuilding.height;

  assert.ok(low && high);
  assert.equal(high.redRadius, low.redRadius);
  assert.equal(high.greenRadius, low.greenRadius);
  ['redCenter', 'greenCenter', 'tangentPoint', 'apexPoint'].forEach((key) => {
    assert.ok(Math.abs(high[key].x - low[key].x) < 0.000001);
    assert.ok(Math.abs(high[key].y - low[key].y - heightChange) < 0.000001);
  });
});

test('selecting the north top wall shows mirrored red and green arch centers and construction circles', () => {
  const scene = constructionScene();
  scene.scene = new THREE.Scene();
  scene.selectedWallSide = 'north_top';
  MehrazScene.prototype.updateWallSurfaceHighlight.call(scene);

  const guides = scene.wallSurfaceHighlight.getObjectByName('North arch symmetric red and green construction circles');
  assert.ok(guides);
  const northArchShiftY = scene.wallSystemRoot().userData.portalKarbandiNorthWallShiftY || 0;
  ['red', 'green'].forEach((color) => {
    const centers = guides.children.filter((child) => child.userData.archConstructionRole === `${color}-center`);
    const circles = guides.children.filter((child) => child.userData.archConstructionRole === `${color}-circle`);
    assert.equal(centers.length, 2);
    assert.equal(circles.length, 2);
    assert.ok(circles.every((circle) => circle.material.opacity === 0.5));
    assert.ok(Math.abs(centers[0].position.x + centers[1].position.x) < 0.000001);
    assert.equal(centers[0].position.y, centers[1].position.y);
    assert.equal(circles[0].userData.archConstructionRadius, circles[1].userData.archConstructionRadius);
    if (color === 'green') {
      assert.ok(Math.abs(
        centers[0].position.y - scene.walls.pointedArch.greenHeight - northArchShiftY
      ) < 0.000001, 'north arch construction centers must rise with the shifted wall arch');
    }
  });
  ['Left', 'Right'].forEach((side) => {
    ['red', 'green'].forEach((color) => {
      const segment = guides.getObjectByName(`${side} ${color} arch construction segment`);
      assert.ok(segment);
      assert.equal(segment.material.linewidth, 3);
      assert.equal(segment.material.opacity, 1);
    });
    ['red-center tangent', 'green-center tangent', 'green-center arch-top'].forEach((radiusName) => {
      const radius = guides.getObjectByName(`${side} ${radiusName} radius`);
      assert.ok(radius);
      assert.equal(radius.material.color.getHex(), 0xffd400);
      assert.equal(radius.material.opacity, 0.5);
    });
  });
});

test('selecting door or window arch controls shows the matching circles, guides, and radii', () => {
  const scene = constructionScene();
  scene.walls = normalizeWallSystem({
    ...scene.walls,
    southOpenings: {
      door: { enabled: true, width: 1.8, height: 2.1, position: -1, head: 'arch' },
      window: { enabled: true, width: 1.2, height: 1, position: 1.2, sillHeight: 1.3, head: 'arch' },
    },
    bricks: { ...DEFAULT_WALL_SYSTEM.bricks, enabled: false },
  }, scene.building);
  scene.buildingGroup = new THREE.Group();
  scene.buildingGroup.add(buildWallSystem(scene.building, scene.walls));
  scene.scene = new THREE.Scene();
  scene.selectedWallSide = 'south';

  ['door', 'window'].forEach((type) => {
    scene.selectedOpeningGuide = type;
    MehrazScene.prototype.updateWallSurfaceHighlight.call(scene);
    const label = type === 'door' ? 'Door' : 'Window';
    const guides = scene.wallSurfaceHighlight.getObjectByName(`${label} arch symmetric red and green construction circles`);
    assert.ok(guides, `${type} inputs must activate their construction diagram`);
    assert.equal(guides.userData.openingType, type);
    ['red', 'green'].forEach((color) => {
      assert.equal(guides.children.filter((child) => child.userData.archConstructionRole === `${color}-center`).length, 2);
      assert.equal(guides.children.filter((child) => child.userData.archConstructionRole === `${color}-circle`).length, 2);
    });
    ['Left', 'Right'].forEach((side) => {
      ['red', 'green'].forEach((color) => assert.ok(guides.getObjectByName(`${side} ${color} arch construction segment`)));
      ['red-center tangent', 'green-center tangent', 'green-center arch-top'].forEach((radiusName) => {
        const radius = guides.getObjectByName(`${side} ${radiusName} radius`);
        assert.ok(radius);
        assert.equal(radius.material.color.getHex(), 0xffd400);
        assert.equal(radius.material.opacity, 0.5);
      });
    });
  });
});

test('editing Rib arch controls shows its four-centre circles, segments, and radii', () => {
  const scene = karbandiConstructionScene();
  scene.scene = new THREE.Scene();
  scene.selectedWallSide = null;
  scene.karbandiRibArchEditing = true;
  MehrazScene.prototype.updateWallSurfaceHighlight.call(scene);

  const guides = scene.wallSurfaceHighlight.getObjectByName('Karbandi rib arch symmetric red and green construction circles');
  assert.ok(guides, 'Rib arch inputs must activate their construction diagram');
  assert.equal(guides.userData.isKarbandiRibArchConstructionGuide, true);
  ['red', 'green'].forEach((color) => {
    assert.equal(guides.children.filter((child) => child.userData.archConstructionRole === `${color}-center`).length, 2);
    assert.equal(guides.children.filter((child) => child.userData.archConstructionRole === `${color}-circle`).length, 2);
  });
  ['Left', 'Right'].forEach((side) => {
    ['red', 'green'].forEach((color) => assert.ok(guides.getObjectByName(`${side} ${color} arch construction segment`)));
    ['red-center tangent', 'green-center tangent', 'green-center arch-top'].forEach((radiusName) => {
      const radius = guides.getObjectByName(`${side} ${radiusName} radius`);
      assert.ok(radius);
      assert.equal(radius.material.color.getHex(), 0xffd400);
      assert.equal(radius.material.opacity, 0.5);
    });
  });
});

test('four-centre arch construction accepts signed red offset and derives the tangent green radius', () => {
  const construction = pointedArchConstruction(0, 2, 6, 1.2, 5, {
    redOffset: -0.4,
    redRadius: 2.8,
  });
  assert.ok(construction);
  assert.equal(construction.redCenter.x, 0.4);
  assert.equal(construction.greenCenter.x, -1.2);
  assert.equal(construction.redRadius, 2.8);
  assert.ok(Math.abs(construction.greenRadius - (construction.redRadius + construction.redCenter.distanceTo(construction.greenCenter))) < 0.000001);
  assert.ok(Math.abs(construction.redCenter.distanceTo(construction.tangentPoint) - construction.redRadius) < 0.000001);
  assert.ok(Math.abs(construction.greenCenter.distanceTo(construction.tangentPoint) - construction.greenRadius) < 0.000001);
});

test('structural walls and the Ahang vault meet without overlapping volumes', () => {
  const group = buildWallSystem({
    type: 'iwan',
    width: 8,
    depth: 10,
    height: 6,
    wallThickness: 0.4,
    openingWidth: 4,
  }, {
    ...DEFAULT_WALL_SYSTEM,
    bricks: { ...DEFAULT_WALL_SYSTEM.bricks, enabled: false },
  });
  const category = (side) => {
    if (['north', 'north_sides', 'north_top'].includes(side)) return 'north';
    if (['arch', 'south_arch'].includes(side)) return 'arch';
    return side;
  };
  const meshes = [];
  group.traverse((object) => {
    if (!object.isMesh || !object.userData?.wallSide || object.userData?.isKarbandiCover) return;
    const bounds = new THREE.Box3().setFromObject(object);
    const size = bounds.getSize(new THREE.Vector3());
    if (Math.min(size.x, size.y, size.z) <= 0.00001) return;
    meshes.push({ bounds, category: category(object.userData.wallSide) });
  });
  const southArchCap = group.children.find((object) => object.userData?.isSouthArchCap);
  const ahangVault = group.children.find((object) => object.userData?.isPointedArch);
  assert.ok(southArchCap);
  assert.ok(ahangVault);
  assert.equal(southArchCap.userData.archInterfaceProfile, 'outer');
  const capBounds = new THREE.Box3().setFromObject(southArchCap);
  const vaultBounds = new THREE.Box3().setFromObject(ahangVault);
  assert.ok(Math.abs(capBounds.max.y - vaultBounds.max.y) < 0.00001, 'south cap must fill to the vault outer crown');
  assert.ok(Math.abs(capBounds.min.z - vaultBounds.max.z) < 0.00001, 'south cap and vault must share a closed butt-joint plane');
  const overlapDepth = (first, second, axis) => (
    Math.min(first.max[axis], second.max[axis]) - Math.max(first.min[axis], second.min[axis])
  );
  for (let firstIndex = 0; firstIndex < meshes.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < meshes.length; secondIndex += 1) {
      const first = meshes[firstIndex];
      const second = meshes[secondIndex];
      if (first.category === second.category) continue;
      const overlap = ['x', 'y', 'z'].map((axis) => overlapDepth(first.bounds, second.bounds, axis));
      assert.ok(
        overlap.some((depth) => depth <= 0.00001),
        `${first.category} overlaps ${second.category} by ${overlap.join(', ')}`,
      );
    }
  }
  assert.equal(group.userData.wallJunctionPolicy, 'butt-joints-no-volume-overlap');
});

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
      groupScale: 0.95,
      enabled: true,
      coverEnabled: true,
      coverFinish: 'bricks',
      web: {
        ...DEFAULT_WALL_SYSTEM.karbandi.web,
        wallEmbedTolerance: 0.005,
        ribEmbedTolerance: 0.003,
      },
    },
  };
  walls.karbandi.span = karbandiSpanForWallLegCenters(walls.karbandi, building, walls);
  walls.karbandi.referenceZ = karbandiReferenceZForRibCount(walls.karbandi, building.depth);
  walls.karbandi.span = karbandiSpanForWallLegCenters(walls.karbandi, building, walls);
  walls.karbandi.referenceZ = karbandiReferenceZForRibCount(walls.karbandi, building.depth);
  walls.karbandi.groupY = karbandiGroupYForWallTopLegCenters(walls.karbandi, building, walls);
  walls.karbandi.groupZ = karbandiGroupZForWallLegCenters(walls.karbandi, building, walls);
  const group = buildWallSystem(building, walls);
  assert.equal(group.userData.karbandiHiddenCornerGuideCount, 0);
  assert.equal(group.userData.karbandiCornerGuideConstraint, null);
  assert.deepEqual(group.userData.karbandiCornerGuides, []);
  assert.equal(group.userData.karbandiCornerRoofExtrusions.length, 2);
  group.userData.karbandiCornerRoofExtrusions.forEach((roof) => {
    assert.match(roof.label, /^south-/);
    assert.equal(roof.adjacentRibIds.length, 2);
    assert.notEqual(roof.southWallRibId, roof.sideWallRibId);
    assert.equal(roof.profileConstraint, 'base-snapped-wall-connected-rib-sections-preserved-without-profile-translation');
    assert.equal(roof.sourceProfileExtent, 'wall-top-to-first-visible-supported-rib-intersection');
    assert.equal(roof.boundaryDevelopment, 'wall-interior-base-along-connected-rib-section-to-exact-first-physical-intersection-line');
    assert.equal(roof.terminalBoundaryMethod, 'straight-line-between-exact-supporting-rib-edge-contacts');
    assert.match(roof.visibleRibIntersectionProjection, /^wall-facing-/);
    assert.ok(roof.visibleRibIntersection[1] > 6);
    assert.equal(roof.cornerRoofMethod, 'two-wall-aligned-rib-edge-extrusions-intersected-and-footprint-clipped');
    assert.match(roof.southWallRibEdgeSourceId, /^\d+:[01]$/);
    assert.match(roof.sideWallRibEdgeSourceId, /^\d+:[01]$/);
    assert.ok(Number.isFinite(roof.southWallRibInteriorDirection));
    assert.ok(Number.isFinite(roof.sideWallRibInteriorDirection));
    assert.equal(roof.wallConnectedRibsOnly, true);
    assert.equal(roof.southPoints.length, roof.sidePoints.length);
    assert.equal(roof.southPoints.length, roof.intersectionPoints.length);
    assert.ok(roof.intersectionPoints.length >= 3);
    assert.ok(Math.abs(roof.southPoints.at(-1)[1] - roof.visibleRibIntersection[1]) < 0.000001);
    assert.ok(Math.abs(roof.sidePoints.at(-1)[1] - roof.visibleRibIntersection[1]) < 0.000001);
    assert.equal(roof.southPoints[0][1], 6);
    assert.equal(roof.southPoints[0][2], 1);
    assert.equal(roof.sidePoints[0][1], 6);
    roof.intersectionPoints.forEach(([x, , z]) => {
      assert.ok(x >= -2 && x <= 2);
      assert.ok(z >= -1 && z <= 1);
    });
  });
  const cornerRoofPanels = [];
  group.traverse((object) => {
    if (object.userData?.cornerRoofStripWall) cornerRoofPanels.push(object);
  });
  assert.equal(cornerRoofPanels.length, 4);
  cornerRoofPanels.forEach((panel) => {
    assert.equal(panel.userData.cornerRoofStripSidedness, 'double-sided-closed-wall-bay');
    assert.equal(panel.material.side, THREE.DoubleSide);
  });
  const [southWestRoof, southEastRoof] = group.userData.karbandiCornerRoofExtrusions;
  assert.equal(southWestRoof.intersectionPoints.length, southEastRoof.intersectionPoints.length);
  const northSupportPanels = [];
  group.traverse((object) => {
    if (!object.userData?.webSupportSides?.includes('north')) return;
    northSupportPanels.push(object);
  });
  assert.ok(northSupportPanels.length > 0);
  northSupportPanels.forEach((panel) => {
    assert.equal(panel.userData.karbandiRoofRaisedCenter, false);
    assert.equal(panel.userData.karbandiRoofCurved, true);
    assert.ok(['four-edge-inward-courses', 'small-four-edge-cap', 'wall-started-bent-infill', 'wall-arch-ruled-strip', 'north-crown-sliced-inward-courses', 'north-visible-rib-profile-extruded-to-wall', 'boundary-constrained-polygon'].includes(panel.userData.webPatchSolver));
    assert.equal(panel.userData.northWallClipped, true);
    assert.ok(panel.material.clippingPlanes.length >= 1);
    assert.ok(panel.material.clippingPlanes.some((plane) => plane.normal.z === 1));
    assert.ok(panel.userData.webWallSupportAnchoredVertexCount > 0);
    assert.equal(panel.userData.webWallSupportContact, 'exact-south-wall-top-or-north-arch-surface');
    const positions = panel.geometry.getAttribute('position');
    const surfaceCount = panel.userData.webPatchSurfaceVertexCount;
    assert.ok(Array.from({ length: surfaceCount }, (_, index) => index + surfaceCount).some(
      (index) => Math.abs(positions.getZ(index) + 1) < 0.000001,
    ), 'north perimeter roof must touch the north wall arch plane');
  });
  const crownPanels = northSupportPanels.filter((panel) => panel.userData.webPatchSolver === 'north-crown-sliced-inward-courses');
  assert.ok(crownPanels.length > 0);
  crownPanels.forEach((panel) => {
    assert.equal(panel.userData.roofType, 'crown');
    assert.equal(panel.userData.roofBrickMapping, 'crown-inward-courses');
    assert.equal(panel.userData.roofBrickHorizontalMortarOnly, true);
    assert.ok(panel.userData.crownBoundaryVertexCount > 8);
    assert.equal(panel.userData.crownCourseDistanceMode, 'shared-lower-envelope-physical-offset');
    assert.ok(panel.userData.crownSliceCount > 1);
    assert.equal(panel.material.userData.isRoofInfillBrickCourse, true);
    assert.equal(panel.material.userData.isCrownRoofBrickPattern, true);
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
    assert.equal(panel.userData.roofType, '4-rib-roof');
    assert.equal(panel.userData.webFourRibRegion, true);
    if (panel.userData.webFourRibBoundaryMode) {
      assert.equal(panel.userData.webFourRibBoundaryMode, 'four-rib-centerline-intersections-red-polyline');
      assert.equal(
        panel.userData.webFourRibBoundaryRule,
        'unified-four-centerline-intersections-all-cell-lengths',
      );
      assert.equal(panel.userData.webFourRibBoundaryFallback, null);
    } else {
      assert.ok([
        'unsafe-centerline-solution-rejected-use-physical-seat-boundary',
        'no-finite-centerline-intersection-use-physical-seat-boundary',
      ].includes(panel.userData.webFourRibBoundaryFallback));
    }
    assert.equal(panel.userData.webWallTopAnchoredCorners, 0);
    assert.ok(panel.userData.webInwardCourseCount >= 2);
    assert.ok(panel.userData.webInwardCourseWidth > 0);
    assert.equal(
      panel.userData.roofBrickMapping,
      'offset-rib-courses',
    );
    assert.equal(panel.userData.roofBrickHorizontalMortarOnly, true);
    assert.equal(panel.userData.roofInfillBrickColor, DEFAULT_WALL_SYSTEM.karbandi.web.infillBrickColor);
    assert.equal(panel.userData.roofInfillBrickColor2, DEFAULT_WALL_SYSTEM.karbandi.web.infillBrickColor2);
    assert.equal(panel.userData.roofInfillBrickHeight, 0.06);
    assert.equal(panel.material.userData.isRoofInfillBrickCourse, true);
    assert.deepEqual(panel.userData.webWallTopAnchorSides, []);
    assert.equal(panel.userData.webRegionNormalMode, 'best-fit-four-rib-boundary-90-degree');
    assert.equal(panel.userData.webExtrusionAngleDegrees, 90);
    const positions = panel.geometry.getAttribute('position');
    const surfaceCount = panel.userData.webPatchSurfaceVertexCount;
    const extrusionNormal = new THREE.Vector3(...panel.userData.webRegionNormal);
    for (let index = 0; index < surfaceCount; index += 1) {
      const extrusion = new THREE.Vector3(
        positions.getX(index) - positions.getX(index + surfaceCount),
        positions.getY(index) - positions.getY(index + surfaceCount),
        positions.getZ(index) - positions.getZ(index + surfaceCount),
      );
      assert.ok(Math.abs(extrusion.length() - walls.karbandi.web.roofThickness) < 0.00001);
      assert.ok(Math.abs(Math.abs(extrusion.clone().normalize().dot(extrusionNormal)) - 1) < 0.00001);
    }
  });
  assert.equal(interiorPanels.filter((panel) => (
    panel.userData.webFourRibBoundaryMode === 'small-four-rib-centerline-intersection-purple-polyline'
  )).length, 0);
  assert.ok(interiorPanels.some((panel) => panel.userData.roofBrickMapping === 'offset-rib-courses'));
  ['east', 'west'].forEach((side) => {
    const panel = perimeterPanels.find((candidate) => candidate.userData.wallContinuationSide === side);
    assert.ok(panel, `${side} Karbandi wall continuation must exist`);
    const positions = panel.geometry.getAttribute('position');
    const uvs = panel.geometry.getAttribute('uv');
    const mirroredCorner = panel.userData.cornerRoofDevelopment === 'mirrored-from-bearing-rib-leg-to-south-vertical-wall';
    const expectedSign = mirroredCorner ? -1 : side === 'west' ? -1 : 1;
    assert.equal(panel.userData.wallContinuationUAxis, mirroredCorner ? '-world-z' : side === 'west' ? '-world-z' : '+world-z');
    for (let index = 0; index < positions.count; index += 1) {
      assert.ok(Math.abs(uvs.getX(index) - expectedSign * positions.getZ(index)) < 0.00001, `${side} continuation must match its wall-facing bond direction`);
    }
  });
  interiorPanels.filter((panel) => panel.userData.roofBrickMapping === 'offset-rib-courses').forEach((panel) => {
    const uv = panel.geometry.getAttribute('uv');
    const count = panel.userData.webPatchSurfaceVertexCount;
    const courseWidth = panel.userData.webInwardCourseWidth;
    const inwardValues = new Set(Array.from({ length: count }, (_, index) => Math.round(uv.getY(index) / courseWidth)));
    assert.ok(inwardValues.size >= 2);
  });
  assert.ok(perimeterPanels.every((panel) => !panel.userData.hiddenGuideBoundaryCount));
  const southCornerExtrusionPanels = perimeterPanels.filter(
    (panel) => panel.userData.cornerRoofIntersection === 'direct-surface-intersection-no-guide',
  );
  assert.equal(southCornerExtrusionPanels.length, 4);
  southCornerExtrusionPanels.forEach((panel) => {
    assert.equal(panel.userData.wallRoofGuide, null);
    assert.equal(panel.userData.wallContinuationFollowsCornerGuide, false);
    assert.equal(panel.userData.wallContinuationMethod, 'direct-wall-aligned-rib-edge-extrusion');
    assert.equal(panel.userData.cornerRoofStartsAt, 'visible-rib-edge');
    assert.equal(panel.userData.cornerRoofProfileAlignment, 'base-snapped-only-preserves-connected-rib-section');
    const cornerSide = panel.userData.webSupportSides.includes('east') ? 'east' : 'west';
    assert.deepEqual(new Set(panel.userData.wallClippedSides), new Set(['south', cornerSide]));
    assert.equal(panel.userData.cornerRoofFootprintClip, `inside-south-and-${cornerSide}-interior-wall-faces`);
    assert.ok(['north', 'east', 'south', 'west'].includes(panel.userData.wallContinuationSide));
    assert.ok(panel.userData.ribFootFlangeCount >= 1);
    assert.ok(panel.userData.ribFootClosureOverlap > panel.userData.ribEmbedTolerance);
  });
  assert.ok(perimeterPanels.some((panel) => panel.userData.webSupportSides.includes('south')));
  const southWallRoof = perimeterPanels.find((panel) => (
    panel.userData.webSupportSides.length === 1
    && panel.userData.webSupportSides[0] === 'south'
    && panel.userData.cornerRoofIntersection !== 'direct-surface-intersection-no-guide'
  ));
  assert.ok(southWallRoof);
  assert.equal(
    southWallRoof.userData.webPhysicalRibProfilesExtendedToWall,
    2,
    'south roof must use both complete yellow rib sides down to their red-line wall contacts',
  );
  assert.equal(
    southWallRoof.userData.webWallRoofRibEdgeSelection,
    'rendered-rib-inner-arch-reveal-facing-roof-bay',
  );
  assert.equal(southWallRoof.userData.wallRoofBoundaryOffset, -0.07);
  assert.ok(southWallRoof.userData.webWallSupportAnchoredVertexCount > 0);
  assert.ok(southWallRoof.userData.webWallSupportMaximumClosedGap < 0.001);
  assert.equal(southWallRoof.userData.webWallSupportContact, 'exact-south-wall-top-or-north-arch-surface');
  {
    const positions = southWallRoof.geometry.getAttribute('position');
    const surfaceCount = southWallRoof.userData.webPatchSurfaceVertexCount;
    assert.ok(Array.from({ length: surfaceCount }, (_, index) => index + surfaceCount).some((index) => (
      Math.abs(positions.getY(index) - 6) < 0.000001
      && Math.abs(positions.getZ(index) - 1) < 0.000001
    )), 'south perimeter roof must start on the south wall top without a white gap');
  }
  assert.ok(perimeterPanels.some((panel) => panel.userData.webSupportSides.includes('east')));
  assert.ok(perimeterPanels.some((panel) => panel.userData.webSupportSides.includes('west')));
  const wallContinuationPanels = perimeterPanels.filter(
    (panel) => panel.userData.webPatchSolver !== 'north-crown-sliced-inward-courses',
  );
  assert.ok(wallContinuationPanels.length > 0);
  wallContinuationPanels.forEach((panel) => {
    assert.equal(panel.userData.roofType, 'wall-supported-roof');
    assert.equal(panel.userData.roofBrickMapping, 'wall-continuation');
    assert.ok(['north', 'east', 'south', 'west'].includes(panel.userData.wallContinuationSide));
    assert.equal(panel.userData.wallContinuationPatternSide, panel.userData.wallContinuationSide);
    assert.equal(panel.userData.wallContinuationClippedByRibs, true);
    assert.equal(panel.userData.wallContinuationCourseAxis, 'world-y');
  });
  const fourRibPanels = [...interiorPanels, ...perimeterPanels]
    .filter((panel) => panel.userData.webFourRibRegion === true);
  assert.ok(fourRibPanels.length > 0);
  fourRibPanels.forEach((panel) => {
    assert.equal(panel.userData.roofType, '4-rib-roof');
    assert.equal(panel.userData.webInfillRule, 'four-rib-inward-courses');
    assert.equal(panel.userData.roofBrickMapping, 'offset-rib-courses');
    assert.equal(panel.material.userData.isRoofInfillBrickCourse, true);
    assert.equal(panel.userData.roofBrickHorizontalMortarOnly, true);
    assert.equal(panel.userData.wallContinuationSide, null);
  });
  const northSideWallPanels = perimeterPanels.filter((panel) => (
    panel.userData.webCellClassification === 'CornerPerimeterCell'
    && panel.userData.webSupportSides.includes('north')
    && (panel.userData.webSupportSides.includes('east') || panel.userData.webSupportSides.includes('west'))
  ));
  assert.equal(northSideWallPanels.length, 2);
  northSideWallPanels.forEach((panel) => {
    assert.equal(panel.userData.webFourRibRegion, false);
    assert.equal(panel.userData.roofType, 'wall-supported-roof');
    assert.equal(panel.userData.roofBrickMapping, 'wall-continuation');
    const expectedSide = panel.userData.webSupportSides.includes('west') ? 'west' : 'east';
    assert.equal(panel.userData.wallContinuationSide, expectedSide);
    assert.equal(panel.userData.wallContinuationPatternSide, expectedSide);
    assert.equal(panel.userData.northVisibleRibExtrusion, true);
    assert.equal(panel.userData.northVisibleRibExtrusionAxis, 'visible-rib-to-north-wall:-world-z');
    assert.equal(panel.userData.northVisibleRibSource, 'closest-visible-wall-supported-rib-section');
    assert.equal(
      panel.userData.northVisibleRibClipMethod,
      'closest-visible-rib-profile-extruded-north-and-clipped-by-north-wall',
    );
    assert.ok(panel.userData.northVisibleRibSourceIds.length > 0);
    assert.ok(panel.userData.northVisibleRibProfile.length > 2);
    assert.equal(
      panel.userData.northVisibleRibProfileExtent,
      'closest-visible-topology-section-between-physical-intersections',
    );
    assert.equal(panel.userData.northVisibleRibWallProfile.length, panel.userData.northVisibleRibProfile.length);
    panel.userData.northVisibleRibWallProfile.forEach((wallPoint, index) => {
      const ribPoint = panel.userData.northVisibleRibProfile[index];
      assert.ok(Math.abs(wallPoint[0] - THREE.MathUtils.clamp(ribPoint[0], -2, 2)) < 0.000001);
      assert.ok(Math.abs(wallPoint[1] - ribPoint[1]) < 0.000001, 'northward extrusion must preserve the visible rib profile height');
      assert.ok(Math.abs(wallPoint[2] + 1) < 0.000001, 'northward extrusion must terminate on the north wall');
    });
    assert.equal(
      panel.userData.wallContinuationMethod,
      'closest-visible-rib-profile-extruded-north-and-clipped-by-north-wall',
    );
    assert.equal(panel.userData.webPatchSolver, 'north-visible-rib-profile-extruded-to-wall');
    assert.equal(panel.userData.webRegionNormalMode, 'visible-rib-profile-to-north-wall-surface-normal');
    const positions = panel.geometry.getAttribute('position');
    const surfaceCount = panel.userData.webPatchSurfaceVertexCount;
    for (let index = 0; index < surfaceCount; index += 1) {
      assert.ok(positions.getX(index + surfaceCount) >= -2 - 0.00001);
      assert.ok(positions.getX(index + surfaceCount) <= 2 + 0.00001);
      assert.ok(positions.getY(index + surfaceCount) < 20, 'northward visible-rib extrusion must not extrapolate into a spike');
    }
    assert.ok(Array.from({ length: surfaceCount }, (_, index) => positions.getZ(index + surfaceCount))
      .some((z) => z > -1 + 0.01), 'northward extrusion must retain its generating visible rib section');
    for (let index = 0; index < surfaceCount; index += 1) {
      const extrusion = new THREE.Vector3(
        positions.getX(index) - positions.getX(index + surfaceCount),
        positions.getY(index) - positions.getY(index + surfaceCount),
        positions.getZ(index) - positions.getZ(index + surfaceCount),
      );
      assert.ok(Math.abs(extrusion.length() - walls.karbandi.web.roofThickness) < 0.00001);
    }
    const profileMaximumZ = Math.max(...panel.userData.northVisibleRibProfile.map((point) => point[2]));
    const roofMaximumZ = Math.max(...Array.from(
      { length: surfaceCount },
      (_, index) => positions.getZ(index + surfaceCount),
    ));
    assert.ok(roofMaximumZ >= profileMaximumZ - 0.00001, 'north corner roof must retain the complete closest visible rib section');
    assert.notEqual(panel.material.userData.isRoofInfillBrickCourse, true);
  });
  const northOnlyWallPanels = perimeterPanels.filter((panel) => (
    panel.userData.webSupportSides.length === 1
    && panel.userData.webSupportSides[0] === 'north'
    && panel.userData.webPatchSolver !== 'north-crown-sliced-inward-courses'
  ));
  assert.ok(northOnlyWallPanels.length > 0);
  northOnlyWallPanels.forEach((panel) => {
    assert.equal(panel.userData.roofBrickMapping, 'wall-continuation');
    assert.notEqual(panel.material.userData.isRoofInfillBrickCourse, true);
  });
  perimeterPanels
    .filter((panel) => (
      panel.userData.webCellClassification === 'CornerPerimeterCell'
      && panel.userData.cornerRoofIntersection !== 'direct-surface-intersection-no-guide'
      && panel.userData.northVisibleRibExtrusion !== true
    ))
    .forEach((panel) => {
      assert.equal(
        panel.userData.wallContinuationSide,
        panel.userData.webSupportSides.includes('east') ? 'east' : 'west',
      );
    });
  perimeterPanels.forEach((panel) => {
    if (panel.userData.cornerRoofIntersection === 'direct-surface-intersection-no-guide') {
      assert.equal(panel.userData.webPatchSolver, 'wall-aligned-rib-edge-ruled-extrusion');
      assert.equal(panel.userData.thicknessDirection, 'world-y-for-seam-continuity');
      assert.equal(panel.userData.wallRoofGuide, null);
      assert.equal(panel.material.clippingPlanes.length, 2);
      return;
    }
    if (panel.userData.northVisibleRibExtrusion === true) {
      assert.equal(panel.userData.webPerimeterRibBoundaryMode, null);
      assert.equal(panel.userData.webPerimeterWallBaseMode, null);
      assert.equal(panel.userData.karbandiRoofRaisedCenter, false);
      assert.equal(panel.userData.karbandiRoofCurved, true);
      assert.equal(panel.userData.webStartsAtWall, true);
      assert.equal(panel.userData.thicknessDirection, 'surface-normal');
      return;
    }
    if (panel.userData.webSupportSides.some((side) => ['south', 'east', 'west'].includes(side))) {
      assert.equal(
        panel.userData.webPerimeterRibBoundaryMode,
        'physical-rib-sides-with-base-intersections-on-interior-wall-surface',
      );
      assert.equal(
        panel.userData.webPerimeterWallBaseMode,
        'exact-physical-rib-base-intersections-with-interior-wall-surface',
      );
    } else {
      assert.equal(
        panel.userData.webPerimeterRibBoundaryMode,
        'rib-centerlines-with-wall-support-boundary',
      );
    }
    assert.equal(panel.userData.karbandiRoofRaisedCenter, false);
    assert.equal(panel.userData.karbandiRoofCurved, true);
    assert.ok(['four-edge-inward-courses', 'small-four-edge-cap', 'wall-started-bent-infill', 'wall-arch-ruled-strip', 'north-crown-sliced-inward-courses', 'boundary-constrained-polygon'].includes(panel.userData.webPatchSolver));
    assert.equal(panel.userData.webSurfaceSubdivision, 8);
    assert.equal(panel.userData.ribEmbedApplied, true);
    assert.equal(panel.userData.ribCrackClosure, 'hidden-mitered-seating-flange');
    assert.equal(panel.userData.thicknessDirection, 'surface-normal');
    assert.equal(panel.userData.webStartsAtWall, true);
    if (panel.userData.webSupportSides.some((side) => ['south', 'east', 'west'].includes(side))) {
      assert.equal(panel.userData.wallSupportedRoofRibClip, 'continuous-hidden-two-sided-overlap-beneath-full-physical-rib');
      assert.equal(panel.userData.wallSupportedRoofClosureSidedness, 'double-sided-at-wall-to-rib-seam');
      assert.equal(panel.material.side, THREE.DoubleSide);
      assert.ok(panel.userData.wallSupportedRoofRibOverlap >= walls.karbandi.ribWidth * walls.karbandi.groupScale * 0.5);
      assert.equal(panel.userData.webWallRoofRibEdgeSelection, 'rendered-rib-inner-arch-reveal-facing-roof-bay');
      assert.deepEqual(
        panel.userData.wallRoofInnerRevealSides,
        panel.userData.webSupportSides.filter((side) => ['south', 'east', 'west'].includes(side)),
      );
      assert.equal(panel.userData.wallRoofBoundaryOffset, -0.07);
      if (
        panel.userData.webSupportSides.includes('north')
        && panel.userData.webSupportSides.some((side) => ['east', 'west'].includes(side))
      ) {
        assert.equal(
          panel.userData.wallRoofNorthContact,
          'inner-rib-reveal-snapped-to-north-interior-arch-surface-after-offset',
        );
      }
      const physicalSides = panel.userData.webSupportSides.filter((side) => ['south', 'east', 'west'].includes(side));
      if (physicalSides.includes('south') && panel.userData.webSupportSides.length === 1) {
        assert.equal(
          panel.userData.webPhysicalRibProfilesExtendedToWall,
          2,
          'south wall roof must extend both inner rib reveals to its wall',
        );
      } else {
        assert.ok(
          panel.userData.webPhysicalRibProfilesExtendedToWall >= 1,
          `${panel.userData.webSupportSides.join('/')} wall roof must extend its inner rib reveal to its wall`,
        );
      }
    }
    assert.equal(panel.userData.webPatchInvertedTriangleCount, 0);
    assert.ok(['north-arch-curve', 'wall-leg-centerline'].includes(panel.userData.wallRoofGuide));
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
  thicknessPanels.forEach((panel) => assert.equal(panel.userData.roofThickness, 0.05));
});

test('mirrored steep four-rib roofs keep parallel alternating inward courses', () => {
  const building = {
    type: 'iwan', width: 4, depth: 2, height: 6, wallThickness: 0.35, openingWidth: 4,
  };
  const karbandi = {
    ...DEFAULT_WALL_SYSTEM.karbandi,
    enabled: true,
    coverEnabled: true,
    coverFinish: 'bricks',
    ribCount: 12,
    referenceAngle: 180,
    groupScale: 0.95,
  };
  karbandi.span = karbandiSpanForWallLegCenters(karbandi, building, DEFAULT_WALL_SYSTEM);
  karbandi.referenceZ = karbandiReferenceZForRibCount(karbandi, building.depth);
  karbandi.groupY = karbandiGroupYForWallTopLegCenters(karbandi, building, DEFAULT_WALL_SYSTEM);
  karbandi.groupZ = karbandiGroupZForWallLegCenters(karbandi, building, DEFAULT_WALL_SYSTEM);
  const group = buildWallSystem(building, {
    ...DEFAULT_WALL_SYSTEM,
    bricks: { ...DEFAULT_WALL_SYSTEM.bricks, enabled: false },
    ahang: { enabled: false },
    karbandi,
  });
  const fourRibPanels = [];
  group.traverse((object) => {
    if (
      object.userData?.isKarbandiCover
      && object.userData.webFourRibBoundaryMode === 'four-rib-centerline-intersections-red-polyline'
    ) fourRibPanels.push(object);
  });
  assert.ok(fourRibPanels.length > 0);
  fourRibPanels.forEach((panel) => {
    assert.equal(panel.userData.webFourRibInfillRegion, true);
    assert.equal(panel.userData.roofBrickMapping, 'offset-rib-courses');
    assert.equal(panel.userData.wallContinuationSide, null);
    assert.equal(panel.userData.webInfillRule, 'four-rib-inward-courses');
    assert.equal(panel.material.userData.isRoofInfillBrickCourse, true);
    assert.equal(panel.userData.roofBrickHorizontalMortarOnly, true);
    assert.ok(['four-edge-inward-courses', 'three-curve-transfinite'].includes(panel.userData.webPatchSolver));
    const uv = panel.geometry.getAttribute('uv');
    const surfaceCount = panel.userData.webPatchSurfaceVertexCount;
    const inwardValues = Array.from({ length: surfaceCount }, (_, index) => uv.getY(index));
    const courseLevels = new Set(inwardValues.map((value) => (
      Math.round(value / panel.userData.webInwardCourseWidth)
    )));
    assert.ok(courseLevels.size >= 2);
  });
});

test('Karbandi roof replaces folded cells with boundary-preserving panels in unstable rib designs', () => {
  const group = buildWallSystem({
    type: 'iwan', width: 4, depth: 2, height: 6, wallThickness: 0.35, openingWidth: 4,
  }, {
    ...DEFAULT_WALL_SYSTEM,
    bricks: { ...DEFAULT_WALL_SYSTEM.bricks, enabled: false },
    ahang: { enabled: false },
    karbandi: {
      ...DEFAULT_WALL_SYSTEM.karbandi,
      groupScale: 0.95,
      enabled: true,
      coverEnabled: true,
      ribCount: 10,
      referenceAngle: 180,
    },
  });
  const panels = [];
  group.traverse((object) => {
    if (object.userData?.isKarbandiCover) panels.push(object);
  });
  assert.ok(panels.length > 1);
  assert.ok(panels.every((panel) => panel.userData.webPatchSolver));
  assert.ok(panels.every((panel) => panel.userData.webPatchInvertedTriangleCount === 0));
  panels.forEach((panel) => {
    const positions = panel.geometry.getAttribute('position');
    for (let index = 0; index < positions.count; index += 1) {
      assert.ok(Number.isFinite(positions.getX(index)));
      assert.ok(Number.isFinite(positions.getY(index)));
      assert.ok(Number.isFinite(positions.getZ(index)));
      if (panel.userData.roofType === '4-rib-roof') {
        assert.ok(positions.getX(index) >= -2.25 && positions.getX(index) <= 2.25);
        assert.ok(positions.getZ(index) >= -1.25 && positions.getZ(index) <= 1.25);
        assert.ok(positions.getY(index) < 20, 'a 4-rib roof must never extrapolate into a sail or spike');
      }
    }
  });
});

test('south corner roofs rebuild from distinct south and side wall ribs after Karbandi input changes', () => {
  const building = {
    type: 'iwan', width: 4, depth: 2, height: 6, wallThickness: 0.35, openingWidth: 4,
  };
  [
    { ribCount: 10 },
    { referenceAngle: 150 },
    { groupRotationY: 12, groupScale: 0.95 },
    { groupScale: 1.1 },
  ].forEach((patch) => {
    const karbandi = { ...DEFAULT_WALL_SYSTEM.karbandi, ...patch, enabled: true, coverEnabled: true };
    karbandi.span = karbandiSpanForWallLegCenters(karbandi, building, DEFAULT_WALL_SYSTEM);
    karbandi.referenceZ = karbandiReferenceZForRibCount(karbandi, building.depth);
    karbandi.span = karbandiSpanForWallLegCenters(karbandi, building, DEFAULT_WALL_SYSTEM);
    karbandi.referenceZ = karbandiReferenceZForRibCount(karbandi, building.depth);
    karbandi.groupY = karbandiGroupYForWallTopLegCenters(karbandi, building, DEFAULT_WALL_SYSTEM);
    karbandi.groupZ = karbandiGroupZForWallLegCenters(karbandi, building, DEFAULT_WALL_SYSTEM);
    const group = buildWallSystem(building, {
      ...DEFAULT_WALL_SYSTEM,
      bricks: { ...DEFAULT_WALL_SYSTEM.bricks, enabled: false },
      ahang: { enabled: false },
      karbandi,
    });
    assert.equal(group.userData.karbandiHiddenCornerGuideCount, 0);
    assert.deepEqual(group.userData.karbandiCornerGuides, []);
    const expectedCornerCount = 2;
    assert.equal(group.userData.karbandiCornerRoofExtrusions.length, expectedCornerCount, JSON.stringify(patch));
    group.userData.karbandiCornerRoofExtrusions.forEach((corner) => {
      assert.notEqual(corner.southWallRibId, corner.sideWallRibId);
      assert.equal(corner.selectedVisibleRibEdgesOnly, true);
      assert.equal(corner.cornerRoofMethod, 'two-wall-aligned-rib-edge-extrusions-intersected-and-footprint-clipped');
      assert.equal(corner.southWallConnection, 'rib-leg-seat-to-vertical-south-interior-plane');
      assert.equal(corner.southWallPlaneZ, 1);
      assert.equal(corner.sourceProfileExtent, 'wall-top-to-first-visible-supported-rib-intersection');
      assert.equal(corner.boundaryDevelopment, 'wall-interior-base-along-connected-rib-section-to-exact-first-physical-intersection-line');
      assert.equal(corner.terminalBoundaryMethod, 'straight-line-between-exact-supporting-rib-edge-contacts');
      assert.match(corner.visibleRibIntersectionProjection, /^wall-facing-/);
      assert.ok(corner.visibleRibIntersection[1] > 6);
      assert.match(corner.southWallRibEdgeSourceId, /^\d+:[01]$/);
      assert.match(corner.sideWallRibEdgeSourceId, /^\d+:[01]$/);
      assert.equal(corner.southPoints[0][1], 6);
      assert.equal(corner.sidePoints[0][1], 6);
      assert.ok(Math.abs(corner.southPoints[0][2] - 1) < 0.000001,
        'the south roof must start at its rib-leg seat on the vertical south interior plane');
      assert.ok(Math.abs(corner.intersectionPoints[0][2] - 1) < 0.000001,
        'the corner intersection must remain connected to the vertical south interior plane');
      assert.ok(Math.abs(corner.southPoints.at(-1)[1] - corner.visibleRibIntersection[1]) < 0.000001);
      assert.ok(Math.abs(corner.sidePoints.at(-1)[1] - corner.visibleRibIntersection[1]) < 0.000001);
      assert.ok(
        corner.visibleRibCenterlineContactDistance <= karbandi.ribWidth * karbandi.groupScale * 1.1,
        'corner roof must use physically touching ribs rather than a remote projected crossing',
      );
      const southEnd = corner.southPoints.at(-1);
      const sideEnd = corner.sidePoints.at(-1);
      assert.deepEqual(corner.terminalBoundary, [southEnd, sideEnd]);
      const exactBoundaryMidpoint = southEnd.map((coordinate, axis) => (coordinate + sideEnd[axis]) / 2);
      assert.ok(
        Math.hypot(...exactBoundaryMidpoint.map((coordinate, axis) => coordinate - corner.visibleRibIntersection[axis])) < 0.000001,
        'the extrusion seam must terminate on the straight red boundary between the two supporting ribs',
      );
      assert.ok(
        Math.hypot(...exactBoundaryMidpoint.map((coordinate, axis) => coordinate - corner.intersectionPoints.at(-1)[axis])) < 0.000001,
        'the generated roof must not extend through a coordinate-mixed L-shaped corner beyond the rib intersection',
      );
      assert.ok(
        Math.hypot(...southEnd.map((coordinate, axis) => coordinate - sideEnd[axis]))
          <= karbandi.ribWidth * karbandi.groupScale * 1.1,
        'the selected extrusion edges must meet within their physical rib width',
      );
      corner.intersectionPoints.forEach(([x, , z]) => {
        assert.ok(x >= -2 - 0.000001 && x <= 2 + 0.000001);
        assert.ok(z >= -1 - 0.000001 && z <= 1 + 0.000001);
      });
    });
    const panels = [];
    group.traverse((object) => {
      if (object.userData?.isKarbandiCover) panels.push(object);
    });
    assert.ok(panels.length > 0);
    assert.ok(panels.every((panel) => panel.userData.webPatchInvertedTriangleCount === 0));
    const northCornerPanels = panels.filter((panel) => panel.userData.northVisibleRibExtrusion === true);
    assert.equal(northCornerPanels.length, 2, `north corner roofs must regenerate after ${JSON.stringify(patch)}`);
    northCornerPanels.forEach((panel) => {
      const side = panel.userData.webSupportSides.includes('west') ? 'west' : 'east';
      assert.equal(panel.userData.wallContinuationSide, side);
      assert.equal(panel.userData.northVisibleRibSourceIds.length, 1);
      assert.ok(panel.userData.northVisibleRibProfile.length > 2);
      assert.equal(panel.userData.northVisibleRibWallProfile.length, panel.userData.northVisibleRibProfile.length);
      panel.userData.northVisibleRibWallProfile.forEach((wallPoint, index) => {
        const ribPoint = panel.userData.northVisibleRibProfile[index];
        assert.ok(Math.abs(wallPoint[1] - ribPoint[1]) < 0.000001);
        assert.ok(Math.abs(wallPoint[2] + 1) < 0.000001);
      });
      const positions = panel.geometry.getAttribute('position');
      const surfaceCount = panel.userData.webPatchSurfaceVertexCount;
      const roofMaximumZ = Math.max(...Array.from(
        { length: surfaceCount },
        (_, index) => positions.getZ(index + surfaceCount),
      ));
      const ribMaximumZ = Math.max(...panel.userData.northVisibleRibProfile.map((point) => point[2]));
      assert.ok(
        roofMaximumZ >= ribMaximumZ - 0.00001,
        `${side} north roof must regenerate through the complete first supported rib after ${JSON.stringify(patch)}`,
      );
    });
    const cornerPanels = panels.filter((panel) => panel.userData.cornerRoofIntersection === 'direct-surface-intersection-no-guide');
    assert.equal(cornerPanels.length, expectedCornerCount * 2);
    assert.ok(cornerPanels.every((panel) => panel.userData.wallContinuationFollowsCornerGuide === false));
    assert.ok(cornerPanels.every((panel) => (
      panel.userData.cornerRoofDevelopment === 'mirrored-from-bearing-rib-leg-to-south-vertical-wall'
    )));
    ['west', 'east'].forEach((side) => {
      const southPanel = cornerPanels.find((panel) => (
        panel.userData.webSupportSides.includes(side) && panel.userData.cornerRoofStripWall === 'south'
      ));
      const sidePanel = cornerPanels.find((panel) => (
        panel.userData.webSupportSides.includes(side) && panel.userData.cornerRoofStripWall === side
      ));
      assert.equal(southPanel.userData.wallContinuationUAxis, side === 'west' ? '+world-x' : '-world-x');
      assert.equal(sidePanel.userData.wallContinuationUAxis, '-world-z');
    });
    if (patch.referenceAngle === 179) {
      const west = group.userData.karbandiCornerRoofExtrusions.find((corner) => corner.label === 'south-west');
      const east = group.userData.karbandiCornerRoofExtrusions.find((corner) => corner.label === 'south-east');
      assert.ok(west && east);
      assert.equal(west.southPoints.length, east.southPoints.length);
      west.southPoints.forEach(([westX, westY, westZ], index) => {
        const [eastX, eastY, eastZ] = east.southPoints[index];
        assert.ok(Math.abs(westX + eastX) < 0.000001);
        assert.ok(Math.abs(westY - eastY) < 0.000001);
        assert.ok(Math.abs(westZ - eastZ) < 0.000001);
      });
    }
  });
});
