import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { ArrayBufferTarget, Muxer } from 'mp4-muxer';

const BUNDLED_MODULES = Array.from({ length: 9 }, (_, index) => ({
  id: `bundled:${index + 1}`,
  name: `M${index + 1}`,
  url: `/modules/M${index + 1}.glb`,
}));
const STANDARD_MODULE_HEIGHT = 0.512;
const GROUND_SIZE = 40;
const GROUND_HALF_SIZE = GROUND_SIZE / 2;
const VIDEO_WIDTH = 1920;
const VIDEO_HEIGHT = 1080;
const VIDEO_FPS = 30;
const VIDEO_BITRATE = 20000000;
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const WALL_SIDES = ['north', 'east', 'south', 'west'];
const STAGE_TEXTURE_SLOTS = ['map', 'alphaMap', 'aoMap', 'lightMap', 'normalMap', 'bumpMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'displacementMap'];
const ORIGINAL_MATERIAL_TEXTURES = new WeakMap();
const GIRIH_STAGE_MATERIAL = Object.freeze({ roughness: 0.42, metalness: 0.08 });
const GIRIH_STAGE_HEMISPHERE = Object.freeze({ sky: '#fff7e8', ground: '#3e506b', intensity: 1.4 });
const GIRIH_STAGE_KEY = Object.freeze({ color: '#ffffff', intensity: 2, position: [3, 6, 4] });
const DEFAULT_WALL_COLOR = '#b78b5d';
const DEFAULT_NIGHT_LIGHT = Object.freeze({
  enabled: true,
  color: '#ffd7a0',
  intensity: 120,
  distance: 12,
  angle: 35,
  penumbra: 0.55,
  decay: 2,
  position: Object.freeze([0, 2.4, 1.5]),
  target: Object.freeze([0, 1.1, 0]),
});
const DEFAULT_SOUTH_OPENINGS = Object.freeze({
  door: Object.freeze({ enabled: false, width: 1, height: 2.1, position: 0 }),
  window: Object.freeze({ enabled: false, width: 1, height: 1.2, position: 0, sillHeight: null }),
});
const DEFAULT_POINTED_ARCH = Object.freeze({
  enabled: false,
  greenOffset: null,
  greenHeight: null,
});
const DEFAULT_NORTH_WALL = Object.freeze({
  outwardWidth: 1.5,
  minHeight: null,
  archTopExtension: 1,
});
const DEFAULT_NORTH_BOUNDARY = Object.freeze({
  enabled: false,
  depth: 0.2,
  color: '#79610c',
  thickness: 4,
});
const DEFAULT_WALL_EDGES = Object.freeze({
  enabled: false,
  color: '#79610c',
  thickness: 2,
});
const DEFAULT_WALL_BRICK_PATTERN = Object.freeze({
  enabled: true,
  brickWidth: 0.215,
  brickHeight: 0.065,
  mortar: 0.01,
  mortarColor: '#d8c7a3',
  bondPattern: Object.freeze({
    courses: Object.freeze([
      Object.freeze({ offset: 0, bricks: Object.freeze([1]) }),
      Object.freeze({ offset: 0.5, bricks: Object.freeze([1]) }),
    ]),
  }),
});
const MAX_BOND_COURSES = 8;
const MAX_BOND_BRICKS_PER_COURSE = 8;

export const DEFAULT_LEVELS = Object.freeze([
  { id: 'tier-1', name: 'Tier 1', height: 0.4 },
]);

export class MuqarnasScene {
  constructor(container, callbacks = {}) {
    this.container = container;
    this.callbacks = callbacks;
    this.library = new Map();
    this.instances = new Map();
    this.selected = null;
    this.selectedRoots = [];
    this.mode = 'translate';
    this.freeDrag = null;
    this.miniDrag = null;
    this.sliceDraft = null;
    this.sliceCorners = [];
    this.levels = DEFAULT_LEVELS.map((level) => ({ ...level }));
    this.activeLevelId = this.levels[0].id;
    this.snap = { enabled: true, gridSize: 0.01, snapDistance: 0.08 };
    this.connectorsVisible = true;
    this.shadowsEnabled = true;
    this.globalMaterial = 'matte';
    this.moduleColor = '#f2d336';
    this.edgeSettings = { enabled: false, thickness: 4, color: '#ffffff', verticalLines: true };
    this.thumbnailRenderer = null;
    this.exportEnvironment = null;
    this.mainView = 'perspective';
    this.walk = { enabled: false, eyeLevel: 1.65, yaw: 0, pitch: 0, keys: new Set(), lookDrag: null, returnState: null, lastTime: performance.now() };
    this.assemblyAnimation = null;
    this.miniViewAssignments = { front: 'front', top: 'top' };
    this.walls = { enabled: false, thickness: 0.4, color: DEFAULT_WALL_COLOR, material: 'matte', openSides: [], extraHeights: Object.fromEntries(WALL_SIDES.map((side) => [side, 0])), sideOffsets: Object.fromEntries(WALL_SIDES.map((side) => [side, 0])), brickPattern: normalizeWallBrickPattern(), southOpenings: normalizeSouthOpenings(), pointedArch: normalizePointedArch(), northWall: normalizeNorthWall(), northBoundary: normalizeNorthBoundary(), wallEdges: normalizeWallEdges() };
    this.nightLights = [];
    this.selectedNightLightId = null;
    this.nightPreview = false;
    this.nightLightGuidesVisible = false;
    this.nightLightObjects = new Map();
    this.nightLightDrag = null;
    this.wallSignature = '';
    this.history = [];
    this.historyIndex = -1;
    this.historyLimit = 80;
    this.restoringHistory = false;
    this.pointer = new THREE.Vector2();
    this.raycaster = new THREE.Raycaster();
    this.resizeObserver = new ResizeObserver(() => this.resize());

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#dceff8');
    this.scene.fog = new THREE.Fog('#dceff8', 45, 110);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.01, 500);
    this.camera.up.set(0, 1, 0);
    this.camera.position.set(10, 9, 13);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.toneMappingExposure = 1;
    if ('physicallyCorrectLights' in this.renderer) this.renderer.physicallyCorrectLights = false;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.localClippingEnabled = true;
    this.container.appendChild(this.renderer.domElement);

    this.orbit = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbit.enableDamping = true;
    this.orbit.dampingFactor = 0.075;
    this.orbit.rotateSpeed = 0.55;
    this.orbit.minPolarAngle = THREE.MathUtils.degToRad(3);
    this.orbit.maxPolarAngle = THREE.MathUtils.degToRad(88);
    this.orbit.minDistance = 0.25;
    this.orbit.maxDistance = 45;
    this.orbit.screenSpacePanning = false;
    this.orbit.target.set(0, 1.2, 0);

    this.transform = new TransformControls(this.camera, this.renderer.domElement);
    this.transform.setSize(0.78);
    this.transformHelper = this.transform.getHelper();
    this.scene.add(this.transformHelper);
    this.transform.addEventListener('dragging-changed', (event) => {
      this.orbit.enabled = !event.value && this.mainView === 'perspective';
      if (event.value) {
        this.prepareHistoryChange();
        this.transformStart = new Map(this.selectedRoots.map((root) => [root, {
          position: root.position.clone(),
          quaternion: root.quaternion.clone(),
          scale: root.scale.clone(),
        }]));
        if (this.transform.object === this.groupProxy) this.beginGroupProxyTransform();
      }
    });
    this.transform.addEventListener('objectChange', () => {
      if (this.transform.object === this.groupProxy) this.applyGroupProxyTransform();
      this.refreshSelectionHighlights();
      this.emitSelection();
    });
    this.transform.addEventListener('mouseUp', () => {
      if (this.snap.enabled) this.snapSelectedToConnector();
      this.selectedRoots.forEach((root) => this.placeRootOnTier(root));
      this.constrainRootsToGround(this.selectedRoots);
      const movingSet = new Set(this.selectedRoots);
      const overlapPrevented = this.snap.enabled && this.selectedRoots.some((root) => this.rootOverlapsAnother(root, movingSet));
      if (overlapPrevented && this.transformStart) {
        this.transformStart.forEach((transform, root) => {
          root.position.copy(transform.position);
          root.quaternion.copy(transform.quaternion);
          root.scale.copy(transform.scale);
          root.updateMatrixWorld(true);
        });
        this.callbacks.onStatus?.('Transform reverted because modules cannot overlap. Snap exterior vertical faces together instead.');
      }
      this.updateTransformTarget();
      this.groupTransformStart = null;
      this.transformStart = null;
      this.refreshSelectionHighlights();
      this.emitSelection();
      this.emitStats();
      this.recordHistory('Transform module');
    });

    this.assembly = new THREE.Group();
    this.assembly.name = 'Muqarnas assembly';
    this.scene.add(this.assembly);
    this.archModuleInfillGroup = new THREE.Group();
    this.archModuleInfillGroup.name = 'Top module extensions to pointed vault';
    this.archModuleInfillGroup.visible = false;
    this.assembly.add(this.archModuleInfillGroup);
    this.wallGroup = new THREE.Group();
    this.wallGroup.name = 'Model frame walls';
    this.wallGroup.userData.isWallGroup = true;
    this.wallGeometry = new THREE.BoxGeometry(1, 1, 1);
    this.southOpeningBrickMapping = null;
    this.northBrickArchMapping = null;
    this.wallSideMaterials = new Map(WALL_SIDES.map((side) => {
      const material = new THREE.MeshStandardMaterial({ color: this.walls.color, ...GIRIH_STAGE_MATERIAL });
      configureWallBrickMaterial(
        material,
        wallPatternForSide(this.walls.brickPattern, side),
        null,
        side === 'south' ? this.southOpeningBrickMapping : null,
        decorativeFaceForWall(side),
      );
      return [side, material];
    }));
    this.wallMaterial = this.wallSideMaterials.get('south');
    this.northOuterBrickMaterial = new THREE.MeshStandardMaterial({ color: this.walls.color, ...GIRIH_STAGE_MATERIAL });
    configureWallBrickMaterial(
      this.northOuterBrickMaterial,
      wallPatternForSide(this.walls.brickPattern, 'north'),
      this.northBrickArchMapping,
      null,
      decorativeFaceForWall('north'),
    );
    this.edgeMaterial = new LineMaterial({ color: this.edgeSettings.color, linewidth: this.edgeSettings.thickness, worldUnits: false, transparent: true, opacity: 0.92, depthTest: true, depthWrite: false, side: THREE.DoubleSide });
    this.edgeMaterial.visible = this.edgeSettings.enabled;
    this.wallEdgeMaterial = new LineMaterial({ color: this.walls.wallEdges.color, linewidth: this.walls.wallEdges.thickness, worldUnits: false, transparent: true, opacity: 0.94, depthTest: true, depthWrite: false, side: THREE.DoubleSide });
    this.wallEdgeMaterial.visible = this.walls.wallEdges.enabled;
    this.wallMeshes = new Map(WALL_SIDES.map((side) => {
      const mesh = new THREE.Mesh(this.wallGeometry, this.wallSideMaterials.get(side));
      mesh.name = `${side[0].toUpperCase()}${side.slice(1)} frame wall`;
      mesh.userData.wallSide = side;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.wallGroup.add(mesh);
      return [side, mesh];
    }));
    this.southWallSegments = new THREE.Group();
    this.southWallSegments.name = 'South wall opening segments';
    this.wallGroup.add(this.southWallSegments);
    this.northBoundaryMaterial = new LineMaterial({ color: this.walls.northBoundary.color, linewidth: this.walls.northBoundary.thickness, worldUnits: false, transparent: true, opacity: 0.94, depthTest: true, depthWrite: false });
    this.northBoundaryGroup = new THREE.Group();
    this.northBoundaryGroup.name = 'North wall inset boundary';
    this.northBoundaryGroup.userData.isNorthBoundaryGroup = true;
    this.northBoundaryGroup.visible = false;
    this.wallGroup.add(this.northBoundaryGroup);
    this.northRecessFrameMesh = new THREE.Mesh(new THREE.BufferGeometry(), this.northOuterBrickMaterial);
    this.northRecessFrameMesh.name = 'North wall raised inset frame';
    this.northRecessFrameMesh.userData.wallSide = 'north';
    this.northRecessFrameMesh.userData.isNorthOuterFrame = true;
    this.northRecessFrameMesh.castShadow = true;
    this.northRecessFrameMesh.receiveShadow = true;
    this.northRecessFrameMesh.visible = false;
    this.wallGroup.add(this.northRecessFrameMesh);
    this.pointedArchMesh = new THREE.Mesh(new THREE.BufferGeometry(), this.wallMaterial);
    this.pointedArchMesh.name = 'Mirrored pointed arch';
    this.pointedArchMesh.userData.wallSide = 'south';
    this.pointedArchMesh.castShadow = true;
    this.pointedArchMesh.receiveShadow = true;
    this.pointedArchMesh.visible = false;
    this.wallGroup.add(this.pointedArchMesh);
    this.southArchInfillMesh = new THREE.Mesh(new THREE.BufferGeometry(), this.wallMaterial);
    this.southArchInfillMesh.name = 'South wall pointed-arch infill';
    this.southArchInfillMesh.userData.wallSide = 'south';
    this.southArchInfillMesh.castShadow = true;
    this.southArchInfillMesh.receiveShadow = true;
    this.southArchInfillMesh.visible = false;
    this.wallGroup.add(this.southArchInfillMesh);
    this.archPointGeometry = new THREE.SphereGeometry(0.09, 16, 12);
    this.archPointMaterials = {
      red: new THREE.MeshBasicMaterial({ color: 0xe02b2b, depthTest: false, depthWrite: false }),
      green: new THREE.MeshBasicMaterial({ color: 0x16a34a, depthTest: false, depthWrite: false }),
    };
    this.archPointGroup = new THREE.Group();
    this.archPointGroup.name = 'Pointed arch construction centers';
    this.archPointGroup.visible = false;
    this.archPointMeshes = [
      new THREE.Mesh(this.archPointGeometry, this.archPointMaterials.red),
      new THREE.Mesh(this.archPointGeometry, this.archPointMaterials.green),
      new THREE.Mesh(this.archPointGeometry, this.archPointMaterials.green),
    ];
    this.archPointMeshes.forEach((point) => {
      point.renderOrder = 100;
      point.frustumCulled = false;
      this.archPointGroup.add(point);
    });
    this.scene.add(this.archPointGroup);
    this.wallGroup.visible = false;
    this.scene.add(this.wallGroup);
    this.miniWallOutlineGroup = new THREE.Group();
    this.miniWallOutlineGroup.name = 'Mini viewport wall and arch outlines';
    this.miniWallOutlineGroup.visible = false;
    this.miniWallOutlineMaterial = new THREE.LineBasicMaterial({ color: 0x111111, depthTest: false, depthWrite: false });
    this.miniWallOutlineSignature = '';
    this.scene.add(this.miniWallOutlineGroup);
    this.groupProxy = new THREE.Object3D();
    this.groupProxy.name = 'Group transform proxy';
    this.scene.add(this.groupProxy);
    this.frontGuideGroup = new THREE.Group();
    this.frontGuideGroup.name = 'Tier guides';
    this.scene.add(this.frontGuideGroup);
    this.frontLevelMaterials = new Map();
    this.frontFocusMaterial = new THREE.MeshStandardMaterial({
      color: 0xe87522,
      ...GIRIH_STAGE_MATERIAL,
      side: THREE.DoubleSide,
    });
    this.connectorGroup = new THREE.Group();
    this.scene.add(this.connectorGroup);
    this.connectorGeometry = new THREE.SphereGeometry(0.055, 12, 8);
    this.connectorMaterial = new THREE.MeshBasicMaterial({ color: 0xd8a84e, depthTest: false });
    this.selectionBounds = new THREE.Box3();
    this.selectionBox = new THREE.Box3Helper(this.selectionBounds, 0xb98132);
    this.selectionBox.visible = false;
    this.scene.add(this.selectionBox);
    this.selectionHighlightGroup = new THREE.Group();
    this.scene.add(this.selectionHighlightGroup);
    this.selectionOutlineMaterial = new THREE.LineBasicMaterial({ color: 0xffc857, depthTest: false, transparent: true, opacity: 0.96 });
    this.sliceGuideGroup = new THREE.Group();
    this.sliceGuideGroup.name = 'Top view slice guides';
    this.sliceGuideGroup.visible = false;
    this.scene.add(this.sliceGuideGroup);
    this.sliceCornerMaterial = new THREE.PointsMaterial({ color: 0xff5a36, size: 8, sizeAttenuation: false, depthTest: false, depthWrite: false });
    this.sliceLineMaterial = new THREE.LineBasicMaterial({ color: 0xff3b30, depthTest: false, depthWrite: false, transparent: true, opacity: 0.96 });
    this.topOutlineGroup = new THREE.Group();
    this.topOutlineGroup.visible = false;
    this.scene.add(this.topOutlineGroup);
    this.topOutlineInstances = new Map();
    this.topOutlineMaterial = new THREE.LineBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false, toneMapped: false });
    this.frontOutlineGroup = new THREE.Group();
    this.frontOutlineGroup.visible = false;
    this.scene.add(this.frontOutlineGroup);
    this.frontOutlineInstances = new Map();
    this.frontOutlineMaterial = new THREE.LineBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false, toneMapped: false });
    this.nightLightGroup = new THREE.Group();
    this.nightLightGroup.name = 'Night spotlight placement guides';
    this.scene.add(this.nightLightGroup);
    this.topTierMaterials = ['#2f80c9'].map((color) => new THREE.MeshBasicMaterial({
      color,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    }));
    this.selectionMarquee = document.createElement('div');
    this.selectionMarquee.className = 'selection-marquee';
    this.container.appendChild(this.selectionMarquee);

    this.addEnvironment();
    this.rebuildLevelGuides();
    this.bindEvents();
    this.resizeObserver.observe(container);
    this.resize();
    this.resetHistory();
    this.animate();
  }

  addEnvironment() {
    const hemisphere = new THREE.HemisphereLight(
      GIRIH_STAGE_HEMISPHERE.sky,
      GIRIH_STAGE_HEMISPHERE.ground,
      GIRIH_STAGE_HEMISPHERE.intensity,
    );
    this.hemisphere = hemisphere;
    this.scene.add(hemisphere);
    const sun = new THREE.DirectionalLight(GIRIH_STAGE_KEY.color, GIRIH_STAGE_KEY.intensity);
    sun.position.set(...GIRIH_STAGE_KEY.position);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 30;
    sun.shadow.camera.left = -20;
    sun.shadow.camera.right = 20;
    sun.shadow.camera.top = 20;
    sun.shadow.camera.bottom = -20;
    sun.shadow.bias = -0.0002;
    this.sun = sun;
    this.scene.add(sun);

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE), new THREE.MeshStandardMaterial({ color: '#fbf0bc', roughness: 0.64, metalness: 0 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.006;
    floor.receiveShadow = true;
    this.floor = floor;
    floor.userData.ignoreRaycast = true;
    this.scene.add(floor);
    const grid = new THREE.GridHelper(GROUND_SIZE, 80, 0x8a7963, 0xcfc2b0);
    grid.material.opacity = 0.42;
    grid.material.transparent = true;
    grid.userData.ignoreRaycast = true;
    this.grid = grid;
    this.scene.add(grid);
  }

  bindEvents() {
    this.onPointerDown = (event) => {
      if (this.assemblyAnimation) return;
      if (this.transform.dragging || event.button !== 0) return;
      if (this.walk.enabled) {
        this.walk.lookDrag = { x: event.clientX, y: event.clientY };
        this.renderer.domElement.style.cursor = 'grabbing';
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      const nightHandle = this.nightHandleAtClientPoint(event.clientX, event.clientY);
      if (nightHandle) {
        this.startNightLightDrag(event, nightHandle);
        return;
      }
      if (this.mode === 'slice') {
        this.handleSlicePointerDown(event);
        return;
      }
      if (this.mode === 'box-select') {
        this.startBoxSelection(event);
        return;
      }
      const wall = this.mainView === 'perspective'
        ? this.wallAtClientPoint(event.clientX, event.clientY)
        : null;
      if (wall) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      const root = this.instanceAtClientPoint(event.clientX, event.clientY);
      if (!root && (this.mode === 'rotate' || this.mode === 'scale')) return;
      this.selectForView(root);
      if (root && this.mode === 'select' && this.mainView === 'perspective') {
        this.prepareHistoryChange();
        this.rotateSelectionQuarterTurn();
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (root && this.mode === 'translate') {
        const point = this.worldPointForMainDrag(event.clientX, event.clientY, root);
        if (!point) {
          this.prepareHistoryChange();
          this.rotateSelectionQuarterTurn();
          event.preventDefault();
          event.stopImmediatePropagation();
          return;
        }
        this.prepareHistoryChange();
        this.freeDrag = {
          root,
          offsetX: root.position.x - point.x,
          offsetZ: root.position.z - point.z,
          view: this.mainView,
          startX: event.clientX,
          startY: event.clientY,
          clickThreshold: event.pointerType === 'touch' ? 14 : event.pointerType === 'pen' ? 8 : 4,
          moved: false,
          positions: new Map(this.selectedRoots.map((selectedRoot) => [selectedRoot, selectedRoot.position.clone()])),
        };
        this.orbit.enabled = false;
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    this.onPointerMove = (event) => {
      if (this.walk.enabled && this.walk.lookDrag) {
        this.lockWalkCameraToGround();
        const deltaX = event.clientX - this.walk.lookDrag.x;
        const deltaY = event.clientY - this.walk.lookDrag.y;
        this.walk.lookDrag = { x: event.clientX, y: event.clientY };
        this.walk.yaw -= deltaX * 0.0032;
        this.walk.pitch = THREE.MathUtils.clamp(this.walk.pitch - deltaY * 0.0032, THREE.MathUtils.degToRad(-80), THREE.MathUtils.degToRad(80));
        this.updateWalkOrientation();
        event.preventDefault();
        return;
      }
      if (this.nightLightDrag) {
        this.updateNightLightDrag(event);
        return;
      }
      if (this.mode === 'slice') {
        this.updateSlicePointerPreview(event.clientX, event.clientY);
        return;
      }
      if (this.boxSelection) {
        this.updateBoxSelection(event);
        return;
      }
      if (this.miniDrag) {
        this.updateMiniDrag(event);
        return;
      }
      if (!this.freeDrag) return;
      if (!this.freeDrag.moved) {
        const pointerDistance = Math.hypot(event.clientX - this.freeDrag.startX, event.clientY - this.freeDrag.startY);
        if (pointerDistance < this.freeDrag.clickThreshold) return;
        this.freeDrag.moved = true;
      }
      const point = this.worldPointForMainDrag(event.clientX, event.clientY, this.freeDrag.root, this.freeDrag.view);
      if (!point) return;
      let x = point.x + this.freeDrag.offsetX;
      let z = this.freeDrag.view === 'front'
        ? this.freeDrag.positions.get(this.freeDrag.root).z
        : point.z + this.freeDrag.offsetZ;
      if (this.snap.enabled && this.snap.gridSize > 0) {
        x = Math.round(x / this.snap.gridSize) * this.snap.gridSize;
        z = Math.round(z / this.snap.gridSize) * this.snap.gridSize;
      }
      const startPosition = this.freeDrag.positions.get(this.freeDrag.root);
      const deltaX = x - startPosition.x;
      const deltaZ = z - startPosition.z;
      this.freeDrag.positions.forEach((position, root) => {
        root.position.x = position.x + deltaX;
        root.position.z = position.z + deltaZ;
        root.updateMatrixWorld(true);
      });
      this.constrainRootsToGround(this.selectedRoots);
      this.updateConnectorMarkers();
      this.refreshSelectionHighlights();
      this.emitSelection();
      event.preventDefault();
    };
    this.onPointerUp = (event) => {
      if (this.walk.lookDrag) {
        this.walk.lookDrag = null;
        this.renderer.domElement.style.cursor = this.walk.enabled ? 'crosshair' : '';
        event.preventDefault();
        return;
      }
      if (this.nightLightDrag) {
        this.finishNightLightDrag(event);
        return;
      }
      if (this.boxSelection) {
        this.finishBoxSelection(event);
        return;
      }
      if (this.miniDrag) {
        this.finishMiniDrag();
        return;
      }
      if (!this.freeDrag) return;
      const dragState = this.freeDrag;
      const movedRoot = dragState.root;
      this.freeDrag = null;
      this.orbit.enabled = this.mainView === 'perspective';
      this.selected = movedRoot;
      if (!dragState.moved) {
        if (dragState.view === 'perspective') this.rotateSelectionQuarterTurn();
        return;
      }
      if (this.snap.enabled) this.snapSelectedToConnector();
      this.selectedRoots.forEach((root) => this.placeRootOnTier(root));
      this.constrainRootsToGround(this.selectedRoots);
      const movingSet = new Set(this.selectedRoots);
      const overlapPrevented = this.snap.enabled && this.selectedRoots.some((root) => this.rootOverlapsAnother(root, movingSet));
      if (overlapPrevented) {
        dragState.positions.forEach((position, root) => {
          root.position.copy(position);
          this.placeRootOnTier(root);
        });
      }
      this.updateTransformTarget();
      this.refreshSelectionHighlights();
      this.emitSelection();
      this.emitStats();
      this.recordHistory('Move module');
      const movedLabel = this.selectedRoots.length > 1 ? `${this.selectedRoots.length} modules` : movedRoot.name;
      this.callbacks.onStatus?.(overlapPrevented
        ? `${movedLabel} returned to the previous position because modules cannot overlap.`
        : `${movedLabel} moved within the 40 m × 40 m ground.`);
    };
    this.onKeyDown = (event) => {
      if (/INPUT|TEXTAREA|SELECT/.test(event.target?.tagName)) return;
      if (this.assemblyAnimation) {
        if (event.key === 'Escape') this.stopAssemblyAnimation();
        return;
      }
      const commandKey = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (this.walk.enabled) {
        if (['w', 'a', 's', 'd', 'shift'].includes(key)) {
          this.walk.keys.add(key);
          event.preventDefault();
        } else if (key === 'escape') {
          this.setWalkEnabled(false);
          event.preventDefault();
        }
        return;
      }
      if (commandKey && key === 'z') { event.preventDefault(); event.shiftKey ? this.redo() : this.undo(); }
      else if (commandKey && key === 'y') { event.preventDefault(); this.redo(); }
      else if (key === 'escape' && this.mode === 'slice') { event.preventDefault(); this.cancelSliceDraft(); }
      else if (key === 'w') this.setMode('translate');
      else if (event.key.toLowerCase() === 'e') this.setMode('rotate');
      else if (event.key.toLowerCase() === 'r') this.setMode('scale');
      else if (event.key === 'ArrowUp') { event.preventDefault(); this.moveWorkingLevel(1); }
      else if (event.key === 'ArrowDown') { event.preventDefault(); this.moveWorkingLevel(-1); }
      else if (event.key === 'Delete' || event.key === 'Backspace') this.deleteSelected();
      else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') { event.preventDefault(); this.duplicateSelected(); }
    };
    this.onKeyUp = (event) => {
      if (this.walk.enabled) this.walk.keys.delete(event.key.toLowerCase());
    };
    this.onContextMenu = (event) => {
      const root = this.contextInstanceAtClientPoint(event.clientX, event.clientY);
      if (!root) return;
      event.preventDefault();
      if (!this.selectedRoots.includes(root)) this.selectForView(root);
      this.callbacks.onContextMenu?.({
        x: event.clientX,
        y: event.clientY,
        selectionCount: this.selectedRoots.length,
        canGroup: this.selectedRoots.length > 1,
        canUngroup: this.selectedRoots.some((selectedRoot) => selectedRoot.userData.groupId),
      });
    };
    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown, true);
    this.renderer.domElement.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('pointermove', this.onPointerMove, true);
    window.addEventListener('pointerup', this.onPointerUp, true);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  setPointerFromClient(clientX, clientY) {
    const bounds = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((clientX - bounds.left) / bounds.width) * 2 - 1, -((clientY - bounds.top) / bounds.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.cameraForView(this.mainView));
  }

  nightHandleAtClientPoint(clientX, clientY) {
    if (!this.nightLightGuidesVisible || !this.nightLights.length) return null;
    this.setPointerFromClient(clientX, clientY);
    const handles = [];
    this.nightLightObjects.forEach(({ marker, targetMarker }) => handles.push(marker, targetMarker));
    const hit = this.raycaster.intersectObjects(handles, false)[0];
    if (!hit) return null;
    return {
      id: hit.object.userData.nightLightId,
      field: hit.object.userData.nightLightHandle,
    };
  }

  startNightLightDrag(event, handle) {
    const definition = this.nightLights.find((light) => light.id === handle.id);
    if (!definition || !['position', 'target'].includes(handle.field)) return;
    this.selectedNightLightId = definition.id;
    this.rebuildNightLights();
    this.emitNightLights();
    this.setPointerFromClient(event.clientX, event.clientY);
    const start = new THREE.Vector3().fromArray(definition[handle.field]);
    const normal = this.mainView === 'top'
      ? new THREE.Vector3(0, 1, 0)
      : this.mainView === 'front'
      ? new THREE.Vector3(0, 0, 1)
      : this.cameraForView(this.mainView).getWorldDirection(new THREE.Vector3());
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal.normalize(), start);
    const point = this.raycaster.ray.intersectPlane(plane, new THREE.Vector3());
    if (!point) return;
    this.prepareHistoryChange();
    this.nightLightDrag = {
      id: definition.id,
      field: handle.field,
      plane,
      offset: start.clone().sub(point),
      fixedY: start.y,
      fixedZ: start.z,
    };
    this.orbit.enabled = false;
    this.renderer.domElement.style.cursor = 'grabbing';
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  updateNightLightDrag(event) {
    const drag = this.nightLightDrag;
    const definition = this.nightLights.find((light) => light.id === drag?.id);
    const objects = this.nightLightObjects.get(drag?.id);
    if (!drag || !definition || !objects) return;
    this.setPointerFromClient(event.clientX, event.clientY);
    const point = this.raycaster.ray.intersectPlane(drag.plane, new THREE.Vector3());
    if (!point) return;
    point.add(drag.offset);
    if (this.mainView === 'top') point.y = drag.fixedY;
    if (this.mainView === 'front') point.z = drag.fixedZ;
    point.x = THREE.MathUtils.clamp(point.x, -GROUND_HALF_SIZE, GROUND_HALF_SIZE);
    point.y = THREE.MathUtils.clamp(point.y, -GROUND_HALF_SIZE, GROUND_HALF_SIZE);
    point.z = THREE.MathUtils.clamp(point.z, -GROUND_HALF_SIZE, GROUND_HALF_SIZE);
    definition[drag.field] = point.toArray();
    if (drag.field === 'position') {
      objects.light.position.copy(point);
      objects.marker.position.copy(point);
    } else {
      objects.target.position.copy(point);
      objects.targetMarker.position.copy(point);
    }
    objects.target.updateMatrixWorld(true);
    objects.light.updateMatrixWorld(true);
    objects.helper.update();
    this.emitNightLights();
    event.preventDefault();
  }

  finishNightLightDrag(event) {
    const drag = this.nightLightDrag;
    this.nightLightDrag = null;
    this.orbit.enabled = this.mainView === 'perspective' && !this.walk.enabled;
    this.renderer.domElement.style.cursor = '';
    this.recordHistory(`Move spotlight ${drag.field === 'target' ? 'target' : 'source'}`);
    this.emitNightLights();
    this.callbacks.onStatus?.(`Spotlight ${drag.field === 'target' ? 'aim target' : 'source'} moved in ${viewDisplayName(this.mainView).toLowerCase()}.`);
    event.preventDefault();
  }

  instanceAtClientPoint(clientX, clientY) {
    this.setPointerFromClient(clientX, clientY);
    const hits = this.raycaster.intersectObjects(this.editableRootsForView(), true);
    return hits.length ? this.findInstanceRoot(hits[0].object) : null;
  }

  contextInstanceAtClientPoint(clientX, clientY) {
    this.setPointerFromClient(clientX, clientY);
    const visibleRoots = [...this.instances.values()].filter((root) => root.visible);
    const hits = this.raycaster.intersectObjects(visibleRoots, true);
    if (!hits.length) return null;
    const hitRoots = hits.map((hit) => this.findInstanceRoot(hit.object)).filter(Boolean);
    return hitRoots.find((root) => this.selectedRoots.includes(root)) || hitRoots[0] || null;
  }

  editableRootsForView(view = this.mainView) {
    return [...this.instances.values()].filter((root) => (
      root.visible
      && (view === 'perspective' || root.userData.levelId === this.activeLevelId)
    ));
  }

  selectForView(root, view = this.mainView) {
    if (!root) {
      this.selectRoots([]);
      return;
    }
    if (view === 'perspective') {
      this.select(root);
      return;
    }
    const roots = root.userData.groupId
      ? [...this.instances.values()].filter((candidate) => (
        candidate.visible && candidate.userData.groupId === root.userData.groupId
      ))
      : [root];
    this.selectRoots(roots, root, false);
  }

  wallAtClientPoint(clientX, clientY) {
    if (!this.walls.enabled || !this.wallGroup.visible) return null;
    this.setPointerFromClient(clientX, clientY);
    return this.raycaster.intersectObjects([...this.wallMeshes.values(), this.southWallSegments, this.pointedArchMesh, this.southArchInfillMesh].filter((object) => object.visible), true)[0]?.object || null;
  }

  worldPointOnLevel(clientX, clientY, levelId = this.activeLevelId) {
    this.setPointerFromClient(clientX, clientY);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.levelHeight(levelId));
    return this.raycaster.ray.intersectPlane(plane, new THREE.Vector3());
  }

  worldPointForMainDrag(clientX, clientY, root, view = this.mainView) {
    this.setPointerFromClient(clientX, clientY);
    const plane = view === 'front'
      ? new THREE.Plane(new THREE.Vector3(0, 0, 1), -root.position.z)
      : new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.levelHeight(root.userData.levelId));
    return this.raycaster.ray.intersectPlane(plane, new THREE.Vector3());
  }

  async installBundledLibrary() {
    const items = await Promise.all(BUNDLED_MODULES.map(async (definition) => {
      const response = await fetch(definition.url);
      if (!response.ok) throw new Error(`${definition.name} could not be loaded.`);
      const source = await parseModel(await response.arrayBuffer(), 'glb');
      const item = this.createLibraryItem({
        ...definition,
        source,
        ext: 'glb',
        builtIn: true,
        normalize: false,
        zUp: false,
        uniformHeight: STANDARD_MODULE_HEIGHT,
        alignToFloor: true,
      });
      this.library.set(item.id, item);
      return this.publicLibraryItem(item);
    }));
    return items;
  }

  async importLibraryFile(file, options = {}) {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['glb', 'gltf', 'obj'].includes(ext)) throw new Error('Use a GLB, GLTF, or OBJ file.');
    const buffer = await file.arrayBuffer();
    const dataUrl = await fileToDataUrl(file);
    const source = await parseModel(buffer, ext);
    const item = this.createLibraryItem({
      id: crypto.randomUUID(),
      name: file.name.replace(/\.[^.]+$/, ''),
      source,
      ext,
      dataUrl,
      builtIn: false,
      normalize: false,
      zUp: false,
      uniformHeight: STANDARD_MODULE_HEIGHT,
    });
    this.library.set(item.id, item);
    return this.publicLibraryItem(item);
  }

  createLibraryItem(input) {
    const source = input.source;
    prepareObject(source);
    if (input.zUp) convertZUpToYUp(source);
    if (input.uniformHeight) scaleObjectUniformlyToHeight(source, input.uniformHeight);
    else if (input.normalize) normalizeObject(source);
    else if (input.alignToFloor !== false) centerObjectOnFloor(source);
    source.updateMatrixWorld(true);
    const snapGeometry = extractOuterVerticalSnapGeometry(source);
    const connectors = snapGeometry.connectors;
    const footprintOutlineGeometry = createFootprintOutlineGeometry(connectors);
    const selectionOutlineGeometry = createFootprintPrismGeometry(connectors);
    const appearance = {
      color: input.appearance?.color || this.moduleColor,
      visible: input.appearance?.visible !== false,
    };
    applyAppearanceToObject(source, appearance, this.globalMaterial);
    return {
      ...input,
      source,
      connectors,
      footprintTriangles: snapGeometry.footprintTriangles,
      footprintOutlineGeometry,
      selectionOutlineGeometry,
      appearance,
      triangles: countTriangles(source),
    };
  }

  publicLibraryItem(item) {
    return {
      id: item.id,
      name: item.name,
      ext: item.ext,
      builtIn: item.builtIn,
      triangles: item.triangles,
      appearance: { ...item.appearance },
      thumbnail: this.renderLibraryThumbnail(item),
    };
  }

  renderLibraryThumbnail(item) {
    const cacheKey = `solid-top-v1:${item.appearance.color}`;
    if (item.thumbnailCache?.key === cacheKey) return item.thumbnailCache.dataUrl;

    if (!this.thumbnailRenderer) {
      this.thumbnailRenderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: 'low-power',
        preserveDrawingBuffer: true,
      });
      this.thumbnailRenderer.setPixelRatio(1);
      this.thumbnailRenderer.setSize(144, 108, false);
      this.thumbnailRenderer.outputColorSpace = THREE.SRGBColorSpace;
      this.thumbnailRenderer.toneMapping = THREE.NoToneMapping;
      this.thumbnailRenderer.toneMappingExposure = 1;
      this.thumbnailRenderer.setClearColor(0x000000, 0);
    }
    this.thumbnailRenderer.setSize(144, 108, false);

    const preview = item.source.clone(true);
    preview.visible = true;
    const solidMaterial = new THREE.MeshBasicMaterial({
      color: item.appearance.color || this.moduleColor,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    preview.traverse((child) => {
      if (!child.isMesh || child.userData.isEdgeOverlay) return;
      child.material = solidMaterial;
      child.visible = true;
    });
    preview.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(preview);
    if (bounds.isEmpty()) return null;

    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const aspect = 4 / 3;
    const padding = 1.16;
    const halfHeight = Math.max(size.z * 0.5, size.x / (2 * aspect), 0.01) * padding;
    const camera = new THREE.OrthographicCamera(
      -halfHeight * aspect,
      halfHeight * aspect,
      halfHeight,
      -halfHeight,
      0.001,
      Math.max(size.y * 8, 10),
    );
    camera.position.set(center.x, bounds.max.y + Math.max(size.y * 2, 1), center.z);
    camera.up.set(0, 0, -1);
    camera.lookAt(center);
    camera.updateProjectionMatrix();

    const scene = new THREE.Scene();
    scene.add(preview);
    const outlineMaterial = new THREE.LineBasicMaterial({
      color: new THREE.Color(item.appearance.color || this.moduleColor).multiplyScalar(0.38),
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const footprintOutline = new THREE.LineSegments(item.footprintOutlineGeometry, outlineMaterial);
    footprintOutline.renderOrder = 10;
    footprintOutline.frustumCulled = false;
    preview.add(footprintOutline);

    this.thumbnailRenderer.render(scene, camera);
    const dataUrl = this.thumbnailRenderer.domElement.toDataURL('image/png');
    outlineMaterial.dispose();
    solidMaterial.dispose();
    item.thumbnailCache = { key: cacheKey, dataUrl };
    return dataUrl;
  }

  renderAssemblyTopThumbnail(project, width = 440, height = 240, preferLiveInstances = false) {
    const instances = Array.isArray(project?.instances) ? project.instances : [];
    if (!instances.length) return '';
    if (!this.thumbnailRenderer) {
      this.thumbnailRenderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: 'low-power',
        preserveDrawingBuffer: true,
      });
      this.thumbnailRenderer.setPixelRatio(1);
      this.thumbnailRenderer.outputColorSpace = THREE.SRGBColorSpace;
      this.thumbnailRenderer.toneMapping = THREE.NoToneMapping;
      this.thumbnailRenderer.toneMappingExposure = 1;
    }
    this.thumbnailRenderer.setSize(width, height, false);

    const root = new THREE.Group();
    const materials = new Map();
    const outlineGeometries = [];
    const outlineMaterial = new THREE.LineBasicMaterial({ color: 0x51441a, toneMapped: false });
    let resolvedInstances = 0;
    const materialFor = (color) => {
      const key = color || project.moduleColor || this.moduleColor;
      if (!materials.has(key)) {
        materials.set(key, new THREE.MeshBasicMaterial({ color: key, side: THREE.DoubleSide, toneMapped: false }));
      }
      return materials.get(key);
    };
    instances.forEach((instance) => {
      const liveRoot = preferLiveInstances ? this.instances.get(instance.id) : null;
      const item = this.library.get(instance.libraryId);
      const source = liveRoot || item?.source;
      if (!source) return;
      resolvedInstances += 1;
      const preview = source.clone(true);
      if (!liveRoot) applyTransform(preview, instance.transform || {});
      preview.visible = true;
      const appearance = project.appearances?.[instance.libraryId] || item?.appearance || {};
      preview.traverse((child) => {
        if (!child.isMesh) return;
        child.visible = !child.userData.isEdgeOverlay;
        if (!child.visible) return;
        child.material = materialFor(appearance.color);
        const outlineGeometry = new THREE.EdgesGeometry(child.geometry, 28);
        outlineGeometries.push(outlineGeometry);
        const outline = new THREE.LineSegments(outlineGeometry, outlineMaterial);
        outline.renderOrder = 4;
        child.add(outline);
      });
      root.add(preview);
    });
    if (resolvedInstances !== instances.length) {
      outlineGeometries.forEach((geometry) => geometry.dispose());
      outlineMaterial.dispose();
      materials.forEach((material) => material.dispose());
      return '';
    }
    root.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(root);
    if (bounds.isEmpty()) {
      outlineGeometries.forEach((geometry) => geometry.dispose());
      outlineMaterial.dispose();
      materials.forEach((material) => material.dispose());
      return '';
    }

    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const aspect = width / height;
    const halfHeight = Math.max(size.z * 0.5, size.x / (2 * aspect), 0.01) * 1.14;
    const distance = Math.max(8, size.y * 4, size.x, size.z);
    const camera = new THREE.OrthographicCamera(
      -halfHeight * aspect,
      halfHeight * aspect,
      halfHeight,
      -halfHeight,
      0.01,
      distance * 2 + size.y,
    );
    camera.position.set(center.x, bounds.max.y + distance, center.z);
    camera.up.set(0, 0, -1);
    camera.lookAt(center);
    camera.updateProjectionMatrix();

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf8f0df);
    scene.add(root);
    this.thumbnailRenderer.render(scene, camera);
    const dataUrl = this.thumbnailRenderer.domElement.toDataURL('image/png');
    outlineGeometries.forEach((geometry) => geometry.dispose());
    outlineMaterial.dispose();
    materials.forEach((material) => material.dispose());
    return dataUrl;
  }

  updateLibraryAppearance(libraryId, patch, recordHistory = true) {
    const item = this.library.get(libraryId);
    if (!item) return null;
    if (recordHistory) this.prepareHistoryChange();
    item.appearance = { ...item.appearance, ...patch };
    applyAppearanceToObject(item.source, item.appearance, this.globalMaterial);
    this.instances.forEach((root) => {
      if (root.userData.libraryId === libraryId) applyAppearanceToObject(root, item.appearance, this.globalMaterial);
    });
    this.wallSignature = '';
    if (item.appearance.visible === false && this.selected?.userData.libraryId === libraryId) this.select(null);
    this.callbacks.onLibrary?.([...this.library.values()].map((libraryItem) => this.publicLibraryItem(libraryItem)));
    if (recordHistory) this.recordHistory('Edit module appearance');
    return this.publicLibraryItem(item);
  }

  setAllModuleColor(color, recordHistory = true) {
    if (!/^#[0-9a-f]{6}$/i.test(color || '')) return;
    if (recordHistory) this.prepareHistoryChange();
    this.moduleColor = color;
    this.library.forEach((item) => {
      item.appearance = { ...item.appearance, color, visible: true };
      applyAppearanceToObject(item.source, item.appearance, this.globalMaterial);
    });
    this.instances.forEach((root) => {
      const item = this.library.get(root.userData.libraryId);
      if (item) applyAppearanceToObject(root, item.appearance, this.globalMaterial);
    });
    this.wallSignature = '';
    this.callbacks.onLibrary?.([...this.library.values()].map((item) => this.publicLibraryItem(item)));
    this.callbacks.onModuleColor?.(this.moduleColor);
    if (recordHistory) this.recordHistory('Change all module colors');
  }

  addInstance(libraryId, transform = null, options = {}) {
    const item = this.library.get(libraryId);
    if (!item) return null;
    if (options.recordHistory !== false) this.prepareHistoryChange();
    const root = item.source.clone(true);
    root.name = item.name;
    const levelId = this.levels.some((level) => level.id === options.levelId) ? options.levelId : this.activeLevelId;
    const slicePlanes = normalizeSlicePlanes(options.slicePlanes);
    root.userData = {
      ...root.userData,
      instanceId: options.instanceId || crypto.randomUUID(),
      libraryId,
      levelId,
      groupId: options.groupId || null,
      slicePlanes,
      isModuleRoot: true,
    };
    root.traverse((child) => {
      if (child.isMesh) {
        child.geometry = child.geometry.clone();
        child.material = Array.isArray(child.material) ? child.material.map(cloneStageMaterial) : cloneStageMaterial(child.material);
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    if (transform) applyTransform(root, transform);
    else {
      const offset = this.instances.size ? 0.35 : 0;
      root.position.set(offset, 0, offset);
    }
    root.updateMatrixWorld(true);
    if (slicePlanes.length) applySlicePlanesToRoot(root, slicePlanes);
    attachEdgeOverlays(root, this.edgeMaterial, this.edgeSettings.verticalLines);
    this.assembly.add(root);
    this.instances.set(root.userData.instanceId, root);
    this.wallSignature = '';
    this.placeRootOnTier(root);
    this.constrainRootsToGround([root]);
    this.select(root);
    this.emitStats();
    this.callbacks.onStatus?.(`${item.name} added. Move it near another cell to snap.`);
    if (options.recordHistory !== false) this.recordHistory('Add module');
    return root;
  }

  findInstanceRoot(object) {
    let current = object;
    while (current && !current.userData?.isModuleRoot) current = current.parent;
    return current?.userData?.isModuleRoot ? current : null;
  }

  select(root) {
    if (!root) {
      this.selectRoots([]);
      return;
    }
    const groupId = root.userData.groupId;
    const roots = groupId
      ? [...this.instances.values()].filter((candidate) => candidate.userData.groupId === groupId)
      : [root];
    this.selectRoots(roots, root);
  }

  selectRoots(roots, primary = roots[0] || null, expandGroups = true) {
    const expanded = new Set();
    roots.forEach((root) => {
      if (!root) return;
      const groupId = root.userData.groupId;
      if (groupId && expandGroups) {
        this.instances.forEach((candidate) => { if (candidate.userData.groupId === groupId) expanded.add(candidate); });
      } else expanded.add(root);
    });
    this.selectedRoots = [...expanded];
    this.selected = this.selectedRoots.includes(primary) ? primary : this.selectedRoots[0] || null;
    this.transform.detach();
    this.updateTransformTarget();
    this.refreshSelectionHighlights();
    this.refreshConnectorMarkers();
    this.emitSelection();
  }

  setMode(mode) {
    const safeMode = ['select', 'box-select', 'translate', 'rotate', 'scale', 'slice'].includes(mode) ? mode : 'translate';
    if (this.mode === 'slice' && safeMode !== 'slice') this.clearSliceGuides();
    this.mode = safeMode;
    this.transform.detach();
    if (safeMode === 'slice') {
      if (this.walk.enabled) this.setWalkEnabled(false);
      this.setView('top');
      this.refreshSliceGuides();
      this.callbacks.onStatus?.('Slice mode: click two highlighted footprint corners on the active tier.');
      return;
    }
    if (safeMode === 'rotate' || safeMode === 'scale') {
      this.transform.setMode(safeMode);
      this.transform.showX = safeMode !== 'rotate';
      this.transform.showY = true;
      this.transform.showZ = safeMode !== 'rotate';
      this.updateTransformTarget();
    }
  }

  clearSliceGuides() {
    this.sliceDraft = null;
    this.sliceCorners = [];
    this.sliceGuideGroup.children.forEach((child) => child.geometry?.dispose?.());
    this.sliceGuideGroup.clear();
    this.sliceGuideGroup.visible = false;
  }

  cancelSliceDraft() {
    this.sliceDraft = null;
    this.refreshSliceGuides();
    this.callbacks.onStatus?.('Slice line cancelled. Click a highlighted footprint corner to start again.');
  }

  refreshSliceGuides(previewCorner = null) {
    this.sliceGuideGroup.children.forEach((child) => child.geometry?.dispose?.());
    this.sliceGuideGroup.clear();
    if (this.mode !== 'slice' || this.mainView !== 'top') {
      this.sliceGuideGroup.visible = false;
      return;
    }
    const roots = [...this.instances.values()].filter((root) => (
      root.visible && root.userData.levelId === this.activeLevelId
    ));
    const bounds = new THREE.Box3();
    roots.forEach((root) => bounds.expandByObject(root));
    const guideY = bounds.isEmpty() ? this.levelHeight(this.activeLevelId) + 0.1 : bounds.max.y + 0.04;
    const corners = [];
    const cornerKeys = new Set();
    roots.forEach((root) => {
      footprintCornersForRoot(root).forEach((corner) => {
        const position = new THREE.Vector3(corner.x, guideY, corner.z);
        const key = `${Math.round(position.x * 10000)}:${Math.round(position.z * 10000)}`;
        if (cornerKeys.has(key)) return;
        cornerKeys.add(key);
        corners.push({ position, root });
      });
    });
    this.sliceCorners = corners;
    if (corners.length) {
      const points = new THREE.Points(
        new THREE.BufferGeometry().setFromPoints(corners.map((corner) => corner.position)),
        this.sliceCornerMaterial,
      );
      points.renderOrder = 70;
      points.frustumCulled = false;
      this.sliceGuideGroup.add(points);
    }
    if (this.sliceDraft?.start) {
      const end = previewCorner?.position || this.sliceDraft.preview || this.sliceDraft.start;
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([this.sliceDraft.start, end]),
        this.sliceLineMaterial,
      );
      line.renderOrder = 71;
      line.frustumCulled = false;
      this.sliceGuideGroup.add(line);
    }
    this.sliceGuideGroup.visible = true;
  }

  sliceCornerAtClientPoint(clientX, clientY, maxDistance = 18) {
    if (this.mainView !== 'top' || !this.sliceCorners.length) return null;
    const bounds = this.renderer.domElement.getBoundingClientRect();
    const camera = this.cameraForView('top');
    let nearest = null;
    let nearestDistance = maxDistance;
    this.sliceCorners.forEach((corner) => {
      const projected = corner.position.clone().project(camera);
      const x = bounds.left + (projected.x + 1) * bounds.width * 0.5;
      const y = bounds.top + (1 - projected.y) * bounds.height * 0.5;
      const distance = Math.hypot(clientX - x, clientY - y);
      if (distance < nearestDistance) {
        nearest = corner;
        nearestDistance = distance;
      }
    });
    return nearest;
  }

  updateSlicePointerPreview(clientX, clientY) {
    if (!this.sliceDraft?.start) return;
    const corner = this.sliceCornerAtClientPoint(clientX, clientY);
    this.sliceDraft.preview = corner?.position?.clone() || this.sliceDraft.start.clone();
    this.refreshSliceGuides(corner);
  }

  handleSlicePointerDown(event) {
    if (this.mainView !== 'top') {
      this.setView('top');
      this.refreshSliceGuides();
      return;
    }
    const corner = this.sliceCornerAtClientPoint(event.clientX, event.clientY);
    if (!corner) {
      this.callbacks.onStatus?.('The slice line must start and end on highlighted module corners.');
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (!this.sliceDraft?.start) {
      this.sliceDraft = { start: corner.position.clone(), preview: corner.position.clone() };
      this.refreshSliceGuides(corner);
      this.callbacks.onStatus?.('First slice corner set. Click a different highlighted corner to complete the cut.');
    } else if (this.sliceDraft.start.distanceToSquared(corner.position) < 1e-10) {
      this.callbacks.onStatus?.('Choose a different corner for the end of the slice line.');
    } else {
      const start = this.sliceDraft.start.clone();
      const end = corner.position.clone();
      this.sliceDraft = null;
      this.sliceModulesAlongTopLine(start, end);
      this.refreshSliceGuides();
    }
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  sliceModulesAlongTopLine(start, end) {
    const direction = end.clone().sub(start);
    direction.y = 0;
    const length = direction.length();
    if (length < 1e-5) return;
    direction.multiplyScalar(1 / length);
    const normal = new THREE.Vector3(-direction.z, 0, direction.x).normalize();
    const worldPlane = new THREE.Plane(normal, -normal.dot(start));
    const candidates = [...this.instances.values()].filter((root) => (
      root.visible
      && root.userData.levelId === this.activeLevelId
      && rootIntersectsFiniteSlice(root, worldPlane, start, direction, length)
    ));
    if (!candidates.length) {
      this.callbacks.onStatus?.('The corner-to-corner line does not pass through a module interior.');
      return;
    }

    this.prepareHistoryChange();
    const created = [];
    candidates.forEach((root) => {
      root.updateMatrixWorld(true);
      const localPlane = worldPlane.clone().applyMatrix4(root.matrixWorld.clone().invert());
      const planeData = {
        normal: localPlane.normal.toArray(),
        constant: localPlane.constant,
      };
      const existingPlanes = normalizeSlicePlanes(root.userData.slicePlanes);
      const transform = serializeTransform(root);
      const commonOptions = {
        levelId: root.userData.levelId,
        groupId: root.userData.groupId || null,
        recordHistory: false,
      };
      const positive = this.addInstance(root.userData.libraryId, transform, {
        ...commonOptions,
        slicePlanes: [...existingPlanes, { ...planeData, keep: 1 }],
      });
      const negative = this.addInstance(root.userData.libraryId, transform, {
        ...commonOptions,
        slicePlanes: [...existingPlanes, { ...planeData, keep: -1 }],
      });
      if (positive) created.push(positive);
      if (negative) created.push(negative);
      this.instances.delete(root.userData.instanceId);
      this.assembly.remove(root);
      disposeObject(root);
    });
    this.wallSignature = '';
    this.selectRoots(created, created[0] || null, false);
    this.emitStats();
    this.recordHistory('Slice modules');
    this.callbacks.onStatus?.(`${candidates.length} module${candidates.length === 1 ? '' : 's'} sliced into ${created.length} solid pieces.`);
  }

  updateTransformTarget() {
    this.transform.detach();
    if (!this.selected || (this.mode !== 'rotate' && this.mode !== 'scale')) return;
    if (this.selectedRoots.length === 1) {
      this.transform.attach(this.selected);
      return;
    }
    const bounds = selectionBounds(this.selectedRoots);
    this.groupProxy.position.copy(bounds.getCenter(new THREE.Vector3()));
    this.groupProxy.rotation.set(0, 0, 0);
    this.groupProxy.scale.set(1, 1, 1);
    this.groupProxy.updateMatrixWorld(true);
    this.transform.attach(this.groupProxy);
  }

  beginGroupProxyTransform() {
    this.groupProxy.updateMatrixWorld(true);
    this.groupTransformStart = {
      proxyMatrix: this.groupProxy.matrixWorld.clone(),
      rootMatrices: new Map(this.selectedRoots.map((root) => {
        root.updateMatrixWorld(true);
        return [root, root.matrixWorld.clone()];
      })),
    };
  }

  applyGroupProxyTransform() {
    if (!this.groupTransformStart) return;
    this.groupProxy.updateMatrixWorld(true);
    const delta = this.groupProxy.matrixWorld.clone().multiply(this.groupTransformStart.proxyMatrix.clone().invert());
    this.groupTransformStart.rootMatrices.forEach((startMatrix, root) => {
      setObjectWorldMatrix(root, delta.clone().multiply(startMatrix));
    });
  }

  refreshSelectionHighlights() {
    this.selectionHighlightGroup.clear();
    this.selectionBounds.makeEmpty();
    this.selectedRoots.forEach((root) => {
      this.selectionBounds.expandByObject(root);
      const item = this.library.get(root.userData.libraryId);
      const outlineGeometry = root.userData.sliceSelectionOutlineGeometry || item?.selectionOutlineGeometry;
      if (!outlineGeometry) return;
      const outline = new THREE.LineSegments(outlineGeometry, this.selectionOutlineMaterial);
      outline.matrixAutoUpdate = false;
      outline.frustumCulled = false;
      outline.renderOrder = 40;
      outline.userData.selectionRoot = root;
      root.updateMatrixWorld(true);
      outline.matrix.copy(root.matrixWorld);
      this.selectionHighlightGroup.add(outline);
    });
    this.selectionBox.visible = false;
  }

  updateSelectionHighlightMatrices() {
    this.selectionHighlightGroup.children.forEach((outline) => {
      const root = outline.userData.selectionRoot;
      if (!root) return;
      root.updateMatrixWorld(true);
      outline.matrix.copy(root.matrixWorld);
    });
  }

  setSnap(next) {
    this.snap = { ...this.snap, ...next };
    const step = this.snap.enabled ? Number(this.snap.gridSize) || null : null;
    this.transform.setTranslationSnap(step);
    this.transform.setRotationSnap(this.snap.enabled ? THREE.MathUtils.degToRad(15) : null);
  }

  setConnectorsVisible(visible) {
    this.connectorsVisible = !!visible;
    this.connectorGroup.visible = this.connectorsVisible;
  }

  setShadowsEnabled(enabled) {
    this.shadowsEnabled = !!enabled;
    this.renderer.shadowMap.enabled = this.shadowsEnabled;
    if (this.sun) this.sun.castShadow = this.shadowsEnabled;
    this.nightLightObjects.forEach(({ light }) => { light.castShadow = this.shadowsEnabled; });
    if (this.floor) this.floor.receiveShadow = this.shadowsEnabled;
    this.instances.forEach((root) => root.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = this.shadowsEnabled;
      child.receiveShadow = this.shadowsEnabled;
    }));
    this.wallMeshes.forEach((mesh) => {
      mesh.castShadow = this.shadowsEnabled;
      mesh.receiveShadow = this.shadowsEnabled;
    });
    this.southWallSegments.traverse((mesh) => {
      if (!mesh.isMesh) return;
      mesh.castShadow = this.shadowsEnabled;
      mesh.receiveShadow = this.shadowsEnabled;
    });
    this.pointedArchMesh.castShadow = this.shadowsEnabled;
    this.pointedArchMesh.receiveShadow = this.shadowsEnabled;
    this.southArchInfillMesh.castShadow = this.shadowsEnabled;
    this.southArchInfillMesh.receiveShadow = this.shadowsEnabled;
    this.northRecessFrameMesh.castShadow = this.shadowsEnabled;
    this.northRecessFrameMesh.receiveShadow = this.shadowsEnabled;
    this.archModuleInfillGroup.traverse((mesh) => {
      if (!mesh.isMesh) return;
      mesh.castShadow = this.shadowsEnabled;
      mesh.receiveShadow = this.shadowsEnabled;
    });
  }

  emitNightLights() {
    this.callbacks.onNightLights?.({
      preview: this.nightPreview,
      guides: this.nightLightGuidesVisible,
      selectedId: this.selectedNightLightId,
      lights: this.nightLights.map((light) => cloneNightLight(light)),
    });
  }

  rebuildNightLights() {
    this.nightLightObjects.forEach(({ helper, marker, targetMarker }) => {
      helper?.dispose?.();
      marker?.geometry?.dispose?.();
      marker?.material?.dispose?.();
      targetMarker?.geometry?.dispose?.();
      targetMarker?.material?.dispose?.();
    });
    this.nightLightObjects.clear();
    this.nightLightGroup.clear();
    this.nightLights.forEach((definition) => {
      const light = new THREE.SpotLight(
        definition.color,
        definition.intensity,
        definition.distance,
        THREE.MathUtils.degToRad(definition.angle),
        definition.penumbra,
        definition.decay,
      );
      light.name = definition.name;
      light.position.fromArray(definition.position);
      light.castShadow = this.shadowsEnabled;
      light.shadow.mapSize.set(2048, 2048);
      light.shadow.camera.near = 0.05;
      light.shadow.camera.far = definition.distance;
      light.shadow.bias = -0.00015;
      light.shadow.normalBias = 0.025;
      const target = new THREE.Object3D();
      target.position.fromArray(definition.target);
      light.target = target;
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(0.11, 16, 10),
        new THREE.MeshBasicMaterial({ color: definition.color, toneMapped: false, depthTest: false, depthWrite: false }),
      );
      marker.position.copy(light.position);
      marker.userData.ignoreRaycast = true;
      marker.userData.isNightLightGuide = true;
      marker.userData.nightLightId = definition.id;
      marker.userData.nightLightHandle = 'position';
      marker.renderOrder = 100;
      const targetMarker = new THREE.Mesh(
        new THREE.SphereGeometry(0.075, 12, 8),
        new THREE.MeshBasicMaterial({ color: 0xff6b5f, toneMapped: false, depthTest: false, depthWrite: false }),
      );
      targetMarker.position.copy(target.position);
      targetMarker.userData.ignoreRaycast = true;
      targetMarker.userData.isNightLightGuide = true;
      targetMarker.userData.nightLightId = definition.id;
      targetMarker.userData.nightLightHandle = 'target';
      targetMarker.renderOrder = 100;
      const helper = new THREE.SpotLightHelper(light, definition.id === this.selectedNightLightId ? 0xffffff : definition.color);
      helper.userData.ignoreRaycast = true;
      helper.userData.isNightLightGuide = true;
      helper.traverse((child) => {
        if (child.material) {
          child.material.depthTest = false;
          child.material.depthWrite = false;
          child.material.transparent = true;
          child.material.opacity = 0.78;
        }
        child.renderOrder = 90;
      });
      light.visible = this.nightPreview && definition.enabled;
      marker.visible = this.nightLightGuidesVisible;
      targetMarker.visible = this.nightLightGuidesVisible;
      helper.visible = this.nightLightGuidesVisible;
      this.nightLightGroup.add(light, target, marker, targetMarker, helper);
      this.nightLightObjects.set(definition.id, { light, target, marker, targetMarker, helper });
      helper.update();
    });
  }

  setNightLights(lights = []) {
    this.nightLights = Array.isArray(lights) ? lights.map((light) => normalizeNightLight(light)) : [];
    this.selectedNightLightId = this.nightLights.some((light) => light.id === this.selectedNightLightId)
      ? this.selectedNightLightId
      : this.nightLights[0]?.id || null;
    this.rebuildNightLights();
    this.emitNightLights();
  }

  addNightLight() {
    const bounds = this.instances.size ? this.completeModelBounds() : new THREE.Box3(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, 2, 1));
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const definition = normalizeNightLight({
      ...DEFAULT_NIGHT_LIGHT,
      id: crypto.randomUUID(),
      name: `Spotlight ${this.nightLights.length + 1}`,
      position: [center.x, Math.max(0.5, bounds.max.y - size.y * 0.15), center.z + Math.max(0.35, size.z * 0.18)],
      target: [center.x, Math.max(0.15, center.y), center.z],
      distance: Math.max(4, Math.min(30, size.length() * 1.35)),
    });
    this.prepareHistoryChange();
    this.nightLights.push(definition);
    this.selectedNightLightId = definition.id;
    this.rebuildNightLights();
    this.emitNightLights();
    this.recordHistory('Add night spotlight');
    this.callbacks.onStatus?.(`${definition.name} added inside the model. Adjust its position and aim in Night lights.`);
    return definition.id;
  }

  updateNightLight(id, patch) {
    const index = this.nightLights.findIndex((light) => light.id === id);
    if (index < 0) return;
    this.prepareHistoryChange();
    this.nightLights[index] = normalizeNightLight({ ...this.nightLights[index], ...patch, id });
    this.rebuildNightLights();
    this.emitNightLights();
    this.recordHistory('Edit night spotlight');
  }

  removeNightLight(id) {
    const index = this.nightLights.findIndex((light) => light.id === id);
    if (index < 0) return;
    this.prepareHistoryChange();
    this.nightLights.splice(index, 1);
    this.selectedNightLightId = this.nightLights[Math.min(index, this.nightLights.length - 1)]?.id || null;
    this.rebuildNightLights();
    this.emitNightLights();
    this.recordHistory('Remove night spotlight');
  }

  selectNightLight(id) {
    this.selectedNightLightId = this.nightLights.some((light) => light.id === id) ? id : null;
    this.rebuildNightLights();
    this.emitNightLights();
  }

  placeNightLightAtCamera(id) {
    const target = this.mainView === 'perspective'
      ? this.orbit.target
      : this.visibleModuleBounds().getCenter(new THREE.Vector3());
    this.updateNightLight(id, {
      position: this.cameraForView(this.mainView).position.toArray(),
      target: target.toArray(),
    });
    this.callbacks.onStatus?.('Spotlight moved to the current camera and aimed at the view target.');
  }

  aimNightLightAtModelCenter(id) {
    const bounds = this.completeModelBounds();
    if (bounds.isEmpty()) return;
    this.updateNightLight(id, { target: bounds.getCenter(new THREE.Vector3()).toArray() });
    this.callbacks.onStatus?.('Spotlight aimed at the center of the complete model.');
  }

  setNightLightGuidesVisible(visible) {
    this.nightLightGuidesVisible = visible === true;
    this.rebuildNightLights();
    this.emitNightLights();
  }

  setNightPreview(enabled) {
    this.nightPreview = enabled === true;
    if (this.hemisphere) this.hemisphere.visible = !this.nightPreview;
    if (this.sun) this.sun.visible = !this.nightPreview;
    if (this.grid) this.grid.visible = !this.nightPreview;
    this.scene.background = new THREE.Color(this.nightPreview ? '#050914' : '#dceff8');
    this.scene.fog = new THREE.Fog(this.nightPreview ? '#050914' : '#dceff8', this.nightPreview ? 32 : 45, this.nightPreview ? 85 : 110);
    if (this.floor?.material) {
      this.floor.material.color.set(this.nightPreview ? '#111827' : '#fbf0bc');
      this.floor.material.roughness = this.nightPreview ? 0.24 : 0.64;
      this.floor.material.metalness = this.nightPreview ? 0.12 : 0;
      this.floor.material.needsUpdate = true;
    }
    this.scene.environment = null;
    this.scene.environmentIntensity = 1;
    this.renderer.toneMapping = this.nightPreview ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
    this.renderer.toneMappingExposure = this.nightPreview ? 0.9 : 1;
    this.rebuildNightLights();
    this.emitNightLights();
    this.callbacks.onStatus?.(this.nightPreview ? 'Night preview enabled. Only authored spotlights illuminate the model.' : 'Day stage lighting restored.');
  }

  playAssemblyAnimation(durationSeconds = 15) {
    if (!this.instances.size) return;
    if (this.assemblyAnimation) this.stopAssemblyAnimation(false);
    this.syncWalls(true);
    this.select(null);
    this.walk.keys.clear();

    const snapshot = (object, grow = false, animationVisible = object.visible) => {
      object.geometry?.computeBoundingBox?.();
      const state = {
        object,
        visible: object.visible,
        position: object.position.clone(),
        scale: object.scale.clone(),
        grow,
        animationVisible,
        minimumY: object.geometry?.boundingBox?.min?.y ?? 0,
      };
      object.visible = false;
      return state;
    };
    const levelOrder = new Map(
      [...this.levels]
        .sort((first, second) => Number(first.height) - Number(second.height))
        .map((level, index) => [level.id, index]),
    );
    const visibleModules = [...this.instances.values()]
      .filter((root) => root.visible)
      .sort((first, second) => (
        (levelOrder.get(first.userData.levelId) ?? 0) - (levelOrder.get(second.userData.levelId) ?? 0)
        || first.position.z - second.position.z
        || first.position.x - second.position.x
      ));
    const moduleBounds = this.visibleModuleBounds();
    const moduleCenter = moduleBounds.getCenter(new THREE.Vector3());
    const moduleSize = moduleBounds.getSize(new THREE.Vector3());
    const flightDistance = Math.max(1.2, Math.max(moduleSize.x, moduleSize.z) * 0.22);
    const moduleItems = visibleModules.map((root, index) => {
      const state = snapshot(root);
      const direction = new THREE.Vector3(
        state.position.x - moduleCenter.x,
        0,
        state.position.z - moduleCenter.z,
      );
      if (direction.lengthSq() < 1e-5) {
        const angle = (index / Math.max(1, visibleModules.length)) * Math.PI * 2;
        direction.set(Math.cos(angle), 0, Math.sin(angle));
      } else direction.normalize();
      state.startPosition = state.position.clone()
        .addScaledVector(direction, flightDistance)
        .add(new THREE.Vector3(0, Math.max(1.4, moduleSize.y * 0.2), 0));
      state.startScale = state.scale.clone().multiplyScalar(0.36);
      root.position.copy(state.startPosition);
      root.scale.copy(state.startScale);
      return state;
    });

    const specialConstructionObjects = new Set([
      this.pointedArchMesh,
      this.southArchInfillMesh,
      this.northRecessFrameMesh,
    ]);
    const wallMeshesBySide = Object.fromEntries(WALL_SIDES.map((side) => [side, []]));
    if (this.wallGroup.visible) {
      this.wallGroup.traverse((child) => {
        if (!child.isMesh || !child.userData.wallSide || child.userData.isWallEdgeOverlay) return;
        if (!objectVisibleWithin(child, this.wallGroup) || specialConstructionObjects.has(child)) return;
        wallMeshesBySide[child.userData.wallSide]?.push(child);
      });
    }
    const animatedObjects = new Set();
    const makeStage = (objects, forceVisible = false) => objects.filter((object) => object && (forceVisible || object.visible) && !animatedObjects.has(object)).map((object) => {
      animatedObjects.add(object);
      return snapshot(object, object.isMesh, forceVisible || object.visible);
    });
    const hasSouthOpenings = Object.values(this.walls.southOpenings || {}).some((opening) => opening?.enabled);
    const southConstructionObjects = hasSouthOpenings && this.southWallSegments.visible
      ? [this.southWallSegments]
      : wallMeshesBySide.south;
    const preWallStages = [
      { name: 'East wall', items: makeStage(wallMeshesBySide.east) },
      { name: hasSouthOpenings ? 'South wall and openings' : 'South wall', items: makeStage(southConstructionObjects) },
      { name: 'West wall', items: makeStage(wallMeshesBySide.west) },
    ];
    const archObjects = [
      this.pointedArchMesh,
      this.southArchInfillMesh,
      this.archModuleInfillGroup,
    ];
    const archItems = this.wallGroup.visible
      ? makeStage(archObjects.filter((object) => (
        object === this.archModuleInfillGroup
          ? object.visible
          : objectVisibleWithin(object, this.wallGroup)
      )))
      : [];
    const northObjects = [
      ...wallMeshesBySide.north,
      this.northRecessFrameMesh,
    ];
    const northItems = this.wallGroup.visible
      ? makeStage(northObjects.filter((object) => objectVisibleWithin(object, this.wallGroup)))
      : [];
    const northDetailItems = this.wallGroup.visible && objectVisibleWithin(this.northBoundaryGroup, this.wallGroup)
      ? makeStage([this.northBoundaryGroup])
      : [];
    const prepareBrickLaying = (item) => {
      const bounds = new THREE.Box3().setFromObject(item.object);
      if (bounds.isEmpty()) return;
      item.brickLay = true;
      item.minimumWorldY = bounds.min.y;
      item.maximumWorldY = bounds.max.y;
      item.clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), bounds.min.y);
      item.materialStates = [];
      item.object.traverse((child) => {
        if (!child.isMesh || !child.material) return;
        const original = child.material;
        const originals = Array.isArray(original) ? original : [original];
        const animationMaterials = originals.map((source) => {
          const material = source.clone();
          if (source.userData?.wallBrickConfigured) {
            configureWallBrickMaterial(
              material,
              source.userData.wallBrickPattern || this.walls.brickPattern,
              source.userData.wallBrickArchMapping || null,
              source.userData.wallBrickOpeningMapping || null,
              source.userData.wallBrickDecorativeFace || null,
            );
          }
          material.clippingPlanes = [item.clipPlane];
          material.clipShadows = true;
          material.needsUpdate = true;
          return material;
        });
        item.materialStates.push({ child, original, animationMaterials });
        child.material = Array.isArray(original) ? animationMaterials : animationMaterials[0];
      });
    };
    preWallStages[1].items.forEach(prepareBrickLaying);
    archItems.forEach(prepareBrickLaying);
    northItems.forEach(prepareBrickLaying);

    // Nothing from the completed enclosure may leak into the first frame.
    this.wallGroup.traverse((child) => {
      if (child.isMesh && child.userData.wallSide) child.visible = false;
    });
    if (preWallStages[1].items.some((item) => item.object === this.southWallSegments)) {
      this.southWallSegments.traverse((child) => {
        if (child.isMesh) child.visible = true;
      });
      this.southWallSegments.visible = false;
    }
    this.northBoundaryGroup.visible = false;
    this.archModuleInfillGroup.visible = false;

    this.assemblyAnimation = {
      startedAt: performance.now(),
      duration: THREE.MathUtils.clamp(Number(durationSeconds) || 15, 3, 120) * 1000,
      moduleItems,
      preWallStages,
      archItems,
      northItems,
      northDetailItems,
      wallGroupVisible: this.wallGroup.visible,
      orbitEnabled: this.orbit.enabled,
      lastStatusStage: '',
    };
    this.orbit.enabled = false;
    this.transform.detach();
    this.callbacks.onAssembly?.({ playing: true });
    this.callbacks.onStatus?.(`Assembly animation started from the current ${viewDisplayName(this.mainView).toLowerCase()}.`);
  }

  updateAssemblyAnimation(time) {
    const animation = this.assemblyAnimation;
    if (!animation) return;
    const progress = THREE.MathUtils.clamp((time - animation.startedAt) / animation.duration, 0, 1);
    const hasConstructionSequence = animation.preWallStages.some((stage) => stage.items.length)
      || animation.archItems.length
      || animation.northItems.length;
    const ease = (value) => 1 - ((1 - THREE.MathUtils.clamp(value, 0, 1)) ** 3);
    const applyItem = (item, localProgress, fly = false) => {
      if (localProgress <= 0) {
        item.object.visible = false;
        return;
      }
      const amount = ease(localProgress);
      item.object.visible = item.animationVisible;
      if (fly) {
        item.object.position.lerpVectors(item.startPosition, item.position, amount);
        item.object.scale.lerpVectors(item.startScale, item.scale, amount);
      } else if (item.brickLay) {
        item.object.position.copy(item.position);
        item.object.scale.copy(item.scale);
        const height = Math.max(0.001, item.maximumWorldY - item.minimumWorldY);
        const courseHeight = Math.max(0.01, this.walls.brickPattern.brickHeight + this.walls.brickPattern.mortar);
        const courseCount = Math.max(1, Math.ceil(height / courseHeight));
        const completedCourses = Math.max(1, Math.ceil(amount * courseCount));
        item.clipPlane.constant = Math.min(item.maximumWorldY, item.minimumWorldY + completedCourses * courseHeight);
      } else if (item.grow) {
        item.object.scale.copy(item.scale);
        item.object.scale.y = Math.max(0.001, item.scale.y * amount);
        item.object.position.copy(item.position);
        item.object.position.y = item.position.y + item.minimumY * (item.scale.y - item.object.scale.y);
      }
      if (localProgress >= 1) {
        item.object.position.copy(item.position);
        item.object.scale.copy(item.scale);
        item.object.visible = item.animationVisible;
      }
      item.object.updateMatrixWorld(true);
    };

    const preWallStart = 0;
    const preWallEnd = hasConstructionSequence ? 0.20 : 0;
    const preWallStep = (preWallEnd - preWallStart) / Math.max(1, animation.preWallStages.length);
    animation.preWallStages.forEach((stage, index) => {
      const localProgress = (progress - (preWallStart + index * preWallStep)) / Math.max(0.001, preWallStep);
      stage.items.forEach((item) => applyItem(item, localProgress));
      if (localProgress > 0 && localProgress < 1 && animation.lastStatusStage !== stage.name) {
        animation.lastStatusStage = stage.name;
        this.callbacks.onStatus?.(`${stage.name} assembling.`);
      }
    });

    const moduleStart = preWallEnd;
    const moduleEnd = hasConstructionSequence ? 0.72 : 0.96;
    const moduleCount = Math.max(1, animation.moduleItems.length);
    const moduleStep = (moduleEnd - moduleStart) / (moduleCount + 1.8);
    const moduleFlight = moduleStep * 2.8;
    animation.moduleItems.forEach((item, index) => {
      applyItem(item, (progress - (moduleStart + index * moduleStep)) / moduleFlight, true);
    });

    const archStart = moduleEnd;
    const archEnd = hasConstructionSequence ? 0.82 : 1;
    const archProgress = (progress - archStart) / Math.max(0.001, archEnd - archStart);
    animation.archItems.forEach((item) => applyItem(item, archProgress));
    if (archProgress > 0 && archProgress < 1 && animation.archItems.length && animation.lastStatusStage !== 'Arch') {
      animation.lastStatusStage = 'Arch';
      this.callbacks.onStatus?.('Arch assembling.');
    }

    const northStart = archEnd;
    const northEnd = 1;
    const northProgress = (progress - northStart) / Math.max(0.001, northEnd - northStart);
    animation.northItems.forEach((item) => applyItem(item, northProgress));
    animation.northDetailItems.forEach((item) => {
      item.object.visible = northProgress >= 0.96 ? item.animationVisible : false;
    });
    if (northProgress > 0 && northProgress < 1 && animation.northItems.length && animation.lastStatusStage !== 'North wall') {
      animation.lastStatusStage = 'North wall';
      this.callbacks.onStatus?.('North wall assembling.');
    }

    if (progress >= 1) this.stopAssemblyAnimation(true);
  }

  stopAssemblyAnimation(completed = true, notify = true) {
    const animation = this.assemblyAnimation;
    if (!animation) return;
    [
      ...animation.moduleItems,
      ...animation.preWallStages.flatMap((stage) => stage.items),
      ...animation.archItems,
      ...animation.northItems,
      ...animation.northDetailItems,
    ].forEach((item) => {
      item.materialStates?.forEach(({ child, original, animationMaterials }) => {
        child.material = original;
        animationMaterials.forEach((material) => material.dispose());
      });
      item.object.position.copy(item.position);
      item.object.scale.copy(item.scale);
      item.object.visible = item.visible;
      item.object.updateMatrixWorld(true);
    });
    this.wallGroup.visible = animation.wallGroupVisible;
    this.assemblyAnimation = null;
    this.orbit.enabled = animation.orbitEnabled && this.mainView === 'perspective' && !this.walk.enabled;
    this.syncWalls(true);
    this.refreshSelectionHighlights();
    this.callbacks.onAssembly?.({ playing: false });
    if (notify) this.callbacks.onStatus?.(completed ? 'Assembly animation complete.' : 'Assembly animation stopped.');
  }

  setWallsEnabled(enabled) {
    this.setWallState({ ...this.walls, enabled: !!enabled }, true, 'Toggle frame walls');
  }

  toggleWallSide(side) {
    if (!WALL_SIDES.includes(side)) return;
    const openSides = new Set(this.walls.openSides);
    if (openSides.has(side)) openSides.delete(side);
    else openSides.add(side);
    this.setWallState({ ...this.walls, openSides: [...openSides] }, true, `Toggle ${side} wall`);
    this.callbacks.onStatus?.(`${side[0].toUpperCase()}${side.slice(1)} wall ${openSides.has(side) ? 'opened' : 'restored'}.`);
  }

  setWallExtraHeight(side, height) {
    if (!WALL_SIDES.includes(side)) return;
    const value = THREE.MathUtils.clamp(Number(height) || 0, 0, 10);
    this.setWallState({
      ...this.walls,
      extraHeights: { ...this.walls.extraHeights, [side]: value },
    }, true, `Change ${side} wall height`);
    this.callbacks.onStatus?.(`${side[0].toUpperCase()}${side.slice(1)} wall extends ${value.toFixed(2)} m above the lowest tier base.`);
  }

  setWallSideOffset(side, offset) {
    if (!WALL_SIDES.includes(side)) return;
    const value = THREE.MathUtils.clamp(Number(offset) || 0, -GROUND_HALF_SIZE, GROUND_HALF_SIZE);
    this.setWallState({
      ...this.walls,
      sideOffsets: { ...this.walls.sideOffsets, [side]: value },
    }, true, `Move ${side} wall`);
    this.callbacks.onStatus?.(`${side[0].toUpperCase()}${side.slice(1)} wall moved ${Math.abs(value).toFixed(2)} m ${value >= 0 ? 'outward' : 'inward'} from the model boundary.`);
  }

  setWallColor(color) {
    const nextColor = normalizeWallColor(color);
    this.setWallState({ ...this.walls, color: nextColor }, true, 'Change wall color');
    this.callbacks.onStatus?.('Wall and arch color updated.');
  }

  setWallBrickPattern(patch) {
    const brickPattern = normalizeWallBrickPattern({ ...this.walls.brickPattern, ...patch });
    this.setWallState({ ...this.walls, brickPattern }, true, 'Edit wall brick pattern');
    this.rebuildWallBrickMaterials();
    this.syncWalls(true);
    this.callbacks.onStatus?.(`Real-scale wall brick pattern ${brickPattern.enabled ? 'updated' : 'hidden'}.`);
  }

  setWallSideBond(side, bondPattern) {
    if (!WALL_SIDES.includes(side)) return;
    const sideBonds = {
      ...this.walls.brickPattern.sideBonds,
      [side]: normalizeWallBondPattern(bondPattern),
    };
    const brickPattern = normalizeWallBrickPattern({
      ...this.walls.brickPattern,
      enabled: true,
      sideBonds,
    });
    this.setWallState({ ...this.walls, enabled: true, brickPattern }, true, `Change ${side} wall bond`);
    this.rebuildWallBrickMaterials();
    this.syncWalls(true);
    this.callbacks.onStatus?.(`${side[0].toUpperCase()}${side.slice(1)} decorative face bond updated.`);
  }

  setBuiltInWallBond(bondPattern) {
    const brickPattern = normalizeWallBrickPattern({
      ...this.walls.brickPattern,
      enabled: true,
      bondPattern: isReadableProceduralWallBond(bondPattern)
        ? bondPattern
        : DEFAULT_WALL_BRICK_PATTERN.bondPattern,
    });
    this.setWallState({ ...this.walls, enabled: true, brickPattern }, true, 'Apply built-in wall bond');
    this.rebuildWallBrickMaterials();
    this.syncWalls(true);
    this.callbacks.onStatus?.('Built-in wall bond applied.');
  }

  rebuildWallBrickMaterials() {
    const previousSideMaterials = this.wallSideMaterials || new Map();
    const previousNorthMaterial = this.northOuterBrickMaterial;
    const createMaterial = () => new THREE.MeshStandardMaterial({ color: this.walls.color, ...GIRIH_STAGE_MATERIAL, transparent: false, opacity: 1, depthTest: true, depthWrite: true, colorWrite: true, visible: true });
    const nextSideMaterials = new Map(WALL_SIDES.map((side) => {
      const material = createMaterial();
      configureWallBrickMaterial(
        material,
        wallPatternForSide(this.walls.brickPattern, side),
        null,
        side === 'south' ? this.southOpeningBrickMapping : null,
        decorativeFaceForWall(side),
      );
      return [side, material];
    }));
    const nextNorthMaterial = createMaterial();
    configureWallBrickMaterial(nextNorthMaterial, wallPatternForSide(this.walls.brickPattern, 'north'), this.northBrickArchMapping, null, decorativeFaceForWall('north'));

    this.wallGroup.traverse((child) => {
      if (!child.isMesh || !child.userData.wallSide || child.userData.isWallEdgeOverlay) return;
      child.material = child.userData.isNorthOuterFrame
        ? nextNorthMaterial
        : nextSideMaterials.get(child.userData.wallSide) || nextSideMaterials.get('south');
    });
    this.wallSideMaterials = nextSideMaterials;
    this.wallMaterial = nextSideMaterials.get('south');
    this.northOuterBrickMaterial = nextNorthMaterial;
    previousSideMaterials.forEach((material) => {
      material.userData.wallBrickPatternTexture?.dispose?.();
      material.dispose();
    });
    previousNorthMaterial.userData.wallBrickPatternTexture?.dispose?.();
    previousNorthMaterial.dispose();
  }

  setWallMaterial(material) {
    const nextMaterial = normalizeMaterialPreset(material);
    this.setWallState({ ...this.walls, material: nextMaterial }, true, 'Change wall material');
    this.callbacks.onStatus?.(`Walls and arches now use the ${nextMaterial} material.`);
  }

  setSouthOpening(type, patch) {
    if (!['door', 'window'].includes(type)) return;
    const southOpenings = normalizeSouthOpenings({
      ...this.walls.southOpenings,
      [type]: { ...this.walls.southOpenings[type], ...patch },
    });
    this.setWallState({ ...this.walls, southOpenings }, true, `Edit south wall ${type}`);
    this.callbacks.onStatus?.(`South wall ${type} updated.`);
  }

  setPointedArch(patch) {
    const pointedArch = normalizePointedArch({ ...this.walls.pointedArch, ...patch });
    this.setWallState({ ...this.walls, pointedArch }, true, 'Edit pointed arch');
    this.callbacks.onStatus?.(`Pointed arch ${pointedArch.enabled ? 'updated' : 'hidden'}.`);
  }

  setNorthWall(patch) {
    const northWall = normalizeNorthWall({ ...this.walls.northWall, ...patch });
    this.setWallState({ ...this.walls, northWall }, true, 'Edit north wall');
    this.callbacks.onStatus?.('North wall dimensions updated.');
  }

  setNorthBoundary(patch) {
    const northBoundary = normalizeNorthBoundary({ ...this.walls.northBoundary, ...patch });
    this.setWallState({ ...this.walls, northBoundary }, true, 'Edit north wall inset boundary');
    this.callbacks.onStatus?.(`North wall inset boundary ${northBoundary.enabled ? 'updated' : 'hidden'}.`);
  }

  setWallEdgeSettings(patch) {
    const wallEdges = normalizeWallEdges({ ...this.walls.wallEdges, ...patch });
    this.setWallState({ ...this.walls, wallEdges }, true, 'Edit wall edge lines');
    this.callbacks.onStatus?.(`Wall and arch edge lines ${wallEdges.enabled ? 'updated' : 'hidden'}.`);
  }

  setWallState(state, recordHistory = false, historyLabel = 'Edit frame walls') {
    if (recordHistory) this.prepareHistoryChange();
    this.walls = {
      enabled: state?.enabled === true,
      thickness: 0.4,
      color: normalizeWallColor(state?.color),
      material: 'matte',
      openSides: WALL_SIDES.filter((side) => state?.openSides?.includes(side)),
      extraHeights: Object.fromEntries(WALL_SIDES.map((side) => [side, THREE.MathUtils.clamp(Number(state?.extraHeights?.[side]) || 0, 0, 10)])),
      sideOffsets: Object.fromEntries(WALL_SIDES.map((side) => [side, THREE.MathUtils.clamp(Number(state?.sideOffsets?.[side]) || 0, -GROUND_HALF_SIZE, GROUND_HALF_SIZE)])),
      brickPattern: normalizeWallBrickPattern(state?.brickPattern),
      southOpenings: normalizeSouthOpenings(state?.southOpenings),
      pointedArch: normalizePointedArch(state?.pointedArch),
      northWall: normalizeNorthWall(state?.northWall),
      northBoundary: normalizeNorthBoundary(state?.northBoundary),
      wallEdges: normalizeWallEdges(state?.wallEdges),
    };
    if (this.wallSideMaterials) {
      const preset = GIRIH_STAGE_MATERIAL;
      this.wallSideMaterials.forEach((material, side) => {
        material.color.set(this.walls.color);
        material.roughness = preset.roughness;
        material.metalness = preset.metalness;
        updateWallBrickMaterial(
          material,
          wallPatternForSide(this.walls.brickPattern, side),
          null,
          side === 'south' ? this.southOpeningBrickMapping : null,
          decorativeFaceForWall(side),
        );
        material.needsUpdate = true;
      });
    }
    if (this.northOuterBrickMaterial) {
      const preset = GIRIH_STAGE_MATERIAL;
      this.northOuterBrickMaterial.color.set(this.walls.color);
      this.northOuterBrickMaterial.roughness = preset.roughness;
      this.northOuterBrickMaterial.metalness = preset.metalness;
      updateWallBrickMaterial(
        this.northOuterBrickMaterial,
        wallPatternForSide(this.walls.brickPattern, 'north'),
        this.northBrickArchMapping,
        null,
        decorativeFaceForWall('north'),
      );
      this.northOuterBrickMaterial.needsUpdate = true;
    }
    if (this.northBoundaryMaterial) {
      this.northBoundaryMaterial.color.set(this.walls.northBoundary.color);
      this.northBoundaryMaterial.linewidth = this.walls.northBoundary.thickness;
      this.northBoundaryMaterial.needsUpdate = true;
    }
    if (this.wallEdgeMaterial) {
      this.wallEdgeMaterial.visible = this.walls.wallEdges.enabled;
      this.wallEdgeMaterial.color.set(this.walls.wallEdges.color);
      this.wallEdgeMaterial.linewidth = this.walls.wallEdges.thickness;
      this.wallEdgeMaterial.needsUpdate = true;
    }
    this.wallSignature = '';
    this.syncWalls(true);
    this.callbacks.onWalls?.(cloneWallState(this.walls));
    if (recordHistory) this.recordHistory(historyLabel);
  }

  syncWalls(force = false) {
    const bounds = this.visibleFootprintBounds();
    const lowestTierHeight = this.levels.length ? Math.min(...this.levels.map((level) => Number(level.height) || 0)) : 0;
    const wallHeight = Math.max(0, lowestTierHeight);
    const maximumSideHeight = Math.max(
      wallHeight + Math.max(...WALL_SIDES.map((side) => this.walls.extraHeights[side])),
      this.walls.northWall.minHeight || 0,
    );
    if (!this.walls.enabled || bounds.isEmpty() || maximumSideHeight <= 1e-5) {
      this.wallGroup.visible = false;
      this.archModuleInfillGroup.visible = false;
      if (this.wallEdgeMaterial) this.wallEdgeMaterial.visible = false;
      return;
    }
    const signature = [bounds.min.x, bounds.max.x, bounds.min.z, bounds.max.z, wallHeight, ...WALL_SIDES.map((side) => this.walls.extraHeights[side]), ...WALL_SIDES.map((side) => this.walls.sideOffsets[side]), ...this.walls.openSides, JSON.stringify(this.walls.southOpenings), JSON.stringify(this.walls.pointedArch), JSON.stringify(this.walls.northWall), JSON.stringify(this.walls.northBoundary)].map((value) => typeof value === 'number' ? value.toFixed(4) : value).join(':');
    if (!force && signature === this.wallSignature) return;
    this.wallSignature = signature;
    const thickness = 0.4;
    const contactOverlap = 0.002;
    const minX = bounds.min.x + contactOverlap;
    const maxX = bounds.max.x - contactOverlap;
    const minZ = bounds.min.z + contactOverlap;
    const maxZ = bounds.max.z - contactOverlap;
    let westInnerX = minX - this.walls.sideOffsets.west;
    let eastInnerX = maxX + this.walls.sideOffsets.east;
    let southInnerZ = minZ - this.walls.sideOffsets.south;
    let northInnerZ = maxZ + this.walls.sideOffsets.north;
    if (eastInnerX - westInnerX < 0.05) {
      const middle = (eastInnerX + westInnerX) * 0.5;
      westInnerX = middle - 0.025;
      eastInnerX = middle + 0.025;
    }
    if (northInnerZ - southInnerZ < 0.05) {
      const middle = (northInnerZ + southInnerZ) * 0.5;
      southInnerZ = middle - 0.025;
      northInnerZ = middle + 0.025;
    }
    const fullWidth = eastInnerX - westInnerX + thickness * 2;
    const innerDepth = northInnerZ - southInnerZ;
    const centerX = (westInnerX + eastInnerX) * 0.5;
    const centerZ = (southInnerZ + northInnerZ) * 0.5;
    const sideHeight = (side) => wallHeight + this.walls.extraHeights[side];
    const layouts = {
      north: { position: [centerX, sideHeight('north') * 0.5, northInnerZ + thickness * 0.5], scale: [fullWidth + this.walls.northWall.outwardWidth * 2, sideHeight('north'), thickness] },
      south: { position: [centerX, sideHeight('south') * 0.5, southInnerZ - thickness * 0.5], scale: [fullWidth, sideHeight('south'), thickness] },
      east: { position: [eastInnerX + thickness * 0.5, sideHeight('east') * 0.5, centerZ], scale: [thickness, sideHeight('east'), innerDepth] },
      west: { position: [westInnerX - thickness * 0.5, sideHeight('west') * 0.5, centerZ], scale: [thickness, sideHeight('west'), innerDepth] },
    };
    const northMinimum = this.walls.northWall.minHeight || 0;
    let northHeight = Math.max(layouts.north.scale[1], northMinimum);
    if (this.walls.pointedArch.enabled && !this.walls.openSides.includes('south')) {
      const halfSpan = Math.max(0.1, (eastInnerX - westInnerX) * 0.5);
      const sideTop = Math.max(layouts.east.scale[1], layouts.west.scale[1]);
      const greenOffset = THREE.MathUtils.clamp(this.walls.pointedArch.greenOffset ?? halfSpan, 0.05, halfSpan * 2);
      const greenHeight = this.walls.pointedArch.greenHeight ?? Math.max(0, sideTop - halfSpan * 0.6);
      const arch = createPointedArchPolyline(centerX, halfSpan + thickness, sideTop, sideTop, greenOffset, greenHeight);
      const archApex = arch.length ? Math.max(...arch.map((point) => point.y)) : sideTop;
      northHeight = Math.max(northHeight, archApex + this.walls.northWall.archTopExtension);
    }
    layouts.north.scale[1] = northHeight;
    layouts.north.position[1] = northHeight * 0.5;
    const northMesh = this.wallMeshes.get('north');
    if (northMesh.geometry !== this.wallGeometry) northMesh.geometry.dispose();
    northMesh.geometry = this.wallGeometry;
    this.wallMeshes.forEach((mesh, side) => {
      mesh.position.fromArray(layouts[side].position);
      mesh.scale.fromArray(layouts[side].scale);
      mesh.visible = !this.walls.openSides.includes(side) && layouts[side].scale[1] > 1e-5 && side !== 'south';
      mesh.updateMatrixWorld(true);
    });
    this.syncSouthWallOpenings(layouts.south);
    this.syncPointedArch(layouts, westInnerX, eastInnerX);
    this.wallGroup.visible = true;
    this.syncStageWallEdges();
  }

  syncStageWallEdges() {
    const overlays = [];
    this.wallGroup.traverse((child) => {
      if (child.userData.isWallEdgeOverlay) overlays.push(child);
    });
    overlays.forEach((overlay) => {
      overlay.parent?.remove(overlay);
      overlay.geometry?.dispose?.();
    });
    this.wallEdgeMaterial.visible = this.walls.wallEdges.enabled;
    if (!this.walls.wallEdges.enabled) return;

    this.wallGroup.updateMatrixWorld(true);
    const wallMeshes = [];
    const southOpeningSegments = [];
    this.wallGroup.traverse((child) => {
      if (!child.isMesh || !child.userData.wallSide || !objectVisibleWithin(child, this.wallGroup)) return;
      if (child.userData.isSouthOpeningSegment) southOpeningSegments.push(child);
      else wallMeshes.push(child);
    });
    wallMeshes.forEach((mesh) => {
      const overlay = attachEdgeOverlay(mesh, this.wallEdgeMaterial);
      if (overlay) {
        overlay.userData.isWallEdgeOverlay = true;
        overlay.userData.ignoreRaycast = true;
      }
    });
    if (southOpeningSegments.length) {
      const overlay = attachMergedBoundaryEdgeOverlay(southOpeningSegments, this.wallEdgeMaterial, this.wallGroup);
      if (overlay) {
        overlay.userData.isWallEdgeOverlay = true;
        overlay.userData.ignoreRaycast = true;
      }
    }
  }

  syncPointedArch(layouts, minX, maxX) {
    this.updateNorthOuterBrickArchMapping(null);
    this.pointedArchMesh.visible = false;
    this.southArchInfillMesh.visible = false;
    this.northRecessFrameMesh.geometry.dispose();
    this.northRecessFrameMesh.geometry = new THREE.BufferGeometry();
    this.northRecessFrameMesh.visible = false;
    disposeGeneratedGroup(this.archModuleInfillGroup);
    this.archModuleInfillGroup.visible = false;
    if (!this.walls.pointedArch.enabled || this.walls.openSides.includes('south')) {
      if (this.walls.northBoundary.enabled) this.syncNorthWallOpening(layouts.north, null);
      this.syncNorthBoundary(layouts.north, null);
      return;
    }
    const centerX = (minX + maxX) * 0.5;
    const halfSpan = Math.max(0.1, (maxX - minX) * 0.5);
    const sideTop = Math.max(layouts.east.scale[1], layouts.west.scale[1]);
    const redHeight = sideTop;
    const greenOffset = THREE.MathUtils.clamp(this.walls.pointedArch.greenOffset ?? halfSpan, 0.05, halfSpan * 2);
    const greenHeight = this.walls.pointedArch.greenHeight ?? Math.max(0, redHeight - halfSpan * 0.6);
    const bandWidth = layouts.south.scale[2];
    const inner = createPointedArchPolyline(centerX, halfSpan, sideTop, redHeight, greenOffset, greenHeight);
    const outer = createPointedArchPolyline(centerX, halfSpan + bandWidth, sideTop, redHeight, greenOffset, greenHeight);
    if (!inner.length || !outer.length) {
      this.syncNorthBoundary(layouts.north, null);
      return;
    }
    const northRingWidth = effectiveNorthRingWidth(
      layouts.north.scale[0],
      layouts.north.scale[1],
      this.walls.brickPattern.brickWidth,
    );
    this.updateNorthOuterBrickArchMapping(createPointedArchBrickMapping(
      centerX,
      halfSpan,
      sideTop,
      redHeight,
      greenOffset,
      greenHeight,
      northRingWidth,
      layouts.north.scale[1] - northRingWidth,
      northRingWidth,
      layouts.north.scale[0] * 0.5,
      northRingWidth,
    ));
    this.syncNorthWallOpening(layouts.north, inner);
    this.syncNorthBoundary(layouts.north, inner);
    const infillShape = createSouthArchInfillShape(inner, this.walls.southOpenings, centerX, layouts.south.scale[1]);
    const shape = new THREE.Shape();
    shape.moveTo(outer[0].x, outer[0].y);
    outer.slice(1).forEach((point) => shape.lineTo(point.x, point.y));
    [...inner].reverse().forEach((point) => shape.lineTo(point.x, point.y));
    shape.closePath();
    const extrusionStart = layouts.south.position[2] - layouts.south.scale[2] * 0.5;
    const extrusionEnd = layouts.north.position[2] - layouts.north.scale[2] * 0.5;
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: Math.max(layouts.south.scale[2], extrusionEnd - extrusionStart),
      steps: 1,
      bevelEnabled: false,
      curveSegments: 48,
    });
    geometry.translate(0, 0, extrusionStart);
    this.pointedArchMesh.geometry.dispose();
    this.pointedArchMesh.geometry = geometry;
    this.pointedArchMesh.visible = true;
    this.pointedArchMesh.updateMatrixWorld(true);
    if (infillShape) {
      const inset = 0.002;
      const infillGeometry = new THREE.ExtrudeGeometry(infillShape, {
        depth: Math.max(0.01, layouts.south.scale[2] - inset * 2),
        steps: 1,
        bevelEnabled: false,
        curveSegments: 48,
      });
      infillGeometry.translate(0, 0, extrusionStart + inset);
      this.southArchInfillMesh.geometry.dispose();
      this.southArchInfillMesh.geometry = infillGeometry;
      this.southArchInfillMesh.visible = true;
      this.southArchInfillMesh.updateMatrixWorld(true);
    }
    this.syncArchModuleInfills(inner);
    const markerZ = extrusionStart - 0.03;
    this.archPointMeshes[0].position.set(centerX, redHeight, markerZ);
    this.archPointMeshes[1].position.set(centerX - greenOffset, greenHeight, markerZ);
    this.archPointMeshes[2].position.set(centerX + greenOffset, greenHeight, markerZ);
    this.archPointGroup.userData.available = true;
  }

  updateNorthOuterBrickArchMapping(mapping) {
    this.northBrickArchMapping = mapping;
    if (this.northOuterBrickMaterial) updateWallBrickMaterial(this.northOuterBrickMaterial, wallPatternForSide(this.walls.brickPattern, 'north'), mapping, null, decorativeFaceForWall('north'));
  }

  updateSouthOpeningBrickMapping(mapping) {
    this.southOpeningBrickMapping = mapping;
    if (this.wallMaterial) updateWallBrickMaterial(this.wallMaterial, wallPatternForSide(this.walls.brickPattern, 'south'), null, mapping, decorativeFaceForWall('south'));
  }

  syncNorthWallOpening(layout, innerArch = null) {
    const northMesh = this.wallMeshes.get('north');
    if (!northMesh || this.walls.openSides.includes('north')) return;
    const [wallWidth, wallHeight, thickness] = layout.scale;
    const centerX = layout.position[0];
    const leftX = centerX - wallWidth * 0.5;
    const rightX = centerX + wallWidth * 0.5;
    const shape = new THREE.Shape();
    shape.moveTo(leftX, 0);
    if (innerArch?.length) {
      shape.lineTo(innerArch[0].x, 0);
      shape.lineTo(innerArch[0].x, innerArch[0].y);
      innerArch.slice(1).forEach((point) => shape.lineTo(point.x, point.y));
      shape.lineTo(innerArch[innerArch.length - 1].x, 0);
    }
    shape.lineTo(rightX, 0);
    shape.lineTo(rightX, wallHeight);
    shape.lineTo(leftX, wallHeight);
    shape.closePath();

    const recessEnabled = this.walls.northBoundary.enabled;
    const recessDepth = recessEnabled ? Math.min(this.walls.northBoundary.depth, Math.max(0, thickness - 0.02)) : 0;
    const bodyDepth = Math.max(0.02, thickness - recessDepth);
    const extrusionStart = layout.position[2] - thickness * 0.5;
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: bodyDepth,
      steps: 1,
      bevelEnabled: false,
      curveSegments: 48,
    });
    geometry.translate(0, 0, extrusionStart);
    if (northMesh.geometry !== this.wallGeometry) northMesh.geometry.dispose();
    northMesh.geometry = geometry;
    northMesh.position.set(0, 0, 0);
    northMesh.scale.set(1, 1, 1);
    northMesh.updateMatrixWorld(true);

    if (recessDepth > 1e-5) {
      const offset = effectiveNorthRingWidth(wallWidth, wallHeight, this.walls.brickPattern.brickWidth);
      const insetLeft = leftX + offset;
      const insetRight = rightX - offset;
      const insetBottom = offset;
      const insetTop = wallHeight - offset;
      if (insetRight > insetLeft && insetTop > insetBottom) {
        const insetPath = new THREE.Path();
        insetPath.moveTo(insetLeft, insetBottom);
        if (innerArch?.length) {
          const offsetArch = offsetArchPolylineIntoWall(innerArch, offset).map((point) => new THREE.Vector2(point.x, Math.min(insetTop, point.y)));
          insetPath.lineTo(offsetArch[0].x, insetBottom);
          insetPath.lineTo(offsetArch[0].x, offsetArch[0].y);
          offsetArch.slice(1).forEach((point) => insetPath.lineTo(point.x, point.y));
          insetPath.lineTo(offsetArch[offsetArch.length - 1].x, insetBottom);
        }
        insetPath.lineTo(insetRight, insetBottom);
        insetPath.lineTo(insetRight, insetTop);
        insetPath.lineTo(insetLeft, insetTop);
        insetPath.closePath();
        const frameShape = shape.clone();
        frameShape.holes.push(insetPath);
        const frameGeometry = new THREE.ExtrudeGeometry(frameShape, {
          depth: recessDepth,
          steps: 1,
          bevelEnabled: false,
          curveSegments: 48,
        });
        frameGeometry.translate(0, 0, extrusionStart + bodyDepth);
        this.northRecessFrameMesh.geometry.dispose();
        this.northRecessFrameMesh.geometry = frameGeometry;
        this.northRecessFrameMesh.visible = true;
        this.northRecessFrameMesh.updateMatrixWorld(true);
      }
    }
  }

  syncNorthBoundary(layout, innerArch) {
    this.northBoundaryGroup.children.forEach((child) => child.geometry?.dispose?.());
    this.northBoundaryGroup.clear();
    if (this.walls.openSides.includes('north')) {
      this.northBoundaryGroup.visible = false;
      return;
    }
    const [wallWidth, wallHeight, thickness] = layout.scale;
    const offset = effectiveNorthRingWidth(wallWidth, wallHeight, this.walls.brickPattern.brickWidth);
    if (offset <= 0 || wallWidth <= offset * 2 || wallHeight <= offset * 2) {
      this.northBoundaryGroup.visible = false;
      return;
    }
    const centerX = layout.position[0];
    const leftX = centerX - wallWidth * 0.5 + offset;
    const rightX = centerX + wallWidth * 0.5 - offset;
    const bottomY = offset;
    const topY = wallHeight - offset;
    const segments = [];
    const addSegment = (x1, y1, z1, x2, y2, z2) => segments.push(x1, y1, z1, x2, y2, z2);
    const faceZs = [
      layout.position[2] - thickness * 0.5 - 0.003,
      layout.position[2] + thickness * 0.5 + 0.003,
    ];
    faceZs.forEach((z) => {
      addSegment(leftX, bottomY, z, leftX, topY, z);
      addSegment(leftX, topY, z, rightX, topY, z);
      addSegment(rightX, topY, z, rightX, bottomY, z);
      if (innerArch?.length) {
        const offsetArch = offsetArchPolylineIntoWall(innerArch, offset).map((point) => new THREE.Vector2(point.x, Math.min(topY, point.y)));
        const openingLeft = offsetArch[0];
        const openingRight = offsetArch[offsetArch.length - 1];
        addSegment(leftX, bottomY, z, Math.max(leftX, openingLeft.x), bottomY, z);
        addSegment(Math.min(rightX, openingRight.x), bottomY, z, rightX, bottomY, z);
        addSegment(openingLeft.x, bottomY, z, openingLeft.x, openingLeft.y, z);
        for (let index = 0; index < offsetArch.length - 1; index += 1) {
          const first = offsetArch[index];
          const second = offsetArch[index + 1];
          addSegment(first.x, first.y, z, second.x, second.y, z);
        }
        addSegment(openingRight.x, openingRight.y, z, openingRight.x, bottomY, z);
      } else {
        addSegment(leftX, bottomY, z, rightX, bottomY, z);
      }
    });
    const geometry = new LineSegmentsGeometry();
    geometry.setPositions(segments);
    const line = new LineSegments2(geometry, this.northBoundaryMaterial);
    line.name = 'North wall inset boundary line';
    line.userData.isNorthBoundary = true;
    line.renderOrder = 27;
    line.frustumCulled = false;
    line.computeLineDistances();
    this.northBoundaryGroup.add(line);
    this.northBoundaryGroup.visible = this.walls.northBoundary.enabled;
  }

  syncArchModuleInfills(innerArch) {
    const candidates = [...this.instances.values()].filter((root) => root.visible).filter((root) => {
      const bounds = new THREE.Box3().setFromObject(root);
      return ![...this.instances.values()].some((other) => {
        if (other === root || !other.visible) return false;
        const otherBounds = new THREE.Box3().setFromObject(other);
        if (otherBounds.max.y <= bounds.max.y + 0.025 || otherBounds.min.y <= bounds.min.y + 0.025) return false;
        const item = this.library.get(root.userData.libraryId);
        const otherItem = this.library.get(other.userData.libraryId);
        return item && otherItem && footprintsOverlap(root, item, other, otherItem);
      });
    });

    candidates.forEach((root) => {
      const item = this.library.get(root.userData.libraryId);
      const contour = moduleWorldFootprintContour(root, effectiveSnapItem(root, item)?.connectors || []);
      if (contour.length < 3) return;
      const bottomY = new THREE.Box3().setFromObject(root).max.y;
      const geometry = createFootprintVaultExtensionGeometry(contour, bottomY, innerArch);
      if (!geometry) return;
      const sourceMesh = findFirstRenderableMesh(root);
      const sourceMaterial = Array.isArray(sourceMesh?.material) ? sourceMesh.material[0] : sourceMesh?.material;
      const material = sourceMaterial?.clone?.() || new THREE.MeshStandardMaterial({ color: item?.appearance?.color || '#f2d336', roughness: 0.72, metalness: 0 });
      material.side = THREE.DoubleSide;
      material.flatShading = true;
      material.needsUpdate = true;
      const extension = new THREE.Mesh(geometry, material);
      extension.name = `${root.name} vault extension`;
      extension.userData.isArchModuleInfill = true;
      extension.userData.sourceInstanceId = root.userData.instanceId;
      extension.userData.levelId = root.userData.levelId;
      extension.castShadow = this.shadowsEnabled;
      extension.receiveShadow = this.shadowsEnabled;
      this.archModuleInfillGroup.add(extension);
    });
    this.archModuleInfillGroup.visible = this.archModuleInfillGroup.children.length > 0;
  }

  syncSouthWallOpenings(layout) {
    disposeEdgeOverlayGeometries(this.southWallSegments);
    this.southWallSegments.clear();
    const baseMesh = this.wallMeshes.get('south');
    const wallOpen = this.walls.openSides.includes('south');
    const [wallWidth, wallHeight, thickness] = layout.scale;
    const enabledOpenings = Object.entries(this.walls.southOpenings).filter(([, opening]) => opening.enabled);
    if (wallOpen || wallHeight <= 1e-5) {
      this.updateSouthOpeningBrickMapping(null);
      baseMesh.visible = false;
      this.southWallSegments.visible = false;
      return;
    }
    if (!enabledOpenings.length) {
      this.updateSouthOpeningBrickMapping(null);
      baseMesh.visible = true;
      this.southWallSegments.visible = false;
      return;
    }

    baseMesh.visible = false;
    this.southWallSegments.visible = true;
    const wallLeft = layout.position[0] - wallWidth * 0.5;
    const wallRight = layout.position[0] + wallWidth * 0.5;
    const rectangles = enabledOpenings.map(([type, opening]) => {
      const centerX = THREE.MathUtils.clamp(layout.position[0] + opening.position, wallLeft, wallRight);
      const halfWidth = Math.max(0.025, opening.width * 0.5);
      const minY = type === 'door' ? 0 : opening.sillHeight ?? wallHeight * 0.8;
      return {
        type,
        minX: THREE.MathUtils.clamp(centerX - halfWidth, wallLeft, wallRight),
        maxX: THREE.MathUtils.clamp(centerX + halfWidth, wallLeft, wallRight),
        minY: THREE.MathUtils.clamp(minY, 0, wallHeight),
        maxY: THREE.MathUtils.clamp(minY + opening.height, 0, wallHeight),
      };
    }).filter((opening) => opening.maxX - opening.minX > 1e-5 && opening.maxY - opening.minY > 1e-5);
    const openingByType = Object.fromEntries(rectangles.map((opening) => [opening.type, opening]));
    this.updateSouthOpeningBrickMapping({
      enabled: rectangles.length > 0,
      wallZ: layout.position[2],
      halfThickness: thickness * 0.5,
      door: openingByType.door || null,
      window: openingByType.window || null,
    });
    const xCuts = uniqueSortedNumbers([wallLeft, wallRight, ...rectangles.flatMap((opening) => [opening.minX, opening.maxX])]);
    const yCuts = uniqueSortedNumbers([0, wallHeight, ...rectangles.flatMap((opening) => [opening.minY, opening.maxY])]);
    for (let xIndex = 0; xIndex < xCuts.length - 1; xIndex += 1) {
      for (let yIndex = 0; yIndex < yCuts.length - 1; yIndex += 1) {
        const minX = xCuts[xIndex];
        const maxX = xCuts[xIndex + 1];
        const minY = yCuts[yIndex];
        const maxY = yCuts[yIndex + 1];
        const centerX = (minX + maxX) * 0.5;
        const centerY = (minY + maxY) * 0.5;
        if (rectangles.some((opening) => centerX > opening.minX - 1e-6 && centerX < opening.maxX + 1e-6 && centerY > opening.minY - 1e-6 && centerY < opening.maxY + 1e-6)) continue;
        const segment = new THREE.Mesh(this.wallGeometry, this.wallMaterial);
        segment.name = 'South frame wall segment';
        segment.userData.wallSide = 'south';
        segment.userData.isSouthOpeningSegment = true;
        segment.position.set(centerX, centerY, layout.position[2]);
        segment.scale.set(maxX - minX, maxY - minY, thickness);
        segment.castShadow = this.shadowsEnabled;
        segment.receiveShadow = this.shadowsEnabled;
        this.southWallSegments.add(segment);
      }
    }
    this.southWallSegments.updateMatrixWorld(true);
  }

  visibleFootprintBounds() {
    const bounds = new THREE.Box3();
    this.instances.forEach((root) => {
      if (!root.visible) return;
      const item = this.library.get(root.userData.libraryId);
      const snapItem = effectiveSnapItem(root, item);
      let expandedFromFootprint = false;
      snapItem?.connectors?.forEach((connector) => {
        const face = worldSnapFace(root, connector);
        if (!face) return;
        face.edges.forEach((edge) => bounds.expandByPoint(new THREE.Vector3(edge.x, 0, edge.z)));
        expandedFromFootprint = true;
      });
      if (!expandedFromFootprint) {
        const fallback = new THREE.Box3().setFromObject(root);
        if (!fallback.isEmpty()) {
          bounds.expandByPoint(new THREE.Vector3(fallback.min.x, 0, fallback.min.z));
          bounds.expandByPoint(new THREE.Vector3(fallback.max.x, 0, fallback.max.z));
        }
      }
    });
    return bounds;
  }

  setGlobalMaterial(material) {
    this.globalMaterial = ['matte', 'glossy', 'metallic', 'stone'].includes(material) ? material : 'matte';
    this.library.forEach((item) => applyAppearanceToObject(item.source, item.appearance, this.globalMaterial));
    this.instances.forEach((root) => {
      const item = this.library.get(root.userData.libraryId);
      if (item) applyAppearanceToObject(root, item.appearance, this.globalMaterial);
    });
    this.wallSignature = '';
    this.callbacks.onLibrary?.([...this.library.values()].map((item) => this.publicLibraryItem(item)));
  }

  setEdgeSettings(patch, recordHistory = true) {
    if (recordHistory) this.prepareHistoryChange();
    const rebuildGeometry = patch.verticalLines !== undefined
      && (patch.verticalLines !== false) !== this.edgeSettings.verticalLines;
    if (patch.enabled !== undefined) this.edgeSettings.enabled = patch.enabled === true;
    if (patch.thickness !== undefined) this.edgeSettings.thickness = THREE.MathUtils.clamp(Number(patch.thickness) || 1, 0.5, 6);
    if (patch.color !== undefined && /^#[0-9a-f]{6}$/i.test(patch.color)) this.edgeSettings.color = patch.color;
    if (patch.verticalLines !== undefined) this.edgeSettings.verticalLines = patch.verticalLines !== false;
    this.edgeMaterial.visible = this.edgeSettings.enabled;
    this.edgeMaterial.linewidth = this.edgeSettings.thickness;
    this.edgeMaterial.color.set(this.edgeSettings.color);
    this.edgeMaterial.side = THREE.DoubleSide;
    this.edgeMaterial.needsUpdate = true;
    if (rebuildGeometry) {
      this.instances.forEach((root) => rebuildModuleEdgeOverlays(root, this.edgeMaterial, this.edgeSettings.verticalLines));
    } else if (this.edgeSettings.enabled) {
      this.instances.forEach((root) => ensureModuleEdgeOverlays(root, this.edgeMaterial, this.edgeSettings.verticalLines));
    }
    this.callbacks.onEdges?.({ ...this.edgeSettings });
    if (recordHistory) this.recordHistory('Edit edge lines');
  }

  startBoxSelection(event) {
    const bounds = this.renderer.domElement.getBoundingClientRect();
    this.boxSelection = {
      startX: event.clientX,
      startY: event.clientY,
      bounds,
    };
    this.selectionMarquee.style.display = 'block';
    this.updateBoxSelection(event);
    this.orbit.enabled = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  updateBoxSelection(event) {
    if (!this.boxSelection) return;
    const { startX, startY, bounds } = this.boxSelection;
    const left = Math.max(bounds.left, Math.min(startX, event.clientX));
    const top = Math.max(bounds.top, Math.min(startY, event.clientY));
    const right = Math.min(bounds.right, Math.max(startX, event.clientX));
    const bottom = Math.min(bounds.bottom, Math.max(startY, event.clientY));
    Object.assign(this.selectionMarquee.style, {
      left: `${left - bounds.left}px`,
      top: `${top - bounds.top}px`,
      width: `${Math.max(0, right - left)}px`,
      height: `${Math.max(0, bottom - top)}px`,
    });
    this.boxSelection.rect = { left, top, right, bottom };
    event.preventDefault();
  }

  finishBoxSelection(event) {
    this.updateBoxSelection(event);
    const selectionRect = this.boxSelection.rect;
    const canvasBounds = this.boxSelection.bounds;
    this.boxSelection = null;
    this.selectionMarquee.style.display = 'none';
    this.orbit.enabled = this.mainView === 'perspective';
    const boxSelectableRoots = this.mainView === 'top'
      ? [...this.instances.values()].filter((root) => root.visible)
      : this.editableRootsForView();
    const roots = boxSelectableRoots.filter((root) => {
      const projected = projectedObjectRect(root, this.cameraForView(this.mainView), canvasBounds);
      return projected && rectanglesIntersect(selectionRect, projected);
    });
    this.selectRoots(roots, roots[0] || null, true);
    this.callbacks.onStatus?.(roots.length
      ? `${this.selectedRoots.length} module${this.selectedRoots.length === 1 ? '' : 's'} selected${this.mainView === 'top' ? ' across all tiers' : ''}.`
      : 'Selection cleared.');
  }

  groupSelected() {
    if (this.selectedRoots.length < 2) return;
    this.prepareHistoryChange();
    const groupId = crypto.randomUUID();
    this.selectedRoots.forEach((root) => { root.userData.groupId = groupId; });
    this.selectRoots(this.selectedRoots);
    this.recordHistory('Group modules');
    this.callbacks.onStatus?.(`${this.selectedRoots.length} modules grouped.`);
  }

  ungroupSelected() {
    if (!this.selectedRoots.some((root) => root.userData.groupId)) return;
    this.prepareHistoryChange();
    this.selectedRoots.forEach((root) => { delete root.userData.groupId; });
    const roots = [...this.selectedRoots];
    this.selectRoots(roots);
    this.recordHistory('Ungroup modules');
    this.callbacks.onStatus?.(`${roots.length} modules ungrouped.`);
  }

  mirrorSelected(axis) {
    if (!this.selectedRoots.length || !['x', 'z'].includes(axis)) return;
    this.prepareHistoryChange();
    const center = selectionBounds(this.selectedRoots).getCenter(new THREE.Vector3());
    const mirrorScale = axis === 'x' ? new THREE.Vector3(-1, 1, 1) : new THREE.Vector3(1, 1, -1);
    const mirror = new THREE.Matrix4().makeTranslation(center.x, center.y, center.z)
      .multiply(new THREE.Matrix4().makeScale(mirrorScale.x, mirrorScale.y, mirrorScale.z))
      .multiply(new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z));
    this.selectedRoots.forEach((root) => {
      root.updateMatrixWorld(true);
      mirror.clone().multiply(root.matrixWorld).decompose(root.position, root.quaternion, root.scale);
      this.placeRootOnTier(root);
    });
    this.constrainRootsToGround(this.selectedRoots);
    this.updateTransformTarget();
    this.refreshSelectionHighlights();
    this.emitSelection();
    this.recordHistory(`Mirror ${axis.toUpperCase()}`);
    this.callbacks.onStatus?.(`Mirrored ${this.selectedRoots.length === 1 ? this.selected.name : `${this.selectedRoots.length} modules`} on ${axis.toUpperCase()}.`);
  }

  constrainRootsToGround(roots) {
    if (!roots?.length) return;
    let bounds = selectionBounds(roots);
    const size = bounds.getSize(new THREE.Vector3());
    if (size.x > GROUND_SIZE || size.z > GROUND_SIZE) {
      const factor = Math.min(GROUND_SIZE / Math.max(size.x, 1e-9), GROUND_SIZE / Math.max(size.z, 1e-9)) * 0.999;
      const center = bounds.getCenter(new THREE.Vector3());
      const scaleAroundCenter = new THREE.Matrix4().makeTranslation(center.x, center.y, center.z)
        .multiply(new THREE.Matrix4().makeScale(factor, factor, factor))
        .multiply(new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z));
      roots.forEach((root) => {
        root.updateMatrixWorld(true);
        scaleAroundCenter.clone().multiply(root.matrixWorld).decompose(root.position, root.quaternion, root.scale);
        this.placeRootOnTier(root);
      });
      bounds = selectionBounds(roots);
    }
    const offset = new THREE.Vector3();
    if (bounds.min.x < -GROUND_HALF_SIZE) offset.x = -GROUND_HALF_SIZE - bounds.min.x;
    else if (bounds.max.x > GROUND_HALF_SIZE) offset.x = GROUND_HALF_SIZE - bounds.max.x;
    if (bounds.min.z < -GROUND_HALF_SIZE) offset.z = -GROUND_HALF_SIZE - bounds.min.z;
    else if (bounds.max.z > GROUND_HALF_SIZE) offset.z = GROUND_HALF_SIZE - bounds.max.z;
    roots.forEach((root) => {
      root.position.x += offset.x;
      root.position.z += offset.z;
      root.updateMatrixWorld(true);
    });
  }

  setLevels(levels, activeLevelId = this.activeLevelId, notify = true, recordHistory = true) {
    if (recordHistory) this.prepareHistoryChange();
    const normalized = (Array.isArray(levels) ? levels : [])
      .map((level, index) => {
        const originalName = String(level.name ?? `Tier ${index + 1}`);
        const legacyDefaultTier = /^(?:Level|Tier)\s+1$/i.test(originalName) && [0, 0.25].includes(Number(level.height));
        return {
          id: String(level.id || `tier-${index + 1}`),
          name: originalName.replace(/^Level(?=\s+\d+$)/i, 'Tier').slice(0, 40),
          height: legacyDefaultTier ? 0.4 : Number.isFinite(Number(level.height)) ? Number(level.height) : 0,
        };
      });
    this.levels = normalized.length ? normalized : DEFAULT_LEVELS.map((level) => ({ ...level }));
    this.activeLevelId = this.levels.some((level) => level.id === activeLevelId) ? activeLevelId : this.levels[0].id;
    const fallbackId = this.levels[0].id;
    this.instances.forEach((root) => {
      if (!this.levels.some((level) => level.id === root.userData.levelId)) root.userData.levelId = fallbackId;
      this.placeRootOnTier(root);
    });
    this.rebuildLevelGuides();
    this.refreshConnectorMarkers();
    if (this.mode === 'slice') this.refreshSliceGuides();
    this.emitSelection();
    if (notify) this.callbacks.onLevels?.({ levels: this.levels.map((level) => ({ ...level })), activeLevelId: this.activeLevelId });
    if (recordHistory) this.recordHistory('Edit tiers');
  }

  setActiveLevel(levelId) {
    if (!this.levels.some((level) => level.id === levelId)) return;
    this.activeLevelId = levelId;
    if (this.selected && this.selected.userData.levelId !== levelId) this.select(null);
    if (this.mode === 'slice') {
      this.sliceDraft = null;
      this.refreshSliceGuides();
    }
    this.callbacks.onLevels?.({ levels: this.levels.map((level) => ({ ...level })), activeLevelId: this.activeLevelId });
  }

  moveWorkingLevel(direction) {
    const ordered = [...this.levels].sort((a, b) => a.height - b.height);
    const step = Math.sign(direction);
    if (!step) return;
    if (this.selectedRoots.length > 1) {
      const moves = this.selectedRoots.map((root) => {
        const index = ordered.findIndex((level) => level.id === root.userData.levelId);
        return { root, next: ordered[index + step] };
      });
      if (moves.some((move) => !move.next)) {
        this.callbacks.onStatus?.('The group cannot move farther while preserving all tier assignments.');
        return;
      }
      this.prepareHistoryChange();
      moves.forEach(({ root, next }) => {
        root.userData.levelId = next.id;
        this.placeRootOnTier(root);
      });
      this.activeLevelId = moves.find((move) => move.root === this.selected)?.next.id || moves[0].next.id;
      this.refreshSelectionHighlights();
      this.refreshConnectorMarkers();
      this.emitSelection();
      this.recordHistory('Shift grouped modules between tiers');
      this.callbacks.onStatus?.(`${this.selectedRoots.length} grouped modules shifted ${step > 0 ? 'up' : 'down'} one tier while preserving their tier spacing.`);
      this.callbacks.onLevels?.({ levels: this.levels.map((level) => ({ ...level })), activeLevelId: this.activeLevelId });
      return;
    }
    const currentId = this.selected?.userData.levelId || this.activeLevelId;
    const currentIndex = Math.max(0, ordered.findIndex((level) => level.id === currentId));
    const next = ordered[Math.max(0, Math.min(ordered.length - 1, currentIndex + step))];
    if (!next || next.id === currentId) return;
    this.activeLevelId = next.id;
    if (this.selected) this.assignSelectedToLevel(next.id);
    else this.callbacks.onStatus?.(`${next.name} is now the active tier.`);
    this.callbacks.onLevels?.({ levels: this.levels.map((level) => ({ ...level })), activeLevelId: this.activeLevelId });
  }

  dropLibraryInstance(libraryId, clientX, clientY, levelId = this.activeLevelId) {
    let point;
    if (this.mainView === 'front') {
      this.setPointerFromClient(clientX, clientY);
      point = this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), new THREE.Vector3());
      if (point) point.z = 0;
    } else {
      point = this.worldPointOnLevel(clientX, clientY, levelId);
    }
    this.prepareHistoryChange();
    const root = this.addInstance(libraryId, null, { levelId, recordHistory: false });
    if (!root) return null;
    if (!point) {
      this.recordHistory('Add module');
      return root;
    }
    root.position.x = point.x;
    root.position.z = point.z;
    this.placeRootOnTier(root);
    if (this.snap.enabled) this.snapSelectedToConnector();
    this.lockSelectedToLevel();
    this.constrainRootsToGround([root]);
    if (this.snap.enabled && this.rootOverlapsAnother(root)) {
      this.select(null);
      this.instances.delete(root.userData.instanceId);
      this.assembly.remove(root);
      disposeObject(root);
      this.emitStats();
      this.callbacks.onStatus?.('Placement cancelled because modules cannot overlap. Move closer to an exterior vertical face to snap.');
      return null;
    }
    this.refreshConnectorMarkers();
    this.refreshSelectionHighlights();
    this.emitSelection();
    this.callbacks.onStatus?.(`${root.name} placed on ${this.levels.find((level) => level.id === levelId)?.name}.`);
    this.recordHistory('Add module');
    return root;
  }

  assignSelectedToLevel(levelId) {
    if (!this.selected || !this.levels.some((level) => level.id === levelId)) return;
    this.prepareHistoryChange();
    this.selectedRoots.forEach((root) => {
      root.userData.levelId = levelId;
      this.placeRootOnTier(root);
    });
    this.refreshConnectorMarkers();
    this.emitSelection();
    this.callbacks.onStatus?.(`${this.selected.name} moved to ${this.levels.find((level) => level.id === levelId)?.name}.`);
    this.recordHistory('Change module tier');
  }

  levelHeight(levelId) {
    return this.levels.find((level) => level.id === levelId)?.height || 0;
  }

  lockSelectedToLevel() {
    if (!this.selected) return;
    this.selectedRoots.forEach((root) => this.placeRootOnTier(root));
  }

  placeRootOnTier(root) {
    if (!root) return;
    const tierHeight = this.levelHeight(root.userData.levelId);
    root.position.y = 0;
    root.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(root);
    const offset = bounds.isEmpty() ? 0 : -bounds.min.y;
    root.position.y = tierHeight + offset;
    root.userData.tierOffsetY = offset;
    root.updateMatrixWorld(true);
  }

  snapSelectedToConnector() {
    if (!this.selected || this.instances.size < 2) return;
    const movingRoots = [...this.selectedRoots];
    const movingSet = new Set(movingRoots);
    if (!movingRoots.length) return;
    const orderedLevels = [...this.levels].sort((a, b) => a.height - b.height);
    const originalTransforms = new Map(movingRoots.map((root) => [root, {
      position: root.position.clone(),
      quaternion: root.quaternion.clone(),
    }]));
    const pivot = selectionBounds(movingRoots).getCenter(new THREE.Vector3());
    const candidates = [];
    const sourceFaces = this.collectExposedSnapFaces(movingRoots, orderedLevels);
    const stationaryGroups = new Map();
    this.instances.forEach((root) => {
      if (movingSet.has(root) || !root.visible) return;
      const key = root.userData.groupId || root.userData.instanceId;
      if (!stationaryGroups.has(key)) stationaryGroups.set(key, []);
      stationaryGroups.get(key).push(root);
    });

    stationaryGroups.forEach((targetRoots) => {
      const targetFaces = this.collectExposedSnapFaces(targetRoots, orderedLevels);
      for (const source of sourceFaces) {
        for (const target of targetFaces) {
          const tierDistance = Math.abs(source.levelIndex - target.levelIndex);
          if (source.levelIndex < 0 || target.levelIndex < 0 || tierDistance > 1) continue;
          const attractionDistance = segmentDistanceXZ(source.edges[0], source.edges[1], target.edges[0], target.edges[1]);
          if (attractionDistance > this.snap.snapDistance) continue;
          const desiredNormal = target.normal.clone().negate();
          const yaw = signedYawBetween(source.normal, desiredNormal);
          const rotatedCenter = rotatePointAroundY(source.center, pivot, yaw);
          const rotatedTangent = source.tangent.clone().applyAxisAngle(Y_AXIS, yaw).normalize();
          const halfSource = rotatedTangent.clone().multiplyScalar(source.span * 0.5);
          const sourceEdges = [rotatedCenter.clone().sub(halfSource), rotatedCenter.clone().add(halfSource)];
          for (const sourceEdge of sourceEdges) {
            for (const targetEdge of target.edges) {
              const offset = targetEdge.clone().sub(sourceEdge);
              offset.y = 0;
              const distance = Math.hypot(offset.x, offset.z);
              const movedStart = sourceEdges[0].clone().add(offset);
              const movedEnd = sourceEdges[1].clone().add(offset);
              const overlap = segmentOverlapOnAxis(movedStart, movedEnd, target.edges[0], target.edges[1], target.tangent);
              if (overlap <= Math.max(1e-5, Math.min(source.span, target.span) * 1e-4)) continue;
              candidates.push({ yaw, offset, distance, attractionDistance, overlap, tierDistance, targetGroupSize: targetRoots.length });
            }
          }
        }
      }
    });

    candidates.sort((a, b) => (a.attractionDistance - b.attractionDistance) * 10
      + (a.distance - b.distance)
      + (Math.abs(a.yaw) - Math.abs(b.yaw)) * 0.002
      - (a.overlap - b.overlap) * 0.0001);
    let accepted = null;
    for (const candidate of candidates) {
      const rotation = new THREE.Quaternion().setFromAxisAngle(Y_AXIS, candidate.yaw);
      originalTransforms.forEach((transform, root) => {
        root.position.copy(rotatePointAroundY(transform.position, pivot, candidate.yaw)).add(candidate.offset);
        root.quaternion.copy(transform.quaternion).premultiply(rotation);
      });
      this.lockSelectedToLevel();
      movingRoots.forEach((root) => root.updateMatrixWorld(true));
      if (movingRoots.some((root) => !rootFitsGround(root) || this.rootOverlapsAnother(root, movingSet))) continue;
      accepted = candidate;
      break;
    }
    if (!accepted) {
      originalTransforms.forEach((transform, root) => {
        root.position.copy(transform.position);
        root.quaternion.copy(transform.quaternion);
      });
      this.lockSelectedToLevel();
      movingRoots.forEach((root) => root.updateMatrixWorld(true));
      return;
    }
    const tierLabel = accepted.tierDistance === 0 ? 'same tier' : 'adjacent tier';
    const sourceLabel = movingRoots.length > 1 ? `${movingRoots.length}-module group` : this.selected.name;
    const targetLabel = accepted.targetGroupSize > 1 ? `${accepted.targetGroupSize}-module group` : 'module';
    this.callbacks.onStatus?.(`Snapped ${sourceLabel} to ${targetLabel}: exterior faces touch and vertical edges align on the ${tierLabel}.`);
    this.refreshConnectorMarkers();
  }

  collectExposedSnapFaces(roots, orderedLevels) {
    const faces = [];
    roots.forEach((root) => {
      const item = this.library.get(root.userData.libraryId);
      if (!item || !root.visible) return;
      const snapItem = effectiveSnapItem(root, item);
      snapItem.connectors.forEach((connector) => {
        const face = worldSnapFace(root, connector);
        if (face) faces.push({ ...face, root, item: snapItem, levelIndex: orderedLevels.findIndex((level) => level.id === root.userData.levelId) });
      });
    });
    if (roots.length < 2) return faces;
    return faces.filter((face) => !roots.some((other) => other !== face.root && snapFaceBlockedByRoot(face, other, this.library.get(other.userData.libraryId))));
  }

  rotateSelectionQuarterTurn() {
    if (!this.selectedRoots.length) return;
    const originals = new Map(this.selectedRoots.map((root) => [root, {
      position: root.position.clone(),
      quaternion: root.quaternion.clone(),
    }]));
    const center = selectionBounds(this.selectedRoots).getCenter(new THREE.Vector3());
    const groupRotation = new THREE.Matrix4()
      .makeTranslation(center.x, center.y, center.z)
      .multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2))
      .multiply(new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z));
    this.selectedRoots.forEach((root) => {
      root.updateMatrixWorld(true);
      setObjectWorldMatrix(root, groupRotation.clone().multiply(root.matrixWorld));
    });
    this.constrainRootsToGround(this.selectedRoots);
    const movingSet = new Set(this.selectedRoots);
    const overlapPrevented = this.snap.enabled && this.selectedRoots.some((root) => this.rootOverlapsAnother(root, movingSet));
    if (overlapPrevented) {
      originals.forEach((transform, root) => {
        root.position.copy(transform.position);
        root.quaternion.copy(transform.quaternion);
        this.placeRootOnTier(root);
      });
      this.callbacks.onStatus?.('The 90° rotation was cancelled because modules cannot overlap.');
    } else {
      this.callbacks.onStatus?.(`${this.selectedRoots.length === 1 ? this.selected.name : `${this.selectedRoots.length} modules`} rotated 90°.`);
    }
    this.updateTransformTarget();
    this.refreshConnectorMarkers();
    this.refreshSelectionHighlights();
    this.emitSelection();
    this.recordHistory('Rotate selection 90 degrees');
  }

  rootOverlapsAnother(root, ignoredRoots = null) {
    const item = this.library.get(root.userData.libraryId);
    if (!item) return false;
    const bounds = new THREE.Box3().setFromObject(root);
    for (const other of this.instances.values()) {
      if (other === root || ignoredRoots?.has(other) || !other.visible) continue;
      const otherItem = this.library.get(other.userData.libraryId);
      if (!otherItem) continue;
      const otherBounds = new THREE.Box3().setFromObject(other);
      const verticalOverlap = Math.min(bounds.max.y, otherBounds.max.y) - Math.max(bounds.min.y, otherBounds.min.y);
      if (verticalOverlap <= 1e-5) continue;
      const horizontalOverlapX = Math.min(bounds.max.x, otherBounds.max.x) - Math.max(bounds.min.x, otherBounds.min.x);
      const horizontalOverlapZ = Math.min(bounds.max.z, otherBounds.max.z) - Math.max(bounds.min.z, otherBounds.min.z);
      if (horizontalOverlapX <= 1e-6 || horizontalOverlapZ <= 1e-6) continue;
      if (footprintsOverlap(root, item, other, otherItem)) return true;
    }
    return false;
  }

  duplicateSelected() {
    if (!this.selected) return;
    this.prepareHistoryChange();
    const groupId = this.selectedRoots.length > 1 ? crypto.randomUUID() : null;
    const copies = this.selectedRoots.map((root) => {
      const transform = serializeTransform(root);
      transform.position[0] += Math.max(this.snap.gridSize, 0.2);
      transform.position[2] += Math.max(this.snap.gridSize, 0.2);
      return this.addInstance(root.userData.libraryId, transform, {
        levelId: root.userData.levelId,
        groupId,
        slicePlanes: root.userData.slicePlanes,
        recordHistory: false,
      });
    }).filter(Boolean);
    copies.forEach((root) => ensureModuleEdgeOverlays(root, this.edgeMaterial, this.edgeSettings.verticalLines));
    this.selectRoots(copies);
    this.constrainRootsToGround(copies);
    this.recordHistory('Duplicate modules');
  }

  deleteSelected() {
    if (!this.selected) return;
    this.prepareHistoryChange();
    const targets = [...this.selectedRoots];
    this.select(null);
    targets.forEach((target) => {
      this.instances.delete(target.userData.instanceId);
      this.assembly.remove(target);
      disposeObject(target);
    });
    this.wallSignature = '';
    this.emitStats();
    this.callbacks.onStatus?.('Module removed.');
    this.recordHistory('Delete module');
  }

  clearAssembly(options = {}) {
    const shouldRecord = options.recordHistory !== false && this.instances.size > 0;
    if (shouldRecord) this.prepareHistoryChange();
    this.select(null);
    [...this.instances.values()].forEach((root) => { this.assembly.remove(root); disposeObject(root); });
    this.instances.clear();
    if (options.resetWalls === true) {
      this.setWallState({ ...this.walls, enabled: false }, false);
      this.setNightPreview(false);
      this.setNightLights([]);
    }
    this.wallSignature = '';
    this.emitStats();
    if (shouldRecord) this.recordHistory('Clear assembly');
  }

  captureHistoryState() {
    return {
      levels: this.levels.map((level) => ({ ...level })),
      activeLevelId: this.activeLevelId,
      moduleColor: this.moduleColor,
      appearances: Object.fromEntries([...this.library].map(([id, item]) => [id, { ...item.appearance }])),
      walls: cloneWallState(this.walls),
      edges: { ...this.edgeSettings },
      nightLights: this.nightLights.map((light) => cloneNightLight(light)),
      selectedId: this.selected?.userData.instanceId || null,
      instances: [...this.instances.values()].map((root) => ({
        id: root.userData.instanceId,
        libraryId: root.userData.libraryId,
        levelId: root.userData.levelId,
        groupId: root.userData.groupId || null,
        slicePlanes: normalizeSlicePlanes(root.userData.slicePlanes),
        transform: serializeTransform(root),
      })),
    };
  }

  prepareHistoryChange() {
    if (this.restoringHistory || this.historyIndex < 0) return;
    const state = this.captureHistoryState();
    this.history[this.historyIndex] = {
      ...this.history[this.historyIndex],
      state,
      signature: JSON.stringify(state),
    };
  }

  recordHistory(label) {
    if (this.restoringHistory) return;
    const state = this.captureHistoryState();
    const signature = JSON.stringify(state);
    if (this.history[this.historyIndex]?.signature === signature) {
      this.emitHistory();
      return;
    }
    this.history.splice(this.historyIndex + 1);
    this.history.push({ label, state, signature });
    if (this.history.length > this.historyLimit) this.history.shift();
    this.historyIndex = this.history.length - 1;
    this.emitHistory();
  }

  resetHistory() {
    const state = this.captureHistoryState();
    this.history = [{ label: 'Initial state', state, signature: JSON.stringify(state) }];
    this.historyIndex = 0;
    this.emitHistory();
  }

  emitHistory() {
    this.callbacks.onHistory?.({
      canUndo: this.historyIndex > 0,
      canRedo: this.historyIndex >= 0 && this.historyIndex < this.history.length - 1,
    });
  }

  restoreHistoryState(state) {
    this.restoringHistory = true;
    this.clearAssembly({ recordHistory: false });
    this.setLevels(state.levels, state.activeLevelId, true, false);
    this.setWallState(state.walls || { enabled: false, thickness: 0.4, openSides: [] }, false);
    this.setEdgeSettings({ enabled: false, thickness: 4, color: '#ffffff', verticalLines: true, ...(state.edges || {}) }, false);
    this.setNightLights(state.nightLights || []);
    Object.entries(state.appearances || {}).forEach(([id, appearance]) => this.updateLibraryAppearance(id, appearance, false));
    this.setAllModuleColor(state.moduleColor || Object.values(state.appearances || {})[0]?.color || '#f2d336', false);
    state.instances.forEach((instance) => {
      this.addInstance(instance.libraryId, instance.transform, {
        instanceId: instance.id,
        levelId: instance.levelId,
        groupId: instance.groupId,
        slicePlanes: instance.slicePlanes,
        recordHistory: false,
      });
    });
    this.select(state.selectedId ? this.instances.get(state.selectedId) || null : null);
    this.activeLevelId = state.activeLevelId;
    this.callbacks.onLevels?.({ levels: this.levels.map((level) => ({ ...level })), activeLevelId: this.activeLevelId });
    this.emitStats();
    this.restoringHistory = false;
    this.emitHistory();
  }

  undo() {
    if (this.historyIndex <= 0) return;
    const action = this.history[this.historyIndex].label;
    this.historyIndex -= 1;
    this.restoreHistoryState(this.history[this.historyIndex].state);
    this.callbacks.onStatus?.(`Undid: ${action}.`);
  }

  redo() {
    if (this.historyIndex >= this.history.length - 1) return;
    this.historyIndex += 1;
    const entry = this.history[this.historyIndex];
    this.restoreHistoryState(entry.state);
    this.callbacks.onStatus?.(`Redid: ${entry.label}.`);
  }

  refreshConnectorMarkers() {
    this.connectorGroup.clear();
    this.visibleConnectorIndices = [];
    if (!this.selected) return;
    const item = effectiveSnapItem(this.selected, this.library.get(this.selected.userData.libraryId));
    if (!item) return;
    this.selected.updateMatrixWorld(true);
    const markerStep = Math.max(1, Math.ceil(item.connectors.length / 96));
    item.connectors.forEach((connector, index) => {
      if (index % markerStep !== 0) return;
      const marker = new THREE.Mesh(this.connectorGeometry, this.connectorMaterial);
      marker.position.copy(this.selected.localToWorld(connector.position.clone()));
      marker.renderOrder = 20;
      this.connectorGroup.add(marker);
      this.visibleConnectorIndices.push(index);
    });
  }

  updateConnectorMarkers() {
    if (!this.selected || !this.connectorGroup.children.length) return;
    const item = effectiveSnapItem(this.selected, this.library.get(this.selected.userData.libraryId));
    if (!item) return;
    this.selected.updateMatrixWorld(true);
    this.visibleConnectorIndices.forEach((connectorIndex, markerIndex) => {
      const connector = item.connectors[connectorIndex];
      this.connectorGroup.children[markerIndex]?.position.copy(this.selected.localToWorld(connector.position.clone()));
    });
  }

  emitSelection() {
    if (!this.selected) { this.callbacks.onSelection?.(null); return; }
    this.callbacks.onSelection?.({
      id: this.selected.userData.instanceId,
      name: this.selectedRoots.length > 1 ? `${this.selectedRoots.length} modules selected` : this.selected.name,
      selectionCount: this.selectedRoots.length,
      grouped: this.selectedRoots.length > 1 && !!this.selected.userData.groupId
        && this.selectedRoots.every((root) => root.userData.groupId === this.selected.userData.groupId),
      levelId: this.selected.userData.levelId,
      transform: serializeTransform(this.selected),
    });
  }

  emitStats() {
    let triangles = 0;
    this.instances.forEach((root) => { triangles += this.library.get(root.userData.libraryId)?.triangles || 0; });
    this.callbacks.onStats?.({ modules: this.instances.size, triangles });
  }

  completeModelBounds() {
    const bounds = new THREE.Box3().setFromObject(this.assembly);
    if (this.wallGroup.visible) bounds.expandByObject(this.wallGroup);
    return bounds;
  }

  visibleModuleBounds() {
    const bounds = new THREE.Box3();
    this.instances.forEach((root) => {
      if (root.visible) bounds.expandByObject(root);
    });
    return bounds;
  }

  centerModelOnStage() {
    if (!this.instances.size) return;
    this.syncWalls(true);
    const bounds = this.completeModelBounds();
    if (bounds.isEmpty()) return;
    const center = bounds.getCenter(new THREE.Vector3());
    const deltaX = -center.x;
    const deltaZ = -center.z;
    if (Math.abs(deltaX) < 1e-6 && Math.abs(deltaZ) < 1e-6) {
      this.callbacks.onStatus?.('The complete model is already centered on the stage.');
      return;
    }

    this.prepareHistoryChange();
    this.instances.forEach((root) => {
      root.position.x += deltaX;
      root.position.z += deltaZ;
      root.updateMatrixWorld(true);
    });
    this.wallSignature = '';
    this.syncWalls(true);
    this.updateTransformTarget();
    this.refreshConnectorMarkers();
    this.refreshSelectionHighlights();
    this.emitSelection();
    this.emitStats();
    this.recordHistory('Center model on stage');
    this.callbacks.onStatus?.('Complete model moved to the center of the stage.');
  }

  focusAll() {
    if (!this.instances.size) return;
    if (this.walk.enabled) this.setWalkEnabled(false);
    if (this.mainView === 'top' || this.mainView === 'front') {
      const bounds = this.visibleModuleBounds();
      if (bounds.isEmpty()) return;
      fitOrthographicCamera(
        this.cameraForView(this.mainView),
        bounds,
        this.container,
        this.mainView,
        1.18,
      );
      this.callbacks.onStatus?.(`Muqarnas modules centered in ${viewDisplayName(this.mainView).toLowerCase()}.`);
      return;
    }
    this.syncWalls(true);
    const bounds = this.completeModelBounds();
    const sphere = bounds.getBoundingSphere(new THREE.Sphere());
    const direction = new THREE.Vector3(1, 0.75, 1).normalize();
    this.camera.up.set(0, 1, 0);
    this.orbit.target.copy(sphere.center);
    this.camera.position.copy(sphere.center).addScaledVector(direction, Math.max(sphere.radius * 3, 4));
    this.camera.near = Math.max(0.001, sphere.radius / 100);
    this.camera.far = Math.max(200, sphere.radius * 20);
    this.camera.updateProjectionMatrix();
    this.orbit.update();
    this.callbacks.onStatus?.('Complete model centered in the stage.');
  }

  setWalkEnabled(enabled) {
    const next = enabled === true;
    if (next === this.walk.enabled) return;
    if (next) {
      this.setView('perspective');
      this.walk.returnState = {
        position: this.camera.position.clone(),
        quaternion: this.camera.quaternion.clone(),
        target: this.orbit.target.clone(),
      };
      const bounds = this.instances.size ? this.completeModelBounds() : new THREE.Box3(new THREE.Vector3(-2, 0, -2), new THREE.Vector3(2, 4, 2));
      const center = bounds.getCenter(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3());
      this.camera.position.set(
        THREE.MathUtils.clamp(center.x, -GROUND_HALF_SIZE + 0.2, GROUND_HALF_SIZE - 0.2),
        this.walk.eyeLevel,
        THREE.MathUtils.clamp(bounds.max.z + Math.max(1.2, size.z * 0.18), -GROUND_HALF_SIZE + 0.2, GROUND_HALF_SIZE - 0.2),
      );
      const direction = new THREE.Vector3(center.x, this.walk.eyeLevel, center.z).sub(this.camera.position).normalize();
      this.walk.yaw = Math.atan2(-direction.x, -direction.z);
      this.walk.pitch = 0;
      this.walk.enabled = true;
      this.walk.lastTime = performance.now();
      this.orbit.enabled = false;
      this.transform.detach();
      this.select(null);
      this.renderer.domElement.style.cursor = 'crosshair';
      this.updateWalkOrientation();
      this.callbacks.onStatus?.('Walk view enabled. Click and drag to look around; the camera stays locked to the ground at the selected eye level.');
    } else {
      this.walk.enabled = false;
      this.walk.keys.clear();
      this.walk.lookDrag = null;
      const saved = this.walk.returnState;
      if (saved) {
        this.camera.position.copy(saved.position);
        this.camera.quaternion.copy(saved.quaternion);
        this.orbit.target.copy(saved.target);
      }
      this.camera.up.set(0, 1, 0);
      this.orbit.enabled = this.mainView === 'perspective';
      this.orbit.update();
      this.renderer.domElement.style.cursor = '';
      this.callbacks.onStatus?.('Walk view closed. Orbit camera restored.');
    }
    this.callbacks.onWalk?.({ enabled: this.walk.enabled, eyeLevel: this.walk.eyeLevel });
  }

  setWalkEyeLevel(height) {
    this.walk.eyeLevel = THREE.MathUtils.clamp(Number(height) || 1.65, 0.35, 8);
    if (this.walk.enabled) {
      this.camera.position.y = this.walk.eyeLevel;
      this.updateWalkOrientation();
    }
    this.callbacks.onWalk?.({ enabled: this.walk.enabled, eyeLevel: this.walk.eyeLevel });
  }

  updateWalkOrientation() {
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.set(this.walk.pitch, this.walk.yaw, 0);
    this.camera.up.set(0, 1, 0);
    const direction = new THREE.Vector3();
    this.camera.getWorldDirection(direction);
    this.orbit.target.copy(this.camera.position).addScaledVector(direction, 5);
  }

  lockWalkCameraToGround() {
    this.camera.position.x = THREE.MathUtils.clamp(this.camera.position.x, -GROUND_HALF_SIZE + 0.1, GROUND_HALF_SIZE - 0.1);
    this.camera.position.y = this.walk.eyeLevel;
    this.camera.position.z = THREE.MathUtils.clamp(this.camera.position.z, -GROUND_HALF_SIZE + 0.1, GROUND_HALF_SIZE - 0.1);
  }

  updateWalkCamera(time) {
    if (!this.walk.enabled) return;
    this.lockWalkCameraToGround();
    const delta = Math.min(0.05, Math.max(0, (time - this.walk.lastTime) / 1000));
    this.walk.lastTime = time;
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() < 1e-8) forward.set(0, 0, -1);
    else forward.normalize();
    const right = forward.clone().cross(new THREE.Vector3(0, 1, 0)).normalize();
    const movement = new THREE.Vector3();
    if (this.walk.keys.has('w')) movement.add(forward);
    if (this.walk.keys.has('s')) movement.sub(forward);
    if (this.walk.keys.has('d')) movement.add(right);
    if (this.walk.keys.has('a')) movement.sub(right);
    if (movement.lengthSq() > 0) {
      const speed = this.walk.keys.has('shift') ? 4.5 : 2;
      movement.normalize().multiplyScalar(speed * delta);
      this.camera.position.add(movement);
      this.lockWalkCameraToGround();
    }
    this.updateWalkOrientation();
  }

  setView(view) {
    if (this.assemblyAnimation) return;
    if (this.walk.enabled && view !== 'perspective') this.setWalkEnabled(false);
    if (view === this.mainView) return;
    const slot = Object.keys(this.miniViewAssignments).find((key) => this.miniViewAssignments[key] === view);
    if (slot) {
      this.swapMiniView(slot);
      return;
    }
    const bounds = this.instances.size ? this.completeModelBounds() : new THREE.Box3(new THREE.Vector3(-2, 0, -2), new THREE.Vector3(2, 4, 2));
    const sphere = bounds.getBoundingSphere(new THREE.Sphere());
    const distance = Math.max(sphere.radius * 3, 5);
    this.orbit.target.copy(sphere.center);
    this.camera.up.set(0, 1, 0);
    const polarAngle = view === 'top' ? this.orbit.minPolarAngle : this.orbit.maxPolarAngle;
    this.camera.position.copy(sphere.center).add(new THREE.Vector3(
      0,
      Math.cos(polarAngle) * distance,
      Math.sin(polarAngle) * distance,
    ));
    this.orbit.update();
  }

  cameraForView(view) {
    if (view === 'front') return this.frontCamera || this.camera;
    if (view === 'top') return this.topCamera || this.camera;
    return this.camera;
  }

  emitViewLayout() {
    this.callbacks.onViewLayout?.({
      main: this.mainView,
      front: this.miniViewAssignments.front,
      top: this.miniViewAssignments.top,
    });
  }

  swapMiniView(slot) {
    if (this.assemblyAnimation) return;
    if (!['front', 'top'].includes(slot)) return;
    if (this.walk.enabled) this.setWalkEnabled(false);
    const promotedView = this.miniViewAssignments[slot];
    if (!promotedView) return;
    const previousMainView = this.mainView;
    this.mainView = promotedView;
    this.miniViewAssignments[slot] = previousMainView;
    if (this.mainView === 'front' || this.mainView === 'top') {
      const editableRoots = new Set(this.editableRootsForView(this.mainView));
      const selectedRoots = this.selectedRoots.filter((root) => editableRoots.has(root));
      this.selectRoots(selectedRoots, selectedRoots.includes(this.selected) ? this.selected : selectedRoots[0] || null, true);
    }
    this.orbit.enabled = this.mainView === 'perspective';
    this.transform.camera = this.cameraForView(this.mainView);
    this.updateTransformTarget();
    this.resize();
    this.emitViewLayout();
    this.callbacks.onStatus?.(`${viewDisplayName(promotedView)} promoted to the main stage. ${viewDisplayName(previousMainView)} moved to the small viewport.`);
  }

  attachOverviewView(container, initialView = 'top') {
    this.overviewContainer = container;
    this.overviewRenderer = createMiniRenderer(container);
    this.overviewCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 300);
    this.overviewView = initialView === 'front' ? 'front' : 'top';
    this.frontCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 300);
    this.frontCamera.layers.enable(2);
    this.topCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 300);
    this.topCamera.up.set(0, 0, -1);
  }

  setOverviewView(view) {
    if (!['front', 'top'].includes(view)) return;
    this.overviewView = view;
  }

  attachMiniViews(frontContainer, topContainer) {
    this.frontContainer = frontContainer;
    this.topContainer = topContainer;
    this.frontRenderer = createMiniRenderer(frontContainer);
    this.topRenderer = createMiniRenderer(topContainer);
    this.frontCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 300);
    this.frontCamera.layers.enable(2);
    this.topCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 300);
    this.topCamera.up.set(0, 0, -1);
    this.onFrontMiniPointerDown = (event) => this.startMiniDrag(event, 'front');
    this.onTopMiniPointerDown = (event) => this.startMiniDrag(event, 'top');
    this.frontRenderer.domElement.addEventListener('pointerdown', this.onFrontMiniPointerDown);
    this.topRenderer.domElement.addEventListener('pointerdown', this.onTopMiniPointerDown);
    this.emitViewLayout();
  }

  setPointerFromMiniEvent(event, renderer, camera) {
    const bounds = renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - bounds.left) / Math.max(1, bounds.width)) * 2 - 1,
      -((event.clientY - bounds.top) / Math.max(1, bounds.height)) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, camera);
  }

  startMiniDrag(event, slot) {
    if (event.button !== 0) return;
    const view = this.miniViewAssignments[slot];
    const renderer = slot === 'top' ? this.topRenderer : this.frontRenderer;
    const camera = this.cameraForView(view);
    if (!renderer || !camera) return;
    if (view === 'perspective') {
      this.swapMiniView(slot);
      event.preventDefault();
      return;
    }
    this.setPointerFromMiniEvent(event, renderer, camera);
    const selectableRoots = this.editableRootsForView(view);
    const hit = this.raycaster.intersectObjects(selectableRoots, true)[0];
    const root = hit ? this.findInstanceRoot(hit.object) : null;
    if (!root) {
      this.swapMiniView(slot);
      event.preventDefault();
      return;
    }
    const plane = view === 'top'
      ? new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.levelHeight(root.userData.levelId))
      : new THREE.Plane(new THREE.Vector3(0, 0, 1), -root.position.z);
    const point = this.raycaster.ray.intersectPlane(plane, new THREE.Vector3());
    if (!point) return;
    if (view === 'top' || view === 'front') {
      const activeTierSelection = root.userData.groupId
        ? [...this.instances.values()].filter((candidate) => (
          candidate.visible && candidate.userData.groupId === root.userData.groupId
        ))
        : [root];
      this.selectRoots(activeTierSelection, root, false);
    }
    this.prepareHistoryChange();
    this.miniDrag = {
      root,
      slot,
      view,
      renderer,
      camera,
      plane,
      offsetX: root.position.x - point.x,
      offsetZ: root.position.z - point.z,
      positions: new Map(this.selectedRoots.map((selectedRoot) => [selectedRoot, selectedRoot.position.clone()])),
      moved: false,
    };
    renderer.domElement.style.cursor = 'grabbing';
    event.preventDefault();
    event.stopPropagation();
  }

  updateMiniDrag(event) {
    const drag = this.miniDrag;
    if (!drag) return;
    this.setPointerFromMiniEvent(event, drag.renderer, drag.camera);
    const point = this.raycaster.ray.intersectPlane(drag.plane, new THREE.Vector3());
    if (!point) return;
    let x = point.x + drag.offsetX;
    let z = drag.view === 'top' ? point.z + drag.offsetZ : drag.root.position.z;
    if (this.snap.enabled && this.snap.gridSize > 0) {
      x = Math.round(x / this.snap.gridSize) * this.snap.gridSize;
      z = Math.round(z / this.snap.gridSize) * this.snap.gridSize;
    }
    const rootStart = drag.positions.get(drag.root);
    const deltaX = x - rootStart.x;
    const deltaZ = z - rootStart.z;
    drag.moved ||= Math.abs(deltaX) > 1e-6 || Math.abs(deltaZ) > 1e-6;
    drag.positions.forEach((position, root) => {
      root.position.x = position.x + deltaX;
      root.position.z = position.z + deltaZ;
      this.placeRootOnTier(root);
    });
    this.constrainRootsToGround(this.selectedRoots);
    this.updateConnectorMarkers();
    this.refreshSelectionHighlights();
    this.emitSelection();
    event.preventDefault();
  }

  finishMiniDrag() {
    const drag = this.miniDrag;
    if (!drag) return;
    drag.renderer.domElement.style.cursor = '';
    this.miniDrag = null;
    this.selected = drag.root;
    if (!drag.moved) {
      this.swapMiniView(drag.slot);
      return;
    }
    if (drag.moved && this.snap.enabled) this.snapSelectedToConnector();
    this.lockSelectedToLevel();
    const movingSet = new Set(this.selectedRoots);
    const overlapPrevented = this.snap.enabled && this.selectedRoots.some((root) => this.rootOverlapsAnother(root, movingSet));
    if (overlapPrevented) {
      drag.positions.forEach((position, root) => {
        root.position.copy(position);
        this.placeRootOnTier(root);
      });
    }
    this.emitSelection();
    this.emitStats();
    this.recordHistory(drag.view === 'top' ? 'Move module in top view' : 'Move module in front view');
    if (drag.moved) {
      const viewLabel = drag.view === 'top' ? 'Top' : 'Front';
      this.callbacks.onStatus?.(overlapPrevented
        ? `${drag.root.name} returned to its previous position because modules cannot overlap.`
        : `${drag.root.name} moved in ${viewLabel} view on ${this.levels.find((level) => level.id === drag.root.userData.levelId)?.name}.`);
    }
  }

  rebuildLevelGuides() {
    this.frontGuideGroup.children.forEach((child) => { child.geometry?.dispose?.(); child.material?.dispose?.(); });
    this.frontGuideGroup.clear();
    this.frontLevelMaterials.forEach((material) => material.dispose());
    this.frontLevelMaterials.clear();
    this.levels.forEach((level) => {
      this.frontLevelMaterials.set(level.id, new THREE.MeshBasicMaterial({
        color: 0xe87522,
        side: THREE.DoubleSide,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }));
      const geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-50, level.height, 0),
        new THREE.Vector3(50, level.height, 0),
      ]);
      const line = new THREE.Line(geometry, new THREE.LineDashedMaterial({
        color: 0x111111,
        dashSize: 0.18,
        gapSize: 0.1,
        transparent: true,
        opacity: 0.9,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }));
      line.computeLineDistances();
      line.layers.set(2);
      line.renderOrder = 30;
      line.userData.levelGuide = true;
      this.frontGuideGroup.add(line);
    });
  }

  syncTopFootprintOutlines() {
    const liveRoots = new Set(this.instances.values());
    this.topOutlineInstances.forEach((line, root) => {
      if (liveRoots.has(root)) return;
      this.topOutlineGroup.remove(line);
      this.topOutlineInstances.delete(root);
    });
    this.instances.forEach((root) => {
      let line = this.topOutlineInstances.get(root);
      if (!line) {
        const item = this.library.get(root.userData.libraryId);
        const outlineGeometry = root.userData.sliceFootprintOutlineGeometry || item?.footprintOutlineGeometry;
        if (!outlineGeometry) return;
        line = new THREE.LineSegments(outlineGeometry, this.topOutlineMaterial);
        line.matrixAutoUpdate = false;
        line.frustumCulled = false;
        line.renderOrder = 60;
        this.topOutlineInstances.set(root, line);
        this.topOutlineGroup.add(line);
      }
      root.updateMatrixWorld(true);
      line.matrix.copy(root.matrixWorld);
      line.matrixWorldNeedsUpdate = true;
      line.visible = root.visible;
    });
  }

  syncFrontGeometryOutlines() {
    const liveRoots = new Set(this.instances.values());
    this.frontOutlineInstances.forEach((group, root) => {
      if (liveRoots.has(root)) return;
      group.children.forEach((line) => line.geometry?.dispose?.());
      this.frontOutlineGroup.remove(group);
      this.frontOutlineInstances.delete(root);
    });
    this.instances.forEach((root) => {
      let group = this.frontOutlineInstances.get(root);
      if (!group) {
        group = new THREE.Group();
        root.updateMatrixWorld(true);
        root.traverse((child) => {
          if (!child.isMesh || child.userData.isEdgeOverlay || !child.geometry?.attributes?.position) return;
          const geometry = new THREE.EdgesGeometry(child.geometry, 28);
          if (!geometry.attributes.position?.count) {
            geometry.dispose();
            return;
          }
          const line = new THREE.LineSegments(geometry, this.frontOutlineMaterial);
          line.matrixAutoUpdate = false;
          line.frustumCulled = false;
          line.renderOrder = 61;
          line.userData.sourceMesh = child;
          group.add(line);
        });
        this.frontOutlineInstances.set(root, group);
        this.frontOutlineGroup.add(group);
      }
      root.updateMatrixWorld(true);
      group.children.forEach((line) => {
        line.matrix.copy(line.userData.sourceMesh.matrixWorld);
        line.matrixWorldNeedsUpdate = true;
      });
      group.visible = root.visible;
    });
  }

  syncMiniWallOutlines() {
    const signature = `${this.wallSignature}:${this.wallGroup.visible}`;
    if (signature === this.miniWallOutlineSignature) return;
    this.miniWallOutlineSignature = signature;
    this.miniWallOutlineGroup.children.forEach((line) => line.geometry?.dispose?.());
    this.miniWallOutlineGroup.clear();
    if (!this.wallGroup.visible) return;
    this.wallGroup.updateMatrixWorld(true);
    const southOpeningSegments = [];
    this.wallGroup.traverse((child) => {
      if (!child.isMesh || child.userData.isEdgeOverlay || !objectVisibleWithin(child, this.wallGroup)) return;
      if (child.userData.isSouthOpeningSegment) {
        southOpeningSegments.push(child);
        return;
      }
      const geometry = new THREE.EdgesGeometry(child.geometry, 28);
      if (!geometry.getAttribute('position')?.count) {
        geometry.dispose();
        return;
      }
      const line = new THREE.LineSegments(geometry, this.miniWallOutlineMaterial);
      line.name = `${child.name || 'Wall'} mini hidden outline`;
      line.matrixAutoUpdate = false;
      line.matrix.copy(child.matrixWorld);
      line.renderOrder = 20;
      line.frustumCulled = false;
      this.miniWallOutlineGroup.add(line);
    });
    const southBoundaryPositions = mergedBoundaryEdgePositions(southOpeningSegments);
    if (southBoundaryPositions.length) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(southBoundaryPositions, 3));
      const line = new THREE.LineSegments(geometry, this.miniWallOutlineMaterial);
      line.name = 'South wall mini clean opening outline';
      line.renderOrder = 20;
      line.frustumCulled = false;
      this.miniWallOutlineGroup.add(line);
    }
  }

  renderMiniViews() {
    if (this.overviewRenderer && this.overviewContainer && this.overviewCamera) {
      resizeMiniRenderer(this.overviewRenderer, this.overviewContainer);
      const fallbackBounds = new THREE.Box3(
        new THREE.Vector3(-0.6, 0, -0.6),
        new THREE.Vector3(0.6, Math.max(0.6, ...this.levels.map((level) => level.height + 0.3)), 0.6),
      );
      const moduleBounds = this.instances.size ? this.visibleModuleBounds() : fallbackBounds.clone();
      if (moduleBounds.isEmpty()) moduleBounds.copy(fallbackBounds);
      const completeBounds = this.instances.size ? this.completeModelBounds() : fallbackBounds.clone();
      if (completeBounds.isEmpty()) completeBounds.copy(fallbackBounds);
      const boundsCenter = completeBounds.getCenter(new THREE.Vector3());
      this.levels.forEach((level) => completeBounds.expandByPoint(new THREE.Vector3(boundsCenter.x, level.height, boundsCenter.z)));

      const mainCamera = this.cameraForView(this.mainView);
      if (this.mainView === 'perspective') {
        mainCamera.aspect = Math.max(0.2, this.container.clientWidth / Math.max(1, this.container.clientHeight));
        mainCamera.updateProjectionMatrix();
      } else if (!this.freeDrag && !this.transform.dragging && !this.assemblyAnimation) {
        fitOrthographicCamera(mainCamera, completeBounds, this.container, this.mainView, 1.28);
      }
      fitOrthographicCamera(this.overviewCamera, completeBounds, this.overviewContainer, this.overviewView, 1.16);
      this.renderSceneView(this.renderer, mainCamera, this.mainView, true);
      this.renderSceneView(this.overviewRenderer, this.overviewCamera, this.overviewView, false);
      return;
    }
    if (!this.frontRenderer || !this.topRenderer) {
      setLineMaterialResolution(this.edgeMaterial, this.renderer);
      this.renderer.render(this.scene, this.cameraForView(this.mainView));
      return;
    }
    resizeMiniRenderer(this.frontRenderer, this.frontContainer);
    resizeMiniRenderer(this.topRenderer, this.topContainer);
    const fallbackBounds = new THREE.Box3(
      new THREE.Vector3(-0.6, 0, -0.6),
      new THREE.Vector3(0.6, Math.max(0.6, ...this.levels.map((level) => level.height + 0.3)), 0.6),
    );
    const moduleBounds = this.instances.size ? this.visibleModuleBounds() : fallbackBounds.clone();
    if (moduleBounds.isEmpty()) moduleBounds.copy(fallbackBounds);
    const completeBounds = this.instances.size
      ? this.completeModelBounds()
      : fallbackBounds.clone();
    if (this.wallGroup.visible && this.pointedArchMesh.visible) {
      this.archPointMeshes.forEach((point) => completeBounds.expandByPoint(point.position));
    }
    const boundsCenter = completeBounds.getCenter(new THREE.Vector3());
    this.levels.forEach((level) => {
      completeBounds.expandByPoint(new THREE.Vector3(boundsCenter.x, level.height, boundsCenter.z));
    });
    const locations = [
      { view: this.mainView, renderer: this.renderer, container: this.container, isMain: true },
      { view: this.miniViewAssignments.front, renderer: this.frontRenderer, container: this.frontContainer, isMain: false },
      { view: this.miniViewAssignments.top, renderer: this.topRenderer, container: this.topContainer, isMain: false },
    ];
    const isManipulating = !!this.miniDrag || !!this.freeDrag || this.transform.dragging || !!this.assemblyAnimation;
    locations.forEach(({ view, container, isMain }) => {
      const camera = this.cameraForView(view);
      if (view === 'perspective') {
        camera.aspect = Math.max(0.2, container.clientWidth / Math.max(1, container.clientHeight));
        camera.updateProjectionMatrix();
      } else if (!isManipulating) {
        fitOrthographicCamera(
          camera,
          isMain ? completeBounds : moduleBounds,
          container,
          view,
          isMain ? 1.28 : 1.08,
        );
      }
    });

    locations.forEach(({ view, renderer, isMain }) => {
      this.renderSceneView(renderer, this.cameraForView(view), view, isMain);
    });
  }

  renderSceneView(renderer, camera, view, isMain) {
    const helperState = {
      transform: this.transformHelper.visible,
      selection: this.selectionBox.visible,
      connectors: this.connectorGroup.visible,
      archPoints: this.archPointGroup.visible,
      walls: this.wallGroup.visible,
      archModuleInfill: this.archModuleInfillGroup.visible,
      miniWallOutlines: this.miniWallOutlineGroup.visible,
      sliceGuides: this.sliceGuideGroup.visible,
    };
    const nightGuideState = [];
    this.nightLightGroup.traverse((child) => {
      if (!child.userData.isNightLightGuide) return;
      nightGuideState.push([child, child.visible]);
      child.visible = isMain && this.nightLightGuidesVisible;
    });
    const showMiniWallOutlines = !isMain && (view === 'front' || view === 'top') && this.wallGroup.visible;
    if (showMiniWallOutlines) {
      this.syncMiniWallOutlines();
      this.wallGroup.visible = false;
      this.miniWallOutlineGroup.visible = true;
    } else {
      this.miniWallOutlineGroup.visible = false;
    }
    this.archPointGroup.visible = !isMain && view === 'front' && this.wallGroup.visible && this.pointedArchMesh.visible;
    if (!isMain) {
      this.transformHelper.visible = false;
      this.selectionBox.visible = false;
      this.connectorGroup.visible = false;
    }
    this.sliceGuideGroup.visible = isMain && view === 'top' && helperState.sliceGuides;
    if (view === 'front' && !isMain) camera.layers.enable(2);
    else camera.layers.disable(2);

    const swaps = [];
    const hideOrthographicModuleEdges = !isMain && (view === 'top' || view === 'front');
    if (hideOrthographicModuleEdges) {
      this.instances.forEach((root) => root.traverse((child) => {
        if (!child.userData.isEdgeOverlay) return;
        swaps.push([child, child.material, child.visible, child.renderOrder]);
        child.visible = false;
      }));
    }
    if (view === 'front') {
      if (!isMain) this.syncFrontGeometryOutlines();
      this.frontOutlineGroup.visible = !isMain;
      if (!isMain) {
        this.instances.forEach((root) => {
          const levelMaterial = this.frontLevelMaterials.get(root.userData.levelId) || this.frontLevelMaterials.values().next().value;
          root.traverse((child) => {
            if (!child.isMesh || child.userData.isEdgeOverlay) return;
            swaps.push([child, child.material, child.visible, child.renderOrder]);
            child.visible = root.visible;
            if (!root.visible) return;
            child.material = levelMaterial;
            child.renderOrder = 60 + Math.max(0, this.levels.findIndex((level) => level.id === root.userData.levelId));
          });
        });
      }
    } else if (view === 'top') {
      this.topOutlineGroup.visible = !isMain;
      if (!isMain) {
        this.syncTopFootprintOutlines();
        let activeIndex = 0;
        this.instances.forEach((root) => {
          const isActiveTier = root.userData.levelId === this.activeLevelId;
          const activeMaterial = this.topTierMaterials[activeIndex % this.topTierMaterials.length];
          if (isActiveTier) activeIndex += 1;
          root.traverse((child) => {
            if (!child.isMesh) return;
            if (child.userData.isEdgeOverlay) {
              if (!hideOrthographicModuleEdges) {
                swaps.push([child, child.material, child.visible, child.renderOrder]);
                child.visible = isActiveTier;
              }
              return;
            }
            swaps.push([child, child.material, child.visible, child.renderOrder]);
            child.visible = root.visible;
            if (!root.visible) return;
            child.material = activeMaterial;
            child.renderOrder = 60 + Math.max(0, this.levels.findIndex((level) => level.id === root.userData.levelId));
          });
        });
      }
    }

    setLineMaterialResolution(this.edgeMaterial, renderer);
    setLineMaterialResolution(this.wallEdgeMaterial, renderer);
    renderer.render(this.scene, camera);
    swaps.forEach(([mesh, material, visible, renderOrder]) => {
      mesh.material = material;
      mesh.visible = visible;
      mesh.renderOrder = renderOrder;
    });
    this.topOutlineGroup.visible = false;
    this.frontOutlineGroup.visible = false;
    this.transformHelper.visible = helperState.transform;
    this.selectionBox.visible = helperState.selection;
    this.connectorGroup.visible = helperState.connectors;
    this.archPointGroup.visible = helperState.archPoints;
    this.wallGroup.visible = helperState.walls;
    this.archModuleInfillGroup.visible = helperState.archModuleInfill;
    this.miniWallOutlineGroup.visible = helperState.miniWallOutlines;
    this.sliceGuideGroup.visible = helperState.sliceGuides;
    nightGuideState.forEach(([child, visible]) => { child.visible = visible; });
  }

  serializeProject() {
    const libraries = [...this.library.values()].filter((item) => !item.builtIn).map((item) => ({ id: item.id, name: item.name, ext: item.ext, dataUrl: item.dataUrl, normalize: false, zUp: false, uniformHeight: STANDARD_MODULE_HEIGHT }));
    const instances = [...this.instances.values()].map((root) => ({
      id: root.userData.instanceId,
      libraryId: root.userData.libraryId,
      levelId: root.userData.levelId,
      groupId: root.userData.groupId || null,
      slicePlanes: normalizeSlicePlanes(root.userData.slicePlanes),
      transform: serializeTransform(root),
    }));
    const appearances = Object.fromEntries([...this.library].map(([id, item]) => [id, { ...item.appearance }]));
    return { version: 10, app: 'muqarnas', units: 'm', coordinateSystem: 'right-handed-y-up', anchor: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }, levels: this.levels, activeLevelId: this.activeLevelId, moduleColor: this.moduleColor, walls: cloneWallState(this.walls), edges: { ...this.edgeSettings }, nightLights: this.nightLights.map((light) => cloneNightLight(light)), appearances, libraries, instances };
  }

  saveProject() {
    downloadBlob(new Blob([JSON.stringify(this.serializeProject(), null, 2)], { type: 'application/json' }), `muqarnas-project-${dateStamp()}.muqarnas.json`);
    this.callbacks.onStatus?.('Project saved with its uploaded module sources.');
  }

  async loadProject(project) {
    if (project?.app !== 'muqarnas' || !Array.isArray(project.instances)) throw new Error('This is not a valid Muqarnas project.');
    const savedWalls = project.walls && typeof project.walls === 'object' ? project.walls : {};
    const savedBrickPattern = savedWalls.brickPattern && typeof savedWalls.brickPattern === 'object'
      ? savedWalls.brickPattern
      : null;
    const readableBond = isReadableWallBondPattern(savedBrickPattern?.bondPattern);
    const loadedBrickPattern = readableBond
      ? { ...savedBrickPattern, enabled: true }
      : { ...DEFAULT_WALL_BRICK_PATTERN, enabled: true, bondPattern: DEFAULT_WALL_BRICK_PATTERN.bondPattern };
    const loadedWalls = {
      ...savedWalls,
      // Opening a project is different from starting a blank design: its frame
      // must always be restored visibly, including projects saved by old builds.
      enabled: true,
      // A malformed legacy wall record sometimes contains every side in the
      // open list. A fallback must restore a visible closed frame.
      openSides: readableBond ? savedWalls.openSides : [],
      brickPattern: loadedBrickPattern,
    };
    this.lastProjectLoadNotice = readableBond
      ? ''
      : 'The saved brick bond was missing or unreadable, so Normal Running Bond was restored.';
    this.clearAssembly({ recordHistory: false });
    this.setLevels(project.levels?.length ? project.levels : DEFAULT_LEVELS, project.activeLevelId, true, false);
    this.setWallState(loadedWalls, false);
    this.setEdgeSettings({ enabled: false, thickness: 4, color: '#ffffff', verticalLines: true, ...(project.edges || {}) }, false);
    this.setNightLights(project.nightLights || []);
    this.setNightLightGuidesVisible(false);
    for (const item of [...this.library.values()]) if (!item.builtIn) this.library.delete(item.id);
    for (const saved of project.libraries || []) {
      const buffer = dataUrlToArrayBuffer(saved.dataUrl);
      const source = await parseModel(buffer, saved.ext);
      const item = this.createLibraryItem({ ...saved, source, builtIn: false, normalize: false, zUp: false, uniformHeight: STANDARD_MODULE_HEIGHT });
      this.library.set(item.id, item);
    }
    Object.entries(project.appearances || {}).forEach(([id, appearance]) => this.updateLibraryAppearance(id, appearance, false));
    this.setAllModuleColor(project.moduleColor || Object.values(project.appearances || {})[0]?.color || '#f2d336', false);
    for (const instance of project.instances) this.addInstance(instance.libraryId, instance.transform, {
      instanceId: instance.id,
      levelId: instance.levelId,
      groupId: instance.groupId,
      slicePlanes: instance.slicePlanes,
      recordHistory: false,
    });
    // Wall geometry depends on the loaded module footprint. Rebuild it only
    // after every instance exists so old projects cannot remain visually hidden.
    this.setWallState({ ...this.walls, enabled: true }, false);
    // Saved projects may switch between an imported texture bond and a built-in
    // procedural bond. Recreate both wall materials after the final wall state
    // is known so the correct shader path is compiled for the restored bond.
    this.rebuildWallBrickMaterials();
    this.syncWalls(true);
    this.select(null);
    this.focusAll();
    this.emitStats();
    this.resetHistory();
    return [...this.library.values()].map((item) => this.publicLibraryItem(item));
  }

  createExportModelRoot() {
    this.syncWalls(true);
    const root = new THREE.Group();
    root.name = 'Muqarnas model with frame walls';
    root.add(this.assembly.clone(true));
    if (this.wallGroup.visible) root.add(this.wallGroup.clone(true));
    removeEdgeOverlays(root);
    return root;
  }

  async exportGlb() {
    if (!this.instances.size) return;
    this.transform.detach();
    this.selectionBox.visible = false;
    this.connectorGroup.visible = false;
    try {
      const exporter = new GLTFExporter();
      const result = await exporter.parseAsync(this.createExportModelRoot(), { binary: true, onlyVisible: true });
      downloadBlob(new Blob([result], { type: 'model/gltf-binary' }), `muqarnas-assembly-${dateStamp()}.glb`);
      this.callbacks.onStatus?.('Complete assembly exported as GLB.');
    } catch (error) {
      this.callbacks.onStatus?.(error.message || 'GLB export failed.');
    } finally {
      this.selectionBox.visible = false;
      this.connectorGroup.visible = this.connectorsVisible;
      this.updateTransformTarget();
    }
  }

  applyCurrentViewExportStyle(scene, root, disposable) {
    if (this.mainView === 'front') {
      const tierMaterials = new Map();
      this.levels.forEach((level) => {
        const material = new THREE.MeshStandardMaterial({
          color: 0xe87522,
          roughness: 0.72,
          metalness: 0,
          side: THREE.DoubleSide,
        });
        tierMaterials.set(level.id, material);
        disposable.push(material);

        const geometry = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(-GROUND_HALF_SIZE, level.height, GROUND_HALF_SIZE + 0.02),
          new THREE.Vector3(GROUND_HALF_SIZE, level.height, GROUND_HALF_SIZE + 0.02),
        ]);
        const lineMaterial = new THREE.LineDashedMaterial({
          color: 0x111111,
          dashSize: 0.18,
          gapSize: 0.1,
          transparent: true,
          opacity: 0.9,
          depthTest: false,
        });
        const line = new THREE.Line(geometry, lineMaterial);
        line.computeLineDistances();
        line.renderOrder = 30;
        scene.add(line);
        disposable.push(geometry, lineMaterial);
      });
      root.children.forEach((instance) => {
        if (!instance.userData.isModuleRoot) return;
        const material = tierMaterials.get(instance.userData.levelId) || tierMaterials.values().next().value;
        instance.traverse((child) => { if (child.isMesh && !child.userData.isEdgeOverlay && material) child.material = material; });
      });
      return;
    }

    if (this.mainView !== 'top') return;
    root.updateMatrixWorld(true);
    let activeIndex = 0;
    root.children.forEach((instance) => {
      if (!instance.userData.isModuleRoot) return;
      const isActiveTier = instance.userData.levelId === this.activeLevelId;
      if (isActiveTier) {
        const sourceMaterial = this.topTierMaterials[activeIndex % this.topTierMaterials.length];
        activeIndex += 1;
        const material = sourceMaterial.clone();
        disposable.push(material);
        instance.traverse((child) => { if (child.isMesh && !child.userData.isEdgeOverlay) child.material = material; });
        return;
      }

      instance.traverse((child) => { if (child.isMesh) child.visible = false; });
      const item = this.library.get(instance.userData.libraryId);
      if (!item?.footprintOutlineGeometry) return;
      const geometry = item.footprintOutlineGeometry.clone();
      const material = new THREE.LineBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.78, depthTest: false });
      const outline = new THREE.LineSegments(geometry, material);
      outline.matrixAutoUpdate = false;
      outline.matrix.copy(instance.matrixWorld);
      outline.renderOrder = 60;
      scene.add(outline);
      disposable.push(geometry, material);
    });
  }

  ensureExportRenderer() {
    if (!this.exportRenderer) {
      this.exportRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
      this.exportRenderer.outputColorSpace = THREE.SRGBColorSpace;
      this.exportRenderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.exportRenderer.toneMappingExposure = 0.8;
      this.exportRenderer.shadowMap.enabled = true;
      this.exportRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
      const environmentScene = new RoomEnvironment();
      const pmremGenerator = new THREE.PMREMGenerator(this.exportRenderer);
      this.exportEnvironment = pmremGenerator.fromScene(environmentScene, 0.04).texture;
      environmentScene.dispose();
      pmremGenerator.dispose();
    }
  }

  createExportRenderScene(settings, width, height) {
    this.syncWalls(true);
    return createExportScene(this.assembly, settings.style, settings.groundColor, settings.shadows !== false, settings.material || 'matte', this.exportEnvironment, settings.noTextures === true, this.wallGroup, settings.wallMaterial || 'matte', settings.seamless === true, settings.seamlessColor, settings.seamlessEdges === true, this.edgeSettings, new THREE.Vector2(width, height), {
      enabled: settings.seamlessWallEdges === true,
      color: settings.wallEdgeColor,
      thickness: settings.wallEdgeThickness,
    }, {
      ...this.walls.northBoundary,
      enabled: settings.seamlessNorthBoundary === true,
    }, this.walls.brickPattern, this.northBrickArchMapping, settings.lighting === 'night', this.nightLights, settings.reflectionStrength);
  }

  renderExportPreview(settings, preview = true, mimeType = 'image/png') {
    if (!this.instances.size) return '';
    const [pageWidth, pageHeight] = exportPagePixels(settings, preview);
    const dimensionedFront = settings.view === 'dimension-front';
    const renderSettings = dimensionedFront
      ? {
        ...settings,
        view: 'front',
        style: 'hidden-line',
        noTextures: true,
        shadows: false,
        seamless: false,
        seamlessEdges: false,
        seamlessWallEdges: false,
        seamlessNorthBoundary: false,
      }
      : settings;
    this.ensureExportRenderer();
    this.exportRenderer.setPixelRatio(1);
    this.exportRenderer.setSize(pageWidth, pageHeight, false);
    this.exportRenderer.toneMappingExposure = renderSettings.lighting === 'night' ? 1 : renderSettings.noTextures ? 0.78 : 0.82;
    this.exportRenderer.shadowMap.enabled = renderSettings.shadows !== false;
    const { scene, root, disposable } = this.createExportRenderScene(renderSettings, pageWidth, pageHeight);
    if (dimensionedFront) {
      scene.background = new THREE.Color(0xffffff);
      scene.environment = null;
      scene.children.forEach((child) => {
        if (child !== root && child.isMesh) child.visible = false;
      });
    }
    if (renderSettings.format !== 'mp4' && renderSettings.view === 'current' && renderSettings.style === 'solid' && renderSettings.seamless !== true) this.applyCurrentViewExportStyle(scene, root, disposable);
    const modelBounds = new THREE.Box3().setFromObject(root);
    const pageBounds = modelBounds.clone();
    pageBounds.expandByPoint(new THREE.Vector3(-GROUND_HALF_SIZE, 0, -GROUND_HALF_SIZE));
    pageBounds.expandByPoint(new THREE.Vector3(GROUND_HALF_SIZE, 0, GROUND_HALF_SIZE));
    const camera = dimensionedFront
      ? createDimensionFrontCamera(modelBounds, pageWidth / pageHeight, renderSettings)
      : renderSettings.format === 'mp4'
      ? createOrbitExportCamera(modelBounds, pageWidth / pageHeight, 0, renderSettings.zoom)
      : renderSettings.view === 'current'
      ? createCurrentExportCamera(
        this.cameraForView(this.mainView),
        pageWidth / pageHeight,
        renderSettings,
        this.mainView === 'perspective' ? this.orbit.target : pageBounds.getCenter(new THREE.Vector3()),
      )
      : createExportCamera(pageBounds, pageWidth / pageHeight, renderSettings);
    this.edgeMaterial.resolution.set(pageWidth, pageHeight);
    this.exportRenderer.render(scene, camera);
    let dataUrl;
    if (dimensionedFront) {
      const annotationCanvas = document.createElement('canvas');
      annotationCanvas.width = pageWidth;
      annotationCanvas.height = pageHeight;
      const context = annotationCanvas.getContext('2d', { alpha: false });
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, pageWidth, pageHeight);
      context.drawImage(this.exportRenderer.domElement, 0, 0, pageWidth, pageHeight);
      drawDimensionedFrontAnnotations(context, camera, modelBounds, pageWidth, pageHeight, {
        levels: this.levels,
        walls: this.walls,
        footprintBounds: this.visibleFootprintBounds(),
      });
      dataUrl = annotationCanvas.toDataURL(mimeType, mimeType === 'image/jpeg' ? 0.94 : undefined);
      annotationCanvas.width = 1;
      annotationCanvas.height = 1;
    } else {
      dataUrl = this.exportRenderer.domElement.toDataURL(mimeType, mimeType === 'image/jpeg' ? 0.94 : undefined);
    }
    disposable.forEach((resource) => resource.dispose?.());
    return dataUrl;
  }

  async exportOrbitVideo(settings) {
    const Encoder = globalThis.VideoEncoder;
    const Frame = globalThis.VideoFrame;
    if (!Encoder || !Frame) throw new Error('MP4 export requires WebCodecs. Use the latest Chrome, Edge, or Safari.');
    const encoderConfig = {
      codec: 'avc1.420028',
      width: VIDEO_WIDTH,
      height: VIDEO_HEIGHT,
      bitrate: VIDEO_BITRATE,
      framerate: VIDEO_FPS,
      bitrateMode: 'constant',
      latencyMode: 'quality',
      avc: { format: 'avc' },
    };
    const support = await Encoder.isConfigSupported(encoderConfig);
    if (!support.supported) throw new Error('This browser cannot encode H.264 MP4 video. Use the latest Chrome, Edge, or Safari.');

    this.ensureExportRenderer();
    this.exportRenderer.setPixelRatio(1);
    this.exportRenderer.setSize(VIDEO_WIDTH, VIDEO_HEIGHT, false);
    this.exportRenderer.toneMappingExposure = settings.lighting === 'night' ? 1 : settings.noTextures ? 0.78 : 0.82;
    this.exportRenderer.shadowMap.enabled = settings.shadows !== false;
    this.exportRenderer.shadowMap.autoUpdate = true;
    const { scene, root, disposable } = this.createExportRenderScene(settings, VIDEO_WIDTH, VIDEO_HEIGHT);
    const bounds = new THREE.Box3().setFromObject(root);
    const camera = createOrbitExportCamera(bounds, VIDEO_WIDTH / VIDEO_HEIGHT, 0, settings.zoom);
    const recordingCanvas = document.createElement('canvas');
    recordingCanvas.width = VIDEO_WIDTH;
    recordingCanvas.height = VIDEO_HEIGHT;
    const recordingContext = recordingCanvas.getContext('2d', { alpha: false });
    if (!recordingContext) {
      disposable.forEach((resource) => resource.dispose?.());
      throw new Error('The video recording canvas could not be created.');
    }

    const target = new ArrayBufferTarget();
    const muxer = new Muxer({
      target,
      video: { codec: 'avc', width: VIDEO_WIDTH, height: VIDEO_HEIGHT },
      fastStart: 'in-memory',
      firstTimestampBehavior: 'offset',
    });
    let encoderError = null;
    const encoder = new Encoder({
      output: (chunk, metadata) => muxer.addVideoChunk(chunk, metadata),
      error: (error) => { encoderError = error; },
    });
    encoder.configure(encoderConfig);
    const durationSeconds = THREE.MathUtils.clamp(Number(settings.orbitDuration) || 10, 2, 60);
    const totalFrames = Math.max(1, Math.round(durationSeconds * VIDEO_FPS));
    const frameDuration = Math.round(1000000 / VIDEO_FPS);

    try {
      for (let frameIndex = 0; frameIndex < totalFrames; frameIndex += 1) {
        const progress = frameIndex / totalFrames;
        positionOrbitExportCamera(camera, bounds, progress, settings.zoom);
        this.exportRenderer.render(scene, camera);
        if (frameIndex === 0) this.exportRenderer.shadowMap.autoUpdate = false;
        recordingContext.drawImage(this.exportRenderer.domElement, 0, 0, VIDEO_WIDTH, VIDEO_HEIGHT);
        const frame = new Frame(recordingCanvas, {
          timestamp: frameIndex * frameDuration,
          duration: frameDuration,
        });
        encoder.encode(frame, { keyFrame: frameIndex % (VIDEO_FPS * 2) === 0 });
        frame.close();
        if (encoder.encodeQueueSize > 12) await encoder.flush();
        if (encoderError) throw encoderError;
        if (frameIndex % 3 === 0 || frameIndex === totalFrames - 1) settings.onProgress?.((frameIndex + 1) / totalFrames);
        await nextAnimationFrame();
      }
      await encoder.flush();
      if (encoderError) throw encoderError;
      encoder.close();
      muxer.finalize();
      downloadBlob(new Blob([target.buffer], { type: 'video/mp4' }), `muqarnas-orbit-${dateStamp()}.mp4`);
    } finally {
      this.exportRenderer.shadowMap.autoUpdate = true;
      if (encoder.state !== 'closed') encoder.close();
      disposable.forEach((resource) => resource.dispose?.());
    }
  }

  async exportWithSettings(settings) {
    if (!this.instances.size) return;
    if (settings.format === 'mp4') {
      await this.exportOrbitVideo(settings);
      return;
    }
    if (settings.format === 'json') {
      this.saveProject();
      return;
    }
    if (settings.format === 'glb') {
      await this.exportGlb();
      return;
    }
    if (settings.format === 'stl') {
      const root = this.createExportModelRoot();
      removeInvisibleBranches(root);
      const result = new STLExporter().parse(root, { binary: true });
      downloadBlob(new Blob([result], { type: 'model/stl' }), `muqarnas-assembly-${dateStamp()}.stl`);
      return;
    }
    if (settings.format === 'pdf') {
      const jpeg = this.renderExportPreview(settings, false, 'image/jpeg');
      downloadBlob(createImagePdf(jpeg, settings), `muqarnas-render-${dateStamp()}.pdf`);
      return;
    }
    const png = this.renderExportPreview(settings, false, 'image/png');
    downloadBlob(dataUrlToBlob(png), `muqarnas-render-${dateStamp()}.png`);
  }

  resize() {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    if (this.mainView === 'perspective') {
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
    }
    this.renderer.setSize(width, height, false);
    this.northBoundaryMaterial?.resolution.set(width, height);
  }

  animate = (time = performance.now()) => {
    this.frame = requestAnimationFrame(this.animate);
    this.updateWalkCamera(time);
    if (!this.walk.enabled && !this.assemblyAnimation) this.orbit.update();
    this.updateAssemblyAnimation(time);
    if (!this.assemblyAnimation) this.syncWalls();
    if (this.selected) {
      this.updateSelectionHighlightMatrices();
      if (this.transform.dragging) this.updateConnectorMarkers();
    }
    this.renderMiniViews();
  };

  dispose() {
    if (this.assemblyAnimation) this.stopAssemblyAnimation(false, false);
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown, true);
    this.renderer.domElement.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('pointermove', this.onPointerMove, true);
    window.removeEventListener('pointerup', this.onPointerUp, true);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.frontRenderer?.domElement.removeEventListener('pointerdown', this.onFrontMiniPointerDown);
    this.topRenderer?.domElement.removeEventListener('pointerdown', this.onTopMiniPointerDown);
    this.orbit.dispose();
    this.transform.dispose();
    this.connectorGeometry.dispose();
    this.connectorMaterial.dispose();
    this.nightLightObjects.forEach(({ helper, marker, targetMarker }) => {
      helper?.dispose?.();
      marker?.geometry?.dispose?.();
      marker?.material?.dispose?.();
      targetMarker?.geometry?.dispose?.();
      targetMarker?.material?.dispose?.();
    });
    this.nightLightObjects.clear();
    this.pointedArchMesh.geometry.dispose();
    this.southArchInfillMesh.geometry.dispose();
    this.northRecessFrameMesh.geometry.dispose();
    const northGeometry = this.wallMeshes.get('north')?.geometry;
    if (northGeometry && northGeometry !== this.wallGeometry) northGeometry.dispose();
    disposeGeneratedGroup(this.archModuleInfillGroup);
    disposeEdgeOverlayGeometries(this.scene);
    this.edgeMaterial.dispose();
    this.wallEdgeMaterial.dispose();
    this.northBoundaryGroup.children.forEach((child) => child.geometry?.dispose?.());
    this.northBoundaryMaterial.dispose();
    this.archPointGeometry.dispose();
    Object.values(this.archPointMaterials).forEach((material) => material.dispose());
    this.wallGeometry.dispose();
    this.wallSideMaterials?.forEach((material) => material.dispose());
    this.northOuterBrickMaterial.dispose();
    this.miniWallOutlineGroup.children.forEach((line) => line.geometry?.dispose?.());
    this.miniWallOutlineMaterial.dispose();
    this.frontOutlineInstances.forEach((group) => group.children.forEach((line) => line.geometry?.dispose?.()));
    this.frontOutlineGroup.clear();
    this.frontOutlineMaterial.dispose();
    this.frontFocusMaterial.dispose();
    this.topOutlineMaterial.dispose();
    this.selectionOutlineMaterial.dispose();
    this.topTierMaterials.forEach((material) => material.dispose());
    this.library.forEach((item) => {
      item.footprintOutlineGeometry?.dispose?.();
      item.selectionOutlineGeometry?.dispose?.();
    });
    this.selectionMarquee.remove();
    this.selectionHighlightGroup.clear();
    this.frontGuideGroup.children.forEach((child) => { child.geometry?.dispose?.(); child.material?.dispose?.(); });
    this.frontLevelMaterials.forEach((material) => material.dispose());
    this.frontRenderer?.dispose();
    this.topRenderer?.dispose();
    this.overviewRenderer?.dispose();
    this.exportRenderer?.dispose();
    this.exportEnvironment?.dispose();
    this.thumbnailRenderer?.dispose();
    this.renderer.dispose();
    this.container.replaceChildren();
    this.frontContainer?.replaceChildren();
    this.topContainer?.replaceChildren();
  }
}

async function parseModel(buffer, ext) {
  if (ext === 'obj') return new OBJLoader().parse(new TextDecoder().decode(buffer));
  const payload = ext === 'gltf' ? new TextDecoder().decode(buffer) : buffer;
  const gltf = await new Promise((resolve, reject) => new GLTFLoader().parse(payload, '', resolve, reject));
  return gltf.scene;
}

function normalizeSlicePlanes(planes = []) {
  if (!Array.isArray(planes)) return [];
  return planes.map((plane) => {
    const normal = new THREE.Vector3().fromArray(Array.isArray(plane?.normal) ? plane.normal : [0, 0, 0]);
    const length = normal.length();
    if (!Number.isFinite(length) || length < 1e-8) return null;
    normal.multiplyScalar(1 / length);
    return {
      normal: normal.toArray(),
      constant: (Number(plane.constant) || 0) / length,
      keep: Number(plane.keep) < 0 ? -1 : 1,
    };
  }).filter(Boolean);
}

function applySlicePlanesToRoot(root, slicePlanes) {
  if (!slicePlanes.length) return;
  root.updateMatrixWorld(true);
  root.traverse((child) => {
    if (!child.isMesh || child.userData.isEdgeOverlay || !child.geometry?.attributes?.position) return;
    const rootToMesh = child.matrixWorld.clone().invert().multiply(root.matrixWorld);
    let geometry = child.geometry;
    slicePlanes.forEach((slicePlane) => {
      if (!geometry?.attributes?.position?.count) return;
      const plane = new THREE.Plane(
        new THREE.Vector3().fromArray(slicePlane.normal),
        slicePlane.constant,
      ).applyMatrix4(rootToMesh);
      const clipped = clipBufferGeometryByPlane(geometry, plane, slicePlane.keep);
      if (geometry !== child.geometry) geometry.dispose();
      geometry = clipped;
    });
    if (geometry !== child.geometry) child.geometry.dispose();
    child.geometry = geometry;
    child.visible = geometry.attributes.position?.count >= 3;
  });
  root.userData.sliceSnapGeometry = extractOuterVerticalSnapGeometry(root);
  root.userData.sliceSelectionOutlineGeometry = createFootprintPrismGeometry(root.userData.sliceSnapGeometry.connectors);
  root.userData.sliceFootprintOutlineGeometry = createFootprintOutlineGeometry(root.userData.sliceSnapGeometry.connectors);
}

function effectiveSnapItem(root, item) {
  return root?.userData?.sliceSnapGeometry
    ? { ...item, ...root.userData.sliceSnapGeometry }
    : item;
}

function clipBufferGeometryByPlane(sourceGeometry, plane, keepSign = 1) {
  const geometry = sourceGeometry;
  const position = geometry.attributes.position;
  if (!position?.count) return new THREE.BufferGeometry();
  const index = geometry.index;
  const attributes = Object.fromEntries(Object.entries(geometry.attributes).filter(([, attribute]) => (
    attribute && attribute.itemSize > 0 && attribute.count === position.count && !attribute.isInterleavedBufferAttribute
  )));
  if (!attributes.position) attributes.position = position;
  const attributeNames = Object.keys(attributes);
  const triangleCount = Math.floor((index ? index.count : position.count) / 3);
  const materialBuckets = new Map();
  const cutSegments = [];
  const epsilon = Math.max(1e-7, geometry.boundingSphere?.radius ? geometry.boundingSphere.radius * 1e-7 : 1e-7);
  const groups = geometry.groups?.length ? geometry.groups : [{ start: 0, count: triangleCount * 3, materialIndex: 0 }];

  const materialIndexAt = (triangleOffset) => {
    const group = groups.find((candidate) => triangleOffset >= candidate.start && triangleOffset < candidate.start + candidate.count);
    return group?.materialIndex || 0;
  };
  const readVertex = (vertexIndex) => ({
    attributes: Object.fromEntries(attributeNames.map((name) => {
      const attribute = attributes[name];
      const values = [];
      for (let component = 0; component < attribute.itemSize; component += 1) {
        values.push(attribute.getComponent ? attribute.getComponent(vertexIndex, component) : (
          component === 0 ? attribute.getX(vertexIndex)
            : component === 1 ? attribute.getY(vertexIndex)
              : component === 2 ? attribute.getZ(vertexIndex)
                : attribute.getW(vertexIndex)
        ));
      }
      return [name, values];
    })),
  });
  const vertexPosition = (vertex) => new THREE.Vector3().fromArray(vertex.attributes.position);
  const interpolateVertex = (first, second, amount) => ({
    attributes: Object.fromEntries(attributeNames.map((name) => [
      name,
      first.attributes[name].map((value, component) => THREE.MathUtils.lerp(value, second.attributes[name][component], amount)),
    ])),
  });
  const bucketFor = (materialIndex) => {
    if (!materialBuckets.has(materialIndex)) {
      materialBuckets.set(materialIndex, Object.fromEntries(attributeNames.map((name) => [name, []])));
    }
    return materialBuckets.get(materialIndex);
  };
  const emitTriangle = (first, second, third, materialIndex) => {
    const bucket = bucketFor(materialIndex);
    [first, second, third].forEach((vertex) => {
      attributeNames.forEach((name) => bucket[name].push(...vertex.attributes[name]));
    });
  };

  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const triangleOffset = triangle * 3;
    const indices = [0, 1, 2].map((corner) => index ? index.getX(triangleOffset + corner) : triangleOffset + corner);
    const vertices = indices.map(readVertex);
    const distances = vertices.map((vertex) => plane.distanceToPoint(vertexPosition(vertex)));
    const signedDistances = distances.map((distance) => distance * keepSign);
    const clipped = [];
    const intersections = [];
    for (let edge = 0; edge < 3; edge += 1) {
      const current = vertices[edge];
      const next = vertices[(edge + 1) % 3];
      const currentDistance = signedDistances[edge];
      const nextDistance = signedDistances[(edge + 1) % 3];
      const currentInside = currentDistance >= -epsilon;
      const nextInside = nextDistance >= -epsilon;
      if (currentInside) clipped.push(current);
      if (currentInside !== nextInside) {
        const amount = currentDistance / (currentDistance - nextDistance);
        const intersection = interpolateVertex(current, next, amount);
        clipped.push(intersection);
        intersections.push(vertexPosition(intersection));
      } else if (Math.abs(currentDistance) <= epsilon) {
        intersections.push(vertexPosition(current));
      }
    }
    const uniqueIntersections = dedupeVector3(intersections, epsilon * 8);
    if (uniqueIntersections.length === 2 && uniqueIntersections[0].distanceToSquared(uniqueIntersections[1]) > epsilon * epsilon) {
      cutSegments.push(uniqueIntersections);
    }
    if (clipped.length < 3) continue;
    const materialIndex = materialIndexAt(triangleOffset);
    for (let corner = 1; corner < clipped.length - 1; corner += 1) {
      emitTriangle(clipped[0], clipped[corner], clipped[corner + 1], materialIndex);
    }
  }

  const capNormal = plane.normal.clone().multiplyScalar(keepSign > 0 ? -1 : 1).normalize();
  const loops = buildPlaneIntersectionLoops(cutSegments, epsilon * 12);
  if (loops.length) {
    const basisU = Math.abs(capNormal.y) < 0.9
      ? new THREE.Vector3(0, 1, 0).cross(capNormal).normalize()
      : new THREE.Vector3(1, 0, 0);
    const basisV = capNormal.clone().cross(basisU).normalize();
    loops.forEach((loop) => {
      if (loop.length < 3) return;
      const contour = loop.map((point) => new THREE.Vector2(point.dot(basisU), point.dot(basisV)));
      const triangles = THREE.ShapeUtils.triangulateShape(contour, []);
      triangles.forEach(([a, b, c]) => {
        const points = [loop[a], loop[b], loop[c]];
        const triangleNormal = points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0]));
        if (triangleNormal.dot(capNormal) < 0) [points[1], points[2]] = [points[2], points[1]];
        const capVertices = points.map((point) => ({
          attributes: Object.fromEntries(attributeNames.map((name) => {
            const itemSize = attributes[name].itemSize;
            const values = new Array(itemSize).fill(0);
            if (name === 'position') point.toArray(values);
            else if (name === 'normal') capNormal.toArray(values);
            else if (name === 'uv' && itemSize >= 2) {
              values[0] = point.dot(basisU);
              values[1] = point.dot(basisV);
            } else if (name === 'color') values.fill(1);
            return [name, values];
          })),
        }));
        emitTriangle(capVertices[0], capVertices[1], capVertices[2], 0);
      });
    });
  }

  const result = new THREE.BufferGeometry();
  const orderedBuckets = [...materialBuckets.entries()].sort(([first], [second]) => first - second);
  attributeNames.forEach((name) => {
    const values = orderedBuckets.flatMap(([, bucket]) => bucket[name]);
    if (values.length) result.setAttribute(name, new THREE.Float32BufferAttribute(values, attributes[name].itemSize));
  });
  let groupStart = 0;
  orderedBuckets.forEach(([materialIndex, bucket]) => {
    const count = bucket.position.length / attributes.position.itemSize;
    if (count) result.addGroup(groupStart, count, materialIndex);
    groupStart += count;
  });
  if (!result.attributes.normal && result.attributes.position?.count) result.computeVertexNormals();
  result.computeBoundingBox();
  result.computeBoundingSphere();
  return result;
}

function dedupeVector3(points, tolerance) {
  const toleranceSq = tolerance * tolerance;
  const unique = [];
  points.forEach((point) => {
    if (!unique.some((candidate) => candidate.distanceToSquared(point) <= toleranceSq)) unique.push(point.clone());
  });
  return unique;
}

function buildPlaneIntersectionLoops(segments, tolerance) {
  if (!segments.length) return [];
  const keyFor = (point) => `${Math.round(point.x / tolerance)}:${Math.round(point.y / tolerance)}:${Math.round(point.z / tolerance)}`;
  const nodes = new Map();
  const edges = [];
  segments.forEach(([start, end]) => {
    const startKey = keyFor(start);
    const endKey = keyFor(end);
    if (startKey === endKey) return;
    if (!nodes.has(startKey)) nodes.set(startKey, { point: start.clone(), edges: [] });
    if (!nodes.has(endKey)) nodes.set(endKey, { point: end.clone(), edges: [] });
    const edgeIndex = edges.length;
    edges.push({ startKey, endKey, used: false });
    nodes.get(startKey).edges.push(edgeIndex);
    nodes.get(endKey).edges.push(edgeIndex);
  });
  const loops = [];
  edges.forEach((edge, initialEdgeIndex) => {
    if (edge.used) return;
    const loop = [];
    let edgeIndex = initialEdgeIndex;
    let currentKey = edge.startKey;
    const startKey = currentKey;
    for (let guard = 0; guard < edges.length + 2; guard += 1) {
      const currentEdge = edges[edgeIndex];
      if (currentEdge.used) break;
      currentEdge.used = true;
      loop.push(nodes.get(currentKey).point.clone());
      const nextKey = currentEdge.startKey === currentKey ? currentEdge.endKey : currentEdge.startKey;
      if (nextKey === startKey) {
        if (loop.length >= 3) loops.push(loop);
        break;
      }
      const nextEdgeIndex = nodes.get(nextKey).edges.find((candidate) => !edges[candidate].used);
      if (nextEdgeIndex === undefined) break;
      currentKey = nextKey;
      edgeIndex = nextEdgeIndex;
    }
  });
  return loops;
}

function footprintCornersForRoot(root) {
  root.updateMatrixWorld(true);
  const snapGeometry = root.userData.sliceSnapGeometry || extractOuterVerticalSnapGeometry(root);
  const corners = [];
  const tolerance = 1e-5;
  snapGeometry.connectors.forEach((connector) => {
    if (connector.kind !== 'face') return;
    const halfTangent = connector.tangent.clone().multiplyScalar(connector.length * 0.5);
    [connector.position.clone().sub(halfTangent), connector.position.clone().add(halfTangent)].forEach((local) => {
      const world = local.applyMatrix4(root.matrixWorld);
      if (!corners.some((corner) => Math.hypot(corner.x - world.x, corner.z - world.z) < tolerance)) corners.push(world);
    });
  });
  return corners;
}

function rootIntersectsFiniteSlice(root, plane, start, direction, length) {
  root.updateMatrixWorld(true);
  let minimumDistance = Infinity;
  let maximumDistance = -Infinity;
  let minimumAlong = Infinity;
  let maximumAlong = -Infinity;
  const point = new THREE.Vector3();
  root.traverse((child) => {
    if (!child.isMesh || child.userData.isEdgeOverlay || !child.visible || !child.geometry?.attributes?.position) return;
    const position = child.geometry.attributes.position;
    for (let index = 0; index < position.count; index += 1) {
      point.fromBufferAttribute(position, index).applyMatrix4(child.matrixWorld);
      const distance = plane.distanceToPoint(point);
      const along = point.clone().sub(start).dot(direction);
      minimumDistance = Math.min(minimumDistance, distance);
      maximumDistance = Math.max(maximumDistance, distance);
      minimumAlong = Math.min(minimumAlong, along);
      maximumAlong = Math.max(maximumAlong, along);
    }
  });
  const epsilon = 1e-5;
  return minimumDistance < -epsilon
    && maximumDistance > epsilon
    && maximumAlong >= -epsilon
    && minimumAlong <= length + epsilon;
}

function selectionBounds(roots) {
  const bounds = new THREE.Box3();
  roots.forEach((root) => bounds.expandByObject(root));
  return bounds;
}

function normalizeSouthOpenings(openings = {}) {
  const door = { ...DEFAULT_SOUTH_OPENINGS.door, ...(openings?.door || {}) };
  const windowOpening = { ...DEFAULT_SOUTH_OPENINGS.window, ...(openings?.window || {}) };
  return {
    door: {
      enabled: door.enabled === true,
      width: THREE.MathUtils.clamp(Number(door.width) || DEFAULT_SOUTH_OPENINGS.door.width, 0.1, GROUND_SIZE),
      height: THREE.MathUtils.clamp(Number(door.height) || DEFAULT_SOUTH_OPENINGS.door.height, 0.1, 10),
      position: THREE.MathUtils.clamp(Number(door.position) || 0, -GROUND_HALF_SIZE, GROUND_HALF_SIZE),
    },
    window: {
      enabled: windowOpening.enabled === true,
      width: THREE.MathUtils.clamp(Number(windowOpening.width) || DEFAULT_SOUTH_OPENINGS.window.width, 0.1, GROUND_SIZE),
      height: THREE.MathUtils.clamp(Number(windowOpening.height) || DEFAULT_SOUTH_OPENINGS.window.height, 0.1, 10),
      position: THREE.MathUtils.clamp(Number(windowOpening.position) || 0, -GROUND_HALF_SIZE, GROUND_HALF_SIZE),
      sillHeight: windowOpening.sillHeight === null || windowOpening.sillHeight === undefined || windowOpening.sillHeight === ''
        ? null
        : THREE.MathUtils.clamp(Number(windowOpening.sillHeight) || 0, 0, 10),
    },
  };
}

function normalizePointedArch(arch = {}) {
  const value = { ...DEFAULT_POINTED_ARCH, ...(arch || {}) };
  const optionalNumber = (input, min, max) => input === null || input === undefined || input === ''
    ? null
    : THREE.MathUtils.clamp(Number(input) || 0, min, max);
  return {
    enabled: value.enabled !== false,
    greenOffset: optionalNumber(value.greenOffset, 0.05, GROUND_SIZE),
    greenHeight: optionalNumber(value.greenHeight, -10, 20),
  };
}

function normalizeNorthWall(northWall = {}) {
  const value = { ...DEFAULT_NORTH_WALL, ...(northWall || {}) };
  return {
    outwardWidth: THREE.MathUtils.clamp(Number(value.outwardWidth) || 0, 0, GROUND_HALF_SIZE),
    minHeight: value.minHeight === null || value.minHeight === undefined || value.minHeight === ''
      ? null
      : THREE.MathUtils.clamp(Number(value.minHeight) || 0, 0, 20),
    archTopExtension: THREE.MathUtils.clamp(Number(value.archTopExtension) || 0, 0, 10),
  };
}

function normalizeNorthBoundary(boundary = {}) {
  const value = { ...DEFAULT_NORTH_BOUNDARY, ...(boundary || {}) };
  return {
    enabled: value.enabled === true,
    depth: THREE.MathUtils.clamp(Number(value.depth) || DEFAULT_NORTH_BOUNDARY.depth, 0.01, 0.38),
    color: typeof value.color === 'string' && /^#[0-9a-f]{6}$/i.test(value.color) ? value.color.toLowerCase() : DEFAULT_NORTH_BOUNDARY.color,
    thickness: THREE.MathUtils.clamp(Number(value.thickness) || DEFAULT_NORTH_BOUNDARY.thickness, 0.5, 6),
  };
}

function normalizeNightVector(value, fallback) {
  return [0, 1, 2].map((index) => {
    const numeric = Number(value?.[index]);
    return Number.isFinite(numeric) ? THREE.MathUtils.clamp(numeric, -GROUND_HALF_SIZE, GROUND_HALF_SIZE) : fallback[index];
  });
}

function normalizeNightLight(light = {}) {
  const fallback = DEFAULT_NIGHT_LIGHT;
  return {
    id: light.id || crypto.randomUUID(),
    name: String(light.name || 'Spotlight').slice(0, 60),
    enabled: light.enabled !== false,
    color: /^#[0-9a-f]{6}$/i.test(light.color || '') ? light.color : fallback.color,
    intensity: THREE.MathUtils.clamp(Number(light.intensity) || fallback.intensity, 1, 1000),
    distance: THREE.MathUtils.clamp(Number(light.distance) || fallback.distance, 0.5, 60),
    angle: THREE.MathUtils.clamp(Number(light.angle) || fallback.angle, 5, 85),
    penumbra: THREE.MathUtils.clamp(Number(light.penumbra) || 0, 0, 1),
    decay: THREE.MathUtils.clamp(Number(light.decay) || fallback.decay, 0, 2),
    position: normalizeNightVector(light.position, fallback.position),
    target: normalizeNightVector(light.target, fallback.target),
  };
}

function cloneNightLight(light) {
  return { ...light, position: [...light.position], target: [...light.target] };
}

function normalizeWallEdges(settings = {}) {
  const value = { ...DEFAULT_WALL_EDGES, ...(settings || {}) };
  return {
    enabled: value.enabled === true,
    color: typeof value.color === 'string' && /^#[0-9a-f]{6}$/i.test(value.color)
      ? value.color.toLowerCase()
      : DEFAULT_WALL_EDGES.color,
    thickness: THREE.MathUtils.clamp(Number(value.thickness) || DEFAULT_WALL_EDGES.thickness, 0.5, 6),
  };
}

function effectiveNorthRingWidth(wallWidth, wallHeight, brickWidth) {
  return Math.min(
    THREE.MathUtils.clamp(Number(brickWidth) || DEFAULT_WALL_BRICK_PATTERN.brickWidth, 0.05, 1),
    Math.max(0, wallWidth) * 0.45,
    Math.max(0, wallHeight) * 0.45,
  );
}

function wallPatternForSide(brickPattern, side) {
  const normalized = normalizeWallBrickPattern(brickPattern);
  return { ...normalized, bondPattern: normalizeWallBondPattern(normalized.sideBonds?.[side]) };
}

function decorativeFaceForWall(side) {
  if (side === 'east') return { axis: 'x', sign: -1 };
  if (side === 'west') return { axis: 'x', sign: 1 };
  return { axis: 'z', sign: 1 };
}

function normalizeWallBrickPattern(pattern = {}) {
  const value = { ...DEFAULT_WALL_BRICK_PATTERN, ...(pattern || {}) };
  const legacyBond = normalizeWallBondPattern(value.bondPattern);
  return {
    enabled: value.enabled === true,
    brickWidth: THREE.MathUtils.clamp(Number(value.brickWidth) || DEFAULT_WALL_BRICK_PATTERN.brickWidth, 0.05, 1),
    brickHeight: THREE.MathUtils.clamp(Number(value.brickHeight) || DEFAULT_WALL_BRICK_PATTERN.brickHeight, 0.02, 0.5),
    mortar: THREE.MathUtils.clamp(Number(value.mortar) || DEFAULT_WALL_BRICK_PATTERN.mortar, 0.001, 0.05),
    mortarColor: typeof value.mortarColor === 'string' && /^#[0-9a-f]{6}$/i.test(value.mortarColor)
      ? value.mortarColor.toLowerCase()
      : DEFAULT_WALL_BRICK_PATTERN.mortarColor,
    bondPattern: legacyBond,
    sideBonds: Object.fromEntries(WALL_SIDES.map((side) => [
      side,
      normalizeWallBondPattern(value.sideBonds?.[side] || legacyBond),
    ])),
  };
}

function normalizeWallBondPattern(pattern = {}) {
  if (Number(pattern?.version) >= 2 && Array.isArray(pattern?.bricks) && pattern.bricks.length) {
    const columns = THREE.MathUtils.clamp(Math.round(Number(pattern.columns) || 1), 1, 256);
    const rows = THREE.MathUtils.clamp(Math.round(Number(pattern.rows) || 1), 1, 256);
    return {
      version: 2,
      unit: 'quarter-brick-width',
      columns,
      rows,
      scale: THREE.MathUtils.clamp(Number(pattern.scale) || 1, 0.25, 4),
      selectionKey: typeof pattern.selectionKey === 'string' ? pattern.selectionKey.slice(0, 160) : '',
      selectionName: typeof pattern.selectionName === 'string' ? pattern.selectionName.slice(0, 160) : '',
      mortarColor: typeof pattern.mortarColor === 'string' && /^#[0-9a-f]{6}$/i.test(pattern.mortarColor)
        ? pattern.mortarColor.toLowerCase()
        : undefined,
      bricks: pattern.bricks.slice(0, 4096).map((brick) => ({
        x: THREE.MathUtils.clamp(Number(brick?.x) || 0, 0, columns),
        y: THREE.MathUtils.clamp(Number(brick?.y) || 0, 0, rows),
        width: THREE.MathUtils.clamp(Number(brick?.width) || 1, 0.25, columns),
        height: THREE.MathUtils.clamp(Number(brick?.height) || 1, 0.25, rows),
        orientation: brick?.orientation === 'vertical' ? 'vertical' : 'horizontal',
        color: typeof brick?.color === 'string' && /^#[0-9a-f]{6}$/i.test(brick.color)
          ? brick.color.toLowerCase()
          : DEFAULT_WALL_COLOR,
        mergeKey: typeof brick?.mergeKey === 'string' && brick.mergeKey.length <= 80
          ? brick.mergeKey
          : null,
      })),
    };
  }
  const sourceCourses = Array.isArray(pattern?.courses) && pattern.courses.length
    ? pattern.courses
    : DEFAULT_WALL_BRICK_PATTERN.bondPattern.courses;
  return {
    selectionKey: typeof pattern.selectionKey === 'string' ? pattern.selectionKey.slice(0, 160) : 'builtin:running',
    selectionName: typeof pattern.selectionName === 'string' ? pattern.selectionName.slice(0, 160) : 'Normal running bond',
    courses: sourceCourses.slice(0, MAX_BOND_COURSES).map((course) => ({
      offset: THREE.MathUtils.clamp(Number(course?.offset) || 0, -4, 4),
      bricks: (Array.isArray(course?.bricks) && course.bricks.length ? course.bricks : [1])
        .slice(0, MAX_BOND_BRICKS_PER_COURSE)
        .map((width) => THREE.MathUtils.clamp(Number(width) || 1, 0.25, 2)),
    })),
  };
}

function isReadableWallBondPattern(pattern) {
  if (!pattern || typeof pattern !== 'object') return false;
  if (Number(pattern.version) >= 2) {
    return Number.isFinite(Number(pattern.columns))
      && Number.isFinite(Number(pattern.rows))
      && Array.isArray(pattern.bricks)
      && pattern.bricks.length > 0;
  }
  return Array.isArray(pattern.courses)
    && pattern.courses.length > 0
    && pattern.courses.some((course) => Array.isArray(course?.bricks) && course.bricks.length > 0);
}

function isReadableProceduralWallBond(pattern) {
  return Number(pattern?.version || 0) < 2
    && Array.isArray(pattern?.courses)
    && pattern.courses.length > 0
    && pattern.courses.some((course) => Array.isArray(course?.bricks) && course.bricks.length > 0);
}

function createExactWallPatternTexture(pattern, brickPattern) {
  if (!pattern || Number(pattern.version) < 2 || !Array.isArray(pattern.bricks) || !pattern.bricks.length || typeof document === 'undefined') return null;
  const columns = Math.max(1, pattern.columns);
  const rows = Math.max(1, pattern.rows);
  const epsilon = 1e-4;
  const mergeGroup = (brick) => brick.mergeKey || brick.color;
  const mergedHorizontalBricks = [];
  pattern.bricks
    .filter((brick) => brick.orientation !== 'vertical')
    .sort((a, b) => a.y - b.y || a.height - b.height || a.x - b.x)
    .forEach((brick) => {
      const previous = mergedHorizontalBricks.at(-1);
      const touchesPrevious = previous
        && Math.abs(previous.y - brick.y) <= epsilon
        && Math.abs(previous.height - brick.height) <= epsilon
        && Math.abs(previous.x + previous.width - brick.x) <= epsilon
        && mergeGroup(previous) === mergeGroup(brick);
      if (touchesPrevious) {
        previous.width += brick.width;
        return;
      }
      mergedHorizontalBricks.push({ ...brick });
    });
  const mergedVerticalBricks = [];
  pattern.bricks
    .filter((brick) => brick.orientation === 'vertical')
    .sort((a, b) => a.x - b.x || a.width - b.width || a.y - b.y)
    .forEach((brick) => {
      const previous = mergedVerticalBricks.at(-1);
      const touchesPrevious = previous
        && Math.abs(previous.x - brick.x) <= epsilon
        && Math.abs(previous.width - brick.width) <= epsilon
        && Math.abs(previous.y + previous.height - brick.y) <= epsilon
        && mergeGroup(previous) === mergeGroup(brick);
      if (touchesPrevious) {
        previous.height += brick.height;
        return;
      }
      mergedVerticalBricks.push({ ...brick });
    });
  const renderBricks = [...mergedHorizontalBricks, ...mergedVerticalBricks];
  const cellPixels = Math.max(4, Math.min(32, Math.floor(1024 / Math.max(columns, rows))));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(columns * cellPixels));
  canvas.height = Math.max(1, Math.round(rows * cellPixels));
  const context = canvas.getContext('2d', { alpha: false });
  context.fillStyle = brickPattern.mortarColor;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const horizontalUnit = Math.max(0.001, brickPattern.brickWidth / 4);
  const verticalUnit = Math.max(0.001, brickPattern.brickHeight);
  const mortarX = Math.min(cellPixels * 0.48, brickPattern.mortar / horizontalUnit * cellPixels);
  const mortarY = Math.min(cellPixels * 0.48, brickPattern.mortar / verticalUnit * cellPixels);
  const horizontalBricks = mergedHorizontalBricks;
  const matchingHorizontalSeamBrick = (brick, edge) => horizontalBricks.some((candidate) => (
    candidate !== brick
    && (edge === 'left'
      ? candidate.x + candidate.width >= columns - epsilon
      : candidate.x <= epsilon)
    && Math.abs(candidate.y - brick.y) <= epsilon
    && Math.abs(candidate.height - brick.height) <= epsilon
    && (candidate.mergeKey || candidate.color) === (brick.mergeKey || brick.color)
  ));
  const matchingVerticalSeamBrick = (brick, edge) => mergedVerticalBricks.some((candidate) => (
    candidate !== brick
    && (edge === 'top'
      ? candidate.y + candidate.height >= rows - epsilon
      : candidate.y <= epsilon)
    && Math.abs(candidate.x - brick.x) <= epsilon
    && Math.abs(candidate.width - brick.width) <= epsilon
    && mergeGroup(candidate) === mergeGroup(brick)
  ));
  renderBricks.forEach((brick) => {
    const touchesLeft = brick.x <= epsilon;
    const touchesRight = brick.x + brick.width >= columns - epsilon;
    const touchesTop = brick.y <= epsilon;
    const touchesBottom = brick.y + brick.height >= rows - epsilon;
    const horizontal = brick.orientation !== 'vertical';
    const vertical = !horizontal;
    const joinsLeft = horizontal && touchesLeft && (
      touchesRight || matchingHorizontalSeamBrick(brick, 'left')
    );
    const joinsRight = horizontal && touchesRight && (
      touchesLeft || matchingHorizontalSeamBrick(brick, 'right')
    );
    const joinsTop = vertical && touchesTop && (
      touchesBottom || matchingVerticalSeamBrick(brick, 'top')
    );
    const joinsBottom = vertical && touchesBottom && (
      touchesTop || matchingVerticalSeamBrick(brick, 'bottom')
    );
    const leftInset = joinsLeft ? 0 : mortarX * 0.5;
    const rightInset = joinsRight ? 0 : mortarX * 0.5;
    const topInset = joinsTop ? 0 : mortarY * 0.5;
    const bottomInset = joinsBottom ? 0 : mortarY * 0.5;
    const x = brick.x * cellPixels + leftInset;
    const y = brick.y * cellPixels + topInset;
    const width = Math.max(0.5, brick.width * cellPixels - leftInset - rightInset);
    const height = Math.max(0.5, brick.height * cellPixels - topInset - bottomInset);
    context.fillStyle = brick.color;
    context.fillRect(x, y, width, height);
  });

  // Reinforce a joined horizontal brick on both sides of the repeating image.
  // This color bleed prevents linear sampling from pulling mortar into the tile
  // boundary when the wall is viewed obliquely or from a distance.
  const seamBleed = Math.max(2, Math.ceil(mortarX * 0.5) + 1);
  horizontalBricks
    .filter((brick) => brick.x <= epsilon && (
      brick.x + brick.width >= columns - epsilon || matchingHorizontalSeamBrick(brick, 'left')
    ))
    .forEach((brick) => {
      const topInset = mortarY * 0.5;
      const y = brick.y * cellPixels + topInset;
      const height = Math.max(0.5, brick.height * cellPixels - mortarY);
      context.fillStyle = brick.color;
      context.fillRect(0, y, seamBleed, height);
      context.fillRect(canvas.width - seamBleed, y, seamBleed, height);
    });

  // Apply the same seamless merge to vertical bricks at the top/bottom repeat
  // boundary, preventing a horizontal mortar line through a continued brick.
  const verticalSeamBleed = Math.max(2, Math.ceil(mortarY * 0.5) + 1);
  mergedVerticalBricks
    .filter((brick) => brick.y <= epsilon && (
      brick.y + brick.height >= rows - epsilon || matchingVerticalSeamBrick(brick, 'top')
    ))
    .forEach((brick) => {
      const leftInset = mortarX * 0.5;
      const x = brick.x * cellPixels + leftInset;
      const width = Math.max(0.5, brick.width * cellPixels - mortarX);
      context.fillStyle = brick.color;
      context.fillRect(x, 0, width, verticalSeamBleed);
      context.fillRect(x, canvas.height - verticalSeamBleed, width, verticalSeamBleed);
    });

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

function createWallPatternFallbackTexture() {
  const texture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function normalizeWallColor(color) {
  return typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : DEFAULT_WALL_COLOR;
}

function normalizeMaterialPreset(material) {
  return ['matte', 'glossy', 'metallic', 'stone'].includes(material) ? material : 'matte';
}

function createSouthArchInfillShape(arch, openings, centerX, southWallHeight) {
  if (!arch?.length) return null;
  const leftX = arch[0].x;
  const rightX = arch[arch.length - 1].x;
  const shape = new THREE.Shape();
  shape.moveTo(arch[0].x, arch[0].y);
  arch.slice(1).forEach((point) => shape.lineTo(point.x, point.y));
  shape.lineTo(rightX, 0);

  const door = openings?.door?.enabled ? openings.door : null;
  let doorRect = null;
  if (door) {
    const center = THREE.MathUtils.clamp(centerX + door.position, leftX, rightX);
    const minX = THREE.MathUtils.clamp(center - door.width * 0.5, leftX, rightX);
    const maxX = THREE.MathUtils.clamp(center + door.width * 0.5, leftX, rightX);
    const topLimit = Math.min(archHeightAtX(arch, minX), archHeightAtX(arch, maxX)) - 0.001;
    const maxY = THREE.MathUtils.clamp(door.height, 0, Math.max(0, topLimit));
    if (maxX - minX > 1e-5 && maxY > 1e-5) doorRect = { minX, maxX, minY: 0, maxY };
  }
  if (doorRect) {
    shape.lineTo(doorRect.maxX, 0);
    shape.lineTo(doorRect.maxX, doorRect.maxY);
    shape.lineTo(doorRect.minX, doorRect.maxY);
    shape.lineTo(doorRect.minX, 0);
  }
  shape.lineTo(leftX, 0);
  shape.closePath();

  const windowOpening = openings?.window?.enabled ? openings.window : null;
  if (windowOpening) {
    const center = THREE.MathUtils.clamp(centerX + windowOpening.position, leftX, rightX);
    const minX = THREE.MathUtils.clamp(center - windowOpening.width * 0.5, leftX, rightX);
    const maxX = THREE.MathUtils.clamp(center + windowOpening.width * 0.5, leftX, rightX);
    let minY = windowOpening.sillHeight ?? southWallHeight * 0.8;
    if (doorRect && maxX > doorRect.minX && minX < doorRect.maxX) minY = Math.max(minY, doorRect.maxY);
    const topLimit = Math.min(archHeightAtX(arch, minX), archHeightAtX(arch, maxX)) - 0.001;
    const maxY = Math.min(minY + windowOpening.height, topLimit);
    if (maxX - minX > 1e-5 && maxY - minY > 1e-5) {
      const hole = new THREE.Path();
      hole.moveTo(minX, minY);
      hole.lineTo(maxX, minY);
      hole.lineTo(maxX, maxY);
      hole.lineTo(minX, maxY);
      hole.closePath();
      shape.holes.push(hole);
    }
  }
  return shape;
}

function archHeightAtX(arch, x) {
  let height = 0;
  for (let index = 0; index < arch.length - 1; index += 1) {
    const first = arch[index];
    const second = arch[index + 1];
    if (x < Math.min(first.x, second.x) - 1e-6 || x > Math.max(first.x, second.x) + 1e-6) continue;
    const span = second.x - first.x;
    const t = Math.abs(span) < 1e-8 ? 0 : (x - first.x) / span;
    height = Math.max(height, THREE.MathUtils.lerp(first.y, second.y, t));
  }
  return height;
}

function moduleWorldFootprintContour(root, connectors) {
  const segments = connectors.filter((connector) => connector.kind === 'face').map((connector) => {
    const half = connector.tangent.clone().multiplyScalar(connector.length * 0.5);
    const start = connector.position.clone().sub(half);
    const end = connector.position.clone().add(half);
    return [new THREE.Vector2(start.x, start.z), new THREE.Vector2(end.x, end.z)];
  });
  if (!segments.length) return [];
  const tolerance = 1e-4;
  const loops = [];
  while (segments.length) {
    const [start, end] = segments.shift();
    const loop = [start, end];
    let current = end;
    while (segments.length && current.distanceTo(loop[0]) > tolerance) {
      const index = segments.findIndex(([a, b]) => a.distanceTo(current) <= tolerance || b.distanceTo(current) <= tolerance);
      if (index < 0) break;
      const [a, b] = segments.splice(index, 1)[0];
      current = a.distanceTo(current) <= tolerance ? b : a;
      loop.push(current);
    }
    if (loop.length > 3 && loop[loop.length - 1].distanceTo(loop[0]) <= tolerance) loop.pop();
    if (loop.length >= 3) loops.push(loop);
  }
  if (!loops.length) return [];
  const contour = loops.sort((a, b) => Math.abs(polygonArea2(b)) - Math.abs(polygonArea2(a)))[0];
  root.updateMatrixWorld(true);
  const worldContour = contour.map((point) => {
    const world = new THREE.Vector3(point.x, 0, point.y).applyMatrix4(root.matrixWorld);
    return new THREE.Vector2(world.x, world.z);
  });
  if (polygonArea2(worldContour) < 0) worldContour.reverse();
  return worldContour;
}

function offsetArchPolylineIntoWall(arch, offset) {
  return arch.map((point, index) => {
    const previous = arch[Math.max(0, index - 1)];
    const next = arch[Math.min(arch.length - 1, index + 1)];
    const tangent = next.clone().sub(previous).normalize();
    let normal = new THREE.Vector2(-tangent.y, tangent.x);
    if (index > 0 && index < arch.length - 1) {
      const incoming = point.clone().sub(previous).normalize();
      const outgoing = next.clone().sub(point).normalize();
      const incomingNormal = new THREE.Vector2(-incoming.y, incoming.x);
      const outgoingNormal = new THREE.Vector2(-outgoing.y, outgoing.x);
      const miter = incomingNormal.clone().add(outgoingNormal);
      if (miter.lengthSq() > 1e-10) {
        miter.normalize();
        const projection = Math.max(0.35, miter.dot(incomingNormal));
        normal = miter.multiplyScalar(1 / projection);
      }
    }
    return point.clone().addScaledVector(normal, offset);
  });
}

function createFootprintVaultExtensionGeometry(contour, bottomY, innerArch) {
  // Extrude the original top footprint 10% beyond the arch underside. The
  // overlap is entirely inside the arch, closing light/shadow seams without
  // widening the footprint or pushing the extension into the module below.
  const archOverlapRatio = 0.1;
  const topHeightAt = (point) => {
    const archHeight = archHeightAtX(innerArch, point.x);
    const extrusionHeight = Math.max(0, archHeight - bottomY);
    return Math.max(bottomY, archHeight + extrusionHeight * archOverlapRatio);
  };
  const topHeights = contour.map(topHeightAt);
  if (Math.max(...topHeights) - bottomY < 0.01) return null;
  const triangles = THREE.ShapeUtils.triangulateShape(contour, []);
  if (!triangles.length) return null;
  const positions = [];

  const pushVertex = (point, y) => positions.push(point.x, y, point.y);
  const pushCapTriangle = (a, b, c) => {
    // The vault height changes only along X. Subdividing wide triangles keeps
    // the roof tight to the arch while each resulting face remains planar.
    const xSpan = Math.max(a.x, b.x, c.x) - Math.min(a.x, b.x, c.x);
    if (xSpan > 0.018) {
      const edges = [
        { a, b, opposite: c, length: Math.abs(a.x - b.x) },
        { a: b, b: c, opposite: a, length: Math.abs(b.x - c.x) },
        { a: c, b: a, opposite: b, length: Math.abs(c.x - a.x) },
      ];
      const edge = edges.sort((first, second) => second.length - first.length)[0];
      const midpoint = edge.a.clone().add(edge.b).multiplyScalar(0.5);
      pushCapTriangle(edge.a, midpoint, edge.opposite);
      pushCapTriangle(midpoint, edge.b, edge.opposite);
      return;
    }
    pushVertex(a, topHeightAt(a));
    pushVertex(b, topHeightAt(b));
    pushVertex(c, topHeightAt(c));
    pushVertex(c, bottomY);
    pushVertex(b, bottomY);
    pushVertex(a, bottomY);
  };

  triangles.forEach(([a, b, c]) => {
    pushCapTriangle(contour[a], contour[b], contour[c]);
  });
  for (let index = 0; index < contour.length; index += 1) {
    const next = (index + 1) % contour.length;
    const first = contour[index];
    const second = contour[next];
    pushVertex(first, bottomY);
    pushVertex(second, bottomY);
    pushVertex(second, topHeightAt(second));
    pushVertex(first, bottomY);
    pushVertex(second, topHeightAt(second));
    pushVertex(first, topHeightAt(first));
  }

  const solidGeometry = new THREE.BufferGeometry();
  solidGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  solidGeometry.computeVertexNormals();
  solidGeometry.computeBoundingBox();
  solidGeometry.computeBoundingSphere();
  return solidGeometry;
}

function polygonArea2(points) {
  return points.reduce((area, point, index) => {
    const next = points[(index + 1) % points.length];
    return area + point.x * next.y - next.x * point.y;
  }, 0) * 0.5;
}

function findFirstRenderableMesh(root) {
  let result = null;
  root.traverse((child) => {
    if (!result && child.isMesh && !child.userData.isEdgeOverlay) result = child;
  });
  return result;
}

function objectVisibleWithin(object, ancestor) {
  let current = object;
  while (current) {
    if (!current.visible) return false;
    if (current === ancestor) return true;
    current = current.parent;
  }
  return false;
}

function disposeGeneratedGroup(group) {
  [...group.children].forEach((child) => {
    child.geometry?.dispose?.();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.filter(Boolean).forEach((material) => material.dispose?.());
    group.remove(child);
  });
}

function createPointedArchPolyline(centerX, halfSpan, sideHeight, redHeight, greenOffset, greenHeight, segmentsPerArc = 32) {
  const redCenter = new THREE.Vector2(centerX, redHeight);
  const sidePoint = new THREE.Vector2(centerX + halfSpan, sideHeight);
  const oppositeGreenCenter = new THREE.Vector2(centerX - greenOffset, greenHeight);
  const redRadius = redCenter.distanceTo(sidePoint);
  const centersDistance = redCenter.distanceTo(oppositeGreenCenter);
  if (!Number.isFinite(redRadius) || redRadius <= 1e-5 || centersDistance <= 1e-5) return [];

  // The green circle internally contains the red circle. Their single tangent
  // point produces a continuous two-center arch without a kink.
  const greenRadius = redRadius + centersDistance;
  const tangentDirection = redCenter.clone().sub(oppositeGreenCenter).normalize();
  const tangentPoint = redCenter.clone().addScaledVector(tangentDirection, redRadius);
  if (greenRadius <= greenOffset + 1e-5) return [];
  const apexHeight = greenHeight + Math.sqrt(Math.max(0, greenRadius * greenRadius - greenOffset * greenOffset));
  const apexPoint = new THREE.Vector2(centerX, apexHeight);

  const redStartAngle = Math.atan2(sidePoint.y - redCenter.y, sidePoint.x - redCenter.x);
  const redTangentAngle = Math.atan2(tangentPoint.y - redCenter.y, tangentPoint.x - redCenter.x);
  const greenTangentAngle = Math.atan2(tangentPoint.y - oppositeGreenCenter.y, tangentPoint.x - oppositeGreenCenter.x);
  const greenApexAngle = Math.atan2(apexPoint.y - oppositeGreenCenter.y, apexPoint.x - oppositeGreenCenter.x);
  const redArc = sampleCircularArc(redCenter, redRadius, redStartAngle, redTangentAngle, segmentsPerArc);
  const greenArc = sampleCircularArc(oppositeGreenCenter, greenRadius, greenTangentAngle, greenApexAngle, segmentsPerArc);
  const rightHalf = [...redArc, ...greenArc.slice(1)];
  const leftHalf = rightHalf.map((point) => new THREE.Vector2(centerX * 2 - point.x, point.y));
  const apexToRight = [...rightHalf].reverse();
  return [...leftHalf, ...apexToRight.slice(1)];
}

function createPointedArchBrickMapping(centerX, halfSpan, sideHeight, redHeight, greenOffset, greenHeight, bandWidth = 0.2, straightTopY = Infinity, straightBottomY = -Infinity, straightOuterHalfWidth = Infinity, straightSideBandWidth = 0.2) {
  const redCenter = new THREE.Vector2(centerX, redHeight);
  const sidePoint = new THREE.Vector2(centerX + halfSpan, sideHeight);
  const greenCenter = new THREE.Vector2(centerX - greenOffset, greenHeight);
  const redRadius = redCenter.distanceTo(sidePoint);
  const centersDistance = redCenter.distanceTo(greenCenter);
  if (!Number.isFinite(redRadius) || redRadius <= 1e-5 || centersDistance <= 1e-5) return null;
  const greenRadius = redRadius + centersDistance;
  const tangentPoint = redCenter.clone().addScaledVector(redCenter.clone().sub(greenCenter).normalize(), redRadius);
  const apexY = greenHeight + Math.sqrt(Math.max(0, greenRadius * greenRadius - greenOffset * greenOffset));
  return {
    enabled: true,
    centerX,
    redHeight,
    greenOffset,
    greenHeight,
    redRadius,
    greenRadius,
    tangentX: tangentPoint.x,
    tangentY: tangentPoint.y,
    apexY,
    bandWidth: Math.max(0.01, Number(bandWidth) || 0.2),
    straightTopY: Number.isFinite(straightTopY) ? straightTopY : 1e6,
    straightBottomY: Number.isFinite(straightBottomY) ? straightBottomY : -1e6,
    straightInnerHalfWidth: Math.max(0.01, Number(halfSpan) || 0.01),
    straightOuterHalfWidth: Number.isFinite(straightOuterHalfWidth) ? straightOuterHalfWidth : 1e6,
    straightSideBandWidth: Math.max(0.01, Number(straightSideBandWidth) || 0.2),
  };
}

function sampleCircularArc(center, radius, startAngle, endAngle, segments) {
  let delta = endAngle - startAngle;
  while (delta <= -Math.PI) delta += Math.PI * 2;
  while (delta > Math.PI) delta -= Math.PI * 2;
  return Array.from({ length: segments + 1 }, (_, index) => {
    const angle = startAngle + delta * (index / segments);
    return new THREE.Vector2(center.x + Math.cos(angle) * radius, center.y + Math.sin(angle) * radius);
  });
}

function cloneWallState(walls = {}) {
  const brickPattern = normalizeWallBrickPattern(walls.brickPattern);
  const southOpenings = normalizeSouthOpenings(walls.southOpenings);
  return {
    ...walls,
    openSides: Array.isArray(walls.openSides) ? [...walls.openSides] : [],
    extraHeights: { ...(walls.extraHeights || {}) },
    sideOffsets: { ...(walls.sideOffsets || {}) },
    brickPattern: {
      ...brickPattern,
      bondPattern: normalizeWallBondPattern(brickPattern.bondPattern),
      sideBonds: Object.fromEntries(WALL_SIDES.map((side) => [side, normalizeWallBondPattern(brickPattern.sideBonds?.[side])])),
    },
    southOpenings: {
      door: { ...southOpenings.door },
      window: { ...southOpenings.window },
    },
    pointedArch: normalizePointedArch(walls.pointedArch),
    northWall: normalizeNorthWall(walls.northWall),
    northBoundary: normalizeNorthBoundary(walls.northBoundary),
    wallEdges: normalizeWallEdges(walls.wallEdges),
  };
}

function uniqueSortedNumbers(values) {
  return [...new Set(values.map((value) => Number(value.toFixed(6))))].sort((a, b) => a - b);
}

function attachEdgeOverlays(root, material, showVerticalLines = true) {
  ensureModuleEdgeOverlays(root, material, showVerticalLines);
}

function ensureModuleEdgeOverlays(root, material, showVerticalLines = true) {
  const meshes = [];
  root.traverse((child) => {
    if (child.isMesh && !child.userData.isEdgeOverlay) meshes.push(child);
  });
  meshes.forEach((mesh) => {
    const overlays = mesh.children.filter((child) => child.userData.isEdgeOverlay);
    if (!overlays.length) {
      attachEdgeOverlay(mesh, material, showVerticalLines);
      return;
    }
    overlays[0].material = material;
    overlays[0].visible = true;
    overlays.slice(1).forEach((overlay) => {
      mesh.remove(overlay);
      overlay.geometry.dispose();
    });
  });
}

function rebuildModuleEdgeOverlays(root, material, showVerticalLines = true) {
  const overlays = [];
  root.traverse((child) => {
    if (child.userData.isEdgeOverlay) overlays.push(child);
  });
  overlays.forEach((overlay) => {
    overlay.parent?.remove(overlay);
    overlay.geometry?.dispose?.();
  });
  ensureModuleEdgeOverlays(root, material, showVerticalLines);
}

function attachEdgeOverlay(mesh, material, showVerticalLines = true) {
  if (!mesh?.geometry?.attributes?.position || mesh.userData.isEdgeOverlay) return null;
  const existing = mesh.children.find((child) => child.userData.isEdgeOverlay);
  if (existing) {
    existing.material = material;
    existing.visible = true;
    return existing;
  }
  const edges = createFilteredEdgesGeometry(mesh.geometry, 24, showVerticalLines);
  if (!edges.attributes.position?.count) {
    edges.dispose();
    return null;
  }
  const geometry = new LineSegmentsGeometry().fromEdgesGeometry(edges);
  edges.dispose();
  const overlay = new LineSegments2(geometry, material);
  overlay.name = `${mesh.name || 'Geometry'} edges`;
  overlay.userData.isEdgeOverlay = true;
  if (mesh.userData.wallSide) overlay.userData.wallSide = mesh.userData.wallSide;
  overlay.renderOrder = 25;
  overlay.frustumCulled = false;
  overlay.computeLineDistances();
  mesh.add(overlay);
  return overlay;
}

function createFilteredEdgesGeometry(sourceGeometry, thresholdAngle = 24, showVerticalLines = true) {
  const edges = new THREE.EdgesGeometry(sourceGeometry, thresholdAngle);
  if (showVerticalLines || !edges.attributes.position?.count) return edges;
  const source = edges.attributes.position;
  const positions = [];
  const first = new THREE.Vector3();
  const second = new THREE.Vector3();
  for (let index = 0; index + 1 < source.count; index += 2) {
    first.fromBufferAttribute(source, index);
    second.fromBufferAttribute(source, index + 1);
    const deltaX = second.x - first.x;
    const deltaY = second.y - first.y;
    const deltaZ = second.z - first.z;
    const length = Math.hypot(deltaX, deltaY, deltaZ);
    const horizontalLength = Math.hypot(deltaX, deltaZ);
    const isStraightVertical = length > 1e-8 && horizontalLength <= Math.max(1e-7, length * 1e-5);
    if (isStraightVertical) continue;
    positions.push(first.x, first.y, first.z, second.x, second.y, second.z);
  }
  edges.dispose();
  const filtered = new THREE.BufferGeometry();
  filtered.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return filtered;
}

function attachMergedBoundaryEdgeOverlay(meshes, material, parent) {
  const positions = mergedBoundaryEdgePositions(meshes);
  if (!positions.length) return null;
  const geometry = new LineSegmentsGeometry();
  geometry.setPositions(positions);
  const overlay = new LineSegments2(geometry, material);
  overlay.name = 'South wall opening boundary edges';
  overlay.userData.isEdgeOverlay = true;
  overlay.userData.wallSide = 'south';
  overlay.renderOrder = 25;
  overlay.frustumCulled = false;
  overlay.computeLineDistances();
  parent.add(overlay);
  return overlay;
}

function mergedBoundaryEdgePositions(meshes) {
  const edgeMap = new Map();
  const pointKey = (point) => `${Math.round(point.x * 1e5)},${Math.round(point.y * 1e5)},${Math.round(point.z * 1e5)}`;
  meshes.forEach((mesh) => {
    mesh.updateMatrixWorld(true);
    const edges = new THREE.EdgesGeometry(mesh.geometry, 24);
    const positions = edges.attributes.position;
    for (let index = 0; index < positions.count; index += 2) {
      const first = new THREE.Vector3().fromBufferAttribute(positions, index).applyMatrix4(mesh.matrixWorld);
      const second = new THREE.Vector3().fromBufferAttribute(positions, index + 1).applyMatrix4(mesh.matrixWorld);
      const firstKey = pointKey(first);
      const secondKey = pointKey(second);
      const key = firstKey < secondKey ? `${firstKey}:${secondKey}` : `${secondKey}:${firstKey}`;
      const entry = edgeMap.get(key);
      if (entry) entry.count += 1;
      else edgeMap.set(key, { count: 1, first, second });
    }
    edges.dispose();
  });
  const positions = [];
  edgeMap.forEach(({ count, first, second }) => {
    if (count % 2 === 0) return;
    positions.push(first.x, first.y, first.z, second.x, second.y, second.z);
  });
  return positions;
}

function removeEdgeOverlays(root) {
  const overlays = [];
  root.traverse((child) => { if (child.userData.isEdgeOverlay) overlays.push(child); });
  overlays.forEach((overlay) => overlay.parent?.remove(overlay));
}

function disposeEdgeOverlayGeometries(root) {
  root.traverse((child) => {
    if (child.userData.isEdgeOverlay) child.geometry?.dispose?.();
  });
}

function setLineMaterialResolution(material, renderer) {
  if (!material || !renderer) return;
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  material.resolution.copy(size);
}

function setObjectWorldMatrix(object, worldMatrix) {
  const localMatrix = worldMatrix.clone();
  if (object.parent) {
    object.parent.updateMatrixWorld(true);
    localMatrix.premultiply(object.parent.matrixWorld.clone().invert());
  }
  localMatrix.decompose(object.position, object.quaternion, object.scale);
  object.updateMatrixWorld(true);
}

function projectedObjectRect(root, camera, canvasBounds) {
  const bounds = new THREE.Box3().setFromObject(root);
  if (bounds.isEmpty()) return null;
  const corners = [];
  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) corners.push(new THREE.Vector3(x, y, z).project(camera));
    }
  }
  const visible = corners.filter((point) => point.z >= -1 && point.z <= 1);
  if (!visible.length) return null;
  const screenPoints = visible.map((point) => ({
    x: canvasBounds.left + (point.x + 1) * 0.5 * canvasBounds.width,
    y: canvasBounds.top + (1 - point.y) * 0.5 * canvasBounds.height,
  }));
  return {
    left: Math.min(...screenPoints.map((point) => point.x)),
    right: Math.max(...screenPoints.map((point) => point.x)),
    top: Math.min(...screenPoints.map((point) => point.y)),
    bottom: Math.max(...screenPoints.map((point) => point.y)),
  };
}

function rectanglesIntersect(first, second) {
  return first.left <= second.right && first.right >= second.left && first.top <= second.bottom && first.bottom >= second.top;
}

function createMiniRenderer(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.userData = {};
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.toneMappingExposure = 1;
  if ('physicallyCorrectLights' in renderer) renderer.physicallyCorrectLights = false;
  container?.appendChild(renderer.domElement);
  return renderer;
}

function viewDisplayName(view) {
  return { perspective: 'Perspective view', front: 'Front view', top: 'Top view' }[view] || 'View';
}

function resizeMiniRenderer(renderer, container) {
  if (!renderer || !container) return;
  const width = Math.max(1, Math.round(container.clientWidth));
  const height = Math.max(1, Math.round(container.clientHeight));
  if (renderer.userData.viewportWidth === width && renderer.userData.viewportHeight === height) return;
  renderer.userData.viewportWidth = width;
  renderer.userData.viewportHeight = height;
  renderer.setSize(width, height, false);
}

function fitOrthographicCamera(camera, bounds, container, view, padding = 1.28) {
  if (!camera || !container) return;
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const aspect = Math.max(0.2, container.clientWidth / Math.max(1, container.clientHeight));
  const contentWidth = Math.max(0.5, size.x * padding);
  const contentHeight = Math.max(0.5, (view === 'top' ? size.z : size.y) * padding);
  const halfHeight = Math.max(contentHeight / 2, contentWidth / (2 * aspect));
  camera.left = -halfHeight * aspect;
  camera.right = halfHeight * aspect;
  camera.top = halfHeight;
  camera.bottom = -halfHeight;
  camera.near = 0.01;
  camera.far = 500;
  const distance = Math.max(8, Math.max(size.x, size.y, size.z) * 5);
  if (view === 'top') {
    camera.up.set(0, 0, -1);
    camera.position.set(center.x, center.y + distance, center.z);
  } else {
    camera.up.set(0, 1, 0);
    camera.position.set(center.x, center.y, center.z + distance);
  }
  camera.lookAt(center);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
}

function levelRedColor(index, count) {
  const lightness = 0.3 + (index / Math.max(1, count - 1)) * 0.36;
  return new THREE.Color().setHSL(0.01, 0.68, lightness);
}

function prepareObject(object) {
  object.traverse((child) => {
    if (!child.isMesh || child.userData.isEdgeOverlay || child.userData.isNorthBoundary) return;
    if (!child.material) child.material = new THREE.MeshStandardMaterial({ color: 0x315d55, roughness: 0.55 });
    child.castShadow = true;
    child.receiveShadow = true;
    child.geometry?.computeVertexNormals?.();
  });
}

function materialPreset(material) {
  return {
    matte: { roughness: 0.78, metalness: 0 },
    glossy: { roughness: 0.18, metalness: 0 },
    metallic: { roughness: 0.26, metalness: 0.78 },
    stone: { roughness: 0.95, metalness: 0 },
  }[material] || { roughness: 0.78, metalness: 0 };
}

function wallBondUniformData(pattern) {
  const current = normalizeWallBrickPattern(pattern);
  const offsets = new Float32Array(MAX_BOND_COURSES);
  const widths = new Float32Array(MAX_BOND_COURSES * MAX_BOND_BRICKS_PER_COURSE);
  const periods = new Float32Array(MAX_BOND_COURSES);
  const courses = Array.isArray(current.bondPattern?.courses) ? current.bondPattern.courses : [];
  courses.forEach((course, courseIndex) => {
    offsets[courseIndex] = course.offset * (current.brickWidth + current.mortar);
    let period = 0;
    course.bricks.forEach((width, brickIndex) => {
      const actualWidth = width * current.brickWidth;
      widths[courseIndex * MAX_BOND_BRICKS_PER_COURSE + brickIndex] = actualWidth;
      period += actualWidth + current.mortar;
    });
    periods[courseIndex] = Math.max(0.001, period);
  });
  return {
    courseCount: courses.length,
    offsets,
    widths,
    periods,
  };
}

function configureWallBrickMaterial(material, pattern, archMapping = null, openingMapping = null, decorativeFace = null) {
  if (!material) return;
  material.userData.wallBrickPattern = normalizeWallBrickPattern(pattern);
  material.userData.wallBrickArchMapping = archMapping;
  material.userData.wallBrickOpeningMapping = openingMapping;
  material.userData.wallBrickDecorativeFace = decorativeFace;
  material.userData.wallBrickConfigured = true;
  material.onBeforeCompile = (shader) => {
    const current = normalizeWallBrickPattern(material.userData.wallBrickPattern);
    const bond = wallBondUniformData(current);
    const exactPattern = current.bondPattern?.version === 2 ? current.bondPattern : null;
    const renderedExactTexture = createExactWallPatternTexture(exactPattern, current);
    const exactTexture = renderedExactTexture || createWallPatternFallbackTexture();
    material.userData.wallBrickPatternTexture?.dispose?.();
    material.userData.wallBrickPatternTexture = exactTexture;
    material.userData.wallBrickHasExactPattern = Boolean(renderedExactTexture);
    const arch = material.userData.wallBrickArchMapping;
    const openings = material.userData.wallBrickOpeningMapping;
    const face = material.userData.wallBrickDecorativeFace;
    const openingRect = (opening) => new THREE.Vector4(
      opening?.minX || 0,
      opening?.maxX || 0,
      opening?.minY || 0,
      opening?.maxY || 0,
    );
    shader.uniforms.wallBrickEnabled = { value: current.enabled ? 1 : 0 };
    shader.uniforms.wallBrickWidth = { value: current.brickWidth };
    shader.uniforms.wallBrickHeight = { value: current.brickHeight };
    shader.uniforms.wallBrickMortar = { value: current.mortar };
    shader.uniforms.wallBrickMortarColor = { value: new THREE.Color(current.mortarColor) };
    shader.uniforms.wallBrickBondCourseCount = { value: bond.courseCount };
    shader.uniforms.wallBrickBondOffsets = { value: bond.offsets };
    shader.uniforms.wallBrickBondWidths = { value: bond.widths };
    shader.uniforms.wallBrickBondPeriods = { value: bond.periods };
    shader.uniforms.wallBrickExactEnabled = { value: renderedExactTexture ? 1 : 0 };
    shader.uniforms.wallBrickExactMap = { value: exactTexture };
    shader.uniforms.wallBrickExactWorldSize = { value: new THREE.Vector2(
      Math.max(0.001, (exactPattern?.columns || 1) * current.brickWidth / 4 * (exactPattern?.scale || 1)),
      Math.max(0.001, (exactPattern?.rows || 1) * current.brickHeight * (exactPattern?.scale || 1)),
    ) };
    shader.uniforms.wallBrickArchEnabled = { value: arch?.enabled === true ? 1 : 0 };
    shader.uniforms.wallBrickArchCenterX = { value: arch?.centerX || 0 };
    shader.uniforms.wallBrickArchRedHeight = { value: arch?.redHeight || 0 };
    shader.uniforms.wallBrickArchGreenOffset = { value: arch?.greenOffset || 0 };
    shader.uniforms.wallBrickArchGreenHeight = { value: arch?.greenHeight || 0 };
    shader.uniforms.wallBrickArchRedRadius = { value: arch?.redRadius || 1 };
    shader.uniforms.wallBrickArchGreenRadius = { value: arch?.greenRadius || 1 };
    shader.uniforms.wallBrickArchTangentX = { value: arch?.tangentX || 0 };
    shader.uniforms.wallBrickArchTangentY = { value: arch?.tangentY || 0 };
    shader.uniforms.wallBrickArchApexY = { value: arch?.apexY || 0 };
    shader.uniforms.wallBrickArchBandWidth = { value: arch?.bandWidth || 0.2 };
    shader.uniforms.wallBrickStraightTopY = { value: arch?.straightTopY ?? 1e6 };
    shader.uniforms.wallBrickStraightBottomY = { value: arch?.straightBottomY ?? -1e6 };
    shader.uniforms.wallBrickStraightInnerHalfWidth = { value: arch?.straightInnerHalfWidth ?? 1e6 };
    shader.uniforms.wallBrickStraightOuterHalfWidth = { value: arch?.straightOuterHalfWidth ?? 1e6 };
    shader.uniforms.wallBrickStraightSideBandWidth = { value: arch?.straightSideBandWidth || 0.2 };
    shader.uniforms.wallBrickOpeningsEnabled = { value: openings?.enabled === true ? 1 : 0 };
    shader.uniforms.wallBrickSouthZ = { value: openings?.wallZ || 0 };
    shader.uniforms.wallBrickSouthHalfThickness = { value: openings?.halfThickness || 0 };
    shader.uniforms.wallBrickDoorEnabled = { value: openings?.door ? 1 : 0 };
    shader.uniforms.wallBrickDoorRect = { value: openingRect(openings?.door) };
    shader.uniforms.wallBrickWindowEnabled = { value: openings?.window ? 1 : 0 };
    shader.uniforms.wallBrickWindowRect = { value: openingRect(openings?.window) };
    shader.uniforms.wallBrickDecorativeAxis = { value: face?.axis === 'x' ? 1 : face?.axis === 'z' ? 2 : 0 };
    shader.uniforms.wallBrickDecorativeSign = { value: Number(face?.sign) < 0 ? -1 : 1 };
    material.userData.wallBrickUniforms = shader.uniforms;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWallBrickWorldPosition;\nvarying vec3 vWallBrickWorldNormal;')
      .replace('#include <defaultnormal_vertex>', '#include <defaultnormal_vertex>\nvWallBrickWorldNormal = normalize(mat3(modelMatrix) * objectNormal);')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWallBrickWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWallBrickWorldPosition;
varying vec3 vWallBrickWorldNormal;
uniform float wallBrickEnabled;
uniform float wallBrickWidth;
uniform float wallBrickHeight;
uniform float wallBrickMortar;
uniform vec3 wallBrickMortarColor;
uniform int wallBrickBondCourseCount;
uniform float wallBrickBondOffsets[${MAX_BOND_COURSES}];
uniform float wallBrickBondWidths[${MAX_BOND_COURSES * MAX_BOND_BRICKS_PER_COURSE}];
uniform float wallBrickBondPeriods[${MAX_BOND_COURSES}];
uniform float wallBrickExactEnabled;
uniform sampler2D wallBrickExactMap;
uniform vec2 wallBrickExactWorldSize;
uniform float wallBrickArchEnabled;
uniform float wallBrickArchCenterX;
uniform float wallBrickArchRedHeight;
uniform float wallBrickArchGreenOffset;
uniform float wallBrickArchGreenHeight;
uniform float wallBrickArchRedRadius;
uniform float wallBrickArchGreenRadius;
uniform float wallBrickArchTangentX;
uniform float wallBrickArchTangentY;
uniform float wallBrickArchApexY;
uniform float wallBrickArchBandWidth;
uniform float wallBrickStraightTopY;
uniform float wallBrickStraightBottomY;
uniform float wallBrickStraightInnerHalfWidth;
uniform float wallBrickStraightOuterHalfWidth;
uniform float wallBrickStraightSideBandWidth;
uniform float wallBrickOpeningsEnabled;
uniform float wallBrickSouthZ;
uniform float wallBrickSouthHalfThickness;
uniform float wallBrickDoorEnabled;
uniform vec4 wallBrickDoorRect;
uniform float wallBrickWindowEnabled;
uniform vec4 wallBrickWindowRect;
uniform int wallBrickDecorativeAxis;
uniform float wallBrickDecorativeSign;
float wallBrickHash(vec2 point) {
  return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453123);
}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
if (wallBrickEnabled > 0.5) {
  vec3 derivativeX = dFdx(vWallBrickWorldPosition);
  vec3 derivativeY = dFdy(vWallBrickWorldPosition);
  vec3 faceDirection = abs(normalize(cross(derivativeX, derivativeY)));
  vec3 signedFaceDirection = normalize(vWallBrickWorldNormal);
  bool onDecorativeFace = wallBrickDecorativeAxis == 0
    || (wallBrickDecorativeAxis == 1 && signedFaceDirection.x * wallBrickDecorativeSign > 0.85)
    || (wallBrickDecorativeAxis == 2 && signedFaceDirection.z * wallBrickDecorativeSign > 0.85);
  vec2 surfacePosition;
  bool useArchMapping = false;
  bool useWholeStraightBand = false;
  bool useOpeningSoldierCourse = false;
  float openingCourseDepth = wallBrickWidth + wallBrickMortar;
  bool onSouthWallFace = wallBrickOpeningsEnabled > 0.5
    && faceDirection.z >= max(faceDirection.x, faceDirection.y)
    && abs(vWallBrickWorldPosition.z - wallBrickSouthZ) <= wallBrickSouthHalfThickness + 0.01;
  if (onSouthWallFace && wallBrickDoorEnabled > 0.5
      && vWallBrickWorldPosition.x >= wallBrickDoorRect.x
      && vWallBrickWorldPosition.x <= wallBrickDoorRect.y
      && vWallBrickWorldPosition.y >= wallBrickDoorRect.w
      && vWallBrickWorldPosition.y <= wallBrickDoorRect.w + openingCourseDepth) {
    surfacePosition = vec2(
      vWallBrickWorldPosition.y - wallBrickDoorRect.w,
      vWallBrickWorldPosition.x - wallBrickDoorRect.x
    );
    useOpeningSoldierCourse = true;
  } else if (onSouthWallFace && wallBrickWindowEnabled > 0.5
      && vWallBrickWorldPosition.x >= wallBrickWindowRect.x
      && vWallBrickWorldPosition.x <= wallBrickWindowRect.y
      && vWallBrickWorldPosition.y >= wallBrickWindowRect.w
      && vWallBrickWorldPosition.y <= wallBrickWindowRect.w + openingCourseDepth) {
    surfacePosition = vec2(
      vWallBrickWorldPosition.y - wallBrickWindowRect.w,
      vWallBrickWorldPosition.x - wallBrickWindowRect.x
    );
    useOpeningSoldierCourse = true;
  } else if (onSouthWallFace && wallBrickWindowEnabled > 0.5
      && vWallBrickWorldPosition.x >= wallBrickWindowRect.x
      && vWallBrickWorldPosition.x <= wallBrickWindowRect.y
      && vWallBrickWorldPosition.y <= wallBrickWindowRect.z
      && vWallBrickWorldPosition.y >= wallBrickWindowRect.z - openingCourseDepth) {
    surfacePosition = vec2(
      wallBrickWindowRect.z - vWallBrickWorldPosition.y,
      vWallBrickWorldPosition.x - wallBrickWindowRect.x
    );
    useOpeningSoldierCourse = true;
  }
  if (!useOpeningSoldierCourse && wallBrickArchEnabled > 0.5) {
    float sideDirection = vWallBrickWorldPosition.x < wallBrickArchCenterX ? -1.0 : 1.0;
    vec2 archPoint = vec2(wallBrickArchCenterX + abs(vWallBrickWorldPosition.x - wallBrickArchCenterX), vWallBrickWorldPosition.y);
    vec2 redCenter = vec2(wallBrickArchCenterX, wallBrickArchRedHeight);
    vec2 greenCenter = vec2(wallBrickArchCenterX - wallBrickArchGreenOffset, wallBrickArchGreenHeight);
    float redDistance = length(archPoint - redCenter);
    float greenDistance = length(archPoint - greenCenter);
    float redCurveDistance = abs(redDistance - wallBrickArchRedRadius);
    float greenCurveDistance = abs(greenDistance - wallBrickArchGreenRadius);
    float apexAngle = atan(wallBrickArchApexY - wallBrickArchGreenHeight, wallBrickArchGreenOffset);
    float greenTangentAngle = atan(wallBrickArchTangentY - wallBrickArchGreenHeight, wallBrickArchTangentX - (wallBrickArchCenterX - wallBrickArchGreenOffset));
    float redTangentAngle = atan(wallBrickArchTangentY - wallBrickArchRedHeight, wallBrickArchTangentX - wallBrickArchCenterX);
    float greenSegmentLength = wallBrickArchGreenRadius * abs(apexAngle - greenTangentAngle);
    float redCurrentAngle = atan(archPoint.y - wallBrickArchRedHeight, archPoint.x - wallBrickArchCenterX);
    float greenCurrentAngle = atan(archPoint.y - wallBrickArchGreenHeight, archPoint.x - (wallBrickArchCenterX - wallBrickArchGreenOffset));
    bool onRedArc = redCurrentAngle >= -0.0001 && redCurrentAngle <= redTangentAngle + 0.0001;
    bool onGreenArc = greenCurrentAngle >= greenTangentAngle - 0.0001 && greenCurrentAngle <= apexAngle + 0.0001;
    float validRedDistance = onRedArc ? redCurveDistance : 1e6;
    float validGreenDistance = onGreenArc ? greenCurveDistance : 1e6;
    useArchMapping = min(validRedDistance, validGreenDistance) <= wallBrickArchBandWidth + wallBrickMortar * 1.5;
    float radialDistance;
    float curveLength;
    if (validGreenDistance <= validRedDistance) {
      radialDistance = validGreenDistance;
      curveLength = wallBrickArchGreenRadius * abs(apexAngle - greenCurrentAngle);
    } else {
      radialDistance = validRedDistance;
      curveLength = greenSegmentLength + wallBrickArchRedRadius * abs(redTangentAngle - redCurrentAngle);
    }
    if (useArchMapping) surfacePosition = vec2(radialDistance, curveLength * sideDirection);
  }
  if (!useOpeningSoldierCourse && !useArchMapping && wallBrickArchEnabled > 0.5 && faceDirection.z >= faceDirection.x
      && (vWallBrickWorldPosition.y >= wallBrickStraightTopY || vWallBrickWorldPosition.y <= wallBrickStraightBottomY)) {
    // Map the complete top or bottom band to one brick length. This prevents
    // a world-space mortar interval from splitting the narrow raised ring.
    float distanceAcrossBand = vWallBrickWorldPosition.y >= wallBrickStraightTopY
      ? vWallBrickWorldPosition.y - wallBrickStraightTopY
      : wallBrickStraightBottomY - vWallBrickWorldPosition.y;
    surfacePosition = vec2(
      clamp(distanceAcrossBand / wallBrickStraightSideBandWidth, 0.0, 1.0) * wallBrickWidth,
      vWallBrickWorldPosition.x
    );
    useWholeStraightBand = true;
  } else if (!useOpeningSoldierCourse && !useArchMapping && wallBrickArchEnabled > 0.5 && faceDirection.z >= faceDirection.x
      && abs(vWallBrickWorldPosition.x - wallBrickArchCenterX) >= wallBrickStraightOuterHalfWidth - wallBrickStraightSideBandWidth - 0.0001
      && abs(vWallBrickWorldPosition.x - wallBrickArchCenterX) <= wallBrickStraightOuterHalfWidth + 0.0001) {
    // Fit one complete brick length across each vertical side strip. Mapping
    // the exact band width to the brick length prevents clipped end bricks.
    float distanceFromOuterEdge = wallBrickStraightOuterHalfWidth - abs(vWallBrickWorldPosition.x - wallBrickArchCenterX);
    surfacePosition = vec2(
      clamp(distanceFromOuterEdge / wallBrickStraightSideBandWidth, 0.0, 1.0) * wallBrickWidth,
      vWallBrickWorldPosition.y
    );
    useWholeStraightBand = true;
  } else if (!useOpeningSoldierCourse && !useArchMapping && wallBrickArchEnabled > 0.5 && faceDirection.z >= faceDirection.x
      && vWallBrickWorldPosition.y <= wallBrickArchRedHeight + 0.0001
      && abs(vWallBrickWorldPosition.x - wallBrickArchCenterX) >= wallBrickStraightInnerHalfWidth - 0.0001
      && abs(vWallBrickWorldPosition.x - wallBrickArchCenterX) <= wallBrickStraightInnerHalfWidth + wallBrickStraightSideBandWidth + 0.0001) {
    // The two straight jambs below the curved arch are part of the same raised
    // ring. Fit one complete brick length across each jamb so running-bond
    // offsets cannot introduce a clipped brick or a vertical mortar split.
    float distanceFromOpeningEdge = abs(vWallBrickWorldPosition.x - wallBrickArchCenterX) - wallBrickStraightInnerHalfWidth;
    surfacePosition = vec2(
      clamp(distanceFromOpeningEdge / wallBrickStraightSideBandWidth, 0.0, 1.0) * wallBrickWidth,
      vWallBrickWorldPosition.y
    );
    useWholeStraightBand = true;
  } else if (!useOpeningSoldierCourse && !useArchMapping && faceDirection.y > max(faceDirection.x, faceDirection.z)) {
    surfacePosition = vWallBrickWorldPosition.xz;
  } else if (!useOpeningSoldierCourse && !useArchMapping && faceDirection.x > faceDirection.z) {
    surfacePosition = vec2(vWallBrickWorldPosition.z, vWallBrickWorldPosition.y);
  } else if (!useOpeningSoldierCourse && !useArchMapping) {
    surfacePosition = vWallBrickWorldPosition.xy;
  }
  float cellWidth = max(0.001, wallBrickWidth + wallBrickMortar);
  float cellHeight = max(0.001, wallBrickHeight + wallBrickMortar);
  bool useExactPattern = wallBrickExactEnabled > 0.5
    && onDecorativeFace && !useWholeStraightBand && !useOpeningSoldierCourse && !useArchMapping;
  if (useExactPattern) {
    vec2 exactUv = fract(surfacePosition / wallBrickExactWorldSize);
    diffuseColor.rgb = texture2D(wallBrickExactMap, exactUv).rgb;
  } else {
  float row = floor(surfacePosition.y / cellHeight);
  float courseY = mod(surfacePosition.y, cellHeight);
  float antialiasX = max(fwidth(surfacePosition.x), 0.00035);
  float antialiasY = max(fwidth(courseY), 0.00035);
  bool useDesignedBond = onDecorativeFace && !useWholeStraightBand && !useOpeningSoldierCourse && !useArchMapping && wallBrickBondCourseCount > 0;
  float column = 0.0;
  float verticalJoint = 0.0;
  if (useDesignedBond) {
    int courseIndex = int(mod(mod(row, float(wallBrickBondCourseCount)) + float(wallBrickBondCourseCount), float(wallBrickBondCourseCount)));
    float period = max(0.001, wallBrickBondPeriods[courseIndex]);
    float courseX = mod(surfacePosition.x + wallBrickBondOffsets[courseIndex], period);
    float cursor = 0.0;
    for (int brickIndex = 0; brickIndex < ${MAX_BOND_BRICKS_PER_COURSE}; brickIndex++) {
      int flatIndex = courseIndex * ${MAX_BOND_BRICKS_PER_COURSE} + brickIndex;
      float designedWidth = wallBrickBondWidths[flatIndex];
      if (designedWidth > 0.0001) {
        float cellEnd = cursor + designedWidth + wallBrickMortar;
        if (courseX >= cursor && courseX < cellEnd) {
          verticalJoint = smoothstep(designedWidth - antialiasX, designedWidth + antialiasX, courseX - cursor);
          column = float(flatIndex);
        }
        cursor = cellEnd;
      }
    }
  } else {
    float shiftedX = surfacePosition.x + ((!onDecorativeFace && mod(row, 2.0) >= 1.0) ? cellWidth * 0.5 : 0.0);
    column = floor(shiftedX / cellWidth);
    float cellX = mod(shiftedX, cellWidth);
    verticalJoint = useWholeStraightBand
      ? 0.0
      : smoothstep(wallBrickWidth - antialiasX, wallBrickWidth + antialiasX, cellX);
  }
  float horizontalJoint = smoothstep(wallBrickHeight - antialiasY, wallBrickHeight + antialiasY, courseY);
  float mortarMask = max(verticalJoint, horizontalJoint);
  float brickVariation = mix(0.94, 1.04, wallBrickHash(vec2(column, row)));
  vec3 brickColor = diffuseColor.rgb * brickVariation;
  diffuseColor.rgb = mix(brickColor, wallBrickMortarColor, mortarMask);
  }
}`);
  };
  material.customProgramCacheKey = () => 'muqarnas-world-brick-v12-per-wall-faces';
  material.needsUpdate = true;
}

function updateWallBrickMaterial(material, pattern, archMapping = null, openingMapping = null, decorativeFace = null) {
  if (!material?.userData?.wallBrickConfigured) {
    configureWallBrickMaterial(material, pattern, archMapping, openingMapping, decorativeFace);
    return;
  }
  const current = normalizeWallBrickPattern(pattern);
  material.userData.wallBrickPattern = current;
  material.userData.wallBrickArchMapping = archMapping;
  material.userData.wallBrickOpeningMapping = openingMapping;
  material.userData.wallBrickDecorativeFace = decorativeFace;
  const uniforms = material.userData.wallBrickUniforms;
  if (!uniforms) return;
  uniforms.wallBrickEnabled.value = current.enabled ? 1 : 0;
  uniforms.wallBrickWidth.value = current.brickWidth;
  uniforms.wallBrickHeight.value = current.brickHeight;
  uniforms.wallBrickMortar.value = current.mortar;
  uniforms.wallBrickMortarColor.value.set(current.mortarColor);
  const bond = wallBondUniformData(current);
  uniforms.wallBrickBondCourseCount.value = bond.courseCount;
  uniforms.wallBrickBondOffsets.value.set(bond.offsets);
  uniforms.wallBrickBondWidths.value.set(bond.widths);
  uniforms.wallBrickBondPeriods.value.set(bond.periods);
  const exactPattern = current.bondPattern?.version === 2 ? current.bondPattern : null;
  uniforms.wallBrickExactEnabled.value = exactPattern && material.userData.wallBrickHasExactPattern ? 1 : 0;
  uniforms.wallBrickExactWorldSize.value.set(
    Math.max(0.001, (exactPattern?.columns || 1) * current.brickWidth / 4 * (exactPattern?.scale || 1)),
    Math.max(0.001, (exactPattern?.rows || 1) * current.brickHeight * (exactPattern?.scale || 1)),
  );
  uniforms.wallBrickArchEnabled.value = archMapping?.enabled === true ? 1 : 0;
  uniforms.wallBrickArchCenterX.value = archMapping?.centerX || 0;
  uniforms.wallBrickArchRedHeight.value = archMapping?.redHeight || 0;
  uniforms.wallBrickArchGreenOffset.value = archMapping?.greenOffset || 0;
  uniforms.wallBrickArchGreenHeight.value = archMapping?.greenHeight || 0;
  uniforms.wallBrickArchRedRadius.value = archMapping?.redRadius || 1;
  uniforms.wallBrickArchGreenRadius.value = archMapping?.greenRadius || 1;
  uniforms.wallBrickArchTangentX.value = archMapping?.tangentX || 0;
  uniforms.wallBrickArchTangentY.value = archMapping?.tangentY || 0;
  uniforms.wallBrickArchApexY.value = archMapping?.apexY || 0;
  uniforms.wallBrickArchBandWidth.value = archMapping?.bandWidth || 0.2;
  uniforms.wallBrickStraightTopY.value = archMapping?.straightTopY ?? 1e6;
  uniforms.wallBrickStraightBottomY.value = archMapping?.straightBottomY ?? -1e6;
  uniforms.wallBrickStraightInnerHalfWidth.value = archMapping?.straightInnerHalfWidth ?? 1e6;
  uniforms.wallBrickStraightOuterHalfWidth.value = archMapping?.straightOuterHalfWidth ?? 1e6;
  uniforms.wallBrickStraightSideBandWidth.value = archMapping?.straightSideBandWidth || 0.2;
  uniforms.wallBrickOpeningsEnabled.value = openingMapping?.enabled === true ? 1 : 0;
  uniforms.wallBrickSouthZ.value = openingMapping?.wallZ || 0;
  uniforms.wallBrickSouthHalfThickness.value = openingMapping?.halfThickness || 0;
  uniforms.wallBrickDoorEnabled.value = openingMapping?.door ? 1 : 0;
  uniforms.wallBrickDoorRect.value.set(
    openingMapping?.door?.minX || 0,
    openingMapping?.door?.maxX || 0,
    openingMapping?.door?.minY || 0,
    openingMapping?.door?.maxY || 0,
  );
  uniforms.wallBrickWindowEnabled.value = openingMapping?.window ? 1 : 0;
  uniforms.wallBrickWindowRect.value.set(
    openingMapping?.window?.minX || 0,
    openingMapping?.window?.maxX || 0,
    openingMapping?.window?.minY || 0,
    openingMapping?.window?.maxY || 0,
  );
  uniforms.wallBrickDecorativeAxis.value = decorativeFace?.axis === 'x' ? 1 : decorativeFace?.axis === 'z' ? 2 : 0;
  uniforms.wallBrickDecorativeSign.value = Number(decorativeFace?.sign) < 0 ? -1 : 1;
}

function exportMaterialPreset(material) {
  return {
    matte: { roughness: 0.62, metalness: 0, clearcoat: 0.08, clearcoatRoughness: 0.55, sheen: 0.08, sheenRoughness: 0.8, sheenColor: '#fff1d1', envMapIntensity: 0.72 },
    glossy: { roughness: 0.12, metalness: 0, clearcoat: 0.9, clearcoatRoughness: 0.08, sheen: 0.12, sheenRoughness: 0.28, sheenColor: '#ffffff', envMapIntensity: 1.25 },
    metallic: { roughness: 0.2, metalness: 0.72, clearcoat: 0.24, clearcoatRoughness: 0.14, sheen: 0, sheenRoughness: 1, sheenColor: '#ffffff', envMapIntensity: 1.7 },
    stone: { roughness: 0.9, metalness: 0, clearcoat: 0.015, clearcoatRoughness: 0.95, sheen: 0.04, sheenRoughness: 0.92, sheenColor: '#d8cbb4', envMapIntensity: 0.42 },
  }[material] || { roughness: 0.62, metalness: 0, clearcoat: 0.08, clearcoatRoughness: 0.55, sheen: 0.08, sheenRoughness: 0.8, sheenColor: '#fff1d1', envMapIntensity: 0.72 };
}

function applyAppearanceToObject(object, appearance, globalMaterial = 'matte') {
  object.visible = appearance.visible !== false;
  const preset = GIRIH_STAGE_MATERIAL;
  object.traverse((child) => {
    if (!child.isMesh || child.userData.isEdgeOverlay) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.filter(Boolean).forEach((material) => {
      preserveAndHideStageTextures(material);
      material.color?.set?.(appearance.color);
      if ('roughness' in material) material.roughness = preset.roughness;
      if ('metalness' in material) material.metalness = preset.metalness;
      material.transparent = false;
      material.opacity = 1;
      material.depthWrite = true;
      material.side = THREE.FrontSide;
      material.vertexColors = false;
      if ('clearcoat' in material) material.clearcoat = 0;
      if ('clearcoatRoughness' in material) material.clearcoatRoughness = 0;
      if ('transmission' in material) material.transmission = 0;
      if ('thickness' in material) material.thickness = 0;
      material.emissive?.set?.('#000000');
      if ('emissiveIntensity' in material) material.emissiveIntensity = 0;
      material.needsUpdate = true;
    });
  });
}

function preserveAndHideStageTextures(material) {
  if (!material) return;
  if (!ORIGINAL_MATERIAL_TEXTURES.has(material)) {
    ORIGINAL_MATERIAL_TEXTURES.set(material, Object.fromEntries(STAGE_TEXTURE_SLOTS.map((slot) => [slot, material[slot] || null])));
  }
  STAGE_TEXTURE_SLOTS.forEach((slot) => {
    if (slot in material) material[slot] = null;
  });
}

function cloneStageMaterial(material) {
  if (!material?.clone) return material;
  const clone = material.clone();
  const sourceTextures = ORIGINAL_MATERIAL_TEXTURES.get(material);
  if (sourceTextures) ORIGINAL_MATERIAL_TEXTURES.set(clone, { ...sourceTextures });
  preserveAndHideStageTextures(clone);
  return clone;
}

function originalMaterialTexture(material, slot) {
  return ORIGINAL_MATERIAL_TEXTURES.get(material)?.[slot] || material?.[slot] || null;
}

function convertZUpToYUp(object) {
  const axisConversion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  object.quaternion.premultiply(axisConversion);
  object.updateMatrixWorld(true);
}

function scaleObjectUniformlyToHeight(object, targetHeight) {
  object.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(object);
  if (bounds.isEmpty()) return;
  const currentHeight = bounds.getSize(new THREE.Vector3()).y;
  if (!Number.isFinite(currentHeight) || currentHeight <= 0) return;
  const uniformScale = Number(targetHeight) / currentHeight;
  object.scale.multiplyScalar(uniformScale);
  object.updateMatrixWorld(true);
}

function normalizeObject(object) {
  object.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(object);
  if (bounds.isEmpty()) return;
  const size = bounds.getSize(new THREE.Vector3());
  const scale = 2 / Math.max(size.x, size.y, size.z, 0.0001);
  object.scale.multiplyScalar(scale);
  object.updateMatrixWorld(true);
  const normalizedBounds = new THREE.Box3().setFromObject(object);
  const center = normalizedBounds.getCenter(new THREE.Vector3());
  object.position.x -= center.x;
  object.position.y -= normalizedBounds.min.y;
  object.position.z -= center.z;
  object.updateMatrixWorld(true);
}

function centerObjectOnFloor(object) {
  object.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(object);
  if (bounds.isEmpty()) return;
  const center = bounds.getCenter(new THREE.Vector3());
  object.position.x -= center.x;
  object.position.y -= bounds.min.y;
  object.position.z -= center.z;
  object.updateMatrixWorld(true);
}

function createFootprintOutlineGeometry(connectors) {
  const points = [];
  connectors.filter((connector) => connector.kind === 'face').forEach((connector) => {
    const halfEdge = connector.tangent.clone().multiplyScalar(connector.length * 0.5);
    points.push(connector.position.clone().sub(halfEdge), connector.position.clone().add(halfEdge));
  });
  return new THREE.BufferGeometry().setFromPoints(points);
}

function createFootprintPrismGeometry(connectors) {
  const points = [];
  connectors.forEach((connector) => {
    const halfEdge = connector.tangent.clone().multiplyScalar(connector.length * 0.5);
    const start = connector.position.clone().sub(halfEdge);
    const end = connector.position.clone().add(halfEdge);
    const bottomStart = new THREE.Vector3(start.x, connector.minY, start.z);
    const bottomEnd = new THREE.Vector3(end.x, connector.minY, end.z);
    const topStart = new THREE.Vector3(start.x, connector.maxY, start.z);
    const topEnd = new THREE.Vector3(end.x, connector.maxY, end.z);
    points.push(
      bottomStart, bottomEnd,
      topStart, topEnd,
      bottomStart, topStart,
      bottomEnd, topEnd,
    );
  });
  return new THREE.BufferGeometry().setFromPoints(points);
}

function worldSnapFace(root, connector) {
  root.updateMatrixWorld(true);
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(root.matrixWorld);
  const linearMatrix = new THREE.Matrix3().setFromMatrix4(root.matrixWorld);
  const normal = connector.normal.clone().applyMatrix3(normalMatrix);
  const tangent = connector.tangent.clone().applyMatrix3(linearMatrix);
  normal.y = 0;
  tangent.y = 0;
  if (normal.lengthSq() < 1e-12 || tangent.lengthSq() < 1e-12) return null;
  const span = connector.length * tangent.length();
  normal.normalize();
  tangent.normalize();
  const center = root.localToWorld(connector.position.clone());
  const halfEdge = tangent.clone().multiplyScalar(span * 0.5);
  return {
    connector,
    center,
    normal,
    tangent,
    span,
    edges: [center.clone().sub(halfEdge), center.clone().add(halfEdge)],
  };
}

function signedYawBetween(from, to) {
  return Math.atan2(from.z * to.x - from.x * to.z, from.x * to.x + from.z * to.z);
}

function rotatePointAroundY(point, pivot, angle) {
  return point.clone().sub(pivot).applyAxisAngle(Y_AXIS, angle).add(pivot);
}

function segmentOverlapOnAxis(firstStart, firstEnd, secondStart, secondEnd, axis) {
  const firstA = firstStart.dot(axis);
  const firstB = firstEnd.dot(axis);
  const secondA = secondStart.dot(axis);
  const secondB = secondEnd.dot(axis);
  return Math.min(Math.max(firstA, firstB), Math.max(secondA, secondB))
    - Math.max(Math.min(firstA, firstB), Math.min(secondA, secondB));
}

function rootFitsGround(root) {
  const bounds = new THREE.Box3().setFromObject(root);
  const tolerance = 1e-6;
  return !bounds.isEmpty()
    && bounds.min.x >= -GROUND_HALF_SIZE - tolerance
    && bounds.max.x <= GROUND_HALF_SIZE + tolerance
    && bounds.min.z >= -GROUND_HALF_SIZE - tolerance
    && bounds.max.z <= GROUND_HALF_SIZE + tolerance;
}

function footprintsOverlap(firstRoot, firstItem, secondRoot, secondItem) {
  firstItem = effectiveSnapItem(firstRoot, firstItem);
  secondItem = effectiveSnapItem(secondRoot, secondItem);
  const firstFaces = firstItem.connectors.map((connector) => worldSnapFace(firstRoot, connector)).filter(Boolean);
  const secondFaces = secondItem.connectors.map((connector) => worldSnapFace(secondRoot, connector)).filter(Boolean);
  for (const first of firstFaces) {
    for (const second of secondFaces) {
      if (segmentsProperlyIntersect(first.edges[0], first.edges[1], second.edges[0], second.edges[1])) return true;
    }
  }

  const firstProbeInsideSecond = firstFaces.some((face) => {
    const inset = Math.max(1e-5, Math.min(face.span * 1e-3, 2e-4));
    return pointInsideWorldFootprint(face.center.clone().addScaledVector(face.normal, -inset), secondRoot, secondItem);
  });
  if (firstProbeInsideSecond) return true;
  return secondFaces.some((face) => {
    const inset = Math.max(1e-5, Math.min(face.span * 1e-3, 2e-4));
    return pointInsideWorldFootprint(face.center.clone().addScaledVector(face.normal, -inset), firstRoot, firstItem);
  });
}

function snapFaceBlockedByRoot(face, otherRoot, otherItem) {
  otherItem = effectiveSnapItem(otherRoot, otherItem);
  if (!otherItem?.footprintTriangles?.length) return false;
  const ownerBounds = new THREE.Box3().setFromObject(face.root);
  const otherBounds = new THREE.Box3().setFromObject(otherRoot);
  const verticalOverlap = Math.min(ownerBounds.max.y, otherBounds.max.y) - Math.max(ownerBounds.min.y, otherBounds.min.y);
  if (verticalOverlap <= 1e-5) return false;
  const probeDistance = Math.max(2e-5, Math.min(face.span * 1e-3, 3e-4));
  const outwardProbe = face.center.clone().addScaledVector(face.normal, probeDistance);
  return pointInsideWorldFootprint(outwardProbe, otherRoot, otherItem);
}

function segmentsProperlyIntersect(firstStart, firstEnd, secondStart, secondEnd) {
  const epsilon = 1e-8;
  const firstSideA = crossXZ(firstStart, firstEnd, secondStart);
  const firstSideB = crossXZ(firstStart, firstEnd, secondEnd);
  const secondSideA = crossXZ(secondStart, secondEnd, firstStart);
  const secondSideB = crossXZ(secondStart, secondEnd, firstEnd);
  return firstSideA * firstSideB < -epsilon && secondSideA * secondSideB < -epsilon;
}

function segmentDistanceXZ(firstStart, firstEnd, secondStart, secondEnd) {
  if (segmentsIntersectOrTouch(firstStart, firstEnd, secondStart, secondEnd)) return 0;
  return Math.min(
    pointSegmentDistanceXZ(firstStart, secondStart, secondEnd),
    pointSegmentDistanceXZ(firstEnd, secondStart, secondEnd),
    pointSegmentDistanceXZ(secondStart, firstStart, firstEnd),
    pointSegmentDistanceXZ(secondEnd, firstStart, firstEnd),
  );
}

function segmentsIntersectOrTouch(firstStart, firstEnd, secondStart, secondEnd) {
  const a = crossXZ(firstStart, firstEnd, secondStart);
  const b = crossXZ(firstStart, firstEnd, secondEnd);
  const c = crossXZ(secondStart, secondEnd, firstStart);
  const d = crossXZ(secondStart, secondEnd, firstEnd);
  const epsilon = 1e-9;
  if (((a > epsilon && b < -epsilon) || (a < -epsilon && b > epsilon))
    && ((c > epsilon && d < -epsilon) || (c < -epsilon && d > epsilon))) return true;
  return pointSegmentDistanceXZ(firstStart, secondStart, secondEnd) <= epsilon
    || pointSegmentDistanceXZ(firstEnd, secondStart, secondEnd) <= epsilon
    || pointSegmentDistanceXZ(secondStart, firstStart, firstEnd) <= epsilon
    || pointSegmentDistanceXZ(secondEnd, firstStart, firstEnd) <= epsilon;
}

function pointSegmentDistanceXZ(point, start, end) {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSq = dx * dx + dz * dz;
  if (lengthSq <= 1e-16) return Math.hypot(point.x - start.x, point.z - start.z);
  const t = THREE.MathUtils.clamp(((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSq, 0, 1);
  return Math.hypot(point.x - (start.x + dx * t), point.z - (start.z + dz * t));
}

function crossXZ(a, b, c) {
  return (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
}

function pointInsideWorldFootprint(point, root, item) {
  item = effectiveSnapItem(root, item);
  if (!item.footprintTriangles?.length) return false;
  root.updateMatrixWorld(true);
  const local = point.clone().applyMatrix4(root.matrixWorld.clone().invert());
  return pointInsideProjectedGeometry(new THREE.Vector2(local.x, local.z), item.footprintTriangles, 1e-7);
}

function extractOuterVerticalSnapGeometry(object) {
  object.updateMatrixWorld(true);
  const rootInverse = object.matrixWorld.clone().invert();
  const projectedTriangles = [];
  const verticalSegments = new Map();
  const bounds = new THREE.Box3().setFromObject(object);
  const boundsSize = bounds.getSize(new THREE.Vector3());
  const rootScale = object.getWorldScale(new THREE.Vector3());
  const footprintScale = Math.max(
    boundsSize.x / Math.max(Math.abs(rootScale.x), 1e-9),
    boundsSize.z / Math.max(Math.abs(rootScale.z), 1e-9),
    0.001,
  );
  const coordinateTolerance = Math.max(footprintScale * 1e-5, 1e-7);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const edgeA = new THREE.Vector3();
  const edgeB = new THREE.Vector3();

  object.traverse((child) => {
    if (!child.isMesh || !child.geometry?.attributes?.position) return;
    const geometry = child.geometry;
    const position = geometry.attributes.position;
    const index = geometry.index;
    const triangleCount = Math.floor((index ? index.count : position.count) / 3);
    const meshToRoot = rootInverse.clone().multiply(child.matrixWorld);

    for (let triangle = 0; triangle < triangleCount; triangle += 1) {
      const offset = triangle * 3;
      const ia = index ? index.getX(offset) : offset;
      const ib = index ? index.getX(offset + 1) : offset + 1;
      const ic = index ? index.getX(offset + 2) : offset + 2;
      a.fromBufferAttribute(position, ia).applyMatrix4(meshToRoot);
      b.fromBufferAttribute(position, ib).applyMatrix4(meshToRoot);
      c.fromBufferAttribute(position, ic).applyMatrix4(meshToRoot);
      const projectedA = new THREE.Vector2(a.x, a.z);
      const projectedB = new THREE.Vector2(b.x, b.z);
      const projectedC = new THREE.Vector2(c.x, c.z);
      const projectedArea = Math.abs(cross2(projectedA, projectedB, projectedC));
      if (projectedArea > coordinateTolerance * coordinateTolerance) {
        projectedTriangles.push([projectedA, projectedB, projectedC]);
      }
      const normal = edgeA.subVectors(b, a).cross(edgeB.subVectors(c, a));
      if (normal.lengthSq() < 1e-12) continue;
      normal.normalize();
      const verticalSpan = Math.max(a.y, b.y, c.y) - Math.min(a.y, b.y, c.y);
      if (Math.abs(normal.y) > 0.08 || verticalSpan < coordinateTolerance) continue;

      const projectedPoints = [projectedA, projectedB, projectedC];
      let segmentStart = projectedA;
      let segmentEnd = projectedB;
      let longestDistanceSq = 0;
      for (let first = 0; first < projectedPoints.length; first += 1) {
        for (let second = first + 1; second < projectedPoints.length; second += 1) {
          const distanceSq = projectedPoints[first].distanceToSquared(projectedPoints[second]);
          if (distanceSq > longestDistanceSq) {
            longestDistanceSq = distanceSq;
            segmentStart = projectedPoints[first];
            segmentEnd = projectedPoints[second];
          }
        }
      }
      if (longestDistanceSq <= coordinateTolerance * coordinateTolerance) continue;
      const key = segmentKey(segmentStart, segmentEnd, coordinateTolerance);
      const existing = verticalSegments.get(key);
      if (existing) {
        existing.minY = Math.min(existing.minY, a.y, b.y, c.y);
        existing.maxY = Math.max(existing.maxY, a.y, b.y, c.y);
      } else {
        verticalSegments.set(key, {
          start: segmentStart.clone(),
          end: segmentEnd.clone(),
          minY: Math.min(a.y, b.y, c.y),
          maxY: Math.max(a.y, b.y, c.y),
        });
      }
    }
  });

  const exteriorSegments = [];
  for (const segment of verticalSegments.values()) {
    const tangent2 = segment.end.clone().sub(segment.start).normalize();
    const left = new THREE.Vector2(-tangent2.y, tangent2.x);
    const midpoint = segment.start.clone().add(segment.end).multiplyScalar(0.5);
    const segmentLength = segment.start.distanceTo(segment.end);
    const probeDistance = Math.min(segmentLength * 0.08, Math.max(footprintScale * 2e-4, coordinateTolerance * 4));
    const insideLeft = pointInsideProjectedGeometry(midpoint.clone().addScaledVector(left, probeDistance), projectedTriangles, coordinateTolerance);
    const insideRight = pointInsideProjectedGeometry(midpoint.clone().addScaledVector(left, -probeDistance), projectedTriangles, coordinateTolerance);
    if (insideLeft === insideRight) continue;

    const outward2 = insideLeft ? left.clone().negate() : left;
    exteriorSegments.push({
      start: segment.start.clone(),
      end: segment.end.clone(),
      minY: segment.minY,
      maxY: segment.maxY,
      normal: outward2.normalize(),
    });
  }

  const connectors = [];
  const mergeTolerance = Math.max(coordinateTolerance * 8, footprintScale * 1e-4);
  for (const segment of mergeExternalFaceSegments(exteriorSegments, mergeTolerance)) {
    const tangent2 = segment.end.clone().sub(segment.start).normalize();
    const midpoint = segment.start.clone().add(segment.end).multiplyScalar(0.5);
    const segmentLength = segment.start.distanceTo(segment.end);
    const normal = new THREE.Vector3(segment.normal.x, 0, segment.normal.y).normalize();
    const tangent = new THREE.Vector3(tangent2.x, 0, tangent2.y).normalize();
    const centerY = (segment.minY + segment.maxY) * 0.5;
    connectors.push({
      kind: 'face',
      position: new THREE.Vector3(midpoint.x, centerY, midpoint.y),
      normal: normal.clone(),
      tangent: tangent.clone(),
      length: segmentLength,
      minY: segment.minY,
      maxY: segment.maxY,
    });
  }
  return { connectors, footprintTriangles: projectedTriangles };
}

function mergeExternalFaceSegments(segments, tolerance) {
  const merged = segments.map((segment) => ({
    ...segment,
    start: segment.start.clone(),
    end: segment.end.clone(),
    normal: segment.normal.clone(),
  }));
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let firstIndex = 0; firstIndex < merged.length; firstIndex += 1) {
      const first = merged[firstIndex];
      const tangent = first.end.clone().sub(first.start).normalize();
      for (let secondIndex = firstIndex + 1; secondIndex < merged.length; secondIndex += 1) {
        const second = merged[secondIndex];
        if (first.normal.dot(second.normal) < 0.9995) continue;
        const secondTangent = second.end.clone().sub(second.start).normalize();
        if (Math.abs(tangent.dot(secondTangent)) < 0.9995) continue;
        const lineDistanceA = Math.abs(cross2(first.start, first.end, second.start)) / Math.max(first.start.distanceTo(first.end), 1e-9);
        const lineDistanceB = Math.abs(cross2(first.start, first.end, second.end)) / Math.max(first.start.distanceTo(first.end), 1e-9);
        if (lineDistanceA > tolerance || lineDistanceB > tolerance) continue;
        const originProjection = first.start.dot(tangent);
        const firstValues = [first.start.dot(tangent), first.end.dot(tangent)];
        const secondValues = [second.start.dot(tangent), second.end.dot(tangent)];
        const firstMin = Math.min(...firstValues);
        const firstMax = Math.max(...firstValues);
        const secondMin = Math.min(...secondValues);
        const secondMax = Math.max(...secondValues);
        const gap = Math.max(firstMin, secondMin) - Math.min(firstMax, secondMax);
        if (gap > tolerance) continue;
        const combinedMin = Math.min(firstMin, secondMin);
        const combinedMax = Math.max(firstMax, secondMax);
        first.start.addScaledVector(tangent, combinedMin - originProjection);
        first.end.copy(first.start).addScaledVector(tangent, combinedMax - combinedMin);
        first.minY = Math.min(first.minY, second.minY);
        first.maxY = Math.max(first.maxY, second.maxY);
        merged.splice(secondIndex, 1);
        changed = true;
        break outer;
      }
    }
  }
  return merged;
}

export function extractOuterVerticalSnapConnectors(object) {
  return extractOuterVerticalSnapGeometry(object).connectors;
}

function cross2(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function segmentKey(start, end, tolerance) {
  const quantize = (value) => Math.round(value / tolerance);
  const first = `${quantize(start.x)},${quantize(start.y)}`;
  const second = `${quantize(end.x)},${quantize(end.y)}`;
  return first < second ? `${first}:${second}` : `${second}:${first}`;
}

function pointInsideProjectedGeometry(point, triangles, tolerance) {
  return triangles.some(([a, b, c]) => {
    const area = cross2(a, b, c);
    const first = cross2(a, b, point);
    const second = cross2(b, c, point);
    const third = cross2(c, a, point);
    const epsilon = Math.max(Math.abs(area) * 1e-7, tolerance * tolerance);
    return area >= 0
      ? first >= -epsilon && second >= -epsilon && third >= -epsilon
      : first <= epsilon && second <= epsilon && third <= epsilon;
  });
}

function countTriangles(object) {
  let total = 0;
  object.traverse((child) => {
    if (!child.isMesh || !child.geometry) return;
    total += child.geometry.index ? child.geometry.index.count / 3 : (child.geometry.attributes.position?.count || 0) / 3;
  });
  return Math.round(total);
}

function serializeTransform(object) {
  return {
    position: object.position.toArray(),
    rotation: [THREE.MathUtils.radToDeg(object.rotation.x), THREE.MathUtils.radToDeg(object.rotation.y), THREE.MathUtils.radToDeg(object.rotation.z)],
    scale: object.scale.toArray(),
  };
}

function applyTransform(object, transform) {
  object.position.fromArray(transform.position || [0, 0, 0]);
  object.rotation.set(...(transform.rotation || [0, 0, 0]).map(THREE.MathUtils.degToRad));
  object.scale.fromArray(transform.scale || [1, 1, 1]);
}

function disposeObject(object) {
  object.userData?.sliceSelectionOutlineGeometry?.dispose?.();
  object.userData?.sliceFootprintOutlineGeometry?.dispose?.();
  object.traverse((child) => {
    if (!child.isMesh) return;
    child.geometry?.dispose?.();
    if (child.userData.isEdgeOverlay) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.filter(Boolean).forEach((material) => material.dispose?.());
  });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
}

function dataUrlToArrayBuffer(dataUrl) {
  const base64 = String(dataUrl || '').split(',')[1];
  if (!base64) throw new Error('A module source is missing from the project.');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

function exportPageRatio(settings) {
  const portraitRatio = settings.paper === 'letter' ? 8.5 / 11 : 1 / Math.sqrt(2);
  return settings.orientation === 'landscape' ? 1 / portraitRatio : portraitRatio;
}

function exportPagePixels(settings, preview) {
  if (settings.format === 'mp4') return preview ? [1600, 900] : [VIDEO_WIDTH, VIDEO_HEIGHT];
  const ratio = exportPageRatio(settings);
  if (preview) {
    const longest = 1600;
    return ratio >= 1 ? [longest, Math.round(longest / ratio)] : [Math.round(longest * ratio), longest];
  }
  const dpiScale = Math.max(1, Math.min(1.5, (Number(settings.dpi) || 450) / 300));
  const basePortrait = settings.paper === 'a3' ? [3508, 4961] : settings.paper === 'letter' ? [2550, 3300] : [2480, 3508];
  const portrait = basePortrait.map((size) => Math.round(size * dpiScale));
  return settings.orientation === 'landscape' ? [portrait[1], portrait[0]] : portrait;
}

function createOrbitExportCamera(bounds, aspect, progress = 0, zoom = 1) {
  const camera = new THREE.PerspectiveCamera(42, aspect, 0.01, 1000);
  positionOrbitExportCamera(camera, bounds, progress, zoom);
  return camera;
}

function positionOrbitExportCamera(camera, bounds, progress, zoom = 1) {
  const sphere = bounds.getBoundingSphere(new THREE.Sphere());
  const center = sphere.center;
  const safeRadius = Math.max(0.5, sphere.radius);
  const verticalHalfFov = THREE.MathUtils.degToRad(camera.fov * 0.5);
  const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * camera.aspect);
  const limitingHalfFov = Math.min(verticalHalfFov, horizontalHalfFov);
  const distance = (safeRadius / Math.max(0.1, Math.sin(limitingHalfFov))) * 1.16 / THREE.MathUtils.clamp(Number(zoom) || 1, 0.5, 5);
  const angle = -Math.PI * 0.25 + THREE.MathUtils.clamp(progress, 0, 1) * Math.PI * 2;
  camera.position.set(
    center.x + Math.cos(angle) * distance,
    center.y,
    center.z + Math.sin(angle) * distance,
  );
  camera.up.set(0, 1, 0);
  camera.near = Math.max(0.01, distance / 1000);
  camera.far = Math.max(500, distance + GROUND_SIZE * 3);
  camera.lookAt(center);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
}

function createExportScene(assembly, style, groundColor = '#fbf0bc', shadows = true, globalMaterial = 'matte', environment = null, noTextures = false, wallGroup = null, wallMaterial = 'matte', seamless = false, seamlessColor = '#f2d336', seamlessEdges = false, edgeSettings = {}, edgeResolution = new THREE.Vector2(1, 1), wallEdgeSettings = {}, northBoundarySettings = {}, wallBrickPattern = DEFAULT_WALL_BRICK_PATTERN, northBrickArchMapping = null, nightMode = false, nightLights = [], reflectionStrength = 0.72) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(nightMode ? '#050914' : '#dceff8');
  scene.environment = nightMode ? null : environment;
  scene.environmentIntensity = nightMode ? 1 : noTextures ? 0.28 : 0.38;
  if (nightMode) {
    nightLights.filter((definition) => definition.enabled !== false).forEach((rawDefinition) => {
      const definition = normalizeNightLight(rawDefinition);
      const light = new THREE.SpotLight(definition.color, definition.intensity, definition.distance, THREE.MathUtils.degToRad(definition.angle), definition.penumbra, definition.decay);
      light.position.fromArray(definition.position);
      light.castShadow = shadows;
      light.shadow.mapSize.set(2048, 2048);
      light.shadow.camera.near = 0.05;
      light.shadow.camera.far = definition.distance;
      light.shadow.bias = -0.00015;
      light.shadow.normalBias = 0.025;
      const target = new THREE.Object3D();
      target.position.fromArray(definition.target);
      light.target = target;
      scene.add(light, target);
    });
  } else {
    scene.add(new THREE.HemisphereLight(0xe8f4fa, 0x5f5954, noTextures ? 0.68 : 0.75));
    const sun = new THREE.DirectionalLight(noTextures ? 0xfff7e5 : 0xffedca, noTextures ? 2.8 : 3);
    sun.position.set(-10, 16, 12);
    sun.castShadow = shadows;
    sun.shadow.mapSize.set(4096, 4096);
    sun.shadow.camera.left = -10;
    sun.shadow.camera.right = 10;
    sun.shadow.camera.top = 10;
    sun.shadow.camera.bottom = -10;
    sun.shadow.camera.near = 0.1;
    sun.shadow.camera.far = 50;
    sun.shadow.bias = -0.00015;
    sun.shadow.normalBias = 0.025;
    sun.shadow.radius = noTextures ? 1.5 : 1.9;
    scene.add(sun);
    const fill = new THREE.DirectionalLight(noTextures ? 0xc8dce5 : 0xbdd9e6, noTextures ? 0.32 : 0.36);
    fill.position.set(8, 6, 4);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(noTextures ? 0xffe8c5 : 0xffdca2, noTextures ? 0.55 : 0.65);
    rim.position.set(10, 10, -12);
    scene.add(rim);
  }
  const groundMaterial = new THREE.MeshPhysicalMaterial({ color: groundColor, roughness: nightMode ? 0.24 : 0.86, metalness: nightMode ? 0.12 : 0, clearcoat: nightMode ? 0 : 0.06, clearcoatRoughness: 0.72, envMapIntensity: 0.45 });
  const groundGeometry = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE);
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.006;
  ground.receiveShadow = shadows;
  scene.add(ground);
  let reflector = null;
  if (nightMode && Number(reflectionStrength) > 0.01) {
    const textureSize = Math.max(512, Math.min(2048, Math.round(Math.max(edgeResolution.x, edgeResolution.y))));
    reflector = new Reflector(new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE), {
      clipBias: 0.003,
      textureWidth: textureSize,
      textureHeight: textureSize,
      color: 0x182133,
      multisample: 4,
    });
    reflector.rotation.x = -Math.PI / 2;
    reflector.position.y = -0.002;
    reflector.material.transparent = true;
    reflector.material.opacity = THREE.MathUtils.clamp(Number(reflectionStrength) || 0.72, 0.05, 1);
    scene.add(reflector);
  }
  const root = assembly.clone(true);
  if (wallGroup?.visible) root.add(wallGroup.clone(true));
  const clonedStageWallEdges = [];
  root.traverse((child) => {
    if (child.userData.isWallEdgeOverlay) clonedStageWallEdges.push(child);
  });
  clonedStageWallEdges.forEach((overlay) => overlay.parent?.remove(overlay));
  const exportNorthBoundaryMaterials = [];
  root.traverse((child) => {
    if (child.userData.isNorthBoundaryGroup) child.visible = northBoundarySettings.enabled === true;
    if (child.userData.isNorthBoundary && northBoundarySettings.enabled === true && child.material) {
      const material = child.material.clone();
      material.visible = true;
      material.color.set(northBoundarySettings.color || '#79610c');
      material.linewidth = THREE.MathUtils.clamp(Number(northBoundarySettings.thickness) || 4, 0.5, 6);
      material.resolution.copy(edgeResolution);
      material.needsUpdate = true;
      child.material = material;
      exportNorthBoundaryMaterials.push(material);
    }
  });
  removeInvisibleBranches(root);
  const exportEdgeMaterials = [];
  const exportWallEdgeResources = [];
  root.traverse((child) => {
    if (seamless && child.userData.isEdgeOverlay) {
      child.visible = seamlessEdges;
      if (seamlessEdges && child.material) {
        const material = child.material.clone();
        material.visible = true;
        material.color.set(edgeSettings.color || '#ffffff');
        material.linewidth = edgeSettings.thickness || 4;
        material.resolution.copy(edgeResolution);
        material.needsUpdate = true;
        child.material = material;
        exportEdgeMaterials.push(material);
      }
    }
    if (!child.isMesh || child.userData.isEdgeOverlay || child.userData.isNorthBoundary) return;
    child.castShadow = shadows;
    child.receiveShadow = shadows;
  });
  if (wallEdgeSettings.enabled) {
    const wallEdgeMaterial = new LineMaterial({
      color: /^#[0-9a-f]{6}$/i.test(wallEdgeSettings.color || '') ? wallEdgeSettings.color : '#79610c',
      linewidth: THREE.MathUtils.clamp(Number(wallEdgeSettings.thickness) || 4, 0.5, 6),
      worldUnits: false,
      transparent: true,
      opacity: 0.94,
      depthTest: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    wallEdgeMaterial.resolution.copy(edgeResolution);
    exportWallEdgeResources.push(wallEdgeMaterial);
    const wallMeshes = [];
    const southOpeningSegments = [];
    root.traverse((child) => {
      if (!child.isMesh || !child.userData.wallSide || child.userData.isEdgeOverlay) return;
      if (child.userData.isSouthOpeningSegment) southOpeningSegments.push(child);
      else wallMeshes.push(child);
    });
    wallMeshes.forEach((mesh) => {
      const overlay = attachEdgeOverlay(mesh, wallEdgeMaterial);
      if (overlay) exportWallEdgeResources.push(overlay.geometry);
    });
    if (southOpeningSegments.length) {
      const overlay = attachMergedBoundaryEdgeOverlay(southOpeningSegments, wallEdgeMaterial, root);
      if (overlay) exportWallEdgeResources.push(overlay.geometry);
    }
  }
  scene.add(root);
  const disposable = [groundMaterial, groundGeometry, ...(reflector ? [reflector.geometry, reflector] : []), ...exportEdgeMaterials, ...exportWallEdgeResources, ...exportNorthBoundaryMaterials];
  const meshes = [];
  root.traverse((child) => { if (child.isMesh && !child.userData.isEdgeOverlay && !child.userData.isNorthBoundary) meshes.push(child); });
  if (style === 'solid') {
    meshes.forEach((mesh) => {
      const preset = exportMaterialPreset(seamless ? globalMaterial : mesh.userData.wallSide ? wallMaterial : globalMaterial);
      const originals = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const materials = originals.map((original) => {
        const material = new THREE.MeshPhysicalMaterial({
          color: seamless
            ? new THREE.Color(normalizeWallColor(seamlessColor))
            : original.color?.clone?.() || new THREE.Color('#f2d336'),
          map: noTextures ? null : originalMaterialTexture(original, 'map'),
          alphaMap: noTextures ? null : originalMaterialTexture(original, 'alphaMap'),
          aoMap: noTextures ? null : originalMaterialTexture(original, 'aoMap'),
          aoMapIntensity: original.aoMapIntensity ?? 1,
          lightMap: noTextures ? null : originalMaterialTexture(original, 'lightMap'),
          lightMapIntensity: original.lightMapIntensity ?? 1,
          normalMap: noTextures ? null : originalMaterialTexture(original, 'normalMap'),
          normalScale: original.normalScale?.clone?.() || new THREE.Vector2(1, 1),
          bumpMap: noTextures ? null : originalMaterialTexture(original, 'bumpMap'),
          bumpScale: original.bumpScale ?? 1,
          roughnessMap: noTextures ? null : originalMaterialTexture(original, 'roughnessMap'),
          metalnessMap: noTextures ? null : originalMaterialTexture(original, 'metalnessMap'),
          emissive: original.emissive?.clone?.() || new THREE.Color(0x000000),
          emissiveMap: noTextures ? null : originalMaterialTexture(original, 'emissiveMap'),
          emissiveIntensity: original.emissiveIntensity ?? 1,
          transparent: original.transparent || original.opacity < 1,
          opacity: original.opacity ?? 1,
          alphaTest: original.alphaTest || 0,
          side: original.side,
          vertexColors: original.vertexColors,
          flatShading: original.flatShading,
          roughness: nightMode ? GIRIH_STAGE_MATERIAL.roughness : preset.roughness,
          metalness: nightMode ? GIRIH_STAGE_MATERIAL.metalness : preset.metalness,
          clearcoat: nightMode ? 0 : preset.clearcoat,
          clearcoatRoughness: nightMode ? 0.72 : preset.clearcoatRoughness,
          sheen: preset.sheen,
          sheenRoughness: preset.sheenRoughness,
          sheenColor: new THREE.Color(preset.sheenColor),
          envMapIntensity: nightMode ? 1 : preset.envMapIntensity,
        });
        if (mesh.userData.wallSide && wallBrickPattern?.enabled === true) {
          configureWallBrickMaterial(
            material,
            original.userData?.wallBrickPattern || wallBrickPattern,
            mesh.userData.isNorthOuterFrame ? northBrickArchMapping : null,
            original.userData?.wallBrickOpeningMapping || null,
            original.userData?.wallBrickDecorativeFace || decorativeFaceForWall(mesh.userData.wallSide),
          );
        }
        material.needsUpdate = true;
        disposable.push(material);
        return material;
      });
      mesh.material = Array.isArray(mesh.material) ? materials : materials[0];
    });
  } else {
    const surface = new THREE.MeshBasicMaterial({
      color: style === 'wireframe' ? 0x151515 : 0xffffff,
      wireframe: style === 'wireframe',
      side: THREE.DoubleSide,
      transparent: false,
      opacity: 1,
      depthWrite: true,
      vertexColors: false,
      toneMapped: false,
    });
    disposable.push(surface);
    const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x111111 });
    if (style === 'hidden-line') disposable.push(edgeMaterial);
    const southOpeningSegments = style === 'hidden-line' ? meshes.filter((mesh) => mesh.userData.isSouthOpeningSegment) : [];
    meshes.forEach((mesh) => {
      const originalMaterial = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      if (style === 'hidden-line' && mesh.userData.wallSide && wallBrickPattern?.enabled === true) {
        const brickSurface = surface.clone();
        configureWallBrickMaterial(
          brickSurface,
          { ...(originalMaterial?.userData?.wallBrickPattern || wallBrickPattern), mortarColor: '#4a4a4a' },
          mesh.userData.isNorthOuterFrame ? northBrickArchMapping : null,
          originalMaterial?.userData?.wallBrickOpeningMapping || null,
          originalMaterial?.userData?.wallBrickDecorativeFace || decorativeFaceForWall(mesh.userData.wallSide),
        );
        brickSurface.needsUpdate = true;
        mesh.material = brickSurface;
        disposable.push(brickSurface);
      } else {
        mesh.material = surface;
      }
      if (style === 'hidden-line' && !mesh.userData.isSouthOpeningSegment) {
        surface.polygonOffset = true;
        surface.polygonOffsetFactor = 1;
        surface.polygonOffsetUnits = 1;
        const edgeGeometry = createFilteredEdgesGeometry(
          mesh.geometry,
          28,
          mesh.userData.wallSide || edgeSettings.verticalLines !== false,
        );
        const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
        mesh.add(edges);
        disposable.push(edgeGeometry);
      }
    });
    if (southOpeningSegments.length) {
      const positions = mergedBoundaryEdgePositions(southOpeningSegments);
      if (positions.length) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        const edges = new THREE.LineSegments(geometry, edgeMaterial);
        edges.name = 'South wall clean hidden-line boundary';
        root.add(edges);
        disposable.push(geometry);
      }
    }
  }
  return { scene, root, disposable };
}

function removeInvisibleBranches(root) {
  [...root.children].forEach((child) => {
    if (!child.visible) root.remove(child);
    else removeInvisibleBranches(child);
  });
}

function createCurrentExportCamera(sourceCamera, aspect, settings, sourceTarget) {
  const camera = sourceCamera.clone();
  const zoom = Math.max(0.5, Number(settings.zoom) || 1);
  let halfHeight;

  if (camera.isPerspectiveCamera) {
    camera.aspect = aspect;
    const baseHalfFov = THREE.MathUtils.degToRad(sourceCamera.fov * 0.5);
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(baseHalfFov) / zoom));
    const distance = Math.max(0.01, sourceCamera.position.distanceTo(sourceTarget));
    halfHeight = Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) * distance;
  } else {
    const baseHalfHeight = Math.max(0.001, (sourceCamera.top - sourceCamera.bottom) / (2 * Math.max(0.001, sourceCamera.zoom || 1)));
    halfHeight = baseHalfHeight / zoom;
    camera.zoom = 1;
    camera.left = -halfHeight * aspect;
    camera.right = halfHeight * aspect;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
  }

  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  const pan = right.multiplyScalar((Number(settings.panX) || 0) * halfHeight * 2 * aspect)
    .addScaledVector(up, (Number(settings.panY) || 0) * halfHeight * 2);
  camera.position.add(pan);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}

function createExportCamera(bounds, aspect, settings) {
  if (bounds.isEmpty()) bounds.set(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, 2, 1));
  const sphere = bounds.getBoundingSphere(new THREE.Sphere());
  const halfHeight = Math.max(0.5, sphere.radius * 1.28) / Math.max(0.5, Number(settings.zoom) || 1);
  const camera = new THREE.OrthographicCamera(-halfHeight * aspect, halfHeight * aspect, halfHeight, -halfHeight, 0.01, 500);
  const directions = {
    'iso-ne': new THREE.Vector3(1, 0.82, 1),
    'iso-nw': new THREE.Vector3(-1, 0.82, 1),
    'iso-se': new THREE.Vector3(1, 0.82, -1),
    'iso-sw': new THREE.Vector3(-1, 0.82, -1),
    top: new THREE.Vector3(0, 1, 0.001),
    front: new THREE.Vector3(0, 0, 1),
  };
  const direction = (directions[settings.view] || directions['iso-ne']).normalize();
  camera.up.set(0, 1, 0);
  if (settings.view === 'top') camera.up.set(0, 0, -1);
  camera.position.copy(sphere.center).addScaledVector(direction, Math.max(10, sphere.radius * 5));
  camera.lookAt(sphere.center);
  camera.updateMatrixWorld(true);
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  const pan = right.multiplyScalar((Number(settings.panX) || 0) * halfHeight * 2 * aspect)
    .addScaledVector(up, (Number(settings.panY) || 0) * halfHeight * 2);
  camera.position.add(pan);
  const target = sphere.center.clone().add(pan);
  camera.lookAt(target);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}

function createDimensionFrontCamera(bounds, aspect, settings) {
  const safeBounds = bounds.isEmpty()
    ? new THREE.Box3(new THREE.Vector3(-1, 0, -0.5), new THREE.Vector3(1, 2, 0.5))
    : bounds;
  const size = safeBounds.getSize(new THREE.Vector3());
  const center = safeBounds.getCenter(new THREE.Vector3());
  const contentWidth = Math.max(1, size.x) * 1.42;
  const contentHeight = Math.max(1, size.y) * 1.42;
  const zoom = THREE.MathUtils.clamp(Number(settings.zoom) || 1, 0.5, 3);
  const halfHeight = Math.max(contentHeight * 0.5, contentWidth / Math.max(0.1, aspect) * 0.5) / zoom;
  const camera = new THREE.OrthographicCamera(-halfHeight * aspect, halfHeight * aspect, halfHeight, -halfHeight, 0.01, 1000);
  const panX = (Number(settings.panX) || 0) * halfHeight * 2 * aspect;
  const panY = (Number(settings.panY) || 0) * halfHeight * 2;
  const target = center.clone().add(new THREE.Vector3(panX, panY, 0));
  camera.position.set(target.x, target.y, safeBounds.max.z + Math.max(20, size.z * 5));
  camera.up.set(0, 1, 0);
  camera.lookAt(target);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}

function drawDimensionedFrontAnnotations(context, camera, bounds, width, height, data) {
  if (!context || bounds.isEmpty()) return;
  const scale = Math.max(0.75, Math.min(width, height) / 1000);
  const lineWidth = Math.max(1, 1.35 * scale);
  const textSize = Math.max(11, 15 * scale);
  const z = bounds.max.z + 0.01;
  const project = (x, y) => {
    const point = new THREE.Vector3(x, y, z).project(camera);
    return {
      x: (point.x * 0.5 + 0.5) * width,
      y: (-point.y * 0.5 + 0.5) * height,
    };
  };
  const label = (text, x, y, align = 'center') => {
    context.save();
    context.font = `600 ${textSize}px Inter, Arial, sans-serif`;
    context.textAlign = align;
    context.textBaseline = 'middle';
    const metrics = context.measureText(text);
    const paddingX = 4.5 * scale;
    const boxWidth = metrics.width + paddingX * 2;
    const boxX = align === 'left' ? x - paddingX : align === 'right' ? x - boxWidth + paddingX : x - boxWidth * 0.5;
    context.fillStyle = 'rgba(255,255,255,0.94)';
    context.fillRect(boxX, y - textSize * 0.72, boxWidth, textSize * 1.44);
    context.fillStyle = '#111111';
    context.fillText(text, x, y);
    context.restore();
  };
  const tick = (point, angle = Math.PI * 0.25) => {
    const length = 7 * scale;
    context.moveTo(point.x - Math.cos(angle) * length, point.y - Math.sin(angle) * length);
    context.lineTo(point.x + Math.cos(angle) * length, point.y + Math.sin(angle) * length);
  };
  const horizontalDimension = (minX, maxX, sourceY, dimensionY, text) => {
    const leftSource = project(minX, sourceY);
    const rightSource = project(maxX, sourceY);
    const left = project(minX, dimensionY);
    const right = project(maxX, dimensionY);
    context.save();
    context.strokeStyle = '#111111';
    context.lineWidth = lineWidth;
    context.setLineDash([]);
    context.beginPath();
    context.moveTo(leftSource.x, leftSource.y);
    context.lineTo(left.x, left.y);
    context.moveTo(rightSource.x, rightSource.y);
    context.lineTo(right.x, right.y);
    context.moveTo(left.x, left.y);
    context.lineTo(right.x, right.y);
    tick(left);
    tick(right);
    context.stroke();
    context.restore();
    label(text, (left.x + right.x) * 0.5, left.y - 10 * scale);
  };
  const verticalDimension = (minY, maxY, sourceX, dimensionX, text) => {
    const bottomSource = project(sourceX, minY);
    const topSource = project(sourceX, maxY);
    const bottom = project(dimensionX, minY);
    const top = project(dimensionX, maxY);
    context.save();
    context.strokeStyle = '#111111';
    context.lineWidth = lineWidth;
    context.setLineDash([]);
    context.beginPath();
    context.moveTo(bottomSource.x, bottomSource.y);
    context.lineTo(bottom.x, bottom.y);
    context.moveTo(topSource.x, topSource.y);
    context.lineTo(top.x, top.y);
    context.moveTo(bottom.x, bottom.y);
    context.lineTo(top.x, top.y);
    tick(bottom);
    tick(top);
    context.stroke();
    context.restore();
    context.save();
    context.translate(top.x + 13 * scale, (top.y + bottom.y) * 0.5);
    context.rotate(-Math.PI * 0.5);
    label(text, 0, 0);
    context.restore();
  };

  const modelWidth = Math.max(0, bounds.max.x - bounds.min.x);
  const groundY = Math.min(0, bounds.min.y);
  const buildingHeight = Math.max(0, bounds.max.y - groundY);
  const widthMargin = Math.max(0.25, modelWidth * 0.08);
  const heightMargin = Math.max(0.25, buildingHeight * 0.08);

  context.save();
  context.strokeStyle = '#111111';
  context.lineWidth = lineWidth;
  context.setLineDash([8 * scale, 6 * scale]);
  [...(data.levels || [])]
    .sort((first, second) => Number(first.height) - Number(second.height))
    .forEach((tier) => {
      const tierHeight = Number(tier.height) || 0;
      const left = project(bounds.min.x, tierHeight);
      const right = project(bounds.max.x, tierHeight);
      context.beginPath();
      context.moveTo(left.x, left.y);
      context.lineTo(right.x, right.y);
      context.stroke();
      label(`${tier.name}  +${tierHeight.toFixed(2)} m`, left.x - 8 * scale, left.y, 'right');
    });
  context.restore();

  horizontalDimension(
    bounds.min.x,
    bounds.max.x,
    groundY,
    groundY - heightMargin,
    `Overall width  ${modelWidth.toFixed(2)} m`,
  );
  verticalDimension(
    groundY,
    bounds.max.y,
    bounds.max.x,
    bounds.max.x + widthMargin,
    `Overall height  ${buildingHeight.toFixed(2)} m`,
  );

  const walls = data.walls;
  const footprint = data.footprintBounds;
  if (!walls?.enabled || !footprint || footprint.isEmpty()) return;
  const lowestTier = Math.min(...(data.levels || []).map((tier) => Number(tier.height) || 0));
  const southWallHeight = Math.max(0, lowestTier + (Number(walls.extraHeights?.south) || 0));
  if (southWallHeight <= 0) return;
  const westInner = footprint.min.x + 0.002 - (Number(walls.sideOffsets?.west) || 0);
  const eastInner = footprint.max.x - 0.002 + (Number(walls.sideOffsets?.east) || 0);
  const wallCenterX = (westInner + eastInner) * 0.5;
  const wallLeft = westInner - 0.4;
  const wallRight = eastInner + 0.4;
  const openings = walls.southOpenings || {};

  Object.entries(openings).forEach(([type, opening], index) => {
    if (!opening?.enabled) return;
    const centerX = THREE.MathUtils.clamp(wallCenterX + (Number(opening.position) || 0), wallLeft, wallRight);
    const requestedWidth = Math.max(0.05, Number(opening.width) || 1);
    const minX = THREE.MathUtils.clamp(centerX - requestedWidth * 0.5, wallLeft, wallRight);
    const maxX = THREE.MathUtils.clamp(centerX + requestedWidth * 0.5, wallLeft, wallRight);
    const requestedBottom = type === 'door' ? 0 : opening.sillHeight ?? southWallHeight * 0.8;
    const minY = THREE.MathUtils.clamp(Number(requestedBottom) || 0, 0, southWallHeight);
    const maxY = THREE.MathUtils.clamp(minY + (Number(opening.height) || 1), 0, southWallHeight);
    if (maxX <= minX || maxY <= minY) return;
    const openingName = type === 'door' ? 'Door' : 'Window';
    const offset = Math.max(0.08, buildingHeight * (0.018 + index * 0.008));
    horizontalDimension(minX, maxX, maxY, maxY + offset, `${openingName} width  ${(maxX - minX).toFixed(2)} m`);
    verticalDimension(minY, maxY, maxX, maxX + offset, `${openingName} height  ${(maxY - minY).toFixed(2)} m`);
  });
}

function dataUrlToBlob(dataUrl) {
  const [header, payload] = dataUrl.split(',');
  const bytes = Uint8Array.from(atob(payload), (character) => character.charCodeAt(0));
  return new Blob([bytes], { type: header.match(/data:([^;]+)/)?.[1] || 'application/octet-stream' });
}

function createImagePdf(jpegDataUrl, settings) {
  const jpeg = new Uint8Array(dataUrlToArrayBuffer(jpegDataUrl));
  const [pixelWidth, pixelHeight] = exportPagePixels(settings, false);
  const portrait = settings.paper === 'a3' ? [841.89, 1190.55] : settings.paper === 'letter' ? [612, 792] : [595.28, 841.89];
  const [pageWidth, pageHeight] = settings.orientation === 'landscape' ? [portrait[1], portrait[0]] : portrait;
  const parts = [];
  const offsets = [0];
  let length = 0;
  const push = (part) => { parts.push(part); length += typeof part === 'string' ? part.length : part.byteLength; };
  const object = (id, bodyParts) => {
    offsets[id] = length;
    push(`${id} 0 obj\n`);
    bodyParts.forEach(push);
    push('\nendobj\n');
  };
  push('%PDF-1.4\n');
  object(1, ['<< /Type /Catalog /Pages 2 0 R >>']);
  object(2, ['<< /Type /Pages /Kids [3 0 R] /Count 1 >>']);
  object(3, [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`]);
  object(4, [`<< /Type /XObject /Subtype /Image /Width ${pixelWidth} /Height ${pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.byteLength} >>\nstream\n`, jpeg, '\nendstream']);
  const commands = `q ${pageWidth} 0 0 ${pageHeight} 0 0 cm /Im0 Do Q`;
  object(5, [`<< /Length ${commands.length} >>\nstream\n${commands}\nendstream`]);
  const xref = length;
  push('xref\n0 6\n0000000000 65535 f \n');
  for (let id = 1; id <= 5; id += 1) push(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(parts, { type: 'application/pdf' });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function nextAnimationFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

function dateStamp() {
  return new Date().toISOString().slice(0, 10);
}
