import * as THREE from "three";

const SIZE = 128;

function hash(x: number, y: number, channel: number) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(channel + 1, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Periodic value noise: lattice of `period` cells that wraps seamlessly. */
function tileNoise(u: number, v: number, period: number, channel: number) {
  const x = u * period, y = v * period;
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const wrap = (n: number) => ((n % period) + period) % period;
  const a = hash(wrap(x0), wrap(y0), channel), b = hash(wrap(x0 + 1), wrap(y0), channel);
  const c = hash(wrap(x0), wrap(y0 + 1), channel), d = hash(wrap(x0 + 1), wrap(y0 + 1), channel);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/**
 * One shared RGBA tile replaces dozens of per-pixel hashes in the flame, smoke
 * and ember shaders. Channels are independent fractal noises (low, mid, fine,
 * mid with another seed) so a single fetch supplies shape, breakup and flicker.
 * It is plain data, so it also builds outside the browser (unit tests).
 */
export function createFireNoiseTexture() {
  const data = new Uint8Array(SIZE * SIZE * 4);
  const periods = [[4, 8, 16], [6, 12, 24], [10, 20, 40], [5, 10, 20]];
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const u = x / SIZE, v = y / SIZE;
    for (let channel = 0; channel < 4; channel++) {
      const [p0, p1, p2] = periods[channel];
      const value = tileNoise(u, v, p0, channel) * .55 + tileNoise(u, v, p1, channel + 4) * .3 + tileNoise(u, v, p2, channel + 8) * .15;
      data[(y * SIZE + x) * 4 + channel] = Math.round(Math.min(1, Math.max(0, value)) * 255);
    }
  }
  const texture = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}
