/**
 * `floors` and `semanticMapping` come from `GET /api/buildings/{id}/editor-preview` as raw artifact metadata: the BE
 * only checks `floors` is an array and `semanticMapping` an object (BE#54 asks for a schema). These parsers read what
 * they can, never invent data, and return empty results when the shape is not recognised, so the viewport degrades to
 * "no floors / no layers" instead of failing.
 */
export type FloorInfo = { key: string; name: string; elevation: number | null };
export type LayerInfo = { key: string; label: string; nodeNames: string[] };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const firstString = (source: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
};
const firstNumber = (source: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
};

/** ASSUMPTION (BE#54): `elevation` is metres in the same space as the GLB after `coordinateTransform` (Y-up). */
export function parseFloors(raw: unknown): FloorInfo[] {
  if (!Array.isArray(raw)) return [];
  const floors: FloorInfo[] = [];
  raw.forEach((item, index) => {
    if (typeof item === "string" && item.trim()) floors.push({ key: `floor-${index}`, name: item.trim(), elevation: null });
    else if (typeof item === "number" && Number.isFinite(item)) floors.push({ key: `floor-${index}`, name: `Tầng ${index + 1}`, elevation: item });
    else if (isRecord(item)) {
      const elevation = firstNumber(item, ["elevation", "elevationM", "elevation_m", "z", "height", "level"]);
      const name = firstString(item, ["name", "label", "title", "storey", "storeyName"]) ?? `Tầng ${index + 1}`;
      floors.push({ key: firstString(item, ["id", "guid", "globalId", "ifcGuid", "ifc_guid", "key"]) ?? `floor-${index}`, name, elevation: elevation ?? null });
    }
  });
  const unique = new Map<string, FloorInfo>();
  floors.forEach((floor) => { if (!unique.has(floor.key)) unique.set(floor.key, floor); });
  return [...unique.values()].sort((a, b) => (a.elevation ?? Number.POSITIVE_INFINITY) - (b.elevation ?? Number.POSITIVE_INFINITY));
}

/** Upper bound of the active floor: the next floor's elevation, or null for the top floor / unknown elevations. */
export function floorCeiling(floors: FloorInfo[], key: string): number | null {
  const index = floors.findIndex((floor) => floor.key === key);
  if (index < 0 || floors[index].elevation === null) return null;
  const next = floors.slice(index + 1).find((floor) => floor.elevation !== null && floor.elevation > (floors[index].elevation ?? 0));
  return next?.elevation ?? null;
}

/**
 * Layers are inferred from two shapes, both guesses (BE#54): `{ category: ["nodeName", …] }` and `{ nodeName: "category" }`.
 * A layer is only shown by the viewport when at least one glTF node of that name exists in the loaded model.
 */
export function parseLayers(raw: unknown, maxLayers = 12): LayerInfo[] {
  if (!isRecord(raw)) return [];
  const byCategory = new Map<string, Set<string>>();
  const add = (category: string, name: string) => {
    if (!category.trim() || !name.trim()) return;
    const set = byCategory.get(category) ?? new Set<string>();
    set.add(name);
    byCategory.set(category, set);
  };
  for (const [key, value] of Object.entries(raw).slice(0, 20_000)) {
    if (Array.isArray(value) && value.every((entry) => typeof entry === "string")) (value as string[]).forEach((name) => add(key, name));
    else if (typeof value === "string") add(value, key);
  }
  return [...byCategory.entries()].slice(0, maxLayers).map(([key, names]) => ({ key, label: key, nodeNames: [...names] }));
}
