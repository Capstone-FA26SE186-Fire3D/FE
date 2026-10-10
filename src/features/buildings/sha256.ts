/**
 * Incremental SHA-256. `crypto.subtle.digest` needs the whole file in memory, which is wasteful for large IFC
 * files, so big files are hashed chunk by chunk (File.slice) with this implementation instead. The result is
 * identical lowercase hex, which is what the BE compares (`sha256Hash`).
 */
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

export class Sha256 {
  private readonly state = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  private readonly pending = new Uint8Array(64);
  private readonly words = new Uint32Array(64);
  private pendingLength = 0;
  private totalBytes = 0;

  update(data: Uint8Array): this {
    this.totalBytes += data.length;
    let offset = 0;
    if (this.pendingLength > 0) {
      const take = Math.min(64 - this.pendingLength, data.length);
      this.pending.set(data.subarray(0, take), this.pendingLength);
      this.pendingLength += take;
      offset = take;
      if (this.pendingLength === 64) {
        this.block(this.pending, 0);
        this.pendingLength = 0;
      }
    }
    while (offset + 64 <= data.length) {
      this.block(data, offset);
      offset += 64;
    }
    if (offset < data.length) {
      this.pending.set(data.subarray(offset), 0);
      this.pendingLength = data.length - offset;
    }
    return this;
  }

  digestHex(): string {
    const bitsHigh = Math.floor(this.totalBytes / 0x20000000);
    const bitsLow = (this.totalBytes << 3) >>> 0;
    const padLength = (this.pendingLength < 56 ? 56 : 120) - this.pendingLength;
    const tail = new Uint8Array(padLength + 8);
    tail[0] = 0x80;
    const view = new DataView(tail.buffer);
    view.setUint32(padLength, bitsHigh);
    view.setUint32(padLength + 4, bitsLow);
    this.update(tail);
    return Array.from(this.state, (word) => word.toString(16).padStart(8, "0")).join("");
  }

  private block(data: Uint8Array, offset: number) {
    const w = this.words;
    for (let i = 0; i < 16; i++) {
      const j = offset + i * 4;
      w[i] = (data[j] << 24) | (data[j + 1] << 16) | (data[j + 2] << 8) | data[j + 3];
    }
    for (let i = 16; i < 64; i++) {
      const x = w[i - 15];
      const y = w[i - 2];
      const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
      const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let a = this.state[0], b = this.state[1], c = this.state[2], d = this.state[3];
    let e = this.state[4], f = this.state[5], g = this.state[6], h = this.state[7];
    for (let i = 0; i < 64; i++) {
      const bigS1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const choice = (e & f) ^ (~e & g);
      const temp1 = (h + bigS1 + choice + K[i] + w[i]) | 0;
      const bigS0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (bigS0 + majority) | 0;
      h = g; g = f; f = e; e = (d + temp1) | 0;
      d = c; c = b; b = a; a = (temp1 + temp2) | 0;
    }
    this.state[0] += a; this.state[1] += b; this.state[2] += c; this.state[3] += d;
    this.state[4] += e; this.state[5] += f; this.state[6] += g; this.state[7] += h;
  }
}

export function sha256HexOfBytes(data: Uint8Array): string {
  return new Sha256().update(data).digestHex();
}

const CHUNK_BYTES = 8 * 1024 * 1024;
/** Up to this size the native digest is used (one buffer, fast); larger files stream through `Sha256`. */
export const NATIVE_HASH_LIMIT_BYTES = 64 * 1024 * 1024;

export type HashOptions = {
  onProgress?: (hashedBytes: number, totalBytes: number) => void;
  signal?: AbortSignal;
  chunkBytes?: number;
  nativeLimitBytes?: number;
};

function abortError() {
  return new DOMException("Đã hủy.", "AbortError");
}

/** SHA-256 of a File/Blob as lowercase hex, with progress and cancellation, without loading big files whole. */
export async function sha256OfFile(file: Blob, options: HashOptions = {}): Promise<string> {
  const { onProgress, signal, chunkBytes = CHUNK_BYTES, nativeLimitBytes = NATIVE_HASH_LIMIT_BYTES } = options;
  if (signal?.aborted) throw abortError();

  const subtle = globalThis.crypto?.subtle;
  if (subtle && file.size <= nativeLimitBytes) {
    const digest = await subtle.digest("SHA-256", await file.arrayBuffer());
    if (signal?.aborted) throw abortError();
    onProgress?.(file.size, file.size);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  const hasher = new Sha256();
  for (let offset = 0; offset < file.size; offset += chunkBytes) {
    const chunk = new Uint8Array(await file.slice(offset, Math.min(offset + chunkBytes, file.size)).arrayBuffer());
    if (signal?.aborted) throw abortError();
    hasher.update(chunk);
    onProgress?.(Math.min(offset + chunk.length, file.size), file.size);
  }
  if (file.size === 0) onProgress?.(0, 0);
  return hasher.digestHex();
}
