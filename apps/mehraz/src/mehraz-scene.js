import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { ArrayBufferTarget, Muxer } from 'mp4-muxer';
import { archCurve, buildWallSystem, configureStoneBaseMaterial, normalizeWallSystem, pointedArchConstruction, raisedBorderMaterial, southOpeningProfile, updateGypsumZoneCutouts, wallArchHeightAtX } from './wall-system.js';
import { fittedOrthographicHalfHeight } from './thumbnail-frame.js';

const moduleLoader = new GLTFLoader();
const moduleSourceCache = new Map();
const DEFAULT_NIGHT_LIGHT = Object.freeze({
  enabled: true,
  color: '#ffd7a0',
  intensity: 120,
  distance: 12,
  angle: 35,
  penumbra: 0.55,
  decay: 2,
  position: [0, 2.4, 1.5],
  target: [0, 1.1, 0],
});
const NIGHT_GROUND_COLOR = '#30343a';
const NIGHT_AMBIENT_INTENSITY = 0.1;
const NIGHT_HEMISPHERE_INTENSITY = 0.14;
const DAY_AMBIENT_INTENSITY = 0.42;
const DAY_HEMISPHERE_INTENSITY = 1.85;
const VIDEO_WIDTH = 1920;
const VIDEO_HEIGHT = 1080;
const VIDEO_FPS = 30;
const VIDEO_BITRATE = 20000000;
export const CONSTRUCTION_STEPS = Object.freeze([
  { id: 'empty', title: 'Site / empty stage', detail: 'Start with the ground and layout only.' },
  { id: 'room-skirt', title: 'Room skirt, floor fill, and steps', detail: 'Raise the stone skirt and raised-door interior fill together, placing each access step in sequence.' },
  { id: 'lower-walls', title: 'Lower vertical walls', detail: 'Raise the south, east, west, and north-side walls together to the arch spring line.' },
  { id: 'hall-vaults', title: 'Hall bearing vaults', detail: 'After the columns, build every X- and Y-axis vault in one bay before advancing to the next bay.' },
  { id: 'hall-transverse-vaults', title: 'Lower transverse vaults', detail: 'For a Barrel cover, construct the lowered vaults perpendicular to the selected Barrel axis.' },
  { id: 'hall-barrel-spandrels', title: 'Walls above lower vaults', detail: 'Raise the continuous masonry between each lower transverse vault extrados and the Barrel spring line.' },
  { id: 'hall-barrel-axis-vaults', title: 'Higher Barrel-axis vaults', detail: 'Construct the higher vaults running in the selected Barrel direction.' },
  { id: 'hall-barrel-surrounding-walls', title: 'Surrounding walls', detail: 'Raise the Hall or Grid perimeter walls after both vault families are complete.' },
  { id: 'hall-barrel-under-vault-walls', title: 'Walls beneath higher vaults', detail: 'Continue the surrounding masonry upward beneath the higher boundary vaults.' },
  { id: 'hall-walls', title: 'Hall vertical and under-vault walls', detail: 'After all vault bays are complete, raise the perimeter walls and masonry beneath the boundary vaults.' },
  { id: 'hall-transition', title: 'Hall cover transition', detail: 'Construct the transition walls and shell one complete bay at a time above the finished walls.' },
  { id: 'hall-cover', title: 'Hall covers', detail: 'Build the selected dome, directional Barrel, or rib-vault cover one complete bay at a time.' },
  { id: 'room-karbandi-ribs', title: 'Room Karbandi ribs', detail: 'Construct every Room Karbandi rib one by one without a Portal guide arch.' },
  { id: 'room-squinch-arches', title: 'Room Squinch arches', detail: 'Construct each Squinch arch individually from both springing feet to its crown.' },
  { id: 'room-squinch-under-arch-walls', title: 'Walls beneath Squinch arches', detail: 'After every arch is complete, raise the attached masonry beneath the arches in aligned brick courses.' },
  { id: 'room-transition-structure', title: 'Room transition walls', detail: 'Raise every transition and wall-continuation course before any transition or upper cover.' },
  { id: 'room-karbandi-roof', title: 'Room Karbandi roof', detail: 'Cover the completed Room rib network panel by panel after its adjacent walls.' },
  { id: 'room-transition-cover', title: 'Transition cover', detail: 'Cover the completed Room rib network up to the drum.' },
  { id: 'room-drum', title: 'Raise the drum', detail: 'Lay the drum brick by brick around each course, then advance upward.' },
  { id: 'room-extra-leg', title: 'Raise the extended dome leg', detail: 'Build the independent extended leg after the drum and before the upper cover.' },
  { id: 'room-outer-ring', title: 'Construct the outer ring', detail: 'Lay the complete dome springing ring in rotation before beginning the upper cover.' },
  { id: 'room-dome', title: 'Construct the upper cover', detail: 'Lay every dome course in rotation, completing one brick-height layer before the next.' },
  { id: 'room-decoration', title: 'Room brick and pattern decoration', detail: 'Apply the configured Room wall, transition, drum, and dome decoration after construction.' },
  { id: 'south-arch-guide', title: 'South arch guide rib', detail: 'Place a narrow guide segment above the south wall.' },
  { id: 'north-arch-guide', title: 'North arch guide rib', detail: 'Place the matching narrow guide segment above the north wall.' },
  { id: 'south-wall', title: 'South wall under arch', detail: 'Fill the vertical south end wall from the spring line up to the pointed arch beneath both guides.' },
  { id: 'arch-fill', title: 'Cover the guide arches', detail: 'Lay equal-height arch courses over the guide arches from the east and west spring points until they meet at the crown.' },
  { id: 'karbandi-reference-rib', title: 'Karbandi reference rib', detail: 'Draw the clipped reference rib after the north wall guide arch is complete.' },
  { id: 'karbandi-ribs', title: 'Karbandi rib network', detail: 'Construct the remaining visible clipped ribs one by one.' },
  { id: 'karbandi-roof', title: 'Karbandi roof cover', detail: 'Cover the completed rib network using the configured roof thickness.' },
  { id: 'north-upper-wall', title: 'North upper wall', detail: 'Complete the north side walls and north top wall together, layer by layer.' },
  { id: 'portal-transition', title: 'Portal dome transition', detail: 'Build the selected Portal Squinch or Muqarnas transition above the completed walls.' },
  { id: 'portal-drum', title: 'Raise the Portal drum', detail: 'Lay the Portal drum in rotating brick courses after all transition walls.' },
  { id: 'portal-extra-leg', title: 'Raise the Portal extended leg', detail: 'Build the independent extended leg above the drum.' },
  { id: 'portal-outer-ring', title: 'Construct the Portal outer ring', detail: 'Lay the dome springing ring in rotation before beginning the Portal cover.' },
  { id: 'portal-cover', title: 'Portal upper cover', detail: 'Lay the Portal dome upward in rotating brick courses after its drum and extended leg.' },
  { id: 'muqarnas-tiers', title: 'Muqarnas tiers', detail: 'Place Muqarnas modules tier by tier after the arch structure is complete.' },
  { id: 'decorate-south', title: 'South wall decoration', detail: 'Apply imported bonding or Girih pattern to the south wall after structure is built.' },
  { id: 'decorate-east', title: 'East wall decoration', detail: 'Apply imported bonding or Girih pattern to the east wall.' },
  { id: 'decorate-west', title: 'West wall decoration', detail: 'Apply imported bonding or Girih pattern to the west wall.' },
  { id: 'decorate-north-sides', title: 'North side wall decoration', detail: 'Apply imported bonding or Girih pattern to the left and right north side walls.' },
  { id: 'decorate-north-top', title: 'North top wall decoration', detail: 'Apply imported bonding or Girih pattern to the north wall section above the arch.' },
  { id: 'decorate-arch', title: 'Arch decoration', detail: 'Apply imported bonding or Girih pattern to the arch surface.' },
  { id: 'complete', title: 'Complete training model', detail: 'Show the finished wall, arch, Muqarnas, and library decorations.' },
]);

export function normalizeConstructionStepOrder(value = []) {
  const knownIds = CONSTRUCTION_STEPS.map((step) => step.id);
  const known = new Set(knownIds);
  const ordered = [];
  (Array.isArray(value) ? value : []).forEach((id) => {
    if (known.has(id) && id !== 'empty' && id !== 'complete' && !ordered.includes(id)) ordered.push(id);
  });
  const canonicalInterior = knownIds.filter((id) => id !== 'empty' && id !== 'complete');
  const newlyIntroducedPhases = new Set([
    'hall-transverse-vaults', 'hall-barrel-spandrels', 'hall-barrel-axis-vaults',
    'hall-barrel-surrounding-walls', 'hall-barrel-under-vault-walls', 'hall-walls',
    'room-skirt', 'room-squinch-arches', 'room-squinch-under-arch-walls',
    'room-extra-leg', 'room-outer-ring',
    'portal-drum', 'portal-extra-leg', 'portal-outer-ring',
  ]);
  const previousCanonicalInterior = canonicalInterior.filter((id) => !newlyIntroducedPhases.has(id));
  const previousTransitionIndex = previousCanonicalInterior.indexOf('room-transition-structure');
  const previousRoofIndex = previousCanonicalInterior.indexOf('room-karbandi-roof');
  if (previousTransitionIndex >= 0 && previousRoofIndex >= 0) {
    [previousCanonicalInterior[previousTransitionIndex], previousCanonicalInterior[previousRoofIndex]]
      = [previousCanonicalInterior[previousRoofIndex], previousCanonicalInterior[previousTransitionIndex]];
  }
  const isPreviousDefault = ordered.length === previousCanonicalInterior.length
    && ordered.every((id, index) => id === previousCanonicalInterior[index]);
  if (!ordered.length || isPreviousDefault) return ['empty', ...canonicalInterior, 'complete'];
  // Preserve a user's drag order, but insert newly introduced component
  // phases beside their canonical neighbors rather than appending them after
  // decoration. This safely migrates saved training sequences.
  canonicalInterior.forEach((id, canonicalIndex) => {
    if (ordered.includes(id)) return;
    const nextKnown = canonicalInterior.slice(canonicalIndex + 1).find((candidate) => ordered.includes(candidate));
    if (nextKnown) ordered.splice(ordered.indexOf(nextKnown), 0, id);
    else ordered.push(id);
  });
  return ['empty', ...ordered, 'complete'];
}

const ROOM_ONLY_CONSTRUCTION_STEP_IDS = new Set([
  'room-skirt',
  'room-karbandi-ribs',
  'room-squinch-arches',
  'room-squinch-under-arch-walls',
  'room-karbandi-roof',
  'room-transition-structure',
  'room-transition-cover',
  'room-drum',
  'room-extra-leg',
  'room-outer-ring',
  'room-dome',
  'room-decoration',
]);

const PORTAL_ONLY_CONSTRUCTION_STEP_IDS = new Set([
  'south-arch-guide', 'north-arch-guide', 'south-wall', 'arch-fill',
  'karbandi-reference-rib', 'karbandi-ribs', 'karbandi-roof', 'north-upper-wall',
  'portal-transition', 'portal-drum', 'portal-extra-leg', 'portal-outer-ring', 'portal-cover', 'muqarnas-tiers',
  'decorate-south', 'decorate-east', 'decorate-west', 'decorate-north-sides',
  'decorate-north-top', 'decorate-arch',
]);
const HALL_ONLY_CONSTRUCTION_STEP_IDS = new Set([
  'hall-vaults', 'hall-transverse-vaults', 'hall-barrel-spandrels',
  'hall-barrel-axis-vaults', 'hall-barrel-surrounding-walls',
  'hall-barrel-under-vault-walls', 'hall-walls',
  'hall-transition', 'hall-cover',
]);

export const ANIMATED_CONSTRUCTION_STEP_IDS = new Set([
  'south-wall', 'arch-fill', 'north-arch-guide', 'room-skirt', 'lower-walls',
  'hall-vaults', 'hall-transverse-vaults', 'hall-barrel-spandrels',
  'hall-barrel-axis-vaults', 'hall-barrel-surrounding-walls',
  'hall-barrel-under-vault-walls', 'hall-walls', 'hall-transition', 'hall-cover',
  'karbandi-reference-rib', 'karbandi-ribs', 'karbandi-roof',
  'room-karbandi-ribs', 'room-squinch-arches', 'room-squinch-under-arch-walls',
  'room-karbandi-roof', 'room-transition-structure',
  'room-transition-cover', 'room-drum', 'room-extra-leg', 'room-outer-ring', 'room-dome', 'room-decoration',
  'north-upper-wall', 'portal-transition', 'portal-drum', 'portal-extra-leg',
  'portal-outer-ring', 'portal-cover', 'muqarnas-tiers',
  'decorate-south', 'decorate-east', 'decorate-west', 'decorate-north-sides',
  'decorate-north-top', 'decorate-arch',
]);

export function constructionStepsForBuilding(buildingOrType = 'iwan', wallOptions = {}) {
  const legacyTypeOnly = typeof buildingOrType !== 'object' || !buildingOrType;
  const building = !legacyTypeOnly
    ? buildingOrType
    : buildingOrType === 'room'
      ? {
        type: 'room', buildingType: 'room', roomPlanShape: 'square', domeTransition: 'none',
        domeTransitionCoverEnabled: false, domeEnabled: false, domeDrumHeight: 0.5,
      }
      : { type: buildingOrType, buildingType: 'portal' };
  const buildingType = building.buildingType
    || (building.type === 'room' ? 'room' : 'portal');
  const isPortal = buildingType === 'portal' || building.type === 'iwan';
  const isHall = ['hall', 'grid'].includes(buildingType);
  const isRoomFamily = !isPortal;
  const roomShape = building.roomPlanShape || 'square';
  const transitionType = building.domeTransition || 'none';
  const roomTransitionAvailable = roomShape === 'square' || buildingType === 'vestibule';
  const portalTransition = wallOptions.portalTransition || wallOptions.karbandi?.enabled && 'karbandi';
  const portalCover = wallOptions.portalCover || wallOptions.ahang?.enabled && 'ahang'
    || legacyTypeOnly && isPortal && 'ahang';
  const hallCover = building.hallCoverType || 'none';
  const domeCoverType = building.domeCoverType || 'none';
  const outerRingEnabledFor = (coverType) => (
    building.domeOuterRingEnabledByCoverType?.[coverType] !== false
  );
  const domeExtraLegHeight = Number(
    building.domeOuterLegExtensionByTransitionAndCoverType?.[transitionType]?.[domeCoverType]
      ?? building.domeOuterLegExtensionByCoverType?.[domeCoverType]
      ?? 0,
  );
  const raisedRoomDoorExists = [
    ...Object.values(wallOptions.roomWallOpenings || {}).map((openings) => openings?.door),
    ...(wallOptions.roomPlanOpenings || []).filter((opening) => opening?.type === 'door'),
  ].some((door) => door?.enabled !== false && Number(door?.sillHeight) > 0.000001);
  const selected = new Set(['empty', 'lower-walls', 'complete']);

  if (isHall) {
    if (hallCover === 'barrel') {
      selected.add('hall-transverse-vaults');
      selected.add('hall-barrel-spandrels');
      selected.add('hall-barrel-axis-vaults');
      selected.add('hall-barrel-surrounding-walls');
      selected.add('hall-barrel-under-vault-walls');
    } else {
      selected.add('hall-vaults');
      selected.add('hall-walls');
    }
    const transitionEnabled = hallCover === 'raised-rib-vault'
      || (!['barrel', 'rib-vault', 'raised-rib-vault'].includes(hallCover)
        && building.hallTransitionEnabled !== false);
    if (transitionEnabled) selected.add('hall-transition');
    if (hallCover !== 'none') selected.add('hall-cover');
    selected.add('room-decoration');
  } else if (isRoomFamily) {
    if ((wallOptions.stoneBase?.enabled === true
      && Number(wallOptions.stoneBase?.height) > 0.000001) || raisedRoomDoorExists) selected.add('room-skirt');
    if (roomTransitionAvailable && transitionType === 'karbandi') {
      selected.add('room-karbandi-ribs');
      selected.add('room-transition-structure');
      selected.add('room-karbandi-roof');
    } else if (roomTransitionAvailable && transitionType === 'squinch') {
      selected.add('room-squinch-arches');
      selected.add('room-squinch-under-arch-walls');
    } else if (roomTransitionAvailable && ['pendentive', 'muqarnas'].includes(transitionType)) {
      selected.add('room-transition-structure');
    }
    if (roomTransitionAvailable && building.domeTransitionCoverEnabled === true) selected.add('room-transition-cover');
    const drumHeight = Number(building.domeDrumHeightByTransition?.[transitionType]
      ?? building.domeDrumHeight);
    if (building.domeEnabled !== false && drumHeight > 0.000001) selected.add('room-drum');
    if (building.domeEnabled !== false) {
      if (domeExtraLegHeight > 0.000001) selected.add('room-extra-leg');
      if (domeCoverType !== 'none' && outerRingEnabledFor(domeCoverType)) selected.add('room-outer-ring');
      selected.add('room-dome');
    }
    selected.add('room-decoration');
  } else {
    const usesKarbandi = portalTransition === 'karbandi' || wallOptions.karbandi?.enabled === true;
    const usesAhang = portalCover === 'ahang' || wallOptions.ahang?.enabled === true;
    if (legacyTypeOnly) {
      ['south-arch-guide', 'north-arch-guide', 'south-wall', 'arch-fill',
        'karbandi-reference-rib', 'karbandi-ribs', 'karbandi-roof', 'north-upper-wall']
        .forEach((id) => selected.add(id));
    } else if (usesKarbandi) {
      selected.add('north-arch-guide');
      selected.add('karbandi-reference-rib');
      selected.add('karbandi-ribs');
      selected.add('karbandi-roof');
      selected.add('north-upper-wall');
    } else if (usesAhang) {
      ['south-arch-guide', 'north-arch-guide', 'south-wall', 'arch-fill', 'north-upper-wall']
        .forEach((id) => selected.add(id));
    } else selected.add('north-upper-wall');
    if (portalTransition === 'squinch') selected.add('portal-transition');
    if (portalCover === 'dome') {
      const portalDrumHeight = Number(building.domeDrumHeightByTransition?.[portalTransition]
        ?? building.domeDrumHeight);
      const portalExtraLegHeight = Number(
        building.domeOuterLegExtensionByTransitionAndCoverType?.[portalTransition]?.dome
          ?? building.domeOuterLegExtensionByCoverType?.dome
          ?? 0,
      );
      if (portalDrumHeight > 0.000001) selected.add('portal-drum');
      if (portalExtraLegHeight > 0.000001) selected.add('portal-extra-leg');
      if (outerRingEnabledFor('dome')) selected.add('portal-outer-ring');
      selected.add('portal-cover');
    } else if (portalCover === 'raised-rib-vault') selected.add('portal-cover');
    if (portalTransition === 'muqarnas') selected.add('muqarnas-tiers');
    ['decorate-south', 'decorate-east', 'decorate-west',
      'decorate-north-sides', 'decorate-north-top', 'decorate-arch']
      .forEach((id) => selected.add(id));
  }

  return CONSTRUCTION_STEPS
    .map((step, index) => ({ ...step, index }))
    .filter((entry) => selected.has(entry.id))
    .map((entry) => {
      if (isPortal && entry.id === 'portal-cover' && portalCover === 'raised-rib-vault') return {
        ...entry,
        title: 'Construct the Raised rib vault',
        detail: 'After the north wall is complete, raise the Portal vault from its wall bearings to the crown in horizontal brick courses.',
      };
      if (!isRoomFamily) return entry;
      if (entry.id === 'lower-walls') return {
        ...entry,
        title: isHall ? 'Hall bearing columns' : 'Vertical walls and exterior columns',
        detail: isHall
          ? 'Raise every grid-bearing column before beginning the first bay of vault arches.'
          : 'Raise all walls, exterior columns, and attached opening soldier courses together at the same world-height brick course.',
      };
      if (entry.id === 'room-transition-cover' && transitionType === 'squinch') return {
        ...entry,
        title: 'Masonry above Squinch arches',
        detail: 'After the under-arch walls, raise the eight infill faces between the completed arches and the drum, course by course.',
      };
      if (entry.id === 'complete') return {
        ...entry,
        title: `Complete ${buildingType === 'vestibule' ? 'Vestibule' : isHall ? 'Hall' : 'Room'} model`,
        detail: `Show the finished ${buildingType === 'vestibule' ? 'Vestibule' : isHall ? 'Hall' : 'Room'} structure, cover, openings, and configured decoration.`,
      };
      return entry;
    });
}

const CONSTRUCTION_STEP_INDEX = Object.freeze(Object.fromEntries(CONSTRUCTION_STEPS.map((step, index) => [step.id, index])));
const WALL_DECORATION_STEP = Object.freeze({
  south: 'decorate-south',
  south_arch: 'decorate-arch',
  east: 'decorate-east',
  west: 'decorate-west',
  north: 'decorate-north-sides',
  north_sides: 'decorate-north-sides',
  north_top: 'decorate-north-top',
  arch: 'decorate-arch',
});
const SURFACE_DECORATION_STEP = Object.freeze({
  south_facade: 'decorate-south',
  south_interior: 'decorate-south',
  east_interior: 'decorate-east',
  west_interior: 'decorate-west',
  north_interior: 'decorate-north-sides',
});

function removeInvisibleExportBranches(root) {
  [...root.children].forEach((child) => {
    if (!child.visible || child.userData?.isKarbandiVisualGuide === true) {
      root.remove(child);
      return;
    }
    removeInvisibleExportBranches(child);
  });
}

function cloneForModelExport(source) {
  // Hydrated Muqarnas modules keep runtime Object3D back-references in
  // userData (for selection and placement updates). Object3D.clone() copies
  // userData through JSON, so those circular references must not enter the
  // export snapshot. Temporarily hide all runtime metadata and restore it
  // immediately after the synchronous clone.
  const originalUserData = [];
  source.traverse((child) => {
    originalUserData.push([child, child.userData]);
    child.userData = {};
  });
  try {
    const clone = source.clone(true);
    const clonedObjects = [];
    clone.traverse((child) => clonedObjects.push(child));
    originalUserData.forEach(([, userData], index) => {
      const child = clonedObjects[index];
      if (!child) return;
      // Retain only primitive classification needed while preparing geometry.
      // Runtime Object3D references stay out of the export graph.
      child.userData = {
        ...(userData?.isKarbandi === true ? { isKarbandi: true } : {}),
        ...(userData?.isKarbandiCover === true ? { isKarbandiCover: true } : {}),
        ...(userData?.isKarbandiVisualGuide === true ? { isKarbandiVisualGuide: true } : {}),
        ...(Number.isFinite(userData?.karbandiRibIndex) ? { karbandiRibIndex: userData.karbandiRibIndex } : {}),
      };
    });
    return clone;
  } finally {
    originalUserData.forEach(([child, userData]) => {
      child.userData = userData;
    });
  }
}

function clipPolygonToPlane(vertices, plane) {
  if (!vertices.length) return vertices;
  const clipped = [];
  for (let index = 0; index < vertices.length; index += 1) {
    const current = vertices[index];
    const next = vertices[(index + 1) % vertices.length];
    const currentDistance = plane.distanceToPoint(current.worldPosition);
    const nextDistance = plane.distanceToPoint(next.worldPosition);
    const currentInside = currentDistance >= -1e-7;
    const nextInside = nextDistance >= -1e-7;
    if (currentInside) clipped.push(current);
    if (currentInside === nextInside) continue;
    const denominator = currentDistance - nextDistance;
    const alpha = Math.abs(denominator) > 1e-12 ? currentDistance / denominator : 0;
    clipped.push({
      worldPosition: current.worldPosition.clone().lerp(next.worldPosition, alpha),
      uv: current.uv && next.uv ? current.uv.clone().lerp(next.uv, alpha) : null,
    });
  }
  return clipped;
}

function clippedGeometryForPlanes(mesh, planes) {
  const geometry = mesh.geometry;
  const position = geometry?.getAttribute?.('position');
  if (!position || !planes.length) return null;
  const uv = geometry.getAttribute('uv');
  const index = geometry.index;
  const triangleVertexCount = index?.count ?? position.count;
  const inverseWorld = mesh.matrixWorld.clone().invert();
  const outputPositions = [];
  const outputUvs = [];
  let hasUvs = Boolean(uv);

  const vertex = (vertexIndex) => ({
    worldPosition: new THREE.Vector3().fromBufferAttribute(position, vertexIndex).applyMatrix4(mesh.matrixWorld),
    uv: uv ? new THREE.Vector2().fromBufferAttribute(uv, vertexIndex) : null,
  });
  for (let offset = 0; offset + 2 < triangleVertexCount; offset += 3) {
    let polygon = [0, 1, 2].map((corner) => vertex(index ? index.getX(offset + corner) : offset + corner));
    for (const plane of planes) {
      polygon = clipPolygonToPlane(polygon, plane);
      if (polygon.length < 3) break;
    }
    for (let corner = 1; corner + 1 < polygon.length; corner += 1) {
      [polygon[0], polygon[corner], polygon[corner + 1]].forEach((point) => {
        const local = point.worldPosition.clone().applyMatrix4(inverseWorld);
        outputPositions.push(local.x, local.y, local.z);
        if (point.uv) outputUvs.push(point.uv.x, point.uv.y);
        else hasUvs = false;
      });
    }
  }

  const clipped = new THREE.BufferGeometry();
  clipped.name = `${geometry.name || mesh.name || 'Karbandi rib'} export clipping`;
  clipped.setAttribute('position', new THREE.Float32BufferAttribute(outputPositions, 3));
  if (hasUvs && outputUvs.length * 3 === outputPositions.length * 2) {
    clipped.setAttribute('uv', new THREE.Float32BufferAttribute(outputUvs, 2));
  }
  clipped.computeVertexNormals();
  clipped.computeBoundingBox();
  clipped.computeBoundingSphere();
  return clipped;
}

function bakeKarbandiExportClipping(root) {
  root.updateMatrixWorld(true);
  root.traverse((child) => {
    if (!child.isMesh || child.userData?.isKarbandi !== true || child.userData?.isKarbandiCover === true || child.userData?.isKarbandiVisualGuide === true) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    const planes = materials.flatMap((material) => material?.clippingPlanes || []);
    const uniquePlanes = planes.filter((plane, index) => planes.findIndex((candidate) => (
      candidate.normal.distanceToSquared(plane.normal) < 1e-12 && Math.abs(candidate.constant - plane.constant) < 1e-9
    )) === index);
    if (!uniquePlanes.length) return;
    const clipped = clippedGeometryForPlanes(child, uniquePlanes);
    if (clipped) child.geometry = clipped;
  });
}

function exportTriangleCount(root) {
  let triangles = 0;
  root.traverse((child) => {
    if (!child.isMesh || !child.geometry) return;
    const position = child.geometry.getAttribute?.('position');
    if (!position) return;
    triangles += Math.floor((child.geometry.index?.count ?? position.count) / 3);
  });
  return triangles;
}

function removeTextureMaps(root) {
  const textureKeys = [
    'map', 'alphaMap', 'aoMap', 'bumpMap', 'displacementMap', 'emissiveMap',
    'envMap', 'lightMap', 'metalnessMap', 'normalMap', 'roughnessMap',
    'clearcoatMap', 'clearcoatNormalMap', 'clearcoatRoughnessMap',
    'iridescenceMap', 'iridescenceThicknessMap', 'sheenColorMap',
    'sheenRoughnessMap', 'specularColorMap', 'specularIntensityMap',
    'thicknessMap', 'transmissionMap',
  ];
  root.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    const sourceMaterials = Array.isArray(child.material) ? child.material : [child.material];
    const materials = sourceMaterials.map((source) => {
      const material = source.clone();
      textureKeys.forEach((key) => {
        if (key in material) material[key] = null;
      });
      material.needsUpdate = true;
      return material;
    });
    child.material = Array.isArray(child.material) ? materials : materials[0];
  });
}

export function coverSystemAllowsPlacement(placement, walls) {
  const role = placement?.role ?? placement?.userData?.role;
  return !(walls?.karbandi?.enabled === true && role === 'arch-muqarnas');
}

export function objectIsSelectable(object, boundary = null) {
  let current = object;
  while (current) {
    if (current.visible === false || current.userData?.hiddenByCoverSystem === true) return false;
    if (current === boundary) return true;
    current = current.parent;
  }
  return boundary == null;
}

function visiblePlacementIdFromHits(hits, placementGroup) {
  const hit = hits.find(({ object }) => objectIsSelectable(object, placementGroup));
  return hit?.object?.userData?.placementId || null;
}

function visibleZoneIdFromHits(hits, boundary) {
  const hit = hits.find(({ object }) => objectIsSelectable(object, boundary));
  return hit?.object?.userData?.zoneId || null;
}

function projectInstanceIdFromHits(hits, boundary) {
  for (const hit of hits) {
    let current = hit.object;
    while (current && current !== boundary) {
      if (current.userData?.projectInstanceId) return current.userData.projectInstanceId;
      current = current.parent;
    }
  }
  return null;
}

const DEFAULT_BUILDING = Object.freeze({
  type: 'iwan',
  buildingType: 'portal',
  portalPlanShape: 'square',
  roomPlanShape: 'square',
  roomPolygonSides: 6,
  roomExteriorColumnsEnabled: false,
  roomExteriorColumnProfile: 'circle',
  roomExteriorColumnRadius: 0.2,
  roomExteriorSquareColumnRotation: 0,
  roomExteriorCircleColumnCount: 8,
  roomExteriorCircleColumnBoundaryMode: 'columns',
  hallGridX: 3,
  hallGridY: 3,
  hallBayWidth: 4,
  hallBayDepth: 4,
  gridBaySpansX: [4, 4, 4],
  gridBaySpansY: [4, 4, 4],
  gridBayCovers: {},
  gridBayTransitions: {},
  gridElementColors: {},
  gridRemovedBays: [],
  gridRemovedWalls: [],
  gridRemovedVaults: [],
  gridRemovedDomes: [],
  gridRemovedTransitions: [],
  gridStageEditEnabled: true,
  hallColumnProfile: 'square',
  hallColumnDimension: null,
  hallColumnRadius: null,
  hallColumnDimensionFollowsWallThickness: true,
  hallArchRibWidth: 0.7,
  hallArchRibHeight: 0.35,
  hallVaultConvergenceAdjusted: false,
  hallVaultFinish: 'bricks',
  hallVaultColor: '#b78b5d',
  hallTransitionEnabled: false,
  hallTransitionType: 'none',
  hallCoverType: 'none',
  hallBarrelAxis: 'x',
  hallRibVaultEdgeColors: {
    'rib-vault': '#3aa1bb',
    'raised-rib-vault': '#3aa1bb',
  },
  hallRibVaultCenterOpeningEnabledByCoverType: {
    'rib-vault': false,
    'raised-rib-vault': false,
  },
  hallRibVaultCoverageByCoverType: {
    'rib-vault': 85,
    'raised-rib-vault': 85,
  },
  hallArchGuideVisible: false,
  hallDomeGuideVisible: false,
  hallArch: {
    archType: 'two-point',
    redOffset: 0,
    redRadius: null,
    greenOffset: 1,
    greenHeightOffset: -1,
  },
  hallDomeArch: {
    archType: 'one-point',
    redOffset: -1.95,
    redRadius: 0.0001,
    greenOffset: 0.05,
    greenHeight: 4,
    greenHeightOffset: -2,
    greenOffsetAuto: true,
    greenHeightAuto: true,
  },
  width: 4,
  depth: 2,
  iwanDepth: 2,
  length: 4,
  height: 6,
  wallThickness: 0.35,
  openingWidth: 4,
  domeEnabled: false,
  domeCoverType: 'none',
  domeCoverHeight: 5,
  domeTransition: 'none',
  domeTransitionHeight: 1.2,
  domeTransitionCoverEnabled: false,
  domeDrumHeight: 0.5,
  domeRise: 2,
  domeColor: '#49b5ca',
  domeExtraLegColor: '#49b5ca',
  domeRingColor: '#49b5ca',
  domeOuterRingEnabledByCoverType: {
    dome: true,
    cone: true,
    pyramid: true,
  },
  domeOuterLegExtensionByCoverType: {
    dome: 0.5,
    cone: 0.5,
    pyramid: 0.5,
  },
  domeDrumHeightByTransition: {
    karbandi: 0,
    squinch: 0.5,
    pendentive: 0.5,
    muqarnas: 0.5,
    direct: 0.5,
  },
  domeOuterRingEnabledByTransitionAndCoverType: {
    karbandi: { dome: false, cone: false, pyramid: false },
    squinch: { dome: true, cone: true, pyramid: true },
    pendentive: { dome: true, cone: true, pyramid: true },
    muqarnas: { dome: true, cone: true, pyramid: true },
    direct: { dome: true, cone: true, pyramid: true },
  },
  domeOuterLegExtensionByTransitionAndCoverType: {
    karbandi: { dome: 0, cone: 0, pyramid: 0 },
    squinch: { dome: 0.5, cone: 0.5, pyramid: 0.5 },
    pendentive: { dome: 0.5, cone: 0.5, pyramid: 0.5 },
    muqarnas: { dome: 0.5, cone: 0.5, pyramid: 0.5 },
    direct: { dome: 0.5, cone: 0.5, pyramid: 0.5 },
  },
  domePatternCoverage: 85,
  domeCenterOpeningEnabled: false,
  innerDomeEnabled: false,
  innerDomeEnabledByTransition: {
    karbandi: false,
    squinch: true,
    pendentive: false,
    muqarnas: false,
    direct: false,
    none: false,
  },
  innerDomeColor: '#b88b5f',
  innerDomePatternCoverage: 85,
  betweenDomeSupportWallsEnabled: true,
  betweenDomeSupportWallsCoverage: 60,
  domeDrumColor: '#b3a62c',
  domeArch: {
    archType: 'one-point',
    redOffset: 0,
    redRadius: null,
    greenOffset: 0.75,
    greenHeightOffset: -2,
    legExtension: 0,
  },
  innerDomeArch: {
    archType: 'two-point',
    redOffset: -0.75,
    redRadius: null,
    greenOffset: 0.95,
    greenHeightOffset: -1.75,
  },
  domeTransitionSettings: {
    karbandi: { ribCount: 16, ribWidth: 0.04 },
    squinch: {
      archType: 'two-point',
      archCount: 8,
      ribWidth: 0.1,
      ribDepth: 0.46,
      ribColor: '#3490b7',
      legGap: 0,
      legExtension: 1,
      openWallArchBays: false,
      springHeightOffset: 0,
      redOffset: -0.1,
      greenOffset: 0.45,
      greenHeightOffset: -0.65,
    },
    pendentive: { curvature: 1.45, subdivisions: 10 },
    muqarnas: { courseCount: 6, courseWidth: 0.045 },
  },
  wallColor: '#d8b678',
  groundColor: '#f4e7c2',
});

export function normalizeBuilding(value = {}) {
  const buildingTypes = new Set(['portal', 'room', 'vestibule', 'hall', 'grid']);
  const savedBuildingType = buildingTypes.has(value.buildingType) ? value.buildingType : null;
  const buildingType = value.type === 'vestibule' || (value.type === 'room' && savedBuildingType === 'vestibule')
    ? 'vestibule'
    : value.type === 'hall' || (value.type === 'room' && ['hall', 'grid'].includes(savedBuildingType))
      ? savedBuildingType || 'hall'
    : value.type === 'room'
      ? 'room'
      : value.type === 'iwan'
        ? 'portal'
        : savedBuildingType || DEFAULT_BUILDING.buildingType;
  const type = buildingType === 'portal' ? 'iwan' : 'room';
  const roomPlanShapes = new Set(['square', 'octagon', 'circle', 'polygon']);
  const portalPlanShapes = new Set(['square', 'octagon', 'circle']);
  const portalPlanShape = portalPlanShapes.has(value.portalPlanShape)
    ? value.portalPlanShape
    : DEFAULT_BUILDING.portalPlanShape;
  const roomPlanShape = buildingType === 'vestibule'
    ? 'octagon'
    : ['hall', 'grid'].includes(buildingType)
      ? 'square'
    : roomPlanShapes.has(value.roomPlanShape)
      ? value.roomPlanShape
      : DEFAULT_BUILDING.roomPlanShape;
  const domeCoverTypes = new Set(['none', 'dome', 'cone', 'pyramid']);
  const configurableDomeCoverTypes = ['dome', 'cone', 'pyramid'];
  let domeCoverType = domeCoverTypes.has(value.domeCoverType) ? value.domeCoverType : DEFAULT_BUILDING.domeCoverType;
  if (roomPlanShape === 'circle' && domeCoverType === 'pyramid') domeCoverType = 'dome';
  const legacyDomeOuterRingEnabledByCoverType = Object.fromEntries(configurableDomeCoverTypes.map((coverType) => [
    coverType,
    value.domeOuterRingEnabledByCoverType?.[coverType] == null
      ? DEFAULT_BUILDING.domeOuterRingEnabledByCoverType[coverType] ?? false
      : value.domeOuterRingEnabledByCoverType[coverType] === true,
  ]));
  const domeTransitions = new Set(['none', 'direct', 'karbandi', 'squinch', 'pendentive', 'muqarnas']);
  const configurableDomeTransitions = ['karbandi', 'squinch', 'pendentive', 'muqarnas'];
  const hallTransitionType = ['none', 'pendentive', 'karbandi'].includes(value.hallTransitionType)
    ? value.hallTransitionType
    : ['none', 'pendentive', 'karbandi'].includes(value.domeTransition)
      ? value.domeTransition
      : DEFAULT_BUILDING.hallTransitionType;
  const hallCoverType = ['none', 'dome', 'barrel', 'rib-vault', 'raised-rib-vault'].includes(value.hallCoverType)
    ? value.hallCoverType
    : DEFAULT_BUILDING.hallCoverType;
  const domeSupportModes = [...configurableDomeTransitions, 'direct'];
  const domeTransition = buildingType === 'vestibule'
    ? value.domeTransition === 'none' ? 'none' : 'karbandi'
    : ['hall', 'grid'].includes(buildingType)
      ? hallTransitionType
    : domeTransitions.has(value.domeTransition) ? value.domeTransition : DEFAULT_BUILDING.domeTransition;
  const hallGridX = Math.round(Math.max(1, Math.min(12, Number(value.hallGridX) || DEFAULT_BUILDING.hallGridX)));
  const hallGridY = Math.round(Math.max(1, Math.min(12, Number(value.hallGridY) || DEFAULT_BUILDING.hallGridY)));
  const rawHallBayWidth = Number(value.hallBayWidth) || DEFAULT_BUILDING.hallBayWidth;
  const rawHallBayDepth = Number(value.hallBayDepth) || DEFAULT_BUILDING.hallBayDepth;
  const hallArchRibWidth = Math.max(0.03, Math.min(0.8,
    Number(value.hallArchRibWidth) || DEFAULT_BUILDING.hallArchRibWidth));
  const hallArchRibHeight = Math.max(0.03, Math.min(0.8,
    Number(value.hallArchRibHeight)
    || (Number(value.hallArchRibWidth) ? Number(value.hallArchRibWidth) : DEFAULT_BUILDING.hallArchRibHeight)));
  const usesUnadjustedDefaultHallBay = ['hall', 'grid'].includes(buildingType)
    && value.hallVaultConvergenceAdjusted !== true
    && Math.abs(rawHallBayWidth - DEFAULT_BUILDING.hallBayWidth) < 0.000001
    && Math.abs(rawHallBayDepth - DEFAULT_BUILDING.hallBayDepth) < 0.000001;
  const hallVaultConvergenceCorrection = usesUnadjustedDefaultHallBay
    ? Math.max(0, hallArchRibWidth - hallArchRibHeight)
    : 0;
  const hallBayWidth = Math.max(2, Math.min(12, rawHallBayWidth + hallVaultConvergenceCorrection));
  const hallBayDepth = Math.max(2, Math.min(12, rawHallBayDepth + hallVaultConvergenceCorrection));
  const normalizeGridSpans = (saved, count, fallback) => Array.from({ length: count }, (_, index) => (
    Math.max(2, Math.min(12, Number(saved?.[index]) || fallback))
  ));
  const gridBaySpansX = normalizeGridSpans(value.gridBaySpansX, hallGridX, hallBayWidth);
  const gridBaySpansY = normalizeGridSpans(value.gridBaySpansY, hallGridY, hallBayDepth);
  const validHallCovers = new Set(['none', 'dome', 'barrel', 'rib-vault', 'raised-rib-vault']);
  const gridBayCovers = Object.fromEntries(Object.entries(value.gridBayCovers || {}).filter(([key, cover]) => {
    const [ix, iy, extra] = key.split(':').map(Number);
    return extra == null && Number.isInteger(ix) && Number.isInteger(iy)
      && ix >= 0 && ix < hallGridX && iy >= 0 && iy < hallGridY && validHallCovers.has(cover);
  }));
  const gridBayTransitions = Object.fromEntries(Object.entries(value.gridBayTransitions || {}).filter(([key, transition]) => {
    const [ix, iy, extra] = key.split(':').map(Number);
    return extra == null && Number.isInteger(ix) && Number.isInteger(iy)
      && ix >= 0 && ix < hallGridX && iy >= 0 && iy < hallGridY
      && ['none', 'pendentive', 'karbandi'].includes(transition);
  }));
  const gridElementColors = Object.fromEntries(Object.entries(value.gridElementColors || {}).filter(([id, color]) => (
    typeof id === 'string' && id.length <= 80 && /^#[0-9a-f]{6}$/i.test(color || '')
  )));
  const normalizeGridElementIds = (saved) => [...new Set((Array.isArray(saved) ? saved : [])
    .filter((id) => typeof id === 'string' && id.length <= 80))];
  const hallArch = value.hallArch || {};
  const hallDomeArch = value.hallDomeArch || {};
  const hallRibVaultEdgeColors = Object.fromEntries(['rib-vault', 'raised-rib-vault'].map((coverType) => {
    const savedColor = value.hallRibVaultEdgeColors?.[coverType]
      ?? (value.hallCoverType === coverType ? value.hallRibVaultEdgeColor : null);
    return [
      coverType,
      /^#[0-9a-f]{6}$/i.test(savedColor || '')
        ? savedColor
        : DEFAULT_BUILDING.hallRibVaultEdgeColors[coverType],
    ];
  }));
  const hallRibVaultCenterOpeningEnabledByCoverType = Object.fromEntries(
    ['rib-vault', 'raised-rib-vault'].map((coverType) => [
      coverType,
      value.hallRibVaultCenterOpeningEnabledByCoverType?.[coverType] === true,
    ]),
  );
  const hallRibVaultCoverageByCoverType = Object.fromEntries(
    ['rib-vault', 'raised-rib-vault'].map((coverType) => [
      coverType,
      Math.max(0, Math.min(100, Number.isFinite(Number(value.hallRibVaultCoverageByCoverType?.[coverType]))
        ? Number(value.hallRibVaultCoverageByCoverType[coverType])
        : DEFAULT_BUILDING.hallRibVaultCoverageByCoverType[coverType])),
    ]),
  );
  const normalizedWallThickness = Math.max(0.1, Math.min(1.5,
    Number(value.wallThickness) || (['hall', 'grid'].includes(buildingType) ? 0.5 : DEFAULT_BUILDING.wallThickness)));
  const savedHallColumnDimension = Number(value.hallColumnDimension)
    || (Number(value.hallColumnRadius) ? Number(value.hallColumnRadius) * 2 : null);
  const hallColumnDimensionFollowsWallThickness = value.hallColumnDimensionFollowsWallThickness == null
    ? !Number.isFinite(savedHallColumnDimension) || Math.abs(savedHallColumnDimension - 0.44) < 0.000001
    : value.hallColumnDimensionFollowsWallThickness === true;
  const hallColumnDimension = Math.max(0.1, Math.min(2,
    hallColumnDimensionFollowsWallThickness
      ? normalizedWallThickness
      : savedHallColumnDimension || normalizedWallThickness));
  const roomLength = Math.max(2, Math.min(30, Number(value.length ?? (type === 'room' ? value.depth : null)) || DEFAULT_BUILDING.length));
  const iwanDepth = Math.max(2, Math.min(30, Number(value.iwanDepth ?? (type === 'iwan' ? value.depth : null)) || DEFAULT_BUILDING.iwanDepth));
  const domeArch = value.domeArch || {};
  const hasPerCoverOuterLegSettings = value.domeOuterLegExtensionByCoverType
    && typeof value.domeOuterLegExtensionByCoverType === 'object';
  const legacyDomeOuterLegExtensionByCoverType = Object.fromEntries(configurableDomeCoverTypes.map((coverType) => [
    coverType,
    Math.max(0, Math.min(10, Number.isFinite(Number(value.domeOuterLegExtensionByCoverType?.[coverType]))
      ? Number(value.domeOuterLegExtensionByCoverType[coverType])
      : DEFAULT_BUILDING.domeOuterLegExtensionByCoverType[coverType] ?? 0)),
  ]));
  // Migrate the former shared input to the cover type active in that project.
  if (!hasPerCoverOuterLegSettings && Number.isFinite(Number(domeArch.legExtension))) {
    legacyDomeOuterLegExtensionByCoverType[domeCoverType] = Math.max(0, Math.min(10, Number(domeArch.legExtension)));
  }
  const domeSupportMode = buildingType === 'room' && roomPlanShape !== 'square'
    ? 'direct'
    : domeTransition;
  const configurableDomeSupportMode = domeSupportMode === 'none' ? 'karbandi' : domeSupportMode;
  const hasTransitionDrumSettings = value.domeDrumHeightByTransition
    && typeof value.domeDrumHeightByTransition === 'object';
  const hasTransitionRingSettings = value.domeOuterRingEnabledByTransitionAndCoverType
    && typeof value.domeOuterRingEnabledByTransitionAndCoverType === 'object';
  const hasTransitionLegSettings = value.domeOuterLegExtensionByTransitionAndCoverType
    && typeof value.domeOuterLegExtensionByTransitionAndCoverType === 'object';
  const legacyDrumHeight = Math.max(0, Math.min(10,
    Number.isFinite(Number(value.domeDrumHeight)) ? Number(value.domeDrumHeight) : DEFAULT_BUILDING.domeDrumHeight));
  const domeDrumHeightByTransition = Object.fromEntries(domeSupportModes.map((mode) => [
    mode,
    Math.max(0, Math.min(10, Number.isFinite(Number(value.domeDrumHeightByTransition?.[mode]))
      ? Number(value.domeDrumHeightByTransition[mode])
      : !hasTransitionDrumSettings && mode === configurableDomeSupportMode && mode !== 'karbandi'
        ? legacyDrumHeight
        : DEFAULT_BUILDING.domeDrumHeightByTransition[mode] ?? 0)),
  ]));
  const domeOuterRingEnabledByTransitionAndCoverType = Object.fromEntries(domeSupportModes.map((mode) => [
    mode,
    Object.fromEntries(configurableDomeCoverTypes.map((coverType) => [
      coverType,
      value.domeOuterRingEnabledByTransitionAndCoverType?.[mode]?.[coverType] == null
        ? !hasTransitionRingSettings && mode === configurableDomeSupportMode && mode !== 'karbandi'
          ? legacyDomeOuterRingEnabledByCoverType[coverType]
          : DEFAULT_BUILDING.domeOuterRingEnabledByTransitionAndCoverType[mode]?.[coverType] ?? false
        : value.domeOuterRingEnabledByTransitionAndCoverType[mode][coverType] === true,
    ])),
  ]));
  const domeOuterLegExtensionByTransitionAndCoverType = Object.fromEntries(domeSupportModes.map((mode) => [
    mode,
    Object.fromEntries(configurableDomeCoverTypes.map((coverType) => [
      coverType,
      Math.max(0, Math.min(10, Number.isFinite(Number(
        value.domeOuterLegExtensionByTransitionAndCoverType?.[mode]?.[coverType],
      ))
        ? Number(value.domeOuterLegExtensionByTransitionAndCoverType[mode][coverType])
        : !hasTransitionLegSettings && mode === configurableDomeSupportMode && mode !== 'karbandi'
          ? legacyDomeOuterLegExtensionByCoverType[coverType]
          : DEFAULT_BUILDING.domeOuterLegExtensionByTransitionAndCoverType[mode]?.[coverType] ?? 0)),
    ])),
  ]));
  const domeDrumHeight = domeDrumHeightByTransition[configurableDomeSupportMode];
  const domeOuterRingEnabledByCoverType = domeOuterRingEnabledByTransitionAndCoverType[configurableDomeSupportMode];
  const domeOuterLegExtensionByCoverType = domeOuterLegExtensionByTransitionAndCoverType[configurableDomeSupportMode];
  const innerDomeArch = value.innerDomeArch || {};
  const domeTransitionSettings = value.domeTransitionSettings || {};
  const hasPerTransitionInnerDomeSettings = value.innerDomeEnabledByTransition
    && typeof value.innerDomeEnabledByTransition === 'object';
  const innerDomeSupportModes = [...configurableDomeTransitions, 'direct', 'none'];
  const innerDomeEnabledByTransition = Object.fromEntries(innerDomeSupportModes.map((supportMode) => [
    supportMode,
    hasPerTransitionInnerDomeSettings
      && value.innerDomeEnabledByTransition[supportMode] != null
      ? value.innerDomeEnabledByTransition[supportMode] === true
      : DEFAULT_BUILDING.innerDomeEnabledByTransition[supportMode] === true,
  ]));
  // Migrate the former single checkbox without coupling future transition
  // choices: its saved value belongs only to the transition active in that file.
  if (!hasPerTransitionInnerDomeSettings && value.innerDomeEnabled != null) {
    innerDomeEnabledByTransition[domeSupportMode] = value.innerDomeEnabled === true;
  }
  const innerDomeEnabled = innerDomeEnabledByTransition[domeSupportMode] === true;
  const hasTwoLayerDome = domeCoverType === 'dome' && innerDomeEnabled;
  const usesDefaultDirectBearingDome = buildingType === 'room'
    && roomPlanShape !== 'square'
    && value.domeArch == null;
  const usesFixedMainDomeProfile = hasTwoLayerDome || usesDefaultDirectBearingDome;
  const usesRoundRoomMainDomeDefault = buildingType === 'room'
    && ['circle', 'octagon'].includes(roomPlanShape);
  const fixedMainDomeGreenOffset = usesRoundRoomMainDomeDefault ? 1.4 : 2;
  const fixedMainDomeGreenHeightOffset = usesRoundRoomMainDomeDefault ? -1.45 : -2;
  const normalized = {
    ...DEFAULT_BUILDING,
    ...value,
    type,
    buildingType,
    portalPlanShape,
    roomPlanShape,
    roomPolygonSides: Math.round(Math.max(3, Math.min(32,
      Number(value.roomPolygonSides) || DEFAULT_BUILDING.roomPolygonSides))),
    roomExteriorColumnsEnabled: value.roomExteriorColumnsEnabled === true,
    roomExteriorColumnProfile: value.roomExteriorColumnProfile === 'square' ? 'square' : 'circle',
    roomExteriorColumnRadius: Math.max(0.05, Math.min(2,
      Number(value.roomExteriorColumnRadius) || DEFAULT_BUILDING.roomExteriorColumnRadius)),
    roomExteriorSquareColumnRotation: Math.max(-360, Math.min(360,
      Number(value.roomExteriorSquareColumnRotation) || DEFAULT_BUILDING.roomExteriorSquareColumnRotation)),
    roomExteriorCircleColumnCount: Math.round(Math.max(3, Math.min(64,
      Number(value.roomExteriorCircleColumnCount) || DEFAULT_BUILDING.roomExteriorCircleColumnCount))),
    roomExteriorCircleColumnBoundaryMode: value.roomExteriorCircleColumnBoundaryMode === 'building'
      ? 'building'
      : 'columns',
    hallGridX,
    hallGridY,
    hallBayWidth,
    hallBayDepth,
    gridBaySpansX,
    gridBaySpansY,
    gridBayCovers,
    gridBayTransitions,
    gridElementColors,
    gridRemovedBays: normalizeGridElementIds(value.gridRemovedBays)
      .filter((key) => {
        const [ix, iy, extra] = key.split(':').map(Number);
        return extra == null && Number.isInteger(ix) && Number.isInteger(iy)
          && ix >= 0 && ix < hallGridX && iy >= 0 && iy < hallGridY;
      }),
    gridRemovedWalls: normalizeGridElementIds(value.gridRemovedWalls),
    gridRemovedVaults: normalizeGridElementIds(value.gridRemovedVaults),
    gridRemovedDomes: normalizeGridElementIds(value.gridRemovedDomes),
    gridRemovedTransitions: normalizeGridElementIds(value.gridRemovedTransitions),
    gridStageEditEnabled: value.gridStageEditEnabled == null
      ? buildingType === 'grid'
      : value.gridStageEditEnabled === true,
    hallColumnProfile: value.hallColumnProfile === 'circle' ? 'circle' : 'square',
    hallColumnDimension,
    hallColumnRadius: hallColumnDimension / 2,
    hallColumnDimensionFollowsWallThickness,
    hallArchRibWidth,
    hallArchRibHeight,
    hallVaultConvergenceAdjusted: ['hall', 'grid'].includes(buildingType)
      ? true
      : value.hallVaultConvergenceAdjusted === true,
    hallVaultFinish: value.hallVaultFinish == null
      ? DEFAULT_BUILDING.hallVaultFinish
      : value.hallVaultFinish === 'color' ? 'color' : 'bricks',
    hallVaultColor: /^#[0-9a-f]{6}$/i.test(value.hallVaultColor || '')
      ? value.hallVaultColor
      : DEFAULT_BUILDING.hallVaultColor,
    hallTransitionEnabled: hallTransitionType === 'none' || ['barrel', 'rib-vault', 'raised-rib-vault'].includes(hallCoverType)
      ? false
      : value.hallTransitionEnabled !== false,
    hallTransitionType,
    hallCoverType,
    hallBarrelAxis: value.hallBarrelAxis === 'y' ? 'y' : 'x',
    hallRibVaultEdgeColors,
    hallRibVaultCenterOpeningEnabledByCoverType,
    hallRibVaultCoverageByCoverType,
    hallArchGuideVisible: value.hallArchGuideVisible === true,
    hallDomeGuideVisible: hallCoverType === 'dome' && value.hallDomeGuideVisible === true,
    hallArch: {
      archType: hallArch.archType === 'one-point' ? 'one-point' : 'two-point',
      redOffset: Math.max(-20, Math.min(20, Number.isFinite(Number(hallArch.redOffset)) ? Number(hallArch.redOffset) : DEFAULT_BUILDING.hallArch.redOffset)),
      redRadius: hallArch.redRadius == null ? null : Math.max(0.05, Math.min(40, Number(hallArch.redRadius) || 1)),
      greenOffset: Math.max(0.05, Math.min(20, Number(hallArch.greenOffset) || DEFAULT_BUILDING.hallArch.greenOffset)),
      greenHeightOffset: Math.max(-20, Math.min(20, Number.isFinite(Number(hallArch.greenHeightOffset)) ? Number(hallArch.greenHeightOffset) : DEFAULT_BUILDING.hallArch.greenHeightOffset)),
    },
    hallDomeArch: {
      archType: ['one-point', 'two-point'].includes(hallDomeArch.archType)
        ? hallDomeArch.archType
        : DEFAULT_BUILDING.hallDomeArch.archType,
      redOffset: Math.max(-20, Math.min(20, Number.isFinite(Number(hallDomeArch.redOffset)) ? Number(hallDomeArch.redOffset) : DEFAULT_BUILDING.hallDomeArch.redOffset)),
      redRadius: hallDomeArch.redRadius == null
        ? DEFAULT_BUILDING.hallDomeArch.redRadius
        : Math.max(0.0001, Math.min(40, Number(hallDomeArch.redRadius) || DEFAULT_BUILDING.hallDomeArch.redRadius)),
      greenOffset: Math.max(0.05, Math.min(20, Number(hallDomeArch.greenOffset) || DEFAULT_BUILDING.hallDomeArch.greenOffset)),
      greenHeight: Math.max(-40, Math.min(40, Number.isFinite(Number(hallDomeArch.greenHeight)) ? Number(hallDomeArch.greenHeight) : DEFAULT_BUILDING.hallDomeArch.greenHeight)),
      greenHeightOffset: Math.max(-40, Math.min(40, Number.isFinite(Number(hallDomeArch.greenHeightOffset)) ? Number(hallDomeArch.greenHeightOffset) : DEFAULT_BUILDING.hallDomeArch.greenHeightOffset)),
      greenOffsetAuto: hallDomeArch.greenOffsetAuto == null
        ? DEFAULT_BUILDING.hallDomeArch.greenOffsetAuto
        : hallDomeArch.greenOffsetAuto === true,
      greenHeightAuto: hallDomeArch.greenHeightAuto == null
        ? DEFAULT_BUILDING.hallDomeArch.greenHeightAuto
        : hallDomeArch.greenHeightAuto === true,
    },
    width: ['hall', 'grid'].includes(buildingType)
      ? (buildingType === 'grid' ? gridBaySpansX.reduce((sum, span) => sum + span, 0) : hallGridX * hallBayWidth)
      : Math.max(2, Math.min(30, Number(value.width) || DEFAULT_BUILDING.width)),
    depth: ['hall', 'grid'].includes(buildingType) ? (buildingType === 'grid' ? gridBaySpansY.reduce((sum, span) => sum + span, 0) : hallGridY * hallBayDepth) : type === 'room' ? roomLength : iwanDepth,
    iwanDepth,
    length: ['hall', 'grid'].includes(buildingType) ? (buildingType === 'grid' ? gridBaySpansY.reduce((sum, span) => sum + span, 0) : hallGridY * hallBayDepth) : roomLength,
    height: Math.max(0.5, Math.min(20, Number(value.height) || (
      ['hall', 'grid'].includes(buildingType) ? 3 : buildingType === 'vestibule' ? 4 : DEFAULT_BUILDING.height
    ))),
    wallThickness: normalizedWallThickness,
    openingWidth: Math.max(1, Math.min(20, Number(value.openingWidth) || DEFAULT_BUILDING.openingWidth)),
    domeEnabled: ['hall', 'grid'].includes(buildingType)
      ? hallCoverType === 'dome'
      : domeCoverType !== 'none' || (type === 'room' && !['none', 'direct'].includes(domeTransition)),
    domeCoverType: ['hall', 'grid'].includes(buildingType) ? 'dome' : domeCoverType,
    domeCoverHeight: Math.max(0.2, Math.min(20, Number(value.domeCoverHeight) || DEFAULT_BUILDING.domeCoverHeight)),
    domeTransition,
    domeTransitionHeight: Math.max(0.2, Math.min(10, Number(value.domeTransitionHeight) || DEFAULT_BUILDING.domeTransitionHeight)),
    domeTransitionCoverEnabled: domeTransition === 'none'
      ? false
      : ['hall', 'grid'].includes(buildingType)
      ? !['barrel', 'rib-vault', 'raised-rib-vault'].includes(hallCoverType)
      : roomPlanShape !== 'square' && buildingType !== 'vestibule'
      ? false
      : value.domeTransitionCoverEnabled == null
        ? DEFAULT_BUILDING.domeTransitionCoverEnabled
        : value.domeTransitionCoverEnabled === true,
    domeDrumHeight,
    domeDrumHeightByTransition,
    domeRise: Math.max(0.2, Math.min(20, Number(value.domeRise) || DEFAULT_BUILDING.domeRise)),
    domeColor: /^#[0-9a-f]{6}$/i.test(value.domeColor || '') ? value.domeColor : DEFAULT_BUILDING.domeColor,
    domeExtraLegColor: /^#[0-9a-f]{6}$/i.test(value.domeExtraLegColor || '')
      ? value.domeExtraLegColor
      : /^#[0-9a-f]{6}$/i.test(value.domeColor || '') ? value.domeColor : DEFAULT_BUILDING.domeExtraLegColor,
    domeRingColor: /^#[0-9a-f]{6}$/i.test(value.domeRingColor || '')
      ? value.domeRingColor
      : DEFAULT_BUILDING.domeRingColor,
    domeOuterRingEnabledByCoverType,
    domeOuterLegExtensionByCoverType,
    domeOuterRingEnabledByTransitionAndCoverType,
    domeOuterLegExtensionByTransitionAndCoverType,
    domePatternCoverage: Math.max(0, Math.min(100, Number.isFinite(Number(value.domePatternCoverage))
      ? Number(value.domePatternCoverage)
      : DEFAULT_BUILDING.domePatternCoverage)),
    domeCenterOpeningEnabled: hasTwoLayerDome ? false : value.domeCenterOpeningEnabled === true,
    innerDomeEnabledByTransition,
    innerDomeEnabled,
    innerDomeColor: /^#[0-9a-f]{6}$/i.test(value.innerDomeColor || '')
      ? value.innerDomeColor
      : DEFAULT_BUILDING.innerDomeColor,
    innerDomePatternCoverage: Math.max(0, Math.min(100, Number.isFinite(Number(value.innerDomePatternCoverage))
      ? Number(value.innerDomePatternCoverage)
      : DEFAULT_BUILDING.innerDomePatternCoverage)),
    betweenDomeSupportWallsEnabled: value.betweenDomeSupportWallsEnabled == null
      ? DEFAULT_BUILDING.betweenDomeSupportWallsEnabled
      : value.betweenDomeSupportWallsEnabled === true,
    betweenDomeSupportWallsCoverage: Math.max(0, Math.min(100, Number.isFinite(Number(value.betweenDomeSupportWallsCoverage))
      ? Number(value.betweenDomeSupportWallsCoverage)
      : DEFAULT_BUILDING.betweenDomeSupportWallsCoverage)),
    domeDrumColor: /^#[0-9a-f]{6}$/i.test(value.domeDrumColor || '') ? value.domeDrumColor : DEFAULT_BUILDING.domeDrumColor,
    domeArch: {
      archType: usesFixedMainDomeProfile
        ? 'two-point'
        : domeArch.archType === 'two-point' ? 'two-point' : DEFAULT_BUILDING.domeArch.archType,
      redOffset: usesFixedMainDomeProfile
        ? 0
        : Math.max(-20, Math.min(20, Number.isFinite(Number(domeArch.redOffset)) ? Number(domeArch.redOffset) : DEFAULT_BUILDING.domeArch.redOffset)),
      redRadius: usesFixedMainDomeProfile
        ? null
        : domeArch.redRadius == null ? null : Math.max(0.05, Math.min(40, Number(domeArch.redRadius) || 1)),
      greenOffset: usesFixedMainDomeProfile
        ? fixedMainDomeGreenOffset
        : Math.max(0.05, Math.min(20, Number(domeArch.greenOffset) || DEFAULT_BUILDING.domeArch.greenOffset)),
      greenHeightOffset: usesFixedMainDomeProfile
        ? fixedMainDomeGreenHeightOffset
        : Math.max(-20, Math.min(20, Number.isFinite(Number(domeArch.greenHeightOffset)) ? Number(domeArch.greenHeightOffset) : DEFAULT_BUILDING.domeArch.greenHeightOffset)),
      legExtension: domeOuterLegExtensionByCoverType[domeCoverType],
    },
    innerDomeArch: {
      archType: innerDomeArch.archType === 'one-point' ? 'one-point' : 'two-point',
      redOffset: Math.max(-20, Math.min(20, Number.isFinite(Number(innerDomeArch.redOffset)) ? Number(innerDomeArch.redOffset) : DEFAULT_BUILDING.innerDomeArch.redOffset)),
      redRadius: innerDomeArch.redRadius == null ? null : Math.max(0.05, Math.min(40, Number(innerDomeArch.redRadius) || 1)),
      greenOffset: Math.max(0.05, Math.min(20, Number(innerDomeArch.greenOffset) || DEFAULT_BUILDING.innerDomeArch.greenOffset)),
      greenHeightOffset: Math.max(-20, Math.min(20, Number.isFinite(Number(innerDomeArch.greenHeightOffset)) ? Number(innerDomeArch.greenHeightOffset) : DEFAULT_BUILDING.innerDomeArch.greenHeightOffset)),
    },
    domeTransitionSettings: {
      karbandi: {
        ribCount: Math.round(Math.max(4, Math.min(64, Number(domeTransitionSettings.karbandi?.ribCount) || DEFAULT_BUILDING.domeTransitionSettings.karbandi.ribCount))),
        ribWidth: Math.max(0.01, Math.min(0.25, Number(domeTransitionSettings.karbandi?.ribWidth) || DEFAULT_BUILDING.domeTransitionSettings.karbandi.ribWidth)),
      },
      squinch: {
        archType: domeTransitionSettings.squinch?.archType === 'one-point' ? 'one-point' : 'two-point',
        // A Squinch transition is always the eight-arch system. Keep the old
        // facetCount alias readable so saved projects migrate without becoming
        // the former generic faceted transition.
        archCount: 8,
        facetCount: 8,
        ribWidth: Math.max(0.01, Math.min(1, Number(domeTransitionSettings.squinch?.ribWidth) || DEFAULT_BUILDING.domeTransitionSettings.squinch.ribWidth)),
        ribDepth: Math.max(0.01, Math.min(1, Number(domeTransitionSettings.squinch?.ribDepth) || DEFAULT_BUILDING.domeTransitionSettings.squinch.ribDepth)),
        ribColor: /^#[0-9a-f]{6}$/i.test(domeTransitionSettings.squinch?.ribColor || '')
          ? domeTransitionSettings.squinch.ribColor
          : DEFAULT_BUILDING.domeTransitionSettings.squinch.ribColor,
        legGap: 0,
        legExtension: Math.max(0, Math.min(10, Number.isFinite(Number(domeTransitionSettings.squinch?.legExtension))
          ? Number(domeTransitionSettings.squinch.legExtension)
          : DEFAULT_BUILDING.domeTransitionSettings.squinch.legExtension)),
        openWallArchBays: domeTransitionSettings.squinch?.openWallArchBays === true,
        springHeightOffset: Math.max(-10, Math.min(10, Number.isFinite(Number(domeTransitionSettings.squinch?.springHeightOffset))
          ? Number(domeTransitionSettings.squinch.springHeightOffset)
          : DEFAULT_BUILDING.domeTransitionSettings.squinch.springHeightOffset)),
        redOffset: Math.max(-20, Math.min(20, Number.isFinite(Number(domeTransitionSettings.squinch?.redOffset))
          ? Number(domeTransitionSettings.squinch.redOffset)
          : DEFAULT_BUILDING.domeTransitionSettings.squinch.redOffset)),
        greenOffset: Math.max(0.05, Math.min(20, Number(domeTransitionSettings.squinch?.greenOffset) || DEFAULT_BUILDING.domeTransitionSettings.squinch.greenOffset)),
        greenHeightOffset: Math.max(-20, Math.min(20, Number.isFinite(Number(domeTransitionSettings.squinch?.greenHeightOffset))
          ? Number(domeTransitionSettings.squinch.greenHeightOffset)
          : DEFAULT_BUILDING.domeTransitionSettings.squinch.greenHeightOffset)),
      },
      pendentive: {
        curvature: Math.max(0.35, Math.min(3, Number(domeTransitionSettings.pendentive?.curvature) || DEFAULT_BUILDING.domeTransitionSettings.pendentive.curvature)),
        subdivisions: Math.round(Math.max(3, Math.min(32, Number(domeTransitionSettings.pendentive?.subdivisions) || DEFAULT_BUILDING.domeTransitionSettings.pendentive.subdivisions))),
      },
      muqarnas: {
        courseCount: Math.round(Math.max(3, Math.min(16, Number(domeTransitionSettings.muqarnas?.courseCount) || DEFAULT_BUILDING.domeTransitionSettings.muqarnas.courseCount))),
        courseWidth: Math.max(0.01, Math.min(0.2, Number(domeTransitionSettings.muqarnas?.courseWidth) || DEFAULT_BUILDING.domeTransitionSettings.muqarnas.courseWidth)),
      },
    },
  };
  delete normalized.roomKarbandiOctagonWallsVisible;
  if (normalized.type === 'iwan') normalized.openingWidth = normalized.width;
  return normalized;
}

export function resizeHallVaultProfileWidth(value, nextWidth) {
  const currentWidth = Math.max(0.03, Math.min(0.8,
    Number(value.hallArchRibWidth) || DEFAULT_BUILDING.hallArchRibWidth));
  const hallArchRibWidth = Math.max(0.03, Math.min(0.8,
    Number(nextWidth) || DEFAULT_BUILDING.hallArchRibWidth));
  const widthChange = hallArchRibWidth - currentWidth;
  const hallBayWidth = (Number(value.hallBayWidth) || DEFAULT_BUILDING.hallBayWidth) + widthChange;
  const hallBayDepth = (Number(value.hallBayDepth) || DEFAULT_BUILDING.hallBayDepth) + widthChange;
  return normalizeBuilding({
    ...value,
    hallArchRibWidth,
    hallBayWidth,
    hallBayDepth,
  });
}

export function resizeHallVaultProfileHeight(value, nextHeight) {
  const hallArchRibWidth = Math.max(0.03, Math.min(0.8,
    Number(value.hallArchRibWidth) || DEFAULT_BUILDING.hallArchRibWidth));
  const currentHeight = Math.max(0.03, Math.min(0.8,
    Number(value.hallArchRibHeight) || DEFAULT_BUILDING.hallArchRibHeight));
  const hallArchRibHeight = Math.max(0.03, Math.min(0.8,
    Number(nextHeight) || DEFAULT_BUILDING.hallArchRibHeight));
  const currentConvergenceAllowance = Math.max(0, hallArchRibWidth - currentHeight);
  const nextConvergenceAllowance = Math.max(0, hallArchRibWidth - hallArchRibHeight);
  const allowanceChange = nextConvergenceAllowance - currentConvergenceAllowance;
  return normalizeBuilding({
    ...value,
    hallArchRibHeight,
    hallBayWidth: (Number(value.hallBayWidth) || DEFAULT_BUILDING.hallBayWidth) + allowanceChange,
    hallBayDepth: (Number(value.hallBayDepth) || DEFAULT_BUILDING.hallBayDepth) + allowanceChange,
  });
}

export function buildingForSelectedType(value, buildingType, wallExtraHeights = {}) {
  const type = buildingType === 'portal' ? 'iwan' : 'room';
  const roomPlanShape = buildingType === 'vestibule'
    ? 'octagon'
    : ['room', 'hall', 'grid'].includes(buildingType)
      ? 'square'
      : value.roomPlanShape;
  if (buildingType !== 'vestibule') {
    const enteringHall = ['hall', 'grid'].includes(buildingType) && value.buildingType !== buildingType;
    return normalizeBuilding({
      ...value,
      type,
      buildingType,
      roomPlanShape,
      height: enteringHall ? 3 : value.height,
      wallThickness: enteringHall ? 0.5 : value.wallThickness,
      hallGridX: enteringHall ? (buildingType === 'grid' ? 9 : DEFAULT_BUILDING.hallGridX) : value.hallGridX,
      hallGridY: enteringHall ? (buildingType === 'grid' ? 9 : DEFAULT_BUILDING.hallGridY) : value.hallGridY,
      hallBayWidth: enteringHall ? DEFAULT_BUILDING.hallBayWidth : value.hallBayWidth,
      hallBayDepth: enteringHall ? DEFAULT_BUILDING.hallBayDepth : value.hallBayDepth,
      gridBaySpansX: enteringHall ? (buildingType === 'grid' ? Array(9).fill(DEFAULT_BUILDING.hallBayWidth) : DEFAULT_BUILDING.gridBaySpansX) : value.gridBaySpansX,
      gridBaySpansY: enteringHall ? (buildingType === 'grid' ? Array(9).fill(DEFAULT_BUILDING.hallBayDepth) : DEFAULT_BUILDING.gridBaySpansY) : value.gridBaySpansY,
      gridBayCovers: enteringHall ? {} : value.gridBayCovers,
      gridBayTransitions: enteringHall ? {} : value.gridBayTransitions,
      gridElementColors: enteringHall ? {} : value.gridElementColors,
      gridRemovedBays: enteringHall ? [] : value.gridRemovedBays,
      gridRemovedWalls: enteringHall ? [] : value.gridRemovedWalls,
      gridRemovedVaults: enteringHall ? [] : value.gridRemovedVaults,
      gridRemovedDomes: enteringHall ? [] : value.gridRemovedDomes,
      gridRemovedTransitions: enteringHall ? [] : value.gridRemovedTransitions,
      gridStageEditEnabled: buildingType === 'grid',
      hallColumnDimension: enteringHall ? null : value.hallColumnDimension,
      hallColumnRadius: enteringHall ? null : value.hallColumnRadius,
      hallColumnDimensionFollowsWallThickness: enteringHall ? true : value.hallColumnDimensionFollowsWallThickness,
      hallArchRibWidth: enteringHall ? DEFAULT_BUILDING.hallArchRibWidth : value.hallArchRibWidth,
      hallArchRibHeight: enteringHall ? DEFAULT_BUILDING.hallArchRibHeight : value.hallArchRibHeight,
      hallVaultConvergenceAdjusted: enteringHall ? false : value.hallVaultConvergenceAdjusted,
      domePatternCoverage: enteringHall ? DEFAULT_BUILDING.domePatternCoverage : value.domePatternCoverage,
      domeCenterOpeningEnabled: enteringHall ? DEFAULT_BUILDING.domeCenterOpeningEnabled : value.domeCenterOpeningEnabled,
      domeColor: enteringHall ? DEFAULT_BUILDING.domeColor : value.domeColor,
      hallDomeArch: enteringHall ? {
        ...value.hallDomeArch,
        archType: DEFAULT_BUILDING.hallDomeArch.archType,
        redOffset: DEFAULT_BUILDING.hallDomeArch.redOffset,
        redRadius: DEFAULT_BUILDING.hallDomeArch.redRadius,
        greenOffset: DEFAULT_BUILDING.hallDomeArch.greenOffset,
        greenHeight: DEFAULT_BUILDING.hallDomeArch.greenHeight,
        greenHeightOffset: DEFAULT_BUILDING.hallDomeArch.greenHeightOffset,
        greenOffsetAuto: DEFAULT_BUILDING.hallDomeArch.greenOffsetAuto,
        greenHeightAuto: DEFAULT_BUILDING.hallDomeArch.greenHeightAuto,
      } : value.hallDomeArch,
      portalPlanShape: buildingType === 'portal' ? 'square' : value.portalPlanShape,
    });
  }

  const coverTypes = ['dome', 'cone', 'pyramid'];
  const next = normalizeBuilding({
    ...value,
    type,
    buildingType,
    roomPlanShape,
    width: value.buildingType === 'vestibule' ? value.width : 6,
    length: value.buildingType === 'vestibule' ? value.length : 6,
    height: value.buildingType === 'vestibule' ? value.height : 4,
    domeDrumHeight: 0,
    domePatternCoverage: 85,
    domeCenterOpeningEnabled: false,
    domeOuterRingEnabledByCoverType: Object.fromEntries(coverTypes.map((coverType) => [coverType, false])),
    domeArch: {
      ...value.domeArch,
      archType: 'one-point',
      greenOffset: 0.75,
      greenHeightOffset: -2,
    },
  });
  return next;
}

export function buildingSurfaces(building) {
  if (building?.type === 'room' && (building.roomPlanShape || 'square') !== 'square') {
    return [
      { id: 'room_plan_interior', label: 'All interior room walls', kind: 'wall' },
      { id: 'room_plan_exterior', label: 'All exterior room walls', kind: 'wall' },
      { id: 'floor', label: 'Floor', kind: 'floor' },
    ];
  }
  const surfaces = [
    { id: 'north_interior', label: 'North interior wall', kind: 'wall' },
    { id: 'east_interior', label: 'East interior wall', kind: 'wall' },
    { id: 'west_interior', label: 'West interior wall', kind: 'wall' },
    { id: 'floor', label: 'Floor', kind: 'floor' },
  ];
  surfaces.push({ id: 'south_interior', label: 'South interior wall', kind: 'wall' });
  return surfaces;
}

export function surfaceIdForWallSide(side, building) {
  const normalized = side === 'arch' || side === 'south_arch' ? 'south' : side;
  if (normalized === 'north_sides' || normalized === 'north_top') return 'north_interior';
  if (normalized === 'north') return 'north_interior';
  if (normalized === 'east') return 'east_interior';
  if (normalized === 'west') return 'west_interior';
  if (normalized === 'south') return 'south_interior';
  if (normalized === 'room_plan_interior' || normalized === 'room_plan_exterior') return normalized;
  return null;
}

export function wallSideForSurfaceId(surfaceId, building = null) {
  if (surfaceId === 'room_plan_interior' || surfaceId === 'room_plan_exterior') return surfaceId;
  if (surfaceId === 'north_interior') return building?.type === 'room' ? 'north' : 'north_sides';
  if (surfaceId === 'east_interior') return 'east';
  if (surfaceId === 'west_interior') return 'west';
  if (surfaceId === 'south_interior' || surfaceId === 'south_facade') return 'south';
  return null;
}

function makeMaterial(color, roughness = 0.72) {
  return new THREE.MeshStandardMaterial({ color, roughness: Math.max(0.74, roughness), metalness: 0 });
}

function makeFlatGirihMaterial(color) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.82,
    metalness: 0,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
}

function applySolidMatteMaterials(root) {
  root.traverse((child) => {
    if (!child.isMesh) return;
    const source = Array.isArray(child.material) ? child.material[0] : child.material;
    const matte = new THREE.MeshStandardMaterial({
      color: source?.color?.clone?.() || new THREE.Color('#d0a21f'),
      roughness: 0.78,
      metalness: 0,
      transparent: source?.transparent === true && Number(source?.opacity) < 1,
      opacity: Number.isFinite(source?.opacity) ? source.opacity : 1,
      side: source?.side ?? THREE.FrontSide,
      flatShading: source?.flatShading === true,
    });
    child.material = matte;
  });
}

function box(width, height, depth, material, position) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function moduleTopExtrusionGeometry(moduleRoot, archHeightAtX) {
  moduleRoot.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3().setFromObject(moduleRoot);
  if (bounds.isEmpty()) return null;
  const topTolerance = Math.max(0.002, (bounds.max.y - bounds.min.y) * 0.015);
  const vertices = [];
  const vertexIds = new Map();
  const triangles = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const minimumFillHeight = 0.001;
  const heightGap = (point) => {
    const archHeight = Number(archHeightAtX(point.x));
    return Number.isFinite(archHeight) ? archHeight - point.y : Number.NEGATIVE_INFINITY;
  };
  const clipTopTriangle = (points) => {
    const clipped = [];
    let previous = points[points.length - 1];
    let previousGap = heightGap(previous);
    let previousInside = previousGap > minimumFillHeight;
    points.forEach((current) => {
      const currentGap = heightGap(current);
      const currentInside = currentGap > minimumFillHeight;
      if (currentInside !== previousInside) {
        const denominator = currentGap - previousGap;
        const ratio = Math.abs(denominator) > 1e-9
          ? THREE.MathUtils.clamp((minimumFillHeight - previousGap) / denominator, 0, 1)
          : 0.5;
        clipped.push(previous.clone().lerp(current, ratio));
      }
      if (currentInside) clipped.push(current.clone());
      previous = current;
      previousGap = currentGap;
      previousInside = currentInside;
    });
    return clipped;
  };
  const idForVertex = (point) => {
    const key = `${point.x.toFixed(5)}:${point.y.toFixed(5)}:${point.z.toFixed(5)}`;
    if (!vertexIds.has(key)) {
      vertexIds.set(key, vertices.length);
      vertices.push(point.clone());
    }
    return vertexIds.get(key);
  };

  moduleRoot.traverse((mesh) => {
    if (!mesh.isMesh || !mesh.geometry?.getAttribute('position')) return;
    const positions = mesh.geometry.getAttribute('position');
    const index = mesh.geometry.index;
    const indexCount = index ? index.count : positions.count;
    const readWorldVertex = (positionIndex, target) => {
      target.fromBufferAttribute(positions, positionIndex).applyMatrix4(mesh.matrixWorld);
    };
    for (let offset = 0; offset + 2 < indexCount; offset += 3) {
      readWorldVertex(index ? index.getX(offset) : offset, a);
      readWorldVertex(index ? index.getX(offset + 1) : offset + 1, b);
      readWorldVertex(index ? index.getX(offset + 2) : offset + 2, c);
      ab.subVectors(b, a);
      ac.subVectors(c, a);
      const normalY = ab.cross(ac).normalize().y;
      if (Math.abs(normalY) < 0.65 || Math.min(a.y, b.y, c.y) < bounds.max.y - topTolerance) continue;
      const clipped = clipTopTriangle([a, b, c]);
      if (clipped.length < 3) continue;
      const first = idForVertex(clipped[0]);
      for (let pointIndex = 1; pointIndex < clipped.length - 1; pointIndex += 1) {
        triangles.push([first, idForVertex(clipped[pointIndex]), idForVertex(clipped[pointIndex + 1])]);
      }
    }
  });
  if (!triangles.length) return null;

  const globalVertical = new THREE.Vector3(0, 1, 0);
  const projectedVertices = vertices.map((point) => {
    const archHeight = Number(archHeightAtX(point.x));
    const rise = Math.max(0, archHeight - point.y);
    return point.clone().addScaledVector(globalVertical, rise);
  });
  const extrusionPositions = [];
  vertices.forEach((point) => extrusionPositions.push(point.x, point.y, point.z));
  projectedVertices.forEach((point) => extrusionPositions.push(point.x, point.y, point.z));
  const topOffset = vertices.length;
  const indices = [];
  const boundaryEdges = new Map();
  triangles.forEach(([first, second, third]) => {
    indices.push(first + topOffset, second + topOffset, third + topOffset);
    [[first, second], [second, third], [third, first]].forEach(([start, end]) => {
      const key = start < end ? `${start}:${end}` : `${end}:${start}`;
      const edge = boundaryEdges.get(key);
      if (edge) edge.count += 1;
      else boundaryEdges.set(key, { count: 1, start, end });
    });
  });
  boundaryEdges.forEach(({ count, start, end }) => {
    if (count !== 1) return;
    indices.push(start, end, end + topOffset, start, end + topOffset, start + topOffset);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(extrusionPositions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.userData.extrusionAxis = 'global-y';
  geometry.userData.upperBoundary = 'arch-curve';
  return geometry;
}

function pointedFacade(building, material) {
  const width = building.width;
  const height = building.height;
  const openingWidth = Math.min(building.openingWidth, width - building.wallThickness * 2);
  const openingHeight = Math.min(building.openingHeight, height - 0.25);
  const spring = openingHeight * 0.55;
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0);
  shape.lineTo(width / 2, 0);
  shape.lineTo(width / 2, height);
  shape.lineTo(-width / 2, height);
  shape.closePath();

  const opening = new THREE.Path();
  opening.moveTo(-openingWidth / 2, 0);
  opening.lineTo(-openingWidth / 2, spring);
  opening.quadraticCurveTo(-openingWidth / 2, openingHeight * 0.78, 0, openingHeight);
  opening.quadraticCurveTo(openingWidth / 2, openingHeight * 0.78, openingWidth / 2, spring);
  opening.lineTo(openingWidth / 2, 0);
  opening.closePath();
  shape.holes.push(opening);

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: building.wallThickness,
    bevelEnabled: false,
    curveSegments: 28,
  });
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(0, 0, building.depth / 2 - building.wallThickness);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function assetColor(assetType) {
  if (assetType === 'girih_pattern') return '#2f7d86';
  if (assetType === 'brick_bond') return '#b85f3d';
  if (assetType === 'muqarnas_assembly') return '#d0a21f';
  if (assetType === 'surface_sticker') return '#6a5895';
  return '#315d55';
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeNightLight(light = {}) {
  const vector = (value, fallback) => [0, 1, 2].map((index) => Math.max(-40, Math.min(40, finite(value?.[index], fallback[index]))));
  return {
    id: light.id || globalThis.crypto?.randomUUID?.() || `light-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name: String(light.name || 'Spotlight').slice(0, 60),
    enabled: light.enabled !== false,
    color: /^#[0-9a-f]{6}$/i.test(light.color || '') ? light.color : DEFAULT_NIGHT_LIGHT.color,
    intensity: Math.max(1, Math.min(1000, finite(light.intensity, DEFAULT_NIGHT_LIGHT.intensity))),
    distance: Math.max(0.5, Math.min(60, finite(light.distance, DEFAULT_NIGHT_LIGHT.distance))),
    angle: Math.max(5, Math.min(85, finite(light.angle, DEFAULT_NIGHT_LIGHT.angle))),
    penumbra: Math.max(0, Math.min(1, finite(light.penumbra, DEFAULT_NIGHT_LIGHT.penumbra))),
    decay: Math.max(0, Math.min(2, finite(light.decay, DEFAULT_NIGHT_LIGHT.decay))),
    position: vector(light.position, DEFAULT_NIGHT_LIGHT.position),
    target: vector(light.target, DEFAULT_NIGHT_LIGHT.target),
  };
}

function cloneNightLight(light) {
  return { ...light, position: [...light.position], target: [...light.target] };
}

function makeNightLightId(prefix = 'light') {
  return globalThis.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function architecturalNightPreset(presetId, buildingValue, wallValue) {
  const b = normalizeBuilding(buildingValue);
  const walls = normalizeWallSystem(wallValue || {}, b);
  const halfWidth = Math.max(1, b.width / 2);
  const halfDepth = Math.max(1, b.depth / 2);
  const southZ = halfDepth + walls.sideOffsets.south;
  const northZ = -halfDepth - walls.sideOffsets.north;
  const height = Math.max(2, b.height);
  const archPeak = Math.max(height, finite(walls.pointedArch?.greenHeight, height * 0.82) + b.openingWidth * 0.45);
  const centerY = Math.max(1, Math.min(height * 0.62, archPeak * 0.48));
  const distance = Math.max(12, Math.min(60, Math.hypot(b.width, b.depth, archPeak) * 3.1));
  const light = (name, position, target, options = {}) => normalizeNightLight({
    id: makeNightLightId('preset-light'),
    enabled: true,
    name,
    color: options.color || '#ffd7a0',
    intensity: options.intensity ?? 140,
    distance: options.distance ?? distance,
    angle: options.angle ?? 34,
    penumbra: options.penumbra ?? 0.62,
    decay: options.decay ?? 2,
    position,
    target,
  });

  if (presetId === 'warmInterior') {
    return [
      light('Interior amber wash', [0, height * 0.42, northZ + b.wallThickness * 1.2], [0, centerY, southZ], { intensity: 175, angle: 58, penumbra: 0.82, color: '#ffc27a' }),
      light('Door threshold glow', [0, 0.65, southZ - b.wallThickness * 0.3], [0, 0.08, southZ + Math.max(2.2, b.depth * 1.35)], { intensity: 115, angle: 46, penumbra: 0.85, color: '#ffb46a' }),
      light('Soft arch pocket', [-halfWidth * 0.32, height * 0.86, southZ - b.wallThickness], [0, height * 0.58, southZ], { intensity: 92, angle: 32, penumbra: 0.78, color: '#ffe0a8' }),
    ];
  }

  if (presetId === 'dramaticRake') {
    return [
      light('Low left raking beam', [-halfWidth * 2.2, height * 0.38, southZ + b.depth * 1.8], [halfWidth * 0.18, centerY, northZ], { intensity: 260, angle: 25, penumbra: 0.34, color: '#ffc06f' }),
      light('Arch knife highlight', [halfWidth * 1.25, height * 1.02, southZ + b.depth * 0.45], [0, height * 0.76, southZ - b.wallThickness], { intensity: 190, angle: 18, penumbra: 0.28, color: '#fff1cf' }),
      light('Cool rear separation', [halfWidth * 1.7, height * 0.74, northZ - b.depth * 1.25], [0, height * 0.48, northZ], { intensity: 86, angle: 38, penumbra: 0.65, color: '#b8d7ff' }),
    ];
  }

  return [
    light('Hero key · front left', [-halfWidth * 1.85, height * 1.08, southZ + b.depth * 2.15], [0, centerY, 0], { intensity: 235, angle: 31, penumbra: 0.5, color: '#ffd49b' }),
    light('Hero soft fill · front right', [halfWidth * 1.55, height * 0.82, southZ + b.depth * 1.55], [-halfWidth * 0.2, centerY * 0.9, 0], { intensity: 74, angle: 50, penumbra: 0.86, color: '#d6e8ff' }),
    light('Portal interior glow', [0, height * 0.46, northZ + b.wallThickness], [0, height * 0.34, southZ], { intensity: 150, angle: 58, penumbra: 0.86, color: '#ffbd73' }),
    light('Arch crown accent', [-halfWidth * 0.35, Math.min(archPeak + 0.45, 20), southZ + b.depth * 0.45], [0, height * 0.82, southZ - b.wallThickness * 0.4], { intensity: 145, angle: 21, penumbra: 0.38, color: '#fff0cf' }),
    light('Right edge rim', [halfWidth * 1.65, height * 0.74, northZ - b.depth * 1.15], [halfWidth * 0.42, height * 0.52, 0], { intensity: 72, angle: 34, penumbra: 0.58, color: '#b9d9ff' }),
  ];
}

function symmetricArchitecturalNightPreset(presetId, buildingValue, wallValue) {
  const b = normalizeBuilding(buildingValue);
  const walls = normalizeWallSystem(wallValue || {}, b);
  const halfWidth = Math.max(1, b.width / 2);
  const halfDepth = Math.max(1, b.depth / 2);
  const westX = -halfWidth - walls.sideOffsets.west;
  const eastX = halfWidth + walls.sideOffsets.east;
  const southZ = halfDepth + walls.sideOffsets.south;
  const northZ = -halfDepth - walls.sideOffsets.north;
  const height = Math.max(2, b.height);
  const archPeak = Math.max(height, finite(walls.pointedArch?.greenHeight, height * 0.82) + b.openingWidth * 0.45);
  const centerX = (westX + eastX) * 0.5;
  const centerZ = (northZ + southZ) * 0.5;
  const centerY = Math.max(1, archPeak * 0.48);
  const modelCenter = [centerX, centerY, centerZ];
  const width = eastX - westX;
  const depth = southZ - northZ;
  const frontGap = Math.max(1.8, depth * 0.24);
  const sideGap = Math.max(1.8, width * 0.22);
  const frontZ = northZ - frontGap;
  const rearZ = southZ + frontGap;
  const leftX = westX - sideGap;
  const rightX = eastX + sideGap;
  const modelCorners = [westX, eastX].flatMap((x) => [0, archPeak].flatMap((y) => [northZ, southZ].map((z) => new THREE.Vector3(x, y, z))));
  const sizeScale = THREE.MathUtils.clamp(Math.hypot(width, depth, archPeak) / 8, 1, 3.4);
  const light = (name, position, target, options = {}) => normalizeNightLight({
    id: makeNightLightId('preset-light'),
    enabled: true,
    name,
    color: options.color || '#ffd7a0',
    intensity: (options.intensity ?? 140) * sizeScale,
    distance: options.distance ?? Math.min(60, Math.max(12, ...modelCorners.map((corner) => corner.distanceTo(new THREE.Vector3(...position)))) * 1.12),
    // Every preset cone reaches all eight corners of the architectural volume.
    // This prevents large projects from falling outside a fixed-width beam.
    angle: Math.min(82, Math.max(
      options.angle ?? 34,
      ...modelCorners.map((corner) => THREE.MathUtils.radToDeg(
        new THREE.Vector3(...target).sub(new THREE.Vector3(...position)).angleTo(corner.clone().sub(new THREE.Vector3(...position))),
      ) + 3),
    )),
    penumbra: options.penumbra ?? 0.62,
    decay: options.decay ?? 2,
    position,
    target,
  });

  if (presetId === 'warmInterior') {
    return [
      light('Warm front wash', [centerX, archPeak * 0.58, frontZ], modelCenter, { intensity: 152, angle: 48, penumbra: 0.86, color: '#ffc27a' }),
      light('Warm rear wash', [centerX, archPeak * 0.62, rearZ], modelCenter, { intensity: 118, angle: 48, penumbra: 0.84, color: '#ffbf73' }),
      light('Warm left fill', [leftX, archPeak * 0.48, centerZ], modelCenter, { intensity: 92, angle: 46, penumbra: 0.82, color: '#ffd39a' }),
      light('Warm right fill', [rightX, archPeak * 0.48, centerZ], modelCenter, { intensity: 92, angle: 46, penumbra: 0.82, color: '#ffd39a' }),
    ];
  }

  if (presetId === 'dramaticRake') {
    return [
      light('Dramatic rake left', [leftX, archPeak * 0.34, frontZ], modelCenter, { intensity: 205, angle: 34, penumbra: 0.38, color: '#ffc06f' }),
      light('Dramatic rake right', [rightX, archPeak * 0.34, frontZ], modelCenter, { intensity: 205, angle: 34, penumbra: 0.38, color: '#ffc06f' }),
      light('High crown wash', [centerX, Math.min(archPeak + Math.max(1.5, archPeak * 0.2), 38), frontZ], modelCenter, { intensity: 145, angle: 34, penumbra: 0.42, color: '#fff1cf' }),
      light('Cool rear separation', [centerX, archPeak * 0.72, rearZ], modelCenter, { intensity: 92, angle: 42, penumbra: 0.7, color: '#b8d7ff' }),
    ];
  }

  return [
    light('Hero key left front', [leftX, archPeak * 0.92, frontZ], modelCenter, { intensity: 170, angle: 40, penumbra: 0.62, color: '#ffd49b' }),
    light('Hero key right front', [rightX, archPeak * 0.92, frontZ], modelCenter, { intensity: 170, angle: 40, penumbra: 0.62, color: '#ffd49b' }),
    light('Hero soft front fill', [centerX, archPeak * 0.64, frontZ - frontGap * 0.45], modelCenter, { intensity: 88, angle: 52, penumbra: 0.9, color: '#d6e8ff' }),
    light('Hero rear fill', [centerX, archPeak * 0.62, rearZ], modelCenter, { intensity: 90, angle: 48, penumbra: 0.82, color: '#ffbd73' }),
    light('Hero crown wash', [centerX, Math.min(archPeak + Math.max(1.5, archPeak * 0.18), 38), frontZ], modelCenter, { intensity: 112, angle: 38, penumbra: 0.58, color: '#fff0cf' }),
  ];
}

function pointPair(point) {
  if (Array.isArray(point)) return [finite(point[0]), finite(point[1])];
  return [finite(point?.x), finite(point?.y ?? point?.z)];
}

function footprintDimensions(points) {
  if (!Array.isArray(points) || !points.length) return { width: 1, height: 1 };
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  return {
    width: Math.max(0.001, Math.max(...xs) - Math.min(...xs)),
    height: Math.max(0.001, Math.max(...ys) - Math.min(...ys)),
  };
}

function girihPieceScale(resolved, points) {
  const dimensions = footprintDimensions(points);
  const transform = resolved?.transform || {};
  const sourceWidth = finite(resolved?.sourceWidthPx, dimensions.width);
  const sourceLength = finite(resolved?.sourceLengthPx, dimensions.height);
  const widthBase = sourceWidth > 0 ? sourceWidth : dimensions.width;
  const heightBase = sourceLength > 0 ? sourceLength : dimensions.height;
  const stageWidth = finite(transform.stageWidth ?? resolved?.stageWidth, 0);
  const stageLength = finite(transform.stageLength ?? resolved?.stageLength, 0);
  return {
    x: stageWidth > 0 ? stageWidth / widthBase : 1,
    y: stageLength > 0 ? stageLength / heightBase : (stageWidth > 0 ? stageWidth / widthBase : 1),
  };
}

function previewLocalBounds(group, includeObject = null) {
  group.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3();
  const inverseGroupWorld = group.matrixWorld.clone().invert();
  const relativeMatrix = new THREE.Matrix4();
  const objectBounds = new THREE.Box3();
  group.traverse((object) => {
    if (object === group || !object.geometry || object.visible === false) return;
    if (includeObject && !includeObject(object)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    if (materials.filter(Boolean).length && materials.filter(Boolean).every((material) => material.visible === false || material.opacity <= 0)) return;
    if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
    if (!object.geometry.boundingBox) return;
    relativeMatrix.multiplyMatrices(inverseGroupWorld, object.matrixWorld);
    objectBounds.copy(object.geometry.boundingBox).applyMatrix4(relativeMatrix);
    bounds.union(objectBounds);
  });
  return bounds;
}

export function previewWorldBounds(group, includeObject = null) {
  group.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3();
  const objectBounds = new THREE.Box3();
  group.traverse((object) => {
    if (object === group || !object.geometry || object.visible === false) return;
    if (includeObject && !includeObject(object)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    if (materials.filter(Boolean).length && materials.filter(Boolean).every((material) => material.visible === false || material.opacity <= 0)) return;
    if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
    if (!object.geometry.boundingBox) return;
    objectBounds.copy(object.geometry.boundingBox).applyMatrix4(object.matrixWorld);
    bounds.union(objectBounds);
  });
  return bounds;
}

export function normalizePreview(group, target = 1.8, fitAxis = 'max', includeObject = null) {
  const bounds = previewLocalBounds(group, includeObject);
  if (bounds.isEmpty()) return;
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const span = fitAxis === 'x'
    ? Math.max(size.x, 0.001)
    : Math.max(size.x, size.y, size.z, 0.001);
  const scale = target / span;
  group.userData.previewNormalization = {
    center: center.toArray(),
    scale,
  };
  group.children.forEach((child) => {
    child.position.sub(center).multiplyScalar(scale);
    child.scale.multiplyScalar(scale);
  });
}

function disposePreviewObject(object) {
  object.traverse((child) => {
    child.geometry?.dispose?.();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.filter(Boolean).forEach((material) => material.dispose?.());
  });
}

function bundledModuleUrl(libraryId) {
  const match = String(libraryId || '').match(/(?:bundled:|module-|^m)(\d+)$/i);
  const index = Number(match?.[1]);
  return index >= 1 && index <= 9 ? `/modules/M${index}.glb` : '';
}

function loadModuleSource(url) {
  if (!url) return Promise.resolve(null);
  if (!moduleSourceCache.has(url)) {
    moduleSourceCache.set(url, moduleLoader.loadAsync(url).then((gltf) => gltf.scene).catch(() => null));
  }
  return moduleSourceCache.get(url);
}

async function hydrateMuqarnasGeometry(payload, group, placementId) {
  const instances = Array.isArray(payload?.instances) ? payload.instances.slice(0, 1500) : [];
  const librarySources = new Map((Array.isArray(payload?.libraries) ? payload.libraries : []).map((item) => [
    item.id,
    item.dataUrl || item.glbDataUrl || item.url || '',
  ]));
  const normalization = group.userData.previewNormalization;
  if (!normalization || !instances.length) return;
  const center = new THREE.Vector3().fromArray(normalization.center);
  const previewScale = normalization.scale;

  await Promise.all(instances.map(async (instance) => {
    const url = librarySources.get(instance.libraryId) || bundledModuleUrl(instance.libraryId);
    const source = await loadModuleSource(url);
    if (!source || !group.parent) return;
    const model = source.clone(true);
    const transform = instance?.transform || {};
    model.position.fromArray(transform.position || [0, 0, 0]);
    model.rotation.set(...(transform.rotation || [0, 0, 0]).map(THREE.MathUtils.degToRad));
    model.scale.fromArray(transform.scale || [1, 1, 1]);
    model.position.sub(center).multiplyScalar(previewScale);
    model.scale.multiplyScalar(previewScale);
    model.userData.placementId = placementId;
    model.userData.placementRoot = group;
    model.userData.exactMuqarnasGeometry = true;
    model.traverse((child) => {
      child.userData.placementId = placementId;
      child.userData.placementRoot = group;
      child.userData.exactMuqarnasGeometry = true;
      if (!child.isMesh) return;
      child.userData.placementId = placementId;
      child.castShadow = true;
      child.receiveShadow = true;
    });
    applySolidMatteMaterials(model);
    const proxy = group.children.find((child) => child.userData.instanceId === instance.id);
    if (proxy) {
      group.remove(proxy);
      disposePreviewObject(proxy);
    }
    group.add(model);
  }));
  if (group.parent) {
    normalizePreview(group, 2.4, 'x', (object) => object.userData.exactMuqarnasGeometry === true);
    group.userData.onPreviewHydrated?.();
  }
}

function girihPreview(payload, group) {
  const flatPattern = payload?.mehrazFlatPattern;
  if (Array.isArray(flatPattern?.pieces) && flatPattern.pieces.length) {
    const bounds = flatPattern.bounds || {};
    const centerX = (finite(bounds.minX, 0) + finite(bounds.maxX, 0)) / 2;
    const centerY = (finite(bounds.minY, 0) + finite(bounds.maxY, 0)) / 2;
    flatPattern.pieces.slice(0, 3000).forEach((piece) => {
      const points = Array.isArray(piece.points) ? piece.points.map(pointPair) : [];
      if (points.length < 3) return;
      const shape = new THREE.Shape();
      shape.moveTo(points[0][0] - centerX, points[0][1] - centerY);
      points.slice(1).forEach(([x, y]) => shape.lineTo(x - centerX, y - centerY));
      shape.closePath();
      const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), makeFlatGirihMaterial(piece.color || '#2f7d86'));
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.renderOrder = 6;
      group.add(mesh);
    });
    return;
  }
  const pieces = Array.isArray(payload?.pieces) ? payload.pieces : [];
  const sources = new Map((Array.isArray(payload?.sources) ? payload.sources : []).map((source) => [
    source.sourceKey || source.sourceId || source.id,
    source,
  ]));
  (Array.isArray(payload?.sources) ? payload.sources : []).forEach((source) => {
    [source.sourceKey, source.sourceId, source.id].filter(Boolean).forEach((key) => sources.set(key, source));
  });
  const fallbackPolygons = [];
  pieces.slice(0, 2000).forEach((piece) => {
    const source = sources.get(piece.sourceKey || piece.sourceId) || {};
    const resolved = { ...source, ...piece };
    const points = Array.isArray(resolved?.points) ? resolved.points.map(pointPair) : [];
    if (points.length < 3 || resolved?.transform?.hidden) return;
    const footprintScale = girihPieceScale(resolved, points);
    const scaledPoints = points.map(([x, y]) => [
      x * footprintScale.x * (resolved?.transform?.mirrorHorizontal ? -1 : 1),
      y * footprintScale.y * (resolved?.transform?.mirrorVertical ? -1 : 1),
    ]);
    const rotation = -THREE.MathUtils.degToRad(finite(resolved?.transform?.rotation ?? resolved?.rotation));
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const offsetX = finite(resolved?.transform?.x ?? resolved?.x);
    const offsetY = finite(resolved?.transform?.y ?? resolved?.y);
    fallbackPolygons.push({
      color: resolved?.material?.color || resolved?.color || '#2f7d86',
      points: scaledPoints.map(([x, y]) => [
        x * cos - y * sin + offsetX,
        x * sin + y * cos + offsetY,
      ]),
    });
  });
  const allPoints = fallbackPolygons.flatMap((polygon) => polygon.points);
  if (!allPoints.length) return;
  const centerX = (Math.min(...allPoints.map(([x]) => x)) + Math.max(...allPoints.map(([x]) => x))) / 2;
  const centerY = (Math.min(...allPoints.map(([, y]) => y)) + Math.max(...allPoints.map(([, y]) => y))) / 2;
  fallbackPolygons.forEach((polygon) => {
    const shape = new THREE.Shape();
    shape.moveTo(polygon.points[0][0] - centerX, polygon.points[0][1] - centerY);
    polygon.points.slice(1).forEach(([x, y]) => shape.lineTo(x - centerX, y - centerY));
    shape.closePath();
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), makeFlatGirihMaterial(polygon.color));
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.renderOrder = 6;
    group.add(mesh);
  });
}

function brickPreview(payload, group) {
  const pattern = payload?.pattern || {};
  const bricks = Array.isArray(pattern.bricks) ? pattern.bricks : [];
  const columns = Math.max(1, finite(pattern.columns, Math.max(...bricks.map((brick) => finite(brick.x) + finite(brick.width, 1)), 1)));
  const rows = Math.max(1, finite(pattern.rows, Math.max(...bricks.map((brick) => finite(brick.y) + finite(brick.height, 1)), 1)));
  const rawMortar = typeof payload?.mortar === 'object' ? finite(payload.mortar.width, 0.04) : finite(payload?.mortar, 0.04);
  const mortar = Math.max(0.01, Math.min(0.2, rawMortar * 0.04));
  bricks.slice(0, 4096).forEach((brick) => {
    const width = Math.max(0.05, finite(brick.width, 1) - mortar);
    const height = Math.max(0.05, finite(brick.height, 1) - mortar);
    const mesh = box(width, height, 0.055, makeMaterial(brick.color || '#b85f3d', 0.7), [
      finite(brick.x) + finite(brick.width, 1) / 2 - columns / 2,
      finite(brick.y) + finite(brick.height, 1) / 2 - rows / 2,
      0,
    ]);
    group.add(mesh);
  });
  normalizePreview(group, 2.2);
}

function girihPatternPolygons(payload) {
  const flatPattern = payload?.mehrazFlatPattern;
  if (Array.isArray(flatPattern?.pieces) && flatPattern.pieces.length) {
    return flatPattern.pieces
      .map((piece) => ({
        color: piece.color || '#2f7d86',
        points: (Array.isArray(piece.points) ? piece.points : []).map(pointPair),
      }))
      .filter((piece) => piece.points.length >= 3);
  }
  const pieces = Array.isArray(payload?.pieces) ? payload.pieces : [];
  const sources = new Map((Array.isArray(payload?.sources) ? payload.sources : []).map((source) => [
    source.sourceKey || source.sourceId || source.id,
    source,
  ]));
  (Array.isArray(payload?.sources) ? payload.sources : []).forEach((source) => {
    [source.sourceKey, source.sourceId, source.id].filter(Boolean).forEach((key) => sources.set(key, source));
  });
  return pieces.slice(0, 3000).map((piece) => {
    const source = sources.get(piece.sourceKey || piece.sourceId) || {};
    const resolved = { ...source, ...piece };
    const points = Array.isArray(resolved?.points) ? resolved.points.map(pointPair) : [];
    if (points.length < 3 || resolved?.transform?.hidden) return null;
    const footprintScale = girihPieceScale(resolved, points);
    const scaledPoints = points.map(([x, y]) => [
      x * footprintScale.x * (resolved?.transform?.mirrorHorizontal ? -1 : 1),
      y * footprintScale.y * (resolved?.transform?.mirrorVertical ? -1 : 1),
    ]);
    const rotation = -THREE.MathUtils.degToRad(finite(resolved?.transform?.rotation ?? resolved?.rotation));
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const offsetX = finite(resolved?.transform?.x ?? resolved?.x);
    const offsetY = finite(resolved?.transform?.y ?? resolved?.y);
    return {
      color: resolved?.material?.color || resolved?.color || '#2f7d86',
      points: scaledPoints.map(([x, y]) => [
        x * cos - y * sin + offsetX,
        x * sin + y * cos + offsetY,
      ]),
    };
  }).filter(Boolean);
}

export function zonePatternMapTransform(zone, bounds, unitWidth, unitHeight) {
  const width = Math.max(0.001, finite(bounds?.width, 1));
  const height = Math.max(0.001, finite(bounds?.height, 1));
  const safeUnitWidth = Math.max(0.001, finite(unitWidth, 1));
  const safeUnitHeight = Math.max(0.001, finite(unitHeight, 1));
  const fitScale = Math.min(1, width / safeUnitWidth, height / safeUnitHeight);
  const userScale = Math.max(0.05, Math.min(20, finite(zone?.patternScale, 1)));
  const tileWidth = Math.max(0.001, safeUnitWidth * fitScale * userScale);
  const tileHeight = Math.max(0.001, safeUnitHeight * fitScale * userScale);
  return {
    userScale,
    tileWidth,
    tileHeight,
    repeat: [width / tileWidth, height / tileHeight],
    offset: [finite(zone?.patternOffsetU) / tileWidth, finite(zone?.patternOffsetV) / tileHeight],
  };
}

function zonePatternTexture(zone) {
  const payload = zone?.assetPayload || {};
  const assetType = zone?.assetType;
  const unit = zone?.assetUnit || {};
  const unitWidth = Math.max(0.05, finite(unit.width, 2));
  const unitHeight = Math.max(0.05, finite(unit.height, 2));
  const aspect = Math.max(0.08, Math.min(12, unitHeight / unitWidth));
  const widthPx = 1024;
  const heightPx = Math.max(128, Math.min(2048, Math.round(widthPx * aspect)));
  const canvas = document.createElement('canvas');
  canvas.width = widthPx;
  canvas.height = heightPx;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.clearRect(0, 0, widthPx, heightPx);

  if (assetType === 'brick_bond' && Array.isArray(payload?.pattern?.bricks)) {
    const pattern = payload.pattern || {};
    const bricks = pattern.bricks;
    const columns = Math.max(1, finite(pattern.columns, Math.max(...bricks.map((brick) => finite(brick.x) + finite(brick.width, 1)), 1)));
    const rows = Math.max(1, finite(pattern.rows, Math.max(...bricks.map((brick) => finite(brick.y) + finite(brick.height, 1)), 1)));
    const mortar = typeof payload?.mortar === 'object' ? payload.mortar : {};
    context.fillStyle = mortar.color || '#111111';
    context.fillRect(0, 0, widthPx, heightPx);
    const gap = Math.max(1, Math.min(10, finite(mortar.width, 0.02) * 120));
    bricks.forEach((brick) => {
      const x = finite(brick.x) / columns * widthPx;
      const y = heightPx - (finite(brick.y) + finite(brick.height, 1)) / rows * heightPx;
      const brickWidth = finite(brick.width, 1) / columns * widthPx;
      const brickHeight = finite(brick.height, 1) / rows * heightPx;
      context.fillStyle = brick.color || '#b88446';
      context.fillRect(x + gap / 2, y + gap / 2, Math.max(1, brickWidth - gap), Math.max(1, brickHeight - gap));
    });
  } else if (assetType === 'girih_pattern') {
    const polygons = girihPatternPolygons(payload);
    const allPoints = polygons.flatMap((polygon) => polygon.points);
    if (!allPoints.length) return null;
    const minX = Math.min(...allPoints.map(([x]) => x));
    const maxX = Math.max(...allPoints.map(([x]) => x));
    const minY = Math.min(...allPoints.map(([, y]) => y));
    const maxY = Math.max(...allPoints.map(([, y]) => y));
    const spanX = Math.max(0.001, maxX - minX);
    const spanY = Math.max(0.001, maxY - minY);
    polygons.forEach((polygon) => {
      context.beginPath();
      polygon.points.forEach(([x, y], index) => {
        const px = (x - minX) / spanX * widthPx;
        const py = heightPx - (y - minY) / spanY * heightPx;
        if (index === 0) context.moveTo(px, py);
        else context.lineTo(px, py);
      });
      context.closePath();
      context.fillStyle = polygon.color || '#2f7d86';
      context.fill();
    });
  } else {
    return null;
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return { texture, unitWidth, unitHeight };
}

function muqarnasPreview(payload, group, placementId) {
  const instances = Array.isArray(payload?.instances) ? payload.instances : [];
  const levels = new Map((Array.isArray(payload?.levels) ? payload.levels : []).map((level) => [level.id, finite(level.height)]));
  const materialByLibrary = payload?.appearances || {};
  instances.slice(0, 1500).forEach((instance) => {
    const transform = instance?.transform || {};
    const color = materialByLibrary?.[instance.libraryId]?.color || payload?.moduleColor || '#d0a21f';
    const module = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      makeMaterial(color, 0.52),
    );
    module.position.fromArray(transform.position || [0, levels.get(instance.levelId) || 0, 0]);
    module.rotation.set(...(transform.rotation || [0, 0, 0]).map(THREE.MathUtils.degToRad));
    module.scale.fromArray(transform.scale || [1, 1, 1]);
    module.castShadow = true;
    module.receiveShadow = true;
    module.userData.instanceId = instance.id;
    group.add(module);
  });
  if (!instances.length) {
    [[-0.34, 0.1], [0.34, 0.1], [0, 0.48], [-0.34, 0.82], [0.34, 0.82]].forEach(([x, y]) => {
      const cell = new THREE.Mesh(
        new THREE.SphereGeometry(0.28, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2),
        makeMaterial('#d0a21f', 0.52),
      );
      cell.position.set(x, y, 0);
      cell.castShadow = true;
      group.add(cell);
    });
  }
  normalizePreview(group, 2.4, 'x');
  hydrateMuqarnasGeometry(payload, group, placementId);
}

function stickerPreview(payload, group) {
  const width = Math.max(0.05, finite(payload?.width, 1));
  const height = Math.max(0.05, finite(payload?.height, 1));
  const material = new THREE.MeshStandardMaterial({
    color: payload?.color || '#ffffff',
    transparent: true,
    opacity: 0.92,
    roughness: 0.42,
    side: THREE.DoubleSide,
  });
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  panel.castShadow = true;
  group.add(panel);
  normalizePreview(group, 2.2);
}

function placementPreview(placement) {
  const group = new THREE.Group();
  group.userData.placementId = placement.id;
  group.userData.assetType = placement.assetType;
  group.userData.surfaceId = placement.surfaceId;
  const payload = placement.assetPayload || {};
  if (placement.assetType === 'girih_pattern' && Array.isArray(payload.pieces)) girihPreview(payload, group);
  else if (placement.assetType === 'brick_bond' && Array.isArray(payload?.pattern?.bricks)) brickPreview(payload, group);
  else if (placement.assetType === 'muqarnas_assembly') muqarnasPreview(payload, group, placement.id);
  else if (placement.assetType === 'surface_sticker') stickerPreview(payload, group);
  if (!group.children.length) {
    const color = assetColor(placement.assetType);
    const material = makeMaterial(color, 0.4);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 0.07), material);
    panel.castShadow = true;
    panel.receiveShadow = true;
    group.add(panel);
    const edge = new THREE.LineSegments(
      new THREE.EdgesGeometry(panel.geometry),
      new THREE.LineBasicMaterial({ color: '#fff7df' }),
    );
    panel.add(edge);
  }
  group.traverse((child) => {
    child.userData.placementId = placement.id;
    child.userData.placementRoot = group;
    child.userData.assetType = placement.assetType;
    child.userData.surfaceId = placement.surfaceId;
  });
  applySolidMatteMaterials(group);
  return group;
}

function projectInstancePreview(instance, depth = 0) {
  const root = new THREE.Group();
  root.name = instance.name || 'Added Mehraz project';
  root.userData.projectInstanceId = instance.id;
  root.userData.projectAssetId = instance.assetId || null;
  root.userData.projectVersionId = instance.versionId || null;
  root.userData.isProjectInstance = true;
  const payload = instance.payload || {};
  const building = normalizeBuilding(payload.building || {});
  const walls = normalizeWallSystem(payload.walls || {}, building);
  const westX = -building.width / 2 - (walls.sideOffsets?.west || 0);
  const eastX = building.width / 2 + (walls.sideOffsets?.east || 0);
  const northZ = -building.depth / 2 - (walls.sideOffsets?.north || 0);
  const southZ = building.depth / 2 + (walls.sideOffsets?.south || 0);
  root.userData.sectionCenterX = (westX + eastX) / 2;
  root.userData.sectionCenterZ = (northZ + southZ) / 2;
  const wallSystem = buildWallSystem(building, walls, Array.isArray(payload.zones) ? payload.zones : []);
  root.add(wallSystem);
  (Array.isArray(payload.placements) ? payload.placements : []).forEach((placement) => {
    if (!placement || placement.generatedFromZone) return;
    const preview = placementPreview(placement);
    const baseTransform = placement.transform || defaultPlacementTransform(placement.surfaceId, building, walls);
    const transform = placement.options?.constrain === false
      ? baseTransform
      : constrainPlacementTransform(baseTransform, placement.surfaceId, building, placement.options, walls);
    preview.position.fromArray(transform.position || [0, 0, 0]);
    preview.rotation.set(...(transform.rotation || [0, 0, 0]).map(THREE.MathUtils.degToRad));
    preview.scale.fromArray(transform.scale || [1, 1, 1]);
    preview.userData.placementId = null;
    preview.userData.projectInstanceMember = true;
    root.add(preview);
  });
  (Array.isArray(payload.zones) ? payload.zones : []).forEach((zone) => {
    const world = zoneWorldTransform(zone, building, walls);
    const pattern = zonePatternTexture(zone);
    if (pattern) {
      const mapTransform = zonePatternMapTransform(zone, world.bounds, pattern.unitWidth, pattern.unitHeight);
      pattern.texture.repeat.fromArray(mapTransform.repeat);
      pattern.texture.offset.fromArray(mapTransform.offset);
      const decoration = new THREE.Mesh(
        new THREE.PlaneGeometry(world.bounds.width, world.bounds.height),
        new THREE.MeshStandardMaterial({
          map: pattern.texture,
          color: '#ffffff',
          roughness: 0.84,
          metalness: 0,
          alphaTest: zone.assetType === 'girih_pattern' ? 0.01 : 0,
          side: THREE.FrontSide,
        }),
      );
      decoration.position.fromArray(world.position);
      decoration.rotation.set(...world.rotation.map(THREE.MathUtils.degToRad));
      decoration.translateZ(0.002);
      decoration.userData.projectInstanceMember = true;
      root.add(decoration);
    }
    const soldiers = zoneSoldierCourses(zone, world, walls);
    if (soldiers) {
      soldiers.userData.projectInstanceMember = true;
      root.add(soldiers);
    }
  });
  if (depth < 4) {
    (Array.isArray(payload.projectInstances) ? payload.projectInstances : []).forEach((childInstance) => {
      if (!childInstance?.payload) return;
      const child = projectInstancePreview(childInstance, depth + 1);
      const childTransform = childInstance.transform || {};
      child.position.fromArray(childTransform.position || [0, 0, 0]);
      child.rotation.set(...(childTransform.rotation || [0, 0, 0]).map(THREE.MathUtils.degToRad));
      child.scale.fromArray(childTransform.scale || [1, 1, 1]);
      child.userData.projectInstanceId = null;
      child.userData.projectInstanceMember = true;
      root.add(child);
    });
  }
  return root;
}

function zoneClipPlanes(clip = {}) {
  const bounds = clip.bounds || {};
  const u = finite(bounds.u);
  const v = finite(bounds.v);
  const width = Math.max(0.001, finite(bounds.width, 1));
  const height = Math.max(0.001, finite(bounds.height, 1));
  const minU = u - width / 2;
  const maxU = u + width / 2;
  const minV = v - height / 2;
  const maxV = v + height / 2;
  if (clip.surfaceId === 'east_interior' || clip.surfaceId === 'west_interior') {
    return [
      new THREE.Plane(new THREE.Vector3(0, 0, 1), -minU),
      new THREE.Plane(new THREE.Vector3(0, 0, -1), maxU),
      new THREE.Plane(new THREE.Vector3(0, 1, 0), -minV),
      new THREE.Plane(new THREE.Vector3(0, -1, 0), maxV),
    ];
  }
  if (clip.surfaceId === 'floor') {
    return [
      new THREE.Plane(new THREE.Vector3(1, 0, 0), -minU),
      new THREE.Plane(new THREE.Vector3(-1, 0, 0), maxU),
      new THREE.Plane(new THREE.Vector3(0, 0, 1), -minV),
      new THREE.Plane(new THREE.Vector3(0, 0, -1), maxV),
    ];
  }
  return [
    new THREE.Plane(new THREE.Vector3(1, 0, 0), -minU),
    new THREE.Plane(new THREE.Vector3(-1, 0, 0), maxU),
    new THREE.Plane(new THREE.Vector3(0, 1, 0), -minV),
    new THREE.Plane(new THREE.Vector3(0, -1, 0), maxV),
  ];
}

function applyZoneClip(root, clip) {
  if (!root || !clip?.bounds) return;
  const planes = zoneClipPlanes(clip);
  root.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    const sourceMaterials = Array.isArray(child.material) ? child.material : [child.material];
    const clipped = sourceMaterials.map((material) => {
      const next = material.clone();
      next.clippingPlanes = planes;
      next.clipIntersection = false;
      next.needsUpdate = true;
      return next;
    });
    child.material = Array.isArray(child.material) ? clipped : clipped[0];
  });
}

function snapValue(value, grid) {
  return grid > 0 ? Math.round(value / grid) * grid : value;
}

function wallSurfaceFrame(surfaceId, building, wallValue = null) {
  const b = normalizeBuilding(building);
  const walls = normalizeWallSystem(wallValue || {}, b);
  const thickness = Math.max(0.1, Number(b.wallThickness) || 0.4);
  const halfWidth = Math.max(1, Number(b.width) / 2);
  const halfDepth = Math.max(1, Number(b.depth) / 2);
  const westX = -halfWidth - walls.sideOffsets.west;
  const eastX = halfWidth + walls.sideOffsets.east;
  const northZ = -halfDepth - walls.sideOffsets.north;
  const southZ = halfDepth + walls.sideOffsets.south;
  const width = eastX - westX;
  const depth = southZ - northZ;
  const sideWallDepth = depth + thickness;
  const sideWallCenterZ = (northZ + southZ + thickness) / 2;
  const heightFor = (side) => Math.max(0.05, Number(b.height) + Number(walls.extraHeights?.[side] || 0));
  const wallHeight = (side) => {
    if (side !== 'north') return heightFor(side);
    return Math.max(
      heightFor('north'),
      walls.northWall?.minHeight || 0,
      Number(b.height) + Number(walls.extraHeights?.north || 0),
    );
  };
  const northOuterFaceZ = northZ - thickness;
  const northRecessDepth = walls.northBoundary?.enabled
    ? Math.min(thickness - 0.02, walls.northBoundary.depth)
    : 0;
  const northDecorativeFaceZ = northOuterFaceZ + northRecessDepth;
  if (surfaceId === 'north_interior') return {
    axis: 'x',
    min: westX - thickness - (walls.northWall?.outwardWidth || 0),
    max: eastX + thickness + (walls.northWall?.outwardWidth || 0),
    height: wallHeight('north'),
    position: [0, 0, northDecorativeFaceZ],
    rotationY: 180,
  };
  if (surfaceId === 'east_interior') return {
    axis: 'z',
    min: sideWallCenterZ - sideWallDepth / 2,
    max: sideWallCenterZ + sideWallDepth / 2,
    height: heightFor('east'),
    position: [eastX, 0, 0],
    rotationY: -90,
  };
  if (surfaceId === 'west_interior') return {
    axis: 'z',
    min: sideWallCenterZ - sideWallDepth / 2,
    max: sideWallCenterZ + sideWallDepth / 2,
    height: heightFor('west'),
    position: [westX, 0, 0],
    rotationY: 90,
  };
  if (surfaceId === 'south_interior') return {
    axis: 'x',
    min: westX - thickness,
    max: eastX + thickness,
    height: heightFor('south'),
    position: [0, 0, southZ],
    rotationY: 180,
  };
  if (surfaceId === 'south_facade') return {
    axis: 'x',
    min: westX - thickness,
    max: eastX + thickness,
    height: heightFor('south'),
    position: [0, 0, southZ + thickness],
    rotationY: 0,
  };
  return {
    axis: 'floor',
    minX: westX,
    maxX: eastX,
    minZ: northZ,
    maxZ: southZ,
    height: b.height,
    position: [0, 0, 0],
    rotationY: 0,
  };
}

export function defaultZoneBounds(surfaceId, building, wallValue = null) {
  const b = normalizeBuilding(building);
  const frame = wallSurfaceFrame(surfaceId, b, wallValue);
  if (frame.axis === 'floor') {
    return {
      u: (frame.minX + frame.maxX) / 2,
      v: (frame.minZ + frame.maxZ) / 2,
      width: Math.max(0.2, frame.maxX - frame.minX),
      height: Math.min(3, Math.max(0.2, frame.maxZ - frame.minZ)),
    };
  }
  const walls = normalizeWallSystem(wallValue || {}, b);
  const brickStep = zoneBrickHeightStep(walls);
  const availableHeight = Math.max(brickStep, Math.min(3, frame.height));
  const courseCount = Math.max(1, Math.floor((availableHeight + 1e-9) / brickStep));
  const alignedHeight = courseCount * brickStep;
  const centeredBottom = (frame.height - alignedHeight) / 2;
  const highestAlignedBottom = Math.max(0, Math.floor((frame.height - alignedHeight + 1e-9) / brickStep) * brickStep);
  const alignedBottom = Math.max(0, Math.min(highestAlignedBottom, Math.round(centeredBottom / brickStep) * brickStep));
  const verticalBounds = {
    v: alignedBottom + alignedHeight / 2,
    height: alignedHeight,
  };
  if (['south_interior', 'south_facade', 'east_interior', 'west_interior'].includes(surfaceId)) {
    const westX = -b.width / 2 - walls.sideOffsets.west;
    const eastX = b.width / 2 + walls.sideOffsets.east;
    const northZ = -b.depth / 2 - walls.sideOffsets.north;
    const southZ = b.depth / 2 + walls.sideOffsets.south;
    const sideWall = surfaceId === 'east_interior' || surfaceId === 'west_interior';
    return {
      u: sideWall ? (northZ + southZ) / 2 : (westX + eastX) / 2,
      v: verticalBounds.v,
      width: Math.max(0.2, sideWall ? southZ - northZ : eastX - westX),
      height: verticalBounds.height,
    };
  }
  return {
    u: (frame.min + frame.max) / 2,
    v: verticalBounds.v,
    width: Math.max(0.2, frame.max - frame.min),
    height: verticalBounds.height,
  };
}

export function zoneBrickHeightStep(wallValue = null) {
  return Math.max(0.01, finite(wallValue?.bricks?.brickHeight, 0.08));
}

function roundedCourseValue(value) {
  return Math.round(value * 1000000) / 1000000;
}

export function resizeZoneHeightByBrick(bounds, requestedHeight, wallValue = null) {
  const step = zoneBrickHeightStep(wallValue);
  const currentHeight = Math.max(step, finite(bounds?.height, step));
  const bottom = Math.round((finite(bounds?.v) - currentHeight / 2) / step) * step;
  const height = Math.max(step, Math.round(Math.max(step, finite(requestedHeight, currentHeight)) / step) * step);
  return {
    ...bounds,
    v: roundedCourseValue(bottom + height / 2),
    height: roundedCourseValue(height),
  };
}

export function moveZoneVerticallyByBrick(bounds, requestedCenter, wallValue = null) {
  const step = zoneBrickHeightStep(wallValue);
  const height = Math.max(step, Math.round(Math.max(step, finite(bounds?.height, step)) / step) * step);
  const bottom = Math.round((finite(requestedCenter, finite(bounds?.v)) - height / 2) / step) * step;
  return {
    ...bounds,
    v: roundedCourseValue(bottom + height / 2),
    height: roundedCourseValue(height),
  };
}

export function constrainPlacementTransform(transform, surfaceId, building, options = {}, wallValue = null) {
  const b = normalizeBuilding(building);
  const frame = wallSurfaceFrame(surfaceId, b, wallValue);
  const grid = Math.max(0, finite(options.snap, 0));
  const margin = 0.08;
  const next = {
    position: [...(transform?.position || [0, 0, 0])],
    rotation: [...(transform?.rotation || [0, 0, 0])],
    scale: [...(transform?.scale || [1, 1, 1])],
  };
  const clamp = (value, min, max) => Math.max(min, Math.min(max, snapValue(finite(value), grid)));
  if (surfaceId === 'north_interior') {
    next.position[0] = clamp(next.position[0], frame.min + margin, frame.max - margin);
    next.position[1] = clamp(next.position[1], margin, frame.height - margin);
    next.position[2] = frame.position[2];
    next.rotation[1] = 0;
  } else if (surfaceId === 'east_interior') {
    next.position[0] = frame.position[0];
    next.position[1] = clamp(next.position[1], margin, frame.height - margin);
    next.position[2] = clamp(next.position[2], frame.min + margin, frame.max - margin);
    next.rotation[1] = -90;
  } else if (surfaceId === 'west_interior') {
    next.position[0] = frame.position[0];
    next.position[1] = clamp(next.position[1], margin, frame.height - margin);
    next.position[2] = clamp(next.position[2], frame.min + margin, frame.max - margin);
    next.rotation[1] = 90;
  } else if (surfaceId === 'south_interior') {
    next.position[0] = clamp(next.position[0], frame.min + margin, frame.max - margin);
    next.position[1] = clamp(next.position[1], margin, frame.height - margin);
    next.position[2] = frame.position[2];
    next.rotation[1] = 180;
  } else if (surfaceId === 'south_facade') {
    next.position[0] = clamp(next.position[0], frame.min + margin, frame.max - margin);
    next.position[1] = clamp(next.position[1], margin, frame.height - margin);
    next.position[2] = frame.position[2];
    next.rotation[1] = 0;
  } else {
    next.position[0] = clamp(next.position[0], frame.minX + margin, frame.maxX - margin);
    next.position[1] = 0.08;
    next.position[2] = clamp(next.position[2], frame.minZ + margin, frame.maxZ - margin);
    next.rotation[0] = -90;
  }
  return next;
}

export function fitPlacementTransform(surfaceId, building, currentTransform = null, wallValue = null) {
  const b = normalizeBuilding(building);
  const frame = wallSurfaceFrame(surfaceId, b, wallValue);
  const wallWidth = frame.axis === 'z' ? frame.max - frame.min : frame.axis === 'x' ? frame.max - frame.min : b.width;
  const availableWidth = Math.max(0.5, wallWidth - b.wallThickness * 2 - 0.3);
  const availableHeight = surfaceId === 'floor' ? Math.max(0.5, b.depth - 0.3) : Math.max(0.5, frame.height - 0.3);
  const scale = Math.max(0.1, Math.min(availableWidth / 2.2, availableHeight / 2.2));
  const centered = defaultPlacementTransform(surfaceId, b, wallValue);
  return constrainPlacementTransform({
    ...centered,
    rotation: [...(currentTransform?.rotation || centered.rotation)],
    scale: [scale, scale, scale],
  }, surfaceId, b, {}, wallValue);
}

export function zoneWorldTransform(zone, building, wallValue = null) {
  const b = normalizeBuilding(building);
  const walls = normalizeWallSystem(wallValue || zone?.walls || {}, b);
  const bounds = {
    u: finite(zone?.bounds?.u),
    v: Math.max(0.05, finite(zone?.bounds?.v, b.height * 0.5)),
    width: Math.max(0.2, finite(zone?.bounds?.width, 2.5)),
    height: Math.max(0.2, finite(zone?.bounds?.height, 2.5)),
  };
  // Older iwan projects stored wall zones as south_facade. Zones are interior
  // finishes, so render those legacy records on the south wall's inner face too.
  const surfaceId = zone?.surfaceId === 'south_facade'
    ? 'south_interior'
    : zone?.surfaceId || 'north_interior';
  const frame = wallSurfaceFrame(surfaceId, b, walls);
  // Zones belong on top of the visible finish. A custom wall bond is rendered
  // as a real decorative skin in front of the structural face, while gypsum is
  // a deeper interior finish. Use the outermost active finish instead of a
  // polygon depth override, which could make zones leak through return walls.
  const wallSide = wallSideForSurfaceId(surfaceId, b);
  const sideBond = wallSide ? walls.bricks?.sideBonds?.[wallSide] : null;
  const hasDecorativeBond = walls.bricks?.enabled !== false
    && sideBond
    && (sideBond.source === 'library' || (sideBond.builtIn || 'running') !== 'running');
  const decorativeBondOffset = hasDecorativeBond
    ? (surfaceId === 'north_interior' ? 0.007 : 0.016)
    : 0;
  // North is intentionally excluded because the portal's north wall has no gypsum.
  const gypsumOffset = walls.interiorGypsum?.enabled === true
    && ['east_interior', 'west_interior', 'south_interior'].includes(surfaceId)
    ? 0.021
    : 0;
  const finishOffset = Math.max(decorativeBondOffset, gypsumOffset);
  const rotationY = THREE.MathUtils.degToRad(frame.rotationY);
  const finishX = Math.sin(rotationY) * finishOffset;
  const finishZ = Math.cos(rotationY) * finishOffset;
  if (surfaceId === 'north_interior') return { position: [bounds.u + finishX, bounds.v, frame.position[2] + finishZ], rotation: [0, frame.rotationY, 0], bounds };
  if (surfaceId === 'east_interior' || surfaceId === 'west_interior') return { position: [frame.position[0] + finishX, bounds.v, bounds.u + finishZ], rotation: [0, frame.rotationY, 0], bounds };
  if (surfaceId === 'south_interior' || surfaceId === 'south_facade') return { position: [bounds.u + finishX, bounds.v, frame.position[2] + finishZ], rotation: [0, frame.rotationY, 0], bounds };
  return { position: [bounds.u, frame.position[1], bounds.v], rotation: [-90, 0, 0], bounds };
}

export function fitPlacementToZone(zone, building, currentTransform = null) {
  const world = zoneWorldTransform(zone, building);
  const scale = Math.max(0.1, Math.min(world.bounds.width / 2.2, world.bounds.height / 2.2));
  return constrainPlacementTransform({
    position: world.position,
    rotation: [...(currentTransform?.rotation || world.rotation)],
    scale: [scale, scale, scale],
  }, zone.surfaceId, building);
}

export function defaultPlacementTransform(surfaceId, building, wallValue = null) {
  const b = normalizeBuilding(building);
  const frame = wallSurfaceFrame(surfaceId, b, wallValue);
  const y = Math.min(frame.height * 0.55, frame.height - 1);
  if (surfaceId === 'north_interior') return { position: [0, y, frame.position[2]], rotation: [0, 0, 0], scale: [1, 1, 1] };
  if (surfaceId === 'east_interior') return { position: [frame.position[0], y, (frame.min + frame.max) / 2], rotation: [0, -90, 0], scale: [1, 1, 1] };
  if (surfaceId === 'west_interior') return { position: [frame.position[0], y, (frame.min + frame.max) / 2], rotation: [0, 90, 0], scale: [1, 1, 1] };
  if (surfaceId === 'south_interior') return { position: [0, y, frame.position[2]], rotation: [0, 180, 0], scale: [1, 1, 1] };
  if (surfaceId === 'south_facade') return { position: [0, y, frame.position[2]], rotation: [0, 0, 0], scale: [1, 1, 1] };
  return { position: [0, 0.12, 0], rotation: [-90, 0, 0], scale: [1, 1, 1] };
}

export function zoneSoldierCourses(zone, world, walls) {
  if (zone?.soldierCourses !== true || zone.surfaceId === 'floor' || walls.bricks?.enabled === false) return null;
  const mortar = Math.max(0.001, finite(walls.bricks?.mortar, 0.01));
  // Match the wall bond's actual brick module. The previous subtraction made
  // every joint twice as wide, which was especially obvious on east/west walls.
  const soldierHeight = Math.min(
    world.bounds.height / 2,
    Math.max(0.05, finite(walls.bricks?.brickWidth, 0.15)),
  );
  const brickShort = Math.max(0.025, finite(walls.bricks?.brickHeight, 0.08));
  const count = Math.max(1, Math.floor((world.bounds.width + mortar) / (brickShort + mortar)));
  const projection = Math.max(0.018, Math.min(0.06, finite(walls.northBoundary?.depth, 0.03)));
  const courseAxis = ['east_interior', 'west_interior'].includes(zone.surfaceId) ? 'z' : 'x';
  const wallSide = zone.wallSide || wallSideForSurfaceId(zone.surfaceId) || 'south';
  const courseMaterial = raisedBorderMaterial(
    walls,
    wallSide,
    world.bounds.width,
    soldierHeight,
    'horizontal',
    null,
    courseAxis,
  );
  const courseGeometry = new THREE.BoxGeometry(world.bounds.width, soldierHeight, projection);
  const edgeY = world.bounds.height / 2 + soldierHeight / 2 + mortar;
  const group = new THREE.Group();
  [-edgeY, edgeY].forEach((y) => {
    const course = new THREE.Mesh(courseGeometry, courseMaterial);
    course.position.set(0, y, projection / 2 + 0.001);
    course.castShadow = walls.shadows;
    course.receiveShadow = walls.shadows;
    course.renderOrder = 36;
    course.userData.zoneId = zone.id;
    course.userData.surfaceId = zone.surfaceId;
    course.userData.isZoneDecoration = true;
    course.userData.isZoneSoldierCourse = true;
    course.userData.isRaisedOpeningStyleCourse = true;
    group.add(course);
  });
  group.position.fromArray(world.position);
  group.rotation.set(...world.rotation.map(THREE.MathUtils.degToRad));
  group.userData.zoneId = zone.id;
  group.userData.surfaceId = zone.surfaceId;
  group.userData.isZoneDecoration = true;
  group.userData.isZoneSoldierCourse = true;
  group.userData.zoneSoldierCourseRows = 2;
  group.userData.zoneSoldierBrickCountPerRow = count;
  group.userData.zoneSoldierInnerClearance = mortar;
  group.userData.zoneSoldierCourseAxis = courseAxis;
  return group;
}

export class MehrazScene {
  constructor(container, callbacks = {}) {
    this.container = container;
    this.callbacks = callbacks;
    // Callers restoring a project can provide its architecture up front. This
    // avoids synchronously constructing and discarding the large default Iwan
    // before the requested Room scene is built.
    this.building = normalizeBuilding(callbacks.initialBuilding);
    this.walls = normalizeWallSystem(callbacks.initialWalls || {}, this.building);
    this.stageRenderMode = callbacks.initialStageRenderMode === 'flat' ? 'flat' : 'textured';
    this.nightLights = [];
    this.selectedNightLightId = null;
    this.nightPreview = false;
    this.nightLightGuidesVisible = false;
    this.nightLightObjects = new Map();
    this.nightLightDrag = null;
    this.constructionStepIndex = CONSTRUCTION_STEPS.length - 1;
    this.constructionStepProgress = 1;
    this.constructionMaterialsActive = false;
    this.setConstructionStepOrder();
    this.constructionTimer = null;
    this.constructionAnimationFrame = null;
    this.constructionWatchdog = null;
    this.constructionRunId = 0;
    this.constructionGuideKey = null;
    this.constructionTierCache = new WeakMap();
    this.transformHandleActive = false;
    this.placements = [];
    this.projectInstances = [];
    this.zones = [];
    this.selectedId = null;
    this.selectedProjectInstanceId = null;
    this.selectedZoneId = null;
    this.selectedWallSide = null;
    this.selectedWallFace = null;
    this.selectedOpeningGuide = null;
    this.selectedKarbandiRibIndex = null;
    this.karbandiReferenceEditing = false;
    this.karbandiRibArchEditing = false;
    this.squinchArchEditing = false;
    this.northArchEditing = false;
    this.roomDomeArchEditing = false;
    this.wallSurfaceHighlight = null;
    this.sectionViewEnabled = false;
    this.sectionViewAxis = 'x';
    this.sectionViewCameraState = null;
    this.sectionMaterialClipping = new Map();
    this.sectionClipPlane = null;
    this.sectionCapGroup = new THREE.Group();
    this.sectionCapGroup.name = 'Room section cut faces';
    this.constructionCapGroup = new THREE.Group();
    this.constructionCapGroup.name = 'Solid construction reveal caps';
    this.constructionCapCache = new WeakMap();
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#cfe7f2');
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.05, 160);
    // Look at the iwan from the portal/front side by default.  Keep the model
    // coordinates unchanged so north/south wall logic, library placements, and
    // saved projects remain stable.
    this.camera.position.set(-11, 8, -13);
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.shadowMapDirty = true;
    this.renderer.localClippingEnabled = true;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.domElement.className = 'mehraz-canvas';
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.target.set(0, 2.5, 0);
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.minDistance = 3;
    this.controls.maxDistance = 55;
    this.controls.addEventListener('change', () => this.invalidate());
    this.transformControls = new TransformControls(this.camera, this.renderer.domElement);
    this.transformControls.setMode('translate');
    this.transformControls.setSize(0.78);
    this.transformHelper = this.transformControls.getHelper();
    this.scene.add(this.transformHelper);
    this.transformControls.addEventListener('dragging-changed', (event) => {
      this.controls.enabled = !event.value;
      this.invalidate();
    });
    this.transformControls.addEventListener('objectChange', () => this.invalidate(true));
    this.transformControls.addEventListener('mouseUp', () => {
      const object = this.transformControls.object;
      if (!object) return;
      const transform = {
        position: object.position.toArray(),
        rotation: [
          THREE.MathUtils.radToDeg(object.rotation.x),
          THREE.MathUtils.radToDeg(object.rotation.y),
          THREE.MathUtils.radToDeg(object.rotation.z),
        ],
        scale: object.scale.toArray(),
      };
      if (object?.userData?.projectInstanceId) {
        this.callbacks.onProjectInstanceTransform?.(object.userData.projectInstanceId, transform);
      } else if (object?.userData?.placementId) {
        this.callbacks.onTransform?.(object.userData.placementId, transform);
      }
    });
    this.transformControls.addEventListener('mouseDown', () => {
      this.transformHandleActive = true;
    });
    this.transformControls.addEventListener('mouseUp', () => {
      this.transformHandleActive = false;
    });

    this.ambient = new THREE.AmbientLight('#fff4d8', DAY_AMBIENT_INTENSITY);
    this.scene.add(this.ambient);
    this.hemisphere = new THREE.HemisphereLight('#f2fbff', '#a88a58', DAY_HEMISPHERE_INTENSITY);
    this.scene.add(this.hemisphere);
    const sun = new THREE.DirectionalLight('#fff6df', 2.85);
    // Front/right daylight: from above the portal side toward the building.
    sun.position.set(8, 14, -9);
    sun.castShadow = true;
    // A 4096² shadow map rebuilt during construction can monopolize the GPU
    // long enough to starve pointer and button events. 2048² remains crisp at
    // the stage scale while keeping animated Room construction responsive.
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.00002;
    sun.shadow.normalBias = 0.08;
    sun.shadow.camera.left = -18;
    sun.shadow.camera.right = 18;
    sun.shadow.camera.top = 18;
    sun.shadow.camera.bottom = -18;
    this.sun = sun;
    this.scene.add(sun);

    this.buildingGroup = new THREE.Group();
    this.archInfillGroup = new THREE.Group();
    this.archInfillGroup.name = 'Muqarnas top extensions to pointed arch';
    this.constructionGuideGroup = new THREE.Group();
    this.constructionGuideGroup.name = 'Construction guide arch ribs';
    this.placementMaskGroup = new THREE.Group();
    this.placementMaskGroup.name = 'Wall decoration occlusion masks';
    this.zoneDecorationGroup = new THREE.Group();
    this.zoneDecorationGroup.name = 'Zone assigned decorations';
    this.zoneGroup = new THREE.Group();
    this.placementGroup = new THREE.Group();
    this.projectInstanceGroup = new THREE.Group();
    this.projectInstanceGroup.name = 'Added Mehraz project instances';
    this.nightLightGroup = new THREE.Group();
    this.nightLightGroup.name = 'Night spotlight placement guides';
    this.scene.add(this.buildingGroup, this.archInfillGroup, this.constructionGuideGroup, this.zoneDecorationGroup, this.placementGroup, this.projectInstanceGroup, this.placementMaskGroup, this.nightLightGroup, this.sectionCapGroup, this.constructionCapGroup);
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.onPointerDown = this.onPointerDown.bind(this);
    this.onContextMenu = this.onContextMenu.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
    this.onDoubleClick = this.onDoubleClick.bind(this);
    this.onInteractionCancel = () => this.ensureConstructionInteractionAvailable(true);
    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown);
    this.renderer.domElement.addEventListener('dblclick', this.onDoubleClick);
    this.renderer.domElement.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onInteractionCancel);
    window.addEventListener('blur', this.onInteractionCancel);
    this.selectedGridElementIds = [];
    this.gridElementHighlight = null;
    this.selectedGridBayKeys = [];
    this.gridBayHighlight = null;
    this.gridBaySelectionEnabled = false;
    this.gridTemplateCache = { signature: null, templates: new Map() };
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.rebuildBuilding();
    this.resize();
    this.invalidate(true);
  }

  setBuilding(building) {
    this.building = normalizeBuilding(building);
    this.walls = normalizeWallSystem(this.walls, this.building);
    this.rebuildBuilding();
  }

  setArchitectureVisible(visible) {
    this.architectureVisible = visible === true;
    const wallSystem = this.buildingGroup.children.find((child) => child.userData?.wallSystem);
    if (wallSystem) wallSystem.visible = this.architectureVisible;
    if (!this.architectureVisible) {
      this.clearGridElementHighlight();
      this.clearWallSurfaceHighlight();
    }
    this.invalidate(true);
  }

  resetStageContent() {
    this.stopConstructionSequence();
    this.setRoomSectionView(false, this.sectionViewAxis);
    this.transformControls.detach();
    this.selectedId = null;
    this.selectedProjectInstanceId = null;
    this.selectedZoneId = null;
    this.selectedWallSide = null;
    this.selectedOpeningGuide = null;
    this.setGridElementSelection([]);
    this.setGridBaySelection([]);
    this.setPlacements([]);
    this.setProjectInstances([]);
    this.setZones([]);
    this.setNightPreview(false);
    this.setNightLights([]);
    this.setNightLightGuidesVisible(false);
    this.clearGroup(this.archInfillGroup);
    this.clearGroup(this.placementMaskGroup);
    this.clearGroup(this.sectionCapGroup);
    this.clearWallSurfaceHighlight();
    this.renderer.renderLists?.dispose?.();
    this.updateSelectionOutline();
    this.invalidate(true);
  }

  setArchitecture(building, walls, stageRenderMode = 'textured') {
    const nextBuilding = normalizeBuilding(building);
    this.building = nextBuilding;
    this.walls = normalizeWallSystem(walls, nextBuilding);
    this.stageRenderMode = stageRenderMode === 'flat' ? 'flat' : 'textured';
    this.rebuildBuilding();
  }

  setWallSystem(walls) {
    this.walls = normalizeWallSystem(walls, this.building);
    this.rebuildBuilding();
  }

  setStageRenderMode(mode = 'textured') {
    const nextMode = mode === 'flat' ? 'flat' : 'textured';
    if (this.stageRenderMode === nextMode) {
      this.applyStageAppearance();
      return;
    }
    this.stageRenderMode = nextMode;
    this.rebuildBuilding();
  }

  applyPureSolidWallMaterials(root) {
    root?.traverse((child) => {
      if (!child.isMesh || child.userData?.isKarbandiVisualGuide === true) return;
      const oldMaterials = Array.isArray(child.material) ? child.material : [child.material];
      const side = oldMaterials[0]?.side ?? THREE.DoubleSide;
      child.material = configureStoneBaseMaterial(new THREE.MeshStandardMaterial({
        color: this.walls.color,
        roughness: 0.86,
        metalness: 0,
        side,
        transparent: false,
        opacity: 1,
        depthWrite: true,
        depthTest: true,
      }), this.walls);
      oldMaterials.filter(Boolean).forEach((material) => {
        material.userData?.generatedTexture?.dispose?.();
        material.map?.dispose?.();
        material.dispose?.();
      });
      child.castShadow = true;
      // Keep dimensional shadows in the scene, but do not let large flat wall
      // faces receive their own shadow map, which caused the fine stripe acne.
      child.receiveShadow = false;
      child.userData.mehrazPureSolid = true;
    });
  }

  wallSystemRoot() {
    return this.buildingGroup.children.find((child) => child.userData?.wallSystem);
  }

  clearConstructionGuides() {
    this.constructionGuideGroup.traverse((child) => {
      child.geometry?.dispose?.();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.filter(Boolean).forEach((material) => material.dispose?.());
    });
    this.constructionGuideGroup.clear();
    this.constructionGuideKey = null;
  }

  syncConstructionGuides(rank, wallSystem) {
    const karbandiEnabled = this.walls.karbandi?.enabled === true;
    const northArchShiftY = Math.max(0, Number(wallSystem?.userData?.portalKarbandiNorthWallShiftY) || 0);
    const southGuideRank = this.constructionRankFor('south-arch-guide');
    const northGuideRank = this.constructionRankFor('north-arch-guide');
    const archFillRank = this.constructionRankFor('arch-fill');
    const northUpperRank = this.constructionRankFor('north-upper-wall');
    if (karbandiEnabled) {
      const showNorthGuide = rank >= northGuideRank && rank <= northUpperRank;
      const guideKey = showNorthGuide
        ? `karbandi-north:${this.building.width}:${this.building.depth}:${this.building.wallThickness}:${northArchShiftY}:${JSON.stringify(this.walls.pointedArch)}`
        : 'none';
      if (this.constructionGuideKey === guideKey) return;
      this.clearConstructionGuides();
      if (showNorthGuide) {
        const guide = this.makeNorthWallArchGuide();
        if (guide) this.constructionGuideGroup.add(guide);
      }
      this.constructionGuideKey = guideKey;
      return;
    }
    const guideEnds = rank >= southGuideRank && rank <= archFillRank
      ? (rank >= northGuideRank ? ['south', 'north'] : ['south'])
      : (rank === northUpperRank ? ['north'] : []);
    let source = null;
    if (guideEnds.includes('south')) {
      wallSystem?.traverse((child) => {
        if (!source && child.isMesh && (child.userData?.isPointedArch || child.userData?.wallSide === 'arch')) source = child;
      });
    }
    const guideKey = guideEnds.length
      ? `${guideEnds.join('+')}:${source?.uuid || 'north-wall'}:${this.building.width}:${this.building.depth}:${this.building.wallThickness}:${northArchShiftY}:${JSON.stringify(this.walls.pointedArch)}`
      : 'none';
    if (this.constructionGuideKey === guideKey) return;
    this.clearConstructionGuides();
    if (guideEnds.includes('south') && source) this.constructionGuideGroup.add(this.makeArchGuideClone(source, 'south'));
    if (guideEnds.includes('north')) {
      const guide = this.makeNorthWallArchGuide();
      if (guide) this.constructionGuideGroup.add(guide);
    }
    this.constructionGuideKey = guideKey;
  }

  makeNorthWallArchGuide() {
    if (this.walls.pointedArch?.enabled !== true) return null;
    const metrics = this.northOpeningMetrics();
    const sampleCount = 96;
    const innerPoints = Array.from({ length: sampleCount + 1 }, (_, index) => {
      const x = THREE.MathUtils.lerp(metrics.openingLeft, metrics.openingRight, index / sampleCount);
      return new THREE.Vector2(
        x,
        (wallArchHeightAtX(this.building, this.walls, x) ?? metrics.baseSideTop) + metrics.archShiftY,
      );
    });
    const guideDepth = Math.max(0.1, Number(this.building.wallThickness) || 0.4);
    const bandHeight = guideDepth;
    const outerPoints = innerPoints.map((point, index) => {
      const previous = innerPoints[Math.max(0, index - 1)];
      const next = innerPoints[Math.min(innerPoints.length - 1, index + 1)];
      const tangent = next.clone().sub(previous).normalize();
      const normalA = new THREE.Vector2(-tangent.y, tangent.x);
      const normalB = normalA.clone().multiplyScalar(-1);
      const fromOpening = point.clone().sub(new THREE.Vector2(metrics.centerX, 0));
      const outward = normalA.dot(fromOpening) >= normalB.dot(fromOpening) ? normalA : normalB;
      return point.clone().addScaledVector(outward, bandHeight);
    });
    const shape = new THREE.Shape();
    shape.moveTo(innerPoints[0].x, innerPoints[0].y);
    innerPoints.slice(1).forEach((point) => shape.lineTo(point.x, point.y));
    [...outerPoints].reverse().forEach((point) => shape.lineTo(point.x, point.y));
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: guideDepth,
      steps: 1,
      bevelEnabled: false,
      curveSegments: 48,
    });
    geometry.translate(0, 0, metrics.northZ - guideDepth);
    geometry.computeVertexNormals();
    const guide = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
      color: this.walls.color,
      roughness: 0.82,
      metalness: 0,
      side: THREE.DoubleSide,
    }));
    guide.name = 'North wall guide arch';
    guide.castShadow = true;
    guide.receiveShadow = true;
    guide.userData.isConstructionGuide = true;
    guide.userData.isNorthWallArchGuide = true;
    guide.userData.isKarbandiNorthArchGuide = this.walls.karbandi?.enabled === true;
    guide.userData.constructionGuideEnd = 'north';
    guide.userData.wallPlaneZ = metrics.northZ;
    guide.userData.wallThicknessOffset = -guideDepth;
    guide.userData.guideArchThickness = guideDepth;
    guide.userData.guideArchBandThickness = bandHeight;
    guide.userData.guideArchProfile = 'uniform-normal-offset';
    guide.userData.guideArchShiftY = metrics.archShiftY;
    guide.userData.guideArchWidthSamples = innerPoints.map((point, index) => point.distanceTo(outerPoints[index]));
    return guide;
  }

  makeArchGuideClone(archMesh, end = 'south') {
    archMesh.updateMatrixWorld(true);
    const geometry = archMesh.geometry.clone();
    const material = new THREE.MeshStandardMaterial({
      color: this.walls.color,
      roughness: 0.82,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    const guide = new THREE.Mesh(geometry, material);
    guide.matrix.copy(archMesh.matrixWorld);
    guide.matrix.decompose(guide.position, guide.quaternion, guide.scale);
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    const sourceMinZ = box.min.z;
    const sourceMaxZ = box.max.z;
    const depth = Math.max(0.001, sourceMaxZ - sourceMinZ);
    const wallThickness = Math.max(0.1, Number(this.building.wallThickness) || 0.4);
    const guideDepth = wallThickness;
    const depthScale = Math.max(0.001, guideDepth / depth);
    const wallPlaneZ = end === 'south'
      ? sourceMaxZ + wallThickness
      : sourceMinZ - wallThickness;
    const targetMinZ = end === 'south' ? wallPlaneZ - guideDepth : wallPlaneZ;
    // Compress the source arch in its own coordinate system. Keeping the mesh
    // transform untouched makes the wall-facing edge exact even if the wall
    // system later receives a parent transform.
    geometry.scale(1, 1, depthScale);
    geometry.translate(0, 0, targetMinZ - sourceMinZ * depthScale);
    geometry.computeBoundingBox();
    guide.castShadow = true;
    guide.receiveShadow = true;
    guide.userData.isConstructionGuide = true;
    guide.userData.constructionGuideEnd = end;
    guide.userData.wallPlaneZ = wallPlaneZ;
    guide.userData.wallThicknessOffset = end === 'south' ? wallThickness : -wallThickness;
    guide.userData.guideArchThickness = guideDepth;
    return guide;
  }

  restoreConstructionMaterials() {
    if (this.constructionCapGroup) this.clearGroup(this.constructionCapGroup);
    this.constructionCapCache = new WeakMap();
    if (this.constructionMaterialsActive !== true) return;
    const restoreMesh = (child) => {
      if (!child.isMesh || !child.userData?.constructionOriginalMaterial) return;
      const currentMaterials = Array.isArray(child.material) ? child.material : [child.material];
      child.material = child.userData.constructionOriginalMaterial;
      if (Object.hasOwn(child.userData, 'constructionOriginalCustomDepthMaterial')) {
        child.customDepthMaterial?.dispose?.();
        const originalCustomDepthMaterial = child.userData.constructionOriginalCustomDepthMaterial;
        if (originalCustomDepthMaterial == null) delete child.customDepthMaterial;
        else child.customDepthMaterial = originalCustomDepthMaterial;
        delete child.userData.constructionOriginalCustomDepthMaterial;
      }
      currentMaterials.filter(Boolean).forEach((material) => {
        if (material !== child.userData.constructionOriginalMaterial) material.dispose?.();
      });
      delete child.userData.constructionOriginalMaterial;
    };
    this.wallSystemRoot()?.traverse(restoreMesh);
    this.archInfillGroup.traverse(restoreMesh);
    this.placementGroup.traverse(restoreMesh);
    this.placementMaskGroup.traverse(restoreMesh);
    this.zoneDecorationGroup.traverse(restoreMesh);
    this.constructionMaterialsActive = false;
  }

  prepareConstructionMaterial(child) {
    if (!child.isMesh || !child.material) return [];
    if (!child.userData.constructionOriginalMaterial) {
      this.constructionMaterialsActive = true;
      const original = child.material;
      const materials = Array.isArray(original) ? original : [original];
      child.userData.constructionOriginalMaterial = original;
      const constructionClone = (material) => {
        const clone = material.clone();
        // Material.clone() intentionally omits shader callbacks in Three.js.
        // Preserve architectural shaders (especially the stone skirt and dome
        // mapping) while temporary construction clipping is active.
        clone.onBeforeCompile = material.onBeforeCompile;
        clone.customProgramCacheKey = material.customProgramCacheKey;
        return clone;
      };
      child.material = Array.isArray(original)
        ? materials.map(constructionClone)
        : constructionClone(materials[0]);
    }
    return Array.isArray(child.material) ? child.material : [child.material];
  }

  permanentConstructionMaterial(child, index) {
    const original = child.userData?.constructionOriginalMaterial;
    if (!original) return null;
    const originals = Array.isArray(original) ? original : [original];
    return originals[Math.min(index, originals.length - 1)] || null;
  }

  beginConstructionCapFrame() {
    if (!this.constructionCapGroup) return;
    this.constructionCapGroup.children.forEach((capRoot) => { capRoot.visible = false; });
  }

  constructionSectionLoops(child, sourcePlane) {
    const position = child.geometry?.getAttribute?.('position');
    if (!position || position.count < 3) return { loops: [], origin: null, tangentU: null, tangentV: null };
    child.updateWorldMatrix(true, false);
    const plane = sourcePlane.clone().normalize();
    // Move the sampling cut imperceptibly away from a mesh course boundary.
    // Otherwise triangles exactly coplanar with the boundary can create duplicate
    // edges and make an otherwise solid top look uncapped for one frame.
    plane.constant += 0.00001;
    const origin = plane.coplanarPoint(new THREE.Vector3());
    const tangentU = Math.abs(plane.normal.y) > 0.9
      ? new THREE.Vector3(1, 0, 0)
      : new THREE.Vector3(0, 1, 0).cross(plane.normal).normalize();
    const tangentV = plane.normal.clone().cross(tangentU).normalize();
    const epsilon = 0.0001;
    const pointKey = (point) => `${Math.round(point.x / epsilon)}:${Math.round(point.y / epsilon)}`;
    const segments = new Map();
    const index = child.geometry.index;
    const triangleCount = index ? index.count / 3 : position.count / 3;
    const transforms = [];
    if (child.isInstancedMesh) {
      const instanceMatrix = new THREE.Matrix4();
      for (let instance = 0; instance < child.count; instance += 1) {
        child.getMatrixAt(instance, instanceMatrix);
        transforms.push(new THREE.Matrix4().multiplyMatrices(child.matrixWorld, instanceMatrix));
      }
    } else transforms.push(child.matrixWorld);
    transforms.forEach((worldMatrix) => {
      const worldVertex = (vertexIndex) => new THREE.Vector3()
        .fromBufferAttribute(position, vertexIndex)
        .applyMatrix4(worldMatrix);
      for (let triangle = 0; triangle < triangleCount; triangle += 1) {
        const vertices = [0, 1, 2].map((offset) => worldVertex(
          index ? index.getX(triangle * 3 + offset) : triangle * 3 + offset,
        ));
        const distances = vertices.map((point) => plane.distanceToPoint(point));
        if (distances.every((distance) => Math.abs(distance) <= epsilon)) continue;
        const intersections = [];
        [[0, 1], [1, 2], [2, 0]].forEach(([first, second]) => {
          const a = vertices[first];
          const b = vertices[second];
          const da = distances[first];
          const db = distances[second];
          let point = null;
          if (Math.abs(da) <= epsilon) point = a;
          else if (Math.abs(db) <= epsilon) point = b;
          else if (da * db < 0) point = a.clone().lerp(b, da / (da - db));
          if (!point) return;
          const relative = point.clone().sub(origin);
          const projected = new THREE.Vector2(relative.dot(tangentU), relative.dot(tangentV));
          if (!intersections.some((entry) => entry.distanceToSquared(projected) <= epsilon ** 2)) {
            intersections.push(projected);
          }
        });
        if (intersections.length < 2) continue;
        let pair = [intersections[0], intersections[1]];
        intersections.forEach((first) => intersections.forEach((second) => {
          if (first.distanceToSquared(second) > pair[0].distanceToSquared(pair[1])) pair = [first, second];
        }));
        const keys = pair.map(pointKey);
        if (keys[0] === keys[1]) continue;
        const segmentKey = [...keys].sort().join('|');
        if (!segments.has(segmentKey)) segments.set(segmentKey, { points: pair, keys });
      }
    });
    const entries = [...segments.values()];
    const adjacency = new Map();
    entries.forEach((entry, segmentIndex) => entry.keys.forEach((key) => {
      if (!adjacency.has(key)) adjacency.set(key, []);
      adjacency.get(key).push(segmentIndex);
    }));
    const used = new Set();
    const loops = [];
    entries.forEach((entry, startIndex) => {
      if (used.has(startIndex)) return;
      used.add(startIndex);
      const path = [entry.points[0].clone(), entry.points[1].clone()];
      const startKey = entry.keys[0];
      let currentKey = entry.keys[1];
      let guard = 0;
      while (currentKey !== startKey && guard < entries.length + 2) {
        const nextIndex = (adjacency.get(currentKey) || []).find((candidate) => !used.has(candidate));
        if (nextIndex == null) break;
        used.add(nextIndex);
        const next = entries[nextIndex];
        const fromFirst = next.keys[0] === currentKey;
        path.push(next.points[fromFirst ? 1 : 0].clone());
        currentKey = next.keys[fromFirst ? 1 : 0];
        guard += 1;
      }
      if (currentKey !== startKey) return;
      path.pop();
      if (path.length < 3 || Math.abs(THREE.ShapeUtils.area(path)) <= 0.00001) return;
      loops.push(path);
    });
    return { loops, origin, tangentU, tangentV };
  }

  syncConstructionCap(child, plane, cacheKey = 'reveal') {
    if (!child?.isMesh || !child.visible || !plane || !this.constructionCapGroup) return;
    let childCache = this.constructionCapCache?.get(child);
    if (!childCache) {
      childCache = new Map();
      this.constructionCapCache?.set(child, childCache);
    }
    const signature = [plane.normal.x, plane.normal.y, plane.normal.z, plane.constant]
      .map((value) => Number(value).toFixed(5)).join(':');
    let entry = childCache.get(cacheKey);
    if (entry?.signature === signature) {
      entry.root.visible = true;
      return;
    }
    if (entry) {
      this.clearGroup(entry.root);
      entry.root.removeFromParent();
    }
    const section = this.constructionSectionLoops(child, plane);
    const root = new THREE.Group();
    root.name = `${child.name || 'Masonry'} solid construction cap`;
    const sourceMaterial = (Array.isArray(child.userData?.constructionOriginalMaterial)
      ? child.userData.constructionOriginalMaterial[0]
      : child.userData?.constructionOriginalMaterial) || (Array.isArray(child.material) ? child.material[0] : child.material);
    const permanentPlanes = Array.isArray(sourceMaterial?.clippingPlanes)
      ? [...sourceMaterial.clippingPlanes]
      : null;
    const containsPoint = (loop, point) => {
      let inside = false;
      for (let current = 0, previous = loop.length - 1; current < loop.length; previous = current, current += 1) {
        const a = loop[current];
        const b = loop[previous];
        if (((a.y > point.y) !== (b.y > point.y))
          && point.x < ((b.x - a.x) * (point.y - a.y)) / ((b.y - a.y) || 0.000001) + a.x) inside = !inside;
      }
      return inside;
    };
    const ordered = section.loops
      .map((loop) => ({ loop, area: Math.abs(THREE.ShapeUtils.area(loop)), parent: null, depth: 0 }))
      .sort((left, right) => right.area - left.area);
    ordered.forEach((entryLoop, index) => {
      const parent = ordered.slice(0, index).reverse().find((candidate) => containsPoint(candidate.loop, entryLoop.loop[0]));
      entryLoop.parent = parent || null;
      entryLoop.depth = parent ? parent.depth + 1 : 0;
    });
    const shapeEntries = new Map();
    ordered.filter((entryLoop) => entryLoop.depth % 2 === 0).forEach((entryLoop) => {
      const points = entryLoop.loop.map((point) => point.clone());
      if (!THREE.ShapeUtils.isClockWise(points)) points.reverse();
      const shape = new THREE.Shape(points);
      shapeEntries.set(entryLoop, shape);
    });
    ordered.filter((entryLoop) => entryLoop.depth % 2 === 1).forEach((entryLoop) => {
      let outer = entryLoop.parent;
      while (outer && outer.depth % 2 !== 0) outer = outer.parent;
      const shape = shapeEntries.get(outer);
      if (!shape) return;
      const points = entryLoop.loop.map((point) => point.clone());
      if (THREE.ShapeUtils.isClockWise(points)) points.reverse();
      shape.holes.push(new THREE.Path(points));
    });
    shapeEntries.forEach((shape) => {
      const geometry = new THREE.ShapeGeometry(shape);
      const positions = geometry.getAttribute('position');
      for (let vertex = 0; vertex < positions.count; vertex += 1) {
        const u = positions.getX(vertex);
        const v = positions.getY(vertex);
        const world = section.origin.clone()
          .addScaledVector(section.tangentU, u)
          .addScaledVector(section.tangentV, v)
          .addScaledVector(plane.normal, -0.0002);
        positions.setXYZ(vertex, world.x, world.y, world.z);
      }
      positions.needsUpdate = true;
      geometry.computeVertexNormals();
      const material = new THREE.MeshStandardMaterial({
        color: sourceMaterial?.color?.clone?.() || new THREE.Color('#b88954'),
        roughness: Number.isFinite(sourceMaterial?.roughness) ? sourceMaterial.roughness : 0.86,
        metalness: Number.isFinite(sourceMaterial?.metalness) ? sourceMaterial.metalness : 0,
        side: THREE.DoubleSide,
        clippingPlanes: permanentPlanes,
        clipShadows: sourceMaterial?.clipShadows === true,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      });
      material.userData.constructionSolidCap = true;
      const cap = new THREE.Mesh(geometry, material);
      cap.name = `${child.name || 'Masonry'} solid cut face`;
      cap.castShadow = child.castShadow;
      cap.receiveShadow = child.receiveShadow;
      cap.renderOrder = (child.renderOrder || 0) + 1;
      cap.userData.constructionSolidCap = true;
      cap.userData.constructionCapSource = child;
      root.add(cap);
    });
    root.visible = true;
    this.constructionCapGroup.add(root);
    entry = { root, signature };
    childCache.set(cacheKey, entry);
  }

  hideConstructionCapsFor(child) {
    this.constructionCapCache?.get(child)?.forEach((entry) => { entry.root.visible = false; });
  }

  setConstructionClip(child, progress = 1, axis = 'y', minValue = 0, maxValue = null, constructionStep = null) {
    const materials = this.prepareConstructionMaterial(child);
    if (!materials.length) return;
    child.visible = progress > 0.001;
    const box = new THREE.Box3().setFromObject(child);
    const boxMin = axis === 'x' ? box.min.x : axis === 'z' ? box.min.z : box.min.y;
    const boxMax = axis === 'x' ? box.max.x : axis === 'z' ? box.max.z : box.max.y;
    const start = Number.isFinite(minValue) ? minValue : boxMin;
    const end = Number.isFinite(maxValue) ? maxValue : boxMax;
    const brickStep = Math.max(0.01, Number.isFinite(Number(constructionStep))
      ? Number(constructionStep)
      : Number(this.walls.bricks?.brickHeight || 0.08) + Number(this.walls.bricks?.mortar || 0.01));
    const courseCount = Math.max(1, Math.ceil(Math.abs(end - start) / brickStep));
    const revealedCourses = Math.min(courseCount, Math.ceil(progress * courseCount));
    const steppedProgress = Math.min(1, Math.max(0, revealedCourses / courseCount));
    const limit = start + (end - start) * steppedProgress;
    const plane = axis === 'x'
      ? new THREE.Plane(new THREE.Vector3(end >= start ? -1 : 1, 0, 0), end >= start ? limit : -limit)
      : axis === 'z'
        ? new THREE.Plane(new THREE.Vector3(0, 0, end >= start ? -1 : 1), end >= start ? limit : -limit)
        : new THREE.Plane(new THREE.Vector3(0, -1, 0), limit);
    materials.forEach((material, index) => {
      const permanentMaterial = this.permanentConstructionMaterial(child, index);
      const permanentPlanes = Array.isArray(permanentMaterial?.clippingPlanes)
        ? permanentMaterial.clippingPlanes
        : [];
      // Portal clipping is part of the rib design, not part of the animation.
      // Keep those planes active while adding the temporary reveal plane.
      const existingRevealPlane = material.userData?.constructionRevealPlane;
      const canReuseRevealPlane = existingRevealPlane
        && material.clippingPlanes?.length === permanentPlanes.length + 1
        && material.clippingPlanes[material.clippingPlanes.length - 1] === existingRevealPlane;
      if (canReuseRevealPlane) {
        existingRevealPlane.copy(plane);
      } else {
        const revealPlane = plane.clone();
        material.clippingPlanes = [...permanentPlanes, revealPlane];
        material.userData.constructionRevealPlane = revealPlane;
        material.needsUpdate = true;
      }
      material.clipIntersection = false;
      material.clipShadows = permanentMaterial?.clipShadows === true;
    });
    if (axis === 'y') {
      child.userData.constructionVerticalCourseSequence = {
        direction: 'bottom-to-top',
        courseHeight: brickStep,
        courseCount,
        revealedCourses,
        progress: THREE.MathUtils.clamp(progress, 0, 1),
      };
    }
    if (progress > 0.001 && progress < 0.999999) this.syncConstructionCap(child, plane);
    else this.hideConstructionCapsFor(child);
  }

  setSharedVerticalCourseConstructionClip(child, limitY, originY, topY, progress = 1) {
    const materials = this.prepareConstructionMaterial(child);
    if (!materials.length) return;
    const bounds = new THREE.Box3().setFromObject(child);
    child.visible = limitY > bounds.min.y + 0.000001;
    if (!child.visible) return;
    const plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), limitY);
    materials.forEach((material, index) => {
      const permanentMaterial = this.permanentConstructionMaterial(child, index);
      const permanentPlanes = Array.isArray(permanentMaterial?.clippingPlanes)
        ? permanentMaterial.clippingPlanes
        : [];
      const existingRevealPlane = material.userData?.constructionRevealPlane;
      const canReuseRevealPlane = existingRevealPlane
        && material.clippingPlanes?.length === permanentPlanes.length + 1
        && material.clippingPlanes[material.clippingPlanes.length - 1] === existingRevealPlane;
      if (canReuseRevealPlane) existingRevealPlane.copy(plane);
      else {
        const revealPlane = plane.clone();
        material.clippingPlanes = [...permanentPlanes, revealPlane];
        material.userData.constructionRevealPlane = revealPlane;
        material.needsUpdate = true;
      }
      material.clipIntersection = false;
      material.clipShadows = permanentMaterial?.clipShadows === true;
    });
    const courseHeight = Math.max(
      0.01,
      Number(this.walls.bricks?.brickHeight || 0.08) + Number(this.walls.bricks?.mortar || 0.01),
    );
    child.userData.constructionVerticalCourseSequence = {
      direction: 'bottom-to-top',
      courseHeight,
      courseCount: Math.max(1, Math.ceil((topY - originY) / courseHeight)),
      revealedCourses: Math.max(0, Math.ceil((limitY - originY) / courseHeight)),
      progress: THREE.MathUtils.clamp(progress, 0, 1),
      sharedCourseTopY: limitY,
      sharedCourseOriginY: originY,
    };
    if (progress > 0.001 && progress < 0.999999) this.syncConstructionCap(child, plane, 'shared-vertical-reveal');
    else this.hideConstructionCapsFor(child);
  }

  setHallBarrelSpanConstructionClip(child, progress = 1) {
    const barrelAxis = child.userData?.hallBarrelAxis === 'y' ? 'y' : 'x';
    const longitudinalAxis = barrelAxis === 'x' ? 'z' : 'x';
    const box = new THREE.Box3().setFromObject(child);
    const start = longitudinalAxis === 'x' ? box.min.x : box.min.z;
    const end = longitudinalAxis === 'x' ? box.max.x : box.max.z;
    const brickLengthStep = Math.max(
      0.01,
      Number(this.walls.bricks?.brickWidth || 0.2) + Number(this.walls.bricks?.mortar || 0.01),
    );
    this.setConstructionClip(
      child,
      progress,
      longitudinalAxis,
      start,
      end,
      brickLengthStep,
    );
    child.userData.constructionBarrelSpanSequence = {
      direction: 'one-supporting-vault-to-the-next',
      longitudinalAxis,
      start,
      end,
      progress: THREE.MathUtils.clamp(progress, 0, 1),
    };
  }

  setArchCourseConstructionClip(child, progress, metrics) {
    const materials = this.prepareConstructionMaterial(child);
    if (!materials.length) return;
    child.visible = progress > 0.001;
    const sampleCount = 96;
    const points = Array.from({ length: sampleCount + 1 }, (_, index) => {
      const x = THREE.MathUtils.lerp(metrics.openingLeft, metrics.centerX, index / sampleCount);
      return new THREE.Vector2(
        x,
        (wallArchHeightAtX(this.building, this.walls, x) ?? metrics.baseSideTop) + metrics.archShiftY,
      );
    });
    const cumulative = [0];
    for (let index = 1; index < points.length; index += 1) {
      cumulative.push(cumulative[index - 1] + points[index - 1].distanceTo(points[index]));
    }
    const totalDistance = cumulative[cumulative.length - 1];
    const courseHeight = Math.max(0.01, Number(this.walls.bricks?.brickHeight || 0.08) + Number(this.walls.bricks?.mortar || 0.01));
    const courseCount = Math.max(1, Math.ceil(totalDistance / courseHeight));
    const revealedDistance = Math.min(totalDistance, Math.ceil(THREE.MathUtils.clamp(progress, 0, 1) * courseCount) * courseHeight);
    let leftLimit = metrics.openingLeft;
    for (let index = 1; index < cumulative.length; index += 1) {
      if (cumulative[index] < revealedDistance) continue;
      const segmentDistance = cumulative[index] - cumulative[index - 1];
      const blend = segmentDistance > 0.000001
        ? (revealedDistance - cumulative[index - 1]) / segmentDistance
        : 0;
      leftLimit = THREE.MathUtils.lerp(points[index - 1].x, points[index].x, blend);
      break;
    }
    if (revealedDistance >= totalDistance - 0.000001) leftLimit = metrics.centerX;
    const rightLimit = metrics.centerX * 2 - leftLimit;
    const planes = [
      new THREE.Plane(new THREE.Vector3(-1, 0, 0), leftLimit),
      new THREE.Plane(new THREE.Vector3(1, 0, 0), -rightLimit),
    ];
    materials.forEach((material) => {
      material.clippingPlanes = planes;
      material.clipIntersection = true;
      material.needsUpdate = true;
    });
    if (progress > 0.001 && progress < 0.999999) {
      this.syncConstructionCap(child, planes[0], 'arch-left-reveal');
      this.syncConstructionCap(child, planes[1], 'arch-right-reveal');
    } else this.hideConstructionCapsFor(child);
  }

  clearConstructionClip(child) {
    if (!child.isMesh) return;
    this.hideConstructionCapsFor(child);
    // A mesh that has never received an animation clip already owns its final
    // material and permanent clipping planes. Do not clone it merely because
    // a later construction stage needs it visible.
    if (!child.userData?.constructionOriginalMaterial) return;
    const materials = this.prepareConstructionMaterial(child);
    materials.forEach((material, index) => {
      const permanentMaterial = this.permanentConstructionMaterial(child, index);
      const targetPlanes = Array.isArray(permanentMaterial?.clippingPlanes)
        ? [...permanentMaterial.clippingPlanes]
        : null;
      const targetIntersection = permanentMaterial?.clipIntersection === true;
      const targetClipShadows = permanentMaterial?.clipShadows === true;
      const currentPlanes = material.clippingPlanes;
      const samePlanes = currentPlanes === targetPlanes
        || ((!currentPlanes || currentPlanes.length === 0) && (!targetPlanes || targetPlanes.length === 0))
        || (Array.isArray(currentPlanes) && Array.isArray(targetPlanes)
          && currentPlanes.length === targetPlanes.length
          && currentPlanes.every((plane, planeIndex) => plane === targetPlanes[planeIndex]));
      const requiresMaterialUpdate = !samePlanes
        || material.clipIntersection !== targetIntersection
        || material.clipShadows !== targetClipShadows;
      if (!samePlanes) material.clippingPlanes = targetPlanes;
      material.clipIntersection = targetIntersection;
      material.clipShadows = targetClipShadows;
      delete material.userData.constructionRevealPlane;
      if (requiresMaterialUpdate) material.needsUpdate = true;
    });
  }

  northOpeningMetrics() {
    const b = normalizeBuilding(this.building);
    const walls = normalizeWallSystem(this.walls, b);
    const halfWidth = Math.max(1, Number(b.width) / 2);
    const halfDepth = Math.max(1, Number(b.depth) / 2);
    const westX = -halfWidth - walls.sideOffsets.west;
    const eastX = halfWidth + walls.sideOffsets.east;
    const width = eastX - westX;
    const centerX = (westX + eastX) / 2;
    const archHalfSpan = Math.max(0.5, Math.min(width / 2, Number(b.openingWidth) / 2 || width * 0.32));
    const sideTop = Math.max(
      Math.max(0.05, b.height + walls.extraHeights.east),
      Math.max(0.05, b.height + walls.extraHeights.west),
    );
    const archShiftY = b.type !== 'room' && walls.portalTransition === 'karbandi'
      ? Math.max(0, Number(this.wallSystemRoot()?.userData?.portalKarbandiNorthWallShiftY) || 0)
      : 0;
    return {
      centerX,
      openingLeft: centerX - archHalfSpan,
      openingRight: centerX + archHalfSpan,
      baseSideTop: sideTop,
      sideTop: sideTop + archShiftY,
      archShiftY,
      northZ: -halfDepth - walls.sideOffsets.north,
    };
  }

  isNorthSidePier(child, metrics) {
    if (!child.isObject3D) return false;
    const side = child.userData?.wallSide;
    if (!['north', 'north_sides', 'north_top'].includes(side)) return false;
    const box = new THREE.Box3().setFromObject(child);
    if (box.isEmpty()) return false;
    if (side === 'north_top') return false;
    if (side === 'north_sides') return true;
    return box.max.x <= metrics.openingLeft + 0.05 || box.min.x >= metrics.openingRight - 0.05 || box.max.y <= metrics.sideTop + 0.05;
  }

  isNorthUpperWallPart(child, metrics) {
    if (!child.isObject3D) return false;
    const side = child.userData?.wallSide;
    if (side === 'north_top') return true;
    if (!['north', 'north_sides'].includes(side)) return false;
    const box = new THREE.Box3().setFromObject(child);
    if (box.isEmpty()) return false;
    if (child.userData?.isNorthRaisedArchRing || child.userData?.isNorthCurveBorderBrick) return true;
    return box.max.y > metrics.sideTop + 0.05;
  }

  applyLowerWallConstruction(child, progress, metrics) {
    const side = child.userData?.wallSide;
    if (!child.isObject3D || !side) return;
    const verticalWall = ['east', 'west', 'south', 'north', 'north_sides', 'north_top'].includes(side);
    if (!verticalWall || side === 'north_top') {
      child.visible = false;
      return;
    }
    const northSidePier = this.isNorthSidePier(child, metrics);
    if (['north', 'north_sides'].includes(side) && !northSidePier) {
      child.visible = false;
      return;
    }
    child.visible = true;
    if (child.isMesh) this.setConstructionClip(child, progress, 'y', 0, metrics.sideTop);
  }

  applySouthUnderArchConstruction(child, progress, metrics) {
    if (!child.isObject3D || child.userData?.isSouthArchCap !== true) {
      child.visible = false;
      return;
    }
    child.visible = true;
    if (!child.isMesh) return;
    const box = new THREE.Box3().setFromObject(child);
    const top = Number.isFinite(box.max.y) ? box.max.y : metrics.sideTop;
    this.setConstructionClip(child, progress, 'y', metrics.sideTop, top);
  }

  applyNorthUpperConstruction(child, progress, metrics, preserveKarbandiGuideArch = false) {
    if (!child.isObject3D) return;
    const side = child.userData?.wallSide;
    if (!['north', 'north_sides', 'north_top'].includes(side)) return;
    if (preserveKarbandiGuideArch && (child.userData?.isNorthRaisedArchRing || child.userData?.isNorthCurveBorderBrick)) {
      child.visible = false;
      return;
    }
    const upperPart = this.isNorthUpperWallPart(child, metrics);
    const sidePier = this.isNorthSidePier(child, metrics);
    if (!upperPart && !sidePier) {
      child.visible = false;
      return;
    }
    child.visible = true;
    if (!child.isMesh) return;
    const box = new THREE.Box3().setFromObject(child);
    const top = Number.isFinite(box.max.y) ? box.max.y : metrics.sideTop;
    if (upperPart) this.setConstructionClip(child, progress, 'y', metrics.sideTop, top);
    else this.setConstructionClip(child, 1, 'y', 0, metrics.sideTop);
  }

  applyConstructionDecoration(child, stepId, rank, progress) {
    if (stepId === 'complete') {
      child.visible = true;
      if (child.isMesh) this.clearConstructionClip(child);
      return;
    }
    const decorationStepId = WALL_DECORATION_STEP[child.userData?.wallSide];
    const decorationRank = this.constructionRankFor(decorationStepId);
    if (!Number.isFinite(decorationRank)) {
      child.visible = false;
      return;
    }
    const isCurrentStep = stepId === decorationStepId;
    child.visible = rank >= decorationRank && (!isCurrentStep || progress > 0.001);
    if (!child.isMesh) return;
    if (isCurrentStep) this.setConstructionClip(child, progress, 'y');
    else if (child.visible) this.clearConstructionClip(child);
  }

  applyPlacementDecorationSteps(stepId, rank, progress) {
    this.placementGroup.visible = true;
    this.placementGroup.children.forEach((root) => {
      if (!coverSystemAllowsPlacement(root, this.walls)) {
        root.visible = false;
        return;
      }
      if (root.userData?.assetType === 'muqarnas_assembly') {
        this.applyMuqarnasConstruction(root, stepId, rank, progress);
        return;
      }
      if (stepId === 'complete') {
        root.visible = true;
        root.traverse((child) => {
          if (child.isMesh) this.clearConstructionClip(child);
        });
        return;
      }
      const decorationStepId = SURFACE_DECORATION_STEP[root.userData?.surfaceId];
      const decorationRank = this.constructionRankFor(decorationStepId);
      const isCurrentStep = stepId === decorationStepId;
      root.visible = Number.isFinite(decorationRank) && rank >= decorationRank && (!isCurrentStep || progress > 0.001);
      root.traverse((child) => {
        if (!child.isMesh) return;
        if (root.visible && isCurrentStep) this.setConstructionClip(child, progress, 'y');
        else if (root.visible) this.clearConstructionClip(child);
      });
    });
  }

  applyMuqarnasConstruction(root, stepId, rank, progress) {
    const muqarnasRank = this.constructionRankFor('muqarnas-tiers');
    if (!Number.isFinite(muqarnasRank)) {
      root.visible = false;
      return;
    }
    const isCurrentStep = stepId === 'muqarnas-tiers';
    root.visible = rank >= muqarnasRank && (!isCurrentStep || progress > 0.001);
    if (!root.visible) return;
    const modules = root.children.filter((child) => child.isObject3D);
    if (!modules.length) return;
    if (!this.constructionTierCache) this.constructionTierCache = new WeakMap();
    const moduleTier = (module) => {
      const cachedTier = this.constructionTierCache.get(module);
      if (Number.isFinite(cachedTier)) return cachedTier;
      const box = new THREE.Box3().setFromObject(module);
      const tier = box.isEmpty() ? 0 : Number(((box.min.y + box.max.y) / 2).toFixed(3));
      this.constructionTierCache.set(module, tier);
      return tier;
    };
    const tiers = [...new Set(modules.map(moduleTier))].sort((a, b) => a - b);
    const visibleTierCount = isCurrentStep
      ? Math.max(0, Math.ceil(Math.max(0, Math.min(1, progress)) * tiers.length))
      : tiers.length;
    const visibleTierSet = new Set(tiers.slice(0, visibleTierCount));
    modules.forEach((module) => {
      module.visible = visibleTierSet.has(moduleTier(module));
    });
  }

  hasConstructionStepContent(stepId) {
    const karbandiEnabled = this.walls.karbandi?.enabled === true;
    if (['hall', 'grid'].includes(this.building.buildingType)) {
      if (ROOM_ONLY_CONSTRUCTION_STEP_IDS.has(stepId) || PORTAL_ONLY_CONSTRUCTION_STEP_IDS.has(stepId)) return false;
      if (HALL_ONLY_CONSTRUCTION_STEP_IDS.has(stepId)) {
        let hasContent = false;
        this.wallSystemRoot()?.traverse((child) => {
          if (hasContent) return;
          if (['hall-vaults', 'hall-transverse-vaults', 'hall-barrel-axis-vaults'].includes(stepId)) {
            const isVault = child.userData?.isHallVaultArch === true;
            const direction = child.userData?.hallVaultDirection;
            const barrelAxis = this.building.hallBarrelAxis === 'y' ? 'y' : 'x';
            hasContent = stepId === 'hall-vaults'
              ? isVault
              : stepId === 'hall-transverse-vaults'
                ? isVault && direction !== barrelAxis
                : isVault && direction === barrelAxis;
          } else if (stepId === 'hall-barrel-spandrels') {
            hasContent = child.userData?.isHallBarrelSpandrelInfill === true;
          } else if (stepId === 'hall-barrel-surrounding-walls') {
            hasContent = child.userData?.isHallPerimeterWall === true;
          } else if (stepId === 'hall-barrel-under-vault-walls') {
            hasContent = child.userData?.isHallBoundaryVaultInfill === true;
          } else if (stepId === 'hall-walls') {
            hasContent = child.userData?.isHallPerimeterWall === true
              || child.userData?.isHallBoundaryVaultInfill === true;
          } else if (stepId === 'hall-transition') {
            hasContent = child.userData?.isHallBayTransition === true;
          } else if (stepId === 'hall-cover') {
            hasContent = child.userData?.isHallBayCover === true
              && child.userData?.isHallBayTransition !== true;
          }
        });
        return hasContent;
      }
    }
    if (this.building.type === 'room') {
      if (ROOM_ONLY_CONSTRUCTION_STEP_IDS.has(stepId)) {
        if (stepId === 'room-skirt') {
          if (this.walls.stoneBase?.enabled === true
            && Number(this.walls.stoneBase?.height) > 0.000001) return true;
          let hasRaisedDoorBase = false;
          this.wallSystemRoot()?.traverse((child) => {
            if (child.userData?.isRaisedInteriorFloor === true
              || child.userData?.isDoorStep === true) hasRaisedDoorBase = true;
          });
          return hasRaisedDoorBase;
        }
        let hasContent = false;
        this.wallSystemRoot()?.traverse((child) => {
          if (hasContent) return;
          const part = child.userData?.roomDomePart;
           if (stepId === 'room-karbandi-ribs') hasContent = child.userData?.isKarbandi === true;
           else if (stepId === 'room-squinch-arches') hasContent = part === 'squinch-transition-rib';
           else if (stepId === 'room-squinch-under-arch-walls') {
             hasContent = child.userData?.isRoomSquinchVerticalWallExtension === true;
           }
           else if (stepId === 'room-karbandi-roof') hasContent = child.userData?.isKarbandiCover === true;
          else if (stepId === 'room-transition-structure') {
            hasContent = this.building.domeTransition !== 'squinch' && (
              (child.userData?.isRoomDomeTransitionDetail === true && part !== 'springing-ring')
                || ['exterior-aligned-octagon-wall', 'octagon-inherited-opening-soldier']
                  .includes(part)
                || ['pendentive-transition-rib', 'muqarnas-transition-rib'].includes(part)
            );
          }
          else if (stepId === 'room-transition-cover') {
            hasContent = part === 'karbandi-roof-to-drum-infill-top'
              || (['transition-cover', 'squinch-transition-cover'].includes(part)
                && child.userData?.isKarbandiCover !== true);
          } else if (stepId === 'room-drum') hasContent = part === 'dome-drum';
          else if (stepId === 'room-extra-leg') hasContent = part === 'dome-extra-leg';
          else if (stepId === 'room-outer-ring') {
            const coverType = this.building.domeCoverType || 'dome';
            hasContent = part === 'springing-ring'
              && this.building.domeOuterRingEnabledByCoverType?.[coverType] !== false;
          }
          else if (stepId === 'room-dome') hasContent = ['dome-shell', 'inner-dome-shell', 'between-dome-support-wall'].includes(part);
          else if (stepId === 'room-decoration') hasContent = child.userData?.isImportedWallDecoration === true;
        });
        if (stepId === 'room-decoration' && !hasContent) {
          hasContent = this.placementGroup?.children.some((root) => root.userData?.assetType !== 'muqarnas_assembly') === true;
          this.zoneDecorationGroup?.traverse((child) => {
            if (child.userData?.isZoneDecoration === true) hasContent = true;
          });
        }
        if (stepId === 'room-transition-structure' && !hasContent) {
          hasContent = this.placementGroup?.children.some((root) => (
            root.userData?.assetType === 'muqarnas_assembly'
          )) === true;
        }
        return hasContent;
      }
      if (['south-arch-guide', 'north-arch-guide', 'south-wall', 'arch-fill',
        'karbandi-reference-rib', 'karbandi-ribs', 'karbandi-roof',
        'north-upper-wall', 'portal-transition', 'portal-drum', 'portal-extra-leg', 'portal-outer-ring',
        'portal-cover', 'muqarnas-tiers',
        'hall-vaults', 'hall-transverse-vaults', 'hall-barrel-spandrels',
        'hall-barrel-axis-vaults', 'hall-barrel-surrounding-walls',
        'hall-barrel-under-vault-walls', 'hall-walls',
        'hall-transition', 'hall-cover'].includes(stepId)) return false;
      if (stepId.startsWith('decorate-')) return false;
    } else if (ROOM_ONLY_CONSTRUCTION_STEP_IDS.has(stepId) || HALL_ONLY_CONSTRUCTION_STEP_IDS.has(stepId)) return false;
    if (stepId === 'muqarnas-tiers') {
      return this.placementGroup?.children.some((root) => (
        root.userData?.assetType === 'muqarnas_assembly'
      )) === true;
    }
    if (['portal-transition', 'portal-drum', 'portal-extra-leg', 'portal-outer-ring', 'portal-cover'].includes(stepId)) {
      let hasContent = false;
      this.wallSystemRoot()?.traverse((child) => {
        if (hasContent) return;
        const part = child.userData?.roomDomePart;
        if (stepId === 'portal-transition') {
          hasContent = child.userData?.isRoomDomeTransition === true
            || (child.userData?.isRoomDomeTransitionDetail === true && part !== 'springing-ring')
            || child.userData?.isRoomSquinchVerticalWallExtension === true;
        } else if (stepId === 'portal-drum') hasContent = part === 'dome-drum';
        else if (stepId === 'portal-extra-leg') hasContent = part === 'dome-extra-leg';
        else if (stepId === 'portal-outer-ring') {
          hasContent = part === 'springing-ring'
            && this.building.domeOuterRingEnabledByCoverType?.dome !== false;
        }
        else hasContent = child.userData?.isPortalHalfBayCover === true
          || ['dome-shell', 'inner-dome-shell', 'between-dome-support-wall'].includes(part);
      });
      return hasContent;
    }
    if (karbandiEnabled && stepId === 'north-arch-guide') return this.walls.pointedArch?.enabled === true;
    if (stepId.startsWith('karbandi-')) {
      if (!karbandiEnabled) return false;
      let hasContent = false;
      this.wallSystemRoot()?.traverse((child) => {
        if (hasContent) return;
        if (stepId === 'karbandi-reference-rib') hasContent = child.userData?.isKarbandiReference === true;
        else if (stepId === 'karbandi-ribs') hasContent = child.userData?.isKarbandi === true && child.userData?.isKarbandiReference !== true;
        else if (stepId === 'karbandi-roof') hasContent = child.userData?.isKarbandiCover === true;
      });
      return hasContent;
    }
    if (karbandiEnabled && ['south-arch-guide', 'south-wall', 'arch-fill'].includes(stepId)) return false;
    if (!stepId?.startsWith('decorate-')) return true;
    let hasContent = false;
    this.wallSystemRoot()?.traverse((child) => {
      if (hasContent || child.userData?.isBrickFace !== true) return;
      hasContent = WALL_DECORATION_STEP[child.userData?.wallSide] === stepId;
    });
    if (hasContent) return true;
    hasContent = this.placementGroup.children.some((root) => (
      root.userData?.assetType !== 'muqarnas_assembly'
      && SURFACE_DECORATION_STEP[root.userData?.surfaceId] === stepId
    ));
    if (hasContent) return true;
    this.zoneDecorationGroup.traverse((child) => {
      if (hasContent || child.userData?.isZoneDecoration !== true) return;
      hasContent = SURFACE_DECORATION_STEP[child.userData?.surfaceId] === stepId;
    });
    return hasContent;
  }

  setTwoSidedVaultCourseConstructionClip(child, progress = 1) {
    const materials = this.prepareConstructionMaterial(child);
    if (!materials.length) return;
    child.visible = progress > 0.001;
    child.updateWorldMatrix(true, false);
    const rawProfile = child.geometry?.userData?.constructionVaultCenterline
      || child.geometry?.userData?.squinchArchProfile;
    if (!Array.isArray(rawProfile) || rawProfile.length < 3) {
      this.setConstructionClip(child, progress, 'y');
      return;
    }
    const profile = rawProfile.map((point) => child.localToWorld(new THREE.Vector3(
      Number(point[0]) || 0,
      Number(point[1]) || 0,
      Number(point[2]) || 0,
    )));
    const crownIndex = profile.reduce((best, point, index) => (
      point.y > profile[best].y ? index : best
    ), 0);
    if (crownIndex <= 0 || crownIndex >= profile.length - 1) {
      this.setConstructionClip(child, progress, 'y');
      return;
    }
    const courseStep = Math.max(
      0.01,
      Number(this.walls.bricks?.brickHeight || 0.08) + Number(this.walls.bricks?.mortar || 0.01),
    );
    const pointAlong = (points, requestedDistance) => {
      let travelled = 0;
      for (let index = 1; index < points.length; index += 1) {
        const segment = points[index].distanceTo(points[index - 1]);
        if (travelled + segment < requestedDistance) {
          travelled += segment;
          continue;
        }
        const blend = segment > 0.000001
          ? THREE.MathUtils.clamp((requestedDistance - travelled) / segment, 0, 1)
          : 0;
        return points[index - 1].clone().lerp(points[index], blend);
      }
      return points.at(-1).clone();
    };
    const revealOnHalf = (points) => {
      const length = points.slice(1).reduce(
        (sum, point, index) => sum + point.distanceTo(points[index]),
        0,
      );
      const courseCount = Math.max(1, Math.ceil(length / courseStep));
      const stepped = Math.min(
        length,
        Math.ceil(THREE.MathUtils.clamp(progress, 0, 1) * courseCount) * courseStep,
      );
      return pointAlong(points, stepped);
    };
    const leftHalf = profile.slice(0, crownIndex + 1);
    const rightHalf = profile.slice(crownIndex).reverse();
    const leftReveal = revealOnHalf(leftHalf);
    const rightReveal = revealOnHalf(rightHalf);
    const horizontalAxis = profile.at(-1).clone().sub(profile[0]);
    horizontalAxis.y = 0;
    if (horizontalAxis.lengthSq() < 0.000001) {
      this.setConstructionClip(child, progress, 'y');
      return;
    }
    horizontalAxis.normalize();
    const leftLimit = horizontalAxis.dot(leftReveal);
    const rightLimit = horizontalAxis.dot(rightReveal);
    const planes = [
      new THREE.Plane(horizontalAxis.clone().negate(), leftLimit),
      new THREE.Plane(horizontalAxis.clone(), -rightLimit),
    ];
    materials.forEach((material) => {
      material.clippingPlanes = planes.map((plane) => plane.clone());
      material.clipIntersection = true;
      material.userData.constructionRevealMode = 'two-sided-vault-courses-feet-to-crown';
      material.needsUpdate = true;
    });
    if (progress > 0.001 && progress < 0.999999) {
      this.syncConstructionCap(child, planes[0], 'vault-left-reveal');
      this.syncConstructionCap(child, planes[1], 'vault-right-reveal');
    } else this.hideConstructionCapsFor(child);
    child.userData.constructionVaultCourseSequence = {
      direction: 'both-springing-feet-to-crown',
      progress: THREE.MathUtils.clamp(progress, 0, 1),
    };
  }

  setConstructionStepOrder(stepIds = []) {
    this.constructionStepOrder = normalizeConstructionStepOrder(stepIds);
    this.constructionStepRank = new Map(this.constructionStepOrder.map((id, index) => [id, index]));
  }

  constructionRankFor(stepId) {
    return this.constructionStepRank?.get(stepId) ?? CONSTRUCTION_STEP_INDEX[stepId] ?? Number.POSITIVE_INFINITY;
  }

  applyHallConstructionStep(stepId, rank, stepProgress, wallSystem) {
    const complete = stepId === 'complete';
    const stageRank = (id) => this.constructionRankFor(id);
    const stageReached = (id) => complete || rank >= stageRank(id);
    const currentStage = (id) => stepId === id;
    const categories = {
      'lower-walls': [],
      'hall-vaults': [],
      'hall-transverse-vaults': [],
      'hall-barrel-spandrels': [],
      'hall-barrel-axis-vaults': [],
      'hall-barrel-surrounding-walls': [],
      'hall-barrel-under-vault-walls': [],
      'hall-walls': [],
      'hall-transition': [],
      'hall-cover': [],
    };
    const categoryFor = (child) => {
      const barrelMode = this.building.hallCoverType === 'barrel';
      if (child.userData?.isHallBarrelSpandrelInfill === true) return 'hall-barrel-spandrels';
      if (child.userData?.isHallVaultArch === true) {
        if (!barrelMode) return 'hall-vaults';
        const barrelAxis = this.building.hallBarrelAxis === 'y' ? 'y' : 'x';
        return child.userData?.hallVaultDirection === barrelAxis
          ? 'hall-barrel-axis-vaults'
          : 'hall-transverse-vaults';
      }
      if (child.userData?.isHallBoundaryVaultInfill === true) {
        return barrelMode ? 'hall-barrel-under-vault-walls' : 'hall-walls';
      }
      if (child.userData?.isHallPerimeterWall === true) {
        return barrelMode ? 'hall-barrel-surrounding-walls' : 'hall-walls';
      }
      if (child.userData?.isHallBayTransition === true) return 'hall-transition';
      if (child.userData?.isHallBayCover === true
        || child.userData?.isHallRibVaultIntersectionLine === true) return 'hall-cover';
      const side = child.userData?.wallSide;
      if (child.userData?.isHallBearingColumn === true
        || side === 'hall_columns') return 'lower-walls';
      if (child.userData?.isBrickFace === true
        || ['north', 'south', 'east', 'west'].includes(side)) {
        return barrelMode ? 'hall-barrel-surrounding-walls' : 'hall-walls';
      }
      return null;
    };
    wallSystem?.traverse((child) => {
      if (child === wallSystem || (!child.isMesh && !child.isLine && !child.isLineSegments)) return;
      if (child.userData?.roomDomePart === 'springing-ring') {
        // Hall/Grid bay domes intentionally suppress the optional Room ring.
        child.visible = false;
        if (child.isMesh && child.userData?.constructionOriginalMaterial) this.clearConstructionClip(child);
        return;
      }
      if (child.userData?.isKarbandiVisualGuide === true
        || child.userData?.isHallArchConstructionGuide === true) {
        child.visible = complete;
        return;
      }
      const category = categoryFor(child);
      if (category) categories[category].push(child);
      else child.visible = complete;
    });
    Object.entries(categories).forEach(([stageId, objects]) => {
      const domePartOrder = (child) => ({
        'dome-drum': 0,
        'dome-extra-leg': 1,
        'between-dome-support-wall': 2,
        'springing-ring': 3,
        'dome-shell': 4,
        'inner-dome-shell': 4,
      })[child.userData?.roomDomePart] ?? 3;
      const hallVaultConstructionBay = (child) => {
        const directBay = child.userData?.hallBay;
        const edge = child.userData?.hallGridEdge;
        const gridX = Math.max(1, Math.round(Number(this.building.hallGridX) || 1));
        const gridY = Math.max(1, Math.round(Number(this.building.hallGridY) || 1));
        const spansX = this.building.buildingType === 'grid'
          ? this.building.gridBaySpansX
          : Array(gridX).fill(Number(this.building.hallBayWidth) || 4);
        const spansY = this.building.buildingType === 'grid'
          ? this.building.gridBaySpansY
          : Array(gridY).fill(Number(this.building.hallBayDepth) || 4);
        const width = spansX.reduce((sum, span) => sum + span, 0);
        const depth = spansY.reduce((sum, span) => sum + span, 0);
        const boundaries = (start, spans) => spans.reduce(
          (values, span) => [...values, values.at(-1) + span],
          [start],
        );
        const xBoundaries = boundaries(-width / 2, spansX);
        const zBoundaries = boundaries(-depth / 2, spansY);
        child.updateWorldMatrix(true, false);
        const center = new THREE.Box3().setFromObject(child).getCenter(new THREE.Vector3());
        const nearestBoundary = (coordinate, values) => values.reduce((best, value, index) => (
          Math.abs(value - coordinate) < Math.abs(values[best] - coordinate) ? index : best
        ), 0);
        const containingBay = (coordinate, values) => THREE.MathUtils.clamp(
          values.findIndex((boundary, index) => index > 0 && coordinate <= boundary + 0.000001) - 1,
          0,
          values.length - 2,
        );
        if (Array.isArray(directBay)
          && (child.userData?.isHallBayTransition === true
            || child.userData?.isHallBayCover === true
            || child.userData?.isHallRibVaultIntersectionLine === true)) {
          return [containingBay(center.x, xBoundaries), containingBay(center.z, zBoundaries)];
        }
        if (Array.isArray(directBay)
          && child.userData?.isHallVaultArch !== true
          && child.userData?.isHallBoundaryVaultInfill !== true) return directBay;
        if (child.userData?.isHallBoundaryVaultInfill === true) {
          const side = child.userData?.wallSide;
          const ix = containingBay(center.x, xBoundaries);
          const iy = containingBay(center.z, zBoundaries);
          if (side === 'north') return [ix, 0];
          if (side === 'south') return [ix, gridY - 1];
          if (side === 'west') return [0, iy];
          if (side === 'east') return [gridX - 1, iy];
        }
        if (!Array.isArray(edge)) return [0, 0];
        const ix = child.userData?.hallVaultDirection === 'y'
          ? nearestBoundary(center.x, xBoundaries)
          : containingBay(center.x, xBoundaries);
        const iy = child.userData?.hallVaultDirection === 'x'
          ? nearestBoundary(center.z, zBoundaries)
          : containingBay(center.z, zBoundaries);
        return child.userData?.hallVaultDirection === 'y'
          ? [THREE.MathUtils.clamp(ix - 1, 0, gridX - 1), THREE.MathUtils.clamp(iy, 0, gridY - 1)]
          : [THREE.MathUtils.clamp(ix, 0, gridX - 1), THREE.MathUtils.clamp(iy - 1, 0, gridY - 1)];
      };
      const bayBatchedStage = [
        'hall-vaults', 'hall-transverse-vaults', 'hall-barrel-axis-vaults',
        'hall-transition', 'hall-cover',
      ].includes(stageId);
      if (bayBatchedStage) {
        objects.forEach((child) => {
          child.userData.hallConstructionBay = hallVaultConstructionBay(child);
        });
      }
      const ordered = [...objects].sort((left, right) => {
        const leftConstructionBay = bayBatchedStage
          ? hallVaultConstructionBay(left)
          : null;
        const rightConstructionBay = bayBatchedStage
          ? hallVaultConstructionBay(right)
          : null;
        const leftBay = left.userData?.hallBay || left.userData?.hallGridEdge || left.userData?.hallGridIntersection || [];
        const rightBay = right.userData?.hallBay || right.userData?.hallGridEdge || right.userData?.hallGridIntersection || [];
        return Number(leftConstructionBay?.[0] ?? leftBay[0] ?? 0) - Number(rightConstructionBay?.[0] ?? rightBay[0] ?? 0)
          || Number(leftConstructionBay?.[1] ?? leftBay[1] ?? 0) - Number(rightConstructionBay?.[1] ?? rightBay[1] ?? 0)
          || (stageId === 'hall-cover' ? domePartOrder(left) - domePartOrder(right) : 0)
          || String(left.name).localeCompare(String(right.name));
      });
      const batches = bayBatchedStage
        ? [...ordered.reduce((groups, child) => {
          const bay = hallVaultConstructionBay(child);
          const key = `${bay[0]}:${bay[1]}`;
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(child);
          return groups;
        }, new Map()).values()]
        : ['lower-walls', 'hall-walls', 'hall-barrel-spandrels', 'hall-barrel-surrounding-walls',
          'hall-barrel-under-vault-walls'].includes(stageId)
          ? [ordered]
        : ordered.map((child) => [child]);
      batches.forEach((batch, index) => {
        const localProgress = currentStage(stageId)
          ? THREE.MathUtils.clamp(stepProgress * Math.max(1, batches.length) - index, 0, 1)
          : stageReached(stageId) ? 1 : 0;
        batch.forEach((child) => {
          const componentProgress = currentStage('hall-walls')
            ? child.userData?.isHallBoundaryVaultInfill === true
              ? THREE.MathUtils.clamp(localProgress * 2 - 1, 0, 1)
              : THREE.MathUtils.clamp(localProgress * 2, 0, 1)
            : localProgress;
          child.visible = componentProgress > 0.001;
          if (!child.isMesh || !child.visible) return;
          if (currentStage(stageId)
            && ['hall-vaults', 'hall-transverse-vaults', 'hall-barrel-axis-vaults'].includes(stageId)
            && child.userData?.isHallVaultArch === true) {
            this.setTwoSidedVaultCourseConstructionClip(child, componentProgress);
          } else if (currentStage(stageId) && stageId === 'hall-transition'
            && child.userData?.isHallFourVaultPendentive === true) {
            this.setRoomCircularCourseConstructionReveal(child, componentProgress);
          } else if (currentStage(stageId) && stageId === 'hall-cover'
            && ['dome-drum', 'dome-extra-leg', 'dome-shell', 'inner-dome-shell']
              .includes(child.userData?.roomDomePart)) {
            this.setRoomCircularCourseConstructionReveal(child, componentProgress);
          } else if (currentStage(stageId) && stageId === 'hall-cover'
            && child.userData?.isHallBarrelCover === true) {
            this.setHallBarrelSpanConstructionClip(child, componentProgress);
          } else if (currentStage(stageId)) {
            const beginsAtOwnLowestCourse = ['hall-barrel-spandrels', 'hall-barrel-under-vault-walls']
              .includes(stageId);
            this.setConstructionClip(
              child,
              componentProgress,
              'y',
              beginsAtOwnLowestCourse ? Number.NaN : 0,
            );
          }
          else this.clearConstructionClip(child);
        });
      });
    });
    this.archInfillGroup.visible = stageReached('lower-walls');
    this.placementGroup.visible = stageReached('room-decoration');
    this.placementMaskGroup.visible = complete;
    this.zoneGroup.visible = complete;
    this.zoneDecorationGroup.visible = stageReached('room-decoration');
    this.constructionGuideGroup.visible = false;
    this.updateKarbandiReferenceHighlight();
    this.updateWallSurfaceHighlight();
  }

  applyRoomConstructionStep(stepId, rank, stepProgress, wallSystem) {
    const complete = stepId === 'complete';
    const stageRank = (id) => this.constructionRankFor(id);
    const stageReached = (id) => complete || rank >= stageRank(id);
    const stageFinished = (id) => complete || rank > stageRank(id);
    const currentStage = (id) => stepId === id;
    const roomRibs = [];
    const roomRoofPanels = [];
    const roomBrickDecorations = [];
    const squinchArchRibs = [];
    const squinchUnderArchWalls = [];
    const squinchUpperInfills = [];
    wallSystem?.traverse((child) => {
      if (child.isMesh && child.userData?.isKarbandi === true) roomRibs.push(child);
      if (child.isMesh && child.userData?.isKarbandiCover === true) roomRoofPanels.push(child);
      if (child.isMesh && child.userData?.isImportedWallDecoration === true) roomBrickDecorations.push(child);
      if (child.isMesh && child.userData?.roomDomePart === 'squinch-transition-rib') squinchArchRibs.push(child);
      if (child.isMesh && child.userData?.isRoomSquinchVerticalWallExtension === true) squinchUnderArchWalls.push(child);
      if (child.isMesh && child.userData?.roomDomePart === 'squinch-transition-cover') squinchUpperInfills.push(child);
    });
    const ribIndexes = [...new Set(roomRibs.map((rib) => rib.userData.karbandiRibIndex))]
      .sort((a, b) => Number(a) - Number(b));
    const visibleRibCount = currentStage('room-karbandi-ribs')
      ? Math.ceil(stepProgress * ribIndexes.length)
      : (stageFinished('room-karbandi-ribs') ? ribIndexes.length : 0);
    const visibleRibIndexes = new Set(ribIndexes.slice(0, visibleRibCount));
    const roofPanelIndexes = [...new Set(roomRoofPanels.map((panel) => panel.userData.karbandiRoofPanel))]
      .sort((a, b) => Number(a) - Number(b));
    const visibleDecorationCount = currentStage('room-decoration')
      ? Math.ceil(stepProgress * roomBrickDecorations.length)
      : (stageFinished('room-decoration') ? roomBrickDecorations.length : 0);
    const visibleDecorations = new Set(roomBrickDecorations.slice(0, visibleDecorationCount));
    const squinchArchIndexes = [...new Set(squinchArchRibs.map((rib) => (
      Number(rib.userData?.roomSquinchArchIndex) || 0
    )))].sort((a, b) => a - b);
    const showVerticalStage = (child, id) => {
      child.visible = stageReached(id) && (!currentStage(id) || stepProgress > 0.001);
      if (!child.isMesh || !child.visible) return;
      if (currentStage(id)) this.setConstructionClip(child, stepProgress, 'y');
      else this.clearConstructionClip(child);
    };
    const showCircularCourseStage = (child, id) => {
      child.visible = stageReached(id) && (!currentStage(id) || stepProgress > 0.001);
      if (!child.isMesh || !child.visible) return;
      // The circular-course shader is animation-only. Never create it while
      // applying a later or completed stage; the permanent dome material must
      // own the terminal model and the next architecture rebuild.
      if (currentStage(id)) this.setRoomCircularCourseConstructionReveal(child, stepProgress);
      else this.clearConstructionClip(child);
    };
    const stoneSkirtEnabled = this.walls.stoneBase?.enabled === true
      && Number(this.walls.stoneBase?.height) > 0.000001;
    const stoneSkirtHeight = stoneSkirtEnabled ? Number(this.walls.stoneBase.height) : 0;
    const usesFollowBuildingSkirt = stoneSkirtEnabled
      && (this.walls.stoneBase?.planShape || 'follow') === 'follow';
    const verticalWallSides = new Set(['east', 'west', 'south', 'north', 'north_sides', 'north_top']);
    const structuralBounds = new THREE.Box3();
    wallSystem?.traverse((child) => {
      if (!child.isMesh) return;
      const side = child.userData?.wallSide;
      const isStructuralWall = verticalWallSides.has(side) && !child.userData?.roomDomePart
        && child.userData?.isImportedWallDecoration !== true;
      if (isStructuralWall || child.userData?.isRoomExteriorColumn === true) {
        structuralBounds.union(new THREE.Box3().setFromObject(child));
      }
    });
    const structuralBottom = structuralBounds.isEmpty() ? 0 : structuralBounds.min.y;
    const structuralTop = structuralBounds.isEmpty()
      ? Math.max(0.5, Number(this.building.height) || 0.5)
      : structuralBounds.max.y;
    const wallStageOrigin = stoneSkirtEnabled
      ? THREE.MathUtils.clamp(stoneSkirtHeight, structuralBottom, structuralTop)
      : structuralBottom;
    const sharedCourseLimit = (origin, top, progress) => {
      const courseHeight = Math.max(
        0.01,
        Number(this.walls.bricks?.brickHeight || 0.08) + Number(this.walls.bricks?.mortar || 0.01),
      );
      const courseCount = Math.max(1, Math.ceil(Math.max(0, top - origin) / courseHeight));
      const revealedCourses = Math.min(courseCount, Math.ceil(THREE.MathUtils.clamp(progress, 0, 1) * courseCount));
      return Math.min(top, origin + revealedCourses * courseHeight);
    };
    const boundsFor = (objects) => objects.reduce(
      (bounds, child) => bounds.union(new THREE.Box3().setFromObject(child)),
      new THREE.Box3(),
    );
    const squinchUnderWallBounds = boundsFor(squinchUnderArchWalls);
    const squinchUpperInfillBounds = boundsFor(squinchUpperInfills);
    const showSharedVerticalStage = (child, id, bounds) => {
      const reached = stageReached(id);
      child.visible = reached && (!currentStage(id) || stepProgress > 0.001);
      if (!child.isMesh || !child.visible) return;
      if (currentStage(id) && !bounds.isEmpty()) {
        const limit = sharedCourseLimit(bounds.min.y, bounds.max.y, stepProgress);
        this.setSharedVerticalCourseConstructionClip(
          child, limit, bounds.min.y, bounds.max.y, stepProgress,
        );
      } else this.clearConstructionClip(child);
    };
    const showRoomStructureStage = (child, includeColumnBaseWithSkirt = false) => {
      const skirtIsCurrent = currentStage('room-skirt');
      const wallIsCurrent = currentStage('lower-walls');
      const participatesInSkirt = usesFollowBuildingSkirt || (includeColumnBaseWithSkirt && stoneSkirtEnabled);
      const skirtReached = participatesInSkirt && stageReached('room-skirt');
      const wallReached = stageReached('lower-walls');
      child.visible = wallReached || (skirtReached && (!skirtIsCurrent || stepProgress > 0.001));
      if (!child.isMesh || !child.visible) return;
      if (skirtIsCurrent && participatesInSkirt) {
        const skirtLimit = sharedCourseLimit(structuralBottom, wallStageOrigin, stepProgress);
        this.setSharedVerticalCourseConstructionClip(
          child, skirtLimit, structuralBottom, structuralTop, stepProgress,
        );
      } else if (wallIsCurrent) {
        const wallLimit = sharedCourseLimit(wallStageOrigin, structuralTop, stepProgress);
        this.setSharedVerticalCourseConstructionClip(
          child, wallLimit, structuralBottom, structuralTop, stepProgress,
        );
      } else {
        this.clearConstructionClip(child);
      }
    };
    const showDoorStepStage = (child) => {
      const stepNumber = Math.max(1, Number(child.userData?.doorStepNumber) || 1);
      const stepCount = Math.max(stepNumber, Number(child.userData?.doorStepCount) || stepNumber);
      const localProgress = currentStage('room-skirt')
        ? THREE.MathUtils.clamp(stepProgress * stepCount - (stepNumber - 1), 0, 1)
        : (stageFinished('room-skirt') ? 1 : 0);
      child.visible = complete || localProgress > 0.001;
      if (!child.isMesh || !child.visible) return;
      if (currentStage('room-skirt')) this.setConstructionClip(child, localProgress, 'y');
      else this.clearConstructionClip(child);
      child.userData.roomConstructionDoorStepSequence = 'one-tread-and-riser-at-a-time';
      child.userData.roomConstructionDoorStepProgress = localProgress;
    };

    wallSystem?.traverse((child) => {
      if (!child.isObject3D || child === wallSystem) return;
      const part = child.userData?.roomDomePart;
      const side = child.userData?.wallSide;
      if (child.userData?.isRaisedInteriorFloor === true) {
        showVerticalStage(child, 'room-skirt');
        child.userData.roomConstructionRaisedFloorSequence = 'with-stone-skirt-bottom-to-top';
        return;
      }
      if (child.userData?.isDoorStep === true) {
        showDoorStepStage(child);
        return;
      }
      if (child.userData?.isIndependentStoneSkirt === true) {
        showVerticalStage(child, 'room-skirt');
        child.userData.roomConstructionStoneBaseSequence = 'first-bottom-to-top-stage';
        return;
      }
      if (child.userData?.isRoomExteriorColumn === true) {
        showRoomStructureStage(child, true);
        child.userData.roomConstructionColumnSequence = 'with-walls-bottom-to-top';
        return;
      }
      if (child.userData?.isSoldierCourse === true && verticalWallSides.has(side) && !part) {
        showRoomStructureStage(child);
        child.userData.roomConstructionOpeningCourseSequence = 'same-world-height-course-as-attached-wall';
        return;
      }
      if (child.userData?.isKarbandiVisualGuide === true) {
        child.visible = complete && (
          child.userData?.isKarbandiArchIntersectionGuide === true
            ? this.walls.karbandi?.archIntersectionGuideVisible === true
            : this.walls.karbandi?.guideVisible === true
        );
        return;
      }
      if (child.userData?.isBrickFace === true) {
        if (child.userData?.isImportedWallDecoration === true) {
          // Imported decoration is intentionally applied after construction.
          child.visible = complete || visibleDecorations.has(child);
          if (child.visible && child.userData?.constructionOriginalMaterial) this.clearConstructionClip(child);
        } else {
          // Built-in running/stack/Flemish bonds are the wall's actual finish,
          // not a second decoration layer. Build them with their owning wall so
          // the saved perimeter phase remains continuous through every corner.
          showRoomStructureStage(child);
        }
        return;
      }
      if (child.userData?.isKarbandiCover === true) {
        const panelIndex = roofPanelIndexes.indexOf(child.userData.karbandiRoofPanel);
        const panelProgress = currentStage('room-karbandi-roof')
          ? THREE.MathUtils.clamp(stepProgress * Math.max(1, roofPanelIndexes.length) - panelIndex, 0, 1)
          : (stageFinished('room-karbandi-roof') ? 1 : 0);
        child.visible = complete || panelProgress > 0.001;
        if (child.isMesh && child.visible) {
          if (currentStage('room-karbandi-roof')) {
            // Wall-supported Karbandi panels continue upward with the same
            // horizontal brick-course reveal as their adjacent wall. Other
            // roof cells use the same bottom-to-top masonry discipline.
            this.setConstructionClip(child, panelProgress, 'y');
          } else this.clearConstructionClip(child);
        }
        return;
      }
      if (child.userData?.isKarbandi === true) {
        child.visible = complete || visibleRibIndexes.has(child.userData.karbandiRibIndex);
        if (child.isMesh && child.visible) this.clearConstructionClip(child);
        return;
      }
      if (part === 'squinch-transition-rib') {
        const sequenceIndex = squinchArchIndexes.indexOf(Number(child.userData?.roomSquinchArchIndex) || 0);
        const archProgress = currentStage('room-squinch-arches')
          ? THREE.MathUtils.clamp(stepProgress * Math.max(1, squinchArchIndexes.length) - sequenceIndex, 0, 1)
          : (stageFinished('room-squinch-arches') ? 1 : 0);
        child.visible = complete || archProgress > 0.001;
        if (child.isMesh && child.visible) {
          if (currentStage('room-squinch-arches')) {
            this.setTwoSidedVaultCourseConstructionClip(child, archProgress);
          } else this.clearConstructionClip(child);
        }
        child.userData.roomSquinchConstructionSequence = 'one-arch-at-a-time-both-feet-to-crown';
        child.userData.roomSquinchConstructionArchProgress = archProgress;
        return;
      }
      if (child.userData?.isRoomSquinchVerticalWallExtension === true) {
        showSharedVerticalStage(child, 'room-squinch-under-arch-walls', squinchUnderWallBounds);
        child.userData.roomSquinchConstructionSequence = 'after-all-arches-shared-bottom-to-top-wall-courses';
        return;
      }
      if ((child.userData?.isRoomDomeTransitionDetail === true && part !== 'springing-ring')
        || ['exterior-aligned-octagon-wall', 'octagon-inherited-opening-soldier']
          .includes(part)
        || ['squinch-transition-rib', 'pendentive-transition-rib', 'muqarnas-transition-rib'].includes(part)) {
        showVerticalStage(child, 'room-transition-structure');
        return;
      }
      if (part === 'karbandi-roof-to-drum-infill-top'
        || (part === 'transition-cover' && child.userData?.isKarbandiCover !== true)) {
        showVerticalStage(child, 'room-transition-cover');
        return;
      }
      if (part === 'squinch-transition-cover') {
        showSharedVerticalStage(child, 'room-transition-cover', squinchUpperInfillBounds);
        child.userData.roomSquinchConstructionSequence = 'after-under-arch-walls-shared-courses-to-drum';
        return;
      }
      if (part === 'dome-drum') {
        showCircularCourseStage(child, 'room-drum');
        return;
      }
      if (part === 'dome-extra-leg') {
        showCircularCourseStage(child, 'room-extra-leg');
        return;
      }
      if (part === 'dome-shell' || part === 'inner-dome-shell') {
        showCircularCourseStage(child, 'room-dome');
        return;
      }
      if (part === 'between-dome-support-wall') {
        showVerticalStage(child, 'room-dome');
        return;
      }
      if (part === 'springing-ring') {
        const coverType = this.building.domeCoverType || 'dome';
        if (this.building.domeOuterRingEnabledByCoverType?.[coverType] === false) {
          child.visible = false;
          if (child.isMesh && child.userData?.constructionOriginalMaterial) this.clearConstructionClip(child);
        } else showCircularCourseStage(child, 'room-outer-ring');
        return;
      }
      if (verticalWallSides.has(side) && !part) {
        showRoomStructureStage(child);
        child.userData.roomConstructionIncludesStoneBase = this.walls.stoneBase?.enabled === true;
        child.userData.roomConstructionStoneBaseSequence = 'skirt-first-then-walls-with-exterior-columns';
        return;
      }
      if (side === 'room_dome_transition' || side === 'room_dome' || side === 'room_dome_inner' || side === 'room_dome_extra_leg' || side === 'room_dome_drum' || side === 'room_dome_ring') {
        child.visible = complete;
      }
    });
    this.archInfillGroup.visible = complete || stageReached('lower-walls');
    this.placementGroup.visible = true;
    this.placementGroup.children.forEach((root) => {
      if (root.userData?.assetType === 'muqarnas_assembly') {
        root.visible = stageReached('room-transition-structure')
          && (!currentStage('room-transition-structure') || stepProgress > 0.001);
        const modules = root.children.filter((child) => child.isObject3D)
          .sort((left, right) => {
            const leftBox = new THREE.Box3().setFromObject(left);
            const rightBox = new THREE.Box3().setFromObject(right);
            return leftBox.min.y - rightBox.min.y || String(left.name).localeCompare(String(right.name));
          });
        const visibleCount = currentStage('room-transition-structure')
          ? Math.ceil(stepProgress * modules.length)
          : modules.length;
        modules.forEach((module, index) => { module.visible = root.visible && index < visibleCount; });
        return;
      }
      root.visible = stageReached('room-decoration')
        && (!currentStage('room-decoration') || stepProgress > 0.001);
      root.traverse((child) => {
        if (!child.isMesh || !root.visible) return;
        if (currentStage('room-decoration')) this.setConstructionClip(child, stepProgress, 'y');
        else this.clearConstructionClip(child);
      });
    });
    this.placementMaskGroup.visible = complete;
    this.zoneGroup.visible = complete;
    this.zoneDecorationGroup.visible = stageReached('room-decoration');
    const zoneDecorationMeshes = [];
    this.zoneDecorationGroup.traverse((child) => {
      if (child.isMesh) zoneDecorationMeshes.push(child);
    });
    const visibleZoneDecorationCount = currentStage('room-decoration')
      ? Math.ceil(stepProgress * zoneDecorationMeshes.length)
      : zoneDecorationMeshes.length;
    zoneDecorationMeshes.forEach((child, index) => {
      child.visible = this.zoneDecorationGroup.visible && index < visibleZoneDecorationCount;
      if (child.visible && child.userData?.constructionOriginalMaterial) this.clearConstructionClip(child);
    });
    this.constructionGuideGroup.visible = false;
    this.updateKarbandiReferenceHighlight();
    this.updateWallSurfaceHighlight();
  }

  applyConstructionStep(stepIndex = CONSTRUCTION_STEPS.length - 1, progress = 1) {
    this.ensureConstructionInteractionAvailable();
    this.beginConstructionCapFrame();
    const nextStepIndex = Math.max(0, Math.min(CONSTRUCTION_STEPS.length - 1, Math.round(stepIndex)));
    const nextProgress = Math.max(0, Math.min(1, progress));
    const stepChanged = nextStepIndex !== this.constructionStepIndex;
    const stepJustCompleted = nextProgress >= 0.999999 && this.constructionStepProgress < 0.999999;
    // Geometry visibility and clipping still render every frame, but the
    // expensive shadow map only needs a refresh at construction boundaries.
    this.invalidate(stepChanged || stepJustCompleted);
    this.constructionStepIndex = nextStepIndex;
    const stepId = CONSTRUCTION_STEPS[this.constructionStepIndex]?.id || 'complete';
    const rank = this.constructionRankFor(stepId);
    const wallSystem = this.wallSystemRoot();
    const stepProgress = nextProgress;
    this.constructionStepProgress = stepProgress;
    if (['hall', 'grid'].includes(this.building.buildingType)) {
      this.applyHallConstructionStep(stepId, rank, stepProgress, wallSystem);
      return;
    }
    if (this.building.type === 'room') {
      this.applyRoomConstructionStep(stepId, rank, stepProgress, wallSystem);
      return;
    }
    const northMetrics = this.northOpeningMetrics();
    const southUnderArchRank = this.constructionRankFor('south-wall');
    const archFillRank = this.constructionRankFor('arch-fill');
    const lowerWallsRank = this.constructionRankFor('lower-walls');
    const northUpperRank = this.constructionRankFor('north-upper-wall');
    const karbandiReferenceRank = this.constructionRankFor('karbandi-reference-rib');
    const karbandiRibsRank = this.constructionRankFor('karbandi-ribs');
    const karbandiRoofRank = this.constructionRankFor('karbandi-roof');
    const portalTransitionRank = this.constructionRankFor('portal-transition');
    const portalDrumRank = this.constructionRankFor('portal-drum');
    const portalExtraLegRank = this.constructionRankFor('portal-extra-leg');
    const portalOuterRingRank = this.constructionRankFor('portal-outer-ring');
    const portalCoverRank = this.constructionRankFor('portal-cover');
    const showSouthUnderArch = rank >= southUnderArchRank;
    const showLowerWalls = rank >= lowerWallsRank;
    const showArch = rank >= archFillRank;
    const showNorthUpper = rank >= northUpperRank;
    const showEverything = stepId === 'complete';
    const karbandiRibMeshes = [];
    const karbandiCoverMeshes = [];
    wallSystem?.traverse((child) => {
      if (child.isMesh && child.userData?.isKarbandi) karbandiRibMeshes.push(child);
      if (child.isMesh && child.userData?.isKarbandiCover) karbandiCoverMeshes.push(child);
    });
    const ribIndexes = [...new Set(karbandiRibMeshes.map((rib) => rib.userData.karbandiRibIndex))].sort((a, b) => a - b);
    const otherRibIndexes = ribIndexes.filter((index) => index !== 0);
    const visibleOtherRibCount = stepId === 'karbandi-ribs'
      ? Math.ceil(stepProgress * otherRibIndexes.length)
      : (rank > karbandiRibsRank ? otherRibIndexes.length : 0);
    const visibleRibIndexes = new Set([
      ...(rank >= karbandiReferenceRank ? [0] : []),
      ...otherRibIndexes.slice(0, visibleOtherRibCount),
    ]);
    const roofPanelIndexes = [...new Set(karbandiCoverMeshes.map((panel) => panel.userData.karbandiRoofPanel))].sort((a, b) => a - b);
    const visibleRoofPanelCount = stepId === 'karbandi-roof'
      ? Math.ceil(stepProgress * roofPanelIndexes.length)
      : (rank > karbandiRoofRank ? roofPanelIndexes.length : 0);
    const visibleRoofPanelIndexes = new Set(roofPanelIndexes.slice(0, visibleRoofPanelCount));
    wallSystem?.traverse((child) => {
      if (!child.isObject3D) return;
      if (child.userData?.isKarbandiVisualGuide === true) {
        const guideEnabled = child.userData?.isKarbandiArchIntersectionGuide === true
          ? this.walls.karbandi?.archIntersectionGuideVisible === true
          : this.walls.karbandi?.guideVisible === true;
        child.visible = showEverything && guideEnabled;
        return;
      }
      const side = child.userData?.wallSide;
      if (child.userData?.isBrickFace) {
        this.applyConstructionDecoration(child, stepId, rank, stepProgress);
        return;
      }
      if (child.userData?.isKarbandiCover === true) {
        child.visible = showEverything || visibleRoofPanelIndexes.has(child.userData.karbandiRoofPanel);
        if (child.isMesh && child.visible) this.clearConstructionClip(child);
        return;
      }
      if (child.userData?.isKarbandi === true) {
        const ribIndex = child.userData.karbandiRibIndex;
        child.visible = showEverything || visibleRibIndexes.has(ribIndex);
        if (child.isMesh && stepId === 'karbandi-reference-rib' && child.userData.isKarbandiReference) {
          this.setConstructionClip(child, stepProgress, 'y');
        } else if (child.isMesh && child.visible) {
          this.clearConstructionClip(child);
        }
        return;
      }
      const roomDomePart = child.userData?.roomDomePart;
      const isPortalRaisedRibCover = child.userData?.isPortalHalfBayCover === true
        && child.userData?.portalCoverType === 'raised-rib-vault';
      if (isPortalRaisedRibCover) {
        const coverReached = showEverything || rank >= portalCoverRank;
        if (child.isLineSegments) {
          // Mortar/groin lines must not float ahead of the masonry shell.
          child.visible = showEverything || rank > portalCoverRank;
        } else {
          child.visible = coverReached;
          if (child.isMesh && child.visible) {
            if (stepId === 'portal-cover') {
              const bounds = new THREE.Box3().setFromObject(child);
              this.setConstructionClip(child, stepProgress, 'y', bounds.min.y, bounds.max.y);
              child.userData.portalRaisedRibConstructionSequence = 'horizontal-brick-courses-bottom-to-crown';
            } else this.clearConstructionClip(child);
          }
        }
        return;
      }
      const isPortalTransitionPart = child.userData?.isRoomDomeTransition === true
        || (child.userData?.isRoomDomeTransitionDetail === true && roomDomePart !== 'springing-ring')
        || child.userData?.isRoomSquinchVerticalWallExtension === true;
      if (isPortalTransitionPart) {
        child.visible = showEverything || rank >= portalTransitionRank;
        if (child.isMesh && child.visible) {
          if (stepId === 'portal-transition' && roomDomePart === 'squinch-transition-rib') {
            this.setTwoSidedVaultCourseConstructionClip(child, stepProgress);
          } else if (stepId === 'portal-transition') this.setConstructionClip(child, stepProgress, 'y');
          else this.clearConstructionClip(child);
        }
        return;
      }
      const portalCircularStage = (stageId, stageRank) => {
        child.visible = showEverything || rank >= stageRank;
        if (!child.isMesh || !child.visible) return;
        if (stepId === stageId) this.setRoomCircularCourseConstructionReveal(child, stepProgress);
        else this.clearConstructionClip(child);
      };
      if (roomDomePart === 'dome-drum') {
        portalCircularStage('portal-drum', portalDrumRank);
        return;
      }
      if (roomDomePart === 'dome-extra-leg') {
        portalCircularStage('portal-extra-leg', portalExtraLegRank);
        return;
      }
      if (['dome-shell', 'inner-dome-shell'].includes(roomDomePart)) {
        portalCircularStage('portal-cover', portalCoverRank);
        return;
      }
      if (roomDomePart === 'between-dome-support-wall') {
        child.visible = showEverything || rank >= portalCoverRank;
        if (child.isMesh && child.visible) {
          if (stepId === 'portal-cover') this.setConstructionClip(child, stepProgress, 'y');
          else this.clearConstructionClip(child);
        }
        return;
      }
      if (roomDomePart === 'springing-ring') {
        if (this.building.domeOuterRingEnabledByCoverType?.dome === false) {
          child.visible = false;
          if (child.isMesh && child.userData?.constructionOriginalMaterial) this.clearConstructionClip(child);
        } else portalCircularStage('portal-outer-ring', portalOuterRingRank);
        return;
      }
      const isSouthUnderArch = child.userData?.isSouthArchCap === true;
      if (isSouthUnderArch) {
        child.visible = showSouthUnderArch || showEverything;
        if (child.isMesh && stepId === 'south-wall') {
          this.applySouthUnderArchConstruction(child, stepProgress, northMetrics);
        } else if (child.isMesh && child.visible) {
          this.clearConstructionClip(child);
        }
        return;
      }
      const isArch = child.userData?.isPointedArch || side === 'arch';
      if (isArch) {
        child.visible = showArch || showEverything;
        if (child.isMesh && stepId === 'arch-fill') {
          this.setArchCourseConstructionClip(child, stepProgress, northMetrics);
        } else if (child.isMesh && child.visible) {
          this.clearConstructionClip(child);
        }
        return;
      }
      if (stepId === 'south-wall') {
        this.applyLowerWallConstruction(child, 1, northMetrics);
      } else if (stepId === 'lower-walls') {
        this.applyLowerWallConstruction(child, stepProgress, northMetrics);
      } else if (stepId === 'north-upper-wall') {
        if (['east', 'west', 'south'].includes(side)) {
            child.visible = showLowerWalls;
          if (child.isMesh && child.visible) this.clearConstructionClip(child);
        } else {
            this.applyNorthUpperConstruction(child, stepProgress, northMetrics, true);
        }
      } else if (['east', 'west', 'south', 'north', 'north_sides', 'north_top'].includes(side)) {
        if (showEverything) {
          child.visible = true;
          if (child.isMesh) this.clearConstructionClip(child);
        } else if (showNorthUpper) {
          if (['east', 'west', 'south'].includes(side)) {
            child.visible = true;
            if (child.isMesh) this.clearConstructionClip(child);
          } else {
            this.applyNorthUpperConstruction(child, 1, northMetrics);
          }
        } else if (showLowerWalls) {
          this.applyLowerWallConstruction(child, 1, northMetrics);
        } else {
          child.visible = false;
        }
      } else if (child !== wallSystem && side) child.visible = showEverything;
    });
    this.archInfillGroup.visible = showEverything;
    this.applyPlacementDecorationSteps(stepId, rank, stepProgress);
    this.placementMaskGroup.visible = showEverything;
    this.zoneGroup.visible = showEverything;
    const firstDecorationRank = Math.min(...[
      'decorate-south', 'decorate-east', 'decorate-west', 'decorate-north-sides',
      'decorate-north-top', 'decorate-arch',
    ].map((id) => this.constructionRankFor(id)));
    this.zoneDecorationGroup.visible = showEverything || rank >= firstDecorationRank;
    this.syncConstructionGuides(rank, wallSystem);
    this.constructionGuideGroup.traverse((child) => {
      if (!child.isMesh || child.userData?.isNorthWallArchGuide !== true) return;
      if (stepId === 'north-arch-guide') {
        this.setArchCourseConstructionClip(child, stepProgress, northMetrics);
      } else {
        child.visible = true;
        this.clearConstructionClip(child);
      }
    });
    this.constructionGuideGroup.visible = true;
    this.updateKarbandiReferenceHighlight();
    this.updateWallSurfaceHighlight();
  }

  ensureConstructionInteractionAvailable(forceRelease = false, reconnect = false) {
    const hadActivePointerInteraction = Boolean(
      this.transformControls?.dragging === true
      || this.transformHandleActive === true
      || this.nightLightDrag
      || (Array.isArray(this.controls?._pointers) && this.controls._pointers.length > 0),
    );
    if (forceRelease) {
      this.transformHandleActive = false;
      this.nightLightDrag = null;
      if (this.transformControls) {
        this.transformControls.dragging = false;
        this.transformControls.axis = null;
      }
    }
    const transformDragging = !forceRelease
      && (this.transformControls?.dragging === true || this.transformHandleActive === true);
    const lightDragging = !forceRelease && Boolean(this.nightLightDrag);
    if (this.transformControls) this.transformControls.enabled = true;
    if (this.controls) {
      this.controls.enabled = !transformDragging && !lightDragging;
      if (forceRelease) {
        const interactionElement = this.renderer?.domElement;
        const capturedPointerIds = (Array.isArray(this.controls._pointers) ? this.controls._pointers : [])
          .map((pointer) => Number(pointer?.pointerId ?? pointer))
          .filter(Number.isFinite);
        capturedPointerIds.forEach((pointerId) => {
          try {
            if (interactionElement?.hasPointerCapture?.(pointerId)) interactionElement.releasePointerCapture(pointerId);
          } catch {
            // The browser may already have released this pointer after a
            // pointercancel or a window blur. Cleanup must remain idempotent.
          }
        });
        // OrbitControls keeps its gesture state separately from `enabled`.
        // Clear a missed pointer-up/cancel so the next drag starts normally
        // without moving the camera back to its saved position.
        this.controls.state = -1;
        if (Array.isArray(this.controls._pointers)) this.controls._pointers.length = 0;
        if (this.controls._pointerPositions) this.controls._pointerPositions = {};
        // Re-register OrbitControls through its public lifecycle API. This
        // clears document-level pointer listeners left behind when a frame or
        // pointer-up is missed while construction is changing the scene.
        if (reconnect && hadActivePointerInteraction
          && this.controls.disconnect && this.controls.connect && this.renderer?.domElement) {
          this.controls.disconnect();
          this.controls.connect(this.renderer.domElement);
        }
      }
    }
    if (this.renderer?.domElement?.style) this.renderer.domElement.style.pointerEvents = 'auto';
    if (forceRelease) {
      this.controls?.update?.();
      this.invalidate?.(true);
    }
    return this.controls?.enabled !== false;
  }

  restoreCompletedConstructionSnapshot() {
    try {
      this.restoreConstructionMaterials();
      this.applyConstructionStep(CONSTRUCTION_STEPS.length - 1, 1);
      // Enforce a hard terminal invariant. If a future construction branch
      // accidentally creates a reveal material while applying `complete`, it
      // must not survive into building selection or the next animation.
      this.restoreConstructionMaterials();
    } finally {
      this.ensureConstructionInteractionAvailable(true, true);
      this.invalidate?.(true);
    }
  }

  playConstructionSequence(duration = 15, onStep = null, onDone = null) {
    if (this.constructionTimer) clearTimeout(this.constructionTimer);
    if (this.constructionAnimationFrame) cancelAnimationFrame(this.constructionAnimationFrame);
    if (this.constructionWatchdog) clearTimeout(this.constructionWatchdog);
    const runId = Number.isFinite(this.constructionRunId) ? this.constructionRunId + 1 : 1;
    this.constructionRunId = runId;
    this.restoreConstructionMaterials();
    this.ensureConstructionInteractionAvailable(true, true);
    const stepIndexes = normalizeConstructionStepOrder(this.constructionStepOrder)
      .filter((id) => this.hasConstructionStepContent(id))
      .map((id) => CONSTRUCTION_STEP_INDEX[id]);
    const total = stepIndexes.length;
    const perStep = Math.max(350, (Math.max(3, finite(duration, 15)) * 1000) / total);
    let sequenceIndex = 0;
    let finished = false;
    const finish = () => {
      if (finished || runId !== this.constructionRunId) return;
      finished = true;
      if (this.constructionWatchdog) clearTimeout(this.constructionWatchdog);
      this.constructionWatchdog = null;
      if (this.constructionTimer) clearTimeout(this.constructionTimer);
      if (this.constructionAnimationFrame) cancelAnimationFrame(this.constructionAnimationFrame);
      this.constructionAnimationFrame = null;
      this.constructionTimer = null;
      this.restoreCompletedConstructionSnapshot();
      onDone?.();
    };
    const abortSafely = (error) => {
      console.error('Construction animation stopped after a rendering error.', error);
      finished = true;
      if (this.constructionWatchdog) clearTimeout(this.constructionWatchdog);
      if (this.constructionTimer) clearTimeout(this.constructionTimer);
      if (this.constructionAnimationFrame) cancelAnimationFrame(this.constructionAnimationFrame);
      this.constructionWatchdog = null;
      this.constructionTimer = null;
      this.constructionAnimationFrame = null;
      try { this.restoreCompletedConstructionSnapshot(); } catch (restoreError) {
        console.error('Could not restore the completed construction snapshot.', restoreError);
      }
      onDone?.();
    };
    const animateStep = () => {
      if (finished || runId !== this.constructionRunId) return;
      const index = stepIndexes[sequenceIndex];
      const stepStartedAt = performance.now();
      const stepId = CONSTRUCTION_STEPS[index]?.id || 'complete';
      onStep?.(index);
      // The complete model is a terminal snapshot, not another animated build
      // phase. Applying it once avoids repeatedly traversing every finished
      // brick while the user is waiting to regain the stage controls.
      if (stepId === 'complete') {
        try {
          finish();
        } catch (error) {
          abortSafely(error);
        }
        return;
      }
      const tick = (now) => {
        if (finished || runId !== this.constructionRunId) return;
        try {
          const elapsed = now - stepStartedAt;
          const rawProgress = Math.max(0, Math.min(1, elapsed / perStep));
          const easedProgress = rawProgress < 0.5
            ? 2 * rawProgress * rawProgress
            : 1 - ((-2 * rawProgress + 2) ** 2) / 2;
          const buildProgress = ANIMATED_CONSTRUCTION_STEP_IDS.has(stepId)
            ? easedProgress
            : 1;
          this.applyConstructionStep(index, buildProgress);
          if (rawProgress < 1) {
            this.constructionAnimationFrame = requestAnimationFrame(tick);
            return;
          }
          sequenceIndex += 1;
          if (sequenceIndex >= total) {
            finish();
            return;
          }
          this.constructionTimer = setTimeout(animateStep, 80);
        } catch (error) {
          abortSafely(error);
        }
      };
      this.constructionAnimationFrame = requestAnimationFrame(tick);
    };
    // requestAnimationFrame can be dropped by the browser after a WebGL or
    // focus interruption. Never leave React's Play/Stop state or the stage
    // controls waiting forever for a callback that will not arrive.
    const maximumRunTime = perStep * Math.max(1, total) + Math.max(1000, total * 120);
    this.constructionWatchdog = setTimeout(() => {
      if (finished || runId !== this.constructionRunId) return;
      console.warn('Construction animation watchdog completed a stalled run.');
      try {
        finish();
      } catch (error) {
        abortSafely(error);
      }
    }, maximumRunTime);
    animateStep();
  }

  stopConstructionSequence() {
    this.constructionRunId = Number.isFinite(this.constructionRunId) ? this.constructionRunId + 1 : 1;
    if (this.constructionTimer) clearTimeout(this.constructionTimer);
    this.constructionTimer = null;
    if (this.constructionAnimationFrame) cancelAnimationFrame(this.constructionAnimationFrame);
    this.constructionAnimationFrame = null;
    if (this.constructionWatchdog) clearTimeout(this.constructionWatchdog);
    this.constructionWatchdog = null;
    this.restoreConstructionMaterials();
    this.ensureConstructionInteractionAvailable(true, true);
  }

  prepareForArchitectureChange() {
    // A building replacement will dispose and rebuild the old scene on the
    // next React commit. Cancel the animation and restore its temporary
    // materials, but do not render a complete snapshot of geometry that is
    // about to be discarded. On detailed Room/Vestibule models that redundant
    // completion traversal can occupy the main thread long enough to make the
    // building picker appear frozen.
    this.stopConstructionSequence();
    this.constructionStepIndex = CONSTRUCTION_STEPS.length - 1;
    this.constructionStepProgress = 1;
  }

  showCompleteConstruction() {
    this.stopConstructionSequence();
    this.restoreCompletedConstructionSnapshot();
  }

  applyStageAppearance() {
    this.invalidate(true);
    const flat = this.stageRenderMode === 'flat';
    const isDecorativeBrickMesh = (child) => (
      child.userData?.isBrickFace
      || child.userData?.isSoldierCourse
      || child.userData?.isFullLengthBorderBrick
      || child.userData?.isNorthCurveBorderBrick
      || child.userData?.isNorthBoundaryMortarBacking
    );
    const solidColorFor = (child, material) => {
      if (child === this.groundMesh) return this.nightPreview ? NIGHT_GROUND_COLOR : this.building.groundColor;
      if (
        child.userData?.mehrazPureSolid
        || material?.userData?.isFlatBrickBond
        || child.userData?.isBrickFace
        || child.userData?.isSoldierCourse
        || child.userData?.isFullLengthBorderBrick
        || child.userData?.isNorthCurveBorderBrick
        || child.userData?.wallSide
        || child.parent?.userData?.wallSystem
      ) return this.walls.color;
      return material?.color?.getHexString ? `#${material.color.getHexString()}` : '#d0a21f';
    };
    const makeFlatMaterial = (child, material) => {
      const next = new THREE.MeshStandardMaterial({
        color: solidColorFor(child, material),
        roughness: 0.92,
        metalness: 0,
        side: material?.side ?? THREE.DoubleSide,
        transparent: false,
        opacity: 1,
      });
      if (material?.clippingPlanes?.length) {
        next.clippingPlanes = material.clippingPlanes;
        next.clipIntersection = material.clipIntersection === true;
        next.clipShadows = true;
      }
      return next;
    };
    const applyMesh = (child) => {
      if (!child.isMesh) return;
      if (child.userData.mehrazStageOriginalVisible == null) child.userData.mehrazStageOriginalVisible = child.visible;
      child.visible = child.userData.mehrazStageOriginalVisible;
      if (!flat) {
        if (child.userData.mehrazStageOriginalMaterial) {
          const flatMaterials = Array.isArray(child.material) ? child.material : [child.material];
          child.material = child.userData.mehrazStageOriginalMaterial;
          flatMaterials.filter(Boolean).forEach((material) => material.dispose?.());
          delete child.userData.mehrazStageOriginalMaterial;
        }
        return;
      }
      if (!child.userData.mehrazStageOriginalMaterial) {
        const originalMaterial = child.material;
        const materials = Array.isArray(originalMaterial) ? originalMaterial : [originalMaterial];
        child.userData.mehrazStageOriginalMaterial = originalMaterial;
        child.material = Array.isArray(originalMaterial)
          ? materials.map((material) => makeFlatMaterial(child, material))
          : makeFlatMaterial(child, materials[0]);
        if (isDecorativeBrickMesh(child)) {
          child.castShadow = true;
          child.receiveShadow = false;
        }
      } else {
        const flatMaterials = Array.isArray(child.material) ? child.material : [child.material];
        const originalMaterials = Array.isArray(child.userData.mehrazStageOriginalMaterial)
          ? child.userData.mehrazStageOriginalMaterial
          : [child.userData.mehrazStageOriginalMaterial];
        flatMaterials.forEach((material, index) => {
          material.color?.set(solidColorFor(child, originalMaterials[index] || originalMaterials[0]));
          material.map = null;
          material.onBeforeCompile = null;
          material.needsUpdate = true;
        });
      }
    };
    if (this.groundMesh?.material?.color) {
      this.groundMesh.material.color.set(this.nightPreview ? NIGHT_GROUND_COLOR : this.building.groundColor);
      this.groundMesh.material.map = null;
      this.groundMesh.material.needsUpdate = true;
    }
    // The wall/building group is rebuilt at source level for flat mode
    // (bricks disabled), so do not run material/visibility swaps over it.
    // Those swaps were the cause of the blank-stage failure.
    [this.archInfillGroup, this.placementGroup, this.projectInstanceGroup].forEach((root) => {
      root?.traverse((child) => {
        applyMesh(child);
      });
    });
  }

  setSelectedWallSide(side, face = null) {
    const normalized = side === 'arch'
      ? 'south_arch'
      : side === 'north' && this.building.type !== 'room'
        ? 'north_sides'
        : side;
    this.selectedWallSide = ['north', 'north_sides', 'north_top', 'east', 'south', 'west', 'south_arch', 'room_plan_interior', 'room_plan_exterior', 'room_dome', 'room_dome_inner', 'room_dome_extra_leg', 'room_dome_drum', 'room_dome_transition', 'room_dome_ring'].includes(normalized) ? normalized : null;
    this.selectedWallFace = null;
    this.selectedKarbandiRibIndex = null;
    this.updateKarbandiReferenceHighlight();
    this.updateWallSurfaceHighlight();
  }

  setSelectedOpeningGuide(value) {
    const [first, second] = String(value || '').split(':');
    if (first === 'plan' && second) {
      this.selectedOpeningGuide = `plan:${second}`;
      this.selectedWallSide = null;
      this.selectedWallFace = null;
      this.updateWallSurfaceHighlight();
      return;
    }
    const hasWallSide = ['north', 'east', 'south', 'west'].includes(first);
    const wallSide = hasWallSide ? first : 'south';
    const openingType = hasWallSide ? second : first;
    this.selectedOpeningGuide = ['door', 'window'].includes(openingType)
      ? (hasWallSide ? `${wallSide}:${openingType}` : openingType)
      : null;
    if (this.selectedOpeningGuide) {
      this.selectedWallSide = wallSide;
      this.selectedWallFace = null;
    }
    this.updateWallSurfaceHighlight();
  }

  emitNightLights() {
    this.callbacks.onNightLights?.({
      preview: this.nightPreview,
      guides: this.nightLightGuidesVisible,
      selectedId: this.selectedNightLightId,
      lights: this.nightLights.map(cloneNightLight),
    });
  }

  rebuildNightLights() {
    this.invalidate(true);
    this.nightLightObjects.forEach(({ helper, marker, targetMarker }) => {
      helper?.dispose?.();
      marker?.geometry?.dispose?.();
      marker?.material?.dispose?.();
      targetMarker?.geometry?.dispose?.();
      targetMarker?.material?.dispose?.();
    });
    this.nightLightObjects.clear();
    this.nightLightGroup.traverse((child) => {
      child.geometry?.dispose?.();
      if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose?.());
      else child.material?.dispose?.();
    });
    this.nightLightGroup.clear();
    this.nightLights.forEach((definition) => {
      const light = new THREE.SpotLight(
        definition.color,
        definition.intensity,
        definition.distance,
        THREE.MathUtils.degToRad(definition.angle),
        definition.penumbra,
        definition.decay,
      );
      light.name = definition.name;
      light.userData.nightLightId = definition.id;
      light.position.fromArray(definition.position);
      light.castShadow = true;
      light.shadow.mapSize.set(2048, 2048);
      light.shadow.camera.near = 0.05;
      light.shadow.camera.far = definition.distance;
      light.shadow.bias = -0.00015;
      light.shadow.normalBias = 0.025;
      const target = new THREE.Object3D();
      target.position.fromArray(definition.target);
      light.target = target;
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 16, 10),
        new THREE.MeshBasicMaterial({ color: definition.color, toneMapped: false, depthTest: false, depthWrite: false }),
      );
      marker.position.copy(light.position);
      marker.userData.nightLightId = definition.id;
      marker.userData.nightLightHandle = 'position';
      marker.renderOrder = 100;
      const targetMarker = new THREE.Mesh(
        new THREE.SphereGeometry(0.085, 14, 8),
        new THREE.MeshBasicMaterial({ color: '#ff5b4d', toneMapped: false, depthTest: false, depthWrite: false }),
      );
      targetMarker.position.copy(target.position);
      targetMarker.userData.nightLightId = definition.id;
      targetMarker.userData.nightLightHandle = 'target';
      targetMarker.renderOrder = 100;
      const helper = new THREE.SpotLightHelper(light, definition.id === this.selectedNightLightId ? 0xffffff : definition.color);
      helper.traverse((child) => {
        if (!child.material) return;
        child.material.depthTest = false;
        child.material.depthWrite = false;
        child.material.transparent = true;
        child.material.opacity = 0.78;
        child.renderOrder = 90;
      });
      light.visible = this.nightPreview && definition.enabled;
      marker.visible = this.nightLightGuidesVisible;
      targetMarker.visible = this.nightLightGuidesVisible;
      helper.visible = this.nightLightGuidesVisible;
      this.nightLightGroup.add(light, target, marker, targetMarker, helper);
      this.addOpeningSpillLights(definition);
      this.nightLightObjects.set(definition.id, { light, target, marker, targetMarker, helper });
      helper.update();
    });
  }

  southOpeningLightPortals() {
    const b = normalizeBuilding(this.building);
    const walls = normalizeWallSystem(this.walls, b);
    const halfDepth = Math.max(1, Number(b.depth) / 2);
    const southZ = halfDepth + walls.sideOffsets.south;
    const wallWidth = Math.max(0.5, Number(b.width) + walls.sideOffsets.east + walls.sideOffsets.west);
    const centerX = 0;
    const makePortal = (opening, bottom = 0, kind = 'opening') => {
      if (!opening?.enabled) return null;
      const width = Math.min(opening.width, wallWidth - 0.1);
      const wallLeft = centerX - wallWidth / 2;
      const wallRight = centerX + wallWidth / 2;
      const left = Math.max(wallLeft, Math.min(wallRight - width, centerX + opening.position - width / 2));
      const right = left + width;
      const height = Math.max(0.1, opening.height);
      const faceZ = southZ + b.wallThickness * 0.62;
      const bottomY = Math.max(0.08, bottom);
      const topY = bottom + height;
      return {
        kind,
        center: new THREE.Vector3((left + right) / 2, bottom + height / 2, faceZ),
        corners: [
          new THREE.Vector3(left, bottomY, faceZ),
          new THREE.Vector3(right, bottomY, faceZ),
          new THREE.Vector3(right, topY, faceZ),
          new THREE.Vector3(left, topY, faceZ),
        ],
        width,
        height,
      };
    };
    return [
      makePortal(walls.southOpenings.door, walls.southOpenings.door.sillHeight, 'door'),
      makePortal(
        walls.southOpenings.window,
        Math.min(Math.max(0, b.height - 0.3), walls.southOpenings.window.sillHeight),
        'window',
      ),
    ].filter(Boolean);
  }

  addOpeningSpillLights(definition, force = false, targetGroup = this.nightLightGroup) {
    if ((!force && !this.nightPreview) || !definition.enabled || !this.walls?.enabled) return;
    const portals = this.southOpeningLightPortals();
    if (!portals.length) return;
    const source = new THREE.Vector3().fromArray(definition.position || DEFAULT_NIGHT_LIGHT.position);
    const lightTarget = new THREE.Vector3().fromArray(definition.target || DEFAULT_NIGHT_LIGHT.target);
    const lightDirection = lightTarget.clone().sub(source).normalize();
    const beamAngle = THREE.MathUtils.degToRad(Math.max(5, definition.angle || DEFAULT_NIGHT_LIGHT.angle));
    const openingCenter = portals[0]?.center || new THREE.Vector3();
    const sourceSide = Math.sign(source.z - openingCenter.z) || -1;
    const sourceSideEnergy = (() => {
      const sourceRange = Math.max(1, definition.distance || DEFAULT_NIGHT_LIGHT.distance);
      const targetDistance = Math.max(0.001, lightTarget.distanceTo(source));
      const distanceFactor = THREE.MathUtils.clamp(1 - targetDistance / sourceRange, 0, 1);
      return {
        opacity: THREE.MathUtils.clamp(
          (definition.intensity / 720) * (0.35 + distanceFactor * 0.65),
          0.055,
          0.2,
        ),
      };
    })();
    const addSourceBeamPatch = () => {
      const groundY = 0.022;
      const horizontalDirection = new THREE.Vector2(lightDirection.x, lightDirection.z);
      const horizontalLength = horizontalDirection.length();
      const direction = horizontalLength > 0.001
        ? horizontalDirection.multiplyScalar(1 / horizontalLength)
        : new THREE.Vector2(0, -sourceSide);
      const sourceXZ = new THREE.Vector2(source.x, source.z);
      const targetXZ = new THREE.Vector2(lightTarget.x, lightTarget.z);
      const targetDistance = Math.max(1.6, sourceXZ.distanceTo(targetXZ));
      const wallFaceXZ = new THREE.Vector2(openingCenter.x, openingCenter.z);
      const wallStopDistance = Math.max(0.65, sourceXZ.distanceTo(wallFaceXZ) - 0.18);
      const reach = Math.max(1.2, Math.min(Math.max(targetDistance, definition.distance * 0.36), wallStopDistance, 9));
      const side = new THREE.Vector2(-direction.y, direction.x);
      const start = sourceXZ.add(direction.clone().multiplyScalar(0.35));
      const end = sourceXZ.add(direction.clone().multiplyScalar(reach));
      const nearWidth = Math.max(0.55, Math.tan(beamAngle * 0.42) * 0.7);
      const farWidth = Math.max(nearWidth, Math.tan(beamAngle) * reach * 1.55);
      const p0 = start.clone().add(side.clone().multiplyScalar(-nearWidth / 2));
      const p1 = start.clone().add(side.clone().multiplyScalar(nearWidth / 2));
      const p2 = end.clone().add(side.clone().multiplyScalar(farWidth / 2));
      const p3 = end.clone().add(side.clone().multiplyScalar(-farWidth / 2));
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute([
        p0.x, groundY, p0.y,
        p1.x, groundY, p1.y,
        p2.x, groundY, p2.y,
        p3.x, groundY, p3.y,
      ], 3));
      geometry.setIndex([0, 1, 2, 0, 2, 3]);
      geometry.computeVertexNormals();
      const material = new THREE.MeshBasicMaterial({
        color: definition.color,
        transparent: true,
        opacity: sourceSideEnergy.opacity,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      });
      const patch = new THREE.Mesh(geometry, material);
      patch.name = `${definition.name} source-side ground beam`;
      patch.renderOrder = 5;
      patch.userData.isOpeningLightProjection = true;
      targetGroup.add(patch);
    };
    addSourceBeamPatch();
  }

  setNightLights(lights = []) {
    this.nightLights = Array.isArray(lights) ? lights.map(normalizeNightLight) : [];
    this.selectedNightLightId = this.nightLights.some((light) => light.id === this.selectedNightLightId)
      ? this.selectedNightLightId
      : this.nightLights[0]?.id || null;
    this.rebuildNightLights();
    this.emitNightLights();
  }

  applyNightLightPreset(presetId = 'hero') {
    this.nightLights = symmetricArchitecturalNightPreset(presetId, this.building, this.walls);
    this.selectedNightLightId = this.nightLights[0]?.id || null;
    this.nightPreview = true;
    this.nightLightGuidesVisible = true;
    this.ambient.visible = true;
    this.ambient.intensity = NIGHT_AMBIENT_INTENSITY;
    this.hemisphere.visible = true;
    this.hemisphere.intensity = NIGHT_HEMISPHERE_INTENSITY;
    this.sun.visible = false;
    this.scene.background = new THREE.Color('#050914');
    if (this.groundMesh?.material) {
      this.groundMesh.material.color.set(NIGHT_GROUND_COLOR);
      this.groundMesh.material.roughness = 0.9;
      this.groundMesh.material.metalness = 0;
      this.groundMesh.material.needsUpdate = true;
    }
    if (this.grid) this.grid.visible = false;
    this.renderer.toneMappingExposure = 0.9;
    this.rebuildNightLights();
    this.emitNightLights();
  }

  completeModelBounds() {
    const bounds = new THREE.Box3();
    const wallGroup = this.buildingGroup.children.find((child) => child.userData?.wallSystem);
    if (wallGroup?.visible) {
      wallGroup.updateWorldMatrix(true, true);
      wallGroup.traverse((child) => {
        if (!child.geometry) return;
        let ancestor = child;
        while (ancestor) {
          if (ancestor.userData?.isKarbandiVisualGuide === true) return;
          ancestor = ancestor.parent;
        }
        if (!child.geometry.boundingBox) child.geometry.computeBoundingBox?.();
        if (child.geometry.boundingBox) bounds.union(child.geometry.boundingBox.clone().applyMatrix4(child.matrixWorld));
      });
    }
    if (this.archInfillGroup.children.length) bounds.expandByObject(this.archInfillGroup);
    if (this.zoneDecorationGroup.children.length) bounds.expandByObject(this.zoneDecorationGroup);
    if (this.placementGroup.children.length) bounds.expandByObject(this.placementGroup);
    if (this.projectInstanceGroup?.children.length) bounds.expandByObject(this.projectInstanceGroup);
    if (bounds.isEmpty()) {
      bounds.set(
        new THREE.Vector3(-this.building.width / 2, 0, -this.building.depth / 2),
        new THREE.Vector3(this.building.width / 2, this.building.height, this.building.depth / 2),
      );
    }
    return bounds;
  }

  addNightLight() {
    const bounds = this.completeModelBounds();
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const definition = normalizeNightLight({
      ...DEFAULT_NIGHT_LIGHT,
      id: globalThis.crypto?.randomUUID?.(),
      name: `Spotlight ${this.nightLights.length + 1}`,
      position: [center.x, Math.max(0.5, bounds.max.y - size.y * 0.15), center.z + Math.max(0.35, size.z * 0.18)],
      target: [center.x, Math.max(0.15, center.y), center.z],
      distance: Math.max(4, Math.min(30, size.length() * 1.35)),
    });
    this.nightLights.push(definition);
    this.selectedNightLightId = definition.id;
    this.rebuildNightLights();
    this.emitNightLights();
    return definition.id;
  }

  updateNightLight(id, patch) {
    const index = this.nightLights.findIndex((light) => light.id === id);
    if (index < 0) return;
    this.nightLights[index] = normalizeNightLight({ ...this.nightLights[index], ...patch, id });
    this.rebuildNightLights();
    this.emitNightLights();
  }

  removeNightLight(id) {
    const index = this.nightLights.findIndex((light) => light.id === id);
    if (index < 0) return;
    this.nightLights.splice(index, 1);
    this.selectedNightLightId = this.nightLights[Math.min(index, this.nightLights.length - 1)]?.id || null;
    this.rebuildNightLights();
    this.emitNightLights();
  }

  selectNightLight(id) {
    this.selectedNightLightId = this.nightLights.some((light) => light.id === id) ? id : null;
    if (this.selectedNightLightId) {
      this.selectedId = null;
      this.selectedZoneId = null;
      this.selectedWallSide = null;
      this.selectedKarbandiRibIndex = null;
      this.updateSelectionOutline();
      this.updateKarbandiReferenceHighlight();
      this.updateWallSurfaceHighlight();
      this.callbacks.onSelection?.(null);
      this.callbacks.onZoneSelection?.(null);
      this.callbacks.onWallSurfaceSelection?.(null);
    }
    this.rebuildNightLights();
    this.emitNightLights();
  }

  clearNightLightSelection() {
    if (!this.selectedNightLightId) return;
    this.selectedNightLightId = null;
    this.rebuildNightLights();
    this.emitNightLights();
  }

  setNightLightGuidesVisible(visible) {
    this.invalidate();
    this.nightLightGuidesVisible = visible === true;
    this.rebuildNightLights();
    this.emitNightLights();
  }

  setNightPreview(enabled) {
    this.nightPreview = enabled === true;
    this.ambient.visible = true;
    this.ambient.intensity = this.nightPreview ? NIGHT_AMBIENT_INTENSITY : DAY_AMBIENT_INTENSITY;
    this.hemisphere.visible = true;
    this.hemisphere.intensity = this.nightPreview ? NIGHT_HEMISPHERE_INTENSITY : DAY_HEMISPHERE_INTENSITY;
    this.sun.visible = !this.nightPreview;
    this.scene.background = new THREE.Color(this.nightPreview ? '#050914' : '#cfe7f2');
    if (this.groundMesh?.material) {
      this.groundMesh.material.color.set(this.nightPreview ? NIGHT_GROUND_COLOR : this.building.groundColor);
      this.groundMesh.material.roughness = this.nightPreview ? 0.9 : 0.86;
      this.groundMesh.material.metalness = 0;
      this.groundMesh.material.needsUpdate = true;
    }
    if (this.grid) this.grid.visible = !this.nightPreview && this.grid.userData.hideAfterFirstGridBay !== true;
    this.renderer.toneMapping = this.nightPreview ? THREE.ACESFilmicToneMapping : THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = this.nightPreview ? 0.9 : 1;
    this.rebuildNightLights();
    this.emitNightLights();
  }

  placeNightLightAtCamera(id) {
    this.updateNightLight(id, {
      position: this.camera.position.toArray(),
      target: this.controls.target.toArray(),
    });
  }

  aimNightLightAtModelCenter(id) {
    const bounds = this.completeModelBounds();
    this.updateNightLight(id, { target: bounds.getCenter(new THREE.Vector3()).toArray() });
  }

  setTransformMode(mode = 'translate') {
    this.invalidate();
    const next = ['translate', 'rotate', 'scale'].includes(mode) ? mode : 'translate';
    this.transformControls.setMode(next);
  }

  setZones(zones) {
    this.invalidate(true);
    this.zones = Array.isArray(zones) ? zones : [];
    updateGypsumZoneCutouts(this.buildingGroup, this.zones, this.walls);
    this.clearGroup(this.zoneGroup);
    this.clearGroup(this.zoneDecorationGroup);
    this.zones.forEach((zone) => {
      const world = zoneWorldTransform(zone, this.building, this.walls);
      const rotation = world.rotation.map(THREE.MathUtils.degToRad);
      const pattern = zonePatternTexture(zone);
      if (pattern) {
        const mapTransform = zonePatternMapTransform(zone, world.bounds, pattern.unitWidth, pattern.unitHeight);
        pattern.texture.repeat.fromArray(mapTransform.repeat);
        pattern.texture.offset.fromArray(mapTransform.offset);
        const patternMaterial = new THREE.MeshStandardMaterial({
          map: pattern.texture,
          color: '#ffffff',
          roughness: 0.84,
          metalness: 0,
          transparent: false,
          alphaTest: zone.assetType === 'girih_pattern' ? 0.01 : 0,
          depthWrite: true,
          depthTest: true,
          side: THREE.FrontSide,
          forceSinglePass: true,
        });
        patternMaterial.userData.isZoneDecoration = true;
        const decoration = new THREE.Mesh(new THREE.PlaneGeometry(world.bounds.width, world.bounds.height), patternMaterial);
        decoration.position.fromArray(world.position);
        decoration.rotation.set(...rotation);
        // A tiny local-normal bias keeps the finish on the visible wall face
        // without introducing a perceptible gap or z-fighting with the wall.
        decoration.translateZ(0.002);
        decoration.renderOrder = 35;
        decoration.userData.zoneId = zone.id;
        decoration.userData.isZoneDecoration = true;
        decoration.userData.assetType = zone.assetType;
        decoration.userData.surfaceId = zone.surfaceId;
        decoration.castShadow = false;
        decoration.receiveShadow = true;
        this.zoneDecorationGroup.add(decoration);
      }
      const soldierCourses = zoneSoldierCourses(zone, world, this.walls);
      if (soldierCourses) this.zoneDecorationGroup.add(soldierCourses);
      const material = new THREE.MeshBasicMaterial({
        color: zone.color || '#2f7d86',
        transparent: true,
        opacity: Math.max(0.04, Math.min(0.5, finite(zone.opacity, 0.14))),
        depthWrite: false,
        side: THREE.FrontSide,
      });
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(world.bounds.width, world.bounds.height), material);
      panel.position.fromArray(world.position);
      panel.rotation.set(...rotation);
      panel.translateZ(0.003);
      panel.renderOrder = 2;
      panel.userData.zoneId = zone.id;
      panel.userData.surfaceId = zone.surfaceId;
      // Line materials have no back-face culling, so the former dashed outline
      // leaked through the back of every wall. Plane strips obey FrontSide.
      const outlineMaterial = new THREE.MeshBasicMaterial({
        color: zone.color || '#2f7d86',
        depthTest: true,
        depthWrite: false,
        side: THREE.FrontSide,
      });
      const edgeThickness = Math.min(0.025, Math.max(0.008, Math.min(world.bounds.width, world.bounds.height) * 0.006));
      [
        [world.bounds.width, edgeThickness, 0, world.bounds.height / 2],
        [world.bounds.width, edgeThickness, 0, -world.bounds.height / 2],
        [edgeThickness, world.bounds.height, world.bounds.width / 2, 0],
        [edgeThickness, world.bounds.height, -world.bounds.width / 2, 0],
      ].forEach(([width, height, x, y]) => {
        const edge = new THREE.Mesh(new THREE.PlaneGeometry(width, height), outlineMaterial);
        edge.position.set(x, y, 0.001);
        edge.renderOrder = 3;
        edge.userData.zoneId = zone.id;
        panel.add(edge);
      });
      this.zoneGroup.add(panel);
    });
    this.updateSelectionOutline();
    this.updateZonePortalSideVisibility();
    if (this.sectionViewEnabled) this.applyRoomSectionClipping();
  }

  updateZonePortalSideVisibility(camera = this.camera) {
    const b = normalizeBuilding(this.building);
    const walls = normalizeWallSystem(this.walls, b);
    const westInteriorX = -b.width / 2 - walls.sideOffsets.west;
    const eastInteriorX = b.width / 2 + walls.sideOffsets.east;
    const northInteriorZ = -b.depth / 2 - walls.sideOffsets.north;
    const southInteriorZ = b.depth / 2 + walls.sideOffsets.south;
    const epsilon = 0.001;
    const cameraInsidePortal = camera
      && camera.position.x >= westInteriorX - epsilon
      && camera.position.x <= eastInteriorX + epsilon
      && camera.position.z >= northInteriorZ - epsilon
      && camera.position.z <= southInteriorZ + epsilon;
    const cameraInFrontOfPortal = camera && camera.position.z <= northInteriorZ + epsilon;
    const portalFrontVisible = !camera || cameraInsidePortal || cameraInFrontOfPortal;
    [this.zoneGroup, this.zoneDecorationGroup].forEach((group) => {
      group.children.forEach((root) => {
        root.visible = root.userData.surfaceId === 'floor' || portalFrontVisible;
      });
    });
    if (this.selectedZoneId && this.selectionOutline) {
      const zone = this.zones.find((item) => item.id === this.selectedZoneId);
      this.selectionOutline.visible = zone?.surfaceId === 'floor' || portalFrontVisible;
    }
    return portalFrontVisible;
  }

  rebuildBuilding() {
    this.invalidate(true);
    this.clearGroup(this.buildingGroup);
    const b = this.building;
    const floorMaterial = makeMaterial(b.groundColor, 0.86);
    this.groundMesh = box(40, 0.12, 40, floorMaterial, [0, -0.08, 0]);
    this.groundMesh.userData.isStageSurface = true;
    this.buildingGroup.add(this.groundMesh);
    const wallSystem = buildWallSystem(b, this.walls, this.zones, { gridTemplateCache: this.gridTemplateCache });
    wallSystem.visible = this.architectureVisible !== false;
    if (this.stageRenderMode === 'flat') this.applyPureSolidWallMaterials(wallSystem);
    this.buildingGroup.add(wallSystem);
    const isEmptyGridBuilding = b.buildingType === 'grid'
      && (b.gridRemovedBays || []).length >= b.hallGridX * b.hallGridY;
    const gridSize = b.buildingType === 'grid' ? Math.max(b.width, b.depth) : 40;
    const gridDivisions = b.buildingType === 'grid' ? 9 : 40;
    const grid = new THREE.GridHelper(
      gridSize,
      gridDivisions,
      b.buildingType === 'grid' ? '#858b90' : '#ad9d72',
      b.buildingType === 'grid' ? '#a5aaae' : '#d5c79f',
    );
    grid.position.y = 0.001;
    grid.material.transparent = true;
    grid.material.opacity = 0.34;
    this.grid = grid;
    grid.userData.isStageSurface = true;
    grid.userData.hideAfterFirstGridBay = b.buildingType === 'grid' && !isEmptyGridBuilding;
    grid.visible = !this.nightPreview && grid.userData.hideAfterFirstGridBay !== true;
    this.buildingGroup.add(grid);
    if (this.nightPreview) {
      this.groundMesh.material.color.set(NIGHT_GROUND_COLOR);
      this.groundMesh.material.roughness = 0.9;
      this.groundMesh.material.metalness = 0;
    }
    this.setZones(this.zones);
    this.setPlacements(this.placements);
    this.applyStageAppearance();
    if (this.constructionStepIndex < CONSTRUCTION_STEPS.length - 1) this.applyConstructionStep(this.constructionStepIndex);
    this.updateWallSurfaceHighlight();
    this.updateKarbandiReferenceHighlight();
    this.updateGridElementHighlight();
    this.updateGridBayHighlight();
    if (this.sectionViewEnabled) this.applyRoomSectionClipping();
  }

  rebuildArchInfills() {
    this.clearGroup(this.archInfillGroup);
    if (!this.walls.enabled || !this.walls.ahang.enabled || !this.walls.pointedArch.enabled || !this.walls.pointedArch.moduleInfill) return;
    this.placementGroup.children.forEach((root) => {
      if (root.userData.assetType !== 'muqarnas_assembly' || root.userData.surfaceId !== 'floor') return;
      root.updateMatrixWorld(true);
      root.children.filter((child) => child.userData.exactMuqarnasGeometry === true).forEach((moduleRoot) => {
        const geometry = moduleTopExtrusionGeometry(
          moduleRoot,
          (x) => wallArchHeightAtX(this.building, this.walls, x),
        );
        if (!geometry) return;
        const sourceMesh = moduleRoot.getObjectByProperty('isMesh', true);
        const sourceMaterial = Array.isArray(sourceMesh?.material) ? sourceMesh.material[0] : sourceMesh?.material;
        const material = sourceMaterial?.clone?.() || makeMaterial('#d0a21f', 0.55);
        material.side = THREE.DoubleSide;
        const extension = new THREE.Mesh(geometry, material);
        extension.castShadow = this.walls.shadows;
        extension.receiveShadow = this.walls.shadows;
        extension.userData.isArchModuleInfill = true;
        extension.userData.placementId = root.userData.placementId;
        this.archInfillGroup.add(extension);
      });
    });
  }

  rebuildPlacementMasks() {
    this.clearGroup(this.placementMaskGroup);
    if (!this.walls.enabled || !this.walls.northBoundary?.enabled || this.walls.openSides.includes('north')) return;
    const hasNorthDecoration = this.placements.some((placement) => placement.surfaceId === 'north_interior');
    if (!hasNorthDecoration) return;
    const b = normalizeBuilding(this.building);
    const walls = normalizeWallSystem(this.walls, b);
    const thickness = Math.max(0.1, Number(b.wallThickness) || 0.4);
    const halfWidth = Math.max(1, Number(b.width) / 2);
    const halfDepth = Math.max(1, Number(b.depth) / 2);
    const westX = -halfWidth - walls.sideOffsets.west;
    const eastX = halfWidth + walls.sideOffsets.east;
    const northZ = -halfDepth - walls.sideOffsets.north;
    const southZ = halfDepth + walls.sideOffsets.south;
    const width = eastX - westX;
    const depth = southZ - northZ;
    const sideTop = Math.max(
      Math.max(0.05, b.height + walls.extraHeights.east),
      Math.max(0.05, b.height + walls.extraHeights.west),
    );
    const archHalfSpan = Math.max(0.5, Math.min(width / 2, Number(b.openingWidth) / 2 || width * 0.32));
    const greenOffset = walls.pointedArch.greenOffset ?? archHalfSpan;
    const greenHeight = walls.pointedArch.greenHeight ?? Math.max(0, sideTop - archHalfSpan * 0.6);
    const archPoints = walls.pointedArch.enabled
      ? archCurve((westX + eastX) / 2, archHalfSpan, sideTop, sideTop, greenOffset, greenHeight, 36, {
        archType: walls.pointedArch.archType,
        redOffset: walls.pointedArch.redOffset,
        redRadius: walls.pointedArch.redRadius,
      })
      : [];
    const archApex = archPoints.length ? Math.max(...archPoints.map((point) => point.y)) : sideTop;
    const northHeight = Math.max(
      Math.max(0.05, b.height + walls.extraHeights.north),
      walls.northWall.minHeight || 0,
      walls.pointedArch.enabled ? archApex + walls.northWall.archTopExtension : 0,
    );
    const northLeft = westX - thickness - walls.northWall.outwardWidth;
    const northRight = eastX + thickness + walls.northWall.outwardWidth;
    const inset = Math.max(walls.northBoundary.inset, walls.bricks.brickWidth);
    const recessDepth = Math.min(thickness - 0.02, walls.northBoundary.depth);
    const z = northZ - thickness + recessDepth - 0.055;
    const material = makeMaterial(walls.color, 0.86);
    material.depthWrite = true;
    material.polygonOffset = true;
    material.polygonOffsetFactor = -2;
    material.polygonOffsetUnits = -2;
    const addPanel = (shape) => {
      const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape, 48), material.clone());
      mesh.position.set(0, 0, z);
      mesh.renderOrder = 10;
      mesh.receiveShadow = true;
      mesh.userData.isPlacementMask = true;
      this.placementMaskGroup.add(mesh);
    };
    const rectShape = (left, right, bottom, top) => {
      if (right - left <= 0.001 || top - bottom <= 0.001) return null;
      const shape = new THREE.Shape();
      shape.moveTo(left, bottom);
      shape.lineTo(right, bottom);
      shape.lineTo(right, top);
      shape.lineTo(left, top);
      shape.closePath();
      return shape;
    };
    [
      rectShape(northLeft, northRight, northHeight - inset, northHeight),
      rectShape(northLeft, northLeft + inset, 0, northHeight),
      rectShape(northRight - inset, northRight, 0, northHeight),
    ].filter(Boolean).forEach(addPanel);
    if (archPoints.length) {
      const openingLeft = Math.min(archPoints[0].x, archPoints[archPoints.length - 1].x);
      const openingRight = Math.max(archPoints[0].x, archPoints[archPoints.length - 1].x);
      [rectShape(northLeft, openingLeft, 0, inset), rectShape(openingRight, northRight, 0, inset)].filter(Boolean).forEach(addPanel);
      const springHeight = Math.max(0, Math.min(archPoints[0].y, archPoints[archPoints.length - 1].y));
      [rectShape(openingLeft - inset, openingLeft, 0, springHeight), rectShape(openingRight, openingRight + inset, 0, springHeight)].filter(Boolean).forEach(addPanel);
      const centerX = (westX + eastX) / 2;
      const outer = archPoints.map((point) => {
        const direction = new THREE.Vector2(point.x - centerX, point.y - sideTop);
        const length = Math.max(0.001, direction.length());
        return new THREE.Vector2(point.x + (direction.x / length) * inset, point.y + (direction.y / length) * inset);
      });
      const shape = new THREE.Shape();
      shape.moveTo(outer[0].x, outer[0].y);
      outer.slice(1).forEach((point) => shape.lineTo(point.x, point.y));
      [...archPoints].reverse().forEach((point) => shape.lineTo(point.x, point.y));
      shape.closePath();
      addPanel(shape);
    } else {
      addPanel(rectShape(northLeft, northRight, 0, inset));
    }
    this.placementMaskGroup.position.z = recessDepth > 0 ? 0 : 0;
  }

  setPlacements(placements) {
    this.invalidate(true);
    this.placements = placements || [];
    this.clearGroup(this.placementGroup);
    this.placements.forEach((placement) => {
      const preview = placementPreview(placement);
      const baseTransform = placement.transform || defaultPlacementTransform(placement.surfaceId, this.building, this.walls);
      const transform = placement.options?.constrain === false
        ? baseTransform
        : constrainPlacementTransform(baseTransform, placement.surfaceId, this.building, placement.options, this.walls);
      preview.position.fromArray(transform.position || [0, 0, 0]);
      preview.rotation.set(...(transform.rotation || [0, 0, 0]).map(THREE.MathUtils.degToRad));
      preview.scale.fromArray(transform.scale || [1, 1, 1]);
      preview.userData.assetType = placement.assetType;
      preview.userData.surfaceId = placement.surfaceId;
      preview.userData.role = placement.role || null;
      preview.userData.hiddenByCoverSystem = !coverSystemAllowsPlacement(placement, this.walls);
      preview.visible = !preview.userData.hiddenByCoverSystem;
      preview.userData.onPreviewHydrated = () => {
        if (!preview.parent) return;
        const exactObject = (object) => object.userData.exactMuqarnasGeometry === true;
        let worldBounds = previewWorldBounds(preview, exactObject);
        const targetWidth = Number(placement.options?.targetWidth);
        const currentWidth = worldBounds.isEmpty() ? 0 : worldBounds.max.x - worldBounds.min.x;
        if (placement.options?.enforceTargetWidth === true && targetWidth > 0 && currentWidth > 0.0001) {
          const correction = targetWidth / currentWidth;
          if (Math.abs(correction - 1) > 0.0005) {
            preview.scale.multiplyScalar(correction);
            preview.updateWorldMatrix(true, true);
            worldBounds = previewWorldBounds(preview, exactObject);
            this.callbacks.onTransform?.(placement.id, {
              position: preview.position.toArray(),
              rotation: [
                THREE.MathUtils.radToDeg(preview.rotation.x),
                THREE.MathUtils.radToDeg(preview.rotation.y),
                THREE.MathUtils.radToDeg(preview.rotation.z),
              ],
              scale: preview.scale.toArray(),
            });
          }
        }
        const bounds = previewLocalBounds(preview, (object) => object.userData.exactMuqarnasGeometry === true);
        if (!bounds.isEmpty()) {
          const size = bounds.getSize(new THREE.Vector3());
          this.callbacks.onPreviewDimensions?.(placement.id, [
            size.x * Math.abs(preview.scale.x),
            size.y * Math.abs(preview.scale.y),
            size.z * Math.abs(preview.scale.z),
          ]);
        }
        this.rebuildArchInfills();
        if (this.selectedId === placement.id) this.updateSelectionOutline();
      };
      applyZoneClip(preview, placement.zoneClip);
      this.placementGroup.add(preview);
    });
    this.rebuildArchInfills();
    this.clearGroup(this.placementMaskGroup);
    this.applyStageAppearance();
    this.updateSelectionOutline();
    if (this.sectionViewEnabled) this.applyRoomSectionClipping();
  }

  setProjectInstances(instances) {
    this.invalidate(true);
    this.projectInstances = Array.isArray(instances) ? instances : [];
    this.clearGroup(this.projectInstanceGroup);
    this.projectInstances.forEach((instance) => {
      if (!instance?.id || !instance.payload) return;
      const preview = projectInstancePreview(instance);
      const transform = instance.transform || {};
      preview.position.fromArray(transform.position || [0, 0, 0]);
      preview.rotation.set(...(transform.rotation || [0, 0, 0]).map(THREE.MathUtils.degToRad));
      preview.scale.fromArray(transform.scale || [1, 1, 1]);
      this.projectInstanceGroup.add(preview);
    });
    if (!this.projectInstances.some((instance) => instance.id === this.selectedProjectInstanceId)) {
      this.selectedProjectInstanceId = null;
    }
    this.applyStageAppearance();
    this.updateSelectionOutline();
    if (this.sectionViewEnabled) this.applyRoomSectionClipping();
  }

  selectProjectInstance(id) {
    const requested = id
      ? this.projectInstanceGroup.children.find((child) => child.userData.projectInstanceId === id)
      : null;
    this.selectedProjectInstanceId = requested ? id : null;
    if (this.selectedProjectInstanceId) {
      this.selectedId = null;
      this.selectedZoneId = null;
      this.selectedWallSide = null;
      this.selectedKarbandiRibIndex = null;
      this.updateKarbandiReferenceHighlight();
      this.updateWallSurfaceHighlight();
      this.clearNightLightSelection();
    }
    this.updateSelectionOutline();
    this.callbacks.onProjectInstanceSelection?.(this.selectedProjectInstanceId);
  }

  select(id) {
    const requested = id
      ? this.placementGroup.children.find((child) => child.userData.placementId === id)
      : null;
    this.selectedId = requested && objectIsSelectable(requested, this.placementGroup) ? id : null;
    if (this.selectedId) {
      this.selectedProjectInstanceId = null;
      this.selectedZoneId = null;
      this.selectedWallSide = null;
      this.selectedKarbandiRibIndex = null;
      this.updateKarbandiReferenceHighlight();
      this.updateWallSurfaceHighlight();
      this.clearNightLightSelection();
    }
    this.updateSelectionOutline();
    this.callbacks.onSelection?.(this.selectedId);
  }

  selectZone(id) {
    this.selectedZoneId = id || null;
    if (id) {
      this.selectedProjectInstanceId = null;
      this.selectedId = null;
      this.selectedWallSide = null;
      this.selectedKarbandiRibIndex = null;
      this.updateKarbandiReferenceHighlight();
      this.updateWallSurfaceHighlight();
      this.clearNightLightSelection();
    }
    this.updateSelectionOutline();
    this.callbacks.onZoneSelection?.(this.selectedZoneId);
  }

  selectWallSide(side, emit = true, detail = null) {
    const normalized = side === 'arch'
      ? 'south_arch'
      : side === 'north' && this.building.type !== 'room'
        ? 'north_sides'
        : side;
    if (!['north', 'north_sides', 'north_top', 'east', 'south', 'west', 'south_arch', 'room_plan_interior', 'room_plan_exterior', 'room_dome', 'room_dome_inner', 'room_dome_extra_leg', 'room_dome_drum', 'room_dome_transition', 'room_dome_ring'].includes(normalized)) return;
    this.selectedWallSide = normalized;
    this.selectedWallFace = null;
    this.selectedOpeningGuide = null;
    this.selectedKarbandiRibIndex = null;
    this.selectedId = null;
    this.selectedProjectInstanceId = null;
    this.selectedZoneId = null;
    this.clearNightLightSelection();
    this.updateSelectionOutline();
    this.updateKarbandiReferenceHighlight();
    this.updateWallSurfaceHighlight();
    if (emit) {
      this.callbacks.onWallSurfaceSelection?.({
        side: normalized,
        surfaceId: surfaceIdForWallSide(normalized, this.building),
        ...(detail || {}),
      });
    }
  }

  clearSelection() {
    this.selectedId = null;
    this.selectedProjectInstanceId = null;
    this.selectedZoneId = null;
    this.selectedWallSide = null;
    this.selectedWallFace = null;
    this.selectedOpeningGuide = null;
    this.selectedKarbandiRibIndex = null;
    this.clearNightLightSelection();
    this.updateSelectionOutline();
    this.updateKarbandiReferenceHighlight();
    this.updateWallSurfaceHighlight();
    this.callbacks.onSelection?.(null);
    this.callbacks.onProjectInstanceSelection?.(null);
    this.callbacks.onZoneSelection?.(null);
    this.callbacks.onWallSurfaceSelection?.(null);
  }

  clearWallSurfaceHighlight() {
    if (!this.wallSurfaceHighlight) return;
    this.scene.remove(this.wallSurfaceHighlight);
    this.wallSurfaceHighlight.traverse((child) => {
      child.geometry?.dispose?.();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.filter(Boolean).forEach((material) => material.dispose?.());
    });
    this.wallSurfaceHighlight = null;
  }

  selectKarbandiRib(index) {
    this.selectedKarbandiRibIndex = Number.isFinite(Number(index)) ? Math.round(Number(index)) : null;
    this.selectedId = null;
    this.selectedZoneId = null;
    this.selectedWallSide = null;
    this.selectedWallFace = null;
    this.clearNightLightSelection();
    this.updateSelectionOutline();
    this.updateWallSurfaceHighlight();
    this.updateKarbandiReferenceHighlight();
  }

  setKarbandiReferenceEditing(active) {
    this.karbandiReferenceEditing = active === true;
    this.updateKarbandiReferenceHighlight();
  }

  setKarbandiRibArchEditing(active) {
    this.karbandiRibArchEditing = active === true;
    this.updateWallSurfaceHighlight();
  }

  clearGridElementHighlight() {
    if (!this.gridElementHighlight) return;
    this.scene.remove(this.gridElementHighlight);
    this.gridElementHighlight.traverse((child) => {
      child.geometry?.dispose?.();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.filter(Boolean).forEach((material) => material.dispose?.());
    });
    this.gridElementHighlight = null;
  }

  setGridElementSelection(selections = []) {
    this.selectedGridElementIds = [...new Set((Array.isArray(selections) ? selections : [])
      .map((selection) => typeof selection === 'string' ? selection : selection?.id)
      .filter(Boolean))];
    this.updateGridElementHighlight();
  }

  setGridBaySelectionEnabled(enabled) {
    this.gridBaySelectionEnabled = enabled === true;
  }

  clearGridBayHighlight() {
    if (!this.gridBayHighlight) return;
    this.scene.remove(this.gridBayHighlight);
    this.gridBayHighlight.traverse((child) => {
      child.geometry?.dispose?.();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.filter(Boolean).forEach((material) => material.dispose?.());
    });
    this.gridBayHighlight = null;
  }

  setGridBaySelection(keys = []) {
    this.selectedGridBayKeys = [...new Set((Array.isArray(keys) ? keys : [])
      .filter((key) => typeof key === 'string'))];
    this.updateGridBayHighlight();
  }

  updateGridBayHighlight() {
    this.invalidate();
    this.clearGridBayHighlight();
    if (this.building?.buildingType !== 'grid' || !this.selectedGridBayKeys.length) return;
    const xSpans = this.building.gridBaySpansX || [];
    const ySpans = this.building.gridBaySpansY || [];
    const width = xSpans.reduce((sum, span) => sum + span, 0);
    const depth = ySpans.reduce((sum, span) => sum + span, 0);
    const selected = new Set(this.selectedGridBayKeys);
    const root = new THREE.Group();
    root.name = 'Selected Grid floor cells';
    ySpans.forEach((bayDepth, iy) => xSpans.forEach((bayWidth, ix) => {
      if (!selected.has(`${ix}:${iy}`)) return;
      const x = -width / 2 + xSpans.slice(0, ix).reduce((sum, span) => sum + span, 0) + bayWidth / 2;
      const z = -depth / 2 + ySpans.slice(0, iy).reduce((sum, span) => sum + span, 0) + bayDepth / 2;
      const highlight = new THREE.Mesh(
        new THREE.PlaneGeometry(Math.max(0.05, bayWidth - 0.08), Math.max(0.05, bayDepth - 0.08)),
        new THREE.MeshBasicMaterial({ color: '#f0ca2e', transparent: true, opacity: 0.34, side: THREE.DoubleSide, depthTest: false }),
      );
      highlight.rotation.x = -Math.PI / 2;
      highlight.position.set(x, 0.025, z);
      highlight.renderOrder = 1000;
      highlight.userData.isGridBayHighlight = true;
      root.add(highlight);
    }));
    this.gridBayHighlight = root;
    this.scene.add(root);
  }

  updateGridElementHighlight() {
    this.invalidate();
    this.clearGridElementHighlight();
    if (this.building?.buildingType !== 'grid' || !this.selectedGridElementIds?.length) return;
    const selected = new Set(this.selectedGridElementIds);
    const wallSystem = this.buildingGroup.children.find((child) => child.userData?.wallSystem);
    if (!wallSystem) return;
    wallSystem.updateMatrixWorld(true);
    const root = new THREE.Group();
    root.name = 'Selected Grid component transparent yellow boundary';
    const addHighlight = (geometry, matrix, sourceMaterial) => {
      if (!geometry) return;
      const fillMaterial = new THREE.MeshBasicMaterial({
        color: '#ffd928',
        transparent: true,
        opacity: 0.13,
        depthWrite: false,
        depthTest: true,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      });
      if (sourceMaterial?.clippingPlanes?.length) {
        fillMaterial.clippingPlanes = sourceMaterial.clippingPlanes;
        fillMaterial.clipIntersection = sourceMaterial.clipIntersection === true;
      }
      const highlight = new THREE.Mesh(geometry.clone(), fillMaterial);
      matrix.decompose(highlight.position, highlight.quaternion, highlight.scale);
      highlight.renderOrder = 30;
      highlight.userData.isGridElementHighlight = true;
      if (!sourceMaterial?.clippingPlanes?.length) {
        const boundary = new THREE.LineSegments(
          new THREE.EdgesGeometry(highlight.geometry, 20),
          new THREE.LineBasicMaterial({ color: '#ffe252', transparent: true, opacity: 0.9, depthTest: false }),
        );
        boundary.renderOrder = 31;
        boundary.userData.isGridElementHighlight = true;
        highlight.add(boundary);
      }
      root.add(highlight);
    };
    wallSystem.traverse((child) => {
      if (!child.isMesh || !child.geometry) return;
      const sourceMaterial = Array.isArray(child.material) ? child.material[0] : child.material;
      if (child.isInstancedMesh && Array.isArray(child.userData?.gridInstances)) {
        const instanceMatrix = new THREE.Matrix4();
        child.userData.gridInstances.forEach((instance, index) => {
          if (!selected.has(instance.id)) return;
          child.getMatrixAt(index, instanceMatrix);
          addHighlight(child.geometry, child.matrixWorld.clone().multiply(instanceMatrix), sourceMaterial);
        });
        return;
      }
      if (selected.has(child.userData?.gridElementId)) addHighlight(child.geometry, child.matrixWorld, sourceMaterial);
    });
    if (!root.children.length) return;
    this.gridElementHighlight = root;
    this.scene.add(root);
  }

  wallSideForHit(hit) {
    if (this.building.type === 'room'
      && (this.building.roomPlanShape || 'square') !== 'square'
      && hit?.object?.userData?.isRoomWallBody === true) {
      if (hit.face?.materialIndex === 0) return 'room_plan_interior';
      if (hit.face?.materialIndex === 1) return 'room_plan_exterior';
    }
    return hit?.object?.userData?.wallSide || null;
  }

  setSquinchArchEditing(active) {
    this.squinchArchEditing = active === true;
    this.updateWallSurfaceHighlight();
  }

  setNorthArchEditing(active) {
    this.northArchEditing = active === true;
    this.updateWallSurfaceHighlight();
  }

  setRoomDomeArchEditing(active) {
    this.roomDomeArchEditing = active === true;
    this.updateWallSurfaceHighlight();
  }

  updateKarbandiReferenceHighlight() {
    this.invalidate();
    const wallSystem = this.buildingGroup?.children.find((child) => child.userData?.wallSystem);
    const enabled = this.walls?.karbandi?.enabled === true
      || (this.building?.type === 'room' && this.building?.domeTransition === 'karbandi');
    const highlighted = enabled && (
      this.karbandiReferenceEditing === true
      || this.walls?.karbandi?.guideVisible === true
    );
    const ribColor = this.walls?.karbandi?.ribColor || this.walls?.color || '#c98d4c';
    const configuredHighlight = this.walls?.karbandi?.referenceRibColor || '#ffd400';
    const highlightColor = configuredHighlight.toLowerCase() === ribColor.toLowerCase()
      ? (ribColor.toLowerCase() === '#ffd400' ? '#18c7d4' : '#ffd400')
      : configuredHighlight;
    const supportHighlightColor = '#ff6b35';
    wallSystem?.traverse((child) => {
      if (!child.isMesh || child.userData?.isKarbandi !== true || child.userData?.isKarbandiCover === true) return;
      const displayColor = highlighted && child.userData.isKarbandiReference
        ? highlightColor
        : highlighted && child.userData.isKarbandiClosestWallSupport
          ? supportHighlightColor
          : ribColor;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.filter(Boolean).forEach((material) => material.color?.set(displayColor));
      child.userData.karbandiDisplayColor = displayColor;
    });
  }

  addArchConstructionDiagram(root, {
    construction,
    centerX,
    guideZ,
    layerDirection = -1,
    name = 'Arch symmetric red and green construction circles',
    guideType = 'main',
    greenOnly = false,
  }) {
    if (!construction) return;
    greenOnly = greenOnly || construction.archType === 'one-point';
    const pointGeometry = new THREE.SphereGeometry(0.09, 16, 12);
    const guideGroup = new THREE.Group();
    guideGroup.name = name;
    guideGroup.userData.isNorthArchConstructionGuide = guideType === 'north';
    guideGroup.userData.isOpeningArchConstructionGuide = guideType === 'door' || guideType === 'window';
    guideGroup.userData.isRoomDomeArchConstructionGuide = guideType === 'room_dome';
    guideGroup.userData.isRoomInnerDomeArchConstructionGuide = guideType === 'room_dome_inner';
    guideGroup.userData.isRoomSquinchArchConstructionGuide = guideType === 'room_squinch';
    guideGroup.userData.openingType = guideGroup.userData.isOpeningArchConstructionGuide ? guideType : null;
    guideGroup.userData.archConstructionCenterX = centerX;
    guideGroup.userData.archConstructionSpringY = construction.sidePoint.y;
    guideGroup.userData.archConstructionApexY = construction.apexPoint.y;
    const drawingBufferSize = this.renderer?.getDrawingBufferSize
      ? this.renderer.getDrawingBufferSize(new THREE.Vector2())
      : new THREE.Vector2(1, 1);
    const addWideGuide = (name, color, points, linewidth, opacity, renderOrder) => {
      const geometry = new LineGeometry();
      geometry.setPositions(points.flatMap((point) => [point.x, point.y, point.z]));
      const material = new LineMaterial({
        color,
        linewidth,
        worldUnits: false,
        transparent: true,
        opacity,
        depthTest: false,
        depthWrite: false,
      });
      material.resolution.copy(drawingBufferSize);
      const line = new Line2(geometry, material);
      line.name = name;
      line.computeLineDistances();
      line.renderOrder = renderOrder;
      line.frustumCulled = false;
      line.userData.isArchConstructionWideGuide = true;
      guideGroup.add(line);
      return line;
    };
    const sampleArc = (center, radius, startPoint, endPoint, z) => {
      const startAngle = Math.atan2(startPoint.y - center.y, startPoint.x - center.x);
      const endAngle = Math.atan2(endPoint.y - center.y, endPoint.x - center.x);
      let delta = endAngle - startAngle;
      while (delta <= -Math.PI) delta += Math.PI * 2;
      while (delta > Math.PI) delta -= Math.PI * 2;
      return Array.from({ length: 49 }, (_, index) => {
        const angle = startAngle + delta * (index / 48);
        return new THREE.Vector3(center.x + Math.cos(angle) * radius, center.y + Math.sin(angle) * radius, z);
      });
    };
    const mirrorPoints = (points) => points.map((point) => new THREE.Vector3(centerX * 2 - point.x, point.y, point.z));
    const addMirroredCirclePair = (role, color, leftCenter, radius) => {
      const lineMaterial = new THREE.LineBasicMaterial({
        color,
        depthTest: false,
        depthWrite: false,
        transparent: true,
        opacity: 0.5,
      });
      const pointMaterial = new THREE.MeshBasicMaterial({ color, depthTest: false, depthWrite: false });
      const circlePoints = Array.from({ length: 128 }, (_, index) => {
        const angle = Math.PI * 2 * index / 128;
        return new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
      });
      const circleGeometry = new THREE.BufferGeometry().setFromPoints(circlePoints);
      [leftCenter.x, centerX * 2 - leftCenter.x].forEach((x) => {
        const circle = new THREE.LineLoop(circleGeometry, lineMaterial);
        circle.position.set(x, leftCenter.y, guideZ);
        circle.renderOrder = 20;
        circle.frustumCulled = false;
        circle.userData.archConstructionRole = `${role}-circle`;
        circle.userData.archConstructionRadius = radius;
        guideGroup.add(circle);

        const point = new THREE.Mesh(pointGeometry, pointMaterial);
        point.position.set(x, leftCenter.y, guideZ + layerDirection * 0.002);
        point.renderOrder = 21;
        point.frustumCulled = false;
        point.userData.archConstructionRole = `${role}-center`;
        guideGroup.add(point);
      });
    };
    addMirroredCirclePair('green', 0x16a34a, construction.greenCenter, construction.greenRadius);
    if (!greenOnly) addMirroredCirclePair('red', 0xe02b2b, construction.redCenter, construction.redRadius);

    const highlightedZ = guideZ + layerDirection * 0.004;
    const greenArcStart = greenOnly ? construction.sidePoint : construction.tangentPoint;
    const greenArch = sampleArc(construction.greenCenter, construction.greenRadius, greenArcStart, construction.apexPoint, highlightedZ);
    if (!greenOnly) {
      const redArch = sampleArc(construction.redCenter, construction.redRadius, construction.sidePoint, construction.tangentPoint, highlightedZ);
      addWideGuide('Right red arch construction segment', 0xe02b2b, redArch, 3, 1, 22);
      addWideGuide('Left red arch construction segment', 0xe02b2b, mirrorPoints(redArch), 3, 1, 22);
    }
    addWideGuide('Right green arch construction segment', 0x16a34a, greenArch, 3, 1, 22);
    addWideGuide('Left green arch construction segment', 0x16a34a, mirrorPoints(greenArch), 3, 1, 22);

    const radiusZ = guideZ + layerDirection * 0.006;
    const rightRedTangentRadius = greenOnly ? null : [
      new THREE.Vector3(construction.redCenter.x, construction.redCenter.y, radiusZ),
      new THREE.Vector3(construction.tangentPoint.x, construction.tangentPoint.y, radiusZ),
    ];
    const rightGreenTangentRadius = [
      new THREE.Vector3(construction.greenCenter.x, construction.greenCenter.y, radiusZ),
      new THREE.Vector3(greenArcStart.x, greenArcStart.y, radiusZ),
    ];
    const rightGreenApexRadius = [
      new THREE.Vector3(construction.greenCenter.x, construction.greenCenter.y, radiusZ),
      new THREE.Vector3(construction.apexPoint.x, construction.apexPoint.y, radiusZ),
    ];
    [
      ...(greenOnly ? [] : [['red-center tangent', rightRedTangentRadius]]),
      [greenOnly ? 'green-center dome-start' : 'green-center tangent', rightGreenTangentRadius],
      ['green-center arch-top', rightGreenApexRadius],
    ].forEach(([name, points]) => {
      addWideGuide(`Right ${name} radius`, 0xffd400, points, 2, 0.5, 23);
      addWideGuide(`Left ${name} radius`, 0xffd400, mirrorPoints(points), 2, 0.5, 23);
    });
    root.add(guideGroup);
    return guideGroup;
  }

  orientArchConstructionGuideToRoomSection(object, centerX = 0, sourceGuideZ = 0, centerZ = 0, guide = object) {
    if (!object || !guide || this.sectionViewEnabled !== true) return guide;
    // Every construction diagram is authored in a local XY plane, but wall,
    // radial-opening, and reference-rib transforms can leave that plane edge-on
    // to a section camera. Rotate the complete placed guide about its visible
    // centre so circles, centre points, arcs, and radii all face the active
    // section without changing their height or apparent location in the model.
    object.updateWorldMatrix(true, true);
    const worldQuaternion = object.getWorldQuaternion(new THREE.Quaternion());
    const currentNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(worldQuaternion).normalize();
    const axis = this.sectionViewAxis === 'y' ? 'y' : 'x';
    // X Slice is viewed from east (+X) and retains the established -X-facing
    // guide convention. Y Slice is viewed from south (+Z).
    const targetNormal = axis === 'y'
      ? new THREE.Vector3(0, 0, 1)
      : new THREE.Vector3(-1, 0, 0);
    const rotation = new THREE.Quaternion().setFromUnitVectors(currentNormal, targetNormal);
    if (Math.abs(rotation.w) < 0.999999999 || rotation.x || rotation.y || rotation.z) {
      const bounds = new THREE.Box3().setFromObject(object);
      const pivot = bounds.isEmpty()
        ? object.getWorldPosition(new THREE.Vector3())
        : bounds.getCenter(new THREE.Vector3());
      const sectionTransform = new THREE.Matrix4()
        .makeTranslation(pivot.x, pivot.y, pivot.z)
        .multiply(new THREE.Matrix4().makeRotationFromQuaternion(rotation))
        .multiply(new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z));
      const nextWorldMatrix = sectionTransform.multiply(object.matrixWorld.clone());
      const parentInverse = object.parent
        ? object.parent.matrixWorld.clone().invert()
        : new THREE.Matrix4();
      parentInverse.multiply(nextWorldMatrix).decompose(object.position, object.quaternion, object.scale);
      object.updateWorldMatrix(true, true);
    }
    guide.userData.archConstructionGuidePlane = axis === 'y'
      ? 'east-west-section-facing-south-camera'
      : 'room-north-south-section-facing-east-camera';
    guide.userData.archConstructionSectionAxis = axis;
    guide.userData.archConstructionSectionFacing = axis === 'y' ? 'positive-z-camera' : 'positive-x-camera';
    guide.userData.archConstructionSectionCenter = [centerX, centerZ];
    guide.userData.archConstructionSectionSourceGuideZ = sourceGuideZ;
    return guide;
  }

  addKarbandiRibArchConstructionGuides(root) {
    if (!this.karbandiRibArchEditing || this.walls.karbandi?.enabled !== true) return;
    const b = normalizeBuilding(this.building);
    const walls = normalizeWallSystem(this.walls, b);
    const halfWidth = Math.max(1, Number(b.width) / 2);
    const halfDepth = Math.max(1, Number(b.depth) / 2);
    const westX = -halfWidth - walls.sideOffsets.west;
    const eastX = halfWidth + walls.sideOffsets.east;
    const centerX = (westX + eastX) / 2;
    const centerZ = -halfDepth - walls.sideOffsets.north - Math.max(0.1, Number(b.wallThickness) || 0.4);
    const sideTop = Math.max(
      Math.max(0.05, b.height + walls.extraHeights.east),
      Math.max(0.05, b.height + walls.extraHeights.west),
    );
    const springY = sideTop + walls.karbandi.springHeightOffset;
    const halfSpan = Math.max(0.1, walls.karbandi.span / 2);
    const greenHeight = springY + walls.karbandi.greenHeightOffset;
    const construction = pointedArchConstruction(
      0,
      halfSpan,
      springY,
      walls.karbandi.greenOffset,
      greenHeight,
      { archType: walls.karbandi.archType, redOffset: walls.karbandi.redOffset },
    );
    const guide = this.addArchConstructionDiagram(root, {
      construction,
      centerX: 0,
      guideZ: -walls.karbandi.ribDepth / 2 - 0.035,
      layerDirection: -1,
      name: 'Karbandi rib arch symmetric red and green construction circles',
      guideType: 'karbandi-rib',
    });
    if (!guide) return;
    guide.userData.isKarbandiRibArchConstructionGuide = true;
    const angle = THREE.MathUtils.degToRad(walls.karbandi.rotationOffset + walls.karbandi.referenceRotation);
    const groupRotation = THREE.MathUtils.degToRad(walls.karbandi.groupRotationY);
    const groupTransform = new THREE.Matrix4()
      .makeTranslation(centerX + walls.karbandi.groupX, walls.karbandi.groupY, centerZ + walls.karbandi.groupZ)
      .multiply(new THREE.Matrix4().makeRotationY(groupRotation))
      .multiply(new THREE.Matrix4().makeScale(walls.karbandi.groupScale, walls.karbandi.groupScale, walls.karbandi.groupScale))
      .multiply(new THREE.Matrix4().makeTranslation(-centerX, 0, -centerZ));
    const referenceTransform = new THREE.Matrix4()
      .makeTranslation(centerX, 0, centerZ)
      .multiply(new THREE.Matrix4().makeRotationY(angle))
      .multiply(new THREE.Matrix4().makeTranslation(walls.karbandi.referenceX, 0, walls.karbandi.referenceZ));
    guide.applyMatrix4(groupTransform.multiply(referenceTransform));
    this.orientArchConstructionGuideToRoomSection(guide, centerX, -walls.karbandi.ribDepth / 2 - 0.035, centerZ);
  }

  addNorthArchConstructionGuides(root) {
    if (this.selectedWallSide !== 'north_top' || this.walls.pointedArch?.enabled !== true) return;
    const b = normalizeBuilding(this.building);
    const walls = normalizeWallSystem(this.walls, b);
    const thickness = Math.max(0.1, Number(b.wallThickness) || 0.4);
    const halfWidth = Math.max(1, Number(b.width) / 2);
    const halfDepth = Math.max(1, Number(b.depth) / 2);
    const westX = -halfWidth - walls.sideOffsets.west;
    const eastX = halfWidth + walls.sideOffsets.east;
    const centerX = (westX + eastX) / 2;
    const sideTop = Math.max(
      Math.max(0.05, b.height + walls.extraHeights.east),
      Math.max(0.05, b.height + walls.extraHeights.west),
    );
    const archShiftY = b.type !== 'room' && walls.portalTransition === 'karbandi'
      ? Math.max(0, Number(this.wallSystemRoot()?.userData?.portalKarbandiNorthWallShiftY) || 0)
      : 0;
    const halfSpan = Math.max(0.5, Math.min((eastX - westX) / 2, Number(b.openingWidth) / 2 || (eastX - westX) * 0.32));
    const greenOffset = walls.pointedArch.greenOffset ?? halfSpan;
    const greenHeight = walls.pointedArch.greenHeight ?? Math.max(0, sideTop - halfSpan * 0.6);
    const construction = pointedArchConstruction(
      centerX,
      halfSpan,
      sideTop + archShiftY,
      greenOffset,
      greenHeight + archShiftY,
      {
      archType: walls.pointedArch.archType,
      redOffset: walls.pointedArch.redOffset,
      redRadius: walls.pointedArch.redRadius,
      },
    );
    const guideZ = -halfDepth - walls.sideOffsets.north - thickness - 0.035;
    const guide = this.addArchConstructionDiagram(root, {
      construction,
      centerX,
      guideZ,
      layerDirection: -1,
      name: 'North arch symmetric red and green construction circles',
      guideType: 'north',
    });
    this.orientArchConstructionGuideToRoomSection(guide, centerX, guideZ, 0);
  }

  addRoomDomeArchConstructionGuides(root) {
    // Hall owns one representative, camera-facing dome guide. Falling through
    // to the generic Room selector would attach a second guide to the first
    // dome found in the grid, splitting one diagram across two different bays.
    if (['hall', 'grid'].includes(this.building?.buildingType)) return;
    const innerDome = this.selectedWallSide === 'room_dome_inner';
    const portalDome = this.building.type !== 'room' && this.walls.portalCover === 'dome';
    if ((!innerDome && this.selectedWallSide !== 'room_dome')
      || (this.building.type !== 'room' && !portalDome)
      || this.building.domeEnabled === false
      || (innerDome && this.building.innerDomeEnabled === false)
      || (!innerDome && !portalDome && (this.building.domeCoverType || 'dome') !== 'dome')) return;
    const b = normalizeBuilding(this.building);
    const walls = normalizeWallSystem(this.walls, b);
    const thickness = Math.max(0.1, Number(b.wallThickness) || 0.4);
    const westX = -b.width / 2 - walls.sideOffsets.west;
    const eastX = b.width / 2 + walls.sideOffsets.east;
    const northZ = -b.depth / 2 - walls.sideOffsets.north;
    const southZ = b.depth / 2 + walls.sideOffsets.south;
    let centerX = (westX + eastX) / 2;
    let centerZ = (northZ + southZ) / 2;
    const builtWallSystem = this.buildingGroup.children.find((child) => child.userData?.wallSystem);
    let builtDome = builtWallSystem?.getObjectByName(innerDome
      ? 'Room inner dome cover'
      : 'Room circular dome cover');
    if (!builtDome && portalDome) {
      builtWallSystem?.traverse((object) => {
        if (!builtDome && object.userData?.roomDomePart === 'dome-shell') builtDome = object;
      });
    }
    const generatedCenter = builtDome?.userData?.roomDomeCenter;
    if (Array.isArray(generatedCenter) && generatedCenter.length >= 2) {
      centerX = Number(generatedCenter[0]) || 0;
      centerZ = Number(generatedCenter[1]) || 0;
    }
    const generatedDomeRadius = Number(builtDome?.userData?.roomDomeRadius);
    const domeRadius = Number.isFinite(generatedDomeRadius)
      ? generatedDomeRadius
      : Math.max(
        0.25,
        Math.min(eastX - westX, southZ - northZ) / 2 - Math.max(0.08, thickness * 0.45),
      );
    const wallTop = Math.max(...['north', 'east', 'south', 'west'].map((side) => (
      Math.max(0.05, b.height + walls.extraHeights[side])
    )));
    const generatedSpringY = Number(builtDome?.userData?.roomDomeSpringY);
    const springY = Number.isFinite(generatedSpringY)
      ? generatedSpringY
      : wallTop + b.domeTransitionHeight + b.domeDrumHeight;
    const domeArch = innerDome ? (b.innerDomeArch || {}) : (b.domeArch || {});
    const generatedConstruction = builtDome?.userData?.roomDomeArchConstruction;
    const generatedPoint = (key) => Array.isArray(generatedConstruction?.[key])
      && generatedConstruction[key].length >= 2
      ? new THREE.Vector2(
        Number(generatedConstruction[key][0]) || 0,
        Number(generatedConstruction[key][1]) || 0,
      )
      : null;
    const generatedRedCenter = generatedPoint('redCenter');
    const generatedGreenCenter = generatedPoint('greenCenter');
    const generatedSidePoint = generatedPoint('sidePoint');
    const generatedTangentPoint = generatedPoint('tangentPoint');
    const generatedApexPoint = generatedPoint('apexPoint');
    const hasGeneratedConstruction = generatedRedCenter
      && generatedGreenCenter
      && generatedSidePoint
      && generatedTangentPoint
      && generatedApexPoint
      && Number.isFinite(Number(generatedConstruction?.redRadius))
      && Number.isFinite(Number(generatedConstruction?.greenRadius));
    const portalGreenConstruction = builtDome?.userData?.portalDomeGreenCircleConstruction;
    const portalGreenPoint = (key) => Array.isArray(portalGreenConstruction?.[key])
      && portalGreenConstruction[key].length >= 2
      ? new THREE.Vector2(
        Number(portalGreenConstruction[key][0]) || 0,
        Number(portalGreenConstruction[key][1]) || 0,
      )
      : null;
    const portalGreenCenter = portalGreenPoint('center');
    const portalGreenSidePoint = portalGreenPoint('sidePoint');
    const portalGreenApexPoint = portalGreenPoint('apexPoint');
    const hasPortalGreenConstruction = portalDome
      && portalGreenCenter
      && portalGreenSidePoint
      && portalGreenApexPoint
      && Number.isFinite(Number(portalGreenConstruction?.radius));
    const construction = hasPortalGreenConstruction
      ? {
        greenCenter: portalGreenCenter,
        greenRadius: Number(portalGreenConstruction.radius),
        sidePoint: portalGreenSidePoint,
        tangentPoint: portalGreenSidePoint,
        apexPoint: portalGreenApexPoint,
      }
      : hasGeneratedConstruction
      ? {
        redCenter: generatedRedCenter,
        redRadius: Number(generatedConstruction.redRadius),
        greenCenter: generatedGreenCenter,
        greenRadius: Number(generatedConstruction.greenRadius),
        sidePoint: generatedSidePoint,
        tangentPoint: generatedTangentPoint,
        apexPoint: generatedApexPoint,
      }
      : pointedArchConstruction(
        centerX,
        domeRadius,
        springY,
        domeArch.greenOffset,
        springY + domeArch.greenHeightOffset,
        { archType: domeArch.archType, redOffset: domeArch.redOffset, redRadius: domeArch.redRadius },
      );
    const guideZ = portalDome ? centerZ - 0.035 : centerZ;
    const guide = this.addArchConstructionDiagram(root, {
      construction,
      centerX,
      guideZ,
      layerDirection: -1,
      name: innerDome
        ? 'Room inner dome symmetric red and green construction circles'
        : portalDome
          ? 'Portal dome symmetric red and green construction circles'
          : 'Room dome symmetric red and green construction circles',
      guideType: innerDome ? 'room_dome_inner' : 'room_dome',
      greenOnly: hasPortalGreenConstruction,
    });
    if (guide && portalDome) {
      guide.userData.isPortalDomeArchConstructionGuide = true;
      guide.userData.archConstructionGuidePlane = 'portal-north-facade-facing-exterior';
      guide.userData.archConstructionSource = hasPortalGreenConstruction
        ? 'north-wall-green-circle-and-generated-portal-dome-interior-profile'
        : hasGeneratedConstruction
          ? 'generated-portal-dome-mesh-profile'
        : 'normalized-input-fallback';
    }
    this.orientArchConstructionGuideToRoomSection(guide, centerX, guideZ, centerZ);
  }

  addRoomSquinchArchConstructionGuides(root) {
    const roomSquinchActive = this.building.type === 'room'
      && this.building.domeTransition === 'squinch';
    const portalSquinchActive = this.building.type !== 'room'
      && this.walls.portalTransition === 'squinch';
    if (!this.squinchArchEditing || (!roomSquinchActive && !portalSquinchActive)) return;
    const b = normalizeBuilding(this.building);
    const walls = normalizeWallSystem(this.walls, b);
    const settings = b.domeTransitionSettings.squinch;
    const halfWidth = Math.max(1, Number(b.width) / 2);
    const halfDepth = Math.max(1, Number(b.depth) / 2);
    const westInteriorX = -halfWidth - walls.sideOffsets.west;
    const eastInteriorX = halfWidth + walls.sideOffsets.east;
    const northInteriorZ = -halfDepth - walls.sideOffsets.north;
    const southInteriorZ = halfDepth + walls.sideOffsets.south;
    const thicknessFor = (side) => b.type === 'room'
      ? walls.roomWallThicknesses[side]
      : b.wallThickness;
    const westX = westInteriorX - thicknessFor('west') / 2;
    const eastX = eastInteriorX + thicknessFor('east') / 2;
    const northZ = northInteriorZ - thicknessFor('north') / 2;
    const southZ = southInteriorZ + thicknessFor('south') / 2;
    const centerX = (westX + eastX) / 2;
    const centerZ = (northZ + southZ) / 2;
    const roomHalfWidth = (eastX - westX) / 2;
    const roomHalfDepth = portalSquinchActive
      ? Math.max(1, Number(b.depth) || 2)
      : (southZ - northZ) / 2;
    const sourceRoomCenterZ = portalSquinchActive ? northInteriorZ : centerZ;
    const cornerCut = Math.max(0.1, Math.min(roomHalfWidth, roomHalfDepth) * (2 - Math.sqrt(2)));
    let halfSpan = Math.max(0.1, roomHalfWidth - cornerCut);
    const wallTop = Math.max(...['north', 'east', 'south', 'west'].map((side) => (
      Math.max(0.05, b.height + walls.extraHeights[side])
    )));
    let guideCenterX = centerX;
    let springY = wallTop + settings.springHeightOffset;
    let generatedPortalReferenceRib = null;
    if (portalSquinchActive) {
      const wallSystem = this.buildingGroup?.children?.find((child) => child.userData?.wallSystem);
      wallSystem?.updateMatrixWorld(true);
      wallSystem?.traverse((object) => {
        if (!generatedPortalReferenceRib
          && object.isMesh
          && object.userData?.roomDomePart === 'squinch-transition-rib'
          && object.userData?.roomSquinchArchIndex === 4) {
          generatedPortalReferenceRib = object;
        }
      });
      if (generatedPortalReferenceRib) {
        const ribPosition = generatedPortalReferenceRib.getWorldPosition(new THREE.Vector3());
        guideCenterX = ribPosition.x;
        halfSpan = Math.max(
          0.1,
          Number(generatedPortalReferenceRib.userData.roomSquinchArchHalfSpan) || halfSpan,
        );
        springY = Number.isFinite(Number(generatedPortalReferenceRib.userData.roomSquinchSpringY))
          ? Number(generatedPortalReferenceRib.userData.roomSquinchSpringY)
          : springY;
      } else {
        const generatedSpringY = Number(wallSystem?.userData?.portalSquinchVerticalWallTopY);
        if (Number.isFinite(generatedSpringY)) springY = generatedSpringY;
      }
    }
    const construction = pointedArchConstruction(
      guideCenterX,
      halfSpan,
      springY,
      settings.greenOffset,
      springY + settings.greenHeightOffset,
      { archType: settings.archType, redOffset: settings.redOffset },
    );
    const referenceWall = portalSquinchActive ? 'south' : 'north';
    let guideZ = portalSquinchActive
      ? southZ + settings.ribDepth / 2 + 0.035
      : northZ - settings.ribDepth / 2 - 0.035;
    if (generatedPortalReferenceRib) {
      const ribPosition = generatedPortalReferenceRib.getWorldPosition(new THREE.Vector3());
      const outwardNormal = new THREE.Vector3().fromArray(
        generatedPortalReferenceRib.userData.roomSquinchRibOutwardNormal || [0, 0, 1],
      ).normalize();
      const ribDepth = Math.max(
        0.01,
        Number(generatedPortalReferenceRib.userData.roomSquinchRibDepth) || settings.ribDepth,
      );
      guideZ = ribPosition.z + outwardNormal.z * (ribDepth / 2 + 0.035);
    }
    const guide = this.addArchConstructionDiagram(root, {
      construction,
      centerX: guideCenterX,
      guideZ,
      layerDirection: portalSquinchActive ? 1 : -1,
      name: `${portalSquinchActive ? 'Portal' : 'Room'} Squinch ${referenceWall}-wall reference arch construction circles and radii`,
      guideType: 'room_squinch',
    });
    if (!guide) return;
    let portalGuideVerticalScale = 1;
    if (generatedPortalReferenceRib) {
      const targetApexY = Number(generatedPortalReferenceRib.userData.roomDomeCrownY);
      const sourceRise = construction.apexPoint.y - springY;
      if (Number.isFinite(targetApexY) && sourceRise > 0.000001) {
        portalGuideVerticalScale = (targetApexY - springY) / sourceRise;
        guide.scale.y = portalGuideVerticalScale;
        guide.position.y = springY * (1 - portalGuideVerticalScale);
        // Construction circles become the same vertically developed ellipses
        // used to place the Portal rib. Keep only the point markers circular.
        guide.children.forEach((child) => {
          if (child.userData?.archConstructionRole?.endsWith('-center')) {
            child.scale.y = 1 / portalGuideVerticalScale;
          }
        });
        guide.userData.archConstructionApexY = targetApexY;
      }
    }
    guide.userData.roomSquinchReferenceRib = true;
    guide.userData.portalSquinchHalfSquareRoom = portalSquinchActive;
    guide.userData.roomSquinchReferenceWall = referenceWall;
    guide.userData.roomSquinchReferenceArchPlanCenter = [guideCenterX, sourceRoomCenterZ];
    guide.userData.portalSquinchFullRoomDepth = portalSquinchActive ? Math.max(2, Number(b.depth) * 2) : null;
    guide.userData.roomSquinchAutomaticTransitionTopY = generatedPortalReferenceRib
      ? Number(generatedPortalReferenceRib.userData.roomDomeCrownY)
      : construction.apexPoint.y;
    guide.userData.portalSquinchGuideSource = generatedPortalReferenceRib
      ? 'generated-south-wall-reference-rib'
      : portalSquinchActive
        ? 'normalized-portal-squinch-fallback'
        : 'normalized-room-squinch';
    guide.userData.portalSquinchReferenceRibIndex = generatedPortalReferenceRib?.userData?.roomSquinchArchIndex ?? null;
    guide.userData.portalSquinchReferenceRibHalfSpan = generatedPortalReferenceRib
      ? halfSpan
      : null;
    guide.userData.portalSquinchReferenceRibGuideZ = generatedPortalReferenceRib
      ? guideZ
      : null;
    guide.userData.portalSquinchGuideVerticalScale = generatedPortalReferenceRib
      ? portalGuideVerticalScale
      : null;
    this.orientArchConstructionGuideToRoomSection(guide, centerX, guideZ, sourceRoomCenterZ);
  }

  addRoomWallOpeningConstructionGuides(root) {
    const [first, second] = String(this.selectedOpeningGuide || '').split(':');
    const hasWallSide = ['north', 'east', 'south', 'west'].includes(first);
    const wallSide = hasWallSide ? first : 'south';
    const openingType = hasWallSide ? second : first;
    if (!['door', 'window'].includes(openingType)) return;
    const b = normalizeBuilding(this.building);
    const walls = normalizeWallSystem(this.walls, b);
    const opening = this.building.type === 'room'
      ? walls.roomWallOpenings?.[wallSide]?.[openingType]
      : walls.southOpenings?.[openingType];
    if (!opening?.enabled || opening.head !== 'arch') return;
    const halfWidth = Math.max(1, Number(b.width) / 2);
    const halfDepth = Math.max(1, Number(b.depth) / 2);
    const westX = -halfWidth - walls.sideOffsets.west;
    const eastX = halfWidth + walls.sideOffsets.east;
    const northZ = -halfDepth - walls.sideOffsets.north;
    const southZ = halfDepth + walls.sideOffsets.south;
    const centerX = (westX + eastX) / 2;
    const centerZ = (northZ + southZ) / 2;
    const span = wallSide === 'north' || wallSide === 'south'
      ? eastX - westX
      : southZ - northZ;
    const wallHeight = Math.max(0.05, b.height + walls.extraHeights[wallSide]);
    const builtWallSystem = this.buildingGroup.children.find((child) => child.userData?.wallSystem);
    const octagonHost = b.type === 'room'
      ? builtWallSystem?.children.find((child) => (
        child.userData?.roomDomePart === 'exterior-aligned-octagon-wall'
          && child.userData?.roomKarbandiOctagonTouchedWalls?.length === 1
          && child.userData.roomKarbandiOctagonTouchedWalls[0] === wallSide
          && child.userData.roomKarbandiInheritedOpenings?.some((entry) => entry.openingType === openingType)
      ))
      : null;
    const inheritedOpening = octagonHost?.userData.roomKarbandiInheritedOpenings
      ?.find((entry) => entry.openingType === openingType) || null;
    const movedToOctagon = Boolean(octagonHost && inheritedOpening);
    const octagonTopY = Number(octagonHost?.userData.roomKarbandiOctagonTopStart?.[1]);
    const hostHeight = movedToOctagon && Number.isFinite(octagonTopY) ? octagonTopY : wallHeight;
    const bottom = movedToOctagon
      ? Math.max(0, Number(opening.sillHeight) || 0)
      : Math.min(wallHeight - 0.3, opening.sillHeight);
    const profile = movedToOctagon
      ? null
      : southOpeningProfile(opening, 0, span, hostHeight, bottom);
    if (!movedToOctagon && !profile?.archPoints?.length) return;
    const guideCenter = movedToOctagon
      ? (inheritedOpening.left + inheritedOpening.right) / 2
      : profile.center;
    const guideWidth = movedToOctagon
      ? inheritedOpening.right - inheritedOpening.left
      : profile.width;
    const construction = pointedArchConstruction(
      guideCenter,
      guideWidth / 2,
      movedToOctagon ? inheritedOpening.springY : profile.springTop,
      opening.arch.greenOffset,
      movedToOctagon ? inheritedOpening.greenHeight : profile.greenHeight,
      { archType: opening.arch.archType, redOffset: opening.arch.redOffset, redRadius: opening.arch.redRadius },
    );
    if (!construction) return;
    const localGuideRoot = new THREE.Group();
    const guide = this.addArchConstructionDiagram(localGuideRoot, {
      construction,
      centerX: guideCenter,
      guideZ: -0.035,
      layerDirection: -1,
      name: this.building.type === 'room'
        ? `${wallSide} wall ${openingType === 'door' ? 'door' : 'window'} arch symmetric red and green construction circles`
        : `${openingType === 'door' ? 'Door' : 'Window'} arch symmetric red and green construction circles`,
      guideType: openingType,
    });
    if (!guide) return;
    guide.userData.wallSide = wallSide;
    guide.userData.openingHostSurface = movedToOctagon ? 'octagon-wall' : 'vertical-wall';
    if (movedToOctagon) {
      const start = new THREE.Vector3(...octagonHost.userData.roomKarbandiOctagonStart);
      const end = new THREE.Vector3(...octagonHost.userData.roomKarbandiOctagonEnd);
      const direction = end.clone().sub(start).setY(0).normalize();
      // The inherited opening profile already stores absolute world Y values.
      // Only place this local guide root on the octagon face in plan; copying
      // start.y would add the wall base height a second time.
      localGuideRoot.position.set(start.x, 0, start.z);
      localGuideRoot.rotation.y = Math.atan2(-direction.z, direction.x);
      const openingCenterWorld = start.clone().addScaledVector(direction, guideCenter);
      guide.userData.openingHostCenterWorld = openingCenterWorld.toArray();
      guide.userData.openingHostBottomY = inheritedOpening.bottomY;
      guide.userData.openingHostTopY = inheritedOpening.topY;
      guide.userData.openingHostSpringY = inheritedOpening.springY;
      guide.userData.openingHostApexY = inheritedOpening.topY;
    } else if (wallSide === 'south') localGuideRoot.position.set(centerX, 0, southZ);
    else if (wallSide === 'north') {
      localGuideRoot.position.set(centerX, 0, northZ);
      localGuideRoot.rotation.y = Math.PI;
    } else if (wallSide === 'east') {
      localGuideRoot.position.set(eastX, 0, centerZ);
      localGuideRoot.rotation.y = Math.PI / 2;
    } else if (wallSide === 'west') {
      localGuideRoot.position.set(westX, 0, centerZ);
      localGuideRoot.rotation.y = -Math.PI / 2;
    }
    root.add(localGuideRoot);
    this.orientArchConstructionGuideToRoomSection(localGuideRoot, centerX, -0.035, centerZ, guide);
  }

  addRoomPlanOpeningConstructionGuide(root) {
    const [prefix, openingId] = String(this.selectedOpeningGuide || '').split(':');
    if (prefix !== 'plan' || !openingId) return;
    const b = normalizeBuilding(this.building);
    const hallMode = ['hall', 'grid'].includes(b.buildingType);
    if (b.type !== 'room' || (!hallMode && (b.roomPlanShape || 'square') === 'square')) return;
    const walls = normalizeWallSystem(this.walls, b);
    const opening = walls.roomPlanOpenings?.find((entry) => entry.id === openingId);
    if (!opening || opening.head !== 'arch') return;
    if (hallMode) {
      const angle = ((Number(opening.rotation) % 360) + 360) % 360;
      const side = [
        { name: 'north', center: 0, span: b.width, origin: new THREE.Vector3(0, 0, -b.depth / 2), direction: new THREE.Vector3(1, 0, 0), placementDirection: 1 },
        { name: 'east', center: 90, span: b.depth, origin: new THREE.Vector3(b.width / 2, 0, 0), direction: new THREE.Vector3(0, 0, 1), placementDirection: 1 },
        { name: 'south', center: 180, span: b.width, origin: new THREE.Vector3(0, 0, b.depth / 2), direction: new THREE.Vector3(-1, 0, 0), placementDirection: 1 },
        { name: 'west', center: 270, span: b.depth, origin: new THREE.Vector3(-b.width / 2, 0, 0), direction: new THREE.Vector3(0, 0, -1), placementDirection: 1 },
      ].reduce((nearest, candidate) => {
        const raw = Math.abs(angle - candidate.center);
        const distance = Math.min(raw, 360 - raw);
        return !nearest || distance < nearest.distance ? { ...candidate, distance } : nearest;
      }, null);
      let delta = angle - side.center;
      while (delta > 180) delta -= 360;
      while (delta < -180) delta += 360;
      const maximumCenter = Math.max(0, side.span / 2 - opening.width / 2);
      const along = THREE.MathUtils.clamp(delta / 45 * side.span / 2, -maximumCenter, maximumCenter);
      const hostCenter = side.origin.clone().addScaledVector(side.direction, along);
      const springY = opening.sillHeight + opening.height;
      const construction = pointedArchConstruction(
        0,
        opening.width / 2,
        springY,
        opening.arch.greenOffset,
        opening.arch.greenHeight,
        { archType: opening.arch.archType, redOffset: opening.arch.redOffset },
      );
      if (!construction) return;
      const localGuideRoot = new THREE.Group();
      localGuideRoot.position.copy(hostCenter);
      localGuideRoot.rotation.y = Math.atan2(-side.direction.z, side.direction.x);
      const guide = this.addArchConstructionDiagram(localGuideRoot, {
        construction,
        centerX: 0,
        guideZ: -0.035,
        layerDirection: -1,
        name: `Hall ${side.name} ${opening.type} ${opening.id} arch construction circles and radii`,
        guideType: opening.type,
      });
      if (!guide) return;
      guide.userData.wallSide = side.name;
      guide.userData.roomPlanOpeningId = opening.id;
      guide.userData.openingHostSurface = `hall-${side.name}-wall`;
      guide.userData.openingHostCenterWorld = hostCenter.toArray();
      guide.userData.openingHostRotation = opening.rotation;
      root.add(localGuideRoot);
      this.orientArchConstructionGuideToRoomSection(localGuideRoot, hostCenter.x, -0.035, hostCenter.z, guide);
      return;
    }
    const wallSystem = this.buildingGroup.children.find((child) => child.userData?.wallSystem);
    const planGroup = wallSystem?.children.find((child) => child.userData?.roomPlanShape === b.roomPlanShape);
    const planVertices = planGroup?.userData.roomPlanVertices || wallSystem?.userData.roomPlanVertices;
    const vertices = planVertices?.map(([x, z]) => new THREE.Vector3(x, 0, z)) || [];
    const sideCount = vertices.length;
    if (sideCount < 3) return;
    const segmentLengths = vertices.map((point, index) => point.distanceTo(vertices[(index + 1) % sideCount]));
    const segmentStarts = segmentLengths.reduce((starts, length) => [...starts, starts.at(-1) + length], [0]);
    const perimeter = segmentStarts.at(-1);
    const northSegmentIndex = vertices.reduce((northIndex, point, candidateIndex) => {
      const midpoint = point.clone().add(vertices[(candidateIndex + 1) % sideCount]).multiplyScalar(0.5);
      const northPoint = vertices[northIndex].clone().add(vertices[(northIndex + 1) % sideCount]).multiplyScalar(0.5);
      return midpoint.z < northPoint.z ? candidateIndex : northIndex;
    }, 0);
    const northPhase = segmentStarts[northSegmentIndex] + segmentLengths[northSegmentIndex] / 2;
    const centerPhase = ((northPhase + opening.rotation / 360 * perimeter) % perimeter + perimeter) % perimeter;
    const foundSegmentIndex = segmentLengths.findIndex((length, index) => (
      centerPhase < segmentStarts[index] + length - 0.000001
    ));
    const segmentIndex = foundSegmentIndex < 0 ? sideCount - 1 : foundSegmentIndex;
    const start = vertices[segmentIndex];
    const end = vertices[(segmentIndex + 1) % sideCount];
    const direction = end.clone().sub(start).normalize();
    const localDistance = centerPhase - segmentStarts[segmentIndex];
    const hostCenter = start.clone().addScaledVector(direction, localDistance);
    const bottom = opening.sillHeight;
    const springY = bottom + opening.height;
    const construction = pointedArchConstruction(
      0,
      opening.width / 2,
      springY,
      opening.arch.greenOffset,
      opening.arch.greenHeight,
      { archType: opening.arch.archType, redOffset: opening.arch.redOffset },
    );
    if (!construction) return;
    const localGuideRoot = new THREE.Group();
    localGuideRoot.position.copy(hostCenter);
    localGuideRoot.rotation.y = Math.atan2(-direction.z, direction.x);
    const guide = this.addArchConstructionDiagram(localGuideRoot, {
      construction,
      centerX: 0,
      guideZ: -0.035,
      layerDirection: -1,
      name: `Room plan ${opening.type} ${opening.id} arch symmetric red and green construction circles and radii`,
      guideType: opening.type,
    });
    if (!guide) return;
    guide.userData.wallSide = 'room_plan';
    guide.userData.roomPlanOpeningId = opening.id;
    guide.userData.openingHostSurface = `${b.roomPlanShape}-wall`;
    guide.userData.openingHostCenterWorld = hostCenter.toArray();
    guide.userData.openingHostSegmentIndex = segmentIndex;
    guide.userData.openingHostRotation = opening.rotation;
    root.add(localGuideRoot);
    this.orientArchConstructionGuideToRoomSection(localGuideRoot, hostCenter.x, -0.035, hostCenter.z, guide);
  }

  updateWallSurfaceHighlight() {
    this.invalidate();
    this.clearWallSurfaceHighlight();
    const openSide = this.selectedWallSide === 'south_arch' ? 'south' : this.selectedWallSide?.startsWith('north_') ? 'north' : this.selectedWallSide;
    if (!this.selectedWallSide || !this.walls.enabled) return;
    if (this.selectedWallSide && this.walls.openSides.includes(openSide)) return;
    const wallSystem = this.buildingGroup.children.find((child) => child.userData?.wallSystem);
    if (!wallSystem) return;
    const root = new THREE.Group();
    root.name = `Selected ${this.selectedWallSide} wall side`;
    const highlightMaterial = new THREE.MeshBasicMaterial({
      color: '#ffe252',
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const edgeMaterial = new THREE.LineBasicMaterial({ color: '#fff8b5', depthTest: false, transparent: true, opacity: 0.95 });
    const selectedSide = this.selectedWallSide;
    const selectingKarbandiCover = selectedSide === 'south_arch' && this.walls.karbandi?.enabled === true;
    wallSystem.updateMatrixWorld(true);
    if (selectedSide) wallSystem.traverse((child) => {
      if (!child.isMesh || !child.geometry) return;
      const wallSide = child.userData?.wallSide === 'arch' ? 'south_arch' : child.userData?.wallSide;
      const roomPlanSurface = ['room_plan_interior', 'room_plan_exterior'].includes(selectedSide);
      if (roomPlanSurface ? child.userData?.isRoomWallBody !== true : wallSide !== selectedSide) return;
      if (child.userData?.isWallEdgeLine) return;
      // Clicking the Karbandi roof must not select every generic arch mesh.
      // Limit this highlight to the cover and its actual rib network.
      if (selectingKarbandiCover && !child.userData?.isKarbandiCover && !child.userData?.isKarbandi) return;
      let highlightGeometry = child.geometry.clone();
      if (roomPlanSurface) {
        const materialIndex = selectedSide === 'room_plan_interior' ? 0 : 1;
        const source = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone();
        const matching = source.groups.filter((group) => group.materialIndex === materialIndex);
        if (!matching.length) return;
        const filtered = new THREE.BufferGeometry();
        Object.entries(source.attributes).forEach(([name, attribute]) => {
          const values = [];
          matching.forEach((group) => {
            for (let index = group.start; index < group.start + group.count; index += 1) {
              for (let component = 0; component < attribute.itemSize; component += 1) {
                values.push(attribute.array[index * attribute.itemSize + component]);
              }
            }
          });
          filtered.setAttribute(name, new THREE.Float32BufferAttribute(values, attribute.itemSize));
        });
        source.dispose();
        highlightGeometry.dispose();
        highlightGeometry = filtered;
      }
      const sourceMaterial = Array.isArray(child.material) ? child.material[0] : child.material;
      const hasClipping = Boolean(sourceMaterial?.clippingPlanes?.length);
      const meshHighlightMaterial = hasClipping ? highlightMaterial.clone() : highlightMaterial;
      if (hasClipping) {
        meshHighlightMaterial.clippingPlanes = sourceMaterial.clippingPlanes;
        meshHighlightMaterial.clipIntersection = sourceMaterial.clipIntersection === true;
        meshHighlightMaterial.needsUpdate = true;
      }
      const highlight = new THREE.Mesh(highlightGeometry, meshHighlightMaterial);
      child.matrixWorld.decompose(highlight.position, highlight.quaternion, highlight.scale);
      highlight.renderOrder = 18;
      highlight.userData.isWallSideHighlight = true;
      // Line materials do not support clipping planes. Drawing EdgesGeometry
      // here would reveal the full pre-clipped rib, so clipped ribs use only
      // their correctly clipped translucent mesh highlight.
      if (!hasClipping) {
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(highlight.geometry), edgeMaterial);
        edges.renderOrder = 19;
        edges.userData.isWallSideHighlight = true;
        highlight.add(edges);
      }
      root.add(highlight);
    });
    if (!root.children.length) {
      highlightMaterial.dispose();
      edgeMaterial.dispose();
      return;
    }
    this.wallSurfaceHighlight = root;
    this.scene.add(root);
  }

  updateSelectionOutline() {
    this.invalidate();
    if (this.selectionOutline) {
      this.scene.remove(this.selectionOutline);
      this.selectionOutline.geometry?.dispose();
      this.selectionOutline.material?.dispose();
      this.selectionOutline = null;
    }
    this.transformControls.detach();
    const selected = this.placementGroup.children.find((child) => child.userData.placementId === this.selectedId);
    const selectedProject = this.projectInstanceGroup.children.find((child) => (
      child.userData.projectInstanceId === this.selectedProjectInstanceId
    ));
    if (selected && !objectIsSelectable(selected, this.placementGroup)) {
      this.selectedId = null;
      this.callbacks.onSelection?.(null);
      return;
    }
    const selectedZone = this.zoneGroup.children.find((child) => child.userData.zoneId === this.selectedZoneId);
    const target = selectedProject || selected || selectedZone;
    if (!target) return;
    if (selected?.userData.assetType === 'muqarnas_assembly') {
      const exactBounds = previewWorldBounds(selected, (object) => object.userData.exactMuqarnasGeometry === true);
      this.selectionOutline = exactBounds.isEmpty()
        ? new THREE.BoxHelper(target, '#ffe252')
        : new THREE.Box3Helper(exactBounds, '#ffe252');
      if (this.selectionOutline.isBox3Helper) {
        this.selectionOutline.userData.exactBoundsTarget = selected;
      }
    } else {
      this.selectionOutline = new THREE.BoxHelper(target, selectedProject || selected ? '#ffe252' : '#2f7d86');
    }
    this.selectionOutline.material.depthTest = false;
    this.selectionOutline.renderOrder = 20;
    this.scene.add(this.selectionOutline);
    if (selectedProject || selected) this.transformControls.attach(selectedProject || selected);
  }

  frameModel() {
    const b = this.building;
    const radius = Math.max(b.width, b.depth, b.height);
    this.controls.target.set(0, b.height * 0.42, 0);
    this.camera.up.set(0, 1, 0);
    this.camera.position.set(-radius * 1.35, radius * 0.85, -radius * 1.5);
    this.camera.lookAt(this.controls.target);
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  setStageView(view = 'isometric') {
    this.invalidate();
    const bounds = this.completeModelBounds();
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z, this.building.width, this.building.depth, this.building.height, 2) * 1.35;
    const target = new THREE.Vector3(center.x, Math.max(0.4, center.y), center.z);
    this.controls.target.copy(target);
    this.camera.up.set(0, 1, 0);
    if (view === 'top') {
      this.camera.up.set(0, 0, -1);
      this.camera.position.set(target.x, target.y + radius * 1.45, target.z + 0.001);
    } else if (view === 'front') {
      this.camera.position.set(target.x, target.y, target.z - radius * 1.55);
    } else if (view === 'side') {
      this.camera.position.set(target.x + radius * 1.55, target.y, target.z);
    } else {
      const sphere = bounds.getBoundingSphere(new THREE.Sphere());
      const verticalFov = THREE.MathUtils.degToRad(this.camera.fov);
      const aspect = Math.max(0.1, this.camera.aspect || 1);
      const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * aspect);
      const limitingFov = Math.max(THREE.MathUtils.degToRad(8), Math.min(verticalFov, horizontalFov));
      const fitDistance = Math.max(
        radius,
        (Math.max(0.5, sphere.radius) / Math.sin(limitingFov / 2)) * 1.08,
      );
      const direction = new THREE.Vector3(-1.15, 0.78, -1.25).normalize();
      this.camera.position.copy(target).addScaledVector(direction, fitDistance);
    }
    this.camera.lookAt(target);
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  restoreRoomSectionMaterials() {
    this.sectionMaterialClipping.forEach((snapshot, material) => {
      material.clippingPlanes = snapshot.planes ? [...snapshot.planes] : null;
      material.clipIntersection = snapshot.clipIntersection;
      material.clipShadows = snapshot.clipShadows;
      material.needsUpdate = true;
    });
    this.sectionMaterialClipping.clear();
    if (this.sectionCapGroup) this.clearGroup(this.sectionCapGroup);
    this.syncHallSectionConstructionGuides();
  }

  syncHallSectionConstructionGuides() {
    this.buildingGroup?.traverse((child) => {
      const plane = child.userData?.hallConstructionGuidePlane;
      if (!plane) return;
      child.visible = plane === (this.sectionViewEnabled ? this.sectionViewAxis : 'x');
    });
  }

  roomSectionHatchMaterial() {
    let texture = null;
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const context = canvas.getContext?.('2d');
      if (context?.beginPath) {
        context.fillStyle = '#62666a';
        context.fillRect(0, 0, 64, 64);
        context.strokeStyle = '#111111';
        context.lineWidth = 2.5;
        [-64, 0, 64].forEach((offset) => {
          context.beginPath();
          context.moveTo(offset, 64);
          context.lineTo(offset + 64, 0);
          context.stroke();
        });
        texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.needsUpdate = true;
      }
    }
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      color: texture ? '#ffffff' : '#62666a',
      // The east half is removed for this section, so caps face east and are
      // intentionally invisible from behind the retained west half.
      side: THREE.FrontSide,
      // Respect intact masonry in front of a cap. The small cut-plane offset
      // and polygon offset below keep the actual cut interface continuous
      // without allowing it to render through walls.
      depthTest: true,
      depthWrite: true,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    material.userData.roomSectionCutFace = true;
    material.userData.roomSectionFillColor = '#62666a';
    material.userData.roomSectionHatch = 'black-45-degree';
    material.userData.roomSectionVisibilityPolicy = 'east-facing-cut-interface-depth-occluded-by-intact-masonry';
    material.userData.generatedTexture = texture;
    return material;
  }

  roomSectionLoopsForMesh(mesh, center, axis = 'x') {
    return this.roomSectionLoopsForMeshes([mesh], center, null, axis);
  }

  roomSectionLoopsForMeshes(meshes, center, closeOpenAtY = null, axis = 'x') {
    const epsilon = 0.0001;
    const pointKey = (point) => `${Math.round(point.x / epsilon)}:${Math.round(point.y / epsilon)}`;
    const segments = new Map();
    meshes.filter(Boolean).forEach((mesh) => {
      const position = mesh.geometry?.getAttribute?.('position');
      if (!position || position.count < 3) return;
      mesh.updateWorldMatrix(true, false);
      const index = mesh.geometry.index;
      const triangleCount = index ? index.count / 3 : position.count / 3;
      const worldVertex = (vertexIndex) => new THREE.Vector3()
        .fromBufferAttribute(position, vertexIndex)
        .applyMatrix4(mesh.matrixWorld);
      for (let triangle = 0; triangle < triangleCount; triangle += 1) {
        const vertices = [0, 1, 2].map((offset) => worldVertex(
          index ? index.getX(triangle * 3 + offset) : triangle * 3 + offset,
        ));
        const distances = vertices.map((point) => (axis === 'y' ? point.z : point.x) - center);
        if (distances.every((distance) => Math.abs(distance) <= epsilon)) continue;
        const intersections = [];
        [[0, 1], [1, 2], [2, 0]].forEach(([first, second]) => {
          const a = vertices[first];
          const b = vertices[second];
          const da = distances[first];
          const db = distances[second];
          let point = null;
          if (Math.abs(da) <= epsilon) point = a;
          else if (Math.abs(db) <= epsilon) point = b;
          else if (da * db < 0) point = a.clone().lerp(b, da / (da - db));
          if (!point) return;
          const projected = new THREE.Vector2(axis === 'y' ? point.x : point.z, point.y);
          if (!intersections.some((entry) => entry.distanceToSquared(projected) <= epsilon ** 2)) {
            intersections.push(projected);
          }
        });
        if (intersections.length < 2) continue;
        let pair = [intersections[0], intersections[1]];
        intersections.forEach((first) => intersections.forEach((second) => {
          if (first.distanceToSquared(second) > pair[0].distanceToSquared(pair[1])) pair = [first, second];
        }));
        const firstKey = pointKey(pair[0]);
        const secondKey = pointKey(pair[1]);
        if (firstKey === secondKey) continue;
        const segmentKey = [firstKey, secondKey].sort().join('|');
        if (!segments.has(segmentKey)) segments.set(segmentKey, { points: pair, keys: [firstKey, secondKey] });
      }
    });
    const entries = [...segments.values()];
    const adjacency = new Map();
    entries.forEach((entry, segmentIndex) => entry.keys.forEach((key) => {
      if (!adjacency.has(key)) adjacency.set(key, []);
      adjacency.get(key).push(segmentIndex);
    }));
    const used = new Set();
    const loops = [];
    const entryOrder = entries.map((entry, index) => ({ entry, index }));
    if (Number.isFinite(closeOpenAtY)) entryOrder.sort((first, second) => {
      const firstEndpoint = first.entry.keys.some((key) => adjacency.get(key)?.length === 1) ? 0 : 1;
      const secondEndpoint = second.entry.keys.some((key) => adjacency.get(key)?.length === 1) ? 0 : 1;
      return firstEndpoint - secondEndpoint;
    });
    entryOrder.forEach(({ entry, index: startIndex }) => {
      if (used.has(startIndex)) return;
      used.add(startIndex);
      const reverseStart = Number.isFinite(closeOpenAtY)
        && adjacency.get(entry.keys[0])?.length !== 1
        && adjacency.get(entry.keys[1])?.length === 1;
      const startPointIndex = reverseStart ? 1 : 0;
      const endPointIndex = reverseStart ? 0 : 1;
      const path = [entry.points[startPointIndex].clone(), entry.points[endPointIndex].clone()];
      const startKey = entry.keys[startPointIndex];
      let currentKey = entry.keys[endPointIndex];
      let guard = 0;
      while (currentKey !== startKey && guard < entries.length + 2) {
        const nextIndex = (adjacency.get(currentKey) || []).find((candidate) => !used.has(candidate));
        if (nextIndex == null) break;
        used.add(nextIndex);
        const next = entries[nextIndex];
        const fromFirst = next.keys[0] === currentKey;
        path.push(next.points[fromFirst ? 1 : 0].clone());
        currentKey = next.keys[fromFirst ? 1 : 0];
        guard += 1;
      }
      const closed = currentKey === startKey;
      if (closed) path.pop();
      else {
        const closesAcrossTop = Number.isFinite(closeOpenAtY)
          && path.length >= 3
          && Math.abs(path[0].y - closeOpenAtY) <= 0.001
          && Math.abs(path[path.length - 1].y - closeOpenAtY) <= 0.001;
        if (!closesAcrossTop) return;
      }
      if (path.length < 3) return;
      const area = Math.abs(path.reduce((sum, point, pointIndex) => {
        const next = path[(pointIndex + 1) % path.length];
        return sum + point.x * next.y - next.x * point.y;
      }, 0) / 2);
      if (area > 0.00001) loops.push(path);
    });
    return loops;
  }

  roomTransitionSectionLoops(mesh, center, axis = 'x') {
    if (mesh.userData?.roomDomePart !== 'exterior-aligned-octagon-wall') return [];
    const pointArrays = [
      mesh.userData.roomKarbandiOctagonStart,
      mesh.userData.roomKarbandiOctagonEnd,
      mesh.userData.roomKarbandiOctagonInnerStart,
      mesh.userData.roomKarbandiOctagonInnerEnd,
    ];
    if (!pointArrays.every((point) => Array.isArray(point) && point.length === 3)) return [];
    const [outerStart, outerEnd, innerStart, innerEnd] = pointArrays.map((point) => new THREE.Vector3(...point));
    if (![outerStart, outerEnd, innerStart, innerEnd].every((point) => Number.isFinite(point.x))) return [];
    const intersectAtSection = (start, end) => {
      const startCoordinate = axis === 'y' ? start.z : start.x;
      const endCoordinate = axis === 'y' ? end.z : end.x;
      const delta = endCoordinate - startCoordinate;
      if (Math.abs(delta) <= 0.000001) return null;
      const amount = (center - startCoordinate) / delta;
      if (amount < -0.000001 || amount > 1.000001) return null;
      return { point: start.clone().lerp(end, amount), amount };
    };
    const outerHit = intersectAtSection(outerStart, outerEnd);
    const innerHit = intersectAtSection(innerStart, innerEnd);
    if (!outerHit || !innerHit) return [];
    const bottomY = Number(mesh.userData.roomKarbandiMasonryBaseY);
    const topY = Number(mesh.userData.roomKarbandiMasonryTopY);
    if (!Number.isFinite(bottomY) || !Number.isFinite(topY) || topY <= bottomY + 0.0001) return [];
    const edgeLength = outerStart.distanceTo(outerEnd);
    const cutU = outerHit.amount * edgeLength;
    const openings = (mesh.userData.roomKarbandiInheritedOpenings || []).filter((opening) => (
      cutU >= Number(opening.left) - 0.0001
        && cutU <= Number(opening.right) + 0.0001
    ));
    const intervals = [[bottomY, topY]];
    openings.forEach((opening) => {
      const openingBottom = THREE.MathUtils.clamp(Number(opening.bottomY), bottomY, topY);
      const openingTop = THREE.MathUtils.clamp(Number(opening.topY), bottomY, topY);
      if (!(openingTop > openingBottom + 0.0001)) return;
      const nextIntervals = [];
      intervals.forEach(([startY, endY]) => {
        if (openingTop <= startY || openingBottom >= endY) nextIntervals.push([startY, endY]);
        else {
          if (openingBottom > startY + 0.0001) nextIntervals.push([startY, openingBottom]);
          if (openingTop < endY - 0.0001) nextIntervals.push([openingTop, endY]);
        }
      });
      intervals.splice(0, intervals.length, ...nextIntervals);
    });
    return intervals.map(([startY, endY]) => [
      new THREE.Vector2(axis === 'y' ? outerHit.point.x : outerHit.point.z, startY),
      new THREE.Vector2(axis === 'y' ? outerHit.point.x : outerHit.point.z, endY),
      new THREE.Vector2(axis === 'y' ? innerHit.point.x : innerHit.point.z, endY),
      new THREE.Vector2(axis === 'y' ? innerHit.point.x : innerHit.point.z, startY),
    ]).filter((loop) => Math.abs(loop[0].x - loop[3].x) > 0.0001);
  }

  roomSectionLoopsOutsideCircularVoid(loops, centerZ, radius) {
    if (!Number.isFinite(radius) || radius <= 0) return loops;
    const clipHalfPlane = (loop, boundary, keepLess) => {
      const clipped = [];
      const inside = (point) => (keepLess ? point.x <= boundary + 0.000001 : point.x >= boundary - 0.000001);
      for (let index = 0; index < loop.length; index += 1) {
        const current = loop[index];
        const next = loop[(index + 1) % loop.length];
        const currentInside = inside(current);
        const nextInside = inside(next);
        if (currentInside) clipped.push(current.clone());
        if (currentInside !== nextInside && Math.abs(next.x - current.x) > 0.000001) {
          const amount = THREE.MathUtils.clamp((boundary - current.x) / (next.x - current.x), 0, 1);
          clipped.push(current.clone().lerp(next, amount));
        }
      }
      return clipped.length >= 3 ? clipped : [];
    };
    return loops.flatMap((loop) => [
      clipHalfPlane(loop, centerZ - radius, true),
      clipHalfPlane(loop, centerZ + radius, false),
    ]).filter((loop) => loop.length >= 3);
  }

  roomContinuousKarbandiRoofSectionLoops(loops, centerZ, roofThickness) {
    const binSize = 0.004;
    const safeThickness = Math.max(0.001, roofThickness);
    return loops.map((loop) => {
      const bins = new Map();
      loop.forEach((point) => {
        const key = Math.round(point.x / binSize);
        const entry = bins.get(key) || { z: point.x, topY: point.y, count: 0 };
        entry.z = (entry.z * entry.count + point.x) / (entry.count + 1);
        entry.topY = Math.max(entry.topY, point.y);
        entry.count += 1;
        bins.set(key, entry);
      });
      const samples = [...bins.values()].sort((left, right) => left.z - right.z);
      if (samples.length < 2) return loop;
      const rawTop = samples.map((sample) => sample.topY);
      const smoothedTop = rawTop.map((value, index) => {
        const start = Math.max(0, index - 2);
        const end = Math.min(rawTop.length - 1, index + 2);
        let total = 0;
        for (let neighbor = start; neighbor <= end; neighbor += 1) total += rawTop[neighbor];
        return total / (end - start + 1);
      });
      const isNorthSide = samples.reduce((sum, sample) => sum + sample.z, 0) / samples.length < centerZ;
      for (let index = 1; index < smoothedTop.length; index += 1) {
        smoothedTop[index] = isNorthSide
          ? Math.max(smoothedTop[index - 1], smoothedTop[index])
          : Math.min(smoothedTop[index - 1], smoothedTop[index]);
      }
      const top = samples.map((sample, index) => new THREE.Vector2(sample.z, smoothedTop[index]));
      const bottom = [...top].reverse().map((point) => new THREE.Vector2(point.x, point.y - safeThickness));
      return [...top, ...bottom];
    }).filter((loop) => loop.length >= 4);
  }

  roomInsetSectionLoops(loops, inset = 0.0015) {
    return loops.map((loop) => {
      const center = loop.reduce((sum, point) => sum.add(point), new THREE.Vector2())
        .multiplyScalar(1 / loop.length);
      return loop.map((point) => {
        const towardCenter = center.clone().sub(point);
        if (towardCenter.lengthSq() <= inset * inset) return point.clone();
        return point.clone().add(towardCenter.setLength(inset));
      });
    });
  }

  setRoomCircularCourseConstructionReveal(child, progress = 1) {
    const materials = this.prepareConstructionMaterial(child);
    if (!materials.length) return;
    const boundedProgress = THREE.MathUtils.clamp(progress, 0, 1);
    child.visible = boundedProgress > 0.001;
    child.updateWorldMatrix(true, false);
    const bounds = new THREE.Box3().setFromObject(child);
    const center = bounds.getCenter(new THREE.Vector3());
    const courseHeight = Math.max(
      0.01,
      Number(this.walls.bricks?.brickHeight || 0.08) + Number(this.walls.bricks?.mortar || 0.01),
    );
    const brickLength = Math.max(0.02, Number(this.walls.bricks?.brickWidth || 0.2));
    const uniforms = {
      roomCourseProgress: { value: boundedProgress },
      roomCourseBottom: { value: bounds.min.y },
      roomCourseTop: { value: bounds.max.y },
      roomCourseHeight: { value: courseHeight },
      roomCourseBrickLength: { value: brickLength },
      roomCourseCenter: { value: new THREE.Vector2(center.x, center.z) },
    };
    const configureMaterial = (material) => {
      if (material.userData?.roomConstructionCourseRevealUniforms) {
        const existing = material.userData.roomConstructionCourseRevealUniforms;
        Object.entries(uniforms).forEach(([name, uniform]) => {
          if (existing[name]?.value?.copy && uniform.value?.isVector2) existing[name].value.copy(uniform.value);
          else if (existing[name]) existing[name].value = uniform.value;
        });
        return;
      }
      material.userData.roomConstructionCourseRevealUniforms = uniforms;
      material.userData.roomConstructionRevealMode = 'continuous-circular-brick-by-brick-bottom-to-top';
      material.userData.roomConstructionCourseHeight = courseHeight;
      material.userData.roomConstructionBrickLength = brickLength;
      const previousCompile = material.onBeforeCompile;
      const previousCacheKey = material.customProgramCacheKey.bind(material);
      material.onBeforeCompile = (shader, renderer) => {
        previousCompile.call(material, shader, renderer);
        Object.assign(shader.uniforms, material.userData.roomConstructionCourseRevealUniforms);
        shader.vertexShader = `varying vec3 vRoomConstructionWorldPosition;\n${shader.vertexShader}`
          .replace(
            '#include <project_vertex>',
            '#include <project_vertex>\n vRoomConstructionWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;',
          );
        shader.fragmentShader = `
uniform float roomCourseProgress;
uniform float roomCourseBottom;
uniform float roomCourseTop;
uniform float roomCourseHeight;
uniform float roomCourseBrickLength;
uniform vec2 roomCourseCenter;
varying vec3 vRoomConstructionWorldPosition;
${shader.fragmentShader}`.replace(
          '#include <clipping_planes_fragment>',
          `#include <clipping_planes_fragment>
          if (roomCourseProgress < 0.999999) {
            float courseSpan = max(0.0001, roomCourseTop - roomCourseBottom);
            float courseCount = max(1.0, ceil(courseSpan / roomCourseHeight));
            float coursePosition = clamp(roomCourseProgress, 0.0, 1.0) * courseCount;
            float activeCourse = min(courseCount - 1.0, floor(coursePosition));
            float activeCourseProgress = coursePosition - activeCourse;
            float pointCourse = min(
              courseCount - 1.0,
              floor(max(0.0, vRoomConstructionWorldPosition.y - roomCourseBottom) / roomCourseHeight)
            );
            if (pointCourse > activeCourse + 0.25) discard;
            if (abs(pointCourse - activeCourse) < 0.25) {
              vec2 radial = vRoomConstructionWorldPosition.xz - roomCourseCenter;
              float radius = max(roomCourseBrickLength, length(radial));
              float brickCount = max(1.0, floor(6.28318530718 * radius / roomCourseBrickLength + 0.5));
              float revealedBricks = ceil(activeCourseProgress * brickCount - 0.00001);
              float angleProgress = mod(atan(radial.y, radial.x) + 6.28318530718, 6.28318530718) / 6.28318530718;
              if (angleProgress > revealedBricks / brickCount) discard;
            }
          }`,
        );
        material.userData.roomConstructionCourseRevealShader = shader;
      };
      material.customProgramCacheKey = () => `${previousCacheKey()}|room-circular-course-reveal-v1`;
      material.needsUpdate = true;
    };
    materials.forEach((material, index) => {
      const permanentMaterial = this.permanentConstructionMaterial(child, index);
      material.clippingPlanes = Array.isArray(permanentMaterial?.clippingPlanes)
        ? [...permanentMaterial.clippingPlanes]
        : null;
      configureMaterial(material);
    });
    if (!Object.hasOwn(child.userData, 'constructionOriginalCustomDepthMaterial')) {
      // Three.js checks customDepthMaterial against `undefined`; assigning
      // null is interpreted as a real material and crashes shadow rendering.
      child.userData.constructionOriginalCustomDepthMaterial = child.customDepthMaterial;
      child.customDepthMaterial = new THREE.MeshDepthMaterial({
        depthPacking: THREE.RGBADepthPacking,
        side: Array.isArray(child.material) ? child.material[0]?.side : child.material.side,
      });
      configureMaterial(child.customDepthMaterial);
    } else if (child.customDepthMaterial) configureMaterial(child.customDepthMaterial);
    child.userData.roomConstructionCourseSequence = {
      direction: 'bottom-to-top',
      courseOrder: 'complete-current-ring-before-next-course',
      brickOrder: 'continuous-rotation-one-brick-at-a-time',
      courseHeight,
      brickLength,
      progress: boundedProgress,
    };
  }

  roomSectionEnvelopeLoopsForMeshes(
    meshes,
    center,
    fallbackThickness = 0.05,
    captureThreshold = 0.0001,
    boundaryPadding = 0,
    axis = 'x',
  ) {
    const epsilon = Math.max(0.0001, captureThreshold);
    const binSize = 0.006;
    const bins = new Map();
    const appendPoint = (point) => {
      const horizontal = axis === 'y' ? point.x : point.z;
      const key = Math.round(horizontal / binSize);
      const entry = bins.get(key) || { z: horizontal, minY: point.y, maxY: point.y, count: 0 };
      entry.z = (entry.z * entry.count + horizontal) / (entry.count + 1);
      entry.minY = Math.min(entry.minY, point.y);
      entry.maxY = Math.max(entry.maxY, point.y);
      entry.count += 1;
      bins.set(key, entry);
    };
    meshes.filter(Boolean).forEach((mesh) => {
      const position = mesh.geometry?.getAttribute?.('position');
      if (!position || position.count < 3) return;
      mesh.updateWorldMatrix(true, false);
      const index = mesh.geometry.index;
      const triangleCount = index ? index.count / 3 : position.count / 3;
      const worldVertex = (vertexIndex) => new THREE.Vector3()
        .fromBufferAttribute(position, vertexIndex)
        .applyMatrix4(mesh.matrixWorld);
      for (let triangle = 0; triangle < triangleCount; triangle += 1) {
        const vertices = [0, 1, 2].map((offset) => worldVertex(
          index ? index.getX(triangle * 3 + offset) : triangle * 3 + offset,
        ));
        const distances = vertices.map((point) => (axis === 'y' ? point.z : point.x) - center);
        [[0, 1], [1, 2], [2, 0]].forEach(([first, second]) => {
          const a = vertices[first];
          const b = vertices[second];
          const da = distances[first];
          const db = distances[second];
          if (Math.abs(da) <= epsilon) appendPoint(a);
          if (da * db < 0) appendPoint(a.clone().lerp(b, da / (da - db)));
        });
      }
    });
    const samples = [...bins.values()].sort((left, right) => left.z - right.z);
    if (samples.length < 2) return [];
    samples.forEach((sample) => {
      if (sample.maxY - sample.minY < fallbackThickness * 0.2) {
        sample.minY = sample.maxY - fallbackThickness;
      }
      sample.minY -= boundaryPadding;
      sample.maxY += boundaryPadding;
    });
    if (boundaryPadding > 0 && samples.length >= 2) {
      samples.unshift({
        ...samples[0],
        z: samples[0].z - boundaryPadding,
      });
      samples.push({
        ...samples[samples.length - 1],
        z: samples[samples.length - 1].z + boundaryPadding,
      });
    }
    return [[
      ...samples.map((sample) => new THREE.Vector2(sample.z, sample.maxY)),
      ...[...samples].reverse().map((sample) => new THREE.Vector2(sample.z, sample.minY)),
    ]];
  }

  buildRoomSectionCaps(center, axis = 'x') {
    if (!this.sectionCapGroup) {
      this.sectionCapGroup = new THREE.Group();
      this.sectionCapGroup.name = 'Room section cut faces';
      this.scene?.add(this.sectionCapGroup);
    }
    this.clearGroup(this.sectionCapGroup);
    const cutMaterial = this.roomSectionHatchMaterial();
    cutMaterial.userData.roomSectionAxis = axis;
    cutMaterial.userData.roomSectionVisibilityPolicy = axis === 'y'
      ? 'south-facing-cut-interface-depth-occluded-by-intact-masonry'
      : 'east-facing-cut-interface-depth-occluded-by-intact-masonry';
    const hatchSpacing = 0.08;
    const excluded = (child) => child.userData?.isBrickFace === true
      || child.userData?.isWallEdgeLine === true
      || child.userData?.isKarbandiVisualGuide === true
      || (this.building?.domeTransitionCoverEnabled === true
        && child.userData?.isKarbandi === true)
      || child.userData?.roomDomeOpeningVoid === true
      || child.userData?.roomDomePart === 'karbandi-roof-to-drum-infill'
      || child.userData?.roomDomePart === 'karbandi-rib-top-backing';
    const sectionHatchLinePoints = (loop) => {
      const points = [];
      const sums = loop.map((point) => point.x + point.y);
      const minimum = Math.floor(Math.min(...sums) / hatchSpacing) * hatchSpacing;
      const maximum = Math.ceil(Math.max(...sums) / hatchSpacing) * hatchSpacing;
      for (let diagonal = minimum; diagonal <= maximum + 0.000001; diagonal += hatchSpacing) {
        const intersections = [];
        loop.forEach((start, index) => {
          const end = loop[(index + 1) % loop.length];
          const startDistance = start.x + start.y - diagonal;
          const endDistance = end.x + end.y - diagonal;
          if (!((startDistance <= 0 && endDistance > 0)
            || (endDistance <= 0 && startDistance > 0))) return;
          const amount = startDistance / (startDistance - endDistance);
          intersections.push(start.clone().lerp(end, amount));
        });
        intersections.sort((left, right) => left.x - right.x);
        for (let index = 0; index + 1 < intersections.length; index += 2) {
          points.push(intersections[index], intersections[index + 1]);
        }
      }
      return points;
    };
    const addSectionCaps = (child, sectionLoops, capSource, sourcePartOverride = null) => {
      sectionLoops.forEach((loop, loopIndex) => {
        const shape = new THREE.Shape();
        shape.moveTo(loop[0].x, loop[0].y);
        loop.slice(1).forEach((point) => shape.lineTo(point.x, point.y));
        shape.closePath();
        const geometry = new THREE.ShapeGeometry(shape);
        const positions = geometry.getAttribute('position');
        const uvs = geometry.getAttribute('uv');
        const isHallVaultCut = child.userData?.isHallVaultArch === true;
        const faceOffset = isHallVaultCut ? 0.01 : 0.0005;
        for (let vertex = 0; vertex < positions.count; vertex += 1) {
          const horizontal = positions.getX(vertex);
          const y = positions.getY(vertex);
          if (axis === 'y') positions.setXYZ(vertex, horizontal, y, center + faceOffset);
          else positions.setXYZ(vertex, center + faceOffset, y, horizontal);
          uvs.setXY(vertex, horizontal / hatchSpacing, y / hatchSpacing);
        }
        positions.needsUpdate = true;
        uvs.needsUpdate = true;
        // The X section's YZ coordinate mapping reverses the default winding.
        // The perpendicular Y section maps directly into XY and retains it.
        const indices = geometry.getIndex();
        if (indices && axis === 'x') {
          for (let triangle = 0; triangle < indices.count; triangle += 3) {
            const second = indices.getX(triangle + 1);
            indices.setX(triangle + 1, indices.getX(triangle + 2));
            indices.setX(triangle + 2, second);
          }
          indices.needsUpdate = true;
        }
        geometry.computeVertexNormals();
        const capMaterial = isHallVaultCut ? cutMaterial.clone() : cutMaterial;
        if (isHallVaultCut) {
          capMaterial.depthTest = true;
          capMaterial.depthWrite = true;
          capMaterial.polygonOffsetFactor = -4;
          capMaterial.polygonOffsetUnits = -4;
          capMaterial.userData = {
            ...cutMaterial.userData,
            hallVaultSectionDepthOccludedAtExactCut: true,
          };
        }
        const cap = new THREE.Mesh(geometry, capMaterial);
        cap.name = `${child.name || 'Masonry'} section cut face ${loopIndex + 1}`;
        cap.renderOrder = 40;
        cap.userData.roomSectionCutFace = true;
        cap.userData.roomSectionSourceName = child.name || null;
        cap.userData.roomSectionSourcePart = sourcePartOverride || child.userData?.roomDomePart || null;
        cap.userData.roomSectionSourceIsKarbandi = child.userData?.isKarbandi === true;
        cap.userData.roomSectionSourceIsKarbandiCover = child.userData?.isKarbandiCover === true;
        cap.userData.roomSectionCapSource = capSource;
        cap.userData.roomSectionHatchSpacing = hatchSpacing;
        cap.userData.roomSectionAxis = axis;
        cap.userData.roomSectionVoidPreserved = ['dome-shell', 'inner-dome-shell', 'dome-drum'].includes(child.userData?.roomDomePart);
        if (child.userData?.isHallVaultArch === true) {
          cap.renderOrder = 44;
          cap.userData.isHallVaultSectionCap = true;
          cap.userData.hallVaultSectionCapRule = 'actual-square-vault-profile-at-section-plane';
          cap.userData.hallVaultSectionCapVisibilityRule = 'camera-side-offset-with-normal-depth-occlusion-on-exact-vault-contour';
          cap.userData.hallVaultSectionCapFaceOffset = faceOffset;
          cap.userData.hallVaultSectionCapHatchRule = 'material-clipped-hatch-only-no-free-line-overdraw';
        }
        const hatchPoints = sectionHatchLinePoints(loop);
        if (hatchPoints.length && !isHallVaultCut) {
          const lineFaceOffset = 0.0015;
          const linePositions = hatchPoints.map((point) => (
            axis === 'y'
              ? new THREE.Vector3(point.x, point.y, center + lineFaceOffset)
              : new THREE.Vector3(center + lineFaceOffset, point.y, point.x)
          ));
          const hatchLines = new THREE.LineSegments(
            new THREE.BufferGeometry().setFromPoints(linePositions),
            new THREE.LineBasicMaterial({
              color: '#111111',
              transparent: true,
              opacity: 0.9,
              depthTest: true,
              depthWrite: false,
            }),
          );
          hatchLines.name = `${cap.name} explicit hatch`;
          hatchLines.renderOrder = cap.renderOrder + 1;
          hatchLines.userData.isRoomSectionHatchLine = true;
          hatchLines.userData.roomSectionHatch = 'explicit-black-45-degree-lines';
          hatchLines.userData.roomSectionAxis = axis;
          cap.add(hatchLines);
          cap.userData.roomSectionExplicitHatch = true;
        }
        this.sectionCapGroup.add(cap);
      });
    };
    [
      this.buildingGroup,
      this.archInfillGroup,
      this.placementGroup,
      this.projectInstanceGroup,
    ].forEach((root) => root?.traverse((child) => {
      if (!child.isMesh || child === this.groundMesh || !child.visible || excluded(child)) return;
      const automaticLoops = this.roomSectionLoopsForMesh(child, center, axis);
      let sectionLoops = automaticLoops.length
        ? automaticLoops
        : this.roomTransitionSectionLoops(child, center, axis);
      let capSource = automaticLoops.length
        ? 'mesh-intersection'
        : 'transition-wall-profile';
      const isLongitudinalHallVault = child.userData?.isHallVaultArch === true
        && ((axis === 'x' && child.userData?.hallVaultDirection === 'y')
          || (axis === 'y' && child.userData?.hallVaultDirection === 'x'));
      if (isLongitudinalHallVault) {
        const bounds = new THREE.Box3().setFromObject(child);
        const cutMinimum = axis === 'y' ? bounds.min.z : bounds.min.x;
        const cutMaximum = axis === 'y' ? bounds.max.z : bounds.max.x;
        if (cutMinimum < center - 0.0001 && cutMaximum > center + 0.0001) {
          sectionLoops = this.roomSectionEnvelopeLoopsForMeshes(
            [child],
            center,
            Number(child.userData?.hallVaultProfileHeight) || 0.05,
            0.0001,
            0,
            axis,
          );
          capSource = 'exact-hall-longitudinal-vault-soffit-extrados-envelope';
        }
      }
      if (child.userData?.isHallBoundaryVaultInfill === true) {
        // This is a real closed masonry solid. Use only its exact triangle-plane
        // contour; an envelope fallback would incorrectly close the open arch.
        // At a Hall bay centre, the section often lies exactly on triangulated
        // vertices. Sample an imperceptible distance into the retained half to
        // avoid that degenerate coplanar case, then draw the cap on the true cut.
        sectionLoops = automaticLoops;
        if (!sectionLoops.length) {
          const side = child.userData?.wallSide;
          const axisMatchesProfile = axis === 'x'
            ? side === 'north' || side === 'south'
            : side === 'east' || side === 'west';
          const profile = (child.userData?.hallVaultSoffitProfile || [])
            .map((point) => new THREE.Vector2(Number(point[0]), Number(point[1])))
            .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
            .sort((left, right) => left.x - right.x);
          if (axisMatchesProfile && profile.length >= 2) {
            child.updateWorldMatrix(true, false);
            const localProbe = new THREE.Vector3(
              axis === 'x' ? center : 0,
              0,
              axis === 'y' ? center : 0,
            ).applyMatrix4(child.matrixWorld.clone().invert());
            const localU = localProbe.x;
            let soffitY = null;
            for (let index = 0; index < profile.length - 1; index += 1) {
              const start = profile[index];
              const end = profile[index + 1];
              if (localU < start.x - 0.0001 || localU > end.x + 0.0001) continue;
              const amount = Math.abs(end.x - start.x) > 0.000001
                ? (localU - start.x) / (end.x - start.x)
                : 0;
              soffitY = THREE.MathUtils.lerp(start.y, end.y, amount);
              break;
            }
            const wallTop = Number(child.userData?.hallBoundaryVaultWallTop);
            if (Number.isFinite(soffitY) && Number.isFinite(wallTop) && soffitY > wallTop + 0.0001) {
              const bounds = new THREE.Box3().setFromObject(child);
              const minimum = axis === 'x' ? bounds.min.z : bounds.min.x;
              const maximum = axis === 'x' ? bounds.max.z : bounds.max.x;
              if (maximum > minimum + 0.0001) sectionLoops = [[
                new THREE.Vector2(minimum, wallTop),
                new THREE.Vector2(maximum, wallTop),
                new THREE.Vector2(maximum, soffitY),
                new THREE.Vector2(minimum, soffitY),
              ]];
            }
          }
        }
        capSource = automaticLoops.length
          ? 'exact-hall-boundary-vault-infill-mesh-intersection'
          : 'exact-hall-boundary-vault-infill-profile-section';
      }
      const hallOpenTransitionInterface = ['hall', 'grid'].includes(this.building?.buildingType)
        && (child.userData?.isHallBayTransition === true
          || child.userData?.roomDomePart === 'transition-cover');
      if (!sectionLoops.length && !hallOpenTransitionInterface
        && child.userData?.isHallBoundaryVaultInfill !== true) {
        child.updateWorldMatrix(true, false);
        const bounds = new THREE.Box3().setFromObject(child);
        const minimum = axis === 'y' ? bounds.min.z : bounds.min.x;
        const maximum = axis === 'y' ? bounds.max.z : bounds.max.x;
        if (minimum < center - 0.0001 && maximum > center + 0.0001) {
          const fallbackThickness = Math.max(
            0.01,
            Number(child.userData?.hallVaultProfileHeight)
              || Number(child.userData?.roofThickness)
              || Number(child.geometry?.userData?.domeShellThickness)
              || 0.05,
          );
          sectionLoops = this.roomSectionEnvelopeLoopsForMeshes(
            [child], center, fallbackThickness, 0.0001, 0, axis,
          );
          if (sectionLoops.length) capSource = 'open-solid-section-envelope-fallback';
        }
      }
      if (this.building?.domeTransitionCoverEnabled === true
        && child.userData?.roomDomePart === 'exterior-aligned-octagon-wall') {
        const completeWallSection = this.roomTransitionSectionLoops(child, center, axis);
        if (completeWallSection.length) {
          sectionLoops = completeWallSection;
          capSource = 'complete-transition-wall-section-on-exact-true-boundary';
        }
      }
      if (child.userData?.roomDomeOpeningVoid === true) {
        sectionLoops = this.roomSectionLoopsOutsideCircularVoid(
          sectionLoops,
          this.buildingGroup?.userData?.roomKarbandiRotationCenter?.[axis === 'y' ? 0 : 1] ?? 0,
          Number(child.userData.roomDomeOpeningVoidRadius),
        );
        capSource = 'mesh-intersection-clipped-outside-drum-opening';
      }
      if (child.userData?.roomDomePart === 'karbandi-roof-to-drum-infill-top') {
        const footprintCenter = child.userData.roomKarbandiInfillTopDrumFootprintCenter;
        const footprintRadius = Number(child.userData.roomKarbandiInfillTopDrumClipRadius);
        if (Array.isArray(footprintCenter) && Number.isFinite(footprintRadius)) {
          sectionLoops = this.roomSectionLoopsOutsideCircularVoid(
            sectionLoops,
            Number(footprintCenter[axis === 'y' ? 0 : 1]),
            footprintRadius,
          );
          capSource = 'checker-roof-section-clipped-outside-actual-drum-footprint';
        }
      }
      addSectionCaps(child, sectionLoops, capSource);
    }));
    const transitionCoverMeshes = [];
    this.buildingGroup?.traverse((child) => {
      if (child.isMesh && child.visible
        && child.userData?.isKarbandiCover === true
        && child.userData?.roomDomeOpeningVoid === true) {
        transitionCoverMeshes.push(child);
      }
    });
    if (transitionCoverMeshes.length) {
      const sourceCover = transitionCoverMeshes[0];
      const coverThickness = Math.max(
        0.001,
        ...transitionCoverMeshes.map((mesh) => Number(mesh.userData?.roofThickness) || 0),
      );
      const closureThreshold = Math.max(0.012, Math.min(0.04, coverThickness * 0.5));
      const rawRoofLoops = this.roomSectionLoopsOutsideCircularVoid(
        this.roomSectionEnvelopeLoopsForMeshes(
          transitionCoverMeshes,
          center,
          coverThickness,
          closureThreshold,
          0,
          axis,
        ),
        this.buildingGroup?.userData?.roomKarbandiRotationCenter?.[axis === 'y' ? 0 : 1] ?? 0,
        Number(sourceCover.userData.roomDomeOpeningVoidRadius),
      );
      const roofOnlyLoops = this.roomContinuousKarbandiRoofSectionLoops(
        rawRoofLoops,
        this.buildingGroup?.userData?.roomKarbandiRotationCenter?.[axis === 'y' ? 0 : 1] ?? 0,
        coverThickness,
      );
      addSectionCaps(
        sourceCover,
        roofOnlyLoops,
        'continuous-karbandi-roof-envelope-without-boundary-padding',
        'transition-cover-roof-section',
      );
      if (roofOnlyLoops.length) {
        this.sectionCapGroup.children.slice(-roofOnlyLoops.length).forEach((cap) => {
          cap.renderOrder = 42;
          cap.userData.roomSectionClosureThreshold = closureThreshold;
          cap.userData.roomSectionBoundaryPadding = 0;
          cap.userData.roomSectionBoundaryPolicy = 'roof-only-continuous-envelope-no-exterior-bleed';
          cap.userData.roomSectionRoofProfile = 'smoothed-monotonic-visible-top-with-constant-physical-thickness';
        });
      }
    }
    const infillSections = new Map();
    this.buildingGroup?.traverse((child) => {
      const part = child.userData?.roomDomePart;
      if (!child.isMesh || !child.visible
        || !['karbandi-roof-to-drum-infill', 'karbandi-rib-top-backing'].includes(part)) return;
      const faceIndex = child.userData?.roomKarbandiOctagonFaceIndex;
      if (!infillSections.has(faceIndex)) infillSections.set(faceIndex, {});
      infillSections.get(faceIndex)[part === 'karbandi-roof-to-drum-infill' ? 'infill' : 'backing'] = child;
    });
    infillSections.forEach(({ infill, backing }) => {
      if (!infill || !backing) return;
      const topY = Number(infill.userData?.roomKarbandiMasonryTopY);
      const loops = this.roomSectionLoopsForMeshes([infill, backing], center, topY, axis);
      addSectionCaps(infill, loops, 'combined-infill-and-rib-backing-intersection');
    });
    if (!this.sectionCapGroup.children.length) {
      cutMaterial.userData?.generatedTexture?.dispose?.();
      cutMaterial.dispose();
    }
  }

  roomSectionCutCenter(axis = 'x') {
    return 0;
  }

  applyRoomSectionClipping() {
    this.restoreRoomSectionMaterials();
    if (!this.sectionViewEnabled) return;
    const axis = this.sectionViewAxis === 'y' ? 'y' : 'x';
    // Every section remains referenced to the world grid centre. Hall cap
    // surfaces receive their own small camera-side visual offset in
    // buildRoomSectionCaps; the architectural cut plane itself never moves.
    const center = this.roomSectionCutCenter(axis);
    this.sectionCutCenter = center;
    const planeNormal = axis === 'y' ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(-1, 0, 0);
    this.sectionClipPlane = new THREE.Plane(planeNormal, center);
    this.buildRoomSectionCaps(center, axis);
    this.syncHallSectionConstructionGuides();
    const applyPlane = (root, plane, skipNestedProjects = false) => {
      const visit = (child) => {
        if (child === this.groundMesh || child === this.grid || child.userData?.isStageSurface === true) return;
        if (child.userData?.isHallArchConstructionGuide === true
          || child.userData?.isKarbandiVisualGuide === true) return;
        if (skipNestedProjects && child !== root && child.userData?.isProjectInstance === true) return;
        if (child.material) {
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          materials.filter(Boolean).forEach((material) => {
            if (!this.sectionMaterialClipping.has(material)) {
              this.sectionMaterialClipping.set(material, {
                planes: Array.isArray(material.clippingPlanes) ? [...material.clippingPlanes] : null,
                clipIntersection: material.clipIntersection === true,
                clipShadows: material.clipShadows === true,
              });
            }
            const permanent = this.sectionMaterialClipping.get(material).planes || [];
            material.clippingPlanes = [...permanent, plane];
            material.clipIntersection = false;
            material.clipShadows = true;
            material.needsUpdate = true;
          });
        }
        child.children?.forEach(visit);
      };
      if (root) visit(root);
    };
    [
      this.buildingGroup,
      this.archInfillGroup,
      this.zoneDecorationGroup,
      this.placementGroup,
      this.placementMaskGroup,
      this.projectInstanceGroup,
    ].forEach((root) => applyPlane(root, this.sectionClipPlane));
    this.invalidate(true);
  }

  frameRoomSectionView(axis = this.sectionViewAxis) {
    const bounds = this.completeModelBounds();
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z, 2) * 1.4;
    const cutCenter = Number.isFinite(this.sectionCutCenter)
      ? this.sectionCutCenter
      : this.roomSectionCutCenter(axis);
    this.controls.target.set(
      axis === 'x' ? cutCenter : center.x,
      Math.max(0.4, center.y),
      axis === 'y' ? cutCenter : center.z,
    );
    this.camera.up.set(0, 1, 0);
    if (axis === 'y') this.camera.position.set(this.controls.target.x, this.controls.target.y, radius);
    else this.camera.position.set(radius, this.controls.target.y, this.controls.target.z);
    this.camera.lookAt(this.controls.target);
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  setRoomSectionView(enabled = false, axis = this.sectionViewAxis) {
    const hasSliceableModel = this.building.type === 'room'
      || this.building.buildingType === 'portal'
      || this.projectInstanceGroup?.children.length > 0;
    const next = enabled === true && hasSliceableModel;
    const nextAxis = axis === 'y' ? 'y' : 'x';
    const axisChanged = nextAxis !== this.sectionViewAxis;
    this.sectionViewAxis = nextAxis;
    if (next === this.sectionViewEnabled) {
      if (next) {
        this.applyRoomSectionClipping();
        if (axisChanged) this.frameRoomSectionView(nextAxis);
        // Rebuild every active construction diagram for the newly selected
        // section plane. Otherwise switching X/Y leaves existing guides in the
        // previous plane and makes their circles appear edge-on.
        if (axisChanged) this.updateWallSurfaceHighlight();
      }
      return next;
    }
    if (next) {
      this.sectionViewCameraState = {
        position: this.camera.position.clone(),
        quaternion: this.camera.quaternion.clone(),
        up: this.camera.up.clone(),
        target: this.controls.target.clone(),
      };
      this.sectionViewEnabled = true;
      this.applyRoomSectionClipping();
      this.frameRoomSectionView(nextAxis);
      this.updateWallSurfaceHighlight();
    } else {
      this.sectionViewEnabled = false;
      this.restoreRoomSectionMaterials();
      if (this.sectionViewCameraState) {
        this.camera.position.copy(this.sectionViewCameraState.position);
        this.camera.quaternion.copy(this.sectionViewCameraState.quaternion);
        this.camera.up.copy(this.sectionViewCameraState.up);
        this.controls.target.copy(this.sectionViewCameraState.target);
        this.camera.updateProjectionMatrix();
        this.controls.update();
      }
      this.sectionViewCameraState = null;
      this.sectionClipPlane = null;
      this.updateWallSurfaceHighlight();
      this.invalidate(true);
    }
    return next;
  }

  applyExportAppearance(settings = {}) {
    const flatStage = settings.stageRenderMode === 'flat';
    const snapshots = [];
    const materialSwaps = [];
    const shadowSnapshots = [];
    const lineVisibility = [];
    const visibility = [
      [this.zoneGroup, this.zoneGroup.visible],
      [this.transformHelper, this.transformHelper.visible],
      [this.selectionOutline, this.selectionOutline?.visible],
      [this.wallSurfaceHighlight, this.wallSurfaceHighlight?.visible],
      [this.grid, this.grid?.visible],
    ];
    this.zoneGroup.visible = false;
    this.transformHelper.visible = false;
    if (this.selectionOutline) this.selectionOutline.visible = false;
    if (this.wallSurfaceHighlight) this.wallSurfaceHighlight.visible = false;
    if (this.grid) this.grid.visible = false;

    const oldScene = {
      background: this.scene.background,
      ambient: this.ambient.visible,
      ambientIntensity: this.ambient.intensity,
      hemisphere: this.hemisphere.visible,
      hemisphereIntensity: this.hemisphere.intensity,
      sun: this.sun.visible,
      exposure: this.renderer.toneMappingExposure,
    };
    const night = settings.lighting === 'night';
    const exportOpeningSpills = new THREE.Group();
    exportOpeningSpills.name = 'Temporary export opening light spills';
    const isDecorativeBrickMesh = (child) => (
      child.userData?.isBrickFace
      || child.userData?.isSoldierCourse
      || child.userData?.isFullLengthBorderBrick
      || child.userData?.isNorthCurveBorderBrick
      || child.userData?.isNorthBoundaryMortarBacking
    );
    this.scene.background = new THREE.Color(night ? '#050914' : '#cfe7f2');
    this.ambient.visible = true;
    this.ambient.intensity = night ? NIGHT_AMBIENT_INTENSITY : DAY_AMBIENT_INTENSITY;
    this.hemisphere.visible = true;
    this.hemisphere.intensity = night ? NIGHT_HEMISPHERE_INTENSITY : DAY_HEMISPHERE_INTENSITY;
    this.sun.visible = !night;
    this.renderer.toneMappingExposure = night ? 1 : 1.04;
    this.nightLightObjects.forEach(({ light, marker, targetMarker, helper }) => {
      visibility.push([marker, marker.visible], [targetMarker, targetMarker.visible], [helper, helper.visible]);
      marker.visible = false;
      targetMarker.visible = false;
      helper.visible = false;
      light.visible = night && this.nightLights.find((item) => item.id === light.userData.nightLightId)?.enabled !== false;
    });
    if (night) {
      this.nightLights
        .filter((definition) => definition.enabled !== false)
        .forEach((definition) => this.addOpeningSpillLights(definition, true, exportOpeningSpills));
      if (exportOpeningSpills.children.length) this.scene.add(exportOpeningSpills);
    }
    this.buildingGroup.traverse((child) => {
      if (child.userData?.isKarbandiVisualGuide === true) {
        visibility.push([child, child.visible]);
        child.visible = false;
        return;
      }
      if (!child.userData?.isWallEdge && !child.userData?.isNorthBoundary) return;
      lineVisibility.push([child, child.visible]);
      if (settings.seamless) {
        child.visible = child.userData.isNorthBoundary
          ? settings.seamlessNorthBoundary === true
          : settings.seamlessWallEdges === true;
      }
    });

    const exportSolidColorFor = (child, material) => {
      if (child === this.groundMesh) return settings.groundColor || this.building.groundColor;
      if (child.userData?.isPortalInteriorGypsum || material?.userData?.isPortalInteriorGypsum) {
        return this.walls.interiorGypsum?.color || '#f1eee7';
      }
      if (
        material?.userData?.isFlatBrickBond
        || child.userData?.isBrickFace
        || child.userData?.isSoldierCourse
        || child.userData?.isFullLengthBorderBrick
        || child.userData?.isNorthCurveBorderBrick
        || child.userData?.wallSide
        || child.parent?.userData?.wallSystem
      ) return this.walls.color;
      return material?.color?.getHexString ? `#${material.color.getHexString()}` : '#d0a21f';
    };
    const preservesArchitecturalTexture = (child, material) => (
      child.userData?.isBrickFace
      || material?.userData?.isFlatBrickBond
      || material?.userData?.isRoofInfillBrickCourse
      || material?.userData?.isRoofWallContinuation
      || child.userData?.roofBrickMapping === 'offset-rib-courses'
      || child.userData?.roofBrickMapping === 'wall-continuation'
    );
    const makeExportFlatMaterial = (child, material) => {
      const next = new THREE.MeshStandardMaterial({
        color: exportSolidColorFor(child, material),
        roughness: 0.92,
        metalness: 0,
        side: material?.side ?? THREE.DoubleSide,
        transparent: false,
        opacity: 1,
      });
      if (material?.clippingPlanes?.length) {
        next.clippingPlanes = material.clippingPlanes;
        next.clipIntersection = material.clipIntersection === true;
        next.clipShadows = true;
      }
      return next;
    };

    const styleGroup = (root, kind) => {
      root.traverse((child) => {
        if (!child.isMesh) return;
        shadowSnapshots.push([child, child.castShadow, child.receiveShadow]);
        child.castShadow = settings.shadows !== false;
        child.receiveShadow = flatStage && (kind === 'wall' || isDecorativeBrickMesh(child))
          ? false
          : settings.shadows !== false;
        if (flatStage && kind !== 'wall' && settings.style !== 'hidden-line' && !settings.seamless) {
          const originalMaterial = child.material;
          const sourceMaterial = child.userData.mehrazStageOriginalMaterial || originalMaterial;
          const sourceMaterials = Array.isArray(sourceMaterial) ? sourceMaterial : [sourceMaterial];
          child.material = Array.isArray(sourceMaterial)
            ? sourceMaterials.map((material) => makeExportFlatMaterial(child, material))
            : makeExportFlatMaterial(child, sourceMaterials[0]);
          materialSwaps.push([child, originalMaterial, child.material]);
        }
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.filter(Boolean).forEach((material) => {
          if (snapshots.some((snapshot) => snapshot.material === material)) return;
          snapshots.push({
            material,
            color: material.color?.clone?.(),
            roughness: material.roughness,
            metalness: material.metalness,
            map: material.map,
            transparent: material.transparent,
            opacity: material.opacity,
          });
          if (material.color) {
            if (settings.style === 'hidden-line') material.color.set('#ffffff');
            else if (settings.seamless) material.color.set(settings.seamlessColor || '#f2d336');
            else if (flatStage && (material.userData.isFlatBrickBond || child.userData?.isBrickFace || child.userData?.isSoldierCourse || child.userData?.wallSide || child.parent?.userData?.wallSystem)) material.color.set(this.walls.color);
          }
          if (Number.isFinite(material.roughness)) material.roughness = 0.78;
          if (Number.isFinite(material.metalness)) material.metalness = 0;
          // Keep generated rib/crown infill courses in the export preview and
          // raster output. These are real UV-mapped roof finishes, just like
          // wall bonds; stripping their map made the web appear as one flat
          // color even though the editor geometry still carried course UVs.
          if (flatStage || !preservesArchitecturalTexture(child, material)) material.map = null;
          material.needsUpdate = true;
        });
      });
    };
    styleGroup(this.buildingGroup, 'wall');
    styleGroup(this.archInfillGroup, settings.seamless ? 'wall' : 'module');
    styleGroup(this.placementGroup, 'module');
    styleGroup(this.projectInstanceGroup, 'module');

    if (this.groundMesh?.material) {
      this.groundMesh.material.color.set(night ? NIGHT_GROUND_COLOR : (settings.groundColor || this.building.groundColor));
      if (night) {
        this.groundMesh.material.roughness = 0.9;
        this.groundMesh.material.metalness = 0;
      }
    }

    const exportEdges = new THREE.Group();
    const addEdges = (root, edgeColor, enabled) => {
      if (!enabled) return;
      root.traverse((child) => {
        if (!child.isMesh || child === this.groundMesh || child.userData.isBrickFace || child.userData.isSoldierCourse || child.userData.isKarbandiVisualGuide) return;
        const line = new THREE.LineSegments(
          new THREE.EdgesGeometry(child.geometry, 24),
          new THREE.LineBasicMaterial({ color: edgeColor, depthTest: true, transparent: true, opacity: 0.96 }),
        );
        line.matrixAutoUpdate = false;
        line.matrix.copy(child.matrixWorld);
        line.renderOrder = 20;
        exportEdges.add(line);
      });
    };
    if (settings.style === 'hidden-line') {
      addEdges(this.buildingGroup, '#111111', true);
      addEdges(this.archInfillGroup, '#111111', true);
      addEdges(this.placementGroup, '#111111', true);
      addEdges(this.projectInstanceGroup, '#111111', true);
    } else if (settings.seamless) {
      addEdges(this.buildingGroup, settings.wallEdgeColor || this.walls.edges.color, settings.seamlessWallEdges === true);
      addEdges(this.placementGroup, settings.moduleEdgeColor || '#ffffff', settings.seamlessEdges === true);
      addEdges(this.projectInstanceGroup, settings.moduleEdgeColor || '#ffffff', settings.seamlessEdges === true);
    }
    this.scene.add(exportEdges);

    return () => {
      snapshots.forEach((snapshot) => {
        if (snapshot.color && snapshot.material.color) snapshot.material.color.copy(snapshot.color);
        snapshot.material.roughness = snapshot.roughness;
        snapshot.material.metalness = snapshot.metalness;
        snapshot.material.map = snapshot.map;
        snapshot.material.transparent = snapshot.transparent;
        snapshot.material.opacity = snapshot.opacity;
        snapshot.material.needsUpdate = true;
      });
      materialSwaps.forEach(([mesh, originalMaterial, flatMaterial]) => {
        const flatMaterials = Array.isArray(flatMaterial) ? flatMaterial : [flatMaterial];
        mesh.material = originalMaterial;
        flatMaterials.filter(Boolean).forEach((material) => material.dispose?.());
      });
      shadowSnapshots.forEach(([mesh, castShadow, receiveShadow]) => {
        mesh.castShadow = castShadow;
        mesh.receiveShadow = receiveShadow;
      });
      exportEdges.traverse((child) => {
        child.geometry?.dispose?.();
        child.material?.dispose?.();
      });
      this.scene.remove(exportEdges);
      this.scene.remove(exportOpeningSpills);
      exportOpeningSpills.traverse((child) => {
        child.geometry?.dispose?.();
        if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose?.());
        else child.material?.dispose?.();
      });
      visibility.forEach(([object, visible]) => {
        if (object) object.visible = visible;
      });
      lineVisibility.forEach(([object, visible]) => { object.visible = visible; });
      this.scene.background = oldScene.background;
      this.ambient.visible = oldScene.ambient;
      this.ambient.intensity = oldScene.ambientIntensity;
      this.hemisphere.visible = oldScene.hemisphere;
      this.hemisphere.intensity = oldScene.hemisphereIntensity;
      this.sun.visible = oldScene.sun;
      this.renderer.toneMappingExposure = oldScene.exposure;
      this.rebuildNightLights();
    };
  }

  capture({ width = 1240, height = 1754, view = 'current', ...settings } = {}) {
    const exportWidth = Math.max(320, Math.min(8192, Math.round(width)));
    const exportHeight = Math.max(320, Math.min(8192, Math.round(height)));
    const oldSize = this.renderer.getSize(new THREE.Vector2());
    const oldPixelRatio = this.renderer.getPixelRatio();
    const oldAspect = this.camera.aspect;
    const oldPosition = this.camera.position.clone();
    const oldQuaternion = this.camera.quaternion.clone();
    const oldTarget = this.controls.target.clone();
    const zoom = Math.max(0.5, finite(settings.zoom, 1));
    const fitBounds = settings.fitContent === true ? this.completeModelBounds() : null;
    const fitCenter = fitBounds?.getCenter(new THREE.Vector3());
    const fitSize = fitBounds?.getSize(new THREE.Vector3());
    const radius = Math.max(
      fitSize?.x || this.building.width,
      fitSize?.z || this.building.depth,
      fitSize?.y || this.building.height,
    ) * 1.3 / zoom;
    const target = fitCenter || new THREE.Vector3(
      finite(settings.panX, 0),
      this.building.height * 0.42 + finite(settings.panY, 0),
      0,
    );
    const restoreAppearance = this.applyExportAppearance({ ...settings, view });

    if (view === 'current') {
      const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0).normalize();
      const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1).normalize();
      const panOffset = right.multiplyScalar(finite(settings.panX, 0)).add(up.multiplyScalar(finite(settings.panY, 0)));
      const previewTarget = oldTarget.clone().add(panOffset);
      const viewVector = oldPosition.clone().sub(oldTarget).multiplyScalar(1 / zoom);
      this.camera.position.copy(previewTarget).add(viewVector);
      this.camera.lookAt(previewTarget);
    } else if (view === 'front' || view === 'dimension-front') {
      this.camera.position.set(0, target.y, -radius * 1.35);
      this.camera.lookAt(target);
    } else if (view === 'top') {
      this.camera.position.set(0, radius * 1.5, 0.001);
      this.camera.lookAt(0, 0, 0);
    } else if (view === 'side') {
      this.camera.position.set(radius * 1.35, target.y, 0);
      this.camera.lookAt(target);
    } else if (view === 'isometric' || view === 'iso-nw') {
      this.camera.position.set(-radius, radius * 0.75, -radius);
      this.camera.lookAt(target);
    } else if (view === 'iso-ne') {
      this.camera.position.set(radius, radius * 0.75, -radius);
      this.camera.lookAt(target);
    } else if (view === 'iso-se') {
      this.camera.position.set(radius, radius * 0.75, radius);
      this.camera.lookAt(target);
    } else if (view === 'iso-sw') {
      this.camera.position.set(-radius, radius * 0.75, radius);
      this.camera.lookAt(target);
    }
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(exportWidth, exportHeight, false);
    this.camera.aspect = exportWidth / exportHeight;
    this.camera.updateProjectionMatrix();
    let renderCamera = this.camera;
    if (['front', 'top', 'side', 'dimension-front'].includes(view)) {
      const aspect = exportWidth / exportHeight;
      let frameWidth = this.building.width;
      let frameHeight = this.building.height;
      if (fitSize) {
        if (view === 'top') {
          frameWidth = fitSize.x;
          frameHeight = fitSize.z;
        } else if (view === 'side') {
          frameWidth = fitSize.z;
          frameHeight = fitSize.y;
        } else {
          frameWidth = fitSize.x;
          frameHeight = fitSize.y;
        }
      }
      const framePadding = settings.fitContent === true ? 1.14 : 1.24;
      const halfHeight = fittedOrthographicHalfHeight({ frameWidth, frameHeight, aspect, padding: framePadding, zoom });
      renderCamera = new THREE.OrthographicCamera(-halfHeight * aspect, halfHeight * aspect, halfHeight, -halfHeight, 0.01, 200);
      if (view === 'top') {
        renderCamera.position.set(target.x, 60, target.z + 0.001);
        renderCamera.up.set(0, 0, -1);
        renderCamera.lookAt(target.x, 0, target.z);
      } else if (view === 'side') {
        renderCamera.position.set(60, target.y, target.z);
        renderCamera.lookAt(target);
      } else {
        renderCamera.position.set(target.x, target.y, -60);
        renderCamera.lookAt(target);
      }
      renderCamera.updateProjectionMatrix();
    }
    this.updateZonePortalSideVisibility(renderCamera);
    if (this.renderer.shadowMap.enabled) this.renderer.shadowMap.needsUpdate = true;
    this.renderer.render(this.scene, renderCamera);
    const imageType = settings.imageType === 'image/webp' || settings.imageType === 'image/jpeg' ? settings.imageType : 'image/png';
    const imageQuality = Math.max(0.4, Math.min(1, finite(settings.imageQuality, 0.86)));
    let dataUrl = this.renderer.domElement.toDataURL(imageType, imageQuality);
    if (view === 'dimension-front') {
      const canvas = document.createElement('canvas');
      canvas.width = exportWidth;
      canvas.height = exportHeight;
      const context = canvas.getContext('2d');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, exportWidth, exportHeight);
      context.drawImage(this.renderer.domElement, 0, 0);
      context.strokeStyle = '#111111';
      context.fillStyle = '#111111';
      context.lineWidth = Math.max(1, exportWidth / 1200);
      context.font = `${Math.max(14, Math.round(exportWidth / 70))}px Arial`;
      context.textAlign = 'center';
      context.fillText(`Building width ${this.building.width.toFixed(2)} m`, exportWidth / 2, exportHeight - 32);
      context.save();
      context.translate(28, exportHeight / 2);
      context.rotate(-Math.PI / 2);
      context.fillText(`Building height ${this.building.height.toFixed(2)} m`, 0, 0);
      context.restore();
      const door = this.walls.southOpenings.door;
      const windowOpening = this.walls.southOpenings.window;
      if (door.enabled) context.fillText(`Door ${door.width.toFixed(2)} × ${door.height.toFixed(2)} m`, exportWidth / 2, 30);
      if (windowOpening.enabled) context.fillText(`Window ${windowOpening.width.toFixed(2)} × ${windowOpening.height.toFixed(2)} m`, exportWidth / 2, 55);
      dataUrl = canvas.toDataURL('image/png');
    }

    this.renderer.setPixelRatio(oldPixelRatio);
    this.renderer.setSize(oldSize.x, oldSize.y, false);
    this.camera.aspect = oldAspect;
    this.camera.position.copy(oldPosition);
    this.camera.quaternion.copy(oldQuaternion);
    this.camera.updateProjectionMatrix();
    this.controls.target.copy(oldTarget);
    this.controls.update();
    this.updateZonePortalSideVisibility(this.camera);
    restoreAppearance();
    return dataUrl;
  }

  createExportModelRoot() {
    const currentStep = this.constructionStepIndex;
    const currentProgress = this.constructionStepProgress;
    const completedStep = CONSTRUCTION_STEPS.length - 1;
    const needsCompletedSnapshot = currentStep !== completedStep || currentProgress !== 1;
    if (needsCompletedSnapshot) this.applyConstructionStep(completedStep, 1);

    try {
      const root = new THREE.Group();
      root.name = 'Mehraz architectural model';
      const walls = this.buildingGroup.children.find((child) => child.userData?.wallSystem);
      if (walls?.visible) root.add(cloneForModelExport(walls));
      const zoneDecorations = cloneForModelExport(this.zoneDecorationGroup);
      zoneDecorations.traverse((child) => { child.visible = true; });
      root.add(
        cloneForModelExport(this.archInfillGroup),
        zoneDecorations,
        cloneForModelExport(this.placementGroup),
        cloneForModelExport(this.projectInstanceGroup || new THREE.Group()),
      );
      removeInvisibleExportBranches(root);
      root.updateMatrixWorld(true);
      bakeKarbandiExportClipping(root);
      if (exportTriangleCount(root) === 0) throw new Error('The Mehraz model has no visible geometry to export.');
      return root;
    } finally {
      if (needsCompletedSnapshot) this.applyConstructionStep(currentStep, currentProgress);
    }
  }

  exportStlBlob() {
    const data = new STLExporter().parse(this.createExportModelRoot(), { binary: true });
    return new Blob([data], { type: 'model/stl' });
  }

  async exportGlbBlob() {
    const root = this.createExportModelRoot();
    const options = { binary: true, onlyVisible: true, truncateDrawRange: true, maxTextureSize: 2048 };
    let data;
    try {
      data = await new GLTFExporter().parseAsync(root, options);
    } catch (error) {
      // Imported and generated browser textures can occasionally have no
      // exportable image payload. Preserve the geometry and material colors as
      // a reliable fallback instead of failing the complete GLB download.
      removeTextureMaps(root);
      data = await new GLTFExporter().parseAsync(root, options).catch(() => { throw error; });
    }
    return new Blob([data], { type: 'model/gltf-binary' });
  }

  async exportOrbitVideo(settings = {}, onProgress) {
    const Encoder = globalThis.VideoEncoder;
    const Frame = globalThis.VideoFrame;
    if (!Encoder || !Frame) throw new Error('MP4 export requires WebCodecs in the latest Chrome, Edge, or Safari.');
    const config = {
      codec: 'avc1.420028',
      width: VIDEO_WIDTH,
      height: VIDEO_HEIGHT,
      bitrate: VIDEO_BITRATE,
      framerate: VIDEO_FPS,
      bitrateMode: 'constant',
      latencyMode: 'quality',
      avc: { format: 'avc' },
    };
    const support = await Encoder.isConfigSupported(config);
    if (!support.supported) throw new Error('This browser cannot encode H.264 MP4 video.');
    const oldSize = this.renderer.getSize(new THREE.Vector2());
    const oldRatio = this.renderer.getPixelRatio();
    const oldAspect = this.camera.aspect;
    const oldPosition = this.camera.position.clone();
    const oldQuaternion = this.camera.quaternion.clone();
    const oldTarget = this.controls.target.clone();
    const restoreAppearance = this.applyExportAppearance(settings);
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(VIDEO_WIDTH, VIDEO_HEIGHT, false);
    this.camera.aspect = VIDEO_WIDTH / VIDEO_HEIGHT;
    this.camera.updateProjectionMatrix();
    const bounds = this.completeModelBounds();
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const radius = Math.max(size.x, size.z, size.y * 1.4, 2) * 1.35 / Math.max(0.5, finite(settings.zoom, 1));
    const target = new ArrayBufferTarget();
    const muxer = new Muxer({
      target,
      video: { codec: 'avc', width: VIDEO_WIDTH, height: VIDEO_HEIGHT },
      fastStart: 'in-memory',
      firstTimestampBehavior: 'offset',
    });
    let encoderError = null;
    const encoder = new Encoder({
      output: (chunk, metadata) => muxer.addVideoChunk(chunk, metadata),
      error: (error) => { encoderError = error; },
    });
    encoder.configure(config);
    const duration = Math.max(2, Math.min(60, finite(settings.orbitDuration, 10)));
    const totalFrames = Math.round(duration * VIDEO_FPS);
    const frameDuration = Math.round(1000000 / VIDEO_FPS);
    try {
      if (this.renderer.shadowMap.enabled) this.renderer.shadowMap.needsUpdate = true;
      for (let index = 0; index < totalFrames; index += 1) {
        const angle = (index / totalFrames) * Math.PI * 2;
        this.camera.position.set(
          center.x + Math.sin(angle) * radius,
          center.y,
          center.z + Math.cos(angle) * radius,
        );
        this.camera.lookAt(center);
        this.updateZonePortalSideVisibility(this.camera);
        this.renderer.render(this.scene, this.camera);
        const frame = new Frame(this.renderer.domElement, {
          timestamp: index * frameDuration,
          duration: frameDuration,
        });
        encoder.encode(frame, { keyFrame: index % (VIDEO_FPS * 2) === 0 });
        frame.close();
        if (encoder.encodeQueueSize > 12) await encoder.flush();
        if (encoderError) throw encoderError;
        if (index % 3 === 0 || index === totalFrames - 1) onProgress?.((index + 1) / totalFrames);
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
      await encoder.flush();
      if (encoderError) throw encoderError;
      encoder.close();
      muxer.finalize();
      return new Blob([target.buffer], { type: 'video/mp4' });
    } finally {
      if (encoder.state !== 'closed') encoder.close();
      this.renderer.setPixelRatio(oldRatio);
      this.renderer.setSize(oldSize.x, oldSize.y, false);
      this.camera.aspect = oldAspect;
      this.camera.position.copy(oldPosition);
      this.camera.quaternion.copy(oldQuaternion);
      this.camera.updateProjectionMatrix();
      this.controls.target.copy(oldTarget);
      this.controls.update();
      this.updateZonePortalSideVisibility(this.camera);
      restoreAppearance();
    }
  }

  onPointerDown(event) {
    if (event.button !== 0) return;
    const bounds = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    if ((this.selectedId || this.selectedProjectInstanceId) && (this.transformHandleActive || this.transformControls.dragging)) {
      event.preventDefault();
      return;
    }
    if (this.selectedId || this.selectedProjectInstanceId) {
      const gizmoHit = this.raycaster.intersectObject(this.transformHelper, true).find((hit) => {
        let object = hit.object;
        while (object) {
          if (object.visible === false) return false;
          object = object.parent;
        }
        const material = hit.object.material;
        if (Array.isArray(material)) return material.some((item) => item?.visible !== false && (item.opacity == null || item.opacity > 0.08));
        return material?.visible !== false && (material?.opacity == null || material.opacity > 0.08);
      });
      if (gizmoHit) {
        event.preventDefault();
        return;
      }
    }
    if (this.nightLightGuidesVisible) {
      const handles = [];
      this.nightLightObjects.forEach(({ marker, targetMarker }) => handles.push(marker, targetMarker));
      const guideHit = this.raycaster.intersectObjects(handles, false)[0];
      if (guideHit) {
        const normal = this.camera.getWorldDirection(new THREE.Vector3());
        this.nightLightDrag = {
          id: guideHit.object.userData.nightLightId,
          handle: guideHit.object.userData.nightLightHandle,
          plane: new THREE.Plane().setFromNormalAndCoplanarPoint(normal, guideHit.object.position),
        };
        this.selectNightLight(this.nightLightDrag.id);
        this.controls.enabled = false;
        event.preventDefault();
        return;
      }
    }
    const wallSystem = this.architectureVisible !== false
      ? this.buildingGroup.children.find((child) => child.userData?.wallSystem)
      : null;
    if (wallSystem && this.building.buildingType === 'grid' && this.gridBaySelectionEnabled === true) {
      const floorPoint = new THREE.Vector3();
      const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      if (this.raycaster.ray.intersectPlane(floorPlane, floorPoint)) {
        const xSpans = this.building.gridBaySpansX || [];
        const ySpans = this.building.gridBaySpansY || [];
        const width = xSpans.reduce((sum, span) => sum + span, 0);
        const depth = ySpans.reduce((sum, span) => sum + span, 0);
        const localX = floorPoint.x + width / 2;
        const localY = floorPoint.z + depth / 2;
        const findSpan = (position, spans) => {
          let cursor = 0;
          for (let index = 0; index < spans.length; index += 1) {
            cursor += spans[index];
            if (position >= 0 && position <= cursor) return index;
          }
          return -1;
        };
        const ix = findSpan(localX, xSpans);
        const iy = findSpan(localY, ySpans);
        if (ix >= 0 && iy >= 0) {
          this.callbacks.onGridBaySelection?.({
            bay: [ix, iy],
            key: `${ix}:${iy}`,
            additive: event.ctrlKey || event.metaKey || event.shiftKey,
          });
          event.preventDefault();
          return;
        }
      }
    }
    if (wallSystem && this.building.buildingType === 'grid' && this.building.gridStageEditEnabled === true) {
      const gridHit = this.raycaster.intersectObject(wallSystem, true).find((hit) => (
        hit.object?.isMesh && ['wall', 'vault', 'dome', 'transition'].includes(hit.object?.userData?.gridElementType)
      ));
      if (gridHit) {
        const instance = gridHit.object.isInstancedMesh
          ? gridHit.object.userData.gridInstances?.[gridHit.instanceId]
          : null;
        this.callbacks.onGridElementSelection?.({
          id: instance?.id || gridHit.object.userData.gridElementId,
          type: instance?.type || gridHit.object.userData.gridElementType,
          bay: instance?.bay || gridHit.object.userData.gridBay || null,
        });
        event.preventDefault();
        return;
      }
    }
    this.callbacks.onGridElementSelection?.(null);
    const projectInstanceId = projectInstanceIdFromHits(
      this.raycaster.intersectObjects(this.projectInstanceGroup.children, true),
      this.projectInstanceGroup,
    );
    if (projectInstanceId) {
      this.selectProjectInstance(projectInstanceId);
      return;
    }
    const hits = this.raycaster.intersectObjects(this.placementGroup.children, true);
    const placementId = visiblePlacementIdFromHits(hits, this.placementGroup);
    if (placementId) {
      this.select(placementId);
      return;
    }
    const zoneHits = this.raycaster.intersectObjects(this.zoneGroup.children, true);
    const zoneId = visibleZoneIdFromHits(zoneHits, this.zoneGroup);
    if (zoneId) {
      this.selectZone(zoneId);
      return;
    }
    const wallHit = wallSystem
      ? this.raycaster.intersectObject(wallSystem, true).find((hit) => hit.object?.isMesh && hit.object?.userData?.wallSide)
      : null;
    if (wallHit) {
      if (wallHit.object.userData?.isKarbandi) {
        if (this.building.type === 'room' && wallHit.object.userData?.wallSide === 'room_dome_transition') {
          this.selectWallSide('room_dome_transition', true, {
            part: wallHit.object.userData.roomDomePart || 'karbandi-transition-rib',
            transitionType: 'karbandi',
          });
          event.preventDefault();
          return;
        }
        const ribIndex = wallHit.object.userData.karbandiRibIndex || 0;
        this.selectKarbandiRib(ribIndex);
        if (!this.walls?.karbandi?.cutMode) {
          event.preventDefault();
          return;
        }
        const center = wallHit.object.userData.karbandiCenter || [0, 0];
        const angle = Number(wallHit.object.userData.karbandiAngle) || 0;
        const storedDirection = wallHit.object.userData.karbandiDirection;
        const direction = Array.isArray(storedDirection)
          ? new THREE.Vector3(storedDirection[0], 0, storedDirection[1])
          : new THREE.Vector3(Math.cos(angle), 0, -Math.sin(angle));
        const relative = new THREE.Vector3(wallHit.point.x - center[0], 0, wallHit.point.z - center[1]);
        this.callbacks.onKarbandiCut?.({
          ribIndex,
          side: relative.dot(direction) < 0 ? 'left' : 'right',
        });
        event.preventDefault();
        return;
      }
      this.selectWallSide(this.wallSideForHit(wallHit), true, {
        part: wallHit.object.userData.roomDomePart || null,
        transitionType: wallHit.object.userData.roomDomeTransitionType || null,
      });
      return;
    }
    this.clearSelection();
  }

  onDoubleClick(event) {
    if (event.button !== 0 || this.transformControls.dragging) return;
    const bounds = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const id = projectInstanceIdFromHits(
      this.raycaster.intersectObjects(this.projectInstanceGroup.children, true),
      this.projectInstanceGroup,
    );
    if (!id) return;
    event.preventDefault();
    this.selectProjectInstance(id);
    this.callbacks.onProjectInstanceOpen?.(id);
  }

  onContextMenu(event) {
    const bounds = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const placementId = visiblePlacementIdFromHits(
      this.raycaster.intersectObjects(this.placementGroup.children, true),
      this.placementGroup,
    );
    if (placementId) {
      event.preventDefault();
      this.select(placementId);
      this.callbacks.onAssetContextMenu?.({ kind: 'placement', id: placementId, x: event.clientX, y: event.clientY });
      return;
    }
    const decorationZoneId = visibleZoneIdFromHits(
      this.raycaster.intersectObjects(this.zoneDecorationGroup.children, true),
      this.zoneDecorationGroup,
    );
    const guideZoneId = visibleZoneIdFromHits(
      this.raycaster.intersectObjects(this.zoneGroup.children, true),
      this.zoneGroup,
    );
    const zoneId = decorationZoneId || guideZoneId;
    if (zoneId) {
      event.preventDefault();
      this.selectZone(zoneId);
      this.callbacks.onAssetContextMenu?.({ kind: 'zone', id: zoneId, x: event.clientX, y: event.clientY });
      return;
    }
    const wallSystem = this.buildingGroup.children.find((child) => child.userData?.wallSystem);
    const wallHit = wallSystem
      ? this.raycaster.intersectObject(wallSystem, true).find((hit) => hit.object?.isMesh && hit.object?.userData?.wallSide)
      : null;
    if (wallHit) {
      event.preventDefault();
      const side = this.wallSideForHit(wallHit);
      this.selectWallSide(side, true, {
        part: wallHit.object.userData.roomDomePart || null,
        transitionType: wallHit.object.userData.roomDomeTransitionType || null,
      });
      this.callbacks.onAssetContextMenu?.({ kind: 'wall', id: side, x: event.clientX, y: event.clientY });
      return;
    }
    this.callbacks.onAssetContextMenu?.(null);
  }

  onPointerMove(event) {
    if (!this.nightLightDrag) return;
    const bounds = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const point = this.raycaster.ray.intersectPlane(this.nightLightDrag.plane, new THREE.Vector3());
    if (!point) return;
    this.updateNightLight(this.nightLightDrag.id, {
      [this.nightLightDrag.handle]: point.toArray(),
    });
  }

  onPointerUp() {
    this.nightLightDrag = null;
    this.transformHandleActive = false;
    this.ensureConstructionInteractionAvailable(true);
  }

  resize() {
    this.invalidate();
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    const drawingBufferSize = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.scene.traverse((child) => {
      if (child.userData?.isArchConstructionWideGuide && child.material?.resolution) {
        child.material.resolution.copy(drawingBufferSize);
      }
    });
  }

  invalidate(shadows = false) {
    if (shadows) this.shadowMapDirty = true;
    if (typeof requestAnimationFrame !== 'function') return;
    if (this.animationFrame == null) this.animationFrame = requestAnimationFrame(this.animate);
  }

  animate = () => {
    this.animationFrame = null;
    const controlsChanged = this.controls.update();
    if (this.selectionOutline?.isBox3Helper) {
      const target = this.selectionOutline.userData.exactBoundsTarget;
      const bounds = target && previewWorldBounds(target, (object) => object.userData.exactMuqarnasGeometry === true);
      if (bounds && !bounds.isEmpty()) this.selectionOutline.box.copy(bounds);
      this.selectionOutline.updateMatrixWorld(true);
    } else {
      this.selectionOutline?.update?.();
    }
    if (this.shadowMapDirty) this.renderer.shadowMap.needsUpdate = true;
    this.updateZonePortalSideVisibility(this.camera);
    this.renderer.render(this.scene, this.camera);
    this.shadowMapDirty = false;
    if (controlsChanged) this.invalidate();
  };

  clearGroup(group, disposeShared = false) {
    group.traverse((child) => {
      if (disposeShared || child.geometry?.userData?.gridSharedTemplate !== true) child.geometry?.dispose?.();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.filter(Boolean).forEach((material) => {
        if (!disposeShared && material.userData?.gridSharedTemplate === true) return;
        material.userData?.generatedTexture?.dispose?.();
        material.map?.dispose?.();
        material.dispose?.();
      });
    });
    group.clear();
  }

  dispose() {
    this.stopConstructionSequence();
    this.restoreRoomSectionMaterials();
    cancelAnimationFrame(this.animationFrame);
    this.resizeObserver.disconnect();
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown);
    this.renderer.domElement.removeEventListener('dblclick', this.onDoubleClick);
    this.renderer.domElement.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onInteractionCancel);
    window.removeEventListener('blur', this.onInteractionCancel);
    this.controls.dispose();
    this.transformControls.detach();
    this.transformControls.dispose();
    this.clearGroup(this.buildingGroup);
    this.clearGroup(this.archInfillGroup);
    this.clearConstructionGuides();
    this.clearGroup(this.placementMaskGroup);
    this.clearGroup(this.zoneDecorationGroup);
    this.clearGroup(this.zoneGroup);
    this.clearGroup(this.placementGroup);
    this.clearGroup(this.projectInstanceGroup);
    this.clearGridElementHighlight();
    this.clearGridBayHighlight();
    this.clearWallSurfaceHighlight();
    this.gridTemplateCache.templates.forEach((template) => this.clearGroup(template, true));
    this.gridTemplateCache.templates.clear();
    this.nightLightObjects.forEach(({ helper, marker, targetMarker }) => {
      helper?.dispose?.();
      marker?.geometry?.dispose?.();
      marker?.material?.dispose?.();
      targetMarker?.geometry?.dispose?.();
      targetMarker?.material?.dispose?.();
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
