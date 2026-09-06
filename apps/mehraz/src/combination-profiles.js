import { buildingForSelectedType, normalizeBuilding } from './mehraz-scene.js';
import {
  DEFAULT_WALL_SYSTEM,
  normalizeWallSystem,
  portalDefaultWallSystem,
  solveKarbandiWallSeating,
  vestibulePlanOpeningsWithDefaultDoors,
} from './wall-system.js';

const BUILDING_TYPES = new Set(['portal', 'room', 'vestibule', 'hall', 'grid']);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function settingsCombination(building, walls) {
  const buildingType = BUILDING_TYPES.has(building?.buildingType)
    ? building.buildingType
    : building?.type === 'room' ? 'room' : 'portal';
  if (buildingType === 'portal') {
    return {
      buildingType,
      transition: walls?.portalTransition || (walls?.karbandi?.enabled ? 'karbandi' : 'none'),
      cover: walls?.portalCover || (walls?.ahang?.enabled ? 'ahang' : 'none'),
    };
  }
  if (['hall', 'grid'].includes(buildingType)) {
    return {
      buildingType,
      transition: building?.hallTransitionType || 'none',
      cover: building?.hallCoverType || 'none',
    };
  }
  return {
    buildingType,
    transition: buildingType === 'vestibule'
      ? building?.domeTransition === 'none' ? 'none' : 'karbandi'
      : building?.domeTransition || 'none',
    cover: building?.domeCoverType || 'none',
  };
}

export function settingsCombinationKey(selection) {
  return `${selection.buildingType}::${selection.transition}::${selection.cover}`;
}

export function defaultCombinationSelection(buildingType) {
  return { buildingType: BUILDING_TYPES.has(buildingType) ? buildingType : 'portal', transition: 'none', cover: 'none' };
}

export function createDefaultCombinationProfile(selection, contextBuilding = null) {
  const selected = { ...defaultCombinationSelection(selection?.buildingType), ...selection };
  const base = normalizeBuilding();
  let building = buildingForSelectedType(base, selected.buildingType, DEFAULT_WALL_SYSTEM.extraHeights);
  if (['hall', 'grid'].includes(selected.buildingType)) {
    const emptyGridBays = selected.buildingType === 'grid'
      ? Array.from({ length: building.hallGridX }, (_, ix) => (
        Array.from({ length: building.hallGridY }, (_, iy) => `${ix}:${iy}`)
      )).flat()
      : [];
    building = normalizeBuilding({
      ...building,
      hallTransitionType: selected.transition,
      domeTransition: selected.transition,
      hallCoverType: selected.cover,
      domeEnabled: selected.cover === 'dome',
      hallTransitionEnabled: selected.transition !== 'none' && !['barrel', 'rib-vault', 'raised-rib-vault'].includes(selected.cover),
      gridRemovedBays: emptyGridBays,
      ...(selected.transition === 'karbandi' && selected.cover === 'dome' ? {
        hallDomeArch: {
          ...building.hallDomeArch,
          archType: 'one-point',
          greenOffset: 0.05,
          greenHeightOffset: -2,
          greenOffsetAuto: false,
          greenHeightAuto: false,
        },
        domePatternCoverage: 85,
        domeCenterOpeningEnabled: false,
        domeColor: '#49b5ca',
        hallDomeGuideVisible: false,
      } : {}),
    });
  } else if (selected.buildingType === 'portal') {
    building = normalizeBuilding({
      ...building,
      domeEnabled: selected.cover === 'dome',
      domeCoverType: selected.cover === 'dome' ? 'dome' : building.domeCoverType,
    });
  } else {
    const directRoomPlanShape = selected.transition === 'direct'
      ? ((contextBuilding?.roomPlanShape || 'square') === 'square' ? 'octagon' : contextBuilding.roomPlanShape)
      : building.roomPlanShape;
    building = normalizeBuilding({
      ...building,
      roomPlanShape: directRoomPlanShape,
      domeTransition: selected.buildingType === 'vestibule' && selected.transition !== 'none' ? 'karbandi' : selected.transition,
      domeCoverType: selected.cover,
      domeEnabled: selected.cover !== 'none',
      ...(selected.transition === 'direct' && selected.cover === 'dome' ? {
        domeArch: {
          ...building.domeArch,
          archType: 'two-point',
          redOffset: 0,
          redRadius: null,
          greenOffset: 1.4,
          greenHeightOffset: -1.45,
        },
        domeCenterOpeningEnabled: false,
      } : {}),
    });
  }

  const defaultWallSystem = ['hall', 'grid'].includes(selected.buildingType)
    ? {
      ...DEFAULT_WALL_SYSTEM,
      karbandi: {
        ...DEFAULT_WALL_SYSTEM.karbandi,
        wallLegMode: 'one',
        archType: building.hallArch.archType,
        redOffset: building.hallArch.redOffset,
        greenOffset: building.hallArch.greenOffset,
        greenHeightOffset: building.hallArch.greenHeightOffset,
      },
    }
    : DEFAULT_WALL_SYSTEM;
  let walls = selected.buildingType === 'portal'
    ? portalDefaultWallSystem(DEFAULT_WALL_SYSTEM, building)
    : normalizeWallSystem({
      ...defaultWallSystem,
      roomPlanOpenings: selected.buildingType === 'vestibule'
        ? vestibulePlanOpeningsWithDefaultDoors(
          DEFAULT_WALL_SYSTEM.roomPlanOpenings,
          `default-${settingsCombinationKey(selected)}`,
        )
        : [],
    }, building);
  if (selected.buildingType === 'portal') {
    walls = normalizeWallSystem({
      ...walls,
      portalTransition: selected.transition,
      portalCover: selected.cover,
      karbandi: { ...walls.karbandi, enabled: selected.transition === 'karbandi' },
      ahang: { ...walls.ahang, enabled: selected.cover === 'ahang' },
    }, building);
    if (selected.transition === 'karbandi') {
      walls = normalizeWallSystem({
        ...walls,
        karbandi: {
          ...walls.karbandi,
          ...solveKarbandiWallSeating(walls.karbandi, building, walls),
          enabled: true,
        },
      }, building);
    }
  }
  return { building, walls };
}

export function saveCombinationProfile(store, building, walls) {
  const selection = settingsCombination(building, walls);
  const key = settingsCombinationKey(selection);
  return {
    profiles: {
      ...(store?.profiles || {}),
      [key]: { building: clone(normalizeBuilding(building)), walls: clone(normalizeWallSystem(walls, building)) },
    },
    activeByBuildingType: { ...(store?.activeByBuildingType || {}), [selection.buildingType]: key },
  };
}

export function loadCombinationProfile(store, selection, contextBuilding = null) {
  const key = settingsCombinationKey(selection);
  const saved = store?.profiles?.[key];
  if (!saved) return createDefaultCombinationProfile(selection, contextBuilding);
  const building = normalizeBuilding(saved.building);
  return { building, walls: normalizeWallSystem(saved.walls, building) };
}

export function lastCombinationSelection(store, buildingType) {
  const key = store?.activeByBuildingType?.[buildingType];
  const saved = key ? store?.profiles?.[key] : null;
  return saved ? settingsCombination(saved.building, saved.walls) : defaultCombinationSelection(buildingType);
}

export function normalizeCombinationProfileStore(value, currentBuilding = null, currentWalls = null) {
  let store = { profiles: {}, activeByBuildingType: {} };
  for (const profile of Object.values(value?.profiles || {})) {
    if (!profile?.building || !profile?.walls) continue;
    store = saveCombinationProfile(store, profile.building, profile.walls);
  }
  for (const buildingType of BUILDING_TYPES) {
    const requestedKey = value?.activeByBuildingType?.[buildingType];
    if (requestedKey && store.profiles[requestedKey]
      && settingsCombination(store.profiles[requestedKey].building, store.profiles[requestedKey].walls).buildingType === buildingType) {
      store.activeByBuildingType[buildingType] = requestedKey;
    }
  }
  if (currentBuilding && currentWalls) store = saveCombinationProfile(store, currentBuilding, currentWalls);
  return store;
}
