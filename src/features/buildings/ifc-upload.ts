export function validateIfcFile(file: File | null): string | null {
  if (!file || file.size === 0 || !file.name.toLowerCase().endsWith(".ifc")) {
    return "Hãy chọn một tệp IFC (.ifc) không rỗng.";
  }

  return null;
}

export async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function putIfcObject(uploadUrl: string, file: File, fetchImpl: typeof fetch = fetch): Promise<void> {
  const response = await fetchImpl(uploadUrl, {
    body: file,
    headers: { "Content-Type": "application/octet-stream" },
    method: "PUT",
  });

  if (!response.ok) {
    throw new Error("Không thể tải IFC lên kho lưu trữ.");
  }
}
