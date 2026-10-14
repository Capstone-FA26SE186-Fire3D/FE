/** Lower-case SHA-256 hex of a local file, computed in the browser (the document itself is never uploaded). */
export async function sha256Hex(file: Blob): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("Trình duyệt không hỗ trợ tính SHA-256 (cần kết nối HTTPS).");
  const digest = await subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
