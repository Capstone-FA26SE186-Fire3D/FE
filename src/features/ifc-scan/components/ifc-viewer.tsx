"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { IfcMeshData, LoadedIfcModel } from "../ifc-loader";
import type { IfcCategory } from "../types";

export type IfcViewPreset = "iso" | "top" | "front";
export type IfcColorMode = "category" | "ifc";

export type IfcViewerHandle = {
  resetView: () => void;
  setView: (preset: IfcViewPreset) => void;
  focusSelection: () => void;
};

export type IfcViewerProps = {
  model: LoadedIfcModel | null;
  selectedExpressID: number | null;
  onSelect?: (expressID: number | null) => void;
  hiddenCategories?: ReadonlySet<IfcCategory>;
  storeyID?: number | null;
  /** Absolute height (viewer metres) of a horizontal section plane, or null for no cut. */
  sectionHeight?: number | null;
  xray?: boolean;
  colorMode?: IfcColorMode;
  showEdges?: boolean;
};

/** Category palette chosen for legibility on the dark canvas; IFC files rarely carry useful colours. */
export const categoryPalette: Record<IfcCategory, { color: number; opacity: number }> = {
  wall: { color: 0xe3ddd3, opacity: 1 },
  slab: { color: 0xa9a299, opacity: 1 },
  roof: { color: 0x9c6a52, opacity: 1 },
  door: { color: 0xd9824a, opacity: 1 },
  window: { color: 0x8fc8de, opacity: 0.38 },
  stair: { color: 0x5fb8a2, opacity: 1 },
  railing: { color: 0x8f9aa0, opacity: 1 },
  structure: { color: 0xc8c0b4, opacity: 1 },
  space: { color: 0x5fd39a, opacity: 0.16 },
  furniture: { color: 0xa3937e, opacity: 1 },
  equipment: { color: 0xf0604c, opacity: 1 },
  site: { color: 0x56645a, opacity: 1 },
  other: { color: 0xbcb5aa, opacity: 1 },
};

type ViewerRuntime = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  grid: THREE.GridHelper;
  model: LoadedIfcModel | null;
  materials: Map<string, THREE.MeshStandardMaterial>;
  highlight: THREE.MeshStandardMaterial;
  clipPlane: THREE.Plane;
  props: IfcViewerProps;
};

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function meshData(mesh: THREE.Object3D) {
  return mesh.userData as IfcMeshData;
}

function materialFor(runtime: ViewerRuntime, data: IfcMeshData): THREE.MeshStandardMaterial {
  const { colorMode = "category", xray = false } = runtime.props;
  const palette = categoryPalette[data.category];
  const [r, g, b, a] = data.ifcColor;
  const base = colorMode === "ifc" ? { color: new THREE.Color(r, g, b), opacity: Math.max(0.15, a) } : { color: new THREE.Color(palette.color), opacity: palette.opacity };
  const opacity = xray ? Math.min(base.opacity, 0.1) : base.opacity;
  const key = `${base.color.getHexString()}:${opacity.toFixed(2)}`;
  let material = runtime.materials.get(key);
  if (!material) {
    material = new THREE.MeshStandardMaterial({
      color: base.color,
      opacity,
      transparent: opacity < 0.99,
      depthWrite: opacity >= 0.99,
      roughness: 0.86,
      metalness: 0.02,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
    runtime.materials.set(key, material);
  }
  return material;
}

function isMeshVisible(runtime: ViewerRuntime, data: IfcMeshData) {
  const { hiddenCategories, storeyID = null } = runtime.props;
  if (hiddenCategories?.has(data.category)) return false;
  return storeyID === null || data.storeyID === storeyID;
}

/** Re-applies every display option to the loaded meshes. Cheap enough to run on each option change. */
function applyDisplay(runtime: ViewerRuntime) {
  const model = runtime.model;
  if (!model) return;
  const { selectedExpressID = null, sectionHeight = null, showEdges = true, xray = false } = runtime.props;
  const planes = sectionHeight === null ? [] : [runtime.clipPlane];
  runtime.clipPlane.constant = sectionHeight ?? 0;
  runtime.highlight.clippingPlanes = planes;
  runtime.materials.forEach((material) => { material.clippingPlanes = planes; });

  for (const mesh of model.meshes) {
    const data = meshData(mesh);
    mesh.visible = isMeshVisible(runtime, data);
    mesh.material = data.expressID === selectedExpressID ? runtime.highlight : materialFor(runtime, data);
    mesh.renderOrder = data.expressID === selectedExpressID ? 2 : 0;
    for (const child of mesh.children) {
      if (!(child instanceof THREE.LineSegments)) continue;
      child.visible = showEdges && !xray;
      (child.material as THREE.LineBasicMaterial).clippingPlanes = planes;
    }
  }
}

/** Terrain and room volumes would dwarf the building, so framing ignores them unless nothing else is shown. */
const framingIgnores = new Set<IfcCategory>(["site", "space"]);

function visibleBounds(runtime: ViewerRuntime, focusExpressID?: number | null, includeContext = false) {
  const bounds = new THREE.Box3();
  for (const mesh of runtime.model?.meshes ?? []) {
    const data = meshData(mesh);
    if (focusExpressID !== null && focusExpressID !== undefined ? data.expressID !== focusExpressID : !mesh.visible) continue;
    if ((focusExpressID === null || focusExpressID === undefined) && !includeContext && framingIgnores.has(data.category)) continue;
    mesh.geometry.computeBoundingBox();
    if (mesh.geometry.boundingBox) bounds.union(mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld));
  }
  return bounds;
}

function frame(runtime: ViewerRuntime, preset: IfcViewPreset, focusExpressID?: number | null) {
  let bounds = visibleBounds(runtime, focusExpressID);
  if (bounds.isEmpty()) bounds = visibleBounds(runtime, null, true);
  if (bounds.isEmpty()) return;
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const radius = Math.max(size.length() / 2, 1.5);
  const distance = radius / Math.sin(THREE.MathUtils.degToRad(runtime.camera.fov / 2)) * (focusExpressID ? 1.6 : 0.78);
  const direction = preset === "top" ? new THREE.Vector3(0, 1, 0.0001) : preset === "front" ? new THREE.Vector3(0, 0.08, 1) : new THREE.Vector3(1, 0.72, 1.15);

  runtime.controls.target.copy(center);
  runtime.camera.position.copy(center).addScaledVector(direction.normalize(), distance);
  runtime.camera.near = Math.max(distance / 2_000, 0.02);
  runtime.camera.far = Math.max(distance * 30, 200);
  runtime.camera.updateProjectionMatrix();
  runtime.controls.update();
}

function placeGrid(runtime: ViewerRuntime) {
  const bounds = visibleBounds(runtime, null, true);
  runtime.grid.visible = !bounds.isEmpty();
  if (bounds.isEmpty()) return;
  const size = bounds.getSize(new THREE.Vector3());
  const extent = Math.max(size.x, size.z) * 1.6 + 10;
  runtime.grid.scale.setScalar(extent / 100);
  // Rest the grid on the lowest substantial storey (ground floor), not under piles or foundations.
  const storeys = runtime.model?.storeys ?? [];
  const total = storeys.reduce((sum, storey) => sum + storey.elementCount, 0);
  const ground = storeys.find((storey) => storey.elevation !== null && storey.elementCount >= total * 0.15)?.elevation ?? bounds.min.y;
  runtime.grid.position.set((bounds.min.x + bounds.max.x) / 2, ground - 0.02, (bounds.min.z + bounds.max.z) / 2);
}

export const IfcViewer = forwardRef<IfcViewerHandle, IfcViewerProps>(function IfcViewer(props, ref) {
  const hostRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<ViewerRuntime | null>(null);
  const onSelectRef = useRef(props.onSelect);
  onSelectRef.current = props.onSelect;

  useImperativeHandle(ref, () => ({
    resetView: () => { if (runtimeRef.current) frame(runtimeRef.current, "iso"); },
    setView: (preset) => { if (runtimeRef.current) frame(runtimeRef.current, preset); },
    focusSelection: () => {
      const runtime = runtimeRef.current;
      if (runtime) frame(runtime, "iso", runtime.props.selectedExpressID ?? null);
    },
  }), []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.localClippingEnabled = true;
    renderer.setClearColor(0x0f1416);
    host.append(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x0f1416, 400, 1_600);
    scene.add(new THREE.HemisphereLight(0xf2f6f4, 0x2a2622, 1.9));
    const sun = new THREE.DirectionalLight(0xfff1e2, 2.2);
    sun.position.set(30, 60, 25);
    const fill = new THREE.DirectionalLight(0xbcd6ff, 0.7);
    fill.position.set(-40, 20, -30);
    const grid = new THREE.GridHelper(100, 50, 0x3b4a4f, 0x222c30);
    scene.add(sun, fill, grid);

    const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 1_000);
    camera.position.set(14, 11, 16);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.09;
    controls.maxPolarAngle = Math.PI * 0.495;
    controls.screenSpacePanning = true;

    const runtime: ViewerRuntime = {
      scene, camera, renderer, controls, grid, model: null, materials: new Map(),
      highlight: new THREE.MeshStandardMaterial({ color: 0xff8a4c, emissive: 0x7a2a0c, emissiveIntensity: 0.55, roughness: 0.5, side: THREE.DoubleSide, depthTest: true }),
      clipPlane: new THREE.Plane(new THREE.Vector3(0, -1, 0), 0),
      props,
    };
    runtimeRef.current = runtime;

    const resize = () => {
      const { width, height } = host.getBoundingClientRect();
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    // Click (not drag) picks the nearest visible element that is not above the section cut.
    let downAt: { x: number; y: number } | null = null;
    const onPointerDown = (event: PointerEvent) => { downAt = { x: event.clientX, y: event.clientY }; };
    const onPointerUp = (event: PointerEvent) => {
      if (!downAt || Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y) > 5) { downAt = null; return; }
      downAt = null;
      const meshes = runtime.model?.meshes.filter((mesh) => mesh.visible) ?? [];
      if (!meshes.length) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const cut = runtime.props.sectionHeight ?? null;
      const hit = raycaster.intersectObjects(meshes, false).find((candidate) => {
        if (cut !== null && candidate.point.y > cut) return false;
        const data = meshData(candidate.object);
        return !(runtime.props.xray && data.category === "space");
      });
      onSelectRef.current?.(hit ? meshData(hit.object).expressID : null);
    };
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointerup", onPointerUp);

    let animation = 0;
    const render = () => {
      controls.update();
      renderer.render(scene, camera);
      animation = requestAnimationFrame(render);
    };
    render();

    return () => {
      cancelAnimationFrame(animation);
      observer.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      runtime.materials.forEach((material) => material.dispose());
      runtime.highlight.dispose();
      grid.geometry.dispose();
      (grid.material as THREE.Material).dispose();
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      runtimeRef.current = null;
    };
    // The runtime is created once; later prop changes flow through the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { model, selectedExpressID, hiddenCategories, storeyID, sectionHeight, xray, colorMode, showEdges } = props;

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    if (runtime.model) runtime.scene.remove(runtime.model.group);
    runtime.materials.forEach((material) => material.dispose());
    runtime.materials.clear();
    runtime.model = model;
    runtime.props = props;
    if (!model) return;
    runtime.scene.add(model.group);
    applyDisplay(runtime);
    placeGrid(runtime);
    frame(runtime, "iso");
    // Only a new model resets the camera; display options are handled by the next effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    runtime.props = props;
    applyDisplay(runtime);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedExpressID, hiddenCategories, storeyID, sectionHeight, xray, colorMode, showEdges]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime?.model) return;
    placeGrid(runtime);
    frame(runtime, "iso");
  }, [storeyID]);

  return <div ref={hostRef} className="ifc-viewer" role="img" aria-label="Mô hình IFC ba chiều" />;
});
