import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { archCourseDistanceAtPoint, buildWallSystem, configureStoneBaseMaterial, DEFAULT_WALL_SYSTEM, karbandiGroupZForWallLegCenters, karbandiReferenceZForRibCount, karbandiReferenceZSolutions, karbandiSpanForWallLegCenters, normalizeWallSystem, pointedArchConstruction, southOpeningProfile, wallConnectedRibIndexes, wallContextLibraryAsset } from './wall-system.js';
import { buildingSurfaces, CONSTRUCTION_STEPS, defaultZoneBounds, MehrazScene, moveZoneVerticallyByBrick, normalizeBuilding, resizeZoneHeightByBrick, zoneBrickHeightStep, zonePatternMapTransform, zoneSoldierCourses, zoneWorldTransform } from './mehraz-scene.js';

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

  scene.applyConstructionStep(stepIndex('lower-walls'), 1);
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

test('Karbandi construction builds the north guide arch before clipped ribs and finishes the north wall afterward', () => {
  const scene = karbandiConstructionScene();
  const stepIndex = (id) => CONSTRUCTION_STEPS.findIndex((step) => step.id === id);
  const ribMeshes = () => scene.wallSystemRoot().children.filter((child) => child.isMesh && child.userData?.isKarbandi);
  const coverMeshes = () => scene.wallSystemRoot().children.filter((child) => child.isMesh && child.userData?.isKarbandiCover);
  const visible = (items) => items.filter((item) => item.visible);
  const ribs = ribMeshes();
  const covers = coverMeshes();
  const referenceRib = ribs.find((rib) => rib.userData.isKarbandiReference);
  const supportRib = ribs.find((rib) => rib.userData.isKarbandiClosestWallSupport);

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
  assert.notEqual(referenceRib.material.color.getHex(), normalRibColor);
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

test('manual Karbandi clipping advances through successive junctions and prunes detached components', () => {
  const building = normalizeBuilding({ width: 4, depth: 2, height: 6, wallThickness: 0.35, openingWidth: 4 });
  const wallsForSteps = (steps) => normalizeWallSystem({
    ...DEFAULT_WALL_SYSTEM,
    bricks: { ...DEFAULT_WALL_SYSTEM.bricks, enabled: false },
    ahang: { enabled: false },
    karbandi: {
      ...DEFAULT_WALL_SYSTEM.karbandi,
      enabled: true,
      autoClip: false,
      manualCuts: [{ ribIndex: 0, side: 'left', steps }],
    },
  }, building);
  const visibleRange = (steps) => {
    const group = buildWallSystem(building, wallsForSteps(steps));
    let rib = null;
    group.traverse((object) => {
      if (object.userData?.karbandiRibIndex === 0 && object.userData?.isKarbandiCover !== true) rib = object;
    });
    return rib.userData;
  };
  const firstCut = visibleRange(1);
  const secondCut = visibleRange(2);
  assert.equal(firstCut.karbandiManualCuts.left, 1);
  assert.equal(secondCut.karbandiManualCuts.left, 2);
  assert.ok(secondCut.karbandiVisibleRange[0] > firstCut.karbandiVisibleRange[0]);

  const normalized = normalizeWallSystem({
    karbandi: {
      manualCuts: [
        { ribIndex: 3, side: 'right' },
        { ribIndex: 3, side: 'right', steps: 2 },
      ],
    },
  });
  assert.deepEqual(normalized.karbandi.manualCuts, [{ ribIndex: 3, side: 'right', steps: 3 }]);

  const roofGroup = buildWallSystemWithCanvasMock(building, normalizeWallSystem({
    ...wallsForSteps(2),
    karbandi: { ...wallsForSteps(2).karbandi, coverEnabled: true },
  }, building));
  const renderedRanges = roofGroup.children
    .filter((object) => object.isMesh && object.userData?.isKarbandi && !object.userData?.isKarbandiCover)
    .map((rib) => ({
      ribIndex: rib.userData.karbandiRibIndex,
      start: rib.userData.karbandiVisibleRange[0],
      end: rib.userData.karbandiVisibleRange[1],
    }));
  const renderedIndexes = [...new Set(renderedRanges.map(({ ribIndex }) => ribIndex))].sort((a, b) => a - b);
  assert.equal(roofGroup.userData.karbandiRoofTopologyUsesVisibleRibsOnly, true);
  assert.ok(roofGroup.userData.karbandiRoofTopologyRibIndexes.every(
    (ribIndex) => renderedIndexes.includes(ribIndex),
  ), 'roof topology must never include a rib that is not rendered');
  roofGroup.userData.karbandiRoofTopologyRibRanges.forEach((roofRange) => {
    assert.ok(renderedRanges.some((renderedRange) => (
      renderedRange.ribIndex === roofRange.ribIndex
      && Math.abs(renderedRange.start - roofRange.start) < 0.000001
      && Math.abs(renderedRange.end - roofRange.end) < 0.000001
    )), 'roof topology must use the same retained interval as its rendered rib');
  });
  assert.ok(roofGroup.userData.karbandiDetachedRibsRemoved.every(
    (ribIndex) => !roofGroup.userData.karbandiRoofTopologyRibIndexes.includes(ribIndex),
  ), 'detached/deleted ribs must not divide the roof topology');

  const adjacency = new Map([
    [0, new Set([1])],
    [1, new Set([0])],
    [2, new Set([3])],
    [3, new Set([2])],
  ]);
  assert.deepEqual([...wallConnectedRibIndexes(adjacency, [0])].sort(), [0, 1]);
});

test('automatic Karbandi clipping can be applied and reset independently of portal clipping', () => {
  const building = normalizeBuilding({ width: 4, depth: 2, height: 6, wallThickness: 0.35, openingWidth: 4 });
  const build = (autoClip) => buildWallSystem(building, normalizeWallSystem({
    ...DEFAULT_WALL_SYSTEM,
    bricks: { ...DEFAULT_WALL_SYSTEM.bricks, enabled: false },
    ahang: { enabled: false },
    karbandi: { ...DEFAULT_WALL_SYSTEM.karbandi, enabled: true, autoClip },
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
  assert.ok(sideWallCuts.length > 0);
  sideWallCuts.forEach((cut) => {
    assert.ok(
      automatic.userData.karbandiHighlightedWallSupportRibIndexes.includes(cut.supportRibIndex),
      'a non-nearest east/west leg must trim at its first junction with a highlighted support rib',
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
  const unsupportedLegCuts = automatic.userData.karbandiAutomaticHangingClipIntervals.filter(
    (interval) => interval.clippedToWallSupportedRib,
  );
  assert.equal(
    unsupportedLegCuts.length,
    automatic.userData.karbandiAutomaticHangingClipIntervals.length,
    'every hanging leg must target a closest wall-supported rib',
  );
  assert.ok(unsupportedLegCuts.length > 0);
  assert.ok(unsupportedLegCuts.every(({ supportRibIndex }) => (
    supportRibIndex != null && wallSupportedRibIndexes.has(supportRibIndex)
  )), 'hanging legs must clip at a junction with a closest wall-supported rib');
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
    rib.userData.karbandiClosestWallSupportLegs.every((leg) => !rib.userData.karbandiPortalCuts.includes(leg.side))
  )), 'each exact nearest-wall support leg must remain uncut by the automatic frame');
  assert.equal(reset.userData.karbandiAutoClipSupportFrame, null);
  assert.deepEqual(reset.userData.karbandiHighlightedWallSupportRibIndexes, []);
  const highlightScene = Object.create(MehrazScene.prototype);
  highlightScene.buildingGroup = new THREE.Group();
  highlightScene.buildingGroup.add(automatic);
  highlightScene.walls = normalizeWallSystem({
    ...DEFAULT_WALL_SYSTEM,
    ahang: { enabled: false },
    karbandi: { ...DEFAULT_WALL_SYSTEM.karbandi, enabled: true, autoClip: true },
  }, building);
  highlightScene.karbandiReferenceEditing = true;
  MehrazScene.prototype.updateKarbandiReferenceHighlight.call(highlightScene);
  assert.ok(automaticRibs.filter((rib) => rib.userData.isKarbandiClosestWallSupport)
    .every((rib) => rib.material.color.getHexString() === 'ff6b35'));
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
    assert.ok(cutRib, 'a hanging-foot clip must retain the inward part of its rib');
    const retainedBoundary = cut.side === 'left'
      ? cutRib.userData.karbandiVisibleRange[0]
      : cutRib.userData.karbandiVisibleRange[1];
    const junctionBoundary = cut.side === 'left' ? cut.end : cut.start;
    assert.ok(Math.abs(retainedBoundary - junctionBoundary) < 0.001,
      'the removed interval must run from the outer foot to the first junction');
  });
  assert.ok(resetRibs.length > 0);
  assert.deepEqual(
    [...new Set(automaticRibs.map((rib) => rib.userData.karbandiRibIndex))].sort((a, b) => a - b),
    [...new Set(resetRibs.map((rib) => rib.userData.karbandiRibIndex))].sort((a, b) => a - b),
    'interval clipping must retain every rib index instead of deleting the whole rib',
  );
  assert.ok(automaticRibs.every((rib) => rib.userData.karbandiRibComponentCount === 1),
    'auto clipping must keep one continuous inward span instead of restoring wall-side fragments');
  assert.ok(resetRibs.every((rib) => rib.userData.karbandiPortalCuts.length === 0));
  assert.ok(resetRibs.every((rib) => rib.material.clippingPlanes.length > 0), 'reset must preserve clipping at the wall planes');
  assert.equal(normalizeWallSystem({ karbandi: { enabled: true } }).karbandi.autoClip, true);
});

test('new Mehraz projects use the requested architectural defaults', () => {
  const walls = normalizeWallSystem();
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
  assert.equal(walls.stoneBase.enabled, true);
  assert.equal(walls.stoneBase.height, 1);
  assert.equal(walls.stoneBase.slabWidth, 0.6);
  assert.equal(walls.stoneBase.color, '#b7a68a');
  assert.equal(walls.stoneBase.mortar, 0.001);
  assert.equal(walls.stoneBase.mortarColor, '#9a8f7e');
  assert.equal(walls.interiorGypsum.enabled, false);
  assert.equal(walls.interiorGypsum.color, '#f1eee7');
  assert.equal(walls.karbandi.span, 4.1);
  assert.equal(walls.karbandi.ribColor, '#3490b7');
  assert.equal(walls.karbandi.referenceRibColor, '#ffd400');
  assert.equal(walls.karbandi.web.infillBrickColor, '#e5d41f');
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

test('rib count snaps reference Z to the first rotated leg-base centerline coincidence', () => {
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
    assert.ok(referenceLegBase.distanceTo(rotatedOpposite) < 0.000002);
  });
  assert.notEqual(
    karbandiReferenceZForRibCount({ ...DEFAULT_WALL_SYSTEM.karbandi, ribCount: 8 }),
    karbandiReferenceZForRibCount({ ...DEFAULT_WALL_SYSTEM.karbandi, ribCount: 12 }),
  );

  const twentyRibs = { ...DEFAULT_WALL_SYSTEM.karbandi, ribCount: 20, span: 4.1, referenceAngle: 180 };
  const limitedZ = karbandiReferenceZForRibCount(twentyRibs, 8);
  const legBase = new THREE.Vector3(twentyRibs.span / 2, 0, limitedZ);
  const oppositeLegBase = new THREE.Vector3(-twentyRibs.span / 2, 0, limitedZ);
  const matchingCopy = Array.from({ length: twentyRibs.ribCount - 1 }, (_, index) => index + 1)
    .find((copyIndex) => legBase.distanceTo(
      oppositeLegBase.clone().applyAxisAngle(
        new THREE.Vector3(0, 1, 0),
        Math.PI * 2 * copyIndex / twentyRibs.ribCount,
      ),
    ) < 0.000002);
  assert.equal(matchingCopy, 2, '20 ribs must use the first leg-base match that fits inside an 8 m depth');
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
  assert.equal(normalizedLow.karbandi.referenceZ, 0.001);
  assert.equal(normalizedHigh.karbandi.referenceZ, shallowDepth - 0.001);
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
    { ribCount: 10 },
    { referenceAngle: 150 },
    { groupRotationY: 12 },
    { groupScale: 1.1 },
  ].forEach((patch) => {
    const karbandi = { ...DEFAULT_WALL_SYSTEM.karbandi, ...patch, enabled: true };
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
  ['red', 'green'].forEach((color) => {
    const centers = guides.children.filter((child) => child.userData.archConstructionRole === `${color}-center`);
    const circles = guides.children.filter((child) => child.userData.archConstructionRole === `${color}-circle`);
    assert.equal(centers.length, 2);
    assert.equal(circles.length, 2);
    assert.ok(circles.every((circle) => circle.material.opacity === 0.5));
    assert.ok(Math.abs(centers[0].position.x + centers[1].position.x) < 0.000001);
    assert.equal(centers[0].position.y, centers[1].position.y);
    assert.equal(circles[0].userData.archConstructionRadius, circles[1].userData.archConstructionRadius);
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
  const group = buildWallSystem(building, walls);
  assert.equal(group.userData.karbandiHiddenCornerGuideCount, 2);
  assert.equal(group.userData.karbandiCornerGuideConstraint, 'hidden-wall-connected-left-right-rib-profiles');
  assert.equal(group.userData.karbandiCornerGuides.length, 2);
  group.userData.karbandiCornerGuides.forEach((guide) => {
    assert.match(guide.label, /^south-/);
    assert.ok(guide.adjacentRibIds.length >= 2);
    assert.notEqual(guide.leftRibId, guide.rightRibId);
    assert.equal(guide.profileConstraint, 'weighted-wall-connected-left-right-rib-profiles');
    assert.equal(guide.wallConnectedRibsOnly, true);
    assert.equal(guide.guideBlend, 0.5);
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
  const adjustedGuideGroup = buildWallSystem(building, {
    ...walls,
    karbandi: {
      ...walls.karbandi,
      web: {
        ...walls.karbandi.web,
        southWestGuideBlend: 0.2,
        southEastGuideBlend: 0.8,
      },
    },
  });
  const adjustedGuides = adjustedGuideGroup.userData.karbandiCornerGuides;
  assert.equal(adjustedGuides.find((guide) => guide.label === 'south-west').guideBlend, 0.2);
  assert.equal(adjustedGuides.find((guide) => guide.label === 'south-east').guideBlend, 0.8);
  assert.ok(adjustedGuides.every((guide) => guide.wallConnectedRibsOnly));
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
    if (!panel.userData.webFourRibRegion) {
      assert.ok(['three-curve-transfinite', 'four-edge-inward-courses', 'small-four-edge-cap'].includes(panel.userData.webPatchSolver));
      assert.equal(panel.userData.webFourRibBoundaryMode, null);
      assert.equal(panel.userData.webRegionNormalMode, 'vertex-surface-normal');
      assert.equal(panel.userData.roofBrickMapping, 'world-aligned');
      assert.equal(panel.userData.webPatchInvertedTriangleCount, 0);
      const positions = panel.geometry.getAttribute('position');
      const surfaceCount = panel.userData.webPatchSurfaceVertexCount;
      for (let index = 0; index < surfaceCount; index += 1) {
        const extrusion = new THREE.Vector3(
          positions.getX(index) - positions.getX(index + surfaceCount),
          positions.getY(index) - positions.getY(index + surfaceCount),
          positions.getZ(index) - positions.getZ(index + surfaceCount),
        );
        assert.ok(Math.abs(extrusion.length() - walls.karbandi.web.roofThickness) < 0.00001);
      }
      return;
    }
    assert.ok([
      'four-rib-centerline-intersections-red-polyline',
      'small-four-rib-centerline-intersection-purple-polyline',
      'four-visible-rib-seat-boundary',
    ].includes(panel.userData.webFourRibBoundaryMode));
    assert.ok(['four-edge-inward-courses', 'small-four-edge-cap'].includes(panel.userData.webPatchSolver));
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
    assert.equal(panel.userData.webWallTopAnchoredCorners, 0);
    assert.equal(panel.userData.webRegionNormalMode, 'best-fit-four-rib-region-90-degree');
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
      assert.ok(extrusion.clone().normalize().distanceTo(extrusionNormal) < 0.00001);
    }
  });
  const smallIntersectionPanels = interiorPanels.filter((panel) => (
    panel.userData.webFourRibBoundaryMode === 'small-four-rib-centerline-intersection-purple-polyline'
  ));
  assert.ok(smallIntersectionPanels.length > 0);
  smallIntersectionPanels.forEach((panel) => {
    const corners = panel.userData.webRegionCorners.map(([x, y, z]) => new THREE.Vector3(x, y, z));
    const boundary = panel.userData.webRegionBoundary.map(([x, y, z]) => new THREE.Vector3(x, y, z));
    boundary.forEach((point) => {
      const distanceToPurplePolyline = Math.min(...corners.map((corner, index) => {
        const next = corners[(index + 1) % corners.length];
        const direction = next.clone().sub(corner);
        const denominator = direction.lengthSq();
        const progress = denominator > 0
          ? THREE.MathUtils.clamp(point.clone().sub(corner).dot(direction) / denominator, 0, 1)
          : 0;
        return point.distanceTo(corner.clone().addScaledVector(direction, progress));
      }));
      assert.ok(distanceToPurplePolyline < 0.00001);
    });
  });
  assert.ok(interiorPanels.some((panel) => panel.userData.roofBrickMapping === 'offset-rib-courses'));
  ['east', 'west'].forEach((side) => {
    const panel = perimeterPanels.find((candidate) => candidate.userData.wallContinuationSide === side);
    assert.ok(panel, `${side} Karbandi wall continuation must exist`);
    const positions = panel.geometry.getAttribute('position');
    const uvs = panel.geometry.getAttribute('uv');
    const expectedSign = side === 'west' ? -1 : 1;
    assert.equal(panel.userData.wallContinuationUAxis, side === 'west' ? '-world-z' : '+world-z');
    for (let index = 0; index < positions.count; index += 1) {
      assert.ok(Math.abs(uvs.getX(index) - expectedSign * positions.getZ(index)) < 0.00001, `${side} continuation must match its wall-facing bond direction`);
    }
  });
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
    assert.equal(panel.userData.southCornerGuideProfileConstraint, 'weighted-wall-connected-left-right-rib-profiles');
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
    assert.equal(panel.userData.webPerimeterRibBoundaryMode, 'rib-centerlines-with-wall-support-boundary');
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
  thicknessPanels.forEach((panel) => assert.equal(panel.userData.roofThickness, 0.05));
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
  assert.ok(panels.some((panel) => panel.userData.webPatchSolver === 'boundary-constrained-polygon'));
  assert.ok(panels.some((panel) => panel.userData.webPatchReplacedInvertedTriangleCount > 0));
  assert.ok(panels.every((panel) => panel.userData.webPatchInvertedTriangleCount === 0));
  panels.forEach((panel) => {
    const positions = panel.geometry.getAttribute('position');
    for (let index = 0; index < positions.count; index += 1) {
      assert.ok(Number.isFinite(positions.getX(index)));
      assert.ok(Number.isFinite(positions.getY(index)));
      assert.ok(Number.isFinite(positions.getZ(index)));
    }
  });
});
