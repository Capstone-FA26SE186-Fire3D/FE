"use client";

import { useMemo } from "react";
import type { Building, BuildingInput } from "../types";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Field, Input } from "@/components/ui/field";
import { buildingTypes } from "../data/building-types";
import { districtsOf, provinceNames } from "../data/vn-provinces";
import { formatDateTime } from "../format";

export type FormState = { name: string; buildingType: string; totalFloors: string; address: string; city: string; district: string };
export const emptyForm: FormState = { name: "", buildingType: "", totalFloors: "1", address: "", city: "", district: "" };

export function formFromBuilding(building: Building): FormState {
  return {
    name: building.name,
    buildingType: building.buildingType ?? "",
    totalFloors: String(building.totalFloors),
    address: building.location?.address ?? "",
    city: building.location?.city ?? "",
    district: building.location?.district ?? "",
  };
}

export function validateBuildingForm(form: FormState) {
  const errors: Partial<Record<keyof FormState, string>> = {};
  const name = form.name.trim();
  const floors = Number(form.totalFloors);
  if (!name) errors.name = "Nhập tên công trình.";
  else if (name.length > 200) errors.name = "Tên công trình tối đa 200 ký tự.";
  if (!Number.isInteger(floors) || floors < 1) errors.totalFloors = "Số tầng phải là số nguyên từ 1 trở lên.";
  return errors;
}

function withoutId<T extends { id: string }>(value: T): Omit<T, "id"> {
  const copy: Partial<T> = { ...value };
  delete copy.id;
  return copy as Omit<T, "id">;
}

/** Keeps coordinates/geojson/contact the form does not edit, so saving never wipes them. */
export function buildingFormToInput(form: FormState, existing?: Building): BuildingInput {
  const address = form.address.trim() || null;
  const city = form.city.trim() || null;
  const district = form.district.trim() || null;
  const kept = existing?.location ? withoutId(existing.location) : { address: null, city: null, district: null, latitude: null, longitude: null, geojson: null };
  const hasLocation = Boolean(address || city || district || existing?.location);
  return {
    name: form.name.trim(),
    buildingType: form.buildingType.trim() || null,
    totalFloors: Number(form.totalFloors),
    location: hasLocation ? { ...kept, address, city, district } : null,
    contact: existing?.contact ? withoutId(existing.contact) : null,
  };
}

const typeOptions = buildingTypes.map((type) => ({ value: type, label: type }));
const cityOptions = provinceNames.map((name) => ({ value: name, label: name }));

/**
 * Figma "Modal / Create building": name · type (combobox) + floors · province (combobox) + district (combobox that
 * depends on the province) · street address. Type/city/district are suggestions only — BE stores plain strings, so the
 * comboboxes accept any typed value ("Khác…").
 */
export function BuildingForm({ form, errors, onChange, autoFocus }: { form: FormState; errors: ReturnType<typeof validateBuildingForm>; onChange: (patch: Partial<FormState>) => void; autoFocus?: boolean }) {
  const districtOptions = useMemo(() => districtsOf(form.city).map((district) => ({ value: district, label: district })), [form.city]);
  return <div className="ops-stack" data-testid="building-form">
    <Field label="Tên công trình" required error={errors.name}>{(p) => <Input {...p} required maxLength={200} value={form.name} autoFocus={autoFocus} placeholder="Trường Tiểu học Hòa Bình" onChange={(event) => onChange({ name: event.target.value })} />}</Field>
    <div className="ops-form-grid">
      <Field label="Loại công trình">{(p) => <Combobox {...p} value={form.buildingType} options={typeOptions} placeholder="Chọn loại công trình" searchPlaceholder="Tìm loại công trình…" allowCustom clearable aria-label="Loại công trình" onChange={(value) => onChange({ buildingType: value })} />}</Field>
      <Field label="Số tầng" required error={errors.totalFloors}>{(p) => <Input {...p} required min="1" inputMode="numeric" type="number" value={form.totalFloors} onChange={(event) => onChange({ totalFloors: event.target.value })} />}</Field>
    </div>
    <div className="ops-form-grid">
      <Field label="Tỉnh / Thành phố">{(p) => <Combobox {...p} value={form.city} options={cityOptions} placeholder="Chọn tỉnh / thành phố" searchPlaceholder="Tìm tỉnh / thành phố…" groupLabel="Tỉnh / thành phố" allowCustom clearable aria-label="Tỉnh / Thành phố" onChange={(value) => onChange({ city: value, district: value === form.city ? form.district : "" })} />}</Field>
      <Field label="Quận / Huyện" hint={districtOptions.length === 0 && form.city ? "Nhập tay quận / huyện (hoặc phường / xã)." : undefined}>{(p) => <Combobox {...p} value={form.district} options={districtOptions} placeholder="Chọn quận / huyện" searchPlaceholder="Tìm quận / huyện…" groupLabel="Gợi ý" emptyText="Nhập tên để dùng giá trị đó" allowCustom clearable aria-label="Quận / Huyện" onChange={(value) => onChange({ district: value })} />}</Field>
    </div>
    <Field label="Địa chỉ">{(p) => <Input {...p} maxLength={300} value={form.address} placeholder="Số nhà, đường, phường / xã" onChange={(event) => onChange({ address: event.target.value })} />}</Field>
  </div>;
}

/**
 * 412 on save: someone changed the Building since it was opened. The form keeps what the user typed; saving again
 * applies it on top of the version shown here (its ETag is already kept), or the user can load that version instead.
 */
export function BuildingConflictAlert({ current, onUseLatest }: { current: Building; onUseLatest: () => void }) {
  return <div data-testid="building-conflict"><Alert tone="warning" title="Công trình vừa được thay đổi ở nơi khác" action={<Button type="button" size="sm" variant="secondary" className="mt-3" onClick={onUseLatest}>Dùng bản mới nhất</Button>}>
    Bản mới nhất (cập nhật {formatDateTime(current.updatedAt)}): “{current.name}”, {current.buildingType || "chưa phân loại"}, {current.totalFloors} tầng.
    {" "}Nội dung bạn nhập vẫn được giữ; bấm lưu lần nữa để ghi đè lên bản mới nhất này.
  </Alert></div>;
}
