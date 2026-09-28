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

type InitiatedUpload = {
  revisionId: string;
  uploadUrl: string;
  objectKey: string;
};

type FinalizeUpload = {
  objectKey: string;
  fileSizeBytes: number;
  mimeType: string;
  sha256Hash: string;
  originalFilename: string;
};

export async function uploadIfcRevision({
  file,
  versionLabel,
  initiate,
  finalize,
  put = putIfcObject,
}: {
  file: File;
  versionLabel: string;
  initiate: (input: { fileSizeBytes: number; originalFilename: string; versionLabel: string }) => Promise<InitiatedUpload>;
  finalize: (revisionId: string, input: FinalizeUpload) => Promise<void>;
  put?: (uploadUrl: string, file: File) => Promise<void>;
}): Promise<{ revisionId: string }> {
  const fileError = validateIfcFile(file);
  if (fileError) throw new Error(fileError);

  const initiated = await initiate({
    fileSizeBytes: file.size,
    originalFilename: file.name,
    versionLabel,
  });
  const sha256Hash = await sha256Hex(await file.arrayBuffer());

  await put(initiated.uploadUrl, file);
  await finalize(initiated.revisionId, {
    objectKey: initiated.objectKey,
    fileSizeBytes: file.size,
    mimeType: file.type || "application/octet-stream",
    sha256Hash,
    originalFilename: file.name,
  });

  return { revisionId: initiated.revisionId };
}
