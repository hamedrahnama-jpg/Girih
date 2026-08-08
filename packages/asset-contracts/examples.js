import { ASSET_TYPES, SOURCE_APPS, createLibraryAsset } from './index.js';

export const ASSET_CONTRACT_EXAMPLES = Object.freeze([
  createLibraryAsset({
    assetType: ASSET_TYPES.GIRIH_PATTERN,
    name: 'Ten Kond panel',
    payload: { pieces: [{ id: 'piece-1', points: [[0, 0], [1, 0], [0.5, 1]], transform: { x: 0, y: 0, rotation: 0, scale: 1 } }], frame: null },
    artifacts: { editable_json: 'library/example/girih.json', preview_png: 'library/example/girih.png' },
  }),
  createLibraryAsset({
    assetType: ASSET_TYPES.BRICK_BOND,
    name: 'Running bond',
    payload: { brickWidth: 0.215, brickHeight: 0.065, mortar: 0.01, pattern: { courses: [{ offset: 0, bricks: [1] }, { offset: 0.5, bricks: [1] }] } },
    artifacts: { editable_json: 'library/example/bond.json', preview_png: 'library/example/bond.png' },
  }),
  createLibraryAsset({
    assetType: ASSET_TYPES.MUQARNAS_ASSEMBLY,
    name: 'Three-tier portal crown',
    payload: { levels: [{ id: 'tier-1', height: 0.4 }], instances: [], anchor: { position: [0, 0, 0], forward: [0, 0, -1] } },
    artifacts: { editable_json: 'library/example/muqarnas.json', glb: 'library/example/muqarnas.glb' },
  }),
  createLibraryAsset({
    assetType: ASSET_TYPES.SURFACE_STICKER,
    sourceApp: SOURCE_APPS.GIRIH,
    name: 'Blue rosette',
    payload: { mimeType: 'image/png', width: 1, height: 1, image: { storagePath: 'library/example/rosette.png' } },
    artifacts: { source_png: 'library/example/rosette.png' },
  }),
  createLibraryAsset({
    assetType: ASSET_TYPES.MEHRAZ_PROJECT,
    name: 'Iwan study',
    payload: {
      building: { type: 'iwan', width: 8, height: 12, depth: 6 },
      surfaces: [{ id: 'south-exterior', type: 'wall' }],
      zones: [{ id: 'zone-1', name: 'Portal panel', surfaceId: 'south-exterior', bounds: { u: 0, v: 3, width: 4, height: 5 } }],
      placements: [{ id: 'placement-1', assetVersionId: 'version-example', surfaceId: 'south-exterior', zoneId: 'zone-1', transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } }],
      assemblies: [{ id: 'assembly-1', name: 'Portal decoration', placementIds: ['placement-1'], trade: 'girih_pattern', status: 'planned' }],
    },
    artifacts: { editable_json: 'library/example/mehraz.json', schedule_csv: 'library/example/mehraz-schedule.csv' },
  }),
]);
