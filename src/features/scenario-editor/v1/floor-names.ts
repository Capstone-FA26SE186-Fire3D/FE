import { categoryOf } from "./scope";

/**
 * How a storey is named everywhere in the web, the same way the game's minimap names it (keep identical to the Unity rule):
 * "Tầng trệt" for the ground storey, "Tầng 1", "Tầng 2", … above it, "Hầm 1", "Hầm 2", … below it (Hầm 1 is the first one
 * under the ground storey). The IFC storey name ("BT-A_1010_OG01_RDOK_3,000") says nothing to a reader.
 *
 * - `nearestZero` is the storey elevation with the smallest absolute value (the lowest one on a tie).
 * - Every exit votes for one storey. Ground = the storey with the most votes; on a tie the one nearest `nearestZero`
 *   (the lowest on a further tie); with no exits, `nearestZero`.
 * - At elevation y: |y − ground| < 1 → ground; above → "Tầng n", n counting the storeys above the ground (more than 1 m)
 *   from the lowest up to this one; below → "Hầm n", n counting the storeys below the ground (more than 1 m) from the one
 *   just under the ground down to this one.
 * - A storey without an elevation keeps its own name.
 * shortcut: exactly 1 m from the ground counts as above/below (the rule says "> ground + 1" and leaves that value unnamed).
 */

export const GROUND_NAME = "Tầng trệt";
const SAME_LEVEL = 1;

export type FloorRef = { key: string; name: string; elevation: number | null | undefined };
/** An exit: the storey it is placed on, else (only a position known) its elevation, whose nearest storey it votes for. */
export type ExitRef = { floorKey?: string | null; elevation?: number | null };

const known = (value: number | null | undefined): value is number => typeof value === "number" && Number.isFinite(value);

/** Elevation of the ground storey, or null when no storey has an elevation. */
export function groundElevation(floors: readonly FloorRef[], exits: readonly ExitRef[]): number | null {
  const levels = floors.filter((floor) => known(floor.elevation)).map((floor) => floor.elevation as number).sort((a, b) => a - b);
  if (levels.length === 0) return null;
  const nearestZero = levels.reduce((best, value) => (Math.abs(value) < Math.abs(best) ? value : best));
  const votes = new Map<number, number>();
  for (const exit of exits) {
    const own = exit.floorKey ? floors.find((floor) => floor.key === exit.floorKey)?.elevation : undefined;
    const target = known(own) ? own : known(exit.elevation) ? levels.reduce((best, value) => (Math.abs(value - exit.elevation!) < Math.abs(best - exit.elevation!) ? value : best)) : null;
    if (target !== null) votes.set(target, (votes.get(target) ?? 0) + 1);
  }
  if (votes.size === 0) return nearestZero;
  let ground = nearestZero;
  let most = -1;
  for (const level of levels) {
    const count = votes.get(level) ?? 0;
    if (count > most || (count === most && Math.abs(level - nearestZero) < Math.abs(ground - nearestZero))) { ground = level; most = count; }
  }
  return ground;
}

/** Display name per floor key. */
export function floorNames(floors: readonly FloorRef[], exits: readonly ExitRef[]): Map<string, string> {
  const names = new Map<string, string>();
  const ground = groundElevation(floors, exits);
  const placed = floors.filter((floor) => known(floor.elevation));
  if (ground === null) { for (const floor of floors) names.set(floor.key, floor.name); return names; }
  const above = placed.filter((floor) => (floor.elevation as number) - ground >= SAME_LEVEL).sort((a, b) => (a.elevation as number) - (b.elevation as number));
  const below = placed.filter((floor) => ground - (floor.elevation as number) >= SAME_LEVEL).sort((a, b) => (b.elevation as number) - (a.elevation as number));
  for (const floor of floors) {
    if (!known(floor.elevation)) names.set(floor.key, floor.name);
    else if (Math.abs(floor.elevation - ground) < SAME_LEVEL) names.set(floor.key, GROUND_NAME);
    else if (floor.elevation > ground) names.set(floor.key, `Tầng ${above.indexOf(floor) + 1}`);
    else names.set(floor.key, `Hầm ${below.indexOf(floor) + 1}`);
  }
  return names;
}

/** "3 m", "-3 m", "0.5 m": metres to two decimals, no trailing zeros. */
export const formatMeters = (value: number): string => `${Math.round(value * 100) / 100} m`;

/** "Tầng 1 · 3 m"; just the name when the elevation is unknown. */
export const floorLabel = (name: string, elevation: number | null | undefined): string => (known(elevation) ? `${name} · ${formatMeters(elevation)}` : name);

/** Exits among placed objects (infrastructure category Exit: a Goal that is not an assembly point), as votes for their storey. */
export function exitsOf(objects: readonly { kind: string | null; capability?: { id: string } | undefined; floorId: string }[]): ExitRef[] {
  return objects.filter((object) => categoryOf(object.kind, object.capability?.id) === "Exit").map((object) => ({ floorKey: object.floorId }));
}
