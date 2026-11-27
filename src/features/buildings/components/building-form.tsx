"use client";

import { Plus, Trash2 } from "lucide-react";
import { useMemo } from "react";
import type { Building } from "../types";
import { hasForce, MAX_CONTACTS, type ContactRow, type FormState, type validateBuildingForm } from "../building-form-model";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Field, Input } from "@/components/ui/field";
import { buildingTypeLabel, buildingTypes } from "../data/building-types";
import { districtsOf, provinceNames } from "../data/vn-provinces";
import { formatDateTime } from "../format";

export { buildingFormToInput, emptyForm, formFromBuilding, MAX_CONTACTS, validateBuildingForm, type ContactRow, type FormState } from "../building-form-model";

const typeOptions = buildingTypes.map((type) => ({ value: type.value, label: type.label }));
const cityOptions = provinceNames.map((name) => ({ value: name, label: name }));

/**
 * Figma "Modal / Create building": name · type (combobox) + floors · province (combobox) + district (combobox that
 * depends on the province) · street address, then the optional facility sheet of Mẫu PC06 part II (folded until opened).
 * City/district are suggestions only (BE stores plain strings, so those comboboxes accept any typed value).
 */
export function BuildingForm({ form, errors, onChange, autoFocus }: { form: FormState; errors: ReturnType<typeof validateBuildingForm>; onChange: (patch: Partial<FormState>) => void; autoFocus?: boolean }) {
  const districtOptions = useMemo(() => districtsOf(form.city).map((district) => ({ value: district, label: district })), [form.city]);
  const setContact = (index: number, patch: Partial<ContactRow>) => onChange({ contacts: form.contacts.map((contact, at) => (at === index ? { ...contact, ...patch } : contact)) });
  const facilityFilled = Boolean(form.floorArea || form.headName || form.headPhone || hasForce(form) || form.contacts.length);
  const facilityError = ["floorArea", "headName", "headPhone", "teamSize", "leaderPhone"].some((key) => errors[key]) || Object.keys(errors).some((key) => key.startsWith("contacts."));
  return <div className="ops-stack" data-testid="building-form">
    <Field label="Tên công trình" required error={errors.name}>{(p) => <Input {...p} required maxLength={200} value={form.name} autoFocus={autoFocus} placeholder="Trường Tiểu học Hòa Bình" onChange={(event) => onChange({ name: event.target.value })} />}</Field>
    <div className="ops-form-grid">
      <Field label="Loại công trình" required error={errors.buildingType} hint={form.buildingType === "School" ? "Trường học: từ tiểu học trở lên." : undefined}>{(p) => <Combobox {...p} value={form.buildingType} options={typeOptions} placeholder="Chọn loại công trình" searchPlaceholder="Tìm loại công trình…" aria-label="Loại công trình" onChange={(value) => onChange({ buildingType: value })} />}</Field>
      <Field label="Số tầng" required error={errors.totalFloors}>{(p) => <Input {...p} required min="1" inputMode="numeric" type="number" value={form.totalFloors} onChange={(event) => onChange({ totalFloors: event.target.value })} />}</Field>
    </div>
    <div className="ops-form-grid">
      <Field label="Tỉnh / Thành phố">{(p) => <Combobox {...p} value={form.city} options={cityOptions} placeholder="Chọn tỉnh / thành phố" searchPlaceholder="Tìm tỉnh / thành phố…" groupLabel="Tỉnh / thành phố" allowCustom clearable aria-label="Tỉnh / Thành phố" onChange={(value) => onChange({ city: value, district: value === form.city ? form.district : "" })} />}</Field>
      <Field label="Quận / Huyện" hint={districtOptions.length === 0 && form.city ? "Nhập tay quận / huyện (hoặc phường / xã)." : undefined}>{(p) => <Combobox {...p} value={form.district} options={districtOptions} placeholder="Chọn quận / huyện" searchPlaceholder="Tìm quận / huyện…" groupLabel="Gợi ý" emptyText="Nhập tên để dùng giá trị đó" allowCustom clearable aria-label="Quận / Huyện" onChange={(value) => onChange({ district: value })} />}</Field>
    </div>
    <Field label="Địa chỉ">{(p) => <Input {...p} maxLength={300} value={form.address} placeholder="Số nhà, đường, phường / xã" onChange={(event) => onChange({ address: event.target.value })} />}</Field>

    {/* Open when it already has data or an error, so nothing the user must fix stays folded away. */}
    <details className="ops-fieldset" open={facilityFilled || facilityError || undefined} data-testid="facility-section">
      <summary style={{ cursor: "pointer", fontWeight: 600 }}>Thông tin cơ sở theo Mẫu PC06 (không bắt buộc)</summary>
      <div className="ops-stack" style={{ marginTop: 12 }}>
        <Field label="Tổng diện tích sàn (m²)" error={errors.floorArea} hint="Cùng với loại công trình và số tầng, dùng để xác định nhóm nguy cơ cháy.">{(p) => <Input {...p} inputMode="decimal" type="number" min="0" step="0.01" value={form.floorArea} data-testid="field-floor-area" onChange={(event) => onChange({ floorArea: event.target.value })} />}</Field>
        <div className="ops-form-grid">
          <Field label="Người đứng đầu cơ sở" error={errors.headName}>{(p) => <Input {...p} maxLength={200} value={form.headName} onChange={(event) => onChange({ headName: event.target.value })} />}</Field>
          <Field label="Điện thoại người đứng đầu" error={errors.headPhone}>{(p) => <Input {...p} inputMode="tel" maxLength={32} value={form.headPhone} data-testid="field-head-phone" onChange={(event) => onChange({ headPhone: event.target.value })} />}</Field>
        </div>
        <fieldset className="ops-fieldset">
          <legend>Lực lượng PCCC tại chỗ</legend>
          <div className="ops-form-grid">
            <Field label="Số người" error={errors.teamSize}>{(p) => <Input {...p} inputMode="numeric" type="number" min="0" max="10000" value={form.teamSize} data-testid="field-team-size" onChange={(event) => onChange({ teamSize: event.target.value })} />}</Field>
            <Field label="Đội trưởng">{(p) => <Input {...p} maxLength={200} value={form.leaderName} onChange={(event) => onChange({ leaderName: event.target.value })} />}</Field>
          </div>
          <Field label="Điện thoại đội trưởng" error={errors.leaderPhone}>{(p) => <Input {...p} inputMode="tel" maxLength={32} value={form.leaderPhone} onChange={(event) => onChange({ leaderPhone: event.target.value })} />}</Field>
          <div className="ops-actions">
            <label className="se-check"><input type="checkbox" checked={form.inHours} onChange={(event) => onChange({ inHours: event.target.checked })} /> Có mặt trong giờ làm việc</label>
            <label className="se-check"><input type="checkbox" checked={form.offHours} onChange={(event) => onChange({ offHours: event.target.checked })} /> Có mặt ngoài giờ</label>
          </div>
        </fieldset>
        <fieldset className="ops-fieldset">
          <legend>Danh bạ khẩn cấp</legend>
          {form.contacts.length === 0 && <p className="ops-field-hint" style={{ margin: 0 }}>Ví dụ: Cảnh sát PCCC 114, công an phường, điện lực, bệnh viện gần nhất.</p>}
          {form.contacts.map((contact, index) => <div key={index} className="ops-form-grid" data-testid={`contact-${index}`} style={{ alignItems: "end" }}>
            <Field label="Tên" required error={errors[`contacts.${index}.name`]}>{(p) => <Input {...p} maxLength={200} value={contact.name} onChange={(event) => setContact(index, { name: event.target.value })} />}</Field>
            <Field label="Điện thoại" required error={errors[`contacts.${index}.phone`]}>{(p) => <Input {...p} inputMode="tel" maxLength={32} value={contact.phone} onChange={(event) => setContact(index, { phone: event.target.value })} />}</Field>
            <Field label="Vai trò">{(p) => <Input {...p} maxLength={200} value={contact.role} placeholder="Ví dụ: Công an phường" onChange={(event) => setContact(index, { role: event.target.value })} />}</Field>
            <div><Button type="button" variant="quiet" size="sm" aria-label={`Xóa liên hệ ${index + 1}`} onClick={() => onChange({ contacts: form.contacts.filter((_, at) => at !== index) })}><Trash2 size={14} aria-hidden="true" />Xóa</Button></div>
          </div>)}
          {form.contacts.length < MAX_CONTACTS && <div><Button type="button" variant="secondary" size="sm" data-testid="add-contact" onClick={() => onChange({ contacts: [...form.contacts, { name: "", phone: "", role: "" }] })}><Plus size={14} aria-hidden="true" />Thêm liên hệ</Button></div>}
        </fieldset>
      </div>
    </details>
  </div>;
}

/**
 * 412 on save: someone changed the Building since it was opened. The form keeps what the user typed; saving again
 * applies it on top of the version shown here (its ETag is already kept), or the user can load that version instead.
 */
export function BuildingConflictAlert({ current, onUseLatest }: { current: Building; onUseLatest: () => void }) {
  return <div data-testid="building-conflict"><Alert tone="warning" title="Công trình vừa được thay đổi ở nơi khác" action={<Button type="button" size="sm" variant="secondary" className="mt-3" onClick={onUseLatest}>Dùng bản mới nhất</Button>}>
    Bản mới nhất (cập nhật {formatDateTime(current.updatedAt)}): “{current.name}”, {buildingTypeLabel(current.buildingType) || "chưa phân loại"}, {current.totalFloors} tầng.
    {" "}Nội dung bạn nhập vẫn được giữ; bấm lưu lần nữa để ghi đè lên bản mới nhất này.
  </Alert></div>;
}
