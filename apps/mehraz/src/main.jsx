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
  listLibraryAssets,
  listLibraryAssetVersions,
  saveLibraryAsset,
  setCurrentLibraryAssetVersion,
  updateLibraryAssetMetadata,
} from './library-client.generated.js';
import {
  buildingSurfaces,
  constrainPlacementTransform,
  defaultPlacementTransform,
  fitPlacementToZone,
  fitPlacementTransform,
  MehrazScene,
  CONSTRUCTION_STEPS,
  normalizeBuilding,
  surfaceIdForWallSide,
  wallSideForSurfaceId,
  zoneWorldTransform,
} from './mehraz-scene.js';
import {
  BUILT_IN_BONDS,
  DEFAULT_WALL_SYSTEM,
  normalizeWallSystem,
} from './wall-system.js';
import { muqarnasPreviewMetrics, portalMuqarnasTransform } from './arch-muqarnas-placement.js';
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
  const image = artifacts.preview_png || artifacts.watermarked_preview_png || artifacts.source_png || payload.previewImage || payload.thumbnail || '';
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
  arch: 'Arch',
};

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
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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

function NumberField({ label, value, min, max, step = 0.1, onChange }) {
  return (
    <label>
      <span>{label}</span>
      <input type="number" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function CollapsiblePanel({ open, onToggle, icon, title, subtitle, children, className = '', panelRef = null, collapsible = true }) {
  const heading = (
    <>
      {icon}
      <div><strong>{title}</strong>{subtitle && <small>{subtitle}</small>}</div>
    </>
  );

  return (
    <section ref={panelRef} className={`inspector-section collapsible-panel ${className}`}>
      {collapsible ? (
        <button type="button" className="section-heading collapsible-heading" onClick={onToggle}>
          {heading}
          <span className="collapse-mark">{open ? '−' : '+'}</span>
        </button>
      ) : (
        <div className="section-heading">{heading}</div>
      )}
      {(!collapsible || open) && <div className="collapsible-body">{children}</div>}
    </section>
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
  const importRef = useRef(null);
  const exportPanRef = useRef(null);
  const buildingRef = useRef(null);
  const wallsRef = useRef(null);
  const inspectorRef = useRef(null);
  const wallSettingsRef = useRef(null);
  const wallNorthSidesRef = useRef(null);
  const wallNorthTopRef = useRef(null);
  const wallSouthRef = useRef(null);
  const wallEastRef = useRef(null);
  const wallWestRef = useRef(null);
  const wallArchRef = useRef(null);
  const placementsRef = useRef([]);
  const zonesRef = useRef([]);
  const selectedPlacementIdRef = useRef(null);
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
  const [libraryBusy, setLibraryBusy] = useState(false);
  const [libraryMessage, setLibraryMessage] = useState('');
  const [libraryEdit, setLibraryEdit] = useState({ name: '', description: '' });
  const [libraryVersions, setLibraryVersions] = useState([]);
  const [selectedLibraryVersionId, setSelectedLibraryVersionId] = useState('');
  const [collapsedLibraryGroups, setCollapsedLibraryGroups] = useState({});
  const [selectedAssetId, setSelectedAssetId] = useState('');
  const [building, setBuilding] = useState(() => normalizeBuilding());
  const [walls, setWalls] = useState(() => normalizeWallSystem(DEFAULT_WALL_SYSTEM, normalizeBuilding()));
  const [nightLighting, setNightLighting] = useState({ preview: false, guides: false, selectedId: null, lights: [] });
  const [zones, setZones] = useState([]);
  const [assemblies, setAssemblies] = useState([]);
  const [placements, setPlacements] = useState([]);
  const [muqarnasDimensionsById, setMuqarnasDimensionsById] = useState({});
  const [selectedPlacementId, setSelectedPlacementId] = useState(null);
  const [selectedZoneId, setSelectedZoneId] = useState(null);
  const [selectedAssemblyId, setSelectedAssemblyId] = useState(null);
  const [assemblyDraftSelection, setAssemblyDraftSelection] = useState([]);
  const [targetSurfaceId, setTargetSurfaceId] = useState('north_interior');
  const [selectedWallSide, setSelectedWallSide] = useState('north_sides');
  const [historyVersion, setHistoryVersion] = useState(0);
  const [projectName, setProjectName] = useState('My Mehraz iwan');
  const [activeProjectAssetId, setActiveProjectAssetId] = useState(null);
  const [activeProjectVersionId, setActiveProjectVersionId] = useState(null);
  const [selectedProjectVersionId, setSelectedProjectVersionId] = useState('');
  const [rightTab, setRightTab] = useState('building');
  const [stageView, setStageView] = useState('isometric');
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
  const [constructionStep, setConstructionStep] = useState(CONSTRUCTION_STEPS.length - 1);
  const [constructionDuration, setConstructionDuration] = useState(15);
  const [constructionPlaying, setConstructionPlaying] = useState(false);
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
      const side = assetContextMenu.id === 'north_sides' || assetContextMenu.id === 'north_top' ? 'north' : assetContextMenu.id === 'south_arch' ? 'south' : assetContextMenu.id;
      const bond = walls.bricks?.sideBonds?.[side];
      return bond?.source === 'library' && bond.assetId ? { assetId: bond.assetId, versionId: bond.assetVersionId, assetType: bond.assetType || 'brick_bond', name: bond.name } : null;
    }
    return null;
  }, [assetContextMenu, placements, zones, walls]);
  const selectedNightLight = nightLighting.lights.find((light) => light.id === nightLighting.selectedId) || null;
  const activeCoverType = walls.karbandi?.enabled === true ? 'karbandi' : 'ahang';
  const mehrazHasProjectWork = useMemo(() => {
    if (placements.length || assemblies.length || zones.length || nightLighting.lights.length || activeProjectAssetId) return true;
    const defaultBuilding = normalizeBuilding();
    const defaultWalls = normalizeWallSystem(DEFAULT_WALL_SYSTEM, defaultBuilding);
    return JSON.stringify(building) !== JSON.stringify(defaultBuilding)
      || JSON.stringify(walls) !== JSON.stringify(defaultWalls);
  }, [activeProjectAssetId, assemblies.length, building, nightLighting.lights.length, placements.length, walls, zones.length]);
  const groupedLibrary = useMemo(() => LIBRARY_APP_GROUPS.map((group) => ({
    ...group,
    assets: library.filter((asset) => group.assetTypes.includes(asset.asset_type)),
  })), [library]);
  const brickBondAssets = library.filter((asset) => asset.asset_type === 'brick_bond' && asset.currentVersion?.payload);
  const wallPatternAssets = library.filter((asset) => ['brick_bond', 'girih_pattern'].includes(asset.asset_type) && asset.currentVersion?.payload);
  const zonePatternAssets = wallPatternAssets;
  const muqarnasAssets = library.filter((asset) => asset.asset_type === 'muqarnas_assembly' && asset.currentVersion?.payload);
  const activeProject = projects.find((project) => project.id === activeProjectAssetId) || null;
  const activeProjectVersions = activeProject ? projectVersionsById[activeProject.id] || [] : [];
  const selectedProjectVersion = activeProjectVersions.find((version) => version.id === selectedProjectVersionId) || null;
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
    listLibraryAssetVersions(supabase, selectedAsset.id)
      .then((versions) => {
        setLibraryVersions(versions);
        setSelectedLibraryVersionId((current) => (
          versions.some((version) => version.id === current)
            ? current
            : selectedAsset.current_version_id || versions[0]?.id || ''
        ));
      })
      .catch((error) => setLibraryMessage(error.message));
  }, [selectedAsset?.id]);
  const renderedPlacements = useMemo(() => {
    return placements
      .filter((placement) => !placement.generatedFromZone)
      .map((placement) => {
        if (placement.assetPayload) return placement;
        const asset = library.find((item) => (
          item.id === placement.assetId
          && item.currentVersion?.id === placement.assetVersionId
        ));
        return asset ? { ...placement, assetPayload: asset.currentVersion.payload } : placement;
      });
  }, [placements, library]);
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
  buildingRef.current = building;
  wallsRef.current = walls;
  placementsRef.current = placements;
  zonesRef.current = zones;
  selectedPlacementIdRef.current = selectedPlacementId;
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
    setConstructionPlaying(false);
    sceneRef.current?.stopConstructionSequence();
    setConstructionStep(index);
    sceneRef.current?.applyConstructionStep(index);
    setRightTab('construction');
    openSection('constructionSteps');
  }

  function playConstructionSteps() {
    setRightTab('construction');
    openSection('constructionSteps');
    setConstructionPlaying(true);
    sceneRef.current?.playConstructionSequence(
      constructionDuration,
      (index) => setConstructionStep(index),
      () => setConstructionPlaying(false),
    );
  }

  function stopConstructionSteps() {
    sceneRef.current?.stopConstructionSequence();
    setConstructionPlaying(false);
  }

  function changeStageView(view) {
    setStageView(view);
    sceneRef.current?.setStageView(view);
  }

  function projectSnapshot() {
    return JSON.stringify({
      building: buildingRef.current,
      walls: wallsRef.current,
      placements: placementsRef.current,
      zones: zonesRef.current,
      assemblies: assembliesRef.current,
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
    setBuilding(normalizeBuilding(state.building));
    setWalls(normalizeWallSystem(state.walls || DEFAULT_WALL_SYSTEM, normalizeBuilding(state.building)));
    setPlacements(Array.isArray(state.placements) ? state.placements : []);
    setZones(Array.isArray(state.zones) ? state.zones : []);
    setAssemblies(Array.isArray(state.assemblies) ? state.assemblies : []);
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
  }, [building, walls, placements, zones, assemblies, nightLighting, stageRenderMode]);

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
        const zoneId = selectedZoneIdRef.current;
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
      onSelection: (id) => {
        setSelectedPlacementId(id);
        if (!id) {
          setSelectedZoneId(null);
          setSelectedWallSide(null);
          return;
        }
        const placement = placementsRef.current.find((item) => item.id === id);
        if (placement?.role === 'arch-muqarnas' || placement?.assetType === 'muqarnas_assembly') {
          setRightTab('cover');
          openSection('wallArch');
          scrollInspectorTo(wallArchRef);
        }
        if (id) setSelectedWallSide(null);
      },
      onZoneSelection: (id) => {
        setSelectedZoneId(id);
        if (!id) {
          setSelectedPlacementId(null);
          setSelectedWallSide(null);
          return;
        }
        if (id) {
          setSelectedPlacementId(null);
          setSelectedWallSide(null);
          setRightTab('zones');
        }
      },
      onWallSurfaceSelection: (selection) => {
        if (!selection) {
          setSelectedPlacementId(null);
          setSelectedZoneId(null);
          setSelectedWallSide(null);
          return;
        }
        setSelectedWallSide(selection.side);
        setTargetSurfaceId(selection.surfaceId);
        setSelectedPlacementId(null);
        setSelectedZoneId(null);
        setRightTab(selection.side === 'arch' || selection.side === 'south_arch' ? 'cover' : 'walls');
        focusWallSection(selection.side);
      },
      onTransform: (id, transform) => {
        setPlacements((items) => items.map((placement) => {
          if (placement.id !== id) return placement;
          return {
            ...placement,
            transform: placement.options?.constrain === false
              ? transform
              : constrainPlacementTransform(transform, placement.surfaceId, buildingRef.current, placement.options, wallsRef.current),
            options: placement.role === 'arch-muqarnas'
              ? { ...placement.options, enforceTargetWidth: false }
              : placement.options,
          };
        }));
      },
      onPreviewDimensions: (id, dimensions) => {
        setMuqarnasDimensionsById((current) => {
          const previous = current[id];
          if (previous?.every((value, index) => Math.abs(value - dimensions[index]) < 0.0001)) return current;
          return { ...current, [id]: dimensions };
        });
      },
      onAssetContextMenu: setAssetContextMenu,
      onKarbandiCut: ({ ribIndex, side }) => {
        setWalls((value) => {
          const cuts = Array.isArray(value.karbandi?.manualCuts) ? value.karbandi.manualCuts : [];
          const exists = cuts.some((cut) => cut.ribIndex === ribIndex && cut.side === side);
          if (exists) return value;
          return normalizeWallSystem({
            ...value,
            karbandi: {
              ...value.karbandi,
              manualCuts: [...cuts, { ribIndex, side }],
            },
          }, buildingRef.current);
        });
        setRightTab('cover');
        openSection('coverKarbandi');
      },
      onNightLights: setNightLighting,
    });
    sceneRef.current = scene;
    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
  }, [user?.id]);

  useEffect(() => {
    try {
      sceneRef.current?.setArchitecture(building, walls, stageRenderMode);
    } catch (error) {
      console.error('Could not rebuild the Mehraz scene.', error);
      setLibraryMessage(`Could not render this project: ${error?.message || 'Unknown scene error'}`);
    }
  }, [building, walls, stageRenderMode]);

  useEffect(() => {
    sceneRef.current?.setPlacements(renderedPlacements);
  }, [renderedPlacements]);

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
    if (selectedZoneId && !selectedPlacementId) sceneRef.current?.selectZone(selectedZoneId);
  }, [selectedZoneId, selectedPlacementId]);

  useEffect(() => {
    sceneRef.current?.setSelectedWallSide(selectedWallSide);
  }, [selectedWallSide]);

  useEffect(() => {
    let active = true;
    authHandoffReady.then(() => supabase.auth.getSession()).then(({ data }) => {
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
      setLibrary([]);
      setProjects([]);
      setProjectVersionsById({});
      return;
    }
    refreshLibrary();
  }, [user?.id]);

  async function refreshLibrary() {
    if (!user) return;
    setLibraryBusy(true);
    try {
      const assets = await listLibraryAssets(supabase);
      const withLegacyBricks = await appendLegacyBrickBonds(assets);
      const usableAssets = withLegacyBricks.filter((asset) => asset.asset_type !== 'mehraz_project');
      const params = new URLSearchParams(window.location.search);
      const returnedAssetId = params.get('libraryUpdated') ? params.get('assetId') || '' : '';
      const projectAssets = withLegacyBricks.filter((asset) => asset.asset_type === 'mehraz_project');
      const projectVersionEntries = await Promise.all(projectAssets.map(async (project) => {
        try {
          const versions = await listLibraryAssetVersions(supabase, project.id);
          return [project.id, versions];
        } catch {
          return [project.id, project.currentVersion ? [project.currentVersion] : []];
        }
      }));
      setLibrary(usableAssets);
      setProjects(projectAssets);
      setProjectVersionsById(Object.fromEntries(projectVersionEntries));
      setSelectedAssetId((current) => (
        returnedAssetId && usableAssets.some((asset) => asset.id === returnedAssetId)
          ? returnedAssetId
          : usableAssets.some((asset) => asset.id === current) ? current : usableAssets[0]?.id || ''
      ));
      setLibraryMessage(returnedAssetId
        ? 'Library item updated in its source app. Select it or place it again to use the newest version.'
        : withLegacyBricks.length
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
      const message = error.message || 'The shared library could not be loaded.';
      if (/sign in again|older Supabase project|invalid jwt/i.test(message)) {
        setUser(null);
        setLibrary([]);
        setProjects([]);
        setProjectVersionsById({});
      }
      setLibraryMessage(`Library connection problem: ${message}`);
    } finally {
      setLibraryBusy(false);
    }
  }

  async function appendLegacyBrickBonds(assets) {
    const hasLibraryBrickBonds = assets.some((asset) => asset.asset_type === 'brick_bond');
    if (hasLibraryBrickBonds) return assets;
    const { data, error } = await supabase
      .from('brick_bond_patterns')
      .select('id,name,bond_pattern,updated_at,created_at')
      .order('updated_at', { ascending: false });
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

  async function connectAccount() {
    const login = new URL('/app', 'https://girihstudio.com');
    login.searchParams.set('mode', 'login');
    login.searchParams.set('nextApp', window.location.href);
    window.location.assign(login);
  }

  function addSelectedAsset() {
    if (!selectedAsset?.currentVersion) {
      setLibraryMessage('Choose a library asset with a readable version.');
      return;
    }
    const surfaceId = surfaces.some((surface) => surface.id === targetSurfaceId)
      ? targetSurfaceId
      : surfaces[0].id;
    const placement = {
      id: newPlacementId(),
      assetId: selectedAsset.id,
      assetVersionId: selectedAsset.currentVersion.id,
      assetVersionNumber: selectedAsset.currentVersion.version_number,
      assetType: selectedAsset.asset_type,
      name: selectedAsset.name,
      surfaceId,
      transform: defaultPlacementTransform(surfaceId, building, walls),
      options: { constrain: true, snap: 0.1 },
      assetPayload: selectedAsset.currentVersion.payload,
    };
    setPlacements((items) => [...items, placement]);
    setSelectedPlacementId(placement.id);
    setRightTab('placement');
    setLibraryMessage(`${selectedAsset.name} placed with version ${placement.assetVersionNumber} pinned.`);
  }

  function setArchMuqarnasAsset(assetId) {
    const asset = muqarnasAssets.find((item) => item.id === assetId);
    setPlacements((items) => items.filter((placement) => placement.role !== 'arch-muqarnas'));
    if (!asset?.currentVersion) {
      setSelectedPlacementId(null);
      setLibraryMessage('Arch Muqarnas removed.');
      return;
    }
    const placement = {
      id: newPlacementId(),
      role: 'arch-muqarnas',
      assetId: asset.id,
      assetVersionId: asset.currentVersion.id,
      assetVersionNumber: asset.currentVersion.version_number,
      assetType: asset.asset_type,
      name: asset.name,
      surfaceId: 'floor',
      transform: archMuqarnasTransform(building, walls, asset.currentVersion.payload),
      options: { constrain: false, snap: 0, targetWidth: building.openingWidth, enforceTargetWidth: true, keepAspectRatio: true },
      assetPayload: asset.currentVersion.payload,
    };
    setPlacements((items) => [...items.filter((placementItem) => placementItem.role !== 'arch-muqarnas'), placement]);
    setSelectedPlacementId(null);
    setLibraryMessage(`${asset.name} loaded under the arch and auto-fit with aspect ratio preserved.`);
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
      bounds: {
        u: 0,
        v: surfaceId === 'floor' ? 0 : building.height * 0.5,
        width: Math.min(3, surfaceId === 'floor' || ['north_interior', 'south_interior', 'south_facade'].includes(surfaceId) ? building.width - 0.4 : building.depth - 0.4),
        height: Math.min(3, surfaceId === 'floor' ? building.depth - 0.4 : building.height - 0.4),
      },
      color: '#2f7d86',
      opacity: 0.14,
    };
    setZones((items) => [...items, zone]);
    setSelectedZoneId(zone.id);
    setSelectedPlacementId(null);
    setRightTab('zones');
  }

  function updateSelectedZone(patch) {
    if (!selectedZoneId) return;
    setZones((items) => items.map((zone) => zone.id === selectedZoneId ? { ...zone, ...patch } : zone));
  }

  function updateZoneBounds(key, value) {
    if (!selectedZone) return;
    updateSelectedZone({
      bounds: {
        ...selectedZone.bounds,
        [key]: ['width', 'height'].includes(key) ? Math.max(0.2, value) : value,
      },
    });
  }

  function changeZoneSurface(surfaceId) {
    if (!selectedZone) return;
    updateSelectedZone({
      surfaceId,
      bounds: {
        ...selectedZone.bounds,
        u: 0,
        v: surfaceId === 'floor' ? 0 : building.height * 0.5,
      },
    });
  }

  function assignPatternToSelectedZone(assetId) {
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
    updateSelectedZone({
      assetId: asset.id,
      assetVersionId: asset.currentVersion.id,
      assetVersionNumber: asset.currentVersion.version_number,
      assetType: asset.asset_type,
      assetName: asset.name,
      assetPayload: asset.currentVersion.payload,
      assetUnit: patternAssetUnitSize(asset),
    });
    setLibraryMessage(`${asset.name} assigned to ${selectedZone.name}. The pattern will tessellate to fill the zone.`);
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
    return {
      version: 5,
      app: 'mehraz',
      units: 'm',
      coordinateSystem: 'right-handed-y-up',
      building,
      walls,
      stageRenderMode,
      nightLights: nightLighting.lights,
      surfaces,
      zones,
      assemblies,
      placements: placements.filter((placement) => !placement.generatedFromZone),
      previewImage,
    };
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
      const thumbnail = captureProjectThumbnail(
        currentProject?.currentVersion?.payload?.previewImage
          || currentProject?.currentVersion?.payload?.thumbnail
          || '',
      );
      const result = await saveLibraryAsset(supabase, {
        assetId: activeProjectAssetId,
        assetType: 'mehraz_project',
        sourceApp: 'mehraz',
        name: savedName,
        payload: projectPayload(thumbnail),
        metadata: {
          editorSchemaVersion: 5,
          placementCount: placements.length,
          zoneCount: zones.length,
          assemblyCount: assemblies.length,
          nightLightCount: nightLighting.lights.length,
          pinnedVersionCount: new Set(placements.map((placement) => placement.assetVersionId)).size,
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
      await refreshLibrary();
      setLibraryMessage(result.updated
        ? `Mehraz project version ${result.versionNumber} saved.`
        : 'Mehraz project saved to your shared library.');
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

  function applyProject(payload, asset = null, version = null) {
    if (payload?.app !== 'mehraz' || !payload.building || !Array.isArray(payload.placements)) {
      throw new Error('This is not a valid Mehraz project.');
    }
    setBuilding(normalizeBuilding(payload.building));
    const nextStageRenderMode = payload.stageRenderMode === 'flat' ? 'flat' : 'textured';
    setStageRenderMode(nextStageRenderMode);
    setExportOptions((value) => ({ ...value, stageRenderMode: nextStageRenderMode }));
    setWalls(normalizeWallSystem(payload.walls || {
      ...DEFAULT_WALL_SYSTEM,
      color: payload.building?.wallColor,
      pointedArch: { ...DEFAULT_WALL_SYSTEM.pointedArch, enabled: payload.building?.type !== 'room' },
    }, payload.building));
    sceneRef.current?.setNightPreview(false);
    sceneRef.current?.setNightLights(payload.nightLights || []);
    sceneRef.current?.setNightLightGuidesVisible(false);
    setZones(Array.isArray(payload.zones) ? payload.zones : []);
    const normalizedPlacements = payload.placements.filter((placement) => placement && !placement.generatedFromZone).map((placement) => {
      const surfaceId = placement.surfaceId || 'north_interior';
      const transform = placement.transform || defaultPlacementTransform(surfaceId, payload.building, payload.walls);
      return {
        ...placement,
        surfaceId,
        transform,
        options: { constrain: true, snap: 0.1, ...placement.options },
      };
    });
    const validPlacementIds = new Set(normalizedPlacements.map((placement) => placement.id));
    setAssemblies(Array.isArray(payload.assemblies) ? payload.assemblies.map((assembly) => ({
      ...assembly,
      placementIds: Array.isArray(assembly.placementIds)
        ? assembly.placementIds.filter((id) => validPlacementIds.has(id))
        : [],
    })) : []);
    setPlacements(normalizedPlacements);
    setSelectedPlacementId(null);
    setSelectedZoneId(null);
    setSelectedAssemblyId(null);
    setAssemblyDraftSelection([]);
    setActiveProjectAssetId(asset?.id || null);
    setActiveProjectVersionId(version?.id || asset?.currentVersion?.id || null);
    setSelectedProjectVersionId(version?.id || asset?.current_version_id || asset?.currentVersion?.id || '');
    setProjectName(asset?.name || 'Imported Mehraz project');
    setStageView('front');
    const versionNumber = version?.version_number || asset?.currentVersion?.version_number;
    setLibraryMessage(asset ? `Opened ${asset.name}${versionNumber ? ` - version ${versionNumber}` : ''}.` : 'Project imported.');
    requestAnimationFrame(() => requestAnimationFrame(() => sceneRef.current?.setStageView('front')));
  }

  function openProject(asset, version = asset?.currentVersion) {
    try {
      applyProject(version?.payload, asset, version);
    } catch (error) {
      setLibraryMessage(error.message);
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
      applyProject(JSON.parse(await file.text()));
    } catch (error) {
      setLibraryMessage(error.message);
    }
  }

  function newProject() {
    if ((placements.length || activeProjectAssetId) && !window.confirm('Start a new Mehraz project?')) return;
    setBuilding(normalizeBuilding());
    setWalls(normalizeWallSystem(DEFAULT_WALL_SYSTEM, normalizeBuilding()));
    setStageRenderMode('textured');
    setExportOptions((value) => ({ ...value, stageRenderMode: 'textured' }));
    sceneRef.current?.setNightPreview(false);
    sceneRef.current?.setNightLights([]);
    sceneRef.current?.setNightLightGuidesVisible(false);
    setZones([]);
    setAssemblies([]);
    setPlacements([]);
    setSelectedPlacementId(null);
    setSelectedZoneId(null);
    setSelectedAssemblyId(null);
    setAssemblyDraftSelection([]);
    setActiveProjectAssetId(null);
    setActiveProjectVersionId(null);
    setSelectedProjectVersionId('');
    setProjectName('My Mehraz iwan');
    setLibraryMessage('New architectural project ready.');
    requestAnimationFrame(() => sceneRef.current?.frameModel());
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
  }, [exportOpen, exportOptions, building, walls, nightLighting, renderedPlacements]);

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
      setLibraryMessage(error.message);
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

  function setCoverEnabled(type, enabled) {
    setWalls((value) => normalizeWallSystem({
      ...value,
      ahang: {
        ...value.ahang,
        enabled: type === 'ahang' ? enabled : (enabled ? false : value.ahang?.enabled),
      },
      karbandi: {
        ...value.karbandi,
        enabled: type === 'karbandi' ? enabled : (enabled ? false : value.karbandi?.enabled),
      },
    }, building));
  }

  function updateWallSideRecord(group, side, nextValue) {
    setWalls((value) => normalizeWallSystem({
      ...value,
      [group]: { ...value[group], [side]: nextValue },
    }, building));
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
    const surfaceId = surfaceIdForWallSide(side, building);
    if (!surfaceId) return;
    setSelectedWallSide(side);
    setTargetSurfaceId(surfaceId);
    setSelectedPlacementId(null);
    setSelectedZoneId(null);
    sceneRef.current?.selectWallSide(side, false);
  }

  function changeTargetSurface(surfaceId) {
    setTargetSurfaceId(surfaceId);
    const side = wallSideForSurfaceId(surfaceId);
    setSelectedWallSide(side);
    if (side) sceneRef.current?.selectWallSide(side, false);
    else sceneRef.current?.setSelectedWallSide(null);
  }

  function setWallBond(side, selection) {
    activateWallSide(side);
    setWalls((value) => {
      let bond;
      if (selection.startsWith('library:')) {
        const asset = wallPatternAssets.find((item) => item.id === selection.slice(8));
        bond = asset ? {
          source: 'library',
          assetType: asset.asset_type,
          assetId: asset.id,
          assetVersionId: asset.currentVersion.id,
          name: asset.name,
          payload: asset.currentVersion.payload,
        } : { source: 'builtin', builtIn: 'running' };
      } else {
        bond = { source: 'builtin', builtIn: selection.replace('builtin:', '') };
      }
      return normalizeWallSystem({
        ...value,
        bricks: {
          ...value.bricks,
          sideBonds: { ...value.bricks.sideBonds, [side]: bond },
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
    setWalls((value) => normalizeWallSystem({
      ...value,
      bricks: {
        ...value.bricks,
        sideBonds: {
          ...value.bricks.sideBonds,
          [side]: { ...value.bricks.sideBonds[side], scale },
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
    setWalls((value) => normalizeWallSystem({
      ...value,
      bricks: {
        ...value.bricks,
        sideBonds: {
          ...value.bricks.sideBonds,
          [side]: { ...value.bricks.sideBonds[side], ...patch },
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

  function renderWallBondControls(side) {
    return (
      <div className={`wall-bond-row ${selectedWallSide === side || (side === 'arch' && selectedWallSide === 'south_arch') ? 'active' : ''}`} onClick={() => activateWallSide(side)}>
        <label><span>{WALL_BOND_LABELS[side] || side} decorative face bond</span><select value={wallBondValue(side)} onChange={(event) => setWallBond(side, event.target.value)}>
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

  function updateNightLightVector(field, index, nextValue) {
    if (!selectedNightLight) return;
    const vector = [...selectedNightLight[field]];
    vector[index] = nextValue;
    sceneRef.current?.updateNightLight(selectedNightLight.id, { [field]: vector });
  }

  if (!authReady) return <main className="app-auth-gate girih-theme-mehraz"><span className="auth-spinner" /><p>Checking your Girih Studio account...</p></main>;
  if (!user) return <main className="app-auth-gate girih-theme-mehraz"><img src="https://girihstudio.com/landing/brand/girih-logo-color.png" alt="" /><girih-app-icon app="mehraz"></girih-app-icon><small>Mehraz App</small><h1>Sign in to continue</h1><p>Use one Girih Studio account across every design app. Mehraz is currently free.</p><button className="primary" onClick={connectAccount}><LogIn size={16} /> Sign in</button></main>;

  return (
    <div className="mehraz-app girih-theme-mehraz">
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
          <a className="account-button" href="https://girihstudio.com/training?app=mehraz"><GraduationCap size={15} /> Academy</a>
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
            <div><small>Shared assets</small><h1 id="mehraz-library-title">Your library</h1></div>
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
                </div>
                <p className="zone-hint library-zone-note">To place Girih or brick patterns, create a zone in the Zones tab and assign a library item there.</p>
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
          {!mehrazHasProjectWork && (
            <div className="mehraz-stage-welcome" aria-hidden="true">
              <div className="mehraz-stage-welcome-mark"><Building2 size={34} /></div>
              <span>Architectural composition</span>
              <h2>Bring every craft into one space.</h2>
              <p>Shape the building, then place saved Girih, Bricks, and Muqarnas work from your shared library.</p>
            </div>
          )}
          <div className="stage-overlay">
            <span><Boxes size={14} /> {placements.length} placements</span>
            <span><ScanLine size={14} /> {zones.length} zones</span>
            <span><Save size={14} /> {new Set(placements.map((item) => item.assetVersionId)).size} pinned versions</span>
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
            </div>
          </div>
        </section>

        <aside ref={inspectorRef} className="inspector">
          <div className="inspector-tabs">
            <button className={rightTab === 'building' ? 'active' : ''} onClick={() => setRightTab('building')}>Building</button>
            <button className={rightTab === 'walls' ? 'active' : ''} onClick={() => setRightTab('walls')}>Walls</button>
            <button className={rightTab === 'cover' ? 'active' : ''} onClick={() => {
              setRightTab('cover');
              if (!walls.ahang?.enabled && !walls.karbandi?.enabled) setCoverEnabled('ahang', true);
            }}>Cover</button>
            <button className={rightTab === 'lights' ? 'active' : ''} onClick={() => setRightTab('lights')}>Lights</button>
            <button className={rightTab === 'zones' ? 'active' : ''} onClick={() => setRightTab('zones')}>Zones</button>
            <button className={rightTab === 'construction' ? 'active' : ''} onClick={() => setRightTab('construction')}>Steps</button>
            <button className={rightTab === 'project' ? 'active' : ''} onClick={() => setRightTab('project')}>Project</button>
          </div>

          {rightTab === 'building' && (
            <section className="inspector-section">
              <div className="section-heading"><Building2 size={17} /><div><strong>Architectural shell</strong><small>Mehraz owns building geometry</small></div></div>
              <CollapsiblePanel collapsible={false} title="Building dimensions">
                <label><span>Building type</span><select value={building.type} onChange={(event) => setBuilding((value) => normalizeBuilding({ ...value, type: event.target.value }))}><option value="iwan">Iwan Â· pointed portal</option><option value="room">Room Â· four walls</option></select></label>
                <div className="field-grid">
                  <NumberField label="Width Â· m" value={building.width} min={2} max={30} onChange={(width) => setBuilding((value) => normalizeBuilding({ ...value, width }))} />
                  <NumberField label="Depth Â· m" value={building.depth} min={2} max={30} onChange={(depth) => setBuilding((value) => normalizeBuilding({ ...value, depth }))} />
                  <NumberField label="Height Â· m" value={building.height} min={2} max={20} onChange={(height) => setBuilding((value) => normalizeBuilding({ ...value, height }))} />
                  <NumberField label="Wall Â· m" value={building.wallThickness} min={0.1} max={1.5} step={0.05} onChange={(wallThickness) => setBuilding((value) => normalizeBuilding({ ...value, wallThickness }))} />
                </div>
                <div className="color-grid">
                  <label><span>Ground color</span><input type="color" value={building.groundColor} onChange={(event) => setBuilding((value) => ({ ...value, groundColor: event.target.value }))} /></label>
                </div>
              </CollapsiblePanel>
              <CollapsiblePanel collapsible={false} title="Available surfaces">
                <div className="surface-list">{surfaces.map((surface) => <span key={surface.id}>{surface.label}</span>)}</div>
              </CollapsiblePanel>
            </section>
          )}

          {rightTab === 'walls' && (
            <section className="inspector-section wall-controls">
              <div className="section-heading"><BrickWall size={17} /><div><strong>Architectural walls</strong><small>Copied into Mehraz Â· Muqarnas remains untouched</small></div></div>
              <CollapsiblePanel panelRef={wallSettingsRef} open={!collapsedSections.wallGeneral} onToggle={() => toggleSection('wallGeneral')} title="Wall visibility and material">
                <label className="check-field"><input type="checkbox" checked={walls.enabled} onChange={(event) => updateWalls({ enabled: event.target.checked })} /><span>Show frame walls</span></label>
                <label className="check-field"><input type="checkbox" checked={walls.shadows} onChange={(event) => updateWalls({ shadows: event.target.checked })} /><span>Wall and arch shadows</span></label>
                <div className="color-grid">
                  <label><span>Wall color</span><input type="color" value={walls.color} onChange={(event) => updateWalls({ color: event.target.value })} /></label>
                  <NumberField label="Wall thickness Â· m" value={building.wallThickness} min={0.1} max={1.5} step={0.05} onChange={(wallThickness) => setBuilding((value) => normalizeBuilding({ ...value, wallThickness }))} />
                </div>
                <label className="check-field"><input type="checkbox" checked={walls.edges.enabled} onChange={(event) => updateWallGroup('edges', { enabled: event.target.checked })} /><span>Show wall and arch edges</span></label>
                <div className="field-grid">
                  <label><span>Edge color</span><input type="color" value={walls.edges.color} onChange={(event) => updateWallGroup('edges', { color: event.target.value })} /></label>
                  <NumberField label="Edge thickness Â· px" value={walls.edges.thickness} min={0.5} max={8} step={0.5} onChange={(thickness) => updateWallGroup('edges', { thickness })} />
                </div>
                <label className="check-field"><input type="checkbox" checked={walls.bricks.enabled} onChange={(event) => updateWallGroup('bricks', { enabled: event.target.checked })} /><span>Show brick pattern</span></label>
                <div className="field-grid">
                  <NumberField label="Brick width Â· m" value={walls.bricks.brickWidth} min={0.05} max={1} step={0.005} onChange={(brickWidth) => updateWallGroup('bricks', { brickWidth })} />
                  <NumberField label="Brick height Â· m" value={walls.bricks.brickHeight} min={0.02} max={0.5} step={0.005} onChange={(brickHeight) => updateWallGroup('bricks', { brickHeight })} />
                  <NumberField label="Mortar joint width Â· m" value={walls.bricks.mortar} min={0.001} max={0.05} step={0.001} onChange={(mortar) => updateWallGroup('bricks', { mortar })} />
                  <label><span>Mortar color</span><input type="color" value={walls.bricks.mortarColor} onChange={(event) => updateWallGroup('bricks', { mortarColor: event.target.value })} /></label>
                  <NumberField label="Imported pattern scale Â· proportional" value={walls.bricks.importedScale} min={0.1} max={8} step={0.1} onChange={(importedScale) => updateWallGroup('bricks', { importedScale })} />
                </div>
              </CollapsiblePanel>

              <CollapsiblePanel panelRef={wallNorthSidesRef} open={!collapsedSections.wallNorthSides} onToggle={() => toggleSection('wallNorthSides')} title="North side walls">
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
              </CollapsiblePanel>

              <CollapsiblePanel panelRef={wallNorthTopRef} open={!collapsedSections.wallNorthTop} onToggle={() => toggleSection('wallNorthTop')} title="North wall arch and top">
                {renderWallBondControls('north_top')}
                <label className="check-field"><input type="checkbox" checked={walls.pointedArch.enabled} onChange={(event) => updateWallGroup('pointedArch', { enabled: event.target.checked })} /><span>Pointed arch opening in north wall</span></label>
                <div className="field-grid">
                  <NumberField label="Green point offset · m" value={walls.pointedArch.greenOffset ?? building.openingWidth * 0.5} min={0.05} max={20} step={0.05} onChange={(greenOffset) => updateWallGroup('pointedArch', { greenOffset })} />
                  <NumberField label="Green point height · m" value={walls.pointedArch.greenHeight ?? Math.max(0, building.height - building.openingWidth * 0.3)} min={0} max={20} step={0.05} onChange={(greenHeight) => updateWallGroup('pointedArch', { greenHeight })} />
                  <NumberField label="Extra above arch Â· m" value={walls.northWall.archTopExtension} min={0} max={10} step={0.1} onChange={(archTopExtension) => updateWallGroup('northWall', { archTopExtension })} />
                </div>
                <p className="zone-hint">This north-wall arch design is preserved when switching between Ahang and Karbandi. Overall north height follows the North side wall height, and the top section can use its own bond.</p>
              </CollapsiblePanel>

              <CollapsiblePanel panelRef={wallSouthRef} open={!collapsedSections.wallSouth} onToggle={() => toggleSection('wallSouth')} title="South wall">
                {renderWallBondControls('south')}
                {['door', 'window'].map((type) => {
                  const opening = walls.southOpenings[type];
                  return (
                    <div className="opening-card" key={type}>
                      <label className="check-field"><input type="checkbox" checked={opening.enabled} onChange={(event) => updateWallGroup('southOpenings', { [type]: { ...opening, enabled: event.target.checked } })} /><span>{type[0].toUpperCase() + type.slice(1)}</span></label>
                      <div className="field-grid">
                        <NumberField label="Width Â· m" value={opening.width} min={0.3} max={12} step={0.1} onChange={(width) => updateWallGroup('southOpenings', { [type]: { ...opening, width } })} />
                        <NumberField label="Height Â· m" value={opening.height} min={0.3} max={15} step={0.1} onChange={(height) => updateWallGroup('southOpenings', { [type]: { ...opening, height } })} />
                        <NumberField label="Center position" value={opening.position} min={-20} max={20} step={0.1} onChange={(position) => updateWallGroup('southOpenings', { [type]: { ...opening, position } })} />
                        {type === 'window' && <NumberField label="Sill height Â· m" value={opening.sillHeight} min={0} max={18} step={0.1} onChange={(sillHeight) => updateWallGroup('southOpenings', { window: { ...opening, sillHeight } })} />}
                      </div>
                    </div>
                  );
                })}
                <p className="zone-hint">Soldier courses remain above the door and above and below the window when bricks are enabled.</p>
              </CollapsiblePanel>

              <CollapsiblePanel panelRef={wallEastRef} open={!collapsedSections.wallEast} onToggle={() => toggleSection('wallEast')} title="East wall">
                {renderWallBondControls('east')}
              </CollapsiblePanel>

              <CollapsiblePanel panelRef={wallWestRef} open={!collapsedSections.wallWest} onToggle={() => toggleSection('wallWest')} title="West wall">
                {renderWallBondControls('west')}
              </CollapsiblePanel>

            </section>
          )}

          {rightTab === 'cover' && (
            <section className="inspector-section">
              <div className="section-heading"><Layers3 size={17} /><div><strong>Cover systems</strong><small>Choose Ahang or Karbandi · north-wall arch stays independent</small></div></div>
              <div className="cover-subtabs" role="tablist" aria-label="Cover system">
                <button type="button" role="tab" aria-selected={activeCoverType === 'karbandi'} className={activeCoverType === 'karbandi' ? 'active' : ''} onClick={() => setCoverEnabled('karbandi', true)}>Karbandi</button>
                <button type="button" role="tab" aria-selected={activeCoverType === 'ahang'} className={activeCoverType === 'ahang' ? 'active' : ''} onClick={() => setCoverEnabled('ahang', true)}>Ahang</button>
              </div>
              {activeCoverType === 'ahang' && <div ref={wallArchRef} className="cover-settings" role="tabpanel">
                <div className="cover-settings-heading"><strong>Ahang settings</strong><small>Arch-based portal cover</small></div>
                {renderWallBondControls('arch')}
                <p className="zone-hint">Ahang uses the arch designed in the North wall section and extends it across the portal enclosure.</p>
                <div className="field-grid">
                  <NumberField label="Top overlap" value={walls.pointedArch.overlap} min={0} max={0.5} step={0.01} onChange={(overlap) => updateWallGroup('pointedArch', { overlap })} />
                </div>
                <label className="check-field"><input type="checkbox" checked={walls.pointedArch.moduleInfill} onChange={(event) => updateWallGroup('pointedArch', { moduleInfill: event.target.checked })} /><span>Fill above open Muqarnas modules</span></label>
                <label><span>Muqarnas under arch</span><select value={archMuqarnasPlacement?.assetId || ''} onChange={(event) => setArchMuqarnasAsset(event.target.value)}>
                  <option value="">No Muqarnas selected</option>
                  {muqarnasAssets.map((asset) => <option value={asset.id} key={asset.id}>{asset.name} · v{asset.currentVersion?.version_number || '—'}</option>)}
                </select></label>
                <p className="zone-hint">{archMuqarnasPlacement ? 'Selected Muqarnas is auto-scaled to fit under the arch while preserving its aspect ratio.' : 'Save a Muqarnas assembly to your library, then choose it here to load it under the arch.'}</p>
                {archMuqarnasPlacement && (
                  <>
                    <fieldset><legend>Muqarnas position · metres</legend><div className="field-grid three">{['X', 'Y', 'Z'].map((axis, index) => <NumberField key={axis} label={axis} value={archMuqarnasPlacement.transform?.position?.[index] ?? 0} min={-20} max={20} step={0.05} onChange={(value) => updateArchMuqarnasVector('position', index, value)} />)}</div></fieldset>
                    <fieldset><legend>Muqarnas rotation · degrees</legend><div className="field-grid three">{['X', 'Y', 'Z'].map((axis, index) => <NumberField key={axis} label={axis} value={archMuqarnasPlacement.transform?.rotation?.[index] ?? 0} min={-360} max={360} step={1} onChange={(value) => updateArchMuqarnasVector('rotation', index, value)} />)}</div></fieldset>
                    <fieldset><legend>Muqarnas dimensions - metres</legend><div className="field-grid three">{['Width', 'Height', 'Depth'].map((label, index) => <NumberField key={label} label={label} value={Number((archMuqarnasDimensions?.[index] || 0).toFixed(3))} min={0.05} max={100} step={0.05} onChange={(value) => updateArchMuqarnasDimension(index, value)} />)}</div></fieldset>
                    <label className="check-field"><input type="checkbox" checked={archMuqarnasPlacement.options?.keepAspectRatio !== false} onChange={(event) => setArchMuqarnasKeepAspectRatio(event.target.checked)} /><span>Keep aspect ratio</span></label>
                    <div className="placement-actions">
                      <button type="button" onClick={refitArchMuqarnas}><Focus size={14} /> Refit under arch</button>
                      <button type="button" className="danger" onClick={deleteArchMuqarnas}><Trash2 size={14} /> Delete Muqarnas</button>
                    </div>
                  </>
                )}
              </div>}
              {activeCoverType === 'karbandi' && <div className="cover-settings" role="tabpanel">
                <div className="cover-settings-heading"><strong>Karbandi settings</strong><small>Rotating rib-vault cover</small></div>
                <div className="field-grid">
                  <label><span>Rib color</span><input type="color" value={walls.karbandi?.ribColor ?? walls.color} onChange={(event) => updateWallGroup('karbandi', { ribColor: event.target.value })} /></label>
                  <label><span>Roof finish</span><select value={walls.karbandi?.coverFinish ?? 'bricks'} onChange={(event) => updateWallGroup('karbandi', { coverFinish: event.target.value })}><option value="bricks">Bricks</option><option value="solid">Gypsum · solid color</option></select></label>
                  {walls.karbandi?.coverFinish === 'solid' && <label><span>Gypsum color</span><input type="color" value={walls.karbandi?.coverColor ?? '#eee8dc'} onChange={(event) => updateWallGroup('karbandi', { coverColor: event.target.value })} /></label>}
                </div>
                <label className="check-field"><input type="checkbox" checked={walls.karbandi?.coverEnabled === true} disabled={walls.karbandi?.enabled !== true} onChange={(event) => updateWallGroup('karbandi', { coverEnabled: event.target.checked })} /><span>Cover Karbandi roof</span></label>
                <p className="zone-hint">The web topology combines finite-width rib seating curves with the wall-head springing boundary. Perimeter bays therefore remain valid when ribs alone do not form a closed cycle.</p>
                <fieldset><legend>Web support boundary</legend>
                  <label><span>Support boundary mode</span><select value={walls.karbandi?.web?.supportBoundaryMode || 'automatic-walls'} onChange={(event) => updateKarbandiWeb({ supportBoundaryMode: event.target.value })}>
                    <option value="automatic-walls">Automatic from supporting walls</option>
                    <option value="selected-walls">Select supporting walls</option>
                    <option value="existing-curve">Select existing springing curve</option>
                    <option value="manual">Draw springing boundary manually</option>
                  </select></label>
                  {walls.karbandi?.web?.supportBoundaryMode === 'selected-walls' && <div className="field-grid">{['north', 'east', 'south', 'west'].map((side) => <label className="check-field" key={side}><input type="checkbox" checked={walls.karbandi.web.selectedWallSides.includes(side)} onChange={(event) => updateKarbandiWeb({ selectedWallSides: event.target.checked ? [...walls.karbandi.web.selectedWallSides, side] : walls.karbandi.web.selectedWallSides.filter((item) => item !== side) })} /><span>{side[0].toUpperCase() + side.slice(1)} wall</span></label>)}</div>}
                  {['existing-curve', 'manual'].includes(walls.karbandi?.web?.supportBoundaryMode) && !((walls.karbandi.web.supportBoundaryMode === 'existing-curve' ? walls.karbandi.web.existingSpringingCurve : walls.karbandi.web.manualSpringingBoundary)?.length > 2) && <p className="zone-hint">No springing curve is stored yet. Select or draw a piecewise-closed 3D boundary before generating perimeter cells.</p>}
                  <div className="field-grid">
                    <label><span>Soffit termination</span><select value={walls.karbandi?.web?.soffitTermination || 'inner-edge'} onChange={(event) => updateKarbandiWeb({ soffitTermination: event.target.value })}><option value="inner-edge">Inner wall-top edge</option><option value="wall-centre">Wall centre</option><option value="custom-offset">Custom offset</option></select></label>
                    {walls.karbandi?.web?.soffitTermination === 'custom-offset' && <NumberField label="Soffit custom offset · m" value={walls.karbandi.web.soffitCustomOffset} min={-5} max={5} step={0.01} onChange={(soffitCustomOffset) => updateKarbandiWeb({ soffitCustomOffset })} />}
                    <label><span>Springing tangent</span><select value={walls.karbandi?.web?.springingTangent || 'infer'} onChange={(event) => updateKarbandiWeb({ springingTangent: event.target.value })}><option value="infer">Infer from adjacent ribs</option><option value="average">Average adjacent rib tangents</option><option value="custom-angle">Custom angle</option><option value="position-only">Position only</option></select></label>
                    {walls.karbandi?.web?.springingTangent === 'custom-angle' && <NumberField label="Springing angle · degrees" value={walls.karbandi.web.springingAngle} min={-89} max={89} step={1} onChange={(springingAngle) => updateKarbandiWeb({ springingAngle })} />}
                     <NumberField label="Roof thickness · m" value={walls.karbandi?.web?.roofThickness ?? 0.1} min={0.01} max={2} step={0.01} onChange={(roofThickness) => updateKarbandiWeb({ roofThickness })} />
                     {walls.karbandi?.coverFinish === 'bricks' && <label><span>Roof infill brick color</span><input type="color" value={walls.karbandi?.web?.infillBrickColor ?? '#b9824f'} onChange={(event) => updateKarbandiWeb({ infillBrickColor: event.target.value })} /></label>}
                     {walls.karbandi?.coverFinish === 'bricks' && <label><span>Alternate infill brick color</span><input type="color" value={walls.karbandi?.web?.infillBrickColor2 ?? '#9f663b'} onChange={(event) => updateKarbandiWeb({ infillBrickColor2: event.target.value })} /></label>}
                     {walls.karbandi?.coverFinish === 'bricks' && <NumberField label="Roof infill brick height · m" value={walls.karbandi?.web?.infillBrickHeight ?? 0.06} min={0.01} max={0.5} step={0.005} onChange={(infillBrickHeight) => updateKarbandiWeb({ infillBrickHeight })} />}
                    <NumberField label="Wall bearing depth · m" value={walls.karbandi?.web?.wallBearingDepth ?? 0.15} min={0} max={5} step={0.01} onChange={(wallBearingDepth) => updateKarbandiWeb({ wallBearingDepth })} />
                    <NumberField label="Wall embed tolerance · m" value={walls.karbandi?.web?.wallEmbedTolerance ?? 0.005} min={0} max={0.1} step={0.001} onChange={(wallEmbedTolerance) => updateKarbandiWeb({ wallEmbedTolerance })} />
                    <NumberField label="Rib embed tolerance · m" value={walls.karbandi?.web?.ribEmbedTolerance ?? 0.003} min={0} max={0.1} step={0.001} onChange={(ribEmbedTolerance) => updateKarbandiWeb({ ribEmbedTolerance })} />
                    <NumberField label="Fallback seating offset · m" value={walls.karbandi?.web?.seatingOffset ?? 0} min={-1} max={1} step={0.005} onChange={(seatingOffset) => updateKarbandiWeb({ seatingOffset })} />
                    <label><span>Corner seat mode</span><select value={walls.karbandi?.web?.cornerSeatMode || 'rib-profile'} onChange={(event) => updateKarbandiWeb({ cornerSeatMode: event.target.value })}><option value="rib-profile">From actual rib profile</option><option value="chamfer">Automatic chamfer</option><option value="radius">Automatic radius</option><option value="custom-curve">Custom corner curve</option></select></label>
                    {walls.karbandi?.web?.cornerSeatMode === 'radius' && <NumberField label="Corner radius · m" value={walls.karbandi.web.cornerRadius} min={0.001} max={2} step={0.01} onChange={(cornerRadius) => updateKarbandiWeb({ cornerRadius })} />}
                  </div>
                  <label className="check-field"><input type="checkbox" checked={walls.karbandi?.web?.allowUnsupportedFreeEdge === true} onChange={(event) => updateKarbandiWeb({ allowUnsupportedFreeEdge: event.target.checked })} /><span>Allow unsupported free edge</span></label>
                  {!!walls.openSides.length && !walls.karbandi?.web?.allowUnsupportedFreeEdge && <p className="zone-hint">This cell has an unsupported perimeter edge. Select a wall, edge arch, beam, or springing boundary.</p>}
                </fieldset>
                <p className="zone-hint">Design one reference rib, then Mehraz rotates it around the midpoint of the north wall exterior face. When Karbandi is active, portal clipping is always applied at the north wall interior face and the exterior faces of the other three walls, trimming each clipped leg back to its first rib intersection. The cyan outline appears only while the reference rib is selected.</p>
                <div className="placement-actions">
                  <button type="button" className={walls.karbandi?.cutMode ? 'primary' : ''} onClick={() => updateWallGroup('karbandi', { cutMode: !walls.karbandi?.cutMode })}>{walls.karbandi?.cutMode ? 'Manual clip on' : 'Manual clip'}</button>
                  <button type="button" onClick={() => updateWallGroup('karbandi', { manualCuts: [] })}>Reset manual cuts</button>
                </div>
                <p className="zone-hint">In cut mode, click a Karbandi leg segment in the stage. Mehraz trims it to the first physical rib intersection—or to the next intersection when portal clipping already made the first cut. Current cuts: {walls.karbandi?.manualCuts?.length || 0}</p>
                <div className="field-grid">
                  <NumberField label="Rib count" value={walls.karbandi?.ribCount ?? DEFAULT_WALL_SYSTEM.karbandi.ribCount} min={2} max={64} step={1} onChange={(ribCount) => updateWallGroup('karbandi', { ribCount })} />
                  <NumberField label="Rotation offset · degrees" value={walls.karbandi?.rotationOffset ?? DEFAULT_WALL_SYSTEM.karbandi.rotationOffset} min={-360} max={360} step={1} onChange={(rotationOffset) => updateWallGroup('karbandi', { rotationOffset })} />
                  <NumberField label="Reference rib span · m" value={walls.karbandi?.span ?? DEFAULT_WALL_SYSTEM.karbandi.span} min={0.2} max={40} step={0.05} onChange={(span) => updateWallGroup('karbandi', { span })} />
                  <NumberField label="Reference rib angle · degrees" value={walls.karbandi?.referenceAngle ?? DEFAULT_WALL_SYSTEM.karbandi.referenceAngle} min={1} max={359} step={1} onChange={(referenceAngle) => updateWallGroup('karbandi', { referenceAngle })} />
                  <NumberField label="Spring height offset · m" value={walls.karbandi?.springHeightOffset ?? DEFAULT_WALL_SYSTEM.karbandi.springHeightOffset} min={-10} max={20} step={0.05} onChange={(springHeightOffset) => updateWallGroup('karbandi', { springHeightOffset })} />
                  <NumberField label="Green point offset · m" value={walls.karbandi?.greenOffset ?? DEFAULT_WALL_SYSTEM.karbandi.greenOffset} min={0.05} max={20} step={0.05} onChange={(greenOffset) => updateWallGroup('karbandi', { greenOffset })} />
                  <NumberField label="Green point height offset · m" value={walls.karbandi?.greenHeightOffset ?? DEFAULT_WALL_SYSTEM.karbandi.greenHeightOffset} min={-10} max={20} step={0.05} onChange={(greenHeightOffset) => updateWallGroup('karbandi', { greenHeightOffset })} />
                  <NumberField label="Rib band width · m" value={walls.karbandi?.ribWidth ?? DEFAULT_WALL_SYSTEM.karbandi.ribWidth} min={0.01} max={2} step={0.01} onChange={(ribWidth) => updateWallGroup('karbandi', { ribWidth })} />
                  <NumberField label="Rib depth · m" value={walls.karbandi?.ribDepth ?? DEFAULT_WALL_SYSTEM.karbandi.ribDepth} min={0.01} max={2} step={0.01} onChange={(ribDepth) => updateWallGroup('karbandi', { ribDepth })} />
                  <NumberField label="Reference move X · m" value={walls.karbandi?.referenceX ?? DEFAULT_WALL_SYSTEM.karbandi.referenceX} min={-40} max={40} step={0.05} onChange={(referenceX) => updateWallGroup('karbandi', { referenceX })} />
                  <NumberField label="Reference move Z · m" value={walls.karbandi?.referenceZ ?? DEFAULT_WALL_SYSTEM.karbandi.referenceZ} min={-40} max={40} step={0.05} onChange={(referenceZ) => updateWallGroup('karbandi', { referenceZ })} />
                  <NumberField label="Reference rotation · degrees" value={walls.karbandi?.referenceRotation ?? DEFAULT_WALL_SYSTEM.karbandi.referenceRotation} min={-360} max={360} step={1} onChange={(referenceRotation) => updateWallGroup('karbandi', { referenceRotation })} />
                </div>
                <fieldset><legend>Whole Karbandi transform</legend><div className="field-grid">
                  <NumberField label="Move X · m" value={walls.karbandi?.groupX ?? DEFAULT_WALL_SYSTEM.karbandi.groupX} min={-40} max={40} step={0.05} onChange={(groupX) => updateWallGroup('karbandi', { groupX })} />
                  <NumberField label="Move Y · m" value={walls.karbandi?.groupY ?? DEFAULT_WALL_SYSTEM.karbandi.groupY} min={-40} max={40} step={0.05} onChange={(groupY) => updateWallGroup('karbandi', { groupY })} />
                  <NumberField label="Move Z · m" value={walls.karbandi?.groupZ ?? DEFAULT_WALL_SYSTEM.karbandi.groupZ} min={-40} max={40} step={0.05} onChange={(groupZ) => updateWallGroup('karbandi', { groupZ })} />
                  <NumberField label="Rotate Y · degrees" value={walls.karbandi?.groupRotationY ?? DEFAULT_WALL_SYSTEM.karbandi.groupRotationY} min={-360} max={360} step={1} onChange={(groupRotationY) => updateWallGroup('karbandi', { groupRotationY })} />
                  <NumberField label="Uniform scale" value={walls.karbandi?.groupScale ?? DEFAULT_WALL_SYSTEM.karbandi.groupScale} min={0.05} max={20} step={0.05} onChange={(groupScale) => updateWallGroup('karbandi', { groupScale })} />
                </div></fieldset>
              </div>}
            </section>
          )}

          {rightTab === 'lights' && (
            <section className="inspector-section night-controls">
              <div className="section-heading"><Lightbulb size={17} /><div><strong>Night lights</strong><small>Stage preview and export spotlights</small></div></div>
              <CollapsiblePanel collapsible={false} title="Spotlight setup">
                <p className="zone-hint">Add spotlights, show their guides, then drag either the light source or red aiming point directly in the stage.</p>
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

          {rightTab === 'zones' && (
            <section className="inspector-section">
              <div className="section-heading"><ScanLine size={17} /><div><strong>FaÃ§ade zones</strong><small>Named architectural decoration areas</small></div></div>
              <CollapsiblePanel collapsible={false} title="Create and select zones">
                <label><span>New zone surface</span><select value={targetSurfaceId} onChange={(event) => changeTargetSurface(event.target.value)}>{surfaces.map((surface) => <option value={surface.id} key={surface.id}>{surface.label}</option>)}</select></label>
                <button className="primary" onClick={addZone}><Plus size={15} /> Add decoration zone</button>
                <div className="zone-list">
                  {zones.map((zone) => <button className={zone.id === selectedZoneId ? 'active' : ''} key={zone.id} onClick={() => {
                    setSelectedZoneId(zone.id);
                    setSelectedPlacementId(null);
                  }}><span style={{ background: zone.color }} /><div><strong>{zone.name}</strong><small>{surfaces.find((surface) => surface.id === zone.surfaceId)?.label || zone.surfaceId}</small></div></button>)}
                  {!zones.length && <p className="empty-state">Add a zone to define where decoration should fit on a wall or floor.</p>}
                </div>
              </CollapsiblePanel>
              {selectedZone && (
                <CollapsiblePanel collapsible={false} title="Selected zone">
                  <label><span>Zone name</span><input value={selectedZone.name} maxLength={80} onChange={(event) => updateSelectedZone({ name: event.target.value })} /></label>
                  <label><span>Surface</span><select value={selectedZone.surfaceId} onChange={(event) => changeZoneSurface(event.target.value)}>{surfaces.map((surface) => <option value={surface.id} key={surface.id}>{surface.label}</option>)}</select></label>
                  <label><span>Library pattern</span><select value={selectedZone.assetId || ''} onChange={(event) => assignPatternToSelectedZone(event.target.value)}>
                    <option value="">No pattern assigned</option>
                    {zonePatternAssets.map((asset) => <option value={asset.id} key={asset.id}>{asset.name} · {ASSET_LABELS[asset.asset_type]}</option>)}
                  </select></label>
                  {selectedZone.assetId && <p className="zone-hint">Assigned pattern: {selectedZone.assetName || zonePatternAssets.find((asset) => asset.id === selectedZone.assetId)?.name || 'Library pattern'} · automatically tessellated inside this zone.</p>}
                  <fieldset>
                    <legend>Zone bounds Â· metres</legend>
                    <div className="field-grid">
                      <NumberField label="Horizontal center" value={selectedZone.bounds.u} step={0.1} onChange={(value) => updateZoneBounds('u', value)} />
                      <NumberField label={selectedZone.surfaceId === 'floor' ? 'Depth center' : 'Height center'} value={selectedZone.bounds.v} step={0.1} onChange={(value) => updateZoneBounds('v', value)} />
                      <NumberField label="Width" value={selectedZone.bounds.width} min={0.2} max={30} step={0.1} onChange={(value) => updateZoneBounds('width', value)} />
                      <NumberField label="Height" value={selectedZone.bounds.height} min={0.2} max={20} step={0.1} onChange={(value) => updateZoneBounds('height', value)} />
                    </div>
                  </fieldset>
                  <div className="color-grid">
                    <label><span>Guide color</span><input type="color" value={selectedZone.color} onChange={(event) => updateSelectedZone({ color: event.target.value })} /></label>
                    <NumberField label="Guide opacity" value={selectedZone.opacity} min={0.04} max={0.5} step={0.02} onChange={(opacity) => updateSelectedZone({ opacity })} />
                  </div>
                  <p className="zone-hint">Zones now own the decoration: choose the wall, size the zone, then assign a Girih or brick pattern from the library dropdown.</p>
                  <button className="danger" onClick={deleteSelectedZone}><Trash2 size={15} /> Delete zone</button>
                </CollapsiblePanel>
              )}
            </section>
          )}

          {rightTab === 'construction' && (
            <section className="inspector-section">
              <div className="section-heading"><ClipboardList size={17} /><div><strong>Construction training</strong><small>Step-by-step shell and arch assembly</small></div></div>
              <CollapsiblePanel collapsible={false} title="Animation steps">
                <p className="zone-hint">Training sequence: vertical walls first, then two narrow arch guide ribs, then the full arch fill. South door and window openings stay cut during construction.</p>
                <div className="field-grid">
                  <NumberField label="Animation duration Â· sec" value={constructionDuration} min={3} max={90} step={1} onChange={setConstructionDuration} />
                  <label><span>Current step</span><select value={constructionStep} onChange={(event) => showConstructionStep(Number(event.target.value))}>{CONSTRUCTION_STEPS.map((step, index) => <option value={index} key={step.id}>{index + 1}. {step.title}</option>)}</select></label>
                </div>
                <div className="placement-actions">
                  <button className="primary" onClick={playConstructionSteps} disabled={constructionPlaying}><Plus size={14} /> Play animation</button>
                  <button onClick={stopConstructionSteps} disabled={!constructionPlaying}>Stop</button>
                </div>
                <div className="construction-step-list">
                  {CONSTRUCTION_STEPS.map((step, index) => (
                    <button
                      key={step.id}
                      className={index === constructionStep ? 'active' : ''}
                      onClick={() => showConstructionStep(index)}
                    >
                      <span>{index + 1}</span>
                      <div><strong>{step.title}</strong><small>{step.detail}</small></div>
                    </button>
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
                              {project.currentVersion?.payload?.previewImage || project.currentVersion?.payload?.thumbnail
                                ? <img src={project.currentVersion.payload.previewImage || project.currentVersion.payload.thumbnail} alt="" />
                                : <Building2 size={20} />}
                            </span>
                            <span className="project-copy">
                              <strong>{project.name}</strong>
                              <small>Current v{project.currentVersion?.version_number || '-'} - {versions.length} {versions.length === 1 ? 'version' : 'versions'}</small>
                            </span>
                            <FolderOpen size={15} />
                          </button>
                          <button type="button" className="danger" title={`Delete ${project.name}`} disabled={libraryBusy} onClick={() => deleteProject(project)}><Trash2 size={13} /></button>
                        </div>
                      </div>
                    );
                  })}
                  {!libraryBusy && !projects.length && <p className="empty-state">No Mehraz projects saved yet.</p>}
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
                            Version {version.version_number}{version.id === activeProject.current_version_id ? ' - Current' : ''} - {version.payload?.placements?.length || 0} placements
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="project-version-form-actions">
                      <button type="button" disabled={!selectedProjectVersion || libraryBusy} onClick={() => openProject(activeProject, selectedProjectVersion)}><FolderOpen size={14} /> Load version</button>
                      <button type="button" className="primary" disabled={!selectedProjectVersion || selectedProjectVersion.id === activeProject.current_version_id || libraryBusy} onClick={makeProjectVersionCurrent}><Save size={14} /> Set as current</button>
                    </div>
                  </div>
                )}
                <div className="project-summary"><span><strong>{assemblies.length}</strong> assemblies</span><span><strong>{placements.length}</strong> placements</span><span><strong>{new Set(placements.map((item) => item.assetVersionId)).size}</strong> pinned versions</span></div>
              </CollapsiblePanel>
            </section>
          )}
        </aside>
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
