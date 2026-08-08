import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowLeft,
  Box,
  Boxes,
  Copy,
  Download,
  Eye,
  Focus,
  FolderOpen,
  GraduationCap,
  Grid3X3,
  Layers3,
  Lightbulb,
  LogIn,
  Magnet,
  Minus,
  MousePointer2,
  Move3D,
  Plus,
  Play,
  Redo2,
  Rotate3D,
  Save,
  Scaling,
  Scissors,
  Square,
  Trash2,
  Undo2,
  Upload,
  User,
} from 'lucide-react';
import { DEFAULT_LEVELS, MuqarnasScene } from './muqarnas-scene.js';
import { authHandoffReady, supabase } from './supabase-client.js';
import {
  archiveLibraryAsset,
  listLibraryAssets,
  listLibraryAssetVersions,
  saveLibraryAsset,
  setCurrentLibraryAssetVersion,
  updateLibraryAssetMetadata,
} from './library-client.generated.js';
import './styles.css';

const VIEW_LABELS = { perspective: 'Perspective view', front: 'Front view', top: 'Top view' };
const DEFAULT_BOND_PATTERN = {
  courses: [
    { offset: 0, bricks: [1] },
    { offset: 0.5, bricks: [1] },
  ],
};
const BUILT_IN_BONDS = [
  {
    id: 'running',
    name: 'Normal running bond',
    description: 'Half-brick offset on alternating courses',
    pattern: DEFAULT_BOND_PATTERN,
  },
  {
    id: 'stack',
    name: 'Stack bond',
    description: 'Vertical joints align on every course',
    pattern: { courses: [{ offset: 0, bricks: [1] }] },
  },
  {
    id: 'english',
    name: 'English bond',
    description: 'Alternating stretcher and header courses',
    pattern: {
      courses: [
        { offset: 0, bricks: [1] },
        { offset: 0.25, bricks: [0.5] },
      ],
    },
  },
];
const NEW_MODEL_SECTIONS = Object.freeze({ tiers: false, stage: true, walls: true, night: true, snapping: true });
const LOADED_MODEL_SECTIONS = Object.freeze({ tiers: true, stage: true, walls: true, night: true, snapping: true });

function MuqarnasLibraryPreview({ asset, version, engine }) {
  const payload = version?.payload || asset?.currentVersion?.payload || {};
  const artifacts = version?.artifacts || asset?.currentVersion?.artifacts || {};
  const savedPreview = artifacts.preview_png || '';
  const [generatedPreview, setGeneratedPreview] = useState('');
  useEffect(() => {
    setGeneratedPreview(engine?.renderAssemblyTopThumbnail(payload) || savedPreview || '');
  }, [asset?.id, version?.id, engine, savedPreview]);
  const instances = Array.isArray(payload.instances) ? payload.instances : [];
  const levels = Array.isArray(payload.levels) ? payload.levels : [];
  const moduleColor = payload.moduleColor || '#f2d336';
  const points = instances
    .map((item) => {
      const position = item.transform?.position || item.position || [0, 0, 0];
      const x = Number(position[0] ?? position.x);
      const y = Number(position[1] ?? position.y);
      const z = Number(position[2] ?? position.z);
      const level = levels.find((entry) => entry.id === item.levelId || entry.id === item.tierId);
      return {
        x: Number.isFinite(x) ? x : 0,
        y: Number.isFinite(y) ? y : Number(level?.height) || 0,
        z: Number.isFinite(z) ? z : 0,
      };
    });
  const minX = Math.min(...points.map((point) => point.x), -1);
  const maxX = Math.max(...points.map((point) => point.x), 1);
  const minZ = Math.min(...points.map((point) => point.z), -1);
  const maxZ = Math.max(...points.map((point) => point.z), 1);
  const spanX = Math.max(0.5, maxX - minX);
  const spanZ = Math.max(0.5, maxZ - minZ);
  const scale = Math.min(170 / spanX, 78 / spanZ);
  const levelHeights = levels.map((level) => Number(level.height)).filter(Number.isFinite);
  const minLevel = Math.min(...levelHeights, 0);
  const maxLevel = Math.max(...levelHeights, 1);
  const levelSpan = Math.max(0.01, maxLevel - minLevel);
  if (generatedPreview) {
    return <img className="library-preview-thumb" src={generatedPreview} alt={`${asset?.name || 'Muqarnas assembly'} top view`} />;
  }
  return (
    <svg className="library-preview-thumb" viewBox="0 0 220 120" role="img" aria-label={`${asset?.name || 'Muqarnas assembly'} preview`}>
      <rect width="220" height="120" rx="8" fill="#f8f0df" />
      <g stroke="rgba(47,81,76,.12)" strokeWidth="1">
        {Array.from({ length: 8 }, (_, index) => <line key={`x-${index}`} x1={20 + index * 26} y1="12" x2={20 + index * 26} y2="108" />)}
        {Array.from({ length: 4 }, (_, index) => <line key={`y-${index}`} x1="14" y1={25 + index * 22} x2="206" y2={25 + index * 22} />)}
      </g>
      {points.length ? points.slice(0, 120).map((point, index) => {
        const x = 110 + (point.x - (minX + maxX) / 2) * scale;
        const y = 60 + (point.z - (minZ + maxZ) / 2) * scale;
        const tierTone = (point.y - minLevel) / levelSpan;
        const fill = tierTone > 0.66 ? '#d7a722' : tierTone > 0.33 ? moduleColor : '#c18c32';
        return <rect key={`${point.x}-${point.z}-${index}`} x={x - 5} y={y - 5} width="10" height="10" rx="2" fill={fill} stroke="#51441a" strokeWidth=".8" opacity=".92" />;
      }) : (
        <text x="110" y="62" textAnchor="middle" fill="#756957" fontSize="11" fontWeight="700">No modules saved</text>
      )}
    </svg>
  );
}

function cloneBondPattern(pattern = DEFAULT_BOND_PATTERN) {
  if (Number(pattern?.version) >= 2 && Array.isArray(pattern?.bricks) && pattern.bricks.length) {
    return {
      version: 2,
      unit: pattern.unit || 'quarter-brick-width',
      columns: Math.max(1, Number(pattern.columns) || 1),
      rows: Math.max(1, Number(pattern.rows) || 1),
      scale: Math.max(0.25, Math.min(4, Number(pattern.scale) || 1)),
      selectionKey: pattern.selectionKey || '',
      selectionName: pattern.selectionName || '',
      mortarColor: pattern.mortarColor,
      bricks: pattern.bricks.map((brick) => ({ ...brick })),
    };
  }
  const courses = Array.isArray(pattern?.courses) && pattern.courses.length
    ? pattern.courses
    : DEFAULT_BOND_PATTERN.courses;
  return {
    selectionKey: pattern.selectionKey || 'builtin:running',
    selectionName: pattern.selectionName || 'Normal running bond',
    courses: courses.map((course) => ({
      offset: Number(course.offset) || 0,
      bricks: Array.isArray(course.bricks) && course.bricks.length ? [...course.bricks] : [1],
    })),
  };
}

function ViewLabel({ view }) {
  const Icon = view === 'top' ? Grid3X3 : view === 'front' ? Layers3 : Boxes;
  return <span><Icon size={13} /> {VIEW_LABELS[view] || 'View'}</span>;
}

function App() {
  const viewportRef = useRef(null);
  const overviewViewportRef = useRef(null);
  const engineRef = useRef(null);
  const openProjectRef = useRef(null);
  const exportPanRef = useRef(null);
  const [library, setLibrary] = useState([]);
  const [selected, setSelected] = useState(null);
  const [stats, setStats] = useState({ modules: 0, triangles: 0 });
  const [mode, setMode] = useState('translate');
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [gridSize, setGridSize] = useState(0.01);
  const [snapDistance, setSnapDistance] = useState(0.08);
  const [connectorsVisible, setConnectorsVisible] = useState(true);
  const [status, setStatus] = useState('Loading the included Muqarnas modules…');
  const [levels, setLevels] = useState(() => DEFAULT_LEVELS.map((level) => ({ ...level })));
  const [activeLevelId, setActiveLevelId] = useState(DEFAULT_LEVELS[0].id);
  const [tierShift, setTierShift] = useState('0');
  const [stageDragActive, setStageDragActive] = useState(false);
  const [history, setHistory] = useState({ canUndo: false, canRedo: false });
  const [contextMenu, setContextMenu] = useState(null);
  const [shadowsEnabled, setShadowsEnabled] = useState(true);
  const [edgeSettings, setEdgeSettings] = useState({ enabled: false, thickness: 4, color: '#ffffff', verticalLines: true });
  const [moduleColor, setModuleColor] = useState('#f2d336');
  const [exportOpen, setExportOpen] = useState(false);
  const [exportSettings, setExportSettings] = useState({ format: 'png', paper: 'a4', orientation: 'portrait', dpi: 450, style: 'solid', view: 'current', material: 'matte', wallMaterial: 'matte', lighting: 'day', reflectionStrength: 0.72, groundColor: '#fbf0bc', shadows: true, noTextures: true, seamless: false, seamlessColor: '#f2d336', seamlessEdges: false, seamlessWallEdges: false, seamlessNorthBoundary: false, wallEdgeColor: '#79610c', wallEdgeThickness: 2, orbitDuration: 10, zoom: 1, panX: 0, panY: 0 });
  const [exportPreview, setExportPreview] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [bondAccount, setBondAccount] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [sharedAssemblies, setSharedAssemblies] = useState([]);
  const [activeLibraryAssetId, setActiveLibraryAssetId] = useState(null);
  const [libraryDialogOpen, setLibraryDialogOpen] = useState(false);
  const [libraryName, setLibraryName] = useState('Muqarnas assembly');
  const [libraryBusy, setLibraryBusy] = useState(false);
  const [libraryMessage, setLibraryMessage] = useState('');
  const [libraryEdit, setLibraryEdit] = useState({ name: '', description: '' });
  const [libraryVersions, setLibraryVersions] = useState([]);
  const [selectedLibraryVersionId, setSelectedLibraryVersionId] = useState('');
  const [libraryEditReturnTo, setLibraryEditReturnTo] = useState('');
  const [sharedBonds, setSharedBonds] = useState([]);
  const [sharedBondLoading, setSharedBondLoading] = useState(false);
  const [sharedBondError, setSharedBondError] = useState('');
  const [importedPatternScale, setImportedPatternScale] = useState(1);
  const [assemblyDuration, setAssemblyDuration] = useState('15');
  const [assemblyPlaying, setAssemblyPlaying] = useState(false);
  const [inspectorWidth, setInspectorWidth] = useState(320);
  const [collapsedSections, setCollapsedSections] = useState(() => ({ ...NEW_MODEL_SECTIONS }));
  const inspectorResizeRef = useRef(null);
  const libraryHandoffLoadedRef = useRef(false);
  const [viewLayout, setViewLayout] = useState({ main: 'perspective', front: 'front', top: 'top' });
  const [overviewView, setOverviewView] = useState('top');
  const [walkView, setWalkView] = useState({ enabled: false, eyeLevel: 1.65 });
  const [walls, setWalls] = useState({ enabled: false, thickness: 0.4, color: '#b78b5d', material: 'matte', openSides: [], extraHeights: { north: 0, east: 0, south: 0, west: 0 }, sideOffsets: { north: 0, east: 0, south: 0, west: 0 }, brickPattern: { enabled: true, brickWidth: 0.215, brickHeight: 0.065, mortar: 0.01, mortarColor: '#d8c7a3', bondPattern: cloneBondPattern() }, southOpenings: { door: { enabled: false, width: 1, height: 2.1, position: 0 }, window: { enabled: false, width: 1, height: 1.2, position: 0, sillHeight: null } }, pointedArch: { enabled: false, greenOffset: null, greenHeight: null }, northWall: { outwardWidth: 1.5, minHeight: null, archTopExtension: 1 }, northBoundary: { enabled: false, depth: 0.2, color: '#79610c', thickness: 4 }, wallEdges: { enabled: false, color: '#79610c', thickness: 2 } });
  const [nightLighting, setNightLighting] = useState({ preview: false, guides: false, selectedId: null, lights: [] });

  useEffect(() => {
    const bond = walls.brickPattern?.bondPattern;
    setImportedPatternScale(Number(bond?.version) >= 2 ? Math.max(0.25, Math.min(4, Number(bond.scale) || 1)) : 1);
  }, [walls.brickPattern?.bondPattern]);

  useEffect(() => {
    let active = true;
    authHandoffReady.then(() => supabase.auth.getSession()).then(({ data }) => {
      if (active) {
        setBondAccount(data.session?.user || null);
        setAuthReady(true);
      }
    }).catch((error) => {
      if (active) {
        setSharedBondError(error.message);
        setAuthReady(true);
      }
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) {
        setBondAccount(session?.user || null);
        setAuthReady(true);
      }
    });
    return () => {
      active = false;
      data.subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!bondAccount || libraryHandoffLoadedRef.current) return undefined;
    const params = new URLSearchParams(window.location.search);
    const assetId = params.get('libraryAsset') || '';
    const returnTo = params.get('returnTo') || '';
    const versionId = params.get('version') || '';
    if (!assetId) return undefined;
    libraryHandoffLoadedRef.current = true;
    let cancelled = false;
    setLibraryBusy(true);
    listLibraryAssets(supabase, { assetType: 'muqarnas_assembly' })
      .then(async (assets) => {
        if (cancelled) return;
        setSharedAssemblies(assets);
        const asset = assets.find((item) => item.id === assetId);
        if (!asset) {
          setLibraryMessage('This shared library item was not found in Muqarnas App.');
          setLibraryDialogOpen(true);
          return;
        }
        let targetAsset = asset;
        if (versionId && versionId !== asset.current_version_id) {
          const versions = await listLibraryAssetVersions(supabase, asset.id);
          const selectedVersion = versions.find((version) => version.id === versionId);
          if (selectedVersion) {
            targetAsset = { ...asset, currentVersion: selectedVersion, current_version_id: selectedVersion.id };
            setLibraryVersions(versions);
            setSelectedLibraryVersionId(selectedVersion.id);
          }
        }
        if (cancelled) return;
        setLibraryEditReturnTo(returnTo);
        await openSharedAssembly(targetAsset);
        setLibraryMessage(returnTo ? 'Editing this Muqarnas assembly from Mehraz. Save to return to Mehraz.' : '');
      })
      .catch((error) => {
        if (!cancelled) {
          setLibraryMessage(error.message);
          setLibraryDialogOpen(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLibraryBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bondAccount]);

  useEffect(() => {
    if (!bondAccount) {
      setSharedBonds([]);
      setSharedAssemblies([]);
      setActiveLibraryAssetId(null);
      return;
    }
    loadSharedBonds();
    loadSharedAssemblies();
  }, [bondAccount]);

  useEffect(() => {
    if (!bondAccount || !viewportRef.current || !overviewViewportRef.current) return undefined;
    const engine = new MuqarnasScene(viewportRef.current, {
      onSelection: setSelected,
      onStats: setStats,
      onStatus: setStatus,
      onHistory: setHistory,
      onLibrary: setLibrary,
      onModuleColor: (color) => {
        setModuleColor(color);
        setExportSettings((value) => ({ ...value, seamlessColor: color }));
      },
      onViewLayout: setViewLayout,
      onWalk: setWalkView,
      onAssembly: ({ playing }) => setAssemblyPlaying(playing),
      onWalls: setWalls,
      onEdges: setEdgeSettings,
      onNightLights: setNightLighting,
      onContextMenu: setContextMenu,
      onLevels: ({ levels: nextLevels, activeLevelId: nextActiveLevelId }) => {
        setLevels(nextLevels);
        setActiveLevelId(nextActiveLevelId);
      },
    });
    engineRef.current = engine;
    engine.attachOverviewView(overviewViewportRef.current, overviewView);
    let active = true;
    engine.installBundledLibrary()
      .then((items) => {
        if (!active) return;
        setLibrary(items);
        setStatus('Nine Muqarnas modules are ready for assembly.');
      })
      .catch((error) => {
        if (active) setStatus(error.message || 'The included modules could not be loaded.');
      });
    return () => { active = false; engine.dispose(); };
  }, [bondAccount?.id]);
  useEffect(() => {
    if (!exportOpen || !stats.modules) return;
    const frame = requestAnimationFrame(() => setExportPreview(engineRef.current?.renderExportPreview(exportSettings, true) || ''));
    return () => cancelAnimationFrame(frame);
  }, [exportOpen, exportSettings, edgeSettings, nightLighting, stats.modules, viewLayout]);

  function updateAllModuleColor(color) {
    setModuleColor(color);
    engineRef.current?.setAllModuleColor(color);
    setExportSettings((value) => ({ ...value, seamlessColor: color }));
  }

  function updateNightLightVector(field, index, value) {
    if (!nightLighting.selectedId || !selectedNightLight) return;
    const vector = [...selectedNightLight[field]];
    vector[index] = Number(value) || 0;
    engineRef.current?.updateNightLight(nightLighting.selectedId, { [field]: vector });
  }

  function openExportDialog() {
    setExportSettings((value) => ({
      ...value,
      style: 'solid',
      material: 'matte',
      wallMaterial: 'matte',
      groundColor: '#fbf0bc',
      shadows: shadowsEnabled,
      noTextures: true,
      seamless: false,
      seamlessColor: moduleColor,
      seamlessEdges: edgeSettings.enabled,
      seamlessWallEdges: walls.wallEdges?.enabled === true,
      seamlessNorthBoundary: walls.northBoundary?.enabled === true,
      wallEdgeColor: walls.wallEdges?.color || '#79610c',
      wallEdgeThickness: walls.wallEdges?.thickness ?? 2,
    }));
    setExportOpen(true);
  }

  async function loadSharedBonds() {
    if (!bondAccount) return;
    setSharedBondLoading(true);
    setSharedBondError('');
    try {
      const assets = await listLibraryAssets(supabase, { assetType: 'brick_bond' });
      const patterns = assets.map((asset) => ({
        id: asset.id,
        name: asset.name,
        bond_pattern: asset.currentVersion?.payload?.pattern,
        updated_at: asset.updated_at,
      })).filter((pattern) => (
        Number(pattern.bond_pattern?.version) >= 2 && pattern.bond_pattern?.bricks?.length
      ));
      setSharedBonds(patterns);
    } catch (libraryError) {
      const { data, error } = await supabase
        .from('brick_bond_patterns')
        .select('id, name, bond_pattern, updated_at')
        .order('updated_at', { ascending: false });
      if (error) setSharedBondError(libraryError.message || error.message || 'Shared patterns could not be loaded.');
      else setSharedBonds((data || []).filter((pattern) => (
        Number(pattern.bond_pattern?.version) >= 2 && pattern.bond_pattern?.bricks?.length
      )));
    }
    setSharedBondLoading(false);
  }

  async function connectBondAccount() {
    const login = new URL('/app', 'https://girihstudio.com');
    login.searchParams.set('mode', 'login');
    login.searchParams.set('nextApp', window.location.href);
    window.location.assign(login);
  }

  function useSharedBond(pattern) {
    if (Number(pattern.bond_pattern?.version) < 2 || !pattern.bond_pattern?.bricks?.length) {
      useBuiltInBond(BUILT_IN_BONDS[0]);
      setSharedBondError('This pattern is unreadable. Normal running bond was restored; save the pattern again from Bricks App.');
      return;
    }
    const imported = cloneBondPattern(pattern.bond_pattern);
    if (!walls.enabled) engineRef.current?.setWallsEnabled(true);
    setImportedPatternScale(1);
    updateWallBrickPattern({
      enabled: true,
      bondPattern: { ...imported, scale: 1 },
      ...(imported.mortarColor ? { mortarColor: imported.mortarColor } : {}),
    });
    setStatus(`Applied “${pattern.name}” exactly as designed in Bricks App.`);
  }

  function useBuiltInBond(bond) {
    engineRef.current?.setBuiltInWallBond(cloneBondPattern(bond.pattern));
    setImportedPatternScale(1);
    setStatus(`${bond.name} applied to the walls.`);
  }

  function wallSideBond(side) {
    return walls.brickPattern?.sideBonds?.[side] || walls.brickPattern?.bondPattern || cloneBondPattern();
  }

  function applyWallSideBond(side, selectionKey) {
    const builtIn = BUILT_IN_BONDS.find((bond) => `builtin:${bond.id}` === selectionKey);
    if (builtIn) {
      engineRef.current?.setWallSideBond(side, {
        ...cloneBondPattern(builtIn.pattern),
        selectionKey,
        selectionName: builtIn.name,
      });
      return;
    }
    const shared = sharedBonds.find((pattern) => `shared:${pattern.id}` === selectionKey);
    if (!shared?.bond_pattern?.bricks?.length) {
      engineRef.current?.setWallSideBond(side, {
        ...cloneBondPattern(DEFAULT_BOND_PATTERN),
        selectionKey: 'builtin:running',
        selectionName: 'Normal running bond',
      });
      setSharedBondError('That pattern could not be read. Normal running bond was restored for this wall.');
      return;
    }
    engineRef.current?.setWallSideBond(side, {
      ...cloneBondPattern(shared.bond_pattern),
      scale: 1,
      selectionKey,
      selectionName: shared.name,
    });
  }

  function scaleWallSideBond(side, value) {
    const bond = wallSideBond(side);
    if (Number(bond.version) < 2) return;
    engineRef.current?.setWallSideBond(side, {
      ...cloneBondPattern(bond),
      scale: Math.max(0.25, Math.min(4, Number(value) || 1)),
    });
  }

  function scaleImportedPattern(value) {
    const scale = Math.max(0.25, Math.min(4, Number(value) || 1));
    setImportedPatternScale(scale);
    updateWallBrickPattern({
      bondPattern: {
        ...walls.brickPattern.bondPattern,
        scale,
      },
    });
  }

  function updateWallBrickPattern(patch) {
    setWalls((value) => ({
      ...value,
      brickPattern: {
        ...value.brickPattern,
        ...patch,
        ...(patch.bondPattern ? { bondPattern: cloneBondPattern(patch.bondPattern) } : {}),
      },
    }));
    engineRef.current?.setWallBrickPattern(patch);
  }

  async function runExport() {
    if (exporting) return;
    setExporting(true);
    setExportProgress(0);
    try {
      await engineRef.current?.exportWithSettings({
        ...exportSettings,
        onProgress: exportSettings.format === 'mp4' ? setExportProgress : undefined,
      });
      setStatus(`${exportSettings.format.toUpperCase()} export created.`);
    } catch (error) {
      const message = error.message || 'Export failed.';
      setStatus(message);
      window.alert(message);
    } finally {
      setExporting(false);
      setExportProgress(0);
    }
  }

  function startExportPan(event) {
    event.currentTarget.setPointerCapture(event.pointerId);
    exportPanRef.current = { x: event.clientX, y: event.clientY, panX: exportSettings.panX, panY: exportSettings.panY };
  }

  function moveExportPan(event) {
    const drag = exportPanRef.current;
    if (!drag) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    setExportSettings((value) => ({ ...value, panX: drag.panX - (event.clientX - drag.x) / Math.max(1, bounds.width), panY: drag.panY + (event.clientY - drag.y) / Math.max(1, bounds.height) }));
  }

  useEffect(() => { engineRef.current?.setMode(mode); }, [mode]);
  useEffect(() => { engineRef.current?.setSnap({ enabled: snapEnabled, gridSize, snapDistance }); }, [snapEnabled, gridSize, snapDistance]);
  useEffect(() => { engineRef.current?.setConnectorsVisible(connectorsVisible); }, [connectorsVisible]);
  useEffect(() => { engineRef.current?.setShadowsEnabled(shadowsEnabled); }, [shadowsEnabled]);
  useEffect(() => {
    const closeMenu = () => setContextMenu(null);
    window.addEventListener('pointerdown', closeMenu);
    return () => window.removeEventListener('pointerdown', closeMenu);
  }, []);

  async function openProject(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const project = JSON.parse(await file.text());
      await applyLoadedProject(project, file.name);
      setActiveLibraryAssetId(null);
    } catch (error) {
      setStatus(error.message || 'This project could not be opened.');
    }
  }

  async function applyLoadedProject(project, label) {
    const items = await engineRef.current.loadProject(project);
    setLibrary(items);
    setCollapsedSections({ ...LOADED_MODEL_SECTIONS });
    const notice = engineRef.current.lastProjectLoadNotice;
    setStatus(notice ? `Opened ${label}. ${notice}` : `Opened ${label}.`);
  }

  async function loadSharedAssemblies() {
    if (!bondAccount) return;
    setLibraryBusy(true);
    try {
      const assets = await listLibraryAssets(supabase, { assetType: 'muqarnas_assembly' });
      setSharedAssemblies(assets);
      if (!activeLibraryAssetId && assets[0]) {
        setActiveLibraryAssetId(assets[0].id);
        setLibraryName(assets[0].name);
      }
      setLibraryMessage('');
    } catch (error) {
      setLibraryMessage(error.message);
    } finally {
      setLibraryBusy(false);
    }
  }

  async function saveAssemblyToLibrary() {
    if (!bondAccount) {
      setLibraryMessage('Connect your Girih Studio account before using the shared library.');
      return;
    }
    if (!stats.modules) {
      setLibraryMessage('Place at least one module before saving.');
      return;
    }
    setLibraryBusy(true);
    try {
      const payload = engineRef.current.serializeProject();
      const previewPng = engineRef.current.renderAssemblyTopThumbnail(payload, 440, 240, true);
      const result = await saveLibraryAsset(supabase, {
        assetId: activeLibraryAssetId,
        assetType: 'muqarnas_assembly',
        sourceApp: 'muqarnas',
        name: libraryName,
        payload,
        artifacts: previewPng ? { preview_png: previewPng } : {},
        metadata: { editorSchemaVersion: payload.version, moduleCount: payload.instances.length, previewView: 'top', previewStyle: 'fill-outline-v1' },
      });
      setActiveLibraryAssetId(result.assetId);
      await loadSharedAssemblies();
      if (libraryEditReturnTo) {
        const returnUrl = new URL(libraryEditReturnTo, window.location.origin);
        returnUrl.searchParams.set('libraryUpdated', '1');
        returnUrl.searchParams.set('assetId', result.assetId);
        returnUrl.searchParams.set('sourceApp', 'muqarnas');
        window.location.href = returnUrl.toString();
        return;
      }
      setLibraryMessage(result.updated
        ? `Version ${result.versionNumber} saved.`
        : 'Assembly saved to your shared library.');
    } catch (error) {
      setLibraryMessage(error.message);
    } finally {
      setLibraryBusy(false);
    }
  }

  async function openSharedAssembly(asset) {
    const payload = asset.currentVersion?.payload;
    if (!payload) {
      setLibraryMessage('This assembly has no readable version.');
      return;
    }
    setLibraryBusy(true);
    try {
      await applyLoadedProject(payload, `${asset.name} · version ${asset.currentVersion.version_number}`);
      setActiveLibraryAssetId(asset.id);
      setLibraryName(asset.name);
      setLibraryMessage('');
      setLibraryDialogOpen(false);
    } catch (error) {
      setLibraryMessage(error.message);
    } finally {
      setLibraryBusy(false);
    }
  }

  async function loadLibraryVersions(assetId) {
    if (!assetId || !bondAccount) {
      setLibraryVersions([]);
      setSelectedLibraryVersionId('');
      return;
    }
    try {
      const versions = await listLibraryAssetVersions(supabase, assetId);
      setLibraryVersions(versions);
      const asset = sharedAssemblies.find((item) => item.id === assetId);
      setSelectedLibraryVersionId((current) => (
        versions.some((version) => version.id === current)
          ? current
          : asset?.current_version_id || versions[0]?.id || ''
      ));
    } catch (error) {
      setLibraryMessage(error.message);
    }
  }

  async function renameLibraryAsset() {
    if (!activeLibraryAssetId) return;
    setLibraryBusy(true);
    try {
      await updateLibraryAssetMetadata(supabase, activeLibraryAssetId, libraryEdit);
      setLibraryName(libraryEdit.name);
      await loadSharedAssemblies();
      setLibraryMessage('Assembly renamed.');
    } catch (error) {
      setLibraryMessage(error.message);
    } finally {
      setLibraryBusy(false);
    }
  }

  async function archiveSharedAssembly(asset) {
    if (!asset) return;
    if (!window.confirm(`Archive "${asset.name}" from the Muqarnas library?`)) return;
    setLibraryBusy(true);
    try {
      await archiveLibraryAsset(supabase, asset.id);
      setActiveLibraryAssetId(null);
      await loadSharedAssemblies();
      setLibraryMessage('Assembly archived.');
    } catch (error) {
      setLibraryMessage(error.message);
    } finally {
      setLibraryBusy(false);
    }
  }

  async function makeLibraryVersionCurrent(asset, version) {
    if (!asset || !version) return;
    setLibraryBusy(true);
    try {
      await setCurrentLibraryAssetVersion(supabase, asset.id, version.id);
      await loadSharedAssemblies();
      setSelectedLibraryVersionId(version.id);
      setLibraryMessage(`Version ${version.version_number} is now current.`);
    } catch (error) {
      setLibraryMessage(error.message);
    } finally {
      setLibraryBusy(false);
    }
  }

  function addModule(id) {
    engineRef.current?.addInstance(id);
  }

  function toggleInspectorSection(section) {
    setCollapsedSections((value) => ({ ...value, [section]: !value[section] }));
  }

  function startInspectorResize(event) {
    event.currentTarget.setPointerCapture(event.pointerId);
    inspectorResizeRef.current = { x: event.clientX, width: inspectorWidth };
  }

  function resizeInspector(event) {
    const resize = inspectorResizeRef.current;
    if (!resize) return;
    setInspectorWidth(Math.max(260, Math.min(620, resize.width + resize.x - event.clientX)));
  }

  function startModuleDrag(event, moduleId) {
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData('application/x-muqarnas-module', moduleId);
    event.dataTransfer.setData('text/plain', moduleId);
    setStatus(`Drop the module onto the stage to place it on ${levels.find((level) => level.id === activeLevelId)?.name}.`);
  }

  function dropModuleOnStage(event) {
    event.preventDefault();
    const moduleId = event.dataTransfer.getData('application/x-muqarnas-module') || event.dataTransfer.getData('text/plain');
    setStageDragActive(false);
    if (moduleId) engineRef.current?.dropLibraryInstance(moduleId, event.clientX, event.clientY, activeLevelId);
  }

  function newProject() {
    if (stats.modules && !window.confirm('Clear the current Muqarnas assembly?')) return;
    engineRef.current?.clearAssembly({ resetWalls: true });
    engineRef.current?.setNightLightGuidesVisible(false);
    setCollapsedSections({ ...NEW_MODEL_SECTIONS });
    setActiveLibraryAssetId(null);
    setLibraryName('Muqarnas assembly');
    setStatus('New assembly ready.');
  }

  function commitLevels(nextLevels, nextActiveLevelId = activeLevelId) {
    setLevels(nextLevels);
    setActiveLevelId(nextActiveLevelId);
    engineRef.current?.setLevels(nextLevels, nextActiveLevelId, false);
  }

  function updateLevel(levelId, patch) {
    const nextLevels = levels.map((level) => level.id === levelId ? { ...level, ...patch } : level);
    commitLevels(nextLevels);
  }

  function addLevel() {
    const maxHeight = Math.max(0, ...levels.map((level) => Number(level.height) || 0));
    const level = { id: crypto.randomUUID(), name: `Tier ${levels.length + 1}`, height: Number((maxHeight + 0.45).toFixed(3)) };
    commitLevels([...levels, level], level.id);
    engineRef.current?.setActiveLevel(level.id);
  }

  function removeLevel(levelId) {
    if (levels.length === 1) return;
    const nextLevels = levels.filter((level) => level.id !== levelId);
    const nextActiveLevelId = activeLevelId === levelId ? nextLevels[0].id : activeLevelId;
    commitLevels(nextLevels, nextActiveLevelId);
  }

  function activateLevel(levelId) {
    setActiveLevelId(levelId);
    engineRef.current?.setActiveLevel(levelId);
  }

  function shiftAllTiers() {
    const offset = Number(tierShift);
    if (!Number.isFinite(offset) || Math.abs(offset) < 1e-9) {
      setStatus('Enter a non-zero tier shift in meters.');
      return;
    }
    const lowestHeight = Math.min(...levels.map((level) => Number(level.height) || 0));
    if (lowestHeight + offset < 0) {
      setStatus(`The lowest tier cannot move below 0 m. Maximum downward shift is ${lowestHeight.toFixed(3)} m.`);
      return;
    }
    const nextLevels = levels.map((level) => ({ ...level, height: Number((Number(level.height) + offset).toFixed(3)) }));
    commitLevels(nextLevels);
    setTierShift('0');
    setStatus(`All tiers shifted ${offset > 0 ? 'up' : 'down'} by ${Math.abs(offset).toFixed(3)} m.`);
  }

  const transform = selected?.transform;
  const sortedLevels = [...levels].sort((first, second) => Number(second.height) - Number(first.height));
  const selectedNightLight = nightLighting.lights.find((light) => light.id === nightLighting.selectedId) || null;
  const managedLibraryAsset = sharedAssemblies.find((asset) => asset.id === activeLibraryAssetId) || sharedAssemblies[0] || null;
  const selectedLibraryVersion = libraryVersions.find((version) => version.id === selectedLibraryVersionId) || managedLibraryAsset?.currentVersion || null;

  useEffect(() => {
    if (!managedLibraryAsset) {
      setLibraryEdit({ name: '', description: '' });
      setLibraryVersions([]);
      setSelectedLibraryVersionId('');
      return;
    }
    setLibraryEdit({ name: managedLibraryAsset.name || '', description: managedLibraryAsset.description || '' });
    loadLibraryVersions(managedLibraryAsset.id);
  }, [managedLibraryAsset?.id]);

  if (!authReady) return <main className="app-auth-gate girih-theme-muqarnas"><span className="auth-spinner" /><p>Checking your Girih Studio account...</p></main>;
  if (!bondAccount) return <main className="app-auth-gate girih-theme-muqarnas"><img src="https://girihstudio.com/landing/brand/girih-logo-color.png" alt="" /><girih-app-icon app="muqarnas"></girih-app-icon><small>Muqarnas App</small><h1>Sign in to continue</h1><p>Use one Girih Studio account across every design app. Muqarnas is free during beta.</p><button type="button" className="button primary" onClick={connectBondAccount}><LogIn size={16} /> Sign in</button></main>;

  return (
    <div className="app-shell girih-theme-muqarnas">
      <header className="app-header girih-product-header">
        <div className="header-brand girih-header-start">
          <a href="https://girihstudio.com" className="home-link" aria-label="Back to Girih Studio">
            <img src="https://girihstudio.com/landing/brand/girih-logo-color.png" alt="" />
            <span>Girih Studio</span>
          </a>
          <div className="header-divider" />
          <div className="product-name girih-product-identity"><girih-app-icon app="muqarnas"></girih-app-icon><strong>Muqarnas App</strong><span>3D assembly</span></div>
        </div>
        <div className="header-actions girih-header-tools">
          <button type="button" className="button" onClick={newProject}><Plus size={15} /> New</button>
          <button type="button" className="button" disabled={!history.canUndo} onClick={() => engineRef.current?.undo()}><Undo2 size={15} /> Undo</button>
          <button type="button" className="button" disabled={!history.canRedo} onClick={() => engineRef.current?.redo()}><Redo2 size={15} /> Redo</button>
          <button type="button" className="button" onClick={() => openProjectRef.current?.click()}><Upload size={15} /> Import</button>
          <button type="button" className="button" disabled={!stats.modules} onClick={openExportDialog}><Download size={15} /> Export</button>
          <button type="button" className="button primary" disabled={libraryBusy || !stats.modules} onClick={saveAssemblyToLibrary}><Save size={15} /> {libraryBusy ? 'Saving...' : 'Save project'}</button>
        </div>
        <div className="header-actions girih-header-end">
          <a className="button account-button" href="https://girihstudio.com/training?app=muqarnas"><GraduationCap size={15} /> Academy</a>
          <button type="button" className="button" onClick={() => setLibraryDialogOpen(true)}><FolderOpen size={15} /> Library</button>
          {bondAccount ? <a className="button account-button" href="https://girihstudio.com/profile" title={bondAccount.email}><User size={15} /> Profile</a> : <button type="button" className="button" onClick={connectBondAccount}><LogIn size={15} /> Sign in</button>}
          <girih-app-switcher current-app="muqarnas" compact></girih-app-switcher>
        </div>
      </header>

      {libraryDialogOpen && (
        <div className="library-dialog-backdrop" role="presentation" onPointerDown={() => setLibraryDialogOpen(false)}>
          <section className="library-dialog" role="dialog" aria-modal="true" aria-labelledby="muqarnas-library-title" onPointerDown={(event) => event.stopPropagation()}>
            <div className="library-dialog-heading">
              <div><small>Girih Studio</small><h2 id="muqarnas-library-title">Muqarnas library</h2></div>
              <button type="button" className="button" onClick={() => setLibraryDialogOpen(false)}>Close</button>
            </div>
            {!bondAccount ? (
              <p>Connect your Girih Studio account in the Walls section before using the shared library.</p>
            ) : (
              <div className="library-dialog-columns">
                <section className="library-list-column">
                  <label><span>Assembly name</span><input value={libraryName} maxLength={120} onChange={(event) => setLibraryName(event.target.value)} /></label>
                  <button type="button" className="button primary" disabled={libraryBusy || !stats.modules} onClick={saveAssemblyToLibrary}>
                    <Save size={15} /> {activeLibraryAssetId ? 'Save new version' : 'Save to library'}
                  </button>
                  <div className="library-dialog-list">
                    {sharedAssemblies.map((asset) => (
                      <button type="button" className={asset.id === managedLibraryAsset?.id ? 'active' : ''} key={asset.id} onClick={() => { setActiveLibraryAssetId(asset.id); setLibraryName(asset.name); }} disabled={libraryBusy}>
                        <span><strong>{asset.name}</strong><small>Version {asset.currentVersion?.version_number || '—'}{asset.owned ? '' : ' · shared'}</small></span>
                        <FolderOpen size={15} />
                      </button>
                    ))}
                    {!libraryBusy && !sharedAssemblies.length && <p>No Muqarnas assemblies have been saved yet.</p>}
                  </div>
                </section>
                {managedLibraryAsset ? (
                  <section className="library-manager-card">
                    <div className="library-manager-preview">
                      <MuqarnasLibraryPreview asset={managedLibraryAsset} version={selectedLibraryVersion} engine={engineRef.current} />
                      <strong>{managedLibraryAsset.name}</strong>
                      <small>{managedLibraryAsset.currentVersion?.payload?.instances?.length || 0} modules · current version {managedLibraryAsset.currentVersion?.version_number || '—'}</small>
                    </div>
                    <label><span>Rename item</span><input value={libraryEdit.name} maxLength={120} onChange={(event) => setLibraryEdit({ ...libraryEdit, name: event.target.value })} /></label>
                    <label><span>Description</span><input value={libraryEdit.description} maxLength={2000} onChange={(event) => setLibraryEdit({ ...libraryEdit, description: event.target.value })} /></label>
                    <div className="library-manager-actions">
                      <button type="button" className="button primary" disabled={libraryBusy} onClick={() => openSharedAssembly(managedLibraryAsset)}>Open selected</button>
                      <button type="button" className="button" disabled={libraryBusy} onClick={renameLibraryAsset}>Rename</button>
                      <button type="button" className="button danger" disabled={libraryBusy} onClick={() => archiveSharedAssembly(managedLibraryAsset)}>Archive</button>
                    </div>
                    <div className="library-version-list">
                      <strong>Versions</strong>
                      {libraryVersions.map((version) => {
                        const current = version.id === managedLibraryAsset.current_version_id;
                        return (
                          <button type="button" key={version.id} className={version.id === selectedLibraryVersion?.id ? 'active' : ''} onClick={() => setSelectedLibraryVersionId(version.id)}>
                            <span>Version {version.version_number}{current ? ' · current' : ''}</span>
                            {!current && <em onClick={(event) => { event.stopPropagation(); makeLibraryVersionCurrent(managedLibraryAsset, version); }}>Make current</em>}
                          </button>
                        );
                      })}
                      {!libraryVersions.length && <p>No saved versions found.</p>}
                    </div>
                  </section>
                ) : <section className="library-manager-card library-empty-detail"><FolderOpen size={28} /><span>Select an assembly to preview and manage it.</span></section>}
              </div>
            )}
            {libraryMessage && <p className="library-dialog-message">{libraryMessage}</p>}
          </section>
        </div>
      )}

      <main className="workspace" style={{ '--inspector-width': `${inspectorWidth}px` }}>
        <aside className="panel library-panel">
          <div className="module-list" aria-label="Module library">
            {library.map((item) => (
              <button
                type="button"
                className="module-card"
                key={item.id}
                draggable
                title={`${item.name} · Click to add or drag onto the stage`}
                aria-label={`Add ${item.name} to the stage`}
                onClick={() => addModule(item.id)}
                onDragStart={(event) => startModuleDrag(event, item.id)}
                onDragEnd={() => setStageDragActive(false)}
              >
                <div className="module-icon">
                  {item.thumbnail
                    ? <img src={item.thumbnail} alt={`${item.name} top view`} draggable="false" />
                    : <Box size={22} />}
                </div>
              </button>
            ))}
          </div>
        </aside>

        <section
          className={`viewport-wrap ${stageDragActive ? 'module-drag-active' : ''}`}
          onDragEnter={(event) => { event.preventDefault(); setStageDragActive(true); }}
          onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; }}
          onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setStageDragActive(false); }}
          onDrop={dropModuleOnStage}
        >
          <div className="viewport-toolbar" aria-label="Transform tools">
            <button className={mode === 'select' ? 'active' : ''} onClick={() => setMode('select')} title="Select (Q)"><MousePointer2 size={17} /></button>
            <button className={mode === 'box-select' ? 'active' : ''} onClick={() => setMode('box-select')} title="Box select multiple modules"><span className="box-select-icon">□</span></button>
            <button className={mode === 'translate' ? 'active' : ''} onClick={() => setMode('translate')} title="Free move on tier (W)"><Move3D size={17} /></button>
            <button className={mode === 'rotate' ? 'active' : ''} onClick={() => setMode('rotate')} title="Rotate upright around tier axis (E)"><Rotate3D size={17} /></button>
            <button className={mode === 'scale' ? 'active' : ''} onClick={() => setMode('scale')} title="Scale (R)"><Scaling size={17} /></button>
            <button
              className={mode === 'slice' ? 'active' : ''}
              onClick={() => {
                engineRef.current?.setView('top');
                setMode(mode === 'slice' ? 'translate' : 'slice');
              }}
              title="Slice modules in Top view through two footprint corners"
            ><Scissors size={17} /></button>
            <i />
            <button className="stage-center-button" onClick={() => engineRef.current?.centerModelOnStage()} title="Move the complete model to the center of the stage"><Focus size={17} /><span>Center</span></button>
            <button onClick={() => engineRef.current?.setView('top')} title="Top view">Top</button>
            <button onClick={() => engineRef.current?.setView('front')} title="Front view">Front</button>
            <button className={walkView.enabled ? 'active' : ''} onClick={() => engineRef.current?.setWalkEnabled(!walkView.enabled)} title="First-person walk view"><Eye size={15} /> Walk</button>
          </div>
          <div className="viewport" ref={viewportRef} />
          {mode === 'slice' && <div className="slice-view-help">Slice · Click two highlighted module corners to cut through the active tier · Esc cancels</div>}
          {walkView.enabled && <div className="walk-view-controls">
            <strong>Walk view</strong>
            <span>Click-drag to look · Ground locked · W A S D to walk · Shift for faster movement</span>
            <label><span>Eye level</span><input type="range" min="0.35" max="8" step="0.05" value={walkView.eyeLevel} onChange={(event) => engineRef.current?.setWalkEyeLevel(Number(event.target.value))} /><output>{walkView.eyeLevel.toFixed(2)} m</output></label>
            <div><button type="button" onClick={() => engineRef.current?.setWalkEyeLevel(walkView.eyeLevel - 0.1)}>Lower</button><button type="button" onClick={() => engineRef.current?.setWalkEyeLevel(walkView.eyeLevel + 0.1)}>Raise</button><button type="button" onClick={() => engineRef.current?.setWalkEnabled(false)}>Exit</button></div>
          </div>}
          {stageDragActive && <div className="stage-drop-hint"><Plus size={22} /><strong>Place on {levels.find((level) => level.id === activeLevelId)?.name}</strong><span>Height {Number(levels.find((level) => level.id === activeLevelId)?.height || 0).toFixed(2)} m</span></div>}
          {!stats.modules && (
            <div className="empty-state">
              <div className="empty-mark"><Boxes size={34} /></div>
              <span className="eyebrow">Modular construction</span>
              <h2>Build a complete muqarnas in 3D.</h2>
              <p>Place one of the nine included cells, then duplicate, rotate, and snap components into tiers.</p>
            </div>
          )}
          <div className="viewport-stats"><span>40 × 40 m ground</span><span>{stats.modules} modules</span><span>{stats.triangles.toLocaleString()} triangles</span></div>
          <div className="stage-view-badge">{walkView.enabled ? 'Walk view' : VIEW_LABELS[viewLayout.main]}</div>
        </section>

        <aside className="panel inspector-panel">
          <div
            className="inspector-resize-handle"
            role="separator"
            aria-label="Resize inspector panel"
            aria-orientation="vertical"
            onPointerDown={startInspectorResize}
            onPointerMove={resizeInspector}
            onPointerUp={() => { inspectorResizeRef.current = null; }}
            onPointerCancel={() => { inspectorResizeRef.current = null; }}
          />
          <div className="inspector-fixed">
          <figure className={`overview-view-card ${overviewView}-view-card`} aria-label={`${overviewView === 'top' ? 'Top' : 'Front'} view of the complete Muqarnas model`}>
            <div className="overview-view-toolbar" aria-label="Muqarnas model overview view">
              <button type="button" className={overviewView === 'top' ? 'active' : ''} onClick={() => { setOverviewView('top'); engineRef.current?.setOverviewView('top'); }}><Grid3X3 size={13} /> Top</button>
              <button type="button" className={overviewView === 'front' ? 'active' : ''} onClick={() => { setOverviewView('front'); engineRef.current?.setOverviewView('front'); }}><Layers3 size={13} /> Front</button>
            </div>
            <div className="overview-viewport" ref={overviewViewportRef} />
            <figcaption><ViewLabel view={overviewView} /><small>Muqarnas model</small></figcaption>
          </figure>

          <div className={`level-section inspector-section ${collapsedSections.tiers ? 'collapsed' : ''}`}>
            <div className="section-title level-section-title"><Layers3 size={16} /><strong>Tiers</strong><span className="section-heading-actions"><button type="button" onClick={addLevel}><Plus size={13} /> Add</button><button type="button" className="section-collapse" title={collapsedSections.tiers ? 'Expand Tiers' : 'Collapse Tiers'} onClick={() => toggleInspectorSection('tiers')}>{collapsedSections.tiers ? <Plus size={13} /> : <Minus size={13} />}</button></span></div>
            {!collapsedSections.tiers && <div className="section-content tier-section-content">
            <div className="tier-shift-control"><label><span>Shift all tiers by</span><div><input type="number" value={tierShift} step="0.01" onChange={(event) => setTierShift(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') shiftAllTiers(); }} /><b>m</b></div></label><button type="button" onClick={shiftAllTiers}>Apply</button></div>
            <div className="level-list">
              {sortedLevels.map((level, index) => (
                <article
                  className={`level-row ${activeLevelId === level.id ? 'active' : ''}`}
                  key={level.id}
                  onPointerDown={(event) => { if (!event.target.closest('.level-remove')) activateLevel(level.id); }}
                >
                  <button className="level-activate" type="button" title="Use for new modules" onClick={() => activateLevel(level.id)}>
                    <i style={{ background: levelRed(index, sortedLevels.length) }} />
                  </button>
                  <label><span>Name</span><input type="text" value={level.name} maxLength={40} onChange={(event) => updateLevel(level.id, { name: event.target.value })} /></label>
                  <label className="level-height"><span>Height</span><input type="number" value={level.height} step="0.01" onChange={(event) => updateLevel(level.id, { height: Number(event.target.value) || 0 })} /><b>m</b></label>
                  <button className="level-remove" type="button" title="Remove tier" disabled={levels.length === 1} onClick={() => removeLevel(level.id)}><Trash2 size={13} /></button>
                </article>
              ))}
            </div>
            <p className="level-help">The active tier receives new modules. Use the larger view above to inspect the complete Muqarnas model from Top or Front.</p>
            </div>}
          </div>
          </div>

          <div className="inspector-scroll">
          <section className={`inspector-section stage-section ${collapsedSections.stage ? 'collapsed' : ''}`}>
          <div className="section-title collapsible-section-title"><Box size={16} /><strong>Stage</strong><button type="button" className="section-collapse" onClick={() => toggleInspectorSection('stage')}>{collapsedSections.stage ? <Plus size={13} /> : <Minus size={13} />}</button></div>
          {!collapsedSections.stage && <div className="section-content">
          <div className="stage-selection-block">
          <strong className="stage-subheading">{selected?.name || 'Selection'}</strong>
          {selected ? (
            <>
              <div className="action-row">
                <button className="button" onClick={() => engineRef.current?.duplicateSelected()}><Copy size={15} /> Duplicate</button>
                <button className="icon-button danger" title="Delete" onClick={() => engineRef.current?.deleteSelected()}><Trash2 size={16} /></button>
              </div>
              <div className="mirror-row">
                <button className="button" onClick={() => engineRef.current?.mirrorSelected('x')}>Mirror X</button>
                <button className="button" onClick={() => engineRef.current?.mirrorSelected('z')}>Mirror Z</button>
              </div>
              {selected.selectionCount > 1 ? (
                <div className="group-tier-note"><Layers3 size={15} /><span><strong>All assigned tiers</strong><small>Group transforms preserve every module’s current tier.</small></span></div>
              ) : (
                <label className="module-level-select"><span>Module tier</span><select value={selected.levelId} onChange={(event) => engineRef.current?.assignSelectedToLevel(event.target.value)}>{sortedLevels.map((level) => <option value={level.id} key={level.id}>{level.name} · {Number(level.height).toFixed(2)} m</option>)}</select></label>
              )}
              {selected.selectionCount > 1 && <div className="group-transform-tools"><button className={mode === 'translate' ? 'active' : ''} onClick={() => setMode('translate')}><Move3D size={14} /> Move all</button><button className={mode === 'rotate' ? 'active' : ''} onClick={() => setMode('rotate')}><Rotate3D size={14} /> Rotate all</button><button className={mode === 'scale' ? 'active' : ''} onClick={() => setMode('scale')}><Scaling size={14} /> Scale all</button></div>}
              <TransformReadout label="Position" values={transform.position} suffix="" />
              <TransformReadout label="Rotation" values={transform.rotation} suffix="°" />
              <TransformReadout label="Scale" values={transform.scale} suffix="" />
            </>
          ) : <p className="muted-copy">Select a module in the viewport to inspect and transform it.</p>}
          </div>
          <p className="wall-help">Modules and walls use a clean, texture-free material on the stage. Material choices are available in Export.</p>
          <div className="edge-style-controls">
            <label className="edge-color-control"><span>All modules color</span><input type="color" value={moduleColor} onChange={(event) => updateAllModuleColor(event.target.value)} /></label>
            <label className="toggle-row"><span>Stage shadows<small>Ground and object-to-object shadows</small></span><input type="checkbox" checked={shadowsEnabled} onChange={(event) => { const enabled = event.target.checked; setShadowsEnabled(enabled); setExportSettings((value) => ({ ...value, shadows: enabled })); }} /></label>
            <label className="toggle-row"><span>Module edge lines<small>Main stage and rendered exports only</small></span><input type="checkbox" checked={edgeSettings.enabled} onChange={(event) => engineRef.current?.setEdgeSettings({ enabled: event.target.checked })} /></label>
            {edgeSettings.enabled && <>
              <label className="toggle-row"><span>Straight vertical lines<small>Turn off to emphasize curved module edges</small></span><input type="checkbox" checked={edgeSettings.verticalLines !== false} onChange={(event) => engineRef.current?.setEdgeSettings({ verticalLines: event.target.checked })} /></label>
              <RangeControl label="Edge thickness" value={edgeSettings.thickness} min={0.5} max={6} step={0.25} suffix=" px" onChange={(value) => engineRef.current?.setEdgeSettings({ thickness: value })} />
              <label className="edge-color-control"><span>Edge color</span><input type="color" value={edgeSettings.color} onChange={(event) => engineRef.current?.setEdgeSettings({ color: event.target.value })} /></label>
            </>}
            <div className="assembly-animation-control">
              <label><span>Assembly animation</span><div><input type="number" min="3" max="120" step="1" value={assemblyDuration} onChange={(event) => setAssemblyDuration(event.target.value)} /><b>sec</b></div></label>
              <button type="button" className={`button ${assemblyPlaying ? '' : 'primary'}`} disabled={!stats.modules} onClick={() => assemblyPlaying ? engineRef.current?.stopAssemblyAnimation() : engineRef.current?.playAssemblyAnimation(Number(assemblyDuration) || 15)}>
                {assemblyPlaying ? <><Square size={13} /> Finish</> : <><Play size={13} /> Play assembly</>}
              </button>
            </div>
          </div>
          </div>}
          </section>

          <section className={`inspector-section night-light-section ${collapsedSections.night ? 'collapsed' : ''}`}>
          <div className="section-title collapsible-section-title"><Lightbulb size={16} /><strong>Lights</strong><button type="button" className="section-collapse" onClick={() => toggleInspectorSection('night')}>{collapsedSections.night ? <Plus size={13} /> : <Minus size={13} />}</button></div>
          {!collapsedSections.night && <div className="section-content">
            <p className="wall-help">Place spotlights inside the model, aim each red target at a surface, then use Night rendering in Export.</p>
            <label className="toggle-row"><span>Night stage preview<small>Turns off daylight and uses only these spotlights</small></span><input type="checkbox" checked={nightLighting.preview} onChange={(event) => engineRef.current?.setNightPreview(event.target.checked)} /></label>
            <label className="toggle-row"><span>Placement guides<small>Light cone, source point, and red aiming target</small></span><input type="checkbox" checked={nightLighting.guides} onChange={(event) => engineRef.current?.setNightLightGuidesVisible(event.target.checked)} /></label>
            <div className="night-light-actions">
              <button type="button" className="button primary" disabled={!stats.modules} onClick={() => engineRef.current?.addNightLight()}><Plus size={13} /> Add spotlight</button>
              <button type="button" className="icon-button danger" disabled={!selectedNightLight} title="Remove selected spotlight" onClick={() => engineRef.current?.removeNightLight(nightLighting.selectedId)}><Trash2 size={14} /></button>
            </div>
            {!!nightLighting.lights.length && <label className="night-light-select"><span>Selected spotlight</span><select value={nightLighting.selectedId || ''} onChange={(event) => engineRef.current?.selectNightLight(event.target.value)}>{nightLighting.lights.map((light) => <option value={light.id} key={light.id}>{light.name}</option>)}</select></label>}
            {selectedNightLight && <div className="night-light-editor">
              <label className="toggle-row"><span>Light enabled</span><input type="checkbox" checked={selectedNightLight.enabled} onChange={(event) => engineRef.current?.updateNightLight(selectedNightLight.id, { enabled: event.target.checked })} /></label>
              <label className="edge-color-control"><span>Light color</span><input type="color" value={selectedNightLight.color} onChange={(event) => engineRef.current?.updateNightLight(selectedNightLight.id, { color: event.target.value })} /></label>
              <div className="night-placement-shortcuts"><button type="button" className="button" onClick={() => engineRef.current?.placeNightLightAtCamera(selectedNightLight.id)}>Use camera position</button><button type="button" className="button" onClick={() => engineRef.current?.aimNightLightAtModelCenter(selectedNightLight.id)}>Aim at model center</button></div>
              <strong className="night-field-title">Light position · metres</strong>
              <div className="night-vector-grid">{['X', 'Y', 'Z'].map((axis, index) => <label key={`position-${axis}`}><span>{axis}</span><input type="number" min="-20" max="20" step="0.05" value={selectedNightLight.position[index]} onChange={(event) => updateNightLightVector('position', index, event.target.value)} /></label>)}</div>
              <strong className="night-field-title">Aim target · metres</strong>
              <div className="night-vector-grid">{['X', 'Y', 'Z'].map((axis, index) => <label key={`target-${axis}`}><span>{axis}</span><input type="number" min="-20" max="20" step="0.05" value={selectedNightLight.target[index]} onChange={(event) => updateNightLightVector('target', index, event.target.value)} /></label>)}</div>
              <RangeControl label="Intensity" value={selectedNightLight.intensity} min={1} max={500} step={1} suffix=" cd" onChange={(value) => engineRef.current?.updateNightLight(selectedNightLight.id, { intensity: value })} />
              <RangeControl label="Beam angle" value={selectedNightLight.angle} min={5} max={85} step={1} suffix="°" onChange={(value) => engineRef.current?.updateNightLight(selectedNightLight.id, { angle: value })} />
              <RangeControl label="Beam softness" value={selectedNightLight.penumbra} min={0} max={1} step={0.05} suffix="" onChange={(value) => engineRef.current?.updateNightLight(selectedNightLight.id, { penumbra: value })} />
              <RangeControl label="Light range" value={selectedNightLight.distance} min={0.5} max={40} step={0.5} suffix=" m" onChange={(value) => engineRef.current?.updateNightLight(selectedNightLight.id, { distance: value })} />
            </div>}
          </div>}
          </section>

          <section className={`inspector-section wall-section ${collapsedSections.walls ? 'collapsed' : ''}`}>
          <div className="section-title collapsible-section-title"><Box size={16} /><strong>Walls</strong><button type="button" className="section-collapse" onClick={() => toggleInspectorSection('walls')}>{collapsedSections.walls ? <Plus size={13} /> : <Minus size={13} />}</button></div>
          {!collapsedSections.walls && <div className="section-content">
          <label className="toggle-row"><span>Frame complete model<small>0.40 m thick · ground to lowest tier</small></span><input type="checkbox" checked={walls.enabled} onChange={(event) => engineRef.current?.setWallsEnabled(event.target.checked)} /></label>
          {walls.enabled && <>
            <label className="edge-color-control"><span>Wall and arch color</span><input type="color" value={walls.color || '#b78b5d'} onChange={(event) => engineRef.current?.setWallColor(event.target.value)} /></label>
            <div className="edge-style-controls">
              <label className="toggle-row"><span>Wall and arch edge lines<small>Main stage and rendered exports</small></span><input type="checkbox" checked={walls.wallEdges?.enabled === true} onChange={(event) => engineRef.current?.setWallEdgeSettings({ enabled: event.target.checked })} /></label>
              {walls.wallEdges?.enabled && <>
                <RangeControl label="Wall edge thickness" value={walls.wallEdges.thickness ?? 2} min={0.5} max={6} step={0.25} suffix=" px" onChange={(value) => engineRef.current?.setWallEdgeSettings({ thickness: value })} />
                <label className="edge-color-control"><span>Wall edge color</span><input type="color" value={walls.wallEdges.color || '#79610c'} onChange={(event) => engineRef.current?.setWallEdgeSettings({ color: event.target.value })} /></label>
              </>}
            </div>
            <div className="pointed-arch-control">
              <label className="opening-toggle"><span>Seamless real-scale brick pattern</span><input type="checkbox" checked={walls.brickPattern?.enabled === true} onChange={(event) => updateWallBrickPattern({ enabled: event.target.checked })} /></label>
              {walls.brickPattern?.enabled && <>
                <p>The selected Bricks App design repeats seamlessly at real scale. Four horizontal grid units use one brick length, preserving the original Bricks pattern proportions.</p>
                <div className="opening-fields">
                  <label><span>Brick length</span><div><input type="number" min="0.05" max="1" step="0.005" value={walls.brickPattern.brickWidth} onChange={(event) => updateWallBrickPattern({ brickWidth: event.target.value })} /><b>m</b></div></label>
                  <label><span>Brick height</span><div><input type="number" min="0.02" max="0.5" step="0.005" value={walls.brickPattern.brickHeight} onChange={(event) => updateWallBrickPattern({ brickHeight: event.target.value })} /><b>m</b></div></label>
                  <label><span>Mortar joint</span><div><input type="number" min="0.001" max="0.05" step="0.001" value={walls.brickPattern.mortar} onChange={(event) => updateWallBrickPattern({ mortar: event.target.value })} /><b>m</b></div></label>
                  <label><span>Mortar color</span><input type="color" value={walls.brickPattern.mortarColor || '#d8c7a3'} onChange={(event) => updateWallBrickPattern({ mortarColor: event.target.value })} /></label>
                </div>
                <div className="shared-bond-library wall-pattern-library">
                  <div>
                    <strong>Wall bonding</strong>
                    <small>{bondAccount ? bondAccount.email : 'Connect the same Girih account used in Bricks App.'}</small>
                  </div>
                  {!bondAccount ? (
                    <button type="button" className="button primary" onClick={connectBondAccount}>Connect account</button>
                  ) : (
                    <div className="wall-bond-account-actions">
                      <button type="button" className="button" disabled={sharedBondLoading} onClick={loadSharedBonds}>Refresh</button>
                      <button type="button" className="button" onClick={() => supabase.auth.signOut()}>Disconnect</button>
                    </div>
                  )}
                  {sharedBondError && <p>{sharedBondError}</p>}
                </div>
                <div className="wall-side-bond-list">
                  {['north', 'south', 'east', 'west'].map((side) => {
                    const sideBond = wallSideBond(side);
                    const savedKey = `saved:${side}`;
                    const selectionKey = sideBond.selectionKey || (Number(sideBond.version) >= 2 ? savedKey : 'builtin:running');
                    const knownSelection = BUILT_IN_BONDS.some((bond) => `builtin:${bond.id}` === selectionKey)
                      || sharedBonds.some((pattern) => `shared:${pattern.id}` === selectionKey);
                    const faceLabel = side === 'north' || side === 'south' ? 'North face' : side === 'east' ? 'West face' : 'East face';
                    return <div className="wall-side-bond-row" key={side}>
                      <label><span>{side} wall · {faceLabel}</span><select value={selectionKey} onChange={(event) => applyWallSideBond(side, event.target.value)}>
                        {!knownSelection && <option value={selectionKey}>{sideBond.selectionName || 'Saved imported bond'}</option>}
                        <optgroup label="Built-in bonds">
                          {BUILT_IN_BONDS.map((bond) => <option value={`builtin:${bond.id}`} key={bond.id}>{bond.name}</option>)}
                        </optgroup>
                        {!!sharedBonds.length && <optgroup label="Bricks App patterns">
                          {sharedBonds.map((pattern) => <option value={`shared:${pattern.id}`} key={pattern.id}>{pattern.name}</option>)}
                        </optgroup>}
                      </select></label>
                      {Number(sideBond.version) >= 2 && <label className="wall-side-scale"><span>Imported scale</span><div><input type="number" min="0.25" max="4" step="0.05" value={Number((sideBond.scale || 1).toFixed(2))} onChange={(event) => scaleWallSideBond(side, event.target.value)} /><b>×</b></div></label>}
                    </div>;
                  })}
                </div>
                <small className="wall-face-note">Imported bonds appear only on North faces for North/South walls, the West face of the East wall, and the East face of the West wall. Every other face uses Normal running bond.</small>
              </>}
            </div>
            <p className="wall-help">Click a wall in the stage to remove that complete side, or use these controls to open and restore sides.</p>
            <p className="wall-help">Wall position: positive values move outward from the model; negative values move inward.</p>
            <div className="wall-side-grid">
              {['north', 'east', 'south', 'west'].map((side) => {
                const isOpen = walls.openSides.includes(side);
                return <div className={`wall-side-control ${isOpen ? 'open' : ''}`} key={side}>
                  <button type="button" onClick={() => engineRef.current?.toggleWallSide(side)}><strong>{side}</strong><span>{isOpen ? 'Open' : 'Closed'}</span></button>
                  <label><span>Position · + out / − in</span><div><input type="number" min="-10" max="10" step="0.05" value={walls.sideOffsets?.[side] ?? 0} onChange={(event) => engineRef.current?.setWallSideOffset(side, event.target.value)} /><b>m</b></div></label>
                  <label><span>Extra height</span><div><input type="number" min="0" max="10" step="0.05" value={walls.extraHeights?.[side] ?? 0} onChange={(event) => engineRef.current?.setWallExtraHeight(side, event.target.value)} /><b>m</b></div></label>
                </div>;
              })}
            </div>
            {!walls.openSides.includes('north') && <div className="pointed-arch-control">
              <div className="south-openings-heading"><strong>North rear wall</strong><small>Independent rear façade dimensions</small></div>
              <p>The north wall stays behind the model and can project beyond both east and west walls. Its height automatically reaches the arch apex.</p>
              <div className="opening-fields">
                <label title="Added to both the east and west ends of the north wall"><span>Outward width · each side</span><div><input type="number" min="0" max="10" step="0.05" value={walls.northWall?.outwardWidth ?? 0} onChange={(event) => engineRef.current?.setNorthWall({ outwardWidth: event.target.value })} /><b>m</b></div></label>
                <label title="Leave empty to use the automatic arch-apex height"><span>Minimum wall height</span><div><input type="number" min="0" max="20" step="0.05" placeholder="Auto to arch" value={walls.northWall?.minHeight ?? ''} onChange={(event) => engineRef.current?.setNorthWall({ minHeight: event.target.value === '' ? null : event.target.value })} /><b>m</b></div></label>
                <label title="Additional north-wall height measured above the pointed arch apex"><span>Above arch top</span><div><input type="number" min="0" max="10" step="0.05" value={walls.northWall?.archTopExtension ?? 0} onChange={(event) => engineRef.current?.setNorthWall({ archTopExtension: event.target.value })} /><b>m</b></div></label>
              </div>
              <label className="opening-toggle"><span>Inset boundary on stage</span><input type="checkbox" checked={walls.northBoundary?.enabled === true} onChange={(event) => engineRef.current?.setNorthBoundary({ enabled: event.target.checked })} /></label>
              {walls.northBoundary?.enabled && <div className="opening-fields">
                <label><span>Recess depth</span><div><input type="number" min="0.01" max="0.38" step="0.01" value={walls.northBoundary.depth ?? 0.2} onChange={(event) => engineRef.current?.setNorthBoundary({ depth: event.target.value })} /><b>m</b></div></label>
                <label><span>Boundary color</span><input type="color" value={walls.northBoundary.color || '#79610c'} onChange={(event) => engineRef.current?.setNorthBoundary({ color: event.target.value })} /></label>
                <label><span>Boundary thickness · {walls.northBoundary.thickness ?? 4} px</span><input type="range" min="0.5" max="6" step="0.25" value={walls.northBoundary.thickness ?? 4} onChange={(event) => engineRef.current?.setNorthBoundary({ thickness: Number(event.target.value) })} /></label>
              </div>}
            </div>}
            {!walls.openSides.includes('south') && <div className="south-openings">
              <div className="south-openings-heading"><strong>South wall openings</strong><small>Position is measured from the wall center</small></div>
              {['door', 'window'].map((type) => {
                const opening = walls.southOpenings?.[type] || {};
                return <div className="opening-control" key={type}>
                  <label className="opening-toggle"><span>{type}</span><input type="checkbox" checked={opening.enabled === true} onChange={(event) => engineRef.current?.setSouthOpening(type, { enabled: event.target.checked })} /></label>
                  {opening.enabled && <div className="opening-fields">
                    <label><span>Width</span><div><input type="number" min="0.1" max="20" step="0.05" value={opening.width} onChange={(event) => engineRef.current?.setSouthOpening(type, { width: event.target.value })} /><b>m</b></div></label>
                    <label><span>Height</span><div><input type="number" min="0.1" max="10" step="0.05" value={opening.height} onChange={(event) => engineRef.current?.setSouthOpening(type, { height: event.target.value })} /><b>m</b></div></label>
                    <label><span>Center position</span><div><input type="number" min="-10" max="10" step="0.05" value={opening.position} onChange={(event) => engineRef.current?.setSouthOpening(type, { position: event.target.value })} /><b>m</b></div></label>
                    {type === 'window' && <label title="Leave empty to place the sill at 80% of the current south wall height"><span>Sill height · auto 80%</span><div><input type="number" min="0" max="10" step="0.05" placeholder="Auto 80%" value={opening.sillHeight ?? ''} onChange={(event) => engineRef.current?.setSouthOpening(type, { sillHeight: event.target.value === '' ? null : event.target.value })} /><b>m</b></div></label>}
                  </div>}
                </div>;
              })}
            </div>}
            {!walls.openSides.includes('south') && <div className="pointed-arch-control">
              <label className="opening-toggle"><span>Pointed arch above south wall</span><input type="checkbox" checked={walls.pointedArch?.enabled === true} onChange={(event) => engineRef.current?.setPointedArch({ enabled: event.target.checked })} /></label>
              {walls.pointedArch?.enabled && <>
                <p>The red point stays on the south-wall centerline at the east/west wall-top height. The green arc center is mirrored automatically.</p>
                <div className="opening-fields">
                  <label title="Horizontal distance of the green point from the centerline; the second point is mirrored"><span>Green center offset</span><div><input type="number" min="0.05" max="20" step="0.05" placeholder="Auto half span" value={walls.pointedArch.greenOffset ?? ''} onChange={(event) => engineRef.current?.setPointedArch({ greenOffset: event.target.value === '' ? null : event.target.value })} /><b>m</b></div></label>
                  <label title="Leave empty to derive the green point below the red spring line"><span>Green center height</span><div><input type="number" min="-10" max="20" step="0.05" placeholder="Auto" value={walls.pointedArch.greenHeight ?? ''} onChange={(event) => engineRef.current?.setPointedArch({ greenHeight: event.target.value === '' ? null : event.target.value })} /><b>m</b></div></label>
                </div>
              </>}
            </div>}
          </>}
          </div>}
          </section>

          <section className={`inspector-section snap-section ${collapsedSections.snapping ? 'collapsed' : ''}`}>
          <div className="section-title collapsible-section-title"><Magnet size={16} /><strong>Snap</strong><button type="button" className="section-collapse" onClick={() => toggleInspectorSection('snapping')}>{collapsedSections.snapping ? <Plus size={13} /> : <Minus size={13} />}</button></div>
          {!collapsedSections.snapping && <div className="section-content">
          <label className="toggle-row"><span>Enable snapping<small>Outer faces and vertical edges</small></span><input type="checkbox" checked={snapEnabled} onChange={(event) => setSnapEnabled(event.target.checked)} /></label>
          <RangeControl label="Grid step" value={gridSize} min={0.005} max={0.25} step={0.005} suffix=" m" onChange={setGridSize} />
          <RangeControl label="Connector reach" value={snapDistance} min={0.01} max={0.3} step={0.01} suffix=" m" onChange={setSnapDistance} />
          <label className="toggle-row"><span>Show connectors<small>Outer face and edge anchors</small></span><input type="checkbox" checked={connectorsVisible} onChange={(event) => setConnectorsVisible(event.target.checked)} /></label>

          <div className="shortcut-card">
            <strong>Keyboard</strong>
            <span><kbd>W</kbd> Move <kbd>E</kbd> Rotate <kbd>R</kbd> Scale</span>
            <span><kbd>↑</kbd> Upper tier <kbd>↓</kbd> Lower tier</span>
            <span><kbd>Ctrl D</kbd> Duplicate <kbd>Del</kbd> Delete</span>
            <span><kbd>Ctrl Z</kbd> Undo <kbd>Ctrl Y</kbd> Redo</span>
            <span>Use <kbd>Box</kbd> to multi-select, then right-click to group.</span>
          </div>
          </div>}
          </section>
          </div>
        </aside>
      </main>

      {exportOpen && (
        <div className="export-modal-backdrop" onPointerDown={() => setExportOpen(false)}>
          <section className="export-modal" onPointerDown={(event) => event.stopPropagation()}>
            <header><div><span className="eyebrow">3D render export</span><h2>Preview and export</h2></div><button className="icon-button" onClick={() => setExportOpen(false)}>×</button></header>
            <div className="export-layout">
              <div className={`export-preview ${exportSettings.format === 'mp4' ? 'video' : exportSettings.orientation}`} onPointerDown={startExportPan} onPointerMove={moveExportPan} onPointerUp={() => { exportPanRef.current = null; }} onPointerCancel={() => { exportPanRef.current = null; }} onDoubleClick={() => setExportSettings((value) => ({ ...value, zoom: 1, panX: 0, panY: 0 }))} onWheel={(event) => { event.preventDefault(); setExportSettings((value) => ({ ...value, zoom: Math.max(0.5, Math.min(5, value.zoom * (event.deltaY > 0 ? 0.9 : 1.1))) })); }}>
                {exportPreview ? <img src={exportPreview} alt="Export preview" draggable="false" /> : <span>Preparing preview…</span>}
                <small>{exportSettings.format === 'mp4' ? 'Orbit preview · Wheel to adjust framing · One complete round' : 'Drag to pan · Wheel to zoom · Double-click to reset'}</small>
              </div>
              <div className="export-controls">
                <label><span>Format</span><select value={exportSettings.format} onChange={(event) => setExportSettings((value) => ({ ...value, format: event.target.value }))}><option value="png">PNG image</option><option value="pdf">PDF document</option><option value="mp4">MP4 · Orbit video</option><option value="stl">STL · 3D printer</option><option value="glb">GLB 3D model</option><option value="json">JSON project</option></select></label>
                {exportSettings.format !== 'mp4' && <label><span>Paper size</span><select value={exportSettings.paper} onChange={(event) => setExportSettings((value) => ({ ...value, paper: event.target.value }))}><option value="a4">A4</option><option value="a3">A3</option><option value="letter">US Letter</option></select></label>}
                {exportSettings.format !== 'mp4' && <label><span>Orientation</span><select value={exportSettings.orientation} onChange={(event) => setExportSettings((value) => ({ ...value, orientation: event.target.value }))}><option value="landscape">Landscape</option><option value="portrait">Portrait</option></select></label>}
                {exportSettings.format !== 'mp4' && <label><span>Render quality</span><select value={exportSettings.dpi} onChange={(event) => setExportSettings((value) => ({ ...value, dpi: Number(event.target.value) }))}><option value="450">High · 450 DPI</option><option value="300">Standard · 300 DPI</option></select></label>}
                {exportSettings.format === 'mp4' && <label><span>One-round orbit duration</span><input type="number" min="2" max="60" step="1" value={exportSettings.orbitDuration} onChange={(event) => setExportSettings((value) => ({ ...value, orbitDuration: Math.max(2, Math.min(60, Number(event.target.value) || 10)) }))} /></label>}
                {exportSettings.format === 'mp4' && <p className="wall-help">Girih video quality · H.264 MP4 · 1920 × 1080 · 30 FPS · 20 Mbps. Camera target stays at the model center.</p>}
                <label><span>Render style</span><select value={exportSettings.style} onChange={(event) => setExportSettings((value) => ({ ...value, style: event.target.value }))}><option value="solid">Solid module colors</option><option value="hidden-line">Hidden line</option></select></label>
                <label><span>Lighting</span><select value={exportSettings.lighting} onChange={(event) => {
                  const lighting = event.target.value;
                  setExportSettings((value) => ({
                    ...value,
                    lighting,
                    ...(lighting === 'night' ? { style: 'solid', shadows: true, material: 'matte', wallMaterial: 'matte', groundColor: '#111827' } : { groundColor: '#fbf0bc' }),
                  }));
                }}><option value="day">Natural daylight</option><option value="night">Night · authored spotlights only</option></select></label>
                {exportSettings.lighting === 'night' && <>
                  <label><span>Ground reflection · {Math.round(exportSettings.reflectionStrength * 100)}%</span><input type="range" min="0" max="1" step="0.05" value={exportSettings.reflectionStrength} onChange={(event) => setExportSettings((value) => ({ ...value, reflectionStrength: Number(event.target.value) }))} /></label>
                  <p className="night-export-note">{nightLighting.lights.some((light) => light.enabled) ? `${nightLighting.lights.filter((light) => light.enabled).length} enabled spotlight${nightLighting.lights.filter((light) => light.enabled).length === 1 ? '' : 's'} · filmic tone mapping · reflective ground` : 'Add and enable at least one spotlight in the Night lights panel before rendering.'}</p>
                </>}
                <label><span>{exportSettings.seamless ? 'Whole-model material' : 'Module material'}</span><select value={exportSettings.material} onChange={(event) => setExportSettings((value) => ({ ...value, material: event.target.value }))}><option value="matte">Matte</option><option value="glossy">Glossy</option><option value="metallic">Metallic</option><option value="stone">Stone</option></select></label>
                {!exportSettings.seamless && <label><span>Wall and arch material</span><select value={exportSettings.wallMaterial} onChange={(event) => setExportSettings((value) => ({ ...value, wallMaterial: event.target.value }))}><option value="matte">Matte</option><option value="glossy">Glossy</option><option value="metallic">Metallic</option><option value="stone">Stone</option></select></label>}
                <label className="export-shadow-toggle"><span>Seamless solid mass</span><input type="checkbox" checked={exportSettings.seamless} onChange={(event) => setExportSettings((value) => ({ ...value, seamless: event.target.checked }))} /></label>
                {exportSettings.seamless && <label><span>Seamless whole-model color</span><input type="color" value={exportSettings.seamlessColor} onChange={(event) => setExportSettings((value) => ({ ...value, seamlessColor: event.target.value }))} /></label>}
                {exportSettings.seamless && <label className="export-shadow-toggle"><span>Show module edge lines</span><input type="checkbox" checked={exportSettings.seamlessEdges} onChange={(event) => setExportSettings((value) => ({ ...value, seamlessEdges: event.target.checked }))} /></label>}
                {exportSettings.seamless && <label className="export-shadow-toggle"><span>Show wall and arch edge lines</span><input type="checkbox" checked={exportSettings.seamlessWallEdges} onChange={(event) => setExportSettings((value) => ({ ...value, seamlessWallEdges: event.target.checked }))} /></label>}
                {exportSettings.seamless && exportSettings.seamlessWallEdges && <label><span>Wall edge color</span><input type="color" value={exportSettings.wallEdgeColor} onChange={(event) => setExportSettings((value) => ({ ...value, wallEdgeColor: event.target.value }))} /></label>}
                {exportSettings.seamless && exportSettings.seamlessWallEdges && <label><span>Wall edge thickness · {exportSettings.wallEdgeThickness} px</span><input type="range" min="0.5" max="6" step="0.25" value={exportSettings.wallEdgeThickness} onChange={(event) => setExportSettings((value) => ({ ...value, wallEdgeThickness: Number(event.target.value) }))} /></label>}
                {exportSettings.seamless && <label className="export-shadow-toggle"><span>Show north inset boundary</span><input type="checkbox" checked={exportSettings.seamlessNorthBoundary} onChange={(event) => setExportSettings((value) => ({ ...value, seamlessNorthBoundary: event.target.checked }))} /></label>}
                {exportSettings.format !== 'mp4' && <label><span>View</span><select value={exportSettings.view} onChange={(event) => {
                  const view = event.target.value;
                  setExportSettings((value) => ({
                    ...value,
                    view,
                    panX: 0,
                    panY: 0,
                    ...(view === 'dimension-front' ? {
                      style: 'hidden-line',
                      noTextures: true,
                      shadows: false,
                      seamless: false,
                    } : {}),
                  }));
                }}><option value="current">Current stage · {walkView.enabled ? 'Walk view' : VIEW_LABELS[viewLayout.main]}</option><option value="iso-ne">Isometric NE</option><option value="iso-nw">Isometric NW</option><option value="iso-se">Isometric SE</option><option value="iso-sw">Isometric SW</option><option value="top">Basic top</option><option value="front">Basic front</option><option value="dimension-front">Dimensioned front · technical</option></select></label>}
                {exportSettings.format !== 'mp4' && exportSettings.view === 'dimension-front' && <p className="wall-help">Flat hidden-line elevation with dashed tier guides and dimensions for the building and south-wall openings.</p>}
                <label><span>Ground color</span><input type="color" value={exportSettings.groundColor} onChange={(event) => setExportSettings((value) => ({ ...value, groundColor: event.target.value }))} /></label>
                <label className="export-shadow-toggle"><span>Render shadows</span><input type="checkbox" checked={exportSettings.shadows} onChange={(event) => setExportSettings((value) => ({ ...value, shadows: event.target.checked }))} /></label>
                <label className="export-shadow-toggle"><span>No textures</span><input type="checkbox" checked={exportSettings.noTextures} onChange={(event) => setExportSettings((value) => ({ ...value, noTextures: event.target.checked }))} /></label>
                <label><span>Zoom · {exportSettings.zoom.toFixed(1)}×</span><input type="range" min="0.5" max="5" step="0.1" value={exportSettings.zoom} onChange={(event) => setExportSettings((value) => ({ ...value, zoom: Number(event.target.value) }))} /></label>
                <button className="button primary export-action" disabled={exporting} onClick={runExport}><Download size={15} /> {exporting && exportSettings.format === 'mp4' ? `Rendering ${Math.round(exportProgress * 100)}%` : `Export ${exportSettings.format.toUpperCase()}`}</button>
              </div>
            </div>
          </section>
        </div>
      )}

      {false && (
        <div className="export-modal-backdrop" onPointerDown={() => setBondDesignerOpen(false)}>
          <section className="bond-modal" onPointerDown={(event) => event.stopPropagation()}>
            <header>
              <div><span className="eyebrow">Wall brickwork</span><h2>Bond Designer</h2></div>
              <button className="icon-button" onClick={() => setBondDesignerOpen(false)}>×</button>
            </header>
            <p className="bond-intro">
              Lay one repeating unit for each course. Courses repeat vertically and each brick sequence repeats horizontally across every wall.
            </p>
            <div className="shared-bond-library">
              <div>
                <strong>My Bricks App patterns</strong>
                <small>{bondAccount ? bondAccount.email : 'Connect the same Girih account used in Bricks App.'}</small>
              </div>
              {!bondAccount ? (
                <button type="button" className="button primary" onClick={connectBondAccount}>Connect account</button>
              ) : (
                <>
                  <select defaultValue="" disabled={sharedBondLoading || !sharedBonds.length} onChange={(event) => {
                    const pattern = sharedBonds.find((item) => item.id === event.target.value);
                    if (pattern) useSharedBond(pattern);
                    event.target.value = '';
                  }}>
                    <option value="">{sharedBondLoading ? 'Loading patterns…' : sharedBonds.length ? 'Choose a saved pattern…' : 'No saved patterns yet'}</option>
                    {sharedBonds.map((pattern) => <option value={pattern.id} key={pattern.id}>{pattern.name}</option>)}
                  </select>
                  <button type="button" className="button" disabled={sharedBondLoading} onClick={loadSharedBonds}>Refresh</button>
                  <button type="button" className="button" onClick={() => supabase.auth.signOut()}>Disconnect</button>
                </>
              )}
              {sharedBondError && <p>{sharedBondError}</p>}
            </div>
            <div className="bond-course-list">
              {bondDraft.courses.map((course, courseIndex) => (
                <article className="bond-course" key={`bond-course-${courseIndex}`}>
                  <div className="bond-course-heading">
                    <strong>Course {courseIndex + 1}</strong>
                    <label>
                      <span>Start shift</span>
                      <input
                        type="number"
                        min="-4"
                        max="4"
                        step="0.25"
                        value={course.offset}
                        onChange={(event) => updateBondCourse(courseIndex, (current) => ({ ...current, offset: Number(event.target.value) || 0 }))}
                      />
                      <b>× brick</b>
                    </label>
                    <button
                      type="button"
                      className="icon-button danger"
                      title="Remove course"
                      disabled={bondDraft.courses.length <= 1}
                      onClick={() => setBondDraft((value) => ({ courses: value.courses.filter((_, index) => index !== courseIndex) }))}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="bond-course-preview" title="Click a brick to remove it">
                    <div className="bond-course-track" style={{ transform: `translateX(${Math.max(-4, Math.min(4, course.offset)) * 26}px)` }}>
                      {course.bricks.map((brick, brickIndex) => (
                        <button
                          type="button"
                          className="bond-brick"
                          style={{ flex: `0 0 ${brick * 92}px` }}
                          title={`${brick}× brick length · click to remove`}
                          onClick={() => removeBondBrick(courseIndex, brickIndex)}
                          key={`bond-${courseIndex}-${brickIndex}`}
                        >
                          {brick === 1 ? 'Full' : brick === 0.75 ? '3/4' : brick === 0.5 ? 'Half' : brick === 0.25 ? '1/4' : `${brick}×`}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="bond-brick-tools">
                    <span>Place next brick</span>
                    <button type="button" disabled={course.bricks.length >= 8} onClick={() => addBondBrick(courseIndex, 1)}>Full</button>
                    <button type="button" disabled={course.bricks.length >= 8} onClick={() => addBondBrick(courseIndex, 0.25)}>1/4</button>
                    <button type="button" disabled={course.bricks.length >= 8} onClick={() => addBondBrick(courseIndex, 0.5)}>Half</button>
                    <button type="button" disabled={course.bricks.length >= 8} onClick={() => addBondBrick(courseIndex, 0.75)}>3/4</button>
                  </div>
                </article>
              ))}
            </div>
            <p className="bond-protected-note">
              Protected details remain unchanged: the north outer ring uses full-length bricks, and the door/window opening courses remain vertical.
            </p>
            <footer className="bond-modal-actions">
              <button type="button" className="button" onClick={() => setBondDraft(cloneBondPattern())}>Reset running bond</button>
              <button
                type="button"
                className="button"
                disabled={bondDraft.courses.length >= 8}
                onClick={() => setBondDraft((value) => ({ courses: [...value.courses, { offset: 0, bricks: [1] }] }))}
              >
                <Plus size={14} /> Add course
              </button>
              <span />
              <button type="button" className="button" onClick={() => setBondDesignerOpen(false)}>Cancel</button>
              <button type="button" className="button primary" onClick={applyBondPattern}>Apply bond</button>
            </footer>
          </section>
        </div>
      )}

      <footer className="status-bar"><Grid3X3 size={14} /><span>{status}</span><span className="status-hint">Drag empty space to orbit · Wheel to zoom · Right-drag to pan</span></footer>
      {contextMenu && (
        <div className="selection-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onPointerDown={(event) => event.stopPropagation()}>
          <strong>{contextMenu.selectionCount} selected</strong>
          <button type="button" disabled={!contextMenu.canGroup} onClick={() => { engineRef.current?.groupSelected(); setContextMenu(null); }}>Group selection</button>
          <button type="button" disabled={!contextMenu.canUngroup} onClick={() => { engineRef.current?.ungroupSelected(); setContextMenu(null); }}>Ungroup</button>
        </div>
      )}
      <input ref={openProjectRef} type="file" accept=".muqarnas.json,.json" hidden onChange={openProject} />
    </div>
  );
}

function RangeControl({ label, value, min, max, step, suffix, onChange }) {
  return <label className="range-control"><span><strong>{label}</strong><output>{Number(value).toFixed(2)}{suffix}</output></span><input type="range" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

function TransformReadout({ label, values, suffix }) {
  return <div className="transform-readout"><strong>{label}</strong><div>{['X', 'Y', 'Z'].map((axis, index) => <span key={axis}><b>{axis}</b>{Number(values[index]).toFixed(2)}{suffix}</span>)}</div></div>;
}

function levelRed(index, count) {
  const lightness = 30 + (index / Math.max(1, count - 1)) * 36;
  return `hsl(4 68% ${lightness}%)`;
}

createRoot(document.getElementById('root')).render(<App />);
