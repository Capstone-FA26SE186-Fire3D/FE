import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";

import { disposeObject3D } from "@/features/ifc-scan/dispose";

import { interpretCoordinateTransform, type TransformInfo } from "./coordinate";
import { PALETTES, type ScenePalette } from "./palette";
import { floorCeiling, parseLayers, type FloorInfo, type LayerInfo } from "./preview-model";

export type TransformPhase = "start" | "change" | "end";

/**
 * The controller is generic: it draws markers in WORLD (GLB) space and reports world-space results. Mapping between world
 * space and a draft's own coordinates (legacy scenario space, or `fet3d.editor/1` floor-local) belongs to the caller.
 */
export type Point3 = { x: number; y: number; z: number };
export type MarkerRef = { kind: string; index: number };
export type Quaternion4 = { x: number; y: number; z: number; w: number };

export type MarkerInput = MarkerRef & {
  /** Which glyph to draw: `spawn`, `fire`, `smoke`, `wind`, `other` (legacy) or one of the v1 kinds. */
  variant: string;
  /** Layer toggled from the layer list (`setLayerVisible`). */
  layer: string;
  position: Point3;
  /** Rotation about Y in degrees (legacy), used when `quaternion` is absent. */
  yawDegrees?: number;
  /** Full orientation in GLB axes (v1). */
  quaternion?: Quaternion4;
  dormant?: boolean;
};

export type SceneTool = "select" | "move" | "rotate" | "place";

export type TransformResult = { position: Point3; yawDegrees: number; quaternion: Quaternion4 };

export type SceneCallbacks = {
  onSelect: (selection: MarkerRef | null) => void;
  /** `kind` is `SceneInputs.placeKind`; `point` is the world point under the pointer. */
  onPlace: (kind: string, point: Point3) => void;
  onTransform: (ref: MarkerRef, next: TransformResult | null, phase: TransformPhase) => void;
  onModelPick: (pick: { name: string; point: Point3 } | null) => void;
  onContextLost: () => void;
  onContextRestored: () => void;
  /** After every rendered frame (camera moved, selection moved…). Used to keep DOM overlays attached to the selected marker. */
  onFrame?: () => void;
};

export type SceneInputs = { markers: MarkerInput[]; selection: MarkerRef | null; tool: SceneTool; placeKind: string };

export type ModelInfo = {
  meshes: number;
  triangles: number;
  size: [number, number, number];
  minY: number;
  maxY: number;
  transform: TransformInfo;
  layers: LayerInfo[];
  floorsOutsideModel: boolean;
};

export class ModelLoadError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "ModelLoadError";
  }
}

export type DebugStats = { renders: number; geometries: number; textures: number; programs: number; lost: boolean; markers: number };

const DEG = Math.PI / 180;
const markerKey = (ref: MarkerRef) => `${ref.kind}:${ref.index}`;
const round3 = (value: number) => Math.round(value * 1000) / 1000;
const NO_CLIP = 1e7;

export function isWebGLAvailable(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

/** All Three.js state of the editor viewport. No React in here: the React wrapper only forwards props and callbacks. */
export class EditorSceneController {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(50, 1, 0.05, 2000);
  private readonly orbit: OrbitControls;
  private readonly transform: TransformControls;
  private readonly modelGroup = new THREE.Group();
  private readonly markerGroup = new THREE.Group();
  private readonly helperGroup = new THREE.Group();
  private readonly hemi = new THREE.HemisphereLight();
  private readonly sun = new THREE.DirectionalLight();
  private readonly clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), NO_CLIP);
  private readonly raycaster = new THREE.Raycaster();
  private readonly observer: ResizeObserver;
  private readonly geometries: Record<string, THREE.BufferGeometry> = {};
  private readonly materials: Record<string, THREE.MeshStandardMaterial | THREE.MeshBasicMaterial> = {};
  private readonly markers = new Map<string, THREE.Group>();
  private palette: ScenePalette = PALETTES.dark;
  private inputs: SceneInputs = { markers: [], selection: null, tool: "select", placeKind: "" };
  private readonly markerLayers = new Map<string, boolean>();
  private floors: FloorInfo[] = [];
  private activeFloor: string | null = null;
  private floorOffsetY = 0;
  private bounds = new THREE.Box3(new THREE.Vector3(-10, 0, -10), new THREE.Vector3(10, 4, 10));
  private modelLoaded = false;
  private grid: THREE.GridHelper | null = null;
  private frame = 0;
  private renders = 0;
  private lost = false;
  private disposed = false;
  private dragging = false;
  private pointerStart: { x: number; y: number; id: number } | null = null;
  private layerNodes = new Map<string, THREE.Object3D[]>();
  private readonly listeners: Array<() => void> = [];

  constructor(private readonly host: HTMLElement, private readonly callbacks: SceneCallbacks, theme: "light" | "dark") {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.localClippingEnabled = true;
    const canvas = this.renderer.domElement;
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.touchAction = "none";
    canvas.tabIndex = 0;
    canvas.setAttribute("aria-label", "Khung nhìn 3D của kịch bản");
    host.append(canvas);

    this.scene.add(this.hemi, this.sun, this.modelGroup, this.markerGroup, this.helperGroup);
    this.sun.position.set(16, 24, 14);
    this.modelGroup.matrixAutoUpdate = false;
    this.camera.position.set(14, 11, 14);

    this.orbit = new OrbitControls(this.camera, canvas);
    this.orbit.enableDamping = false; // damping would need a render loop; the viewport renders only on change
    this.orbit.screenSpacePanning = true;
    this.orbit.maxPolarAngle = Math.PI * 0.495;
    this.orbit.listenToKeyEvents(canvas);
    this.orbit.addEventListener("change", this.onCameraChange);

    this.transform = new TransformControls(this.camera, canvas);
    this.transform.setSize(0.9);
    this.transform.addEventListener("change", this.requestRender);
    this.transform.addEventListener("dragging-changed", this.onDraggingChanged as never);
    this.transform.addEventListener("objectChange", this.onObjectChange);
    this.scene.add(this.transform.getHelper());

    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("webglcontextlost", this.onContextLost as EventListener);
    canvas.addEventListener("webglcontextrestored", this.onContextRestored);
    document.addEventListener("visibilitychange", this.onVisibility);

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.setTheme(theme);
    this.rebuildGrid();
    this.resize();
    this.exposeDebug();
  }

  // ───────── lifecycle ─────────

  private readonly onVisibility = () => { if (!document.hidden) this.requestRender(); };

  private readonly onContextLost = (event: Event) => {
    event.preventDefault();
    this.lost = true;
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.callbacks.onContextLost();
  };

  private readonly onContextRestored = () => {
    this.lost = false;
    this.callbacks.onContextRestored();
    this.requestRender();
  };

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    const canvas = this.renderer.domElement;
    canvas.removeEventListener("pointerdown", this.onPointerDown);
    canvas.removeEventListener("pointerup", this.onPointerUp);
    canvas.removeEventListener("webglcontextlost", this.onContextLost as EventListener);
    canvas.removeEventListener("webglcontextrestored", this.onContextRestored);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.orbit.removeEventListener("change", this.onCameraChange);
    this.orbit.stopListenToKeyEvents();
    this.orbit.dispose();
    this.transform.detach();
    this.transform.dispose();
    this.disposeModel();
    this.markerGroup.clear();
    this.helperGroup.clear();
    this.grid?.dispose();
    Object.values(this.geometries).forEach((geometry) => geometry.dispose());
    Object.values(this.materials).forEach((material) => material.dispose());
    const memory = this.renderer.info.memory;
    const afterDispose = { geometries: memory.geometries, textures: memory.textures };
    this.renderer.dispose();
    // Release the GPU context now instead of waiting for GC (browsers cap live contexts). Skipped when already lost:
    // WEBGL_lose_context is unavailable on a lost context and three.js would warn.
    if (!this.lost) this.renderer.forceContextLoss();
    canvas.remove();
    this.listeners.forEach((off) => off());
    const log = (window as unknown as { __fire3dEditorLog?: unknown[] }).__fire3dEditorLog;
    if (log) log.push({ event: "dispose", ...afterDispose });
    const hook = window as unknown as { __fire3dEditorScene?: unknown };
    if (this.debug) delete hook.__fire3dEditorScene;
  }

  private disposeModel() {
    this.modelGroup.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose();
      }
    });
    disposeObject3D(this.modelGroup);
    this.layerNodes.clear();
  }

  // ───────── rendering (on demand) ─────────

  readonly requestRender = () => {
    if (this.disposed || this.lost || this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.renderNow();
    });
  };

  private renderNow() {
    if (this.disposed || this.lost || document.hidden) return;
    const { clientWidth, clientHeight } = this.host;
    if (!clientWidth || !clientHeight) return;
    this.renders += 1;
    this.renderer.render(this.scene, this.camera);
    this.callbacks.onFrame?.();
  }

  private resize() {
    if (this.disposed) return;
    const { clientWidth, clientHeight } = this.host;
    if (!clientWidth || !clientHeight) return;
    this.renderer.setSize(clientWidth, clientHeight, false);
    this.camera.aspect = clientWidth / clientHeight;
    this.camera.updateProjectionMatrix();
    this.requestRender();
  }

  setTheme(theme: "light" | "dark") {
    this.palette = PALETTES[theme];
    const p = this.palette;
    this.renderer.setClearColor(p.clear);
    this.hemi.color.set(p.hemiSky);
    this.hemi.groundColor.set(p.hemiGround);
    this.hemi.intensity = p.hemiIntensity;
    this.sun.color.set(p.sun);
    this.sun.intensity = p.sunIntensity;
    this.rebuildMaterials();
    this.rebuildGrid();
    this.applyInputs();
    this.requestRender();
  }

  // ───────── model ─────────

  hasModel() { return this.modelLoaded; }

  /** Fetch with progress/abort (not GLTFLoader.load) so HTTP status — e.g. an expired signed URL (403) — is visible to the caller. */
  async loadModel(url: string, source: { coordinateTransform: unknown; floors: FloorInfo[]; semanticMapping: unknown; applyTransform?: boolean }, onProgress: (fraction: number | null) => void, signal: AbortSignal): Promise<ModelInfo> {
    let response: Response;
    try {
      response = await fetch(url, { signal, credentials: "omit" });
    } catch (cause) {
      if (signal.aborted) throw cause;
      throw new ModelLoadError("Không tải được tệp mô hình (lỗi mạng hoặc bị chặn CORS).");
    }
    if (!response.ok) throw new ModelLoadError(`Máy chủ lưu trữ trả mã ${response.status} khi tải mô hình.`, response.status);
    const total = Number(response.headers.get("content-length")) || 0;
    const reader = response.body?.getReader();
    let buffer: ArrayBuffer;
    if (reader) {
      const chunks: Uint8Array[] = [];
      let received = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        onProgress(total ? Math.min(received / total, 1) : null);
      }
      const merged = new Uint8Array(received);
      let offset = 0;
      for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.length; }
      buffer = merged.buffer;
    } else {
      buffer = await response.arrayBuffer();
    }
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    let gltf;
    try {
      gltf = await new GLTFLoader().parseAsync(buffer, "");
    } catch {
      throw new ModelLoadError("Tệp mô hình không phải GLB hợp lệ hoặc dùng nén chưa được hỗ trợ (Draco/Meshopt/KTX2).");
    }
    if (this.disposed || signal.aborted) {
      disposeObject3D(gltf.scene);
      throw new DOMException("Aborted", "AbortError");
    }
    this.disposeModel();
    const transform = interpretCoordinateTransform(source.coordinateTransform);
    // Legacy drafts assume `coordinateTransform` places the model in scenario space. In `fet3d.editor/1` the GLB IS the
    // scene space and `coordinateTransform` (IFC -> GLB) is never applied to the model or to objects.
    if (source.applyTransform !== false && transform.ok && !transform.isIdentity) this.modelGroup.matrix.fromArray(transform.values);
    else this.modelGroup.matrix.identity();
    this.modelGroup.add(gltf.scene);
    this.modelGroup.updateMatrixWorld(true);

    let meshes = 0;
    let triangles = 0;
    const named = new Map<string, THREE.Object3D[]>();
    gltf.scene.traverse((object) => {
      if (object.name) named.set(object.name, [...(named.get(object.name) ?? []), object]);
      if (!(object instanceof THREE.Mesh)) return;
      meshes += 1;
      const geometry = object.geometry as THREE.BufferGeometry;
      triangles += (geometry.index ? geometry.index.count : geometry.getAttribute("position")?.count ?? 0) / 3;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials as THREE.Material[]) {
        material.clippingPlanes = [this.clipPlane];
        material.needsUpdate = true;
      }
    });
    this.bounds.setFromObject(this.modelGroup);
    if (this.bounds.isEmpty()) this.bounds.set(new THREE.Vector3(-10, 0, -10), new THREE.Vector3(10, 4, 10));
    const size = this.bounds.getSize(new THREE.Vector3());

    const layers = parseLayers(source.semanticMapping).filter((layer) => layer.nodeNames.some((name) => named.has(name)));
    this.layerNodes = new Map(layers.map((layer) => [layer.key, layer.nodeNames.flatMap((name) => named.get(name) ?? [])]));
    this.floors = source.floors;
    const elevations = source.floors.map((floor) => floor.elevation).filter((value): value is number => value !== null);
    const floorsOutsideModel = elevations.length > 0 && elevations.every((value) => value < this.bounds.min.y - 1 || value > this.bounds.max.y + 1);
    this.modelLoaded = true;
    this.rebuildGrid();
    this.resetCamera();
    this.applyFloor();
    this.updateMarkerScale();
    this.requestRender();
    return {
      meshes, triangles: Math.round(triangles), size: [round3(size.x), round3(size.y), round3(size.z)], minY: round3(this.bounds.min.y), maxY: round3(this.bounds.max.y),
      transform, layers, floorsOutsideModel,
    };
  }

  // ───────── floors, layers, camera ─────────

  /** Floors known without a model (v1 has them from the floors API), so floor elevation works before the GLB is loaded. */
  setFloors(floors: FloorInfo[]) {
    this.floors = floors;
    this.applyFloor();
    this.requestRender();
  }

  setFloor(key: string | null) {
    this.activeFloor = key;
    this.applyFloor();
    this.requestRender();
  }

  private floorElevation(): number {
    const floor = this.activeFloor ? this.floors.find((item) => item.key === this.activeFloor) : undefined;
    return floor?.elevation ?? this.bounds.min.y;
  }

  private applyFloor() {
    const floor = this.activeFloor ? this.floors.find((item) => item.key === this.activeFloor) : undefined;
    const elevations = this.floors.map((item) => item.elevation).filter((value): value is number => value !== null);
    const usable = floor?.elevation != null && !(elevations.every((value) => value < this.bounds.min.y - 1 || value > this.bounds.max.y + 1));
    const ceiling = usable && this.activeFloor ? floorCeiling(this.floors, this.activeFloor) : null;
    this.clipPlane.constant = ceiling === null ? NO_CLIP : ceiling - 0.02;
    this.floorOffsetY = usable ? (floor?.elevation ?? this.bounds.min.y) : this.bounds.min.y;
    if (this.grid) this.grid.position.y = this.floorOffsetY + 0.01;
  }

  setLayerVisible(key: string, visible: boolean) {
    const nodes = this.layerNodes.get(key);
    if (nodes) nodes.forEach((node) => { node.visible = visible; });
    else {
      this.markerLayers.set(key, visible);
      this.applyInputs();
    }
    this.requestRender();
  }

  setModelVisible(visible: boolean) {
    this.modelGroup.visible = visible;
    this.requestRender();
  }

  resetCamera() {
    const center = this.bounds.getCenter(new THREE.Vector3());
    const size = this.bounds.getSize(new THREE.Vector3());
    const radius = Math.max(size.length() / 2, 5);
    // Fit the bounding sphere into the narrower of the vertical/horizontal field of view.
    const vFov = THREE.MathUtils.degToRad(this.camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * this.camera.aspect);
    const distance = (radius / Math.sin(Math.min(vFov, hFov) / 2)) * 1.05;
    this.orbit.target.copy(center);
    this.camera.position.copy(center).add(new THREE.Vector3(0.55, 0.85, 0.75).normalize().multiplyScalar(distance));
    this.camera.near = Math.max(distance / 1000, 0.05);
    this.camera.far = Math.max(distance * 30, 200);
    this.camera.updateProjectionMatrix();
    this.orbit.update();
    this.rebuildGrid();
    this.requestRender();
  }

  /** Moves the camera towards (factor < 1) or away from (> 1) the orbit target. Client-only view control. */
  zoomBy(factor: number) {
    const offset = this.camera.position.clone().sub(this.orbit.target);
    const distance = THREE.MathUtils.clamp(offset.length() * factor, 1.5, Math.max(this.camera.far * 0.5, 50));
    this.camera.position.copy(this.orbit.target).add(offset.setLength(distance));
    this.orbit.update();
    this.requestRender();
  }

  /** Locking freezes orbit/pan/zoom so the view cannot move by accident while editing objects. */
  setCameraLocked(locked: boolean) {
    this.orbit.enabled = !locked;
  }

  /** Pixel position (inside the viewport) of the selected marker, or null when nothing is selected or it is off screen. */
  selectionScreen(): { x: number; y: number } | null {
    const marker = this.inputs.selection ? this.markers.get(markerKey(this.inputs.selection)) : undefined;
    if (!marker) return null;
    const point = marker.getWorldPosition(new THREE.Vector3()).project(this.camera);
    if (point.z > 1 || Math.abs(point.x) > 1.05 || Math.abs(point.y) > 1.05) return null;
    return { x: Math.round((point.x * 0.5 + 0.5) * this.host.clientWidth), y: Math.round((-point.y * 0.5 + 0.5) * this.host.clientHeight) };
  }

  focusSelection() {
    const marker = this.inputs.selection ? this.markers.get(markerKey(this.inputs.selection)) : undefined;
    if (!marker) return;
    const offset = this.camera.position.clone().sub(this.orbit.target);
    const distance = Math.min(Math.max(offset.length(), 6), 14);
    this.orbit.target.copy(marker.position);
    this.camera.position.copy(marker.position).add(offset.setLength(distance));
    this.orbit.update();
    this.requestRender();
  }

  /** World point under the view centre on the active floor: where "add at view centre" puts a new object. */
  viewCentre(): { x: number; y: number; z: number } {
    return { x: round3(this.orbit.target.x), y: round3(this.floorElevation()), z: round3(this.orbit.target.z) };
  }

  private rebuildGrid() {
    if (this.grid) {
      this.helperGroup.remove(this.grid);
      this.grid.dispose();
    }
    const extent = Math.max(this.bounds.getSize(new THREE.Vector3()).length() * 0.8, 20);
    const size = Math.ceil(extent / 10) * 10;
    this.grid = new THREE.GridHelper(size, Math.min(size, 100), this.palette.gridMajor, this.palette.gridMinor);
    const center = this.bounds.getCenter(new THREE.Vector3());
    this.grid.position.set(center.x, this.floorOffsetY + 0.01, center.z);
    this.helperGroup.add(this.grid);
  }

  // ───────── markers ─────────

  private rebuildMaterials() {
    const p = this.palette;
    const make = (key: string, color: number, opacity = 1, emissive = 0.35) => {
      const existing = this.materials[key] as THREE.MeshStandardMaterial | undefined;
      if (existing) {
        existing.color.set(color);
        existing.emissive.set(color);
        return;
      }
      // Markers ignore depth so walls never hide them: placement would be guesswork otherwise.
      this.materials[key] = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: emissive, transparent: opacity < 1, opacity, roughness: 0.6, metalness: 0.05, depthTest: false });
    };
    make("spawn", p.spawn);
    make("fire", p.fire, 1, 0.5);
    make("smoke", p.smoke, 0.7, 0.1);
    make("wind", p.wind);
    make("other", p.other);
    make("goal", p.goal);
    make("npc", p.npc);
    make("blocked", p.blocked, 0.9, 0.3);
    make("equipment", p.equipment);
    const ring = this.materials.ring as THREE.MeshBasicMaterial | undefined;
    if (ring) ring.color.set(p.selected);
    else this.materials.ring = new THREE.MeshBasicMaterial({ color: p.selected, side: THREE.DoubleSide, transparent: true, opacity: 0.95, depthTest: false });
    const plane = this.materials.floor as THREE.MeshBasicMaterial | undefined;
    if (plane) plane.color.set(p.floorPlane);
  }

  private geometry(key: string, create: () => THREE.BufferGeometry) {
    return (this.geometries[key] ??= create());
  }

  private buildMarker(kind: string, variant: string): THREE.Group {
    const group = new THREE.Group();
    const mesh = (geometryKey: string, create: () => THREE.BufferGeometry, material: string, setup?: (m: THREE.Mesh) => void) => {
      const m = new THREE.Mesh(this.geometry(geometryKey, create), this.materials[material]);
      m.renderOrder = 10;
      setup?.(m);
      group.add(m);
      return m;
    };
    const figure = (material: string) => {
      mesh("spawn-body", () => new THREE.CylinderGeometry(0.16, 0.2, 0.75, 16), material, (m) => { m.position.y = 0.45; });
      mesh("spawn-head", () => new THREE.SphereGeometry(0.17, 16, 12), material, (m) => { m.position.y = 1.0; });
    };
    if (variant === "spawn" || variant === "Spawn") {
      figure("spawn");
      mesh("spawn-arrow", () => new THREE.ConeGeometry(0.14, 0.4, 16), "spawn", (m) => { m.rotation.x = Math.PI / 2; m.position.set(0, 0.06, 0.5); });
    } else if (variant === "Npc") {
      figure("npc");
      mesh("npc-hat", () => new THREE.ConeGeometry(0.12, 0.26, 12), "npc", (m) => { m.position.y = 1.28; });
    } else if (variant === "Goal") {
      mesh("goal-pole", () => new THREE.CylinderGeometry(0.04, 0.04, 1.5, 10), "goal", (m) => { m.position.y = 0.75; });
      mesh("goal-flag", () => new THREE.BoxGeometry(0.55, 0.34, 0.04), "goal", (m) => { m.position.set(0.3, 1.3, 0); });
      mesh("goal-base", () => new THREE.CylinderGeometry(0.3, 0.3, 0.05, 20), "goal", (m) => { m.position.y = 0.03; });
    } else if (variant === "BlockedElement") {
      mesh("blocked-slab", () => new THREE.BoxGeometry(0.9, 1.4, 0.12), "blocked", (m) => { m.position.y = 0.7; });
      mesh("blocked-bar-a", () => new THREE.BoxGeometry(1.15, 0.1, 0.16), "other", (m) => { m.position.y = 0.7; m.rotation.z = Math.PI / 4; });
      mesh("blocked-bar-b", () => new THREE.BoxGeometry(1.15, 0.1, 0.16), "other", (m) => { m.position.y = 0.7; m.rotation.z = -Math.PI / 4; });
    } else if (variant === "Equipment") {
      mesh("equipment-box", () => new THREE.BoxGeometry(0.4, 0.55, 0.4), "equipment", (m) => { m.position.y = 0.32; });
      mesh("equipment-cap", () => new THREE.CylinderGeometry(0.08, 0.08, 0.12, 12), "other", (m) => { m.position.y = 0.66; });
    } else if (variant === "Hazard" || variant === "fire" || variant === "Fire") {
      mesh("fire-cone", () => new THREE.ConeGeometry(0.36, 1.0, 20), "fire", (m) => { m.position.y = 0.5; });
      mesh("fire-core", () => new THREE.ConeGeometry(0.18, 0.62, 16), "other", (m) => { m.position.y = 0.34; });
    } else if (variant === "smoke" || variant === "Smoke") {
      mesh("smoke-puff", () => new THREE.SphereGeometry(0.5, 20, 14), "smoke", (m) => { m.position.y = 0.62; });
      mesh("smoke-puff-2", () => new THREE.SphereGeometry(0.32, 16, 12), "smoke", (m) => { m.position.set(0.28, 0.95, 0.05); });
    } else if (variant === "wind" || variant === "Wind") {
      mesh("wind-shaft", () => new THREE.CylinderGeometry(0.06, 0.06, 0.9, 12), "wind", (m) => { m.rotation.x = Math.PI / 2; m.position.set(0, 0.5, -0.1); });
      mesh("wind-head", () => new THREE.ConeGeometry(0.18, 0.4, 16), "wind", (m) => { m.rotation.x = Math.PI / 2; m.position.set(0, 0.5, 0.55); });
    } else {
      mesh("other-gem", () => new THREE.OctahedronGeometry(0.38), "other", (m) => { m.position.y = 0.5; });
    }
    const ring = mesh("ring", () => new THREE.TorusGeometry(0.62, 0.04, 8, 48), "ring", (m) => { m.rotation.x = Math.PI / 2; m.position.y = 0.04; });
    ring.name = "selection-ring";
    ring.visible = false;
    group.userData = { kind, variant };
    return group;
  }

  setInputs(inputs: SceneInputs) {
    this.inputs = inputs;
    this.applyInputs();
    this.requestRender();
  }

  private applyInputs() {
    const { markers, selection, tool } = this.inputs;
    const wanted = new Set<string>();
    for (const input of markers) {
      const key = markerKey(input);
      wanted.add(key);
      let marker = this.markers.get(key);
      if (marker && marker.userData.variant !== input.variant) {
        if (this.transform.object === marker) this.transform.detach();
        this.markerGroup.remove(marker);
        this.markers.delete(key);
        marker = undefined;
      }
      if (!marker) {
        marker = this.buildMarker(input.kind, input.variant);
        this.markers.set(key, marker);
        this.markerGroup.add(marker);
      }
      marker.userData.index = input.index;
      marker.userData.kind = input.kind;
      const isSelected = selection !== null && markerKey(selection) === key;
      if (!(this.dragging && isSelected)) {
        marker.position.set(input.position.x, input.position.y, input.position.z);
        if (input.quaternion) marker.quaternion.set(input.quaternion.x, input.quaternion.y, input.quaternion.z, input.quaternion.w);
        else marker.rotation.set(0, (input.yawDegrees ?? 0) * DEG, 0);
      }
      marker.visible = this.markerLayers.get(input.layer) !== false;
      const ring = marker.getObjectByName("selection-ring");
      if (ring) ring.visible = isSelected;
      marker.userData.dormant = input.dormant ?? false;
      marker.scale.setScalar(this.markerScale * (input.dormant ? 0.6 : 1));
    }
    for (const [key, marker] of [...this.markers]) {
      if (wanted.has(key)) continue;
      if (this.transform.object === marker) this.transform.detach();
      this.markerGroup.remove(marker);
      this.markers.delete(key);
    }
    // Gizmo follows the selected object only for the move/rotate tools.
    const target = selection && (tool === "move" || tool === "rotate") ? this.markers.get(markerKey(selection)) : undefined;
    if (target && target.visible) {
      if (this.transform.object !== target) this.transform.attach(target);
      this.transform.setMode(tool === "rotate" ? "rotate" : "translate");
      this.transform.showX = tool !== "rotate";
      this.transform.showZ = tool !== "rotate";
      this.transform.showY = true;
    } else if (this.transform.object) {
      this.transform.detach();
    }
  }

  private markerScale = 1;

  private readonly onCameraChange = () => {
    this.updateMarkerScale();
    this.requestRender();
  };

  private updateMarkerScale() {
    const distance = this.camera.position.distanceTo(this.orbit.target);
    const next = Math.max(1, distance / 16);
    if (Math.abs(next - this.markerScale) < 0.02) return;
    this.markerScale = next;
    this.markers.forEach((marker) => marker.scale.setScalar(this.markerScale * (marker.userData.dormant ? 0.6 : 1)));
  }

  // ───────── gizmo ─────────

  private readonly onDraggingChanged = (event: { value: boolean }) => {
    this.dragging = event.value;
    this.orbit.enabled = !event.value;
    const marker = this.transform.object as THREE.Group | undefined;
    if (!marker) return;
    this.callbacks.onTransform({ kind: marker.userData.kind as string, index: marker.userData.index as number }, null, event.value ? "start" : "end");
  };

  private readonly onObjectChange = () => {
    const marker = this.transform.object as THREE.Group | undefined;
    if (!marker) return;
    const q = marker.quaternion;
    const yaw = Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.z * q.z));
    const degrees = ((yaw / DEG) % 360 + 360) % 360;
    this.callbacks.onTransform({ kind: marker.userData.kind as string, index: marker.userData.index as number }, {
      position: { x: round3(marker.position.x), y: round3(marker.position.y), z: round3(marker.position.z) },
      yawDegrees: round3(degrees),
      quaternion: { x: q.x, y: q.y, z: q.z, w: q.w },
    }, "change");
  };

  // ───────── picking ─────────

  private readonly onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || this.dragging) return;
    this.pointerStart = { x: event.clientX, y: event.clientY, id: event.pointerId };
  };

  private readonly onPointerUp = (event: PointerEvent) => {
    const start = this.pointerStart;
    this.pointerStart = null;
    if (!start || start.id !== event.pointerId || this.dragging) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) return;
    this.pick(event.clientX, event.clientY);
  };

  private ndc(clientX: number, clientY: number) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  }

  private modelHit(): THREE.Intersection | null {
    const hits = this.raycaster.intersectObject(this.modelGroup, true);
    for (const hit of hits) {
      let visible = true;
      for (let node: THREE.Object3D | null = hit.object; node; node = node.parent) if (!node.visible) { visible = false; break; }
      if (visible && hit.point.y <= this.clipPlane.constant) return hit;
    }
    return null;
  }

  private pick(clientX: number, clientY: number) {
    this.raycaster.setFromCamera(this.ndc(clientX, clientY), this.camera);
    const { tool } = this.inputs;
    if (tool === "place") {
      const hit = this.modelHit();
      let point: THREE.Vector3 | null = hit ? hit.point.clone() : null;
      if (!point) {
        point = this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.floorElevation()), new THREE.Vector3());
      }
      if (point) this.callbacks.onPlace(this.inputs.placeKind, { x: round3(point.x), y: round3(point.y), z: round3(point.z) });
      return;
    }
    const markerHits = this.raycaster.intersectObjects([...this.markers.values()].filter((marker) => marker.visible), true);
    const first = markerHits.find((hit) => hit.object.name !== "selection-ring") ?? markerHits[0];
    if (first) {
      let node: THREE.Object3D | null = first.object;
      while (node && !node.userData.kind) node = node.parent;
      if (node) {
        this.callbacks.onSelect({ kind: node.userData.kind as string, index: node.userData.index as number });
        return;
      }
    }
    const hit = this.modelHit();
    this.callbacks.onSelect(null);
    this.callbacks.onModelPick(hit ? { name: this.nameOf(hit.object), point: { x: round3(hit.point.x), y: round3(hit.point.y), z: round3(hit.point.z) } } : null);
  }

  private nameOf(object: THREE.Object3D): string {
    for (let node: THREE.Object3D | null = object; node; node = node.parent) if (node.name) return node.name;
    return "(không tên)";
  }

  // ───────── debug / test hook ─────────

  private debug = false;

  private exposeDebug() {
    try {
      this.debug = window.localStorage.getItem("fire3d-editor-debug") === "1";
    } catch {
      this.debug = false;
    }
    if (!this.debug) return;
    // Must be fetched while the context is alive: getExtension returns null on a lost context.
    const loseExt = this.renderer.getContext().getExtension("WEBGL_lose_context");
    const w = window as unknown as Record<string, unknown>;
    w.__fire3dEditorLog = w.__fire3dEditorLog ?? [];
    w.__fire3dEditorScene = {
      stats: (): DebugStats => ({ renders: this.renders, geometries: this.renderer.info.memory.geometries, textures: this.renderer.info.memory.textures, programs: this.renderer.info.programs?.length ?? 0, lost: this.lost, markers: this.markers.size }),
      /** Client pixel of a marker's centre, for driving real pointer events in tests. */
      project: (kind: string, index: number) => {
        const marker = this.markers.get(`${kind}:${index}`);
        if (!marker) return null;
        const p = marker.position.clone().add(new THREE.Vector3(0, 0.5 * this.markerScale, 0)).project(this.camera);
        const rect = this.renderer.domElement.getBoundingClientRect();
        return { x: rect.left + ((p.x + 1) / 2) * rect.width, y: rect.top + ((1 - p.y) / 2) * rect.height };
      },
      /** Client pixel of the top centre of a named model node (glTF node name), to drive real picking of model elements in tests. */
      projectNode: (name: string) => {
        let found: THREE.Object3D | undefined;
        this.modelGroup.traverse((object) => { if (!found && object.name === name) found = object; });
        if (!found) return null;
        const box = new THREE.Box3().setFromObject(found);
        const top = new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y - 0.02, (box.min.z + box.max.z) / 2).project(this.camera);
        const rect = this.renderer.domElement.getBoundingClientRect();
        return { x: rect.left + ((top.x + 1) / 2) * rect.width, y: rect.top + ((1 - top.y) / 2) * rect.height };
      },
      /** Runs the gizmo callbacks as one drag gesture (start, change, end) on the attached marker, in world space. TransformControls itself is not exercised. */
      simulateDrag: (kind: string, index: number, position: Point3, yawDegrees?: number) => {
        const marker = this.markers.get(`${kind}:${index}`);
        if (!marker || this.transform.object !== marker) return false;
        this.onDraggingChanged({ value: true });
        marker.position.set(position.x, position.y, position.z);
        if (yawDegrees !== undefined) marker.rotation.set(0, yawDegrees * DEG, 0);
        this.onObjectChange();
        this.onDraggingChanged({ value: false });
        return true;
      },
      loseContext: () => loseExt?.loseContext(),
      restoreContext: () => loseExt?.restoreContext(),
      markerPosition: (kind: string, index: number) => this.markers.get(`${kind}:${index}`)?.position.toArray() ?? null,
      clipConstant: () => this.clipPlane.constant,
      gizmoAttached: () => Boolean(this.transform.object),
    };
  }
}
