import type { JsonObject } from "../store/json";
import { isObject } from "../store/json";
import { OBJECT_KINDS, type ObjectKind } from "./contract";

/**
 * What one editor session may place (BE#213, `FireInfrastructureRules`):
 * - `scenario`: a draft created before fire infrastructures existed (`infrastructureId` null). Every kind, as before.
 * - `infrastructure`: a fire infrastructure version. Exits, assembly points, fixed equipment and water sources only.
 * - `scenario-on-infrastructure`: a draft built on a locked infrastructure. Everything the infrastructure does NOT hold.
 */
export type EditorScope = "scenario" | "infrastructure" | "scenario-on-infrastructure";

export type InfrastructureCategory = "Exit" | "AssemblyPoint" | "Equipment" | "WaterSource";

/**
 * Equipment a scenario places itself; every other Equipment belongs to the infrastructure. Loose items (towel, belongings)
 * and the STATE of an existing door: which exit is padlocked and which fire door is wedged open differs per scenario, while
 * the door itself is part of the building (BE#224).
 */
export const SCENARIO_ITEM_CAPABILITIES: readonly string[] = ["item.towel", "bait.belongings", "door.exit_locked", "door.fire_wedged"];

const KINDS: Record<EditorScope, readonly ObjectKind[]> = {
  scenario: OBJECT_KINDS,
  infrastructure: ["Goal", "Equipment"],
  "scenario-on-infrastructure": ["Spawn", "Hazard", "Npc", "BlockedElement", "Equipment"],
};

export const scopeKinds = (scope: EditorScope): readonly ObjectKind[] => KINDS[scope];

/** True when the object is part of the building's fire infrastructure rather than of one scenario. */
export function isInfrastructureObject(kind: string | null, capabilityId: string | undefined): boolean {
  if (kind === "Goal") return true;
  return kind === "Equipment" && !SCENARIO_ITEM_CAPABILITIES.includes(capabilityId ?? "");
}

/** Whether a capability may be chosen for a kind in this scope. An Equipment with no capability yet is allowed everywhere: it is unfinished, not misplaced. */
export function capabilityAllowed(scope: EditorScope, kind: ObjectKind, capabilityId: string): boolean {
  if (scope === "scenario" || kind !== "Equipment") return true;
  const scenarioItem = SCENARIO_ITEM_CAPABILITIES.includes(capabilityId);
  return scope === "infrastructure" ? !scenarioItem : scenarioItem;
}

/**
 * Category the API stores with each infrastructure item. It follows from the object itself, the same way the server seeds
 * the first version (`water.*` is a water source), so the author never types it.
 * shortcut: a Goal that is not an assembly point (a refuge area included) counts as Exit because the API has no other
 * category for it; add one here when the API does.
 */
export function categoryOf(kind: string | null, capabilityId: string | undefined): InfrastructureCategory | null {
  if (kind === "Goal") return capabilityId === "assembly.point" ? "AssemblyPoint" : "Exit";
  if (kind === "Equipment") return capabilityId?.startsWith("water.") ? "WaterSource" : "Equipment";
  return null;
}

const capabilityIdOf = (item: JsonObject): string | undefined => (isObject(item.capability) && typeof item.capability.id === "string" ? item.capability.id : undefined);

/** Infrastructure items (objects + `category`) → editor objects. The category is dropped: it is derived again on save. */
export function itemsToObjects(items: unknown): JsonObject[] {
  if (!Array.isArray(items)) return [];
  return items.filter(isObject).map((item) => {
    const copy = { ...item };
    delete copy.category;
    return copy;
  });
}

/** Editor objects → infrastructure items for `PUT /api/fire-infrastructures/{id}`. */
export function objectsToItems(objects: unknown): JsonObject[] {
  if (!Array.isArray(objects)) return [];
  return objects.filter(isObject).map((object) => {
    const category = categoryOf(typeof object.kind === "string" ? object.kind : null, capabilityIdOf(object));
    return category ? { ...object, category } : { ...object };
  });
}

/** Issue paths of the infrastructure API (`$.items[i]…`) on the editor document (`$.objects[i]…`). */
export const itemPathToObjectPath = (path: string): string => (path.startsWith("$.items") ? `$.objects${path.slice("$.items".length)}` : path);
