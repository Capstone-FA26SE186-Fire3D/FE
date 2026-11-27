import { isObject, type Json, type JsonObject } from "@/features/scenario-editor/store/json";

/** The seeded exit door (an Equipment), and the Goal that makes it count as an exit (`categoryOf` → "Exit"). */
export const EXIT_DOOR_CAPABILITY = "door.exit";
export const FINAL_EXIT_CAPABILITY = "exit.final";
export const FINAL_EXIT_LABEL = "Lối ra ngoài";

const samePlace = (a: Json | undefined, b: Json | undefined): boolean => {
  if (!isObject(a) || !isObject(b) || a.floorId !== b.floorId || !isObject(a.position) || !isObject(b.position)) return false;
  return a.position.x === b.position.x && a.position.y === b.position.y && a.position.z === b.position.z;
};

/**
 * The first infrastructure version is seeded from the confirmed IFC equipment, so an exit door the author chose arrives as
 * an Equipment `door.exit`, which never counts as an exit: the check said "Cần ít nhất một lối thoát nạn" although the door
 * was there. Each such door with no Goal on the same building element gets one, the same object the author makes in the
 * editor (a Goal "Gắn vào bộ phận tòa nhà" = that door, capability `exit.final` of the runtime catalog), at the door's place.
 * Returns the objects with the new Goals appended, or null when nothing is missing (also on a second run).
 */
export function withExitGoals(objects: readonly Json[], exit: { id: string; version: string }): JsonObject[] | null {
  const list = objects.filter(isObject);
  const goals = list.filter((object) => object.kind === "Goal");
  const anchored = new Set(goals.flatMap((goal) => (typeof goal.anchorId === "string" ? [goal.anchorId] : [])));
  const ids = new Set(list.flatMap((object) => (typeof object.id === "string" ? [object.id] : [])));
  const added: JsonObject[] = [];
  let n = 1;
  for (const door of list) {
    if (door.kind !== "Equipment" || !isObject(door.capability) || door.capability.id !== EXIT_DOOR_CAPABILITY || !isObject(door.placement)) continue;
    const anchorId = typeof door.anchorId === "string" ? door.anchorId : undefined;
    // A door without a building element is matched by its place instead.
    if (anchorId ? anchored.has(anchorId) : [...goals, ...added].some((goal) => samePlace(goal.placement, door.placement))) continue;
    while (ids.has(`goal-${n}`)) n += 1;
    const id = `goal-${n}`;
    ids.add(id);
    if (anchorId) anchored.add(anchorId);
    const placement = JSON.parse(JSON.stringify(door.placement)) as JsonObject;
    added.push({ id, kind: "Goal", placement, ...(anchorId ? { anchorId } : {}), capability: { id: exit.id, version: exit.version }, label: FINAL_EXIT_LABEL });
  }
  return added.length > 0 ? [...list, ...added] : null;
}
