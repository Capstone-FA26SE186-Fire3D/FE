import type { Vec3 } from "./matrix";

/**
 * How the training app draws each Equipment capability, so the editor can show the real size, the front and the height
 * before anything is built. The numbers follow the app's prefab builder (Unity `EquipmentPrefabBuilder`): the front of
 * every prefab is its local -Z; a wall item has its back at z = 0 above a floor pivot; a standing item stands on the
 * pivot; a ceiling item hangs from it. Sizes of imported models are rounded.
 *
 * The app does not move or turn an object to fit the building: what the author saves is what the learner sees.
 */
export type Mount = "wall" | "ceiling" | "stand" | "attached";

/** What `placement.position.y` (metres above the floor of the storey) has to be for the prefab to sit right. */
export type HeightRule =
  /** The prefab lifts itself: the author keeps y at 0. */
  | { rule: "zero" }
  /** y is the mounting height of the item. */
  | { rule: "height"; default: number }
  /** y is the surface the item stands on (floor, table, shelf). */
  | { rule: "surface" }
  /** y is the ceiling the item hangs from. */
  | { rule: "ceiling" };

export type Mounting = {
  mount: Mount;
  /** Width × height × depth in metres. Absent for items that take their shape from a door, window or lift of the model. */
  size?: { width: number; height: number; depth: number };
  /** Wall items: height of the middle of the body above the placement point. */
  lift?: number;
  y: HeightRule;
  /** The prefab has a face that must look into the room. */
  front: boolean;
};

const wall = (width: number, height: number, depth: number, lift: number, y: HeightRule = { rule: "zero" }): Mounting => ({ mount: "wall", size: { width, height, depth }, lift, y, front: true });
const stand = (width: number, height: number, depth: number): Mounting => ({ mount: "stand", size: { width, height, depth }, y: { rule: "surface" }, front: false });
const ceiling = (width: number, height: number): Mounting => ({ mount: "ceiling", size: { width, height, depth: width }, y: { rule: "ceiling" }, front: false });
const ATTACHED: Mounting = { mount: "attached", y: { rule: "surface" }, front: false };

const TABLE: Record<string, Mounting> = {
  "extinguisher.hose_reel": wall(0.9, 0.9, 0.24, 1.15),
  "blanket.fire": wall(0.3, 0.32, 0.07, 0.26, { rule: "height", default: 1.25 }),
  "alarm.call_point": wall(0.12, 0.12, 0.06, 1.4),
  "power.breaker": wall(0.5, 0.7, 0.2, 1.35),
  "tool.emergency_hammer": wall(0.3, 0.2, 0.06, 1.35),
  "alarm.detector": ceiling(0.12, 0.05),
  "suppression.sprinkler": ceiling(0.08, 0.09),
  "extinguisher.portable": stand(0.18, 0.5, 0.18),
  "gas.valve": stand(0.3, 0.58, 0.3),
  "firstaid.kit": stand(0.32, 0.24, 0.14),
  "water.sink": stand(0.6, 0.9, 0.5),
  "water.bath": stand(1.6, 0.6, 0.75),
  "water.shower": stand(0.9, 2.1, 0.9),
  "item.towel": stand(0.3, 0.08, 0.2),
  "item.blanket": stand(0.4, 0.15, 0.3),
  "item.clothing": stand(0.35, 0.1, 0.3),
  "bait.belongings": stand(0.35, 0.4, 0.25),
  "ppe.escape_hood": stand(0.28, 0.2, 0.2),
  "furniture.bed": stand(1.0, 0.55, 2.0),
  "door.standard": ATTACHED,
  "door.fire": ATTACHED,
  "door.exit": ATTACHED,
  "door.exit_locked": ATTACHED,
  "door.fire_wedged": ATTACHED,
  "window.openable": ATTACHED,
  "signal.window": ATTACHED,
  "glass.pane": ATTACHED,
  "transport.elevator": ATTACHED,
};

export const MOUNTED_CAPABILITIES: readonly string[] = Object.keys(TABLE);

export function mountingOf(capabilityId: string | undefined | null): Mounting | null {
  return capabilityId ? TABLE[capabilityId] ?? null : null;
}

/** Shape the viewport draws at true size; none for items that follow a part of the model. */
export type EquipmentShape = { mount: "wall" | "ceiling" | "stand"; width: number; height: number; depth: number; lift: number; front: boolean };

export function shapeOf(capabilityId: string | undefined | null): EquipmentShape | undefined {
  const mounting = mountingOf(capabilityId);
  if (!mounting?.size || mounting.mount === "attached") return undefined;
  return { mount: mounting.mount, ...mounting.size, lift: mounting.lift ?? 0, front: mounting.front };
}

const DEG = 180 / Math.PI;
const round = (value: number, digits: number) => Math.round(value * 10 ** digits) / 10 ** digits;

/**
 * Yaw (degrees about the vertical axis, GLB axes) that turns the front of a prefab (local -Z) along `normal`, the
 * direction out of a wall into the room. With yaw θ local +Z becomes (sin θ, 0, cos θ), so -Z becomes (-sin θ, 0, -cos θ).
 */
export function yawFacing(normal: Pick<Vec3, "x" | "z">): number {
  const degrees = Math.atan2(-normal.x, -normal.z) * DEG;
  return round(((degrees % 360) + 360) % 360, 3);
}

/** Is this surface normal a wall (close to horizontal) rather than a floor or ceiling? */
export const isWallNormal = (normal: Vec3) => Math.abs(normal.y) < 0.35 && Math.hypot(normal.x, normal.z) > 0.5;

/**
 * The floor-local y a placement gets for its mounting: 0 when the prefab lifts itself, the usual mounting height when y is
 * that height, otherwise the height of the surface that was clicked (`surfaceY`).
 */
export function mountedY(mounting: Mounting, surfaceY: number): number {
  if (mounting.y.rule === "zero") return 0;
  if (mounting.y.rule === "height") return mounting.y.default;
  return round(surfaceY, 3);
}

/** A wrong y for the mounting, in plain words; null when y is fine (or free). */
export function heightProblem(mounting: Mounting, y: number): string | null {
  if (mounting.y.rule === "zero" && Math.abs(y) > 0.05) return `Chiều cao Y đang là ${metres(y)}. Thiết bị này tự nằm ở độ cao chuẩn, nên Y phải là 0; nếu không nó sẽ bị nâng thêm ${metres(y)} trong ứng dụng.`;
  if (mounting.y.rule === "height" && y < 0.3) return `Chiều cao Y đang là ${metres(y)}: thiết bị sẽ nằm sát sàn. Chiều cao treo thường dùng là ${metres(mounting.y.default)}.`;
  return null;
}

const number = (value: number) => String(round(value, 2)).replace(".", ",");
const metres = (value: number) => `${number(value)} m`;

export const MOUNT_LABEL: Record<Mount, string> = { wall: "Gắn tường", ceiling: "Gắn trần", stand: "Đặt trên sàn hoặc mặt bàn", attached: "Gắn vào cửa, cửa sổ hoặc thang máy của mô hình" };

export function sizeText(mounting: Mounting): string | null {
  return mounting.size ? `Rộng ${number(mounting.size.width)} × cao ${number(mounting.size.height)} × sâu ${number(mounting.size.depth)} m` : null;
}

/** What to put in the Y field, in the author's words. */
export function heightText(mounting: Mounting): string {
  if (mounting.mount === "attached") return "Chọn cấu kiện neo; vị trí và hướng lấy theo cấu kiện đó.";
  if (mounting.y.rule === "zero") return `Để Y = 0: ứng dụng tự đặt thiết bị ở độ cao chuẩn, tâm cách sàn ${metres(mounting.lift ?? 0)}.`;
  if (mounting.y.rule === "height") return `Y là chiều cao treo, thường ${metres(mounting.y.default)}; thân thiết bị nằm ngay phía trên điểm đặt.`;
  if (mounting.y.rule === "ceiling") return "Y là chiều cao trần: bấm lên mặt trần để đặt, thiết bị treo ngay dưới điểm đặt.";
  return "Y là mặt đặt thiết bị: 0 khi đặt trên sàn, hoặc chiều cao mặt bàn, mặt kệ.";
}

export const WALL_HINT = "Mặt trước (mũi tên vàng) quay vào phòng, mặt lưng áp vào tường.";
