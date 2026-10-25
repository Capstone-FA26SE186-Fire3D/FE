"use client";

import { CheckCircle2, ShieldCheck } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { SupportCode } from "@/components/ui/support-code";

import type { Issue } from "../../store/validation";
import type { ServerReport } from "../../v1/use-editor-v1";

function IssueList({ items, onJump, label }: { items: Issue[]; onJump?: (issue: Issue) => void; label: string }) {
  return <ul className="se-issues" aria-label={label}>
    {items.map((issue) => <li key={`${issue.source}|${issue.code}|${issue.path}`}>
      <button type="button" onClick={() => onJump?.(issue)} disabled={!onJump} data-testid="issue-item" data-code={issue.code} data-path={issue.path}>
        <span className="se-issue-top"><span>{issue.message}</span><StatusBadge tone={issue.source === "server" ? "info" : "neutral"}>{issue.source === "server" ? "Hệ thống" : "Trình duyệt"}</StatusBadge></span>
      </button>
      <SupportCode code={issue.code} id={issue.path} />
    </li>)}
  </ul>;
}

const time = (at: number) => new Date(at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

/**
 * Validation of the document being edited. `validate-state` checks the UNSAVED body; its answer is tied to the hash of what
 * was sent. After any further edit the answer is shown as stale and no longer drives per-object markers.
 */
export function V1IssuesPanel({ issues, shapeProblems, report, reportStale, validating, validateError, dirty, onValidate, onJump }: {
  issues: Issue[];
  shapeProblems: Issue[];
  report: ServerReport | null;
  reportStale: boolean;
  validating: boolean;
  validateError: string | null;
  dirty: boolean;
  onValidate: () => void;
  onJump: (issue: Issue) => void;
}) {
  const shapePaths = new Set(shapeProblems.map((item) => `${item.code}|${item.path}`));
  const live = issues.filter((issue) => !shapePaths.has(`${issue.code}|${issue.path}`));
  const server = live.filter((issue) => issue.source === "server");
  const client = live.filter((issue) => issue.source === "client");
  return <div className="se-form" data-testid="issues-panel">
    <div className="se-form-head se-validation-head">
      <div><h3>Kiểm tra bản nháp</h3><p>Nút Kiểm tra gửi đúng nội dung đang sửa (kể cả chưa lưu) để hệ thống kiểm tra; không lưu và không đổi phiên bản. Lỗi cấu trúc và thiếu sót hiện ngay trong trình duyệt.</p></div>
      <Button type="button" variant="secondary" size="sm" disabled={validating} onClick={onValidate} data-testid="validate-inline"><ShieldCheck size={14} aria-hidden="true" /> {validating ? "Đang kiểm tra…" : dirty ? "Kiểm tra nội dung chưa lưu" : "Kiểm tra"}</Button>
    </div>
    {validateError && <Alert tone="danger" title="Kiểm tra không thành công">{validateError}</Alert>}
    {report && (
      <div className="ops-stack" data-testid="server-report" data-stale={reportStale}>
        {reportStale
          ? <Alert tone="warning" title="Kết quả cũ" ><span data-testid="report-stale">Bạn đã sửa nội dung sau lần {report.source === "validate" ? "kiểm tra" : "lưu bị từ chối"} lúc {time(report.at)}. Kết quả này mô tả bản trước đó nên không gắn vào đối tượng; kiểm tra lại để cập nhật.</span></Alert>
          : report.isValid
            ? <Alert tone="success" title="Hệ thống xác nhận nội dung hiện tại hợp lệ">Hợp lệ lúc {time(report.at)}: cấu trúc, mô hình 3D đã gắn, tầng, điểm neo và khả năng của ứng dụng. Đây chưa phải kiểm tra tự động mô hình hay chạy thử trên ứng dụng.</Alert>
            : <Alert tone="warning" title={`Hệ thống báo ${report.issues.length} vấn đề (${report.source === "validate" ? "kiểm tra" : "lưu bị từ chối"} lúc ${time(report.at)})`} />}
        {reportStale && report.issues.length > 0 && <details>
          <summary>{report.issues.length} vấn đề của kết quả cũ</summary>
          <IssueList items={report.issues} label="Vấn đề của kết quả cũ" />
        </details>}
      </div>
    )}
    {shapeProblems.length > 0 && <section aria-label="Chưa thể lưu" className="ops-stack" data-testid="shape-problems">
      <Alert tone="danger" title={`Chưa thể lưu: ${shapeProblems.length} lỗi cấu trúc`}>Hệ thống sẽ không nhận nội dung này, nên nút Lưu bị khóa cho đến khi sửa.</Alert>
      <IssueList items={shapeProblems} onJump={onJump} label="Lỗi cấu trúc" />
    </section>}
    {server.length > 0 && <section aria-label="Hệ thống báo" className="ops-stack"><h3>Hệ thống báo</h3><IssueList items={server} onJump={onJump} label="Vấn đề do hệ thống báo" /></section>}
    {client.length > 0 && <section aria-label="Còn thiếu" className="ops-stack" data-testid="client-gaps"><h3>Còn thiếu hoặc chưa khớp</h3><IssueList items={client} onJump={onJump} label="Vấn đề do trình duyệt phát hiện" /></section>}
    {live.length === 0 && shapeProblems.length === 0 && <div className="se-empty-ok"><CheckCircle2 size={18} aria-hidden="true" /> Không phát hiện vấn đề nào ở phía trình duyệt{report && !reportStale ? " và hệ thống." : ". Bấm Kiểm tra để hệ thống xác nhận."}</div>}
  </div>;
}
