"use client";

import { ScrollText, Search } from "lucide-react";
import { useState } from "react";
import { useAsyncData } from "@/api/use-async-data";
import { useUrlParams } from "@/api/use-url-params";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CellTitle, DataTable, type DataColumn } from "@/components/ui/data-table";
import { Drawer } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/field";
import { ChipPopover, FilterChip } from "@/components/ui/filter-chip";
import { StatusBadge } from "@/components/ui/status-badge";
import { buildRange, formatDateTime, MAX_RANGE_DAYS } from "@/utils/date-range";
import { supportApi } from "../api";
import { auditActionLabel, auditActions, auditTargetLabel, isGuid } from "../labels";
import type { AuditLog } from "../types";
import { AuditDetail } from "./audit-detail";
import { PendingBox } from "./pending-box";
import { errorText } from "./ticket-thread";
import styles from "./support.module.css";

const PAGE_SIZE = 20;
const FILTER_KEYS = ["actorId", "organizationId", "action", "targetId", "correlationId", "from", "to"] as const;
type FilterKey = (typeof FILTER_KEYS)[number];
type FilterValues = Record<FilterKey, string>;
type FilterErrors = Partial<Record<FilterKey | "range", string>>;

const short = (id: string | null) => (id ? `${id.slice(0, 8)}…` : "—");
const shortDay = (day: string) => { const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day); return match ? `${match[3]}/${match[2]}` : day; };

function validate(values: FilterValues): FilterErrors {
  const errors: FilterErrors = {};
  for (const key of ["actorId", "organizationId", "targetId", "correlationId"] as const) {
    if (values[key] && !isGuid(values[key])) errors[key] = "Mã định danh chưa đúng. Hãy dán đủ mã gồm 36 ký tự.";
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

/** One GUID filter as a chip: the value is staged locally and sent with "Áp dụng bộ lọc". */
function GuidChip({ label, fieldLabel, value, error, onChange }: { label: string; fieldLabel: string; value: string; error?: string; onChange: (value: string) => void }) {
  return <ChipPopover label={label} value={value ? short(value) : "tất cả"} active={Boolean(value)} dataValue={value} panelLabel={`Bộ lọc ${label.toLowerCase()}`}>
    {(close) => <div className={styles.chipForm}>
      <Field label={fieldLabel} hint="Mã định danh gồm 36 ký tự." error={error}>{(p) => <Input {...p} value={value} onChange={(event) => onChange(event.target.value.trim())} placeholder="Dán mã định danh" spellCheck={false} autoComplete="off" className="font-mono" />}</Field>
      <div className={styles.actions}>{value && <Button type="button" size="sm" variant="quiet" onClick={() => onChange("")}>Bỏ</Button>}<Button type="button" size="sm" variant="secondary" onClick={close}>Xong</Button></div>
    </div>}
  </ChipPopover>;
}

/**
 * The seven audit filters as chips (Figma "Nhật ký audit"). Values are staged in the chips and validated as a whole
 * (GUIDs, both dates, ≤ 90 days) before one "Áp dụng bộ lọc" writes them to the URL, so the API receives one request.
 */
function Filters({ initial, onApply, onClear, busy }: { initial: FilterValues; onApply: (values: FilterValues) => void; onClear: () => void; busy: boolean }) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<FilterErrors>(() => validate(initial));
  const set = (key: FilterKey) => (value: string) => setValues((current) => ({ ...current, [key]: value }));
  const dirty = FILTER_KEYS.some((key) => values[key] !== initial[key]);
  const filtering = FILTER_KEYS.some((key) => initial[key]);

  const submit = () => {
    const found = validate(values);
    setErrors(found);
    if (Object.keys(found).length === 0) onApply(values);
  };

  const rangeValue = values.from && values.to ? `${shortDay(values.from)} – ${shortDay(values.to)}` : values.from || values.to ? "chưa đủ hai ngày" : "30 ngày gần nhất";
  const messages = Array.from(new Set(Object.values(errors).filter(Boolean))) as string[];

  return <div role="group" aria-label="Bộ lọc nhật ký thao tác">
    <div className={styles.auditFilters}>
      <ChipPopover label="Thời gian" value={rangeValue} active={Boolean(values.from || values.to)} dataValue={values.from && values.to ? `${values.from}..${values.to}` : ""} panelLabel="Khoảng thời gian">
        {(close) => <div className={styles.chipForm}>
          <Field label="Từ ngày" hint={`Tối đa ${MAX_RANGE_DAYS} ngày, tính theo giờ quốc tế (UTC).`} error={errors.from}>{(p) => <Input {...p} type="date" value={values.from} onChange={(event) => set("from")(event.target.value)} />}</Field>
          <Field label="Đến ngày" error={errors.to}>{(p) => <Input {...p} type="date" value={values.to} onChange={(event) => set("to")(event.target.value)} />}</Field>
          <div className={styles.actions}>{(values.from || values.to) && <Button type="button" size="sm" variant="quiet" onClick={() => setValues((current) => ({ ...current, from: "", to: "" }))}>Bỏ</Button>}<Button type="button" size="sm" variant="secondary" onClick={close}>Xong</Button></div>
        </div>}
      </ChipPopover>
      <FilterChip label="Hành động" value={values.action} onChange={set("action")} options={auditActions.map((action) => ({ value: action, label: auditActionLabel(action) }))} />
      <GuidChip label="Tổ chức" fieldLabel="Mã tổ chức" value={values.organizationId} error={errors.organizationId} onChange={set("organizationId")} />
      <GuidChip label="Người thực hiện" fieldLabel="Mã người thực hiện" value={values.actorId} error={errors.actorId} onChange={set("actorId")} />
      <GuidChip label="Đối tượng" fieldLabel="Mã đối tượng" value={values.targetId} error={errors.targetId} onChange={set("targetId")} />
      <GuidChip label="Truy vết" fieldLabel="Mã truy vết" value={values.correlationId} error={errors.correlationId} onChange={set("correlationId")} />
      <Button type="button" size="sm" variant={dirty ? "primary" : "secondary"} onClick={submit} disabled={busy}>Áp dụng bộ lọc</Button>
      {(filtering || dirty) && <Button type="button" size="sm" variant="quiet" onClick={onClear}>Xóa bộ lọc</Button>}
    </div>
    {messages.length > 0 && <Alert tone="danger" title="Bộ lọc chưa hợp lệ" className="mb-3">{messages.join(" ")}</Alert>}
  </div>;
}

/** Audit log (only here): metadata rows from `GET /api/admin/audit-logs`; a row opens the record (`?log=`) in a drawer. */
export function AuditLogTab({ accessToken }: { accessToken: string }) {
  const { page, get, setParams, setPage } = useUrlParams({ pageSize: PAGE_SIZE });
  const values = Object.fromEntries(FILTER_KEYS.map((key) => [key, get(key)])) as FilterValues;
  const logId = get("log");

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

  const items = blocked ? [] : list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  const filtering = FILTER_KEYS.some((key) => values[key]);
  const apply = (next: FilterValues) => setParams(Object.fromEntries(FILTER_KEYS.map((key) => [key, next[key]])));
  const clear = () => setParams(Object.fromEntries(FILTER_KEYS.map((key) => [key, null])));

  const columns: DataColumn<AuditLog>[] = [
    { key: "time", header: "Thời điểm", primary: true, width: 180, render: (log) => formatDateTime(log.createdAt) },
    { key: "action", header: "Hành động", width: 150, render: (log) => <StatusBadge tone="neutral">{auditActionLabel(log.action)}</StatusBadge> },
    { key: "target", header: "Đối tượng", render: (log) => <CellTitle title={auditTargetLabel(log.targetEntity)} sub={<span className={styles.mono} title={log.targetId ?? undefined}>{short(log.targetId)}</span>} /> },
    { key: "actor", header: "Người thực hiện", hideBelow: 900, render: (log) => log.actorDisplayName?.trim() ? <CellTitle title={log.actorDisplayName} sub={<span className={styles.mono} title={log.userId ?? undefined}>{short(log.userId)}</span>} /> : <span className={styles.mono} title={log.userId ?? undefined}>{log.userId ? short(log.userId) : "Hệ thống"}</span> },
    { key: "organization", header: "Tổ chức", hideBelow: 1100, render: (log) => log.organizationName?.trim() ? <CellTitle title={log.organizationName} sub={<span className={styles.mono} title={log.organizationId ?? undefined}>{short(log.organizationId)}</span>} /> : <span className={styles.mono} title={log.organizationId ?? undefined}>{short(log.organizationId)}</span> },
  ];

  return <>
    <Filters key={FILTER_KEYS.map((key) => values[key]).join("|")} initial={values} onApply={apply} onClear={clear} busy={list.loading} />

    {blocked && <Alert tone="danger" title="Bộ lọc chưa hợp lệ nên chưa gửi yêu cầu" className="mb-3">Sửa các trường được đánh dấu rồi áp dụng lại.</Alert>}

    {list.data && !blocked && <p className={styles.note} style={{ marginBottom: 12 }}>
      <span>Khoảng thời gian: <strong>{formatDateTime(list.data.from)}</strong> – <strong>{formatDateTime(list.data.to)}</strong>{values.from ? "" : " (mặc định 30 ngày gần nhất)"}</span>
      <StatusBadge tone="info">Chỉ thông tin chung</StatusBadge>
    </p>}

    <DataTable<AuditLog>
      caption="Nhật ký thao tác"
      data-testid="admin-audit-table"
      columns={columns}
      rows={items}
      rowKey={(log) => log.id}
      loading={!blocked && list.loading && !list.data}
      onRowClick={(log) => setParams({ log: log.id, page })}
      error={!blocked && list.error !== undefined ? <Alert tone="danger" title="Không tải được nhật ký thao tác" action={<Button size="sm" variant="secondary" className="mt-3" onClick={list.reload}>Thử lại</Button>}>{errorText(list.error, "Hãy kiểm tra kết nối rồi thử lại.")}</Alert> : undefined}
      empty={blocked
        ? <EmptyState icon={Search} title="Chưa gửi yêu cầu" description="Sửa bộ lọc rồi áp dụng lại." />
        : <EmptyState icon={filtering ? Search : ScrollText} title={filtering ? "Không có bản ghi phù hợp." : "Chưa có thao tác nào trong khoảng thời gian này"} description={filtering ? "Thử nới bộ lọc hoặc mở rộng khoảng thời gian (tối đa 90 ngày)." : "Chọn khoảng thời gian rộng hơn để xem thêm."} />}
      pagination={total > PAGE_SIZE && !blocked ? { page, pageSize: PAGE_SIZE, totalCount: total, onPageChange: setPage } : undefined}
    />
    <p className={styles.hint}>Bấm một hàng để mở chi tiết thay đổi theo từng trường.</p>

    <PendingBox title="Tính năng sắp có" items={["Xuất nhật ký ra tệp.", "Xem nội dung lý do của thao tác (hiện chỉ biết có lý do hay không)."]} />

    <Drawer open={Boolean(logId)} onOpenChange={(value) => { if (!value) setParams({ log: null, page }); }} size="md" data-testid="audit-drawer" title="Chi tiết thao tác" description="Thông tin chung và các thay đổi được phép xem; dùng nút Lọc để xem các thao tác cùng người thực hiện, đối tượng hoặc mã truy vết.">
      {logId && <AuditDetail key={logId} id={logId} accessToken={accessToken} onFilter={(patch) => { const next = { ...values, ...patch }; setParams({ ...Object.fromEntries(FILTER_KEYS.map((key) => [key, next[key]])), log: null }); }} />}
    </Drawer>
  </>;
}
