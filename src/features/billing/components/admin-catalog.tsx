"use client";

import { Pencil, Plus, RefreshCw, Tags } from "lucide-react";
import { useState, type FormEvent } from "react";
import { ApiError } from "@/api";
import { useAsyncData } from "@/api/use-async-data";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { SkeletonRows } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableMessage } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { billingApi } from "../api";
import { billingErrorText, isStatus } from "../errors";
import { formatDate, formatVnd, isoToLocalInput, localInputToIso } from "../format";
import type { DiscountInput, DiscountKind, DiscountRule, PackageInput, ServicePackage } from "../types";
import "../billing.css";

type ErrorMap = Record<string, string | undefined>;

function mapErrors(cause: unknown, fields: string[]): ErrorMap {
  if (!(cause instanceof ApiError)) return {};
  return Object.fromEntries(fields.map((field) => [field, cause.fieldMessage(field)]));
}

type PackageForm = { code: string; name: string; unitPrice: string; durationMonths: string; isActive: boolean; description: string };
const emptyPackage: PackageForm = { code: "", name: "", unitPrice: "", durationMonths: "", isActive: true, description: "" };

function packageToForm(item: ServicePackage): PackageForm {
  return { code: item.code, name: item.name, unitPrice: String(item.unitPrice), durationMonths: String(item.durationMonths), isActive: item.isActive, description: item.description ?? "" };
}

/** Package catalog: unitPrice is whole VND per Building per month; PATCH replaces every editable field with If-Match. */
export function PackagesSection({ accessToken }: { accessToken: string }) {
  const toast = useToast();
  const list = useAsyncData("commerce:packages", (signal) => billingApi.listPackages(accessToken, signal));
  const [editing, setEditing] = useState<{ item: ServicePackage | null; etag: string | null } | null>(null);
  const [form, setForm] = useState<PackageForm>(emptyPackage);
  const [errors, setErrors] = useState<ErrorMap>({});
  const [formError, setFormError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [saving, setSaving] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);

  const openCreate = () => { setForm(emptyPackage); setErrors({}); setFormError(""); setConflict(false); setEditing({ item: null, etag: null }); };
  const openEdit = async (item: ServicePackage) => {
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
    if (!/^\d+$/.test(form.durationMonths.trim()) || Number(form.durationMonths) < 1) found.durationMonths = "Thời hạn là số tháng nguyên lớn hơn 0 (Docs v7: 6 hoặc 12).";
    if (form.description.length > 10000) found.description = "Mô tả tối đa 10.000 ký tự.";
    return found;
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving || !editing) return;
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length) return;
    const input: PackageInput = { code: form.code.trim(), name: form.name.trim(), unitPrice: Number(form.unitPrice), durationMonths: Number(form.durationMonths), isActive: form.isActive, description: form.description.trim() || null };
    setSaving(true); setFormError(""); setConflict(false);
    try {
      if (editing.item) await billingApi.updatePackage(accessToken, editing.item.id, input, editing.etag ?? "");
      else await billingApi.createPackage(accessToken, input);
      toast.notify({ tone: "success", title: editing.item ? "Đã lưu gói" : "Đã tạo gói", description: `${input.code} · ${formatVnd(input.unitPrice)}/tháng/công trình. Báo giá đã phát hành giữ nguyên bản chụp cũ.` });
      setEditing(null);
      list.reload();
    } catch (cause) {
      setErrors(mapErrors(cause, ["code", "name", "unitPrice", "durationMonths", "description"]));
      if (isStatus(cause, 412)) setConflict(true);
      setFormError(billingErrorText(cause));
    } finally { setSaving(false); }
  };

  const reloadLatest = async () => {
    if (!editing?.item) return;
    try {
      const fresh = await billingApi.getPackage(accessToken, editing.item.id);
      setEditing({ item: fresh.data, etag: fresh.etag });
      setConflict(false); setFormError("");
      toast.notify({ tone: "info", title: "Đã tải bản mới", description: "Nội dung bạn nhập vẫn giữ nguyên; đối chiếu với bản mới trong danh sách rồi lưu lại." });
      list.reload();
    } catch (cause) { setFormError(billingErrorText(cause)); }
  };

  const items = list.data ?? [];
  return <div className="ops-stack">
    <div className="bill-row"><p className="bill-muted">Đơn giá tính theo tháng cho mỗi công trình. Giá một dòng = đơn giá × thời hạn; báo giá chốt bản chụp khi phát hành.</p><div className="ops-actions"><Button variant="quiet" onClick={list.reload} disabled={list.loading}><RefreshCw size={16} aria-hidden="true" />Tải lại</Button><Button onClick={openCreate}><Plus size={16} aria-hidden="true" />Tạo gói</Button></div></div>
    {list.error !== undefined && <Alert tone="danger" title="Không tải được gói" action={<Button size="sm" variant="secondary" className="mt-3" onClick={list.reload}>Thử lại</Button>}>{billingErrorText(list.error)}</Alert>}
    <Table caption="Danh sách gói dịch vụ">
      <thead><tr><th>Gói</th><th className="bill-money">Đơn giá/tháng</th><th>Thời hạn</th><th>Trạng thái</th><th aria-label="Thao tác" /></tr></thead>
      <tbody>
        {list.loading && !list.data && <TableMessage colSpan={5}><SkeletonRows rows={4} label="Đang tải gói…" /></TableMessage>}
        {items.map((item) => <tr key={item.id}>
          <td><span className="ops-cell-primary bill-wrap">{item.name}<span className="ops-cell-sub">{item.code}</span></span></td>
          <td className="bill-money">{formatVnd(item.unitPrice)}</td>
          <td>{item.durationMonths} tháng</td>
          <td><StatusBadge tone={item.isActive ? "success" : "neutral"}>{item.isActive ? "Đang bán" : "Tạm ẩn"}</StatusBadge></td>
          <td className="ops-cell-actions"><Button size="sm" variant="quiet" onClick={() => void openEdit(item)} disabled={opening === item.id} aria-label={`Sửa gói ${item.code}`}><Pencil size={14} aria-hidden="true" />Sửa</Button></td>
        </tr>)}
        {list.data && !items.length && <TableMessage colSpan={5}><EmptyState icon={Tags} title="Chưa có gói dịch vụ" description="Tạo gói đầu tiên để tổ chức có thể báo giá." action={<Button onClick={openCreate}>Tạo gói</Button>} /></TableMessage>}
      </tbody>
    </Table>

    <Drawer open={editing !== null} onOpenChange={(open) => { if (!open && !saving) setEditing(null); }} title={editing?.item ? "Sửa gói dịch vụ" : "Tạo gói dịch vụ"} description="Lưu sẽ thay toàn bộ các trường của gói; báo giá đã phát hành không đổi.">
      <form onSubmit={submit} noValidate className="ops-stack">
        <Field label="Mã gói" required error={errors.code} hint="Tự viết hoa khi lưu.">{(p) => <Input {...p} maxLength={50} value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} />}</Field>
        <Field label="Tên gói" required error={errors.name}>{(p) => <Input {...p} maxLength={255} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />}</Field>
        <div className="ops-form-grid">
          <Field label="Đơn giá/tháng (VND)" required error={errors.unitPrice}>{(p) => <Input {...p} inputMode="numeric" value={form.unitPrice} onChange={(event) => setForm({ ...form, unitPrice: event.target.value })} />}</Field>
          <Field label="Thời hạn (tháng)" required error={errors.durationMonths}>{(p) => <Input {...p} inputMode="numeric" value={form.durationMonths} onChange={(event) => setForm({ ...form, durationMonths: event.target.value })} />}</Field>
        </div>
        <Field label="Mô tả" error={errors.description}>{(p) => <Textarea {...p} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />}</Field>
        <label className="bill-check"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} /><span>Đang bán (tổ chức thấy và chọn được)</span></label>
        {formError && <Alert tone="danger" title="Chưa lưu được" action={conflict ? <Button size="sm" variant="secondary" className="mt-3" type="button" onClick={() => void reloadLatest()}>Tải bản mới để đối chiếu</Button> : undefined}>{formError}</Alert>}
        <div className="ops-actions" style={{ justifyContent: "flex-end" }}><Button type="button" variant="quiet" onClick={() => setEditing(null)} disabled={saving}>Hủy</Button><Button type="submit" disabled={saving}>{saving ? "Đang lưu…" : "Lưu gói"}</Button></div>
      </form>
    </Drawer>
  </div>;
}

type DiscountForm = { code: string; discountKind: DiscountKind; discountValue: string; minimumBuildings: string; validFrom: string; validUntil: string; servicePackageId: string; minimumDurationMonths: string; isActive: boolean };
const emptyDiscount: DiscountForm = { code: "", discountKind: "Percent", discountValue: "", minimumBuildings: "1", validFrom: "", validUntil: "", servicePackageId: "", minimumDurationMonths: "", isActive: true };

function discountToForm(item: DiscountRule): DiscountForm {
  return { code: item.code, discountKind: item.discountKind, discountValue: String(item.discountValue), minimumBuildings: String(item.minimumBuildings), validFrom: isoToLocalInput(item.validFrom), validUntil: isoToLocalInput(item.validUntil), servicePackageId: item.servicePackageId ?? "", minimumDurationMonths: item.minimumDurationMonths ? String(item.minimumDurationMonths) : "", isActive: item.isActive };
}

/** Discount rules. The BE picks the single best eligible rule per quotation; the UI only edits the rule. */
export function DiscountsSection({ accessToken }: { accessToken: string }) {
  const toast = useToast();
  const list = useAsyncData("commerce:discounts", (signal) => billingApi.listDiscounts(accessToken, signal));
  const packages = useAsyncData("commerce:packages", (signal) => billingApi.listPackages(accessToken, signal));
  const [editing, setEditing] = useState<{ item: DiscountRule | null; etag: string | null } | null>(null);
  const [form, setForm] = useState<DiscountForm>(emptyDiscount);
  const [errors, setErrors] = useState<ErrorMap>({});
  const [formError, setFormError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [saving, setSaving] = useState(false);
  const packageName = (id: string | null) => (id ? packages.data?.find((item) => item.id === id)?.name ?? id.slice(0, 8) : "Mọi gói");

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
      toast.notify({ tone: "success", title: editing.item ? "Đã lưu quy tắc giảm giá" : "Đã tạo quy tắc giảm giá", description: "Báo giá đã phát hành giữ nguyên bản chụp." });
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
      setEditing({ item: fresh.data, etag: fresh.etag });
      setConflict(false); setFormError("");
      toast.notify({ tone: "info", title: "Đã tải bản mới", description: "Nội dung bạn nhập vẫn giữ nguyên; kiểm tra lại rồi lưu." });
      list.reload();
    } catch (cause) { setFormError(billingErrorText(cause)); }
  };

  const items = list.data ?? [];
  return <div className="ops-stack">
    <div className="bill-row"><p className="bill-muted">Mỗi báo giá áp dụng một quy tắc có mức giảm lớn nhất, không cộng dồn. Phần trăm làm tròn VND ở máy chủ.</p><div className="ops-actions"><Button variant="quiet" onClick={list.reload} disabled={list.loading}><RefreshCw size={16} aria-hidden="true" />Tải lại</Button><Button onClick={openCreate}><Plus size={16} aria-hidden="true" />Tạo quy tắc</Button></div></div>
    {list.error !== undefined && <Alert tone="danger" title="Không tải được quy tắc giảm giá" action={<Button size="sm" variant="secondary" className="mt-3" onClick={list.reload}>Thử lại</Button>}>{billingErrorText(list.error)}</Alert>}
    <Table caption="Quy tắc giảm giá">
      <thead><tr><th>Quy tắc</th><th>Mức giảm</th><th>Điều kiện</th><th>Hiệu lực</th><th>Trạng thái</th><th aria-label="Thao tác" /></tr></thead>
      <tbody>
        {list.loading && !list.data && <TableMessage colSpan={6}><SkeletonRows rows={4} label="Đang tải quy tắc…" /></TableMessage>}
        {items.map((item) => <tr key={item.id}>
          <td><span className="ops-cell-primary bill-wrap">{item.code}<span className="ops-cell-sub">{packageName(item.servicePackageId)}</span></span></td>
          <td>{item.discountKind === "Percent" ? `${item.discountValue}%` : formatVnd(item.discountValue)}</td>
          <td>Từ {item.minimumBuildings} công trình{item.minimumDurationMonths ? ` · từ ${item.minimumDurationMonths} tháng` : ""}</td>
          <td>{formatDate(item.validFrom)} – {item.validUntil ? formatDate(item.validUntil) : "không giới hạn"}</td>
          <td><StatusBadge tone={item.isActive ? "success" : "neutral"}>{item.isActive ? "Đang bật" : "Tắt"}</StatusBadge></td>
          <td className="ops-cell-actions"><Button size="sm" variant="quiet" onClick={() => void openEdit(item)} aria-label={`Sửa quy tắc ${item.code}`}><Pencil size={14} aria-hidden="true" />Sửa</Button></td>
        </tr>)}
        {list.data && !items.length && <TableMessage colSpan={6}><EmptyState icon={Tags} title="Chưa có quy tắc giảm giá" description="Thêm quy tắc cho nhiều công trình hoặc thời hạn dài." action={<Button onClick={openCreate}>Tạo quy tắc</Button>} /></TableMessage>}
      </tbody>
    </Table>

    <Drawer open={editing !== null} onOpenChange={(open) => { if (!open && !saving) setEditing(null); }} title={editing?.item ? "Sửa quy tắc giảm giá" : "Tạo quy tắc giảm giá"} description="Lưu sẽ thay toàn bộ trường của quy tắc; báo giá đã phát hành không đổi.">
      <form onSubmit={submit} noValidate className="ops-stack">
        <fieldset className="ops-fieldset"><legend>Mức giảm</legend>
          <Field label="Mã quy tắc" required error={errors.code}>{(p) => <Input {...p} maxLength={80} value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} />}</Field>
          <div className="ops-form-grid">
            <Field label="Loại giảm" error={errors.discountKind}>{(p) => <Select {...p} value={form.discountKind} onChange={(event) => setForm({ ...form, discountKind: event.target.value as DiscountKind })}><option value="Percent">Phần trăm</option><option value="Fixed">Số tiền cố định (VND)</option></Select>}</Field>
            <Field label={form.discountKind === "Percent" ? "Giá trị (%)" : "Giá trị (VND)"} required error={errors.discountValue}>{(p) => <Input {...p} inputMode="decimal" value={form.discountValue} onChange={(event) => setForm({ ...form, discountValue: event.target.value })} />}</Field>
          </div>
        </fieldset>
        <fieldset className="ops-fieldset"><legend>Điều kiện áp dụng</legend>
          <div className="ops-form-grid">
            <Field label="Số công trình tối thiểu" required error={errors.minimumBuildings}>{(p) => <Input {...p} inputMode="numeric" value={form.minimumBuildings} onChange={(event) => setForm({ ...form, minimumBuildings: event.target.value })} />}</Field>
            <Field label="Số tháng tối thiểu" hint="Để trống nếu không giới hạn." error={errors.minimumDurationMonths}>{(p) => <Input {...p} inputMode="numeric" value={form.minimumDurationMonths} onChange={(event) => setForm({ ...form, minimumDurationMonths: event.target.value })} />}</Field>
          </div>
          <Field label="Chỉ áp dụng cho gói">{(p) => <Select {...p} value={form.servicePackageId} onChange={(event) => setForm({ ...form, servicePackageId: event.target.value })}><option value="">Mọi gói</option>{(packages.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.name} ({item.code})</option>)}</Select>}</Field>
        </fieldset>
        <fieldset className="ops-fieldset"><legend>Hiệu lực</legend>
          <div className="ops-form-grid">
            <Field label="Bắt đầu" required error={errors.validFrom} hint="Giờ địa phương, lưu dưới dạng UTC.">{(p) => <Input {...p} type="datetime-local" value={form.validFrom} onChange={(event) => setForm({ ...form, validFrom: event.target.value })} />}</Field>
            <Field label="Kết thúc" error={errors.validUntil} hint="Để trống nếu không giới hạn.">{(p) => <Input {...p} type="datetime-local" value={form.validUntil} onChange={(event) => setForm({ ...form, validUntil: event.target.value })} />}</Field>
          </div>
          <label className="bill-check"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} /><span>Đang bật</span></label>
        </fieldset>
        {formError && <Alert tone="danger" title="Chưa lưu được" action={conflict ? <Button size="sm" variant="secondary" className="mt-3" type="button" onClick={() => void reloadLatest()}>Tải bản mới để đối chiếu</Button> : undefined}>{formError}</Alert>}
        <div className="ops-actions" style={{ justifyContent: "flex-end" }}><Button type="button" variant="quiet" onClick={() => setEditing(null)} disabled={saving}>Hủy</Button><Button type="submit" disabled={saving}>{saving ? "Đang lưu…" : "Lưu quy tắc"}</Button></div>
      </form>
    </Drawer>
  </div>;
}
