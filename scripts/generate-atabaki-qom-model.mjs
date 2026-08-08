import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BLUE = '#3878b8';
const CREAM = '#e8c8a8';
const MAROON = '#301018';
const HEIGHT = 0.08;
const GROUP = '10 Kond';

const sourceDefinitions = {
  'shamseh-kond': {
    name: 'Shamseh Kond',
    glbUrl: '/models/10%20Kond/Shamseh%20Kond.glb',
    sourceWidthPx: 4.546,
    sourceLengthPx: 4.324,
    points: [
      [-1.1, 0], [-0.891, -0.646], [-0.341, -1.046], [0.341, -1.046], [0.891, -0.646],
      [1.1, 0], [0.891, 0.646], [0.341, 1.046], [-0.341, 1.046], [-0.891, 0.646],
    ],
  },
  'toranj-kond': {
    name: 'Toranj Kond',
    glbUrl: '/models/10%20Kond/Toranj%20Kond.glb',
    sourceWidthPx: 1.405,
    sourceLengthPx: 1.195,
    points: [[-1.1, -0.578], [0, -0.936], [1.1, -0.578], [0, 0.936]],
  },
  loz: {
    name: 'Loz',
    glbUrl: '/models/10%20Kond/Loz.glb',
    sourceWidthPx: 1.256,
    sourceLengthPx: 1.729,
    points: [[-0.799, 0], [0, -1.1], [0.799, 0], [0, 1.1]],
  },
};

const sources = Object.entries(sourceDefinitions).map(([sourceKey, source]) => ({
  sourceKey,
  sourceId: sourceKey,
  name: source.name,
  group: GROUP,
  type: 'glb',
  isFrameSlice: false,
  points: source.points,
  snapEdges: polygonEdges(source.points),
  verticalEdges: [],
  displayEdges: polygonEdges(source.points),
  sourceHeightPx: 0.4,
  sourceWidthPx: source.sourceWidthPx,
  sourceLengthPx: source.sourceLengthPx,
  sourceFootprintScale: 2.2 / Math.max(source.sourceWidthPx, source.sourceLengthPx),
  keepAspectRatio: true,
  analysisVersion: 7,
  glbUrl: source.glbUrl,
}));

const pieces = [];
let pieceNumber = 0;

function addPiece(sourceKey, color, x, y, rotation, stageWidth, stageLength) {
  pieceNumber += 1;
  pieces.push({
    id: `atabaki-${String(pieceNumber).padStart(3, '0')}`,
    sourceKey,
    sourceId: sourceKey,
    groupInstanceId: null,
    snappedTo: null,
    transform: {
      x: round(x),
      y: round(y),
      rotation: round(rotation),
      elevation: 0,
      tiltX: 0,
      tiltZ: 0,
      mirrorHorizontal: false,
      mirrorVertical: false,
      hidden: false,
      height: HEIGHT,
      stageWidth,
      stageLength,
    },
    material: { color },
  });
}

function addBlueStar(cx, cy) {
  addPiece('shamseh-kond', BLUE, cx, cy, 0, 0.39, 0.371);
  for (let index = 0; index < 10; index += 1) {
    const angle = index * Math.PI * 2 / 10;
    addPiece(
      'toranj-kond',
      BLUE,
      cx + Math.sin(angle) * 0.34,
      cy + Math.cos(angle) * 0.34,
      -angle,
      0.205,
      0.174,
    );
  }
}

function addCreamMaroonRosette(cx, cy) {
  addPiece('shamseh-kond', MAROON, cx, cy, Math.PI / 10, 0.205, 0.195);
  for (let index = 0; index < 10; index += 1) {
    const angle = index * Math.PI * 2 / 10;
    addPiece(
      'loz',
      CREAM,
      cx + Math.sin(angle) * 0.29,
      cy + Math.cos(angle) * 0.29,
      -angle,
      0.176,
      0.242,
    );
  }
  for (let index = 0; index < 5; index += 1) {
    const angle = Math.PI / 5 + index * Math.PI * 2 / 5;
    addPiece(
      'toranj-kond',
      MAROON,
      cx + Math.sin(angle) * 0.145,
      cy + Math.cos(angle) * 0.145,
      -angle,
      0.14,
      0.119,
    );
  }
}

const columns = [-0.82, 0, 0.82];
const rows = [-1.44, -0.72, 0, 0.72, 1.44];
rows.forEach((y, rowIndex) => {
  columns.forEach((x, columnIndex) => {
    if ((rowIndex + columnIndex) % 2 === 0) addBlueStar(x, y);
    else addCreamMaroonRosette(x, y);
  });
});

const model = {
  id: 'model-atabaki-courtyard-qom-10-kond',
  app: 'Girih',
  kind: 'girih-model',
  version: 2,
  name: 'Atabaki courtyard, Qom - 10 Kond study',
  exportedAt: new Date().toISOString(),
  style: 'presentation',
  material: 'plastic',
  renderSettings: {
    backgroundColor: '#000000',
    edgeColor: '#000000',
    edgeThickness: 1,
    edgeMode: 'single',
    edgeOffsetCount: 1,
    edgeOffsetDistance: 0,
  },
  modelTransform: {
    scaleX: 1,
    scaleY: 1,
    scaleZ: 1,
    rotationX: 0,
    rotationY: 0,
    rotationZ: 0,
    positionX: 0,
    positionY: 0,
    positionZ: 0,
  },
  sources,
  pieces,
};

const outputPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'Atabaki-courtyard-Qom-10-Kond.json');
fs.writeFileSync(outputPath, `${JSON.stringify(model, null, 2)}\n`, 'utf8');
console.log(`Created ${outputPath}`);
console.log(`${pieces.length} placed pieces using ${sources.length} library piece types.`);

function polygonEdges(points) {
  return points.map((point, index) => [point, points[(index + 1) % points.length]]);
}

function round(value) {
  return Number(value.toFixed(6));
}
