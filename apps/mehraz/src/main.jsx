import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { jsPDF } from 'jspdf';
import {
  ArrowLeft,
  ArrowRight,
  Box,
  Boxes,
  BrickWall,
  Building2,
  ClipboardList,
  Download,
  ExternalLink,
  FileImage,
  FileSpreadsheet,
  Focus,
  FolderOpen,
  GraduationCap,
  GripVertical,
  Grid3X3,
  Layers3,
  Lightbulb,
  LogIn,
  Maximize2,
  Minus,
  Move3d,
  Plus,
  RefreshCw,
  RotateCw,
  Redo2,
  Save,
  ScanLine,
  Trash2,
  Undo2,
  Upload,
  User,
  X,
} from 'lucide-react';
import { authHandoffReady, supabase } from './supabase-client.js';
import {
  archiveLibraryAsset,
  getLibraryAssetVersion,
  LIBRARY_PAGE_SIZE,
  listLibraryAssets,
  listLibraryAssetVersions,
  saveLibraryAsset,
  setLibraryAssetVersionRetention,
  setCurrentLibraryAssetVersion,
  uploadLibraryThumbnail,
  updateLibraryAssetMetadata,
} from './library-client.generated.js';
import {
  readLibraryCatalogueCache,
  readLibraryVersionCache,
  readLibraryVersionListCache,
  writeLibraryCatalogueCache,
  writeLibraryVersionCache,
  writeLibraryVersionListCache,
} from './library-cache.js';
import {
  buildingSurfaces,
  constrainPlacementTransform,
  defaultZoneBounds,
  defaultPlacementTransform,
  fitPlacementToZone,
  fitPlacementTransform,
  MehrazScene,
  moveZoneVerticallyByBrick,
  CONSTRUCTION_STEPS,
  constructionStepsForBuilding,
  normalizeConstructionStepOrder,
  normalizeBuilding,
  resizeHallVaultProfileHeight,
  resizeHallVaultProfileWidth,
  resizeZoneHeightByBrick,
  surfaceIdForWallSide,
  wallSideForSurfaceId,
  zoneBrickHeightStep,
  zoneWorldTransform,
} from './mehraz-scene.js';
import {
  BUILT_IN_BONDS,
  archCurve,
  createRoomPlanOpening,
  DEFAULT_WALL_SYSTEM,
  karbandiGroupYForWallTopLegCenters,
  karbandiGroupZForWallLegCenters,
  normalizeKarbandiRibCount,
  karbandiReferenceZForRibCount,
  karbandiReferenceZSolutions,
  karbandiSpanForWallLegCenters,
  normalizeWallSystem,
  pointedArchConstruction,
  portalDefaultWallSystem,
  roomPlanOpeningsWithDefaultDoor,
  solveKarbandiWallSeating,
  solveKarbandiOneLegCornerSeating,
  wallContextLibraryAsset,
} from './wall-system.js';
import { isKarbandiRibArchEditorTarget } from './karbandi-editor-target.js';
import { muqarnasPreviewMetrics, portalMuqarnasTransform, roomDomeMuqarnasTransform } from './arch-muqarnas-placement.js';
import {
  createMehrazProjectPayload,
  MEHRAZ_PROJECT_SCHEMA_VERSION,
  normalizeMehrazProjectPayload,
  normalizeProjectInstance,
} from './project-persistence.js';
import {
  lastCombinationSelection,
  loadCombinationProfile,
  normalizeCombinationProfileStore,
  saveCombinationProfile,
  settingsCombination,
} from './combination-profiles.js';
import './styles.css';

const ASSET_LABELS = {
  girih_pattern: 'Girih patterns',
  brick_bond: 'Brick bonds',
  muqarnas_assembly: 'Muqarnas',
  surface_sticker: 'Stickers',
};

const ASSET_ICONS = {
  girih_pattern: Grid3X3,
  brick_bond: BrickWall,
  muqarnas_assembly: Layers3,
  surface_sticker: Box,
};

function LibraryAssetPreview({ asset, version }) {
  const artifacts = version?.artifacts || asset?.currentVersion?.artifacts || {};
  const payload = version?.payload || asset?.currentVersion?.payload || {};
  const image = asset?.thumbnailUrl || artifacts.preview_png || artifacts.watermarked_preview_png || artifacts.source_png || payload.previewImage || payload.thumbnail || '';
  const Icon = ASSET_ICONS[asset?.asset_type] || Boxes;
  return <div className="library-asset-preview">{image ? <img src={image} alt={`${asset?.name || 'Library asset'} preview`} /> : <><Icon size={34} /><span>{ASSET_LABELS[asset?.asset_type] || 'Library asset'}</span></>}</div>;
}

const SOURCE_APP_EDIT_LINKS = {
  girih_pattern: 'https://girihstudio.com/app',
  surface_sticker: 'https://girihstudio.com/app',
  brick_bond: 'https://bricks.girihstudio.com',
  muqarnas_assembly: 'https://muqarnas.girihstudio.com',
};
const SOURCE_APP_NAMES = { girih_pattern: 'Girih App', surface_sticker: 'Girih App', brick_bond: 'Bricks App', muqarnas_assembly: 'Muqarnas App' };

const LIBRARY_APP_GROUPS = [
  {
    app: 'girih',
    name: 'Girih App',
    assetTypes: ['girih_pattern', 'surface_sticker'],
    emptyMessage: 'No Girih patterns or stickers have been saved to the shared library yet.',
  },
  {
    app: 'bricks',
    name: 'Bricks App',
    assetTypes: ['brick_bond'],
    emptyMessage: 'No brick bonds have been saved to the shared library yet.',
  },
  {
    app: 'muqarnas',
    name: 'Muqarnas App',
    assetTypes: ['muqarnas_assembly'],
    emptyMessage: 'No Muqarnas assemblies have been saved to the shared library yet.',
  },
];

const WALL_BOND_LABELS = {
  north: 'North',
  north_sides: 'North side walls',
  north_top: 'North top wall',
  east: 'East',
  south: 'South',
  west: 'West',
  room_plan_interior: 'All interior room walls',
  room_plan_exterior: 'All exterior room walls',
  arch: 'Arch',
  room_dome: 'Room dome',
  room_dome_inner: 'Room inner dome',
  room_dome_interior: 'Room dome interior',
  room_inner_dome_exterior: 'Inner dome exterior',
  room_inner_dome_interior: 'Inner dome interior',
  room_dome_drum: 'Room dome drum',
  room_dome_drum_interior: 'Room dome drum interior',
  room_dome_extra_leg: 'Dome extra leg',
  room_dome_extra_leg_interior: 'Dome extra leg interior',
  room_dome_transition: 'Room dome transition',
  room_dome_transition_exterior: 'Transition cover exterior',
  room_dome_ring: 'Dome springing ring',
};
const ROOM_WALL_SIDES = ['north', 'east', 'south', 'west'];
const AUTH_STARTUP_TIMEOUT_MS = 8_000;
const DEFAULT_BUILDING_DIMENSIONS = Object.freeze({
  portal: Object.freeze({ width: 4, iwanDepth: 2, height: 6, wallThickness: 0.35 }),
  room: Object.freeze({ width: 4, length: 4, height: 6, wallThickness: 0.35 }),
  vestibule: Object.freeze({ width: 4, length: 4, height: 4, wallThickness: 0.35 }),
  hall: Object.freeze({ hallGridX: 3, hallGridY: 3, hallBayWidth: 4, hallBayDepth: 4, height: 3, wallThickness: 0.5 }),
  grid: Object.freeze({ hallGridX: 9, hallGridY: 9, hallBayWidth: 4, hallBayDepth: 4, gridBaySpansX: Array(9).fill(4), gridBaySpansY: Array(9).fill(4), height: 3, wallThickness: 0.5 }),
});

function buildingDimensionProfile(buildingType, value = {}) {
  const defaults = DEFAULT_BUILDING_DIMENSIONS[buildingType] || DEFAULT_BUILDING_DIMENSIONS.portal;
  if (buildingType === 'portal') return {
    width: Number(value.width) || defaults.width,
    iwanDepth: Number(value.iwanDepth ?? value.depth) || defaults.iwanDepth,
    height: Number(value.height) || defaults.height,
    wallThickness: Number(value.wallThickness) || defaults.wallThickness,
  };
  if (['hall', 'grid'].includes(buildingType)) return {
    hallGridX: Number(value.hallGridX) || defaults.hallGridX,
    hallGridY: Number(value.hallGridY) || defaults.hallGridY,
    hallBayWidth: Number(value.hallBayWidth) || defaults.hallBayWidth,
    hallBayDepth: Number(value.hallBayDepth) || defaults.hallBayDepth,
    gridBaySpansX: [...(value.gridBaySpansX || defaults.gridBaySpansX || [])],
    gridBaySpansY: [...(value.gridBaySpansY || defaults.gridBaySpansY || [])],
    height: Number(value.height) || defaults.height,
    wallThickness: Number(value.wallThickness) || defaults.wallThickness,
  };
  return {
    width: Number(value.width) || defaults.width,
    length: Number(value.length ?? value.depth) || defaults.length,
    height: Number(value.height) || defaults.height,
    wallThickness: Number(value.wallThickness) || defaults.wallThickness,
  };
}

function defaultBuildingDimensionProfiles() {
  return Object.fromEntries(Object.keys(DEFAULT_BUILDING_DIMENSIONS).map((buildingType) => [
    buildingType,
    { ...DEFAULT_BUILDING_DIMENSIONS[buildingType] },
  ]));
}

function captureBuildingDimensionProfiles(building, existing = null) {
  const profiles = defaultBuildingDimensionProfiles();
  for (const buildingType of Object.keys(profiles)) {
    profiles[buildingType] = buildingDimensionProfile(
      buildingType,
      existing?.[buildingType] || building?.dimensionsByBuildingType?.[buildingType] || profiles[buildingType],
    );
  }
  const activeType = ['portal', 'room', 'vestibule', 'hall', 'grid'].includes(building?.buildingType)
    ? building.buildingType
    : building?.type === 'room' ? 'room' : 'portal';
  profiles[activeType] = buildingDimensionProfile(activeType, building);
  return profiles;
}

function applyBuildingDimensionProfile(building, buildingType, profile) {
  if (buildingType === 'portal') return {
    ...building,
    width: profile.width,
    iwanDepth: profile.iwanDepth,
    depth: profile.iwanDepth,
    height: profile.height,
    wallThickness: profile.wallThickness,
  };
  if (['hall', 'grid'].includes(buildingType)) return {
    ...building,
    hallGridX: profile.hallGridX,
    hallGridY: profile.hallGridY,
    hallBayWidth: profile.hallBayWidth,
    hallBayDepth: profile.hallBayDepth,
    gridBaySpansX: profile.gridBaySpansX,
    gridBaySpansY: profile.gridBaySpansY,
    height: profile.height,
    wallThickness: profile.wallThickness,
  };
  return {
    ...building,
    width: profile.width,
    length: profile.length,
    depth: profile.length,
    height: profile.height,
    wallThickness: profile.wallThickness,
  };
}

function greenPointHeightBelowLeg(arch, springHeight = null) {
  if (Number.isFinite(Number(arch?.greenHeightOffset))) {
    return Math.abs(Number(arch.greenHeightOffset));
  }
  if (Number.isFinite(Number(springHeight)) && Number.isFinite(Number(arch?.greenHeight))) {
    return Math.max(0, Number(springHeight) - Number(arch.greenHeight));
  }
  return 0;
}

const ARCH_ASSET_STORAGE_KEY = 'mehraz.arch-assets.v1';

function loadArchAssets() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(ARCH_ASSET_STORAGE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((asset) => asset && Number(asset.span) > 0 && asset.settings).map((asset) => ({
      ...asset,
      span: twoDecimalNumber(asset.span),
    }));
  } catch {
    return [];
  }
}

function persistArchAssets(assets) {
  try {
    window.localStorage.setItem(ARCH_ASSET_STORAGE_KEY, JSON.stringify(assets));
  } catch {
    // The editor remains usable when browser storage is unavailable.
  }
}

function withUiDeadline(promise, timeoutMs, message) {
  let timeoutId;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]).finally(() => window.clearTimeout(timeoutId));
}

async function sha256Json(value) {
  if (!globalThis.crypto?.subtle) return null;
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function downloadJson(filename, data) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadDataUrl(filename, dataUrl) {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  link.click();
}

function downloadText(filename, content, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function newPlacementId() {
  return globalThis.crypto?.randomUUID?.() || `placement-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function girihVisibleUnitSize(payload) {
  const flat = payload?.mehrazFlatPattern;
  const pieces = Array.isArray(flat?.pieces) ? flat.pieces : Array.isArray(payload?.pieces) ? payload.pieces : [];
  const points = [];
  pieces.forEach((piece) => {
    const rawPoints = Array.isArray(piece.points) ? piece.points : [];
    if (!rawPoints.length) return;
    if (flat?.pieces) {
      rawPoints.forEach((point) => points.push([
        safeNumber(Array.isArray(point) ? point[0] : point?.x),
        safeNumber(Array.isArray(point) ? point[1] : point?.y),
      ]));
      return;
    }
    const transform = piece.transform || {};
    const rotation = -safeNumber(transform.rotation ?? piece.rotation) * Math.PI / 180;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const scaleX = safeNumber(transform.scaleX ?? transform.scale?.[0] ?? piece.scaleX, 1) * (transform.mirrorHorizontal ? -1 : 1);
    const scaleY = safeNumber(transform.scaleY ?? transform.scale?.[1] ?? piece.scaleY, 1) * (transform.mirrorVertical ? -1 : 1);
    const offsetX = safeNumber(transform.x ?? piece.x);
    const offsetY = safeNumber(transform.y ?? piece.y);
    rawPoints.forEach((point) => {
      const x = safeNumber(Array.isArray(point) ? point[0] : point?.x) * scaleX;
      const y = safeNumber(Array.isArray(point) ? point[1] : point?.y) * scaleY;
      points.push([x * cos - y * sin + offsetX, x * sin + y * cos + offsetY]);
    });
  });
  if (!points.length) return null;
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const width = Math.max(...xs) - Math.min(...xs);
  const height = Math.max(...ys) - Math.min(...ys);
  return width > 0.01 && height > 0.01
    ? { width: Math.max(0.2, width), height: Math.max(0.2, height), normalizedPreview: false }
    : null;
}

function patternAssetUnitSize(asset) {
  const payload = asset?.currentVersion?.payload || asset?.assetPayload || {};
  if (asset?.asset_type === 'brick_bond' || asset?.assetType === 'brick_bond') {
    const pattern = payload.pattern || {};
    const bricks = Array.isArray(pattern.bricks) ? pattern.bricks : [];
    const unitWidth = Math.max(0.05, safeNumber(pattern.unitWidth, 0.15));
    const unitHeight = Math.max(0.02, safeNumber(pattern.unitHeight, 0.08));
    const columns = Math.max(1, safeNumber(pattern.columns, Math.max(1, ...bricks.map((brick) => safeNumber(brick.x) + safeNumber(brick.width, 1)))));
    const rows = Math.max(1, safeNumber(pattern.rows, Math.max(1, ...bricks.map((brick) => safeNumber(brick.y) + safeNumber(brick.height, 1)))));
    return { width: Math.max(0.15, columns * unitWidth), height: Math.max(0.08, rows * unitHeight), normalizedPreview: true };
  }
  const visible = girihVisibleUnitSize(payload);
  if (visible) return visible;
  const flat = payload.mehrazFlatPattern;
  const bounds = flat?.bounds || payload.bounds;
  if (bounds) {
    const width = Math.abs(safeNumber(bounds.maxX, 1) - safeNumber(bounds.minX, 0));
    const height = Math.abs(safeNumber(bounds.maxY, 1) - safeNumber(bounds.minY, 0));
    if (width > 0.01 && height > 0.01) return { width, height, normalizedPreview: false };
  }
  const pieces = Array.isArray(flat?.pieces) ? flat.pieces : Array.isArray(payload.pieces) ? payload.pieces : [];
  const points = pieces.flatMap((piece) => Array.isArray(piece.points) ? piece.points : []);
  const xs = points.map((point) => safeNumber(Array.isArray(point) ? point[0] : point?.x)).filter(Number.isFinite);
  const ys = points.map((point) => safeNumber(Array.isArray(point) ? point[1] : point?.y)).filter(Number.isFinite);
  if (xs.length && ys.length) {
    return {
      width: Math.max(0.2, Math.max(...xs) - Math.min(...xs)),
      height: Math.max(0.2, Math.max(...ys) - Math.min(...ys)),
      normalizedPreview: false,
    };
  }
  return { width: 2.2, height: 2.2, normalizedPreview: true };
}

function zoneTessellatedPlacements(zone, asset, building) {
  if (!zone || !asset?.currentVersion || !['girih_pattern', 'brick_bond'].includes(asset.asset_type)) return [];
  const bounds = zone.bounds || {};
  const zoneWidth = Math.max(0.2, safeNumber(bounds.width, 2));
  const zoneHeight = Math.max(0.2, safeNumber(bounds.height, 2));
  const unit = patternAssetUnitSize(asset);
  const unitWidth = Math.max(0.05, unit.width);
  const unitHeight = Math.max(0.05, unit.height);
  const uniformScale = Math.min(1, zoneWidth / unitWidth, zoneHeight / unitHeight);
  const tileWidth = unitWidth * uniformScale;
  const tileHeight = unitHeight * uniformScale;
  const displayScale = unit.normalizedPreview
    ? Math.max(tileWidth, tileHeight) / 2.2
    : uniformScale;
  const columns = Math.max(1, Math.ceil(zoneWidth / tileWidth));
  const rows = Math.max(1, Math.ceil(zoneHeight / tileHeight));
  const totalWidth = columns * tileWidth;
  const totalHeight = rows * tileHeight;
  const startU = safeNumber(bounds.u) - totalWidth / 2 + tileWidth / 2;
  const startV = safeNumber(bounds.v, building.height * 0.5) - totalHeight / 2 + tileHeight / 2;
  const placements = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const tileZone = {
        ...zone,
        bounds: {
          ...bounds,
          u: startU + tileWidth * column,
          v: startV + tileHeight * row,
          width: tileWidth,
          height: tileHeight,
        },
      };
      const world = zoneWorldTransform(tileZone, building);
      placements.push({
        id: `zone-${zone.id}-${asset.id}-${asset.currentVersion.id}-${column}-${row}`,
        zoneId: zone.id,
        generatedFromZone: true,
        assetId: asset.id,
        assetVersionId: asset.currentVersion.id,
        assetVersionNumber: asset.currentVersion.version_number,
        assetType: asset.asset_type,
        name: `${zone.name || 'Zone'} · ${asset.name}`,
        surfaceId: zone.surfaceId,
        transform: {
          position: world.position,
          rotation: world.rotation,
          scale: [displayScale, displayScale, displayScale],
        },
        options: { constrain: false, snap: 0 },
        assetPayload: asset.currentVersion.payload,
        zoneClip: {
          surfaceId: zone.surfaceId,
          bounds: {
            u: safeNumber(bounds.u),
            v: safeNumber(bounds.v, building.height * 0.5),
            width: zoneWidth,
            height: zoneHeight,
          },
        },
      });
    }
  }
  return placements;
}

function archMuqarnasTransform(buildingValue, wallValue, payload = null) {
  const b = normalizeBuilding(buildingValue);
  const walls = normalizeWallSystem(wallValue, b);
  return portalMuqarnasTransform(b, walls, payload);
}

function NumberField({ label, value, min, max, step = 0.1, onChange, disabled = false }) {
  return <StepperNumberField label={label} value={value} min={min} max={max} step={step} onChange={onChange} disabled={disabled} />;
}

function twoDecimalNumber(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.round((numeric + Number.EPSILON) * 100) / 100;
}

function ArchTypeToggle({ value = 'two-point', onChange, disabled = false, onDesign = null }) {
  if (onDesign) return <button type="button" className="arch-designer-open" disabled={disabled} onClick={onDesign}><ScanLine size={15} /> Design arch</button>;
  const normalizedValue = value === 'one-point' ? 'one-point' : 'two-point';
  return (
    <div className="room-cover-mode-group arch-type-toggle">
      <span>Arch type</span>
      <div className="room-cover-toggle hall-two-column-toggle" role="group" aria-label="Arch type">
        {[
          ['two-point', '2 pointed'],
          ['one-point', '1 pointed'],
        ].map(([type, label]) => <button
          type="button"
          key={type}
          className={normalizedValue === type ? 'active' : ''}
          aria-pressed={normalizedValue === type}
          disabled={disabled}
          onClick={() => onChange(type)}
        >{label}</button>)}
      </div>
    </div>
  );
}

function ArchDesignerPreview({ settings, span }) {
  const safeSpan = Math.max(0.2, Number(span) || 4);
  const halfSpan = safeSpan / 2;
  const greenHeight = -Math.max(0, Number(settings.greenHeightBelowLeg) || 0);
  const construction = pointedArchConstruction(
    0,
    halfSpan,
    0,
    Math.max(0.01, Number(settings.greenOffset) || 0.01),
    greenHeight,
    {
      archType: settings.archType,
      redOffset: Number(settings.redOffset) || 0,
      redRadius: settings.redRadius,
    },
  );
  if (!construction) return <div className="arch-designer-invalid">Adjust the points to create a valid arch.</div>;

  const curve = archCurve(0, halfSpan, 0, 0, construction.greenOffset, greenHeight, 52, {
    archType: settings.archType,
    redOffset: Number(settings.redOffset) || 0,
    redRadius: settings.redRadius,
  });
  const mirrored = (point) => ({ x: -point.x, y: point.y });
  const centers = construction.archType === 'one-point'
    ? [construction.greenCenter, mirrored(construction.greenCenter)]
    : [construction.redCenter, mirrored(construction.redCenter), construction.greenCenter, mirrored(construction.greenCenter)];
  const circles = construction.archType === 'one-point'
    ? [{ center: construction.greenCenter, radius: construction.greenRadius, tone: 'green' }, { center: mirrored(construction.greenCenter), radius: construction.greenRadius, tone: 'green' }]
    : [
      { center: construction.redCenter, radius: construction.redRadius, tone: 'red' },
      { center: mirrored(construction.redCenter), radius: construction.redRadius, tone: 'red' },
      { center: construction.greenCenter, radius: construction.greenRadius, tone: 'green' },
      { center: mirrored(construction.greenCenter), radius: construction.greenRadius, tone: 'green' },
    ];
  // Frame the built arch and every construction center, but not the complete
  // circles. Oversized circles intentionally clip at the preview edge.
  const archRise = Math.max(0.05, construction.apexPoint.y);
  const centerExtentX = Math.max(0, ...centers.map((center) => Math.abs(center.x)));
  const extentX = Math.max(halfSpan, centerExtentX) * 1.14;
  const requiredMinY = Math.min(0, ...centers.map((center) => center.y));
  const requiredMaxY = Math.max(archRise, ...centers.map((center) => center.y));
  const verticalPadding = Math.max(safeSpan * 0.04, (requiredMaxY - requiredMinY) * 0.08);
  const minY = requiredMinY - verticalPadding;
  const maxY = requiredMaxY + verticalPadding;
  const worldWidth = Math.max(0.1, extentX * 2);
  const worldHeight = Math.max(0.1, maxY - minY);
  const scale = Math.min(326 / worldWidth, 205 / worldHeight);
  const tx = 180;
  const ty = 222 + minY * scale;
  const point = ({ x, y }) => `${(tx + x * scale).toFixed(2)},${(ty - y * scale).toFixed(2)}`;
  const curvePath = curve.length ? `M ${curve.map(point).join(' L ')}` : '';
  const springLeft = { x: -halfSpan, y: 0 };
  const springRight = { x: halfSpan, y: 0 };
  const apex = construction.apexPoint;
  const tangent = construction.tangentPoint;
  const radiusLines = construction.archType === 'one-point'
    ? [[construction.greenCenter, construction.sidePoint], [mirrored(construction.greenCenter), mirrored(construction.sidePoint)]]
    : [
      [construction.redCenter, tangent],
      [mirrored(construction.redCenter), mirrored(tangent)],
      [construction.greenCenter, tangent],
      [mirrored(construction.greenCenter), mirrored(tangent)],
    ];

  return <svg className="arch-designer-preview" viewBox="0 0 360 250" role="img" aria-label="Front arch construction with dimensions, guide circles, centers, and radii">
    <rect x="0" y="0" width="360" height="250" rx="10" />
    <line className="arch-preview-axis" x1={tx} y1="12" x2={tx} y2="232" />
    <line className="arch-preview-spring" x1={point(springLeft).split(',')[0]} y1={point(springLeft).split(',')[1]} x2={point(springRight).split(',')[0]} y2={point(springRight).split(',')[1]} />
    {circles.map(({ center, radius, tone }, index) => <circle key={`${tone}-${index}`} className={`arch-preview-guide ${tone}`} cx={tx + center.x * scale} cy={ty - center.y * scale} r={radius * scale} />)}
    {radiusLines.map(([from, to], index) => <line key={`radius-${index}`} className="arch-preview-radius" x1={tx + from.x * scale} y1={ty - from.y * scale} x2={tx + to.x * scale} y2={ty - to.y * scale} />)}
    {centers.map((center, index) => <g key={`center-${index}`} className={index < (construction.archType === 'one-point' ? 0 : 2) ? 'red' : 'green'}><circle className="arch-preview-center" cx={tx + center.x * scale} cy={ty - center.y * scale} r="3.5" /><path d={`M ${tx + center.x * scale - 6} ${ty - center.y * scale}h12M ${tx + center.x * scale} ${ty - center.y * scale - 6}v12`} /></g>)}
    <path className="arch-preview-profile" d={curvePath} />
    <g className="arch-preview-dimension">
      <line x1={tx - halfSpan * scale} y1="238" x2={tx + halfSpan * scale} y2="238" />
      <path d={`M ${tx - halfSpan * scale} 233v10M ${tx + halfSpan * scale} 233v10`} />
      <text x="180" y="247">span {safeSpan.toFixed(2)} m</text>
      <line x1="344" y1={ty} x2="344" y2={ty - apex.y * scale} />
      <path d={`M339 ${ty}h10M339 ${ty - apex.y * scale}h10`} />
      <text x="338" y={(ty + ty - apex.y * scale) / 2} transform={`rotate(-90 338 ${(ty + ty - apex.y * scale) / 2})`}>rise {apex.y.toFixed(2)} m</text>
    </g>
  </svg>;
}

function ArchDesignerDialog({ designer, assets, onClose, onUpdate, onSaveAsset, onApplyAsset, onDeleteAsset }) {
  const [assetName, setAssetName] = useState('');
  useEffect(() => {
    if (designer?.title) setAssetName(designer.title);
  }, [designer?.title]);
  if (!designer) return null;
  const settings = designer.settings;
  const construction = pointedArchConstruction(0, Math.max(0.1, designer.span / 2), 0, Math.max(0.01, Number(settings.greenOffset) || 0.01), -Math.max(0, Number(settings.greenHeightBelowLeg) || 0), {
    archType: settings.archType,
    redOffset: Number(settings.redOffset) || 0,
    redRadius: settings.redRadius,
  });
  return <aside className="arch-designer-dialog" role="dialog" aria-modal="false" aria-labelledby="arch-designer-title" onPointerDown={(event) => event.stopPropagation()}>
    <header><div><strong id="arch-designer-title">Arch Designer</strong><small>{designer.title} · front view</small></div><button type="button" aria-label="Close Arch Designer" onClick={onClose}><X size={17} /></button></header>
    <ArchDesignerPreview settings={settings} span={designer.span} />
    <div className="arch-designer-readout" aria-label="Calculated arch dimensions">
      <span><small>Span</small><strong>{Number(designer.span).toFixed(2)} m</strong></span>
      <span><small>Rise</small><strong>{construction ? construction.apexPoint.y.toFixed(2) : '—'} m</strong></span>
      <span><small>Red radius</small><strong>{construction?.archType === 'two-point' ? `${construction.redRadius.toFixed(2)} m` : '—'}</strong></span>
      <span><small>Green radius</small><strong>{construction ? `${construction.greenRadius.toFixed(2)} m` : '—'}</strong></span>
    </div>
    <ArchTypeToggle value={settings.archType} disabled={designer.disabled} onChange={(archType) => onUpdate({ archType })} />
    <div className="field-grid arch-designer-fields">
      {Object.prototype.hasOwnProperty.call(settings, 'autoContinue') && <label className="check-field arch-designer-auto"><input type="checkbox" checked={settings.autoContinue === true} disabled={designer.disabled} onChange={(event) => onUpdate({ autoContinue: event.target.checked })} /><span>Automatically continue Pendentive curve</span></label>}
      {designer.spanEditable && <NumberField label="Arch span · m" value={designer.span} min={0.2} max={40} step={0.05} disabled={designer.disabled} onChange={(span) => onUpdate({ span })} />}
      {Number.isFinite(Number(settings.springHeightOffset)) && <NumberField label="Spring height offset · m" value={settings.springHeightOffset} min={-10} max={20} step={0.05} disabled={designer.disabled} onChange={(springHeightOffset) => onUpdate({ springHeightOffset })} />}
      {settings.archType !== 'one-point' && <NumberField label="Red point offset · m" value={settings.redOffset} min={-20} max={20} step={0.05} disabled={designer.disabled} onChange={(redOffset) => onUpdate({ redOffset })} />}
      <NumberField label="Green point offset · m" value={settings.greenOffset} min={0.05} max={20} step={0.05} disabled={designer.disabled} onChange={(greenOffset) => onUpdate({ greenOffset })} />
      <NumberField label="Green point below leg · m" value={settings.greenHeightBelowLeg} min={0} max={40} step={0.05} disabled={designer.disabled} onChange={(greenHeightBelowLeg) => onUpdate({ greenHeightBelowLeg })} />
    </div>
    <section className="arch-asset-library" aria-labelledby="arch-asset-library-title">
      <div className="arch-asset-heading"><div><strong id="arch-asset-library-title">Saved arch assets</strong><small>Profiles scale proportionally when the target span differs.</small></div></div>
      <div className="arch-asset-save-row">
        <input type="text" value={assetName} maxLength={80} aria-label="Arch asset name" onChange={(event) => setAssetName(event.target.value)} />
        <button type="button" disabled={!assetName.trim()} onClick={() => onSaveAsset(assetName.trim())}><Save size={14} /> Save</button>
      </div>
      <div className="arch-asset-list">
        {assets.map((asset) => <article key={asset.id}>
          <div><strong>{asset.name}</strong><small>{asset.settings.archType === 'one-point' ? '1 pointed' : '2 pointed'} · {Number(asset.span).toFixed(2)} m span</small></div>
          <button type="button" onClick={() => onApplyAsset(asset)}>Use</button>
          <button type="button" className="arch-asset-delete" aria-label={`Delete ${asset.name}`} onClick={() => onDeleteAsset(asset.id)}><Trash2 size={13} /></button>
        </article>)}
        {!assets.length && <p>No saved arch assets yet.</p>}
      </div>
    </section>
    <p>Changes apply live to this arch. Construction guides stay inside this front-view editor.</p>
  </aside>;
}

function FloorPlanIcon({ shape, half = false }) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeLinejoin: 'round',
  };
  return (
    <svg viewBox={half ? '-10 0 84 64' : '0 0 64 64'} aria-hidden="true" focusable="false">
      {half && shape === 'square' && <>
        <path d="M-7 55H9V10H55V55H71" {...common} strokeWidth="6" />
      </>}
      {half && shape === 'octagon' && <>
        <path d="M-8 55H8V27L22 9H42L56 27V55H72" {...common} strokeWidth="6" />
      </>}
      {half && shape === 'circle' && <>
        <path d="M-7 55H9V33a23 23 0 0 1 46 0v22H71" {...common} strokeWidth="6" />
      </>}
      {!half && shape === 'square' && <>
        <rect x="9" y="9" width="46" height="46" rx="1" {...common} strokeWidth="6" />
        <rect x="15" y="15" width="34" height="34" rx="1" {...common} strokeWidth="1.5" opacity=".7" />
      </>}
      {!half && shape === 'octagon' && <>
        <polygon points="22,8 42,8 56,22 56,42 42,56 22,56 8,42 8,22" {...common} strokeWidth="6" />
        <polygon points="24,15 40,15 49,24 49,40 40,49 24,49 15,40 15,24" {...common} strokeWidth="1.5" opacity=".7" />
      </>}
      {!half && shape === 'circle' && <>
        <circle cx="32" cy="32" r="23" {...common} strokeWidth="6" />
        <circle cx="32" cy="32" r="16.5" {...common} strokeWidth="1.5" opacity=".7" />
      </>}
      {!half && <path d="M25 57h14" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />}
    </svg>
  );
}

function ColumnProfileIcon({ profile }) {
  const common = {
    fill: 'currentColor',
    fillOpacity: 0.14,
    stroke: 'currentColor',
    strokeWidth: 4,
  };
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      {profile === 'circle'
        ? <>
          <circle cx="32" cy="32" r="22" {...common} />
          <path d="M14 35 35 14M18 46 46 18M29 51 51 29" fill="none" stroke="currentColor" strokeWidth="2" opacity=".7" />
        </>
        : <>
          <rect x="10" y="10" width="44" height="44" rx="1" {...common} />
          <path d="M12 29 29 12M12 45 45 12M20 52 52 20M36 52 52 36" fill="none" stroke="currentColor" strokeWidth="2" opacity=".7" />
        </>}
    </svg>
  );
}

function ExteriorColumnPlanIcon({ planShape = 'square', profile = 'circle' }) {
  const markerCenters = planShape === 'circle'
    ? [[32, 10], [47.5, 16.5], [54, 32], [47.5, 47.5], [32, 54], [16.5, 47.5], [10, 32], [16.5, 16.5]]
    : planShape === 'octagon'
      ? [[22, 9], [42, 9], [55, 22], [55, 42], [42, 55], [22, 55], [9, 42], [9, 22]]
      : [[10, 10], [54, 10], [54, 54], [10, 54]];
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      {planShape === 'circle'
        ? <circle className="context-plan-outline" cx="32" cy="32" r="22" />
        : planShape === 'octagon'
          ? <polygon className="context-plan-outline" points="22,9 42,9 55,22 55,42 42,55 22,55 9,42 9,22" />
          : <rect className="context-plan-outline" x="10" y="10" width="44" height="44" rx="1" />}
      {markerCenters.map(([x, y], index) => profile === 'circle'
        ? <circle className="context-column-marker" key={index} cx={x} cy={y} r="8" />
        : <rect className="context-column-marker" key={index} x={x - 7} y={y - 7} width="14" height="14" rx="1.2" />)}
    </svg>
  );
}

function LowerBuildingPlanIcon({ shape = 'follow', buildingShape = 'square', polygonSides = 6 }) {
  const resolvedShape = shape === 'follow' ? buildingShape : shape;
  const sides = resolvedShape === 'octagon'
    ? 8
    : resolvedShape === 'polygon' ? Math.max(3, Math.min(32, Math.round(Number(polygonSides) || 6))) : 4;
  const polygonPoints = Array.from({ length: sides }, (_, index) => {
    const angle = -Math.PI / 2 + index * Math.PI * 2 / sides;
    return `${32 + Math.cos(angle) * 22},${32 + Math.sin(angle) * 22}`;
  }).join(' ');
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      {resolvedShape === 'circle'
        ? <circle className="lower-plan-outline" cx="32" cy="32" r="22" />
        : resolvedShape === 'square'
          ? <rect className="lower-plan-outline" x="10" y="10" width="44" height="44" rx="1" />
          : <polygon className="lower-plan-outline" points={polygonPoints} />}
      {shape === 'follow' && <g className="lower-plan-follow-mark">
        <circle cx="49" cy="15" r="7" />
        <path d="M46 15h6M50 12l3 3-3 3" />
      </g>}
    </svg>
  );
}

function CircleColumnBoundaryIcon({ mode = 'columns', profile = 'circle' }) {
  const markerCount = 8;
  const markerRadius = mode === 'building' ? 14 : 22;
  const markerCenters = Array.from({ length: markerCount }, (_, index) => {
    const angle = -Math.PI / 2 + index * Math.PI * 2 / markerCount;
    return [32 + Math.cos(angle) * markerRadius, 32 + Math.sin(angle) * markerRadius];
  });
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <circle className="circle-boundary-plan" cx="32" cy="32" r="22" />
      {markerCenters.map(([x, y], index) => profile === 'square'
        ? <rect className="circle-boundary-column" key={index} x={x - 5} y={y - 5} width="10" height="10" rx="0.8" />
        : <circle className="circle-boundary-column" key={index} cx={x} cy={y} r="5" />)}
    </svg>
  );
}

function CoverTypeOption({ type, label }) {
  const hasImage = ['dome', 'cone', 'pyramid', 'barrel', 'rib-vault', 'raised-rib-vault'].includes(type);
  return <>
    {hasImage && <img
      src={`${import.meta.env.BASE_URL}cover-types/${type}.png`}
      alt=""
      aria-hidden="true"
      loading="lazy"
      decoding="async"
    />}
    <span>{label}</span>
  </>;
}

function StepperNumberField({ label, value, min, max, step = 0.1, onChange, disabled = false }) {
  const normalizedStep = Number.isInteger(Number(step)) ? Number(step) : Math.max(0.01, twoDecimalNumber(Math.abs(step)));
  const normalizedMin = Number.isFinite(Number(min)) ? (Number(min) > 0 ? Math.ceil(Number(min) * 100) / 100 : twoDecimalNumber(min)) : undefined;
  const normalizedMax = Number.isFinite(Number(max)) ? (Number(max) < 0 ? Math.floor(Number(max) * 100) / 100 : twoDecimalNumber(max)) : undefined;
  const displayValue = Math.min(normalizedMax ?? Infinity, Math.max(normalizedMin ?? -Infinity, twoDecimalNumber(value)));
  const move = (direction) => {
    const current = displayValue;
    const increment = normalizedStep || 0.1;
    const lower = normalizedMin ?? -Infinity;
    const upper = normalizedMax ?? Infinity;
    const next = twoDecimalNumber(Math.min(upper, Math.max(lower, current + increment * direction)));
    onChange(next);
  };
  return (
    <label>
      <span>{label}</span>
      <span className="solution-number-control">
        <input type="number" value={displayValue} min={normalizedMin} max={normalizedMax} step={normalizedStep} disabled={disabled} onChange={(event) => onChange(twoDecimalNumber(event.target.value))} />
        <span className="solution-number-buttons">
          <button type="button" tabIndex={-1} data-karbandi-input-control aria-label={`Increase ${label}`} disabled={disabled} onClick={() => move(1)}>▲</button>
          <button type="button" tabIndex={-1} data-karbandi-input-control aria-label={`Decrease ${label}`} disabled={disabled} onClick={() => move(-1)}>▼</button>
        </span>
      </span>
    </label>
  );
}

function CollapsiblePanel({ open, onToggle, icon, title, subtitle, guide = null, children, className = '', panelRef = null, collapsible = true, hideHeading = false }) {
  const heading = (
    <>
      {icon}
      <div><strong className="guided-heading">{title}{guide && <HelpTooltip label={typeof title === 'string' ? title : 'Section'}>{guide}</HelpTooltip>}</strong>{subtitle && <small>{subtitle}</small>}</div>
    </>
  );

  return (
    <section ref={panelRef} className={`inspector-section collapsible-panel ${className}`}>
      {!hideHeading && (collapsible ? (
        <button type="button" className="section-heading collapsible-heading" onClick={onToggle}>
          {heading}
          <span className="collapse-mark">{open ? '−' : '+'}</span>
        </button>
      ) : (
        <div className="section-heading">{heading}</div>
      ))}
      {(!collapsible || open) && <div className="collapsible-body">{children}</div>}
    </section>
  );
}

function HelpTooltip({ label, children }) {
  return (
    <span className="help-tooltip">
      <button type="button" className="help-tooltip-trigger" aria-label={`Show ${label} guide`} aria-describedby={`${label.replace(/\s+/g, '-').toLowerCase()}-guide`}>?</button>
      <span id={`${label.replace(/\s+/g, '-').toLowerCase()}-guide`} className="help-tooltip-content" role="tooltip">{children}</span>
    </span>
  );
}

function authRedirectUrl() {
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return window.location.origin + window.location.pathname;
  }
  return 'https://mehraz.girihstudio.com/';
}

function App() {
  const viewportRef = useRef(null);
  const sceneRef = useRef(null);
  const sceneHasInitialArchitectureRef = useRef(false);
  const importRef = useRef(null);
  const exportPanRef = useRef(null);
  const buildingRef = useRef(null);
  const wallsRef = useRef(null);
  const inspectorRef = useRef(null);
  const constructionStepListRef = useRef(null);
  const draggedConstructionStepRef = useRef(null);
  const wallSettingsRef = useRef(null);
  const wallNorthSidesRef = useRef(null);
  const wallNorthTopRef = useRef(null);
  const wallSouthRef = useRef(null);
  const wallEastRef = useRef(null);
  const wallWestRef = useRef(null);
  const wallArchRef = useRef(null);
  const roomDomeRef = useRef(null);
  const roomDomeArchRef = useRef(null);
  const roomInnerDomeRef = useRef(null);
  const roomDomeDrumRef = useRef(null);
  const roomDomeExtraLegRef = useRef(null);
  const roomDomeRingRef = useRef(null);
  const roomTransitionRef = useRef(null);
  const placementsRef = useRef([]);
  const projectInstancesRef = useRef([]);
  const compositionReturnRef = useRef(null);
  const zonesRef = useRef([]);
  const selectedPlacementIdRef = useRef(null);
  const selectedProjectInstanceIdRef = useRef(null);
  const selectedZoneIdRef = useRef(null);
  const assembliesRef = useRef([]);
  const nightLightingRef = useRef({ preview: false, guides: false, selectedId: null, lights: [] });
  const historyRef = useRef({ past: [], present: null, future: [] });
  const restoringHistoryRef = useRef(false);
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [library, setLibrary] = useState([]);
  const [libraryPanelOpen, setLibraryPanelOpen] = useState(false);
  const [assetContextMenu, setAssetContextMenu] = useState(null);
  const [projects, setProjects] = useState([]);
  const [projectVersionsById, setProjectVersionsById] = useState({});
  const [libraryNextCursor, setLibraryNextCursor] = useState(null);
  const [libraryHasMore, setLibraryHasMore] = useState(false);
  const [libraryLoadingMore, setLibraryLoadingMore] = useState(false);
  const [libraryBusy, setLibraryBusy] = useState(false);
  const libraryRefreshRef = useRef({ id: 0, controller: null });
  const projectLoadRequestRef = useRef(0);
  const [libraryMessage, setLibraryMessage] = useState('');
  const [libraryEdit, setLibraryEdit] = useState({ name: '', description: '' });
  const [libraryVersions, setLibraryVersions] = useState([]);
  const [selectedLibraryVersionId, setSelectedLibraryVersionId] = useState('');
  const [collapsedLibraryGroups, setCollapsedLibraryGroups] = useState({});
  const [selectedAssetId, setSelectedAssetId] = useState('');
  const [building, setBuilding] = useState(() => normalizeBuilding());
  const buildingDimensionsRef = useRef(defaultBuildingDimensionProfiles());
  const combinationProfilesRef = useRef({ profiles: {}, activeByBuildingType: {} });
  const [walls, setWalls] = useState(() => {
    const initialBuilding = normalizeBuilding();
    return portalDefaultWallSystem(DEFAULT_WALL_SYSTEM, initialBuilding);
  });
  const [nightLighting, setNightLighting] = useState({ preview: false, guides: false, selectedId: null, lights: [] });
  const [zones, setZones] = useState([]);
  const [assemblies, setAssemblies] = useState([]);
  const [placements, setPlacements] = useState([]);
  const [projectInstances, setProjectInstances] = useState([]);
  const [selectedProjectInstanceId, setSelectedProjectInstanceId] = useState(null);
  const [editingProjectInstance, setEditingProjectInstance] = useState(null);
  const [muqarnasDimensionsById, setMuqarnasDimensionsById] = useState({});
  const [selectedPlacementId, setSelectedPlacementId] = useState(null);
  const [selectedZoneId, setSelectedZoneId] = useState(null);
  const [selectedAssemblyId, setSelectedAssemblyId] = useState(null);
  const [assemblyDraftSelection, setAssemblyDraftSelection] = useState([]);
  const [targetSurfaceId, setTargetSurfaceId] = useState('north_interior');
  const [selectedWallSide, setSelectedWallSide] = useState(null);
  const [selectedGridBay, setSelectedGridBay] = useState(null);
  const [selectedGridBays, setSelectedGridBays] = useState([]);
  const [selectedGridElement, setSelectedGridElement] = useState(null);
  const [selectedGridElements, setSelectedGridElements] = useState([]);
  const [gridGuideMode, setGridGuideMode] = useState('bays');
  const [gridFloorPlanVisible, setGridFloorPlanVisible] = useState(false);
  const [activeHallInputGuide, setActiveHallInputGuide] = useState(null);
  const [archDesigner, setArchDesigner] = useState(null);
  const [archAssets, setArchAssets] = useState(loadArchAssets);
  const activeGridBayX = Math.max(0, Math.min((building.hallGridX || 1) - 1, selectedGridBay?.[0] || 0));
  const activeGridBayY = Math.max(0, Math.min((building.hallGridY || 1) - 1, selectedGridBay?.[1] || 0));
  const activeGridBayKey = `${activeGridBayX}:${activeGridBayY}`;
  const validSelectedGridBays = selectedGridBays.filter((key) => {
    const [ix, iy] = key.split(':').map(Number);
    return ix >= 0 && ix < building.hallGridX && iy >= 0 && iy < building.hallGridY;
  });
  const activeGridBayKeys = validSelectedGridBays;
  const selectedGridColumns = [...new Set(activeGridBayKeys.map((key) => Number(key.split(':')[0])))];
  const selectedGridRows = [...new Set(activeGridBayKeys.map((key) => Number(key.split(':')[1])))];
  const selectedGridCovers = [...new Set(activeGridBayKeys.map((key) => building.gridBayCovers?.[key] || building.hallCoverType || 'dome'))];
  const selectedGridTransitions = [...new Set(activeGridBayKeys.map((key) => building.gridBayTransitions?.[key] || building.hallTransitionType || 'pendentive'))];
  const activeGridElements = selectedGridElements;
  const highlightedGridSelections = gridGuideMode === 'elements' && activeGridElements.length
    ? activeGridElements
    : activeGridBayKeys.flatMap((key) => {
      const [ix, iy] = key.split(':').map(Number);
      const cover = building.gridBayCovers?.[key] || building.hallCoverType || 'dome';
      return [
        { id: `vault:x:${ix}:${iy}` },
        { id: `vault:x:${ix}:${iy + 1}` },
        { id: `vault:y:${ix}:${iy}` },
        { id: `vault:y:${ix + 1}:${iy}` },
        { id: `${cover === 'dome' ? 'dome' : 'cover'}:${ix}:${iy}` },
        { id: `transition:${ix}:${iy}` },
        ...(iy === 0 ? [{ id: `wall:north:${ix}` }] : []),
        ...(iy === building.hallGridY - 1 ? [{ id: `wall:south:${ix}` }] : []),
        ...(ix === 0 ? [{ id: `wall:west:${iy}` }] : []),
        ...(ix === building.hallGridX - 1 ? [{ id: `wall:east:${iy}` }] : []),
      ];
    });
  const [selectedOpeningGuide, setSelectedOpeningGuide] = useState(null);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [projectName, setProjectName] = useState('My Mehraz portal');
  const [projectVersionRetention, setProjectVersionRetention] = useState(20);
  const [activeProjectAssetId, setActiveProjectAssetId] = useState(null);
  const [activeProjectVersionId, setActiveProjectVersionId] = useState(null);
  const [selectedProjectVersionId, setSelectedProjectVersionId] = useState('');
  const [rightTab, setRightTab] = useState('building');
  const [stageView, setStageView] = useState('front');
  const [roomSectionView, setRoomSectionView] = useState(false);
  const [roomSectionAxis, setRoomSectionAxis] = useState('x');
  const [collapsedSections, setCollapsedSections] = useState({
    buildingDimensions: true,
    buildingSurfaces: true,
    wallGeneral: true,
    wallArch: true,
    wallNorthSides: true,
    wallNorthTop: true,
    wallSouth: true,
    wallEast: true,
    wallWest: true,
    coverKarbandi: true,
    lightsGeneral: true,
    lightsSelected: true,
    placementBasics: true,
    placementSnapping: true,
    placementTransform: true,
    placementRepeat: true,
    zonesCreate: true,
    zonesSelected: true,
    constructionSteps: true,
    scheduleSummary: true,
    scheduleCreate: true,
    scheduleSelected: true,
    scheduleTable: true,
    projectLibrary: true,
  });
  const [transformMode, setTransformMode] = useState('translate');
  const [stageRenderMode, setStageRenderMode] = useState('textured');
  const [repeatOptions, setRepeatOptions] = useState({ columns: 2, rows: 1, spacingU: 2.5, spacingV: 2.5 });
  const [constructionStep, setConstructionStep] = useState(0);
  const [constructionDuration, setConstructionDuration] = useState(15);
  const [constructionPlaying, setConstructionPlaying] = useState(false);
  const constructionPlaybackRef = useRef({ id: 0, timer: null });
  const [constructionStepOrder, setConstructionStepOrder] = useState(() => normalizeConstructionStepOrder());
  const [buildingTypeSelected, setBuildingTypeSelected] = useState(false);
  const [buildingTypePickerExpanded, setBuildingTypePickerExpanded] = useState(true);
  const selectedBuildingType = building.buildingType || (building.type === 'room' ? 'room' : 'portal');
  const selectedBuildingTypeLabel = ({
    portal: 'Portal', room: 'Room', vestibule: 'Vestibule', hall: 'Hall', grid: 'Grid',
  })[selectedBuildingType] || 'Building';
  const constructionOrderRank = new Map(constructionStepOrder.map((id, index) => [id, index]));
  const displayedConstructionSteps = constructionStepsForBuilding(building, walls)
    .sort((left, right) => (
      (constructionOrderRank.get(left.id) ?? Number.MAX_SAFE_INTEGER)
      - (constructionOrderRank.get(right.id) ?? Number.MAX_SAFE_INTEGER)
    ));
  const constructionGuide = ['hall', 'grid'].includes(building.buildingType)
    ? `The Hall sequence raises perimeter walls and grid columns, builds every X/Y bearing vault, then constructs ${building.hallCoverType === 'raised-rib-vault' ? 'the raised transition walls and rib-vault covers' : building.hallCoverType === 'rib-vault' ? 'the flush rib-vault covers directly on the arches' : building.hallCoverType === 'barrel' ? `the continuous ${String(building.hallBarrelAxis || 'x').toUpperCase()}-axis Barrel cover` : building.hallCoverType === 'none' ? 'the selected bay transitions without an upper cover' : 'the selected bay transitions and domes'} one bay at a time.`
    : building.type === 'room'
      ? 'The sequence follows the current Room or Vestibule model: walls and openings first, then only the selected transition structure and cover, followed by the drum, upper cover, and decoration that actually exist.'
      : 'The Portal sequence follows the selected Barrel, Karbandi, Squinch, Muqarnas, and dome combination. Only construction stages used by the current model are shown.';
  useEffect(() => {
    if (displayedConstructionSteps.some((step) => step.index === constructionStep)) return;
    setConstructionStep(CONSTRUCTION_STEPS.length - 1);
  }, [constructionStep, displayedConstructionSteps]);
  const [welcomeDismissed, setWelcomeDismissed] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportPreview, setExportPreview] = useState('');
  const [exportBusy, setExportBusy] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportOptions, setExportOptions] = useState({
    format: 'png',
    paper: 'a4',
    orientation: 'portrait',
    view: 'current',
    dpi: 450,
    style: 'solid',
    lighting: 'day',
    reflectionStrength: 0.72,
    seamless: false,
    seamlessColor: '#f2d336',
    seamlessEdges: false,
    seamlessWallEdges: false,
    seamlessNorthBoundary: false,
    wallEdgeColor: '#79610c',
    wallEdgeThickness: 2,
    groundColor: '#fbf0bc',
    shadows: true,
    stageRenderMode: 'textured',
    orbitDuration: 10,
    zoom: 1,
    panX: 0,
    panY: 0,
  });

  const surfaces = useMemo(() => buildingSurfaces(building), [building]);
  const selectedPlacement = placements.find((placement) => placement.id === selectedPlacementId) || null;
  const archMuqarnasPlacement = placements.find((placement) => placement.role === 'arch-muqarnas') || null;
  const roomDomeMuqarnasPlacement = placements.find((placement) => placement.role === 'room-dome-muqarnas') || null;
  const archMuqarnasMetrics = useMemo(
    () => (archMuqarnasPlacement ? muqarnasPreviewMetrics(archMuqarnasPlacement.assetPayload || {}) : null),
    [archMuqarnasPlacement?.assetVersionId],
  );
  const archMuqarnasDimensions = archMuqarnasPlacement
    ? muqarnasDimensionsById[archMuqarnasPlacement.id] || [
      archMuqarnasMetrics.width * Math.abs(archMuqarnasPlacement.transform?.scale?.[0] || 1),
      archMuqarnasMetrics.height * Math.abs(archMuqarnasPlacement.transform?.scale?.[1] || 1),
      archMuqarnasMetrics.depth * Math.abs(archMuqarnasPlacement.transform?.scale?.[2] || 1),
    ]
    : null;
  const selectedZone = zones.find((zone) => zone.id === selectedZoneId) || null;
  const selectedWallSurfaceId = selectedWallSide ? surfaceIdForWallSide(selectedWallSide, building) : null;
  const selectedWallZones = selectedWallSurfaceId
    ? zones.filter((zone) => (
      zone.wallSide
        ? zone.wallSide === selectedWallSide
          || (zone.wallSide === 'arch' && selectedWallSide === 'south_arch')
          || (building.type === 'room' && ['north', 'north_sides'].includes(zone.wallSide) && ['north', 'north_sides'].includes(selectedWallSide))
        : zone.surfaceId === selectedWallSurfaceId || (selectedWallSurfaceId === 'south_interior' && zone.surfaceId === 'south_facade')
    ))
    : [];
  const selectedWallLabel = WALL_BOND_LABELS[selectedWallSide === 'south_arch' ? 'arch' : selectedWallSide] || selectedWallSide || 'Wall';
  const selectedOpeningGuideParts = String(selectedOpeningGuide || '').split(':');
  const selectedOpeningGuideType = selectedOpeningGuideParts.at(-1) || null;
  const selectedOpeningGuideSide = selectedOpeningGuideParts.length > 1 ? selectedOpeningGuideParts[0] : 'south';
  const selectedRoomPlanOpeningGuideId = selectedOpeningGuideParts[0] === 'plan'
    ? selectedOpeningGuideParts.slice(1).join(':')
    : null;
  const roomTransitionAvailable = building.type === 'room' && (
    (building.roomPlanShape || 'square') === 'square'
    || building.buildingType === 'vestibule'
  );
  const karbandiReferenceDepth = building.type === 'room'
    ? Math.max(0.2, Math.min(building.width, building.depth) / 2)
    : building.depth;
  const selectedAssembly = assemblies.find((assembly) => assembly.id === selectedAssemblyId) || null;
  const selectedAsset = library.find((asset) => asset.id === selectedAssetId) || null;
  const selectedLibraryVersion = libraryVersions.find((version) => version.id === selectedLibraryVersionId) || selectedAsset?.currentVersion || null;
  const linkedContextAsset = useMemo(() => {
    if (!assetContextMenu) return null;
    if (assetContextMenu.kind === 'placement') {
      const placement = placements.find((item) => item.id === assetContextMenu.id);
      return placement?.assetId ? { assetId: placement.assetId, versionId: placement.assetVersionId, assetType: placement.assetType, name: placement.name } : null;
    }
    if (assetContextMenu.kind === 'zone') {
      const zone = zones.find((item) => item.id === assetContextMenu.id);
      return zone?.assetId ? { assetId: zone.assetId, versionId: zone.assetVersionId, assetType: zone.assetType, name: zone.assetName || zone.name } : null;
    }
    if (assetContextMenu.kind === 'wall') {
      return wallContextLibraryAsset(walls.bricks?.sideBonds, assetContextMenu.id);
    }
    return null;
  }, [assetContextMenu, placements, zones, walls]);
  const selectedNightLight = nightLighting.lights.find((light) => light.id === nightLighting.selectedId) || null;
  const portalTransitionType = walls.portalTransition
    || (walls.karbandi?.enabled === true ? 'karbandi' : 'squinch');
  const portalTransitionOptions = (building.portalPlanShape || 'square') === 'square'
    ? [
      ['none', 'None'],
      ['karbandi', 'Karbandi'],
      ['squinch', 'Squinch'],
      ['muqarnas', 'Muqarnas'],
    ]
    : [['none', 'None'], ['karbandi', 'Karbandi']];
  const portalCoverType = walls.portalCover
    || (walls.ahang?.enabled === true ? 'ahang' : 'none');
  const portalTransitionAvailable = building.type !== 'room';
  const transitionAvailable = roomTransitionAvailable || portalTransitionAvailable;
  const sliceAvailable = building.type === 'room'
    || building.buildingType === 'portal'
    || projectInstances.length > 0;
  const mehrazHasProjectWork = useMemo(() => {
    if (placements.length || projectInstances.length || assemblies.length || zones.length || nightLighting.lights.length || activeProjectAssetId) return true;
    const defaultBuilding = normalizeBuilding();
    const defaultWalls = portalDefaultWallSystem(DEFAULT_WALL_SYSTEM, defaultBuilding);
    return JSON.stringify(building) !== JSON.stringify(defaultBuilding)
      || JSON.stringify(walls) !== JSON.stringify(defaultWalls);
  }, [activeProjectAssetId, assemblies.length, building, nightLighting.lights.length, placements.length, projectInstances.length, walls, zones.length]);
  const groupedLibrary = useMemo(() => LIBRARY_APP_GROUPS.map((group) => ({
    ...group,
    assets: library.filter((asset) => group.assetTypes.includes(asset.asset_type)),
  })), [library]);
  const brickBondAssets = library.filter((asset) => asset.asset_type === 'brick_bond' && asset.currentVersion);
  const wallPatternAssets = library.filter((asset) => ['brick_bond', 'girih_pattern'].includes(asset.asset_type) && asset.currentVersion);
  const zonePatternAssets = wallPatternAssets;
  const muqarnasAssets = library.filter((asset) => asset.asset_type === 'muqarnas_assembly' && asset.currentVersion);
  const activeProject = projects.find((project) => project.id === activeProjectAssetId) || null;
  const activeProjectVersions = activeProject ? projectVersionsById[activeProject.id] || [] : [];
  const selectedProjectVersion = activeProjectVersions.find((version) => version.id === selectedProjectVersionId) || null;
  useEffect(() => {
    setProjectVersionRetention(Number(activeProject?.version_retention_limit) || 20);
  }, [activeProject?.id, activeProject?.version_retention_limit]);
  useEffect(() => {
    if (!selectedAsset) {
      setLibraryEdit({ name: '', description: '' });
      setLibraryVersions([]);
      setSelectedLibraryVersionId('');
      return;
    }
    setLibraryEdit({ name: selectedAsset.name || '', description: selectedAsset.description || '' });
    if (selectedAsset.id.startsWith('legacy-')) {
      setLibraryVersions([selectedAsset.currentVersion].filter(Boolean));
      setSelectedLibraryVersionId(selectedAsset.current_version_id || selectedAsset.currentVersion?.id || '');
      return;
    }
    let active = true;
    const controller = new AbortController();
    readLibraryVersionListCache(selectedAsset.id).then((cached) => {
      if (active && Array.isArray(cached?.versions)) setLibraryVersions(cached.versions);
    });
    listLibraryAssetVersions(supabase, selectedAsset.id, { signal: controller.signal })
      .then((versions) => {
        if (!active) return;
        setLibraryVersions(versions);
        writeLibraryVersionListCache(selectedAsset.id, versions);
        setSelectedLibraryVersionId((current) => (
          versions.some((version) => version.id === current)
            ? current
            : selectedAsset.current_version_id || versions[0]?.id || ''
        ));
      })
      .catch((error) => {
        if (!controller.signal.aborted) setLibraryMessage(error.message);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [selectedAsset?.id]);

  useEffect(() => {
    if (!activeProject) return undefined;
    let active = true;
    const controller = new AbortController();
    readLibraryVersionListCache(activeProject.id).then((cached) => {
      if (!active || !Array.isArray(cached?.versions)) return;
      setProjectVersionsById((current) => ({ ...current, [activeProject.id]: cached.versions }));
    });
    listLibraryAssetVersions(supabase, activeProject.id, { signal: controller.signal })
      .then((versions) => {
        if (!active) return;
        setProjectVersionsById((current) => ({ ...current, [activeProject.id]: versions }));
        writeLibraryVersionListCache(activeProject.id, versions);
        setSelectedProjectVersionId((current) => (
          versions.some((version) => version.id === current)
            ? current
            : activeProject.current_version_id || versions[0]?.id || ''
        ));
      })
      .catch((error) => {
        if (!controller.signal.aborted) setLibraryMessage(error.message);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [activeProject?.id]);
  const renderedPlacements = useMemo(() => {
    return placements
      .filter((placement) => !placement.generatedFromZone)
      .filter((placement) => placement.role !== 'arch-muqarnas' || building.type !== 'room')
      .filter((placement) => placement.role !== 'room-dome-muqarnas' || (
        building.type === 'room'
        && building.domeEnabled !== false
        && building.domeTransition === 'muqarnas'
      ))
      .map((placement) => {
        if (placement.assetPayload) return placement;
        const asset = library.find((item) => (
          item.id === placement.assetId
          && item.currentVersion?.id === placement.assetVersionId
        ));
        return asset?.currentVersion?.payload ? { ...placement, assetPayload: asset.currentVersion.payload } : placement;
      });
  }, [placements, library, building.type, building.domeEnabled, building.domeTransition]);
  const surfaceById = useMemo(() => new Map(surfaces.map((surface) => [surface.id, surface])), [surfaces]);
  const assemblyByPlacement = useMemo(() => {
    const result = new Map();
    assemblies.forEach((assembly) => assembly.placementIds.forEach((id) => result.set(id, assembly)));
    return result;
  }, [assemblies]);
  const scheduleRows = useMemo(() => {
    const rows = new Map();
    renderedPlacements.forEach((placement) => {
      const assembly = assemblyByPlacement.get(placement.id);
      const key = [placement.assetVersionId, placement.surfaceId, assembly?.id || 'unassigned'].join(':');
      const scale = placement.transform?.scale || [1, 1, 1];
      const unitArea = Math.abs(Number(scale[0] || 1) * Number(scale[1] || scale[0] || 1)) * 4.84;
      if (!rows.has(key)) rows.set(key, {
        key,
        item: placement.name,
        assetType: placement.assetType,
        version: placement.assetVersionNumber,
        surface: surfaceById.get(placement.surfaceId)?.label || placement.surfaceId,
        quantity: 0,
        unitArea,
        totalArea: 0,
        assembly: assembly?.name || 'Unassigned',
        status: assembly?.status || 'planned',
      });
      const row = rows.get(key);
      row.quantity += 1;
      row.totalArea += unitArea;
    });
    return [...rows.values()].sort((a, b) => a.surface.localeCompare(b.surface) || a.item.localeCompare(b.item));
  }, [renderedPlacements, assemblyByPlacement, surfaceById]);
  const constructionSummary = useMemo(() => {
    const b = building;
    const portalOpening = b.type === 'iwan' ? b.openingWidth * b.openingHeight * 0.78 : 0;
    const wallArea = (b.width * b.height * 2 + b.depth * b.height * 2) - portalOpening;
    const floorArea = b.width * b.depth;
    const zoneArea = zones.reduce((sum, zone) => sum + Number(zone.bounds?.width || 0) * Number(zone.bounds?.height || 0), 0);
    const decorationArea = scheduleRows.reduce((sum, row) => sum + row.totalArea, 0);
    return { wallArea, floorArea, zoneArea, decorationArea };
  }, [building, zones, scheduleRows]);
  buildingDimensionsRef.current = captureBuildingDimensionProfiles(
    building,
    building.dimensionsByBuildingType || buildingDimensionsRef.current,
  );
  buildingRef.current = { ...building, dimensionsByBuildingType: buildingDimensionsRef.current };
  wallsRef.current = walls;
  useEffect(() => {
    combinationProfilesRef.current = saveCombinationProfile(
      combinationProfilesRef.current,
      buildingRef.current,
      wallsRef.current,
    );
  }, [building, walls]);
  placementsRef.current = placements;
  projectInstancesRef.current = projectInstances;
  zonesRef.current = zones;
  selectedPlacementIdRef.current = selectedPlacementId;
  selectedProjectInstanceIdRef.current = selectedProjectInstanceId;
  selectedZoneIdRef.current = selectedZoneId;
  assembliesRef.current = assemblies;
  nightLightingRef.current = nightLighting;

  function toggleSection(section) {
    setCollapsedSections((value) => ({ ...value, [section]: !value[section] }));
  }

  function openSection(section) {
    setCollapsedSections((value) => ({ ...value, [section]: false }));
  }

  function wallSectionForSide(side) {
    if (side === 'south_arch' || side === 'arch') return 'wallArch';
    if (side === 'north' || side === 'north_sides') return 'wallNorthSides';
    if (side === 'north_top') return 'wallNorthTop';
    if (side === 'south') return 'wallSouth';
    if (side === 'east') return 'wallEast';
    if (side === 'west') return 'wallWest';
    return 'wallNorthSides';
  }

  function wallSectionRefForSide(side) {
    if (side === 'south_arch' || side === 'arch') return wallArchRef;
    if (side === 'north' || side === 'north_sides') return wallNorthSidesRef;
    if (side === 'north_top') return wallNorthTopRef;
    if (side === 'south') return wallSouthRef;
    if (side === 'east') return wallEastRef;
    if (side === 'west') return wallWestRef;
    return wallSettingsRef;
  }

  function focusWallSection(side) {
    const section = wallSectionForSide(side);
    setCollapsedSections((value) => ({
      ...value,
      wallNorthSides: true,
      wallNorthTop: true,
      wallSouth: true,
      wallEast: true,
      wallWest: true,
      wallArch: true,
      [section]: false,
    }));
    scrollInspectorTo(wallSectionRefForSide(side));
  }

  function scrollInspectorTo(ref) {
    requestAnimationFrame(() => {
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function showConstructionStep(index) {
    constructionPlaybackRef.current.id += 1;
    window.clearTimeout(constructionPlaybackRef.current.timer);
    constructionPlaybackRef.current.timer = null;
    setConstructionPlaying(false);
    sceneRef.current?.stopConstructionSequence();
    setConstructionStep(index);
    sceneRef.current?.setConstructionStepOrder(constructionStepOrder);
    sceneRef.current?.applyConstructionStep(index);
    setRightTab('construction');
    openSection('constructionSteps');
  }

  function playConstructionSteps() {
    setRightTab('construction');
    openSection('constructionSteps');
    const scene = sceneRef.current;
    if (!scene) {
      setConstructionPlaying(false);
      setLibraryMessage('The 3D stage is not ready. Reload the project and try the animation again.');
      return;
    }
    constructionPlaybackRef.current.id += 1;
    const playbackId = constructionPlaybackRef.current.id;
    window.clearTimeout(constructionPlaybackRef.current.timer);
    const finishPlaybackUi = () => {
      if (constructionPlaybackRef.current.id !== playbackId) return;
      window.clearTimeout(constructionPlaybackRef.current.timer);
      constructionPlaybackRef.current.timer = null;
      setConstructionStep(CONSTRUCTION_STEPS.length - 1);
      setConstructionPlaying(false);
    };
    // The scene has its own rendering watchdog. This independent UI deadline
    // guarantees that drag/drop and building selection are released even if a
    // browser drops the renderer's final callback after the model looks done.
    const minimumStepTime = displayedConstructionSteps.length * 350;
    const playbackDeadline = Math.max(constructionDuration * 1000, minimumStepTime)
      + displayedConstructionSteps.length * 160 + 2000;
    constructionPlaybackRef.current.timer = window.setTimeout(finishPlaybackUi, playbackDeadline);
    setConstructionPlaying(true);
    try {
      scene.setConstructionStepOrder(constructionStepOrder);
      scene.playConstructionSequence(
        constructionDuration,
        (index) => {
          setConstructionStep(index);
          if (CONSTRUCTION_STEPS[index]?.id === 'complete') finishPlaybackUi();
        },
        finishPlaybackUi,
      );
    } catch (error) {
      console.error('Could not start construction animation.', error);
      constructionPlaybackRef.current.id += 1;
      window.clearTimeout(constructionPlaybackRef.current.timer);
      constructionPlaybackRef.current.timer = null;
      scene.stopConstructionSequence();
      setConstructionPlaying(false);
      setLibraryMessage(`Could not play the construction animation: ${error?.message || 'Unknown stage error'}`);
    }
  }

  function moveConstructionStep(sourceId, targetId) {
    if (!sourceId || !targetId || sourceId === targetId
      || ['empty', 'complete'].includes(sourceId)) return;
    const visibleIds = displayedConstructionSteps.map((step) => step.id);
    const reorderedVisibleIds = [...visibleIds];
    const sourceIndex = reorderedVisibleIds.indexOf(sourceId);
    const targetIndex = reorderedVisibleIds.indexOf(targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const [movedId] = reorderedVisibleIds.splice(sourceIndex, 1);
    reorderedVisibleIds.splice(targetIndex, 0, movedId);
    const visibleSet = new Set(visibleIds);
    let replacementIndex = 0;
    const nextOrder = normalizeConstructionStepOrder(constructionStepOrder.map((id) => (
      visibleSet.has(id) ? reorderedVisibleIds[replacementIndex++] : id
    )));
    setConstructionStepOrder(nextOrder);
  }

  function resetConstructionStepOrder() {
    const nextOrder = normalizeConstructionStepOrder();
    setConstructionStepOrder(nextOrder);
  }

  function stopConstructionSteps() {
    constructionPlaybackRef.current.id += 1;
    window.clearTimeout(constructionPlaybackRef.current.timer);
    constructionPlaybackRef.current.timer = null;
    const completeStep = CONSTRUCTION_STEPS.length - 1;
    sceneRef.current?.showCompleteConstruction();
    setConstructionStep(completeStep);
    setConstructionPlaying(false);
  }

  function showCompleteConstruction() {
    constructionPlaybackRef.current.id += 1;
    window.clearTimeout(constructionPlaybackRef.current.timer);
    constructionPlaybackRef.current.timer = null;
    const completeStep = CONSTRUCTION_STEPS.length - 1;
    try {
      sceneRef.current?.showCompleteConstruction();
    } catch (error) {
      console.error('Could not restore the complete construction snapshot.', error);
      sceneRef.current?.stopConstructionSequence();
    } finally {
      setConstructionStep(completeStep);
      setConstructionPlaying(false);
    }
  }

  function prepareConstructionForBuildingChange() {
    constructionPlaybackRef.current.id += 1;
    window.clearTimeout(constructionPlaybackRef.current.timer);
    constructionPlaybackRef.current.timer = null;
    const completeStep = CONSTRUCTION_STEPS.length - 1;
    try {
      sceneRef.current?.prepareForArchitectureChange();
    } catch (error) {
      console.error('Could not cancel construction before changing the building.', error);
      sceneRef.current?.stopConstructionSequence();
    } finally {
      setConstructionStep(completeStep);
      setConstructionPlaying(false);
    }
  }

  function changeStageView(view) {
    if (roomSectionView) {
      setRoomSectionView(false);
      sceneRef.current?.setRoomSectionView(false);
    }
    setStageView(view);
    sceneRef.current?.setStageView(view);
  }

  function selectRoomSectionView(axis) {
    if (!sliceAvailable) return;
    const nextAxis = axis === 'y' ? 'y' : 'x';
    setRoomSectionAxis(nextAxis);
    setRoomSectionView(true);
    sceneRef.current?.setRoomSectionView(true, nextAxis);
    setStageView('section');
  }

  function showFrontStageView() {
    setStageView('front');
    requestAnimationFrame(() => requestAnimationFrame(() => sceneRef.current?.setStageView('front')));
  }

  function showIsometricStageViewAndFit() {
    if (roomSectionView) {
      setRoomSectionView(false);
      sceneRef.current?.setRoomSectionView(false, roomSectionAxis);
    }
    setStageView('isometric');
    requestAnimationFrame(() => requestAnimationFrame(() => {
      sceneRef.current?.setStageView('isometric');
    }));
  }

  function projectSnapshot() {
    return JSON.stringify({
      building: buildingRef.current,
      walls: wallsRef.current,
      combinationProfiles: combinationProfilesRef.current,
      placements: placementsRef.current,
      projectInstances: projectInstancesRef.current,
      zones: zonesRef.current,
      assemblies: assembliesRef.current,
      constructionStepOrder,
      stageRenderMode,
      nightLighting: {
        preview: nightLightingRef.current.preview,
        guides: nightLightingRef.current.guides,
        selectedId: nightLightingRef.current.selectedId,
        lights: nightLightingRef.current.lights,
      },
    });
  }

  function restoreProjectSnapshot(snapshot) {
    const state = JSON.parse(snapshot);
    restoringHistoryRef.current = true;
    const restoredBuilding = normalizeBuilding(state.building);
    const restoredWalls = normalizeWallSystem(state.walls || DEFAULT_WALL_SYSTEM, restoredBuilding);
    combinationProfilesRef.current = normalizeCombinationProfileStore(
      state.combinationProfiles,
      restoredBuilding,
      restoredWalls,
    );
    setBuilding(restoredBuilding);
    setWalls(restoredWalls);
    setPlacements(Array.isArray(state.placements) ? state.placements : []);
    setProjectInstances(Array.isArray(state.projectInstances) ? state.projectInstances : []);
    setZones(Array.isArray(state.zones) ? state.zones : []);
    setAssemblies(Array.isArray(state.assemblies) ? state.assemblies : []);
    setConstructionStepOrder(normalizeConstructionStepOrder(state.constructionStepOrder));
    const restoredStageRenderMode = state.stageRenderMode === 'flat' ? 'flat' : 'textured';
    setStageRenderMode(restoredStageRenderMode);
    const restoredNight = state.nightLighting || { preview: false, guides: false, selectedId: null, lights: [] };
    sceneRef.current?.setNightPreview(restoredNight.preview === true);
    sceneRef.current?.setNightLightGuidesVisible(restoredNight.guides === true);
    sceneRef.current?.setNightLights(restoredNight.lights || []);
    setNightLighting({
      preview: restoredNight.preview === true,
      guides: restoredNight.guides === true,
      selectedId: restoredNight.selectedId || null,
      lights: restoredNight.lights || [],
    });
    setSelectedPlacementId(null);
    setSelectedZoneId(null);
    setSelectedWallSide(null);
    sceneRef.current?.clearSelection();
    setHistoryVersion((value) => value + 1);
  }

  function undo() {
    const history = historyRef.current;
    if (!history.past.length) return;
    const current = history.present || projectSnapshot();
    const previous = history.past.pop();
    history.future.unshift(current);
    history.present = previous;
    restoreProjectSnapshot(previous);
  }

  function redo() {
    const history = historyRef.current;
    if (!history.future.length) return;
    const current = history.present || projectSnapshot();
    const next = history.future.shift();
    history.past.push(current);
    history.present = next;
    restoreProjectSnapshot(next);
  }

  const canUndo = historyVersion >= 0 && historyRef.current.past.length > 0;
  const canRedo = historyVersion >= 0 && historyRef.current.future.length > 0;

  useEffect(() => {
    if (!constructionPlaying) return;
    const activeStep = constructionStepListRef.current?.querySelector(`[data-construction-step="${constructionStep}"]`);
    activeStep?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [constructionPlaying, constructionStep]);

  useEffect(() => {
    const next = projectSnapshot();
    const history = historyRef.current;
    if (restoringHistoryRef.current) {
      restoringHistoryRef.current = false;
      history.present = next;
      setHistoryVersion((value) => value + 1);
      return;
    }
    if (!history.present) {
      history.present = next;
      setHistoryVersion((value) => value + 1);
      return;
    }
    if (history.present === next) return;
    history.past.push(history.present);
    if (history.past.length > 80) history.past.shift();
    history.present = next;
    history.future = [];
    setHistoryVersion((value) => value + 1);
  }, [building, walls, placements, projectInstances, zones, assemblies, constructionStepOrder, nightLighting, stageRenderMode]);

  useEffect(() => {
    const onKeyDown = (event) => {
      const target = event.target;
      const isTyping = target && (
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
        || target.isContentEditable
      );
      if (isTyping) return;
      const key = event.key.toLowerCase();
      if (key === 'delete' || key === 'backspace') {
        const placementId = selectedPlacementIdRef.current;
        const projectInstanceId = selectedProjectInstanceIdRef.current;
        const zoneId = selectedZoneIdRef.current;
        if (projectInstanceId) {
          event.preventDefault();
          setProjectInstances((items) => items.filter((instance) => instance.id !== projectInstanceId));
          setSelectedProjectInstanceId(null);
          sceneRef.current?.clearSelection();
          return;
        }
        if (placementId) {
          event.preventDefault();
          setPlacements((items) => items.filter((placement) => placement.id !== placementId));
          setAssemblies((items) => items.map((assembly) => ({
            ...assembly,
            placementIds: assembly.placementIds.filter((id) => id !== placementId),
          })));
          setSelectedPlacementId(null);
          sceneRef.current?.select(null);
          return;
        }
        if (zoneId) {
          event.preventDefault();
          setZones((items) => items.filter((zone) => zone.id !== zoneId));
          setSelectedZoneId(null);
          sceneRef.current?.selectZone(null);
          return;
        }
      }
      if (!(event.ctrlKey || event.metaKey)) return;
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault();
        undo();
      } else if (key === 'y' || (key === 'z' && event.shiftKey)) {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!assetContextMenu) return undefined;
    const close = () => setAssetContextMenu(null);
    const closeOnEscape = (event) => { if (event.key === 'Escape') close(); };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', closeOnEscape);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('blur', close);
    };
  }, [assetContextMenu]);

  useEffect(() => {
    if (!user || !viewportRef.current) return undefined;
    const scene = new MehrazScene(viewportRef.current, {
      initialBuilding: {
        ...buildingRef.current,
        hallArchGuideVisible: false,
        hallDomeGuideVisible: false,
      },
      initialWalls: {
        ...wallsRef.current,
        karbandi: {
          ...wallsRef.current?.karbandi,
          guideVisible: false,
          archIntersectionGuideVisible: false,
        },
      },
      initialStageRenderMode: stageRenderMode,
      onGridElementSelection: (selection) => {
        if (!selection) {
          setSelectedGridElement(null);
          setSelectedGridElements([]);
          setSelectedGridBay(null);
          setSelectedGridBays([]);
          return;
        }
        if (!selection.id || !['wall', 'vault', 'dome', 'transition'].includes(selection.type)) return;
        setSelectedGridElement(selection);
        setSelectedGridElements([selection]);
        setGridGuideMode('elements');
        if (selection.bay) {
          setSelectedGridBay(selection.bay);
          setSelectedGridBays([selection.bay.join(':')]);
        }
        setRightTab('building');
        const currentBuilding = buildingRef.current;
        if (selection.type === 'vault') {
          openArchDesigner(
            `${currentBuilding.buildingType === 'grid' ? 'Grid' : 'Hall'} selected vault arch`,
            Math.min(currentBuilding.hallBayWidth, currentBuilding.hallBayDepth),
            currentBuilding.hallArch,
            (patch) => setBuilding((value) => normalizeBuilding({ ...value, hallArch: { ...value.hallArch, ...patch } })),
          );
        } else if (selection.type === 'dome') {
          openArchDesigner(
            `${currentBuilding.buildingType === 'grid' ? 'Grid' : 'Hall'} selected dome arch`,
            Math.min(currentBuilding.hallBayWidth, currentBuilding.hallBayDepth),
            currentBuilding.hallDomeArch,
            (patch) => setBuilding((value) => normalizeBuilding({ ...value, hallDomeArch: { ...value.hallDomeArch, ...patch } })),
          );
        }
      },
      onGridBaySelection: ({ bay, key }) => {
        setGridGuideMode('bays');
        setSelectedGridBay(bay);
        setSelectedGridBays((current) => (
          current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
        ));
        setSelectedGridElement(null);
        setSelectedGridElements([]);
        setRightTab('building');
      },
      onSelection: (id) => {
        setSelectedPlacementId(id);
        setSelectedProjectInstanceId(null);
        if (!id) {
          setSelectedZoneId(null);
          setSelectedWallSide(null);
          setSelectedOpeningGuide(null);
          return;
        }
        const placement = placementsRef.current.find((item) => item.id === id);
        if (placement?.role === 'room-dome-muqarnas') {
          setRightTab('transition');
          setSelectedWallSide('room_dome_transition');
          scrollInspectorTo(roomTransitionRef);
        } else if (placement?.role === 'arch-muqarnas' || placement?.assetType === 'muqarnas_assembly') {
          setRightTab(placement?.role === 'arch-muqarnas' ? 'transition' : 'cover');
          openSection('wallArch');
          scrollInspectorTo(wallArchRef);
        }
        if (id) {
          setSelectedWallSide(placement?.role === 'room-dome-muqarnas' ? 'room_dome_transition' : null);
          setSelectedOpeningGuide(null);
        }
      },
      onZoneSelection: (id) => {
        setSelectedZoneId(id);
        setSelectedProjectInstanceId(null);
        if (!id) {
          setSelectedPlacementId(null);
          setSelectedWallSide(null);
          setSelectedOpeningGuide(null);
          return;
        }
        if (id) {
          const zone = zonesRef.current.find((item) => item.id === id);
          if (zone?.surfaceId) setTargetSurfaceId(zone.surfaceId);
          setSelectedPlacementId(null);
          setSelectedWallSide(zone?.wallSide || (zone?.surfaceId ? wallSideForSurfaceId(zone.surfaceId, building) : null));
          setSelectedOpeningGuide(null);
          setRightTab('context');
        }
      },
      onWallSurfaceSelection: (selection) => {
        setSelectedProjectInstanceId(null);
        if (!selection) {
          setSelectedPlacementId(null);
          setSelectedZoneId(null);
          setSelectedWallSide(null);
          setSelectedOpeningGuide(null);
          return;
        }
        if (['room_dome', 'room_dome_inner', 'room_dome_extra_leg', 'room_dome_drum', 'room_dome_transition', 'room_dome_ring'].includes(selection.side)) {
          setSelectedWallSide(selection.side);
          setSelectedOpeningGuide(null);
          setSelectedPlacementId(null);
          setSelectedZoneId(null);
          setRightTab(selection.side === 'room_dome_transition' ? 'transition' : 'cover');
          scrollInspectorTo(selection.side === 'room_dome_transition'
            ? roomTransitionRef
            : selection.side === 'room_dome_inner'
              ? roomInnerDomeRef
            : selection.side === 'room_dome_drum'
              ? roomDomeDrumRef
            : selection.side === 'room_dome_extra_leg'
              ? roomDomeExtraLegRef
              : selection.side === 'room_dome_ring' ? roomDomeRingRef : roomDomeArchRef);
          const currentBuilding = buildingRef.current;
          if (selection.side === 'room_dome' && (currentBuilding.domeCoverType || 'dome') === 'dome') {
            openArchDesigner(
              `${currentBuilding.buildingType === 'portal' ? 'Portal' : 'Room'} dome arch`,
              currentBuilding.buildingType === 'portal' ? currentBuilding.width : Math.min(currentBuilding.width, currentBuilding.depth || currentBuilding.length),
              currentBuilding.domeArch,
              (patch) => setBuilding((value) => normalizeBuilding({ ...value, domeArch: { ...value.domeArch, ...patch } })),
              { disabled: currentBuilding.innerDomeEnabled === true },
            );
          } else if (selection.side === 'room_dome_inner') {
            openArchDesigner(
              'Inner dome arch',
              Math.min(currentBuilding.width, currentBuilding.depth || currentBuilding.length),
              currentBuilding.innerDomeArch,
              (patch) => setBuilding((value) => normalizeBuilding({ ...value, innerDomeArch: { ...value.innerDomeArch, ...patch } })),
            );
          } else if (selection.side === 'room_dome_transition' && (selection.transitionType === 'squinch' || currentBuilding.domeTransition === 'squinch')) {
            openArchDesigner(
              `${currentBuilding.buildingType === 'portal' ? 'Portal' : 'Room'} Squinch arch`,
              Math.min(currentBuilding.width, currentBuilding.depth || currentBuilding.length) / 2,
              currentBuilding.domeTransitionSettings?.squinch,
              (patch) => setBuilding((value) => normalizeBuilding({ ...value, domeTransitionSettings: { ...value.domeTransitionSettings, squinch: { ...value.domeTransitionSettings?.squinch, ...patch } } })),
            );
          }
          return;
        }
        setSelectedWallSide(selection.side);
        setSelectedOpeningGuide(null);
        setTargetSurfaceId(selection.surfaceId);
        setSelectedPlacementId(null);
        setSelectedZoneId(null);
        setRightTab('context');
        focusWallSection(selection.side);
        if (selection.side === 'north_top') {
          const currentBuilding = buildingRef.current;
          const currentWalls = wallsRef.current;
          openArchDesigner(
            'Portal north wall arch',
            currentBuilding.openingWidth,
            currentWalls.pointedArch,
            (patch) => setWalls((value) => normalizeWallSystem({ ...value, pointedArch: { ...value.pointedArch, ...patch, enabled: true } }, buildingRef.current)),
          );
        }
      },
      onTransform: (id, transform) => {
        setPlacements((items) => items.map((placement) => {
          if (placement.id !== id) return placement;
          return {
            ...placement,
            transform: placement.options?.constrain === false
              ? transform
              : constrainPlacementTransform(transform, placement.surfaceId, buildingRef.current, placement.options, wallsRef.current),
            options: ['arch-muqarnas', 'room-dome-muqarnas'].includes(placement.role)
              ? { ...placement.options, enforceTargetWidth: false }
              : placement.options,
          };
        }));
      },
      onProjectInstanceSelection: (id) => {
        setSelectedProjectInstanceId(id);
        if (id) {
          setSelectedPlacementId(null);
          setSelectedZoneId(null);
          setSelectedWallSide(null);
          setSelectedOpeningGuide(null);
          setRightTab('project');
        }
      },
      onProjectInstanceTransform: (id, transform) => {
        setProjectInstances((items) => items.map((instance) => (
          instance.id === id ? { ...instance, transform } : instance
        )));
      },
      onProjectInstanceOpen: (id) => openProjectInstanceForEditing(id),
      onPreviewDimensions: (id, dimensions) => {
        setMuqarnasDimensionsById((current) => {
          const previous = current[id];
          if (previous?.every((value, index) => Math.abs(value - dimensions[index]) < 0.0001)) return current;
          return { ...current, [id]: dimensions };
        });
      },
      onAssetContextMenu: setAssetContextMenu,
      onNightLights: setNightLighting,
    });
    sceneRef.current = scene;
    scene.setConstructionStepOrder(constructionStepOrder);
    sceneHasInitialArchitectureRef.current = true;
    scene.setArchitectureVisible(buildingTypeSelected);
    scene.setStageView('front');
    scene.applyConstructionStep(constructionStep);
    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
  }, [user?.id]);

  useEffect(() => {
    if (sceneHasInitialArchitectureRef.current) {
      sceneHasInitialArchitectureRef.current = false;
      return;
    }
    try {
      sceneRef.current?.setArchitecture({
        ...building,
        hallArchGuideVisible: false,
        hallDomeGuideVisible: false,
      }, {
        ...walls,
        karbandi: {
          ...walls.karbandi,
          guideVisible: false,
          archIntersectionGuideVisible: false,
        },
      }, stageRenderMode);
    } catch (error) {
      console.error('Could not rebuild the Mehraz scene.', error);
      setLibraryMessage(`Could not render this project: ${error?.message || 'Unknown scene error'}`);
    }
  }, [building, walls, stageRenderMode, user?.id]);

  useEffect(() => {
    if (sliceAvailable || !roomSectionView) return;
    setRoomSectionView(false);
    sceneRef.current?.setRoomSectionView(false);
  }, [roomSectionView, sliceAvailable]);

  useEffect(() => {
    setWalls((value) => {
      const portalKarbandiActive = building.type !== 'room'
        && value.portalTransition === 'karbandi'
        && value.karbandi?.enabled === true;
      const roomKarbandiActive = building.type === 'room'
        && building.domeTransition === 'karbandi';
      const hallKarbandiActive = ['hall', 'grid'].includes(building.buildingType)
        && building.hallTransitionEnabled !== false
        && building.hallTransitionType === 'karbandi';
      if (!portalKarbandiActive && !roomKarbandiActive && !hallKarbandiActive) return value;

      const seatingBuilding = hallKarbandiActive
        ? {
          ...building,
          type: 'room',
          roomPlanShape: 'square',
          width: building.hallBayWidth,
          depth: building.hallBayDepth,
          length: building.hallBayDepth,
        }
        : building;
      const karbandi = { ...value.karbandi, autoClip: true };
      const squareRoomOneLeg = karbandi.wallLegMode === 'one'
        && seatingBuilding.type === 'room'
        && seatingBuilding.buildingType !== 'vestibule'
        && (seatingBuilding.roomPlanShape || 'square') === 'square';
      Object.assign(
        karbandi,
        squareRoomOneLeg
          ? solveKarbandiOneLegCornerSeating(karbandi, seatingBuilding, value)
          : solveKarbandiWallSeating(karbandi, seatingBuilding, value),
      );
      const nextWalls = normalizeWallSystem({
        ...value,
        karbandi,
      }, building);
      return JSON.stringify(nextWalls.karbandi) === JSON.stringify(value.karbandi)
        ? value
        : nextWalls;
    });
  }, [building, walls.portalTransition, walls.karbandi?.enabled, walls.extraHeights?.north, walls.extraHeights?.east, walls.extraHeights?.south, walls.extraHeights?.west]);

  useEffect(() => {
    sceneRef.current?.setPlacements(renderedPlacements);
  }, [renderedPlacements]);

  useEffect(() => {
    sceneRef.current?.setProjectInstances(projectInstances);
  }, [projectInstances]);

  useEffect(() => {
    sceneRef.current?.setZones(zones);
  }, [zones]);

  useEffect(() => {
    sceneRef.current?.setTransformMode(transformMode);
  }, [transformMode]);

  useEffect(() => {
    setExportOptions((value) => ({ ...value, stageRenderMode }));
  }, [stageRenderMode]);

  useEffect(() => {
    sceneRef.current?.select(selectedPlacementId);
  }, [selectedPlacementId]);

  useEffect(() => {
    if (selectedProjectInstanceId && !selectedPlacementId) {
      sceneRef.current?.selectProjectInstance(selectedProjectInstanceId);
    }
  }, [selectedProjectInstanceId, selectedPlacementId]);

  useEffect(() => {
    if (selectedZoneId && !selectedPlacementId) sceneRef.current?.selectZone(selectedZoneId);
  }, [selectedZoneId, selectedPlacementId]);

  useEffect(() => {
    sceneRef.current?.setSelectedWallSide(selectedWallSide);
  }, [selectedWallSide]);

  useEffect(() => {
    sceneRef.current?.setSelectedOpeningGuide(null);
  }, [selectedOpeningGuide]);

  useEffect(() => {
    sceneRef.current?.setGridElementSelection(highlightedGridSelections);
    sceneRef.current?.setGridBaySelection(gridGuideMode === 'bays' ? activeGridBayKeys : []);
  }, [selectedGridElement, selectedGridElements, selectedGridBays, selectedGridBay, gridGuideMode, building]);

  useEffect(() => {
    sceneRef.current?.setGridBaySelectionEnabled(building.buildingType === 'grid' && gridGuideMode === 'bays');
  }, [building.buildingType, gridGuideMode]);

  useEffect(() => {
    sceneRef.current?.setArchitectureVisible(buildingTypeSelected);
  }, [buildingTypeSelected]);

  useEffect(() => {
    const deleteSelectedGridComponents = (event) => {
      if (event.key !== 'Delete' || event.repeat || building.buildingType !== 'grid'
        || gridGuideMode !== 'elements' || !activeGridElements.length) return;
      const target = event.target;
      if (target?.matches?.('input, select, textarea, [contenteditable="true"]')) return;
      event.preventDefault();
      event.stopPropagation();
      removeSelectedGridElement();
    };
    window.addEventListener('keydown', deleteSelectedGridComponents);
    return () => window.removeEventListener('keydown', deleteSelectedGridComponents);
  }, [building.buildingType, gridGuideMode, selectedGridElement, selectedGridElements]);

  useEffect(() => {
    let active = true;
    withUiDeadline(
      authHandoffReady,
      AUTH_STARTUP_TIMEOUT_MS,
      'Account connection timed out. You can retry from the Library.',
    ).then(() => withUiDeadline(
      supabase.auth.getSession(),
      AUTH_STARTUP_TIMEOUT_MS,
      'Saved account session could not be loaded in time.',
    )).then(({ data }) => {
      if (!active) return;
      setUser(data.session?.user || null);
      setAuthReady(true);
    }).catch((error) => {
      if (active) {
        setLibraryMessage(error.message);
        setAuthReady(true);
      }
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) {
        setUser(session?.user || null);
        setAuthReady(true);
      }
    });
    return () => {
      active = false;
      data.subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user) {
      libraryRefreshRef.current.controller?.abort();
      setLibrary([]);
      setProjects([]);
      setProjectVersionsById({});
      setLibraryNextCursor(null);
      setLibraryHasMore(false);
      return;
    }
    let cancelled = false;
    readLibraryCatalogueCache(user.id).then((cached) => {
      if (cancelled) return;
      const cachedAssets = Array.isArray(cached?.assets) ? cached.assets : [];
      if (cachedAssets.length) {
        setLibrary(cachedAssets.filter((asset) => asset.asset_type !== 'mehraz_project'));
        setProjects(cachedAssets.filter((asset) => asset.asset_type === 'mehraz_project'));
        setLibraryNextCursor(cached.nextCursor || null);
        setLibraryHasMore(cached.hasMore === true);
      }
      refreshLibrary({ silent: cachedAssets.length > 0 });
    });
    return () => { cancelled = true; };
  }, [user?.id]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    scene.setConstructionStepOrder(constructionStepOrder);
    // Reordering does not change a completed model's visibility. Avoid a full
    // scene traversal for every drop; partial previews still need reapplying
    // because their cumulative ranks have changed.
    if (constructionStep < CONSTRUCTION_STEPS.length - 1) {
      scene.applyConstructionStep(constructionStep);
    }
  }, [constructionStepOrder]);

  async function refreshLibrary({ append = false, silent = false } = {}) {
    if (!user) return;
    libraryRefreshRef.current.controller?.abort();
    const controller = new AbortController();
    const requestId = libraryRefreshRef.current.id + 1;
    libraryRefreshRef.current = { id: requestId, controller };
    if (append) setLibraryLoadingMore(true);
    else if (!silent) setLibraryBusy(true);
    try {
      const page = await listLibraryAssets(supabase, {
        cursor: append ? libraryNextCursor : null,
        pageSize: LIBRARY_PAGE_SIZE,
        signal: controller.signal,
      });
      const pageAssets = append ? page.assets : await appendLegacyBrickBonds(page.assets, controller.signal);
      const knownAssets = append ? [...library, ...projects] : [];
      const byId = new Map([...knownAssets, ...pageAssets].map((asset) => [asset.id, asset]));
      const allAssets = [...byId.values()].sort((first, second) => (
        String(second.updated_at || '').localeCompare(String(first.updated_at || ''))
      ));
      const usableAssets = allAssets.filter((asset) => asset.asset_type !== 'mehraz_project');
      const params = new URLSearchParams(window.location.search);
      const returnedAssetId = params.get('libraryUpdated') ? params.get('assetId') || '' : '';
      const projectAssets = allAssets.filter((asset) => asset.asset_type === 'mehraz_project');
      if (libraryRefreshRef.current.id !== requestId) return;
      setLibrary(usableAssets);
      setProjects(projectAssets);
      setLibraryNextCursor(page.nextCursor);
      setLibraryHasMore(page.hasMore);
      writeLibraryCatalogueCache(user.id, {
        assets: allAssets,
        nextCursor: page.nextCursor,
        hasMore: page.hasMore,
      });
      setSelectedAssetId((current) => (
        returnedAssetId && usableAssets.some((asset) => asset.id === returnedAssetId)
          ? returnedAssetId
          : usableAssets.some((asset) => asset.id === current) ? current : usableAssets[0]?.id || ''
      ));
      setLibraryMessage(returnedAssetId
        ? 'Library item updated in its source app. Select it or place it again to use the newest version.'
        : allAssets.length
        ? ''
        : 'Library connected, but no shared assets were found for this signed-in account.');
      if (params.get('libraryUpdated')) {
        params.delete('libraryUpdated');
        params.delete('assetId');
        params.delete('sourceApp');
        const query = params.toString();
        window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
      }
    } catch (error) {
      if (libraryRefreshRef.current.id !== requestId) return;
      const message = error.message || 'The shared library could not be loaded.';
      if (/sign in again|older Supabase project|invalid jwt/i.test(message)) {
        setUser(null);
        setLibrary([]);
        setProjects([]);
        setProjectVersionsById({});
      }
      setLibraryMessage(`Library connection problem: ${message} Existing cached items remain available; press Refresh to retry.`);
    } finally {
      if (libraryRefreshRef.current.id === requestId) {
        setLibraryBusy(false);
        setLibraryLoadingMore(false);
      }
    }
  }

  async function appendLegacyBrickBonds(assets, signal) {
    const hasLibraryBrickBonds = assets.some((asset) => asset.asset_type === 'brick_bond');
    if (hasLibraryBrickBonds) return assets;
    let request = supabase
      .from('brick_bond_patterns')
      .select('id,name,bond_pattern,updated_at,created_at')
      .order('updated_at', { ascending: false })
      .limit(LIBRARY_PAGE_SIZE);
    if (signal && typeof request.abortSignal === 'function') request = request.abortSignal(signal);
    const { data, error } = await request;
    if (error || !Array.isArray(data) || !data.length) return assets;
    const legacy = data
      .filter((pattern) => Number(pattern.bond_pattern?.version) >= 2 && pattern.bond_pattern?.bricks?.length)
      .map((pattern) => ({
        id: `legacy-brick:${pattern.id}`,
        owner_id: user.id,
        asset_type: 'brick_bond',
        source_app: 'bricks',
        name: pattern.name || 'Brick bond',
        description: 'Legacy Bricks App bond',
        visibility: 'private',
        lifecycle_status: 'active',
        current_version_id: `legacy-version:${pattern.id}`,
        created_at: pattern.created_at || pattern.updated_at,
        updated_at: pattern.updated_at,
        owned: true,
        currentVersion: {
          id: `legacy-version:${pattern.id}`,
          asset_id: `legacy-brick:${pattern.id}`,
          version_number: 1,
          contract_id: 'girihstudio.library-asset',
          contract_version: 1,
          payload: { pattern: pattern.bond_pattern },
          artifacts: {},
          metadata: { legacySource: 'brick_bond_patterns' },
          created_at: pattern.updated_at,
        },
      }));
    return [...assets, ...legacy];
  }

  function rememberLoadedVersion(assetId, version) {
    if (!version?.id) return version;
    const attach = (asset) => asset.id === assetId && asset.current_version_id === version.id
      ? { ...asset, currentVersion: version }
      : asset;
    setLibrary((items) => items.map(attach));
    setProjects((items) => items.map(attach));
    setLibraryVersions((items) => items.map((item) => item.id === version.id ? version : item));
    setProjectVersionsById((current) => current[assetId]
      ? { ...current, [assetId]: current[assetId].map((item) => item.id === version.id ? version : item) }
      : current);
    writeLibraryVersionCache(version);
    return version;
  }

  async function loadFullLibraryVersion(asset, requestedVersion = asset?.currentVersion) {
    const versionId = requestedVersion?.id || asset?.current_version_id;
    if (!versionId) throw new Error('This library item has no readable current version.');
    if (requestedVersion?.payload) return requestedVersion;
    const cached = await readLibraryVersionCache(versionId);
    if (cached?.version?.payload) return rememberLoadedVersion(asset.id, cached.version);
    const version = await getLibraryAssetVersion(supabase, versionId);
    return rememberLoadedVersion(asset.id, version);
  }

  async function connectAccount() {
    const login = new URL('/app', 'https://girihstudio.com');
    login.searchParams.set('mode', 'login');
    login.searchParams.set('nextApp', window.location.href);
    window.location.assign(login);
  }

  async function addSelectedAsset() {
    if (!selectedAsset?.currentVersion) {
      setLibraryMessage('Choose a library asset with a readable version.');
      return;
    }
    setLibraryBusy(true);
    try {
      const version = await loadFullLibraryVersion(selectedAsset);
      const surfaceId = surfaces.some((surface) => surface.id === targetSurfaceId) ? targetSurfaceId : surfaces[0].id;
      const placement = {
        id: newPlacementId(), assetId: selectedAsset.id, assetVersionId: version.id,
        assetVersionNumber: version.version_number, assetType: selectedAsset.asset_type,
        name: selectedAsset.name, surfaceId, transform: defaultPlacementTransform(surfaceId, building, walls),
        options: { constrain: true, snap: 0.1 }, assetPayload: version.payload,
      };
      setPlacements((items) => [...items, placement]);
      setSelectedPlacementId(placement.id);
      setRightTab('placement');
      setLibraryMessage(`${selectedAsset.name} placed with version ${placement.assetVersionNumber} pinned.`);
    } catch (error) { setLibraryMessage(error.message); }
    finally { setLibraryBusy(false); }
  }

  async function setArchMuqarnasAsset(assetId) {
    const asset = muqarnasAssets.find((item) => item.id === assetId);
    setPlacements((items) => items.filter((placement) => placement.role !== 'arch-muqarnas'));
    if (!asset?.currentVersion) {
      setSelectedPlacementId(null);
      setLibraryMessage('Arch Muqarnas removed.');
      return;
    }
    setLibraryBusy(true);
    try {
    const version = await loadFullLibraryVersion(asset);
    const placement = {
      id: newPlacementId(),
      role: 'arch-muqarnas',
      assetId: asset.id,
      assetVersionId: version.id,
      assetVersionNumber: version.version_number,
      assetType: asset.asset_type,
      name: asset.name,
      surfaceId: 'floor',
      transform: archMuqarnasTransform(building, walls, version.payload),
      options: { constrain: false, snap: 0, targetWidth: building.openingWidth, enforceTargetWidth: true, keepAspectRatio: true },
      assetPayload: version.payload,
    };
    setPlacements((items) => [...items.filter((placementItem) => placementItem.role !== 'arch-muqarnas'), placement]);
    setSelectedPlacementId(null);
    setLibraryMessage(`${asset.name} loaded under the arch and auto-fit with aspect ratio preserved.`);
    } catch (error) { setLibraryMessage(error.message); }
    finally { setLibraryBusy(false); }
  }

  async function setRoomDomeMuqarnasAsset(assetId) {
    const asset = muqarnasAssets.find((item) => item.id === assetId);
    setPlacements((items) => items.filter((placement) => placement.role !== 'room-dome-muqarnas'));
    if (!asset?.currentVersion) {
      setSelectedPlacementId(null);
      sceneRef.current?.selectWallSide('room_dome_transition', false);
      setLibraryMessage('Room dome Muqarnas removed.');
      return;
    }
    setLibraryBusy(true);
    try {
    const version = await loadFullLibraryVersion(asset);
    const targetWidth = Math.min(building.width, building.length ?? building.depth);
    const placement = {
      id: newPlacementId(),
      role: 'room-dome-muqarnas',
      assetId: asset.id,
      assetVersionId: version.id,
      assetVersionNumber: version.version_number,
      assetType: asset.asset_type,
      name: asset.name,
      surfaceId: 'floor',
      transform: roomDomeMuqarnasTransform(building, walls, version.payload),
      options: { constrain: false, snap: 0, targetWidth, enforceTargetWidth: true, keepAspectRatio: true },
      assetPayload: version.payload,
    };
    setPlacements((items) => [...items.filter((placementItem) => placementItem.role !== 'room-dome-muqarnas'), placement]);
    setSelectedPlacementId(null);
    sceneRef.current?.selectWallSide('room_dome_transition', false);
    setLibraryMessage(`${asset.name} loaded into the Room dome transition and fitted to the smaller room span.`);
    } catch (error) { setLibraryMessage(error.message); }
    finally { setLibraryBusy(false); }
  }

  function refitRoomDomeMuqarnas() {
    if (!roomDomeMuqarnasPlacement) return;
    const targetWidth = Math.min(building.width, building.length ?? building.depth);
    setPlacements((items) => items.map((placement) => (
      placement.id === roomDomeMuqarnasPlacement.id
        ? {
          ...placement,
          transform: roomDomeMuqarnasTransform(building, walls, placement.assetPayload),
          options: { ...placement.options, targetWidth, enforceTargetWidth: true, keepAspectRatio: true },
        }
        : placement
    )));
  }

  function updateArchMuqarnasVector(key, index, value) {
    if (!archMuqarnasPlacement) return;
    setPlacements((items) => items.map((placement) => {
      if (placement.id !== archMuqarnasPlacement.id) return placement;
      const nextVector = [...(placement.transform?.[key] || (key === 'scale' ? [1, 1, 1] : [0, 0, 0]))];
      nextVector[index] = value;
      return {
        ...placement,
        transform: { ...placement.transform, [key]: nextVector },
        options: { ...placement.options, constrain: false, snap: 0 },
      };
    }));
  }

  function updateArchMuqarnasDimension(index, value) {
    if (!archMuqarnasPlacement || !archMuqarnasDimensions) return;
    const target = Math.max(0.05, value);
    const currentDimension = Math.max(0.0001, archMuqarnasDimensions[index]);
    const factor = target / currentDimension;
    const keepAspectRatio = archMuqarnasPlacement.options?.keepAspectRatio !== false;
    const currentScale = archMuqarnasPlacement.transform?.scale || [1, 1, 1];
    const nextScale = keepAspectRatio
      ? currentScale.map((scale) => Math.max(0.02, scale * factor))
      : currentScale.map((scale, axis) => (axis === index ? Math.max(0.02, scale * factor) : scale));
    const nextDimensions = keepAspectRatio
      ? archMuqarnasDimensions.map((dimension) => dimension * factor)
      : archMuqarnasDimensions.map((dimension, axis) => (axis === index ? target : dimension));
    setMuqarnasDimensionsById((current) => ({ ...current, [archMuqarnasPlacement.id]: nextDimensions }));
    setPlacements((items) => items.map((placement) => (
      placement.id === archMuqarnasPlacement.id
        ? {
          ...placement,
          transform: { ...placement.transform, scale: nextScale },
          options: { ...placement.options, constrain: false, snap: 0, targetWidth: nextDimensions[0], enforceTargetWidth: true },
        }
        : placement
    )));
  }

  function setArchMuqarnasKeepAspectRatio(keepAspectRatio) {
    if (!archMuqarnasPlacement) return;
    setPlacements((items) => items.map((placement) => (
      placement.id === archMuqarnasPlacement.id
        ? { ...placement, options: { ...placement.options, keepAspectRatio } }
        : placement
    )));
  }

  function refitArchMuqarnas() {
    if (!archMuqarnasPlacement) return;
    setPlacements((items) => items.map((placement) => (
      placement.id === archMuqarnasPlacement.id
        ? {
          ...placement,
          transform: archMuqarnasTransform(building, walls, placement.assetPayload),
          options: { ...placement.options, constrain: false, snap: 0, targetWidth: building.openingWidth, enforceTargetWidth: true, keepAspectRatio: placement.options?.keepAspectRatio !== false },
        }
        : placement
    )));
  }

  function deleteArchMuqarnas() {
    if (!archMuqarnasPlacement) return;
    setPlacements((items) => items.filter((placement) => placement.id !== archMuqarnasPlacement.id));
    setSelectedPlacementId(null);
    setLibraryMessage('Arch Muqarnas removed.');
  }

  function editAssetInSourceApp({ assetId, versionId = '', assetType } = {}) {
    if (!assetId || assetId.startsWith('legacy-')) return;
    const target = SOURCE_APP_EDIT_LINKS[assetType];
    if (!target) {
      setLibraryMessage('This item type is edited directly in Mehraz.');
      return;
    }
    try {
      const url = new URL(target);
      url.searchParams.set('libraryAsset', assetId);
      url.searchParams.set('source', 'mehraz');
      url.searchParams.set('returnTo', window.location.href);
      if (versionId) url.searchParams.set('version', versionId);
      window.location.href = url.toString();
    } catch {
      setLibraryMessage('The source app link could not be opened.');
    }
  }

  function editSelectedAssetInSourceApp() {
    if (!selectedAsset) return;
    editAssetInSourceApp({
      assetId: selectedAsset.id,
      versionId: selectedLibraryVersion?.id || selectedAsset.current_version_id || '',
      assetType: selectedAsset.asset_type,
    });
  }

  async function renameSelectedLibraryAsset() {
    if (!selectedAsset || selectedAsset.id.startsWith('legacy-')) return;
    setLibraryBusy(true);
    try {
      await updateLibraryAssetMetadata(supabase, selectedAsset.id, libraryEdit);
      await refreshLibrary();
      setLibraryMessage('Library item renamed.');
    } catch (error) {
      setLibraryMessage(error.message);
    } finally {
      setLibraryBusy(false);
    }
  }

  async function archiveSelectedLibraryAsset() {
    if (!selectedAsset || selectedAsset.id.startsWith('legacy-')) return;
    if (!window.confirm(`Archive "${selectedAsset.name}" from the shared library?`)) return;
    setLibraryBusy(true);
    try {
      await archiveLibraryAsset(supabase, selectedAsset.id);
      setSelectedAssetId('');
      await refreshLibrary();
      setLibraryMessage('Library item archived.');
    } catch (error) {
      setLibraryMessage(error.message);
    } finally {
      setLibraryBusy(false);
    }
  }

  async function makeSelectedVersionCurrent(version) {
    if (!selectedAsset || selectedAsset.id.startsWith('legacy-') || !version) return;
    setLibraryBusy(true);
    try {
      await setCurrentLibraryAssetVersion(supabase, selectedAsset.id, version.id);
      await refreshLibrary();
      setSelectedLibraryVersionId(version.id);
      setLibraryMessage(`Version ${version.version_number} is now current.`);
    } catch (error) {
      setLibraryMessage(error.message);
    } finally {
      setLibraryBusy(false);
    }
  }

  function updateSelectedPlacement(patch) {
    if (!selectedPlacementId) return;
    setPlacements((items) => items.map((placement) => (
      placement.id === selectedPlacementId ? { ...placement, ...patch } : placement
    )));
  }

  function updateTransform(kind, index, value) {
    if (!selectedPlacement) return;
    const next = [...selectedPlacement.transform[kind]];
    next[index] = Number.isFinite(value) ? value : 0;
    const transform = { ...selectedPlacement.transform, [kind]: next };
    updateSelectedPlacement({
      transform: selectedPlacement.options?.constrain === false
        ? transform
        : constrainPlacementTransform(transform, selectedPlacement.surfaceId, building, selectedPlacement.options, walls),
    });
  }

  function changePlacementSurface(surfaceId) {
    updateSelectedPlacement({
      surfaceId,
      transform: constrainPlacementTransform(
        defaultPlacementTransform(surfaceId, building, walls),
        surfaceId,
        building,
        selectedPlacement?.options,
        walls,
      ),
    });
  }

  function updatePlacementOptions(patch) {
    if (!selectedPlacement) return;
    const options = { constrain: true, snap: 0.1, ...selectedPlacement.options, ...patch };
    updateSelectedPlacement({
      options,
      transform: options.constrain
        ? constrainPlacementTransform(selectedPlacement.transform, selectedPlacement.surfaceId, building, options, walls)
        : selectedPlacement.transform,
    });
  }

  function centerSelectedPlacement() {
    if (!selectedPlacement) return;
    const centered = defaultPlacementTransform(selectedPlacement.surfaceId, building, walls);
    updateSelectedPlacement({
      transform: constrainPlacementTransform({
        ...centered,
        rotation: [...selectedPlacement.transform.rotation],
        scale: [...selectedPlacement.transform.scale],
      }, selectedPlacement.surfaceId, building, selectedPlacement.options, walls),
    });
  }

  function fitSelectedPlacement() {
    if (!selectedPlacement) return;
    updateSelectedPlacement({
      transform: fitPlacementTransform(selectedPlacement.surfaceId, building, selectedPlacement.transform, walls),
    });
  }

  function deleteSelectedPlacement() {
    setPlacements((items) => items.filter((placement) => placement.id !== selectedPlacementId));
    setAssemblies((items) => items.map((assembly) => ({
      ...assembly,
      placementIds: assembly.placementIds.filter((id) => id !== selectedPlacementId),
    })));
    setSelectedPlacementId(null);
  }

  function addZone() {
    const surfaceId = surfaces.some((surface) => surface.id === targetSurfaceId)
      ? targetSurfaceId
      : surfaces[0].id;
    const zone = {
      id: newPlacementId(),
      name: `Decoration zone ${zones.length + 1}`,
      surfaceId,
      wallSide: selectedWallSide || wallSideForSurfaceId(surfaceId, building),
      bounds: defaultZoneBounds(surfaceId, building, walls),
      soldierCourses: false,
      patternScale: 1,
      patternOffsetU: 0,
      patternOffsetV: 0,
      color: '#2f7d86',
      opacity: 0.14,
    };
    setZones((items) => [...items, zone]);
    setSelectedZoneId(zone.id);
    setSelectedPlacementId(null);
    setRightTab('context');
  }

  function updateSelectedZone(patch) {
    if (!selectedZoneId) return;
    setZones((items) => items.map((zone) => zone.id === selectedZoneId ? { ...zone, ...patch } : zone));
  }

  function updateZoneBounds(key, value) {
    if (!selectedZone) return;
    if (selectedZone.surfaceId !== 'floor' && key === 'height') {
      updateSelectedZone({ bounds: resizeZoneHeightByBrick(selectedZone.bounds, value, walls) });
      return;
    }
    if (selectedZone.surfaceId !== 'floor' && key === 'v') {
      updateSelectedZone({ bounds: moveZoneVerticallyByBrick(selectedZone.bounds, value, walls) });
      return;
    }
    updateSelectedZone({
      bounds: {
        ...selectedZone.bounds,
        [key]: ['width', 'height'].includes(key) ? Math.max(0.2, value) : value,
      },
    });
  }

  function changeZoneSurface(surfaceId) {
    if (!selectedZone) return;
    const wallSide = wallSideForSurfaceId(surfaceId, building);
    updateSelectedZone({
      surfaceId,
      wallSide,
      bounds: defaultZoneBounds(surfaceId, building, walls),
    });
    setTargetSurfaceId(surfaceId);
    setSelectedWallSide(wallSide);
  }

  async function assignPatternToSelectedZone(assetId) {
    if (!selectedZone) return;
    const asset = zonePatternAssets.find((item) => item.id === assetId);
    if (!asset?.currentVersion) {
      updateSelectedZone({
        assetId: '',
        assetVersionId: '',
        assetVersionNumber: null,
        assetType: '',
        assetName: '',
        assetPayload: null,
        assetUnit: null,
      });
      return;
    }
    setLibraryBusy(true);
    try {
    const version = await loadFullLibraryVersion(asset);
    const loadedAsset = { ...asset, currentVersion: version };
    updateSelectedZone({
      assetId: asset.id,
      assetVersionId: version.id,
      assetVersionNumber: version.version_number,
      assetType: asset.asset_type,
      assetName: asset.name,
      assetPayload: version.payload,
      assetUnit: patternAssetUnitSize(loadedAsset),
    });
    setLibraryMessage(`${asset.name} assigned to ${selectedZone.name}. The pattern will tessellate to fill the zone.`);
    } catch (error) { setLibraryMessage(error.message); }
    finally { setLibraryBusy(false); }
  }

  function deleteSelectedZone() {
    setZones((items) => items.filter((zone) => zone.id !== selectedZoneId));
    setSelectedZoneId(null);
  }

  function fitSelectedPlacementToZone() {
    if (!selectedPlacement || !selectedZone) return;
    updateSelectedPlacement({
      surfaceId: selectedZone.surfaceId,
      zoneId: selectedZone.id,
      transform: fitPlacementToZone(selectedZone, building, selectedPlacement.transform),
    });
  }

  function repeatSelectedPlacement() {
    if (!selectedPlacement) return;
    const columns = Math.max(1, Math.min(20, Math.round(repeatOptions.columns)));
    const rows = Math.max(1, Math.min(20, Math.round(repeatOptions.rows)));
    const clones = [];
    const occupied = new Set([selectedPlacement.transform.position.map((value) => Number(value).toFixed(3)).join(':')]);
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        if (row === 0 && column === 0) continue;
        const transform = {
          position: [...selectedPlacement.transform.position],
          rotation: [...selectedPlacement.transform.rotation],
          scale: [...selectedPlacement.transform.scale],
        };
        if (selectedPlacement.surfaceId === 'floor') {
          transform.position[0] += column * repeatOptions.spacingU;
          transform.position[2] += row * repeatOptions.spacingV;
        } else if (['east_interior', 'west_interior'].includes(selectedPlacement.surfaceId)) {
          transform.position[2] += column * repeatOptions.spacingU;
          transform.position[1] += row * repeatOptions.spacingV;
        } else {
          transform.position[0] += column * repeatOptions.spacingU;
          transform.position[1] += row * repeatOptions.spacingV;
        }
        const constrained = selectedPlacement.options?.constrain === false
          ? transform
          : constrainPlacementTransform(transform, selectedPlacement.surfaceId, building, selectedPlacement.options, walls);
        const positionKey = constrained.position.map((value) => Number(value).toFixed(3)).join(':');
        if (occupied.has(positionKey)) continue;
        occupied.add(positionKey);
        clones.push({
          ...selectedPlacement,
          id: newPlacementId(),
          name: `${selectedPlacement.name} Â· ${row + 1}.${column + 1}`,
          zoneId: null,
          transform: constrained,
        });
      }
    }
    if (clones.length) {
      setPlacements((items) => [...items, ...clones]);
      setLibraryMessage(`${clones.length} repeated placements added.`);
    }
  }

  function toggleAssemblyDraft(placementId) {
    setAssemblyDraftSelection((items) => items.includes(placementId)
      ? items.filter((id) => id !== placementId)
      : [...items, placementId]);
  }

  function createAssembly() {
    const placementIds = assemblyDraftSelection.length
      ? assemblyDraftSelection
      : selectedPlacementId
        ? [selectedPlacementId]
        : [];
    if (!placementIds.length) {
      setLibraryMessage('Select at least one placement for the assembly.');
      return;
    }
    const memberTypes = new Set(placements.filter((placement) => placementIds.includes(placement.id)).map((placement) => placement.assetType));
    const assembly = {
      id: newPlacementId(),
      name: `Assembly ${assemblies.length + 1}`,
      placementIds: [...new Set(placementIds)],
      trade: memberTypes.size === 1 ? [...memberTypes][0] : 'mixed',
      status: 'planned',
      notes: '',
    };
    setAssemblies((items) => [
      ...items.map((item) => ({ ...item, placementIds: item.placementIds.filter((id) => !assembly.placementIds.includes(id)) })),
      assembly,
    ]);
    setSelectedAssemblyId(assembly.id);
    setAssemblyDraftSelection([]);
    setLibraryMessage(`${assembly.name} created with ${assembly.placementIds.length} placements.`);
  }

  function updateSelectedAssembly(patch) {
    if (!selectedAssemblyId) return;
    setAssemblies((items) => items.map((assembly) => assembly.id === selectedAssemblyId ? { ...assembly, ...patch } : assembly));
  }

  function assignSelectedPlacementToAssembly(assemblyId) {
    if (!selectedPlacementId) return;
    setAssemblies((items) => items.map((assembly) => ({
      ...assembly,
      placementIds: assembly.id === assemblyId
        ? [...new Set([...assembly.placementIds, selectedPlacementId])]
        : assembly.placementIds.filter((id) => id !== selectedPlacementId),
    })));
  }

  function deleteSelectedAssembly() {
    setAssemblies((items) => items.filter((assembly) => assembly.id !== selectedAssemblyId));
    setSelectedAssemblyId(null);
  }

  function exportConstructionSchedule() {
    const header = ['Item', 'Asset type', 'Version', 'Surface', 'Quantity', 'Estimated unit area m2', 'Estimated total area m2', 'Assembly', 'Status'];
    const lines = [
      header,
      ...scheduleRows.map((row) => [
        row.item,
        row.assetType,
        row.version,
        row.surface,
        row.quantity,
        row.unitArea.toFixed(3),
        row.totalArea.toFixed(3),
        row.assembly,
        row.status,
      ]),
    ];
    downloadText(
      `${projectName || 'mehraz-project'}-construction-schedule.csv`,
      lines.map((line) => line.map(csvCell).join(',')).join('\n'),
      'text/csv;charset=utf-8',
    );
  }

  function projectPayload(previewImage = '') {
    return createMehrazProjectPayload({
      building: buildingRef.current,
      walls,
      stageRenderMode,
      nightLights: nightLighting.lights,
      zones,
      assemblies,
      placements,
      projectInstances,
      combinationProfiles: combinationProfilesRef.current,
      constructionStepOrder,
      previewImage,
    });
  }

  function captureProjectThumbnail(fallback = '') {
    try {
      return sceneRef.current?.capture({
        width: 480,
        height: 320,
        view: 'front',
        fitContent: true,
        imageType: 'image/webp',
        imageQuality: 0.82,
        zoom: 1,
        panX: 0,
        panY: 0,
        style: 'solid',
        lighting: 'day',
        shadows: true,
        groundColor: building.groundColor,
      }) || fallback;
    } catch (error) {
      console.warn('Could not capture Mehraz project thumbnail.', error);
      return fallback;
    }
  }

  async function saveProjectToLibrary() {
    if (!user) {
      setLibraryMessage('Connect your Girih Studio account before saving a Mehraz project.');
      return;
    }
    const savedName = projectName.trim();
    if (!savedName) {
      setLibraryMessage('Give the project a name before saving it.');
      return;
    }
    setLibraryBusy(true);
    try {
      const currentProject = projects.find((project) => project.id === activeProjectAssetId);
      const thumbnail = captureProjectThumbnail();
      const payload = projectPayload('');
      const contentHash = await sha256Json(payload);
      const result = await saveLibraryAsset(supabase, {
        assetId: activeProjectAssetId,
        assetType: 'mehraz_project',
        sourceApp: 'mehraz',
        name: savedName,
        payload,
        contentHash,
        metadata: {
          editorSchemaVersion: MEHRAZ_PROJECT_SCHEMA_VERSION,
          placementCount: placements.length,
          zoneCount: zones.length,
          assemblyCount: assemblies.length,
          nightLightCount: nightLighting.lights.length,
          pinnedVersionCount: new Set(placements.map((placement) => placement.assetVersionId)).size,
          projectInstanceCount: projectInstances.length,
        },
      });
      if (activeProjectAssetId && currentProject?.name !== savedName) {
        await updateLibraryAssetMetadata(supabase, activeProjectAssetId, {
          name: savedName,
          description: currentProject?.description || '',
        });
      }
      setActiveProjectAssetId(result.assetId);
      setActiveProjectVersionId(result.versionId || null);
      setSelectedProjectVersionId(result.versionId || '');
      setProjectName(savedName);
      let thumbnailWarning = '';
      try {
        await uploadLibraryThumbnail(supabase, {
          assetId: result.assetId,
          versionId: result.versionId,
          dataUrl: thumbnail,
          previousPath: currentProject?.thumbnail_path || null,
        });
      } catch (error) {
        thumbnailWarning = ` Project data was saved, but its thumbnail was not updated: ${error.message}`;
      }
      if (editingProjectInstance && compositionReturnRef.current) {
        const editedPayload = payload;
        compositionReturnRef.current.projectInstances = compositionReturnRef.current.projectInstances.map((instance) => (
          instance.id === editingProjectInstance.id
            ? {
              ...instance,
              versionId: result.versionId || instance.versionId,
              versionNumber: result.versionNumber || instance.versionNumber,
              name: savedName,
              payload: editedPayload,
            }
            : instance
        ));
        setEditingProjectInstance((current) => current ? {
          ...current,
          saved: true,
          versionId: result.versionId || current.versionId,
          versionNumber: result.versionNumber || current.versionNumber,
          payload: editedPayload,
        } : current);
      }
      await refreshLibrary();
      setLibraryMessage(result.updated
        ? `Mehraz project version ${result.versionNumber} saved.${thumbnailWarning}`
        : `Mehraz project saved to your shared library.${thumbnailWarning}`);
    } catch (error) {
      setLibraryMessage(error.message);
    } finally {
      setLibraryBusy(false);
    }
  }

  async function deleteProject(project) {
    if (!project || libraryBusy) return;
    if (!window.confirm(`Delete "${project.name}" from your project library?`)) return;
    setLibraryBusy(true);
    try {
      await archiveLibraryAsset(supabase, project.id);
      if (project.id === activeProjectAssetId) {
        setActiveProjectAssetId(null);
        setActiveProjectVersionId(null);
        setSelectedProjectVersionId('');
      }
      await refreshLibrary();
      setLibraryMessage(`${project.name} deleted from the project library.`);
    } catch (error) {
      setLibraryMessage(error.message);
    } finally {
      setLibraryBusy(false);
    }
  }

  function clearStageBeforeProjectLoad() {
    placementsRef.current = [];
    projectInstancesRef.current = [];
    zonesRef.current = [];
    assembliesRef.current = [];
    selectedPlacementIdRef.current = null;
    selectedProjectInstanceIdRef.current = null;
    selectedZoneIdRef.current = null;
    setPlacements([]);
    setProjectInstances([]);
    setZones([]);
    setAssemblies([]);
    setSelectedPlacementId(null);
    setSelectedProjectInstanceId(null);
    setSelectedZoneId(null);
    setSelectedWallSide(null);
    setSelectedOpeningGuide(null);
    setSelectedGridBay(null);
    setSelectedGridBays([]);
    setSelectedGridElement(null);
    setSelectedGridElements([]);
    setSelectedAssemblyId(null);
    setAssemblyDraftSelection([]);
    setConstructionPlaying(false);
    setRoomSectionView(false);
    setNightLighting({ preview: false, guides: false, selectedId: null, lights: [] });
    const scene = sceneRef.current;
    scene?.resetStageContent();
  }

  function applyProject(payload, asset = null, version = null) {
    const savedProject = normalizeMehrazProjectPayload(payload);
    const previousBuildingType = buildingTypeSelected
      ? (buildingRef.current?.buildingType || (buildingRef.current?.type === 'room' ? 'room' : 'portal'))
      : null;
    clearStageBeforeProjectLoad();
    showCompleteConstruction();
    setBuildingTypeSelected(true);
    setBuildingTypePickerExpanded(false);
    buildingDimensionsRef.current = captureBuildingDimensionProfiles(
      savedProject.building,
      savedProject.building.dimensionsByBuildingType,
    );
    combinationProfilesRef.current = normalizeCombinationProfileStore(
      savedProject.combinationProfiles,
      savedProject.building,
      savedProject.walls,
    );
    const nextBuilding = normalizeBuilding({
      ...savedProject.building,
      dimensionsByBuildingType: buildingDimensionsRef.current,
    });
    const nextBuildingType = nextBuilding.buildingType || (nextBuilding.type === 'room' ? 'room' : 'portal');
    setBuilding(nextBuilding);
    const nextStageRenderMode = savedProject.stageRenderMode;
    setStageRenderMode(nextStageRenderMode);
    setExportOptions((value) => ({ ...value, stageRenderMode: nextStageRenderMode }));
    setWalls(savedProject.walls);
    setConstructionStepOrder(savedProject.constructionStepOrder);
    setNightLighting({ preview: false, guides: false, selectedId: null, lights: savedProject.nightLights });
    setZones(savedProject.zones);
    const normalizedPlacements = savedProject.placements.filter((placement) => placement && !placement.generatedFromZone).map((placement) => {
      const surfaceId = placement.surfaceId || 'north_interior';
      const transform = placement.transform || defaultPlacementTransform(surfaceId, savedProject.building, savedProject.walls);
      return {
        ...placement,
        surfaceId,
        transform,
        options: { constrain: true, snap: 0.1, ...placement.options },
      };
    });
    const validPlacementIds = new Set(normalizedPlacements.map((placement) => placement.id));
    const nextAssemblies = savedProject.assemblies.map((assembly) => ({
      ...assembly,
      placementIds: Array.isArray(assembly.placementIds)
        ? assembly.placementIds.filter((id) => validPlacementIds.has(id))
        : [],
    }));
    const nextProjectInstances = savedProject.projectInstances || [];
    setAssemblies(nextAssemblies);
    setPlacements(normalizedPlacements);
    setProjectInstances(nextProjectInstances);
    buildingRef.current = nextBuilding;
    wallsRef.current = savedProject.walls;
    zonesRef.current = savedProject.zones;
    assembliesRef.current = nextAssemblies;
    placementsRef.current = normalizedPlacements;
    projectInstancesRef.current = nextProjectInstances;
    const scene = sceneRef.current;
    if (scene) {
      sceneHasInitialArchitectureRef.current = true;
      scene.setConstructionStepOrder(savedProject.constructionStepOrder);
      scene.setArchitectureVisible(true);
      scene.setArchitecture(nextBuilding, savedProject.walls, nextStageRenderMode);
      scene.setZones(savedProject.zones);
      scene.setPlacements(normalizedPlacements);
      scene.setProjectInstances(nextProjectInstances);
      scene.setNightPreview(false);
      scene.setNightLights(savedProject.nightLights);
      scene.setNightLightGuidesVisible(false);
    }
    setSelectedPlacementId(null);
    setSelectedZoneId(null);
    setSelectedAssemblyId(null);
    setAssemblyDraftSelection([]);
    setActiveProjectAssetId(asset?.id || null);
    setActiveProjectVersionId(version?.id || asset?.currentVersion?.id || null);
    setSelectedProjectVersionId(version?.id || asset?.current_version_id || asset?.currentVersion?.id || '');
    setProjectName(asset?.name || 'Imported Mehraz project');
    if (previousBuildingType !== nextBuildingType) showIsometricStageViewAndFit();
    const versionNumber = version?.version_number || asset?.currentVersion?.version_number;
    setLibraryMessage(asset ? `Opened ${asset.name}${versionNumber ? ` - version ${versionNumber}` : ''}.` : 'Project imported.');
  }

  async function openProject(asset, version = asset?.currentVersion) {
    const requestId = ++projectLoadRequestRef.current;
    setLibraryBusy(true);
    try {
      const loadedVersion = await loadFullLibraryVersion(asset, version);
      if (requestId !== projectLoadRequestRef.current) return;
      applyProject(loadedVersion.payload, asset, loadedVersion);
    } catch (error) {
      if (requestId !== projectLoadRequestRef.current) return;
      setLibraryMessage(error.message);
    } finally {
      if (requestId === projectLoadRequestRef.current) setLibraryBusy(false);
    }
  }

  async function makeProjectVersionCurrent() {
    if (!activeProject || !selectedProjectVersion || libraryBusy) return;
    setLibraryBusy(true);
    try {
      await setCurrentLibraryAssetVersion(supabase, activeProject.id, selectedProjectVersion.id);
      await refreshLibrary();
      setSelectedProjectVersionId(selectedProjectVersion.id);
      setLibraryMessage(`${activeProject.name} version ${selectedProjectVersion.version_number} is now current.`);
    } catch (error) {
      setLibraryMessage(error.message);
    } finally {
      setLibraryBusy(false);
    }
  }

  async function importProject(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      projectLoadRequestRef.current += 1;
      applyProject(JSON.parse(await file.text()));
    } catch (error) {
      setLibraryMessage(error.message);
    }
  }

  function newProject() {
    projectLoadRequestRef.current += 1;
    setLibraryBusy(false);
    clearStageBeforeProjectLoad();
    buildingDimensionsRef.current = defaultBuildingDimensionProfiles();
    combinationProfilesRef.current = { profiles: {}, activeByBuildingType: {} };
    setBuilding(normalizeBuilding({ dimensionsByBuildingType: buildingDimensionsRef.current }));
    const defaultBuilding = normalizeBuilding();
    setWalls(portalDefaultWallSystem(DEFAULT_WALL_SYSTEM, defaultBuilding));
    setStageRenderMode('textured');
    setExportOptions((value) => ({ ...value, stageRenderMode: 'textured' }));
    sceneRef.current?.setNightPreview(false);
    sceneRef.current?.setNightLights([]);
    sceneRef.current?.setNightLightGuidesVisible(false);
    setZones([]);
    setAssemblies([]);
    setPlacements([]);
    setProjectInstances([]);
    setSelectedPlacementId(null);
    setSelectedProjectInstanceId(null);
    setSelectedZoneId(null);
    setSelectedWallSide(null);
    setSelectedOpeningGuide(null);
    setSelectedAssemblyId(null);
    setAssemblyDraftSelection([]);
    setActiveProjectAssetId(null);
    setActiveProjectVersionId(null);
    setSelectedProjectVersionId('');
    setEditingProjectInstance(null);
    compositionReturnRef.current = null;
    setProjectName('My Mehraz portal');
    setConstructionPlaying(false);
    setConstructionStepOrder(normalizeConstructionStepOrder());
    sceneRef.current?.stopConstructionSequence();
    sceneRef.current?.setConstructionStepOrder(normalizeConstructionStepOrder());
    setConstructionStep(0);
    sceneRef.current?.applyConstructionStep(0);
    sceneRef.current?.setArchitectureVisible(false);
    setBuildingTypeSelected(false);
    setBuildingTypePickerExpanded(true);
    setRightTab('building');
    setLibraryMessage('New empty stage ready. Choose a building type to begin.');
    showFrontStageView();
  }

  function exportPixels(fullResolution = false) {
    const sizes = {
      a4: [8.2677, 11.6929],
      a3: [11.6929, 16.5354],
      letter: [8.5, 11],
    };
    const [shortSide, longSide] = sizes[exportOptions.paper] || sizes.a4;
    const portrait = exportOptions.orientation === 'portrait';
    const dpi = fullResolution ? exportOptions.dpi : Math.min(96, exportOptions.dpi);
    const width = Math.round((portrait ? shortSide : longSide) * dpi);
    const height = Math.round((portrait ? longSide : shortSide) * dpi);
    return { width, height };
  }

  function refreshExportPreview() {
    if (!sceneRef.current) return;
    const { width, height } = exportPixels(false);
    setExportPreview(sceneRef.current.capture({
      width,
      height,
      ...exportOptions,
      view: exportOptions.format === 'mp4' ? 'iso-ne' : exportOptions.view,
    }));
  }

  useEffect(() => {
    if (!exportOpen) return;
    const frame = requestAnimationFrame(refreshExportPreview);
    return () => cancelAnimationFrame(frame);
  }, [exportOpen, exportOptions, building, walls, nightLighting, renderedPlacements, projectInstances]);

  function openExport() {
    setExportOpen(true);
    requestAnimationFrame(refreshExportPreview);
  }

  async function exportRendered(format = exportOptions.format) {
    if (!sceneRef.current) return;
    setExportBusy(true);
    setExportProgress(0);
    try {
      if (format === 'json') {
        downloadJson(`${projectName || 'mehraz-project'}.mehraz.json`, projectPayload());
        return;
      }
      if (format === 'stl') {
        downloadBlob(`${projectName || 'mehraz-project'}.stl`, sceneRef.current.exportStlBlob());
        return;
      }
      if (format === 'glb') {
        downloadBlob(`${projectName || 'mehraz-project'}.glb`, await sceneRef.current.exportGlbBlob());
        return;
      }
      if (format === 'mp4') {
        const video = await sceneRef.current.exportOrbitVideo(exportOptions, setExportProgress);
        downloadBlob(`${projectName || 'mehraz-project'}-orbit.mp4`, video);
        return;
      }
      const { width, height } = exportPixels(true);
      const image = sceneRef.current.capture({ width, height, ...exportOptions });
      if (format === 'png') {
        downloadDataUrl(`${projectName || 'mehraz-project'}-${exportOptions.view}.png`, image);
      } else {
        const portrait = exportOptions.orientation === 'portrait';
        const pdf = new jsPDF({ orientation: portrait ? 'portrait' : 'landscape', unit: 'mm', format: exportOptions.paper, compress: true });
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        pdf.setFillColor(246, 240, 228);
        pdf.rect(0, 0, pageWidth, pageHeight, 'F');
        pdf.addImage(image, 'PNG', 8, 8, pageWidth - 16, pageHeight - 16, undefined, 'FAST');
        pdf.save(`${projectName || 'mehraz-project'}-${exportOptions.view}.pdf`);
      }
    } catch (error) {
      setLibraryMessage(error?.message || 'Export failed. Please try again.');
    } finally {
      setExportBusy(false);
    }
  }

  function startExportPan(event) {
    exportPanRef.current = { x: event.clientX, y: event.clientY, panX: exportOptions.panX, panY: exportOptions.panY };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function moveExportPan(event) {
    if (!exportPanRef.current) return;
    const scale = 0.012 / Math.max(0.5, exportOptions.zoom);
    setExportOptions((value) => ({
      ...value,
      panX: exportPanRef.current.panX - (event.clientX - exportPanRef.current.x) * scale,
      panY: exportPanRef.current.panY + (event.clientY - exportPanRef.current.y) * scale,
    }));
  }

  function updateWalls(patch) {
    setWalls((value) => normalizeWallSystem({ ...value, ...patch }, building));
  }

  function updateWallGroup(group, patch) {
    const portalKarbandiGeometryFields = new Set([
      'wallLegMode',
      'ribCount',
      'ribWidth',
      'ribDepth',
      'referenceAngle',
      'referenceZ',
      'referenceRotation',
      'span',
      'springHeightOffset',
      'redOffset',
      'greenOffset',
      'greenHeightOffset',
    ]);
    if (group === 'karbandi'
      && building.type !== 'room'
      && Object.keys(patch).some((key) => portalKarbandiGeometryFields.has(key))) {
      updateKarbandiDesign(patch);
      return;
    }
    setWalls((value) => normalizeWallSystem({
      ...value,
      [group]: { ...value[group], ...patch },
    }, building));
  }

  function updateKarbandiWeb(patch) {
    setWalls((value) => normalizeWallSystem({
      ...value,
      karbandi: {
        ...value.karbandi,
        web: { ...value.karbandi?.web, ...patch },
      },
    }, building));
  }

  function updateKarbandiDesign(patch) {
    setWalls((value) => {
      const seatingBuilding = ['hall', 'grid'].includes(building.buildingType)
        ? {
          ...building,
          type: 'room',
          roomPlanShape: 'square',
          width: building.hallBayWidth,
          depth: building.hallBayDepth,
          length: building.hallBayDepth,
        }
        : building;
      const normalizedPatch = Object.prototype.hasOwnProperty.call(patch, 'ribCount')
        ? { ...patch, ribCount: normalizeKarbandiRibCount(patch.ribCount) }
        : patch.wallLegMode === 'two'
          ? { ...patch, referenceAngle: 180 }
          : patch;
      const karbandi = {
        ...value.karbandi,
        ...normalizedPatch,
        ...(building.type !== 'room' ? { autoClip: true } : {}),
      };
      const squareRoomOneLeg = karbandi.wallLegMode === 'one'
        && building.type === 'room'
        && building.buildingType !== 'vestibule'
        && (building.roomPlanShape || 'square') === 'square';
      if (squareRoomOneLeg && Object.prototype.hasOwnProperty.call(patch, 'wallLegMode')) {
        Object.assign(karbandi, solveKarbandiOneLegCornerSeating(karbandi, seatingBuilding, value));
        return normalizeWallSystem({ ...value, karbandi }, building);
      }
      const ordinaryReferenceEdit = Object.prototype.hasOwnProperty.call(patch, 'referenceAngle')
        || Object.prototype.hasOwnProperty.call(patch, 'referenceZ');
      if (ordinaryReferenceEdit) {
        return normalizeWallSystem({ ...value, karbandi }, building);
      }
      if (building.type !== 'room' && building.portalPlanShape === 'octagon') {
        Object.assign(karbandi, solveKarbandiWallSeating(karbandi, seatingBuilding, value, {
          preserveReferenceZ: Object.prototype.hasOwnProperty.call(patch, 'referenceZ'),
        }));
        return normalizeWallSystem({ ...value, karbandi }, building);
      }
      const reseatWholeDesign = Object.prototype.hasOwnProperty.call(patch, 'ribCount')
        || Object.prototype.hasOwnProperty.call(patch, 'wallLegMode');
      if (reseatWholeDesign) {
        Object.assign(karbandi, solveKarbandiWallSeating(karbandi, building, value, {
          preserveReferenceZ: Object.prototype.hasOwnProperty.call(patch, 'referenceZ'),
        }));
        return normalizeWallSystem({ ...value, karbandi }, building);
      }
      if (!Object.prototype.hasOwnProperty.call(patch, 'span')) {
        karbandi.span = karbandiSpanForWallLegCenters(karbandi, seatingBuilding, value);
      }
      if (Object.prototype.hasOwnProperty.call(patch, 'span')) {
        const seatingDepth = ['hall', 'grid'].includes(building.buildingType)
          ? Math.max(0.2, Number(building.hallBayDepth) || 4)
          : karbandiReferenceDepth;
        karbandi.referenceZ = karbandiReferenceZForRibCount(karbandi, seatingDepth);
      }
      karbandi.groupY = karbandiGroupYForWallTopLegCenters(karbandi, seatingBuilding, value);
      karbandi.groupZ = karbandiGroupZForWallLegCenters(karbandi, seatingBuilding, value);
      return normalizeWallSystem({ ...value, karbandi }, building);
    });
  }

  function setCoverEnabled(type, enabled) {
    setWalls((value) => {
      const selectingKarbandi = type === 'karbandi' && enabled && value.karbandi?.enabled !== true;
      const karbandi = {
        ...value.karbandi,
        enabled: type === 'karbandi' ? enabled : (enabled ? false : value.karbandi?.enabled),
        ...(selectingKarbandi ? {
          ribCount: DEFAULT_WALL_SYSTEM.karbandi.ribCount,
          referenceAngle: DEFAULT_WALL_SYSTEM.karbandi.referenceAngle,
          groupScale: DEFAULT_WALL_SYSTEM.karbandi.groupScale,
        } : {}),
      };
      if (selectingKarbandi) {
        karbandi.span = karbandiSpanForWallLegCenters(karbandi, building, value);
        karbandi.referenceZ = karbandiReferenceZForRibCount(karbandi, karbandiReferenceDepth);
        karbandi.span = karbandiSpanForWallLegCenters(karbandi, building, value);
        karbandi.referenceZ = karbandiReferenceZForRibCount(karbandi, karbandiReferenceDepth);
        karbandi.groupY = karbandiGroupYForWallTopLegCenters(karbandi, building, value);
        karbandi.groupZ = karbandiGroupZForWallLegCenters(karbandi, building, value);
      }
      return normalizeWallSystem({
        ...value,
        portalTransition: type === 'karbandi' && enabled ? 'karbandi' : value.portalTransition,
        ahang: {
          ...value.ahang,
          enabled: type === 'ahang' ? enabled : value.ahang?.enabled,
        },
        karbandi,
      }, building);
    });
  }

  async function updateProjectVersionRetention() {
    if (!activeProject || libraryBusy) return;
    setLibraryBusy(true);
    try {
      const result = await setLibraryAssetVersionRetention(
        supabase,
        activeProject.id,
        projectVersionRetention,
      );
      setProjects((items) => items.map((project) => project.id === activeProject.id
        ? { ...project, version_retention_limit: result.keepCount }
        : project));
      const versions = await listLibraryAssetVersions(supabase, activeProject.id);
      setProjectVersionsById((current) => ({ ...current, [activeProject.id]: versions }));
      writeLibraryVersionListCache(activeProject.id, versions);
      setLibraryMessage(`Keeping the newest ${result.keepCount} project versions. ${result.deletedCount} older version${result.deletedCount === 1 ? '' : 's'} removed.`);
    } catch (error) {
      setLibraryMessage(error.message);
    } finally { setLibraryBusy(false); }
  }

  function switchSettingsCombination(selection, buildingPatch = null, transformWalls = null, allowBuildingTypeChange = false) {
    const currentBuilding = buildingRef.current || building;
    const currentWalls = wallsRef.current || walls;
    const currentBuildingType = settingsCombination(currentBuilding, currentWalls).buildingType;
    if (!allowBuildingTypeChange && selection.buildingType !== currentBuildingType) return;
    let store = saveCombinationProfile(combinationProfilesRef.current, currentBuilding, currentWalls);
    const profile = loadCombinationProfile(store, selection, currentBuilding);
    const nextBuilding = normalizeBuilding({ ...profile.building, ...(buildingPatch || {}) });
    const nextWalls = normalizeWallSystem(
      typeof transformWalls === 'function' ? transformWalls(profile.walls, nextBuilding) : profile.walls,
      nextBuilding,
    );
    store = saveCombinationProfile(store, nextBuilding, nextWalls);
    combinationProfilesRef.current = store;
    buildingDimensionsRef.current = captureBuildingDimensionProfiles(
      nextBuilding,
      nextBuilding.dimensionsByBuildingType || buildingDimensionsRef.current,
    );
    setBuilding(normalizeBuilding({
      ...nextBuilding,
      dimensionsByBuildingType: buildingDimensionsRef.current,
    }));
    setWalls(nextWalls);
  }

  function selectPortalCover(type) {
    if (!['none', 'ahang', 'dome', 'raised-rib-vault'].includes(type)) return;
    const currentBuilding = buildingRef.current || building;
    const currentWalls = wallsRef.current || walls;
    if (currentBuilding.buildingType !== 'portal') return;
    const currentSelection = settingsCombination(currentBuilding, currentWalls);
    if (type === 'ahang' && currentSelection.transition === 'karbandi') return;
    if (type === 'raised-rib-vault' && currentSelection.transition !== 'none') return;
    if (type === 'dome' && currentSelection.transition === 'none') return;
    const nextBuilding = normalizeBuilding({
      ...currentBuilding,
      domeEnabled: type === 'dome',
      domeCoverType: type === 'dome' ? 'dome' : 'none',
    });
    const nextWalls = normalizeWallSystem({
      ...currentWalls,
      portalCover: type,
      ahang: { ...currentWalls.ahang, enabled: type === 'ahang' },
    }, nextBuilding);
    setBuilding(nextBuilding);
    setWalls(nextWalls);
  }

  function selectPortalTransition(type) {
    const currentBuilding = buildingRef.current || building;
    const currentWalls = wallsRef.current || walls;
    if (currentBuilding.buildingType !== 'portal') return;
    if ((currentBuilding.portalPlanShape || 'square') !== 'square' && !['none', 'karbandi'].includes(type)) return;
    const currentSelection = settingsCombination(currentBuilding, currentWalls);
    switchSettingsCombination({ ...currentSelection, transition: type, cover: 'none' });
  }

  function updateDomeTransitionSettings(type, patch) {
    setBuilding((value) => normalizeBuilding({
      ...value,
      domeTransitionSettings: {
        ...value.domeTransitionSettings,
        [type]: {
          ...value.domeTransitionSettings?.[type],
          ...patch,
        },
      },
    }));
  }

  function domeSupportModeFor(value) {
    return value.buildingType === 'room' && (value.roomPlanShape || 'square') !== 'square'
      ? 'direct'
      : value.domeTransition;
  }

  function addRoomPlanOpening(type) {
    const nextOpening = createRoomPlanOpening(
      type,
      globalThis.crypto?.randomUUID?.() || `room-opening-${Date.now()}`,
    );
    updateWalls({ roomPlanOpenings: [...(walls.roomPlanOpenings || []), nextOpening] });
  }

  function selectBuildingType(buildingType) {
    const currentBuilding = buildingRef.current || building;
    const currentBuildingType = currentBuilding.buildingType || (currentBuilding.type === 'room' ? 'room' : 'portal');
    const buildingTypeChanged = !buildingTypeSelected || buildingType !== currentBuildingType;
    setBuildingTypeSelected(true);
    setBuildingTypePickerExpanded(false);
    if (buildingType === currentBuildingType) {
      showCompleteConstruction();
      if (buildingTypeChanged) showIsometricStageViewAndFit();
      return;
    }
    prepareConstructionForBuildingChange();
    const savedStore = saveCombinationProfile(combinationProfilesRef.current, buildingRef.current, wallsRef.current);
    combinationProfilesRef.current = savedStore;
    switchSettingsCombination(lastCombinationSelection(savedStore, buildingType), null, null, true);
    if (buildingTypeChanged) showIsometricStageViewAndFit();
  }

  function selectRoomPlanShape(roomPlanShape) {
    if (roomPlanShape === building.roomPlanShape) return;
    const currentSelection = settingsCombination(building, walls);
    const blankShell = currentSelection.transition === 'none' && currentSelection.cover === 'none';
    const targetTransition = blankShell
      ? 'none'
      : roomPlanShape === 'square'
        ? currentSelection.transition === 'direct' ? 'none' : currentSelection.transition
        : currentSelection.cover === 'none' ? 'none' : 'direct';
    const targetCover = currentSelection.cover;
    const directDomeDefaults = ['circle', 'octagon'].includes(roomPlanShape) && (blankShell || targetCover === 'dome')
      ? {
        domeArch: {
          ...building.domeArch,
          archType: 'two-point',
          redOffset: 0,
          redRadius: null,
          greenOffset: 1.4,
          greenHeightOffset: -1.45,
        },
        domeCenterOpeningEnabled: false,
      }
      : {};
    if (currentSelection.transition !== targetTransition) {
      switchSettingsCombination(
        { ...currentSelection, transition: targetTransition, cover: targetCover },
        { roomPlanShape, ...directDomeDefaults },
        (value) => ({
          ...value,
          roomPlanOpenings: roomPlanOpeningsWithDefaultDoor(
            value.roomPlanOpenings,
            roomPlanShape,
            globalThis.crypto?.randomUUID?.() || `room-opening-${Date.now()}`,
          ),
        }),
      );
      return;
    }
    const nextBuilding = normalizeBuilding({ ...building, roomPlanShape, ...directDomeDefaults });
    setBuilding(nextBuilding);
    setWalls((value) => normalizeWallSystem({
      ...value,
      roomPlanOpenings: roomPlanOpeningsWithDefaultDoor(
        value.roomPlanOpenings,
        roomPlanShape,
        globalThis.crypto?.randomUUID?.() || `room-opening-${Date.now()}`,
      ),
    }, nextBuilding));
  }

  function selectPortalPlanShape(portalPlanShape) {
    if (portalPlanShape === building.portalPlanShape) return;
    const currentSelection = settingsCombination(building, walls);
    const incompatibleTransition = portalPlanShape !== 'square' && !['none', 'karbandi'].includes(currentSelection.transition);
    const targetTransition = incompatibleTransition ? 'none' : currentSelection.transition;
    const targetCover = incompatibleTransition && currentSelection.cover === 'dome' ? 'none' : currentSelection.cover;
    if (targetTransition !== currentSelection.transition || targetCover !== currentSelection.cover) {
      switchSettingsCombination(
        { buildingType: 'portal', transition: targetTransition, cover: targetCover },
        { portalPlanShape },
      );
      return;
    }
    const nextBuilding = normalizeBuilding({ ...building, portalPlanShape });
    setBuilding(nextBuilding);
    setWalls((value) => normalizeWallSystem(value, nextBuilding));
  }

  function updateRoomPlanOpening(id, patch) {
    updateWalls({
      roomPlanOpenings: (walls.roomPlanOpenings || []).map((opening) => (
        opening.id === id ? { ...opening, ...patch } : opening
      )),
    });
  }

  function deleteRoomPlanOpening(id) {
    updateWalls({ roomPlanOpenings: (walls.roomPlanOpenings || []).filter((opening) => opening.id !== id) });
  }

  function selectRoomDomeTransition(type) {
    const currentBuilding = buildingRef.current || building;
    if (['hall', 'grid'].includes(currentBuilding.buildingType)) {
      selectHallTransition(type);
      return;
    }
    if (!['room', 'vestibule'].includes(currentBuilding.buildingType)) return;
    switchSettingsCombination({
      buildingType: currentBuilding.buildingType,
      transition: type,
      cover: 'none',
    });
  }

  function selectRoomCover(type) {
    const currentBuilding = buildingRef.current || building;
    if (!['room', 'vestibule'].includes(currentBuilding.buildingType)) return;
    if (currentBuilding.buildingType === 'room'
      && (currentBuilding.roomPlanShape || 'square') === 'square'
      && currentBuilding.domeTransition === 'karbandi'
      && !['none', 'dome'].includes(type)) return;
    setBuilding(normalizeBuilding({
      ...currentBuilding,
      domeCoverType: type,
      domeEnabled: type !== 'none',
    }));
  }

  function selectHallTransition(type) {
    const currentBuilding = buildingRef.current || building;
    const currentWalls = wallsRef.current || walls;
    if (!['hall', 'grid'].includes(currentBuilding.buildingType)) return;
    if (currentBuilding.buildingType === 'grid') {
      setBuilding((value) => {
        const gridX = Math.max(1, Math.round(Number(value.hallGridX) || 1));
        const gridY = Math.max(1, Math.round(Number(value.hallGridY) || 1));
        const gridBayTransitions = {};
        const gridBayCovers = {};
        for (let ix = 0; ix < gridX; ix += 1) {
          for (let iy = 0; iy < gridY; iy += 1) {
            gridBayTransitions[`${ix}:${iy}`] = type;
            gridBayCovers[`${ix}:${iy}`] = 'none';
          }
        }
        return normalizeBuilding({
          ...value,
          hallTransitionEnabled: type !== 'none',
          hallTransitionType: type,
          domeTransition: type,
          hallCoverType: 'none',
          gridBayTransitions,
          gridBayCovers,
        });
      });
      return;
    }
    switchSettingsCombination(
      { ...settingsCombination(currentBuilding, currentWalls), transition: type, cover: 'none' },
      { hallTransitionEnabled: type !== 'none' },
    );
  }

  function selectHallCover(type) {
    const currentBuilding = buildingRef.current || building;
    if (!['hall', 'grid'].includes(currentBuilding.buildingType)) return;
    if (currentBuilding.buildingType === 'grid') {
      setBuilding((value) => {
        const gridX = Math.max(1, Math.round(Number(value.hallGridX) || 1));
        const gridY = Math.max(1, Math.round(Number(value.hallGridY) || 1));
        const gridBayCovers = {};
        for (let ix = 0; ix < gridX; ix += 1) {
          for (let iy = 0; iy < gridY; iy += 1) gridBayCovers[`${ix}:${iy}`] = type;
        }
        return normalizeBuilding({
          ...value,
          hallCoverType: type,
          hallTransitionEnabled: ['none', 'dome'].includes(type)
            ? value.hallTransitionType !== 'none'
            : value.hallTransitionEnabled,
          gridBayCovers,
        });
      });
      return;
    }
    setBuilding(normalizeBuilding({
      ...currentBuilding,
      hallCoverType: type,
      domeEnabled: type === 'dome',
      hallTransitionEnabled: ['none', 'dome'].includes(type)
        ? currentBuilding.hallTransitionType !== 'none'
        : currentBuilding.hallTransitionEnabled,
    }));
  }

  function removeSelectedGridElement() {
    if (!activeGridElements.length) return;
    const fieldByType = {
      wall: 'gridRemovedWalls',
      vault: 'gridRemovedVaults',
      dome: 'gridRemovedDomes',
      transition: 'gridRemovedTransitions',
    };
    setBuilding((value) => {
      const next = { ...value };
      Object.entries(fieldByType).forEach(([type, field]) => {
        const ids = activeGridElements.filter((item) => item.type === type).map((item) => item.id);
        if (ids.length) next[field] = [...new Set([...(value[field] || []), ...ids])];
      });
      return normalizeBuilding(next);
    });
    setSelectedGridElement(null);
  }

  function restoreSelectedGridElements() {
    if (!activeGridElements.length) return;
    const ids = new Set(activeGridElements.map((item) => item.id));
    setBuilding((value) => normalizeBuilding({
      ...value,
      gridRemovedWalls: value.gridRemovedWalls.filter((id) => !ids.has(id)),
      gridRemovedVaults: value.gridRemovedVaults.filter((id) => !ids.has(id)),
      gridRemovedDomes: value.gridRemovedDomes.filter((id) => !ids.has(id)),
      gridRemovedTransitions: value.gridRemovedTransitions.filter((id) => !ids.has(id)),
    }));
  }

  function selectGridGuideElement(selection, additive = false) {
    setSelectedGridElement(selection);
    setSelectedGridElements((current) => {
      if (!additive) return [selection];
      if (current.some((item) => item.id === selection.id)) {
        return current.filter((item) => item.id !== selection.id);
      }
      return [...current, selection];
    });
    if (selection.bay) setSelectedGridBay(selection.bay);
    setRightTab('building');
  }

  function setSelectedGridBaysRemoved(removed) {
    const selected = new Set(activeGridBayKeys);
    setBuilding((value) => normalizeBuilding({
      ...value,
      gridRemovedBays: removed
        ? [...new Set([...(value.gridRemovedBays || []), ...selected])]
        : (value.gridRemovedBays || []).filter((key) => !selected.has(key)),
    }));
    setSelectedGridElement(null);
  }

  function buildSelectedGridBays() {
    if (!activeGridBayKeys.length) return;
    const selected = new Set(activeGridBayKeys);
    const relatedVaults = new Set();
    const relatedCovers = new Set();
    const relatedTransitions = new Set();
    activeGridBayKeys.forEach((key) => {
      const [ix, iy] = key.split(':').map(Number);
      relatedVaults.add(`vault:x:${ix}:${iy}`);
      relatedVaults.add(`vault:x:${ix}:${iy + 1}`);
      relatedVaults.add(`vault:y:${ix}:${iy}`);
      relatedVaults.add(`vault:y:${ix + 1}:${iy}`);
      relatedCovers.add(`dome:${ix}:${iy}`);
      relatedCovers.add(`cover:${ix}:${iy}`);
      relatedTransitions.add(`transition:${ix}:${iy}`);
    });
    setBuilding((value) => normalizeBuilding({
      ...value,
      hallCoverType: 'dome',
      hallTransitionType: 'pendentive',
      gridBayCovers: { ...value.gridBayCovers, ...Object.fromEntries(activeGridBayKeys.map((key) => [key, 'dome'])) },
      gridBayTransitions: { ...value.gridBayTransitions, ...Object.fromEntries(activeGridBayKeys.map((key) => [key, 'pendentive'])) },
      gridRemovedBays: value.gridRemovedBays.filter((key) => !selected.has(key)),
      gridRemovedVaults: value.gridRemovedVaults.filter((id) => !relatedVaults.has(id)),
      gridRemovedDomes: value.gridRemovedDomes.filter((id) => !relatedCovers.has(id)),
      gridRemovedTransitions: value.gridRemovedTransitions.filter((id) => !relatedTransitions.has(id)),
    }));
  }

  function resizeGrid(axis, count) {
    setBuilding((value) => {
      const nextX = axis === 'x' ? count : value.hallGridX;
      const nextY = axis === 'y' ? count : value.hallGridY;
      const removed = new Set(value.gridRemovedBays || []);
      for (let ix = 0; ix < nextX; ix += 1) {
        for (let iy = 0; iy < nextY; iy += 1) {
          if (ix >= value.hallGridX || iy >= value.hallGridY) removed.add(`${ix}:${iy}`);
        }
      }
      return normalizeBuilding({
        ...value,
        hallGridX: nextX,
        hallGridY: nextY,
        gridRemovedBays: [...removed],
      });
    });
  }

  async function addProjectToStage(asset, version = asset?.currentVersion) {
    const requestId = ++projectLoadRequestRef.current;
    setLibraryBusy(true);
    try {
      const loadedVersion = await loadFullLibraryVersion(asset, version);
      if (requestId !== projectLoadRequestRef.current) return;
      const payload = normalizeMehrazProjectPayload(loadedVersion.payload);
      clearStageBeforeProjectLoad();
      buildingDimensionsRef.current = defaultBuildingDimensionProfiles();
      combinationProfilesRef.current = { profiles: {}, activeByBuildingType: {} };
      const blankBuilding = normalizeBuilding({ dimensionsByBuildingType: buildingDimensionsRef.current });
      setBuilding(blankBuilding);
      setWalls(portalDefaultWallSystem(DEFAULT_WALL_SYSTEM, blankBuilding));
      setBuildingTypeSelected(false);
      sceneRef.current?.setArchitectureVisible(false);
      const instance = normalizeProjectInstance({
        id: globalThis.crypto?.randomUUID?.() || `project-instance-${Date.now()}`,
        assetId: asset?.id || null,
        versionId: loadedVersion.id || asset?.current_version_id || null,
        versionNumber: loadedVersion.version_number || asset?.currentVersion?.version_number || null,
        name: asset?.name || 'Added Mehraz project',
        payload,
        transform: {
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
        },
      }, 0);
      if (!instance) throw new Error('This project version cannot be added to the stage.');
      projectInstancesRef.current = [instance];
      setProjectInstances([instance]);
      setActiveProjectAssetId(null);
      setActiveProjectVersionId(null);
      setSelectedProjectVersionId('');
      setProjectName(`${asset?.name || 'Mehraz project'} composition`);
      setSelectedProjectInstanceId(instance.id);
      setSelectedPlacementId(null);
      setSelectedZoneId(null);
      setRightTab('project');
      setLibraryMessage(`${instance.name} added to a clean stage as a locked project group. Double-click it to edit in isolation.`);
    } catch (error) {
      if (requestId !== projectLoadRequestRef.current) return;
      setLibraryMessage(error.message);
    } finally {
      if (requestId === projectLoadRequestRef.current) setLibraryBusy(false);
    }
  }

  function openProjectInstanceForEditing(id) {
    const instance = projectInstancesRef.current.find((item) => item.id === id);
    if (!instance || editingProjectInstance) return;
    compositionReturnRef.current = {
      building: buildingRef.current,
      walls: wallsRef.current,
      stageRenderMode,
      nightLights: nightLightingRef.current.lights,
      zones: zonesRef.current,
      assemblies: assembliesRef.current,
      placements: placementsRef.current,
      projectInstances: projectInstancesRef.current,
      activeProjectAssetId,
      activeProjectVersionId,
      selectedProjectVersionId,
      projectName,
    };
    setEditingProjectInstance({ ...instance, saved: false });
    setSelectedProjectInstanceId(null);
    const asset = projects.find((project) => project.id === instance.assetId) || {
      id: instance.assetId,
      name: instance.name,
      current_version_id: instance.versionId,
    };
    applyProject(instance.payload, asset, {
      id: instance.versionId,
      version_number: instance.versionNumber,
      payload: instance.payload,
    });
    setLibraryMessage(`${instance.name} is isolated for editing. Save a new version, then close edit to return.`);
  }

  function closeProjectInstanceEdit() {
    const composition = compositionReturnRef.current;
    if (!composition) return;
    setBuilding(composition.building);
    setWalls(composition.walls);
    setStageRenderMode(composition.stageRenderMode);
    setExportOptions((value) => ({ ...value, stageRenderMode: composition.stageRenderMode }));
    setZones(composition.zones);
    setAssemblies(composition.assemblies);
    setPlacements(composition.placements);
    setProjectInstances(composition.projectInstances);
    setActiveProjectAssetId(composition.activeProjectAssetId);
    setActiveProjectVersionId(composition.activeProjectVersionId);
    setSelectedProjectVersionId(composition.selectedProjectVersionId);
    setProjectName(composition.projectName);
    sceneRef.current?.setNightPreview(false);
    sceneRef.current?.setNightLights(composition.nightLights);
    sceneRef.current?.setNightLightGuidesVisible(false);
    setNightLighting((value) => ({ ...value, preview: false, guides: false, lights: composition.nightLights }));
    setSelectedProjectInstanceId(editingProjectInstance?.id || null);
    setSelectedPlacementId(null);
    setSelectedZoneId(null);
    setEditingProjectInstance(null);
    compositionReturnRef.current = null;
    setRightTab('project');
    setLibraryMessage(editingProjectInstance?.saved
      ? 'Saved project version updated in the composition.'
      : 'Returned to the composition without changing the pinned project version.');
    showFrontStageView();
  }

  function setDomeTransitionCoverEnabled(enabled) {
    setBuilding((value) => normalizeBuilding({ ...value, domeTransitionCoverEnabled: enabled }));
    if (building.domeTransition === 'karbandi') updateWallGroup('karbandi', { coverEnabled: enabled });
  }

  function toggleWallSide(side) {
    setWalls((value) => {
      const openSides = new Set(value.openSides);
      if (openSides.has(side)) openSides.delete(side);
      else openSides.add(side);
      return normalizeWallSystem({ ...value, openSides: [...openSides] }, building);
    });
  }

  function activateWallSide(side) {
    if (['room_dome', 'room_dome_inner', 'room_dome_extra_leg', 'room_dome_drum', 'room_dome_transition', 'room_dome_ring'].includes(side)) {
      setSelectedWallSide(side);
      setSelectedOpeningGuide(null);
      setSelectedPlacementId(null);
      setSelectedZoneId(null);
      setRightTab(side === 'room_dome_transition' ? 'transition' : 'cover');
      sceneRef.current?.selectWallSide(side, false);
      scrollInspectorTo(side === 'room_dome_transition'
        ? roomTransitionRef
        : side === 'room_dome_inner'
          ? roomInnerDomeRef
        : side === 'room_dome_drum'
          ? roomDomeDrumRef
        : side === 'room_dome_extra_leg'
          ? roomDomeExtraLegRef
          : side === 'room_dome_ring' ? roomDomeRingRef : roomDomeRef);
      return;
    }
    const surfaceId = surfaceIdForWallSide(side, building);
    if (!surfaceId) return;
    setSelectedWallSide(side);
    setSelectedOpeningGuide(null);
    setTargetSurfaceId(surfaceId);
    setSelectedPlacementId(null);
    setSelectedZoneId(null);
    sceneRef.current?.selectWallSide(side, false);
  }

  function activateOpeningGuide(type, side = 'south') {
    if (!['door', 'window'].includes(type)) return;
    const wallSide = building.type === 'room' && ROOM_WALL_SIDES.includes(side) ? side : 'south';
    const guide = building.type === 'room' ? `${wallSide}:${type}` : type;
    setSelectedOpeningGuide(guide);
    setSelectedWallSide(wallSide);
    setSelectedPlacementId(null);
    setSelectedProjectInstanceId(null);
    setSelectedZoneId(null);
    sceneRef.current?.setSelectedOpeningGuide(guide);
  }

  function activateRoomPlanOpeningGuide(opening) {
    if (!opening?.id) return;
    const guide = `plan:${opening.id}`;
    setSelectedOpeningGuide(guide);
    setSelectedWallSide(null);
    setSelectedPlacementId(null);
    setSelectedZoneId(null);
    sceneRef.current?.setSelectedOpeningGuide(guide);
  }

  function updateGlobalWallThickness(wallThickness) {
    setBuilding((value) => normalizeBuilding({ ...value, wallThickness }));
    if (building.type === 'room') {
      setWalls((value) => normalizeWallSystem({
        ...value,
        roomExteriorOffsets: Object.fromEntries(ROOM_WALL_SIDES.map((side) => [
          side,
          (value.sideOffsets?.[side] || 0) + wallThickness,
        ])),
      }, { ...building, wallThickness }));
    }
  }

  function changeTargetSurface(surfaceId) {
    setTargetSurfaceId(surfaceId);
    const side = wallSideForSurfaceId(surfaceId, building);
    setSelectedWallSide(side);
    setSelectedOpeningGuide(null);
    if (side) sceneRef.current?.selectWallSide(side, false);
    else sceneRef.current?.setSelectedWallSide(null);
  }

  async function setWallBond(side, selection, wallSide = side) {
    activateWallSide(wallSide);
    let bond;
    if (selection.startsWith('library:')) {
      const asset = wallPatternAssets.find((item) => item.id === selection.slice(8));
      if (!asset) return;
      setLibraryBusy(true);
      try {
        const version = await loadFullLibraryVersion(asset);
        bond = {
          source: 'library', assetType: asset.asset_type, assetId: asset.id,
          assetVersionId: version.id, name: asset.name, payload: version.payload,
        };
      } catch (error) {
        setLibraryMessage(error.message);
        return;
      } finally { setLibraryBusy(false); }
    } else {
      bond = { source: 'builtin', builtIn: selection.replace('builtin:', '') };
    }
    setWalls((value) => {
      const linkedSide = ['hall', 'grid'].includes(building.buildingType)
        && building.hallTransitionEnabled !== false
        && (building.hallTransitionType || 'pendentive') === 'pendentive'
        ? {
          room_dome_transition_exterior: 'room_dome',
          room_dome: 'room_dome_transition_exterior',
          room_dome_transition: 'room_dome_interior',
          room_dome_interior: 'room_dome_transition',
        }[side]
        : null;
      return normalizeWallSystem({
        ...value,
        bricks: {
          ...value.bricks,
          sideBonds: {
            ...value.bricks.sideBonds,
            [side]: bond,
            ...(linkedSide ? { [linkedSide]: bond } : {}),
          },
        },
      }, building);
    });
  }

  function wallBondValue(side) {
    const bond = walls.bricks.sideBonds[side];
    return bond.source === 'library' && wallPatternAssets.some((asset) => asset.id === bond.assetId)
      ? `library:${bond.assetId}`
      : `builtin:${bond.builtIn || 'running'}`;
  }

  function setWallBondScale(side, scale) {
    const linkedSide = ['hall', 'grid'].includes(building.buildingType)
      && building.hallTransitionEnabled !== false
      && (building.hallTransitionType || 'pendentive') === 'pendentive'
      ? {
        room_dome_transition_exterior: 'room_dome',
        room_dome: 'room_dome_transition_exterior',
        room_dome_transition: 'room_dome_interior',
        room_dome_interior: 'room_dome_transition',
      }[side]
      : null;
    setWalls((value) => normalizeWallSystem({
      ...value,
      bricks: {
        ...value.bricks,
        sideBonds: {
          ...value.bricks.sideBonds,
          [side]: { ...value.bricks.sideBonds[side], scale },
          ...(linkedSide ? {
            [linkedSide]: { ...value.bricks.sideBonds[linkedSide], scale },
          } : {}),
        },
      },
    }, building));
  }

  function importedBondPeriod(side) {
    const bond = walls.bricks.sideBonds[side];
    const pattern = bond?.payload?.pattern || bond?.payload || {};
    const columns = Math.max(1, Number(pattern.columns) || Math.max(1, ...(Array.isArray(pattern.bricks) ? pattern.bricks.map((brick) => Number(brick.x || 0) + Number(brick.width || 1)) : [1])));
    const rows = Math.max(1, Number(pattern.rows) || Math.max(1, ...(Array.isArray(pattern.bricks) ? pattern.bricks.map((brick) => Number(brick.y || 0) + Number(brick.height || 1)) : [1])));
    const scale = Number(walls.bricks.importedScale || 1) * Number(bond?.scale || 1);
    return {
      u: Math.max(walls.bricks.brickWidth, columns * walls.bricks.brickWidth * scale),
      v: Math.max(walls.bricks.brickHeight, rows * walls.bricks.brickHeight * scale),
    };
  }

  function setWallBondOffset(side, patch) {
    const linkedSide = ['hall', 'grid'].includes(building.buildingType)
      && building.hallTransitionEnabled !== false
      && (building.hallTransitionType || 'pendentive') === 'pendentive'
      ? {
        room_dome_transition_exterior: 'room_dome',
        room_dome: 'room_dome_transition_exterior',
        room_dome_transition: 'room_dome_interior',
        room_dome_interior: 'room_dome_transition',
      }[side]
      : null;
    setWalls((value) => normalizeWallSystem({
      ...value,
      bricks: {
        ...value.bricks,
        sideBonds: {
          ...value.bricks.sideBonds,
          [side]: { ...value.bricks.sideBonds[side], ...patch },
          ...(linkedSide ? {
            [linkedSide]: { ...value.bricks.sideBonds[linkedSide], ...patch },
          } : {}),
        },
      },
    }, building));
  }

  function alignWallBond(side, mode) {
    const period = importedBondPeriod(side);
    const patch = {};
    if (mode === 'horizontal' || mode === 'both') patch.offsetU = period.u / 2;
    if (mode === 'vertical' || mode === 'both') patch.offsetV = period.v / 2;
    setWallBondOffset(side, patch);
  }

  function renderWallBondControls(side, { wallSide = side, label = null } = {}) {
    return (
      <div className={`wall-bond-row ${selectedWallSide === wallSide || (wallSide === 'arch' && selectedWallSide === 'south_arch') ? 'active' : ''}`} onClick={() => activateWallSide(wallSide)}>
        <label><span>{label || `${WALL_BOND_LABELS[side] || side} decorative face bond`}</span><select value={wallBondValue(side)} onChange={(event) => setWallBond(side, event.target.value, wallSide)}>
          {Object.entries(BUILT_IN_BONDS).map(([id, bond]) => <option value={`builtin:${id}`} key={id}>{bond.label}</option>)}
          {wallPatternAssets.map((asset) => <option value={`library:${asset.id}`} key={asset.id}>Library Â· {asset.asset_type === 'girih_pattern' ? 'Girih' : 'Brick'} Â· {asset.name}</option>)}
        </select></label>
        {walls.bricks.sideBonds[side].source === 'library' && (
          <>
            <NumberField label="This imported pattern scale" value={walls.bricks.sideBonds[side].scale} min={0.1} max={8} step={0.1} onChange={(scale) => setWallBondScale(side, scale)} />
            <div className="field-grid">
              <NumberField label="Move pattern horizontal Â· m" value={walls.bricks.sideBonds[side].offsetU || 0} min={-100} max={100} step={0.01} onChange={(offsetU) => setWallBondOffset(side, { offsetU })} />
              <NumberField label="Move pattern vertical Â· m" value={walls.bricks.sideBonds[side].offsetV || 0} min={-100} max={100} step={0.01} onChange={(offsetV) => setWallBondOffset(side, { offsetV })} />
            </div>
            <div className="bond-align-actions">
              <button type="button" onClick={(event) => { event.stopPropagation(); alignWallBond(side, 'horizontal'); }}>Center horizontal</button>
              <button type="button" onClick={(event) => { event.stopPropagation(); alignWallBond(side, 'vertical'); }}>Center vertical</button>
              <button type="button" onClick={(event) => { event.stopPropagation(); alignWallBond(side, 'both'); }}>Center both</button>
              <button type="button" onClick={(event) => { event.stopPropagation(); setWallBondOffset(side, { offsetU: 0, offsetV: 0 }); }}>Reset</button>
            </div>
          </>
        )}
      </div>
    );
  }

  function renderRoomPlanWallControls() {
    const hallMode = ['hall', 'grid'].includes(building.buildingType);
    if (building.type !== 'room' || (!hallMode && (building.roomPlanShape || 'square') === 'square')) return null;
    const hallOpeningSide = (rotation) => {
      const angle = ((Number(rotation) % 360) + 360) % 360;
      return [
        ['north', 0], ['east', 90], ['south', 180], ['west', 270],
      ].reduce((nearest, [side, center]) => {
        const raw = Math.abs(angle - center);
        const distance = Math.min(raw, 360 - raw);
        return !nearest || distance < nearest.distance ? { side, distance } : nearest;
      }, null).side;
    };
    return <>
      {!hallMode && <fieldset className="room-wall-surfaces"><legend>Room wall surfaces</legend>
        {renderWallBondControls('room_plan_exterior', { label: 'All exterior wall surfaces bond' })}
        {renderWallBondControls('room_plan_interior', { label: 'All interior wall surfaces bond' })}
      </fieldset>}
      {hallMode && <fieldset className="room-plan-openings"><legend>Open Hall sides beneath vaults</legend>
        <div className="compact-check-grid hall-open-sides-grid">
          {['north', 'south', 'east', 'west'].map((side) => <label className="check-field" key={side}><input type="checkbox" checked={walls.openSides.includes(side)} onChange={() => toggleWallSide(side)} /><span>Open {side} wall</span></label>)}
        </div>
      </fieldset>}
      <fieldset className="room-plan-openings"><legend>{hallMode ? 'Hall doors and windows' : 'Doors and windows'}</legend>
        <div className="placement-actions">
          <button type="button" className="primary" onClick={() => addRoomPlanOpening('door')}><Plus size={14} /> Add door</button>
          <button type="button" onClick={() => addRoomPlanOpening('window')}><Plus size={14} /> Add window</button>
        </div>
        {(walls.roomPlanOpenings || []).map((opening, index) => {
          const sideCount = hallMode ? 4 : building.roomPlanShape === 'circle' ? 64 : building.roomPlanShape === 'octagon' ? 8 : building.roomPolygonSides;
          const wallPosition = ((sideCount / 2 - 0.5) + (((opening.rotation || 0) % 360) + 360) % 360 / 360 * sideCount) % sideCount;
          const wallNumber = Math.floor(wallPosition) + 1;
          const hallSide = hallMode ? hallOpeningSide(opening.rotation) : null;
          const openingSpringHeight = opening.sillHeight + opening.height;
          const updateOpeningArch = (patch) => updateRoomPlanOpening(opening.id, { arch: { ...opening.arch, ...patch } });
          return <fieldset
            className={`room-plan-opening-card ${selectedRoomPlanOpeningGuideId === opening.id ? 'active' : ''}`}
            key={opening.id}
          ><legend>{opening.type === 'window' ? 'Window' : 'Door'} {index + 1} · {hallMode ? `${hallSide} wall` : `wall ${wallNumber}`}</legend>
            <div className="field-grid">
              <NumberField label={hallMode ? 'Center position around Hall · °' : 'Center position around room · °'} value={opening.rotation} min={0} max={359.9} step={1} onChange={(rotation) => updateRoomPlanOpening(opening.id, { rotation })} />
              <label><span>Opening head</span><select value={opening.head || 'lintel'} onChange={(event) => updateRoomPlanOpening(opening.id, { head: event.target.value })}><option value="lintel">Horizontal lintel</option><option value="arch">Arch</option></select></label>
              <NumberField label="Width · m" value={opening.width} min={0.3} max={12} step={0.1} onChange={(width) => updateRoomPlanOpening(opening.id, { width })} />
              <NumberField label={opening.head === 'arch' ? 'Spring height · m' : 'Height · m'} value={opening.height} min={0.3} max={15} step={0.1} onChange={(height) => updateRoomPlanOpening(opening.id, { height })} />
              <NumberField label="Sill height · m" value={opening.sillHeight} min={0} max={18} step={0.05} onChange={(sillHeight) => updateRoomPlanOpening(opening.id, { sillHeight })} />
            </div>
            {opening.head === 'arch' && <div
              className="field-grid"
              data-opening-arch-guide-inputs
              onPointerDown={() => activateRoomPlanOpeningGuide(opening)}
              onFocusCapture={() => activateRoomPlanOpeningGuide(opening)}
              onBlurCapture={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) setSelectedOpeningGuide(null);
              }}
            >
              <ArchTypeToggle value={opening.arch?.archType} onChange={(archType) => updateOpeningArch({ archType })} onDesign={() => openArchDesigner(`${opening.type === 'window' ? 'Window' : 'Door'} ${index + 1} · ${hallMode ? `${hallSide} wall` : `wall ${wallNumber}`}`, opening.width, opening.arch, updateOpeningArch, { springHeight: openingSpringHeight })} />
            </div>}
            <div className="placement-actions">
              <button type="button" title="Rotate opening 5 degrees counterclockwise" onClick={() => updateRoomPlanOpening(opening.id, { rotation: opening.rotation - 5 })}><RotateCw size={14} style={{ transform: 'scaleX(-1)' }} /> 5°</button>
              <button type="button" title="Rotate opening 5 degrees clockwise" onClick={() => updateRoomPlanOpening(opening.id, { rotation: opening.rotation + 5 })}><RotateCw size={14} /> 5°</button>
              <button type="button" className="danger" title="Delete opening" onClick={() => deleteRoomPlanOpening(opening.id)}><Trash2 size={14} /> Delete</button>
            </div>
          </fieldset>;
        })}
      </fieldset>
    </>;
  }

  function renderWallVisibilityAndMaterial() {
    return (
      <CollapsiblePanel panelRef={wallSettingsRef} collapsible={false} className="wall-material-panel" title="Wall visibility and material">
        <div className="compact-check-grid">
          <label className="check-field"><input type="checkbox" checked={walls.shadows} onChange={(event) => updateWalls({ shadows: event.target.checked })} /><span>Wall and arch shadows</span></label>
        </div>
        <div className="field-grid compact-field-grid">
          <label><span>Wall color</span><input type="color" value={walls.color} onChange={(event) => updateWalls({ color: event.target.value })} /></label>
          <NumberField label={building.type === 'room' ? 'All wall thicknesses · m' : 'Wall thickness · m'} value={building.wallThickness} min={0.1} max={1.5} step={0.05} onChange={updateGlobalWallThickness} />
        </div>
        <div className="compact-material-group">
          <div className="compact-material-heading">
            <label className="check-field"><input type="checkbox" checked={walls.interiorGypsum.enabled} onChange={(event) => updateWallGroup('interiorGypsum', { enabled: event.target.checked })} /><span>Interior gypsum</span></label>
            <label><span>Color</span><input type="color" value={walls.interiorGypsum.color} onChange={(event) => updateWallGroup('interiorGypsum', { color: event.target.value })} /></label>
          </div>
        </div>
        <div className="compact-material-group">
          <div className="compact-material-heading">
            <label className="check-field"><input type="checkbox" checked={walls.bricks.enabled} onChange={(event) => updateWallGroup('bricks', { enabled: event.target.checked })} /><span>Brick pattern</span></label>
            <label><span>Mortar color</span><input type="color" value={walls.bricks.mortarColor} onChange={(event) => updateWallGroup('bricks', { mortarColor: event.target.value })} /></label>
          </div>
          <div className="field-grid compact-field-grid">
            <NumberField label="Brick width · m" value={walls.bricks.brickWidth} min={0.05} max={1} step={0.005} onChange={(brickWidth) => updateWallGroup('bricks', { brickWidth })} />
            <NumberField label="Brick height · m" value={walls.bricks.brickHeight} min={0.02} max={0.5} step={0.005} onChange={(brickHeight) => updateWallGroup('bricks', { brickHeight })} />
            <NumberField label="Joint width · m" value={walls.bricks.mortar} min={0.001} max={0.05} step={0.001} onChange={(mortar) => updateWallGroup('bricks', { mortar })} />
            <NumberField label="Imported scale" value={walls.bricks.importedScale} min={0.1} max={8} step={0.1} onChange={(importedScale) => updateWallGroup('bricks', { importedScale })} />
          </div>
        </div>
      </CollapsiblePanel>
    );
  }

  function renderStoneSkirtControls() {
    const planShape = walls.stoneBase.planShape || 'follow';
    const squareRoomSkirt = building.buildingType === 'room'
      && (building.roomPlanShape || 'square') === 'square';
    return (
      <CollapsiblePanel collapsible={false} className="stone-skirt-panel" title="Stone skirt">
        <div className="compact-material-heading">
          <label className="check-field"><input type="checkbox" checked={walls.stoneBase.enabled} onChange={(event) => updateWallGroup('stoneBase', { enabled: event.target.checked })} /><span>Show lower building skirt</span></label>
        </div>
        {building.buildingType === 'room' && !squareRoomSkirt && <div className="room-cover-mode-group">
          <span>Lower building plan</span>
          <div className="room-cover-toggle floor-plan-toggle" role="group" aria-label="Stone skirt plan">
            {[
              ['follow', 'Follow building'],
              ['circle', 'Circle'],
              ['octagon', 'Octagon'],
              ['polygon', 'Custom'],
            ].map(([shape, label]) => <button
              type="button"
              key={shape}
              className={`floor-plan-icon-button lower-building-plan-button${planShape === shape ? ' active' : ''}`}
              aria-pressed={planShape === shape}
              onClick={() => updateWallGroup('stoneBase', { planShape: shape })}
            ><LowerBuildingPlanIcon shape={shape} buildingShape={building.roomPlanShape || 'square'} polygonSides={walls.stoneBase.polygonSides} /><span>{label}</span></button>)}
          </div>
        </div>}
        <div className="field-grid compact-field-grid">
          {building.buildingType === 'room' && !squareRoomSkirt && planShape === 'polygon' && <NumberField label="Custom plan sides" value={walls.stoneBase.polygonSides ?? 6} min={3} max={32} step={1} onChange={(polygonSides) => updateWallGroup('stoneBase', { polygonSides })} />}
          <NumberField label="Skirt height · m" value={walls.stoneBase.height} min={0} max={10} step={0.05} onChange={(height) => updateWallGroup('stoneBase', { height })} />
          <NumberField label="Slab width · m" value={walls.stoneBase.slabWidth} min={0.1} max={5} step={0.05} onChange={(slabWidth) => updateWallGroup('stoneBase', { slabWidth })} />
          <div className="stone-skirt-color-row">
            <label><span>Stone color</span><input type="color" value={walls.stoneBase.color} onChange={(event) => updateWallGroup('stoneBase', { color: event.target.value })} /></label>
            <label><span>Mortar color</span><input type="color" value={walls.stoneBase.mortarColor} onChange={(event) => updateWallGroup('stoneBase', { mortarColor: event.target.value })} /></label>
          </div>
        </div>
      </CollapsiblePanel>
    );
  }

  function renderHallWallBondControls() {
    if (!['hall', 'grid'].includes(building.buildingType)) return null;
    return (
      <CollapsiblePanel
        collapsible={false}
        title="Hall wall bonding and patterns"
        guide="These two patterns apply continuously around every Hall perimeter wall."
      >
        {renderWallBondControls('room_plan_exterior', {
          wallSide: 'room_plan_exterior',
          label: 'Exterior wall bond and pattern',
        })}
        {renderWallBondControls('room_plan_interior', {
          wallSide: 'room_plan_interior',
          label: 'Interior wall bond and pattern',
        })}
      </CollapsiblePanel>
    );
  }

  function updateNightLightVector(field, index, nextValue) {
    if (!selectedNightLight) return;
    const vector = [...selectedNightLight[field]];
    vector[index] = nextValue;
    sceneRef.current?.updateNightLight(selectedNightLight.id, { [field]: vector });
  }

  if (!authReady) return <main className="app-auth-gate girih-theme-mehraz"><span className="auth-spinner" /><p>Checking your Girih Studio account...</p></main>;
  if (!user) return <main className="app-auth-gate girih-theme-mehraz"><img src="https://girihstudio.com/landing/brand/girih-logo-color.png" alt="" /><girih-app-icon app="mehraz"></girih-app-icon><small>Mehraz App</small><h1>Sign in to continue</h1><p>Use one Girih Studio account across every design app. Mehraz is currently free.</p><button className="primary" onClick={connectAccount}><LogIn size={16} /> Sign in</button></main>;

  const stepKarbandiSolution = (direction) => {
    const seatingBuilding = ['hall', 'grid'].includes(building.buildingType)
      ? {
        ...building,
        type: 'room',
        roomPlanShape: 'square',
        width: building.hallBayWidth,
        depth: building.hallBayDepth,
        length: building.hallBayDepth,
      }
      : building;
    const oneLegCornerSolution = walls.karbandi?.wallLegMode === 'one'
      && building.buildingType !== 'vestibule'
      && seatingBuilding.type === 'room'
      && (seatingBuilding.roomPlanShape || 'square') === 'square';
    if (oneLegCornerSolution) {
      setWalls((value) => normalizeWallSystem({
        ...value,
        karbandi: {
          ...value.karbandi,
          ...solveKarbandiOneLegCornerSeating(value.karbandi, seatingBuilding, value, {
            stepDirection: direction,
          }),
          wallLegMode: 'one',
        },
      }, building));
      return;
    }
    const solutionDepth = ['hall', 'grid'].includes(building.buildingType)
      ? Math.max(0.2, Number(building.hallBayDepth) || 4)
      : karbandiReferenceDepth;
    const solutions = karbandiReferenceZSolutions(walls.karbandi, solutionDepth);
    if (!solutions.length) return;
    const current = Number(walls.karbandi?.referenceZ) || 0;
    const next = direction > 0
      ? solutions.find((solution) => solution > current + 0.0000005) ?? solutions[0]
      : [...solutions].reverse().find((solution) => solution < current - 0.0000005) ?? solutions.at(-1);
    updateKarbandiDesign({ referenceZ: next });
  };

  const setHallInputGuide = (guide = null) => {
    setActiveHallInputGuide((current) => (current === guide ? current : guide));
  };

  function openArchDesigner(title, span, settings, onChange, options = {}) {
    setArchDesigner({
      title,
      span: Math.max(0.2, Number(span) || 4),
      settings: {
        archType: settings?.archType === 'one-point' ? 'one-point' : 'two-point',
        redOffset: Number(settings?.redOffset) || 0,
        redRadius: settings?.redRadius ?? null,
        greenOffset: Math.max(0.05, Number(settings?.greenOffset) || 0.05),
        greenHeightBelowLeg: greenPointHeightBelowLeg(settings, options.springHeight),
        ...(Number.isFinite(Number(settings?.springHeightOffset)) ? { springHeightOffset: Number(settings.springHeightOffset) } : {}),
        ...(settings?.greenOffsetAuto != null || settings?.greenHeightAuto != null ? { autoContinue: settings.greenOffsetAuto !== false && settings.greenHeightAuto !== false } : {}),
      },
      onChange,
      springHeight: options.springHeight,
      disabled: options.disabled === true,
      spanEditable: options.spanEditable === true,
    });
  }

  function updateArchDesigner(patch) {
    if (!archDesigner || archDesigner.disabled) return;
    const nextSettings = { ...archDesigner.settings, ...patch };
    const nextSpan = Object.prototype.hasOwnProperty.call(patch, 'span')
      ? Math.max(0.2, Number(patch.span) || 0.2)
      : archDesigner.span;
    const appliedPatch = { ...patch };
    if (Object.prototype.hasOwnProperty.call(patch, 'greenHeightBelowLeg')) {
      delete appliedPatch.greenHeightBelowLeg;
      appliedPatch.greenHeightOffset = -patch.greenHeightBelowLeg;
      if (Number.isFinite(Number(archDesigner.springHeight))) {
        appliedPatch.greenHeight = Number(archDesigner.springHeight) - patch.greenHeightBelowLeg;
      }
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'autoContinue')) {
      delete appliedPatch.autoContinue;
      appliedPatch.greenOffsetAuto = patch.autoContinue;
      appliedPatch.greenHeightAuto = patch.autoContinue;
    } else if (Object.prototype.hasOwnProperty.call(archDesigner.settings, 'autoContinue')
      && ['redOffset', 'greenOffset', 'greenHeightBelowLeg'].some((key) => Object.prototype.hasOwnProperty.call(patch, key))) {
      nextSettings.autoContinue = false;
      appliedPatch.greenOffsetAuto = false;
      appliedPatch.greenHeightAuto = false;
    }
    archDesigner.onChange(appliedPatch);
    setArchDesigner({ ...archDesigner, span: nextSpan, settings: nextSettings });
  }

  function saveCurrentArchAsset(name) {
    if (!archDesigner) return;
    const roundedSettings = Object.fromEntries(Object.entries(archDesigner.settings).map(([key, value]) => (
      typeof value === 'number' ? [key, twoDecimalNumber(value)] : [key, value]
    )));
    const asset = {
      id: globalThis.crypto?.randomUUID?.() || `arch-${Date.now()}`,
      name,
      span: twoDecimalNumber(archDesigner.span),
      settings: roundedSettings,
      createdAt: new Date().toISOString(),
    };
    setArchAssets((current) => {
      const next = [asset, ...current];
      persistArchAssets(next);
      return next;
    });
  }

  function applyArchAsset(asset) {
    if (!archDesigner || !asset?.settings || !(Number(asset.span) > 0)) return;
    const targetSpan = archDesigner.span;
    const scale = targetSpan / Number(asset.span);
    const patch = {
      archType: asset.settings.archType,
      redOffset: twoDecimalNumber((Number(asset.settings.redOffset) || 0) * scale),
      greenOffset: Math.max(0.05, twoDecimalNumber((Number(asset.settings.greenOffset) || 0.05) * scale)),
      greenHeightBelowLeg: Math.max(0, twoDecimalNumber((Number(asset.settings.greenHeightBelowLeg) || 0) * scale)),
      redRadius: asset.settings.redRadius == null ? null : Math.max(0.01, twoDecimalNumber(Number(asset.settings.redRadius) * scale)),
      ...(Object.prototype.hasOwnProperty.call(archDesigner.settings, 'springHeightOffset') && Number.isFinite(Number(asset.settings.springHeightOffset)) ? { springHeightOffset: twoDecimalNumber(Number(asset.settings.springHeightOffset) * scale) } : {}),
      ...(Object.prototype.hasOwnProperty.call(archDesigner.settings, 'autoContinue') && Object.prototype.hasOwnProperty.call(asset.settings, 'autoContinue') ? { autoContinue: asset.settings.autoContinue === true } : {}),
    };
    updateArchDesigner(patch);
  }

  function deleteArchAsset(id) {
    setArchAssets((current) => {
      const next = current.filter((asset) => asset.id !== id);
      persistArchAssets(next);
      return next;
    });
  }

  return (
    <div
      className="mehraz-app girih-theme-mehraz"
      onPointerDownCapture={(event) => {
        setWelcomeDismissed(true);
        if ((activeGridElements.length || activeGridBayKeys.length)
          && !event.target.closest?.('.viewport, .grid-stage-guide, .grid-selected-element-controls, .grid-selected-bay-controls')) {
          setSelectedGridElement(null);
          setSelectedGridElements([]);
          setSelectedGridBay(null);
          setSelectedGridBays([]);
        }
        const karbandiInput = event.target.closest?.('[data-karbandi-settings] input, [data-karbandi-settings] select, [data-karbandi-settings] textarea, [data-karbandi-settings] [data-karbandi-input-control]');
        sceneRef.current?.setKarbandiReferenceEditing(Boolean(karbandiInput));
        const ribArchInput = isKarbandiRibArchEditorTarget(event.target);
        sceneRef.current?.setKarbandiRibArchEditing(Boolean(ribArchInput));
        sceneRef.current?.setSquinchArchEditing(Boolean(event.target.closest?.('[data-squinch-arch]')));
        sceneRef.current?.setNorthArchEditing(Boolean(event.target.closest?.('[data-north-arch-guide-inputs]')));
        sceneRef.current?.setRoomDomeArchEditing(Boolean(event.target.closest?.('[data-room-dome-arch-guide-inputs]')));
        if (!event.target.closest?.('[data-opening-arch-guide-inputs]')) setSelectedOpeningGuide(null);
        const hallGuideInputs = event.target.closest?.('[data-hall-arch-guide-inputs]');
        setHallInputGuide(hallGuideInputs?.dataset.hallArchGuideInputs || null);
      }}
      onKeyDownCapture={() => setWelcomeDismissed(true)}
    >
      <header className="app-header girih-product-header">
        <div className="brand-group girih-header-start">
          <a href="https://girihstudio.com" className="home-link"><img src="https://girihstudio.com/landing/brand/girih-logo-color.png" alt="" /><span>Girih Studio</span></a>
          <i />
          <span className="product-name girih-product-identity"><girih-app-icon app="mehraz"></girih-app-icon><strong>Mehraz App</strong><small>Architectural composition</small></span>
        </div>
        <div className="header-actions girih-header-tools">
          <button onClick={newProject}><Plus size={15} /> New</button>
          <button title="Undo Â· Ctrl+Z" disabled={!canUndo} onClick={undo}><Undo2 size={15} /> Undo</button>
          <button title="Redo Â· Ctrl+Y" disabled={!canRedo} onClick={redo}><Redo2 size={15} /> Redo</button>
          <button onClick={() => importRef.current?.click()}><Upload size={15} /> Import</button>
          <button onClick={openExport}><Download size={15} /> Export</button>
          <button className="primary" disabled={libraryBusy} onClick={saveProjectToLibrary}><Save size={15} /> {libraryBusy ? 'Saving...' : 'Save project'}</button>
        </div>
        <div className="header-actions girih-header-end">
          <a className="account-button girih-training-button" href="https://girihstudio.com/training?app=mehraz"><GraduationCap size={15} /> Training</a>
          <button onClick={() => { setLibraryPanelOpen(true); refreshLibrary(); }}><FolderOpen size={15} /> Library</button>
          {user ? <a className="account-button" href="https://girihstudio.com/profile" title={user.email}><User size={15} /> Profile</a> : <button onClick={connectAccount}><LogIn size={15} /> Sign in</button>}
          <girih-app-switcher current-app="mehraz" compact></girih-app-switcher>
        </div>
        <input ref={importRef} hidden type="file" accept=".json,.mehraz.json,application/json" onChange={importProject} />
      </header>

      {libraryPanelOpen && (
        <div className="library-dialog-backdrop" role="presentation" onPointerDown={() => setLibraryPanelOpen(false)}>
        <aside className="library-panel library-dialog" role="dialog" aria-modal="true" aria-labelledby="mehraz-library-title" onPointerDown={(event) => event.stopPropagation()}>
          <div className="panel-heading">
            <div><small>Shared assets</small><h1 id="mehraz-library-title" className="guided-heading">Your library <HelpTooltip label="Library patterns">To place a Girih or brick pattern, create or select a wall zone in the Walls tab, then assign the saved library item from that zone’s pattern selector.</HelpTooltip></h1></div>
            <div className="library-heading-actions">
              <button title="Refresh library" disabled={!user || libraryBusy} onClick={refreshLibrary}><RefreshCw size={15} /></button>
              <button title="Close library" onClick={() => setLibraryPanelOpen(false)}><X size={15} /></button>
            </div>
          </div>
          {!authReady ? <p className="empty-state">Checking your accountâ€¦</p> : !user ? (
            <div className="connect-card"><LogIn size={22} /><strong>Connect Girih Studio</strong><p>Sign in once to use the same account and library in every Girih Studio app.</p><button className="primary" onClick={connectAccount}>Sign in</button></div>
          ) : (
            <div className="library-two-column">
              <section className="library-list-column">
                <div className="asset-groups">
                {groupedLibrary.map((group) => {
                  const collapsed = collapsedLibraryGroups[group.app] === true;
                  const groupPanelId = `library-group-${group.app}`;
                  return (
                    <section className={`asset-group app-${group.app}`} key={group.app}>
                      <button
                        type="button"
                        className="asset-group-toggle"
                        aria-expanded={!collapsed}
                        aria-controls={groupPanelId}
                        onClick={() => setCollapsedLibraryGroups((current) => ({ ...current, [group.app]: !collapsed }))}
                      >
                        <girih-app-icon app={group.app} small=""></girih-app-icon>
                        <span className="asset-group-name"><strong>{group.name}</strong><small>{group.assets.length} {group.assets.length === 1 ? 'item' : 'items'}</small></span>
                        <span className="asset-group-mark" aria-hidden="true">{collapsed ? <Plus size={14} /> : <Minus size={14} />}</span>
                      </button>
                      {!collapsed && (
                        <div className="asset-group-items" id={groupPanelId}>
                          {group.assets.map((asset) => {
                            const Icon = ASSET_ICONS[asset.asset_type] || Boxes;
                            return (
                              <button className={selectedAssetId === asset.id ? 'active' : ''} key={asset.id} onClick={() => setSelectedAssetId(asset.id)}>
                                <span className={`asset-icon type-${asset.asset_type}`}><Icon size={18} /></span>
                                <span><strong>{asset.name}</strong><small>{ASSET_LABELS[asset.asset_type]} · v{asset.currentVersion?.version_number || '—'}</small></span>
                              </button>
                            );
                          })}
                          {!libraryBusy && !group.assets.length && <p className="asset-group-empty">{group.emptyMessage}</p>}
                        </div>
                      )}
                    </section>
                  );
                })}
                {libraryHasMore && <button type="button" disabled={libraryLoadingMore} onClick={() => refreshLibrary({ append: true, silent: true })}>{libraryLoadingMore ? 'Loading…' : 'Load more library items'}</button>}
                </div>
              </section>
              {selectedAsset && (
                  <section className="library-manager-card">
                    <div className="library-manager-preview">
                      <LibraryAssetPreview asset={selectedAsset} version={selectedLibraryVersion} />
                      <strong>{selectedAsset.name}</strong>
                      <small>{ASSET_LABELS[selectedAsset.asset_type]} · current v{selectedAsset.currentVersion?.version_number || '—'}</small>
                    </div>
                  {selectedAsset.id.startsWith('legacy-') ? (
                    <p className="empty-state">This is a legacy Bricks item. Open Bricks and save it to the shared library before rename/delete/version management is available.</p>
                  ) : (
                    <>
                      <label><span>Name</span><input value={libraryEdit.name} maxLength={120} onChange={(event) => setLibraryEdit({ ...libraryEdit, name: event.target.value })} /></label>
                      <label><span>Description</span><input value={libraryEdit.description} maxLength={2000} onChange={(event) => setLibraryEdit({ ...libraryEdit, description: event.target.value })} /></label>
                      <div className="library-manager-actions">
                        <button disabled={libraryBusy || !SOURCE_APP_EDIT_LINKS[selectedAsset.asset_type]} onClick={editSelectedAssetInSourceApp}>Edit in app</button>
                        <button className="primary" disabled={libraryBusy} onClick={renameSelectedLibraryAsset}>Rename</button>
                        <button className="danger" disabled={libraryBusy} onClick={archiveSelectedLibraryAsset}><Trash2 size={13} /> Archive</button>
                      </div>
                    </>
                  )}
                  <div className="library-version-list">
                    <strong>Versions</strong>
                    {libraryVersions.map((version) => {
                      const current = version.id === selectedAsset.current_version_id;
                      return (
                        <button type="button" key={version.id} className={version.id === selectedLibraryVersion?.id ? 'active' : ''} onClick={() => setSelectedLibraryVersionId(version.id)}>
                          <span>Version {version.version_number}{current ? ' · current' : ''}</span>
                          {!current && !selectedAsset.id.startsWith('legacy-') && <em onClick={(event) => { event.stopPropagation(); makeSelectedVersionCurrent(version); }}>Make current</em>}
                        </button>
                      );
                    })}
                    {!libraryVersions.length && <p className="empty-state">No saved versions found.</p>}
                  </div>
                </section>
              )}
              {!selectedAsset && <section className="library-manager-card library-empty-detail"><FolderOpen size={28} /><span>Select an asset to preview and manage it.</span></section>}
            </div>
          )}
          {libraryMessage && <p className="library-message">{libraryMessage}</p>}
        </aside>
        </div>
      )}
      {assetContextMenu && linkedContextAsset && SOURCE_APP_EDIT_LINKS[linkedContextAsset.assetType] && (
        <div
          className="asset-context-menu"
          role="menu"
          style={{ left: Math.min(assetContextMenu.x, window.innerWidth - 238), top: Math.min(assetContextMenu.y, window.innerHeight - 112) }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <small>{linkedContextAsset.name || ASSET_LABELS[linkedContextAsset.assetType]}</small>
          <button type="button" role="menuitem" onClick={() => { editAssetInSourceApp(linkedContextAsset); setAssetContextMenu(null); }}>
            <ExternalLink size={15} /> Edit in {SOURCE_APP_NAMES[linkedContextAsset.assetType] || 'source app'}
          </button>
        </div>
      )}

      <main className="workspace no-library">
        <section className="stage">
          <div ref={viewportRef} className="viewport" />
          <ArchDesignerDialog
            designer={archDesigner}
            assets={[...archAssets].sort((a, b) => Math.abs(a.span - (archDesigner?.span || 0)) - Math.abs(b.span - (archDesigner?.span || 0)))}
            onClose={() => setArchDesigner(null)}
            onUpdate={updateArchDesigner}
            onSaveAsset={saveCurrentArchAsset}
            onApplyAsset={applyArchAsset}
            onDeleteAsset={deleteArchAsset}
          />
          {building.buildingType === 'grid' && gridFloorPlanVisible && <aside className="grid-stage-guide" aria-label="Grid top view bay selector" onPointerDown={(event) => event.stopPropagation()}>
            <header><div><strong>Grid floor plan</strong><small>Click cells to toggle a multi-selection</small></div><span>North ↑</span></header>
            <div className="grid-guide-modes" role="tablist" aria-label="Grid guide selection mode">
              <button type="button" className={gridGuideMode === 'bays' ? 'active' : ''} onClick={() => { setGridGuideMode('bays'); setSelectedGridElement(null); setSelectedGridElements([]); setSelectedGridBay(null); setSelectedGridBays([]); }}>Bays</button>
              <button type="button" className={gridGuideMode === 'elements' ? 'active' : ''} onClick={() => { setGridGuideMode('elements'); setSelectedGridElement(null); setSelectedGridElements([]); setSelectedGridBay(null); setSelectedGridBays([]); }}>Elements</button>
            </div>
            {gridGuideMode === 'bays' ?
            <svg viewBox={`0 0 ${building.width} ${building.depth}`} role="group" aria-label="Grid bays" preserveAspectRatio="xMidYMid meet">
              {building.gridBaySpansY.map((bayDepth, iy) => {
                const y = building.gridBaySpansY.slice(0, iy).reduce((sum, span) => sum + span, 0);
                return building.gridBaySpansX.map((bayWidth, ix) => {
                  const x = building.gridBaySpansX.slice(0, ix).reduce((sum, span) => sum + span, 0);
                  const bayKey = `${ix}:${iy}`;
                  const cover = building.gridBayCovers?.[bayKey] || building.hallCoverType || 'dome';
                  const removed = building.gridRemovedBays.includes(bayKey);
                  const selected = activeGridBayKeys.includes(bayKey);
                  const selectBay = () => {
                    setSelectedGridBay([ix, iy]);
                    setSelectedGridBays((current) => {
                      if (current.includes(bayKey)) return current.filter((key) => key !== bayKey);
                      return [...current, bayKey];
                    });
                    setSelectedGridElement(null);
                    setSelectedGridElements([]);
                    setRightTab('building');
                  };
                  return <g key={`stage-grid-bay-${bayKey}`} className={selected ? 'selected' : ''} data-cover={cover} data-removed={removed ? 'true' : 'false'} role="button" tabIndex="0" aria-pressed={selected} aria-label={`${selected ? 'Deselect' : 'Select'} floor cell X${ix + 1}, Y${iy + 1}`} onClick={selectBay} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectBay(); } }}>
                    <rect x={x} y={y} width={bayWidth} height={bayDepth} rx={Math.min(bayWidth, bayDepth) * 0.04} />
                    <text x={x + bayWidth / 2} y={y + bayDepth / 2} dominantBaseline="middle" textAnchor="middle">X{ix + 1} · Y{iy + 1}</text>
                    <text className="cover-label" x={x + bayWidth / 2} y={y + bayDepth / 2} dy="1.15em" dominantBaseline="middle" textAnchor="middle">{removed ? 'empty floor' : cover === 'none' ? 'open bay' : cover.replaceAll('-', ' ')}</text>
                  </g>;
                });
              })}
            </svg> : <svg className="grid-element-map" viewBox={`${-building.width * 0.04} ${-building.depth * 0.04} ${building.width * 1.08} ${building.depth * 1.08}`} role="group" aria-label="Grid elements" preserveAspectRatio="xMidYMid meet">
              {building.gridBaySpansY.flatMap((bayDepth, iy) => building.gridBaySpansX.flatMap((bayWidth, ix) => {
                const x = building.gridBaySpansX.slice(0, ix).reduce((sum, span) => sum + span, 0);
                const y = building.gridBaySpansY.slice(0, iy).reduce((sum, span) => sum + span, 0);
                const bay = [ix, iy];
                const cover = building.gridBayCovers?.[`${ix}:${iy}`] || building.hallCoverType || 'dome';
                const coverType = cover === 'dome' ? 'dome' : 'vault';
                const coverId = `${cover === 'dome' ? 'dome' : 'cover'}:${ix}:${iy}`;
                const transitionId = `transition:${ix}:${iy}`;
                const coverRemoved = (coverType === 'dome' ? building.gridRemovedDomes : building.gridRemovedVaults).includes(coverId) || building.gridRemovedBays.includes(`${ix}:${iy}`);
                const transitionRemoved = building.gridRemovedTransitions.includes(transitionId) || building.gridRemovedBays.includes(`${ix}:${iy}`);
                const selectedIds = new Set(activeGridElements.map((item) => item.id));
                const radius = Math.min(bayWidth, bayDepth) * 0.2;
                return [
                  <g key={transitionId} className={`grid-map-transition ${selectedIds.has(transitionId) ? 'selected' : ''}`} data-removed={transitionRemoved ? 'true' : 'false'} role="button" tabIndex="0" onClick={(event) => selectGridGuideElement({ id: transitionId, type: 'transition', bay }, event.ctrlKey || event.metaKey)}>
                    <rect x={x + bayWidth / 2 - radius * 1.45} y={y + bayDepth / 2 - radius * 1.45} width={radius * 2.9} height={radius * 2.9} transform={`rotate(45 ${x + bayWidth / 2} ${y + bayDepth / 2})`} />
                  </g>,
                  <g key={coverId} className={`grid-map-cover ${selectedIds.has(coverId) ? 'selected' : ''}`} data-removed={coverRemoved ? 'true' : 'false'} role="button" tabIndex="0" onClick={(event) => selectGridGuideElement({ id: coverId, type: coverType, bay }, event.ctrlKey || event.metaKey)}>
                    <circle cx={x + bayWidth / 2} cy={y + bayDepth / 2} r={radius} />
                    <text x={x + bayWidth / 2} y={y + bayDepth / 2} dominantBaseline="middle" textAnchor="middle">{cover === 'dome' ? 'D' : cover === 'none' ? '—' : 'V'}</text>
                  </g>,
                ];
              }))}
              {Array.from({ length: building.hallGridY + 1 }, (_, iy) => building.gridBaySpansX.map((span, ix) => {
                const x = building.gridBaySpansX.slice(0, ix).reduce((sum, value) => sum + value, 0);
                const y = building.gridBaySpansY.slice(0, iy).reduce((sum, value) => sum + value, 0);
                const id = `vault:x:${ix}:${iy}`;
                return <line key={id} className={`grid-map-vault ${activeGridElements.some((item) => item.id === id) ? 'selected' : ''}`} data-removed={building.gridRemovedVaults.includes(id) ? 'true' : 'false'} x1={x} y1={y} x2={x + span} y2={y} role="button" tabIndex="0" onClick={(event) => selectGridGuideElement({ id, type: 'vault' }, event.ctrlKey || event.metaKey)} />;
              }))}
              {Array.from({ length: building.hallGridX + 1 }, (_, ix) => building.gridBaySpansY.map((span, iy) => {
                const x = building.gridBaySpansX.slice(0, ix).reduce((sum, value) => sum + value, 0);
                const y = building.gridBaySpansY.slice(0, iy).reduce((sum, value) => sum + value, 0);
                const id = `vault:y:${ix}:${iy}`;
                return <line key={id} className={`grid-map-vault ${activeGridElements.some((item) => item.id === id) ? 'selected' : ''}`} data-removed={building.gridRemovedVaults.includes(id) ? 'true' : 'false'} x1={x} y1={y} x2={x} y2={y + span} role="button" tabIndex="0" onClick={(event) => selectGridGuideElement({ id, type: 'vault' }, event.ctrlKey || event.metaKey)} />;
              }))}
              {[
                ...building.gridBaySpansX.map((span, ix) => ({ id: `wall:north:${ix}`, x1: building.gridBaySpansX.slice(0, ix).reduce((sum, value) => sum + value, 0), y1: 0, x2: building.gridBaySpansX.slice(0, ix + 1).reduce((sum, value) => sum + value, 0), y2: 0 })),
                ...building.gridBaySpansX.map((span, ix) => ({ id: `wall:south:${ix}`, x1: building.gridBaySpansX.slice(0, ix).reduce((sum, value) => sum + value, 0), y1: building.depth, x2: building.gridBaySpansX.slice(0, ix + 1).reduce((sum, value) => sum + value, 0), y2: building.depth })),
                ...building.gridBaySpansY.map((span, iy) => ({ id: `wall:west:${iy}`, x1: 0, y1: building.gridBaySpansY.slice(0, iy).reduce((sum, value) => sum + value, 0), x2: 0, y2: building.gridBaySpansY.slice(0, iy + 1).reduce((sum, value) => sum + value, 0) })),
                ...building.gridBaySpansY.map((span, iy) => ({ id: `wall:east:${iy}`, x1: building.width, y1: building.gridBaySpansY.slice(0, iy).reduce((sum, value) => sum + value, 0), x2: building.width, y2: building.gridBaySpansY.slice(0, iy + 1).reduce((sum, value) => sum + value, 0) })),
              ].map((wall) => <line key={wall.id} className={`grid-map-wall ${activeGridElements.some((item) => item.id === wall.id) ? 'selected' : ''}`} data-removed={building.gridRemovedWalls.includes(wall.id) ? 'true' : 'false'} {...wall} role="button" tabIndex="0" onClick={(event) => selectGridGuideElement({ id: wall.id, type: 'wall' }, event.ctrlKey || event.metaKey)} />)}
            </svg>}
            {gridGuideMode === 'bays' && <div className="grid-guide-actions">
              <button type="button" onClick={() => setSelectedGridBays(Array.from({ length: building.hallGridX }, (_, ix) => Array.from({ length: building.hallGridY }, (_, iy) => `${ix}:${iy}`)).flat())}>Select all</button>
              <button type="button" onClick={() => { setSelectedGridBay(null); setSelectedGridBays([]); }}>Clear</button>
              <button type="button" className="primary" disabled={!activeGridBayKeys.length} onClick={buildSelectedGridBays}><Plus size={13} /> Build selected</button>
            </div>}
            <footer>{gridGuideMode === 'bays' ? `${activeGridBayKeys.length} floor cell${activeGridBayKeys.length === 1 ? '' : 's'} selected · click the stage floor or plan` : `${activeGridElements.length} element${activeGridElements.length === 1 ? '' : 's'} selected`}</footer>
          </aside>}
          {!welcomeDismissed && !mehrazHasProjectWork && (
            <div className="mehraz-stage-welcome" aria-hidden="true">
              <div className="mehraz-stage-welcome-mark"><Building2 size={34} /></div>
              <span>Architectural composition</span>
              <h2>Bring every craft into one space.</h2>
              <p>Shape the building, then place saved Girih, Bricks, and Muqarnas work from your shared library.</p>
            </div>
          )}
          <div className="stage-overlay">
            {building.buildingType === 'grid' && <button
              type="button"
              title={`${gridFloorPlanVisible ? 'Hide' : 'Show'} Grid floor plan`}
              aria-label={`${gridFloorPlanVisible ? 'Hide' : 'Show'} Grid floor plan`}
              aria-pressed={gridFloorPlanVisible}
              className={gridFloorPlanVisible ? 'active' : ''}
              onClick={() => setGridFloorPlanVisible((visible) => !visible)}
            ><Grid3X3 size={14} /> Grid plan</button>}
            <div className="transform-tools">
              <button title="Move selected placement" className={transformMode === 'translate' ? 'active' : ''} onClick={() => setTransformMode('translate')}><Move3d size={14} /></button>
              <button title="Rotate selected placement" className={transformMode === 'rotate' ? 'active' : ''} onClick={() => setTransformMode('rotate')}><RotateCw size={14} /></button>
              <button title="Scale selected placement" className={transformMode === 'scale' ? 'active' : ''} onClick={() => setTransformMode('scale')}><Maximize2 size={14} /></button>
            </div>
            <div className="view-tools">
              <button title="Top view" className={stageView === 'top' ? 'active' : ''} onClick={() => changeStageView('top')}>Top</button>
              <button title="Front view" className={stageView === 'front' ? 'active' : ''} onClick={() => changeStageView('front')}>Front</button>
              <button title="Side view" className={stageView === 'side' ? 'active' : ''} onClick={() => changeStageView('side')}>Side</button>
              <button title="Isometric view" className={stageView === 'isometric' ? 'active' : ''} onClick={() => changeStageView('isometric')}>Iso</button>
              <button title="Slice through the center on the current X section plane" disabled={!sliceAvailable} className={roomSectionView && roomSectionAxis === 'x' ? 'active' : ''} onClick={() => selectRoomSectionView('x')}><ScanLine size={13} /> X Slice</button>
              <button title="Slice through the center at 90 degrees to the X section" disabled={!sliceAvailable} className={roomSectionView && roomSectionAxis === 'y' ? 'active' : ''} onClick={() => selectRoomSectionView('y')}><ScanLine size={13} /> Y Slice</button>
            </div>
          </div>
          {editingProjectInstance && <div className="project-isolation-label"><strong>Editing {editingProjectInstance.name}</strong><span>Isolated project group · save a new version before returning</span><button type="button" onClick={closeProjectInstanceEdit}><ArrowLeft size={13} /> Close edit</button></div>}
        </section>

        <div className="inspector-shell">
        {buildingTypeSelected && <button
          type="button"
          className={`building-type-stage-launcher${buildingTypePickerExpanded ? ' is-hidden' : ''}`}
          aria-label={`Change ${selectedBuildingTypeLabel} building type`}
          title={`Change ${selectedBuildingTypeLabel} building type`}
          onClick={() => {
            constructionPlaybackRef.current.id += 1;
            window.clearTimeout(constructionPlaybackRef.current.timer);
            constructionPlaybackRef.current.timer = null;
            sceneRef.current?.stopConstructionSequence();
            setConstructionPlaying(false);
            setRightTab('building');
            setBuildingTypePickerExpanded(true);
            inspectorRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
            inspectorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
        >
          <img src={`${import.meta.env.BASE_URL}building-types/${selectedBuildingType}.png`} alt="" aria-hidden="true" />
          <span>{selectedBuildingTypeLabel}</span>
        </button>}

        <aside ref={inspectorRef} className="inspector">
          <div className="inspector-tabs">
            <button className={rightTab === 'building' ? 'active' : ''} onClick={() => setRightTab('building')}>Building</button>
            <button className={rightTab === 'transition' ? 'active' : ''} disabled={!buildingTypeSelected || !transitionAvailable} title={transitionAvailable ? undefined : 'This plan bears its cover directly without a transition'} onClick={() => setRightTab('transition')}>Transition</button>
            <button className={rightTab === 'cover' ? 'active' : ''} disabled={!buildingTypeSelected} onClick={() => {
              setRightTab('cover');
            }}>Cover</button>
            <button className={rightTab === 'context' ? 'active' : ''} disabled={!buildingTypeSelected} onClick={() => setRightTab('context')}>Walls</button>
            <button className={rightTab === 'lights' ? 'active' : ''} disabled={!buildingTypeSelected} onClick={() => setRightTab('lights')}>Lights</button>
            <button className={rightTab === 'construction' ? 'active' : ''} disabled={!buildingTypeSelected} onClick={() => setRightTab('construction')}>Steps</button>
            <button className={rightTab === 'project' ? 'active' : ''} onClick={() => setRightTab('project')}>Project</button>
          </div>

          {rightTab === 'building' && (
            <section className="inspector-section building-settings-panel">
              <CollapsiblePanel collapsible={false} hideHeading>
                <div className="building-mode-controls">
                  {(!buildingTypeSelected || buildingTypePickerExpanded) && <div className="building-type-picker-row">
                      <div className="room-cover-toggle building-shell-type-toggle" role="group" aria-label="Building type">
                        {[
                          ['portal', 'Portal'],
                          ['room', 'Room'],
                          ['vestibule', 'Vestibule'],
                          ['hall', 'Hall'],
                          ['grid', 'Grid'],
                        ].map(([type, label]) => <button
                          type="button"
                          key={type}
                          className={`building-type-icon-button${buildingTypeSelected && selectedBuildingType === type ? ' active' : ''}`}
                          aria-pressed={buildingTypeSelected && selectedBuildingType === type}
                          aria-label={`Choose ${label} building type`}
                          onClick={() => selectBuildingType(type)}
                        >
                          <img src={`${import.meta.env.BASE_URL}building-types/${type}.png`} alt="" aria-hidden="true" />
                          <span>{label}</span>
                        </button>)}
                      </div>
                    </div>}
                  {buildingTypeSelected && !buildingTypePickerExpanded && building.buildingType === 'portal' && <div className="room-cover-mode-group">
                    <span>Floor plan</span>
                    <div className="room-cover-toggle floor-plan-toggle three-option-floor-plan-toggle" role="group" aria-label="Portal floor plan">
                      {[
                        ['square', 'Square'],
                        ['octagon', 'Octagon'],
                        ['circle', 'Circle'],
                      ].map(([shape, label]) => <button
                        type="button"
                        key={shape}
                        className={`floor-plan-icon-button${(building.portalPlanShape || 'square') === shape ? ' active' : ''}`}
                        aria-pressed={(building.portalPlanShape || 'square') === shape}
                        onClick={() => selectPortalPlanShape(shape)}
                      >
                        <FloorPlanIcon shape={shape} half />
                        <span>{label}</span>
                      </button>)}
                    </div>
                  </div>}
                  {buildingTypeSelected && !buildingTypePickerExpanded && building.type === 'room' && !['vestibule', 'hall', 'grid'].includes(building.buildingType) && <div className="room-cover-mode-group">
                    <span>Floor plan</span>
                    <div className="room-cover-toggle floor-plan-toggle three-option-floor-plan-toggle" role="group" aria-label="Floor plan">
                      {[
                        ['square', 'Square'],
                        ['octagon', 'Octagon'],
                        ['circle', 'Circle'],
                      ].map(([shape, label]) => <button
                        type="button"
                        key={shape}
                        className={`floor-plan-icon-button${(building.roomPlanShape || 'square') === shape ? ' active' : ''}`}
                        aria-pressed={(building.roomPlanShape || 'square') === shape}
                        onClick={() => selectRoomPlanShape(shape)}
                      >
                        <FloorPlanIcon shape={shape} />
                        <span>{label}</span>
                      </button>)}
                    </div>
                  </div>}
                </div>
                {!buildingTypeSelected && <p className="empty-state">Choose a building type to begin a new Mehraz project.</p>}
                {buildingTypeSelected && !buildingTypePickerExpanded && <>
                {building.type === 'room' && building.roomPlanShape === 'polygon' && <NumberField label="Polygon sides" value={building.roomPolygonSides ?? 6} min={3} max={32} step={1} onChange={(roomPolygonSides) => setBuilding((value) => normalizeBuilding({ ...value, roomPolygonSides }))} />}
                <div className="field-grid">
                  {['hall', 'grid'].includes(building.buildingType) ? <>
                    <StepperNumberField label="X grid bays" value={building.hallGridX ?? 9} min={1} max={12} step={1} onChange={(hallGridX) => building.buildingType === 'grid' ? resizeGrid('x', hallGridX) : setBuilding((value) => normalizeBuilding({ ...value, hallGridX }))} />
                    <StepperNumberField label="Y grid bays" value={building.hallGridY ?? 9} min={1} max={12} step={1} onChange={(hallGridY) => building.buildingType === 'grid' ? resizeGrid('y', hallGridY) : setBuilding((value) => normalizeBuilding({ ...value, hallGridY }))} />
                    <NumberField label={`${building.buildingType === 'grid' ? 'Set all' : 'Bay'} width X · m`} value={building.hallBayWidth ?? 4} min={2} max={12} step={0.1} onChange={(hallBayWidth) => setBuilding((value) => normalizeBuilding({ ...value, hallBayWidth, ...(value.buildingType === 'grid' ? { gridBaySpansX: Array(value.hallGridX).fill(hallBayWidth) } : {}) }))} />
                    <NumberField label={`${building.buildingType === 'grid' ? 'Set all' : 'Bay'} length Y · m`} value={building.hallBayDepth ?? 4} min={2} max={12} step={0.1} onChange={(hallBayDepth) => setBuilding((value) => normalizeBuilding({ ...value, hallBayDepth, ...(value.buildingType === 'grid' ? { gridBaySpansY: Array(value.hallGridY).fill(hallBayDepth) } : {}) }))} />
                    <label><span>Total {building.buildingType === 'grid' ? 'grid' : 'hall'} width · m</span><input value={Number(building.width).toFixed(2)} readOnly /></label>
                    <label><span>Total {building.buildingType === 'grid' ? 'grid' : 'hall'} length · m</span><input value={Number(building.length).toFixed(2)} readOnly /></label>
                  </> : <>
                    <NumberField label="Width Â· m" value={building.width} min={2} max={30} onChange={(width) => setBuilding((value) => normalizeBuilding({ ...value, width }))} />
                    {building.type === 'room'
                      ? <NumberField label={`${building.buildingType === 'vestibule' ? 'Vestibule' : 'Room'} length · m`} value={building.length} min={2} max={30} onChange={(length) => setBuilding((value) => normalizeBuilding({ ...value, length }))} />
                      : <NumberField label="Portal depth Â· m" value={building.iwanDepth} min={2} max={30} onChange={(iwanDepth) => setBuilding((value) => normalizeBuilding({ ...value, iwanDepth, depth: iwanDepth }))} />}
                  </>}
                  <NumberField label="Height Â· m" value={building.height} min={0.5} max={20} onChange={(height) => setBuilding((value) => normalizeBuilding({ ...value, height }))} />
                  <NumberField label="Wall Â· m" value={building.wallThickness} min={0.1} max={1.5} step={0.05} onChange={(wallThickness) => setBuilding((value) => normalizeBuilding({ ...value, wallThickness }))} />
                </div>
                {building.buildingType === 'grid' && <fieldset className="room-exterior-column-settings"><legend>Custom Grid bays</legend>
                  {activeGridBayKeys.length > 0 && <fieldset className="grid-selected-bay-controls"><legend>{activeGridBayKeys.length > 1 ? `${activeGridBayKeys.length} bays selected` : `Bay X${activeGridBayX + 1} / Y${activeGridBayY + 1}`}</legend>
                    <div className="field-grid">
                      <NumberField label={`${selectedGridColumns.length > 1 ? `${selectedGridColumns.length} selected columns` : `Column X${selectedGridColumns[0] + 1}`} span · m`} value={building.gridBaySpansX[selectedGridColumns[0]]} min={2} max={12} step={0.1} onChange={(nextSpan) => setBuilding((value) => normalizeBuilding({
                        ...value,
                        gridBaySpansX: value.gridBaySpansX.map((span, index) => selectedGridColumns.includes(index) ? nextSpan : span),
                      }))} />
                      <NumberField label={`${selectedGridRows.length > 1 ? `${selectedGridRows.length} selected rows` : `Row Y${selectedGridRows[0] + 1}`} span · m`} value={building.gridBaySpansY[selectedGridRows[0]]} min={2} max={12} step={0.1} onChange={(nextSpan) => setBuilding((value) => normalizeBuilding({
                        ...value,
                        gridBaySpansY: value.gridBaySpansY.map((span, index) => selectedGridRows.includes(index) ? nextSpan : span),
                      }))} />
                      <label><span>{activeGridBayKeys.length > 1 ? 'Selected bays cover' : 'Bay cover'}</span><select value={selectedGridCovers.length === 1 ? selectedGridCovers[0] : ''} onChange={(event) => setBuilding((value) => normalizeBuilding({
                        ...value,
                        gridBayCovers: { ...value.gridBayCovers, ...Object.fromEntries(activeGridBayKeys.map((key) => [key, event.target.value])) },
                      }))}>{selectedGridCovers.length > 1 && <option value="" disabled>Mixed covers</option>}<option value="none">No cover</option><option value="dome">Dome</option><option value="barrel">Barrel</option><option value="rib-vault">Rib vault</option><option value="raised-rib-vault">Raised rib vault</option></select></label>
                      <label><span>{activeGridBayKeys.length > 1 ? 'Selected bays transition' : 'Bay transition'}</span><select value={selectedGridTransitions.length === 1 ? selectedGridTransitions[0] : ''} onChange={(event) => setBuilding((value) => normalizeBuilding({
                        ...value,
                        gridBayTransitions: { ...value.gridBayTransitions, ...Object.fromEntries(activeGridBayKeys.map((key) => [key, event.target.value])) },
                      }))}>{selectedGridTransitions.length > 1 && <option value="" disabled>Mixed transitions</option>}<option value="none">None</option><option value="pendentive">Pendentive</option><option value="karbandi">Karbandi</option></select></label>
                    </div>
                    <div className="grid-bulk-actions">
                      <button type="button" className="primary" onClick={buildSelectedGridBays}><Plus size={14} /> Build with dome + pendentive</button>
                      <button type="button" className="danger" onClick={() => setSelectedGridBaysRemoved(true)}><Trash2 size={14} /> Delete selected bay{activeGridBayKeys.length > 1 ? 's' : ''}</button>
                    </div>
                  </fieldset>}
                  <label className="check-field room-exterior-columns-toggle"><input type="checkbox" checked={building.gridStageEditEnabled === true} onChange={(event) => setBuilding((value) => normalizeBuilding({ ...value, gridStageEditEnabled: event.target.checked }))} /><span>Click individual Grid elements on stage to edit</span></label>
                  {activeGridElements.length > 0 && <fieldset className="grid-selected-element-controls"><legend>{activeGridElements.length > 1 ? `${activeGridElements.length} selected elements` : `Selected ${activeGridElements[0].type}`}</legend>
                    <div className="grid-element-selection-summary">{activeGridElements.map((item) => <span key={item.id}>{item.id}</span>)}</div>
                    <label><span>Selected color</span><input type="color" value={building.gridElementColors?.[activeGridElements[0].id] || (activeGridElements[0].type === 'wall' ? building.wallColor : activeGridElements[0].type === 'vault' ? building.hallVaultColor : building.domeColor)} onChange={(event) => setBuilding((value) => normalizeBuilding({
                      ...value,
                      gridElementColors: { ...value.gridElementColors, ...Object.fromEntries(activeGridElements.map((item) => [item.id, event.target.value])) },
                    }))} /></label>
                    {activeGridElements.every((item) => item.bay && (item.type === 'dome' || item.id.startsWith('cover:'))) && <label><span>Selected cover type</span><select value="" onChange={(event) => setBuilding((value) => normalizeBuilding({
                      ...value,
                      gridBayCovers: { ...value.gridBayCovers, ...Object.fromEntries(activeGridElements.map((item) => [item.bay.join(':'), event.target.value])) },
                    }))}><option value="" disabled>Set cover…</option><option value="none">No cover</option><option value="dome">Dome</option><option value="barrel">Barrel</option><option value="rib-vault">Rib vault</option><option value="raised-rib-vault">Raised rib vault</option></select></label>}
                    {activeGridElements.every((item) => item.type === 'transition' && item.bay) && <label><span>Selected transition type</span><select value="" onChange={(event) => setBuilding((value) => normalizeBuilding({
                      ...value,
                      gridBayTransitions: { ...value.gridBayTransitions, ...Object.fromEntries(activeGridElements.map((item) => [item.bay.join(':'), event.target.value])) },
                    }))}><option value="" disabled>Set transition…</option><option value="none">None</option><option value="pendentive">Pendentive</option><option value="karbandi">Karbandi</option></select></label>}
                    <div className="grid-bulk-actions">
                      <button type="button" className="danger" onClick={removeSelectedGridElement}><Trash2 size={14} /> Remove selected</button>
                      <button type="button" onClick={restoreSelectedGridElements}><RefreshCw size={14} /> Restore selected</button>
                    </div>
                  </fieldset>}
                </fieldset>}
                {['hall', 'grid'].includes(building.buildingType) && <fieldset className="room-exterior-column-settings"><legend>{building.buildingType === 'grid' ? 'Grid' : 'Hall'} bearing and vault arch</legend><div className="field-grid">
                  <div className="room-cover-mode-group room-exterior-column-profile">
                    <span>Column profile</span>
                    <div className="room-cover-toggle building-type-toggle" role="group" aria-label={`${building.buildingType === 'grid' ? 'Grid' : 'Hall'} column profile`}>
                      {[['square', 'Square'], ['circle', 'Circle']].map(([profile, label]) => <button type="button" key={profile} className={`column-profile-icon-button${(building.hallColumnProfile || 'square') === profile ? ' active' : ''}`} aria-pressed={(building.hallColumnProfile || 'square') === profile} onClick={() => setBuilding((value) => normalizeBuilding({ ...value, hallColumnProfile: profile }))}><ColumnProfileIcon profile={profile} /><span>{label}</span></button>)}
                    </div>
                  </div>
                  <NumberField label={building.hallColumnProfile === 'square' ? 'Column width · m' : 'Column diameter · m'} value={building.hallColumnDimension ?? building.wallThickness} min={0.1} max={2} step={0.02} onChange={(hallColumnDimension) => setBuilding((value) => normalizeBuilding({ ...value, hallColumnDimension, hallColumnDimensionFollowsWallThickness: false }))} />
                  <NumberField label="Vault profile width · m" value={building.hallArchRibWidth ?? 0.7} min={0.03} max={0.8} step={0.01} onChange={(hallArchRibWidth) => setBuilding((value) => resizeHallVaultProfileWidth(value, hallArchRibWidth))} />
                  <NumberField label="Vault profile height · m" value={building.hallArchRibHeight ?? 0.35} min={0.03} max={0.8} step={0.01} onChange={(hallArchRibHeight) => setBuilding((value) => resizeHallVaultProfileHeight(value, hallArchRibHeight))} />
                  <div className="room-cover-mode-group room-exterior-column-profile">
                    <span>Vault finish</span>
                    <div className="room-cover-toggle building-type-toggle" role="group" aria-label="Hall vault finish">
                      {[['color', 'Color'], ['bricks', 'Bricks']].map(([finish, label]) => <button type="button" key={finish} className={(building.hallVaultFinish || 'bricks') === finish ? 'active' : ''} aria-pressed={(building.hallVaultFinish || 'bricks') === finish} onClick={() => setBuilding((value) => normalizeBuilding({ ...value, hallVaultFinish: finish }))}>{label}</button>)}
                    </div>
                  </div>
                  <label><span>Vault color</span><input type="color" value={building.hallVaultColor || '#b78b5d'} onChange={(event) => setBuilding((value) => normalizeBuilding({ ...value, hallVaultColor: event.target.value }))} /></label>
                  <div
                    className="field-grid arch-input-guide-grid"
                    data-hall-arch-guide-inputs="vault"
                    onFocusCapture={() => setHallInputGuide('vault')}
                    onBlurCapture={(event) => {
                      if (!event.currentTarget.contains(event.relatedTarget)) setHallInputGuide(null);
                    }}
                  >
                    <ArchTypeToggle value={building.hallArch?.archType} onChange={(archType) => setBuilding((value) => normalizeBuilding({ ...value, hallArch: { ...value.hallArch, archType } }))} onDesign={() => openArchDesigner(`${building.buildingType === 'grid' ? 'Grid' : 'Hall'} vault arch`, Math.min(building.hallBayWidth, building.hallBayDepth), building.hallArch, (patch) => setBuilding((value) => normalizeBuilding({ ...value, hallArch: { ...value.hallArch, ...patch } })))} />
                  </div>
                </div></fieldset>}
                {building.buildingType === 'room' && <fieldset className="room-exterior-column-settings">
                  <legend>Exterior edge columns</legend>
                  <div className="field-grid">
                    <label className="check-field room-exterior-columns-toggle"><input type="checkbox" checked={building.roomExteriorColumnsEnabled === true} onChange={(event) => setBuilding((value) => normalizeBuilding({ ...value, roomExteriorColumnsEnabled: event.target.checked }))} /><span>Show exterior columns</span></label>
                    <div className="room-cover-mode-group room-exterior-column-profile">
                      <span>Column profile</span>
                      <div className="room-cover-toggle building-type-toggle contextual-column-profile-toggle" role="group" aria-label={`Exterior column profile for ${building.roomPlanShape || 'square'} room plan`}>
                        {[
                          ['square', 'Square'],
                          ['circle', 'Circle'],
                        ].map(([profile, label]) => <button
                          type="button"
                          key={profile}
                          className={`contextual-column-profile-button${building.roomExteriorColumnsEnabled === true && (building.roomExteriorColumnProfile || 'circle') === profile ? ' active' : ''}`}
                          aria-pressed={building.roomExteriorColumnsEnabled === true && (building.roomExteriorColumnProfile || 'circle') === profile}
                          onClick={() => setBuilding((value) => normalizeBuilding({ ...value, roomExteriorColumnProfile: profile }))}
                        ><ExteriorColumnPlanIcon planShape={building.roomPlanShape || 'square'} profile={profile} /><span>{label}</span></button>)}
                      </div>
                    </div>
                    <NumberField label={building.roomExteriorColumnProfile === 'square' ? 'Column half-size · m' : 'Column radius · m'} value={building.roomExteriorColumnRadius ?? 0.2} min={0.05} max={2} step={0.05} onChange={(roomExteriorColumnRadius) => setBuilding((value) => normalizeBuilding({ ...value, roomExteriorColumnRadius }))} />
                    {building.roomExteriorColumnProfile === 'square' && <NumberField label="Profile rotation · °" value={building.roomExteriorSquareColumnRotation ?? 0} min={-360} max={360} step={1} onChange={(roomExteriorSquareColumnRotation) => setBuilding((value) => normalizeBuilding({ ...value, roomExteriorSquareColumnRotation }))} />}
                    {building.roomPlanShape === 'circle' && <NumberField label="Columns around room" value={building.roomExteriorCircleColumnCount ?? 8} min={3} max={64} step={1} onChange={(roomExteriorCircleColumnCount) => setBuilding((value) => normalizeBuilding({ ...value, roomExteriorCircleColumnCount }))} />}
                    {building.roomPlanShape === 'circle' && <div className="room-cover-mode-group">
                      <span>Circumscribed circumference</span>
                      <div className="room-cover-toggle building-type-toggle circle-boundary-toggle" role="group" aria-label="Circle column boundary">
                        {[
                          ['columns', 'Columns define boundary'],
                          ['building', 'Building defines boundary'],
                        ].map(([mode, label]) => <button
                          type="button"
                          key={mode}
                          className={`circle-boundary-icon-button${building.roomExteriorColumnsEnabled === true && (building.roomExteriorCircleColumnBoundaryMode || 'columns') === mode ? ' active' : ''}`}
                          aria-pressed={building.roomExteriorColumnsEnabled === true && (building.roomExteriorCircleColumnBoundaryMode || 'columns') === mode}
                          onClick={() => setBuilding((value) => normalizeBuilding({ ...value, roomExteriorCircleColumnBoundaryMode: mode }))}
                        ><CircleColumnBoundaryIcon mode={mode} profile={building.roomExteriorColumnProfile || 'circle'} /><span>{label}</span></button>)}
                      </div>
                    </div>}
                  </div>
                </fieldset>}
                </>}
              </CollapsiblePanel>
              {buildingTypeSelected && !buildingTypePickerExpanded && renderStoneSkirtControls()}
              {buildingTypeSelected && !buildingTypePickerExpanded && <div className="field-grid building-ground-color-controls">
                <label><span>Ground color</span><input type="color" value={building.groundColor} onChange={(event) => setBuilding((value) => ({ ...value, groundColor: event.target.value }))} /></label>
              </div>}
            </section>
          )}

          {rightTab === 'context' && (
            <section className="inspector-section wall-global-controls">
              {renderWallVisibilityAndMaterial()}
              {renderHallWallBondControls()}
              {renderRoomPlanWallControls()}
            </section>
          )}

          {rightTab === 'context' && !selectedWallSide && <section className="inspector-section"><p className="empty-state">Click a wall or one of its zones to load that wall’s settings.</p></section>}

          {rightTab === 'context' && selectedWallSide && (
            <section className="inspector-section wall-controls">
              <div className="section-heading"><BrickWall size={17} /><div><strong>{selectedWallLabel}</strong><small>{building.type === 'room' && ROOM_WALL_SIDES.includes(selectedWallSide) ? 'Whole wall selected · interior and exterior settings below' : 'Selected wall settings and zones'}</small></div></div>
              {building.type !== 'room' && ['north', 'north_sides'].includes(selectedWallSide) && <CollapsiblePanel panelRef={wallNorthSidesRef} collapsible={false} title="North side wall settings">
                {renderWallBondControls('north_sides')}
                <div className="field-grid">
                  <NumberField label="Outward width Â· each side" value={walls.northWall.outwardWidth} min={0} max={10} step={0.1} onChange={(outwardWidth) => updateWallGroup('northWall', { outwardWidth })} />
                  <NumberField label="North side wall height Â· m" value={walls.northWall.minHeight ?? 0} min={0} max={30} step={0.1} onChange={(minHeight) => updateWallGroup('northWall', { minHeight: minHeight > 0 ? minHeight : null })} />
                </div>
                <label className="check-field"><input type="checkbox" checked={walls.northBoundary.enabled} onChange={(event) => updateWallGroup('northBoundary', { enabled: event.target.checked })} /><span>Sunken inset and continuous boundary</span></label>
                <div className="field-grid">
                  <NumberField label="Inset Â· m" value={walls.northBoundary.inset} min={0.02} max={2} step={0.05} onChange={(inset) => updateWallGroup('northBoundary', { inset })} />
                  <NumberField label="Sunken depth Â· m" value={walls.northBoundary.depth} min={0} max={1} step={0.05} onChange={(depth) => updateWallGroup('northBoundary', { depth })} />
                  <NumberField label="Inset line Â· px" value={walls.northBoundary.thickness} min={0.5} max={8} step={0.5} onChange={(thickness) => updateWallGroup('northBoundary', { thickness })} />
                  <label><span>Inset line color</span><input type="color" value={walls.northBoundary.color} onChange={(event) => updateWallGroup('northBoundary', { color: event.target.value })} /></label>
                </div>
              </CollapsiblePanel>}

              {selectedWallSide === 'north_top' && <CollapsiblePanel panelRef={wallNorthTopRef} collapsible={false} title="North wall top finish">
                {renderWallBondControls('north_top')}
                <div className="field-grid" data-north-arch-guide-inputs>
                  <ArchTypeToggle value={walls.pointedArch.archType} onChange={(archType) => updateWallGroup('pointedArch', { archType })} onDesign={() => openArchDesigner('Portal north wall arch', building.openingWidth, walls.pointedArch, (patch) => updateWallGroup('pointedArch', patch))} />
                  <NumberField label="Extra above arch · m" value={walls.northWall.archTopExtension} min={0} max={10} step={0.1} onChange={(archTopExtension) => updateWallGroup('northWall', { archTopExtension })} />
                </div>
              </CollapsiblePanel>}

              {((building.type === 'room' && !['hall', 'grid'].includes(building.buildingType) && (building.roomPlanShape || 'square') === 'square' && ROOM_WALL_SIDES.includes(selectedWallSide)) || (building.type !== 'room' && selectedWallSide === 'south')) && <CollapsiblePanel
                panelRef={wallSouthRef}
                collapsible={false}
                hideHeading={building.type === 'room'}
                title={`${selectedWallLabel} settings`}
                guide={building.type === 'room'
                  ? 'Click either side of a wall in the model to select and highlight the complete wall. Interior and exterior bounds and finishes remain independent; openings are shared. Every Room wall uses the same construction system. Horizontal lintels use soldier courses, arched openings use curved border bricks, and window sills remain soldier courses.'
                  : 'Horizontal lintels use soldier courses; arched openings use curved border bricks; and window sills remain soldier courses.'}
              >
                {building.type === 'room' ? <>
                  {renderWallBondControls(`${selectedWallSide}_exterior`, {
                    wallSide: selectedWallSide,
                    label: 'Exterior decorative face bond',
                  })}
                  {renderWallBondControls(selectedWallSide, {
                    wallSide: selectedWallSide,
                    label: 'Interior decorative face bond',
                  })}
                </> : renderWallBondControls(selectedWallSide)}
                {['door', 'window'].map((type) => {
                  const openingWallSide = building.type === 'room' ? selectedWallSide : 'south';
                  const opening = building.type === 'room' ? walls.roomWallOpenings[openingWallSide][type] : walls.southOpenings[type];
                  const openingBottom = opening.sillHeight;
                  const openingSpringHeight = openingBottom + opening.height;
                  const updateOpening = (patch) => building.type === 'room'
                    ? updateWallGroup('roomWallOpenings', {
                      [openingWallSide]: {
                        ...walls.roomWallOpenings[openingWallSide],
                        [type]: { ...opening, ...patch },
                      },
                    })
                    : updateWallGroup('southOpenings', { [type]: { ...opening, ...patch } });
                  const updateOpeningArch = (patch) => updateOpening({ arch: { ...opening.arch, ...patch } });
                  return (
                    <div
                      className={`opening-card ${selectedOpeningGuideType === type && selectedOpeningGuideSide === openingWallSide ? 'active' : ''}`}
                      key={type}
                    >
                      <label className="check-field"><input type="checkbox" checked={opening.enabled} onChange={(event) => updateOpening({ enabled: event.target.checked })} /><span className="guided-heading">{type[0].toUpperCase() + type.slice(1)} <HelpTooltip label={`${type} opening`}>{opening.head === 'arch' ? 'Red circles form the lower opening arch; green circles continue from the tangent points to the crown.' : 'The horizontal head is supported by a raised soldier-brick lintel. Change Opening head to Arch to use the four-centre controls.'}</HelpTooltip></span></label>
                      <div className="field-grid">
                        <NumberField label="Width Â· m" value={opening.width} min={0.3} max={12} step={0.1} onChange={(width) => updateOpening({ width })} />
                        <NumberField label={opening.head === 'arch' ? 'Spring height · m' : 'Height · m'} value={opening.height} min={0.3} max={15} step={0.1} onChange={(height) => updateOpening({ height })} />
                        <NumberField label="Center position" value={opening.position} min={-20} max={20} step={0.1} onChange={(position) => updateOpening({ position })} />
                        <NumberField label="Sill height · m" value={opening.sillHeight} min={0} max={18} step={0.05} onChange={(sillHeight) => updateOpening({ sillHeight })} />
                        <label><span>Opening head</span><select value={opening.head} onChange={(event) => updateOpening({ head: event.target.value })}><option value="lintel">Horizontal lintel</option><option value="arch">Arch</option></select></label>
                      </div>
                      {opening.head === 'arch' && (
                        <>
                          <div
                            className="field-grid"
                            data-opening-arch-guide-inputs
                            onPointerDown={() => activateOpeningGuide(type, openingWallSide)}
                            onFocusCapture={() => activateOpeningGuide(type, openingWallSide)}
                            onBlurCapture={(event) => {
                              if (!event.currentTarget.contains(event.relatedTarget)) setSelectedOpeningGuide(null);
                            }}
                          >
                            <ArchTypeToggle value={opening.arch.archType} onChange={(archType) => updateOpeningArch({ archType })} onDesign={() => openArchDesigner(`${openingWallSide[0].toUpperCase() + openingWallSide.slice(1)} wall ${type}`, opening.width, opening.arch, updateOpeningArch, { springHeight: openingSpringHeight })} />
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </CollapsiblePanel>}

              {building.type !== 'room' && selectedWallSide === 'east' && <CollapsiblePanel panelRef={wallEastRef} collapsible={false} title="East wall settings">
                {renderWallBondControls('east')}
              </CollapsiblePanel>}

              {building.type !== 'room' && selectedWallSide === 'west' && <CollapsiblePanel panelRef={wallWestRef} collapsible={false} title="West wall settings">
                {renderWallBondControls('west')}
              </CollapsiblePanel>}

              {['arch', 'south_arch'].includes(selectedWallSide) && <CollapsiblePanel panelRef={wallArchRef} collapsible={false} title="Arch wall face settings">
                {renderWallBondControls('arch')}
              </CollapsiblePanel>}

              <CollapsiblePanel collapsible={false} title={`${selectedWallLabel} zones`}>
                <button className="primary" onClick={addZone}><Plus size={15} /> Add zone to {selectedWallLabel}</button>
                <div className="zone-list">
                  {selectedWallZones.map((zone) => <button className={zone.id === selectedZoneId ? 'active' : ''} key={zone.id} onClick={() => sceneRef.current?.selectZone(zone.id)}>
                    <span style={{ background: zone.color }} />
                    <div><strong>{zone.name}</strong><small>{zone.assetName || 'No pattern assigned'}</small></div>
                  </button>)}
                  {!selectedWallZones.length && <p className="empty-state">No zones on this wall. Add one above.</p>}
                </div>
              </CollapsiblePanel>

            </section>
          )}

          {(rightTab === 'cover' || rightTab === 'transition') && (
            <section className="inspector-section">
              {building.type === 'room' && !['hall', 'grid'].includes(building.buildingType) && <div ref={roomDomeRef} className="cover-settings room-cover-settings" role="tabpanel" data-room-dome-settings>
                {rightTab === 'cover' && <div className="cover-settings-heading"><strong className="guided-heading">Room cover <HelpTooltip label="Room cover">Choose the exterior cover form first. Square rooms offer transition systems; other floor plans carry the drum directly on their walls.</HelpTooltip></strong><small>Cover type and support</small></div>}
                {rightTab === 'transition' && <div className="cover-settings-heading"><strong>Room transition</strong><small>Transition type, structure, and finish</small></div>}
                <div className="room-cover-mode-controls">
                  {rightTab === 'cover' && <div className="room-cover-mode-group">
                    <span>Cover type</span>
                    <div className="room-cover-toggle cover-type-icon-toggle" role="group" aria-label="Cover type">
                      {(building.buildingType === 'vestibule' ? [
                        ['none', 'None'],
                        ['dome', 'Dome'],
                      ] : (building.roomPlanShape || 'square') === 'square' && building.domeTransition === 'karbandi' ? [
                        ['none', 'None'],
                        ['dome', 'Dome'],
                      ] : [
                        ['none', 'None'],
                        ['dome', 'Dome'],
                        ['cone', 'Cone'],
                        ['pyramid', 'Pyramid'],
                      ]).map(([type, label]) => {
                        const disabled = type === 'pyramid' && building.roomPlanShape === 'circle';
                        return <button
                          type="button"
                          key={type}
                          className={(building.domeCoverType || 'dome') === type ? 'active' : ''}
                          aria-pressed={(building.domeCoverType || 'dome') === type}
                          disabled={disabled}
                          title={disabled ? 'Pyramid requires a polygonal room plan' : undefined}
                          onClick={() => selectRoomCover(type)}
                        ><CoverTypeOption type={type} label={label} /></button>;
                      })}
                    </div>
                  </div>}
                  {rightTab === 'transition' && <div className="room-cover-mode-group">
                    <span>Transition type</span>
                    {building.buildingType === 'vestibule' ? <div className="room-cover-toggle hall-two-column-toggle" role="group" aria-label="Transition type">
                      {[['none', 'None'], ['karbandi', 'Karbandi']].map(([type, label]) => <button type="button" key={type} className={building.domeTransition === type ? 'active' : ''} aria-pressed={building.domeTransition === type} onClick={() => selectRoomDomeTransition(type)}>{label}</button>)}
                    </div> : (building.roomPlanShape || 'square') === 'square' ? <div className="room-cover-toggle" role="group" aria-label="Transition type">
                      {[
                        ['none', 'None'],
                        ['karbandi', 'Karbandi'],
                        ['squinch', 'Squinch'],
                        ['muqarnas', 'Muqarnas'],
                      ].map(([type, label]) => <button
                        type="button"
                        key={type}
                        className={building.domeTransition === type ? 'active' : ''}
                        aria-pressed={building.domeTransition === type}
                        onClick={() => selectRoomDomeTransition(type)}
                      >{label}</button>)}
                    </div> : <div className="room-cover-direct-bearing">Direct bearing · no transition</div>}
                  </div>}
                </div>
                {rightTab === 'cover' && building.domeCoverType === 'none' && <p className="empty-state">No cover selected. The current transition and building walls remain unchanged.</p>}
                {rightTab === 'transition' && roomTransitionAvailable && building.domeTransition === 'none' && <p className="empty-state">No transition selected. The current cover remains available.</p>}
                {rightTab === 'cover' && building.domeCoverType !== 'none' && <fieldset
                  className="outer-cover-settings"
                  ref={roomDomeArchRef}
                  data-room-dome-arch
                  onPointerDownCapture={() => sceneRef.current?.selectWallSide('room_dome', false)}
                  onFocusCapture={() => sceneRef.current?.selectWallSide('room_dome', false)}
                ><legend>{building.domeCoverType === 'cone' ? 'Outer cone' : building.domeCoverType === 'pyramid' ? 'Outer pyramid' : 'Outer dome'}</legend>
                  {renderWallBondControls('room_dome', { wallSide: 'room_dome', label: `Outer ${building.domeCoverType || 'dome'} exterior bond` })}
                  {renderWallBondControls('room_dome_interior', { wallSide: 'room_dome', label: `Outer ${building.domeCoverType || 'dome'} interior bond` })}
                  <div className="field-grid">
                    {(building.domeCoverType || 'dome') === 'dome' && <div className="field-grid arch-input-guide-grid" data-room-dome-arch-guide-inputs>
                      <ArchTypeToggle disabled={building.innerDomeEnabled === true} value={building.domeArch?.archType} onChange={(archType) => setBuilding((value) => normalizeBuilding({ ...value, domeArch: { ...value.domeArch, archType } }))} onDesign={() => openArchDesigner('Outer dome arch', Math.min(building.width, building.depth || building.length), building.domeArch, (patch) => setBuilding((value) => normalizeBuilding({ ...value, domeArch: { ...value.domeArch, ...patch } })), { disabled: building.innerDomeEnabled === true })} />
                    </div>}
                    {(building.domeCoverType || 'dome') !== 'dome' && <NumberField label={`${building.domeCoverType === 'pyramid' ? 'Pyramid' : 'Cone'} height · m`} value={building.domeCoverHeight ?? 5} min={0.2} max={20} step={0.05} onChange={(domeCoverHeight) => setBuilding((value) => normalizeBuilding({ ...value, domeCoverHeight }))} />}
                   {(building.domeCoverType || 'dome') === 'dome' && <label className="check-field room-exterior-columns-toggle"><input type="checkbox" disabled={building.innerDomeEnabled === true} checked={building.domeCenterOpeningEnabled === true} onChange={(event) => setBuilding((value) => normalizeBuilding({ ...value, domeCenterOpeningEnabled: event.target.checked }))} /><span>Cut uncovered center as circular hole</span></label>}
                   <NumberField label="Dome / pattern coverage · %" value={building.domePatternCoverage ?? 85} min={0} max={100} step={1} onChange={(domePatternCoverage) => setBuilding((value) => normalizeBuilding({ ...value, domePatternCoverage }))} />
                    <label><span>Cover bricks color</span><input type="color" value={building.domeColor || '#49b5ca'} onChange={(event) => setBuilding((value) => normalizeBuilding({ ...value, domeColor: event.target.value }))} /></label>
                  </div>
                  {building.innerDomeEnabled === true && (building.domeCoverType || 'dome') === 'dome' && <p className="empty-state">Two-layer dome · the main dome is fixed to 2 pointed, red 0 m, green 2 m, green point 2 m below the leg, with no center hole.</p>}
                </fieldset>}
                {rightTab === 'cover' && building.domeCoverType !== 'none' && <fieldset
                  ref={roomDomeExtraLegRef}
                  data-room-dome-extra-leg
                  onPointerDownCapture={() => sceneRef.current?.selectWallSide('room_dome_extra_leg', false)}
                  onFocusCapture={() => sceneRef.current?.selectWallSide('room_dome_extra_leg', false)}
                ><legend>Dome extra leg</legend>
                  <div className="field-grid">
                    <NumberField label="Extra leg height · m" value={building.domeOuterLegExtensionByCoverType?.[building.domeCoverType || 'dome'] ?? building.domeArch?.legExtension ?? 0} min={0} max={10} step={0.05} onChange={(legExtension) => setBuilding((value) => normalizeBuilding({
                      ...value,
                      domeOuterLegExtensionByTransitionAndCoverType: {
                        ...value.domeOuterLegExtensionByTransitionAndCoverType,
                        [domeSupportModeFor(value)]: {
                          ...value.domeOuterLegExtensionByTransitionAndCoverType?.[domeSupportModeFor(value)],
                          [value.domeCoverType || 'dome']: legExtension,
                        },
                      },
                    }))} />
                    <label><span>Extra leg bricks color</span><input type="color" value={building.domeExtraLegColor || building.domeColor || '#49b5ca'} onChange={(event) => setBuilding((value) => normalizeBuilding({ ...value, domeExtraLegColor: event.target.value }))} /></label>
                  </div>
                  {renderWallBondControls('room_dome_extra_leg', { wallSide: 'room_dome_extra_leg', label: 'Extra leg exterior bond' })}
                  {renderWallBondControls('room_dome_extra_leg_interior', { wallSide: 'room_dome_extra_leg', label: 'Extra leg interior bond' })}
                </fieldset>}
                {rightTab === 'cover' && building.domeCoverType !== 'none' && <fieldset
                  ref={roomInnerDomeRef}
                  data-room-inner-dome-arch
                  onPointerDownCapture={() => sceneRef.current?.selectWallSide('room_dome_inner', false)}
                  onFocusCapture={() => sceneRef.current?.selectWallSide('room_dome_inner', false)}
                ><legend><span className="fieldset-legend-label">Inner dome <HelpTooltip label="Inner dome">The inner dome is a separate brick shell below the exterior dome. Its red and green construction circles define an independent four-centre profile and leave a real cavity between the two domes.</HelpTooltip></span></legend>
                  <label className="check-field"><input type="checkbox" checked={building.innerDomeEnabled === true} onChange={(event) => setBuilding((value) => normalizeBuilding({
                    ...value,
                    innerDomeEnabledByTransition: {
                      ...value.innerDomeEnabledByTransition,
                      [domeSupportModeFor(value)]: event.target.checked,
                    },
                  }))} /><span>Show inner dome</span></label>
                  {renderWallBondControls('room_inner_dome_exterior', { wallSide: 'room_dome_inner', label: 'Inner dome exterior bond' })}
                  {renderWallBondControls('room_inner_dome_interior', { wallSide: 'room_dome_inner', label: 'Inner dome interior bond' })}
                  <div className="field-grid">
                    <div className="field-grid arch-input-guide-grid" data-room-dome-arch-guide-inputs>
                    <ArchTypeToggle value={building.innerDomeArch?.archType} onChange={(archType) => setBuilding((value) => normalizeBuilding({ ...value, innerDomeArch: { ...value.innerDomeArch, archType } }))} onDesign={() => openArchDesigner('Inner dome arch', Math.min(building.width, building.depth || building.length), building.innerDomeArch, (patch) => setBuilding((value) => normalizeBuilding({ ...value, innerDomeArch: { ...value.innerDomeArch, ...patch } })))} />
                    </div>
                    <NumberField label="Inner dome pattern coverage · %" value={building.innerDomePatternCoverage ?? 85} min={0} max={100} step={1} onChange={(innerDomePatternCoverage) => setBuilding((value) => normalizeBuilding({ ...value, innerDomePatternCoverage }))} />
                    <label><span>Inner dome bricks color</span><input type="color" value={building.innerDomeColor || '#b88b5f'} onChange={(event) => setBuilding((value) => normalizeBuilding({ ...value, innerDomeColor: event.target.value }))} /></label>
                  </div>
                  {building.innerDomeEnabled === true && <div className="field-grid">
                    <label className="check-field"><input type="checkbox" checked={building.betweenDomeSupportWallsEnabled !== false} onChange={(event) => setBuilding((value) => normalizeBuilding({ ...value, betweenDomeSupportWallsEnabled: event.target.checked }))} /><span>Between domes supporting walls</span></label>
                    <NumberField label="Width around R/2 center · %" value={building.betweenDomeSupportWallsCoverage ?? 60} min={0} max={100} step={1} onChange={(betweenDomeSupportWallsCoverage) => setBuilding((value) => normalizeBuilding({ ...value, betweenDomeSupportWallsCoverage }))} />
                  </div>}
                </fieldset>}
                {rightTab === 'cover' && building.domeCoverType !== 'none' && <fieldset
                  className="dome-ring-settings"
                  ref={roomDomeRingRef}
                  data-room-dome-ring
                  onPointerDownCapture={() => sceneRef.current?.selectWallSide('room_dome_ring', false)}
                  onFocusCapture={() => sceneRef.current?.selectWallSide('room_dome_ring', false)}
                ><legend>Dome springing ring</legend>
                  <label className="check-field"><input type="checkbox" checked={building.domeOuterRingEnabledByCoverType?.[building.domeCoverType || 'dome'] !== false} onChange={(event) => setBuilding((value) => normalizeBuilding({
                    ...value,
                    domeOuterRingEnabledByTransitionAndCoverType: {
                      ...value.domeOuterRingEnabledByTransitionAndCoverType,
                      [domeSupportModeFor(value)]: {
                        ...value.domeOuterRingEnabledByTransitionAndCoverType?.[domeSupportModeFor(value)],
                        [value.domeCoverType || 'dome']: event.target.checked,
                      },
                    },
                  }))} /><span>Show outer ring for {building.domeCoverType === 'cone' ? 'Cone' : building.domeCoverType === 'pyramid' ? 'Pyramid' : 'Dome'}</span></label>
                  <label><span>Ring solid color</span><input type="color" value={building.domeRingColor || '#49b5ca'} onChange={(event) => setBuilding((value) => normalizeBuilding({ ...value, domeRingColor: event.target.value }))} /></label>
                </fieldset>}
                {rightTab === 'cover' && building.domeCoverType !== 'none' && <fieldset
                  ref={roomDomeDrumRef}
                  data-room-dome-drum
                  onPointerDownCapture={() => sceneRef.current?.selectWallSide('room_dome_drum', false)}
                  onFocusCapture={() => sceneRef.current?.selectWallSide('room_dome_drum', false)}
                ><legend>Dome drum</legend>
                  <div className="field-grid">
                    <NumberField label="Drum height · m" value={building.domeDrumHeight ?? 0} min={0} max={10} step={0.05} onChange={(domeDrumHeight) => setBuilding((value) => normalizeBuilding({
                      ...value,
                      domeDrumHeightByTransition: {
                        ...value.domeDrumHeightByTransition,
                        [domeSupportModeFor(value)]: domeDrumHeight,
                      },
                    }))} />
                    <label><span>Drum bricks color</span><input type="color" value={building.domeTransition === 'squinch' && (building.domeDrumColor || '').toLowerCase() === '#b3a62c' ? walls.color : (building.domeDrumColor || '#b3a62c')} onChange={(event) => setBuilding((value) => normalizeBuilding({ ...value, domeDrumColor: event.target.value }))} /></label>
                  </div>
                  {renderWallBondControls('room_dome_drum', { wallSide: 'room_dome_drum', label: 'Drum exterior bond' })}
                  {renderWallBondControls('room_dome_drum_interior', { wallSide: 'room_dome_drum', label: 'Drum interior bond' })}
                </fieldset>}
                {rightTab === 'transition' && roomTransitionAvailable && building.domeTransition !== 'none' && <div
                  className="room-transition-panel"
                  ref={roomTransitionRef}
                  data-room-dome-transition
                  onPointerDownCapture={() => sceneRef.current?.selectWallSide('room_dome_transition', false)}
                  onFocusCapture={() => sceneRef.current?.selectWallSide('room_dome_transition', false)}
                >
                <div className="cover-settings-heading"><strong>Transition finish</strong><small>Independent from the dome shell and drum</small></div>
                {roomTransitionAvailable && <label className="check-field"><input type="checkbox" checked={building.domeTransitionCoverEnabled === true} onChange={(event) => setDomeTransitionCoverEnabled(event.target.checked)} /><span>Cover transition</span></label>}
                {building.domeTransition === 'squinch' && renderWallBondControls('room_dome_transition_exterior', {
                    wallSide: 'room_dome_transition',
                    label: 'Transition exterior bond',
                  })}
                {renderWallBondControls('room_dome_transition', {
                  wallSide: 'room_dome_transition',
                  label: building.domeTransition === 'squinch' ? 'Transition interior bond' : 'Transition cover bond',
                })}
                {building.domeTransition === 'squinch' && <fieldset
                  className="room-transition-settings"
                  data-squinch-arch
                  onPointerDownCapture={() => sceneRef.current?.setSquinchArchEditing(true)}
                  onFocusCapture={() => sceneRef.current?.setSquinchArchEditing(true)}
                  onInputCapture={() => sceneRef.current?.setSquinchArchEditing(true)}
                  onChangeCapture={() => sceneRef.current?.setSquinchArchEditing(true)}
                  onBlurCapture={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget)) sceneRef.current?.setSquinchArchEditing(false);
                  }}
                ><legend><span className="fieldset-legend-label">Squinch transition · 8 arches <HelpTooltip label="Squinch transition">The north-wall reference arch sets the transition height automatically. Four wall bays and four Karbandi-style corner bays support the selected drum.</HelpTooltip></span></legend><div className="field-grid">
                  <ArchTypeToggle value={building.domeTransitionSettings?.squinch?.archType} onChange={(archType) => updateDomeTransitionSettings('squinch', { archType })} onDesign={() => openArchDesigner('Room Squinch arch', Math.min(building.width, building.depth || building.length) / 2, building.domeTransitionSettings?.squinch, (patch) => updateDomeTransitionSettings('squinch', patch))} />
                  <NumberField label="Rib band width · m" value={building.domeTransitionSettings?.squinch?.ribWidth ?? 0.1} min={0.01} max={1} step={0.01} onChange={(ribWidth) => updateDomeTransitionSettings('squinch', { ribWidth })} />
                  <NumberField label="Rib thickness · m" value={building.domeTransitionSettings?.squinch?.ribDepth ?? 0.46} min={0.01} max={1} step={0.01} onChange={(ribDepth) => updateDomeTransitionSettings('squinch', { ribDepth })} />
                  <label><span>Rib color</span><input type="color" value={building.domeTransitionSettings?.squinch?.ribColor ?? '#3490b7'} onChange={(event) => updateDomeTransitionSettings('squinch', { ribColor: event.target.value })} /></label>
                  <NumberField label="Vertical leg extension · m" value={building.domeTransitionSettings?.squinch?.legExtension ?? 1} min={0} max={10} step={0.05} onChange={(legExtension) => updateDomeTransitionSettings('squinch', { legExtension })} />
                </div>
                  <label className="check-field"><input type="checkbox" checked={building.domeTransitionSettings?.squinch?.openWallArchBays === true} onChange={(event) => updateDomeTransitionSettings('squinch', { openWallArchBays: event.target.checked })} /><span>Open non-corner arch bays</span></label>
                </fieldset>}
                {building.domeTransition === 'pendentive' && <fieldset className="room-transition-settings"><legend>Pendentive transition</legend><div className="field-grid">
                  <NumberField label="Transition height · m" value={building.domeTransitionHeight ?? 1.2} min={0.2} max={10} step={0.05} onChange={(domeTransitionHeight) => setBuilding((value) => normalizeBuilding({ ...value, domeTransitionHeight }))} />
                  <NumberField label="Curvature" value={building.domeTransitionSettings?.pendentive?.curvature ?? 1.45} min={0.35} max={3} step={0.05} onChange={(curvature) => updateDomeTransitionSettings('pendentive', { curvature })} />
                  <StepperNumberField label="Surface subdivisions" value={building.domeTransitionSettings?.pendentive?.subdivisions ?? 10} min={3} max={32} step={1} onChange={(subdivisions) => updateDomeTransitionSettings('pendentive', { subdivisions })} />
                </div></fieldset>}
                {building.domeTransition === 'muqarnas' && <fieldset className="room-transition-settings"><legend>Muqarnas transition</legend>
                  <NumberField label="Transition height · m" value={building.domeTransitionHeight ?? 1.2} min={0.2} max={10} step={0.05} onChange={(domeTransitionHeight) => setBuilding((value) => normalizeBuilding({ ...value, domeTransitionHeight }))} />
                  <label><span>Muqarnas assembly from library</span><select value={roomDomeMuqarnasPlacement?.assetId || ''} onChange={(event) => setRoomDomeMuqarnasAsset(event.target.value)}>
                    <option value="">Select a Muqarnas assembly</option>
                    {muqarnasAssets.map((asset) => <option value={asset.id} key={asset.id}>{asset.name} · v{asset.currentVersion?.version_number || '—'}</option>)}
                  </select></label>
                  {!muqarnasAssets.length && <p className="empty-state">No Muqarnas assemblies are available in your library. Create or load one in the Muqarnas app first.</p>}
                  {roomDomeMuqarnasPlacement && <div className="placement-actions">
                    <button type="button" onClick={refitRoomDomeMuqarnas}><Focus size={14} /> Refit to room</button>
                    <button type="button" className="danger" onClick={() => setRoomDomeMuqarnasAsset('')}><Trash2 size={14} /> Remove</button>
                  </div>}
                </fieldset>}
                </div>}
              </div>}
              {['hall', 'grid'].includes(building.buildingType) && rightTab === 'transition' && <div className="cover-settings" role="tabpanel" data-hall-transition-settings>
                <div className="cover-settings-heading"><strong>Hall transition</strong><small>Transition above every four-vault bay</small></div>
                <div className="room-cover-toggle hall-transition-type-toggle" role="group" aria-label="Hall transition type">
                  {[['none', 'None'], ['pendentive', 'Pendentive'], ['karbandi', 'Karbandi']].map(([type, label]) => {
                    const active = type === 'none' ? building.hallTransitionEnabled === false : building.hallTransitionEnabled !== false && (building.hallTransitionType || 'pendentive') === type;
                    const disabled = type !== 'none' && ['barrel', 'rib-vault', 'raised-rib-vault'].includes(building.hallCoverType);
                    return <button type="button" key={type} className={active ? 'active' : ''} aria-pressed={active} disabled={disabled} onClick={() => selectHallTransition(type)}>{label}</button>;
                  })}
                </div>
                {building.hallCoverType === 'rib-vault' ? <p className="empty-state">Rib vault bears directly on the X and Y vault arches, so no dome transition is used.</p> : building.hallCoverType === 'raised-rib-vault' ? <>
                  <p className="empty-state">Raised rib vault uses four automatic vertical masonry walls between the supporting vaults and the raised intersecting cover.</p>
                  {renderWallBondControls('room_dome_transition_exterior', { wallSide: 'room_dome_transition', label: 'Raised transition exterior bond' })}
                  {renderWallBondControls('room_dome_transition', { wallSide: 'room_dome_transition', label: 'Raised transition interior bond' })}
                </> : <>
                {building.hallTransitionEnabled !== false ? <>
                {renderWallBondControls('room_dome_transition_exterior', { wallSide: 'room_dome_transition', label: `${building.hallTransitionType === 'karbandi' ? 'Karbandi' : 'Pendentive'} exterior bond` })}
                {renderWallBondControls('room_dome_transition', { wallSide: 'room_dome_transition', label: `${building.hallTransitionType === 'karbandi' ? 'Karbandi' : 'Pendentive'} interior bond` })}
                <p className="empty-state">The transition bearing level is calculated automatically from the highest crown of its four supporting vault arches.</p>
                </> : <p className="empty-state">Hall transitions are hidden. Vaults and the selected Hall cover remain available.</p>}
                </>}
              </div>}
              {['hall', 'grid'].includes(building.buildingType) && rightTab === 'cover' && <div className="cover-settings" role="tabpanel" data-hall-dome-settings>
                <div className="cover-settings-heading">
                  <strong className="guided-heading">
                    Hall cover
                    <HelpTooltip label="Hall cover">
                      {building.hallCoverType === 'none'
                        ? `No Hall cover is generated.${building.hallTransitionEnabled !== false ? ' The selected transition remains visible above each vault bay.' : ''}`
                        : building.hallCoverType === 'barrel'
                          ? 'One vault family generates a continuous Barrel between every parallel vault. The perpendicular vault family shifts below it, brick spandrels fill to the Barrel soffit, and columns stop beneath the lowered vault legs. X or Y swaps the complete assembly. The Barrel automatically uses the Hall vault finish, color, running bond, and vault profile height.'
                          : building.hallCoverType === 'rib-vault'
                            ? 'Two curved roofs intersect in every bay, follow the X and Y vault curves, and use the same thickness as the Hall vault profile height.'
                            : building.hallCoverType === 'raised-rib-vault'
                              ? 'The full X/Y vault intersection is retained, raised above the four vault crowns, and seated on automatic vertical transition walls.'
                              : 'A small dome is generated above each Hall bay and follows the selected Hall transition and dome settings.'}
                    </HelpTooltip>
                  </strong>
                  <small>Cover type and settings</small>
                </div>
                <div className="room-cover-toggle cover-type-icon-toggle hall-cover-type-icon-toggle" role="group" aria-label="Hall cover type">
                  {[['none', 'No cover'], ['dome', 'Dome'], ['barrel', 'Barrel'], ['rib-vault', 'Rib vault'], ['raised-rib-vault', 'Raised rib vault']].map(([type, label]) => <button type="button" key={type} className={(building.hallCoverType || 'dome') === type ? 'active' : ''} aria-pressed={(building.hallCoverType || 'dome') === type} onClick={() => selectHallCover(type)}><CoverTypeOption type={type} label={label} /></button>)}
                </div>
                {['barrel', 'rib-vault', 'raised-rib-vault'].includes(building.hallCoverType) && <ArchTypeToggle value={building.hallArch?.archType} onChange={(archType) => setBuilding((value) => normalizeBuilding({ ...value, hallArch: { ...value.hallArch, archType } }))} onDesign={() => openArchDesigner(`${building.buildingType === 'grid' ? 'Grid' : 'Hall'} ${building.hallCoverType.replaceAll('-', ' ')} arch`, Math.min(building.hallBayWidth, building.hallBayDepth), building.hallArch, (patch) => setBuilding((value) => normalizeBuilding({ ...value, hallArch: { ...value.hallArch, ...patch } })))} />}
                {building.hallCoverType === 'barrel' && <>
                  <div className="room-cover-mode-group hall-barrel-direction-controls">
                    <span>Barrel direction</span>
                    <div className="room-cover-toggle hall-two-column-toggle" role="group" aria-label="Hall Barrel direction">
                      {[['x', 'X axis'], ['y', 'Y axis']].map(([axis, label]) => <button type="button" key={axis} className={(building.hallBarrelAxis || 'x') === axis ? 'active' : ''} aria-pressed={(building.hallBarrelAxis || 'x') === axis} onClick={() => setBuilding((value) => normalizeBuilding({ ...value, hallBarrelAxis: axis }))}>{label}</button>)}
                    </div>
                  </div>
                </>}
                {building.hallCoverType === 'rib-vault' && <>
                  {renderWallBondControls('room_dome', { wallSide: 'room_dome', label: 'Rib vault exterior bond' })}
                  {renderWallBondControls('room_dome_interior', { wallSide: 'room_dome', label: 'Rib vault interior bond' })}
                  <div className="field-grid">
                    <label><span>Rib vault bricks color</span><input type="color" value={building.domeColor || '#49b5ca'} onChange={(event) => setBuilding((value) => normalizeBuilding({ ...value, domeColor: event.target.value }))} /></label>
                    <label><span>Edge line color</span><input type="color" value={building.hallRibVaultEdgeColors?.['rib-vault'] || walls.bricks.mortarColor} onChange={(event) => setBuilding((value) => normalizeBuilding({ ...value, hallRibVaultEdgeColors: { ...value.hallRibVaultEdgeColors, 'rib-vault': event.target.value } }))} /></label>
                    <label className="check-field room-exterior-columns-toggle"><input type="checkbox" checked={building.hallRibVaultCenterOpeningEnabledByCoverType?.['rib-vault'] === true} onChange={(event) => setBuilding((value) => normalizeBuilding({ ...value, hallRibVaultCenterOpeningEnabledByCoverType: { ...value.hallRibVaultCenterOpeningEnabledByCoverType, 'rib-vault': event.target.checked } }))} /><span>Cut uncovered center as square hole</span></label>
                    <NumberField label="Cover coverage · %" value={building.hallRibVaultCoverageByCoverType?.['rib-vault'] ?? 85} min={0} max={100} step={1} onChange={(coverage) => setBuilding((value) => normalizeBuilding({ ...value, hallRibVaultCoverageByCoverType: { ...value.hallRibVaultCoverageByCoverType, 'rib-vault': coverage } }))} />
                  </div>
                </>}
                {building.hallCoverType === 'raised-rib-vault' && <>
                  {renderWallBondControls('room_dome', { wallSide: 'room_dome', label: 'Raised rib vault exterior bond' })}
                  {renderWallBondControls('room_dome_interior', { wallSide: 'room_dome', label: 'Raised rib vault interior bond' })}
                  <div className="field-grid">
                    <label><span>Raised rib vault bricks color</span><input type="color" value={building.domeColor || '#49b5ca'} onChange={(event) => setBuilding((value) => normalizeBuilding({ ...value, domeColor: event.target.value }))} /></label>
                    <label><span>Edge line color</span><input type="color" value={building.hallRibVaultEdgeColors?.['raised-rib-vault'] || walls.bricks.mortarColor} onChange={(event) => setBuilding((value) => normalizeBuilding({ ...value, hallRibVaultEdgeColors: { ...value.hallRibVaultEdgeColors, 'raised-rib-vault': event.target.value } }))} /></label>
                    <label className="check-field room-exterior-columns-toggle"><input type="checkbox" checked={building.hallRibVaultCenterOpeningEnabledByCoverType?.['raised-rib-vault'] === true} onChange={(event) => setBuilding((value) => normalizeBuilding({ ...value, hallRibVaultCenterOpeningEnabledByCoverType: { ...value.hallRibVaultCenterOpeningEnabledByCoverType, 'raised-rib-vault': event.target.checked } }))} /><span>Cut uncovered center as square hole</span></label>
                    <NumberField label="Cover coverage · %" value={building.hallRibVaultCoverageByCoverType?.['raised-rib-vault'] ?? 85} min={0} max={100} step={1} onChange={(coverage) => setBuilding((value) => normalizeBuilding({ ...value, hallRibVaultCoverageByCoverType: { ...value.hallRibVaultCoverageByCoverType, 'raised-rib-vault': coverage } }))} />
                  </div>
                </>}
                {building.hallCoverType === 'dome' && <>
                  {renderWallBondControls('room_dome', { wallSide: 'room_dome', label: 'Small dome exterior bond' })}
                  {renderWallBondControls('room_dome_interior', { wallSide: 'room_dome', label: 'Small dome interior bond' })}
                   <div className="field-grid">
                   <div
                     className="field-grid arch-input-guide-grid"
                     data-hall-arch-guide-inputs="dome"
                     onFocusCapture={() => setHallInputGuide('dome')}
                     onBlurCapture={(event) => {
                       if (!event.currentTarget.contains(event.relatedTarget)) setHallInputGuide(null);
                     }}
                   >
                     <ArchTypeToggle value={building.hallDomeArch?.archType} onChange={(archType) => setBuilding((value) => normalizeBuilding({ ...value, hallDomeArch: { ...value.hallDomeArch, archType } }))} onDesign={() => openArchDesigner(`${building.buildingType === 'grid' ? 'Grid' : 'Hall'} dome arch`, Math.min(building.hallBayWidth, building.hallBayDepth), building.hallDomeArch, (patch) => setBuilding((value) => normalizeBuilding({ ...value, hallDomeArch: { ...value.hallDomeArch, ...patch } })))} />
                   </div>
                  <label className="check-field room-exterior-columns-toggle"><input type="checkbox" checked={building.domeCenterOpeningEnabled === true} onChange={(event) => setBuilding((value) => normalizeBuilding({ ...value, domeCenterOpeningEnabled: event.target.checked }))} /><span>Cut uncovered center as circular hole</span></label>
                  <NumberField label="Dome / pattern coverage · %" value={building.domePatternCoverage ?? 85} min={0} max={100} step={1} onChange={(domePatternCoverage) => setBuilding((value) => normalizeBuilding({ ...value, domePatternCoverage }))} />
                  <label><span>Dome bricks color</span><input type="color" value={building.domeColor || '#49b5ca'} onChange={(event) => setBuilding((value) => normalizeBuilding({ ...value, domeColor: event.target.value }))} /></label>
                  </div>
                </>}
              </div>}
              {rightTab === 'transition' && portalTransitionAvailable && <div className="cover-subtabs" role="tablist" aria-label="Portal transition system">
                {portalTransitionOptions.map(([type, label]) => <button
                  type="button"
                  role="tab"
                  key={type}
                  aria-selected={portalTransitionType === type}
                  className={portalTransitionType === type ? 'active' : ''}
                  onClick={() => selectPortalTransition(type)}
                >{label}</button>)}
              </div>}
              {rightTab === 'transition' && portalTransitionAvailable && portalTransitionType === 'none' && <p className="empty-state">No Portal transition selected.</p>}
              {rightTab === 'cover' && portalTransitionAvailable && <>
                <div className="room-cover-toggle cover-type-icon-toggle" role="tablist" aria-label="Portal cover system">
                  {[
                    ...(portalTransitionType === 'none' ? [
                      ['none', 'None'],
                      ['ahang', 'Barrel'],
                      ['raised-rib-vault', 'Raised rib vault'],
                    ] : [
                      ['none', 'No cover'],
                      ...(portalTransitionType === 'karbandi' ? [] : [['ahang', 'Barrel']]),
                      ['dome', 'Dome'],
                    ]),
                  ].map(([type, label]) => <button
                    type="button"
                    role="tab"
                    key={type}
                    aria-selected={portalCoverType === type}
                    className={portalCoverType === type ? 'active' : ''}
                    onClick={() => selectPortalCover(type)}
                  ><CoverTypeOption type={type === 'ahang' ? 'barrel' : type} label={label} /></button>)}
                </div>
                {portalCoverType === 'none' && <p className="empty-state" role="tabpanel">No Portal cover selected.</p>}
                {portalCoverType === 'ahang' && <div className="cover-settings" role="tabpanel">
                  <div className="cover-settings-heading"><strong className="guided-heading">Barrel settings <HelpTooltip label="Barrel settings">Barrel uses the north-wall arch and extends it across the Portal enclosure.</HelpTooltip></strong><small>Arch-based Portal cover</small></div>
                  <ArchTypeToggle value={walls.pointedArch.archType} onChange={(archType) => updateWallGroup('pointedArch', { archType })} onDesign={() => openArchDesigner('Portal Barrel arch', building.openingWidth, walls.pointedArch, (patch) => updateWallGroup('pointedArch', patch))} />
                  {renderWallBondControls('arch')}
                </div>}
                {portalCoverType === 'raised-rib-vault' && <div className="cover-settings" role="tabpanel">
                  <div className="cover-settings-heading">
                    <strong>{portalCoverType === 'raised-rib-vault' ? 'Raised rib vault' : 'Rib vault'}</strong>
                    <small>Half-bay cover developed from the Portal north-wall arch</small>
                  </div>
                  <ArchTypeToggle value={walls.pointedArch.archType} onChange={(archType) => updateWallGroup('pointedArch', { archType })} onDesign={() => openArchDesigner('Portal Raised rib vault arch', building.openingWidth, walls.pointedArch, (patch) => updateWallGroup('pointedArch', patch))} />
                  <label><span>Cover bricks color</span><input type="color" value={building.domeColor || '#49b5ca'} onChange={(event) => setBuilding((value) => normalizeBuilding({ ...value, domeColor: event.target.value }))} /></label>
                </div>}
                {portalCoverType === 'dome' && <div
                  className="cover-settings"
                  role="tabpanel"
                  ref={roomDomeArchRef}
                  data-portal-upper-cover-settings
                  data-room-dome-arch
                  onPointerDownCapture={() => sceneRef.current?.selectWallSide('room_dome', false)}
                  onFocusCapture={() => sceneRef.current?.selectWallSide('room_dome', false)}
                >
                  <div className="cover-settings-heading"><strong className="guided-heading">Dome settings <HelpTooltip label="Portal Dome settings">The green-point height is a fixed distance below the dome leg level.</HelpTooltip></strong><small>Half cover clipped at the Portal facade</small></div>
                  {renderWallBondControls('room_dome', { wallSide: 'room_dome', label: 'Dome exterior bond' })}
                  {renderWallBondControls('room_dome_interior', { wallSide: 'room_dome', label: 'Dome interior bond' })}
                  <div className="field-grid">
                    <div className="field-grid arch-input-guide-grid" data-room-dome-arch-guide-inputs>
                    <ArchTypeToggle disabled={building.innerDomeEnabled === true} value={building.domeArch?.archType} onChange={(archType) => setBuilding((value) => normalizeBuilding({ ...value, domeArch: { ...value.domeArch, archType } }))} onDesign={() => openArchDesigner('Portal dome arch', building.width, building.domeArch, (patch) => setBuilding((value) => normalizeBuilding({ ...value, domeArch: { ...value.domeArch, ...patch } })), { disabled: building.innerDomeEnabled === true })} />
                    </div>
                    <label className="check-field room-exterior-columns-toggle"><input type="checkbox" disabled={building.innerDomeEnabled === true} checked={building.domeCenterOpeningEnabled === true} onChange={(event) => setBuilding((value) => normalizeBuilding({ ...value, domeCenterOpeningEnabled: event.target.checked }))} /><span>Cut uncovered center as circular hole</span></label>
                    <NumberField label="Dome / pattern coverage · %" value={building.domePatternCoverage ?? 85} min={0} max={100} step={1} onChange={(domePatternCoverage) => setBuilding((value) => normalizeBuilding({ ...value, domePatternCoverage }))} />
                    <label><span>Cover bricks color</span><input type="color" value={building.domeColor || '#49b5ca'} onChange={(event) => setBuilding((value) => normalizeBuilding({ ...value, domeColor: event.target.value }))} /></label>
                  </div>
                  {building.innerDomeEnabled === true && <p className="empty-state">Two-layer dome · the main dome is fixed to 2 pointed, red 0 m, green 2 m, green point 2 m below the leg, with no center hole.</p>}
                </div>}
                {portalCoverType === 'dome' && portalTransitionType === 'squinch' && <fieldset
                  ref={roomDomeDrumRef}
                  data-room-dome-drum
                  data-portal-dome-drum
                  onPointerDownCapture={() => sceneRef.current?.selectWallSide('room_dome_drum', false)}
                  onFocusCapture={() => sceneRef.current?.selectWallSide('room_dome_drum', false)}
                ><legend>Portal dome drum</legend>
                  <div className="field-grid">
                    <NumberField label="Drum height · m" value={building.domeDrumHeightByTransition?.squinch ?? 0.5} min={0.05} max={10} step={0.05} onChange={(domeDrumHeight) => setBuilding((value) => normalizeBuilding({
                      ...value,
                      domeDrumHeightByTransition: {
                        ...value.domeDrumHeightByTransition,
                        squinch: domeDrumHeight,
                      },
                    }))} />
                    <label><span>Drum bricks color</span><input type="color" value={building.domeDrumColor || walls.color || '#b3a62c'} onChange={(event) => setBuilding((value) => normalizeBuilding({ ...value, domeDrumColor: event.target.value }))} /></label>
                  </div>
                  {renderWallBondControls('room_dome_drum', { wallSide: 'room_dome_drum', label: 'Drum exterior bond' })}
                  {renderWallBondControls('room_dome_drum_interior', { wallSide: 'room_dome_drum', label: 'Drum interior bond' })}
                </fieldset>}
              </>}
              {rightTab === 'transition' && portalTransitionAvailable && portalTransitionType === 'squinch' && <div
                className="cover-settings"
                role="tabpanel"
                data-portal-squinch-settings
                data-squinch-arch
                onPointerDownCapture={() => sceneRef.current?.setSquinchArchEditing(true)}
                onFocusCapture={() => sceneRef.current?.setSquinchArchEditing(true)}
                onInputCapture={() => sceneRef.current?.setSquinchArchEditing(true)}
                onChangeCapture={() => sceneRef.current?.setSquinchArchEditing(true)}
                onBlurCapture={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget)) sceneRef.current?.setSquinchArchEditing(false);
                }}
              >
                <div className="cover-settings-heading"><strong>Squinch settings</strong><small>North half of the square-room Squinch</small></div>
                <label className="check-field"><input type="checkbox" checked={building.domeTransitionCoverEnabled === true} onChange={(event) => setDomeTransitionCoverEnabled(event.target.checked)} /><span>Cover Squinch transition</span></label>
                {renderWallBondControls('room_dome_transition_exterior', { wallSide: 'room_dome_transition', label: 'Transition exterior bond' })}
                {renderWallBondControls('room_dome_transition', { wallSide: 'room_dome_transition', label: 'Transition interior bond' })}
                <fieldset className="room-transition-settings"><legend>Squinch transition · Portal half</legend><div className="field-grid">
                  <ArchTypeToggle value={building.domeTransitionSettings?.squinch?.archType} onChange={(archType) => updateDomeTransitionSettings('squinch', { archType })} onDesign={() => openArchDesigner('Portal Squinch arch', Math.min(building.width, building.depth || building.length) / 2, building.domeTransitionSettings?.squinch, (patch) => updateDomeTransitionSettings('squinch', patch))} />
                  <NumberField label="Rib band width · m" value={building.domeTransitionSettings?.squinch?.ribWidth ?? 0.1} min={0.01} max={1} step={0.01} onChange={(ribWidth) => updateDomeTransitionSettings('squinch', { ribWidth })} />
                  <NumberField label="Rib thickness · m" value={building.domeTransitionSettings?.squinch?.ribDepth ?? 0.46} min={0.01} max={1} step={0.01} onChange={(ribDepth) => updateDomeTransitionSettings('squinch', { ribDepth })} />
                  <label><span>Rib color</span><input type="color" value={building.domeTransitionSettings?.squinch?.ribColor ?? '#3490b7'} onChange={(event) => updateDomeTransitionSettings('squinch', { ribColor: event.target.value })} /></label>
                  <NumberField label="Vertical leg extension · m" value={building.domeTransitionSettings?.squinch?.legExtension ?? 1} min={0} max={10} step={0.05} onChange={(legExtension) => updateDomeTransitionSettings('squinch', { legExtension })} />
                </div>
                  <label className="check-field"><input type="checkbox" checked={building.domeTransitionSettings?.squinch?.openWallArchBays === true} onChange={(event) => updateDomeTransitionSettings('squinch', { openWallArchBays: event.target.checked })} /><span>Open non-corner arch bays</span></label>
                </fieldset>
              </div>}
              {rightTab === 'transition' && portalTransitionAvailable && portalTransitionType === 'muqarnas' && <div ref={wallArchRef} className="cover-settings" role="tabpanel" data-portal-muqarnas-settings>
                <div className="cover-settings-heading"><strong>Muqarnas settings</strong><small>Library assembly fitted beneath the Portal arch</small></div>
                <label className="check-field"><input type="checkbox" checked={walls.pointedArch.moduleInfill} onChange={(event) => updateWallGroup('pointedArch', { moduleInfill: event.target.checked })} /><span>Fill above open Muqarnas modules</span></label>
                <label><span>Muqarnas assembly</span><select value={archMuqarnasPlacement?.assetId || ''} onChange={(event) => setArchMuqarnasAsset(event.target.value)}>
                  <option value="">No Muqarnas selected</option>
                  {muqarnasAssets.map((asset) => <option value={asset.id} key={asset.id}>{asset.name} · v{asset.currentVersion?.version_number || '—'}</option>)}
                </select></label>
                {!muqarnasAssets.length && <p className="empty-state">No Muqarnas assemblies are available in your library. Create or load one in the Muqarnas app first.</p>}
                {archMuqarnasPlacement && <>
                  <fieldset><legend>Muqarnas position · metres</legend><div className="field-grid three">{['X', 'Y', 'Z'].map((axis, index) => <NumberField key={axis} label={axis} value={archMuqarnasPlacement.transform?.position?.[index] ?? 0} min={-20} max={20} step={0.05} onChange={(value) => updateArchMuqarnasVector('position', index, value)} />)}</div></fieldset>
                  <fieldset><legend>Muqarnas rotation · degrees</legend><div className="field-grid three">{['X', 'Y', 'Z'].map((axis, index) => <NumberField key={axis} label={axis} value={archMuqarnasPlacement.transform?.rotation?.[index] ?? 0} min={-360} max={360} step={1} onChange={(value) => updateArchMuqarnasVector('rotation', index, value)} />)}</div></fieldset>
                  <fieldset><legend>Muqarnas dimensions · metres</legend><div className="field-grid three">{['Width', 'Height', 'Depth'].map((label, index) => <NumberField key={label} label={label} value={Number((archMuqarnasDimensions?.[index] || 0).toFixed(3))} min={0.05} max={100} step={0.05} onChange={(value) => updateArchMuqarnasDimension(index, value)} />)}</div></fieldset>
                  <label className="check-field"><input type="checkbox" checked={archMuqarnasPlacement.options?.keepAspectRatio !== false} onChange={(event) => setArchMuqarnasKeepAspectRatio(event.target.checked)} /><span>Keep aspect ratio</span></label>
                  <div className="placement-actions">
                    <button type="button" onClick={refitArchMuqarnas}><Focus size={14} /> Refit under arch</button>
                    <button type="button" className="danger" onClick={deleteArchMuqarnas}><Trash2 size={14} /> Delete Muqarnas</button>
                  </div>
                </>}
              </div>}
              {((rightTab === 'transition' && portalTransitionAvailable && portalTransitionType === 'karbandi')
                || (rightTab === 'transition' && roomTransitionAvailable && building.domeTransition === 'karbandi')
                || (rightTab === 'transition'
                  && ['hall', 'grid'].includes(building.buildingType)
                  && building.hallTransitionEnabled !== false
                  && building.hallTransitionType === 'karbandi'
                  && !['barrel', 'rib-vault', 'raised-rib-vault'].includes(building.hallCoverType))) && <div
                className="cover-settings"
                role="tabpanel"
                data-karbandi-settings
                onFocusCapture={(event) => {
                  if (event.target.matches('input, select, textarea') && !event.target.matches('[data-karbandi-guide-toggle]')) {
                    sceneRef.current?.setKarbandiReferenceEditing(true);
                    sceneRef.current?.setKarbandiRibArchEditing(Boolean(event.target.closest('[data-karbandi-arch]')));
                  }
                }}
                onInputCapture={(event) => {
                  if (event.target.matches('input, select, textarea') && !event.target.matches('[data-karbandi-guide-toggle]')) sceneRef.current?.setKarbandiReferenceEditing(true);
                }}
                onChangeCapture={(event) => {
                  if (event.target.matches('input, select, textarea') && !event.target.matches('[data-karbandi-guide-toggle]')) sceneRef.current?.setKarbandiReferenceEditing(true);
                }}
                onBlurCapture={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget)) {
                    sceneRef.current?.setKarbandiReferenceEditing(false);
                    sceneRef.current?.setKarbandiRibArchEditing(false);
                  }
                }}
              >
                <div className="cover-settings-heading"><strong className="guided-heading">Karbandi settings <HelpTooltip label="Karbandi settings">Configure the roof finish, reference rib network, rib arch construction, and final assembly transform. Use each section’s question mark for detailed guidance.</HelpTooltip></strong><small>{['hall', 'grid'].includes(building.buildingType) ? `Repeated in every ${building.buildingType === 'grid' ? 'Grid' : 'Hall'} transition bay` : portalTransitionAvailable ? 'Rotating rib-vault Portal transition' : 'Rotating rib-vault cover'}</small></div>
                <fieldset className="karbandi-roof-fieldset"><legend><span className="fieldset-legend-label">Roof <HelpTooltip label="Karbandi roof">Enable the roof cover, then choose either the brick infill pattern or a solid gypsum finish and its colors.</HelpTooltip></span></legend>
                  {(building.type !== 'room' || ['hall', 'grid'].includes(building.buildingType)) && <label className="check-field roof-cover-check"><input type="checkbox" checked={walls.karbandi?.coverEnabled === true} disabled={!['hall', 'grid'].includes(building.buildingType) && walls.karbandi?.enabled !== true} onChange={(event) => updateWallGroup('karbandi', { coverEnabled: event.target.checked })} /><span>Cover Karbandi roof</span></label>}
                  <label><span>Roof finish</span><select value={walls.karbandi?.coverFinish ?? 'bricks'} onChange={(event) => updateWallGroup('karbandi', { coverFinish: event.target.value })}><option value="bricks">Bricks</option><option value="solid">Gypsum · solid color</option></select></label>
                  {walls.karbandi?.coverFinish === 'solid' && <label><span>Gypsum color</span><input type="color" value={walls.karbandi?.coverColor ?? '#eee8dc'} onChange={(event) => updateWallGroup('karbandi', { coverColor: event.target.value })} /></label>}
                    {walls.karbandi?.coverFinish === 'bricks' && <label><span>Roof infill brick color</span><input type="color" value={walls.karbandi?.web?.infillBrickColor ?? DEFAULT_WALL_SYSTEM.karbandi.web.infillBrickColor} onChange={(event) => updateKarbandiWeb({ infillBrickColor: event.target.value })} /></label>}
                    {walls.karbandi?.coverFinish === 'bricks' && <label><span>Alternate infill brick color</span><input type="color" value={walls.karbandi?.web?.infillBrickColor2 ?? '#9f663b'} onChange={(event) => updateKarbandiWeb({ infillBrickColor2: event.target.value })} /></label>}
                    {walls.karbandi?.coverFinish === 'bricks' && <NumberField label="Roof infill brick height · m" value={walls.karbandi?.web?.infillBrickHeight ?? 0.06} min={0.01} max={0.5} step={0.005} onChange={(infillBrickHeight) => updateKarbandiWeb({ infillBrickHeight })} />}
                    <StepperNumberField label="South/east/west roof boundary offset · m" value={walls.karbandi?.web?.wallRoofBoundaryOffset ?? -0.07} min={-1} max={1} step={0.01} onChange={(wallRoofBoundaryOffset) => updateKarbandiWeb({ wallRoofBoundaryOffset })} />
                </fieldset>
                <fieldset className="karbandi-ribs-fieldset"><legend><span className="fieldset-legend-label">Ribs <HelpTooltip label="Karbandi ribs">Design one reference rib, then Mehraz rotates it around the Portal north-wall exterior center or the Room center. Auto clipping trims unsupported legs back to their first rib intersection. The rotation guide draws the leg circle and division points, reveals clipped portions at 30% opacity, colors wall-supported ribs orange, and keeps the reference highlight above orange.</HelpTooltip></span></legend>
                <div className="room-cover-mode-group">
                  <span>Wall leg solution</span>
                  <div className="karbandi-solution-selector">
                    <div className={`room-cover-toggle hall-two-column-toggle${building.buildingType === 'vestibule' ? ' vestibule-leg-toggle' : ''}`} role="group" aria-label="Karbandi wall leg solution">
                      {(building.buildingType === 'vestibule' ? [['two', '2 Leg']] : [['two', '2 Leg'], ['one', '1 Leg']]).map(([mode, label]) => <button
                        type="button"
                        key={mode}
                        className={(walls.karbandi?.wallLegMode || 'two') === mode ? 'active' : ''}
                        aria-pressed={(walls.karbandi?.wallLegMode || 'two') === mode}
                        disabled={building.buildingType === 'vestibule'}
                        title={mode === 'two'
                          ? 'Two bearing legs per square wall; eight total'
                          : 'Recalculate the folded ribs below 180° and snap one bearing to each square-room corner'}
                        onClick={() => updateKarbandiDesign({ wallLegMode: mode })}
                      >{label}</button>)}
                    </div>
                    <span className="karbandi-solution-stepper" role="group" aria-label="Karbandi solution">
                      <button type="button" tabIndex={-1} data-karbandi-input-control aria-label={`Next Karbandi ${walls.karbandi?.wallLegMode === 'one' ? '1 Leg' : '2 Leg'} solution`} title="Next solution" onClick={() => stepKarbandiSolution(1)}>▲</button>
                      <button type="button" tabIndex={-1} data-karbandi-input-control aria-label={`Previous Karbandi ${walls.karbandi?.wallLegMode === 'one' ? '1 Leg' : '2 Leg'} solution`} title="Previous solution" onClick={() => stepKarbandiSolution(-1)}>▼</button>
                    </span>
                  </div>
                </div>
                <div className="placement-actions">
                  <button type="button" className={walls.karbandi?.autoClip !== false ? 'primary' : ''} onClick={() => updateWallGroup('karbandi', { autoClip: true })}>{walls.karbandi?.autoClip !== false ? 'Auto clipping on' : 'Auto clip ribs'}</button>
                  <button type="button" onClick={() => updateWallGroup('karbandi', { autoClip: false })}>Reset auto clips</button>
                </div>
                <div className="field-grid">
                  <label><span>Rib color</span><input type="color" value={walls.karbandi?.ribColor ?? walls.color} onChange={(event) => updateWallGroup('karbandi', { ribColor: event.target.value })} /></label>
                  <label><span>Reference rib highlight</span><input type="color" value={walls.karbandi?.referenceRibColor ?? DEFAULT_WALL_SYSTEM.karbandi.referenceRibColor} onChange={(event) => updateWallGroup('karbandi', { referenceRibColor: event.target.value })} /></label>
                  <StepperNumberField label="Rib band width · m" value={walls.karbandi?.ribWidth ?? DEFAULT_WALL_SYSTEM.karbandi.ribWidth} min={0.01} max={2} step={0.01} onChange={(ribWidth) => updateKarbandiDesign({ ribWidth })} />
                  <StepperNumberField label="Rib depth · m" value={walls.karbandi?.ribDepth ?? DEFAULT_WALL_SYSTEM.karbandi.ribDepth} min={0.01} max={2} step={0.01} onChange={(ribDepth) => updateKarbandiDesign({ ribDepth })} />
                  <StepperNumberField label="Rib count" value={walls.karbandi?.ribCount ?? DEFAULT_WALL_SYSTEM.karbandi.ribCount} min={8} max={64} step={4} onChange={(ribCount) => updateKarbandiDesign({ ribCount })} />
                  <StepperNumberField label="Reference rib angle · degrees" value={walls.karbandi?.referenceAngle ?? DEFAULT_WALL_SYSTEM.karbandi.referenceAngle} min={1} max={walls.karbandi?.wallLegMode === 'one' ? 179 : 359} step={1} onChange={(referenceAngle) => updateKarbandiDesign({ referenceAngle })} />
                  <StepperNumberField label="Reference move Z · m" value={walls.karbandi?.referenceZ ?? DEFAULT_WALL_SYSTEM.karbandi.referenceZ} min={0.001} max={40} step={0.01} onChange={(referenceZ) => updateKarbandiDesign({ referenceZ })} />
                  <StepperNumberField label="Reference rotation · degrees" value={walls.karbandi?.referenceRotation ?? DEFAULT_WALL_SYSTEM.karbandi.referenceRotation} min={-360} max={360} step={1} onChange={(referenceRotation) => updateKarbandiDesign({ referenceRotation })} />
                </div>
                </fieldset>
                <fieldset
                  data-karbandi-arch
                  onPointerDownCapture={() => {
                    sceneRef.current?.setKarbandiReferenceEditing(true);
                    sceneRef.current?.setKarbandiRibArchEditing(true);
                  }}
                  onFocusCapture={() => {
                    sceneRef.current?.setKarbandiReferenceEditing(true);
                    sceneRef.current?.setKarbandiRibArchEditing(true);
                  }}
                  onInputCapture={() => sceneRef.current?.setKarbandiRibArchEditing(true)}
                  onChangeCapture={() => sceneRef.current?.setKarbandiRibArchEditing(true)}
                ><legend><span className="fieldset-legend-label">Rib arch <HelpTooltip label="Karbandi rib arch">The red circles form the lower rib arch; the green circles continue through the tangent points to the crown.</HelpTooltip></span></legend><div className="field-grid">
                  <ArchTypeToggle value={walls.karbandi?.archType} onChange={(archType) => updateWallGroup('karbandi', { archType })} onDesign={() => openArchDesigner('Karbandi rib arch', walls.karbandi?.span ?? DEFAULT_WALL_SYSTEM.karbandi.span, walls.karbandi, (patch) => updateWallGroup('karbandi', patch), { spanEditable: true })} />
                </div></fieldset>
                <fieldset><legend><span className="fieldset-legend-label">Whole Karbandi transform <HelpTooltip label="Whole Karbandi transform">Move, rotate, or uniformly scale the complete Karbandi assembly after the reference rib and clipping have been calculated. When a design input changes, Move Y places the shared rib-leg base centers exactly at wall-top level and Move Z selects the nearest valid interior-wall seating solution. Manual Move Y and Move Z edits remain available afterward.</HelpTooltip></span></legend><div className="field-grid">
                  <NumberField label="Move Y · m" value={walls.karbandi?.groupY ?? DEFAULT_WALL_SYSTEM.karbandi.groupY} min={-40} max={40} step={0.05} onChange={(groupY) => updateWallGroup('karbandi', { groupY })} />
                  <NumberField label="Move Z · m" value={walls.karbandi?.groupZ ?? DEFAULT_WALL_SYSTEM.karbandi.groupZ} min={-40} max={40} step={0.05} onChange={(groupZ) => updateWallGroup('karbandi', { groupZ })} />
                </div></fieldset>
              </div>}
            </section>
          )}

          {rightTab === 'lights' && (
            <section className="inspector-section night-controls">
              <div className="section-heading"><Lightbulb size={17} /><div><strong>Night lights</strong><small>Stage preview and export spotlights</small></div></div>
              <CollapsiblePanel collapsible={false} title="Spotlight setup" guide="Add spotlights and enable placement guides, then drag either the light source or its red aiming point directly in the stage.">
                <label className="check-field"><input type="checkbox" checked={nightLighting.preview} onChange={(event) => sceneRef.current?.setNightPreview(event.target.checked)} /><span>Night stage preview</span></label>
                <label className="check-field"><input type="checkbox" checked={nightLighting.guides} onChange={(event) => sceneRef.current?.setNightLightGuidesVisible(event.target.checked)} /><span>Placement guides</span></label>
                <div className="light-preset-grid">
                  <button type="button" className="primary" onClick={() => sceneRef.current?.applyNightLightPreset('hero')}>Hero shot</button>
                  <button type="button" onClick={() => sceneRef.current?.applyNightLightPreset('warmInterior')}>Warm interior</button>
                  <button type="button" onClick={() => sceneRef.current?.applyNightLightPreset('dramaticRake')}>Dramatic rake</button>
                </div>
                <div className="placement-actions">
                  <button className="primary" onClick={() => sceneRef.current?.addNightLight()}><Plus size={14} /> Add spotlight</button>
                  <button className="danger" disabled={!selectedNightLight} onClick={() => sceneRef.current?.removeNightLight(selectedNightLight.id)}><Trash2 size={14} /> Remove</button>
                </div>
                {!!nightLighting.lights.length && <label><span>Selected spotlight</span><select value={nightLighting.selectedId || ''} onChange={(event) => sceneRef.current?.selectNightLight(event.target.value)}>{nightLighting.lights.map((light) => <option value={light.id} key={light.id}>{light.name}</option>)}</select></label>}
              </CollapsiblePanel>
              {selectedNightLight && (
                <CollapsiblePanel collapsible={false} title="Selected spotlight">
                  <label className="check-field"><input type="checkbox" checked={selectedNightLight.enabled} onChange={(event) => sceneRef.current?.updateNightLight(selectedNightLight.id, { enabled: event.target.checked })} /><span>Light enabled</span></label>
                  <div className="color-grid">
                    <label><span>Light color</span><input type="color" value={selectedNightLight.color} onChange={(event) => sceneRef.current?.updateNightLight(selectedNightLight.id, { color: event.target.value })} /></label>
                  </div>
                  <div className="placement-actions">
                    <button onClick={() => sceneRef.current?.placeNightLightAtCamera(selectedNightLight.id)}>Use camera position</button>
                    <button onClick={() => sceneRef.current?.aimNightLightAtModelCenter(selectedNightLight.id)}>Aim at model center</button>
                  </div>
                  <fieldset><legend>Light position Â· metres</legend><div className="field-grid three">{['X', 'Y', 'Z'].map((axis, index) => <NumberField key={axis} label={axis} value={selectedNightLight.position[index]} min={-40} max={40} step={0.05} onChange={(value) => updateNightLightVector('position', index, value)} />)}</div></fieldset>
                  <fieldset><legend>Aim target Â· metres</legend><div className="field-grid three">{['X', 'Y', 'Z'].map((axis, index) => <NumberField key={axis} label={axis} value={selectedNightLight.target[index]} min={-40} max={40} step={0.05} onChange={(value) => updateNightLightVector('target', index, value)} />)}</div></fieldset>
                  <div className="field-grid">
                    <NumberField label="Intensity Â· cd" value={selectedNightLight.intensity} min={1} max={1000} step={1} onChange={(intensity) => sceneRef.current?.updateNightLight(selectedNightLight.id, { intensity })} />
                    <NumberField label="Beam angle Â· degrees" value={selectedNightLight.angle} min={5} max={85} step={1} onChange={(angle) => sceneRef.current?.updateNightLight(selectedNightLight.id, { angle })} />
                    <NumberField label="Beam softness" value={selectedNightLight.penumbra} min={0} max={1} step={0.05} onChange={(penumbra) => sceneRef.current?.updateNightLight(selectedNightLight.id, { penumbra })} />
                    <NumberField label="Light range Â· m" value={selectedNightLight.distance} min={0.5} max={60} step={0.5} onChange={(distance) => sceneRef.current?.updateNightLight(selectedNightLight.id, { distance })} />
                  </div>
                </CollapsiblePanel>
              )}
            </section>
          )}

          {rightTab === 'placement' && (
            <section className="inspector-section">
              <div className="section-heading"><Layers3 size={17} /><div><strong>{selectedPlacement ? selectedPlacement.name : 'Placement'}</strong><small>{selectedPlacement ? `Version ${selectedPlacement.assetVersionNumber} pinned` : 'Placed design controls'}</small></div></div>
              {!selectedPlacement ? <p className="empty-state">Select a placed design in the stage.</p> : (
                <>
                  <CollapsiblePanel open={!collapsedSections.placementBasics} onToggle={() => toggleSection('placementBasics')} title="Placement basics">
                    <label><span>Surface</span><select value={selectedPlacement.surfaceId} onChange={(event) => changePlacementSurface(event.target.value)}>{surfaces.map((surface) => <option value={surface.id} key={surface.id}>{surface.label}</option>)}</select></label>
                    <label><span>Construction assembly</span><select value={assemblyByPlacement.get(selectedPlacement.id)?.id || ''} onChange={(event) => assignSelectedPlacementToAssembly(event.target.value)}><option value="">Unassigned</option>{assemblies.map((assembly) => <option value={assembly.id} key={assembly.id}>{assembly.name}</option>)}</select></label>
                    <div className="placement-actions">
                      <button onClick={centerSelectedPlacement}><Focus size={14} /> Center</button>
                      <button onClick={fitSelectedPlacement}><ScanLine size={14} /> Fit surface</button>
                    </div>
                    {selectedZone && <button onClick={fitSelectedPlacementToZone}><ScanLine size={14} /> Fit to â€œ{selectedZone.name}â€</button>}
                  </CollapsiblePanel>
                  <CollapsiblePanel open={!collapsedSections.placementSnapping} onToggle={() => toggleSection('placementSnapping')} title="Architectural snapping">
                    <label className="check-field"><input type="checkbox" checked={selectedPlacement.options?.constrain !== false} onChange={(event) => updatePlacementOptions({ constrain: event.target.checked })} /><span>Keep attached to surface</span></label>
                    <label><span>Grid increment</span><select value={selectedPlacement.options?.snap ?? 0.1} onChange={(event) => updatePlacementOptions({ snap: Number(event.target.value) })}><option value="0">Off Â· free position</option><option value="0.05">5 cm</option><option value="0.1">10 cm</option><option value="0.25">25 cm</option><option value="0.5">50 cm</option></select></label>
                  </CollapsiblePanel>
                  <CollapsiblePanel open={!collapsedSections.placementTransform} onToggle={() => toggleSection('placementTransform')} title="Transform">
                    <fieldset><legend>Position Â· metres</legend><div className="field-grid three">{['X', 'Y', 'Z'].map((axis, index) => <NumberField key={axis} label={axis} value={selectedPlacement.transform.position[index]} step={0.05} onChange={(value) => updateTransform('position', index, value)} />)}</div></fieldset>
                    <fieldset><legend>Rotation Â· degrees</legend><div className="field-grid three">{['X', 'Y', 'Z'].map((axis, index) => <NumberField key={axis} label={axis} value={selectedPlacement.transform.rotation[index]} step={5} onChange={(value) => updateTransform('rotation', index, value)} />)}</div></fieldset>
                    <fieldset><legend>Scale</legend><NumberField label="Uniform" value={selectedPlacement.transform.scale[0]} min={0.1} max={20} step={0.1} onChange={(value) => updateSelectedPlacement({ transform: { ...selectedPlacement.transform, scale: [value, value, value] } })} /></fieldset>
                  </CollapsiblePanel>
                  <CollapsiblePanel open={!collapsedSections.placementRepeat} onToggle={() => toggleSection('placementRepeat')} title="Repeat array">
                    <div className="field-grid">
                      <NumberField label="Columns" value={repeatOptions.columns} min={1} max={20} step={1} onChange={(columns) => setRepeatOptions((value) => ({ ...value, columns }))} />
                      <NumberField label="Rows" value={repeatOptions.rows} min={1} max={20} step={1} onChange={(rows) => setRepeatOptions((value) => ({ ...value, rows }))} />
                      <NumberField label="Horizontal spacing" value={repeatOptions.spacingU} min={0.1} max={20} step={0.1} onChange={(spacingU) => setRepeatOptions((value) => ({ ...value, spacingU }))} />
                      <NumberField label="Vertical spacing" value={repeatOptions.spacingV} min={0.1} max={20} step={0.1} onChange={(spacingV) => setRepeatOptions((value) => ({ ...value, spacingV }))} />
                    </div>
                    <button className="repeat-button" onClick={repeatSelectedPlacement}><Boxes size={14} /> Create repeated placements</button>
                  </CollapsiblePanel>
                  <button className="danger" onClick={deleteSelectedPlacement}><Trash2 size={15} /> Remove placement</button>
                </>
              )}
            </section>
          )}

          {rightTab === 'context' && selectedZone && (
            <section className="inspector-section">
              <div className="section-heading"><ScanLine size={17} /><div><strong>{selectedZone.name}</strong><small>Selected zone settings</small></div></div>
              <CollapsiblePanel collapsible={false} title="Zone properties" guide={<>Zones own their decoration: choose the wall, size the zone, then assign a Girih or brick pattern. {selectedZone.assetId ? <>The currently assigned pattern, <strong>{selectedZone.assetName || zonePatternAssets.find((asset) => asset.id === selectedZone.assetId)?.name || 'Library pattern'}</strong>, is automatically tessellated inside these bounds.</> : 'No library pattern is currently assigned.'}</>}>
                  <label><span>Zone name</span><input value={selectedZone.name} maxLength={80} onChange={(event) => updateSelectedZone({ name: event.target.value })} /></label>
                  <label><span>Surface</span><select value={selectedZone.surfaceId} onChange={(event) => changeZoneSurface(event.target.value)}>{surfaces.map((surface) => <option value={surface.id} key={surface.id}>{surface.label}</option>)}</select></label>
                  <label><span>Library pattern</span><select value={selectedZone.assetId || ''} onChange={(event) => assignPatternToSelectedZone(event.target.value)}>
                    <option value="">No pattern assigned</option>
                    {zonePatternAssets.map((asset) => <option value={asset.id} key={asset.id}>{asset.name} · {ASSET_LABELS[asset.asset_type]}</option>)}
                  </select></label>
                  {selectedZone.assetId && (
                    <fieldset>
                      <legend>Pattern transform</legend>
                      <div className="field-grid">
                        <NumberField label="Pattern scale" value={selectedZone.patternScale ?? 1} min={0.05} max={20} step={0.05} onChange={(patternScale) => updateSelectedZone({ patternScale: Math.max(0.05, Math.min(20, patternScale)) })} />
                        <NumberField label="Move horizontal · m" value={selectedZone.patternOffsetU ?? 0} min={-100} max={100} step={0.01} onChange={(patternOffsetU) => updateSelectedZone({ patternOffsetU })} />
                        <NumberField label="Move vertical · m" value={selectedZone.patternOffsetV ?? 0} min={-100} max={100} step={0.01} onChange={(patternOffsetV) => updateSelectedZone({ patternOffsetV })} />
                      </div>
                    </fieldset>
                  )}
                  {selectedZone.surfaceId !== 'floor' && <label className="check-field"><input type="checkbox" checked={selectedZone.soldierCourses === true} onChange={(event) => updateSelectedZone({ soldierCourses: event.target.checked })} /><span>Top and bottom soldier brick courses</span></label>}
                  <fieldset>
                    <legend>Zone bounds Â· metres</legend>
                    <div className="field-grid">
                      <NumberField label="Horizontal center" value={selectedZone.bounds.u} step={0.1} onChange={(value) => updateZoneBounds('u', value)} />
                      <NumberField label={selectedZone.surfaceId === 'floor' ? 'Depth center' : 'Height center · brick step'} value={selectedZone.bounds.v} step={selectedZone.surfaceId === 'floor' ? 0.1 : zoneBrickHeightStep(walls)} onChange={(value) => updateZoneBounds('v', value)} />
                      <NumberField label="Width" value={selectedZone.bounds.width} min={0.2} max={30} step={0.1} onChange={(value) => updateZoneBounds('width', value)} />
                      <NumberField label={selectedZone.surfaceId === 'floor' ? 'Height' : 'Height · brick courses'} value={selectedZone.bounds.height} min={selectedZone.surfaceId === 'floor' ? 0.2 : zoneBrickHeightStep(walls)} max={20} step={selectedZone.surfaceId === 'floor' ? 0.1 : zoneBrickHeightStep(walls)} onChange={(value) => updateZoneBounds('height', value)} />
                    </div>
                  </fieldset>
                  <div className="color-grid">
                    <label><span>Guide color</span><input type="color" value={selectedZone.color} onChange={(event) => updateSelectedZone({ color: event.target.value })} /></label>
                    <NumberField label="Guide opacity" value={selectedZone.opacity} min={0.04} max={0.5} step={0.02} onChange={(opacity) => updateSelectedZone({ opacity })} />
                  </div>
                  <button className="danger" onClick={deleteSelectedZone}><Trash2 size={15} /> Delete zone</button>
              </CollapsiblePanel>
            </section>
          )}

          {rightTab === 'construction' && (
            <section className="inspector-section">
              <div className="section-heading"><ClipboardList size={17} /><div><strong>Construction training</strong><small>Step-by-step shell and arch assembly</small></div></div>
              <CollapsiblePanel collapsible={false} title="Animation steps" guide={constructionGuide}>
                <div className="field-grid">
                  <NumberField label="Animation duration Â· sec" value={constructionDuration} min={3} max={90} step={1} onChange={setConstructionDuration} />
                  <label><span>Current step</span><select value={constructionStep} onChange={(event) => showConstructionStep(Number(event.target.value))}>{displayedConstructionSteps.map((step, displayIndex) => <option value={step.index} key={step.id}>{displayIndex + 1}. {step.title}</option>)}</select></label>
                </div>
                <div className="placement-actions construction-actions">
                  <button className="primary" onClick={playConstructionSteps} disabled={constructionPlaying}><Plus size={14} /> Play animation</button>
                  <button onClick={stopConstructionSteps} disabled={!constructionPlaying}>Stop and complete</button>
                  <button onClick={showCompleteConstruction}>Show complete model</button>
                  <button onClick={resetConstructionStepOrder} disabled={constructionPlaying}>Reset order</button>
                </div>
                <p className="construction-order-help">Drag any construction phase to change the training sequence. The empty start and completed model remain fixed; your order is saved with the project.</p>
                <div ref={constructionStepListRef} className="construction-step-list">
                  {displayedConstructionSteps.map((step, displayIndex) => (
                    <div
                      key={step.id}
                      data-construction-step={step.index}
                      className={`construction-step-item ${step.index === constructionStep ? 'active' : ''} ${['empty', 'complete'].includes(step.id) ? 'fixed' : ''}`}
                      draggable={!constructionPlaying && !['empty', 'complete'].includes(step.id)}
                      role="button"
                      tabIndex={0}
                      aria-current={step.index === constructionStep ? 'step' : undefined}
                      onClick={() => showConstructionStep(step.index)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          showConstructionStep(step.index);
                        }
                      }}
                      onDragStart={(event) => {
                        draggedConstructionStepRef.current = step.id;
                        event.dataTransfer.effectAllowed = 'move';
                        event.dataTransfer.setData('text/plain', step.id);
                      }}
                      onDragOver={(event) => {
                        event.preventDefault();
                        event.dataTransfer.dropEffect = 'move';
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        moveConstructionStep(
                          draggedConstructionStepRef.current || event.dataTransfer.getData('text/plain'),
                          step.id,
                        );
                        draggedConstructionStepRef.current = null;
                      }}
                      onDragEnd={() => { draggedConstructionStepRef.current = null; }}
                    >
                      <GripVertical className="construction-step-grip" size={14} aria-hidden="true" />
                      <span>{displayIndex + 1}</span>
                      <div><strong>{step.title}</strong><small>{step.detail}</small></div>
                    </div>
                  ))}
                </div>
              </CollapsiblePanel>
            </section>
          )}

          {rightTab === 'project' && (
            <section className="inspector-section">
              <div className="section-heading"><Save size={17} /><div><strong>Mehraz project</strong><small>Architectural shell + pinned assets</small></div></div>
              <CollapsiblePanel collapsible={false} title="Project library">
                <label><span>Project name</span><input value={projectName} maxLength={120} onChange={(event) => setProjectName(event.target.value)} /></label>
                <button className="primary" disabled={!user || libraryBusy || !projectName.trim()} onClick={saveProjectToLibrary}><Save size={15} /> {activeProjectAssetId ? 'Save new version' : 'Save to library'}</button>
                <div className="project-list">
                  {projects.map((project) => {
                    const versions = projectVersionsById[project.id] || [];
                    return (
                      <div className={`project-entry ${project.id === activeProjectAssetId ? 'active' : ''}`} key={project.id}>
                        <div className="project-row">
                          <button className="project-open" onClick={() => openProject(project)}>
                            <span className="project-thumbnail">
                              {project.thumbnailUrl || project.currentVersion?.payload?.previewImage || project.currentVersion?.payload?.thumbnail
                                ? <img src={project.thumbnailUrl || project.currentVersion.payload.previewImage || project.currentVersion.payload.thumbnail} alt="" />
                                : <Building2 size={20} />}
                            </span>
                            <span className="project-copy">
                              <strong>{project.name}</strong>
                              <small>Current v{project.currentVersion?.version_number || '-'} · {versions.length ? `${versions.length} versions loaded` : 'history loads on demand'}</small>
                            </span>
                            <FolderOpen size={15} />
                          </button>
                          <button type="button" className="project-add" title={`Add ${project.name} to the stage`} disabled={libraryBusy || editingProjectInstance != null} onClick={() => addProjectToStage(project)}><Plus size={13} /> Add</button>
                          <button type="button" className="danger" title={`Delete ${project.name}`} disabled={libraryBusy} onClick={() => deleteProject(project)}><Trash2 size={13} /></button>
                        </div>
                      </div>
                    );
                  })}
                  {!libraryBusy && !projects.length && <p className="empty-state">No Mehraz projects saved yet.</p>}
                  {libraryHasMore && <button type="button" disabled={libraryLoadingMore} onClick={() => refreshLibrary({ append: true, silent: true })}>{libraryLoadingMore ? 'Loading…' : 'Load more projects and assets'}</button>}
                </div>
                {activeProject && (
                  <div className="project-version-form">
                    <div className="project-version-form-heading">
                      <span><strong>{activeProject.name}</strong><small>Loaded version {activeProjectVersions.find((version) => version.id === activeProjectVersionId)?.version_number || '-'}</small></span>
                      <em>Current v{activeProject.currentVersion?.version_number || '-'}</em>
                    </div>
                    <label>
                      <span>Project version</span>
                      <select value={selectedProjectVersionId} onChange={(event) => setSelectedProjectVersionId(event.target.value)}>
                        {activeProjectVersions.map((version) => (
                          <option value={version.id} key={version.id}>
                            Version {version.version_number}{version.id === activeProject.current_version_id ? ' - Current' : ''} · {version.metadata?.placementCount ?? '—'} placements
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="field-grid">
                      <NumberField label="Versions to keep" value={projectVersionRetention} min={1} max={100} step={1} onChange={setProjectVersionRetention} />
                      <button type="button" disabled={libraryBusy} onClick={updateProjectVersionRetention}>Apply retention</button>
                    </div>
                    <div className="project-version-form-actions">
                      <button type="button" disabled={!selectedProjectVersion || libraryBusy} onClick={() => openProject(activeProject, selectedProjectVersion)}><FolderOpen size={14} /> Load version</button>
                      <button type="button" disabled={!selectedProjectVersion || libraryBusy || editingProjectInstance != null} onClick={() => addProjectToStage(activeProject, selectedProjectVersion)}><Plus size={14} /> Add</button>
                      <button type="button" className="primary" disabled={!selectedProjectVersion || selectedProjectVersion.id === activeProject.current_version_id || libraryBusy} onClick={makeProjectVersionCurrent}><Save size={14} /> Set as current</button>
                    </div>
                  </div>
                )}
                {selectedProjectInstanceId && !editingProjectInstance && (() => {
                  const instance = projectInstances.find((item) => item.id === selectedProjectInstanceId);
                  return instance ? <div className="project-instance-selection">
                    <span><strong>{instance.name}</strong><small>Locked group · version {instance.versionNumber || '-'}</small></span>
                    <div>
                      <button type="button" onClick={() => openProjectInstanceForEditing(instance.id)}><Focus size={14} /> Edit isolated</button>
                      <button type="button" className="danger" onClick={() => {
                        setProjectInstances((items) => items.filter((item) => item.id !== instance.id));
                        setSelectedProjectInstanceId(null);
                        sceneRef.current?.clearSelection();
                      }}><Trash2 size={14} /> Delete</button>
                    </div>
                  </div> : null;
                })()}
                <div className="project-summary"><span><strong>{projectInstances.length}</strong> added projects</span><span><strong>{assemblies.length}</strong> assemblies</span><span><strong>{placements.length}</strong> placements</span><span><strong>{new Set(placements.map((item) => item.assetVersionId)).size}</strong> pinned assets</span></div>
              </CollapsiblePanel>
            </section>
          )}
        </aside>
        </div>
      </main>

      {exportOpen && (
        <div className="export-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setExportOpen(false);
        }}>
          <section className="export-dialog" role="dialog" aria-modal="true" aria-label="Export Mehraz project">
            <header>
              <div><small>Production output</small><h2>Export architectural view</h2></div>
              <button title="Close export" onClick={() => setExportOpen(false)}><X size={17} /></button>
            </header>
            <div className="export-body">
              <div
                className={`export-preview ${exportOptions.format === 'mp4' ? 'video' : exportOptions.orientation}`}
                onPointerDown={startExportPan}
                onPointerMove={moveExportPan}
                onPointerUp={() => { exportPanRef.current = null; }}
                onPointerCancel={() => { exportPanRef.current = null; }}
                onPointerLeave={() => { exportPanRef.current = null; }}
                onDoubleClick={() => setExportOptions((value) => ({ ...value, zoom: 1, panX: 0, panY: 0 }))}
                onWheel={(event) => {
                  event.preventDefault();
                  setExportOptions((value) => ({ ...value, zoom: Math.max(0.5, Math.min(5, value.zoom * (event.deltaY > 0 ? 0.9 : 1.1))) }));
                }}
              >
                {exportPreview ? <img src={exportPreview} alt="Mehraz export preview" draggable="false" /> : <span>Preparing previewâ€¦</span>}
                <small>{exportOptions.format === 'mp4' ? 'Orbit preview Â· one complete round' : 'Drag to pan Â· wheel to zoom Â· double-click to reset'}</small>
              </div>
              <aside className="export-controls">
                <label><span>Format</span><select value={exportOptions.format} onChange={(event) => setExportOptions((value) => ({ ...value, format: event.target.value }))}><option value="png">PNG image</option><option value="pdf">PDF document</option><option value="mp4">MP4 Â· orbit video</option><option value="stl">STL Â· 3D printer</option><option value="glb">GLB 3D model</option><option value="json">JSON project</option></select></label>
                {exportOptions.format !== 'mp4' && <label><span>Paper size</span><select value={exportOptions.paper} onChange={(event) => setExportOptions((value) => ({ ...value, paper: event.target.value }))}><option value="a4">A4</option><option value="a3">A3</option><option value="letter">US Letter</option></select></label>}
                {exportOptions.format !== 'mp4' && <label><span>Orientation</span><select value={exportOptions.orientation} onChange={(event) => setExportOptions((value) => ({ ...value, orientation: event.target.value }))}><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label>}
                {exportOptions.format !== 'mp4' && <label><span>Render quality</span><select value={exportOptions.dpi} onChange={(event) => setExportOptions((value) => ({ ...value, dpi: Number(event.target.value) }))}><option value="450">High Â· 450 DPI</option><option value="300">Standard Â· 300 DPI</option></select></label>}
                {exportOptions.format === 'mp4' && <><NumberField label="One-round orbit Â· seconds" value={exportOptions.orbitDuration} min={2} max={60} step={1} onChange={(orbitDuration) => setExportOptions((value) => ({ ...value, orbitDuration }))} /><p>H.264 MP4 Â· 1920 Ã— 1080 Â· 30 FPS Â· 20 Mbps.</p></>}
                <label><span>Render style</span><select value={exportOptions.style} onChange={(event) => setExportOptions((value) => ({ ...value, style: event.target.value }))}><option value="solid">Solid colors</option><option value="hidden-line">Hidden line</option></select></label>
                <label><span>Lighting</span><select value={exportOptions.lighting} onChange={(event) => {
                  const lighting = event.target.value;
                  setExportOptions((value) => ({ ...value, lighting, ...(lighting === 'night' ? { style: 'solid', shadows: true, groundColor: '#111827' } : { groundColor: building.groundColor }) }));
                }}><option value="day">Natural daylight</option><option value="night">Night Â· authored spotlights only</option></select></label>
                {exportOptions.lighting === 'night' && <><label><span>Ground reflection Â· {Math.round(exportOptions.reflectionStrength * 100)}%</span><input type="range" min="0" max="1" step="0.05" value={exportOptions.reflectionStrength} onChange={(event) => setExportOptions((value) => ({ ...value, reflectionStrength: Number(event.target.value) }))} /></label><p>{nightLighting.lights.filter((light) => light.enabled).length} enabled spotlights Â· filmic tone mapping.</p></>}
                <label className="check-field"><input type="checkbox" checked={exportOptions.seamless} onChange={(event) => setExportOptions((value) => ({ ...value, seamless: event.target.checked }))} /><span>Seamless solid mass</span></label>
                {exportOptions.seamless && <><label><span>Whole-model color</span><input type="color" value={exportOptions.seamlessColor} onChange={(event) => setExportOptions((value) => ({ ...value, seamlessColor: event.target.value }))} /></label><label className="check-field"><input type="checkbox" checked={exportOptions.seamlessEdges} onChange={(event) => setExportOptions((value) => ({ ...value, seamlessEdges: event.target.checked }))} /><span>Module edge lines</span></label><label className="check-field"><input type="checkbox" checked={exportOptions.seamlessWallEdges} onChange={(event) => setExportOptions((value) => ({ ...value, seamlessWallEdges: event.target.checked }))} /><span>Wall and arch edge lines</span></label><label className="check-field"><input type="checkbox" checked={exportOptions.seamlessNorthBoundary} onChange={(event) => setExportOptions((value) => ({ ...value, seamlessNorthBoundary: event.target.checked }))} /><span>North inset boundary</span></label></>}
                {exportOptions.seamless && exportOptions.seamlessWallEdges && <div className="field-grid"><label><span>Wall edge color</span><input type="color" value={exportOptions.wallEdgeColor} onChange={(event) => setExportOptions((value) => ({ ...value, wallEdgeColor: event.target.value }))} /></label><NumberField label="Wall edge Â· px" value={exportOptions.wallEdgeThickness} min={0.5} max={8} step={0.5} onChange={(wallEdgeThickness) => setExportOptions((value) => ({ ...value, wallEdgeThickness }))} /></div>}
                {exportOptions.format !== 'mp4' && <label><span>View</span><select value={exportOptions.view} onChange={(event) => {
                  const view = event.target.value;
                  setExportOptions((value) => ({ ...value, view, panX: 0, panY: 0, ...(view === 'dimension-front' ? { style: 'hidden-line', shadows: false, seamless: false } : {}) }));
                }}><option value="current">Current stage camera</option><option value="isometric">Stage isometric</option><option value="iso-ne">Isometric NE</option><option value="iso-nw">Isometric NW</option><option value="iso-se">Isometric SE</option><option value="iso-sw">Isometric SW</option><option value="top">Basic top</option><option value="front">Basic front</option><option value="side">Basic side</option><option value="dimension-front">Dimensioned front Â· technical</option></select></label>}
                <label><span>Ground color</span><input type="color" value={exportOptions.groundColor} onChange={(event) => setExportOptions((value) => ({ ...value, groundColor: event.target.value }))} /></label>
                <label className="check-field"><input type="checkbox" checked={exportOptions.shadows} onChange={(event) => setExportOptions((value) => ({ ...value, shadows: event.target.checked }))} /><span>Render shadows</span></label>
                <label><span>Zoom Â· {exportOptions.zoom.toFixed(1)}Ã—</span><input type="range" min="0.5" max="5" step="0.1" value={exportOptions.zoom} onChange={(event) => setExportOptions((value) => ({ ...value, zoom: Number(event.target.value) }))} /></label>
                <div className="field-grid">
                  <NumberField label="Pan horizontal Â· m" value={exportOptions.panX} min={-30} max={30} step={0.1} onChange={(panX) => setExportOptions((value) => ({ ...value, panX }))} />
                  <NumberField label="Pan vertical Â· m" value={exportOptions.panY} min={-30} max={30} step={0.1} onChange={(panY) => setExportOptions((value) => ({ ...value, panY }))} />
                </div>
                <button type="button" onClick={() => setExportOptions((value) => ({ ...value, zoom: 1, panX: 0, panY: 0 }))}>Reset preview framing</button>
                <div className="export-facts"><span><strong>{exportOptions.dpi}</strong>DPI</span><span><strong>{placements.length}</strong>placements</span><span><strong>{nightLighting.lights.length}</strong>lights</span></div>
              </aside>
            </div>
            <footer>
              <button onClick={() => setExportOpen(false)}>Cancel</button>
              <button className="primary" disabled={exportBusy} onClick={() => exportRendered()}><Download size={15} /> {exportBusy && exportOptions.format === 'mp4' ? `Rendering ${Math.round(exportProgress * 100)}%` : `Export ${exportOptions.format.toUpperCase()}`}</button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
