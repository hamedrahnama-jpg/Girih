import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { ArrayBufferTarget, Muxer } from 'mp4-muxer';
import { buildWallSystem, normalizeWallSystem, wallArchHeightAtX } from './wall-system.js';
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
  { id: 'lower-walls', title: 'Lower vertical walls', detail: 'Raise north-left, west, south, east, and north-right walls together from the ground to the arch spring line.' },
  { id: 'south-arch-guide', title: 'South arch guide rib', detail: 'Place a narrow guide segment above the south wall.' },
  { id: 'north-arch-guide', title: 'North arch guide rib', detail: 'Place the matching narrow guide segment above the north wall.' },
  { id: 'arch-fill', title: 'Fill arch depth', detail: 'Fill between both guide ribs to complete the arch volume.' },
  { id: 'north-upper-wall', title: 'North upper wall', detail: 'Complete the north side walls and north top wall together, layer by layer.' },
  { id: 'muqarnas-tiers', title: 'Muqarnas tiers', detail: 'Place Muqarnas modules tier by tier after the arch structure is complete.' },
  { id: 'decorate-south', title: 'South wall decoration', detail: 'Apply imported bonding or Girih pattern to the south wall after structure is built.' },
  { id: 'decorate-east', title: 'East wall decoration', detail: 'Apply imported bonding or Girih pattern to the east wall.' },
  { id: 'decorate-west', title: 'West wall decoration', detail: 'Apply imported bonding or Girih pattern to the west wall.' },
  { id: 'decorate-north-sides', title: 'North side wall decoration', detail: 'Apply imported bonding or Girih pattern to the left and right north side walls.' },
  { id: 'decorate-north-top', title: 'North top wall decoration', detail: 'Apply imported bonding or Girih pattern to the north wall section above the arch.' },
  { id: 'decorate-arch', title: 'Arch decoration', detail: 'Apply imported bonding or Girih pattern to the arch surface.' },
  { id: 'complete', title: 'Complete training model', detail: 'Show the finished wall, arch, Muqarnas, and library decorations.' },
]);

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

const DEFAULT_BUILDING = Object.freeze({
  type: 'iwan',
  width: 4,
  depth: 2,
  height: 6,
  wallThickness: 0.35,
  openingWidth: 4,
  wallColor: '#d8b678',
  groundColor: '#f4e7c2',
});

export function normalizeBuilding(value = {}) {
  const normalized = {
    ...DEFAULT_BUILDING,
    ...value,
    width: Math.max(2, Math.min(30, Number(value.width) || DEFAULT_BUILDING.width)),
    depth: Math.max(2, Math.min(30, Number(value.depth) || DEFAULT_BUILDING.depth)),
    height: Math.max(2, Math.min(20, Number(value.height) || DEFAULT_BUILDING.height)),
    wallThickness: Math.max(0.1, Math.min(1.5, Number(value.wallThickness) || DEFAULT_BUILDING.wallThickness)),
    openingWidth: Math.max(1, Math.min(20, Number(value.openingWidth) || DEFAULT_BUILDING.openingWidth)),
  };
  if (normalized.type === 'iwan') normalized.openingWidth = normalized.width;
  return normalized;
}

export function buildingSurfaces(building) {
  const surfaces = [
    { id: 'north_interior', label: 'North interior wall', kind: 'wall' },
    { id: 'east_interior', label: 'East interior wall', kind: 'wall' },
    { id: 'west_interior', label: 'West interior wall', kind: 'wall' },
    { id: 'floor', label: 'Floor', kind: 'floor' },
  ];
  if (building.type === 'room') surfaces.push({ id: 'south_interior', label: 'South interior wall', kind: 'wall' });
  else surfaces.push({ id: 'south_facade', label: 'South portal facade', kind: 'wall' });
  return surfaces;
}

export function surfaceIdForWallSide(side, building) {
  const normalized = side === 'arch' || side === 'south_arch' ? 'south' : side;
  if (normalized === 'north_sides' || normalized === 'north_top') return 'north_interior';
  if (normalized === 'north') return 'north_interior';
  if (normalized === 'east') return 'east_interior';
  if (normalized === 'west') return 'west_interior';
  if (normalized === 'south') return normalizeBuilding(building).type === 'room' ? 'south_interior' : 'south_facade';
  return null;
}

export function wallSideForSurfaceId(surfaceId) {
  if (surfaceId === 'north_interior') return 'north_sides';
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

function vaultExtensionGeometry(bounds, leftTop, rightTop, bottom) {
  const { min, max } = bounds;
  const vertices = new Float32Array([
    min.x, bottom, min.z,
    max.x, bottom, min.z,
    max.x, bottom, max.z,
    min.x, bottom, max.z,
    min.x, leftTop, min.z,
    max.x, rightTop, min.z,
    max.x, rightTop, max.z,
    min.x, leftTop, max.z,
  ]);
  const indices = [
    0, 2, 1, 0, 3, 2,
    4, 5, 6, 4, 6, 7,
    0, 1, 5, 0, 5, 4,
    1, 2, 6, 1, 6, 5,
    2, 3, 7, 2, 7, 6,
    3, 0, 4, 3, 4, 7,
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
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

function sampleCircularArc(center, radius, startAngle, endAngle, segments) {
  let delta = endAngle - startAngle;
  while (delta <= -Math.PI) delta += Math.PI * 2;
  while (delta > Math.PI) delta -= Math.PI * 2;
  return Array.from({ length: segments + 1 }, (_, index) => {
    const angle = startAngle + delta * (index / segments);
    return new THREE.Vector2(center.x + Math.cos(angle) * radius, center.y + Math.sin(angle) * radius);
  });
}

function northArchCurve(centerX, halfSpan, sideHeight, redHeight, greenOffset, greenHeight, count = 36) {
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
  const northDecorativeFaceZ = northOuterFaceZ + northRecessDepth - 0.045;
  if (surfaceId === 'north_interior') return {
    axis: 'x',
    min: westX - thickness - (walls.northWall?.outwardWidth || 0),
    max: eastX + thickness + (walls.northWall?.outwardWidth || 0),
    height: wallHeight('north'),
    position: [0, 0, northDecorativeFaceZ],
    rotationY: 0,
  };
  if (surfaceId === 'east_interior') return {
    axis: 'z',
    min: sideWallCenterZ - sideWallDepth / 2,
    max: sideWallCenterZ + sideWallDepth / 2,
    height: heightFor('east'),
    position: [eastX - 0.045, 0, 0],
    rotationY: -90,
  };
  if (surfaceId === 'west_interior') return {
    axis: 'z',
    min: sideWallCenterZ - sideWallDepth / 2,
    max: sideWallCenterZ + sideWallDepth / 2,
    height: heightFor('west'),
    position: [westX + 0.045, 0, 0],
    rotationY: 90,
  };
  if (surfaceId === 'south_interior') return {
    axis: 'x',
    min: westX - thickness,
    max: eastX + thickness,
    height: heightFor('south'),
    position: [0, 0, southZ - 0.045],
    rotationY: 180,
  };
  if (surfaceId === 'south_facade') return {
    axis: 'x',
    min: westX - thickness,
    max: eastX + thickness,
    height: heightFor('south'),
    position: [0, 0, southZ - 0.045],
    rotationY: 0,
  };
  return {
    axis: 'floor',
    minX: westX,
    maxX: eastX,
    minZ: northZ,
    maxZ: southZ,
    height: b.height,
    position: [0, 0.12, 0],
    rotationY: 0,
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
  const surfaceId = zone?.surfaceId || 'north_interior';
  const halfWidth = Math.max(1, Number(b.width) / 2);
  const halfDepth = Math.max(1, Number(b.depth) / 2);
  const westX = -halfWidth - walls.sideOffsets.west;
  const eastX = halfWidth + walls.sideOffsets.east;
  const northZ = -halfDepth - walls.sideOffsets.north;
  const southZ = halfDepth + walls.sideOffsets.south;
  if (surfaceId === 'north_interior') return { position: [bounds.u, bounds.v, northZ + 0.055], rotation: [0, 0, 0], bounds };
  if (surfaceId === 'east_interior') return { position: [eastX - 0.055, bounds.v, bounds.u], rotation: [0, -90, 0], bounds };
  if (surfaceId === 'west_interior') return { position: [westX + 0.055, bounds.v, bounds.u], rotation: [0, 90, 0], bounds };
  if (surfaceId === 'south_interior') return { position: [bounds.u, bounds.v, southZ - 0.055], rotation: [0, 180, 0], bounds };
  if (surfaceId === 'south_facade') return { position: [bounds.u, bounds.v, southZ - 0.055], rotation: [0, 180, 0], bounds };
  return { position: [bounds.u, 0.025, bounds.v], rotation: [-90, 0, 0], bounds };
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

export class MehrazScene {
  constructor(container, callbacks = {}) {
    this.container = container;
    this.callbacks = callbacks;
    this.building = normalizeBuilding();
    this.walls = normalizeWallSystem({}, this.building);
    this.stageRenderMode = 'textured';
    this.nightLights = [];
    this.selectedNightLightId = null;
    this.nightPreview = false;
    this.nightLightGuidesVisible = false;
    this.nightLightObjects = new Map();
    this.nightLightDrag = null;
    this.constructionStepIndex = CONSTRUCTION_STEPS.length - 1;
    this.constructionTimer = null;
    this.constructionAnimationFrame = null;
    this.placements = [];
    this.zones = [];
    this.selectedId = null;
    this.selectedZoneId = null;
    this.selectedWallSide = null;
    this.selectedKarbandiRibIndex = null;
    this.wallSurfaceHighlight = null;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#cfe7f2');
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.05, 160);
    // Look at the iwan from the portal/front side by default.  Keep the model
    // coordinates unchanged so north/south wall logic, library placements, and
    // saved projects remain stable.
    this.camera.position.set(-11, 8, -13);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
    this.transformControls = new TransformControls(this.camera, this.renderer.domElement);
    this.transformControls.setMode('translate');
    this.transformControls.setSize(0.78);
    this.transformHelper = this.transformControls.getHelper();
    this.scene.add(this.transformHelper);
    this.transformControls.addEventListener('dragging-changed', (event) => {
      this.controls.enabled = !event.value;
    });
    this.transformControls.addEventListener('mouseUp', () => {
      const object = this.transformControls.object;
      if (!object?.userData?.placementId) return;
      this.callbacks.onTransform?.(object.userData.placementId, {
        position: object.position.toArray(),
        rotation: [
          THREE.MathUtils.radToDeg(object.rotation.x),
          THREE.MathUtils.radToDeg(object.rotation.y),
          THREE.MathUtils.radToDeg(object.rotation.z),
        ],
        scale: object.scale.toArray(),
      });
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
    sun.shadow.mapSize.set(4096, 4096);
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
    this.nightLightGroup = new THREE.Group();
    this.nightLightGroup.name = 'Night spotlight placement guides';
    this.scene.add(this.buildingGroup, this.archInfillGroup, this.constructionGuideGroup, this.zoneDecorationGroup, this.zoneGroup, this.placementGroup, this.placementMaskGroup, this.nightLightGroup);
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.onPointerDown = this.onPointerDown.bind(this);
    this.onContextMenu = this.onContextMenu.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown);
    this.renderer.domElement.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.rebuildBuilding();
    this.resize();
    this.animate();
  }

  setBuilding(building) {
    this.building = normalizeBuilding(building);
    this.walls = normalizeWallSystem(this.walls, this.building);
    this.rebuildBuilding();
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
      if (!child.isMesh) return;
      const oldMaterials = Array.isArray(child.material) ? child.material : [child.material];
      const side = oldMaterials[0]?.side ?? THREE.DoubleSide;
      child.material = new THREE.MeshStandardMaterial({
        color: this.walls.color,
        roughness: 0.86,
        metalness: 0,
        side,
        transparent: false,
        opacity: 1,
        depthWrite: true,
        depthTest: true,
      });
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
    const depth = Math.max(0.001, box.max.z - box.min.z);
    const guideDepth = Math.min(0.22, depth * 0.18);
    const start = end === 'south' ? box.max.z - guideDepth : box.min.z;
    const targetEnd = end === 'south' ? box.max.z : box.min.z + guideDepth;
    guide.scale.z *= Math.max(0.001, guideDepth / depth);
    guide.position.z += start - box.min.z * Math.max(0.001, guideDepth / depth);
    if (end === 'south') guide.position.z += targetEnd - (box.max.z * Math.max(0.001, guideDepth / depth) + guide.position.z - (archMesh.position.z || 0));
    guide.castShadow = true;
    guide.receiveShadow = true;
    guide.userData.isConstructionGuide = true;
    return guide;
  }

  restoreConstructionMaterials() {
    const restoreMesh = (child) => {
      if (!child.isMesh || !child.userData?.constructionOriginalMaterial) return;
      const currentMaterials = Array.isArray(child.material) ? child.material : [child.material];
      child.material = child.userData.constructionOriginalMaterial;
      currentMaterials.filter(Boolean).forEach((material) => {
        if (material !== child.userData.constructionOriginalMaterial) material.dispose?.();
      });
      delete child.userData.constructionOriginalMaterial;
    };
    this.wallSystemRoot()?.traverse(restoreMesh);
    this.archInfillGroup.traverse(restoreMesh);
    this.placementGroup.traverse(restoreMesh);
    this.placementMaskGroup.traverse(restoreMesh);
  }

  prepareConstructionMaterial(child) {
    if (!child.isMesh || !child.material) return [];
    if (!child.userData.constructionOriginalMaterial) {
      const original = child.material;
      const materials = Array.isArray(original) ? original : [original];
      child.userData.constructionOriginalMaterial = original;
      child.material = Array.isArray(original)
        ? materials.map((material) => material.clone())
        : materials[0].clone();
    }
    return Array.isArray(child.material) ? child.material : [child.material];
  }

  setConstructionClip(child, progress = 1, axis = 'y', minValue = 0, maxValue = null) {
    const materials = this.prepareConstructionMaterial(child);
    if (!materials.length) return;
    child.visible = progress > 0.001;
    const box = new THREE.Box3().setFromObject(child);
    const start = Number.isFinite(minValue) ? minValue : (axis === 'z' ? box.min.z : box.min.y);
    const end = Number.isFinite(maxValue) ? maxValue : (axis === 'z' ? box.max.z : box.max.y);
    const brickStep = Math.max(0.01, Number(this.walls.bricks?.brickHeight || 0.08) + Number(this.walls.bricks?.mortar || 0.01));
    const steppedProgress = Math.min(1, Math.max(0, Math.ceil(progress * Math.max(1, Math.ceil(Math.abs(end - start) / brickStep))) / Math.max(1, Math.ceil(Math.abs(end - start) / brickStep))));
    const limit = start + (end - start) * steppedProgress;
    const plane = axis === 'z'
      ? new THREE.Plane(new THREE.Vector3(0, 0, end >= start ? -1 : 1), end >= start ? limit : -limit)
      : new THREE.Plane(new THREE.Vector3(0, -1, 0), limit);
    materials.forEach((material) => {
      material.clippingPlanes = [plane];
      material.clipIntersection = false;
      material.needsUpdate = true;
    });
  }

  clearConstructionClip(child) {
    if (!child.isMesh) return;
    const materials = this.prepareConstructionMaterial(child);
    materials.forEach((material) => {
      material.clippingPlanes = null;
      material.needsUpdate = true;
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
    return {
      centerX,
      openingLeft: centerX - archHalfSpan,
      openingRight: centerX + archHalfSpan,
      sideTop,
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

  applyNorthUpperConstruction(child, progress, metrics) {
    if (!child.isObject3D) return;
    const side = child.userData?.wallSide;
    if (!['north', 'north_sides', 'north_top'].includes(side)) return;
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
    const decorationStepId = WALL_DECORATION_STEP[child.userData?.wallSide];
    const decorationRank = CONSTRUCTION_STEP_INDEX[decorationStepId];
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
      if (root.userData?.assetType === 'muqarnas_assembly') {
        this.applyMuqarnasConstruction(root, stepId, rank, progress);
        return;
      }
      const decorationStepId = SURFACE_DECORATION_STEP[root.userData?.surfaceId];
      const decorationRank = CONSTRUCTION_STEP_INDEX[decorationStepId];
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
    const muqarnasRank = CONSTRUCTION_STEP_INDEX['muqarnas-tiers'];
    if (!Number.isFinite(muqarnasRank)) {
      root.visible = false;
      return;
    }
    const isCurrentStep = stepId === 'muqarnas-tiers';
    root.visible = rank >= muqarnasRank && (!isCurrentStep || progress > 0.001);
    if (!root.visible) return;
    const modules = root.children.filter((child) => child.isObject3D);
    if (!modules.length) return;
    const tiers = [...new Set(modules.map((module) => {
      const box = new THREE.Box3().setFromObject(module);
      if (box.isEmpty()) return 0;
      return Number(((box.min.y + box.max.y) / 2).toFixed(3));
    }))].sort((a, b) => a - b);
    const visibleTierCount = isCurrentStep
      ? Math.max(0, Math.ceil(Math.max(0, Math.min(1, progress)) * tiers.length))
      : tiers.length;
    const visibleTierSet = new Set(tiers.slice(0, visibleTierCount));
    modules.forEach((module) => {
      const box = new THREE.Box3().setFromObject(module);
      const tier = box.isEmpty() ? 0 : Number(((box.min.y + box.max.y) / 2).toFixed(3));
      module.visible = visibleTierSet.has(tier);
    });
  }

  applyConstructionStep(stepIndex = CONSTRUCTION_STEPS.length - 1, progress = 1) {
    this.constructionStepIndex = Math.max(0, Math.min(CONSTRUCTION_STEPS.length - 1, Math.round(stepIndex)));
    this.clearConstructionGuides();
    const stepId = CONSTRUCTION_STEPS[this.constructionStepIndex]?.id || 'complete';
    const rank = this.constructionStepIndex;
    const wallSystem = this.wallSystemRoot();
    const stepProgress = Math.max(0, Math.min(1, progress));
    const northMetrics = this.northOpeningMetrics();
    const showLowerWalls = rank >= 1;
    const showArch = rank >= 4;
    const showNorthUpper = rank >= 5;
    const showEverything = rank >= CONSTRUCTION_STEP_INDEX.complete;
    wallSystem?.traverse((child) => {
      if (!child.isObject3D) return;
      const side = child.userData?.wallSide;
      if (child.userData?.isBrickFace) {
        this.applyConstructionDecoration(child, stepId, rank, stepProgress);
        return;
      }
      const isArch = child.userData?.isPointedArch || side === 'arch' || side === 'south_arch' || child.userData?.isSouthArchCap;
      if (isArch) {
        child.visible = showArch || showEverything;
        if (child.isMesh && child.userData?.isSouthArchCap && stepId === 'arch-fill') {
          const box = new THREE.Box3().setFromObject(child);
          this.setConstructionClip(child, stepProgress, 'y', Math.max(0, box.min.y), box.max.y);
        } else if (child.isMesh && (stepId === 'arch-fill' || (showEverything && stepProgress < 1))) {
          const box = new THREE.Box3().setFromObject(child);
          this.setConstructionClip(child, stepId === 'arch-fill' ? stepProgress : 1, 'z', box.max.z, box.min.z);
        } else if (child.isMesh && child.visible) {
          this.clearConstructionClip(child);
        }
        return;
      }
      if (stepId === 'lower-walls') {
        this.applyLowerWallConstruction(child, stepProgress, northMetrics);
      } else if (stepId === 'north-upper-wall') {
        if (['east', 'west', 'south'].includes(side)) {
          child.visible = showLowerWalls;
          if (child.isMesh && child.visible) this.clearConstructionClip(child);
        } else {
          this.applyNorthUpperConstruction(child, stepProgress, northMetrics);
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
    this.zoneDecorationGroup.visible = showEverything || rank >= CONSTRUCTION_STEP_INDEX['decorate-south'];
    if (rank >= 2 && rank <= 4) {
      const archMesh = [];
      wallSystem?.traverse((child) => {
        if (child.isMesh && (child.userData?.isPointedArch || child.userData?.wallSide === 'arch')) archMesh.push(child);
      });
      const source = archMesh[0];
      if (source) {
        this.constructionGuideGroup.add(this.makeArchGuideClone(source, 'south'));
        if (rank >= 3) this.constructionGuideGroup.add(this.makeArchGuideClone(source, 'north'));
      }
    }
    this.constructionGuideGroup.visible = true;
    this.updateWallSurfaceHighlight();
  }

  playConstructionSequence(duration = 15, onStep = null, onDone = null) {
    if (this.constructionTimer) clearTimeout(this.constructionTimer);
    if (this.constructionAnimationFrame) cancelAnimationFrame(this.constructionAnimationFrame);
    this.restoreConstructionMaterials();
    const total = CONSTRUCTION_STEPS.length;
    const perStep = Math.max(350, (Math.max(3, finite(duration, 15)) * 1000) / total);
    let index = 0;
    const animateStep = () => {
      const stepStartedAt = performance.now();
      const stepId = CONSTRUCTION_STEPS[index]?.id || 'complete';
      onStep?.(index);
      const tick = (now) => {
        const elapsed = now - stepStartedAt;
        const rawProgress = Math.max(0, Math.min(1, elapsed / perStep));
        const easedProgress = rawProgress < 0.5
          ? 2 * rawProgress * rawProgress
          : 1 - ((-2 * rawProgress + 2) ** 2) / 2;
        const buildProgress = ['lower-walls', 'arch-fill', 'north-upper-wall', 'muqarnas-tiers', 'decorate-south', 'decorate-east', 'decorate-west', 'decorate-north-sides', 'decorate-north-top', 'decorate-arch', 'complete'].includes(stepId)
          ? easedProgress
          : 1;
        this.applyConstructionStep(index, buildProgress);
        if (rawProgress < 1) {
          this.constructionAnimationFrame = requestAnimationFrame(tick);
          return;
        }
        index += 1;
        if (index >= total) {
          this.constructionAnimationFrame = null;
          this.constructionTimer = null;
          this.applyConstructionStep(CONSTRUCTION_STEPS.length - 1, 1);
          this.restoreConstructionMaterials();
          onDone?.();
          return;
        }
        this.constructionTimer = setTimeout(animateStep, 80);
      };
      this.constructionAnimationFrame = requestAnimationFrame(tick);
    };
    animateStep();
  }

  stopConstructionSequence() {
    if (this.constructionTimer) clearTimeout(this.constructionTimer);
    this.constructionTimer = null;
    if (this.constructionAnimationFrame) cancelAnimationFrame(this.constructionAnimationFrame);
    this.constructionAnimationFrame = null;
    this.restoreConstructionMaterials();
  }

  applyStageAppearance() {
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
    [this.archInfillGroup, this.placementGroup].forEach((root) => {
      root?.traverse((child) => {
        applyMesh(child);
      });
    });
  }

  setSelectedWallSide(side) {
    const normalized = side === 'arch' ? 'south_arch' : side === 'north' ? 'north_sides' : side;
    this.selectedWallSide = ['north', 'north_sides', 'north_top', 'east', 'south', 'west', 'south_arch'].includes(normalized) ? normalized : null;
    this.selectedKarbandiRibIndex = null;
    this.updateKarbandiReferenceHighlight();
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
      makePortal(walls.southOpenings.door, 0, 'door'),
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
    if (wallGroup?.visible) bounds.expandByObject(wallGroup);
    if (this.archInfillGroup.children.length) bounds.expandByObject(this.archInfillGroup);
    if (this.zoneDecorationGroup.children.length) bounds.expandByObject(this.zoneDecorationGroup);
    if (this.placementGroup.children.length) bounds.expandByObject(this.placementGroup);
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
    if (this.grid) this.grid.visible = !this.nightPreview;
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
    const next = ['translate', 'rotate', 'scale'].includes(mode) ? mode : 'translate';
    this.transformControls.setMode(next);
  }

  setZones(zones) {
    this.zones = Array.isArray(zones) ? zones : [];
    this.clearGroup(this.zoneGroup);
    this.clearGroup(this.zoneDecorationGroup);
    this.zones.forEach((zone) => {
      const world = zoneWorldTransform(zone, this.building, this.walls);
      const rotation = world.rotation.map(THREE.MathUtils.degToRad);
      const pattern = zonePatternTexture(zone);
      if (pattern) {
        const scale = Math.min(1, world.bounds.width / pattern.unitWidth, world.bounds.height / pattern.unitHeight);
        const tileWidth = Math.max(0.001, pattern.unitWidth * scale);
        const tileHeight = Math.max(0.001, pattern.unitHeight * scale);
        pattern.texture.repeat.set(world.bounds.width / tileWidth, world.bounds.height / tileHeight);
        const patternMaterial = new THREE.MeshStandardMaterial({
          map: pattern.texture,
          color: '#ffffff',
          roughness: 0.84,
          metalness: 0,
          transparent: false,
          alphaTest: zone.assetType === 'girih_pattern' ? 0.01 : 0,
          depthWrite: false,
          depthTest: true,
          side: THREE.FrontSide,
          forceSinglePass: true,
          polygonOffset: true,
          polygonOffsetFactor: -64,
          polygonOffsetUnits: -64,
        });
        patternMaterial.userData.isZoneDecoration = true;
        const decoration = new THREE.Mesh(new THREE.PlaneGeometry(world.bounds.width, world.bounds.height), patternMaterial);
        decoration.position.fromArray(world.position);
        decoration.rotation.set(...rotation);
        const normal = new THREE.Vector3(0, 0, 1).applyEuler(decoration.rotation).normalize();
        decoration.position.addScaledVector(normal, 0.055);
        decoration.renderOrder = 35;
        decoration.userData.zoneId = zone.id;
        decoration.userData.isZoneDecoration = true;
        decoration.userData.assetType = zone.assetType;
        decoration.userData.surfaceId = zone.surfaceId;
        decoration.castShadow = false;
        decoration.receiveShadow = true;
        this.zoneDecorationGroup.add(decoration);
      }
      const material = new THREE.MeshBasicMaterial({
        color: zone.color || '#2f7d86',
        transparent: true,
        opacity: Math.max(0.04, Math.min(0.5, finite(zone.opacity, 0.14))),
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(world.bounds.width, world.bounds.height), material);
      panel.position.fromArray(world.position);
      panel.rotation.set(...rotation);
      panel.renderOrder = 2;
      panel.userData.zoneId = zone.id;
      const edge = new THREE.LineSegments(
        new THREE.EdgesGeometry(panel.geometry),
        new THREE.LineDashedMaterial({
          color: zone.color || '#2f7d86',
          dashSize: 0.12,
          gapSize: 0.08,
          depthTest: false,
        }),
      );
      edge.computeLineDistances();
      edge.renderOrder = 3;
      edge.userData.zoneId = zone.id;
      panel.add(edge);
      this.zoneGroup.add(panel);
    });
    this.updateSelectionOutline();
  }

  rebuildBuilding() {
    this.clearGroup(this.buildingGroup);
    const b = this.building;
    const floorMaterial = makeMaterial(b.groundColor, 0.86);
    this.groundMesh = box(40, 0.12, 40, floorMaterial, [0, -0.08, 0]);
    this.buildingGroup.add(this.groundMesh);
    const wallSystem = buildWallSystem(b, this.walls);
    if (this.stageRenderMode === 'flat') this.applyPureSolidWallMaterials(wallSystem);
    this.buildingGroup.add(wallSystem);
    const grid = new THREE.GridHelper(40, 40, '#ad9d72', '#d5c79f');
    grid.position.y = 0.001;
    grid.material.transparent = true;
    grid.material.opacity = 0.34;
    this.grid = grid;
    grid.visible = !this.nightPreview;
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
  }

  rebuildArchInfills() {
    this.clearGroup(this.archInfillGroup);
    if (!this.walls.enabled || !this.walls.ahang.enabled || !this.walls.pointedArch.enabled || !this.walls.pointedArch.moduleInfill) return;
    this.placementGroup.children.forEach((root) => {
      if (root.userData.assetType !== 'muqarnas_assembly' || root.userData.surfaceId !== 'floor') return;
      root.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(root);
      if (bounds.isEmpty()) return;
      const leftTop = wallArchHeightAtX(this.building, this.walls, bounds.min.x);
      const rightTop = wallArchHeightAtX(this.building, this.walls, bounds.max.x);
      if (leftTop == null || rightTop == null) return;
      const targetBottom = bounds.max.y;
      if (Math.min(leftTop, rightTop) <= targetBottom + 0.01) return;
      const overlap = Math.max(0, this.walls.pointedArch.overlap) * Math.max(0.01, Math.min(leftTop, rightTop) - targetBottom);
      const sourceMesh = root.getObjectByProperty('isMesh', true);
      const sourceMaterial = Array.isArray(sourceMesh?.material) ? sourceMesh.material[0] : sourceMesh?.material;
      const material = sourceMaterial?.clone?.() || makeMaterial('#d0a21f', 0.55);
      material.side = THREE.DoubleSide;
      const extension = new THREE.Mesh(
        vaultExtensionGeometry(bounds, leftTop, rightTop, targetBottom - overlap),
        material,
      );
      extension.castShadow = this.walls.shadows;
      extension.receiveShadow = this.walls.shadows;
      extension.userData.isArchModuleInfill = true;
      extension.userData.placementId = root.userData.placementId;
      this.archInfillGroup.add(extension);
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
      ? northArchCurve((westX + eastX) / 2, archHalfSpan, sideTop, sideTop, greenOffset, greenHeight)
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
  }

  select(id) {
    this.selectedId = id || null;
    if (id) {
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

  selectWallSide(side, emit = true) {
    const normalized = side === 'arch' ? 'south_arch' : side === 'north' ? 'north_sides' : side;
    if (!['north', 'north_sides', 'north_top', 'east', 'south', 'west', 'south_arch'].includes(normalized)) return;
    this.selectedWallSide = normalized;
    this.selectedKarbandiRibIndex = null;
    this.selectedId = null;
    this.selectedZoneId = null;
    this.clearNightLightSelection();
    this.updateSelectionOutline();
    this.updateKarbandiReferenceHighlight();
    this.updateWallSurfaceHighlight();
    if (emit) {
      this.callbacks.onWallSurfaceSelection?.({
        side: normalized,
        surfaceId: surfaceIdForWallSide(normalized, this.building),
      });
    }
  }

  clearSelection() {
    this.selectedId = null;
    this.selectedZoneId = null;
    this.selectedWallSide = null;
    this.selectedKarbandiRibIndex = null;
    this.clearNightLightSelection();
    this.updateSelectionOutline();
    this.updateKarbandiReferenceHighlight();
    this.updateWallSurfaceHighlight();
    this.callbacks.onSelection?.(null);
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
    this.clearNightLightSelection();
    this.updateSelectionOutline();
    this.updateWallSurfaceHighlight();
    this.updateKarbandiReferenceHighlight();
  }

  updateKarbandiReferenceHighlight() {
    const wallSystem = this.buildingGroup?.children.find((child) => child.userData?.wallSystem);
    wallSystem?.traverse((child) => {
      if (child.userData?.isKarbandiReferenceHighlight) {
        child.visible = this.selectedKarbandiRibIndex === 0;
      }
    });
  }

  updateWallSurfaceHighlight() {
    this.clearWallSurfaceHighlight();
    const openSide = this.selectedWallSide === 'south_arch' ? 'south' : this.selectedWallSide?.startsWith('north_') ? 'north' : this.selectedWallSide;
    if (!this.selectedWallSide || !this.walls.enabled || this.walls.openSides.includes(openSide)) return;
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
    wallSystem.traverse((child) => {
      if (!child.isMesh || !child.geometry) return;
      const wallSide = child.userData?.wallSide === 'arch' ? 'south_arch' : child.userData?.wallSide;
      if (wallSide !== selectedSide) return;
      if (child.userData?.isWallEdgeLine) return;
      // Clicking the Karbandi roof must not select every generic arch mesh.
      // Limit this highlight to the cover and its actual rib network.
      if (selectingKarbandiCover && !child.userData?.isKarbandiCover && !child.userData?.isKarbandi) return;
      const sourceMaterial = Array.isArray(child.material) ? child.material[0] : child.material;
      const hasClipping = Boolean(sourceMaterial?.clippingPlanes?.length);
      const meshHighlightMaterial = hasClipping ? highlightMaterial.clone() : highlightMaterial;
      if (hasClipping) {
        meshHighlightMaterial.clippingPlanes = sourceMaterial.clippingPlanes;
        meshHighlightMaterial.clipIntersection = sourceMaterial.clipIntersection === true;
        meshHighlightMaterial.needsUpdate = true;
      }
      const highlight = new THREE.Mesh(child.geometry.clone(), meshHighlightMaterial);
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
    if (this.selectionOutline) {
      this.scene.remove(this.selectionOutline);
      this.selectionOutline.geometry?.dispose();
      this.selectionOutline.material?.dispose();
      this.selectionOutline = null;
    }
    this.transformControls.detach();
    const selected = this.placementGroup.children.find((child) => child.userData.placementId === this.selectedId);
    const selectedZone = this.zoneGroup.children.find((child) => child.userData.zoneId === this.selectedZoneId);
    const target = selected || selectedZone;
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
      this.selectionOutline = new THREE.BoxHelper(target, selected ? '#ffe252' : '#2f7d86');
    }
    this.selectionOutline.material.depthTest = false;
    this.selectionOutline.renderOrder = 20;
    this.scene.add(this.selectionOutline);
    if (selected) this.transformControls.attach(selected);
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
      this.camera.position.set(target.x - radius * 1.15, target.y + radius * 0.78, target.z - radius * 1.25);
    }
    this.camera.lookAt(target);
    this.camera.updateProjectionMatrix();
    this.controls.update();
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
        if (!child.isMesh || child === this.groundMesh || child.userData.isBrickFace || child.userData.isSoldierCourse) return;
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
    } else if (settings.seamless) {
      addEdges(this.buildingGroup, settings.wallEdgeColor || this.walls.edges.color, settings.seamlessWallEdges === true);
      addEdges(this.placementGroup, settings.moduleEdgeColor || '#ffffff', settings.seamlessEdges === true);
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
    restoreAppearance();
    return dataUrl;
  }

  createExportModelRoot() {
    const root = new THREE.Group();
    const walls = this.buildingGroup.children.find((child) => child.userData?.wallSystem);
    if (walls?.visible) root.add(walls.clone(true));
    root.add(this.archInfillGroup.clone(true), this.zoneDecorationGroup.clone(true), this.placementGroup.clone(true));
    root.updateMatrixWorld(true);
    return root;
  }

  exportStlBlob() {
    const data = new STLExporter().parse(this.createExportModelRoot(), { binary: true });
    return new Blob([data], { type: 'model/stl' });
  }

  async exportGlbBlob() {
    const data = await new GLTFExporter().parseAsync(this.createExportModelRoot(), {
      binary: true,
      onlyVisible: true,
      truncateDrawRange: true,
    });
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
      for (let index = 0; index < totalFrames; index += 1) {
        const angle = (index / totalFrames) * Math.PI * 2;
        this.camera.position.set(
          center.x + Math.sin(angle) * radius,
          center.y,
          center.z + Math.cos(angle) * radius,
        );
        this.camera.lookAt(center);
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
    if (this.selectedId && (this.transformHandleActive || this.transformControls.dragging)) {
      event.preventDefault();
      return;
    }
    if (this.selectedId) {
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
    const hits = this.raycaster.intersectObjects(this.placementGroup.children, true);
    const placementId = hits[0]?.object?.userData?.placementId;
    if (placementId) {
      this.select(placementId);
      return;
    }
    const zoneHits = this.raycaster.intersectObjects(this.zoneGroup.children, true);
    const zoneId = zoneHits[0]?.object?.userData?.zoneId;
    if (zoneId) {
      this.selectZone(zoneId);
      return;
    }
    const wallSystem = this.buildingGroup.children.find((child) => child.userData?.wallSystem);
    const wallHit = wallSystem
      ? this.raycaster.intersectObject(wallSystem, true).find((hit) => hit.object?.isMesh && hit.object?.userData?.wallSide)
      : null;
    if (wallHit) {
      if (wallHit.object.userData?.isKarbandi) {
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
      this.selectWallSide(wallHit.object.userData.wallSide);
      return;
    }
    this.clearSelection();
  }

  onContextMenu(event) {
    const bounds = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const placementId = this.raycaster.intersectObjects(this.placementGroup.children, true)[0]?.object?.userData?.placementId;
    if (placementId) {
      event.preventDefault();
      this.select(placementId);
      this.callbacks.onAssetContextMenu?.({ kind: 'placement', id: placementId, x: event.clientX, y: event.clientY });
      return;
    }
    const zoneId = this.raycaster.intersectObjects([...this.zoneDecorationGroup.children, ...this.zoneGroup.children], true)[0]?.object?.userData?.zoneId;
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
      const side = wallHit.object.userData.wallSide;
      this.selectWallSide(side);
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
    if (!this.nightLightDrag) return;
    this.nightLightDrag = null;
    this.controls.enabled = true;
  }

  resize() {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  animate = () => {
    this.animationFrame = requestAnimationFrame(this.animate);
    this.controls.update();
    if (this.selectionOutline?.isBox3Helper) {
      const target = this.selectionOutline.userData.exactBoundsTarget;
      const bounds = target && previewWorldBounds(target, (object) => object.userData.exactMuqarnasGeometry === true);
      if (bounds && !bounds.isEmpty()) this.selectionOutline.box.copy(bounds);
      this.selectionOutline.updateMatrixWorld(true);
    } else {
      this.selectionOutline?.update?.();
    }
    this.renderer.render(this.scene, this.camera);
  };

  clearGroup(group) {
    group.traverse((child) => {
      child.geometry?.dispose?.();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.filter(Boolean).forEach((material) => {
        material.userData?.generatedTexture?.dispose?.();
        material.map?.dispose?.();
        material.dispose?.();
      });
    });
    group.clear();
  }

  dispose() {
    this.stopConstructionSequence();
    cancelAnimationFrame(this.animationFrame);
    this.resizeObserver.disconnect();
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown);
    this.renderer.domElement.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
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
    this.clearWallSurfaceHighlight();
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
