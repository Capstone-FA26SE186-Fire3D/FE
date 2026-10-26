import type { BimFact } from "./types";

/**
 * Display helpers for `GET /api/revisions/{id}/bim-facts` (BE `docs/ifc-qa-codes.md`). After Geometry QA passes, each IfcSpace of
 * `building_metadata.spaces` has one row per property (`Name`, `LongName`, `Category`); a space with neither name nor long name gets
 * `qualityFlags: ["SPACE_UNNAMED"]` on its `Name` row. `qualityFlags` is typed only as JSON, so strings and `{ code }` objects are both read.
 */

const SPACE_PROPERTIES: Record<string, { label: string; order: number }> = {
  Name: { label: "Tên phòng", order: 0 },
  LongName: { label: "Tên đầy đủ", order: 1 },
  Category: { label: "Loại phòng", order: 2 },
};

const FLAG_LABEL: Record<string, string> = {
  SPACE_UNNAMED: "Phòng chưa có tên",
  MissingValue: "Thiếu giá trị",
};

export function entityLabel(entityType: string): string {
  return entityType === "IfcSpace" ? "Phòng" : "Cấu kiện khác";
}

export function propertyLabel(fact: Pick<BimFact, "entityType" | "propertyPath">): string {
  return (fact.entityType === "IfcSpace" && SPACE_PROPERTIES[fact.propertyPath]?.label) || "Thuộc tính khác";
}

export function qualityFlagCodes(flags: unknown): string[] {
  if (!Array.isArray(flags)) return [];
  return flags.flatMap((flag) => {
    if (typeof flag === "string" && flag.trim()) return [flag];
    if (typeof flag === "object" && flag !== null && typeof (flag as { code?: unknown }).code === "string") return [(flag as { code: string }).code];
    return [];
  });
}

/** Vietnamese label of a quality flag; the code itself is support information, not part of the label. */
export function qualityFlagLabel(code: string): string {
  return FLAG_LABEL[code] ?? "Cảnh báo khác";
}

/** Rows of one element side by side (Name, LongName, Category for a space); the server pages by row, not by element. */
export function sortFacts(facts: BimFact[]): BimFact[] {
  const rank = (fact: BimFact) => (fact.entityType === "IfcSpace" ? SPACE_PROPERTIES[fact.propertyPath]?.order ?? 9 : 9);
  return [...facts].sort((a, b) => a.ifcGlobalId.localeCompare(b.ifcGlobalId) || rank(a) - rank(b) || a.propertyPath.localeCompare(b.propertyPath));
}
