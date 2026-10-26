"use client";

import { useState } from "react";
import { newIdempotencyKey } from "@/api/idempotency";
import { ApiError } from "@/api/types/common";
import { FileDrop } from "@/components/ui/file-drop";

/** Learn image rules of the backend (BE#171): JPEG, PNG or WebP, at most 5 MB and 4096 × 4096, one frame. */
const ACCEPT = "image/jpeg,image/png,image/webp";
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_SIDE = 4096;

const uploadMessages: Record<string, string> = {
  VALIDATION_ERROR: "Ảnh phải là JPG, PNG hoặc WebP và nhỏ hơn 5 MB.",
  LEARN_IMAGE_INVALID: "Ảnh bị hỏng, là ảnh động hoặc lớn hơn 4096 × 4096 điểm ảnh. Chọn ảnh khác.",
  LEARN_UPLOAD_EXPIRED: "Quá thời gian tải lên. Chọn lại ảnh để tải lần nữa.",
  LEARN_UPLOAD_MISSING: "Ảnh chưa lên tới kho lưu trữ. Chọn lại ảnh để tải lần nữa.",
  LEARN_UPLOAD_CHANGED: "Ảnh trên kho lưu trữ đã thay đổi trong lúc tải. Chọn lại ảnh để tải lần nữa.",
  LEARN_MEDIA_UNAVAILABLE: "Kho ảnh đang tạm lỗi. Thử lại sau ít phút, hoặc dán đường dẫn ảnh https.",
  LEARN_UPLOAD_PUT_FAILED: "Không tải được ảnh lên kho lưu trữ. Kiểm tra mạng rồi thử lại.",
};

function uploadError(error: unknown): string {
  if (error instanceof ApiError) return (error.code && uploadMessages[error.code]) || (error.status === 0 ? "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại." : "Chưa tải được ảnh. Thử lại.");
  return "Chưa tải được ảnh. Thử lại.";
}

/** Width and height of an image file, or null when the browser cannot decode it. */
async function sizeOf(file: File): Promise<{ width: number; height: number } | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return null;
  }
}

/**
 * Drop zone that uploads a Learn image from the computer and hands back its public url (cover or image block). The file is
 * checked here first (type, 5 MB, 4096 px) so most refusals need no round trip; the backend checks again and has the last word.
 */
export function ImageUpload({ label, upload, onUrl, disabled = false, compact = false }: {
  label: string;
  upload: (file: File, idempotencyKey: string) => Promise<string>;
  onUrl: (url: string) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const take = async (picked: File | null) => {
    setFile(picked);
    setError("");
    if (!picked) return;
    if (picked.size > MAX_BYTES) { setError("Ảnh lớn hơn 5 MB. Giảm dung lượng ảnh rồi chọn lại."); return; }
    const size = await sizeOf(picked);
    if (!size) { setError("Không đọc được ảnh này. Chọn ảnh JPG, PNG hoặc WebP khác."); return; }
    if (size.width > MAX_SIDE || size.height > MAX_SIDE) { setError(`Ảnh ${size.width} × ${size.height} điểm ảnh, lớn hơn mức tối đa 4096 × 4096. Thu nhỏ ảnh rồi chọn lại.`); return; }
    setBusy(true);
    try {
      onUrl(await upload(picked, newIdempotencyKey()));
    } catch (failure) {
      setError(uploadError(failure));
    } finally {
      setBusy(false);
    }
  };
  return <div className="image-upload">
    <FileDrop label={label} accept={ACCEPT} file={file} disabled={disabled || busy} busy={busy ? "Đang tải ảnh lên…" : undefined} compact={compact}
      hint="JPG, PNG hoặc WebP · tối đa 5 MB và 4096 × 4096 điểm ảnh" rejectText="Chỉ nhận ảnh JPG, PNG hoặc WebP." onFile={(picked) => void take(picked)} />
    {error && <p role="alert" className="ops-field-error" style={{ margin: "6px 0 0" }}>{error}</p>}
  </div>;
}
