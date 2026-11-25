/**
 * Checks an IFC file in the browser before anything is uploaded, so a wrong or empty model never costs a processing
 * run. Two layers: the first 64 KB (file kind and IFC schema), then one streaming pass over the STEP text that counts
 * the entities the geometry worker needs. The pass reads the file in chunks: nothing is held in memory and no geometry
 * is built, so a few hundred MB take seconds. The server and the worker repeat their own checks; this is not a
 * security boundary.
 */

/** Used only until `GET /api/ifc/upload-limits` answers (BE#214), or when it cannot be read; the server refuses anything above its own limit anyway. */
export const IFC_MAX_BYTES = 1024 * 1024 * 1024;
const HEADER_BYTES = 64 * 1024;
const SUPPORTED_SCHEMAS = ["IFC2X3", "IFC4X3", "IFC4"] as const;

export type IfcHeaderCheck = { ok: true; schema: string } | { ok: false; problem: string };

const startsWith = (bytes: Uint8Array, ...signature: number[]) => signature.every((byte, index) => bytes[index] === byte);

/** Names the real kind of a file that is not an IFC model, from its first bytes (the extension can be renamed). */
export function describeForeignFile(bytes: Uint8Array, fileName: string): string | null {
  const name = fileName.toLowerCase();
  if (startsWith(bytes, 0x25, 0x50, 0x44, 0x46)) return "Đây là tệp PDF";
  if (startsWith(bytes, 0x50, 0x4b, 0x03, 0x04) || startsWith(bytes, 0x50, 0x4b, 0x05, 0x06)) {
    if (/\.docx?$/.test(name)) return "Đây là tệp Word";
    if (/\.xlsx?$/.test(name)) return "Đây là tệp Excel";
    return "Đây là tệp nén ZIP hoặc tài liệu Office (Word, Excel) đã đổi tên";
  }
  if (startsWith(bytes, 0xd0, 0xcf, 0x11, 0xe0)) return "Đây là tài liệu Office đời cũ (Word, Excel)";
  if (startsWith(bytes, 0x89, 0x50, 0x4e, 0x47) || startsWith(bytes, 0xff, 0xd8, 0xff) || startsWith(bytes, 0x47, 0x49, 0x46, 0x38)) return "Đây là tệp ảnh";
  if (startsWith(bytes, 0x52, 0x61, 0x72, 0x21) || startsWith(bytes, 0x37, 0x7a, 0xbc, 0xaf)) return "Đây là tệp nén";
  return null;
}

/** Layer 1: extension, size, file kind, `ISO-10303-21;` and `FILE_SCHEMA`. Reads at most 64 KB. */
export async function checkIfcHeader(file: File, maxBytes = IFC_MAX_BYTES): Promise<IfcHeaderCheck> {
  if (file.size === 0) return { ok: false, problem: "Tệp rỗng (0 byte). Hãy xuất lại mô hình IFC từ phần mềm thiết kế." };
  const bytes = new Uint8Array(await file.slice(0, HEADER_BYTES).arrayBuffer());
  const foreign = describeForeignFile(bytes, file.name);
  if (foreign) return { ok: false, problem: `${foreign}, không phải mô hình IFC. Hãy xuất mô hình từ Revit hoặc ArchiCAD ra định dạng IFC (.ifc).` };
  if (!file.name.toLowerCase().endsWith(".ifc")) return { ok: false, problem: "Chỉ nhận tệp mô hình IFC có đuôi .ifc." };
  if (file.size > maxBytes) return { ok: false, problem: `Tệp nặng ${Math.round(file.size / 1024 / 1024)} MB, vượt mức tối đa ${Math.round(maxBytes / 1024 / 1024)} MB. Hãy giảm chi tiết mô hình khi xuất IFC.` };

  const head = new TextDecoder("utf-8", { fatal: false }).decode(bytes).replace(/^﻿/, "").trimStart();
  if (!head.startsWith("ISO-10303-21;")) {
    return { ok: false, problem: "Nội dung tệp không phải mô hình IFC (thiếu phần mở đầu của định dạng IFC). Có thể tệp đã bị đổi đuôi hoặc hỏng khi lưu." };
  }
  const schema = /FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'/i.exec(head)?.[1]?.toUpperCase();
  if (!schema) return { ok: false, problem: "Tệp không ghi phiên bản IFC. Hãy xuất lại mô hình ở phiên bản IFC2x3 hoặc IFC4." };
  if (!SUPPORTED_SCHEMAS.some((supported) => schema.startsWith(supported))) {
    return { ok: false, problem: `Tệp thuộc chuẩn "${schema}", không phải IFC. Hệ thống nhận IFC2x3, IFC4 và IFC4x3.` };
  }
  return { ok: true, schema };
}

export type IfcContentCounts = { storeys: number; spaces: number; doors: number; walls: number; slabs: number; stairs: number };
export type IfcCriterion = { id: "storey" | "space" | "door" | "shell" | "stair"; label: string; passed: boolean; blocking: boolean; detail: string };

const COUNTED: Record<string, keyof IfcContentCounts> = {
  IFCBUILDINGSTOREY: "storeys",
  IFCSPACE: "spaces",
  IFCDOOR: "doors",
  IFCWALL: "walls",
  IFCWALLSTANDARDCASE: "walls",
  IFCSLAB: "slabs",
  IFCSTAIR: "stairs",
  IFCSTAIRFLIGHT: "stairs",
  IFCRAMP: "stairs",
};
const ENTITY = /=\s*(IFC[A-Z0-9]+)\s*\(/g;
const MAX_CARRY = 1024 * 1024;

/** Counts entity instances in a piece of STEP text; `counts` is updated in place. */
export function countIfcEntities(text: string, counts: IfcContentCounts): void {
  ENTITY.lastIndex = 0;
  for (let match = ENTITY.exec(text); match; match = ENTITY.exec(text)) {
    const key = COUNTED[match[1]];
    if (key) counts[key] += 1;
  }
}

/** Layer 2: one streaming pass over the whole file. `onProgress` gets 0..1; aborting rejects with an AbortError. */
export async function scanIfcContent(file: File, options: { onProgress?: (fraction: number) => void; signal?: AbortSignal } = {}): Promise<IfcContentCounts> {
  const counts: IfcContentCounts = { storeys: 0, spaces: 0, doors: 0, walls: 0, slabs: 0, stairs: 0 };
  const reader = file.stream().getReader();
  // Entity names are ASCII; latin1 never throws on the bytes of localized names inside strings.
  const decoder = new TextDecoder("latin1");
  let carry = "";
  let read = 0;
  try {
    for (;;) {
      if (options.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const { done, value } = await reader.read();
      if (done) break;
      read += value.byteLength;
      const text = carry + decoder.decode(value, { stream: true });
      // Count only up to the last line break (or the last instance start in a file written as one line), so no entity
      // is seen twice or cut in half. A tail that never breaks is flushed before it can grow without bound.
      const lineBreak = text.lastIndexOf("\n");
      let cut = lineBreak >= 0 ? lineBreak : text.lastIndexOf("#");
      if (cut < 0 || text.length - cut > MAX_CARRY) cut = text.length;
      countIfcEntities(text.slice(0, cut), counts);
      carry = text.slice(cut);
      options.onProgress?.(file.size ? read / file.size : 1);
    }
    countIfcEntities(carry, counts);
  } finally {
    reader.releaseLock();
  }
  return counts;
}

/** The public "is this file good enough" list. Blocking rows mirror what the geometry worker rejects. */
export function ifcCriteria(counts: IfcContentCounts): IfcCriterion[] {
  const multiStorey = counts.storeys > 1;
  return [
    { id: "storey", label: "Có khai báo tầng", passed: counts.storeys > 0, blocking: true, detail: counts.storeys > 0 ? `${counts.storeys} tầng` : "Mô hình không chia tầng. Hãy xuất IFC kèm cấu trúc tầng (Building Storey)." },
    { id: "space", label: "Có phòng, không gian", passed: counts.spaces > 0, blocking: true, detail: counts.spaces > 0 ? `${counts.spaces} phòng` : "Mô hình không có phòng. Hãy bật xuất phòng/không gian (Rooms, Spaces) khi xuất IFC." },
    { id: "door", label: "Có cửa", passed: counts.doors > 0, blocking: true, detail: counts.doors > 0 ? `${counts.doors} cửa` : "Mô hình không có cửa nên không xác định được lối ra." },
    { id: "shell", label: "Có tường hoặc sàn", passed: counts.walls + counts.slabs > 0, blocking: true, detail: counts.walls + counts.slabs > 0 ? `${counts.walls} tường, ${counts.slabs} sàn` : "Mô hình không có tường và sàn. Đây có thể là tệp kết cấu hoặc cơ điện, không phải mô hình kiến trúc." },
    { id: "stair", label: "Nhiều tầng thì có cầu thang", passed: !multiStorey || counts.stairs > 0, blocking: false, detail: !multiStorey ? "Công trình một tầng" : counts.stairs > 0 ? `${counts.stairs} cầu thang, dốc` : "Không thấy cầu thang giữa các tầng; người chơi sẽ không đi được giữa các tầng." },
  ];
}

export type IfcPrecheckResult =
  | { status: "blocked"; stage: "header"; problem: string }
  | { status: "blocked" | "passed"; stage: "content"; schema: string; counts: IfcContentCounts; criteria: IfcCriterion[] };

/** Runs both layers. `passed` means no blocking criterion failed (a missing stair only warns). */
export async function precheckIfcFile(file: File, options: { onProgress?: (fraction: number) => void; signal?: AbortSignal; maxBytes?: number } = {}): Promise<IfcPrecheckResult> {
  const header = await checkIfcHeader(file, options.maxBytes);
  if (!header.ok) return { status: "blocked", stage: "header", problem: header.problem };
  const counts = await scanIfcContent(file, options);
  const criteria = ifcCriteria(counts);
  return { status: criteria.some((item) => item.blocking && !item.passed) ? "blocked" : "passed", stage: "content", schema: header.schema, counts, criteria };
}
