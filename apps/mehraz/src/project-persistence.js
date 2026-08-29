import { buildingSurfaces, normalizeBuilding } from './mehraz-scene.js';
import { DEFAULT_WALL_SYSTEM, normalizeWallSystem } from './wall-system.js';

export const MEHRAZ_PROJECT_SCHEMA_VERSION = 7;

export function projectIdentityAfterStageAddition({
  projectInstanceCount = 0,
  activeProjectAssetId = null,
  activeProjectVersionId = null,
  selectedProjectVersionId = '',
  projectName = '',
} = {}) {
  if (Number(projectInstanceCount) > 0) {
    return {
      createsComposition: false,
      activeProjectAssetId,
      activeProjectVersionId,
      selectedProjectVersionId,
      projectName,
    };
  }

  const baseName = String(projectName || '').trim() || 'Mehraz project';
  return {
    createsComposition: true,
    activeProjectAssetId: null,
    activeProjectVersionId: null,
    selectedProjectVersionId: '',
    projectName: /\bcomposition$/i.test(baseName) ? baseName : `${baseName} composition`,
  };
}

function finiteVector(value, fallback) {
  return fallback.map((defaultValue, index) => (
    Number.isFinite(Number(value?.[index])) ? Number(value[index]) : defaultValue
  ));
}

export function normalizeProjectInstance(instance, index = 0) {
  if (!instance?.payload || instance.payload.app !== 'mehraz' || !instance.payload.building) return null;
  return {
    id: String(instance.id || `project-instance-${index + 1}`),
    assetId: instance.assetId ? String(instance.assetId) : null,
    versionId: instance.versionId ? String(instance.versionId) : null,
    versionNumber: Number.isFinite(Number(instance.versionNumber)) ? Number(instance.versionNumber) : null,
    name: String(instance.name || 'Added Mehraz project'),
    payload: jsonSafeProject(instance.payload),
    transform: {
      position: finiteVector(instance.transform?.position, [0, 0, 0]),
      rotation: finiteVector(instance.transform?.rotation, [0, 0, 0]),
      scale: finiteVector(instance.transform?.scale, [1, 1, 1])
        .map((value) => Math.max(0.01, Math.min(100, value))),
    },
  };
}

function jsonSafeProject(value) {
  let json;
  try {
    json = JSON.stringify(value);
  } catch (error) {
    throw new Error(`This project contains data that cannot be saved: ${error.message}`);
  }
  if (!json) throw new Error('The project did not produce a valid save payload.');
  return JSON.parse(json);
}

export function createMehrazProjectPayload({
  building,
  walls,
  stageRenderMode = 'textured',
  nightLights = [],
  zones = [],
  assemblies = [],
  placements = [],
  projectInstances = [],
  previewImage = '',
} = {}) {
  const savedBuilding = normalizeBuilding(building || {});
  const savedWalls = normalizeWallSystem(walls || DEFAULT_WALL_SYSTEM, savedBuilding);
  return jsonSafeProject({
    version: MEHRAZ_PROJECT_SCHEMA_VERSION,
    app: 'mehraz',
    units: 'm',
    coordinateSystem: 'right-handed-y-up',
    building: savedBuilding,
    walls: savedWalls,
    stageRenderMode: stageRenderMode === 'flat' ? 'flat' : 'textured',
    nightLights: Array.isArray(nightLights) ? nightLights : [],
    // Architectural surfaces are derived from the saved building type. This
    // prevents an Iwan surface snapshot from being stored after switching to a
    // Room immediately before saving.
    surfaces: buildingSurfaces(savedBuilding),
    zones: Array.isArray(zones) ? zones : [],
    assemblies: Array.isArray(assemblies) ? assemblies : [],
    placements: Array.isArray(placements)
      ? placements.filter((placement) => placement && !placement.generatedFromZone)
      : [],
    projectInstances: Array.isArray(projectInstances)
      ? projectInstances.map(normalizeProjectInstance).filter(Boolean)
      : [],
    previewImage: typeof previewImage === 'string' ? previewImage : '',
  });
}

export function normalizeMehrazProjectPayload(payload) {
  if (payload?.app !== 'mehraz' || !payload.building || !Array.isArray(payload.placements)) {
    throw new Error('This is not a valid Mehraz project.');
  }
  const building = normalizeBuilding(payload.building);
  return {
    ...payload,
    version: Number(payload.version) || 1,
    building,
    walls: normalizeWallSystem(payload.walls || {
      ...DEFAULT_WALL_SYSTEM,
      color: building.wallColor,
      pointedArch: { ...DEFAULT_WALL_SYSTEM.pointedArch, enabled: building.type !== 'room' },
    }, building),
    stageRenderMode: payload.stageRenderMode === 'flat' ? 'flat' : 'textured',
    nightLights: Array.isArray(payload.nightLights) ? payload.nightLights : [],
    surfaces: buildingSurfaces(building),
    zones: Array.isArray(payload.zones) ? payload.zones : [],
    assemblies: Array.isArray(payload.assemblies) ? payload.assemblies : [],
    projectInstances: Array.isArray(payload.projectInstances)
      ? payload.projectInstances.map(normalizeProjectInstance).filter(Boolean)
      : [],
  };
}
