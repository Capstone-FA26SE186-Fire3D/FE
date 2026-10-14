"use client";

import { LockKeyhole } from "lucide-react";
import { ApiError } from "@/api";
import { useAsyncData } from "@/api/use-async-data";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SkeletonRows } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table } from "@/components/ui/table";
import { formatDateTime } from "@/utils/date-range";
import { supportApi } from "../api";
import { auditFieldLabel, formatAuditValue } from "../labels";
import type { AuditFieldChange } from "../types";
import styles from "./support.module.css";

type FilterPatch = { action?: string; targetId?: string; actorId?: string; organizationId?: string; correlationId?: string };

function Value({ value }: { value: unknown }) {
  const shown = formatAuditValue(value, formatDateTime);
  return <span className={shown.mono ? styles.mono : undefined} title={shown.title}>{shown.text}</span>;
}

/** Diff of the allowlisted fields. A real `<table>` so screen readers get Trước/Sau per field, not just colour. */
function Changes({ changes }: { changes: AuditFieldChange[] }) {
  if (!changes.length) return <p className={styles.muted}>Bản ghi này không có thay đổi giá trị nào được phép hiển thị.</p>;
  return <Table caption="Thay đổi theo từng trường">
    <thead><tr><th>Trường</th><th>Trước</th><th>Sau</th></tr></thead>
    <tbody>{changes.map((change) => <tr key={change.field}>
      <th scope="row" style={{ fontWeight: 600, textTransform: "none", letterSpacing: 0, fontSize: 13, color: "var(--text)" }}>{auditFieldLabel(change.field)}</th>
      <td><Value value={change.before} /></td>
      <td><Value value={change.after} /></td>
    </tr>)}</tbody>
  </Table>;
}

/**
 * One audit record from `GET /api/admin/audit-logs/{id}`: metadata with display names, the allowlisted field changes and
 * whether an administrative reason was recorded. The reason itself is free text and is deliberately not shown here.
 */
export function AuditDetail({ id, accessToken, onFilter }: { id: string; accessToken: string; onFilter: (patch: FilterPatch) => void }) {
  const detail = useAsyncData(`audit-detail:${id}`, (signal) => supportApi.getAuditLog(accessToken, id, signal), true);
  const log = detail.data;

  if (!log) {
    if (detail.error !== undefined) {
      const missing = detail.error instanceof ApiError && detail.error.status === 404;
      return <Alert tone="danger" title={missing ? "Không tìm thấy bản ghi" : "Không mở được bản ghi audit"} action={missing ? undefined : <Button size="sm" variant="secondary" className="mt-3" onClick={detail.reload}>Thử lại</Button>}>{missing ? "Bản ghi không tồn tại hoặc không còn truy cập được." : "Hãy kiểm tra kết nối rồi thử lại."}</Alert>;
    }
    return <SkeletonRows rows={6} label="Đang tải bản ghi audit…" />;
  }

  const rows: Array<[string, string, FilterPatch | null, boolean]> = [
    ["Thời điểm", formatDateTime(log.createdAt), null, false],
    ["Hành động", log.action, { action: log.action }, false],
    ["Loại đối tượng", log.targetEntity ?? "—", null, false],
    ["Mã đối tượng", log.targetId ?? "—", log.targetId ? { targetId: log.targetId } : null, true],
    ["Người thực hiện", log.actorDisplayName?.trim() || (log.userId ? "Chưa có tên hiển thị" : "Hệ thống / không xác định"), log.userId ? { actorId: log.userId } : null, false],
    ["Mã người thực hiện", log.userId ?? "—", null, true],
    ["Tổ chức", log.organizationName?.trim() || (log.organizationId ? "Chưa có tên hiển thị" : "Không thuộc tổ chức"), log.organizationId ? { organizationId: log.organizationId } : null, false],
    ["Mã tổ chức", log.organizationId ?? "—", null, true],
    ["Mã correlation", log.correlationId ?? "—", log.correlationId ? { correlationId: log.correlationId } : null, true],
    ["Mã bản ghi", log.id, null, true],
  ];

  return <div className="ops-stack">
    <Alert tone="info">Chỉ hiển thị metadata và các trường thay đổi được backend cho phép (trạng thái, mã, thời điểm, số liệu). Không có mật khẩu, token, nội dung ticket hay dữ liệu cá nhân.</Alert>
    <dl className={styles.meta}>
      {rows.map(([label, value, filter, mono]) => <div key={label} style={{ display: "contents" }}>
        <dt>{label}</dt>
        <dd><span className={mono ? styles.mono : undefined}>{value}</span>{filter && <> <Button size="sm" variant="quiet" onClick={() => onFilter(filter)} aria-label={`Lọc theo ${label.toLowerCase()}`} style={{ minHeight: 28, padding: "0 8px", marginLeft: 6 }}>Lọc</Button></>}</dd>
      </div>)}
    </dl>
    <section className={styles.section} aria-label="Thay đổi">
      <h3>Thay đổi</h3>
      <Changes changes={log.changes ?? []} />
    </section>
    {log.reason && <p className={styles.muted} style={{ display: "flex", alignItems: "center", gap: 8 }}><LockKeyhole size={16} aria-hidden="true" /><StatusBadge tone="neutral">Có lý do quản trị</StatusBadge>Lý do là văn bản tự do nên không hiển thị ở giao diện này.</p>}
  </div>;
}
