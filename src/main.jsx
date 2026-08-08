import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { SSRPass } from 'three/examples/jsm/postprocessing/SSRPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ArrayBufferTarget, Muxer } from 'mp4-muxer';
import {
  Activity,
  ArrowRight,
  BarChart3,
  Box,
  Clock3,
  Download,
  EyeOff,
  FolderOpen,
  Frame,
  Grid3X3,
  GraduationCap,
  Image as ImageIcon,
  Layers3,
  Magnet,
  Menu,
  Minus,
  Moon,
  Palette,
  Plus,
  Play,
  Printer,
  Redo2,
  Save,
  Search,
  Settings2,
  ShoppingBag,
  Store,
  Sun,
  Trash2,
  Undo2,
  Upload,
  User,
  UsersRound,
  X,
} from 'lucide-react';
import * as THREE from 'three';
import { PUBLIC_MODEL_FILES, PUBLIC_MODEL_GROUPS } from './publicModelPieces.generated.js';
import { PUBLIC_TEMPLATE_FILES, PUBLIC_TEMPLATE_GROUPS } from './publicTemplates.generated.js';
import { loadAuthenticatedUser, supabase, supabaseConfigured } from './supabase.js';
import TrainingPage from './training.jsx';
import GIRIH_APPS from '../packages/girih-design/apps.json';
import { ASSET_CONTRACT_MANIFEST } from '../packages/asset-contracts/manifest.js';
import {
  archiveLibraryAsset,
  listLibraryAssets,
  listLibraryAssetVersions,
  saveLibraryAsset,
  setCurrentLibraryAssetVersion,
  updateLibraryAssetMetadata,
} from '../packages/library-client/index.js';
import './styles.css';
import './landing.css';

const STORAGE_KEY = 'girih.pieces.v1';
const ADMIN_SETTINGS_STORAGE_KEY = 'girih.pieceAdminSettings.v1';
const SHAMSEH_WIDTH_NORMALIZATION_STORAGE_KEY = 'girih.shamsehWidthNormalization.v1';
const GROUP_COLOR_PALETTES_STORAGE_KEY = 'girih.groupColorPalettes.v1';
const MODELS_STORAGE_KEY = 'girih.models.v1';
const MODELS_DATABASE_NAME = 'girih-model-library';
const MODELS_DATABASE_STORE = 'model-library';
const SURFACE_STICKERS_DATABASE_STORE = 'surface-sticker-library';
const SURFACE_STICKERS_STORAGE_KEY = 'girih.surfaceStickerLibrary.v1';
const MOTIFS_STORAGE_KEY = 'girih.motifs.v1';
const RECOVERY_DRAFT_STORAGE_KEY = 'girih.recoveryDraft.v1';
const PENDING_STUDIO_MODEL_ID_KEY = 'girih.pendingStudioModelId.v1';
const NIGHT_MODE_STORAGE_KEY = 'girih.nightMode.v1';
const GLASS_SETTINGS_STORAGE_KEY = 'girih.glassSettings.v1';
const ANALYSIS_VERSION = 7;
const SNAP_DISTANCE = 0.45;
const OBJ_DISPLAY_SIZE = 2.2;
const HISTORY_LIMIT = 80;
const TARGETED_REAL_BOUNDARY_NAMES = new Set(['setareh', 'maku']);
const REMOVED_DEFAULT_PIECE_IDS = new Set(['decagon', 'pentagon', 'bowtie', 'rhombus', 'dart']);
const LEGACY_MOROCCO_GROUP = '8 Morroco';
const LEGACY_MOROCCO_ID_PREFIX = '8-morroco-';
const MOROCCO_ID_PREFIX = '8-morocco-';
const SHAMSEH_REFERENCE_GROUP = '8 Morocco';
const SHAMSEH_REFERENCE_BY_GROUP = {
  '8 Morocco': 'Shamseh',
  '8 Persian': 'Shamseh',
  '10 Kond': 'Shamseh Kond',
  '10 Tond': 'Shamseh',
};
const UNIVERSAL_PIECE_HEIGHT = 0.08;
const SHAMSEH_WIDTH_NORMALIZATION_VERSION = 'morocco-shamseh-width-and-flat-height-v9';
const UNIVERSAL_PIECE_COLORS = {
  '8 Persian/Bazooband B': '#2f66ba',
  '8 Persian/Bazooband S': '#43857a',
  '8 Persian/Chalipa': '#ffffff',
  '8 Persian/Khuneh': '#2f66ba',
  '8 Persian/Moraba B': '#ffffff',
  '8 Persian/Moraba S': '#d50000',
  '8 Persian/Shamseh': '#ffd31a',
  '8 Persian/Tabl': '#5bbbed',
  '8 Persian/Zohreh': '#43857a',
  '10 Kond/Giveh': '#020818',
  '10 Kond/Loz': '#ffd31a',
  '10 Kond/Panj': '#ffd31a',
  '10 Kond/Sekro': '#020818',
  '10 Kond/Separi': '#ffd31a',
  '10 Kond/Setareh Shol': '#020818',
  '10 Kond/Shamseh Kond': '#ffffff',
  '10 Kond/Shesh Shol': '#ffd31a',
  '10 Kond/Sormehdan': '#020818',
  '10 Kond/Tabl': '#ffd31a',
  '10 Kond/Toranj Kond': '#020818',
  '10 Tond/Badami': '#3041b7',
  '10 Tond/Chenari': '#3041b7',
  '10 Tond/Maku': '#3041b7',
  '10 Tond/Setareh': '#ffffff',
  '10 Tond/Shamseh': '#ffd31a',
  '10 Tond/Shesh Band': '#3041b7',
  '10 Tond/Tah Borideh': '#3041b7',
  '10 Tond/Taragheh': '#ffffff',
  '10 Tond/Toranj': '#ffffff',
  '8 Morocco/Badami': '#66645f',
  '8 Morocco/Charsoo': '#ffffff',
  '8 Morocco/Chenari': '#619574',
  '8 Morocco/Flesh': '#ffffff',
  '8 Morocco/Gavi': '#619574',
  '8 Morocco/Ghayegh B': '#d38a32',
  '8 Morocco/Ghayegh S': '#a5a5a5',
  '8 Morocco/Gorz': '#619574',
  '8 Morocco/Khesht': '#d50000',
  '8 Morocco/Khuneh': '#ffffff',
  '8 Morocco/Lozi': '#d50000',
  '8 Morocco/Moraba': '#66645f',
  '8 Morocco/Mosalas': '#66645f',
  '8 Morocco/Nimpa': '#619574',
  '8 Morocco/Pabozi B': '#ffffff',
  '8 Morocco/Pabozi S': '#ffffff',
  '8 Morocco/Potk': '#ffffff',
  '8 Morocco/Setareh': '#d50000',
  '8 Morocco/Shamseh': '#d50000',
  '8 Morocco/Shesh': '#619574',
  '8 Morocco/Sormedan': '#ffffff',
  '8 Morocco/Tabl': '#619574',
  '8 Morocco/Toranj': '#ffffff',
};
const BUILT_IN_GROUP_PALETTE_ID = 'universal-default';
const EXPORT_MATERIALS = new Set(['glass', 'plastic', 'paper']);
const EDGE_LINE_MODES = new Set(['single', 'double', 'offset']);
const DEFAULT_SCENE_STYLE = 'presentation';
const STAGE_CAMERA_VIEWS = [
  { id: 'top', label: 'Top', position: [0, 6, 0.001], up: [0, 0, -1], lockRotate: true },
  { id: 'iso-ne', label: 'NE', position: [7.2, 6.4, 7.2], up: [0, 1, 0] },
  { id: 'iso-nw', label: 'NW', position: [-7.2, 6.4, 7.2], up: [0, 1, 0] },
  { id: 'iso-se', label: 'SE', position: [7.2, 6.4, -7.2], up: [0, 1, 0] },
  { id: 'iso-sw', label: 'SW', position: [-7.2, 6.4, -7.2], up: [0, 1, 0] },
];
const STAGE_CAMERA_VIEW_MAP = new Map(STAGE_CAMERA_VIEWS.map((view) => [view.id, view]));
const CAMERA_VIDEO_ROTATIONS = 1;
const CAMERA_VIDEO_FPS = 30;
const CAMERA_VIDEO_BITRATE = 20000000;
const CAMERA_VIDEO_WIDTH = 1920;
const CAMERA_VIDEO_HEIGHT = 1080;
const CAMERA_VIDEO_PRESETS = [
  { id: 'orbit-decline', label: 'Declining orbit · 10s', durationMs: 10000 },
  { id: 'top-spin-zoom', label: 'Top ¼ spin + zoom · 5s', durationMs: 5000 },
];
CAMERA_VIDEO_PRESETS.push({ id: 'center-assembly', label: 'Center assembly - 8s', durationMs: 8000, type: 'assembly' });
const CAMERA_VIDEO_PRESET_MAP = new Map(CAMERA_VIDEO_PRESETS.map((preset) => [preset.id, preset]));
const TEMPLATE_GROUP_LOGOS = {
  '8 Morocco': '/template-group-logos/8-morocco.png',
  '8 Persian': '/template-group-logos/8-persian.png',
  '10 Tond': '/template-group-logos/10-tond.png',
  '10 Kond': '/template-group-logos/10-kond.png',
};
const MARKETPLACE_CATEGORIES = ['10 Tond', '10 Kond', '8 Morocco', '8 Persian', 'Stickers'];
const DEFAULT_RENDER_SETTINGS = {
  backgroundColor: '#1b3f3a',
  edgeColor: '#123f3a',
  edgeThickness: 0,
  edgeMode: 'single',
  edgeOffsetCount: 2,
  edgeOffsetDistance: 4,
};
const EXPORT_FORMAT_OPTIONS = [
  { value: 'png', label: 'PNG image' },
  { value: 'png-transparent', label: 'PNG transparent' },
  { value: 'png-flat-color', label: '2D Color' },
  { value: 'svg', label: 'SVG vector' },
  { value: 'eps', label: 'EPS vector' },
  { value: 'dxf', label: 'DXF laser/CNC' },
  { value: 'stl', label: 'STL 3D print' },
  { value: 'pdf', label: 'PDF document' },
  { value: 'mp4', label: 'MP4 video' },
  { value: 'json', label: 'JSON model' },
  { value: 'obj', label: 'OBJ model' },
];
const EXPORT_PAPER_SIZES = [
  { value: 'canvas', label: 'Canvas 4:3', width: 4, height: 3, pdf: { width: 842, height: 595 } },
  { value: 'a4', label: 'A4', width: 210, height: 297, pdf: { width: 595, height: 842 } },
  { value: 'a3', label: 'A3', width: 297, height: 420, pdf: { width: 842, height: 1191 } },
  { value: 'letter', label: 'Letter', width: 8.5, height: 11, pdf: { width: 612, height: 792 } },
  { value: 'square', label: 'Square', width: 1, height: 1, pdf: { width: 720, height: 720 } },
];
const DEFAULT_EXPORT_PAPER_SIZE = 'canvas';
const TRANSPARENT_BACKGROUND_EXPORT_FORMATS = new Set(['png', 'png-flat-color']);
const GRAPHIC_2D_EXPORT_FORMATS = new Set(['png', 'png-transparent', 'png-flat-color', 'pdf']);
const EXPORT_2D_STYLE_OPTIONS = [
  { value: 'standard', label: 'Standard' },
  { value: 'pencil', label: 'Color pencil' },
  { value: 'paper-cut', label: 'Paper cut' },
  { value: 'hatch', label: '45° hatch' },
];
const EXPORT_2D_FORMATS = new Set(['png-flat-color', 'png-transparent', 'svg', 'eps', 'dxf', 'pdf']);
const EXPORT_2D_GRAPHIC_FORMATS = new Set(['png-flat-color', 'png-transparent', 'pdf']);
const EXPORT_3D_FORMATS = new Set(['png', 'pdf', 'mp4', 'stl', 'json', 'obj']);
const FREE_LIBRARY_GROUP = '10 Tond';
const FREE_EXPORT_FORMATS = new Set(['png', 'png-flat-color']);
const USER_ROLES = {
  ADMIN: 'admin',
  PAID: 'paid',
  FREE: 'free',
};
const GIRIH_STUDIO_APP_ORIGINS = new Set([
  'https://girihstudio.com',
  'https://bricks.girihstudio.com',
  'https://muqarnas.girihstudio.com',
  'https://mehraz.girihstudio.com',
]);

function safeAppReturnUrl() {
  const value = new URLSearchParams(window.location.search).get('nextApp');
  if (!value) return '';
  try {
    const url = new URL(value);
    const local = ['localhost', '127.0.0.1'].includes(url.hostname);
    return GIRIH_STUDIO_APP_ORIGINS.has(url.origin) || local ? url.toString() : '';
  } catch {
    return '';
  }
}

function accountAuthRedirectUrl() {
  const nextApp = safeAppReturnUrl();
  if (!nextApp) return `${window.location.origin}/app`;
  const callback = new URL('/app', window.location.origin);
  callback.searchParams.set('mode', 'login');
  callback.searchParams.set('nextApp', nextApp);
  return callback.toString();
}
const DEFAULT_MODEL_TRANSFORM = {
  scaleX: 1,
  scaleY: 1,
  scaleZ: 1,
  positionX: 0,
  positionY: 0,
  positionZ: 0,
  rotationX: 0,
  rotationY: 0,
  rotationZ: 0,
};
const STAGE_HEMISPHERE_LIGHT = {
  sky: '#fff7e8',
  ground: '#3e506b',
  intensity: 1.4,
};
const STAGE_KEY_LIGHT = {
  color: '#ffffff',
  intensity: 2,
  position: [3, 6, 4],
};
const EXPORT_SHADOW_QUALITY_SCALE = 1.3;
const EXPORT_SHADOW_MAP_SIZE = 8192;
const EXPORT_RENDER_SCALE = 1.5;
const GLASS_EXPORT_RENDER_SCALE = 0.5;
const GLASS_HDR_ENVIRONMENT_URL = '/environment/studio_small_09_1k.hdr';
const GLASS_IOR = 1.5;
const GLASS_MIN_OPTICAL_THICKNESS = 0.03;
const GLASS_MAX_OPTICAL_THICKNESS = 0.08;
const GLASS_POSTPROCESS_PIECE_LIMIT = 160;
const GLASS_SSR_PIECE_LIMIT = 72;
const DEFAULT_GLASS_SETTINGS = Object.freeze({
  transparency: 0.92,
  thickness: 0.055,
  reflection: 0.58,
  highlight: 0.62,
  edgeDarkness: 0.34,
  shadow: 0.42,
  frosted: 0.06,
  glossiness: 0.82,
});
const GLASS_CONTROL_FIELDS = [
  { id: 'transparency', label: 'Transparency', min: 55, max: 98, step: 1, unit: '%' },
  { id: 'thickness', label: 'Thickness', min: 3, max: 8, step: 0.5, unit: ' mm' },
  { id: 'reflection', label: 'Reflection', min: 0, max: 100, step: 1, unit: '%' },
  { id: 'highlight', label: 'Highlight', min: 0, max: 100, step: 1, unit: '%' },
  { id: 'edgeDarkness', label: 'Edge darkness', min: 0, max: 100, step: 1, unit: '%' },
  { id: 'shadow', label: 'Shadow intensity', min: 0, max: 100, step: 1, unit: '%' },
  { id: 'frosted', label: 'Frosted amount', min: 0, max: 100, step: 1, unit: '%' },
  { id: 'glossiness', label: 'Glossiness', min: 0, max: 100, step: 1, unit: '%' },
];
const SURFACE_STICKER_SHAPE_TYPES = new Set(['circle', 'rectangle', 'triangle', 'line']);
const SURFACE_STICKER_MAX_SHAPES = 64;
const SURFACE_STICKER_IMAGE_SIZE = 1024;
const SURFACE_STICKER_TEXTURE_SIZE = 1024;
const MOBILE_EXPORT_RENDER_SCALE = 1;
const MOBILE_EXPORT_SHADOW_MAP_SIZE = 2048;
const MOBILE_EXPORT_MAX_PIXELS = 8_000_000;
const DESKTOP_EXPORT_MAX_PIXELS = 18_000_000;
const PAPER_BACKGROUND_COLOR = '#ffffff';
const PAPER_EDGE_COLOR = '#000000';
const PAPER_EDGE_THICKNESS = 3;
const PAPER_STAGE_ORTHO_HEIGHT = 12;
const MODEL_TRANSFORM_FIELDS = [
  { id: 'scaleX', label: 'Scale X', min: 0.05, step: 0.05 },
  { id: 'scaleY', label: 'Scale Y', min: 0.05, step: 0.05 },
  { id: 'scaleZ', label: 'Scale Z', min: 0.05, step: 0.05 },
  { id: 'positionX', label: 'Position X', step: 0.1 },
  { id: 'positionY', label: 'Position Y', step: 0.1 },
  { id: 'positionZ', label: 'Position Z', step: 0.1 },
  { id: 'rotationX', label: 'Rotate X', step: 1 },
  { id: 'rotationY', label: 'Rotate Y', step: 1 },
  { id: 'rotationZ', label: 'Rotate Z', step: 1 },
];

function getStageCameraView(view) {
  return STAGE_CAMERA_VIEW_MAP.get(view) || STAGE_CAMERA_VIEW_MAP.get('top');
}

function normalizeCameraSnapshot(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.position) || !Array.isArray(snapshot.target) || !Array.isArray(snapshot.up)) return null;
  const position = snapshot.position.map(Number);
  const target = snapshot.target.map(Number);
  const up = snapshot.up.map(Number);
  const fov = Number(snapshot.fov);
  if (
    position.length !== 3 ||
    target.length !== 3 ||
    up.length !== 3 ||
    !position.every(Number.isFinite) ||
    !target.every(Number.isFinite) ||
    !up.every(Number.isFinite)
  ) {
    return null;
  }
  return {
    position,
    target,
    up,
    fov: Number.isFinite(fov) && fov > 0 ? fov : 42,
  };
}

function normalizeModelTransform(transform = {}) {
  const source = transform || {};
  const scaleX = parsePositiveTransformNumber(source.scaleX, DEFAULT_MODEL_TRANSFORM.scaleX);
  const scaleY = parsePositiveTransformNumber(source.scaleY, DEFAULT_MODEL_TRANSFORM.scaleY);
  const scaleZ = parsePositiveTransformNumber(source.scaleZ, DEFAULT_MODEL_TRANSFORM.scaleZ);
  return {
    scaleX,
    scaleY,
    scaleZ,
    positionX: parseTransformNumber(source.positionX, DEFAULT_MODEL_TRANSFORM.positionX),
    positionY: parseTransformNumber(source.positionY, DEFAULT_MODEL_TRANSFORM.positionY),
    positionZ: parseTransformNumber(source.positionZ, DEFAULT_MODEL_TRANSFORM.positionZ),
    rotationX: parseTransformNumber(source.rotationX, DEFAULT_MODEL_TRANSFORM.rotationX),
    rotationY: parseTransformNumber(source.rotationY, DEFAULT_MODEL_TRANSFORM.rotationY),
    rotationZ: parseTransformNumber(source.rotationZ, DEFAULT_MODEL_TRANSFORM.rotationZ),
  };
}

function parseTransformNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function parsePositiveTransformNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function applyModelTransform(object, transform) {
  const normalized = normalizeModelTransform(transform);
  object.position.set(normalized.positionX, normalized.positionY, normalized.positionZ);
  object.scale.set(normalized.scaleX, normalized.scaleY, normalized.scaleZ);
  object.rotation.set(
    THREE.MathUtils.degToRad(normalized.rotationX),
    THREE.MathUtils.degToRad(normalized.rotationY),
    THREE.MathUtils.degToRad(normalized.rotationZ),
  );
}

const PUBLIC_MODEL_PIECES = PUBLIC_MODEL_FILES.map((piece) => publicModelPiece(piece.id, piece.name, piece.filename, piece.color, piece.group));
const PUBLIC_TEMPLATES = PUBLIC_TEMPLATE_FILES.map((template) => publicTemplate(template.id, template.name, template.filename, template.group));

const DEFAULT_PIECES = [...PUBLIC_MODEL_PIECES];
const DEFAULT_PIECE_BY_ID = new Map(DEFAULT_PIECES.map((piece) => [piece.id, piece]));

function publicTemplate(id, name, filename, group = 'Default') {
  return {
    id,
    name,
    filename,
    group: normalizePieceGroupName(group),
    src: `/templates/${encodeModelPath(filename)}`,
  };
}

function publicModelPiece(id, name, filename, color, group = 'Default') {
  const normalizedGroup = normalizePieceGroupName(group);
  const universalColor = universalPieceColor(normalizedGroup, name) || color;
  return {
    id,
    name,
    group: normalizedGroup,
    color: universalColor,
    defaultColor: universalColor,
    height: 0.18,
    type: 'glb',
    glbUrl: `/models/${encodeModelPath(filename)}`,
    points: [
      [-0.55, -0.55],
      [0.55, -0.55],
      [0.55, 0.55],
      [-0.55, 0.55],
    ],
    snapEdges: [],
    verticalEdges: [],
    displayEdges: [],
    offsetLinesEnabled: true,
    sourceHeightPx: '',
    sourceWidthPx: '',
    sourceLengthPx: '',
    sourceFootprintScale: '',
    keepAspectRatio: true,
    analysisVersion: 0,
  };
}

function universalPieceColor(group, name) {
  return UNIVERSAL_PIECE_COLORS[`${normalizePieceGroupName(group)}/${name}`] || null;
}

function encodeModelPath(path) {
  return String(path)
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

function useMobileViewport() {
  const readMobile = () => {
    if (typeof window === 'undefined') return false;
    const nav = window.navigator || {};
    const touchDevice = nav.maxTouchPoints > 0;
    const mobileUserAgent = /Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent || '');
    const narrowViewport = window.innerWidth <= 820 || window.innerHeight <= 820;
    return mobileUserAgent || (touchDevice && narrowViewport);
  };
  const [mobile, setMobile] = useState(readMobile);
  useEffect(() => {
    const update = () => setMobile(readMobile());
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);
  return mobile;
}

function SharedLibraryModelControls({
  signedIn,
  assets,
  activeAssetId,
  selectedAssetId,
  selectedVersionId,
  editForm,
  versions,
  busy,
  status,
  canSave,
  onSave,
  onOpen,
  onRefresh,
  onSelect,
  onEditChange,
  onRename,
  onArchive,
  onSelectVersion,
  onMakeCurrentVersion,
}) {
  const selectedAsset = assets.find((asset) => asset.id === selectedAssetId) || assets[0] || null;
  const selectedVersion = versions.find((version) => version.id === selectedVersionId) || selectedAsset?.currentVersion || null;
  return (
    <div className="shared-library-models">
      <div className="shared-library-heading">
        <span><FolderOpen size={14} /> Shared library</span>
        {signedIn && <button type="button" onClick={onRefresh} disabled={busy}>Refresh</button>}
      </div>
      {!signedIn ? <small>Sign in to save and open models across Girih Studio apps.</small> : (
        <div className="shared-library-columns">
          <section className="shared-library-list-column">
            <button type="button" className="shared-library-save" onClick={onSave} disabled={!canSave || busy}>
              <Save size={14} /> {activeAssetId ? 'Save new version' : 'Save to library'}
            </button>
            <div className="model-list">
              {assets.map((asset) => (
                <button type="button" className={`model-row ${asset.id === selectedAsset?.id ? 'is-active' : ''}`} key={asset.id} onClick={() => onSelect(asset)}>
                  <SharedLibraryThumbnail asset={asset} version={asset.currentVersion} />
                  <span>
                    <strong>{asset.name}</strong>
                    <small>Version {asset.currentVersion?.version_number || '—'}{asset.owned ? '' : ' · shared'}</small>
                  </span>
                  <FolderOpen size={14} />
                </button>
              ))}
              {!busy && !assets.length && <small>No Girih models in your shared library yet.</small>}
            </div>
          </section>
          {selectedAsset ? (
            <section className="shared-library-manager-card">
              <SharedLibraryThumbnail asset={selectedAsset} version={selectedVersion} />
              <strong>{selectedAsset.name}</strong>
              <small>Current version {selectedAsset.currentVersion?.version_number || '—'}</small>
              <label>Name<input value={editForm.name} onChange={(event) => onEditChange({ ...editForm, name: event.target.value })} maxLength={120} /></label>
              <label>Description<input value={editForm.description} onChange={(event) => onEditChange({ ...editForm, description: event.target.value })} maxLength={2000} /></label>
              <div className="shared-library-manager-actions">
                <button type="button" onClick={() => onOpen(selectedAsset)} disabled={busy}>Open selected</button>
                <button type="button" onClick={onRename} disabled={busy}>Rename</button>
                <button type="button" className="danger" onClick={() => onArchive(selectedAsset)} disabled={busy}>Archive</button>
              </div>
              <div className="shared-library-version-list">
                <strong>Versions</strong>
                {versions.map((version) => {
                  const current = version.id === selectedAsset.current_version_id;
                  return (
                    <button type="button" key={version.id} className={version.id === selectedVersionId ? 'active' : ''} onClick={() => onSelectVersion(version.id)}>
                      <span>Version {version.version_number}{current ? ' · current' : ''}</span>
                      {!current && <em onClick={(event) => { event.stopPropagation(); onMakeCurrentVersion(selectedAsset, version); }}>Make current</em>}
                    </button>
                  );
                })}
              </div>
            </section>
          ) : <section className="shared-library-manager-card shared-library-empty-detail"><FolderOpen size={28} /><span>Select an item to preview and manage it.</span></section>}
        </div>
      )}
      {status && <small className="shared-library-status">{status}</small>}
    </div>
  );
}

function App() {
  const isMobileViewport = useMobileViewport();
  const [pieces, setPieces] = usePersistentPieces();
  const [savedModels, setSavedModels, persistSavedModels] = usePersistentModels();
  const [savedMotifs, setSavedMotifs] = usePersistentMotifs();
  const [sharedLibraryModels, setSharedLibraryModels] = useState([]);
  const [activeLibraryAssetId, setActiveLibraryAssetId] = useState(null);
  const [selectedLibraryAssetId, setSelectedLibraryAssetId] = useState('');
  const [sharedLibraryEdit, setSharedLibraryEdit] = useState({ name: '', description: '' });
  const [sharedLibraryVersions, setSharedLibraryVersions] = useState([]);
  const [selectedLibraryVersionId, setSelectedLibraryVersionId] = useState('');
  const [libraryEditReturnTo, setLibraryEditReturnTo] = useState('');
  const [sharedLibraryBusy, setSharedLibraryBusy] = useState(false);
  const [sharedLibraryStatus, setSharedLibraryStatus] = useState('');
  const [sharedLibraryDialogOpen, setSharedLibraryDialogOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [authMode, setAuthMode] = useState(() => (new URLSearchParams(window.location.search).get('mode') === 'signup' ? 'signup' : 'login'));
  const [loginName, setLoginName] = useState('');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginMessage, setLoginMessage] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [billingBusy, setBillingBusy] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const {
    placed,
    commitPlaced,
    replacePlaced,
    undoStage,
    redoStage,
    canUndo,
    canRedo,
  } = useStageHistory([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [activeGroupId, setActiveGroupId] = useState(null);
  const [stageGroups, setStageGroups] = useState([]);
  const [clipboardPieces, setClipboardPieces] = useState([]);
  const clipboardPiecesRef = useRef([]);
  const placedRef = useRef(placed);
  const selectedIdsRef = useRef([]);
  const checkoutRefreshStartedRef = useRef(false);
  const libraryHandoffLoadedRef = useRef(false);
  const shamsehWidthNormalizationAppliedRef = useRef(false);
  const recoveryDraftInitializedRef = useRef(false);
  const allowPageExitRef = useRef(false);
  const exportPreviewCanvasRef = useRef(null);
  const cameraVideoRecordingRef = useRef(false);
  const cameraVideoProgressRef = useRef(null);
  const [material, setMaterial] = useState('plastic');
  const [glassSettings, setGlassSettings] = useState(readGlassSettings);
  const [draft, setDraft] = useState(emptyDraft());
  const [editingId, setEditingId] = useState(null);
  const [surfaceEditorPieceId, setSurfaceEditorPieceId] = useState(null);
  const [surfaceStickerDraft, setSurfaceStickerDraft] = useState(() => normalizeSurfaceSticker());
  const [contextMenu, setContextMenu] = useState(null);
  const [modelName, setModelName] = useState('');
  const [motifName, setMotifName] = useState('');
  const [selectedMotifId, setSelectedMotifId] = useState('');
  const [motifRows, setMotifRows] = useState(2);
  const [motifColumns, setMotifColumns] = useState(3);
  const [motifGapX, setMotifGapX] = useState(0);
  const [motifGapY, setMotifGapY] = useState(0);
  const [modelTransform, setModelTransform] = useState(DEFAULT_MODEL_TRANSFORM);
  const [modelTransformKeepAspect, setModelTransformKeepAspect] = useState(true);
  const [snappingEnabled, setSnappingEnabled] = useState(true);
  const [nightMode, setNightMode] = useState(() => localStorage.getItem(NIGHT_MODE_STORAGE_KEY) === 'true');
  const [stageCamera, setStageCamera] = useState('top');
  const [cameraVideoPlaying, setCameraVideoPlaying] = useState(false);
  const [cameraVideoPreset, setCameraVideoPreset] = useState(CAMERA_VIDEO_PRESETS[0].id);
  const [cameraPresetMenuOpen, setCameraPresetMenuOpen] = useState(false);
  const [cameraVideoProgress, setCameraVideoProgress] = useState(0);
  const [assemblyVideoDurationSec, setAssemblyVideoDurationSec] = useState(8);
  const [exportOrientation, setExportOrientation] = useState('landscape');
  const [exportFormat, setExportFormat] = useState('png');
  const [exportDimensionMode, setExportDimensionMode] = useState('3d');
  const [export3DMaterial, setExport3DMaterial] = useState(material);
  const [export3DCamera, setExport3DCamera] = useState(stageCamera);
  const [export3DShadows, setExport3DShadows] = useState(true);
  const [exportPaperSize, setExportPaperSize] = useState(DEFAULT_EXPORT_PAPER_SIZE);
  const [exportTransparentBackground, setExportTransparentBackground] = useState(false);
  const [export2DStyle, setExport2DStyle] = useState('standard');
  const [exportPencilColor, setExportPencilColor] = useState('#526f9c');
  const [exportPencilIntensity, setExportPencilIntensity] = useState(65);
  const [exportPaperGap, setExportPaperGap] = useState(8);
  const [exportPaperCutOut, setExportPaperCutOut] = useState(false);
  const [exportHatchSpacing, setExportHatchSpacing] = useState(10);
  const [exportHatchThickness, setExportHatchThickness] = useState(1.5);
  const [exportHatchAngle, setExportHatchAngle] = useState(45);
  const [exportHatchOutline, setExportHatchOutline] = useState(2);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportPreview, setExportPreview] = useState(null);
  const [exportPreviewLoading, setExportPreviewLoading] = useState(false);
  const [exportPreviewError, setExportPreviewError] = useState('');
  const [exportPreviewZoom, setExportPreviewZoom] = useState(1);
  const [exportPreviewPan, setExportPreviewPan] = useState({ x: 0, y: 0 });
  const [itemSummaryOpen, setItemSummaryOpen] = useState(false);
  const [pendingNavigationUrl, setPendingNavigationUrl] = useState('');
  const [savedDesignSignature, setSavedDesignSignature] = useState(() =>
    designStateSignature([], 'plastic', DEFAULT_RENDER_SETTINGS, DEFAULT_MODEL_TRANSFORM),
  );
  const [renderBgColor, setRenderBgColor] = useState(DEFAULT_RENDER_SETTINGS.backgroundColor);
  const [renderEdgeColor, setRenderEdgeColor] = useState(DEFAULT_RENDER_SETTINGS.edgeColor);
  const [renderEdgeThickness, setRenderEdgeThickness] = useState(DEFAULT_RENDER_SETTINGS.edgeThickness);
  const [renderEdgeMode, setRenderEdgeMode] = useState(DEFAULT_RENDER_SETTINGS.edgeMode);
  const [renderEdgeOffsetCount, setRenderEdgeOffsetCount] = useState(DEFAULT_RENDER_SETTINGS.edgeOffsetCount);
  const [renderEdgeOffsetDistance, setRenderEdgeOffsetDistance] = useState(DEFAULT_RENDER_SETTINGS.edgeOffsetDistance);
  const [exportBgColor, setExportBgColor] = useState(DEFAULT_RENDER_SETTINGS.backgroundColor);
  const [exportEdgeColor, setExportEdgeColor] = useState(DEFAULT_RENDER_SETTINGS.edgeColor);
  const [exportEdgeThickness, setExportEdgeThickness] = useState(DEFAULT_RENDER_SETTINGS.edgeThickness);
  const [exportEdgeOffsetCount, setExportEdgeOffsetCount] = useState(DEFAULT_RENDER_SETTINGS.edgeOffsetCount);
  const [exportEdgeOffsetDistance, setExportEdgeOffsetDistance] = useState(DEFAULT_RENDER_SETTINGS.edgeOffsetDistance);
  const [liveShadowsEnabled, setLiveShadowsEnabled] = useState(false);
  const [mobilePiecesOpen, setMobilePiecesOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileAdminOpen, setMobileAdminOpen] = useState(false);
  const [templatePanelOpen, setTemplatePanelOpen] = useState(false);
  const [templateStagePreviewVisible, setTemplateStagePreviewVisible] = useState(false);
  const [activeTemplateGroup, setActiveTemplateGroup] = useState(() => normalizePieceGroupName(PUBLIC_MODEL_GROUPS[0] || PUBLIC_TEMPLATE_GROUPS[0]));
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [templatePreviewView, setTemplatePreviewView] = useState({ scale: 1, x: 0, y: 0 });
  const [frameMode, setFrameMode] = useState(false);
  const [framePointIds, setFramePointIds] = useState([]);
  const [collapsedPieceGroups, setCollapsedPieceGroups] = useState(() => new Set(PUBLIC_MODEL_GROUPS.map(normalizePieceGroupName)));
  const [collapsedAdminGroups, setCollapsedAdminGroups] = useState(() => new Set(PUBLIC_MODEL_GROUPS.map(normalizePieceGroupName)));
  const [collapsedPaletteGroups, setCollapsedPaletteGroups] = useState(() => new Set());
  const [groupColorPalettes, setGroupColorPalettes] = useState(readGroupColorPalettes);
  const [selectedGroupPalettes, setSelectedGroupPalettes] = useState({});
  const [adminGroupHeightInputs, setAdminGroupHeightInputs] = useState({});
  const [modelTransformCollapsed, setModelTransformCollapsed] = useState(true);
  const [motifsCollapsed, setMotifsCollapsed] = useState(true);
  const [stageVisibleBounds, setStageVisibleBounds] = useState(null);
  const [stageCameraSnapshot, setStageCameraSnapshot] = useState(null);
  const importSceneInputRef = useRef(null);
  const templatePreviewDragRef = useRef(null);
  const templatePreviewPointersRef = useRef(new Map());
  const exportPreviewPanDragRef = useRef(null);
  const userRole = normalizeUserRole(currentUser?.role);
  const isAdminUser = userRole === USER_ROLES.ADMIN;
  const isPaidUser = userRole === USER_ROLES.PAID;
  const isFreeUser = userRole === USER_ROLES.FREE;
  const canUseAdmin = isAdminUser || isPaidUser;
  const canUsePalettes = isAdminUser || isPaidUser;
  const canUseAdvancedTools = isAdminUser || isPaidUser;
  const canUseGrouping = isAdminUser || isPaidUser;
  const canUseTemplates = isAdminUser || isPaidUser;
  useEffect(() => {
    if (!currentUser) {
      setSharedLibraryModels([]);
      setActiveLibraryAssetId(null);
      return;
    }
    refreshGirihLibrary();
  }, [currentUser?.id]);
  const allowedLibraryGroups = useMemo(
    () => (isFreeUser ? [normalizePieceGroupName(FREE_LIBRARY_GROUP)] : PUBLIC_MODEL_GROUPS.map(normalizePieceGroupName)),
    [isFreeUser],
  );
  const availablePieces = useMemo(
    () => pieces.filter((piece) => allowedLibraryGroups.includes(normalizePieceGroupName(piece.group))),
    [pieces, allowedLibraryGroups],
  );
  const availableTemplates = useMemo(
    () => (canUseTemplates ? PUBLIC_TEMPLATES.filter((template) => allowedLibraryGroups.includes(normalizePieceGroupName(template.group))) : []),
    [allowedLibraryGroups, canUseTemplates],
  );
  const availableExportOptions = useMemo(
    () => (isFreeUser ? EXPORT_FORMAT_OPTIONS.filter((option) => FREE_EXPORT_FORMATS.has(option.value)) : EXPORT_FORMAT_OPTIONS),
    [isFreeUser],
  );
  const contextualExportOptions = useMemo(() => {
    const formatSet = exportDimensionMode === '2d'
      ? export2DStyle === 'standard' ? EXPORT_2D_FORMATS : EXPORT_2D_GRAPHIC_FORMATS
      : EXPORT_3D_FORMATS;
    return availableExportOptions.filter((option) => formatSet.has(option.value));
  }, [availableExportOptions, exportDimensionMode, export2DStyle]);

  const groupedPlaced = useMemo(() => {
    const explicitGroupByPieceId = new Map();
    stageGroups.forEach((group) => group.ids.forEach((id) => explicitGroupByPieceId.set(id, group.id)));
    return placed.map((item) => ({
      ...item,
      groupInstanceId: item.groupInstanceId || explicitGroupByPieceId.get(item.id) || null,
    }));
  }, [placed, stageGroups]);
  const activeDesignSignature = useMemo(
    () => designStateSignature(groupedPlaced, material, {
      backgroundColor: renderBgColor,
      edgeColor: renderEdgeColor,
      edgeThickness: renderEdgeThickness,
      edgeMode: renderEdgeMode,
      edgeOffsetCount: renderEdgeOffsetCount,
      edgeOffsetDistance: renderEdgeOffsetDistance,
    }, modelTransform),
    [
      groupedPlaced,
      material,
      renderBgColor,
      renderEdgeColor,
      renderEdgeThickness,
      renderEdgeMode,
      renderEdgeOffsetCount,
      renderEdgeOffsetDistance,
      modelTransform,
    ],
  );
  const designHasUnsavedChanges = groupedPlaced.length > 0 && activeDesignSignature !== savedDesignSignature;
  const visibleGroupedPlaced = useMemo(() => groupedPlaced.filter((item) => !item.hidden), [groupedPlaced]);
  const stagePreviewPlaced = useMemo(() => {
    if (!surfaceEditorPieceId) return visibleGroupedPlaced;
    const previewSticker = normalizeSurfaceSticker(surfaceStickerDraft);
    const surfaceSticker = hasSurfaceStickerContent(previewSticker) ? previewSticker : undefined;
    return visibleGroupedPlaced.map((item) => (
      item.sourceId === surfaceEditorPieceId
        ? { ...item, surfaceSticker, surfaceStickerPreview: true }
        : item
    ));
  }, [visibleGroupedPlaced, surfaceEditorPieceId, surfaceStickerDraft]);
  const selected = visibleGroupedPlaced.find((item) => item.id === selectedId);
  const activeGroupPieces = activeGroupId ? visibleGroupedPlaced.filter((item) => item.groupInstanceId === activeGroupId) : [];
  const rawSelectedPieces = selectedIds.map((id) => visibleGroupedPlaced.find((item) => item.id === id)).filter(Boolean);
  const selectedPieces = activeGroupPieces.length > 1 ? activeGroupPieces : rawSelectedPieces;
  const selectedGroupId =
    activeGroupPieces.length > 1
      ? activeGroupId
      : selectedPieces.length > 1 && selectedPieces.every((piece) => piece.groupInstanceId && piece.groupInstanceId === selectedPieces[0].groupInstanceId)
        ? selectedPieces[0].groupInstanceId
      : null;
  const selectedGroupPieces = selectedGroupId ? visibleGroupedPlaced.filter((item) => item.groupInstanceId === selectedGroupId) : [];
  const selectedIsWholeGroup = selectedGroupId && selectedGroupPieces.length === selectedPieces.length;
  const hasClipboardPieces = clipboardPieces.length > 0 || clipboardPiecesRef.current.length > 0;
  const selectedObjectCount = selectedPieces.length;
  const groupedObjectCount = Math.max(stageGroups.length, Array.from(
    visibleGroupedPlaced.reduce((groups, item) => {
      if (!item.groupInstanceId) return groups;
      groups.set(item.groupInstanceId, (groups.get(item.groupInstanceId) || 0) + 1);
      return groups;
    }, new Map()).values(),
  ).filter((count) => count > 1).length);
  const itemSummaryItems = useMemo(() => buildItemSummaryItems(visibleGroupedPlaced), [visibleGroupedPlaced]);
  const completed = visibleGroupedPlaced.length >= 7 && countSnappedPairs(visibleGroupedPlaced) >= 5;
  const pieceGroups = useMemo(() => groupLibraryPieces(availablePieces, allowedLibraryGroups), [availablePieces, allowedLibraryGroups]);
  const adminPieceGroups = useMemo(() => groupLibraryPieces(pieces, PUBLIC_MODEL_GROUPS), [pieces]);
  const palettePieceGroups = useMemo(() => groupLibraryPieces(availablePieces, allowedLibraryGroups), [availablePieces, allowedLibraryGroups]);
  const templates = availableTemplates;
  const templateGroups = useMemo(
    () => groupTemplateLibrary(templates, [...allowedLibraryGroups, ...PUBLIC_TEMPLATE_GROUPS.map(normalizePieceGroupName)]),
    [templates, allowedLibraryGroups],
  );
  const templateGroupNames = useMemo(
    () => templateGroups.map((group) => group.name),
    [templateGroups],
  );
  const activeTemplateGroupName = normalizePieceGroupName(activeTemplateGroup || templateGroupNames[0]);
  const activeTemplateGroupRecord = templateGroups.find((group) => group.name === activeTemplateGroupName) || templateGroups[0] || { name: 'Default', items: [] };
  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId) || activeTemplateGroupRecord.items[0] || null;
  const framePoints = useMemo(
    () =>
      framePointIds
        .map((id) => visibleGroupedPlaced.find((item) => item.id === id))
        .filter(Boolean)
        .map((item) => ({ id: item.id, x: item.x || 0, y: item.y || 0 })),
    [framePointIds, visibleGroupedPlaced],
  );
  const selectedMotif = savedMotifs.find((motif) => motif.id === selectedMotifId) || savedMotifs[0] || null;
  const isPaperMaterial = material === 'paper';
  const exportSupports2DStyle = exportDimensionMode === '2d';
  const exportUsesPageLayout = exportDimensionMode === '2d' || new Set(['png', 'pdf', 'mp4']).has(exportFormat);
  const inactivePaperExportControlClass = isPaperMaterial ? 'export-disabled-control' : undefined;
  const edgeLineEnabled = !isPaperMaterial && Number(renderEdgeThickness) > 0;
  const exportSupportsTransparentBackground = TRANSPARENT_BACKGROUND_EXPORT_FORMATS.has(exportFormat);
  const exportPreviewUsesTransparentBackground =
    exportFormat === 'png-transparent' ||
    (exportSupportsTransparentBackground && exportTransparentBackground) ||
    (exportDimensionMode === '2d' && export2DStyle === 'paper-cut' && exportPaperCutOut);
  const selectedVideoPreset = CAMERA_VIDEO_PRESET_MAP.get(cameraVideoPreset) || CAMERA_VIDEO_PRESETS[0];
  const selectedVideoDurationMs = selectedVideoPreset.type === 'assembly'
    ? clamp(Number(assemblyVideoDurationSec) || 8, 2, 30) * 1000
    : selectedVideoPreset.durationMs;
  const liveVideoExportActive = exportDialogOpen && exportDimensionMode === '3d' && exportFormat === 'mp4';

  useEffect(() => {
    if (!contextualExportOptions.some((option) => option.value === exportFormat)) {
      setExportFormat(contextualExportOptions[0]?.value || availableExportOptions[0]?.value || 'png');
    }
  }, [availableExportOptions, contextualExportOptions, exportFormat]);

  useEffect(() => {
    if (!liveVideoExportActive) return;
    setRenderBgColor(exportBgColor);
    setRenderEdgeColor(exportEdgeColor);
    setRenderEdgeThickness(exportEdgeThickness);
    setRenderEdgeMode('offset');
    setRenderEdgeOffsetCount(exportEdgeOffsetCount);
    setRenderEdgeOffsetDistance(exportEdgeOffsetDistance);
    setMaterial(normalizeMaterialName(export3DMaterial));
    setStageCamera(export3DCamera);
    setLiveShadowsEnabled(!!export3DShadows);
  }, [
    liveVideoExportActive,
    exportBgColor,
    exportEdgeColor,
    exportEdgeThickness,
    exportEdgeOffsetCount,
    exportEdgeOffsetDistance,
    export3DMaterial,
    export3DCamera,
    export3DShadows,
  ]);

  useEffect(() => {
    const recovery = readRecoveryDraft();
    if (recovery?.pieces?.length) {
      const recoveredPieces = rehydrateScenePieces(recovery);
      replacePlaced(() => recoveredPieces);
      const recoveredSettings = normalizeRenderSettings(recovery.renderSettings);
      setMaterial(normalizeMaterialName(recovery.material || 'plastic'));
      setRenderBgColor(recoveredSettings.backgroundColor);
      setRenderEdgeColor(recoveredSettings.edgeColor);
      setRenderEdgeThickness(recoveredSettings.edgeThickness);
      setRenderEdgeMode(recoveredSettings.edgeMode);
      setRenderEdgeOffsetCount(recoveredSettings.edgeOffsetCount);
      setRenderEdgeOffsetDistance(recoveredSettings.edgeOffsetDistance);
      setModelTransform(normalizeModelTransform(recovery.modelTransform));
      setModelName(recovery.name || 'Recovered Girih model');
    }
    recoveryDraftInitializedRef.current = true;
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    const nextApp = safeAppReturnUrl();
    if (!nextApp || !supabase) return;
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active || !data.session) return;
      const target = new URL(nextApp);
      target.hash = new URLSearchParams({
        girih_access_token: data.session.access_token,
        girih_refresh_token: data.session.refresh_token,
      }).toString();
      window.location.replace(target);
    });
    return () => { active = false; };
  }, [currentUser]);

  useEffect(() => {
    let active = true;
    let pendingModelId = '';
    try {
      pendingModelId = sessionStorage.getItem(PENDING_STUDIO_MODEL_ID_KEY) || '';
      if (pendingModelId) sessionStorage.removeItem(PENDING_STUDIO_MODEL_ID_KEY);
    } catch {
      pendingModelId = '';
    }
    if (!pendingModelId) return () => { active = false; };
    localStorage.removeItem(RECOVERY_DRAFT_STORAGE_KEY);
    readModelsFromDevice().then((models) => {
      if (!active) return;
      const pendingModel = models.find((model) => model.id === pendingModelId);
      if (pendingModel) loadSavedModel(pendingModel);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!recoveryDraftInitializedRef.current) return undefined;
    const timer = window.setTimeout(persistRecoveryDraft, 500);
    return () => window.clearTimeout(timer);
  }, [designHasUnsavedChanges, activeDesignSignature, modelName]);

  useEffect(() => {
    if (!designHasUnsavedChanges) return undefined;
    const handleBeforeUnload = (event) => {
      persistRecoveryDraft();
      if (allowPageExitRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    const handlePageHide = () => persistRecoveryDraft();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') persistRecoveryDraft();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handlePageHide);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handlePageHide);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [designHasUnsavedChanges, activeDesignSignature, modelName]);

  useEffect(() => {
    const protectInternalLink = (event) => {
      if (!designHasUnsavedChanges || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target.closest?.('a[href]');
      if (!anchor || anchor.hasAttribute('download') || anchor.target === '_blank') return;
      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
      const destination = new URL(anchor.href, window.location.href);
      if (destination.href === window.location.href) return;
      event.preventDefault();
      setPendingNavigationUrl(destination.href);
    };
    document.addEventListener('click', protectInternalLink, true);
    return () => document.removeEventListener('click', protectInternalLink, true);
  }, [designHasUnsavedChanges]);

  useEffect(() => {
    if (!templateGroups.length) return;
    const hasActiveGroup = templateGroups.some((group) => group.name === activeTemplateGroupName);
    if (!hasActiveGroup) {
      const nextGroup = templateGroups[0];
      setActiveTemplateGroup(nextGroup.name);
      setSelectedTemplateId(nextGroup.items[0]?.id || '');
    }
  }, [templateGroups, activeTemplateGroupName]);

  useEffect(() => {
    if (!canUseAdmin && mobileAdminOpen) setMobileAdminOpen(false);
  }, [canUseAdmin, mobileAdminOpen]);

  useEffect(() => {
    if (canUseTemplates) return;
    setTemplatePanelOpen(false);
    setTemplateStagePreviewVisible(false);
    setSelectedTemplateId('');
  }, [canUseTemplates]);

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true);
      return undefined;
    }

    let active = true;
    const syncSession = async (session) => {
      if (!active) return;
      if (!session?.user) {
        setCurrentUser(null);
        setAuthReady(true);
        return;
      }
      try {
        const nextUser = await loadAuthenticatedUser(session.user);
        if (active) setCurrentUser(nextUser);
      } catch (error) {
        if (active) {
          setCurrentUser(null);
          setLoginError(error.message || 'Could not load your Girih profile.');
        }
      } finally {
        if (active) setAuthReady(true);
      }
    };

    supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        setLoginError(error.message);
        setAuthReady(true);
        return;
      }
      syncSession(data.session);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(() => syncSession(session), 0);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(NIGHT_MODE_STORAGE_KEY, String(nightMode));
    document.documentElement.style.colorScheme = nightMode ? 'dark' : 'light';
  }, [nightMode]);

  useEffect(() => {
    localStorage.setItem(GLASS_SETTINGS_STORAGE_KEY, JSON.stringify(glassSettings));
  }, [glassSettings]);

  useEffect(() => {
    if (!supabase || !currentUser || checkoutRefreshStartedRef.current) return undefined;
    const params = new URLSearchParams(window.location.search);
    if (params.get('checkout') !== 'success') return undefined;
    checkoutRefreshStartedRef.current = true;
    let cancelled = false;
    let attempts = 0;
    const refreshProfile = async () => {
      attempts += 1;
      const { data } = await supabase.auth.getUser();
      const nextUser = data.user ? await loadAuthenticatedUser(data.user).catch(() => null) : null;
      if (cancelled) return;
      if (nextUser && nextUser.role !== currentUser.role) setCurrentUser(nextUser);
      if (nextUser?.role === USER_ROLES.PAID || attempts >= 6) {
        params.delete('checkout');
        const query = params.toString();
        window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
        return;
      }
      window.setTimeout(refreshProfile, 1200);
    };
    refreshProfile();
    return () => {
      cancelled = true;
    };
  }, [currentUser]);

  useEffect(() => {
    if (!supabase || !currentUser || libraryHandoffLoadedRef.current) return undefined;
    const params = new URLSearchParams(window.location.search);
    const assetId = params.get('libraryAsset') || '';
    const returnTo = params.get('returnTo') || '';
    const versionId = params.get('version') || '';
    if (!assetId) return undefined;
    libraryHandoffLoadedRef.current = true;
    let cancelled = false;
    setSharedLibraryBusy(true);
    listLibraryAssets(supabase, { assetType: 'girih_pattern' })
      .then(async (assets) => {
        if (cancelled) return;
        setSharedLibraryModels(assets);
        const asset = assets.find((item) => item.id === assetId);
        if (!asset) {
          setSharedLibraryStatus('This shared library item was not found in Girih App.');
          return;
        }
        let targetAsset = asset;
        if (versionId && versionId !== asset.current_version_id) {
          const versions = await listLibraryAssetVersions(supabase, asset.id);
          const selectedVersion = versions.find((version) => version.id === versionId);
          if (selectedVersion) {
            targetAsset = { ...asset, currentVersion: selectedVersion, current_version_id: selectedVersion.id };
            setSharedLibraryVersions(versions);
            setSelectedLibraryVersionId(selectedVersion.id);
          }
        }
        if (cancelled) return;
        setLibraryEditReturnTo(returnTo);
        setSelectedLibraryAssetId(asset.id);
        openGirihLibraryAsset(targetAsset);
        setSharedLibraryStatus(returnTo ? 'Editing this library item from Mehraz. Save to return to Mehraz.' : '');
      })
      .catch((error) => {
        if (!cancelled) setSharedLibraryStatus(error.message);
      })
      .finally(() => {
        if (!cancelled) setSharedLibraryBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentUser]);

  async function handleLogin(event) {
    event.preventDefault();
    const email = loginEmail.trim().toLowerCase();
    if (!supabase) {
      setLoginError('Global login is not configured yet. Add the Supabase environment variables.');
      return;
    }
    if (!email || loginPassword.length < 8) {
      setLoginError('Enter a valid email and a password of at least 8 characters.');
      return;
    }
    setLoginError('');
    setLoginMessage('');
    setAuthBusy(true);
    try {
      if (authMode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password: loginPassword,
          options: {
            data: { full_name: loginName.trim() },
            emailRedirectTo: new URLSearchParams(window.location.search).get('libraryAsset')
              ? window.location.href
              : accountAuthRedirectUrl(),
          },
        });
        if (error) throw error;
        if (!data.session) {
          setLoginMessage('Check your email to confirm your account, then log in.');
          setAuthMode('login');
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password: loginPassword });
        if (error) throw error;
      }
      setLoginPassword('');
    } catch (error) {
      setLoginError(error.message || 'Authentication failed.');
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleGoogleLogin() {
    if (!supabase) {
      setLoginError('Global login is not configured yet.');
      return;
    }
    setLoginError('');
    setLoginMessage('');
    setAuthBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: new URLSearchParams(window.location.search).get('libraryAsset')
          ? window.location.href
          : accountAuthRedirectUrl(),
        queryParams: { prompt: 'select_account' },
      },
    });
    if (error) {
      setLoginError(error.message || 'Google sign-in could not be started.');
      setAuthBusy(false);
    }
  }

  async function logout() {
    if (supabase) await supabase.auth.signOut();
    setMobileAdminOpen(false);
    setMobileMenuOpen(false);
    setTemplatePanelOpen(false);
    setContextMenu(null);
  }

  async function openBillingFlow(endpoint) {
    if (!supabase || billingBusy) return;
    setBillingBusy(true);
    try {
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      if (!accessToken) throw new Error('Please log in again.');
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.url) throw new Error(result.error || 'Could not open billing.');
      window.location.assign(result.url);
    } catch (error) {
      window.alert(error.message || 'Could not open billing.');
      setBillingBusy(false);
    }
  }

  function currentRenderSettings() {
    return normalizeRenderSettings({
      backgroundColor: renderBgColor,
      edgeColor: renderEdgeColor,
      edgeThickness: edgeLineEnabled ? renderEdgeThickness : 0,
      edgeMode: 'offset',
      edgeOffsetCount: renderEdgeOffsetCount,
      edgeOffsetDistance: renderEdgeOffsetDistance,
    });
  }

  function persistRecoveryDraft() {
    if (!recoveryDraftInitializedRef.current) return;
    if (!designHasUnsavedChanges) {
      localStorage.removeItem(RECOVERY_DRAFT_STORAGE_KEY);
      return;
    }
    const recovery = compactSceneModelForStorage(
      serializeSceneModel(
        modelName.trim() || 'Recovered Girih model',
        groupedPlaced,
        DEFAULT_SCENE_STYLE,
        material,
        currentRenderSettings(),
        modelTransform,
      ),
    );
    writeJsonToLocalStorage(RECOVERY_DRAFT_STORAGE_KEY, recovery);
  }

  function currentExportRenderSettings() {
    return normalizeRenderSettings({
      backgroundColor: exportBgColor,
      edgeColor: exportEdgeColor,
      edgeThickness: exportEdgeThickness,
      edgeMode: 'offset',
      edgeOffsetCount: exportEdgeOffsetCount,
      edgeOffsetDistance: exportEdgeOffsetDistance,
    });
  }

  function changeEdgeLineEnabled(enabled) {
    setRenderEdgeMode('offset');
    if (enabled) {
      const currentThickness = Number(renderEdgeThickness);
      setRenderEdgeThickness(Number.isFinite(currentThickness) && currentThickness > 0 ? renderEdgeThickness : 1);
      return;
    }
    setRenderEdgeThickness(0);
  }

  function changeMaterial(nextMaterial) {
    const normalized = normalizeMaterialName(nextMaterial);
    setMaterial(normalized);
    if (normalized === 'paper') setStageCamera('top');
  }

  function selectPlacedIds(ids) {
    const nextIds = ids.filter((id, index) => id && ids.indexOf(id) === index && visibleGroupedPlaced.some((item) => item.id === id));
    const nextPieces = nextIds.map((id) => visibleGroupedPlaced.find((item) => item.id === id)).filter(Boolean);
    const nextGroupId =
      nextPieces.length > 1 && nextPieces.every((piece) => piece.groupInstanceId && piece.groupInstanceId === nextPieces[0].groupInstanceId)
        ? nextPieces[0].groupInstanceId
        : null;
    selectedIdsRef.current = nextIds;
    setSelectedIds(nextIds);
    setSelectedId(nextIds[0] || null);
    setActiveGroupId(nextGroupId);
  }

  function selectPlaced(id) {
    if (!id) {
      selectPlacedIds([]);
      return;
    }
    const piece = visibleGroupedPlaced.find((item) => item.id === id);
    if (!piece) {
      selectPlacedIds([]);
      return;
    }
    const groupIds = piece.groupInstanceId ? visibleGroupedPlaced.filter((item) => item.groupInstanceId === piece.groupInstanceId).map((item) => item.id) : [id];
    selectPlacedIds(groupIds);
  }

  function togglePlacedSelection(id) {
    const piece = visibleGroupedPlaced.find((item) => item.id === id);
    if (!piece) return;
    const toggleIds = piece.groupInstanceId
      ? visibleGroupedPlaced.filter((item) => item.groupInstanceId === piece.groupInstanceId).map((item) => item.id)
      : [id];
    const currentIds = selectedIdsRef.current.length ? selectedIdsRef.current : selectedIds;
    const currentSet = new Set(currentIds);
    const shouldRemove = toggleIds.every((itemId) => currentSet.has(itemId));
    toggleIds.forEach((itemId) => {
      if (shouldRemove) currentSet.delete(itemId);
      else currentSet.add(itemId);
    });
    selectPlacedIds(Array.from(currentSet));
  }

  function updateModelTransform(field, value) {
    const current = normalizeModelTransform(modelTransform);
    let next = normalizeModelTransform({ ...current, [field]: value });
    if (modelTransformKeepAspect && field.startsWith('scale')) {
      const uniformScale = next[field];
      next = { ...next, scaleX: uniformScale, scaleY: uniformScale, scaleZ: uniformScale };
    }
    applyTransformToSelection(current, next, field);
    setModelTransform(next);
  }

  function applyTransformToSelection(currentTransform, nextTransform, changedField) {
    const ids = selectedPieces.map((piece) => piece.id);
    if (!ids.length) return;
    const idSet = new Set(ids);
    const safeRatio = (nextValue, currentValue) => {
      const currentNumber = Number(currentValue);
      const nextNumber = Number(nextValue);
      if (!Number.isFinite(currentNumber) || Math.abs(currentNumber) < 0.000001 || !Number.isFinite(nextNumber)) return 1;
      return nextNumber / currentNumber;
    };
    const scaleDelta = {
      x: safeRatio(nextTransform.scaleX, currentTransform.scaleX),
      y: safeRatio(nextTransform.scaleY, currentTransform.scaleY),
      z: safeRatio(nextTransform.scaleZ, currentTransform.scaleZ),
    };
    const positionDelta = {
      x: nextTransform.positionX - currentTransform.positionX,
      y: nextTransform.positionY - currentTransform.positionY,
      z: nextTransform.positionZ - currentTransform.positionZ,
    };
    const rotationDelta = {
      x: changedField === 'rotationX' ? THREE.MathUtils.degToRad(nextTransform.rotationX - currentTransform.rotationX) : 0,
      y: changedField === 'rotationY' ? THREE.MathUtils.degToRad(nextTransform.rotationY - currentTransform.rotationY) : 0,
      z: changedField === 'rotationZ' ? THREE.MathUtils.degToRad(nextTransform.rotationZ - currentTransform.rotationZ) : 0,
    };

    commitPlaced((items) => {
      const selectedItems = items.filter((item) => idSet.has(item.id));
      if (!selectedItems.length) return items;
      const groupId =
        selectedItems.length > 1 &&
        selectedItems.every((item) => item.groupInstanceId && item.groupInstanceId === selectedItems[0].groupInstanceId)
          ? selectedItems[0].groupInstanceId
          : null;
      const transformAsGroup = !!groupId;
      const center = transformAsGroup ? selectionCenter(selectedItems) : null;
      return items.map((item) => {
        if (!idSet.has(item.id)) return item;
        return transformSelectedPiece(item, { scaleDelta, positionDelta, rotationDelta, center, transformAsGroup });
      });
    });
  }

  function togglePieceGroup(groupName) {
    setCollapsedPieceGroups((current) => {
      const next = new Set(current);
      if (next.has(groupName)) next.delete(groupName);
      else next.add(groupName);
      return next;
    });
  }

  function toggleAdminGroup(groupName) {
    setCollapsedAdminGroups((current) => {
      const next = new Set(current);
      if (next.has(groupName)) next.delete(groupName);
      else next.add(groupName);
      return next;
    });
  }

  function togglePaletteGroup(groupName) {
    setCollapsedPaletteGroups((current) => {
      const next = new Set(current);
      if (next.has(groupName)) next.delete(groupName);
      else next.add(groupName);
      return next;
    });
  }

  function startFrameMode() {
    setFrameMode(true);
    setFramePointIds([]);
    setStageCamera('top');
    setSelectedIds([]);
    setSelectedId(null);
    setActiveGroupId(null);
    setContextMenu(null);
  }

  function cancelFrameMode() {
    setFrameMode(false);
    setFramePointIds([]);
  }

  function pickFrameObject(pieceId) {
    if (!frameMode || !pieceId) return;
    const currentPlaced = placedRef.current;
    const picked = currentPlaced.find((item) => item.id === pieceId);
    if (!picked) return;
    if (framePointIds.length >= 3 && framePointIds[0] === pieceId) {
      applyFrameCrop(framePointIds);
      return;
    }
    if (framePointIds.includes(pieceId)) return;
    setFramePointIds((ids) => [...ids, pieceId]);
  }

  function applyFrameCrop(ids) {
    const currentPlaced = placedRef.current;
    const loopPieces = ids.map((id) => currentPlaced.find((item) => item.id === id)).filter(Boolean);
    const loop = loopPieces.map((item) => new THREE.Vector2(item.x || 0, item.y || 0));
    if (loop.length < 3) return;
    const framed = framePlacedPieces(currentPlaced, loop);
    commitPlaced(() => framed);
    placedRef.current = framed;
    const framedIds = new Set(framed.map((item) => item.id));
    setSelectedId(null);
    setSelectedIds([]);
    setActiveGroupId(null);
    setStageGroups((groups) =>
      groups
        .map((group) => ({ ...group, ids: group.ids.filter((id) => framedIds.has(id)) }))
        .filter((group) => group.ids.length > 1),
    );
    setFrameMode(false);
    setFramePointIds([]);
    setContextMenu(null);
  }

  function openTemplateGroup(groupName) {
    if (!canUseTemplates) return;
    const normalizedGroupName = normalizePieceGroupName(groupName);
    setActiveTemplateGroup(normalizedGroupName);
    setTemplatePanelOpen(true);
    setTemplateStagePreviewVisible(true);
    setMobileMenuOpen(false);
    setMobileAdminOpen(false);
    if (isMobileViewport) setMobilePiecesOpen(false);
    const group = templateGroups.find((item) => item.name === normalizedGroupName);
    setSelectedTemplateId((current) => (group?.items.some((template) => template.id === current) ? current : group?.items[0]?.id || ''));
  }

  function resetTemplatePreviewView() {
    setTemplatePreviewView({ scale: 1, x: 0, y: 0 });
  }

  function clampTemplatePreviewScale(scale) {
    return Math.min(4, Math.max(1, Number(scale.toFixed(2))));
  }

  function zoomTemplatePreview(delta) {
    setTemplatePreviewView((current) => {
      const scale = clampTemplatePreviewScale(current.scale + delta);
      return scale === 1 ? { scale, x: 0, y: 0 } : { ...current, scale };
    });
  }

  function getPointerDistance(a, b) {
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  }

  function startTemplatePreviewPan(event) {
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    templatePreviewPointersRef.current.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
    const pointers = [...templatePreviewPointersRef.current.values()];
    if (pointers.length >= 2) {
      templatePreviewDragRef.current = {
        mode: 'pinch',
        startDistance: Math.max(1, getPointerDistance(pointers[0], pointers[1])),
        originScale: templatePreviewView.scale,
      };
      return;
    }
    if (templatePreviewView.scale <= 1) return;
    templatePreviewDragRef.current = {
      mode: 'pan',
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: templatePreviewView.x,
      originY: templatePreviewView.y,
    };
  }

  function panTemplatePreview(event) {
    if (templatePreviewPointersRef.current.has(event.pointerId)) {
      templatePreviewPointersRef.current.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
    }
    const drag = templatePreviewDragRef.current;
    if (!drag) return;
    event.preventDefault();
    if (drag.mode === 'pinch') {
      const pointers = [...templatePreviewPointersRef.current.values()];
      if (pointers.length < 2) return;
      const distance = Math.max(1, getPointerDistance(pointers[0], pointers[1]));
      setTemplatePreviewView((current) => {
        const scale = clampTemplatePreviewScale(drag.originScale * (distance / drag.startDistance));
        return scale === 1 ? { scale, x: 0, y: 0 } : { ...current, scale };
      });
      return;
    }
    if (drag.pointerId !== event.pointerId) return;
    setTemplatePreviewView((current) => ({
      ...current,
      x: drag.originX + event.clientX - drag.startX,
      y: drag.originY + event.clientY - drag.startY,
    }));
  }

  function endTemplatePreviewPan(event) {
    templatePreviewPointersRef.current.delete(event.pointerId);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    const drag = templatePreviewDragRef.current;
    if (drag?.mode === 'pinch' || drag?.pointerId === event.pointerId) {
      templatePreviewDragRef.current = null;
    }
  }

  function saveGroupColorPalette(group) {
    if (!canUsePalettes) return;
    const groupName = normalizePieceGroupName(group.name);
    if (!group.items.length) return;
    const groupSourceIds = new Set(group.items.map((piece) => piece.id));
    const stageColorsBySource = new Map(
      groupedPlaced
        .filter((item) => groupSourceIds.has(item.sourceId))
        .map((item) => [item.sourceId, item.color]),
    );
    const palette = {
      id: crypto.randomUUID(),
      savedAt: Date.now(),
      colors: Object.fromEntries(group.items.map((piece) => [piece.id, stageColorsBySource.get(piece.id) || piece.color])),
    };
    setGroupColorPalettes((current) => {
      const existing = Array.isArray(current[groupName]) ? current[groupName] : [];
      if (existing.length >= 5) return current;
      const nextGroupPalettes = [...existing, palette].map((item, index) => ({ ...item, name: `${index + 2}` }));
      return { ...current, [groupName]: nextGroupPalettes };
    });
    setSelectedGroupPalettes((current) => ({ ...current, [groupName]: palette.id }));
  }

  function deleteGroupColorPalette(groupName, paletteId) {
    if (!canUsePalettes) return;
    if (paletteId === BUILT_IN_GROUP_PALETTE_ID) return;
    const normalizedGroupName = normalizePieceGroupName(groupName);
    setGroupColorPalettes((current) => {
      const existing = Array.isArray(current[normalizedGroupName]) ? current[normalizedGroupName] : [];
      const nextGroupPalettes = existing
        .filter((palette) => palette.id !== paletteId)
        .map((item, index) => ({ ...item, name: `${index + 2}` }));
      return { ...current, [normalizedGroupName]: nextGroupPalettes };
    });
    setSelectedGroupPalettes((current) => {
      if (current[normalizedGroupName] !== paletteId) return current;
      const next = { ...current };
      delete next[normalizedGroupName];
      return next;
    });
  }

  function applyGroupColorPalette(group, paletteId) {
    if (!canUsePalettes) return;
    const groupName = normalizePieceGroupName(group.name);
    const palettes = buildGroupColorPalettes(group, groupColorPalettes[groupName]);
    const palette = palettes.find((item) => item.id === paletteId) || palettes[0];
    if (!palette?.colors) return;
    const updatedById = new Map(
      group.items
        .filter((piece) => typeof palette.colors[piece.id] === 'string')
        .map((piece) => [piece.id, { ...piece, color: palette.colors[piece.id] }]),
    );
    if (!updatedById.size) return;
    updatedById.forEach((piece) => saveAdminPieceSetting(piece));
    setPieces((items) => items.map((item) => updatedById.get(item.id) || item));
    commitPlaced((items) =>
      items.map((item) => {
        const nextSource = updatedById.get(item.sourceId);
        return nextSource ? applyLibraryPieceToInstance(nextSource, item) : item;
      }),
    );
    setDraft((current) => {
      const nextSource = updatedById.get(editingId);
      return nextSource ? { ...current, color: nextSource.color } : current;
    });
  }

  useEffect(() => {
    placedRef.current = placed;
    selectedIdsRef.current = selectedIds;
  }, [placed, selectedIds]);

  useEffect(() => {
    setStageGroups((groups) =>
      groups
        .map((group) => ({ ...group, ids: group.ids.filter((id) => placed.some((item) => item.id === id)) }))
        .filter((group) => group.ids.length > 1),
    );
  }, [placed]);

  useEffect(() => {
    localStorage.setItem(GROUP_COLOR_PALETTES_STORAGE_KEY, JSON.stringify(groupColorPalettes));
  }, [groupColorPalettes]);

  useEffect(() => {
    resetTemplatePreviewView();
  }, [selectedTemplate?.id]);

  useEffect(() => {
    if (selectedId && !visibleGroupedPlaced.some((item) => item.id === selectedId)) setSelectedId(null);
    setSelectedIds((ids) => ids.filter((id) => visibleGroupedPlaced.some((item) => item.id === id)));
    if (activeGroupId && !visibleGroupedPlaced.some((item) => item.groupInstanceId === activeGroupId)) setActiveGroupId(null);
    if (contextMenu && !visibleGroupedPlaced.some((item) => item.id === contextMenu.id)) setContextMenu(null);
  }, [visibleGroupedPlaced, selectedId, activeGroupId, contextMenu]);

  useEffect(() => {
    pieces.forEach((piece) => {
      const isImported = piece.type === 'obj' || piece.type === 'glb';
      const needsTargetedDisplayBoundary = usesTargetedRealBoundary(piece) && !piece.displayEdges?.length;
      const needsGeometryData =
        !piece.snapEdges?.length ||
        piece.sourceHeightPx === undefined ||
        piece.sourceHeightPx === '' ||
        piece.sourceWidthPx === undefined ||
        piece.sourceLengthPx === undefined ||
        piece.sourceFootprintScale === undefined ||
        piece.analysisVersion !== ANALYSIS_VERSION ||
        needsTargetedDisplayBoundary;
      if (!isImported || !needsGeometryData) return;
      reanalyzeImportedPiece(piece).then((analysis) => {
        if (!analysis) return;
        setPieces((items) =>
          items.map((item) => {
            if (item.id !== piece.id) return item;
            const analyzed = {
              ...item,
              points: analysis.points,
              snapEdges: analysis.snapEdges,
              verticalEdges: analysis.verticalEdges,
              displayEdges: usesTargetedRealBoundary(item) ? analysis.displayEdges : item.displayEdges,
              height: item.height || analysis.sourceHeightPx || analysis.height,
              sourceHeightPx: analysis.sourceHeightPx,
              sourceWidthPx: analysis.sourceWidthPx,
              sourceLengthPx: analysis.sourceLengthPx,
              sourceFootprintScale: analysis.sourceFootprintScale,
              analysisVersion: analysis.analysisVersion,
            };
            return {
              ...applyAdminPieceSetting(analyzed),
              points: analysis.points,
              snapEdges: analysis.snapEdges,
              verticalEdges: analysis.verticalEdges,
              displayEdges: usesTargetedRealBoundary(item) ? analysis.displayEdges : item.displayEdges,
              sourceHeightPx: analysis.sourceHeightPx,
              sourceWidthPx: analysis.sourceWidthPx,
              sourceLengthPx: analysis.sourceLengthPx,
              sourceFootprintScale: analysis.sourceFootprintScale,
              analysisVersion: analysis.analysisVersion,
            };
          }),
        );
      });
    });
  }, [pieces, setPieces]);

  useEffect(() => {
    if (shamsehWidthNormalizationAppliedRef.current) return;
    const currentNormalizationVersion = localStorage.getItem(SHAMSEH_WIDTH_NORMALIZATION_STORAGE_KEY);
    if (currentNormalizationVersion === SHAMSEH_WIDTH_NORMALIZATION_VERSION) {
      shamsehWidthNormalizationAppliedRef.current = true;
      return;
    }
    const normalized = normalizePiecesToShamsehReferenceWidth(pieces);
    if (!normalized) return;
    shamsehWidthNormalizationAppliedRef.current = true;
    normalized.pieces
      .filter((piece) => DEFAULT_PIECE_BY_ID.has(piece.id))
      .forEach((piece) => saveAdminPieceSetting(piece));
    localStorage.setItem(SHAMSEH_WIDTH_NORMALIZATION_STORAGE_KEY, SHAMSEH_WIDTH_NORMALIZATION_VERSION);
    if (!normalized.changed) return;
    const normalizedById = new Map(normalized.pieces.map((piece) => [piece.id, piece]));
    setPieces(normalized.pieces);
    commitPlaced((items) =>
      items.map((item) => {
        const nextSource = normalizedById.get(item.sourceId);
        return nextSource ? applyLibraryPieceToInstance(nextSource, item) : item;
      }),
    );
  }, [pieces, setPieces, commitPlaced]);

  useEffect(() => {
    function closeMenu() {
      setContextMenu(null);
    }
    window.addEventListener('click', closeMenu);
    window.addEventListener('keydown', closeMenu);
    return () => {
      window.removeEventListener('click', closeMenu);
      window.removeEventListener('keydown', closeMenu);
    };
  }, []);

  useEffect(() => {
    function handleHistoryShortcut(event) {
      const target = event.target;
      const isEditingField =
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
      if (isEditingField) return;
      const key = event.key;
      const arrowDeltas = {
        ArrowLeft: { x: -1, y: 0 },
        ArrowRight: { x: 1, y: 0 },
        ArrowUp: { x: 0, y: -1 },
        ArrowDown: { x: 0, y: 1 },
      };
      if ((key === 'Delete' || key === 'Backspace') && selectedPieces.length) {
        event.preventDefault();
        deleteSelectedPieces();
        return;
      }
      if (arrowDeltas[key] && selectedPieces.length) {
        event.preventDefault();
        const step = event.altKey ? 0.005 : event.shiftKey ? 0.1 : 0.02;
        nudgeSelectedPieces({
          x: arrowDeltas[key].x * step,
          y: arrowDeltas[key].y * step,
        });
        return;
      }
      if (!event.ctrlKey && !event.metaKey) return;
      const shortcutKey = key.toLowerCase();
      if (shortcutKey === 'z' && event.shiftKey) {
        event.preventDefault();
        redoStage();
        return;
      }
      if (shortcutKey === 'z') {
        event.preventDefault();
        undoStage();
        return;
      }
      if (shortcutKey === 'y') {
        event.preventDefault();
        redoStage();
        return;
      }
      if (shortcutKey === 'c') {
        event.preventDefault();
        copySelectedPieces();
        return;
      }
      if (shortcutKey === 'v') {
        event.preventDefault();
        pasteClipboardPieces();
      }
    }

    window.addEventListener('keydown', handleHistoryShortcut);
    return () => window.removeEventListener('keydown', handleHistoryShortcut);
  }, [undoStage, redoStage, selectedPieces, clipboardPieces, selectedIds]);

  useEffect(() => {
    if (!exportDialogOpen) {
      exportPreviewCanvasRef.current = null;
      setExportPreview(null);
      setExportPreviewError('');
      return;
    }
    if (!visibleGroupedPlaced.length) {
      exportPreviewCanvasRef.current = null;
      setExportPreview(null);
      return;
    }

    let cancelled = false;
    setExportPreviewLoading(true);
    setExportPreviewError('');
    renderExportPreviewCanvas(exportFormat, {
      orientation: exportOrientation,
      paperSize: exportPaperSize,
      transparentBackground: exportTransparentBackground,
      graphicStyle: export2DStyle,
      paperCutOut: exportPaperCutOut,
      exportMaterial: export3DMaterial,
      exportCamera: export3DCamera,
      exportShadows: export3DShadows,
      zoom: exportPreviewZoom,
      pan: exportPreviewPan,
    })
      .then((canvas) => {
        if (cancelled) return;
        exportPreviewCanvasRef.current = canvas;
        setExportPreview({
          imageUrl: canvas.toDataURL('image/png'),
          format: exportFormat,
          orientation: exportOrientation,
          paperSize: exportPaperSize,
        });
      })
      .catch((error) => {
        console.error('Failed to render export preview', error);
        if (!cancelled) {
          exportPreviewCanvasRef.current = null;
          setExportPreview(null);
          const detail = error instanceof Error && error.message ? ` ${error.message}` : '';
          setExportPreviewError(`Preview could not be generated.${detail}`);
        }
      })
      .finally(() => {
        if (!cancelled) setExportPreviewLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    exportDialogOpen,
    exportFormat,
    exportOrientation,
    exportPaperSize,
    exportTransparentBackground,
    export2DStyle,
    export3DMaterial,
    export3DCamera,
    export3DShadows,
    exportPreviewZoom,
    exportPreviewPan,
    exportPencilColor,
    exportPencilIntensity,
    exportPaperGap,
    exportPaperCutOut,
    exportHatchSpacing,
    exportHatchThickness,
    exportHatchAngle,
    exportHatchOutline,
    visibleGroupedPlaced,
    stageGroups,
    material,
    modelTransform,
    stageCamera,
    stageCameraSnapshot,
    exportBgColor,
    exportEdgeColor,
    exportEdgeThickness,
    exportEdgeOffsetCount,
    exportEdgeOffsetDistance,
    liveShadowsEnabled,
  ]);

  function addPiece(piece) {
    commitPlaced((items) => {
      const instance = {
        ...piece,
        id: `${piece.id}-${crypto.randomUUID()}`,
        sourceId: piece.id,
        x: 0,
        y: 0,
        rotation: 0,
        mirrorHorizontal: false,
        mirrorVertical: false,
        hidden: false,
        snappedTo: null,
      };
      return [...items, placeNewPieceNearCollection(instance, items, stageVisibleBounds)];
    });
  }

  function updatePlaced(id, transform) {
    replacePlaced((items) => items.map((item) => (item.id === id ? { ...item, ...transform } : item)));
  }

  function deletePlaced(id) {
    commitPlaced((items) => items.filter((item) => item.id !== id));
    setSelectedId((current) => (current === id ? null : current));
    setSelectedIds((ids) => ids.filter((selectedItemId) => selectedItemId !== id));
    setActiveGroupId((current) => {
      const deleting = placed.find((item) => item.id === id);
      return deleting?.groupInstanceId === current ? null : current;
    });
    setStageGroups((groups) =>
      groups
        .map((group) => ({ ...group, ids: group.ids.filter((itemId) => itemId !== id) }))
        .filter((group) => group.ids.length > 1),
    );
    setContextMenu(null);
  }

  function deleteSelectedPieces() {
    const ids = selectedPieces.map((piece) => piece.id);
    if (!ids.length) return;
    const idSet = new Set(ids);
    commitPlaced((items) => items.filter((item) => !idSet.has(item.id)));
    setSelectedId(null);
    setSelectedIds([]);
    setActiveGroupId(null);
    setStageGroups((groups) =>
      groups
        .map((group) => ({ ...group, ids: group.ids.filter((itemId) => !idSet.has(itemId)) }))
        .filter((group) => group.ids.length > 1),
    );
    setContextMenu(null);
  }

  function nudgeSelectedPieces(delta) {
    const ids = selectedPieces.map((piece) => piece.id);
    if (!ids.length) return;
    const idSet = new Set(ids);
    commitPlaced((items) =>
      items.map((item) =>
        idSet.has(item.id)
          ? { ...item, x: (item.x || 0) + delta.x, y: (item.y || 0) + delta.y, snappedTo: null }
          : item,
      ),
    );
    setContextMenu(null);
  }

  function togglePieceInstancesHidden(piece) {
    const instances = groupedPlaced.filter((item) => item.sourceId === piece.id);
    if (!instances.length) return;
    const shouldHide = instances.some((item) => !item.hidden);
    const hiddenIds = new Set(instances.map((item) => item.id));
    commitPlaced((items) =>
      items.map((item) => (hiddenIds.has(item.id) ? { ...item, hidden: shouldHide, snappedTo: shouldHide ? null : item.snappedTo } : item)),
    );
    if (shouldHide) {
      setSelectedIds((ids) => ids.filter((id) => !hiddenIds.has(id)));
      setSelectedId((current) => (current && hiddenIds.has(current) ? null : current));
      setActiveGroupId(null);
      if (contextMenu && hiddenIds.has(contextMenu.id)) setContextMenu(null);
    }
  }

  function recolorPlaced(id, color) {
    const currentIds = selectedIdsRef.current || [];
    const targetIds = new Set(currentIds.includes(id) ? currentIds : [id]);
    commitPlaced((items) => items.map((item) => (targetIds.has(item.id) ? { ...item, color } : item)));
  }

  function toggleMirrorPlaced(id, axis) {
    commitPlaced((items) => {
      const source = items.find((item) => item.id === id);
      if (!source) return items;
      const currentIds = selectedIdsRef.current || [];
      const selectedIdSet = new Set(currentIds.includes(id) ? currentIds : [id]);
      const groupItems = source.groupInstanceId ? items.filter((item) => item.groupInstanceId === source.groupInstanceId) : [];
      const targetItems = selectedIdSet.size > 1
        ? items.filter((item) => selectedIdSet.has(item.id))
        : groupItems.length > 1
          ? groupItems
          : [source];
      const ids = new Set(targetItems.map((item) => item.id));
      const center = targetItems.length > 1 ? selectionCenter(targetItems) : null;
      return items.map((item) => {
        if (!ids.has(item.id)) return item;
        const mirrored = {
          ...item,
          mirrorHorizontal: axis === 'horizontal' ? !item.mirrorHorizontal : !!item.mirrorHorizontal,
          mirrorVertical: axis === 'vertical' ? !item.mirrorVertical : !!item.mirrorVertical,
          snappedTo: null,
        };
        if (!center) return mirrored;
        const dx = (item.x || 0) - center.x;
        const dy = (item.y || 0) - center.y;
        return {
          ...mirrored,
          x: axis === 'horizontal' ? center.x - dx : item.x,
          y: axis === 'vertical' ? center.y - dy : item.y,
          rotation: normalizeAngle(-(item.rotation || 0)),
        };
      });
    });
    setContextMenu(null);
  }

  function createGroupFromIds(sourceIds) {
    if (!canUseGrouping) return;
    const currentPlaced = placedRef.current;
    const idsToGroup = sourceIds.filter((id, index, ids) => id && ids.indexOf(id) === index && currentPlaced.some((item) => item.id === id));
    if (idsToGroup.length < 2) return;
    const groupInstanceId = `group-${crypto.randomUUID()}`;
    const idSet = new Set(idsToGroup);
    const nextPlaced = currentPlaced.map((item) => (idSet.has(item.id) ? { ...item, groupInstanceId, snappedTo: null } : item));
    placedRef.current = nextPlaced;
    commitPlaced(() => nextPlaced);
    replacePlaced(() => nextPlaced);
    setStageGroups((groups) => [
      ...groups.filter((group) => !group.ids.some((id) => idSet.has(id))),
      { id: groupInstanceId, ids: idsToGroup },
    ]);
    selectedIdsRef.current = idsToGroup;
    setSelectedIds(idsToGroup);
    setSelectedId(idsToGroup[0] || null);
    setActiveGroupId(groupInstanceId);
    setContextMenu(null);
  }

  function groupSelectedPieces() {
    const currentSelectedIds = selectedIdsRef.current;
    const renderedSelectedIds = selectedPieces.map((piece) => piece.id);
    const stateSelectedIds = selectedIds;
    const sourceIds =
      currentSelectedIds.length >= 2
        ? currentSelectedIds
        : renderedSelectedIds.length >= 2
          ? renderedSelectedIds
          : stateSelectedIds;
    createGroupFromIds(sourceIds);
  }

  function groupAllStagePieces() {
    if (!canUseGrouping) return;
    createGroupFromIds(placedRef.current.map((item) => item.id));
  }

  function ungroupSelectedPieces() {
    if (!canUseGrouping) return;
    if (!selectedIds.length) return;
    const groupIds = new Set(selectedPieces.map((piece) => piece.groupInstanceId).filter(Boolean));
    if (!groupIds.size) return;
    commitPlaced((items) => items.map((item) => (groupIds.has(item.groupInstanceId) ? { ...item, groupInstanceId: null } : item)));
    setStageGroups((groups) => groups.filter((group) => !groupIds.has(group.id)));
    setActiveGroupId(null);
    setContextMenu(null);
  }

  function copySelectedPieces() {
    if (!selectedPieces.length) return;
    const selectedIdSet = new Set(selectedPieces.map((piece) => piece.id));
    const nextClipboard = placedRef.current
      .filter((piece) => selectedIdSet.has(piece.id))
      .map((piece) => ({ ...piece }));
    clipboardPiecesRef.current = nextClipboard;
    setClipboardPieces(nextClipboard);
    setContextMenu(null);
  }

  function pasteClipboardPieces() {
    const sourcePieces = clipboardPiecesRef.current.length ? clipboardPiecesRef.current : clipboardPieces;
    if (!sourcePieces.length) return;
    const groupIdMap = new Map();
    const pastedGroupIds = new Map();
    const nextSelection = [];
    const copies = sourcePieces.map((piece) => {
      const sourceGroupId = piece.groupInstanceId || null;
      const groupInstanceId = sourceGroupId
        ? groupIdMap.get(sourceGroupId) || `group-${crypto.randomUUID()}`
        : null;
      if (sourceGroupId && !groupIdMap.has(sourceGroupId)) groupIdMap.set(sourceGroupId, groupInstanceId);
      const id = `${piece.sourceId || piece.id}-${crypto.randomUUID()}`;
      nextSelection.push(id);
      if (groupInstanceId) {
        if (!pastedGroupIds.has(groupInstanceId)) pastedGroupIds.set(groupInstanceId, []);
        pastedGroupIds.get(groupInstanceId).push(id);
      }
      return {
        ...piece,
        id,
        x: (piece.x || 0) + 0.45,
        y: (piece.y || 0) + 0.45,
        snappedTo: null,
        groupInstanceId,
      };
    });
    const nextPlaced = [...placedRef.current, ...copies];
    placedRef.current = nextPlaced;
    commitPlaced(() => nextPlaced);
    if (pastedGroupIds.size) {
      setStageGroups((groups) => [
        ...groups,
        ...Array.from(pastedGroupIds.entries())
          .filter(([, ids]) => ids.length > 1)
          .map(([id, ids]) => ({ id, ids })),
      ]);
    }
    selectedIdsRef.current = nextSelection;
    setSelectedIds(nextSelection);
    setSelectedId(nextSelection[0] || null);
    setActiveGroupId(null);
    setContextMenu(null);
  }

  function settleSelectedPieces(ids, delta, previousItems = [], anchorId = '') {
    const idSet = new Set(ids);
    if (!idSet.size) return;
    commitPlaced(
      (items) => {
        const previousById = new Map(previousItems.map((item) => [item.id, item]));
        const movedSelection = items
          .filter((item) => idSet.has(item.id))
          .map((item) => {
            const previous = previousById.get(item.id) || item;
            return { ...item, x: (previous.x || 0) + delta.x, y: (previous.y || 0) + delta.y, snappedTo: null };
          });
        if (!snappingEnabled) {
          const movedById = new Map(movedSelection.map((item) => [item.id, item]));
          return items.map((item) => movedById.get(item.id) || item);
        }

        const anchor = movedSelection.find((item) => item.id === anchorId) || movedSelection[0];
        if (!anchor) return items;
        const others = items.filter((item) => !idSet.has(item.id));
        const selectionEdgeBlockers = movedSelection.filter((item) => item.id !== anchor.id);
        const collided = closestCollisionTargets(anchor, collidingPieces(anchor, others));
        const snap = findBestSnap(anchor, others, { collided, edgeBlockers: selectionEdgeBlockers });
        const collisionPlacement = snap ? null : findBestCollisionPlacement(anchor, others, { collided, edgeBlockers: selectionEdgeBlockers });
        const anchorTransform = snap?.transform || collisionPlacement?.transform;
        let settledSelection = movedSelection;
        let anchorTransformApplied = false;

        if (anchorTransform) {
          const rotationDelta = shortAngle((anchorTransform.rotation || 0) - (anchor.rotation || 0));
          const cosine = Math.cos(rotationDelta);
          const sine = Math.sin(rotationDelta);
          settledSelection = movedSelection.map((item) => {
            const relativeX = (item.x || 0) - (anchor.x || 0);
            const relativeY = (item.y || 0) - (anchor.y || 0);
            return {
              ...item,
              x: anchorTransform.x + relativeX * cosine - relativeY * sine,
              y: anchorTransform.y + relativeX * sine + relativeY * cosine,
              rotation: normalizeAngle((item.rotation || 0) + rotationDelta),
              snappedTo: item.id === anchor.id && snap ? snap.targetId : null,
            };
          });
          const externalCollision = settledSelection.some((item) => collidesWithAny(item, others));
          if (externalCollision) settledSelection = movedSelection;
          else anchorTransformApplied = true;
        }

        const movedStillCollides = settledSelection.some((item) => collidesWithAny(item, others));
        if (movedStillCollides && !anchorTransformApplied) {
          settledSelection = items.filter((item) => idSet.has(item.id));
        }
        const settledById = new Map(settledSelection.map((item) => [item.id, item]));
        return items.map((item) => settledById.get(item.id) || item);
      },
      (items) => {
        const previousById = new Map(previousItems.map((item) => [item.id, item]));
        return items.map((item) => previousById.get(item.id) || item);
      },
    );
  }

  function settlePiece(id, transform) {
    commitPlaced((items) => {
      const moving = items.find((item) => item.id === id);
      if (!moving) return items;
      const { previous, ...nextTransform } = transform;
      const moved = { ...moving, ...nextTransform, snappedTo: null };
      if (!snappingEnabled) return items.map((item) => (item.id === id ? moved : item));
      const others = items.filter((item) => item.id !== id);
      const collided = closestCollisionTargets(moved, collidingPieces(moved, others));
      const snap = findBestSnap(moved, others, { collided });
      const collisionPlacement = snap ? null : findBestCollisionPlacement(moved, others, { collided });
      const fallback = previous ? { ...moving, ...previous, snappedTo: moving.snappedTo || null } : moving;
      const next = snap
        ? { ...moved, ...snap.transform, snappedTo: snap.targetId }
        : collisionPlacement
          ? { ...moved, ...collisionPlacement.transform, snappedTo: null }
          : collidesWithAny(moved, others)
            ? fallback
            : moved;
      return items.map((item) => (item.id === id ? next : item));
    }, (items) => {
      if (!transform.previous) return items;
      return items.map((item) => (item.id === id ? { ...item, ...transform.previous } : item));
    });
  }

  function rotatePlaced(id) {
    commitPlaced((items) => {
      const moving = items.find((item) => item.id === id);
      if (!moving) return items;
      if (moving.groupInstanceId) {
        const groupItems = items.filter((item) => item.groupInstanceId === moving.groupInstanceId);
        if (groupItems.length > 1) {
          const center = groupItems.reduce(
            (point, item) => ({ x: point.x + (item.x || 0) / groupItems.length, y: point.y + (item.y || 0) / groupItems.length }),
            { x: 0, y: 0 },
          );
          const groupIds = new Set(groupItems.map((item) => item.id));
          return items.map((item) => {
            if (!groupIds.has(item.id)) return item;
            const dx = (item.x || 0) - center.x;
            const dy = (item.y || 0) - center.y;
            return {
              ...item,
              x: center.x - dy,
              y: center.y + dx,
              rotation: normalizeAngle((item.rotation || 0) + Math.PI / 2),
              snappedTo: null,
            };
          });
        }
      }
      const others = items.filter((item) => item.id !== id);
      if (!snappingEnabled) {
        const rotated = { ...moving, rotation: normalizeAngle(moving.rotation + Math.PI / 2), snappedTo: null };
        return items.map((item) => (item.id === id ? rotated : item));
      }
      const nextFace = findNextSnappedFace(moving, others);
      if (nextFace) {
        const next = { ...moving, ...nextFace.transform, snappedTo: nextFace.targetId };
        return items.map((item) => (item.id === id ? next : item));
      }
      const rotated = { ...moving, rotation: normalizeAngle(moving.rotation + Math.PI / 2), snappedTo: null };
      const snap = findBestSnap(rotated, others);
      const next = snap ? { ...rotated, ...snap.transform, snappedTo: snap.targetId } : collidesWithAny(rotated, others) ? moving : rotated;
      return items.map((item) => (item.id === id ? next : item));
    });
  }

  function savePiece(event) {
    event.preventDefault();
    if (!canUseAdmin) return;
    if (!editingId) return;
    const points = parsePoints(draft.points);
    if (points.length < 3) return;
    const piece = {
      id: editingId || slugify(draft.name) || crypto.randomUUID(),
      name: draft.name.trim() || 'Untitled Piece',
      group: normalizePieceGroupName(draft.group),
      color: draft.color,
      height: Number(draft.height) || 0.18,
      stageWidth: parseOptionalNumber(draft.stageWidth),
      stageLength: parseOptionalNumber(draft.stageLength),
      sourceHeightPx: parseOptionalNumber(draft.sourceHeightPx),
      sourceWidthPx: parseOptionalNumber(draft.sourceWidthPx),
      sourceLengthPx: parseOptionalNumber(draft.sourceLengthPx),
      sourceFootprintScale: parseOptionalNumber(draft.sourceFootprintScale),
      keepAspectRatio: draft.keepAspectRatio !== false,
      analysisVersion: draft.analysisVersion || ANALYSIS_VERSION,
      points,
      snapEdges: draft.snapEdges?.length ? draft.snapEdges : undefined,
      verticalEdges: draft.verticalEdges?.length ? draft.verticalEdges : undefined,
      displayEdges: draft.displayEdges?.length ? draft.displayEdges : undefined,
      type: draft.glbDataUrl || draft.glbUrl ? 'glb' : draft.objText ? 'obj' : 'shape',
      objText: draft.objText || undefined,
      glbDataUrl: draft.glbDataUrl || undefined,
      glbUrl: draft.glbUrl || undefined,
      surfaceSticker: hasSurfaceStickerContent(draft.surfaceSticker) ? normalizeSurfaceSticker(draft.surfaceSticker) : undefined,
    };
    saveAdminPieceSetting(piece);
    setPieces((items) => {
      const without = items.filter((item) => item.id !== editingId && item.id !== piece.id);
      return [...without, piece];
    });
    if (editingId) {
      commitPlaced((items) =>
        items.map((item) =>
          item.sourceId === editingId || item.sourceId === piece.id ? applyLibraryPieceToInstance(piece, item) : item,
        ),
      );
    }
    setDraft(emptyDraft());
    setEditingId(null);
  }

  function editPiece(piece) {
    if (editingId === piece.id) {
      setEditingId(null);
      setDraft(emptyDraft());
      return;
    }
    setEditingId(piece.id);
    setDraft({
      name: piece.name,
      group: normalizePieceGroupName(piece.group),
      color: piece.color,
      height: formatDimensionValue(piece.height),
      stageWidth: formatDimensionValue(pieceStageDimensions(piece).width),
      stageLength: formatDimensionValue(pieceStageDimensions(piece).length),
      sourceHeightPx: piece.sourceHeightPx ?? '',
      sourceWidthPx: piece.sourceWidthPx ?? '',
      sourceLengthPx: piece.sourceLengthPx ?? '',
      sourceFootprintScale: piece.sourceFootprintScale ?? '',
      keepAspectRatio: piece.keepAspectRatio !== false,
      analysisVersion: piece.analysisVersion || '',
      points: piece.points.map((point) => point.join(',')).join(' '),
      snapEdges: piece.snapEdges || [],
      verticalEdges: piece.verticalEdges || [],
      displayEdges: piece.displayEdges || [],
      objText: piece.objText || '',
      glbDataUrl: piece.glbDataUrl || '',
      glbUrl: piece.glbUrl || '',
      surfaceSticker: piece.surfaceSticker,
    });
  }

  async function importModelFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const isGlb = /\.glb$/i.test(file.name) || file.type === 'model/gltf-binary';
    const imported = isGlb ? await readGlbModel(file) : await readObjModel(file);
    setDraft({
      name: file.name.replace(/\.(obj|glb)$/i, ''),
      group: normalizePieceGroupName(draft.group),
      color: draft.color,
      height: formatDimensionValue(imported.sourceHeightPx || imported.height),
      stageWidth: formatDimensionValue(imported.sourceWidthPx || pieceStageDimensions(imported).width),
      stageLength: formatDimensionValue(imported.sourceLengthPx || pieceStageDimensions(imported).length),
      sourceHeightPx: imported.sourceHeightPx ?? '',
      sourceWidthPx: imported.sourceWidthPx ?? '',
      sourceLengthPx: imported.sourceLengthPx ?? '',
      sourceFootprintScale: imported.sourceFootprintScale ?? '',
      keepAspectRatio: draft.keepAspectRatio !== false,
      analysisVersion: imported.analysisVersion,
      surfaceSticker: draft.surfaceSticker,
      points: imported.points.map((point) => point.map((value) => Number(value.toFixed(4))).join(',')).join(' '),
      snapEdges: imported.snapEdges,
      verticalEdges: imported.verticalEdges,
      displayEdges: imported.displayEdges,
      objText: imported.objText || '',
      glbDataUrl: imported.glbDataUrl || '',
      glbUrl: '',
    });
    event.target.value = '';
  }

  function updateDraftDimension(field, value) {
    const next = { ...draft, [field]: value };
    const valueNumber = Number(value);
    if (draft.keepAspectRatio !== false && Number.isFinite(valueNumber) && valueNumber > 0) {
      const dimensions = draftStageDimensions(draft);
      const currentValue = dimensions[field];
      if (Number.isFinite(currentValue) && currentValue > 0) {
        const ratio = valueNumber / currentValue;
        if (field !== 'stageWidth') next.stageWidth = formatDimensionValue(dimensions.stageWidth * ratio);
        if (field !== 'stageLength') next.stageLength = formatDimensionValue(dimensions.stageLength * ratio);
        if (field !== 'height') next.height = formatDimensionValue(dimensions.height * ratio);
      }
    }
    setDraft(next);
  }

  function updatePieceColor(piece, color) {
    if (!canUseAdmin) return;
    const nextPiece = { ...piece, color };
    saveAdminPieceSetting(nextPiece);
    setPieces((items) => items.map((item) => (item.id === piece.id ? nextPiece : item)));
    commitPlaced((items) =>
      items.map((item) => (item.sourceId === piece.id ? applyLibraryPieceToInstance(nextPiece, item) : item)),
    );
    setDraft((current) => (editingId === piece.id ? { ...current, color } : current));
  }

  function updatePieceHeight(piece, value) {
    if (!canUseAdmin) return;
    const height = Number(value);
    if (!Number.isFinite(height) || height <= 0) return;
    const currentSize = pieceStageDimensions(piece);
    const nextPiece = {
      ...piece,
      height,
      stageWidth: currentSize.width,
      stageLength: currentSize.length,
      keepAspectRatio: false,
    };
    saveAdminPieceSetting(nextPiece);
    setPieces((items) => items.map((item) => (item.id === piece.id ? nextPiece : item)));
    commitPlaced((items) =>
      items.map((item) => (item.sourceId === piece.id ? applyLibraryPieceToInstance(nextPiece, item) : item)),
    );
  }

  function commitAdminGroupPieces(group, nextPieces) {
    if (!canUseAdmin || !nextPieces.length) return;
    const updatedById = new Map(nextPieces.map((piece) => [piece.id, piece]));
    nextPieces.forEach((piece) => saveAdminPieceSetting(piece));
    setPieces((items) => items.map((item) => updatedById.get(item.id) || item));
    commitPlaced((items) =>
      items.map((item) => {
        const nextSource = updatedById.get(item.sourceId);
        return nextSource ? applyLibraryPieceToInstance(nextSource, item) : item;
      }),
    );
    setDraft((current) => {
      const nextSource = updatedById.get(editingId);
      if (!nextSource) return current;
      return {
        ...current,
        height: formatDimensionValue(nextSource.height),
        stageWidth: formatDimensionValue(pieceStageDimensions(nextSource).width),
        stageLength: formatDimensionValue(pieceStageDimensions(nextSource).length),
      };
    });
  }

function resetAdminGroupSizeSettings(group, nextPieces) {
    const settings = readAdminPieceSettings();
    const nextById = new Map(nextPieces.map((piece) => [piece.id, piece]));
    group.items.forEach((piece) => {
      const nextPiece = nextById.get(piece.id) ? markPieceSettingsAsUniversalDefault(nextById.get(piece.id)) : null;
      if (!nextPiece) return;
      settings[piece.id] = {
        ...(settings[piece.id] || {}),
        color: nextPiece.color,
        height: nextPiece.height,
        stageWidth: nextPiece.stageWidth,
        stageLength: nextPiece.stageLength,
        defaultColor: nextPiece.defaultColor,
        defaultHeight: nextPiece.defaultHeight,
        defaultStageWidth: nextPiece.defaultStageWidth,
        defaultStageLength: nextPiece.defaultStageLength,
        sourceHeightPx: nextPiece.sourceHeightPx,
        sourceWidthPx: nextPiece.sourceWidthPx,
        sourceLengthPx: nextPiece.sourceLengthPx,
        sourceFootprintScale: nextPiece.sourceFootprintScale,
        keepAspectRatio: nextPiece.keepAspectRatio !== false,
      };
    });
    localStorage.setItem(ADMIN_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  }

  function resetAdminGroupSizes(group) {
    if (!canUseAdmin) return;
    const nextPieces = group.items.map((piece) => sizePieceFromOriginal(piece, 1));
    resetAdminGroupSizeSettings(group, nextPieces);
    commitAdminGroupPieces(group, nextPieces);
    setAdminGroupHeightInputs((current) => {
      const next = { ...current };
      delete next[normalizePieceGroupName(group.name)];
      return next;
    });
  }

  function setAdminGroupHeight(group, value) {
    if (!canUseAdmin) return;
    const targetHeight = Number(value);
    const groupName = normalizePieceGroupName(group.name);
    setAdminGroupHeightInputs((current) => ({ ...current, [groupName]: value }));
    if (!Number.isFinite(targetHeight) || targetHeight <= 0) return;
    const nextPieces = group.items.map((piece) => sizePieceHeightOnly(piece, targetHeight));
    commitAdminGroupPieces(group, nextPieces);
  }

  function deletePiece(id) {
    if (!canUseAdmin) return;
    setPieces((items) => items.filter((item) => item.id !== id));
    commitPlaced((items) => items.filter((item) => item.sourceId !== id));
  }

  function resetScene() {
    commitPlaced(() => []);
    setSelectedId(null);
    setSelectedIds([]);
    setActiveGroupId(null);
    setStageGroups([]);
    setModelTransform(DEFAULT_MODEL_TRANSFORM);
  }

  function startNewProject() {
    if (designHasUnsavedChanges && !window.confirm('Start a new project and discard the unsaved changes on this stage?')) return;
    resetScene();
    setModelName('');
    setActiveLibraryAssetId(null);
    setSavedDesignSignature('');
    localStorage.removeItem(RECOVERY_DRAFT_STORAGE_KEY);
  }

  function saveSelectedAsMotif() {
    if (!canUseAdvancedTools) return;
    if (!selectedPieces.length) return;
    const name = motifName.trim() || `Motif ${savedMotifs.length + 1}`;
    const motif = createMotifFromPieces(name, selectedPieces);
    if (!motif) return;
    setSavedMotifs((items) => [motif, ...items]);
    setSelectedMotifId(motif.id);
    setMotifName('');
  }

  function tessellateSelectedMotif() {
    if (!canUseAdvancedTools) return;
    if (!selectedMotif) return;
    const result = createTessellatedMotifInstances(selectedMotif, {
      rows: motifRows,
      columns: motifColumns,
      gapX: motifGapX,
      gapY: motifGapY,
      visibleBounds: stageVisibleBounds,
    });
    if (!result.pieces.length) return;
    commitPlaced((items) => [...items, ...result.pieces]);
    setStageGroups((groups) => [...groups, ...result.groups]);
    setSelectedIds(result.selectedIds);
    setSelectedId(result.selectedIds[0] || null);
    setActiveGroupId(result.activeGroupId);
  }

  function deleteMotif(id) {
    if (!canUseAdvancedTools) return;
    setSavedMotifs((items) => items.filter((motif) => motif.id !== id));
    setSelectedMotifId((current) => (current === id ? '' : current));
  }

  async function saveCurrentModel() {
    if (!placed.length) return false;
    const name = modelName.trim() || `Girih model ${savedModels.length + 1}`;
    const model = compactSceneModelForStorage(
      serializeSceneModel(name, groupedPlaced, DEFAULT_SCENE_STYLE, material, currentRenderSettings(), DEFAULT_MODEL_TRANSFORM),
    );
    const nextModels = [model, ...savedModels].slice(0, 20);
    if (!await persistSavedModels(nextModels)) {
      window.alert('The model could not be saved in this browser. Check available device storage and try again.');
      return false;
    }
    setSavedModels(nextModels);
    setModelName(name);
    setSavedDesignSignature(activeDesignSignature);
    localStorage.removeItem(RECOVERY_DRAFT_STORAGE_KEY);
    return true;
  }

  function openPieceSurfaceEditor(piece) {
    if (surfaceEditorPieceId === piece.id) {
      setSurfaceEditorPieceId(null);
      setSurfaceStickerDraft(normalizeSurfaceSticker());
      return;
    }
    setSurfaceEditorPieceId(piece.id);
    setSurfaceStickerDraft(normalizeSurfaceSticker(piece.surfaceSticker));
  }

  function savePieceSurfaceSticker(piece) {
    if (!canUseAdmin) return;
    const surfaceSticker = normalizeSurfaceSticker(surfaceStickerDraft);
    const nextPiece = {
      ...piece,
      surfaceSticker: hasSurfaceStickerContent(surfaceSticker) ? surfaceSticker : undefined,
    };
    try {
      saveAdminPieceSetting(nextPiece);
    } catch (error) {
      console.error('Failed to save the piece surface sticker', error);
      window.alert('The sticker is too large to save on this device. Try a smaller PNG or fewer shapes.');
      return;
    }
    setPieces((items) => items.map((item) => (item.id === piece.id ? nextPiece : item)));
    commitPlaced((items) =>
      items.map((item) => (item.sourceId === piece.id ? applyLibraryPieceToInstance(nextPiece, item) : item)),
    );
    setSurfaceEditorPieceId(null);
    setSurfaceStickerDraft(normalizeSurfaceSticker());
  }

  function togglePieceOffsetLines(piece) {
    if (!canUseAdmin) return;
    const nextPiece = { ...piece, offsetLinesEnabled: piece.offsetLinesEnabled === false };
    saveAdminPieceSetting(nextPiece);
    setPieces((items) => items.map((item) => (item.id === piece.id ? nextPiece : item)));
    commitPlaced((items) =>
      items.map((item) => (item.sourceId === piece.id ? { ...item, offsetLinesEnabled: nextPiece.offsetLinesEnabled } : item)),
    );
  }

  async function refreshGirihLibrary() {
    if (!currentUser || !supabase) return;
    setSharedLibraryBusy(true);
    try {
      const assets = await listLibraryAssets(supabase, { assetType: 'girih_pattern' });
      setSharedLibraryModels(assets);
      setSelectedLibraryAssetId((current) => (assets.some((asset) => asset.id === current) ? current : assets[0]?.id || ''));
      setSharedLibraryStatus('');
    } catch (error) {
      setSharedLibraryStatus(error.message);
    } finally {
      setSharedLibraryBusy(false);
    }
  }

  async function saveCurrentModelToLibrary() {
    if (!placed.length || !currentUser || !supabase) return;
    const name = modelName.trim() || `Girih model ${sharedLibraryModels.length + 1}`;
    const basePayload = serializeSceneModel(
      name,
      groupedPlaced,
      DEFAULT_SCENE_STYLE,
      material,
      currentRenderSettings(),
      DEFAULT_MODEL_TRANSFORM,
    );
    setSharedLibraryBusy(true);
    try {
      const previewImage = await modelMarketplacePreview(basePayload).catch(() => '');
      const payload = previewImage ? { ...basePayload, previewImage } : basePayload;
      const result = await saveLibraryAsset(supabase, {
        assetId: activeLibraryAssetId,
        assetType: 'girih_pattern',
        sourceApp: 'girih',
        name,
        payload,
        metadata: { editorSchemaVersion: payload.version || 1, pieceCount: groupedPlaced.length },
        artifacts: previewImage ? { preview_png: previewImage } : undefined,
      });
      setActiveLibraryAssetId(result.assetId);
      setModelName(name);
      setSavedDesignSignature(activeDesignSignature);
      await refreshGirihLibrary();
      if (libraryEditReturnTo) {
        allowPageExitRef.current = true;
        const returnUrl = new URL(libraryEditReturnTo, window.location.origin);
        returnUrl.searchParams.set('libraryUpdated', '1');
        returnUrl.searchParams.set('assetId', result.assetId);
        returnUrl.searchParams.set('sourceApp', 'girih');
        window.location.href = returnUrl.toString();
        return;
      }
      setSharedLibraryStatus(result.updated
        ? `Library version ${result.versionNumber} saved.`
        : 'Saved to your shared library.');
    } catch (error) {
      setSharedLibraryStatus(error.message);
    } finally {
      setSharedLibraryBusy(false);
    }
  }

  async function saveCurrentModelFromHeader() {
    await saveCurrentModelToLibrary();
    if (!libraryEditReturnTo) setSharedLibraryDialogOpen(true);
  }

  function openGirihLibraryAsset(asset) {
    const payload = asset.currentVersion?.payload;
    if (!payload) {
      setSharedLibraryStatus('This library item has no readable version.');
      return;
    }
    loadSavedModel(payload, asset.id);
    setSharedLibraryStatus(`Opened ${asset.name} · version ${asset.currentVersion.version_number}.`);
  }

  async function renameGirihLibraryAsset() {
    if (!selectedLibraryAssetId) return;
    setSharedLibraryBusy(true);
    try {
      await updateLibraryAssetMetadata(supabase, selectedLibraryAssetId, sharedLibraryEdit);
      await refreshGirihLibrary();
      setSharedLibraryStatus('Library item renamed.');
    } catch (error) {
      setSharedLibraryStatus(error.message);
    } finally {
      setSharedLibraryBusy(false);
    }
  }

  async function archiveGirihLibraryAsset(asset) {
    if (!asset) return;
    if (!window.confirm(`Archive "${asset.name}" from the Girih library?`)) return;
    setSharedLibraryBusy(true);
    try {
      await archiveLibraryAsset(supabase, asset.id);
      setSelectedLibraryAssetId('');
      await refreshGirihLibrary();
      setSharedLibraryStatus('Library item archived.');
    } catch (error) {
      setSharedLibraryStatus(error.message);
    } finally {
      setSharedLibraryBusy(false);
    }
  }

  async function makeGirihLibraryVersionCurrent(asset, version) {
    if (!asset || !version) return;
    setSharedLibraryBusy(true);
    try {
      await setCurrentLibraryAssetVersion(supabase, asset.id, version.id);
      await refreshGirihLibrary();
      setSelectedLibraryVersionId(version.id);
      setSharedLibraryStatus(`Version ${version.version_number} is now current.`);
    } catch (error) {
      setSharedLibraryStatus(error.message);
    } finally {
      setSharedLibraryBusy(false);
    }
  }

  useEffect(() => {
    const asset = sharedLibraryModels.find((item) => item.id === selectedLibraryAssetId) || sharedLibraryModels[0] || null;
    if (!asset) {
      setSharedLibraryEdit({ name: '', description: '' });
      setSharedLibraryVersions([]);
      setSelectedLibraryVersionId('');
      return;
    }
    setSharedLibraryEdit({ name: asset.name || '', description: asset.description || '' });
    listLibraryAssetVersions(supabase, asset.id)
      .then((versions) => {
        setSharedLibraryVersions(versions);
        setSelectedLibraryVersionId((current) => (
          versions.some((version) => version.id === current)
            ? current
            : asset.current_version_id || versions[0]?.id || ''
        ));
      })
      .catch((error) => setSharedLibraryStatus(error.message));
  }, [selectedLibraryAssetId, sharedLibraryModels]);

  function loadSavedModel(model, libraryAssetId = null) {
    const next = centerScenePieces(rehydrateScenePieces(model));
    commitPlaced(() => next);
    const nextMaterial = normalizeMaterialName(model.material || material);
    setMaterial(nextMaterial);
    const renderSettings = normalizeRenderSettings(model.renderSettings);
    setModelTransform(DEFAULT_MODEL_TRANSFORM);
    setRenderBgColor(renderSettings.backgroundColor);
    setRenderEdgeColor(renderSettings.edgeColor);
    setRenderEdgeThickness(renderSettings.edgeThickness);
    setRenderEdgeMode(renderSettings.edgeMode);
    setRenderEdgeOffsetCount(renderSettings.edgeOffsetCount);
    setRenderEdgeOffsetDistance(renderSettings.edgeOffsetDistance);
    setSelectedId(null);
    setSelectedIds([]);
    setActiveGroupId(null);
    setStageGroups([]);
    setModelName(model.name || 'Girih model');
    setActiveLibraryAssetId(libraryAssetId);
    setSavedDesignSignature(designStateSignature(next, nextMaterial, renderSettings, DEFAULT_MODEL_TRANSFORM));
    localStorage.removeItem(RECOVERY_DRAFT_STORAGE_KEY);
  }

  function requestProtectedNavigation(url) {
    if (!designHasUnsavedChanges) {
      allowPageExitRef.current = true;
      window.location.assign(url);
      return;
    }
    setPendingNavigationUrl(new URL(url, window.location.href).href);
  }

  async function continuePendingNavigation(saveFirst) {
    if (!pendingNavigationUrl) return;
    if (saveFirst && !await saveCurrentModel()) return;
    if (!saveFirst) localStorage.removeItem(RECOVERY_DRAFT_STORAGE_KEY);
    const destination = pendingNavigationUrl;
    setPendingNavigationUrl('');
    allowPageExitRef.current = true;
    window.location.assign(destination);
  }

  function importSavedModel(model) {
    const incoming = centerScenePieces(rehydrateScenePieces(model));
    commitPlaced((items) => [...items, ...incoming]);
    setSelectedId(null);
    setSelectedIds([]);
    setActiveGroupId(null);
    setStageGroups([]);
  }

  async function deleteSavedModel(id) {
    const nextModels = savedModels.filter((item) => item.id !== id);
    if (!await persistSavedModels(nextModels)) return;
    setSavedModels(nextModels);
  }

  async function importSceneModelFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      const incoming = centerScenePieces(rehydrateScenePieces(payload));
      if (incoming.length) commitPlaced((items) => [...items, ...incoming]);
    } catch (error) {
      console.error('Failed to import Girih model', error);
    }
    event.target.value = '';
  }

  async function renderExportPreviewCanvas(format = exportFormat, options = {}) {
    const safeFormat = contextualExportOptions.some((option) => option.value === format) ? format : contextualExportOptions[0]?.value || 'png';
    const renderSettings = currentExportRenderSettings();
    const orientation = options.orientation || exportOrientation;
    const paperSize = options.paperSize || exportPaperSize;
    const transparentBackground = safeFormat === 'png-transparent' || (!!options.transparentBackground && TRANSPARENT_BACKGROUND_EXPORT_FORMATS.has(safeFormat));
    const graphicStyle = exportDimensionMode === '2d' ? (options.graphicStyle || export2DStyle) : 'standard';
    const exportMaterial = normalizeMaterialName(options.exportMaterial || export3DMaterial);
    const exportCamera = options.exportCamera || export3DCamera;
    if (graphicStyle !== 'standard') {
      return renderGraphic2DCanvas(visibleGroupedPlaced, {
        modelTransform: DEFAULT_MODEL_TRANSFORM,
        orientation,
        paperSize,
        renderSettings,
        transparentBackground,
        graphicStyle,
        pencilColor: exportEdgeColor,
        pencilIntensity: exportPencilIntensity,
        paperGap: exportPaperGap,
        paperCutOut: exportPaperCutOut,
        hatchSpacing: exportHatchSpacing,
        hatchThickness: exportHatchThickness,
        hatchAngle: exportHatchAngle,
        hatchOutline: exportHatchOutline,
      });
    }
    const topLinePreviewFormats = new Set(['png-transparent', 'svg', 'eps', 'dxf']);
    if (safeFormat === 'png-flat-color' || (exportDimensionMode === '2d' && safeFormat === 'pdf')) {
      return renderFlatColorTopCanvas(visibleGroupedPlaced, { modelTransform: DEFAULT_MODEL_TRANSFORM, orientation, paperSize, renderSettings, transparentBackground, material: exportMaterial, glassSettings });
    }
    if (safeFormat === 'svg' && material === 'glass') {
      return renderFlatColorTopCanvas(visibleGroupedPlaced, { modelTransform: DEFAULT_MODEL_TRANSFORM, orientation, paperSize, renderSettings, transparentBackground: true, material, glassSettings });
    }
    if (topLinePreviewFormats.has(safeFormat)) {
      return renderTransparentTopCanvas(visibleGroupedPlaced, { modelTransform: DEFAULT_MODEL_TRANSFORM, orientation, paperSize, renderSettings });
    }
    return renderSceneCanvas(visibleGroupedPlaced, {
      style: DEFAULT_SCENE_STYLE,
      material: exportMaterial,
      glassSettings,
      modelTransform: DEFAULT_MODEL_TRANSFORM,
      view: exportCamera,
      cameraSnapshot: null,
      orientation,
      paperSize,
      renderSettings,
      transparentBackground,
      shadowsEnabled: !!options.exportShadows && !transparentBackground,
      zoom: options.zoom || 1,
      pan: options.pan,
    });
  }

  async function exportScene(format, options = {}) {
    if (!contextualExportOptions.some((option) => option.value === format)) return;
    const renderSettings = currentExportRenderSettings();
    const orientation = options.orientation || exportOrientation;
    const paperSize = options.paperSize || exportPaperSize;
    const transparentBackground = format === 'png-transparent' || (!!exportTransparentBackground && TRANSPARENT_BACKGROUND_EXPORT_FORMATS.has(format));
    if (exportDimensionMode === '2d' && export2DStyle !== 'standard' && GRAPHIC_2D_EXPORT_FORMATS.has(format)) {
      const canvas = renderGraphic2DCanvas(visibleGroupedPlaced, {
        modelTransform: DEFAULT_MODEL_TRANSFORM,
        orientation,
        paperSize,
        renderSettings,
        transparentBackground,
        graphicStyle: export2DStyle,
        pencilColor: exportEdgeColor,
        pencilIntensity: exportPencilIntensity,
        paperGap: exportPaperGap,
        paperCutOut: exportPaperCutOut,
        hatchSpacing: exportHatchSpacing,
        hatchThickness: exportHatchThickness,
        hatchAngle: exportHatchAngle,
        hatchOutline: exportHatchOutline,
      });
      if (format === 'pdf') downloadPdfFromCanvas(`girih-model-${export2DStyle}.pdf`, canvas, orientation, paperSize);
      else downloadCanvasPng(`girih-model-${export2DStyle}.png`, canvas);
      return;
    }
    const payload = serializeSceneModel(modelName.trim() || 'Girih scene', visibleGroupedPlaced, DEFAULT_SCENE_STYLE, material, renderSettings, DEFAULT_MODEL_TRANSFORM);
    if (format === 'mp4') {
      await exportCameraVideo();
      return;
    }
    if (format === 'png') {
      const canvas = await renderSceneCanvas(visibleGroupedPlaced, { style: DEFAULT_SCENE_STYLE, material: export3DMaterial, glassSettings, modelTransform: DEFAULT_MODEL_TRANSFORM, view: export3DCamera, cameraSnapshot: null, orientation, paperSize, renderSettings, transparentBackground, shadowsEnabled: export3DShadows && !transparentBackground, zoom: exportPreviewZoom, pan: exportPreviewPan });
      downloadCanvasPng('girih-model.png', canvas);
      return;
    }
    if (format === 'png-transparent') {
      const canvas = renderTransparentTopCanvas(visibleGroupedPlaced, { modelTransform: DEFAULT_MODEL_TRANSFORM, orientation, paperSize, renderSettings });
      downloadCanvasPng('girih-model-transparent.png', canvas);
      return;
    }
    if (format === 'png-flat-color') {
      const canvas = renderFlatColorTopCanvas(visibleGroupedPlaced, { modelTransform: DEFAULT_MODEL_TRANSFORM, orientation, paperSize, renderSettings, transparentBackground, material, glassSettings });
      downloadCanvasPng('girih-model-flat-color.png', canvas);
      return;
    }
    if (format === 'pdf') {
      const canvas = await renderSceneCanvas(visibleGroupedPlaced, { style: DEFAULT_SCENE_STYLE, material: export3DMaterial, glassSettings, modelTransform: DEFAULT_MODEL_TRANSFORM, view: export3DCamera, cameraSnapshot: null, orientation, paperSize, renderSettings, shadowsEnabled: export3DShadows, zoom: exportPreviewZoom, pan: exportPreviewPan });
      downloadPdfFromCanvas('girih-model.pdf', canvas, orientation, paperSize);
      return;
    }
    if (format === 'svg') {
      downloadText('girih-model.svg', toSvg(visibleGroupedPlaced, { modelTransform: DEFAULT_MODEL_TRANSFORM, material, glassSettings }));
      return;
    }
    if (format === 'eps') {
      downloadText('girih-model.eps', toEps(visibleGroupedPlaced, { modelTransform: DEFAULT_MODEL_TRANSFORM }));
      return;
    }
    if (format === 'dxf') {
      downloadText('girih-model.dxf', toDxf(visibleGroupedPlaced, { modelTransform: DEFAULT_MODEL_TRANSFORM }));
      return;
    }
    if (format === 'stl') {
      downloadText('girih-model.stl', await toStl(visibleGroupedPlaced, { modelTransform: DEFAULT_MODEL_TRANSFORM }));
      return;
    }
    const text = format === 'json' ? JSON.stringify(payload, null, 2) : toObj(payload);
    downloadText(`girih-model.${format}`, text);
  }

  async function exportCameraVideo() {
    if (cameraVideoRecordingRef.current) return;
    const canvas = document.querySelector('.stage-canvas canvas');
    if (!canvas || typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') {
      alert('MP4 export requires a browser with WebCodecs support. Please use the latest Chrome, Edge, or Safari.');
      return;
    }
    if (exportDimensionMode === '2d' && format === 'pdf') {
      const canvas = renderFlatColorTopCanvas(visibleGroupedPlaced, { modelTransform: DEFAULT_MODEL_TRANSFORM, orientation, paperSize, renderSettings, transparentBackground: false, material, glassSettings });
      downloadPdfFromCanvas('girih-model-2d-color.pdf', canvas, orientation, paperSize);
      return;
    }
    const encoderConfig = {
      codec: 'avc1.420028',
      width: CAMERA_VIDEO_WIDTH,
      height: CAMERA_VIDEO_HEIGHT,
      bitrate: CAMERA_VIDEO_BITRATE,
      framerate: CAMERA_VIDEO_FPS,
      bitrateMode: 'constant',
      latencyMode: 'quality',
      avc: { format: 'avc' },
    };
    const support = await VideoEncoder.isConfigSupported(encoderConfig);
    if (!support.supported) {
      alert('This browser cannot encode H.264 MP4 video. Please use the latest Chrome, Edge, or Safari.');
      return;
    }
    const recordingCanvas = document.createElement('canvas');
    recordingCanvas.width = CAMERA_VIDEO_WIDTH;
    recordingCanvas.height = CAMERA_VIDEO_HEIGHT;
    const recordingContext = recordingCanvas.getContext('2d', { alpha: false });
    const target = new ArrayBufferTarget();
    const muxer = new Muxer({
      target,
      video: {
        codec: 'avc',
        width: CAMERA_VIDEO_WIDTH,
        height: CAMERA_VIDEO_HEIGHT,
      },
      fastStart: 'in-memory',
      firstTimestampBehavior: 'offset',
    });
    let encoderError = null;
    const encoder = new VideoEncoder({
      output: (chunk, metadata) => muxer.addVideoChunk(chunk, metadata),
      error: (error) => {
        encoderError = error;
      },
    });
    encoder.configure(encoderConfig);
    cameraVideoRecordingRef.current = true;
    try {
      setCameraVideoPlaying(false);
      await nextAnimationFrame();
      cameraVideoProgressRef.current = 0;
      setCameraVideoPlaying(true);
      await nextAnimationFrame();
      const totalFrames = Math.round((selectedVideoDurationMs / 1000) * CAMERA_VIDEO_FPS);
      const frameDuration = Math.round(1000000 / CAMERA_VIDEO_FPS);
      for (let frameIndex = 0; frameIndex < totalFrames; frameIndex += 1) {
        cameraVideoProgressRef.current = frameIndex / Math.max(1, totalFrames - 1);
        await nextAnimationFrame();
        drawVideoCanvasFrame(recordingContext, canvas, renderBgColor);
        const frame = new VideoFrame(recordingCanvas, {
          timestamp: frameIndex * frameDuration,
          duration: frameDuration,
        });
        encoder.encode(frame, { keyFrame: frameIndex % (CAMERA_VIDEO_FPS * 2) === 0 });
        frame.close();
        if (encoder.encodeQueueSize > 12) await encoder.flush();
        if (encoderError) throw encoderError;
      }
      await encoder.flush();
      if (encoderError) throw encoderError;
      encoder.close();
      muxer.finalize();
      setCameraVideoPlaying(false);
      cameraVideoProgressRef.current = null;
      downloadBlob(`girih-${selectedVideoPreset.type === 'assembly' ? 'assembly' : 'camera'}-${selectedVideoPreset.id}.mp4`, new Blob([target.buffer], { type: 'video/mp4' }));
    } catch (error) {
      console.error('Failed to export camera video', error);
      alert('Video export failed. Please try again.');
      setCameraVideoPlaying(false);
      if (encoder.state !== 'closed') encoder.close();
    } finally {
      cameraVideoProgressRef.current = null;
      cameraVideoRecordingRef.current = false;
    }
  }

  function openExportDialog() {
    if (!visibleGroupedPlaced.length) return;
    setExportBgColor(renderBgColor);
    setExportEdgeColor(renderEdgeColor);
    setExportEdgeThickness(renderEdgeThickness);
    setExportEdgeOffsetCount(renderEdgeOffsetCount);
    setExportEdgeOffsetDistance(renderEdgeOffsetDistance);
    setExport3DMaterial(material === 'paper' ? 'plastic' : material);
    setExport3DCamera(stageCamera);
    setExport3DShadows(liveShadowsEnabled);
    setExportPreviewZoom(1);
    setExportPreviewPan({ x: 0, y: 0 });
    if (!contextualExportOptions.some((option) => option.value === exportFormat)) {
      setExportFormat(contextualExportOptions[0]?.value || availableExportOptions[0]?.value || 'png');
    }
    setExportDialogOpen(true);
  }

  async function printCurrentExport() {
    if (!visibleGroupedPlaced.length) return;
    const printWindow = openPrintWindow();
    if (!printWindow) return;
    try {
      const canvas =
        exportPreviewCanvasRef.current ||
        (await renderExportPreviewCanvas(exportFormat, {
          orientation: exportOrientation,
          paperSize: exportPaperSize,
          transparentBackground: exportTransparentBackground,
          graphicStyle: export2DStyle,
          paperCutOut: exportPaperCutOut,
          exportMaterial: export3DMaterial,
          exportCamera: export3DCamera,
          exportShadows: export3DShadows,
          zoom: exportPreviewZoom,
          pan: exportPreviewPan,
        }));
      printCanvas(canvas, exportOrientation, `${modelName.trim() || 'Girih model'} - ${exportFormat}`, exportPaperSize, printWindow);
    } catch (error) {
      printWindow.close();
      window.alert(error?.message || 'Unable to prepare the print preview.');
    }
  }

  function printItemSummaryList() {
    const rows = itemSummaryItems.map((item) => `
      <tr>
        <td class="shape">${pieceSummarySvgMarkup(item.piece)}</td>
        <td>${escapeHtml(item.name)}</td>
        <td class="count">${item.count}</td>
      </tr>
    `).join('');
    const frame = openPrintWindow();
    if (!frame) return;
    frame.document.write(`<!doctype html>
<html>
  <head>
    <title>Item summary</title>
    <style>
      @page { size: A4 portrait; margin: 12mm; }
      body { margin: 0; color: #2d2924; font-family: Arial, sans-serif; }
      h1 { margin: 0 0 12px; font-size: 18px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border-bottom: 1px solid #d8ccba; padding: 7px 8px; text-align: left; font-size: 12px; }
      th { background: #f6efe3; font-size: 11px; text-transform: uppercase; }
      .shape { width: 42px; }
      .shape svg { width: 30px; height: 30px; display: block; }
      .count { width: 70px; text-align: right; font-weight: 700; }
    </style>
  </head>
  <body>
    <h1>Item summary (${placed.length} pieces)</h1>
    <table>
      <thead><tr><th>Shape</th><th>Item name</th><th class="count">Count</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="3">No visible items on stage.</td></tr>'}</tbody>
    </table>
    <script>
      window.addEventListener('load', () => {
        window.focus();
        window.print();
      });
    </script>
  </body>
</html>`);
    frame.document.close();
  }

  if (!currentUser) {
    return (
      <LoginScreen
        ready={authReady}
        configured={supabaseConfigured}
        mode={authMode}
        name={loginName}
        email={loginEmail}
        password={loginPassword}
        error={loginError}
        message={loginMessage}
        busy={authBusy}
        onModeChange={(mode) => {
          setAuthMode(mode);
          setLoginError('');
          setLoginMessage('');
        }}
        onNameChange={setLoginName}
        onEmailChange={setLoginEmail}
        onPasswordChange={setLoginPassword}
        onSubmit={handleLogin}
        onGoogleLogin={handleGoogleLogin}
      />
    );
  }

  return (
    <div
      className={`app-shell girih-theme-girih ${nightMode ? 'night-mode' : ''}`}
      onPointerDown={(event) => {
        if (!mobileAdminOpen && !templatePanelOpen) return;
        if (
          event.target.closest('.admin-panel') ||
          event.target.closest('.template-panel') ||
          event.target.closest('[data-admin-toggle]') ||
          event.target.closest('[data-template-toggle]')
        ) {
          return;
        }
        setMobileAdminOpen(false);
        setTemplatePanelOpen(false);
      }}
    >
      <header className="girih-editor-header girih-product-header">
        <div className="girih-editor-brand girih-header-start">
          <a href="/" aria-label="Girih Studio home"><img src="/landing/brand/girih-logo-color.png" alt="" /><span>Girih Studio</span></a>
          <i />
          <span className="girih-product-identity"><girih-app-icon app="girih"></girih-app-icon><strong>Girih App</strong><small>Pattern design</small></span>
        </div>
        <div className="girih-header-tools girih-editor-tools" aria-label="Project commands">
          <button type="button" className="girih-button" onClick={startNewProject}><Plus size={15} /> New</button>
          <button type="button" className="girih-button" onClick={undoStage} disabled={!canUndo}><Undo2 size={15} /> Undo</button>
          <button type="button" className="girih-button" onClick={redoStage} disabled={!canRedo}><Redo2 size={15} /> Redo</button>
          <button type="button" className="girih-button" onClick={() => importSceneInputRef.current?.click()}><Upload size={15} /> Import</button>
          <button type="button" className="girih-button" onClick={openExportDialog} disabled={!visibleGroupedPlaced.length}><Download size={15} /> Export</button>
          <button type="button" className="girih-button girih-editor-save-button" disabled={!placed.length || sharedLibraryBusy} onClick={saveCurrentModelFromHeader}><Save size={15} /> {sharedLibraryBusy ? 'Saving...' : 'Save project'}</button>
        </div>
        <nav className="girih-header-end" aria-label="Girih App navigation">
          <a href="/training?app=girih"><GraduationCap size={15} /> Academy</a>
          <button type="button" onClick={() => { setSharedLibraryDialogOpen(true); refreshGirihLibrary(); }}><FolderOpen size={15} /> Library</button>
          <a href="/profile"><User size={15} /> Profile</a>
          <girih-app-switcher current-app="girih" compact></girih-app-switcher>
        </nav>
        <input ref={importSceneInputRef} className="hidden-file" type="file" accept="application/json,.json" onChange={importSceneModelFile} />
      </header>
      {sharedLibraryDialogOpen && (
        <div className="shared-library-dialog-backdrop" role="presentation" onPointerDown={() => setSharedLibraryDialogOpen(false)}>
          <section className="shared-library-dialog" role="dialog" aria-modal="true" aria-labelledby="girih-library-title" onPointerDown={(event) => event.stopPropagation()}>
            <div className="shared-library-dialog-heading">
              <div><small>Girih Studio</small><h2 id="girih-library-title">Girih pattern library</h2></div>
              <button type="button" onClick={() => setSharedLibraryDialogOpen(false)}>Close</button>
            </div>
            <SharedLibraryModelControls
              signedIn={!!currentUser}
              assets={sharedLibraryModels}
              activeAssetId={activeLibraryAssetId}
              selectedAssetId={selectedLibraryAssetId}
              selectedVersionId={selectedLibraryVersionId}
              editForm={sharedLibraryEdit}
              versions={sharedLibraryVersions}
              busy={sharedLibraryBusy}
              status={sharedLibraryStatus}
              canSave={!!placed.length}
              onSave={saveCurrentModelToLibrary}
              onOpen={openGirihLibraryAsset}
              onRefresh={refreshGirihLibrary}
              onSelect={(asset) => { setSelectedLibraryAssetId(asset.id); setSharedLibraryEdit({ name: asset.name || '', description: asset.description || '' }); }}
              onEditChange={setSharedLibraryEdit}
              onRename={renameGirihLibraryAsset}
              onArchive={archiveGirihLibraryAsset}
              onSelectVersion={setSelectedLibraryVersionId}
              onMakeCurrentVersion={makeGirihLibraryVersionCurrent}
            />
          </section>
        </div>
      )}
      <div className="mobile-topbar">
        {!mobilePiecesOpen && (
        <button className="mobile-shapes-button" type="button" onClick={() => setMobilePiecesOpen((open) => !open)}>
          <Layers3 size={18} /> Shapes
        </button>
        )}
        <button className="mobile-home-button" type="button" aria-label="Return to Girih Studio landing page" title="Home" onClick={() => requestProtectedNavigation('/')}>
          <img src="/landing/brand/girih-logo-color.png" alt="" aria-hidden="true" />
        </button>
        <girih-app-switcher current-app="girih" compact></girih-app-switcher>
        <button className="mobile-menu-button" type="button" onClick={() => setMobileMenuOpen(true)}>
          <Menu size={18} /> Menu
        </button>
      </div>

      {(mobileMenuOpen || mobileAdminOpen || templatePanelOpen) && (
        <button
          type="button"
          className="mobile-scrim"
          aria-label="Close mobile panel"
          onClick={() => {
            setMobileMenuOpen(false);
            setMobileAdminOpen(false);
            setTemplatePanelOpen(false);
          }}
        />
      )}

      <aside className={`library-panel girih-product-sidebar ${mobilePiecesOpen ? 'open' : ''}`}>
        <div className="brand-app-row">
          <a className="brand-block" href="/" aria-label="Return to Girih Studio home">
            <img src="/landing/brand/girih-logo-color.png" alt="" aria-hidden="true" />
            <girih-app-icon app="girih"></girih-app-icon><h1>Girih App</h1>
          </a>
          <girih-app-switcher current-app="girih" compact></girih-app-switcher>
        </div>
        <div className="profile-card desktop-profile-card">
          <button type="button" className="profile-identity" aria-expanded={accountMenuOpen} onClick={() => setAccountMenuOpen((open) => !open)}>
            <User size={17} />
            <span>
              <strong>{currentUser.name}</strong>
              <small>{roleLabel(userRole)} profile</small>
            </span>
          </button>
          {accountMenuOpen && <nav className="profile-account-menu" aria-label="User account">
            <a href="/profile"><User size={15} /> Profile</a>
            <a href="/training?app=girih"><GraduationCap size={15} /> Academy</a>
            <a href="/marketplace" aria-label="Marketplace"><Store size={15} /> Market place</a>
            {isAdminUser && <a href="/admin"><BarChart3 size={15} /> User overview</a>}
          </nav>}
          {!isAdminUser && (
            <button
              type="button"
              className="billing-button"
              disabled={billingBusy}
              onClick={() => openBillingFlow(isPaidUser ? '/api/create-portal-session' : '/api/create-checkout-session')}
            >
              {billingBusy ? 'Opening...' : isPaidUser ? 'Billing' : 'Upgrade'}
            </button>
          )}
          <button type="button" onClick={logout}>
            Log out
          </button>
        </div>

        <section className="panel-section piece-library-section">
          <div className="section-title">
            <Layers3 size={18} />
            <span>Piece Library</span>
            <button type="button" className="mobile-close-button" aria-label="Close shapes panel" onClick={() => setMobilePiecesOpen(false)}>
              <X size={16} />
            </button>
          </div>
          <div className="piece-list">
            {pieceGroups.map((group) => {
              const collapsed = collapsedPieceGroups.has(group.name);
              return (
                <div className="piece-group" key={group.name}>
                  <div className="piece-group-actions">
                    <button
                      type="button"
                      className="piece-group-toggle"
                      title={group.name}
                      aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${group.name} group`}
                      onClick={() => togglePieceGroup(group.name)}
                    >
                      <span>{group.name}</span>
                      <small>{group.items.length}</small>
                      <span aria-hidden="true">{collapsed ? '+' : '-'}</span>
                    </button>
                    {canUseTemplates && <button
                      type="button"
                      className="template-group-button"
                      title={`Open ${group.name} templates`}
                      aria-label={`Open ${group.name} templates`}
                      data-template-toggle
                      onClick={() => openTemplateGroup(group.name)}
                    >
                      <img src={TEMPLATE_GROUP_LOGOS[group.name]} alt="" />
                    </button>}
                  </div>
                  {!collapsed && (
                    <div className="piece-group-items">
                      {group.items.map((piece) => (
                        <button key={piece.id} className="piece-card" title={piece.name} aria-label={`Add ${piece.name}`} onClick={() => addPiece(piece)}>
                          <PieceIcon piece={piece} />
                          <span>{piece.name}</span>
                          <Plus size={16} />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {canUseAdvancedTools && (
        <section className="panel-section model-panel desktop-library-controls">
          <CollapsibleControlGroup title="Motifs" collapsed={motifsCollapsed} onToggle={() => setMotifsCollapsed((collapsed) => !collapsed)}>
          <label>
            Motif name
            <input value={motifName} onChange={(event) => setMotifName(event.target.value)} placeholder="Selected motif" />
          </label>
          <div className="action-row">
            <button onClick={saveSelectedAsMotif} disabled={!selectedPieces.length}>
              <Save size={16} /> Save selected
            </button>
          </div>
          <label>
            Saved motif
            <select value={selectedMotif?.id || ''} onChange={(event) => setSelectedMotifId(event.target.value)} disabled={!savedMotifs.length}>
              {!savedMotifs.length && <option value="">No motifs saved</option>}
              {savedMotifs.map((motif) => (
                <option key={motif.id} value={motif.id}>
                  {motif.name}
                </option>
              ))}
            </select>
          </label>
          <div className="controls-grid compact-grid">
            <label>
              Columns
              <input type="number" min="1" max="30" value={motifColumns} onChange={(event) => setMotifColumns(event.target.value)} />
            </label>
            <label>
              Rows
              <input type="number" min="1" max="30" value={motifRows} onChange={(event) => setMotifRows(event.target.value)} />
            </label>
            <label>
              Gap X
              <input type="number" min="-10" max="10" step="0.05" value={motifGapX} onChange={(event) => setMotifGapX(event.target.value)} />
            </label>
            <label>
              Gap Y
              <input type="number" min="-10" max="10" step="0.05" value={motifGapY} onChange={(event) => setMotifGapY(event.target.value)} />
            </label>
          </div>
          <div className="action-row">
            <button onClick={tessellateSelectedMotif} disabled={!selectedMotif}>
              <Grid3X3 size={16} /> Tessellate
            </button>
            <button onClick={() => selectedMotif && deleteMotif(selectedMotif.id)} disabled={!selectedMotif}>
              <Trash2 size={16} /> Delete
            </button>
          </div>
          {selectedMotif && (
            <div className="motif-summary">
              {selectedMotif.pieces.length} pieces, {selectedMotif.width.toFixed(2)} x {selectedMotif.height.toFixed(2)}
            </div>
          )}
          </CollapsibleControlGroup>
        </section>
        )}

        <section className="panel-section controls-grid desktop-library-controls">
          <CollapsibleControlGroup
            title="Model Transform"
            collapsed={modelTransformCollapsed}
            onToggle={() => setModelTransformCollapsed((collapsed) => !collapsed)}
          >
            <ModelTransformControls
              modelTransform={modelTransform}
              keepAspectRatio={modelTransformKeepAspect}
              onKeepAspectRatioChange={setModelTransformKeepAspect}
              onChange={updateModelTransform}
              disabled={!selectedPieces.length}
            />
          </CollapsibleControlGroup>
        </section>

        <section className="panel-section controls-grid desktop-library-controls">
          <label>
            Material
            <select value={material} onChange={(event) => changeMaterial(event.target.value)}>
              <option value="plastic">Plastic</option>
              <option value="glass">Glass</option>
              <option value="paper">Paper</option>
            </select>
          </label>
          {material === 'glass' && <GlassAppearanceControls settings={glassSettings} onChange={setGlassSettings} />}
        </section>

        <section className="panel-section controls-grid desktop-library-controls">
          <div className="section-title">
            <Palette size={18} />
            <span>View</span>
          </div>
          <div className="export-grid">
            <label className={inactivePaperExportControlClass}>
              Stage BG color
              <input type="color" value={renderBgColor} onChange={(event) => setRenderBgColor(event.target.value)} disabled={isPaperMaterial} />
            </label>
            <label className={inactivePaperExportControlClass}>
              Edge line color
              <input type="color" value={renderEdgeColor} onChange={(event) => setRenderEdgeColor(event.target.value)} disabled={isPaperMaterial} />
            </label>
            <div className="export-checkbox-row">
              <label className={`checkbox-field export-checkbox-field ${inactivePaperExportControlClass || ''}`}>
                <input
                  type="checkbox"
                  checked={liveShadowsEnabled}
                  onChange={(event) => setLiveShadowsEnabled(event.target.checked)}
                  disabled={isPaperMaterial}
                />
                <span>Live shadows</span>
              </label>
              <label className={`checkbox-field export-checkbox-field ${inactivePaperExportControlClass || ''}`}>
                <input
                  type="checkbox"
                  checked={edgeLineEnabled}
                  onChange={(event) => changeEdgeLineEnabled(event.target.checked)}
                  disabled={isPaperMaterial}
                />
                <span>Edge line</span>
              </label>
            </div>
            <div className="export-offset-row">
              <label className={inactivePaperExportControlClass}>
                Offset count
                <input
                  type="number"
                  min="1"
                  max="12"
                  step="1"
                  value={renderEdgeOffsetCount}
                  onChange={(event) => setRenderEdgeOffsetCount(event.target.value)}
                  disabled={isPaperMaterial}
                />
              </label>
              <label className={inactivePaperExportControlClass}>
                Offset distance px
                <input
                  type="number"
                  min="0"
                  max="80"
                  step="0.5"
                  value={renderEdgeOffsetDistance}
                  onChange={(event) => setRenderEdgeOffsetDistance(event.target.value)}
                  disabled={isPaperMaterial}
                />
              </label>
            </div>
          </div>
        </section>
      </aside>

      <aside className={`mobile-menu-panel ${mobileMenuOpen ? 'open' : ''}`}>
        <div className="section-title">
          <Menu size={18} />
          <span>Menu</span>
          <button type="button" className="mobile-close-button" aria-label="Close menu" onClick={() => setMobileMenuOpen(false)}>
            <X size={16} />
          </button>
        </div>

        <section className="panel-section mobile-menu-primary-actions">
          <button type="button" aria-pressed={nightMode} onClick={() => setNightMode((enabled) => !enabled)}>
            {nightMode ? <Sun size={17} /> : <Moon size={17} />}
            <span>{nightMode ? 'Day mode' : 'Night mode'}</span>
          </button>
          {canUseAdmin && (
            <button
              type="button"
              data-admin-toggle
              onClick={() => {
                setMobileMenuOpen(false);
                setMobileAdminOpen(true);
              }}
            >
              <Settings2 size={17} />
              <span>Back stage</span>
            </button>
          )}
        </section>

        <div className="profile-card mobile-profile-card">
          <button type="button" className="profile-identity" aria-expanded={accountMenuOpen} onClick={() => setAccountMenuOpen((open) => !open)}>
            <User size={17} />
            <span>
              <strong>{currentUser.name}</strong>
              <small>{roleLabel(userRole)} profile</small>
            </span>
          </button>
          {accountMenuOpen && <nav className="profile-account-menu" aria-label="User account">
            <a href="/profile"><User size={15} /> Profile</a>
            <a href="/training?app=girih"><GraduationCap size={15} /> Academy</a>
            <a href="/marketplace" aria-label="Marketplace"><Store size={15} /> Market place</a>
            {isAdminUser && <a href="/admin"><BarChart3 size={15} /> User overview</a>}
          </nav>}
          {!isAdminUser && (
            <button
              type="button"
              className="billing-button"
              disabled={billingBusy}
              onClick={() => openBillingFlow(isPaidUser ? '/api/create-portal-session' : '/api/create-checkout-session')}
            >
              {billingBusy ? 'Opening...' : isPaidUser ? 'Billing' : 'Upgrade'}
            </button>
          )}
          <button type="button" onClick={logout}>Log out</button>
        </div>

        {canUseAdvancedTools && (
        <section className="panel-section model-panel">
          <div className="section-title">
            <Upload size={18} />
            <span>Project files</span>
          </div>
          <div className="action-row">
            <button onClick={() => importSceneInputRef.current?.click()}>
              <Upload size={16} /> Import
            </button>
            <button type="button" onClick={() => { setSharedLibraryDialogOpen(true); refreshGirihLibrary(); }}><FolderOpen size={15} /> Library</button>
          </div>
        </section>
        )}

        <section className="panel-section controls-grid">
          <CollapsibleControlGroup
            title="Model Transform"
            collapsed={modelTransformCollapsed}
            onToggle={() => setModelTransformCollapsed((collapsed) => !collapsed)}
          >
            <ModelTransformControls
              modelTransform={modelTransform}
              keepAspectRatio={modelTransformKeepAspect}
              onKeepAspectRatioChange={setModelTransformKeepAspect}
              onChange={updateModelTransform}
              disabled={!selectedPieces.length}
            />
          </CollapsibleControlGroup>
        </section>

        <section className="panel-section controls-grid">
          <label>
            Material
            <select value={material} onChange={(event) => changeMaterial(event.target.value)}>
              <option value="plastic">Plastic</option>
              <option value="glass">Glass</option>
              <option value="paper">Paper</option>
            </select>
          </label>
          {material === 'glass' && <GlassAppearanceControls settings={glassSettings} onChange={setGlassSettings} />}
        </section>

        <section className="panel-section controls-grid">
          <div className="section-title">
            <Palette size={18} />
            <span>View</span>
          </div>
          <div className="export-grid">
            <label className={inactivePaperExportControlClass}>
              Stage BG color
              <input type="color" value={renderBgColor} onChange={(event) => setRenderBgColor(event.target.value)} disabled={isPaperMaterial} />
            </label>
            <label className={inactivePaperExportControlClass}>
              Edge line color
              <input type="color" value={renderEdgeColor} onChange={(event) => setRenderEdgeColor(event.target.value)} disabled={isPaperMaterial} />
            </label>
            <div className="export-checkbox-row">
              <label className={`checkbox-field export-checkbox-field ${inactivePaperExportControlClass || ''}`}>
                <input
                  type="checkbox"
                  checked={liveShadowsEnabled}
                  onChange={(event) => setLiveShadowsEnabled(event.target.checked)}
                  disabled={isPaperMaterial}
                />
                <span>Live shadows</span>
              </label>
              <label className={`checkbox-field export-checkbox-field ${inactivePaperExportControlClass || ''}`}>
                <input
                  type="checkbox"
                  checked={edgeLineEnabled}
                  onChange={(event) => changeEdgeLineEnabled(event.target.checked)}
                  disabled={isPaperMaterial}
                />
                <span>Edge line</span>
              </label>
            </div>
            <div className="export-offset-row">
              <label className={inactivePaperExportControlClass}>
                Offset count
                <input
                  type="number"
                  min="1"
                  max="12"
                  step="1"
                  value={renderEdgeOffsetCount}
                  onChange={(event) => setRenderEdgeOffsetCount(event.target.value)}
                  disabled={isPaperMaterial}
                />
              </label>
              <label className={inactivePaperExportControlClass}>
                Offset distance px
                <input
                  type="number"
                  min="0"
                  max="80"
                  step="0.5"
                  value={renderEdgeOffsetDistance}
                  onChange={(event) => setRenderEdgeOffsetDistance(event.target.value)}
                  disabled={isPaperMaterial}
                />
              </label>
            </div>
          </div>
        </section>

      </aside>

      <main
        className="stage-wrap"
        onPointerDown={() => {
          setMobileAdminOpen(false);
          setTemplatePanelOpen(false);
          setCameraPresetMenuOpen(false);
        }}
      >
        <div className="stage-toolbar">
          <button
            type="button"
            className="stage-info-button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => setItemSummaryOpen(true)}
            title="Open item summary"
          >
            <strong>{completed ? 'Puzzle complete' : 'Build stage'}</strong>
            <span>
              {visibleGroupedPlaced.length} visible, {selectedObjectCount} selected, {groupedObjectCount} groups, {countSnappedPairs(visibleGroupedPlaced)} snapped pairs
            </span>
          </button>
          <div className="stage-tools" onPointerDown={(event) => event.stopPropagation()}>
            <div className="stage-view-controls" aria-label="Stage camera view">
              {STAGE_CAMERA_VIEWS.map((view) => (
                <button
                  key={view.id}
                  type="button"
                  className={stageCamera === view.id ? 'active' : ''}
                  onClick={() => setStageCamera(view.id)}
                  title={`${view.label} viewport`}
                >
                  {view.id === 'top' ? <Grid3X3 size={14} /> : <Box size={14} />}
                  {view.label}
                </button>
              ))}
              <button
                type="button"
                className={`stage-snap-button ${snappingEnabled ? 'active' : ''}`}
                aria-pressed={snappingEnabled}
                title={snappingEnabled ? 'Snapping is on' : 'Snapping is off'}
                onClick={() => setSnappingEnabled((enabled) => !enabled)}
              >
                <Magnet size={14} />
                <span>Snap</span>
              </button>
              <div className="camera-preset-control">
                <button
                  type="button"
                  className={`camera-video-button ${cameraVideoPlaying ? 'active' : ''}`}
                  aria-pressed={cameraVideoPlaying}
                  aria-expanded={cameraPresetMenuOpen}
                  title={cameraVideoPlaying ? 'Stop camera video' : 'Choose camera video preset'}
                  onClick={() => {
                    if (cameraVideoPlaying) {
                      setCameraVideoPlaying(false);
                      setCameraVideoProgress(0);
                      return;
                    }
                    setCameraPresetMenuOpen((open) => !open);
                  }}
                >
                  <span className="camera-video-progress" style={{ width: `${cameraVideoProgress * 100}%` }} />
                  <Play size={14} />
                  <span>Video</span>
                </button>
                {cameraPresetMenuOpen && (
                  <div className="camera-preset-menu" role="menu">
                    {CAMERA_VIDEO_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        className={cameraVideoPreset === preset.id ? 'selected' : ''}
                        role="menuitem"
                        onClick={() => {
                          setCameraVideoPreset(preset.id);
                          setCameraVideoProgress(0);
                          setCameraPresetMenuOpen(false);
                          setCameraVideoPlaying(true);
                        }}
                      >
                        {preset.label}
                      </button>
                    ))}
                    {selectedVideoPreset.type === 'assembly' && (
                      <label className="camera-preset-speed">
                        Speed
                        <span>
                          <input
                            type="number"
                            min="2"
                            max="30"
                            step="1"
                            value={assemblyVideoDurationSec}
                            onChange={(event) => setAssemblyVideoDurationSec(event.target.value)}
                            onClick={(event) => event.stopPropagation()}
                          />
                          sec
                        </span>
                      </label>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="history-controls">
              <button
                type="button"
                className={`night-mode-toggle ${nightMode ? 'active' : ''}`}
                aria-label={nightMode ? 'Switch to day mode' : 'Switch to night mode'}
                aria-pressed={nightMode}
                title={nightMode ? 'Day mode' : 'Night mode'}
                onClick={() => setNightMode((enabled) => !enabled)}
              >
                {nightMode ? <Sun size={16} /> : <Moon size={16} />}
              </button>
              {canUseGrouping && (
              <button
                type="button"
                className="mobile-group-all-button"
                aria-label="Group all stage items"
                title="Group all stage items"
                onClick={groupAllStagePieces}
                disabled={!isMobileViewport || placed.length < 2}
              >
                <Box size={16} />
                <span>Group all</span>
              </button>
              )}
              {canUseAdmin && (
              <button type="button" data-admin-toggle aria-label="Open Back stage" title="Back stage" onClick={() => setMobileAdminOpen(true)}>
                <Settings2 size={16} />
              </button>
              )}
              <button
                type="button"
                className={`mobile-snap-button ${snappingEnabled ? 'active' : ''}`}
                aria-label={snappingEnabled ? 'Turn snapping off' : 'Turn snapping on'}
                aria-pressed={snappingEnabled}
                title={snappingEnabled ? 'Snapping is on' : 'Snapping is off'}
                onClick={() => setSnappingEnabled((enabled) => !enabled)}
              >
                <Magnet size={16} />
              </button>
              <button
                type="button"
                aria-label={isMobileViewport ? 'Clear whole stage' : 'Delete selected items'}
                title={isMobileViewport ? 'Clear whole stage' : 'Delete selected items'}
                onClick={isMobileViewport ? resetScene : deleteSelectedPieces}
                disabled={isMobileViewport ? !placed.length : !selectedPieces.length}
              >
                <Trash2 size={16} />
              </button>
              {canUseAdvancedTools && (
              <button
                type="button"
                aria-label={frameMode ? 'Cancel frame tool' : 'Frame model'}
                title={frameMode ? 'Cancel frame tool' : 'Frame model'}
                className={frameMode ? 'active' : ''}
                onClick={frameMode ? cancelFrameMode : startFrameMode}
                disabled={!visibleGroupedPlaced.length}
              >
                <Frame size={17} />
              </button>
              )}
            </div>
            {frameMode && (
              <div className="selection-chip frame-chip">
                <Box size={16} />
                Frame: {framePointIds.length} points
                <button type="button" onClick={cancelFrameMode}>
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
        <GirihStage
          placed={stagePreviewPlaced}
          selectedId={selectedId}
          selectedIds={selectedIds}
          activeGroupId={activeGroupId}
          material={material}
          glassSettings={glassSettings}
          style={DEFAULT_SCENE_STYLE}
          cameraMode={stageCamera}
          backgroundColor={renderBgColor}
          edgeColor={renderEdgeColor}
          edgeThickness={renderEdgeThickness}
          edgeMode="offset"
          edgeOffsetCount={renderEdgeOffsetCount}
          edgeOffsetDistance={renderEdgeOffsetDistance}
          liveShadowsEnabled={liveShadowsEnabled}
          modelTransform={DEFAULT_MODEL_TRANSFORM}
          mobileViewport={isMobileViewport}
          cameraVideoPlaying={cameraVideoPlaying}
          cameraVideoPreset={cameraVideoPreset}
          cameraVideoDurationMs={selectedVideoDurationMs}
          cameraVideoProgressRef={cameraVideoProgressRef}
          frameMode={frameMode}
          framePoints={framePoints}
          onSelect={selectPlaced}
          onToggleSelect={togglePlacedSelection}
          onFramePick={pickFrameObject}
          onSelectionChange={selectPlacedIds}
          onMove={updatePlaced}
          onSettle={settlePiece}
          onSettleSelection={settleSelectedPieces}
          onRotate={rotatePlaced}
          onContextMenu={setContextMenu}
          onViewBoundsChange={setStageVisibleBounds}
          onCameraChange={setStageCameraSnapshot}
          onCameraVideoProgress={setCameraVideoProgress}
          onCameraVideoEnd={() => {
            setCameraVideoPlaying(false);
            setCameraVideoProgress(0);
          }}
        />
        {!placed.length && (
          <div className="stage-welcome" aria-hidden="true">
            <div className="stage-welcome-mark"><Grid3X3 size={34} /></div>
            <span className="stage-welcome-eyebrow">Geometric pattern design</span>
            <h2>Build a complete Girih pattern.</h2>
            <p>Choose a piece family, place the first tile, then rotate, repeat, and snap pieces into a finished composition.</p>
          </div>
        )}
        {selectedTemplate && !templatePanelOpen && templateStagePreviewVisible && (
          <div className="stage-template-preview" data-template-toggle onPointerDown={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="stage-template-open"
              onClick={() => setTemplatePanelOpen(true)}
              aria-label={`Open ${selectedTemplate.name} template`}
            >
              <img src={selectedTemplate.src} alt="" />
              <span>{selectedTemplate.name}</span>
            </button>
            <button
              type="button"
              className="stage-template-close"
              aria-label="Hide template preview"
              onClick={(event) => {
                event.stopPropagation();
                setTemplateStagePreviewVisible(false);
              }}
            >
              <X size={13} />
            </button>
          </div>
        )}
        {contextMenu && (
          <div
            className="object-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(event) => event.stopPropagation()}
          >
            <strong>{selectedPieces.length > 1 ? `${selectedPieces.length} selected pieces` : groupedPlaced.find((item) => item.id === contextMenu.id)?.name || 'Piece'}</strong>
            <label>
                {selectedPieces.length > 1 ? 'Selection color' : 'Instance color'}
              <input
                type="color"
                value={groupedPlaced.find((item) => item.id === contextMenu.id)?.color || '#1c7c74'}
                onChange={(event) => recolorPlaced(contextMenu.id, event.target.value)}
              />
            </label>
            {canUseAdvancedTools && (
            <>
            <button onClick={() => toggleMirrorPlaced(contextMenu.id, 'vertical')}>
              {selectedPieces.length > 1
                ? 'Mirror selection vertically'
                : groupedPlaced.find((item) => item.id === contextMenu.id)?.mirrorVertical ? 'Unmirror vertically' : 'Mirror vertically'}
            </button>
            <button onClick={() => toggleMirrorPlaced(contextMenu.id, 'horizontal')}>
              {selectedPieces.length > 1
                ? 'Mirror selection horizontally'
                : groupedPlaced.find((item) => item.id === contextMenu.id)?.mirrorHorizontal ? 'Unmirror horizontally' : 'Mirror horizontally'}
            </button>
            </>
            )}
            {canUseGrouping && (
            <>
            <button
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                groupSelectedPieces();
              }}
              disabled={selectedPieces.length < 2 || selectedIsWholeGroup}
            >
              Group selection
            </button>
            <button onClick={ungroupSelectedPieces} disabled={!selectedPieces.some((piece) => piece.groupInstanceId)}>
              Ungroup
            </button>
            </>
            )}
            <button onClick={copySelectedPieces} disabled={!selectedPieces.length}>
              Copy selection
            </button>
            <button onClick={pasteClipboardPieces} disabled={!hasClipboardPieces}>
              Paste
            </button>
            <button onClick={() => (selectedPieces.length > 1 ? deleteSelectedPieces() : deletePlaced(contextMenu.id))}>
              <Trash2 size={15} />
              {selectedPieces.length > 1 ? 'Delete selection' : 'Delete instance'}
            </button>
          </div>
        )}
        {pendingNavigationUrl && (
          <div className="preview-backdrop" onClick={() => setPendingNavigationUrl('')}>
            <div className="preview-dialog unsaved-design-dialog" role="alertdialog" aria-modal="true" aria-labelledby="unsaved-design-title" onClick={(event) => event.stopPropagation()}>
              <div className="preview-header">
                <strong id="unsaved-design-title">Save your design?</strong>
                <button type="button" className="preview-close-button" aria-label="Cancel navigation" onClick={() => setPendingNavigationUrl('')}>
                  <X size={16} />
                </button>
              </div>
              <p>Your stage has changes that are not saved as a model. Save them before leaving Girih App?</p>
              <div className="action-row">
                <button type="button" onClick={() => continuePendingNavigation(true)}>
                  <Save size={16} /> Save model and leave
                </button>
                <button type="button" className="danger-button" onClick={() => continuePendingNavigation(false)}>
                  Leave without saving
                </button>
                <button type="button" className="secondary-button" onClick={() => setPendingNavigationUrl('')}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
        {itemSummaryOpen && (
          <div className="preview-backdrop" onClick={() => setItemSummaryOpen(false)}>
            <div className="preview-dialog item-summary-dialog" onClick={(event) => event.stopPropagation()}>
              <div className="preview-header">
                <strong>Item summary</strong>
                <span>{placed.length} pieces / {itemSummaryItems.length} item types</span>
                <button type="button" className="preview-close-button" aria-label="Close item summary" onClick={() => setItemSummaryOpen(false)}>
                  <X size={16} />
                </button>
              </div>
              <div className="item-summary-list">
                {itemSummaryItems.length ? (
                  itemSummaryItems.map((item) => (
                    <div className="item-summary-row" key={item.key}>
                      <PieceIcon piece={item.piece} filled />
                      <span>{item.name}</span>
                      <strong>{item.count}</strong>
                    </div>
                  ))
                ) : (
                  <div className="item-summary-empty">No items on stage.</div>
                )}
              </div>
              <div className="action-row">
                <button onClick={printItemSummaryList} disabled={!itemSummaryItems.length}>
                  <Printer size={16} /> Print summary
                </button>
                <button className="secondary-button" onClick={() => setItemSummaryOpen(false)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
        {exportDialogOpen && (
          <div className="preview-backdrop" onClick={() => setExportDialogOpen(false)}>
            <div className="preview-dialog export-dialog" onClick={(event) => event.stopPropagation()}>
              <div className="preview-header">
                <strong>Export preview</strong>
                <span>
                  {exportDimensionMode.toUpperCase()} / {contextualExportOptions.find((option) => option.value === exportFormat)?.label || exportFormat}{exportDimensionMode === '2d' ? ` / ${EXPORT_2D_STYLE_OPTIONS.find((option) => option.value === export2DStyle)?.label}` : ''}
                </span>
                <button type="button" className="preview-close-button" aria-label="Close export preview" onClick={() => setExportDialogOpen(false)}>
                  <X size={16} />
                </button>
              </div>
              <div className="export-workspace">
                <div className="export-settings-column">
              <div className="export-dimension-switch" role="group" aria-label="Export dimension">
                <button
                  type="button"
                  className={exportDimensionMode === '2d' ? 'active' : ''}
                  onClick={() => {
                    setExportDimensionMode('2d');
                    setExportFormat('png-flat-color');
                  }}
                >2D</button>
                <button
                  type="button"
                  className={exportDimensionMode === '3d' ? 'active' : ''}
                  onClick={() => {
                    setExportDimensionMode('3d');
                    setExportFormat('png');
                  }}
                >3D</button>
              </div>
              <div className="export-dialog-controls">
                <label>
                  Export format
                  <select value={exportFormat} onChange={(event) => setExportFormat(event.target.value)}>
                    {contextualExportOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                {exportDimensionMode === '2d' && <label>
                  2D graphic style
                  <select value={export2DStyle} onChange={(event) => setExport2DStyle(event.target.value)}>
                    {EXPORT_2D_STYLE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>}
                {exportUsesPageLayout && <label>
                  Paper size
                  <select value={exportPaperSize} onChange={(event) => setExportPaperSize(event.target.value)}>
                    {EXPORT_PAPER_SIZES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>}
                {exportUsesPageLayout && <label>
                  Page orientation
                  <select value={exportOrientation} onChange={(event) => setExportOrientation(event.target.value)}>
                    <option value="landscape">Landscape</option>
                    <option value="portrait">Portrait</option>
                  </select>
                </label>}
                {exportSupportsTransparentBackground && <label className="export-background-toggle">
                  <input
                    type="checkbox"
                    checked={exportTransparentBackground}
                    disabled={!exportSupportsTransparentBackground}
                    onChange={(event) => setExportTransparentBackground(event.target.checked)}
                  />
                  <span>Transparent BG / Stage</span>
                </label>}
                {exportDimensionMode === '3d' && exportFormat === 'mp4' && (
                  <label>
                    Camera preset
                    <select value={cameraVideoPreset} onChange={(event) => setCameraVideoPreset(event.target.value)}>
                      {CAMERA_VIDEO_PRESETS.map((preset) => (
                        <option key={preset.id} value={preset.id}>{preset.label}</option>
                      ))}
                    </select>
                  </label>
                )}
                {exportDimensionMode === '3d' && exportFormat === 'mp4' && selectedVideoPreset.type === 'assembly' && (
                  <label>
                    Assembly duration (sec)
                    <input
                      type="number"
                      min="2"
                      max="30"
                      step="1"
                      value={assemblyVideoDurationSec}
                      onChange={(event) => setAssemblyVideoDurationSec(event.target.value)}
                    />
                  </label>
                )}
              </div>
              <div className="export-view-controls">
                <label>
                  Stage BG
                  <input
                    type="color"
                    value={exportBgColor}
                    disabled={exportPreviewUsesTransparentBackground}
                    onChange={(event) => setExportBgColor(event.target.value)}
                  />
                </label>
                <label>
                  Edge color
                  <input type="color" value={exportEdgeColor} onChange={(event) => setExportEdgeColor(event.target.value)} />
                </label>
                <label className="export-edge-toggle">
                  <input
                    type="checkbox"
                    checked={Number(exportEdgeThickness) > 0}
                    onChange={(event) => setExportEdgeThickness(event.target.checked ? 1 : 0)}
                  />
                  <span>Edge line</span>
                </label>
                <label>
                  Line (px)
                  <input
                    type="number"
                    min="0.25"
                    max="12"
                    step="0.25"
                    value={exportEdgeThickness}
                    disabled={Number(exportEdgeThickness) <= 0}
                    onChange={(event) => setExportEdgeThickness(event.target.value)}
                  />
                </label>
                <label>
                  Offset count
                  <input
                    type="number"
                    min="1"
                    max="8"
                    step="1"
                    value={exportEdgeOffsetCount}
                    disabled={Number(exportEdgeThickness) <= 0}
                    onChange={(event) => setExportEdgeOffsetCount(event.target.value)}
                  />
                </label>
                <label>
                  Offset distance (px)
                  <input
                    type="number"
                    min="0"
                    max="40"
                    step="0.5"
                    value={exportEdgeOffsetDistance}
                    disabled={Number(exportEdgeThickness) <= 0}
                    onChange={(event) => setExportEdgeOffsetDistance(event.target.value)}
                  />
                </label>
              </div>
              {exportDimensionMode === '3d' && (
                <div className="export-3d-context">
                  <label>
                    Material
                    <select value={export3DMaterial} onChange={(event) => setExport3DMaterial(event.target.value)}>
                      <option value="plastic">Plastic</option>
                      <option value="glass">Glass</option>
                    </select>
                  </label>
                  <label>
                    Camera
                    <select value={export3DCamera} onChange={(event) => setExport3DCamera(event.target.value)}>
                      {STAGE_CAMERA_VIEWS.map((view) => <option key={view.id} value={view.id}>{view.label}</option>)}
                    </select>
                  </label>
                  <label className="export-3d-shadow-toggle">
                    <input type="checkbox" checked={export3DShadows} onChange={(event) => setExport3DShadows(event.target.checked)} />
                    <span>Shadow</span>
                  </label>
                </div>
              )}
              {exportDimensionMode === '2d' && export2DStyle !== 'standard' && (
                <div className="export-style-controls">
                  {export2DStyle === 'pencil' && (
                    <>
                      <label>Edge color<input type="color" value={exportEdgeColor} onChange={(event) => setExportEdgeColor(event.target.value)} /></label>
                      <label>Intensity<input type="number" min="10" max="100" step="5" value={exportPencilIntensity} onChange={(event) => setExportPencilIntensity(event.target.value)} /></label>
                    </>
                  )}
                  {export2DStyle === 'paper-cut' && (
                    <>
                      <label>Polygon offset (px)<input type="number" min="0" max="60" step="1" value={exportPaperGap} onChange={(event) => setExportPaperGap(event.target.value)} /></label>
                      <label className="export-background-toggle">
                        <input type="checkbox" checked={exportPaperCutOut} onChange={(event) => setExportPaperCutOut(event.target.checked)} />
                        <span>Cut out</span>
                      </label>
                    </>
                  )}
                  {export2DStyle === 'hatch' && (
                    <>
                      <label>Angle<input type="number" min="-90" max="90" step="1" value={exportHatchAngle} onChange={(event) => setExportHatchAngle(event.target.value)} /></label>
                      <label>Spacing (px)<input type="number" min="3" max="60" step="1" value={exportHatchSpacing} onChange={(event) => setExportHatchSpacing(event.target.value)} /></label>
                      <label>Line (px)<input type="number" min="0.25" max="8" step="0.25" value={exportHatchThickness} onChange={(event) => setExportHatchThickness(event.target.value)} /></label>
                      <label>Outline (px)<input type="number" min="0.25" max="12" step="0.25" value={exportHatchOutline} onChange={(event) => setExportHatchOutline(event.target.value)} /></label>
                    </>
                  )}
                </div>
              )}
                </div>
              <div
                className={`export-preview-frame ${exportPreviewUsesTransparentBackground ? 'transparent-background' : ''}`}
                onWheel={(event) => {
                  if (exportDimensionMode !== '3d') return;
                  event.preventDefault();
                  event.stopPropagation();
                  setExportPreviewZoom((currentZoom) => {
                    const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
                    return clamp(Number((currentZoom * factor).toFixed(2)), 0.5, 3);
                  });
                }}
                onPointerDown={(event) => {
                  if (exportDimensionMode !== '3d' || event.button !== 0) return;
                  event.currentTarget.setPointerCapture(event.pointerId);
                  exportPreviewPanDragRef.current = {
                    pointerId: event.pointerId,
                    x: event.clientX,
                    y: event.clientY,
                  };
                }}
                onPointerMove={(event) => {
                  const drag = exportPreviewPanDragRef.current;
                  if (!drag || drag.pointerId !== event.pointerId) return;
                  const bounds = event.currentTarget.getBoundingClientRect();
                  const deltaX = (event.clientX - drag.x) / Math.max(bounds.width, 1);
                  const deltaY = (event.clientY - drag.y) / Math.max(bounds.height, 1);
                  drag.x = event.clientX;
                  drag.y = event.clientY;
                  setExportPreviewPan((currentPan) => ({
                    x: clamp(currentPan.x + deltaX, -0.75, 0.75),
                    y: clamp(currentPan.y + deltaY, -0.75, 0.75),
                  }));
                }}
                onPointerUp={(event) => {
                  if (exportPreviewPanDragRef.current?.pointerId !== event.pointerId) return;
                  exportPreviewPanDragRef.current = null;
                  event.currentTarget.releasePointerCapture(event.pointerId);
                }}
                onPointerCancel={() => {
                  exportPreviewPanDragRef.current = null;
                }}
                onLostPointerCapture={() => {
                  exportPreviewPanDragRef.current = null;
                }}
                title={exportDimensionMode === '3d' ? 'Scroll to zoom and drag to pan the export framing' : undefined}
              >
                {exportPreview?.imageUrl && <img src={exportPreview.imageUrl} alt="Girih export preview" draggable={false} />}
                {exportDimensionMode === '3d' && (
                  <div className="export-preview-zoom">{Math.round(exportPreviewZoom * 100)}% · Scroll to zoom · Drag to pan</div>
                )}
                {exportPreviewLoading && <div className="export-preview-status">Updating preview...</div>}
                {exportPreviewError && <div className="export-preview-status error">{exportPreviewError}</div>}
              </div>
              </div>
              <div className="action-row">
                <button onClick={async () => {
                  try {
                    await exportScene(exportFormat, { orientation: exportOrientation, paperSize: exportPaperSize });
                  } catch (error) {
                    console.error('Export failed', error);
                    window.alert(error?.message || 'Export failed. Please try again.');
                  }
                }}>
                  <Download size={16} /> Export
                </button>
                <button onClick={printCurrentExport}>
                  <Printer size={16} /> Print
                </button>
                <button className="secondary-button" onClick={() => setExportDialogOpen(false)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {canUseTemplates && <aside className={`template-panel ${templatePanelOpen ? 'open' : ''}`} onPointerDown={(event) => event.stopPropagation()}>
        <div className="section-title">
          <ImageIcon size={18} />
          <span>Template Library</span>
          <button type="button" className="mobile-close-button" aria-label="Close template panel" onClick={() => setTemplatePanelOpen(false)}>
            <X size={16} />
          </button>
        </div>

        <label className="template-group-select">
          Puzzle group
          <select
            value={activeTemplateGroupRecord.name}
            onChange={(event) => {
              setActiveTemplateGroup(event.target.value);
              const group = templateGroups.find((item) => item.name === event.target.value);
              setSelectedTemplateId(group?.items[0]?.id || '');
              setTemplateStagePreviewVisible(true);
            }}
          >
            {templateGroupNames.map((groupName) => (
              <option key={groupName} value={groupName}>
                {groupName}
              </option>
            ))}
          </select>
        </label>

        <div className="template-list">
          {activeTemplateGroupRecord.items.map((template) => (
            <div className={`template-card ${selectedTemplate?.id === template.id ? 'active' : ''}`} key={template.id}>
              <button
                type="button"
                className="template-thumb"
                onClick={() => {
                  setSelectedTemplateId(template.id);
                  setTemplateStagePreviewVisible(true);
                }}
                aria-label={`Open ${template.name} template`}
              >
                <span>{template.name}</span>
              </button>
            </div>
          ))}
        </div>

        {selectedTemplate ? (
          <div className="template-preview">
            <div
              className="template-preview-viewport"
              onPointerDown={startTemplatePreviewPan}
              onPointerMove={panTemplatePreview}
              onPointerUp={endTemplatePreviewPan}
              onPointerCancel={endTemplatePreviewPan}
              onWheel={(event) => {
                event.preventDefault();
                zoomTemplatePreview(event.deltaY < 0 ? 0.2 : -0.2);
              }}
            >
              <img
                src={selectedTemplate.src}
                alt={`${selectedTemplate.name} template`}
                draggable="false"
                style={{
                  transform: `translate(${templatePreviewView.x}px, ${templatePreviewView.y}px) scale(${templatePreviewView.scale})`,
                }}
              />
            </div>
            <div className="template-preview-footer">
              <strong>{selectedTemplate.name}</strong>
              <span>{selectedTemplate.group}</span>
            </div>
          </div>
        ) : (
          <div className="template-empty">No templates assigned to this group yet.</div>
        )}
      </aside>}

      {canUseAdmin && (
      <aside className={`admin-panel ${mobileAdminOpen ? 'open' : ''}`} onPointerDown={(event) => event.stopPropagation()}>
        <div className="section-title">
          <Settings2 size={18} />
          <span>Back stage</span>
          <button type="button" className="mobile-close-button" aria-label="Close Back stage" onClick={() => setMobileAdminOpen(false)}>
            <X size={16} />
          </button>
        </div>

        <div className="admin-list">
          {adminPieceGroups.map((group) => {
            const collapsed = collapsedAdminGroups.has(group.name);
            const groupName = normalizePieceGroupName(group.name);
            const paletteCollapsed = collapsedPaletteGroups.has(groupName);
            const savedPalettes = groupColorPalettes[groupName] || [];
            const palettes = buildGroupColorPalettes(group, savedPalettes);
            const canSavePalette = group.items.length > 0 && savedPalettes.length < 5;
            return (
              <div className="admin-group" key={group.name}>
                <div className="admin-group-header">
                  <button type="button" className="admin-group-toggle" onClick={() => toggleAdminGroup(group.name)}>
                    <span>{group.name}</span>
                    <small>{group.items.length}</small>
                    <span aria-hidden="true">{collapsed ? '+' : '-'}</span>
                  </button>
                </div>
                {!collapsed && (
                  <div className="admin-group-items">
                    <div className="admin-group-edit-row">
                      <button type="button" onClick={() => resetAdminGroupSizes(group)}>
                        Reset size
                      </button>
                      <label>
                        Group height
                        <input
                          type="number"
                          min="0.001"
                          max="20"
                          step="0.001"
                          value={adminGroupHeightInputs[groupName] ?? ''}
                          placeholder="Height"
                          onChange={(event) => setAdminGroupHeight(group, event.target.value)}
                        />
                      </label>
                    </div>
                    <div className="admin-palette-panel">
                      <div className="admin-palette-header">
                        <button type="button" className="admin-palette-toggle" onClick={() => togglePaletteGroup(groupName)}>
                          <span>Pallet</span>
                          <small>{palettes.length}/6</small>
                          <span aria-hidden="true">{paletteCollapsed ? '+' : '-'}</span>
                        </button>
                        <button
                          type="button"
                          className="admin-palette-button"
                          title={canSavePalette ? `Save ${group.name} color palette` : 'Maximum 6 palettes saved'}
                          disabled={!canSavePalette}
                          onClick={() => saveGroupColorPalette(group)}
                        >
                          <Palette size={14} />
                          Save
                        </button>
                      </div>
                      {!paletteCollapsed && (
                        <GroupPaletteList
                          group={group}
                          palettes={palettes}
                          selectedPaletteId={selectedGroupPalettes[groupName]}
                          onSelect={(paletteId) => {
                            setSelectedGroupPalettes((current) => ({ ...current, [groupName]: paletteId }));
                            applyGroupColorPalette(group, paletteId);
                          }}
                          onDelete={(paletteId) => deleteGroupColorPalette(groupName, paletteId)}
                        />
                      )}
                    </div>
                    {group.items.map((piece) => {
                      const instances = groupedPlaced.filter((item) => item.sourceId === piece.id);
                      const hasInstances = instances.length > 0;
                      const isHidden = hasInstances && instances.every((item) => item.hidden);
                      return (
                        <div className="admin-piece" key={piece.id}>
                          <div className="admin-row" title={piece.name}>
                            <button
                              type="button"
                              className={`admin-piece-preview-toggle ${isHidden ? 'hidden-instances' : ''}`}
                              aria-label={`${isHidden ? 'Show' : 'Hide'} ${piece.name} instances`}
                              title={hasInstances ? `${isHidden ? 'Show' : 'Hide'} stage instances` : 'No stage instances'}
                              onClick={(event) => {
                                event.stopPropagation();
                                togglePieceInstancesHidden(piece);
                              }}
                              disabled={!hasInstances}
                            >
                              <PieceIcon piece={piece} />
                              {isHidden && <EyeOff className="admin-piece-hidden-mark" size={13} />}
                            </button>
                            <input
                              className="admin-color-input"
                              type="color"
                              value={piece.color}
                              aria-label={`Change ${piece.name} color`}
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) => updatePieceColor(piece, event.target.value)}
                            />
                            <button
                              type="button"
                              className={`admin-offset-line-toggle ${piece.offsetLinesEnabled !== false ? 'active' : ''}`}
                              aria-pressed={piece.offsetLinesEnabled !== false}
                              aria-label={`${piece.offsetLinesEnabled !== false ? 'Hide' : 'Show'} ${piece.name} offset lines`}
                              title={`${piece.offsetLinesEnabled !== false ? 'Hide' : 'Show'} offset lines on all ${piece.name} instances`}
                              onClick={(event) => {
                                event.stopPropagation();
                                togglePieceOffsetLines(piece);
                              }}
                            >
                              <Layers3 size={15} />
                            </button>
                            <button
                              type="button"
                              className={`admin-surface-sticker-toggle ${surfaceEditorPieceId === piece.id ? 'active' : ''} ${hasSurfaceStickerContent(piece.surfaceSticker) ? 'has-sticker' : ''}`}
                              aria-pressed={surfaceEditorPieceId === piece.id}
                              aria-label={`Edit ${piece.name} surface sticker`}
                              title="Edit surface sticker"
                              onClick={(event) => {
                                event.stopPropagation();
                                openPieceSurfaceEditor(piece);
                              }}
                            >
                              <ImageIcon size={15} />
                            </button>
                            <input
                              className="admin-height-input"
                              type="number"
                              min="0.01"
                              step="0.001"
                              value={formatDimensionValue(piece.height)}
                              aria-label={`Change ${piece.name} stage height`}
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) => updatePieceHeight(piece, event.target.value)}
                            />
                            <span>{piece.name}</span>
                          </div>
                          {surfaceEditorPieceId === piece.id && (
                            <PieceSurfaceStickerEditor
                              piece={piece}
                              value={surfaceStickerDraft}
                              onChange={setSurfaceStickerDraft}
                              onSave={() => savePieceSurfaceSticker(piece)}
                              onCancel={() => {
                                setSurfaceEditorPieceId(null);
                                setSurfaceStickerDraft(normalizeSurfaceSticker());
                              }}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </aside>
      )}
    </div>
  );
}

const LANDING_RESULTS = [
  { src: '/landing/exports/framed-3d.png', alt: 'Framed Girih composition with depth and shadows', caption: 'Framed 3D', layout: 'hero' },
  { src: '/landing/exports/star-flat-color.png', alt: 'Eight-point star flat-color export', caption: '2D color', layout: 'tall' },
  { src: '/landing/exports/tessellated-3d.png', alt: 'Dense tessellated 3D Girih pattern', caption: 'Tessellated 3D', layout: 'square' },
  { src: '/landing/exports/blue-rosette.png', alt: 'Blue rosette top-view export', caption: 'Top-view rosette', layout: 'square' },
  { src: '/landing/exports/persian-grid.png', alt: 'Red, white, and gray Persian Girih pattern field', caption: 'Pattern field', layout: 'square' },
];

const LANDING_FEATURE_GROUPS = [
  {
    title: 'Four puzzle sets', icon: Layers3,
    image: '/landing/features/four-puzzle-sets.png',
    alt: 'Four geometric pattern examples representing the four Girih puzzle sets',
    summary: 'Build with the complete 10 Kond, 10 Tond, 8 Morocco, and 8 Persian shape families.',
  },
  {
    title: 'Pattern templates', icon: ImageIcon,
    image: '/templates/girih/GIRIH0072.jpg',
    alt: 'Golden Girih pattern template with its construction highlighted',
    summary: 'Open curated template collections beside the stage, then zoom and pan while recreating a pattern.',
  },
  {
    title: 'Piece snapping', icon: Magnet,
    image: '/landing/features/piece-snapping.png',
    alt: 'Separate puzzle pieces approaching a central star to demonstrate snapping',
    summary: 'Align neighboring edges automatically for precise, connected geometric construction.',
  },
  {
    title: 'Reusable motifs', icon: Save,
    image: '/landing/features/reusable-motif.png',
    alt: 'A complete saved Girih motif on a dark red background',
    summary: 'Save any selected arrangement as a motif while preserving its pieces, colors, and transforms.',
  },
  {
    title: 'Tessellation', icon: Grid3X3,
    image: '/landing/features/tessellation.png',
    alt: 'A saved motif repeated four times as a tessellation',
    summary: 'Repeat a saved motif across adjustable rows and columns with independent horizontal and vertical gaps.',
  },
  {
    title: 'Frame & crop', icon: Frame,
    image: '/landing/features/frame-crop.png',
    alt: 'A repeating pattern cropped into a pointed geometric frame',
    summary: 'Draw a closed polygon through the composition, slice crossing pieces, and retain the framed interior.',
  },
  {
    title: 'Export PNG & production files', icon: Download,
    image: '/landing/features/export-png.png',
    alt: 'Transparent PNG export of a Girih composition',
    summary: 'Export images, vectors, print documents, DXF for laser/CNC, and STL or OBJ for 3D fabrication.',
  },
];

function LegacyLandingPage() {
  const [selectedLandingResult, setSelectedLandingResult] = useState(null);
  const [landingUser, setLandingUser] = useState(null);
  const [recentMarketplaceListings, setRecentMarketplaceListings] = useState([]);
  const [marketplacePreviewStatus, setMarketplacePreviewStatus] = useState('loading');

  useEffect(() => {
    if (!supabase) return undefined;

    let active = true;
    const syncLandingUser = async (session) => {
      if (!active) return;
      if (!session?.user) {
        setLandingUser(null);
        return;
      }
      const user = await loadAuthenticatedUser(session.user).catch(() => ({
        name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'Girih user',
      }));
      if (active) setLandingUser(user);
    };

    supabase.auth.getSession().then(({ data }) => syncLandingUser(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(() => syncLandingUser(session), 0);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!selectedLandingResult) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setSelectedLandingResult(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedLandingResult]);

  useEffect(() => {
    let active = true;
    marketplaceRequest('/api/marketplace-listings?limit=5')
      .then((payload) => {
        if (!active) return;
        setRecentMarketplaceListings((payload.listings || []).slice(0, 5));
        setMarketplacePreviewStatus('ready');
      })
      .catch(() => {
        if (active) setMarketplacePreviewStatus('error');
      });
    return () => { active = false; };
  }, []);

  return (
    <div className="landing-page">
      <header className="landing-nav">
        <a className="landing-brand" href="/" aria-label="Girih Studio home">
          <img className="landing-brand-logo" src="/landing/brand/girih-logo-color.png" alt="" aria-hidden="true" />
          <span>Girih Studio</span>
        </a>
        <nav aria-label="Main navigation">
          <a className="landing-image-nav-button" href="#apps">
            <img src="/landing/ui/nav-button.png" alt="" aria-hidden="true" />
            <span>Apps</span>
          </a>
          <a className="landing-image-nav-button" href="#features">
            <img src="/landing/ui/nav-button.png" alt="" aria-hidden="true" />
            <span>Features</span>
          </a>
          <a className="landing-image-nav-button" href="#results">
            <img src="/landing/ui/nav-button.png" alt="" aria-hidden="true" />
            <span>Gallery</span>
          </a>
          <a className="landing-image-nav-button" href="#support">
            <img src="/landing/ui/nav-button.png" alt="" aria-hidden="true" />
            <span>Support</span>
          </a>
        </nav>
        <div className="landing-nav-account">
          {landingUser && <span className="landing-user-greeting">Hello {landingUser.name}</span>}
          <girih-app-switcher current-app="girih" compact></girih-app-switcher>
          <a className="marketplace-icon-link" href="/marketplace" aria-label="Marketplace" title="Marketplace"><Store size={20} /></a>
        </div>
      </header>

      <main>
        <section className="landing-hero">
          <video className="landing-hero-video" autoPlay muted loop playsInline preload="metadata" aria-label="Girih Studio pattern design showcase">
            <source src="/landing/hero/girih-studio.mp4" type="video/mp4" />
          </video>
          <div className="landing-hero-shade" />
          <div className="landing-hero-content">
            <p className="landing-eyebrow">Geometric pattern workspace</p>
            <div className="landing-hero-title-row">
              <h1>Girih Studio</h1>
              <a className="landing-primary-action landing-hero-start" href="/app?mode=signup">Start creating <ArrowRight size={15} /></a>
            </div>
            <p>Compose historic geometric systems with a modern spatial editor. Build, group, frame, tessellate, and prepare patterns for print or fabrication.</p>
          </div>
        </section>

        <section className="landing-section landing-apps" id="apps">
          <div className="landing-section-heading">
            <p className="landing-eyebrow">Our apps</p>
            <h2>One studio family, different ways to build.</h2>
            <p>Move between focused design tools while keeping the same Girih Studio visual language and a clear path back home.</p>
          </div>
          <div className="landing-app-grid">
            {GIRIH_APPS.map((app, index) => (
              <article className={`landing-app-card landing-app-${app.id}`} key={app.id}>
                <div className="landing-app-visual" aria-hidden="true">
                  <span>{app.id === 'bricks' ? <Grid3X3 size={44} strokeWidth={1.4} /> : app.id === 'muqarnas' ? <Layers3 size={44} strokeWidth={1.4} /> : <Box size={44} strokeWidth={1.4} />}</span>
                  <i>{String(index + 1).padStart(2, '0')}</i>
                </div>
                <div className="landing-app-copy">
                  <div className="landing-app-meta"><span>{app.category}</span><span>{app.access}</span></div>
                  <h3>{app.name}</h3>
                  <p>{app.description}</p>
                  {app.status === 'coming-soon'
                    ? <span className="landing-app-coming-soon">Coming soon</span>
                    : <a href={app.url}>Open {app.shortName} <ArrowRight size={16} /></a>}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-section landing-features" id="features">
          <span className="landing-boundary-motif landing-boundary-motif-right landing-boundary-motif-middle landing-boundary-motif-back" aria-hidden="true">
            <img src="/landing/motifs/boundary-yellow.png" alt="" />
          </span>
          <div className="landing-section-heading">
            <p className="landing-eyebrow">The complete workspace</p>
            <h2>Essential tools for building repeatable geometry.</h2>
            <p>Seven focused capabilities take a pattern from its first pieces to a reusable, framed, and fabrication-ready design.</p>
          </div>
          <div className="landing-feature-groups">
            {LANDING_FEATURE_GROUPS.map((group, index) => {
              const FeatureIcon = group.icon;
              return (
                <article className="landing-feature-group" key={group.title} style={{ gridColumn: index + 1 }}>
                  <div className="landing-feature-card">
                    <div className="landing-feature-visual">
                      <img src={group.image} alt={group.alt} />
                    </div>
                    <div className="landing-feature-copy">
                      <div className="landing-feature-title">
                        <h3>{group.title}</h3>
                      </div>
                      <p>{group.summary}</p>
                    </div>
                  </div>
                  <span className="landing-feature-connector" aria-hidden="true">
                    <b>{index + 1}</b>
                    <i><FeatureIcon size={22} strokeWidth={1.5} /></i>
                  </span>
                </article>
              );
            })}
          </div>
        </section>

        <section className="landing-results" id="results">
          <div className="landing-results-copy">
            <p className="landing-eyebrow">Built in the studio</p>
            <h2>One system, many visual languages</h2>
            <p>Move from a small construction rule to dense fields, framed compositions, and color studies without leaving the same workspace.</p>
            <a href="/app">Explore the editor <ArrowRight size={16} /></a>
          </div>
          <div className="landing-result-gallery">
            {LANDING_RESULTS.map((result) => (
              <figure key={result.src} className={`mosaic-${result.layout}`}>
                <button type="button" onClick={() => setSelectedLandingResult(result)} aria-label={`Enlarge ${result.caption}`}>
                  <img src={result.src} alt={result.alt} />
                </button>
                <figcaption>{result.caption}</figcaption>
              </figure>
            ))}
          </div>
        </section>

        {selectedLandingResult && (
          <div
            className="landing-lightbox"
            role="dialog"
            aria-modal="true"
            aria-label={selectedLandingResult.caption}
            onPointerDown={(event) => {
              if (event.target === event.currentTarget) setSelectedLandingResult(null);
            }}
          >
            <div className="landing-lightbox-content">
              <button type="button" className="landing-lightbox-close" aria-label="Close image" onClick={() => setSelectedLandingResult(null)}>
                <X size={20} />
              </button>
              <img src={selectedLandingResult.src} alt={selectedLandingResult.alt} />
              <p>{selectedLandingResult.caption}</p>
            </div>
          </div>
        )}

        <section className="landing-section landing-variations">
          <span className="landing-boundary-motif landing-boundary-motif-left" aria-hidden="true">
            <img src="/landing/motifs/boundary-blue.png" alt="" />
          </span>
          <div className="landing-section-heading">
            <p className="landing-eyebrow">One design, different results</p>
            <h2>Change the material, palette, edge, and background.</h2>
            <p>The same construction can become a dimensional study or a crisp color composition without rebuilding the geometry.</p>
          </div>
          <div className="landing-variation-grid">
            <figure>
              <img src="/landing/exports/variation-a-shadow.png" alt="Blue and yellow pattern exported with dimensional shadows" />
              <figcaption>Dimensional export</figcaption>
            </figure>
            <figure>
              <img src="/landing/exports/variation-a-color.png" alt="The same blue pattern exported in a light color treatment" />
              <figcaption>Color variation</figcaption>
            </figure>
            <figure>
              <img src="/landing/exports/variation-b-warm.png" alt="Girih composition in a warm orange palette" />
              <figcaption>Warm palette</figcaption>
            </figure>
            <figure>
              <img src="/landing/exports/variation-b-cool.png" alt="The same Girih composition in a cool green palette" />
              <figcaption>Cool palette</figcaption>
            </figure>
          </div>
        </section>

        <section className="landing-section landing-marketplace-showcase" id="marketplace">
          <div className="landing-marketplace-heading">
            <div className="landing-section-heading">
              <p className="landing-eyebrow">Newest community patterns</p>
              <h2>Market place</h2>
              <p>Discover the five most recently published patterns, meet their makers, and add editable designs to your own studio.</p>
            </div>
            <a className="landing-marketplace-browse" href="/marketplace">
              <Store size={17} /> Browse all patterns <ArrowRight size={16} />
            </a>
          </div>
          <div className="landing-marketplace-grid">
            {marketplacePreviewStatus === 'loading' && (
              <div className="landing-marketplace-message">Loading the newest community patterns...</div>
            )}
            {marketplacePreviewStatus === 'error' && (
              <div className="landing-marketplace-message">
                The latest patterns could not be loaded here. <a href="/marketplace">Open the market place</a> to browse the catalog.
              </div>
            )}
            {marketplacePreviewStatus === 'ready' && !recentMarketplaceListings.length && (
              <div className="landing-marketplace-message">
                New community patterns will appear here as they are published. <a href="/marketplace">Visit the market place</a>.
              </div>
            )}
            {recentMarketplaceListings.map((listing) => (
              <MarketplaceCard
                key={listing.id}
                listing={listing}
                listingHref={`/marketplace?listing=${encodeURIComponent(listing.id)}`}
              />
            ))}
          </div>
        </section>

        <section className="landing-section landing-heritage" id="heritage">
          <div className="landing-section-heading">
            <p className="landing-eyebrow">A living geometric heritage</p>
            <h2>Patterns that carry construction knowledge</h2>
          </div>
          <div className="landing-history-grid">
            <figure className="landing-history-primary">
              <img src="/landing/darb-imam-spandrel.jpg" alt="Girih tile subdivision on the Darb-e Imam shrine spandrel in Isfahan" />
              <figcaption>
                <strong>Darb-e Imam, Isfahan</strong>
                <span>A 1453 spandrel where large decagonal Girih structures subdivide into a finer geometric field.</span>
              </figcaption>
            </figure>
            <figure>
              <img src="/landing/friday-mosque-isfahan.jpg" alt="Courtyard view through an iwan at the Friday Mosque of Isfahan" />
              <figcaption>
                <strong>Friday Mosque, Isfahan</strong>
                <span>Seljuk spatial form and later Safavid tile surfaces show geometry operating across architecture and ornament.</span>
              </figcaption>
            </figure>
          </div>
        </section>

        <section className="landing-modern" id="today">
          <img src="/landing/masjid-negara-facade.jpg" alt="Modern geometric screen across the facade of Malaysia's National Mosque" />
          <div className="landing-modern-copy">
            <p className="landing-eyebrow">Geometry in contemporary practice</p>
            <h2>From carved surfaces to performative screens</h2>
            <p>Today, geometric systems move through facades, shading screens, interiors, furniture, graphics, and digital fabrication. Girih Studio helps translate a visual tradition into editable geometry for contemporary work.</p>
          </div>
        </section>

        <section className="landing-section landing-school landing-support-preview" id="support">
          <div className="landing-section-heading">
            <p className="landing-eyebrow">Girih Studio Support</p>
            <h2>Answers for the workflows you use most.</h2>
            <p>Start with these practical guides, or open the complete article library for every design and export tool.</p>
          </div>
          <div className="landing-school-grid">
            <article>
              <Grid3X3 size={30} strokeWidth={1.5} />
              <span>01</span>
              <h3>Make your first pattern</h3>
              <p>Choose a puzzle set, place pieces, snap matching edges, navigate the stage, and build outward from a central shape.</p>
              <a href="/support#article-make-your-first-girih-pattern">Read article <ArrowRight size={15} /></a>
            </article>
            <article>
              <Palette size={30} strokeWidth={1.5} />
              <span>02</span>
              <h3>Edit colors and palettes</h3>
              <p>Change individual piece colors, establish a consistent palette, and preserve those choices in saved compositions.</p>
              <a href="/support#article-edit-pattern-colors">Read article <ArrowRight size={15} /></a>
            </article>
            <article>
              <Download size={30} strokeWidth={1.5} />
              <span>03</span>
              <h3>Export and fabricate</h3>
              <p>Prepare 2D artwork, transparent images, print layouts, CNC paths, 3D models, and camera video for real projects.</p>
              <a href="/support#article-export-a-clean-2d-design">Read article <ArrowRight size={15} /></a>
            </article>
          </div>
          <div className="landing-support-more">
            <a className="landing-primary-action" href="/support">More articles <ArrowRight size={17} /></a>
          </div>
        </section>

        <section className="landing-final-cta">
          <div>
            <p className="landing-eyebrow">Begin with a single piece</p>
            <h2>Build the pattern you have in mind.</h2>
          </div>
          <a className="landing-primary-action" href="/app?mode=signup">Create a free account <ArrowRight size={17} /></a>
        </section>
      </main>

      <footer className="landing-footer">
        <span className="landing-boundary-motif landing-footer-motif" aria-hidden="true">
          <img src="/landing/motifs/boundary-teal.png" alt="" />
        </span>
        <div className="landing-footer-brand">
          <img src="/landing/brand/girih-logo-color.png" alt="Girih Studio" />
        </div>
        <p>Digital tools for geometric composition.</p>
        <nav className="landing-footer-links" aria-label="Footer navigation">
          <a href="/marketplace">Marketplace</a>
          <a href="/contact">Contact</a>
        </nav>
        <p className="landing-credits">
          Images: <a href="https://commons.wikimedia.org/wiki/File:Darb-i_Imam_shrine_spandrel.JPG">Darb-e Imam, public domain</a>;{' '}
          <a href="https://commons.wikimedia.org/wiki/File:Friday_mosque_isfahan.jpg">Friday Mosque by seier+seier, CC BY 2.0</a>;{' '}
          <a href="https://commons.wikimedia.org/wiki/File:Masjid_Negara_and_Islamic_geometric_patters_adorning_its_fa%C3%A7ade_(18789992358).jpg">Masjid Negara by Jorge Láscar, CC BY 2.0</a>.
        </p>
      </footer>
    </div>
  );
}

function LandingPage() {
  const [landingUser, setLandingUser] = useState(null);
  const academy = GIRIH_APPS.find((app) => app.id === 'academy');
  const mehraz = GIRIH_APPS.find((app) => app.id === 'mehraz');
  const specialistApps = ['muqarnas', 'girih', 'bricks'].map((id) => GIRIH_APPS.find((app) => app.id === id)).filter(Boolean);
  const details = {
    muqarnas: { number: '01', output: 'Muqarnas assemblies', image: '/landing/apps/muqarnas.jpg', alt: 'Historic iwan with layered Muqarnas geometry', icon: Layers3 },
    girih: { number: '02', output: 'Girih patterns', image: '/landing/apps/girih-v2.jpg', alt: 'Colorful historic Girih tile patterns across an architectural facade', icon: Grid3X3 },
    bricks: { number: '03', output: 'Brick bonds', image: '/landing/apps/bricks.webp', alt: 'Historic brick facade with ornamental bond patterns', icon: Frame },
  };

  useEffect(() => {
    if (!supabase) return undefined;
    let active = true;
    const syncUser = async (session) => {
      if (!active) return;
      if (!session?.user) return setLandingUser(null);
      const user = await loadAuthenticatedUser(session.user).catch(() => ({
        name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'Girih user',
      }));
      if (active) setLandingUser(user);
    };
    supabase.auth.getSession().then(({ data }) => syncUser(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => window.setTimeout(() => syncUser(session), 0));
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);

  return <div className="landing-page suite-page">
    <header className="suite-nav girih-product-header girih-theme-girih">
      <a className="landing-brand suite-brand" href="/" aria-label="Girih Studio home">
        <img className="landing-brand-logo" src="/landing/brand/girih-logo-color.png" alt="" />
        <span>Girih Studio</span>
      </a>
      <nav className="suite-nav-links" aria-label="Main navigation">
        <a href="#academy">Academy</a><a href="#specialist-apps">Apps</a><a href="#mehraz">Mehraz</a><a href="#shared-library">Shared library</a>
      </nav>
      <div className="suite-nav-actions">
        <girih-app-switcher current-app="girih" compact></girih-app-switcher>
        <a className="suite-account-link" href={landingUser ? '/profile' : '/app?mode=login'}><User size={16} />{landingUser ? landingUser.name : 'Sign in'}</a>
        <a className="suite-nav-primary" href="/training"><GraduationCap size={17} />Academy</a>
      </div>
    </header>

    <main>
      <section className="suite-hero">
        <video className="suite-hero-video" autoPlay muted loop playsInline preload="metadata" aria-label="Girih Studio design workspace showcase"><source src="/landing/hero/girih-studio.mp4" type="video/mp4" /></video>
        <div className="suite-hero-shade" />
        <div className="suite-hero-content">
          <p className="suite-kicker">Learn · design · save · assemble</p>
          <h1>Girih Studio</h1>
          <p>A connected studio for architectural geometry. Learn every method in Academy, create specialist components in Muqarnas, Girih, and Bricks, then bring them together in Mehraz.</p>
          <div className="suite-hero-actions">
            <a className="suite-button suite-button-primary" href="/training"><GraduationCap size={18} />Start with Academy</a>
            <a className="suite-button suite-button-ghost" href="#specialist-apps">Explore the apps <ArrowRight size={17} /></a>
          </div>
          <div className="suite-hero-system"><span>Academy</span><i /><span>3 specialist apps</span><i /><span>Shared library</span><i /><span>Mehraz</span></div>
        </div>
      </section>

      <section className="suite-academy" id="academy">
        <div className="suite-section-heading suite-academy-heading">
          <p className="suite-kicker">Begin here</p>
          <h2>Academy sits above the complete studio.</h2>
          <p>Students follow structured lessons for every app, complete a practical model, and submit it for review. Teachers build curriculum, assign modules, and track progress from one workspace.</p>
          <div className="suite-inline-actions"><a className="suite-button suite-button-dark" href={academy?.url || '/training'}>Open Academy <ArrowRight size={17} /></a><a className="suite-text-link" href="/training">View training modules</a></div>
        </div>
        <div className="suite-academy-preview">
          <div className="suite-preview-toolbar"><span><GraduationCap size={17} />Academy</span><div><b>Class</b><b className="active">Curriculum</b></div></div>
          <div className="suite-preview-body">
            <div className="suite-preview-title"><span>Teacher curriculum</span><strong>Training modules</strong><button type="button"><Plus size={14} />New module</button></div>
            {specialistApps.map((app, index) => {
              const Icon = details[app.id].icon;
              return <div className="suite-preview-module" key={app.id}><span><Icon size={17} /></span><div><strong>{app.shortName} foundations</strong><small>{index + 4} lessons · Practical assessment</small></div><i>{index === 1 ? 'Draft' : 'Published'}</i></div>;
            })}
            <div className="suite-preview-progress"><span>Student progress</span><b>12 / 16 lessons completed</b><i><em /></i></div>
          </div>
        </div>
      </section>

      <section className="suite-specialists" id="specialist-apps">
        <header className="suite-section-heading"><p className="suite-kicker">Specialist creation tools</p><h2>Three apps create the components.</h2><p>Each focused workspace solves one design problem and saves a reusable, versioned result to the same library.</p></header>
        <div className="suite-specialist-grid">
          {specialistApps.map((app) => {
            const detail = details[app.id]; const Icon = detail.icon;
            return <article className={`suite-app suite-app-${app.id}`} key={app.id}>
              <div className="suite-app-visual"><img src={detail.image} alt={detail.alt} /><span>{detail.number}</span></div>
              <div className="suite-app-copy"><div className="suite-app-label"><girih-app-icon app={app.id} small></girih-app-icon><span>{app.category}</span></div><h3>{app.shortName}</h3><p>{app.description}</p><dl><dt>Saves to library</dt><dd>{detail.output}</dd></dl><div><small>{app.access}</small><a href={app.url}>Open app <ArrowRight size={16} /></a></div></div>
            </article>;
          })}
        </div>
      </section>

      <section className="suite-library" id="shared-library">
        <header><p className="suite-kicker">The connection between every app</p><h2>Create once. Use across the studio.</h2><p>The shared library keeps ownership, versions, previews, and production files together. Mehraz references the exact saved component, so an architectural project never changes unexpectedly.</p></header>
        <div className="suite-library-flow">
          <div className="suite-library-sources">{specialistApps.map((app) => <span key={app.id}><girih-app-icon app={app.id} small></girih-app-icon><b>{app.shortName}</b><small>{details[app.id].output}</small></span>)}</div>
          <div className="suite-flow-arrow"><ArrowRight size={22} /></div>
          <div className="suite-library-core"><FolderOpen size={30} /><strong>Shared library</strong><span>Private · versioned · reusable</span></div>
          <div className="suite-flow-arrow"><ArrowRight size={22} /></div>
          <div className="suite-library-destination"><girih-app-icon app="mehraz"></girih-app-icon><strong>Mehraz</strong><span>Architectural composition</span></div>
        </div>
      </section>

      <section className="suite-mehraz" id="mehraz">
        <img src="/landing/apps/mehraz.jpg" alt="Historic architectural composition centered on a monumental iwan" /><div className="suite-mehraz-shade" />
        <div className="suite-mehraz-content"><p className="suite-kicker">The inclusive workspace</p><h2>Mehraz brings every component into the architecture.</h2><p>Build an iwan or interior shell, browse your saved Girih patterns, brick bonds, and Muqarnas assemblies, then place exact versions into one coordinated project.</p><div className="suite-mehraz-assets"><span><girih-app-icon app="girih" small></girih-app-icon>Girih patterns</span><span><girih-app-icon app="bricks" small></girih-app-icon>Brick bonds</span><span><girih-app-icon app="muqarnas" small></girih-app-icon>Muqarnas assemblies</span></div><a className="suite-button suite-button-light" href={mehraz?.url || 'https://mehraz.girihstudio.com'}>Open Mehraz <ArrowRight size={17} /></a></div>
      </section>

      <section className="suite-access">
        <header className="suite-section-heading"><p className="suite-kicker">One Girih Studio account</p><h2>One sign-in opens the complete system.</h2><p>Your identity, Academy role, progress, and shared library follow you between apps.</p></header>
        <div className="suite-access-table"><div className="suite-access-row suite-access-head"><span>Product</span><span>Purpose</span><span>Current access</span><span /></div>{[academy, ...specialistApps, mehraz].filter(Boolean).map((app) => <div className={`suite-access-row is-${app.id}`} key={app.id}><span><b>{app.shortName}</b></span><span>{app.category}</span><span>{app.access}</span><a href={app.url}>Open <ArrowRight size={15} /></a></div>)}</div>
      </section>

      <section className="suite-final"><div><p className="suite-kicker">Your path through the studio</p><h2>Learn the method. Create the component. Assemble the architecture.</h2></div><div className="suite-final-actions"><a className="suite-button suite-button-primary" href="/training"><GraduationCap size={18} />Enter Academy</a><a className="suite-button suite-button-outline" href={landingUser ? '/profile' : '/app?mode=signup'}>{landingUser ? 'Open my profile' : 'Create one account'} <ArrowRight size={17} /></a></div></section>
    </main>

    <footer className="suite-footer">
      <div className="suite-footer-brand"><img src="/landing/brand/girih-logo-color.png" alt="" /><div><strong>Girih Studio</strong><span>Digital tools for architectural geometry.</span></div></div>
      <nav aria-label="Footer navigation"><a href="/training">Academy</a><a href="#specialist-apps">Apps</a><a href="/marketplace">Library marketplace</a><a href="/support">Support</a><a href="/contact">Contact</a></nav>
      <span>Academy · Muqarnas · Girih · Bricks · Mehraz</span>
    </footer>
  </div>;
}

function normalizeGlassSettings(settings = {}) {
  const source = settings || {};
  const setting = (key) => Number.isFinite(Number(source[key])) ? Number(source[key]) : DEFAULT_GLASS_SETTINGS[key];
  return {
    transparency: clamp(setting('transparency'), 0.55, 0.98),
    thickness: clamp(setting('thickness'), 0.03, 0.08),
    reflection: clamp(setting('reflection'), 0, 1),
    highlight: clamp(setting('highlight'), 0, 1),
    edgeDarkness: clamp(setting('edgeDarkness'), 0, 1),
    shadow: clamp(setting('shadow'), 0, 1),
    frosted: clamp(setting('frosted'), 0, 1),
    glossiness: clamp(setting('glossiness'), 0, 1),
  };
}

function readGlassSettings() {
  try {
    return normalizeGlassSettings(JSON.parse(localStorage.getItem(GLASS_SETTINGS_STORAGE_KEY)));
  } catch {
    return { ...DEFAULT_GLASS_SETTINGS };
  }
}

function glassSettingsSignature(settings) {
  const normalized = normalizeGlassSettings(settings);
  return Object.values(normalized).map((value) => value.toFixed(3)).join(':');
}

async function marketplaceRequest(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  if (supabase) {
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) headers.Authorization = `Bearer ${data.session.access_token}`;
  }
  const response = await fetch(path, { ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'The request could not be completed.');
  return payload;
}

function marketplaceMoney(cents, currency = 'usd') {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: String(currency).toUpperCase() }).format((Number(cents) || 0) / 100);
}

function MarketplaceHeader({ user }) {
  return (
    <header className="marketplace-header">
      <a className="landing-brand" href="/" aria-label="Girih Studio home">
        <img className="landing-brand-logo" src="/landing/brand/girih-logo-color.png" alt="" aria-hidden="true" />
        <span>Girih Studio</span>
      </a>
      <nav aria-label="Marketplace navigation">
        {user && <span className="marketplace-user landing-user-greeting">Hello {user.name}</span>}
        {user?.role === USER_ROLES.ADMIN && <a className="marketplace-profile-link" href="/admin"><BarChart3 size={16} /><span>Overview</span></a>}
        <a className="marketplace-profile-link" href="/training"><GraduationCap size={16} /><span>Academy</span></a>
        <a className="marketplace-profile-link" href="/profile" aria-label="Profile"><User size={16} /><span>Profile</span></a>
        <girih-app-switcher current-app="girih" compact></girih-app-switcher>
        <a className="marketplace-icon-link" href="/marketplace" aria-label="Marketplace" title="Marketplace"><Store size={20} /></a>
      </nav>
    </header>
  );
}

function formatUsageTime(seconds) {
  const total = Math.max(0, Number(seconds) || 0);
  if (total < 60) return total ? '< 1m' : '0m';
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (!hours) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function formatAdminDate(value, includeTime = false) {
  if (!value) return 'Never';
  return new Intl.DateTimeFormat(undefined, includeTime
    ? { dateStyle: 'medium', timeStyle: 'short' }
    : { dateStyle: 'medium' }).format(new Date(value));
}

const ADMIN_OVERVIEW_RANGES = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'this_month', label: 'This month' },
  { value: 'previous_month', label: 'Previous month' },
  { value: 'all', label: 'Since beginning' },
];

function AdminTimelineChart({ title, icon, points, metric, total, formatValue = (value) => value.toLocaleString(), accent }) {
  const width = 600;
  const height = 154;
  const top = 12;
  const bottom = 132;
  const values = points.map((point) => Number(point[metric] || 0));
  const maxValue = Math.max(1, ...values);
  const coordinates = values.map((value, index) => ({
    x: points.length > 1 ? (index / (points.length - 1)) * width : width / 2,
    y: bottom - (value / maxValue) * (bottom - top),
    value,
  }));
  const linePath = coordinates.map((point, index) => `${index ? 'L' : 'M'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
  const areaPath = coordinates.length ? `${linePath} L ${coordinates.at(-1).x.toFixed(2)} ${bottom} L ${coordinates[0].x.toFixed(2)} ${bottom} Z` : '';
  const axisIndexes = points.length <= 2 ? points.map((_, index) => index) : [0, Math.floor((points.length - 1) / 2), points.length - 1];

  return (
    <article className="admin-timeline-card" style={{ '--timeline-accent': accent }}>
      <header><span>{icon}{title}</span><strong>{formatValue(total)}</strong></header>
      <div className="admin-timeline-plot">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title} over ${points.length} timeline points`} preserveAspectRatio="none">
          {[top, (top + bottom) / 2, bottom].map((y) => <line className="admin-timeline-gridline" key={y} x1="0" x2={width} y1={y} y2={y} />)}
          {areaPath && <path className="admin-timeline-area" d={areaPath} />}
          {linePath && <path className="admin-timeline-line" d={linePath} />}
          {coordinates.map((point, index) => <circle className="admin-timeline-point" key={points[index].key} cx={point.x} cy={point.y} r={points.length > 35 ? 2.5 : 4}>
            <title>{points[index].label}: {formatValue(point.value)}</title>
          </circle>)}
        </svg>
      </div>
      <div className="admin-timeline-axis">
        {axisIndexes.map((index) => <span key={`${points[index]?.key}-${index}`}>{points[index]?.label}</span>)}
      </div>
    </article>
  );
}

function AdminOverviewPage() {
  const [user, setUser] = useState(null);
  const [payload, setPayload] = useState(null);
  const [status, setStatus] = useState('Loading user overview...');
  const [search, setSearch] = useState('');
  const [plan, setPlan] = useState('all');
  const [activity, setActivity] = useState('all');
  const [sort, setSort] = useState('joined');
  const [timeRange, setTimeRange] = useState('30d');

  useEffect(() => {
    let active = true;
    setStatus('Loading user overview...');
    if (!supabase) {
      setStatus('Authentication is not configured.');
      return undefined;
    }
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      if (!data.session?.user) {
        window.location.href = '/app?mode=login';
        return;
      }
      const nextUser = await loadAuthenticatedUser(data.session.user);
      if (!active) return;
      setUser(nextUser);
      if (nextUser.role !== USER_ROLES.ADMIN) {
        setStatus('This page is only available to administrators.');
        return;
      }
      try {
        const result = await marketplaceRequest(`/api/admin-users?range=${encodeURIComponent(timeRange)}`);
        if (active) {
          setPayload(result);
          setStatus('');
        }
      } catch (error) {
        if (active) setStatus(error.message);
      }
    }).catch((error) => active && setStatus(error.message));
    return () => { active = false; };
  }, [timeRange]);

  const users = useMemo(() => {
    const term = search.trim().toLowerCase();
    const result = (payload?.users || []).filter((item) => {
      if (term && !`${item.name} ${item.email}`.toLowerCase().includes(term)) return false;
      if (plan !== 'all' && item.role !== plan) return false;
      if (activity === 'online' && !item.isOnline) return false;
      if (activity === 'active' && !item.isActive) return false;
      if (activity === 'inactive' && item.isActive) return false;
      return true;
    });
    return result.sort((a, b) => {
      if (sort === 'usage') return b.totalSeconds - a.totalSeconds;
      if (sort === 'designs') return (b.savedDesigns + b.marketplaceListings) - (a.savedDesigns + a.marketplaceListings);
      if (sort === 'active') return new Date(b.lastActiveAt || 0) - new Date(a.lastActiveAt || 0);
      return new Date(b.joinedAt) - new Date(a.joinedAt);
    });
  }, [payload, search, plan, activity, sort]);

  const summary = payload?.summary;
  const rangeLabel = payload?.range?.label || ADMIN_OVERVIEW_RANGES.find((item) => item.value === timeRange)?.label || 'Selected period';
  const rangePhrase = rangeLabel.toLowerCase();
  const paidPercent = summary?.totalUsers ? Math.round((summary.paidUsers / summary.totalUsers) * 100) : 0;
  const activePercent = summary?.totalUsers ? Math.round((summary.activeUsers / summary.totalUsers) * 100) : 0;

  return (
    <div className="marketplace-page admin-overview-page">
      <MarketplaceHeader user={user} />
      <main className="admin-overview-main">
        <section className="admin-overview-heading">
          <div>
            <p className="landing-eyebrow">Administration / Users</p>
            <h1>User overview</h1>
            <p>A complete view of membership, engagement, saved work, and marketplace participation.</p>
          </div>
          <div className="admin-overview-actions">
            <label className="admin-range-control">
              <Clock3 size={16} />
              <span>Reporting period</span>
              <select value={timeRange} onChange={(event) => setTimeRange(event.target.value)} aria-label="User overview reporting period">
                {ADMIN_OVERVIEW_RANGES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            {payload && <div className="admin-report-meta"><Activity size={16} /><span>Live report</span><small>Updated {formatAdminDate(payload.generatedAt, true)}</small></div>}
          </div>
        </section>

        {status && <div className="admin-overview-message">{status}</div>}
        {summary && <>
          <section className="admin-kpi-grid" aria-label="User summary">
            <article className="admin-kpi-card admin-kpi-primary"><span><UsersRound size={19} /> Registered users</span><strong>{summary.totalUsers.toLocaleString()}</strong><small>{summary.newUsers.toLocaleString()} joined {rangePhrase}</small></article>
            <article className="admin-kpi-card"><span><Activity size={19} /> Active users</span><strong>{summary.activeUsers.toLocaleString()}</strong><small>{activePercent}% active {rangePhrase} · {summary.onlineUsers} online now</small></article>
            <article className="admin-kpi-card"><span><Clock3 size={19} /> Total app time</span><strong>{formatUsageTime(summary.totalSeconds)}</strong><small>{formatUsageTime(summary.averageSeconds)} average per tracked user · {rangeLabel}</small></article>
            <article className="admin-kpi-card"><span><Save size={19} /> Saved designs</span><strong>{summary.savedDesigns.toLocaleString()}</strong><small>{summary.marketplaceListings} marketplace listings · {summary.publishedListings} live · {rangeLabel}</small></article>
          </section>

          <section className="admin-app-overview" aria-label="Apps, users, and login status">
            <header className="admin-timeline-heading">
              <div><p className="landing-eyebrow">Suite access</p><h2>Apps, users, and login status</h2></div>
              <span>One account signs users into the complete suite</span>
            </header>
            <div className="admin-app-grid">
              {GIRIH_APPS.map((app) => <article key={app.id} className={`app-${app.id}`}>
                <girih-app-icon app={app.id}></girih-app-icon>
                <div><strong>{app.shortName}</strong><small>{app.category}</small></div>
                <span><b>{summary.totalUsers.toLocaleString()}</b> account users</span>
                <span className="admin-app-login"><i /> {summary.onlineUsers.toLocaleString()} logged in now</span>
                <a href={app.url}>Open app <ArrowRight size={13} /></a>
              </article>)}
            </div>
          </section>

          <section className="admin-timeline-section" aria-label="User activity timeline">
            <header className="admin-timeline-heading">
              <div><p className="landing-eyebrow">Timeline</p><h2>User activity trends</h2></div>
              <span>{rangeLabel} · {payload.timeline?.unit === 'hour' ? 'Hourly' : payload.timeline?.unit === 'month' ? 'Monthly' : 'Daily'} view</span>
            </header>
            <div className="admin-timeline-grid">
              <AdminTimelineChart title="New registrations" icon={<UsersRound size={16} />} points={payload.timeline?.points || []} metric="newUsers" total={summary.newUsers} accent="#2f6f64" />
              <AdminTimelineChart title="Models saved" icon={<Save size={16} />} points={payload.timeline?.points || []} metric="savedDesigns" total={summary.savedDesigns} accent="#bc7b2c" />
              <AdminTimelineChart title="Time spent" icon={<Clock3 size={16} />} points={payload.timeline?.points || []} metric="totalSeconds" total={summary.totalSeconds} formatValue={formatUsageTime} accent="#5966a7" />
              <AdminTimelineChart title="Active users" icon={<Activity size={16} />} points={payload.timeline?.points || []} metric="activeUsers" total={summary.activeUsers} accent="#a14f58" />
            </div>
          </section>

          <section className="admin-insight-grid">
            <article className="admin-plan-card">
              <div className="admin-card-heading"><div><p className="landing-eyebrow">Membership</p><h2>Plan distribution</h2></div><strong>{paidPercent}% paid</strong></div>
              <div className="admin-plan-bar"><span style={{ width: `${paidPercent}%` }} /></div>
              <div className="admin-plan-legend">
                <span><i className="paid" />Paid <strong>{summary.paidUsers}</strong></span>
                <span><i className="free" />Free <strong>{summary.freeUsers}</strong></span>
                <span><i className="admin" />Admin <strong>{summary.adminUsers}</strong></span>
              </div>
            </article>
            <article className="admin-summary-card">
              <p className="landing-eyebrow">At a glance</p>
              <h2>Community summary</h2>
              <p>{summary.activeUsers} of {summary.totalUsers} users were active {rangePhrase}. During this period, the community saved {summary.savedDesigns} designs and created {summary.marketplaceListings} marketplace listings, of which {summary.publishedListings} are currently published.</p>
            </article>
          </section>

          <section className="admin-users-panel">
            <div className="admin-users-title"><div><p className="landing-eyebrow">Directory</p><h2>All users</h2></div><span>{users.length} of {summary.totalUsers}</span></div>
            <div className="admin-user-filters">
              <label className="admin-user-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name or email" /></label>
              <select value={plan} onChange={(event) => setPlan(event.target.value)} aria-label="Filter by plan"><option value="all">All plans</option><option value="paid">Paid</option><option value="free">Free</option><option value="admin">Admin</option></select>
              <select value={activity} onChange={(event) => setActivity(event.target.value)} aria-label="Filter by activity"><option value="all">All activity</option><option value="online">Online now</option><option value="active">Active ({rangeLabel})</option><option value="inactive">No activity ({rangeLabel})</option></select>
              <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort users"><option value="joined">Newest first</option><option value="active">Last active</option><option value="usage">Most time</option><option value="designs">Most designs</option></select>
            </div>
            <div className="admin-users-table-wrap">
              <table className="admin-users-table">
                <thead><tr><th>User</th><th>Plan</th><th>Activity</th><th>Time in app ({rangeLabel})</th><th>Saved ({rangeLabel})</th><th>Marketplace ({rangeLabel})</th><th>Joined</th></tr></thead>
                <tbody>{users.map((item) => <tr key={item.id}>
                  <td><div className="admin-user-identity"><span>{item.name.slice(0, 1).toUpperCase()}</span><div><strong>{item.name}</strong><small>{item.email}</small></div></div></td>
                  <td><span className={`admin-role-pill role-${item.role}`}>{item.role}</span></td>
                  <td><div className="admin-activity-cell"><strong className={item.isOnline ? 'online' : ''}>{item.isOnline ? 'Online now' : item.isActive ? 'Active' : 'Inactive'}</strong><small>{item.lastActiveAt ? formatAdminDate(item.lastActiveAt, true) : 'No activity recorded'}</small></div></td>
                  <td><strong>{formatUsageTime(item.totalSeconds)}</strong><small className="admin-table-subline">{item.sessionCount} session{item.sessionCount === 1 ? '' : 's'}</small></td>
                  <td><strong>{item.savedDesigns}</strong></td>
                  <td><strong>{item.marketplaceListings}</strong><small className="admin-table-subline">{item.publishedListings} published</small></td>
                  <td>{formatAdminDate(item.joinedAt)}</td>
                </tr>)}</tbody>
              </table>
              {!users.length && <div className="admin-empty-users">No users match these filters.</div>}
            </div>
          </section>
        </>}
      </main>
    </div>
  );
}

function MarketplaceCard({ listing, onBuy, owned = false, listingHref = '' }) {
  const previewHref = listingHref || `/profile/${listing.sellerId || ''}`;
  return (
    <article className={`marketplace-card ${listing.category === 'Stickers' ? 'marketplace-sticker-card' : ''}`} id={`listing-${listing.id}`}>
      <a className="marketplace-card-image" href={previewHref} aria-label={listingHref ? `Open ${listing.title}` : `Open ${listing.sellerName || 'artist'} profile`}>
        <img
          src={listing.previewImage}
          alt={`${listing.title} ${listing.category === 'Stickers' ? 'watermarked sticker' : 'pattern'} preview`}
          draggable={listing.category !== 'Stickers'}
          onContextMenu={listing.category === 'Stickers' ? (event) => event.preventDefault() : undefined}
        />
      </a>
      <div className="marketplace-card-body">
        <div className="marketplace-card-meta"><span>{listing.category}</span><span>{listing.category === 'Stickers' ? 'Surface PNG' : `${listing.pieceCount} pieces`}</span></div>
        <h2>{listingHref ? <a className="marketplace-card-title-link" href={listingHref}>{listing.title}</a> : listing.title}</h2>
        <a className="marketplace-seller" href={`/profile/${listing.sellerId || ''}`}>{listing.sellerName || 'Girih artist'}</a>
        {listing.description && <p className="marketplace-card-description">{listing.description}</p>}
        <div className="marketplace-card-footer">
          <strong>{marketplaceMoney(listing.priceCents, listing.currency)}</strong>
          {onBuy && <button type="button" onClick={() => onBuy(listing)} disabled={owned}>{owned ? 'Owned' : 'Buy pattern'}</button>}
          {listingHref && !onBuy && <a className="marketplace-card-open" href={listingHref}>View pattern <ArrowRight size={14} /></a>}
        </div>
      </div>
    </article>
  );
}

function MarketplacePage() {
  const [user, setUser] = useState(null);
  const [listings, setListings] = useState([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('Loading patterns...');
  const [busyId, setBusyId] = useState('');
  const directListingId = new URLSearchParams(window.location.search).get('listing') || '';

  useEffect(() => {
    let active = true;
    if (supabase) supabase.auth.getSession().then(async ({ data }) => {
      if (!active || !data.session?.user) return;
      setUser(await loadAuthenticatedUser(data.session.user));
    });
    marketplaceRequest('/api/marketplace-listings')
      .then((payload) => {
        if (!active) return;
        setListings(payload.listings || []);
        setStatus('');
      })
      .catch((error) => active && setStatus(error.message));
    return () => { active = false; };
  }, []);

  const filteredListings = listings.filter((listing) =>
    (!directListingId || listing.id === directListingId) &&
    (!search.trim() || `${listing.title} ${listing.sellerName} ${listing.description}`.toLowerCase().includes(search.trim().toLowerCase())),
  );
  const categorySections = [
    ...MARKETPLACE_CATEGORIES.map((name) => ({ name, listings: filteredListings.filter((listing) => listing.category === name) })),
    ...(filteredListings.some((listing) => listing.category === 'Mixed')
      ? [{ name: 'Mixed', listings: filteredListings.filter((listing) => listing.category === 'Mixed') }]
      : []),
  ];

  async function buyListing(listing) {
    if (!user) {
      window.location.href = '/app?mode=login';
      return;
    }
    try {
      setBusyId(listing.id);
      const payload = await marketplaceRequest('/api/create-marketplace-checkout', {
        method: 'POST',
        body: JSON.stringify({ listingId: listing.id }),
      });
      window.location.href = payload.url;
    } catch (error) {
      setStatus(error.message);
      setBusyId('');
    }
  }

  return (
    <div className="marketplace-page">
      <MarketplaceHeader user={user} />
      <main className="marketplace-main">
        <section className="marketplace-heading">
          <p className="landing-eyebrow">Girih Pattern Marketplace</p>
          <h1>Patterns made by the Girih Studio community.</h1>
          <p>Discover editable 3D compositions and surface stickers, support their makers, and add purchases directly to your Studio library.</p>
          {directListingId && <a className="marketplace-back-link" href="/marketplace"><ArrowRight size={15} /> Browse all patterns</a>}
        </section>
        <div className="marketplace-toolbar">
          <label><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search patterns or artists" /></label>
          <a href="/profile"><Store size={16} /> Sell a pattern</a>
        </div>
        {!directListingId && <nav className="marketplace-category-nav" aria-label="Pattern categories">
          {MARKETPLACE_CATEGORIES.map((item) => <a key={item} href={`#category-${item.toLowerCase().replace(/\s+/g, '-')}`}>{item}</a>)}
        </nav>}
        {status && <p className="marketplace-status">{status}</p>}
        {!status && <div className="marketplace-category-sections">
          {categorySections.filter((section) => !directListingId || section.listings.length).map((section) => (
            <section className="marketplace-category-section" id={`category-${section.name.toLowerCase().replace(/\s+/g, '-')}`} key={section.name}>
              <header><div><p className="landing-eyebrow">Puzzle family</p><h2>{section.name}</h2></div><span>{section.listings.length} pattern{section.listings.length === 1 ? '' : 's'}</span></header>
              {section.listings.length ? <div className="marketplace-grid">
                {section.listings.map((listing) => <MarketplaceCard key={listing.id} listing={listing} onBuy={busyId ? null : buyListing} />)}
              </div> : <div className="marketplace-category-empty">No published {section.name} patterns yet.</div>}
            </section>
          ))}
        </div>}
      </main>
    </div>
  );
}

function marketplaceTransferModel(model) {
  const compact = compactSceneModelForStorage(model);
  const globalSettings = readAdminPieceSettings();
  const sources = (Array.isArray(compact?.sources) ? compact.sources : []).map((source) => {
    const rawSourceId = normalizeMoroccoPieceId(source.sourceId || source.sourceKey || '');
    const baseSourceId = typeof rawSourceId === 'string' ? rawSourceId.replace(/-frame-slice$/i, '') : rawSourceId;
    const globalSticker = globalSettings[rawSourceId]?.surfaceSticker || globalSettings[baseSourceId]?.surfaceSticker;
    const surfaceSticker = hasSurfaceStickerContent(globalSticker)
      ? normalizeSurfaceSticker(globalSticker)
      : hasSurfaceStickerContent(source.surfaceSticker)
        ? normalizeSurfaceSticker(source.surfaceSticker)
        : undefined;
    return { ...source, surfaceSticker };
  });
  return {
    ...compact,
    version: Math.max(2, Number(compact?.version) || 1),
    surfaceStickerFormat: 1,
    sources,
  };
}

async function modelMarketplacePreview(model) {
  const pieces = rehydrateScenePieces(model);
  const stickerTextures = new Map();
  pieces.forEach((piece) => {
    if (!hasSurfaceStickerContent(piece.surfaceSticker)) return;
    const signature = surfaceStickerSignature(piece.surfaceSticker);
    if (!stickerTextures.has(signature)) stickerTextures.set(signature, createSurfaceStickerTexture(piece.surfaceSticker));
  });
  await Promise.all([...stickerTextures.values()].map((texture) => texture.userData.readyPromise || Promise.resolve()));
  const canvas = renderFlatColorTopCanvas(pieces, {
    modelTransform: DEFAULT_MODEL_TRANSFORM,
    orientation: 'landscape',
    paperSize: 'a4',
    renderSettings: normalizeRenderSettings(model.renderSettings),
  });
  const thumbnail = document.createElement('canvas');
  thumbnail.width = 900;
  thumbnail.height = 650;
  const context = thumbnail.getContext('2d');
  context.drawImage(canvas, 0, 0, thumbnail.width, thumbnail.height);
  return thumbnail.toDataURL('image/jpeg', 0.82);
}

function readLocalMarketplaceModels() {
  try {
    const models = JSON.parse(localStorage.getItem(MODELS_STORAGE_KEY));
    return Array.isArray(models) ? models : [];
  } catch {
    return [];
  }
}

function openSavedModelOnStudioStage(modelId) {
  try {
    sessionStorage.setItem(PENDING_STUDIO_MODEL_ID_KEY, String(modelId));
  } catch {
    return false;
  }
  window.location.href = '/app';
  return true;
}

const SHARED_LIBRARY_LABELS = Object.freeze({
  girih_pattern: 'Girih App pattern',
  brick_bond: 'Bricks App bond',
  muqarnas_assembly: 'Muqarnas App assembly',
  surface_sticker: 'Surface sticker',
  mehraz_project: 'Mehraz App project',
});

const SHARED_LIBRARY_APP_LINKS = Object.freeze({
  girih_pattern: '/app',
  brick_bond: 'https://bricks.girihstudio.com',
  muqarnas_assembly: 'https://muqarnas.girihstudio.com',
  surface_sticker: '/app',
  mehraz_project: 'https://mehraz.girihstudio.com',
});

const PROFILE_LIBRARY_APP_GROUPS = Object.freeze([
  { app: 'girih', name: 'Girih App', assetTypes: ['girih_pattern', 'surface_sticker'], emptyMessage: 'No Girih patterns or stickers in the shared library.' },
  { app: 'bricks', name: 'Bricks App', assetTypes: ['brick_bond'], emptyMessage: 'No brick bonds in the shared library.' },
  { app: 'muqarnas', name: 'Muqarnas App', assetTypes: ['muqarnas_assembly'], emptyMessage: 'No Muqarnas assemblies in the shared library.' },
  { app: 'mehraz', name: 'Mehraz App', assetTypes: ['mehraz_project'], emptyMessage: 'No Mehraz projects in the shared library.' },
]);

function sharedLibraryPreviewImage(asset, version, fallbackImage = '') {
  const artifacts = version?.artifacts || asset?.currentVersion?.artifacts || {};
  const payload = version?.payload || asset?.currentVersion?.payload || {};
  return artifacts.preview_png
    || artifacts.watermarked_preview_png
    || artifacts.source_png
    || payload.previewImage
    || payload.preview
    || payload.imageDataUrl
    || payload.surfaceSticker?.imageDataUrl
    || fallbackImage
    || '';
}

function sharedLibraryStats(asset, version) {
  const payload = version?.payload || asset?.currentVersion?.payload || {};
  const metadata = version?.metadata || asset?.currentVersion?.metadata || {};
  const stats = [];
  if (Array.isArray(payload.pieces)) stats.push(`${payload.pieces.length} pieces`);
  if (Array.isArray(payload.placements)) stats.push(`${payload.placements.length} placements`);
  if (Array.isArray(payload.modules)) stats.push(`${payload.modules.length} modules`);
  if (Array.isArray(payload.pattern?.bricks)) stats.push(`${payload.pattern.bricks.length} bricks`);
  if (Array.isArray(payload.shapes)) stats.push(`${payload.shapes.length} shapes`);
  if (metadata.pieceCount) stats.push(`${metadata.pieceCount} pieces`);
  if (metadata.brickCount) stats.push(`${metadata.brickCount} bricks`);
  if (metadata.moduleCount) stats.push(`${metadata.moduleCount} modules`);
  return [...new Set(stats)].join(' / ') || 'Library asset';
}

function drawSharedLibraryPreview(canvas, asset, version) {
  const context = canvas?.getContext?.('2d');
  if (!context || !asset) return;
  const width = canvas.width;
  const height = canvas.height;
  const payload = version?.payload || asset.currentVersion?.payload || {};
  context.clearRect(0, 0, width, height);
  context.fillStyle = '#f9f2e5';
  context.fillRect(0, 0, width, height);
  context.strokeStyle = 'rgba(47, 81, 76, 0.13)';
  for (let x = 0; x < width; x += 28) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }
  for (let y = 0; y < height; y += 28) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }
  const pieces = Array.isArray(payload.pieces) ? payload.pieces : [];
  if (pieces.length) {
    const bounds = pieces.reduce((box, piece) => {
      const points = Array.isArray(piece.points) ? piece.points : Array.isArray(piece.vertices) ? piece.vertices : [];
      points.forEach((point) => {
        const x = Array.isArray(point) ? Number(point[0]) : Number(point.x);
        const y = Array.isArray(point) ? Number(point[1]) : Number(point.y);
        if (Number.isFinite(x) && Number.isFinite(y)) {
          box.minX = Math.min(box.minX, x);
          box.maxX = Math.max(box.maxX, x);
          box.minY = Math.min(box.minY, y);
          box.maxY = Math.max(box.maxY, y);
        }
      });
      return box;
    }, { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
    const spanX = Math.max(1, bounds.maxX - bounds.minX);
    const spanY = Math.max(1, bounds.maxY - bounds.minY);
    const scale = Math.min((width - 44) / spanX, (height - 44) / spanY);
    pieces.slice(0, 700).forEach((piece) => {
      const points = Array.isArray(piece.points) ? piece.points : Array.isArray(piece.vertices) ? piece.vertices : [];
      if (points.length < 3) return;
      context.beginPath();
      points.forEach((point, index) => {
        const rawX = Array.isArray(point) ? Number(point[0]) : Number(point.x);
        const rawY = Array.isArray(point) ? Number(point[1]) : Number(point.y);
        const x = 22 + (rawX - bounds.minX) * scale;
        const y = height - 22 - (rawY - bounds.minY) * scale;
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.closePath();
      context.fillStyle = piece.color || piece.fill || '#2f514c';
      context.fill();
      context.strokeStyle = 'rgba(20, 28, 24, 0.42)';
      context.lineWidth = 1;
      context.stroke();
    });
    return;
  }
  const bricks = Array.isArray(payload.pattern?.bricks) ? payload.pattern.bricks : [];
  if (bricks.length) {
    const cell = Math.max(14, Math.min(34, width / 12));
    bricks.slice(0, 160).forEach((brick, index) => {
      const x = 18 + ((Number(brick.x) || index % 8) * cell) % (width - 42);
      const y = 20 + ((Number(brick.y) || Math.floor(index / 8)) * cell * 0.55) % (height - 45);
      const vertical = brick.orientation === 'vertical' || brick.type === 'vertical';
      context.fillStyle = brick.color || (vertical ? '#d8c347' : '#114c9d');
      context.fillRect(x, y, vertical ? cell * 0.45 : cell, vertical ? cell : cell * 0.42);
      context.strokeStyle = '#1d211f';
      context.strokeRect(x, y, vertical ? cell * 0.45 : cell, vertical ? cell : cell * 0.42);
    });
    return;
  }
  context.fillStyle = '#2f514c';
  context.font = '700 18px serif';
  context.textAlign = 'center';
  context.fillText(SHARED_LIBRARY_LABELS[asset.asset_type] || 'Library item', width / 2, height / 2 - 4);
  context.fillStyle = '#756b5f';
  context.font = '12px sans-serif';
  context.fillText(sharedLibraryStats(asset, version), width / 2, height / 2 + 18);
}

function SharedLibraryThumbnail({ asset, version, fallbackImage = '' }) {
  const canvasRef = useRef(null);
  const image = sharedLibraryPreviewImage(asset, version, fallbackImage);
  useEffect(() => {
    if (!image) drawSharedLibraryPreview(canvasRef.current, asset, version);
  }, [asset?.id, version?.id, image]);
  if (image) return <img className="shared-library-thumbnail" src={image} alt="" loading="lazy" />;
  return <canvas ref={canvasRef} className="shared-library-thumbnail" width="180" height="120" aria-hidden="true" />;
}

function MarketplaceProfilePage({ publicProfileId = '' }) {
  const isPublic = Boolean(publicProfileId);
  const profileSourceApp = new URLSearchParams(window.location.search).get('app') || '';
  const showMarketplaceTab = !profileSourceApp || profileSourceApp === 'girih';
  const [user, setUser] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [publicProfile, setPublicProfile] = useState(null);
  const [publicListings, setPublicListings] = useState([]);
  const [localModels, setLocalModels] = useState(readLocalMarketplaceModels);
  const [cloudPatterns, setCloudPatterns] = useState([]);
  const [marketplaceSourcesLoaded, setMarketplaceSourcesLoaded] = useState(false);
  const [form, setForm] = useState({ publicName: '', bio: '', listingType: 'model', modelId: '', stickerDataUrl: '', title: '', description: '', category: 'Mixed', price: '10.00' });
  const [editingListing, setEditingListing] = useState(null);
  const [listingEditForm, setListingEditForm] = useState({ title: '', description: '', category: 'Mixed', price: '10.00' });
  const [status, setStatus] = useState('Loading profile...');
  const [listingStatus, setListingStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [sharedLibrary, setSharedLibrary] = useState([]);
  const [selectedSharedAssetId, setSelectedSharedAssetId] = useState('');
  const [sharedVersions, setSharedVersions] = useState([]);
  const [selectedSharedVersionId, setSelectedSharedVersionId] = useState('');
  const [sharedEditForm, setSharedEditForm] = useState({ name: '', description: '' });
  const [libraryManageStatus, setLibraryManageStatus] = useState('');
  const [collapsedSharedLibraryGroups, setCollapsedSharedLibraryGroups] = useState({ girih: true, bricks: true, muqarnas: true, mehraz: true });
  const [trainingPayload, setTrainingPayload] = useState(null);
  const [billingBusy, setBillingBusy] = useState(false);
  const [profileTab, setProfileTab] = useState(() => {
    const requested = new URLSearchParams(window.location.search).get('tab');
    const allowedTabs = showMarketplaceTab ? ['account', 'assets', 'academy', 'marketplace'] : ['account', 'assets', 'academy'];
    return allowedTabs.includes(requested) ? requested : 'account';
  });

  function openProfileTab(tab) {
    setProfileTab(tab);
    if (tab !== 'marketplace') setEditingListing(null);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tab);
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  }

  async function loadDashboard() {
    const payload = await marketplaceRequest('/api/marketplace-dashboard');
    setDashboard(payload);
    setForm((current) => ({
      ...current,
      publicName: payload.profile.publicName,
      bio: payload.profile.bio,
    }));
    setStatus('');
  }

  async function loadMarketplaceSources() {
    const [patternPayload, models] = await Promise.all([
      marketplaceRequest('/api/marketplace-patterns'),
      readModelsFromDevice(),
    ]);
    const patterns = patternPayload.patterns || [];
    setCloudPatterns(patterns);
    setLocalModels(models);
    setForm((current) => ({
      ...current,
      modelId: current.modelId || (patterns[0] ? `cloud:${patterns[0].id}` : models[0] ? `local:${models[0].id}` : ''),
    }));
    setMarketplaceSourcesLoaded(true);
  }

  async function loadTrainingProgress() {
    if (!supabase) return;
    const { data } = await supabase.auth.getSession();
    const response = await fetch('/api/training', {
      headers: { Authorization: `Bearer ${data.session?.access_token || ''}` },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Academy progress could not be loaded.');
    setTrainingPayload(payload);
  }

  async function openProfileBilling() {
    if (!supabase || billingBusy || !user) return;
    setBillingBusy(true);
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session?.access_token) throw new Error('Please sign in again.');
      const endpoint = user.role === USER_ROLES.PAID ? '/api/create-portal-session' : '/api/create-checkout-session';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${data.session.access_token}` },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.url) throw new Error(payload.error || 'Billing could not be opened.');
      window.location.assign(payload.url);
    } catch (error) {
      setStatus(error.message);
      setBillingBusy(false);
    }
  }

  async function refreshSharedLibrary(preferredAssetId = selectedSharedAssetId) {
    if (!supabase) return;
    try {
      const assets = await listLibraryAssets(supabase);
      setSharedLibrary(assets);
      const nextId = assets.some((asset) => asset.id === preferredAssetId)
        ? preferredAssetId
        : assets[0]?.id || '';
      setSelectedSharedAssetId(nextId);
      if (!assets.length) {
        setSharedVersions([]);
        setSelectedSharedVersionId('');
        setSharedEditForm({ name: '', description: '' });
      }
      setLibraryManageStatus('');
    } catch (error) {
      setLibraryManageStatus(error.message);
    }
  }

  async function loadSharedVersions(asset) {
    if (!asset || !supabase) return;
    try {
      const versions = await listLibraryAssetVersions(supabase, asset.id);
      setSharedVersions(versions);
      setSelectedSharedVersionId((current) => {
        if (versions.some((version) => version.id === current)) return current;
        return asset.current_version_id || versions[0]?.id || '';
      });
      setLibraryManageStatus('');
    } catch (error) {
      setLibraryManageStatus(error.message);
    }
  }

  useEffect(() => {
    let active = true;
    if (isPublic) {
      Promise.all([
        marketplaceRequest(`/api/marketplace-public-profile?id=${encodeURIComponent(publicProfileId)}`),
        marketplaceRequest(`/api/marketplace-listings?seller=${encodeURIComponent(publicProfileId)}`),
      ]).then(([profilePayload, listingPayload]) => {
        if (!active) return;
        setPublicProfile(profilePayload.profile);
        setPublicListings(listingPayload.listings || []);
        setStatus('');
      }).catch((error) => active && setStatus(error.message));
      return () => { active = false; };
    }
    if (!supabase) {
      setStatus('Sign in to open your marketplace profile.');
      return undefined;
    }
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      if (!data.session?.user) {
        window.location.href = '/app?mode=login';
        return;
      }
      setUser(await loadAuthenticatedUser(data.session.user));
      await Promise.all([
        loadDashboard().catch((error) => setStatus(error.message)),
        refreshSharedLibrary().catch((error) => setLibraryManageStatus(error.message)),
        loadTrainingProgress().catch(() => setTrainingPayload(null)),
      ]);
    });
    return () => { active = false; };
  }, [publicProfileId]);

  useEffect(() => {
    if (isPublic) return;
    const asset = sharedLibrary.find((item) => item.id === selectedSharedAssetId);
    setSharedEditForm({
      name: asset?.name || '',
      description: asset?.description || '',
    });
    if (asset) loadSharedVersions(asset);
  }, [selectedSharedAssetId, sharedLibrary, isPublic]);

  useEffect(() => {
    if (isPublic || profileTab !== 'marketplace' || marketplaceSourcesLoaded) return;
    loadMarketplaceSources().catch((error) => setStatus(error.message));
  }, [isPublic, marketplaceSourcesLoaded, profileTab]);

  async function saveProfile(event) {
    event.preventDefault();
    try {
      setBusy(true);
      await marketplaceRequest('/api/marketplace-dashboard', { method: 'PATCH', body: JSON.stringify({ publicName: form.publicName, bio: form.bio }) });
      await loadDashboard();
      setStatus('Profile updated.');
    } catch (error) { setStatus(error.message); } finally { setBusy(false); }
  }

  async function setupSeller() {
    try {
      setBusy(true);
      const payload = await marketplaceRequest('/api/marketplace-connect', { method: 'POST', body: '{}' });
      window.location.href = payload.url;
    } catch (error) { setStatus(error.message); setBusy(false); }
  }

  async function openStripePayouts() {
    try {
      setBusy(true);
      const payload = await marketplaceRequest('/api/marketplace-connect?mode=dashboard', { method: 'POST', body: '{}' });
      window.location.href = payload.url;
    } catch (error) { setStatus(error.message); setBusy(false); }
  }

  async function createListing(event) {
    event.preventDefault();
    const isStickerListing = form.listingType === 'sticker';
    const [source, modelId] = form.modelId.split(':');
    const model = isStickerListing
      ? createSurfaceStickerPackage(form.title, { imageDataUrl: form.stickerDataUrl, imageCentered: true, imageX: 0.5, imageY: 0.5, imageScale: 1, imageRotation: 0 })
      : source === 'cloud'
        ? cloudPatterns.find((item) => item.id === modelId)?.modelData
        : localModels.find((item) => item.id === modelId);
    if (isStickerListing && !form.stickerDataUrl) { setListingStatus('Choose a PNG sticker before publishing.'); return; }
    if (!model) { setListingStatus('Save a model in the Studio or your profile before creating a listing.'); return; }
    try {
      setBusy(true);
      setListingStatus(`Preparing and publishing ${isStickerListing ? 'sticker' : 'listing'}...`);
      const transferModel = isStickerListing ? model : marketplaceTransferModel(model);
      await marketplaceRequest('/api/marketplace-listings', {
        method: 'POST',
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          category: isStickerListing ? 'Stickers' : form.category,
          priceCents: Math.round(Number(form.price) * 100),
          currency: 'usd',
          previewImage: isStickerListing ? form.stickerDataUrl : await modelMarketplacePreview(transferModel),
          modelData: transferModel,
        }),
      });
      setForm((current) => ({ ...current, title: '', description: '', stickerDataUrl: '' }));
      await loadDashboard();
      setListingStatus(`${isStickerListing ? 'Sticker' : 'Pattern'} published successfully.`);
      setStatus(`${isStickerListing ? 'Sticker' : 'Pattern'} published in the marketplace.`);
    } catch (error) { setListingStatus(error.message); setStatus(error.message); } finally { setBusy(false); }
  }

  async function uploadMarketplaceSticker(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setBusy(true);
      setListingStatus('Preparing high-quality sticker...');
      const stickerDataUrl = await readSurfaceStickerPng(file);
      setForm((current) => ({ ...current, stickerDataUrl, title: current.title || file.name.replace(/\.png$/i, '') }));
      setListingStatus('Sticker ready to publish.');
    } catch (error) {
      setListingStatus(error.message || 'The sticker could not be prepared.');
    } finally {
      setBusy(false);
      event.target.value = '';
    }
  }

  async function archiveListing(id) {
    try {
      setBusy(true);
      await marketplaceRequest('/api/marketplace-listings', { method: 'PATCH', body: JSON.stringify({ id, status: 'archived' }) });
      await loadDashboard();
    } catch (error) { setStatus(error.message); } finally { setBusy(false); }
  }

  function openListingEditor(listing) {
    setEditingListing(listing);
    setListingEditForm({
      title: listing.title || '',
      description: listing.description || '',
      category: normalizePieceGroupName(listing.category || 'Mixed'),
      price: ((Number(listing.priceCents) || 0) / 100).toFixed(2),
    });
  }

  async function saveListingEdits(event) {
    event.preventDefault();
    if (!editingListing) return;
    try {
      setBusy(true);
      await marketplaceRequest('/api/marketplace-listings', {
        method: 'PATCH',
        body: JSON.stringify({
          id: editingListing.id,
          title: listingEditForm.title,
          description: listingEditForm.description,
          category: listingEditForm.category,
          priceCents: Math.round(Number(listingEditForm.price) * 100),
        }),
      });
      await loadDashboard();
      setEditingListing(null);
      setStatus('Listing details updated.');
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveLocalPattern(model) {
    try {
      setBusy(true);
      setStatus('Saving pattern to your profile...');
      const transferModel = marketplaceTransferModel(model);
      await marketplaceRequest('/api/marketplace-patterns', {
        method: 'POST',
        body: JSON.stringify({ title: model.name || 'Saved pattern', previewImage: await modelMarketplacePreview(transferModel), modelData: transferModel }),
      });
      await loadMarketplaceSources();
      setStatus('Pattern saved to your profile.');
    } catch (error) { setStatus(error.message); } finally { setBusy(false); }
  }

  async function deleteCloudPattern(id) {
    try {
      setBusy(true);
      await marketplaceRequest(`/api/marketplace-patterns?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      await loadMarketplaceSources();
    } catch (error) { setStatus(error.message); } finally { setBusy(false); }
  }

  async function addCloudPatternToStudio(pattern) {
    if (!pattern.modelData) return;
    const models = await readModelsFromDevice();
    const imported = { ...pattern.modelData, id: `profile-${pattern.id}-${crypto.randomUUID()}`, name: pattern.name };
    if (!await writeModelsToDevice([imported, ...models].slice(0, 20))) {
      setStatus('This pattern could not be added because browser storage is unavailable.');
      return;
    }
    if (!openSavedModelOnStudioStage(imported.id)) setStatus('The model was saved, but the Studio could not open it automatically.');
  }

  async function addPurchaseToStudio(purchase) {
    if (!purchase.modelData) return;
    if (isSurfaceStickerPackage(purchase.modelData)) {
      const library = await readSurfaceStickerLibrary();
      const installed = normalizeSurfaceStickerLibraryItem({
        id: `market-sticker-${purchase.listingId}`,
        listingId: purchase.listingId,
        name: purchase.title,
        previewImage: purchase.previewImage,
        surfaceSticker: purchase.modelData.surfaceSticker,
        installedAt: Date.now(),
      });
      const nextLibrary = [installed, ...library.filter((item) => item.listingId !== purchase.listingId)];
      if (!await writeSurfaceStickerLibrary(nextLibrary)) {
        setStatus('This sticker could not be installed because browser storage is unavailable.');
        return;
      }
      window.location.href = '/app';
      return;
    }
    const models = await readModelsFromDevice();
    const imported = { ...purchase.modelData, id: `market-${purchase.listingId}-${crypto.randomUUID()}`, name: purchase.title };
    if (!await writeModelsToDevice([imported, ...models].slice(0, 20))) {
      setStatus('This purchase could not be added because browser storage is unavailable.');
      return;
    }
    if (!openSavedModelOnStudioStage(imported.id)) setStatus('The model was saved, but the Studio could not open it automatically.');
  }

  async function renameSharedAsset(event) {
    event.preventDefault();
    if (!selectedSharedAssetId) return;
    try {
      setBusy(true);
      await updateLibraryAssetMetadata(supabase, selectedSharedAssetId, sharedEditForm);
      await refreshSharedLibrary(selectedSharedAssetId);
      setLibraryManageStatus('Library item renamed.');
    } catch (error) {
      setLibraryManageStatus(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function archiveSharedAsset(asset) {
    if (!asset) return;
    if (!window.confirm(`Remove "${asset.name}" from your active library? Its saved versions will stay archived.`)) return;
    try {
      setBusy(true);
      await archiveLibraryAsset(supabase, asset.id);
      await refreshSharedLibrary('');
      setLibraryManageStatus('Library item archived.');
    } catch (error) {
      setLibraryManageStatus(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function makeSharedVersionCurrent(version) {
    if (!version || !selectedSharedAssetId) return;
    try {
      setBusy(true);
      await setCurrentLibraryAssetVersion(supabase, selectedSharedAssetId, version.id);
      await refreshSharedLibrary(selectedSharedAssetId);
      setSelectedSharedVersionId(version.id);
      setLibraryManageStatus(`Version ${version.version_number} is now current.`);
    } catch (error) {
      setLibraryManageStatus(error.message);
    } finally {
      setBusy(false);
    }
  }

  function openSharedAssetInApp(asset) {
    if (!asset) return;
    const target = SHARED_LIBRARY_APP_LINKS[asset.asset_type] || '/app';
    const versionId = selectedSharedVersionId || asset.current_version_id || '';
    try {
      localStorage.setItem('girihstudio.openLibraryAsset', JSON.stringify({
        assetId: asset.id,
        assetType: asset.asset_type,
        versionId,
        source: 'profile',
        at: Date.now(),
      }));
    } catch {
      // The target app can still open even if local handoff storage is unavailable.
    }
    try {
      const url = new URL(target, window.location.origin);
      url.searchParams.set('libraryAsset', asset.id);
      if (versionId) url.searchParams.set('version', versionId);
      window.location.href = url.toString();
    } catch {
      window.location.href = target;
    }
  }

  const currentListings = dashboard?.listings?.filter((listing) => listing.status !== 'archived') || [];
  const archivedListings = dashboard?.listings?.filter((listing) => listing.status === 'archived') || [];
  const selectedSharedAsset = sharedLibrary.find((asset) => asset.id === selectedSharedAssetId) || sharedLibrary[0] || null;
  const selectedSharedVersion = sharedVersions.find((version) => version.id === selectedSharedVersionId) || selectedSharedAsset?.currentVersion || null;
  const groupedSharedLibrary = PROFILE_LIBRARY_APP_GROUPS.map((group) => ({
    ...group,
    assets: sharedLibrary.filter((asset) => group.assetTypes.includes(asset.asset_type)),
  }));
  const accountPlanLabel = user?.role === USER_ROLES.PAID || user?.role === USER_ROLES.ADMIN ? 'Paid' : 'Free';
  const trainingAssignments = trainingPayload?.assignments || [];
  const completedTraining = trainingAssignments.filter((assignment) => assignment.status === 'completed').length;
  const trainingLessonTotal = trainingAssignments.reduce((total, assignment) => {
    const module = trainingPayload?.modules?.find((item) => item.id === assignment.module_id);
    return total + (module?.lessons?.length || 0);
  }, 0);
  const completedLessonTotal = trainingAssignments.reduce((total, assignment) => total + (assignment.completed_lessons?.length || 0), 0);
  const trainingPercent = trainingLessonTotal ? Math.round((completedLessonTotal / trainingLessonTotal) * 100) : 0;
  const trainingModulesById = Object.fromEntries((trainingPayload?.modules || []).map((module) => [module.id, module]));
  const profileAcademyApps = GIRIH_APPS.filter((app) => ['girih', 'bricks', 'muqarnas', 'mehraz'].includes(app.id));

  if (isPublic) {
    return (
      <div className="marketplace-page">
        <MarketplaceHeader />
        <main className="marketplace-main">
          {status && <p className="marketplace-status">{status}</p>}
          {publicProfile && <section className="seller-profile-heading"><Store size={30} /><div><p className="landing-eyebrow">Artist storefront</p><h1>{publicProfile.publicName}</h1><p>{publicProfile.bio || 'Girih Studio pattern maker.'}</p></div></section>}
          <div className="marketplace-grid">{publicListings.map((listing) => <MarketplaceCard key={listing.id} listing={listing} />)}</div>
        </main>
      </div>
    );
  }

  return (
    <div className="marketplace-page">
      <MarketplaceHeader user={user} />
      <main className="marketplace-main profile-main">
        <section className="profile-compact-heading">
          <div><p className="landing-eyebrow">Girih Studio profile</p><h1>Your profile</h1><p>See your plan, assets, and Academy progress in one place.</p></div>
          {dashboard && <div className="profile-compact-stats"><span><strong>{sharedLibrary.length}</strong> shared library items</span></div>}
        </section>
        {status && <p className="marketplace-status">{status}</p>}
        {dashboard && <>
          <nav className="profile-tabs" aria-label="Profile sections" role="tablist">
            <button type="button" role="tab" className={profileTab === 'account' ? 'active' : ''} aria-selected={profileTab === 'account'} onClick={() => openProfileTab('account')}><User size={17} /><span><strong>Account</strong><small>{user?.role === USER_ROLES.PAID ? 'Paid' : user?.role === USER_ROLES.ADMIN ? 'Admin' : 'Free'} plan</small></span></button>
            <button type="button" role="tab" className={profileTab === 'assets' ? 'active' : ''} aria-selected={profileTab === 'assets'} onClick={() => openProfileTab('assets')}><FolderOpen size={17} /><span><strong>Assets</strong><small>{sharedLibrary.length} library items</small></span></button>
            <button type="button" role="tab" className={profileTab === 'academy' ? 'active' : ''} aria-selected={profileTab === 'academy'} onClick={() => openProfileTab('academy')}><GraduationCap size={17} /><span><strong>Academy</strong><small>{trainingPayload?.profile?.mode === 'teacher' ? `${trainingPayload.students?.length || 0} students` : `${trainingPercent}% complete`}</small></span></button>
            {showMarketplaceTab && <button type="button" role="tab" className={profileTab === 'marketplace' ? 'active' : ''} aria-selected={profileTab === 'marketplace'} onClick={() => openProfileTab('marketplace')}><Store size={17} /><span><strong>Marketplace</strong><small>{currentListings.length} active listings</small></span></button>}
          </nav>

          <div className={`profile-workspace tab-${profileTab}`}>
            <div className="profile-library-column">
              <section className="profile-market-section profile-library-section profile-account-section">
                <div className="profile-section-heading"><div><p className="landing-eyebrow">Subscription</p><h2>Your plan</h2></div></div>
                <div className="profile-subscription-card">
                  <div><span className={accountPlanLabel === 'Paid' ? 'paid' : 'free'} /><div><small>Current account status</small><strong>{accountPlanLabel}</strong></div></div>
                  <p>{accountPlanLabel === 'Paid' ? 'Your paid Girih Studio access is active across the connected apps.' : 'Your account currently uses the free Girih Studio plan.'}</p>
                  {user?.role !== USER_ROLES.ADMIN && <button type="button" onClick={openProfileBilling} disabled={billingBusy}>{billingBusy ? 'Opening...' : user?.role === USER_ROLES.PAID ? 'Manage billing' : 'Upgrade plan'}</button>}
                </div>
              </section>
              {profileTab === 'academy' && <section className="profile-academy-tab">
                <header className="profile-tab-heading"><div><p className="landing-eyebrow">Training progress</p><h2>Academy by app</h2></div><a href="/training">Open Academy <ArrowRight size={15} /></a></header>
                <div className="profile-academy-summary"><strong>{trainingPayload?.profile?.mode === 'teacher' ? `${trainingAssignments.length} class assignments` : `${trainingPercent}% overall progress`}</strong><span>{trainingPayload?.profile?.mode === 'teacher' ? `${trainingPayload.students?.length || 0} students in your class` : `${completedTraining} of ${trainingAssignments.length} modules completed`}</span></div>
                <div className="profile-academy-apps">{profileAcademyApps.map((app) => {
                  const assignments = trainingAssignments.filter((assignment) => trainingModulesById[assignment.module_id]?.app_id === app.id);
                  const completed = assignments.filter((assignment) => assignment.status === 'completed').length;
                  const lessonCount = assignments.reduce((total, assignment) => total + (trainingModulesById[assignment.module_id]?.lessons?.length || 0), 0);
                  const lessonsDone = assignments.reduce((total, assignment) => total + (assignment.completed_lessons?.length || 0), 0);
                  const progress = lessonCount ? Math.round((lessonsDone / lessonCount) * 100) : 0;
                  return <article key={app.id}><girih-app-icon app={app.id}></girih-app-icon><div><strong>{app.shortName}</strong><small>{assignments.length} module{assignments.length === 1 ? '' : 's'} · {completed} complete</small></div><span>{trainingPayload?.profile?.mode === 'teacher' ? `${assignments.length} assigned` : `${progress}%`}</span><a href={`/training?app=${app.id}`}>View training <ArrowRight size={13} /></a></article>;
                })}</div>
              </section>}
              <section id="library" className="profile-market-section profile-library-section shared-library-manager profile-assets-section">
                <div className="profile-section-heading">
                  <div><p className="landing-eyebrow">Shared asset library</p><h2>All app assets</h2></div>
                  <span>{sharedLibrary.length}</span>
                </div>
                <div className="shared-library-toolbar">
                  <p>Manage Girih patterns, brick bonds, Muqarnas assemblies, Mehraz projects, and surface stickers in one library.</p>
                  <button type="button" className="profile-muted-action" onClick={() => refreshSharedLibrary()} disabled={busy}>Refresh</button>
                </div>
                {libraryManageStatus && <p className="marketplace-listing-inline-status">{libraryManageStatus}</p>}
                {!sharedLibrary.length ? (
                  <div className="marketplace-empty">No shared assets yet. Save work from any Girih Studio app and it will appear here.</div>
                ) : (
                  <div className="shared-library-layout">
                    <div className="shared-library-groups" aria-label="Shared library items grouped by app">
                      {groupedSharedLibrary.map((group) => {
                        const collapsed = collapsedSharedLibraryGroups[group.app] === true;
                        const groupId = `profile-library-group-${group.app}`;
                        return <section className={`shared-library-group app-${group.app}`} key={group.app}>
                          <button type="button" className="shared-library-group-toggle" aria-expanded={!collapsed} aria-controls={groupId} onClick={() => setCollapsedSharedLibraryGroups((current) => ({ ...current, [group.app]: !collapsed }))}>
                            <girih-app-icon app={group.app} small=""></girih-app-icon>
                            <span><strong>{group.name}</strong><small>{group.assets.length} {group.assets.length === 1 ? 'item' : 'items'}</small></span>
                            <i aria-hidden="true">{collapsed ? <Plus size={14} /> : <Minus size={14} />}</i>
                          </button>
                          {!collapsed && <div className="shared-library-group-items" id={groupId}>
                            {group.assets.map((asset) => <button type="button" key={asset.id} className={asset.id === selectedSharedAsset?.id ? 'active' : ''} onClick={() => setSelectedSharedAssetId(asset.id)}>
                              <span><strong>{asset.name}</strong><small>{SHARED_LIBRARY_LABELS[asset.asset_type] || asset.asset_type} · v{asset.currentVersion?.version_number || '—'}</small></span>
                            </button>)}
                            {!group.assets.length && <p>{group.emptyMessage}</p>}
                          </div>}
                        </section>;
                      })}
                    </div>
                    <div className="shared-library-detail">
                      {selectedSharedAsset && (
                        <>
                          <figure className="shared-library-selected-preview">
                            <SharedLibraryThumbnail asset={selectedSharedAsset} version={selectedSharedVersion} />
                            <figcaption><strong>{selectedSharedAsset.name}</strong><span>{SHARED_LIBRARY_LABELS[selectedSharedAsset.asset_type] || selectedSharedAsset.asset_type} · selected version {selectedSharedVersion?.version_number || '—'}</span></figcaption>
                          </figure>
                          <div className="shared-library-meta">
                            <strong>{SHARED_LIBRARY_LABELS[selectedSharedAsset.asset_type] || selectedSharedAsset.asset_type}</strong>
                            <span>{sharedLibraryStats(selectedSharedAsset, selectedSharedVersion)}</span>
                            <span>Updated {selectedSharedAsset.updated_at ? new Date(selectedSharedAsset.updated_at).toLocaleDateString() : '—'}</span>
                          </div>
                          <form className="shared-library-edit-form" onSubmit={renameSharedAsset}>
                            <label>Name<input value={sharedEditForm.name} onChange={(event) => setSharedEditForm({ ...sharedEditForm, name: event.target.value })} required /></label>
                            <label>Description<textarea rows="2" value={sharedEditForm.description} onChange={(event) => setSharedEditForm({ ...sharedEditForm, description: event.target.value })} /></label>
                            <div className="shared-library-actions">
                              <button type="submit" disabled={busy}>Rename</button>
                              <button type="button" onClick={() => openSharedAssetInApp(selectedSharedAsset)}>Open in app</button>
                              <button type="button" className="profile-muted-action danger" onClick={() => archiveSharedAsset(selectedSharedAsset)} disabled={busy}>Archive</button>
                            </div>
                          </form>
                          <div className="shared-library-versions">
                            <h3>Versions</h3>
                            {!sharedVersions.length && <p>No versions found for this item.</p>}
                            <div className="shared-library-version-list">
                              {sharedVersions.map((version) => {
                                const isCurrent = version.id === selectedSharedAsset.current_version_id;
                                const isSelected = version.id === selectedSharedVersion?.id;
                                return (
                                  <button
                                    type="button"
                                    key={version.id}
                                    className={isSelected ? 'active' : ''}
                                    onClick={() => setSelectedSharedVersionId(version.id)}
                                  >
                                    <span><strong>Version {version.version_number}</strong>{isCurrent ? ' · current' : ''}</span>
                                    <small>{version.created_at ? new Date(version.created_at).toLocaleString() : ''}</small>
                                    {!isCurrent && <em onClick={(event) => { event.stopPropagation(); makeSharedVersionCurrent(version); }}>Make current</em>}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </section>
              <section className="profile-market-section profile-library-section profile-marketplace-section">
                <div className="profile-section-heading"><div><p className="landing-eyebrow">Storefront</p><h2>Registered listings</h2></div><span>{currentListings.length}</span></div>
                {!currentListings.length && <div className="marketplace-empty">Patterns you publish will appear here.</div>}
                <div className="profile-listing-grid">{currentListings.map((listing) => <article key={listing.id}><img src={listing.previewImage} alt="" /><div><strong>{listing.title}</strong><span>{listing.status} / {marketplaceMoney(listing.priceCents, listing.currency)} / {listing.salesCount} sales</span></div><button type="button" onClick={() => openListingEditor(listing)}>Edit details</button>{listing.status === 'published' && <button type="button" className="profile-muted-action" onClick={() => archiveListing(listing.id)} disabled={busy}>Archive</button>}</article>)}</div>
              </section>
            </div>

            <aside className="profile-form-sidebar" aria-label="Profile and listing forms">
              <section className="marketplace-panel profile-sidebar-panel profile-account-panel profile-account-only">
                <div><p className="landing-eyebrow">Signed in as</p><h2>Profile</h2></div>
                <div className="profile-user-summary"><span>{(user?.name || user?.email || 'U').slice(0, 1).toUpperCase()}</span><div><strong>{user?.name || 'Girih Studio user'}</strong><small>{user?.email || ''}</small></div></div>
                <p className="profile-account-status"><span className={accountPlanLabel === 'Paid' ? 'paid' : 'free'} /> <strong>{accountPlanLabel} account</strong></p>
                <small>Your identity and plan are shared across Girih Studio apps.</small>
              </section>
              <form className="marketplace-panel profile-sidebar-panel profile-account-only" onSubmit={saveProfile}>
                <div><p className="landing-eyebrow">Public details</p><h2>Profile</h2></div>
                <label>Display name<input value={form.publicName} onChange={(event) => setForm({ ...form, publicName: event.target.value })} required /></label>
                <label>Artist bio<textarea rows="3" value={form.bio} onChange={(event) => setForm({ ...form, bio: event.target.value })} /></label>
                <button disabled={busy}>Save profile</button>
              </form>
              <section className="marketplace-panel profile-sidebar-panel seller-payout-panel profile-account-only">
                <div><p className="landing-eyebrow">Payments</p><h2>Seller payouts</h2></div>
                {dashboard.profile.sellerReady ? (
                  <div className="seller-account-live"><p><span aria-hidden="true" /> Stripe is live</p><button type="button" onClick={openStripePayouts} disabled={busy}>Open payouts</button></div>
                ) : (
                  <><p>Connect Stripe before publishing patterns for sale.</p><button type="button" onClick={setupSeller} disabled={busy}>Set up payouts</button></>
                )}
              </section>
              <form className="marketplace-panel profile-sidebar-panel profile-sidebar-listing profile-marketplace-only" onSubmit={createListing}>
                <div><p className="landing-eyebrow">New listing</p><h2>Sell a model or sticker</h2></div>
                <label>Product type<select value={form.listingType} onChange={(event) => setForm({ ...form, listingType: event.target.value, category: event.target.value === 'sticker' ? 'Stickers' : form.category === 'Stickers' ? 'Mixed' : form.category })}><option value="model">Pattern model</option><option value="sticker">Surface sticker</option></select></label>
                {form.listingType === 'model' ? (
                  <label>Saved model<select value={form.modelId} onChange={(event) => setForm({ ...form, modelId: event.target.value })}>{!localModels.length && !cloudPatterns.length && <option value="">No saved models</option>}{cloudPatterns.map((pattern) => <option key={`cloud-${pattern.id}`} value={`cloud:${pattern.id}`}>{pattern.name} (profile)</option>)}{localModels.map((model) => <option key={`local-${model.id}`} value={`local:${model.id}`}>{model.name} (device)</option>)}</select></label>
                ) : (
                  <><label>Sticker PNG<input type="file" accept="image/png,.png" onChange={uploadMarketplaceSticker} /></label>{form.stickerDataUrl && <div className="marketplace-sticker-upload-preview"><img src={form.stickerDataUrl} alt="Sticker ready to publish" /><span>Transparent PNG ready</span></div>}</>
                )}
                <label>Listing title<input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required /></label>
                <div className="profile-sidebar-field-row">
                  <label>Category<select value={form.listingType === 'sticker' ? 'Stickers' : form.category} disabled={form.listingType === 'sticker'} onChange={(event) => setForm({ ...form, category: event.target.value })}>{[...MARKETPLACE_CATEGORIES.filter((item) => item !== 'Stickers'), ...(form.listingType === 'sticker' ? ['Stickers'] : ['Mixed'])].map((item) => <option key={item}>{item}</option>)}</select></label>
                  <label>Price (USD)<input type="number" min="1" step="0.5" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} required /></label>
                </div>
                <label>Description<textarea rows="3" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
                {listingStatus && <p className="marketplace-listing-inline-status" role="status">{listingStatus}</p>}
                <button disabled={busy || !dashboard.profile.sellerReady || (form.listingType === 'sticker' ? !form.stickerDataUrl : (!localModels.length && !cloudPatterns.length))}>Publish {form.listingType === 'sticker' ? 'sticker' : 'pattern'}</button>
              </form>
            </aside>
          </div>
          <section className={`profile-market-section profile-library-section profile-archived-section ${profileTab === 'marketplace' ? '' : 'profile-tab-hidden'}`}>
            <div className="profile-section-heading"><div><p className="landing-eyebrow">Archive</p><h2>Archived models</h2></div><span>{archivedListings.length}</span></div>
            {!archivedListings.length && <div className="marketplace-empty">Archived marketplace models will appear here.</div>}
            <div className="profile-listing-grid">{archivedListings.map((listing) => <article key={listing.id}><img src={listing.previewImage} alt="" /><div><strong>{listing.title}</strong><span>Archived / {marketplaceMoney(listing.priceCents, listing.currency)} / {listing.salesCount} sales</span></div><button type="button" onClick={() => openListingEditor(listing)}>Edit details</button></article>)}</div>
          </section>
          {editingListing && <div className="marketplace-edit-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) setEditingListing(null); }}>
            <form className="marketplace-panel marketplace-edit-dialog" onSubmit={saveListingEdits}>
              <div className="marketplace-edit-heading"><div><p className="landing-eyebrow">Marketplace listing</p><h2>Edit details</h2></div><button type="button" aria-label="Close listing editor" onClick={() => setEditingListing(null)}><X size={16} /></button></div>
              <div className="marketplace-edit-preview"><img src={editingListing.previewImage} alt="" /><span>The registered model and preview stay unchanged.</span></div>
              <label>Listing title<input value={listingEditForm.title} onChange={(event) => setListingEditForm({ ...listingEditForm, title: event.target.value })} required /></label>
              <div className="profile-sidebar-field-row">
                <label>Category<select value={listingEditForm.category} disabled={editingListing.category === 'Stickers'} onChange={(event) => setListingEditForm({ ...listingEditForm, category: event.target.value })}>{(editingListing.category === 'Stickers' ? ['Stickers'] : [...MARKETPLACE_CATEGORIES.filter((item) => item !== 'Stickers'), 'Mixed']).map((item) => <option key={item}>{item}</option>)}</select></label>
                <label>Price (USD)<input type="number" min="1" max="100000" step="0.5" value={listingEditForm.price} onChange={(event) => setListingEditForm({ ...listingEditForm, price: event.target.value })} required /></label>
              </div>
              <label>Description<textarea rows="4" maxLength="2000" value={listingEditForm.description} onChange={(event) => setListingEditForm({ ...listingEditForm, description: event.target.value })} /></label>
              <div className="marketplace-edit-actions"><button type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save changes'}</button><button type="button" className="profile-muted-action" onClick={() => setEditingListing(null)}>Cancel</button></div>
            </form>
          </div>}
        </>}
      </main>
    </div>
  );
}

function InfoPage({ type }) {
  const [contactStatus, setContactStatus] = useState({ state: 'idle', message: '' });
  const isContact = type === 'contact';
  const supportArticles = [
    {
      category: 'Getting started',
      title: 'Make your first Girih pattern',
      summary: 'Choose a puzzle set, place pieces, snap edges, and navigate the stage.',
      steps: [
        'Open Piece Library and expand one of the available puzzle sets.',
        'Click a piece to add it near the center of the stage. On mobile, open Shapes and tap a piece.',
        'Drag the piece toward another piece. Keep the Magnet toggle on to snap compatible edges together.',
        'Click an individual piece to select it. Use Ctrl or Command while clicking to add or remove pieces from the selection.',
        'Use Top view for precise composition and an isometric view to inspect depth and material.',
      ],
      tip: 'Start from a Shamseh or another central star, then build outward in repeating rings.',
    },
    {
      category: 'Getting started',
      title: 'Rebuild a pattern from a template',
      summary: 'Open a reference image for the active puzzle set and reproduce it on the stage.',
      steps: [
        'Open the template button beside a puzzle-set name in Piece Library.',
        'Choose a template from the list. Its large preview opens in the right panel.',
        'Close the panel to keep a smaller reference preview over the stage.',
        'Pan or zoom the template preview, then place matching pieces on the stage.',
        'Close the floating preview when the pattern is complete.',
      ],
      tip: 'Templates are part of paid access and only show for their correct puzzle set.',
    },
    {
      category: 'Getting started',
      title: 'Select, move, and transform pieces',
      summary: 'Work with one piece, several pieces, or a permanent group.',
      steps: [
        'Click a piece to select it, Ctrl or Command-click to build a multi-selection, or drag a blue selection window in desktop Top view.',
        'Drag any selected piece to move the complete selection together.',
        'Use the arrow keys for precise movement and Delete or Backspace to remove the selection.',
        'Enter position, rotation, or scale values in Model Transformation for exact changes.',
        'Keep aspect ratio enabled when you want all scale axes to change together.',
      ],
      tip: 'On mobile Top view, use one-finger placement and normal pinch or pan gestures for navigation.',
    },
    {
      category: 'Color and appearance',
      title: 'Edit pattern colors',
      summary: 'Change individual instances without altering the source piece for every user.',
      steps: [
        'Select a piece and open its context menu with right-click, or long-press it on mobile.',
        'Choose Instance color and select the new color.',
        'For several pieces, keep them selected before opening the context menu.',
        'Repeat colors across related shapes to establish a clear visual hierarchy.',
        'Preview the result in 2D and 3D materials before export.',
      ],
      tip: 'Instance colors are stored with saved models and motifs, so later Back stage defaults do not disturb the design.',
    },
    {
      category: 'Color and appearance',
      title: 'Create and reuse a color palette',
      summary: 'Build a consistent set of colors for a puzzle family and reuse it in future patterns.',
      steps: [
        'Open Back stage. This area is available to paid users and administrators.',
        'Set the inline color for each shape in the selected puzzle group.',
        'Use a limited set of repeated colors for the main field, accents, and negative-space pieces.',
        'Save the group palette when palette controls are available for your account.',
        'Apply the palette before placing new pieces, then adjust individual instances when needed.',
      ],
      tip: 'A useful starting palette has one dominant color, one neutral, and one bright accent for Shamseh pieces.',
    },
    {
      category: 'Composition tools',
      title: 'Group pieces as one object',
      summary: 'Turn a selection into a unit that moves, copies, mirrors, and transforms together.',
      steps: [
        'Select at least two pieces with Ctrl or Command-click or the desktop selection window.',
        'Right-click any piece already in the selection. The full selection remains active.',
        'Choose Group selection. A single collective selection boundary remains visible.',
        'Move, copy, paste, scale, or mirror the grouped composition as one object.',
        'Right-click the group and choose Ungroup when individual editing is needed again.',
      ],
      tip: 'Grouping preserves every piece and its properties; it does not merge the underlying geometry.',
    },
    {
      category: 'Composition tools',
      title: 'Save a reusable motif',
      summary: 'Store a selected arrangement as a repeatable building block.',
      steps: [
        'Select the pieces that form one complete repeat unit.',
        'Group them first if you want the motif to remain easy to move as one object.',
        'Open Motif and choose Save selection as motif.',
        'Give the motif a clear name that describes its family or repeat direction.',
        'Load or add the saved motif later; its positions, colors, dimensions, and piece properties are retained.',
      ],
      tip: 'Choose the smallest complete repeat unit. Smaller motifs tessellate faster and produce fewer duplicate pieces.',
    },
    {
      category: 'Composition tools',
      title: 'Tessellate a motif',
      summary: 'Repeat a saved motif horizontally and vertically to build a larger field.',
      steps: [
        'Create or load a motif and select it in the Motif section.',
        'Set the number of rows and columns.',
        'Adjust horizontal and vertical gaps until neighboring edges meet correctly.',
        'Generate the tessellation and inspect the repeat in Top view.',
        'Group or frame the result before saving and exporting the finished field.',
      ],
      tip: 'Test a 2 by 2 repeat first. It exposes spacing or rotation errors before a large tessellation is generated.',
    },
    {
      category: 'Composition tools',
      title: 'Frame and crop a design',
      summary: 'Draw a closed boundary through selected piece centers and trim the pattern to it.',
      steps: [
        'Switch to Top view and select the pieces that may be cut by the frame.',
        'Activate Frame. Click piece centers in the order required for the boundary.',
        'Click the first piece again to close the polyline loop.',
        'Review the preview line, then confirm the frame operation.',
        'Pieces crossing the boundary are sliced, inside geometry is kept, and outside geometry is removed.',
      ],
      tip: 'Use a simple clockwise or counter-clockwise route without crossing the boundary over itself.',
    },
    {
      category: 'Save and continue',
      title: 'Save a complete model for later',
      summary: 'Store the whole stage and restore its exact design properties in another session.',
      steps: [
        'Finish the arrangement and confirm its colors, groups, dimensions, and transforms.',
        'Open Models and choose Save model.',
        'Name the model clearly, then confirm the save.',
        'Use Load to replace the current stage with the saved model, or Add to insert it into the current stage.',
        'Save important work periodically and export a separate deliverable as a backup.',
      ],
      tip: 'Saved models retain instance properties instead of re-reading changed source dimensions or colors from Back stage.',
    },
    {
      category: 'Export and print',
      title: 'Export a clean 2D design',
      summary: 'Create flat artwork, transparent graphics, vectors, paper-cut gaps, pencil shading, or hatching.',
      steps: [
        'Select Export in the top bar, then choose 2D.',
        'Choose the output format and a graphical style: Standard, Color pencil, Paper cut, or 45-degree hatch.',
        'Adjust contextual controls such as edge color, pencil intensity, polygon offset, hatch spacing, or outline width.',
        'Set paper size, orientation, and transparent background where supported.',
        'Check the live preview, then choose Export or Print.',
      ],
      tip: 'Use PNG for images, SVG or EPS for scalable artwork, and DXF for line-based fabrication workflows.',
    },
    {
      category: 'Export and print',
      title: 'Prepare files for laser cutting or CNC',
      summary: 'Export closed, fabrication-friendly paths and verify them before production.',
      steps: [
        'Use Top view and inspect the outer boundary, framed cuts, and any internal openings.',
        'Open Export, choose 2D, and select SVG, EPS, or DXF according to the machine software.',
        'Use Standard style for clean paths. Avoid decorative pencil or hatch styles for cutting.',
        'Import the file into the machine software and confirm document units, scale, duplicate paths, and closed loops.',
        'Run a small material test before producing the full design.',
      ],
      tip: 'SVG and EPS suit laser and vector software; DXF is often the most direct option for CNC/CAD workflows.',
    },
    {
      category: 'Export and print',
      title: 'Export a 3D view or printable model',
      summary: 'Choose material, camera, lighting, and a practical 3D output.',
      steps: [
        'Open Export and choose 3D.',
        'Select Plastic or Glass, choose a camera view, and enable Shadow when a floor is included.',
        'Use the preview to confirm framing, transparency, reflections, color, and orientation.',
        'Choose PNG for a rendered view or STL for a 3D-printing workflow.',
        'Open STL files in slicer software and verify physical dimensions, manifold geometry, layer height, and supports.',
      ],
      tip: 'Transparent background removes the stage and therefore cannot retain floor shadows or reflections.',
    },
    {
      category: 'Export and print',
      title: 'Create and export a camera video',
      summary: 'Preview a preset camera move and export it as an MP4 clip.',
      steps: [
        'Use the Play control and choose a camera preset from the menu beneath it.',
        'Play the movement and watch the orange progress fill on the control.',
        'Open Export, choose 3D, and select the video output and the same camera preset.',
        'Keep the browser tab active while frames are rendered and encoded.',
        'Review the MP4 after export to confirm motion, framing, and quality.',
      ],
      tip: 'Video export works best in a current Chrome, Edge, or Safari version with WebCodecs support.',
    },
    {
      category: 'Plans and access',
      title: 'Free and Paid features',
      summary: 'Compare the tools, puzzle libraries, templates, saving options, and exports included with each account.',
      freeFeatures: [
        'Access to the complete 10 Tond puzzle-piece library.',
        'Add, select, move, rotate, and delete individual pieces on the stage.',
        'Change the color of each placed piece instance.',
        'Use snapping, Top view, isometric views, camera navigation, undo, and redo.',
        'Use Model Transformation on the active selection.',
        'Export standard PNG and 2D Color PNG.',
        'Preview and print the available output from the export dialog.',
        'Use day and night interface modes.',
      ],
      paidFeatures: [
        'Everything included with Free access.',
        'All four puzzle families: 10 Tond, 10 Kond, 8 Morocco, and 8 Persian.',
        'The full pattern-template collection for every puzzle family.',
        'Multi-piece grouping, ungrouping, copying, pasting, and group mirroring.',
        'Save and load complete models with their exact colors, dimensions, groups, and transforms.',
        'Save selections as reusable motifs and generate horizontal or vertical tessellations.',
        'Frame and crop patterns by drawing a closed boundary through the design.',
        'Full Back stage access for piece colors, heights, dimensions, visibility, and group controls.',
        'All 2D graphical styles, including pencil, paper cut, and 45-degree hatch.',
        'Full PNG, SVG, EPS, DXF, PDF, fabrication, 3D, and supported MP4 export options.',
        'Plastic and Glass 3D materials, camera presets, shadows, transparent backgrounds, and advanced print preparation.',
      ],
      tip: 'After Stripe confirms a subscription, Paid access activates automatically. Use the Billing button in your profile to manage the subscription.',
    },
  ];
  const supportCategories = [...new Set(supportArticles.map((article) => article.category))];

  useEffect(() => {
    if (isContact || !window.location.hash) return undefined;
    const revealArticle = () => {
      const target = document.getElementById(window.location.hash.slice(1));
      if (!target) return;
      if (target.tagName === 'DETAILS') target.open = true;
      target.scrollIntoView({ block: 'start' });
    };
    const frame = window.requestAnimationFrame(revealArticle);
    window.addEventListener('hashchange', revealArticle);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('hashchange', revealArticle);
    };
  }, [isContact]);

  async function submitContact(event) {
    event.preventDefault();
    setContactStatus({ state: 'sending', message: '' });
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries());
    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Your message could not be sent.');
      form.reset();
      setContactStatus({ state: 'sent', message: 'Thank you. Your message has been sent.' });
    } catch (error) {
      setContactStatus({ state: 'error', message: error.message || 'Your message could not be sent.' });
    }
  }

  return (
    <div className="landing-page info-page">
      <header className="info-page-nav">
        <a className="landing-brand" href="/" aria-label="Girih Studio home">
          <img className="landing-brand-logo" src="/landing/brand/girih-logo-color.png" alt="" aria-hidden="true" />
          <span>Girih Studio</span>
        </a>
        <div className="info-page-nav-actions"><girih-app-switcher current-app="girih" compact></girih-app-switcher></div>
      </header>
      <main className="info-page-main">
        <div className="info-page-heading">
          <p className="landing-eyebrow">{isContact ? 'Contact Girih Studio' : 'Girih Studio Support'}</p>
          <h1>{isContact ? 'Let’s talk about your pattern project.' : 'Help for every stage of the pattern.'}</h1>
          <p>{isContact
            ? 'Send a message about the app, education, licensing, fabrication, or collaboration.'
            : 'Practical, step-by-step guides for composing, editing, repeating, saving, printing, and fabricating Girih patterns.'}</p>
        </div>
        {isContact ? (
          <form className="contact-form" onSubmit={submitContact}>
            <label>Name<input name="name" type="text" autoComplete="name" maxLength="120" required /></label>
            <label>Email<input name="email" type="email" autoComplete="email" maxLength="320" required /></label>
            <label className="contact-form-wide">Subject<input name="subject" type="text" maxLength="160" required /></label>
            <label className="contact-form-wide">Message<textarea name="message" rows="7" minLength="10" maxLength="5000" required /></label>
            <label className="contact-form-trap" aria-hidden="true">Website<input name="website" type="text" tabIndex="-1" autoComplete="off" /></label>
            <div className="contact-form-footer contact-form-wide">
              <button type="submit" disabled={contactStatus.state === 'sending'}>
                {contactStatus.state === 'sending' ? 'Sending…' : 'Send message'} <ArrowRight size={15} />
              </button>
              {contactStatus.message && <p className={`contact-form-status ${contactStatus.state}`}>{contactStatus.message}</p>}
            </div>
          </form>
        ) : (
          <div className="support-library">
            <nav className="support-category-nav" aria-label="Support categories">
              {supportCategories.map((category) => <a key={category} href={`#support-${slugify(category)}`}>{category}</a>)}
            </nav>
            {supportCategories.map((category) => (
              <section className="support-category" id={`support-${slugify(category)}`} key={category}>
                <div className="support-category-heading">
                  <span>{String(supportCategories.indexOf(category) + 1).padStart(2, '0')}</span>
                  <h2>{category}</h2>
                </div>
                <div className="support-article-list">
                  {supportArticles.filter((article) => article.category === category).map((article) => (
                    <details className="support-article" id={`article-${slugify(article.title)}`} key={article.title}>
                      <summary>
                        <span><strong>{article.title}</strong><small>{article.summary}</small></span>
                        <Plus size={18} aria-hidden="true" />
                      </summary>
                      <div className="support-article-body">
                        {article.steps && <ol>{article.steps.map((step) => <li key={step}>{step}</li>)}</ol>}
                        {article.freeFeatures && article.paidFeatures && (
                          <div className="support-plan-comparison">
                            <section>
                              <h3>Free</h3>
                              <ul>{article.freeFeatures.map((feature) => <li key={feature}>{feature}</li>)}</ul>
                            </section>
                            <section className="paid">
                              <h3>Paid</h3>
                              <ul>{article.paidFeatures.map((feature) => <li key={feature}>{feature}</li>)}</ul>
                            </section>
                          </div>
                        )}
                        <p><strong>Tip:</strong> {article.tip}</p>
                      </div>
                    </details>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
        <a className="info-page-back" href="/">Back to Girih Studio</a>
      </main>
      <footer className="info-page-footer">
        <span>Girih Studio</span>
        <nav aria-label="Footer navigation">
          <a href="/contact">Contact</a>
          <a href="/support">Support</a>
        </nav>
      </footer>
    </div>
  );
}

function LoginScreen({
  ready,
  configured,
  mode,
  name,
  email,
  password,
  error,
  message,
  busy,
  onModeChange,
  onNameChange,
  onEmailChange,
  onPasswordChange,
  onSubmit,
  onGoogleLogin,
}) {
  const signingUp = mode === 'signup';
  const loginParams = new URLSearchParams(window.location.search);
  const nextApp = loginParams.get('nextApp') || '';
  const nextPath = loginParams.get('next') || '';
  let targetAppId = nextPath.startsWith('/training') ? 'academy' : 'girih';
  try {
    const host = new URL(nextApp).hostname;
    if (host.startsWith('bricks.')) targetAppId = 'bricks';
    else if (host.startsWith('muqarnas.')) targetAppId = 'muqarnas';
    else if (host.startsWith('mehraz.')) targetAppId = 'mehraz';
  } catch {}
  const targetApp = GIRIH_APPS.find((app) => app.id === targetAppId) || GIRIH_APPS[0];
  return (
    <main className={`login-shell girih-theme-${targetAppId}`}>
      <form className="login-card" onSubmit={onSubmit}>
        <div className="login-brand">
          <img src="/landing/brand/girih-logo-color.png" alt="" aria-hidden="true" />
          <div>
            <h1>Girih Studio</h1>
            <p>{signingUp ? 'Create your global puzzle account.' : 'Sign in to open your puzzle workspace.'}</p>
          </div>
        </div>
        <div className="login-product"><girih-app-icon app={targetAppId}></girih-app-icon><span><small>Continue to</small><strong>{targetApp.shortName}</strong></span></div>
        <div className="login-mode-switch" role="tablist" aria-label="Account action">
          <button type="button" className={!signingUp ? 'active' : ''} onClick={() => onModeChange('login')}>Log in</button>
          <button type="button" className={signingUp ? 'active' : ''} onClick={() => onModeChange('signup')}>Create account</button>
        </div>
        <button type="button" className="google-auth-button" disabled={!ready || !configured || busy} onClick={onGoogleLogin}>
          <span aria-hidden="true">G</span>
          Continue with Google
        </button>
        <div className="login-divider"><span>or use email</span></div>
        {signingUp && (
          <label>
            Name
            <input type="text" value={name} onChange={(event) => onNameChange(event.target.value)} placeholder="Your name" autoComplete="name" />
          </label>
        )}
        <label>
          Email
          <input type="email" value={email} onChange={(event) => onEmailChange(event.target.value)} placeholder="you@example.com" autoComplete="email" />
        </label>
        <label>
          Password
          <input
            type="password"
            minLength="8"
            value={password}
            onChange={(event) => onPasswordChange(event.target.value)}
            placeholder="At least 8 characters"
            autoComplete={signingUp ? 'new-password' : 'current-password'}
          />
        </label>
        {error && <div className="login-error">{error}</div>}
        {message && <div className="login-message">{message}</div>}
        {!configured && <div className="login-error">Global login needs Supabase environment variables before it can be used.</div>}
        <button type="submit" disabled={!ready || !configured || busy}>
          <User size={16} /> {busy ? 'Please wait...' : signingUp ? 'Create account' : 'Log in'}
        </button>
        <div className="login-help">Accounts start with free access. Paid access activates automatically after Stripe Checkout confirms the subscription.</div>
      </form>
    </main>
  );
}

function AdminPieceEditor({ draft, onDraftChange, onDimensionChange, onSubmit, onCancel }) {
  const hasSourceDimensions = draft.objText || draft.glbDataUrl || draft.glbUrl || draft.sourceHeightPx;
  return (
    <form onSubmit={onSubmit} className="admin-form admin-inline-form">
      <label>
        Color
        <input
          type="color"
          value={draft.color}
          onChange={(event) => onDraftChange({ ...draft, color: event.target.value })}
        />
      </label>
      {hasSourceDimensions && (
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={draft.keepAspectRatio !== false}
            onChange={(event) => onDraftChange({ ...draft, keepAspectRatio: event.target.checked })}
          />
          <span>Keep aspect ratio when height changes</span>
        </label>
      )}
      {hasSourceDimensions && (
        <div className="dimension-readout">
          <span>Original size</span>
          <strong>W {formatDimensionLabel(draft.sourceWidthPx)}</strong>
          <strong>L {formatDimensionLabel(draft.sourceLengthPx)}</strong>
          <strong>H {formatDimensionLabel(draft.sourceHeightPx)}</strong>
        </div>
      )}
      <div className="dimension-grid">
        <label>
          Stage width
          <input
            type="number"
            min="0.01"
            step="0.001"
            value={draft.stageWidth}
            onChange={(event) => onDimensionChange('stageWidth', event.target.value)}
          />
        </label>
        <label>
          Stage length
          <input
            type="number"
            min="0.01"
            step="0.001"
            value={draft.stageLength}
            onChange={(event) => onDimensionChange('stageLength', event.target.value)}
          />
        </label>
        <label>
          Stage height
          <input
            type="number"
            min="0.01"
            step="0.001"
            value={draft.height}
            onChange={(event) => onDimensionChange('height', event.target.value)}
          />
        </label>
      </div>
      <div className="action-row">
        <button type="submit">
          <Save size={16} /> Update
        </button>
        <button type="button" className="secondary-button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function GroupPaletteList({ group, palettes, selectedPaletteId, onSelect, onDelete }) {
  if (!palettes.length) {
    return <div className="admin-palette-empty">No saved palettes yet.</div>;
  }
  return (
    <div className="admin-palette-list">
      {palettes.map((palette) => {
        const active = selectedPaletteId === palette.id;
        return (
          <div className={`admin-palette-row ${active ? 'active' : ''}`} key={palette.id}>
            <button type="button" className="admin-palette-preview" onClick={() => onSelect(palette.id)}>
              <strong>{palette.name}</strong>
              <span className="admin-palette-swatches">
                {group.items.map((piece) => (
                  <i key={piece.id} style={{ background: palette.colors[piece.id] || piece.color }} title={piece.name} />
                ))}
              </span>
            </button>
            {!palette.builtIn && (
              <button
                type="button"
                className="admin-palette-delete"
                aria-label={`Delete ${palette.name}`}
                onClick={() => onDelete(palette.id)}
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ModelTransformControls({ modelTransform, keepAspectRatio, onKeepAspectRatioChange, onChange, disabled = false }) {
  const scaleFields = MODEL_TRANSFORM_FIELDS.filter((field) => field.id.startsWith('scale'));
  const rotationFields = MODEL_TRANSFORM_FIELDS.filter((field) => field.id.startsWith('rotation'));
  const positionFields = MODEL_TRANSFORM_FIELDS.filter((field) => field.id.startsWith('position'));
  return (
    <>
      <label className="checkbox-field transform-aspect-field">
        <input
          type="checkbox"
          checked={keepAspectRatio}
          onChange={(event) => onKeepAspectRatioChange(event.target.checked)}
        />
        <span>Keep aspect ratio</span>
      </label>
      <div className="transform-row">
        <span>Scale</span>
        {scaleFields.map((field) => (
          <TransformInput key={field.id} field={field} modelTransform={modelTransform} onChange={onChange} disabled={disabled} />
        ))}
      </div>
      <div className="transform-row">
        <span>Rotation</span>
        {rotationFields.map((field) => (
          <TransformInput key={field.id} field={field} modelTransform={modelTransform} onChange={onChange} disabled={disabled} />
        ))}
      </div>
      <div className="transform-row">
        <span>Position</span>
        {positionFields.map((field) => (
          <TransformInput key={field.id} field={field} modelTransform={modelTransform} onChange={onChange} disabled={disabled} />
        ))}
      </div>
      {disabled && <div className="field-note">Select one item or a group to transform.</div>}
    </>
  );
}

function CollapsibleControlGroup({ title, collapsed, onToggle, children }) {
  return (
    <div className="control-group">
      <button type="button" className="control-group-toggle" onClick={onToggle}>
        <span>{title}</span>
        <span aria-hidden="true">{collapsed ? '+' : '-'}</span>
      </button>
      {!collapsed && <div className="control-group-items">{children}</div>}
    </div>
  );
}

function TransformInput({ field, modelTransform, onChange, disabled = false }) {
  return (
    <label className="transform-field">
      {field.label.replace(/^(Scale|Rotate|Position) /, '')}
      <input
        type="number"
        min={field.min}
        step={field.step}
        value={modelTransform[field.id]}
        onChange={(event) => onChange(field.id, event.target.value)}
        disabled={disabled}
      />
    </label>
  );
}

function useStageHistory(initialPresent) {
  const [history, setHistory] = useState({
    past: [],
    present: initialPresent,
    future: [],
  });

  function commitPlaced(updater, beforeUpdater) {
    setHistory((current) => {
      const before = beforeUpdater ? beforeUpdater(current.present) : current.present;
      const next = updater(current.present);
      if (placedSnapshotsEqual(before, next)) {
        return placedSnapshotsEqual(current.present, next) ? current : { ...current, present: next };
      }
      return {
        past: [...current.past, before].slice(-HISTORY_LIMIT),
        present: next,
        future: [],
      };
    });
  }

  function replacePlaced(updater) {
    setHistory((current) => {
      const next = updater(current.present);
      return placedSnapshotsEqual(current.present, next) ? current : { ...current, present: next };
    });
  }

  function undoStage() {
    setHistory((current) => {
      if (!current.past.length) return current;
      const present = current.past[current.past.length - 1];
      return {
        past: current.past.slice(0, -1),
        present,
        future: [current.present, ...current.future].slice(0, HISTORY_LIMIT),
      };
    });
  }

  function redoStage() {
    setHistory((current) => {
      if (!current.future.length) return current;
      const present = current.future[0];
      return {
        past: [...current.past, current.present].slice(-HISTORY_LIMIT),
        present,
        future: current.future.slice(1),
      };
    });
  }

  return {
    placed: history.present,
    commitPlaced,
    replacePlaced,
    undoStage,
    redoStage,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  };
}

function placedSnapshotsEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function applyLibraryPieceToInstance(piece, instance) {
  return {
    ...instance,
    ...piece,
    id: instance.id,
    sourceId: piece.id,
    x: instance.x,
    y: instance.y,
    rotation: instance.rotation,
    mirrorHorizontal: !!instance.mirrorHorizontal,
    mirrorVertical: !!instance.mirrorVertical,
    hidden: !!instance.hidden,
    groupInstanceId: instance.groupInstanceId || null,
    snappedTo: instance.snappedTo,
  };
}

const PIECE_GEOMETRY_SIGNATURE_CACHE = new WeakMap();

function pieceGeometrySignature(piece) {
  if (piece && typeof piece === 'object') {
    const cached = PIECE_GEOMETRY_SIGNATURE_CACHE.get(piece);
    if (cached) return cached;
  }
  const signature = JSON.stringify({
    type: piece.type || 'shape',
    isFrameSlice: !!piece.isFrameSlice,
    height: Number(piece.height) || 0.18,
    stageWidth: Number(piece.stageWidth) || null,
    stageLength: Number(piece.stageLength) || null,
    mirrorHorizontal: !!piece.mirrorHorizontal,
    mirrorVertical: !!piece.mirrorVertical,
    keepAspectRatio: piece.keepAspectRatio !== false,
    sourceHeightPx: Number(piece.sourceHeightPx) || null,
    sourceWidthPx: Number(piece.sourceWidthPx) || null,
    sourceLengthPx: Number(piece.sourceLengthPx) || null,
    sourceFootprintScale: Number(piece.sourceFootprintScale) || null,
    points: piece.points || [],
    snapEdges: piece.snapEdges || [],
    verticalEdges: piece.verticalEdges || [],
    displayEdges: piece.displayEdges || [],
    objText: piece.objText || '',
    glbDataUrl: piece.glbDataUrl || '',
    glbUrl: piece.glbUrl || '',
    surfaceStickerUvTransform: piece.surfaceStickerUvTransform || null,
  });
  if (piece && typeof piece === 'object') PIECE_GEOMETRY_SIGNATURE_CACHE.set(piece, signature);
  return signature;
}

function GirihStage({
  placed,
  selectedId,
  selectedIds,
  activeGroupId,
  material,
  glassSettings,
  style,
  cameraMode,
  backgroundColor,
  edgeColor,
  edgeThickness,
  edgeMode,
  edgeOffsetCount,
  edgeOffsetDistance,
  liveShadowsEnabled,
  modelTransform,
  mobileViewport,
  cameraVideoPlaying,
  cameraVideoPreset,
  cameraVideoDurationMs,
  cameraVideoProgressRef,
  frameMode,
  framePoints,
  onSelect,
  onToggleSelect,
  onFramePick,
  onSelectionChange,
  onMove,
  onSettle,
  onSettleSelection,
  onRotate,
  onContextMenu,
  onViewBoundsChange,
  onCameraChange,
  onCameraVideoProgress,
  onCameraVideoEnd,
}) {
  const mountRef = useRef(null);
  const [selectionBox, setSelectionBox] = useState(null);
  const stateRef = useRef({
    placed,
    selectedId,
    selectedIds,
    activeGroupId,
    material,
    glassSettings,
    style,
    cameraMode,
    backgroundColor,
    edgeColor,
    edgeThickness,
    edgeMode,
    edgeOffsetCount,
    edgeOffsetDistance,
    liveShadowsEnabled,
    modelTransform,
    mobileViewport,
    cameraVideoPlaying,
    cameraVideoPreset,
    cameraVideoDurationMs,
    cameraVideoProgressRef,
    frameMode,
    framePoints,
    onSelect,
    onToggleSelect,
    onFramePick,
    onSelectionChange,
    onMove,
    onSettle,
    onSettleSelection,
    onRotate,
    onContextMenu,
    onViewBoundsChange,
    onCameraChange,
    onCameraVideoProgress,
    onCameraVideoEnd,
  });
  const rendererRef = useRef(null);
  const stageSyncDirtyRef = useRef(true);

  useEffect(() => {
    stateRef.current = {
      placed,
      selectedId,
      selectedIds,
      activeGroupId,
      material,
      glassSettings,
      style,
      cameraMode,
      backgroundColor,
      edgeColor,
      edgeThickness,
      edgeMode,
      edgeOffsetCount,
      edgeOffsetDistance,
      liveShadowsEnabled,
      modelTransform,
      mobileViewport,
      cameraVideoPlaying,
      cameraVideoPreset,
      cameraVideoDurationMs,
      cameraVideoProgressRef,
      frameMode,
      framePoints,
      onSelect,
      onToggleSelect,
      onFramePick,
      onSelectionChange,
      onMove,
      onSettle,
      onSettleSelection,
      onRotate,
      onContextMenu,
      onViewBoundsChange,
      onCameraChange,
      onCameraVideoProgress,
      onCameraVideoEnd,
    };
  });

  useEffect(() => {
    stageSyncDirtyRef.current = true;
  }, [placed, selectedId, selectedIds, activeGroupId, material, glassSettings, style, edgeColor, edgeThickness, edgeMode, edgeOffsetCount, edgeOffsetDistance, liveShadowsEnabled, modelTransform, mobileViewport, frameMode, framePoints]);

  useEffect(() => {
    const mount = mountRef.current;
    const scene = new THREE.Scene();
    const initialBackground = normalizeHexColor(stateRef.current.backgroundColor, DEFAULT_RENDER_SETTINGS.backgroundColor);
    scene.background = new THREE.Color(initialBackground);

    const perspectiveCamera = new THREE.PerspectiveCamera(42, mount.clientWidth / mount.clientHeight, 0.1, 100);
    const paperCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    let camera = perspectiveCamera;

    function updatePaperCameraProjection() {
      const aspect = mount.clientWidth / Math.max(mount.clientHeight, 1);
      const halfHeight = PAPER_STAGE_ORTHO_HEIGHT / 2;
      const halfWidth = halfHeight * aspect;
      paperCamera.left = -halfWidth;
      paperCamera.right = halfWidth;
      paperCamera.top = halfHeight;
      paperCamera.bottom = -halfHeight;
      paperCamera.updateProjectionMatrix();
    }
    updatePaperCameraProjection();

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    let rendererPixelRatio = Math.min(window.devicePixelRatio, 2);
    let rendererUsingExportSize = false;
    renderer.setPixelRatio(rendererPixelRatio);
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setClearColor(initialBackground, 1);
    renderer.shadowMap.enabled = !!stateRef.current.liveShadowsEnabled;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.toneMappingExposure = 1;
    if ('physicallyCorrectLights' in renderer) renderer.physicallyCorrectLights = false;
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    let pmremGenerator = null;
    let hdrEnvironmentTarget = null;
    let hdrLoadStarted = false;
    let stageDisposed = false;

    function ensureGlassEnvironment() {
      if (hdrLoadStarted || hdrEnvironmentTarget || stageDisposed) return;
      hdrLoadStarted = true;
      pmremGenerator = new THREE.PMREMGenerator(renderer);
      pmremGenerator.compileEquirectangularShader();
      new RGBELoader().load(
        GLASS_HDR_ENVIRONMENT_URL,
        (texture) => {
          if (stageDisposed) {
            texture.dispose();
            pmremGenerator?.dispose();
            pmremGenerator = null;
            return;
          }
          texture.mapping = THREE.EquirectangularReflectionMapping;
          hdrEnvironmentTarget = pmremGenerator.fromEquirectangular(texture);
          texture.dispose();
          pmremGenerator.dispose();
          pmremGenerator = null;
          scene.environment = normalizeMaterialName(stateRef.current.material) === 'glass' ? hdrEnvironmentTarget.texture : null;
          stageSyncDirtyRef.current = true;
        },
        undefined,
        (error) => {
          pmremGenerator?.dispose();
          pmremGenerator = null;
          console.warn('The architectural glass HDR environment could not be loaded.', error);
        },
      );
    }

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 3;
    controls.maxDistance = 18;
    controls.maxPolarAngle = Math.PI * 0.47;
    controls.target.set(0, 0, 0);
    const cameraView = { mode: null };
    const cameraOrbit = { startTime: null, completed: false, lastReportedProgress: -1 };

    function applyStageCameraView(mode, force = false, orthographic = false) {
      if (!force && cameraView.mode === mode && cameraView.orthographic === orthographic) return;
      cameraView.mode = mode;
      cameraView.orthographic = orthographic;
      camera = orthographic ? paperCamera : perspectiveCamera;
      controls.object = camera;
      const view = getStageCameraView(mode);
      controls.target.set(0, 0, 0);
      camera.up.set(...view.up);
      camera.position.set(...view.position);
      const lockMobileTopView = stateRef.current.mobileViewport && mode === 'top';
      controls.enabled = true;
      controls.enableRotate = !lockMobileTopView && !view.lockRotate;
      controls.enablePan = true;
      controls.enableZoom = true;
      controls.touches.ONE = lockMobileTopView ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE;
      controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
      controls.minDistance = view.lockRotate ? 4 : 3;
      controls.maxDistance = view.lockRotate ? 80 : 24;
      controls.minZoom = 0.08;
      controls.maxZoom = 6;
      controls.maxPolarAngle = Math.PI;
      camera.lookAt(controls.target);
      camera.updateProjectionMatrix();
      controls.update();
    }

    applyStageCameraView(stateRef.current.cameraMode || 'top', true);

    function cameraOrbitTarget() {
      const bounds = getPiecesWorldBounds(stateRef.current.placed);
      if (!bounds) {
        return {
          center: new THREE.Vector3(0, 0.1, 0),
          radius: 8,
        };
      }
      const width = Math.max(0.001, bounds.maxX - bounds.minX);
      const depth = Math.max(0.001, bounds.maxY - bounds.minY);
      const targetHeight = Math.max(0.08, (bounds.top || 0.1) * 0.35);
      return {
        center: new THREE.Vector3((bounds.minX + bounds.maxX) / 2, targetHeight, (bounds.minY + bounds.maxY) / 2),
        radius: Math.max(width, depth, 3) * 1.45 + 2,
      };
    }

    function assemblyOrderedIds() {
      const current = stateRef.current.placed || [];
      if (!current.length) return [];
      const bounds = getPiecesWorldBounds(current);
      const centerX = bounds ? (bounds.minX + bounds.maxX) / 2 : current.reduce((sum, item) => sum + (Number(item.x) || 0), 0) / current.length;
      const centerY = bounds ? (bounds.minY + bounds.maxY) / 2 : current.reduce((sum, item) => sum + (Number(item.y) || 0), 0) / current.length;
      return current
        .map((item, index) => {
          const x = Number(item.x) || 0;
          const y = Number(item.y) || 0;
          return {
            id: item.id,
            distance: Math.hypot(x - centerX, y - centerY),
            angle: Math.atan2(y - centerY, x - centerX),
            index,
          };
        })
        .sort((a, b) => a.distance - b.distance || a.angle - b.angle || a.index - b.index)
        .map((item) => item.id);
    }

    function applyAssemblyVisibility(progress) {
      if (!meshes.size) return;
      if (!Number.isFinite(progress)) {
        meshes.forEach((mesh) => {
          mesh.visible = true;
          if (mesh.userData.assemblyBasePosition) mesh.position.copy(mesh.userData.assemblyBasePosition);
          if (mesh.userData.assemblyBaseScale) mesh.scale.copy(mesh.userData.assemblyBaseScale);
        });
        groupHitMeshes.forEach((mesh) => {
          mesh.visible = true;
        });
        return;
      }
      const orderedIds = assemblyOrderedIds();
      const orderById = new Map(orderedIds.map((id, index) => [id, index]));
      const total = Math.max(1, orderedIds.length);
      const cursor = THREE.MathUtils.clamp(progress, 0, 1) * (total + 0.85);
      camera.updateMatrixWorld(true);
      group.updateMatrixWorld(true);
      const cameraRightWorld = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize();
      const groupWorldQuaternion = new THREE.Quaternion();
      const groupWorldScale = new THREE.Vector3();
      group.getWorldQuaternion(groupWorldQuaternion);
      group.getWorldScale(groupWorldScale);
      const worldToGroupRotation = groupWorldQuaternion.clone().invert();
      const { radius: assemblyRadius } = cameraOrbitTarget();
      const leftTravelWorld = Math.max(4.5, assemblyRadius * 1.2);
      const leftTravelLocal = cameraRightWorld
        .clone()
        .multiplyScalar(-leftTravelWorld)
        .applyQuaternion(worldToGroupRotation);
      leftTravelLocal.x /= Math.max(0.001, Math.abs(groupWorldScale.x));
      leftTravelLocal.y /= Math.max(0.001, Math.abs(groupWorldScale.y));
      leftTravelLocal.z /= Math.max(0.001, Math.abs(groupWorldScale.z));
      meshes.forEach((mesh, id) => {
        const index = orderById.get(id) ?? total;
        const local = THREE.MathUtils.clamp(cursor - index, 0, 1);
        const eased = local * local * (3 - 2 * local);
        const visible = local > 0.001 || progress >= 1;
        mesh.visible = visible;
        const basePosition = mesh.userData.assemblyBasePosition;
        const baseScale = mesh.userData.assemblyBaseScale;
        if (basePosition) {
          mesh.position.copy(basePosition);
          if (visible && progress < 1) {
            mesh.position.addScaledVector(leftTravelLocal, 1 - eased);
            mesh.position.y += (1 - eased) * 1.35 + Math.sin(eased * Math.PI) * 0.28;
          }
        }
        if (baseScale) {
          const arrivalScale = 0.72 + eased * 0.28;
          mesh.scale.set(
            baseScale.x * arrivalScale,
            baseScale.y * arrivalScale,
            baseScale.z * arrivalScale,
          );
        }
      });
      groupHitMeshes.forEach((mesh) => {
        mesh.visible = progress >= 1;
      });
    }

    function applyCameraVideoOrbit(now) {
      if (!stateRef.current.cameraVideoPlaying) {
        cameraOrbit.startTime = null;
        cameraOrbit.completed = false;
        cameraOrbit.lastReportedProgress = -1;
        applyAssemblyVisibility(null);
        return false;
      }
      if (!cameraOrbit.startTime) cameraOrbit.startTime = now;
      const forcedProgress = stateRef.current.cameraVideoProgressRef?.current;
      const exportingFrame = Number.isFinite(forcedProgress);
      const preset = CAMERA_VIDEO_PRESET_MAP.get(stateRef.current.cameraVideoPreset) || CAMERA_VIDEO_PRESETS[0];
      const durationMs = preset.type === 'assembly'
        ? Math.max(2000, Number(stateRef.current.cameraVideoDurationMs) || preset.durationMs)
        : preset.durationMs;
      const progress = exportingFrame
        ? THREE.MathUtils.clamp(forcedProgress, 0, 1)
        : Math.min((now - cameraOrbit.startTime) / durationMs, 1);
      if (preset.type === 'assembly') {
        controls.object = camera;
        controls.enabled = false;
        controls.enableRotate = false;
        controls.enablePan = false;
        applyAssemblyVisibility(progress);
        if (!exportingFrame && (progress >= 1 || progress - cameraOrbit.lastReportedProgress >= 0.02)) {
          cameraOrbit.lastReportedProgress = progress;
          stateRef.current.onCameraVideoProgress?.(progress);
        }
        if (!exportingFrame && progress >= 1 && !cameraOrbit.completed) {
          cameraOrbit.completed = true;
          stateRef.current.onCameraVideoEnd?.();
        }
        return true;
      }
      camera = perspectiveCamera;
      controls.object = camera;
      controls.enabled = false;
      controls.enableRotate = false;
      controls.enablePan = false;
      applyAssemblyVisibility(null);
      const eased = 1 - Math.pow(1 - progress, 2);
      const { center, radius } = cameraOrbitTarget();
      if (preset.id === 'top-spin-zoom') {
        const angle = progress * Math.PI * 0.5;
        const smoothProgress = progress * progress * (3 - 2 * progress);
        const height = THREE.MathUtils.lerp(radius * 1.12, radius * 0.68, smoothProgress);
        camera.up.set(Math.sin(angle), 0, -Math.cos(angle));
        camera.position.set(center.x, center.y + height, center.z + 0.001);
      } else {
        const angle = -Math.PI / 2 + progress * Math.PI * 2 * CAMERA_VIDEO_ROTATIONS;
        const elevation = THREE.MathUtils.degToRad(THREE.MathUtils.lerp(88, 36, eased));
        const horizontalRadius = Math.max(0.04, Math.cos(elevation) * radius);
        const height = Math.sin(elevation) * radius;
        camera.up.set(0, 1, 0);
        camera.position.set(
          center.x + Math.cos(angle) * horizontalRadius,
          center.y + height,
          center.z + Math.sin(angle) * horizontalRadius,
        );
      }
      controls.target.copy(center);
      camera.lookAt(center);
      camera.updateProjectionMatrix();
      if (!exportingFrame && (progress >= 1 || progress - cameraOrbit.lastReportedProgress >= 0.02)) {
        cameraOrbit.lastReportedProgress = progress;
        stateRef.current.onCameraVideoProgress?.(progress);
      }
      if (!exportingFrame && progress >= 1 && !cameraOrbit.completed) {
        cameraOrbit.completed = true;
        stateRef.current.onCameraVideoEnd?.();
      }
      return true;
    }

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const drag = { id: null, ids: [], offset: new THREE.Vector3(), startPoint: new THREE.Vector3(), startX: 0, startY: 0, active: false, previous: null, previousItems: [], current: null, delta: { x: 0, y: 0 } };
    const selectionDrag = { active: false, selecting: false, startX: 0, startY: 0, currentX: 0, currentY: 0 };
    const longPress = { timer: null, pointerId: null, triggered: false, startX: 0, startY: 0, id: null };
    const meshes = new Map();
    const groupHitMeshes = new Map();
    const group = new THREE.Group();
    const selectionOutline = createSelectionOutline();
    const framePreviewLine = createFramePreviewLine();
    const lastViewBounds = { current: null };
    const lastCameraSnapshot = { current: null };
    scene.add(group);
    group.add(selectionOutline);
    group.add(framePreviewLine);

    const ambientLight = new THREE.HemisphereLight(
      STAGE_HEMISPHERE_LIGHT.sky,
      STAGE_HEMISPHERE_LIGHT.ground,
      STAGE_HEMISPHERE_LIGHT.intensity,
    );
    scene.add(ambientLight);
    const light = new THREE.DirectionalLight(STAGE_KEY_LIGHT.color, STAGE_KEY_LIGHT.intensity);
    light.position.set(...STAGE_KEY_LIGHT.position);
    light.castShadow = !!stateRef.current.liveShadowsEnabled;
    light.shadow.mapSize.set(1024, 1024);
    light.shadow.camera.near = 0.5;
    light.shadow.camera.far = 30;
    light.shadow.camera.left = -12;
    light.shadow.camera.right = 12;
    light.shadow.camera.top = 12;
    light.shadow.camera.bottom = -12;
    scene.add(light);

    const stageFloor = createStageFloor(initialBackground, stateRef.current.liveShadowsEnabled);
    scene.add(stageFloor);
    const grid = new THREE.GridHelper(12, 24, '#d0c3a7', '#e5dac6');
    grid.position.y = 0.006;
    scene.add(grid);
    const glassColorCastGroup = new THREE.Group();
    glassColorCastGroup.name = 'stage-glass-color-cast';
    scene.add(glassColorCastGroup);

    const composer = new EffectComposer(renderer);
    composer.setPixelRatio(rendererPixelRatio);
    composer.setSize(mount.clientWidth, mount.clientHeight);
    const renderPass = new RenderPass(scene, camera);
    const ssrPass = new SSRPass({
      renderer,
      scene,
      camera,
      width: mount.clientWidth,
      height: mount.clientHeight,
      selects: [],
    });
    ssrPass.opacity = 0.2;
    ssrPass.maxDistance = 3.5;
    ssrPass.thickness = 0.018;
    ssrPass.blur = true;
    ssrPass.enabled = false;
    const ssaoPass = new SSAOPass(scene, camera, mount.clientWidth, mount.clientHeight, 16);
    ssaoPass.kernelRadius = 7;
    ssaoPass.minDistance = 0.002;
    ssaoPass.maxDistance = 0.085;
    ssaoPass.enabled = false;
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(mount.clientWidth, mount.clientHeight), 0.16, 0.3, 0.92);
    bloomPass.enabled = false;
    const outputPass = new OutputPass();
    composer.addPass(renderPass);
    composer.addPass(ssrPass);
    composer.addPass(ssaoPass);
    composer.addPass(bloomPass);
    composer.addPass(outputPass);

    function syncMeshes() {
      const {
        placed: current,
        selectedId: selected,
        material: materialName,
        glassSettings: stageGlassSettings,
        style: styleName,
        backgroundColor: stageBackgroundColor,
        edgeColor: stageEdgeColor,
        edgeThickness: stageEdgeThickness,
        edgeMode: stageEdgeMode,
        edgeOffsetCount: stageEdgeOffsetCount,
        edgeOffsetDistance: stageEdgeOffsetDistance,
        liveShadowsEnabled: stageLiveShadowsEnabled,
        modelTransform: stageModelTransform,
      } = stateRef.current;
      const isPaper = normalizeMaterialName(materialName) === 'paper';
      const stageRenderSettings = normalizeRenderSettings({
        backgroundColor: isPaper ? PAPER_BACKGROUND_COLOR : stageBackgroundColor,
        edgeColor: isPaper ? PAPER_EDGE_COLOR : stageEdgeColor,
        edgeThickness: isPaper ? PAPER_EDGE_THICKNESS : stageEdgeThickness,
        edgeMode: isPaper ? 'single' : stageEdgeMode,
        edgeOffsetCount: isPaper ? DEFAULT_RENDER_SETTINGS.edgeOffsetCount : stageEdgeOffsetCount,
        edgeOffsetDistance: isPaper ? DEFAULT_RENDER_SETTINGS.edgeOffsetDistance : stageEdgeOffsetDistance,
      });
      const activeGroup = stateRef.current.activeGroupId || null;
      const selectedSet = new Set(
        activeGroup
          ? current.filter((item) => item.groupInstanceId === activeGroup).map((item) => item.id)
          : stateRef.current.selectedIds?.length
            ? stateRef.current.selectedIds
            : selected
              ? [selected]
              : [],
      );
      const wanted = new Set(current.map((item) => item.id));
      for (const [id, mesh] of meshes) {
        if (!wanted.has(id)) {
          group.remove(mesh);
          disposeObject(mesh);
          meshes.delete(id);
        }
      }
      const orderById = new Map(current.map((item, index) => [item.id, index]));
      current.forEach((item, orderIndex) => {
        let mesh = meshes.get(item.id);
        const renderSignature = pieceGeometrySignature(item);
        if (mesh && mesh.userData.renderSignature !== renderSignature) {
          group.remove(mesh);
          disposeObject(mesh);
          meshes.delete(item.id);
          mesh = null;
        }
        if (!mesh) {
          mesh = createPieceObject(item, () => {
            if (mesh) mesh.userData.materialSignature = '';
            stageSyncDirtyRef.current = true;
          });
          mesh.userData.id = item.id;
          mesh.userData.renderSignature = renderSignature;
          meshes.set(item.id, mesh);
          group.add(mesh);
        }
        mesh.position.set(item.x, Number(item.elevation) || 0, item.y);
        mesh.rotation.set(Number(item.tiltX) || 0, -item.rotation, Number(item.tiltZ) || 0);
        const baseHeight = Math.max(0.02, Number(item.height) || 0.18);
        const glassHeightScale = normalizeMaterialName(materialName) === 'glass' ? glassOpticalThickness(item, stageGlassSettings) / baseHeight : 1;
        mesh.scale.set(
          item.mirrorHorizontal ? -1 : 1,
          styleName === 'pattern' ? 0.35 : glassHeightScale,
          item.mirrorVertical ? -1 : 1,
        );
        mesh.userData.assemblyBasePosition = mesh.position.clone();
        mesh.userData.assemblyBaseScale = mesh.scale.clone();
        const stageOrder = Math.min(orderIndex * 0.001, 1);
        mesh.renderOrder = stageOrder;
        mesh.traverse((child) => {
          if (child.userData?.isStageEdge) child.renderOrder = 8 + stageOrder;
          else if (child.userData?.isSurfaceSticker) child.renderOrder = 7 + stageOrder;
          else if (child.isMesh) child.renderOrder = stageOrder;
        });
        applyPieceMaterial(mesh, item, materialName, selectedSet.has(item.id), stageLiveShadowsEnabled, stageGlassSettings);
        updateStageEdgeOverlay(mesh, item, styleName, materialName, stageRenderSettings, renderSignature);
        updatePieceSurfaceStickerOverlay(mesh, item, renderSignature);
      });
      const reflectiveGlassMeshes = [];
      if (normalizeMaterialName(materialName) === 'glass') {
        meshes.forEach((object) => object.traverse((child) => {
          if (child.isMesh && child.material?.isMeshPhysicalMaterial) reflectiveGlassMeshes.push(child);
        }));
      }
      ssrPass.selects = reflectiveGlassMeshes;
      const causticsEnabled = normalizeMaterialName(materialName) === 'glass' && !stateRef.current.mobileViewport && current.length <= 120;
      try {
        updateGlassColorCast(
          glassColorCastGroup,
          current,
          causticsEnabled ? 'glass' : 'plastic',
          stageModelTransform,
          stageGlassSettings,
        );
      } catch (error) {
        console.warn('The live glass color cast was skipped.', error);
        glassColorCastGroup.visible = false;
      }
      const pieceGroups = new Map();
      current.forEach((item) => {
        if (!item.groupInstanceId) return;
        if (!pieceGroups.has(item.groupInstanceId)) pieceGroups.set(item.groupInstanceId, []);
        pieceGroups.get(item.groupInstanceId).push(item);
      });
      const wantedGroupHits = new Set(
        Array.from(pieceGroups.entries())
          .filter(([, items]) => items.length > 1)
          .map(([groupId]) => groupId),
      );
      for (const [groupId, hitMesh] of groupHitMeshes) {
        if (!wantedGroupHits.has(groupId)) {
          group.remove(hitMesh);
          disposeObject(hitMesh);
          groupHitMeshes.delete(groupId);
        }
      }
      for (const [groupId, items] of pieceGroups) {
        if (items.length < 2) continue;
        const bounds = getPiecesWorldBounds(items);
        if (!bounds) continue;
        const signature = `${bounds.minX.toFixed(3)},${bounds.minY.toFixed(3)},${bounds.maxX.toFixed(3)},${bounds.maxY.toFixed(3)}:${activeGroup === groupId ? 'active' : 'idle'}`;
        let hitMesh = groupHitMeshes.get(groupId);
        if (hitMesh && hitMesh.userData.renderSignature !== signature) {
          group.remove(hitMesh);
          disposeObject(hitMesh);
          groupHitMeshes.delete(groupId);
          hitMesh = null;
        }
        if (!hitMesh) {
          hitMesh = createGroupFootprintObject(items, activeGroup === groupId);
          hitMesh.userData.renderSignature = signature;
          groupHitMeshes.set(groupId, hitMesh);
          group.add(hitMesh);
        }
        hitMesh.userData.id = items[0].id;
        hitMesh.userData.groupInstanceId = groupId;
        hitMesh.userData.stageOrder = Math.max(...items.map((item) => orderById.get(item.id) ?? 0));
      }
      updateSelectionOutline(selectionOutline, current.filter((item) => selectedSet.has(item.id)));
      updateFramePreviewLine(framePreviewLine, stateRef.current.framePoints || []);
      applyModelTransform(group, stageModelTransform);
    }

    function setPointer(event) {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    }

    function groundPoint() {
      raycaster.setFromCamera(pointer, camera);
      const point = new THREE.Vector3();
      raycaster.ray.intersectPlane(plane, point);
      return point;
    }

    function viewportGroundBounds() {
      const points = [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
        [0, 0],
      ]
        .map(([x, y]) => {
          raycaster.setFromCamera({ x, y }, camera);
          const point = new THREE.Vector3();
          return raycaster.ray.intersectPlane(plane, point) ? point : null;
        })
        .filter(Boolean);
      if (points.length < 3) return null;
      const xs = points.map((point) => point.x);
      const ys = points.map((point) => point.z);
      return {
        minX: Math.min(...xs),
        maxX: Math.max(...xs),
        minY: Math.min(...ys),
        maxY: Math.max(...ys),
      };
    }

    function selectionBoxFromDrag() {
      const rect = renderer.domElement.getBoundingClientRect();
      const left = Math.min(selectionDrag.startX, selectionDrag.currentX) - rect.left;
      const top = Math.min(selectionDrag.startY, selectionDrag.currentY) - rect.top;
      const width = Math.abs(selectionDrag.currentX - selectionDrag.startX);
      const height = Math.abs(selectionDrag.currentY - selectionDrag.startY);
      return { left, top, width, height };
    }

    function meshScreenBounds(mesh) {
      const bounds = new THREE.Box3().setFromObject(mesh);
      if (bounds.isEmpty()) return null;
      const rect = renderer.domElement.getBoundingClientRect();
      const corners = [
        [bounds.min.x, bounds.min.y, bounds.min.z],
        [bounds.min.x, bounds.min.y, bounds.max.z],
        [bounds.min.x, bounds.max.y, bounds.min.z],
        [bounds.min.x, bounds.max.y, bounds.max.z],
        [bounds.max.x, bounds.min.y, bounds.min.z],
        [bounds.max.x, bounds.min.y, bounds.max.z],
        [bounds.max.x, bounds.max.y, bounds.min.z],
        [bounds.max.x, bounds.max.y, bounds.max.z],
      ].map(([x, y, z]) => new THREE.Vector3(x, y, z).project(camera));
      const xs = corners.map((point) => (point.x * 0.5 + 0.5) * rect.width);
      const ys = corners.map((point) => (-point.y * 0.5 + 0.5) * rect.height);
      return {
        left: Math.min(...xs),
        right: Math.max(...xs),
        top: Math.min(...ys),
        bottom: Math.max(...ys),
      };
    }

    function boundsInsideSelection(bounds, box) {
      if (!bounds) return false;
      const boxRight = box.left + box.width;
      const boxBottom = box.top + box.height;
      return bounds.left >= box.left && bounds.right <= boxRight && bounds.top >= box.top && bounds.bottom <= boxBottom;
    }

    function selectedIdsInBox(box) {
      return Array.from(meshes.entries())
        .filter(([, mesh]) => boundsInsideSelection(meshScreenBounds(mesh), box))
        .map(([id]) => id);
    }

    function hitStageOrder(hit) {
      const root = getPieceRoot(hit.object);
      if (root.userData.groupInstanceId) return root.userData.stageOrder || 0;
      return stateRef.current.placed.findIndex((item) => item.id === root.userData.id);
    }

    function orderedHits(hits) {
      return hits.slice().sort((a, b) => {
        const distanceDelta = a.distance - b.distance;
        if (Math.abs(distanceDelta) > 0.0001) return distanceDelta;
        return hitStageOrder(b) - hitStageOrder(a);
      });
    }

    function groupedPiecesAtPoint(point) {
      const groups = new Map();
      stateRef.current.placed.forEach((item) => {
        if (!item.groupInstanceId) return;
        if (!groups.has(item.groupInstanceId)) groups.set(item.groupInstanceId, []);
        groups.get(item.groupInstanceId).push(item);
      });
      const matches = Array.from(groups.values())
        .filter((items) => items.length > 1)
        .map((items) => ({ items, bounds: getPiecesWorldBounds(items) }))
        .filter(({ bounds }) => bounds && point.x >= bounds.minX && point.x <= bounds.maxX && point.z >= bounds.minY && point.z <= bounds.maxY)
        .sort((a, b) => (a.bounds.maxX - a.bounds.minX) * (a.bounds.maxY - a.bounds.minY) - (b.bounds.maxX - b.bounds.minX) * (b.bounds.maxY - b.bounds.minY));
      return matches[0]?.items || null;
    }

    function reportViewBounds() {
      const bounds = viewportGroundBounds();
      if (!bounds) return;
      const previous = lastViewBounds.current;
      const changed =
        !previous ||
        Math.abs(previous.minX - bounds.minX) > 0.03 ||
        Math.abs(previous.maxX - bounds.maxX) > 0.03 ||
        Math.abs(previous.minY - bounds.minY) > 0.03 ||
        Math.abs(previous.maxY - bounds.maxY) > 0.03;
      if (!changed) return;
      lastViewBounds.current = bounds;
      stateRef.current.onViewBoundsChange?.(bounds);
    }

    function reportCameraSnapshot() {
      const snapshot = {
        mode: stateRef.current.cameraMode || 'top',
        position: camera.position.toArray(),
        target: controls.target.toArray(),
        up: camera.up.toArray(),
        fov: camera.fov,
        distance: camera.position.distanceTo(controls.target),
      };
      const previous = lastCameraSnapshot.current;
      const changed =
        !previous ||
        previous.mode !== snapshot.mode ||
        Math.abs(previous.distance - snapshot.distance) > 0.01 ||
        previous.position.some((value, index) => Math.abs(value - snapshot.position[index]) > 0.01) ||
        previous.target.some((value, index) => Math.abs(value - snapshot.target[index]) > 0.01);
      if (!changed) return;
      lastCameraSnapshot.current = snapshot;
      stateRef.current.onCameraChange?.(snapshot);
    }

    function restoreControlsEnabled() {
      controls.enabled = true;
    }

    function cancelLongPress(resetTriggered = false) {
      if (longPress.timer) window.clearTimeout(longPress.timer);
      longPress.timer = null;
      longPress.pointerId = null;
      longPress.id = null;
      if (resetTriggered) longPress.triggered = false;
    }

    function startLongPress(event, id) {
      if (!stateRef.current.mobileViewport || event.pointerType !== 'touch' || !id) return;
      cancelLongPress(true);
      longPress.pointerId = event.pointerId;
      longPress.startX = event.clientX;
      longPress.startY = event.clientY;
      longPress.id = id;
      longPress.timer = window.setTimeout(() => {
        longPress.timer = null;
        longPress.triggered = true;
        const currentSelectedIds = stateRef.current.selectedIds || [];
        if (!currentSelectedIds.includes(id)) stateRef.current.onSelect(id);
        stateRef.current.onContextMenu({
          id,
          x: Math.max(8, Math.min(event.clientX, window.innerWidth - 178)),
          y: Math.max(8, Math.min(event.clientY, window.innerHeight - 310)),
        });
        controls.enabled = false;
      }, 550);
    }

    function pointerDown(event) {
      if (event.button !== 0) return;
      setPointer(event);
      raycaster.setFromCamera(pointer, camera);
      const groupHits = orderedHits(raycaster.intersectObjects(Array.from(groupHitMeshes.values()), true));
      const pieceHits = orderedHits(raycaster.intersectObjects(Array.from(meshes.values()), true));
      const hits = pieceHits.length ? pieceHits : groupHits;
      if (stateRef.current.frameMode) {
        if (!hits.length) return;
        const mesh = getPieceRoot(hits[0].object);
        stateRef.current.onFramePick?.(mesh.userData.id);
        return;
      }
      if (!hits.length) {
        if (event.ctrlKey || event.metaKey) return;
        const point = groundPoint();
        const groupItems = groupedPiecesAtPoint(point);
        if (groupItems) {
          const dragIds = groupItems.map((item) => item.id);
          drag.id = dragIds[0];
          drag.ids = dragIds;
          drag.offset.set(0, 0, 0);
          drag.startPoint.copy(point);
          drag.startX = event.clientX;
          drag.startY = event.clientY;
          drag.active = false;
          drag.previous = null;
          drag.previousItems = groupItems.map((item) => ({ ...item }));
          drag.current = { x: point.x, y: point.z };
          stateRef.current.onSelect(drag.id);
          if (stateRef.current.mobileViewport) controls.enabled = false;
          startLongPress(event, drag.id);
          renderer.domElement.setPointerCapture(event.pointerId);
          return;
        }
        const canDragSelect = !stateRef.current.mobileViewport && (
          (stateRef.current.cameraMode || 'top') === 'top' || normalizeMaterialName(stateRef.current.material) === 'paper'
        );
        if (!canDragSelect) {
          stateRef.current.onSelect(null);
          return;
        }
        selectionDrag.active = true;
        selectionDrag.selecting = false;
        selectionDrag.startX = event.clientX;
        selectionDrag.startY = event.clientY;
        selectionDrag.currentX = event.clientX;
        selectionDrag.currentY = event.clientY;
        renderer.domElement.setPointerCapture(event.pointerId);
        return;
      }
      const mesh = getPieceRoot(hits[0].object);
      const point = groundPoint();
      const current = stateRef.current.placed.find((item) => item.id === mesh.userData.id);
      if (!current) return;
      if (event.ctrlKey || event.metaKey) {
        stateRef.current.onToggleSelect?.(current.id);
        return;
      }
      const currentSelectedIds = stateRef.current.selectedIds || [];
      const dragIds = currentSelectedIds.includes(current.id) && currentSelectedIds.length > 1
        ? currentSelectedIds
        : current.groupInstanceId
          ? stateRef.current.placed.filter((item) => item.groupInstanceId === current.groupInstanceId).map((item) => item.id)
          : [current.id];
      drag.id = mesh.userData.id;
      drag.ids = dragIds;
      if (dragIds.length > 1) drag.offset.set(0, 0, 0);
      else drag.offset.copy(mesh.position).sub(point);
      drag.startPoint.copy(point);
      drag.startX = event.clientX;
      drag.startY = event.clientY;
      drag.active = false;
      drag.previous = current ? { x: current.x, y: current.y, rotation: current.rotation } : null;
      drag.previousItems = stateRef.current.placed.filter((item) => dragIds.includes(item.id)).map((item) => ({ ...item }));
      drag.current = current ? { x: current.x, y: current.y } : null;
      if (dragIds.length > 1) stateRef.current.onSelectionChange?.(dragIds);
      else stateRef.current.onSelect(drag.id);
      if (stateRef.current.mobileViewport) controls.enabled = false;
      startLongPress(event, drag.id);
      renderer.domElement.setPointerCapture(event.pointerId);
    }

    function pointerMove(event) {
      if (
        longPress.pointerId === event.pointerId &&
        Math.hypot(event.clientX - longPress.startX, event.clientY - longPress.startY) > 8
      ) {
        cancelLongPress();
      }
      if (selectionDrag.active) {
        selectionDrag.currentX = event.clientX;
        selectionDrag.currentY = event.clientY;
        const moved = Math.hypot(selectionDrag.currentX - selectionDrag.startX, selectionDrag.currentY - selectionDrag.startY);
        if (moved >= 4) {
          selectionDrag.selecting = true;
          controls.enabled = false;
          setSelectionBox(selectionBoxFromDrag());
        }
        return;
      }
      if (!drag.id) return;
      const moved = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
      if (!drag.active && moved < 4) return;
      drag.active = true;
      controls.enabled = false;
      setPointer(event);
      const point = groundPoint().add(drag.offset);
      const delta = {
        x: point.x - drag.offset.x - drag.startPoint.x,
        y: point.z - drag.offset.z - drag.startPoint.z,
      };
      drag.delta = delta;
      drag.current = { x: point.x, y: point.z };
      const previousById = new Map(drag.previousItems.map((item) => [item.id, item]));
      drag.ids.forEach((id) => {
        const previous = previousById.get(id);
        const mesh = meshes.get(id);
        if (previous && mesh) mesh.position.set((previous.x || 0) + delta.x, Number(previous.elevation) || 0, (previous.y || 0) + delta.y);
      });
      updateSelectionOutline(selectionOutline, drag.previousItems.map((item) => ({ ...item, x: (item.x || 0) + delta.x, y: (item.y || 0) + delta.y })));
    }

    function pointerUp(event) {
      const longPressTriggered = longPress.triggered && longPress.pointerId === event.pointerId;
      cancelLongPress(true);
      if (selectionDrag.active) {
        const box = selectionBoxFromDrag();
        const ids = selectionDrag.selecting ? selectedIdsInBox(box) : [];
        stateRef.current.onSelectionChange?.(ids);
        selectionDrag.active = false;
        selectionDrag.selecting = false;
        restoreControlsEnabled();
        setSelectionBox(null);
        renderer.domElement.releasePointerCapture(event.pointerId);
        return;
      }
      if (!drag.id) return;
      const current = stateRef.current.placed.find((item) => item.id === drag.id);
      if (current && drag.active) {
        if (drag.ids.length > 1) {
          stateRef.current.onSettleSelection?.(drag.ids, drag.delta, drag.previousItems, drag.id);
        } else {
          const nextPosition = drag.current || { x: current.x, y: current.y };
          stateRef.current.onSettle(drag.id, { x: nextPosition.x, y: nextPosition.y, previous: drag.previous });
        }
      }
      if (current && !drag.active && !longPressTriggered && drag.ids.length === 1 && !current.groupInstanceId) stateRef.current.onRotate(drag.id);
      stageSyncDirtyRef.current = true;
      drag.id = null;
      drag.ids = [];
      drag.active = false;
      drag.previous = null;
      drag.previousItems = [];
      drag.current = null;
      drag.delta = { x: 0, y: 0 };
      restoreControlsEnabled();
      renderer.domElement.releasePointerCapture(event.pointerId);
    }

    function contextMenu(event) {
      event.preventDefault();
      setPointer(event);
      raycaster.setFromCamera(pointer, camera);
      const groupHits = orderedHits(raycaster.intersectObjects(Array.from(groupHitMeshes.values()), true));
      const hits = groupHits.length ? groupHits : orderedHits(raycaster.intersectObjects(Array.from(meshes.values()), true));
      if (!hits.length) {
        stateRef.current.onContextMenu(null);
        return;
      }
      const mesh = getPieceRoot(hits[0].object);
      const id = mesh.userData.id;
      const currentSelectedIds = stateRef.current.selectedIds || [];
      if (!currentSelectedIds.includes(id)) stateRef.current.onSelect(id);
      stateRef.current.onContextMenu({ id, x: event.clientX, y: event.clientY });
    }

    function pointerCancel(event) {
      if (longPress.pointerId === event.pointerId) cancelLongPress(true);
      drag.id = null;
      drag.ids = [];
      drag.active = false;
      drag.previous = null;
      drag.previousItems = [];
      selectionDrag.active = false;
      selectionDrag.selecting = false;
      setSelectionBox(null);
      restoreControlsEnabled();
    }

    renderer.domElement.addEventListener('pointerdown', pointerDown);
    renderer.domElement.addEventListener('pointermove', pointerMove);
    renderer.domElement.addEventListener('pointerup', pointerUp);
    renderer.domElement.addEventListener('pointercancel', pointerCancel);
    renderer.domElement.addEventListener('contextmenu', contextMenu);

    function resize() {
      perspectiveCamera.aspect = mount.clientWidth / mount.clientHeight;
      perspectiveCamera.updateProjectionMatrix();
      updatePaperCameraProjection();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      composer.setPixelRatio(rendererPixelRatio);
      composer.setSize(mount.clientWidth, mount.clientHeight);
    }
    window.addEventListener('resize', resize);

    let frame;
    function animate() {
      if (stageSyncDirtyRef.current && !drag.active) {
        syncMeshes();
        stageSyncDirtyRef.current = false;
      }
      const isCameraVideo = !!stateRef.current.cameraVideoPlaying;
      const exportingCameraVideo = Number.isFinite(stateRef.current.cameraVideoProgressRef?.current);
      const isGlass = !isCameraVideo && normalizeMaterialName(stateRef.current.material) === 'glass';
      const glassPerformanceMode = isGlass && (stateRef.current.mobileViewport || stateRef.current.placed.length > GLASS_POSTPROCESS_PIECE_LIMIT);
      const interactivePixelRatio = glassPerformanceMode
        ? Math.min(window.devicePixelRatio, 1.25)
        : Math.min(window.devicePixelRatio, 2);
      if (exportingCameraVideo && !rendererUsingExportSize) {
        rendererUsingExportSize = true;
        rendererPixelRatio = 1;
        renderer.setPixelRatio(1);
        renderer.setSize(CAMERA_VIDEO_WIDTH, CAMERA_VIDEO_HEIGHT, false);
        composer.setPixelRatio(1);
        composer.setSize(CAMERA_VIDEO_WIDTH, CAMERA_VIDEO_HEIGHT);
        perspectiveCamera.aspect = CAMERA_VIDEO_WIDTH / CAMERA_VIDEO_HEIGHT;
        perspectiveCamera.updateProjectionMatrix();
      } else if (!exportingCameraVideo && rendererUsingExportSize) {
        rendererUsingExportSize = false;
        rendererPixelRatio = isCameraVideo ? 1 : interactivePixelRatio;
        renderer.setPixelRatio(rendererPixelRatio);
        renderer.setSize(mount.clientWidth, mount.clientHeight, false);
        composer.setPixelRatio(rendererPixelRatio);
        composer.setSize(mount.clientWidth, mount.clientHeight);
        perspectiveCamera.aspect = mount.clientWidth / Math.max(mount.clientHeight, 1);
        perspectiveCamera.updateProjectionMatrix();
      } else if (!exportingCameraVideo) {
        const desiredPixelRatio = isCameraVideo ? 1 : interactivePixelRatio;
        if (rendererPixelRatio !== desiredPixelRatio) {
          rendererPixelRatio = desiredPixelRatio;
          renderer.setPixelRatio(rendererPixelRatio);
          renderer.setSize(mount.clientWidth, mount.clientHeight, false);
          composer.setPixelRatio(rendererPixelRatio);
          composer.setSize(mount.clientWidth, mount.clientHeight);
        }
      }
      const isPaper = !isCameraVideo && normalizeMaterialName(stateRef.current.material) === 'paper';
      if (!isCameraVideo) {
        applyStageCameraView(isPaper ? 'top' : stateRef.current.cameraMode || 'top', false, isPaper);
        if (!drag.active && !selectionDrag.active) controls.enabled = true;
      }
      const backgroundColor = isPaper ? PAPER_BACKGROUND_COLOR : stateRef.current.backgroundColor;
      applyStageBackground(scene, renderer, backgroundColor);
      applyStageFloorColor(stageFloor, backgroundColor);
      grid.visible = !isPaper && !isGlass;
      const glassQualityEligible = isGlass && !stateRef.current.mobileViewport && !exportingCameraVideo && stateRef.current.placed.length <= GLASS_POSTPROCESS_PIECE_LIMIT;
      const activeGlassSettings = normalizeGlassSettings(stateRef.current.glassSettings);
      if (isGlass) ensureGlassEnvironment();
      scene.environment = isGlass && hdrEnvironmentTarget ? hdrEnvironmentTarget.texture : null;
      renderer.toneMapping = isGlass ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
      renderer.toneMappingExposure = isGlass ? 0.9 : 1;
      if ('physicallyCorrectLights' in renderer) renderer.physicallyCorrectLights = isGlass;
      ambientLight.intensity = isGlass ? 0.82 : STAGE_HEMISPHERE_LIGHT.intensity;
      ssaoPass.enabled = glassQualityEligible;
      bloomPass.enabled = glassQualityEligible;
      ssrPass.enabled = glassQualityEligible && renderer.capabilities.isWebGL2 && stateRef.current.placed.length <= GLASS_SSR_PIECE_LIMIT;
      ssrPass.opacity = 0.05 + activeGlassSettings.reflection * 0.28;
      bloomPass.strength = 0.03 + activeGlassSettings.highlight * 0.18;
      bloomPass.radius = 0.18 + activeGlassSettings.frosted * 0.18;
      renderPass.camera = camera;
      ssaoPass.camera = camera;
      ssrPass.camera = camera;
      light.shadow.intensity = isGlass ? 0.3 : 1;
      applyLiveShadowState(renderer, light, stageFloor, !isPaper && stateRef.current.liveShadowsEnabled && !isGlass);
      if (!applyCameraVideoOrbit(performance.now())) controls.update();
      reportViewBounds();
      reportCameraSnapshot();
      if (ssaoPass.enabled || bloomPass.enabled || ssrPass.enabled) composer.render();
      else renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    }
    animate();

    return () => {
      stageDisposed = true;
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      renderer.domElement.removeEventListener('pointerdown', pointerDown);
      renderer.domElement.removeEventListener('pointermove', pointerMove);
      renderer.domElement.removeEventListener('pointerup', pointerUp);
      renderer.domElement.removeEventListener('pointercancel', pointerCancel);
      renderer.domElement.removeEventListener('contextmenu', contextMenu);
      cancelLongPress(true);
      controls.dispose();
      composer.dispose();
      ssrPass.dispose();
      ssaoPass.dispose();
      bloomPass.dispose();
      disposeObject(glassColorCastGroup);
      hdrEnvironmentTarget?.dispose();
      pmremGenerator?.dispose();
      mount.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, []);

  return (
    <div className="stage-canvas" ref={mountRef}>
      {selectionBox && (
        <div
          className="stage-selection-box"
          style={{
            left: selectionBox.left,
            top: selectionBox.top,
            width: selectionBox.width,
            height: selectionBox.height,
          }}
        />
      )}
    </div>
  );
}

function applyStageBackground(scene, renderer, backgroundColor) {
  const color = normalizeHexColor(backgroundColor, DEFAULT_RENDER_SETTINGS.backgroundColor);
  if (scene.userData.stageBackgroundColor === color) return;
  scene.userData.stageBackgroundColor = color;
  if (!scene.background?.isColor) scene.background = new THREE.Color(color);
  else scene.background.set(color);
  renderer.setClearColor(color, 1);
}

function createStageFloor(backgroundColor, receiveShadow = false) {
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80),
    new THREE.MeshStandardMaterial({
      color: normalizeHexColor(backgroundColor, DEFAULT_RENDER_SETTINGS.backgroundColor),
      roughness: 0.64,
      metalness: 0,
    }),
  );
  floor.name = 'stage-solid-floor';
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.004;
  floor.receiveShadow = !!receiveShadow;
  return floor;
}

function applyStageFloorColor(floor, backgroundColor) {
  const color = normalizeHexColor(backgroundColor, DEFAULT_RENDER_SETTINGS.backgroundColor);
  if (floor.userData.floorColor === color) return;
  floor.userData.floorColor = color;
  floor.material.color.set(color);
  floor.material.needsUpdate = true;
}

function applyLiveShadowState(renderer, light, floor, enabled) {
  const nextEnabled = !!enabled;
  if (renderer.shadowMap.enabled !== nextEnabled) {
    renderer.shadowMap.enabled = nextEnabled;
    renderer.shadowMap.needsUpdate = true;
  }
  if (light.castShadow !== nextEnabled) light.castShadow = nextEnabled;
  if (floor.receiveShadow !== nextEnabled) floor.receiveShadow = nextEnabled;
}

function updateGlassColorCast(group, placed, materialName, modelTransform = DEFAULT_MODEL_TRANSFORM, glassSettings = DEFAULT_GLASS_SETTINGS) {
  const isGlass = normalizeMaterialName(materialName) === 'glass';
  const normalizedTransform = normalizeModelTransform(modelTransform);
  const normalizedGlassSettings = normalizeGlassSettings(glassSettings);
  const transformSignature = JSON.stringify(normalizedTransform);
  if (
    group.userData.placedRef === placed &&
    group.userData.materialName === materialName &&
    group.userData.transformSignature === transformSignature &&
    group.userData.glassSettingsSignature === glassSettingsSignature(normalizedGlassSettings)
  ) {
    return;
  }
  group.userData.placedRef = placed;
  group.userData.materialName = materialName;
  group.userData.transformSignature = transformSignature;
  group.userData.glassSettingsSignature = glassSettingsSignature(normalizedGlassSettings);
  const signature = isGlass
    ? placed
        .map(glassCastPieceSignature)
        .join('|') + `|transform:${transformSignature}|glass:${glassSettingsSignature(normalizedGlassSettings)}`
    : 'hidden';
  if (group.userData.signature === signature) return;
  group.userData.signature = signature;
  while (group.children.length) {
    const child = group.children.pop();
    disposeObject(child);
  }
  group.visible = isGlass;
  if (!isGlass || !placed.length) return;
  const cast = createGlassColorCastTextureMesh(placed, normalizedTransform, normalizedGlassSettings);
  if (cast) group.add(cast);
}

function glassCastPieceSignature(piece) {
  return [
    piece.id,
    piece.sourceId,
    piece.color,
    piece.x,
    piece.y,
    piece.rotation,
    piece.elevation,
    piece.tiltX,
    piece.tiltZ,
    piece.height,
    piece.stageWidth,
    piece.stageLength,
    piece.points?.length || 0,
    piece.snapEdges?.length || 0,
    piece.displayEdges?.length || 0,
  ].join(':');
}

function createGlassColorCastMesh(piece, modelTransform = DEFAULT_MODEL_TRANSFORM, opacity = 0.35) {
  const projectedFootprint = projectedGlassFootprintPoints(piece, modelTransform);
  if (projectedFootprint.length < 3) return null;
  const shape = new THREE.Shape();
  projectedFootprint.forEach(([sx, sy], index) => {
    if (index === 0) shape.moveTo(sx, sy);
    else shape.lineTo(sx, sy);
  });
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, 0.012, 0);
  const material = new THREE.MeshBasicMaterial({
    color: glassTintColor(piece.color || '#1c7c74'),
    transparent: true,
    opacity,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'glass-color-cast';
  mesh.renderOrder = 1;
  return mesh;
}

function createGlassColorCastTextureMesh(placed, modelTransform = DEFAULT_MODEL_TRANSFORM, glassSettings = DEFAULT_GLASS_SETTINGS) {
  const settings = normalizeGlassSettings(glassSettings);
  const canvasSize = isConstrainedExportDevice() ? 512 : 1024;
  const floorSize = 80;
  const halfFloor = floorSize / 2;
  const canvas = document.createElement('canvas');
  canvas.width = canvasSize;
  canvas.height = canvasSize;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.clearRect(0, 0, canvasSize, canvasSize);
  context.globalAlpha = 0.22 + settings.shadow * 0.42;

  const toCanvas = ([x, z]) => [
    ((x + halfFloor) / floorSize) * canvasSize,
    canvasSize - ((z + halfFloor) / floorSize) * canvasSize,
  ];

  placed.forEach((piece) => {
    const footprint = projectedGlassFootprintPoints(piece, modelTransform);
    if (footprint.length < 3) return;
    const tint = glassTintColor(piece.color || '#1c7c74');
    context.fillStyle = tint;
    context.beginPath();
    footprint.forEach((point, index) => {
      const [x, y] = toCanvas(point);
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.closePath();
    context.fill();
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(floorSize, floorSize),
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 0.3 + settings.shadow * 0.62,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
  );
  mesh.name = 'glass-color-cast-texture';
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.014;
  mesh.renderOrder = 1;
  return mesh;
}

function projectedGlassFootprintPoints(piece, modelTransform) {
  const footprint = worldFootprintPoints(piece);
  if (footprint.length < 3) return [];
  const height = Math.max(0.02, Number(piece.height) || 0.18);
  // Extend the optical projection so thin universal-height pieces still cast
  // a visible pool of color beyond their own footprint.
  const projectedHeight = height * 5;
  const transformMatrix = modelTransformMatrix(modelTransform);
  const lightDirection = stageLightDirection();
  const points = footprint.flatMap(([x, z]) => [
    projectPointToStageFloor(new THREE.Vector3(x, 0, z).applyMatrix4(transformMatrix), lightDirection),
    projectPointToStageFloor(new THREE.Vector3(x, projectedHeight, z).applyMatrix4(transformMatrix), lightDirection),
  ]);
  const unique = uniquePoints(points);
  return convexHull(unique);
}

function stageLightDirection() {
  return new THREE.Vector3(0, 0, 0).sub(new THREE.Vector3(...STAGE_KEY_LIGHT.position)).normalize();
}

function projectPointToStageFloor(point, lightDirection, floorY = 0) {
  const direction = lightDirection.clone();
  if (Math.abs(direction.y) < 0.0001) return [point.x, point.z];
  const t = (floorY - point.y) / direction.y;
  const projected = point.clone().add(direction.multiplyScalar(t));
  return [projected.x, projected.z];
}

function glassCastOffset(height) {
  const direction = stageLightDirection();
  if (Math.abs(direction.y) < 0.0001) return { x: 0, y: 0 };
  const t = -height / direction.y;
  return {
    x: direction.x * t,
    y: direction.z * t,
  };
}

const SURFACE_STICKER_TEXTURE_CACHE = new Map();
const SURFACE_STICKER_PREVIEW_TEXTURE_CACHE = { signature: '', texture: null };

function drawSurfaceStickerShape(context, shape, size) {
  const x = shape.x * size;
  const y = shape.y * size;
  const shapeSize = shape.size * size;
  context.save();
  context.globalAlpha = shape.opacity;
  context.fillStyle = shape.color;
  context.strokeStyle = shape.color;
  context.translate(x, y);
  context.rotate(THREE.MathUtils.degToRad(shape.rotation || 0));
  if (shape.type === 'circle') {
    context.beginPath();
    context.arc(0, 0, shapeSize / 2, 0, Math.PI * 2);
    context.fill();
  } else if (shape.type === 'triangle') {
    context.beginPath();
    context.moveTo(0, -shapeSize / 2);
    context.lineTo(shapeSize / 2, shapeSize / 2);
    context.lineTo(-shapeSize / 2, shapeSize / 2);
    context.closePath();
    context.fill();
  } else if (shape.type === 'line') {
    context.lineWidth = Math.max(2, shapeSize * 0.16);
    context.lineCap = 'round';
    context.beginPath();
    context.moveTo(-shapeSize / 2, 0);
    context.lineTo(shapeSize / 2, 0);
    context.stroke();
  } else {
    const height = shapeSize * 0.68;
    context.fillRect(-shapeSize / 2, -height / 2, shapeSize, height);
  }
  context.restore();
}

function createSurfaceStickerTexture(sticker, shared = true) {
  const normalized = normalizeSurfaceSticker(sticker);
  const signature = surfaceStickerSignature(normalized);
  if (shared && SURFACE_STICKER_TEXTURE_CACHE.has(signature)) return SURFACE_STICKER_TEXTURE_CACHE.get(signature);
  if (!shared && SURFACE_STICKER_PREVIEW_TEXTURE_CACHE.signature === signature) {
    return SURFACE_STICKER_PREVIEW_TEXTURE_CACHE.texture;
  }
  if (!shared && SURFACE_STICKER_PREVIEW_TEXTURE_CACHE.texture) {
    SURFACE_STICKER_PREVIEW_TEXTURE_CACHE.texture.dispose();
    SURFACE_STICKER_PREVIEW_TEXTURE_CACHE.signature = '';
    SURFACE_STICKER_PREVIEW_TEXTURE_CACHE.texture = null;
  }
  const size = SURFACE_STICKER_TEXTURE_SIZE;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 8;
  // Preview textures are shared by all matching stage instances and replaced as one unit.
  texture.userData.sharedSurfaceStickerTexture = true;
  const paint = (image = null) => {
    context.clearRect(0, 0, size, size);
    if (image) {
      context.save();
      context.globalAlpha = normalized.imageOpacity;
      context.translate(normalized.imageX * size, normalized.imageY * size);
      context.rotate(THREE.MathUtils.degToRad(normalized.imageRotation));
      const imageSize = size * normalized.imageScale;
      context.drawImage(image, -imageSize / 2, -imageSize / 2, imageSize, imageSize);
      context.restore();
    }
    normalized.shapes.forEach((shape) => drawSurfaceStickerShape(context, shape, size));
    texture.needsUpdate = true;
  };
  paint();
  texture.userData.readyPromise = normalized.imageDataUrl
    ? new Promise((resolve) => {
        const image = new Image();
        image.onload = () => {
          paint(image);
          resolve();
        };
        image.onerror = () => resolve();
        image.src = normalized.imageDataUrl;
      })
    : Promise.resolve();
  if (shared) SURFACE_STICKER_TEXTURE_CACHE.set(signature, texture);
  else {
    SURFACE_STICKER_PREVIEW_TEXTURE_CACHE.signature = signature;
    SURFACE_STICKER_PREVIEW_TEXTURE_CACHE.texture = texture;
  }
  return texture;
}

function createPieceSurfaceStickerOverlay(piece) {
  if (!hasSurfaceStickerContent(piece.surfaceSticker)) return null;
  const points = getLocalCollisionPoints(piece);
  if (points.length < 3) return null;
  const shape = new THREE.Shape();
  points.forEach(([x, y], index) => {
    if (index === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  });
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape);
  const position = geometry.getAttribute('position');
  const uvs = new Float32Array(position.count * 2);
  for (let index = 0; index < position.count; index += 1) {
    const [u, v] = surfaceStickerUvAtLocalPoint(piece, position.getX(index), position.getY(index));
    uvs[index * 2] = u;
    uvs[index * 2 + 1] = v;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, Math.max(0.02, Number(piece.height) || 0.18) + 0.0025, 0);
  const texture = createSurfaceStickerTexture(piece.surfaceSticker, !piece.surfaceStickerPreview);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: 1,
    alphaTest: 0.01,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const overlay = new THREE.Mesh(geometry, material);
  overlay.name = 'piece-surface-sticker';
  overlay.userData.isSurfaceSticker = true;
  overlay.renderOrder = 7;
  return overlay;
}

function updatePieceSurfaceStickerOverlay(object, piece, signature = pieceGeometrySignature(piece)) {
  const stickerSignature = `${signature}|${piece.surfaceStickerPreview ? 'preview' : 'saved'}|${surfaceStickerSignature(piece.surfaceSticker)}`;
  if (object.userData.surfaceStickerSignature === stickerSignature) return object.userData.surfaceStickerOverlay || null;
  if (object.userData.surfaceStickerOverlay) {
    object.remove(object.userData.surfaceStickerOverlay);
    disposeObject(object.userData.surfaceStickerOverlay);
    object.userData.surfaceStickerOverlay = null;
  }
  object.userData.surfaceStickerSignature = stickerSignature;
  const overlay = createPieceSurfaceStickerOverlay(piece);
  if (overlay) {
    object.add(overlay);
    object.userData.surfaceStickerOverlay = overlay;
  }
  return overlay;
}

function updateStageEdgeOverlay(object, piece, styleName, materialName, renderSettings, geometrySignature = pieceGeometrySignature(piece)) {
  const normalizedMaterial = normalizeMaterialName(materialName);
  const isGlass = normalizedMaterial === 'glass';
  const isPaper = normalizedMaterial === 'paper';
  const thickness = Math.max(0, Number(renderSettings.edgeThickness) || 0);
  const signature = [
    geometrySignature,
    styleName,
    isPaper ? 'paper' : isGlass ? 'glass' : 'solid',
    renderSettings.edgeColor,
    thickness,
    renderSettings.edgeMode,
    renderSettings.edgeOffsetCount,
    renderSettings.edgeOffsetDistance,
    piece.offsetLinesEnabled !== false ? 'offset-on' : 'offset-off',
  ].join('|');
  if (object.userData.stageEdgeSignature === signature) return;
  if (object.userData.stageEdgeOverlay) {
    object.remove(object.userData.stageEdgeOverlay);
    disposeObject(object.userData.stageEdgeOverlay);
    object.userData.stageEdgeOverlay = null;
  }
  object.userData.stageEdgeSignature = signature;
  if (thickness <= 0) return;
  if (renderSettings.edgeMode === 'offset' && piece.offsetLinesEnabled === false) return;
  const overlay = isPaper ? createPaperStageEdgeOverlay(piece, renderSettings) : createStageEdgeOverlay(piece, renderSettings, isGlass);
  if (!overlay) return;
  object.userData.stageEdgeOverlay = overlay;
  object.add(overlay);
}

function createPaperStageEdgeOverlay(piece, renderSettings) {
  const segments = getExportFootprintSegments(piece).filter(([start, end]) => start && end);
  if (!segments.length) return null;
  const thickness = stageEdgeWorldThickness(PAPER_EDGE_THICKNESS);
  const material = new THREE.MeshBasicMaterial({
    color: PAPER_EDGE_COLOR,
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
  });
  const overlay = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, segments.length);
  overlay.name = 'stage-paper-edge-overlay';
  overlay.userData.isStageEdge = true;
  overlay.renderOrder = 9;
  const height = Math.max(0.02, Number(piece.height) || 0.18);
  const topY = height + thickness * 0.55;
  const interiorPoint = segmentInteriorPoint(segments);
  segments.forEach(([start, end], index) => {
    setStageEdgeBarMatrix(overlay, index, start, end, topY, thickness, 0, interiorPoint);
  });
  overlay.instanceMatrix.needsUpdate = true;
  return overlay;
}

function createStageEdgeOverlay(piece, renderSettings, isGlass = false) {
  const segments = getRealFootprintSegments(piece).filter(([start, end]) => start && end);
  if (!segments.length) return null;
  const thickness = stageEdgeWorldThickness(renderSettings.edgeThickness);
  const edgeSegments = edgeOverlaySegments(segments, thickness, renderSettings, {
    joinedSegmentOffsets: !!piece.isFrameSlice,
    boundaryPoints: piece.isFrameSlice ? getLocalCollisionPoints(piece) : undefined,
  });
  const topOnly = !!piece.isFrameSlice;
  const verticalPoints = topOnly || renderSettings.edgeMode === 'offset' ? [] : uniqueSegmentCoordinatePoints(segments);
  const instanceCount = edgeSegments.length * (topOnly ? 1 : 2) + verticalPoints.length;
  if (!instanceCount) return null;
  const material = new THREE.MeshBasicMaterial({
    color: renderSettings.edgeColor,
    depthTest: !isGlass,
    depthWrite: false,
    toneMapped: false,
  });
  const overlay = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, instanceCount);
  overlay.name = 'stage-edge-overlay';
  overlay.userData.isStageEdge = true;
  overlay.renderOrder = 8;
  const height = Math.max(0.02, Number(piece.height) || 0.18);
  const topY = height + thickness * 0.55;
  const bottomY = thickness * 0.55;
  const interiorPoint = segmentInteriorPoint(segments);
  let matrixIndex = 0;
  edgeSegments.forEach(([start, end]) => {
    setStageEdgeBarMatrix(overlay, matrixIndex, start, end, topY, thickness, 0, interiorPoint);
    matrixIndex += 1;
    if (!topOnly) {
      setStageEdgeBarMatrix(overlay, matrixIndex, start, end, bottomY, thickness, 0, interiorPoint);
      matrixIndex += 1;
    }
  });
  verticalPoints.forEach(([x, y]) => {
    const matrix = new THREE.Matrix4();
    matrix.compose(
      new THREE.Vector3(x, height / 2, y),
      new THREE.Quaternion(),
      new THREE.Vector3(thickness, height, thickness),
    );
    overlay.setMatrixAt(matrixIndex, matrix);
    matrixIndex += 1;
  });
  overlay.instanceMatrix.needsUpdate = true;
  return overlay;
}

function setStageEdgeBarMatrix(overlay, index, start, end, y, thickness, offset, interiorPoint = null) {
  const dx = end[0] - start[0];
  const dz = end[1] - start[1];
  const length = Math.hypot(dx, dz);
  if (length <= 0.0001) return;
  const [normalX, normalZ] = edgeInteriorNormal(start, end, interiorPoint);
  const matrix = new THREE.Matrix4();
  matrix.compose(
    new THREE.Vector3((start[0] + end[0]) / 2 + normalX * offset, y, (start[1] + end[1]) / 2 + normalZ * offset),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -Math.atan2(dz, dx), 0)),
    new THREE.Vector3(length, thickness, thickness),
  );
  overlay.setMatrixAt(index, matrix);
}

function edgeLineInteriorOffsets(thickness, mode, count = DEFAULT_RENDER_SETTINGS.edgeOffsetCount, distance = DEFAULT_RENDER_SETTINGS.edgeOffsetDistance) {
  if (mode === 'offset') {
    const lineCount = normalizeEdgeOffsetCount(count);
    const spacing = stageEdgeWorldOffsetDistance(distance);
    return Array.from({ length: lineCount }, (_, index) => spacing * (index + 1));
  }
  if (mode === 'double') return [-thickness * 1.6, thickness * 1.6];
  return [0];
}

function edgeOverlaySegments(segments, thickness, renderSettings, options = {}) {
  const mode = renderSettings.edgeMode;
  if (options.joinedSegmentOffsets) {
    const boundary = options.boundaryPoints?.length >= 3
      ? dedupeSequentialPoints(options.boundaryPoints)
      : orderedBoundaryPoints(segments);
    if (boundary.length >= 3) {
      return edgeLineInteriorOffsets(thickness, mode, renderSettings.edgeOffsetCount, renderSettings.edgeOffsetDistance)
        .map((distance) => offsetClosedBoundary(boundary, distance))
        .filter((points) => points.length >= 3)
        .flatMap((points) => polygonToEdges(points));
    }
  }
  if (mode === 'offset') {
    const boundary = orderedBoundaryPoints(segments);
    if (boundary.length >= 3) {
      return edgeLineInteriorOffsets(thickness, mode, renderSettings.edgeOffsetCount, renderSettings.edgeOffsetDistance)
        .map((distance) => offsetClosedBoundary(boundary, distance))
        .filter((points) => points.length >= 3)
        .flatMap((points) => polygonToEdges(points));
    }
  }
  const interiorPoint = segmentInteriorPoint(segments);
  return segments.flatMap(([start, end]) =>
    edgeLineInteriorOffsets(thickness, mode, renderSettings.edgeOffsetCount, renderSettings.edgeOffsetDistance).map((offset) =>
      offsetSegmentTowardInterior(start, end, offset, interiorPoint),
    ),
  );
}

function offsetClosedBoundary(points, distance) {
  const clean = dedupeSequentialPoints(points);
  if (clean.length < 3 || Math.abs(distance) <= 0.000001) return clean;
  const signedArea = polygonArea2(clean);
  if (Math.abs(signedArea) < 0.0001) return clean;
  const inwardSign = signedArea > 0 ? 1 : -1;
  return clean.map((current, index) => {
    const previous = clean[(index - 1 + clean.length) % clean.length];
    const next = clean[(index + 1) % clean.length];
    const prevLine = insetLine(previous, current, distance, inwardSign);
    const nextLine = insetLine(current, next, distance, inwardSign);
    const intersection = intersectInsetLines(prevLine, nextLine);
    if (!intersection) return fallbackInsetPoint(current, prevLine.normal, nextLine.normal, distance);
    const miterDistance = Math.hypot(intersection[0] - current[0], intersection[1] - current[1]);
    if (miterDistance > Math.abs(distance) * 5) return fallbackInsetPoint(current, prevLine.normal, nextLine.normal, distance);
    return intersection;
  });
}

function insetLine(start, end, distance, inwardSign) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const length = Math.hypot(dx, dy) || 1;
  const normal = [(-dy / length) * inwardSign, (dx / length) * inwardSign];
  return {
    point: [start[0] + normal[0] * distance, start[1] + normal[1] * distance],
    direction: [dx / length, dy / length],
    normal,
  };
}

function intersectInsetLines(a, b) {
  const cross = a.direction[0] * b.direction[1] - a.direction[1] * b.direction[0];
  if (Math.abs(cross) < 0.0001) return null;
  const dx = b.point[0] - a.point[0];
  const dy = b.point[1] - a.point[1];
  const t = (dx * b.direction[1] - dy * b.direction[0]) / cross;
  return [a.point[0] + a.direction[0] * t, a.point[1] + a.direction[1] * t];
}

function fallbackInsetPoint(point, normalA, normalB, distance) {
  const nx = normalA[0] + normalB[0];
  const ny = normalA[1] + normalB[1];
  const length = Math.hypot(nx, ny) || 1;
  return [point[0] + (nx / length) * distance, point[1] + (ny / length) * distance];
}

function offsetSegmentTowardInterior(start, end, offset, interiorPoint) {
  if (!offset) return [start, end];
  const [normalX, normalY] = edgeInteriorNormal(start, end, interiorPoint);
  return [
    [start[0] + normalX * offset, start[1] + normalY * offset],
    [end[0] + normalX * offset, end[1] + normalY * offset],
  ];
}

function normalizeEdgeOffsetCount(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return DEFAULT_RENDER_SETTINGS.edgeOffsetCount;
  return Math.max(1, Math.min(12, Math.round(number)));
}

function normalizeEdgeOffsetDistance(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return DEFAULT_RENDER_SETTINGS.edgeOffsetDistance;
  return Math.max(0, Math.min(80, number));
}

function stageEdgeWorldOffsetDistance(value) {
  return normalizeEdgeOffsetDistance(value) * 0.006;
}

function segmentInteriorPoint(segments) {
  const points = uniqueSegmentCoordinatePoints(segments);
  if (!points.length) return null;
  const total = points.reduce(
    (sum, [x, y]) => {
      sum.x += x;
      sum.y += y;
      return sum;
    },
    { x: 0, y: 0 },
  );
  return [total.x / points.length, total.y / points.length];
}

function edgeInteriorNormal(start, end, interiorPoint) {
  const dx = end[0] - start[0];
  const dz = end[1] - start[1];
  const length = Math.hypot(dx, dz) || 1;
  let normalX = -dz / length;
  let normalZ = dx / length;
  if (interiorPoint) {
    const midX = (start[0] + end[0]) / 2;
    const midZ = (start[1] + end[1]) / 2;
    const towardInteriorX = interiorPoint[0] - midX;
    const towardInteriorZ = interiorPoint[1] - midZ;
    if (normalX * towardInteriorX + normalZ * towardInteriorZ < 0) {
      normalX *= -1;
      normalZ *= -1;
    }
  }
  return [normalX, normalZ];
}

function stageEdgeWorldThickness(value) {
  const parsed = Number(value);
  const number = Number.isFinite(parsed) ? Math.max(0, parsed) : DEFAULT_RENDER_SETTINGS.edgeThickness;
  if (number <= 0) return 0;
  return Math.min(0.12, Math.max(0.006, number * 0.006));
}

function uniqueSegmentCoordinatePoints(segments) {
  const points = new Map();
  segments.flat().forEach((point) => {
    const key = `${point[0].toFixed(4)},${point[1].toFixed(4)}`;
    if (!points.has(key)) points.set(key, point);
  });
  return [...points.values()];
}

function createPieceObject(piece, onReady) {
  if (piece.type === 'glb' && (piece.glbDataUrl || piece.glbUrl)) return createGlbPieceObject(piece, onReady);
  if (piece.type === 'obj' && piece.objText) return createObjPieceObject(piece);
  return createShapePieceObject(piece);
}

function createSelectionOutline() {
  const geometry = new THREE.BufferGeometry();
  const material = new THREE.LineBasicMaterial({
    color: '#ffbf3f',
    linewidth: 2,
    depthTest: false,
  });
  const outline = new THREE.LineSegments(geometry, material);
  outline.visible = false;
  outline.renderOrder = 2;
  return outline;
}

function createFramePreviewLine() {
  const geometry = new THREE.BufferGeometry();
  const material = new THREE.LineBasicMaterial({
    color: '#2f7dff',
    linewidth: 3,
    depthTest: false,
    transparent: true,
    opacity: 0.95,
  });
  const line = new THREE.Line(geometry, material);
  line.visible = false;
  line.renderOrder = 8;
  return line;
}

function updateFramePreviewLine(line, points) {
  const cleanPoints = Array.isArray(points) ? points.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y)) : [];
  if (cleanPoints.length < 2) {
    line.visible = false;
    return;
  }
  const top = 1.4;
  const positions = cleanPoints.flatMap((point) => [point.x, top, point.y]);
  line.geometry.dispose();
  line.geometry = new THREE.BufferGeometry();
  line.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  line.visible = true;
}

function getPiecesWorldBounds(pieces) {
  const selectedPieces = Array.isArray(pieces) ? pieces : pieces ? [pieces] : [];
  const worldPoints = getPiecesWorldFootprintSegments(selectedPieces).flatMap((segment) => [segment.start, segment.end]);
  if (!worldPoints.length) return null;
  return {
    minX: Math.min(...worldPoints.map((point) => point.x)),
    maxX: Math.max(...worldPoints.map((point) => point.x)),
    minY: Math.min(...worldPoints.map((point) => point.y)),
    maxY: Math.max(...worldPoints.map((point) => point.y)),
    top: Math.max(...selectedPieces.map((piece) => piece.height || 0)) + 0.1,
  };
}

function getPiecesWorldFootprintSegments(pieces) {
  const selectedPieces = Array.isArray(pieces) ? pieces : pieces ? [pieces] : [];
  return selectedPieces.flatMap((piece) =>
    getRealFootprintSegments(piece).map(([start, end]) => ({
      start: worldFootprintPoint(piece, start),
      end: worldFootprintPoint(piece, end),
    })),
  );
}

function worldFootprintPoint(piece, point) {
  const [x, y] = mirrorLocalPointForPiece(piece, point);
  const [rx, ry] = rotatePoint(x, y, piece.rotation);
  return { x: rx + piece.x, y: ry + piece.y };
}

function getOuterWorldFootprintSegments(pieces) {
  const segments = getPiecesWorldFootprintSegments(pieces);
  const buckets = new Map();
  segments.forEach((segment) => {
    const key = canonicalWorldSegmentKey(segment);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(segment);
  });
  return Array.from(buckets.values()).flatMap((matchingSegments) => (matchingSegments.length === 1 ? matchingSegments : []));
}

function canonicalWorldSegmentKey(segment) {
  const start = worldPointKey(segment.start);
  const end = worldPointKey(segment.end);
  return start < end ? `${start}|${end}` : `${end}|${start}`;
}

function worldPointKey(point) {
  return `${point.x.toFixed(4)},${point.y.toFixed(4)}`;
}

function createGroupFootprintObject(items, active) {
  const root = new THREE.Group();
  updateGroupFootprintObject(root, items, active);
  return root;
}

function updateGroupFootprintObject(root, items, active) {
  const bounds = getPiecesWorldBounds(items);
  if (!bounds) return false;
  const top = bounds.top + 0.04;
  const width = Math.max(0.001, bounds.maxX - bounds.minX);
  const depth = Math.max(0.001, bounds.maxY - bounds.minY);
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  root.children.forEach((child) => disposeObject(child));
  root.clear();
  const hitGeometry = new THREE.PlaneGeometry(width, depth);
  hitGeometry.rotateX(-Math.PI / 2);
  const hitArea = new THREE.Mesh(
    hitGeometry,
    new THREE.MeshBasicMaterial({
      color: '#ffffff',
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  hitArea.position.set(centerX, top, centerY);
  hitArea.renderOrder = 4;
  root.add(hitArea);
  if (!active) return true;
  const linePositions = [
    bounds.minX, top + 0.01, bounds.minY, bounds.maxX, top + 0.01, bounds.minY,
    bounds.maxX, top + 0.01, bounds.minY, bounds.maxX, top + 0.01, bounds.maxY,
    bounds.maxX, top + 0.01, bounds.maxY, bounds.minX, top + 0.01, bounds.maxY,
    bounds.minX, top + 0.01, bounds.maxY, bounds.minX, top + 0.01, bounds.minY,
  ];
  const lineGeometry = new THREE.BufferGeometry();
  lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
  const outline = new THREE.LineSegments(
    lineGeometry,
    new THREE.LineBasicMaterial({
      color: '#ffbf3f',
      depthTest: false,
      transparent: true,
      opacity: 1,
    }),
  );
  outline.renderOrder = 5;
  root.add(outline);
  return true;
}

function updateSelectionOutline(outline, pieces) {
  const selectedPieces = Array.isArray(pieces) ? pieces : pieces ? [pieces] : [];
  if (!selectedPieces.length) {
    outline.visible = false;
    return;
  }
  const groupId =
    selectedPieces.length > 1 && selectedPieces.every((piece) => piece.groupInstanceId && piece.groupInstanceId === selectedPieces[0].groupInstanceId)
      ? selectedPieces[0].groupInstanceId
      : null;
  if (groupId) {
    outline.visible = false;
    return;
  }
  const positions = selectedPieces.flatMap((piece) =>
    getRealFootprintSegments(piece).flatMap(([start, end]) =>
      [start, end].flatMap((point) => {
        const [x, y] = mirrorLocalPointForPiece(piece, point);
        const [rx, ry] = rotatePoint(x, y, piece.rotation);
        return [rx + piece.x, (Number(piece.elevation) || 0) + piece.height + 0.08, ry + piece.y];
      }),
    ),
  );
  outline.geometry.dispose();
  outline.geometry = new THREE.BufferGeometry();
  outline.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  outline.visible = true;
}

function createShapePieceObject(piece) {
  const shape = new THREE.Shape();
  const points = getLocalCollisionPoints(piece);
  points.forEach(([x, y], index) => {
    if (index === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  });
  shape.closePath();
  const height = Math.max(0.02, Number(piece.height) || 0.18);
  const bevelEnabled = !piece.isFrameSlice;
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled,
    bevelThickness: bevelEnabled ? Math.min(0.018, height * 0.18) : 0,
    bevelSize: bevelEnabled ? 0.018 : 0,
    bevelSegments: bevelEnabled ? 3 : 0,
  });
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, height, 0);
  const material = new THREE.MeshStandardMaterial({
    color: piece.color,
    metalness: 0.08,
    roughness: 0.42,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createObjPieceObject(piece) {
  const loader = new OBJLoader();
  const object = loader.parse(piece.objText);
  const root = new THREE.Group();

  normalizeImportedObject(object, piece);
  object.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = true;
    child.receiveShadow = true;
    child.material = new THREE.MeshStandardMaterial({
      color: piece.color,
      metalness: 0.08,
      roughness: 0.42,
    });
  });
  root.add(object);
  return root;
}

const GLB_SOURCE_MODEL_CACHE = new Map();

function glbSourceCacheKey(piece) {
  if (piece.glbUrl) return `url:${piece.glbUrl}`;
  if (piece.glbDataUrl) return `data:${piece.glbDataUrl}`;
  return `missing:${piece.id || piece.name || 'unknown'}`;
}

function cachedGlbSourceModel(piece) {
  const key = glbSourceCacheKey(piece);
  if (!GLB_SOURCE_MODEL_CACHE.has(key)) {
    const loader = new GLTFLoader();
    GLB_SOURCE_MODEL_CACHE.set(
      key,
      pieceModelToArrayBuffer(piece).then(
        (buffer) =>
          new Promise((resolve, reject) => {
            loader.parse(buffer, '', (gltf) => resolve(gltf.scene), reject);
          }),
      ),
    );
  }
  return GLB_SOURCE_MODEL_CACHE.get(key);
}

function createGlbPieceObject(piece, onReady) {
  const root = new THREE.Group();
  cachedGlbSourceModel(piece)
    .then((source) => {
      const object = source.clone(true);
      normalizeImportedObject(object, piece);
      object.traverse((child) => {
        if (!child.isMesh) return;
        child.castShadow = true;
        child.receiveShadow = true;
        if (child.geometry) child.geometry.userData = { ...child.geometry.userData, cachedGlbSource: true };
        child.material = new THREE.MeshStandardMaterial({
          color: piece.color,
          metalness: 0.08,
          roughness: 0.42,
        });
      });
      root.add(object);
      onReady?.();
    })
    .catch((error) => console.error('Failed to read GLB piece', error));
  return root;
}

function normalizeImportedObject(object, piece) {
  const bounds = new THREE.Box3().setFromObject(object);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const verticalScale = importedUniformScale(piece, size.y || piece.sourceHeightPx || 1);
  const sourceWidth = Number(piece.sourceWidthPx) || size.x || 1;
  const sourceLength = Number(piece.sourceLengthPx) || size.z || 1;
  const stageWidth = Number(piece.stageWidth);
  const stageLength = Number(piece.stageLength);
  const fallbackScale = piece.keepAspectRatio === false ? Number(piece.sourceFootprintScale) || 1 : verticalScale;
  const scaleX = Number.isFinite(stageWidth) && stageWidth > 0 ? stageWidth / sourceWidth : fallbackScale;
  const scaleZ = Number.isFinite(stageLength) && stageLength > 0 ? stageLength / sourceLength : fallbackScale;
  object.scale.set(scaleX, verticalScale, scaleZ);
  object.position.set(-center.x * scaleX, -bounds.min.y * verticalScale, -center.z * scaleZ);
}

function applyPieceMaterial(object, piece, materialName, selected, liveShadowsEnabled = false, glassSettings = DEFAULT_GLASS_SETTINGS) {
  const normalizedMaterial = normalizeMaterialName(materialName);
  const isGlass = normalizedMaterial === 'glass';
  const isPaper = normalizedMaterial === 'paper';
  const castsLiveShadow = !!liveShadowsEnabled && !isGlass && !isPaper;
  const signature = [
    piece.color,
    isPaper ? 'paper' : isGlass ? 'glass' : 'plastic',
    selected ? 'selected' : 'normal',
    castsLiveShadow ? 'live-shadows' : 'no-live-shadows',
    isGlass ? glassSettingsSignature(glassSettings) : '',
  ].join('|');
  if (object.userData.materialSignature === signature) return;
  object.userData.materialSignature = signature;
  object.traverse((child) => {
    if (child.userData?.isStageEdge || child.userData?.isSurfaceSticker) return;
    if (!child.isMesh || !child.material) return;
    child.castShadow = castsLiveShadow;
    child.receiveShadow = castsLiveShadow;
    if (isGlass) {
      child.material.dispose?.();
      child.material = createArchitecturalGlassMaterial(piece, selected, glassSettings);
      return;
    }
    if (child.material.isMeshPhysicalMaterial) {
      child.material.dispose?.();
      child.material = new THREE.MeshStandardMaterial();
    }
    child.material.color.set(isPaper ? PAPER_BACKGROUND_COLOR : piece.color);
    child.material.metalness = isPaper ? 0 : 0.08;
    child.material.roughness = isPaper ? 0.72 : 0.42;
    child.material.transparent = false;
    child.material.opacity = 1;
    child.material.depthWrite = true;
    child.material.side = THREE.FrontSide;
    if ('clearcoat' in child.material) child.material.clearcoat = 0;
    if ('clearcoatRoughness' in child.material) child.material.clearcoatRoughness = 0;
    if ('transmission' in child.material) child.material.transmission = 0;
    if ('thickness' in child.material) child.material.thickness = 0;
    if ('ior' in child.material) child.material.ior = 1.5;
    if ('attenuationColor' in child.material) child.material.attenuationColor.set('#ffffff');
    if ('attenuationDistance' in child.material) child.material.attenuationDistance = Infinity;
    child.material.emissive?.set(isPaper ? PAPER_BACKGROUND_COLOR : selected ? '#362000' : '#000000');
    child.material.emissiveIntensity = isPaper ? 0.18 : selected ? 0.12 : 0;
    child.material.needsUpdate = true;
  });
}

function GlassAppearanceControls({ settings, onChange }) {
  const normalized = normalizeGlassSettings(settings);
  const displayValue = (field) => normalized[field.id] * 100;
  const update = (field, rawValue) => {
    const numericValue = Number(rawValue);
    if (!Number.isFinite(numericValue)) return;
    onChange({
      ...normalized,
      [field.id]: numericValue / 100,
    });
  };
  return (
    <div className="glass-appearance-controls" aria-label="Glass appearance controls">
      <div className="glass-controls-heading">
        <span>Glass appearance</span>
        <button type="button" onClick={() => onChange({ ...DEFAULT_GLASS_SETTINGS })}>Reset</button>
      </div>
      {GLASS_CONTROL_FIELDS.map((field) => (
        <label className="glass-slider" key={field.id}>
          <span>{field.label}</span>
          <input
            type="range"
            min={field.min}
            max={field.max}
            step={field.step}
            value={displayValue(field)}
            onChange={(event) => update(field, event.target.value)}
          />
          <output>{Math.round(displayValue(field) * (field.id === 'thickness' ? 10 : 1)) / (field.id === 'thickness' ? 10 : 1)}{field.unit}</output>
        </label>
      ))}
    </div>
  );
}

function glassOpticalThickness(piece, glassSettings = DEFAULT_GLASS_SETTINGS) {
  return clamp(
    normalizeGlassSettings(glassSettings).thickness,
    GLASS_MIN_OPTICAL_THICKNESS,
    GLASS_MAX_OPTICAL_THICKNESS,
  );
}

const GLASS_SURFACE_TEXTURE_CACHE = new Map();

function createGlassSurfaceTexture(color, glassSettings = DEFAULT_GLASS_SETTINGS) {
  const baseColor = normalizeHexColor(color, '#1c7c74');
  const settings = normalizeGlassSettings(glassSettings);
  const cacheKey = `${baseColor}|${glassSettingsSignature(settings)}`;
  if (GLASS_SURFACE_TEXTURE_CACHE.has(cacheKey)) return GLASS_SURFACE_TEXTURE_CACHE.get(cacheKey);
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  context.fillStyle = baseColor;
  context.fillRect(0, 0, size, size);

  const lightColor = new THREE.Color(baseColor).lerp(new THREE.Color('#ffffff'), 0.08 + settings.highlight * 0.2).getStyle();
  const darkColor = new THREE.Color(baseColor).lerp(new THREE.Color('#05070a'), 0.08 + settings.edgeDarkness * 0.34).getStyle();
  const directional = context.createLinearGradient(0, 0, size, size);
  directional.addColorStop(0, lightColor);
  directional.addColorStop(0.38, baseColor);
  directional.addColorStop(1, darkColor);
  context.globalAlpha = 0.7;
  context.fillStyle = directional;
  context.fillRect(0, 0, size, size);

  const centerGlow = context.createRadialGradient(size * 0.38, size * 0.34, 0, size * 0.5, size * 0.5, size * 0.72);
  centerGlow.addColorStop(0, `rgba(255,255,255,${0.05 + settings.highlight * 0.13})`);
  centerGlow.addColorStop(0.58, 'rgba(255,255,255,0)');
  centerGlow.addColorStop(1, `rgba(3,5,8,${0.05 + settings.edgeDarkness * 0.2})`);
  context.globalAlpha = 1;
  context.fillStyle = centerGlow;
  context.fillRect(0, 0, size, size);

  if (settings.frosted > 0.01) {
    let seed = Number.parseInt(baseColor.slice(1), 16) || 1;
    context.globalAlpha = 0.018 + settings.frosted * 0.075;
    for (let index = 0; index < 54; index += 1) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const x = (seed & 0xffff) / 0xffff * size;
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const y = (seed & 0xffff) / 0xffff * size;
      const radius = 0.5 + ((seed >>> 16) / 0xffff) * 2.2;
      context.fillStyle = index % 3 ? '#ffffff' : '#0b1015';
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
    }
  }
  context.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 4;
  texture.userData.sharedGlassTexture = true;
  texture.needsUpdate = true;
  GLASS_SURFACE_TEXTURE_CACHE.set(cacheKey, texture);
  return texture;
}

function createArchitecturalGlassMaterial(piece, selected = false, glassSettings = DEFAULT_GLASS_SETTINGS) {
  const settings = normalizeGlassSettings(glassSettings);
  const baseColor = normalizeHexColor(piece.color, '#1c7c74');
  const tint = glassTintColor(baseColor);
  const roughness = clamp(0.16 - settings.glossiness * 0.135 + settings.frosted * 0.24, 0.015, 0.36);
  return new THREE.MeshPhysicalMaterial({
    color: '#ffffff',
    map: createGlassSurfaceTexture(baseColor, settings),
    metalness: 0,
    roughness,
    transmission: settings.transparency,
    thickness: glassOpticalThickness(piece, settings),
    ior: GLASS_IOR,
    specularIntensity: 0.35 + settings.reflection * 0.65,
    specularColor: '#ffffff',
    clearcoat: 0.2 + settings.highlight * 0.8,
    clearcoatRoughness: clamp((1 - settings.glossiness) * 0.1 + settings.frosted * 0.18, 0.008, 0.24),
    attenuationColor: tint,
    attenuationDistance: 0.42 - settings.edgeDarkness * 0.3,
    envMapIntensity: 0.4 + settings.reflection * 1.45,
    transparent: false,
    opacity: 1,
    depthWrite: true,
    depthTest: true,
    side: THREE.FrontSide,
    emissive: new THREE.Color(selected ? '#2c1b08' : '#000000'),
    emissiveIntensity: selected ? 0.045 : 0,
  });
}

function getPieceRoot(object) {
  let current = object;
  while (current.parent && !current.userData.id) current = current.parent;
  return current;
}

function disposeObject(object) {
  object.traverse((child) => {
    if (child.geometry && !child.geometry.userData?.cachedGlbSource) child.geometry.dispose();
    if (Array.isArray(child.material)) {
      child.material.forEach((material) => {
        if (!material.map?.userData?.sharedGlassTexture && !material.map?.userData?.sharedSurfaceStickerTexture) material.map?.dispose();
        material.dispose();
      });
    } else if (child.material) {
      if (!child.material.map?.userData?.sharedGlassTexture && !child.material.map?.userData?.sharedSurfaceStickerTexture) child.material.map?.dispose();
      child.material.dispose();
    }
  });
}

function findBestSnap(moving, others, options = {}) {
  const collided = options.collided || collidingPieces(moving, others);
  const isColliding = collided.length > 0;
  const snapTargets = isColliding ? collided : nearbySnapTargets(moving, others);
  const blockerScope = relevantSnapBlockers(moving, others, snapTargets);
  const movingEdges = visibleWorldEdges(moving, [moving, ...blockerScope, ...(options.edgeBlockers || [])]);
  let best = null;
  snapTargets.forEach((target) => {
    if (moving.sourceId && target.sourceId && moving.sourceId === target.sourceId) return;
    const targetEdges = visibleWorldEdges(target, blockerScope);
    movingEdges.forEach((movingEdge, movingEdgeIndex) => {
      targetEdges.forEach((targetEdge, targetEdgeIndex) => {
        const angle = normalizeAngle(targetEdge.angle + Math.PI - movingEdge.angle);
        const lengthDelta = Math.abs(movingEdge.length - targetEdge.length);
        const lengthTolerance = Math.max(0.025, Math.min(movingEdge.length, targetEdge.length) * 0.04);
        if (lengthDelta > lengthTolerance) return;
        const releaseFaceScore = touchingFaceScore(movingEdge, targetEdge);
        const rotation = moving.rotation + shortAngle(angle);
        const rotated = { ...moving, rotation };
        const updatedMovingEdge = worldEdges(rotated)[movingEdge.localIndex ?? movingEdgeIndex];
        const targetMatch = targetEdges[targetEdgeIndex];
        const distance = updatedMovingEdge.mid.distanceTo(targetMatch.mid);
        if (!isColliding && distance > SNAP_DISTANCE) return;
        const delta = targetMatch.mid.clone().sub(updatedMovingEdge.mid);
        const transform = {
          x: moving.x + delta.x,
          y: moving.y + delta.y,
          rotation,
        };
        const candidate = { ...moving, ...transform };
        if (collidesWithAny(candidate, relevantCollisionTargets(candidate, blockerScope))) return;
        const alignedEdge = worldEdges(candidate)[movingEdge.localIndex ?? movingEdgeIndex];
        const endpointGap = alignedEdge.start.distanceTo(targetMatch.end) + alignedEdge.end.distanceTo(targetMatch.start);
        const contactWeight = isColliding ? 30 : 8;
        const score = releaseFaceScore * contactWeight + distance + endpointGap * 4 + lengthDelta * 6 + Math.abs(shortAngle(angle)) * 0.03;
        if (!best || score < best.score) {
          best = {
            score,
            targetId: target.id,
            transform,
          };
        }
      });
    });
  });
  return best;
}

function findBestCollisionPlacement(moving, others, options = {}) {
  const collided = options.collided || collidingPieces(moving, others);
  if (!collided.length) return null;
  const snapTargets = closestCollisionTargets(moving, collided);
  const blockerScope = relevantSnapBlockers(moving, others, snapTargets);
  const movingEdges = visibleWorldEdges(moving, [moving, ...blockerScope, ...(options.edgeBlockers || [])]);
  let best = null;

  snapTargets.forEach((target) => {
    if (moving.sourceId && target.sourceId && moving.sourceId === target.sourceId) return;
    const targetEdges = visibleWorldEdges(target, blockerScope);
    movingEdges.forEach((movingEdge, movingEdgeIndex) => {
      targetEdges.forEach((targetEdge) => {
        const lengthDelta = Math.abs(movingEdge.length - targetEdge.length);
        const lengthTolerance = Math.max(0.025, Math.min(movingEdge.length, targetEdge.length) * 0.04);
        if (lengthDelta > lengthTolerance) return;
        const lengthPenalty = lengthDelta / Math.max(0.0001, Math.min(movingEdge.length, targetEdge.length));
        const releaseFaceScore = touchingFaceScore(movingEdge, targetEdge);
        const rotationOptions = [
          moving.rotation + shortAngle(normalizeAngle(targetEdge.angle + Math.PI - movingEdge.angle)),
          moving.rotation + shortAngle(normalizeAngle(targetEdge.angle - movingEdge.angle)),
        ];

        rotationOptions.forEach((rotation) => {
          const rotated = { ...moving, rotation };
          const updatedMovingEdge = worldEdges(rotated)[movingEdge.localIndex ?? movingEdgeIndex];
          const delta = targetEdge.mid.clone().sub(updatedMovingEdge.mid);
          const transform = {
            x: moving.x + delta.x,
            y: moving.y + delta.y,
            rotation,
          };
          const candidate = { ...moving, ...transform };
          if (collidesWithAny(candidate, relevantCollisionTargets(candidate, blockerScope))) return;
          const alignedEdge = worldEdges(candidate)[movingEdge.localIndex ?? movingEdgeIndex];
          const endpointGap = Math.min(
            alignedEdge.start.distanceTo(targetEdge.end) + alignedEdge.end.distanceTo(targetEdge.start),
            alignedEdge.start.distanceTo(targetEdge.start) + alignedEdge.end.distanceTo(targetEdge.end),
          );
          const score = releaseFaceScore * 40 + lengthPenalty * 6 + endpointGap * 2 + Math.abs(shortAngle(rotation - moving.rotation)) * 0.02;
          if (!best || score < best.score) {
            best = {
              score,
              targetId: target.id,
              transform,
            };
          }
        });
      });
    });
  });

  return best;
}

function findNextSnappedFace(moving, others) {
  const contacts = snappedFaceContacts(moving, others);
  const targetIds = new Set(contacts.map((contact) => contact.targetId));
  if (!targetIds.size && moving.snappedTo) targetIds.add(moving.snappedTo);
  if (!targetIds.size) return null;

  const movingEdges = visibleWorldEdges(moving, [moving, ...others]);
  let best = null;

  others
    .filter((target) => targetIds.has(target.id))
    .forEach((target) => {
      if (moving.sourceId && target.sourceId && moving.sourceId === target.sourceId) return;
      const targetEdges = visibleWorldEdges(target, others);
      const targetContacts = contacts.filter((contact) => contact.targetId === target.id);
      const currentTargetPositions = new Set(targetContacts.map((contact) => contact.targetEdgePosition));
      const preferredMovingIndexes = new Set(targetContacts.map((contact) => contact.movingEdgeIndex));
      const anchorTargetPosition = targetContacts[0]?.targetEdgePosition ?? -1;

      movingEdges.forEach((movingEdge, movingEdgeIndex) => {
        targetEdges.forEach((targetEdge, targetEdgePosition) => {
          if (currentTargetPositions.has(targetEdgePosition)) return;
          const lengthDelta = Math.abs(movingEdge.length - targetEdge.length);
          const lengthTolerance = Math.max(0.025, Math.min(movingEdge.length, targetEdge.length) * 0.04);
          if (lengthDelta > lengthTolerance) return;

          const angle = normalizeAngle(targetEdge.angle + Math.PI - movingEdge.angle);
          const rotation = moving.rotation + shortAngle(angle);
          const rotated = { ...moving, rotation };
          const updatedMovingEdge = worldEdges(rotated)[movingEdge.localIndex ?? movingEdgeIndex];
          const delta = targetEdge.mid.clone().sub(updatedMovingEdge.mid);
          const transform = {
            x: moving.x + delta.x,
            y: moving.y + delta.y,
            rotation,
          };
          const candidate = { ...moving, ...transform };
          if (sameTransform(moving, candidate)) return;
          if (collidesWithAny(candidate, others)) return;

          const alignedEdge = worldEdges(candidate)[movingEdge.localIndex ?? movingEdgeIndex];
          const endpointGap = alignedEdge.start.distanceTo(targetEdge.end) + alignedEdge.end.distanceTo(targetEdge.start);
          const faceStep = cycleDistance(targetEdges.length, anchorTargetPosition, targetEdgePosition);
          const movingFacePenalty = preferredMovingIndexes.size && !preferredMovingIndexes.has(movingEdgeIndex) ? 3 : 0;
          const score = faceStep * 100 + movingFacePenalty + endpointGap * 4 + lengthDelta * 8 + Math.abs(shortAngle(angle)) * 0.03;
          if (!best || score < best.score) {
            best = {
              score,
              targetId: target.id,
              transform,
            };
          }
        });
      });
    });

  return best;
}

function snappedFaceContacts(piece, others) {
  const movingEdges = visibleWorldEdges(piece, [piece, ...others]);
  const contacts = [];
  others.forEach((target) => {
    if (piece.sourceId && target.sourceId && piece.sourceId === target.sourceId) return;
    const targetEdges = visibleWorldEdges(target, others);
    movingEdges.forEach((movingEdge, movingEdgeIndex) => {
      targetEdges.forEach((targetEdge, targetEdgePosition) => {
        if (!edgesTouchFaceToFace(movingEdge, targetEdge)) return;
        contacts.push({
          targetId: target.id,
          movingEdgeIndex,
          targetEdgePosition,
        });
      });
    });
  });
  return contacts;
}

function cycleDistance(total, fromIndex, toIndex) {
  if (total <= 0 || fromIndex < 0) return 0;
  const distance = (toIndex - fromIndex + total) % total;
  return distance || total;
}

function sameTransform(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y) < 0.001 && Math.abs(shortAngle(a.rotation - b.rotation)) < 0.001;
}

function collidesWithAny(piece, others) {
  return collidingPieces(piece, others).length > 0;
}

function collidingPieces(piece, others) {
  const pieceCollision = collisionInfo(piece);
  return others.filter((other) => {
    const otherCollision = collisionInfo(other);
    if (!boundsOverlap(pieceCollision.bounds, otherCollision.bounds)) return false;
    return polygonsOverlap(pieceCollision.polygon, otherCollision.polygon);
  });
}

const PIECE_COLLISION_INFO_CACHE = new WeakMap();
const PIECE_WORLD_EDGES_CACHE = new WeakMap();

function collisionInfo(piece) {
  if (piece && typeof piece === 'object') {
    const cached = PIECE_COLLISION_INFO_CACHE.get(piece);
    if (cached) return cached;
  }
  const polygon = collisionPolygon(piece);
  const info = {
    polygon,
    bounds: polygonBounds(polygon),
    center: polygonCenter(polygon),
  };
  if (piece && typeof piece === 'object') PIECE_COLLISION_INFO_CACHE.set(piece, info);
  return info;
}

function polygonBounds(points) {
  if (!points.length) return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  return points.reduce(
    (bounds, point) => ({
      minX: Math.min(bounds.minX, point.x),
      maxX: Math.max(bounds.maxX, point.x),
      minY: Math.min(bounds.minY, point.y),
      maxY: Math.max(bounds.maxY, point.y),
    }),
    { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity },
  );
}

function polygonCenter(points) {
  if (!points.length) return new THREE.Vector2();
  return points.reduce((sum, point) => sum.add(point), new THREE.Vector2()).multiplyScalar(1 / points.length);
}

function boundsOverlap(a, b, padding = 0) {
  return a.minX <= b.maxX + padding && a.maxX >= b.minX - padding && a.minY <= b.maxY + padding && a.maxY >= b.minY - padding;
}

function closestCollisionTargets(moving, targets, limit = 2) {
  if (targets.length <= limit) return targets;
  const movingCenter = collisionInfo(moving).center;
  return [...targets]
    .sort((a, b) => collisionInfo(a).center.distanceToSquared(movingCenter) - collisionInfo(b).center.distanceToSquared(movingCenter))
    .slice(0, limit);
}

function nearbySnapTargets(moving, others) {
  const movingBounds = collisionInfo(moving).bounds;
  return others.filter((other) => boundsOverlap(movingBounds, collisionInfo(other).bounds, SNAP_DISTANCE + 0.35));
}

function relevantSnapBlockers(moving, others, targets) {
  if (!targets.length) return nearbySnapTargets(moving, others);
  const relevant = new Map();
  const movingBounds = collisionInfo(moving).bounds;
  others.forEach((other) => {
    const otherBounds = collisionInfo(other).bounds;
    if (boundsOverlap(movingBounds, otherBounds, SNAP_DISTANCE + 0.35) || targets.some((target) => boundsOverlap(collisionInfo(target).bounds, otherBounds, SNAP_DISTANCE + 0.35))) {
      relevant.set(other.id, other);
    }
  });
  return [...relevant.values()];
}

function relevantCollisionTargets(candidate, others) {
  const candidateBounds = collisionInfo(candidate).bounds;
  return others.filter((other) => boundsOverlap(candidateBounds, collisionInfo(other).bounds, 0.08));
}

function collisionPolygon(piece) {
  const points = getLocalCollisionPoints(piece).map((point) => {
    const [x, y] = mirrorLocalPointForPiece(piece, point);
    const [rx, ry] = rotatePoint(x, y, piece.rotation);
    return new THREE.Vector2(rx + piece.x, ry + piece.y);
  });
  return points.length >= 3 ? points : worldEdges(piece).flatMap((edge) => [edge.start, edge.end]);
}

function getLocalCollisionPoints(piece) {
  return scaleLocalPointsForPiece(piece, getBaseLocalCollisionPoints(piece));
}

function getBaseLocalCollisionPoints(piece) {
  if ((piece.type === 'obj' || piece.type === 'glb') && piece.snapEdges?.length) {
    const boundary = orderedBoundaryPoints(piece.snapEdges);
    if (boundary.length >= 3) return boundary;
  }
  if (piece.points?.length) return piece.points;
  const rawSegments = piece.snapEdges?.length ? piece.snapEdges : [];
  const edgePoints = rawSegments.flat();
  return convexHull(dedupePoints(edgePoints));
}

function polygonsOverlap(a, b) {
  if (a.length < 3 || b.length < 3) return false;
  if (!polygonArea(a) || !polygonArea(b)) return false;
  if (polygonsHavePositiveAreaOverlap(a, b)) return true;
  for (let aIndex = 0; aIndex < a.length; aIndex += 1) {
    const aStart = a[aIndex];
    const aEnd = a[(aIndex + 1) % a.length];
    for (let bIndex = 0; bIndex < b.length; bIndex += 1) {
      const bStart = b[bIndex];
      const bEnd = b[(bIndex + 1) % b.length];
      if (segmentsProperlyIntersect(aStart, aEnd, bStart, bEnd)) return true;
    }
  }
  if (a.some((point) => pointInsidePolygon(point, b)) || b.some((point) => pointInsidePolygon(point, a))) return true;
  return polygonsShareSameOccupiedArea(a, b);
}

function framePlacedPieces(pieces, frameLoop) {
  const loop = normalizeFrameLoop(frameLoop);
  if (loop.length < 3 || Math.abs(polygonSignedArea(loop)) < 0.000001) return pieces;
  const loopIsConvex = isConvexPolygon(loop);
  const frameTriangles = loopIsConvex ? [] : triangulateFrameLoop(loop);
  return pieces.flatMap((piece) => {
    const polygon = collisionPolygon(piece);
    if (polygon.length < 3) return [];
    const allInside = polygon.every((point) => pointInsideOrOnPolygon(point, loop)) && !polygonBoundaryIntersectsFrame(polygon, loop);
    if (allInside) return [piece];
    const clippedPolygons = loopIsConvex
      ? [clipPolygonToConvexFrame(polygon, loop)]
      : clipPolygonToFrameTriangles(polygon, frameTriangles);
    const validClippedPolygons = clippedPolygons
      .map((clipped) => cleanClippedPolygon(clipped))
      .filter((clipped) => clipped.length >= 3 && polygonArea(clipped) >= 0.0001);
    return mergeAdjacentClippedPolygons(validClippedPolygons)
      .map((clipped) => createFramedSlicePiece(piece, clipped));
  });
}

function normalizeFrameLoop(points) {
  const clean = points
    .filter((point) => point && Number.isFinite(point.x) && Number.isFinite(point.y))
    .map((point) => new THREE.Vector2(point.x, point.y));
  if (clean.length > 1 && clean[0].distanceTo(clean[clean.length - 1]) < 0.0001) clean.pop();
  return clean;
}

function pointInsideOrOnPolygon(point, polygon) {
  return pointOnPolygonBoundary(point, polygon) || pointInsidePolygon(point, polygon);
}

function polygonSignedArea(points) {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += current.x * next.y - next.x * current.y;
  }
  return area * 0.5;
}

function clipPolygonToConvexFrame(subject, frame) {
  const orientation = Math.sign(polygonSignedArea(frame)) || 1;
  let output = subject.map((point) => point.clone());
  for (let edgeIndex = 0; edgeIndex < frame.length; edgeIndex += 1) {
    const edgeStart = frame[edgeIndex];
    const edgeEnd = frame[(edgeIndex + 1) % frame.length];
    const input = output;
    output = [];
    if (!input.length) break;
    let previous = input[input.length - 1];
    let previousInside = pointInsideClipEdge(previous, edgeStart, edgeEnd, orientation);
    input.forEach((current) => {
      const currentInside = pointInsideClipEdge(current, edgeStart, edgeEnd, orientation);
      if (currentInside !== previousInside) {
        const intersection = segmentLineIntersection(previous, current, edgeStart, edgeEnd);
        if (intersection) output.push(intersection);
      }
      if (currentInside) output.push(current.clone());
      previous = current;
      previousInside = currentInside;
    });
  }
  return dedupeVectorPoints(output);
}

function clipPolygonToFrameTriangles(subject, triangles) {
  if (!triangles.length) return [];
  return triangles.map((triangle) => clipPolygonToConvexFrame(subject, triangle));
}

function triangulateFrameLoop(frame) {
  const contour = polygonSignedArea(frame) < 0 ? [...frame].reverse() : [...frame];
  const faces = THREE.ShapeUtils.triangulateShape(contour, []);
  return faces
    .map((face) => face.map((index) => contour[index]?.clone()).filter(Boolean))
    .filter((triangle) => triangle.length === 3 && polygonArea(triangle) >= 0.0001);
}

function cleanClippedPolygon(points) {
  let clean = dedupeVectorPoints(points);
  if (clean.length > 1 && clean[0].distanceTo(clean[clean.length - 1]) < 0.0001) clean.pop();
  clean = simplifyFrameSlicePolygon(clean);
  return polygonSignedArea(clean) < 0 ? [...clean].reverse() : clean;
}

function mergeAdjacentClippedPolygons(polygons) {
  const boundaryLoops = mergeClippedPolygonBoundaryLoops(polygons);
  if (boundaryLoops.length) return boundaryLoops;
  const merged = polygons.map((polygon) => cleanClippedPolygon(polygon));
  let didMerge = true;
  while (didMerge && merged.length > 1) {
    didMerge = false;
    const candidatePoints = merged.flat();
    const splitPolygons = merged.map((polygon) => splitPolygonEdgesAtPoints(polygon, candidatePoints));
    for (let firstIndex = 0; firstIndex < splitPolygons.length && !didMerge; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < splitPolygons.length; secondIndex += 1) {
        const combined = mergePolygonsAlongSharedEdge(splitPolygons[firstIndex], splitPolygons[secondIndex]);
        if (!combined) continue;
        merged[firstIndex] = cleanClippedPolygon(combined);
        merged.splice(secondIndex, 1);
        didMerge = true;
        break;
      }
    }
  }
  return merged.filter((polygon) => polygon.length >= 3 && polygonArea(polygon) >= 0.0001);
}

function frameBoundaryPointKey(point) {
  return `${Math.round(point.x * 10000)},${Math.round(point.y * 10000)}`;
}

function frameBoundaryEdgeKey(start, end) {
  const startKey = frameBoundaryPointKey(start);
  const endKey = frameBoundaryPointKey(end);
  return startKey < endKey ? `${startKey}|${endKey}` : `${endKey}|${startKey}`;
}

function mergeClippedPolygonBoundaryLoops(polygons) {
  if (!polygons.length) return [];
  const cleanPolygons = polygons.map((polygon) => cleanClippedPolygon(polygon));
  const candidatePoints = cleanPolygons.flat();
  const splitPolygons = cleanPolygons.map((polygon) => splitPolygonEdgesAtPoints(polygon, candidatePoints));
  const boundaryEdges = new Map();
  splitPolygons.forEach((polygon) => {
    polygon.forEach((start, index) => {
      const end = polygon[(index + 1) % polygon.length];
      if (start.distanceTo(end) <= 0.0001) return;
      const key = frameBoundaryEdgeKey(start, end);
      if (boundaryEdges.has(key)) boundaryEdges.delete(key);
      else boundaryEdges.set(key, { start: start.clone(), end: end.clone() });
    });
  });
  const remaining = [...boundaryEdges.values()];
  const loops = [];
  while (remaining.length) {
    const first = remaining.shift();
    const loop = [first.start.clone(), first.end.clone()];
    const startKey = frameBoundaryPointKey(first.start);
    let currentKey = frameBoundaryPointKey(first.end);
    for (let guard = 0; guard <= boundaryEdges.size + 2 && currentKey !== startKey; guard += 1) {
      let nextIndex = remaining.findIndex((edge) => frameBoundaryPointKey(edge.start) === currentKey);
      let reverse = false;
      if (nextIndex < 0) {
        nextIndex = remaining.findIndex((edge) => frameBoundaryPointKey(edge.end) === currentKey);
        reverse = nextIndex >= 0;
      }
      if (nextIndex < 0) break;
      const [next] = remaining.splice(nextIndex, 1);
      const nextPoint = reverse ? next.start : next.end;
      loop.push(nextPoint.clone());
      currentKey = frameBoundaryPointKey(nextPoint);
    }
    if (currentKey !== startKey) continue;
    if (loop.length > 1 && frameBoundaryPointKey(loop[loop.length - 1]) === startKey) loop.pop();
    const cleanLoop = cleanClippedPolygon(loop);
    if (cleanLoop.length >= 3 && polygonArea(cleanLoop) >= 0.0001) loops.push(cleanLoop);
  }
  return loops;
}

function splitPolygonEdgesAtPoints(polygon, candidatePoints) {
  const split = [];
  polygon.forEach((start, index) => {
    const end = polygon[(index + 1) % polygon.length];
    const edge = end.clone().sub(start);
    const edgeLengthSquared = edge.lengthSq();
    const interiorPoints = edgeLengthSquared <= 0.00000001
      ? []
      : candidatePoints
          .filter((point) => point.distanceTo(start) > 0.0001 && point.distanceTo(end) > 0.0001 && pointOnSegment(point, start, end))
          .map((point) => ({ point, position: point.clone().sub(start).dot(edge) / edgeLengthSquared }))
          .filter(({ position }) => position > 0.00001 && position < 0.99999)
          .sort((a, b) => a.position - b.position);
    split.push(start.clone(), ...interiorPoints.map(({ point }) => point.clone()));
  });
  return dedupeVectorPoints(split);
}

function mergePolygonsAlongSharedEdge(first, second) {
  for (let firstEdge = 0; firstEdge < first.length; firstEdge += 1) {
    const firstStart = first[firstEdge];
    const firstEnd = first[(firstEdge + 1) % first.length];
    for (let secondEdge = 0; secondEdge < second.length; secondEdge += 1) {
      const secondStart = second[secondEdge];
      const secondEnd = second[(secondEdge + 1) % second.length];
      if (firstStart.distanceTo(secondEnd) > 0.0002 || firstEnd.distanceTo(secondStart) > 0.0002) continue;
      const firstBoundary = polygonVertexPath(first, (firstEdge + 1) % first.length, firstEdge);
      const secondBoundary = polygonVertexPath(second, (secondEdge + 1) % second.length, secondEdge);
      return dedupeVectorPoints([
        ...firstBoundary,
        ...secondBoundary.slice(1, -1),
      ]);
    }
  }
  return null;
}

function polygonVertexPath(polygon, startIndex, endIndex) {
  const path = [];
  let index = startIndex;
  for (let guard = 0; guard <= polygon.length; guard += 1) {
    path.push(polygon[index].clone());
    if (index === endIndex) break;
    index = (index + 1) % polygon.length;
  }
  return path;
}

function simplifyFrameSlicePolygon(points) {
  let clean = points.filter((point, index) => {
    const next = points[(index + 1) % points.length];
    return !next || point.distanceTo(next) > 0.001;
  });
  let changed = true;
  while (changed && clean.length > 3) {
    changed = false;
    clean = clean.filter((point, index) => {
      const previous = clean[(index - 1 + clean.length) % clean.length];
      const next = clean[(index + 1) % clean.length];
      const prevVector = point.clone().sub(previous);
      const nextVector = next.clone().sub(point);
      const prevLength = prevVector.length();
      const nextLength = nextVector.length();
      if (prevLength < 0.001 || nextLength < 0.001) {
        changed = true;
        return false;
      }
      const cross = Math.abs(prevVector.x * nextVector.y - prevVector.y * nextVector.x);
      const turnArea = cross / Math.max(prevLength * nextLength, 0.000001);
      if (turnArea < 0.002 && previous.distanceTo(next) > 0.001) {
        changed = true;
        return false;
      }
      return true;
    });
  }
  return clean;
}

function polygonBoundaryIntersectsFrame(polygon, frame) {
  return polygon.some((start, index) => {
    const end = polygon[(index + 1) % polygon.length];
    return frame.some((frameStart, frameIndex) =>
      segmentsIntersectOrTouch(start, end, frameStart, frame[(frameIndex + 1) % frame.length]),
    );
  });
}

function segmentsIntersectOrTouch(a, b, c, d) {
  if (segmentsProperlyIntersect(a, b, c, d)) return true;
  return pointOnSegment(a, c, d) || pointOnSegment(b, c, d) || pointOnSegment(c, a, b) || pointOnSegment(d, a, b);
}

function pointOnSegment(point, start, end) {
  const epsilon = 0.0001;
  if (Math.abs(cross2(start, end, point)) > epsilon) return false;
  return (
    point.x >= Math.min(start.x, end.x) - epsilon &&
    point.x <= Math.max(start.x, end.x) + epsilon &&
    point.y >= Math.min(start.y, end.y) - epsilon &&
    point.y <= Math.max(start.y, end.y) + epsilon
  );
}

function pointInsideClipEdge(point, edgeStart, edgeEnd, orientation) {
  const cross = cross2(edgeStart, edgeEnd, point);
  return orientation >= 0 ? cross >= -0.0001 : cross <= 0.0001;
}

function segmentLineIntersection(start, end, lineStart, lineEnd) {
  const segment = end.clone().sub(start);
  const line = lineEnd.clone().sub(lineStart);
  const denominator = segment.x * line.y - segment.y * line.x;
  if (Math.abs(denominator) < 0.000001) return null;
  const diff = lineStart.clone().sub(start);
  const t = (diff.x * line.y - diff.y * line.x) / denominator;
  return start.clone().add(segment.multiplyScalar(t));
}

function dedupeVectorPoints(points) {
  return points.filter((point, index) => index === 0 || point.distanceTo(points[index - 1]) > 0.0001);
}

function pieceLocalPointFromWorld(piece, worldX, worldY) {
  const dx = worldX - (Number(piece.x) || 0);
  const dy = worldY - (Number(piece.y) || 0);
  const rotation = Number(piece.rotation) || 0;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const mirroredX = cos * dx + sin * dy;
  const mirroredY = -sin * dx + cos * dy;
  return [piece.mirrorHorizontal ? -mirroredX : mirroredX, piece.mirrorVertical ? -mirroredY : mirroredY];
}

function centeredSquareBounds(points) {
  if (!Array.isArray(points) || !points.length) return { minX: 0, minY: 0, size: 1 };
  const xs = points.map(([x]) => Number(x)).filter(Number.isFinite);
  const ys = points.map(([, y]) => Number(y)).filter(Number.isFinite);
  if (!xs.length || !ys.length) return { minX: 0, minY: 0, size: 1 };
  const rawMinX = Math.min(...xs);
  const rawMaxX = Math.max(...xs);
  const rawMinY = Math.min(...ys);
  const rawMaxY = Math.max(...ys);
  const size = Math.max(0.0001, rawMaxX - rawMinX, rawMaxY - rawMinY);
  return {
    minX: (rawMinX + rawMaxX - size) / 2,
    minY: (rawMinY + rawMaxY - size) / 2,
    size,
  };
}

function surfaceStickerUvAtLocalPoint(piece, x, y) {
  const transform = piece.surfaceStickerUvTransform;
  if (transform && Object.values(transform).every((value) => Number.isFinite(Number(value)))) {
    return [
      Number(transform.uX) * x + Number(transform.uY) * y + Number(transform.uOffset),
      Number(transform.vX) * x + Number(transform.vY) * y + Number(transform.vOffset),
    ];
  }
  const sourcePoints = getLocalCollisionPoints(piece);
  if (sourcePoints.length < 3) return [0.5, 0.5];
  const bounds = centeredSquareBounds(sourcePoints);
  return [(x - bounds.minX) / bounds.size, 1 - (y - bounds.minY) / bounds.size];
}

function framedSliceStickerUvTransform(piece, center) {
  if (!hasSurfaceStickerContent(piece.surfaceSticker)) return undefined;
  const sample = (sliceX, sliceY) => {
    const [localX, localY] = pieceLocalPointFromWorld(piece, center.x + sliceX, center.y + sliceY);
    return surfaceStickerUvAtLocalPoint(piece, localX, localY);
  };
  const origin = sample(0, 0);
  const horizontal = sample(1, 0);
  const vertical = sample(0, 1);
  return {
    uX: horizontal[0] - origin[0],
    uY: vertical[0] - origin[0],
    uOffset: origin[0],
    vX: horizontal[1] - origin[1],
    vY: vertical[1] - origin[1],
    vOffset: origin[1],
  };
}

function createFramedSlicePiece(piece, worldPolygon) {
  const center = polygonCenter(worldPolygon);
  const localPoints = worldPolygon.map((point) => [Number((point.x - center.x).toFixed(5)), Number((point.y - center.y).toFixed(5))]);
  return {
    ...piece,
    id: `${piece.id}-frame-${crypto.randomUUID()}`,
    sourceId: `${piece.sourceId || piece.id}-frame-slice`,
    name: `${piece.name} slice`,
    type: 'shape',
    isFrameSlice: true,
    objText: '',
    glbDataUrl: '',
    glbUrl: '',
    points: localPoints,
    snapEdges: polygonToEdges(localPoints),
    verticalEdges: [],
    displayEdges: [],
    surfaceStickerUvTransform: framedSliceStickerUvTransform(piece, center),
    sourceHeightPx: '',
    sourceWidthPx: '',
    sourceLengthPx: '',
    sourceFootprintScale: '',
    keepAspectRatio: true,
    stageWidth: undefined,
    stageLength: undefined,
    x: center.x,
    y: center.y,
    rotation: 0,
    mirrorHorizontal: false,
    mirrorVertical: false,
    snappedTo: null,
    groupInstanceId: null,
  };
}

function polygonsHavePositiveAreaOverlap(a, b) {
  if (!isConvexPolygon(a) || !isConvexPolygon(b)) {
    return polygonSamplePoints(a).some((point) => pointInsidePolygon(point, b)) || polygonSamplePoints(b).some((point) => pointInsidePolygon(point, a));
  }
  const axes = [...polygonNormals(a), ...polygonNormals(b)];
  return axes.every((axis) => {
    const projectionA = projectPolygon(a, axis);
    const projectionB = projectPolygon(b, axis);
    const overlap = Math.min(projectionA.max, projectionB.max) - Math.max(projectionA.min, projectionB.min);
    return overlap > 0.002;
  });
}

function isConvexPolygon(points) {
  let sign = 0;
  for (let index = 0; index < points.length; index += 1) {
    const previous = points[index];
    const current = points[(index + 1) % points.length];
    const next = points[(index + 2) % points.length];
    const cross = cross2(previous, current, next);
    if (Math.abs(cross) < 0.0001) continue;
    const nextSign = Math.sign(cross);
    if (!sign) sign = nextSign;
    else if (sign !== nextSign) return false;
  }
  return true;
}

function polygonSamplePoints(points) {
  const centroid = points.reduce((sum, point) => sum.add(point), new THREE.Vector2()).multiplyScalar(1 / points.length);
  const midpoints = points.map((point, index) => point.clone().add(points[(index + 1) % points.length]).multiplyScalar(0.5));
  return [centroid, ...midpoints];
}

function polygonNormals(points) {
  return points
    .map((point, index) => {
      const next = points[(index + 1) % points.length];
      const edge = next.clone().sub(point);
      if (edge.lengthSq() < 0.000001) return null;
      return new THREE.Vector2(-edge.y, edge.x).normalize();
    })
    .filter(Boolean);
}

function projectPolygon(points, axis) {
  const values = points.map((point) => point.dot(axis));
  return { min: Math.min(...values), max: Math.max(...values) };
}

function polygonArea(points) {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += current.x * next.y - next.x * current.y;
  }
  return Math.abs(area) * 0.5;
}

function segmentsProperlyIntersect(a, b, c, d) {
  const epsilon = 0.0001;
  const abC = cross2(a, b, c);
  const abD = cross2(a, b, d);
  const cdA = cross2(c, d, a);
  const cdB = cross2(c, d, b);
  return abC * abD < -epsilon && cdA * cdB < -epsilon;
}

function segmentsOverlapCollinear(a, b, c, d) {
  const epsilon = 0.012;
  if (Math.abs(cross2(a, b, c)) > epsilon || Math.abs(cross2(a, b, d)) > epsilon) return false;
  const axis = b.clone().sub(a);
  if (axis.lengthSq() < 0.000001) return false;
  axis.normalize();
  const a1 = a.dot(axis);
  const a2 = b.dot(axis);
  const c1 = c.dot(axis);
  const c2 = d.dot(axis);
  const minA = Math.min(a1, a2);
  const maxA = Math.max(a1, a2);
  const minB = Math.min(c1, c2);
  const maxB = Math.max(c1, c2);
  const overlap = Math.min(maxA, maxB) - Math.max(minA, minB);
  return overlap > 0.02;
}

function pointInsidePolygon(point, polygon) {
  if (pointOnPolygonBoundary(point, polygon)) return false;
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const currentPoint = polygon[index];
    const previousPoint = polygon[previous];
    const intersects =
      currentPoint.y > point.y !== previousPoint.y > point.y &&
      point.x < ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)) / (previousPoint.y - currentPoint.y) + currentPoint.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointOnPolygonBoundary(point, polygon) {
  return polygon.some((start, index) => pointNearSegment(point, start, polygon[(index + 1) % polygon.length]));
}

function polygonsShareSameOccupiedArea(a, b) {
  if (Math.abs(polygonArea(a) - polygonArea(b)) > 0.0001) return false;
  return a.every((point) => pointOnPolygonBoundary(point, b)) && b.every((point) => pointOnPolygonBoundary(point, a));
}

function pointNearSegment(point, start, end) {
  const segment = end.clone().sub(start);
  const lengthSq = segment.lengthSq();
  if (lengthSq < 0.000001) return point.distanceTo(start) < 0.015;
  const t = THREE.MathUtils.clamp(point.clone().sub(start).dot(segment) / lengthSq, 0, 1);
  const closest = start.clone().add(segment.multiplyScalar(t));
  return point.distanceTo(closest) < 0.015;
}

function touchingFaceScore(edge, targetEdge) {
  const segmentGap = segmentDistance(edge.start, edge.end, targetEdge.start, targetEdge.end);
  const midpointGap = edge.mid.distanceTo(targetEdge.mid);
  const overlapRatio = projectedOverlapRatio(edge, targetEdge);
  return segmentGap * 3 + midpointGap * 0.35 + (1 - overlapRatio) * Math.min(edge.length, targetEdge.length);
}

function segmentDistance(a, b, c, d) {
  if (segmentsProperlyIntersect(a, b, c, d) || segmentsOverlapCollinear(a, b, c, d)) return 0;
  return Math.min(distancePointToSegment(a, c, d), distancePointToSegment(b, c, d), distancePointToSegment(c, a, b), distancePointToSegment(d, a, b));
}

function distancePointToSegment(point, start, end) {
  const segment = end.clone().sub(start);
  const lengthSq = segment.lengthSq();
  if (lengthSq < 0.000001) return point.distanceTo(start);
  const t = THREE.MathUtils.clamp(point.clone().sub(start).dot(segment) / lengthSq, 0, 1);
  return point.distanceTo(start.clone().add(segment.multiplyScalar(t)));
}

function projectedOverlapRatio(edge, targetEdge) {
  const axis = targetEdge.end.clone().sub(targetEdge.start);
  if (axis.lengthSq() < 0.000001) return 0;
  axis.normalize();
  const valuesA = [edge.start.dot(axis), edge.end.dot(axis)];
  const valuesB = [targetEdge.start.dot(axis), targetEdge.end.dot(axis)];
  const overlap = Math.min(Math.max(...valuesA), Math.max(...valuesB)) - Math.max(Math.min(...valuesA), Math.min(...valuesB));
  return THREE.MathUtils.clamp(overlap / Math.max(0.000001, Math.min(edge.length, targetEdge.length)), 0, 1);
}

function cross2(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function visibleWorldEdges(piece, placedPieces) {
  const edges = worldEdges(piece);
  const blockers = placedPieces.filter((item) => item.id !== piece.id);
  if (!blockers.length) return edges;
  const blockerEdges = blockers.flatMap((item) => worldEdges(item));
  return edges.filter((edge) => !blockerEdges.some((blockerEdge) => edgesTouchFaceToFace(edge, blockerEdge)));
}

function edgesTouchFaceToFace(edge, candidate) {
  const lengthDelta = Math.abs(edge.length - candidate.length);
  const lengthTolerance = Math.max(0.025, Math.min(edge.length, candidate.length) * 0.05);
  if (lengthDelta > lengthTolerance) return false;

  const angleDelta = Math.abs(shortAngle(candidate.angle + Math.PI - edge.angle));
  if (angleDelta > THREE.MathUtils.degToRad(8)) return false;

  const endpointGap = edge.start.distanceTo(candidate.end) + edge.end.distanceTo(candidate.start);
  const endpointTolerance = Math.max(0.08, edge.length * 0.08);
  if (endpointGap > endpointTolerance) return false;

  return edge.mid.distanceTo(candidate.mid) <= endpointTolerance;
}

function worldEdges(piece) {
  if (piece && typeof piece === 'object') {
    const cached = PIECE_WORLD_EDGES_CACHE.get(piece);
    if (cached) return cached;
  }
  const edges = getLocalSnapSegments(piece).map(([localStart, localEnd], localIndex) => {
    const mirroredStart = mirrorLocalPointForPiece(piece, localStart);
    const mirroredEnd = mirrorLocalPointForPiece(piece, localEnd);
    const [startX, startY] = rotatePoint(mirroredStart[0], mirroredStart[1], piece.rotation);
    const [endX, endY] = rotatePoint(mirroredEnd[0], mirroredEnd[1], piece.rotation);
    const start = new THREE.Vector2(startX + piece.x, startY + piece.y);
    const end = new THREE.Vector2(endX + piece.x, endY + piece.y);
    const vector = end.clone().sub(start);
    return {
      localIndex,
      start,
      end,
      mid: start.clone().add(end).multiplyScalar(0.5),
      length: vector.length(),
      angle: Math.atan2(vector.y, vector.x),
    };
  });
  if (piece && typeof piece === 'object') PIECE_WORLD_EDGES_CACHE.set(piece, edges);
  return edges;
}

function getLocalSnapSegments(piece) {
  if (piece.snapEdges?.length) return scaleImportedSegments(piece, piece.snapEdges);
  return piece.points.map((point, index) => [
    scaleLocalPointForPiece(piece, point),
    scaleLocalPointForPiece(piece, piece.points[(index + 1) % piece.points.length]),
  ]);
}

function scaleImportedSegments(piece, segments) {
  return segments.map(([start, end]) => [scaleLocalPointForPiece(piece, start), scaleLocalPointForPiece(piece, end)]);
}

function scaleLocalPointsForPiece(piece, points) {
  return points.map((point) => scaleLocalPointForPiece(piece, point));
}

function scaleLocalPointForPiece(piece, [x, y]) {
  const scale = footprintScaleForPiece(piece);
  return [x * scale.x, y * scale.y];
}

function mirrorLocalPointForPiece(piece, [x, y]) {
  return [piece.mirrorHorizontal ? -x : x, piece.mirrorVertical ? -y : y];
}

function footprintScaleForPiece(piece) {
  const base = baseFootprintDimensions(piece);
  const fallback = importedFootprintMultiplier(piece);
  const stageWidth = Number(piece.stageWidth);
  const stageLength = Number(piece.stageLength);
  return {
    x: Number.isFinite(stageWidth) && stageWidth > 0 && base.width > 0 ? stageWidth / base.width : fallback,
    y: Number.isFinite(stageLength) && stageLength > 0 && base.length > 0 ? stageLength / base.length : fallback,
  };
}

function baseFootprintDimensions(piece) {
  const points = getBaseLocalCollisionPoints(piece);
  if (!points.length) return { width: 1, length: 1 };
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  return {
    width: Math.max(...xs) - Math.min(...xs) || 1,
    length: Math.max(...ys) - Math.min(...ys) || 1,
  };
}

function pieceStageDimensions(piece) {
  const base = baseFootprintDimensions(piece);
  const scale = footprintScaleForPiece(piece);
  return {
    stageWidth: base.width * scale.x,
    stageLength: base.length * scale.y,
    width: base.width * scale.x,
    length: base.length * scale.y,
    height: Number(piece.height) || 0.18,
  };
}

function originalPieceStageDimensions(piece) {
  const universal = universalDefaultStageDimensions(piece);
  if (universal) return universal;
  return importedOriginalPieceStageDimensions(piece);
}

function importedOriginalPieceStageDimensions(piece) {
  const defaultPiece = DEFAULT_PIECE_BY_ID.get(piece.id);
  const source = piece || defaultPiece;
  const fallback = defaultPiece || piece;
  const sourceBase = baseFootprintDimensions(source);
  const fallbackBase = fallback && fallback !== source ? baseFootprintDimensions(fallback) : sourceBase;
  return {
    width: Number(source.sourceWidthPx) || Number(fallback?.sourceWidthPx) || sourceBase.width || fallbackBase.width,
    length: Number(source.sourceLengthPx) || Number(fallback?.sourceLengthPx) || sourceBase.length || fallbackBase.length,
    height: Number(source.sourceHeightPx) || Number(fallback?.sourceHeightPx) || Number(fallback?.height) || Number(source.height) || 0.18,
  };
}

function universalDefaultStageDimensions(piece) {
  const width = Number(piece?.defaultStageWidth);
  const length = Number(piece?.defaultStageLength);
  const height = Number(piece?.defaultHeight);
  if (Number.isFinite(width) && width > 0 && Number.isFinite(length) && length > 0 && Number.isFinite(height) && height > 0) {
    return { width, length, height };
  }
  return null;
}

function sizePieceFromOriginal(piece, scale = 1) {
  const cleanScale = Number.isFinite(Number(scale)) && Number(scale) > 0 ? Number(scale) : 1;
  const original = originalPieceStageDimensions(piece);
  return {
    ...piece,
    height: original.height * cleanScale,
    stageWidth: original.width * cleanScale,
    stageLength: original.length * cleanScale,
    keepAspectRatio: true,
  };
}

function sizePieceFromImportedOriginal(piece, scale = 1) {
  const cleanScale = Number.isFinite(Number(scale)) && Number(scale) > 0 ? Number(scale) : 1;
  const original = importedOriginalPieceStageDimensions(piece);
  return {
    ...piece,
    height: original.height * cleanScale,
    stageWidth: original.width * cleanScale,
    stageLength: original.length * cleanScale,
    keepAspectRatio: true,
  };
}

function sizePieceCurrentToHeight(piece, targetHeight) {
  const cleanHeight = Number.isFinite(Number(targetHeight)) && Number(targetHeight) > 0 ? Number(targetHeight) : Number(piece.height) || 0.18;
  const dimensions = pieceStageDimensions(piece);
  const currentHeight = Number(piece.height) || dimensions.height;
  const scale = Number.isFinite(currentHeight) && currentHeight > 0 ? cleanHeight / currentHeight : 1;
  return {
    ...piece,
    height: cleanHeight,
    stageWidth: dimensions.width * scale,
    stageLength: dimensions.length * scale,
    keepAspectRatio: true,
  };
}

function sizePieceToHeight(piece, targetHeight) {
  const original = originalPieceStageDimensions(piece);
  const cleanHeight = Number.isFinite(Number(targetHeight)) && Number(targetHeight) > 0 ? Number(targetHeight) : original.height;
  const scale = original.height > 0 ? cleanHeight / original.height : 1;
  return sizePieceFromOriginal(piece, scale);
}

function sizePieceHeightOnly(piece, targetHeight) {
  const cleanHeight = Number.isFinite(Number(targetHeight)) && Number(targetHeight) > 0 ? Number(targetHeight) : Number(piece.height) || 0.18;
  const dimensions = pieceStageDimensions(piece);
  return {
    ...piece,
    height: cleanHeight,
    stageWidth: dimensions.width,
    stageLength: dimensions.length,
    keepAspectRatio: false,
  };
}

function markPieceSettingsAsUniversalDefault(piece, options = {}) {
  const dimensions = pieceStageDimensions(piece);
  const defaultColor = options.forceUniversalColor ? universalPieceColor(piece.group, piece.name) || piece.color : piece.color;
  return {
    ...piece,
    color: options.forceUniversalColor ? defaultColor : piece.color,
    defaultColor,
    defaultHeight: Number(piece.height) || dimensions.height,
    defaultStageWidth: dimensions.width,
    defaultStageLength: dimensions.length,
  };
}

function promotePiecesToUniversalDefaults(pieces) {
  let changed = false;
  const promotedPieces = pieces.map((piece) => {
    if (!DEFAULT_PIECE_BY_ID.has(piece.id)) return piece;
    const nextPiece = markPieceSettingsAsUniversalDefault(piece, { forceUniversalColor: true });
    if (
      !numbersClose(piece.height, nextPiece.height) ||
      !numbersClose(piece.stageWidth, nextPiece.stageWidth) ||
      !numbersClose(piece.stageLength, nextPiece.stageLength) ||
      piece.color !== nextPiece.color ||
      piece.defaultColor !== nextPiece.defaultColor ||
      !numbersClose(piece.defaultHeight, nextPiece.defaultHeight) ||
      !numbersClose(piece.defaultStageWidth, nextPiece.defaultStageWidth) ||
      !numbersClose(piece.defaultStageLength, nextPiece.defaultStageLength)
    ) {
      changed = true;
    }
    return nextPiece;
  });
  return { pieces: promotedPieces, changed };
}

function normalizePiecesToShamsehReferenceWidth(pieces) {
  const referenceGroups = Object.keys(SHAMSEH_REFERENCE_BY_GROUP).map(normalizePieceGroupName);
  const referenceByGroup = new Map(
    Object.entries(SHAMSEH_REFERENCE_BY_GROUP).map(([group, name]) => [normalizePieceGroupName(group), slugify(name)]),
  );
  const targetGroupPieces = pieces.filter((piece) => DEFAULT_PIECE_BY_ID.has(piece.id) && referenceByGroup.has(normalizePieceGroupName(piece.group)));
  if (!targetGroupPieces.length || targetGroupPieces.some((piece) => !hasMeasuredSourceDimensions(piece))) return null;

  const referencePieces = new Map();
  for (const groupName of referenceGroups) {
    const referenceSlug = referenceByGroup.get(groupName);
    const referencePiece = targetGroupPieces.find(
      (piece) => normalizePieceGroupName(piece.group) === groupName && slugify(piece.name) === referenceSlug,
    );
    if (!referencePiece) return null;
    const referenceDimensions = importedOriginalPieceStageDimensions(referencePiece);
    if (
      !Number.isFinite(referenceDimensions.width) ||
      referenceDimensions.width <= 0 ||
      !Number.isFinite(referenceDimensions.height) ||
      referenceDimensions.height <= 0
    ) {
      return null;
    }
    referencePieces.set(groupName, { piece: referencePiece, width: referenceDimensions.width });
  }

  const targetReference = referencePieces.get(normalizePieceGroupName(SHAMSEH_REFERENCE_GROUP));
  const targetWidth = targetReference?.width;
  if (!Number.isFinite(targetWidth) || targetWidth <= 0) return null;

  const referenceHeights = new Map();
  for (const [groupName, reference] of referencePieces) {
    const scale = targetWidth / reference.width;
    const scaledReference = sizePieceFromImportedOriginal(reference.piece, scale);
    const referenceHeight = Number(scaledReference.height);
    if (!Number.isFinite(referenceHeight) || referenceHeight <= 0) return null;
    referenceHeights.set(groupName, referenceHeight);
  }

  let changed = false;
  const normalizedPieces = pieces.map((piece) => {
    const groupName = normalizePieceGroupName(piece.group);
    if (!referenceByGroup.has(groupName) || !DEFAULT_PIECE_BY_ID.has(piece.id) || !hasMeasuredSourceDimensions(piece)) return piece;
    const referenceWidth = referencePieces.get(groupName)?.width;
    const referenceHeight = referenceHeights.get(groupName);
    if (!Number.isFinite(referenceWidth) || referenceWidth <= 0) return piece;
    if (!Number.isFinite(referenceHeight) || referenceHeight <= 0) return piece;
    const scale = targetWidth / referenceWidth;
    const scaledPiece = sizePieceFromImportedOriginal(piece, scale);
    const groupHeightPiece = sizePieceCurrentToHeight(scaledPiece, referenceHeight);
    const nextPiece = markPieceSettingsAsUniversalDefault(sizePieceHeightOnly(groupHeightPiece, UNIVERSAL_PIECE_HEIGHT), {
      forceUniversalColor: true,
    });
    if (
      !numbersClose(piece.height, nextPiece.height) ||
      !numbersClose(piece.stageWidth, nextPiece.stageWidth) ||
      !numbersClose(piece.stageLength, nextPiece.stageLength) ||
      piece.color !== nextPiece.defaultColor ||
      !numbersClose(piece.defaultHeight, nextPiece.defaultHeight) ||
      !numbersClose(piece.defaultStageWidth, nextPiece.defaultStageWidth) ||
      !numbersClose(piece.defaultStageLength, nextPiece.defaultStageLength) ||
      piece.keepAspectRatio === false
    ) {
      changed = true;
    }
    return nextPiece;
  });

  return { pieces: normalizedPieces, changed };
}

function hasMeasuredSourceDimensions(piece) {
  return (
    piece.analysisVersion === ANALYSIS_VERSION &&
    Number.isFinite(Number(piece.sourceHeightPx)) &&
    Number(piece.sourceHeightPx) > 0 &&
    Number.isFinite(Number(piece.sourceWidthPx)) &&
    Number(piece.sourceWidthPx) > 0 &&
    Number.isFinite(Number(piece.sourceLengthPx)) &&
    Number(piece.sourceLengthPx) > 0
  );
}

function numbersClose(a, b, tolerance = 0.0005) {
  return Math.abs(Number(a || 0) - Number(b || 0)) <= tolerance;
}

function draftStageDimensions(draft) {
  return pieceStageDimensions({
    ...draft,
    height: Number(draft.height) || 0.18,
    stageWidth: parseOptionalNumber(draft.stageWidth),
    stageLength: parseOptionalNumber(draft.stageLength),
    sourceHeightPx: parseOptionalNumber(draft.sourceHeightPx),
    sourceFootprintScale: parseOptionalNumber(draft.sourceFootprintScale),
    points: parsePoints(draft.points),
    type: draft.glbDataUrl || draft.glbUrl ? 'glb' : draft.objText ? 'obj' : 'shape',
  });
}

function formatDimensionValue(value, decimals = 3) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  const factor = 10 ** decimals;
  const scaled = number * factor;
  const truncated = number >= 0 ? Math.floor(scaled + Number.EPSILON) : Math.ceil(scaled - Number.EPSILON);
  return (truncated / factor).toFixed(decimals);
}

function formatDimensionLabel(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Number(number.toFixed(4)) : 'n/a';
}

function importedFootprintMultiplier(piece) {
  if (piece.type !== 'obj' && piece.type !== 'glb') return 1;
  if (piece.keepAspectRatio === false) return 1;
  const sourceFootprintScale = Number(piece.sourceFootprintScale);
  if (!Number.isFinite(sourceFootprintScale) || sourceFootprintScale <= 0) return 1;
  return importedUniformScale(piece, Number(piece.sourceHeightPx) || 1) / sourceFootprintScale;
}

function importedUniformScale(piece, fallbackSourceHeight) {
  const targetHeight = Number(piece.height) || 0.18;
  const sourceHeight = Number(piece.sourceHeightPx) || fallbackSourceHeight || 1;
  return targetHeight / sourceHeight;
}

function rotatePoint(x, y, rotation) {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return [x * cos - y * sin, x * sin + y * cos];
}

function selectionCenter(pieces) {
  if (!pieces.length) return { x: 0, y: 0, elevation: 0 };
  const bounds = sceneBounds(pieces);
  return {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
    elevation: pieces.reduce((sum, piece) => sum + (Number(piece.elevation) || 0), 0) / pieces.length,
  };
}

function transformSelectedPiece(piece, { scaleDelta, positionDelta, rotationDelta, center, transformAsGroup }) {
  const dimensions = pieceStageDimensions(piece);
  const next = {
    ...piece,
    height: Math.max(0.001, dimensions.height * scaleDelta.y),
    stageWidth: Math.max(0.001, dimensions.width * scaleDelta.x),
    stageLength: Math.max(0.001, dimensions.length * scaleDelta.z),
    elevation: (Number(piece.elevation) || 0) + positionDelta.y,
    tiltX: (Number(piece.tiltX) || 0) + rotationDelta.x,
    tiltZ: (Number(piece.tiltZ) || 0) + rotationDelta.z,
    snappedTo: null,
  };
  if (transformAsGroup && center) {
    let relativeX = ((piece.x || 0) - center.x) * scaleDelta.x;
    let relativeElevation = ((Number(piece.elevation) || 0) - center.elevation) * scaleDelta.y;
    let relativeY = ((piece.y || 0) - center.y) * scaleDelta.z;
    if (rotationDelta.x) {
      [relativeElevation, relativeY] = rotatePoint(relativeElevation, relativeY, rotationDelta.x);
    }
    if (rotationDelta.y) {
      [relativeX, relativeY] = rotatePoint(relativeX, relativeY, rotationDelta.y);
    }
    if (rotationDelta.z) {
      [relativeX, relativeElevation] = rotatePoint(relativeX, relativeElevation, rotationDelta.z);
    }
    next.x = center.x + relativeX + positionDelta.x;
    next.y = center.y + relativeY + positionDelta.z;
    next.elevation = center.elevation + relativeElevation + positionDelta.y;
    next.rotation = normalizeAngle((piece.rotation || 0) + rotationDelta.y);
    return next;
  }
  next.x = (piece.x || 0) + positionDelta.x;
  next.y = (piece.y || 0) + positionDelta.z;
  next.rotation = normalizeAngle((piece.rotation || 0) + rotationDelta.y);
  return next;
}

function normalizeAngle(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function shortAngle(angle) {
  return normalizeAngle(angle);
}

function countSnappedPairs(placed) {
  return placed.filter((item) => item.snappedTo).length;
}

function buildItemSummaryItems(placed) {
  const items = new Map();
  placed.forEach((piece) => {
    const key = piece.sourceId || piece.name || piece.id;
    const existing = items.get(key);
    if (existing) {
      existing.count += 1;
      return;
    }
    items.set(key, {
      key,
      name: piece.name || 'Item',
      piece,
      count: 1,
    });
  });
  return Array.from(items.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function pieceIconSchematic(piece, fitFootprintOnly = false) {
  const segments = getRealFootprintSegments(piece);
  const polygon = getLocalCollisionPoints(piece);
  const points = segments.flat();
  const verticalEdges = getIconVerticalPoints(piece);
  const allPoints = fitFootprintOnly && polygon.length ? polygon : [...points, ...verticalEdges, ...polygon];
  if (!allPoints.length) return { segments: [], verticalEdges: [], polygon: [] };
  const xs = allPoints.map(([x]) => x);
  const ys = allPoints.map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = maxX - minX;
  const height = maxY - minY;
  const scale = 38 / Math.max(width || 1, height || 1);
  const offsetX = 5 + (38 - width * scale) / 2;
  const offsetY = 5 + (38 - height * scale) / 2;
  const project = ([x, y]) => [(x - minX) * scale + offsetX, (y - minY) * scale + offsetY];
  return {
    segments: segments.map(([start, end]) => [project(start), project(end)]),
    verticalEdges: verticalEdges.map(project),
    polygon: polygon.map(project),
  };
}

function PieceIcon({ piece, filled = false }) {
  const schematic = useMemo(() => pieceIconSchematic(piece), [piece]);
  const color = normalizeHexColor(piece.color, '#1c7c74');
  return (
    <svg className="piece-icon" viewBox="0 0 48 48" aria-hidden="true">
      {filled && schematic.polygon.length >= 3 && (
        <polygon
          points={schematic.polygon.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ')}
          fill={color}
          stroke="#2d2924"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      )}
      <g stroke={filled ? '#2d2924' : color} strokeLinecap="round" strokeLinejoin="round" fill="none">
        {schematic.segments.map(([start, end], index) => (
          <line
            key={`${start.join(',')}-${end.join(',')}-${index}`}
            x1={start[0]}
            y1={start[1]}
            x2={end[0]}
            y2={end[1]}
            strokeWidth="1.8"
          />
        ))}
        {schematic.verticalEdges.map(([x, y], index) => (
          <circle key={`${x}-${y}-${index}`} cx={x} cy={y} r="1.8" fill={filled ? '#2d2924' : color} stroke="none" />
        ))}
      </g>
    </svg>
  );
}

function normalizeSurfaceSticker(sticker = {}) {
  const source = sticker && typeof sticker === 'object' ? sticker : {};
  const imageDataUrl = typeof source.imageDataUrl === 'string' && /^data:image\/(png|webp);base64,/i.test(source.imageDataUrl)
    ? source.imageDataUrl
    : '';
  const shapes = (Array.isArray(source.shapes) ? source.shapes : [])
    .filter((shape) => shape && SURFACE_STICKER_SHAPE_TYPES.has(shape.type))
    .slice(-SURFACE_STICKER_MAX_SHAPES)
    .map((shape, index) => ({
      id: typeof shape.id === 'string' ? shape.id : `sticker-shape-${index}`,
      type: shape.type,
      x: clamp(Number(shape.x) || 0.5, 0, 1),
      y: clamp(Number(shape.y) || 0.5, 0, 1),
      size: clamp(Number(shape.size) || 0.18, 0.04, 0.7),
      color: normalizeHexColor(shape.color, '#ffffff'),
      opacity: clamp(Number.isFinite(Number(shape.opacity)) ? Number(shape.opacity) : 0.9, 0.05, 1),
      rotation: Number.isFinite(Number(shape.rotation)) ? Number(shape.rotation) : 0,
    }));
  return {
    imageDataUrl,
    imageOpacity: clamp(Number.isFinite(Number(source.imageOpacity)) ? Number(source.imageOpacity) : 1, 0.05, 1),
    imageCentered: source.imageCentered === true,
    imageX: source.imageCentered === true ? 0.5 : clamp(Number.isFinite(Number(source.imageX)) ? Number(source.imageX) : 0.5, -0.5, 1.5),
    imageY: source.imageCentered === true ? 0.5 : clamp(Number.isFinite(Number(source.imageY)) ? Number(source.imageY) : 0.5, -0.5, 1.5),
    imageScale: clamp(Number.isFinite(Number(source.imageScale)) ? Number(source.imageScale) : 1, 0.1, 3),
    imageRotation: clamp(Number.isFinite(Number(source.imageRotation)) ? Number(source.imageRotation) : 0, -180, 180),
    shapes,
  };
}

function hasSurfaceStickerContent(sticker) {
  const normalized = normalizeSurfaceSticker(sticker);
  return !!normalized.imageDataUrl || normalized.shapes.length > 0;
}

function createSurfaceStickerPackage(name, surfaceSticker) {
  return {
    app: 'Girih',
    kind: 'surface-sticker',
    version: 1,
    name: String(name || 'Surface sticker').trim() || 'Surface sticker',
    surfaceSticker: normalizeSurfaceSticker(surfaceSticker),
  };
}

function isSurfaceStickerPackage(value) {
  return value?.kind === 'surface-sticker' && hasSurfaceStickerContent(value.surfaceSticker);
}

function normalizeSurfaceStickerLibraryItem(item) {
  if (!item || !hasSurfaceStickerContent(item.surfaceSticker)) return null;
  return {
    id: String(item.id || `sticker-${crypto.randomUUID()}`),
    listingId: item.listingId ? String(item.listingId) : '',
    name: String(item.name || 'Surface sticker').trim() || 'Surface sticker',
    previewImage: typeof item.previewImage === 'string' ? item.previewImage : '',
    surfaceSticker: normalizeSurfaceSticker(item.surfaceSticker),
    installedAt: Number(item.installedAt) || Date.now(),
  };
}

function normalizeSurfaceStickerUvTransform(transform) {
  if (!transform || typeof transform !== 'object') return undefined;
  const normalized = {
    uX: Number(transform.uX),
    uY: Number(transform.uY),
    uOffset: Number(transform.uOffset),
    vX: Number(transform.vX),
    vY: Number(transform.vY),
    vOffset: Number(transform.vOffset),
  };
  return Object.values(normalized).every(Number.isFinite) ? normalized : undefined;
}

function surfaceStickerSignature(sticker) {
  const normalized = normalizeSurfaceSticker(sticker);
  if (!hasSurfaceStickerContent(normalized)) return 'none';
  const source = JSON.stringify({
    imageDataUrl: normalized.imageDataUrl,
    imageOpacity: normalized.imageOpacity,
    imageCentered: normalized.imageCentered,
    imageX: normalized.imageX,
    imageY: normalized.imageY,
    imageScale: normalized.imageScale,
    imageRotation: normalized.imageRotation,
    shapes: normalized.shapes,
  });
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${source.length}:${(hash >>> 0).toString(36)}`;
}

async function readSurfaceStickerPng(file) {
  if (!file || (file.type && file.type !== 'image/png') || !/\.png$/i.test(file.name || '')) {
    throw new Error('Choose a PNG image.');
  }
  if (file.size > 8 * 1024 * 1024) throw new Error('The PNG must be smaller than 8 MB.');
  const imageUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('The PNG could not be read.'));
      element.src = imageUrl;
    });
    const canvas = document.createElement('canvas');
    canvas.width = SURFACE_STICKER_IMAGE_SIZE;
    canvas.height = SURFACE_STICKER_IMAGE_SIZE;
    const context = canvas.getContext('2d');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    const scale = Math.min(canvas.width / Math.max(image.width, 1), canvas.height / Math.max(image.height, 1));
    const width = image.width * scale;
    const height = image.height * scale;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
    const pngDataUrl = canvas.toDataURL('image/png');
    const webpDataUrl = canvas.toDataURL('image/webp', 0.96);
    return /^data:image\/webp;base64,/i.test(webpDataUrl) && webpDataUrl.length < pngDataUrl.length ? webpDataUrl : pngDataUrl;
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

function SurfaceStickerShape({ shape, preview = false }) {
  const x = shape.x;
  const y = shape.y;
  const size = shape.size;
  const common = {
    fill: shape.color,
    opacity: preview ? Math.min(shape.opacity, 0.72) : shape.opacity,
    transform: `rotate(${shape.rotation || 0} ${x} ${y})`,
    ...(preview ? {
      stroke: '#ffffff',
      strokeWidth: 0.012,
      strokeDasharray: '0.032 0.021',
      pointerEvents: 'none',
    } : {}),
  };
  if (shape.type === 'circle') return <circle cx={x} cy={y} r={size / 2} {...common} />;
  if (shape.type === 'triangle') {
    const points = `${x},${y - size / 2} ${x + size / 2},${y + size / 2} ${x - size / 2},${y + size / 2}`;
    return <polygon points={points} {...common} />;
  }
  if (shape.type === 'line') {
    return <line x1={x - size / 2} y1={y} x2={x + size / 2} y2={y} stroke={shape.color} strokeOpacity={shape.opacity} strokeWidth={Math.max(0.02, size * 0.16)} strokeLinecap="round" transform={common.transform} />;
  }
  return <rect x={x - size / 2} y={y - size * 0.34} width={size} height={size * 0.68} rx={Math.min(0.04, size * 0.12)} {...common} />;
}

function PieceSurfaceStickerEditor({ piece, value, onChange, onSave, onCancel }) {
  const sticker = normalizeSurfaceSticker(value);
  const [stickerLibrary, setStickerLibrary] = useState([]);
  const [tool, setTool] = useState('circle');
  const [toolColor, setToolColor] = useState('#000000');
  const [toolSize, setToolSize] = useState(0.18);
  const [toolOpacity, setToolOpacity] = useState(0.9);
  const [toolCentered, setToolCentered] = useState(true);
  const [toolPreviewPosition, setToolPreviewPosition] = useState({ x: 0.5, y: 0.5 });
  const [message, setMessage] = useState('Click the surface to place the selected shape.');
  const imageDragRef = useRef(null);
  const suppressShapeClickRef = useRef(false);
  const schematic = useMemo(() => pieceIconSchematic(piece, true), [piece]);
  const polygonPoints = schematic.polygon.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  const stickerViewport = useMemo(() => {
    if (schematic.polygon.length < 3) return { x: 5, y: 5, width: 38, height: 38 };
    const bounds = centeredSquareBounds(schematic.polygon);
    return {
      x: bounds.minX,
      y: bounds.minY,
      width: bounds.size,
      height: bounds.size,
    };
  }, [schematic]);
  const clipId = `surface-clip-${slugify(piece.id)}`;

  useEffect(() => {
    let active = true;
    readSurfaceStickerLibrary().then((items) => {
      if (active) setStickerLibrary(items);
    });
    return () => { active = false; };
  }, []);

  const stickerPointFromEvent = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const viewX = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * 48;
    const viewY = ((event.clientY - rect.top) / Math.max(rect.height, 1)) * 48;
    return {
      x: clamp((viewX - stickerViewport.x) / stickerViewport.width, 0, 1),
      y: clamp((viewY - stickerViewport.y) / stickerViewport.height, 0, 1),
    };
  };

  const addShape = (event) => {
    if (suppressShapeClickRef.current) {
      suppressShapeClickRef.current = false;
      return;
    }
    if (sticker.shapes.length >= SURFACE_STICKER_MAX_SHAPES) {
      setMessage(`Maximum ${SURFACE_STICKER_MAX_SHAPES} shapes reached.`);
      return;
    }
    const pointerPosition = stickerPointFromEvent(event);
    const placement = toolCentered
      ? { x: 0.5, y: 0.5 }
      : pointerPosition;
    onChange({
      ...sticker,
      shapes: [...sticker.shapes, {
        id: crypto.randomUUID(),
        type: tool,
        x: placement.x,
        y: placement.y,
        size: toolSize,
        color: toolColor,
        opacity: toolOpacity,
        rotation: 0,
      }],
    });
  };

  const uploadPng = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const imageDataUrl = await readSurfaceStickerPng(file);
      onChange({ ...sticker, imageDataUrl, imageCentered: true, imageX: 0.5, imageY: 0.5, imageScale: 1, imageRotation: 0 });
      setMessage('PNG added. Drag it on the surface or use the transform controls.');
    } catch (error) {
      setMessage(error.message || 'The PNG could not be added.');
    }
    event.target.value = '';
  };

  const startImageDrag = (event) => {
    event.preventDefault();
    event.stopPropagation();
    const svg = event.currentTarget.ownerSVGElement;
    const rect = svg?.getBoundingClientRect();
    if (!svg || !rect) return;
    svg.setPointerCapture?.(event.pointerId);
    suppressShapeClickRef.current = true;
    imageDragRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: sticker.imageX,
      startY: sticker.imageY,
      width: Math.max(rect.width, 1),
      height: Math.max(rect.height, 1),
      captureTarget: svg,
    };
    setMessage('Drag to position the PNG.');
  };

  const moveImage = (event) => {
    const drag = imageDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    const deltaX = (event.clientX - drag.startClientX) / drag.width;
    const deltaY = (event.clientY - drag.startClientY) / drag.height;
    onChange({
      ...normalizeSurfaceSticker(value),
      imageCentered: false,
      imageX: clamp(drag.startX + deltaX, -0.5, 1.5),
      imageY: clamp(drag.startY + deltaY, -0.5, 1.5),
    });
  };

  const moveSurfacePointer = (event) => {
    if (imageDragRef.current) {
      moveImage(event);
      return;
    }
    if (toolCentered) return;
    setToolPreviewPosition(stickerPointFromEvent(event));
  };

  const endImageDrag = (event) => {
    const drag = imageDragRef.current;
    if (drag?.pointerId !== event.pointerId) return;
    imageDragRef.current = null;
    drag.captureTarget?.releasePointerCapture?.(event.pointerId);
    setMessage('PNG position updated.');
  };

  const imageCenterX = sticker.imageX;
  const imageCenterY = sticker.imageY;
  const imageSize = sticker.imageScale;
  const pendingShape = {
    id: 'pending-surface-sticker-shape',
    type: tool,
    x: toolCentered ? 0.5 : toolPreviewPosition.x,
    y: toolCentered ? 0.5 : toolPreviewPosition.y,
    size: toolSize,
    color: toolColor,
    opacity: toolOpacity,
    rotation: 0,
  };

  return (
    <section className="surface-sticker-editor" aria-label={`${piece.name} surface sticker editor`}>
      <div className="surface-sticker-heading">
        <span><ImageIcon size={15} /> Surface sticker</span>
        <small>{sticker.shapes.length}/{SURFACE_STICKER_MAX_SHAPES} shapes</small>
      </div>
      <svg
        className="surface-sticker-canvas"
        viewBox="0 0 48 48"
        role="img"
        aria-label={`Sticker preview for ${piece.name}`}
        onClick={addShape}
        onPointerMove={moveSurfacePointer}
        onPointerUp={endImageDrag}
        onPointerCancel={endImageDrag}
      >
        <defs><clipPath id={clipId}><polygon points={polygonPoints} /></clipPath></defs>
        <polygon points={polygonPoints} fill={piece.color} stroke="#2d2924" strokeWidth="0.8" />
        <g clipPath={`url(#${clipId})`}>
          <svg
            x={stickerViewport.x}
            y={stickerViewport.y}
            width={stickerViewport.width}
            height={stickerViewport.height}
            viewBox="0 0 1 1"
            preserveAspectRatio="xMidYMid meet"
          >
            {sticker.imageDataUrl && (
              <image
                href={sticker.imageDataUrl}
                x={imageCenterX - imageSize / 2}
                y={imageCenterY - imageSize / 2}
                width={imageSize}
                height={imageSize}
                opacity={sticker.imageOpacity}
                preserveAspectRatio="xMidYMid meet"
                transform={`rotate(${sticker.imageRotation} ${imageCenterX} ${imageCenterY})`}
                onPointerDown={startImageDrag}
                onClick={(event) => {
                  suppressShapeClickRef.current = false;
                  event.stopPropagation();
                }}
                className="surface-sticker-image"
              />
            )}
            {sticker.shapes.map((shape) => <SurfaceStickerShape key={shape.id} shape={shape} />)}
            {sticker.shapes.length < SURFACE_STICKER_MAX_SHAPES && <SurfaceStickerShape shape={pendingShape} preview />}
          </svg>
        </g>
        <polygon points={polygonPoints} fill="none" stroke="rgba(255,255,255,.65)" strokeWidth="0.35" pointerEvents="none" />
      </svg>
      <div className="surface-sticker-tools">
        <label>PNG<input type="file" accept="image/png,.png" onChange={uploadPng} /></label>
        {!!stickerLibrary.length && <label>Purchased sticker<select defaultValue="" onChange={(event) => {
          const libraryItem = stickerLibrary.find((item) => item.id === event.target.value);
          if (!libraryItem) return;
          onChange(normalizeSurfaceSticker(libraryItem.surfaceSticker));
          setMessage(`${libraryItem.name} applied. Preview it on the stage, then save.`);
          event.target.value = '';
        }}><option value="">Choose from library</option>{stickerLibrary.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
        <label>Shape<select value={tool} onChange={(event) => setTool(event.target.value)}><option value="circle">Circle</option><option value="triangle">Triangle</option></select></label>
        <label>Color<input type="color" value={toolColor} onChange={(event) => setToolColor(event.target.value)} /></label>
        <label>Size ({Math.round(toolSize * 100)}%)<input type="range" min="4" max="70" value={Math.round(toolSize * 100)} onChange={(event) => setToolSize(Number(event.target.value) / 100)} /></label>
        <label>Opacity<input type="range" min="5" max="100" value={Math.round(toolOpacity * 100)} onChange={(event) => setToolOpacity(Number(event.target.value) / 100)} /></label>
        <label className="surface-sticker-center-toggle"><input type="checkbox" checked={toolCentered} onChange={(event) => {
          setToolCentered(event.target.checked);
          if (event.target.checked) setToolPreviewPosition({ x: 0.5, y: 0.5 });
        }} /><span>Center new shape on piece</span></label>
        {sticker.imageDataUrl && <label>PNG opacity<input type="range" min="5" max="100" value={Math.round(sticker.imageOpacity * 100)} onChange={(event) => onChange({ ...sticker, imageOpacity: Number(event.target.value) / 100 })} /></label>}
        {sticker.imageDataUrl && <button type="button" className="surface-sticker-center-button" onClick={() => {
          onChange({ ...sticker, imageCentered: true, imageX: 0.5, imageY: 0.5 });
          setMessage('PNG centered on the piece.');
        }}>Center PNG on piece</button>}
        {sticker.imageDataUrl && <label>PNG scale ({Math.round(sticker.imageScale * 100)}%)<input type="range" min="10" max="300" value={Math.round(sticker.imageScale * 100)} onChange={(event) => onChange({ ...sticker, imageScale: Number(event.target.value) / 100 })} /></label>}
        {sticker.imageDataUrl && <label>PNG rotation ({Math.round(sticker.imageRotation)}°)<input type="range" min="-180" max="180" step="1" value={Math.round(sticker.imageRotation)} onChange={(event) => onChange({ ...sticker, imageRotation: Number(event.target.value) })} /></label>}
        {sticker.imageDataUrl && <label>PNG horizontal<input type="range" min="-50" max="150" value={Math.round(sticker.imageX * 100)} disabled={sticker.imageCentered} onChange={(event) => onChange({ ...sticker, imageCentered: false, imageX: Number(event.target.value) / 100 })} /></label>}
        {sticker.imageDataUrl && <label>PNG vertical<input type="range" min="-50" max="150" value={Math.round(sticker.imageY * 100)} disabled={sticker.imageCentered} onChange={(event) => onChange({ ...sticker, imageCentered: false, imageY: Number(event.target.value) / 100 })} /></label>}
      </div>
      <div className="surface-sticker-secondary-actions">
        <button type="button" onClick={() => onChange({ ...sticker, shapes: sticker.shapes.slice(0, -1) })} disabled={!sticker.shapes.length}>Undo shape</button>
        <button type="button" onClick={() => onChange({ ...sticker, imageCentered: true, imageX: 0.5, imageY: 0.5, imageScale: 1, imageRotation: 0 })} disabled={!sticker.imageDataUrl}>Reset PNG</button>
        <button type="button" onClick={() => onChange({ ...sticker, imageDataUrl: '' })} disabled={!sticker.imageDataUrl}>Remove PNG</button>
        <button type="button" onClick={() => onChange(normalizeSurfaceSticker())} disabled={!hasSurfaceStickerContent(sticker)}>Clear all</button>
      </div>
      <p>{message}</p>
      <div className="surface-sticker-actions">
        <button type="button" onClick={onSave}><Save size={14} /> Save sticker</button>
        <button type="button" onClick={onCancel}>Cancel</button>
      </div>
    </section>
  );
}

function pieceSummarySvgMarkup(piece) {
  const schematic = pieceIconSchematic(piece);
  const color = normalizeHexColor(piece.color, '#1c7c74');
  const polygon = schematic.polygon.length >= 3
    ? `<polygon points="${schematic.polygon.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ')}" fill="${color}" stroke="#2d2924" stroke-width="1.4" stroke-linejoin="round" />`
    : '';
  const lines = schematic.segments.map(([start, end], index) =>
    `<line key="${index}" x1="${start[0].toFixed(2)}" y1="${start[1].toFixed(2)}" x2="${end[0].toFixed(2)}" y2="${end[1].toFixed(2)}" stroke="#2d2924" stroke-width="1.8" stroke-linecap="round" />`,
  ).join('');
  const dots = schematic.verticalEdges.map(([x, y], index) =>
    `<circle key="v${index}" cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="1.8" fill="#2d2924" />`,
  ).join('');
  return `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">${polygon}<g fill="none">${lines}${dots}</g></svg>`;
}

function getRealFootprintSegments(piece) {
  if (usesTargetedRealBoundary(piece) && piece.displayEdges?.length) {
    return scaleImportedSegments(piece, piece.displayEdges).filter(([start, end]) => start && end);
  }
  const boundary = getLocalCollisionPoints(piece);
  if (boundary.length >= 3) return polygonToEdges(boundary);
  return getLocalSnapSegments(piece).filter(([start, end]) => start && end);
}

function createMotifFromPieces(name, pieces) {
  const sourcePieces = Array.isArray(pieces) ? pieces.filter(Boolean) : [];
  if (!sourcePieces.length) return null;
  const bounds = getPiecesWorldBounds(sourcePieces);
  if (!bounds) return null;
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  return {
    id: `motif-${crypto.randomUUID()}`,
    name,
    savedAt: Date.now(),
    width: Math.max(0.001, bounds.maxX - bounds.minX),
    height: Math.max(0.001, bounds.maxY - bounds.minY),
    ...compactMotifPiecesWithSources(sourcePieces, centerX, centerY),
  };
}

function motifSourceKey(piece) {
  const sourceKey = piece.sourceKey || (piece.isFrameSlice ? piece.id : piece.sourceId || piece.id);
  return piece.isFrameSlice ? sourceKey : normalizeMoroccoPieceId(sourceKey);
}

function compactMotifPiecesWithSources(sourcePieces, centerX = 0, centerY = 0) {
  const sourceMap = new Map();
  const pieces = sourcePieces.map((piece) => {
    const sourceKey = motifSourceKey(piece);
    if (!sourceMap.has(sourceKey)) sourceMap.set(sourceKey, compactSceneSource(sourceKey, piece));
    return compactMotifPiece(piece, centerX, centerY, sourceKey);
  });
  return {
    sources: Array.from(sourceMap.values()),
    pieces,
  };
}

function compactMotifPiece(piece, centerX, centerY, sourceKey = motifSourceKey(piece)) {
  const sourceId = normalizeMoroccoPieceId(piece.sourceId || piece.id);
  const normalizedSourceKey = piece.isFrameSlice ? sourceKey : normalizeMoroccoPieceId(sourceKey);
  return {
    id: sourceId,
    sourceKey: normalizedSourceKey,
    sourceId,
    x: (piece.x || 0) - centerX,
    y: (piece.y || 0) - centerY,
    rotation: Number(piece.rotation) || 0,
    elevation: Number(piece.elevation) || 0,
    tiltX: Number(piece.tiltX) || 0,
    tiltZ: Number(piece.tiltZ) || 0,
    mirrorHorizontal: !!piece.mirrorHorizontal,
    mirrorVertical: !!piece.mirrorVertical,
    hidden: false,
    height: Number(piece.height) || undefined,
    stageWidth: parseOptionalNumber(piece.stageWidth),
    stageLength: parseOptionalNumber(piece.stageLength),
    color: piece.color,
    groupInstanceId: null,
    snappedTo: null,
  };
}

function motifSourceMap(motif) {
  const sourceMap = new Map();
  (Array.isArray(motif?.sources) ? motif.sources : [])
    .filter((source) => source && typeof source === 'object')
    .forEach((source) => {
      const rawKey = source.sourceKey || source.id || source.sourceId;
      if (!rawKey) return;
      const normalizedKey = source.isFrameSlice ? rawKey : normalizeMoroccoPieceId(rawKey);
      const normalizedSource = normalizeMoroccoStoredSource(source);
      sourceMap.set(rawKey, normalizedSource);
      sourceMap.set(normalizedKey, normalizedSource);
    });
  return sourceMap;
}

function rehydrateMotifPiece(piece, sourceByKey = new Map()) {
  const sourceId = normalizeMoroccoPieceId(piece.sourceId || piece.id);
  const sourceKey = piece.isFrameSlice ? piece.sourceKey || sourceId : normalizeMoroccoPieceId(piece.sourceKey || sourceId);
  const source = sourceByKey.get(sourceKey) || sourceByKey.get(sourceId) || DEFAULT_PIECE_BY_ID.get(sourceId);
  return source
    ? {
        ...source,
        ...piece,
        id: sourceId,
        sourceKey,
        sourceId: sourceId || source.sourceId || sourceKey,
        group: normalizePieceGroupName(piece.group || source.group),
        glbUrl: normalizeMoroccoModelUrl(piece.glbUrl ?? source.glbUrl),
      }
    : { ...piece, id: sourceId, sourceKey, sourceId, group: normalizePieceGroupName(piece.group), glbUrl: normalizeMoroccoModelUrl(piece.glbUrl) };
}

function createTessellatedMotifInstances(motif, options = {}) {
  const rows = clampInteger(options.rows, 1, 30, 1);
  const columns = clampInteger(options.columns, 1, 30, 1);
  const gapX = parseFiniteNumber(options.gapX, 0);
  const gapY = parseFiniteNumber(options.gapY, 0);
  const width = Math.max(0.001, Number(motif.width) || 1);
  const height = Math.max(0.001, Number(motif.height) || 1);
  const stepX = width + gapX;
  const stepY = height + gapY;
  const viewCenterX = options.visibleBounds ? (options.visibleBounds.minX + options.visibleBounds.maxX) / 2 : 0;
  const viewCenterY = options.visibleBounds ? (options.visibleBounds.minY + options.visibleBounds.maxY) / 2 : 0;
  const startX = viewCenterX - ((columns - 1) * stepX) / 2;
  const startY = viewCenterY - ((rows - 1) * stepY) / 2;
  const pieces = [];
  const groups = [];
  let activeGroupId = null;
  let selectedIds = [];
  const sourceByKey = motifSourceMap(motif);
  const motifPieces = motif.pieces.map((piece) => rehydrateMotifPiece(piece, sourceByKey));
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const groupId = `group-${crypto.randomUUID()}`;
      if (!activeGroupId) activeGroupId = groupId;
      const groupIds = [];
      motifPieces.forEach((piece) => {
        const sourceId = piece.sourceId || piece.id;
        const id = `${sourceId}-${crypto.randomUUID()}`;
        groupIds.push(id);
        pieces.push({
          ...piece,
          id,
          sourceId,
          x: startX + column * stepX + (piece.x || 0),
          y: startY + row * stepY + (piece.y || 0),
          groupInstanceId: groupId,
          snappedTo: null,
        });
      });
      if (!selectedIds.length) selectedIds = groupIds;
      if (groupIds.length > 1) groups.push({ id: groupId, ids: groupIds });
    }
  }
  return { pieces, groups, selectedIds, activeGroupId };
}

function clampInteger(value, min, max, fallback) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function parseFiniteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function usesTargetedRealBoundary(piece) {
  return TARGETED_REAL_BOUNDARY_NAMES.has(slugify(piece.name || piece.id || ''));
}

function getIconVerticalPoints(piece) {
  if (!piece.verticalEdges?.length) return [];
  return piece.verticalEdges.map((point) => scaleLocalPointForPiece(piece, point));
}

function usePersistentPieces() {
  const [pieces, setPieces] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
      const library = Array.isArray(stored) && stored.length ? mergeDefaultPieces(stored) : DEFAULT_PIECES;
      return applyAdminPieceSettings(library);
    } catch {
      return applyAdminPieceSettings(DEFAULT_PIECES);
    }
  });
  useEffect(() => {
    // Sticker artwork is persisted once in the admin settings record. Avoid
    // duplicating image data in the library snapshot and exhausting storage.
    writeJsonToLocalStorage(STORAGE_KEY, pieces.map(({ surfaceSticker, ...piece }) => piece));
  }, [pieces]);
  return [pieces, setPieces];
}

function usePersistentMotifs() {
  const [motifs, setMotifs] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(MOTIFS_STORAGE_KEY));
      return Array.isArray(stored)
        ? stored
            .filter((motif) => motif && typeof motif === 'object' && Array.isArray(motif.pieces))
            .map(compactStoredMotif)
        : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    writeJsonToLocalStorage(MOTIFS_STORAGE_KEY, motifs);
  }, [motifs]);
  return [motifs, setMotifs];
}

function compactStoredMotif(motif) {
  const sourceMap = motifSourceMap(motif);
  const sources = new Map();
  sourceMap.forEach((source) => {
    const sourceKey = source.sourceKey || source.id || source.sourceId;
    if (sourceKey) sources.set(sourceKey, source);
  });
  const pieces = motif.pieces.map((piece) => {
    const sourceKey = motifSourceKey(piece);
    if (!sources.has(sourceKey)) {
      const source = rehydrateMotifPiece(piece, sourceMap);
      sources.set(sourceKey, compactSceneSource(sourceKey, source));
    }
    return compactMotifPiece(piece, 0, 0, sourceKey);
  });
  return {
    id: typeof motif.id === 'string' ? motif.id : `motif-${crypto.randomUUID()}`,
    name: typeof motif.name === 'string' ? motif.name : 'Motif',
    savedAt: Number(motif.savedAt) || Date.now(),
    width: Math.max(0.001, Number(motif.width) || 1),
    height: Math.max(0.001, Number(motif.height) || 1),
    sources: Array.from(sources.values()).map((source) => compactSceneSource(source.sourceKey || source.id || source.sourceId, source)),
    pieces,
  };
}

function mergeDefaultPieces(stored) {
  const migratedStored = stored.map(normalizeMoroccoStoredLibraryPiece);
  const keptStored = migratedStored.filter((piece) => !REMOVED_DEFAULT_PIECE_IDS.has(piece.id));
  const storedById = new Map(keptStored.map((piece) => [piece.id, piece]));
  const mergedDefaults = DEFAULT_PIECES.map((defaultPiece) => mergeStoredDefaultPiece(defaultPiece, storedById.get(defaultPiece.id)));
  const importedPieces = keptStored.filter((piece) => !DEFAULT_PIECE_BY_ID.has(piece.id));
  return [...mergedDefaults, ...importedPieces];
}

function mergeStoredDefaultPiece(defaultPiece, storedPiece) {
  if (!storedPiece) return defaultPiece;
  return {
    ...storedPiece,
    name: defaultPiece.name,
    group: defaultPiece.group,
    type: defaultPiece.type,
    glbUrl: defaultPiece.glbUrl,
    glbDataUrl: defaultPiece.glbDataUrl,
  };
}

function readAdminPieceSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(ADMIN_SETTINGS_STORAGE_KEY));
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {};
    return Object.fromEntries(
      Object.entries(stored).map(([pieceId, setting]) => [
        normalizeMoroccoPieceId(pieceId),
        setting && typeof setting === 'object'
          ? { ...setting, group: normalizePieceGroupName(setting.group) }
          : setting,
      ]),
    );
  } catch {
    return {};
  }
}

function readGroupColorPalettes() {
  try {
    const stored = JSON.parse(localStorage.getItem(GROUP_COLOR_PALETTES_STORAGE_KEY));
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {};
    return Object.fromEntries(
      Object.entries(stored).map(([groupName, palettes]) => [
        normalizePieceGroupName(groupName),
        Array.isArray(palettes)
          ? palettes
              .filter((palette) => palette && typeof palette === 'object' && palette.colors && typeof palette.colors === 'object')
              .slice(0, 6)
              .map((palette, index) => ({
                id: typeof palette.id === 'string' ? palette.id : crypto.randomUUID(),
                name: typeof palette.name === 'string' ? palette.name.replace(/^Set\s+/i, '') : `${index + 1}`,
                savedAt: Number(palette.savedAt) || Date.now(),
                colors: Object.fromEntries(
                  Object.entries(palette.colors).map(([pieceId, color]) => [normalizeMoroccoPieceId(pieceId), color]),
                ),
              }))
          : [],
      ]),
    );
  } catch {
    return {};
  }
}

function buildGroupColorPalettes(group, savedPalettes = []) {
  const saved = Array.isArray(savedPalettes) ? savedPalettes : [];
  return [builtInGroupColorPalette(group), ...saved.map((palette, index) => ({ ...palette, name: `${index + 2}` }))];
}

function builtInGroupColorPalette(group) {
  return {
    id: BUILT_IN_GROUP_PALETTE_ID,
    name: '1',
    builtIn: true,
    savedAt: 0,
    colors: Object.fromEntries(
      group.items.map((piece) => [piece.id, universalPieceColor(group.name, piece.name) || piece.defaultColor || piece.color]),
    ),
  };
}

function normalizeUserRole(role) {
  return Object.values(USER_ROLES).includes(role) ? role : USER_ROLES.FREE;
}

function roleLabel(role) {
  if (role === USER_ROLES.ADMIN) return 'Admin';
  if (role === USER_ROLES.PAID) return 'Paid';
  return 'Free';
}

function saveAdminPieceSetting(piece) {
  const settings = readAdminPieceSettings();
  const defaultedPiece = markPieceSettingsAsUniversalDefault(piece);
  const nextSetting = {
    group: normalizePieceGroupName(defaultedPiece.group),
    color: defaultedPiece.color,
    height: defaultedPiece.height,
    stageWidth: defaultedPiece.stageWidth,
    stageLength: defaultedPiece.stageLength,
    defaultColor: defaultedPiece.defaultColor,
    defaultHeight: defaultedPiece.defaultHeight,
    defaultStageWidth: defaultedPiece.defaultStageWidth,
    defaultStageLength: defaultedPiece.defaultStageLength,
    sourceHeightPx: defaultedPiece.sourceHeightPx,
    sourceWidthPx: defaultedPiece.sourceWidthPx,
    sourceLengthPx: defaultedPiece.sourceLengthPx,
    sourceFootprintScale: defaultedPiece.sourceFootprintScale,
    keepAspectRatio: defaultedPiece.keepAspectRatio !== false,
    offsetLinesEnabled: defaultedPiece.offsetLinesEnabled !== false,
    surfaceSticker: hasSurfaceStickerContent(defaultedPiece.surfaceSticker) ? normalizeSurfaceSticker(defaultedPiece.surfaceSticker) : undefined,
  };
  localStorage.setItem(
    ADMIN_SETTINGS_STORAGE_KEY,
    JSON.stringify({
      ...settings,
      [piece.id]: nextSetting,
    }),
  );
}

function applyAdminPieceSettings(pieces) {
  const settings = readAdminPieceSettings();
  return pieces.map((piece) => applyAdminPieceSetting(piece, settings[piece.id]));
}

function applyAdminPieceSetting(piece, setting = readAdminPieceSettings()[piece.id]) {
  if (!setting) return piece;
  const isDefaultPiece = DEFAULT_PIECE_BY_ID.has(piece.id);
  return {
    ...piece,
    group: isDefaultPiece ? normalizePieceGroupName(piece.group) : normalizePieceGroupName(setting.group ?? piece.group),
    color: setting.color || piece.color,
    height: Number.isFinite(Number(setting.height)) ? Number(setting.height) : piece.height,
    stageWidth: Number.isFinite(Number(setting.stageWidth)) ? Number(setting.stageWidth) : piece.stageWidth,
    stageLength: Number.isFinite(Number(setting.stageLength)) ? Number(setting.stageLength) : piece.stageLength,
    defaultColor: setting.defaultColor || piece.defaultColor || setting.color || piece.color,
    defaultHeight: Number.isFinite(Number(setting.defaultHeight)) ? Number(setting.defaultHeight) : piece.defaultHeight,
    defaultStageWidth: Number.isFinite(Number(setting.defaultStageWidth)) ? Number(setting.defaultStageWidth) : piece.defaultStageWidth,
    defaultStageLength: Number.isFinite(Number(setting.defaultStageLength)) ? Number(setting.defaultStageLength) : piece.defaultStageLength,
    sourceHeightPx:
      setting.sourceHeightPx === undefined || setting.sourceHeightPx === ''
        ? piece.sourceHeightPx
        : Number.isFinite(Number(setting.sourceHeightPx))
          ? Number(setting.sourceHeightPx)
          : piece.sourceHeightPx,
    sourceWidthPx:
      setting.sourceWidthPx === undefined || setting.sourceWidthPx === ''
        ? piece.sourceWidthPx
        : Number.isFinite(Number(setting.sourceWidthPx))
          ? Number(setting.sourceWidthPx)
          : piece.sourceWidthPx,
    sourceLengthPx:
      setting.sourceLengthPx === undefined || setting.sourceLengthPx === ''
        ? piece.sourceLengthPx
        : Number.isFinite(Number(setting.sourceLengthPx))
          ? Number(setting.sourceLengthPx)
          : piece.sourceLengthPx,
    sourceFootprintScale:
      setting.sourceFootprintScale === undefined || setting.sourceFootprintScale === ''
        ? piece.sourceFootprintScale
        : Number.isFinite(Number(setting.sourceFootprintScale))
          ? Number(setting.sourceFootprintScale)
          : piece.sourceFootprintScale,
    keepAspectRatio: setting.keepAspectRatio === undefined ? piece.keepAspectRatio !== false : setting.keepAspectRatio !== false,
    offsetLinesEnabled: setting.offsetLinesEnabled === undefined ? piece.offsetLinesEnabled !== false : setting.offsetLinesEnabled !== false,
    surfaceSticker: hasSurfaceStickerContent(setting.surfaceSticker) ? normalizeSurfaceSticker(setting.surfaceSticker) : undefined,
  };
}

function usePersistentModels() {
  const [models, setModels] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(MODELS_STORAGE_KEY));
      return Array.isArray(stored) ? stored.map(compactSceneModelForStorage).slice(0, 20) : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    let active = true;
    readModelsFromDevice().then((stored) => {
      if (active) setModels(stored);
    });
    return () => { active = false; };
  }, []);
  return [models, setModels, writeModelsToDevice];
}

function openModelsDatabase() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error('IndexedDB is unavailable.'));
      return;
    }
    const request = indexedDB.open(MODELS_DATABASE_NAME, 2);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(MODELS_DATABASE_STORE)) database.createObjectStore(MODELS_DATABASE_STORE);
      if (!database.objectStoreNames.contains(SURFACE_STICKERS_DATABASE_STORE)) database.createObjectStore(SURFACE_STICKERS_DATABASE_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open model storage.'));
  });
}

async function readModelsFromIndexedDb() {
  const database = await openModelsDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(MODELS_DATABASE_STORE, 'readonly');
      const request = transaction.objectStore(MODELS_DATABASE_STORE).get(MODELS_STORAGE_KEY);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Could not read model storage.'));
    });
  } finally {
    database.close();
  }
}

async function writeModelsToIndexedDb(models) {
  const database = await openModelsDatabase();
  try {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(MODELS_DATABASE_STORE, 'readwrite');
      transaction.objectStore(MODELS_DATABASE_STORE).put(models, MODELS_STORAGE_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Could not write model storage.'));
      transaction.onabort = () => reject(transaction.error || new Error('Model storage was interrupted.'));
    });
  } finally {
    database.close();
  }
}

function readModelsFromLocalStorage() {
  try {
    const stored = JSON.parse(localStorage.getItem(MODELS_STORAGE_KEY));
    return Array.isArray(stored) ? stored.map(compactSceneModelForStorage).slice(0, 20) : [];
  } catch {
    return [];
  }
}

async function readModelsFromDevice() {
  try {
    const stored = await readModelsFromIndexedDb();
    if (Array.isArray(stored)) return stored.map(compactSceneModelForStorage).slice(0, 20);
  } catch (error) {
    console.warn('Could not read IndexedDB model storage', error);
  }
  const legacyModels = readModelsFromLocalStorage();
  if (legacyModels.length) {
    try {
      await writeModelsToIndexedDb(legacyModels);
    } catch {
      // Keep using the readable legacy copy when IndexedDB is unavailable.
    }
  }
  return legacyModels;
}

async function writeModelsToDevice(models) {
  const normalized = (Array.isArray(models) ? models : []).map(compactSceneModelForStorage).slice(0, 20);
  try {
    await writeModelsToIndexedDb(normalized);
    if (!writeJsonToLocalStorage(MODELS_STORAGE_KEY, normalized)) localStorage.removeItem(MODELS_STORAGE_KEY);
    return true;
  } catch (error) {
    console.warn('Could not save models to IndexedDB', error);
    return writeJsonToLocalStorage(MODELS_STORAGE_KEY, normalized);
  }
}

async function readSurfaceStickerLibrary() {
  try {
    const database = await openModelsDatabase();
    try {
      const stored = await new Promise((resolve, reject) => {
        const transaction = database.transaction(SURFACE_STICKERS_DATABASE_STORE, 'readonly');
        const request = transaction.objectStore(SURFACE_STICKERS_DATABASE_STORE).get(SURFACE_STICKERS_STORAGE_KEY);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('Could not read the sticker library.'));
      });
      return (Array.isArray(stored) ? stored : []).map(normalizeSurfaceStickerLibraryItem).filter(Boolean).slice(0, 50);
    } finally {
      database.close();
    }
  } catch (error) {
    console.warn('Could not read the surface sticker library', error);
    try {
      const stored = JSON.parse(localStorage.getItem(SURFACE_STICKERS_STORAGE_KEY));
      return (Array.isArray(stored) ? stored : []).map(normalizeSurfaceStickerLibraryItem).filter(Boolean).slice(0, 50);
    } catch {
      return [];
    }
  }
}

async function writeSurfaceStickerLibrary(items) {
  const normalized = (Array.isArray(items) ? items : []).map(normalizeSurfaceStickerLibraryItem).filter(Boolean).slice(0, 50);
  try {
    const database = await openModelsDatabase();
    try {
      await new Promise((resolve, reject) => {
        const transaction = database.transaction(SURFACE_STICKERS_DATABASE_STORE, 'readwrite');
        transaction.objectStore(SURFACE_STICKERS_DATABASE_STORE).put(normalized, SURFACE_STICKERS_STORAGE_KEY);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error || new Error('Could not save the sticker library.'));
        transaction.onabort = () => reject(transaction.error || new Error('Sticker library storage was interrupted.'));
      });
      return true;
    } finally {
      database.close();
    }
  } catch (error) {
    console.warn('Could not save the surface sticker library', error);
    return writeJsonToLocalStorage(SURFACE_STICKERS_STORAGE_KEY, normalized);
  }
}

function writeJsonToLocalStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.warn(`Could not save ${key} to local storage`, error);
    return false;
  }
}

function readRecoveryDraft() {
  try {
    const stored = JSON.parse(localStorage.getItem(RECOVERY_DRAFT_STORAGE_KEY));
    return stored && Array.isArray(stored.pieces) ? stored : null;
  } catch {
    return null;
  }
}

function designStateSignature(placed, material, renderSettings, modelTransform) {
  return JSON.stringify({
    pieces: placed || [],
    material: normalizeMaterialName(material),
    renderSettings: normalizeRenderSettings(renderSettings),
    modelTransform: normalizeModelTransform(modelTransform),
  });
}

function emptyDraft() {
  return {
    name: '',
    group: 'Default',
    color: '#1c7c74',
    height: 0.18,
    stageWidth: 2,
    stageLength: 2,
    points: '-1,-1 1,-1 1,1 -1,1',
    snapEdges: [],
    verticalEdges: [],
    displayEdges: [],
    sourceHeightPx: '',
    sourceWidthPx: '',
    sourceLengthPx: '',
    sourceFootprintScale: '',
    keepAspectRatio: true,
    analysisVersion: '',
    objText: '',
    glbDataUrl: '',
    glbUrl: '',
    surfaceSticker: undefined,
  };
}

function normalizePieceGroupName(group) {
  const normalized = typeof group === 'string' ? group.trim() : '';
  if (normalized.toLowerCase() === LEGACY_MOROCCO_GROUP.toLowerCase()) return '8 Morocco';
  return normalized || 'Default';
}

function normalizeMoroccoPieceId(value) {
  if (typeof value !== 'string') return value;
  return value.toLowerCase().startsWith(LEGACY_MOROCCO_ID_PREFIX)
    ? `${MOROCCO_ID_PREFIX}${value.slice(LEGACY_MOROCCO_ID_PREFIX.length)}`
    : value;
}

function normalizeMoroccoModelUrl(value) {
  if (typeof value !== 'string') return value;
  return value
    .replace(/8%20Morroco/gi, '8%20Morocco')
    .replace(/8 Morroco/gi, '8 Morocco');
}

function normalizeMoroccoStoredLibraryPiece(piece) {
  if (!piece || typeof piece !== 'object') return piece;
  return {
    ...piece,
    id: normalizeMoroccoPieceId(piece.id),
    sourceId: normalizeMoroccoPieceId(piece.sourceId),
    group: normalizePieceGroupName(piece.group),
    glbUrl: normalizeMoroccoModelUrl(piece.glbUrl),
  };
}

function normalizeMoroccoStoredSource(source) {
  if (!source || typeof source !== 'object') return source;
  const sourceKey = source.isFrameSlice
    ? source.sourceKey
    : normalizeMoroccoPieceId(source.sourceKey);
  return {
    ...source,
    sourceKey,
    sourceId: normalizeMoroccoPieceId(source.sourceId || source.id || sourceKey),
    group: normalizePieceGroupName(source.group),
    glbUrl: normalizeMoroccoModelUrl(source.glbUrl),
  };
}

function groupLibraryPieces(pieces, groupNames = []) {
  const groups = new Map();
  groupNames.forEach((groupName) => {
    groups.set(normalizePieceGroupName(groupName), []);
  });
  pieces.forEach((piece) => {
    const groupName = normalizePieceGroupName(piece.group);
    if (!groups.has(groupName)) groups.set(groupName, []);
    groups.get(groupName).push(piece);
  });
  return [...groups.entries()]
    .map(([name, items]) => ({
      name,
      items: [...items].sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    }))
    .sort((a, b) => {
      if (a.name === 'Default') return -1;
      if (b.name === 'Default') return 1;
      return a.name.localeCompare(b.name);
    });
}

function groupTemplateLibrary(templates, groupNames = []) {
  return groupLibraryPieces(templates, groupNames);
}

function parsePoints(value) {
  return value
    .trim()
    .split(/\s+/)
    .map((pair) => pair.split(',').map(Number))
    .filter((pair) => pair.length === 2 && pair.every(Number.isFinite));
}

function parseOptionalNumber(value) {
  if (value === '' || value === null || value === undefined) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

async function readObjModel(file) {
  const objText = await file.text();
  const analysis = analyzeObjText(objText);
  return {
    type: 'obj',
    objText,
    points: analysis.points,
    snapEdges: analysis.snapEdges,
    verticalEdges: analysis.verticalEdges,
    displayEdges: analysis.displayEdges,
    sourceHeightPx: analysis.sourceHeightPx,
    sourceWidthPx: analysis.sourceWidthPx,
    sourceLengthPx: analysis.sourceLengthPx,
    sourceFootprintScale: analysis.sourceFootprintScale,
    analysisVersion: analysis.analysisVersion,
    height: analysis.height,
  };
}

async function reanalyzeImportedPiece(piece) {
  if (piece.type === 'obj' && piece.objText) return analyzeObjText(piece.objText);
  if (piece.type === 'glb' && (piece.glbDataUrl || piece.glbUrl)) {
    const buffer = await pieceModelToArrayBuffer(piece);
    return parseGlbFootprint(buffer);
  }
  return null;
}

function analyzeObjText(objText) {
  const geometry = parseObjGeometry(objText);
  return analyzeGeometryFootprint(geometry.vertices, geometry.triangles);
}

async function readGlbModel(file) {
  const buffer = await file.arrayBuffer();
  const dataUrl = await arrayBufferToDataUrl(buffer, 'model/gltf-binary');
  const { points, snapEdges, verticalEdges, displayEdges, sourceHeightPx, sourceWidthPx, sourceLengthPx, sourceFootprintScale, analysisVersion, height } = await parseGlbFootprint(buffer);
  return {
    type: 'glb',
    glbDataUrl: dataUrl,
    points,
    snapEdges,
    verticalEdges,
    displayEdges,
    sourceHeightPx,
    sourceWidthPx,
    sourceLengthPx,
    sourceFootprintScale,
    analysisVersion,
    height,
  };
}

function parseObjGeometry(objText) {
  const vertices = [];
  const triangles = [];
  objText.split(/\r?\n/).forEach((rawLine) => {
    const line = rawLine.trim();
    if (line.startsWith('v ')) {
      const vertex = line.split(/\s+/).slice(1, 4).map(Number);
      if (vertex.length === 3 && vertex.every(Number.isFinite)) vertices.push(vertex);
    }
    if (line.startsWith('f ')) {
      const refs = line
        .split(/\s+/)
        .slice(1)
        .map((part) => Number(part.split('/')[0]))
        .filter(Number.isFinite)
        .map((index) => (index < 0 ? vertices.length + index : index - 1))
        .filter((index) => vertices[index]);
      for (let index = 1; index < refs.length - 1; index += 1) {
        triangles.push([vertices[refs[0]], vertices[refs[index]], vertices[refs[index + 1]]]);
      }
    }
  });
  return { vertices, triangles };
}

function parseObjVertices(objText) {
  return objText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('v '))
    .map((line) => line.split(/\s+/).slice(1, 4).map(Number))
    .filter((vertex) => vertex.length === 3 && vertex.every(Number.isFinite));
}

async function parseGlbFootprint(buffer) {
  const loader = new GLTFLoader();
  const gltf = await new Promise((resolve, reject) => {
    loader.parse(buffer.slice(0), '', resolve, reject);
  });
  const { vertices, triangles } = extractObjectGeometry(gltf.scene);
  if (vertices.length < 3) {
    return {
      points: emptyDraft().points.split(' ').map((pair) => pair.split(',').map(Number)),
      snapEdges: [],
      verticalEdges: [],
      displayEdges: [],
      sourceHeightPx: '',
      sourceWidthPx: '',
      sourceLengthPx: '',
      sourceFootprintScale: '',
      analysisVersion: ANALYSIS_VERSION,
      height: 0.18,
    };
  }
  return analyzeGeometryFootprint(vertices, triangles);
}

function extractObjectGeometry(object) {
  const vertices = [];
  const triangles = [];
  object.updateMatrixWorld(true);
  object.traverse((child) => {
    if (!child.isMesh || !child.geometry?.attributes?.position) return;
    const position = child.geometry.attributes.position;
    const indexAttribute = child.geometry.index;
    const point = new THREE.Vector3();
    const meshVertices = [];
    for (let index = 0; index < position.count; index += 1) {
      point.fromBufferAttribute(position, index).applyMatrix4(child.matrixWorld);
      const vertex = [point.x, point.y, point.z];
      meshVertices.push(vertex);
      vertices.push(vertex);
    }
    if (indexAttribute) {
      for (let index = 0; index < indexAttribute.count; index += 3) {
        triangles.push([
          meshVertices[indexAttribute.getX(index)],
          meshVertices[indexAttribute.getX(index + 1)],
          meshVertices[indexAttribute.getX(index + 2)],
        ]);
      }
    } else {
      for (let index = 0; index < meshVertices.length; index += 3) {
        if (meshVertices[index + 2]) triangles.push([meshVertices[index], meshVertices[index + 1], meshVertices[index + 2]]);
      }
    }
  });
  return { vertices, triangles };
}

function parseObjFootprint(objText) {
  const vertices = parseObjVertices(objText);
  if (vertices.length < 3) return emptyDraft().points.split(' ').map((pair) => pair.split(',').map(Number));
  return footprintFromVertices(vertices);
}

function analyzeGeometryFootprint(vertices, triangles) {
  if (vertices.length < 3) {
    const points = emptyDraft().points.split(' ').map((pair) => pair.split(',').map(Number));
    return {
      points,
      snapEdges: polygonToEdges(points),
      verticalEdges: [],
      displayEdges: polygonToEdges(points),
      sourceHeightPx: '',
      sourceWidthPx: '',
      sourceLengthPx: '',
      sourceFootprintScale: '',
      analysisVersion: ANALYSIS_VERSION,
      height: 0.18,
    };
  }
  const basis = footprintBasis(vertices);
  const fallbackPoints = footprintFromVertices(vertices);
  const height = estimateHeightFromVertices(vertices);
  const sourceHeightPx = measureSourceHeightPx(vertices);
  const sourceWidthPx = basis.width;
  const sourceLengthPx = basis.length;
  if (!triangles.length) {
    return {
      points: fallbackPoints,
      snapEdges: polygonToEdges(fallbackPoints),
      verticalEdges: [],
      displayEdges: polygonToEdges(fallbackPoints),
      sourceHeightPx,
      sourceWidthPx,
      sourceLengthPx,
      sourceFootprintScale: basis.scale,
      analysisVersion: ANALYSIS_VERSION,
      height,
    };
  }

  const verticalTolerance = Math.max(basis.ranges[basis.verticalAxis] * 0.08, 0.00001);
  const segmentMap = new Map();
  const verticalEdgeMap = new Map();

  triangles.forEach((triangle) => {
    const normal = triangleNormal(triangle);
    if (!normal) return;
    const isVerticalFace = Math.abs(normal[basis.verticalAxis]) < 0.35;
    if (!isVerticalFace) return;
    triangle.forEach((start, index) => {
      const end = triangle[(index + 1) % triangle.length];
      const verticalDelta = Math.abs(end[basis.verticalAxis] - start[basis.verticalAxis]);
      const segment = [projectFootprintPoint(start, basis), projectFootprintPoint(end, basis)];
      if (verticalDelta <= verticalTolerance) {
        if (segmentLength(segment) < 0.025) return;
        segmentMap.set(segmentKey(segment), segment);
        return;
      }
      if (segmentLength(segment) <= 0.025) {
        const point = projectFootprintPoint(start, basis);
        verticalEdgeMap.set(`${point[0].toFixed(4)},${point[1].toFixed(4)}`, point);
      }
    });
  });

  const rawSnapEdges = [...segmentMap.values()];
  const mergedSnapEdges = mergeCollinearSegments(rawSnapEdges);
  const rawBoundaryPoints = rawSnapEdges.length ? orderedBoundaryPoints(rawSnapEdges) : [];
  const mergedBoundaryPoints = rawBoundaryPoints.length >= 3 ? [] : orderedBoundaryPoints(mergedSnapEdges);
  const boundaryPoints = rawBoundaryPoints.length >= 3 ? rawBoundaryPoints : mergedBoundaryPoints;
  const points = boundaryPoints.length >= 3 ? boundaryPoints : fallbackPoints;
  const externalSnapEdges = boundaryPoints.length >= 3 ? polygonToEdges(boundaryPoints) : mergedSnapEdges;
  return {
    points,
    snapEdges: externalSnapEdges.length ? externalSnapEdges : polygonToEdges(fallbackPoints),
    verticalEdges: [...verticalEdgeMap.values()],
    displayEdges: rawSnapEdges.length ? rawSnapEdges : externalSnapEdges,
    sourceHeightPx,
    sourceWidthPx,
    sourceLengthPx,
    sourceFootprintScale: basis.scale,
    analysisVersion: ANALYSIS_VERSION,
    height,
  };
}

function footprintBasis(vertices) {
  const ranges = [0, 1, 2].map((axis) => {
    const values = vertices.map((vertex) => vertex[axis]);
    return Math.max(...values) - Math.min(...values);
  });
  const verticalAxis = 1;
  const axes = [0, 1, 2].filter((axis) => axis !== verticalAxis);
  const valuesA = vertices.map((vertex) => vertex[axes[0]]);
  const valuesB = vertices.map((vertex) => vertex[axes[1]]);
  const minA = Math.min(...valuesA);
  const maxA = Math.max(...valuesA);
  const minB = Math.min(...valuesB);
  const maxB = Math.max(...valuesB);
  return {
    axes,
    ranges,
    verticalAxis,
    centerA: (minA + maxA) / 2,
    centerB: (minB + maxB) / 2,
    width: maxA - minA,
    length: maxB - minB,
    scale: OBJ_DISPLAY_SIZE / Math.max(maxA - minA || 1, maxB - minB || 1),
  };
}

function projectFootprintPoint(vertex, basis) {
  return [(vertex[basis.axes[0]] - basis.centerA) * basis.scale, (vertex[basis.axes[1]] - basis.centerB) * basis.scale];
}

function triangleNormal([a, b, c]) {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const vc = new THREE.Vector3(...c);
  const normal = vb.sub(va).cross(vc.sub(va));
  if (normal.lengthSq() < 0.0000001) return null;
  normal.normalize();
  return [normal.x, normal.y, normal.z];
}

function segmentLength([start, end]) {
  return Math.hypot(end[0] - start[0], end[1] - start[1]);
}

function mergeCollinearSegments(segments) {
  const groups = new Map();
  segments.forEach((segment) => {
    const [start, end] = segment;
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const length = Math.hypot(dx, dy);
    if (length < 0.025) return;
    let ux = dx / length;
    let uy = dy / length;
    if (ux < 0 || (Math.abs(ux) < 0.0001 && uy < 0)) {
      ux *= -1;
      uy *= -1;
    }
    const normalX = -uy;
    const normalY = ux;
    const offset = start[0] * normalX + start[1] * normalY;
    const angleKey = Math.round(Math.atan2(uy, ux) / 0.01);
    const offsetKey = Math.round(offset / 0.02);
    const key = `${angleKey}:${offsetKey}`;
    const t1 = start[0] * ux + start[1] * uy;
    const t2 = end[0] * ux + end[1] * uy;
    if (!groups.has(key)) groups.set(key, { ux, uy, normalX, normalY, offset, intervals: [] });
    groups.get(key).intervals.push([Math.min(t1, t2), Math.max(t1, t2)]);
  });

  const merged = [];
  groups.forEach((group) => {
    group.intervals.sort((a, b) => a[0] - b[0]);
    const intervals = [];
    group.intervals.forEach(([start, end]) => {
      const last = intervals[intervals.length - 1];
      if (last && start <= last[1] + 0.04) last[1] = Math.max(last[1], end);
      else intervals.push([start, end]);
    });
    intervals.forEach(([start, end]) => {
      if (end - start < 0.05) return;
      const baseX = group.normalX * group.offset;
      const baseY = group.normalY * group.offset;
      merged.push([
        [baseX + group.ux * start, baseY + group.uy * start],
        [baseX + group.ux * end, baseY + group.uy * end],
      ]);
    });
  });
  return merged;
}

function orderedBoundaryPoints(segments) {
  const cleanSegments = segments.filter((segment) => segmentLength(segment) > 0.025);
  if (!cleanSegments.length) return [];
  const points = dedupePoints(cleanSegments.flat());
  const byKey = new Map(points.map((point) => [pointKey(point), point]));
  const adjacency = new Map();
  const directedEdges = [];
  cleanSegments.forEach(([start, end]) => {
    const startKey = pointKey(start);
    const endKey = pointKey(end);
    if (!adjacency.has(startKey)) adjacency.set(startKey, new Set());
    if (!adjacency.has(endKey)) adjacency.set(endKey, new Set());
    adjacency.get(startKey).add(endKey);
    adjacency.get(endKey).add(startKey);
    byKey.set(startKey, start);
    byKey.set(endKey, end);
    directedEdges.push([startKey, endKey], [endKey, startKey]);
  });

  const loops = [];
  const visited = new Set();
  directedEdges.forEach(([from, to]) => {
    const visitKey = `${from}>${to}`;
    if (visited.has(visitKey)) return;
    const loop = traceBoundaryLoop(from, to, adjacency, byKey, visited);
    if (loop.length >= 3) loops.push(loop);
  });

  if (!loops.length) return [];
  return loops
    .map((loop) => ({ loop, area: polygonArea2(loop) }))
    .filter(({ area }) => Math.abs(area) > 0.0001)
    .sort((a, b) => Math.abs(b.area) - Math.abs(a.area))[0]?.loop || [];
}

function traceBoundaryLoop(startKey, nextKey, adjacency, byKey, visited) {
  const loop = [];
  let previousKey = startKey;
  let currentKey = nextKey;
  const firstEdge = `${startKey}>${nextKey}`;
  const maxSteps = adjacency.size * 3 + 6;

  for (let step = 0; step < maxSteps; step += 1) {
    visited.add(`${previousKey}>${currentKey}`);
    const point = byKey.get(previousKey);
    if (!point) return [];
    loop.push(point);

    const neighbors = [...(adjacency.get(currentKey) || [])].filter((key) => key !== previousKey);
    if (!neighbors.length) return [];
    const chosenNextKey = chooseBoundaryNextKey(previousKey, currentKey, neighbors, byKey);
    const nextEdge = `${currentKey}>${chosenNextKey}`;
    if (nextEdge === firstEdge) {
      loop.push(byKey.get(currentKey));
      return dedupeSequentialPoints(loop);
    }
    previousKey = currentKey;
    currentKey = chosenNextKey;
  }
  return [];
}

function chooseBoundaryNextKey(previousKey, currentKey, neighbors, byKey) {
  const previous = byKey.get(previousKey);
  const current = byKey.get(currentKey);
  const incoming = [current[0] - previous[0], current[1] - previous[1]];
  return neighbors
    .map((key) => {
      const point = byKey.get(key);
      const outgoing = [point[0] - current[0], point[1] - current[1]];
      const turn = Math.atan2(incoming[0] * outgoing[1] - incoming[1] * outgoing[0], incoming[0] * outgoing[0] + incoming[1] * outgoing[1]);
      return { key, turn: turn <= 0 ? turn + Math.PI * 2 : turn };
    })
    .sort((a, b) => a.turn - b.turn)[0].key;
}

function dedupeSequentialPoints(points) {
  const deduped = points.filter((point, index) => index === 0 || pointKey(point) !== pointKey(points[index - 1]));
  if (deduped.length > 1 && pointKey(deduped[0]) === pointKey(deduped[deduped.length - 1])) deduped.pop();
  return deduped;
}

function polygonArea2(points) {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += current[0] * next[1] - next[0] * current[1];
  }
  return area * 0.5;
}

function pointKey([x, y]) {
  return `${Number(x).toFixed(3)},${Number(y).toFixed(3)}`;
}

function segmentKey([start, end]) {
  const a = `${start[0].toFixed(4)},${start[1].toFixed(4)}`;
  const b = `${end[0].toFixed(4)},${end[1].toFixed(4)}`;
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function polygonToEdges(points) {
  return points.map((point, index) => [point, points[(index + 1) % points.length]]);
}

function footprintFromVertices(vertices) {
  const ranges = [0, 1, 2].map((axis) => {
    const values = vertices.map((vertex) => vertex[axis]);
    return Math.max(...values) - Math.min(...values);
  });
  const verticalAxis = ranges.indexOf(Math.min(...ranges));
  const axes = [0, 1, 2].filter((axis) => axis !== verticalAxis);
  const projected = vertices.map((vertex) => [vertex[axes[0]], vertex[axes[1]]]);
  const unique = dedupePoints(projected);
  const hull = convexHull(unique);
  return normalizeFootprint(hull.length >= 3 ? hull : unique);
}

function estimateObjHeight(objText) {
  const vertices = parseObjVertices(objText);
  if (vertices.length < 2) return 0.18;
  return estimateHeightFromVertices(vertices);
}

function estimateHeightFromVertices(vertices) {
  const heightRange = measureVertexAxisRange(vertices, 1) || 0.18;
  return Number(heightRange.toFixed(heightRange >= 10 ? 0 : 3));
}

function measureSourceHeightPx(vertices) {
  const rawHeight = measureVertexAxisRange(vertices, 1) || 0;
  return Number(rawHeight.toFixed(rawHeight >= 10 ? 0 : 3));
}

function measureVertexAxisRange(vertices, axis) {
  if (!vertices.length) return 0;
  const values = vertices.map((vertex) => vertex[axis]).filter(Number.isFinite);
  return values.length ? Math.max(...values) - Math.min(...values) : 0;
}

function arrayBufferToDataUrl(buffer, mimeType) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(new Blob([buffer], { type: mimeType }));
  });
}

async function dataUrlToArrayBuffer(dataUrl) {
  const response = await fetch(dataUrl);
  return response.arrayBuffer();
}

async function pieceModelToArrayBuffer(piece) {
  if (piece.glbDataUrl) return dataUrlToArrayBuffer(piece.glbDataUrl);
  if (piece.glbUrl) {
    const response = await fetch(piece.glbUrl);
    if (!response.ok) throw new Error(`Failed to load ${piece.glbUrl}`);
    return response.arrayBuffer();
  }
  throw new Error(`Missing GLB source for ${piece.name || piece.id}`);
}

function dedupePoints(points) {
  const seen = new Set();
  return points.filter(([x, y]) => {
    const key = `${x.toFixed(5)},${y.toFixed(5)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function convexHull(points) {
  const sorted = [...points].sort(([ax, ay], [bx, by]) => ax - bx || ay - by);
  if (sorted.length <= 3) return sorted;
  const cross = (origin, a, b) => (a[0] - origin[0]) * (b[1] - origin[1]) - (a[1] - origin[1]) * (b[0] - origin[0]);
  const lower = [];
  sorted.forEach((point) => {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop();
    lower.push(point);
  });
  const upper = [];
  [...sorted].reverse().forEach((point) => {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop();
    upper.push(point);
  });
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

function normalizeFootprint(points) {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const scale = OBJ_DISPLAY_SIZE / Math.max(maxX - minX || 1, maxY - minY || 1);
  return points.map(([x, y]) => [(x - centerX) * scale, (y - centerY) * scale]);
}

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function serializeSceneModel(name, placed, style, material, renderSettings = DEFAULT_RENDER_SETTINGS, modelTransform = DEFAULT_MODEL_TRANSFORM) {
  const normalizedMaterial = normalizeMaterialName(material);
  const flatPolygons = placed
    .filter((piece) => !piece.hidden)
    .map((piece) => ({
      id: piece.id,
      sourceId: piece.sourceId,
      name: piece.name,
      color: piece.color,
      height: Number(piece.height) || 0.18,
      elevation: Number(piece.elevation) || 0,
      points: worldFootprintPoints(piece),
    }))
    .filter((polygon) => polygon.points.length >= 3);
  const flatBounds = exportPolygonBounds(flatPolygons);
  return {
    id: `model-${crypto.randomUUID()}`,
    app: 'Girih',
    kind: 'girih-model',
    version: 1,
    name,
    exportedAt: new Date().toISOString(),
    style,
    material: normalizedMaterial,
    renderSettings: normalizeRenderSettings(renderSettings),
    modelTransform: normalizeModelTransform(modelTransform),
    bounds: sceneBounds(placed),
    mehrazPlacementMode: 'preserve-girih-stage',
    mehrazFlatPattern: {
      version: 1,
      coordinateSystem: 'girih-world-xz',
      grouped: true,
      bounds: flatBounds,
      pieces: flatPolygons,
    },
    pieces: placed.map(({ id, sourceId, name: pieceName, group, groupInstanceId, points, snapEdges, verticalEdges, displayEdges, offsetLinesEnabled, surfaceSticker, surfaceStickerUvTransform, sourceHeightPx, sourceWidthPx, sourceLengthPx, sourceFootprintScale, keepAspectRatio, analysisVersion, isFrameSlice, x, y, rotation, elevation, tiltX, tiltZ, mirrorHorizontal, mirrorVertical, hidden, height, stageWidth, stageLength, color, type, objText, glbDataUrl, glbUrl, snappedTo }) => ({
      id,
      sourceId,
      name: pieceName,
      group: normalizePieceGroupName(group),
      groupInstanceId: groupInstanceId || null,
      type: type || 'shape',
      isFrameSlice: !!isFrameSlice,
      points,
      snapEdges,
      verticalEdges,
      displayEdges,
      offsetLinesEnabled: offsetLinesEnabled !== false,
      surfaceSticker: hasSurfaceStickerContent(surfaceSticker) ? normalizeSurfaceSticker(surfaceSticker) : undefined,
      surfaceStickerUvTransform: normalizeSurfaceStickerUvTransform(surfaceStickerUvTransform),
      sourceHeightPx,
      sourceWidthPx,
      sourceLengthPx,
      sourceFootprintScale,
      keepAspectRatio: keepAspectRatio !== false,
      analysisVersion,
      objText,
      glbDataUrl,
      glbUrl,
      snappedTo,
      transform: { x, y, rotation, elevation, tiltX, tiltZ, mirrorHorizontal: !!mirrorHorizontal, mirrorVertical: !!mirrorVertical, hidden: !!hidden, height, stageWidth, stageLength },
      material: { type: normalizedMaterial, color },
    })),
  };
}

function compactSceneModelForStorage(model) {
  if (!model || typeof model !== 'object') return model;
  const sourceMap = new Map();
  if (Array.isArray(model.sources)) {
    model.sources.forEach((source) => {
      const sourceKey = source.sourceKey || source.id || source.sourceId;
      if (sourceKey) sourceMap.set(sourceKey, compactSceneSource(sourceKey, source));
    });
  }
  const compactPieces = (Array.isArray(model.pieces) ? model.pieces : []).map((piece) => {
    const sourceKey = piece.sourceKey || (piece.isFrameSlice ? piece.id : piece.sourceId || piece.id);
    if (!sourceMap.has(sourceKey)) sourceMap.set(sourceKey, compactSceneSource(sourceKey, piece));
    return compactSceneInstance(sourceKey, piece);
  });
  return {
    ...model,
    version: 2,
    sources: Array.from(sourceMap.values()),
    pieces: compactPieces,
  };
}

function compactSceneSource(sourceKey, piece) {
  const normalizedSourceKey = piece.isFrameSlice ? sourceKey : normalizeMoroccoPieceId(sourceKey);
  return {
    sourceKey: normalizedSourceKey,
    sourceId: normalizeMoroccoPieceId(piece.sourceId || piece.id || normalizedSourceKey),
    name: piece.name || 'Imported model piece',
    group: normalizePieceGroupName(piece.group),
    type: piece.type || 'shape',
    isFrameSlice: !!piece.isFrameSlice,
    points: piece.points,
    snapEdges: piece.snapEdges,
    verticalEdges: piece.verticalEdges,
    displayEdges: piece.displayEdges,
    offsetLinesEnabled: piece.offsetLinesEnabled !== false,
    surfaceSticker: hasSurfaceStickerContent(piece.surfaceSticker) ? normalizeSurfaceSticker(piece.surfaceSticker) : undefined,
    surfaceStickerUvTransform: normalizeSurfaceStickerUvTransform(piece.surfaceStickerUvTransform),
    sourceHeightPx: piece.sourceHeightPx,
    sourceWidthPx: piece.sourceWidthPx,
    sourceLengthPx: piece.sourceLengthPx,
    sourceFootprintScale: piece.sourceFootprintScale,
    keepAspectRatio: piece.keepAspectRatio !== false,
    analysisVersion: piece.analysisVersion,
    objText: piece.objText,
    glbDataUrl: piece.glbUrl ? undefined : piece.glbDataUrl,
    glbUrl: normalizeMoroccoModelUrl(piece.glbUrl),
  };
}

function compactSceneInstance(sourceKey, piece) {
  const transform = piece.transform || piece;
  const materialInfo = piece.material || {};
  const normalizedSourceKey = piece.isFrameSlice ? sourceKey : normalizeMoroccoPieceId(sourceKey);
  return {
    id: piece.id,
    sourceKey: normalizedSourceKey,
    sourceId: normalizeMoroccoPieceId(piece.sourceId || normalizedSourceKey),
    groupInstanceId: piece.groupInstanceId || null,
    snappedTo: piece.snappedTo || null,
    offsetLinesEnabled: piece.offsetLinesEnabled !== false,
    transform: {
      x: transform.x,
      y: transform.y,
      rotation: transform.rotation,
      elevation: transform.elevation,
      tiltX: transform.tiltX,
      tiltZ: transform.tiltZ,
      mirrorHorizontal: !!transform.mirrorHorizontal,
      mirrorVertical: !!transform.mirrorVertical,
      hidden: !!transform.hidden,
      height: transform.height ?? piece.height,
      stageWidth: transform.stageWidth ?? piece.stageWidth,
      stageLength: transform.stageLength ?? piece.stageLength,
    },
    material: {
      color: materialInfo.color || piece.color,
    },
  };
}

function rehydrateScenePieces(model) {
  const sourcePieces = Array.isArray(model?.pieces) ? model.pieces : [];
  const sourceByKey = new Map();
  (Array.isArray(model?.sources) ? model.sources : [])
    .filter((source) => source && typeof source === 'object')
    .forEach((source) => {
      const rawKey = source.sourceKey || source.id || source.sourceId;
      if (!rawKey) return;
      const normalizedSource = normalizeMoroccoStoredSource(source);
      const normalizedKey = source.isFrameSlice ? rawKey : normalizeMoroccoPieceId(rawKey);
      sourceByKey.set(rawKey, normalizedSource);
      sourceByKey.set(normalizedKey, normalizedSource);
    });
  const idMap = new Map();
  const groupIdMap = new Map();
  const pieces = sourcePieces
    .map((piece) => {
      const oldId = piece.id || crypto.randomUUID();
      const transform = piece.transform || piece;
      const materialInfo = piece.material || {};
      const normalizedSourceKey = piece.isFrameSlice ? piece.sourceKey : normalizeMoroccoPieceId(piece.sourceKey);
      const normalizedPieceSourceId = normalizeMoroccoPieceId(piece.sourceId);
      const source = sourceByKey.get(normalizedSourceKey) || sourceByKey.get(normalizedPieceSourceId) || DEFAULT_PIECE_BY_ID.get(normalizedPieceSourceId) || {};
      const sourceId = normalizedPieceSourceId || normalizeMoroccoPieceId(source.sourceId) || slugify(piece.name || source.name || oldId) || oldId;
      const nextId = `${sourceId}-${crypto.randomUUID()}`;
      const sourceGroupInstanceId = piece.groupInstanceId || null;
      const groupInstanceId = sourceGroupInstanceId
        ? groupIdMap.get(sourceGroupInstanceId) || `group-${crypto.randomUUID()}`
        : null;
      if (sourceGroupInstanceId && !groupIdMap.has(sourceGroupInstanceId)) groupIdMap.set(sourceGroupInstanceId, groupInstanceId);
      idMap.set(oldId, nextId);
      return {
        id: nextId,
        sourceId,
        name: piece.name || source.name || 'Imported model piece',
        group: normalizePieceGroupName(piece.group || source.group),
        groupInstanceId,
        type: piece.type || source.type || 'shape',
        isFrameSlice: !!(piece.isFrameSlice ?? source.isFrameSlice) || ((piece.type || source.type) === 'shape' && /\bslice\b/i.test(piece.name || source.name || '')),
        color: materialInfo.color || piece.color || '#1c7c74',
        points: piece.points || source.points || emptyDraft().points.split(' ').map((pair) => pair.split(',').map(Number)),
        snapEdges: piece.snapEdges || source.snapEdges,
        verticalEdges: piece.verticalEdges || source.verticalEdges,
        displayEdges: piece.displayEdges || source.displayEdges,
        offsetLinesEnabled: (piece.offsetLinesEnabled ?? source.offsetLinesEnabled) !== false,
        surfaceSticker: hasSurfaceStickerContent(piece.surfaceSticker ?? source.surfaceSticker) ? normalizeSurfaceSticker(piece.surfaceSticker ?? source.surfaceSticker) : undefined,
        surfaceStickerUvTransform: normalizeSurfaceStickerUvTransform(piece.surfaceStickerUvTransform ?? source.surfaceStickerUvTransform),
        sourceHeightPx: piece.sourceHeightPx ?? source.sourceHeightPx,
        sourceWidthPx: piece.sourceWidthPx ?? source.sourceWidthPx,
        sourceLengthPx: piece.sourceLengthPx ?? source.sourceLengthPx,
        sourceFootprintScale: piece.sourceFootprintScale ?? source.sourceFootprintScale,
        keepAspectRatio: (piece.keepAspectRatio ?? source.keepAspectRatio) !== false,
        analysisVersion: piece.analysisVersion ?? source.analysisVersion,
        objText: piece.objText ?? source.objText,
        glbDataUrl: piece.glbDataUrl ?? source.glbDataUrl,
        glbUrl: normalizeMoroccoModelUrl(piece.glbUrl ?? source.glbUrl),
        x: Number(transform.x) || 0,
        y: Number(transform.y) || 0,
        rotation: Number(transform.rotation) || 0,
        elevation: Number(transform.elevation) || 0,
        tiltX: Number(transform.tiltX) || 0,
        tiltZ: Number(transform.tiltZ) || 0,
        mirrorHorizontal: !!transform.mirrorHorizontal,
        mirrorVertical: !!transform.mirrorVertical,
        hidden: !!transform.hidden,
        height: Number(transform.height || piece.height) || 0.18,
        stageWidth: parseOptionalNumber(transform.stageWidth ?? piece.stageWidth),
        stageLength: parseOptionalNumber(transform.stageLength ?? piece.stageLength),
        snappedTo: piece.snappedTo || null,
      };
    })
    .filter((piece) => piece.points?.length);

  return pieces.map((piece) => ({
    ...piece,
    snappedTo: piece.snappedTo && idMap.has(piece.snappedTo) ? idMap.get(piece.snappedTo) : null,
  }));
}

function centerScenePieces(pieces) {
  if (!pieces.length) return [];
  const bounds = sceneBounds(pieces);
  const offsetX = -((bounds.minX + bounds.maxX) / 2);
  const offsetY = -((bounds.minY + bounds.maxY) / 2);
  return pieces.map((piece) => ({ ...piece, x: piece.x + offsetX, y: piece.y + offsetY }));
}

function placeImportedScene(incoming, current) {
  if (!incoming.length || !current.length) return incoming;
  const currentBounds = sceneBounds(current);
  const incomingBounds = sceneBounds(incoming);
  const offsetX = currentBounds.maxX - incomingBounds.minX + 1.2;
  const currentCenterY = (currentBounds.minY + currentBounds.maxY) / 2;
  const incomingCenterY = (incomingBounds.minY + incomingBounds.maxY) / 2;
  const offsetY = currentCenterY - incomingCenterY;
  return incoming.map((piece) => ({ ...piece, x: piece.x + offsetX, y: piece.y + offsetY }));
}

function placeNewPieceNearCollection(piece, current, visibleBounds = null) {
  if (!current.length) {
    const [x, y] = visibleBounds ? visiblePlacementCenter(piece, visibleBounds) : [0, 0];
    return { ...piece, x, y };
  }
  const collectionBounds = sceneBounds(current);
  const pieceBounds = sceneBounds([{ ...piece, x: 0, y: 0 }]);
  const pieceWidth = Math.max(pieceBounds.maxX - pieceBounds.minX, 0.1);
  const pieceHeight = Math.max(pieceBounds.maxY - pieceBounds.minY, 0.1);
  const collectionWidth = Math.max(collectionBounds.maxX - collectionBounds.minX, 0.1);
  const collectionHeight = Math.max(collectionBounds.maxY - collectionBounds.minY, 0.1);
  const collectionCenterX = (collectionBounds.minX + collectionBounds.maxX) / 2;
  const collectionCenterY = (collectionBounds.minY + collectionBounds.maxY) / 2;
  const pieceCenterX = (pieceBounds.minX + pieceBounds.maxX) / 2;
  const pieceCenterY = (pieceBounds.minY + pieceBounds.maxY) / 2;
  const gap = 0.28;
  const baseCandidates = [
    [collectionBounds.maxX + gap - pieceBounds.minX, collectionCenterY - pieceCenterY],
    [collectionBounds.minX - gap - pieceBounds.maxX, collectionCenterY - pieceCenterY],
    [collectionCenterX - pieceCenterX, collectionBounds.maxY + gap - pieceBounds.minY],
    [collectionCenterX - pieceCenterX, collectionBounds.minY - gap - pieceBounds.maxY],
  ];

  const candidates = [];
  const visibleCandidates = visibleBounds ? visiblePlacementCandidates(piece, pieceBounds, visibleBounds, collectionBounds) : [];
  for (let ring = 0; ring < 8; ring += 1) {
    const extraX = ring * (pieceWidth + gap);
    const extraY = ring * (pieceHeight + gap);
    baseCandidates.forEach(([x, y], index) => {
      const sideOffset = index < 2 ? extraY : extraX;
      candidates.push([x + (index === 0 ? extraX : index === 1 ? -extraX : 0), y + (index === 2 ? extraY : index === 3 ? -extraY : 0)]);
      if (sideOffset) {
        candidates.push([x + (index < 2 ? 0 : sideOffset), y + (index < 2 ? sideOffset : 0)]);
        candidates.push([x - (index < 2 ? 0 : sideOffset), y - (index < 2 ? sideOffset : 0)]);
      }
    });
  }

  const fallback = baseCandidates[0];
  const allCandidates = [...visibleCandidates, ...candidates];
  const scored = allCandidates
    .map(([x, y]) => ({ x, y, score: placementScore(piece, x, y, current, collectionBounds, visibleBounds) }))
    .filter((candidate) => Number.isFinite(candidate.score))
    .sort((a, b) => a.score - b.score);
  const best = scored[0] || { x: fallback[0], y: fallback[1] };
  if (visibleBounds && collidesWithAny({ ...piece, x: best.x, y: best.y }, current)) {
    const [x, y] = visiblePlacementCenter(piece, visibleBounds);
    return { ...piece, x, y };
  }
  return { ...piece, x: best.x, y: best.y };
}

function visiblePlacementCenter(piece, visibleBounds) {
  const pieceBounds = sceneBounds([{ ...piece, x: 0, y: 0 }]);
  const minX = visibleBounds.minX - pieceBounds.minX;
  const maxX = visibleBounds.maxX - pieceBounds.maxX;
  const minY = visibleBounds.minY - pieceBounds.minY;
  const maxY = visibleBounds.maxY - pieceBounds.maxY;
  const centerX = (visibleBounds.minX + visibleBounds.maxX) / 2 - (pieceBounds.minX + pieceBounds.maxX) / 2;
  const centerY = (visibleBounds.minY + visibleBounds.maxY) / 2 - (pieceBounds.minY + pieceBounds.maxY) / 2;
  return [clamp(centerX, minX, maxX), clamp(centerY, minY, maxY)];
}

function visiblePlacementCandidates(piece, pieceBounds, visibleBounds, collectionBounds) {
  const pieceWidth = Math.max(pieceBounds.maxX - pieceBounds.minX, 0.1);
  const pieceHeight = Math.max(pieceBounds.maxY - pieceBounds.minY, 0.1);
  const minX = visibleBounds.minX - pieceBounds.minX + 0.08;
  const maxX = visibleBounds.maxX - pieceBounds.maxX - 0.08;
  const minY = visibleBounds.minY - pieceBounds.minY + 0.08;
  const maxY = visibleBounds.maxY - pieceBounds.maxY - 0.08;
  if (minX > maxX || minY > maxY) return [visiblePlacementCenter(piece, visibleBounds)];

  const center = visiblePlacementCenter(piece, visibleBounds);
  const collectionCenterX = (collectionBounds.minX + collectionBounds.maxX) / 2;
  const collectionCenterY = (collectionBounds.minY + collectionBounds.maxY) / 2;
  const stepX = Math.max(pieceWidth + 0.22, 0.35);
  const stepY = Math.max(pieceHeight + 0.22, 0.35);
  const candidates = [[clamp(collectionCenterX, minX, maxX), clamp(collectionCenterY, minY, maxY)], center];
  const cols = Math.max(2, Math.ceil((maxX - minX) / stepX));
  const rows = Math.max(2, Math.ceil((maxY - minY) / stepY));

  for (let row = 0; row <= rows; row += 1) {
    for (let col = 0; col <= cols; col += 1) {
      candidates.push([
        minX + ((maxX - minX) * col) / cols,
        minY + ((maxY - minY) * row) / rows,
      ]);
    }
  }

  return dedupeCandidatePoints(candidates);
}

function placementScore(piece, x, y, current, collectionBounds, visibleBounds) {
  const candidate = { ...piece, x, y };
  if (collidesWithAny(candidate, current)) return Infinity;
  const bounds = sceneBounds([candidate]);
  const visiblePenalty = visibleBounds ? visibleBoundsPenalty(bounds, visibleBounds) : 0;
  if (visiblePenalty > 0.001) return Infinity;
  const collectionCenterX = (collectionBounds.minX + collectionBounds.maxX) / 2;
  const collectionCenterY = (collectionBounds.minY + collectionBounds.maxY) / 2;
  const visibleCenterX = visibleBounds ? (visibleBounds.minX + visibleBounds.maxX) / 2 : collectionCenterX;
  const visibleCenterY = visibleBounds ? (visibleBounds.minY + visibleBounds.maxY) / 2 : collectionCenterY;
  const collectionDistance = Math.hypot(x - collectionCenterX, y - collectionCenterY);
  const visibleDistance = Math.hypot(x - visibleCenterX, y - visibleCenterY);
  return collectionDistance + visibleDistance * 0.35;
}

function visibleBoundsPenalty(bounds, visibleBounds) {
  return (
    Math.max(0, visibleBounds.minX - bounds.minX) +
    Math.max(0, bounds.maxX - visibleBounds.maxX) +
    Math.max(0, visibleBounds.minY - bounds.minY) +
    Math.max(0, bounds.maxY - visibleBounds.maxY)
  );
}

function dedupeCandidatePoints(points) {
  const seen = new Set();
  return points.filter(([x, y]) => {
    const key = `${x.toFixed(3)},${y.toFixed(3)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function clamp(value, min, max) {
  if (min > max) return (min + max) / 2;
  return Math.min(Math.max(value, min), max);
}

function sceneBounds(pieces) {
  const points = pieces.flatMap((piece) => worldFootprintPoints(piece));
  if (!points.length) return { minX: -1, maxX: 1, minY: -1, maxY: 1 };
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

function worldFootprintPoints(piece) {
  const local = getLocalCollisionPoints(piece);
  if (!local.length) return [[piece.x || 0, piece.y || 0]];
  return local.map((point) => {
    const [x, y] = mirrorLocalPointForPiece(piece, point);
    const [rx, ry] = rotatePoint(x, y, piece.rotation || 0);
    return [rx + (piece.x || 0), ry + (piece.y || 0)];
  });
}

async function renderSceneCanvas(placed, options = {}) {
  if (normalizeMaterialName(options.material) === 'paper') return renderPaperSceneCanvas(placed, options);
  return renderIsometricSceneCanvas(placed, options);
}

async function renderPaperSceneCanvas(placed, options = {}) {
  const orientation = options.orientation || 'landscape';
  const size = exportCanvasSize(orientation, options.paperSize);
  const canvas = document.createElement('canvas');
  canvas.width = size[0];
  canvas.height = size[1];
  const context = canvas.getContext('2d');
  if (!options.transparentBackground) {
    context.fillStyle = PAPER_BACKGROUND_COLOR;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  const transformMatrix = modelTransformMatrix(options.modelTransform);
  const segments = placed.flatMap((piece) => transformedPaperSegments(piece, transformMatrix));
  if (!segments.length) return canvas;

  const bounds = segmentBounds(segments);
  const margin = Math.max(72, PAPER_EDGE_THICKNESS * 8);
  const width = Math.max(bounds.maxX - bounds.minX, 0.001);
  const height = Math.max(bounds.maxY - bounds.minY, 0.001);
  const scale = Math.min((canvas.width - margin * 2) / width, (canvas.height - margin * 2) / height);
  const drawWidth = width * scale;
  const drawHeight = height * scale;
  const offsetX = (canvas.width - drawWidth) / 2;
  const offsetY = (canvas.height - drawHeight) / 2;
  const toCanvas = ([x, y]) => [
    offsetX + (x - bounds.minX) * scale,
    offsetY + (y - bounds.minY) * scale,
  ];

  context.save();
  context.strokeStyle = PAPER_EDGE_COLOR;
  context.lineWidth = PAPER_EDGE_THICKNESS;
  context.lineJoin = 'round';
  context.lineCap = 'round';
  segments.forEach(([start, end]) => {
    const [startX, startY] = toCanvas(start);
    const [endX, endY] = toCanvas(end);
    context.beginPath();
    context.moveTo(startX, startY);
    context.lineTo(endX, endY);
    context.stroke();
  });
  context.restore();
  return canvas;
}

function transformedPaperSegments(piece, transformMatrix) {
  const rotation = Number(piece.rotation) || 0;
  return getExportFootprintSegments(piece)
    .filter(([start, end]) => start && end)
    .map(([start, end]) => [
      transformPaperPoint(start, piece, rotation, transformMatrix),
      transformPaperPoint(end, piece, rotation, transformMatrix),
    ]);
}

function transformPaperPoint(point, piece, rotation, transformMatrix) {
  const [x, y] = mirrorLocalPointForPiece(piece, point);
  const [rx, ry] = rotatePoint(x, y, rotation);
  const transformed = new THREE.Vector3(rx + (piece.x || 0), 0, ry + (piece.y || 0)).applyMatrix4(transformMatrix);
  return [transformed.x, transformed.z];
}

function segmentBounds(segments) {
  const points = segments.flat();
  return points.reduce(
    (bounds, [x, y]) => ({
      minX: Math.min(bounds.minX, x),
      maxX: Math.max(bounds.maxX, x),
      minY: Math.min(bounds.minY, y),
      maxY: Math.max(bounds.maxY, y),
    }),
    { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity },
  );
}

function projectExportPoint(x, y, z, view) {
  if (view !== 'isometric') return [x, y];
  const cos = Math.cos(Math.PI / 6);
  const sin = Math.sin(Math.PI / 6);
  return [(x - y) * cos, (x + y) * sin + z * 1.35];
}

function averagePointY(points) {
  return points.reduce((sum, [, y]) => sum + y, 0) / Math.max(points.length, 1);
}

function drawCanvasPolygon(context, points, fill, stroke, lineWidth) {
  context.save();
  context.beginPath();
  points.forEach(([x, y], index) => {
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.closePath();
  context.fillStyle = fill;
  context.fill();
  context.lineWidth = lineWidth;
  context.strokeStyle = stroke;
  context.stroke();
  context.restore();
}

function strokeCanvasPath(context, points, options = {}) {
  if (!points.length || Number(options.lineWidth) <= 0) return;
  const lineWidth = Math.max(0, Number(options.lineWidth) || DEFAULT_RENDER_SETTINGS.edgeThickness);
  const color = options.color || DEFAULT_RENDER_SETTINGS.edgeColor;
  const gapColor = options.gapColor || DEFAULT_RENDER_SETTINGS.backgroundColor;
  const mode = EDGE_LINE_MODES.has(options.mode) ? options.mode : DEFAULT_RENDER_SETTINGS.edgeMode;
  const offsetCount = normalizeEdgeOffsetCount(options.offsetCount);
  const offsetDistance = normalizeEdgeOffsetDistance(options.offsetDistance);
  const closed = options.closed !== false;

  function tracePath() {
    context.beginPath();
    points.forEach(([x, y], index) => {
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    if (closed) context.closePath();
  }

  context.save();
  context.lineJoin = 'round';
  context.lineCap = 'round';
  if (mode === 'offset') {
    const center = points.reduce(
      (sum, [x, y]) => {
        sum.x += x;
        sum.y += y;
        return sum;
      },
      { x: 0, y: 0 },
    );
    center.x /= points.length;
    center.y /= points.length;
    Array.from({ length: offsetCount }).forEach((_, index) => {
      const inset = offsetDistance * (index + 1);
      const insetPoints = points.map(([x, y]) => {
        const dx = center.x - x;
        const dy = center.y - y;
        const length = Math.hypot(dx, dy) || 1;
        return [x + (dx / length) * inset, y + (dy / length) * inset];
      });
      context.beginPath();
      insetPoints.forEach(([x, y], pointIndex) => {
        if (pointIndex === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      if (closed) context.closePath();
      context.lineWidth = lineWidth;
      context.strokeStyle = color;
      context.stroke();
    });
  } else if (mode === 'double') {
    tracePath();
    context.lineWidth = lineWidth * 2.6;
    context.strokeStyle = color;
    context.stroke();
    tracePath();
    context.lineWidth = lineWidth * 1.45;
    context.strokeStyle = gapColor;
    context.stroke();
    tracePath();
    context.lineWidth = Math.max(1, lineWidth * 0.65);
    context.strokeStyle = color;
    context.stroke();
  } else {
    tracePath();
    context.lineWidth = lineWidth;
    context.strokeStyle = color;
    context.stroke();
  }
  context.restore();
}

function drawGlassReflectionSheen(context, points, backgroundColor) {
  if (points.length < 3) return;
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = Math.max(maxX - minX, 1);
  const height = Math.max(maxY - minY, 1);
  const ambient = ambientGlassColor(backgroundColor);
  const sheen = context.createLinearGradient(minX, minY, maxX, maxY);
  sheen.addColorStop(0, `rgba(255, 255, 255, 0.62)`);
  sheen.addColorStop(0.2, rgbaFromRgb(ambient, 0.34));
  sheen.addColorStop(0.52, `rgba(255, 255, 255, 0.12)`);
  sheen.addColorStop(1, rgbaFromRgb(ambient, 0.24));

  context.save();
  traceCanvasPolygon(context, points);
  context.clip();
  context.globalCompositeOperation = 'screen';
  context.globalAlpha = 0.68;
  context.fillStyle = sheen;
  context.fillRect(minX, minY, width, height);

  context.globalAlpha = 0.52;
  context.strokeStyle = 'rgba(255,255,255,0.88)';
  context.lineWidth = Math.max(2, Math.min(width, height) * 0.045);
  context.beginPath();
  context.moveTo(minX + width * 0.14, minY + height * 0.2);
  context.lineTo(maxX - width * 0.16, minY + height * 0.48);
  context.stroke();

  context.globalAlpha = 0.28;
  context.strokeStyle = rgbaFromRgb(ambient, 0.9);
  context.lineWidth = Math.max(1.25, Math.min(width, height) * 0.024);
  context.beginPath();
  context.moveTo(minX + width * 0.26, maxY - height * 0.16);
  context.lineTo(maxX - width * 0.1, minY + height * 0.22);
  context.stroke();

  context.globalCompositeOperation = 'multiply';
  context.globalAlpha = 0.18;
  context.fillStyle = rgbaFromRgb(ambient, 0.85);
  context.fillRect(minX, minY, width, height);
  context.restore();
}

function traceCanvasPolygon(context, points) {
  context.beginPath();
  points.forEach(([x, y], index) => {
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.closePath();
}

function shadeColor(color, factor) {
  const hex = color.replace('#', '');
  const full = hex.length === 3 ? hex.split('').map((char) => char + char).join('') : hex;
  const number = Number.parseInt(full, 16);
  if (!Number.isFinite(number)) return color;
  const r = Math.max(0, Math.min(255, Math.round(((number >> 16) & 255) * factor)));
  const g = Math.max(0, Math.min(255, Math.round(((number >> 8) & 255) * factor)));
  const b = Math.max(0, Math.min(255, Math.round((number & 255) * factor)));
  return `rgb(${r}, ${g}, ${b})`;
}

function glassTintColor(color) {
  const piece = hexToRgb(color) || hexToRgb('#1c7c74');
  const vivid = saturateRgb(piece, 1.08);
  const rgb = {
    r: clampColor(vivid.r * 0.8 + 38),
    g: clampColor(vivid.g * 0.8 + 38),
    b: clampColor(vivid.b * 0.8 + 38),
  };
  return rgbToHex(rgb);
}

function saturateRgb(rgb, amount) {
  const luminance = 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b;
  return {
    r: clampColor(luminance + (rgb.r - luminance) * amount),
    g: clampColor(luminance + (rgb.g - luminance) * amount),
    b: clampColor(luminance + (rgb.b - luminance) * amount),
  };
}

function ambientGlassColor(backgroundColor) {
  const bg = hexToRgb(backgroundColor) || hexToRgb(DEFAULT_RENDER_SETTINGS.backgroundColor);
  return {
    r: clampColor(bg.r * 0.68 + 255 * 0.2 + 84 * 0.12),
    g: clampColor(bg.g * 0.68 + 255 * 0.18 + 220 * 0.14),
    b: clampColor(bg.b * 0.68 + 255 * 0.14 + 255 * 0.18),
  };
}

function hexToRgb(value) {
  if (typeof value !== 'string') return null;
  const hex = value.replace('#', '');
  const full = hex.length === 3 ? hex.split('').map((char) => char + char).join('') : hex;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  const number = Number.parseInt(full, 16);
  return {
    r: (number >> 16) & 255,
    g: (number >> 8) & 255,
    b: number & 255,
  };
}

function rgbToHex({ r, g, b }) {
  return `#${[r, g, b].map((value) => clampColor(value).toString(16).padStart(2, '0')).join('')}`;
}

function rgbaFromRgb({ r, g, b }, alpha) {
  return `rgba(${clampColor(r)}, ${clampColor(g)}, ${clampColor(b)}, ${alpha})`;
}

function relativeRgbLuminance({ r, g, b }) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function clampColor(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function normalizeMaterialName(material) {
  if (EXPORT_MATERIALS.has(material)) return material;
  return 'plastic';
}

function normalizeRenderSettings(settings = {}) {
  const source = settings || {};
  const edgeThickness = Number(source.edgeThickness);
  return {
    backgroundColor: normalizeHexColor(source.backgroundColor, DEFAULT_RENDER_SETTINGS.backgroundColor),
    edgeColor: normalizeHexColor(source.edgeColor, DEFAULT_RENDER_SETTINGS.edgeColor),
    edgeThickness: Number.isFinite(edgeThickness) && edgeThickness >= 0 ? edgeThickness : DEFAULT_RENDER_SETTINGS.edgeThickness,
    edgeMode: EDGE_LINE_MODES.has(source.edgeMode) ? source.edgeMode : DEFAULT_RENDER_SETTINGS.edgeMode,
    edgeOffsetCount: normalizeEdgeOffsetCount(source.edgeOffsetCount),
    edgeOffsetDistance: normalizeEdgeOffsetDistance(source.edgeOffsetDistance),
  };
}

function normalizeHexColor(value, fallback) {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function materialStrokeColor(material, color) {
  if (material === 'glass') return shadeColor(color, 0.82);
  return '#123f3a';
}

function canvasMaterialFill(context, material, color, backgroundColor = DEFAULT_RENDER_SETTINGS.backgroundColor) {
  if (material === 'glass') return glassTintColor(color);
  return color;
}

function isConstrainedExportDevice() {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator || {};
  const touchDevice = nav.maxTouchPoints > 0;
  const mobileUserAgent = /Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent || '');
  const narrowViewport = window.innerWidth <= 820 || window.innerHeight <= 820;
  return mobileUserAgent || (touchDevice && narrowViewport);
}

function cappedExportSize(baseSize, requestedScale, maxPixels) {
  const requestedSize = baseSize.map((value) => Math.round(value * requestedScale));
  const requestedPixels = requestedSize[0] * requestedSize[1];
  if (requestedPixels <= maxPixels) return requestedSize;
  const scale = Math.sqrt(maxPixels / requestedPixels);
  return requestedSize.map((value) => Math.max(1, Math.floor(value * scale)));
}

function getExportPaperSize(paperSize = DEFAULT_EXPORT_PAPER_SIZE) {
  return EXPORT_PAPER_SIZES.find((item) => item.value === paperSize) || EXPORT_PAPER_SIZES[0];
}

function exportCanvasSize(orientation = 'landscape', paperSize = DEFAULT_EXPORT_PAPER_SIZE) {
  const paper = getExportPaperSize(paperSize);
  const longSide = 3200;
  const sourceWidth = orientation === 'portrait' ? Math.min(paper.width, paper.height) : Math.max(paper.width, paper.height);
  const sourceHeight = orientation === 'portrait' ? Math.max(paper.width, paper.height) : Math.min(paper.width, paper.height);
  const scale = longSide / Math.max(sourceWidth, sourceHeight);
  return [
    Math.max(1, Math.round(sourceWidth * scale)),
    Math.max(1, Math.round(sourceHeight * scale)),
  ];
}

function exportPdfPageSize(orientation = 'landscape', paperSize = DEFAULT_EXPORT_PAPER_SIZE) {
  const paper = getExportPaperSize(paperSize);
  const width = paper.pdf?.width || 842;
  const height = paper.pdf?.height || 595;
  return orientation === 'portrait'
    ? [Math.min(width, height), Math.max(width, height)]
    : [Math.max(width, height), Math.min(width, height)];
}

function loadGlassHdrEnvironment(renderer) {
  return new Promise((resolve, reject) => {
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();
    new RGBELoader().load(
      GLASS_HDR_ENVIRONMENT_URL,
      (texture) => {
        try {
          texture.mapping = THREE.EquirectangularReflectionMapping;
          const target = pmremGenerator.fromEquirectangular(texture);
          texture.dispose();
          pmremGenerator.dispose();
          resolve(target);
        } catch (error) {
          texture.dispose();
          pmremGenerator.dispose();
          reject(error);
        }
      },
      undefined,
      (error) => {
        pmremGenerator.dispose();
        reject(error);
      },
    );
  });
}

async function renderIsometricSceneCanvas(placed, options = {}) {
  const renderSettings = normalizeRenderSettings(options.renderSettings);
  const exportMaterial = normalizeMaterialName(options.material);
  const glassSettings = normalizeGlassSettings(options.glassSettings);
  const transparentBackground = !!options.transparentBackground;
  const exportShadowsEnabled = !transparentBackground && exportMaterial !== 'paper' && !!options.shadowsEnabled;
  const constrainedExport = isConstrainedExportDevice();
  const modelTransform = normalizeModelTransform(options.modelTransform);
  const cameraView = getStageCameraView(options.view);
  const cameraSnapshot = normalizeCameraSnapshot(options.cameraSnapshot);
  const orientation = options.orientation || 'landscape';
  const baseSize = exportCanvasSize(orientation, options.paperSize);
  const requestedRenderScale = exportMaterial === 'glass'
    ? GLASS_EXPORT_RENDER_SCALE
    : constrainedExport
      ? MOBILE_EXPORT_RENDER_SCALE
      : EXPORT_RENDER_SCALE;
  const size = cappedExportSize(
    baseSize,
    requestedRenderScale,
    constrainedExport ? MOBILE_EXPORT_MAX_PIXELS : DESKTOP_EXPORT_MAX_PIXELS,
  );
  const renderer = new THREE.WebGLRenderer({ antialias: exportMaterial !== 'glass', preserveDrawingBuffer: true, alpha: transparentBackground });
  renderer.setPixelRatio(1);
  renderer.setSize(size[0], size[1], false);
  renderer.setClearColor(renderSettings.backgroundColor, transparentBackground ? 0 : 1);
  renderer.shadowMap.enabled = exportShadowsEnabled;
  if (exportShadowsEnabled) renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = exportMaterial === 'glass' ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
  renderer.toneMappingExposure = exportMaterial === 'glass' ? 0.9 : 1;
  if ('physicallyCorrectLights' in renderer) renderer.physicallyCorrectLights = exportMaterial === 'glass';

  const scene = new THREE.Scene();
  scene.background = transparentBackground ? null : new THREE.Color(renderSettings.backgroundColor);
  const group = new THREE.Group();
  const colorCastGroup = new THREE.Group();
  colorCastGroup.name = 'export-glass-color-cast';
  const stageFloor = transparentBackground ? null : createStageFloor(renderSettings.backgroundColor, exportShadowsEnabled);
  let exportHdrEnvironmentTarget = null;
  try {
    if (exportMaterial === 'glass') {
      try {
        exportHdrEnvironmentTarget = await loadGlassHdrEnvironment(renderer);
        scene.environment = exportHdrEnvironmentTarget.texture;
      } catch (error) {
        console.warn('The HDR environment was unavailable for this glass export.', error);
      }
    }
    if (exportMaterial === 'glass' && !transparentBackground) {
      try {
        updateGlassColorCast(colorCastGroup, placed, exportMaterial, modelTransform, glassSettings);
      } catch (error) {
        console.warn('Glass color cast was skipped during export', error);
        colorCastGroup.visible = false;
      }
    }
    if (stageFloor) scene.add(stageFloor);
    if (colorCastGroup.visible) scene.add(colorCastGroup);
    scene.add(group);

    const ambient = new THREE.HemisphereLight(
      STAGE_HEMISPHERE_LIGHT.sky,
      STAGE_HEMISPHERE_LIGHT.ground,
      exportMaterial === 'glass' ? 1.45 : STAGE_HEMISPHERE_LIGHT.intensity,
    );
    scene.add(ambient);
    const key = new THREE.DirectionalLight(STAGE_KEY_LIGHT.color, STAGE_KEY_LIGHT.intensity);
    key.position.set(...STAGE_KEY_LIGHT.position);
    key.castShadow = exportShadowsEnabled;
    if (exportShadowsEnabled) {
      const shadowMapSize = Math.min(
        Math.round((constrainedExport ? MOBILE_EXPORT_SHADOW_MAP_SIZE : EXPORT_SHADOW_MAP_SIZE) * EXPORT_SHADOW_QUALITY_SCALE),
        renderer.capabilities.maxTextureSize || EXPORT_SHADOW_MAP_SIZE,
      );
      key.shadow.mapSize.set(shadowMapSize, shadowMapSize);
      key.shadow.bias = -0.00006;
      key.shadow.normalBias = 0.018;
      key.shadow.radius = 2.2;
      key.shadow.intensity = exportMaterial === 'glass' ? 0.34 : 1;
      key.shadow.camera.near = 0.5;
      key.shadow.camera.far = 40;
      key.shadow.camera.left = -16;
      key.shadow.camera.right = 16;
      key.shadow.camera.top = 16;
      key.shadow.camera.bottom = -16;
    }
    scene.add(key);
    for (const piece of placed) {
      const object = await createExportPieceObject(piece, exportMaterial);
      object.userData.id = piece.id;
      object.position.set(piece.x, Number(piece.elevation) || 0, piece.y);
      object.rotation.set(Number(piece.tiltX) || 0, -piece.rotation, Number(piece.tiltZ) || 0);
      const exportBaseHeight = Math.max(0.02, Number(piece.height) || 0.18);
      object.scale.set(
        piece.mirrorHorizontal ? -1 : 1,
        exportMaterial === 'glass' ? glassOpticalThickness(piece, glassSettings) / exportBaseHeight : 1,
        piece.mirrorVertical ? -1 : 1,
      );
      applyExportPieceMaterial(object, piece, exportMaterial, renderSettings, exportShadowsEnabled, glassSettings);
      const edgeOverlay = exportMaterial === 'glass' ? null : createExportEdgeOverlay(piece, renderSettings, false);
      if (edgeOverlay) object.add(edgeOverlay);
      const surfaceStickerOverlay = updatePieceSurfaceStickerOverlay(object, piece);
      if (surfaceStickerOverlay?.material?.map?.userData?.readyPromise) {
        await surfaceStickerOverlay.material.map.userData.readyPromise;
      }
      group.add(object);
    }
    applyModelTransform(group, modelTransform);

    const bounds = new THREE.Box3().setFromObject(group);
    if (bounds.isEmpty()) throw new Error('The model has no visible geometry to export.');
    const sizeVector = bounds.getSize(new THREE.Vector3());
    const radius = Math.max(sizeVector.x, sizeVector.y * 2.3, sizeVector.z, 1);
    const aspect = size[0] / size[1];
    const useStageCameraSnapshot = options.view !== 'top' && cameraSnapshot;
    const camera = new THREE.PerspectiveCamera(useStageCameraSnapshot ? cameraSnapshot.fov : 42, aspect, 0.01, 1000);
    if (useStageCameraSnapshot) {
      camera.up.fromArray(cameraSnapshot.up);
      camera.position.fromArray(cameraSnapshot.position);
      camera.lookAt(new THREE.Vector3().fromArray(cameraSnapshot.target));
    } else {
      frameExportCameraToBounds(camera, bounds, cameraView, {
        padding: exportMaterial === 'glass' ? 1.32 : 1.18,
        minDistance: Math.max(radius, 6),
        zoom: options.zoom,
        pan: options.pan,
      });
    }
    camera.updateProjectionMatrix();

    renderer.render(scene, camera);
    const canvas = document.createElement('canvas');
    canvas.width = size[0];
    canvas.height = size[1];
    const context = canvas.getContext('2d');
    if (!context) throw new Error('The browser could not create the export canvas.');
    context.drawImage(renderer.domElement, 0, 0);
    if (!transparentBackground) {
      context.fillStyle = '#4f4538';
      context.font = '24px Inter, Arial, sans-serif';
      context.fillText(`Girih ${cameraView.label} ${exportMaterial} export`, 32, canvas.height - 34);
    }
    return canvas;
  } finally {
    disposeObject(group);
    disposeObject(colorCastGroup);
    if (stageFloor) disposeObject(stageFloor);
    exportHdrEnvironmentTarget?.dispose();
    renderer.dispose();
    try {
      renderer.forceContextLoss();
    } catch (error) {
      console.warn('Could not explicitly release the export WebGL context', error);
    }
  }
}

function frameExportCameraToBounds(camera, bounds, cameraView, options = {}) {
  const center = bounds.getCenter(new THREE.Vector3());
  const corners = boxCorners(bounds);
  const fallbackDirection = new THREE.Vector3(7.2, 6.4, 7.2);
  const direction = new THREE.Vector3(...(cameraView?.position || fallbackDirection.toArray()));
  if (direction.lengthSq() < 0.000001) direction.copy(fallbackDirection);
  direction.normalize();
  const up = new THREE.Vector3(...(cameraView?.up || [0, 1, 0]));
  if (Math.abs(up.dot(direction)) > 0.98) up.set(0, 0, -1);
  const forward = direction.clone().multiplyScalar(-1);
  const right = new THREE.Vector3().crossVectors(forward, up).normalize();
  const trueUp = new THREE.Vector3().crossVectors(right, forward).normalize();
  const projections = corners.map((corner) => {
    const relative = corner.clone().sub(center);
    return {
      x: relative.dot(right),
      y: relative.dot(trueUp),
      z: relative.dot(forward),
    };
  });
  const viewWidth = Math.max(...projections.map((point) => point.x)) - Math.min(...projections.map((point) => point.x));
  const viewHeight = Math.max(...projections.map((point) => point.y)) - Math.min(...projections.map((point) => point.y));
  const viewDepth = Math.max(...projections.map((point) => point.z)) - Math.min(...projections.map((point) => point.z));
  const padding = Number(options.padding) || 1.18;
  const fov = THREE.MathUtils.degToRad(camera.fov);
  const fitHeightDistance = (viewHeight * padding) / (2 * Math.tan(fov / 2));
  const fitWidthDistance = (viewWidth * padding) / (2 * Math.tan(fov / 2) * camera.aspect);
  const zoom = clamp(Number(options.zoom) || 1, 0.5, 3);
  const distance = Math.max(fitHeightDistance, fitWidthDistance, viewDepth + 1, Number(options.minDistance) || 6) / zoom;
  const panX = clamp(Number(options.pan?.x) || 0, -0.75, 0.75);
  const panY = clamp(Number(options.pan?.y) || 0, -0.75, 0.75);
  const visibleHeight = 2 * distance * Math.tan(fov / 2);
  const visibleWidth = visibleHeight * camera.aspect;
  const panOffset = right
    .clone()
    .multiplyScalar(-panX * visibleWidth)
    .add(trueUp.clone().multiplyScalar(panY * visibleHeight));
  const target = center.clone().add(panOffset);
  camera.up.copy(trueUp);
  camera.position.copy(target).add(direction.multiplyScalar(distance));
  camera.near = Math.max(0.01, distance - viewDepth * 3 - 20);
  camera.far = distance + viewDepth * 3 + 80;
  camera.lookAt(target);
}

function boxCorners(bounds) {
  return [
    [bounds.min.x, bounds.min.y, bounds.min.z],
    [bounds.min.x, bounds.min.y, bounds.max.z],
    [bounds.min.x, bounds.max.y, bounds.min.z],
    [bounds.min.x, bounds.max.y, bounds.max.z],
    [bounds.max.x, bounds.min.y, bounds.min.z],
    [bounds.max.x, bounds.min.y, bounds.max.z],
    [bounds.max.x, bounds.max.y, bounds.min.z],
    [bounds.max.x, bounds.max.y, bounds.max.z],
  ].map(([x, y, z]) => new THREE.Vector3(x, y, z));
}

function createGlassRenderFloor(center, radius, backgroundColor) {
  const width = radius * 5.8;
  const depth = radius * 3.15;
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshPhysicalMaterial({
      color: '#ffffff',
      roughness: 0.2,
      metalness: 0,
      clearcoat: 0.62,
      clearcoatRoughness: 0.16,
      reflectivity: 0.36,
      envMapIntensity: 0.35,
      side: THREE.DoubleSide,
    }),
  );
  floor.name = 'glass-render-reflection-floor';
  floor.rotation.x = -Math.PI / 2;
  floor.position.x = center.x;
  floor.position.z = center.z + radius * 1.05;
  floor.receiveShadow = true;
  floor.userData.floorInfo = {
    centerX: floor.position.x,
    centerZ: floor.position.z,
    width,
    depth,
  };
  return floor;
}

function drawGlassFloorCaustics(context, placed, group, camera, size, styleName, floorY = 0, floorInfo = null) {
  camera.updateMatrixWorld(true);
  group.updateMatrixWorld(true);
  const project = (x, y, z) => {
    const projected = new THREE.Vector3(x, y, z).project(camera);
    return [(projected.x * 0.5 + 0.5) * size[0], (-projected.y * 0.5 + 0.5) * size[1]];
  };
  const patternBounds = glassPatternBounds(placed);
  if (!patternBounds || !floorInfo) return;
  const patternWidth = Math.max(patternBounds.maxX - patternBounds.minX, 0.001);
  const patternDepth = Math.max(patternBounds.maxY - patternBounds.minY, 0.001);
  const floorScale = Math.min((floorInfo.width * 0.62) / patternWidth, (floorInfo.depth * 0.58) / patternDepth);
  const floorCenterX = floorInfo.centerX + floorInfo.width * 0.08;
  const floorCenterZ = floorInfo.centerZ + floorInfo.depth * 0.04;
  const toFloorPoint = ([x, y]) => [
    floorCenterX + (x - (patternBounds.minX + patternWidth / 2)) * floorScale,
    floorCenterZ + (y - (patternBounds.minY + patternDepth / 2)) * floorScale,
  ];
  context.save();
  const floorPath = glassFloorCanvasPolygon(floorInfo, floorY + 0.004, project);
  traceCanvasPolygon(context, floorPath);
  context.clip();
  context.globalCompositeOperation = 'source-over';
  placed.forEach((piece) => {
    const footprint = worldFootprintPoints(piece);
    if (footprint.length < 3) return;
    const tint = hexToRgb(glassTintColor(piece.color || '#1c7c74')) || hexToRgb('#1c7c74');
    const caustic = footprint.map((point) => {
      const [floorX, floorZ] = toFloorPoint(point);
      const offset = glassCastOffset(Math.max(0.02, Number(piece.height) || 0.18));
      return project(floorX + offset.x, floorY + 0.006, floorZ + offset.y);
    });

    context.save();
    context.filter = 'blur(2px) saturate(2.2)';
    context.globalAlpha = 0.22;
    context.fillStyle = rgbaFromRgb(tint, 0.68);
    traceCanvasPolygon(context, scaleCanvasPolygon(caustic, 1.08));
    context.fill();
    context.restore();

    context.save();
    context.filter = 'saturate(2.65)';
    context.globalAlpha = 0.76;
    context.fillStyle = rgbaFromRgb(tint, 0.82);
    traceCanvasPolygon(context, caustic);
    context.fill();
    context.restore();
  });
  context.restore();
}

function glassPatternBounds(placed) {
  const points = placed.flatMap((piece) => worldFootprintPoints(piece));
  if (!points.length) return null;
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

function glassFloorCanvasPolygon(floorInfo, y, project) {
  const halfWidth = floorInfo.width / 2;
  const halfDepth = floorInfo.depth / 2;
  return [
    project(floorInfo.centerX - halfWidth, y, floorInfo.centerZ - halfDepth),
    project(floorInfo.centerX + halfWidth, y, floorInfo.centerZ - halfDepth),
    project(floorInfo.centerX + halfWidth, y, floorInfo.centerZ + halfDepth),
    project(floorInfo.centerX - halfWidth, y, floorInfo.centerZ + halfDepth),
  ];
}

function scaleCanvasPolygon(points, scale) {
  if (!points.length) return points;
  const center = points.reduce(
    ([sumX, sumY], [x, y]) => [sumX + x, sumY + y],
    [0, 0],
  ).map((value) => value / points.length);
  return points.map(([x, y]) => [
    center[0] + (x - center[0]) * scale,
    center[1] + (y - center[1]) * scale,
  ]);
}

function drawIsometricEdgeOverlay(context, placed, camera, size, renderSettings, styleName, materialName = 'plastic', yOffset = 0) {
  const isGlass = normalizeMaterialName(materialName) === 'glass';
  camera.updateMatrixWorld(true);
  const project = (x, y, z) => {
    const projected = new THREE.Vector3(x, y, z).project(camera);
    return [(projected.x * 0.5 + 0.5) * size[0], (-projected.y * 0.5 + 0.5) * size[1]];
  };
  placed.forEach((piece) => {
    const topSegments = worldRenderSegments(piece);
    if (!topSegments.length) return;
    const sideSegments = isGlass ? topSegments : visibleCameraFacingSegments(piece, topSegments, camera);
    const height = Math.max(0.02, Number(piece.height) || 0.18) * (styleName === 'pattern' ? 0.35 : 1);
    topSegments.forEach(([start, end]) => {
      strokeCanvasPath(context, [project(start.x, height + yOffset, start.y), project(end.x, height + yOffset, end.y)], {
        color: renderSettings.edgeColor,
        lineWidth: renderSettings.edgeThickness,
        mode: renderSettings.edgeMode,
        offsetCount: renderSettings.edgeOffsetCount,
        offsetDistance: renderSettings.edgeOffsetDistance,
        gapColor: renderSettings.backgroundColor,
        closed: false,
      });
    });
    sideSegments.forEach(([start, end]) => {
      strokeCanvasPath(context, [project(start.x, yOffset, start.y), project(end.x, yOffset, end.y)], {
        color: renderSettings.edgeColor,
        lineWidth: renderSettings.edgeThickness,
        mode: renderSettings.edgeMode,
        offsetCount: renderSettings.edgeOffsetCount,
        offsetDistance: renderSettings.edgeOffsetDistance,
        gapColor: renderSettings.backgroundColor,
        closed: false,
      });
    });
    const footprint = worldFootprintPoints(piece);
    if (footprint.length >= 3) {
      const top = footprint.map(([x, y]) => project(x, height + yOffset, y));
      strokeCanvasPath(context, top, {
        color: renderSettings.edgeColor,
        lineWidth: renderSettings.edgeThickness,
        mode: renderSettings.edgeMode,
        offsetCount: renderSettings.edgeOffsetCount,
        offsetDistance: renderSettings.edgeOffsetDistance,
        gapColor: renderSettings.backgroundColor,
        closed: true,
      });
    }
    uniqueSegmentPoints(sideSegments).forEach((point) => {
      strokeCanvasPath(context, [project(point.x, yOffset, point.y), project(point.x, height + yOffset, point.y)], {
        color: renderSettings.edgeColor,
        lineWidth: renderSettings.edgeThickness,
        mode: renderSettings.edgeMode,
        offsetCount: renderSettings.edgeOffsetCount,
        offsetDistance: renderSettings.edgeOffsetDistance,
        gapColor: renderSettings.backgroundColor,
        closed: false,
      });
    });
  });
}

function visibleCameraFacingSegments(piece, segments, camera) {
  const footprint = worldFootprintPoints(piece);
  const centroid = footprint.length
    ? footprint.reduce((sum, [x, y]) => sum.add(new THREE.Vector2(x, y)), new THREE.Vector2()).multiplyScalar(1 / footprint.length)
    : segments.reduce((sum, [start, end]) => sum.add(start).add(end), new THREE.Vector2()).multiplyScalar(1 / Math.max(segments.length * 2, 1));
  return segments.filter(([start, end]) => {
    const mid = start.clone().add(end).multiplyScalar(0.5);
    const edge = end.clone().sub(start);
    if (edge.lengthSq() <= 0.000001) return false;
    const normalA = new THREE.Vector2(-edge.y, edge.x).normalize();
    const normalB = normalA.clone().multiplyScalar(-1);
    const awayFromCenter = mid.clone().sub(centroid);
    const outward = normalA.dot(awayFromCenter) >= normalB.dot(awayFromCenter) ? normalA : normalB;
    const cameraDirection = new THREE.Vector2(camera.position.x - mid.x, camera.position.z - mid.y).normalize();
    return outward.dot(cameraDirection) > -0.05;
  });
}

function worldRenderSegments(piece) {
  const localSegments = getExportFootprintSegments(piece);
  const rotation = Number(piece.rotation) || 0;
  return localSegments.map(([localStart, localEnd]) => {
    const mirroredStart = mirrorLocalPointForPiece(piece, localStart);
    const mirroredEnd = mirrorLocalPointForPiece(piece, localEnd);
    const [startX, startY] = rotatePoint(mirroredStart[0], mirroredStart[1], rotation);
    const [endX, endY] = rotatePoint(mirroredEnd[0], mirroredEnd[1], rotation);
    return [
      new THREE.Vector2(startX + (piece.x || 0), startY + (piece.y || 0)),
      new THREE.Vector2(endX + (piece.x || 0), endY + (piece.y || 0)),
    ];
  });
}

function getExportFootprintSegments(piece) {
  if (!piece.isFrameSlice && piece.displayEdges?.length) return scaleImportedSegments(piece, piece.displayEdges).filter(([start, end]) => start && end);
  return getRealFootprintSegments(piece);
}

function uniqueSegmentPoints(segments) {
  const points = new Map();
  segments.flat().forEach((point) => {
    const key = `${point.x.toFixed(4)},${point.y.toFixed(4)}`;
    if (!points.has(key)) points.set(key, point);
  });
  return [...points.values()];
}

function createExportEdgeOverlay(piece, renderSettings, showThrough = false) {
  if (renderSettings.edgeMode === 'offset' && piece.offsetLinesEnabled === false) return null;
  const segments = getExportFootprintSegments(piece).filter(([start, end]) => start && end);
  if (!segments.length) return null;
  const thickness = stageEdgeWorldThickness(renderSettings.edgeThickness);
  if (thickness <= 0) return null;
  const edgeSegments = edgeOverlaySegments(segments, thickness, renderSettings, {
    joinedSegmentOffsets: !!piece.isFrameSlice,
    boundaryPoints: piece.isFrameSlice ? getLocalCollisionPoints(piece) : undefined,
  });
  const topOnly = !!piece.isFrameSlice;
  const verticalPoints = topOnly || renderSettings.edgeMode === 'offset' ? [] : uniqueSegmentCoordinatePoints(segments);
  const instanceCount = edgeSegments.length * (topOnly ? 1 : 2) + verticalPoints.length;
  if (!instanceCount) return null;
  const material = new THREE.MeshBasicMaterial({
    color: renderSettings.edgeColor,
    depthTest: !showThrough,
    depthWrite: false,
    transparent: showThrough,
    opacity: showThrough ? 0.86 : 1,
    toneMapped: false,
  });
  const overlay = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, instanceCount);
  overlay.name = 'export-visible-edge-overlay';
  overlay.renderOrder = 8;
  const height = Math.max(0.02, Number(piece.height) || 0.18);
  const topY = height + thickness * 0.55;
  const bottomY = thickness * 0.55;
  const interiorPoint = segmentInteriorPoint(segments);
  let matrixIndex = 0;
  edgeSegments.forEach(([start, end]) => {
    setStageEdgeBarMatrix(overlay, matrixIndex, start, end, topY, thickness, 0, interiorPoint);
    matrixIndex += 1;
    if (!topOnly) {
      setStageEdgeBarMatrix(overlay, matrixIndex, start, end, bottomY, thickness, 0, interiorPoint);
      matrixIndex += 1;
    }
  });
  verticalPoints.forEach(([x, y]) => {
    const matrix = new THREE.Matrix4();
    matrix.compose(
      new THREE.Vector3(x, height / 2, y),
      new THREE.Quaternion(),
      new THREE.Vector3(thickness, height, thickness),
    );
    overlay.setMatrixAt(matrixIndex, matrix);
    matrixIndex += 1;
  });
  overlay.instanceMatrix.needsUpdate = true;
  return overlay;
}

async function createExportPieceObject(piece, materialName = 'plastic') {
  // Export from the normalized footprint. Raw imported GLB meshes can contain
  // source-specific axes and normals that render as inverted triangular faces.
  return createExportFootprintObject(piece, materialName);
}

function createExportFootprintObject(piece, materialName = 'plastic') {
  const points = getLocalCollisionPoints(piece);
  const shapePoints = points.length >= 3 ? points : piece.points || emptyDraft().points.split(' ').map((pair) => pair.split(',').map(Number));
  const shape = new THREE.Shape();
  shapePoints.forEach(([x, y], index) => {
    if (index === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  });
  shape.closePath();
  const height = Math.max(0.02, Number(piece.height) || 0.18);
  // Live Plastic pieces use crisp source geometry. Keep export Plastic equally
  // sharp; the architectural bevel remains exclusive to Glass.
  const bevelEnabled = normalizeMaterialName(materialName) !== 'plastic' && !piece.isFrameSlice;
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled,
    bevelThickness: bevelEnabled ? Math.min(0.018, height * 0.18) : 0,
    bevelSize: bevelEnabled ? 0.018 : 0,
    bevelSegments: bevelEnabled ? 3 : 0,
  });
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, height, 0);
  const mesh = new THREE.Mesh(geometry, createExportMaterial(piece, 'plastic'));
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

function applyExportPieceMaterial(object, piece, materialName, renderSettings = DEFAULT_RENDER_SETTINGS, shadowsEnabled = true, glassSettings = DEFAULT_GLASS_SETTINGS) {
  const normalizedMaterialName = normalizeMaterialName(materialName);
  const material = createExportMaterial(piece, normalizedMaterialName, renderSettings, glassSettings);
  object.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = !!shadowsEnabled && normalizedMaterialName !== 'paper' && normalizedMaterialName !== 'glass';
    child.receiveShadow = !!shadowsEnabled && normalizedMaterialName !== 'paper' && normalizedMaterialName !== 'glass';
    child.material?.dispose?.();
    child.material = material.clone();
  });
  material.dispose();
}

function createExportMaterial(piece, materialName = 'plastic', renderSettings = DEFAULT_RENDER_SETTINGS, glassSettings = DEFAULT_GLASS_SETTINGS) {
  const material = normalizeMaterialName(materialName);
  const color = piece.color || '#1c7c74';
  if (material === 'paper') {
    return new THREE.MeshBasicMaterial({
      color: PAPER_BACKGROUND_COLOR,
      depthWrite: true,
      depthTest: true,
      side: THREE.FrontSide,
      toneMapped: false,
    });
  }
  if (material === 'glass') {
    return createArchitecturalGlassMaterial(piece, false, glassSettings);
  }

  return new THREE.MeshStandardMaterial({
    color,
    metalness: 0.08,
    roughness: 0.42,
    envMapIntensity: 1,
    transparent: false,
    opacity: 1,
    depthWrite: true,
    depthTest: true,
    side: THREE.FrontSide,
  });
}

function createMaterialTexture(color, materialName) {
  const canvas = createMaterialPatternCanvas(color, materialName, 512);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(materialName === 'tile' ? 3.2 : materialName === 'wood' ? 1.4 : 1.8, materialName === 'tile' ? 3.2 : materialName === 'wood' ? 2.6 : 1.8);
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

function createMaterialPatternCanvas(color, materialName, size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  context.fillStyle = materialName === 'marble' ? '#f8f4ed' : materialName === 'wood' ? woodBaseColor(color) : color;
  context.fillRect(0, 0, canvas.width, canvas.height);

  if (materialName === 'marble') {
    const veinCount = Math.round(size / 11);
    for (let index = 0; index < veinCount; index += 1) {
      context.strokeStyle = `rgba(${index % 2 ? '96, 110, 112' : '205, 190, 170'}, ${0.16 + (index % 4) * 0.035})`;
      context.lineWidth = 1 + (index % 3);
      context.beginPath();
      const startY = index * (size / veinCount) - size * 0.12;
      context.moveTo(-size * 0.08, startY);
      for (let x = -size * 0.08; x <= size * 1.1; x += size / 10) {
        context.lineTo(x, startY + Math.sin((x + index * 21) * 0.035) * (size * 0.085) + x * 0.18);
      }
      context.stroke();
    }
  }

  if (materialName === 'tile') {
    const gradient = context.createLinearGradient(0, 0, size, size);
    gradient.addColorStop(0, 'rgba(255,255,255,0.5)');
    gradient.addColorStop(0.5, 'rgba(255,255,255,0.08)');
    gradient.addColorStop(1, 'rgba(0,0,0,0.12)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
    const tileSize = size / 4;
    context.strokeStyle = 'rgba(32, 28, 24, 0.42)';
    context.lineWidth = Math.max(3, size / 64);
    for (let value = 0; value <= size; value += tileSize) {
      context.beginPath();
      context.moveTo(value, 0);
      context.lineTo(value, size);
      context.moveTo(0, value);
      context.lineTo(size, value);
      context.stroke();
    }
    context.strokeStyle = 'rgba(255,255,255,0.6)';
    context.lineWidth = Math.max(1, size / 180);
    for (let value = tileSize; value < size; value += tileSize) {
      context.strokeRect(value + 3, 3, tileSize - 6, tileSize - 6);
    }
  }

  if (materialName === 'wood') {
    const baseGradient = context.createLinearGradient(0, 0, size, 0);
    baseGradient.addColorStop(0, shadeColor(woodBaseColor(color), 0.72));
    baseGradient.addColorStop(0.5, woodBaseColor(color));
    baseGradient.addColorStop(1, shadeColor(woodBaseColor(color), 1.12));
    context.fillStyle = baseGradient;
    context.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += size / 38) {
      context.strokeStyle = y % (size / 8) < 2 ? 'rgba(62, 31, 13, 0.48)' : 'rgba(255, 218, 150, 0.22)';
      context.lineWidth = y % (size / 8) < 2 ? 3 : 1;
      context.beginPath();
      context.moveTo(0, y);
      for (let x = 0; x <= size; x += size / 18) {
        context.lineTo(x, y + Math.sin((x + y) * 0.045) * (size / 42) + Math.sin(x * 0.018) * (size / 70));
      }
      context.stroke();
    }
    for (let index = 0; index < 5; index += 1) {
      const x = size * (0.18 + index * 0.17);
      const y = size * (0.2 + ((index * 37) % 55) / 100);
      context.strokeStyle = 'rgba(74, 35, 13, 0.32)';
      context.lineWidth = 2;
      context.beginPath();
      context.ellipse(x, y, size * 0.055, size * 0.022, index * 0.4, 0, Math.PI * 2);
      context.stroke();
    }
  }

  return canvas;
}

function woodBaseColor(color) {
  const hex = color.replace('#', '');
  const full = hex.length === 3 ? hex.split('').map((char) => char + char).join('') : hex;
  const number = Number.parseInt(full, 16);
  if (!Number.isFinite(number)) return '#9a6336';
  const r = (number >> 16) & 255;
  const g = (number >> 8) & 255;
  const b = number & 255;
  return `rgb(${Math.round(r * 0.28 + 145 * 0.72)}, ${Math.round(g * 0.2 + 91 * 0.8)}, ${Math.round(b * 0.16 + 42 * 0.84)})`;
}

function downloadCanvasPng(filename, canvas) {
  canvas.toBlob((blob) => {
    if (!blob) {
      downloadCanvasDataUrl(filename, canvas);
      return;
    }
    downloadBlob(filename, blob);
  }, 'image/png');
}

function downloadCanvasDataUrl(filename, canvas) {
  try {
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } catch (error) {
    console.error('Failed to export PNG', error);
  }
}

function downloadPdfFromCanvas(filename, canvas, orientation = 'landscape', paperSize = DEFAULT_EXPORT_PAPER_SIZE) {
  const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
  const imageBytes = base64ToBytes(dataUrl.split(',')[1]);
  const [pageWidth, pageHeight] = exportPdfPageSize(orientation, paperSize);
  const margin = 28;
  const drawScale = Math.min((pageWidth - margin * 2) / canvas.width, (pageHeight - margin * 2) / canvas.height);
  const drawWidth = canvas.width * drawScale;
  const drawHeight = canvas.height * drawScale;
  const drawX = (pageWidth - drawWidth) / 2;
  const drawY = (pageHeight - drawHeight) / 2;
  const contents = `q\n${drawWidth.toFixed(2)} 0 0 ${drawHeight.toFixed(2)} ${drawX.toFixed(2)} ${drawY.toFixed(2)} cm\n/Im0 Do\nQ\n`;
  const pdf = buildPdfWithJpeg(imageBytes, canvas.width, canvas.height, pageWidth, pageHeight, contents);
  downloadBlob(filename, new Blob([pdf], { type: 'application/pdf' }));
}

function openPrintWindow() {
  const frame = window.open('about:blank', '_blank');
  if (!frame) {
    window.alert('The print window was blocked. Allow pop-ups for this site and try again.');
    return null;
  }
  try {
    frame.opener = null;
  } catch {
    // Some browsers expose a read-only opener reference.
  }
  return frame;
}

function printCanvas(canvas, orientation = 'landscape', title = 'Girih model', paperSize = DEFAULT_EXPORT_PAPER_SIZE, targetWindow = null) {
  const imageUrl = canvas.toDataURL('image/png');
  const frame = targetWindow || openPrintWindow();
  if (!frame) return;
  const paper = getExportPaperSize(paperSize);
  const cssPaperName = { a4: 'A4', a3: 'A3', letter: 'letter' }[paper.value];
  const pageSize = cssPaperName ? `${cssPaperName} ${orientation}` : orientation;
  frame.document.write(`<!doctype html>
<html>
  <head>
    <title>${escapeHtml(title)}</title>
    <style>
      @page { size: ${pageSize}; margin: 10mm; }
      body { margin: 0; background: #f6efe3; }
      img { display: block; width: 100%; height: auto; page-break-inside: avoid; }
      .sheet { min-height: 100vh; display: grid; place-items: center; }
      .print-action { position: fixed; top: 12px; right: 12px; padding: 9px 14px; border: 0; border-radius: 6px; background: #2f514c; color: white; font: 700 13px Arial, sans-serif; cursor: pointer; }
      @media print { .print-action { display: none; } }
    </style>
  </head>
  <body>
    <button class="print-action" type="button" onclick="window.print()">Print</button>
    <div class="sheet"><img src="${imageUrl}" alt="${escapeHtml(title)}" /></div>
    <script>
      const image = document.querySelector('img');
      const openDialog = () => window.setTimeout(() => {
        window.focus();
        window.print();
      }, 80);
      if (image.complete) openDialog();
      else image.addEventListener('load', openDialog, { once: true });
    </script>
  </body>
</html>`);
  frame.document.close();
}

function buildPdfWithJpeg(imageBytes, imageWidth, imageHeight, pageWidth, pageHeight, contents) {
  const chunks = [];
  const offsets = [];
  let length = 0;
  const push = (chunk) => {
    const bytes = typeof chunk === 'string' ? asciiBytes(chunk) : chunk;
    chunks.push(bytes);
    length += bytes.length;
  };
  const object = (id, body) => {
    offsets[id] = length;
    push(`${id} 0 obj\n`);
    push(body);
    push('\nendobj\n');
  };

  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  object(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  offsets[4] = length;
  push(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${imageWidth} /Height ${imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageBytes.length} >>\nstream\n`);
  push(imageBytes);
  push('\nendstream\nendobj\n');
  object(5, `<< /Length ${asciiBytes(contents).length} >>\nstream\n${contents}endstream`);
  const xrefOffset = length;
  push(`xref\n0 6\n0000000000 65535 f \n`);
  for (let index = 1; index <= 5; index += 1) push(`${String(offsets[index]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

  const output = new Uint8Array(length);
  let offset = 0;
  chunks.forEach((chunk) => {
    output.set(chunk, offset);
    offset += chunk.length;
  });
  return output;
}

function asciiBytes(value) {
  return Uint8Array.from(value, (char) => char.charCodeAt(0));
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: 'text/plain' });
  downloadBlob(filename, blob);
}

function nextAnimationFrame() {
  return new Promise((resolve) => window.requestAnimationFrame(resolve));
}

function drawVideoCanvasFrame(context, sourceCanvas, backgroundColor) {
  const targetWidth = context.canvas.width;
  const targetHeight = context.canvas.height;
  context.fillStyle = normalizeHexColor(backgroundColor, DEFAULT_RENDER_SETTINGS.backgroundColor);
  context.fillRect(0, 0, targetWidth, targetHeight);
  const scale = Math.min(targetWidth / sourceCanvas.width, targetHeight / sourceCanvas.height);
  const width = sourceCanvas.width * scale;
  const height = sourceCanvas.height * scale;
  context.drawImage(sourceCanvas, (targetWidth - width) / 2, (targetHeight - height) / 2, width, height);
}

function exportTopPolygons(placed, options = {}) {
  const transformMatrix = modelTransformMatrix(options.modelTransform);
  return placed
    .map((piece) => {
      const localPoints = cleanClosedPoints(getLocalCollisionPoints(piece));
      const points = localPoints.map((point) => transformExportFootprintPoint(point, piece, transformMatrix));
      if (points.length < 3 || Math.abs(polygonArea2(points)) < 0.000001) return null;
      return {
        id: piece.id,
        name: piece.name || 'Girih piece',
        color: piece.color || '#1c7c74',
        surfaceSticker: piece.surfaceSticker,
        surfaceStickerUvs: hasSurfaceStickerContent(piece.surfaceSticker)
          ? localPoints.map(([x, y]) => surfaceStickerUvAtLocalPoint(piece, x, y))
          : undefined,
        height: Math.max(0.02, Number(piece.height) || 0.18),
        points,
      };
    })
    .filter(Boolean);
}

function cleanClosedPoints(points = []) {
  if (points.length < 2) return points;
  const first = points[0];
  const last = points[points.length - 1];
  if (Math.hypot(first[0] - last[0], first[1] - last[1]) < 0.000001) return points.slice(0, -1);
  return points;
}

function transformExportFootprintPoint(point, piece, transformMatrix) {
  const [x, y] = mirrorLocalPointForPiece(piece, point);
  const [rx, ry] = rotatePoint(x, y, Number(piece.rotation) || 0);
  const transformed = new THREE.Vector3(rx + (piece.x || 0), 0, ry + (piece.y || 0)).applyMatrix4(transformMatrix);
  return [transformed.x, transformed.z];
}

function exportPolygonBounds(polygons) {
  const points = polygons.flatMap((polygon) => polygon.points);
  if (!points.length) return { minX: -1, maxX: 1, minY: -1, maxY: 1 };
  return points.reduce(
    (bounds, [x, y]) => ({
      minX: Math.min(bounds.minX, x),
      maxX: Math.max(bounds.maxX, x),
      minY: Math.min(bounds.minY, y),
      maxY: Math.max(bounds.maxY, y),
    }),
    { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity },
  );
}

function exportPaperTopSegments(placed, options = {}) {
  const transformMatrix = modelTransformMatrix(options.modelTransform);
  const segmentsByKey = new Map();
  placed.flatMap((piece) => transformedPaperSegments(piece, transformMatrix)).forEach((segment) => {
    const [start, end] = segment;
    if (!start || !end || Math.hypot(start[0] - end[0], start[1] - end[1]) < 0.000001) return;
    const key = machineSegmentKey(segment);
    if (!segmentsByKey.has(key)) segmentsByKey.set(key, segment);
  });
  return [...segmentsByKey.values()];
}

function exportTopSegmentsFromPolygons(polygons) {
  const segmentsByKey = new Map();
  polygons.forEach((polygon) => {
    polygon.points.forEach((point, index) => {
      const next = polygon.points[(index + 1) % polygon.points.length];
      if (!next || Math.hypot(point[0] - next[0], point[1] - next[1]) < 0.000001) return;
      const segment = [point, next];
      const key = machineSegmentKey(segment);
      if (!segmentsByKey.has(key)) segmentsByKey.set(key, segment);
    });
  });
  return [...segmentsByKey.values()];
}

function exportSegmentBounds(segments) {
  const points = segments.flat();
  if (!points.length) return { minX: -1, maxX: 1, minY: -1, maxY: 1 };
  return points.reduce(
    (bounds, [x, y]) => ({
      minX: Math.min(bounds.minX, x),
      maxX: Math.max(bounds.maxX, x),
      minY: Math.min(bounds.minY, y),
      maxY: Math.max(bounds.maxY, y),
    }),
    { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity },
  );
}

function machineSegmentKey([start, end]) {
  const a = `${Number(start[0]).toFixed(4)},${Number(start[1]).toFixed(4)}`;
  const b = `${Number(end[0]).toFixed(4)},${Number(end[1]).toFixed(4)}`;
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function renderTransparentTopCanvas(placed, options = {}) {
  const renderSettings = normalizeRenderSettings(options.renderSettings);
  const transformMatrix = modelTransformMatrix(options.modelTransform);
  const segments = renderSettings.edgeThickness > 0
    ? placed.flatMap((piece) => transformedStageEdgeSegments(piece, transformMatrix, renderSettings))
    : [];
  const canvas = document.createElement('canvas');
  const size = exportCanvasSize(options.orientation || 'landscape', options.paperSize);
  canvas.width = size[0];
  canvas.height = size[1];
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (!segments.length) return canvas;

  const bounds = exportSegmentBounds(segments);
  const margin = 96;
  const width = Math.max(bounds.maxX - bounds.minX, 0.001);
  const height = Math.max(bounds.maxY - bounds.minY, 0.001);
  const scale = Math.min((canvas.width - margin * 2) / width, (canvas.height - margin * 2) / height);
  const drawWidth = width * scale;
  const drawHeight = height * scale;
  const offsetX = (canvas.width - drawWidth) / 2;
  const offsetY = (canvas.height - drawHeight) / 2;
  const toCanvas = ([x, y]) => [
    offsetX + (x - bounds.minX) * scale,
    offsetY + (y - bounds.minY) * scale,
  ];

  context.lineJoin = 'round';
  context.lineCap = 'round';
  const edgeLineWidth = Math.max(0.5, stageEdgeWorldThickness(renderSettings.edgeThickness) * scale);
  const edgeColor = normalizeHexColor(renderSettings.edgeColor, DEFAULT_RENDER_SETTINGS.edgeColor);
  const edgeRgb = hexToRgb(edgeColor);
  const needsLightBacking = edgeRgb && relativeRgbLuminance(edgeRgb) < 88;
  if (needsLightBacking) {
    context.strokeStyle = 'rgba(255, 255, 255, 0.92)';
    context.lineWidth = edgeLineWidth + 2.5;
    segments.forEach(([start, end]) => {
      const [startX, startY] = toCanvas(start);
      const [endX, endY] = toCanvas(end);
      context.beginPath();
      context.moveTo(startX, startY);
      context.lineTo(endX, endY);
      context.stroke();
    });
  }
  context.strokeStyle = edgeColor;
  context.lineWidth = edgeLineWidth;
  segments.forEach(([start, end]) => {
    const [startX, startY] = toCanvas(start);
    const [endX, endY] = toCanvas(end);
    context.beginPath();
    context.moveTo(startX, startY);
    context.lineTo(endX, endY);
    context.stroke();
  });
  return canvas;
}

function renderGraphic2DCanvas(placed, options = {}) {
  const polygons = exportTopPolygons(placed, options);
  const size = exportCanvasSize(options.orientation || 'landscape', options.paperSize);
  const canvas = document.createElement('canvas');
  canvas.width = size[0];
  canvas.height = size[1];
  const context = canvas.getContext('2d');
  const style = options.graphicStyle || 'standard';
  const paperCutOut = style === 'paper-cut' && !!options.paperCutOut;
  const renderSettings = normalizeRenderSettings(options.renderSettings);
  if (!options.transparentBackground || paperCutOut) {
    context.fillStyle = renderSettings.backgroundColor;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  if (!polygons.length) return canvas;

  const bounds = exportPolygonBounds(polygons);
  const margin = 96;
  const width = Math.max(bounds.maxX - bounds.minX, 0.001);
  const height = Math.max(bounds.maxY - bounds.minY, 0.001);
  const scale = Math.min((canvas.width - margin * 2) / width, (canvas.height - margin * 2) / height);
  const offsetX = (canvas.width - width * scale) / 2;
  const offsetY = (canvas.height - height * scale) / 2;
  const toCanvas = ([x, y]) => [offsetX + (x - bounds.minX) * scale, offsetY + (y - bounds.minY) * scale];

  polygons.forEach((polygon, index) => {
    let points = polygon.points.map(toCanvas);
    if (style === 'paper-cut') points = offsetCanvasPolygon(points, Number(options.paperGap) || 0);
    if (points.length < 3) return;

    if (style === 'paper-cut') {
      traceCanvasPolygon(context, points);
      if (paperCutOut) {
        context.save();
        context.globalCompositeOperation = 'destination-out';
        context.fillStyle = '#000000';
        context.fill();
        context.restore();
      } else {
        context.fillStyle = normalizeHexColor(polygon.color, '#fffdf7');
        context.fill();
      }
      if (renderSettings.edgeThickness > 0) {
        traceCanvasPolygon(context, points);
        context.strokeStyle = renderSettings.edgeColor;
        context.lineWidth = Math.max(0.5, Number(renderSettings.edgeThickness));
        context.stroke();
      }
      return;
    }

    if (style === 'pencil') {
      const color = normalizeHexColor(polygon.color, '#526f9c');
      const edgeColor = normalizeHexColor(options.pencilColor, '#526f9c');
      const intensity = clamp((Number(options.pencilIntensity) || 65) / 100, 0.1, 1);
      traceCanvasPolygon(context, points);
      context.fillStyle = hexToRgba(color, 0.05 + intensity * 0.12);
      context.fill();
      [12, -10, 32].forEach((angle, pass) => {
        drawClippedCanvasHatch(context, points, {
          angle: angle + (index % 3) * 2,
          spacing: 7 + pass * 2,
          thickness: 0.55 + intensity * 0.7,
          color: hexToRgba(color, 0.18 + intensity * 0.22),
          offset: (index * 5 + pass * 3) % 11,
        });
      });
      if (renderSettings.edgeThickness > 0) {
        traceCanvasPolygon(context, points);
        context.strokeStyle = hexToRgba(edgeColor, 0.5 + intensity * 0.38);
        context.lineWidth = Math.max(0.5, Number(renderSettings.edgeThickness));
        context.stroke();
      }
      return;
    }

    traceCanvasPolygon(context, points);
    context.fillStyle = '#fffaf0';
    context.fill();
    drawClippedCanvasHatch(context, points, {
      angle: Number(options.hatchAngle) || 45,
      spacing: clamp(Number(options.hatchSpacing) || 10, 3, 60),
      thickness: clamp(Number(options.hatchThickness) || 1.5, 0.25, 8),
      color: normalizeHexColor(polygon.color, '#b86c38'),
      offset: (index * 3) % 13,
    });
    if (renderSettings.edgeThickness > 0) {
      traceCanvasPolygon(context, points);
      context.strokeStyle = renderSettings.edgeColor;
      context.lineWidth = clamp(Number(options.hatchOutline) || Number(renderSettings.edgeThickness) || 2, 0.25, 12);
      context.stroke();
    }
  });
  return canvas;
}

function offsetCanvasPolygon(points, distance) {
  if (points.length < 3 || distance <= 0) return points;
  const signedArea = points.reduce((area, point, index) => {
    const next = points[(index + 1) % points.length];
    return area + point[0] * next[1] - next[0] * point[1];
  }, 0) / 2;
  const direction = signedArea >= 0 ? 1 : -1;
  const offsetEdges = points.map((point, index) => {
    const next = points[(index + 1) % points.length];
    const dx = next[0] - point[0];
    const dy = next[1] - point[1];
    const length = Math.hypot(dx, dy) || 1;
    const normal = [-dy / length * direction, dx / length * direction];
    return {
      start: [point[0] + normal[0] * distance, point[1] + normal[1] * distance],
      end: [next[0] + normal[0] * distance, next[1] + normal[1] * distance],
      normal,
    };
  });

  return points.map((point, index) => {
    const previous = offsetEdges[(index - 1 + offsetEdges.length) % offsetEdges.length];
    const current = offsetEdges[index];
    const intersection = infiniteLineIntersection(previous.start, previous.end, current.start, current.end);
    if (intersection && Math.hypot(intersection[0] - point[0], intersection[1] - point[1]) <= distance * 6) return intersection;
    const normalX = previous.normal[0] + current.normal[0];
    const normalY = previous.normal[1] + current.normal[1];
    const normalLength = Math.hypot(normalX, normalY) || 1;
    return [point[0] + normalX / normalLength * distance, point[1] + normalY / normalLength * distance];
  });
}

function infiniteLineIntersection(a1, a2, b1, b2) {
  const aDx = a2[0] - a1[0];
  const aDy = a2[1] - a1[1];
  const bDx = b2[0] - b1[0];
  const bDy = b2[1] - b1[1];
  const denominator = aDx * bDy - aDy * bDx;
  if (Math.abs(denominator) < 0.000001) return null;
  const t = ((b1[0] - a1[0]) * bDy - (b1[1] - a1[1]) * bDx) / denominator;
  return [a1[0] + t * aDx, a1[1] + t * aDy];
}

function drawClippedCanvasHatch(context, points, options = {}) {
  const diagonal = Math.hypot(context.canvas.width, context.canvas.height);
  context.save();
  traceCanvasPolygon(context, points);
  context.clip();
  context.translate(context.canvas.width / 2, context.canvas.height / 2);
  context.rotate(THREE.MathUtils.degToRad(Number(options.angle) || 0));
  context.strokeStyle = options.color || '#b86c38';
  context.lineWidth = Number(options.thickness) || 1;
  context.lineCap = 'round';
  const spacing = Math.max(2, Number(options.spacing) || 10);
  const offset = Number(options.offset) || 0;
  for (let y = -diagonal + offset; y <= diagonal; y += spacing) {
    context.beginPath();
    context.moveTo(-diagonal, y);
    context.lineTo(diagonal, y);
    context.stroke();
  }
  context.restore();
}

function hexToRgba(value, alpha) {
  const color = normalizeHexColor(value, '#526f9c').slice(1);
  const number = Number.parseInt(color, 16);
  return `rgba(${(number >> 16) & 255}, ${(number >> 8) & 255}, ${number & 255}, ${clamp(alpha, 0, 1)})`;
}

function glassVisualOpacity(glassSettings = DEFAULT_GLASS_SETTINGS) {
  return clamp(0.92 - normalizeGlassSettings(glassSettings).transparency * 0.4, 0.5, 0.72);
}

function fillCanvasGlassPolygon(context, points, color, glassSettings, detailed = true) {
  const settings = normalizeGlassSettings(glassSettings);
  const baseColor = normalizeHexColor(color, '#1c7c74');
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const width = Math.max(1, Math.max(...xs) - minX);
  const height = Math.max(1, Math.max(...ys) - minY);
  const surfaceTexture = createGlassSurfaceTexture(baseColor, settings);
  const pattern = context.createPattern(surfaceTexture.image, 'no-repeat');
  if (pattern?.setTransform && typeof DOMMatrix !== 'undefined') {
    pattern.setTransform(new DOMMatrix().translate(minX, minY).scale(width / 256, height / 256));
  }

  context.save();
  context.globalAlpha = glassVisualOpacity(settings);
  if (detailed && settings.shadow > 0.01) {
    context.shadowColor = hexToRgba(baseColor, 0.12 + settings.shadow * 0.2);
    context.shadowBlur = 3 + settings.shadow * 10;
    context.shadowOffsetX = 1 + settings.shadow * 3;
    context.shadowOffsetY = 2 + settings.shadow * 4;
  }
  context.fillStyle = pattern || baseColor;
  context.fill();
  context.restore();

  context.save();
  context.globalAlpha = 0.16 + settings.edgeDarkness * 0.48;
  context.strokeStyle = shadeColor(baseColor, 0.5 + (1 - settings.edgeDarkness) * 0.28);
  context.lineWidth = Math.max(1, settings.thickness * 38);
  context.stroke();
  context.restore();

  if (detailed && settings.highlight > 0.01) {
    const highlight = context.createLinearGradient(minX, minY, minX + width, minY + height);
    highlight.addColorStop(0, `rgba(255,255,255,${0.18 + settings.highlight * 0.34})`);
    highlight.addColorStop(0.34, 'rgba(255,255,255,0)');
    context.save();
    context.strokeStyle = highlight;
    context.lineWidth = Math.max(1, settings.thickness * 24);
    context.stroke();
    context.restore();
  }
}

function canvasStickerUvTransform(points, uvs, textureSize) {
  if (!Array.isArray(uvs) || uvs.length !== points.length || points.length < 3) return null;
  // Three.js UVs use a bottom-left origin; Canvas drawImage uses top-left.
  const canvasUvs = uvs.map(([u, v]) => [u, 1 - v]);
  const first = 0;
  for (let second = 1; second < canvasUvs.length - 1; second += 1) {
    for (let third = second + 1; third < canvasUvs.length; third += 1) {
      const du1 = canvasUvs[second][0] - canvasUvs[first][0];
      const dv1 = canvasUvs[second][1] - canvasUvs[first][1];
      const du2 = canvasUvs[third][0] - canvasUvs[first][0];
      const dv2 = canvasUvs[third][1] - canvasUvs[first][1];
      const determinant = du1 * dv2 - dv1 * du2;
      if (Math.abs(determinant) < 0.000001) continue;
      const dx1 = points[second][0] - points[first][0];
      const dy1 = points[second][1] - points[first][1];
      const dx2 = points[third][0] - points[first][0];
      const dy2 = points[third][1] - points[first][1];
      const a = (dx1 * dv2 - dx2 * dv1) / determinant;
      const c = (du1 * dx2 - du2 * dx1) / determinant;
      const b = (dy1 * dv2 - dy2 * dv1) / determinant;
      const d = (du1 * dy2 - du2 * dy1) / determinant;
      return {
        a: a / textureSize,
        b: b / textureSize,
        c: c / textureSize,
        d: d / textureSize,
        e: points[first][0] - a * canvasUvs[first][0] - c * canvasUvs[first][1],
        f: points[first][1] - b * canvasUvs[first][0] - d * canvasUvs[first][1],
      };
    }
  }
  return null;
}

function fillCanvasSurfaceSticker(context, points, sticker, uvs) {
  if (!hasSurfaceStickerContent(sticker)) return;
  const texture = createSurfaceStickerTexture(sticker);
  const textureSize = Math.max(1, Number(texture.image?.width) || SURFACE_STICKER_TEXTURE_SIZE);
  const uvTransform = canvasStickerUvTransform(points, uvs, textureSize);
  if (uvTransform) {
    context.save();
    traceCanvasPolygon(context, points);
    context.clip();
    context.transform(uvTransform.a, uvTransform.b, uvTransform.c, uvTransform.d, uvTransform.e, uvTransform.f);
    context.drawImage(texture.image, 0, 0);
    context.restore();
    return;
  }
  const pattern = context.createPattern(texture.image, 'no-repeat');
  if (!pattern) return;
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const width = Math.max(1, Math.max(...xs) - minX);
  const height = Math.max(1, Math.max(...ys) - minY);
  if (pattern.setTransform && typeof DOMMatrix !== 'undefined') {
    pattern.setTransform(new DOMMatrix().translate(minX, minY).scale(width / textureSize, height / textureSize));
  }
  context.save();
  traceCanvasPolygon(context, points);
  context.clip();
  context.fillStyle = pattern;
  context.fillRect(minX, minY, width, height);
  context.restore();
}

function renderFlatColorTopCanvas(placed, options = {}) {
  const renderSettings = normalizeRenderSettings(options.renderSettings);
  const material = normalizeMaterialName(options.material);
  const glassSettings = normalizeGlassSettings(options.glassSettings);
  const polygons = exportTopPolygons(placed, options);
  const orientation = options.orientation || 'landscape';
  const size = exportCanvasSize(orientation, options.paperSize);
  const canvas = document.createElement('canvas');
  canvas.width = size[0];
  canvas.height = size[1];
  const context = canvas.getContext('2d');
  if (!options.transparentBackground) {
    context.fillStyle = renderSettings.backgroundColor;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  if (!polygons.length) return canvas;

  const bounds = exportPolygonBounds(polygons);
  const margin = 96;
  const width = Math.max(bounds.maxX - bounds.minX, 0.001);
  const height = Math.max(bounds.maxY - bounds.minY, 0.001);
  const scale = Math.min((canvas.width - margin * 2) / width, (canvas.height - margin * 2) / height);
  const drawWidth = width * scale;
  const drawHeight = height * scale;
  const offsetX = (canvas.width - drawWidth) / 2;
  const offsetY = (canvas.height - drawHeight) / 2;
  const toCanvas = ([x, y]) => [
    offsetX + (x - bounds.minX) * scale,
    offsetY + (y - bounds.minY) * scale,
  ];

  context.lineJoin = 'round';
  context.lineCap = 'round';
  const detailedGlass = polygons.length <= 600;
  polygons.forEach((polygon) => {
    const points = polygon.points.map(toCanvas);
    const fillColor = normalizeHexColor(polygon.color, '#1c7c74');
    traceCanvasPolygon(context, points);
    if (material === 'glass') fillCanvasGlassPolygon(context, points, fillColor, glassSettings, detailedGlass);
    else {
      context.fillStyle = fillColor;
      context.fill();
    }
    fillCanvasSurfaceSticker(context, points, polygon.surfaceSticker, polygon.surfaceStickerUvs);
  });
  if (renderSettings.edgeThickness > 0) {
    const transformMatrix = modelTransformMatrix(options.modelTransform);
    const edgeThicknessPx = Math.max(1, stageEdgeWorldThickness(renderSettings.edgeThickness) * scale);
    context.save();
    context.strokeStyle = renderSettings.edgeColor;
    context.lineWidth = edgeThicknessPx;
    context.lineCap = 'butt';
    context.lineJoin = 'miter';
    placed.flatMap((piece) => transformedStageEdgeSegments(piece, transformMatrix, renderSettings)).forEach(([start, end]) => {
      const [startX, startY] = toCanvas(start);
      const [endX, endY] = toCanvas(end);
      context.beginPath();
      context.moveTo(startX, startY);
      context.lineTo(endX, endY);
      context.stroke();
    });
    context.restore();
  }
  return canvas;
}

function transformedStageEdgeSegments(piece, transformMatrix, renderSettings) {
  if (renderSettings.edgeMode === 'offset' && piece.offsetLinesEnabled === false) return [];
  const segments = getRealFootprintSegments(piece).filter(([start, end]) => start && end);
  if (!segments.length) return [];
  const thickness = stageEdgeWorldThickness(renderSettings.edgeThickness);
  return edgeOverlaySegments(segments, thickness, renderSettings, {
    joinedSegmentOffsets: !!piece.isFrameSlice,
    boundaryPoints: piece.isFrameSlice ? getLocalCollisionPoints(piece) : undefined,
  }).map(([start, end]) => [
    transformExportFootprintPoint(start, piece, transformMatrix),
    transformExportFootprintPoint(end, piece, transformMatrix),
  ]);
}

function toSvg(placed, options = {}) {
  const segments = exportPaperTopSegments(placed, options);
  const material = normalizeMaterialName(options.material);
  const glassSettings = normalizeGlassSettings(options.glassSettings);
  const bounds = exportSegmentBounds(segments);
  const padding = 0.1;
  const minX = bounds.minX - padding;
  const minY = bounds.minY - padding;
  const width = Math.max(bounds.maxX - bounds.minX + padding * 2, 0.1);
  const height = Math.max(bounds.maxY - bounds.minY + padding * 2, 0.1);
  const lines = segments.map(([[startX, startY], [endX, endY]]) =>
    `  <line x1="${formatMachineNumber(startX)}" y1="${formatMachineNumber(startY)}" x2="${formatMachineNumber(endX)}" y2="${formatMachineNumber(endY)}" />`,
  );
  const polygons = material === 'glass' ? exportTopPolygons(placed, options) : [];
  const uniqueColors = Array.from(new Set(polygons.map((polygon) => normalizeHexColor(polygon.color, '#1c7c74'))));
  const colorId = new Map(uniqueColors.map((color, index) => [color, `glass-color-${index}`]));
  const gradients = uniqueColors.flatMap((color, index) => {
    const id = `glass-color-${index}`;
    return [
      `    <linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">`,
      `      <stop offset="0" stop-color="${shadeColor(color, 1.18)}" />`,
      `      <stop offset="0.42" stop-color="${color}" />`,
      `      <stop offset="1" stop-color="${shadeColor(color, 0.58 + (1 - glassSettings.edgeDarkness) * 0.2)}" />`,
      '    </linearGradient>',
    ];
  });
  const glassPolygons = polygons.map((polygon) => {
    const color = normalizeHexColor(polygon.color, '#1c7c74');
    const points = polygon.points.map(([x, y]) => `${formatMachineNumber(x)},${formatMachineNumber(y)}`).join(' ');
    return `    <polygon points="${points}" fill="url(#${colorId.get(color)})" fill-opacity="${formatMachineNumber(glassVisualOpacity(glassSettings))}" stroke="${shadeColor(color, 0.68)}" stroke-opacity="${formatMachineNumber(0.22 + glassSettings.edgeDarkness * 0.5)}" stroke-width="${formatMachineNumber(glassSettings.thickness * 0.5)}" filter="url(#glass-soft-shadow)" />`;
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${formatMachineNumber(minX)} ${formatMachineNumber(minY)} ${formatMachineNumber(width)} ${formatMachineNumber(height)}">`,
    `  <title>${material === 'glass' ? 'Girih architectural glass export' : 'Girih machine export'}</title>`,
    ...(material === 'glass' ? [
      '  <defs>',
      ...gradients,
      '    <filter id="glass-soft-shadow" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB">',
      `      <feDropShadow dx="0.025" dy="0.035" stdDeviation="${formatMachineNumber(0.018 + glassSettings.shadow * 0.035)}" flood-color="#263c3a" flood-opacity="${formatMachineNumber(0.08 + glassSettings.shadow * 0.18)}" />`,
      '    </filter>',
      '  </defs>',
      '  <g id="glass-artwork" color-interpolation="sRGB">',
      ...glassPolygons,
      '  </g>',
    ] : []),
    '  <g id="cut-lines" fill="none" stroke="#000000" stroke-width="0.02" stroke-linecap="butt" stroke-linejoin="miter" vector-effect="non-scaling-stroke">',
    ...lines,
    '  </g>',
    '</svg>',
    '',
  ].join('\n');
}

function toDxf(placed, options = {}) {
  const segments = exportPaperTopSegments(placed, options);
  const lines = [
    '0',
    'SECTION',
    '2',
    'ENTITIES',
  ];
  segments.forEach(([[startX, startY], [endX, endY]]) => {
    lines.push(
      '0', 'LINE',
      '8', 'CUT',
      '10', formatMachineNumber(startX),
      '20', formatMachineNumber(startY),
      '30', '0',
      '11', formatMachineNumber(endX),
      '21', formatMachineNumber(endY),
      '31', '0',
    );
  });
  lines.push('0', 'ENDSEC', '0', 'EOF', '');
  return lines.join('\n');
}

function toEps(placed, options = {}) {
  const segments = exportPaperTopSegments(placed, options);
  const bounds = exportSegmentBounds(segments);
  const padding = 12;
  const sourceWidth = Math.max(bounds.maxX - bounds.minX, 0.001);
  const sourceHeight = Math.max(bounds.maxY - bounds.minY, 0.001);
  const scale = Math.min(720 / sourceWidth, 720 / sourceHeight);
  const width = Math.ceil(sourceWidth * scale + padding * 2);
  const height = Math.ceil(sourceHeight * scale + padding * 2);
  const toEpsPoint = ([x, y]) => [
    padding + (x - bounds.minX) * scale,
    padding + (y - bounds.minY) * scale,
  ];
  const lines = [
    '%!PS-Adobe-3.0 EPSF-3.0',
    `%%BoundingBox: 0 0 ${width} ${height}`,
    '%%Title: Girih machine export',
    '%%Creator: Girih',
    '%%Pages: 1',
    '%%EndComments',
    '0 setgray',
    '1 setlinejoin',
    '1 setlinecap',
    '1 setlinewidth',
  ];
  segments.forEach(([start, end]) => {
    const [startX, startY] = toEpsPoint(start);
    const [endX, endY] = toEpsPoint(end);
    lines.push('newpath');
    lines.push(`${formatMachineNumber(startX)} ${formatMachineNumber(startY)} moveto`);
    lines.push(`${formatMachineNumber(endX)} ${formatMachineNumber(endY)} lineto`);
    lines.push('stroke');
  });
  lines.push('showpage', '%%EOF', '');
  return lines.join('\n');
}

async function toStl(placed, options = {}) {
  const root = new THREE.Group();
  applyModelTransform(root, options.modelTransform);
  const exportObjects = await Promise.all(placed.map(createStlPieceObject));
  exportObjects.forEach(({ piece, object }) => {
    const holder = new THREE.Group();
    holder.position.set(piece.x || 0, Number(piece.elevation) || 0, piece.y || 0);
    holder.rotation.set(Number(piece.tiltX) || 0, -(Number(piece.rotation) || 0), Number(piece.tiltZ) || 0);
    holder.scale.set(piece.mirrorHorizontal ? -1 : 1, 1, piece.mirrorVertical ? -1 : 1);
    holder.add(object);
    root.add(holder);
  });
  root.updateMatrixWorld(true);

  const lines = ['solid girih_model'];
  root.traverse((child) => {
    if (child.isMesh && child.geometry) appendMeshStlTriangles(lines, child);
  });
  lines.push('endsolid girih_model', '');
  exportObjects.forEach(({ object }) => disposeObject(object));
  return lines.join('\n');
}

async function createStlPieceObject(piece) {
  if (piece.type === 'glb' && (piece.glbDataUrl || piece.glbUrl)) {
    const source = await cachedGlbSourceModel(piece);
    const object = source.clone(true);
    normalizeImportedObject(object, piece);
    object.traverse((child) => {
      if (child.isMesh && child.geometry) child.geometry.userData = { ...child.geometry.userData, cachedGlbSource: true };
    });
    return { piece, object };
  }
  if (piece.type === 'obj' && piece.objText) {
    return { piece, object: createObjPieceObject(piece) };
  }
  return { piece, object: createShapePieceObject(piece) };
}

function appendMeshStlTriangles(lines, mesh) {
  const geometry = mesh.geometry;
  const position = geometry.attributes?.position;
  if (!position) return;
  const matrix = mesh.matrixWorld;
  const flipWinding = matrix.determinant() < 0;
  const readVertex = (index) => {
    const point = new THREE.Vector3().fromBufferAttribute(position, index).applyMatrix4(matrix);
    return [point.x, point.y, point.z];
  };
  const appendByIndex = (aIndex, bIndex, cIndex) => {
    const triangle = [readVertex(aIndex), readVertex(bIndex), readVertex(cIndex)];
    appendStlTriangle(lines, flipWinding ? [triangle[0], triangle[2], triangle[1]] : triangle);
  };
  if (geometry.index) {
    const index = geometry.index;
    for (let cursor = 0; cursor < index.count - 2; cursor += 3) {
      appendByIndex(index.getX(cursor), index.getX(cursor + 1), index.getX(cursor + 2));
    }
    return;
  }
  for (let cursor = 0; cursor < position.count - 2; cursor += 3) {
    appendByIndex(cursor, cursor + 1, cursor + 2);
  }
}

function appendStlTriangle(lines, triangle) {
  const normal = triangleNormal(triangle);
  if (!normal) return;
  lines.push(`  facet normal ${formatMachineNumber(normal[0])} ${formatMachineNumber(normal[1])} ${formatMachineNumber(normal[2])}`);
  lines.push('    outer loop');
  triangle.forEach(([x, y, z]) => {
    lines.push(`      vertex ${formatMachineNumber(x)} ${formatMachineNumber(y)} ${formatMachineNumber(z)}`);
  });
  lines.push('    endloop');
  lines.push('  endfacet');
}

function formatMachineNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0';
  const rounded = Math.round(number * 1000000) / 1000000;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

function toObj(scene) {
  const modelTransform = normalizeModelTransform(scene.modelTransform);
  const transformMatrix = modelTransformMatrix(modelTransform);
  const lines = [
    `# Girih export`,
    `# material=${scene.material}`,
    `# style=${scene.style}`,
    `# modelTransform=${JSON.stringify(modelTransform)}`,
  ];
  let vertexOffset = 1;
  scene.pieces.forEach((piece) => {
    lines.push(`o ${piece.name.replace(/\s+/g, '_')}_${piece.id}`);
    const mirrorHorizontal = !!piece.transform.mirrorHorizontal;
    const mirrorVertical = !!piece.transform.mirrorVertical;
    piece.points.forEach(([x, y]) => {
      const [rx, ry] = rotatePoint(mirrorHorizontal ? -x : x, mirrorVertical ? -y : y, piece.transform.rotation);
      const point = new THREE.Vector3(rx + piece.transform.x, 0, ry + piece.transform.y).applyMatrix4(transformMatrix);
      lines.push(`v ${point.x.toFixed(4)} ${point.y.toFixed(4)} ${point.z.toFixed(4)}`);
    });
    const face = piece.points.map((_, index) => vertexOffset + index).join(' ');
    lines.push(`f ${face}`);
    vertexOffset += piece.points.length;
  });
  return lines.join('\n');
}

function modelTransformMatrix(transform) {
  const normalized = normalizeModelTransform(transform);
  const matrix = new THREE.Matrix4();
  matrix.compose(
    new THREE.Vector3(normalized.positionX, normalized.positionY, normalized.positionZ),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(
      THREE.MathUtils.degToRad(normalized.rotationX),
      THREE.MathUtils.degToRad(normalized.rotationY),
      THREE.MathUtils.degToRad(normalized.rotationZ),
    )),
    new THREE.Vector3(normalized.scaleX, normalized.scaleY, normalized.scaleZ),
  );
  return matrix;
}

function ActivityTracker() {
  useEffect(() => {
    if (!supabase) return undefined;
    let stopped = false;
    let timer;
    const storageKey = 'girih.activitySession.v1';
    let activitySessionId = sessionStorage.getItem(storageKey);
    if (!activitySessionId) {
      activitySessionId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      sessionStorage.setItem(storageKey, activitySessionId);
    }

    const currentSessionKey = () => `${activitySessionId}:${new Date().toISOString().slice(0, 10)}`;

    async function recordActivity() {
      if (stopped || document.visibilityState === 'hidden') return;
      const { data } = await supabase.auth.getSession();
      if (!data.session?.access_token) return;
      fetch('/api/user-activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` },
        body: JSON.stringify({ sessionKey: currentSessionKey() }),
        keepalive: true,
      }).catch(() => {});
    }

    function schedule() {
      window.clearInterval(timer);
      if (document.visibilityState !== 'hidden') {
        recordActivity();
        timer = window.setInterval(recordActivity, 60000);
      }
    }

    schedule();
    document.addEventListener('visibilitychange', schedule);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', schedule);
    };
  }, []);
  return null;
}

function MehrazFoundationPage() {
  const [libraryStatus, setLibraryStatus] = useState(null);
  const icons = {
    girih_pattern: Grid3X3,
    brick_bond: Frame,
    muqarnas_assembly: Layers3,
    surface_sticker: ImageIcon,
    mehraz_project: Box,
  };
  useEffect(() => {
    let active = true;
    if (!supabase) {
      setLibraryStatus({ installed: false, phase: 0 });
      return () => {
        active = false;
      };
    }
    supabase.rpc('library_capabilities').then(({ data, error }) => {
      if (active) setLibraryStatus({
        installed: !error && Number(data?.phase) >= 3,
        phase: !error ? Number(data?.phase) || 0 : 0,
      });
    }).catch(() => {
      if (active) setLibraryStatus({ installed: false, phase: 0 });
    });
    return () => {
      active = false;
    };
  }, []);
  const libraryInstalled = libraryStatus?.installed === true;
  const statusLabel = libraryStatus === null
    ? 'Checking database'
    : libraryInstalled
      ? 'Shared library operational'
      : 'Migration ready';
  return (
    <main className="foundation-page">
      <header className="foundation-header">
        <a href="/" className="foundation-brand">
          <img src="/landing/brand/girih-logo-color.png" alt="" />
          <span>Girih Studio</span>
        </a>
        <div className="foundation-header-actions">
          <span>Mehraz workspace</span>
          <girih-app-switcher compact></girih-app-switcher>
        </div>
      </header>

      <section className="foundation-hero">
        <p className="foundation-eyebrow">Mehraz · Phase 7</p>
        <div className="foundation-hero-grid">
          <div>
            <h1>Compose architecture from the studio’s shared design library.</h1>
            <p>Phase 7 organizes version-pinned decorations into architectural assemblies with quantities, surface coverage, construction status, and downloadable fabrication schedules.</p>
          </div>
          <aside>
            <span className={`foundation-status-dot ${libraryInstalled ? 'is-live' : 'is-ready'}`} />
            <strong>{libraryInstalled ? 'Phase 7 ready' : statusLabel}</strong>
            <small>{libraryInstalled
              ? 'The Mehraz workspace can save and reopen versioned architectural projects.'
              : 'Run the shared-library SQL migration to enable library browsing, save, and open.'}</small>
          </aside>
        </div>
      </section>

      <section className="foundation-adapters">
        <div className="foundation-section-heading">
          <p className="foundation-eyebrow">Architectural workspace</p>
          <h2>A practical shell for assembling the studio’s design systems.</h2>
        </div>
        <div className="foundation-adapter-grid">
          <article><span>01</span><strong>Architectural shell</strong><p>Start with an adjustable iwan or room and control its width, depth, height, opening, wall thickness, and colors.</p></article>
          <article><span>02</span><strong>Shared asset browser</strong><p>Filter your library by Girih patterns, brick bonds, Muqarnas assemblies, and surface stickers.</p></article>
          <article><span>03</span><strong>Construction assemblies</strong><p>Group placed designs into named fabrication and installation packages with trade, status, and project notes.</p></article>
          <article><span>04</span><strong>Quantity schedules</strong><p>Calculate placement counts and planning coverage by surface, assembly, and asset version, then export a coordinated CSV schedule.</p></article>
        </div>
        <a className="foundation-launch" href="https://mehraz.girihstudio.com">Open Mehraz App <ArrowRight size={16} /></a>
      </section>

      <section className="foundation-library">
        <div className="foundation-section-heading">
          <p className="foundation-eyebrow">Shared Supabase foundation</p>
          <h2>Designed for safe reuse without copying or losing ownership.</h2>
        </div>
        <div className="foundation-library-grid">
          <article><strong>Asset ownership</strong><span>One stable identity belongs to its creator across every app.</span></article>
          <article><strong>Immutable versions</strong><span>Every save creates a numbered snapshot; Mehraz pins the exact version used.</span></article>
          <article><strong>Entitlements</strong><span>Private shares and marketplace purchases grant explicit view, use, or edit access.</span></article>
          <article><strong>Protected storage</strong><span>JSON, PNG, SVG, GLB, PDF, and video artifacts live in a private 100 MB bucket.</span></article>
          <article><strong>Row-level security</strong><span>Owners control their work while entitled users receive only their granted access.</span></article>
        </div>
        <div className="foundation-install">
          <div>
            <small>Database installation</small>
            <strong>{libraryInstalled ? 'Connected and operational' : 'Run or rerun the updated SQL migration'}</strong>
          </div>
          <a href="/design/shared-asset-library-phase2.sql" download>
            Download shared library migration <Download size={16} />
          </a>
        </div>
      </section>

      <section className="foundation-content">
        <div className="foundation-section-heading">
          <p className="foundation-eyebrow">Shared library formats</p>
          <h2>Each focused app creates one portable asset.</h2>
        </div>
        <div className="foundation-asset-grid">
          {ASSET_CONTRACT_MANIFEST.assetTypes.map((definition) => {
            const Icon = icons[definition.type] || Box;
            return (
              <article key={definition.type}>
                <span className="foundation-asset-icon"><Icon size={22} /></span>
                <div>
                  <small>{definition.sourceApp} app</small>
                  <h3>{definition.label}</h3>
                </div>
                <p>{definition.description}</p>
                <dl>
                  <div><dt>Required</dt><dd>{definition.requiredPayload.join(' · ')}</dd></div>
                  <div><dt>Artifacts</dt><dd>{definition.recommendedArtifacts.join(' · ')}</dd></div>
                </dl>
              </article>
            );
          })}
        </div>
      </section>

      <section className="foundation-rules">
        <div>
          <p className="foundation-eyebrow">Spatial contract</p>
          <h2>Everything meets in the same physical space.</h2>
        </div>
        <div className="foundation-rule-grid">
          <article><strong>Metres</strong><span>All physical dimensions</span></article>
          <article><strong>Y-up</strong><span>Shared vertical axis</span></article>
          <article><strong>−Z</strong><span>Forward direction</span></article>
          <article><strong>Version pinned</strong><span>Projects never change unexpectedly</span></article>
        </div>
      </section>

      <section className="foundation-next">
        <div>
          <p className="foundation-eyebrow">Next approval point</p>
          <h2>Phase 8 · Building templates and collaboration</h2>
          <p>The next phase can turn complete architectural compositions into reusable building templates and introduce controlled project sharing and team review.</p>
        </div>
        <a href="https://mehraz.girihstudio.com">Review the Phase 7 workspace <ArrowRight size={16} /></a>
      </section>
    </main>
  );
}

function Root() {
  const pathname = window.location.pathname;
  const appRoute = pathname === '/app' || pathname.startsWith('/app/');
  const marketplaceRoute = pathname === '/marketplace';
  const adminRoute = pathname === '/admin' || pathname.startsWith('/admin/');
  const profileRoute = pathname === '/profile' || pathname.startsWith('/profile/');
  const foundationRoute = pathname === '/mehraz-foundation';
  const trainingRoute = pathname === '/training' || pathname.startsWith('/training/');
  const publicProfileId = pathname.startsWith('/profile/') ? decodeURIComponent(pathname.slice('/profile/'.length)) : '';
  const infoPageType = pathname === '/contact' ? 'contact' : pathname === '/support' ? 'support' : null;
  useEffect(() => {
    document.body.classList.toggle('landing-body', !appRoute);
    return () => document.body.classList.remove('landing-body');
  }, [appRoute]);
  useEffect(() => {
    if (appRoute) document.title = 'Girih App | Girih Studio';
    else if (marketplaceRoute) document.title = 'Marketplace | Girih Studio';
    else if (adminRoute) document.title = 'Admin | Girih Studio';
    else if (profileRoute) document.title = 'Profile | Girih Studio';
    else if (foundationRoute) document.title = 'Mehraz Foundation | Girih Studio';
    else if (trainingRoute) document.title = 'Academy | Girih Studio';
    else if (infoPageType) document.title = `${infoPageType === 'contact' ? 'Contact' : 'Support'} | Girih Studio`;
    else document.title = 'Girih Studio';
  }, [adminRoute, appRoute, foundationRoute, infoPageType, marketplaceRoute, profileRoute, trainingRoute]);
  useEffect(() => {
    const favicon = document.querySelector('link[rel~="icon"]');
    if (favicon) favicon.href = appRoute ? '/design/icons/girih.png' : '/landing/brand/girih-logo-color.png';
  }, [appRoute]);
  let page = <LandingPage />;
  if (appRoute) page = <App />;
  else if (marketplaceRoute) page = <MarketplacePage />;
  else if (adminRoute) page = <AdminOverviewPage />;
  else if (profileRoute) page = <MarketplaceProfilePage publicProfileId={publicProfileId} />;
  else if (foundationRoute) page = <MehrazFoundationPage />;
  else if (trainingRoute) page = <TrainingPage />;
  else if (infoPageType) page = <InfoPage type={infoPageType} />;
  return <><ActivityTracker />{page}</>;
}

createRoot(document.getElementById('root')).render(<Root />);
