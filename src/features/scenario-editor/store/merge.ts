import { deepEqual, diffLeaves, formatJsonPath, setIn, type Json, type JsonObject, type PathSegment } from "./json";

/**
 * 412 recovery. The author's draft ("mine"), the version last synced with the server ("base") and the version the
 * server holds now ("theirs") are compared per top-level field. Nothing is written to the server here: the result
 * is loaded back into the editor as unsaved changes and saved only when the author chooses to.
 */
export type UnitStatus = "same" | "mine" | "theirs" | "both-equal" | "conflict";
export type FieldChange = { path: string; mine: unknown; theirs: unknown };
export type MergeUnit = {
  key: string;
  status: UnitStatus;
  mine: Json | undefined;
  theirs: Json | undefined;
  changes: FieldChange[];
};
export type MergeChoice = "mine" | "theirs";

export function compareDrafts(mine: JsonObject, theirs: JsonObject, base: JsonObject | null): MergeUnit[] {
  const keys = [...new Set([...Object.keys(mine), ...Object.keys(theirs)])].sort();
  const units: MergeUnit[] = [];
  for (const key of keys) {
    const m = mine[key];
    const t = theirs[key];
    if (deepEqual(m, t)) continue;
    const b = base?.[key];
    const mineChanged = base ? !deepEqual(m, b) : true;
    const theirsChanged = base ? !deepEqual(t, b) : true;
    const status: UnitStatus = mineChanged && theirsChanged ? "conflict" : mineChanged ? "mine" : "theirs";
    units.push({
      key, status, mine: m, theirs: t,
      changes: diffLeaves(m, t, [key], 40).map((leaf) => ({ path: formatJsonPath(leaf.path as PathSegment[]), mine: leaf.left, theirs: leaf.right })),
    });
  }
  return units;
}

/** Start from the server version, then take "mine" for every field the author chose to keep. */
export function resolveMerge(theirs: JsonObject, units: MergeUnit[], choices: Record<string, MergeChoice>): JsonObject {
  let merged = theirs;
  for (const unit of units) {
    const choice = choices[unit.key] ?? defaultChoice(unit);
    if (choice === "mine") merged = setIn(merged, [unit.key], unit.mine);
  }
  return merged;
}

/** Fields only the server changed are taken; everything the author typed (including true conflicts) is kept until they decide otherwise. */
export function defaultChoice(unit: MergeUnit): MergeChoice {
  return unit.status === "theirs" ? "theirs" : "mine";
}

export function summarizeValue(value: unknown): string {
  if (value === undefined) return "(không có)";
  if (typeof value === "string") return value.length > 80 ? `${value.slice(0, 77)}…` : value || "(trống)";
  const json = JSON.stringify(value);
  return json.length > 80 ? `${json.slice(0, 77)}…` : json;
}
