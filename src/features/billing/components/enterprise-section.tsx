"use client";

import { Mail, Plus, Send } from "lucide-react";
import { useId, useMemo, useRef, useState, type FormEvent } from "react";
import { ApiError } from "@/api";
import { useIdempotencyKey } from "@/api/idempotency";
import { useAsyncData } from "@/api/use-async-data";
import { useUrlParams } from "@/api/use-url-params";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CellTitle, DataTable, type DataColumn } from "@/components/ui/data-table";
import { Drawer, Modal } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Textarea } from "@/components/ui/field";
import { SkeletonDetail } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { billingApi } from "../api";
import { billingErrorText } from "../errors";
import { formatDateTime } from "../format";
import type { EnterpriseRequest, EnterpriseRequestInput } from "../types";
import { EnterpriseResponses, EnterpriseStatusBadge } from "./enterprise-common";
import "../billing.css";

const PAGE_SIZE = 10;

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

/** Contact form in a Modal: it creates a request for the sales team only, with one Idempotency-Key per payload. */
function EnterpriseRequestModal({ open, accessToken, defaultEmail, defaultName, onClose, onSent }: { open: boolean; accessToken: string; defaultEmail?: string; defaultName?: string; onClose: () => void; onSent: () => void }) {
  const toast = useToast();
  const formId = useId();
  const key = useIdempotencyKey();
  const lock = useRef(false);
  const [form, setForm] = useState<Form>({ ...empty, contactEmail: defaultEmail ?? "", contactName: defaultName ?? "" });
  const [errors, setErrors] = useState<ReturnType<typeof validate>>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

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
    try {
      await billingApi.createEnterpriseRequest(accessToken, payload, key.keyFor(payload));
      key.done();
      setForm({ ...empty, contactEmail: form.contactEmail, contactName: form.contactName });
      toast.notify({ tone: "success", title: "Đã gửi yêu cầu liên hệ", description: "Chưa phát sinh thanh toán hay dịch vụ. Đội kinh doanh sẽ liên hệ lại." });
      onSent();
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

  return <Modal open={open} onOpenChange={(next) => { if (!next && !saving) onClose(); }} size="lg" title="Yêu cầu báo giá số lượng lớn" description="Dành cho nhiều hơn 100 công trình hoặc nhu cầu riêng. Đội kinh doanh liên hệ lại; chưa có thanh toán hay kích hoạt dịch vụ."
    footer={<><Button type="button" variant="quiet" onClick={onClose} disabled={saving}>Hủy</Button><Button type="submit" form={formId} disabled={saving}><Send size={16} aria-hidden="true" />{saving ? "Đang gửi…" : "Gửi yêu cầu"}</Button></>}>
    <form id={formId} onSubmit={submit} noValidate className="ops-stack">
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
    </form>
  </Modal>;
}

const columns: DataColumn<EnterpriseRequest>[] = [
  { key: "request", header: "Yêu cầu", primary: true, render: (item) => <CellTitle title={`${item.requestedBuildingCount} công trình${item.requestedDurationMonths ? ` · ${item.requestedDurationMonths} tháng` : ""}`} sub={item.contactName} /> },
  { key: "created", header: "Gửi lúc", width: 170, hideBelow: 900, render: (item) => formatDateTime(item.createdAt) },
  { key: "status", header: "Trạng thái", width: 150, render: (item) => <EnterpriseStatusBadge status={item.status} /> },
];

/**
 * Bulk / enterprise purchases (Figma "Số lượng lớn"): the request form opens in a Modal, sent requests are a DataTable and a
 * row opens the `?request=` drawer with the sales replies. No quotation, payment or entitlement is created here.
 */
export function EnterpriseSection({ accessToken, defaultEmail, defaultName, onOpenQuotation }: { accessToken: string; defaultEmail?: string; defaultName?: string; onOpenQuotation?: (id: string) => void }) {
  const { page, get, setParams, setPage } = useUrlParams({ pageSize: PAGE_SIZE });
  const requestId = get("request");
  const [creating, setCreating] = useState(false);
  const [sent, setSent] = useState(false);

  const list = useAsyncData(`billing:enterprise:${page}`, (signal) => billingApi.listEnterpriseRequests(accessToken, page, PAGE_SIZE, "mine", signal));
  const detail = useAsyncData(`billing:enterprise:detail:${requestId}`, (signal) => billingApi.getEnterpriseRequest(accessToken, "mine", requestId, signal), Boolean(requestId), { keepPrevious: false });
  const request = useMemo(() => detail.data?.data ?? null, [detail.data]);

  const items = list.data?.items ?? [];
  return <div className="org-stack">
    <div className="bill-row">
      <p className="bill-muted">Dành cho nhiều hơn 100 công trình hoặc nhu cầu riêng. Đội kinh doanh liên hệ lại; chưa có thanh toán hay kích hoạt dịch vụ cho tới khi có báo giá bạn chấp nhận.</p>
      <Button onClick={() => { setSent(false); setCreating(true); }}><Plus size={16} aria-hidden="true" />Tạo yêu cầu</Button>
    </div>
    {sent && <Alert tone="success" title="Đã gửi yêu cầu">Chúng tôi sẽ liên hệ qua email. Yêu cầu này không tạo thanh toán.</Alert>}
    {list.error !== undefined && <Alert tone="danger" title="Không tải được danh sách" action={<Button size="sm" variant="secondary" className="mt-3" onClick={list.reload}>Thử lại</Button>}>{billingErrorText(list.error)}</Alert>}
    <DataTable
      caption="Yêu cầu báo giá số lượng lớn đã gửi"
      data-testid="enterprise-requests"
      columns={columns}
      rows={items}
      rowKey={(item) => item.id}
      loading={list.loading && !list.data}
      onRowClick={(item) => setParams({ request: item.id }, "replace")}
      empty={<EmptyState icon={Mail} title="Chưa có yêu cầu" description="Yêu cầu bạn gửi sẽ hiện ở đây cùng trạng thái xử lý." />}
      pagination={(list.data?.totalCount ?? 0) > PAGE_SIZE ? { page, pageSize: PAGE_SIZE, totalCount: list.data?.totalCount ?? 0, onPageChange: setPage } : undefined}
    />

    <EnterpriseRequestModal open={creating} accessToken={accessToken} defaultEmail={defaultEmail} defaultName={defaultName} onClose={() => setCreating(false)} onSent={() => { setCreating(false); setSent(true); list.reload(); }} />

    <Drawer open={Boolean(requestId)} onOpenChange={(open) => { if (!open) setParams({ request: null }, "replace"); }} size="md" title="Yêu cầu số lượng lớn" description="Trạng thái và phản hồi từ đội kinh doanh. Yêu cầu này chưa phát sinh thanh toán hay dịch vụ." eyebrow={request ? <EnterpriseStatusBadge status={request.status} /> : undefined} data-testid="enterprise-drawer">
      {requestId && detail.loading && !request && <SkeletonDetail rows={5} />}
      {requestId && detail.error !== undefined && !request && <Alert tone="danger" title="Không tải được yêu cầu" action={<Button size="sm" variant="secondary" className="mt-3" onClick={detail.reload}>Thử lại</Button>}>{billingErrorText(detail.error)}</Alert>}
      {request && <div className="ops-stack" data-testid="enterprise-detail">
        <div className="bill-row"><strong>{request.requestedBuildingCount} công trình{request.requestedDurationMonths ? ` · ${request.requestedDurationMonths} tháng` : ""}</strong><EnterpriseStatusBadge status={request.status} /></div>
        <p className="bill-muted bill-wrap">{request.contactName} · {request.contactEmail}{request.contactPhone ? ` · ${request.contactPhone}` : ""}<br />Gửi {formatDateTime(request.createdAt)}{request.closedAt ? ` · đóng ${formatDateTime(request.closedAt)}` : ""}</p>
        {request.notes && <p className="bill-wrap" style={{ margin: 0, whiteSpace: "pre-wrap" }}>{request.notes}</p>}
        {request.quotationId && <Alert tone="success" title="Đã có báo giá cho yêu cầu này" action={onOpenQuotation ? <Button size="sm" variant="secondary" className="mt-3" onClick={() => onOpenQuotation(request.quotationId as string)}>Mở báo giá</Button> : undefined}>Quản trị FET3D soạn báo giá nháp; bạn xem, chấp nhận và thanh toán sau khi báo giá được phát hành.</Alert>}
        {request.status === "Closed" && <Alert tone="info" title="Yêu cầu đã đóng">Báo giá và thanh toán đã tạo (nếu có) không bị hủy. Gửi yêu cầu mới nếu cần hỗ trợ thêm.</Alert>}
        <EnterpriseResponses accessToken={accessToken} scope="mine" requestId={request.id} />
      </div>}
    </Drawer>
  </div>;
}
