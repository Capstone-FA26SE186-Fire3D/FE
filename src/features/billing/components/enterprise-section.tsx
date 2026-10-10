"use client";

import { Mail, Send } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { ApiError } from "@/api";
import { useIdempotencyKey } from "@/api/idempotency";
import { useAsyncData } from "@/api/use-async-data";
import { useUrlParams } from "@/api/use-url-params";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import { SkeletonRows } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Pagination, Table, TableMessage } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { billingApi } from "../api";
import { billingErrorText } from "../errors";
import { formatDateTime } from "../format";
import type { EnterpriseRequestInput } from "../types";
import "../billing.css";

const PAGE_SIZE = 10;
const statusLabel: Record<string, string> = { New: "Mới gửi", Contacted: "Đã liên hệ", Quoted: "Đã báo giá", Closed: "Đã đóng" };

type Form = { requestedBuildingCount: string; requestedDurationMonths: string; contactName: string; contactEmail: string; contactPhone: string; notes: string };
const empty: Form = { requestedBuildingCount: "", requestedDurationMonths: "", contactName: "", contactEmail: "", contactPhone: "", notes: "" };

function validate(form: Form) {
  const errors: Partial<Record<keyof Form, string>> = {};
  const count = Number(form.requestedBuildingCount);
  if (!Number.isInteger(count) || count < 1) errors.requestedBuildingCount = "Nhập số công trình là số nguyên lớn hơn 0.";
  if (form.requestedDurationMonths.trim() && (!Number.isInteger(Number(form.requestedDurationMonths)) || Number(form.requestedDurationMonths) < 1)) errors.requestedDurationMonths = "Thời hạn là số tháng nguyên lớn hơn 0, hoặc để trống.";
  if (!form.contactName.trim() || form.contactName.trim().length > 255) errors.contactName = "Nhập tên người liên hệ (tối đa 255 ký tự).";
  if (!/^\S+@\S+\.\S+$/.test(form.contactEmail.trim())) errors.contactEmail = "Nhập email hợp lệ.";
  if (form.contactPhone.trim().length > 50) errors.contactPhone = "Số điện thoại tối đa 50 ký tự.";
  if (form.notes.trim().length > 10000) errors.notes = "Ghi chú tối đa 10.000 ký tự.";
  return errors;
}

/**
 * Contact form for bulk / enterprise purchases. It creates a request for the sales team only:
 * no quotation, payment or entitlement is created until PlatformAdmin follows up.
 */
export function EnterpriseSection({ accessToken, defaultEmail, defaultName }: { accessToken: string; defaultEmail?: string; defaultName?: string }) {
  const toast = useToast();
  const { page, setPage } = useUrlParams({ pageSize: PAGE_SIZE });
  const key = useIdempotencyKey();
  const lock = useRef(false);
  const [form, setForm] = useState<Form>({ ...empty, contactEmail: defaultEmail ?? "", contactName: defaultName ?? "" });
  const [errors, setErrors] = useState<ReturnType<typeof validate>>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [sent, setSent] = useState(false);

  const list = useAsyncData(`billing:enterprise:${page}`, (signal) => billingApi.listEnterpriseRequests(accessToken, page, PAGE_SIZE, "mine", signal));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (lock.current) return;
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length) return;
    const payload: EnterpriseRequestInput = {
      requestedBuildingCount: Number(form.requestedBuildingCount),
      requestedDurationMonths: form.requestedDurationMonths.trim() ? Number(form.requestedDurationMonths) : null,
      contactName: form.contactName.trim(),
      contactEmail: form.contactEmail.trim(),
      contactPhone: form.contactPhone.trim() || null,
      notes: form.notes.trim() || null,
    };
    lock.current = true;
    setSaving(true);
    setFormError("");
    setSent(false);
    try {
      await billingApi.createEnterpriseRequest(accessToken, payload, key.keyFor(payload));
      key.done();
      setForm({ ...empty, contactEmail: form.contactEmail, contactName: form.contactName });
      setSent(true);
      toast.notify({ tone: "success", title: "Đã gửi yêu cầu liên hệ", description: "Chưa phát sinh thanh toán hay dịch vụ. Đội kinh doanh sẽ liên hệ lại." });
      list.reload();
    } catch (cause) {
      if (cause instanceof ApiError && cause.fieldErrors.length) {
        setErrors({ requestedBuildingCount: cause.fieldMessage("requestedBuildingCount"), requestedDurationMonths: cause.fieldMessage("requestedDurationMonths"), contactName: cause.fieldMessage("contactName"), contactEmail: cause.fieldMessage("contactEmail"), contactPhone: cause.fieldMessage("contactPhone"), notes: cause.fieldMessage("notes") });
      }
      setFormError(billingErrorText(cause, "Không gửi được yêu cầu. Nội dung bạn nhập vẫn được giữ; bấm gửi lại để thử tiếp, yêu cầu sẽ không bị gửi trùng."));
    } finally {
      lock.current = false;
      setSaving(false);
    }
  };

  const items = list.data?.items ?? [];
  return <div className="ops-grid ops-grid-main" style={{ alignItems: "start" }}>
    <Panel title="Yêu cầu báo giá số lượng lớn" description="Dành cho nhiều hơn 100 công trình hoặc nhu cầu riêng. Đội kinh doanh liên hệ lại; chưa có thanh toán hay kích hoạt dịch vụ." bodyClassName="ops-stack">
      <form onSubmit={submit} noValidate className="ops-stack">
        <fieldset className="ops-fieldset"><legend>Nhu cầu</legend>
          <div className="ops-form-grid">
            <Field label="Số công trình dự kiến" required error={errors.requestedBuildingCount}>{(p) => <Input {...p} inputMode="numeric" value={form.requestedBuildingCount} onChange={(event) => setForm({ ...form, requestedBuildingCount: event.target.value })} />}</Field>
            <Field label="Thời hạn mong muốn (tháng)" hint="Có thể để trống." error={errors.requestedDurationMonths}>{(p) => <Input {...p} inputMode="numeric" value={form.requestedDurationMonths} onChange={(event) => setForm({ ...form, requestedDurationMonths: event.target.value })} />}</Field>
          </div>
        </fieldset>
        <fieldset className="ops-fieldset"><legend>Liên hệ</legend>
          <div className="ops-form-grid">
            <Field label="Người liên hệ" required error={errors.contactName}>{(p) => <Input {...p} maxLength={255} autoComplete="name" value={form.contactName} onChange={(event) => setForm({ ...form, contactName: event.target.value })} />}</Field>
            <Field label="Email liên hệ" required error={errors.contactEmail}>{(p) => <Input {...p} type="email" autoComplete="email" value={form.contactEmail} onChange={(event) => setForm({ ...form, contactEmail: event.target.value })} />}</Field>
            <Field label="Số điện thoại" error={errors.contactPhone}>{(p) => <Input {...p} type="tel" autoComplete="tel" maxLength={50} value={form.contactPhone} onChange={(event) => setForm({ ...form, contactPhone: event.target.value })} />}</Field>
            <Field label="Ghi chú" className="ops-span-all" error={errors.notes}>{(p) => <Textarea {...p} maxLength={10000} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />}</Field>
          </div>
        </fieldset>
        {formError && <Alert tone="danger" title="Chưa gửi được yêu cầu">{formError}</Alert>}
        {sent && !formError && <Alert tone="success" title="Đã gửi yêu cầu">Chúng tôi sẽ liên hệ qua email. Yêu cầu này không tạo thanh toán.</Alert>}
        <div className="ops-actions" style={{ justifyContent: "flex-end" }}><Button type="submit" disabled={saving}><Send size={16} aria-hidden="true" />{saving ? "Đang gửi…" : "Gửi yêu cầu"}</Button></div>
      </form>
    </Panel>

    <Panel title="Yêu cầu đã gửi" bodyClassName="ops-stack">
      {list.error !== undefined && <Alert tone="danger" title="Không tải được danh sách" action={<Button size="sm" variant="secondary" className="mt-3" onClick={list.reload}>Thử lại</Button>}>{billingErrorText(list.error)}</Alert>}
      <Table caption="Yêu cầu báo giá số lượng lớn đã gửi">
        <thead><tr><th>Yêu cầu</th><th>Trạng thái</th></tr></thead>
        <tbody>
          {list.loading && !list.data && <TableMessage colSpan={2}><SkeletonRows rows={3} label="Đang tải yêu cầu…" /></TableMessage>}
          {items.map((item) => <tr key={item.id}>
            <td><span className="ops-cell-primary">{item.requestedBuildingCount} công trình{item.requestedDurationMonths ? ` · ${item.requestedDurationMonths} tháng` : ""}<span className="ops-cell-sub">{item.contactName} · {formatDateTime(item.createdAt)}</span></span></td>
            <td><StatusBadge tone={item.status === "New" ? "info" : "neutral"}>{statusLabel[item.status] ?? item.status}</StatusBadge></td>
          </tr>)}
          {list.data && !items.length && <TableMessage colSpan={2}><EmptyState icon={Mail} title="Chưa có yêu cầu" description="Yêu cầu bạn gửi sẽ hiện ở đây cùng trạng thái xử lý." /></TableMessage>}
        </tbody>
      </Table>
      {(list.data?.totalCount ?? 0) > PAGE_SIZE && <Pagination page={page} pageSize={PAGE_SIZE} totalCount={list.data?.totalCount ?? 0} onPageChange={setPage} disabled={list.loading} />}
    </Panel>
  </div>;
}
