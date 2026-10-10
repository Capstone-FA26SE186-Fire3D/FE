import type { Building, BuildingInput } from "../types";
import { Field, Input } from "@/components/ui/field";

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

export function BuildingForm({ form, errors, onChange }: { form: FormState; errors: ReturnType<typeof validateBuildingForm>; onChange: (patch: Partial<FormState>) => void }) {
  return <div className="ops-stack">
    <fieldset className="ops-fieldset">
      <legend>Thông tin chung</legend>
      <Field label="Tên công trình" required error={errors.name}>{(p) => <Input {...p} required maxLength={200} value={form.name} onChange={(event) => onChange({ name: event.target.value })} />}</Field>
      <div className="ops-form-grid">
        <Field label="Loại công trình">{(p) => <Input {...p} maxLength={200} value={form.buildingType} placeholder="Chung cư, trường học…" onChange={(event) => onChange({ buildingType: event.target.value })} />}</Field>
        <Field label="Số tầng" required error={errors.totalFloors}>{(p) => <Input {...p} required min="1" inputMode="numeric" type="number" value={form.totalFloors} onChange={(event) => onChange({ totalFloors: event.target.value })} />}</Field>
      </div>
    </fieldset>
    <fieldset className="ops-fieldset">
      <legend>Vị trí (không bắt buộc)</legend>
      <Field label="Địa chỉ">{(p) => <Input {...p} maxLength={300} value={form.address} onChange={(event) => onChange({ address: event.target.value })} />}</Field>
      <div className="ops-form-grid">
        <Field label="Quận / huyện">{(p) => <Input {...p} maxLength={120} value={form.district} onChange={(event) => onChange({ district: event.target.value })} />}</Field>
        <Field label="Tỉnh / thành phố">{(p) => <Input {...p} maxLength={120} value={form.city} onChange={(event) => onChange({ city: event.target.value })} />}</Field>
      </div>
    </fieldset>
  </div>;
}
