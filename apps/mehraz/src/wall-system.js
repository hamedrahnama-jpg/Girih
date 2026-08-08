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
import { buildStructuredWebPatch } from './karbandi-structured-patch.js';

export const WALL_SIDES = Object.freeze(['north', 'east', 'south', 'west']);
export const BRICK_BOND_SIDES = Object.freeze(['north_sides', 'north_top', 'east', 'south', 'west', 'arch']);
const IMPORTED_BOND_NORMALIZED_UNIT_M = 0.1;

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

export const DEFAULT_WALL_SYSTEM = Object.freeze({
  enabled: true,
  color: '#b78b5d',
  shadows: true,
  openSides: [],
  extraHeights: { north: 0, east: 0, south: 0, west: 0 },
  sideOffsets: { north: 0, east: 0, south: 0, west: 0 },
  edges: { enabled: false, color: '#79610c', thickness: 2 },
  southOpenings: {
    door: { enabled: true, width: 1.7, height: 2.1, position: 0 },
    window: { enabled: false, width: 1, height: 1, position: 0, sillHeight: 4.5 },
  },
  pointedArch: {
    enabled: true,
    greenOffset: 1,
    greenHeight: 5,
    moduleInfill: true,
    overlap: 0.1,
  },
  ahang: {
    enabled: true,
  },
  karbandi: {
    enabled: false,
    ribCount: 16,
    rotationOffset: 0,
    span: 4.3,
    springHeightOffset: 0,
    greenOffset: 0.85,
    greenHeightOffset: -0.85,
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
    ribColor: '#b78b5d',
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
      roofThickness: 0.1,
      infillBrickColor: '#b9824f',
      infillBrickColor2: '#9f663b',
      infillBrickHeight: 0.06,
      wallBearingDepth: 0,
      wallEmbedTolerance: 0,
      ribEmbedTolerance: 0,
      seatingOffset: 0,
      cornerSeatMode: 'rib-profile',
      cornerRadius: 0.08,
      customCornerCurve: [],
      allowUnsupportedFreeEdge: false,
      planarFallback: false,
      intentionalOpenings: [],
    },
    clipToPortal: true,
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
        arch: { source: 'builtin', builtIn: 'running', assetId: null, name: 'Running bond', payload: null },
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

export function normalizeWallSystem(value = {}, building = {}) {
  const openings = value.southOpenings || {};
  const door = openings.door || {};
  const windowOpening = openings.window || {};
  const pointedArch = value.pointedArch || {};
  const karbandi = value.karbandi || {};
  const karbandiEnabled = karbandi.enabled === true;
  const legacyAhangEnabled = pointedArch.enabled !== false && !karbandiEnabled;
  const ahangEnabled = value.ahang?.enabled == null
    ? legacyAhangEnabled
    : value.ahang.enabled === true && !karbandiEnabled;
  const northWall = value.northWall || {};
  const northBoundary = value.northBoundary || {};
  const edges = value.edges || value.wallEdges || {};
  const bricks = value.bricks || value.brickPattern || {};
  const defaultSill = DEFAULT_WALL_SYSTEM.southOpenings.window.sillHeight;
  return {
    enabled: value.enabled !== false,
    color: color(value.color, DEFAULT_WALL_SYSTEM.color),
    shadows: value.shadows !== false,
    openSides: WALL_SIDES.filter((side) => Array.isArray(value.openSides) && value.openSides.includes(side)),
    extraHeights: sideRecord(value.extraHeights, 0, 0, 20),
    sideOffsets: sideRecord(value.sideOffsets, 0, -20, 20),
    edges: {
      enabled: edges.enabled === true,
      color: color(edges.color, DEFAULT_WALL_SYSTEM.edges.color),
      thickness: number(edges.thickness, DEFAULT_WALL_SYSTEM.edges.thickness, 0.5, 8),
    },
    southOpenings: {
      door: {
        enabled: door.enabled == null ? DEFAULT_WALL_SYSTEM.southOpenings.door.enabled : door.enabled === true,
        width: number(door.width, DEFAULT_WALL_SYSTEM.southOpenings.door.width, 0.3, 12),
        height: number(door.height, 2.1, 0.5, 15),
        position: number(door.position, 0, -20, 20),
      },
      window: {
        enabled: windowOpening.enabled === true,
        width: number(windowOpening.width, DEFAULT_WALL_SYSTEM.southOpenings.window.width, 0.3, 12),
        height: number(windowOpening.height, DEFAULT_WALL_SYSTEM.southOpenings.window.height, 0.3, 12),
        position: number(windowOpening.position, 0, -20, 20),
        sillHeight: windowOpening.sillHeight == null
          ? defaultSill
          : number(windowOpening.sillHeight, defaultSill, 0, 18),
      },
    },
    pointedArch: {
      enabled: pointedArch.enabled !== false,
      greenOffset: number(pointedArch.greenOffset, DEFAULT_WALL_SYSTEM.pointedArch.greenOffset, 0.05, 20),
      greenHeight: number(pointedArch.greenHeight, DEFAULT_WALL_SYSTEM.pointedArch.greenHeight, 0, 20),
      moduleInfill: pointedArch.moduleInfill !== false,
      overlap: number(pointedArch.overlap, 0.1, 0, 0.5),
    },
    ahang: {
      enabled: ahangEnabled,
    },
    karbandi: {
      enabled: karbandiEnabled,
      ribCount: Math.round(number(value.karbandi?.ribCount, DEFAULT_WALL_SYSTEM.karbandi.ribCount, 2, 64)),
      rotationOffset: number(value.karbandi?.rotationOffset, DEFAULT_WALL_SYSTEM.karbandi.rotationOffset, -360, 360),
      span: number(value.karbandi?.span, DEFAULT_WALL_SYSTEM.karbandi.span, 0.2, 40),
      springHeightOffset: number(value.karbandi?.springHeightOffset, DEFAULT_WALL_SYSTEM.karbandi.springHeightOffset, -10, 20),
      greenOffset: number(value.karbandi?.greenOffset, DEFAULT_WALL_SYSTEM.karbandi.greenOffset, 0.05, 20),
      greenHeightOffset: number(value.karbandi?.greenHeightOffset, DEFAULT_WALL_SYSTEM.karbandi.greenHeightOffset, -10, 20),
      ribWidth: number(value.karbandi?.ribWidth ?? value.karbandi?.ribThickness, DEFAULT_WALL_SYSTEM.karbandi.ribWidth, 0.01, 2),
      ribDepth: number(value.karbandi?.ribDepth ?? value.karbandi?.ribThickness, DEFAULT_WALL_SYSTEM.karbandi.ribDepth, 0.01, 2),
      referenceAngle: number(value.karbandi?.referenceAngle, DEFAULT_WALL_SYSTEM.karbandi.referenceAngle, 1, 359),
      referenceX: number(value.karbandi?.referenceX, DEFAULT_WALL_SYSTEM.karbandi.referenceX, -40, 40),
      referenceZ: number(value.karbandi?.referenceZ, DEFAULT_WALL_SYSTEM.karbandi.referenceZ, -40, 40),
      referenceRotation: number(value.karbandi?.referenceRotation, DEFAULT_WALL_SYSTEM.karbandi.referenceRotation, -360, 360),
      groupX: number(value.karbandi?.groupX, DEFAULT_WALL_SYSTEM.karbandi.groupX, -40, 40),
      groupY: number(value.karbandi?.groupY, DEFAULT_WALL_SYSTEM.karbandi.groupY, -40, 40),
      groupZ: number(value.karbandi?.groupZ, DEFAULT_WALL_SYSTEM.karbandi.groupZ, -40, 40),
      groupRotationY: number(value.karbandi?.groupRotationY, DEFAULT_WALL_SYSTEM.karbandi.groupRotationY, -360, 360),
      groupScale: number(value.karbandi?.groupScale, DEFAULT_WALL_SYSTEM.karbandi.groupScale, 0.05, 20),
      ribColor: color(value.karbandi?.ribColor, color(value.color, DEFAULT_WALL_SYSTEM.color)),
      coverEnabled: value.karbandi?.coverEnabled === true,
      coverFinish: value.karbandi?.coverFinish === 'solid' ? 'solid' : 'bricks',
      coverColor: color(value.karbandi?.coverColor, DEFAULT_WALL_SYSTEM.karbandi.coverColor),
      web: normalizeKarbandiWebOptions(value.karbandi?.web),
      clipToPortal: karbandiEnabled,
      cutMode: value.karbandi?.cutMode === true,
      manualCuts: Array.isArray(value.karbandi?.manualCuts)
        ? value.karbandi.manualCuts
          .map((cut) => ({
            ribIndex: Math.round(number(cut?.ribIndex, 0, 0, 512)),
            side: cut?.side === 'right' ? 'right' : 'left',
          }))
          .filter((cut, index, list) => list.findIndex((item) => item.ribIndex === cut.ribIndex && item.side === cut.side) === index)
        : [],
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
          normalizeSideBond(bricks.sideBonds?.[side] || (side.startsWith('north_') ? bricks.sideBonds?.north : null)),
        ])),
        north: normalizeSideBond(bricks.sideBonds?.north),
      },
    },
  };
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

function wallMaterial(walls, side = null, width = 1, height = 1, worldUv = false, phaseU = 0, mirrorU = false) {
  const material = new THREE.MeshStandardMaterial({
    color: walls.color,
    roughness: 0.78,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  if (walls.bricks.enabled && side) {
    const baseWalls = wallsWithDefaultBond(walls, side);
    // Every structural face uses the same horizontal running-bond axes:
    // brick width follows the wall and brick height follows world Y.
    material.map = makeBondTexture(baseWalls, side, width, height, false, worldUv, phaseU, mirrorU);
    material.color.set('#ffffff');
    material.userData.generatedTexture = material.map;
    material.userData.isFlatBrickBond = true;
  }
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
    shader.uniforms.raisedArchRedHeight = { value: archMapping?.redHeight || 0 };
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
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vRaisedBrickWorldPosition;\nvarying vec3 vRaisedBrickWorldNormal;',
      )
      .replace(
        '#include <defaultnormal_vertex>',
        '#include <defaultnormal_vertex>\nvRaisedBrickWorldNormal = normalize(mat3(modelMatrix) * objectNormal);',
      )
      .replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\nvRaisedBrickWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vRaisedBrickWorldPosition;
varying vec3 vRaisedBrickWorldNormal;
uniform float raisedBrickWidth;
uniform float raisedBrickHeight;
uniform float raisedBrickMortar;
uniform vec3 raisedBrickMortarColor;
uniform float raisedArchEnabled;
uniform float raisedArchCenterX;
uniform float raisedArchRedHeight;
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
float raisedBrickHash(vec2 point) {
  return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453123);
}`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
{
  vec3 derivativeX = dFdx(vRaisedBrickWorldPosition);
  vec3 derivativeY = dFdy(vRaisedBrickWorldPosition);
  vec3 faceDirection = abs(normalize(cross(derivativeX, derivativeY)));
  vec2 surfacePosition;
  bool useArchMapping = false;
  bool useWholeStraightBand = false;
  if (raisedArchEnabled > 0.5) {
    float sideDirection = vRaisedBrickWorldPosition.x < raisedArchCenterX ? -1.0 : 1.0;
    vec2 archPoint = vec2(raisedArchCenterX + abs(vRaisedBrickWorldPosition.x - raisedArchCenterX), vRaisedBrickWorldPosition.y);
    vec2 redCenter = vec2(raisedArchCenterX, raisedArchRedHeight);
    vec2 greenCenter = vec2(raisedArchCenterX - raisedArchGreenOffset, raisedArchGreenHeight);
    float redDistance = length(archPoint - redCenter);
    float greenDistance = length(archPoint - greenCenter);
    float redCurveDistance = abs(redDistance - raisedArchRedRadius);
    float greenCurveDistance = abs(greenDistance - raisedArchGreenRadius);
    float apexAngle = atan(raisedArchApexY - raisedArchGreenHeight, raisedArchGreenOffset);
    float greenTangentAngle = atan(raisedArchTangentY - raisedArchGreenHeight, raisedArchTangentX - (raisedArchCenterX - raisedArchGreenOffset));
    float redTangentAngle = atan(raisedArchTangentY - raisedArchRedHeight, raisedArchTangentX - raisedArchCenterX);
    float greenSegmentLength = raisedArchGreenRadius * abs(apexAngle - greenTangentAngle);
    float redCurrentAngle = atan(archPoint.y - raisedArchRedHeight, archPoint.x - raisedArchCenterX);
    float greenCurrentAngle = atan(archPoint.y - raisedArchGreenHeight, archPoint.x - (raisedArchCenterX - raisedArchGreenOffset));
    bool onRedArc = redCurrentAngle >= -0.0001 && redCurrentAngle <= redTangentAngle + 0.0001;
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
      && (vRaisedBrickWorldPosition.y >= raisedStraightTopY || vRaisedBrickWorldPosition.y <= raisedStraightBottomY)) {
    float distanceAcrossBand = vRaisedBrickWorldPosition.y >= raisedStraightTopY
      ? vRaisedBrickWorldPosition.y - raisedStraightTopY
      : raisedStraightBottomY - vRaisedBrickWorldPosition.y;
    surfacePosition = vec2(
      clamp(distanceAcrossBand / raisedStraightSideBandWidth, 0.0, 1.0) * raisedBrickWidth,
      vRaisedBrickWorldPosition.x
    );
    useWholeStraightBand = true;
  } else if (!useArchMapping && raisedArchEnabled > 0.5 && faceDirection.z >= faceDirection.x
      && abs(vRaisedBrickWorldPosition.x - raisedArchCenterX) >= raisedStraightOuterHalfWidth - raisedStraightSideBandWidth - 0.0001
      && abs(vRaisedBrickWorldPosition.x - raisedArchCenterX) <= raisedStraightOuterHalfWidth + 0.0001) {
    float distanceFromOuterEdge = raisedStraightOuterHalfWidth - abs(vRaisedBrickWorldPosition.x - raisedArchCenterX);
    surfacePosition = vec2(
      clamp(distanceFromOuterEdge / raisedStraightSideBandWidth, 0.0, 1.0) * raisedBrickWidth,
      vRaisedBrickWorldPosition.y
    );
    useWholeStraightBand = true;
  } else if (!useArchMapping && raisedArchEnabled > 0.5 && faceDirection.z >= faceDirection.x
      && abs(vRaisedBrickWorldPosition.x - raisedArchCenterX) >= raisedStraightInnerHalfWidth - 0.0001
      && abs(vRaisedBrickWorldPosition.x - raisedArchCenterX) <= raisedStraightInnerHalfWidth + raisedStraightSideBandWidth + 0.0001) {
    float distanceFromOpeningEdge = abs(vRaisedBrickWorldPosition.x - raisedArchCenterX) - raisedStraightInnerHalfWidth;
    surfacePosition = vec2(
      clamp(distanceFromOpeningEdge / raisedStraightSideBandWidth, 0.0, 1.0) * raisedBrickWidth,
      vRaisedBrickWorldPosition.y
    );
    useWholeStraightBand = true;
  } else if (!useArchMapping && faceDirection.y > max(faceDirection.x, faceDirection.z)) {
    surfacePosition = vRaisedBrickWorldPosition.xz;
  } else if (!useArchMapping && faceDirection.x > faceDirection.z) {
    surfacePosition = vec2(vRaisedBrickWorldPosition.z, vRaisedBrickWorldPosition.y);
  } else if (!useArchMapping) {
    surfacePosition = vRaisedBrickWorldPosition.xy;
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

function applyWallContinuationBrickUvs(geometry, supportSide) {
  const positions = geometry.getAttribute('position');
  const uvs = geometry.getAttribute('uv');
  if (!positions || !uvs) return geometry;
  const followsSideWall = supportSide === 'east' || supportSide === 'west';
  for (let index = 0; index < positions.count; index += 1) {
    // Project the vertical wall bond through the bent infill: course height
    // remains world Y while the horizontal bond axis remains the wall axis.
    // The roof curvature changes the surface position, not the brick phase.
    uvs.setXY(
      index,
      followsSideWall ? positions.getZ(index) : positions.getX(index),
      positions.getY(index),
    );
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
  shape.lineTo(doorLeft, doorTop);
  shape.lineTo(doorRight, doorTop);
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

function archCapShape(left, right, baseline, archPoints, holes = []) {
  if (!archPoints?.length) return null;
  const first = archPoints[0];
  const last = archPoints[archPoints.length - 1];
  const baseY = Math.max(0, Math.min(baseline, first.y, last.y));
  const shape = new THREE.Shape();
  shape.moveTo(left, baseY);
  if (left < first.x) shape.lineTo(first.x, baseY);
  archPoints.forEach((point) => shape.lineTo(point.x, point.y));
  if (right > last.x) shape.lineTo(right, baseY);
  shape.lineTo(left, baseY);
  shape.closePath();
  holes.forEach((hole) => shape.holes.push(hole));
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

function archCurve(centerX, halfSpan, sideHeight, redHeight, greenOffset, greenHeight, count = 36) {
  const redCenter = new THREE.Vector2(centerX, redHeight);
  const sidePoint = new THREE.Vector2(centerX + halfSpan, sideHeight);
  const greenCenter = new THREE.Vector2(centerX - greenOffset, greenHeight);
  const redRadius = redCenter.distanceTo(sidePoint);
  const centersDistance = redCenter.distanceTo(greenCenter);
  if (!Number.isFinite(redRadius) || redRadius <= 0.00001 || centersDistance <= 0.00001) return [];
  const greenRadius = redRadius + centersDistance;
  const tangentDirection = redCenter.clone().sub(greenCenter).normalize();
  const tangentPoint = redCenter.clone().addScaledVector(tangentDirection, redRadius);
  if (greenRadius <= greenOffset + 0.00001) return [];
  const apexPoint = new THREE.Vector2(
    centerX,
    greenHeight + Math.sqrt(Math.max(0, greenRadius * greenRadius - greenOffset * greenOffset)),
  );
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

function pointedArchBrickMapping(centerX, halfSpan, sideHeight, redHeight, greenOffset, greenHeight, bandWidth, straightTopY, straightBottomY, straightOuterHalfWidth) {
  const redCenter = new THREE.Vector2(centerX, redHeight);
  const sidePoint = new THREE.Vector2(centerX + halfSpan, sideHeight);
  const greenCenter = new THREE.Vector2(centerX - greenOffset, greenHeight);
  const redRadius = redCenter.distanceTo(sidePoint);
  const centersDistance = redCenter.distanceTo(greenCenter);
  if (!Number.isFinite(redRadius) || redRadius <= 0.00001 || centersDistance <= 0.00001) return null;
  const greenRadius = redRadius + centersDistance;
  const tangentPoint = redCenter.clone().addScaledVector(redCenter.clone().sub(greenCenter).normalize(), redRadius);
  const apexY = greenHeight + Math.sqrt(Math.max(0, greenRadius * greenRadius - greenOffset * greenOffset));
  return {
    enabled: true,
    centerX,
    redHeight,
    greenOffset,
    greenHeight,
    redRadius,
    greenRadius,
    tangentX: tangentPoint.x,
    tangentY: tangentPoint.y,
    apexY,
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

function extrudedShape(shape, depth, z, material, side, mirrorCenterX = null) {
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

function makeBondTexture(walls, side, surfaceWidth, surfaceHeight, rotate = false, worldUv = false, phaseU = 0, mirrorU = false) {
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
  texture.repeat.set(
    worldUv ? 1 / periodWidth : Math.max(0.1, (rotate ? surfaceHeight : surfaceWidth) / periodWidth),
    worldUv ? 1 / periodHeight : Math.max(0.1, (rotate ? surfaceWidth : surfaceHeight) / periodHeight),
  );
  texture.offset.x = (phaseU + (Number(sideBond.offsetU) || 0)) / periodWidth;
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

function brickMaterial(walls, side, width, height, rotate = false, worldUv = false, phaseU = 0, mirrorU = false) {
  const texture = makeBondTexture(walls, side, width, height, rotate, worldUv, phaseU, mirrorU);
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
  return material;
}

function raisedBorderMaterial(walls, side, width, height, orientation = 'horizontal', archMapping = null) {
  const material = new THREE.MeshStandardMaterial({
    color: walls.color,
    roughness: 0.78,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  return configureRaisedBorderBrickMaterial(material, walls, archMapping);
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

function addBrickFace(group, shape, side, width, height, planePosition, rotation, walls, phaseU = 0, selectionSide = side, mirrorCenterX = null) {
  if (!walls.bricks.enabled) return;
  const selectedBond = walls.bricks.sideBonds[side];
  // The structural wall already carries the default running bond on every face.
  // Avoid drawing an identical coplanar skin, which causes diagonal moire/grain.
  if (selectedBond?.source !== 'library' && (selectedBond?.builtIn || 'running') === 'running') return;
  // Shape UVs already map their horizontal axis to the wall length after the
  // mesh is rotated into place, so east/west faces must not swap width/height.
  const material = brickMaterial(walls, side, width, height, false, true, phaseU, false);
  const geometry = new THREE.ShapeGeometry(shape, 48);
  applyWorldAlignedBrickUvs(geometry);
  if (Number.isFinite(mirrorCenterX)) applyMirroredNorthFaceUvs(geometry, mirrorCenterX);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...planePosition);
  mesh.rotation.set(...rotation);
  mesh.receiveShadow = true;
  mesh.userData.wallSide = selectionSide;
  mesh.userData.isBrickFace = true;
  mesh.renderOrder = 2;
  group.add(mesh);
}

function addDefaultBrickFace(group, shape, side, width, height, planePosition, rotation, walls) {
  const defaultWalls = wallsWithDefaultBond(walls, side);
  addBrickFace(group, shape, side, width, height, planePosition, rotation, defaultWalls);
}

function addEdges(group, mesh, walls) {
  if (!walls.edges.enabled || !mesh.geometry) return;
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
  edges.userData.requestedThickness = walls.edges.thickness;
  edges.renderOrder = 6;
  group.add(edges);
}

function addKarbandiReferenceHighlight(group, mesh) {
  if (!mesh?.geometry) return;
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(mesh.geometry, 18),
    new THREE.LineBasicMaterial({
      color: '#18c7d4',
      transparent: true,
      opacity: 0.95,
      depthTest: true,
    }),
  );
  edges.position.copy(mesh.position);
  edges.rotation.copy(mesh.rotation);
  edges.scale.copy(mesh.scale);
  edges.userData.isWallEdge = true;
  edges.userData.isKarbandiReferenceHighlight = true;
  edges.userData.requestedThickness = 3;
  edges.renderOrder = 12;
  edges.visible = false;
  group.add(edges);
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

function addCurvedNorthBorderBricks(group, archPoints, centerX, inset, z, walls) {
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
    brick.userData.isNorthCurveBorderBrick = true;
    brick.userData.wallSide = 'north';
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

function offsetArchPoint(points, index, centerX, inset) {
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
  const fromCenter = point.clone().sub(new THREE.Vector2(centerX, 0));
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
    addCurvedNorthBorderBricks(group, mapped, layout.centerX, borderWidth, z, state);
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

function setShadow(group, enabled) {
  group.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = enabled;
    child.receiveShadow = enabled;
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
  } = layout;
  if (eastX - westX <= 0.05 || southZ - northZ <= 0.05) return [];
  const centerX = (westX + eastX) / 2;
  // Karbandi ribs originate at and rotate around the midpoint of the north
  // wall's exterior face, rather than its interior face or the room center.
  const centerZ = northExteriorZ;
  const ribCount = Math.max(2, Math.round(walls.karbandi.ribCount || 16));
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
  const groupScale = Math.max(0.05, Number(walls.karbandi.groupScale) || 1);
  const groupRotationY = THREE.MathUtils.degToRad(Number(walls.karbandi.groupRotationY) || 0);
  const groupTransform = new THREE.Matrix4()
    .makeTranslation(centerX + (Number(walls.karbandi.groupX) || 0), Number(walls.karbandi.groupY) || 0, centerZ + (Number(walls.karbandi.groupZ) || 0))
    .multiply(new THREE.Matrix4().makeRotationY(groupRotationY))
    .multiply(new THREE.Matrix4().makeScale(groupScale, groupScale, groupScale))
    .multiply(new THREE.Matrix4().makeTranslation(-centerX, 0, -centerZ));
  const offset = THREE.MathUtils.degToRad(Number(walls.karbandi.rotationOffset) || 0);
  const meshes = [];
  const clipPlanes = [
    new THREE.Plane(new THREE.Vector3(1, 0, 0), -westExteriorX),
    new THREE.Plane(new THREE.Vector3(-1, 0, 0), eastExteriorX),
    // At the north wall, stop ribs at the interior portal face. The orbit
    // center remains independently anchored to the north exterior face.
    new THREE.Plane(new THREE.Vector3(0, 0, 1), -northZ),
    new THREE.Plane(new THREE.Vector3(0, 0, -1), southExteriorZ),
    new THREE.Plane(new THREE.Vector3(0, 1, 0), -Math.max(0, sideTop - 0.01)),
  ];
  const inner = archCurve(0, halfSpan, springY, springY, greenOffset, greenHeight, 28);
  const outer = archCurve(0, halfSpan + ribWidth, springY, springY, greenOffset, greenHeight, 28);
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
  const outsideClipBounds = (point) => (
    point.x < westExteriorX - 0.000001
    || point.x > eastExteriorX + 0.000001
    || point.z < northZ - 0.000001
    || point.z > southExteriorZ + 0.000001
  );
  const legTouchesClipBoundary = (ribIndex, side) => {
    if (!clipPlanes) return false;
    const endpointIndex = side === 'left' ? 0 : inner.length - 1;
    const angle = ribAngles[ribIndex];
    const endpointCandidates = [inner[endpointIndex], outer[endpointIndex]];
    return endpointCandidates.some((point) => (
      outsideClipBounds(transformRibPoint(point, angle, -ribDepth / 2))
      || outsideClipBounds(transformRibPoint(point, angle, ribDepth / 2))
    ));
  };
  const legTouchesVerticalWall = (ribIndex, side) => {
    const endpointIndex = side === 'left' ? 0 : inner.length - 1;
    const angle = ribAngles[ribIndex];
    const contactTolerance = Math.max(0.012, Math.max(ribWidth, ribDepth) * groupScale * 0.55);
    const endpointCandidates = [inner[endpointIndex], outer[endpointIndex]].flatMap((point) => [
      transformRibPoint(point, angle, -ribDepth / 2),
      transformRibPoint(point, angle, ribDepth / 2),
    ]);
    return endpointCandidates.some((point) => {
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
      return touchesWest || touchesEast || touchesSouth;
    });
  };
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
  const firstRibIntersection = (ribIndex, side, minimumProgress = 0) => {
    const leg = ribLegs[ribIndex][side];
    let first = null;
    for (let otherIndex = 0; otherIndex < ribCount; otherIndex += 1) {
      if (otherIndex === ribIndex) continue;
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
            const progress = segmentIndex + crossing.t;
            // Ignore a coincident endpoint; it does not provide a useful trim.
            if (progress <= minimumProgress + 0.001 || (first && progress >= first.progress)) continue;
            const originalIndex = THREE.MathUtils.lerp(
              leg[segmentIndex].originalIndex,
              leg[segmentIndex + 1].originalIndex,
              crossing.t,
            );
            first = { progress, originalIndex };
          }
        }
      }
    }
    return first;
  };
  const intersectionCutCache = new Map();
  const firstIntersectionForLeg = (ribIndex, side) => {
    const key = `${ribIndex}:${side}`;
    if (!intersectionCutCache.has(key)) {
      intersectionCutCache.set(key, firstRibIntersection(ribIndex, side));
    }
    return intersectionCutCache.get(key);
  };
  const automaticCuts = new Map();
  if (clipPlanes) {
    for (let ribIndex = 0; ribIndex < ribCount; ribIndex += 1) {
      for (const side of ['left', 'right']) {
        const extendsBeyondWalls = legTouchesClipBoundary(ribIndex, side);
        const supportedByVerticalWall = legTouchesVerticalWall(ribIndex, side);
        if (!extendsBeyondWalls && supportedByVerticalWall) continue;
        // Legs extending outside the portal and legs whose feet do not reach
        // the south/east/west walls are unsupported. Remove each one through
        // its first physical rib crossing so no short floating leg remains.
        // If there is no crossing, remove the whole leg through its apex.
        const intersection = firstIntersectionForLeg(ribIndex, side);
        automaticCuts.set(`${ribIndex}:${side}`, intersection || {
          originalIndex: apexIndex,
          progress: Number.POSITIVE_INFINITY,
        });
      }
    }
  }
  const cutSet = new Set((walls.karbandi.manualCuts || []).map((cut) => `${cut.ribIndex}:${cut.side}`));
  const pointAtCurveIndex = (curve, value) => {
    const lower = Math.max(0, Math.min(curve.length - 1, Math.floor(value)));
    const upper = Math.max(0, Math.min(curve.length - 1, Math.ceil(value)));
    if (lower === upper) return curve[lower].clone();
    return curve[lower].clone().lerp(curve[upper], value - lower);
  };
  const sliceCurveAtIndices = (curve, start, end) => {
    const points = [pointAtCurveIndex(curve, start)];
    for (let index = Math.ceil(start); index <= Math.floor(end); index += 1) {
      if (index > start + 0.000001 && index < end - 0.000001) points.push(curve[index]);
    }
    if (end > start + 0.000001) points.push(pointAtCurveIndex(curve, end));
    return points;
  };
  const visibleRibRanges = new Map();
  const makeRibShape = (ribIndex) => {
    const automaticLeft = automaticCuts.get(`${ribIndex}:left`);
    const automaticRight = automaticCuts.get(`${ribIndex}:right`);
    const manualCutIndex = (side, automaticCut) => {
      if (!cutSet.has(`${ribIndex}:${side}`)) return null;
      // When portal clipping has already removed the first segment, manual
      // cutting advances to the next crossing along the still-visible leg.
      const intersection = automaticCut
        ? firstRibIntersection(ribIndex, side, automaticCut.progress)
        : firstIntersectionForLeg(ribIndex, side);
      return intersection?.originalIndex ?? apexIndex;
    };
    const manualLeft = manualCutIndex('left', automaticLeft);
    const manualRight = manualCutIndex('right', automaticRight);
    const start = Math.max(
      manualLeft == null ? 0 : manualLeft,
      automaticLeft == null ? 0 : automaticLeft.originalIndex,
    );
    const end = Math.min(
      manualRight == null ? inner.length - 1 : manualRight,
      automaticRight == null ? inner.length - 1 : automaticRight.originalIndex,
    );
    if (end - start < 3) return null;
    visibleRibRanges.set(ribIndex, { start, end });
    const innerSlice = sliceCurveAtIndices(inner, start, end);
    const outerSlice = sliceCurveAtIndices(outer, start, end);
    const ribShape = new THREE.Shape();
    ribShape.moveTo(outerSlice[0].x, outerSlice[0].y);
    outerSlice.slice(1).forEach((point) => ribShape.lineTo(point.x, point.y));
    [...innerSlice].reverse().forEach((point) => ribShape.lineTo(point.x, point.y));
    ribShape.closePath();
    return ribShape;
  };
  for (let index = 0; index < ribCount; index += 1) {
    const angle = offset + referenceRotation + (Math.PI * 2 * index) / ribCount;
    const shape = makeRibShape(index);
    if (!shape) continue;
    const material = wallMaterial(walls, null);
    material.color.set(walls.karbandi.ribColor);
    material.roughness = 0.82;
    // The rib crown is intentionally tangent to the roof underside. Bias the
    // rib toward the camera just enough to prevent the roof triangles from
    // producing a broken, wavy reveal along that shared boundary.
    material.polygonOffset = true;
    material.polygonOffsetFactor = -1;
    material.polygonOffsetUnits = -1;
    if (clipPlanes) {
      material.clippingPlanes = clipPlanes;
      material.clipIntersection = false;
      material.clipShadows = true;
    }
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
    const rib = new THREE.Mesh(geometry, material);
    rib.renderOrder = 2;
    rib.castShadow = true;
    rib.receiveShadow = true;
    rib.userData.wallSide = 'arch';
    rib.userData.isKarbandi = true;
    rib.userData.isKarbandiReference = index === 0;
    rib.userData.karbandiRibIndex = index;
    rib.userData.karbandiPortalCuts = ['left', 'right'].filter((side) => automaticCuts.has(`${index}:${side}`));
    rib.userData.karbandiManualCuts = ['left', 'right'].filter((side) => cutSet.has(`${index}:${side}`));
    rib.userData.karbandiCenter = [centerX + (Number(walls.karbandi.groupX) || 0), centerZ + (Number(walls.karbandi.groupZ) || 0)];
    rib.userData.karbandiAngle = angle + groupRotationY;
    // THREE.RotationY maps local +X toward world -Z for a positive angle.
    // Store the transformed local axis so pointer-side detection stays correct
    // for every rib around the orbit.
    rib.userData.karbandiDirection = [
      Math.cos(angle + groupRotationY),
      -Math.sin(angle + groupRotationY),
    ];
    group.add(rib);
    if (index === 0) addKarbandiReferenceHighlight(group, rib);
    meshes.push(rib);
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
      const wallCandidates = [
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
      const visibleRange = visibleRibRanges.get(ribIndex);
      if (!visibleRange) return;
      const visibleOuter = sliceCurveAtIndices(outer, visibleRange.start, visibleRange.end);
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
            { ribSegmentIndex: index, seatingSide: seatIndex },
          );
        }
      });
    });
    group.userData.karbandiRibFootClosureCount = rawSegments.filter((segment) => (
      segment.kind === 'rib-seat' && /^\d+:(left|right):[01]$/.test(String(segment.sourceId))
    )).length;
    group.userData.karbandiRibFootSeatCount = ribFootSeatCount;

    const springing = extractSpringingBoundary({
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

    const segmentCrossing = (first, second) => {
      const rx = first.b.x - first.a.x;
      const rz = first.b.z - first.a.z;
      const sx = second.b.x - second.a.x;
      const sz = second.b.z - second.a.z;
      const denominator = rx * sz - rz * sx;
      if (Math.abs(denominator) < 0.000001) return null;
      const qx = second.a.x - first.a.x;
      const qz = second.a.z - first.a.z;
      const t = (qx * sz - qz * sx) / denominator;
      const u = (qx * rz - qz * rx) / denominator;
      if (t < -0.000001 || t > 1.000001 || u < -0.000001 || u > 1.000001) return null;
      return {
        t: THREE.MathUtils.clamp(t, 0, 1),
        u: THREE.MathUtils.clamp(u, 0, 1),
      };
    };

    const visibleRibSegments = rawSegments.filter((segment) => segment.kind === 'rib-seat');
    const curvedRibSegments = visibleRibSegments.filter((segment) => /^\d+:[01]$/.test(String(segment.sourceId)));
    const cornerGuideDiagnostics = [];
    const boundingRibsForGuide = (foot, target) => {
      const direction = target.clone().sub(foot);
      direction.y = 0;
      if (direction.lengthSq() < 0.0000001) direction.set(0, 0, 1);
      direction.normalize();
      const probe = foot.clone().lerp(target, 0.42);
      const nearestByRib = new Map();
      curvedRibSegments.forEach((segment) => {
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
      let points = curvedRibSegments
        .filter((segment) => String(segment.sourceId) === String(sourceId))
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
      const profiles = boundingRibs
        .map((item) => ribProfileForGuide(item.segment.sourceId, foot, chord, sampleCount))
        .filter(Boolean);
      let guidePoints;
      if (profiles.length) {
        let previousPlan = 0;
        let previousRise = 0;
        guidePoints = Array.from({ length: sampleCount }, (_, pointIndex) => {
          const fallbackProgress = pointIndex / (sampleCount - 1);
          const normalized = profiles.map((profile) => {
            const startPoint = profile[0];
            const endPoint = profile[profile.length - 1];
            const point = profile[pointIndex];
            const finalPlan = Math.hypot(endPoint.x - startPoint.x, endPoint.z - startPoint.z);
            const currentPlan = Math.hypot(point.x - startPoint.x, point.z - startPoint.z);
            const finalRise = endPoint.y - startPoint.y;
            return {
              plan: finalPlan > 0.000001 ? currentPlan / finalPlan : fallbackProgress,
              rise: Math.abs(finalRise) > 0.000001 ? (point.y - startPoint.y) / finalRise : fallbackProgress,
            };
          });
          let planProgress = normalized.reduce((sum, value) => sum + value.plan, 0) / normalized.length;
          let riseProgress = normalized.reduce((sum, value) => sum + value.rise, 0) / normalized.length;
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
        profileConstraint: 'average-full-left-right-rib-bend-and-slope',
        guidePoints: guidePoints.map((point) => point.toArray()),
        startTangent: startTangent.toArray(),
        endTangent: endTangent.toArray(),
      });
      return guidePoints;
    };
    const archApexPoint = new THREE.Vector3(
      centerX,
      Math.max(sideTop, northArchHeightAtX(centerX)),
      roofNorthZ,
    );
    const referenceGuideProfile = outer.slice(0, apexIndex + 1);
    let hiddenCornerGuideCount = 0;
    const addReferenceAlignedCornerGuide = (cornerX) => {
      // The guide foot is the exact interior junction of the south wall and
      // its adjacent side wall. Its elevation follows the reference rib's
      // curved spring-to-apex profile while its plan runs toward the arch.
      const foot = new THREE.Vector3(cornerX, sideTop, roofSouthZ);
      const profileStart = referenceGuideProfile[0];
      const profileEnd = referenceGuideProfile[referenceGuideProfile.length - 1];
      const profileSpan = Math.max(0.000001, profileEnd.x - profileStart.x);
      const guidePoints = referenceGuideProfile.map((profilePoint) => {
        const progress = THREE.MathUtils.clamp((profilePoint.x - profileStart.x) / profileSpan, 0, 1);
        return new THREE.Vector3(
          THREE.MathUtils.lerp(foot.x, archApexPoint.x, progress),
          sideTop + (profilePoint.y - profileStart.y) * groupScale,
          THREE.MathUtils.lerp(foot.z, archApexPoint.z, progress),
        );
      });
      guidePoints[0].copy(foot);

      // Stop at the first visible rib encountered from the wall corner. The
      // endpoint is snapped to that rib's crown so the panel boundary closes
      // cleanly without extending the hidden guide through the full vault.
      let firstHit = null;
      for (let guideIndex = 0; guideIndex < guidePoints.length - 1 && !firstHit; guideIndex += 1) {
        const guideSegment = {
          a: guidePoints[guideIndex],
          b: guidePoints[guideIndex + 1],
          kind: 'guide',
        };
        for (const ribSegment of visibleRibSegments) {
          const crossing = segmentCrossing(guideSegment, ribSegment);
          if (!crossing) continue;
          const guideProgress = guideIndex + crossing.t;
          if (guideProgress <= 0.01) continue;
          if (firstHit && guideProgress >= firstHit.progress) continue;
          const point = guideSegment.a.clone().lerp(guideSegment.b, crossing.t);
          const ribPoint = ribSegment.a.clone().lerp(ribSegment.b, crossing.u);
          point.y = ribPoint.y;
          firstHit = { progress: guideProgress, guideIndex, point };
        }
      }
      if (!firstHit) return;

      // The reference profile above is only the search path. Rebuild the
      // actual fold as one restrained curve ending exactly on the first rib
      // crown. Previously only the last vertex was snapped down to the rib,
      // leaving the preceding guide vertex too high and creating a roof kink.
      const simpleGuidePoints = ribMatchedGuidePoints(
        foot,
        firstHit.point,
        `south-${cornerX < centerX ? 'west' : 'east'}`,
      );
      simpleGuidePoints[0].copy(foot);
      simpleGuidePoints[simpleGuidePoints.length - 1].copy(firstHit.point);
      const guideId = `south-corner:${cornerX < centerX ? 'west' : 'east'}`;
      for (let index = 0; index < simpleGuidePoints.length - 1; index += 1) {
        addRawSegment(simpleGuidePoints[index], simpleGuidePoints[index + 1], 'guide', guideId);
      }
      hiddenCornerGuideCount += 1;
    };
    // Only the two south corners retain intentional hidden guide ribs. North
    // perimeter cells are controlled directly by the wall's arch curve.
    addReferenceAlignedCornerGuide(roofWestX);
    addReferenceAlignedCornerGuide(roofEastX);
    group.userData.karbandiHiddenCornerGuideCount = hiddenCornerGuideCount;
    group.userData.karbandiCornerGuides = cornerGuideDiagnostics;
    group.userData.karbandiCornerGuideConstraint = 'hidden-rib-left-right-full-profile';

    const ribBandQuads = buildRibBandQuads(rawSegments);
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
    const wallContinuationMaterials = new Map();
    const wallContinuationMaterial = (side) => {
      if (!side || walls.karbandi.coverFinish !== 'bricks' || !walls.bricks.enabled) return roofMaterial;
      if (!wallContinuationMaterials.has(side)) {
        const material = brickMaterial(
          walls,
          side,
          side === 'east' || side === 'west' ? roofDepth : roofWidth,
          Math.max(...Object.values(wallHeights), sideTop),
          false,
          true,
          continuationBondPhase[side] || 0,
        );
        material.userData.isRoofWallContinuation = true;
        material.userData.wallContinuationSide = side;
        wallContinuationMaterials.set(side, material);
      }
      return wallContinuationMaterials.get(side);
    };
    // Rib seating and springing curves are design constraints, not clearance
    // hints. The visible soffit interpolates every graph boundary vertex.
    const panelBottomY = (node) => node.y;
    faces.forEach((topologyFace, faceIndex) => {
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
      const southCornerGuideCurve = boundaryCurves.find((curve) => (
        curve.kind === 'guide'
        && /^south-corner:(east|west)$/.test(String(curve.sourceId))
      ));
      const patch = buildStructuredWebPatch(boundaryCurves, {
        resolution: 8,
        courseWidth: ribDepth * groupScale,
      });
      if (!patch) return;
      const wallContinuationSide = patch.type === 'north-crown-sliced-inward-courses'
        ? null
        : wallSides.has('east')
          ? 'east'
          : wallSides.has('west')
            ? 'west'
            : wallSides.has('south')
              ? 'south'
              : wallSides.has('north')
                ? (topologyFace.centroid.x < centerX ? 'west' : 'east')
                : null;
      const patchCenter = patch.vertices.reduce((result, vertex) => ({
        x: result.x + vertex.x / patch.vertices.length,
        z: result.z + vertex.z / patch.vertices.length,
      }), { x: 0, z: 0 });
      const topVertices = patch.vertices.map((vertex, index) => {
        const bearing = bearingAtPoint(vertex.x, vertex.z);
        const normal = patch.normals[index];
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
        if (metadata?.kind !== 'rib-seat' || webOptions.ribEmbedTolerance <= 0) return;
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
          Math.max(ribWidth, ribDepth) * groupScale * 0.42,
          Math.max(
            webOptions.ribEmbedTolerance + webOptions.wallEmbedTolerance,
            Math.min(ribWidth, ribDepth) * groupScale * 0.18,
          ),
        );
        const lateralOverlap = startAtWall || endAtWall
          ? protectedFootOverlap
          : webOptions.ribEmbedTolerance;
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
        if (startAtWall || endAtWall) {
          ribFootFlangeCount += 1;
          ribFootClosureOverlap = Math.max(ribFootClosureOverlap, protectedFootOverlap);
        }
        const flangeStart = positions.length / 3;
        positions.push(
          startBottom.x, startBottom.y, startBottom.z,
          endBottom.x, endBottom.y, endBottom.z,
          startBottom.x + offsetX, startBottom.y, startBottom.z + offsetZ,
          endBottom.x + offsetX, endBottom.y, endBottom.z + offsetZ,
          startTop.x, startTop.y, startTop.z,
          endTop.x, endTop.y, endTop.z,
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
      if (wallContinuationSide) applyWallContinuationBrickUvs(geometry, wallContinuationSide);
      else applyWorldAlignedBrickUvs(geometry);
      if (patch.brickMapping === 'offset-rib-courses' && patch.masonryUvs?.length === patch.vertices.length) {
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
      const requiresNorthWallClip = wallSides.has('north');
      const usesOffsetCourseBrickMaterial = (
        walls.karbandi.coverFinish === 'bricks'
        && patch.brickMapping === 'offset-rib-courses'
        && (
          patch.type === 'north-crown-sliced-inward-courses'
          || (
            topologyFace.classification === 'InteriorCell'
            && boundaryCurves.length === 4
            && boundaryCurves.every((curve) => curve.kind === 'rib-seat')
          )
        )
      );
      const panelBaseMaterial = usesOffsetCourseBrickMaterial
        ? inwardCourseBrickMaterial
        : wallContinuationSide
          ? wallContinuationMaterial(wallContinuationSide)
          : roofMaterial;
      const panelMaterial = wallSides.size ? panelBaseMaterial.clone() : panelBaseMaterial;
      if (wallSides.size) {
        // The masonry remains physically embedded for bearing, while its
        // rendering is clipped to every selected inner wall face.
        const wallClippingPlanes = [];
        if (wallSides.has('north')) wallClippingPlanes.push(new THREE.Plane(new THREE.Vector3(0, 0, 1), -roofNorthZ));
        if (wallSides.has('south')) wallClippingPlanes.push(new THREE.Plane(new THREE.Vector3(0, 0, -1), roofSouthZ));
        if (wallSides.has('west')) wallClippingPlanes.push(new THREE.Plane(new THREE.Vector3(1, 0, 0), -roofWestX));
        if (wallSides.has('east')) wallClippingPlanes.push(new THREE.Plane(new THREE.Vector3(-1, 0, 0), roofEastX));
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
      panel.userData.karbandiRoofCurved = true;
      panel.userData.karbandiRoofWallBay = touchesWallRib;
      panel.userData.karbandiRoofCornerWithoutCenter = omitsCenterAtCorner;
      panel.userData.karbandiRoofRaisedCenter = false;
      panel.userData.webSurfaceSubdivision = 8;
      panel.userData.webCellClassification = topologyFace.classification;
      panel.userData.webSupportSides = topologyFace.supportSides;
      panel.userData.northWallClipped = requiresNorthWallClip;
      panel.userData.wallClippedSides = [...wallSides];
      panel.userData.webPatchSolver = patch.type;
      panel.userData.webPatchSurfaceVertexCount = patch.vertices.length;
      panel.userData.webPatchInvertedTriangleCount = patch.invertedTriangleCount;
      panel.userData.webInwardCourseCount = patch.courseCount ?? 0;
      panel.userData.webInwardCourseWidth = patch.courseWidth ?? null;
      panel.userData.webSmallCellFallback = patch.smallCellFallback === true;
      panel.userData.roofBrickMapping = wallContinuationSide
        ? 'wall-continuation'
        : (patch.brickMapping || 'world-aligned');
      panel.userData.wallContinuationSide = wallContinuationSide;
      panel.userData.wallContinuationPatternSide = wallContinuationSide;
      panel.userData.wallContinuationClippedByRibs = Boolean(wallContinuationSide);
      panel.userData.wallContinuationCourseAxis = wallContinuationSide ? 'world-y' : null;
      panel.userData.wallContinuationFollowsCornerGuide = Boolean(southCornerGuideCurve);
      panel.userData.wallContinuationMethod = wallContinuationSide ? 'bent-topology-patch' : null;
      panel.userData.southCornerGuideId = southCornerGuideCurve?.sourceId ?? null;
      panel.userData.southCornerGuideProfileConstraint = southCornerGuideCurve
        ? 'average-full-left-right-rib-bend-and-slope'
        : null;
      panel.userData.roofBrickHorizontalMortarOnly = usesOffsetCourseBrickMaterial;
      panel.userData.roofInfillBrickColor = usesOffsetCourseBrickMaterial ? webOptions.infillBrickColor : null;
      panel.userData.roofInfillBrickColor2 = usesOffsetCourseBrickMaterial ? webOptions.infillBrickColor2 : null;
      panel.userData.roofInfillBrickHeight = usesOffsetCourseBrickMaterial ? webOptions.infillBrickHeight : null;
      panel.userData.crownBoundaryVertexCount = patch.preservedBoundaryVertexCount ?? 0;
      panel.userData.crownCourseDistanceMode = patch.courseDistanceMode ?? null;
      panel.userData.crownSliceCount = patch.crownSliceCount ?? 0;
      panel.userData.webStartsAtWall = patch.wallStarted === true;
      panel.userData.springingTangent = webOptions.springingTangent;
      panel.userData.hiddenGuideBoundaryCount = boundaryCurves.filter((curve) => curve.kind === 'guide').length;
      panel.userData.wallRoofGuide = southCornerGuideCurve
          ? 'south-corner-curved-guide-rib'
        : wallSides.has('north')
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
  }
  return meshes;
}

export function buildWallSystem(building, value = {}) {
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
  const westExteriorX = westX - thickness;
  const eastExteriorX = eastX + thickness;
  const northExteriorZ = northZ - thickness;
  const southExteriorZ = southZ + thickness;
  const width = eastX - westX;
  const depth = southZ - northZ;
  const centerX = (westX + eastX) / 2;
  const centerZ = (northZ + southZ) / 2;
  const bondPhase = {
    north: 0,
    east: width,
    south: width + depth,
    west: width * 2 + depth,
  };
  const height = (side) => Math.max(0.05, Number(building.height) + walls.extraHeights[side]);
  const material = wallMaterial(walls);
  const meshes = [];
  const sideWallDepth = depth + thickness;
  const sideWallCenterZ = (northZ + southZ + thickness) / 2;
  const decorativeJointTrim = Math.max(0.01, Math.min(0.06, walls.bricks.mortar * 2 + 0.012, thickness * 0.16));
  const intersectionTrim = Math.max(thickness + decorativeJointTrim, thickness * 1.02);
  const sideNorthTrim = decorativeJointTrim;
  const sideSouthTrim = intersectionTrim;
  const eastDecorMin = -sideWallDepth / 2 + sideNorthTrim;
  const eastDecorMax = sideWallDepth / 2 - sideSouthTrim;
  const eastDecorDepth = Math.max(0.05, eastDecorMax - eastDecorMin);
  const westDecorMin = -sideWallDepth / 2 + sideSouthTrim;
  const westDecorMax = sideWallDepth / 2 - sideNorthTrim;
  const westDecorDepth = Math.max(0.05, westDecorMax - westDecorMin);

  if (!walls.openSides.includes('east')) {
    const mesh = box(
      thickness,
      height('east'),
      sideWallDepth,
      sideWallMaterials(walls, 'east', thickness, height('east'), sideWallDepth, bondPhase.east),
      [eastX + thickness / 2, height('east') / 2, sideWallCenterZ],
      'east',
    );
    group.add(mesh);
    meshes.push(mesh);
    const faceShape = rectangleShape(eastDecorMin, eastDecorMax, height('east'));
    addBrickFace(group, faceShape, 'east', eastDecorDepth, height('east'), [eastX - 0.015, 0, sideWallCenterZ], [0, -Math.PI / 2, 0], walls, bondPhase.east);
  }
  if (!walls.openSides.includes('west')) {
    const mesh = box(
      thickness,
      height('west'),
      sideWallDepth,
      sideWallMaterials(walls, 'west', thickness, height('west'), sideWallDepth, bondPhase.west),
      [westX - thickness / 2, height('west') / 2, sideWallCenterZ],
      'west',
    );
    group.add(mesh);
    meshes.push(mesh);
    const faceShape = rectangleShape(westDecorMin, westDecorMax, height('west'));
    addBrickFace(group, faceShape, 'west', westDecorDepth, height('west'), [westX + 0.015, 0, sideWallCenterZ], [0, Math.PI / 2, 0], walls, bondPhase.west);
  }

  const sideTop = Math.max(height('east'), height('west'));
  const archHalfSpan = Math.max(0.5, Math.min(width / 2, Number(building.openingWidth) / 2 || width * 0.32));
  const greenOffset = walls.pointedArch.greenOffset ?? archHalfSpan;
  const greenHeight = walls.pointedArch.greenHeight ?? Math.max(0, sideTop - archHalfSpan * 0.6);
  const archPoints = archCurve(
    centerX,
    archHalfSpan,
    sideTop,
    sideTop,
    greenOffset,
    greenHeight,
  );
  const archApex = archPoints.length
    ? Math.max(...archPoints.map((point) => point.y))
    : Math.max(sideTop + 0.2, Number(building.openingHeight) || sideTop + archHalfSpan);
  const ahangEnabled = walls.ahang.enabled && walls.pointedArch.enabled;
  const southBaseHeight = ahangEnabled ? Math.max(height('south'), sideTop) : height('south');
  const southWallHeight = ahangEnabled ? Math.max(southBaseHeight, archApex) : southBaseHeight;
  const southHoles = [];
  const openingRects = {};
  if (walls.southOpenings.door.enabled) {
    openingRects.door = openingRect(walls.southOpenings.door, centerX, width, southBaseHeight, 0);
  }
  if (walls.southOpenings.window.enabled) {
    const sill = Math.min(southBaseHeight - 0.3, walls.southOpenings.window.sillHeight);
    openingRects.window = openingRect(walls.southOpenings.window, centerX, width, southBaseHeight, sill);
    southHoles.push(rectangleHole(openingRects.window.left, sill, openingRects.window.right, openingRects.window.top));
  }
  const southShape = rectangleShapeWithDoorNotch(westX - thickness, eastX + thickness, southBaseHeight, openingRects.door, southHoles);
  if (!walls.openSides.includes('south')) {
    const mesh = extrudedShape(southShape, thickness, southZ, wallMaterial(walls, 'south', width + thickness * 2, southBaseHeight, true, bondPhase.south), 'south');
    group.add(mesh);
    meshes.push(mesh);
    const southDecorShape = rectangleShapeWithDoorNotch(westX, eastX, southBaseHeight, openingRects.door, southHoles);
    addBrickFace(group, southDecorShape, 'south', width, southBaseHeight, [0, 0, southZ - 0.015], [0, 0, 0], walls, bondPhase.south);
    if (ahangEnabled && archPoints.length) {
      const capShape = archCapShape(westX - thickness, eastX + thickness, southBaseHeight, archPoints);
      if (capShape) {
        const capMesh = extrudedShape(capShape, thickness, southZ, wallMaterial(walls, 'south', width + thickness * 2, southWallHeight, true, bondPhase.south), 'south_arch');
        capMesh.userData.isSouthArchCap = true;
        group.add(capMesh);
        meshes.push(capMesh);
      }
      const capDecorShape = archCapShape(westX, eastX, southBaseHeight, archPoints);
      if (capDecorShape) addBrickFace(group, capDecorShape, 'arch', width, southWallHeight, [0, 0, southZ - 0.015], [0, 0, 0], walls, bondPhase.south, 'south_arch');
    }
    const soldierHeight = Math.max(walls.bricks.brickHeight, walls.bricks.brickWidth);
    const southTrimZ = southZ - 0.008;
    if (openingRects.door) {
      addSolidBorder(
        group,
        'south',
        (openingRects.door.left + openingRects.door.right) / 2,
        openingRects.door.top + soldierHeight / 2,
        openingRects.door.width,
        soldierHeight,
        southTrimZ,
        walls,
        'horizontal',
      );
    }
    if (openingRects.window) {
      const center = (openingRects.window.left + openingRects.window.right) / 2;
      addSolidBorder(group, 'south', center, openingRects.window.top + soldierHeight / 2, openingRects.window.width, soldierHeight, southTrimZ, walls, 'horizontal');
      addSolidBorder(group, 'south', center, openingRects.window.bottom - soldierHeight / 2, openingRects.window.width, soldierHeight, southTrimZ, walls, 'horizontal');
    }
  }

  const northHeight = Math.max(
    height('north'),
    walls.northWall.minHeight || 0,
    walls.pointedArch.enabled ? archApex + walls.northWall.archTopExtension : 0,
  );
  const northLeft = westX - thickness - walls.northWall.outwardWidth;
  const northRight = eastX + thickness + walls.northWall.outwardWidth;
  const northOpeningLeft = centerX - archHalfSpan;
  const northOpeningRight = centerX + archHalfSpan;
  const northSections = walls.pointedArch.enabled
    ? northPortalSections(northLeft, northRight, northHeight, archPoints, centerX)
    : northRectangularPortalShapes(northLeft, northRight, northHeight, northOpeningLeft, northOpeningRight)
      .map((shape, index) => ({ shape, section: 'north_sides', mirror: index === 1 }));
  if (!walls.openSides.includes('north')) {
    const recessDepth = walls.northBoundary.enabled ? Math.min(thickness - 0.02, walls.northBoundary.depth) : 0;
    const outerFaceZ = northExteriorZ;
    const recessedFaceZ = outerFaceZ + recessDepth;
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
      const openingLeft = walls.pointedArch.enabled && archPoints.length
        ? Math.min(archPoints[0].x, archPoints[archPoints.length - 1].x)
        : northOpeningLeft;
      const openingRight = walls.pointedArch.enabled && archPoints.length
        ? Math.max(archPoints[0].x, archPoints[archPoints.length - 1].x)
        : northOpeningRight;
      const northRaisedArchMapping = walls.pointedArch.enabled && openingLeft != null && openingRight != null
        ? pointedArchBrickMapping(
          centerX,
          Math.max(0.01, Math.max(Math.abs(openingLeft - centerX), Math.abs(openingRight - centerX))),
          sideTop,
          sideTop,
          greenOffset,
          greenHeight,
          inset,
          northHeight - inset,
          inset,
          Math.max(0.01, (northRight - northLeft) / 2),
        )
        : null;
      const northSideHasImportedBond = walls.bricks.sideBonds.north_sides?.source === 'library';
      const northTopHasImportedBond = walls.bricks.sideBonds.north_top?.source === 'library';
      if (northSideHasImportedBond || northTopHasImportedBond) {
        const decorationSections = walls.pointedArch.enabled
          ? northRecessedDecorationSections(northLeft, northRight, northHeight, inset, archPoints, centerX)
          : northRectangularRecessedDecorationSections(northLeft, northRight, northHeight, inset, openingLeft, openingRight);
        decorationSections.forEach(({ shape: decorationShape, section: decorationSide, mirror: mirrorNorthBond }) => {
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
      addRaisedNorthPanel(group, meshes, northLeft, northLeft + inset, 0, northHeight, outerFaceZ, recessDepth, walls, bondPhase.north, 'vertical', northRaisedArchMapping);
      addRaisedNorthPanel(group, meshes, northRight - inset, northRight, 0, northHeight, outerFaceZ, recessDepth, walls, bondPhase.north, 'vertical', northRaisedArchMapping);
      if (openingLeft != null && openingRight != null) {
        addRaisedNorthPanel(group, meshes, northLeft, openingLeft, 0, inset, outerFaceZ, recessDepth, walls, bondPhase.north, 'horizontal', northRaisedArchMapping);
        addRaisedNorthPanel(group, meshes, openingRight, northRight, 0, inset, outerFaceZ, recessDepth, walls, bondPhase.north, 'horizontal', northRaisedArchMapping);
      } else {
        addRaisedNorthPanel(group, meshes, northLeft, northRight, 0, inset, outerFaceZ, recessDepth, walls, bondPhase.north, 'horizontal', northRaisedArchMapping);
      }
      if (openingLeft != null && openingRight != null) {
        const springHeight = Math.max(0, Math.min(archPoints[0].y, archPoints[archPoints.length - 1].y));
        if (walls.pointedArch.enabled) {
          addRaisedCurvedNorthBorderPanel(group, meshes, archPoints, centerX, inset, outerFaceZ, recessDepth, walls, bondPhase.north, northRaisedArchMapping);
          if (springHeight > inset + 0.02) {
            addRaisedNorthPanel(group, meshes, openingLeft - inset, openingLeft, 0, northHeight, outerFaceZ, recessDepth, walls, bondPhase.north, 'vertical', northRaisedArchMapping);
            addRaisedNorthPanel(group, meshes, openingRight, openingRight + inset, 0, northHeight, outerFaceZ, recessDepth, walls, bondPhase.north, 'vertical', northRaisedArchMapping);
          }
        } else if (northHeight > inset + 0.02) {
          addRaisedNorthPanel(group, meshes, openingLeft - inset, openingLeft, 0, northHeight, outerFaceZ, recessDepth, walls, bondPhase.north, 'vertical', northRaisedArchMapping);
          addRaisedNorthPanel(group, meshes, openingRight, openingRight + inset, 0, northHeight, outerFaceZ, recessDepth, walls, bondPhase.north, 'vertical', northRaisedArchMapping);
        }
      }
    }
  }

  if (ahangEnabled && !walls.openSides.includes('south')) {
    const band = thickness;
    const outer = archCurve(
      centerX,
      archHalfSpan + band,
      sideTop,
      sideTop,
      greenOffset,
      greenHeight,
    );
    const shape = new THREE.Shape();
    shape.moveTo(outer[0].x, outer[0].y);
    outer.slice(1).forEach((point) => shape.lineTo(point.x, point.y));
    [...archPoints].reverse().forEach((point) => shape.lineTo(point.x, point.y));
    shape.closePath();
    const archDepth = Math.max(thickness, southZ - northZ + thickness);
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: archDepth, steps: 1, bevelEnabled: false, curveSegments: 48 });
    geometry.translate(0, 0, northZ);
    geometry.computeVertexNormals();
    applyWorldAlignedBrickUvs(geometry);
    const mesh = new THREE.Mesh(geometry, wallMaterial(walls, 'south', archHalfSpan * 2 + band * 2, archApex + band, true, bondPhase.south));
    mesh.userData.wallSide = 'arch';
    mesh.userData.isPointedArch = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    meshes.push(mesh);
  }

  meshes.push(...addKarbandiVault(group, {
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
    northArchPoints: walls.pointedArch.enabled ? archPoints : [],
  }, walls));

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
  const curve = archCurve(centerX, halfSpan, sideTop, sideTop, greenOffset, greenHeight);
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
