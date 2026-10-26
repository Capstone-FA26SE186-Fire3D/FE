"use client";

import { Pencil, Plus, RefreshCw, Tags } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { ApiError } from "@/api";
import { useAsyncData } from "@/api/use-async-data";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { CellTitle, DataTable, type DataColumn } from "@/components/ui/data-table";
import { Modal } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Textarea } from "@/components/ui/field";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";
import { billingApi } from "../api";
import { billingErrorText, isStatus } from "../errors";
import { formatDate, formatNumber, formatVnd, isoToLocalInput, localInputToIso, quotaUnitLabel } from "../format";
import type { DiscountInput, DiscountKind, DiscountRule, PackageInput, QuotaPolicy, ServicePackage } from "../types";
import { keepEdits } from "@/utils/keep-edits";
import "../billing.css";

type ErrorMap = Record<string, string | undefined>;

function mapErrors(cause: unknown, fields: string[]): ErrorMap {
  if (!(cause instanceof ApiError)) return {};
  return Object.fromEntries(fields.map((field) => [field, cause.fieldMessage(field)]));
}

type PackageForm = { code: string; name: string; unitPrice: string; durationMonths: string; learnerLimit: string; aiQuotaUnits: string; aiPolicyVersionId: string; isActive: boolean; description: string };
const emptyPackage: PackageForm = { code: "", name: "", unitPrice: "", durationMonths: "", learnerLimit: "", aiQuotaUnits: "0", aiPolicyVersionId: "", isActive: true, description: "" };

function packageToForm(item: ServicePackage): PackageForm {
  return { code: item.code, name: item.name, unitPrice: String(item.unitPrice), durationMonths: String(item.durationMonths), learnerLimit: item.learnerLimit != null ? String(item.learnerLimit) : "", aiQuotaUnits: item.aiQuotaUnits != null ? String(item.aiQuotaUnits) : "", aiPolicyVersionId: item.aiPolicyVersionId ?? "", isActive: item.isActive, description: item.description ?? "" };
}

const PACKAGE_FIELDS = ["code", "name", "unitPrice", "durationMonths", "learnerLimit", "aiQuotaUnits", "aiPolicyVersionId", "description"];
const DURATION_OPTIONS = [{ value: "6", label: "6 tháng" }, { value: "12", label: "12 tháng" }];

/** Policy options are read from the immutable policy list; the unit lives on the policy, not the package. */
function policyLabel(policy: QuotaPolicy) {
  return `${quotaUnitLabel(policy.quotaUnit)} · từ ${formatDate(policy.effectiveFrom)} đến ${policy.effectiveUntil ? formatDate(policy.effectiveUntil) : "không giới hạn"}`;
}

/**
 * Package catalog (Figma "Thương mại · Gói dịch vụ", Docs v7): monthly unitPrice per Building, a 6 or 12 month term,
 * learner capacity per period and prepaid AI quota bound to an immutable policy version. `isPurchasable` is the server
 * verdict; nothing is seeded. A row opens the edit modal; PATCH replaces every editable field with If-Match.
 */
export function PackagesSection({ accessToken }: { accessToken: string }) {
  const toast = useToast();
  const formId = useId();
  const list = useAsyncData("commerce:packages", (signal) => billingApi.listPackages(accessToken, signal));
  const policies = useAsyncData("commerce:policies:options", (signal) => billingApi.listQuotaPolicies(accessToken, 1, 100, signal));
  const [editing, setEditing] = useState<{ item: ServicePackage | null; etag: string | null } | null>(null);
  const [form, setForm] = useState<PackageForm>(emptyPackage);
  const [errors, setErrors] = useState<ErrorMap>({});
  const [formError, setFormError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [saving, setSaving] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);

  const policyItems = policies.data?.items ?? [];
  const policyById = (id: string | null | undefined) => policyItems.find((item) => item.id === id);
  const policyOptions = [
    ...policyItems.map((policy) => ({ value: policy.id, label: policyLabel(policy) })),
    ...(form.aiPolicyVersionId && !policyById(form.aiPolicyVersionId) ? [{ value: form.aiPolicyVersionId, label: "Chính sách không còn trong danh sách" }] : []),
  ];

  const openCreate = () => { setForm(emptyPackage); setErrors({}); setFormError(""); setConflict(false); setEditing({ item: null, etag: null }); };
  const openEdit = async (item: ServicePackage) => {
    if (opening) return;
    setOpening(item.id);
    try {
      const fresh = await billingApi.getPackage(accessToken, item.id);
      setForm(packageToForm(fresh.data)); setErrors({}); setFormError(""); setConflict(false);
      setEditing({ item: fresh.data, etag: fresh.etag });
    } catch (cause) {
      toast.notify({ tone: "danger", title: "Không mở được gói", description: billingErrorText(cause) });
    } finally { setOpening(null); }
  };

  const validate = () => {
    const found: ErrorMap = {};
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,49}$/.test(form.code.trim())) found.code = "Mã gói 1–50 ký tự: chữ, số, gạch dưới hoặc gạch ngang.";
    if (!form.name.trim() || form.name.trim().length > 255) found.name = "Nhập tên gói (tối đa 255 ký tự).";
    if (!/^\d+$/.test(form.unitPrice.trim())) found.unitPrice = "Đơn giá là số nguyên VND không âm.";
    if (form.durationMonths !== "6" && form.durationMonths !== "12") found.durationMonths = "Gói chỉ có thời hạn 6 hoặc 12 tháng.";
    if (!/^\d+$/.test(form.learnerLimit.trim()) || Number(form.learnerLimit) < 1) found.learnerLimit = "Số học viên mỗi kỳ là số nguyên lớn hơn 0.";
    if (!/^\d+$/.test(form.aiQuotaUnits.trim())) found.aiQuotaUnits = "Hạn mức AI là số nguyên không âm (nhập 0 nếu gói không kèm hạn mức AI).";
    else if (Number(form.aiQuotaUnits) > 0 && !form.aiPolicyVersionId) found.aiPolicyVersionId = "Gói có hạn mức AI phải chọn phiên bản chính sách hạn mức.";
    if (form.description.length > 10000) found.description = "Mô tả tối đa 10.000 ký tự.";
    return found;
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving || !editing) return;
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length) return;
    const quota = Number(form.aiQuotaUnits);
    const input: PackageInput = {
      code: form.code.trim(), name: form.name.trim(), unitPrice: Number(form.unitPrice), durationMonths: Number(form.durationMonths), isActive: form.isActive, description: form.description.trim() || null,
      learnerLimit: Number(form.learnerLimit), aiQuotaUnits: quota, aiPolicyVersionId: quota > 0 ? form.aiPolicyVersionId : null,
    };
    setSaving(true); setFormError(""); setConflict(false);
    try {
      if (editing.item) await billingApi.updatePackage(accessToken, editing.item.id, input, editing.etag ?? "");
      else await billingApi.createPackage(accessToken, input);
      toast.notify({ tone: "success", title: editing.item ? "Đã lưu gói" : "Đã tạo gói", description: `${input.code} · ${formatVnd(input.unitPrice)}/tháng/công trình. Báo giá đã phát hành vẫn giữ giá cũ.` });
      setEditing(null);
      list.reload();
    } catch (cause) {
      setErrors(mapErrors(cause, PACKAGE_FIELDS));
      if (isStatus(cause, 412)) setConflict(true);
      setFormError(billingErrorText(cause));
    } finally { setSaving(false); }
  };

  const reloadLatest = async () => {
    if (!editing?.item) return;
    try {
      const fresh = await billingApi.getPackage(accessToken, editing.item.id);
      // PATCH replaces every field: only what I typed stays mine, the rest must follow the newer version or it would be overwritten.
      const base = packageToForm(editing.item);
      setForm((current) => keepEdits(current, base, packageToForm(fresh.data)));
      setEditing({ item: fresh.data, etag: fresh.etag });
      setConflict(false); setFormError("");
      toast.notify({ tone: "info", title: "Đã tải bản mới", description: "Các trường bạn đã sửa vẫn giữ nguyên; các trường còn lại đã cập nhật theo bản mới. Kiểm tra rồi lưu lại." });
      list.reload();
    } catch (cause) { setFormError(billingErrorText(cause)); }
  };

  const items = list.data ?? [];
  const noPolicies = policies.data !== undefined && policyItems.length === 0;
  const noneSellable = list.data !== undefined && items.length > 0 && items.every((item) => item.isPurchasable === false);

  const columns: DataColumn<ServicePackage>[] = [
    { key: "package", header: "Gói", primary: true, render: (item) => <CellTitle title={item.name} sub={`${item.code}${item.commercialVersion === 1 ? " · gói cũ" : ""}`} /> },
    { key: "price", header: "Đơn giá/tháng", width: 150, align: "right", render: (item) => formatVnd(item.unitPrice) },
    { key: "duration", header: "Thời hạn", width: 110, render: (item) => `${item.durationMonths} tháng` },
    { key: "learners", header: "Học viên/kỳ", width: 120, align: "right", hideBelow: 900, render: (item) => formatNumber(item.learnerLimit ?? null) },
    { key: "quota", header: "Hạn mức AI", width: 200, hideBelow: 1100, render: (item) => <CellTitle title={item.aiQuotaUnits != null ? formatNumber(item.aiQuotaUnits) : "—"} sub={item.aiPolicyVersionId ? (policyById(item.aiPolicyVersionId) ? `${quotaUnitLabel(policyById(item.aiPolicyVersionId)!.quotaUnit)} · từ ${formatDate(policyById(item.aiPolicyVersionId)!.effectiveFrom)}` : "Chính sách không còn trong danh sách") : undefined} /> },
    { key: "sale", header: "Bán hàng", width: 260, render: (item) => <span className="bill-states"><StatusBadge tone={item.isActive ? "success" : "neutral"}>{item.isActive ? "Đang bán" : "Tạm ẩn"}</StatusBadge><StatusBadge tone={item.isPurchasable ? "success" : "warning"}>{item.isPurchasable ? "Đủ điều kiện bán" : "Không bán được"}</StatusBadge></span> },
  ];

  return <div className="ops-stack">
    {noPolicies && <Alert tone="info" title="Chưa có chính sách hạn mức">Gói có hạn mức AI cần một phiên bản chính sách hạn mức. Tạo ở tab “Chính sách hạn mức” trước; gói không kèm hạn mức AI (0) không cần chính sách.</Alert>}
    {noneSellable && <Alert tone="warning" title="Chưa có gói nào đủ điều kiện bán">Tổ chức chỉ mua được gói mới đã cấu hình đủ (6/12 tháng, số học viên, hạn mức AI và chính sách). Gói cũ hiển thị “Không bán”. Sửa gói hoặc tạo gói mới.</Alert>}
    <DataTable<ServicePackage>
      caption="Danh sách gói dịch vụ"
      data-testid="admin-packages-table"
      columns={columns}
      rows={items}
      rowKey={(item) => item.id}
      loading={list.loading && !list.data}
      onRowClick={(item) => void openEdit(item)}
      rowTone={(item) => (item.isPurchasable === false ? "muted" : undefined)}
      rowMenu={(item) => [{ label: "Sửa gói", icon: Pencil, onSelect: () => void openEdit(item), disabled: opening !== null }]}
      error={list.error !== undefined ? <Alert tone="danger" title="Không tải được gói" action={<Button size="sm" variant="secondary" className="mt-3" onClick={list.reload}>Thử lại</Button>}>{billingErrorText(list.error)}</Alert> : undefined}
      toolbar={<>
        <p className="bill-muted ops-toolbar-grow" style={{ margin: 0 }}>Đơn giá tính theo tháng cho mỗi công trình; giá một dòng = đơn giá × thời hạn (6 hoặc 12 tháng). Báo giá giữ nguyên giá lúc phát hành. Không có giá, số học viên hay hạn mức mặc định.</p>
        <Button variant="quiet" onClick={list.reload} disabled={list.loading} aria-label="Tải lại danh sách"><RefreshCw size={16} aria-hidden="true" />Tải lại</Button>
        <Button onClick={openCreate}><Plus size={16} aria-hidden="true" />Tạo gói</Button>
      </>}
      empty={<EmptyState icon={Tags} title="Chưa có gói dịch vụ" description="Tạo gói 6 hoặc 12 tháng đầu tiên (đơn giá/tháng, số học viên, hạn mức AI). Hệ thống không có giá hay hạn mức mặc định." />}
    />
    <p className="bill-hint">Bấm hàng để sửa gói; “Đang bán” là trạng thái bạn đặt, “Đủ điều kiện bán” do hệ thống kiểm tra.</p>

    <Modal open={editing !== null} onOpenChange={(open) => { if (!open && !saving) setEditing(null); }} size="lg" title={editing?.item ? "Sửa gói dịch vụ" : "Tạo gói dịch vụ"} description="Lưu sẽ thay toàn bộ các trường của gói; báo giá đã phát hành không đổi."
      footer={<><Button type="button" variant="quiet" onClick={() => setEditing(null)} disabled={saving}>Hủy</Button><Button type="submit" form={formId} disabled={saving}>{saving ? "Đang lưu…" : "Lưu gói"}</Button></>}>
      <form id={formId} onSubmit={submit} noValidate className="ops-stack">
        <div className="ops-form-grid">
          <Field label="Mã gói" required error={errors.code} hint="Tự viết hoa khi lưu.">{(p) => <Input {...p} maxLength={50} value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} />}</Field>
          <Field label="Tên gói" required error={errors.name}>{(p) => <Input {...p} maxLength={255} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />}</Field>
          <Field label="Đơn giá/tháng (VND)" required error={errors.unitPrice}>{(p) => <Input {...p} inputMode="numeric" value={form.unitPrice} onChange={(event) => setForm({ ...form, unitPrice: event.target.value })} />}</Field>
          <Field label="Thời hạn (tháng)" required error={errors.durationMonths} hint="6 hoặc 12.">{(p) => <Combobox {...p} aria-label="Thời hạn (tháng)" value={form.durationMonths} onChange={(value) => setForm({ ...form, durationMonths: value })} options={DURATION_OPTIONS} placeholder="Chọn thời hạn" groupLabel="Thời hạn" />}</Field>
          <Field label="Học viên mỗi kỳ" required error={errors.learnerLimit} hint="Số học viên khác nhau được bắt đầu học trực tuyến ở mỗi công trình trong một kỳ.">{(p) => <Input {...p} inputMode="numeric" value={form.learnerLimit} onChange={(event) => setForm({ ...form, learnerLimit: event.target.value })} />}</Field>
          <Field label="Hạn mức AI kèm gói" required error={errors.aiQuotaUnits} hint="0 nếu không kèm hạn mức AI. Đơn vị theo chính sách.">{(p) => <Input {...p} inputMode="numeric" value={form.aiQuotaUnits} onChange={(event) => setForm({ ...form, aiQuotaUnits: event.target.value })} />}</Field>
          <Field label="Phiên bản chính sách hạn mức" className="ops-span-all" required={Number(form.aiQuotaUnits) > 0} error={errors.aiPolicyVersionId} hint="Bắt buộc khi gói có hạn mức AI; chính sách phải phủ cả kỳ dịch vụ khi phát hành.">
            {(p) => <Combobox {...p} aria-label="Phiên bản chính sách hạn mức" value={form.aiPolicyVersionId} onChange={(value) => setForm({ ...form, aiPolicyVersionId: value })} options={policyOptions} placeholder="Không dùng chính sách" searchPlaceholder="Tìm theo đơn vị hoặc mã" groupLabel="Phiên bản" clearable disabled={Number(form.aiQuotaUnits) <= 0 && !form.aiPolicyVersionId} loading={policies.loading && !policies.data} />}
          </Field>
          <Field label="Mô tả" className="ops-span-all" error={errors.description}>{(p) => <Textarea {...p} rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />}</Field>
        </div>
        <label className="bill-check"><input type="checkbox" className="ops-check" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} /><span>Đang bán (tổ chức thấy và chọn được khi gói đủ điều kiện)</span></label>
        {formError && <Alert tone="danger" title="Chưa lưu được" action={conflict ? <Button size="sm" variant="secondary" className="mt-3" type="button" onClick={() => void reloadLatest()}>Tải bản mới để đối chiếu</Button> : undefined}>{formError}</Alert>}
      </form>
    </Modal>
  </div>;
}

type DiscountForm = { code: string; discountKind: DiscountKind; discountValue: string; minimumBuildings: string; validFrom: string; validUntil: string; servicePackageId: string; minimumDurationMonths: string; isActive: boolean };
const emptyDiscount: DiscountForm = { code: "", discountKind: "Percent", discountValue: "", minimumBuildings: "1", validFrom: "", validUntil: "", servicePackageId: "", minimumDurationMonths: "", isActive: true };
const KIND_OPTIONS = [{ value: "Percent", label: "Phần trăm" }, { value: "Fixed", label: "Số tiền cố định (VND)" }];

function discountToForm(item: DiscountRule): DiscountForm {
  return { code: item.code, discountKind: item.discountKind, discountValue: String(item.discountValue), minimumBuildings: String(item.minimumBuildings), validFrom: isoToLocalInput(item.validFrom), validUntil: isoToLocalInput(item.validUntil), servicePackageId: item.servicePackageId ?? "", minimumDurationMonths: item.minimumDurationMonths ? String(item.minimumDurationMonths) : "", isActive: item.isActive };
}

/** Discount rules (Figma "Thương mại · Giảm giá"). The BE picks the single best eligible rule per quotation; the UI only edits the rule. */
export function DiscountsSection({ accessToken }: { accessToken: string }) {
  const toast = useToast();
  const formId = useId();
  const list = useAsyncData("commerce:discounts", (signal) => billingApi.listDiscounts(accessToken, signal));
  const packages = useAsyncData("commerce:packages", (signal) => billingApi.listPackages(accessToken, signal));
  const [editing, setEditing] = useState<{ item: DiscountRule | null; etag: string | null } | null>(null);
  const [form, setForm] = useState<DiscountForm>(emptyDiscount);
  const [errors, setErrors] = useState<ErrorMap>({});
  const [formError, setFormError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [saving, setSaving] = useState(false);
  const packageName = (id: string | null) => (id ? packages.data?.find((item) => item.id === id)?.name ?? "Gói không còn tồn tại" : "Mọi gói");

  const openCreate = () => { setForm(emptyDiscount); setErrors({}); setFormError(""); setConflict(false); setEditing({ item: null, etag: null }); };
  const openEdit = async (item: DiscountRule) => {
    try {
      const fresh = await billingApi.getDiscount(accessToken, item.id);
      setForm(discountToForm(fresh.data)); setErrors({}); setFormError(""); setConflict(false);
      setEditing({ item: fresh.data, etag: fresh.etag });
    } catch (cause) { toast.notify({ tone: "danger", title: "Không mở được quy tắc", description: billingErrorText(cause) }); }
  };

  const validate = () => {
    const found: ErrorMap = {};
    const value = Number(form.discountValue);
    if (!form.code.trim() || form.code.trim().length > 80) found.code = "Nhập mã giảm giá (tối đa 80 ký tự).";
    if (form.discountValue.trim() === "" || !Number.isFinite(value) || value < 0) found.discountValue = "Nhập giá trị không âm.";
    else if (form.discountKind === "Percent" && (value > 100 || Math.round(value * 100) !== value * 100)) found.discountValue = "Phần trăm từ 0 đến 100, tối đa hai số lẻ.";
    else if (form.discountKind === "Fixed" && !Number.isInteger(value)) found.discountValue = "Số tiền giảm là số nguyên VND.";
    if (!/^\d+$/.test(form.minimumBuildings) || Number(form.minimumBuildings) < 1) found.minimumBuildings = "Số công trình tối thiểu là số nguyên lớn hơn 0.";
    if (form.minimumDurationMonths && (!/^\d+$/.test(form.minimumDurationMonths) || Number(form.minimumDurationMonths) < 1)) found.minimumDurationMonths = "Số tháng tối thiểu lớn hơn 0, hoặc để trống.";
    if (!localInputToIso(form.validFrom)) found.validFrom = "Chọn thời điểm bắt đầu hiệu lực.";
    if (form.validUntil && (!localInputToIso(form.validUntil) || new Date(form.validUntil) <= new Date(form.validFrom))) found.validUntil = "Thời điểm hết hiệu lực phải sau thời điểm bắt đầu.";
    return found;
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving || !editing) return;
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length) return;
    const input: DiscountInput = {
      code: form.code.trim(), discountKind: form.discountKind, discountValue: Number(form.discountValue), minimumBuildings: Number(form.minimumBuildings),
      validFrom: localInputToIso(form.validFrom) as string, validUntil: localInputToIso(form.validUntil), servicePackageId: form.servicePackageId || null,
      minimumDurationMonths: form.minimumDurationMonths ? Number(form.minimumDurationMonths) : null, isActive: form.isActive,
    };
    setSaving(true); setFormError(""); setConflict(false);
    try {
      if (editing.item) await billingApi.updateDiscount(accessToken, editing.item.id, input, editing.etag ?? "");
      else await billingApi.createDiscount(accessToken, input);
      toast.notify({ tone: "success", title: editing.item ? "Đã lưu quy tắc giảm giá" : "Đã tạo quy tắc giảm giá", description: "Báo giá đã phát hành vẫn giữ mức giảm cũ." });
      setEditing(null);
      list.reload();
    } catch (cause) {
      setErrors(mapErrors(cause, ["code", "discountKind", "discountValue", "minimumBuildings", "minimumDurationMonths", "validFrom", "validUntil"]));
      if (isStatus(cause, 412)) setConflict(true);
      setFormError(billingErrorText(cause));
    } finally { setSaving(false); }
  };

  const reloadLatest = async () => {
    if (!editing?.item) return;
    try {
      const fresh = await billingApi.getDiscount(accessToken, editing.item.id);
      const base = discountToForm(editing.item);
      setForm((current) => keepEdits(current, base, discountToForm(fresh.data)));
      setEditing({ item: fresh.data, etag: fresh.etag });
      setConflict(false); setFormError("");
      toast.notify({ tone: "info", title: "Đã tải bản mới", description: "Các trường bạn đã sửa vẫn giữ nguyên; các trường còn lại đã cập nhật theo bản mới. Kiểm tra lại rồi lưu." });
      list.reload();
    } catch (cause) { setFormError(billingErrorText(cause)); }
  };

  const items = list.data ?? [];
  const columns: DataColumn<DiscountRule>[] = [
    { key: "rule", header: "Quy tắc", primary: true, render: (item) => <CellTitle title={item.code} sub={packageName(item.servicePackageId)} /> },
    { key: "value", header: "Mức giảm", width: 130, align: "right", render: (item) => (item.discountKind === "Percent" ? `${item.discountValue}%` : formatVnd(item.discountValue)) },
    { key: "condition", header: "Điều kiện", width: 220, hideBelow: 900, render: (item) => `Từ ${item.minimumBuildings} công trình${item.minimumDurationMonths ? ` · từ ${item.minimumDurationMonths} tháng` : ""}` },
    { key: "validity", header: "Hiệu lực", width: 220, hideBelow: 1100, render: (item) => <CellTitle title={formatDate(item.validFrom)} sub={`đến ${item.validUntil ? formatDate(item.validUntil) : "không giới hạn"}`} /> },
    { key: "state", header: "Trạng thái", width: 120, render: (item) => <StatusBadge tone={item.isActive ? "success" : "neutral"}>{item.isActive ? "Đang bật" : "Tắt"}</StatusBadge> },
  ];

  return <div className="ops-stack">
    <DataTable<DiscountRule>
      caption="Quy tắc giảm giá"
      data-testid="admin-discounts-table"
      columns={columns}
      rows={items}
      rowKey={(item) => item.id}
      loading={list.loading && !list.data}
      onRowClick={(item) => void openEdit(item)}
      rowTone={(item) => (item.isActive ? undefined : "muted")}
      rowMenu={(item) => [{ label: "Sửa quy tắc", icon: Pencil, onSelect: () => void openEdit(item) }]}
      error={list.error !== undefined ? <Alert tone="danger" title="Không tải được quy tắc giảm giá" action={<Button size="sm" variant="secondary" className="mt-3" onClick={list.reload}>Thử lại</Button>}>{billingErrorText(list.error)}</Alert> : undefined}
      toolbar={<>
        <p className="bill-muted ops-toolbar-grow" style={{ margin: 0 }}>Mỗi báo giá áp dụng một quy tắc có mức giảm lớn nhất, không cộng dồn. Mức giảm theo phần trăm được làm tròn đến đồng.</p>
        <Button variant="quiet" onClick={list.reload} disabled={list.loading} aria-label="Tải lại danh sách"><RefreshCw size={16} aria-hidden="true" />Tải lại</Button>
        <Button onClick={openCreate}><Plus size={16} aria-hidden="true" />Tạo quy tắc</Button>
      </>}
      empty={<EmptyState icon={Tags} title="Chưa có quy tắc giảm giá" description="Thêm quy tắc cho nhiều công trình hoặc thời hạn dài." />}
    />

    <Modal open={editing !== null} onOpenChange={(open) => { if (!open && !saving) setEditing(null); }} size="lg" title={editing?.item ? "Sửa quy tắc giảm giá" : "Tạo quy tắc giảm giá"} description="Lưu sẽ thay toàn bộ trường của quy tắc; báo giá đã phát hành không đổi."
      footer={<><Button type="button" variant="quiet" onClick={() => setEditing(null)} disabled={saving}>Hủy</Button><Button type="submit" form={formId} disabled={saving}>{saving ? "Đang lưu…" : "Lưu quy tắc"}</Button></>}>
      <form id={formId} onSubmit={submit} noValidate className="ops-stack">
        <fieldset className="ops-fieldset"><legend>Mức giảm</legend>
          <Field label="Mã quy tắc" required error={errors.code}>{(p) => <Input {...p} maxLength={80} value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} />}</Field>
          <div className="ops-form-grid">
            <Field label="Loại giảm" error={errors.discountKind}>{(p) => <Combobox {...p} aria-label="Loại giảm" value={form.discountKind} onChange={(value) => setForm({ ...form, discountKind: value as DiscountKind })} options={KIND_OPTIONS} groupLabel="Loại" />}</Field>
            <Field label={form.discountKind === "Percent" ? "Giá trị (%)" : "Giá trị (VND)"} required error={errors.discountValue}>{(p) => <Input {...p} inputMode="decimal" value={form.discountValue} onChange={(event) => setForm({ ...form, discountValue: event.target.value })} />}</Field>
          </div>
        </fieldset>
        <fieldset className="ops-fieldset"><legend>Điều kiện áp dụng</legend>
          <div className="ops-form-grid">
            <Field label="Số công trình tối thiểu" required error={errors.minimumBuildings}>{(p) => <Input {...p} inputMode="numeric" value={form.minimumBuildings} onChange={(event) => setForm({ ...form, minimumBuildings: event.target.value })} />}</Field>
            <Field label="Số tháng tối thiểu" hint="Để trống nếu không giới hạn." error={errors.minimumDurationMonths}>{(p) => <Input {...p} inputMode="numeric" value={form.minimumDurationMonths} onChange={(event) => setForm({ ...form, minimumDurationMonths: event.target.value })} />}</Field>
          </div>
          <Field label="Chỉ áp dụng cho gói">{(p) => <Combobox {...p} aria-label="Chỉ áp dụng cho gói" value={form.servicePackageId} onChange={(value) => setForm({ ...form, servicePackageId: value })} options={(packages.data ?? []).map((item) => ({ value: item.id, label: `${item.name} (${item.code})` }))} placeholder="Mọi gói" searchPlaceholder="Tìm gói" groupLabel="Gói" clearable loading={packages.loading && !packages.data} />}</Field>
        </fieldset>
        <fieldset className="ops-fieldset"><legend>Hiệu lực</legend>
          <div className="ops-form-grid">
            <Field label="Bắt đầu" required error={errors.validFrom} hint="Theo giờ địa phương.">{(p) => <Input {...p} type="datetime-local" value={form.validFrom} onChange={(event) => setForm({ ...form, validFrom: event.target.value })} />}</Field>
            <Field label="Kết thúc" error={errors.validUntil} hint="Để trống nếu không giới hạn.">{(p) => <Input {...p} type="datetime-local" value={form.validUntil} onChange={(event) => setForm({ ...form, validUntil: event.target.value })} />}</Field>
          </div>
          <label className="bill-check"><input type="checkbox" className="ops-check" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} /><span>Đang bật</span></label>
        </fieldset>
        {formError && <Alert tone="danger" title="Chưa lưu được" action={conflict ? <Button size="sm" variant="secondary" className="mt-3" type="button" onClick={() => void reloadLatest()}>Tải bản mới để đối chiếu</Button> : undefined}>{formError}</Alert>}
      </form>
    </Modal>
  </div>;
}
