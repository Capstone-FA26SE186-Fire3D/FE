/** Deterministic fake 64-hex digest (NOT a real SHA-256) so sample hashes look right and stay stable. Dev prototypes only. */
export function sampleHash(seed: string): string {
  let a = 0x811c9dc5;
  let out = "";
  for (let round = 0; out.length < 64; round += 1) {
    for (let index = 0; index < seed.length; index += 1) { a ^= seed.charCodeAt(index) + round; a = Math.imul(a, 0x01000193) >>> 0; }
    out += a.toString(16).padStart(8, "0");
  }
  return out.slice(0, 64);
}
