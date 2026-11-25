import type { Building, BuildingInput } from "./types";
import { isSupportedBuildingType } from "./data/building-types";

// Pure model of the Building form (no React), so it can be tested without a browser.

export type ContactRow = { name: string; phone: string; role: string };
/** Facility sheet of Mẫu PC06 part II (BE#212). Every field is optional; text inputs keep what the user typed. */
export type FormState = {
  name: string; buildingType: string; totalFloors: string; address: string; city: string; district: string;
  floorArea: string; headName: string; headPhone: string;
  teamSize: string; leaderName: string; leaderPhone: string; inHours: boolean; offHours: boolean;
  contacts: ContactRow[];
};
export const emptyForm: FormState = {
  name: "", buildingType: "", totalFloors: "1", address: "", city: "", district: "",
  floorArea: "", headName: "", headPhone: "", teamSize: "", leaderName: "", leaderPhone: "", inHours: false, offHours: false, contacts: [],
};
export const MAX_CONTACTS = 20;

export function formFromBuilding(building: Building): FormState {
  const force = building.onSiteForce;
  return {
    name: building.name,
    buildingType: building.buildingType ?? "",
    totalFloors: String(building.totalFloors),
    address: building.location?.address ?? "",
    city: building.location?.city ?? "",
    district: building.location?.district ?? "",
    floorArea: building.floorAreaSquareMeters != null ? String(building.floorAreaSquareMeters) : "",
    headName: building.facilityHeadName ?? "",
    headPhone: building.facilityHeadPhone ?? "",
    teamSize: force ? String(force.teamSize) : "",
    leaderName: force?.leaderName ?? "",
    leaderPhone: force?.leaderPhone ?? "",
    inHours: force?.availableInHours ?? false,
    offHours: force?.availableOffHours ?? false,
    contacts: (building.emergencyContacts ?? []).map((contact) => ({ name: contact.name, phone: contact.phone, role: contact.role ?? "" })),
  };
}

/** Same rule as the API: 3–32 characters of digits, spaces and `+ - ( ) .`, with at least 3 digits (114 is valid). */
const validPhone = (value: string) => /^[0-9+() .\-]{3,32}$/.test(value) && value.replace(/\D/g, "").length >= 3;
const PHONE_ERROR = "Số điện thoại gồm 3–32 ký tự: chữ số, dấu cách và + - ( ) .";
export const hasForce = (form: FormState) => Boolean(form.teamSize.trim() || form.leaderName.trim() || form.leaderPhone.trim() || form.inHours || form.offHours);

/** Errors by field; a contact row uses `contacts.<index>.name` / `contacts.<index>.phone`. */
export function validateBuildingForm(form: FormState) {
  const errors: Partial<Record<string, string>> = {};
  const name = form.name.trim();
  const floors = Number(form.totalFloors);
  if (!name) errors.name = "Nhập tên công trình.";
  else if (name.length > 200) errors.name = "Tên công trình tối đa 200 ký tự.";
  if (!form.buildingType) errors.buildingType = "Chọn loại công trình.";
  else if (!isSupportedBuildingType(form.buildingType)) errors.buildingType = "Hệ thống hiện chỉ hỗ trợ Chung cư và Trường học. Hãy chọn lại loại công trình.";
  if (!Number.isInteger(floors) || floors < 1) errors.totalFloors = "Số tầng phải là số nguyên từ 1 trở lên.";

  if (form.floorArea.trim()) {
    const area = Number(form.floorArea);
    if (!Number.isFinite(area) || area <= 0 || area > 10_000_000) errors.floorArea = "Diện tích sàn phải lớn hơn 0 và không quá 10.000.000 m².";
    else if (Math.round(area * 100) !== area * 100) errors.floorArea = "Diện tích sàn tối đa 2 chữ số thập phân.";
  }
  if (form.headName.trim().length > 200) errors.headName = "Tên tối đa 200 ký tự.";
  if (form.headPhone.trim() && !validPhone(form.headPhone.trim())) errors.headPhone = PHONE_ERROR;
  if (hasForce(form)) {
    const size = Number(form.teamSize);
    if (!form.teamSize.trim() || !Number.isInteger(size) || size < 0 || size > 10_000) errors.teamSize = "Nhập số người của đội PCCC cơ sở (0–10.000).";
    if (form.leaderPhone.trim() && !validPhone(form.leaderPhone.trim())) errors.leaderPhone = PHONE_ERROR;
  }
  form.contacts.forEach((contact, index) => {
    if (!contact.name.trim()) errors[`contacts.${index}.name`] = "Nhập tên.";
    if (!contact.phone.trim()) errors[`contacts.${index}.phone`] = "Nhập số điện thoại.";
    else if (!validPhone(contact.phone.trim())) errors[`contacts.${index}.phone`] = PHONE_ERROR;
  });
  return errors;
}

function withoutId<T extends { id: string }>(value: T): Omit<T, "id"> {
  const copy: Partial<T> = { ...value };
  delete copy.id;
  return copy as Omit<T, "id">;
}

/**
 * Keeps coordinates/geojson/contact the form does not edit, so saving never wipes them. The PC06 fields are all sent:
 * `PUT` replaces every editable field, so one left out would be cleared on the server.
 */
export function buildingFormToInput(form: FormState, existing?: Building): BuildingInput {
  const address = form.address.trim() || null;
  const city = form.city.trim() || null;
  const district = form.district.trim() || null;
  const kept = existing?.location ? withoutId(existing.location) : { address: null, city: null, district: null, latitude: null, longitude: null, geojson: null };
  const hasLocation = Boolean(address || city || district || existing?.location);
  return {
    name: form.name.trim(),
    buildingType: form.buildingType || null,
    totalFloors: Number(form.totalFloors),
    location: hasLocation ? { ...kept, address, city, district } : null,
    contact: existing?.contact ? withoutId(existing.contact) : null,
    floorAreaSquareMeters: form.floorArea.trim() ? Number(form.floorArea) : null,
    facilityHeadName: form.headName.trim() || null,
    facilityHeadPhone: form.headPhone.trim() || null,
    onSiteForce: hasForce(form) ? { teamSize: Number(form.teamSize), leaderName: form.leaderName.trim() || null, leaderPhone: form.leaderPhone.trim() || null, availableInHours: form.inHours, availableOffHours: form.offHours } : null,
    emergencyContacts: form.contacts.map((contact) => ({ name: contact.name.trim(), phone: contact.phone.trim(), role: contact.role.trim() || null })),
  };
}
