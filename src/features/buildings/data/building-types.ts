/**
 * The only building types in scope (supervisor direction, 23/11/2026; BE#212): apartment buildings and schools from
 * primary school up. Nurseries and kindergartens are out: small children cannot play the drill. The API stores the value
 * (`Apartment` | `School`, exact case); people read the label. A building saved before BE#212 with another type comes
 * back with `null` and must choose again when edited.
 */
export const buildingTypes = [
  { value: "Apartment", label: "Chung cư" },
  { value: "School", label: "Trường học" },
] as const;

export type BuildingTypeValue = (typeof buildingTypes)[number]["value"];

export const isSupportedBuildingType = (value: string): boolean => buildingTypes.some((type) => type.value === value);

export const buildingTypeLabel = (value: string | null | undefined): string => buildingTypes.find((type) => type.value === value)?.label ?? "";

/** Fire risk group the API computes from type, floors and floor area (Phụ lục II Nghị định 105/2025/NĐ-CP). */
const RISK_GROUPS: Record<string, { label: string; tone: "danger" | "warning" | "neutral"; note: string }> = {
  Group1: { label: "Nhóm 1", tone: "danger", note: "Cơ sở thuộc Nhóm 1 còn có phương án chữa cháy PC08 do cơ quan Công an lập." },
  Group2: { label: "Nhóm 2", tone: "warning", note: "Cơ sở thuộc Nhóm 2 còn có phương án chữa cháy PC08 do cơ quan Công an lập." },
  BelowThreshold: { label: "Dưới ngưỡng", tone: "neutral", note: "Cơ sở dưới ngưỡng của Phụ lục II; vẫn nên có phương án thoát nạn." },
};

export const riskGroupInfo = (value: string | null | undefined) => (value ? RISK_GROUPS[value] ?? null : null);
