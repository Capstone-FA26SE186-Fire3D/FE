import * as THREE from "three";

export type JunctionChoice = "trainee" | "organization";

/** Paint is part of the building, with a transparent, keyboard-accessible DOM hit area. */
export function createJunction() {
  const group = new THREE.Group();
  group.name = "painted-wayfinding";
  const geometry = new THREE.PlaneGeometry(2.65, 1.15);
  const textures: THREE.CanvasTexture[] = [];
  const materials: THREE.MeshStandardMaterial[] = [];
  const signs = (["trainee", "organization"] as const).map((branch, index) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1024; canvas.height = 448;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#eedbc4";
    ctx.font = '600 65px "Be Vietnam Pro", sans-serif';
    ctx.textAlign = "left";
    function paint(text: string, y: number) {
      let x = (1024 - ctx.measureText(text).width) / 2;
      [...text].forEach((letter, i) => {
        ctx.save(); ctx.translate(x, y + Math.sin(i * 3.7 + index) * 5); ctx.rotate(Math.sin(i * 2.1) * .05);
        ctx.fillText(letter, 0, 0); ctx.restore(); x += ctx.measureText(letter).width;
      });
    }
    paint("TÔI MUỐN", 102);
    paint(index ? "TỔ CHỨC TẬP HUẤN" : "TẬP HUẤN", 192);
    ctx.strokeStyle = "#ee8654"; ctx.lineWidth = 18; ctx.lineCap = "square";
    const direction = index ? 1 : -1;
    ctx.beginPath(); ctx.moveTo(512 - direction * 150, 302); ctx.lineTo(512 + direction * 150, 302);
    ctx.moveTo(512 + direction * 65, 235); ctx.lineTo(512 + direction * 150, 302); ctx.lineTo(512 + direction * 65, 369); ctx.stroke();
    // Small deterministic chips let the wall show through instead of making a flat signboard.
    ctx.globalCompositeOperation = "destination-out";
    for (let i = 0; i < 1600; i++) {
      ctx.globalAlpha = .12 + (i % 5) * .04;
      ctx.fillRect((i * 271) % 1024, (i * 149) % 448, 1 + i % 3, 1 + i % 2);
    }
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; textures.push(texture);
    const material = new THREE.MeshStandardMaterial({ map: texture, transparent: true, roughness: .95, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
    materials.push(material);
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(index ? 1.55 : -1.55, 1.8, -16.895); group.add(mesh);
    return { branch, mesh };
  });
  return {
    group,
    layout(mobile: boolean) {
      signs.forEach(({ mesh }, index) => {
        mesh.scale.setScalar(mobile ? .65 : 1);
        mesh.position.set(mobile ? 0 : index ? 1.55 : -1.55, mobile ? index ? 1.05 : 2.05 : 1.8, -16.895);
      });
      group.updateMatrixWorld(true);
    },
    hitAreas(camera: THREE.Camera) {
      return signs.map(({ branch, mesh }) => {
        const corners = [[-1.325, -.575], [1.325, -.575], [-1.325, .575], [1.325, .575]].map(([x, y]) => mesh.localToWorld(new THREE.Vector3(x, y, 0)).project(camera));
        const left = Math.min(...corners.map(p => (p.x + 1) / 2)), right = Math.max(...corners.map(p => (p.x + 1) / 2));
        const top = Math.min(...corners.map(p => (1 - p.y) / 2)), bottom = Math.max(...corners.map(p => (1 - p.y) / 2));
        return { branch, left, top, width: right - left, height: bottom - top };
      });
    },
    dispose() { geometry.dispose(); textures.forEach(t => t.dispose()); materials.forEach(m => m.dispose()); group.clear(); },
  };
}
