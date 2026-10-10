"use client";

import { ScrollText, Search } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useAsyncData } from "@/api/use-async-data";
import { useUrlParams } from "@/api/use-url-params";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select } from "@/components/ui/field";
import { SkeletonRows } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Pagination, Table, TableMessage } from "@/components/ui/table";
import { buildRange, formatDateTime, MAX_RANGE_DAYS } from "@/utils/date-range";
import { supportApi } from "../api";
import { auditActions, isGuid } from "../labels";
import type { AuditLog } from "../types";
import { PendingBox } from "./pending-box";
import { errorText } from "./ticket-thread";
import styles from "./support.module.css";

const PAGE_SIZE = 20;
const FILTER_KEYS = ["actorId", "organizationId", "action", "targetId", "correlationId", "from", "to"] as const;
type FilterKey = (typeof FILTER_KEYS)[number];
type FilterValues = Record<FilterKey, string>;
type FilterErrors = Partial<Record<FilterKey | "range", string>>;

const short = (id: string | null) => (id ? `${id.slice(0, 8)}…` : "—");

function validate(values: FilterValues): FilterErrors {
  const errors: FilterErrors = {};
  for (const key of ["actorId", "organizationId", "targetId", "correlationId"] as const) {
    if (values[key] && !isGuid(values[key])) errors[key] = "Nhập mã dạng GUID, ví dụ 3f2504e0-4f89-41d3-9a0c-0305e82c3301.";
  }
  if (values.from || values.to) {
    if (!values.from || !values.to) errors[values.from ? "to" : "from"] = "Chọn đủ cả hai ngày hoặc để trống cả hai (mặc định 30 ngày gần nhất).";
    else {
      const range = buildRange(values.from, values.to);
      if (!range.ok) errors[range.field === "range" ? "from" : range.field] = range.message;
    }
  }
  return errors;
}

function Filters({ initial, onApply, onClear, busy }: { initial: FilterValues; onApply: (values: FilterValues) => void; onClear: () => void; busy: boolean }) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<FilterErrors>(() => validate(initial));
  const set = (key: FilterKey) => (event: { target: { value: string } }) => setValues((current) => ({ ...current, [key]: event.target.value.trim() }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const found = validate(values);
    setErrors(found);
    if (Object.keys(found).length === 0) onApply(values);
  };

  return <form className={`ops-panel ${styles.filters}`} onSubmit={submit} noValidate aria-label="Bộ lọc nhật ký audit">
    <Field label="Từ ngày" hint={`Tối đa ${MAX_RANGE_DAYS} ngày, tính theo UTC.`} error={errors.from}>{(p) => <Input {...p} type="date" value={values.from} onChange={set("from")} />}</Field>
    <Field label="Đến ngày" error={errors.to}>{(p) => <Input {...p} type="date" value={values.to} onChange={set("to")} />}</Field>
    <Field label="Hành động" className={styles.wide}>{(p) => <Select {...p} value={values.action} onChange={set("action")}><option value="">Mọi hành động</option>{auditActions.map((action) => <option key={action} value={action}>{action}</option>)}</Select>}</Field>
    <Field label="Mã người thực hiện" error={errors.actorId} className={styles.wide}>{(p) => <Input {...p} value={values.actorId} onChange={set("actorId")} placeholder="GUID" spellCheck={false} autoComplete="off" />}</Field>
    <Field label="Mã tổ chức" error={errors.organizationId} className={styles.wide}>{(p) => <Input {...p} value={values.organizationId} onChange={set("organizationId")} placeholder="GUID" spellCheck={false} autoComplete="off" />}</Field>
    <Field label="Mã đối tượng" error={errors.targetId} className={styles.wide}>{(p) => <Input {...p} value={values.targetId} onChange={set("targetId")} placeholder="GUID" spellCheck={false} autoComplete="off" />}</Field>
    <Field label="Mã correlation" error={errors.correlationId} className={styles.wide}>{(p) => <Input {...p} value={values.correlationId} onChange={set("correlationId")} placeholder="GUID" spellCheck={false} autoComplete="off" />}</Field>
    <div className={styles.filterActions}>
      <Button type="submit" disabled={busy}>Áp dụng bộ lọc</Button>
      <Button type="button" variant="quiet" onClick={onClear}>Xóa bộ lọc</Button>
    </div>
  </form>;
}

function AuditDetail({ log, onFilter }: { log: AuditLog; onFilter: (patch: Partial<FilterValues>) => void }) {
  const rows: Array<[string, string, Partial<FilterValues> | null]> = [
    ["Thời điểm", formatDateTime(log.createdAt), null],
    ["Hành động", log.action, { action: log.action }],
    ["Loại đối tượng", log.targetEntity ?? "—", null],
    ["Mã đối tượng", log.targetId ?? "—", log.targetId ? { targetId: log.targetId } : null],
    ["Mã người thực hiện", log.userId ?? "Hệ thống / không xác định", log.userId ? { actorId: log.userId } : null],
    ["Mã tổ chức", log.organizationId ?? "—", log.organizationId ? { organizationId: log.organizationId } : null],
    ["Mã correlation", log.correlationId ?? "—", log.correlationId ? { correlationId: log.correlationId } : null],
    ["Mã bản ghi", log.id, null],
  ];
  return <div className="ops-stack">
    <Alert tone="info">Nhật ký chỉ lưu metadata: ai làm gì, trên đối tượng nào, lúc nào. Không có nội dung thay đổi, mật khẩu hay token.</Alert>
    <dl className={styles.meta}>
      {rows.map(([label, value, filter]) => <div key={label} style={{ display: "contents" }}>
        <dt>{label}</dt>
        <dd><span className={label.startsWith("Mã") ? styles.mono : undefined}>{value}</span>{filter && <> <Button size="sm" variant="quiet" onClick={() => onFilter(filter)} aria-label={`Lọc theo ${label.toLowerCase()}`} style={{ minHeight: 28, padding: "0 8px", marginLeft: 6 }}>Lọc</Button></>}</dd>
      </div>)}
    </dl>
  </div>;
}

export function AuditLogTab({ accessToken }: { accessToken: string }) {
  const { page, get, setParams, setPage } = useUrlParams({ pageSize: PAGE_SIZE });
  const values = Object.fromEntries(FILTER_KEYS.map((key) => [key, get(key)])) as FilterValues;
  const [selected, setSelected] = useState<AuditLog | null>(null);

  const invalid = validate(values);
  const blocked = Object.keys(invalid).length > 0;
  const range = values.from && values.to ? buildRange(values.from, values.to) : null;

  const list = useAsyncData(
    `audit:${page}:${FILTER_KEYS.map((key) => values[key]).join("|")}`,
    (signal) => supportApi.listAuditLogs(accessToken, {
      page,
      pageSize: PAGE_SIZE,
      actorId: values.actorId || undefined,
      organizationId: values.organizationId || undefined,
      action: values.action || undefined,
      targetId: values.targetId || undefined,
      correlationId: values.correlationId || undefined,
      from: range?.ok ? range.from : undefined,
      to: range?.ok ? range.to : undefined,
    }, signal),
    !blocked,
  );

  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  const filtering = FILTER_KEYS.some((key) => values[key]);
  const apply = (next: FilterValues) => setParams(Object.fromEntries(FILTER_KEYS.map((key) => [key, next[key]])));
  const clear = () => setParams(Object.fromEntries(FILTER_KEYS.map((key) => [key, null])));

  return <>
    <Filters key={FILTER_KEYS.map((key) => values[key]).join("|")} initial={values} onApply={apply} onClear={clear} busy={list.loading} />

    {blocked && <Alert tone="danger" title="Bộ lọc chưa hợp lệ nên chưa gửi yêu cầu">Sửa các trường được đánh dấu rồi áp dụng lại.</Alert>}
    {list.error !== undefined && !blocked && <Alert tone="danger" title="Không tải được nhật ký audit" action={<Button size="sm" variant="secondary" className="mt-3" onClick={list.reload}>Thử lại</Button>}>{errorText(list.error, "Hãy kiểm tra kết nối rồi thử lại.")}</Alert>}

    {list.data && !blocked && <p className={styles.note}>
      <span>Khoảng thời gian: <strong>{formatDateTime(list.data.from)}</strong> – <strong>{formatDateTime(list.data.to)}</strong>{values.from ? "" : " (mặc định 30 ngày gần nhất)"}</span>
      <StatusBadge tone="info">Chỉ metadata</StatusBadge>
    </p>}

    <Table caption="Nhật ký audit">
      <thead><tr><th>Thời điểm</th><th>Hành động</th><th>Đối tượng</th><th>Người thực hiện</th><th>Tổ chức</th></tr></thead>
      <tbody>
        {list.loading && !list.data && !blocked && <TableMessage colSpan={5}><SkeletonRows rows={6} label="Đang tải nhật ký audit…" /></TableMessage>}
        {!blocked && items.map((log) => <tr key={log.id}>
          <td><button type="button" className={styles.rowButton} onClick={() => setSelected(log)} aria-label={`Xem bản ghi ${log.action} lúc ${formatDateTime(log.createdAt)}`}>{formatDateTime(log.createdAt)}</button></td>
          <td><StatusBadge tone="neutral">{log.action}</StatusBadge></td>
          <td>{log.targetEntity ?? "—"}<span className={`ops-cell-sub ${styles.mono}`} title={log.targetId ?? undefined}>{short(log.targetId)}</span></td>
          <td><span className={styles.mono} title={log.userId ?? undefined}>{short(log.userId)}</span></td>
          <td><span className={styles.mono} title={log.organizationId ?? undefined}>{short(log.organizationId)}</span></td>
        </tr>)}
        {list.data && !blocked && !items.length && <TableMessage colSpan={5}><EmptyState icon={filtering ? Search : ScrollText} title={filtering ? "Không có bản ghi phù hợp." : "Chưa có bản ghi audit trong khoảng thời gian này"} description={filtering ? "Thử nới bộ lọc hoặc mở rộng khoảng thời gian (tối đa 90 ngày)." : "Chọn khoảng thời gian rộng hơn để xem thêm."} /></TableMessage>}
      </tbody>
    </Table>
    {total > PAGE_SIZE && !blocked && <Pagination page={page} pageSize={PAGE_SIZE} totalCount={total} onPageChange={setPage} disabled={list.loading} />}

    <PendingBox title="Chưa có từ backend" items={["Tên hiển thị của người thực hiện và tổ chức (nhật ký chỉ trả mã).", "Giá trị cũ/mới của thay đổi và lý do hỗ trợ khi admin thao tác thay tổ chức (nhật ký đọc dữ liệu cá nhân chưa triển khai).", "Xuất nhật ký ra tệp."]} />

    <Drawer open={selected !== null} onOpenChange={(value) => { if (!value) setSelected(null); }} title="Chi tiết bản ghi audit" description="Chỉ metadata; dùng nút Lọc để lần theo cùng người thực hiện, đối tượng hoặc correlation.">
      {selected && <AuditDetail log={selected} onFilter={(patch) => { setSelected(null); apply({ ...values, ...patch }); }} />}
    </Drawer>
  </>;
}
