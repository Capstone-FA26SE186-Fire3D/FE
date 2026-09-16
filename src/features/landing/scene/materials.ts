import * as THREE from "three";

function surfaceTexture(tile: boolean) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const context = canvas.getContext("2d")!;
  const pixels = context.createImageData(256, 256);
  let seed = 41;
  for (let i = 0; i < pixels.data.length; i += 4) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const grain = 155 + (seed / 4294967296) * 35;
    pixels.data[i] = grain; pixels.data[i + 1] = grain; pixels.data[i + 2] = grain; pixels.data[i + 3] = 255;
  }
  context.putImageData(pixels, 0, 0);
  if (tile) { context.strokeStyle = "#545454"; context.lineWidth = 2; context.strokeRect(0, 0, 256, 256); }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(tile ? 4 : 3, tile ? 18 : 4);
  return texture;
}

/** Neutral maps: the fire lighting is computed in the scene, never baked into albedo. */
export function createMaterials() {
  const grain = surfaceTexture(false), tile = surfaceTexture(true);
  const materials = {
    wall: new THREE.MeshStandardMaterial({ color: "#8c918c", roughness: .94, bumpMap: grain, bumpScale: .025 }),
    lower: new THREE.MeshStandardMaterial({ color: "#3b5455", roughness: .77, bumpMap: grain, bumpScale: .015 }),
    floor: new THREE.MeshStandardMaterial({ color: "#626862", roughness: .43, metalness: .12, map: tile, bumpMap: tile, bumpScale: .008 }),
    metal: new THREE.MeshStandardMaterial({ color: "#657071", roughness: .37, metalness: .75 }),
    dark: new THREE.MeshStandardMaterial({ color: "#20292c", roughness: .65, metalness: .25 }),
    door: new THREE.MeshStandardMaterial({ color: "#78624d", roughness: .72, bumpMap: grain, bumpScale: .012 }),
    glass: new THREE.MeshStandardMaterial({ color: "#8ba9a5", roughness: .13, metalness: .5 }),
    soot: new THREE.MeshStandardMaterial({ color: "#181512", roughness: 1 }),
    lamp: new THREE.MeshBasicMaterial({ color: "#e3e9cb" }),
    ember: new THREE.MeshBasicMaterial({ color: "#ee8654" }),
  };
  return { ...materials, dispose() { Object.values(materials).forEach(m => m.dispose()); grain.dispose(); tile.dispose(); } };
}

export function labelTexture(text: string, background = "#13634d", color = "#f3f5f4") {
  const canvas = document.createElement("canvas"); canvas.width = 512; canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = background; ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = color; ctx.font = "bold 54px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(text, 256, 66);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}
