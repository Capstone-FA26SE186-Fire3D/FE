/**
 * Coordinate maths of `fet3d.editor/1` (BE `contracts/editor/v1/README.md`, authoritative: `EditorContract.cs`).
 *
 * - GLB space: metres, Y-up, right-handed.
 * - A matrix is 16 finite numbers, COLUMN-MAJOR, multiplied with column vectors:
 *   `x' = m0*x + m4*y + m8*z + m12`, `y' = m1*x + m5*y + m9*z + m13`, `z' = m2*x + m6*y + m10*z + m14`.
 *   Row 4 (indices 3, 7, 11, 15) is exactly `0,0,0,1` and the 3x3 part is invertible.
 * - `coordinateTransform` maps IFC model coordinates to GLB (unit scale and origin included). It is for display and
 *   checks only: it is never applied to scenario objects.
 * - `floors[].transform` maps floor-local metres to GLB. `placement.position` is floor-local.
 * - `placement.rotation` is a unit quaternion `{x,y,z,w}` in GLB axes (tolerance 1e-3 on the length).
 */

export type Vec3 = { x: number; y: number; z: number };
export type Quat = { x: number; y: number; z: number; w: number };
export type Matrix16 = readonly number[];

export const IDENTITY_MATRIX: Matrix16 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
export const IDENTITY_QUATERNION: Quat = { x: 0, y: 0, z: 0, w: 1 };
export const QUATERNION_TOLERANCE = 1e-3;
const SINGULAR = 1e-12;

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

function determinant3(m: Matrix16): number {
  return m[0] * (m[5] * m[10] - m[9] * m[6]) - m[4] * (m[1] * m[10] - m[9] * m[2]) + m[8] * (m[1] * m[6] - m[5] * m[2]);
}

/** Null when `value` is a valid contract matrix; otherwise the reason (Vietnamese, for the UI). Same rules as the BE. */
export function matrixProblem(value: unknown): string | null {
  if (!Array.isArray(value) || value.length !== 16) return "Ma trận phải có đúng 16 số.";
  if (!value.every(finite)) return "Ma trận chứa giá trị không phải số hữu hạn.";
  if (value[3] !== 0 || value[7] !== 0 || value[11] !== 0 || value[15] !== 1) return "Hàng 4 của ma trận column-major phải là 0,0,0,1 (chỉ số 3, 7, 11, 15).";
  const det = determinant3(value);
  if (!Number.isFinite(det) || Math.abs(det) < SINGULAR) return "Ma trận không khả nghịch.";
  return null;
}

export function isMatrix16(value: unknown): value is number[] {
  return matrixProblem(value) === null;
}

/** `M * [x,y,z,1]^T` for a column-major affine matrix. */
export function applyMatrix(m: Matrix16, p: Vec3): Vec3 {
  return {
    x: m[0] * p.x + m[4] * p.y + m[8] * p.z + m[12],
    y: m[1] * p.x + m[5] * p.y + m[9] * p.z + m[13],
    z: m[2] * p.x + m[6] * p.y + m[10] * p.z + m[14],
  };
}

/** Inverse of an affine column-major matrix, or null when it is singular. */
export function invertAffine(m: Matrix16): number[] | null {
  const det = determinant3(m);
  if (!Number.isFinite(det) || Math.abs(det) < SINGULAR) return null;
  const inv = 1 / det;
  // Inverse of the 3x3 part (rows = cofactors), column-major output.
  const a = (m[5] * m[10] - m[9] * m[6]) * inv;
  const b = (m[8] * m[6] - m[4] * m[10]) * inv;
  const c = (m[4] * m[9] - m[8] * m[5]) * inv;
  const d = (m[9] * m[2] - m[1] * m[10]) * inv;
  const e = (m[0] * m[10] - m[8] * m[2]) * inv;
  const f = (m[8] * m[1] - m[0] * m[9]) * inv;
  const g = (m[1] * m[6] - m[5] * m[2]) * inv;
  const h = (m[4] * m[2] - m[0] * m[6]) * inv;
  const i = (m[0] * m[5] - m[4] * m[1]) * inv;
  // Output layout (column-major): column 0 = (a, d, g), column 1 = (b, e, h), column 2 = (c, f, i).
  const out = [a, d, g, 0, b, e, h, 0, c, f, i, 0, 0, 0, 0, 1];
  const t = { x: m[12], y: m[13], z: m[14] };
  out[12] = -(out[0] * t.x + out[4] * t.y + out[8] * t.z);
  out[13] = -(out[1] * t.x + out[5] * t.y + out[9] * t.z);
  out[14] = -(out[2] * t.x + out[6] * t.y + out[10] * t.z);
  return out;
}

export function localToGlb(floorTransform: Matrix16, local: Vec3): Vec3 {
  return applyMatrix(floorTransform, local);
}

/** GLB point to floor-local metres (the inverse of the floor transform), or null when the transform is singular. */
export function glbToLocal(floorTransform: Matrix16, glb: Vec3): Vec3 | null {
  const inverse = invertAffine(floorTransform);
  return inverse ? applyMatrix(inverse, glb) : null;
}

/** IFC model coordinates to GLB, for display and checks only (never applied to scenario objects). */
export function ifcToGlb(coordinateTransform: Matrix16, ifc: Vec3): Vec3 {
  return applyMatrix(coordinateTransform, ifc);
}

export const near = (a: Vec3, b: Vec3, epsilon = 1e-9) => Math.abs(a.x - b.x) <= epsilon && Math.abs(a.y - b.y) <= epsilon && Math.abs(a.z - b.z) <= epsilon;

// ───────── quaternion ↔ yaw ─────────

const DEG = Math.PI / 180;

export function quaternionLength(q: Quat): number {
  return Math.hypot(q.x, q.y, q.z, q.w);
}

export function isUnitQuaternion(q: Quat, tolerance = QUATERNION_TOLERANCE): boolean {
  return [q.x, q.y, q.z, q.w].every(finite) && Math.abs(quaternionLength(q) - 1) <= tolerance;
}

/** Rotation about the vertical (Y) axis by `degrees`, as a unit quaternion. */
export function yawToQuaternion(degrees: number): Quat {
  const half = (degrees * DEG) / 2;
  return { x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) };
}

/**
 * Yaw (about Y) of a unit quaternion in [0, 360). `pure` is true when the rotation has no tilt (x and z parts are
 * negligible), i.e. when the yaw field represents the whole rotation. The original quaternion stays untouched unless
 * the author edits the yaw.
 */
export function quaternionToYaw(q: Quat): { degrees: number; pure: boolean } {
  const yaw = Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.z * q.z));
  const degrees = ((yaw / DEG) % 360 + 360) % 360;
  return { degrees, pure: Math.abs(q.x) < 1e-6 && Math.abs(q.z) < 1e-6 };
}

/** Rounds components to `digits` decimals without losing the unit length beyond the BE tolerance. */
export function roundQuaternion(q: Quat, digits = 7): Quat {
  const factor = 10 ** digits;
  const round = (value: number) => Math.round(value * factor) / factor;
  return { x: round(q.x), y: round(q.y), z: round(q.z), w: round(q.w) };
}

export const round3 = (value: number) => Math.round(value * 1000) / 1000;
