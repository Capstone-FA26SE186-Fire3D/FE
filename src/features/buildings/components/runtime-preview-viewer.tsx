"use client";

import { RefreshCw, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Button } from "@/components/ui/button";
import { useTheme, type ResolvedTheme } from "@/features/theme/theme-scope";

const MAX_PIXEL_RATIO = 1.5;

const palette: Record<ResolvedTheme, { clear: number; gridMajor: number; gridMinor: number; ground: number; sky: number; sun: number }> = {
  dark: { clear: 0x191d1f, gridMajor: 0x4a5a5f, gridMinor: 0x2b363a, ground: 0x182022, sky: 0xe8f4f0, sun: 0xffd4bb },
  light: { clear: 0xf5f7f7, gridMajor: 0x8d9a9e, gridMinor: 0xc9d1d3, ground: 0xdfe5e6, sky: 0xffffff, sun: 0xfff1e6 },
};

function fitCamera(camera: THREE.PerspectiveCamera, controls: OrbitControls, target: THREE.Object3D) {
  const bounds = new THREE.Box3().setFromObject(target);
  if (bounds.isEmpty()) return;
  const center = bounds.getCenter(new THREE.Vector3());
  const distance = Math.max(bounds.getSize(new THREE.Vector3()).length() * 0.9, 8);
  controls.target.copy(center);
  camera.position.copy(center).add(new THREE.Vector3(distance, distance * 0.58, distance));
  camera.near = Math.max(distance / 1_000, 0.01);
  camera.far = Math.max(distance * 20, 100);
  camera.updateProjectionMatrix();
  controls.update();
}

function disposeModel(root: THREE.Object3D) {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose();
      material.dispose();
    }
  });
}

type ViewerStatus = "loading" | "ready" | "error" | "context-lost";
type Rig = { setTheme: (theme: ResolvedTheme) => void };

/**
 * Orbit viewer for the processed GLB artifact. Renders on demand (no permanent animation loop), caps the pixel
 * ratio, follows the operations theme and releases GPU resources on unmount. `onLoadError` lets the owner fetch
 * a new signed URL (they expire after ~5 minutes); a lost WebGL context can be recovered with a new renderer.
 */
export function RuntimePreviewViewer({ downloadUrl, onLoadError }: { downloadUrl: string; onLoadError?: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const rig = useRef<Rig | null>(null);
  const { resolved } = useTheme();
  const themeRef = useRef(resolved);
  const errorRef = useRef(onLoadError);
  const [status, setStatus] = useState<ViewerStatus>("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    errorRef.current = onLoadError;
  });

  useEffect(() => {
    themeRef.current = resolved;
    rig.current?.setTheme(resolved);
  }, [resolved]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    } catch {
      queueMicrotask(() => { if (!disposed) setStatus("error"); });
      return () => { disposed = true; };
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.append(renderer.domElement);

    const scene = new THREE.Scene();
    const hemisphere = new THREE.HemisphereLight(0xffffff, 0x000000, 2.4);
    const sun = new THREE.DirectionalLight(0xffffff, 2.6);
    sun.position.set(16, 24, 14);
    const grid = new THREE.GridHelper(80, 40);
    scene.add(hemisphere, sun, grid);

    const camera = new THREE.PerspectiveCamera(48, 1, 0.01, 1_000);
    camera.position.set(12, 10, 12);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.maxPolarAngle = Math.PI * 0.48;

    let frame = 0;
    const draw = () => {
      frame = 0;
      if (!disposed) renderer.render(scene, camera);
    };
    const requestRender = () => {
      if (!frame && !disposed) frame = requestAnimationFrame(draw);
    };

    const applyTheme = (theme: ResolvedTheme) => {
      const colors = palette[theme];
      renderer.setClearColor(colors.clear);
      hemisphere.color.setHex(colors.sky);
      hemisphere.groundColor.setHex(colors.ground);
      sun.color.setHex(colors.sun);
      const attribute = grid.geometry.getAttribute("color");
      const major = new THREE.Color(colors.gridMajor);
      const minor = new THREE.Color(colors.gridMinor);
      for (let index = 0; index < attribute.count; index++) {
        // GridHelper(80, 40): 4 vertices per division; the centre line (division 20) is the major colour.
        const color = Math.floor(index / 4) === 20 ? major : minor;
        attribute.setXYZ(index, color.r, color.g, color.b);
      }
      attribute.needsUpdate = true;
      requestRender();
    };
    rig.current = { setTheme: applyTheme };
    applyTheme(themeRef.current);

    controls.addEventListener("change", requestRender);

    const resize = () => {
      const { width, height } = host.getBoundingClientRect();
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      requestRender();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    const canvas = renderer.domElement;
    const onLost = (event: Event) => {
      event.preventDefault();
      setStatus("context-lost");
    };
    const onRestored = () => {
      setStatus("ready");
      requestRender();
    };
    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);

    let model: THREE.Object3D | null = null;
    new GLTFLoader().load(
      downloadUrl,
      (gltf) => {
        if (disposed) {
          disposeModel(gltf.scene);
          return;
        }
        model = gltf.scene;
        scene.add(model);
        fitCamera(camera, controls, model);
        setStatus("ready");
        requestRender();
      },
      undefined,
      () => {
        if (disposed) return;
        setStatus("error");
        errorRef.current?.();
      },
    );

    return () => {
      disposed = true;
      rig.current = null;
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      controls.removeEventListener("change", requestRender);
      controls.dispose();
      if (model) disposeModel(model);
      grid.geometry.dispose();
      (Array.isArray(grid.material) ? grid.material : [grid.material]).forEach((material) => material.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    };
  }, [downloadUrl, attempt]);

  return <div className="ops-preview">
    <div ref={hostRef} role="img" aria-label="Mô hình 3D từ artifact IFC đã xử lý" style={{ position: "absolute", inset: 0 }} />
    {status === "loading" && <div className="ops-preview-overlay" role="status"><p className="ops-muted">Đang tải mô hình 3D…</p></div>}
    {status === "error" && <div className="ops-preview-overlay" role="alert">
      <TriangleAlert size={24} aria-hidden="true" style={{ color: "var(--danger)" }} />
      <p className="ops-muted">Không tải được mô hình. Liên kết có thể đã hết hạn hoặc mất kết nối.</p>
      <Button size="sm" variant="secondary" onClick={() => { setStatus("loading"); setAttempt((value) => value + 1); }}><RefreshCw size={14} aria-hidden="true" />Thử lại</Button>
    </div>}
    {status === "context-lost" && <div className="ops-preview-overlay" role="alert">
      <TriangleAlert size={24} aria-hidden="true" style={{ color: "var(--warning)" }} />
      <p className="ops-muted">Trình duyệt đã dừng ngữ cảnh đồ họa WebGL (thường do thiếu bộ nhớ GPU).</p>
      <Button size="sm" variant="secondary" onClick={() => { setStatus("loading"); setAttempt((value) => value + 1); }}><RefreshCw size={14} aria-hidden="true" />Khởi tạo lại</Button>
    </div>}
  </div>;
}
