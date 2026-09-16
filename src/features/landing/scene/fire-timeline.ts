/** Authored demonstration timing, not predicted fire propagation. */
export function roomFireTimeline(level: number, side: number, room: number) {
  const seed = level * 19 + room * 7 + (side > 0 ? 3 : 0);
  const ignition = 1.5 + ((room + level + (side < 0 ? 1 : 0)) % 3) * 6 + level * 2;
  return {
    seed,
    ignition,
    strength: .3 + .65 * ((Math.sin(seed * 3.7) + 1) / 2),
    wall: ignition + 3,
    facade: ignition + 9,
    roof: ignition + 18,
  };
}
