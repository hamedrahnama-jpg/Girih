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
  FileArchive,
  FileText,
  Grid3X3,
  Image,
  Layers3,
  Menu,
  Plus,
  Printer,
  Redo2,
  RotateCcw,
  Save,
  Trash2,
  Undo2,
  Upload,
  X,
} from 'lucide-react';
import * as THREE from 'three';
import './styles.css';

const STORAGE_KEY = 'girih.pieces.v1';
const ADMIN_SETTINGS_STORAGE_KEY = 'girih.pieceAdminSettings.v1';
const MODELS_STORAGE_KEY = 'girih.models.v1';
const ANALYSIS_VERSION = 6;
const SNAP_DISTANCE = 0.45;
const OBJ_DISPLAY_SIZE = 2.2;
const HISTORY_LIMIT = 80;
const TARGETED_REAL_BOUNDARY_NAMES = new Set(['setareh', 'maku']);
const REMOVED_DEFAULT_PIECE_IDS = new Set(['decagon', 'pentagon', 'bowtie', 'rhombus', 'dart']);
const EXPORT_MATERIALS = new Set(['conceptual', 'glass', 'marble', 'tile', 'wood', 'plastic']);
const EDGE_LINE_MODES = new Set(['single', 'double']);
const DEFAULT_RENDER_SETTINGS = {
  backgroundColor: '#f6efe3',
  edgeColor: '#123f3a',
  edgeThickness: 3,
  edgeMode: 'single',
};

const PUBLIC_MODEL_PIECES = [
  publicModelPiece('badami', 'Badami', 'Badami.glb', '#2f7d73'),
  publicModelPiece('chenari', 'Chenari', 'Chenari.glb', '#8a6bb8'),
  publicModelPiece('giveh', 'Giveh', 'Giveh.glb', '#2b7a6f'),
  publicModelPiece('loz', 'Loz', 'Loz.glb', '#b86f3e'),
  publicModelPiece('maku', 'Maku', 'Maku.glb', '#1f6f68'),
  publicModelPiece('panj', 'Panj', 'Panj.glb', '#6e7fbd'),
  publicModelPiece('sekro', 'Sekro', 'Sekro.glb', '#8b6f47'),
  publicModelPiece('separi', 'Separi', 'Separi.glb', '#3f8c82'),
  publicModelPiece('setareh', 'Setareh', 'Setareh.glb', '#2e8278'),
  publicModelPiece('setareh-shol', 'Setareh Shol', 'Setareh Shol.glb', '#2b716a'),
  publicModelPiece('shamseh', 'Shamseh', 'Shamseh.glb', '#d58a36'),
  publicModelPiece('shamseh-kond', 'Shamseh Kond', 'Shamseh Kond.glb', '#c4812f'),
  publicModelPiece('shesh-band', 'Shesh Band', 'Shesh Band.glb', '#1c7c74'),
  publicModelPiece('shesh-shol', 'Shesh Shol', 'Shesh Shol.glb', '#2f8d7e'),
  publicModelPiece('sormehdan', 'Sormehdan', 'Sormehdan.glb', '#526d93'),
  publicModelPiece('tabl', 'Tabl', 'Tabl.glb', '#9a5845'),
  publicModelPiece('tah-borideh', 'Tah Borideh', 'Tah Borideh.glb', '#b9455a'),
  publicModelPiece('taragheh', 'Taragheh', 'Taragheh.glb', '#4076b8'),
  publicModelPiece('toranj', 'Toranj', 'Toranj.glb', '#6f8d44'),
  publicModelPiece('toranj-kond', 'Toranj Kond', 'Toranj Kond.glb', '#78914a'),
];

const DEFAULT_PIECES = [...PUBLIC_MODEL_PIECES];

function publicModelPiece(id, name, filename, color) {
  return {
    id,
    name,
    color,
    height: 0.18,
    type: 'glb',
    glbUrl: `/models/${encodeURIComponent(filename)}`,
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

function App() {
  const [pieces, setPieces] = usePersistentPieces();
  const [savedModels, setSavedModels] = usePersistentModels();
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
  const [material, setMaterial] = useState('conceptual');
  const [style, setStyle] = useState('presentation');
  const [draft, setDraft] = useState(emptyDraft());
  const [editingId, setEditingId] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [modelName, setModelName] = useState('');
  const [stageCamera, setStageCamera] = useState('top');
  const [exportView, setExportView] = useState('top');
  const [exportOrientation, setExportOrientation] = useState('landscape');
  const [renderBgColor, setRenderBgColor] = useState(DEFAULT_RENDER_SETTINGS.backgroundColor);
  const [renderEdgeColor, setRenderEdgeColor] = useState(DEFAULT_RENDER_SETTINGS.edgeColor);
  const [renderEdgeThickness, setRenderEdgeThickness] = useState(DEFAULT_RENDER_SETTINGS.edgeThickness);
  const [renderEdgeMode, setRenderEdgeMode] = useState(DEFAULT_RENDER_SETTINGS.edgeMode);
  const [printPreview, setPrintPreview] = useState(null);
  const [mobilePiecesOpen, setMobilePiecesOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileAdminOpen, setMobileAdminOpen] = useState(false);
  const [stageVisibleBounds, setStageVisibleBounds] = useState(null);
  const importSceneInputRef = useRef(null);

  const selected = placed.find((item) => item.id === selectedId);
  const completed = placed.length >= 7 && countSnappedPairs(placed) >= 5;

  function currentRenderSettings() {
    return normalizeRenderSettings({
      backgroundColor: renderBgColor,
      edgeColor: renderEdgeColor,
      edgeThickness: renderEdgeThickness,
      edgeMode: renderEdgeMode,
    });
  }

  useEffect(() => {
    if (selectedId && !placed.some((item) => item.id === selectedId)) setSelectedId(null);
    if (contextMenu && !placed.some((item) => item.id === contextMenu.id)) setContextMenu(null);
  }, [placed, selectedId, contextMenu]);

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
      }
    }

    window.addEventListener('keydown', handleHistoryShortcut);
    return () => window.removeEventListener('keydown', handleHistoryShortcut);
  }, [undoStage, redoStage]);

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
    setContextMenu(null);
  }

  function recolorPlaced(id, color) {
    commitPlaced((items) => items.map((item) => (item.id === id ? { ...item, color } : item)));
  }

  function settlePiece(id, transform) {
    commitPlaced((items) => {
      const moving = items.find((item) => item.id === id);
      if (!moving) return items;
      const { previous, ...nextTransform } = transform;
      const moved = { ...moving, ...nextTransform, snappedTo: null };
      const others = items.filter((item) => item.id !== id);
      const snap = findBestSnap(moved, others);
      const collisionPlacement = snap ? null : findBestCollisionPlacement(moved, others);
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
    const points = parsePoints(draft.points);
    if (points.length < 3) return;
    const piece = {
      id: editingId || slugify(draft.name) || crypto.randomUUID(),
      name: draft.name.trim() || 'Untitled Piece',
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
    setEditingId(piece.id);
    setDraft({
      name: piece.name,
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

  function deletePiece(id) {
    setPieces((items) => items.filter((item) => item.id !== id));
    commitPlaced((items) => items.filter((item) => item.sourceId !== id));
  }

  function resetScene() {
    commitPlaced(() => []);
    setSelectedId(null);
  }

  function saveCurrentModel() {
    if (!placed.length) return;
    const name = modelName.trim() || `Girih model ${savedModels.length + 1}`;
    const model = serializeSceneModel(name, placed, style, material, currentRenderSettings());
    setSavedModels((items) => [model, ...items]);
    setModelName(name);
  }

  function loadSavedModel(model) {
    const next = centerScenePieces(rehydrateScenePieces(model));
    commitPlaced(() => next);
    setStyle(model.style || style);
    setMaterial(normalizeMaterialName(model.material || material));
    const renderSettings = normalizeRenderSettings(model.renderSettings);
    setRenderBgColor(renderSettings.backgroundColor);
    setRenderEdgeColor(renderSettings.edgeColor);
    setRenderEdgeThickness(renderSettings.edgeThickness);
    setRenderEdgeMode(renderSettings.edgeMode);
    setSelectedId(null);
  }

  function importSavedModel(model) {
    const incoming = centerScenePieces(rehydrateScenePieces(model));
    commitPlaced((items) => [...items, ...incoming]);
    setSelectedId(null);
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
    const payload = serializeSceneModel(modelName.trim() || 'Girih scene', placed, style, material, renderSettings);
    if (format === 'png') {
      const canvas = await renderSceneCanvas(placed, { style, material, view: exportView, orientation: exportOrientation, renderSettings });
      downloadCanvasPng('girih-model.png', canvas);
      return;
    }
    if (format === 'pdf') {
      const canvas = await renderSceneCanvas(placed, { style, material, view: exportView, orientation: exportOrientation, renderSettings });
      downloadPdfFromCanvas('girih-model.pdf', canvas, exportOrientation);
      return;
    }
    const text = format === 'json' ? JSON.stringify(payload, null, 2) : toObj(payload);
    downloadText(`girih-model.${format}`, text);
  }

  async function openPrintPreview() {
    if (!placed.length) return;
    const canvas = await renderSceneCanvas(placed, { style, material, view: exportView, orientation: exportOrientation, renderSettings: currentRenderSettings() });
    setPrintPreview({
      imageUrl: canvas.toDataURL('image/png'),
      orientation: exportOrientation,
      view: exportView,
    });
  }

  async function printCurrentModel() {
    if (!placed.length) return;
    const canvas = await renderSceneCanvas(placed, { style, material, view: exportView, orientation: exportOrientation, renderSettings: currentRenderSettings() });
    printCanvas(canvas, exportOrientation, `${modelName.trim() || 'Girih model'} - ${exportView}`);
  }

  return (
    <div className="app-shell">
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
            {pieces.map((piece) => (
              <button key={piece.id} className="piece-card" onClick={() => addPiece(piece)}>
                <PieceIcon piece={piece} />
                <span>{piece.name}</span>
                <Plus size={16} />
              </button>
            ))}
          </div>
        </section>

        <section className="panel-section controls-grid desktop-library-controls">
          <label>
            Style
            <select value={style} onChange={(event) => setStyle(event.target.value)}>
              <option value="presentation">Presentation render</option>
              <option value="manufacturing">Manufacturing layout</option>
              <option value="pattern">Flat pattern</option>
            </select>
          </label>
          <label>
            Material
            <select value={material} onChange={(event) => setMaterial(event.target.value)}>
              <option value="conceptual">Conceptual</option>
              <option value="glass">Glass</option>
              <option value="marble">Marble</option>
              <option value="tile">Tile</option>
              <option value="wood">Wood</option>
              <option value="plastic">Plastic</option>
            </select>
          </label>
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

        <section className="panel-section controls-grid desktop-library-controls">
          <div className="section-title">
            <Printer size={18} />
            <span>Export View</span>
          </div>
          <label>
            Camera scenario
            <select value={exportView} onChange={(event) => setExportView(event.target.value)}>
              <option value="top">Flat top view</option>
              <option value="isometric">Isometric view</option>
            </select>
          </label>
          <label>
            Page orientation
            <select value={exportOrientation} onChange={(event) => setExportOrientation(event.target.value)}>
              <option value="landscape">Landscape</option>
              <option value="portrait">Portrait</option>
            </select>
          </label>
          <label>
            Stage BG color
            <input type="color" value={renderBgColor} onChange={(event) => setRenderBgColor(event.target.value)} />
          </label>
          <label>
            Edge line color
            <input type="color" value={renderEdgeColor} onChange={(event) => setRenderEdgeColor(event.target.value)} />
          </label>
          <label>
            Edge thickness
            <input
              type="number"
              min="0"
              step="0.5"
              value={renderEdgeThickness}
              onChange={(event) => setRenderEdgeThickness(event.target.value)}
            />
          </label>
          <label>
            Edge line style
            <select value={renderEdgeMode} onChange={(event) => setRenderEdgeMode(event.target.value)}>
              <option value="single">Single line</option>
              <option value="double">Double line</option>
            </select>
          </label>
          <div className="action-row">
            <button onClick={openPrintPreview} disabled={!placed.length}>
              <Eye size={16} /> Preview
            </button>
            <button onClick={printCurrentModel} disabled={!placed.length}>
              <Printer size={16} /> Print
            </button>
          </div>
        </section>

        <section className="panel-section action-row desktop-library-controls">
          <button onClick={() => exportScene('json')} disabled={!placed.length}>
            <Download size={16} /> JSON
          </button>
          <button onClick={() => exportScene('obj')} disabled={!placed.length}>
            <FileArchive size={16} /> OBJ
          </button>
          <button onClick={() => exportScene('png')} disabled={!placed.length}>
            <Image size={16} /> PNG
          </button>
          <button onClick={() => exportScene('pdf')} disabled={!placed.length}>
            <FileText size={16} /> PDF
          </button>
          <button onClick={resetScene} disabled={!placed.length}>
            <RotateCcw size={16} /> Reset
          </button>
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

        <section className="panel-section controls-grid">
          <label>
            Style
            <select value={style} onChange={(event) => setStyle(event.target.value)}>
              <option value="presentation">Presentation render</option>
              <option value="manufacturing">Manufacturing layout</option>
              <option value="pattern">Flat pattern</option>
            </select>
          </label>
          <label>
            Material
            <select value={material} onChange={(event) => setMaterial(event.target.value)}>
              <option value="conceptual">Conceptual</option>
              <option value="glass">Glass</option>
              <option value="marble">Marble</option>
              <option value="tile">Tile</option>
              <option value="wood">Wood</option>
              <option value="plastic">Plastic</option>
            </select>
          </label>
        </section>

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
          <div className="section-title">
            <Printer size={18} />
            <span>Export View</span>
          </div>
          <label>
            Camera scenario
            <select value={exportView} onChange={(event) => setExportView(event.target.value)}>
              <option value="top">Flat top view</option>
              <option value="isometric">Isometric view</option>
            </select>
          </label>
          <label>
            Page orientation
            <select value={exportOrientation} onChange={(event) => setExportOrientation(event.target.value)}>
              <option value="landscape">Landscape</option>
              <option value="portrait">Portrait</option>
            </select>
          </label>
          <label>
            Stage BG color
            <input type="color" value={renderBgColor} onChange={(event) => setRenderBgColor(event.target.value)} />
          </label>
          <label>
            Edge line color
            <input type="color" value={renderEdgeColor} onChange={(event) => setRenderEdgeColor(event.target.value)} />
          </label>
          <label>
            Edge thickness
            <input
              type="number"
              min="0"
              step="0.5"
              value={renderEdgeThickness}
              onChange={(event) => setRenderEdgeThickness(event.target.value)}
            />
          </label>
          <label>
            Edge line style
            <select value={renderEdgeMode} onChange={(event) => setRenderEdgeMode(event.target.value)}>
              <option value="single">Single line</option>
              <option value="double">Double line</option>
            </select>
          </label>
          <div className="action-row">
            <button onClick={openPrintPreview} disabled={!placed.length}>
              <Eye size={16} /> Preview
            </button>
            <button onClick={printCurrentModel} disabled={!placed.length}>
              <Printer size={16} /> Print
            </button>
          </div>
        </section>

        <section className="panel-section action-row">
          <button onClick={() => exportScene('json')} disabled={!placed.length}>
            <Download size={16} /> JSON
          </button>
          <button onClick={() => exportScene('obj')} disabled={!placed.length}>
            <FileArchive size={16} /> OBJ
          </button>
          <button onClick={() => exportScene('png')} disabled={!placed.length}>
            <Image size={16} /> PNG
          </button>
          <button onClick={() => exportScene('pdf')} disabled={!placed.length}>
            <FileText size={16} /> PDF
          </button>
          <button onClick={resetScene} disabled={!placed.length}>
            <RotateCcw size={16} /> Reset
          </button>
          <button
            type="button"
            onClick={() => {
              setMobileMenuOpen(false);
              setMobileAdminOpen(true);
            }}
          >
            <Upload size={16} /> Admin panel
          </button>
        </section>
      </aside>

      <main className="stage-wrap">
        <div className="stage-toolbar">
          <div>
            <strong>{completed ? 'Puzzle complete' : 'Build stage'}</strong>
            <span>
              {placed.length} pieces, {countSnappedPairs(placed)} snapped pairs
            </span>
          </div>
          <div className="stage-tools">
            <div className="stage-view-controls" aria-label="Stage camera view">
              <button
                type="button"
                className={stageCamera === 'top' ? 'active' : ''}
                onClick={() => setStageCamera('top')}
                title="Flat top stage view"
              >
                <Grid3X3 size={16} /> Top
              </button>
              <button
                type="button"
                className={stageCamera === 'isometric' ? 'active' : ''}
                onClick={() => setStageCamera('isometric')}
                title="Isometric stage view"
              >
                <Layers3 size={16} /> Iso
              </button>
            </div>
            <div className="history-controls">
              <button type="button" aria-label="Undo stage action" title="Undo (Ctrl+Z)" onClick={undoStage} disabled={!canUndo}>
                <Undo2 size={16} />
              </button>
              <button type="button" aria-label="Redo stage action" title="Redo (Ctrl+Y)" onClick={redoStage} disabled={!canRedo}>
                <Redo2 size={16} />
              </button>
            </div>
            {selected && (
              <div className="selection-chip">
                <Box size={16} />
                {selected.name}
              </div>
            )}
          </div>
        </div>
        <GirihStage
          placed={placed}
          selectedId={selectedId}
          material={material}
          style={style}
          cameraMode={stageCamera}
          backgroundColor={renderBgColor}
          edgeColor={renderEdgeColor}
          edgeThickness={renderEdgeThickness}
          edgeMode={renderEdgeMode}
          onSelect={setSelectedId}
          onMove={updatePlaced}
          onSettle={settlePiece}
          onRotate={rotatePlaced}
          onContextMenu={setContextMenu}
          onViewBoundsChange={setStageVisibleBounds}
        />
        {contextMenu && (
          <div
            className="object-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(event) => event.stopPropagation()}
          >
            <strong>{placed.find((item) => item.id === contextMenu.id)?.name || 'Piece'}</strong>
            <label>
              Instance color
              <input
                type="color"
                value={placed.find((item) => item.id === contextMenu.id)?.color || '#1c7c74'}
                onChange={(event) => recolorPlaced(contextMenu.id, event.target.value)}
              />
            </label>
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
                  {printPreview.view === 'isometric' ? 'Isometric' : 'Flat top'} / {printPreview.orientation}
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

      <aside className={`admin-panel ${mobileAdminOpen ? 'open' : ''}`}>
        <div className="section-title">
          <Upload size={18} />
          <span>Admin Panel</span>
          <button type="button" className="mobile-close-button" aria-label="Close admin panel" onClick={() => setMobileAdminOpen(false)}>
            <X size={16} />
          </button>
        </div>
        <form onSubmit={savePiece} className="admin-form">
          <label>
            Piece name
            <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
          </label>
          <label className="file-import">
            3D model
            <input type="file" accept=".obj,.glb,model/obj,model/gltf-binary,text/plain" onChange={importModelFile} />
            <span>
              {draft.glbDataUrl
                ? 'GLB loaded. Import or update to add it to the library.'
                : draft.glbUrl
                  ? 'Public GLB linked from the deployed models folder.'
                : draft.objText
                  ? 'OBJ loaded. Import or update to add it to the library.'
                  : 'Choose an .obj or .glb file to create a 3D piece.'}
            </span>
          </label>
          <label>
            Color
            <input
              type="color"
              value={draft.color}
              onChange={(event) => setDraft({ ...draft, color: event.target.value })}
            />
          </label>
          {(draft.objText || draft.glbDataUrl || draft.glbUrl || draft.sourceHeightPx) && (
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={draft.keepAspectRatio !== false}
                onChange={(event) => setDraft({ ...draft, keepAspectRatio: event.target.checked })}
              />
              <span>Keep aspect ratio when height changes</span>
            </label>
          )}
          {(draft.objText || draft.glbDataUrl || draft.glbUrl || draft.sourceHeightPx) && (
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
                onChange={(event) => updateDraftDimension('stageWidth', event.target.value)}
              />
            </label>
            <label>
              Stage length
              <input
                type="number"
                min="0.01"
                step="0.001"
                value={draft.stageLength}
                onChange={(event) => updateDraftDimension('stageLength', event.target.value)}
              />
            </label>
            <label>
              Stage height
              <input
                type="number"
                min="0.01"
                step="0.001"
                value={draft.height}
                onChange={(event) => updateDraftDimension('height', event.target.value)}
              />
            </label>
          </div>
          <button type="submit">
            <Save size={16} />
            {editingId ? 'Update piece' : 'Import piece'}
          </button>
        </form>

        <div className="admin-list">
          {pieces.map((piece) => (
            <div className="admin-row" key={piece.id}>
              <PieceIcon piece={piece} />
              <input
                className="admin-color-input"
                type="color"
                value={piece.color}
                aria-label={`Change ${piece.name} color`}
                onChange={(event) => updatePieceColor(piece, event.target.value)}
              />
              <span>
                {piece.name}
                {piece.type === 'obj' && <small>OBJ</small>}
                {piece.type === 'glb' && <small>GLB</small>}
              </span>
              <button aria-label={`Edit ${piece.name}`} onClick={() => editPiece(piece)}>
                <Edit3 size={15} />
              </button>
              <button aria-label={`Delete ${piece.name}`} onClick={() => deletePiece(piece.id)}>
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      </aside>
    </div>
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
    snappedTo: instance.snappedTo,
  };
}

function pieceGeometrySignature(piece) {
  return JSON.stringify({
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
}

function GirihStage({
  placed,
  selectedId,
  material,
  style,
  cameraMode,
  backgroundColor,
  edgeColor,
  edgeThickness,
  edgeMode,
  onSelect,
  onMove,
  onSettle,
  onRotate,
  onContextMenu,
  onViewBoundsChange,
}) {
  const mountRef = useRef(null);
  const stateRef = useRef({
    placed,
    selectedId,
    material,
    style,
    cameraMode,
    backgroundColor,
    edgeColor,
    edgeThickness,
    edgeMode,
    onSelect,
    onMove,
    onSettle,
    onRotate,
    onContextMenu,
    onViewBoundsChange,
  });
  const rendererRef = useRef(null);

  useEffect(() => {
    stateRef.current = {
      placed,
      selectedId,
      material,
      style,
      cameraMode,
      backgroundColor,
      edgeColor,
      edgeThickness,
      edgeMode,
      onSelect,
      onMove,
      onSettle,
      onRotate,
      onContextMenu,
      onViewBoundsChange,
    };
  }, [placed, selectedId, material, style, cameraMode, backgroundColor, edgeColor, edgeThickness, edgeMode, onSelect, onMove, onSettle, onRotate, onContextMenu, onViewBoundsChange]);

  useEffect(() => {
    const mount = mountRef.current;
    const scene = new THREE.Scene();
    const initialBackground = normalizeHexColor(stateRef.current.backgroundColor, DEFAULT_RENDER_SETTINGS.backgroundColor);
    scene.background = new THREE.Color(initialBackground);

    const camera = new THREE.PerspectiveCamera(42, mount.clientWidth / mount.clientHeight, 0.1, 100);

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setClearColor(initialBackground, 1);
    renderer.shadowMap.enabled = true;
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

    function applyStageCameraView(mode, force = false) {
      if (!force && cameraView.mode === mode) return;
      cameraView.mode = mode;
      controls.target.set(0, 0, 0);
      if (mode === 'isometric') {
        camera.up.set(0, 1, 0);
        camera.position.set(-6.2, 6.4, 7.2);
        controls.enableRotate = true;
        controls.enablePan = true;
        controls.minDistance = 3;
        controls.maxDistance = 18;
        controls.maxPolarAngle = Math.PI * 0.47;
      } else {
        camera.up.set(0, 0, -1);
        camera.position.set(0, 12, 0.001);
        controls.enableRotate = false;
        controls.enablePan = true;
        controls.minDistance = 4;
        controls.maxDistance = 24;
      }
      camera.lookAt(controls.target);
      controls.update();
    }

    applyStageCameraView(stateRef.current.cameraMode || 'top', true);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const drag = { id: null, offset: new THREE.Vector3(), startX: 0, startY: 0, active: false, previous: null };
    const meshes = new Map();
    const group = new THREE.Group();
    const selectionOutline = createSelectionOutline();
    const lastViewBounds = { current: null };
    scene.add(group);
    scene.add(selectionOutline);

    scene.add(new THREE.HemisphereLight('#fff7e8', '#3e506b', 1.4));
    const light = new THREE.DirectionalLight('#ffffff', 2);
    light.position.set(3, 6, 4);
    light.castShadow = true;
    scene.add(light);

    const grid = new THREE.GridHelper(12, 24, '#d0c3a7', '#e5dac6');
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
      } = stateRef.current;
      const stageRenderSettings = normalizeRenderSettings({
        backgroundColor: stageBackgroundColor,
        edgeColor: stageEdgeColor,
        edgeThickness: stageEdgeThickness,
        edgeMode: stageEdgeMode,
      });
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
          mesh = createPieceObject(item);
          mesh.userData.id = item.id;
          mesh.userData.renderSignature = renderSignature;
          meshes.set(item.id, mesh);
          group.add(mesh);
        }
        mesh.position.set(item.x, 0, item.y);
        mesh.rotation.y = -item.rotation;
        mesh.scale.y = styleName === 'pattern' ? 0.35 : 1;
        applyPieceMaterial(mesh, item, materialName, item.id === selected);
        updateStageEdgeOverlay(mesh, item, styleName, materialName, stageRenderSettings);
      });
      updateSelectionOutline(selectionOutline, current.find((item) => item.id === selected));
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

    function pointerDown(event) {
      if (event.button !== 0) return;
      setPointer(event);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(Array.from(meshes.values()), true);
      if (!hits.length) {
        stateRef.current.onSelect(null);
        return;
      }
      const mesh = getPieceRoot(hits[0].object);
      const point = groundPoint();
      const current = stateRef.current.placed.find((item) => item.id === mesh.userData.id);
      drag.id = mesh.userData.id;
      drag.offset.copy(mesh.position).sub(point);
      drag.startX = event.clientX;
      drag.startY = event.clientY;
      drag.active = false;
      drag.previous = current ? { x: current.x, y: current.y, rotation: current.rotation } : null;
      stateRef.current.onSelect(drag.id);
      renderer.domElement.setPointerCapture(event.pointerId);
    }

    function pointerMove(event) {
      if (!drag.id) return;
      const moved = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
      if (!drag.active && moved < 4) return;
      drag.active = true;
      controls.enabled = false;
      setPointer(event);
      const point = groundPoint().add(drag.offset);
      stateRef.current.onMove(drag.id, { x: point.x, y: point.z });
    }

    function pointerUp(event) {
      if (!drag.id) return;
      const current = stateRef.current.placed.find((item) => item.id === drag.id);
      if (current && drag.active) stateRef.current.onSettle(drag.id, { x: current.x, y: current.y, previous: drag.previous });
      if (current && !drag.active) stateRef.current.onRotate(drag.id);
      drag.id = null;
      drag.active = false;
      drag.previous = null;
      controls.enabled = true;
      renderer.domElement.releasePointerCapture(event.pointerId);
    }

    function contextMenu(event) {
      event.preventDefault();
      setPointer(event);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(Array.from(meshes.values()), true);
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
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    }
    window.addEventListener('resize', resize);

    let frame;
    function animate() {
      syncMeshes();
      applyStageCameraView(stateRef.current.cameraMode || 'top');
      applyStageBackground(scene, renderer, stateRef.current.backgroundColor);
      controls.update();
      reportViewBounds();
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

  return <div className="stage-canvas" ref={mountRef} />;
}

function applyStageBackground(scene, renderer, backgroundColor) {
  const color = normalizeHexColor(backgroundColor, DEFAULT_RENDER_SETTINGS.backgroundColor);
  if (scene.userData.stageBackgroundColor === color) return;
  scene.userData.stageBackgroundColor = color;
  if (!scene.background?.isColor) scene.background = new THREE.Color(color);
  else scene.background.set(color);
  renderer.setClearColor(color, 1);
}

function updateStageEdgeOverlay(object, piece, styleName, materialName, renderSettings) {
  const isGlass = normalizeMaterialName(materialName) === 'glass';
  const thickness = Math.max(0, Number(renderSettings.edgeThickness) || 0);
  const signature = [
    pieceGeometrySignature(piece),
    styleName,
    isGlass ? 'glass' : 'solid',
    renderSettings.edgeColor,
    thickness,
    renderSettings.edgeMode,
  ].join('|');
  if (object.userData.stageEdgeSignature === signature) return;
  if (object.userData.stageEdgeOverlay) {
    object.remove(object.userData.stageEdgeOverlay);
    disposeObject(object.userData.stageEdgeOverlay);
    object.userData.stageEdgeOverlay = null;
  }
  object.userData.stageEdgeSignature = signature;
  if (thickness <= 0) return;
  const overlay = createStageEdgeOverlay(piece, renderSettings, isGlass);
  if (!overlay) return;
  object.userData.stageEdgeOverlay = overlay;
  object.add(overlay);
}

function createStageEdgeOverlay(piece, renderSettings, isGlass = false) {
  const segments = getRealFootprintSegments(piece).filter(([start, end]) => start && end);
  if (!segments.length) return null;
  const group = new THREE.Group();
  group.name = 'stage-edge-overlay';
  group.userData.isStageEdge = true;
  group.renderOrder = 8;
  const thickness = stageEdgeWorldThickness(renderSettings.edgeThickness);
  const material = new THREE.MeshBasicMaterial({
    color: renderSettings.edgeColor,
    depthTest: !isGlass,
    depthWrite: false,
    toneMapped: false,
  });
  const height = Math.max(0.02, Number(piece.height) || 0.18);
  const topY = height + thickness * 0.55;
  const bottomY = thickness * 0.55;
  segments.forEach(([start, end]) => {
    createStageEdgeBars(start, end, topY, thickness, material, renderSettings.edgeMode).forEach((bar) => group.add(bar));
    createStageEdgeBars(start, end, bottomY, thickness, material, renderSettings.edgeMode).forEach((bar) => group.add(bar));
  });
  uniqueSegmentCoordinatePoints(segments).forEach(([x, y]) => {
    const vertical = new THREE.Mesh(new THREE.BoxGeometry(thickness, height, thickness), material.clone());
    vertical.position.set(x, height / 2, y);
    vertical.renderOrder = 8;
    vertical.userData.isStageEdge = true;
    group.add(vertical);
  });
  material.dispose();
  return group;
}

function createStageEdgeBars(start, end, y, thickness, material, mode) {
  const dx = end[0] - start[0];
  const dz = end[1] - start[1];
  const length = Math.hypot(dx, dz);
  if (length <= 0.0001) return [];
  const offsets = mode === 'double' ? [-thickness * 1.6, thickness * 1.6] : [0];
  const normalX = -dz / length;
  const normalZ = dx / length;
  return offsets.map((offset) => {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(length, thickness, thickness), material.clone());
    bar.position.set((start[0] + end[0]) / 2 + normalX * offset, y, (start[1] + end[1]) / 2 + normalZ * offset);
    bar.rotation.y = -Math.atan2(dz, dx);
    bar.renderOrder = 8;
    bar.userData.isStageEdge = true;
    return bar;
  });
}

function stageEdgeWorldThickness(value) {
  const number = Math.max(0, Number(value) || DEFAULT_RENDER_SETTINGS.edgeThickness);
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

function createPieceObject(piece) {
  if (piece.type === 'glb' && (piece.glbDataUrl || piece.glbUrl)) return createGlbPieceObject(piece);
  if (piece.type === 'obj' && piece.objText) return createObjPieceObject(piece);
  return createShapePieceObject(piece);
}

function createSelectionOutline() {
  const geometry = new THREE.BufferGeometry();
  const material = new THREE.LineBasicMaterial({
    color: '#ffbf3f',
    linewidth: 2,
  });
  const outline = new THREE.LineSegments(geometry, material);
  outline.visible = false;
  outline.renderOrder = 2;
  return outline;
}

function updateSelectionOutline(outline, piece) {
  if (!piece) {
    outline.visible = false;
    return;
  }
  const positions = getRealFootprintSegments(piece).flatMap(([start, end]) =>
    [start, end].flatMap(([x, y]) => {
      const [rx, ry] = rotatePoint(x, y, piece.rotation);
      return [rx + piece.x, piece.height + 0.08, ry + piece.y];
    }),
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

function createGlbPieceObject(piece) {
  const root = new THREE.Group();
  const loader = new GLTFLoader();
  pieceModelToArrayBuffer(piece)
    .then((buffer) => {
      loader.parse(
        buffer,
        '',
        (gltf) => {
          const object = gltf.scene;
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
        },
        (error) => console.error('Failed to parse GLB piece', error),
      );
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

function applyPieceMaterial(object, piece, materialName, selected) {
  const isGlass = normalizeMaterialName(materialName) === 'glass';
  object.traverse((child) => {
    if (child.userData?.isStageEdge) return;
    if (!child.isMesh || !child.material) return;
    child.material.color.set(piece.color);
    child.material.metalness = isGlass ? 0 : 0.08;
    child.material.roughness = isGlass ? 0.04 : 0.42;
    child.material.transparent = isGlass;
    child.material.opacity = isGlass ? 0.42 : 1;
    child.material.depthWrite = !isGlass;
    child.material.side = isGlass ? THREE.DoubleSide : THREE.FrontSide;
    child.material.emissive?.set(selected ? '#362000' : '#000000');
    child.material.emissiveIntensity = selected ? 0.12 : 0;
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
    child.geometry?.dispose();
    if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose());
    else child.material?.dispose();
  });
}

function findBestSnap(moving, others) {
  const collided = collidingPieces(moving, others);
  const isColliding = collided.length > 0;
  const snapTargets = isColliding ? collided : others;
  const movingEdges = visibleWorldEdges(moving, [moving, ...others]);
  let best = null;
  snapTargets.forEach((target) => {
    if (moving.sourceId && target.sourceId && moving.sourceId === target.sourceId) return;
    const targetEdges = visibleWorldEdges(target, others);
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
        if (collidesWithAny(candidate, others)) return;
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

function findBestCollisionPlacement(moving, others) {
  const collided = collidingPieces(moving, others);
  if (!collided.length) return null;
  const movingEdges = visibleWorldEdges(moving, [moving, ...others]);
  let best = null;

  collided.forEach((target) => {
    if (moving.sourceId && target.sourceId && moving.sourceId === target.sourceId) return;
    const targetEdges = visibleWorldEdges(target, others);
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
          if (collidesWithAny(candidate, others)) return;
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
  const piecePolygon = collisionPolygon(piece);
  return others.filter((other) => polygonsOverlap(piecePolygon, collisionPolygon(other)));
}

function collisionPolygon(piece) {
  const points = getLocalCollisionPoints(piece).map(([x, y]) => {
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
  return getLocalSnapSegments(piece).map(([localStart, localEnd], localIndex) => {
    const [startX, startY] = rotatePoint(localStart[0], localStart[1], piece.rotation);
    const [endX, endY] = rotatePoint(localEnd[0], localEnd[1], piece.rotation);
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

function mergeDefaultPieces(stored) {
  const keptStored = stored.filter((piece) => !REMOVED_DEFAULT_PIECE_IDS.has(piece.id));
  const storedIds = new Set(keptStored.map((piece) => piece.id));
  return [...DEFAULT_PIECES.filter((piece) => !storedIds.has(piece.id)), ...keptStored];
}

function readAdminPieceSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(ADMIN_SETTINGS_STORAGE_KEY));
    return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
  } catch {
    return {};
  }
}

function saveAdminPieceSetting(piece) {
  const settings = readAdminPieceSettings();
  const nextSetting = {
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
  return {
    ...piece,
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

function serializeSceneModel(name, placed, style, material, renderSettings = DEFAULT_RENDER_SETTINGS) {
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
    pieces: placed.map(({ id, sourceId, name: pieceName, points, snapEdges, verticalEdges, displayEdges, sourceHeightPx, sourceWidthPx, sourceLengthPx, sourceFootprintScale, keepAspectRatio, analysisVersion, x, y, rotation, height, stageWidth, stageLength, color, type, objText, glbDataUrl, glbUrl, snappedTo }) => ({
      id,
      sourceId,
      name: pieceName,
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
      transform: { x, y, rotation, height, stageWidth, stageLength },
      material: { type: normalizedMaterial, color },
    })),
  };
}

function rehydrateScenePieces(model) {
  const sourcePieces = Array.isArray(model?.pieces) ? model.pieces : [];
  const idMap = new Map();
  const pieces = sourcePieces
    .map((piece) => {
      const oldId = piece.id || crypto.randomUUID();
      const transform = piece.transform || piece;
      const materialInfo = piece.material || {};
      const sourceId = piece.sourceId || slugify(piece.name || oldId) || oldId;
      const nextId = `${sourceId}-${crypto.randomUUID()}`;
      idMap.set(oldId, nextId);
      return {
        id: nextId,
        sourceId,
        name: piece.name || 'Imported model piece',
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
  return local.map(([x, y]) => {
    const [rx, ry] = rotatePoint(x, y, piece.rotation || 0);
    return [rx + (piece.x || 0), ry + (piece.y || 0)];
  });
}

async function renderSceneCanvas(placed, options = {}) {
  const view = options.view || 'top';
  if (view === 'isometric') return renderIsometricSceneCanvas(placed, options);
  const material = normalizeMaterialName(options.material);
  const renderSettings = normalizeRenderSettings(options.renderSettings);
  const orientation = options.orientation || 'landscape';
  const size = orientation === 'portrait' ? [2400, 3200] : [3200, 2400];
  const padding = 180;
  const projected = placed.map((piece) => {
    const footprint = worldFootprintPoints(piece);
    const height = Number(piece.height) || 0.18;
    return {
      piece,
      base: footprint.map(([x, y]) => projectExportPoint(x, y, 0, view)),
      top: footprint.map(([x, y]) => projectExportPoint(x, y, height, view)),
    };
  });
  const allPoints = projected.flatMap((item) => (view === 'isometric' ? [...item.base, ...item.top] : item.top));
  const xs = allPoints.map(([x]) => x);
  const ys = allPoints.map(([, y]) => y);
  const bounds = allPoints.length
    ? { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) }
    : { minX: -1, maxX: 1, minY: -1, maxY: 1 };
  const widthUnits = Math.max(bounds.maxX - bounds.minX, 1);
  const heightUnits = Math.max(bounds.maxY - bounds.minY, 1);
  const scale = Math.min((size[0] - padding * 2) / widthUnits, (size[1] - padding * 2) / heightUnits);
  const canvas = document.createElement('canvas');
  canvas.width = size[0];
  canvas.height = size[1];
  const context = canvas.getContext('2d');
  context.fillStyle = renderSettings.backgroundColor;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const offsetX = (canvas.width - widthUnits * scale) / 2;
  const offsetY = (canvas.height - heightUnits * scale) / 2;
  const project = ([x, y]) => [
    (x - bounds.minX) * scale + offsetX,
    canvas.height - ((y - bounds.minY) * scale + offsetY),
  ];

  context.save();
  context.strokeStyle = 'rgba(174, 152, 118, 0.22)';
  context.lineWidth = 1;
  if (view === 'top') {
    const gridStep = Math.max(0.25, Math.pow(2, Math.floor(Math.log2(Math.max(widthUnits, heightUnits) / 12))));
    for (let x = Math.floor(bounds.minX / gridStep) * gridStep; x <= bounds.maxX; x += gridStep) {
      const [px] = project([x, bounds.minY]);
      context.beginPath();
      context.moveTo(px, 0);
      context.lineTo(px, canvas.height);
      context.stroke();
    }
    for (let y = Math.floor(bounds.minY / gridStep) * gridStep; y <= bounds.maxY; y += gridStep) {
      const [, py] = project([bounds.minX, y]);
      context.beginPath();
      context.moveTo(0, py);
      context.lineTo(canvas.width, py);
      context.stroke();
    }
  }
  context.restore();

  const sorted = [...projected].sort((a, b) => {
    const ay = averagePointY(a.base);
    const by = averagePointY(b.base);
    return ay - by;
  });

  sorted.forEach(({ piece, base, top }) => {
    const topPoints = top.map(project);
    if (topPoints.length < 3) return;
    if (view === 'isometric') {
      const basePoints = base.map(project);
      for (let index = 0; index < topPoints.length; index += 1) {
        const next = (index + 1) % topPoints.length;
        const face = [basePoints[index], basePoints[next], topPoints[next], topPoints[index]];
        const shade = index % 2 === 0 ? 0.72 : 0.58;
        drawCanvasPolygon(context, face, shadeColor(piece.color || '#1c7c74', shade), 'rgba(18, 63, 58, 0.35)', Math.max(1, scale * 0.01));
      }
    }
    context.save();
    context.beginPath();
    topPoints.forEach(([x, y], index) => {
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.closePath();
    context.shadowColor = 'rgba(45, 35, 22, 0.22)';
    context.shadowBlur = 18;
    context.shadowOffsetX = 8;
    context.shadowOffsetY = 10;
    if (material === 'glass') {
      context.globalCompositeOperation = 'multiply';
      context.globalAlpha = 0.62;
    } else {
      context.globalCompositeOperation = 'source-over';
      context.globalAlpha = 1;
    }
    context.fillStyle = canvasMaterialFill(context, material, piece.color || '#1c7c74', renderSettings.backgroundColor);
    context.fill();
    if (material === 'glass') {
      drawGlassReflectionSheen(context, topPoints, renderSettings.backgroundColor);
    }
    context.globalCompositeOperation = 'source-over';
    context.globalAlpha = 1;
    context.shadowColor = 'transparent';
    strokeCanvasPath(context, topPoints, {
      color: renderSettings.edgeColor || materialStrokeColor(material, piece.color || '#1c7c74'),
      lineWidth: renderSettings.edgeThickness,
      mode: renderSettings.edgeMode,
      gapColor: renderSettings.backgroundColor,
      closed: true,
    });
    context.restore();
  });

  context.fillStyle = '#4f4538';
  context.font = '24px Inter, Arial, sans-serif';
  context.fillText(`Girih ${view === 'isometric' ? 'isometric' : 'flat top'} ${options.style || 'model'} export`, 32, canvas.height - 34);
  return canvas;
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
  if (mode === 'double') {
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
  sheen.addColorStop(0, `rgba(255, 255, 255, 0.38)`);
  sheen.addColorStop(0.22, rgbaFromRgb(ambient, 0.26));
  sheen.addColorStop(0.55, `rgba(255, 255, 255, 0.08)`);
  sheen.addColorStop(1, rgbaFromRgb(ambient, 0.18));

  context.save();
  traceCanvasPolygon(context, points);
  context.clip();
  context.globalCompositeOperation = 'screen';
  context.globalAlpha = 0.55;
  context.fillStyle = sheen;
  context.fillRect(minX, minY, width, height);

  context.globalAlpha = 0.32;
  context.strokeStyle = 'rgba(255,255,255,0.72)';
  context.lineWidth = Math.max(1.5, Math.min(width, height) * 0.035);
  context.beginPath();
  context.moveTo(minX + width * 0.14, minY + height * 0.2);
  context.lineTo(maxX - width * 0.16, minY + height * 0.48);
  context.stroke();

  context.globalAlpha = 0.18;
  context.strokeStyle = rgbaFromRgb(ambient, 0.9);
  context.lineWidth = Math.max(1, Math.min(width, height) * 0.018);
  context.beginPath();
  context.moveTo(minX + width * 0.26, maxY - height * 0.16);
  context.lineTo(maxX - width * 0.1, minY + height * 0.22);
  context.stroke();
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
  const vivid = saturateRgb(piece, 1.85);
  const rgb = {
    r: clampColor(vivid.r * 1.08 + 6),
    g: clampColor(vivid.g * 1.08 + 6),
    b: clampColor(vivid.b * 1.08 + 6),
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
  if (material === 'ceramic' || material === 'stone' || material === 'brass') return 'plastic';
  return 'conceptual';
}

function normalizeRenderSettings(settings = {}) {
  const source = settings || {};
  const edgeThickness = Number(source.edgeThickness);
  return {
    backgroundColor: normalizeHexColor(source.backgroundColor, DEFAULT_RENDER_SETTINGS.backgroundColor),
    edgeColor: normalizeHexColor(source.edgeColor, DEFAULT_RENDER_SETTINGS.edgeColor),
    edgeThickness: Number.isFinite(edgeThickness) && edgeThickness >= 0 ? edgeThickness : DEFAULT_RENDER_SETTINGS.edgeThickness,
    edgeMode: EDGE_LINE_MODES.has(source.edgeMode) ? source.edgeMode : DEFAULT_RENDER_SETTINGS.edgeMode,
  };
}

function normalizeHexColor(value, fallback) {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function materialStrokeColor(material, color) {
  if (material === 'glass') return shadeColor(color, 0.82);
  if (material === 'marble') return '#b8aa98';
  if (material === 'tile') return '#f5eee3';
  if (material === 'wood') return '#5a351f';
  if (material === 'conceptual') return shadeColor(color, 0.62);
  return '#123f3a';
}

function canvasMaterialFill(context, material, color, backgroundColor = DEFAULT_RENDER_SETTINGS.backgroundColor) {
  if (material === 'marble' || material === 'tile' || material === 'wood') {
    return context.createPattern(createMaterialPatternCanvas(color, material, 256), 'repeat') || color;
  }
  if (material === 'glass') return glassTintColor(color);
  return color;
}

async function renderIsometricSceneCanvas(placed, options = {}) {
  const renderSettings = normalizeRenderSettings(options.renderSettings);
  const exportMaterial = normalizeMaterialName(options.material);
  const orientation = options.orientation || 'landscape';
  const size = orientation === 'portrait' ? [2400, 3200] : [3200, 2400];
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(size[0], size[1], false);
  renderer.setClearColor(renderSettings.backgroundColor, 1);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(renderSettings.backgroundColor);
  const environment = exportMaterial === 'glass' ? createGlassEnvironmentMap(renderSettings.backgroundColor) : null;
  if (environment) scene.environment = environment;
  const glassRearColor = exportMaterial === 'glass' ? rgbToHex(ambientGlassColor(renderSettings.backgroundColor)) : '#ffffff';
  const group = new THREE.Group();
  scene.add(group);

  const ambient = new THREE.HemisphereLight(
    '#ffffff',
    exportMaterial === 'glass' ? '#343434' : '#4f4a42',
    exportMaterial === 'glass' ? 1.9 : 2,
  );
  scene.add(ambient);
  const key = new THREE.DirectionalLight('#ffffff', 2.1);
  key.position.set(-5, 8, 4);
  scene.add(key);
  const fill = new THREE.DirectionalLight(exportMaterial === 'glass' ? glassRearColor : '#ffffff', exportMaterial === 'glass' ? 0.95 : 0.45);
  fill.position.set(5, 4, -6);
  scene.add(fill);

  for (const piece of placed) {
    const object = await createExportPieceObject(piece);
    object.userData.id = piece.id;
    object.position.set(piece.x, 0, piece.y);
    object.rotation.y = -piece.rotation;
    object.scale.y = options.style === 'pattern' ? 0.35 : 1;
    applyExportPieceMaterial(object, piece, options.material, renderSettings);
    group.add(object);
  }

  const bounds = new THREE.Box3().setFromObject(group);
  const center = bounds.getCenter(new THREE.Vector3());
  const sizeVector = bounds.getSize(new THREE.Vector3());
  const radius = Math.max(sizeVector.x, sizeVector.y * 2.3, sizeVector.z, 1);
  const aspect = size[0] / size[1];
  const frustum = radius * 1.8;
  const camera = new THREE.OrthographicCamera(
    (-frustum * aspect) / 2,
    (frustum * aspect) / 2,
    frustum / 2,
    -frustum / 2,
    0.01,
    1000,
  );

  const distance = Math.max(radius * 3.2, 6);
  camera.position.set(center.x - distance, center.y + distance * 0.9, center.z + distance);
  camera.lookAt(center);
  camera.updateProjectionMatrix();

  renderer.render(scene, camera);
  const canvas = document.createElement('canvas');
  canvas.width = size[0];
  canvas.height = size[1];
  const context = canvas.getContext('2d');
  context.drawImage(renderer.domElement, 0, 0);
  drawIsometricEdgeOverlay(context, placed, camera, size, renderSettings, options.style);
  context.fillStyle = '#4f4538';
  context.font = '24px Inter, Arial, sans-serif';
  context.fillText(`Girih isometric ${options.style || 'model'} export`, 32, canvas.height - 34);

  disposeObject(group);
  environment.dispose?.();
  renderer.dispose();
  return canvas;
}

function createGlassEnvironmentMap(backgroundColor) {
  const ambient = ambientGlassColor(backgroundColor);
  const warm = { r: 255, g: 248, b: 226 };
  const cool = { r: 185, g: 241, b: 255 };
  const dark = { r: 48, g: 68, b: 78 };
  const neutral = { r: 244, g: 248, b: 250 };
  const glint = {
    r: clampColor(ambient.r * 0.55 + 255 * 0.45),
    g: clampColor(ambient.g * 0.55 + 255 * 0.45),
    b: clampColor(ambient.b * 0.55 + 255 * 0.45),
  };
  const faces = [
    [ambient, glint],
    [warm, neutral],
    [neutral, glint],
    [cool, dark],
    [warm, neutral],
    [ambient, dark],
  ];
  const canvases = faces.map(([start, end], index) => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d');
    const gradient = context.createLinearGradient(index % 2 ? 64 : 0, 0, index % 2 ? 0 : 64, 64);
    gradient.addColorStop(0, rgbaFromRgb(start, 1));
    gradient.addColorStop(0.48, rgbaFromRgb(glint, 0.78));
    gradient.addColorStop(1, rgbaFromRgb(end, 1));
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
    context.globalAlpha = 0.34;
    context.fillStyle = rgbaFromRgb(glint, 0.9);
    context.fillRect(index % 3 === 0 ? 6 : 34, index % 2 === 0 ? 8 : 38, 20, 10);
    return canvas;
  });
  const texture = new THREE.CubeTexture(canvases);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function drawIsometricEdgeOverlay(context, placed, camera, size, renderSettings, styleName) {
  camera.updateMatrixWorld(true);
  const project = (x, y, z) => {
    const projected = new THREE.Vector3(x, y, z).project(camera);
    return [(projected.x * 0.5 + 0.5) * size[0], (-projected.y * 0.5 + 0.5) * size[1]];
  };
  placed.forEach((piece) => {
    const topSegments = worldRenderSegments(piece);
    if (!topSegments.length) return;
    const height = Math.max(0.02, Number(piece.height) || 0.18) * (styleName === 'pattern' ? 0.35 : 1);
    topSegments.forEach(([start, end]) => {
      strokeCanvasPath(context, [project(start.x, height, start.y), project(end.x, height, end.y)], {
        color: renderSettings.edgeColor,
        lineWidth: renderSettings.edgeThickness,
        mode: renderSettings.edgeMode,
        gapColor: renderSettings.backgroundColor,
        closed: false,
      });
    });
    topSegments.forEach(([start, end]) => {
      strokeCanvasPath(context, [project(start.x, 0, start.y), project(end.x, 0, end.y)], {
        color: renderSettings.edgeColor,
        lineWidth: renderSettings.edgeThickness,
        mode: renderSettings.edgeMode,
        gapColor: renderSettings.backgroundColor,
        closed: false,
      });
    });
    const footprint = worldFootprintPoints(piece);
    if (footprint.length >= 3) {
      const top = footprint.map(([x, y]) => project(x, height, y));
      strokeCanvasPath(context, top, {
        color: renderSettings.edgeColor,
        lineWidth: renderSettings.edgeThickness,
        mode: renderSettings.edgeMode,
        gapColor: renderSettings.backgroundColor,
        closed: true,
      });
    }
    uniqueSegmentPoints(topSegments).forEach((point) => {
      strokeCanvasPath(context, [project(point.x, 0, point.y), project(point.x, height, point.y)], {
        color: renderSettings.edgeColor,
        lineWidth: renderSettings.edgeThickness,
        mode: renderSettings.edgeMode,
        gapColor: renderSettings.backgroundColor,
        closed: false,
      });
    });
  });
}

function worldRenderSegments(piece) {
  const localSegments = getExportFootprintSegments(piece);
  const rotation = Number(piece.rotation) || 0;
  return localSegments.map(([localStart, localEnd]) => {
    const [startX, startY] = rotatePoint(localStart[0], localStart[1], rotation);
    const [endX, endY] = rotatePoint(localEnd[0], localEnd[1], rotation);
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
  const mesh = new THREE.Mesh(geometry, createExportMaterial(piece, 'conceptual'));
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

function applyExportPieceMaterial(object, piece, materialName, renderSettings = DEFAULT_RENDER_SETTINGS) {
  const normalizedMaterialName = normalizeMaterialName(materialName);
  const material = createExportMaterial(piece, normalizedMaterialName, renderSettings);
  object.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = normalizedMaterialName !== 'glass';
    child.receiveShadow = normalizedMaterialName !== 'glass';
    child.material?.dispose?.();
    child.material = material.clone();
  });
  material.dispose();
}

function createExportMaterial(piece, materialName = 'conceptual', renderSettings = DEFAULT_RENDER_SETTINGS) {
  const material = normalizeMaterialName(materialName);
  const color = piece.color || '#1c7c74';
  if (material === 'glass') {
    const glassColor = glassTintColor(color);
    return new THREE.MeshPhysicalMaterial({
      color: glassColor,
      metalness: 0,
      roughness: 0.01,
      transmission: 0.66,
      thickness: 0.72,
      ior: 1.45,
      transparent: true,
      opacity: 0.56,
      depthWrite: false,
      blending: THREE.NormalBlending,
      clearcoat: 1,
      clearcoatRoughness: 0.01,
      specularIntensity: 1,
      specularColor: '#ffffff',
      reflectivity: 1,
      attenuationColor: glassColor,
      attenuationDistance: 1.25,
      envMapIntensity: 1.65,
      side: THREE.DoubleSide,
    });
  }

  const texture = material === 'plastic' || material === 'conceptual' ? null : createMaterialTexture(color, material);
  return new THREE.MeshStandardMaterial({
    color: material === 'marble' || material === 'tile' || material === 'wood' ? '#ffffff' : color,
    map: texture,
    metalness: material === 'conceptual' ? 0.08 : 0,
    roughness: material === 'conceptual' ? 0.42 : material === 'plastic' ? 0.36 : material === 'tile' ? 0.18 : material === 'wood' ? 0.58 : 0.24,
    envMapIntensity: material === 'conceptual' ? 0.25 : material === 'tile' ? 0.75 : 0.35,
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
    if (!blob) return;
    downloadBlob(filename, blob);
  }, 'image/png');
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

function toObj(scene) {
  const lines = [`# Girih export`, `# material=${scene.material}`, `# style=${scene.style}`];
  let vertexOffset = 1;
  scene.pieces.forEach((piece) => {
    lines.push(`o ${piece.name.replace(/\s+/g, '_')}_${piece.id}`);
    piece.points.forEach(([x, y]) => {
      const [rx, ry] = rotatePoint(x, y, piece.transform.rotation);
      lines.push(`v ${(rx + piece.transform.x).toFixed(4)} 0 ${(ry + piece.transform.y).toFixed(4)}`);
    });
    const face = piece.points.map((_, index) => vertexOffset + index).join(' ');
    lines.push(`f ${face}`);
    vertexOffset += piece.points.length;
  });
  return lines.join('\n');
}

createRoot(document.getElementById('root')).render(<App />);
