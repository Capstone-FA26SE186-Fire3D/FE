import { capabilityName, parameterLabel } from "@/configs/capability-labels";

import type { Json, JsonObject } from "../store/json";
import { KIND_META, type ObjectKind } from "./contract";
import { targetOf } from "./issues";

type Named = { label: string; kind: ObjectKind | null; capability?: { id: string } | undefined };
type Placed = Named & { index: number; floorId: string };

/**
 * What the author reads as an object's name. The server seeds confirmed IFC equipment with the IFC class as its label
 * ("IfcBuildingElementProxy"), so an empty label or one that is an IFC class counts as no label: the object is then named
 * after its capability ("Bình chữa cháy xách tay"), else after its kind. Never the raw id.
 */
export function objectName(object: Named): string {
  const own = object.label.trim();
  if (own && !/^Ifc/.test(own)) return own;
  const id = object.capability?.id;
  if (id && capabilityName(id) !== id) return capabilityName(id);
  return object.kind ? KIND_META[object.kind].label : "Đối tượng";
}

/**
 * An issue on one parameter of one object, said so the author finds it without opening the support details:
 * "Bình chữa cháy xách tay #1 (Tầng 1): chưa điền Loại chất chữa cháy". Null for any other path.
 * `#n` is the object's place in the list, the same number the inspector title shows.
 */
export function parameterIssueText(issue: { code: string; path: string; message: string }, objects: readonly Placed[], floorName?: (floorId: string) => string | undefined): string | null {
  const target = targetOf(issue.path);
  if (target.section !== "object") return null;
  const name = /^parameters\.([^.]+)$/.exec(target.field)?.[1];
  const object = objects[target.index];
  if (!name || !object) return null;
  const floor = floorName?.(object.floorId);
  const who = `${objectName(object)} #${object.index + 1}${floor ? ` (${floor})` : ""}`;
  return issue.code === "FIELD_REQUIRED" ? `${who}: chưa điền ${parameterLabel(name)}` : `${who}, ${parameterLabel(name)}: ${issue.message}`;
}

/**
 * Other objects with the same capability whose `name` parameter is still empty: where "Áp dụng cho N … còn trống" copies a
 * value. A filled value is never a target, so the copy never overwrites what someone chose.
 */
export function emptyParameterPeers(objects: readonly { index: number; capability?: { id: string } | undefined; parameters: JsonObject }[], index: number, name: string): number[] {
  const id = objects[index]?.capability?.id;
  if (!id) return [];
  return objects.filter((object) => object.index !== index && object.capability?.id === id && object.parameters[name] === undefined).map((object) => object.index);
}

/** The writes of that copy: one per target object, each under its own `parameters`, so they stay disjoint in one command. */
export const parameterCopyWrites = (indices: readonly number[], name: string, value: Json) => indices.map((index) => ({ path: ["objects", index, "parameters", name], value }));
