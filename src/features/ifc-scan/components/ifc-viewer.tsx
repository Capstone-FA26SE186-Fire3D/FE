"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { LoadedIfcModel } from "../ifc-loader";

export type IfcViewerHandle = { resetView: () => void };

type IfcViewerProps = {
  model: LoadedIfcModel | null;
  selectedExpressID: number | null;
};

type ViewerRuntime = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  model: LoadedIfcModel | null;
  originalMaterials: Map<THREE.Mesh, THREE.Material | THREE.Material[]>;
  highlight: THREE.MeshStandardMaterial;
};

function fitToModel(runtime: ViewerRuntime, focusExpressID?: number | null) {
  const root = runtime.model?.group;
  if (!root) return;

  let target: THREE.Object3D = root;
  if (focusExpressID !== null && focusExpressID !== undefined) {
    root.traverse((object) => {
      if (object instanceof THREE.Mesh && object.userData.expressID === focusExpressID) target = object;
    });
  }

  target.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3().setFromObject(target);
  if (bounds.isEmpty()) return;
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const distance = Math.max(size.length() * 0.9, 8);

  runtime.controls.target.copy(center);
  runtime.camera.position.copy(center).add(new THREE.Vector3(distance, distance * 0.58, distance));
  runtime.camera.near = Math.max(distance / 1_000, 0.01);
  runtime.camera.far = Math.max(distance * 20, 100);
  runtime.camera.updateProjectionMatrix();
  runtime.controls.update();
}

function restoreMaterials(runtime: ViewerRuntime) {
  runtime.originalMaterials.forEach((material, mesh) => { mesh.material = material; });
  runtime.originalMaterials.clear();
}

export const IfcViewer = forwardRef<IfcViewerHandle, IfcViewerProps>(function IfcViewer({ model, selectedExpressID }, ref) {
  const hostRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<ViewerRuntime | null>(null);

  useImperativeHandle(ref, () => ({ resetView: () => { if (runtimeRef.current) fitToModel(runtimeRef.current); } }), []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x111517);
    host.append(renderer.domElement);

    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xe8f4f0, 0x182022, 2.4));
    const light = new THREE.DirectionalLight(0xffd4bb, 2.6);
    light.position.set(16, 24, 14);
    scene.add(light, new THREE.GridHelper(80, 40, 0x405054, 0x263136));

    const camera = new THREE.PerspectiveCamera(48, 1, 0.01, 1_000);
    camera.position.set(12, 10, 12);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI * 0.48;

    const runtime: ViewerRuntime = {
      scene, camera, renderer, controls, model: null, originalMaterials: new Map(),
      highlight: new THREE.MeshStandardMaterial({ color: 0xee8654, emissive: 0x662510, emissiveIntensity: 0.45, roughness: 0.56 }),
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

    let frame = 0;
    const render = () => {
      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(render);
    };
    render();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      restoreMaterials(runtime);
      runtime.highlight.dispose();
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      runtimeRef.current = null;
    };
  }, []);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    restoreMaterials(runtime);
    if (runtime.model) runtime.scene.remove(runtime.model.group);
    runtime.model = model;
    if (model) {
      runtime.scene.add(model.group);
      fitToModel(runtime);
    }
  }, [model]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    restoreMaterials(runtime);
    if (selectedExpressID === null || !runtime.model) return;

    runtime.model.group.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || object.userData.expressID !== selectedExpressID) return;
      runtime.originalMaterials.set(object, object.material);
      object.material = runtime.highlight;
    });
    fitToModel(runtime, selectedExpressID);
  }, [selectedExpressID, model]);

  return <div ref={hostRef} className="ifc-viewer" role="img" aria-label="Mô hình IFC ba chiều" />;
});
