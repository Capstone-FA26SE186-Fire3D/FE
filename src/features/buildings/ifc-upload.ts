import { ApiError } from "@/api/types/common";
import { sha256OfFile } from "./sha256";

export const IFC_UPLOAD_MIME = "application/octet-stream";

export function validateIfcFile(file: File | null): string | null {
  if (!file || file.size === 0 || !file.name.toLowerCase().endsWith(".ifc")) {
    return "Hãy chọn một tệp IFC (.ifc) không rỗng.";
  }

  return null;
}

/** Whole-buffer digest. Kept for small inputs; large files go through `sha256OfFile` (chunked). */
export async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export class IfcPutError extends Error {
  /** HTTP status of the storage response, or 0 when the request never completed (offline, DNS, CORS, reset). */
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "IfcPutError";
    this.status = status;
  }
}

/** PUT straight to the signed URL. No Authorization header: the signature in the URL is the credential. */
export async function putIfcObject(uploadUrl: string, file: File, fetchImpl: typeof fetch = fetch): Promise<void> {
  const response = await fetchImpl(uploadUrl, {
    body: file,
    headers: { "Content-Type": IFC_UPLOAD_MIME },
    method: "PUT",
  });

  if (!response.ok) {
    throw new Error("Không thể tải IFC lên kho lưu trữ.");
  }
}

export type PutOptions = {
  onProgress?: (loaded: number, total: number) => void;
  signal?: AbortSignal;
};

/** Same request as `putIfcObject` but over XHR, because `fetch` has no upload progress. */
export function putIfcObjectWithProgress(uploadUrl: string, file: File, { onProgress, signal }: PutOptions = {}): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Đã hủy.", "AbortError"));
      return;
    }
    const xhr = new XMLHttpRequest();
    const onAbort = () => xhr.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    const finish = () => signal?.removeEventListener("abort", onAbort);

    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", IFC_UPLOAD_MIME);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded, event.total);
    };
    xhr.onload = () => {
      finish();
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(file.size, file.size);
        resolve();
      } else {
        reject(new IfcPutError("Không thể tải IFC lên kho lưu trữ.", xhr.status));
      }
    };
    xhr.onerror = () => {
      finish();
      reject(new IfcPutError("Mất kết nối khi tải IFC lên kho lưu trữ.", 0));
    };
    xhr.ontimeout = () => {
      finish();
      reject(new IfcPutError("Kho lưu trữ không phản hồi kịp.", 0));
    };
    xhr.onabort = () => {
      finish();
      reject(new DOMException("Đã hủy.", "AbortError"));
    };
    xhr.send(file);
  });
}

export type IfcUploadStage = "hash" | "initiate" | "upload" | "complete";

/**
 * A failure of one upload stage, already classified for the UI:
 * `retryable` — the same action can be tried again as is (network, 5xx, Retry-After);
 * `renewUrl` — the signed URL is no longer valid: initiate again with the SAME Idempotency-Key for a fresh URL;
 * `restart` — the upload intent is gone/rejected: start over with a NEW key (and a new file selection if needed).
 */
export class IfcUploadError extends Error {
  readonly stage: IfcUploadStage;
  readonly code?: string;
  readonly status?: number;
  readonly retryAfterSeconds?: number;
  readonly retryable: boolean;
  readonly renewUrl: boolean;
  readonly restart: boolean;

  constructor(stage: IfcUploadStage, message: string, flags: { code?: string; status?: number; retryAfterSeconds?: number; retryable?: boolean; renewUrl?: boolean; restart?: boolean } = {}) {
    super(message);
    this.name = "IfcUploadError";
    this.stage = stage;
    this.code = flags.code;
    this.status = flags.status;
    this.retryAfterSeconds = flags.retryAfterSeconds;
    this.retryable = flags.retryable ?? false;
    this.renewUrl = flags.renewUrl ?? false;
    this.restart = flags.restart ?? false;
  }
}

export function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

const TRANSIENT_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

function fieldDetail(error: ApiError) {
  const first = error.fieldErrors[0];
  return first ? `${first.path ? `${first.path}: ` : ""}${first.message}` : error.message;
}

/** Maps whatever a stage threw (ApiError, storage failure, offline) to an `IfcUploadError`. */
export function classifyUploadError(stage: IfcUploadStage, cause: unknown): IfcUploadError {
  if (cause instanceof IfcUploadError) return cause;

  if (cause instanceof IfcPutError) {
    if (cause.status === 0) return new IfcUploadError(stage, cause.message, { retryable: true });
    if (cause.status === 400 || cause.status === 401 || cause.status === 403) {
      return new IfcUploadError(stage, "Liên kết tải lên đã hết hạn hoặc không còn hợp lệ. Hãy thử lại để nhận liên kết mới.", { status: cause.status, renewUrl: true, retryable: true });
    }
    return new IfcUploadError(stage, cause.message, { status: cause.status, retryable: TRANSIENT_STATUSES.has(cause.status) });
  }

  if (cause instanceof ApiError) {
    const base = { code: cause.code, status: cause.status, retryAfterSeconds: cause.retryAfterSeconds };
    if (cause.code === "IFC_UPLOAD_DISABLED") {
      return new IfcUploadError(stage, "Tính năng tải IFC đang tạm tắt trên hệ thống. Hãy thử lại sau ít phút hoặc liên hệ hỗ trợ.", { ...base, retryable: true });
    }
    if (cause.status === 410 || cause.code === "IFC_UPLOAD_EXPIRED") {
      return new IfcUploadError(stage, "Phiên tải lên đã hết hạn. Hãy bắt đầu lại để tạo phiên tải lên mới.", { ...base, restart: true });
    }
    if (cause.code === "IDEMPOTENCY_KEY_CONFLICT" || cause.code === "IFC_UPLOAD_ALREADY_COMPLETED" || cause.code === "IFC_SOURCE_CHANGED") {
      return new IfcUploadError(stage, cause.message, { ...base, restart: true });
    }
    if (cause.status === 422 || cause.code === "IFC_SOURCE_MISMATCH") {
      return new IfcUploadError(stage, "Tệp trên kho lưu trữ không khớp với tệp đã chọn (kích thước hoặc SHA-256). Hãy tải lên lại từ đầu.", { ...base, restart: true });
    }
    if (cause.status === 400 && cause.fieldErrors.length > 0) {
      return new IfcUploadError(stage, fieldDetail(cause), base);
    }
    return new IfcUploadError(stage, cause.message, { ...base, retryable: TRANSIENT_STATUSES.has(cause.status) });
  }

  if (cause instanceof TypeError) {
    return new IfcUploadError(stage, "Mất kết nối tới máy chủ. Kiểm tra mạng rồi thử lại.", { retryable: true });
  }
  return new IfcUploadError(stage, cause instanceof Error ? cause.message : "Không thể hoàn tất bước này.", { retryable: true });
}

export type InitiatedUpload = {
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

/**
 * What has already happened for one file, kept by the caller so a retry resumes instead of redoing work:
 * hash (expensive) → initiate (same Idempotency-Key replays) → PUT → complete.
 */
export type IfcUploadSession = {
  sha256Hash?: string;
  initiated?: InitiatedUpload;
  uploaded?: boolean;
  completed?: boolean;
};

export type UploadProgress = { stage: IfcUploadStage; loaded: number; total: number };

export async function uploadIfcRevision({
  file,
  versionLabel,
  initiate,
  finalize,
  put = putIfcObjectWithProgress,
  hash = sha256OfFile,
  session = {},
  signal,
  onStage,
  onProgress,
}: {
  file: File;
  versionLabel: string;
  initiate: (input: { fileSizeBytes: number; originalFilename: string; versionLabel: string; sha256Hash: string }) => Promise<InitiatedUpload>;
  finalize: (revisionId: string, input: FinalizeUpload) => Promise<void>;
  put?: (uploadUrl: string, file: File, options: PutOptions) => Promise<void>;
  hash?: (file: File, options: { onProgress?: (loaded: number, total: number) => void; signal?: AbortSignal }) => Promise<string>;
  session?: IfcUploadSession;
  signal?: AbortSignal;
  onStage?: (stage: IfcUploadStage) => void;
  onProgress?: (progress: UploadProgress) => void;
}): Promise<{ revisionId: string; objectKey: string; sha256Hash: string }> {
  const fileError = validateIfcFile(file);
  if (fileError) throw new IfcUploadError("hash", fileError);

  let stage: IfcUploadStage = "hash";
  try {
    if (!session.sha256Hash) {
      onStage?.("hash");
      session.sha256Hash = await hash(file, { signal, onProgress: (loaded, total) => onProgress?.({ stage: "hash", loaded, total }) });
    }
    const sha256Hash = session.sha256Hash;

    if (!session.completed) {
      if (!session.uploaded) {
        stage = "initiate";
        onStage?.("initiate");
        // An initiate retry with the same key hands back the same revision and a freshly signed URL.
        session.initiated ??= await initiate({ fileSizeBytes: file.size, originalFilename: file.name, versionLabel, sha256Hash });
        stage = "upload";
        onStage?.("upload");
        await put(session.initiated.uploadUrl, file, { signal, onProgress: (loaded, total) => onProgress?.({ stage: "upload", loaded, total }) });
        session.uploaded = true;
      }

      stage = "complete";
      onStage?.("complete");
      const initiated = session.initiated!;
      await finalize(initiated.revisionId, {
        objectKey: initiated.objectKey,
        fileSizeBytes: file.size,
        mimeType: IFC_UPLOAD_MIME,
        sha256Hash,
        originalFilename: file.name,
      });
      session.completed = true;
    }

    const initiated = session.initiated!;
    return { revisionId: initiated.revisionId, objectKey: initiated.objectKey, sha256Hash };
  } catch (cause) {
    if (isAbortError(cause)) throw cause;
    const error = classifyUploadError(stage, cause);
    // The signed URL is dead: forget it (but not the key) so the next attempt initiates again for a new one.
    if (error.renewUrl) {
      session.initiated = undefined;
      session.uploaded = false;
    }
    throw error;
  }
}
