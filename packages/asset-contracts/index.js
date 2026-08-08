import {
  ASSET_CONTRACT_ID,
  ASSET_CONTRACT_MANIFEST,
  ASSET_CONTRACT_VERSION,
  ASSET_TYPES,
  COORDINATE_SYSTEM,
  SOURCE_APPS,
} from './manifest.js';

const TYPE_VALUES = new Set(Object.values(ASSET_TYPES));
const APP_VALUES = new Set(Object.values(SOURCE_APPS));
const TYPE_SOURCE_APP = new Map([
  [ASSET_TYPES.GIRIH_PATTERN, SOURCE_APPS.GIRIH],
  [ASSET_TYPES.BRICK_BOND, SOURCE_APPS.BRICKS],
  [ASSET_TYPES.MUQARNAS_ASSEMBLY, SOURCE_APPS.MUQARNAS],
  [ASSET_TYPES.SURFACE_STICKER, SOURCE_APPS.GIRIH],
  [ASSET_TYPES.MEHRAZ_PROJECT, SOURCE_APPS.MEHRAZ],
]);

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function finitePositive(value) {
  return Number.isFinite(Number(value)) && Number(value) > 0;
}

function addError(errors, path, message) {
  errors.push({ path, message });
}

function validateGirih(payload, errors) {
  if (!Array.isArray(payload.pieces)) addError(errors, 'payload.pieces', 'Girih patterns require a pieces array.');
  if (payload.pieces?.some((piece) => !isObject(piece) || !Array.isArray(piece.points))) {
    addError(errors, 'payload.pieces', 'Every Girih piece requires polygon points.');
  }
}

function validateBrickBond(payload, errors) {
  ['brickWidth', 'brickHeight', 'mortar'].forEach((field) => {
    if (!finitePositive(payload[field])) addError(errors, `payload.${field}`, `${field} must be a positive value in metres.`);
  });
  if (!isObject(payload.pattern)) addError(errors, 'payload.pattern', 'Brick bonds require a pattern object.');
  const hasExactBricks = Array.isArray(payload.pattern?.bricks) && payload.pattern.bricks.length > 0;
  const hasCourses = Array.isArray(payload.pattern?.courses) && payload.pattern.courses.length > 0;
  if (!hasExactBricks && !hasCourses) addError(errors, 'payload.pattern', 'Pattern requires exact bricks or procedural courses.');
}

function validateMuqarnas(payload, errors) {
  if (!Array.isArray(payload.levels) || !payload.levels.length) addError(errors, 'payload.levels', 'Muqarnas assemblies require at least one tier.');
  if (!Array.isArray(payload.instances)) addError(errors, 'payload.instances', 'Muqarnas assemblies require an instances array.');
  if (!isObject(payload.anchor) || !Array.isArray(payload.anchor.position) || payload.anchor.position.length !== 3) {
    addError(errors, 'payload.anchor', 'Muqarnas assemblies require a three-dimensional placement anchor.');
  }
}

function validateSticker(payload, errors) {
  if (!['image/png', 'image/webp'].includes(payload.mimeType)) addError(errors, 'payload.mimeType', 'Stickers must use PNG or WebP.');
  if (!finitePositive(payload.width) || !finitePositive(payload.height)) addError(errors, 'payload', 'Sticker width and height must be positive metres.');
  if (!isObject(payload.image) || (!payload.image.storagePath && !payload.image.dataUrl)) {
    addError(errors, 'payload.image', 'Sticker image requires a storage path or embedded data URL.');
  }
}

function validateMehraz(payload, errors) {
  if (!isObject(payload.building)) addError(errors, 'payload.building', 'Mehraz projects require a building definition.');
  if (payload.walls !== undefined && !isObject(payload.walls)) {
    addError(errors, 'payload.walls', 'Mehraz wall settings must be an object.');
  }
  if (isObject(payload.walls)) {
    if (payload.walls.openSides !== undefined && !Array.isArray(payload.walls.openSides)) {
      addError(errors, 'payload.walls.openSides', 'Open wall sides must be an array.');
    }
    if (payload.walls.bricks !== undefined && !isObject(payload.walls.bricks)) {
      addError(errors, 'payload.walls.bricks', 'Wall brick settings must be an object.');
    }
  }
  if (payload.nightLights !== undefined && !Array.isArray(payload.nightLights)) {
    addError(errors, 'payload.nightLights', 'Mehraz night lights must be an array.');
  }
  if (!Array.isArray(payload.surfaces)) addError(errors, 'payload.surfaces', 'Mehraz projects require named architectural surfaces.');
  if (!Array.isArray(payload.placements)) addError(errors, 'payload.placements', 'Mehraz projects require a placements array.');
  payload.placements?.forEach((placement, index) => {
    if (!placement.assetVersionId) addError(errors, `payload.placements.${index}.assetVersionId`, 'Decorative placements must pin an asset version.');
    if (!placement.surfaceId) addError(errors, `payload.placements.${index}.surfaceId`, 'Decorative placements require a target surface.');
  });
  if (payload.zones !== undefined && !Array.isArray(payload.zones)) {
    addError(errors, 'payload.zones', 'Mehraz façade zones must be an array.');
  }
  payload.zones?.forEach((zone, index) => {
    if (!zone.id || !zone.surfaceId || !isObject(zone.bounds)) {
      addError(errors, `payload.zones.${index}`, 'Each façade zone requires an ID, target surface, and bounds.');
    }
  });
  if (payload.assemblies !== undefined && !Array.isArray(payload.assemblies)) {
    addError(errors, 'payload.assemblies', 'Mehraz construction assemblies must be an array.');
  }
  const placementIds = new Set(payload.placements?.map((placement) => placement.id).filter(Boolean));
  payload.assemblies?.forEach((assembly, index) => {
    if (!assembly.id || !Array.isArray(assembly.placementIds)) {
      addError(errors, `payload.assemblies.${index}`, 'Each assembly requires an ID and placement ID list.');
      return;
    }
    assembly.placementIds.forEach((placementId) => {
      if (!placementIds.has(placementId)) {
        addError(errors, `payload.assemblies.${index}.placementIds`, `Unknown placement ID: ${placementId}`);
      }
    });
  });
}

const PAYLOAD_VALIDATORS = new Map([
  [ASSET_TYPES.GIRIH_PATTERN, validateGirih],
  [ASSET_TYPES.BRICK_BOND, validateBrickBond],
  [ASSET_TYPES.MUQARNAS_ASSEMBLY, validateMuqarnas],
  [ASSET_TYPES.SURFACE_STICKER, validateSticker],
  [ASSET_TYPES.MEHRAZ_PROJECT, validateMehraz],
]);

export function validateLibraryAsset(asset) {
  const errors = [];
  if (!isObject(asset)) return { valid: false, errors: [{ path: '', message: 'Asset must be an object.' }] };
  if (asset.contract !== ASSET_CONTRACT_ID) addError(errors, 'contract', `Expected ${ASSET_CONTRACT_ID}.`);
  if (Number(asset.contractVersion) !== ASSET_CONTRACT_VERSION) addError(errors, 'contractVersion', `Expected contract version ${ASSET_CONTRACT_VERSION}.`);
  if (!TYPE_VALUES.has(asset.assetType)) addError(errors, 'assetType', 'Unknown library asset type.');
  if (!APP_VALUES.has(asset.sourceApp)) addError(errors, 'sourceApp', 'Unknown source application.');
  if (TYPE_SOURCE_APP.has(asset.assetType) && TYPE_SOURCE_APP.get(asset.assetType) !== asset.sourceApp) {
    addError(errors, 'sourceApp', `${asset.assetType} assets must originate from ${TYPE_SOURCE_APP.get(asset.assetType)}.`);
  }
  if (asset.units !== COORDINATE_SYSTEM.units) addError(errors, 'units', 'All physical asset dimensions must use metres.');
  if (asset.coordinateSystem !== 'right-handed-y-up') addError(errors, 'coordinateSystem', 'Assets must use the right-handed Y-up coordinate system.');
  if (typeof asset.name !== 'string' || !asset.name.trim()) addError(errors, 'name', 'Asset name is required.');
  if (!isObject(asset.payload)) addError(errors, 'payload', 'Asset payload is required.');
  if (!isObject(asset.artifacts)) addError(errors, 'artifacts', 'Artifacts must be an object.');
  if (isObject(asset.payload)) PAYLOAD_VALIDATORS.get(asset.assetType)?.(asset.payload, errors);
  return { valid: errors.length === 0, errors };
}

export function createLibraryAsset({
  assetType,
  sourceApp = TYPE_SOURCE_APP.get(assetType),
  name,
  description = '',
  payload,
  artifacts = {},
  preview = null,
  metadata = {},
}) {
  return {
    contract: ASSET_CONTRACT_ID,
    contractVersion: ASSET_CONTRACT_VERSION,
    assetType,
    sourceApp,
    schemaVersion: 1,
    units: COORDINATE_SYSTEM.units,
    coordinateSystem: 'right-handed-y-up',
    name: String(name || '').trim(),
    description: String(description || ''),
    payload,
    artifacts,
    preview,
    metadata,
    createdAt: new Date().toISOString(),
  };
}

export function assertLibraryAsset(asset) {
  const result = validateLibraryAsset(asset);
  if (!result.valid) {
    const error = new Error(result.errors.map(({ path, message }) => `${path || 'asset'}: ${message}`).join('\n'));
    error.validationErrors = result.errors;
    throw error;
  }
  return asset;
}

export {
  ASSET_CONTRACT_ID,
  ASSET_CONTRACT_MANIFEST,
  ASSET_CONTRACT_VERSION,
  ASSET_TYPES,
  COORDINATE_SYSTEM,
  SOURCE_APPS,
};
