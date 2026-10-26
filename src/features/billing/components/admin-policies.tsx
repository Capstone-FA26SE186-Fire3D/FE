"use client";

import { Gauge, Plus, RefreshCw } from "lucide-react";
import { useId, useRef, useState, type FormEvent } from "react";
import { ApiError } from "@/api";
import { useAsyncData } from "@/api/use-async-data";
import { useUrlParams } from "@/api/use-url-params";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CellTitle, DataTable, type DataColumn } from "@/components/ui/data-table";
import { Modal } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { billingApi } from "../api";
import { billingErrorText } from "../errors";
import { formatDateTime, localInputToIso } from "../format";
import type { QuotaPolicy } from "../types";
import "../billing.css";

const PAGE_SIZE = 20;
const UNIT = /^[a-z][a-z0-9_-]{0,49}$/;
const AUDIENCE: Record<string, string> = { organization: "Tổ chức" };
const POLICY_KIND: Record<string, string> = { quota: "Hạn mức trả trước" };
const ROLLOVER: Record<string, string> = { None: "Không cộng dồn sang kỳ sau" };

/**
 * Prepaid AI quota policy versions (Figma "Thương mại · Chính sách quota"). A version is immutable (no edit, no delete):
 * changing a unit or validity means creating a new version and pointing packages/top-ups at it. Audience, kind and
 * rollover are fixed by the server; there is no default unit or amount.
 */
export function PoliciesSection({ accessToken }: { accessToken: string }) {
  const toast = useToast();
  const formId = useId();
  const { page, setPage } = useUrlParams({ pageSize: PAGE_SIZE });
  const list = useAsyncData(`commerce:policies:${page}`, (signal) => billingApi.listQuotaPolicies(accessToken, page, PAGE_SIZE, signal));
  const lock = useRef(false);
  const [open, setOpen] = useState(false);
  const [unit, setUnit] = useState("");
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const openCreate = () => { setUnit(""); setFrom(""); setUntil(""); setErrors({}); setFormError(""); setOpen(true); };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (lock.current) return;
    const found: Record<string, string> = {};
    const fromIso = localInputToIso(from);
    const untilIso = until ? localInputToIso(until) : null;
    if (!UNIT.test(unit.trim())) found.quotaUnit = "Viết liền không dấu, bắt đầu bằng chữ, tối đa 50 ký tự (ví dụ: luot-hoi).";
    if (!fromIso) found.effectiveFrom = "Chọn thời điểm bắt đầu hiệu lực.";
    if (until && (!untilIso || !fromIso || new Date(untilIso) <= new Date(fromIso))) found.effectiveUntil = "Thời điểm kết thúc phải sau thời điểm bắt đầu, hoặc để trống nếu không giới hạn.";
    setErrors(found);
    if (Object.keys(found).length) return;
    lock.current = true; setSaving(true); setFormError("");
    try {
      const created = await billingApi.createQuotaPolicy(accessToken, { quotaUnit: unit.trim(), effectiveFrom: fromIso as string, effectiveUntil: untilIso });
      toast.notify({ tone: "success", title: "Đã tạo phiên bản chính sách", description: `Đơn vị ${created.quotaUnit}. Phiên bản không thể sửa; muốn thay đổi hãy tạo phiên bản mới.` });
      setOpen(false);
      list.reload();
    } catch (cause) {
      if (cause instanceof ApiError) setErrors({ quotaUnit: cause.fieldMessage("quotaUnit"), effectiveFrom: cause.fieldMessage("effectiveFrom"), effectiveUntil: cause.fieldMessage("effectiveUntil") });
      setFormError(billingErrorText(cause));
    } finally { lock.current = false; setSaving(false); }
  };

  const items = list.data?.items ?? [];
  const total = list.data?.totalCount ?? 0;

  const columns: DataColumn<QuotaPolicy>[] = [
    { key: "version", header: "Phiên bản", primary: true, render: (item) => <CellTitle title={`Áp dụng từ ${formatDateTime(item.effectiveFrom)}`} /> },
    { key: "unit", header: "Đơn vị", width: 140, render: (item) => item.quotaUnit },
    { key: "period", header: "Hiệu lực", width: 240, render: (item) => <CellTitle title={formatDateTime(item.effectiveFrom)} sub={`đến ${item.effectiveUntil ? formatDateTime(item.effectiveUntil) : "không giới hạn"}`} /> },
    { key: "audience", header: "Đối tượng", width: 220, hideBelow: 900, render: (item) => <CellTitle title={`${AUDIENCE[item.audience] ?? "Khác"} · ${POLICY_KIND[item.policyKind] ?? "Khác"}`} sub={ROLLOVER[item.rollover] ?? "Khác"} /> },
  ];

  return <div className="ops-stack">
    <DataTable<QuotaPolicy>
      caption="Phiên bản chính sách hạn mức AI"
      data-testid="admin-quota-policies-table"
      columns={columns}
      rows={items}
      rowKey={(item) => item.id}
      loading={list.loading && !list.data}
      error={list.error !== undefined ? <Alert tone="danger" title="Không tải được chính sách hạn mức" action={<Button size="sm" variant="secondary" className="mt-3" onClick={list.reload}>Thử lại</Button>}>{billingErrorText(list.error)}</Alert> : undefined}
      toolbar={<>
        <p className="bill-muted ops-toolbar-grow" style={{ margin: 0 }}>Mỗi phiên bản không sửa được; hạn mức không cộng dồn sang kỳ sau. Không có chính sách hay số lượng mặc định.</p>
        <Button variant="quiet" onClick={list.reload} disabled={list.loading} aria-label="Tải lại danh sách"><RefreshCw size={16} aria-hidden="true" />Tải lại</Button>
        <Button onClick={openCreate}><Plus size={16} aria-hidden="true" />Tạo phiên bản</Button>
      </>}
      empty={<EmptyState icon={Gauge} title="Chưa có chính sách hạn mức" description="Tạo phiên bản đầu tiên (đơn vị và khoảng hiệu lực) trước khi cấu hình gói có hạn mức AI hoặc phát hành báo giá nạp thêm." />}
      pagination={total > PAGE_SIZE ? { page, pageSize: PAGE_SIZE, totalCount: total, onPageChange: setPage } : undefined}
    />

    <Modal open={open} onOpenChange={(next) => { if (!next && !saving) setOpen(false); }} title="Tạo phiên bản chính sách" description="Không thể sửa hay xóa sau khi tạo. Đơn vị là lựa chọn nghiệp vụ rõ ràng; hệ thống không quy đổi giữa các đơn vị."
      footer={<><Button type="button" variant="quiet" onClick={() => setOpen(false)} disabled={saving}>Hủy</Button><Button type="submit" form={formId} disabled={saving}>{saving ? "Đang tạo…" : "Tạo phiên bản"}</Button></>}>
      <form id={formId} onSubmit={submit} noValidate className="ops-stack">
        <Field label="Đơn vị hạn mức" required error={errors.quotaUnit} hint="Ví dụ do bạn quy định (chữ thường, 1–50 ký tự).">{(p) => <Input {...p} maxLength={50} autoComplete="off" value={unit} onChange={(event) => setUnit(event.target.value)} />}</Field>
        <div className="ops-form-grid">
          <Field label="Hiệu lực từ" required error={errors.effectiveFrom} hint="Theo giờ địa phương.">{(p) => <Input {...p} type="datetime-local" value={from} onChange={(event) => setFrom(event.target.value)} />}</Field>
          <Field label="Hiệu lực đến" error={errors.effectiveUntil} hint="Để trống nếu không giới hạn.">{(p) => <Input {...p} type="datetime-local" value={until} onChange={(event) => setUntil(event.target.value)} />}</Field>
        </div>
        {formError && <Alert tone="danger" title="Chưa tạo được phiên bản">{formError}</Alert>}
      </form>
    </Modal>
  </div>;
}
