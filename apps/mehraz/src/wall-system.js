import * as THREE from 'three';
import {
  bearingVectorForSupportSides,
  buildRibBandQuads,
  buildWebTopology,
  extractSpringingBoundary,
  groupFaceBoundaryCurves,
  normalizeKarbandiWebOptions,
  polygonMostlyInsideRibBands,
} from './karbandi-web-topology.js';
import {
  buildRibCenterlines,
  ribCenterlineIntersectionRegion,
  ribCenteredPerimeterRegion,
} from './karbandi-four-rib-region.js';
import { buildStructuredWebPatch } from './karbandi-structured-patch.js';

export const WALL_SIDES = Object.freeze(['north', 'east', 'south', 'west']);
export const BRICK_BOND_SIDES = Object.freeze([
  'north', 'north_sides', 'north_top', 'east', 'south', 'west',
  'north_exterior', 'east_exterior', 'south_exterior', 'west_exterior',
  'room_plan_interior', 'room_plan_exterior',
  'arch', 'room_dome', 'room_dome_interior', 'room_inner_dome_exterior', 'room_inner_dome_interior', 'room_dome_extra_leg', 'room_dome_extra_leg_interior', 'room_dome_drum', 'room_dome_drum_interior',
  'room_dome_transition', 'room_dome_transition_exterior',
]);
const IMPORTED_BOND_NORMALIZED_UNIT_M = 0.1;

export function normalizeKarbandiRibCount(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 16;
  return Math.max(8, Math.min(64, Math.round(numeric / 4) * 4));
}

export function wallConnectedRibIndexes(adjacency = new Map(), supportedRibs = []) {
  const connected = new Set(supportedRibs);
  const queue = [...supportedRibs];
  for (let queueIndex = 0; queueIndex < queue.length; queueIndex += 1) {
    for (const neighbor of adjacency.get(queue[queueIndex]) || []) {
      if (connected.has(neighbor)) continue;
      connected.add(neighbor);
      queue.push(neighbor);
    }
  }
  return connected;
}

export function sampledCurveIntervalsAtOrAbove(values = [], start = 0, end = values.length - 1, minimum = 0) {
  if (values.length < 2 || end <= start) return [];
  const valueAt = (index) => {
    const lower = Math.max(0, Math.min(values.length - 1, Math.floor(index)));
    const upper = Math.max(0, Math.min(values.length - 1, Math.ceil(index)));
    return THREE.MathUtils.lerp(values[lower], values[upper], index - lower);
  };
  const stops = [start];
  for (let index = Math.ceil(start); index < end; index += 1) {
    if (index > start + 0.000001) stops.push(index);
  }
  stops.push(end);
  const intervals = [];
  const append = (intervalStart, intervalEnd) => {
    if (intervalEnd - intervalStart <= 0.000001) return;
    const previous = intervals[intervals.length - 1];
    if (previous && intervalStart <= previous.end + 0.000001) previous.end = intervalEnd;
    else intervals.push({ start: intervalStart, end: intervalEnd });
  };
  for (let index = 0; index < stops.length - 1; index += 1) {
    const segmentStart = stops[index];
    const segmentEnd = stops[index + 1];
    const startValue = valueAt(segmentStart);
    const endValue = valueAt(segmentEnd);
    const startInside = startValue >= minimum;
    const endInside = endValue >= minimum;
    if (startInside && endInside) {
      append(segmentStart, segmentEnd);
      continue;
    }
    if (startInside === endInside || Math.abs(endValue - startValue) < 0.000000001) continue;
    const crossing = THREE.MathUtils.lerp(
      segmentStart,
      segmentEnd,
      THREE.MathUtils.clamp((minimum - startValue) / (endValue - startValue), 0, 1),
    );
    if (startInside) append(segmentStart, crossing);
    else append(crossing, segmentEnd);
  }
  return intervals;
}

export const BUILT_IN_BONDS = Object.freeze({
  running: {
    label: 'Running bond',
    courses: [
      { offset: 0, bricks: [1] },
      { offset: 0.5, bricks: [1] },
    ],
  },
  stack: {
    label: 'Stack bond',
    courses: [
      { offset: 0, bricks: [1] },
      { offset: 0, bricks: [1] },
    ],
  },
  flemish: {
    label: 'Flemish bond',
    courses: [
      { offset: 0, bricks: [1, 0.5] },
      { offset: 0.75, bricks: [1, 0.5] },
    ],
  },
});

export const DEFAULT_ROOM_PLAN_DOOR = Object.freeze({
  type: 'door',
  rotation: 0,
  width: 1,
  height: 1.8,
  sillHeight: 0,
  head: 'arch',
  arch: Object.freeze({
    redOffset: -0.15,
    greenOffset: 0.55,
    greenHeight: 0.8,
    greenHeightOffset: -1,
  }),
});

export function createRoomPlanOpening(type = 'door', id = null) {
  if (type === 'window') {
    return {
      id,
      type: 'window',
      rotation: 0,
      width: 1,
      height: 1.2,
      sillHeight: 1.1,
      head: 'lintel',
      arch: { redOffset: -0.25, greenOffset: 0.65, greenHeight: 1.64 },
    };
  }
  return {
    ...DEFAULT_ROOM_PLAN_DOOR,
    id,
    arch: { ...DEFAULT_ROOM_PLAN_DOOR.arch },
  };
}

export function roomPlanOpeningsWithDefaultDoor(openings = [], roomPlanShape = 'square', id = null) {
  if (Array.isArray(openings) && openings.length) return openings;
  return roomPlanShape === 'octagon' || roomPlanShape === 'circle'
    ? [createRoomPlanOpening('door', id)]
    : [];
}

export const DEFAULT_WALL_SYSTEM = Object.freeze({
  enabled: true,
  color: '#b78b5d',
  shadows: true,
  openSides: [],
  interiorGypsum: { enabled: false, color: '#f1eee7' },
  stoneBase: { enabled: true, height: 1, slabWidth: 0.6, color: '#b7a68a', mortar: 0.001, mortarColor: '#9a8f7e' },
  extraHeights: { north: 0, east: 0, south: 0, west: 0 },
  sideOffsets: { north: 0, east: 0, south: 0, west: 0 },
  roomWallThicknesses: { north: 0.4, east: 0.4, south: 0.4, west: 0.4 },
  roomExteriorOffsets: { north: 0.4, east: 0.4, south: 0.4, west: 0.4 },
  edges: { enabled: false, color: '#79610c', thickness: 2 },
  southOpenings: {
    door: {
      enabled: true,
      width: 2,
      height: 1.6,
      position: 0,
      head: 'lintel',
      arch: { redOffset: -0.4, redRadius: 0.55, greenOffset: 1.05, greenHeight: 0.0036, greenHeightOffset: -1.5964 },
    },
    window: {
      enabled: false,
      width: 1,
      height: 0.5,
      position: 0,
      sillHeight: 4.7,
      head: 'lintel',
      arch: { redOffset: 0, redRadius: 0.5, greenOffset: 0.5, greenHeight: 4.7, greenHeightOffset: -0.5 },
    },
  },
  roomWallOpenings: {
    north: {
      door: { enabled: true, width: 2, height: 3, position: 0, head: 'arch', arch: { redOffset: -0.45, redRadius: 0.55, greenOffset: 1.05, greenHeight: 1, greenHeightOffset: -2 } },
      window: { enabled: false, width: 1, height: 0.5, position: 0, sillHeight: 4.7, head: 'lintel', arch: { redOffset: 0, redRadius: 0.5, greenOffset: 0.5, greenHeight: 4.7, greenHeightOffset: -0.5 } },
    },
    east: {
      door: { enabled: false, width: 2, height: 1.6, position: 0, head: 'lintel', arch: { redOffset: -0.4, redRadius: 0.55, greenOffset: 1.05, greenHeight: 0.0036, greenHeightOffset: -1.5964 } },
      window: { enabled: false, width: 1, height: 0.5, position: 0, sillHeight: 4.7, head: 'lintel', arch: { redOffset: 0, redRadius: 0.5, greenOffset: 0.5, greenHeight: 4.7, greenHeightOffset: -0.5 } },
    },
    south: {
      door: { enabled: false, width: 2, height: 1.6, position: 0, head: 'lintel', arch: { redOffset: -0.4, redRadius: 0.55, greenOffset: 1.05, greenHeight: 0.0036, greenHeightOffset: -1.5964 } },
      window: { enabled: false, width: 1, height: 0.5, position: 0, sillHeight: 4.7, head: 'lintel', arch: { redOffset: 0, redRadius: 0.5, greenOffset: 0.5, greenHeight: 4.7, greenHeightOffset: -0.5 } },
    },
    west: {
      door: { enabled: false, width: 2, height: 1.6, position: 0, head: 'lintel', arch: { redOffset: -0.4, redRadius: 0.55, greenOffset: 1.05, greenHeight: 0.0036, greenHeightOffset: -1.5964 } },
      window: { enabled: false, width: 1, height: 0.5, position: 0, sillHeight: 4.7, head: 'lintel', arch: { redOffset: 0, redRadius: 0.5, greenOffset: 0.5, greenHeight: 4.7, greenHeightOffset: -0.5 } },
    },
  },
  roomPlanOpenings: [],
  pointedArch: {
    enabled: true,
    redOffset: 0,
    redRadius: null,
    greenOffset: 1,
    greenHeight: 5,
    greenHeightOffset: -1,
    moduleInfill: true,
  },
  portalTransition: 'karbandi',
  portalCover: null,
  ahang: {
    enabled: true,
  },
  karbandi: {
    enabled: false,
    ribCount: 16,
    rotationOffset: 0,
    span: 4.1,
    springHeightOffset: 0,
    redOffset: -0.6,
    greenOffset: 0.6,
    greenHeightOffset: -1,
    ribWidth: 0.1,
    ribDepth: 0.1,
    referenceAngle: 180,
    referenceX: 0,
    referenceZ: 0.9,
    referenceRotation: 0,
    groupX: 0,
    groupY: 0,
    groupZ: 0.35,
    groupRotationY: 0,
    groupScale: 0.95,
    baseContactMode: 'center-to-edge-wall-top',
    ribColor: '#3490b7',
    referenceRibColor: '#ffd400',
    guideVisible: false,
    archIntersectionGuideVisible: false,
    coverEnabled: false,
    coverFinish: 'bricks',
    coverColor: '#eee8dc',
    web: {
      supportBoundaryMode: 'automatic-walls',
      selectedWallSides: ['north', 'east', 'south', 'west'],
      existingSpringingCurve: [],
      manualSpringingBoundary: [],
      soffitTermination: 'inner-edge',
      soffitCustomOffset: 0,
      springingTangent: 'infer',
      springingAngle: 45,
      roofThickness: 0.05,
      infillBrickColor: '#e5d41f',
      infillBrickColor2: '#9f663b',
      infillBrickHeight: 0.06,
      wallBearingDepth: 0,
      wallEmbedTolerance: 0,
      ribEmbedTolerance: 0,
      wallRoofBoundaryOffset: -0.07,
      seatingOffset: 0,
      southWestGuideBlend: 0.5,
      southEastGuideBlend: 0.5,
      cornerSeatMode: 'rib-profile',
      cornerRadius: 0.08,
      customCornerCurve: [],
      allowUnsupportedFreeEdge: false,
      planarFallback: false,
      intentionalOpenings: [],
    },
    clipToPortal: true,
    autoClip: true,
    cutMode: false,
    manualCuts: [],
  },
  northWall: {
    outwardWidth: 1,
    minHeight: null,
    archTopExtension: 0.7,
  },
  northBoundary: {
    enabled: true,
    inset: 0.2,
    depth: 0.1,
    color: '#79610c',
    thickness: 4,
  },
  bricks: {
    enabled: true,
    brickWidth: 0.15,
    brickHeight: 0.08,
    mortar: 0.01,
    mortarColor: '#000000',
    importedScale: 1,
      sideBonds: {
        north: { source: 'builtin', builtIn: 'running', assetId: null, name: 'Running bond', payload: null },
        north_sides: { source: 'builtin', builtIn: 'running', assetId: null, name: 'Running bond', payload: null },
        north_top: { source: 'builtin', builtIn: 'running', assetId: null, name: 'Running bond', payload: null },
        east: { source: 'builtin', builtIn: 'running', assetId: null, name: 'Running bond', payload: null },
        south: { source: 'builtin', builtIn: 'running', assetId: null, name: 'Running bond', payload: null },
        west: { source: 'builtin', builtIn: 'running', assetId: null, name: 'Running bond', payload: null },
        north_exterior: { source: 'builtin', builtIn: 'running', assetId: null, name: 'Running bond', payload: null },
        east_exterior: { source: 'builtin', builtIn: 'running', assetId: null, name: 'Running bond', payload: null },
        south_exterior: { source: 'builtin', builtIn: 'running', assetId: null, name: 'Running bond', payload: null },
        west_exterior: { source: 'builtin', builtIn: 'running', assetId: null, name: 'Running bond', payload: null },
        room_plan_interior: { source: 'builtin', builtIn: 'running', assetId: null, name: 'Running bond', payload: null },
        room_plan_exterior: { source: 'builtin', builtIn: 'running', assetId: null, name: 'Running bond', payload: null },
        arch: { source: 'builtin', builtIn: 'running', assetId: null, name: 'Running bond', payload: null },
        room_dome: { source: 'builtin', builtIn: 'running', assetId: null, name: 'Running bond', payload: null },
        room_dome_interior: { source: 'builtin', builtIn: 'running', assetId: null, name: 'Running bond', payload: null },
        room_inner_dome_exterior: { source: 'builtin', builtIn: 'running', assetId: null, name: 'Running bond', payload: null },
        room_inner_dome_interior: { source: 'builtin', builtIn: 'running', assetId: null, name: 'Running bond', payload: null },
        room_dome_extra_leg: { source: 'builtin', builtIn: 'running', assetId: null, name: 'Running bond', payload: null },
        room_dome_extra_leg_interior: { source: 'builtin', builtIn: 'running', assetId: null, name: 'Running bond', payload: null },
        room_dome_drum: { source: 'builtin', builtIn: 'running', assetId: null, name: 'Running bond', payload: null },
        room_dome_drum_interior: { source: 'builtin', builtIn: 'running', assetId: null, name: 'Running bond', payload: null },
        room_dome_transition: { source: 'builtin', builtIn: 'running', assetId: null, name: 'Running bond', payload: null },
        room_dome_transition_exterior: { source: 'builtin', builtIn: 'running', assetId: null, name: 'Running bond', payload: null },
      },
  },
});

const colorPattern = /^#[0-9a-f]{6}$/i;

function number(value, fallback, min, max) {
  const parsed = Number(value);
  return Math.max(min, Math.min(max, Number.isFinite(parsed) ? parsed : fallback));
}

function color(value, fallback) {
  return typeof value === 'string' && colorPattern.test(value) ? value.toLowerCase() : fallback;
}

function sideRecord(value, fallback, min, max) {
  return Object.fromEntries(WALL_SIDES.map((side) => [
    side,
    number(value?.[side], fallback, min, max),
  ]));
}

function normalizeSideBond(value = {}) {
  value = value || {};
  const source = value.source === 'library' && value.payload ? 'library' : 'builtin';
  const builtIn = BUILT_IN_BONDS[value.builtIn] ? value.builtIn : 'running';
  return {
    source,
    builtIn,
    assetType: source === 'library' ? String(value.assetType || value.asset_type || '') || null : null,
    assetId: source === 'library' ? String(value.assetId || '') || null : null,
    assetVersionId: source === 'library' ? String(value.assetVersionId || '') || null : null,
    name: String(value.name || BUILT_IN_BONDS[builtIn].label).slice(0, 120),
    payload: source === 'library' ? value.payload : null,
    scale: number(value.scale, 1, 0.1, 8),
    offsetU: number(value.offsetU, 0, -100, 100),
    offsetV: number(value.offsetV, 0, -100, 100),
    horizontalColor: color(value.horizontalColor, ''),
    verticalColor: color(value.verticalColor, ''),
  };
}

export function wallContextLibraryAsset(sideBonds = {}, selectedSide = '') {
  const exactSide = selectedSide === 'south_arch' ? 'arch' : selectedSide;
  const fallbackSides = exactSide === 'arch'
    ? ['south']
    : exactSide === 'north_sides' || exactSide === 'north_top'
      ? ['north']
      : [];
  const bond = [exactSide, ...fallbackSides]
    .map((side) => sideBonds?.[side])
    .find((candidate) => candidate?.source === 'library' && candidate.assetId);
  if (!bond) return null;
  const payload = bond.payload || {};
  const assetType = bond.assetType
    || payload.asset_type
    || (payload.kind === 'girih-model' || payload.mehrazFlatPattern ? 'girih_pattern' : 'brick_bond');
  return {
    assetId: bond.assetId,
    versionId: bond.assetVersionId || '',
    assetType,
    name: bond.name,
  };
}

function normalizeSouthOpening(value, fallback, bottom = 0) {
  const source = value || {};
  const width = number(source.width, fallback.width, 0.3, 12);
  const height = number(source.height, fallback.height, 0.3, 15);
  const arch = { ...(fallback.arch || {}), ...(source.arch || {}) };
  const springHeight = bottom + height;
  const defaultGreenOffset = number(fallback.arch?.greenOffset, Math.max(0.05, width * 0.5), 0.05, 20);
  const defaultGreenHeightOffset = fallback.arch?.greenHeightOffset == null
    ? -Math.max(0.05, width * 0.5)
    : number(fallback.arch.greenHeightOffset, -Math.max(0.05, width * 0.5), -40, 40);
  const greenHeightOffset = arch.greenHeightOffset == null
    ? (arch.greenHeight == null
      ? defaultGreenHeightOffset
      : number(arch.greenHeight, springHeight + defaultGreenHeightOffset, -40, 40) - springHeight)
    : number(arch.greenHeightOffset, defaultGreenHeightOffset, -40, 40);
  return {
    enabled: source.enabled == null ? fallback.enabled : source.enabled === true,
    width,
    height,
    position: number(source.position, fallback.position, -20, 20),
    head: source.head == null
      ? (fallback.head === 'arch' ? 'arch' : 'lintel')
      : source.head === 'arch' ? 'arch' : 'lintel',
    arch: {
      redOffset: number(arch.redOffset, fallback.arch?.redOffset ?? 0, -20, 20),
      redRadius: arch.redRadius == null ? null : number(arch.redRadius, fallback.arch?.redRadius ?? width * 0.5, 0.05, 40),
      greenOffset: number(arch.greenOffset, defaultGreenOffset, 0.05, 20),
      greenHeight: number(springHeight + greenHeightOffset, springHeight + defaultGreenHeightOffset, -40, 40),
      greenHeightOffset,
    },
  };
}

export function normalizeWallSystem(value = {}, building = {}) {
  const openings = value.southOpenings || {};
  const door = openings.door || {};
  const windowOpening = openings.window || {};
  const pointedArch = value.pointedArch || {};
  const karbandi = value.karbandi || {};
  const karbandiEnabled = karbandi.enabled === true;
  const nonSquarePortal = (building.type === 'iwan' || building.buildingType === 'portal')
    && ['octagon', 'circle'].includes(building.portalPlanShape);
  const normalizedKarbandiEnabled = nonSquarePortal || karbandiEnabled;
  const legacyAhangEnabled = pointedArch.enabled !== false && !karbandiEnabled;
  const migratedPortalCover = ['pyramid', 'cone'].includes(value.portalCover)
    ? 'dome'
    : value.portalCover;
  const explicitPortalCover = ['none', 'ahang', 'dome'].includes(migratedPortalCover)
    ? migratedPortalCover
    : null;
  const ahangEnabled = explicitPortalCover
    ? explicitPortalCover === 'ahang'
    : value.ahang?.enabled == null
      ? legacyAhangEnabled
      : value.ahang.enabled === true;
  const portalCover = explicitPortalCover || (ahangEnabled ? 'ahang' : 'none');
  const portalTransition = nonSquarePortal
    ? 'karbandi'
    : ['karbandi', 'squinch', 'muqarnas'].includes(value.portalTransition)
      ? value.portalTransition
      : karbandiEnabled
        ? 'karbandi'
        : DEFAULT_WALL_SYSTEM.portalTransition;
  const northWall = value.northWall || {};
  const northBoundary = value.northBoundary || {};
  const edges = value.edges || value.wallEdges || {};
  const interiorGypsum = value.interiorGypsum || {};
  const stoneBase = value.stoneBase || {};
  const bricks = value.bricks || value.brickPattern || {};
  const defaultSill = DEFAULT_WALL_SYSTEM.southOpenings.window.sillHeight;
  const windowSill = windowOpening.sillHeight == null
    ? defaultSill
    : number(windowOpening.sillHeight, defaultSill, 0, 18);
  const normalizeOpeningSet = (source = {}, fallback = DEFAULT_WALL_SYSTEM.southOpenings) => {
    const sourceWindow = source.window || {};
    const fallbackSill = fallback.window.sillHeight;
    const sillHeight = sourceWindow.sillHeight == null
      ? fallbackSill
      : number(sourceWindow.sillHeight, fallbackSill, 0, 18);
    return {
      door: normalizeSouthOpening(source.door || {}, fallback.door, 0),
      window: {
        ...normalizeSouthOpening(sourceWindow, fallback.window, sillHeight),
        sillHeight,
      },
    };
  };
  const normalizedSouthOpenings = normalizeOpeningSet(openings, DEFAULT_WALL_SYSTEM.southOpenings);
  const roomWallOpeningSource = value.roomWallOpenings || {};
  const roomWallOpenings = Object.fromEntries(WALL_SIDES.map((side) => [
    side,
    normalizeOpeningSet(
      roomWallOpeningSource[side] || (side === 'south' ? openings : {}),
      DEFAULT_WALL_SYSTEM.roomWallOpenings[side],
    ),
  ]));
  const roomPlanOpenings = (Array.isArray(value.roomPlanOpenings) ? value.roomPlanOpenings : [])
    .slice(0, 64)
    .map((opening, index) => {
      const type = opening?.type === 'window' ? 'window' : 'door';
      const rotationValue = Number(opening?.rotation);
      const rotation = Number.isFinite(rotationValue) ? ((rotationValue % 360) + 360) % 360 : 0;
      const width = number(opening?.width, type === 'door' ? DEFAULT_ROOM_PLAN_DOOR.width : 1, 0.3, 12);
      const height = number(opening?.height, type === 'door' ? DEFAULT_ROOM_PLAN_DOOR.height : 1.2, 0.3, 15);
      const sillHeight = type === 'window' ? number(opening?.sillHeight, 1.1, 0, 18) : 0;
      const springHeight = sillHeight + height;
      const arch = opening?.arch || {};
      const defaultGreenHeight = type === 'door' ? DEFAULT_ROOM_PLAN_DOOR.arch.greenHeight : Math.max(0, springHeight - height * 0.55);
      const greenHeight = arch.greenHeightOffset != null
        ? springHeight + number(arch.greenHeightOffset, defaultGreenHeight - springHeight, -40, 40)
        : number(arch.greenHeight, defaultGreenHeight, -40, 40);
      return {
        id: String(opening?.id || `room-opening-${index + 1}`).slice(0, 120),
        type,
        rotation,
        width,
        height,
        sillHeight,
        head: opening?.head == null
          ? (type === 'door' ? DEFAULT_ROOM_PLAN_DOOR.head : 'lintel')
          : opening.head === 'arch' ? 'arch' : 'lintel',
        arch: {
          redOffset: number(arch.redOffset, type === 'door' ? DEFAULT_ROOM_PLAN_DOOR.arch.redOffset : -0.25, -20, 20),
          greenOffset: number(arch.greenOffset, type === 'door' ? DEFAULT_ROOM_PLAN_DOOR.arch.greenOffset : Math.max(0.5, width * 0.65), 0.05, 20),
          greenHeight,
          greenHeightOffset: greenHeight - springHeight,
        },
      };
    });
  const extraHeights = sideRecord(value.extraHeights, 0, 0, 20);
  const sideOffsets = sideRecord(value.sideOffsets, 0, -20, 20);
  const defaultWallThickness = number(building.wallThickness, 0.4, 0.1, 1.5);
  const legacyRoomWallThicknesses = sideRecord(
    value.roomWallThicknesses,
    defaultWallThickness,
    0.05,
    10,
  );
  const roomExteriorOffsets = Object.fromEntries(WALL_SIDES.map((side) => {
    const legacyExteriorOffset = sideOffsets[side] + legacyRoomWallThicknesses[side];
    const exteriorOffset = number(value.roomExteriorOffsets?.[side], legacyExteriorOffset, -19.95, 30);
    return [side, Math.max(sideOffsets[side] + 0.05, exteriorOffset)];
  }));
  const roomWallThicknesses = Object.fromEntries(WALL_SIDES.map((side) => [
    side,
    roomExteriorOffsets[side] - sideOffsets[side],
  ]));
  const buildingHeight = number(building.height, 6, 2, 20);
  const fullBuildingDepth = number(building.depth, 8, 2, 30);
  const buildingDepth = building.type === 'room'
    ? Math.max(0.2, Math.min(number(building.width, 4, 2, 30), fullBuildingDepth) / 2)
    : fullBuildingDepth;
  const referenceZMinimum = 0.001;
  const referenceZMaximum = Math.max(referenceZMinimum, buildingDepth - 0.001);
  const archSpringHeight = Math.max(
    0.05,
    buildingHeight + extraHeights.east,
    buildingHeight + extraHeights.west,
  );
  // Store the green construction center relative to the arch spring line. This
  // lets the complete circle construction translate with the building height
  // without changing the arch profile. Legacy projects only have the absolute
  // height, so derive their offset the first time they are normalized.
  const greenHeightOffset = pointedArch.greenHeightOffset == null
    ? number(pointedArch.greenHeight, DEFAULT_WALL_SYSTEM.pointedArch.greenHeight, -40, 40) - archSpringHeight
    : number(pointedArch.greenHeightOffset, DEFAULT_WALL_SYSTEM.pointedArch.greenHeightOffset, -40, 40);
  const normalizedKarbandiSpringOffset = number(
    karbandi.springHeightOffset,
    DEFAULT_WALL_SYSTEM.karbandi.springHeightOffset,
    -10,
    20,
  );
  const migratesScaleOneKarbandi = Number(karbandi.groupScale) === 1;
  const normalizedKarbandiScale = migratesScaleOneKarbandi
    ? DEFAULT_WALL_SYSTEM.karbandi.groupScale
    : number(karbandi.groupScale, DEFAULT_WALL_SYSTEM.karbandi.groupScale, 0.05, 20);
  const normalizedKarbandiRibCount = normalizeKarbandiRibCount(karbandi.ribCount);
  const currentKarbandiReferenceZ = number(
    karbandi.referenceZ,
    THREE.MathUtils.clamp(DEFAULT_WALL_SYSTEM.karbandi.referenceZ, referenceZMinimum, referenceZMaximum),
    referenceZMinimum,
    referenceZMaximum,
  );
  const currentContactSolutions = karbandiReferenceZSolutions({
    ...karbandi,
    ribCount: normalizedKarbandiRibCount,
    groupScale: normalizedKarbandiScale,
  }, buildingDepth);
  const normalizedKarbandiReferenceZ = karbandi.baseContactMode === 'center-to-edge-wall-top'
    && currentContactSolutions.some((solution) => Math.abs(solution - currentKarbandiReferenceZ) < 0.000002)
    ? currentKarbandiReferenceZ
    : karbandiReferenceZForRibCount({
      ...karbandi,
      ribCount: normalizedKarbandiRibCount,
      groupScale: normalizedKarbandiScale,
    }, buildingDepth);
  return {
    enabled: value.enabled !== false,
    color: color(value.color, DEFAULT_WALL_SYSTEM.color),
    shadows: value.shadows !== false,
    openSides: WALL_SIDES.filter((side) => Array.isArray(value.openSides) && value.openSides.includes(side)),
    interiorGypsum: {
      enabled: interiorGypsum.enabled === true,
      color: color(interiorGypsum.color, DEFAULT_WALL_SYSTEM.interiorGypsum.color),
    },
    stoneBase: {
      enabled: stoneBase.enabled == null ? DEFAULT_WALL_SYSTEM.stoneBase.enabled : stoneBase.enabled === true,
      height: number(stoneBase.height, DEFAULT_WALL_SYSTEM.stoneBase.height, 0, 10),
      slabWidth: number(stoneBase.slabWidth, DEFAULT_WALL_SYSTEM.stoneBase.slabWidth, 0.1, 5),
      color: color(stoneBase.color, DEFAULT_WALL_SYSTEM.stoneBase.color),
      mortar: number(stoneBase.mortar, DEFAULT_WALL_SYSTEM.stoneBase.mortar, 0.001, 0.1),
      mortarColor: color(stoneBase.mortarColor, DEFAULT_WALL_SYSTEM.stoneBase.mortarColor),
    },
    extraHeights,
    sideOffsets,
    roomWallThicknesses,
    roomExteriorOffsets,
    edges: {
      enabled: edges.enabled === true,
      color: color(edges.color, DEFAULT_WALL_SYSTEM.edges.color),
      thickness: number(edges.thickness, DEFAULT_WALL_SYSTEM.edges.thickness, 0.5, 8),
    },
    southOpenings: normalizedSouthOpenings,
    roomWallOpenings,
    roomPlanOpenings,
    pointedArch: {
      enabled: pointedArch.enabled !== false,
      redOffset: number(pointedArch.redOffset, DEFAULT_WALL_SYSTEM.pointedArch.redOffset, -20, 20),
      redRadius: pointedArch.redRadius == null ? null : number(pointedArch.redRadius, 1, 0.05, 40),
      greenOffset: number(pointedArch.greenOffset, DEFAULT_WALL_SYSTEM.pointedArch.greenOffset, 0.05, 20),
      greenHeight: number(archSpringHeight + greenHeightOffset, DEFAULT_WALL_SYSTEM.pointedArch.greenHeight, -40, 40),
      greenHeightOffset,
      moduleInfill: pointedArch.moduleInfill !== false,
    },
    portalTransition,
    portalCover,
    ahang: {
      enabled: ahangEnabled,
    },
    karbandi: {
      enabled: normalizedKarbandiEnabled,
      ribCount: normalizedKarbandiRibCount,
      rotationOffset: number(value.karbandi?.rotationOffset, DEFAULT_WALL_SYSTEM.karbandi.rotationOffset, -360, 360),
      span: number(value.karbandi?.span, DEFAULT_WALL_SYSTEM.karbandi.span, 0.2, 40),
      springHeightOffset: normalizedKarbandiSpringOffset,
      redOffset: number(value.karbandi?.redOffset, DEFAULT_WALL_SYSTEM.karbandi.redOffset, -20, 20),
      greenOffset: number(value.karbandi?.greenOffset, DEFAULT_WALL_SYSTEM.karbandi.greenOffset, 0.05, 20),
      greenHeightOffset: number(value.karbandi?.greenHeightOffset, DEFAULT_WALL_SYSTEM.karbandi.greenHeightOffset, -10, 20),
      ribWidth: number(value.karbandi?.ribWidth ?? value.karbandi?.ribThickness, DEFAULT_WALL_SYSTEM.karbandi.ribWidth, 0.01, 2),
      ribDepth: number(value.karbandi?.ribDepth ?? value.karbandi?.ribThickness, DEFAULT_WALL_SYSTEM.karbandi.ribDepth, 0.01, 2),
      referenceAngle: number(value.karbandi?.referenceAngle, DEFAULT_WALL_SYSTEM.karbandi.referenceAngle, 1, 359),
      referenceX: number(value.karbandi?.referenceX, DEFAULT_WALL_SYSTEM.karbandi.referenceX, -40, 40),
      referenceZ: normalizedKarbandiReferenceZ,
      referenceRotation: number(value.karbandi?.referenceRotation, DEFAULT_WALL_SYSTEM.karbandi.referenceRotation, -360, 360),
      groupX: number(value.karbandi?.groupX, DEFAULT_WALL_SYSTEM.karbandi.groupX, -40, 40),
      groupY: migratesScaleOneKarbandi
        ? THREE.MathUtils.clamp(
          archSpringHeight - (archSpringHeight + normalizedKarbandiSpringOffset) * normalizedKarbandiScale,
          -40,
          40,
        )
        : number(value.karbandi?.groupY, DEFAULT_WALL_SYSTEM.karbandi.groupY, -40, 40),
      groupZ: number(value.karbandi?.groupZ, DEFAULT_WALL_SYSTEM.karbandi.groupZ, -40, 40),
      groupRotationY: number(value.karbandi?.groupRotationY, DEFAULT_WALL_SYSTEM.karbandi.groupRotationY, -360, 360),
      // Scale is no longer user-editable. Migrate the former scale-one default
      // to the normalized 0.95 setting while retaining intentional legacy
      // custom scales in imported projects.
      groupScale: normalizedKarbandiScale,
      baseContactMode: 'center-to-edge-wall-top',
      ribColor: color(value.karbandi?.ribColor, DEFAULT_WALL_SYSTEM.karbandi.ribColor),
      referenceRibColor: color(value.karbandi?.referenceRibColor, DEFAULT_WALL_SYSTEM.karbandi.referenceRibColor),
      guideVisible: value.karbandi?.guideVisible === true,
      archIntersectionGuideVisible: value.karbandi?.archIntersectionGuideVisible === true,
      coverEnabled: value.karbandi?.coverEnabled === true,
      coverFinish: value.karbandi?.coverFinish === 'solid' ? 'solid' : 'bricks',
      coverColor: color(value.karbandi?.coverColor, DEFAULT_WALL_SYSTEM.karbandi.coverColor),
      web: normalizeKarbandiWebOptions(value.karbandi?.web),
      clipToPortal: karbandiEnabled,
      autoClip: value.karbandi?.autoClip !== false,
      // Manual rib cutting has been retired. Normalize legacy projects back to
      // the deterministic automatic clipping path so hidden saved state cannot
      // keep the scene in an unavailable editing mode.
      cutMode: false,
      manualCuts: [],
    },
    northWall: {
      outwardWidth: number(northWall.outwardWidth, DEFAULT_WALL_SYSTEM.northWall.outwardWidth, 0, 10),
      minHeight: northWall.minHeight == null ? null : number(northWall.minHeight, 0, 0, 30),
      archTopExtension: number(northWall.archTopExtension, DEFAULT_WALL_SYSTEM.northWall.archTopExtension, 0, 10),
    },
    northBoundary: {
      enabled: northBoundary.enabled == null ? DEFAULT_WALL_SYSTEM.northBoundary.enabled : northBoundary.enabled === true,
      inset: number(northBoundary.inset ?? northBoundary.offset, 0.2, 0.02, 2),
      depth: number(northBoundary.depth, DEFAULT_WALL_SYSTEM.northBoundary.depth, 0, 1),
      color: color(northBoundary.color, DEFAULT_WALL_SYSTEM.northBoundary.color),
      thickness: number(northBoundary.thickness, 4, 0.5, 8),
    },
    bricks: {
      enabled: bricks.enabled !== false,
      brickWidth: number(bricks.brickWidth, DEFAULT_WALL_SYSTEM.bricks.brickWidth, 0.05, 1),
      brickHeight: number(bricks.brickHeight, DEFAULT_WALL_SYSTEM.bricks.brickHeight, 0.02, 0.5),
      mortar: number(bricks.mortar, 0.01, 0.001, 0.05),
      mortarColor: color(bricks.mortarColor, DEFAULT_WALL_SYSTEM.bricks.mortarColor),
      importedScale: number(bricks.importedScale, 1, 0.1, 8),
      sideBonds: {
        ...Object.fromEntries(BRICK_BOND_SIDES.map((side) => [
          side,
          normalizeSideBond(
            bricks.sideBonds?.[side]
              || (side.startsWith('north_') ? bricks.sideBonds?.north : null)
              || (side === 'room_plan_interior' ? bricks.sideBonds?.north : null)
              || (side === 'room_plan_exterior' ? bricks.sideBonds?.north_exterior : null)
              || DEFAULT_WALL_SYSTEM.bricks.sideBonds[side],
          ),
        ])),
        north: normalizeSideBond(bricks.sideBonds?.north || DEFAULT_WALL_SYSTEM.bricks.sideBonds.north),
      },
    },
  };
}

export function portalDefaultWallSystem(value = DEFAULT_WALL_SYSTEM, building = {}) {
  let walls = normalizeWallSystem({
    ...value,
    portalTransition: 'karbandi',
    portalCover: 'none',
    ahang: { ...value.ahang, enabled: false },
    karbandi: { ...value.karbandi, enabled: true },
  }, building);
  const seating = solveKarbandiWallSeating(walls.karbandi, building, walls);
  walls = normalizeWallSystem({
    ...walls,
    karbandi: { ...walls.karbandi, ...seating, enabled: true },
  }, building);
  return walls;
}

function wallsWithDefaultBond(walls, side) {
  return {
    ...walls,
    bricks: {
      ...walls.bricks,
      importedScale: 1,
      sideBonds: {
        ...walls.bricks.sideBonds,
        [side]: { source: 'builtin', builtIn: 'running', scale: 1 },
      },
    },
  };
}

function wallMaterial(walls, side = null, width = 1, height = 1, worldUv = false, phaseU = 0, mirrorU = false, seamlessCycleLength = null) {
  const material = new THREE.MeshStandardMaterial({
    color: walls.color,
    roughness: 0.78,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  if (walls.bricks.enabled && side) {
    // Structural walls retain their running-bond body, while the Room dome is
    // itself the visible finish and must honor its selected built-in/library bond.
    const baseWalls = [
      'room_dome', 'room_dome_interior', 'room_inner_dome_exterior', 'room_inner_dome_interior', 'room_dome_extra_leg', 'room_dome_extra_leg_interior', 'room_dome_drum', 'room_dome_drum_interior',
      'room_dome_transition', 'room_dome_transition_exterior',
    ].includes(side)
      ? walls
      : wallsWithDefaultBond(walls, side);
    // Every structural face uses the same horizontal running-bond axes:
    // brick width follows the wall and brick height follows world Y.
    material.map = makeBondTexture(baseWalls, side, width, height, false, worldUv, phaseU, mirrorU, seamlessCycleLength);
    material.color.set('#ffffff');
    material.userData.generatedTexture = material.map;
    material.userData.isFlatBrickBond = true;
    material.userData.brickBondSide = side;
    material.userData.brickBondSource = baseWalls.bricks.sideBonds[side]?.source || 'builtin';
    material.userData.brickBondSelection = baseWalls.bricks.sideBonds[side]?.assetId
      || baseWalls.bricks.sideBonds[side]?.builtIn
      || 'running';
    material.userData.surfaceBrickColor = baseWalls.color;
    if ([
      'room_dome',
      'room_dome_interior',
      'room_inner_dome_exterior',
      'room_inner_dome_interior',
      'room_dome_extra_leg',
      'room_dome_extra_leg_interior',
      'room_dome_drum',
      'room_dome_drum_interior',
    ].includes(side)) {
      material.userData.brickBondSeamlessCircumference = true;
      material.userData.brickBondCircumferenceRepeats = Math.abs(material.map.repeat.x);
    }
  }
  return configureStoneBaseMaterial(material, walls);
}

function directRoomWallFaceMaterial(walls, side, width, height, phaseU, seamlessCycleLength, mirrorU = false) {
  const material = new THREE.MeshStandardMaterial({
    color: walls.color,
    roughness: 0.78,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  if (walls.bricks.enabled && side) {
    material.map = makeBondTexture(
      walls,
      side,
      width,
      height,
      false,
      true,
      phaseU,
      mirrorU,
      seamlessCycleLength,
    );
    material.color.set('#ffffff');
    material.userData.generatedTexture = material.map;
    material.userData.isFlatBrickBond = true;
    material.userData.brickBondSide = side;
    material.userData.brickBondSource = walls.bricks.sideBonds[side]?.source || 'builtin';
    material.userData.brickBondSelection = walls.bricks.sideBonds[side]?.assetId
      || walls.bricks.sideBonds[side]?.builtIn
      || 'running';
    material.userData.brickBondPhaseU = phaseU;
    material.userData.brickBondSeamlessCycleLength = seamlessCycleLength;
    material.userData.brickBondSurfaceWidth = width;
    material.userData.brickBondMirrorU = mirrorU;
    material.userData.surfaceBrickColor = walls.color;
    material.userData.isDirectRoomWallFaceMaterial = true;
  }
  return configureStoneBaseMaterial(material, walls);
}

function configureDomePatternCoverage(material, coveragePercent, solidColor, springY, domeRise) {
  if (!material) return material;
  const coverage = THREE.MathUtils.clamp(Number(coveragePercent) || 0, 0, 100);
  const cutoffY = springY + domeRise * coverage / 100;
  material.userData.domePatternCoverage = coverage;
  material.userData.domePatternCutoffY = cutoffY;
  material.userData.domePatternSolidColor = solidColor;
  if (!material.map || coverage >= 100) return material;

  const previousCompile = material.onBeforeCompile;
  const previousCacheKey = material.customProgramCacheKey?.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    previousCompile?.(shader, renderer);
    shader.uniforms.domePatternCutoffY = { value: cutoffY };
    shader.uniforms.domePatternSolidColor = { value: new THREE.Color(solidColor) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDomePatternWorldPosition;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvDomePatternWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vDomePatternWorldPosition;\nuniform float domePatternCutoffY;\nuniform vec3 domePatternSolidColor;',
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
if (vDomePatternWorldPosition.y > domePatternCutoffY) {
  diffuseColor.rgb = domePatternSolidColor;
}`,
      );
  };
  material.customProgramCacheKey = () => `${previousCacheKey?.() || 'standard'}|dome-pattern-coverage-v1`;
  material.needsUpdate = true;
  return material;
}

function configureConvergingCoverBond(material, centerX, centerZ, facetCount = 0) {
  if (!material?.map) return material;
  const facets = Math.max(0, Math.round(Number(facetCount) || 0));
  const repeatX = material.map.repeat.x;
  const offsetX = material.map.offset.x;
  material.userData.domeBondMapping = facets >= 3
    ? 'facet-edge-distance-rays-converge-to-pyramid-apex'
    : 'angular-rays-converge-to-cone-apex';
  material.userData.domeBondFacetCount = facets;
  material.userData.domeBondConvergenceCenter = [centerX, centerZ];
  const previousCompile = material.onBeforeCompile;
  const previousCacheKey = material.customProgramCacheKey?.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    previousCompile?.(shader, renderer);
    shader.uniforms.domeBondCenter = { value: new THREE.Vector2(centerX, centerZ) };
    shader.uniforms.domeBondUTransform = { value: new THREE.Vector2(repeatX, offsetX) };
    shader.uniforms.domeBondFacetCount = { value: facets };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDomeBondPosition;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDomeBondPosition = transformed;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vDomeBondPosition;\nuniform vec2 domeBondCenter;\nuniform vec2 domeBondUTransform;\nuniform float domeBondFacetCount;',
      )
      .replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
  const float DOME_BOND_TAU = 6.283185307179586;
  float domeBondAngle = atan(
    vDomeBondPosition.x - domeBondCenter.x,
    vDomeBondPosition.z - domeBondCenter.y
  );
  if (domeBondAngle < 0.0) domeBondAngle += DOME_BOND_TAU;
  float domeBondPerimeterU = domeBondAngle / DOME_BOND_TAU;
  if (domeBondFacetCount >= 3.0) {
    float domeBondFacetAngle = DOME_BOND_TAU / domeBondFacetCount;
    float domeBondHalfFacetAngle = domeBondFacetAngle * 0.5;
    float domeBondFacet = floor((domeBondAngle + domeBondHalfFacetAngle) / domeBondFacetAngle);
    float domeBondDelta = domeBondAngle - domeBondFacet * domeBondFacetAngle;
    float domeBondLocalU = 0.5 + 0.5 * tan(domeBondDelta) / tan(domeBondHalfFacetAngle);
    domeBondPerimeterU = (domeBondFacet + clamp(domeBondLocalU, 0.0, 1.0)) / domeBondFacetCount;
  }
  vec2 domeBondUv = vec2(
    domeBondPerimeterU * domeBondUTransform.x + domeBondUTransform.y,
    vMapUv.y
  );
  vec4 sampledDiffuseColor = texture2D(map, domeBondUv);
  diffuseColor *= sampledDiffuseColor;
#endif`,
      );
  };
  material.customProgramCacheKey = () => `${previousCacheKey?.() || 'standard'}|converging-cover-bond-v1-${facets}`;
  material.needsUpdate = true;
  return material;
}

export function configureStoneBaseMaterial(material, walls, { clipPattern = false } = {}) {
  if (!material || walls?.stoneBase?.enabled !== true || !(Number(walls.stoneBase.height) > 0)) return material;
  const height = Number(walls.stoneBase.height);
  const slabWidth = number(walls.stoneBase.slabWidth, DEFAULT_WALL_SYSTEM.stoneBase.slabWidth, 0.1, 5);
  const stoneColor = color(walls.stoneBase.color, DEFAULT_WALL_SYSTEM.stoneBase.color);
  const mortar = number(walls.stoneBase.mortar, DEFAULT_WALL_SYSTEM.stoneBase.mortar, 0.001, 0.1);
  const mortarColor = color(walls.stoneBase.mortarColor, DEFAULT_WALL_SYSTEM.stoneBase.mortarColor);
  material.userData.stoneBaseHeight = height;
  material.userData.stoneBaseSlabWidth = slabWidth;
  material.userData.stoneBaseColor = stoneColor;
  material.userData.stoneBaseMortar = mortar;
  material.userData.stoneBaseMortarColor = mortarColor;
  if (clipPattern) {
    material.clippingPlanes = [
      ...(Array.isArray(material.clippingPlanes) ? material.clippingPlanes : []),
      new THREE.Plane(new THREE.Vector3(0, 1, 0), -height),
    ];
    material.clipIntersection = false;
    material.clipShadows = true;
    material.userData.stoneBasePatternClipHeight = height;
    return material;
  }
  const previousCompile = material.onBeforeCompile;
  const previousCacheKey = material.customProgramCacheKey?.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    previousCompile?.(shader, renderer);
    shader.uniforms.stoneBaseHeight = { value: height };
    shader.uniforms.stoneBaseSlabWidth = { value: slabWidth };
    shader.uniforms.stoneBaseColor = { value: new THREE.Color(stoneColor) };
    shader.uniforms.stoneBaseMortar = { value: mortar };
    shader.uniforms.stoneBaseMortarColor = { value: new THREE.Color(mortarColor) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vStoneBaseWorldPosition;\nvarying vec3 vStoneBaseWorldNormal;')
      .replace('#include <defaultnormal_vertex>', '#include <defaultnormal_vertex>\nvStoneBaseWorldNormal = normalize(mat3(modelMatrix) * objectNormal);')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvStoneBaseWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vStoneBaseWorldPosition;\nvarying vec3 vStoneBaseWorldNormal;\nuniform float stoneBaseHeight;\nuniform float stoneBaseSlabWidth;\nuniform vec3 stoneBaseColor;\nuniform float stoneBaseMortar;\nuniform vec3 stoneBaseMortarColor;',
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `if (vStoneBaseWorldPosition.y <= stoneBaseHeight + 0.0001) {
  float slabWidth = stoneBaseSlabWidth;
  float jointHalf = stoneBaseMortar * 0.5;
  float horizontal = abs(vStoneBaseWorldNormal.x) > abs(vStoneBaseWorldNormal.z)
    ? vStoneBaseWorldPosition.z
    : vStoneBaseWorldPosition.x;
  float slabX = mod(horizontal, slabWidth);
  float edgeDistance = min(slabX, slabWidth - slabX);
  float antialias = max(fwidth(edgeDistance), 0.0005);
  float mortarMask = 1.0 - smoothstep(jointHalf, jointHalf + antialias, edgeDistance);
  float variation = 0.94 + 0.08 * fract(sin(floor(horizontal / slabWidth) * 127.1) * 43758.5453);
  vec3 slabColor = stoneBaseColor * variation;
  diffuseColor.rgb = mix(slabColor, stoneBaseMortarColor, mortarMask);
}
#include <roughnessmap_fragment>`,
      );
  };
  material.customProgramCacheKey = () => `${previousCacheKey?.() || 'standard'}|stone-base-v2`;
  material.needsUpdate = true;
  return material;
}

function makeHorizontalCourseRoofTexture(webOptions, walls) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  const courseCount = 2;
  const coursePixels = canvas.height / courseCount;
  const coursePeriod = webOptions.infillBrickHeight + walls.bricks.mortar;
  const periodHeight = coursePeriod * courseCount;
  const mortarPixels = Math.max(1, canvas.height * walls.bricks.mortar / Math.max(0.001, periodHeight));
  context.fillStyle = walls.bricks.mortarColor;
  context.fillRect(0, 0, canvas.width, canvas.height);
  for (let course = 0; course < courseCount; course += 1) {
    const color = new THREE.Color(course % 2 ? webOptions.infillBrickColor2 : webOptions.infillBrickColor);
    context.fillStyle = `#${color.getHexString()}`;
    context.fillRect(0, course * coursePixels + mortarPixels * 0.5, canvas.width, coursePixels - mortarPixels);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 1 / Math.max(0.001, periodHeight));
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 16;
  texture.needsUpdate = true;
  texture.userData.horizontalMortarOnly = true;
  texture.userData.brickHeight = webOptions.infillBrickHeight;
  texture.userData.brickColor = webOptions.infillBrickColor;
  texture.userData.brickColor2 = webOptions.infillBrickColor2;
  return texture;
}

function configureRaisedBorderBrickMaterial(material, walls, archMapping = null) {
  if (!material || !walls?.bricks?.enabled) return material;
  const brickWidth = Math.max(0.01, Number(walls.bricks.brickWidth) || DEFAULT_WALL_SYSTEM.bricks.brickWidth);
  const brickHeight = Math.max(0.01, Number(walls.bricks.brickHeight) || DEFAULT_WALL_SYSTEM.bricks.brickHeight);
  const mortar = Math.max(0.0001, Number(walls.bricks.mortar) || DEFAULT_WALL_SYSTEM.bricks.mortar);
  const mortarColor = color(walls.bricks.mortarColor, DEFAULT_WALL_SYSTEM.bricks.mortarColor);
  material.onBeforeCompile = (shader) => {
    shader.uniforms.raisedBrickWidth = { value: brickWidth };
    shader.uniforms.raisedBrickHeight = { value: brickHeight };
    shader.uniforms.raisedBrickMortar = { value: mortar };
    shader.uniforms.raisedBrickMortarColor = { value: new THREE.Color(mortarColor) };
    shader.uniforms.raisedArchEnabled = { value: archMapping?.enabled === true ? 1 : 0 };
    shader.uniforms.raisedArchCenterX = { value: archMapping?.centerX || 0 };
    shader.uniforms.raisedArchRedOffset = { value: archMapping?.redOffset || 0 };
    shader.uniforms.raisedArchRedHeight = { value: archMapping?.redHeight || 0 };
    shader.uniforms.raisedArchRedStartAngle = { value: archMapping?.redStartAngle || 0 };
    shader.uniforms.raisedArchGreenOffset = { value: archMapping?.greenOffset || 0 };
    shader.uniforms.raisedArchGreenHeight = { value: archMapping?.greenHeight || 0 };
    shader.uniforms.raisedArchRedRadius = { value: archMapping?.redRadius || 1 };
    shader.uniforms.raisedArchGreenRadius = { value: archMapping?.greenRadius || 1 };
    shader.uniforms.raisedArchTangentX = { value: archMapping?.tangentX || 0 };
    shader.uniforms.raisedArchTangentY = { value: archMapping?.tangentY || 0 };
    shader.uniforms.raisedArchApexY = { value: archMapping?.apexY || 0 };
    shader.uniforms.raisedArchBandWidth = { value: archMapping?.bandWidth || brickWidth };
    shader.uniforms.raisedStraightTopY = { value: archMapping?.straightTopY ?? 1e6 };
    shader.uniforms.raisedStraightBottomY = { value: archMapping?.straightBottomY ?? -1e6 };
    shader.uniforms.raisedStraightInnerHalfWidth = { value: archMapping?.straightInnerHalfWidth ?? 1e6 };
    shader.uniforms.raisedStraightOuterHalfWidth = { value: archMapping?.straightOuterHalfWidth ?? 1e6 };
    shader.uniforms.raisedStraightSideBandWidth = { value: archMapping?.straightSideBandWidth || brickWidth };
    shader.uniforms.raisedBorderIsSoldier = { value: material.userData.raisedBorderOrientation === 'horizontal' ? 1 : 0 };
    shader.uniforms.raisedBorderIsJamb = { value: material.userData.raisedBorderOrientation === 'vertical' ? 1 : 0 };
    shader.uniforms.raisedBorderCourseUsesWorldZ = { value: material.userData.raisedBorderCourseAxis === 'z' ? 1 : 0 };
    shader.uniforms.raisedBorderUsesLocalCoordinates = { value: material.userData.raisedBorderCoordinateSpace === 'local' ? 1 : 0 };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vRaisedBrickWorldPosition;\nvarying vec3 vRaisedBrickLocalPosition;\nvarying vec3 vRaisedBrickWorldNormal;',
      )
      .replace(
        '#include <defaultnormal_vertex>',
        '#include <defaultnormal_vertex>\nvRaisedBrickWorldNormal = normalize(mat3(modelMatrix) * objectNormal);',
      )
      .replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\nvRaisedBrickWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvRaisedBrickLocalPosition = transformed;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vRaisedBrickWorldPosition;
varying vec3 vRaisedBrickLocalPosition;
varying vec3 vRaisedBrickWorldNormal;
uniform float raisedBrickWidth;
uniform float raisedBrickHeight;
uniform float raisedBrickMortar;
uniform vec3 raisedBrickMortarColor;
uniform float raisedArchEnabled;
uniform float raisedArchCenterX;
uniform float raisedArchRedOffset;
uniform float raisedArchRedHeight;
uniform float raisedArchRedStartAngle;
uniform float raisedArchGreenOffset;
uniform float raisedArchGreenHeight;
uniform float raisedArchRedRadius;
uniform float raisedArchGreenRadius;
uniform float raisedArchTangentX;
uniform float raisedArchTangentY;
uniform float raisedArchApexY;
uniform float raisedArchBandWidth;
uniform float raisedStraightTopY;
uniform float raisedStraightBottomY;
uniform float raisedStraightInnerHalfWidth;
uniform float raisedStraightOuterHalfWidth;
uniform float raisedStraightSideBandWidth;
uniform float raisedBorderIsSoldier;
uniform float raisedBorderIsJamb;
uniform float raisedBorderCourseUsesWorldZ;
uniform float raisedBorderUsesLocalCoordinates;
float raisedBrickHash(vec2 point) {
  return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453123);
}`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
{
  vec3 raisedBrickPosition = mix(vRaisedBrickWorldPosition, vRaisedBrickLocalPosition, raisedBorderUsesLocalCoordinates);
  vec3 derivativeX = dFdx(raisedBrickPosition);
  vec3 derivativeY = dFdy(raisedBrickPosition);
  vec3 faceDirection = abs(normalize(cross(derivativeX, derivativeY)));
  vec2 surfacePosition;
  bool useArchMapping = false;
  bool useWholeStraightBand = false;
  if (raisedArchEnabled > 0.5) {
    float sideDirection = raisedBrickPosition.x < raisedArchCenterX ? -1.0 : 1.0;
    vec2 archPoint = vec2(raisedArchCenterX + abs(raisedBrickPosition.x - raisedArchCenterX), raisedBrickPosition.y);
    vec2 redCenter = vec2(raisedArchCenterX - raisedArchRedOffset, raisedArchRedHeight);
    vec2 greenCenter = vec2(raisedArchCenterX - raisedArchGreenOffset, raisedArchGreenHeight);
    float redDistance = length(archPoint - redCenter);
    float greenDistance = length(archPoint - greenCenter);
    float redCurveDistance = abs(redDistance - raisedArchRedRadius);
    float greenCurveDistance = abs(greenDistance - raisedArchGreenRadius);
    float apexAngle = atan(raisedArchApexY - raisedArchGreenHeight, raisedArchGreenOffset);
    float greenTangentAngle = atan(raisedArchTangentY - raisedArchGreenHeight, raisedArchTangentX - (raisedArchCenterX - raisedArchGreenOffset));
    float redTangentAngle = atan(raisedArchTangentY - raisedArchRedHeight, raisedArchTangentX - (raisedArchCenterX - raisedArchRedOffset));
    float greenSegmentLength = raisedArchGreenRadius * abs(apexAngle - greenTangentAngle);
    float redCurrentAngle = atan(archPoint.y - raisedArchRedHeight, archPoint.x - (raisedArchCenterX - raisedArchRedOffset));
    float greenCurrentAngle = atan(archPoint.y - raisedArchGreenHeight, archPoint.x - (raisedArchCenterX - raisedArchGreenOffset));
    bool onRedArc = redCurrentAngle >= raisedArchRedStartAngle - 0.0001 && redCurrentAngle <= redTangentAngle + 0.0001;
    bool onGreenArc = greenCurrentAngle >= greenTangentAngle - 0.0001 && greenCurrentAngle <= apexAngle + 0.0001;
    float validRedDistance = onRedArc ? redCurveDistance : 1e6;
    float validGreenDistance = onGreenArc ? greenCurveDistance : 1e6;
    useArchMapping = min(validRedDistance, validGreenDistance) <= raisedArchBandWidth + raisedBrickMortar * 1.5;
    float radialDistance;
    float curveLength;
    if (validGreenDistance <= validRedDistance) {
      radialDistance = validGreenDistance;
      curveLength = raisedArchGreenRadius * abs(apexAngle - greenCurrentAngle);
    } else {
      radialDistance = validRedDistance;
      curveLength = greenSegmentLength + raisedArchRedRadius * abs(redTangentAngle - redCurrentAngle);
    }
    if (useArchMapping) surfacePosition = vec2(radialDistance, curveLength * sideDirection);
  }
  if (!useArchMapping && raisedArchEnabled > 0.5 && faceDirection.z >= faceDirection.x
      && (raisedBrickPosition.y >= raisedStraightTopY || raisedBrickPosition.y <= raisedStraightBottomY)) {
    float distanceAcrossBand = raisedBrickPosition.y >= raisedStraightTopY
      ? raisedBrickPosition.y - raisedStraightTopY
      : raisedStraightBottomY - raisedBrickPosition.y;
    surfacePosition = vec2(
      clamp(distanceAcrossBand / raisedStraightSideBandWidth, 0.0, 1.0) * raisedBrickWidth,
      raisedBrickPosition.x
    );
    useWholeStraightBand = true;
  } else if (!useArchMapping && raisedArchEnabled > 0.5 && faceDirection.z >= faceDirection.x
      && abs(raisedBrickPosition.x - raisedArchCenterX) >= raisedStraightOuterHalfWidth - raisedStraightSideBandWidth - 0.0001
      && abs(raisedBrickPosition.x - raisedArchCenterX) <= raisedStraightOuterHalfWidth + 0.0001) {
    float distanceFromOuterEdge = raisedStraightOuterHalfWidth - abs(raisedBrickPosition.x - raisedArchCenterX);
    surfacePosition = vec2(
      clamp(distanceFromOuterEdge / raisedStraightSideBandWidth, 0.0, 1.0) * raisedBrickWidth,
      raisedBrickPosition.y
    );
    useWholeStraightBand = true;
  } else if (!useArchMapping && raisedArchEnabled > 0.5 && faceDirection.z >= faceDirection.x
      && abs(raisedBrickPosition.x - raisedArchCenterX) >= raisedStraightInnerHalfWidth - 0.0001
      && abs(raisedBrickPosition.x - raisedArchCenterX) <= raisedStraightInnerHalfWidth + raisedStraightSideBandWidth + 0.0001) {
    float distanceFromOpeningEdge = abs(raisedBrickPosition.x - raisedArchCenterX) - raisedStraightInnerHalfWidth;
    surfacePosition = vec2(
      clamp(distanceFromOpeningEdge / raisedStraightSideBandWidth, 0.0, 1.0) * raisedBrickWidth,
      raisedBrickPosition.y
    );
    useWholeStraightBand = true;
  } else if (!useArchMapping && raisedBorderIsSoldier > 0.5
      && ((raisedBorderCourseUsesWorldZ < 0.5 && faceDirection.z >= max(faceDirection.x, faceDirection.y))
        || (raisedBorderCourseUsesWorldZ > 0.5 && faceDirection.x >= max(faceDirection.z, faceDirection.y)))) {
    // A lintel/soldier course is one solid masonry band: its short dimension
    // runs across the band and its mortared joints step along the opening.
    float coursePosition = mix(raisedBrickPosition.x, raisedBrickPosition.z, raisedBorderCourseUsesWorldZ);
    surfacePosition = vec2(raisedBrickPosition.y, coursePosition);
    useWholeStraightBand = true;
  } else if (!useArchMapping && raisedBorderIsJamb > 0.5 && faceDirection.z >= faceDirection.x) {
    surfacePosition = raisedBrickPosition.xy;
    useWholeStraightBand = true;
  } else if (!useArchMapping && faceDirection.y > max(faceDirection.x, faceDirection.z)) {
    surfacePosition = raisedBrickPosition.xz;
  } else if (!useArchMapping && faceDirection.x > faceDirection.z) {
    surfacePosition = vec2(raisedBrickPosition.z, raisedBrickPosition.y);
  } else if (!useArchMapping) {
    surfacePosition = raisedBrickPosition.xy;
  }
  float cellWidth = max(0.001, raisedBrickWidth + raisedBrickMortar);
  float cellHeight = max(0.001, raisedBrickHeight + raisedBrickMortar);
  float row = floor(surfacePosition.y / cellHeight);
  float courseY = mod(surfacePosition.y, cellHeight);
  float antialiasX = max(fwidth(surfacePosition.x), 0.00035);
  float antialiasY = max(fwidth(courseY), 0.00035);
  float shiftedX = surfacePosition.x + ((!useWholeStraightBand && !useArchMapping && mod(row, 2.0) >= 1.0) ? cellWidth * 0.5 : 0.0);
  float column = floor(shiftedX / cellWidth);
  float cellX = mod(shiftedX, cellWidth);
  float verticalJoint = (useWholeStraightBand || useArchMapping)
    ? 0.0
    : smoothstep(raisedBrickWidth - antialiasX, raisedBrickWidth + antialiasX, cellX);
  float horizontalJoint = smoothstep(raisedBrickHeight - antialiasY, raisedBrickHeight + antialiasY, courseY);
  float mortarMask = max(verticalJoint, horizontalJoint);
  float brickVariation = mix(0.96, 1.03, raisedBrickHash(vec2(column, row)));
  vec3 brickColor = diffuseColor.rgb * brickVariation;
  diffuseColor.rgb = mix(brickColor, raisedBrickMortarColor, mortarMask);
}`,
      );
  };
  material.customProgramCacheKey = () => 'mehraz-raised-north-border-brick-v2';
  material.needsUpdate = true;
  return material;
}

function applyWorldAlignedBrickUvs(geometry) {
  const positions = geometry.getAttribute('position');
  const normals = geometry.getAttribute('normal');
  const uvs = geometry.getAttribute('uv');
  if (!positions || !normals || !uvs) return geometry;
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const y = positions.getY(index);
    const z = positions.getZ(index);
    const normalX = Math.abs(normals.getX(index));
    const normalY = Math.abs(normals.getY(index));
    const normalZ = Math.abs(normals.getZ(index));
    let u;
    let v;
    if (normalY > 0.9) {
      // Horizontal wall tops: keep the bond laid flat along the wall.
      u = normalX > normalZ ? z : x;
      v = normalX > normalZ ? x : z;
    } else if (normalZ > 0.9) {
      // North/south faces and their returns.
      u = x;
      v = y;
    } else {
      // East/west faces and every curved extrusion reveal. World Y always
      // remains the course direction, preventing vertical bricks on arches.
      u = z;
      v = y;
    }
    uvs.setXY(index, u, v);
  }
  uvs.needsUpdate = true;
  return geometry;
}

export function archCourseDistanceAtPoint(x, y, archPoints) {
  if (!Array.isArray(archPoints) || archPoints.length < 2) return 0;
  const segmentLengths = [];
  const cumulative = [0];
  for (let index = 0; index < archPoints.length - 1; index += 1) {
    const length = archPoints[index].distanceTo(archPoints[index + 1]);
    segmentLengths.push(length);
    cumulative.push(cumulative[index] + length);
  }
  const totalLength = cumulative[cumulative.length - 1];
  let nearestDistanceSquared = Infinity;
  let nearestCourseDistance = 0;
  for (let index = 0; index < segmentLengths.length; index += 1) {
    const start = archPoints[index];
    const end = archPoints[index + 1];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    const progress = lengthSquared > 0.00000001
      ? THREE.MathUtils.clamp(((x - start.x) * dx + (y - start.y) * dy) / lengthSquared, 0, 1)
      : 0;
    const projectedX = start.x + dx * progress;
    const projectedY = start.y + dy * progress;
    const distanceSquared = (projectedX - x) ** 2 + (projectedY - y) ** 2;
    if (distanceSquared >= nearestDistanceSquared) continue;
    nearestDistanceSquared = distanceSquared;
    const alongCurve = cumulative[index] + segmentLengths[index] * progress;
    nearestCourseDistance = Math.min(alongCurve, totalLength - alongCurve);
  }
  return nearestCourseDistance;
}

function applyBentArchBrickUvs(geometry, archPoints, springHeight) {
  const positions = geometry.getAttribute('position');
  const normals = geometry.getAttribute('normal');
  const uvs = geometry.getAttribute('uv');
  if (!positions || !normals || !uvs || !archPoints?.length) return geometry;
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const y = positions.getY(index);
    const z = positions.getZ(index);
    const courseDistance = archCourseDistanceAtPoint(x, y, archPoints);
    const facesVaultDepth = Math.abs(normals.getZ(index)) < 0.8;
    uvs.setXY(
      index,
      facesVaultDepth ? z : Math.hypot(x - archPoints[0].x, y - archPoints[0].y),
      springHeight + courseDistance,
    );
  }
  uvs.needsUpdate = true;
  geometry.userData.archBrickMapping = 'constant-height-bent-courses';
  return geometry;
}

function applyWallContinuationBrickUvs(geometry, supportSide, cornerSide = null) {
  const positions = geometry.getAttribute('position');
  const uvs = geometry.getAttribute('uv');
  if (!positions || !uvs) return geometry;
  const followsSideWall = supportSide === 'east' || supportSide === 'west';
  for (let index = 0; index < positions.count; index += 1) {
    // Project the vertical wall bond through the bent infill: course height
    // remains world Y while the horizontal bond axis remains the wall axis.
    // The roof curvature changes the surface position, not the brick phase.
    let horizontal = followsSideWall
      ? (supportSide === 'west' ? -positions.getZ(index) : positions.getZ(index))
      : positions.getX(index);
    if (cornerSide) {
      // Develop both corner roofs from their bearing rib leg toward the south
      // corner using mirrored local axes. The former global axes reversed one
      // corner's brick development even though its geometry was symmetric.
      horizontal = supportSide === 'south'
        ? (cornerSide === 'west' ? positions.getX(index) : -positions.getX(index))
        : -positions.getZ(index);
    }
    uvs.setXY(index, horizontal, positions.getY(index));
  }
  uvs.needsUpdate = true;
  return geometry;
}

function applyMirroredNorthFaceUvs(geometry, centerX) {
  const positions = geometry.getAttribute('position');
  const normals = geometry.getAttribute('normal');
  const uvs = geometry.getAttribute('uv');
  if (!positions || !normals || !uvs || !Number.isFinite(centerX)) return geometry;
  for (let index = 0; index < positions.count; index += 1) {
    const normalZ = Math.abs(normals.getZ(index));
    const normalY = Math.abs(normals.getY(index));
    if (normalZ <= normalY) continue;
    uvs.setX(index, centerX * 2 - positions.getX(index));
  }
  uvs.needsUpdate = true;
  return geometry;
}

function box(width, height, depth, material, position, side) {
  const geometry = applyWorldAlignedBrickUvs(new THREE.BoxGeometry(width, height, depth));
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.wallSide = side;
  return mesh;
}

function sideWallMaterials(walls, side, thickness, height, depth, phaseU) {
  // BoxGeometry uses: +X, -X, +Y, -Y, +Z, -Z. Give each plane its
  // real dimensions instead of stretching one wall texture across all faces.
  const longFace = () => wallMaterial(walls, side, depth, height, true, phaseU);
  const horizontalFace = () => wallMaterial(walls, side, thickness, depth, true, phaseU);
  const returnFace = (phaseOffset) => wallMaterial(
    walls,
    side,
    thickness,
    height,
    true,
    phaseU + phaseOffset,
  );
  return [
    longFace(),
    longFace(),
    horizontalFace(),
    horizontalFace(),
    returnFace(depth),
    returnFace(0),
  ];
}

function rectangleShape(left, right, height, holes = []) {
  const shape = new THREE.Shape();
  shape.moveTo(left, 0);
  shape.lineTo(right, 0);
  shape.lineTo(right, height);
  shape.lineTo(left, height);
  shape.closePath();
  holes.forEach((hole) => shape.holes.push(hole));
  return shape;
}

function rectangleShapeWithDoorNotch(left, right, height, door = null, holes = []) {
  if (!door || door.top <= 0.001 || door.right <= left || door.left >= right) {
    return rectangleShape(left, right, height, holes);
  }
  const doorLeft = Math.max(left, door.left);
  const doorRight = Math.min(right, door.right);
  const doorTop = Math.min(height, door.top);
  if (doorRight - doorLeft <= 0.001 || doorTop <= 0.001) {
    return rectangleShape(left, right, height, holes);
  }
  const shape = new THREE.Shape();
  shape.moveTo(left, 0);
  shape.lineTo(doorLeft, 0);
  const headPoints = door.archPoints?.length
    ? door.archPoints
    : [new THREE.Vector2(doorLeft, doorTop), new THREE.Vector2(doorRight, doorTop)];
  shape.lineTo(doorLeft, headPoints[0].y);
  headPoints.slice(1).forEach((point) => shape.lineTo(point.x, Math.min(height, point.y)));
  shape.lineTo(doorRight, 0);
  shape.lineTo(right, 0);
  shape.lineTo(right, height);
  shape.lineTo(left, height);
  shape.closePath();
  holes.forEach((hole) => shape.holes.push(hole));
  return shape;
}

function rectangleHole(left, bottom, right, top) {
  const hole = new THREE.Path();
  hole.moveTo(left, bottom);
  hole.lineTo(left, top);
  hole.lineTo(right, top);
  hole.lineTo(right, bottom);
  hole.closePath();
  return hole;
}

function archCappedWallShape(left, right, archPoints, holes = []) {
  if (!archPoints?.length) return null;
  const first = archPoints[0];
  const last = archPoints[archPoints.length - 1];
  const shape = new THREE.Shape();
  shape.moveTo(left, 0);
  shape.lineTo(right, 0);
  shape.lineTo(right, last.y);
  if (right > last.x) shape.lineTo(last.x, last.y);
  [...archPoints].reverse().forEach((point) => shape.lineTo(point.x, point.y));
  if (left < first.x) shape.lineTo(left, first.y);
  shape.lineTo(left, 0);
  shape.closePath();
  holes.forEach((hole) => shape.holes.push(hole));
  return shape;
}

function clippedOpeningHead(opening, outerArchPoints, inset = 0.0001) {
  const ceilingAt = (x) => Math.max(0, archHeightAtX(outerArchPoints, x) - inset);
  if (opening.archPoints?.length) {
    return opening.archPoints.map((point) => new THREE.Vector2(
      point.x,
      Math.min(point.y, ceilingAt(point.x)),
    ));
  }
  const top = Math.min(opening.top, ceilingAt(opening.left), ceilingAt(opening.right));
  return [
    new THREE.Vector2(opening.left, top),
    new THREE.Vector2(opening.right, top),
  ];
}

function archCapShape(left, right, baseline, archPoints, holes = [], openings = []) {
  if (!archPoints?.length) return null;
  const first = archPoints[0];
  const last = archPoints[archPoints.length - 1];
  const baseY = Math.max(0, Math.min(baseline, first.y, last.y));
  const capOpenings = openings
    .filter((opening) => opening && opening.top > baseY + 0.0001 && opening.right > left && opening.left < right)
    .map((opening) => ({
      ...opening,
      left: Math.max(left, opening.left),
      right: Math.min(right, opening.right),
    }));
  const baselineOpenings = capOpenings
    .filter((opening) => opening.bottom <= baseY + 0.0001)
    .sort((a, b) => b.right - a.right);
  const shape = new THREE.Shape();
  shape.moveTo(left, baseY);
  if (left < first.x) shape.lineTo(first.x, baseY);
  archPoints.forEach((point) => shape.lineTo(point.x, point.y));
  if (right > last.x) shape.lineTo(right, baseY);
  baselineOpenings.forEach((opening) => {
    if (opening.right - opening.left <= 0.0001) return;
    const head = clippedOpeningHead(opening, archPoints);
    if (!head.length || Math.max(...head.map((point) => point.y)) <= baseY + 0.0001) return;
    shape.lineTo(opening.right, baseY);
    shape.lineTo(opening.right, Math.max(baseY, head.at(-1).y));
    [...head].reverse().slice(1).forEach((point) => shape.lineTo(point.x, Math.max(baseY, point.y)));
    shape.lineTo(opening.left, baseY);
  });
  shape.lineTo(left, baseY);
  shape.closePath();
  holes.forEach((hole) => shape.holes.push(hole));
  capOpenings
    .filter((opening) => opening.bottom > baseY + 0.0001)
    .forEach((opening) => {
      const head = clippedOpeningHead(opening, archPoints);
      if (!head.length || Math.max(...head.map((point) => point.y)) <= opening.bottom + 0.0001) return;
      const hole = new THREE.Path();
      hole.moveTo(opening.left, opening.bottom);
      hole.lineTo(opening.left, head[0].y);
      head.slice(1).forEach((point) => hole.lineTo(point.x, point.y));
      hole.lineTo(opening.right, opening.bottom);
      hole.closePath();
      shape.holes.push(hole);
    });
  return shape;
}

function sampleCircularArc(center, radius, startAngle, endAngle, segments) {
  let delta = endAngle - startAngle;
  while (delta <= -Math.PI) delta += Math.PI * 2;
  while (delta > Math.PI) delta -= Math.PI * 2;
  return Array.from({ length: segments + 1 }, (_, index) => {
    const angle = startAngle + delta * (index / segments);
    return new THREE.Vector2(center.x + Math.cos(angle) * radius, center.y + Math.sin(angle) * radius);
  });
}

export function pointedArchConstruction(centerX, halfSpan, sideHeight, greenOffset, greenHeight, options = {}) {
  const redOffset = Number(options.redOffset) || 0;
  const sidePoint = new THREE.Vector2(centerX + halfSpan, sideHeight);
  const redCenterX = centerX - redOffset;
  const springDistanceX = Math.max(0.00001, Math.abs(sidePoint.x - redCenterX));
  const requestedRedRadius = Number(options.redRadius);
  const redRadius = options.redRadius != null && Number.isFinite(requestedRedRadius)
    ? Math.max(springDistanceX, requestedRedRadius)
    : springDistanceX;
  const redHeight = sideHeight - Math.sqrt(Math.max(0, redRadius * redRadius - springDistanceX * springDistanceX));
  const redCenter = new THREE.Vector2(redCenterX, redHeight);
  const greenCenter = new THREE.Vector2(centerX - greenOffset, greenHeight);
  const centersDistance = redCenter.distanceTo(greenCenter);
  if (!Number.isFinite(redRadius) || redRadius <= 0.00001 || centersDistance <= 0.00001) return null;
  const greenRadius = redRadius + centersDistance;
  const tangentPoint = redCenter.clone().addScaledVector(
    redCenter.clone().sub(greenCenter).normalize(),
    redRadius,
  );
  const apexPoint = new THREE.Vector2(
    centerX,
    greenHeight + Math.sqrt(Math.max(0, greenRadius * greenRadius - greenOffset * greenOffset)),
  );
  return {
    centerX,
    sidePoint,
    redCenter,
    greenCenter,
    redOffset,
    greenOffset,
    greenHeight,
    redRadius,
    greenRadius,
    tangentPoint,
    apexPoint,
  };
}

function openingHole(opening) {
  return opening?.archPoints?.length
    ? archOpeningPath(opening.archPoints, opening.bottom)
    : rectangleHole(opening.left, opening.bottom, opening.right, opening.top);
}

export function archCurve(centerX, halfSpan, sideHeight, redHeight, greenOffset, greenHeight, count = 36, options = {}) {
  const construction = pointedArchConstruction(centerX, halfSpan, sideHeight, greenOffset, greenHeight, options);
  if (!construction) return [];
  const { redCenter, greenCenter, redRadius, greenRadius, sidePoint, tangentPoint, apexPoint } = construction;
  const redArc = sampleCircularArc(
    redCenter,
    redRadius,
    Math.atan2(sidePoint.y - redCenter.y, sidePoint.x - redCenter.x),
    Math.atan2(tangentPoint.y - redCenter.y, tangentPoint.x - redCenter.x),
    count,
  );
  const greenArc = sampleCircularArc(
    greenCenter,
    greenRadius,
    Math.atan2(tangentPoint.y - greenCenter.y, tangentPoint.x - greenCenter.x),
    Math.atan2(apexPoint.y - greenCenter.y, apexPoint.x - greenCenter.x),
    count,
  );
  const rightHalf = [...redArc, ...greenArc.slice(1)];
  const leftHalf = rightHalf.map((point) => new THREE.Vector2(centerX * 2 - point.x, point.y));
  return [...leftHalf, ...[...rightHalf].reverse().slice(1)];
}

/**
 * Place the centerline point at the base of the reference rib's right leg on
 * the corresponding base point of the opposite leg of the first rotated rib.
 * The calculation is performed in the
 * Karbandi plan before the shared group transform, so rotation offset, group
 * translation, and uniform scale preserve the coincidence.
 */
function karbandiReferenceZCandidates(karbandi = {}, buildingDepth = 30) {
  const candidates = [];
  const ribCount = Math.max(2, Math.min(64, Math.round(Number(karbandi.ribCount) || 2)));
  const halfSpan = Math.max(0.1, Number(karbandi.span) || DEFAULT_WALL_SYSTEM.karbandi.span) / 2;
  const unfoldedLegBaseX = halfSpan;
  const referenceAngle = Number(karbandi.referenceAngle) || DEFAULT_WALL_SYSTEM.karbandi.referenceAngle;
  const halfFold = THREE.MathUtils.degToRad((180 - referenceAngle) / 2);
  const foldedX = Math.cos(halfFold) * unfoldedLegBaseX;
  const foldedZ = Math.sin(halfFold) * unfoldedLegBaseX;
  const step = Math.PI * 2 / ribCount;
  const minimumZ = 0.001;
  const maximumZ = Math.max(minimumZ, Math.min(30, Number(buildingDepth) || 30) - 0.001);
  const rotatePlan = (point, angle) => ({
    x: Math.cos(angle) * point.x + Math.sin(angle) * point.z,
    z: -Math.sin(angle) * point.x + Math.cos(angle) * point.z,
  });

  // Rotate through successive rib copies and solve in the horizontal wall-top
  // plane. A valid solution keeps the two base centres one half rib-depth
  // apart so their physical bands meet without a visible gap.
  const baseEdgeOffset = Math.max(
    0.01,
    Number(karbandi.ribDepth) || DEFAULT_WALL_SYSTEM.karbandi.ribDepth,
  ) / 2;
  for (let copyIndex = 1; copyIndex < ribCount; copyIndex += 1) {
    const angle = step * copyIndex;
    for (const referenceSide of [1, -1]) {
      const referenceBase = { x: referenceSide * foldedX, z: foldedZ };
      const otherBase = { x: -referenceSide * foldedX, z: foldedZ };
      const rotatedOtherBase = rotatePlan(otherBase, angle);
      const rotatedZAxis = rotatePlan({ x: 0, z: 1 }, angle);
      const coefficient = { x: -rotatedZAxis.x, z: 1 - rotatedZAxis.z };
      const constant = {
        x: referenceBase.x - rotatedOtherBase.x,
        z: referenceBase.z - rotatedOtherBase.z,
      };
      const quadraticA = coefficient.x ** 2 + coefficient.z ** 2;
      if (quadraticA < 1e-10) continue;
      const quadraticB = 2 * (coefficient.x * constant.x + coefficient.z * constant.z);
      const quadraticC = constant.x ** 2 + constant.z ** 2 - baseEdgeOffset ** 2;
      const discriminant = quadraticB ** 2 - 4 * quadraticA * quadraticC;
      if (discriminant < -1e-10) continue;
      const root = Math.sqrt(Math.max(0, discriminant));
      // Folding the reference rib must stay on the same root used at 180
      // degrees. Only an independently rotated whole assembly uses the mirrored
      // lower root; changing 180 to 179 must never change the leg pairing.
      const preferLowerRoot = Math.abs(Number(karbandi.groupRotationY) || 0) > 0.000001;
      const referenceZ = [(-quadraticB - root) / (2 * quadraticA), (-quadraticB + root) / (2 * quadraticA)]
        .filter((value) => value >= minimumZ && value <= maximumZ)
        .sort((left, right) => (preferLowerRoot ? left - right : right - left))[0];
      if (referenceZ == null) continue;
      const separationX = constant.x + coefficient.x * referenceZ;
      const separationZ = constant.z + coefficient.z * referenceZ;
      if (Math.abs(Math.hypot(separationX, separationZ) - baseEdgeOffset) > 1e-7) continue;
      const value = THREE.MathUtils.clamp(Math.round(referenceZ * 1e6) / 1e6, minimumZ, maximumZ);
      candidates.push({ value, copyIndex, referenceSide });
    }
  }
  return candidates;
}

export function karbandiReferenceZSolutions(karbandi = {}, buildingDepth = 30) {
  return [...new Set(
    karbandiReferenceZCandidates(karbandi, buildingDepth).map((candidate) => candidate.value.toFixed(6)),
  )].map(Number).sort((left, right) => left - right);
}

export function karbandiReferenceZForRibCount(karbandi = {}, buildingDepth = 30) {
  const minimumZ = 0.001;
  const maximumZ = Math.max(minimumZ, Math.min(30, Number(buildingDepth) || 30) - 0.001);
  const firstCandidate = karbandiReferenceZCandidates(karbandi, buildingDepth)[0];
  if (firstCandidate) return firstCandidate.value;
  return THREE.MathUtils.clamp(
    Number(karbandi.referenceZ) || DEFAULT_WALL_SYSTEM.karbandi.referenceZ,
    minimumZ,
    maximumZ,
  );
}

function karbandiReferenceLegCenters(karbandi = {}, building = {}, walls = {}, spanOverride = null, groupZOverride = null) {
  const halfWidth = Math.max(1, Number(building.width) / 2 || 1);
  const halfDepth = Math.max(1, Number(building.depth) / 2 || 1);
  const wallThickness = Math.max(0.1, Number(building.wallThickness) || 0.4);
  const westX = -halfWidth - (Number(walls.sideOffsets?.west) || 0);
  const eastX = halfWidth + (Number(walls.sideOffsets?.east) || 0);
  const northZ = -halfDepth - (Number(walls.sideOffsets?.north) || 0);
  const southZ = halfDepth + (Number(walls.sideOffsets?.south) || 0);
  const centerX = (westX + eastX) / 2;
  const centerZ = building.type === 'room' ? (northZ + southZ) / 2 : northZ - wallThickness;
  const span = spanOverride == null
    ? Math.max(0.2, Number(karbandi.span) || DEFAULT_WALL_SYSTEM.karbandi.span)
    : Math.max(0, Number(spanOverride) || 0);
  const halfSpan = span / 2;
  const referenceAngle = Number(karbandi.referenceAngle) || DEFAULT_WALL_SYSTEM.karbandi.referenceAngle;
  const halfFold = THREE.MathUtils.degToRad((180 - referenceAngle) / 2);
  const foldCosine = Math.cos(halfFold);
  const foldSine = Math.sin(halfFold);
  const referenceX = Number(karbandi.referenceX) || 0;
  const referenceZ = Number(karbandi.referenceZ) || 0;
  const ribRotation = THREE.MathUtils.degToRad(
    (Number(karbandi.rotationOffset) || 0) + (Number(karbandi.referenceRotation) || 0),
  );
  const groupRotation = THREE.MathUtils.degToRad(Number(karbandi.groupRotationY) || 0);
  const groupScale = Math.max(0.05, Number(karbandi.groupScale) || DEFAULT_WALL_SYSTEM.karbandi.groupScale);
  const groupX = Number(karbandi.groupX) || 0;
  const groupZ = groupZOverride == null
    ? (Number(karbandi.groupZ) || 0)
    : Number(groupZOverride) || 0;
  const ribCosine = Math.cos(ribRotation);
  const ribSine = Math.sin(ribRotation);
  const groupCosine = Math.cos(groupRotation);
  const groupSine = Math.sin(groupRotation);
  const points = [-1, 1].map((side) => {
    const unfoldedX = side * halfSpan;
    const foldedX = foldCosine * unfoldedX;
    const foldedZ = side * foldSine * unfoldedX;
    const localX = foldedX + referenceX;
    const localZ = foldedZ + referenceZ;
    const rotatedX = ribCosine * localX + ribSine * localZ;
    const rotatedZ = -ribSine * localX + ribCosine * localZ;
    const scaledX = rotatedX * groupScale;
    const scaledZ = rotatedZ * groupScale;
    return {
      side: side < 0 ? 'left' : 'right',
      x: centerX + groupX + groupCosine * scaledX + groupSine * scaledZ,
      z: centerZ + groupZ - groupSine * scaledX + groupCosine * scaledZ,
    };
  });
  return { points, bounds: { westX, eastX, northZ, southZ } };
}

/**
 * Resize the reference rib so its two leg centre-lines seat on the nearest
 * pair of finite interior wall faces. Move Z is solved for every candidate,
 * so span and assembly translation are selected as one architectural fit.
 */
export function karbandiSpanForWallLegCenters(karbandi = {}, building = {}, walls = {}) {
  const minimumSpan = 0.2;
  const maximumSpan = 40;
  const currentSpan = THREE.MathUtils.clamp(
    Number(karbandi.span) || DEFAULT_WALL_SYSTEM.karbandi.span,
    minimumSpan,
    maximumSpan,
  );
  const zero = karbandiReferenceLegCenters(karbandi, building, walls, 0, 0);
  const unit = karbandiReferenceLegCenters(karbandi, building, walls, 1, 0);
  const { westX, eastX, northZ, southZ } = zero.bounds;
  const candidates = [currentSpan];
  const addCandidate = (value) => {
    if (!Number.isFinite(value) || value < minimumSpan - 0.000001 || value > maximumSpan + 0.000001) return;
    candidates.push(THREE.MathUtils.clamp(value, minimumSpan, maximumSpan));
  };
  zero.points.forEach((point, index) => {
    const xPerSpan = unit.points[index].x - point.x;
    if (Math.abs(xPerSpan) < 0.0000001) return;
    addCandidate((westX - point.x) / xPerSpan);
    addCandidate((eastX - point.x) / xPerSpan);
  });
  const xSeparationPerSpan = (unit.points[1].x - unit.points[0].x)
    - (zero.points[1].x - zero.points[0].x);
  const zSeparationPerSpan = (unit.points[1].z - unit.points[0].z)
    - (zero.points[1].z - zero.points[0].z);
  if (Math.abs(xSeparationPerSpan) > 0.0000001) addCandidate(Math.abs((eastX - westX) / xSeparationPerSpan));
  if (Math.abs(zSeparationPerSpan) > 0.0000001) addCandidate(Math.abs((southZ - northZ) / zSeparationPerSpan));

  const wallDistance = (point, wall) => {
    if (wall === 'west' || wall === 'east') {
      const wallX = wall === 'west' ? westX : eastX;
      const clampedZ = THREE.MathUtils.clamp(point.z, northZ, southZ);
      return Math.hypot(point.x - wallX, point.z - clampedZ);
    }
    const wallZ = wall === 'north' ? northZ : southZ;
    const clampedX = THREE.MathUtils.clamp(point.x, westX, eastX);
    return Math.hypot(point.x - clampedX, point.z - wallZ);
  };
  const wallNames = ['west', 'east', 'north', 'south'];
  const scored = [...new Set(candidates.map((value) => Math.round(value * 1e9) / 1e9))].map((span) => {
    const withSpan = { ...karbandi, span };
    const groupZ = karbandiGroupZForWallLegCenters(withSpan, building, walls);
    const { points } = karbandiReferenceLegCenters(withSpan, building, walls, span, groupZ);
    let bestPair = null;
    wallNames.forEach((leftWall) => {
      wallNames.forEach((rightWall) => {
        if (leftWall === rightWall) return;
        const distances = [wallDistance(points[0], leftWall), wallDistance(points[1], rightWall)];
        const pair = {
          maximumDistance: Math.max(...distances),
          totalDistance: distances[0] + distances[1],
        };
        if (!bestPair
          || pair.maximumDistance < bestPair.maximumDistance
          || (Math.abs(pair.maximumDistance - bestPair.maximumDistance) < 0.0000001
            && pair.totalDistance < bestPair.totalDistance)) bestPair = pair;
      });
    });
    return {
      span,
      maximumDistance: bestPair?.maximumDistance ?? Infinity,
      totalDistance: bestPair?.totalDistance ?? Infinity,
      change: Math.abs(span - currentSpan),
    };
  });
  scored.sort((left, right) => (
    left.maximumDistance - right.maximumDistance
    || left.totalDistance - right.totalDistance
    || left.change - right.change
    || left.span - right.span
  ));
  return scored[0]?.span ?? currentSpan;
}

/** Keep the shared 3D centre of every rib leg base exactly on wall-top level. */
export function karbandiGroupYForWallTopLegCenters(karbandi = {}, building = {}, walls = {}) {
  const buildingHeight = Math.max(0.05, Number(building.height) || 6);
  const eastTop = Math.max(0.05, buildingHeight + (Number(walls.extraHeights?.east) || 0));
  const westTop = Math.max(0.05, buildingHeight + (Number(walls.extraHeights?.west) || 0));
  const wallTop = building.type === 'room'
    ? Math.max(
      eastTop,
      westTop,
      buildingHeight + (Number(walls.extraHeights?.north) || 0),
      buildingHeight + (Number(walls.extraHeights?.south) || 0),
    )
    : Math.max(eastTop, westTop);
  const untransformedBaseY = wallTop + (Number(karbandi.springHeightOffset) || 0);
  const groupScale = Math.max(0.05, Number(karbandi.groupScale) || DEFAULT_WALL_SYSTEM.karbandi.groupScale);
  return THREE.MathUtils.clamp(wallTop - untransformedBaseY * groupScale, -40, 40);
}

/**
 * Translate the whole Karbandi assembly in Z so the centreline of a south-wall
 * leg sits on the interior face while retaining the best available east/west
 * wall supports. Ties resolve to the solution nearest the current Move Z.
 */
export function karbandiGroupZForWallLegCenters(karbandi = {}, building = {}, walls = {}) {
  const halfWidth = Math.max(1, Number(building.width) / 2 || 1);
  const halfDepth = Math.max(1, Number(building.depth) / 2 || 1);
  const wallThickness = Math.max(0.1, Number(building.wallThickness) || 0.4);
  const westX = -halfWidth - (Number(walls.sideOffsets?.west) || 0);
  const eastX = halfWidth + (Number(walls.sideOffsets?.east) || 0);
  const northZ = -halfDepth - (Number(walls.sideOffsets?.north) || 0);
  const southZ = halfDepth + (Number(walls.sideOffsets?.south) || 0);
  const centerX = (westX + eastX) / 2;
  const centerZ = northZ - wallThickness;
  const ribCount = Math.max(2, Math.min(64, Math.round(Number(karbandi.ribCount) || DEFAULT_WALL_SYSTEM.karbandi.ribCount)));
  const halfSpan = Math.max(0.1, Number(karbandi.span) || DEFAULT_WALL_SYSTEM.karbandi.span) / 2;
  const referenceAngle = Number(karbandi.referenceAngle) || DEFAULT_WALL_SYSTEM.karbandi.referenceAngle;
  const halfFold = THREE.MathUtils.degToRad((180 - referenceAngle) / 2);
  const foldCosine = Math.cos(halfFold);
  const foldSine = Math.sin(halfFold);
  const referenceX = Number(karbandi.referenceX) || 0;
  const referenceZ = Number(karbandi.referenceZ) || 0;
  const ribRotation = THREE.MathUtils.degToRad(
    (Number(karbandi.rotationOffset) || 0) + (Number(karbandi.referenceRotation) || 0),
  );
  const groupRotation = THREE.MathUtils.degToRad(Number(karbandi.groupRotationY) || 0);
  const groupScale = Math.max(0.05, Number(karbandi.groupScale) || DEFAULT_WALL_SYSTEM.karbandi.groupScale);
  const groupX = Number(karbandi.groupX) || 0;
  const currentGroupZ = Number.isFinite(Number(karbandi.groupZ))
    ? Number(karbandi.groupZ)
    : DEFAULT_WALL_SYSTEM.karbandi.groupZ;
  if (building.type === 'room') return 0;
  const groupCosine = Math.cos(groupRotation);
  const groupSine = Math.sin(groupRotation);
  const endpoints = [];
  for (let ribIndex = 0; ribIndex < ribCount; ribIndex += 1) {
    const angle = ribRotation + Math.PI * 2 * ribIndex / ribCount;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    for (const side of [-1, 1]) {
      const unfoldedX = side * halfSpan;
      const foldedX = foldCosine * unfoldedX;
      const foldedZ = side * foldSine * unfoldedX;
      const localX = foldedX + referenceX;
      const localZ = foldedZ + referenceZ;
      const rotatedX = cosine * localX + sine * localZ;
      const rotatedZ = -sine * localX + cosine * localZ;
      const scaledX = rotatedX * groupScale;
      const scaledZ = rotatedZ * groupScale;
      endpoints.push({
        ribIndex,
        side: side < 0 ? 'left' : 'right',
        x: centerX + groupX + groupCosine * scaledX + groupSine * scaledZ,
        z: centerZ - groupSine * scaledX + groupCosine * scaledZ,
      });
    }
  }
  const candidates = endpoints
    .filter((point) => point.x >= westX - wallThickness && point.x <= eastX + wallThickness)
    .map((point) => THREE.MathUtils.clamp(southZ - point.z, -40, 40));
  if (!candidates.length) return currentGroupZ;
  const contactReach = wallThickness + Math.max(
    Number(karbandi.ribWidth) || DEFAULT_WALL_SYSTEM.karbandi.ribWidth,
    Number(karbandi.ribDepth) || DEFAULT_WALL_SYSTEM.karbandi.ribDepth,
  ) * groupScale;
  const score = (groupZ) => {
    const wallDistances = { west: Infinity, east: Infinity, south: Infinity };
    endpoints.forEach((point) => {
      const z = point.z + groupZ;
      if (z >= northZ - wallThickness && z <= southZ + wallThickness) {
        const westDistance = Math.abs(point.x - westX);
        const eastDistance = Math.abs(point.x - eastX);
        if (westDistance <= contactReach) wallDistances.west = Math.min(wallDistances.west, westDistance);
        if (eastDistance <= contactReach) wallDistances.east = Math.min(wallDistances.east, eastDistance);
      }
      if (point.x >= westX - wallThickness && point.x <= eastX + wallThickness) {
        const southDistance = Math.abs(z - southZ);
        if (southDistance <= contactReach) wallDistances.south = Math.min(wallDistances.south, southDistance);
      }
    });
    const finiteDistances = Object.values(wallDistances).filter(Number.isFinite);
    return {
      groupZ,
      wallCount: finiteDistances.length,
      maximumDistance: finiteDistances.length ? Math.max(...finiteDistances) : Infinity,
      totalDistance: finiteDistances.reduce((sum, distance) => sum + distance, 0),
      movement: Math.abs(groupZ - currentGroupZ),
    };
  };
  const solutions = [...new Set(candidates.map((candidate) => Math.round(candidate * 1e9) / 1e9))].map(score);
  solutions.sort((left, right) => (
    right.wallCount - left.wallCount
    || left.movement - right.movement
    || left.maximumDistance - right.maximumDistance
    || left.totalDistance - right.totalDistance
    || left.groupZ - right.groupZ
  ));
  return solutions[0]?.groupZ ?? currentGroupZ;
}

/**
 * Resolve all angle/count/Z-dependent seating values as one deterministic unit.
 * Repeating span/Z once removes dependence on the previous editor state: an
 * input reached through any stepper produces the same layout as that input in
 * a freshly loaded design. An explicitly selected overlap Z can be preserved
 * while the dependent span and group translation are still solved from fresh
 * defaults.
 */
export function solveKarbandiWallSeating(karbandi = {}, building = {}, walls = {}, options = {}) {
  const preserveReferenceZ = options.preserveReferenceZ === true;
  const portalHalfVestibule = building.type !== 'room' && building.portalPlanShape === 'octagon';
  const seatingBuilding = portalHalfVestibule
    ? {
      ...building,
      type: 'room',
      buildingType: 'vestibule',
      depth: Math.max(2, (Number(building.depth) || 2) * 2),
      length: Math.max(2, (Number(building.depth) || 2) * 2),
    }
    : building;
  const solutionDepth = seatingBuilding.type === 'room'
    ? Math.max(0.2, Math.min(Number(seatingBuilding.width) || 4, Number(seatingBuilding.depth) || 4) / 2)
    : seatingBuilding.depth;
  const solved = {
    ...karbandi,
    span: DEFAULT_WALL_SYSTEM.karbandi.span,
    groupZ: DEFAULT_WALL_SYSTEM.karbandi.groupZ,
  };
  if (!preserveReferenceZ) solved.referenceZ = karbandiReferenceZForRibCount(solved, solutionDepth);
  solved.span = karbandiSpanForWallLegCenters(solved, seatingBuilding, walls);
  if (!preserveReferenceZ) solved.referenceZ = karbandiReferenceZForRibCount(solved, solutionDepth);
  solved.span = karbandiSpanForWallLegCenters(solved, seatingBuilding, walls);
  if (!preserveReferenceZ) solved.referenceZ = karbandiReferenceZForRibCount(solved, solutionDepth);
  solved.groupY = karbandiGroupYForWallTopLegCenters(solved, seatingBuilding, walls);
  solved.groupZ = karbandiGroupZForWallLegCenters(solved, seatingBuilding, walls);
  if (portalHalfVestibule) {
    solved.portalHalfVestibuleSeating = true;
    solved.portalHalfVestibuleFullDepth = seatingBuilding.depth;
  }
  return solved;
}

function pointedArchBrickMapping(centerX, halfSpan, sideHeight, redHeight, greenOffset, greenHeight, bandWidth, straightTopY, straightBottomY, straightOuterHalfWidth, options = {}) {
  const construction = pointedArchConstruction(centerX, halfSpan, sideHeight, greenOffset, greenHeight, options);
  if (!construction) return null;
  const { redCenter, redOffset, redRadius, greenRadius, sidePoint, tangentPoint, apexPoint } = construction;
  return {
    enabled: true,
    centerX,
    redOffset,
    redHeight: redCenter.y,
    redStartAngle: Math.atan2(sidePoint.y - redCenter.y, sidePoint.x - redCenter.x),
    greenOffset,
    greenHeight,
    redRadius,
    greenRadius,
    tangentX: tangentPoint.x,
    tangentY: tangentPoint.y,
    apexY: apexPoint.y,
    bandWidth: Math.max(0.01, Number(bandWidth) || DEFAULT_WALL_SYSTEM.bricks.brickWidth),
    straightTopY: Number.isFinite(straightTopY) ? straightTopY : 1e6,
    straightBottomY: Number.isFinite(straightBottomY) ? straightBottomY : -1e6,
    straightInnerHalfWidth: Math.max(0.01, Number(halfSpan) || 0.01),
    straightOuterHalfWidth: Number.isFinite(straightOuterHalfWidth) ? straightOuterHalfWidth : 1e6,
    straightSideBandWidth: Math.max(0.01, Number(bandWidth) || DEFAULT_WALL_SYSTEM.bricks.brickWidth),
  };
}

function archOpeningPath(points, bottom = 0) {
  const path = new THREE.Path();
  path.moveTo(points[0].x, bottom);
  path.lineTo(points[0].x, points[0].y);
  points.slice(1).forEach((point) => path.lineTo(point.x, point.y));
  path.lineTo(points[points.length - 1].x, bottom);
  path.closePath();
  return path;
}

function archHeightAtX(points, x) {
  let height = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const first = points[index];
    const second = points[index + 1];
    if (x < Math.min(first.x, second.x) - 0.000001 || x > Math.max(first.x, second.x) + 0.000001) continue;
    const span = second.x - first.x;
    const t = Math.abs(span) < 0.000001 ? 0 : (x - first.x) / span;
    height = Math.max(height, THREE.MathUtils.lerp(first.y, second.y, t));
  }
  return height;
}

function southArchInfillShape(points, openingRects) {
  if (!points?.length) return null;
  const left = points[0].x;
  const right = points[points.length - 1].x;
  const shape = new THREE.Shape();
  shape.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach((point) => shape.lineTo(point.x, point.y));
  shape.lineTo(right, 0);
  shape.lineTo(left, 0);
  shape.closePath();
  Object.values(openingRects).filter(Boolean).forEach((opening) => {
    const minX = Math.max(left, opening.left);
    const maxX = Math.min(right, opening.right);
    const top = Math.min(
      opening.top,
      archHeightAtX(points, minX) - 0.002,
      archHeightAtX(points, maxX) - 0.002,
    );
    if (maxX - minX <= 0.001 || top - opening.bottom <= 0.001) return;
    shape.holes.push(rectangleHole(
      minX,
      Math.max(0, opening.bottom),
      maxX,
      top,
    ));
  });
  return shape;
}

function extrudedShape(shape, depth, z, material, side, mirrorCenterX = null, exposedEndMaterials = false) {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    steps: 1,
    bevelEnabled: false,
    curveSegments: 48,
  });
  geometry.translate(0, 0, z);
  geometry.computeVertexNormals();
  applyWorldAlignedBrickUvs(geometry);
  if (Number.isFinite(mirrorCenterX)) applyMirroredNorthFaceUvs(geometry, mirrorCenterX);
  if (Array.isArray(material) && material.length >= 3) {
    const index = geometry.getIndex();
    const normals = geometry.getAttribute('normal');
    const positions = geometry.getAttribute('position');
    geometry.computeBoundingBox();
    const leftX = geometry.boundingBox.min.x;
    const rightX = geometry.boundingBox.max.x;
    const endTolerance = Math.max(0.00001, (rightX - leftX) * 0.000001);
    const triangleCount = (index ? index.count : normals.count) / 3;
    geometry.clearGroups();
    for (let triangle = 0; triangle < triangleCount; triangle += 1) {
      let normalX = 0;
      let normalZ = 0;
      let centroidX = 0;
      for (let corner = 0; corner < 3; corner += 1) {
        const vertexIndex = index ? index.getX(triangle * 3 + corner) : triangle * 3 + corner;
        normalX += normals.getX(vertexIndex);
        normalZ += normals.getZ(vertexIndex);
        centroidX += positions.getX(vertexIndex);
      }
      normalX /= 3;
      normalZ /= 3;
      centroidX /= 3;
      let materialIndex = normalZ < -0.5 ? 0 : normalZ > 0.5 ? 1 : 2;
      if (exposedEndMaterials && material.length >= 5 && Math.abs(normalX) > 0.5) {
        if (Math.abs(centroidX - leftX) <= endTolerance) materialIndex = 3;
        else if (Math.abs(centroidX - rightX) <= endTolerance) materialIndex = 4;
      }
      geometry.addGroup(triangle * 3, 3, materialIndex);
    }
    geometry.userData.directRoomWallFaceMaterials = true;
    geometry.userData.roomWallInteriorMaterialIndex = 0;
    geometry.userData.roomWallExteriorMaterialIndex = 1;
    geometry.userData.roomWallReturnMaterialIndex = 2;
    geometry.userData.roomWallLeftEndMaterialIndex = exposedEndMaterials ? 3 : 2;
    geometry.userData.roomWallRightEndMaterialIndex = exposedEndMaterials ? 4 : 2;
  }
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.wallSide = side;
  return mesh;
}

function bondData(sideBond) {
  if (sideBond?.source !== 'library') return BUILT_IN_BONDS[sideBond?.builtIn] || BUILT_IN_BONDS.running;
  if (sideBond.assetType === 'girih_pattern' || sideBond.payload?.asset_type === 'girih_pattern' || sideBond.payload?.kind === 'girih-model') {
    const flat = sideBond.payload?.mehrazFlatPattern;
    const pieces = Array.isArray(flat?.pieces) ? flat.pieces : [];
    if (pieces.length) {
      const bounds = flat.bounds || girihPatternBounds(pieces);
      const width = Math.max(0.05, Number(bounds.maxX) - Number(bounds.minX));
      const height = Math.max(0.05, Number(bounds.maxY) - Number(bounds.minY));
      return {
        girih: true,
        pieces,
        bounds: {
          minX: Number(bounds.minX) || 0,
          minY: Number(bounds.minY) || 0,
          maxX: Number(bounds.maxX) || width,
          maxY: Number(bounds.maxY) || height,
        },
        unitWidth: width,
        unitHeight: height,
      };
    }
    const fallbackPieces = girihFallbackPieces(sideBond.payload);
    if (fallbackPieces.length) {
      const bounds = girihPatternBounds(fallbackPieces);
      const width = Math.max(0.05, bounds.maxX - bounds.minX);
      const height = Math.max(0.05, bounds.maxY - bounds.minY);
      return { girih: true, pieces: fallbackPieces, bounds, unitWidth: width, unitHeight: height };
    }
  }
  const pattern = sideBond.payload?.pattern || sideBond.payload || {};
  const bricks = Array.isArray(pattern.bricks) ? pattern.bricks : [];
  if (!bricks.length) return BUILT_IN_BONDS.running;
  const columns = Math.max(1, Number(pattern.columns) || Math.max(...bricks.map((brick) => Number(brick.x || 0) + Number(brick.width || 1))));
  const rows = Math.max(1, Number(pattern.rows) || Math.max(...bricks.map((brick) => Number(brick.y || 0) + Number(brick.height || 1))));
  const unitWidth = IMPORTED_BOND_NORMALIZED_UNIT_M;
  const unitHeight = IMPORTED_BOND_NORMALIZED_UNIT_M;
  return { imported: true, columns, rows, bricks, unitWidth, unitHeight };
}

function pointPair(value) {
  if (Array.isArray(value)) return [Number(value[0]) || 0, Number(value[1]) || 0];
  return [Number(value?.x) || 0, Number(value?.y ?? value?.z) || 0];
}

function girihPatternBounds(pieces) {
  const points = pieces.flatMap((piece) => (Array.isArray(piece.points) ? piece.points.map(pointPair) : []));
  if (!points.length) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  return {
    minX: Math.min(...points.map(([x]) => x)),
    minY: Math.min(...points.map(([, y]) => y)),
    maxX: Math.max(...points.map(([x]) => x)),
    maxY: Math.max(...points.map(([, y]) => y)),
  };
}

function girihFallbackPieces(payload) {
  const pieces = Array.isArray(payload?.pieces) ? payload.pieces : [];
  const sources = new Map((Array.isArray(payload?.sources) ? payload.sources : []).flatMap((source) => (
    [source.sourceKey, source.sourceId, source.id].filter(Boolean).map((key) => [key, source])
  )));
  return pieces.slice(0, 3500).map((piece) => {
    const source = sources.get(piece.sourceKey || piece.sourceId) || {};
    const resolved = { ...source, ...piece };
    const points = Array.isArray(resolved.points) ? resolved.points.map(pointPair) : [];
    if (points.length < 3 || resolved?.transform?.hidden) return null;
    const transform = resolved.transform || {};
    const rotation = -THREE.MathUtils.degToRad(Number(transform.rotation ?? resolved.rotation) || 0);
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const offsetX = Number(transform.x ?? resolved.x) || 0;
    const offsetY = Number(transform.y ?? resolved.y) || 0;
    const mirroredX = transform.mirrorHorizontal ? -1 : 1;
    const mirroredY = transform.mirrorVertical ? -1 : 1;
    return {
      color: resolved?.material?.color || resolved.color || '#2f7d86',
      points: points.map(([x, y]) => {
        const px = x * mirroredX;
        const py = y * mirroredY;
        return [px * cos - py * sin + offsetX, px * sin + py * cos + offsetY];
      }),
    };
  }).filter(Boolean);
}

function importedBrickRects(pattern, walls, sideBond = null) {
  return pattern.bricks.map((brick) => {
    const rotation = Number(brick.rotation ?? brick.angle ?? brick.rotate ?? 0) || 0;
    const explicitOrientation = String(
      brick.brickType
      || brick.layoutOrientation
      || brick.orientation
      || brick.direction
      || brick.axis
      || '',
    ).toLowerCase();
    const isVertical = brick.vertical === true
      || brick.isVertical === true
      || brick.rotated === true
      || explicitOrientation === 'v'
      || explicitOrientation.includes('vertical')
      || Math.abs((((rotation % 180) + 180) % 180) - 90) < 0.001;
    const orientation = isVertical
      ? 'vertical'
      : explicitOrientation === 'h' || explicitOrientation.includes('horizontal')
        ? 'horizontal'
        : null;
    const fallbackOrientation = orientation || ((Math.max(0.05, Number(brick.height) || 1) > Math.max(0.05, Number(brick.width) || 1)) ? 'vertical' : 'horizontal');
    return {
      x: Number(brick.x) || 0,
      y: Number(brick.y) || 0,
      width: Math.max(0.05, Number(brick.width) || 1),
      height: Math.max(0.05, Number(brick.height) || 1),
      color: color(brick.color, walls.color),
      orientation,
    };
  });
}

function intervalsOverlap(minA, maxA, minB, maxB, epsilon = 0.0001) {
  return Math.min(maxA, maxB) - Math.max(minA, minB) > epsilon;
}

function importedBrickOrientation(rect) {
  if (rect.orientation === 'vertical' || rect.orientation === 'horizontal') return rect.orientation;
  return rect.height > rect.width ? 'vertical' : 'horizontal';
}

function importedBrickHasMatchingNeighbor(rect, rects, pattern, side) {
  const epsilon = Math.max(0.0001, Math.min(pattern.columns, pattern.rows) * 0.001);
  const rectLeft = rect.x;
  const rectRight = rect.x + rect.width;
  const rectBottom = rect.y;
  const rectTop = rect.y + rect.height;
  const requiredOrientation = side === 'left' || side === 'right' ? 'horizontal' : 'vertical';
  if (importedBrickOrientation(rect) !== requiredOrientation) return false;
  return rects.some((other) => {
    if (other === rect || other.color !== rect.color) return false;
    if (importedBrickOrientation(other) !== requiredOrientation) return false;
    const otherLeft = other.x;
    const otherRight = other.x + other.width;
    const otherBottom = other.y;
    const otherTop = other.y + other.height;
    if (side === 'left') {
      const touches = rectLeft <= epsilon && Math.abs(otherRight - pattern.columns) <= epsilon;
      return touches && intervalsOverlap(rectBottom, rectTop, otherBottom, otherTop, epsilon);
    }
    if (side === 'right') {
      const touches = Math.abs(rectRight - pattern.columns) <= epsilon && otherLeft <= epsilon;
      return touches && intervalsOverlap(rectBottom, rectTop, otherBottom, otherTop, epsilon);
    }
    if (side === 'bottom') {
      const touches = rectBottom <= epsilon && Math.abs(otherTop - pattern.rows) <= epsilon;
      return touches && intervalsOverlap(rectLeft, rectRight, otherLeft, otherRight, epsilon);
    }
    if (side === 'top') {
      const touches = Math.abs(rectTop - pattern.rows) <= epsilon && otherBottom <= epsilon;
      return touches && intervalsOverlap(rectLeft, rectRight, otherLeft, otherRight, epsilon);
    }
    return false;
  });
}

function makeBondTexture(walls, side, surfaceWidth, surfaceHeight, rotate = false, worldUv = false, phaseU = 0, mirrorU = false, seamlessCycleLength = null) {
  const pattern = bondData(walls.bricks.sideBonds[side]);
  const sideBond = walls.bricks.sideBonds[side] || {};
  const importedScale = sideBond?.source === 'library'
    ? walls.bricks.importedScale * sideBond.scale
    : 1;
  const periodWidth = pattern.girih
    ? Math.max(pattern.unitWidth || 1, (pattern.unitWidth || 1) * importedScale)
    : pattern.imported
    ? Math.max(pattern.unitWidth || walls.bricks.brickWidth, pattern.columns * (pattern.unitWidth || walls.bricks.brickWidth) * importedScale)
    : walls.bricks.brickWidth * 4;
  const periodHeight = pattern.girih
    ? Math.max(pattern.unitHeight || 1, (pattern.unitHeight || 1) * importedScale)
    : pattern.imported
    ? Math.max(pattern.unitHeight || walls.bricks.brickHeight, pattern.rows * (pattern.unitHeight || walls.bricks.brickHeight) * importedScale)
    : walls.bricks.brickHeight * (pattern.courses?.length || 2);
  const canvas = document.createElement('canvas');
  const textureResolution = pattern.girih ? 2048 : 512;
  canvas.width = textureResolution;
  canvas.height = textureResolution;
  const context = canvas.getContext('2d');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.fillStyle = walls.bricks.mortarColor;
  context.fillRect(0, 0, canvas.width, canvas.height);
  if (pattern.girih) {
    const bounds = pattern.bounds || girihPatternBounds(pattern.pieces);
    const minX = Number(bounds.minX) || 0;
    const minY = Number(bounds.minY) || 0;
    const widthM = Math.max(0.001, (Number(bounds.maxX) || minX + 1) - minX);
    const heightM = Math.max(0.001, (Number(bounds.maxY) || minY + 1) - minY);
    const scaleX = canvas.width / widthM;
    const scaleY = canvas.height / heightM;
    const bleed = 8;
    const overscan = document.createElement('canvas');
    overscan.width = canvas.width + bleed * 2;
    overscan.height = canvas.height + bleed * 2;
    const tileContext = overscan.getContext('2d');
    tileContext.imageSmoothingEnabled = true;
    tileContext.imageSmoothingQuality = 'high';
    tileContext.fillStyle = walls.bricks.mortarColor;
    tileContext.fillRect(0, 0, overscan.width, overscan.height);
    tileContext.lineWidth = Math.max(
      0.5,
      canvas.width * walls.bricks.mortar / Math.max(periodWidth, 0.01),
    );
    tileContext.lineJoin = 'round';
    tileContext.lineCap = 'round';
    const pieces = pattern.pieces.slice(0, 5000).map((piece) => ({
      ...piece,
      tilePoints: Array.isArray(piece.points) ? piece.points.map(pointPair) : [],
    }));
    for (const offsetX of [-widthM, 0, widthM]) {
      for (const offsetY of [-heightM, 0, heightM]) {
        pieces.forEach((piece) => {
          if (piece.tilePoints.length < 3) return;
          tileContext.beginPath();
          piece.tilePoints.forEach(([x, y], index) => {
            const px = bleed + (x - minX + offsetX) * scaleX;
            const py = bleed + canvas.height - (y - minY + offsetY) * scaleY;
            if (index === 0) tileContext.moveTo(px, py);
            else tileContext.lineTo(px, py);
          });
          tileContext.closePath();
          const pieceColor = piece.color || piece.material?.color || '#2f7d86';
          tileContext.fillStyle = pieceColor;
          tileContext.strokeStyle = walls.bricks.mortarColor;
          tileContext.fill();
          tileContext.stroke();
        });
      }
    }
    context.drawImage(overscan, bleed, bleed, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
  } else if (pattern.imported) {
    const mortarPxX = Math.max(0.25, canvas.width * walls.bricks.mortar / Math.max(periodWidth, 0.01));
    const mortarPxY = Math.max(0.25, canvas.height * walls.bricks.mortar / Math.max(periodHeight, 0.01));
    const unitX = canvas.width / pattern.columns;
    const unitY = canvas.height / pattern.rows;
    const rects = importedBrickRects(pattern, walls, sideBond);
    rects.forEach((brick) => {
      const mergeLeft = importedBrickHasMatchingNeighbor(brick, rects, pattern, 'left');
      const mergeRight = importedBrickHasMatchingNeighbor(brick, rects, pattern, 'right');
      const mergeBottom = importedBrickHasMatchingNeighbor(brick, rects, pattern, 'bottom');
      const mergeTop = importedBrickHasMatchingNeighbor(brick, rects, pattern, 'top');
      const leftInset = mergeLeft ? 0 : mortarPxX * 0.5;
      const rightInset = mergeRight ? 0 : mortarPxX * 0.5;
      const bottomInset = mergeBottom ? 0 : mortarPxY * 0.5;
      const topInset = mergeTop ? 0 : mortarPxY * 0.5;
      const x = brick.x * unitX + leftInset;
      const y = canvas.height - (brick.y + brick.height) * unitY + topInset;
      const width = brick.width * unitX - leftInset - rightInset;
      const height = brick.height * unitY - topInset - bottomInset;
      context.fillStyle = brick.color;
      context.fillRect(
        x,
        y,
        Math.max(1, width),
        Math.max(1, height),
      );
    });
  } else {
    const mortarPx = Math.max(0.25, canvas.width * walls.bricks.mortar / Math.max(periodWidth, 0.01));
    const courses = pattern.courses || BUILT_IN_BONDS.running.courses;
    const courseHeight = canvas.height / courses.length;
    courses.forEach((course, row) => {
      const widths = course.bricks?.length ? course.bricks : [1];
      const total = widths.reduce((sum, width) => sum + width, 0);
      const baseWidth = canvas.width / Math.max(2, total * 2);
      let x = -((Number(course.offset) || 0) * baseWidth);
      let index = 0;
      while (x < canvas.width + baseWidth * 2) {
        const brickUnits = Number(widths[index % widths.length]) || 1;
        const width = brickUnits * baseWidth;
        context.fillStyle = walls.color;
        context.fillRect(x + mortarPx * 0.5, row * courseHeight + mortarPx * 0.5, width - mortarPx, courseHeight - mortarPx);
        x += width;
        index += 1;
      }
    });
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  const cycleLength = Number(seamlessCycleLength);
  const repeatU = worldUv
    ? (cycleLength > 0
      ? Math.max(1, Math.round(cycleLength / periodWidth)) / cycleLength
      : 1 / periodWidth)
    : Math.max(0.1, (rotate ? surfaceHeight : surfaceWidth) / periodWidth);
  const repeatV = worldUv ? 1 / periodHeight : Math.max(0.1, (rotate ? surfaceWidth : surfaceHeight) / periodHeight);
  texture.repeat.set(
    [
      'room_dome',
      'room_dome_interior',
      'room_inner_dome_exterior',
      'room_inner_dome_interior',
      'room_dome_extra_leg',
      'room_dome_extra_leg_interior',
      'room_dome_drum',
      'room_dome_drum_interior',
    ].includes(side) && !worldUv ? Math.max(1, Math.round(repeatU)) : repeatU,
    repeatV,
  );
  texture.offset.x = cycleLength > 0 && worldUv
    ? (phaseU + (Number(sideBond.offsetU) || 0)) * repeatU
    : (phaseU + (Number(sideBond.offsetU) || 0)) / periodWidth;
  texture.offset.y = (Number(sideBond.offsetV) || 0) / periodHeight;
  if (mirrorU) {
    texture.repeat.x *= -1;
    texture.offset.x = 1 - texture.offset.x;
  }
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 16;
  texture.needsUpdate = true;
  return texture;
}

function brickMaterial(walls, side, width, height, rotate = false, worldUv = false, phaseU = 0, mirrorU = false, seamlessCycleLength = null) {
  const texture = makeBondTexture(walls, side, width, height, rotate, worldUv, phaseU, mirrorU, seamlessCycleLength);
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    color: '#ffffff',
    roughness: 0.78,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
    side: THREE.DoubleSide,
  });
  material.userData.generatedTexture = texture;
  material.userData.isFlatBrickBond = true;
  return configureStoneBaseMaterial(material, walls, { clipPattern: true });
}

function squareTopBrickMaterial(walls) {
  const brickLength = Math.max(0.01, Number(walls.bricks?.brickWidth) || 0.22);
  const mortar = Math.max(0.001, Number(walls.bricks?.mortar) || 0.01);
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  context.fillStyle = walls.bricks.mortarColor;
  context.fillRect(0, 0, canvas.width, canvas.height);
  const mortarPixels = Math.max(1, canvas.width * mortar / brickLength);
  context.fillStyle = walls.color;
  context.fillRect(
    mortarPixels / 2,
    mortarPixels / 2,
    canvas.width - mortarPixels,
    canvas.height - mortarPixels,
  );
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1 / brickLength, 1 / brickLength);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 16;
  texture.needsUpdate = true;
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    color: '#ffffff',
    roughness: 0.78,
    metalness: 0,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  });
  material.userData.generatedTexture = texture;
  material.userData.isFlatBrickBond = true;
  material.userData.topBrickShape = 'square';
  material.userData.topBrickPattern = 'checker-grid';
  material.userData.topBrickSize = brickLength;
  material.userData.surfaceBrickColor = walls.color;
  return material;
}

function materialWithCircularPlanVoid(sourceMaterial, centerX, centerZ, radius) {
  const material = sourceMaterial.clone();
  material.userData = {
    ...sourceMaterial.userData,
    roomCircularVoid: true,
    roomCircularVoidCenter: [centerX, centerZ],
    roomCircularVoidRadius: radius,
  };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.roomVoidCenter = { value: new THREE.Vector2(centerX, centerZ) };
    shader.uniforms.roomVoidRadius = { value: radius };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRoomVoidWorldPosition;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRoomVoidWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRoomVoidWorldPosition;\nuniform vec2 roomVoidCenter;\nuniform float roomVoidRadius;')
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (distance(vRoomVoidWorldPosition.xz, roomVoidCenter) < roomVoidRadius) discard;');
  };
  material.customProgramCacheKey = () => `room-circular-void:${centerX}:${centerZ}:${radius}`;
  material.needsUpdate = true;
  return material;
}

export function raisedBorderMaterial(walls, side, width, height, orientation = 'horizontal', archMapping = null, courseAxis = 'x', coordinateSpace = 'world') {
  const material = new THREE.MeshStandardMaterial({
    color: walls.color,
    roughness: 0.78,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  material.userData.raisedBorderOrientation = orientation;
  material.userData.raisedBorderCourseAxis = courseAxis;
  material.userData.raisedBorderCoordinateSpace = coordinateSpace === 'local' ? 'local' : 'world';
  material.userData.isSoldierBoundaryCourse = orientation === 'horizontal';
  material.userData.raisedStraightBottomY = archMapping?.straightBottomY ?? null;
  return configureStoneBaseMaterial(configureRaisedBorderBrickMaterial(material, walls, archMapping), walls);
}

function soldierMaterial(walls, side, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  context.fillStyle = walls.bricks.mortarColor;
  context.fillRect(0, 0, canvas.width, canvas.height);
  const brickLong = Math.max(0.01, walls.bricks.brickWidth);
  const brickShort = Math.max(0.01, walls.bricks.brickHeight);
  const mortar = Math.max(0.001, walls.bricks.mortar);
  const brickPx = Math.max(2, Math.round(canvas.width * brickShort / Math.max(width, brickShort)));
  const mortarPx = Math.max(1, Math.round(canvas.width * mortar / Math.max(width, brickShort)));
  const y = mortarPx * 0.5;
  const h = Math.max(2, canvas.height - mortarPx);
  for (let x = 0; x < canvas.width + brickPx; x += brickPx + mortarPx) {
    context.fillStyle = walls.color;
    context.fillRect(x + mortarPx * 0.5, y, Math.max(1, brickPx - mortarPx), h);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.repeat.set(Math.max(0.1, width / brickShort), Math.max(0.1, height / brickLong));
  texture.needsUpdate = true;
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    color: '#ffffff',
    roughness: 0.78,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -5,
    polygonOffsetUnits: -5,
    side: THREE.DoubleSide,
  });
  material.userData.generatedTexture = texture;
  material.userData.isFlatBrickBond = true;
  material.userData.wallSide = side;
  return material;
}

function verticalBorderMaterial(walls, side, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  context.fillStyle = walls.bricks.mortarColor;
  context.fillRect(0, 0, canvas.width, canvas.height);
  const brickLong = Math.max(0.01, walls.bricks.brickWidth);
  const mortar = Math.max(0.001, walls.bricks.mortar);
  const brickPx = Math.max(2, Math.round(canvas.height * brickLong / Math.max(height, brickLong)));
  const mortarPx = Math.max(1, Math.round(canvas.height * mortar / Math.max(height, brickLong)));
  for (let y = 0; y < canvas.height + brickPx; y += brickPx + mortarPx) {
    context.fillStyle = walls.color;
    context.fillRect(mortarPx * 0.5, y + mortarPx * 0.5, Math.max(1, canvas.width - mortarPx), Math.max(1, brickPx - mortarPx));
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, Math.max(0.1, height / brickLong));
  texture.needsUpdate = true;
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    color: '#ffffff',
    roughness: 0.78,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -5,
    polygonOffsetUnits: -5,
    side: THREE.DoubleSide,
  });
  material.userData.generatedTexture = texture;
  material.userData.isFlatBrickBond = true;
  material.userData.wallSide = side;
  return material;
}

function addBrickFace(group, shape, side, width, height, planePosition, rotation, walls, phaseU = 0, selectionSide = side, mirrorCenterX = null, wallFace = 'interior', seamlessCycleLength = null) {
  if (!walls.bricks.enabled) return;
  const selectedBond = walls.bricks.sideBonds[side];
  // The structural wall already carries the default running bond on every face.
  // Avoid drawing an identical coplanar skin, which causes diagonal moire/grain.
  if (wallFace !== 'exterior' && selectedBond?.source !== 'library' && (selectedBond?.builtIn || 'running') === 'running') return;
  // Shape UVs already map their horizontal axis to the wall length after the
  // mesh is rotated into place, so east/west faces must not swap width/height.
  const material = brickMaterial(walls, side, width, height, false, true, phaseU, false, seamlessCycleLength);
  // This skin is already positioned 6–15 mm in front of its owning wall face.
  // A negative polygon offset can incorrectly win the depth test through an
  // intersecting east/west return wall when the south face is viewed obliquely.
  material.polygonOffset = false;
  material.polygonOffsetFactor = 0;
  material.polygonOffsetUnits = 0;
  material.userData.isInteriorWallBondFace = true;
  const geometry = new THREE.ShapeGeometry(shape, 48);
  applyWorldAlignedBrickUvs(geometry);
  if (Number.isFinite(mirrorCenterX)) applyMirroredNorthFaceUvs(geometry, mirrorCenterX);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...planePosition);
  mesh.rotation.set(...rotation);
  mesh.receiveShadow = true;
  mesh.userData.wallSide = selectionSide;
  mesh.userData.wallFace = wallFace;
  mesh.userData.brickBondSide = side;
  mesh.userData.brickBondPhaseU = phaseU;
  mesh.userData.brickBondSeamlessCycleLength = seamlessCycleLength;
  mesh.userData.isBrickFace = true;
  mesh.userData.isImportedWallDecoration = selectedBond?.source === 'library';
  mesh.userData.isStructuralWallBondFace = selectedBond?.source !== 'library';
  mesh.renderOrder = 2;
  group.add(mesh);
}

function addDefaultBrickFace(group, shape, side, width, height, planePosition, rotation, walls) {
  const defaultWalls = wallsWithDefaultBond(walls, side);
  addBrickFace(group, shape, side, width, height, planePosition, rotation, defaultWalls);
}

function addEdges(group, mesh, walls) {
  if (!walls.edges.enabled || !mesh.geometry || mesh.userData?.excludeWallEdges === true) return;
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(mesh.geometry, 24),
    new THREE.LineBasicMaterial({
      color: walls.edges.color,
      transparent: true,
      opacity: 0.95,
      depthTest: true,
    }),
  );
  edges.position.copy(mesh.position);
  edges.rotation.copy(mesh.rotation);
  edges.scale.copy(mesh.scale);
  edges.userData.isWallEdge = true;
  edges.userData.wallSide = mesh.userData.wallSide;
  edges.userData.isKarbandi = mesh.userData.isKarbandi === true;
  edges.userData.isKarbandiReference = mesh.userData.isKarbandiReference === true;
  edges.userData.karbandiRibIndex = mesh.userData.karbandiRibIndex;
  edges.userData.isKarbandiCover = mesh.userData.isKarbandiCover === true;
  edges.userData.karbandiRoofPanel = mesh.userData.karbandiRoofPanel;
  edges.userData.requestedThickness = walls.edges.thickness;
  edges.renderOrder = 6;
  (mesh.parent || group).add(edges);
}

function addSoldierStrip(group, side, x, y, width, height, z, walls, verticalBricks = true) {
  if (!walls.bricks.enabled || width <= 0.02 || height <= 0.02) return;
  const strip = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    verticalBricks
      ? soldierMaterial(walls, side, width, height)
      : brickMaterial(walls, side, width, height),
  );
  strip.position.set(x, y, z);
  strip.renderOrder = 4;
  strip.userData.isSoldierCourse = true;
  strip.userData.wallSide = side;
  group.add(strip);
}

function addSolidBorder(group, side, x, y, width, height, z, walls, orientation = 'horizontal') {
  if (!walls.bricks.enabled || width <= 0.02 || height <= 0.02) return;
  const mortar = Math.max(0.001, walls.bricks.mortar);
  const brickShort = Math.max(0.01, walls.bricks.brickHeight);
  const projection = Math.max(0.018, Math.min(0.06, walls.northBoundary?.depth || 0.03));
  const epsilon = 0.0015;
  const backingDepth = projection * 0.35;
  const backing = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, backingDepth),
    new THREE.MeshStandardMaterial({
      color: walls.bricks.mortarColor,
      roughness: 0.82,
      metalness: 0,
    }),
  );
  backing.position.set(x, y, z - backingDepth / 2 - epsilon);
  backing.castShadow = true;
  backing.receiveShadow = true;
  backing.renderOrder = 5;
  backing.userData.isNorthBoundaryMortarBacking = true;
  backing.userData.wallSide = side;
  group.add(backing);

  const brickMaterialSolid = new THREE.MeshStandardMaterial({
    color: walls.color,
    roughness: 0.78,
    metalness: 0,
  });
  const borderBrickZ = z - projection / 2 - epsilon * 2;
  if (orientation === 'vertical') {
    const usableStep = brickShort + mortar;
    const count = Math.max(1, Math.floor((height + mortar) / usableStep));
    const usedHeight = count * brickShort + Math.max(0, count - 1) * mortar;
    const startY = y - usedHeight / 2 + brickShort / 2;
    for (let index = 0; index < count; index += 1) {
      const brick = new THREE.Mesh(
        new THREE.BoxGeometry(Math.max(0.01, width - mortar), Math.max(0.01, brickShort - mortar), projection),
        brickMaterialSolid,
      );
      brick.position.set(x, startY + index * usableStep, borderBrickZ);
      brick.castShadow = true;
      brick.receiveShadow = true;
      brick.renderOrder = 7;
      brick.userData.isFullLengthBorderBrick = true;
      brick.userData.wallSide = side;
      group.add(brick);
    }
    return;
  }

  const usableStep = brickShort + mortar;
  const count = Math.max(1, Math.floor((width + mortar) / usableStep));
  const usedWidth = count * brickShort + Math.max(0, count - 1) * mortar;
  const startX = x - usedWidth / 2 + brickShort / 2;
  for (let index = 0; index < count; index += 1) {
    const brick = new THREE.Mesh(
      new THREE.BoxGeometry(Math.max(0.01, brickShort - mortar), Math.max(0.01, height - mortar), projection),
      brickMaterialSolid,
    );
    brick.position.set(startX + index * usableStep, y, borderBrickZ);
    brick.castShadow = true;
    brick.receiveShadow = true;
    brick.renderOrder = 7;
    brick.userData.isFullLengthBorderBrick = true;
    brick.userData.wallSide = side;
    group.add(brick);
  }
}

const MAX_GYPSUM_RECT_CUTOUTS = 32;
const MAX_GYPSUM_CAPSULE_CUTOUTS = 96;

function gypsumZoneCutouts(zones, surfaceId, walls) {
  const normalizedSurface = {
    east: 'east_interior',
    west: 'west_interior',
    south: 'south_interior',
    south_arch: 'south_interior',
  }[surfaceId] || surfaceId;
  const mortar = Math.max(0.001, Number(walls.bricks?.mortar) || 0.01);
  return (Array.isArray(zones) ? zones : []).flatMap((zone) => {
    const zoneSurface = zone?.surfaceId === 'south_facade' ? 'south_interior' : zone?.surfaceId;
    if (zoneSurface !== normalizedSurface || !zone?.bounds) return [];
    const u = Number(zone.bounds.u);
    const v = Number(zone.bounds.v);
    const width = Math.max(0, Number(zone.bounds.width));
    const height = Math.max(0, Number(zone.bounds.height));
    if (![u, v, width, height].every(Number.isFinite) || width <= 0.001 || height <= 0.001) return [];
    const soldierHeight = zone.soldierCourses === true && walls.bricks?.enabled !== false
      ? Math.min(height / 2, Math.max(0.05, Number(walls.bricks?.brickWidth) || 0.15))
      : 0;
    const clearance = 0.003;
    return [{
      kind: 'rect',
      minU: u - width / 2 - clearance,
      maxU: u + width / 2 + clearance,
      minY: v - height / 2 - soldierHeight - (soldierHeight ? mortar : 0) - clearance,
      maxY: v + height / 2 + soldierHeight + (soldierHeight ? mortar : 0) + clearance,
    }];
  });
}

function openingSoldierCutouts(openingRects, walls, gypsumBaseTop) {
  if (walls.bricks?.enabled === false) return [];
  const inset = Math.max(walls.bricks.brickHeight, walls.bricks.brickWidth);
  const clearance = Math.max(0.003, walls.bricks.mortar * 0.5);
  const cutouts = [];
  const addOpening = (profile, type) => {
    if (!profile) return;
    const jambBottom = type === 'door' ? gypsumBaseTop : profile.bottom;
    if (profile.springTop > jambBottom) {
      cutouts.push(
        { kind: 'rect', minU: profile.left - inset - clearance, maxU: profile.left + clearance, minY: jambBottom - clearance, maxY: profile.springTop + clearance },
        { kind: 'rect', minU: profile.right - clearance, maxU: profile.right + inset + clearance, minY: jambBottom - clearance, maxY: profile.springTop + clearance },
      );
    }
    if (profile.archPoints?.length) {
      // The opening is already removed from the ShapeGeometry. These capsules
      // remove the gypsum directly behind the raised curved soldier ring.
      const points = profile.archPoints;
      const stride = Math.max(1, Math.ceil((points.length - 1) / 36));
      for (let index = 0; index < points.length - 1; index += stride) {
        const end = points[Math.min(points.length - 1, index + stride)];
        cutouts.push({
          kind: 'capsule',
          ax: points[index].x,
          ay: points[index].y,
          bx: end.x,
          by: end.y,
          radius: inset + clearance,
        });
      }
    } else {
      const bearing = Math.max(inset, walls.bricks.brickHeight, walls.bricks.mortar * 2);
      cutouts.push({
        kind: 'rect',
        minU: profile.left - bearing - clearance,
        maxU: profile.right + bearing + clearance,
        minY: profile.top - clearance,
        maxY: profile.top + inset + clearance,
      });
    }
    if (type === 'window') {
      const bearing = Math.max(inset, walls.bricks.brickHeight, walls.bricks.mortar * 2);
      cutouts.push({
        kind: 'rect',
        minU: profile.left - bearing - clearance,
        maxU: profile.right + bearing + clearance,
        minY: profile.bottom - inset - clearance,
        maxY: profile.bottom + clearance,
      });
    }
  };
  addOpening(openingRects.door, 'door');
  addOpening(openingRects.window, 'window');
  return cutouts;
}

function writeGypsumCutoutUniforms(material) {
  const all = [...(material.userData.gypsumStaticCutouts || []), ...(material.userData.gypsumZoneCutouts || [])];
  const rects = all.filter((cutout) => cutout.kind === 'rect').slice(0, MAX_GYPSUM_RECT_CUTOUTS);
  const capsules = all.filter((cutout) => cutout.kind === 'capsule').slice(0, MAX_GYPSUM_CAPSULE_CUTOUTS);
  const uniforms = material.userData.gypsumCutoutUniforms;
  uniforms.rectCount.value = rects.length;
  uniforms.capsuleCount.value = capsules.length;
  uniforms.rects.value.fill(0);
  uniforms.capsules.value.fill(0);
  uniforms.radii.value.fill(0);
  rects.forEach((cutout, index) => uniforms.rects.value.set([cutout.minU, cutout.maxU, cutout.minY, cutout.maxY], index * 4));
  capsules.forEach((cutout, index) => {
    uniforms.capsules.value.set([cutout.ax, cutout.ay, cutout.bx, cutout.by], index * 4);
    uniforms.radii.value[index] = cutout.radius;
  });
  material.userData.gypsumCutouts = all;
}

function gypsumMaterial(walls, minimumWorldY = 0, axis = 'x', staticCutouts = [], zoneCutouts = []) {
  const material = new THREE.MeshStandardMaterial({
    color: walls.interiorGypsum.color,
    roughness: 0.94,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -8,
    polygonOffsetUnits: -8,
    side: THREE.DoubleSide,
  });
  if (minimumWorldY > 0.001) {
    material.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, 1, 0), -minimumWorldY)];
    material.clipShadows = true;
  }
  material.userData.isPortalInteriorGypsum = true;
  material.userData.gypsumCutoutAxis = axis;
  material.userData.gypsumStaticCutouts = staticCutouts;
  material.userData.gypsumZoneCutouts = zoneCutouts;
  material.userData.gypsumCutoutUniforms = {
    rectCount: { value: 0 },
    capsuleCount: { value: 0 },
    rects: { value: new Float32Array(MAX_GYPSUM_RECT_CUTOUTS * 4) },
    capsules: { value: new Float32Array(MAX_GYPSUM_CAPSULE_CUTOUTS * 4) },
    radii: { value: new Float32Array(MAX_GYPSUM_CAPSULE_CUTOUTS) },
  };
  writeGypsumCutoutUniforms(material);
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, material.userData.gypsumCutoutUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGypsumWorldPosition;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvGypsumWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    const coordinate = axis === 'z' ? 'vGypsumWorldPosition.z' : 'vGypsumWorldPosition.x';
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vGypsumWorldPosition;\nuniform int rectCount;\nuniform int capsuleCount;\nuniform vec4 rects[${MAX_GYPSUM_RECT_CUTOUTS}];\nuniform vec4 capsules[${MAX_GYPSUM_CAPSULE_CUTOUTS}];\nuniform float radii[${MAX_GYPSUM_CAPSULE_CUTOUTS}];`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        vec2 gypsumPoint = vec2(${coordinate}, vGypsumWorldPosition.y);
        for (int i = 0; i < ${MAX_GYPSUM_RECT_CUTOUTS}; i++) {
          if (i >= rectCount) break;
          vec4 area = rects[i];
          if (gypsumPoint.x >= area.x && gypsumPoint.x <= area.y && gypsumPoint.y >= area.z && gypsumPoint.y <= area.w) discard;
        }
        for (int i = 0; i < ${MAX_GYPSUM_CAPSULE_CUTOUTS}; i++) {
          if (i >= capsuleCount) break;
          vec4 segment = capsules[i];
          vec2 delta = segment.zw - segment.xy;
          float lengthSquared = max(dot(delta, delta), 0.000001);
          float along = clamp(dot(gypsumPoint - segment.xy, delta) / lengthSquared, 0.0, 1.0);
          if (distance(gypsumPoint, segment.xy + along * delta) <= radii[i]) discard;
        }`);
  };
  material.customProgramCacheKey = () => `mehraz-gypsum-cutouts-${axis}`;
  return material;
}

function addInteriorGypsumFace(group, shape, selectionSide, planePosition, rotation, walls, minimumWorldY = 0, staticCutouts = [], zoneCutouts = []) {
  if (!walls.interiorGypsum?.enabled || !shape) return null;
  const geometry = new THREE.ShapeGeometry(shape, 48);
  const axis = selectionSide === 'east' || selectionSide === 'west' ? 'z' : 'x';
  const material = gypsumMaterial(walls, minimumWorldY, axis, staticCutouts, zoneCutouts);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...planePosition);
  mesh.rotation.set(...rotation);
  mesh.receiveShadow = true;
  mesh.userData.wallSide = selectionSide;
  mesh.userData.wallFace = 'interior';
  mesh.userData.isPortalInteriorGypsum = true;
  mesh.renderOrder = 8;
  group.add(mesh);
  return mesh;
}

export function updateGypsumZoneCutouts(root, zones, walls) {
  if (!root) return;
  root.traverse((child) => {
    if (!child.isMesh || child.userData?.isPortalInteriorGypsum !== true) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => {
      if (!material?.userData?.gypsumCutoutUniforms) return;
      material.userData.gypsumZoneCutouts = gypsumZoneCutouts(zones, child.userData.wallSide, walls);
      writeGypsumCutoutUniforms(material);
    });
  });
}

function addAhangSoffitGypsum(group, archPoints, northZ, southZ, walls) {
  if (!walls.interiorGypsum?.enabled || archPoints.length < 2) return null;
  const positions = [];
  const indices = [];
  archPoints.forEach((point) => {
    positions.push(point.x, point.y - 0.012, northZ, point.x, point.y - 0.012, southZ);
  });
  for (let index = 0; index < archPoints.length - 1; index += 1) {
    const start = index * 2;
    indices.push(start, start + 1, start + 3, start, start + 3, start + 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, gypsumMaterial(walls));
  mesh.userData.wallSide = 'arch';
  mesh.userData.isPortalInteriorGypsum = true;
  mesh.userData.isAhangSoffitGypsum = true;
  mesh.receiveShadow = true;
  mesh.renderOrder = 8;
  group.add(mesh);
  return mesh;
}

function addRaisedOpeningSoldierCourse(group, openingType, x, y, openingWidth, height, z, walls, courseRole = 'lintel', wallSide = 'south', options = {}) {
  if (!walls.bricks.enabled || openingWidth <= 0.02 || height <= 0.02) return;
  // Horizontal courses pass fully behind both vertical jamb courses, so their
  // bearing must equal the complete jamb band width rather than one short brick.
  const bearing = Math.max(height, walls.bricks.brickHeight, walls.bricks.mortar * 2);
  const width = openingWidth + bearing * 2;
  const projection = Math.max(0.018, Math.min(0.06, walls.northBoundary?.depth || 0.03));
  const shape = rectanglePanelShape(x - width / 2, x + width / 2, y - height / 2, y + height / 2);
  if (!shape) return;
  const panel = extrudedShape(
    shape,
    projection,
    z - projection,
    raisedBorderMaterial(walls, options.materialSide || wallSide, width, height, 'horizontal', null, 'x', options.coordinateSpace),
    wallSide,
  );
  panel.renderOrder = 7;
  panel.userData.isSoldierCourse = true;
  panel.userData.isSouthOpeningSoldierCourse = options.roomWall !== true && wallSide === 'south';
  panel.userData.isRoomWallOpeningSoldierCourse = options.roomWall === true || wallSide !== 'south';
  panel.userData.wallFace = options.wallFace || 'interior';
  panel.userData.openingTrimBondSide = options.materialSide || wallSide;
  panel.userData.openingType = openingType;
  panel.userData.soldierCourseRole = courseRole;
  panel.userData.openingWidth = openingWidth;
  panel.userData.soldierBearing = bearing;
  group.add(panel);
}

function addRaisedOpeningJambCourses(group, openingType, profile, bottom, width, z, walls, wallSide = 'south', options = {}) {
  const top = profile?.springTop;
  if (!walls.bricks.enabled || !Number.isFinite(top) || top - bottom <= 0.02 || width <= 0.02) return;
  const projection = Math.max(0.018, Math.min(0.06, walls.northBoundary?.depth || 0.03));
  [
    ['left', profile.left - width / 2],
    ['right', profile.right + width / 2],
  ].forEach(([jambSide, centerX]) => {
    const shape = rectanglePanelShape(centerX - width / 2, centerX + width / 2, bottom, top);
    if (!shape) return;
    const panel = extrudedShape(
      shape,
      projection,
      z - projection,
      raisedBorderMaterial(walls, options.materialSide || wallSide, width, top - bottom, 'vertical', null, 'x', options.coordinateSpace),
      wallSide,
    );
    panel.renderOrder = 7;
    panel.userData.isSoldierCourse = true;
    panel.userData.isSouthOpeningSoldierCourse = options.roomWall !== true && wallSide === 'south';
    panel.userData.isRoomWallOpeningSoldierCourse = options.roomWall === true || wallSide !== 'south';
    panel.userData.wallFace = options.wallFace || 'interior';
    panel.userData.openingTrimBondSide = options.materialSide || wallSide;
    panel.userData.openingType = openingType;
    panel.userData.soldierCourseRole = 'jamb';
    panel.userData.jambSide = jambSide;
    panel.userData.jambBottom = bottom;
    panel.userData.jambTop = top;
    group.add(panel);
  });
}

function addCurvedBorderBricks(group, side, archPoints, centerX, inset, z, walls) {
  if (!walls.bricks.enabled || !archPoints?.length) return;
  const brickLength = Math.max(0.01, walls.bricks.brickHeight);
  // The curved border is the same raised ring as the straight borders, so its
  // visible depth must follow the full sunken inset. Using brick height here
  // made the arch border read as a thin line.
  const brickDepth = Math.max(0.03, inset - Math.max(0.001, walls.bricks.mortar));
  const mortarGap = Math.max(0.002, walls.bricks.mortar);
  const projection = Math.max(0.018, Math.min(0.06, walls.northBoundary?.depth || 0.03));
  const epsilon = 0.0015;
  const material = new THREE.MeshStandardMaterial({
    color: walls.color,
    roughness: 0.78,
    metalness: 0,
  });
  const segments = [];
  let totalLength = 0;
  for (let index = 0; index < archPoints.length - 1; index += 1) {
    const start = archPoints[index];
    const end = archPoints[index + 1];
    const segment = end.clone().sub(start);
    const length = segment.length();
    if (length <= 0.001) continue;
    segments.push({ start, end, length, from: totalLength });
    totalLength += length;
  }
  const step = brickLength + mortarGap;
  for (let distance = brickLength * 0.5; distance < totalLength; distance += step) {
    const activeSegment = segments.find((item) => distance >= item.from && distance <= item.from + item.length) || segments[segments.length - 1];
    if (!activeSegment) continue;
    const local = Math.max(0, Math.min(1, (distance - activeSegment.from) / activeSegment.length));
    const vector = activeSegment.end.clone().sub(activeSegment.start);
    const length = vector.length();
    if (length <= 0.001) continue;
    const tangent = vector.clone().normalize();
    const normalA = new THREE.Vector2(-tangent.y, tangent.x);
    const pointOnCurve = activeSegment.start.clone().lerp(activeSegment.end, local);
    const midpoint = pointOnCurve.clone();
    const awayFromOpening = normalA.dot(midpoint.clone().sub(new THREE.Vector2(centerX, 0))) >= 0
      ? normalA
      : normalA.clone().multiplyScalar(-1);
    const angle = Math.atan2(tangent.y, tangent.x);
    const point = pointOnCurve.addScaledVector(awayFromOpening, brickDepth * 0.5);
    const brick = new THREE.Mesh(
      new THREE.BoxGeometry(Math.max(0.01, brickLength - mortarGap), Math.max(0.01, brickDepth - mortarGap), projection),
      material,
    );
    brick.position.set(point.x, point.y, z - projection / 2 - epsilon * 2);
    brick.rotation.z = angle;
    brick.castShadow = true;
    brick.receiveShadow = true;
    brick.renderOrder = 7;
    brick.userData.isCurvedOpeningBorderBrick = true;
    brick.userData.isNorthCurveBorderBrick = side === 'north';
    brick.userData.isSouthOpeningArchBrick = side === 'south';
    brick.userData.wallSide = side;
    group.add(brick);
  }
}

function addRaisedNorthPanel(group, meshes, left, right, bottom, top, z, depth, walls, phaseU, borderOrientation = null, archMapping = null) {
  if (right - left <= 0.02 || top - bottom <= 0.02) return;
  const shape = new THREE.Shape();
  shape.moveTo(left, bottom);
  shape.lineTo(right, bottom);
  shape.lineTo(right, top);
  shape.lineTo(left, top);
  shape.closePath();
  const panel = extrudedShape(
    shape,
    depth,
    z,
    borderOrientation
      ? raisedBorderMaterial(walls, 'north', right - left, top - bottom, borderOrientation, archMapping)
      : wallMaterial(walls, 'north', right - left, top - bottom, true, phaseU),
    'north',
  );
  panel.userData.isNorthRaisedRing = true;
  group.add(panel);
  meshes.push(panel);
}

function offsetArchPoint(points, index, centerX, inset, centerY = 0) {
  const point = points[index];
  const previous = points[Math.max(0, index - 1)];
  const next = points[Math.min(points.length - 1, index + 1)];
  const tangent = next.clone().sub(previous);
  if (tangent.length() <= 0.0001) {
    return point.clone().add(new THREE.Vector2(point.x < centerX ? -inset : inset, 0));
  }
  tangent.normalize();
  const normalA = new THREE.Vector2(-tangent.y, tangent.x);
  const normalB = normalA.clone().multiplyScalar(-1);
  const fromCenter = point.clone().sub(new THREE.Vector2(centerX, centerY));
  const outward = normalA.dot(fromCenter) >= normalB.dot(fromCenter) ? normalA : normalB;
  return point.clone().addScaledVector(outward, inset);
}

function addRaisedCurvedNorthBorderPanel(group, meshes, archPoints, centerX, inset, z, depth, walls, phaseU, archMapping = null) {
  if (!archPoints?.length || depth <= 0.001) return;
  const outerPoints = archPoints.map((_, index) => offsetArchPoint(archPoints, index, centerX, inset));
  const shape = new THREE.Shape();
  shape.moveTo(outerPoints[0].x, outerPoints[0].y);
  outerPoints.slice(1).forEach((point) => shape.lineTo(point.x, point.y));
  [...archPoints].reverse().forEach((point) => shape.lineTo(point.x, point.y));
  shape.closePath();
  const panel = extrudedShape(
    shape,
    depth,
    z,
    raisedBorderMaterial(walls, 'north', Math.max(0.1, archPoints[0].distanceTo(archPoints[archPoints.length - 1])), inset, 'horizontal', archMapping),
    'north',
  );
  panel.userData.isNorthRaisedArchRing = true;
  group.add(panel);
  meshes.push(panel);
}

function splitArchPointsAtCenter(archPoints, centerX) {
  const apex = archPoints.reduce((best, point) => (
    Math.abs(point.x - centerX) < Math.abs(best.x - centerX) ? point : best
  ), archPoints[0]);
  const leftCurve = archPoints.filter((point) => point.x <= centerX + 0.0001);
  const rightCurve = archPoints.filter((point) => point.x >= centerX - 0.0001);
  if (!leftCurve.some((point) => Math.abs(point.x - apex.x) < 0.0001 && Math.abs(point.y - apex.y) < 0.0001)) leftCurve.push(apex);
  if (!rightCurve.some((point) => Math.abs(point.x - apex.x) < 0.0001 && Math.abs(point.y - apex.y) < 0.0001)) rightCurve.unshift(apex);
  return { leftCurve, rightCurve, apex };
}

function archTopHalfShape(curvePoints, centerX, height, isRight = false) {
  if (!curvePoints?.length) return null;
  const shape = new THREE.Shape();
  shape.moveTo(curvePoints[0].x, curvePoints[0].y);
  curvePoints.slice(1).forEach((point) => shape.lineTo(point.x, point.y));
  shape.lineTo(isRight ? curvePoints[curvePoints.length - 1].x : centerX, height);
  shape.lineTo(isRight ? centerX : curvePoints[0].x, height);
  shape.closePath();
  return shape;
}

function northPortalSections(left, right, height, archPoints, centerX) {
  if (!archPoints?.length) return [{ shape: rectangleShape(left, right, height), section: 'north_sides', mirror: false }];
  const openingLeft = Math.min(archPoints[0].x, archPoints[archPoints.length - 1].x);
  const openingRight = Math.max(archPoints[0].x, archPoints[archPoints.length - 1].x);
  const sections = [];
  if (openingLeft - left > 0.02) sections.push({ shape: rectangleShape(left, openingLeft, height), section: 'north_sides', mirror: false });
  if (right - openingRight > 0.02) sections.push({ shape: rectangleShape(openingRight, right, height), section: 'north_sides', mirror: true });
  const { leftCurve, rightCurve } = splitArchPointsAtCenter(archPoints, centerX);
  const leftTop = archTopHalfShape(leftCurve, centerX, height, false);
  const rightTop = archTopHalfShape(rightCurve, centerX, height, true);
  if (leftTop) sections.push({ shape: leftTop, section: 'north_top', mirror: false });
  if (rightTop) sections.push({ shape: rightTop, section: 'north_top', mirror: true });
  return sections;
}

function northRectangularPortalShapes(left, right, height, openingLeft, openingRight) {
  const shapes = [];
  const clippedOpeningLeft = Math.max(left, Math.min(right, openingLeft));
  const clippedOpeningRight = Math.max(left, Math.min(right, openingRight));
  if (clippedOpeningLeft - left > 0.02) shapes.push(rectangleShape(left, clippedOpeningLeft, height));
  if (right - clippedOpeningRight > 0.02) shapes.push(rectangleShape(clippedOpeningRight, right, height));
  return shapes.length ? shapes : [rectangleShape(left, right, height)];
}

function rectanglePanelShape(left, right, bottom, top) {
  if (right - left <= 0.02 || top - bottom <= 0.02) return null;
  const shape = new THREE.Shape();
  shape.moveTo(left, bottom);
  shape.lineTo(right, bottom);
  shape.lineTo(right, top);
  shape.lineTo(left, top);
  shape.closePath();
  return shape;
}

function northRectangularRecessedDecorationShapes(left, right, height, inset, openingLeft, openingRight) {
  const fieldLeft = left + inset;
  const fieldRight = right - inset;
  const fieldBottom = inset;
  const fieldTop = height - inset;
  if (fieldRight - fieldLeft <= 0.02 || fieldTop - fieldBottom <= 0.02) return [];
  const clippedOpeningLeft = Math.max(fieldLeft, Math.min(fieldRight, openingLeft));
  const clippedOpeningRight = Math.max(fieldLeft, Math.min(fieldRight, openingRight));
  return [
    rectanglePanelShape(fieldLeft, clippedOpeningLeft, fieldBottom, fieldTop),
    rectanglePanelShape(clippedOpeningRight, fieldRight, fieldBottom, fieldTop),
  ].filter(Boolean);
}

function northRectangularRecessedDecorationSections(left, right, height, inset, openingLeft, openingRight) {
  return northRectangularRecessedDecorationShapes(left, right, height, inset, openingLeft, openingRight)
    .map((shape, index) => ({ shape, section: 'north_sides', mirror: index === 1 }));
}

function northRecessedDecorationSections(left, right, height, inset, archPoints, centerX) {
  const fieldLeft = left + inset;
  const fieldRight = right - inset;
  const fieldBottom = inset;
  const fieldTop = height - inset;
  if (fieldRight - fieldLeft <= 0.02 || fieldTop - fieldBottom <= 0.02) return [];
  if (!archPoints?.length) {
    return [rectanglePanelShape(fieldLeft, fieldRight, fieldBottom, fieldTop)]
      .filter(Boolean)
      .map((shape) => ({ shape, section: 'north_sides', mirror: false }));
  }
  const outerArchPoints = archPoints.map((_, index) => offsetArchPoint(archPoints, index, centerX, inset));
  const archLeft = Math.min(outerArchPoints[0].x, outerArchPoints[outerArchPoints.length - 1].x);
  const archRight = Math.max(outerArchPoints[0].x, outerArchPoints[outerArchPoints.length - 1].x);
  const sections = [
    { shape: rectanglePanelShape(fieldLeft, archLeft, fieldBottom, fieldTop), section: 'north_sides', mirror: false },
    { shape: rectanglePanelShape(archRight, fieldRight, fieldBottom, fieldTop), section: 'north_sides', mirror: true },
  ].filter((item) => item.shape);
  const { leftCurve, rightCurve } = splitArchPointsAtCenter(outerArchPoints, centerX);
  const leftTop = archTopHalfShape(leftCurve, centerX, fieldTop, false);
  const rightTop = archTopHalfShape(rightCurve, centerX, fieldTop, true);
  if (leftTop) sections.push({ shape: leftTop, section: 'north_top', mirror: false });
  if (rightTop) sections.push({ shape: rightTop, section: 'north_top', mirror: true });
  return sections;
}

function addNorthBoundary(group, state, layout, archPoints) {
  const boundary = state.northBoundary;
  if (!boundary.enabled) return;
  const offset = Math.max(boundary.inset, state.bricks.brickWidth);
  const borderWidth = Math.max(0.02, Math.min(offset, state.bricks.brickWidth));
  const outerLeft = layout.left;
  const outerRight = layout.right;
  const outerBottom = 0;
  const outerTop = layout.height;
  const innerLeft = outerLeft + offset;
  const innerRight = outerRight - offset;
  const innerBottom = outerBottom + offset;
  const innerTop = outerTop - offset;
  if (innerRight <= innerLeft || innerTop <= innerBottom) return;
  const z = layout.z;
  // Straight borders sit inside the raised north-wall ring created by the
  // offset. Their visible band width is one full brick length, matching the
  // Muqarnas boundary rule and avoiding skinny line-like strips.
  addSolidBorder(group, 'north', outerLeft + borderWidth / 2, outerTop / 2, borderWidth, outerTop, z, state, 'vertical');
  addSolidBorder(group, 'north', outerRight - borderWidth / 2, outerTop / 2, borderWidth, outerTop, z, state, 'vertical');
  addSolidBorder(group, 'north', (outerLeft + outerRight) / 2, outerTop - borderWidth / 2, outerRight - outerLeft, borderWidth, z, state, 'horizontal');
  if (archPoints?.length) {
    const mapped = archPoints;
    const openingLeft = mapped[0].x;
    const openingRight = mapped[mapped.length - 1].x;
    const springHeight = Math.max(outerBottom, Math.min(mapped[0].y, mapped[mapped.length - 1].y));
    if (openingLeft - outerLeft > 0.02) {
      addSolidBorder(group, 'north', (outerLeft + openingLeft) / 2, outerBottom + borderWidth / 2, openingLeft - outerLeft, borderWidth, z, state, 'horizontal');
    }
    if (outerRight - openingRight > 0.02) {
      addSolidBorder(group, 'north', (openingRight + outerRight) / 2, outerBottom + borderWidth / 2, outerRight - openingRight, borderWidth, z, state, 'horizontal');
    }
    if (springHeight - outerBottom > 0.02) {
      addSolidBorder(group, 'north', openingLeft - borderWidth / 2, (outerBottom + springHeight) / 2, borderWidth, springHeight - outerBottom, z, state, 'vertical');
      addSolidBorder(group, 'north', openingRight + borderWidth / 2, (outerBottom + springHeight) / 2, borderWidth, springHeight - outerBottom, z, state, 'vertical');
    }
    addCurvedBorderBricks(group, 'north', mapped, layout.centerX, borderWidth, z, state);
  } else {
    addSolidBorder(group, 'north', (outerLeft + outerRight) / 2, outerBottom + borderWidth / 2, outerRight - outerLeft, borderWidth, z, state, 'horizontal');
  }
}

function openingRect(opening, center, wallWidth, wallHeight, bottom = 0) {
  const width = Math.min(opening.width, wallWidth - 0.1);
  const wallLeft = center - wallWidth / 2;
  const wallRight = center + wallWidth / 2;
  const left = Math.max(wallLeft, Math.min(wallRight - width, center + opening.position - width / 2));
  const top = Math.min(wallHeight, bottom + opening.height);
  return { left, right: left + width, bottom, top, width, height: top - bottom };
}

function addRaisedOpeningArchCourse(group, openingType, profile, opening, inset, z, walls, wallSide = 'south', options = {}) {
  if (!walls.bricks.enabled || !profile?.archPoints?.length || inset <= 0.02) return;
  const outerPoints = profile.archPoints.map((_, index) => (
    offsetArchPoint(profile.archPoints, index, profile.center, inset, profile.bottom)
  ));
  const shape = new THREE.Shape();
  shape.moveTo(outerPoints[0].x, outerPoints[0].y);
  outerPoints.slice(1).forEach((point) => shape.lineTo(point.x, point.y));
  [...profile.archPoints].reverse().forEach((point) => shape.lineTo(point.x, point.y));
  shape.closePath();
  const projection = Math.max(0.018, Math.min(0.06, walls.northBoundary?.depth || 0.03));
  const archMapping = pointedArchBrickMapping(
    profile.center,
    profile.width / 2,
    profile.springTop,
    profile.springTop,
    Number(opening.arch?.greenOffset) || profile.width / 2,
    profile.greenHeight,
    inset,
    1e6,
    -1e6,
    1e6,
    { redOffset: opening.arch?.redOffset, redRadius: opening.arch?.redRadius },
  );
  const panel = extrudedShape(
    shape,
    projection,
    z - projection,
    raisedBorderMaterial(walls, options.materialSide || wallSide, profile.width, inset, 'horizontal', archMapping, 'x', options.coordinateSpace),
    wallSide,
  );
  panel.renderOrder = 7;
  panel.userData.isSoldierCourse = true;
  panel.userData.isSouthOpeningArchCourse = options.roomWall !== true && wallSide === 'south';
  panel.userData.isRoomWallOpeningArchCourse = options.roomWall === true || wallSide !== 'south';
  panel.userData.wallFace = options.wallFace || 'interior';
  panel.userData.openingTrimBondSide = options.materialSide || wallSide;
  panel.userData.openingType = openingType;
  panel.userData.soldierCourseRole = 'arch-head';
  group.add(panel);
}

export function southOpeningProfile(opening, center, wallWidth, wallHeight, bottom = 0) {
  const profile = openingRect(opening, center, wallWidth, wallHeight, bottom);
  profile.head = opening?.head === 'arch' ? 'arch' : 'lintel';
  profile.springTop = profile.top;
  profile.center = (profile.left + profile.right) / 2;
  if (profile.head !== 'arch') return profile;
  const arch = opening.arch || {};
  const greenHeight = profile.springTop + Number(arch.greenHeightOffset || 0);
  const points = archCurve(
    profile.center,
    profile.width / 2,
    profile.springTop,
    profile.springTop,
    Number(arch.greenOffset) || profile.width / 2,
    greenHeight,
    36,
    { redOffset: arch.redOffset, redRadius: arch.redRadius },
  );
  if (!points.length) {
    profile.head = 'lintel';
    return profile;
  }
  profile.archPoints = points;
  profile.greenHeight = greenHeight;
  profile.top = Math.max(...points.map((point) => point.y));
  profile.height = profile.top - profile.bottom;
  return profile;
}

function roomKarbandiOpeningMovesAboveWall(opening, wallSpan, wallHeight, bottom = 0) {
  if (!opening?.enabled) return false;
  const unconstrainedHeight = Math.max(
    wallHeight + 100,
    bottom + Math.max(0, Number(opening.height) || 0) + 100,
  );
  const profile = southOpeningProfile(opening, 0, wallSpan, unconstrainedHeight, bottom);
  return profile.top > wallHeight + 0.001;
}

function setShadow(group, enabled) {
  group.traverse((child) => {
    if (!child.isMesh) return;
    if (child.userData?.isKarbandiVisualGuide === true) {
      child.castShadow = false;
      child.receiveShadow = false;
      return;
    }
    child.castShadow = enabled;
    const continuousRoomWallFace = child.userData?.isRoomWallBody === true
      || child.userData?.roomDomePart === 'exterior-aligned-octagon-wall';
    // Lower Room walls and their transition continuation are one masonry
    // façade. Receiving the roof/rib shadow on only the upper mesh creates a
    // false dark band at their shared joint even when the planes and material
    // are identical. They still cast shadows as a single structural mass.
    child.receiveShadow = continuousRoomWallFace ? false : enabled;
    if (continuousRoomWallFace) {
      child.userData.roomContinuousWallShadowRule = 'shared-no-self-shadow-reception';
    }
  });
}

function addKarbandiVault(group, layout, walls) {
  if (!walls.karbandi?.enabled) return [];
  const {
    westX,
    westExteriorX,
    eastX,
    eastExteriorX,
    northZ,
    northExteriorZ,
    southZ,
    southExteriorZ,
    sideTop,
    wallThickness,
    wallHeights,
    northArchPoints,
    northWallLeft,
    northWallRight,
    northWallHeight,
    northOpeningLeft,
    northOpeningRight,
  } = layout;
  if (eastX - westX <= 0.05 || southZ - northZ <= 0.05) return [];
  const centerX = Number.isFinite(Number(layout.rotationCenterX))
    ? Number(layout.rotationCenterX)
    : (westX + eastX) / 2;
  // Iwan ribs rotate around the north exterior face. Room transition ribs use
  // the same generator with an explicit room-centre pivot supplied by layout.
  const centerZ = Number.isFinite(Number(layout.rotationCenterZ))
    ? Number(layout.rotationCenterZ)
    : northExteriorZ;
  const roomMode = layout.roomMode === true;
  const vestibuleMode = roomMode && layout.vestibuleMode === true;
  group.userData.karbandiRoomPerimeterRule = roomMode
    ? 'all-four-walls-use-south-wall-support-and-auto-clipping'
    : 'iwan-north-portal-with-south-east-west-support';
  group.userData.karbandiRoomRoofWallRule = vestibuleMode
    ? 'eight-octagonal-wall-edge-covers-bounded-by-adjacent-ribs'
    : roomMode
      ? 'four-equivalent-wall-supported-sides-with-iwan-ruled-corner-roofs'
    : null;
  const ribCount = Math.max(2, Math.round(walls.karbandi.ribCount || 16));
  group.userData.karbandiConfiguredRibCount = ribCount;
  const span = Math.max(0.2, Number(walls.karbandi.span) || Math.min(eastX - westX, southZ - northZ));
  const halfSpan = span / 2;
  const springY = sideTop + (Number(walls.karbandi.springHeightOffset) || 0);
  const greenOffset = Math.max(0.05, Number(walls.karbandi.greenOffset) || 0.5);
  const greenHeight = springY + (Number(walls.karbandi.greenHeightOffset) || 1.2);
  const ribWidth = Math.max(0.01, Number(walls.karbandi.ribWidth) || 0.16);
  const ribDepth = Math.max(0.01, Number(walls.karbandi.ribDepth) || 0.18);
  const referenceAngle = Number(walls.karbandi.referenceAngle) || 180;
  const halfFold = THREE.MathUtils.degToRad((180 - referenceAngle) / 2);
  const foldCosine = Math.cos(halfFold);
  const foldSine = Math.sin(halfFold);
  const referenceX = Number(walls.karbandi.referenceX) || 0;
  const referenceZ = Number(walls.karbandi.referenceZ) || 0;
  const referenceRotation = THREE.MathUtils.degToRad(Number(walls.karbandi.referenceRotation) || 0);
  const groupScale = Math.max(0.05, Number(walls.karbandi.groupScale) || DEFAULT_WALL_SYSTEM.karbandi.groupScale);
  const groupRotationY = THREE.MathUtils.degToRad(Number(walls.karbandi.groupRotationY) || 0);
  const groupTransform = new THREE.Matrix4()
    .makeTranslation(centerX + (Number(walls.karbandi.groupX) || 0), Number(walls.karbandi.groupY) || 0, centerZ + (Number(walls.karbandi.groupZ) || 0))
    .multiply(new THREE.Matrix4().makeRotationY(groupRotationY))
    .multiply(new THREE.Matrix4().makeScale(groupScale, groupScale, groupScale))
    .multiply(new THREE.Matrix4().makeTranslation(-centerX, 0, -centerZ));
  const roomOpeningRibClipRegions = roomMode ? WALL_SIDES.flatMap((side) => {
    const wallHeight = Number(wallHeights?.[side]) || sideTop;
    const wallSpan = side === 'north' || side === 'south'
      ? eastX - westX
      : southZ - northZ;
    const settings = walls.roomWallOpenings?.[side] || DEFAULT_WALL_SYSTEM.roomWallOpenings[side];
    return ['door', 'window'].map((openingType) => {
      const opening = settings?.[openingType];
      if (!opening?.enabled) return null;
      const bottom = openingType === 'window' ? Math.max(0, Number(opening.sillHeight) || 0) : 0;
      const profile = southOpeningProfile(opening, 0, wallSpan, 1000, bottom);
      if (profile.top <= wallHeight + 0.000001) return null;
      const localMinimum = Math.min(profile.left, profile.right);
      const localMaximum = Math.max(profile.left, profile.right);
      const coverDepth = Math.max(ribWidth, ribDepth) * groupScale + 0.03;
      if (side === 'north') return {
        side, openingType,
        minX: centerX - localMaximum, maxX: centerX - localMinimum,
        minY: Math.max(wallHeight, profile.bottom), maxY: profile.top,
        minZ: northExteriorZ - 0.03, maxZ: northZ + coverDepth,
      };
      if (side === 'south') return {
        side, openingType,
        minX: centerX + localMinimum, maxX: centerX + localMaximum,
        minY: Math.max(wallHeight, profile.bottom), maxY: profile.top,
        minZ: southZ - coverDepth, maxZ: southExteriorZ + 0.03,
      };
      if (side === 'east') return {
        side, openingType,
        minX: eastX - coverDepth, maxX: eastExteriorX + 0.03,
        minY: Math.max(wallHeight, profile.bottom), maxY: profile.top,
        minZ: centerZ - localMaximum, maxZ: centerZ - localMinimum,
      };
      return {
        side, openingType,
        minX: westExteriorX - 0.03, maxX: westX + coverDepth,
        minY: Math.max(wallHeight, profile.bottom), maxY: profile.top,
        minZ: centerZ + localMinimum, maxZ: centerZ + localMaximum,
      };
    }).filter(Boolean);
  }) : [];
  const configureRoomOpeningRibClip = (material) => {
    if (!roomOpeningRibClipRegions.length) return;
    const previousCompile = material.onBeforeCompile;
    const previousCacheKey = material.customProgramCacheKey?.bind(material);
    const clipConditions = roomOpeningRibClipRegions.map((region) => (
      `(vKarbandiOpeningWorldPosition.x >= ${region.minX.toFixed(9)} && `
      + `vKarbandiOpeningWorldPosition.x <= ${region.maxX.toFixed(9)} && `
      + `vKarbandiOpeningWorldPosition.y >= ${region.minY.toFixed(9)} && `
      + `vKarbandiOpeningWorldPosition.y <= ${region.maxY.toFixed(9)} && `
      + `vKarbandiOpeningWorldPosition.z >= ${region.minZ.toFixed(9)} && `
      + `vKarbandiOpeningWorldPosition.z <= ${region.maxZ.toFixed(9)})`
    )).join(' || ');
    material.onBeforeCompile = (shader, renderer) => {
      previousCompile?.(shader, renderer);
      shader.vertexShader = shader.vertexShader
        .replace('void main() {', 'varying vec3 vKarbandiOpeningWorldPosition;\nvoid main() {')
        .replace(
          '#include <project_vertex>',
          '#include <project_vertex>\nvKarbandiOpeningWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;',
        );
      shader.fragmentShader = shader.fragmentShader
        .replace('void main() {', 'varying vec3 vKarbandiOpeningWorldPosition;\nvoid main() {')
        .replace(
          '#include <output_fragment>',
          `if (${clipConditions}) discard;\n#include <output_fragment>`,
        );
    };
    material.customProgramCacheKey = () => `${previousCacheKey?.() || 'standard'}|room-octagon-opening-rib-clip-v1|${clipConditions}`;
    material.userData.roomKarbandiOpeningClipRegions = roomOpeningRibClipRegions.map((region) => ({ ...region }));
    material.userData.roomKarbandiOpeningClipRule = 'discard-rib-fragments-inside-inherited-octagon-openings';
    material.needsUpdate = true;
  };
  const offset = THREE.MathUtils.degToRad(Number(walls.karbandi.rotationOffset) || 0);
  const meshes = [];
  const clipPlanes = [
    new THREE.Plane(new THREE.Vector3(1, 0, 0), -(roomMode ? westX : westExteriorX)),
    new THREE.Plane(new THREE.Vector3(-1, 0, 0), roomMode ? eastX : eastExteriorX),
    // At the north wall, stop ribs at the interior portal face. The orbit
    // center remains independently anchored to the north exterior face.
    new THREE.Plane(new THREE.Vector3(0, 0, 1), -northZ),
    new THREE.Plane(new THREE.Vector3(0, 0, -1), roomMode ? southZ : southExteriorZ),
    new THREE.Plane(new THREE.Vector3(0, 1, 0), -Math.max(0, sideTop - 0.01)),
  ];
  const roomInteriorClipPlaneByWall = new Map([
    ['west', clipPlanes[0]],
    ['east', clipPlanes[1]],
    ['north', clipPlanes[2]],
    ['south', clipPlanes[3]],
  ]);
  const ribArchOptions = { redOffset: Number(walls.karbandi.redOffset) || 0 };
  const inner = archCurve(0, halfSpan, springY, springY, greenOffset, greenHeight, 28, ribArchOptions);
  const outer = archCurve(0, halfSpan + ribWidth, springY, springY, greenOffset, greenHeight, 28, ribArchOptions);
  if (!inner.length || !outer.length) return [];
  const apexIndex = inner.reduce((closest, point, index) => (
    Math.abs(point.x) < Math.abs(inner[closest].x) ? index : closest
  ), 0);
  const ribAngles = Array.from({ length: ribCount }, (_, index) => (
    offset + referenceRotation + (Math.PI * 2 * index) / ribCount
  ));
  const transformRibPoint = (point, angle, localZ = 0) => {
    let x = point.x;
    let z = localZ;
    if (Math.abs(x) >= 0.000001 && Math.abs(halfFold) > 0.000001) {
      const side = Math.sign(x);
      const foldedX = foldCosine * x - side * foldSine * z;
      z = side * foldSine * x + foldCosine * z;
      x = foldedX;
    }
    return new THREE.Vector3(x + referenceX, point.y, z + referenceZ)
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), angle)
      .add(new THREE.Vector3(centerX, 0, centerZ))
      .applyMatrix4(groupTransform);
  };
  const ribLegs = ribAngles.map((angle) => {
    const points = inner.map((point, originalIndex) => ({
      point: transformRibPoint(point, angle),
      originalIndex,
    }));
    return {
      left: points.slice(0, apexIndex + 1),
      right: points.slice(apexIndex).reverse(),
    };
  });
  const outerRibLegs = ribAngles.map((angle) => {
    const points = outer.map((point, originalIndex) => ({
      point: transformRibPoint(point, angle),
      originalIndex,
    }));
    return {
      left: points.slice(0, apexIndex + 1),
      right: points.slice(apexIndex).reverse(),
    };
  });
  const ribBaseCenters = ribLegs.map((legs) => ({
    left: legs.left[0].point,
    right: legs.right[0].point,
  }));
  if (walls.karbandi.guideVisible) {
    const guideLevel = sideTop + Math.max(0.008, Math.min(0.025, ribDepth * 0.12));
    const pivot = new THREE.Vector3(centerX, 0, centerZ).applyMatrix4(groupTransform);
    pivot.y = guideLevel;
    const legBases = ribBaseCenters.flatMap((legs, ribIndex) => ['left', 'right'].map((side) => ({
      ribIndex,
      side,
      point: legs[side],
      radius: Math.hypot(legs[side].x - pivot.x, legs[side].z - pivot.z),
    })));
    // Every transformed rib leg is part of the same rotation orbit. Measuring
    // all bases makes the guide follow span, fold, translation, rotation, and
    // scale edits instead of approximating the radius from the reference move.
    const radius = Math.max(
      0.01,
      legBases.reduce((sum, leg) => sum + leg.radius, 0) / Math.max(1, legBases.length),
    );
    const maximumLegRadiusDeviation = legBases.reduce((maximum, leg) => (
      Math.max(maximum, Math.abs(leg.radius - radius))
    ), 0);

    // A physical guide point represents the junction of two touching rib-leg
    // bands. Pair every left base with its nearest unused right base, then put
    // the point at their shared angular position on the measured leg circle.
    const pairCandidates = ribBaseCenters.flatMap((leftLegs, leftRibIndex) => (
      ribBaseCenters.map((rightLegs, rightRibIndex) => ({
        leftRibIndex,
        rightRibIndex,
        distance: leftLegs.left.distanceTo(rightLegs.right),
      }))
    )).sort((first, second) => first.distance - second.distance);
    const usedLeftRibs = new Set();
    const usedRightRibs = new Set();
    const legPairs = [];
    pairCandidates.forEach((candidate) => {
      if (usedLeftRibs.has(candidate.leftRibIndex) || usedRightRibs.has(candidate.rightRibIndex)) return;
      usedLeftRibs.add(candidate.leftRibIndex);
      usedRightRibs.add(candidate.rightRibIndex);
      legPairs.push(candidate);
    });
    legPairs.sort((first, second) => first.leftRibIndex - second.leftRibIndex);
    const divisionPoints = legPairs.map((pair) => {
      const leftPoint = ribBaseCenters[pair.leftRibIndex].left;
      const rightPoint = ribBaseCenters[pair.rightRibIndex].right;
      const junction = leftPoint.clone().add(rightPoint).multiplyScalar(0.5);
      let angle = Math.atan2(junction.z - pivot.z, junction.x - pivot.x);
      if (!Number.isFinite(angle)) angle = Math.atan2(leftPoint.z - pivot.z, leftPoint.x - pivot.x);
      return {
        point: new THREE.Vector3(
          pivot.x + Math.cos(angle) * radius,
          guideLevel,
          pivot.z + Math.sin(angle) * radius,
        ),
        pair,
        legBasePositions: [leftPoint.toArray(), rightPoint.toArray()],
      };
    });
    const startAngle = Math.atan2(
      divisionPoints[0].point.z - pivot.z,
      divisionPoints[0].point.x - pivot.x,
    );
    const circlePoints = Array.from({ length: 129 }, (_, index) => {
      const angle = startAngle + Math.PI * 2 * index / 128;
      return new THREE.Vector3(
        pivot.x + Math.cos(angle) * radius,
        guideLevel,
        pivot.z + Math.sin(angle) * radius,
      );
    });
    const guide = new THREE.Group();
    guide.name = 'Karbandi rib rotation visual guide';
    guide.userData.isKarbandiVisualGuide = true;
    guide.userData.karbandiGuideRole = 'rotation-guide';
    guide.userData.karbandiGuideCenter = pivot.toArray();
    guide.userData.karbandiGuideRadius = radius;
    guide.userData.karbandiGuideLevel = guideLevel;
    guide.userData.karbandiGuideDivisionCount = divisionPoints.length;
    guide.userData.karbandiGuideRadiusMethod = 'mean-transformed-rib-leg-base-radius';
    guide.userData.karbandiGuideMaximumLegRadiusDeviation = maximumLegRadiusDeviation;
    const circleGeometry = new THREE.BufferGeometry().setFromPoints(circlePoints);
    const circleMaterial = new THREE.LineBasicMaterial({
      color: '#f43f8f',
      transparent: true,
      opacity: 0.92,
      depthTest: false,
      depthWrite: false,
    });
    const circle = new THREE.Line(circleGeometry, circleMaterial);
    circle.name = 'Karbandi rib rotation circle';
    circle.renderOrder = 30;
    circle.userData.isKarbandiVisualGuide = true;
    circle.userData.karbandiGuideRole = 'rotation-circle';
    circle.raycast = () => {};
    guide.add(circle);
    const markerRadius = Math.max(0.025, Math.min(0.07, radius * 0.045));
    divisionPoints.forEach(({ point, pair, legBasePositions }, pointIndex) => {
      const marker = new THREE.Mesh(
        new THREE.CircleGeometry(markerRadius, 20),
        new THREE.MeshBasicMaterial({
          color: '#f43f8f',
          side: THREE.DoubleSide,
          depthTest: false,
          depthWrite: false,
        }),
      );
      marker.name = `Karbandi rib division ${pointIndex + 1}`;
      marker.rotation.x = -Math.PI / 2;
      marker.position.copy(point);
      marker.renderOrder = 31;
      marker.userData.isKarbandiVisualGuide = true;
      marker.userData.karbandiGuideRole = 'rib-division-point';
      marker.userData.karbandiRibIndex = pair.leftRibIndex;
      marker.userData.karbandiGuideLegs = [
        { ribIndex: pair.leftRibIndex, side: 'left' },
        { ribIndex: pair.rightRibIndex, side: 'right' },
      ];
      marker.userData.karbandiGuideLegBasePositions = legBasePositions;
      marker.raycast = () => {};
      guide.add(marker);
    });
    const centerMarker = new THREE.Mesh(
      new THREE.CircleGeometry(markerRadius * 0.72, 20),
      new THREE.MeshBasicMaterial({
        color: '#ffff00',
        side: THREE.DoubleSide,
        depthTest: false,
        depthWrite: false,
      }),
    );
    centerMarker.name = 'Karbandi rib rotation center';
    centerMarker.rotation.x = -Math.PI / 2;
    centerMarker.position.copy(pivot);
    centerMarker.renderOrder = 32;
    centerMarker.userData.isKarbandiVisualGuide = true;
    centerMarker.userData.karbandiGuideRole = 'rotation-center';
    centerMarker.userData.karbandiGuideColor = 'yellow';
    centerMarker.raycast = () => {};
    guide.add(centerMarker);
    group.add(guide);
    group.userData.karbandiVisualGuideVisible = true;
    group.userData.karbandiVisualGuideCenter = pivot.toArray();
    group.userData.karbandiVisualGuideRadius = radius;
    group.userData.karbandiVisualGuideLevel = guideLevel;
    group.userData.karbandiVisualGuideDivisionCount = divisionPoints.length;
    group.userData.karbandiVisualGuideRadiusMethod = 'mean-transformed-rib-leg-base-radius';
    group.userData.karbandiVisualGuideMaximumLegRadiusDeviation = maximumLegRadiusDeviation;
  } else {
    group.userData.karbandiVisualGuideVisible = false;
  }
  const baseButtCuts = new Map();
  const baseButtJoints = [];
  const baseEndpoints = ribLegs.flatMap((legs, ribIndex) => ['left', 'right'].map((side) => ({
    ribIndex,
    side,
    point: legs[side][0].point,
  })));
  const baseCoincidenceTolerance = Math.max(0.0005, ribDepth * groupScale * 0.01);
  const baseEdgeOffset = ribDepth * groupScale / 2;
  const baseEdgeContacts = [];
  for (let firstIndex = 0; firstIndex < baseEndpoints.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < baseEndpoints.length; secondIndex += 1) {
      const first = baseEndpoints[firstIndex];
      const second = baseEndpoints[secondIndex];
      if (first.ribIndex === second.ribIndex) continue;
      const centerDistance = first.point.distanceTo(second.point);
      if (Math.abs(centerDistance - baseEdgeOffset) > Math.max(0.000005, baseCoincidenceTolerance)) continue;
      baseEdgeContacts.push({
        firstRibIndex: first.ribIndex,
        firstSide: first.side,
        secondRibIndex: second.ribIndex,
        secondSide: second.side,
        centerDistance,
        edgeOffset: baseEdgeOffset,
        contactY: sideTop,
      });
    }
  }
  group.userData.karbandiRibBaseOverlapRule = 'solve-center-to-supporting-base-edge-on-wall-top';
  group.userData.karbandiBaseButtJointCount = baseButtJoints.length;
  group.userData.karbandiBaseButtJoints = baseButtJoints;
  group.userData.karbandiBaseEdgeContactCount = baseEdgeContacts.length;
  group.userData.karbandiBaseEdgeContacts = baseEdgeContacts;
  const referenceBaseCollisionDistance = Math.min(...['left', 'right'].flatMap((referenceSide) => (
    ribBaseCenters.slice(1).flatMap((other) => ['left', 'right'].map((otherSide) => (
      ribBaseCenters[0][referenceSide].distanceTo(other[otherSide])
    )))
  )));
  const transformedLegBaseY = ribBaseCenters[0].left.y;
  group.userData.karbandiWallTopY = sideTop;
  group.userData.karbandiTransformedLegBaseY = transformedLegBaseY;
  group.userData.karbandiLegBasesOnWallTop = Math.abs(transformedLegBaseY - sideTop) < 0.000001;
  group.userData.karbandiReferenceBaseCenterCollisionDistance = referenceBaseCollisionDistance;
  group.userData.karbandiReferenceBaseCentersCollide = referenceBaseCollisionDistance < 0.000002;
  group.userData.karbandiReferenceBaseEdgeOffset = baseEdgeOffset;
  group.userData.karbandiReferenceBaseCenterTouchesEdge = (
    Math.abs(referenceBaseCollisionDistance - baseEdgeOffset) < Math.max(0.000005, baseCoincidenceTolerance)
  );
  const verticalWallContactsForLeg = (ribIndex, side) => {
    const endpointIndex = side === 'left' ? 0 : inner.length - 1;
    const angle = ribAngles[ribIndex];
    const contactTolerance = Math.max(0.012, Math.max(ribWidth, ribDepth) * groupScale * 0.55);
    const endpointCandidates = [inner[endpointIndex], outer[endpointIndex]].flatMap((point) => [
      transformRibPoint(point, angle, -ribDepth / 2),
      transformRibPoint(point, angle, ribDepth / 2),
    ]);
    const centerlinePoint = transformRibPoint(inner[endpointIndex], angle);
    const contacts = new Map();
    endpointCandidates.forEach((point) => {
      const touchesWest = (
        point.x >= westExteriorX - contactTolerance
        && point.x <= westX + contactTolerance
        && point.z >= northZ - contactTolerance
        && point.z <= southExteriorZ + contactTolerance
      );
      const touchesEast = (
        point.x >= eastX - contactTolerance
        && point.x <= eastExteriorX + contactTolerance
        && point.z >= northZ - contactTolerance
        && point.z <= southExteriorZ + contactTolerance
      );
      const touchesSouth = (
        point.z >= southZ - contactTolerance
        && point.z <= southExteriorZ + contactTolerance
        && point.x >= westExteriorX - contactTolerance
        && point.x <= eastExteriorX + contactTolerance
      );
      const touchesNorth = roomMode && (
        point.z >= northExteriorZ - contactTolerance
        && point.z <= northZ + contactTolerance
        && point.x >= westExteriorX - contactTolerance
        && point.x <= eastExteriorX + contactTolerance
      );
      if (touchesWest) contacts.set('west', Math.abs(centerlinePoint.x - westX));
      if (touchesEast) contacts.set('east', Math.abs(centerlinePoint.x - eastX));
      if (touchesSouth) contacts.set('south', Math.abs(centerlinePoint.z - southZ));
      if (touchesNorth) contacts.set('north', Math.abs(centerlinePoint.z - northZ));
    });
    return [...contacts].map(([wall, distance]) => ({ wall, distance }));
  };
  const legTouchesVerticalWall = (ribIndex, side) => verticalWallContactsForLeg(ribIndex, side).length > 0;
  const segmentIntersectionXZ = (a, b, c, d) => {
    const rx = b.x - a.x;
    const rz = b.z - a.z;
    const sx = d.x - c.x;
    const sz = d.z - c.z;
    const denominator = rx * sz - rz * sx;
    if (Math.abs(denominator) < 0.000001) return null;
    const qx = c.x - a.x;
    const qz = c.z - a.z;
    const t = (qx * sz - qz * sx) / denominator;
    const u = (qx * rz - qz * rx) / denominator;
    if (t < -0.000001 || t > 1.000001 || u < -0.000001 || u > 1.000001) return null;
    return { t: Math.max(0, Math.min(1, t)), u: Math.max(0, Math.min(1, u)) };
  };
  const closestSegmentContact3D = (a, b, c, d) => {
    const first = b.clone().sub(a);
    const second = d.clone().sub(c);
    const separation = a.clone().sub(c);
    const aa = first.dot(first);
    const bb = first.dot(second);
    const cc = second.dot(second);
    const dd = first.dot(separation);
    const ee = second.dot(separation);
    const denominator = aa * cc - bb * bb;
    let firstT = denominator > 0.0000000001 ? (bb * ee - cc * dd) / denominator : 0;
    firstT = THREE.MathUtils.clamp(firstT, 0, 1);
    let secondT = cc > 0.0000000001 ? (bb * firstT + ee) / cc : 0;
    secondT = THREE.MathUtils.clamp(secondT, 0, 1);
    if (aa > 0.0000000001) firstT = THREE.MathUtils.clamp((bb * secondT - dd) / aa, 0, 1);
    const firstPoint = a.clone().lerp(b, firstT);
    const secondPoint = c.clone().lerp(d, secondT);
    return { firstT, secondT, firstPoint, secondPoint, distance: firstPoint.distanceTo(secondPoint) };
  };
  const firstRibIntersection = (ribIndex, side, minimumProgress = 0, allowedOtherRibs = null) => {
    const leg = ribLegs[ribIndex][side];
    let first = null;
    const baseJunctionClearance = Math.max(0.002, Math.max(ribWidth, ribDepth) * groupScale * 0.5);
    for (let otherIndex = 0; otherIndex < ribCount; otherIndex += 1) {
      if (otherIndex === ribIndex) continue;
      if (allowedOtherRibs && !allowedOtherRibs.has(otherIndex)) continue;
      for (const otherSide of ['left', 'right']) {
        const otherLeg = ribLegs[otherIndex][otherSide];
        for (let segmentIndex = 0; segmentIndex < leg.length - 1; segmentIndex += 1) {
          if (first && segmentIndex > first.progress) break;
          const a = leg[segmentIndex].point;
          const b = leg[segmentIndex + 1].point;
          for (let otherSegmentIndex = 0; otherSegmentIndex < otherLeg.length - 1; otherSegmentIndex += 1) {
            const c = otherLeg[otherSegmentIndex].point;
            const d = otherLeg[otherSegmentIndex + 1].point;
            const crossing = segmentIntersectionXZ(a, b, c, d);
            if (!crossing) continue;
            const y = THREE.MathUtils.lerp(a.y, b.y, crossing.t);
            const otherY = THREE.MathUtils.lerp(c.y, d.y, crossing.u);
            if (Math.abs(y - otherY) > ribWidth * groupScale * 1.5) continue;
            if (Math.min(y, otherY) <= sideTop + baseJunctionClearance) continue;
            const progress = segmentIndex + crossing.t;
            // Ignore a coincident endpoint; it does not provide a useful trim.
            if (progress <= minimumProgress + 0.001 || (first && progress >= first.progress)) continue;
            const originalIndex = THREE.MathUtils.lerp(
              leg[segmentIndex].originalIndex,
              leg[segmentIndex + 1].originalIndex,
              crossing.t,
            );
            first = { progress, originalIndex, otherIndex, otherSide };
          }
        }
      }
    }
    if (!first) {
      const physicalContactTolerance = Math.max(ribWidth, ribDepth) * groupScale;
      for (let otherIndex = 0; otherIndex < ribCount; otherIndex += 1) {
        if (otherIndex === ribIndex) continue;
        if (allowedOtherRibs && !allowedOtherRibs.has(otherIndex)) continue;
        for (const otherSide of ['left', 'right']) {
          const otherLeg = ribLegs[otherIndex][otherSide];
          for (let segmentIndex = 0; segmentIndex < leg.length - 1; segmentIndex += 1) {
            for (let otherSegmentIndex = 0; otherSegmentIndex < otherLeg.length - 1; otherSegmentIndex += 1) {
              const contact = closestSegmentContact3D(
                leg[segmentIndex].point,
                leg[segmentIndex + 1].point,
                otherLeg[otherSegmentIndex].point,
                otherLeg[otherSegmentIndex + 1].point,
              );
              const progress = segmentIndex + contact.firstT;
              const contactHeight = (contact.firstPoint.y + contact.secondPoint.y) / 2;
              if (contact.distance > physicalContactTolerance
                || contactHeight <= sideTop + baseJunctionClearance
                || progress <= minimumProgress + 0.001
                || (first && progress >= first.progress)) continue;
              first = {
                progress,
                originalIndex: THREE.MathUtils.lerp(
                  leg[segmentIndex].originalIndex,
                  leg[segmentIndex + 1].originalIndex,
                  contact.firstT,
                ),
                otherIndex,
                otherSide,
                physicalBandContact: true,
              };
            }
          }
        }
      }
    }
    if (!first) return null;
    // A rib is a finite-width band. Its inner and outer profile edges reach a
    // crossing at different curve positions, so slicing both at the inner-edge
    // index leaves a short outer wedge beyond the supporting rib. Resolve the
    // outer edge independently against that supporting rib's centreline; the
    // terminal face then lies on the centreline and no detached tip survives.
    const outerLeg = outerRibLegs[ribIndex][side];
    const supportLeg = ribLegs[first.otherIndex]?.[first.otherSide];
    let outerCut = null;
    if (outerLeg && supportLeg) {
      for (let segmentIndex = 0; segmentIndex < outerLeg.length - 1; segmentIndex += 1) {
        const a = outerLeg[segmentIndex];
        const b = outerLeg[segmentIndex + 1];
        for (let supportSegmentIndex = 0; supportSegmentIndex < supportLeg.length - 1; supportSegmentIndex += 1) {
          const c = supportLeg[supportSegmentIndex];
          const d = supportLeg[supportSegmentIndex + 1];
          const crossing = segmentIntersectionXZ(a.point, b.point, c.point, d.point);
          if (!crossing) continue;
          const edgeY = THREE.MathUtils.lerp(a.point.y, b.point.y, crossing.t);
          const supportY = THREE.MathUtils.lerp(c.point.y, d.point.y, crossing.u);
          if (Math.abs(edgeY - supportY) > Math.max(ribWidth, ribDepth) * groupScale * 2.5) continue;
          const originalIndex = THREE.MathUtils.lerp(a.originalIndex, b.originalIndex, crossing.t);
          const distanceFromInnerCut = Math.abs(originalIndex - first.originalIndex);
          if (outerCut && distanceFromInnerCut >= outerCut.distanceFromInnerCut) continue;
          outerCut = { originalIndex, distanceFromInnerCut };
        }
      }
    }
    return {
      ...first,
      outerOriginalIndex: outerCut?.originalIndex ?? first.originalIndex,
      cutBoundary: 'support-rib-centerline',
    };
  };
  const automaticCuts = new Map();
  const wallLegCandidates = new Map();
  if (clipPlanes && walls.karbandi.autoClip) {
    for (let ribIndex = 0; ribIndex < ribCount; ribIndex += 1) {
      for (const side of ['left', 'right']) {
        verticalWallContactsForLeg(ribIndex, side).forEach(({ wall, distance }) => {
          if (!wallLegCandidates.has(wall)) wallLegCandidates.set(wall, []);
          wallLegCandidates.get(wall).push({ wall, ribIndex, side, distance });
        });
      }
    }
  }
  // Symmetric wall-parallel ribs have two equally close feet. Keep both; the
  // tolerance only absorbs floating-point differences and does not admit the
  // visibly deeper diagonal feet.
  const closestWallDistanceTolerance = 0.0001;
  const closestWallLegs = [...wallLegCandidates.values()].flatMap((candidates) => {
    const closestDistance = Math.min(...candidates.map(({ distance }) => distance));
    return candidates.filter(({ distance }) => distance <= closestDistance + closestWallDistanceTolerance);
  });
  const wallSupportedRibIndexes = new Set(
    [...wallLegCandidates.values()].flatMap((candidates) => candidates.map(({ ribIndex }) => ribIndex)),
  );
  const closestWallSupportedRibIndexes = new Set(closestWallLegs.map(({ ribIndex }) => ribIndex));
  const baseTouchingWallSupportedRibIndexes = new Set();
  const baseTouchingWallSupportedLegKeys = new Set();
  baseEdgeContacts.forEach(({ firstRibIndex, firstSide, secondRibIndex, secondSide }) => {
    if (closestWallSupportedRibIndexes.has(firstRibIndex)
      && !closestWallSupportedRibIndexes.has(secondRibIndex)
      && legTouchesVerticalWall(secondRibIndex, secondSide)) {
      baseTouchingWallSupportedRibIndexes.add(secondRibIndex);
      baseTouchingWallSupportedLegKeys.add(`${secondRibIndex}:${secondSide}`);
    }
    if (closestWallSupportedRibIndexes.has(secondRibIndex)
      && !closestWallSupportedRibIndexes.has(firstRibIndex)
      && legTouchesVerticalWall(firstRibIndex, firstSide)) {
      baseTouchingWallSupportedRibIndexes.add(firstRibIndex);
      baseTouchingWallSupportedLegKeys.add(`${firstRibIndex}:${firstSide}`);
    }
  });
  // One level of wall-adjacent base-bearing ribs joins the supported frame.
  // A remote base touching the interior leg of a supported rib is not itself
  // support, and promotion never recurses through the full contact ring.
  const wallSupportedFrameRibIndexes = new Set([
    ...closestWallSupportedRibIndexes,
    ...baseTouchingWallSupportedRibIndexes,
  ]);
  const wallSupportedLegKeys = new Set([
    ...closestWallLegs.map(({ ribIndex, side }) => `${ribIndex}:${side}`),
    ...baseTouchingWallSupportedLegKeys,
  ]);
  const closestWallSupportedRibIndexesByWall = new Map([...wallLegCandidates.keys()].map((wall) => [
    wall,
    new Set(closestWallLegs.filter((leg) => leg.wall === wall).map((leg) => leg.ribIndex)),
  ]));
  const closestWallLegsByRib = new Map();
  closestWallLegs.forEach((leg) => {
    if (!closestWallLegsByRib.has(leg.ribIndex)) closestWallLegsByRib.set(leg.ribIndex, []);
    closestWallLegsByRib.get(leg.ribIndex).push(leg);
  });
  let redundantWallLegCutCount = 0;
  const redundantWallCutRibIndexes = new Set();
  const redundantWallLegCuts = [];
  if (clipPlanes && walls.karbandi.autoClip) {
    for (let ribIndex = 0; ribIndex < ribCount; ribIndex += 1) {
      for (const side of ['left', 'right']) {
        const wallContacts = verticalWallContactsForLeg(ribIndex, side);
        const supportedByVerticalWall = wallContacts.length > 0;
        const legKey = `${ribIndex}:${side}`;
        // Support belongs to the bearing leg, not automatically to the whole
        // arch. Keep the wall/base-bearing leg and trim its opposite leg to
        // the first different rib in the expanded supported frame.
        if (wallSupportedLegKeys.has(legKey)) continue;
        const sideWallContacts = roomMode
          ? wallContacts
          : wallContacts.filter(({ wall }) => wall === 'east' || wall === 'west');
        const targetWallContacts = sideWallContacts.length ? sideWallContacts : wallContacts;
        const supportFrameIntersection = firstRibIntersection(
          ribIndex,
          side,
          0,
          wallSupportedFrameRibIndexes,
        );
        if (supportedByVerticalWall) {
          // The nearest wall-seated ribs form one highlighted clipping frame.
          // Every other wall-touching leg stops at that frame rather than at an
          // arbitrary intermediate rib, removing the bay between both ribs.
          const frameCut = supportFrameIntersection || {
            originalIndex: apexIndex,
            progress: Number.POSITIVE_INFINITY,
            otherIndex: null,
          };
          automaticCuts.set(legKey, {
            ...frameCut,
            clippedToHighlightedSupportFrame: true,
          });
          redundantWallLegCutCount += 1;
          redundantWallCutRibIndexes.add(ribIndex);
          redundantWallLegCuts.push({
            ribIndex,
            side,
            walls: targetWallContacts.map(({ wall }) => wall),
            originalIndex: frameCut.originalIndex,
            outerOriginalIndex: frameCut.outerOriginalIndex ?? frameCut.originalIndex,
            cutBoundary: frameCut.cutBoundary || 'support-rib-centerline',
            supportRibIndex: frameCut.otherIndex,
            supportWall: closestWallLegs.find(({ ribIndex: supportRibIndex }) => (
              supportRibIndex === frameCut.otherIndex
            ))?.wall || null,
          });
          continue;
        }
        // A leg with no wall support is hanging regardless of whether its foot
        // lies inside or outside the building bounds. Skip crossings with other
        // hanging ribs and clip it through to the first rib whose foot is among
        // the closest supports at an interior wall face.
        const supportedIntersection = firstRibIntersection(
          ribIndex,
          side,
          0,
          wallSupportedFrameRibIndexes,
        );
        automaticCuts.set(legKey, supportedIntersection ? {
          ...supportedIntersection,
          clippedToWallSupportedRib: true,
          clippedToHighlightedSupportFrame: true,
        } : {
          originalIndex: apexIndex,
          progress: Number.POSITIVE_INFINITY,
          otherIndex: null,
          clippedToWallSupportedRib: false,
          clippedToHighlightedSupportFrame: true,
        });
      }
    }
  }
  const manualCutSteps = new Map((walls.karbandi.manualCuts || []).map((cut) => [
    `${cut.ribIndex}:${cut.side}`,
    Math.max(1, Math.round(Number(cut.steps) || 1)),
  ]));
  const pointAtCurveIndex = (curve, value) => {
    const lower = Math.max(0, Math.min(curve.length - 1, Math.floor(value)));
    const upper = Math.max(0, Math.min(curve.length - 1, Math.ceil(value)));
    if (lower === upper) return curve[lower].clone();
    return curve[lower].clone().lerp(curve[upper], value - lower);
  };
  const roomOctagonLegKeys = baseTouchingWallSupportedLegKeys.size >= 8
    ? baseTouchingWallSupportedLegKeys
    : wallSupportedLegKeys;
  const roomWallSupportedLegs = roomMode ? [...roomOctagonLegKeys].map((key) => {
    const [ribIndexText, side] = key.split(':');
    const ribIndex = Number(ribIndexText);
    const contacts = verticalWallContactsForLeg(ribIndex, side);
    const footLocal = side === 'left' ? inner[0] : inner[inner.length - 1];
    const footPoint = footLocal ? transformRibPoint(footLocal, ribAngles[ribIndex]) : null;
    return {
      ribIndex,
      side,
      wall: contacts[0]?.wall || null,
      walls: [...new Set(contacts.map((contact) => contact.wall).filter(Boolean))],
      footPoint,
    };
  }).filter((entry) => entry.wall) : [];
  const mergeRoomSupportPoints = (entries, pointKey) => entries.reduce((merged, entry) => {
    const point = entry[pointKey];
    if (!point) return merged;
    const existing = merged.find((candidate) => candidate[pointKey].distanceToSquared(point) < 0.000001);
    if (existing) {
      existing.walls = [...new Set([...(existing.walls || [existing.wall]), ...(entry.walls || [entry.wall])].filter(Boolean))];
      return merged;
    }
    merged.push({ ...entry, walls: [...new Set(entry.walls || [entry.wall])].filter(Boolean) });
    return merged;
  }, []);
  const roomWallSupportFootOctagon = mergeRoomSupportPoints(
    roomWallSupportedLegs.filter((entry) => entry.footPoint),
    'footPoint',
  )
    .sort((left, right) => (
      Math.atan2(left.footPoint.z - centerZ, left.footPoint.x - centerX)
      - Math.atan2(right.footPoint.z - centerZ, right.footPoint.x - centerX)
    ));
  const roomFirstJunctionOctagon = roomWallSupportedLegs
    .map(({ ribIndex, side, wall }) => {
      const junction = firstRibIntersection(ribIndex, side, 0);
      if (!junction || junction.otherIndex == null) return null;
      const point = transformRibPoint(
        pointAtCurveIndex(inner, junction.originalIndex),
        ribAngles[ribIndex],
      );
      return {
        point,
        ribIndex,
        side,
        wall,
        walls: roomWallSupportedLegs.find((entry) => (
          entry.ribIndex === ribIndex && entry.side === side
        ))?.walls || [wall],
        supportRibIndex: junction.otherIndex,
        originalIndex: junction.originalIndex,
      };
    })
    .filter(Boolean)
    ;
  const mergedRoomFirstJunctionOctagon = mergeRoomSupportPoints(roomFirstJunctionOctagon, 'point')
    .sort((left, right) => (
      Math.atan2(left.point.z - centerZ, left.point.x - centerX)
      - Math.atan2(right.point.z - centerZ, right.point.x - centerX)
    ));
  const roomFirstJunctionY = mergedRoomFirstJunctionOctagon.length >= 3
    ? mergedRoomFirstJunctionOctagon.reduce((sum, entry) => sum + entry.point.y, 0) / mergedRoomFirstJunctionOctagon.length
    : null;
  group.userData.roomKarbandiFirstJunctionLevel = roomFirstJunctionY;
  group.userData.roomKarbandiFirstJunctionCandidates = mergedRoomFirstJunctionOctagon.map((entry) => ({
    point: entry.point.toArray(),
    ribIndex: entry.ribIndex,
    side: entry.side,
    wall: entry.wall,
    walls: entry.walls,
    supportRibIndex: entry.supportRibIndex,
    originalIndex: entry.originalIndex,
  }));
  const junctionSupportedWalls = new Set(mergedRoomFirstJunctionOctagon.flatMap((entry) => entry.walls || [entry.wall]));
  const junctionSideCount = [4, 8].includes(mergedRoomFirstJunctionOctagon.length)
    && junctionSupportedWalls.size === 4
    ? mergedRoomFirstJunctionOctagon.length
    : 0;
  // Normally the first visible intersections identify the four- or eight-leg
  // plan. If clipping removes those intersections, recover the plan from the
  // actual rib count and wall-bearing feet instead of dropping the transition.
  const inferredSideCount = [4, 8].includes(ribCount / 2) ? ribCount / 2 : 0;
  const transitionSideCount = junctionSideCount || inferredSideCount;
  let roomTransitionWallFeet = [];
  if (junctionSideCount) {
    roomTransitionWallFeet = mergedRoomFirstJunctionOctagon.map((junction) => (
      roomWallSupportedLegs.find((entry) => (
        entry.ribIndex === junction.ribIndex && entry.side === junction.side
      ))
    )).filter((entry) => entry?.footPoint);
  } else if (inferredSideCount === 4) {
    // A square needs one bearing leg on each cardinal wall. Its plan geometry
    // follows the four Room wall planes, so redundant neighbouring feet must
    // not turn it into an octagon or suppress it.
    if (roomWallSupportFootOctagon.length >= 4) {
      roomTransitionWallFeet = Array.from({ length: 4 }, (_, index) => (
        roomWallSupportFootOctagon[Math.floor(index * roomWallSupportFootOctagon.length / 4)]
      ));
    }
  } else if (inferredSideCount === 8 && roomWallSupportFootOctagon.length >= 8) {
    roomTransitionWallFeet = roomWallSupportFootOctagon.slice(0, 8);
  }
  const validTransitionTopology = roomTransitionWallFeet.length === transitionSideCount
    && new Set(roomTransitionWallFeet.flatMap((entry) => entry.walls || [entry.wall])).size === 4;
  group.userData.roomKarbandiFirstJunctionOctagon = validTransitionTopology
    ? mergedRoomFirstJunctionOctagon.map((entry) => ({
      point: [entry.point.x, roomFirstJunctionY, entry.point.z],
      ribIndex: entry.ribIndex,
      side: entry.side,
      wall: entry.wall,
      walls: entry.walls,
      supportRibIndex: entry.supportRibIndex,
      originalIndex: entry.originalIndex,
    }))
    : [];
  group.userData.roomKarbandiFirstJunctionOctagonSource = validTransitionTopology
    && mergedRoomFirstJunctionOctagon.length === transitionSideCount
    ? `${transitionSideCount}-first-intersections-of-visible-wall-supported-rib-legs`
    : null;
  group.userData.roomKarbandiWallSupportFootOctagon = validTransitionTopology
    ? roomTransitionWallFeet.map((entry) => ({
      point: entry.footPoint.toArray(),
      ribIndex: entry.ribIndex,
      side: entry.side,
      wall: entry.wall,
      walls: entry.walls,
    }))
    : [];
  group.userData.roomKarbandiWallSupportFootOctagonSource = validTransitionTopology
    ? `${transitionSideCount}-visible-wall-supported-rib-feet-on-all-four-walls`
    : null;
  group.userData.roomKarbandiTransitionSideCount = validTransitionTopology ? transitionSideCount : 0;
  group.userData.roomKarbandiTransitionPlan = transitionSideCount === 8
    ? 'octagon'
    : transitionSideCount === 4 ? 'square' : 'none';
  const sliceCurveAtIndices = (curve, start, end) => {
    const points = [pointAtCurveIndex(curve, start)];
    for (let index = Math.ceil(start); index <= Math.floor(end); index += 1) {
      if (index > start + 0.000001 && index < end - 0.000001) points.push(curve[index]);
    }
    if (end > start + 0.000001) points.push(pointAtCurveIndex(curve, end));
    return points;
  };
  const visibleRibRanges = new Map();
  const visibleRangeForRib = (ribIndex, cuts = automaticCuts) => {
    const automaticLeft = cuts.get(`${ribIndex}:left`);
    const automaticRight = cuts.get(`${ribIndex}:right`);
    const manualCutIndex = (side, automaticCut) => {
      const steps = manualCutSteps.get(`${ribIndex}:${side}`) || 0;
      if (!steps) return null;
      // Each click advances from the currently visible endpoint to the next
      // physical junction. Portal clipping contributes its own initial cut.
      let progress = automaticCut?.progress || 0;
      let originalIndex = automaticCut?.originalIndex ?? (side === 'left' ? 0 : inner.length - 1);
      for (let step = 0; step < steps; step += 1) {
        const intersection = firstRibIntersection(ribIndex, side, progress);
        if (!intersection) return apexIndex;
        progress = intersection.progress;
        originalIndex = intersection.originalIndex;
      }
      return originalIndex;
    };
    const manualLeft = manualCutIndex('left', automaticLeft);
    const manualRight = manualCutIndex('right', automaticRight);
    const buttLeft = baseButtCuts.get(`${ribIndex}:left`);
    const buttRight = baseButtCuts.get(`${ribIndex}:right`);
    const start = Math.max(
      manualLeft == null ? 0 : manualLeft,
      automaticLeft == null ? 0 : automaticLeft.originalIndex,
      buttLeft == null ? 0 : buttLeft.originalIndex,
    );
    const end = Math.min(
      manualRight == null ? inner.length - 1 : manualRight,
      automaticRight == null ? inner.length - 1 : automaticRight.originalIndex,
      buttRight == null ? inner.length - 1 : buttRight.originalIndex,
    );
    if (end - start < 3) return null;
    const outerStart = Math.max(
      manualLeft == null ? 0 : manualLeft,
      automaticLeft == null ? 0 : (automaticLeft.outerOriginalIndex ?? automaticLeft.originalIndex),
      buttLeft == null ? 0 : buttLeft.originalIndex,
    );
    const outerEnd = Math.min(
      manualRight == null ? inner.length - 1 : manualRight,
      automaticRight == null ? inner.length - 1 : (automaticRight.outerOriginalIndex ?? automaticRight.originalIndex),
      buttRight == null ? inner.length - 1 : buttRight.originalIndex,
    );
    if (outerEnd - outerStart < 3) return null;
    return { start, end, outerStart, outerEnd };
  };
  for (let ribIndex = 0; ribIndex < ribCount; ribIndex += 1) {
    const range = visibleRangeForRib(ribIndex);
    if (range) visibleRibRanges.set(ribIndex, range);
  }
  group.userData.karbandiClosestWallLegs = closestWallLegs;
  group.userData.karbandiDirectWallSupportedRibIndexes = [...closestWallSupportedRibIndexes].sort((a, b) => a - b);
  group.userData.karbandiWallSupportedRibIndexes = [...wallSupportedFrameRibIndexes].sort((a, b) => a - b);
  group.userData.karbandiBaseTouchingWallSupportedRibIndexes = [...baseTouchingWallSupportedRibIndexes].sort((a, b) => a - b);
  group.userData.karbandiBaseTouchingWallSupportedLegKeys = [...baseTouchingWallSupportedLegKeys].sort();
  group.userData.karbandiWallSupportedLegKeys = [...wallSupportedLegKeys].sort();
  group.userData.karbandiAutoClipSupportedFrameRibIndexes = [...wallSupportedFrameRibIndexes].sort((a, b) => a - b);
  group.userData.karbandiHighlightedWallSupportRibIndexes = [...wallSupportedFrameRibIndexes].sort((a, b) => a - b);
  group.userData.karbandiHighlightedWallSupportRibIndexesByWall = Object.fromEntries(
    [...closestWallSupportedRibIndexesByWall].map(([wall, indexes]) => [
      wall,
      [...indexes].sort((a, b) => a - b),
    ]),
  );
  group.userData.karbandiAutoClipSupportFrame = walls.karbandi.autoClip
    ? 'nearest-interior-wall-ribs'
    : null;
  group.userData.karbandiAllWallTouchingLegs = [...wallLegCandidates.values()]
    .flat()
    .map((leg) => ({ ...leg }));
  group.userData.karbandiAllWallTouchingRibIndexes = [...wallSupportedRibIndexes];
  group.userData.karbandiRedundantWallLegCutCount = redundantWallLegCutCount;
  group.userData.karbandiRedundantWallLegCuts = redundantWallLegCuts;
  group.userData.karbandiAutoClipEnabled = walls.karbandi.autoClip;
  group.userData.karbandiAutomaticCutCount = automaticCuts.size;

  const attachedRibs = new Map([...visibleRibRanges.keys()].map((ribIndex) => [ribIndex, new Set()]));
  const visibleJunctions = new Map([...visibleRibRanges.keys()].map((ribIndex) => [ribIndex, []]));
  baseButtJoints.forEach((joint) => {
    if (!visibleRibRanges.has(joint.trimmedRibIndex) || !visibleRibRanges.has(joint.supportRibIndex)) return;
    attachedRibs.get(joint.trimmedRibIndex)?.add(joint.supportRibIndex);
    attachedRibs.get(joint.supportRibIndex)?.add(joint.trimmedRibIndex);
    visibleJunctions.get(joint.trimmedRibIndex)?.push({
      otherIndex: joint.supportRibIndex,
      originalIndex: joint.trimmedOriginalIndex,
      buttJoint: true,
    });
  });
  baseEdgeContacts.forEach((contact) => {
    if (!visibleRibRanges.has(contact.firstRibIndex) || !visibleRibRanges.has(contact.secondRibIndex)) return;
    attachedRibs.get(contact.firstRibIndex)?.add(contact.secondRibIndex);
    attachedRibs.get(contact.secondRibIndex)?.add(contact.firstRibIndex);
    visibleJunctions.get(contact.firstRibIndex)?.push({
      otherIndex: contact.secondRibIndex,
      originalIndex: contact.firstSide === 'left' ? 0 : inner.length - 1,
      baseEdgeContact: true,
    });
    visibleJunctions.get(contact.secondRibIndex)?.push({
      otherIndex: contact.firstRibIndex,
      originalIndex: contact.secondSide === 'left' ? 0 : inner.length - 1,
      baseEdgeContact: true,
    });
  });
  const originalIndexInsideRange = (ribIndex, originalIndex) => {
    const range = visibleRibRanges.get(ribIndex);
    return range && originalIndex >= range.start - 0.001 && originalIndex <= range.end + 0.001;
  };
  const connectVisibleRibsAtJunctions = (firstIndex, secondIndex) => {
    let closestPhysicalContact = null;
    const physicalContactTolerance = Math.max(ribWidth, ribDepth) * groupScale;
    for (const firstSide of ['left', 'right']) {
      const firstLeg = ribLegs[firstIndex][firstSide];
      for (const secondSide of ['left', 'right']) {
        const secondLeg = ribLegs[secondIndex][secondSide];
        for (let firstSegment = 0; firstSegment < firstLeg.length - 1; firstSegment += 1) {
          const a = firstLeg[firstSegment];
          const b = firstLeg[firstSegment + 1];
          for (let secondSegment = 0; secondSegment < secondLeg.length - 1; secondSegment += 1) {
            const c = secondLeg[secondSegment];
            const d = secondLeg[secondSegment + 1];
            const crossing = segmentIntersectionXZ(a.point, b.point, c.point, d.point);
            if (crossing) {
              const firstY = THREE.MathUtils.lerp(a.point.y, b.point.y, crossing.t);
              const secondY = THREE.MathUtils.lerp(c.point.y, d.point.y, crossing.u);
              if (Math.abs(firstY - secondY) <= ribWidth * groupScale * 1.5) {
                const firstOriginalIndex = THREE.MathUtils.lerp(a.originalIndex, b.originalIndex, crossing.t);
                const secondOriginalIndex = THREE.MathUtils.lerp(c.originalIndex, d.originalIndex, crossing.u);
                if (originalIndexInsideRange(firstIndex, firstOriginalIndex)
                  && originalIndexInsideRange(secondIndex, secondOriginalIndex)) {
                  attachedRibs.get(firstIndex)?.add(secondIndex);
                  attachedRibs.get(secondIndex)?.add(firstIndex);
                  visibleJunctions.get(firstIndex)?.push({ otherIndex: secondIndex, originalIndex: firstOriginalIndex });
                  visibleJunctions.get(secondIndex)?.push({ otherIndex: firstIndex, originalIndex: secondOriginalIndex });
                  return;
                }
              }
            }
            // Finite-width ribs can make a valid physical joint without their
            // sampled centrelines crossing exactly. Count the same band contact
            // used by auto clipping so connectivity pruning does not discard a
            // genuinely joined component (or retain a merely projected one).
            const contact = closestSegmentContact3D(a.point, b.point, c.point, d.point);
            if (contact.distance > physicalContactTolerance) continue;
            const firstOriginalIndex = THREE.MathUtils.lerp(a.originalIndex, b.originalIndex, contact.firstT);
            const secondOriginalIndex = THREE.MathUtils.lerp(c.originalIndex, d.originalIndex, contact.secondT);
            if (!originalIndexInsideRange(firstIndex, firstOriginalIndex)
              || !originalIndexInsideRange(secondIndex, secondOriginalIndex)
              || (closestPhysicalContact && contact.distance >= closestPhysicalContact.distance)) continue;
            closestPhysicalContact = { distance: contact.distance, firstOriginalIndex, secondOriginalIndex };
          }
        }
      }
    }
    if (!closestPhysicalContact) return;
    attachedRibs.get(firstIndex)?.add(secondIndex);
    attachedRibs.get(secondIndex)?.add(firstIndex);
    visibleJunctions.get(firstIndex)?.push({
      otherIndex: secondIndex,
      originalIndex: closestPhysicalContact.firstOriginalIndex,
      physicalBandContact: true,
    });
    visibleJunctions.get(secondIndex)?.push({
      otherIndex: firstIndex,
      originalIndex: closestPhysicalContact.secondOriginalIndex,
      physicalBandContact: true,
    });
  };
  const visibleRibIndexes = [...visibleRibRanges.keys()];
  for (let first = 0; first < visibleRibIndexes.length; first += 1) {
    for (let second = first + 1; second < visibleRibIndexes.length; second += 1) {
      connectVisibleRibsAtJunctions(visibleRibIndexes[first], visibleRibIndexes[second]);
    }
  }
  const supportedRibs = visibleRibIndexes.filter((ribIndex) => {
    const range = visibleRibRanges.get(ribIndex);
    if (!walls.karbandi.autoClip) {
      const leftSupported = range.start <= 0.001 && legTouchesVerticalWall(ribIndex, 'left');
      const rightSupported = range.end >= inner.length - 1 - 0.001 && legTouchesVerticalWall(ribIndex, 'right');
      return leftSupported || rightSupported;
    }
    if (!wallSupportedFrameRibIndexes.has(ribIndex)) return false;
    if (baseTouchingWallSupportedRibIndexes.has(ribIndex)) return true;
    const supportLegs = closestWallLegsByRib.get(ribIndex) || [];
    const leftSupported = range.start <= 0.001 && supportLegs.some(({ side }) => side === 'left');
    const rightSupported = range.end >= inner.length - 1 - 0.001 && supportLegs.some(({ side }) => side === 'right');
    return leftSupported || rightSupported;
  });
  const visibleRibIntervals = new Map([...visibleRibRanges].map(([ribIndex, range]) => [ribIndex, [range]]));
  const hangingClipIntervals = [];
  const redundantWallLegCutKeys = new Set(redundantWallLegCuts.map(({ ribIndex, side }) => `${ribIndex}:${side}`));
  // All automatic hanging cuts now follow the same orientation as wall-foot
  // cuts: remove the endpoint-to-junction interval and retain the inward span.
  // Never reconstruct the outer pieces or delete the middle of a rib.
  if (walls.karbandi.autoClip) automaticCuts.forEach((cut, key) => {
    if (redundantWallLegCutKeys.has(key)) return;
    const [ribIndexText, side] = key.split(':');
    const ribIndex = Number(ribIndexText);
    hangingClipIntervals.push({
      ribIndex,
      side,
      supportRibIndex: cut.otherIndex,
      clippedToWallSupportedRib: cut.clippedToWallSupportedRib === true,
      connectedThroughSameWallSupportedRib: cut.connectedThroughSameWallSupportedRib === true,
      outerOriginalIndex: cut.outerOriginalIndex ?? cut.originalIndex,
      cutBoundary: cut.cutBoundary || 'support-rib-centerline',
      start: side === 'left' ? 0 : cut.originalIndex,
      end: side === 'left' ? cut.originalIndex : inner.length - 1,
    });
  });
  group.userData.karbandiAutomaticHangingClipCount = hangingClipIntervals.length;
  group.userData.karbandiAutomaticHangingClipIntervals = hangingClipIntervals;
  group.userData.karbandiRedundantWallLegCutRibIndexes = [...redundantWallCutRibIndexes];
  const connectedToWall = wallConnectedRibIndexes(attachedRibs, supportedRibs);
  const detachedRibIndexes = visibleRibIndexes.filter((ribIndex) => (
    !connectedToWall.has(ribIndex)
  ));
  detachedRibIndexes.forEach((ribIndex) => visibleRibIntervals.delete(ribIndex));
  const northDetachedFragmentsRemoved = [];
  connectedToWall.forEach((ribIndex) => {
    const range = visibleRibRanges.get(ribIndex);
    if (!range) return;
    const northClippedIntervals = roomMode
      ? [range]
      : sampledCurveIntervalsAtOrAbove(
        inner.map((point) => transformRibPoint(point, ribAngles[ribIndex]).z),
        range.start,
        range.end,
        northZ,
      );
    if (!northClippedIntervals.length) {
      northDetachedFragmentsRemoved.push({
        ribIndex,
        start: range.start,
        end: range.end,
        reason: 'outside-north-interior',
      });
    }
    const retainedIntervals = northClippedIntervals.filter((interval) => {
      const hasBearingBase = (
        interval.start <= 0.001 && wallSupportedLegKeys.has(`${ribIndex}:left`)
      ) || (
        interval.end >= inner.length - 1 - 0.001 && wallSupportedLegKeys.has(`${ribIndex}:right`)
      );
      const hasRibJunction = (visibleJunctions.get(ribIndex) || []).some(({ originalIndex }) => (
        originalIndex >= interval.start - 0.001 && originalIndex <= interval.end + 0.001
      ));
      if (hasBearingBase || hasRibJunction) return true;
      northDetachedFragmentsRemoved.push({
        ribIndex,
        start: interval.start,
        end: interval.end,
        reason: 'no-wall-base-or-rib-junction',
      });
      return false;
    });
    if (retainedIntervals.length) visibleRibIntervals.set(ribIndex, retainedIntervals);
    else visibleRibIntervals.delete(ribIndex);
  });
  group.userData.karbandiDetachedRibCount = detachedRibIndexes.length;
  group.userData.karbandiDetachedRibsRemoved = detachedRibIndexes;
  group.userData.karbandiNorthDetachedFragmentCount = northDetachedFragmentsRemoved.length;
  group.userData.karbandiNorthDetachedFragmentsRemoved = northDetachedFragmentsRemoved;
  group.userData.karbandiNetworkRootRibIndexes = [...supportedRibs].sort((a, b) => a - b);
  group.userData.karbandiConnectedRibIndexes = [...connectedToWall].sort((a, b) => a - b);

  const visibleCurveForRib = (curve, range, ribIndex) => {
    const points = sliceCurveAtIndices(curve, range.start, range.end);
    const leftButt = baseButtCuts.get(`${ribIndex}:left`);
    const rightButt = baseButtCuts.get(`${ribIndex}:right`);
    // A butt joint moves the leg's plan endpoint to the supporting rib edge.
    // Keep that new endpoint on the springing plane; slicing the arch alone
    // would incorrectly lift the visible rib base above the wall.
    if (leftButt && Math.abs(range.start - leftButt.originalIndex) < 0.000001) {
      points[0] = points[0].clone().setY(springY);
    }
    if (rightButt && Math.abs(range.end - rightButt.originalIndex) < 0.000001) {
      points[points.length - 1] = points[points.length - 1].clone().setY(springY);
    }
    return points;
  };
  const makeRibShape = (range, ribIndex) => {
    if (!range) return null;
    const innerSlice = visibleCurveForRib(inner, range, ribIndex);
    const outerSlice = visibleCurveForRib(outer, {
      start: range.outerStart ?? range.start,
      end: range.outerEnd ?? range.end,
    }, ribIndex);
    const ribShape = new THREE.Shape();
    ribShape.moveTo(outerSlice[0].x, outerSlice[0].y);
    outerSlice.slice(1).forEach((point) => ribShape.lineTo(point.x, point.y));
    [...innerSlice].reverse().forEach((point) => ribShape.lineTo(point.x, point.y));
    ribShape.closePath();
    return ribShape;
  };
  const makeRibGeometry = (range, ribIndex, angle) => {
    const shape = makeRibShape(range, ribIndex);
    if (!shape) return null;
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: ribDepth,
      steps: 1,
      bevelEnabled: false,
      curveSegments: 48,
    });
    geometry.translate(0, 0, -ribDepth / 2);
    if (Math.abs(halfFold) > 0.000001) {
      const positions = geometry.getAttribute('position');
      for (let vertexIndex = 0; vertexIndex < positions.count; vertexIndex += 1) {
        const x = positions.getX(vertexIndex);
        if (Math.abs(x) < 0.000001) continue;
        const z = positions.getZ(vertexIndex);
        const side = Math.sign(x);
        positions.setX(vertexIndex, foldCosine * x - side * foldSine * z);
        positions.setZ(vertexIndex, side * foldSine * x + foldCosine * z);
      }
      positions.needsUpdate = true;
    }
    geometry.translate(referenceX, 0, referenceZ);
    geometry.rotateY(angle);
    geometry.translate(centerX, 0, centerZ);
    geometry.applyMatrix4(groupTransform);
    geometry.computeVertexNormals();
    return geometry;
  };
  const portalIntervalsForRib = (ribIndex) => clipPlanes.reduce((intervals, plane) => {
    const values = inner.map((point) => plane.distanceToPoint(transformRibPoint(
      point,
      ribAngles[ribIndex],
    )));
    return intervals.flatMap((range) => sampledCurveIntervalsAtOrAbove(
      values,
      range.start,
      range.end,
      0,
    ));
  }, [{ start: 0, end: inner.length - 1 }]);
  const renderedIntervalsForRib = (ribIndex) => {
    const portalIntervals = portalIntervalsForRib(ribIndex);
    return (visibleRibIntervals.get(ribIndex) || []).flatMap((visible) => (
      portalIntervals.map((portal) => ({
        start: Math.max(visible.start, portal.start),
        end: Math.min(visible.end, portal.end),
      })).filter((range) => range.end - range.start > 0.001)
    ));
  };
  if (!roomMode && walls.karbandi.archIntersectionGuideVisible) {
    const northContactGuide = new THREE.Group();
    northContactGuide.name = 'Karbandi rib arch intersection guide';
    northContactGuide.userData.isKarbandiVisualGuide = true;
    northContactGuide.userData.isKarbandiArchIntersectionGuide = true;
    northContactGuide.userData.karbandiGuideRole = 'rib-arch-intersection-guide';
    northContactGuide.userData.karbandiNorthWallSurface = 'south-facing-interior-surface';
    northContactGuide.userData.karbandiNorthWallPlaneZ = northZ;
    const surfaceGuideZ = northZ + Math.max(0.003, Math.min(0.012, ribDepth * groupScale * 0.08));
    const visibleWallLeft = Number.isFinite(northWallLeft)
      ? northWallLeft
      : westX - wallThickness - (Number(walls.northWall?.outwardWidth) || 0);
    const visibleWallRight = Number.isFinite(northWallRight)
      ? northWallRight
      : eastX + wallThickness + (Number(walls.northWall?.outwardWidth) || 0);
    const visibleWallTop = Number.isFinite(northWallHeight)
      ? northWallHeight
      : Math.max(
        Number(wallHeights?.north) || sideTop,
        ...(northArchPoints?.length ? northArchPoints.map((point) => point.y) : [sideTop]),
      );
    const archOpeningLeft = northArchPoints?.length
      ? Math.min(northArchPoints[0].x, northArchPoints.at(-1).x)
      : northOpeningLeft;
    const archOpeningRight = northArchPoints?.length
      ? Math.max(northArchPoints[0].x, northArchPoints.at(-1).x)
      : northOpeningRight;
    const northOpeningHeightAtX = (x) => {
      if (!northArchPoints?.length) return Infinity;
      for (let index = 0; index < northArchPoints.length - 1; index += 1) {
        const start = northArchPoints[index];
        const end = northArchPoints[index + 1];
        if (x < Math.min(start.x, end.x) - 0.000001 || x > Math.max(start.x, end.x) + 0.000001) continue;
        const progress = Math.abs(end.x - start.x) < 0.000001
          ? 0
          : THREE.MathUtils.clamp((x - start.x) / (end.x - start.x), 0, 1);
        return THREE.MathUtils.lerp(start.y, end.y, progress);
      }
      return Infinity;
    };
    const pointIsWithinNorthWallSurface = (point) => {
      if (walls.openSides?.includes('north')) return false;
      if (point.x < visibleWallLeft - 0.000001 || point.x > visibleWallRight + 0.000001) return false;
      if (point.y < -0.000001 || point.y > visibleWallTop + 0.000001) return false;
      return true;
    };
    const pointIsOnVisibleNorthWall = (point) => {
      if (!pointIsWithinNorthWallSurface(point)) return false;
      if (point.x < archOpeningLeft - 0.000001 || point.x > archOpeningRight + 0.000001) return true;
      if (!northArchPoints?.length) return false;
      return point.y >= northOpeningHeightAtX(point.x) - 0.000001;
    };
    const clipSegmentsByNorthWallRegion = (segments, regionPredicate) => segments.flatMap(([start, end]) => {
      const length = start.distanceTo(end);
      const subdivisionLength = Math.max(0.006, Math.min(0.025, ribWidth * groupScale * 0.2));
      const subdivisions = Math.max(1, Math.min(96, Math.ceil(length / subdivisionLength)));
      const retained = [];
      for (let index = 0; index < subdivisions; index += 1) {
        const intervalStart = start.clone().lerp(end, index / subdivisions);
        const intervalEnd = start.clone().lerp(end, (index + 1) / subdivisions);
        if (!regionPredicate(intervalStart.clone().lerp(intervalEnd, 0.5))) continue;
        retained.push([intervalStart, intervalEnd]);
      }
      return retained;
    });
    const clipSegmentsToVisibleNorthWall = (segments) => clipSegmentsByNorthWallRegion(
      segments,
      pointIsOnVisibleNorthWall,
    );
    const clipSegmentsToOpenNorthWallSurface = (segments) => clipSegmentsByNorthWallRegion(
      segments,
      (point) => pointIsWithinNorthWallSurface(point) && !pointIsOnVisibleNorthWall(point),
    );
    const sectionSegmentsAtZ = (geometry, sectionZ) => {
      const positions = geometry.getAttribute('position');
      const indices = geometry.getIndex();
      const triangleCount = indices ? indices.count / 3 : positions.count / 3;
      const tolerance = 0.0000001;
      const rawSegments = [];
      const pointAt = (index) => new THREE.Vector3(
        positions.getX(index),
        positions.getY(index),
        positions.getZ(index),
      );
      const intersectionOnEdge = (start, end) => {
        const startDistance = start.z - sectionZ;
        const endDistance = end.z - sectionZ;
        if (Math.abs(startDistance) <= tolerance) return start.clone();
        if (Math.abs(endDistance) <= tolerance) return end.clone();
        if (startDistance * endDistance > 0) return null;
        return start.clone().lerp(end, startDistance / (startDistance - endDistance));
      };
      for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex += 1) {
        const vertexIndexes = [0, 1, 2].map((offsetIndex) => (
          indices ? indices.getX(triangleIndex * 3 + offsetIndex) : triangleIndex * 3 + offsetIndex
        ));
        const vertices = vertexIndexes.map(pointAt);
        const intersections = [
          intersectionOnEdge(vertices[0], vertices[1]),
          intersectionOnEdge(vertices[1], vertices[2]),
          intersectionOnEdge(vertices[2], vertices[0]),
        ].filter(Boolean).filter((point, pointIndex, points) => (
          points.findIndex((candidate) => candidate.distanceToSquared(point) < 1e-14) === pointIndex
        ));
        if (intersections.length === 2 && intersections[0].distanceToSquared(intersections[1]) > 1e-14) {
          rawSegments.push([intersections[0], intersections[1]]);
        } else if (intersections.length === 3) {
          rawSegments.push(
            [intersections[0], intersections[1]],
            [intersections[1], intersections[2]],
            [intersections[2], intersections[0]],
          );
        }
      }
      // Plane slicing triangulated geometry produces duplicate internal seams.
      // Cancel even duplicates so the guide shows only the physical rib profile.
      const segmentCounts = new Map();
      const pointKey = (point) => `${Math.round(point.x * 1e5)}:${Math.round(point.y * 1e5)}`;
      rawSegments.forEach(([start, end]) => {
        const startKey = pointKey(start);
        const endKey = pointKey(end);
        const key = startKey < endKey ? `${startKey}|${endKey}` : `${endKey}|${startKey}`;
        const entry = segmentCounts.get(key) || { count: 0, segment: [start, end] };
        entry.count += 1;
        segmentCounts.set(key, entry);
      });
      return [...segmentCounts.values()]
        .filter(({ count }) => count % 2 === 1)
        .map(({ segment }) => segment);
    };
    const localTransverseSectionSegments = (segments) => {
      const pointKey = (point) => `${Math.round(point.x * 1e5)}:${Math.round(point.y * 1e5)}`;
      const segmentKeys = segments.map(([start, end]) => [pointKey(start), pointKey(end)]);
      const indexesByPoint = new Map();
      segmentKeys.forEach((keys, segmentIndex) => keys.forEach((key) => {
        if (!indexesByPoint.has(key)) indexesByPoint.set(key, []);
        indexesByPoint.get(key).push(segmentIndex);
      }));
      const visited = new Set();
      const components = [];
      segments.forEach((segment, initialIndex) => {
        if (visited.has(initialIndex)) return;
        const pending = [initialIndex];
        const component = [];
        visited.add(initialIndex);
        while (pending.length) {
          const segmentIndex = pending.pop();
          component.push(segments[segmentIndex]);
          segmentKeys[segmentIndex].forEach((key) => (indexesByPoint.get(key) || []).forEach((neighborIndex) => {
            if (visited.has(neighborIndex)) return;
            visited.add(neighborIndex);
            pending.push(neighborIndex);
          }));
        }
        components.push(component);
      });
      const maximumLocalExtent = Math.max(0.08, Math.max(ribWidth, ribDepth) * groupScale * 4);
      return components.filter((component) => {
        const points = component.flat();
        const minimumX = Math.min(...points.map((point) => point.x));
        const maximumX = Math.max(...points.map((point) => point.x));
        const minimumY = Math.min(...points.map((point) => point.y));
        const maximumY = Math.max(...points.map((point) => point.y));
        return Math.max(maximumX - minimumX, maximumY - minimumY) <= maximumLocalExtent;
      }).flat();
    };
    const hatchSegmentsInsideSection = (boundarySegments) => {
      if (!boundarySegments.length) return [];
      const inverseSqrtTwo = Math.SQRT1_2;
      const toHatchSpace = (point) => ({
        u: (point.x + point.y) * inverseSqrtTwo,
        v: (-point.x + point.y) * inverseSqrtTwo,
      });
      const fromHatchSpace = (u, v) => new THREE.Vector3(
        (u - v) * inverseSqrtTwo,
        (u + v) * inverseSqrtTwo,
        northZ,
      );
      const hatchEdges = boundarySegments.map(([start, end]) => [toHatchSpace(start), toHatchSpace(end)]);
      const allV = hatchEdges.flatMap(([start, end]) => [start.v, end.v]);
      const minimumV = Math.min(...allV);
      const maximumV = Math.max(...allV);
      const spacing = Math.max(
        0.001,
        Math.min(0.01, Math.min(ribWidth, ribDepth) * groupScale * 0.08),
      );
      const firstV = Math.ceil((minimumV + 0.000001) / spacing) * spacing;
      const hatches = [];
      for (let v = firstV; v < maximumV - 0.000001; v += spacing) {
        const intersections = [];
        hatchEdges.forEach(([start, end]) => {
          const deltaV = end.v - start.v;
          if (Math.abs(deltaV) < 0.0000001) return;
          const minimumEdgeV = Math.min(start.v, end.v);
          const maximumEdgeV = Math.max(start.v, end.v);
          // Half-open edge inclusion prevents double hits at polygon vertices.
          if (v < minimumEdgeV || v >= maximumEdgeV) return;
          const progress = (v - start.v) / deltaV;
          intersections.push(THREE.MathUtils.lerp(start.u, end.u, progress));
        });
        intersections.sort((left, right) => left - right);
        for (let index = 0; index + 1 < intersections.length; index += 2) {
          if (intersections[index + 1] - intersections[index] <= 0.000001) continue;
          hatches.push([
            fromHatchSpace(intersections[index], v),
            fromHatchSpace(intersections[index + 1], v),
          ]);
        }
      }
      return hatches;
    };
    const projectedEndpointSections = (ribIndex, angle, ranges) => ranges.flatMap((range) => (
      [range.start, range.end].map((curveIndex) => {
        const innerPoint = pointAtCurveIndex(inner, curveIndex);
        const outerPoint = pointAtCurveIndex(outer, curveIndex);
        const corners = [
          transformRibPoint(innerPoint, angle, -ribDepth / 2),
          transformRibPoint(outerPoint, angle, -ribDepth / 2),
          transformRibPoint(outerPoint, angle, ribDepth / 2),
          transformRibPoint(innerPoint, angle, ribDepth / 2),
        ];
        const center = corners.reduce((sum, point) => sum.add(point), new THREE.Vector3()).multiplyScalar(0.25);
        const minimumZ = Math.min(...corners.map((point) => point.z));
        const maximumZ = Math.max(...corners.map((point) => point.z));
        const surfaceGap = minimumZ > northZ
          ? minimumZ - northZ
          : maximumZ < northZ
            ? northZ - maximumZ
            : 0;
        const rawSegments = corners.map((point, index) => [point, corners[(index + 1) % corners.length]]);
        return {
          curveIndex,
          sourceZ: center.z,
          surfaceGap,
          rawSegments,
          segments: clipSegmentsToVisibleNorthWall(rawSegments),
        };
      })
    )).filter(({ segments }) => segments.length)
      .sort((first, second) => first.surfaceGap - second.surfaceGap);
    let touchingCount = 0;
    let separatedCount = 0;
    const addNorthWallProfile = ({
      ribIndex,
      segments,
      hatchSegments = [],
      colorRole,
      sourceZ = northZ,
      surfaceGap = 0,
      physicalContactTolerance,
      method,
    }) => {
      if (!segments.length) return;
      const linePositions = [];
      segments.forEach(([start, end]) => {
        linePositions.push(start.x, start.y, surfaceGuideZ, end.x, end.y, surfaceGuideZ);
      });
      hatchSegments.forEach(([start, end]) => {
        linePositions.push(start.x, start.y, surfaceGuideZ, end.x, end.y, surfaceGuideZ);
      });
      const lineGeometry = new THREE.BufferGeometry();
      lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
      const line = new THREE.LineSegments(
        lineGeometry,
        new THREE.LineBasicMaterial({
          color: colorRole === 'white' ? '#ffffff' : '#ff2d2d',
          transparent: true,
          opacity: 1,
          depthTest: false,
          depthWrite: false,
        }),
      );
      line.name = `Karbandi north wall rib profile ${ribIndex + 1} ${colorRole}`;
      line.renderOrder = 34;
      line.userData.isKarbandiVisualGuide = true;
      line.userData.isKarbandiArchIntersectionGuide = true;
      line.userData.karbandiGuideRole = 'north-wall-rib-profile';
      line.userData.karbandiRibIndex = ribIndex;
      line.userData.karbandiNorthWallContact = colorRole === 'white';
      line.userData.karbandiNorthWallProfileColor = colorRole;
      line.userData.karbandiNorthWallPlaneZ = northZ;
      line.userData.karbandiNorthWallProfileDisplayZ = surfaceGuideZ;
      line.userData.karbandiNorthWallProfileSourceZ = sourceZ;
      line.userData.karbandiNorthWallSurfaceGap = surfaceGap;
      line.userData.karbandiNorthWallPhysicalContactTolerance = physicalContactTolerance;
      line.userData.karbandiNorthWallProfileMethod = method;
      line.userData.karbandiNorthWallSurfaceIntersection = true;
      line.userData.karbandiNorthWallHatched = hatchSegments.length > 0;
      line.userData.karbandiNorthWallOutlineSegmentCount = segments.length;
      line.userData.karbandiNorthWallHatchSegmentCount = hatchSegments.length;
      line.userData.karbandiNorthWallHatchStyle = '45-degree-even-odd-section-fill';
      line.userData.karbandiNorthWallHatchColor = colorRole;
      line.userData.karbandiNorthWallMasonryMask = northArchPoints?.length
        ? 'white-on-masonry-red-on-open-arch-surface'
        : 'white-on-masonry-red-on-open-rectangular-surface';
      line.raycast = () => {};
      northContactGuide.add(line);
      if (colorRole === 'white') touchingCount += 1;
      else separatedCount += 1;
    };
    for (let ribIndex = 0; ribIndex < ribCount; ribIndex += 1) {
      const angle = ribAngles[ribIndex];
      const retainedRanges = renderedIntervalsForRib(ribIndex);
      const retainedGeometries = retainedRanges
        .map((range) => makeRibGeometry(range, ribIndex, angle))
        .filter(Boolean);
      // The wall diagnostic follows the final clipped network. A rib with no
      // retained component must not leave a profile from its original design.
      if (!retainedGeometries.length) continue;
      const touchingGeometries = retainedGeometries.filter((geometry) => {
        geometry.computeBoundingBox();
        return geometry.boundingBox.min.z <= northZ + 0.000001
          && geometry.boundingBox.max.z >= northZ - 0.000001;
      });
      const physicalContactTolerance = Math.max(
        0.004,
        Math.max(ribWidth, ribDepth) * groupScale * 0.08,
      );
      const exactSectionSegments = localTransverseSectionSegments(
        touchingGeometries.flatMap((geometry) => sectionSegmentsAtZ(geometry, northZ)),
      );
      const exactHatchSegments = hatchSegmentsInsideSection(exactSectionSegments);
      const whiteSegments = clipSegmentsToVisibleNorthWall(exactSectionSegments);
      const redSegments = clipSegmentsToOpenNorthWallSurface(exactSectionSegments);
      const whiteHatchSegments = clipSegmentsToVisibleNorthWall(exactHatchSegments);
      const redHatchSegments = clipSegmentsToOpenNorthWallSurface(exactHatchSegments);
      addNorthWallProfile({
        ribIndex,
        segments: whiteSegments,
        hatchSegments: whiteHatchSegments,
        colorRole: 'white',
        physicalContactTolerance,
        method: 'exact-visible-rib-transverse-section-on-visible-north-wall-masonry',
      });
      addNorthWallProfile({
        ribIndex,
        segments: redSegments,
        hatchSegments: redHatchSegments,
        colorRole: 'red',
        physicalContactTolerance,
        method: 'exact-visible-rib-transverse-section-on-open-north-wall-surface',
      });
      if (!whiteSegments.length && !redSegments.length) {
        // A tangential contact may not create a triangle/plane section. Recover
        // only a near-zero-gap retained endpoint on masonry. Do not project red
        // gaps: red now means an exact visible-rib intersection with open wall
        // surface, as distinct from physical masonry.
        const endpointSection = projectedEndpointSections(ribIndex, angle, retainedRanges)
          .find((candidate) => candidate.surfaceGap <= physicalContactTolerance);
        if (endpointSection) addNorthWallProfile({
          ribIndex,
          segments: endpointSection.segments,
          hatchSegments: clipSegmentsToVisibleNorthWall(
            hatchSegmentsInsideSection(endpointSection.rawSegments),
          ),
          colorRole: 'white',
          sourceZ: endpointSection.sourceZ,
          surfaceGap: endpointSection.surfaceGap,
          physicalContactTolerance,
          method: 'tangent-visible-clipped-rib-end-contact-on-visible-north-wall-masonry',
        });
      }
      retainedGeometries.forEach((geometry) => geometry.dispose());
    }
    northContactGuide.userData.karbandiNorthWallTouchingRibCount = touchingCount;
    northContactGuide.userData.karbandiNorthWallSeparatedRibCount = separatedCount;
    northContactGuide.userData.karbandiNorthWallColorRule = (
      'white-outline-and-hatch-where-visible-rib-section-overlaps-masonry-red-outline-and-hatch-where-it-crosses-open-wall-surface'
    );
    northContactGuide.userData.karbandiNorthWallProfileSource = 'visible-rib-transverse-intersections-with-north-wall-surface-after-all-clipping';
    northContactGuide.userData.karbandiNorthWallVisibleBounds = {
      left: visibleWallLeft,
      right: visibleWallRight,
      top: visibleWallTop,
    };
    northContactGuide.userData.karbandiNorthWallOpeningProfile = (northArchPoints || []).map((point) => [point.x, point.y]);
    northContactGuide.userData.karbandiNorthWallVisibleRibProfileCount = northContactGuide.children.length;
    group.userData.karbandiNorthWallContactGuideVisible = true;
    group.userData.karbandiNorthWallTouchingRibCount = touchingCount;
    group.userData.karbandiNorthWallSeparatedRibCount = separatedCount;
    group.userData.karbandiNorthWallVisibleRibProfileCount = northContactGuide.children.length;
    group.add(northContactGuide);
  } else {
    group.userData.karbandiNorthWallContactGuideVisible = false;
    group.userData.karbandiNorthWallTouchingRibCount = 0;
    group.userData.karbandiNorthWallSeparatedRibCount = 0;
    group.userData.karbandiNorthWallVisibleRibProfileCount = 0;
  }
  for (let index = 0; index < ribCount; index += 1) {
    const angle = offset + referenceRotation + (Math.PI * 2 * index) / ribCount;
    const componentRanges = visibleRibIntervals.get(index) || [];
    componentRanges.forEach((componentRange, componentIndex) => {
    const geometry = makeRibGeometry(componentRange, index, angle);
    if (!geometry) return;
    const material = wallMaterial(walls, null);
    configureRoomOpeningRibClip(material);
    const referenceRibColor = walls.karbandi.referenceRibColor.toLowerCase() === walls.karbandi.ribColor.toLowerCase()
      ? (walls.karbandi.ribColor.toLowerCase() === '#ffd400' ? '#18c7d4' : '#ffd400')
      : walls.karbandi.referenceRibColor;
    // Reference highlighting is an editor interaction state applied by
    // MehrazScene, not a persistent construction material.
    material.color.set(walls.karbandi.ribColor);
    material.roughness = 0.82;
    // The rib crown is intentionally tangent to the roof underside. Bias the
    // rib toward the camera just enough to prevent the roof triangles from
    // producing a broken, wavy reveal along that shared boundary.
    material.polygonOffset = true;
    material.polygonOffsetFactor = -1;
    material.polygonOffsetUnits = -1;
    const isClosestWallSupport = wallSupportedFrameRibIndexes.has(index);
    const closestWallSupportLegs = closestWallLegsByRib.get(index) || [];
    if (clipPlanes) {
      // Every Room wall is structurally equivalent. A directly bearing rib
      // foot stays embedded in its supporting masonry on north, east, south,
      // and west alike; the wall itself conceals that embed. Non-bearing ribs
      // retain all perimeter clipping planes.
      const roomBearingWalls = new Set(roomMode
        ? ['left', 'right'].filter((side) => wallSupportedLegKeys.has(`${index}:${side}`))
          .flatMap((side) => verticalWallContactsForLeg(index, side).map(({ wall }) => wall))
        : []);
      material.clippingPlanes = roomBearingWalls.size
        ? clipPlanes.filter((plane) => ![...roomBearingWalls].some((wall) => (
          roomInteriorClipPlaneByWall.get(wall) === plane
        )))
        : clipPlanes;
      material.clipIntersection = false;
      material.clipShadows = true;
    }
    const rib = new THREE.Mesh(geometry, material);
    rib.renderOrder = 2;
    rib.castShadow = true;
    rib.receiveShadow = true;
    rib.userData.wallSide = 'arch';
    rib.userData.isKarbandi = true;
    rib.userData.isKarbandiReference = index === 0;
    rib.userData.karbandiDisplayColor = walls.karbandi.ribColor;
    rib.userData.karbandiReferenceHighlightColor = index === 0 ? referenceRibColor : null;
    rib.userData.karbandiRibIndex = index;
    rib.userData.karbandiBaseButtCuts = baseButtJoints
      .filter((joint) => {
        if (joint.trimmedRibIndex !== index) return false;
        return joint.trimmedSide === 'left'
          ? Math.abs(componentRange.start - joint.trimmedOriginalIndex) < 0.000001
          : Math.abs(componentRange.end - joint.trimmedOriginalIndex) < 0.000001;
      })
      .map((joint) => ({ ...joint }));
    rib.userData.karbandiUsesBaseButtJoint = rib.userData.karbandiBaseButtCuts.length > 0;
    rib.userData.isKarbandiClosestWallSupport = isClosestWallSupport;
    rib.userData.karbandiClosestWallSupportLegs = closestWallSupportLegs.map((leg) => ({ ...leg }));
    rib.userData.karbandiWallSupportedLegs = ['left', 'right'].filter((side) => (
      wallSupportedLegKeys.has(`${index}:${side}`)
    ));
    rib.userData.karbandiRoomBearingWallsUnclipped = roomMode
      ? [...new Set(['left', 'right']
        .filter((side) => wallSupportedLegKeys.has(`${index}:${side}`))
        .flatMap((side) => verticalWallContactsForLeg(index, side).map(({ wall }) => wall)))]
      : [];
    rib.userData.karbandiPortalCuts = ['left', 'right'].filter((side) => automaticCuts.has(`${index}:${side}`));
    rib.userData.karbandiManualCuts = Object.fromEntries(['left', 'right'].map((side) => [
      side,
      manualCutSteps.get(`${index}:${side}`) || 0,
    ]));
    rib.userData.karbandiVisibleRange = [componentRange.start, componentRange.end];
    rib.userData.karbandiOuterVisibleRange = [
      componentRange.outerStart ?? componentRange.start,
      componentRange.outerEnd ?? componentRange.end,
    ];
    rib.userData.karbandiAutomaticCutBoundary = walls.karbandi.autoClip
      ? 'support-rib-centerline-with-independent-inner-and-outer-edge-intersections'
      : null;
    rib.userData.karbandiRibComponentIndex = componentIndex;
    rib.userData.karbandiRibComponentCount = componentRanges.length;
    rib.userData.karbandiCenter = [centerX + (Number(walls.karbandi.groupX) || 0), centerZ + (Number(walls.karbandi.groupZ) || 0)];
    rib.userData.karbandiAngle = angle + groupRotationY;
    // THREE.RotationY maps local +X toward world -Z for a positive angle.
    // Store the transformed local axis so pointer-side detection stays correct
    // for every rib around the orbit.
    rib.userData.karbandiDirection = [
      Math.cos(angle + groupRotationY),
      -Math.sin(angle + groupRotationY),
    ];
    if (componentRange.start <= apexIndex + 0.001 && componentRange.end >= apexIndex - 0.001) {
      const crownCenterline = transformRibPoint(inner[apexIndex], angle);
      rib.userData.karbandiCrownCenterlinePoint = crownCenterline.toArray();
      rib.userData.karbandiCrownCenterlineRadius = Math.hypot(
        crownCenterline.x - centerX,
        crownCenterline.z - centerZ,
      );
    }
    group.add(rib);
    meshes.push(rib);
    });
  }
  if (walls.karbandi.guideVisible) {
    const clippedRangesForRib = (ribIndex) => {
      const retained = renderedIntervalsForRib(ribIndex)
        .sort((left, right) => left.start - right.start);
      const clipped = [];
      let cursor = 0;
      retained.forEach((range) => {
        if (range.start > cursor + 0.001) clipped.push({ start: cursor, end: range.start });
        cursor = Math.max(cursor, range.end);
      });
      if (cursor < inner.length - 1 - 0.001) clipped.push({ start: cursor, end: inner.length - 1 });
      return clipped.filter((range) => range.end - range.start > 0.001);
    };
    let ghostCount = 0;
    for (let ribIndex = 0; ribIndex < ribCount; ribIndex += 1) {
      const angle = ribAngles[ribIndex];
      clippedRangesForRib(ribIndex).forEach((range, componentIndex) => {
        const geometry = makeRibGeometry(range, ribIndex, angle);
        if (!geometry) return;
        const material = new THREE.MeshStandardMaterial({
          color: walls.karbandi.ribColor,
          roughness: 0.82,
          metalness: 0,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.3,
          depthTest: false,
          depthWrite: false,
        });
        const ghost = new THREE.Mesh(geometry, material);
        ghost.name = `Karbandi clipped rib guide ${ribIndex + 1}.${componentIndex + 1}`;
        ghost.renderOrder = 24;
        ghost.castShadow = false;
        ghost.receiveShadow = false;
        ghost.userData.wallSide = 'arch';
        ghost.userData.isKarbandi = true;
        ghost.userData.isKarbandiVisualGuide = true;
        ghost.userData.isKarbandiClippedRibGuide = true;
        ghost.userData.isKarbandiReference = ribIndex === 0;
        ghost.userData.isKarbandiClosestWallSupport = wallSupportedFrameRibIndexes.has(ribIndex);
        ghost.userData.karbandiRibIndex = ribIndex;
        ghost.userData.karbandiClippedRange = [range.start, range.end];
        ghost.userData.karbandiGuideOpacity = 0.3;
        ghost.userData.karbandiDisplayColor = walls.karbandi.ribColor;
        ghost.raycast = () => {};
        group.add(ghost);
        ghostCount += 1;
      });
    }
    group.userData.karbandiClippedRibGuideCount = ghostCount;
    group.userData.karbandiClippedRibGuideOpacity = 0.3;
    group.userData.karbandiClippedRibGuideIncludesPortalClips = true;
  } else {
    group.userData.karbandiClippedRibGuideCount = 0;
    group.userData.karbandiClippedRibGuideIncludesPortalClips = false;
  }
  if (walls.karbandi.coverEnabled) {
    const webOptions = normalizeKarbandiWebOptions(walls.karbandi.web);
    const roofWestX = westX;
    const roofEastX = eastX;
    const roofNorthZ = northZ;
    const roofSouthZ = southZ;
    const coverThickness = webOptions.roofThickness;
    const rawSegments = [];
    let ribFootSeatCount = 0;
    const northArchHeightAtX = (x) => {
      if (!northArchPoints?.length) return sideTop;
      const first = northArchPoints[0];
      const last = northArchPoints[northArchPoints.length - 1];
      if (x <= first.x || x >= last.x) return sideTop;
      for (let index = 0; index < northArchPoints.length - 1; index += 1) {
        const left = northArchPoints[index];
        const right = northArchPoints[index + 1];
        if (x < left.x || x > right.x) continue;
        const span = right.x - left.x;
        return Math.abs(span) < 0.000001
          ? Math.max(left.y, right.y)
          : THREE.MathUtils.lerp(left.y, right.y, (x - left.x) / span);
      }
      return sideTop;
    };
    const clipRoofSegment = (start, end) => {
      let minimum = 0;
      let maximum = 1;
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const dz = end.z - start.z;
      const constraints = [
        [start.x - roofWestX, dx],
        [roofEastX - start.x, -dx],
        [start.z - roofNorthZ, dz],
        [roofSouthZ - start.z, -dz],
        [start.y - (sideTop - 0.01), dy],
      ];
      for (const [distance, delta] of constraints) {
        if (Math.abs(delta) < 0.000001) {
          if (distance < 0) return null;
          continue;
        }
        const boundary = -distance / delta;
        if (delta > 0) minimum = Math.max(minimum, boundary);
        else maximum = Math.min(maximum, boundary);
        if (minimum > maximum) return null;
      }
      const clippedStart = start.clone().lerp(end, THREE.MathUtils.clamp(minimum, 0, 1));
      const clippedEnd = start.clone().lerp(end, THREE.MathUtils.clamp(maximum, 0, 1));
      const snapToWallTop = (point) => {
        const snapTolerance = Math.max(0.0025, ribDepth * groupScale * 0.12);
        if (Math.abs(point.z - roofNorthZ) <= snapTolerance) {
          point.z = roofNorthZ;
          point.y = northArchHeightAtX(point.x);
          return;
        }
        if (Math.abs(point.x - roofWestX) <= snapTolerance) {
          point.x = roofWestX;
          point.y = sideTop;
        } else if (Math.abs(point.x - roofEastX) <= snapTolerance) {
          point.x = roofEastX;
          point.y = sideTop;
        } else if (Math.abs(point.z - roofSouthZ) <= snapTolerance) {
          point.z = roofSouthZ;
          point.y = sideTop;
        }
      };
      // A rib clipped at the room perimeter must join the wall-top rib at the
      // wall elevation. Keeping its interpolated arch height here lifted the
      // perimeter and created the large open bays visible from outside.
      snapToWallTop(clippedStart);
      snapToWallTop(clippedEnd);
      return { start: clippedStart, end: clippedEnd };
    };
    const addRawSegment = (start, end, kind = 'rib-seat', sourceId = null, properties = {}) => {
      const clipped = kind === 'rib-seat' ? clipRoofSegment(start, end) : { start, end };
      if (!clipped || clipped.start.distanceToSquared(clipped.end) < 0.0000001) return;
      rawSegments.push({ a: clipped.start, b: clipped.end, kind, sourceId, ...properties, splits: [0, 1] });
    };
    const connectFootToWallRib = (foot, sourceId) => {
      const insideRoof = (
        foot.x >= roofWestX - 0.0001
        && foot.x <= roofEastX + 0.0001
        && foot.z >= roofNorthZ - 0.0001
        && foot.z <= roofSouthZ + 0.0001
      );
      if (!insideRoof) return;
      const vestibuleSupportVertices = vestibuleMode && roomTransitionWallFeet.length === 8
        ? roomTransitionWallFeet.map((entry) => entry.footPoint)
        : [];
      const nearestPointOnPlanEdge = (point, start, end) => {
        const dx = end.x - start.x;
        const dz = end.z - start.z;
        const denominator = dx * dx + dz * dz;
        const progress = denominator > 0.0000001
          ? THREE.MathUtils.clamp(((point.x - start.x) * dx + (point.z - start.z) * dz) / denominator, 0, 1)
          : 0;
        return new THREE.Vector3(start.x + dx * progress, sideTop, start.z + dz * progress);
      };
      const wallCandidates = vestibuleSupportVertices.length === 8
        ? vestibuleSupportVertices.map((start, index) => nearestPointOnPlanEdge(
          foot,
          start,
          vestibuleSupportVertices[(index + 1) % vestibuleSupportVertices.length],
        ))
        : [
        new THREE.Vector3(roofWestX, sideTop, THREE.MathUtils.clamp(foot.z, roofNorthZ, roofSouthZ)),
        new THREE.Vector3(roofEastX, sideTop, THREE.MathUtils.clamp(foot.z, roofNorthZ, roofSouthZ)),
        new THREE.Vector3(
          THREE.MathUtils.clamp(foot.x, roofWestX, roofEastX),
          northArchHeightAtX(THREE.MathUtils.clamp(foot.x, roofWestX, roofEastX)),
          roofNorthZ,
        ),
        new THREE.Vector3(THREE.MathUtils.clamp(foot.x, roofWestX, roofEastX), sideTop, roofSouthZ),
      ];
      const wallPoint = wallCandidates.reduce((nearest, candidate) => {
        const nearestDistance = (nearest.x - foot.x) ** 2 + (nearest.z - foot.z) ** 2;
        const candidateDistance = (candidate.x - foot.x) ** 2 + (candidate.z - foot.z) ** 2;
        return candidateDistance < nearestDistance ? candidate : nearest;
      });
      ribFootSeatCount += 1;
      if (wallPoint.distanceToSquared(foot) < 0.0000001) return;
      // This is a roof-topology edge, not a rendered rib. It closes the small
      // bay between a supported rib foot and the wall-top rib.
      addRawSegment(wallPoint, foot, 'rib-seat', sourceId);
    };

    ribAngles.forEach((angle, ribIndex) => {
      const visibleComponents = visibleRibIntervals.get(ribIndex) || [];
      visibleComponents.forEach((visibleRange, componentIndex) => {
      const visibleOuter = visibleCurveForRib(outer, visibleRange, ribIndex);
      const seatingOffsets = [
        -ribDepth / 2 - webOptions.seatingOffset,
        ribDepth / 2 + webOptions.seatingOffset,
      ];
      if (visibleRange.start <= 0.0001) {
        seatingOffsets.forEach((seatOffset, seatIndex) => connectFootToWallRib(
          transformRibPoint(visibleOuter[0], angle, seatOffset),
          `${ribIndex}:left:${seatIndex}`,
        ));
      }
      if (visibleRange.end >= outer.length - 1 - 0.0001) {
        seatingOffsets.forEach((seatOffset, seatIndex) => connectFootToWallRib(
          transformRibPoint(visibleOuter[visibleOuter.length - 1], angle, seatOffset),
          `${ribIndex}:right:${seatIndex}`,
        ));
      }
      seatingOffsets.forEach((seatOffset, seatIndex) => {
        for (let index = 0; index < visibleOuter.length - 1; index += 1) {
          addRawSegment(
            transformRibPoint(visibleOuter[index], angle, seatOffset),
            transformRibPoint(visibleOuter[index + 1], angle, seatOffset),
            'rib-seat',
            `${ribIndex}:${seatIndex}`,
            {
              ribSegmentIndex: componentIndex * outer.length + index,
              seatingSide: seatIndex,
              visibleRangeStart: visibleRange.start,
              visibleRangeEnd: visibleRange.end,
            },
          );
        }
      });
      });
    });
    group.userData.karbandiRoofTopologyRibIndexes = [...new Set(rawSegments
      .filter((segment) => segment.kind === 'rib-seat')
      .map((segment) => String(segment.sourceId ?? '').match(/^(\d+):[01]$/)?.[1])
      .filter(Boolean)
      .map(Number))].sort((left, right) => left - right);
    const roofTopologyRibIndexSet = new Set(group.userData.karbandiRoofTopologyRibIndexes);
    group.userData.karbandiRoofTopologyRibRanges = [...visibleRibIntervals].flatMap(([ribIndex, ranges]) => (
      roofTopologyRibIndexSet.has(ribIndex)
        ? ranges.map((range) => ({ ribIndex, start: range.start, end: range.end }))
        : []
    ));
    group.userData.karbandiRoofTopologyUsesVisibleRibsOnly = true;
    group.userData.karbandiRibFootClosureCount = rawSegments.filter((segment) => (
      segment.kind === 'rib-seat' && /^\d+:(left|right):[01]$/.test(String(segment.sourceId))
    )).length;
    group.userData.karbandiRibFootSeatCount = ribFootSeatCount;

    const vestibuleSpringingVertices = vestibuleMode && roomTransitionWallFeet.length === 8
      ? roomTransitionWallFeet.map((entry) => entry.footPoint)
      : [];
    const springing = vestibuleSpringingVertices.length === 8
      ? {
        segments: vestibuleSpringingVertices.map((start, index) => {
          const end = vestibuleSpringingVertices[(index + 1) % vestibuleSpringingVertices.length];
          return {
            a: { x: start.x, y: sideTop, z: start.z },
            b: { x: end.x, y: sideTop, z: end.z },
            kind: 'support',
            source: 'vestibule-octagonal-wall-topology',
            supportSide: `vestibule-edge-${index}`,
            supportSides: [`vestibule-edge-${index}`],
          };
        }),
        missingSides: [],
        continuous: true,
      }
      : extractSpringingBoundary({
        westX: roofWestX,
        eastX: roofEastX,
        northZ: roofNorthZ,
        southZ: roofSouthZ,
        sideTop,
        wallThickness,
        wallHeights,
      }, webOptions, walls.openSides);
    let springingSegments = springing.segments;
    const northSupport = springingSegments.find((segment) => segment.supportSide === 'north');
    if (northSupport && northArchPoints?.length && ['automatic-walls', 'selected-walls'].includes(webOptions.supportBoundaryMode)) {
      const sampledNorth = [];
      const steps = 24;
      for (let index = 0; index < steps; index += 1) {
        const x1 = THREE.MathUtils.lerp(northSupport.a.x, northSupport.b.x, index / steps);
        const x2 = THREE.MathUtils.lerp(northSupport.a.x, northSupport.b.x, (index + 1) / steps);
        sampledNorth.push({
          a: { x: x1, y: northArchHeightAtX(x1), z: northSupport.a.z },
          b: { x: x2, y: northArchHeightAtX(x2), z: northSupport.a.z },
          kind: 'support',
          source: 'wall-topology',
          supportSide: 'north',
        });
      }
      springingSegments = [...springingSegments.filter((segment) => segment !== northSupport), ...sampledNorth];
    }
    springingSegments.forEach((segment) => addRawSegment(
      new THREE.Vector3(segment.a.x, segment.a.y, segment.a.z),
      new THREE.Vector3(segment.b.x, segment.b.y, segment.b.z),
      'support',
      null,
      { supportSide: segment.supportSide, supportSides: segment.supportSides, source: segment.source },
    ));
    if (webOptions.allowUnsupportedFreeEdge && springing.missingSides.length) {
      const conceptual = extractSpringingBoundary({
        westX: roofWestX,
        eastX: roofEastX,
        northZ: roofNorthZ,
        southZ: roofSouthZ,
        sideTop,
        wallThickness,
        wallHeights,
      }, { ...webOptions, supportBoundaryMode: 'automatic-walls' }, []);
      conceptual.segments
        .filter((segment) => springing.missingSides.includes(segment.supportSide))
        .forEach((segment) => addRawSegment(
          new THREE.Vector3(segment.a.x, segment.a.y, segment.a.z),
          new THREE.Vector3(segment.b.x, segment.b.y, segment.b.z),
          'unsupported',
          null,
          { supportSide: segment.supportSide },
        ));
    }
    group.userData.karbandiSpringingBoundary = springingSegments.map((segment) => ({
      a: [segment.a.x, segment.a.y, segment.a.z],
      b: [segment.b.x, segment.b.y, segment.b.z],
      side: segment.supportSide || null,
    }));
    group.userData.karbandiSpringingContinuous = springing.continuous;

    const visibleRibSegments = rawSegments.filter((segment) => segment.kind === 'rib-seat');
    const curvedRibSegments = visibleRibSegments.filter((segment) => /^\d+:[01]$/.test(String(segment.sourceId)));
    const wallContactTolerance = Math.max(0.0025, ribDepth * groupScale * 0.12);
    const pointTouchesWall = (point) => (
      Math.abs(point.x - roofWestX) <= wallContactTolerance
      || Math.abs(point.x - roofEastX) <= wallContactTolerance
      || Math.abs(point.z - roofNorthZ) <= wallContactTolerance
      || Math.abs(point.z - roofSouthZ) <= wallContactTolerance
    );
    const wallConnectedComponentsBySource = new Map();
    const segmentsBySource = new Map();
    curvedRibSegments.forEach((segment) => {
      const sourceId = String(segment.sourceId);
      if (!segmentsBySource.has(sourceId)) segmentsBySource.set(sourceId, []);
      segmentsBySource.get(sourceId).push(segment);
    });
    segmentsBySource.forEach((segments, sourceId) => {
      const ordered = [...segments].sort((left, right) => (
        (Number(left.ribSegmentIndex) || 0) - (Number(right.ribSegmentIndex) || 0)
      ));
      const components = [];
      ordered.forEach((segment) => {
        const current = components[components.length - 1];
        if (!current || current[current.length - 1].b.distanceToSquared(segment.a) > wallContactTolerance ** 2) {
          components.push([segment]);
        } else current.push(segment);
      });
      const wallConnected = components.filter((component) => (
        pointTouchesWall(component[0].a) || pointTouchesWall(component[component.length - 1].b)
      ));
      const ribIndex = Number(sourceId.split(':')[0]);
      const supportedComponents = wallConnected.length
        ? wallConnected
        : connectedToWall.has(ribIndex)
          ? components
          : [];
      if (supportedComponents.length) wallConnectedComponentsBySource.set(sourceId, supportedComponents);
    });
    const wallConnectedCurvedRibSegments = [...wallConnectedComponentsBySource.values()].flat(2);
    const cornerGuideDiagnostics = [];
    const boundingRibsForGuide = (foot, target) => {
      const direction = target.clone().sub(foot);
      direction.y = 0;
      if (direction.lengthSq() < 0.0000001) direction.set(0, 0, 1);
      direction.normalize();
      const probe = foot.clone().lerp(target, 0.42);
      const nearestByRib = new Map();
      wallConnectedCurvedRibSegments.forEach((segment) => {
        const dx = segment.b.x - segment.a.x;
        const dz = segment.b.z - segment.a.z;
        const denominator = dx * dx + dz * dz;
        if (denominator < 0.0000001) return;
        const progress = THREE.MathUtils.clamp(
          ((probe.x - segment.a.x) * dx + (probe.z - segment.a.z) * dz) / denominator,
          0,
          1,
        );
        const projected = segment.a.clone().lerp(segment.b, progress);
        const distance = Math.hypot(projected.x - probe.x, projected.z - probe.z);
        const ribId = String(segment.sourceId).split(':')[0];
        const lateral = direction.x * (projected.z - probe.z) - direction.z * (projected.x - probe.x);
        if (!nearestByRib.has(ribId) || distance < nearestByRib.get(ribId).distance) {
          nearestByRib.set(ribId, { ribId, segment, distance, lateral });
        }
      });
      const candidates = [...nearestByRib.values()].sort((left, right) => left.distance - right.distance);
      const left = candidates.filter((candidate) => candidate.lateral > 0.00001)[0];
      let right = candidates.filter((candidate) => candidate.lateral < -0.00001 && candidate.ribId !== left?.ribId)[0];
      let selectedLeft = left;
      if (!selectedLeft) selectedLeft = candidates[0];
      if (!right || right.ribId === selectedLeft?.ribId) right = candidates.find((candidate) => candidate.ribId !== selectedLeft?.ribId);
      return [selectedLeft, right].filter(Boolean);
    };
    const ribProfileForGuide = (sourceId, foot, guideLength, count) => {
      const components = wallConnectedComponentsBySource.get(String(sourceId)) || [];
      const component = components.reduce((nearest, candidate) => {
        if (!nearest) return candidate;
        const candidateDistance = Math.min(
          candidate[0].a.distanceToSquared(foot),
          candidate[candidate.length - 1].b.distanceToSquared(foot),
        );
        const nearestDistance = Math.min(
          nearest[0].a.distanceToSquared(foot),
          nearest[nearest.length - 1].b.distanceToSquared(foot),
        );
        return candidateDistance < nearestDistance ? candidate : nearest;
      }, null);
      let points = (component || [])
        .flatMap((segment, index) => (index ? [segment.b.clone()] : [segment.a.clone(), segment.b.clone()]));
      if (points.length < 2) return null;
      if (points[points.length - 1].distanceToSquared(foot) < points[0].distanceToSquared(foot)) points = points.reverse();
      const lengths = [0];
      for (let index = 1; index < points.length; index += 1) lengths.push(lengths[index - 1] + points[index].distanceTo(points[index - 1]));
      const usableLength = Math.min(lengths[lengths.length - 1], Math.max(0.001, guideLength));
      return Array.from({ length: count }, (_, sampleIndex) => {
        const targetLength = usableLength * sampleIndex / (count - 1);
        let segmentIndex = 0;
        while (segmentIndex < lengths.length - 2 && lengths[segmentIndex + 1] < targetLength) segmentIndex += 1;
        const span = lengths[segmentIndex + 1] - lengths[segmentIndex];
        const progress = span > 0 ? (targetLength - lengths[segmentIndex]) / span : 0;
        return points[segmentIndex].clone().lerp(points[segmentIndex + 1], progress);
      });
    };
    const ribMatchedGuidePoints = (foot, target, label) => {
      const direction = target.clone().sub(foot);
      const chord = Math.max(0.05, direction.length());
      const boundingRibs = boundingRibsForGuide(foot, target);
      const sampleCount = 17;
      const profiles = boundingRibs.map((item) => ({
        item,
        points: ribProfileForGuide(item.segment.sourceId, foot, chord, sampleCount),
      })).filter((profile) => profile.points);
      const guideBlend = label === 'south-west'
        ? webOptions.southWestGuideBlend
        : webOptions.southEastGuideBlend;
      let guidePoints;
      if (profiles.length) {
        let previousPlan = 0;
        let previousRise = 0;
        guidePoints = Array.from({ length: sampleCount }, (_, pointIndex) => {
          const fallbackProgress = pointIndex / (sampleCount - 1);
          const normalized = profiles.map((profile) => {
            const startPoint = profile.points[0];
            const endPoint = profile.points[profile.points.length - 1];
            const point = profile.points[pointIndex];
            const finalPlan = Math.hypot(endPoint.x - startPoint.x, endPoint.z - startPoint.z);
            const currentPlan = Math.hypot(point.x - startPoint.x, point.z - startPoint.z);
            const finalRise = endPoint.y - startPoint.y;
            return {
              plan: finalPlan > 0.000001 ? currentPlan / finalPlan : fallbackProgress,
              rise: Math.abs(finalRise) > 0.000001 ? (point.y - startPoint.y) / finalRise : fallbackProgress,
            };
          });
          const weights = normalized.length > 1 ? [1 - guideBlend, guideBlend] : [1];
          const weightTotal = weights.slice(0, normalized.length).reduce((sum, weight) => sum + weight, 0) || 1;
          let planProgress = normalized.reduce((sum, value, index) => sum + value.plan * (weights[index] ?? 0), 0) / weightTotal;
          let riseProgress = normalized.reduce((sum, value, index) => sum + value.rise * (weights[index] ?? 0), 0) / weightTotal;
          // Rib legs rise monotonically from the wall. Numerical noise in a
          // clipped seating polyline must not make the transferred guide fold.
          planProgress = THREE.MathUtils.clamp(Math.max(previousPlan, planProgress), 0, 1);
          riseProgress = THREE.MathUtils.clamp(Math.max(previousRise, riseProgress), 0, 1);
          previousPlan = planProgress;
          previousRise = riseProgress;
          return new THREE.Vector3(
            THREE.MathUtils.lerp(foot.x, target.x, planProgress),
            THREE.MathUtils.lerp(foot.y, target.y, riseProgress),
            THREE.MathUtils.lerp(foot.z, target.z, planProgress),
          );
        });
      } else {
        const fallback = new THREE.QuadraticBezierCurve3(
          foot,
          foot.clone().lerp(target, 0.45).setY(Math.max(foot.y, target.y)),
          target,
        );
        guidePoints = fallback.getPoints(sampleCount - 1);
      }
      guidePoints[0].copy(foot);
      guidePoints[guidePoints.length - 1].copy(target);
      const startTangent = guidePoints[1].clone().sub(guidePoints[0]).normalize();
      const endTangent = guidePoints[guidePoints.length - 1]
        .clone()
        .sub(guidePoints[guidePoints.length - 2])
        .normalize();
      cornerGuideDiagnostics.push({
        label,
        adjacentRibIds: boundingRibs.map((item) => item.ribId),
        leftRibId: boundingRibs[0]?.ribId ?? null,
        rightRibId: boundingRibs[1]?.ribId ?? null,
        wallConnectedRibsOnly: true,
        guideBlend,
        profileConstraint: 'weighted-wall-connected-left-right-rib-profiles',
        guidePoints: guidePoints.map((point) => point.toArray()),
        startTangent: startTangent.toArray(),
        endTangent: endTangent.toArray(),
      });
      return guidePoints;
    };
    const wallLegRibProfiles = (wall, corner) => {
      const legContactTolerance = Math.max(
        wallContactTolerance,
        Math.max(ribWidth, ribDepth) * groupScale * 0.65,
      );
      const candidates = [];
      wallConnectedComponentsBySource.forEach((components, sourceId) => {
        const match = String(sourceId).match(/^(\d+):([01])$/);
        if (!match) return;
        components.forEach((component) => {
          const points = component.flatMap((segment, index) => (
            index ? [segment.b.clone()] : [segment.a.clone(), segment.b.clone()]
          ));
          if (points.length < 2) return;
          [0, points.length - 1].forEach((pointIndex) => {
            const point = points[pointIndex];
            const wallPlane = wall === 'north'
              ? roofNorthZ
              : wall === 'south'
                ? roofSouthZ
                : wall === 'west'
                  ? roofWestX
                  : roofEastX;
            const touchesWall = wall === 'north' || wall === 'south'
              ? Math.abs(point.z - wallPlane) <= legContactTolerance
              : Math.abs(point.x - wallPlane) <= legContactTolerance;
            // Roof continuation belongs to the actual bearing endpoint. Rib-
            // level support is insufficient because the remote leg of that same
            // rib may belong to another wall or be automatically clipped.
            if (!touchesWall) return;
            const cornerDistance = wall === 'north' || wall === 'south'
              ? Math.abs(point.x - corner.x)
              : Math.abs(point.z - corner.z);
            const oriented = pointIndex === 0 ? points : [...points].reverse();
            const rising = [oriented[0]];
            for (let index = 1; index < oriented.length; index += 1) {
              if (oriented[index].y < rising[rising.length - 1].y - 0.0001) break;
              rising.push(oriented[index]);
            }
            if (rising.length < 2) return;
            const directionPoint = rising.find((candidate) => (
              Math.hypot(candidate.x - point.x, candidate.z - point.z)
              >= Math.max(0.02, Math.min(ribWidth, ribDepth) * groupScale * 0.25)
            )) || rising[rising.length - 1];
            const directionX = directionPoint.x - point.x;
            const directionZ = directionPoint.z - point.z;
            const directionLength = Math.hypot(directionX, directionZ);
            const interiorDirection = directionLength < 0.000001
              ? -1
              : wall === 'north' || wall === 'south'
                ? directionX * Math.sign(centerX - corner.x) / directionLength
                : directionZ * Math.sign(centerZ - corner.z) / directionLength;
            candidates.push({
              ribId: match[1],
              sourceId,
              seatingSide: Number(match[2]),
              points: rising,
              cornerDistance,
              interiorDirection,
            });
          });
        });
      });
      // Prefer profiles rising toward the corner, but retain the other visible
      // wall profiles as fallbacks. With center-to-edge base contact, the
      // nearest physical wall profile can begin tangentially before turning
      // toward the corner and must not be discarded before junction testing.
      const ranked = [...candidates];
      ranked.sort((left, right) => (
        Number(right.interiorDirection > 0.05) - Number(left.interiorDirection > 0.05)
        || left.cornerDistance - right.cornerDistance
        || right.interiorDirection - left.interiorDirection
      ));
      return ranked;
    };
    const pointOnRibAtHeight = (points, height) => {
      for (let index = 0; index < points.length - 1; index += 1) {
        const start = points[index];
        const end = points[index + 1];
        if (height < Math.min(start.y, end.y) - 0.000001 || height > Math.max(start.y, end.y) + 0.000001) continue;
        const progress = Math.abs(end.y - start.y) < 0.000001
          ? 0
          : THREE.MathUtils.clamp((height - start.y) / (end.y - start.y), 0, 1);
        return start.clone().lerp(end, progress);
      }
      return points[points.length - 1].clone();
    };
    const firstVisibleRibJunction = (firstRib, secondRib) => {
      const junctionsByProjection = new Map();
      const elevationAxes = [
        { label: 'x', x: 1, z: 0 },
        { label: 'z', x: 0, z: 1 },
        { label: 'south-west-diagonal', x: Math.SQRT1_2, z: Math.SQRT1_2 },
        { label: 'south-east-diagonal', x: Math.SQRT1_2, z: -Math.SQRT1_2 },
      ];
      const horizontalPosition = (point, axis) => point.x * axis.x + point.z * axis.z;
      const segmentIntersectionElevation = (firstStart, firstEnd, secondStart, secondEnd, axis) => {
        const firstX = horizontalPosition(firstEnd, axis) - horizontalPosition(firstStart, axis);
        const firstY = firstEnd.y - firstStart.y;
        const secondX = horizontalPosition(secondEnd, axis) - horizontalPosition(secondStart, axis);
        const secondY = secondEnd.y - secondStart.y;
        const denominator = firstX * secondY - firstY * secondX;
        if (Math.abs(denominator) < 0.000001) return null;
        const separationX = horizontalPosition(secondStart, axis) - horizontalPosition(firstStart, axis);
        const separationY = secondStart.y - firstStart.y;
        const firstT = (separationX * secondY - separationY * secondX) / denominator;
        const secondT = (separationX * firstY - separationY * firstX) / denominator;
        if (firstT < -0.000001 || firstT > 1.000001 || secondT < -0.000001 || secondT > 1.000001) return null;
        return {
          firstT: THREE.MathUtils.clamp(firstT, 0, 1),
          secondT: THREE.MathUtils.clamp(secondT, 0, 1),
        };
      };
      // Test the exact visible edge profiles selected for extrusion. Looking at
      // every left/right edge of the parent ribs can find a valid contact on a
      // different edge and then incorrectly extrude the remote profiles.
      for (let firstIndex = 0; firstIndex < firstRib.points.length - 1; firstIndex += 1) {
        const firstStart = firstRib.points[firstIndex];
        const firstEnd = firstRib.points[firstIndex + 1];
        for (let secondIndex = 0; secondIndex < secondRib.points.length - 1; secondIndex += 1) {
          const secondStart = secondRib.points[secondIndex];
          const secondEnd = secondRib.points[secondIndex + 1];
          for (const elevationAxis of elevationAxes) {
            const crossing = segmentIntersectionElevation(firstStart, firstEnd, secondStart, secondEnd, elevationAxis);
            if (!crossing) continue;
            const firstContact = firstStart.clone().lerp(firstEnd, crossing.firstT);
            const secondContact = secondStart.clone().lerp(secondEnd, crossing.secondT);
            const height = (firstContact.y + secondContact.y) / 2;
            if (height <= sideTop + Math.max(0.002, ribDepth * groupScale * 0.05)) continue;
            const current = junctionsByProjection.get(elevationAxis.label);
            if (current && height >= current.height) continue;
            junctionsByProjection.set(elevationAxis.label, {
              height,
              firstPoint: firstContact,
              secondPoint: secondContact,
              firstSegmentIndex: firstIndex,
              secondSegmentIndex: secondIndex,
              firstT: crossing.firstT,
              secondT: crossing.secondT,
              firstSide: `source-${firstRib.sourceId}`,
              secondSide: `source-${secondRib.sourceId}`,
              point: firstContact.clone().lerp(secondContact, 0.5),
              centerlineContactDistance: firstContact.distanceTo(secondContact),
              projectionPlane: `wall-facing-${elevationAxis.label}-y-elevation`,
            });
          }
        }
      }
      const physicalContactTolerance = Math.max(ribWidth, ribDepth) * groupScale * 1.1;
      const projectedJunction = elevationAxes
        .map(({ label }) => junctionsByProjection.get(label))
        .filter((candidate) => (
          candidate && candidate.centerlineContactDistance <= physicalContactTolerance
        ))
        .sort((left, right) => left.height - right.height)[0];
      if (projectedJunction) return projectedJunction;

      // Folded ribs can physically meet without their centre-lines crossing in
      // a principal elevation. In that case use the closest contact between
      // the two visible physical edge profiles, never an extrapolated or
      // clipped-away portion.
      let nearestContact = null;
      for (let firstIndex = 0; firstIndex < firstRib.points.length - 1; firstIndex += 1) {
        for (let secondIndex = 0; secondIndex < secondRib.points.length - 1; secondIndex += 1) {
          const contact = closestSegmentContact3D(
            firstRib.points[firstIndex],
            firstRib.points[firstIndex + 1],
            secondRib.points[secondIndex],
            secondRib.points[secondIndex + 1],
          );
          const height = (contact.firstPoint.y + contact.secondPoint.y) / 2;
          if (height <= sideTop + 0.0001) continue;
          if (!nearestContact || contact.distance < nearestContact.centerlineContactDistance) {
            nearestContact = {
              height,
              firstPoint: contact.firstPoint,
              secondPoint: contact.secondPoint,
              firstSegmentIndex: firstIndex,
              secondSegmentIndex: secondIndex,
              firstT: contact.firstT,
              secondT: contact.secondT,
              firstSide: `seat-${firstRib.seatingSide}`,
              secondSide: `seat-${secondRib.seatingSide}`,
              point: contact.firstPoint.clone().lerp(contact.secondPoint, 0.5),
              centerlineContactDistance: contact.distance,
              projectionPlane: 'wall-facing-visible-physical-rib-contact-y-elevation',
            };
          }
        }
      }
      return nearestContact?.centerlineContactDistance <= physicalContactTolerance ? nearestContact : null;
    };
    const profileToJunctionContact = (points, segmentIndex, contactPoint) => [
      ...points.slice(0, segmentIndex + 1).map((candidate) => candidate.clone()),
      contactPoint.clone(),
    ];
    const alignRibEdgeProfileToWall = (profile, wall) => {
      const points = profile.points.map((point) => new THREE.Vector3(
        THREE.MathUtils.clamp(point.x, roofWestX, roofEastX),
        point.y,
        THREE.MathUtils.clamp(point.z, roofNorthZ, roofSouthZ),
      ));
      // Preserve the actual wall-connected rib section (the highlighted arc).
      // Only its bearing point is snapped onto the wall interior/top line;
      // translating every sample moves the roof boundary away from the rib.
      const base = points[0];
      if (wall === 'west') base.x = roofWestX;
      else if (wall === 'east') base.x = roofEastX;
      else if (wall === 'south') base.z = roofSouthZ;
      else if (wall === 'north') base.z = roofNorthZ;
      base.y = sideTop;
      return points;
    };
    const cornerRoofExtrusions = [];
    const addWallExtrusionCornerRoof = (primaryWall, sideWall, corner) => {
      const primaryCandidates = wallLegRibProfiles(primaryWall, corner);
      const sideCandidates = wallLegRibProfiles(sideWall, corner);
      if (!group.userData.karbandiCornerRoofCandidateRibs) group.userData.karbandiCornerRoofCandidateRibs = [];
      group.userData.karbandiCornerRoofCandidateRibs.push({
        sideWall,
        primaryWall,
        primary: primaryCandidates.map(({ ribId, sourceId, cornerDistance, interiorDirection, points }) => ({
          ribId, sourceId, cornerDistance, interiorDirection, startHeight: points[0]?.y, endHeight: points[points.length - 1]?.y,
        })),
        side: sideCandidates.map(({ ribId, sourceId, cornerDistance, interiorDirection, points }) => ({
          ribId, sourceId, cornerDistance, interiorDirection, startHeight: points[0]?.y, endHeight: points[points.length - 1]?.y,
        })),
      });
      const ribPair = primaryCandidates.flatMap((primaryRib) => (
        sideCandidates
          .filter((sideRib) => sideRib.ribId !== primaryRib.ribId)
          .map((sideRib) => ({
            primaryRib,
            sideRib,
            junction: firstVisibleRibJunction(primaryRib, sideRib),
            distance: primaryRib.cornerDistance + sideRib.cornerDistance,
            inwardLegCount: Number(primaryRib.interiorDirection > 0.001)
              + Number(sideRib.interiorDirection > 0.001),
            minimumInteriorDirection: Math.min(primaryRib.interiorDirection, sideRib.interiorDirection),
          }))
          .filter(({ junction }) => junction)
      )).sort((left, right) => (
        right.inwardLegCount - left.inwardLegCount
        || right.minimumInteriorDirection - left.minimumInteriorDirection
        || left.distance - right.distance
        || left.junction.height - right.junction.height
      ))[0];
      if (!ribPair) return;
      const { primaryRib, sideRib, junction } = ribPair;
      const visibleJunctionHeight = Math.min(junction.firstPoint.y, junction.secondPoint.y);
      if (visibleJunctionHeight <= sideTop + 0.0001) return;
      const boundedPrimaryRib = {
        ...primaryRib,
        points: profileToJunctionContact(
          primaryRib.points,
          junction.firstSegmentIndex,
          junction.firstPoint,
        ),
      };
      const boundedSideRib = {
        ...sideRib,
        points: profileToJunctionContact(
          sideRib.points,
          junction.secondSegmentIndex,
          junction.secondPoint,
        ),
      };
      const primaryProfile = alignRibEdgeProfileToWall(boundedPrimaryRib, primaryWall);
      const sideProfile = alignRibEdgeProfileToWall(boundedSideRib, sideWall);
      const primaryJunctionHeight = primaryProfile[primaryProfile.length - 1].y;
      const sideJunctionHeight = sideProfile[sideProfile.length - 1].y;
      if (Math.min(primaryJunctionHeight, sideJunctionHeight) <= sideTop + 0.0001) return;
      const sampleCount = 25;
      const primaryPoints = [];
      const sidePoints = [];
      const intersectionPoints = [];
      Array.from({ length: sampleCount }, (_, index) => {
        const progress = index / (sampleCount - 1);
        const primaryPoint = pointOnRibAtHeight(
          primaryProfile,
          THREE.MathUtils.lerp(sideTop, primaryJunctionHeight, progress),
        );
        const sidePoint = pointOnRibAtHeight(
          sideProfile,
          THREE.MathUtils.lerp(sideTop, sideJunctionHeight, progress),
        );
        primaryPoints.push(primaryPoint);
        sidePoints.push(sidePoint);
        if (index === sampleCount - 1) {
          // The exact physical contact is the terminal red boundary. Using a
          // coordinate-mixed corner here creates an L-shaped overshoot whenever
          // the finite-width rib edges meet without coincident centrelines.
          intersectionPoints.push(primaryPoint.clone().lerp(sidePoint, 0.5));
        } else {
          intersectionPoints.push(new THREE.Vector3(
            THREE.MathUtils.clamp(sidePoint.x, roofWestX, roofEastX),
            (primaryPoint.y + sidePoint.y) / 2,
            THREE.MathUtils.clamp(primaryPoint.z, roofNorthZ, roofSouthZ),
          ));
        }
      });
      const visibleJunctionPoint = primaryPoints[primaryPoints.length - 1]
        .clone()
        .lerp(sidePoints[sidePoints.length - 1], 0.5);
      const terminalBoundary = [
        primaryPoints[primaryPoints.length - 1].clone(),
        sidePoints[sidePoints.length - 1].clone(),
      ];
      cornerRoofExtrusions.push({
        label: `${primaryWall}-${sideWall}`,
        adjacentRibIds: [primaryRib.ribId, sideRib.ribId],
        primaryWall,
        primaryWallRibId: primaryRib.ribId,
        southWallRibId: primaryWall === 'south' ? primaryRib.ribId : null,
        sideWallRibId: sideRib.ribId,
        primaryWallRibEdgeSourceId: primaryRib.sourceId,
        southWallRibEdgeSourceId: primaryWall === 'south' ? primaryRib.sourceId : null,
        sideWallRibEdgeSourceId: sideRib.sourceId,
        primaryWallRibInteriorDirection: primaryRib.interiorDirection,
        southWallRibInteriorDirection: primaryWall === 'south' ? primaryRib.interiorDirection : null,
        sideWallRibInteriorDirection: sideRib.interiorDirection,
        inwardBearingLegCount: ribPair.inwardLegCount,
        sideWall,
        wallConnectedRibsOnly: true,
        selectedVisibleRibEdgesOnly: true,
        profileConstraint: 'base-snapped-wall-connected-rib-sections-preserved-without-profile-translation',
        sourceProfileExtent: 'wall-top-to-first-visible-supported-rib-intersection',
        boundaryDevelopment: 'wall-interior-base-along-connected-rib-section-to-exact-first-physical-intersection-line',
        terminalBoundaryMethod: 'straight-line-between-exact-supporting-rib-edge-contacts',
        terminalBoundary,
        visibleRibIntersection: visibleJunctionPoint.toArray(),
        visibleRibIntersectionProjection: junction.projectionPlane,
        visibleRibCenterlineContactDistance: junction.centerlineContactDistance,
        cornerRoofMethod: 'two-wall-aligned-rib-edge-extrusions-intersected-and-footprint-clipped',
        primaryWallConnection: `rib-leg-seat-to-vertical-${primaryWall}-interior-plane`,
        southWallConnection: primaryWall === 'south' ? 'rib-leg-seat-to-vertical-south-interior-plane' : null,
        southWallPlaneZ: primaryWall === 'south' ? roofSouthZ : null,
        primaryPoints,
        southPoints: primaryWall === 'south' ? primaryPoints : [],
        sidePoints,
        intersectionPoints,
      });
    };
    // Reuse the Iwan's two-wall ruled construction at every Room corner. Each
    // strip starts on the visible wall-supported rib edge and terminates at the
    // exact intersection with its adjoining strip, closing the corner without
    // extrapolated triangles or overlapping generic topology patches.
    if (!vestibuleMode) {
      addWallExtrusionCornerRoof('south', 'west', { x: roofWestX, z: roofSouthZ });
      addWallExtrusionCornerRoof('south', 'east', { x: roofEastX, z: roofSouthZ });
    }
    if (roomMode && !vestibuleMode) {
      addWallExtrusionCornerRoof('north', 'west', { x: roofWestX, z: roofNorthZ });
      addWallExtrusionCornerRoof('north', 'east', { x: roofEastX, z: roofNorthZ });
    }
    group.userData.karbandiHiddenCornerGuideCount = 0;
    group.userData.karbandiCornerGuides = [];
    group.userData.karbandiCornerGuideConstraint = null;
    group.userData.karbandiCornerRoofExtrusions = cornerRoofExtrusions.map((corner) => ({
      ...corner,
      primaryPoints: corner.primaryPoints.map((point) => point.toArray()),
      southPoints: corner.southPoints.map((point) => point.toArray()),
      sidePoints: corner.sidePoints.map((point) => point.toArray()),
      intersectionPoints: corner.intersectionPoints.map((point) => point.toArray()),
      terminalBoundary: corner.terminalBoundary.map((point) => point.toArray()),
    }));

    const vestibuleEdgeRoofExtrusions = [];
    const vestibuleRibOccludedEdgeRoofIndexes = [];
    const vestibuleShortEdgeRoofClosureIndexes = [];
    const vestibuleEdgeRoofCandidateDiagnostics = [];
    if (vestibuleMode && roomTransitionWallFeet.length === 8) {
      const vestibuleEdgeLengths = roomTransitionWallFeet.map((entry, index) => (
        entry.footPoint.distanceTo(roomTransitionWallFeet[(index + 1) % roomTransitionWallFeet.length].footPoint)
      ));
      const vestibuleEdgeStarts = vestibuleEdgeLengths.reduce((starts, length) => (
        [...starts, starts.at(-1) + length]
      ), [0]);
      const vestibuleInteriorPerimeter = vestibuleEdgeStarts.at(-1);
      const profilesAtFootFacingEdge = (entry, interiorProbe) => [`${entry.ribIndex}:0`, `${entry.ribIndex}:1`]
        .flatMap((sourceId) => (wallConnectedComponentsBySource.get(sourceId) || []).map((component) => {
          let points = component.flatMap((segment, index) => (
            index ? [segment.b.clone()] : [segment.a.clone(), segment.b.clone()]
          ));
          if (points.length < 2) return null;
          if (points.at(-1).distanceToSquared(entry.footPoint) < points[0].distanceToSquared(entry.footPoint)) {
            points = points.reverse();
          }
          const rising = [points[0]];
          for (let index = 1; index < points.length; index += 1) {
            if (points[index].y < rising.at(-1).y - 0.0001) break;
            rising.push(points[index]);
          }
          if (rising.length < 2) return null;
          const sample = rising[Math.min(rising.length - 1, Math.max(1, Math.floor(rising.length * 0.2)))];
          return {
            ribId: String(entry.ribIndex),
            sourceId,
            points: rising,
            edgeDistance: Math.hypot(sample.x - interiorProbe.x, sample.z - interiorProbe.z),
            footDistance: rising[0].distanceTo(entry.footPoint),
          };
        }))
        .filter(Boolean)
        .sort((left, right) => left.edgeDistance - right.edgeDistance || left.footDistance - right.footDistance);

      roomTransitionWallFeet.forEach((startEntry, edgeIndex) => {
        const endEntry = roomTransitionWallFeet[(edgeIndex + 1) % roomTransitionWallFeet.length];
        const edgeMidpoint = startEntry.footPoint.clone().lerp(endEntry.footPoint, 0.5);
        const interiorProbe = edgeMidpoint.clone().lerp(
          new THREE.Vector3(centerX, sideTop, centerZ),
          0.28,
        );
        const startCandidates = profilesAtFootFacingEdge(startEntry, interiorProbe);
        const endCandidates = profilesAtFootFacingEdge(endEntry, interiorProbe);
        const wallVector = endEntry.footPoint.clone().sub(startEntry.footPoint).setY(0);
        const wallVectorLengthSquared = wallVector.lengthSq();
        const supportedWallDirection = wallVector.clone().normalize();
        const projectBaseToWallEdge = (point) => {
          const progress = wallVectorLengthSquared > 0.0000001
            ? THREE.MathUtils.clamp(
              point.clone().sub(startEntry.footPoint).setY(0).dot(wallVector) / wallVectorLengthSquared,
              0,
              1,
            )
            : 0;
          return startEntry.footPoint.clone().addScaledVector(wallVector, progress).setY(sideTop);
        };
        const candidatePairs = startCandidates.flatMap((startRib) => (
          endCandidates.map((endRib) => {
            const startBase = projectBaseToWallEdge(startRib.points[0]);
            const endBase = projectBaseToWallEdge(endRib.points[0]);
            return {
              startRib,
              endRib,
              startBase,
              endBase,
              supportedWallSpan: endBase.clone().sub(startBase).setY(0).dot(supportedWallDirection),
              junction: startRib.ribId === endRib.ribId ? null : firstVisibleRibJunction(startRib, endRib),
              edgeDistance: startRib.edgeDistance + endRib.edgeDistance,
            };
          })
        ));
        vestibuleEdgeRoofCandidateDiagnostics.push({
          edgeIndex,
          candidates: candidatePairs.map((candidate) => ({
            startSourceId: candidate.startRib.sourceId,
            endSourceId: candidate.endRib.sourceId,
            supportedWallSpan: candidate.supportedWallSpan,
            hasJunction: Boolean(candidate.junction),
            junctionHeight: candidate.junction?.height ?? null,
            edgeDistance: candidate.edgeDistance,
          })),
        });
        const junctionPairs = candidatePairs.filter((candidate) => candidate.junction);
        const supportedJunctionPair = junctionPairs
          .filter((candidate) => candidate.supportedWallSpan > 0.001)
          .sort((left, right) => left.edgeDistance - right.edgeDistance || left.junction.height - right.junction.height)[0];
        const supportedFallbackPairs = candidatePairs
          .filter((candidate) => candidate.supportedWallSpan > 0.001 && !candidate.junction);
        const usesShortEdgeClosure = !supportedJunctionPair && junctionPairs.length > 0 && supportedFallbackPairs.length > 0;
        const pair = supportedJunctionPair
          || (usesShortEdgeClosure
            ? supportedFallbackPairs.sort((left, right) => right.supportedWallSpan - left.supportedWallSpan)[0]
            : supportedFallbackPairs.sort((left, right) => left.edgeDistance - right.edgeDistance)[0])
          || junctionPairs.sort((left, right) => left.edgeDistance - right.edgeDistance)[0];
        const startRib = pair?.startRib || startCandidates[0];
        const endRib = pair?.endRib || endCandidates[0];
        if (!startRib || !endRib) return;
        const hasDirectJunction = Boolean(pair?.junction);
        const startLegJunction = hasDirectJunction ? null : firstRibIntersection(startEntry.ribIndex, startEntry.side, 0);
        const endLegJunction = hasDirectJunction ? null : firstRibIntersection(endEntry.ribIndex, endEntry.side, 0);
        if (!hasDirectJunction && !usesShortEdgeClosure && (!startLegJunction || !endLegJunction)) return;
        const junction = pair?.junction || {
          projectionPlane: 'two-adjacent-first-visible-rib-intersections',
          centerlineContactDistance: null,
        };
        const startProfile = hasDirectJunction
          ? profileToJunctionContact(startRib.points, junction.firstSegmentIndex, junction.firstPoint)
          : startRib.points.map((point) => point.clone());
        const endProfile = hasDirectJunction
          ? profileToJunctionContact(endRib.points, junction.secondSegmentIndex, junction.secondPoint)
          : endRib.points.map((point) => point.clone());
        const fallbackTerminalHeight = hasDirectJunction
          ? Math.min(startProfile.at(-1).y, endProfile.at(-1).y)
          : usesShortEdgeClosure
            ? Math.min(...junctionPairs.map((candidate) => candidate.junction.height))
          : Math.min(
            transformRibPoint(pointAtCurveIndex(inner, startLegJunction.originalIndex), ribAngles[startEntry.ribIndex]).y,
            transformRibPoint(pointAtCurveIndex(inner, endLegJunction.originalIndex), ribAngles[endEntry.ribIndex]).y,
          );
        const firstProfileSpanClosureHeight = (() => {
          if (hasDirectJunction || usesShortEdgeClosure) return null;
          const spanAtHeight = (height) => pointOnRibAtHeight(endProfile, height)
            .sub(pointOnRibAtHeight(startProfile, height))
            .setY(0)
            .dot(supportedWallDirection);
          let lowerHeight = sideTop;
          let lowerSpan = spanAtHeight(lowerHeight);
          const scanCount = 128;
          for (let scanIndex = 1; scanIndex <= scanCount; scanIndex += 1) {
            const upperHeight = THREE.MathUtils.lerp(
              sideTop,
              fallbackTerminalHeight,
              scanIndex / scanCount,
            );
            const upperSpan = spanAtHeight(upperHeight);
            if (lowerSpan > 0.0005 && upperSpan <= 0.0005) {
              let low = lowerHeight;
              let high = upperHeight;
              for (let iteration = 0; iteration < 18; iteration += 1) {
                const middle = (low + high) * 0.5;
                if (spanAtHeight(middle) > 0.0005) low = middle;
                else high = middle;
              }
              return high;
            }
            lowerHeight = upperHeight;
            lowerSpan = upperSpan;
          }
          return null;
        })();
        const terminalHeight = firstProfileSpanClosureHeight ?? fallbackTerminalHeight;
        if (terminalHeight <= sideTop + 0.0001) return;
        startProfile[0].copy(pair?.startBase || projectBaseToWallEdge(startProfile[0]));
        endProfile[0].copy(pair?.endBase || projectBaseToWallEdge(endProfile[0]));
        const physicalWallCoverEdge = [startProfile[0].clone(), endProfile[0].clone()];
        const supportedWallSpan = endProfile[0].clone().sub(startProfile[0]).setY(0).dot(supportedWallDirection);
        if (supportedWallSpan <= 0.001) {
          // The finite-width inner faces of the two ribs overlap across this
          // very short wall edge. There is no supported roof bay between them;
          // generating one creates the triangular cover bleed over both ribs.
          vestibuleRibOccludedEdgeRoofIndexes.push(edgeIndex);
          return;
        }
        if (usesShortEdgeClosure) vestibuleShortEdgeRoofClosureIndexes.push(edgeIndex);
        const sampleCount = 25;
        const startPoints = [];
        const endPoints = [];
        for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
          const progress = sampleIndex / (sampleCount - 1);
          const height = THREE.MathUtils.lerp(sideTop, terminalHeight, progress);
          startPoints.push(pointOnRibAtHeight(startProfile, height));
          endPoints.push(pointOnRibAtHeight(endProfile, height));
        }
        // Meet the vertical wall at its exact architectural corners, then fan
        // beneath the rib to its internal face. This closes the wall-top seam
        // without allowing the visible curved cover to sit on top of the rib.
        startPoints[0].copy(startEntry.footPoint).setY(sideTop);
        endPoints[0].copy(endEntry.footPoint).setY(sideTop);
        vestibuleEdgeRoofExtrusions.push({
          edgeIndex,
          label: `vestibule-edge-${edgeIndex}`,
          adjacentRibIds: [startRib.ribId, endRib.ribId],
          adjacentRibEdgeSourceIds: [startRib.sourceId, endRib.sourceId],
          startPoints,
          endPoints,
          terminalBoundary: [startPoints.at(-1), endPoints.at(-1)],
          visibleRibIntersection: startPoints.at(-1).clone().lerp(endPoints.at(-1), 0.5),
          visibleRibIntersectionProjection: junction.projectionPlane,
          visibleRibCenterlineContactDistance: junction.centerlineContactDistance
            ?? startPoints.at(-1).distanceTo(endPoints.at(-1)),
          wallEdge: [startEntry.footPoint.clone().setY(sideTop), endEntry.footPoint.clone().setY(sideTop)],
          physicalWallCoverEdge,
          wallBondSurface: 'room_plan_interior',
          wallBondPhase: vestibuleEdgeStarts[edgeIndex],
          wallBondCycle: vestibuleInteriorPerimeter,
          wallEdgeLength: vestibuleEdgeLengths[edgeIndex],
          supportedWallSpan,
          cornerRoofMethod: 'single-octagonal-wall-edge-ruled-cover-clipped-under-two-adjacent-ribs',
          terminalBoundaryMethod: hasDirectJunction
            ? 'straight-line-at-exact-adjacent-rib-contact'
            : usesShortEdgeClosure
              ? 'short-wall-gap-closure-stops-at-overlapping-inner-rib-contact-height'
              : firstProfileSpanClosureHeight !== null
                ? 'first-internal-rib-edge-profile-span-closure'
                : 'straight-line-between-adjacent-ribs-first-visible-intersections',
        });
      });
    }
    group.userData.karbandiVestibuleEdgeRoofExtrusions = vestibuleEdgeRoofExtrusions.map((edge) => ({
      ...edge,
      startPoints: edge.startPoints.map((point) => point.toArray()),
      endPoints: edge.endPoints.map((point) => point.toArray()),
      terminalBoundary: edge.terminalBoundary.map((point) => point.toArray()),
      visibleRibIntersection: edge.visibleRibIntersection.toArray(),
      wallEdge: edge.wallEdge.map((point) => point.toArray()),
      physicalWallCoverEdge: edge.physicalWallCoverEdge.map((point) => point.toArray()),
    }));
    group.userData.karbandiVestibuleRibOccludedEdgeRoofIndexes = vestibuleRibOccludedEdgeRoofIndexes;
    group.userData.karbandiVestibuleShortEdgeRoofClosureIndexes = vestibuleShortEdgeRoofClosureIndexes;
    group.userData.karbandiVestibuleEdgeRoofCandidateDiagnostics = vestibuleEdgeRoofCandidateDiagnostics;

    const ribBandQuads = buildRibBandQuads(rawSegments);
    const ribCenterlines = buildRibCenterlines(rawSegments);
    const topology = buildWebTopology(rawSegments.map((segment) => ({
      a: segment.a,
      b: segment.b,
      kind: segment.kind,
      sourceId: segment.sourceId,
      supportSide: segment.supportSide,
      supportSides: segment.supportSides,
    })), webOptions, {
      snapTolerance: Math.max(0.0025, ribDepth * groupScale * 0.12),
      // Small crown cells are architecturally valid. Reject only numerical
      // slivers; the previous 0.002 m² cutoff left visible holes in the web.
      minimumArea: 0.00001,
    });
    const nodes = topology.nodes;
    let rejectedRibStripCount = 0;
    const faces = topology.faces.filter((face) => {
      // Sample the face interior instead of trusting its centroid alone. This
      // preserves the tiny valid web cells around crowded rib intersections
      // while still excluding faces physically occupied by rib material.
      const occupiesRibBand = polygonMostlyInsideRibBands(
        face.ids.map((id) => nodes[id]),
        ribBandQuads,
      );
      if (occupiesRibBand) rejectedRibStripCount += 1;
      return !occupiesRibBand;
    });
    group.userData.karbandiRejectedRibStripCount = rejectedRibStripCount;
    group.userData.karbandiRoofDanglingEdgeCount = topology.unsupportedEdges.length;
    group.userData.karbandiUnsupportedWarning = springing.missingSides.length
      ? 'This cell has an unsupported perimeter edge. Select a wall, edge arch, beam, or springing boundary.'
      : null;
    group.userData.karbandiUnsupportedFreeEdgeAllowed = webOptions.allowUnsupportedFreeEdge;
    group.userData.karbandiIntentionalOpeningCount = topology.intentionalOpenings.length;
    group.userData.karbandiCellCounts = faces.reduce((counts, face) => ({
      ...counts,
      [face.classification]: (counts[face.classification] || 0) + 1,
    }), {});
    group.userData.karbandiPatchBoundarySummary = faces.map((face) => ({
      classification: face.classification,
      curves: groupFaceBoundaryCurves(face, nodes).map((curve) => curve.key),
    }));

    const roofWidth = roofEastX - roofWestX;
    const roofDepth = roofSouthZ - roofNorthZ;
    const continuationBondPhase = {
      east: roofWidth,
      south: roofWidth + roofDepth,
      west: roofWidth * 2 + roofDepth,
    };
    const roomInteriorPerimeter = (roofWidth + roofDepth) * 2;
    const roomInteriorBondPhase = {
      south: roofWidth / 2,
      east: roofWidth + roofDepth / 2,
      north: roofWidth + roofDepth + roofWidth / 2,
      west: roofWidth * 2 + roofDepth + roofDepth / 2,
    };
    const roofMaterial = walls.karbandi.coverFinish === 'solid'
      ? new THREE.MeshStandardMaterial({
        color: walls.karbandi.coverColor,
        roughness: 0.92,
        metalness: 0,
        side: THREE.DoubleSide,
      })
      : wallMaterial(walls, 'arch', roofWidth, roofDepth, true);
    roofMaterial.polygonOffset = true;
    roofMaterial.polygonOffsetFactor = 1;
    roofMaterial.polygonOffsetUnits = 1;
    const inwardCourseBrickMaterial = walls.karbandi.coverFinish === 'bricks'
      ? new THREE.MeshStandardMaterial({
        color: '#ffffff',
        roughness: 0.82,
        metalness: 0,
        side: THREE.DoubleSide,
        map: makeHorizontalCourseRoofTexture(webOptions, walls),
      })
      : roofMaterial;
    inwardCourseBrickMaterial.polygonOffset = true;
    inwardCourseBrickMaterial.polygonOffsetFactor = 1;
    inwardCourseBrickMaterial.polygonOffsetUnits = 1;
    inwardCourseBrickMaterial.userData.horizontalMortarOnly = walls.karbandi.coverFinish === 'bricks';
    inwardCourseBrickMaterial.userData.infillBrickColor = webOptions.infillBrickColor;
    inwardCourseBrickMaterial.userData.infillBrickColor2 = webOptions.infillBrickColor2;
    inwardCourseBrickMaterial.userData.infillBrickHeight = webOptions.infillBrickHeight;
    inwardCourseBrickMaterial.userData.isRoofInfillBrickCourse = walls.karbandi.coverFinish === 'bricks';
    inwardCourseBrickMaterial.userData.generatedTexture = walls.karbandi.coverFinish === 'bricks'
      ? inwardCourseBrickMaterial.map
      : null;
    const crownBrickMaterial = inwardCourseBrickMaterial.clone();
    crownBrickMaterial.userData = {
      ...inwardCourseBrickMaterial.userData,
      isCrownRoofBrickPattern: walls.karbandi.coverFinish === 'bricks',
    };
    const wallContinuationMaterials = new Map();
    const wallContinuationMaterial = (side) => {
      if (!side) return roofMaterial;
      if (!wallContinuationMaterials.has(side)) {
        const surfaceWidth = side === 'east' || side === 'west' ? roofDepth : roofWidth;
        const material = roomMode
          ? directRoomWallFaceMaterial(
            walls,
            side,
            surfaceWidth,
            Math.max(...Object.values(wallHeights), sideTop),
            roomInteriorBondPhase[side],
            roomInteriorPerimeter,
          )
          : walls.karbandi.coverFinish === 'bricks' && walls.bricks.enabled
            ? brickMaterial(
              walls,
              side,
              surfaceWidth,
              Math.max(...Object.values(wallHeights), sideTop),
              false,
              true,
              continuationBondPhase[side] || 0,
            )
            : roofMaterial;
        material.userData.isRoofWallContinuation = true;
        material.userData.wallContinuationSide = side;
        material.userData.wallContinuationBondPhase = roomMode
          ? roomInteriorBondPhase[side]
          : continuationBondPhase[side] || 0;
        material.userData.wallContinuationBondCycle = roomMode ? roomInteriorPerimeter : null;
        wallContinuationMaterials.set(side, material);
      }
      return wallContinuationMaterials.get(side);
    };
    const addVestibuleEdgeRoofPanel = (edge) => {
      if (edge.startPoints.length !== edge.endPoints.length || edge.startPoints.length < 2) return;
      const positions = [];
      const uvs = [];
      const indices = [];
      const addVertex = (point) => {
        positions.push(point.x, point.y, point.z);
        uvs.push(point.x, point.z);
        return positions.length / 3 - 1;
      };
      const rows = edge.startPoints.map((startPoint, index) => {
        const endPoint = edge.endPoints[index];
        const across = endPoint.clone().sub(startPoint).setY(0);
        const acrossLength = across.length();
        const ribOverlapProgress = 1 - index / (edge.startPoints.length - 1);
        const ribOverlapScale = ribOverlapProgress * ribOverlapProgress;
        const hiddenRibOverlap = ribOverlapScale * Math.min(
          acrossLength * 0.32,
          Math.max(coverThickness, ribDepth * groupScale * 2),
        );
        const startBottomPoint = startPoint.clone();
        const endBottomPoint = endPoint.clone();
        const startTopPoint = startPoint.clone().setY(startPoint.y + coverThickness);
        const endTopPoint = endPoint.clone().setY(endPoint.y + coverThickness);
        if (acrossLength > 0.000001 && hiddenRibOverlap > 0) {
          across.multiplyScalar(1 / acrossLength);
          // The soffit must also disappear beneath the ribs. Keeping only the
          // upper skin overlapped left a visible white wedge alongside each
          // curved rib even though the mathematical boundaries touched.
          if (index > 0) {
            startBottomPoint.addScaledVector(across, -hiddenRibOverlap);
            endBottomPoint.addScaledVector(across, hiddenRibOverlap);
          }
          startTopPoint.addScaledVector(across, -hiddenRibOverlap);
          endTopPoint.addScaledVector(across, hiddenRibOverlap);
        }
        return {
          startBottom: addVertex(startBottomPoint),
          endBottom: addVertex(endBottomPoint),
          startTop: addVertex(startTopPoint),
          endTop: addVertex(endTopPoint),
        };
      });
      const addTriangle = (a, b, c) => {
        const pa = new THREE.Vector3(positions[a * 3], positions[a * 3 + 1], positions[a * 3 + 2]);
        const pb = new THREE.Vector3(positions[b * 3], positions[b * 3 + 1], positions[b * 3 + 2]);
        const pc = new THREE.Vector3(positions[c * 3], positions[c * 3 + 1], positions[c * 3 + 2]);
        if (pb.sub(pa).cross(pc.sub(pa)).lengthSq() > 1e-18) indices.push(a, b, c);
      };
      for (let index = 0; index < rows.length - 1; index += 1) {
        const current = rows[index];
        const next = rows[index + 1];
        addTriangle(current.startBottom, current.endBottom, next.endBottom);
        addTriangle(current.startBottom, next.endBottom, next.startBottom);
        addTriangle(current.startTop, next.endTop, current.endTop);
        addTriangle(current.startTop, next.startTop, next.endTop);
        addTriangle(current.startBottom, next.startTop, current.startTop);
        addTriangle(current.startBottom, next.startBottom, next.startTop);
        addTriangle(current.endBottom, current.endTop, next.endTop);
        addTriangle(current.endBottom, next.endTop, next.endBottom);
      }
      const closeEnd = (row, reverse = false) => {
        if (reverse) {
          addTriangle(row.startBottom, row.endTop, row.startTop);
          addTriangle(row.startBottom, row.endBottom, row.endTop);
        } else {
          addTriangle(row.startBottom, row.startTop, row.endTop);
          addTriangle(row.startBottom, row.endTop, row.endBottom);
        }
      };
      closeEnd(rows[0]);
      // The upper edge terminates beneath the two supporting ribs. Closing it
      // with a vertical thickness face produces the exposed horizontal masonry
      // strip seen across the small corner bays, so it intentionally remains
      // open and hidden behind the rib intersection.
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      const wallStart = edge.wallEdge[0];
      const wallEnd = edge.wallEdge[1];
      const wallDirectionX = wallEnd.x - wallStart.x;
      const wallDirectionZ = wallEnd.z - wallStart.z;
      const wallLength = Math.max(0.000001, Math.hypot(wallDirectionX, wallDirectionZ));
      const wallUnitX = wallDirectionX / wallLength;
      const wallUnitZ = wallDirectionZ / wallLength;
      const geometryUvs = geometry.getAttribute('uv');
      const geometryPositions = geometry.getAttribute('position');
      for (let index = 0; index < geometryPositions.count; index += 1) {
        const localWallU = (
          (geometryPositions.getX(index) - wallStart.x) * wallUnitX
          + (geometryPositions.getZ(index) - wallStart.z) * wallUnitZ
        );
        geometryUvs.setXY(index, localWallU, geometryPositions.getY(index));
      }
      geometryUvs.needsUpdate = true;
      geometry.userData.vestibuleWallBondUvMapping = 'connected-wall-local-u-and-continuous-world-y-courses';
      const coverHeight = Math.max(
        sideTop,
        ...edge.startPoints.map((point) => point.y + coverThickness),
        ...edge.endPoints.map((point) => point.y + coverThickness),
      );
      const material = directRoomWallFaceMaterial(
        walls,
        edge.wallBondSurface,
        edge.wallEdgeLength,
        coverHeight,
        edge.wallBondPhase,
        edge.wallBondCycle,
      );
      material.side = THREE.DoubleSide;
      material.polygonOffset = true;
      material.polygonOffsetFactor = 2;
      material.polygonOffsetUnits = 2;
      const panel = new THREE.Mesh(geometry, material);
      panel.name = `Karbandi Vestibule octagonal wall-edge cover ${edge.edgeIndex + 1}`;
      panel.renderOrder = 1;
      panel.castShadow = true;
      panel.receiveShadow = true;
      panel.userData.wallSide = 'room_dome_transition';
      panel.userData.roomDomePart = 'karbandi-transition-cover';
      panel.userData.roomDomeTransitionType = 'karbandi';
      panel.userData.isKarbandiCover = true;
      panel.userData.karbandiCoverFinish = walls.karbandi.coverFinish;
      panel.userData.karbandiRoofCurved = true;
      panel.userData.karbandiRoofWallBay = true;
      panel.userData.webCellClassification = 'EdgePerimeterCell';
      panel.userData.webSupportSides = [edge.label];
      panel.userData.webPatchSolver = 'single-octagonal-wall-edge-ruled-cover';
      panel.userData.roofType = 'wall-supported-roof';
      panel.userData.wallContinuationClippedByRibs = true;
      panel.userData.roofBrickMapping = 'connected-vertical-wall-continuation';
      panel.userData.wallContinuationSide = edge.wallBondSurface;
      panel.userData.wallContinuationPatternSide = edge.wallBondSurface;
      panel.userData.wallContinuationCourseAxis = 'world-y';
      panel.userData.wallContinuationUAxis = 'connected-octagonal-wall-edge-start-to-end';
      panel.userData.wallContinuationBondPhase = edge.wallBondPhase;
      panel.userData.wallContinuationBondCycle = edge.wallBondCycle;
      panel.userData.wallContinuationMethod = 'developed-octagonal-wall-face-pattern-projected-through-curved-cover';
      panel.userData.wallContinuationSeamlessAtWallTop = true;
      panel.userData.ribInteriorEdgeClip = 'soffit-on-inner-rib-edge-upper-skin-overlapped-behind-rib';
      panel.userData.terminalThicknessClosure = 'open-hidden-beneath-adjacent-rib-intersection';
      panel.userData.adjacentRibIds = edge.adjacentRibIds;
      panel.userData.adjacentRibEdgeSourceIds = edge.adjacentRibEdgeSourceIds;
      panel.userData.cornerRoofMethod = edge.cornerRoofMethod;
      panel.userData.cornerRoofTerminalBoundary = edge.terminalBoundary.map((point) => point.toArray());
      panel.userData.wallEdge = edge.wallEdge.map((point) => point.toArray());
      panel.userData.physicalWallCoverEdge = edge.physicalWallCoverEdge.map((point) => point.toArray());
      panel.userData.roofThickness = coverThickness;
      panel.userData.thicknessDirection = 'world-y-for-seam-continuity';
      group.add(panel);
      meshes.push(panel);
    };
    vestibuleEdgeRoofExtrusions.forEach(addVestibuleEdgeRoofPanel);
    const addCornerExtrusionStrip = (corner, stripWall, ribEdgePoints) => {
      if (ribEdgePoints.length !== corner.intersectionPoints.length || ribEdgePoints.length < 2) return;
      const positions = [];
      const uvs = [];
      const indices = [];
      const addVertex = (point) => {
        positions.push(point.x, point.y, point.z);
        uvs.push(point.x, point.z);
        return positions.length / 3 - 1;
      };
      const rows = ribEdgePoints.map((ribPoint, index) => {
        const intersection = corner.intersectionPoints[index];
        return {
          ribBottom: addVertex(ribPoint),
          intersectionBottom: addVertex(intersection),
          ribTop: addVertex(ribPoint.clone().setY(ribPoint.y + coverThickness)),
          intersectionTop: addVertex(intersection.clone().setY(intersection.y + coverThickness)),
        };
      });
      const addTriangle = (a, b, c) => {
        const pa = new THREE.Vector3(positions[a * 3], positions[a * 3 + 1], positions[a * 3 + 2]);
        const pb = new THREE.Vector3(positions[b * 3], positions[b * 3 + 1], positions[b * 3 + 2]);
        const pc = new THREE.Vector3(positions[c * 3], positions[c * 3 + 1], positions[c * 3 + 2]);
        if (pb.sub(pa).cross(pc.sub(pa)).lengthSq() > 1e-18) indices.push(a, b, c);
      };
      for (let index = 0; index < rows.length - 1; index += 1) {
        const current = rows[index];
        const next = rows[index + 1];
        addTriangle(current.ribBottom, next.intersectionBottom, current.intersectionBottom);
        addTriangle(current.ribBottom, next.ribBottom, next.intersectionBottom);
        addTriangle(current.ribTop, current.intersectionTop, next.intersectionTop);
        addTriangle(current.ribTop, next.intersectionTop, next.ribTop);
        addTriangle(current.ribBottom, current.ribTop, next.ribTop);
        addTriangle(current.ribBottom, next.ribTop, next.ribBottom);
        addTriangle(current.intersectionBottom, next.intersectionTop, current.intersectionTop);
        addTriangle(current.intersectionBottom, next.intersectionBottom, next.intersectionTop);
      }
      const closeStripEnd = (row, reverse = false) => {
        if (reverse) {
          addTriangle(row.ribBottom, row.intersectionTop, row.ribTop);
          addTriangle(row.ribBottom, row.intersectionBottom, row.intersectionTop);
        } else {
          addTriangle(row.ribBottom, row.ribTop, row.intersectionTop);
          addTriangle(row.ribBottom, row.intersectionTop, row.intersectionBottom);
        }
      };
      closeStripEnd(rows[0]);
      closeStripEnd(rows[rows.length - 1], true);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      if (roomMode) applyRoomWallContinuationBrickUvs(geometry, stripWall, centerX, centerZ);
      else applyWallContinuationBrickUvs(geometry, stripWall, corner.sideWall);
      const material = wallContinuationMaterial(stripWall).clone();
      // South and side strips of a mirrored corner use opposite triangle
      // windings.  Both are physical roof infill and must remain visible from
      // the portal as well as from above; otherwise the south strip appears as
      // the large white triangular void beside the bearing rib.
      material.side = THREE.DoubleSide;
      const interiorWallClipPlane = (wall) => {
        if (wall === 'north') return new THREE.Plane(new THREE.Vector3(0, 0, 1), -roofNorthZ);
        if (wall === 'south') return new THREE.Plane(new THREE.Vector3(0, 0, -1), roofSouthZ);
        if (wall === 'west') return new THREE.Plane(new THREE.Vector3(1, 0, 0), -roofWestX);
        return new THREE.Plane(new THREE.Vector3(-1, 0, 0), roofEastX);
      };
      material.clippingPlanes = [
        interiorWallClipPlane(corner.primaryWall),
        interiorWallClipPlane(corner.sideWall),
        ];
      material.clipIntersection = false;
      material.clipShadows = true;
      const panel = new THREE.Mesh(geometry, material);
      panel.name = `Karbandi ${corner.label} ${stripWall} wall extrusion`;
      panel.renderOrder = 1;
      panel.castShadow = true;
      panel.receiveShadow = true;
      panel.userData.wallSide = 'arch';
      panel.userData.isKarbandiCover = true;
      panel.userData.karbandiCoverFinish = walls.karbandi.coverFinish;
      panel.userData.karbandiRoofCurved = true;
      panel.userData.karbandiRoofWallBay = true;
      panel.userData.karbandiRoofCornerWithoutCenter = true;
      panel.userData.karbandiRoofRaisedCenter = false;
      panel.userData.webCellClassification = 'CornerPerimeterCell';
      panel.userData.webSupportSides = [corner.primaryWall, corner.sideWall];
      panel.userData.wallClippedSides = [corner.primaryWall, corner.sideWall];
      panel.userData.webPatchSolver = 'wall-aligned-rib-edge-ruled-extrusion';
      panel.userData.webPatchInvertedTriangleCount = 0;
      panel.userData.roofType = 'wall-supported-roof';
      panel.userData.roofBrickMapping = 'wall-continuation';
      panel.userData.wallContinuationSide = stripWall;
      panel.userData.wallContinuationPatternSide = stripWall;
      panel.userData.wallContinuationUAxis = stripWall === 'north' || stripWall === 'south'
        ? (roomMode
          ? (stripWall === 'north' ? '-world-x' : '+world-x')
          : (corner.sideWall === 'west' ? '+world-x' : '-world-x'))
        : (roomMode ? (stripWall === 'west' ? '+world-z' : '-world-z') : '-world-z');
      panel.userData.wallContinuationBondPhase = roomMode ? roomInteriorBondPhase[stripWall] : null;
      panel.userData.wallContinuationBondCycle = roomMode ? roomInteriorPerimeter : null;
      panel.userData.wallContinuationSeamlessAtWallTop = roomMode;
      panel.userData.cornerRoofDevelopment = roomMode
        ? 'rotated-from-bearing-rib-legs-to-adjoining-room-wall-intersection'
        : 'mirrored-from-bearing-rib-leg-to-south-vertical-wall';
      panel.userData.wallContinuationClippedByRibs = true;
      panel.userData.wallContinuationCourseAxis = 'world-y';
      panel.userData.wallContinuationFollowsCornerGuide = false;
      panel.userData.wallContinuationMethod = 'direct-wall-aligned-rib-edge-extrusion';
      panel.userData.cornerRoofMethod = corner.cornerRoofMethod;
      panel.userData.cornerRoofIntersection = 'direct-surface-intersection-no-guide';
      panel.userData.cornerRoofTerminalBoundaryMethod = corner.terminalBoundaryMethod;
      panel.userData.cornerRoofTerminalBoundary = corner.terminalBoundary.map((point) => point.toArray());
      panel.userData.cornerRoofStripWall = stripWall;
      panel.userData.cornerRoofStripSidedness = 'double-sided-closed-wall-bay';
      panel.userData.cornerRoofStartsAt = 'visible-rib-edge';
      panel.userData.cornerRoofProfileAlignment = 'base-snapped-only-preserves-connected-rib-section';
      panel.userData.cornerRoofFootprintClip = `inside-${corner.primaryWall}-and-${corner.sideWall}-interior-wall-faces`;
      panel.userData.primaryWallRibEdgeSourceId = corner.primaryWallRibEdgeSourceId;
      panel.userData.southWallRibEdgeSourceId = corner.southWallRibEdgeSourceId;
      panel.userData.sideWallRibEdgeSourceId = corner.sideWallRibEdgeSourceId;
      panel.userData.hiddenGuideBoundaryCount = 0;
      panel.userData.wallRoofGuide = null;
      panel.userData.roofThickness = coverThickness;
      panel.userData.thicknessDirection = 'world-y-for-seam-continuity';
      panel.userData.ribFootFlangeCount = 1;
      panel.userData.ribFootClosureOverlap = webOptions.ribEmbedTolerance + webOptions.wallEmbedTolerance;
      panel.userData.ribEmbedTolerance = webOptions.ribEmbedTolerance;
      group.add(panel);
      meshes.push(panel);
    };
    cornerRoofExtrusions.forEach((corner) => {
      addCornerExtrusionStrip(corner, corner.primaryWall, corner.primaryPoints);
      addCornerExtrusionStrip(corner, corner.sideWall, corner.sidePoints);
    });
    // Rib seating and springing curves are design constraints, not clearance
    // hints. The visible soffit interpolates every graph boundary vertex.
    const panelBottomY = (node) => node.y;
    const boundarySurfaceNormal = (curves, fallbackNormals = []) => {
      const points = curves.flatMap((curve) => curve.points.slice(0, -1));
      const normal = new THREE.Vector3();
      points.forEach((point, index) => {
        const next = points[(index + 1) % points.length];
        normal.x += (point.y - next.y) * (point.z + next.z);
        normal.y += (point.z - next.z) * (point.x + next.x);
        normal.z += (point.x - next.x) * (point.y + next.y);
      });
      if (normal.lengthSq() < 1e-18) {
        fallbackNormals.forEach((value) => normal.add(value));
      }
      if (normal.lengthSq() < 1e-18) normal.set(0, 1, 0);
      else normal.normalize();
      if (normal.y < 0) normal.multiplyScalar(-1);
      return normal;
    };
    const generatedNorthVisibleRibSides = new Set();
    faces.forEach((topologyFace, faceIndex) => {
      if (vestibuleMode && topologyFace.supportSides.some((side) => String(side).startsWith('vestibule-edge-'))) return;
      const directCornerRoof = cornerRoofExtrusions.some((corner) => (
        topologyFace.supportSides.includes(corner.primaryWall)
        && topologyFace.supportSides.includes(corner.sideWall)
      ));
      if (directCornerRoof) return;
      const face = topologyFace.ids;
      const wallSides = new Set(topologyFace.supportSides);
      const touchesWallRib = wallSides.size > 0;
      const omitsCenterAtCorner = topologyFace.classification === 'CornerPerimeterCell';
      const positions = [];
      const uvs = [];
      const bearingDistance = webOptions.wallBearingDepth + webOptions.wallEmbedTolerance;
      const boundaryNodes = face.map((id) => nodes[id]);
      const bearingAtPoint = (x, z) => {
        const sides = [];
        topologyFace.boundaryEdges.forEach((edge, index) => {
          if (edge?.kind !== 'support') return;
          const current = boundaryNodes[index];
          const next = boundaryNodes[(index + 1) % boundaryNodes.length];
          const dx = next.x - current.x;
          const dz = next.z - current.z;
          const denominator = dx * dx + dz * dz;
          if (denominator < 0.00000001) return;
          const progress = THREE.MathUtils.clamp(((x - current.x) * dx + (z - current.z) * dz) / denominator, 0, 1);
          if (Math.hypot(current.x + dx * progress - x, current.z + dz * progress - z) < 0.00001) {
            sides.push(...(edge.supportSides || (edge.supportSide ? [edge.supportSide] : [])));
          }
        });
        return bearingVectorForSupportSides([...new Set(sides)], bearingDistance);
      };
      const boundaryCurves = groupFaceBoundaryCurves(topologyFace, nodes);
      const physicalWallSides = [...wallSides].filter((side) => (
        (roomMode ? WALL_SIDES : ['south', 'east', 'west']).includes(side)
      ));
      const isNorthVisibleRibExtrusionCell = Boolean(
        !roomMode
        && topologyFace.classification === 'CornerPerimeterCell'
        && wallSides.size === 2
        && wallSides.has('north')
        && (wallSides.has('east') || wallSides.has('west'))
        && !wallSides.has('south'),
      );
      const northVisibleTopologyRibCurve = isNorthVisibleRibExtrusionCell
        ? boundaryCurves.find((curve) => curve.kind === 'rib-seat' && curve.sourceId != null)
        : null;
      const northVisibleRibSourceId = northVisibleTopologyRibCurve?.sourceId == null
        ? null
        : String(northVisibleTopologyRibCurve.sourceId);
      // The topology boundary is already the closest visible, intersection-
      // bounded section of the physical rib. Never replace it with the entire
      // connected rib component: that includes the remote descending leg and
      // produces a hanging/twisted northward extrusion.
      const northVisibleRibProfile = northVisibleTopologyRibCurve?.points?.length >= 2
        ? northVisibleTopologyRibCurve.points.map((point) => new THREE.Vector3(point.x, point.y, point.z))
        : null;
      const usesNorthVisibleRibExtrusion = Boolean(
        isNorthVisibleRibExtrusionCell
        && northVisibleRibSourceId
        && northVisibleRibProfile?.length >= 2,
      );
      const northVisibleRibSourceIds = usesNorthVisibleRibExtrusion
        ? [northVisibleRibSourceId]
        : [];
      if (usesNorthVisibleRibExtrusion) {
        generatedNorthVisibleRibSides.add(wallSides.has('west') ? 'west' : 'east');
      }
      // Roof taxonomy is intentionally exhaustive: wall-contact cells are
      // wall-supported roofs, the north fan is the crown, and every remaining
      // cell is a 4-rib roof. Graph extraction can represent a 4-rib roof with
      // three or more seat curves, but all of them use consecutive rib-axis
      // intersections as their architectural boundary.
      const fourRibRoofCenterlineCandidate = touchesWallRib
        ? null
        : ribCenterlineIntersectionRegion(
          boundaryCurves,
          ribCenterlines,
          { anchorWallBoundary: false },
        );
      const fourRibBoundaryTolerance = Math.max(ribWidth, ribDepth) * groupScale * 2;
      const maximumRibHeight = rawSegments.reduce((maximum, segment) => Math.max(
        maximum,
        Number(segment.a?.y) || 0,
        Number(segment.b?.y) || 0,
      ), sideTop) + coverThickness + fourRibBoundaryTolerance;
      const fourRibRoofCenterlineCurves = fourRibRoofCenterlineCandidate?.every((curve) => (
        curve.points.every((point) => (
          Number.isFinite(point.x)
          && Number.isFinite(point.y)
          && Number.isFinite(point.z)
          && point.x >= roofWestX - fourRibBoundaryTolerance
          && point.x <= roofEastX + fourRibBoundaryTolerance
          && point.z >= roofNorthZ - fourRibBoundaryTolerance
          && point.z <= roofSouthZ + fourRibBoundaryTolerance
          && point.y >= sideTop - fourRibBoundaryTolerance
          && point.y <= maximumRibHeight
        ))
      ))
        ? fourRibRoofCenterlineCandidate
        : null;
      if (fourRibRoofCenterlineCandidate && !fourRibRoofCenterlineCurves) {
        group.userData.karbandiRejectedUnsafeFourRibBoundaryCount = (
          group.userData.karbandiRejectedUnsafeFourRibBoundaryCount || 0
        ) + 1;
      }
      const forcesPhysicalWallInnerReveal = Boolean(
        !usesNorthVisibleRibExtrusion
        && physicalWallSides.length === 1
        && ['EdgePerimeterCell', 'CornerPerimeterCell'].includes(topologyFace.classification),
      );
      let physicalRibProfilesExtendedToWall = 0;
      if (forcesPhysicalWallInnerReveal) {
        const supportSide = physicalWallSides[0];
        const wallDistance = (point) => (
          supportSide === 'south'
            ? Math.abs(point.z - roofSouthZ)
            : supportSide === 'north'
              ? Math.abs(point.z - roofNorthZ)
              : Math.abs(point.x - (supportSide === 'west' ? roofWestX : roofEastX))
        );
        boundaryCurves.forEach((curve) => {
          if (curve.kind !== 'rib-seat' || !/^\d+:[01]$/.test(String(curve.sourceId))) return;
          const ribId = String(curve.sourceId).split(':')[0];
          // Each rendered rib has two seating-side profiles. Select the one
          // facing this roof bay, rather than trusting the arbitrary side that
          // survived graph face extraction. This is the yellow interior edge:
          // right edge of the left rib and left edge of the right rib.
          const interiorCandidate = [`${ribId}:0`, `${ribId}:1`].map((sourceId) => {
            const sourceComponents = wallConnectedComponentsBySource.get(sourceId) || [];
            const best = sourceComponents.reduce((nearest, candidate) => {
              let points = candidate.flatMap((segment, index) => (
                index ? [segment.b] : [segment.a, segment.b]
              ));
              if (wallDistance(points[points.length - 1]) < wallDistance(points[0])) points = [...points].reverse();
              const sample = points[Math.min(points.length - 1, Math.max(1, Math.floor(points.length * 0.25)))];
              const distanceToBay = Math.hypot(
                sample.x - topologyFace.centroid.x,
                sample.z - topologyFace.centroid.z,
              );
              return !nearest || distanceToBay < nearest.distanceToBay
                ? { component: candidate, distanceToBay }
                : nearest;
            }, null);
            return best ? { sourceId, ...best } : null;
          }).filter(Boolean).sort((left, right) => left.distanceToBay - right.distanceToBay)[0];
          if (!interiorCandidate) return;
          curve.sourceId = interiorCandidate.sourceId;
          curve.interiorEdgeSelected = true;
          const components = wallConnectedComponentsBySource.get(interiorCandidate.sourceId) || [];
          const component = components.reduce((nearest, candidate) => {
            const candidatePoints = candidate.flatMap((segment, index) => (
              index ? [segment.b] : [segment.a, segment.b]
            ));
            const candidateDistance = Math.min(
              wallDistance(candidatePoints[0]),
              wallDistance(candidatePoints[candidatePoints.length - 1]),
            );
            return !nearest || candidateDistance < nearest.distance
              ? { component: candidate, distance: candidateDistance }
              : nearest;
          }, null)?.component;
          if (!component) return;
          let outerSeatingProfile = component.flatMap((segment, index) => (
            index ? [segment.b.clone()] : [segment.a.clone(), segment.b.clone()]
          ));
          if (wallDistance(outerSeatingProfile[outerSeatingProfile.length - 1]) < wallDistance(outerSeatingProfile[0])) {
            outerSeatingProfile = outerSeatingProfile.reverse();
          }
          const originalStart = curve.points[0];
          const originalEnd = curve.points[curve.points.length - 1];
          const originalBaseAtStart = originalStart.y <= originalEnd.y;
          const topNode = originalBaseAtStart ? originalEnd : originalStart;
          const originalTop = new THREE.Vector3(topNode.x, topNode.y, topNode.z);
          const ribIndex = Number(ribId);
          const seatingSide = Number(interiorCandidate.sourceId.split(':')[1]);
          const seatingOffset = (seatingSide === 0 ? -1 : 1)
            * (ribDepth / 2 + webOptions.seatingOffset);
          const renderedInnerCandidates = (visibleRibIntervals.get(ribIndex) || []).map((range) => (
            visibleCurveForRib(inner, range, ribIndex)
              .map((point) => transformRibPoint(point, ribAngles[ribIndex], seatingOffset))
          )).filter((points) => points.length >= 2);
          let profile = renderedInnerCandidates.reduce((nearest, candidate) => {
            const distance = Math.min(wallDistance(candidate[0]), wallDistance(candidate[candidate.length - 1]));
            return !nearest || distance < nearest.distance ? { points: candidate, distance } : nearest;
          }, null)?.points || outerSeatingProfile;
          if (wallDistance(profile[profile.length - 1]) < wallDistance(profile[0])) profile = [...profile].reverse();
          const connectsNorthWall = !roomMode && wallSides.has('north') && ['east', 'west'].includes(supportSide);
          // East/west perimeter bays terminate at the north interior wall.
          // Follow the complete rendered inner reveal to that plane instead
          // of stopping at the shortened topology fragment.
          let nearestTopIndex = 1;
          let nearestTopDistance = Number.POSITIVE_INFINITY;
          for (let index = 1; index < profile.length; index += 1) {
            const distance = connectsNorthWall
              ? Math.abs(profile[index].z - roofNorthZ)
              : profile[index].distanceToSquared(originalTop);
            if (distance < nearestTopDistance) {
              nearestTopDistance = distance;
              nearestTopIndex = index;
            }
          }
          profile = profile.slice(0, nearestTopIndex + 1);
          if (profile.length < 2) return;
          const boundaryOffset = webOptions.wallRoofBoundaryOffset;
          if (Math.abs(boundaryOffset) > 0.0000001) {
            profile = profile.map((point, index) => {
              const previous = profile[Math.max(0, index - 1)];
              const next = profile[Math.min(profile.length - 1, index + 1)];
              const tangentX = next.x - previous.x;
              const tangentZ = next.z - previous.z;
              const tangentLength = Math.hypot(tangentX, tangentZ);
              let normalX = tangentLength > 0.000001 ? -tangentZ / tangentLength : 0;
              let normalZ = tangentLength > 0.000001 ? tangentX / tangentLength : 0;
              if (
                (topologyFace.centroid.x - point.x) * normalX
                + (topologyFace.centroid.z - point.z) * normalZ < 0
              ) {
                normalX *= -1;
                normalZ *= -1;
              }
              return new THREE.Vector3(
                point.x + normalX * boundaryOffset,
                point.y,
                point.z + normalZ * boundaryOffset,
              );
            });
          }
          const base = profile[0];
          base.y = sideTop;
          if (supportSide === 'south') base.z = roofSouthZ;
          else if (supportSide === 'north') base.z = roofNorthZ;
          else base.x = supportSide === 'west' ? roofWestX : roofEastX;
          if (connectsNorthWall) {
            const northContact = profile[profile.length - 1];
            northContact.z = roofNorthZ;
            northContact.y = northArchHeightAtX(northContact.x);
            curve.northWallContactSnapped = true;
          }
          curve.points = originalBaseAtStart ? profile : [...profile].reverse();
          curve.wallBaseExtended = true;
          curve.wallBaseSupportSide = supportSide;
          physicalRibProfilesExtendedToWall += 1;
        });
        // Rebuild the red wall edge from the recovered yellow-profile bases.
        // Only the support curve moves; both yellow rib profiles retain their
        // actual physical seating-side coordinates.
        boundaryCurves.forEach((curve, index) => {
          if (curve.kind !== 'support') return;
          const previous = boundaryCurves[(index - 1 + boundaryCurves.length) % boundaryCurves.length];
          const next = boundaryCurves[(index + 1) % boundaryCurves.length];
          if (previous?.wallBaseExtended) {
            const point = previous.points[previous.points.length - 1];
            curve.points[0] = new THREE.Vector3(point.x, point.y, point.z);
          }
          if (next?.wallBaseExtended) {
            const point = next.points[0];
            curve.points[curve.points.length - 1] = new THREE.Vector3(point.x, point.y, point.z);
          }
        });
      }
      // Four-rib cells are defined by the intersections of the rib axes, not
      // by one arbitrary side of each rib band. The centerline cell is the
      // complete red-polyline region; the visible ribs subsequently cover the
      // portions of this roof panel that lie beneath their physical width.
      let centerlineRegionCurves = fourRibRoofCenterlineCurves;
      if (forcesPhysicalWallInnerReveal) centerlineRegionCurves = null;
      const usesPhysicalWallRibBoundary = Boolean(
        forcesPhysicalWallInnerReveal,
      );
      // A wall-connected perimeter roof is bounded by the visible rib sides
      // and by the segment between the points where those rib bases actually
      // meet the interior wall surface.  Replacing those curves with rib
      // centrelines moves both red-line endpoints inward and creates the large
      // triangular void seen beside the south bearing ribs.
      let perimeterCenterlineCurves = centerlineRegionCurves || usesPhysicalWallRibBoundary
        ? null
        : ribCenteredPerimeterRegion(boundaryCurves, ribCenterlines);
      let patchBoundaryCurves = centerlineRegionCurves || perimeterCenterlineCurves || boundaryCurves;
      let northVisibleRibWallProfile = null;
      if (usesNorthVisibleRibExtrusion) {
        // Use the closest complete visible rib section as the generating
        // profile. Project an identical section northward and terminate it on
        // the north interior wall plane; do not reshape it to the portal arch.
        const ribPoints = northVisibleRibProfile.map((point) => point.clone());
        const wallPoints = ribPoints.map((point) => new THREE.Vector3(
          THREE.MathUtils.clamp(point.x, roofWestX, roofEastX),
          point.y,
          roofNorthZ,
        ));
        northVisibleRibWallProfile = wallPoints;
        const supportMetadata = boundaryCurves.find((curve) => (
          curve.kind === 'support' && curve.supportSide === 'north'
        )) || { kind: 'support', supportSide: 'north', supportSides: ['north'], sourceId: 'north-wall-clip' };
        patchBoundaryCurves = [
          { ...supportMetadata, points: wallPoints },
          { kind: 'guide', sourceId: `north-rib-extrusion-end:${northVisibleRibSourceId}`, points: [wallPoints.at(-1), ribPoints.at(-1)] },
          { ...northVisibleTopologyRibCurve, points: [...ribPoints].reverse() },
          { kind: 'guide', sourceId: `north-rib-extrusion-start:${northVisibleRibSourceId}`, points: [ribPoints[0], wallPoints[0]] },
        ];
        perimeterCenterlineCurves = null;
      }
      const southCornerGuideCurve = boundaryCurves.find((curve) => (
        curve.kind === 'guide'
        && /^south-corner:(east|west)$/.test(String(curve.sourceId))
      ));
      const southCornerSide = String(southCornerGuideCurve?.sourceId || '').match(/^south-corner:(east|west)$/)?.[1] || null;
      if (southCornerGuideCurve) {
        // These two wall bays are generated by extruding the visible rib face.
        // Retain the physical seating edge; moving it back to the rib axis lets
        // the cover hide half of the rib when viewed from inside the portal.
        perimeterCenterlineCurves = null;
        patchBoundaryCurves = boundaryCurves;
      }
      const wallClipSides = new Set(wallSides);
      centerlineRegionCurves?.forEach((curve) => {
        if (curve.wallTopAnchoredStart && curve.wallTopAnchorSide) {
          wallClipSides.add(curve.wallTopAnchorSide);
        }
      });
      if (southCornerSide) {
        wallClipSides.add('south');
        wallClipSides.add(southCornerSide);
      }
      let patch = buildStructuredWebPatch(patchBoundaryCurves, {
        resolution: 8,
        courseWidth: ribDepth * groupScale,
      });
      if (!patch) return;
      if (usesNorthVisibleRibExtrusion) {
        patch.type = 'north-visible-rib-profile-extruded-to-wall';
        patch.wallStarted = true;
        patch.normalMode = 'visible-rib-profile-to-north-wall-surface-normal';
      }
      const isCrownRoof = !roomMode && patch.type === 'north-crown-sliced-inward-courses';
      const roofType = isCrownRoof
        ? 'crown'
        : (touchesWallRib ? 'wall-supported-roof' : '4-rib-roof');
      // A valid four-rib boundary can require the boundary-preserving polygon
      // fallback when its transfinite surface folds. The roof remains a
      // four-rib cell: only its triangulation changed, so its alternating
      // inward masonry must not fall back to plain/world-aligned infill.
      const usesFourRibBoundaryInfill = roofType === '4-rib-roof';
      if (usesFourRibBoundaryInfill) {
        const regionNormal = boundarySurfaceNormal(patchBoundaryCurves, patch.normals);
        patch.regionNormal = regionNormal;
        patch.normals = patch.vertices.map(() => regionNormal.clone());
        patch.normalMode = 'best-fit-four-rib-boundary-90-degree';
        patch.fourRibRegion = true;
        patch.regionCorners = patchBoundaryCurves.map((curve) => ({ ...curve.points[0] }));
      }
      // Structured interpolation can lift a perimeter patch's nominal support
      // row when adjacent rib curves do not share numerically identical end
      // samples. Re-seat only the support boundary on the architectural wall
      // top. Corner roofs are generated above and never pass through here.
      const wallAnchoredSupportVertices = new Set();
      let maximumUnanchoredWallGap = 0;
      const anchorPatchVertexToWall = (vertexIndex, supportSide) => {
        const vertex = patch.vertices[vertexIndex];
        if (!vertex || !supportSide) return;
        const before = { x: vertex.x, y: vertex.y, z: vertex.z };
        if (supportSide === 'south') {
          vertex.z = roofSouthZ;
          vertex.y = sideTop;
        } else if (supportSide === 'north') {
          vertex.z = roofNorthZ;
          vertex.y = roomMode ? sideTop : northArchHeightAtX(vertex.x);
        } else if (supportSide === 'west') {
          vertex.x = roofWestX;
          vertex.y = sideTop;
        } else if (supportSide === 'east') {
          vertex.x = roofEastX;
          vertex.y = sideTop;
        } else return;
        maximumUnanchoredWallGap = Math.max(
          maximumUnanchoredWallGap,
          Math.hypot(vertex.x - before.x, vertex.y - before.y, vertex.z - before.z),
        );
        wallAnchoredSupportVertices.add(vertexIndex);
      };
      patch.boundarySegments.forEach(({ a, b, metadata }) => {
        if (metadata?.kind !== 'support') return;
        const supportSides = metadata.supportSides?.length
          ? metadata.supportSides
          : [metadata.supportSide];
        supportSides.filter(Boolean).forEach((supportSide) => {
          anchorPatchVertexToWall(a, supportSide);
          anchorPatchVertexToWall(b, supportSide);
        });
      });
      const wallContinuationSide = roofType !== 'wall-supported-roof'
        ? null
        : usesNorthVisibleRibExtrusion
          ? (wallSides.has('west') ? 'west' : 'east')
        : wallSides.has('east')
          ? 'east'
          : wallSides.has('west')
            ? 'west'
            : wallSides.has('south')
              ? 'south'
            : wallSides.has('north')
              ? (roomMode ? 'north' : (topologyFace.centroid.x < centerX ? 'west' : 'east'))
                : null;
      const patchCenter = patch.vertices.reduce((result, vertex) => ({
        x: result.x + vertex.x / patch.vertices.length,
        z: result.z + vertex.z / patch.vertices.length,
      }), { x: 0, z: 0 });
      const topVertices = patch.vertices.map((vertex, index) => {
        const bearing = usesNorthVisibleRibExtrusion
          ? { x: 0, z: 0 }
          : bearingAtPoint(vertex.x, vertex.z);
        // Every four-rib centerline region extrudes along one best-fit surface
        // normal. This keeps recovered/split-boundary cells perpendicular to
        // their boundary surface and identical to ordinary four-rib cells.
        const normal = usesFourRibBoundaryInfill && patch.regionNormal
          ? patch.regionNormal
          : patch.normals[index];
        return {
          x: vertex.x + normal.x * coverThickness + bearing.x,
          y: vertex.y + normal.y * coverThickness,
          z: vertex.z + normal.z * coverThickness + bearing.z,
        };
      });
      topVertices.forEach((vertex) => {
        positions.push(vertex.x, vertex.y, vertex.z);
        uvs.push(vertex.x, vertex.z);
      });
      const bottomOffset = patch.vertices.length;
      patch.vertices.forEach((vertex) => {
        positions.push(vertex.x, vertex.y, vertex.z);
        uvs.push(vertex.x, vertex.z);
      });
      const indices = [];
      const addTriangle = (a, b, c) => {
        const ax = positions[a * 3]; const ay = positions[a * 3 + 1]; const az = positions[a * 3 + 2];
        const bx = positions[b * 3]; const by = positions[b * 3 + 1]; const bz = positions[b * 3 + 2];
        const cx = positions[c * 3]; const cy = positions[c * 3 + 1]; const cz = positions[c * 3 + 2];
        const ux = bx - ax; const uy = by - ay; const uz = bz - az;
        const vx = cx - ax; const vy = cy - ay; const vz = cz - az;
        const crossX = uy * vz - uz * vy;
        const crossY = uz * vx - ux * vz;
        const crossZ = ux * vy - uy * vx;
        if (crossX * crossX + crossY * crossY + crossZ * crossZ < 1e-18) return;
        indices.push(a, b, c);
      };
      patch.triangles.forEach(([a, b, c]) => {
        addTriangle(a, c, b);
        addTriangle(a + bottomOffset, b + bottomOffset, c + bottomOffset);
      });
      let ribFootFlangeCount = 0;
      let ribFootClosureOverlap = 0;
      const requiresWallSupportedRibOverlap = Boolean(
        [...wallSides].some((side) => (roomMode ? WALL_SIDES : ['south', 'east', 'west']).includes(side)),
      );
      const wallSupportedRibOverlap = requiresWallSupportedRibOverlap
        ? Math.max(ribWidth, ribDepth) * groupScale * 0.55
        : 0;
      patch.boundarySegments.forEach(({ a, b, metadata }) => {
        // Give the panel thickness its own vertices. Sharing these with the
        // top/bottom surfaces averages their normals around the perimeter and
        // makes the rib reveal look rounded or wavy from below.
        const sideStart = positions.length / 3;
        const currentNode = patch.vertices[a];
        const nextNode = patch.vertices[b];
        const currentTop = topVertices[a];
        const nextTop = topVertices[b];
        positions.push(
          currentTop.x, currentTop.y, currentTop.z,
          nextTop.x, nextTop.y, nextTop.z,
          currentNode.x, panelBottomY(currentNode), currentNode.z,
          nextNode.x, panelBottomY(nextNode), nextNode.z,
        );
        uvs.push(
          currentTop.x, currentTop.z,
          nextTop.x, nextTop.z,
          currentNode.x, currentNode.z,
          nextNode.x, nextNode.z,
        );
        addTriangle(sideStart, sideStart + 1, sideStart + 2);
        addTriangle(sideStart + 1, sideStart + 3, sideStart + 2);
        if (
          metadata?.kind !== 'rib-seat'
          || (webOptions.ribEmbedTolerance <= 0 && !requiresWallSupportedRibOverlap)
        ) return;
        const dx = nextNode.x - currentNode.x;
        const dz = nextNode.z - currentNode.z;
        const length = Math.hypot(dx, dz);
        if (length < 0.000001) return;
        let outwardX = dz / length;
        let outwardZ = -dx / length;
        const midpointX = (currentNode.x + nextNode.x) / 2;
        const midpointZ = (currentNode.z + nextNode.z) / 2;
        if ((patchCenter.x - midpointX) * outwardX + (patchCenter.z - midpointZ) * outwardZ > 0) {
          outwardX *= -1;
          outwardZ *= -1;
        }
        const wallContactTolerance = Math.max(0.0001, webOptions.wallEmbedTolerance * 2);
        const touchesWall = (point) => (
          Math.abs(point.x - roofWestX) <= wallContactTolerance
          || Math.abs(point.x - roofEastX) <= wallContactTolerance
          || Math.abs(point.z - roofNorthZ) <= wallContactTolerance
          || Math.abs(point.z - roofSouthZ) <= wallContactTolerance
        );
        const startAtWall = touchesWall(currentNode);
        const endAtWall = touchesWall(nextNode);
        const protectedFootOverlap = Math.min(
          Math.max(ribWidth, ribDepth) * groupScale * 0.62,
          Math.max(
            webOptions.ribEmbedTolerance + webOptions.wallEmbedTolerance,
            requiresWallSupportedRibOverlap
              ? wallSupportedRibOverlap
              : Math.min(ribWidth, ribDepth) * groupScale * 0.18,
          ),
        );
        const lateralOverlap = startAtWall || endAtWall
          ? protectedFootOverlap
          : Math.max(webOptions.ribEmbedTolerance, wallSupportedRibOverlap);
        const startOverlap = Math.min(
          length * 0.45,
          startAtWall ? protectedFootOverlap : webOptions.ribEmbedTolerance,
        );
        const endOverlap = Math.min(
          length * 0.45,
          endAtWall ? protectedFootOverlap : webOptions.ribEmbedTolerance,
        );
        const tangentX = dx / length;
        const tangentZ = dz / length;
        const startBottom = {
          x: currentNode.x - tangentX * startOverlap,
          y: currentNode.y,
          z: currentNode.z - tangentZ * startOverlap,
        };
        const endBottom = {
          x: nextNode.x + tangentX * endOverlap,
          y: nextNode.y,
          z: nextNode.z + tangentZ * endOverlap,
        };
        const startTop = {
          x: currentTop.x - tangentX * startOverlap,
          y: currentTop.y,
          z: currentTop.z - tangentZ * startOverlap,
        };
        const endTop = {
          x: nextTop.x + tangentX * endOverlap,
          y: nextTop.y,
          z: nextTop.z + tangentZ * endOverlap,
        };
        const offsetX = outwardX * lateralOverlap;
        const offsetZ = outwardZ * lateralOverlap;
        // A wall-supported rib seat can arrive with either polygon winding.
        // Extending the closure on only the inferred "outside" therefore
        // leaves a white wedge whenever that winding is reversed.  Span both
        // halves of the physical rib instead.  The strip remains completely
        // hidden by the rib, while its wall end is already seated on the wall
        // top above, so the wall/roof construction cannot open at this seam.
        const inwardX = requiresWallSupportedRibOverlap ? -offsetX : 0;
        const inwardZ = requiresWallSupportedRibOverlap ? -offsetZ : 0;
        if (startAtWall || endAtWall) {
          ribFootFlangeCount += 1;
          ribFootClosureOverlap = Math.max(ribFootClosureOverlap, protectedFootOverlap);
        }
        if (requiresWallSupportedRibOverlap) {
          ribFootFlangeCount += 1;
          ribFootClosureOverlap = Math.max(ribFootClosureOverlap, lateralOverlap);
        }
        const flangeStart = positions.length / 3;
        positions.push(
          startBottom.x + inwardX, startBottom.y, startBottom.z + inwardZ,
          endBottom.x + inwardX, endBottom.y, endBottom.z + inwardZ,
          startBottom.x + offsetX, startBottom.y, startBottom.z + offsetZ,
          endBottom.x + offsetX, endBottom.y, endBottom.z + offsetZ,
          startTop.x + inwardX, startTop.y, startTop.z + inwardZ,
          endTop.x + inwardX, endTop.y, endTop.z + inwardZ,
          startTop.x + offsetX, startTop.y, startTop.z + offsetZ,
          endTop.x + offsetX, endTop.y, endTop.z + offsetZ,
        );
        for (let uvIndex = 0; uvIndex < 8; uvIndex += 1) {
          const pointIndex = (positions.length / 3) - 8 + uvIndex;
          uvs.push(positions[pointIndex * 3], positions[pointIndex * 3 + 2]);
        }
        // Hidden soffit/top flanges plus their outer closure. The rib covers
        // these strips; the visible panel still terminates at the exact seat.
        addTriangle(flangeStart, flangeStart + 3, flangeStart + 1);
        addTriangle(flangeStart, flangeStart + 2, flangeStart + 3);
        addTriangle(flangeStart + 4, flangeStart + 5, flangeStart + 7);
        addTriangle(flangeStart + 4, flangeStart + 7, flangeStart + 6);
        addTriangle(flangeStart + 2, flangeStart + 6, flangeStart + 7);
        addTriangle(flangeStart + 2, flangeStart + 7, flangeStart + 3);
      });
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      if (wallContinuationSide && roomMode) {
        applyRoomWallContinuationBrickUvs(geometry, wallContinuationSide, centerX, centerZ);
      } else if (wallContinuationSide) applyWallContinuationBrickUvs(geometry, wallContinuationSide);
      else applyWorldAlignedBrickUvs(geometry);
      if (!wallContinuationSide && patch.brickMapping === 'offset-rib-courses' && patch.masonryUvs?.length === patch.vertices.length) {
        const geometryUvs = geometry.getAttribute('uv');
        patch.masonryUvs.forEach((uv, index) => {
          // Texture repeat is world-scaled, so these are real metre distances:
          // U follows the current offset rib and V advances one masonry course
          // inward toward the meeting line.
          geometryUvs.setXY(index, uv.u, uv.v);
          geometryUvs.setXY(index + bottomOffset, uv.u, uv.v);
        });
        geometryUvs.needsUpdate = true;
      }
      let fallbackFourRibCourseCount = 0;
      if (usesFourRibBoundaryInfill && patch.brickMapping !== 'offset-rib-courses') {
        const geometryUvs = geometry.getAttribute('uv');
        const courseWidth = Math.max(0.01, ribDepth * groupScale);
        const inwardDistances = [];
        const distanceToSegment = (point, start, end) => {
          const dx = end.x - start.x;
          const dy = end.y - start.y;
          const dz = end.z - start.z;
          const denominator = dx * dx + dy * dy + dz * dz;
          const progress = denominator > 0.00000001
            ? THREE.MathUtils.clamp(
              ((point.x - start.x) * dx + (point.y - start.y) * dy + (point.z - start.z) * dz) / denominator,
              0,
              1,
            )
            : 0;
          return Math.hypot(
            point.x - (start.x + dx * progress),
            point.y - (start.y + dy * progress),
            point.z - (start.z + dz * progress),
          );
        };
        let maximumInset = 0;
        patch.vertices.forEach((point, index) => {
          const inwardDistance = Math.min(...patch.boundarySegments.map(({ a, b }) => (
            distanceToSegment(point, patch.vertices[a], patch.vertices[b])
          )));
          maximumInset = Math.max(maximumInset, inwardDistance);
          inwardDistances[index] = inwardDistance;
        });
        fallbackFourRibCourseCount = Math.max(2, Math.floor(maximumInset / courseWidth));
        const inwardScale = maximumInset > 0.0000001
          ? fallbackFourRibCourseCount * courseWidth / maximumInset
          : 1;
        inwardDistances.forEach((inwardDistance, index) => {
          const mappedDistance = inwardDistance * inwardScale;
          geometryUvs.setXY(index, index * 0.001, mappedDistance);
          geometryUvs.setXY(index + bottomOffset, index * 0.001, mappedDistance);
        });
        geometryUvs.needsUpdate = true;
      }
      const requiresNorthWallClip = wallClipSides.has('north');
      const usesOffsetCourseBrickMaterial = (
        walls.karbandi.coverFinish === 'bricks'
        && (isCrownRoof || usesFourRibBoundaryInfill)
      );
      const panelBaseMaterial = isCrownRoof && walls.karbandi.coverFinish === 'bricks'
        ? crownBrickMaterial
        : usesOffsetCourseBrickMaterial
        ? inwardCourseBrickMaterial
        : wallContinuationSide
          ? wallContinuationMaterial(wallContinuationSide)
          : roofMaterial;
      const panelMaterial = wallClipSides.size ? panelBaseMaterial.clone() : panelBaseMaterial;
      if (requiresWallSupportedRibOverlap) {
        // The two mirrored south bays expose opposite faces of their hidden
        // wall-to-rib closure strips.  Keep both visible so neither portal
        // side can reveal the background through an otherwise closed mesh.
        panelMaterial.side = THREE.DoubleSide;
      }
      if (wallClipSides.size) {
        // The masonry remains physically embedded for bearing, while its
        // rendering is clipped to every selected inner wall face.
        const wallClippingPlanes = [];
        if (wallClipSides.has('north')) wallClippingPlanes.push(new THREE.Plane(new THREE.Vector3(0, 0, 1), -roofNorthZ));
        if (wallClipSides.has('south')) wallClippingPlanes.push(new THREE.Plane(new THREE.Vector3(0, 0, -1), roofSouthZ));
        if (wallClipSides.has('west')) wallClippingPlanes.push(new THREE.Plane(new THREE.Vector3(1, 0, 0), -roofWestX));
        if (wallClipSides.has('east')) wallClippingPlanes.push(new THREE.Plane(new THREE.Vector3(-1, 0, 0), roofEastX));
        panelMaterial.clippingPlanes = wallClippingPlanes;
        panelMaterial.clipIntersection = false;
        panelMaterial.clipShadows = true;
      }
      const panel = new THREE.Mesh(geometry, panelMaterial);
      panel.name = `Karbandi roof panel ${faceIndex + 1}`;
      panel.renderOrder = 1;
      panel.castShadow = true;
      panel.receiveShadow = true;
      panel.userData.wallSide = 'arch';
      panel.userData.isKarbandiCover = true;
      panel.userData.karbandiCoverFinish = walls.karbandi.coverFinish;
      panel.userData.karbandiRoofPanel = faceIndex;
      panel.userData.roofType = roofType;
      panel.userData.karbandiRoofCurved = true;
      panel.userData.karbandiRoofWallBay = touchesWallRib;
      panel.userData.karbandiRoofCornerWithoutCenter = omitsCenterAtCorner;
      panel.userData.karbandiRoofRaisedCenter = false;
      panel.userData.webSurfaceSubdivision = 8;
      panel.userData.webCellClassification = topologyFace.classification;
      panel.userData.webSupportSides = topologyFace.supportSides;
      panel.userData.northWallClipped = requiresNorthWallClip;
      panel.userData.wallClippedSides = [...wallClipSides];
      panel.userData.webPatchSolver = patch.type;
      panel.userData.northVisibleRibExtrusion = usesNorthVisibleRibExtrusion;
      panel.userData.northVisibleRibExtrusionAxis = usesNorthVisibleRibExtrusion ? 'visible-rib-to-north-wall:-world-z' : null;
      panel.userData.northVisibleRibSource = usesNorthVisibleRibExtrusion ? 'closest-visible-wall-supported-rib-section' : null;
      panel.userData.northVisibleRibClipMethod = usesNorthVisibleRibExtrusion
        ? 'closest-visible-rib-profile-extruded-north-and-clipped-by-north-wall'
        : null;
      panel.userData.northVisibleRibSourceIds = northVisibleRibSourceIds;
      panel.userData.northVisibleRibProfile = usesNorthVisibleRibExtrusion
        ? northVisibleRibProfile.map((point) => point.toArray())
        : [];
      panel.userData.northVisibleRibProfileExtent = usesNorthVisibleRibExtrusion
        ? 'closest-visible-topology-section-between-physical-intersections'
        : null;
      panel.userData.northVisibleRibWallProfile = usesNorthVisibleRibExtrusion
        ? northVisibleRibWallProfile.map((point) => point.toArray())
        : [];
      panel.userData.webPatchFallbackFrom = patch.replacedPatchType ?? null;
      panel.userData.webPatchReplacedInvertedTriangleCount = patch.replacedInvertedTriangleCount ?? 0;
      panel.userData.webPatchSurfaceVertexCount = patch.vertices.length;
      panel.userData.webPatchInvertedTriangleCount = patch.invertedTriangleCount;
      panel.userData.webInwardCourseCount = fallbackFourRibCourseCount || patch.courseCount || 0;
      panel.userData.webInwardCourseWidth = fallbackFourRibCourseCount
        ? Math.max(0.01, ribDepth * groupScale)
        : (patch.courseWidth ?? null);
      panel.userData.webSmallCellFallback = patch.smallCellFallback === true;
      panel.userData.webRegionNormal = patch.regionNormal?.toArray?.() || null;
      panel.userData.webRegionNormalMode = patch.normalMode || 'vertex-surface-normal';
      panel.userData.webExtrusionAngleDegrees = usesFourRibBoundaryInfill && patch.regionNormal ? 90 : null;
      panel.userData.webFourRibRegion = usesFourRibBoundaryInfill;
      panel.userData.webFourRibInfillRegion = usesFourRibBoundaryInfill;
      panel.userData.webFourRibBoundaryMode = centerlineRegionCurves
        ? 'four-rib-centerline-intersections-red-polyline'
        : null;
      panel.userData.webFourRibBoundaryRule = centerlineRegionCurves
        ? 'unified-four-centerline-intersections-all-cell-lengths'
        : null;
      panel.userData.webFourRibBoundaryFallback = usesFourRibBoundaryInfill && !centerlineRegionCurves
        ? (fourRibRoofCenterlineCandidate
          ? 'unsafe-centerline-solution-rejected-use-physical-seat-boundary'
          : 'no-finite-centerline-intersection-use-physical-seat-boundary')
        : null;
      panel.userData.webPerimeterRibBoundaryMode = perimeterCenterlineCurves
        ? 'rib-centerlines-with-wall-support-boundary'
        : (usesPhysicalWallRibBoundary
          ? 'physical-rib-sides-with-base-intersections-on-interior-wall-surface'
          : null);
      panel.userData.webPhysicalRibProfilesExtendedToWall = physicalRibProfilesExtendedToWall;
      panel.userData.webWallRoofRibEdgeSelection = usesPhysicalWallRibBoundary
        ? 'rendered-rib-inner-arch-reveal-facing-roof-bay'
        : null;
      panel.userData.wallRoofBoundaryOffset = usesPhysicalWallRibBoundary
        ? webOptions.wallRoofBoundaryOffset
        : null;
      panel.userData.wallRoofInnerRevealSides = usesPhysicalWallRibBoundary
        ? physicalWallSides
        : [];
      panel.userData.wallRoofNorthContact = usesPhysicalWallRibBoundary
        && wallSides.has('north')
        && physicalWallSides.some((side) => ['east', 'west'].includes(side))
        ? 'inner-rib-reveal-snapped-to-north-interior-arch-surface-after-offset'
        : null;
      panel.userData.webPerimeterWallBaseMode = usesPhysicalWallRibBoundary
        ? 'exact-physical-rib-base-intersections-with-interior-wall-surface'
        : (perimeterCenterlineCurves
          && perimeterCenterlineCurves.some((curve) => curve.wallBaseAnchoredStart)
          ? 'rib-side-centerline-intersection-with-wall-interior-top'
          : null);
      panel.userData.webPerimeterWallBaseAnchoredCorners = perimeterCenterlineCurves
        ? perimeterCenterlineCurves.filter((curve) => curve.wallBaseAnchoredStart).length
        : 0;
      panel.userData.webPerimeterWallBaseSupportSides = perimeterCenterlineCurves
        ? [...new Set(perimeterCenterlineCurves
          .filter((curve) => curve.wallBaseAnchoredStart && curve.wallBaseSupportSide)
          .map((curve) => curve.wallBaseSupportSide))]
        : [];
      panel.userData.webWallTopAnchoredCorners = centerlineRegionCurves
        ? centerlineRegionCurves.filter((curve) => curve.wallTopAnchoredStart).length
        : 0;
      panel.userData.webWallTopAnchorSides = centerlineRegionCurves
        ? [...new Set(centerlineRegionCurves
          .filter((curve) => curve.wallTopAnchoredStart && curve.wallTopAnchorSide)
          .map((curve) => curve.wallTopAnchorSide))]
        : [];
      panel.userData.webWallTopAnchorModes = centerlineRegionCurves
        ? [...new Set(centerlineRegionCurves
          .filter((curve) => curve.wallTopAnchoredStart && curve.wallTopAnchorMode)
          .map((curve) => curve.wallTopAnchorMode))]
        : [];
      panel.userData.webRegionCorners = patch.regionCorners?.map((point) => [point.x, point.y, point.z]) || [];
      panel.userData.webRegionBoundary = patch.regionBoundary?.map((point) => [point.x, point.y, point.z]) || [];
      panel.userData.roofBrickMapping = wallContinuationSide
        ? 'wall-continuation'
        : (isCrownRoof
          ? 'crown-inward-courses'
          : (usesFourRibBoundaryInfill ? 'offset-rib-courses' : (patch.brickMapping || 'world-aligned')));
      panel.userData.webInfillRule = usesFourRibBoundaryInfill ? 'four-rib-inward-courses' : null;
      panel.userData.wallContinuationSide = wallContinuationSide;
      panel.userData.wallContinuationPatternSide = wallContinuationSide;
      panel.userData.wallContinuationUAxis = roomMode
        ? wallContinuationSide === 'west'
          ? '+world-z'
          : wallContinuationSide === 'east'
            ? '-world-z'
            : wallContinuationSide === 'north'
              ? '-world-x'
              : '+world-x'
        : wallContinuationSide === 'west'
          ? '-world-z'
          : wallContinuationSide === 'east'
            ? '+world-z'
            : '+world-x';
      panel.userData.wallContinuationBondPhase = roomMode && wallContinuationSide
        ? roomInteriorBondPhase[wallContinuationSide]
        : null;
      panel.userData.wallContinuationBondCycle = roomMode && wallContinuationSide
        ? roomInteriorPerimeter
        : null;
      panel.userData.wallContinuationSeamlessAtWallTop = Boolean(roomMode && wallContinuationSide);
      panel.userData.wallContinuationClippedByRibs = Boolean(wallContinuationSide);
      panel.userData.wallContinuationCourseAxis = wallContinuationSide ? 'world-y' : null;
      panel.userData.wallContinuationFollowsCornerGuide = Boolean(southCornerGuideCurve);
      panel.userData.wallContinuationMethod = southCornerGuideCurve
        ? 'intersected-wall-directed-visible-rib-edge-extrusions'
        : (usesNorthVisibleRibExtrusion
          ? 'closest-visible-rib-profile-extruded-north-and-clipped-by-north-wall'
          : (wallContinuationSide ? 'bent-topology-patch' : null));
      panel.userData.southCornerGuideId = southCornerGuideCurve?.sourceId ?? null;
      panel.userData.southCornerGuideProfileConstraint = southCornerGuideCurve
        ? 'intersection-of-wall-directed-visible-rib-edge-extrusions'
        : null;
      panel.userData.southCornerRoofStartsAt = southCornerGuideCurve ? 'visible-rib-edge' : null;
      panel.userData.southCornerRoofClip = southCornerGuideCurve
        ? `inside-south-and-${southCornerSide}-wall-top-boundaries`
        : null;
      panel.userData.roofBrickHorizontalMortarOnly = usesOffsetCourseBrickMaterial;
      panel.userData.roofInfillBrickColor = usesOffsetCourseBrickMaterial ? webOptions.infillBrickColor : null;
      panel.userData.roofInfillBrickColor2 = usesOffsetCourseBrickMaterial ? webOptions.infillBrickColor2 : null;
      panel.userData.roofInfillBrickHeight = usesOffsetCourseBrickMaterial ? webOptions.infillBrickHeight : null;
      panel.userData.crownBoundaryVertexCount = patch.preservedBoundaryVertexCount ?? 0;
      panel.userData.crownCourseDistanceMode = patch.courseDistanceMode ?? null;
      panel.userData.crownSliceCount = patch.crownSliceCount ?? 0;
      panel.userData.webStartsAtWall = patch.wallStarted === true;
      panel.userData.webWallSupportAnchoredVertexCount = wallAnchoredSupportVertices.size;
      panel.userData.webWallSupportMaximumClosedGap = maximumUnanchoredWallGap;
      panel.userData.webWallSupportContact = wallAnchoredSupportVertices.size
        ? (roomMode ? 'exact-room-perimeter-wall-top' : 'exact-south-wall-top-or-north-arch-surface')
        : null;
      panel.userData.springingTangent = webOptions.springingTangent;
      panel.userData.hiddenGuideBoundaryCount = boundaryCurves.filter((curve) => curve.kind === 'guide').length;
      panel.userData.wallRoofGuide = southCornerGuideCurve
          ? 'south-corner-wall-extrusion-intersection'
        : !roomMode && wallSides.has('north')
          ? 'north-arch-curve'
          : (wallSides.size ? 'wall-leg-centerline' : null);
      panel.userData.springingAngle = webOptions.springingAngle;
      panel.userData.wallBearingDepth = webOptions.wallBearingDepth;
      panel.userData.roofThickness = coverThickness;
      panel.userData.wallEmbedTolerance = webOptions.wallEmbedTolerance;
      panel.userData.ribEmbedTolerance = webOptions.ribEmbedTolerance;
      panel.userData.ribEmbedApplied = webOptions.ribEmbedTolerance > 0;
      panel.userData.ribCrackClosure = 'hidden-mitered-seating-flange';
      panel.userData.ribFootFlangeCount = ribFootFlangeCount;
      panel.userData.ribFootClosureOverlap = ribFootClosureOverlap;
      panel.userData.wallSupportedRoofRibOverlap = wallSupportedRibOverlap;
      panel.userData.wallSupportedRoofRibClip = requiresWallSupportedRibOverlap
        ? 'continuous-hidden-two-sided-overlap-beneath-full-physical-rib'
        : null;
      panel.userData.wallSupportedRoofClosureSidedness = requiresWallSupportedRibOverlap
        ? 'double-sided-at-wall-to-rib-seam'
        : null;
      panel.userData.thicknessDirection = 'surface-normal';
      panel.userData.soffitTermination = webOptions.soffitTermination;
      if (topologyFace.classification === 'EdgePerimeterCell' && topologyFace.supportEdges.length) {
        const supportEdge = topologyFace.supportEdges[0];
        const supportA = nodes[supportEdge.a];
        const supportB = nodes[supportEdge.b];
        const guideStart = new THREE.Vector3(
          (supportA.x + supportB.x) / 2,
          (supportA.y + supportB.y) / 2,
          (supportA.z + supportB.z) / 2,
        );
        const targetId = face.reduce((best, id) => {
          const candidate = nodes[id];
          const bestNode = nodes[best];
          return Math.hypot(candidate.x - guideStart.x, candidate.z - guideStart.z)
            > Math.hypot(bestNode.x - guideStart.x, bestNode.z - guideStart.z) ? id : best;
        }, face[0]);
        const target = nodes[targetId];
        panel.userData.automaticPerimeterGuide = {
          start: [guideStart.x, guideStart.y, guideStart.z],
          target: [target.x, target.y, target.z],
          wallTangent: webOptions.springingTangent,
          interiorTangent: 'neighbouring-ribs',
          constraint: 'weighted',
        };
      }
      if (topologyFace.classification === 'UnsupportedCell') {
        panel.userData.warning = 'This cell has an unsupported perimeter edge. Select a wall, edge arch, beam, or springing boundary.';
      }
      group.add(panel);
      meshes.push(panel);
    });

    // Some valid rib-count/angle combinations merge the two small north
    // corner topology cells into the crown face. Recover each from the closest
    // complete visible rib section whose foot bears on that side wall, then
    // extrude that unchanged section northward to the wall clipping plane.
    const fallbackNorthVisibleRibProfile = (side) => {
      const wallX = side === 'west' ? roofWestX : roofEastX;
      const candidates = [];
      wallConnectedComponentsBySource.forEach((components, sourceId) => {
        if (!/^\d+:[01]$/.test(String(sourceId))) return;
        components.forEach((component) => {
          let points = component.flatMap((segment, index) => (
            index ? [segment.b.clone()] : [segment.a.clone(), segment.b.clone()]
          ));
          if (points.length < 3) return;
          const startDistance = Math.abs(points[0].x - wallX);
          const endDistance = Math.abs(points.at(-1).x - wallX);
          if (Math.min(startDistance, endDistance) > wallContactTolerance) return;
          if (endDistance < startDistance) points = points.reverse();
          const foot = points[0];
          const planLength = Math.max(...points.map((point) => Math.hypot(
            point.x - foot.x,
            point.z - foot.z,
          )));
          if (planLength < wallContactTolerance) return;
          const interiorScore = points.reduce((sum, point) => (
            sum + (side === 'west' ? point.x - roofWestX : roofEastX - point.x)
          ), 0) / points.length;
          candidates.push({
            sourceId: String(sourceId),
            ribId: String(sourceId).split(':')[0],
            points,
            northDistance: Math.abs(foot.z - roofNorthZ),
            interiorScore,
          });
        });
      });
      if (!candidates.length) return null;
      const firstRibDistance = Math.min(...candidates.map((candidate) => candidate.northDistance));
      return candidates
        .filter((candidate) => candidate.northDistance <= firstRibDistance + wallContactTolerance * 2)
        .sort((left, right) => right.interiorScore - left.interiorScore)[0] || null;
    };

    if (!roomMode) ['west', 'east'].forEach((side) => {
      if (generatedNorthVisibleRibSides.has(side)) return;
      const target = fallbackNorthVisibleRibProfile(side);
      if (!target) return;
      const ribPoints = target.points;
      const wallPoints = ribPoints.map((point) => new THREE.Vector3(
        THREE.MathUtils.clamp(point.x, roofWestX, roofEastX),
        point.y,
        roofNorthZ,
      ));
      const patch = buildStructuredWebPatch([
        { kind: 'support', supportSide: 'north', supportSides: ['north'], sourceId: 'north-wall-clip', points: wallPoints },
        { kind: 'guide', sourceId: `north-rib-extrusion-end:${target.sourceId}`, points: [wallPoints.at(-1), ribPoints.at(-1)] },
        { kind: 'rib-seat', sourceId: target.sourceId, points: [...ribPoints].reverse() },
        { kind: 'guide', sourceId: `north-rib-extrusion-start:${target.sourceId}`, points: [ribPoints[0], wallPoints[0]] },
      ], {
        resolution: 8,
        courseWidth: ribDepth * groupScale,
      });
      if (!patch) return;
      patch.type = 'north-visible-rib-profile-extruded-to-wall';
      patch.wallStarted = true;
      patch.normalMode = 'visible-rib-profile-to-north-wall-surface-normal';
      const positions = [];
      const uvs = [];
      const topVertices = patch.vertices.map((vertex, index) => {
        const normal = patch.normals[index];
        return new THREE.Vector3(
          vertex.x + normal.x * coverThickness,
          vertex.y + normal.y * coverThickness,
          vertex.z + normal.z * coverThickness,
        );
      });
      [...topVertices, ...patch.vertices].forEach((vertex) => {
        positions.push(vertex.x, vertex.y, vertex.z);
        uvs.push(vertex.x, vertex.z);
      });
      const bottomOffset = patch.vertices.length;
      const indices = [];
      const addTriangle = (a, b, c) => indices.push(a, b, c);
      patch.triangles.forEach(([a, b, c]) => {
        addTriangle(a, c, b);
        addTriangle(a + bottomOffset, b + bottomOffset, c + bottomOffset);
      });
      patch.boundarySegments.forEach(({ a, b }) => {
        addTriangle(a, b, a + bottomOffset);
        addTriangle(b, b + bottomOffset, a + bottomOffset);
      });
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      if (roomMode) applyRoomWallContinuationBrickUvs(geometry, side, centerX, centerZ);
      else applyWallContinuationBrickUvs(geometry, side);
      const material = wallContinuationMaterial(side).clone();
      material.side = THREE.DoubleSide;
      material.clippingPlanes = [
        new THREE.Plane(new THREE.Vector3(0, 0, 1), -roofNorthZ),
        side === 'west'
          ? new THREE.Plane(new THREE.Vector3(1, 0, 0), -roofWestX)
          : new THREE.Plane(new THREE.Vector3(-1, 0, 0), roofEastX),
      ];
      material.clipIntersection = false;
      material.clipShadows = true;
      const panel = new THREE.Mesh(geometry, material);
      panel.name = `Karbandi north ${side} wall-supported roof`;
      panel.renderOrder = 1;
      panel.castShadow = true;
      panel.receiveShadow = true;
      panel.userData = {
        wallSide: 'arch',
        isKarbandiCover: true,
        karbandiCoverFinish: walls.karbandi.coverFinish,
        karbandiRoofPanel: faces.length + (side === 'west' ? 0 : 1),
        roofType: 'wall-supported-roof',
        karbandiRoofCurved: true,
        karbandiRoofWallBay: true,
        karbandiRoofCornerWithoutCenter: true,
        karbandiRoofRaisedCenter: false,
        webSurfaceSubdivision: 8,
        webCellClassification: 'CornerPerimeterCell',
        webSupportSides: ['north', side],
        northWallClipped: true,
        wallClippedSides: ['north', side],
        webPatchSolver: patch.type,
        northVisibleRibExtrusion: true,
        northVisibleRibExtrusionAxis: 'visible-rib-to-north-wall:-world-z',
        northVisibleRibSource: 'closest-visible-wall-supported-rib-section',
        northVisibleRibClipMethod: 'closest-visible-rib-profile-extruded-north-and-clipped-by-north-wall',
        northVisibleRibSourceIds: [target.sourceId],
        northVisibleRibProfile: ribPoints.map((point) => point.toArray()),
        northVisibleRibProfileExtent: 'closest-visible-wall-connected-section-after-topology-merge',
        northVisibleRibWallProfile: wallPoints.map((point) => point.toArray()),
        webPatchSurfaceVertexCount: patch.vertices.length,
        webPatchInvertedTriangleCount: patch.invertedTriangleCount,
        webFourRibRegion: false,
        webFourRibInfillRegion: false,
        webStartsAtWall: true,
        webRegionNormalMode: patch.normalMode,
        roofBrickMapping: 'wall-continuation',
        wallContinuationSide: side,
        wallContinuationPatternSide: side,
        wallContinuationUAxis: side === 'west' ? '-world-z' : '+world-z',
        wallContinuationClippedByRibs: true,
        wallContinuationCourseAxis: 'world-y',
        wallContinuationFollowsCornerGuide: false,
        wallContinuationMethod: 'closest-visible-rib-profile-extruded-north-and-clipped-by-north-wall',
        wallRoofGuide: 'north-wall-clip-plane',
        roofThickness: coverThickness,
        thicknessDirection: 'surface-normal',
      };
      group.add(panel);
      meshes.push(panel);
      generatedNorthVisibleRibSides.add(side);
    });
  }
  return meshes;
}

function assignRadialShellMaterialGroups(geometry, centerX = 0, centerZ = 0) {
  const index = geometry.getIndex();
  const positions = geometry.getAttribute('position');
  const normals = geometry.getAttribute('normal');
  const triangleCount = (index ? index.count : positions.count) / 3;
  geometry.clearGroups();
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    let radialX = 0;
    let radialZ = 0;
    let normalX = 0;
    let normalZ = 0;
    for (let corner = 0; corner < 3; corner += 1) {
      const vertexIndex = index ? index.getX(triangle * 3 + corner) : triangle * 3 + corner;
      radialX += positions.getX(vertexIndex) - centerX;
      radialZ += positions.getZ(vertexIndex) - centerZ;
      normalX += normals.getX(vertexIndex);
      normalZ += normals.getZ(vertexIndex);
    }
    const radialDot = radialX * normalX + radialZ * normalZ;
    const materialIndex = radialDot > 0.000001 ? 0 : radialDot < -0.000001 ? 1 : 2;
    geometry.addGroup(triangle * 3, 3, materialIndex);
  }
  geometry.userData.radialShellExteriorMaterialIndex = 0;
  geometry.userData.radialShellInteriorMaterialIndex = 1;
  geometry.userData.radialShellReturnMaterialIndex = 2;
  geometry.userData.radialShellMaterialSplit = 'outward-normal-exterior-inward-normal-interior';
}

function polygonTubeSpringRingGeometry(apothem, tubeRadius, sideCount, profileSegments = 10) {
  const sides = Math.max(3, Math.round(Number(sideCount) || 8));
  const profileSides = Math.max(6, Math.round(Number(profileSegments) || 10));
  const centerApothem = Math.max(0.01, Number(apothem) || 1);
  const tube = Math.max(0.001, Number(tubeRadius) || 0.05);
  const vertexRadius = centerApothem / Math.cos(Math.PI / sides);
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let edgeIndex = 0; edgeIndex < sides; edgeIndex += 1) {
    const angle = edgeIndex * Math.PI * 2 / sides - Math.PI / sides;
    const radialX = Math.sin(angle);
    const radialZ = Math.cos(angle);
    const centerX = radialX * vertexRadius;
    const centerZ = radialZ * vertexRadius;
    for (let profileIndex = 0; profileIndex < profileSides; profileIndex += 1) {
      const profileAngle = profileIndex * Math.PI * 2 / profileSides;
      const radialOffset = Math.cos(profileAngle) * tube;
      positions.push(
        centerX + radialX * radialOffset,
        Math.sin(profileAngle) * tube,
        centerZ + radialZ * radialOffset,
      );
      uvs.push(edgeIndex / sides, profileIndex / profileSides);
    }
  }
  const vertex = (edgeIndex, profileIndex) => (
    (edgeIndex % sides) * profileSides + (profileIndex % profileSides)
  );
  for (let edgeIndex = 0; edgeIndex < sides; edgeIndex += 1) {
    for (let profileIndex = 0; profileIndex < profileSides; profileIndex += 1) {
      const current = vertex(edgeIndex, profileIndex);
      const nextEdge = vertex(edgeIndex + 1, profileIndex);
      const nextProfile = vertex(edgeIndex, profileIndex + 1);
      const nextBoth = vertex(edgeIndex + 1, profileIndex + 1);
      indices.push(current, nextBoth, nextEdge, current, nextProfile, nextBoth);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.userData.roomDomeRingFootprint = 'polygon';
  geometry.userData.roomDomeRingSideCount = sides;
  geometry.userData.roomDomeRingCenterlineApothem = centerApothem;
  geometry.userData.roomDomeRingProfile = 'circle';
  geometry.userData.roomDomeRingProfileSegments = profileSides;
  geometry.userData.roomDomeRingTubeRadius = tube;
  geometry.userData.roomDomeRingAlignment = 'polygon-centerline-at-cover-base-with-circular-tube-profile';
  return geometry;
}

function applyRoomWallContinuationBrickUvs(geometry, supportSide, centerX, centerZ) {
  const positions = geometry.getAttribute('position');
  const uvs = geometry.getAttribute('uv');
  if (!positions || !uvs) return geometry;
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const z = positions.getZ(index);
    const horizontal = supportSide === 'south'
      ? x - centerX
      : supportSide === 'north'
        ? centerX - x
        : supportSide === 'east'
          ? centerZ - z
          : z - centerZ;
    uvs.setXY(index, horizontal, positions.getY(index));
  }
  uvs.needsUpdate = true;
  geometry.userData.roomWallContinuationUvMapping = 'same-local-horizontal-axis-and-world-y-as-connected-room-wall';
  return geometry;
}

function roomDomeTransitionGeometry({
  centerX,
  centerZ,
  width,
  depth,
  wallTop,
  springY,
  domeRadius,
  type,
  settings = {},
}) {
  const angularSegments = type === 'squinch'
    ? Math.round(THREE.MathUtils.clamp(Number(settings.facetCount) || 8, 4, 32))
    : 64;
  const verticalSegments = type === 'squinch'
    ? Math.round(THREE.MathUtils.clamp(Number(settings.tierCount) || 1, 1, 8))
    : type === 'muqarnas'
      ? Math.round(THREE.MathUtils.clamp(Number(settings.courseCount) || 6, 3, 16))
      : type === 'pendentive'
        ? Math.round(THREE.MathUtils.clamp(Number(settings.subdivisions) || 10, 3, 32))
        : 10;
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let ring = 0; ring <= verticalSegments; ring += 1) {
    const t = ring / verticalSegments;
    const smoothT = type === 'pendentive'
      ? Math.sin(t * Math.PI / 2) ** THREE.MathUtils.clamp(Number(settings.curvature) || 1.45, 0.35, 3)
      : type === 'karbandi'
        ? t * t * (3 - 2 * t)
        : type === 'muqarnas'
          ? Math.ceil(t * verticalSegments) / verticalSegments
          : t;
    const y = THREE.MathUtils.lerp(wallTop, springY, t);
    for (let segment = 0; segment <= angularSegments; segment += 1) {
      const angle = (segment / angularSegments) * Math.PI * 2;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const boundaryRadius = Math.min(
        Math.abs(cos) < 0.000001 ? Infinity : halfWidth / Math.abs(cos),
        Math.abs(sin) < 0.000001 ? Infinity : halfDepth / Math.abs(sin),
      );
      const radialDistance = THREE.MathUtils.lerp(boundaryRadius, domeRadius, smoothT);
      positions.push(
        centerX + cos * radialDistance,
        y,
        centerZ + sin * radialDistance,
      );
      uvs.push(segment / angularSegments, t);
    }
  }
  const row = angularSegments + 1;
  for (let ring = 0; ring < verticalSegments; ring += 1) {
    for (let segment = 0; segment < angularSegments; segment += 1) {
      const lowerLeft = ring * row + segment;
      const lowerRight = lowerLeft + 1;
      const upperLeft = lowerLeft + row;
      const upperRight = upperLeft + 1;
      indices.push(lowerLeft, upperLeft, lowerRight, lowerRight, upperLeft, upperRight);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function squinchArchBandGeometry({
  halfSpan,
  springY,
  crownY,
  ribWidth,
  ribDepth,
  legExtension = 0,
  settings,
}) {
  const designGreenHeight = springY + (Number.isFinite(Number(settings.greenHeightOffset))
    ? Number(settings.greenHeightOffset)
    : 0.6);
  let centerline = archCurve(
    0,
    halfSpan,
    springY,
    springY,
    Math.max(0.05, Number(settings.greenOffset) || 0.8),
    designGreenHeight,
    32,
    {
      redOffset: Number.isFinite(Number(settings.redOffset)) ? Number(settings.redOffset) : -0.45,
    },
  );
  if (centerline.length < 3) {
    centerline = Array.from({ length: 65 }, (_, index) => {
      const x = THREE.MathUtils.lerp(-halfSpan, halfSpan, index / 64);
      return new THREE.Vector2(x, springY + (crownY - springY) * Math.sqrt(Math.max(0, 1 - (x / halfSpan) ** 2)));
    });
  }
  const sourceBaseY = Math.min(centerline[0].y, centerline.at(-1).y);
  const sourceCrownY = Math.max(...centerline.map((point) => point.y));
  const sourceRise = Math.max(0.001, sourceCrownY - sourceBaseY);
  centerline = centerline.map((point) => new THREE.Vector2(
    point.x,
    springY + (point.y - sourceBaseY) * (crownY - springY) / sourceRise,
  ));
  const downwardExtension = Math.max(0, Number(legExtension) || 0);
  if (downwardExtension > 0.000001) {
    centerline = [
      new THREE.Vector2(centerline[0].x, centerline[0].y - downwardExtension),
      ...centerline,
      new THREE.Vector2(centerline.at(-1).x, centerline.at(-1).y - downwardExtension),
    ];
  }
  const offsetPolyline = (distance) => centerline.map((point, index) => {
    const previous = centerline[Math.max(0, index - 1)];
    const next = centerline[Math.min(centerline.length - 1, index + 1)];
    const tangent = next.clone().sub(previous).normalize();
    return point.clone().add(new THREE.Vector2(-tangent.y, tangent.x).multiplyScalar(distance));
  });
  const outer = offsetPolyline(ribWidth / 2);
  const inner = offsetPolyline(-ribWidth / 2);
  const shape = new THREE.Shape();
  shape.moveTo(outer[0].x, outer[0].y);
  outer.slice(1).forEach((point) => shape.lineTo(point.x, point.y));
  [...inner].reverse().forEach((point) => shape.lineTo(point.x, point.y));
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: ribDepth,
    bevelEnabled: false,
    curveSegments: 1,
    steps: 1,
  });
  geometry.translate(0, 0, -ribDepth / 2);
  geometry.computeVertexNormals();
  geometry.userData.squinchArchProfile = centerline.map((point) => point.toArray());
  geometry.userData.squinchArchOuterProfile = outer.map((point) => point.toArray());
  geometry.userData.squinchArchInnerProfile = inner.map((point) => point.toArray());
  geometry.userData.squinchArchProfileComplete = true;
  geometry.userData.squinchArchLegExtension = downwardExtension;
  return geometry;
}

function squinchCornerFanGeometry({
  innerMeetingProfile,
  innerProfile,
  outerMeetingProfile,
  outerProfile,
  courseSide = null,
  courseCenterX = 0,
  courseCenterZ = 0,
  wallSeatOverlap = 0,
}) {
  const positions = [];
  const uvs = [];
  const indices = [];
  const triangleMaterialIndices = [];
  const addTriangles = (materialIndex, ...triangleIndices) => {
    for (let index = 0; index < triangleIndices.length; index += 3) {
      indices.push(...triangleIndices.slice(index, index + 3));
      triangleMaterialIndices.push(materialIndex);
    }
  };
  const profileDistance = innerProfile.map((_, index) => (
    index === 0 ? 0 : innerProfile[index].distanceTo(innerProfile[index - 1])
  ));
  for (let index = 1; index < profileDistance.length; index += 1) {
    profileDistance[index] += profileDistance[index - 1];
  }
  const wallCourseUv = (point, fallbackU, fallbackV) => {
    if (!courseSide) return [fallbackU, fallbackV];
    if (courseSide === 'north') return [-(point.x - courseCenterX), point.y];
    if (courseSide === 'south') return [point.x - courseCenterX, point.y];
    if (courseSide === 'east') return [-(point.z - courseCenterZ), point.y];
    return [point.z - courseCenterZ, point.y];
  };
  const addVertex = (point, u, v) => {
    positions.push(point.x, point.y, point.z);
    uvs.push(...wallCourseUv(point, u, v));
    return positions.length / 3 - 1;
  };
  const seatProfile = (profile) => profile.map((point, index) => {
    const seated = point.clone();
    if (index === 0) seated.y -= Math.max(0, wallSeatOverlap);
    return seated;
  });
  const renderedInnerProfile = seatProfile(innerProfile);
  const renderedInnerMeetingProfile = seatProfile(innerMeetingProfile);
  const renderedOuterProfile = seatProfile(outerProfile);
  const renderedOuterMeetingProfile = seatProfile(outerMeetingProfile);
  const innerCurve = renderedInnerProfile.map((point, index) => addVertex(point, profileDistance[index], 0));
  const innerMeeting = renderedInnerMeetingProfile.map((point, index) => addVertex(point, profileDistance[index], 1));
  const outerCurve = renderedOuterProfile.map((point, index) => addVertex(point, profileDistance[index], 0));
  const outerMeeting = renderedOuterMeetingProfile.map((point, index) => addVertex(point, profileDistance[index], 1));
  for (let index = 0; index < innerProfile.length - 1; index += 1) {
    // Room-facing ruled vault between the inner arch edge and the curved
    // groin intersection.
    addTriangles(0,
      innerMeeting[index], innerCurve[index], innerCurve[index + 1],
      innerMeeting[index], innerCurve[index + 1], innerMeeting[index + 1],
    );
    // Matching exterior face and the two thickness closures.
    addTriangles(1,
      outerMeeting[index], outerCurve[index + 1], outerCurve[index],
      outerMeeting[index], outerMeeting[index + 1], outerCurve[index + 1],
    );
    addTriangles(2,
      innerCurve[index], outerCurve[index], innerCurve[index + 1],
      innerCurve[index + 1], outerCurve[index], outerCurve[index + 1],
      innerMeeting[index], innerMeeting[index + 1], outerMeeting[index],
      innerMeeting[index + 1], outerMeeting[index + 1], outerMeeting[index],
    );
  }
  // Close the wall-top edge between the projected inner-edge intersection and
  // the arch leg. The crown closes naturally because both ruled boundaries
  // terminate at the same apex.
  addTriangles(2,
    innerMeeting[0], outerMeeting[0], innerCurve[0],
    innerCurve[0], outerMeeting[0], outerCurve[0],
  );
  const indexedGeometry = new THREE.BufferGeometry();
  indexedGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  indexedGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  const nonDegenerateIndices = [];
  const nonDegenerateMaterialIndices = [];
  const triangleA = new THREE.Vector3();
  const triangleB = new THREE.Vector3();
  const triangleC = new THREE.Vector3();
  for (let index = 0; index < indices.length; index += 3) {
    const a = indices[index];
    const b = indices[index + 1];
    const c = indices[index + 2];
    triangleA.fromArray(positions, a * 3);
    triangleB.fromArray(positions, b * 3);
    triangleC.fromArray(positions, c * 3);
    if (triangleB.clone().sub(triangleA).cross(triangleC.clone().sub(triangleA)).lengthSq() > 0.000000000001) {
      nonDegenerateIndices.push(a, b, c);
      nonDegenerateMaterialIndices.push(triangleMaterialIndices[index / 3]);
    }
  }
  indexedGeometry.setIndex(nonDegenerateIndices);
  // Face vertices must not share averaged normals across the room-facing
  // vault, exterior skin, and thickness closures. Those opposing normals can
  // cancel at the wall seat and render the underside as a black strip.
  const geometry = indexedGeometry.toNonIndexed();
  indexedGeometry.dispose();
  geometry.computeVertexNormals();
  geometry.clearGroups();
  nonDegenerateMaterialIndices.forEach((materialIndex, triangle) => {
    geometry.addGroup(triangle * 3, 3, materialIndex);
  });
  geometry.userData.roomSquinchCornerRoofInteriorMaterialIndex = 0;
  geometry.userData.roomSquinchCornerRoofExteriorMaterialIndex = 1;
  geometry.userData.roomSquinchCornerRoofReturnMaterialIndex = 2;
  geometry.userData.roomSquinchCornerRoofMeetingCurve = innerMeetingProfile.map((point) => point.toArray());
  geometry.userData.roomSquinchCornerRoofMeetingLine = null;
  geometry.userData.roomSquinchCornerRoofThicknessVector = outerMeetingProfile[0].clone().sub(innerMeetingProfile[0]).toArray();
  geometry.userData.roomSquinchCornerRoofThicknessDirection = 'plan-to-room-wall-exterior-not-downward-y';
  geometry.userData.roomSquinchCornerRoofIntersectionMethod = 'curved-groin-from-exact-shared-room-interior-corner';
  geometry.userData.roomSquinchCornerRoofWallSeatOverlap = Math.max(0, wallSeatOverlap);
  geometry.userData.roomSquinchCornerRoofNormalMode = 'non-indexed-flat-face-normals-no-inward-cancellation';
  geometry.userData.roomSquinchCornerRoofCourseSide = courseSide;
  geometry.userData.roomSquinchCornerRoofCourseMapping = courseSide
    ? 'world-y-and-adjoining-wall-longitudinal-axis'
    : 'fan-distance';
  return geometry;
}

function squinchWallArchInfillGeometry({ profile, wallTop, ribWidth, depth }) {
  const usableProfile = profile.map((point) => new THREE.Vector2(
    point.x,
    Math.max(wallTop, point.y - ribWidth / 2),
  ));
  const shape = new THREE.Shape();
  shape.moveTo(usableProfile[0].x, wallTop);
  usableProfile.forEach((point) => shape.lineTo(point.x, point.y));
  shape.lineTo(usableProfile.at(-1).x, wallTop);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.01, depth),
    bevelEnabled: false,
    curveSegments: 1,
    steps: 1,
  });
  geometry.translate(0, 0, -Math.max(0.01, depth) / 2);
  geometry.computeVertexNormals();
  applyWorldAlignedBrickUvs(geometry);
  const index = geometry.getIndex();
  const normals = geometry.getAttribute('normal');
  const triangleCount = (index ? index.count : normals.count) / 3;
  geometry.clearGroups();
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    let normalZ = 0;
    for (let corner = 0; corner < 3; corner += 1) {
      const vertexIndex = index ? index.getX(triangle * 3 + corner) : triangle * 3 + corner;
      normalZ += normals.getZ(vertexIndex);
    }
    normalZ /= 3;
    // The panel uses the exact rotation of its connected lower wall. Its
    // negative-Z cap is therefore the Room interior face and its positive-Z
    // cap is the exterior face, matching the structural wall convention.
    const materialIndex = normalZ < -0.5 ? 0 : normalZ > 0.5 ? 1 : 2;
    geometry.addGroup(triangle * 3, 3, materialIndex);
  }
  geometry.userData.directRoomWallFaceMaterials = true;
  geometry.userData.roomWallInteriorMaterialIndex = 0;
  geometry.userData.roomWallExteriorMaterialIndex = 1;
  geometry.userData.roomWallReturnMaterialIndex = 2;
  geometry.userData.roomSquinchWallFaceBondMapping = 'exact-connected-room-wall-interior-and-exterior';
  return geometry;
}

function squinchVerticalArchSpandrelGeometry({ profile, fullHalfSpan, wallTop, topY, depth }) {
  const archProfile = [...profile].sort((a, b) => a.x - b.x);
  const leftSpringTop = Math.max(wallTop, archProfile[0]?.y ?? wallTop);
  const rightSpringTop = Math.max(wallTop, archProfile.at(-1)?.y ?? wallTop);
  const orderedProfile = [
    // Continue the arch's upper edge horizontally to the shared polygon
    // joints. Dropping these endpoints to wallTop creates the small wedges
    // below the rib that should remain open.
    new THREE.Vector2(-fullHalfSpan, leftSpringTop),
    ...archProfile,
    new THREE.Vector2(fullHalfSpan, rightSpringTop),
  ];
  const shape = new THREE.Shape();
  shape.moveTo(orderedProfile[0].x, topY);
  shape.lineTo(orderedProfile.at(-1).x, topY);
  [...orderedProfile].reverse().forEach((point) => shape.lineTo(point.x, Math.min(topY, point.y)));
  shape.closePath();
  const panelDepth = Math.max(0.01, depth);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: panelDepth,
    bevelEnabled: false,
    curveSegments: 1,
    steps: 1,
  });
  geometry.translate(0, 0, -panelDepth / 2);
  // The room-facing octagon is already continuous. Extend only the exterior
  // face to the true 22.5-degree miter vertices so adjacent 45-degree panels
  // share a solid corner instead of leaving triangular daylight gaps.
  const exteriorMiter = panelDepth * 0.5 * Math.tan(Math.PI / 8);
  const positions = geometry.getAttribute('position');
  for (let index = 0; index < positions.count; index += 1) {
    if (positions.getZ(index) < -0.000001) {
      const x = positions.getX(index);
      // Extend only the two octagon joint edges to their exterior miter
      // vertices. Scaling the complete exterior face also stretches the arch
      // cutout, pulling its brick boundary away from the actual rib and
      // exposing the corner-roof surface through triangular gaps.
      if (Math.abs(Math.abs(x) - fullHalfSpan) <= 0.00001) {
        positions.setX(index, x + Math.sign(x || 1) * exteriorMiter);
      }
    }
  }
  positions.needsUpdate = true;
  const uvs = geometry.getAttribute('uv');
  for (let index = 0; index < positions.count; index += 1) {
    if (positions.getZ(index) < -0.000001) {
      // The octagonal exterior is a set of vertical planar faces. Rebuild its
      // coordinates directly from face X and world-height Y after the corner
      // miter edit; retaining ExtrudeGeometry's pre-miter UVs bends and skews
      // otherwise straight running courses.
      uvs.setXY(index, positions.getX(index), positions.getY(index));
    }
  }
  uvs.needsUpdate = true;
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.computeVertexNormals();
  geometry.userData.roomSquinchVerticalSpandrelProfile = orderedProfile.map((point) => point.toArray());
  geometry.userData.roomSquinchVerticalSpandrelTopY = topY;
  geometry.userData.roomSquinchVerticalSpandrelBottomBoundary = 'actual-rib-outer-profile-with-spring-top-joint-extensions';
  geometry.userData.roomSquinchExteriorMiter = exteriorMiter;
  geometry.userData.roomSquinchExteriorHalfSpan = fullHalfSpan + exteriorMiter;
  geometry.userData.roomSquinchExteriorJoint = 'shared-45-degree-octagon-miter-no-gap';
  geometry.userData.roomSquinchExteriorArchBoundary = 'unscaled-rib-outer-profile-with-mitered-joint-side-infill';
  geometry.userData.roomSquinchExteriorBrickMapping = 'planar-face-x-and-world-y-straight-courses';
  return geometry;
}

function roomKarbandiFrustumWallGeometry({
  bottomOuterStart,
  bottomOuterEnd,
  bottomInnerStart,
  bottomInnerEnd,
  topOuterStart,
  topOuterEnd,
  topInnerStart,
  topInnerEnd,
  bottomY,
  topY,
  phase,
  edgeLength,
  includeEndFaces = false,
}) {
  const vertices = [
    bottomOuterStart.clone().setY(bottomY),
    bottomOuterEnd.clone().setY(bottomY),
    bottomInnerEnd.clone().setY(bottomY),
    bottomInnerStart.clone().setY(bottomY),
    topOuterStart.clone().setY(topY),
    topOuterEnd.clone().setY(topY),
    topInnerEnd.clone().setY(topY),
    topInnerStart.clone().setY(topY),
  ];
  const indexedGeometry = new THREE.BufferGeometry();
  indexedGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices.flatMap((point) => point.toArray()), 3));
  indexedGeometry.setAttribute('uv', new THREE.Float32BufferAttribute([
    phase, bottomY,
    phase + edgeLength, bottomY,
    phase + edgeLength, bottomY,
    phase, bottomY,
    phase, topY,
    phase + edgeLength, topY,
    phase + edgeLength, topY,
    phase, topY,
  ], 2));
  const indices = [
    0, 1, 5, 0, 5, 4,
    2, 3, 7, 2, 7, 6,
    4, 6, 5, 4, 7, 6,
  ];
  if (includeEndFaces) {
    indices.push(
      0, 4, 7, 0, 7, 3,
      1, 2, 6, 1, 6, 5,
    );
  }
  indexedGeometry.setIndex(indices);
  const geometry = indexedGeometry.toNonIndexed();
  const positions = geometry.getAttribute('position');
  const uvs = geometry.getAttribute('uv');
  const outerDirection = bottomOuterEnd.clone().sub(bottomOuterStart).setY(0).normalize();
  const outerMidpoint = bottomOuterStart.clone().add(bottomOuterEnd).multiplyScalar(0.5);
  const inward = new THREE.Vector3(-outerDirection.z, 0, outerDirection.x);
  if (inward.dot(new THREE.Vector3(
    (bottomInnerStart.x + bottomInnerEnd.x) / 2 - outerMidpoint.x,
    0,
    (bottomInnerStart.z + bottomInnerEnd.z) / 2 - outerMidpoint.z,
  )) < 0) inward.negate();
  for (let vertex = Math.max(0, positions.count - 6); vertex < positions.count; vertex += 1) {
    const point = new THREE.Vector3().fromBufferAttribute(positions, vertex);
    const fromOuterStart = point.clone().sub(bottomOuterStart).setY(0);
    uvs.setXY(
      vertex,
      phase + fromOuterStart.dot(outerDirection),
      fromOuterStart.dot(inward),
    );
  }
  uvs.needsUpdate = true;
  geometry.userData.roomKarbandiOctagonTopMapping = 'plan-view-running-brick-course-across-wall-thickness';
  geometry.computeVertexNormals();
  return geometry;
}

function roomKarbandiMiteredOpeningWallGeometry({
  shape,
  outerStart,
  outerEnd,
  innerStart,
  innerEnd,
  inward,
  thickness,
  bottomY,
  phase,
  baseEmbed = 0,
  includeEndFaces = false,
}) {
  const edge = outerEnd.clone().sub(outerStart).setY(0);
  const edgeLength = Math.max(0.000001, edge.length());
  const direction = edge.divideScalar(edgeLength);
  const safeThickness = Math.max(0.000001, thickness);
  const innerStartU = innerStart.clone().sub(outerStart).dot(direction);
  const innerEndU = innerEnd.clone().sub(outerStart).dot(direction);
  const extrudedGeometry = new THREE.ExtrudeGeometry(shape, {
    depth: safeThickness,
    bevelEnabled: false,
    curveSegments: 36,
    steps: 1,
  });
  const sourcePositions = extrudedGeometry.getAttribute('position');
  const sourceUvs = extrudedGeometry.getAttribute('uv');
  let maximumLocalY = -Infinity;
  for (let index = 0; index < sourcePositions.count; index += 1) {
    maximumLocalY = Math.max(maximumLocalY, sourcePositions.getY(index));
  }
  const retainedPositions = [];
  const retainedUvs = [];
  const retainedTopFlags = [];
  for (let triangle = 0; triangle < sourcePositions.count; triangle += 3) {
    const localXs = [0, 1, 2].map((offset) => sourcePositions.getX(triangle + offset));
    const localYs = [0, 1, 2].map((offset) => sourcePositions.getY(triangle + offset));
    const isInternalStartCap = localXs.every((x) => Math.abs(x) <= 0.000001);
    const isInternalEndCap = localXs.every((x) => Math.abs(x - edgeLength) <= 0.000001);
    const isSupportingWallJointCap = localYs.every((y) => Math.abs(y) <= 0.000001);
    const isTopCap = localYs.every((y) => Math.abs(y - maximumLocalY) <= 0.000001);
    if ((!includeEndFaces && (isInternalStartCap || isInternalEndCap)) || isSupportingWallJointCap) continue;
    for (let offset = 0; offset < 3; offset += 1) {
      const sourceIndex = triangle + offset;
      retainedPositions.push(
        sourcePositions.getX(sourceIndex),
        sourcePositions.getY(sourceIndex),
        sourcePositions.getZ(sourceIndex),
      );
      retainedUvs.push(sourceUvs.getX(sourceIndex), sourceUvs.getY(sourceIndex));
      retainedTopFlags.push(isTopCap);
    }
  }
  extrudedGeometry.dispose();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(retainedPositions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(retainedUvs, 2));
  const positions = geometry.getAttribute('position');
  const uvs = geometry.getAttribute('uv');
  for (let index = 0; index < positions.count; index += 1) {
    const localU = positions.getX(index);
    const localY = positions.getY(index);
    const localDepth = THREE.MathUtils.clamp(positions.getZ(index), 0, safeThickness);
    const depthRatio = localDepth / safeThickness;
    const innerU = innerStartU + (localU / edgeLength) * (innerEndU - innerStartU);
    const mappedU = THREE.MathUtils.lerp(localU, innerU, depthRatio);
    const worldY = bottomY + localY - (localY <= 0.000001 ? baseEmbed : 0);
    positions.setXYZ(
      index,
      outerStart.x + direction.x * mappedU + inward.x * localDepth,
      worldY,
      outerStart.z + direction.z * mappedU + inward.z * localDepth,
    );
    uvs.setXY(
      index,
      phase + localU,
      retainedTopFlags[index] ? localDepth : worldY,
    );
  }
  positions.needsUpdate = true;
  uvs.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.userData.roomKarbandiOctagonTopMapping = 'plan-view-running-brick-course-across-wall-thickness';
  return geometry;
}

function clipRoomKarbandiWallGeometryBelowRoof(
  geometry,
  roofLimitYAt,
  maximumPlanEdge = 0.14,
  probeDepth = 0,
) {
  const source = geometry.index ? geometry.toNonIndexed() : geometry;
  const positions = source.getAttribute('position');
  const uvs = source.getAttribute('uv');
  const clippedPositions = [];
  const clippedUvs = [];
  const vertex = (index) => ({
    point: new THREE.Vector3().fromBufferAttribute(positions, index),
    uv: uvs ? new THREE.Vector2().fromBufferAttribute(uvs, index) : new THREE.Vector2(),
  });
  const interpolate = (a, b, amount) => ({
    point: a.point.clone().lerp(b.point, amount),
    uv: a.uv.clone().lerp(b.uv, amount),
  });
  const planDistance = (a, b) => Math.hypot(a.point.x - b.point.x, a.point.z - b.point.z);
  const subdivide = (triangle, depth = 0) => {
    const edges = [[0, 1], [1, 2], [2, 0]]
      .map(([a, b]) => ({ a, b, length: planDistance(triangle[a], triangle[b]) }))
      .sort((left, right) => right.length - left.length);
    if (edges[0].length <= maximumPlanEdge || depth >= 6) return [triangle];
    const { a, b } = edges[0];
    const other = [0, 1, 2].find((index) => index !== a && index !== b);
    const midpoint = interpolate(triangle[a], triangle[b], 0.5);
    return [
      ...subdivide([triangle[a], midpoint, triangle[other]], depth + 1),
      ...subdivide([midpoint, triangle[b], triangle[other]], depth + 1),
    ];
  };
  const signedDistance = ({ point }) => {
    const roofLimitY = roofLimitYAt(point.x, point.z);
    // A missing roof means this point is on the exterior portion of the wall
    // and must remain untouched. Where a real cover exists, retain only the
    // masonry above its underside; the lower part is the interior bleed.
    return Number.isFinite(roofLimitY) ? roofLimitY - point.y : -1;
  };
  const clipTriangle = (triangle) => {
    let polygon = triangle;
    const output = [];
    for (let index = 0; index < polygon.length; index += 1) {
      const current = polygon[index];
      const next = polygon[(index + 1) % polygon.length];
      const currentDistance = signedDistance(current);
      const nextDistance = signedDistance(next);
      const currentInside = currentDistance <= 0.000001;
      const nextInside = nextDistance <= 0.000001;
      if (currentInside) output.push(current);
      if (currentInside !== nextInside) {
        output.push(interpolate(
          current,
          next,
          THREE.MathUtils.clamp(currentDistance / (currentDistance - nextDistance), 0, 1),
        ));
      }
    }
    polygon = output;
    if (polygon.length < 3) return;
    for (let index = 1; index < polygon.length - 1; index += 1) {
      const clippedTriangle = [polygon[0], polygon[index], polygon[index + 1]];
      const areaNormal = clippedTriangle[1].point.clone().sub(clippedTriangle[0].point)
        .cross(clippedTriangle[2].point.clone().sub(clippedTriangle[0].point));
      if (areaNormal.lengthSq() <= 0.0000000001) continue;
      clippedTriangle.forEach((entry) => {
        clippedPositions.push(entry.point.x, entry.point.y, entry.point.z);
        clippedUvs.push(entry.uv.x, entry.uv.y);
      });
    }
  };
  for (let triangle = 0; triangle < positions.count; triangle += 3) {
    subdivide([vertex(triangle), vertex(triangle + 1), vertex(triangle + 2)])
      .forEach(clipTriangle);
  }
  const clipped = new THREE.BufferGeometry();
  clipped.setAttribute('position', new THREE.Float32BufferAttribute(clippedPositions, 3));
  clipped.setAttribute('uv', new THREE.Float32BufferAttribute(clippedUvs, 2));
  clipped.computeVertexNormals();
  clipped.userData = {
    ...geometry.userData,
    roomKarbandiOctagonRoofClip: 'subdivided-interior-face-clip-above-transition-cover-underside',
    roomKarbandiOctagonRoofClipMaximumPlanEdge: maximumPlanEdge,
    roomKarbandiOctagonRoofClipProbeDepth: probeDepth,
    roomKarbandiOctagonRoofClipProbeRule: 'interior-bearing-band-only-exterior-masonry-preserved',
  };
  if (source !== geometry) source.dispose();
  geometry.dispose();
  return clipped;
}

function applySquareTransitionWallFaceMapping(geometry, edge, side, centerX, centerZ) {
  const source = geometry.index ? geometry.toNonIndexed() : geometry;
  const positions = source.getAttribute('position');
  let uvs = source.getAttribute('uv');
  if (!uvs || uvs.count !== positions.count) {
    uvs = new THREE.Float32BufferAttribute(new Float32Array(positions.count * 2), 2);
    source.setAttribute('uv', uvs);
  }
  const wallU = (point) => {
    if (side === 'north') return centerX - point.x;
    if (side === 'south') return point.x - centerX;
    if (side === 'east') return centerZ - point.z;
    return point.z - centerZ;
  };
  const point = new THREE.Vector3();
  for (let vertexIndex = 0; vertexIndex < positions.count; vertexIndex += 1) {
    point.fromBufferAttribute(positions, vertexIndex);
    uvs.setXY(vertexIndex, wallU(point), point.y);
  }
  uvs.needsUpdate = true;
  source.clearGroups();
  const outerStart = edge.start;
  const wallDepth = Math.max(0.000001, Number(edge.thickness) || 0);
  const first = new THREE.Vector3();
  const second = new THREE.Vector3();
  const third = new THREE.Vector3();
  const centroid = new THREE.Vector3();
  for (let triangle = 0; triangle < positions.count; triangle += 3) {
    first.fromBufferAttribute(positions, triangle);
    second.fromBufferAttribute(positions, triangle + 1);
    third.fromBufferAttribute(positions, triangle + 2);
    centroid.copy(first).add(second).add(third).multiplyScalar(1 / 3);
    const depth = centroid.clone().sub(outerStart).setY(0).dot(edge.inward);
    const materialIndex = depth <= wallDepth * 0.08
      ? 0
      : depth >= wallDepth * 0.92
        ? 1
        : 2;
    source.addGroup(triangle, 3, materialIndex);
  }
  source.userData.roomSquareTransitionFaceMaterials = true;
  source.userData.roomSquareTransitionExteriorMaterialIndex = 0;
  source.userData.roomSquareTransitionInteriorMaterialIndex = 1;
  source.userData.roomSquareTransitionReturnMaterialIndex = 2;
  source.userData.roomSquareTransitionUvRule = 'exact-lower-room-wall-local-u-and-absolute-world-y';
  if (source !== geometry) geometry.dispose();
  return source;
}

function removeRoomWallTopInterfaceGeometry(geometry) {
  const source = geometry.index ? geometry.toNonIndexed() : geometry;
  const positions = source.getAttribute('position');
  const uvs = source.getAttribute('uv');
  source.computeBoundingBox();
  const topY = source.boundingBox?.max.y;
  if (!Number.isFinite(topY)) return source;
  const retainedPositions = [];
  const retainedUvs = [];
  const retainedMaterialIndexes = [];
  const materialIndexAt = (triangleStart) => (
    source.groups.find((group) => (
      triangleStart >= group.start && triangleStart < group.start + group.count
    ))?.materialIndex || 0
  );
  for (let triangle = 0; triangle < positions.count; triangle += 3) {
    const isTopInterface = [0, 1, 2].every((offset) => (
      Math.abs(positions.getY(triangle + offset) - topY) <= 0.000001
    ));
    if (isTopInterface) continue;
    for (let offset = 0; offset < 3; offset += 1) {
      const vertex = triangle + offset;
      retainedPositions.push(
        positions.getX(vertex),
        positions.getY(vertex),
        positions.getZ(vertex),
      );
      if (uvs) retainedUvs.push(uvs.getX(vertex), uvs.getY(vertex));
    }
    retainedMaterialIndexes.push(materialIndexAt(triangle));
  }
  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(retainedPositions, 3));
  if (uvs) result.setAttribute('uv', new THREE.Float32BufferAttribute(retainedUvs, 2));
  retainedMaterialIndexes.forEach((materialIndex, triangle) => {
    result.addGroup(triangle * 3, 3, materialIndex);
  });
  result.userData = {
    ...geometry.userData,
    roomWallTopInterfaceRemoved: true,
    roomWallTopInterfaceRule: 'open-shared-boundary-with-direct-square-transition-extension',
  };
  result.computeVertexNormals();
  result.computeBoundingBox();
  if (source !== geometry) source.dispose();
  geometry.dispose();
  return result;
}

function roomKarbandiRoofToDrumInfillGeometry({
  outerStart,
  outerEnd,
  drumStart,
  drumEnd,
  bottomY,
  topY,
  phase,
  edgeLength,
}) {
  const vertices = [
    outerStart.clone().setY(bottomY),
    outerEnd.clone().setY(bottomY),
    outerStart.clone().setY(topY),
    outerEnd.clone().setY(topY),
    drumStart.clone().setY(topY),
    drumEnd.clone().setY(topY),
  ];
  const indexedGeometry = new THREE.BufferGeometry();
  indexedGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices.flatMap((point) => point.toArray()), 3));
  indexedGeometry.setAttribute('uv', new THREE.Float32BufferAttribute([
    phase, bottomY,
    phase + edgeLength, bottomY,
    phase, topY,
    phase + edgeLength, topY,
    phase, topY,
    phase + edgeLength, topY,
  ], 2));
  indexedGeometry.setIndex([
    0, 1, 3, 0, 3, 2,
    2, 3, 5, 2, 5, 4,
    0, 4, 5, 0, 5, 1,
    0, 2, 4,
    1, 5, 3,
  ]);
  const geometry = indexedGeometry.toNonIndexed();
  geometry.computeVertexNormals();
  return geometry;
}

function roomKarbandiSmoothedRoofGrid({
  outerStart,
  outerEnd,
  drumStart,
  drumEnd,
  topY,
  roofYAt,
  longitudinalSegments,
  radialSegments,
}) {
  const rowSize = radialSegments + 1;
  const points = [];
  const contactHeights = [];
  for (let alongIndex = 0; alongIndex <= longitudinalSegments; alongIndex += 1) {
    const along = alongIndex / longitudinalSegments;
    const outer = outerStart.clone().lerp(outerEnd, along);
    const drum = drumStart.clone().lerp(drumEnd, along);
    for (let radialIndex = 0; radialIndex <= radialSegments; radialIndex += 1) {
      const radial = radialIndex / radialSegments;
      const point = outer.clone().lerp(drum, radial);
      const sampledRoofY = THREE.MathUtils.clamp(roofYAt(point.x, point.z), -1e6, topY);
      points.push(point);
      contactHeights.push(sampledRoofY >= topY - 0.001 ? topY : sampledRoofY);
    }
  }
  let heights = [...contactHeights];
  for (let pass = 0; pass < 3; pass += 1) {
    const nextHeights = [...heights];
    for (let alongIndex = 1; alongIndex < longitudinalSegments; alongIndex += 1) {
      for (let radialIndex = 1; radialIndex < radialSegments; radialIndex += 1) {
        const gridIndex = alongIndex * rowSize + radialIndex;
        const neighbourAverage = (
          heights[gridIndex - rowSize]
          + heights[gridIndex + rowSize]
          + heights[gridIndex - 1]
          + heights[gridIndex + 1]
        ) / 4;
        // Never smooth below a measured rib/cover contact. Raising adjacent
        // vertices rounds the backing without reopening a gap behind a rib.
        nextHeights[gridIndex] = Math.min(
          topY,
          Math.max(contactHeights[gridIndex], THREE.MathUtils.lerp(heights[gridIndex], neighbourAverage, 0.55)),
        );
      }
    }
    heights = nextHeights;
  }
  return { points, heights, rowSize };
}

function roomKarbandiRoofFittedInfillGeometry({
  outerStart,
  outerEnd,
  drumStart,
  drumEnd,
  topY,
  phase,
  edgeLength,
  roofYAt,
  longitudinalSegments = 16,
  radialSegments = 5,
}) {
  const positions = [];
  const uvs = [];
  const indices = [];
  const { points, heights, rowSize } = roomKarbandiSmoothedRoofGrid({
    outerStart, outerEnd, drumStart, drumEnd, topY, roofYAt, longitudinalSegments, radialSegments,
  });
  const indexFor = (alongIndex, radialIndex, top) => (
    (alongIndex * rowSize + radialIndex) * 2 + (top ? 1 : 0)
  );
  for (let alongIndex = 0; alongIndex <= longitudinalSegments; alongIndex += 1) {
    const along = alongIndex / longitudinalSegments;
    for (let radialIndex = 0; radialIndex <= radialSegments; radialIndex += 1) {
      const gridIndex = alongIndex * rowSize + radialIndex;
      const point = points[gridIndex];
      const bottomY = heights[gridIndex];
      positions.push(point.x, bottomY, point.z, point.x, topY, point.z);
      const mappingU = phase + edgeLength * along;
      uvs.push(mappingU, bottomY, mappingU, topY);
    }
  }
  const addQuad = (a, b, c, d, reverse = false) => {
    if (reverse) indices.push(a, c, b, a, d, c);
    else indices.push(a, b, c, a, c, d);
  };
  // The curved underside is closed by one dedicated roof-backing mesh.  Do
  // not duplicate those faces here or they will depth-fight through the ribs.
  for (let alongIndex = 0; alongIndex < longitudinalSegments; alongIndex += 1) {
    addQuad(
      indexFor(alongIndex, 0, false),
      indexFor(alongIndex + 1, 0, false),
      indexFor(alongIndex + 1, 0, true),
      indexFor(alongIndex, 0, true),
    );
    addQuad(
      indexFor(alongIndex, radialSegments, false),
      indexFor(alongIndex, radialSegments, true),
      indexFor(alongIndex + 1, radialSegments, true),
      indexFor(alongIndex + 1, radialSegments, false),
    );
  }
  for (let radialIndex = 0; radialIndex < radialSegments; radialIndex += 1) {
    addQuad(
      indexFor(0, radialIndex, false),
      indexFor(0, radialIndex, true),
      indexFor(0, radialIndex + 1, true),
      indexFor(0, radialIndex + 1, false),
    );
    addQuad(
      indexFor(longitudinalSegments, radialIndex, false),
      indexFor(longitudinalSegments, radialIndex + 1, false),
      indexFor(longitudinalSegments, radialIndex + 1, true),
      indexFor(longitudinalSegments, radialIndex, true),
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.userData.roomKarbandiInfillUnderside = 'ray-fitted-above-karbandi-cover-and-rib-envelope';
  geometry.userData.roomKarbandiInfillInnerBoundary = 'open-to-dedicated-roof-backing-mesh';
  geometry.userData.roomKarbandiInfillSurfaceSmoothing = 'three-pass-contact-preserving-laplacian';
  geometry.userData.roomKarbandiInfillLongitudinalSegments = longitudinalSegments;
  geometry.userData.roomKarbandiInfillRadialSegments = radialSegments;
  return geometry;
}

function roomKarbandiRoofBackingGeometry({
  outerStart,
  outerEnd,
  drumStart,
  drumEnd,
  topY,
  phase,
  edgeLength,
  roofYAt,
  longitudinalSegments = 16,
  radialSegments = 5,
}) {
  const positions = [];
  const uvs = [];
  const supported = [];
  const { points, heights, rowSize } = roomKarbandiSmoothedRoofGrid({
    outerStart, outerEnd, drumStart, drumEnd, topY, roofYAt, longitudinalSegments, radialSegments,
  });
  for (let alongIndex = 0; alongIndex <= longitudinalSegments; alongIndex += 1) {
    const along = alongIndex / longitudinalSegments;
    for (let radialIndex = 0; radialIndex <= radialSegments; radialIndex += 1) {
      const gridIndex = alongIndex * rowSize + radialIndex;
      const point = points[gridIndex];
      const y = heights[gridIndex];
      positions.push(point.x, y, point.z);
      uvs.push(phase + edgeLength * along, y);
      supported.push(y < topY - 0.001);
    }
  }
  const indices = [];
  for (let alongIndex = 0; alongIndex < longitudinalSegments; alongIndex += 1) {
    for (let radialIndex = 0; radialIndex < radialSegments; radialIndex += 1) {
      const lowerLeft = alongIndex * rowSize + radialIndex;
      const lowerRight = (alongIndex + 1) * rowSize + radialIndex;
      const upperRight = lowerRight + 1;
      const upperLeft = lowerLeft + 1;
      if ([lowerLeft, lowerRight, upperRight].some((vertex) => supported[vertex])) {
        indices.push(lowerLeft, upperRight, lowerRight);
      }
      if ([lowerLeft, upperLeft, upperRight].some((vertex) => supported[vertex])) {
        indices.push(lowerLeft, upperLeft, upperRight);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.userData.roomKarbandiBackingMapping = 'same-sampled-envelope-as-infill-inner-boundary';
  geometry.userData.roomKarbandiBackingSmoothing = 'three-pass-contact-preserving-laplacian';
  geometry.userData.roomKarbandiBackingLongitudinalSegments = longitudinalSegments;
  geometry.userData.roomKarbandiBackingRadialSegments = radialSegments;
  return geometry;
}

function roomKarbandiInfillSquareTopGeometry({
  outerPoints,
  drumPoints,
  topY,
  thickness,
}) {
  const contour = outerPoints.map((point) => new THREE.Vector2(point.x, point.z));
  const drumHole = drumPoints.map((point) => new THREE.Vector2(point.x, point.z));
  if (!THREE.ShapeUtils.isClockWise(contour)) contour.reverse();
  if (THREE.ShapeUtils.isClockWise(drumHole)) drumHole.reverse();
  const planarPoints = [...contour, ...drumHole];
  const slabThickness = Math.max(0.001, Number(thickness) || 0.06);
  const bottomY = topY - slabThickness;
  const positions = [
    ...planarPoints.flatMap((point) => [point.x, topY, point.y]),
    ...planarPoints.flatMap((point) => [point.x, bottomY, point.y]),
  ];
  const uvs = [
    ...planarPoints.flatMap((point) => [point.x, point.y]),
    ...planarPoints.flatMap((point) => [point.x, point.y]),
  ];
  const surfaceTriangles = THREE.ShapeUtils.triangulateShape(contour, [drumHole]).flat();
  const pointCount = planarPoints.length;
  const indices = [];
  for (let triangle = 0; triangle < surfaceTriangles.length; triangle += 3) {
    const a = surfaceTriangles[triangle];
    const b = surfaceTriangles[triangle + 1];
    const c = surfaceTriangles[triangle + 2];
    indices.push(a, b, c);
    indices.push(a + pointCount, c + pointCount, b + pointCount);
  }
  const addBoundarySides = (offset, count) => {
    for (let index = 0; index < count; index += 1) {
      const next = (index + 1) % count;
      const topA = offset + index;
      const topB = offset + next;
      const bottomA = topA + pointCount;
      const bottomB = topB + pointCount;
      indices.push(topA, bottomA, bottomB, topA, bottomB, topB);
    }
  };
  addBoundarySides(0, contour.length);
  addBoundarySides(contour.length, drumHole.length);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.userData.roomKarbandiInfillTopMapping = 'world-plan-checker-grid-at-normal-brick-length';
  geometry.userData.roomKarbandiInfillTopConstruction = 'single-closed-annular-checker-slab-with-one-drum-hole';
  geometry.userData.roomKarbandiInfillTopThickness = slabThickness;
  geometry.userData.roomKarbandiInfillTopBottomY = bottomY;
  return geometry;
}

function intersectRoomKarbandiLines(pointA, directionA, pointB, directionB) {
  const cross = directionA.x * directionB.z - directionA.z * directionB.x;
  if (Math.abs(cross) <= 0.000001) return null;
  const deltaX = pointB.x - pointA.x;
  const deltaZ = pointB.z - pointA.z;
  const t = (deltaX * directionB.z - deltaZ * directionB.x) / cross;
  return new THREE.Vector3(pointA.x + directionA.x * t, pointA.y, pointA.z + directionA.z * t);
}

function domeProfileHeightAtRadius(profile, radius) {
  const ordered = [...profile].sort((a, b) => a.x - b.x);
  if (!ordered.length) return 0;
  if (radius <= ordered[0].x) return ordered[0].y;
  if (radius >= ordered.at(-1).x) return ordered.at(-1).y;
  for (let index = 0; index < ordered.length - 1; index += 1) {
    const lower = ordered[index];
    const upper = ordered[index + 1];
    if (radius > upper.x) continue;
    const range = upper.x - lower.x;
    const along = range > 0.0000001 ? (radius - lower.x) / range : 0;
    return THREE.MathUtils.lerp(lower.y, upper.y, along);
  }
  return ordered.at(-1).y;
}

function betweenDomeSupportWallGeometry({
  outerRoomFacingProfile,
  innerCavityFacingProfile,
  coverage,
  thickness,
  bearingEmbed = 0,
  outerPlanSides = 64,
  outerClipInset = 0.001,
  segments = 28,
}) {
  const normalizedCoverage = THREE.MathUtils.clamp(Number(coverage) || 0, 0, 100);
  if (normalizedCoverage <= 0.001) return null;
  const wallThickness = Math.max(0.001, Number(thickness) || 0.2);
  const polygonSides = Math.max(3, Math.round(Number(outerPlanSides) || 64));
  const polygonalOuterCover = polygonSides < 64;
  const outerFaceApothemScale = polygonalOuterCover ? Math.cos(Math.PI / polygonSides) : 1;
  const outerProfileRadius = Math.max(...outerRoomFacingProfile.map((point) => point.x));
  const footRadius = Math.min(
    outerProfileRadius * outerFaceApothemScale,
    Math.max(...innerCavityFacingProfile.map((point) => point.x)),
  );
  const referenceInwardFromFoot = footRadius / 2;
  // R/2 is the fixed center of the support. The percentage scales each R/2
  // half, so 60% reaches 0.30R each way and 100% covers the complete radius.
  const halfCoverageExtent = (footRadius / 2) * normalizedCoverage / 100;
  const outerInwardFromFoot = Math.max(0, referenceInwardFromFoot - halfCoverageExtent);
  const innerInwardFromFoot = Math.min(footRadius, referenceInwardFromFoot + halfCoverageExtent);
  const outwardRadius = footRadius - outerInwardFromFoot;
  const centerwardRadius = footRadius - innerInwardFromFoot;

  const shellBearingEmbed = Math.max(0, Number(bearingEmbed) || 0);
  const coverClipInset = Math.max(0.0001, Number(outerClipInset) || 0.001);
  const rows = Array.from({ length: segments + 1 }, (_, index) => {
    const radius = THREE.MathUtils.lerp(centerwardRadius, outwardRadius, index / segments);
    const innerContactY = domeProfileHeightAtRadius(innerCavityFacingProfile, radius);
    // Pyramid profiles use vertex radii, while a radial support meets the
    // center of a planar face at its apothem. Cone supports are clipped for
    // their complete tangential thickness, not only their center plane.
    const outerSampleRadius = polygonalOuterCover
      ? radius / outerFaceApothemScale
      : Math.hypot(radius, wallThickness / 2);
    const outerContactY = domeProfileHeightAtRadius(outerRoomFacingProfile, outerSampleRadius);
    return {
      radius,
      outerSampleRadius,
      innerContactY,
      outerContactY,
      lowerY: innerContactY - shellBearingEmbed,
      upperY: outerContactY - coverClipInset,
    };
  }).filter((row) => row.outerContactY > row.innerContactY + 0.001);
  if (rows.length < 2) return null;

  const shape = new THREE.Shape();
  shape.moveTo(rows[0].radius, rows[0].lowerY);
  rows.slice(1).forEach((row) => shape.lineTo(row.radius, row.lowerY));
  [...rows].reverse().forEach((row) => shape.lineTo(row.radius, row.upperY));
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: wallThickness,
    steps: 1,
    bevelEnabled: false,
    curveSegments: 1,
  });
  geometry.translate(0, 0, -wallThickness / 2);
  geometry.computeVertexNormals();
  geometry.userData.betweenDomeSupportWallBottomY = Math.min(...rows.map((row) => row.lowerY));
  geometry.userData.betweenDomeSupportWallTopY = Math.max(...rows.map((row) => row.upperY));
  geometry.userData.betweenDomeSupportWallFootRadius = footRadius;
  geometry.userData.betweenDomeSupportWallReferenceRadius = footRadius - referenceInwardFromFoot;
  geometry.userData.betweenDomeSupportWallReferenceInwardFromFoot = referenceInwardFromFoot;
  geometry.userData.betweenDomeSupportWallHalfCoverageExtent = halfCoverageExtent;
  geometry.userData.betweenDomeSupportWallOutwardRadius = outwardRadius;
  geometry.userData.betweenDomeSupportWallCenterwardRadius = centerwardRadius;
  geometry.userData.betweenDomeSupportWallCoverage = normalizedCoverage;
  geometry.userData.betweenDomeSupportWallCoverageDirection = 'symmetric-about-r-half-midpoint-of-dome-radius';
  geometry.userData.betweenDomeSupportWallThickness = wallThickness;
  geometry.userData.betweenDomeSupportWallBearingEmbed = shellBearingEmbed;
  geometry.userData.betweenDomeSupportWallOuterClipInset = coverClipInset;
  geometry.userData.betweenDomeSupportWallOuterPlanSides = polygonSides;
  geometry.userData.betweenDomeSupportWallOuterFaceApothemScale = outerFaceApothemScale;
  geometry.userData.betweenDomeSupportWallRadius = rows.map((row) => row.radius);
  geometry.userData.betweenDomeSupportWallOuterSampleRadius = rows.map((row) => row.outerSampleRadius);
  geometry.userData.betweenDomeSupportWallInnerContactY = rows.map((row) => row.innerContactY);
  geometry.userData.betweenDomeSupportWallOuterContactY = rows.map((row) => row.outerContactY);
  geometry.userData.betweenDomeSupportWallBoundary = 'embedded-into-inner-dome-and-clipped-under-outer-cover-interior';
  return geometry;
}

function addRoomDomeCover(group, meshes, building, walls, context) {
  if (building.type !== 'room' || building.domeEnabled === false) return;
  let {
    centerX,
    centerZ,
    width,
    depth,
    wallTop,
    thickness,
    karbandiCrownY = null,
    karbandiCrownRadius = null,
    karbandiWallSupportFootOctagon = [],
    karbandiFirstJunctionOctagon = [],
    wallHeights = {},
    wallThicknesses = {},
    usesSharedKarbandi = false,
  } = context;
  const roomInteriorWidth = width;
  const roomInteriorDepth = depth;
  const roomPlanShape = ['square', 'octagon', 'circle', 'polygon'].includes(building.roomPlanShape)
    ? building.roomPlanShape
    : 'square';
  const directBearing = roomPlanShape !== 'square' && building.buildingType !== 'vestibule';
  const transitionType = directBearing
    ? 'direct'
    : ['karbandi', 'squinch', 'pendentive', 'muqarnas'].includes(building.domeTransition)
      ? building.domeTransition
      : 'karbandi';
  const configuredTransitionHeight = Math.max(0.2, Number(building.domeTransitionHeight) || 1.2);
  const drumHeight = Math.max(0, Number(building.domeDrumHeight) || 0);
  const transitionSettings = transitionType === 'karbandi'
    ? {
      ...(building.domeTransitionSettings?.karbandi || {}),
      ...walls.karbandi,
    }
    : building.domeTransitionSettings?.[transitionType] || {};
  if (transitionType === 'squinch') {
    const westThickness = Math.max(0.05, Number(wallThicknesses.west) || thickness);
    const eastThickness = Math.max(0.05, Number(wallThicknesses.east) || thickness);
    const northThickness = Math.max(0.05, Number(wallThicknesses.north) || thickness);
    const southThickness = Math.max(0.05, Number(wallThicknesses.south) || thickness);
    const westWallCenterX = centerX - width / 2 - westThickness / 2;
    const eastWallCenterX = centerX + width / 2 + eastThickness / 2;
    const northWallCenterZ = centerZ - depth / 2 - northThickness / 2;
    const southWallCenterZ = centerZ + depth / 2 + southThickness / 2;
    centerX = (westWallCenterX + eastWallCenterX) / 2;
    centerZ = (northWallCenterZ + southWallCenterZ) / 2;
    width = eastWallCenterX - westWallCenterX;
    depth = southWallCenterZ - northWallCenterZ;
    group.userData.roomSquinchWallCenterlineFootprint = {
      center: [centerX, centerZ],
      width,
      depth,
      west: westWallCenterX,
      east: eastWallCenterX,
      north: northWallCenterZ,
      south: southWallCenterZ,
      source: 'room-vertical-wall-structural-centerlines',
    };
  }
  const roomSpanRadius = Math.max(0.25, Math.min(width, depth) / 2 - Math.max(0.08, thickness * 0.45));
  const squinchRibWidth = THREE.MathUtils.clamp(Number(transitionSettings.ribWidth) || 0.1, 0.01, 1);
  const squinchRibDepth = THREE.MathUtils.clamp(Number(transitionSettings.ribDepth) || 0.46, 0.01, 1);
  const squinchCoverThickness = Math.max(0.05, Number(thickness) || 0.35);
  // The arch crown centreline is the bearing footprint. The dome is tangent
  // to the sixteen drum faces at this radius; the polygon vertices are
  // circumscribed outside it.
  const squinchFootprintApothem = Math.max(
    0.25,
    Math.min(width, depth) / 2,
  );
  const squinchOuterApothem = squinchFootprintApothem + squinchCoverThickness / 2;
  const domeCoverType = ['dome', 'cone', 'pyramid'].includes(building.domeCoverType)
    ? building.domeCoverType
    : 'dome';
  const planSideCount = roomPlanShape === 'octagon'
    ? 8
    : roomPlanShape === 'polygon'
      ? Math.round(THREE.MathUtils.clamp(Number(building.roomPolygonSides) || 6, 3, 32))
      : domeCoverType === 'pyramid' ? 8 : 64;
  const masonryShellThickness = Math.max(
    0.01,
    Number(walls.bricks?.brickWidth) || DEFAULT_WALL_SYSTEM.bricks.brickWidth,
  );
  const domeCoverHeight = Math.max(0.2, Number(building.domeCoverHeight) || 5);
  const directInteriorBearingRadius = Math.max(
    0.25,
    Math.min(width, depth) / 2 * (roomPlanShape === 'circle' ? 1 : Math.cos(Math.PI / planSideCount)),
  );
  const directOuterBearingRadius = directInteriorBearingRadius + masonryShellThickness;
  const transitionBearingRadius = transitionType === 'karbandi'
    && usesSharedKarbandi
    && Number.isFinite(Number(karbandiCrownRadius))
    ? Math.max(0.05, Number(karbandiCrownRadius))
    : transitionType === 'squinch'
      ? squinchOuterApothem
      : directBearing
        ? directOuterBearingRadius
        : roomSpanRadius;
  const portalInteriorFaceFlush = context.portalCoverInteriorFaceFlush === true;
  const explicitPortalInteriorTargetRadius = Number(context.portalCoverInteriorTargetRadius);
  let domeRadius = transitionBearingRadius;
  if (portalInteriorFaceFlush) {
    // The transition radius follows the outer rib/crown envelope. At the north
    // wall, the visible arch face is two shell offsets inward: one for the
    // cover's own soffit and one for the wall-side face of the bearing. Size
    // the exterior from that inner target so the clipped cover meets the arch
    // instead of projecting past it and leaving a widening triangular gap.
    const interiorFaceTargetRadius = Math.max(
      0.05,
      Number.isFinite(explicitPortalInteriorTargetRadius)
        ? explicitPortalInteriorTargetRadius
        : transitionBearingRadius - masonryShellThickness * 2,
    );
    if (domeCoverType === 'dome') {
      domeRadius = interiorFaceTargetRadius + masonryShellThickness;
    } else {
      // Cone and Pyramid thickness is normal to their sloping face. Solve the
      // exterior profile radius whose inward normal offset lands on the target
      // interior radius. Pyramid profiles use circumradius while their bearing
      // reference is the octagonal apothem.
      const apothemFactor = domeCoverType === 'pyramid'
        ? Math.cos(Math.PI / planSideCount)
        : 1;
      const targetGeometryRadius = interiorFaceTargetRadius / apothemFactor;
      let outerGeometryRadius = targetGeometryRadius + masonryShellThickness;
      for (let iteration = 0; iteration < 8; iteration += 1) {
        outerGeometryRadius = targetGeometryRadius + masonryShellThickness * domeCoverHeight
          / Math.hypot(outerGeometryRadius, domeCoverHeight);
      }
      domeRadius = outerGeometryRadius * apothemFactor;
    }
  }
  const drumSideCount = domeCoverType === 'pyramid'
    ? planSideCount
    : roomPlanShape === 'octagon'
      ? 16
      : roomPlanShape === 'polygon'
        ? Math.min(64, Math.max(6, planSideCount * 2))
        : transitionType === 'squinch' ? 16 : 64;
  const drumFootprintApothem = transitionType === 'squinch' ? squinchOuterApothem : domeRadius;
  const drumOuterRadius = drumSideCount < 64
    ? drumFootprintApothem / Math.cos(Math.PI / drumSideCount)
    : domeRadius;
  let transitionTopY = directBearing
    ? wallTop
    : transitionType === 'karbandi' && Number.isFinite(Number(karbandiCrownY))
      ? Math.max(wallTop + 0.05, Number(karbandiCrownY))
      : wallTop + configuredTransitionHeight;
  if (transitionType === 'squinch') {
    const halfWidth = width / 2;
    const halfDepth = depth / 2;
    const cornerCut = Math.max(0.1, Math.min(halfWidth, halfDepth) * (2 - Math.sqrt(2)));
    const northReferenceHalfSpan = Math.max(0.1, halfWidth - cornerCut);
    const referenceSpringY = wallTop + (Number.isFinite(Number(transitionSettings.springHeightOffset))
      ? Number(transitionSettings.springHeightOffset)
      : 0);
    const referenceConstruction = pointedArchConstruction(
      0,
      northReferenceHalfSpan,
      referenceSpringY,
      Math.max(0.05, Number(transitionSettings.greenOffset) || 0.45),
      referenceSpringY + (Number.isFinite(Number(transitionSettings.greenHeightOffset))
        ? Number(transitionSettings.greenHeightOffset)
        : -0.65),
      { redOffset: Number.isFinite(Number(transitionSettings.redOffset)) ? Number(transitionSettings.redOffset) : -0.1 },
    );
    transitionTopY = Math.max(
      wallTop + 0.05,
      Number(referenceConstruction?.apexPoint?.y) || wallTop + configuredTransitionHeight,
    );
  }
  const transitionHeight = transitionTopY - wallTop;
  const drumBaseY = transitionType === 'squinch'
    ? transitionTopY + squinchRibWidth / 2
    : transitionTopY;
  const drumTopY = drumBaseY + drumHeight;
  const domePlanSegments = domeCoverType === 'pyramid' ? planSideCount : 64;
  // domeRadius is the transition footprint apothem. An octagonal pyramid
  // therefore needs a larger vertex radius so all eight base faces land on
  // the same footprint line as the drum/transition below it.
  let domeGeometryBaseRadius = domeCoverType === 'pyramid'
    ? domeRadius / Math.cos(Math.PI / domePlanSegments)
    : domeRadius;
  const domeArch = building.domeArch || {};
  const outerDomeLegExtension = THREE.MathUtils.clamp(Number(domeArch.legExtension) || 0, 0, 10);
  let springY = drumTopY + outerDomeLegExtension;
  if (domeCoverType === 'dome'
    && portalInteriorFaceFlush
    && Number.isFinite(Number(context.portalDomeGreenCircle?.startY))) {
    springY = Number(context.portalDomeGreenCircle.startY);
  }
  const redOffset = Number.isFinite(Number(domeArch.redOffset)) ? Number(domeArch.redOffset) : 0.45;
  const redRadius = domeArch.redRadius == null ? null : Math.max(0.05, Number(domeArch.redRadius) || 1);
  const greenOffset = Math.max(0.05, Number(domeArch.greenOffset) || 0.8);
  const greenHeight = springY + (Number.isFinite(Number(domeArch.greenHeightOffset)) ? Number(domeArch.greenHeightOffset) : 0);
  let domeConstruction = domeCoverType === 'dome'
    ? pointedArchConstruction(0, domeRadius, springY, greenOffset, greenHeight, {
      redOffset,
      redRadius,
    })
    : null;
  let domeArchProfile = domeCoverType === 'dome'
    ? archCurve(0, domeRadius, springY, springY, greenOffset, greenHeight, 32, {
      redOffset,
      redRadius,
    }).filter((point) => point.x >= -0.000001)
    : [
      new THREE.Vector2(0, springY + domeCoverHeight),
      new THREE.Vector2(domeGeometryBaseRadius, springY),
    ];
  let portalInnerDomeArchProfile = null;
  let portalDomeGreenCircleConstruction = null;
  let portalKarbandiCrownCoverRadius = null;
  const portalGreenCircle = context.portalDomeGreenCircle;
  if (domeCoverType === 'dome'
    && portalInteriorFaceFlush
    && Number.isFinite(Number(portalGreenCircle?.centerX))
    && Number.isFinite(Number(portalGreenCircle?.centerY))
    && Number.isFinite(Number(portalGreenCircle?.radius))
    && Number.isFinite(Number(portalGreenCircle?.apexY))) {
    const circleCenter = new THREE.Vector2(
      Number(portalGreenCircle.centerX),
      Number(portalGreenCircle.centerY),
    );
    const circleRadius = Math.max(0.05, Number(portalGreenCircle.radius));
    const innerStart = Number.isFinite(Number(portalGreenCircle?.startX))
      && Number.isFinite(Number(portalGreenCircle?.startY))
      ? new THREE.Vector2(Number(portalGreenCircle.startX), Number(portalGreenCircle.startY))
      : new THREE.Vector2(
        circleCenter.x + Math.sqrt(Math.max(0, circleRadius ** 2 - (springY - circleCenter.y) ** 2)),
        springY,
      );
    const innerApex = new THREE.Vector2(0, Number(portalGreenCircle.apexY));
    const innerStartAngle = Math.atan2(
      innerStart.y - circleCenter.y,
      innerStart.x - circleCenter.x,
    );
    const innerApexAngle = Math.atan2(
      innerApex.y - circleCenter.y,
      innerApex.x - circleCenter.x,
    );
    const outerRadius = circleRadius + masonryShellThickness;
    const outerApex = new THREE.Vector2(
      0,
      circleCenter.y + Math.sqrt(Math.max(0, outerRadius ** 2 - circleCenter.x ** 2)),
    );
    const outerStart = circleCenter.clone().add(new THREE.Vector2(
      Math.cos(innerStartAngle) * outerRadius,
      Math.sin(innerStartAngle) * outerRadius,
    ));
    const crownRibHalfWidth = Math.max(0.005, Number(transitionSettings.ribWidth) || 0.1) / 2;
    const crownPlanOverlap = Math.max(
      0.002,
      Math.min(0.006, (Number(walls.bricks?.mortar) || 0.01) * 0.3),
    );
    const requestedCrownCoverRadius = transitionType === 'karbandi'
      && usesSharedKarbandi
      && Number.isFinite(Number(karbandiCrownRadius))
      ? Math.max(
        outerStart.x,
        Number(karbandiCrownRadius) + crownRibHalfWidth + crownPlanOverlap,
      )
      : outerStart.x;
    portalKarbandiCrownCoverRadius = Math.min(
      circleCenter.x + outerRadius - 0.0001,
      requestedCrownCoverRadius,
    );
    const clipsAtWallSupportedRibLegs = transitionType === 'karbandi'
      && usesSharedKarbandi
      && Number.isFinite(Number(context.wallSupportedRibLegTopY));
    const curveClipY = clipsAtWallSupportedRibLegs
      ? THREE.MathUtils.clamp(
        Number(context.wallSupportedRibLegTopY),
        circleCenter.y + 0.0001,
        innerStart.y,
      )
      : null;
    // Keep both dome faces circular and terminate them with a literal
    // horizontal cut at the top of the vertical walls. The Portal half-plane
    // then follows the centerline plane of the two wall-supported reference-rib
    // legs, so the full curve reaches their springing seats without crossing
    // to the unsupported side of either rib.
    const outerCurveEndAngle = clipsAtWallSupportedRibLegs
      ? Math.asin(THREE.MathUtils.clamp(
        (curveClipY - circleCenter.y) / outerRadius,
        -1,
        1,
      ))
      : portalKarbandiCrownCoverRadius > outerStart.x + 0.000001
        ? Math.acos(THREE.MathUtils.clamp(
          (portalKarbandiCrownCoverRadius - circleCenter.x) / outerRadius,
          -1,
          1,
        ))
        : innerStartAngle;
    const innerCurveEndAngle = clipsAtWallSupportedRibLegs
      ? Math.asin(THREE.MathUtils.clamp(
        (curveClipY - circleCenter.y) / circleRadius,
        -1,
        1,
      ))
      : outerCurveEndAngle;
    const innerCurveEnd = circleCenter.clone().add(new THREE.Vector2(
      Math.cos(innerCurveEndAngle) * circleRadius,
      Math.sin(innerCurveEndAngle) * circleRadius,
    ));
    const outerCurveEnd = circleCenter.clone().add(new THREE.Vector2(
      Math.cos(outerCurveEndAngle) * outerRadius,
      Math.sin(outerCurveEndAngle) * outerRadius,
    ));
    if (clipsAtWallSupportedRibLegs) portalKarbandiCrownCoverRadius = outerCurveEnd.x;
    portalInnerDomeArchProfile = sampleCircularArc(
      circleCenter,
      circleRadius,
      innerApexAngle,
      innerCurveEndAngle,
      36,
    );
    domeArchProfile = sampleCircularArc(
      circleCenter,
      outerRadius,
      Math.atan2(outerApex.y - circleCenter.y, outerApex.x - circleCenter.x),
      outerCurveEndAngle,
      36,
    );
    domeRadius = portalKarbandiCrownCoverRadius;
    domeGeometryBaseRadius = domeRadius;
    domeConstruction = null;
    portalDomeGreenCircleConstruction = {
      center: circleCenter.toArray(),
      radius: circleRadius,
      sidePoint: innerStart.toArray(),
      apexPoint: innerApex.toArray(),
      outerRadius,
      outerCircleSidePoint: outerStart.toArray(),
      innerCurveEndPoint: innerCurveEnd.toArray(),
      outerSidePoint: outerCurveEnd.toArray(),
      crownCoverRadius: portalKarbandiCrownCoverRadius,
      crownPlanOverlap,
      wallSupportedRibLegSpringClipY: curveClipY,
      profileRule: 'interior-meridian-is-exact-north-wall-green-circle-arc',
      bearingRule: clipsAtWallSupportedRibLegs
        ? 'continuous-dome-curves-to-wall-top-clipped-on-wall-supported-rib-leg-centerline-plane'
        : transitionType === 'karbandi' && usesSharedKarbandi
          ? 'continuous-concentric-dome-curve-wraps-over-full-karbandi-crown-rib-width'
        : 'normal-offset-green-circle-shell',
    };
  }
  const domeRise = portalDomeGreenCircleConstruction
    ? Math.max(0.2, domeArchProfile[0].y - springY)
    : domeCoverType === 'dome'
    ? (domeConstruction ? domeConstruction.apexPoint.y - springY : Math.max(0.2, Number(building.domeRise) || 2))
    : domeCoverHeight;
  if (domeCoverType === 'dome' && domeArchProfile.length < 3) {
    domeArchProfile = Array.from({ length: 33 }, (_, index) => {
      const angle = Math.PI * 0.5 * index / 32;
      return new THREE.Vector2(
        domeGeometryBaseRadius * Math.cos(angle),
        springY + domeRise * Math.sin(angle),
      );
    });
  }
  // The vertical section below the cover is built as its own masonry object.
  // Keep the dome profile limited to the curved/sloping cover so it can carry
  // a finish independent from the extra leg below the springing ring.
  const domeProfile = domeArchProfile;
  const domeProfileDistances = domeProfile.map((_, index) => (
    index === 0 ? 0 : domeProfile[index].distanceTo(domeProfile[index - 1])
  ));
  for (let index = 1; index < domeProfileDistances.length; index += 1) {
    domeProfileDistances[index] += domeProfileDistances[index - 1];
  }
  const domeMeridianLength = Math.max(0.01, domeProfileDistances.at(-1) || 0);
  const drumShellThickness = transitionType === 'squinch'
    ? squinchCoverThickness
    : masonryShellThickness;
  const domePatternCoverage = THREE.MathUtils.clamp(
    Number.isFinite(Number(building.domePatternCoverage)) ? Number(building.domePatternCoverage) : 85,
    0,
    100,
  );
  const innerDomePatternCoverage = THREE.MathUtils.clamp(
    Number.isFinite(Number(building.innerDomePatternCoverage)) ? Number(building.innerDomePatternCoverage) : 85,
    0,
    100,
  );
  const domeColor = /^#[0-9a-f]{6}$/i.test(building.domeColor || '') ? building.domeColor : walls.color;
  const domeExtraLegColor = /^#[0-9a-f]{6}$/i.test(building.domeExtraLegColor || '')
    ? building.domeExtraLegColor
    : domeColor;
  const innerDomeColor = /^#[0-9a-f]{6}$/i.test(building.innerDomeColor || '')
    ? building.innerDomeColor
    : domeColor;
  const configuredDrumColor = /^#[0-9a-f]{6}$/i.test(building.domeDrumColor || '')
    ? building.domeDrumColor
    : walls.color;
  const drumColor = transitionType === 'squinch'
    && configuredDrumColor.toLowerCase() === '#b3a62c'
    ? walls.color
    : configuredDrumColor;
  const domeWalls = { ...walls, color: domeColor };
  const domeExtraLegWalls = { ...walls, color: domeExtraLegColor };
  const drumWalls = { ...walls, color: drumColor };
  const domePlanPerimeter = domeCoverType === 'pyramid'
    ? domePlanSegments * 2 * domeGeometryBaseRadius * Math.sin(Math.PI / domePlanSegments)
    : Math.PI * 2 * domeGeometryBaseRadius;
  const domeInteriorBaseRadius = domeCoverType === 'dome'
    ? domeGeometryBaseRadius
    : Math.max(
      0.01,
      domeGeometryBaseRadius - masonryShellThickness * domeCoverHeight
        / Math.hypot(domeGeometryBaseRadius, domeCoverHeight),
    );
  const domeInteriorPlanPerimeter = domeCoverType === 'pyramid'
    ? domePlanSegments * 2 * domeInteriorBaseRadius * Math.sin(Math.PI / domePlanSegments)
    : Math.PI * 2 * domeInteriorBaseRadius;
  const domeMaterial = configureDomePatternCoverage(wallMaterial(
    domeWalls,
    'room_dome',
    Math.max(0.5, domePlanPerimeter),
    domeMeridianLength,
    false,
  ), domePatternCoverage, domeColor, springY, domeRise);
  domeMaterial.side = THREE.DoubleSide;
  const domeInteriorMaterial = wallMaterial(
    domeWalls,
    'room_dome_interior',
    Math.max(0.5, domeInteriorPlanPerimeter),
    domeMeridianLength,
    false,
  );
  domeInteriorMaterial.side = THREE.DoubleSide;
  if (domeCoverType === 'cone' || domeCoverType === 'pyramid') {
    const bondFacetCount = domeCoverType === 'pyramid' ? domePlanSegments : 0;
    configureConvergingCoverBond(domeMaterial, centerX, centerZ, bondFacetCount);
    configureConvergingCoverBond(domeInteriorMaterial, centerX, centerZ, bondFacetCount);
  }
  const outerDomeAutomaticRunningWalls = wallsWithDefaultBond(domeWalls, 'room_dome_interior');
  const outerDomeAutomaticRunningMaterial = wallMaterial(
    outerDomeAutomaticRunningWalls,
    'room_dome_interior',
    Math.max(0.5, domePlanPerimeter),
    domeMeridianLength,
    false,
  );
  outerDomeAutomaticRunningMaterial.side = THREE.DoubleSide;
  outerDomeAutomaticRunningMaterial.userData.roomDomeAutomaticRunningBond = true;
  outerDomeAutomaticRunningMaterial.userData.roomDomeAutomaticSurfaceRole = 'outer-shell-return-only';
  const transitionMaterial = wallMaterial(
    walls,
    'room_dome_transition',
    Math.max(0.5, Math.PI * 2 * domeRadius),
    Math.max(0.5, transitionHeight),
    false,
  );
  transitionMaterial.side = THREE.DoubleSide;
  const transitionCoverExteriorMaterial = wallMaterial(
    walls,
    'room_dome_transition_exterior',
    Math.max(0.5, Math.PI * 2 * domeRadius),
    Math.max(0.5, transitionHeight),
    true,
  );
  transitionCoverExteriorMaterial.side = THREE.DoubleSide;
  transitionCoverExteriorMaterial.userData.roomSquinchCoverExteriorFinish = 'one-shared-exterior-bond-for-all-transition-covers';
  if (transitionType === 'karbandi' && usesSharedKarbandi && building.domeTransitionCoverEnabled === true) {
    const openingRadius = Math.max(0.001, domeRadius - masonryShellThickness);
    group.traverse((child) => {
      if (!child.isMesh || child.userData?.isKarbandiCover !== true) return;
      const sourceMaterials = Array.isArray(child.material) ? child.material : [child.material];
      const clippedMaterials = sourceMaterials.map((material) => (
        materialWithCircularPlanVoid(material, centerX, centerZ, openingRadius)
      ));
      child.material = Array.isArray(child.material) ? clippedMaterials : clippedMaterials[0];
      child.userData.roomDomeOpeningVoid = true;
      child.userData.roomDomeOpeningVoidRadius = openingRadius;
      child.userData.roomDomeOpeningVoidBoundary = 'drum-inner-circle';
    });
    group.userData.roomKarbandiCoverOpeningVoid = {
      center: [centerX, centerZ],
      radius: openingRadius,
      boundary: 'drum-inner-circle',
    };
  }
  const wallSupportFootOctagon = Array.isArray(karbandiWallSupportFootOctagon)
    ? karbandiWallSupportFootOctagon.map((entry) => ({
      point: Array.isArray(entry?.point) ? new THREE.Vector3(...entry.point) : null,
      wall: entry?.wall || null,
      walls: Array.isArray(entry?.walls) && entry.walls.length ? entry.walls : [entry?.wall].filter(Boolean),
      ribIndex: entry?.ribIndex,
      side: entry?.side,
    })).filter((entry) => entry.point && entry.wall)
    : [];
  const firstJunctionOctagon = Array.isArray(karbandiFirstJunctionOctagon)
    ? karbandiFirstJunctionOctagon.map((entry) => ({
      point: Array.isArray(entry?.point) ? new THREE.Vector3(...entry.point) : null,
      wall: entry?.wall || null,
      ribIndex: entry?.ribIndex,
      side: entry?.side,
    })).filter((entry) => entry.point)
    : [];
  const supportedTransitionWalls = new Set(wallSupportFootOctagon.flatMap((entry) => entry.walls || [entry.wall]));
  const transitionSideCount = wallSupportFootOctagon.length;
  const validSupportedTransition = [4, 8].includes(transitionSideCount)
    && supportedTransitionWalls.size === 4;
  if (transitionType === 'karbandi' && usesSharedKarbandi && validSupportedTransition) {
    const octagonWallsVisible = false;
    const thicknessFor = (side) => Math.max(0.05, Number(wallThicknesses?.[side]) || thickness);
    const squareTransition = transitionSideCount === 4;
    const squareRoomBodies = Object.fromEntries(['north', 'east', 'south', 'west'].map((side) => {
      const lowerWall = group.getObjectByName(`Room ${side} south-style wall`);
      const body = lowerWall?.children.find((child) => child.userData?.isRoomWallBody === true) || null;
      if (squareTransition && body) {
        body.geometry = removeRoomWallTopInterfaceGeometry(body.geometry);
        body.userData.roomWallContinuesIntoSquareTransition = true;
      }
      return [side, body];
    }));
    group.updateMatrixWorld(true);
    const squareRoomBounds = Object.fromEntries(Object.entries(squareRoomBodies).map(([side, body]) => [
      side,
      body ? new THREE.Box3().setFromObject(body) : null,
    ]));
    // A square transition is not a rib-foot polygon. It is the direct upward
    // continuation of the four Room wall solids, so its joint elevation is the
    // Room wall top regardless of where the Karbandi solver placed rib feet.
    const bottomY = squareTransition
      ? Math.max(...Object.values(squareRoomBounds)
        .filter(Boolean)
        .map((bounds) => bounds.max.y), wallTop)
      : wallSupportFootOctagon.reduce((sum, entry) => sum + entry.point.y, 0)
        / wallSupportFootOctagon.length;
    const infillBottomY = firstJunctionOctagon.length === transitionSideCount
      ? THREE.MathUtils.clamp(
        firstJunctionOctagon.reduce((sum, entry) => sum + entry.point.y, 0) / firstJunctionOctagon.length,
        bottomY,
        transitionTopY,
      )
      : bottomY;
    // Room bonds now live directly on the structural wall mesh. There is no
    // separate finish skin to project beyond, so transition masonry must use
    // the exact structural interior and exterior planes.
    const exteriorFinishProjection = 0;
    const westOctagonExteriorX = squareRoomBounds.west?.min.x
      ?? centerX - width / 2 - thicknessFor('west') - exteriorFinishProjection;
    const eastOctagonExteriorX = squareRoomBounds.east?.max.x
      ?? centerX + width / 2 + thicknessFor('east') + exteriorFinishProjection;
    const northOctagonExteriorZ = squareRoomBounds.north?.min.z
      ?? centerZ - depth / 2 - thicknessFor('north') - exteriorFinishProjection;
    const southOctagonExteriorZ = squareRoomBounds.south?.max.z
      ?? centerZ + depth / 2 + thicknessFor('south') + exteriorFinishProjection;
    const westOctagonInteriorX = squareRoomBounds.west?.max.x ?? centerX - width / 2;
    const eastOctagonInteriorX = squareRoomBounds.east?.min.x ?? centerX + width / 2;
    const northOctagonInteriorZ = squareRoomBounds.north?.max.z ?? centerZ - depth / 2;
    const southOctagonInteriorZ = squareRoomBounds.south?.min.z ?? centerZ + depth / 2;
    const squareWallOrder = ['north', 'east', 'south', 'west'];
    const squareInnerPoints = [
      new THREE.Vector3(westOctagonInteriorX, bottomY, northOctagonInteriorZ),
      new THREE.Vector3(eastOctagonInteriorX, bottomY, northOctagonInteriorZ),
      new THREE.Vector3(eastOctagonInteriorX, bottomY, southOctagonInteriorZ),
      new THREE.Vector3(westOctagonInteriorX, bottomY, southOctagonInteriorZ),
    ];
    const squareOuterPoints = [
      new THREE.Vector3(westOctagonExteriorX, bottomY, northOctagonExteriorZ),
      new THREE.Vector3(eastOctagonExteriorX, bottomY, northOctagonExteriorZ),
      new THREE.Vector3(eastOctagonExteriorX, bottomY, southOctagonExteriorZ),
      new THREE.Vector3(westOctagonExteriorX, bottomY, southOctagonExteriorZ),
    ];
    const ribCoverClearance = Math.max(
      Number(walls.karbandi?.ribWidth) || 0.1,
      Number(walls.karbandi?.ribDepth) || 0.1,
    ) * Math.max(0.1, Number(walls.karbandi?.groupScale) || 1) + 0.01;
    const rawRibFootOctagon = squareTransition
      ? squareInnerPoints.map((point) => point.clone())
      : wallSupportFootOctagon.map((entry) => entry.point.clone().setY(bottomY));
    const rawRibEdges = rawRibFootOctagon.map((start, index) => {
      const end = rawRibFootOctagon[(index + 1) % rawRibFootOctagon.length];
      const direction = end.clone().sub(start).setY(0);
      const length = Math.max(0.000001, direction.length());
      direction.divideScalar(length);
      const midpoint = start.clone().add(end).multiplyScalar(0.5);
      const inward = new THREE.Vector3(-direction.z, 0, direction.x);
      if (inward.dot(new THREE.Vector3(centerX - midpoint.x, 0, centerZ - midpoint.z)) < 0) inward.negate();
      const touchedWalls = squareTransition
        ? [squareWallOrder[index]]
        : [...new Set([
          wallSupportFootOctagon[index]?.wall,
          wallSupportFootOctagon[(index + 1) % wallSupportFootOctagon.length]?.wall,
        ].filter(Boolean))];
      return {
        start,
        end,
        direction,
        inward,
        length,
        touchedWalls,
        innerLineStart: squareTransition
          ? start.clone()
          : start.clone().addScaledVector(inward, ribCoverClearance),
      };
    });
    const lineVertices = (edges, pointKey) => edges.map((edge, index) => {
      const previous = edges[(index + edges.length - 1) % edges.length];
      return intersectRoomKarbandiLines(
        previous[pointKey],
        previous.direction,
        edge[pointKey],
        edge.direction,
      ) || edge[pointKey].clone();
    });
    const exteriorCoordinate = (side) => ({
      west: westOctagonExteriorX,
      east: eastOctagonExteriorX,
      north: northOctagonExteriorZ,
      south: southOctagonExteriorZ,
    }[side]);
    const coordinateForSide = (point, side) => (
      side === 'west' || side === 'east' ? point.x : point.z
    );
    rawRibEdges.forEach((edge, index) => {
      if (squareTransition) {
        edge.outerLineStart = squareOuterPoints[index].clone();
        edge.extrusionDepth = edge.innerLineStart.distanceTo(edge.outerLineStart);
        return;
      }
      const outward = edge.inward.clone().negate();
      const endpointEntries = [
        wallSupportFootOctagon[index],
        wallSupportFootOctagon[(index + 1) % wallSupportFootOctagon.length],
      ];
      const requiredOffsets = endpointEntries.map((entry, endpointIndex) => {
        const component = entry.wall === 'west' || entry.wall === 'east' ? outward.x : outward.z;
        if (Math.abs(component) <= 0.000001) return null;
        const innerReference = (endpointIndex === 0 ? edge.start : edge.end)
          .clone().addScaledVector(edge.inward, ribCoverClearance);
        return (exteriorCoordinate(entry.wall) - coordinateForSide(innerReference, entry.wall)) / component;
      }).filter((offsetValue) => Number.isFinite(offsetValue) && offsetValue > 0);
      const extrusionDepth = requiredOffsets.length
        ? requiredOffsets.reduce((sum, offsetValue) => sum + offsetValue, 0) / requiredOffsets.length
        : edge.touchedWalls.reduce((sum, side) => sum + thicknessFor(side), 0)
          / Math.max(1, edge.touchedWalls.length) + ribCoverClearance + exteriorFinishProjection;
      edge.extrusionDepth = Math.max(0.05, extrusionDepth);
      edge.outerLineStart = edge.innerLineStart.clone().addScaledVector(outward, edge.extrusionDepth);
    });
    const bottomOctagon = squareTransition
      ? squareOuterPoints.map((point) => point.clone())
      : lineVertices(rawRibEdges, 'outerLineStart');
    const interiorCoordinate = (side) => ({
      west: centerX - width / 2,
      east: centerX + width / 2,
      north: centerZ - depth / 2,
      south: centerZ + depth / 2,
    }[side]);
    rawRibEdges.forEach((edge) => {
      if (squareTransition) {
        edge.wallInteriorLineStart = edge.innerLineStart.clone();
        edge.extrusionDepth = edge.wallInteriorLineStart.distanceTo(edge.outerLineStart);
        return;
      }
      let interiorDepth = null;
      if (edge.touchedWalls.length === 1) {
        const side = edge.touchedWalls[0];
        const component = side === 'west' || side === 'east' ? edge.inward.x : edge.inward.z;
        if (Math.abs(component) > 0.000001) {
          interiorDepth = (
            interiorCoordinate(side) - coordinateForSide(edge.outerLineStart, side)
          ) / component;
        }
      }
      if (!Number.isFinite(interiorDepth) || interiorDepth <= 0) {
        interiorDepth = edge.touchedWalls.reduce((sum, side) => (
          sum + thicknessFor(side) + exteriorFinishProjection
        ), 0) / Math.max(1, edge.touchedWalls.length);
      }
      edge.extrusionDepth = Math.max(0.05, interiorDepth);
      edge.wallInteriorLineStart = edge.outerLineStart
        .clone().addScaledVector(edge.inward, edge.extrusionDepth);
    });
    const bottomInnerOctagon = squareTransition
      ? squareInnerPoints.map((point) => point.clone())
      : lineVertices(rawRibEdges, 'wallInteriorLineStart');
    const bottomPerimeter = bottomOctagon.reduce((sum, point, index) => (
      sum + point.distanceTo(bottomOctagon[(index + 1) % bottomOctagon.length])
    ), 0);
    const topOctagon = bottomOctagon.map((point) => point.clone().setY(transitionTopY));
    const bottomEdges = (squareTransition ? [
      {
        start: new THREE.Vector3(westOctagonExteriorX, bottomY, northOctagonExteriorZ),
        end: new THREE.Vector3(eastOctagonExteriorX, bottomY, northOctagonExteriorZ),
        innerStart: new THREE.Vector3(squareRoomBounds.north?.min.x ?? westOctagonExteriorX, bottomY, northOctagonInteriorZ),
        innerEnd: new THREE.Vector3(squareRoomBounds.north?.max.x ?? eastOctagonExteriorX, bottomY, northOctagonInteriorZ),
        touchedWalls: ['north'],
        squareLongWall: true,
      },
      {
        start: new THREE.Vector3(eastOctagonExteriorX, bottomY, squareRoomBounds.east?.min.z ?? northOctagonInteriorZ),
        end: new THREE.Vector3(eastOctagonExteriorX, bottomY, squareRoomBounds.east?.max.z ?? southOctagonInteriorZ),
        innerStart: new THREE.Vector3(eastOctagonInteriorX, bottomY, squareRoomBounds.east?.min.z ?? northOctagonInteriorZ),
        innerEnd: new THREE.Vector3(eastOctagonInteriorX, bottomY, squareRoomBounds.east?.max.z ?? southOctagonInteriorZ),
        touchedWalls: ['east'],
        squareLongWall: false,
      },
      {
        start: new THREE.Vector3(eastOctagonExteriorX, bottomY, southOctagonExteriorZ),
        end: new THREE.Vector3(westOctagonExteriorX, bottomY, southOctagonExteriorZ),
        innerStart: new THREE.Vector3(squareRoomBounds.south?.max.x ?? eastOctagonExteriorX, bottomY, southOctagonInteriorZ),
        innerEnd: new THREE.Vector3(squareRoomBounds.south?.min.x ?? westOctagonExteriorX, bottomY, southOctagonInteriorZ),
        touchedWalls: ['south'],
        squareLongWall: true,
      },
      {
        start: new THREE.Vector3(westOctagonExteriorX, bottomY, squareRoomBounds.west?.max.z ?? southOctagonInteriorZ),
        end: new THREE.Vector3(westOctagonExteriorX, bottomY, squareRoomBounds.west?.min.z ?? northOctagonInteriorZ),
        innerStart: new THREE.Vector3(westOctagonInteriorX, bottomY, squareRoomBounds.west?.max.z ?? southOctagonInteriorZ),
        innerEnd: new THREE.Vector3(westOctagonInteriorX, bottomY, squareRoomBounds.west?.min.z ?? northOctagonInteriorZ),
        touchedWalls: ['west'],
        squareLongWall: false,
      },
    ] : bottomOctagon.map((start, index) => {
      const end = bottomOctagon[(index + 1) % bottomOctagon.length];
      const direction = end.clone().sub(start).setY(0);
      const length = Math.max(0.000001, direction.length());
      direction.divideScalar(length);
      const sourceEdge = rawRibEdges[index];
      const touchedWalls = sourceEdge.touchedWalls;
      const supportingWallThickness = touchedWalls.reduce((sum, side) => sum + thicknessFor(side), 0)
        / Math.max(1, touchedWalls.length);
      return {
        start,
        end,
        direction,
        inward: sourceEdge.inward,
        length,
        touchedWalls,
        thickness: sourceEdge.extrusionDepth,
        baseWallThickness: supportingWallThickness,
        ribCoverClearance,
        rawRibStart: sourceEdge.start,
        rawRibEnd: sourceEdge.end,
      };
    })).map((edge, index) => {
      if (!squareTransition) return edge;
      const direction = edge.end.clone().sub(edge.start).setY(0);
      const length = Math.max(0.000001, direction.length());
      direction.divideScalar(length);
      const inward = edge.innerStart.clone().add(edge.innerEnd).multiplyScalar(0.5)
        .sub(edge.start.clone().add(edge.end).multiplyScalar(0.5))
        .setY(0)
        .normalize();
      return {
        ...edge,
        direction,
        inward,
        length,
        thickness: thicknessFor(edge.touchedWalls[0]),
        baseWallThickness: thicknessFor(edge.touchedWalls[0]),
        ribCoverClearance,
        rawRibStart: rawRibEdges[index].start,
        rawRibEnd: rawRibEdges[index].end,
      };
    });
    const topInnerOctagon = bottomInnerOctagon.map((point) => point.clone().setY(transitionTopY));
    const openingShapeForEdge = (edge) => {
      if (edge.touchedWalls.length !== 1) return null;
      const side = edge.touchedWalls[0];
      const settings = walls.roomWallOpenings?.[side] || DEFAULT_WALL_SYSTEM.roomWallOpenings[side];
      const wallSpan = side === 'north' || side === 'south' ? width : depth;
      const sourceWallHeight = Math.max(0.05, Number(wallHeights?.[side]) || wallTop);
      const worldPointForLocal = (localX, y) => {
        if (side === 'south') return new THREE.Vector3(centerX + localX, y, southOctagonExteriorZ);
        if (side === 'north') return new THREE.Vector3(centerX - localX, y, northOctagonExteriorZ);
        if (side === 'east') return new THREE.Vector3(eastOctagonExteriorX, y, centerZ - localX);
        return new THREE.Vector3(westOctagonExteriorX, y, centerZ + localX);
      };
      const toEdgeU = (localX) => worldPointForLocal(localX, 0).sub(edge.start).dot(edge.direction);
      const profiles = ['door', 'window'].map((openingType) => {
        const opening = settings?.[openingType];
        if (!opening?.enabled) return null;
        const sourceBottom = openingType === 'window' ? Math.max(0, Number(opening.sillHeight) || 0) : 0;
        if (!roomKarbandiOpeningMovesAboveWall(opening, wallSpan, sourceWallHeight, sourceBottom)) return null;
        const unconstrainedProfile = southOpeningProfile(
          opening,
          0,
          wallSpan,
          Math.max(transitionTopY + 100, sourceBottom + 100),
          sourceBottom,
        );
        const openingHeight = Math.max(0.01, unconstrainedProfile.top - unconstrainedProfile.bottom);
        const highestFittingBottom = Math.max(bottomY + 0.01, transitionTopY - openingHeight - 0.01);
        const openingBottom = Math.min(
          highestFittingBottom,
          Math.max(sourceBottom, bottomY + 0.01),
        );
        const profile = southOpeningProfile(opening, 0, wallSpan, transitionTopY, openingBottom);
        if (profile.top <= bottomY + 0.000001 || profile.bottom >= transitionTopY - 0.000001) return null;
        const mappedArch = profile.archPoints?.map((point) => new THREE.Vector2(
          toEdgeU(point.x),
          THREE.MathUtils.clamp(point.y - bottomY, 0, transitionTopY - bottomY),
        )).sort((left, right) => left.x - right.x);
        const mappedLeft = toEdgeU(profile.left);
        const mappedRight = toEdgeU(profile.right);
        return {
          ...profile,
          openingType,
          opening,
          left: Math.max(0, Math.min(mappedLeft, mappedRight)),
          right: Math.min(edge.length, Math.max(mappedLeft, mappedRight)),
          bottom: profile.bottom - bottomY,
          top: Math.min(transitionTopY - bottomY, profile.top - bottomY),
          archPoints: mappedArch,
        };
      }).filter((profile) => profile && profile.right - profile.left > 0.001 && profile.top > 0.001);
      if (!profiles.length) return null;
      const crossingProfile = profiles.find((profile) => profile.bottom <= 0.000001) || null;
      const holes = profiles
        .filter((profile) => profile !== crossingProfile && profile.bottom > 0.000001)
        .map(openingHole);
      return {
        shape: rectangleShapeWithDoorNotch(
          0,
          edge.length,
          transitionTopY - bottomY,
          crossingProfile,
          holes,
        ),
        profiles,
        side,
      };
    };
    const drumPointFor = (point) => {
      const radial = new THREE.Vector3(point.x - centerX, 0, point.z - centerZ);
      if (radial.lengthSq() <= 0.000001) radial.set(1, 0, 0);
      radial.setLength(domeRadius);
      return new THREE.Vector3(centerX + radial.x, transitionTopY, centerZ + radial.z);
    };
    group.updateMatrixWorld(true);
    const karbandiRoofEnvelopeMeshes = [];
    group.traverse((child) => {
      if (!child.isMesh || child.userData?.isKarbandiVisualGuide === true) return;
      if (child.userData?.isKarbandiCover === true || child.userData?.isKarbandi === true) {
        karbandiRoofEnvelopeMeshes.push(child);
      }
    });
    const karbandiRoofEnvelopeEntries = karbandiRoofEnvelopeMeshes.map((mesh) => ({
      mesh,
      bounds: new THREE.Box3().setFromObject(mesh),
    }));
    const transitionCoverEntries = karbandiRoofEnvelopeEntries.filter(({ mesh }) => (
      mesh.userData?.isKarbandiCover === true
    ));
    const clipsOctagonBelowTransitionCover = building.domeTransitionCoverEnabled === true
      && transitionCoverEntries.length > 0;
    const transitionCoverThickness = Math.max(
      0.001,
      ...transitionCoverEntries.map(({ mesh }) => Number(mesh.userData?.roofThickness) || 0),
    );
    const roofRaycaster = new THREE.Raycaster();
    const roofHeightCache = new Map();
    const roofEnvelopeClearance = Math.max(
      0.002,
      Math.min(0.006, (Number(walls.bricks?.mortar) || 0.01) * 0.3),
    );
    const ribEnvelopeProbe = Math.max(
      0.012,
      Math.min(0.05, (Number(walls.karbandi?.ribWidth) || 0.1) * 0.32),
    );
    const roofBackingOuterRadius = Math.max(
      domeRadius + 0.001,
      ...bottomInnerOctagon.map((point) => Math.hypot(
        point.x - centerX,
        point.z - centerZ,
      )),
    );
    const continuousRoofBackingYAt = (x, z) => {
      const radius = Math.hypot(x - centerX, z - centerZ);
      const span = Math.max(0.001, roofBackingOuterRadius - domeRadius);
      const progressToDrum = THREE.MathUtils.clamp(
        (roofBackingOuterRadius - radius) / span,
        0,
        1,
      );
      const smoothProgress = progressToDrum * progressToDrum * (3 - 2 * progressToDrum);
      return THREE.MathUtils.lerp(infillBottomY, transitionTopY, smoothProgress);
    };
    const roofHitYAt = (x, z) => {
      const cacheKey = `hit:${x.toFixed(5)}:${z.toFixed(5)}`;
      if (roofHeightCache.has(cacheKey)) return roofHeightCache.get(cacheKey);
      roofRaycaster.set(
        new THREE.Vector3(x, transitionTopY + 0.5, z),
        new THREE.Vector3(0, -1, 0),
      );
      roofRaycaster.near = 0;
      roofRaycaster.far = Math.max(1, transitionTopY - bottomY + 1);
      const candidates = karbandiRoofEnvelopeEntries
        .filter(({ bounds }) => (
          x >= bounds.min.x - 0.0001 && x <= bounds.max.x + 0.0001
            && z >= bounds.min.z - 0.0001 && z <= bounds.max.z + 0.0001
        ))
        .map(({ mesh }) => mesh);
      const roofHit = roofRaycaster.intersectObjects(candidates, false)
        .find((intersection) => (
          intersection.point.y >= bottomY - 0.001
            && intersection.point.y <= transitionTopY + 0.001
        ));
      const sampledY = roofHit ? roofHit.point.y : null;
      roofHeightCache.set(cacheKey, sampledY);
      return sampledY;
    };
    const coverUndersideCache = new Map();
    const coverTopHitYAt = (x, z) => {
      const cacheKey = `${x.toFixed(5)}:${z.toFixed(5)}`;
      if (coverUndersideCache.has(cacheKey)) return coverUndersideCache.get(cacheKey);
      roofRaycaster.set(
        new THREE.Vector3(x, transitionTopY + 0.5, z),
        new THREE.Vector3(0, -1, 0),
      );
      roofRaycaster.near = 0;
      roofRaycaster.far = Math.max(1, transitionTopY - bottomY + 1);
      const candidates = transitionCoverEntries
        .filter(({ bounds }) => (
          x >= bounds.min.x - 0.0001 && x <= bounds.max.x + 0.0001
            && z >= bounds.min.z - 0.0001 && z <= bounds.max.z + 0.0001
        ))
        .map(({ mesh }) => mesh);
      const hit = roofRaycaster.intersectObjects(candidates, false)
        .find((intersection) => intersection.point.y >= bottomY - 0.001);
      const y = hit?.point.y ?? null;
      coverUndersideCache.set(cacheKey, y);
      return y;
    };
    const octagonRoofLimitYAt = (x, z, edge, wallProbeDepth) => {
      if (!clipsOctagonBelowTransitionCover) return null;
      const relative = new THREE.Vector3(x - edge.start.x, 0, z - edge.start.z);
      const along = THREE.MathUtils.clamp(relative.dot(edge.direction), 0, edge.length);
      const closestOuter = edge.start.clone().addScaledVector(edge.direction, along);
      const depthFromExterior = new THREE.Vector3(x - closestOuter.x, 0, z - closestOuter.z)
        .dot(edge.inward);
      const interiorBearingDepth = Math.max(0.008, Math.min(ribEnvelopeProbe, wallProbeDepth * 0.2));
      if (depthFromExterior < wallProbeDepth - interiorBearingDepth) return null;
      const faceInward = edge.inward;
      const inward = new THREE.Vector2(faceInward?.x || 0, faceInward?.z || 0);
      if (inward.lengthSq() <= 0.000001) inward.set(centerX - x, centerZ - z);
      if (inward.lengthSq() > 0.000001) inward.normalize();
      // Only the interior bearing band is tested. A short inward tolerance
      // catches numerical edge misses without treating invisible/extrapolated
      // roof geometry behind the full wall thickness as a cutting surface.
      const probeDistances = [0, interiorBearingDepth * 0.5, interiorBearingDepth];
      let coverTopY = null;
      for (const probeDistance of probeDistances) {
        const hitY = coverTopHitYAt(
          x + inward.x * probeDistance,
          z + inward.y * probeDistance,
        );
        if (Number.isFinite(hitY)) {
          coverTopY = hitY;
          break;
        }
      }
      if (!Number.isFinite(coverTopY)) return null;
      return THREE.MathUtils.clamp(
        coverTopY - transitionCoverThickness,
        bottomY - verticalWallJointEmbed,
        transitionTopY,
      );
    };
    const roofYAt = (x, z) => {
      const cacheKey = `envelope:${x.toFixed(5)}:${z.toFixed(5)}`;
      if (roofHeightCache.has(cacheKey)) return roofHeightCache.get(cacheKey);
      const centerHit = roofHitYAt(x, z);
      let contactHits = Number.isFinite(centerHit) ? [centerHit] : [];
      // If this vertex falls between narrow ribs, find the nearest surrounding
      // rib/cover back edge. Searching complete rings avoids the cardinal-only
      // holes that occurred where diagonal Karbandi ribs crossed the infill.
      if (!contactHits.length) {
        const directions = 8;
        const contactRadius = ribEnvelopeProbe * 2;
        for (let directionIndex = 0; directionIndex < directions; directionIndex += 1) {
          const angle = (directionIndex / directions) * Math.PI * 2;
          const hit = roofHitYAt(
            x + Math.cos(angle) * contactRadius,
            z + Math.sin(angle) * contactRadius,
          );
          if (Number.isFinite(hit)) contactHits.push(hit);
        }
      }
      // A missed ray is an opening between ribs, not an instruction to remove
      // the masonry. Bridge those openings with a continuous envelope rising
      // from the rib-junction course to the drum. Real roof/rib hits always win.
      const continuousBackingY = continuousRoofBackingYAt(x, z);
      const sampledY = Math.min(
        transitionTopY,
        contactHits.length
          ? Math.max(...contactHits) + roofEnvelopeClearance
          : continuousBackingY,
      );
      roofHeightCache.set(cacheKey, sampledY);
      return sampledY;
    };
    const verticalWallJointEmbed = squareTransition
      ? 0
      : Math.max(
        0.0015,
        Math.min(0.004, (Number(walls.bricks?.mortar) || 0.01) * 0.25),
      );
    const lowerRoomBodyFor = (side) => {
      const lowerWall = group.getObjectByName(`Room ${side} south-style wall`);
      return lowerWall?.children.find((child) => child.userData?.isRoomWallBody === true) || null;
    };
    const exactLowerWallMaterialClone = (source, metadata = {}) => {
      if (!source) return null;
      const sourceUserData = source.userData;
      source.userData = { ...sourceUserData, generatedTexture: null };
      let material;
      try {
        material = source.clone();
      } finally {
        source.userData = sourceUserData;
      }
      material.map = source.map;
      material.onBeforeCompile = source.onBeforeCompile;
      material.customProgramCacheKey = source.customProgramCacheKey;
      material.userData = { ...sourceUserData, ...metadata };
      material.needsUpdate = true;
      return material;
    };
    const transitionMaterialsFor = (side, bondSide, edge, wallHeight, phase) => {
      const lowerBody = lowerRoomBodyFor(side);
      const lowerMaterials = Array.isArray(lowerBody?.material) ? lowerBody.material : [];
      const lowerExterior = lowerMaterials[lowerBody?.userData?.roomWallExteriorMaterialIndex];
      if (!lowerExterior) {
        return directRoomWallFaceMaterial(
          walls,
          walls.bricks.enabled ? bondSide : null,
          edge.length,
          wallHeight,
          0,
          bottomPerimeter,
        );
      }
      // The transition is a vertical continuation of this exact Room wall.
      // Clone its actual exterior material while sharing the generated texture,
      // texture transform, color pipeline, and shader callbacks. Rebuilding a
      // nominally equivalent material here allowed mip sampling and callbacks to
      // diverge visibly at the horizontal wall joint.
      const sharedMetadata = {
        brickBondSide: bondSide,
        brickBondPhaseU: phase,
        brickBondSeamlessCycleLength: bottomPerimeter,
        roomTransitionWallMaterialSource: 'exact-clone-of-touched-lower-room-wall-exterior',
      };
      const exterior = exactLowerWallMaterialClone(lowerExterior, sharedMetadata);
      if (!squareTransition) return exterior;
      const lowerInterior = lowerMaterials[lowerBody.userData.roomWallInteriorMaterialIndex];
      const lowerReturn = lowerMaterials[lowerBody.userData.roomWallReturnMaterialIndex];
      return [
        exterior,
        exactLowerWallMaterialClone(lowerInterior || lowerExterior, {
          ...sharedMetadata,
          brickBondSide: side,
          roomTransitionWallMaterialSource: 'exact-clone-of-touched-lower-room-wall-interior',
        }),
        exactLowerWallMaterialClone(lowerReturn || lowerInterior || lowerExterior, {
          ...sharedMetadata,
          brickBondSide: side,
          roomTransitionWallMaterialSource: 'exact-clone-of-touched-lower-room-wall-return',
        }),
      ];
    };
    let phase = 0;
    bottomEdges.forEach((edge, index) => {
      const primaryWall = edge.touchedWalls[0] || 'north';
      const bondSide = `${primaryWall}_exterior`;
      const wallHeight = transitionTopY - bottomY;
      // Transition masonry is a continuation of the Room structural wall, not
      // a finish skin. Use the same direct face material as the lower walls so
      // color, roughness, texture sampling, and render depth behave identically.
      // Geometry UVs already contain the accumulated perimeter phase.
      const material = transitionMaterialsFor(primaryWall, bondSide, edge, wallHeight, phase);
      const faceMaterials = Array.isArray(material) ? material : [material];
      faceMaterials.forEach((faceMaterial, materialIndex) => {
        faceMaterial.userData.brickBondSeamlessCycleLength = bottomPerimeter;
        faceMaterial.userData.brickBondPhaseU = phase;
        faceMaterial.userData.surfaceBrickColor = walls.color;
        faceMaterial.userData.roomTransitionWallMaterialMode = 'direct-structural-face-no-overlay';
        faceMaterial.userData.roomTransitionWallFace = squareTransition
          ? ['exterior', 'interior', 'return'][materialIndex]
          : 'combined';
      });
      const bottomInnerStart = squareTransition
        ? edge.innerStart
        : bottomInnerOctagon[index];
      const bottomInnerEnd = squareTransition
        ? edge.innerEnd
        : bottomInnerOctagon[(index + 1) % bottomInnerOctagon.length];
      const topOuterStart = squareTransition
        ? edge.start.clone().setY(transitionTopY)
        : topOctagon[index];
      const topOuterEnd = squareTransition
        ? edge.end.clone().setY(transitionTopY)
        : topOctagon[(index + 1) % topOctagon.length];
      const topInnerStart = squareTransition
        ? edge.innerStart.clone().setY(transitionTopY)
        : topInnerOctagon[index];
      const topInnerEnd = squareTransition
        ? edge.innerEnd.clone().setY(transitionTopY)
        : topInnerOctagon[(index + 1) % topInnerOctagon.length];
      const openingCut = openingShapeForEdge(edge);
      let geometry = openingCut
        ? roomKarbandiMiteredOpeningWallGeometry({
          shape: openingCut.shape,
          outerStart: edge.start,
          outerEnd: edge.end,
          innerStart: bottomInnerStart,
          innerEnd: bottomInnerEnd,
          inward: edge.inward,
          thickness: edge.thickness,
          bottomY,
          phase,
          baseEmbed: verticalWallJointEmbed,
          includeEndFaces: squareTransition && edge.squareLongWall,
        })
        : roomKarbandiFrustumWallGeometry({
          bottomOuterStart: edge.start,
          bottomOuterEnd: edge.end,
          bottomInnerStart,
          bottomInnerEnd,
          topOuterStart,
          topOuterEnd,
          topInnerStart,
          topInnerEnd,
          bottomY: bottomY - verticalWallJointEmbed,
          topY: transitionTopY,
          phase,
          edgeLength: edge.length,
          includeEndFaces: squareTransition && edge.squareLongWall,
        });
      if (clipsOctagonBelowTransitionCover) {
        const wallProbeDepth = Math.max(edge.thickness, edge.baseWallThickness);
        const interiorBearingProbeDepth = Math.max(0.008, Math.min(ribEnvelopeProbe, wallProbeDepth * 0.2));
        geometry = clipRoomKarbandiWallGeometryBelowRoof(
          geometry,
          (x, z) => octagonRoofLimitYAt(x, z, edge, wallProbeDepth),
          0.14,
          interiorBearingProbeDepth,
        );
      }
      if (squareTransition) {
        geometry = applySquareTransitionWallFaceMapping(
          geometry,
          edge,
          primaryWall,
          centerX,
          centerZ,
        );
      }
      const octagonWall = new THREE.Mesh(geometry, material);
      octagonWall.name = `Room Karbandi exterior-finish-aligned octagon wall ${index + 1}`;
      octagonWall.castShadow = true;
      octagonWall.receiveShadow = true;
      octagonWall.userData.wallSide = 'room_dome_transition';
      octagonWall.userData.roomDomePart = 'exterior-aligned-octagon-wall';
      octagonWall.userData.roomDomeTransitionType = 'karbandi';
      octagonWall.userData.roomKarbandiMasonryStage = 'vertical-octagon-exterior-on-wall-exterior-and-inner-face-behind-ribs';
      octagonWall.userData.roomKarbandiMasonryBaseY = bottomY;
      octagonWall.userData.roomKarbandiVerticalWallJointEmbed = verticalWallJointEmbed;
      octagonWall.userData.roomKarbandiVerticalWallJoint = 'embedded-without-overlapping-horizontal-cap';
      octagonWall.userData.roomKarbandiMasonryTopY = transitionTopY;
      octagonWall.userData.roomKarbandiOctagonFaceIndex = index;
      octagonWall.userData.roomKarbandiOctagonStart = edge.start.toArray();
      octagonWall.userData.roomKarbandiOctagonEnd = edge.end.toArray();
      octagonWall.userData.roomKarbandiOctagonTopStart = topOuterStart.toArray();
      octagonWall.userData.roomKarbandiOctagonTopEnd = topOuterEnd.toArray();
      octagonWall.userData.roomKarbandiOctagonInnerStart = bottomInnerStart.toArray();
      octagonWall.userData.roomKarbandiOctagonInnerEnd = bottomInnerEnd.toArray();
      octagonWall.userData.roomKarbandiOctagonRedGuideSourceStart = edge.rawRibStart.toArray();
      octagonWall.userData.roomKarbandiOctagonRedGuideSourceEnd = edge.rawRibEnd.toArray();
      octagonWall.userData.roomKarbandiOctagonExtrusionRule = 'room-wall-interior-plane-to-wall-exterior-finish-boundary';
      octagonWall.userData.roomKarbandiOctagonJoint = squareTransition
        ? 'same-long-north-south-short-east-west-butt-joints-as-room-walls'
        : 'zero-overlap-shared-inner-and-outer-vertices';
      octagonWall.userData.roomKarbandiSquareButtJointRole = squareTransition
        ? (edge.squareLongWall ? 'long-wall' : 'short-wall')
        : null;
      octagonWall.userData.roomKarbandiOctagonInternalMiterCaps = false;
      octagonWall.userData.roomKarbandiOctagonTouchedWalls = edge.touchedWalls;
      octagonWall.userData.roomKarbandiOctagonWallThickness = edge.thickness;
      octagonWall.userData.roomKarbandiOctagonBaseWallThickness = edge.baseWallThickness;
      octagonWall.userData.roomKarbandiOctagonRibCoverClearance = edge.ribCoverClearance;
      octagonWall.userData.roomKarbandiOctagonInnerFaceRule = squareTransition
        ? 'exactly-coplanar-with-room-wall-interior-and-exterior-faces-before-all-other-constraints'
        : 'cardinal-faces-coplanar-with-original-room-wall-interior-surfaces-and-mitered-corners';
      octagonWall.userData.roomKarbandiOctagonTransitionCoverClip = clipsOctagonBelowTransitionCover
        ? 'interior-bearing-clipped-above-transition-cover-underside-exterior-preserved'
        : 'not-required-cover-transition-off';
      octagonWall.userData.roomKarbandiOctagonTransitionCoverClearance = clipsOctagonBelowTransitionCover
        ? 0
        : 0;
      octagonWall.userData.roomKarbandiOctagonTransitionCoverProbeDepth = clipsOctagonBelowTransitionCover
        ? Math.max(0.008, Math.min(
          ribEnvelopeProbe,
          Math.max(edge.thickness, edge.baseWallThickness) * 0.2,
        ))
        : 0;
      octagonWall.userData.roomKarbandiOctagonTransitionCoverProbeRule = clipsOctagonBelowTransitionCover
        ? 'interior-bearing-band-only-exterior-masonry-preserved'
        : null;
      octagonWall.userData.roomKarbandiInheritedOpenings = openingCut?.profiles.map((profile) => ({
        openingType: profile.openingType,
        wallSide: openingCut.side,
        left: profile.left,
        right: profile.right,
        bottomY: Math.max(bottomY, profile.bottom + bottomY),
        topY: profile.top + bottomY,
        head: profile.head,
        springY: profile.springTop,
        greenHeight: profile.greenHeight,
      })) || [];
      octagonWall.userData.roomKarbandiOctagonBondSide = bondSide;
      octagonWall.userData.roomKarbandiOctagonBrickColor = walls.color;
      octagonWall.userData.roomSquareTransitionExteriorMaterialIndex = squareTransition ? 0 : null;
      octagonWall.userData.roomSquareTransitionInteriorMaterialIndex = squareTransition ? 1 : null;
      octagonWall.userData.roomSquareTransitionReturnMaterialIndex = squareTransition ? 2 : null;
      octagonWall.userData.brickBondPhaseU = phase;
      octagonWall.userData.roomKarbandiBrickCourseMapping = 'continuous-wall-exterior-aligned-octagon-perimeter-and-absolute-world-height';
      if (octagonWallsVisible) {
        group.add(octagonWall);
        meshes.push(octagonWall);
      }

      if (openingCut && walls.bricks.enabled) {
        const trimGroup = new THREE.Group();
        trimGroup.name = `Room Karbandi ${openingCut.side} octagon inherited opening soldiers`;
        trimGroup.position.set(edge.start.x, 0, edge.start.z);
        trimGroup.rotation.y = Math.atan2(-edge.direction.z, edge.direction.x);
        trimGroup.userData.wallSide = 'room_dome_transition';
        trimGroup.userData.roomDomePart = 'octagon-inherited-opening-soldiers';
        trimGroup.userData.roomKarbandiOctagonFaceIndex = index;
        const soldierHeight = Math.max(walls.bricks.brickHeight, walls.bricks.brickWidth);
        const trimZ = -0.008;
        const trimOptions = {
          roomWall: true,
          wallFace: 'exterior',
          materialSide: bondSide,
          coordinateSpace: 'local',
        };
        openingCut.profiles.forEach((profile) => {
          const absoluteProfile = {
            ...profile,
            center: (profile.left + profile.right) / 2,
            width: profile.right - profile.left,
            bottom: profile.bottom + bottomY,
            top: profile.top + bottomY,
            springTop: Number(profile.springTop),
            greenHeight: Number(profile.greenHeight),
            archPoints: profile.archPoints?.map((point) => new THREE.Vector2(point.x, point.y + bottomY)),
          };
          if (absoluteProfile.archPoints?.length) {
            addRaisedOpeningArchCourse(
              trimGroup,
              profile.openingType,
              absoluteProfile,
              profile.opening,
              soldierHeight,
              trimZ,
              walls,
              openingCut.side,
              trimOptions,
            );
          } else {
            addRaisedOpeningSoldierCourse(
              trimGroup,
              profile.openingType,
              absoluteProfile.center,
              absoluteProfile.top + soldierHeight / 2,
              absoluteProfile.width,
              soldierHeight,
              trimZ,
              walls,
              'lintel',
              openingCut.side,
              trimOptions,
            );
          }
          if (profile.openingType === 'window') {
            addRaisedOpeningSoldierCourse(
              trimGroup,
              'window',
              absoluteProfile.center,
              absoluteProfile.bottom - soldierHeight / 2,
              absoluteProfile.width,
              soldierHeight,
              trimZ,
              walls,
              'sill',
              openingCut.side,
              trimOptions,
            );
            addRaisedOpeningJambCourses(
              trimGroup,
              'window',
              absoluteProfile,
              absoluteProfile.bottom,
              soldierHeight,
              trimZ,
              walls,
              openingCut.side,
              trimOptions,
            );
          } else {
            addRaisedOpeningJambCourses(
              trimGroup,
              'door',
              absoluteProfile,
              bottomY,
              soldierHeight,
              trimZ,
              walls,
              openingCut.side,
              trimOptions,
            );
          }
        });
        trimGroup.children.forEach((child) => {
          child.userData.wallSide = 'room_dome_transition';
          child.userData.roomDomePart = 'octagon-inherited-opening-soldier';
          child.userData.roomKarbandiOctagonFaceIndex = index;
          child.userData.roomKarbandiInheritedOpeningWall = openingCut.side;
        });
        if (octagonWallsVisible && trimGroup.children.length) {
          group.add(trimGroup);
          meshes.push(...trimGroup.children);
        }
      }

      phase += edge.length;
    });
    const checkerSurfaceClearance = Math.max(
      0.003,
      Math.min(0.008, (Number(walls.bricks?.mortar) || 0.01) * 0.4),
    );
    const infillTopBaseMaterial = walls.bricks.enabled
      ? squareTopBrickMaterial(walls)
      : wallMaterial(walls);
    const checkerDrumSegments = 128;
    const checkerDrumClipTolerance = Math.max(0.0015, (Number(walls.bricks?.mortar) || 0.01) * 0.15);
    const checkerDrumFootprintRadius = domeRadius + checkerDrumClipTolerance;
    // Circumscribe the polygon around the true drum footprint. An inscribed
    // polygon leaves small checker wedges beneath the circular drum between
    // every chord and arc.
    const checkerDrumHoleVertexRadius = checkerDrumFootprintRadius
      / Math.cos(Math.PI / checkerDrumSegments);
    const checkerDrumCircle = Array.from({ length: checkerDrumSegments }, (_, circleIndex) => {
      const angle = Math.PI * 2 * circleIndex / checkerDrumSegments;
      return new THREE.Vector3(
        centerX + Math.cos(angle) * checkerDrumHoleVertexRadius,
        transitionTopY,
        centerZ + Math.sin(angle) * checkerDrumHoleVertexRadius,
      );
    });
    const infillTopMaterial = materialWithCircularPlanVoid(
      infillTopBaseMaterial,
      centerX,
      centerZ,
      checkerDrumFootprintRadius,
    );
    const infillTop = new THREE.Mesh(roomKarbandiInfillSquareTopGeometry({
      outerPoints: bottomInnerOctagon,
      drumPoints: checkerDrumCircle,
      topY: transitionTopY + checkerSurfaceClearance,
      thickness: walls.bricks.brickHeight,
    }), infillTopMaterial);
    infillTop.name = 'Room Karbandi continuous checker-brick roof top';
    infillTop.castShadow = true;
    infillTop.receiveShadow = true;
    infillTop.userData.wallSide = 'room_dome_transition';
    infillTop.userData.roomDomePart = 'karbandi-roof-to-drum-infill-top';
    infillTop.userData.roomDomeTransitionType = 'karbandi';
    infillTop.userData.roomKarbandiInfillTopBrickShape = 'square';
    infillTop.userData.roomKarbandiInfillTopBrickPattern = 'checker-grid';
    infillTop.userData.roomKarbandiInfillTopBrickSize = walls.bricks.brickWidth;
    infillTop.userData.roomKarbandiInfillTopMapping = 'world-plan-checker-grid-at-normal-brick-length';
    infillTop.userData.roomKarbandiInfillTopConstruction = 'one-closed-checker-roof-slab-no-wedge-overlap';
    infillTop.userData.roomKarbandiInfillTopThickness = walls.bricks.brickHeight;
    infillTop.userData.roomKarbandiInfillTopDrumClip = '128-segment-circumscribed-drum-footprint-plus-circular-fragment-clip';
    infillTop.userData.roomKarbandiInfillTopDrumFootprintCenter = [centerX, centerZ];
    infillTop.userData.roomKarbandiInfillTopDrumFootprintRadius = domeRadius;
    infillTop.userData.roomKarbandiInfillTopDrumClipRadius = checkerDrumFootprintRadius;
    infillTop.userData.roomKarbandiInfillTopDrumHoleVertexRadius = checkerDrumHoleVertexRadius;
    infillTop.userData.roomKarbandiInfillTopDrumClipTolerance = checkerDrumClipTolerance;
    infillTop.userData.roomKarbandiInfillTopClearance = checkerSurfaceClearance;
    infillTop.userData.excludeWallEdges = true;
    infillTop.renderOrder = 3;
    if (octagonWallsVisible) {
      group.add(infillTop);
      meshes.push(infillTop);
    }
    group.userData.roomKarbandiMasonryTransition = {
      stage: 'vertical-wall-exterior-aligned-octagon-plus-brick-height-checker-roof-only',
      baseY: bottomY,
      roofInfillBaseY: infillBottomY,
      drumBottomY: transitionTopY,
      sourceWallSupportFootOctagon: wallSupportFootOctagon.map((entry) => ({
        point: entry.point.toArray(),
        wall: entry.wall,
        ribIndex: entry.ribIndex,
        side: entry.side,
      })),
      sourceFirstJunctionOctagon: firstJunctionOctagon.map((entry) => ({
        point: entry.point.toArray(),
        wall: entry.wall,
        ribIndex: entry.ribIndex,
        side: entry.side,
      })),
      bottomOctagon: bottomOctagon.map((point) => point.toArray()),
      innerOctagon: bottomInnerOctagon.map((point) => point.toArray()),
      topOctagon: topOctagon.map((point) => point.toArray()),
      octagonPerimeter: bottomPerimeter,
      transitionSideCount,
      transitionPlan: transitionSideCount === 8 ? 'octagon' : 'square',
      topologyRule: 'four-visible-wall-legs-create-square-eight-visible-wall-legs-create-octagon-all-four-walls-required',
      octagonAlignment: 'exterior-face-on-room-wall-exterior-finish-planes-inner-cardinal-faces-on-room-wall-interior-planes',
      octagonJoint: `${transitionSideCount}-mitered-vertical-walls-with-shared-corner-vertices-and-no-overlap`,
      octagonSolidPolicy: 'one-closed-ring-with-shared-boundaries-and-no-overlapping-internal-miter-caps',
      octagonSidePolicy: squareTransition
        ? 'four-cardinal-room-wall-planes-with-independent-wall-thicknesses'
        : 'unequal-rib-derived-red-edges-extruded-to-wall-exterior-green-boundaries',
      wallThicknessSource: 'original-room-wall-interior-to-exterior-finish-distance-with-mitered-corner-averaging',
      roofGapFill: 'removed',
      roofBacking: 'removed',
      roofInfillBoundary: 'none-checker-roof-slab-only',
      octagonTopMapping: 'normal-plan-view-brick-course-across-wall-thickness',
      infillTopMapping: 'one-continuous-world-plan-checker-grid-at-normal-brick-length',
      infillTopClearance: checkerSurfaceClearance,
      infillTopThickness: walls.bricks.brickHeight,
      octagonTransitionCoverClip: clipsOctagonBelowTransitionCover
        ? 'interior-bearing-band-clipped-above-cover-exterior-masonry-preserved'
        : 'not-required-cover-transition-off',
      octagonTransitionCoverClearance: 0,
      verticalWallJoint: 'embedded-without-overlapping-horizontal-cap',
      verticalWallJointEmbed,
      octagonExteriorReference: 'original-room-wall-exterior-finish-surfaces',
      exteriorFinishProjection,
      extendedWallsRemoved: true,
      octagonWallsVisible,
    };
  }
  if (building.domeTransitionCoverEnabled === true && !(transitionType === 'karbandi' && usesSharedKarbandi)) {
    if (transitionType === 'squinch') {
      // Built after the eight structural arches so every cover boundary can
      // use the actual scaled arch profile instead of a generic radial skin.
    } else {
      const transition = new THREE.Mesh(roomDomeTransitionGeometry({
        centerX,
        centerZ,
        width,
        depth,
        wallTop,
        springY: transitionTopY,
        domeRadius,
        type: transitionType,
        settings: transitionSettings,
      }), transitionMaterial);
      transition.name = `Room ${transitionType} square-to-circle transition cover`;
      transition.userData.wallSide = 'room_dome_transition';
      transition.userData.roomDomePart = 'transition-cover';
      transition.userData.isRoomDomeTransition = true;
      transition.userData.isRoomDomeTransitionCover = true;
      transition.userData.roomDomeTransitionType = transitionType;
      transition.userData.roomDomeTransitionSettings = { ...transitionSettings };
      transition.userData.roomDomeSpringY = transitionTopY;
      transition.castShadow = true;
      transition.receiveShadow = true;
      group.add(transition);
      meshes.push(transition);
    }
  }

  const innerDomeArchProfile = portalInnerDomeArchProfile || domeArchProfile.map((point, index) => {
    const previous = domeArchProfile[Math.max(0, index - 1)];
    const next = domeArchProfile[Math.min(domeArchProfile.length - 1, index + 1)];
    const tangent = next.clone().sub(previous).normalize();
    const normalA = new THREE.Vector2(-tangent.y, tangent.x);
    const normalB = normalA.clone().multiplyScalar(-1);
    const towardInterior = new THREE.Vector2(-point.x, springY - point.y);
    const inward = normalA.dot(towardInterior) >= normalB.dot(towardInterior) ? normalA : normalB;
    const offset = point.clone().addScaledVector(inward, masonryShellThickness);
    if (offset.x < 0) {
      offset.set(
        0,
        point.y - Math.sqrt(Math.max(0, masonryShellThickness ** 2 - point.x ** 2)),
      );
    }
    return offset;
  });
  const innerDomeProfile = innerDomeArchProfile;
  const innerCoverBaseProfileRadius = innerDomeProfile.at(-1)?.x ?? 0;
  const portalGreenCircleBearingRadius = Number(
    portalDomeGreenCircleConstruction?.sidePoint?.[0],
  );
  const innerCoverBaseBearingRadius = Number.isFinite(portalGreenCircleBearingRadius)
    ? portalGreenCircleBearingRadius
    : domeCoverType === 'pyramid'
    ? innerCoverBaseProfileRadius * Math.cos(Math.PI / domePlanSegments)
    : innerCoverBaseProfileRadius;
  const domeShellProfile = [
    ...domeProfile,
    ...[...innerDomeProfile].reverse(),
    domeProfile[0].clone(),
  ];
  const domeGeometry = new THREE.LatheGeometry(domeShellProfile, domePlanSegments);
  const domeUv = domeGeometry.getAttribute('uv');
  for (let vertex = 0; vertex < domeUv.count; vertex += 1) {
    const shellIndex = vertex % domeShellProfile.length;
    const outerIndex = shellIndex < domeProfile.length
      ? shellIndex
      : shellIndex < domeProfile.length * 2
        ? domeProfile.length - 1 - (shellIndex - domeProfile.length)
        : 0;
    domeUv.setY(vertex, domeProfileDistances[outerIndex] / domeMeridianLength);
  }
  domeUv.needsUpdate = true;
  domeGeometry.userData.domeUvMapping = 'seamless-circumference-and-meridian-arc-length';
  domeGeometry.userData.domeUvCircumferenceClosure = 'single-continuous-zero-to-one-loop-shared-by-exterior-and-interior';
  domeGeometry.userData.domeUvFacetPolicy = domeCoverType === 'pyramid'
    ? 'facet-edge-distance-rays-converge-to-pyramid-apex'
    : domeCoverType === 'cone'
      ? 'angular-rays-converge-to-cone-apex'
      : 'continuous-angular-distance-around-revolved-shell';
  domeGeometry.userData.domeMeridianLength = domeMeridianLength;
  domeGeometry.userData.domeShellThickness = masonryShellThickness;
  domeGeometry.userData.domeShellOuterProfile = domeProfile.map((point) => point.toArray());
  domeGeometry.userData.domeShellInnerProfile = innerDomeProfile.map((point) => point.toArray());
  if (domeCoverType === 'pyramid') domeGeometry.rotateY(-Math.PI / domePlanSegments);
  domeGeometry.translate(centerX, 0, centerZ);
  domeGeometry.computeVertexNormals();
  assignRadialShellMaterialGroups(domeGeometry, centerX, centerZ);
  const dome = new THREE.Mesh(domeGeometry, [
    domeInteriorMaterial,
    domeMaterial,
    outerDomeAutomaticRunningMaterial,
  ]);
  if (domeCoverType === 'pyramid') {
    dome.material.forEach((material) => {
      material.flatShading = true;
      material.needsUpdate = true;
    });
  }
  dome.name = 'Room circular dome cover';
  dome.userData.wallSide = 'room_dome';
  dome.userData.roomDomePart = 'dome-shell';
  dome.userData.isRoomDome = true;
  dome.userData.roomDomeRadius = domeRadius;
  dome.userData.roomDomeGeometryBaseRadius = domeGeometryBaseRadius;
  dome.userData.roomDomeExteriorBondPerimeter = domePlanPerimeter;
  dome.userData.roomDomeInteriorBondPerimeter = domeInteriorPlanPerimeter;
  dome.userData.roomDomeCoverType = domeCoverType;
  dome.userData.roomDomeCoverHeight = domeCoverHeight;
  dome.userData.roomDomePlanSides = domePlanSegments;
  dome.userData.roomDomeCenter = [centerX, centerZ];
  dome.userData.roomDomeDiameterSource = transitionType === 'karbandi' && usesSharedKarbandi
    ? 'retained-karbandi-rib-crown-centerline-ring'
    : directBearing
      ? roomPlanShape === 'circle' ? 'inscribed-room-circle' : 'regular-room-plan-apothem'
      : 'smaller-room-clear-span';
  dome.userData.roomDomeRise = domeRise;
  dome.userData.roomDomeShellThickness = masonryShellThickness;
  dome.userData.roomDomeShellThicknessSource = 'one-normal-brick-length';
  dome.userData.portalCoverInteriorFaceFlush = portalInteriorFaceFlush;
  dome.userData.portalCoverInteriorBearingTargetRadius = portalInteriorFaceFlush
    ? Math.max(
      0.05,
      Number.isFinite(explicitPortalInteriorTargetRadius)
        ? explicitPortalInteriorTargetRadius
        : transitionBearingRadius - masonryShellThickness * 2,
    )
    : null;
  dome.userData.portalCoverInteriorBaseRadius = innerCoverBaseBearingRadius;
  dome.userData.portalCoverExteriorRadiusAdjustment = portalInteriorFaceFlush
    ? domeRadius - transitionBearingRadius
    : 0;
  dome.userData.roomDomeExteriorMaterialIndex = 1;
  dome.userData.roomDomeInteriorMaterialIndex = 0;
  dome.userData.roomDomeReturnMaterialIndex = 2;
  dome.userData.roomDomeBrickColor = domeColor;
  dome.userData.roomDomePatternCoverage = domePatternCoverage;
  dome.userData.roomDomePatternCutoffY = springY + domeRise * domePatternCoverage / 100;
  dome.userData.roomDomeSpringY = springY;
  dome.userData.roomDomeFootY = springY;
  dome.userData.roomDomeLegExtension = outerDomeLegExtension;
  dome.userData.roomDomeLegScope = 'independent-extra-leg-section-below-springing-ring';
  dome.userData.roomDomeProfileSystem = domeCoverType === 'dome'
    ? 'four-centre-red-green-circle-arch-revolved'
    : domeCoverType === 'cone'
      ? 'straight-cone-profile-revolved'
      : 'straight-octagonal-pyramid-profile';
  dome.userData.roomDomeArchConstruction = domeConstruction ? {
    redCenter: domeConstruction.redCenter.toArray(),
    redRadius: domeConstruction.redRadius,
    greenCenter: domeConstruction.greenCenter.toArray(),
    greenRadius: domeConstruction.greenRadius,
    sidePoint: domeConstruction.sidePoint.toArray(),
    tangentPoint: domeConstruction.tangentPoint.toArray(),
    apexPoint: domeConstruction.apexPoint.toArray(),
  } : null;
  dome.userData.portalDomeGreenCircleConstruction = portalDomeGreenCircleConstruction;
  dome.userData.portalKarbandiCrownCoverRadius = portalKarbandiCrownCoverRadius;
  dome.userData.roomDomeTransitionType = transitionType;
  dome.userData.roomSquinchFootprintRadius = transitionType === 'squinch'
    ? squinchOuterApothem
    : null;
  dome.userData.roomSquinchArchCenterlineApothem = transitionType === 'squinch'
    ? squinchFootprintApothem
    : null;
  dome.userData.roomSquinchFootprintSource = transitionType === 'squinch'
    ? 'squinch-arch-crown-centerline'
    : null;
  dome.castShadow = true;
  dome.receiveShadow = true;
  group.add(dome);
  meshes.push(dome);

  if (building.innerDomeEnabled === true) {
    // The inner dome is an independent masonry shell, not the underside of the
    // exterior dome. Its springing edge meets the drum's inner face, while its
    // independently designed four-centre profile leaves a real cavity above.
    // At a Squinch, the room-facing spring edge is tangent to every interior
    // face of the sixteen-sided drum. Use its inner apothem (not the outer
    // dome radius) so the section is flush while the shell can still grow
    // outward by one normal brick length.
    const innerDomeRadius = Math.max(
      0.08,
      transitionType === 'squinch'
        ? squinchOuterApothem - drumShellThickness
        : domeRadius - masonryShellThickness,
    );
    const innerArch = building.innerDomeArch || {};
    const innerRedOffset = Number.isFinite(Number(innerArch.redOffset)) ? Number(innerArch.redOffset) : -0.75;
    const innerRedRadius = innerArch.redRadius == null ? null : Math.max(0.05, Number(innerArch.redRadius) || 1);
    const innerGreenOffset = Math.max(0.05, Number(innerArch.greenOffset) || 0.95);
    const innerSpringY = drumTopY;
    const innerGreenHeight = innerSpringY + (Number.isFinite(Number(innerArch.greenHeightOffset))
      ? Number(innerArch.greenHeightOffset)
      : -1.75);
    const innerConstruction = pointedArchConstruction(
      0,
      innerDomeRadius,
      innerSpringY,
      innerGreenOffset,
      innerGreenHeight,
      { redOffset: innerRedOffset, redRadius: innerRedRadius },
    );
    let roomFacingProfile = archCurve(
      0,
      innerDomeRadius,
      innerSpringY,
      innerSpringY,
      innerGreenOffset,
      innerGreenHeight,
      32,
      { redOffset: innerRedOffset, redRadius: innerRedRadius },
    ).filter((point) => point.x >= -0.000001);
    const innerDomeRise = innerConstruction
      ? innerConstruction.apexPoint.y - innerSpringY
      : Math.max(0.2, domeRise - masonryShellThickness);
    if (roomFacingProfile.length < 3) {
      roomFacingProfile = Array.from({ length: 33 }, (_, index) => {
        const angle = Math.PI * 0.5 * index / 32;
        return new THREE.Vector2(
          innerDomeRadius * Math.cos(angle),
          innerSpringY + innerDomeRise * Math.sin(angle),
        );
      });
    }
    const cavityFacingProfile = roomFacingProfile.map((point, index) => {
      const previous = roomFacingProfile[Math.max(0, index - 1)];
      const next = roomFacingProfile[Math.min(roomFacingProfile.length - 1, index + 1)];
      const tangent = next.clone().sub(previous).normalize();
      const normalA = new THREE.Vector2(-tangent.y, tangent.x);
      const normalB = normalA.clone().multiplyScalar(-1);
      const towardCavity = new THREE.Vector2(point.x, point.y - innerSpringY);
      const outward = normalA.dot(towardCavity) >= normalB.dot(towardCavity) ? normalA : normalB;
      const offset = point.clone().addScaledVector(outward, masonryShellThickness);
      if (offset.x < 0) {
        offset.set(
          0,
          point.y + Math.sqrt(Math.max(0, masonryShellThickness ** 2 - point.x ** 2)),
        );
      }
      return offset;
    });
    const innerProfileDistances = roomFacingProfile.map((_, index) => (
      index === 0 ? 0 : roomFacingProfile[index].distanceTo(roomFacingProfile[index - 1])
    ));
    for (let index = 1; index < innerProfileDistances.length; index += 1) {
      innerProfileDistances[index] += innerProfileDistances[index - 1];
    }
    const innerMeridianLength = Math.max(0.01, innerProfileDistances.at(-1) || 0);
    const innerShellProfile = [
      ...cavityFacingProfile,
      ...[...roomFacingProfile].reverse(),
      cavityFacingProfile[0].clone(),
    ];
    const innerGeometry = new THREE.LatheGeometry(innerShellProfile, 64);
    const innerUv = innerGeometry.getAttribute('uv');
    for (let vertex = 0; vertex < innerUv.count; vertex += 1) {
      const shellIndex = vertex % innerShellProfile.length;
      const profileIndex = shellIndex < roomFacingProfile.length
        ? shellIndex
        : shellIndex < roomFacingProfile.length * 2
          ? roomFacingProfile.length - 1 - (shellIndex - roomFacingProfile.length)
          : 0;
      innerUv.setY(vertex, innerProfileDistances[profileIndex] / innerMeridianLength);
    }
    innerUv.needsUpdate = true;
    innerGeometry.translate(centerX, 0, centerZ);
    innerGeometry.computeVertexNormals();
    innerGeometry.userData.domeUvMapping = 'seamless-circumference-and-meridian-arc-length';
    innerGeometry.userData.domeMeridianLength = innerMeridianLength;
    innerGeometry.userData.domeShellThickness = masonryShellThickness;
    innerGeometry.userData.domeShellRoomFacingProfile = roomFacingProfile.map((point) => point.toArray());
    innerGeometry.userData.domeShellCavityFacingProfile = cavityFacingProfile.map((point) => point.toArray());
    const innerDomeWalls = { ...walls, color: innerDomeColor };
    const innerDomeInteriorMaterial = configureDomePatternCoverage(wallMaterial(
      innerDomeWalls,
      'room_inner_dome_interior',
      Math.max(0.5, Math.PI * 2 * innerDomeRadius),
      innerMeridianLength,
      false,
    ), innerDomePatternCoverage, innerDomeColor, innerSpringY, innerDomeRise);
    innerDomeInteriorMaterial.side = THREE.DoubleSide;
    const innerDomeExteriorMaterial = wallMaterial(
      innerDomeWalls,
      'room_inner_dome_exterior',
      Math.max(0.5, Math.PI * 2 * innerDomeRadius),
      innerMeridianLength,
      false,
    );
    innerDomeExteriorMaterial.side = THREE.DoubleSide;
    const innerDomeAutomaticRunningWalls = wallsWithDefaultBond(innerDomeWalls, 'room_inner_dome_interior');
    const innerDomeAutomaticRunningMaterial = wallMaterial(
      innerDomeAutomaticRunningWalls,
      'room_inner_dome_interior',
      Math.max(0.5, Math.PI * 2 * innerDomeRadius),
      innerMeridianLength,
      false,
    );
    innerDomeAutomaticRunningMaterial.side = THREE.DoubleSide;
    innerDomeAutomaticRunningMaterial.userData.roomDomeAutomaticRunningBond = true;
    innerDomeAutomaticRunningMaterial.userData.roomDomeAutomaticSurfaceRole = 'inner-shell-return-only';
    assignRadialShellMaterialGroups(innerGeometry, centerX, centerZ);
    const innerDome = new THREE.Mesh(innerGeometry, [
      innerDomeInteriorMaterial,
      innerDomeExteriorMaterial,
      innerDomeAutomaticRunningMaterial,
    ]);
    innerDome.name = 'Room inner dome cover';
    innerDome.userData.wallSide = 'room_dome_inner';
    innerDome.userData.roomDomePart = 'inner-dome-shell';
    innerDome.userData.isRoomDome = true;
    innerDome.userData.isRoomInnerDome = true;
    innerDome.userData.roomDomeRadius = innerDomeRadius;
    innerDome.userData.roomDomeSpringInteriorRadius = innerDomeRadius;
    innerDome.userData.roomDomeSpringAlignment = transitionType === 'squinch'
      ? drumSideCount === 16
        ? 'room-facing-shell-flush-with-sixteen-sided-drum-inner-face-apothem'
        : 'room-facing-shell-flush-with-eight-sided-drum-inner-face-apothem'
      : 'room-facing-shell-inside-circular-drum';
    innerDome.userData.roomDomeCenter = [centerX, centerZ];
    innerDome.userData.roomDomeRise = innerDomeRise;
    innerDome.userData.roomDomeSpringY = innerSpringY;
    innerDome.userData.roomDomeShellThickness = masonryShellThickness;
    innerDome.userData.roomDomeShellThicknessSource = 'one-normal-brick-length';
    innerDome.userData.roomDomeExteriorMaterialIndex = 1;
    innerDome.userData.roomDomeInteriorMaterialIndex = 0;
    innerDome.userData.roomDomeReturnMaterialIndex = 2;
    innerDome.userData.roomDomeVisibleBondPolicy = 'independent-inner-dome-exterior-and-interior-bonds-returns-automatic-running';
    innerDome.userData.roomDomeBrickColor = innerDomeColor;
    innerDome.userData.roomDomePatternCoverage = innerDomePatternCoverage;
    innerDome.userData.roomDomePatternCutoffY = innerSpringY + innerDomeRise * innerDomePatternCoverage / 100;
    innerDome.userData.roomDomeProfileSystem = 'independent-four-centre-red-green-circle-arch-revolved';
    innerDome.userData.roomDomeArchConstruction = innerConstruction ? {
      redCenter: innerConstruction.redCenter.toArray(),
      redRadius: innerConstruction.redRadius,
      greenCenter: innerConstruction.greenCenter.toArray(),
      greenRadius: innerConstruction.greenRadius,
      tangentPoint: innerConstruction.tangentPoint.toArray(),
      apexPoint: innerConstruction.apexPoint.toArray(),
    } : null;
    innerDome.castShadow = true;
    innerDome.receiveShadow = true;
    group.add(innerDome);
    meshes.push(innerDome);

    if (building.betweenDomeSupportWallsEnabled !== false
      && Number(building.betweenDomeSupportWallsCoverage) > 0) {
      const supportCoverage = THREE.MathUtils.clamp(
        Number(building.betweenDomeSupportWallsCoverage) || 60,
        0,
        100,
      );
      const supportThickness = masonryShellThickness;
      const supportBearingEmbed = THREE.MathUtils.clamp(supportThickness * 0.15, 0.01, 0.05);
      const supportGeometry = betweenDomeSupportWallGeometry({
        outerRoomFacingProfile: innerDomeProfile,
        innerCavityFacingProfile: cavityFacingProfile,
        coverage: supportCoverage,
        thickness: supportThickness,
        bearingEmbed: supportBearingEmbed,
        outerPlanSides: domeCoverType === 'pyramid' ? domePlanSegments : 64,
      });
      if (supportGeometry) {
        const supportHeight = Math.max(
          0.01,
          supportGeometry.userData.betweenDomeSupportWallTopY
            - supportGeometry.userData.betweenDomeSupportWallBottomY,
        );
        const supportSpan = Math.max(0.1, domeRadius - innerDomeRadius);
        const supportWalls = wallsWithDefaultBond(walls, 'room_dome_transition');
        const supportMaterial = wallMaterial(
          supportWalls,
          'room_dome_transition',
          supportSpan,
          supportHeight,
          true,
        );
        supportMaterial.side = THREE.DoubleSide;
        supportMaterial.userData.betweenDomeSupportWallFinish = 'room-bricks-automatic-running-bond';
        supportMaterial.userData.betweenDomeSupportWallCourseSource = 'room-vertical-walls-world-y-origin';
        supportMaterial.userData.betweenDomeSupportWallBrickWidth = walls.bricks.brickWidth;
        supportMaterial.userData.betweenDomeSupportWallBrickHeight = walls.bricks.brickHeight;
        supportMaterial.userData.betweenDomeSupportWallBrickScale = 1;
        supportMaterial.userData.betweenDomeSupportWallTextureAxes = 'radial-horizontal-by-world-y-vertical';
        const supportWallCount = domeCoverType === 'pyramid' ? domePlanSegments : 8;
        const supportWallAngleStep = Math.PI * 2 / supportWallCount;
        const supportAssembly = new THREE.Group();
        supportAssembly.name = 'Between domes supporting walls';
        supportAssembly.userData.wallSide = 'room_dome_transition';
        supportAssembly.userData.roomDomePart = 'between-dome-support-walls';
        supportAssembly.userData.isBetweenDomeSupportWallAssembly = true;
        supportAssembly.userData.betweenDomeSupportWallCount = supportWallCount;
        supportAssembly.userData.betweenDomeSupportWallCoverage = supportCoverage;
        supportAssembly.userData.betweenDomeSupportWallThickness = supportThickness;
        supportAssembly.userData.betweenDomeSupportWallBearingEmbed = supportBearingEmbed;
        supportAssembly.userData.betweenDomeSupportWallOuterLegExtension = outerDomeLegExtension;
        supportAssembly.userData.betweenDomeSupportWallCoverType = domeCoverType;
        supportAssembly.userData.betweenDomeSupportWallSizing = 'sampled-from-current-inner-dome-and-outer-cover-profiles';
        supportAssembly.userData.betweenDomeSupportWallTextureAxes = 'radial-horizontal-by-world-y-vertical';
        for (let index = 0; index < supportWallCount; index += 1) {
          const support = new THREE.Mesh(supportGeometry, supportMaterial);
          support.name = `Between domes supporting wall ${index + 1}`;
          support.position.set(centerX, 0, centerZ);
          support.rotation.y = -index * supportWallAngleStep;
          support.castShadow = true;
          support.receiveShadow = true;
          support.userData.wallSide = 'room_dome_transition';
          support.userData.roomDomePart = 'between-dome-support-wall';
          support.userData.isBetweenDomeSupportWall = true;
          support.userData.betweenDomeSupportWallIndex = index;
          support.userData.betweenDomeSupportWallAngle = index * supportWallAngleStep;
          support.userData.betweenDomeSupportWallCoverage = supportCoverage;
          support.userData.betweenDomeSupportWallThickness = supportThickness;
          support.userData.betweenDomeSupportWallBearingEmbed = supportBearingEmbed;
          support.userData.betweenDomeSupportWallOuterLegExtension = outerDomeLegExtension;
          support.userData.betweenDomeSupportWallThicknessSource = 'one-normal-brick-width';
          support.userData.betweenDomeSupportWallConnection = 'lower-bearing-embed-with-upper-interior-surface-clip';
          support.userData.betweenDomeSupportWallSizing = 'sampled-from-current-inner-dome-and-outer-cover-profiles';
          support.userData.betweenDomeSupportWallTextureAxes = 'radial-horizontal-by-world-y-vertical';
          supportAssembly.add(support);
          meshes.push(support);
        }
        group.add(supportAssembly);
      }
    }
  }

  if (drumHeight > 0.0001) {
    const drumPlanPerimeter = drumSideCount < 64
      ? drumSideCount * 2 * drumOuterRadius * Math.sin(Math.PI / drumSideCount)
      : Math.PI * 2 * drumOuterRadius;
    const drumMaterial = wallMaterial(
      drumWalls,
      'room_dome_drum',
      Math.max(0.5, drumPlanPerimeter),
      drumHeight,
      false,
    );
    drumMaterial.side = THREE.DoubleSide;
    const drumInteriorMaterial = wallMaterial(
      drumWalls,
      'room_dome_drum_interior',
      Math.max(0.5, drumPlanPerimeter),
      drumHeight,
      false,
    );
    drumInteriorMaterial.side = THREE.DoubleSide;
    const drumInnerRadius = drumSideCount < 64
      ? Math.max(
        0.001,
        (drumFootprintApothem - drumShellThickness) / Math.cos(Math.PI / drumSideCount),
      )
      : Math.max(0.001, drumOuterRadius - drumShellThickness);
    const drumProfile = [
      new THREE.Vector2(drumOuterRadius, -drumHeight / 2),
      new THREE.Vector2(drumOuterRadius, drumHeight / 2),
      new THREE.Vector2(drumInnerRadius, drumHeight / 2),
      new THREE.Vector2(drumInnerRadius, -drumHeight / 2),
      new THREE.Vector2(drumOuterRadius, -drumHeight / 2),
    ];
    const drumGeometry = new THREE.LatheGeometry(drumProfile, drumSideCount);
    const drumUv = drumGeometry.getAttribute('uv');
    const drumV = [0, 1, 1, 0, 0];
    for (let vertex = 0; vertex < drumUv.count; vertex += 1) {
      drumUv.setY(vertex, drumV[vertex % drumProfile.length]);
    }
    drumUv.needsUpdate = true;
    drumGeometry.userData.roomDomeDrumOuterRadius = drumOuterRadius;
    drumGeometry.userData.roomDomeDrumInnerRadius = drumInnerRadius;
    drumGeometry.userData.roomDomeDrumOuterApothem = drumSideCount < 64
      ? drumOuterRadius * Math.cos(Math.PI / drumSideCount)
      : drumOuterRadius;
    drumGeometry.userData.roomDomeDrumInnerApothem = drumSideCount < 64
      ? drumInnerRadius * Math.cos(Math.PI / drumSideCount)
      : drumInnerRadius;
    drumGeometry.userData.roomDomeDrumThickness = drumShellThickness;
    drumGeometry.userData.roomDomeDrumCircumradiusThickness = drumOuterRadius - drumInnerRadius;
    assignRadialShellMaterialGroups(drumGeometry);
    const drum = new THREE.Mesh(drumGeometry, [drumMaterial, drumInteriorMaterial, drumMaterial]);
    if (drumSideCount < 64) {
      [...new Set(drum.material)].forEach((material) => {
        material.flatShading = true;
        material.needsUpdate = true;
      });
    }
    drum.name = 'Room dome cylindrical drum';
    drum.userData.roomDomeDrumDisplayName = drumSideCount < 64
      ? `Room dome ${drumSideCount}-sided polygonal drum`
      : drum.name;
    drum.position.set(centerX, drumBaseY + drumHeight / 2, centerZ);
    if (drumSideCount < 64) drum.rotation.y = -Math.PI / drumSideCount;
    drum.userData.wallSide = 'room_dome_drum';
    drum.userData.roomDomePart = 'dome-drum';
    drum.userData.isRoomDomeDrum = true;
    drum.userData.roomDomeDrumHeight = drumHeight;
    drum.userData.roomDomeDrumBaseY = drumBaseY;
    drum.userData.roomDomeDrumBaseSource = transitionType === 'squinch'
      ? 'actual-squinch-rib-outer-crown-top'
      : 'transition-crown';
    drum.userData.roomDomeDrumThickness = drumShellThickness;
    drum.userData.roomDomeDrumExteriorMaterialIndex = 0;
    drum.userData.roomDomeDrumInteriorMaterialIndex = 1;
    drum.userData.roomDomeDrumReturnMaterialIndex = 2;
    drum.userData.roomDomeDrumThicknessSource = transitionType === 'squinch'
      ? 'nominal-vertical-room-wall-thickness'
      : 'one-normal-brick-length';
    drum.userData.roomDomeDrumBrickColor = drumColor;
    drum.userData.roomDomeDrumFinishSide = 'room_dome_drum';
    drum.userData.roomDomeDrumFinishIndependence = transitionType === 'squinch'
      ? drumSideCount === 16
        ? 'independent-sixteen-sided-drum-not-shared-with-lower-octagon'
        : 'independent-eight-sided-drum-not-shared-with-lower-octagon'
      : null;
    drum.userData.roomDomeDrumSideCount = drumSideCount;
    drum.userData.roomSquinchFootprintApothem = transitionType === 'squinch'
      ? squinchOuterApothem
      : null;
    drum.userData.roomSquinchArchCenterlineApothem = transitionType === 'squinch'
      ? squinchFootprintApothem
      : null;
    drum.userData.roomSquinchFootprintSource = transitionType === 'squinch'
      ? 'squinch-arch-crown-centerline'
      : null;
    drum.userData.roomDomeBaseRadius = domeRadius;
    drum.userData.roomDomeDrumInteriorBearingRadius = directBearing
      ? directInteriorBearingRadius
      : null;
    drum.userData.roomDomeDrumInteriorAlignment = directBearing
      ? 'flush-with-room-wall-interior-face'
      : null;
    drum.userData.roomDomeDrumPlan = domeCoverType === 'pyramid'
      ? domePlanSegments === 8 && drumSideCount === 8
        ? 'eight-sided-polygon-aligned-with-octagonal-pyramid'
        : `${drumSideCount}-sided-polygon-aligned-with-${domePlanSegments}-sided-pyramid`
      : transitionType === 'squinch'
        ? 'sixteen-sided-polygon-on-eight-arch-squinch'
      : 'circular';
    if (transitionType === 'squinch') {
      drum.userData.roomSquinchBrickCourseMapping = 'shared-metric-circumference-and-drum-foot-origin';
    }
    drum.castShadow = true;
    drum.receiveShadow = true;
    group.add(drum);
    meshes.push(drum);
  }

  if (outerDomeLegExtension > 0.0001) {
    const extraLegInnerRadius = Math.max(0.01, domeGeometryBaseRadius - masonryShellThickness);
    const extraLegInteriorPerimeter = domeCoverType === 'pyramid'
      ? domePlanSegments * 2 * extraLegInnerRadius * Math.sin(Math.PI / domePlanSegments)
      : Math.PI * 2 * extraLegInnerRadius;
    const extraLegMaterial = wallMaterial(
      domeExtraLegWalls,
      'room_dome_extra_leg',
      Math.max(0.5, domePlanPerimeter),
      outerDomeLegExtension,
      false,
    );
    extraLegMaterial.side = THREE.DoubleSide;
    const extraLegInteriorMaterial = wallMaterial(
      domeExtraLegWalls,
      'room_dome_extra_leg_interior',
      Math.max(0.5, extraLegInteriorPerimeter),
      outerDomeLegExtension,
      false,
    );
    extraLegInteriorMaterial.side = THREE.DoubleSide;
    const extraLegProfile = [
      new THREE.Vector2(domeGeometryBaseRadius, -outerDomeLegExtension / 2),
      new THREE.Vector2(domeGeometryBaseRadius, outerDomeLegExtension / 2),
      new THREE.Vector2(extraLegInnerRadius, outerDomeLegExtension / 2),
      new THREE.Vector2(extraLegInnerRadius, -outerDomeLegExtension / 2),
      new THREE.Vector2(domeGeometryBaseRadius, -outerDomeLegExtension / 2),
    ];
    const extraLegGeometry = new THREE.LatheGeometry(extraLegProfile, domePlanSegments);
    const extraLegUv = extraLegGeometry.getAttribute('uv');
    const extraLegV = [0, 1, 1, 0, 0];
    for (let vertex = 0; vertex < extraLegUv.count; vertex += 1) {
      extraLegUv.setY(vertex, extraLegV[vertex % extraLegProfile.length]);
    }
    extraLegUv.needsUpdate = true;
    extraLegGeometry.userData.roomDomeExtraLegOuterRadius = domeGeometryBaseRadius;
    extraLegGeometry.userData.roomDomeExtraLegInnerRadius = extraLegInnerRadius;
    extraLegGeometry.userData.roomDomeExtraLegThickness = domeGeometryBaseRadius - extraLegInnerRadius;
    assignRadialShellMaterialGroups(extraLegGeometry);
    const extraLeg = new THREE.Mesh(extraLegGeometry, [
      extraLegMaterial,
      extraLegInteriorMaterial,
      extraLegMaterial,
    ]);
    if (domeCoverType === 'pyramid') {
      [...new Set(extraLeg.material)].forEach((material) => {
        material.flatShading = true;
        material.needsUpdate = true;
      });
      extraLeg.rotation.y = -Math.PI / domePlanSegments;
    }
    extraLeg.name = 'Room dome independent extra leg';
    extraLeg.position.set(centerX, drumTopY + outerDomeLegExtension / 2, centerZ);
    extraLeg.userData.wallSide = 'room_dome_extra_leg';
    extraLeg.userData.roomDomePart = 'dome-extra-leg';
    extraLeg.userData.isRoomDomeExtraLeg = true;
    extraLeg.userData.roomDomeExtraLegHeight = outerDomeLegExtension;
    extraLeg.userData.roomDomeExtraLegBaseY = drumTopY;
    extraLeg.userData.roomDomeExtraLegTopY = springY;
    extraLeg.userData.roomDomeExtraLegBrickColor = domeExtraLegColor;
    extraLeg.userData.roomDomeExtraLegExteriorMaterialIndex = 0;
    extraLeg.userData.roomDomeExtraLegInteriorMaterialIndex = 1;
    extraLeg.userData.roomDomeExtraLegReturnMaterialIndex = 2;
    extraLeg.userData.roomDomeExtraLegSideCount = domePlanSegments;
    extraLeg.userData.roomDomeExtraLegFinishIndependence = 'independent-from-dome-and-drum';
    extraLeg.castShadow = true;
    extraLeg.receiveShadow = true;
    group.add(extraLeg);
    meshes.push(extraLeg);
  }

  const domeRingColor = /^#[0-9a-f]{6}$/i.test(building.domeRingColor || '')
    ? building.domeRingColor
    : '#49b5ca';
  const ringMaterial = new THREE.MeshStandardMaterial({
    color: domeRingColor,
    roughness: 0.78,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  ringMaterial.userData.roomDomeRingFinish = 'independent-solid-color-no-brick-bond-or-texture';
  const ringTube = Math.max(0.025, Math.min(0.09, thickness * 0.16));
  // Pyramid rings follow the faceted base but retain a circular moulding
  // cross-section. Dome and Cone rings remain circular toruses.
  const polygonRing = domeCoverType === 'pyramid';
  const ringGeometry = polygonRing
    ? polygonTubeSpringRingGeometry(domeRadius, ringTube, domePlanSegments)
    : new THREE.TorusGeometry(domeRadius, ringTube, 10, 64);
  if (!polygonRing) {
    ringGeometry.userData.roomDomeRingFootprint = 'circle';
    ringGeometry.userData.roomDomeRingSideCount = 64;
    ringGeometry.userData.roomDomeRingCenterlineRadius = domeRadius;
    ringGeometry.userData.roomDomeRingProfile = 'circle';
    ringGeometry.userData.roomDomeRingProfileSegments = 10;
    ringGeometry.userData.roomDomeRingTubeRadius = ringTube;
    ringGeometry.userData.roomDomeRingAlignment = 'circular-springing-profile';
  }
  const springRing = new THREE.Mesh(
    ringGeometry,
    ringMaterial,
  );
  springRing.name = 'Room dome springing ring';
  if (!polygonRing) springRing.rotation.x = Math.PI / 2;
  springRing.position.set(centerX, springY, centerZ);
  springRing.userData.wallSide = 'room_dome_ring';
  springRing.userData.roomDomePart = 'springing-ring';
  springRing.userData.isRoomDomeTransitionDetail = true;
  springRing.userData.roomDomeTransitionType = transitionType;
  springRing.userData.roomDomeRingColor = domeRingColor;
  springRing.userData.roomDomeRingFinish = 'independent-solid-color-no-brick-bond-or-texture';
  springRing.userData.roomDomeRingY = springY;
  springRing.userData.roomDomeRingAnchor = 'between-independent-extra-leg-and-outer-cover';
  springRing.visible = building.domeOuterRingEnabledByCoverType?.[domeCoverType] !== false;
  springRing.userData.roomDomeRingCoverType = domeCoverType;
  springRing.userData.roomDomeRingFootprint = polygonRing ? 'polygon' : 'circle';
  springRing.userData.roomDomeRingSideCount = polygonRing ? domePlanSegments : 64;
  springRing.userData.roomDomeRingProfile = 'circle';
  springRing.userData.roomDomeRingFootprintSource = 'selected-outer-cover-base';
  springRing.userData.roomDomeRingVisibleForCoverType = springRing.visible;
  group.add(springRing);
  meshes.push(springRing);

  const addTransitionRibs = ({ count, tube, type, material, crownBias = 0.72 }) => {
    const displayType = `${type.charAt(0).toUpperCase()}${type.slice(1)}`;
    for (let index = 0; index < count; index += 1) {
      const angle = (index / count) * Math.PI * 2;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const boundaryRadius = Math.min(
        Math.abs(cos) < 0.000001 ? Infinity : width / 2 / Math.abs(cos),
        Math.abs(sin) < 0.000001 ? Infinity : depth / 2 / Math.abs(sin),
      );
      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(centerX + cos * boundaryRadius, wallTop + 0.01, centerZ + sin * boundaryRadius),
        new THREE.Vector3(
          centerX + cos * ((boundaryRadius + domeRadius) / 2),
          THREE.MathUtils.lerp(wallTop, transitionTopY, crownBias),
          centerZ + sin * ((boundaryRadius + domeRadius) / 2),
        ),
        new THREE.Vector3(centerX + cos * domeRadius, transitionTopY + 0.01, centerZ + sin * domeRadius),
      );
      const rib = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, tube, 6, false), material.clone());
      rib.name = `Room ${displayType} transition rib ${index + 1}`;
      rib.userData.wallSide = 'room_dome_transition';
      rib.userData.roomDomePart = `${type}-transition-rib`;
      rib.userData.isRoomDomeTransitionDetail = true;
      rib.userData.roomDomeTransitionType = type;
      rib.userData.roomDomeCrownY = transitionTopY;
      group.add(rib);
      meshes.push(rib);
    }
  };

  if (transitionType === 'karbandi' && !usesSharedKarbandi) {
    const ribMaterial = ringMaterial.clone();
    if (/^#[0-9a-f]{6}$/i.test(transitionSettings.ribColor || '')) {
      ribMaterial.map = null;
      ribMaterial.color.set(transitionSettings.ribColor);
    }
    const ribCount = Math.round(THREE.MathUtils.clamp(Number(transitionSettings.ribCount) || 16, 4, 64));
    const karbandiRibTube = THREE.MathUtils.clamp(Number(transitionSettings.ribWidth) || ringTube * 0.62, 0.01, 2) / 2;
    addTransitionRibs({ count: ribCount, tube: karbandiRibTube, type: 'karbandi', material: ribMaterial, crownBias: 0.72 });
  } else if (transitionType === 'squinch') {
    const ribWidth = squinchRibWidth;
    const ribDepth = THREE.MathUtils.clamp(Number(transitionSettings.ribDepth) || 0.46, 0.01, 1);
    const legGap = 0;
    const legExtension = THREE.MathUtils.clamp(
      Number.isFinite(Number(transitionSettings.legExtension)) ? Number(transitionSettings.legExtension) : 1,
      0,
      10,
    );
    const ribColor = /^#[0-9a-f]{6}$/i.test(transitionSettings.ribColor || '')
      ? transitionSettings.ribColor
      : '#3490b7';
    const squinchRibMaterial = new THREE.MeshStandardMaterial({
      color: ribColor,
      roughness: 0.78,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    squinchRibMaterial.userData.squinchRibFinish = 'solid-color-no-brick-bond-or-texture';
    const ribSpringY = THREE.MathUtils.clamp(
      wallTop + (Number.isFinite(Number(transitionSettings.springHeightOffset))
        ? Number(transitionSettings.springHeightOffset)
        : 0),
      wallTop - Math.max(0.5, transitionHeight),
      transitionTopY - 0.05,
    );
    const halfWidth = width / 2;
    const halfDepth = depth / 2;
    const squinchWallThicknessBySide = {
      north: Math.max(0.05, Number(wallThicknesses.north) || thickness),
      east: Math.max(0.05, Number(wallThicknesses.east) || thickness),
      south: Math.max(0.05, Number(wallThicknesses.south) || thickness),
      west: Math.max(0.05, Number(wallThicknesses.west) || thickness),
    };
    const squinchWallSideByArchIndex = { 0: 'north', 2: 'east', 4: 'south', 6: 'west' };
    const squinchCornerSidesByArchIndex = {
      1: ['north', 'east'],
      3: ['east', 'south'],
      5: ['south', 'west'],
      7: ['west', 'north'],
    };
    const squinchInteriorWallPlane = (side) => {
      if (side === 'north') return { axis: 'z', value: centerZ - halfDepth + squinchWallThicknessBySide.north / 2 };
      if (side === 'south') return { axis: 'z', value: centerZ + halfDepth - squinchWallThicknessBySide.south / 2 };
      if (side === 'east') return { axis: 'x', value: centerX + halfWidth - squinchWallThicknessBySide.east / 2 };
      return { axis: 'x', value: centerX - halfWidth + squinchWallThicknessBySide.west / 2 };
    };
    const squinchBrickLength = Math.max(
      0.01,
      Number(walls.bricks?.brickWidth) || DEFAULT_WALL_SYSTEM.bricks.brickWidth,
    );
    const cornerCut = Math.max(0.1, Math.min(halfWidth, halfDepth) * (2 - Math.sqrt(2)));
    const octagon = [
      new THREE.Vector3(-halfWidth + cornerCut, 0, -halfDepth),
      new THREE.Vector3(halfWidth - cornerCut, 0, -halfDepth),
      new THREE.Vector3(halfWidth, 0, -halfDepth + cornerCut),
      new THREE.Vector3(halfWidth, 0, halfDepth - cornerCut),
      new THREE.Vector3(halfWidth - cornerCut, 0, halfDepth),
      new THREE.Vector3(-halfWidth + cornerCut, 0, halfDepth),
      new THREE.Vector3(-halfWidth, 0, halfDepth - cornerCut),
      new THREE.Vector3(-halfWidth, 0, -halfDepth + cornerCut),
    ];
    const sharedArchUnscaledHalfSpan = octagon[1].distanceTo(octagon[0]) / 2;
    const archEntries = [];
    for (let index = 0; index < 8; index += 1) {
      const start = octagon[index];
      const end = octagon[(index + 1) % octagon.length];
      const chord = end.clone().sub(start);
      const chordDirection = chord.clone().normalize();
      const nextChordDirection = octagon[(index + 2) % octagon.length]
        .clone()
        .sub(end)
        .normalize();
      const jointAngle = Math.acos(THREE.MathUtils.clamp(
        Math.abs(chordDirection.dot(nextChordDirection)),
        -1,
        1,
      ));
      const interiorJointAngle = Math.PI - jointAngle;
      const automaticJointSetback = ribWidth / 2
        + (ribDepth / 2) / Math.max(0.2, Math.tan(interiorJointAngle / 2));
      const requestedGapSetback = legGap / (2 * Math.max(0.2, Math.sin(interiorJointAngle / 2)));
      const centerlineSetback = Math.min(
        sharedArchUnscaledHalfSpan * 2 * 0.22,
        automaticJointSetback + requestedGapSetback,
      );
      const unscaledHalfSpan = sharedArchUnscaledHalfSpan;
      let halfSpan = Math.max(0.1, unscaledHalfSpan - centerlineSetback);
      const midpoint = start.clone().add(end).multiplyScalar(0.5);
      // Use the actual outward normal of the arch plane. A midpoint radial
      // vector drifts away from the wall-face normal in rectangular rooms and
      // moves the corner rib reveal off the adjoining interior wall edges.
      const radialDirection = new THREE.Vector3(
        chordDirection.z,
        0,
        -chordDirection.x,
      ).normalize();
      const bearingInset = index % 2 === 0
        ? squinchWallThicknessBySide[squinchWallSideByArchIndex[index]] / 2
        : squinchCornerSidesByArchIndex[index]
          .reduce((sum, side) => sum + squinchWallThicknessBySide[side] / 2, 0) / Math.sqrt(2);
      // Wall-bay arches project half a brick into the room. Corner arches stay
      // on their original wall-centreline bearing with no additional inset.
      const ribInteriorProjection = index % 2 === 0 ? squinchBrickLength * 0.5 : 0;
      let effectiveChordDirection = chordDirection;
      let effectiveRadialDirection = radialDirection;
      let ribPosition = new THREE.Vector3(
        centerX + midpoint.x + radialDirection.x * (-bearingInset - ribInteriorProjection + ribDepth / 2),
        0,
        centerZ + midpoint.z + radialDirection.z * (-bearingInset - ribInteriorProjection + ribDepth / 2),
      );
      let cornerWallEdgeStart = null;
      let cornerWallEdgeEnd = null;
      const ribGeometry = squinchArchBandGeometry({
        halfSpan,
        springY: ribSpringY,
        crownY: transitionTopY,
        ribWidth,
        ribDepth,
        legExtension,
        settings: transitionSettings,
      });
      if (index % 2 === 1) {
        const cornerSides = squinchCornerSidesByArchIndex[index];
        const xSide = cornerSides.find((side) => ['east', 'west'].includes(side));
        const zSide = cornerSides.find((side) => ['north', 'south'].includes(side));
        const cornerPoint = new THREE.Vector3(
          squinchInteriorWallPlane(xSide).value,
          0,
          squinchInteriorWallPlane(zSide).value,
        );
        const endpointCandidates = [
          ribGeometry.userData.squinchArchOuterProfile[0],
          ribGeometry.userData.squinchArchInnerProfile[0],
          ribGeometry.userData.squinchArchOuterProfile.at(-1),
          ribGeometry.userData.squinchArchInnerProfile.at(-1),
        ];
        const bandEdgeExtent = Math.max(...endpointCandidates.map((point) => Math.abs(point[0])));
        const wallLegOffset = bandEdgeExtent * Math.SQRT2;
        const pointOnInteriorWall = (sourcePoint, side) => {
          const source = new THREE.Vector3(centerX + sourcePoint.x, 0, centerZ + sourcePoint.z);
          const plane = squinchInteriorWallPlane(side);
          source[plane.axis] = plane.value;
          const direction = source.sub(cornerPoint);
          direction.y = 0;
          if (direction.lengthSq() < 0.000001) direction.copy(chordDirection).multiplyScalar(side === cornerSides[0] ? -1 : 1);
          const point = cornerPoint.clone().add(direction.normalize().multiplyScalar(wallLegOffset));
          point[plane.axis] = plane.value;
          return point;
        };
        cornerWallEdgeStart = pointOnInteriorWall(start, cornerSides[0]);
        cornerWallEdgeEnd = pointOnInteriorWall(end, cornerSides[1]);
        const cornerLegBottomY = ribSpringY - legExtension;
        cornerWallEdgeStart.y = cornerLegBottomY;
        cornerWallEdgeEnd.y = cornerLegBottomY;
        effectiveChordDirection = cornerWallEdgeEnd.clone().sub(cornerWallEdgeStart).normalize();
        effectiveRadialDirection = new THREE.Vector3(
          effectiveChordDirection.z,
          0,
          -effectiveChordDirection.x,
        ).normalize();
        const roomFaceMidpoint = cornerWallEdgeStart.clone().add(cornerWallEdgeEnd).multiplyScalar(0.5);
        roomFaceMidpoint.y = 0;
        ribPosition = roomFaceMidpoint.clone().addScaledVector(effectiveRadialDirection, ribDepth / 2);
      }
      const effectiveCenterlineSetback = unscaledHalfSpan - halfSpan;
      const archScale = halfSpan / unscaledHalfSpan;
      const ribCenterRadialOffset = index % 2 === 0
        ? -bearingInset - ribInteriorProjection + ribDepth / 2
        : ribDepth / 2;
      const angle = Math.atan2(-effectiveChordDirection.z, effectiveChordDirection.x);
      const rib = new THREE.Mesh(ribGeometry, squinchRibMaterial.clone());
      rib.name = `Room Squinch transition rib arch ${index + 1}`;
      rib.rotation.y = angle;
      rib.position.copy(ribPosition);
      rib.userData.wallSide = 'room_dome_transition';
      rib.userData.roomDomePart = 'squinch-transition-rib';
      rib.userData.isRoomDomeTransitionDetail = true;
      rib.userData.roomDomeTransitionType = 'squinch';
      rib.userData.roomSquinchArchIndex = index;
      rib.userData.roomSquinchArchCount = 8;
      rib.userData.roomSquinchArchPlaneAngle = angle;
      rib.userData.roomSquinchArchType = index % 2 === 0 ? 'wall' : 'corner';
      rib.userData.roomSquinchArchPlanStart = [centerX + start.x, centerZ + start.z];
      rib.userData.roomSquinchArchPlanEnd = [centerX + end.x, centerZ + end.z];
      rib.userData.roomSquinchArchSupportPlan = 'four-wall-and-four-corner-octagon';
      rib.userData.roomSquinchArchJoint = 'symmetrically-scaled-full-arch-butt-joint';
      rib.userData.roomSquinchArchCenterlineSetback = effectiveCenterlineSetback;
      rib.userData.roomSquinchArchScale = archScale;
      rib.userData.roomSquinchArchUnscaledHalfSpan = unscaledHalfSpan;
      rib.userData.roomSquinchArchHalfSpan = halfSpan;
      rib.userData.roomSquinchArchNextIndex = (index + 1) % 8;
      rib.userData.roomSquinchRibWidth = ribWidth;
      rib.userData.roomSquinchRibDepth = ribDepth;
      rib.userData.roomSquinchRibInteriorProjection = ribInteriorProjection;
      rib.userData.roomSquinchRibInteriorBearingInset = bearingInset;
      rib.userData.roomSquinchRibCenterRadialOffset = ribCenterRadialOffset;
      rib.userData.roomSquinchRibRoomFaceRadialOffset = index % 2 === 0
        ? -bearingInset - ribInteriorProjection
        : 0;
      rib.userData.roomSquinchRibOutwardNormal = effectiveRadialDirection.toArray();
      rib.userData.roomSquinchCornerWallEdgeStart = cornerWallEdgeStart?.toArray() || null;
      rib.userData.roomSquinchCornerWallEdgeEnd = cornerWallEdgeEnd?.toArray() || null;
      rib.userData.roomSquinchRibDepthGrowthDirection = 'outward-only-toward-room-wall-exterior';
      rib.userData.roomSquinchRibInteriorAnchor = index % 2 === 0
        ? 'half-brick-length-inside-room-interior-wall-surface'
        : 'corner-room-facing-edge-on-adjoining-vertical-wall-interior-edges';
      rib.userData.roomSquinchRibColor = ribColor;
      rib.userData.roomSquinchRibFinish = 'solid-color-no-brick-bond-or-texture';
      rib.userData.roomSquinchLegGap = legGap;
      rib.userData.roomSquinchLegExtension = legExtension;
      rib.userData.roomSquinchSpringY = ribSpringY;
      rib.userData.roomDomeCrownY = transitionTopY;
      rib.castShadow = true;
      rib.receiveShadow = true;
      group.add(rib);
      meshes.push(rib);
      const profile = (rib.geometry.userData.squinchArchProfile || [])
        .map(([x, y]) => new THREE.Vector2(x, y));
      const coverProfile = (rib.geometry.userData.squinchArchOuterProfile || [])
        .map(([x, y]) => new THREE.Vector2(x, y));
      const innerProfile = (rib.geometry.userData.squinchArchInnerProfile || [])
        .map(([x, y]) => new THREE.Vector2(x, y));
      const completeArchCoverHalfSpan = coverProfile.reduce(
        (maximum, point) => Math.max(maximum, Math.abs(point.x)),
        0,
      );
      // Identical arches can be wider than the original diagonal octagon
      // chord in a rectangular Room. Let the four corner masonry faces grow
      // independently to the complete rib-band edge instead of clipping them
      // to an equal-sided/octagon-chord assumption. The adjoining straight
      // faces retain the Room-wall footprint and overlap behind these wider
      // corner solids, so no exterior daylight seam is introduced.
      const spandrelHalfSpan = index % 2 === 1
        ? Math.max(chord.length() / 2, completeArchCoverHalfSpan + 0.002)
        : chord.length() / 2;
      const worldMidpoint = new THREE.Vector3(centerX + midpoint.x, 0, centerZ + midpoint.z);
      const ribWorldMidpoint = rib.position.clone();
      archEntries.push({
        index,
        rib,
        profile,
        coverProfile,
        innerProfile,
        midpoint,
        worldMidpoint,
        ribWorldMidpoint,
        chordDirection: effectiveChordDirection,
        radialDirection: effectiveRadialDirection,
        angle,
        halfSpan,
        unscaledHalfSpan,
        spandrelHalfSpan,
        completeArchCoverHalfSpan,
      });
    }
    if (building.domeTransitionCoverEnabled === true) {
      const assembly = new THREE.Group();
      assembly.name = 'Room squinch square-to-circle transition cover';
      assembly.userData.wallSide = 'room_dome_transition';
      assembly.userData.roomDomePart = 'transition-cover';
      assembly.userData.isRoomDomeTransition = true;
      assembly.userData.isRoomDomeTransitionCover = true;
      assembly.userData.roomDomeTransitionType = 'squinch';
      assembly.userData.roomDomeTransitionSettings = { ...transitionSettings };
      assembly.userData.roomDomeSpringY = transitionTopY;
      const northThickness = Math.max(0.05, Number(wallThicknesses.north) || thickness);
      const eastThickness = Math.max(0.05, Number(wallThicknesses.east) || thickness);
      const southThickness = Math.max(0.05, Number(wallThicknesses.south) || thickness);
      const westThickness = Math.max(0.05, Number(wallThicknesses.west) || thickness);
      const cornerByArchIndex = {
        1: {
          point: new THREE.Vector3(centerX + halfWidth - eastThickness / 2, wallTop, centerZ - halfDepth + northThickness / 2),
          outerPoint: new THREE.Vector3(centerX + halfWidth + eastThickness / 2, wallTop, centerZ - halfDepth - northThickness / 2),
          sides: ['north', 'east'],
        },
        3: {
          point: new THREE.Vector3(centerX + halfWidth - eastThickness / 2, wallTop, centerZ + halfDepth - southThickness / 2),
          outerPoint: new THREE.Vector3(centerX + halfWidth + eastThickness / 2, wallTop, centerZ + halfDepth + southThickness / 2),
          sides: ['east', 'south'],
        },
        5: {
          point: new THREE.Vector3(centerX - halfWidth + westThickness / 2, wallTop, centerZ + halfDepth - southThickness / 2),
          outerPoint: new THREE.Vector3(centerX - halfWidth - westThickness / 2, wallTop, centerZ + halfDepth + southThickness / 2),
          sides: ['south', 'west'],
        },
        7: {
          point: new THREE.Vector3(centerX - halfWidth + westThickness / 2, wallTop, centerZ - halfDepth + northThickness / 2),
          outerPoint: new THREE.Vector3(centerX - halfWidth - westThickness / 2, wallTop, centerZ - halfDepth - northThickness / 2),
          sides: ['west', 'north'],
        },
      };
      const wallSideByArchIndex = { 0: 'north', 2: 'east', 4: 'south', 6: 'west' };
      const roomInteriorPerimeter = (roomInteriorWidth + roomInteriorDepth) * 2;
      const roomInteriorBondPhase = {
        south: roomInteriorWidth / 2,
        east: roomInteriorWidth + roomInteriorDepth / 2,
        north: roomInteriorWidth + roomInteriorDepth + roomInteriorWidth / 2,
        west: roomInteriorWidth * 2 + roomInteriorDepth + roomInteriorDepth / 2,
      };
      archEntries.forEach((entry) => {
        if (entry.index % 2 === 1) {
          // Clip the rib curve at the vertical-wall top. The corner cover must
          // begin where the arch actually emerges from the wall, not at the
          // buried rib springing edge below that intersection.
          // The visible masonry boundary is the rib band's physical
          // intersection with each vertical interior wall-top edge. The inner
          // reveal remains the construction source for the curved groin, but
          // it must not be used as the wall seat because it is offset into the
          // Room and creates a shelf above the original wall face.
          const wallClippedProfile = [];
          entry.coverProfile.forEach((point, pointIndex) => {
            if (pointIndex === 0) {
              if (point.y >= wallTop - 0.000001) wallClippedProfile.push(point.clone());
              return;
            }
            const previous = entry.coverProfile[pointIndex - 1];
            const previousInside = previous.y >= wallTop - 0.000001;
            const currentInside = point.y >= wallTop - 0.000001;
            if (previousInside !== currentInside) {
              const denominator = point.y - previous.y;
              const ratio = Math.abs(denominator) < 0.000001
                ? 0
                : THREE.MathUtils.clamp((wallTop - previous.y) / denominator, 0, 1);
              wallClippedProfile.push(new THREE.Vector2(
                THREE.MathUtils.lerp(previous.x, point.x, ratio),
                wallTop,
              ));
            }
            if (currentInside) wallClippedProfile.push(point.clone());
          });
          entry.rib.updateWorldMatrix(true, false);
          const worldProfile = wallClippedProfile.map((point) => {
            const boundaryPoint = entry.rib.localToWorld(new THREE.Vector3(
              point.x,
              point.y,
              ribDepth / 2,
            ));
            return boundaryPoint;
          });
          const cornerDefinition = cornerByArchIndex[entry.index];
          const wallEdgeStart = new THREE.Vector3(...entry.rib.userData.roomSquinchCornerWallEdgeStart);
          const wallEdgeEnd = new THREE.Vector3(...entry.rib.userData.roomSquinchCornerWallEdgeEnd);
          wallEdgeStart.y = wallTop;
          wallEdgeEnd.y = wallTop;
          worldProfile[0] = wallEdgeStart;
          worldProfile[worldProfile.length - 1] = wallEdgeEnd;
          const apexIndex = worldProfile.reduce(
            (best, point, index) => (point.y > worldProfile[best].y ? index : best),
            0,
          );
          // Both ruled cover halves must share one physical springing point:
          // the exact intersection of the two Room interior wall planes. Using
          // separate projected inner-edge coordinates leaves two visible end
          // points instead of a closed corner joint.
          const innerEdgeIntersection = cornerDefinition.point.clone();
          const outerProfile = worldProfile.map((point) => new THREE.Vector3(
            point.x + entry.radialDirection.x * squinchCoverThickness,
            point.y,
            point.z + entry.radialDirection.z * squinchCoverThickness,
          ));
          const meetingCurveFor = (profile) => {
            const apex = profile.at(-1);
            const height = Math.max(0.000001, apex.y - innerEdgeIntersection.y);
            return profile.map((point, profileIndex) => {
              if (profileIndex === profile.length - 1) return apex.clone();
              const heightRatio = THREE.MathUtils.clamp(
                (point.y - innerEdgeIntersection.y) / height,
                0,
                1,
              );
              // A quadratic plan interpolation keeps the groin close to the
              // projected support-line intersection at its foot, then bends
              // smoothly into the arch crown instead of drawing a straight
              // triangular fan seam.
              const curveRatio = heightRatio * heightRatio;
              return new THREE.Vector3(
                THREE.MathUtils.lerp(innerEdgeIntersection.x, apex.x, curveRatio),
                point.y,
                THREE.MathUtils.lerp(innerEdgeIntersection.z, apex.z, curveRatio),
              );
            });
          };
          const fanHalves = [
            {
              side: cornerDefinition.sides[0],
              innerProfile: worldProfile.slice(0, apexIndex + 1),
              outerProfile: outerProfile.slice(0, apexIndex + 1),
            },
            {
              side: cornerDefinition.sides[1],
              innerProfile: worldProfile.slice(apexIndex).reverse(),
              outerProfile: outerProfile.slice(apexIndex).reverse(),
            },
          ].map((fan) => {
            const innerMeetingProfile = meetingCurveFor(fan.innerProfile);
            const outerMeetingProfile = innerMeetingProfile.map((point) => new THREE.Vector3(
              point.x + entry.radialDirection.x * squinchCoverThickness,
              point.y,
              point.z + entry.radialDirection.z * squinchCoverThickness,
            ));
            return { ...fan, innerMeetingProfile, outerMeetingProfile };
          });
          fanHalves.forEach((fan, fanIndex) => {
            const panelMaterial = directRoomWallFaceMaterial(
              walls,
              fan.side,
              fan.innerProfile.reduce((sum, point, profileIndex) => (
                profileIndex === 0 ? 0 : sum + point.distanceTo(fan.innerProfile[profileIndex - 1])
              ), 0),
              Math.max(0.5, transitionHeight),
              roomInteriorBondPhase[fan.side],
              roomInteriorPerimeter,
            );
            const panel = new THREE.Mesh(squinchCornerFanGeometry({
              innerMeetingProfile: fan.innerMeetingProfile,
              innerProfile: fan.innerProfile,
              outerMeetingProfile: fan.outerMeetingProfile,
              outerProfile: fan.outerProfile,
              courseSide: fan.side,
              courseCenterX: centerX,
              courseCenterZ: centerZ,
              wallSeatOverlap: Math.max(
                0.008,
                Math.min(0.03, (Number(walls.bricks?.brickHeight) || 0.065) * 0.2),
              ),
            }), [panelMaterial, transitionCoverExteriorMaterial, panelMaterial]);
            panel.name = `Room Squinch corner roof at arch ${entry.index + 1} ${fan.side} half`;
            panel.userData.wallSide = fan.side;
            panel.userData.roomDomePart = 'squinch-transition-cover';
            panel.userData.isRoomDomeTransitionCover = true;
            panel.userData.roomSquinchRoofPanelType = 'corner';
            panel.userData.roomSquinchCornerArchIndex = entry.index;
            panel.userData.roomSquinchCornerFanHalf = fanIndex;
            panel.userData.roomSquinchCornerRoofMethod = 'two-ruled-vault-halves-meet-on-curved-inner-edge-groin';
            panel.userData.roomSquinchBrickCourseMapping = 'continuous-from-adjoining-vertical-wall-world-y-courses';
            panel.userData.roomSquinchCornerRoofTarget = innerEdgeIntersection.toArray();
            panel.userData.roomSquinchCornerRoofExteriorTarget = fan.outerMeetingProfile[0].toArray();
            panel.userData.roomSquinchCornerRoofBoundary = 'physical-rib-band-intersections-with-vertical-wall-interior-top-edges';
            panel.userData.roomSquinchCornerRoofBrickStart = 'exact-shared-room-interior-wall-corner';
            panel.userData.roomSquinchCornerRoofRibEdge = 'wall-clipped-outer-band-at-vertical-wall-interior-top-edge';
            panel.userData.roomSquinchCornerRoofPlanFace = 'curved-groin-above-exact-shared-room-interior-corner';
            panel.userData.roomSquinchCornerRoofIntersectionY = wallTop;
            panel.userData.roomSquinchCornerRoofWallSides = cornerDefinition.sides;
            panel.userData.roomSquinchCornerRoofCourseSourceWall = fan.side;
            panel.userData.roomSquinchCornerRoofWallFaceAnchor = true;
            panel.userData.roomSquinchCornerRoofWallFaceAnchorPoint = fan.innerProfile[0].toArray();
            panel.userData.roomSquinchCornerRoofGroinCurve = fan.innerMeetingProfile.map((point) => point.toArray());
            panel.userData.roomSquinchCornerRoofSharedCornerPoint = innerEdgeIntersection.toArray();
            panel.userData.roomSquinchCornerRoofWallSeat = 'embedded-below-vertical-wall-top-for-flush-interior-joint';
            panel.userData.roomSquinchRoofThickness = squinchCoverThickness;
            panel.userData.roomSquinchRoofThicknessSource = 'nominal-vertical-room-wall-thickness';
            panel.userData.roomSquinchRoofThicknessDirection = 'horizontal-plan-to-vertical-wall-exterior-faces';
            panel.userData.roomSquinchInteriorBondSource = `connected-${fan.side}-vertical-wall-interior-face`;
            panel.userData.roomSquinchExteriorBondSide = 'room_dome_transition_exterior';
            panel.userData.roomSquinchExteriorBondAssembly = 'all-transition-covers-one-object';
            panel.castShadow = true;
            panel.receiveShadow = true;
            assembly.add(panel);
            meshes.push(panel);

          });
          return;
        }
        if (transitionSettings.openWallArchBays === true) return;
        const side = wallSideByArchIndex[entry.index];
        const wallDepth = Math.max(0.05, Number(wallThicknesses[side]) || thickness);
        const connectedWall = group.getObjectByName(`Room ${side} south-style wall`);
        const connectedBody = connectedWall?.children.find((child) => child.userData?.isRoomWallBody === true);
        const connectedMaterials = Array.isArray(connectedBody?.material) ? connectedBody.material : [];
        const cloneConnectedMaterial = (materialIndex, fallbackSide) => {
          const source = connectedMaterials[materialIndex];
          return source?.clone?.() || wallMaterial(
            walls,
            fallbackSide,
            entry.halfSpan * 2,
            Math.max(0.5, transitionHeight),
            true,
          );
        };
        const panelMaterials = [
          cloneConnectedMaterial(connectedBody?.userData?.roomWallInteriorMaterialIndex ?? 0, side),
          transitionCoverExteriorMaterial,
          cloneConnectedMaterial(connectedBody?.userData?.roomWallReturnMaterialIndex ?? 2, side),
        ];
        const panel = new THREE.Mesh(squinchWallArchInfillGeometry({
          profile: entry.profile,
          wallTop,
          ribWidth,
          depth: wallDepth,
        }), panelMaterials);
        panel.name = `Room Squinch ${side} wall extension clipped under arch`;
        panel.rotation.y = connectedWall?.rotation.y ?? entry.angle + Math.PI;
        panel.position.copy(entry.worldMidpoint);
        panel.userData.wallSide = side;
        panel.userData.roomDomePart = 'squinch-transition-cover';
        panel.userData.isRoomDomeTransitionCover = true;
        panel.userData.roomSquinchRoofPanelType = 'wall';
        panel.userData.roomSquinchWallArchIndex = entry.index;
        panel.userData.roomSquinchWallExtensionSide = side;
        panel.userData.roomSquinchWallExtensionClip = 'vertical-room-wall-bricks-clipped-to-arch-underside';
        panel.userData.roomSquinchWallFaceAlignment = 'exact-connected-room-wall-interior-and-exterior-planes';
        panel.userData.roomSquinchWallBondSource = 'exact-connected-room-wall-face-materials-and-uv-axes';
        panel.userData.roomSquinchWallInteriorMaterialIndex = 0;
        panel.userData.roomSquinchWallExteriorMaterialIndex = 1;
        panel.userData.roomSquinchInteriorBondSource = `connected-${side}-vertical-wall-interior-face`;
        panel.userData.roomSquinchExteriorBondSide = 'room_dome_transition_exterior';
        panel.userData.roomSquinchExteriorBondAssembly = 'all-transition-covers-one-object';
        panel.castShadow = true;
        panel.receiveShadow = true;
        assembly.add(panel);
        meshes.push(panel);
      });
      const skirt = new THREE.Group();
      skirt.name = 'Room Squinch vertical drum brick extension clipped above arches';
      skirt.userData.wallSide = 'room_dome_transition';
      skirt.userData.roomDomePart = 'squinch-transition-cover';
      skirt.userData.isRoomDomeTransitionCover = true;
      skirt.userData.roomSquinchDrumSkirt = true;
      skirt.userData.roomSquinchDrumSkirtSideCount = 8;
      skirt.userData.roomSquinchDrumSkirtClip = 'drum-wall-starts-immediately-above-actual-rib-outer-edges';
      skirt.userData.roomSquinchDrumSkirtExtrusion = 'constant-arch-plane-xz-with-no-inward-sixteen-face-bends';
      skirt.userData.roomSquinchBrickCourseMapping = 'one-continuous-unequal-octagon-perimeter-running-course-aligned-to-drum-foot';
      skirt.userData.roomSquinchDrumSkirtBottomY = wallTop;
      skirt.userData.roomSquinchDrumSkirtTopY = drumBaseY;
      const spandrelPerimeter = archEntries.reduce(
        (sum, entry) => sum + entry.spandrelHalfSpan * 2,
        0,
      );
      let spandrelPhase = 0;
      archEntries.forEach((entry) => {
        const fullSpan = entry.spandrelHalfSpan * 2;
        const panelMaterial = wallMaterial(
          walls,
          'room_dome_transition',
          Math.max(0.5, fullSpan),
          Math.max(0.5, transitionHeight),
          true,
          spandrelPhase + entry.spandrelHalfSpan,
          false,
          spandrelPerimeter,
        );
        if (panelMaterial.map) {
          panelMaterial.map.offset.y -= transitionTopY * panelMaterial.map.repeat.y;
          panelMaterial.map.needsUpdate = true;
        }
        const panel = new THREE.Mesh(squinchVerticalArchSpandrelGeometry({
          profile: entry.coverProfile,
          fullHalfSpan: entry.spandrelHalfSpan,
          wallTop,
          topY: drumBaseY,
          depth: squinchCoverThickness,
        }), panelMaterial);
        panel.name = `Room Squinch vertical drum extension above arch ${entry.index + 1}`;
        panel.rotation.y = entry.angle;
        panel.position.copy(entry.worldMidpoint);
        panel.userData.wallSide = 'room_dome_transition';
        panel.userData.roomDomePart = 'squinch-transition-cover';
        panel.userData.isRoomDomeTransitionCover = true;
        panel.userData.roomSquinchDrumSkirtPanel = true;
        panel.userData.roomSquinchArchIndex = entry.index;
        panel.userData.roomSquinchVerticalExtrusion = true;
        panel.userData.roomSquinchFinishSide = 'room_dome_transition';
        panel.userData.roomSquinchFinishIndependence = 'lower-octagon-independent-from-sixteen-sided-drum';
        panel.userData.roomSquinchDrumWallBottomBoundary = 'actual-arch-upper-edge-no-below-spring-wedges';
        panel.userData.roomSquinchBrickCourseMapping = 'one-continuous-unequal-octagon-perimeter-running-course-aligned-to-drum-foot';
        panel.userData.roomSquinchSpandrelPhase = spandrelPhase;
        panel.userData.roomSquinchSpandrelSpan = fullSpan;
        panel.userData.roomSquinchSpandrelArchCoverHalfSpan = entry.completeArchCoverHalfSpan;
        panel.userData.roomSquinchSpandrelFaceSizing = entry.index % 2 === 1
          ? 'corner-face-widened-to-cover-complete-identical-arch-band'
          : 'straight-face-retains-room-wall-footprint';
        panel.userData.roomSquinchSpandrelPerimeter = spandrelPerimeter;
        panel.userData.roomSquinchSpandrelJoint = entry.index % 2 === 1
          ? 'widened-corner-solid-overlaps-adjoining-straight-faces-no-gap'
          : 'straight-face-embedded-in-widened-corner-solids-no-gap';
        panel.userData.roomSquinchSpandrelThickness = squinchCoverThickness;
        panel.userData.roomSquinchSpandrelThicknessSource = 'nominal-vertical-room-wall-thickness';
        panel.userData.roomSquinchSpandrelExteriorJoint = 'overlapping-unequal-octagon-end-solids-no-gap';
        panel.castShadow = true;
        panel.receiveShadow = true;
        skirt.add(panel);
        meshes.push(panel);
        spandrelPhase += fullSpan;
      });
      skirt.userData.roomSquinchSpandrelPerimeter = spandrelPerimeter;
      skirt.userData.roomSquinchSpandrelJoint = 'four-widened-corner-faces-overlap-four-straight-faces-with-continuous-bond-phase';
      assembly.add(skirt);
      assembly.userData.roomSquinchRoofAssembly = {
        construction: 'arch-derived-three-part-cover',
        cornerArchCount: 4,
        cornerPanelCount: 8,
        wallArchCount: 4,
        wallPanelCount: transitionSettings.openWallArchBays === true ? 0 : 4,
        openWallArchBays: transitionSettings.openWallArchBays === true,
        drumSkirtSideCount: 8,
        cornerRule: 'each-corner-arch-fans-from-both-legs-to-room-corner-and-meets-at-apex-seam',
        wallRule: 'vertical-room-wall-continues-upward-and-is-clipped-under-wall-arch',
        drumRule: 'eight-vertical-arch-plane-spandrels-continue-drum-brickwork-down-without-inward-bends',
      };
      group.add(assembly);
    }
    squinchRibMaterial.dispose();
  } else if (transitionType === 'pendentive') {
    const curvature = THREE.MathUtils.clamp(Number(transitionSettings.curvature) || 1.45, 0.35, 3);
    addTransitionRibs({ count: 4, tube: ringTube * 0.62, type: 'pendentive', material: ringMaterial, crownBias: THREE.MathUtils.clamp(0.35 + curvature * 0.2, 0.42, 0.88) });
  }
}

function addPortalHalfSquinch(group, meshes, building, walls, context) {
  const sourceGroup = new THREE.Group();
  const sourceMeshes = [];
  const fullRoomDepth = context.depth * 2;
  const fullRoomCenterX = context.karbandiCenterX != null && Number.isFinite(Number(context.karbandiCenterX))
    ? Number(context.karbandiCenterX)
    : context.centerX;
  const fullRoomCenterZ = context.karbandiCenterZ != null && Number.isFinite(Number(context.karbandiCenterZ))
    ? Number(context.karbandiCenterZ)
    : context.northZ;
  const slicePlaneZ = context.northZ;
  const portalUpperCoverType = walls.portalCover === 'dome'
    ? walls.portalCover
    : null;
  const includesSquinchTransition = walls.portalTransition === 'squinch';
  let portalSquinchUpperDrumHeight = includesSquinchTransition
    && portalUpperCoverType === 'dome'
    ? Math.max(0.05, Number(building.domeDrumHeight) || 0.5)
    : 0;
  const portalNorthArchCurveStartY = Number.isFinite(Number(context.northArchCurveStartY))
    ? Number(context.northArchCurveStartY)
    : Number(context.wallTop) || 0;
  let sourceWallTop = context.wallTop;
  let sourceWallHeights = context.wallHeights;
  if (includesSquinchTransition) {
    const settings = building.domeTransitionSettings?.squinch || {};
    const westThickness = Math.max(0.05, Number(context.wallThicknesses?.west) || context.thickness);
    const eastThickness = Math.max(0.05, Number(context.wallThicknesses?.east) || context.thickness);
    const northThickness = Math.max(0.05, Number(context.wallThicknesses?.north) || context.thickness);
    const southThickness = Math.max(0.05, Number(context.wallThicknesses?.south) || context.thickness);
    const sourceWidth = context.width + (westThickness + eastThickness) / 2;
    const sourceDepth = fullRoomDepth + (northThickness + southThickness) / 2;
    const halfWidth = sourceWidth / 2;
    const halfDepth = sourceDepth / 2;
    const cornerCut = Math.max(0.1, Math.min(halfWidth, halfDepth) * (2 - Math.sqrt(2)));
    const referenceHalfSpan = Math.max(0.1, halfWidth - cornerCut);
    const springHeightOffset = Number.isFinite(Number(settings.springHeightOffset))
      ? Number(settings.springHeightOffset)
      : 0;
    const referenceSpringY = springHeightOffset;
    const referenceConstruction = pointedArchConstruction(
      0,
      referenceHalfSpan,
      referenceSpringY,
      Math.max(0.05, Number(settings.greenOffset) || 0.45),
      referenceSpringY + (Number.isFinite(Number(settings.greenHeightOffset))
        ? Number(settings.greenHeightOffset)
        : -0.65),
      { redOffset: Number.isFinite(Number(settings.redOffset)) ? Number(settings.redOffset) : -0.1 },
    );
    const crownAboveWallTop = Math.max(
      0.05,
      Number(referenceConstruction?.apexPoint?.y) || Number(building.domeTransitionHeight) || 1.2,
    );
    const ribWidth = THREE.MathUtils.clamp(Number(settings.ribWidth) || 0.1, 0.01, 1);
    sourceWallTop = portalNorthArchCurveStartY - crownAboveWallTop - ribWidth / 2;
    const wallTopShift = sourceWallTop - context.wallTop;
    sourceWallHeights = Object.fromEntries(Object.entries(context.wallHeights || {}).map(([side, height]) => [
      side,
      Number(height) + wallTopShift,
    ]));
  }
  const sourceBuilding = {
    ...building,
    type: 'room',
    buildingType: 'room',
    roomPlanShape: 'square',
    depth: fullRoomDepth,
    length: fullRoomDepth,
    domeEnabled: true,
    domeCoverType: portalUpperCoverType || 'dome',
    domeTransition: includesSquinchTransition ? 'squinch' : walls.portalTransition,
    // A square Portal Squinch carries the same sixteen-sided upper drum as the
    // complete square-room Squinch. Other Portal transitions remain direct-bearing.
    domeDrumHeight: portalSquinchUpperDrumHeight,
    domeArch: {
      ...building.domeArch,
      legExtension: 0,
    },
    domeOuterLegExtensionByCoverType: {
      ...building.domeOuterLegExtensionByCoverType,
      dome: 0,
      pyramid: 0,
      cone: 0,
    },
    domeOuterRingEnabledByCoverType: {
      ...building.domeOuterRingEnabledByCoverType,
      dome: false,
      pyramid: false,
      cone: false,
    },
    innerDomeEnabled: false,
  };
  if (portalUpperCoverType === 'dome') {
    const portalReferenceSpringY = Math.max(
      Number(context.wallTop) || 0,
      ...Object.values(context.wallHeights || {}).map((height) => Number(height) || 0),
    );
    const configuredGreenHeight = portalReferenceSpringY
      + (Number.isFinite(Number(building.domeArch?.greenHeightOffset))
        ? Number(building.domeArch.greenHeightOffset)
        : 0);
    const coverSpringY = walls.portalTransition === 'karbandi'
      && Number.isFinite(Number(context.karbandiCrownY))
      ? Number(context.karbandiCrownY)
      : includesSquinchTransition
        ? portalNorthArchCurveStartY + portalSquinchUpperDrumHeight
        : sourceWallTop + (Number(building.domeTransitionHeight) || 1.2);
    sourceBuilding.domeArch.greenHeightOffset = configuredGreenHeight - coverSpringY;
  }
  let portalCoverSpringY = walls.portalTransition === 'karbandi'
    && Number.isFinite(Number(context.karbandiCrownY))
    ? Number(context.karbandiCrownY)
    : includesSquinchTransition
      ? portalNorthArchCurveStartY + portalSquinchUpperDrumHeight
      : sourceWallTop + (Number(building.domeTransitionHeight) || 1.2);
  const northArchFaceRadiusAtY = (targetY) => {
    const points = (context.northArchPoints || [])
      .map((point) => ({ x: Number(point.x), y: Number(point.y) }))
      .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
    const intersections = [];
    for (let index = 0; index < points.length - 1; index += 1) {
      const start = points[index];
      const end = points[index + 1];
      if ((targetY - start.y) * (targetY - end.y) > 0) continue;
      const deltaY = end.y - start.y;
      const ratio = Math.abs(deltaY) <= 0.0000001
        ? 0
        : THREE.MathUtils.clamp((targetY - start.y) / deltaY, 0, 1);
      const x = THREE.MathUtils.lerp(start.x, end.x, ratio);
      if (x >= fullRoomCenterX - 0.000001) intersections.push(Math.abs(x - fullRoomCenterX));
    }
    if (intersections.length) return Math.max(...intersections);
    const rightHalf = points.filter((point) => point.x >= fullRoomCenterX - 0.000001);
    if (!rightHalf.length) return null;
    const nearest = rightHalf.reduce((best, point) => (
      Math.abs(point.y - targetY) < Math.abs(best.y - targetY) ? point : best
    ));
    return Math.abs(nearest.x - fullRoomCenterX);
  };
  const portalDomeUsesNorthGreenCircle = portalUpperCoverType === 'dome'
    && context.northArchGreenCircle != null;
  if (walls.portalTransition === 'karbandi'
    && portalDomeUsesNorthGreenCircle
    && Number.isFinite(Number(context.northArchGreenCircle.tangentY))) {
    const tangentY = Number(context.northArchGreenCircle.tangentY);
    const apexY = Number(context.northArchGreenCircle.apexY);
    const karbandiClipY = walls.portalTransition === 'karbandi'
      && Number.isFinite(Number(context.wallSupportedRibLegTopY))
      ? Number(context.wallSupportedRibLegTopY)
      : walls.portalTransition === 'karbandi'
        && Number.isFinite(Number(context.karbandiCrownContactY))
        ? Number(context.karbandiCrownContactY)
        : walls.portalTransition === 'karbandi' && Number.isFinite(Number(context.karbandiCrownY))
          ? Number(context.karbandiCrownY)
          : tangentY;
    const greenCircleLowerY = walls.portalTransition === 'karbandi'
      && Number.isFinite(Number(context.wallSupportedRibLegTopY))
      && Number.isFinite(Number(context.northArchGreenCircle.centerY))
      ? Number(context.northArchGreenCircle.centerY) + 0.0001
      : tangentY;
    portalCoverSpringY = THREE.MathUtils.clamp(
      karbandiClipY,
      greenCircleLowerY,
      Math.max(greenCircleLowerY, apexY - 0.001),
    );
  }
  const sampledNorthArchFaceRadius = portalDomeUsesNorthGreenCircle
    ? (() => {
      const centerRadiusX = Number(context.northArchGreenCircle.centerX) - fullRoomCenterX;
      const centerY = Number(context.northArchGreenCircle.centerY);
      const radius = Number(context.northArchGreenCircle.radius);
      const deltaY = portalCoverSpringY - centerY;
      return centerRadiusX + Math.sqrt(Math.max(0, radius ** 2 - deltaY ** 2));
    })()
    : northArchFaceRadiusAtY(portalCoverSpringY);
  const portalCoverNorthArchSetback = portalDomeUsesNorthGreenCircle
    ? 0
    : Math.max(0.004, Math.min(0.015, Number(walls.bricks?.mortar) || 0.01));
  const portalCoverInteriorTargetRadius = Number.isFinite(sampledNorthArchFaceRadius)
    ? Math.max(0.05, sampledNorthArchFaceRadius - portalCoverNorthArchSetback)
    : null;
  addRoomDomeCover(sourceGroup, sourceMeshes, sourceBuilding, walls, {
    ...context,
    centerX: fullRoomCenterX,
    centerZ: fullRoomCenterZ,
    depth: fullRoomDepth,
    wallTop: sourceWallTop,
    wallHeights: sourceWallHeights,
    portalCoverInteriorFaceFlush: portalUpperCoverType != null,
    portalCoverInteriorTargetRadius,
    portalDomeGreenCircle: portalDomeUsesNorthGreenCircle ? {
      centerX: Number(context.northArchGreenCircle.centerX) - fullRoomCenterX,
      centerY: Number(context.northArchGreenCircle.centerY),
      radius: Number(context.northArchGreenCircle.radius),
      apexY: Number(context.northArchGreenCircle.apexY),
      startX: portalCoverInteriorTargetRadius,
      startY: portalCoverSpringY,
    } : null,
    wallSupportedRibLegTopY: context.wallSupportedRibLegTopY,
  });
  sourceGroup.updateMatrixWorld(true);

  const slicePlane = new THREE.Plane(
    new THREE.Vector3(0, 0, 1),
    -slicePlaneZ,
  );
  const wallSupportedBoundaries = walls.portalTransition === 'karbandi'
    ? (context.wallSupportedRibBoundaries?.length
      ? context.wallSupportedRibBoundaries
      : [context.wallSupportedRibBoundary].filter(Boolean))
    : [];
  const wallSupportedRibPlanes = wallSupportedBoundaries.map((boundary) => {
    const normal = boundary?.planeNormal;
    const centerlineConstant = Number(boundary?.planeConstant);
    if (!Array.isArray(normal) || normal.length < 2 || !Number.isFinite(centerlineConstant)) return null;
    const plane = new THREE.Plane(
      new THREE.Vector3(Number(normal[0]), 0, Number(normal[1])).normalize(),
      -centerlineConstant,
    );
    const retainedPortalPoint = new THREE.Vector3(fullRoomCenterX, 0, slicePlaneZ);
    if (plane.distanceToPoint(retainedPortalPoint) < 0) plane.negate();
    return { boundary, plane };
  }).filter(Boolean);
  const clipMeshToSlice = (mesh) => {
    mesh.updateWorldMatrix(true, false);
    const geometry = mesh.geometry;
    const positions = geometry?.getAttribute?.('position');
    if (!positions) return;
    const uvs = geometry.getAttribute('uv');
    const index = geometry.index;
    const vertexCount = index?.count ?? positions.count;
    const clippedPositions = [];
    const clippedUvs = [];
    const clippedGroups = [];
    const sourceGroups = geometry.groups || [];
    const materialIndexAt = (offset) => sourceGroups.find((entry) => (
      offset >= entry.start && offset < entry.start + entry.count
    ))?.materialIndex || 0;
    const vertex = (offset) => {
      const vertexIndex = index ? index.getX(offset) : offset;
      const local = new THREE.Vector3().fromBufferAttribute(positions, vertexIndex);
      return {
        local,
        world: local.clone().applyMatrix4(mesh.matrixWorld),
        uv: uvs ? new THREE.Vector2().fromBufferAttribute(uvs, vertexIndex) : null,
      };
    };
    const interpolate = (from, to, amount) => ({
      local: from.local.clone().lerp(to.local, amount),
      world: from.world.clone().lerp(to.world, amount),
      uv: from.uv && to.uv ? from.uv.clone().lerp(to.uv, amount) : null,
    });
    const addTriangle = (triangle, materialIndex) => {
      const start = clippedPositions.length / 3;
      triangle.forEach((entry) => {
        clippedPositions.push(entry.local.x, entry.local.y, entry.local.z);
        if (entry.uv) clippedUvs.push(entry.uv.x, entry.uv.y);
      });
      const previous = clippedGroups.at(-1);
      if (previous && previous.materialIndex === materialIndex && previous.start + previous.count === start) {
        previous.count += 3;
      } else {
        clippedGroups.push({ start, count: 3, materialIndex });
      }
    };
    const activeClipPlanes = [slicePlane];
    if (mesh.userData?.roomDomePart === 'dome-shell' && wallSupportedRibPlanes.length) {
      activeClipPlanes.push(...wallSupportedRibPlanes.map(({ plane }) => plane));
    }
    for (let offset = 0; offset + 2 < vertexCount; offset += 3) {
      let polygon = [vertex(offset), vertex(offset + 1), vertex(offset + 2)];
      for (const activePlane of activeClipPlanes) {
        const output = [];
        for (let corner = 0; corner < polygon.length; corner += 1) {
          const current = polygon[corner];
          const next = polygon[(corner + 1) % polygon.length];
          const currentDistance = activePlane.distanceToPoint(current.world);
          const nextDistance = activePlane.distanceToPoint(next.world);
          const currentInside = currentDistance >= -0.000001;
          const nextInside = nextDistance >= -0.000001;
          if (currentInside) output.push(current);
          if (currentInside !== nextInside) {
            output.push(interpolate(
              current,
              next,
              THREE.MathUtils.clamp(currentDistance / (currentDistance - nextDistance), 0, 1),
            ));
          }
        }
        polygon = output;
        if (!polygon.length) break;
      }
      for (let corner = 1; corner + 1 < polygon.length; corner += 1) {
        addTriangle([polygon[0], polygon[corner], polygon[corner + 1]], materialIndexAt(offset));
      }
    }
    const clipped = new THREE.BufferGeometry();
    clipped.name = `${geometry.name || mesh.name || 'Portal Squinch'} true half-room slice`;
    clipped.setAttribute('position', new THREE.Float32BufferAttribute(clippedPositions, 3));
    if (uvs && clippedUvs.length * 3 === clippedPositions.length * 2) {
      clipped.setAttribute('uv', new THREE.Float32BufferAttribute(clippedUvs, 2));
    }
    clippedGroups.forEach((entry) => clipped.addGroup(entry.start, entry.count, entry.materialIndex));
    clipped.computeVertexNormals();
    clipped.computeBoundingBox();
    clipped.computeBoundingSphere();
    clipped.userData = {
      ...geometry.userData,
      portalSquinchSlicePlaneZ: slicePlaneZ,
      portalSquinchSliceRule: 'literal-south-half-of-complete-square-room-transition',
      portalKarbandiWallSupportedRibCenterlineClip: mesh.userData?.roomDomePart === 'dome-shell'
        && wallSupportedRibPlanes.length > 0,
    };
    mesh.geometry = clipped;
    mesh.userData.portalSquinchSlicePlaneZ = slicePlaneZ;
    mesh.userData.portalSquinchSliceRule = 'literal-south-half-of-complete-square-room-transition';
    if (mesh.userData?.roomDomePart === 'dome-shell' && wallSupportedRibPlanes.length) {
      mesh.userData.portalKarbandiWallSupportedRibClipPlanes = wallSupportedRibPlanes.map(({ boundary, plane }) => ({
        ribIndex: boundary.ribIndex,
        legs: [...boundary.legs],
        normal: [plane.normal.x, plane.normal.z],
        constant: plane.constant,
      }));
      mesh.userData.portalKarbandiWallSupportedRibClipPlane = mesh.userData.portalKarbandiWallSupportedRibClipPlanes[0];
    }
  };

  // The Portal's north wall is its open pointed-arch facade. A sliced square
  // Room therefore retains the rear (south) wall, both side-wall halves, and
  // the two rear corners. Keeping the former north set placed transition ribs
  // on the open facade and made them cross the Portal interior.
  const retainedArchIndexes = new Set([2, 3, 4, 5, 6]);
  let portalUpperDrumSideCount = 0;
  let portalUpperCoverBearingY = null;
  const objectArchIndex = (object) => [
    object.userData?.roomSquinchArchIndex,
    object.userData?.roomSquinchCornerArchIndex,
    object.userData?.roomSquinchWallArchIndex,
  ].find((value) => Number.isInteger(value));
  const pruneCoverAssembly = (container) => {
    [...container.children].forEach((child) => {
      const archIndex = objectArchIndex(child);
      if (Number.isInteger(archIndex) && !retainedArchIndexes.has(archIndex)) {
        container.remove(child);
        return;
      }
      if (child.children.length) {
        pruneCoverAssembly(child);
        if (!child.isMesh && child.children.length === 0) container.remove(child);
      }
    });
  };

  [...sourceGroup.children].forEach((child) => {
    const archIndex = objectArchIndex(child);
    const isRetainedRib = includesSquinchTransition
      && child.userData?.roomDomePart === 'squinch-transition-rib'
      && retainedArchIndexes.has(archIndex);
    const isCoverAssembly = includesSquinchTransition
      && child.userData?.isRoomDomeTransitionCover === true
      && child.userData?.roomDomeTransitionType === 'squinch';
    const isUpperDomeAssembly = portalUpperCoverType != null && [
      'dome-shell',
      'dome-drum',
    ].includes(child.userData?.roomDomePart);
    if (!isRetainedRib && !isCoverAssembly && !isUpperDomeAssembly) return;
    if (isCoverAssembly) {
      pruneCoverAssembly(child);
      child.name = 'Portal Squinch half-square transition cover';
      child.userData.portalSquinchHalfSquareRoom = true;
      child.userData.portalSquinchRetainedArchIndexes = [...retainedArchIndexes];
      child.userData.roomSquinchRoofAssembly = {
        ...child.userData.roomSquinchRoofAssembly,
        construction: 'south-half-of-square-room-squinch-behind-open-north-facade',
        cornerArchCount: 2,
        wallArchCount: 3,
        drumSkirtSideCount: 8,
        upperDrumSideCount: portalSquinchUpperDrumHeight > 0 ? 16 : 0,
      };
    } else {
      child.name = child.name.replace(/^Room /, 'Portal ');
    }
    child.traverse((object) => {
      object.userData.portalHalfCover = true;
      object.userData.portalCoverType = portalUpperCoverType;
      if (object.userData?.roomDomePart === 'dome-shell') {
        portalUpperCoverBearingY = object.userData.roomDomeFootY;
        object.userData.portalCoverHasVerticalLeg = false;
        object.userData.portalCoverHasDrum = portalSquinchUpperDrumHeight > 0;
        object.userData.portalCoverBearingY = object.userData.roomDomeFootY;
        object.userData.portalCoverBearingSource = portalDomeUsesNorthGreenCircle
          ? walls.portalTransition === 'karbandi'
            ? 'vertical-wall-top-on-wall-supported-rib-leg-centerlines'
            : 'north-wall-green-circle-tangent'
          : includesSquinchTransition
            ? 'actual-squinch-rib-outer-crown-top'
            : walls.portalTransition === 'karbandi'
              ? 'generated-karbandi-crown-envelope'
              : 'transition-crown';
        if (walls.portalTransition === 'karbandi' && context.wallSupportedRibBoundary) {
          object.userData.portalKarbandiWallSupportedRibBoundary = {
            ...context.wallSupportedRibBoundary,
          };
          object.userData.portalKarbandiWallSupportedRibBoundaries = wallSupportedBoundaries.map((boundary) => ({
            ...boundary,
            legs: [...boundary.legs],
          }));
          object.userData.portalKarbandiDomeClipRule = 'wall-top-behind-visible-rib-centerline-with-at-least-one-supported-leg';
        }
      }
      if (object.userData?.roomDomePart === 'dome-drum') {
        portalUpperDrumSideCount = Number(object.userData.roomDomeDrumSideCount) || 0;
        object.userData.portalCoverHasVerticalLeg = false;
        object.userData.portalCoverHasDrum = true;
        object.userData.portalCoverDrumRule = 'square-squinch-sixteen-sided-drum-beneath-dome';
      }
      if (includesSquinchTransition) {
        object.userData.portalSquinchHalfSquareRoom = true;
        object.userData.portalSquinchRetainedArchIndexes = [...retainedArchIndexes];
      }
    });
    group.add(child);
  });
  group.updateMatrixWorld(true);
  group.traverse((object) => {
    if (!object.isMesh || object.userData?.portalHalfCover !== true) return;
    clipMeshToSlice(object);
    meshes.push(object);
  });
  group.userData.portalSquinchHalfSquareRoom = true;
  group.userData.portalSquinchRetainedArchIndexes = [...retainedArchIndexes];
  group.userData.portalSquinchSupportWalls = ['south', 'east', 'west'];
  group.userData.portalSquinchSlicePlaneZ = slicePlaneZ;
  group.userData.portalSquinchFullRoomDepth = fullRoomDepth;
  group.userData.portalSquinchFacadeToRearDepth = context.depth;
  group.userData.portalSquinchNorthArchCurveStartY = portalNorthArchCurveStartY;
  group.userData.portalSquinchSourceWallTop = sourceWallTop;
  group.userData.portalSquinchCrownAlignment = includesSquinchTransition
    ? 'visible-rib-crown-top-equals-portal-north-arch-curve-start'
    : null;
  group.userData.portalSquinchIncludesHalfDome = portalUpperCoverType === 'dome';
  group.userData.portalSquinchIncludesHalfUpperCover = portalUpperCoverType != null;
  group.userData.portalSquinchCoverType = portalUpperCoverType || 'none';
  group.userData.portalSquinchUpperDrumSideCount = portalUpperDrumSideCount;
  group.userData.portalCoverHasVerticalLeg = false;
  group.userData.portalCoverHasDrum = portalUpperDrumSideCount > 0;
  group.userData.portalCoverBearingY = portalUpperCoverType
    ? portalUpperCoverBearingY
    : null;
  group.userData.portalCoverBearingSource = portalUpperCoverType
    ? portalDomeUsesNorthGreenCircle
      ? walls.portalTransition === 'karbandi'
        ? 'vertical-wall-top-on-wall-supported-rib-leg-centerlines'
        : 'north-wall-green-circle-tangent'
      : includesSquinchTransition
        ? 'actual-squinch-rib-outer-crown-top'
        : walls.portalTransition === 'karbandi'
          ? 'generated-karbandi-crown-envelope'
          : 'transition-crown'
    : null;
  group.userData.portalSquinchUpperAssembly = portalUpperCoverType
    ? `half-${portalUpperCoverType}-direct-bearing-on-portal-transition-crown`
    : null;
  group.userData.portalCoverType = portalUpperCoverType || walls.portalCover || 'none';
  group.userData.portalCoverNorthArchFaceRadius = sampledNorthArchFaceRadius;
  group.userData.portalCoverInteriorTargetRadius = portalCoverInteriorTargetRadius;
  group.userData.portalCoverNorthArchSetback = portalCoverNorthArchSetback;
  group.userData.portalCoverNorthArchFaceY = portalCoverSpringY;
  group.userData.portalCoverSlicePlaneZ = slicePlaneZ;
  group.userData.portalKarbandiDomeWallTopY = walls.portalTransition === 'karbandi'
    ? context.wallSupportedRibLegTopY
    : null;
  group.userData.portalKarbandiDomeWallSupportedRibBoundary = walls.portalTransition === 'karbandi'
    ? context.wallSupportedRibBoundary || null
    : null;
  group.userData.portalKarbandiDomeWallSupportedRibBoundaries = walls.portalTransition === 'karbandi'
    ? wallSupportedBoundaries
    : [];
  group.userData.portalKarbandiDomeClipRule = walls.portalTransition === 'karbandi'
    ? 'wall-top-behind-visible-rib-centerline-with-at-least-one-supported-leg'
    : null;
  group.userData.portalKarbandiDomeWallSupportedRibClipPlanes = wallSupportedRibPlanes.map(({ boundary, plane }) => ({
    ribIndex: boundary.ribIndex,
    legs: [...boundary.legs],
    normal: [plane.normal.x, plane.normal.z],
    constant: plane.constant,
  }));
  group.userData.portalKarbandiDomeWallSupportedRibClipPlane = group.userData.portalKarbandiDomeWallSupportedRibClipPlanes[0] || null;
  group.userData.portalSquinchSliceRule = 'literal-south-half-of-complete-square-room-transition';
}

function addPortalHalfVestibuleKarbandi(group, meshes, building, walls, context) {
  const sourceGroup = new THREE.Group();
  const fullPlanCenterZ = context.northZ;
  const fullPlanNorthZ = fullPlanCenterZ - context.depth;
  const fullPlanSouthZ = fullPlanCenterZ + context.depth;
  const virtualBuilding = {
    ...building,
    type: 'room',
    buildingType: 'vestibule',
    depth: context.depth * 2,
    length: context.depth * 2,
  };
  const solvedKarbandi = solveKarbandiWallSeating(
    { ...walls.karbandi, enabled: true, autoClip: true },
    virtualBuilding,
    walls,
  );
  const sourceWalls = {
    ...walls,
    karbandi: {
      ...solvedKarbandi,
      enabled: true,
      autoClip: true,
      coverEnabled: walls.karbandi.coverEnabled === true,
      guideVisible: walls.karbandi.guideVisible === true,
    },
  };
  const generated = addKarbandiVault(sourceGroup, {
    westX: context.westX,
    westExteriorX: context.westExteriorX,
    eastX: context.eastX,
    eastExteriorX: context.eastExteriorX,
    northZ: fullPlanNorthZ,
    northExteriorZ: fullPlanNorthZ - context.thickness,
    southZ: fullPlanSouthZ,
    southExteriorZ: fullPlanSouthZ + context.thickness,
    sideTop: context.sideTop,
    wallThickness: context.thickness,
    wallHeights: context.wallHeights,
    northArchPoints: [],
    northWallLeft: context.westX,
    northWallRight: context.eastX,
    northWallHeight: context.sideTop,
    northOpeningLeft: context.westX,
    northOpeningRight: context.eastX,
    rotationCenterX: context.centerX,
    rotationCenterZ: fullPlanCenterZ,
    roomMode: true,
    vestibuleMode: true,
  }, sourceWalls);

  const halfPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -fullPlanCenterZ);
  [...sourceGroup.children].forEach((child) => {
    child.name = child.name.replace(/^Room /, 'Portal half-Vestibule ');
    child.traverse((object) => {
      object.userData.portalHalfVestibuleKarbandi = true;
      object.userData.portalKarbandiBearingPlan = 'south-half-of-vestibule-wall-foot-octagon';
      if (!object.isMesh) return;
      const clipMaterial = (material) => {
        if (!material) return material;
        const clipped = material.clone();
        clipped.clippingPlanes = [
          ...(Array.isArray(material.clippingPlanes) ? material.clippingPlanes : []),
          halfPlane,
        ];
        clipped.clipShadows = true;
        return clipped;
      };
      object.material = Array.isArray(object.material)
        ? object.material.map(clipMaterial)
        : clipMaterial(object.material);
      object.userData.portalKarbandiHalfPlaneZ = fullPlanCenterZ;
      object.userData.portalKarbandiLegBearingRule = 'visible-south-half-legs-seat-on-derived-vestibule-wall-edges';
      meshes.push(object);
    });
    group.add(child);
  });
  Object.entries(sourceGroup.userData).forEach(([key, value]) => {
    if (/karbandi/i.test(key)) group.userData[key] = value;
  });
  group.userData.portalHalfVestibuleKarbandi = true;
  group.userData.portalKarbandiHalfPlaneZ = fullPlanCenterZ;
  group.userData.portalKarbandiBearingPlan = 'south-half-of-vestibule-wall-foot-octagon';
  group.userData.portalKarbandiSolvedSettings = solvedKarbandi;
  return generated;
}

function meshYRangeAtZ(mesh, sectionZ, epsilon = 0.00001) {
  const positions = mesh.geometry?.getAttribute?.('position');
  if (!positions) return null;
  mesh.updateWorldMatrix(true, false);
  const index = mesh.geometry.index;
  const triangleCount = index ? index.count / 3 : positions.count / 3;
  let minimumY = Infinity;
  let maximumY = -Infinity;
  let minimumX = Infinity;
  let maximumX = -Infinity;
  const vertex = (triangle, offset) => new THREE.Vector3().fromBufferAttribute(
    positions,
    index ? index.getX(triangle * 3 + offset) : triangle * 3 + offset,
  ).applyMatrix4(mesh.matrixWorld);
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const vertices = [vertex(triangle, 0), vertex(triangle, 1), vertex(triangle, 2)];
    [[0, 1], [1, 2], [2, 0]].forEach(([first, second]) => {
      const start = vertices[first];
      const end = vertices[second];
      const startDistance = start.z - sectionZ;
      const endDistance = end.z - sectionZ;
      let point = null;
      if (Math.abs(startDistance) <= epsilon) point = start;
      else if (Math.abs(endDistance) <= epsilon) point = end;
      else if (startDistance * endDistance < 0) {
        point = start.clone().lerp(end, startDistance / (startDistance - endDistance));
      }
      if (!point) return;
      minimumX = Math.min(minimumX, point.x);
      maximumX = Math.max(maximumX, point.x);
      minimumY = Math.min(minimumY, point.y);
      maximumY = Math.max(maximumY, point.y);
    });
  }
  return Number.isFinite(minimumY) && Number.isFinite(maximumY)
    ? { minimumX, maximumX, minimumY, maximumY }
    : null;
}

function polylineHeightAtX(points, x) {
  if (!points?.length) return null;
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    if (x < Math.min(start.x, end.x) - 0.000001 || x > Math.max(start.x, end.x) + 0.000001) continue;
    const progress = Math.abs(end.x - start.x) < 0.000001
      ? 0
      : THREE.MathUtils.clamp((x - start.x) / (end.x - start.x), 0, 1);
    return THREE.MathUtils.lerp(start.y, end.y, progress);
  }
  return null;
}

function portalKarbandiNorthWallShift(ribs, northWallFaceZ, archPoints, clearance) {
  if (!archPoints?.length) return {
    shiftY: 0,
    lowestVisibleRibIndex: null,
    lowestVisibleRange: null,
    lowestVisiblePoint: null,
    archHeightBeforeShift: null,
    archHeightAfterShift: null,
    intersectingRibCount: 0,
  };
  const openingLeft = Math.min(archPoints[0].x, archPoints.at(-1).x);
  const openingRight = Math.max(archPoints[0].x, archPoints.at(-1).x);
  const profiles = ribs
    .filter((mesh) => mesh?.isMesh && mesh.userData?.isKarbandi === true
      && mesh.userData?.isKarbandiVisualGuide !== true)
    .map((mesh) => {
      const range = meshYRangeAtZ(mesh, northWallFaceZ);
      if (!range) return { mesh, range, x: null, archY: null };
      const x = THREE.MathUtils.clamp((range.minimumX + range.maximumX) / 2, openingLeft, openingRight);
      return { mesh, range, x, archY: polylineHeightAtX(archPoints, x) };
    })
    .filter(({ range, archY }) => range
      && range.maximumX >= openingLeft - 0.0001
      && range.minimumX <= openingRight + 0.0001
      && Number.isFinite(archY))
    .sort((left, right) => left.range.minimumY - right.range.minimumY);
  // Move the complete north facade upward until its opening reaches the first
  // rib band above the old curve. Keeping the curve just below the section
  // leaves that wall/rib junction concealed by masonry instead of coincident.
  const lowestVisible = profiles.find(({ range, archY }) => (
    range.minimumY > archY + clearance + 0.0001
  )) || null;
  const shiftY = lowestVisible
    ? Math.max(0, lowestVisible.range.minimumY - clearance - lowestVisible.archY)
    : 0;
  return {
    shiftY,
    lowestVisibleRibIndex: lowestVisible?.mesh.userData?.karbandiRibIndex ?? null,
    lowestVisibleRange: lowestVisible
      ? [
        lowestVisible.range.minimumX,
        lowestVisible.range.maximumX,
        lowestVisible.range.minimumY,
        lowestVisible.range.maximumY,
      ]
      : null,
    lowestVisiblePoint: lowestVisible
      ? [lowestVisible.x, lowestVisible.range.minimumY]
      : null,
    archHeightBeforeShift: lowestVisible?.archY ?? null,
    archHeightAfterShift: lowestVisible ? lowestVisible.archY + shiftY : null,
    intersectingRibCount: profiles.length,
  };
}

export function buildWallSystem(building, value = {}, zones = []) {
  const walls = normalizeWallSystem(value, building);
  const group = new THREE.Group();
  group.name = 'Mehraz architectural wall system';
  group.userData.wallSystem = walls;
  if (!walls.enabled) return group;

  const thickness = Math.max(0.1, Number(building.wallThickness) || 0.4);
  const halfWidth = Math.max(1, Number(building.width) / 2);
  const halfDepth = Math.max(1, Number(building.depth) / 2);
  const westX = -halfWidth - walls.sideOffsets.west;
  const eastX = halfWidth + walls.sideOffsets.east;
  const northZ = -halfDepth - walls.sideOffsets.north;
  const southZ = halfDepth + walls.sideOffsets.south;
  const roomMode = building.type === 'room';
  const wallThicknessFor = (side) => roomMode
    ? Math.max(0.05, Number(walls.roomWallThicknesses?.[side]) || thickness)
    : thickness;
  const westExteriorX = westX - wallThicknessFor('west');
  const eastExteriorX = eastX + wallThicknessFor('east');
  const northExteriorZ = northZ - wallThicknessFor('north');
  const southExteriorZ = southZ + wallThicknessFor('south');
  const width = eastX - westX;
  const depth = southZ - northZ;
  const centerX = (westX + eastX) / 2;
  const centerZ = (northZ + southZ) / 2;
  const pointedArchActive = !roomMode && walls.pointedArch.enabled;
  const portalPlanShape = ['square', 'octagon', 'circle'].includes(building.portalPlanShape)
    ? building.portalPlanShape
    : 'square';
  const portalRegularPlan = !roomMode && portalPlanShape !== 'square';
  const bondPhase = {
    north: 0,
    east: width,
    south: width + depth,
    west: width * 2 + depth,
  };
  const outerWidth = width + wallThicknessFor('west') + wallThicknessFor('east');
  const outerDepth = depth + wallThicknessFor('north') + wallThicknessFor('south');
  const exteriorPerimeter = (outerWidth + outerDepth) * 2;
  const interiorPerimeter = (width + depth) * 2;
  const interiorBondPhase = {
    south: width / 2,
    east: width + depth / 2,
    north: width + depth + width / 2,
    west: width * 2 + depth + depth / 2,
  };
  const exteriorBondPhase = {
    south: width / 2 + wallThicknessFor('west'),
    east: outerWidth + depth / 2 + wallThicknessFor('south'),
    north: outerWidth + outerDepth + width / 2 + wallThicknessFor('east'),
    west: outerWidth * 2 + outerDepth + depth / 2 + wallThicknessFor('north'),
  };
  const height = (side) => Math.max(0.05, Number(building.height) + walls.extraHeights[side]);
  const portalSquinchArchSpringY = !roomMode
    && portalPlanShape === 'square'
    && walls.portalTransition === 'squinch'
    ? (() => {
      const settings = building.domeTransitionSettings?.squinch || {};
      const sourceWidth = width + thickness;
      const sourceDepth = depth * 2 + thickness;
      const halfSourceWidth = sourceWidth / 2;
      const halfSourceDepth = sourceDepth / 2;
      const cornerCut = Math.max(
        0.1,
        Math.min(halfSourceWidth, halfSourceDepth) * (2 - Math.sqrt(2)),
      );
      const referenceHalfSpan = Math.max(0.1, halfSourceWidth - cornerCut);
      const referenceSpringY = Number.isFinite(Number(settings.springHeightOffset))
        ? Number(settings.springHeightOffset)
        : 0;
      const referenceConstruction = pointedArchConstruction(
        0,
        referenceHalfSpan,
        referenceSpringY,
        Math.max(0.05, Number(settings.greenOffset) || 0.45),
        referenceSpringY + (Number.isFinite(Number(settings.greenHeightOffset))
          ? Number(settings.greenHeightOffset)
          : -0.65),
        { redOffset: Number.isFinite(Number(settings.redOffset)) ? Number(settings.redOffset) : -0.1 },
      );
      const crownRise = Math.max(
        0.05,
        (Number(referenceConstruction?.apexPoint?.y) || referenceSpringY + 1.2)
          - referenceSpringY,
      );
      const ribWidth = THREE.MathUtils.clamp(Number(settings.ribWidth) || 0.1, 0.01, 1);
      return Math.max(
        0.05,
        Math.max(height('east'), height('west')) - crownRise - ribWidth / 2,
      );
    })()
    : null;
  const verticalWallHeight = (side) => portalSquinchArchSpringY == null
    ? height(side)
    : portalSquinchArchSpringY;
  group.userData.portalSquinchVerticalWallTopY = portalSquinchArchSpringY;
  group.userData.portalSquinchVerticalWallTopRule = portalSquinchArchSpringY == null
    ? null
    : 'south-east-west-walls-stop-at-squinch-arch-spring';
  const material = wallMaterial(walls);
  const meshes = [];
  // Side walls terminate at the inside faces of the north and south walls.
  // This keeps the corners closed as butt joints without intersecting volumes.
  const sideWallDepth = depth;
  const sideWallCenterZ = centerZ;
  const gypsumBaseTop = walls.stoneBase.enabled ? Math.max(0, walls.stoneBase.height) : 0;
  const decorativeJointTrim = Math.max(0.01, Math.min(0.06, walls.bricks.mortar * 2 + 0.012, thickness * 0.16));
  const sideNorthTrim = decorativeJointTrim;
  const sideSouthTrim = decorativeJointTrim;
  const eastDecorMin = -sideWallDepth / 2 + sideNorthTrim;
  const eastDecorMax = sideWallDepth / 2 - sideSouthTrim;
  const eastDecorDepth = Math.max(0.05, eastDecorMax - eastDecorMin);
  const westDecorMin = -sideWallDepth / 2 + sideSouthTrim;
  const westDecorMax = sideWallDepth / 2 - sideNorthTrim;
  const westDecorDepth = Math.max(0.05, westDecorMax - westDecorMin);

  const addRoomSouthStyleWall = (side) => {
    if (!roomMode || walls.openSides.includes(side)) return;
    const northSouth = side === 'north' || side === 'south';
    const clearSpan = northSouth ? width : depth;
    const exteriorLeft = side === 'south'
      ? -clearSpan / 2 - wallThicknessFor('west')
      : side === 'north'
        ? -clearSpan / 2 - wallThicknessFor('east')
        : side === 'east'
          ? -clearSpan / 2 - wallThicknessFor('south')
          : -clearSpan / 2 - wallThicknessFor('north');
    const exteriorRight = side === 'south'
      ? clearSpan / 2 + wallThicknessFor('east')
      : side === 'north'
        ? clearSpan / 2 + wallThicknessFor('west')
        : side === 'east'
          ? clearSpan / 2 + wallThicknessFor('north')
          : clearSpan / 2 + wallThicknessFor('south');
    // North and south are the two long walls. East and west stop exactly at
    // their interior faces, forming butt joints with zero overlapping volume.
    const structuralLeft = northSouth ? exteriorLeft : -clearSpan / 2;
    const structuralRight = northSouth ? exteriorRight : clearSpan / 2;
    const wallDepth = wallThicknessFor(side);
    const wallHeight = height(side);
    const openingSettings = walls.roomWallOpenings?.[side] || DEFAULT_WALL_SYSTEM.roomWallOpenings[side];
    const openingProfiles = {};
    const holes = [];
    if (openingSettings.door.enabled) {
      if (!(building.domeTransition === 'karbandi'
        && roomKarbandiOpeningMovesAboveWall(openingSettings.door, clearSpan, wallHeight, 0))) {
        openingProfiles.door = southOpeningProfile(openingSettings.door, 0, clearSpan, wallHeight, 0);
      }
    }
    if (openingSettings.window.enabled) {
      const sill = Math.max(0, Number(openingSettings.window.sillHeight) || 0);
      const movesToOctagon = building.domeTransition === 'karbandi'
        && roomKarbandiOpeningMovesAboveWall(openingSettings.window, clearSpan, wallHeight, sill);
      if (!movesToOctagon && sill < wallHeight - 0.001) {
        openingProfiles.window = southOpeningProfile(openingSettings.window, 0, clearSpan, wallHeight, sill);
        holes.push(openingHole(openingProfiles.window));
      }
    }
    const structuralShape = rectangleShapeWithDoorNotch(
      structuralLeft,
      structuralRight,
      wallHeight,
      openingProfiles.door,
      holes,
    );
    const faceShape = rectangleShapeWithDoorNotch(
      -clearSpan / 2,
      clearSpan / 2,
      wallHeight,
      openingProfiles.door,
      holes,
    );
    const soldierCutouts = openingSoldierCutouts(openingProfiles, walls, gypsumBaseTop);
    const wallGroup = new THREE.Group();
    wallGroup.name = `Room ${side} south-style wall`;
    wallGroup.userData.wallSide = side;
    wallGroup.userData.roomWallConstructionMethod = 'south-wall-options-and-opening-design';
    wallGroup.userData.roomWallOpeningTypes = Object.keys(openingProfiles);
    wallGroup.userData.roomWallTransferredOpeningTypes = ['door', 'window'].filter((openingType) => (
      openingSettings[openingType]?.enabled
        && !Object.prototype.hasOwnProperty.call(openingProfiles, openingType)
        && roomKarbandiOpeningMovesAboveWall(
          openingSettings[openingType],
          clearSpan,
          wallHeight,
          openingType === 'window' ? Math.max(0, Number(openingSettings.window.sillHeight) || 0) : 0,
        )
    ));
    if (side === 'south') wallGroup.position.set(centerX, 0, southZ);
    if (side === 'north') {
      wallGroup.position.set(centerX, 0, northZ);
      wallGroup.rotation.y = Math.PI;
    }
    if (side === 'east') {
      wallGroup.position.set(eastX, 0, centerZ);
      wallGroup.rotation.y = Math.PI / 2;
    }
    if (side === 'west') {
      wallGroup.position.set(westX, 0, centerZ);
      wallGroup.rotation.y = -Math.PI / 2;
    }
    const bodyMaterials = [
      directRoomWallFaceMaterial(
        walls,
        side,
        clearSpan,
        wallHeight,
        interiorBondPhase[side],
        interiorPerimeter,
      ),
      directRoomWallFaceMaterial(
        walls,
        `${side}_exterior`,
        structuralRight - structuralLeft,
        wallHeight,
        exteriorBondPhase[side],
        exteriorPerimeter,
      ),
      wallMaterial(walls, side, structuralRight - structuralLeft, wallHeight, true, interiorBondPhase[side]),
    ];
    bodyMaterials[1].userData.roomWallExteriorPerimeterInterval = [
      exteriorBondPhase[side] + structuralLeft,
      exteriorBondPhase[side] + structuralRight,
    ];
    if (northSouth) {
      if (side === 'south') {
        const leftReturnMaterial = directRoomWallFaceMaterial(
            walls,
            'west_exterior',
            wallDepth,
            wallHeight,
            exteriorPerimeter - wallDepth,
            exteriorPerimeter,
          );
        leftReturnMaterial.userData.roomWallExteriorPerimeterInterval = [
          exteriorPerimeter - wallDepth,
          exteriorPerimeter,
        ];
        const rightReturnMaterial = directRoomWallFaceMaterial(
            walls,
            'east_exterior',
            wallDepth,
            wallHeight,
            -(outerWidth + wallDepth),
            exteriorPerimeter,
            true,
          );
        rightReturnMaterial.userData.roomWallExteriorPerimeterInterval = [outerWidth, outerWidth + wallDepth];
        bodyMaterials.push(leftReturnMaterial, rightReturnMaterial);
      } else {
        const leftReturnMaterial = directRoomWallFaceMaterial(
            walls,
            'east_exterior',
            wallDepth,
            wallHeight,
            outerWidth + wallThicknessFor('south') + depth,
            exteriorPerimeter,
          );
        leftReturnMaterial.userData.roomWallExteriorPerimeterInterval = [
          outerWidth + wallThicknessFor('south') + depth,
          outerWidth + outerDepth,
        ];
        const rightReturnMaterial = directRoomWallFaceMaterial(
            walls,
            'west_exterior',
            wallDepth,
            wallHeight,
            -(2 * outerWidth + outerDepth + wallDepth),
            exteriorPerimeter,
            true,
          );
        rightReturnMaterial.userData.roomWallExteriorPerimeterInterval = [
          2 * outerWidth + outerDepth,
          2 * outerWidth + outerDepth + wallDepth,
        ];
        bodyMaterials.push(leftReturnMaterial, rightReturnMaterial);
      }
    }
    const body = extrudedShape(
      structuralShape,
      wallDepth,
      0,
      bodyMaterials,
      side,
      null,
      northSouth,
    );
    body.userData.roomWallConstructionMethod = 'south-wall-options-and-opening-design';
    body.userData.isRoomWallBody = true;
    body.userData.roomWallDepth = wallDepth;
    body.userData.roomWallInteriorFace = 0;
    body.userData.roomWallExteriorFace = wallDepth;
    body.userData.roomWallInteriorMaterialIndex = 0;
    body.userData.roomWallExteriorMaterialIndex = 1;
    body.userData.roomWallReturnMaterialIndex = 2;
    body.userData.roomWallLeftEndMaterialIndex = northSouth ? 3 : 2;
    body.userData.roomWallRightEndMaterialIndex = northSouth ? 4 : 2;
    body.userData.roomWallButtJointRole = northSouth ? 'long-wall' : 'short-wall-between-long-wall-interior-faces';
    body.userData.roomWallHasBondOverlay = false;
    wallGroup.add(body);
    meshes.push(body);
    addInteriorGypsumFace(
      wallGroup,
      faceShape,
      side,
      [0, 0, -0.02],
      [0, 0, 0],
      walls,
      gypsumBaseTop,
      soldierCutouts,
      gypsumZoneCutouts(zones, side, walls),
    );
    const soldierHeight = Math.max(walls.bricks.brickHeight, walls.bricks.brickWidth);
    const raisedProjection = Math.max(0.018, Math.min(0.06, walls.northBoundary?.depth || 0.03));
    const addOpeningTrim = (wallFace) => {
      const exterior = wallFace === 'exterior';
      const trimZ = exterior ? wallDepth + raisedProjection + 0.008 : -0.008;
      const trimOptions = {
        roomWall: true,
        wallFace,
        materialSide: exterior ? `${side}_exterior` : side,
        coordinateSpace: 'local',
      };
      if (openingProfiles.door) {
        if (openingProfiles.door.archPoints?.length) {
          addRaisedOpeningArchCourse(wallGroup, 'door', openingProfiles.door, openingSettings.door, soldierHeight, trimZ, walls, side, trimOptions);
        } else {
          addRaisedOpeningSoldierCourse(wallGroup, 'door', openingProfiles.door.center, openingProfiles.door.top + soldierHeight / 2, openingProfiles.door.width, soldierHeight, trimZ, walls, 'lintel', side, trimOptions);
        }
        const jambBottom = walls.stoneBase.enabled ? Math.max(0, walls.stoneBase.height) : 0;
        addRaisedOpeningJambCourses(wallGroup, 'door', openingProfiles.door, jambBottom, soldierHeight, trimZ, walls, side, trimOptions);
      }
      if (openingProfiles.window) {
        if (openingProfiles.window.archPoints?.length) {
          addRaisedOpeningArchCourse(wallGroup, 'window', openingProfiles.window, openingSettings.window, soldierHeight, trimZ, walls, side, trimOptions);
        } else {
          addRaisedOpeningSoldierCourse(wallGroup, 'window', openingProfiles.window.center, openingProfiles.window.top + soldierHeight / 2, openingProfiles.window.width, soldierHeight, trimZ, walls, 'lintel', side, trimOptions);
        }
        addRaisedOpeningSoldierCourse(wallGroup, 'window', openingProfiles.window.center, openingProfiles.window.bottom - soldierHeight / 2, openingProfiles.window.width, soldierHeight, trimZ, walls, 'sill', side, trimOptions);
        addRaisedOpeningJambCourses(wallGroup, 'window', openingProfiles.window, openingProfiles.window.bottom, soldierHeight, trimZ, walls, side, trimOptions);
      }
    };
    addOpeningTrim('interior');
    addOpeningTrim('exterior');
    group.add(wallGroup);
  };

  const vestibuleKarbandiPlanVertices = (() => {
    if (!roomMode || building.buildingType !== 'vestibule' || building.domeTransition !== 'karbandi') return null;
    const probe = new THREE.Group();
    const wallTop = Math.max(...WALL_SIDES.map((side) => height(side)));
    const probeWalls = {
      ...walls,
      karbandi: {
        ...walls.karbandi,
        enabled: true,
        coverEnabled: false,
        guideVisible: false,
      },
    };
    addKarbandiVault(probe, {
      westX,
      westExteriorX,
      eastX,
      eastExteriorX,
      northZ,
      northExteriorZ,
      southZ,
      southExteriorZ,
      sideTop: wallTop,
      wallThickness: thickness,
      wallHeights: Object.fromEntries(WALL_SIDES.map((side) => [side, height(side)])),
      northArchPoints: [],
      northWallLeft: westX,
      northWallRight: eastX,
      northWallHeight: wallTop,
      northOpeningLeft: westX,
      northOpeningRight: eastX,
      rotationCenterX: centerX,
      rotationCenterZ: centerZ,
      roomMode: true,
      vestibuleMode: building.buildingType === 'vestibule',
    }, probeWalls);
    const footprint = (probe.userData.roomKarbandiWallSupportFootOctagon || [])
      .slice(0, 8)
      .map((entry) => new THREE.Vector2(entry.point[0], entry.point[2]));
    disposeWallSystem(probe);
    return footprint.length === 8 ? footprint : null;
  })();

  const portalVestibulePlanVertices = (() => {
    if (!portalRegularPlan || portalPlanShape !== 'octagon') return null;
    const probe = new THREE.Group();
    const wallTop = Math.max(...WALL_SIDES.map((side) => height(side)));
    const fullPlanCenterZ = northZ;
    const fullPlanNorthZ = fullPlanCenterZ - depth;
    const fullPlanSouthZ = fullPlanCenterZ + depth;
    const virtualVestibuleBuilding = {
      ...building,
      type: 'room',
      buildingType: 'vestibule',
      depth: depth * 2,
      length: depth * 2,
    };
    const solvedKarbandi = solveKarbandiWallSeating(
      { ...walls.karbandi, enabled: true },
      virtualVestibuleBuilding,
      walls,
    );
    const probeWalls = {
      ...walls,
      karbandi: {
        ...solvedKarbandi,
        enabled: true,
        coverEnabled: false,
        guideVisible: false,
      },
    };
    addKarbandiVault(probe, {
      westX,
      westExteriorX,
      eastX,
      eastExteriorX,
      northZ: fullPlanNorthZ,
      northExteriorZ: fullPlanNorthZ - thickness,
      southZ: fullPlanSouthZ,
      southExteriorZ: fullPlanSouthZ + thickness,
      sideTop: wallTop,
      wallThickness: thickness,
      wallHeights: Object.fromEntries(WALL_SIDES.map((side) => [side, height(side)])),
      northArchPoints: [],
      northWallLeft: westX,
      northWallRight: eastX,
      northWallHeight: wallTop,
      northOpeningLeft: westX,
      northOpeningRight: eastX,
      rotationCenterX: centerX,
      rotationCenterZ: fullPlanCenterZ,
      roomMode: true,
      vestibuleMode: true,
    }, probeWalls);
    const footprint = (probe.userData.roomKarbandiWallSupportFootOctagon || [])
      .slice(0, 8)
      .map((entry) => new THREE.Vector2(entry.point[0], entry.point[2]));
    disposeWallSystem(probe);
    return footprint.length === 8 ? footprint : null;
  })();

  const addRegularPlanRoomWalls = () => {
    const portalHalfPlan = !roomMode;
    const planShape = portalHalfPlan ? portalPlanShape : building.roomPlanShape || 'square';
    const sideCount = planShape === 'circle'
      ? 64
      : planShape === 'octagon'
        ? 8
        : Math.round(THREE.MathUtils.clamp(Number(building.roomPolygonSides) || 6, 3, 32));
    const planCenterZ = portalHalfPlan ? northZ : centerZ;
    const fullPlanDepth = portalHalfPlan ? depth * 2 : depth;
    const radius = Math.max(1, Math.min(width, fullPlanDepth) / 2);
    const planWallDepth = Math.max(0.05, thickness);
    // A Portal is the southern half of the full plan behind its north facade.
    // Put opposite regular-plan vertices on that facade cut line so Octagon
    // and Circle never need split wall fragments in front of the opening.
    const angleOffset = portalHalfPlan ? 0 : Math.PI / 2 + Math.PI / sideCount;
    const verticesAtRadius = (planRadius) => Array.from({ length: sideCount }, (_, index) => {
      const angle = angleOffset + index * Math.PI * 2 / sideCount;
      return new THREE.Vector2(
        centerX + Math.cos(angle) * planRadius,
        planCenterZ + Math.sin(angle) * planRadius,
      );
    });
    const karbandiPlanVertices = vestibuleKarbandiPlanVertices || portalVestibulePlanVertices;
    const vertices = karbandiPlanVertices || verticesAtRadius(radius);
    const offsetConvexVertices = (points, distance) => points.map((point, index) => {
      const previous = points[(index - 1 + points.length) % points.length];
      const next = points[(index + 1) % points.length];
      const previousDirection = point.clone().sub(previous).normalize();
      const nextDirection = next.clone().sub(point).normalize();
      const previousNormal = new THREE.Vector2(previousDirection.y, -previousDirection.x);
      const nextNormal = new THREE.Vector2(nextDirection.y, -nextDirection.x);
      const bisector = previousNormal.clone().add(nextNormal).normalize();
      const projection = bisector.dot(nextNormal);
      if (projection <= 0.000001) {
        return point.clone().add(point.clone().sub(new THREE.Vector2(centerX, planCenterZ)).normalize().multiplyScalar(distance));
      }
      return point.clone().addScaledVector(bisector, distance / projection);
    });
    const outerVertices = karbandiPlanVertices
      ? offsetConvexVertices(vertices, planWallDepth)
      : verticesAtRadius(radius + planWallDepth / Math.cos(Math.PI / sideCount));
    const planGroup = new THREE.Group();
    planGroup.name = portalHalfPlan
      ? `Portal half-${planShape} floor-plan walls`
      : `Room ${planShape} floor-plan walls`;
    planGroup.userData.roomPlanShape = planShape;
    planGroup.userData.roomPlanSideCount = sideCount;
    planGroup.userData.portalPlanShape = portalHalfPlan ? planShape : null;
    planGroup.userData.portalHalfPlan = portalHalfPlan;
    planGroup.userData.portalHalfPlanCutLineZ = portalHalfPlan ? planCenterZ : null;
    planGroup.userData.roomPlanBoundingSize = [width, depth];
    planGroup.userData.roomPlanDiameter = radius * 2;
    planGroup.userData.roomPlanWallDepth = planWallDepth;
    const innerSegmentLengths = vertices.map((point, index) => point.distanceTo(vertices[(index + 1) % sideCount]));
    const outerSegmentLengths = outerVertices.map((point, index) => point.distanceTo(outerVertices[(index + 1) % sideCount]));
    const cumulativeLengths = (lengths) => lengths.reduce((starts, length) => (
      [...starts, starts.at(-1) + length]
    ), [0]);
    const innerSegmentStarts = karbandiPlanVertices
      ? cumulativeLengths(innerSegmentLengths)
      : Array.from({ length: sideCount + 1 }, (_, index) => index * innerSegmentLengths[0]);
    const outerSegmentStarts = karbandiPlanVertices
      ? cumulativeLengths(outerSegmentLengths)
      : Array.from({ length: sideCount + 1 }, (_, index) => index * outerSegmentLengths[0]);
    const innerPerimeter = innerSegmentStarts.at(-1);
    const outerPerimeter = outerSegmentStarts.at(-1);
    planGroup.userData.roomPlanInteriorPerimeter = innerPerimeter;
    planGroup.userData.roomPlanExteriorPerimeter = outerPerimeter;
    planGroup.userData.roomPlanInteriorSegmentLengths = innerSegmentLengths;
    planGroup.userData.roomPlanExteriorSegmentLengths = outerSegmentLengths;
    planGroup.userData.roomPlanInteriorSegmentStarts = innerSegmentStarts.slice(0, -1);
    planGroup.userData.roomPlanExteriorSegmentStarts = outerSegmentStarts.slice(0, -1);
    planGroup.userData.roomPlanExteriorSegmentLength = outerSegmentLengths[0];
    planGroup.userData.roomPlanFootprintSource = karbandiPlanVertices
      ? portalHalfPlan
        ? 'south-half-of-vestibule-eight-visible-karbandi-rib-feet'
        : 'eight-visible-karbandi-rib-feet-on-square-reference-walls'
      : 'regular-plan-inscribed-in-room-bounds';

    const segmentGeometry = (start, end, outerStart, outerEnd, wallHeight, openings = []) => {
      const positions = [];
      const uvs = [];
      const geometry = new THREE.BufferGeometry();
      const point = (planPoint, y) => new THREE.Vector3(planPoint.x, y, planPoint.y);
      const addFace = (corners, faceUvs, materialIndex) => {
        const offset = positions.length / 3;
        [0, 1, 2, 0, 2, 3].forEach((cornerIndex) => {
          const corner = corners[cornerIndex];
          const uv = faceUvs[cornerIndex];
          positions.push(corner.x, corner.y, corner.z);
          uvs.push(uv[0], uv[1]);
        });
        geometry.addGroup(offset, 6, materialIndex);
      };
      const innerLength = start.distanceTo(end);
      const exteriorLength = outerStart.distanceTo(outerEnd);
      const uBreaks = [...new Set([0, innerLength, ...openings.flatMap((opening) => [
        opening.start,
        opening.end,
        ...(opening.archPoints || []).map((point) => opening.center + point.x),
      ])])]
        .filter((u) => u >= 0 && u <= innerLength)
        .sort((a, b) => a - b);
      const yBreaks = [...new Set([0, wallHeight, ...openings.flatMap((opening) => [
        opening.bottom,
        opening.springTop,
        opening.top,
        ...(opening.archPoints || []).map((point) => point.y),
      ])])]
        .filter((y) => y >= 0 && y <= wallHeight)
        .sort((a, b) => a - b);
      const interpolate = (from, to, distance) => from.clone().lerp(to, distance / innerLength);
      for (let uIndex = 0; uIndex < uBreaks.length - 1; uIndex += 1) {
        const u0 = uBreaks[uIndex];
        const u1 = uBreaks[uIndex + 1];
        if (u1 - u0 <= 0.000001) continue;
        const outerU0 = u0 / innerLength * exteriorLength;
        const outerU1 = u1 / innerLength * exteriorLength;
        const cellInnerStart = interpolate(start, end, u0);
        const cellInnerEnd = interpolate(start, end, u1);
        const cellOuterStart = interpolate(outerStart, outerEnd, u0);
        const cellOuterEnd = interpolate(outerStart, outerEnd, u1);
        for (let yIndex = 0; yIndex < yBreaks.length - 1; yIndex += 1) {
          const y0 = yBreaks[yIndex];
          const y1 = yBreaks[yIndex + 1];
          if (y1 - y0 <= 0.000001) continue;
          const centerU = (u0 + u1) / 2;
          const centerY = (y0 + y1) / 2;
          const removed = openings.some((opening) => {
            if (centerU <= opening.start - 0.000001 || centerU >= opening.end + 0.000001) return false;
            const headY = opening.head === 'arch' && opening.archPoints?.length
              ? domeProfileHeightAtRadius(opening.archPoints, centerU - opening.center)
              : opening.top;
            return centerY > opening.bottom - 0.000001
              && centerY < Math.min(wallHeight, headY) + 0.000001;
          });
          if (removed) continue;
          addFace(
            [point(cellInnerStart, y0), point(cellInnerEnd, y0), point(cellInnerEnd, y1), point(cellInnerStart, y1)],
            [[u0, y0], [u1, y0], [u1, y1], [u0, y1]],
            0,
          );
          addFace(
            [point(cellOuterStart, y0), point(cellOuterStart, y1), point(cellOuterEnd, y1), point(cellOuterEnd, y0)],
            [[outerU0, y0], [outerU0, y1], [outerU1, y1], [outerU1, y0]],
            1,
          );
          addFace(
            [point(cellInnerStart, y1), point(cellInnerEnd, y1), point(cellOuterEnd, y1), point(cellOuterStart, y1)],
            [[u0, 0], [u1, 0], [outerU1, planWallDepth], [outerU0, planWallDepth]],
            2,
          );
          addFace(
            [point(cellInnerStart, y0), point(cellOuterStart, y0), point(cellOuterEnd, y0), point(cellInnerEnd, y0)],
            [[u0, 0], [outerU0, planWallDepth], [outerU1, planWallDepth], [u1, 0]],
            2,
          );
          addFace(
            [point(cellInnerStart, y0), point(cellInnerStart, y1), point(cellOuterStart, y1), point(cellOuterStart, y0)],
            [[0, y0], [0, y1], [planWallDepth, y1], [planWallDepth, y0]],
            2,
          );
          addFace(
            [point(cellInnerEnd, y0), point(cellOuterEnd, y0), point(cellOuterEnd, y1), point(cellInnerEnd, y1)],
            [[0, y0], [planWallDepth, y0], [planWallDepth, y1], [0, y1]],
            2,
          );
        }
      }
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geometry.computeVertexNormals();
      geometry.userData.roomPlanBondUvMapping = 'developed-continuous-interior-and-exterior-perimeters';
      geometry.userData.roomPlanOpeningCutouts = openings.map((opening) => ({ ...opening }));
      return geometry;
    };

    const openingCutsForSegment = (index, wallHeight) => {
      if (portalHalfPlan) return [];
      const segmentStart = innerSegmentStarts[index];
      const segmentEnd = innerSegmentStarts[index + 1];
      return (walls.roomPlanOpenings || []).flatMap((opening) => {
        const northSegmentIndex = vertices.reduce((northIndex, point, candidateIndex) => {
          const midpoint = point.clone().add(vertices[(candidateIndex + 1) % sideCount]).multiplyScalar(0.5);
          const northPoint = vertices[northIndex].clone().add(vertices[(northIndex + 1) % sideCount]).multiplyScalar(0.5);
          return midpoint.y < northPoint.y ? candidateIndex : northIndex;
        }, 0);
        const northPhase = innerSegmentStarts[northSegmentIndex] + innerSegmentLengths[northSegmentIndex] / 2;
        const centerPhase = ((northPhase + opening.rotation / 360 * innerPerimeter) % innerPerimeter + innerPerimeter) % innerPerimeter;
        const bottom = opening.type === 'window' ? opening.sillHeight : 0;
        const springTop = Math.min(wallHeight, bottom + opening.height);
        if (springTop <= bottom + 0.000001) return [];
        const archPoints = opening.head === 'arch'
          ? archCurve(
            0,
            opening.width / 2,
            springTop,
            springTop,
            opening.arch?.greenOffset,
            opening.arch?.greenHeight,
            36,
            { redOffset: opening.arch?.redOffset },
          )
          : [];
        const usesArch = archPoints.length > 2;
        const top = Math.min(
          wallHeight,
          usesArch ? Math.max(...archPoints.map((point) => point.y)) : springTop,
        );
        return [-innerPerimeter, 0, innerPerimeter].flatMap((shift) => {
          const openingStart = centerPhase - opening.width / 2 + shift;
          const openingEnd = centerPhase + opening.width / 2 + shift;
          const overlapStart = Math.max(segmentStart, openingStart);
          const overlapEnd = Math.min(segmentEnd, openingEnd);
          if (overlapEnd <= overlapStart + 0.000001) return [];
          return [{
            id: opening.id,
            type: opening.type,
             start: overlapStart - segmentStart,
             end: overlapEnd - segmentStart,
             center: centerPhase + shift - segmentStart,
             bottom,
             springTop,
             top,
             head: usesArch ? 'arch' : 'lintel',
             archPoints,
           }];
        });
      });
    };

    const clipSegmentAtPortalFacade = (start, end) => {
      if (!portalHalfPlan) return { start: start.clone(), end: end.clone() };
      const startInside = start.y >= planCenterZ - 0.000001;
      const endInside = end.y >= planCenterZ - 0.000001;
      if (!startInside && !endInside) return null;
      const clippedStart = start.clone();
      const clippedEnd = end.clone();
      if (startInside !== endInside) {
        const amount = THREE.MathUtils.clamp(
          (planCenterZ - start.y) / (end.y - start.y),
          0,
          1,
        );
        const intersection = start.clone().lerp(end, amount);
        intersection.y = planCenterZ;
        if (startInside) clippedEnd.copy(intersection);
        else clippedStart.copy(intersection);
      }
      return { start: clippedStart, end: clippedEnd };
    };
    const visiblePlanSegments = vertices.flatMap((sourceStart, index) => {
      const sourceEnd = vertices[(index + 1) % sideCount];
      const sourceOuterStart = outerVertices[index];
      const sourceOuterEnd = outerVertices[(index + 1) % sideCount];
      const inner = clipSegmentAtPortalFacade(sourceStart, sourceEnd);
      const outer = clipSegmentAtPortalFacade(sourceOuterStart, sourceOuterEnd);
      if (!inner || !outer || inner.start.distanceTo(inner.end) <= 0.000001) return [];
      return [{
        index,
        start: inner.start,
        end: inner.end,
        outerStart: outer.start,
        outerEnd: outer.end,
        interiorPhaseOffset: sourceStart.distanceTo(inner.start),
        exteriorPhaseOffset: sourceOuterStart.distanceTo(outer.start),
      }];
    });

    visiblePlanSegments.forEach((entry) => {
      const {
        index,
        start,
        end,
        outerStart,
        outerEnd,
        interiorPhaseOffset,
        exteriorPhaseOffset,
      } = entry;
      const midpoint = start.clone().add(end).multiplyScalar(0.5);
      const direction = end.clone().sub(start);
      const segmentLength = direction.length();
      const radial = midpoint.clone().sub(new THREE.Vector2(centerX, planCenterZ)).normalize();
      const side = Math.abs(radial.x) > Math.abs(radial.y)
        ? radial.x > 0 ? 'east' : 'west'
        : radial.y > 0 ? 'south' : 'north';
      if (walls.openSides.includes(side)) return;
      const wallHeight = height(side);
      const openingCuts = openingCutsForSegment(index, wallHeight);
      const interiorPhase = innerSegmentStarts[index] + interiorPhaseOffset;
      const exteriorPhase = outerSegmentStarts[index] + exteriorPhaseOffset;
      const outerSegmentLength = outerStart.distanceTo(outerEnd);
      const segment = new THREE.Mesh(
        segmentGeometry(start, end, outerStart, outerEnd, wallHeight, openingCuts),
        [
          directRoomWallFaceMaterial(walls, 'room_plan_interior', segmentLength, wallHeight, interiorPhase, innerPerimeter),
          directRoomWallFaceMaterial(walls, 'room_plan_exterior', outerSegmentLength, wallHeight, exteriorPhase, outerPerimeter),
          wallMaterial(walls, 'room_plan_interior', planWallDepth, wallHeight, true),
        ],
      );
      segment.name = portalHalfPlan
        ? `Portal half-${planShape} curved wall segment ${index + 1}`
        : `Room ${planShape} wall segment ${index + 1}`;
      segment.userData.wallSide = side;
      segment.userData.isRoomWallBody = true;
      segment.userData.roomWallDepth = planWallDepth;
      segment.userData.roomPlanShape = planShape;
      segment.userData.roomPlanSegmentIndex = index;
      segment.userData.roomPlanSideCount = sideCount;
      segment.userData.portalPlanShape = portalHalfPlan ? planShape : null;
      segment.userData.portalHalfPlan = portalHalfPlan;
      segment.userData.roomPlanInnerStart = [start.x, start.y];
      segment.userData.roomPlanInnerEnd = [end.x, end.y];
      segment.userData.roomPlanOuterStart = [outerStart.x, outerStart.y];
      segment.userData.roomPlanOuterEnd = [outerEnd.x, outerEnd.y];
      segment.userData.roomPlanInteriorBondPhase = interiorPhase;
      segment.userData.roomPlanExteriorBondPhase = exteriorPhase;
      segment.userData.roomPlanInteriorBondCycle = innerPerimeter;
      segment.userData.roomPlanExteriorBondCycle = outerPerimeter;
      segment.userData.roomPlanInteriorSurface = 'room_plan_interior';
      segment.userData.roomPlanExteriorSurface = 'room_plan_exterior';
      segment.userData.roomPlanSurfacePolicy = 'one-continuous-interior-face-and-one-continuous-exterior-face';
      segment.userData.roomWallInteriorMaterialIndex = 0;
      segment.userData.roomWallExteriorMaterialIndex = 1;
      segment.userData.roomWallReturnMaterialIndex = 2;
      segment.userData.roomWallHasSeamlessInteriorBond = true;
      segment.userData.roomWallHasSeamlessExteriorBond = true;
      segment.userData.roomPlanOpeningIds = [...new Set(openingCuts.map((opening) => opening.id))];
      segment.userData.roomWallConstructionMethod = karbandiPlanVertices
        ? portalHalfPlan
          ? 'continuous-mitered-half-vestibule-following-visible-karbandi-rib-feet'
          : 'continuous-mitered-irregular-octagon-following-eight-visible-karbandi-rib-feet'
        : 'continuous-mitered-regular-plan-inscribed-in-room-bounds';
      planGroup.add(segment);
      meshes.push(segment);
    });
    group.add(planGroup);
    group.userData.roomPlanVertices = vertices.map((point) => [point.x, point.y]);
    group.userData.roomPlanOuterVertices = outerVertices.map((point) => [point.x, point.y]);
    group.userData.roomPlanInteriorPerimeter = innerPerimeter;
    group.userData.roomPlanExteriorPerimeter = outerPerimeter;
    group.userData.roomPlanInteriorSegmentLengths = innerSegmentLengths;
    group.userData.roomPlanExteriorSegmentLengths = outerSegmentLengths;
    group.userData.roomPlanInteriorSegmentStarts = innerSegmentStarts.slice(0, -1);
    group.userData.roomPlanExteriorSegmentStarts = outerSegmentStarts.slice(0, -1);
    group.userData.roomPlanExteriorSegmentLength = outerSegmentLengths[0];
    group.userData.roomPlanFootprintSource = planGroup.userData.roomPlanFootprintSource;
    group.userData.roomPlanAngleOffset = angleOffset;
    group.userData.roomPlanShape = planShape;
    group.userData.roomPlanSideCount = sideCount;
    if (portalHalfPlan) {
      group.userData.portalPlanShape = planShape;
      group.userData.portalHalfPlan = true;
      group.userData.portalHalfPlanFullSideCount = sideCount;
      group.userData.portalHalfPlanCutLineZ = planCenterZ;
      group.userData.portalHalfPlanRadius = radius;
      group.userData.portalHalfPlanVisibleVertices = visiblePlanSegments.length
        ? [
          ...visiblePlanSegments.map((entry) => [entry.start.x, entry.start.y]),
          [visiblePlanSegments.at(-1).end.x, visiblePlanSegments.at(-1).end.y],
        ]
        : [];
      group.userData.portalHalfPlanVisibleSegmentLengths = visiblePlanSegments.map((entry) => (
        entry.start.distanceTo(entry.end)
      ));
      group.userData.portalHalfVestibuleFootprint = Boolean(portalVestibulePlanVertices);
    }
  };

  if (roomMode && (building.roomPlanShape || 'square') === 'square') WALL_SIDES.forEach(addRoomSouthStyleWall);
  if (roomMode && (building.roomPlanShape || 'square') !== 'square') addRegularPlanRoomWalls();
  if (portalRegularPlan) addRegularPlanRoomWalls();

  if (roomMode && building.roomExteriorColumnsEnabled === true) {
    const planShape = building.roomPlanShape || 'square';
    const columnProfile = building.roomExteriorColumnProfile === 'square' ? 'square' : 'circle';
    const columnRadius = THREE.MathUtils.clamp(Number(building.roomExteriorColumnRadius) || 0.2, 0.05, 2);
    const squareRotationDegrees = THREE.MathUtils.clamp(
      Number(building.roomExteriorSquareColumnRotation) || 0,
      -360,
      360,
    );
    const squareRotation = THREE.MathUtils.degToRad(squareRotationDegrees);
    const columnHeight = Math.max(...WALL_SIDES.map((side) => height(side)));
    const openingRegions = [];
    const addOpeningRegion = (opening, wallCenter, tangent, wallDepth, wallHeight) => {
      if (!opening?.enabled && opening?.enabled != null) return;
      const bottom = opening.type === 'window' || opening.sillHeight != null
        ? Math.max(0, Number(opening.sillHeight) || 0)
        : 0;
      const springTop = Math.min(wallHeight, bottom + Math.max(0.3, Number(opening.height) || 0.3));
      if (springTop <= bottom + 0.000001) return;
      const archPoints = opening.head === 'arch'
        ? archCurve(
          0,
          Math.max(0.15, Number(opening.width) / 2 || 0.5),
          springTop,
          springTop,
          opening.arch?.greenOffset,
          opening.arch?.greenHeight,
          36,
          { redOffset: opening.arch?.redOffset },
        )
        : [];
      openingRegions.push({
        id: opening.id || opening.type || 'opening',
        center: new THREE.Vector2(wallCenter[0], wallCenter[1]),
        tangent: new THREE.Vector2(tangent[0], tangent[1]).normalize(),
        halfWidth: Math.max(0.15, Number(opening.width) / 2 || 0.5),
        wallDepth,
        bottom,
        top: Math.min(columnHeight, archPoints.length
          ? Math.max(...archPoints.map((point) => point.y))
          : springTop),
      });
    };
    if (planShape === 'square') {
      const squareOpeningFrames = {
        south: { center: [centerX, southZ], tangent: [1, 0] },
        north: { center: [centerX, northZ], tangent: [-1, 0] },
        east: { center: [eastX, centerZ], tangent: [0, -1] },
        west: { center: [westX, centerZ], tangent: [0, 1] },
      };
      WALL_SIDES.forEach((side) => {
        const frame = squareOpeningFrames[side];
        const tangent = new THREE.Vector2(...frame.tangent);
        Object.entries(walls.roomWallOpenings?.[side] || {}).forEach(([type, opening]) => {
          if (!opening?.enabled) return;
          const position = Number(opening.position) || 0;
          addOpeningRegion(
            { ...opening, id: `${side}-${type}`, type },
            [frame.center[0] + tangent.x * position, frame.center[1] + tangent.y * position],
            frame.tangent,
            wallThicknessFor(side),
            height(side),
          );
        });
      });
    } else {
      const innerVertices = (group.userData.roomPlanVertices || []).map(([x, z]) => new THREE.Vector2(x, z));
      const sideCount = innerVertices.length;
      const segmentLengths = sideCount > 1
        ? innerVertices.map((point, index) => point.distanceTo(innerVertices[(index + 1) % sideCount]))
        : [];
      const segmentStarts = segmentLengths.reduce((starts, length) => [...starts, starts.at(-1) + length], [0]);
      const innerPerimeter = segmentStarts.at(-1) || 0;
      const northSegmentIndex = innerVertices.reduce((northIndex, point, candidateIndex) => {
        const midpoint = point.clone().add(innerVertices[(candidateIndex + 1) % sideCount]).multiplyScalar(0.5);
        const northPoint = innerVertices[northIndex].clone().add(innerVertices[(northIndex + 1) % sideCount]).multiplyScalar(0.5);
        return midpoint.y < northPoint.y ? candidateIndex : northIndex;
      }, 0);
      const northPhase = (segmentStarts[northSegmentIndex] || 0) + (segmentLengths[northSegmentIndex] || 0) / 2;
      (walls.roomPlanOpenings || []).forEach((opening) => {
        if (!sideCount || !innerPerimeter) return;
        const centerPhase = ((northPhase + opening.rotation / 360 * innerPerimeter) % innerPerimeter + innerPerimeter) % innerPerimeter;
        const foundSegmentIndex = segmentLengths.findIndex((length, index) => (
          centerPhase < segmentStarts[index] + length - 0.000001
        ));
        const segmentIndex = foundSegmentIndex < 0 ? sideCount - 1 : foundSegmentIndex;
        const segmentStart = innerVertices[segmentIndex];
        const segmentEnd = innerVertices[(segmentIndex + 1) % sideCount];
        const tangent = segmentEnd.clone().sub(segmentStart).normalize();
        const localDistance = centerPhase - segmentStarts[segmentIndex];
        const openingCenter = segmentStart.clone().addScaledVector(tangent, localDistance);
        const radial = openingCenter.clone().sub(new THREE.Vector2(centerX, centerZ)).normalize();
        const side = Math.abs(radial.x) > Math.abs(radial.y)
          ? radial.x > 0 ? 'east' : 'west'
          : radial.y > 0 ? 'south' : 'north';
        addOpeningRegion(
          { ...opening, enabled: true },
          [openingCenter.x, openingCenter.y],
          [tangent.x, tangent.y],
          thickness,
          height(side),
        );
      });
    }
    let placements;
    if (planShape === 'square') {
      placements = [
        { center: [westExteriorX, northExteriorZ], phase: outerWidth * 2 + outerDepth },
        { center: [eastExteriorX, northExteriorZ], phase: outerWidth + outerDepth },
        { center: [eastExteriorX, southExteriorZ], phase: outerWidth },
        { center: [westExteriorX, southExteriorZ], phase: 0 },
      ];
    } else if (planShape === 'circle') {
      const count = Math.round(THREE.MathUtils.clamp(Number(building.roomExteriorCircleColumnCount) || 8, 3, 64));
      const wallSideCount = 64;
      const innerVertexRadius = Math.max(1, Math.min(width, depth) / 2);
      const exteriorFaceRadius = innerVertexRadius * Math.cos(Math.PI / wallSideCount) + thickness;
      const exteriorCycle = group.userData.roomPlanExteriorPerimeter;
      const angleOffset = group.userData.roomPlanAngleOffset;
      placements = Array.from({ length: count }, (_, index) => {
        const angle = Math.PI / 2 + index * Math.PI * 2 / count;
        const cycleAngle = ((angle - angleOffset) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
        return {
          center: [
            centerX + Math.cos(angle) * exteriorFaceRadius,
            centerZ + Math.sin(angle) * exteriorFaceRadius,
          ],
          phase: cycleAngle / (Math.PI * 2) * exteriorCycle,
        };
      });
    } else {
      placements = (group.userData.roomPlanOuterVertices || []).map(([x, z], index) => ({
        center: [x, z],
        phase: group.userData.roomPlanExteriorSegmentStarts?.[index]
          ?? index * group.userData.roomPlanExteriorSegmentLength,
      }));
    }
    const exteriorCycle = planShape === 'square'
      ? exteriorPerimeter
      : group.userData.roomPlanExteriorPerimeter;
    const columnGroup = new THREE.Group();
    columnGroup.name = 'Room exterior edge columns';
    columnGroup.userData.isRoomExteriorColumnAssembly = true;
    columnGroup.userData.roomPlanShape = planShape;
    columnGroup.userData.roomExteriorColumnCount = placements.length;
    columnGroup.userData.roomExteriorColumnProfile = columnProfile;
    columnGroup.userData.roomExteriorColumnRadius = columnRadius;
    columnGroup.userData.roomExteriorSquareColumnRotation = squareRotationDegrees;
    columnGroup.userData.roomExteriorSquareColumnRotationReference = 'north-column-relative-to-local-exterior-tangent';
    columnGroup.userData.roomExteriorColumnCenterAlignment = 'center-on-room-exterior-edge';
    columnGroup.userData.roomExteriorBondCycle = exteriorCycle;
    columnGroup.userData.roomExteriorBondContinuity = 'shared-with-developed-exterior-wall-perimeter';
    columnGroup.userData.roomExteriorColumnOpeningPolicy = 'doors-and-windows-cut-through-overlapping-columns';
    const columnPerimeter = columnProfile === 'square'
      ? columnRadius * 8
      : Math.PI * 2 * columnRadius;
    placements.forEach(({ center: [x, z], phase }, index) => {
      const columnCenter = new THREE.Vector2(x, z);
      const polarAngle = Math.atan2(z - centerZ, x - centerX);
      const columnRotation = squareRotation + Math.PI / 2 - polarAngle;
      const cuts = openingRegions.flatMap((region) => {
        const offset = columnCenter.clone().sub(region.center);
        const along = Math.abs(offset.dot(region.tangent));
        const normal = Math.abs(offset.x * region.tangent.y - offset.y * region.tangent.x);
        const normalAxis = new THREE.Vector2(-region.tangent.y, region.tangent.x);
        const profileExtent = (axis) => {
          if (columnProfile !== 'square') return columnRadius;
          const localX = new THREE.Vector2(Math.cos(columnRotation), -Math.sin(columnRotation));
          const localZ = new THREE.Vector2(Math.sin(columnRotation), Math.cos(columnRotation));
          return columnRadius * (Math.abs(axis.dot(localX)) + Math.abs(axis.dot(localZ)));
        };
        if (along > region.halfWidth + profileExtent(region.tangent) + 0.000001
          || normal > region.wallDepth + profileExtent(normalAxis) + 0.000001) return [];
        return [{ bottom: region.bottom, top: region.top, id: region.id }];
      }).sort((a, b) => a.bottom - b.bottom);
      const mergedCuts = [];
      cuts.forEach((cut) => {
        const previous = mergedCuts[mergedCuts.length - 1];
        if (previous && cut.bottom <= previous.top + 0.000001) {
          previous.top = Math.max(previous.top, cut.top);
          previous.ids.push(cut.id);
        } else {
          mergedCuts.push({ bottom: cut.bottom, top: cut.top, ids: [cut.id] });
        }
      });
      const visibleSegments = [];
      let segmentBottom = 0;
      mergedCuts.forEach((cut) => {
        const cutBottom = THREE.MathUtils.clamp(cut.bottom, 0, columnHeight);
        const cutTop = THREE.MathUtils.clamp(cut.top, 0, columnHeight);
        if (cutBottom > segmentBottom + 0.000001) visibleSegments.push([segmentBottom, cutBottom]);
        segmentBottom = Math.max(segmentBottom, cutTop);
      });
      if (segmentBottom < columnHeight - 0.000001) visibleSegments.push([segmentBottom, columnHeight]);
      visibleSegments.forEach(([baseY, topY], pieceIndex) => {
        const segmentHeight = topY - baseY;
        const columnGeometry = columnProfile === 'square'
          ? new THREE.BoxGeometry(columnRadius * 2, segmentHeight, columnRadius * 2)
          : new THREE.CylinderGeometry(columnRadius, columnRadius, segmentHeight, 32, 1, false);
        const columnUvs = columnGeometry.getAttribute('uv');
        const columnPositions = columnGeometry.getAttribute('position');
        const columnNormals = columnGeometry.getAttribute('normal');
        for (let uvIndex = 0; uvIndex < columnUvs.count; uvIndex += 1) {
          let developedU = columnUvs.getX(uvIndex) * columnPerimeter;
          if (columnProfile === 'square') {
            const localX = columnPositions.getX(uvIndex);
            const localZ = columnPositions.getZ(uvIndex);
            const normalX = columnNormals.getX(uvIndex);
            const normalZ = columnNormals.getZ(uvIndex);
            if (normalZ > 0.5) developedU = localX + columnRadius;
            else if (normalX > 0.5) developedU = columnRadius * 3 - localZ;
            else if (normalZ < -0.5) developedU = columnRadius * 5 - localX;
            else if (normalX < -0.5) developedU = columnRadius * 7 + localZ;
            else developedU = localX + columnRadius;
          }
          columnUvs.setXY(
            uvIndex,
            developedU,
            baseY + columnUvs.getY(uvIndex) * segmentHeight,
          );
        }
        columnUvs.needsUpdate = true;
        columnGeometry.userData.roomExteriorColumnBondUvMapping = columnProfile === 'square'
          ? 'developed-square-perimeter-world-height-metres'
          : 'developed-cylinder-world-height-metres';
        const columnMaterial = directRoomWallFaceMaterial(
          walls,
          'room_plan_exterior',
          columnPerimeter,
          columnHeight,
          phase,
          exteriorCycle,
        );
        const column = new THREE.Mesh(columnGeometry, columnMaterial);
        column.name = pieceIndex === 0
          ? `Room exterior edge column ${index + 1}`
          : `Room exterior edge column ${index + 1} piece ${pieceIndex + 1}`;
        column.position.set(x, baseY + segmentHeight / 2, z);
        if (columnProfile === 'square') column.rotation.y = columnRotation;
        column.castShadow = true;
        column.receiveShadow = true;
        column.userData.isRoomExteriorColumn = true;
        column.userData.roomExteriorColumnIndex = index;
        column.userData.roomExteriorColumnPieceIndex = pieceIndex;
        column.userData.roomExteriorColumnProfile = columnProfile;
        column.userData.roomExteriorColumnRadius = columnRadius;
        column.userData.roomExteriorSquareColumnRotation = squareRotationDegrees;
        column.userData.roomExteriorSquareColumnEffectiveRotation = THREE.MathUtils.radToDeg(columnRotation);
        column.userData.roomExteriorSquareColumnRotationReference = 'north-column-relative-to-local-exterior-tangent';
        column.userData.roomExteriorColumnCenter = [x, z];
        column.userData.roomExteriorColumnCenterAlignment = 'center-on-room-exterior-edge';
        column.userData.roomExteriorBondPhase = phase;
        column.userData.roomExteriorBondCycle = exteriorCycle;
        column.userData.roomExteriorBondContinuity = 'shared-with-developed-exterior-wall-perimeter';
        column.userData.roomExteriorColumnSegmentBaseY = baseY;
        column.userData.roomExteriorColumnSegmentTopY = topY;
        column.userData.roomExteriorColumnCutByOpeningIds = [...new Set(mergedCuts.flatMap((cut) => cut.ids))];
        columnGroup.add(column);
        meshes.push(column);
      });
    });
    group.add(columnGroup);
  }

  if (!roomMode && !portalRegularPlan && !walls.openSides.includes('east')) {
    const wallHeight = verticalWallHeight('east');
    const mesh = box(
      thickness,
      wallHeight,
      sideWallDepth,
      sideWallMaterials(walls, 'east', thickness, wallHeight, sideWallDepth, bondPhase.east),
      [eastX + thickness / 2, wallHeight / 2, sideWallCenterZ],
      'east',
    );
    group.add(mesh);
    meshes.push(mesh);
    const faceShape = rectangleShape(eastDecorMin, eastDecorMax, wallHeight);
    addBrickFace(group, faceShape, 'east', eastDecorDepth, wallHeight, [eastX - 0.015, 0, sideWallCenterZ], [0, -Math.PI / 2, 0], walls, bondPhase.east);
    addInteriorGypsumFace(group, rectangleShape(-sideWallDepth / 2, sideWallDepth / 2, wallHeight), 'east', [eastX - 0.02, 0, sideWallCenterZ], [0, -Math.PI / 2, 0], walls, gypsumBaseTop, [], gypsumZoneCutouts(zones, 'east', walls));
  }
  if (!roomMode && !portalRegularPlan && !walls.openSides.includes('west')) {
    const wallHeight = verticalWallHeight('west');
    const mesh = box(
      thickness,
      wallHeight,
      sideWallDepth,
      sideWallMaterials(walls, 'west', thickness, wallHeight, sideWallDepth, bondPhase.west),
      [westX - thickness / 2, wallHeight / 2, sideWallCenterZ],
      'west',
    );
    group.add(mesh);
    meshes.push(mesh);
    const faceShape = rectangleShape(westDecorMin, westDecorMax, wallHeight);
    addBrickFace(group, faceShape, 'west', westDecorDepth, wallHeight, [westX + 0.015, 0, sideWallCenterZ], [0, Math.PI / 2, 0], walls, bondPhase.west);
    addInteriorGypsumFace(group, rectangleShape(-sideWallDepth / 2, sideWallDepth / 2, wallHeight), 'west', [westX + 0.02, 0, sideWallCenterZ], [0, Math.PI / 2, 0], walls, gypsumBaseTop, [], gypsumZoneCutouts(zones, 'west', walls));
  }

  const sideTop = roomMode
    ? Math.max(...WALL_SIDES.map((side) => height(side)))
    : Math.max(height('east'), height('west'));
  const archHalfSpan = Math.max(0.5, Math.min(width / 2, Number(building.openingWidth) / 2 || width * 0.32));
  const greenOffset = walls.pointedArch.greenOffset ?? archHalfSpan;
  const greenHeight = walls.pointedArch.greenHeight ?? Math.max(0, sideTop - archHalfSpan * 0.6);
  const archCircleOptions = {
    redOffset: walls.pointedArch.redOffset,
    redRadius: walls.pointedArch.redRadius,
  };
  const archPoints = archCurve(
    centerX,
    archHalfSpan,
    sideTop,
    sideTop,
    greenOffset,
    greenHeight,
    36,
    archCircleOptions,
  );
  const archApex = archPoints.length
    ? Math.max(...archPoints.map((point) => point.y))
    : Math.max(sideTop + 0.2, Number(building.openingHeight) || sideTop + archHalfSpan);
  const ahangEnabled = !roomMode && walls.ahang.enabled && pointedArchActive;
  const archBand = thickness;
  const outerArchPoints = ahangEnabled
    ? archCurve(
      centerX,
      archHalfSpan + archBand,
      sideTop,
      sideTop,
      greenOffset,
      greenHeight,
      36,
      {
        ...archCircleOptions,
        redRadius: archCircleOptions.redRadius == null ? null : archCircleOptions.redRadius + archBand,
      },
    )
    : [];
  const outerArchApex = outerArchPoints.length
    ? Math.max(...outerArchPoints.map((point) => point.y))
    : archApex;
  const southBaseHeight = verticalWallHeight('south');
  const southWallHeight = ahangEnabled ? Math.max(southBaseHeight, archApex, outerArchApex) : southBaseHeight;
  const southHoles = [];
  const openingRects = {};
  const southBaseOpeningRects = {};
  if (walls.southOpenings.door.enabled) {
    openingRects.door = southOpeningProfile(walls.southOpenings.door, centerX, width, southWallHeight, 0);
    southBaseOpeningRects.door = southOpeningProfile(walls.southOpenings.door, centerX, width, southBaseHeight, 0);
  }
  if (walls.southOpenings.window.enabled) {
    const sill = Math.max(0, walls.southOpenings.window.sillHeight);
    openingRects.window = southOpeningProfile(walls.southOpenings.window, centerX, width, southWallHeight, sill);
    if (sill < southBaseHeight - 0.0001) {
      southBaseOpeningRects.window = southOpeningProfile(walls.southOpenings.window, centerX, width, southBaseHeight, sill);
      southHoles.push(openingHole(southBaseOpeningRects.window));
    }
  }
  const southShape = rectangleShapeWithDoorNotch(westX - thickness, eastX + thickness, southBaseHeight, southBaseOpeningRects.door, southHoles);
  const southSoldierCutouts = openingSoldierCutouts(southBaseOpeningRects, walls, gypsumBaseTop);
  const southZoneCutouts = gypsumZoneCutouts(zones, 'south', walls);
  if (!roomMode && !portalRegularPlan && !walls.openSides.includes('south')) {
    const mesh = extrudedShape(southShape, thickness, southZ, wallMaterial(walls, 'south', width + thickness * 2, southBaseHeight, true, bondPhase.south), 'south');
    group.add(mesh);
    meshes.push(mesh);
    const southDecorShape = rectangleShapeWithDoorNotch(westX, eastX, southBaseHeight, southBaseOpeningRects.door, southHoles);
    addBrickFace(group, southDecorShape, 'south', width, southBaseHeight, [0, 0, southZ - 0.015], [0, 0, 0], walls, bondPhase.south);
    addInteriorGypsumFace(group, southDecorShape, 'south', [0, 0, southZ - 0.02], [0, 0, 0], walls, gypsumBaseTop, southSoldierCutouts, southZoneCutouts);
    if (ahangEnabled && outerArchPoints.length) {
      // The end wall rises to the vault's outer profile. The vault stops at
      // the wall's inner face, so both solids share a closed butt joint while
      // the full arch band remains filled through the south wall thickness.
      const capShape = archCapShape(
        westX - thickness,
        eastX + thickness,
        southBaseHeight,
        outerArchPoints,
        [],
        Object.values(openingRects),
      );
      if (capShape) {
        const capMesh = extrudedShape(capShape, thickness, southZ, wallMaterial(walls, 'south', width + thickness * 2, southWallHeight, true, bondPhase.south), 'south_arch');
        capMesh.userData.isSouthArchCap = true;
        capMesh.userData.archInterfaceProfile = 'outer';
        group.add(capMesh);
        meshes.push(capMesh);
      }
      const capDecorShape = archCapShape(
        westX,
        eastX,
        southBaseHeight,
        outerArchPoints,
        [],
        Object.values(openingRects),
      );
      if (capDecorShape) {
        addBrickFace(group, capDecorShape, 'arch', width, southWallHeight, [0, 0, southZ - 0.015], [0, 0, 0], walls, bondPhase.south, 'south_arch');
        addInteriorGypsumFace(group, capDecorShape, 'south_arch', [0, 0, southZ - 0.02], [0, 0, 0], walls, 0, southSoldierCutouts, southZoneCutouts);
      }
    }
    const soldierHeight = Math.max(walls.bricks.brickHeight, walls.bricks.brickWidth);
    const southTrimZ = southZ - 0.008;
    if (openingRects.door) {
      if (openingRects.door.archPoints?.length) {
        addRaisedOpeningArchCourse(group, 'door', openingRects.door, walls.southOpenings.door, soldierHeight, southTrimZ, walls);
      } else {
        addRaisedOpeningSoldierCourse(
          group,
          'door',
          openingRects.door.center,
          openingRects.door.top + soldierHeight / 2,
          openingRects.door.width,
          soldierHeight,
          southTrimZ,
          walls,
        );
      }
      const doorJambBottom = walls.stoneBase.enabled ? Math.max(0, walls.stoneBase.height) : 0;
      addRaisedOpeningJambCourses(group, 'door', openingRects.door, doorJambBottom, soldierHeight, southTrimZ, walls);
    }
    if (openingRects.window) {
      if (openingRects.window.archPoints?.length) {
        addRaisedOpeningArchCourse(group, 'window', openingRects.window, walls.southOpenings.window, soldierHeight, southTrimZ, walls);
      } else {
        addRaisedOpeningSoldierCourse(group, 'window', openingRects.window.center, openingRects.window.top + soldierHeight / 2, openingRects.window.width, soldierHeight, southTrimZ, walls);
      }
      addRaisedOpeningSoldierCourse(group, 'window', openingRects.window.center, openingRects.window.bottom - soldierHeight / 2, openingRects.window.width, soldierHeight, southTrimZ, walls, 'sill');
      addRaisedOpeningJambCourses(group, 'window', openingRects.window, openingRects.window.bottom, soldierHeight, southTrimZ, walls);
    }
  }

  const baseNorthHeight = Math.max(
    height('north'),
    walls.northWall.minHeight || 0,
    pointedArchActive ? archApex + walls.northWall.archTopExtension : 0,
  );
  const northLeft = westX - thickness - (roomMode ? 0 : walls.northWall.outwardWidth);
  const northRight = eastX + thickness + (roomMode ? 0 : walls.northWall.outwardWidth);
  const northWallSectionSide = roomMode ? 'north' : 'north_sides';
  const northOpeningLeft = centerX - archHalfSpan;
  const northOpeningRight = centerX + archHalfSpan;
  let northHeight = baseNorthHeight;
  let northArchPoints = archPoints;
  if (!roomMode
    && walls.portalTransition === 'karbandi'
    && walls.karbandi.enabled === true
    && !walls.openSides.includes('north')) {
    const previewGroup = new THREE.Group();
    const previewMeshes = [];
    const previewWalls = {
      ...walls,
      bricks: { ...walls.bricks, enabled: false },
      karbandi: {
        ...walls.karbandi,
        coverEnabled: false,
        guideVisible: false,
        archIntersectionGuideVisible: false,
      },
    };
    let previewRibs = [];
    if (portalPlanShape === 'octagon') {
      previewRibs = addPortalHalfVestibuleKarbandi(previewGroup, previewMeshes, building, previewWalls, {
        centerX,
        width,
        depth,
        westX,
        westExteriorX,
        eastX,
        eastExteriorX,
        northZ,
        southZ,
        sideTop,
        thickness,
        wallHeights: Object.fromEntries(WALL_SIDES.map((side) => [side, height(side)])),
      });
    } else {
      previewRibs = addKarbandiVault(previewGroup, {
        westX,
        westExteriorX,
        eastX,
        eastExteriorX,
        northZ,
        northExteriorZ,
        southZ,
        southExteriorZ,
        sideTop,
        wallThickness: thickness,
        wallHeights: Object.fromEntries(WALL_SIDES.map((side) => [side, height(side)])),
        northArchPoints: pointedArchActive ? northArchPoints : [],
        northWallLeft: northLeft,
        northWallRight: northRight,
        northWallHeight: baseNorthHeight,
        northOpeningLeft,
        northOpeningRight,
      }, previewWalls);
    }
    previewGroup.updateMatrixWorld(true);
    const northWallRibClearance = Math.max(0.006, (Number(walls.bricks?.mortar) || 0.01) * 0.5);
    const wallShiftSolution = portalKarbandiNorthWallShift(
      previewRibs,
      northZ,
      archPoints,
      northWallRibClearance,
    );
    const northShiftY = wallShiftSolution.shiftY;
    northHeight = baseNorthHeight + northShiftY;
    northArchPoints = archPoints.map((point) => new THREE.Vector2(point.x, point.y + northShiftY));
    group.userData.portalKarbandiNorthWallBaseHeight = baseNorthHeight;
    group.userData.portalKarbandiNorthWallHeight = northHeight;
    group.userData.portalKarbandiNorthWallShiftY = northShiftY;
    group.userData.portalKarbandiNorthWallHeightRule = 'shift-complete-north-arch-to-lowest-rib-section-at-north-interior-face';
    group.userData.portalKarbandiNorthWallLowestVisibleRibIndex = wallShiftSolution.lowestVisibleRibIndex;
    group.userData.portalKarbandiNorthWallLowestVisibleRibRange = wallShiftSolution.lowestVisibleRange;
    group.userData.portalKarbandiNorthWallLowestVisiblePoint = wallShiftSolution.lowestVisiblePoint;
    group.userData.portalKarbandiNorthWallArchHeightBeforeShift = wallShiftSolution.archHeightBeforeShift;
    group.userData.portalKarbandiNorthWallArchHeightAfterShift = wallShiftSolution.archHeightAfterShift;
    group.userData.portalKarbandiNorthWallRibClearance = northWallRibClearance;
    group.userData.portalKarbandiNorthWallIntersectingRibCount = wallShiftSolution.intersectingRibCount;
    const previewGeometries = new Set();
    const previewMaterials = new Set();
    previewGroup.traverse((object) => {
      if (object.geometry) previewGeometries.add(object.geometry);
      (Array.isArray(object.material) ? object.material : [object.material])
        .filter(Boolean)
        .forEach((material) => previewMaterials.add(material));
    });
    previewGeometries.forEach((geometry) => geometry.dispose());
    previewMaterials.forEach((material) => material.dispose());
  }
  const northSections = roomMode
    ? [{
      shape: rectangleShape(northLeft, northRight, northHeight),
      section: northWallSectionSide,
      mirror: false,
    }]
    : pointedArchActive
      ? northPortalSections(northLeft, northRight, northHeight, northArchPoints, centerX)
      : northRectangularPortalShapes(northLeft, northRight, northHeight, northOpeningLeft, northOpeningRight)
        .map((shape, index) => ({ shape, section: 'north_sides', mirror: index === 1 }));
  if (!roomMode && !walls.openSides.includes('north')) {
    const recessDepth = walls.northBoundary.enabled ? Math.min(thickness - 0.02, walls.northBoundary.depth) : 0;
    const outerFaceZ = northExteriorZ;
    const recessedFaceZ = outerFaceZ + recessDepth;
    const northStoneBaseTop = walls.stoneBase.enabled
      ? Math.min(northHeight, Math.max(0, walls.stoneBase.height))
      : 0;
    northSections.forEach(({ shape: northShape, section: northSectionSide, mirror: mirrorNorthBond }) => {
      const northHasImportedBond = walls.bricks.sideBonds[northSectionSide]?.source === 'library';
      const northBaseWalls = recessDepth > 0.001 && northHasImportedBond
        ? wallsWithDefaultBond(walls, northSectionSide)
        : walls;
      const body = extrudedShape(
        northShape,
        Math.max(0.02, thickness - recessDepth),
        recessedFaceZ,
        wallMaterial(northBaseWalls, northSectionSide, northRight - northLeft, northHeight, true, bondPhase.north, false),
        northSectionSide,
        mirrorNorthBond ? centerX : null,
      );
      if (!roomMode && walls.portalTransition === 'karbandi') {
        body.userData.portalKarbandiAdjustedNorthHeight = northHeight;
        body.userData.portalKarbandiNorthWallShiftY = group.userData.portalKarbandiNorthWallShiftY;
        body.userData.portalKarbandiNorthWallHeightRule = group.userData.portalKarbandiNorthWallHeightRule;
      }
      group.add(body);
      meshes.push(body);
      if (!(recessDepth > 0.001 && northHasImportedBond)) {
        addBrickFace(
          group,
          northShape,
          northSectionSide,
          northRight - northLeft,
          northHeight,
          [0, 0, recessedFaceZ - 0.006],
          [0, 0, 0],
          walls,
          bondPhase.north,
          northSectionSide,
          mirrorNorthBond ? centerX : null,
        );
      }
    });

    if (recessDepth > 0.001) {
      const inset = Math.max(walls.northBoundary.inset, walls.bricks.brickWidth);
      const openingLeft = roomMode
        ? null
        : pointedArchActive && northArchPoints.length
          ? Math.min(northArchPoints[0].x, northArchPoints[northArchPoints.length - 1].x)
          : northOpeningLeft;
      const openingRight = roomMode
        ? null
        : pointedArchActive && northArchPoints.length
          ? Math.max(northArchPoints[0].x, northArchPoints[northArchPoints.length - 1].x)
          : northOpeningRight;
      if (northStoneBaseTop > 0.001) {
        [
          [northLeft, openingLeft],
          [openingRight, northRight],
        ].forEach(([left, right]) => {
          const baseShape = rectanglePanelShape(left, right, 0, northStoneBaseTop);
          if (!baseShape) return;
          const basePanel = extrudedShape(
            baseShape,
            recessDepth,
            outerFaceZ,
            wallMaterial(walls, northWallSectionSide, right - left, northStoneBaseTop, true, bondPhase.north),
            northWallSectionSide,
          );
          basePanel.userData.isNorthFlushStoneBase = true;
          basePanel.userData.stoneBaseOuterFaceZ = outerFaceZ;
          basePanel.userData.stoneBaseRecessFillDepth = recessDepth;
          group.add(basePanel);
          meshes.push(basePanel);
        });
      }
      const raisedBoundaryBottom = northStoneBaseTop;
      const raisedBoundaryCourseTop = Math.min(northHeight, raisedBoundaryBottom + inset);
      const northRaisedArchMapping = pointedArchActive && openingLeft != null && openingRight != null
        ? pointedArchBrickMapping(
          centerX,
          Math.max(0.01, Math.max(Math.abs(openingLeft - centerX), Math.abs(openingRight - centerX))),
          sideTop + (group.userData.portalKarbandiNorthWallShiftY || 0),
          sideTop + (group.userData.portalKarbandiNorthWallShiftY || 0),
          greenOffset,
          greenHeight + (group.userData.portalKarbandiNorthWallShiftY || 0),
          inset,
          northHeight - inset,
          raisedBoundaryCourseTop,
          Math.max(0.01, (northRight - northLeft) / 2),
          archCircleOptions,
        )
        : null;
      const northSideHasImportedBond = walls.bricks.sideBonds[northWallSectionSide]?.source === 'library';
      const northTopHasImportedBond = !roomMode && walls.bricks.sideBonds.north_top?.source === 'library';
      if (northSideHasImportedBond || northTopHasImportedBond) {
        const decorationSections = pointedArchActive
          ? northRecessedDecorationSections(northLeft, northRight, northHeight, inset, northArchPoints, centerX)
          : northRectangularRecessedDecorationSections(northLeft, northRight, northHeight, inset, openingLeft, openingRight);
        decorationSections.forEach(({ shape: decorationShape, section: rawDecorationSide, mirror: mirrorNorthBond }) => {
          const decorationSide = roomMode ? 'north' : rawDecorationSide;
          addBrickFace(
            group,
            decorationShape,
            decorationSide,
            northRight - northLeft,
            northHeight,
            [0, 0, recessedFaceZ - 0.006],
            [0, 0, 0],
            walls,
            bondPhase.north,
            decorationSide,
            mirrorNorthBond ? centerX : null,
          );
        });
      }
      addRaisedNorthPanel(group, meshes, northLeft, northRight, northHeight - inset, northHeight, outerFaceZ, recessDepth, walls, bondPhase.north, 'horizontal', northRaisedArchMapping);
      addRaisedNorthPanel(group, meshes, northLeft, northLeft + inset, raisedBoundaryBottom, northHeight, outerFaceZ, recessDepth, walls, bondPhase.north, 'vertical', northRaisedArchMapping);
      addRaisedNorthPanel(group, meshes, northRight - inset, northRight, raisedBoundaryBottom, northHeight, outerFaceZ, recessDepth, walls, bondPhase.north, 'vertical', northRaisedArchMapping);
      if (openingLeft != null && openingRight != null) {
        addRaisedNorthPanel(group, meshes, northLeft, openingLeft, raisedBoundaryBottom, raisedBoundaryCourseTop, outerFaceZ, recessDepth, walls, bondPhase.north, 'horizontal', northRaisedArchMapping);
        addRaisedNorthPanel(group, meshes, openingRight, northRight, raisedBoundaryBottom, raisedBoundaryCourseTop, outerFaceZ, recessDepth, walls, bondPhase.north, 'horizontal', northRaisedArchMapping);
      } else {
        addRaisedNorthPanel(group, meshes, northLeft, northRight, raisedBoundaryBottom, raisedBoundaryCourseTop, outerFaceZ, recessDepth, walls, bondPhase.north, 'horizontal', northRaisedArchMapping);
      }
      if (openingLeft != null && openingRight != null) {
        const springHeight = Math.max(0, Math.min(northArchPoints[0].y, northArchPoints[northArchPoints.length - 1].y));
        if (pointedArchActive) {
          addRaisedCurvedNorthBorderPanel(group, meshes, northArchPoints, centerX, inset, outerFaceZ, recessDepth, walls, bondPhase.north, northRaisedArchMapping);
          if (springHeight > raisedBoundaryBottom + 0.02) {
            addRaisedNorthPanel(group, meshes, openingLeft - inset, openingLeft, raisedBoundaryBottom, northHeight, outerFaceZ, recessDepth, walls, bondPhase.north, 'vertical', northRaisedArchMapping);
            addRaisedNorthPanel(group, meshes, openingRight, openingRight + inset, raisedBoundaryBottom, northHeight, outerFaceZ, recessDepth, walls, bondPhase.north, 'vertical', northRaisedArchMapping);
          }
        } else if (northHeight > raisedBoundaryBottom + 0.02) {
          addRaisedNorthPanel(group, meshes, openingLeft - inset, openingLeft, raisedBoundaryBottom, northHeight, outerFaceZ, recessDepth, walls, bondPhase.north, 'vertical', northRaisedArchMapping);
          addRaisedNorthPanel(group, meshes, openingRight, openingRight + inset, raisedBoundaryBottom, northHeight, outerFaceZ, recessDepth, walls, bondPhase.north, 'vertical', northRaisedArchMapping);
        }
      }
    }
  }

  if (ahangEnabled && !walls.openSides.includes('south')) {
    const shape = new THREE.Shape();
    shape.moveTo(outerArchPoints[0].x, outerArchPoints[0].y);
    outerArchPoints.slice(1).forEach((point) => shape.lineTo(point.x, point.y));
    [...archPoints].reverse().forEach((point) => shape.lineTo(point.x, point.y));
    shape.closePath();
    // The vault meets both end walls at their inside faces instead of
    // extending into either wall's structural volume.
    const archDepth = Math.max(0.1, southZ - northZ);
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: archDepth, steps: 1, bevelEnabled: false, curveSegments: 48 });
    geometry.translate(0, 0, northZ);
    geometry.computeVertexNormals();
    applyBentArchBrickUvs(geometry, archPoints, sideTop);
    const mesh = new THREE.Mesh(geometry, wallMaterial(walls, 'south', archHalfSpan * 2 + archBand * 2, outerArchApex, true, bondPhase.south));
    mesh.userData.wallSide = 'arch';
    mesh.userData.isPointedArch = true;
    mesh.userData.archBrickMapping = 'constant-height-bent-courses';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    meshes.push(mesh);
    addAhangSoffitGypsum(group, archPoints, northZ, southZ, walls);
  }

  let portalKarbandiGenerated = [];
  let portalKarbandiCrownY = null;
  let portalKarbandiCrownContactY = null;
  let portalKarbandiCrownRadius = null;
  let portalKarbandiCenterX = null;
  let portalKarbandiCenterZ = null;
  let portalKarbandiWallSupportedBoundary = null;
  let portalKarbandiWallSupportedBoundaries = [];
  let usesSharedPortalKarbandi = false;
  if (!roomMode) {
    if (portalPlanShape === 'octagon'
      && walls.portalTransition === 'karbandi'
      && walls.karbandi.enabled === true) {
      portalKarbandiGenerated = addPortalHalfVestibuleKarbandi(group, meshes, building, walls, {
        centerX,
        width,
        depth,
        westX,
        westExteriorX,
        eastX,
        eastExteriorX,
        northZ,
        southZ,
        sideTop,
        thickness,
        wallHeights: Object.fromEntries(WALL_SIDES.map((side) => [side, height(side)])),
      });
    } else {
      portalKarbandiGenerated = addKarbandiVault(group, {
        westX,
        westExteriorX,
        eastX,
        eastExteriorX,
        northZ,
        northExteriorZ,
        southZ,
        southExteriorZ,
        sideTop,
        wallThickness: thickness,
        wallHeights: Object.fromEntries(WALL_SIDES.map((side) => [side, height(side)])),
        northArchPoints: pointedArchActive ? northArchPoints : [],
        northWallLeft: northLeft,
        northWallRight: northRight,
        northWallHeight: northHeight,
        northOpeningLeft,
        northOpeningRight,
      }, walls);
      meshes.push(...portalKarbandiGenerated);
    }
  }

  if (!roomMode && walls.portalTransition === 'karbandi' && walls.karbandi.enabled === true) {
    const portalRibs = portalKarbandiGenerated.filter((mesh) => (
      mesh.userData?.isKarbandi === true && mesh.userData?.isKarbandiVisualGuide !== true
    ));
    usesSharedPortalKarbandi = portalRibs.length > 0;
    if (portalRibs.length) {
      group.updateMatrixWorld(true);
      portalKarbandiCrownContactY = Math.max(...portalRibs.map((rib) => (
        new THREE.Box3().setFromObject(rib, true).max.y
      )));
      portalKarbandiCrownY = portalKarbandiCrownContactY;
      const crownRadii = portalRibs
        .map((rib) => Number(rib.userData?.karbandiCrownCenterlineRadius))
        .filter((radius) => Number.isFinite(radius) && radius > 0.001);
      if (crownRadii.length) {
        // The Portal cover must enclose every retained crown rib in plan. The
        // largest crown orbit is the bearing boundary for unequal/half-octagon
        // layouts; averaging the orbits can leave an exposed outer rib.
        portalKarbandiCrownRadius = Math.max(...crownRadii);
      }
      const crownCenter = portalRibs
        .map((rib) => rib.userData?.karbandiCenter)
        .find((center) => Array.isArray(center) && center.length >= 2);
      if (crownCenter) {
        portalKarbandiCenterX = Number(crownCenter[0]);
        portalKarbandiCenterZ = Number(crownCenter[1]);
      }
      const visibleWallSupportedBoundaries = portalRibs.map((rib) => {
        const legs = rib.userData?.karbandiWallSupportedLegs || [];
        const direction = rib.userData?.karbandiDirection || [];
        const positions = rib.geometry?.getAttribute?.('position');
        if (!legs.length || direction.length < 2 || !positions) return null;
        const bounds = new THREE.Box3().setFromObject(rib, true);
        if (bounds.max.z < centerZ - 0.0001 || bounds.min.y > sideTop + 0.001) return null;
        const directionX = Number(direction[0]);
        const directionZ = Number(direction[1]);
        const directionLength = Math.hypot(directionX, directionZ);
        if (!Number.isFinite(directionLength) || directionLength < 0.000001) return null;
        const axisX = directionX / directionLength;
        const axisZ = directionZ / directionLength;
        const normalX = -axisZ;
        const normalZ = axisX;
        let minimumPlaneProjection = Infinity;
        let maximumPlaneProjection = -Infinity;
        let minimumAxisProjection = Infinity;
        let maximumAxisProjection = -Infinity;
        for (let vertexIndex = 0; vertexIndex < positions.count; vertexIndex += 1) {
          const point = new THREE.Vector3()
            .fromBufferAttribute(positions, vertexIndex)
            .applyMatrix4(rib.matrixWorld);
          const planeProjection = normalX * point.x + normalZ * point.z;
          const axisProjection = axisX * point.x + axisZ * point.z;
          minimumPlaneProjection = Math.min(minimumPlaneProjection, planeProjection);
          maximumPlaneProjection = Math.max(maximumPlaneProjection, planeProjection);
          minimumAxisProjection = Math.min(minimumAxisProjection, axisProjection);
          maximumAxisProjection = Math.max(maximumAxisProjection, axisProjection);
        }
        return {
          ribIndex: rib.userData.karbandiRibIndex,
          legs: [...legs],
          angle: Number(rib.userData.karbandiAngle) || 0,
          planeNormal: [normalX, normalZ],
          planeConstant: (minimumPlaneProjection + maximumPlaneProjection) / 2,
          wallSpan: maximumAxisProjection - minimumAxisProjection,
          visible: true,
          selectionRule: 'rendered-wall-top-component-with-at-least-one-supported-leg',
        };
      }).filter(Boolean).sort((left, right) => right.wallSpan - left.wallSpan);
      portalKarbandiWallSupportedBoundaries = visibleWallSupportedBoundaries;
      portalKarbandiWallSupportedBoundary = visibleWallSupportedBoundaries[0] || null;
      group.userData.portalKarbandiVisibleWallSupportedBoundaries = visibleWallSupportedBoundaries;
    }
    const portalRoofCovers = portalKarbandiGenerated.filter((mesh) => mesh.userData?.isKarbandiCover === true);
    if (portalRoofCovers.length) {
      group.updateMatrixWorld(true);
      const roofCoverTopY = Math.max(...portalRoofCovers.map((cover) => (
        new THREE.Box3().setFromObject(cover, true).max.y
      )));
      const crownEnvelopeClearance = Math.max(
        0.002,
        Math.min(0.006, (Number(walls.bricks?.mortar) || 0.01) * 0.3),
      );
      portalKarbandiCrownY = Math.max(
        portalKarbandiCrownY ?? -Infinity,
        roofCoverTopY + crownEnvelopeClearance,
      );
      group.userData.portalKarbandiRoofCoverTopY = roofCoverTopY;
      group.userData.portalKarbandiCrownEnvelopeClearance = crownEnvelopeClearance;
    }
    group.userData.portalKarbandiCrownEnvelopeY = portalKarbandiCrownY;
    group.userData.portalKarbandiCrownContactY = portalKarbandiCrownContactY;
    group.userData.portalKarbandiCrownRadius = portalKarbandiCrownRadius;
    group.userData.portalKarbandiCoverCenter = [portalKarbandiCenterX, portalKarbandiCenterZ];
  }

  if (!roomMode && (
    walls.portalTransition === 'squinch'
    || walls.portalCover === 'dome'
  )) {
    addPortalHalfSquinch(group, meshes, building, walls, {
      centerX,
      centerZ,
      northZ,
      southZ,
      width,
      depth,
      wallTop: sideTop,
      thickness,
      northArchCurveStartY: archPoints.length
        ? Math.min(archPoints[0].y, archPoints.at(-1).y)
        : sideTop,
      northArchPoints,
      northArchGreenCircle: pointedArchActive ? (() => {
        const construction = pointedArchConstruction(
          centerX,
          archHalfSpan,
          sideTop,
          greenOffset,
          greenHeight,
          archCircleOptions,
        );
        if (!construction) return null;
        const shiftY = group.userData.portalKarbandiNorthWallShiftY || 0;
        return {
          centerX: construction.greenCenter.x,
          centerY: construction.greenCenter.y + shiftY,
          radius: construction.greenRadius,
          apexY: construction.apexPoint.y + shiftY,
          tangentX: construction.tangentPoint.x,
          tangentY: construction.tangentPoint.y + shiftY,
        };
      })() : null,
      karbandiCrownY: portalKarbandiCrownY,
      karbandiCrownContactY: portalKarbandiCrownContactY,
      karbandiCrownRadius: portalKarbandiCrownRadius,
      northWallSupportedRibLowerY: group.userData.portalKarbandiNorthWallLowestVisibleRibRange?.[2] ?? null,
      wallSupportedRibLegTopY: sideTop,
      wallSupportedRibBoundary: portalKarbandiWallSupportedBoundary,
      wallSupportedRibBoundaries: portalKarbandiWallSupportedBoundaries,
      karbandiCenterX: portalKarbandiCenterX,
      karbandiCenterZ: portalKarbandiCenterZ,
      usesSharedKarbandi: usesSharedPortalKarbandi,
      wallHeights: Object.fromEntries(WALL_SIDES.map((side) => [side, height(side)])),
      wallThicknesses: Object.fromEntries(WALL_SIDES.map((side) => [side, thickness])),
    });
  }

  let roomKarbandiCrownY = null;
  let roomKarbandiCrownRadius = null;
  let usesSharedRoomKarbandi = false;
  const usesKarbandiRoomTransition = roomMode
    && building.domeTransition === 'karbandi'
    && ((building.roomPlanShape || 'square') === 'square' || building.buildingType === 'vestibule');
  if (usesKarbandiRoomTransition) {
    const roomKarbandiWalls = {
      ...walls,
      karbandi: {
        ...walls.karbandi,
        enabled: true,
        coverEnabled: building.domeTransitionCoverEnabled === true,
      },
    };
    const generated = addKarbandiVault(group, {
      westX,
      westExteriorX,
      eastX,
      eastExteriorX,
      northZ,
      northExteriorZ,
      southZ,
      southExteriorZ,
      sideTop,
      wallThickness: thickness,
      wallHeights: Object.fromEntries(WALL_SIDES.map((side) => [side, height(side)])),
      northArchPoints: [],
      northWallLeft: northLeft,
      northWallRight: northRight,
      northWallHeight: northHeight,
      northOpeningLeft: northLeft,
      northOpeningRight: northRight,
      rotationCenterX: centerX,
      rotationCenterZ: centerZ,
      roomMode: true,
      vestibuleMode: building.buildingType === 'vestibule',
    }, roomKarbandiWalls);
    const roomRibs = generated.filter((mesh) => mesh.userData?.isKarbandi === true && mesh.userData?.isKarbandiVisualGuide !== true);
    usesSharedRoomKarbandi = roomRibs.length > 0;
    roomRibs.forEach((rib) => {
      rib.userData.wallSide = 'room_dome_transition';
      rib.userData.roomDomePart = 'karbandi-transition-rib';
      rib.userData.roomDomeTransitionType = 'karbandi';
      rib.userData.karbandiRotationCenterMode = 'room-center';
      rib.geometry.computeBoundingBox();
      roomKarbandiCrownY = Math.max(roomKarbandiCrownY ?? -Infinity, rib.geometry.boundingBox?.max.y ?? -Infinity);
    });
    const roomRoofCovers = generated.filter((mesh) => mesh.userData?.isKarbandiCover === true);
    const crownEnvelopeClearance = roomRoofCovers.length
      ? Math.max(0.002, Math.min(0.006, (Number(walls.bricks?.mortar) || 0.01) * 0.3))
      : 0;
    if (roomRoofCovers.length) {
      group.updateMatrixWorld(true);
      const roofCoverTopY = Math.max(...roomRoofCovers.map((cover) => (
        new THREE.Box3().setFromObject(cover).max.y
      )));
      roomKarbandiCrownY = Math.max(roomKarbandiCrownY ?? -Infinity, roofCoverTopY + crownEnvelopeClearance);
      group.userData.roomKarbandiRoofCoverTopY = roofCoverTopY;
    }
    const crownRadii = roomRibs
      .map((rib) => Number(rib.userData?.karbandiCrownCenterlineRadius))
      .filter((radius) => Number.isFinite(radius) && radius > 0.001);
    if (crownRadii.length) {
      roomKarbandiCrownRadius = crownRadii.reduce((sum, radius) => sum + radius, 0) / crownRadii.length;
    }
    roomRoofCovers.forEach((cover) => {
      cover.userData.wallSide = 'room_dome_transition';
      cover.userData.roomDomePart = 'transition-cover';
      cover.userData.roomDomeTransitionType = 'karbandi';
    });
    group.userData.roomKarbandiRotationCenter = [centerX, centerZ];
    group.userData.roomKarbandiBearingPlan = building.buildingType === 'vestibule'
      ? 'vestibule-walls-follow-eight-visible-karbandi-rib-feet-on-square-reference-walls'
      : 'square-room-interior-wall-faces';
    group.userData.roomKarbandiUsesIwanGenerator = usesSharedRoomKarbandi;
    group.userData.roomKarbandiCrownRadius = roomKarbandiCrownRadius;
    group.userData.roomKarbandiCrownEnvelopeY = roomKarbandiCrownY;
    group.userData.roomKarbandiCrownEnvelopeClearance = crownEnvelopeClearance;
    meshes.push(...generated);
  }

  addRoomDomeCover(group, meshes, building, walls, {
    centerX,
    centerZ,
    width,
    depth,
    wallTop: Math.max(...WALL_SIDES.map((side) => height(side))),
    thickness,
    karbandiCrownY: roomKarbandiCrownY,
    karbandiCrownRadius: roomKarbandiCrownRadius,
    karbandiWallSupportFootOctagon: group.userData.roomKarbandiWallSupportFootOctagon,
    karbandiFirstJunctionOctagon: group.userData.roomKarbandiFirstJunctionOctagon,
    wallHeights: Object.fromEntries(WALL_SIDES.map((side) => [side, height(side)])),
    wallThicknesses: Object.fromEntries(WALL_SIDES.map((side) => [side, wallThicknessFor(side)])),
    usesSharedKarbandi: usesSharedRoomKarbandi,
  });

  group.userData.wallJunctionPolicy = 'butt-joints-no-volume-overlap';

  meshes.forEach((mesh) => addEdges(group, mesh, walls));
  setShadow(group, walls.shadows);
  material.dispose();
  return group;
}

export function wallArchHeightAtX(building, value, x) {
  const walls = normalizeWallSystem(value, building);
  if (!walls.enabled || !walls.pointedArch.enabled) return null;
  const halfWidth = Math.max(1, Number(building.width) / 2);
  const westX = -halfWidth - walls.sideOffsets.west;
  const eastX = halfWidth + walls.sideOffsets.east;
  const centerX = (westX + eastX) / 2;
  const sideTop = Math.max(
    Number(building.height) + walls.extraHeights.east,
    Number(building.height) + walls.extraHeights.west,
  );
  const halfSpan = Math.max(0.5, Math.min((eastX - westX) / 2, Number(building.openingWidth) / 2 || (eastX - westX) * 0.32));
  const greenOffset = walls.pointedArch.greenOffset ?? halfSpan;
  const greenHeight = walls.pointedArch.greenHeight ?? Math.max(0, sideTop - halfSpan * 0.6);
  const curve = archCurve(centerX, halfSpan, sideTop, sideTop, greenOffset, greenHeight, 36, {
    redOffset: walls.pointedArch.redOffset,
    redRadius: walls.pointedArch.redRadius,
  });
  if (!curve.length || x < curve[0].x || x > curve[curve.length - 1].x) return sideTop;
  for (let index = 0; index < curve.length - 1; index += 1) {
    const first = curve[index];
    const second = curve[index + 1];
    if (x < Math.min(first.x, second.x) || x > Math.max(first.x, second.x)) continue;
    const span = second.x - first.x;
    const t = Math.abs(span) < 0.00001 ? 0 : (x - first.x) / span;
    return THREE.MathUtils.lerp(first.y, second.y, t);
  }
  return sideTop;
}

export function disposeWallSystem(group) {
  group?.traverse((child) => {
    child.geometry?.dispose?.();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.filter(Boolean).forEach((material) => {
      material.userData?.generatedTexture?.dispose?.();
      material.map?.dispose?.();
      material.dispose?.();
    });
  });
}
