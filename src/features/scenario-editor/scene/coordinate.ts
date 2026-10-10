/**
 * `coordinateTransform` from `GET /api/buildings/{id}/editor-preview` (BE `EditorPreview.cs`): the BE only guarantees
 * "an array of exactly 16 finite numbers". Order, units and axes are NOT specified (BE#54).
 *
 * ASSUMPTIONS made here (kept in one place so they can be swapped once the BE documents the contract):
 *  A1. The 16 numbers are a 4x4 matrix in COLUMN-MAJOR order (the layout `THREE.Matrix4.fromArray` and glTF use):
 *      translation is in elements 12, 13, 14.
 *  A2. The matrix maps the preview GLB's model space to SCENARIO space, i.e. it is applied to the loaded model root.
 *      Scenario draft positions (`x,y,z`) are expressed in scenario space: metres, Y-up.
 *  A3. The matrix is affine (last row 0,0,0,1). Anything else is reported and NOT applied.
 * An identity matrix (the expected result when the GLB is already in scenario space) leaves the model untouched.
 * Verified only against hand-built fixtures (tests/e2e/scenario-editor-store.spec.ts), never against a real worker artifact.
 */
export const COORDINATE_ASSUMPTIONS = {
  order: "column-major",
  appliesTo: "model-root",
  units: "metres",
  up: "Y",
  rotationUnit: "degrees",
} as const;

export type TransformInfo =
  | { ok: true; values: number[]; isIdentity: boolean; scale: [number, number, number]; translation: [number, number, number]; warnings: string[] }
  | { ok: false; reason: string };

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

export function interpretCoordinateTransform(raw: unknown): TransformInfo {
  if (raw === null || raw === undefined) return { ok: false, reason: "Máy chủ không trả biến đổi tọa độ." };
  if (!Array.isArray(raw) || raw.length !== 16 || !raw.every((value) => typeof value === "number" && Number.isFinite(value))) {
    return { ok: false, reason: "Biến đổi tọa độ phải là mảng 16 số hữu hạn." };
  }
  const m = raw as number[];
  const warnings: string[] = [];
  const affine = Math.abs(m[3]) < 1e-9 && Math.abs(m[7]) < 1e-9 && Math.abs(m[11]) < 1e-9 && Math.abs(m[15] - 1) < 1e-9;
  if (!affine) return { ok: false, reason: "Ma trận không affine theo giả định column-major (hàng cuối khác 0,0,0,1); không áp dụng." };
  const sx = Math.hypot(m[0], m[1], m[2]);
  const sy = Math.hypot(m[4], m[5], m[6]);
  const sz = Math.hypot(m[8], m[9], m[10]);
  if (sx < 1e-9 || sy < 1e-9 || sz < 1e-9) return { ok: false, reason: "Ma trận suy biến (tỉ lệ bằng 0); không áp dụng." };
  const scale: [number, number, number] = [sx, sy, sz];
  if (scale.some((s) => s < 0.01 || s > 100)) warnings.push("Tỉ lệ của ma trận rất lệch 1 — có thể sai đơn vị (mm/m); chưa xác nhận trong BE#54.");
  const isIdentity = m.every((value, index) => Math.abs(value - IDENTITY[index]) < 1e-9);
  return { ok: true, values: m.slice(), isIdentity, scale, translation: [m[12], m[13], m[14]], warnings };
}
