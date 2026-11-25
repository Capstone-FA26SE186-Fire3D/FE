"use client";

import { FileText } from "lucide-react";
import { useState } from "react";

import { describeApiError } from "@/api/describe-error";
import { useIdempotencyKey } from "@/api/idempotency";
import { ApiError } from "@/api/types/common";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FileDrop } from "@/components/ui/file-drop";
import { SupportCode } from "@/components/ui/support-code";
import { useToast } from "@/components/ui/toast";

import { buildingsApi } from "../api";

export const SIGNED_PLAN_MAX_BYTES = 20 * 1024 * 1024;

/**
 * Signed PC06 plan of the Building (BE#212). The head of the facility approves the plan outside FET3D (Điều 15 Nghị định
 * 105/2025/NĐ-CP); this only keeps the signed PDF. Upload is intent → PUT to storage → complete; a new upload replaces
 * the one shown.
 */
export function SignedPlan({ accessToken, buildingId, hasPlan, onChanged }: { accessToken: string; buildingId: string; hasPlan: boolean; onChanged: () => void }) {
  const toast = useToast();
  const { keyFor, done } = useIdempotencyKey();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<"upload" | "open" | null>(null);
  const [failure, setFailure] = useState<{ message: string; code?: string } | null>(null);
  const fail = (error: unknown, fallback: string) => setFailure({ message: describeApiError(error, fallback), code: error instanceof ApiError ? error.code : undefined });

  const tooLarge = file !== null && file.size > SIGNED_PLAN_MAX_BYTES;

  const upload = async () => {
    if (!file || tooLarge || busy) return;
    setBusy("upload");
    setFailure(null);
    try {
      const intent = await buildingsApi.signedPlanIntent(accessToken, buildingId, { fileName: file.name, contentType: "application/pdf", sizeBytes: file.size }, keyFor({ buildingId, name: file.name, size: file.size, modified: file.lastModified }));
      const put = await fetch(intent.uploadUrl, { method: "PUT", body: file, headers: intent.headers ?? { "Content-Type": "application/pdf" } });
      if (!put.ok) throw new Error("storage");
      await buildingsApi.signedPlanComplete(accessToken, buildingId, intent.uploadId);
      done();
      setFile(null);
      toast.notify({ tone: "success", title: "Đã lưu phương án PC06 đã ký" });
      onChanged();
    } catch (error) {
      if (error instanceof ApiError) fail(error, "Chưa tải được tệp.");
      else setFailure({ message: "Chưa tải được tệp lên kho lưu trữ. Kiểm tra mạng rồi thử lại." });
    } finally {
      setBusy(null);
    }
  };

  const open = async () => {
    if (busy) return;
    // Opened inside the click so the browser does not treat it as a pop-up; it is pointed at the file once the link is known.
    const tab = window.open("", "_blank");
    setBusy("open");
    setFailure(null);
    try {
      const url = await buildingsApi.signedPlanUrl(accessToken, buildingId);
      if (tab) tab.location.href = url; else window.location.href = url;
    } catch (error) {
      tab?.close();
      if (error instanceof ApiError) fail(error, "Chưa mở được tệp.");
      else setFailure({ message: "Chưa mở được tệp. Hãy thử lại sau." });
    } finally {
      setBusy(null);
    }
  };

  return <div className="ops-stack" data-testid="signed-plan">
    <p className="ops-field-hint" style={{ margin: 0 }}>Người đứng đầu cơ sở phê duyệt phương án theo Mẫu PC06. FET3D chỉ lưu bản PDF đã ký để đối chiếu; mô phỏng không thay buổi thực tập phương án.</p>
    {hasPlan && <div><Button type="button" variant="secondary" size="sm" onClick={() => void open()} disabled={busy !== null} data-testid="signed-plan-open"><FileText size={14} aria-hidden="true" />{busy === "open" ? "Đang mở…" : "Xem bản đã ký"}</Button></div>}
    <FileDrop compact label="Chọn tệp PDF phương án PC06 đã ký" accept=".pdf,application/pdf" file={file} onFile={(next) => { setFile(next); setFailure(null); }} disabled={busy !== null}
      busy={busy === "upload" ? "Đang tải lên…" : undefined} hint={hasPlan ? "Tải tệp mới sẽ thay bản đang lưu. PDF, tối đa 20 MB." : "PDF, tối đa 20 MB."} rejectText="Chỉ nhận tệp PDF." data-testid="signed-plan-drop" />
    {tooLarge && <Alert tone="danger">Tệp lớn hơn 20 MB. Hãy nén hoặc quét lại ở độ phân giải thấp hơn.</Alert>}
    {file && !tooLarge && <div><Button type="button" size="sm" onClick={() => void upload()} disabled={busy !== null} data-testid="signed-plan-upload">{busy === "upload" ? "Đang tải lên…" : "Lưu bản đã ký"}</Button></div>}
    {failure && <Alert tone="danger" title="Không thực hiện được">{failure.message}<SupportCode code={failure.code} /></Alert>}
  </div>;
}
