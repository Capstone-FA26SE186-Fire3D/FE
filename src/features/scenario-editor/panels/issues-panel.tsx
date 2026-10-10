"use client";

import { CheckCircle2, ShieldCheck } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";

import type { Issue } from "../store/validation";

export function IssuesPanel({ issues, serverStale, validating, validateError, lastValidation, dirty, onValidate, onJump }: {
  issues: Issue[];
  serverStale: boolean;
  validating: boolean;
  validateError: string | null;
  lastValidation: { isValid: boolean; version: number } | null;
  dirty: boolean;
  onValidate: () => void;
  onJump: (issue: Issue) => void;
}) {
  const server = issues.filter((issue) => issue.source === "server");
  return <div className="se-form" data-testid="issues-panel">
    <div className="se-form-head se-validation-head">
      <div><h3>Kiểm tra bản nháp</h3><p>Lỗi hiện ngay trong trình duyệt; nút Kiểm tra nhờ máy chủ xác nhận, gồm neo đối tượng và năng lực runtime.</p></div>
      <Button type="button" variant="secondary" size="sm" disabled={validating} onClick={onValidate} data-testid="validate-inline"><ShieldCheck size={14} aria-hidden="true" /> {validating ? "Đang kiểm tra…" : dirty ? "Lưu và kiểm tra" : "Kiểm tra"}</Button>
    </div>
    {validateError && <Alert tone="danger" title="Kiểm tra không thành công">{validateError}</Alert>}
    {lastValidation && !validateError && (
      lastValidation.isValid && server.length === 0
        ? <Alert tone="success" title={serverStale ? "Máy chủ xác nhận bản đã lưu trước đó hợp lệ" : "Máy chủ xác nhận bản nháp hợp lệ về cấu trúc"}>{serverStale ? "Bạn đã sửa sau lần kiểm tra này; kiểm tra lại để chắc chắn." : "Việc kiểm tra hình học IFC và năng lực runtime sâu hơn do worker thực hiện khi tạo gói, không nằm trong bước này."}</Alert>
        : <Alert tone="warning" title={`Máy chủ báo ${server.length} vấn đề${serverStale ? " (kết quả có thể đã cũ vì bạn đã sửa)" : ""}`} />
    )}
    {issues.length === 0
      ? <div className="se-empty-ok"><CheckCircle2 size={18} aria-hidden="true" /> Không có lỗi cấu trúc nào.</div>
      : <ul className="se-issues">
        {issues.map((issue) => <li key={`${issue.source}|${issue.code}|${issue.path}`}>
          <button type="button" onClick={() => onJump(issue)} data-testid="issue-item">
            <span className="se-issue-top"><code>{issue.code}</code><StatusBadge tone={issue.source === "server" ? "info" : "neutral"}>{issue.source === "server" ? "Máy chủ" : "Trình duyệt"}</StatusBadge></span>
            <span>{issue.message}</span>
            <small>{issue.path}</small>
          </button>
        </li>)}
      </ul>}
  </div>;
}
