import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  Box,
  Download,
  Edit3,
  Eye,
  FileText,
  Grid3X3,
  Layers3,
  Menu,
  Palette,
  Plus,
  Printer,
  Redo2,
  Save,
  Trash2,
  Undo2,
  Upload,
  X,
} from 'lucide-react';
import * as THREE from 'three';
import { PUBLIC_MODEL_FILES, PUBLIC_MODEL_GROUPS } from './publicModelPieces.generated.js';
import './styles.css';

const STORAGE_KEY = 'girih.pieces.v1';
const ADMIN_SETTINGS_STORAGE_KEY = 'girih.pieceAdminSettings.v1';
const GROUP_COLOR_PALETTES_STORAGE_KEY = 'girih.groupColorPalettes.v1';
const MODELS_STORAGE_KEY = 'girih.models.v1';
const MOTIFS_STORAGE_KEY = 'girih.motifs.v1';
const ANALYSIS_VERSION = 6;
const SNAP_DISTANCE = 0.45;
const OBJ_DISPLAY_SIZE = 2.2;
const HISTORY_LIMIT = 80;
const TARGETED_REAL_BOUNDARY_NAMES = new Set(['setareh', 'maku']);
const REMOVED_DEFAULT_PIECE_IDS = new Set(['decagon', 'pentagon', 'bowtie', 'rhombus', 'dart']);
const EXPORT_MATERIALS = new Set(['glass', 'plastic', 'paper']);
const EDGE_LINE_MODES = new Set(['single', 'double', 'offset']);
const DEFAULT_SCENE_STYLE = 'presentation';
const STAGE_CAMERA_VIEWS = [
  { id: 'top', label: 'Top', position: [0, 12, 0.001], up: [0, 0, -1], lockRotate: true },
  { id: 'iso-ne', label: 'NE', position: [7.2, 6.4, 7.2], up: [0, 1, 0] },
  { id: 'iso-nw', label: 'NW', position: [-7.2, 6.4, 7.2], up: [0, 1, 0] },
  { id: 'iso-se', label: 'SE', position: [7.2, 6.4, -7.2], up: [0, 1, 0] },
  { id: 'iso-sw', label: 'SW', position: [-7.2, 6.4, -7.2], up: [0, 1, 0] },
];
const STAGE_CAMERA_VIEW_MAP = new Map(STAGE_CAMERA_VIEWS.map((view) => [view.id, view]));
const DEFAULT_RENDER_SETTINGS = {
  backgroundColor: '#1b3f3a',
  edgeColor: '#123f3a',
  edgeThickness: 0,
  edgeMode: 'single',
  edgeOffsetCount: 3,
  edgeOffsetDistance: 8,
};
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
const EXPORT_SHADOW_MAP_SIZE = 8192;
const EXPORT_RENDER_SCALE = 1.5;
const GLASS_EXPORT_RENDER_SCALE = 0.5;
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

const DEFAULT_PIECES = [...PUBLIC_MODEL_PIECES];
const DEFAULT_PIECE_BY_ID = new Map(DEFAULT_PIECES.map((piece) => [piece.id, piece]));

function publicModelPiece(id, name, filename, color, group = 'Default') {
  return {
    id,
    name,
    group: normalizePieceGroupName(group),
    color,
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
    sourceHeightPx: '',
    sourceWidthPx: '',
    sourceLengthPx: '',
    sourceFootprintScale: '',
    keepAspectRatio: true,
    analysisVersion: 0,
  };
}

function encodeModelPath(path) {
  return String(path)
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

function App() {
  const [pieces, setPieces] = usePersistentPieces();
  const [savedModels, setSavedModels] = usePersistentModels();
  const [savedMotifs, setSavedMotifs] = usePersistentMotifs();
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
  const [material, setMaterial] = useState('plastic');
  const [draft, setDraft] = useState(emptyDraft());
  const [editingId, setEditingId] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [modelName, setModelName] = useState('');
  const [motifName, setMotifName] = useState('');
  const [selectedMotifId, setSelectedMotifId] = useState('');
  const [motifRows, setMotifRows] = useState(2);
  const [motifColumns, setMotifColumns] = useState(3);
  const [motifGapX, setMotifGapX] = useState(0);
  const [motifGapY, setMotifGapY] = useState(0);
  const [modelTransform, setModelTransform] = useState(DEFAULT_MODEL_TRANSFORM);
  const [stageCamera, setStageCamera] = useState('top');
  const [exportOrientation, setExportOrientation] = useState('landscape');
  const [exportFormat, setExportFormat] = useState('png');
  const [renderBgColor, setRenderBgColor] = useState(DEFAULT_RENDER_SETTINGS.backgroundColor);
  const [renderEdgeColor, setRenderEdgeColor] = useState(DEFAULT_RENDER_SETTINGS.edgeColor);
  const [renderEdgeThickness, setRenderEdgeThickness] = useState(DEFAULT_RENDER_SETTINGS.edgeThickness);
  const [renderEdgeMode, setRenderEdgeMode] = useState(DEFAULT_RENDER_SETTINGS.edgeMode);
  const [renderEdgeOffsetCount, setRenderEdgeOffsetCount] = useState(DEFAULT_RENDER_SETTINGS.edgeOffsetCount);
  const [renderEdgeOffsetDistance, setRenderEdgeOffsetDistance] = useState(DEFAULT_RENDER_SETTINGS.edgeOffsetDistance);
  const [liveShadowsEnabled, setLiveShadowsEnabled] = useState(false);
  const [printPreview, setPrintPreview] = useState(null);
  const [mobilePiecesOpen, setMobilePiecesOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileAdminOpen, setMobileAdminOpen] = useState(false);
  const [collapsedPieceGroups, setCollapsedPieceGroups] = useState(() => new Set(PUBLIC_MODEL_GROUPS.map(normalizePieceGroupName)));
  const [collapsedAdminGroups, setCollapsedAdminGroups] = useState(() => new Set(PUBLIC_MODEL_GROUPS.map(normalizePieceGroupName)));
  const [collapsedPaletteGroups, setCollapsedPaletteGroups] = useState(() => new Set());
  const [groupColorPalettes, setGroupColorPalettes] = useState(readGroupColorPalettes);
  const [selectedGroupPalettes, setSelectedGroupPalettes] = useState({});
  const [modelTransformCollapsed, setModelTransformCollapsed] = useState(true);
  const [motifsCollapsed, setMotifsCollapsed] = useState(true);
  const [stageVisibleBounds, setStageVisibleBounds] = useState(null);
  const [stageCameraSnapshot, setStageCameraSnapshot] = useState(null);
  const importSceneInputRef = useRef(null);

  const explicitGroupByPieceId = new Map();
  stageGroups.forEach((group) => group.ids.forEach((id) => explicitGroupByPieceId.set(id, group.id)));
  const groupedPlaced = placed.map((item) => ({
    ...item,
    groupInstanceId: item.groupInstanceId || explicitGroupByPieceId.get(item.id) || null,
  }));
  const selected = groupedPlaced.find((item) => item.id === selectedId);
  const activeGroupPieces = activeGroupId ? groupedPlaced.filter((item) => item.groupInstanceId === activeGroupId) : [];
  const rawSelectedPieces = selectedIds.map((id) => groupedPlaced.find((item) => item.id === id)).filter(Boolean);
  const selectedPieces = activeGroupPieces.length > 1 ? activeGroupPieces : rawSelectedPieces;
  const selectedGroupId =
    activeGroupPieces.length > 1
      ? activeGroupId
      : selectedPieces.length > 1 && selectedPieces.every((piece) => piece.groupInstanceId && piece.groupInstanceId === selectedPieces[0].groupInstanceId)
        ? selectedPieces[0].groupInstanceId
      : null;
  const selectedGroupPieces = selectedGroupId ? groupedPlaced.filter((item) => item.groupInstanceId === selectedGroupId) : [];
  const selectedIsWholeGroup = selectedGroupId && selectedGroupPieces.length === selectedPieces.length;
  const hasClipboardPieces = clipboardPieces.length > 0 || clipboardPiecesRef.current.length > 0;
  const selectedObjectCount = selectedPieces.length;
  const groupedObjectCount = Math.max(stageGroups.length, Array.from(
    groupedPlaced.reduce((groups, item) => {
      if (!item.groupInstanceId) return groups;
      groups.set(item.groupInstanceId, (groups.get(item.groupInstanceId) || 0) + 1);
      return groups;
    }, new Map()).values(),
  ).filter((count) => count > 1).length);
  const completed = placed.length >= 7 && countSnappedPairs(placed) >= 5;
  const pieceGroups = useMemo(() => groupLibraryPieces(pieces, PUBLIC_MODEL_GROUPS), [pieces]);
  const selectedMotif = savedMotifs.find((motif) => motif.id === selectedMotifId) || savedMotifs[0] || null;
  const isPaperMaterial = material === 'paper';
  const inactivePaperExportControlClass = isPaperMaterial ? 'export-disabled-control' : undefined;

  function currentRenderSettings() {
    return normalizeRenderSettings({
      backgroundColor: renderBgColor,
      edgeColor: renderEdgeColor,
      edgeThickness: renderEdgeThickness,
      edgeMode: renderEdgeMode,
      edgeOffsetCount: renderEdgeOffsetCount,
      edgeOffsetDistance: renderEdgeOffsetDistance,
    });
  }

  function changeMaterial(nextMaterial) {
    const normalized = normalizeMaterialName(nextMaterial);
    setMaterial(normalized);
    if (normalized === 'paper') setStageCamera('top');
  }

  function selectPlacedIds(ids) {
    const nextIds = ids.filter((id, index) => id && ids.indexOf(id) === index && groupedPlaced.some((item) => item.id === id));
    const nextPieces = nextIds.map((id) => groupedPlaced.find((item) => item.id === id)).filter(Boolean);
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
    const piece = groupedPlaced.find((item) => item.id === id);
    if (!piece) {
      selectPlacedIds([]);
      return;
    }
    const groupIds = piece.groupInstanceId ? groupedPlaced.filter((item) => item.groupInstanceId === piece.groupInstanceId).map((item) => item.id) : [id];
    selectPlacedIds(groupIds);
  }

  function updateModelTransform(field, value) {
    setModelTransform((current) => normalizeModelTransform({ ...current, [field]: value }));
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

  function saveGroupColorPalette(group) {
    const groupName = normalizePieceGroupName(group.name);
    if (!group.items.length) return;
    const palette = {
      id: crypto.randomUUID(),
      savedAt: Date.now(),
      colors: Object.fromEntries(group.items.map((piece) => [piece.id, piece.color])),
    };
    setGroupColorPalettes((current) => {
      const existing = Array.isArray(current[groupName]) ? current[groupName] : [];
      if (existing.length >= 6) return current;
      const nextGroupPalettes = [...existing, palette].map((item, index) => ({ ...item, name: `${index + 1}` }));
      return { ...current, [groupName]: nextGroupPalettes };
    });
    setSelectedGroupPalettes((current) => ({ ...current, [groupName]: palette.id }));
  }

  function deleteGroupColorPalette(groupName, paletteId) {
    const normalizedGroupName = normalizePieceGroupName(groupName);
    setGroupColorPalettes((current) => {
      const existing = Array.isArray(current[normalizedGroupName]) ? current[normalizedGroupName] : [];
      const nextGroupPalettes = existing
        .filter((palette) => palette.id !== paletteId)
        .map((item, index) => ({ ...item, name: `${index + 1}` }));
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
    const groupName = normalizePieceGroupName(group.name);
    const palettes = groupColorPalettes[groupName] || [];
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
    if (selectedId && !placed.some((item) => item.id === selectedId)) setSelectedId(null);
    setSelectedIds((ids) => ids.filter((id) => placed.some((item) => item.id === id)));
    if (activeGroupId && !groupedPlaced.some((item) => item.groupInstanceId === activeGroupId)) setActiveGroupId(null);
    if (contextMenu && !placed.some((item) => item.id === contextMenu.id)) setContextMenu(null);
  }, [placed, selectedId, activeGroupId, contextMenu]);

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
            return applyAdminPieceSetting(analyzed);
          }),
        );
      });
    });
  }, [pieces, setPieces]);

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
      if (isEditingField || (!event.ctrlKey && !event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === 'z' && event.shiftKey) {
        event.preventDefault();
        redoStage();
        return;
      }
      if (key === 'z') {
        event.preventDefault();
        undoStage();
        return;
      }
      if (key === 'y') {
        event.preventDefault();
        redoStage();
        return;
      }
      if (key === 'c') {
        event.preventDefault();
        copySelectedPieces();
        return;
      }
      if (key === 'v') {
        event.preventDefault();
        pasteClipboardPieces();
      }
    }

    window.addEventListener('keydown', handleHistoryShortcut);
    return () => window.removeEventListener('keydown', handleHistoryShortcut);
  }, [undoStage, redoStage, selectedPieces, clipboardPieces]);

  function addPiece(piece) {
    commitPlaced((items) => {
      const instance = {
        ...piece,
        id: `${piece.id}-${crypto.randomUUID()}`,
        sourceId: piece.id,
        x: 0,
        y: 0,
        rotation: 0,
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

  function recolorPlaced(id, color) {
    commitPlaced((items) => items.map((item) => (item.id === id ? { ...item, color } : item)));
  }

  function toggleMirrorPlacedVertical(id) {
    commitPlaced((items) =>
      items.map((item) =>
        item.id === id ? { ...item, mirrorVertical: !item.mirrorVertical, snappedTo: null } : item,
      ),
    );
    setContextMenu(null);
  }

  function groupSelectedPieces() {
    const currentPlaced = placedRef.current;
    const currentSelectedIds = selectedIdsRef.current;
    const renderedSelectedIds = selectedPieces.map((piece) => piece.id);
    const stateSelectedIds = selectedIds;
    const sourceIds =
      currentSelectedIds.length >= 2
        ? currentSelectedIds
        : renderedSelectedIds.length >= 2
          ? renderedSelectedIds
          : stateSelectedIds;
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

  function ungroupSelectedPieces() {
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
    const nextClipboard = selectedPieces.map((piece) => ({ ...piece }));
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
    commitPlaced((items) => [...items, ...copies]);
    if (pastedGroupIds.size) {
      setStageGroups((groups) => [
        ...groups,
        ...Array.from(pastedGroupIds.entries())
          .filter(([, ids]) => ids.length > 1)
          .map(([id, ids]) => ({ id, ids })),
      ]);
    }
    setSelectedIds(nextSelection);
    setSelectedId(nextSelection[0] || null);
    setActiveGroupId(groupIdMap.values().next().value || null);
    setContextMenu(null);
  }

  function settleSelectedPieces(ids, delta, previousItems = []) {
    const idSet = new Set(ids);
    if (!idSet.size) return;
    commitPlaced(
      (items) =>
        items.map((item) =>
          idSet.has(item.id)
            ? { ...item, x: (item.x || 0) + delta.x, y: (item.y || 0) + delta.y, snappedTo: null }
            : item,
        ),
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
      height: piece.height,
      stageWidth: pieceStageDimensions(piece).width,
      stageLength: pieceStageDimensions(piece).length,
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
      height: imported.sourceHeightPx || imported.height,
      stageWidth: imported.sourceWidthPx || pieceStageDimensions(imported).width,
      stageLength: imported.sourceLengthPx || pieceStageDimensions(imported).length,
      sourceHeightPx: imported.sourceHeightPx ?? '',
      sourceWidthPx: imported.sourceWidthPx ?? '',
      sourceLengthPx: imported.sourceLengthPx ?? '',
      sourceFootprintScale: imported.sourceFootprintScale ?? '',
      keepAspectRatio: draft.keepAspectRatio !== false,
      analysisVersion: imported.analysisVersion,
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
    const nextPiece = { ...piece, color };
    saveAdminPieceSetting(nextPiece);
    setPieces((items) => items.map((item) => (item.id === piece.id ? nextPiece : item)));
    commitPlaced((items) =>
      items.map((item) => (item.sourceId === piece.id ? applyLibraryPieceToInstance(nextPiece, item) : item)),
    );
    setDraft((current) => (editingId === piece.id ? { ...current, color } : current));
  }

  function updatePieceHeight(piece, value) {
    const height = Number(value);
    if (!Number.isFinite(height) || height <= 0) return;
    const nextPiece = { ...piece, height };
    saveAdminPieceSetting(nextPiece);
    setPieces((items) => items.map((item) => (item.id === piece.id ? nextPiece : item)));
    commitPlaced((items) =>
      items.map((item) => (item.sourceId === piece.id ? applyLibraryPieceToInstance(nextPiece, item) : item)),
    );
    setDraft((current) => (editingId === piece.id ? { ...current, height } : current));
  }

  function deletePiece(id) {
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

  function saveSelectedAsMotif() {
    if (!selectedPieces.length) return;
    const name = motifName.trim() || `Motif ${savedMotifs.length + 1}`;
    const motif = createMotifFromPieces(name, selectedPieces);
    if (!motif) return;
    setSavedMotifs((items) => [motif, ...items]);
    setSelectedMotifId(motif.id);
    setMotifName('');
  }

  function tessellateSelectedMotif() {
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
    setSavedMotifs((items) => items.filter((motif) => motif.id !== id));
    setSelectedMotifId((current) => (current === id ? '' : current));
  }

  function saveCurrentModel() {
    if (!placed.length) return;
    const name = modelName.trim() || `Girih model ${savedModels.length + 1}`;
    const model = serializeSceneModel(name, groupedPlaced, DEFAULT_SCENE_STYLE, material, currentRenderSettings(), modelTransform);
    setSavedModels((items) => [model, ...items]);
    setModelName(name);
  }

  function loadSavedModel(model) {
    const next = centerScenePieces(rehydrateScenePieces(model));
    commitPlaced(() => next);
    setMaterial(normalizeMaterialName(model.material || material));
    const renderSettings = normalizeRenderSettings(model.renderSettings);
    setModelTransform(normalizeModelTransform(model.modelTransform));
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
  }

  function importSavedModel(model) {
    const incoming = centerScenePieces(rehydrateScenePieces(model));
    commitPlaced((items) => [...items, ...incoming]);
    setSelectedId(null);
    setSelectedIds([]);
    setActiveGroupId(null);
    setStageGroups([]);
  }

  function deleteSavedModel(id) {
    setSavedModels((items) => items.filter((item) => item.id !== id));
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

  async function exportScene(format) {
    const renderSettings = currentRenderSettings();
    const payload = serializeSceneModel(modelName.trim() || 'Girih scene', groupedPlaced, DEFAULT_SCENE_STYLE, material, renderSettings, modelTransform);
    if (format === 'png') {
      const canvas = await renderSceneCanvas(groupedPlaced, { style: DEFAULT_SCENE_STYLE, material, modelTransform, view: stageCamera, cameraSnapshot: stageCameraSnapshot, orientation: exportOrientation, renderSettings, shadowsEnabled: liveShadowsEnabled });
      downloadCanvasPng('girih-model.png', canvas);
      return;
    }
    if (format === 'png-transparent') {
      const canvas = renderTransparentTopCanvas(groupedPlaced, { modelTransform });
      downloadCanvasPng('girih-model-transparent.png', canvas);
      return;
    }
    if (format === 'pdf') {
      const canvas = await renderSceneCanvas(groupedPlaced, { style: DEFAULT_SCENE_STYLE, material, modelTransform, view: stageCamera, cameraSnapshot: stageCameraSnapshot, orientation: exportOrientation, renderSettings, shadowsEnabled: liveShadowsEnabled });
      downloadPdfFromCanvas('girih-model.pdf', canvas, exportOrientation);
      return;
    }
    if (format === 'svg') {
      downloadText('girih-model.svg', toSvg(groupedPlaced, { modelTransform }));
      return;
    }
    if (format === 'dxf') {
      downloadText('girih-model.dxf', toDxf(groupedPlaced, { modelTransform }));
      return;
    }
    if (format === 'stl') {
      downloadText('girih-model.stl', await toStl(groupedPlaced, { modelTransform }));
      return;
    }
    const text = format === 'json' ? JSON.stringify(payload, null, 2) : toObj(payload);
    downloadText(`girih-model.${format}`, text);
  }

  async function openPrintPreview() {
    if (!placed.length) return;
    const canvas = await renderSceneCanvas(groupedPlaced, { style: DEFAULT_SCENE_STYLE, material, modelTransform, view: stageCamera, cameraSnapshot: stageCameraSnapshot, orientation: exportOrientation, renderSettings: currentRenderSettings(), shadowsEnabled: liveShadowsEnabled });
    setPrintPreview({
      imageUrl: canvas.toDataURL('image/png'),
      orientation: exportOrientation,
      view: stageCamera,
    });
  }

  async function printCurrentModel() {
    if (!placed.length) return;
    const canvas = await renderSceneCanvas(groupedPlaced, { style: DEFAULT_SCENE_STYLE, material, modelTransform, view: stageCamera, cameraSnapshot: stageCameraSnapshot, orientation: exportOrientation, renderSettings: currentRenderSettings(), shadowsEnabled: liveShadowsEnabled });
    printCanvas(canvas, exportOrientation, `${modelName.trim() || 'Girih model'} - ${stageCamera}`);
  }

  function exportSelectedFormat() {
    exportScene(exportFormat);
  }

  return (
    <div
      className="app-shell"
      onPointerDown={(event) => {
        if (!mobileAdminOpen) return;
        if (event.target.closest('.admin-panel') || event.target.closest('[data-admin-toggle]')) return;
        setMobileAdminOpen(false);
      }}
    >
      <div className="mobile-topbar">
        <button type="button" onClick={() => setMobilePiecesOpen((open) => !open)}>
          <Layers3 size={18} /> Shapes
        </button>
        <button type="button" onClick={() => setMobileMenuOpen(true)}>
          <Menu size={18} /> Menu
        </button>
      </div>

      {(mobileMenuOpen || mobileAdminOpen) && (
        <button
          type="button"
          className="mobile-scrim"
          aria-label="Close mobile panel"
          onClick={() => {
            setMobileMenuOpen(false);
            setMobileAdminOpen(false);
          }}
        />
      )}

      <aside className={`library-panel ${mobilePiecesOpen ? 'open' : ''}`}>
        <div className="brand-block">
          <Grid3X3 size={28} />
          <div>
            <h1>Girih</h1>
            <p>Assemble modular 3D geometric pieces with automatic edge snapping.</p>
          </div>
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

        <section className="panel-section model-panel desktop-library-controls">
          <div className="section-title">
            <Save size={18} />
            <span>Models</span>
          </div>
          <label>
            Model name
            <input value={modelName} onChange={(event) => setModelName(event.target.value)} placeholder="My Girih model" />
          </label>
          <div className="action-row">
            <button onClick={saveCurrentModel} disabled={!placed.length}>
              <Save size={16} /> Save
            </button>
            <button onClick={() => importSceneInputRef.current?.click()}>
              <Upload size={16} /> Import
            </button>
          </div>
          <input ref={importSceneInputRef} className="hidden-file" type="file" accept="application/json,.json" onChange={importSceneModelFile} />
          <div className="model-list">
            {savedModels.map((model) => (
              <div className="model-row" key={model.id}>
                <span>
                  <strong>{model.name}</strong>
                  <small>{model.pieces?.length || 0} pieces</small>
                </span>
                <button title="Load and clear stage" onClick={() => loadSavedModel(model)}>
                  Load
                </button>
                <button title="Add to current stage" onClick={() => importSavedModel(model)}>
                  Add
                </button>
                <button aria-label={`Delete ${model.name}`} onClick={() => deleteSavedModel(model.id)}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </section>

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

        <section className="panel-section controls-grid desktop-library-controls">
          <CollapsibleControlGroup
            title="Model Transform"
            collapsed={modelTransformCollapsed}
            onToggle={() => setModelTransformCollapsed((collapsed) => !collapsed)}
          >
            <ModelTransformControls modelTransform={modelTransform} onChange={updateModelTransform} />
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
        </section>

        <section className="panel-section controls-grid desktop-library-controls">
          <div className="section-title">
            <Printer size={18} />
            <span>Export</span>
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
            <label className={`checkbox-field export-checkbox-field ${inactivePaperExportControlClass || ''}`}>
              <input
                type="checkbox"
                checked={liveShadowsEnabled}
                onChange={(event) => setLiveShadowsEnabled(event.target.checked)}
                disabled={isPaperMaterial}
              />
              <span>Live shadows</span>
            </label>
            <label className={inactivePaperExportControlClass}>
              Edge thickness
              <input
                type="number"
                min="0"
                step="0.5"
                value={renderEdgeThickness}
                onChange={(event) => setRenderEdgeThickness(event.target.value)}
                disabled={isPaperMaterial}
              />
            </label>
            <label className={inactivePaperExportControlClass}>
              Edge line style
              <select value={renderEdgeMode} onChange={(event) => setRenderEdgeMode(event.target.value)} disabled={isPaperMaterial}>
                <option value="single">Single line</option>
                <option value="double">Double line</option>
                <option value="offset">Offset line</option>
              </select>
            </label>
            {renderEdgeMode === 'offset' && (
              <>
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
              </>
            )}
            <label>
              Page orientation
              <select value={exportOrientation} onChange={(event) => setExportOrientation(event.target.value)}>
                <option value="landscape">Landscape</option>
                <option value="portrait">Portrait</option>
              </select>
            </label>
            <label>
              Export format
              <select value={exportFormat} onChange={(event) => setExportFormat(event.target.value)}>
                <option value="png">PNG image</option>
                <option value="png-transparent">PNG transparent</option>
                <option value="svg">SVG vector</option>
                <option value="dxf">DXF laser/CNC</option>
                <option value="stl">STL 3D print</option>
                <option value="pdf">PDF document</option>
                <option value="json">JSON model</option>
                <option value="obj">OBJ model</option>
              </select>
            </label>
          </div>
          <div className="action-row">
            <button onClick={exportSelectedFormat} disabled={!placed.length}>
              <Download size={16} /> Export
            </button>
            <button onClick={openPrintPreview} disabled={!placed.length}>
              <Eye size={16} /> Preview
            </button>
            <button onClick={printCurrentModel} disabled={!placed.length}>
              <Printer size={16} /> Print
            </button>
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

        <section className="panel-section model-panel">
          <div className="section-title">
            <Save size={18} />
            <span>Models</span>
          </div>
          <label>
            Model name
            <input value={modelName} onChange={(event) => setModelName(event.target.value)} placeholder="My Girih model" />
          </label>
          <div className="action-row">
            <button onClick={saveCurrentModel} disabled={!placed.length}>
              <Save size={16} /> Save
            </button>
            <button onClick={() => importSceneInputRef.current?.click()}>
              <Upload size={16} /> Import
            </button>
          </div>
          <div className="model-list">
            {savedModels.map((model) => (
              <div className="model-row" key={model.id}>
                <span>
                  <strong>{model.name}</strong>
                  <small>{model.pieces?.length || 0} pieces</small>
                </span>
                <button title="Load and clear stage" onClick={() => loadSavedModel(model)}>
                  Load
                </button>
                <button title="Add to current stage" onClick={() => importSavedModel(model)}>
                  Add
                </button>
                <button aria-label={`Delete ${model.name}`} onClick={() => deleteSavedModel(model.id)}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="panel-section controls-grid">
          <CollapsibleControlGroup
            title="Model Transform"
            collapsed={modelTransformCollapsed}
            onToggle={() => setModelTransformCollapsed((collapsed) => !collapsed)}
          >
            <ModelTransformControls modelTransform={modelTransform} onChange={updateModelTransform} />
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
        </section>

        <section className="panel-section controls-grid">
          <div className="section-title">
            <Printer size={18} />
            <span>Export</span>
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
            <label className={`checkbox-field export-checkbox-field ${inactivePaperExportControlClass || ''}`}>
              <input
                type="checkbox"
                checked={liveShadowsEnabled}
                onChange={(event) => setLiveShadowsEnabled(event.target.checked)}
                disabled={isPaperMaterial}
              />
              <span>Live shadows</span>
            </label>
            <label className={inactivePaperExportControlClass}>
              Edge thickness
              <input
                type="number"
                min="0"
                step="0.5"
                value={renderEdgeThickness}
                onChange={(event) => setRenderEdgeThickness(event.target.value)}
                disabled={isPaperMaterial}
              />
            </label>
            <label className={inactivePaperExportControlClass}>
              Edge line style
              <select value={renderEdgeMode} onChange={(event) => setRenderEdgeMode(event.target.value)} disabled={isPaperMaterial}>
                <option value="single">Single line</option>
                <option value="double">Double line</option>
                <option value="offset">Offset line</option>
              </select>
            </label>
            {renderEdgeMode === 'offset' && (
              <>
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
              </>
            )}
            <label>
              Page orientation
              <select value={exportOrientation} onChange={(event) => setExportOrientation(event.target.value)}>
                <option value="landscape">Landscape</option>
                <option value="portrait">Portrait</option>
              </select>
            </label>
            <label>
              Export format
              <select value={exportFormat} onChange={(event) => setExportFormat(event.target.value)}>
                <option value="png">PNG image</option>
                <option value="png-transparent">PNG transparent</option>
                <option value="svg">SVG vector</option>
                <option value="dxf">DXF laser/CNC</option>
                <option value="stl">STL 3D print</option>
                <option value="pdf">PDF document</option>
                <option value="json">JSON model</option>
                <option value="obj">OBJ model</option>
              </select>
            </label>
          </div>
          <div className="action-row">
            <button onClick={exportSelectedFormat} disabled={!placed.length}>
              <Download size={16} /> Export
            </button>
            <button onClick={openPrintPreview} disabled={!placed.length}>
              <Eye size={16} /> Preview
            </button>
            <button onClick={printCurrentModel} disabled={!placed.length}>
              <Printer size={16} /> Print
            </button>
          </div>
        </section>

        <section className="panel-section action-row">
          <button
            type="button"
            data-admin-toggle
            onClick={() => {
              setMobileMenuOpen(false);
              setMobileAdminOpen(true);
            }}
          >
            <Upload size={16} /> Admin panel
          </button>
        </section>
      </aside>

      <main className="stage-wrap" onPointerDown={() => setMobileAdminOpen(false)}>
        <div className="stage-toolbar">
          <div>
            <strong>{completed ? 'Puzzle complete' : 'Build stage'}</strong>
            <span>
              {placed.length} pieces, {selectedObjectCount} selected, {groupedObjectCount} groups, {countSnappedPairs(placed)} snapped pairs
            </span>
          </div>
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
            </div>
            <div className="history-controls">
              <button type="button" data-admin-toggle aria-label="Open admin panel" title="Admin panel" onClick={() => setMobileAdminOpen(true)}>
                <Upload size={16} />
              </button>
              <button type="button" aria-label="Clear whole stage" title="Clear whole stage" onClick={resetScene} disabled={!placed.length}>
                <Trash2 size={16} />
              </button>
              <button type="button" aria-label="Undo stage action" title="Undo (Ctrl+Z)" onClick={undoStage} disabled={!canUndo}>
                <Undo2 size={16} />
              </button>
              <button type="button" aria-label="Redo stage action" title="Redo (Ctrl+Y)" onClick={redoStage} disabled={!canRedo}>
                <Redo2 size={16} />
              </button>
            </div>
            {selectedPieces.length > 0 && (
              <div className="selection-chip">
                <Box size={16} />
                {selectedIsWholeGroup ? `Group (${selectedPieces.length})` : selectedPieces.length === 1 ? selectedPieces[0].name : `${selectedPieces.length} selected`}
                <button
                  type="button"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={groupSelectedPieces}
                  disabled={selectedPieces.length < 2 || selectedIsWholeGroup}
                >
                  Group
                </button>
                <button type="button" onClick={ungroupSelectedPieces} disabled={!selectedPieces.some((piece) => piece.groupInstanceId)}>
                  Ungroup
                </button>
                <button type="button" onClick={copySelectedPieces}>
                  Copy
                </button>
                <button type="button" onClick={pasteClipboardPieces} disabled={!hasClipboardPieces}>
                  Paste
                </button>
              </div>
            )}
          </div>
        </div>
        <GirihStage
          placed={groupedPlaced}
          selectedId={selectedId}
          selectedIds={selectedIds}
          activeGroupId={activeGroupId}
          material={material}
          style={DEFAULT_SCENE_STYLE}
          cameraMode={stageCamera}
          backgroundColor={renderBgColor}
          edgeColor={renderEdgeColor}
          edgeThickness={renderEdgeThickness}
          edgeMode={renderEdgeMode}
          edgeOffsetCount={renderEdgeOffsetCount}
          edgeOffsetDistance={renderEdgeOffsetDistance}
          liveShadowsEnabled={liveShadowsEnabled}
          modelTransform={modelTransform}
          onSelect={selectPlaced}
          onSelectionChange={selectPlacedIds}
          onMove={updatePlaced}
          onSettle={settlePiece}
          onSettleSelection={settleSelectedPieces}
          onRotate={rotatePlaced}
          onContextMenu={setContextMenu}
          onViewBoundsChange={setStageVisibleBounds}
          onCameraChange={setStageCameraSnapshot}
        />
        {contextMenu && (
          <div
            className="object-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(event) => event.stopPropagation()}
          >
            <strong>{groupedPlaced.find((item) => item.id === contextMenu.id)?.name || 'Piece'}</strong>
            <label>
              Instance color
              <input
                type="color"
                value={groupedPlaced.find((item) => item.id === contextMenu.id)?.color || '#1c7c74'}
                onChange={(event) => recolorPlaced(contextMenu.id, event.target.value)}
              />
            </label>
            <button onClick={() => toggleMirrorPlacedVertical(contextMenu.id)}>
              {groupedPlaced.find((item) => item.id === contextMenu.id)?.mirrorVertical ? 'Unmirror vertically' : 'Mirror vertically'}
            </button>
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
            <button onClick={copySelectedPieces} disabled={!selectedPieces.length}>
              Copy selection
            </button>
            <button onClick={pasteClipboardPieces} disabled={!hasClipboardPieces}>
              Paste
            </button>
            <button onClick={() => deletePlaced(contextMenu.id)}>
              <Trash2 size={15} />
              Delete instance
            </button>
          </div>
        )}
        {printPreview && (
          <div className="preview-backdrop" onClick={() => setPrintPreview(null)}>
            <div className="preview-dialog" onClick={(event) => event.stopPropagation()}>
              <div className="preview-header">
                <strong>Print preview</strong>
                <span>
                  {getStageCameraView(printPreview.view).label} / {printPreview.orientation}
                </span>
              </div>
              <img src={printPreview.imageUrl} alt="Girih print preview" />
              <div className="action-row">
                <button onClick={printCurrentModel}>
                  <Printer size={16} /> Print
                </button>
                <button onClick={() => exportScene('pdf')}>
                  <FileText size={16} /> PDF
                </button>
                <button onClick={() => setPrintPreview(null)}>Close</button>
              </div>
            </div>
          </div>
        )}
      </main>

      <aside className={`admin-panel ${mobileAdminOpen ? 'open' : ''}`} onPointerDown={(event) => event.stopPropagation()}>
        <div className="section-title">
          <Upload size={18} />
          <span>Admin Panel</span>
          <button type="button" className="mobile-close-button" aria-label="Close admin panel" onClick={() => setMobileAdminOpen(false)}>
            <X size={16} />
          </button>
        </div>

        <div className="admin-list">
          {pieceGroups.map((group) => {
            const collapsed = collapsedAdminGroups.has(group.name);
            const groupName = normalizePieceGroupName(group.name);
            const paletteCollapsed = collapsedPaletteGroups.has(groupName);
            const palettes = groupColorPalettes[groupName] || [];
            const canSavePalette = group.items.length > 0 && palettes.length < 6;
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
                    {group.items.map((piece) => (
                      <div className="admin-piece" key={piece.id}>
                        <div className="admin-row">
                          <PieceIcon piece={piece} />
                          <input
                            className="admin-color-input"
                            type="color"
                            value={piece.color}
                            aria-label={`Change ${piece.name} color`}
                            onChange={(event) => updatePieceColor(piece, event.target.value)}
                          />
                          <input
                            className="admin-height-input"
                            type="number"
                            min="0.01"
                            step="0.001"
                            value={piece.height}
                            aria-label={`Change ${piece.name} stage height`}
                            onChange={(event) => updatePieceHeight(piece, event.target.value)}
                          />
                          <span>{piece.name}</span>
                          <button aria-label={`Edit ${piece.name}`} onClick={() => editPiece(piece)}>
                            <Edit3 size={15} />
                          </button>
                        </div>
                        {editingId === piece.id && (
                          <AdminPieceEditor
                            draft={draft}
                            onDraftChange={setDraft}
                            onDimensionChange={updateDraftDimension}
                            onSubmit={savePiece}
                            onCancel={() => {
                              setEditingId(null);
                              setDraft(emptyDraft());
                            }}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </aside>
    </div>
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
            <button
              type="button"
              className="admin-palette-delete"
              aria-label={`Delete ${palette.name}`}
              onClick={() => onDelete(palette.id)}
            >
              <Trash2 size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function ModelTransformControls({ modelTransform, onChange }) {
  const scaleFields = MODEL_TRANSFORM_FIELDS.filter((field) => field.id.startsWith('scale'));
  const rotationFields = MODEL_TRANSFORM_FIELDS.filter((field) => field.id.startsWith('rotation'));
  const positionFields = MODEL_TRANSFORM_FIELDS.filter((field) => field.id.startsWith('position'));
  return (
    <>
      <div className="transform-row">
        <span>Scale</span>
        {scaleFields.map((field) => (
          <TransformInput key={field.id} field={field} modelTransform={modelTransform} onChange={onChange} />
        ))}
      </div>
      <div className="transform-row">
        <span>Rotation</span>
        {rotationFields.map((field) => (
          <TransformInput key={field.id} field={field} modelTransform={modelTransform} onChange={onChange} />
        ))}
      </div>
      <div className="transform-row">
        <span>Position</span>
        {positionFields.map((field) => (
          <TransformInput key={field.id} field={field} modelTransform={modelTransform} onChange={onChange} />
        ))}
      </div>
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

function TransformInput({ field, modelTransform, onChange }) {
  return (
    <label className="transform-field">
      {field.label.replace(/^(Scale|Rotate|Position) /, '')}
      <input
        type="number"
        min={field.min}
        step={field.step}
        value={modelTransform[field.id]}
        onChange={(event) => onChange(field.id, event.target.value)}
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
    mirrorVertical: !!instance.mirrorVertical,
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
    height: Number(piece.height) || 0.18,
    stageWidth: Number(piece.stageWidth) || null,
    stageLength: Number(piece.stageLength) || null,
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
  onSelect,
  onSelectionChange,
  onMove,
  onSettle,
  onSettleSelection,
  onRotate,
  onContextMenu,
  onViewBoundsChange,
  onCameraChange,
}) {
  const mountRef = useRef(null);
  const [selectionBox, setSelectionBox] = useState(null);
  const stateRef = useRef({
    placed,
    selectedId,
    selectedIds,
    activeGroupId,
    material,
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
    onSelect,
    onSelectionChange,
    onMove,
    onSettle,
    onSettleSelection,
    onRotate,
    onContextMenu,
    onViewBoundsChange,
    onCameraChange,
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
      onSelect,
      onSelectionChange,
      onMove,
      onSettle,
      onSettleSelection,
      onRotate,
      onContextMenu,
      onViewBoundsChange,
      onCameraChange,
    };
  });

  useEffect(() => {
    stageSyncDirtyRef.current = true;
  }, [placed, selectedId, selectedIds, activeGroupId, material, style, edgeColor, edgeThickness, edgeMode, edgeOffsetCount, edgeOffsetDistance, liveShadowsEnabled, modelTransform]);

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
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setClearColor(initialBackground, 1);
    renderer.shadowMap.enabled = !!stateRef.current.liveShadowsEnabled;
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 3;
    controls.maxDistance = 18;
    controls.maxPolarAngle = Math.PI * 0.47;
    controls.target.set(0, 0, 0);
    const cameraView = { mode: null };

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
      controls.enableRotate = !view.lockRotate;
      controls.enablePan = true;
      controls.minDistance = view.lockRotate ? 4 : 3;
      controls.maxDistance = view.lockRotate ? 24 : 18;
      controls.minZoom = 0.35;
      controls.maxZoom = 6;
      controls.maxPolarAngle = Math.PI;
      camera.lookAt(controls.target);
      camera.updateProjectionMatrix();
      controls.update();
    }

    applyStageCameraView(stateRef.current.cameraMode || 'top', true);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const drag = { id: null, ids: [], offset: new THREE.Vector3(), startPoint: new THREE.Vector3(), startX: 0, startY: 0, active: false, previous: null, previousItems: [], current: null, delta: { x: 0, y: 0 } };
    const selectionDrag = { active: false, selecting: false, startX: 0, startY: 0, currentX: 0, currentY: 0 };
    const meshes = new Map();
    const groupHitMeshes = new Map();
    const group = new THREE.Group();
    const selectionOutline = createSelectionOutline();
    const lastViewBounds = { current: null };
    const lastCameraSnapshot = { current: null };
    scene.add(group);
    group.add(selectionOutline);

    scene.add(new THREE.HemisphereLight(STAGE_HEMISPHERE_LIGHT.sky, STAGE_HEMISPHERE_LIGHT.ground, STAGE_HEMISPHERE_LIGHT.intensity));
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

    function syncMeshes() {
      const {
        placed: current,
        selectedId: selected,
        material: materialName,
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
      current.forEach((item) => {
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
            stageSyncDirtyRef.current = true;
          });
          mesh.userData.id = item.id;
          mesh.userData.renderSignature = renderSignature;
          meshes.set(item.id, mesh);
          group.add(mesh);
        }
        mesh.position.set(item.x, 0, item.y);
        mesh.rotation.y = -item.rotation;
        mesh.scale.set(1, styleName === 'pattern' ? 0.35 : 1, item.mirrorVertical ? -1 : 1);
        applyPieceMaterial(mesh, item, materialName, selectedSet.has(item.id), stageLiveShadowsEnabled);
        updateStageEdgeOverlay(mesh, item, styleName, materialName, stageRenderSettings, renderSignature);
      });
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
      }
      updateSelectionOutline(selectionOutline, current.filter((item) => selectedSet.has(item.id)));
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

    function pointerDown(event) {
      if (event.button !== 0) return;
      setPointer(event);
      raycaster.setFromCamera(pointer, camera);
      const groupHits = raycaster.intersectObjects(Array.from(groupHitMeshes.values()), true);
      const hits = groupHits.length ? groupHits : raycaster.intersectObjects(Array.from(meshes.values()), true);
      if (!hits.length) {
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
          renderer.domElement.setPointerCapture(event.pointerId);
          return;
        }
        const canDragSelect = (stateRef.current.cameraMode || 'top') === 'top' || normalizeMaterialName(stateRef.current.material) === 'paper';
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
      const currentSelectedIds = stateRef.current.selectedIds || [];
      const dragIds = current.groupInstanceId
        ? stateRef.current.placed.filter((item) => item.groupInstanceId === current.groupInstanceId).map((item) => item.id)
        : currentSelectedIds.includes(current.id) && currentSelectedIds.length > 1
          ? currentSelectedIds
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
      stateRef.current.onSelect(drag.id);
      renderer.domElement.setPointerCapture(event.pointerId);
    }

    function pointerMove(event) {
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
        if (previous && mesh) mesh.position.set((previous.x || 0) + delta.x, 0, (previous.y || 0) + delta.y);
      });
      updateSelectionOutline(selectionOutline, drag.previousItems.map((item) => ({ ...item, x: (item.x || 0) + delta.x, y: (item.y || 0) + delta.y })));
    }

    function pointerUp(event) {
      if (selectionDrag.active) {
        const box = selectionBoxFromDrag();
        const ids = selectionDrag.selecting ? selectedIdsInBox(box) : [];
        stateRef.current.onSelectionChange?.(ids);
        selectionDrag.active = false;
        selectionDrag.selecting = false;
        controls.enabled = true;
        setSelectionBox(null);
        renderer.domElement.releasePointerCapture(event.pointerId);
        return;
      }
      if (!drag.id) return;
      const current = stateRef.current.placed.find((item) => item.id === drag.id);
      if (current && drag.active) {
        if (drag.ids.length > 1) {
          stateRef.current.onSettleSelection?.(drag.ids, drag.delta, drag.previousItems);
        } else {
          const nextPosition = drag.current || { x: current.x, y: current.y };
          stateRef.current.onSettle(drag.id, { x: nextPosition.x, y: nextPosition.y, previous: drag.previous });
        }
      }
      if (current && !drag.active && drag.ids.length === 1 && !current.groupInstanceId) stateRef.current.onRotate(drag.id);
      stageSyncDirtyRef.current = true;
      drag.id = null;
      drag.ids = [];
      drag.active = false;
      drag.previous = null;
      drag.previousItems = [];
      drag.current = null;
      drag.delta = { x: 0, y: 0 };
      controls.enabled = true;
      renderer.domElement.releasePointerCapture(event.pointerId);
    }

    function contextMenu(event) {
      event.preventDefault();
      setPointer(event);
      raycaster.setFromCamera(pointer, camera);
      const groupHits = raycaster.intersectObjects(Array.from(groupHitMeshes.values()), true);
      const hits = groupHits.length ? groupHits : raycaster.intersectObjects(Array.from(meshes.values()), true);
      if (!hits.length) {
        stateRef.current.onContextMenu(null);
        return;
      }
      const mesh = getPieceRoot(hits[0].object);
      stateRef.current.onSelect(mesh.userData.id);
      stateRef.current.onContextMenu({ id: mesh.userData.id, x: event.clientX, y: event.clientY });
    }

    renderer.domElement.addEventListener('pointerdown', pointerDown);
    renderer.domElement.addEventListener('pointermove', pointerMove);
    renderer.domElement.addEventListener('pointerup', pointerUp);
    renderer.domElement.addEventListener('contextmenu', contextMenu);

    function resize() {
      perspectiveCamera.aspect = mount.clientWidth / mount.clientHeight;
      perspectiveCamera.updateProjectionMatrix();
      updatePaperCameraProjection();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    }
    window.addEventListener('resize', resize);

    let frame;
    function animate() {
      if (stageSyncDirtyRef.current && !drag.active) {
        syncMeshes();
        stageSyncDirtyRef.current = false;
      }
      const isPaper = normalizeMaterialName(stateRef.current.material) === 'paper';
      applyStageCameraView(isPaper ? 'top' : stateRef.current.cameraMode || 'top', false, isPaper);
      const backgroundColor = isPaper ? PAPER_BACKGROUND_COLOR : stateRef.current.backgroundColor;
      applyStageBackground(scene, renderer, backgroundColor);
      applyStageFloorColor(stageFloor, backgroundColor);
      grid.visible = !isPaper;
      applyLiveShadowState(renderer, light, stageFloor, !isPaper && stateRef.current.liveShadowsEnabled);
      controls.update();
      reportViewBounds();
      reportCameraSnapshot();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    }
    animate();

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      renderer.domElement.removeEventListener('pointerdown', pointerDown);
      renderer.domElement.removeEventListener('pointermove', pointerMove);
      renderer.domElement.removeEventListener('pointerup', pointerUp);
      renderer.domElement.removeEventListener('contextmenu', contextMenu);
      controls.dispose();
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

function updateGlassColorCast(group, placed, materialName, modelTransform = DEFAULT_MODEL_TRANSFORM) {
  const isGlass = normalizeMaterialName(materialName) === 'glass';
  const normalizedTransform = normalizeModelTransform(modelTransform);
  const transformSignature = JSON.stringify(normalizedTransform);
  if (
    group.userData.placedRef === placed &&
    group.userData.materialName === materialName &&
    group.userData.transformSignature === transformSignature
  ) {
    return;
  }
  group.userData.placedRef = placed;
  group.userData.materialName = materialName;
  group.userData.transformSignature = transformSignature;
  const signature = isGlass
    ? placed
        .map(glassCastPieceSignature)
        .join('|') + `|transform:${transformSignature}`
    : 'hidden';
  if (group.userData.signature === signature) return;
  group.userData.signature = signature;
  while (group.children.length) {
    const child = group.children.pop();
    disposeObject(child);
  }
  group.visible = isGlass;
  if (!isGlass || !placed.length) return;
  const cast = createGlassColorCastTextureMesh(placed, normalizedTransform);
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

function createGlassColorCastTextureMesh(placed, modelTransform = DEFAULT_MODEL_TRANSFORM) {
  const canvasSize = 1600;
  const floorSize = 80;
  const halfFloor = floorSize / 2;
  const canvas = document.createElement('canvas');
  canvas.width = canvasSize;
  canvas.height = canvasSize;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.clearRect(0, 0, canvasSize, canvasSize);
  context.globalAlpha = 0.5;

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
      opacity: 1,
      depthWrite: false,
      depthTest: true,
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
  const transformMatrix = modelTransformMatrix(modelTransform);
  const lightDirection = stageLightDirection();
  const points = footprint.flatMap(([x, z]) => [
    projectPointToStageFloor(new THREE.Vector3(x, 0, z).applyMatrix4(transformMatrix), lightDirection),
    projectPointToStageFloor(new THREE.Vector3(x, height, z).applyMatrix4(transformMatrix), lightDirection),
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
  ].join('|');
  if (object.userData.stageEdgeSignature === signature) return;
  if (object.userData.stageEdgeOverlay) {
    object.remove(object.userData.stageEdgeOverlay);
    disposeObject(object.userData.stageEdgeOverlay);
    object.userData.stageEdgeOverlay = null;
  }
  object.userData.stageEdgeSignature = signature;
  if (thickness <= 0) return;
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
  const edgeSegments = edgeOverlaySegments(segments, thickness, renderSettings);
  const verticalPoints = renderSettings.edgeMode === 'offset' ? [] : uniqueSegmentCoordinatePoints(segments);
  const instanceCount = edgeSegments.length * 2 + verticalPoints.length;
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
    setStageEdgeBarMatrix(overlay, matrixIndex, start, end, bottomY, thickness, 0, interiorPoint);
    matrixIndex += 1;
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

function edgeOverlaySegments(segments, thickness, renderSettings) {
  const mode = renderSettings.edgeMode;
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
  if (clean.length < 3 || distance <= 0) return clean;
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
    if (miterDistance > distance * 5) return fallbackInsetPoint(current, prevLine.normal, nextLine.normal, distance);
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
        return [rx + piece.x, piece.height + 0.08, ry + piece.y];
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
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: piece.height,
    bevelEnabled: true,
    bevelThickness: 0.035,
    bevelSize: 0.035,
    bevelSegments: 2,
  });
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, piece.height, 0);
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

function applyPieceMaterial(object, piece, materialName, selected, liveShadowsEnabled = false) {
  const normalizedMaterial = normalizeMaterialName(materialName);
  const isGlass = normalizedMaterial === 'glass';
  const isPaper = normalizedMaterial === 'paper';
  const castsLiveShadow = !!liveShadowsEnabled && !isGlass && !isPaper;
  const signature = [
    piece.color,
    isPaper ? 'paper' : isGlass ? 'glass' : 'plastic',
    selected ? 'selected' : 'normal',
    castsLiveShadow ? 'live-shadows' : 'no-live-shadows',
  ].join('|');
  if (object.userData.materialSignature === signature) return;
  object.userData.materialSignature = signature;
  object.traverse((child) => {
    if (child.userData?.isStageEdge) return;
    if (!child.isMesh || !child.material) return;
    child.castShadow = castsLiveShadow;
    child.receiveShadow = castsLiveShadow;
    child.material.color.set(isPaper ? PAPER_BACKGROUND_COLOR : piece.color);
    child.material.metalness = isGlass || isPaper ? 0 : 0.08;
    child.material.roughness = isPaper ? 0.72 : isGlass ? 0.06 : 0.42;
    child.material.transparent = isGlass;
    child.material.opacity = isGlass ? 0.68 : 1;
    child.material.depthWrite = !isGlass;
    child.material.side = THREE.FrontSide;
    if ('clearcoat' in child.material) child.material.clearcoat = isGlass ? 0.65 : 0;
    if ('clearcoatRoughness' in child.material) child.material.clearcoatRoughness = isGlass ? 0.05 : 0;
    if ('transmission' in child.material) child.material.transmission = 0;
    if ('thickness' in child.material) child.material.thickness = 0;
    if ('ior' in child.material) child.material.ior = isGlass ? 1.48 : 1.5;
    if ('attenuationColor' in child.material) child.material.attenuationColor.set(isGlass ? glassTintColor(piece.color) : '#ffffff');
    if ('attenuationDistance' in child.material) child.material.attenuationDistance = Infinity;
    child.material.emissive?.set(isPaper ? PAPER_BACKGROUND_COLOR : selected ? '#362000' : '#000000');
    child.material.emissiveIntensity = isPaper ? 0.18 : selected ? 0.12 : isGlass ? 0.05 : 0;
    child.material.needsUpdate = true;
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
        material.map?.dispose();
        material.dispose();
      });
    } else if (child.material) {
      child.material.map?.dispose();
      child.material.dispose();
    }
  });
}

function findBestSnap(moving, others, options = {}) {
  const collided = options.collided || collidingPieces(moving, others);
  const isColliding = collided.length > 0;
  const snapTargets = isColliding ? collided : nearbySnapTargets(moving, others);
  const blockerScope = relevantSnapBlockers(moving, others, snapTargets);
  const movingEdges = visibleWorldEdges(moving, [moving, ...blockerScope]);
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
  const movingEdges = visibleWorldEdges(moving, [moving, ...blockerScope]);
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
  return [x, piece.mirrorVertical ? -y : y];
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

function formatDimensionValue(value) {
  return Number.isFinite(Number(value)) ? Number(Number(value).toFixed(4)) : '';
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

function normalizeAngle(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function shortAngle(angle) {
  return normalizeAngle(angle);
}

function countSnappedPairs(placed) {
  return placed.filter((item) => item.snappedTo).length;
}

function PieceIcon({ piece }) {
  const schematic = useMemo(() => {
    const segments = getRealFootprintSegments(piece);
    const points = segments.flat();
    const verticalEdges = getIconVerticalPoints(piece);
    const allPoints = [...points, ...verticalEdges];
    if (!allPoints.length) {
      return { segments: [], verticalEdges: [] };
    }
    const xs = allPoints.map(([x]) => x);
    const ys = allPoints.map(([, y]) => y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const scale = 38 / Math.max(maxX - minX || 1, maxY - minY || 1);
    const project = ([x, y]) => [(x - minX) * scale + 5, (y - minY) * scale + 5];
    return {
      segments: segments.map(([start, end]) => [project(start), project(end)]),
      verticalEdges: verticalEdges.map(project),
    };
  }, [piece]);
  return (
    <svg className="piece-icon" viewBox="0 0 48 48" aria-hidden="true">
      <g stroke={piece.color} strokeLinecap="round" strokeLinejoin="round">
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
          <circle key={`${x}-${y}-${index}`} cx={x} cy={y} r="1.8" fill={piece.color} stroke="none" />
        ))}
      </g>
    </svg>
  );
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
    pieces: sourcePieces.map((piece) => ({
      ...piece,
      id: piece.sourceId || piece.id,
      x: (piece.x || 0) - centerX,
      y: (piece.y || 0) - centerY,
      groupInstanceId: null,
      snappedTo: null,
    })),
  };
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
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const groupId = `group-${crypto.randomUUID()}`;
      if (!activeGroupId) activeGroupId = groupId;
      const groupIds = [];
      motif.pieces.forEach((piece) => {
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pieces));
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
            .map((motif) => ({
              id: typeof motif.id === 'string' ? motif.id : `motif-${crypto.randomUUID()}`,
              name: typeof motif.name === 'string' ? motif.name : 'Motif',
              savedAt: Number(motif.savedAt) || Date.now(),
              width: Math.max(0.001, Number(motif.width) || 1),
              height: Math.max(0.001, Number(motif.height) || 1),
              pieces: motif.pieces,
            }))
        : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    localStorage.setItem(MOTIFS_STORAGE_KEY, JSON.stringify(motifs));
  }, [motifs]);
  return [motifs, setMotifs];
}

function mergeDefaultPieces(stored) {
  const keptStored = stored.filter((piece) => !REMOVED_DEFAULT_PIECE_IDS.has(piece.id));
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
    return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
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
                colors: palette.colors,
              }))
          : [],
      ]),
    );
  } catch {
    return {};
  }
}

function saveAdminPieceSetting(piece) {
  const settings = readAdminPieceSettings();
  const nextSetting = {
    group: normalizePieceGroupName(piece.group),
    color: piece.color,
    height: piece.height,
    stageWidth: piece.stageWidth,
    stageLength: piece.stageLength,
    sourceHeightPx: piece.sourceHeightPx,
    sourceWidthPx: piece.sourceWidthPx,
    sourceLengthPx: piece.sourceLengthPx,
    sourceFootprintScale: piece.sourceFootprintScale,
    keepAspectRatio: piece.keepAspectRatio !== false,
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
  };
}

function usePersistentModels() {
  const [models, setModels] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(MODELS_STORAGE_KEY));
      return Array.isArray(stored) ? stored : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    localStorage.setItem(MODELS_STORAGE_KEY, JSON.stringify(models));
  }, [models]);
  return [models, setModels];
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
  };
}

function normalizePieceGroupName(group) {
  const normalized = typeof group === 'string' ? group.trim() : '';
  return normalized || 'Default';
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
  const ranges = [0, 1, 2].map((axis) => {
    const values = vertices.map((vertex) => vertex[axis]);
    return Math.max(...values) - Math.min(...values);
  });
  const heightRange = Math.min(...ranges.filter((range) => range > 0)) || 0.18;
  const footprintRange = Math.max(...ranges);
  return Math.max(0.08, Math.min(0.6, (heightRange / footprintRange) * OBJ_DISPLAY_SIZE));
}

function measureSourceHeightPx(vertices) {
  const ranges = [0, 1, 2].map((axis) => {
    const values = vertices.map((vertex) => vertex[axis]);
    return Math.max(...values) - Math.min(...values);
  });
  const rawHeight = Math.min(...ranges.filter((range) => range > 0)) || 0;
  return Number(rawHeight.toFixed(rawHeight >= 10 ? 0 : 3));
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
    pieces: placed.map(({ id, sourceId, name: pieceName, group, groupInstanceId, points, snapEdges, verticalEdges, displayEdges, sourceHeightPx, sourceWidthPx, sourceLengthPx, sourceFootprintScale, keepAspectRatio, analysisVersion, x, y, rotation, mirrorVertical, height, stageWidth, stageLength, color, type, objText, glbDataUrl, glbUrl, snappedTo }) => ({
      id,
      sourceId,
      name: pieceName,
      group: normalizePieceGroupName(group),
      groupInstanceId: groupInstanceId || null,
      type: type || 'shape',
      points,
      snapEdges,
      verticalEdges,
      displayEdges,
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
      transform: { x, y, rotation, mirrorVertical: !!mirrorVertical, height, stageWidth, stageLength },
      material: { type: normalizedMaterial, color },
    })),
  };
}

function rehydrateScenePieces(model) {
  const sourcePieces = Array.isArray(model?.pieces) ? model.pieces : [];
  const idMap = new Map();
  const groupIdMap = new Map();
  const pieces = sourcePieces
    .map((piece) => {
      const oldId = piece.id || crypto.randomUUID();
      const transform = piece.transform || piece;
      const materialInfo = piece.material || {};
      const sourceId = piece.sourceId || slugify(piece.name || oldId) || oldId;
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
        name: piece.name || 'Imported model piece',
        group: normalizePieceGroupName(piece.group),
        groupInstanceId,
        type: piece.type || 'shape',
        color: materialInfo.color || piece.color || '#1c7c74',
        points: piece.points || emptyDraft().points.split(' ').map((pair) => pair.split(',').map(Number)),
        snapEdges: piece.snapEdges,
        verticalEdges: piece.verticalEdges,
        displayEdges: piece.displayEdges,
        sourceHeightPx: piece.sourceHeightPx,
        sourceWidthPx: piece.sourceWidthPx,
        sourceLengthPx: piece.sourceLengthPx,
        sourceFootprintScale: piece.sourceFootprintScale,
        keepAspectRatio: piece.keepAspectRatio !== false,
        analysisVersion: piece.analysisVersion,
        objText: piece.objText,
        glbDataUrl: piece.glbDataUrl,
        glbUrl: piece.glbUrl,
        x: Number(transform.x) || 0,
        y: Number(transform.y) || 0,
        rotation: Number(transform.rotation) || 0,
        mirrorVertical: !!transform.mirrorVertical,
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
  const size = orientation === 'portrait' ? [2400, 3200] : [3200, 2400];
  const canvas = document.createElement('canvas');
  canvas.width = size[0];
  canvas.height = size[1];
  const context = canvas.getContext('2d');
  context.fillStyle = PAPER_BACKGROUND_COLOR;
  context.fillRect(0, 0, canvas.width, canvas.height);

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
    offsetY + (bounds.maxY - y) * scale,
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
  const vivid = saturateRgb(piece, 2.35);
  const rgb = {
    r: clampColor(vivid.r * 1.16 + 10),
    g: clampColor(vivid.g * 1.16 + 10),
    b: clampColor(vivid.b * 1.16 + 10),
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

async function renderIsometricSceneCanvas(placed, options = {}) {
  const renderSettings = normalizeRenderSettings(options.renderSettings);
  const exportMaterial = normalizeMaterialName(options.material);
  const exportShadowsEnabled = exportMaterial === 'plastic' && !!options.shadowsEnabled;
  const constrainedExport = isConstrainedExportDevice();
  const modelTransform = normalizeModelTransform(options.modelTransform);
  const cameraView = getStageCameraView(options.view);
  const cameraSnapshot = normalizeCameraSnapshot(options.cameraSnapshot);
  const orientation = options.orientation || 'landscape';
  const baseSize = orientation === 'portrait' ? [2400, 3200] : [3200, 2400];
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
  const renderer = new THREE.WebGLRenderer({ antialias: exportMaterial !== 'glass', preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(size[0], size[1], false);
  renderer.setClearColor(renderSettings.backgroundColor, 1);
  renderer.shadowMap.enabled = exportShadowsEnabled;
  if (exportShadowsEnabled) renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  if (exportMaterial !== 'glass') {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
  }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(renderSettings.backgroundColor);
  const group = new THREE.Group();
  const colorCastGroup = new THREE.Group();
  colorCastGroup.name = 'export-glass-color-cast';
  updateGlassColorCast(colorCastGroup, placed, exportMaterial, modelTransform);
  const floor = createStageFloor(renderSettings.backgroundColor, exportShadowsEnabled);
  scene.add(floor);
  scene.add(colorCastGroup);
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
      constrainedExport ? MOBILE_EXPORT_SHADOW_MAP_SIZE : EXPORT_SHADOW_MAP_SIZE,
      renderer.capabilities.maxTextureSize || EXPORT_SHADOW_MAP_SIZE,
    );
    key.shadow.mapSize.set(shadowMapSize, shadowMapSize);
    key.shadow.bias = -0.00006;
    key.shadow.normalBias = 0.018;
    key.shadow.radius = 2.8;
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 40;
    key.shadow.camera.left = -16;
    key.shadow.camera.right = 16;
    key.shadow.camera.top = 16;
    key.shadow.camera.bottom = -16;
  }
  scene.add(key);
  for (const piece of placed) {
    const object = await createExportPieceObject(piece);
    object.userData.id = piece.id;
    object.position.set(piece.x, 0, piece.y);
    object.rotation.y = -piece.rotation;
    object.scale.set(1, 1, piece.mirrorVertical ? -1 : 1);
    applyExportPieceMaterial(object, piece, exportMaterial, renderSettings, exportShadowsEnabled);
    const edgeOverlay = exportMaterial === 'glass' ? null : createExportEdgeOverlay(piece, renderSettings, false);
    if (edgeOverlay) object.add(edgeOverlay);
    group.add(object);
  }
  applyModelTransform(group, modelTransform);

  const bounds = new THREE.Box3().setFromObject(group);
  const center = bounds.getCenter(new THREE.Vector3());
  const sizeVector = bounds.getSize(new THREE.Vector3());
  const radius = Math.max(sizeVector.x, sizeVector.y * 2.3, sizeVector.z, 1);
  const aspect = size[0] / size[1];
  const camera = new THREE.PerspectiveCamera(cameraSnapshot?.fov || 42, aspect, 0.01, 1000);
  if (cameraSnapshot) {
    camera.up.fromArray(cameraSnapshot.up);
    camera.position.fromArray(cameraSnapshot.position);
    camera.lookAt(new THREE.Vector3().fromArray(cameraSnapshot.target));
  } else {
    const distance = Math.max((radius * 1.35) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), 6);
    const viewDirection = new THREE.Vector3(...cameraView.position).normalize().multiplyScalar(distance);
    camera.up.set(...cameraView.up);
    camera.position.copy(center).add(viewDirection);
    camera.lookAt(center);
  }
  camera.updateProjectionMatrix();

  renderer.render(scene, camera);
  const canvas = document.createElement('canvas');
  canvas.width = size[0];
  canvas.height = size[1];
  const context = canvas.getContext('2d');
  context.drawImage(renderer.domElement, 0, 0);
  context.fillStyle = '#4f4538';
  context.font = '24px Inter, Arial, sans-serif';
  context.fillText(`Girih ${cameraView.label} ${exportMaterial} export`, 32, canvas.height - 34);

  disposeObject(group);
  renderer.dispose();
  return canvas;
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
  if (piece.displayEdges?.length) return scaleImportedSegments(piece, piece.displayEdges).filter(([start, end]) => start && end);
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
  const segments = getExportFootprintSegments(piece).filter(([start, end]) => start && end);
  if (!segments.length) return null;
  const thickness = stageEdgeWorldThickness(renderSettings.edgeThickness);
  if (thickness <= 0) return null;
  const edgeSegments = edgeOverlaySegments(segments, thickness, renderSettings);
  const verticalPoints = renderSettings.edgeMode === 'offset' ? [] : uniqueSegmentCoordinatePoints(segments);
  const instanceCount = edgeSegments.length * 2 + verticalPoints.length;
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
    setStageEdgeBarMatrix(overlay, matrixIndex, start, end, bottomY, thickness, 0, interiorPoint);
    matrixIndex += 1;
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

async function createExportPieceObject(piece) {
  return createExportFootprintObject(piece);
}

function createExportFootprintObject(piece) {
  const points = getLocalCollisionPoints(piece);
  const shapePoints = points.length >= 3 ? points : piece.points || emptyDraft().points.split(' ').map((pair) => pair.split(',').map(Number));
  const shape = new THREE.Shape();
  shapePoints.forEach(([x, y], index) => {
    if (index === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  });
  shape.closePath();
  const height = Math.max(0.02, Number(piece.height) || 0.18);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: false,
  });
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, height, 0);
  const mesh = new THREE.Mesh(geometry, createExportMaterial(piece, 'plastic'));
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

function applyExportPieceMaterial(object, piece, materialName, renderSettings = DEFAULT_RENDER_SETTINGS, shadowsEnabled = true) {
  const normalizedMaterialName = normalizeMaterialName(materialName);
  const material = createExportMaterial(piece, normalizedMaterialName, renderSettings);
  object.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = !!shadowsEnabled && normalizedMaterialName !== 'glass' && normalizedMaterialName !== 'paper';
    child.receiveShadow = !!shadowsEnabled && normalizedMaterialName !== 'glass' && normalizedMaterialName !== 'paper';
    child.material?.dispose?.();
    child.material = material.clone();
  });
  material.dispose();
}

function createExportMaterial(piece, materialName = 'plastic', renderSettings = DEFAULT_RENDER_SETTINGS) {
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
    const tint = glassTintColor(color);
    return new THREE.MeshStandardMaterial({
      color: tint,
      metalness: 0,
      roughness: 0.12,
      emissive: new THREE.Color(tint),
      emissiveIntensity: 0.08,
      transparent: false,
      opacity: 1,
      envMapIntensity: 0.9,
      depthWrite: true,
      depthTest: true,
      side: THREE.FrontSide,
    });
  }

  return new THREE.MeshStandardMaterial({
    color,
    metalness: 0,
    roughness: 0.36,
    envMapIntensity: 0.35,
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

function downloadPdfFromCanvas(filename, canvas, orientation = 'landscape') {
  const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
  const imageBytes = base64ToBytes(dataUrl.split(',')[1]);
  const landscape = orientation === 'landscape';
  const pageWidth = landscape ? 842 : 595;
  const pageHeight = landscape ? 595 : 842;
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

function printCanvas(canvas, orientation = 'landscape', title = 'Girih model') {
  const imageUrl = canvas.toDataURL('image/png');
  const frame = window.open('', '_blank', 'noopener,noreferrer');
  if (!frame) return;
  frame.document.write(`<!doctype html>
<html>
  <head>
    <title>${escapeHtml(title)}</title>
    <style>
      @page { size: ${orientation}; margin: 10mm; }
      body { margin: 0; background: #f6efe3; }
      img { display: block; width: 100%; height: auto; page-break-inside: avoid; }
      .sheet { min-height: 100vh; display: grid; place-items: center; }
    </style>
  </head>
  <body>
    <div class="sheet"><img src="${imageUrl}" alt="${escapeHtml(title)}" /></div>
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

function exportTopPolygons(placed, options = {}) {
  const transformMatrix = modelTransformMatrix(options.modelTransform);
  return placed
    .map((piece) => {
      const points = cleanClosedPoints(getLocalCollisionPoints(piece))
        .map((point) => transformExportFootprintPoint(point, piece, transformMatrix));
      if (points.length < 3 || Math.abs(polygonArea2(points)) < 0.000001) return null;
      return {
        id: piece.id,
        name: piece.name || 'Girih piece',
        color: piece.color || '#1c7c74',
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

function renderTransparentTopCanvas(placed, options = {}) {
  const polygons = exportTopPolygons(placed, options);
  const canvas = document.createElement('canvas');
  canvas.width = 2400;
  canvas.height = 2400;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.width, canvas.height);
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
    offsetY + (bounds.maxY - y) * scale,
  ];

  context.lineJoin = 'round';
  context.lineCap = 'round';
  polygons.forEach((polygon) => {
    const points = polygon.points.map(toCanvas);
    context.beginPath();
    points.forEach(([x, y], index) => {
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.closePath();
    context.fillStyle = polygon.color;
    context.strokeStyle = 'rgba(0, 0, 0, 0.28)';
    context.lineWidth = 2;
    context.fill();
    context.stroke();
  });
  return canvas;
}

function toSvg(placed, options = {}) {
  const polygons = exportTopPolygons(placed, options);
  const bounds = exportPolygonBounds(polygons);
  const padding = 0.1;
  const minX = bounds.minX - padding;
  const maxY = bounds.maxY + padding;
  const width = Math.max(bounds.maxX - bounds.minX + padding * 2, 0.1);
  const height = Math.max(bounds.maxY - bounds.minY + padding * 2, 0.1);
  const paths = polygons.map((polygon) => {
    const d = polygon.points
      .map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${formatMachineNumber(x)} ${formatMachineNumber(-y)}`)
      .join(' ');
    return `  <path id="${escapeHtml(polygon.id)}" data-name="${escapeHtml(polygon.name)}" d="${d} Z" fill="none" stroke="#000000" stroke-width="0.02" vector-effect="non-scaling-stroke" />`;
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${formatMachineNumber(minX)} ${formatMachineNumber(-maxY)} ${formatMachineNumber(width)} ${formatMachineNumber(height)}">`,
    '  <title>Girih machine export</title>',
    '  <g id="cut-lines">',
    ...paths,
    '  </g>',
    '</svg>',
    '',
  ].join('\n');
}

function toDxf(placed, options = {}) {
  const polygons = exportTopPolygons(placed, options);
  const lines = [
    '0',
    'SECTION',
    '2',
    'ENTITIES',
  ];
  polygons.forEach((polygon) => {
    lines.push('0', 'LWPOLYLINE', '8', 'CUT', '90', String(polygon.points.length), '70', '1');
    polygon.points.forEach(([x, y]) => {
      lines.push('10', formatMachineNumber(x), '20', formatMachineNumber(y));
    });
  });
  lines.push('0', 'ENDSEC', '0', 'EOF', '');
  return lines.join('\n');
}

async function toStl(placed, options = {}) {
  const root = new THREE.Group();
  applyModelTransform(root, options.modelTransform);
  const exportObjects = await Promise.all(placed.map(createStlPieceObject));
  exportObjects.forEach(({ piece, object }) => {
    const holder = new THREE.Group();
    holder.position.set(piece.x || 0, 0, piece.y || 0);
    holder.rotation.y = -(Number(piece.rotation) || 0);
    holder.scale.set(1, 1, piece.mirrorVertical ? -1 : 1);
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
    const mirrored = !!piece.transform.mirrorVertical;
    piece.points.forEach(([x, y]) => {
      const [rx, ry] = rotatePoint(x, mirrored ? -y : y, piece.transform.rotation);
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

createRoot(document.getElementById('root')).render(<App />);
