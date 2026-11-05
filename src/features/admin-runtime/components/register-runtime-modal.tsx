"use client";

import { useState } from "react";

import { DetailList } from "@/components/ops/detail-parts";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { FileDrop } from "@/components/ui/file-drop";
import { useToast } from "@/components/ui/toast";
import { runtimeCatalogApi } from "../api";
import { describeRuntimeError, parseRuntimeFile, withActive, type RuntimeErrorView, type RuntimeFileResult } from "../model";

const MAX_BYTES = 2 * 1024 * 1024;

/**
 * Registers a version from the payload file the Unity repo ships (`Tools/RuntimeCatalog/runtime-<version>.json`, the POST
 * body as is). The file is read in the browser and summarised before anything is sent; "Kích hoạt ngay" starts OFF.
 */
export function RegisterRuntimeModal({ accessToken, onClose, onRegistered }: { accessToken: string; onClose: () => void; onRegistered: () => void }) {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<RuntimeFileResult | null>(null);
  const [activate, setActivate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<RuntimeErrorView | null>(null);

  const take = async (next: File | null) => {
    setFile(next);
    setError(null);
    setParsed(null);
    if (!next) return;
    if (next.size > MAX_BYTES) { setParsed({ ok: false, problems: ["Tệp quá lớn (tối đa 2 MB). Hãy chọn đúng tệp phiên bản."] }); return; }
    setParsed(parseRuntimeFile(await next.text()));
  };

  const submit = async () => {
    if (busy || !parsed?.ok) return;
    setBusy(true);
    setError(null);
    try {
      const created = await runtimeCatalogApi.create(accessToken, withActive(parsed.payload, activate));
      toast.notify({ tone: "success", title: "Đã đăng ký phiên bản", description: `Phiên bản ${created.runtimeVersion} · ${created.isActive ? "đang dùng" : "đang tắt, bật khi sẵn sàng"}` });
      onRegistered();
    } catch (cause) {
      setError(describeRuntimeError(cause, parsed.payload.capabilities));
    } finally {
      setBusy(false);
    }
  };

  const summary = parsed?.ok ? parsed.summary : null;
  return <Modal open onOpenChange={(open) => { if (!open && !busy) onClose(); }} size="md" data-testid="runtime-register-modal" title="Đăng ký phiên bản"
    description="Chọn tệp phiên bản xuất từ dự án Unity (runtime-<phiên bản>.json). Phiên bản đã đăng ký không sửa được, chỉ bật hoặc tắt."
    footer={<><Button variant="quiet" disabled={busy} onClick={onClose}>Hủy</Button><Button disabled={busy || !summary || error?.kind === "exists"} onClick={() => void submit()} data-testid="runtime-register-submit">{busy ? "Đang đăng ký…" : error?.kind === "retry" ? "Thử lại" : "Đăng ký"}</Button></>}>
    <div className="ops-stack">
      <FileDrop label="Chọn tệp phiên bản" accept=".json,application/json" rejectText="Chỉ nhận tệp .json xuất từ dự án Unity." file={file} disabled={busy} hint="Tệp chỉ được đọc trong trình duyệt để xem trước; chưa gửi gì cho đến khi bấm Đăng ký." onFile={(next) => void take(next)} data-testid="runtime-file" />
      {parsed && !parsed.ok && <Alert tone="danger" title="Tệp chưa đúng"><ul className="rt-problems">{parsed.problems.map((problem) => <li key={problem}>{problem}</li>)}</ul></Alert>}
      {summary && <div className="rt-summary" data-testid="runtime-summary">
        <DetailList columns={3} items={[
          { label: "Phiên bản", value: <strong>{summary.runtimeVersion}</strong> },
          { label: "Số năng lực", value: `${summary.capabilityCount} (${summary.contractCount} có mô tả sự kiện/thao tác)` },
          { label: "Giao thức kết nối", value: summary.protocolVersion },
          { label: "Định dạng gói bài", value: summary.manifestSchemaVersion },
          { label: "Sau khi đăng ký", value: activate ? "Đang dùng ngay" : "Tắt (bật sau)" },
        ]} />
      </div>}
      {summary && <label className="rt-switch">
        <input type="checkbox" role="switch" checked={activate} disabled={busy} onChange={(event) => setActivate(event.target.checked)} data-testid="runtime-activate" />
        <span>Kích hoạt ngay<small>Bật: trình soạn kịch bản, chạy thử và buổi huấn luyện mới dùng được phiên bản này ngay. Tắt: chỉ ghi nhận, bật sau khi ứng dụng trên điện thoại đã sẵn sàng.{summary.fileAsksActive && " (Tệp ghi là bật ngay; ở đây vẫn mặc định tắt để bạn chủ động.)"}</small></span>
      </label>}
      {error && <Alert tone={error.kind === "exists" ? "warning" : "danger"} title={error.title}>
        {error.message}
        {error.issues.length > 0 && <ul className="rt-problems">{error.issues.map((issue, index) => <li key={`${issue.field}-${index}`}><strong>{issue.field}:</strong> {issue.message}</li>)}</ul>}
      </Alert>}
    </div>
  </Modal>;
}
