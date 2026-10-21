import * as THREE from "three";
import { PLAN, arcPoint, junctionDoor } from "./layout";

export type JunctionChoice = "trainee" | "organization";
const BRANCHES: JunctionChoice[] = ["trainee", "organization"];

/** The two lit branch doors at the end of the arc. Paint is part of the door; the hit areas drive DOM buttons. */
export function createJunction() {
  const group = new THREE.Group(); group.name = "junction-doors";
  const disposables: { dispose(): void }[] = [];
  const doors = BRANCHES.map((branch, index) => {
    const spec = junctionDoor(branch);
    const canvas = document.createElement("canvas"); canvas.width = 512; canvas.height = 664;
    const ctx = canvas.getContext("2d")!;
    const gradient = ctx.createLinearGradient(0, 0, 0, 664); gradient.addColorStop(0, "#ffe2c0"); gradient.addColorStop(1, "#f2a06a");
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 512, 664);
    ctx.fillStyle = "#101719"; ctx.textAlign = "center"; ctx.font = '600 52px "Be Vietnam Pro", sans-serif';
    const lines = index ? ["TÔI MUỐN", "TỔ CHỨC", "TẬP HUẤN"] : ["TÔI MUỐN", "TẬP HUẤN", ""];
    lines.forEach((line, i) => ctx.fillText(line, 256, 150 + i * 70));
    ctx.strokeStyle = "#d9622b"; ctx.lineWidth = 16; ctx.lineCap = "square";
    const d = index ? 1 : -1;
    ctx.beginPath(); ctx.moveTo(256 - d * 110, 500); ctx.lineTo(256 + d * 110, 500); ctx.moveTo(256 + d * 40, 440); ctx.lineTo(256 + d * 110, 500); ctx.lineTo(256 + d * 40, 560); ctx.stroke();
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
    const geometry = new THREE.PlaneGeometry(spec.width, spec.height), material = new THREE.MeshBasicMaterial({ map: texture });
    disposables.push(texture, geometry, material);
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(...spec.position); mesh.rotation.y = spec.yaw; group.add(mesh);
    const glow = new THREE.PointLight(0xffb070, 8, 9, 1.6); glow.position.copy(mesh.position).add(new THREE.Vector3(0, 0.3, 0)); group.add(glow); disposables.push(glow);
    return { branch, mesh, spec };
  });
  // The corridor ends behind the doors: a plain wall closes it so the doors read as the only ways on.
  const end = junctionDoor("trainee").angle + 0.04;
  const wall = new THREE.Mesh(new THREE.BoxGeometry(PLAN.corridorHalfWidth * 2 + 1, PLAN.tierHeight - PLAN.slab, 0.3), new THREE.MeshStandardMaterial({ color: 0x3a4348, roughness: 0.9 }));
  { const [x, , z] = arcPoint(end, PLAN.corridorRadius, (PLAN.tierHeight - PLAN.slab) / 2); wall.position.set(x, (PLAN.tierHeight - PLAN.slab) / 2, z); wall.rotation.y = -end + Math.PI / 2 + Math.PI / 2; group.add(wall); disposables.push(wall.geometry, wall.material as THREE.Material); }
  const corner = new THREE.Vector3();
  const areas = doors.map(({ branch }) => ({ branch, left: 0, top: 0, width: 0, height: 0 }));
  return {
    group,
    /** Screen rectangles (0..1 of the canvas) of the doors. The returned objects are reused every call. */
    hitAreas(camera: THREE.Camera) {
      doors.forEach(({ mesh, spec }, s) => {
        let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
        for (let c = 0; c < 4; c++) {
          corner.set(c % 2 ? spec.width / 2 : -spec.width / 2, c < 2 ? -spec.height / 2 : spec.height / 2, 0);
          mesh.localToWorld(corner).project(camera);
          const x = (corner.x + 1) / 2, y = (1 - corner.y) / 2;
          if (x < left) left = x; if (x > right) right = x;
          if (y < top) top = y; if (y > bottom) bottom = y;
        }
        const area = areas[s]; area.left = left; area.top = top; area.width = right - left; area.height = bottom - top;
      });
      return areas;
    },
    dispose() { disposables.forEach(d => d.dispose()); group.clear(); },
  };
}
