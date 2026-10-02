"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

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
    materials.forEach((material) => material.dispose());
  });
}

export function RuntimePreviewViewer({ downloadUrl }: { downloadUrl: string }) {
  const hostRef = useRef<HTMLDivElement>(null);

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
    const directional = new THREE.DirectionalLight(0xffd4bb, 2.6);
    directional.position.set(16, 24, 14);
    scene.add(directional, new THREE.GridHelper(80, 40, 0x405054, 0x263136));

    const camera = new THREE.PerspectiveCamera(48, 1, 0.01, 1_000);
    camera.position.set(12, 10, 12);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI * 0.48;

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

    let model: THREE.Object3D | null = null;
    new GLTFLoader().load(downloadUrl, (gltf) => {
      model = gltf.scene;
      scene.add(model);
      fitCamera(camera, controls, model);
    });

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      if (model) disposeModel(model);
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [downloadUrl]);

  return <div ref={hostRef} className="runtime-preview" role="img" aria-label="Mô hình 3D từ artifact IFC đã xử lý" />;
}
