import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeBuilding } from './mehraz-scene.js';
import { DEFAULT_WALL_SYSTEM, normalizeWallSystem, portalDefaultWallSystem } from './wall-system.js';
import {
  createDefaultCombinationProfile,
  defaultCombinationSelection,
  lastCombinationSelection,
  loadCombinationProfile,
  saveCombinationProfile,
  settingsCombination,
  settingsCombinationKey,
} from './combination-profiles.js';

test('combination keys include building type, transition, and cover', () => {
  assert.equal(settingsCombinationKey({ buildingType: 'hall', transition: 'karbandi', cover: 'barrel' }), 'hall::karbandi::barrel');
  assert.deepEqual(settingsCombination(
    normalizeBuilding({ type: 'room', buildingType: 'hall', hallTransitionType: 'pendentive', hallCoverType: 'barrel' }),
    DEFAULT_WALL_SYSTEM,
  ), { buildingType: 'hall', transition: 'pendentive', cover: 'barrel' });
});

test('every new building type starts with no transition, no cover, and no hinted openings', () => {
  for (const buildingType of ['portal', 'room', 'hall', 'grid']) {
    const selection = defaultCombinationSelection(buildingType);
    assert.deepEqual(selection, { buildingType, transition: 'none', cover: 'none' });
    const profile = createDefaultCombinationProfile(selection);
    assert.deepEqual(settingsCombination(profile.building, profile.walls), selection);
    assert.equal(profile.walls.southOpenings.door.enabled, false);
    assert.equal(profile.walls.southOpenings.window.enabled, false);
    assert.equal(profile.walls.roomPlanOpenings.length, 0);
    Object.values(profile.walls.roomWallOpenings).forEach((openings) => {
      assert.equal(openings.door.enabled, false);
      assert.equal(openings.window.enabled, false);
    });
  }
  const vestibule = createDefaultCombinationProfile(defaultCombinationSelection('vestibule'));
  assert.deepEqual(settingsCombination(vestibule.building, vestibule.walls), {
    buildingType: 'vestibule', transition: 'none', cover: 'none',
  });
  assert.equal(vestibule.walls.roomPlanOpenings.length, 4);
});

test('Grid has an independent Hall-derived default profile', () => {
  const profile = createDefaultCombinationProfile({ buildingType: 'grid', transition: 'karbandi', cover: 'dome' });
  assert.equal(profile.building.buildingType, 'grid');
  assert.equal(profile.building.roomPlanShape, 'square');
  assert.deepEqual(profile.building.gridBaySpansX, Array(9).fill(4));
  assert.deepEqual(profile.building.gridBaySpansY, Array(9).fill(4));
  assert.equal(profile.building.gridStageEditEnabled, true);
  assert.equal(profile.building.gridRemovedBays.length, 81);
  assert.ok(profile.building.gridRemovedBays.includes('0:0'));
  assert.ok(profile.building.gridRemovedBays.includes('8:8'));
  assert.deepEqual(settingsCombination(profile.building, profile.walls), {
    buildingType: 'grid', transition: 'karbandi', cover: 'dome',
  });
});

test('Vestibule defaults to six-by-six metres, four metres high, with four cardinal two-metre arched doors', () => {
  const profile = createDefaultCombinationProfile({
    buildingType: 'vestibule', transition: 'karbandi', cover: 'dome',
  });
  assert.equal(profile.building.width, 6);
  assert.equal(profile.building.length, 6);
  assert.equal(profile.building.depth, 6);
  assert.equal(profile.building.height, 4);
  assert.equal(profile.walls.roomPlanOpenings.length, 4);
  assert.deepEqual(
    profile.walls.roomPlanOpenings.map((opening) => opening.rotation),
    [0, 90, 180, 270],
  );
  profile.walls.roomPlanOpenings.forEach((opening) => {
    assert.equal(opening.type, 'door');
    assert.equal(opening.width, 2);
    assert.equal(opening.sillHeight, 0);
    assert.equal(opening.head, 'arch');
  });
});

test('each combination restores its own complete settings snapshot', () => {
  const portal = normalizeBuilding({ height: 8.5, wallColor: '#112233' });
  const blankPortalWalls = portalDefaultWallSystem({ ...DEFAULT_WALL_SYSTEM, color: '#445566' }, portal);
  const portalWalls = normalizeWallSystem({
    ...blankPortalWalls,
    portalTransition: 'karbandi',
    karbandi: { ...blankPortalWalls.karbandi, enabled: true },
  }, portal);
  let store = saveCombinationProfile(null, portal, portalWalls);

  const hallBarrel = normalizeBuilding({
    type: 'room', buildingType: 'hall', hallTransitionType: 'pendentive', hallCoverType: 'barrel',
    height: 4.25, hallGridX: 5, hallBarrelAxis: 'y',
  });
  const hallWalls = normalizeWallSystem({ ...DEFAULT_WALL_SYSTEM, color: '#abcdef' }, hallBarrel);
  store = saveCombinationProfile(store, hallBarrel, hallWalls);

  const restoredPortal = loadCombinationProfile(store, { buildingType: 'portal', transition: 'karbandi', cover: 'none' });
  assert.equal(restoredPortal.building.height, 8.5);
  assert.equal(restoredPortal.walls.color, '#445566');

  const restoredHall = loadCombinationProfile(store, { buildingType: 'hall', transition: 'pendentive', cover: 'barrel' });
  assert.equal(restoredHall.building.height, 4.25);
  assert.equal(restoredHall.building.hallGridX, 5);
  assert.equal(restoredHall.building.hallBarrelAxis, 'y');
  assert.equal(restoredHall.walls.color, '#abcdef');
  assert.deepEqual(lastCombinationSelection(store, 'hall'), { buildingType: 'hall', transition: 'pendentive', cover: 'barrel' });
});

test('an unseen combination starts from its own default instead of another profile', () => {
  const customized = normalizeBuilding({
    type: 'room', buildingType: 'room', domeTransition: 'karbandi', domeCoverType: 'dome',
    height: 12, domeColor: '#ff0000',
  });
  const walls = normalizeWallSystem({ ...DEFAULT_WALL_SYSTEM, color: '#00ff00' }, customized);
  const store = saveCombinationProfile(null, customized, walls);

  const unseen = loadCombinationProfile(store, { buildingType: 'room', transition: 'squinch', cover: 'cone' });
  const expected = createDefaultCombinationProfile({ buildingType: 'room', transition: 'squinch', cover: 'cone' });
  assert.equal(unseen.building.height, expected.building.height);
  assert.equal(unseen.building.domeColor, expected.building.domeColor);
  assert.equal(unseen.walls.color, expected.walls.color);
  assert.notEqual(unseen.building.height, 12);
  assert.notEqual(unseen.walls.color, '#00ff00');
});

test('Room dome controls stay isolated while two-layer combinations retain their fixed main dome', () => {
  const squinchDome = normalizeBuilding({
    type: 'room', buildingType: 'room', domeTransition: 'squinch', domeCoverType: 'dome',
    domePatternCoverage: 61,
    domeColor: '#1122aa',
    domeArch: { greenOffset: 0.55, greenHeightOffset: -1.1 },
  });
  const squinchWalls = normalizeWallSystem(DEFAULT_WALL_SYSTEM, squinchDome);
  let store = saveCombinationProfile(null, squinchDome, squinchWalls);

  const karbandiDome = normalizeBuilding({
    type: 'room', buildingType: 'room', domeTransition: 'karbandi', domeCoverType: 'dome',
    domePatternCoverage: 92,
    domeColor: '#aa2211',
    domeArch: { greenOffset: 1.25, greenHeightOffset: -2.4 },
  });
  store = saveCombinationProfile(store, karbandiDome, normalizeWallSystem(DEFAULT_WALL_SYSTEM, karbandiDome));

  const restored = loadCombinationProfile(store, { buildingType: 'room', transition: 'squinch', cover: 'dome' });
  assert.equal(restored.building.buildingType, 'room');
  assert.equal(restored.building.domeTransition, 'squinch');
  assert.equal(restored.building.domePatternCoverage, 61);
  assert.equal(restored.building.domeColor, '#1122aa');
  assert.equal(restored.building.innerDomeEnabled, true);
  assert.equal(restored.building.domeArch.archType, 'two-point');
  assert.equal(restored.building.domeArch.redOffset, 0);
  assert.equal(restored.building.domeArch.greenOffset, 2);
  assert.equal(restored.building.domeArch.greenHeightOffset, -2);
  assert.equal(restored.building.domeCenterOpeningEnabled, false);

  const restoredSingleLayer = loadCombinationProfile(store, { buildingType: 'room', transition: 'karbandi', cover: 'dome' });
  assert.equal(restoredSingleLayer.building.innerDomeEnabled, false);
  assert.equal(restoredSingleLayer.building.domeArch.greenOffset, 1.25);
  assert.equal(restoredSingleLayer.building.domeArch.greenHeightOffset, -2.4);
});

test('direct-bearing room combinations remain distinct and valid', () => {
  const profile = createDefaultCombinationProfile(
    { buildingType: 'room', transition: 'direct', cover: 'cone' },
    normalizeBuilding({ type: 'room', buildingType: 'room', roomPlanShape: 'circle' }),
  );
  assert.equal(profile.building.roomPlanShape, 'circle');
  assert.deepEqual(settingsCombination(profile.building, profile.walls), {
    buildingType: 'room', transition: 'direct', cover: 'cone',
  });
});

test('Inner dome can be enabled for direct-bearing and no-transition Dome covers', () => {
  const direct = normalizeBuilding({
    type: 'room', buildingType: 'room', roomPlanShape: 'circle', domeTransition: 'none', domeCoverType: 'dome',
    innerDomeEnabledByTransition: { direct: true },
  });
  assert.equal(direct.innerDomeEnabled, true);
  assert.equal(direct.innerDomeEnabledByTransition.direct, true);

  const noTransition = normalizeBuilding({
    type: 'room', buildingType: 'room', roomPlanShape: 'square', domeTransition: 'none', domeCoverType: 'dome',
    innerDomeEnabledByTransition: { none: true },
  });
  assert.equal(noTransition.innerDomeEnabled, true);
  assert.equal(noTransition.innerDomeEnabledByTransition.none, true);
});

test('new Hall Karbandi profiles use one leg and the Hall vault arch construction', () => {
  const profile = createDefaultCombinationProfile({
    buildingType: 'hall',
    transition: 'karbandi',
    cover: 'dome',
  });
  assert.equal(profile.walls.karbandi.wallLegMode, 'one');
  for (const field of ['archType', 'redOffset', 'greenOffset', 'greenHeightOffset']) {
    assert.equal(profile.walls.karbandi[field], profile.building.hallArch[field]);
  }
  assert.equal(profile.building.hallDomeArch.archType, 'one-point');
  assert.equal(profile.building.hallDomeArch.greenOffset, 0.05);
  assert.equal(profile.building.hallDomeArch.greenHeightOffset, -2);
  assert.equal(profile.building.hallDomeArch.greenOffsetAuto, false);
  assert.equal(profile.building.hallDomeArch.greenHeightAuto, false);
  assert.equal(profile.building.domePatternCoverage, 85);
  assert.equal(profile.building.domeCenterOpeningEnabled, false);
  assert.equal(profile.building.domeColor, '#49b5ca');
  assert.equal(profile.building.hallDomeGuideVisible, false);
});

test('Octagon and Circle Room Dome defaults use the standard two-point main dome profile', () => {
  for (const roomPlanShape of ['octagon', 'circle']) {
    const profile = createDefaultCombinationProfile(
      { buildingType: 'room', transition: 'direct', cover: 'dome' },
      normalizeBuilding({ type: 'room', buildingType: 'room', roomPlanShape }),
    );
    assert.equal(profile.building.roomPlanShape, roomPlanShape);
    assert.equal(profile.building.domeArch.archType, 'two-point');
    assert.equal(profile.building.domeArch.redOffset, 0);
    assert.equal(profile.building.domeArch.redRadius, null);
    assert.equal(profile.building.domeArch.greenOffset, 1.4);
    assert.equal(profile.building.domeArch.greenHeightOffset, -1.45);
    assert.equal(profile.building.domeCenterOpeningEnabled, false);
  }
});

test('Square Room Karbandi can remain uncovered until Dome is explicitly selected', () => {
  for (const cover of ['none', 'dome']) {
    const profile = createDefaultCombinationProfile({
      buildingType: 'room',
      transition: 'karbandi',
      cover,
    });
    assert.equal(profile.building.roomPlanShape, 'square');
    assert.equal(profile.building.domeTransition, 'karbandi');
    assert.equal(profile.building.domeCoverType, cover);
    assert.equal(profile.building.domeEnabled, true, 'the transition assembly remains enabled without an upper cover');
    assert.deepEqual(settingsCombination(profile.building, profile.walls), {
      buildingType: 'room', transition: 'karbandi', cover,
    });
  }
});
