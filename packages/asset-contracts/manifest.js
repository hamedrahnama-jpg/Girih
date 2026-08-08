export const ASSET_CONTRACT_VERSION = 1;
export const ASSET_CONTRACT_ID = 'girihstudio.library-asset';

export const ASSET_TYPES = Object.freeze({
  GIRIH_PATTERN: 'girih_pattern',
  BRICK_BOND: 'brick_bond',
  MUQARNAS_ASSEMBLY: 'muqarnas_assembly',
  SURFACE_STICKER: 'surface_sticker',
  MEHRAZ_PROJECT: 'mehraz_project',
});

export const SOURCE_APPS = Object.freeze({
  GIRIH: 'girih',
  BRICKS: 'bricks',
  MUQARNAS: 'muqarnas',
  MEHRAZ: 'mehraz',
});

export const COORDINATE_SYSTEM = Object.freeze({
  handedness: 'right',
  upAxis: 'y',
  forwardAxis: '-z',
  horizontalAxes: ['x', 'z'],
  units: 'm',
  angleUnits: 'degrees',
  origin: 'asset-local-anchor',
});

export const ASSET_TYPE_DEFINITIONS = Object.freeze([
  {
    type: ASSET_TYPES.GIRIH_PATTERN,
    label: 'Girih pattern',
    sourceApp: SOURCE_APPS.GIRIH,
    description: 'Editable geometric panel, motif, tessellation, frame, colors, and surface stickers.',
    requiredPayload: ['pieces'],
    recommendedArtifacts: ['preview_png', 'editable_json', 'svg', 'glb'],
  },
  {
    type: ASSET_TYPES.BRICK_BOND,
    label: 'Brick bond',
    sourceApp: SOURCE_APPS.BRICKS,
    description: 'Repeatable brick grid containing dimensions, orientation, colors, and mortar.',
    requiredPayload: ['brickWidth', 'brickHeight', 'mortar', 'pattern'],
    recommendedArtifacts: ['preview_png', 'editable_json', 'svg'],
  },
  {
    type: ASSET_TYPES.MUQARNAS_ASSEMBLY,
    label: 'Muqarnas assembly',
    sourceApp: SOURCE_APPS.MUQARNAS,
    description: 'Pure modular muqarnas composition with tiers, module instances, groups, slices, and placement anchor.',
    requiredPayload: ['levels', 'instances', 'anchor'],
    recommendedArtifacts: ['preview_png', 'editable_json', 'glb'],
  },
  {
    type: ASSET_TYPES.SURFACE_STICKER,
    label: 'Surface sticker',
    sourceApp: SOURCE_APPS.GIRIH,
    description: 'Transparent surface artwork with physical size, transform defaults, and protected preview.',
    requiredPayload: ['mimeType', 'width', 'height', 'image'],
    recommendedArtifacts: ['watermarked_preview_png', 'source_png'],
  },
  {
    type: ASSET_TYPES.MEHRAZ_PROJECT,
    label: 'Mehraz project',
    sourceApp: SOURCE_APPS.MEHRAZ,
    description: 'Architectural shell plus façade zones, version-pinned decorative placements, assemblies, and construction data.',
    requiredPayload: ['building', 'surfaces', 'placements'],
    recommendedArtifacts: ['preview_png', 'editable_json', 'glb', 'pdf', 'schedule_csv'],
  },
]);

export const ASSET_CONTRACT_MANIFEST = Object.freeze({
  id: ASSET_CONTRACT_ID,
  version: ASSET_CONTRACT_VERSION,
  status: 'stable-foundation',
  coordinateSystem: COORDINATE_SYSTEM,
  assetTypes: ASSET_TYPE_DEFINITIONS,
  compatibility: {
    minimumReaderVersion: 1,
    unknownFields: 'preserve',
    projectReferences: 'pin-library-asset-version',
    breakingChanges: 'require-new-contract-version',
  },
});
