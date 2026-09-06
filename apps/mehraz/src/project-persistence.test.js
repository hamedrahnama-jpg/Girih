import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeBuilding } from './mehraz-scene.js';
import { DEFAULT_WALL_SYSTEM, normalizeWallSystem } from './wall-system.js';
import {
  createMehrazProjectPayload,
  MEHRAZ_PROJECT_SCHEMA_VERSION,
  normalizeMehrazProjectPayload,
  projectIdentityAfterStageAddition,
} from './project-persistence.js';
import { saveCombinationProfile } from './combination-profiles.js';

test('projects persist independent building-transition-cover profiles', () => {
  const room = normalizeBuilding({
    type: 'room', buildingType: 'room', domeTransition: 'karbandi', domeCoverType: 'dome', height: 7,
  });
  const roomWalls = normalizeWallSystem({ ...DEFAULT_WALL_SYSTEM, color: '#123456' }, room);
  let combinationProfiles = saveCombinationProfile(null, room, roomWalls);
  const hall = normalizeBuilding({
    type: 'room', buildingType: 'hall', hallTransitionType: 'karbandi', hallCoverType: 'barrel', height: 4,
  });
  const hallWalls = normalizeWallSystem({ ...DEFAULT_WALL_SYSTEM, color: '#654321' }, hall);
  combinationProfiles = saveCombinationProfile(combinationProfiles, hall, hallWalls);

  const constructionStepOrder = ['empty', 'hall-cover', 'lower-walls', 'hall-vaults', 'complete'];
  const stored = createMehrazProjectPayload({
    building: hall,
    walls: hallWalls,
    placements: [],
    combinationProfiles,
    constructionStepOrder,
  });
  const reopened = normalizeMehrazProjectPayload(JSON.parse(JSON.stringify(stored)));

  assert.equal(reopened.version, MEHRAZ_PROJECT_SCHEMA_VERSION);
  assert.equal(reopened.combinationProfiles.profiles['room::karbandi::dome'].building.height, 7);
  assert.equal(reopened.combinationProfiles.profiles['room::karbandi::dome'].walls.color, '#123456');
  assert.equal(reopened.combinationProfiles.profiles['hall::karbandi::barrel'].building.height, 4);
  assert.equal(reopened.combinationProfiles.profiles['hall::karbandi::barrel'].walls.color, '#654321');
  assert.ok(reopened.constructionStepOrder.indexOf('hall-cover') < reopened.constructionStepOrder.indexOf('lower-walls'));
});

test('First staged project starts a new composition save target', () => {
  const identity = projectIdentityAfterStageAddition({
    projectInstanceCount: 0,
    activeProjectAssetId: 'source-project',
    activeProjectVersionId: 'source-version',
    selectedProjectVersionId: 'source-version',
    projectName: 'Main hall',
  });

  assert.deepEqual(identity, {
    createsComposition: true,
    activeProjectAssetId: null,
    activeProjectVersionId: null,
    selectedProjectVersionId: '',
    projectName: 'Main hall composition',
  });
});

test('Additional staged projects keep the saved composition target', () => {
  const identity = projectIdentityAfterStageAddition({
    projectInstanceCount: 2,
    activeProjectAssetId: 'composition-project',
    activeProjectVersionId: 'composition-version',
    selectedProjectVersionId: 'composition-version',
    projectName: 'Complex courtyard',
  });

  assert.deepEqual(identity, {
    createsComposition: false,
    activeProjectAssetId: 'composition-project',
    activeProjectVersionId: 'composition-version',
    selectedProjectVersionId: 'composition-version',
    projectName: 'Complex courtyard',
  });
});

test('Room projects save and reopen with dome, transition, and independent bonds intact', () => {
  const building = normalizeBuilding({
    type: 'room',
    width: 5,
    length: 7,
    domeEnabled: true,
    domeTransition: 'karbandi',
    domeTransitionCoverEnabled: true,
    domeDrumHeight: 0.65,
    domeDrumHeightByTransition: { karbandi: 0.65 },
    domeExtraLegColor: '#3a8f5d',
    domeOuterLegExtensionByCoverType: { dome: 0.75 },
    domeOuterLegExtensionByTransitionAndCoverType: { karbandi: { dome: 0.75 } },
    domePatternCoverage: 72,
    domeArch: { redOffset: -0.4, greenOffset: 0.8, greenHeightOffset: 0.3 },
  });
  const walls = normalizeWallSystem({
    ...DEFAULT_WALL_SYSTEM,
    bricks: {
      ...DEFAULT_WALL_SYSTEM.bricks,
      sideBonds: {
        ...DEFAULT_WALL_SYSTEM.bricks.sideBonds,
        room_dome: { source: 'builtin', builtIn: 'stack', scale: 1, offsetU: 0, offsetV: 0 },
        room_dome_extra_leg: { source: 'builtin', builtIn: 'flemish', scale: 1, offsetU: 0, offsetV: 0 },
        room_dome_extra_leg_interior: { source: 'builtin', builtIn: 'stack', scale: 1, offsetU: 0, offsetV: 0 },
        room_dome_drum: { source: 'builtin', builtIn: 'flemish', scale: 1, offsetU: 0, offsetV: 0 },
        room_dome_drum_interior: { source: 'builtin', builtIn: 'stack', scale: 1, offsetU: 0, offsetV: 0 },
        room_dome_transition: { source: 'builtin', builtIn: 'running', scale: 1, offsetU: 0, offsetV: 0 },
      },
    },
    karbandi: { ...DEFAULT_WALL_SYSTEM.karbandi, ribCount: 18, referenceAngle: 150 },
    roomWallOpenings: {
      ...DEFAULT_WALL_SYSTEM.roomWallOpenings,
      north: {
        door: { ...DEFAULT_WALL_SYSTEM.roomWallOpenings.north.door, enabled: true, head: 'arch', width: 1.7 },
        window: { ...DEFAULT_WALL_SYSTEM.roomWallOpenings.north.window },
      },
      east: {
        door: { ...DEFAULT_WALL_SYSTEM.roomWallOpenings.east.door },
        window: { ...DEFAULT_WALL_SYSTEM.roomWallOpenings.east.window, enabled: true, width: 1.1 },
      },
    },
  }, building);

  const stored = createMehrazProjectPayload({
    building,
    walls,
    placements: [],
    projectInstances: [{
      id: 'instance-1',
      assetId: 'project-2',
      versionId: 'version-3',
      versionNumber: 3,
      name: 'Courtyard wing',
      payload: { app: 'mehraz', version: 6, building: { type: 'room', width: 4, length: 4 }, placements: [] },
      transform: { position: [8, 0, -2], rotation: [0, 45, 0], scale: [1.5, 1.5, 1.5] },
    }, {
      id: 'instance-2',
      assetId: 'project-4',
      versionId: 'version-5',
      versionNumber: 2,
      name: 'Entrance portal',
      payload: { app: 'mehraz', version: 6, building: { type: 'portal', width: 3, depth: 2 }, placements: [] },
      transform: { position: [-6, 0, 4], rotation: [0, 90, 0], scale: [0.8, 0.8, 0.8] },
    }],
    previewImage: 'data:image/webp;base64,room',
  });
  const reopened = normalizeMehrazProjectPayload(JSON.parse(JSON.stringify(stored)));

  assert.equal(stored.version, MEHRAZ_PROJECT_SCHEMA_VERSION);
  assert.equal(reopened.building.type, 'room');
  assert.equal(reopened.building.width, 5);
  assert.equal(reopened.building.length, 7);
  assert.equal(reopened.building.depth, 7);
  assert.equal(reopened.building.domeTransition, 'karbandi');
  assert.equal(reopened.building.domeTransitionCoverEnabled, true);
  assert.equal(reopened.building.domeDrumHeight, 0.65);
  assert.equal(reopened.building.domeArch.legExtension, 0.75);
  assert.equal(reopened.building.domeExtraLegColor, '#3a8f5d');
  assert.equal(reopened.building.domePatternCoverage, 72);
  assert.equal(reopened.walls.karbandi.ribCount, 20);
  assert.equal(reopened.walls.roomWallOpenings.north.door.enabled, true);
  assert.equal(reopened.walls.roomWallOpenings.north.door.width, 1.7);
  assert.equal(reopened.walls.roomWallOpenings.east.window.enabled, true);
  assert.equal(reopened.walls.bricks.sideBonds.room_dome.builtIn, 'stack');
  assert.equal(reopened.walls.bricks.sideBonds.room_dome_extra_leg.builtIn, 'flemish');
  assert.equal(reopened.walls.bricks.sideBonds.room_dome_extra_leg_interior.builtIn, 'stack');
  assert.equal(reopened.walls.bricks.sideBonds.room_dome_drum.builtIn, 'flemish');
  assert.equal(reopened.walls.bricks.sideBonds.room_dome_drum_interior.builtIn, 'stack');
  assert.equal(reopened.walls.bricks.sideBonds.room_dome_transition.builtIn, 'running');
  assert.equal(reopened.projectInstances.length, 2);
  assert.deepEqual(reopened.projectInstances[0].transform, {
    position: [8, 0, -2],
    rotation: [0, 45, 0],
    scale: [1.5, 1.5, 1.5],
  });
  assert.equal(reopened.projectInstances[0].payload.building.type, 'room');
  assert.equal(reopened.projectInstances[1].name, 'Entrance portal');
  assert.deepEqual(reopened.projectInstances[1].transform, {
    position: [-6, 0, 4],
    rotation: [0, 90, 0],
    scale: [0.8, 0.8, 0.8],
  });
  assert.ok(reopened.surfaces.some((surface) => surface.id === 'north_interior'));
  assert.ok(reopened.surfaces.some((surface) => surface.id === 'south_interior'));
});
