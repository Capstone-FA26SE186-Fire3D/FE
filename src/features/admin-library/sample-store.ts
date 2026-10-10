/*
 * SAMPLE DATA — development prototype only (loaded through the prototype chunk, never in production).
 * Imitates the Docs v7 rules: published versions are immutable, history is retained (items are deactivated, not
 * deleted), and capability metadata cannot invent runtime behavior.
 */
import { ApiError } from "@/api/types/common";
import type { LibraryItem, LibraryKind, LibraryVersion, LibraryVersionInput, NewItemInput } from "./types";

/** Capabilities the (sample) runtime catalog supports. Real source would be GET /api/scenario-interactions/catalog. */
export const runtimeCapabilities = ["movement.walk", "door.open", "extinguisher.use", "assist.person", "cover.nose", "alarm.pull"];

export const CODE_PATTERN = /^[a-z0-9][a-z0-9_-]{2,63}$/;
const iso = (daysAgo: number) => new Date(Date.UTC(2026, 9, 10 - daysAgo, 8, 0)).toISOString();

const version = (id: string, versionNumber: number, name: string, description: string, caps: string[], published: boolean, days: number): LibraryVersion =>
  ({ id, versionNumber, name, description, requiredCapabilities: caps, publishedAt: published ? iso(days) : null, createdAt: iso(days + 1) });

function seed(): LibraryItem[] {
  return [
    { id: "li-1", kind: "ScenarioTemplate", code: "school-evacuation", isActive: true, versions: [
      version("lv-1-1", 1, "Sơ tán trường học", "Báo cháy giờ ra chơi, hai lối thoát, điểm tập kết sân trường.", ["movement.walk", "door.open"], true, 20),
      version("lv-1-2", 2, "Sơ tán trường học (cập nhật lối thoát)", "Bổ sung tình huống một cầu thang bị khói chặn.", ["movement.walk", "door.open", "assist.person"], true, 8),
      version("lv-1-3", 3, "Sơ tán trường học (nháp)", "Thêm hướng dẫn cho học sinh nhỏ tuổi.", ["movement.walk", "door.open", "assist.person"], false, 1),
    ] },
    { id: "li-2", kind: "ScenarioTemplate", code: "office-smoke", isActive: true, versions: [version("lv-2-1", 1, "Khói tại văn phòng nhiều tầng", "Mất điện, khói lan hành lang, sơ tán bằng cầu thang bộ.", ["movement.walk", "door.open"], true, 14)] },
    { id: "li-3", kind: "RubricSample", code: "rubric-basic-evac", isActive: true, versions: [version("lv-3-1", 1, "Rubric sơ tán cơ bản", "Thời gian phản ứng 30%, chọn lối thoát 40%, hành vi an toàn 20%, hỗ trợ người khác 10%.", [], true, 18)] },
    { id: "li-4", kind: "RubricSample", code: "rubric-extinguisher", isActive: false, versions: [version("lv-4-1", 1, "Rubric dùng bình chữa cháy", "Chọn đúng loại bình, đứng đầu hướng gió, quét đều.", ["extinguisher.use"], true, 40)] },
    { id: "li-5", kind: "Equipment", code: "fire-extinguisher", isActive: true, versions: [version("lv-5-1", 1, "Bình chữa cháy xách tay", "Bình bột ABC 4 kg. Metadata hiển thị; hành vi do runtime quyết định.", ["extinguisher.use"], true, 25)] },
    { id: "li-6", kind: "Equipment", code: "wet-towel", isActive: true, versions: [version("lv-6-1", 1, "Khăn ướt che mũi", "Tác dụng chỉ được mô phỏng theo nội dung đã duyệt, không mặc định là đúng.", ["cover.nose"], true, 30)] },
  ];
}

const nowIso = () => new Date().toISOString();

export class SampleLibraryStore {
  private items = seed();
  private seq = 100;

  list(kind: LibraryKind, includeInactive: boolean): LibraryItem[] {
    return structuredClone(this.items.filter((item) => item.kind === kind && (includeInactive || item.isActive)));
  }

  private find(id: string) {
    const item = this.items.find((candidate) => candidate.id === id);
    if (!item) throw new ApiError("Not found.", 404, undefined, undefined, "NOT_FOUND");
    return item;
  }

  private check(kind: LibraryKind, input: LibraryVersionInput) {
    const errors: Array<{ code: string; path: string; message: string }> = [];
    if (!input.name.trim()) errors.push({ code: "REQUIRED", path: "name", message: "Nhập tên phiên bản." });
    const unknown = input.requiredCapabilities.filter((capability) => !runtimeCapabilities.includes(capability));
    if (unknown.length) errors.push({ code: "CAPABILITY_UNSUPPORTED", path: "requiredCapabilities", message: `Runtime chưa hỗ trợ: ${unknown.join(", ")}. Metadata mới không tự thêm khả năng cho runtime; cần phát triển ở Unity.` });
    if (kind === "Equipment" && input.requiredCapabilities.length === 0) errors.push({ code: "REQUIRED", path: "requiredCapabilities", message: "Thiết bị phải gắn ít nhất một khả năng runtime đã có." });
    if (errors.length) throw new ApiError("Invalid.", 422, undefined, undefined, "INVALID_CONTENT", errors);
  }

  async createItem(input: NewItemInput): Promise<LibraryItem> {
    await new Promise((resolve) => setTimeout(resolve, 300));
    if (!CODE_PATTERN.test(input.code)) throw new ApiError("Invalid.", 422, undefined, undefined, "INVALID_CONTENT", [{ code: "INVALID_CODE", path: "code", message: "Mã gồm 3–64 ký tự: chữ thường, số, gạch ngang hoặc gạch dưới." }]);
    if (this.items.some((item) => item.code === input.code)) throw new ApiError("Conflict.", 409, undefined, undefined, "LIBRARY_CODE_TAKEN", [{ code: "LIBRARY_CODE_TAKEN", path: "code", message: "Mã này đã tồn tại." }]);
    this.check(input.kind, input);
    this.seq += 1;
    const item: LibraryItem = { id: `li-${this.seq}`, kind: input.kind, code: input.code, isActive: true, versions: [{ id: `lv-${this.seq}-1`, versionNumber: 1, name: input.name.trim(), description: input.description.trim(), requiredCapabilities: input.requiredCapabilities, publishedAt: null, createdAt: nowIso() }] };
    this.items.push(item);
    return structuredClone(item);
  }

  async addVersion(itemId: string, input: LibraryVersionInput): Promise<LibraryItem> {
    await new Promise((resolve) => setTimeout(resolve, 300));
    const item = this.find(itemId);
    if (item.versions.some((candidate) => candidate.publishedAt === null)) throw new ApiError("Conflict.", 409, undefined, undefined, "LIBRARY_DRAFT_EXISTS");
    this.check(item.kind, input);
    this.seq += 1;
    const next = Math.max(...item.versions.map((candidate) => candidate.versionNumber)) + 1;
    item.versions.push({ id: `lv-${this.seq}`, versionNumber: next, name: input.name.trim(), description: input.description.trim(), requiredCapabilities: input.requiredCapabilities, publishedAt: null, createdAt: nowIso() });
    return structuredClone(item);
  }

  async publishVersion(itemId: string, versionId: string): Promise<LibraryItem> {
    await new Promise((resolve) => setTimeout(resolve, 300));
    const item = this.find(itemId);
    const target = item.versions.find((candidate) => candidate.id === versionId);
    if (!target) throw new ApiError("Not found.", 404, undefined, undefined, "NOT_FOUND");
    if (target.publishedAt) throw new ApiError("Conflict.", 409, undefined, undefined, "LIBRARY_VERSION_IMMUTABLE");
    target.publishedAt = nowIso();
    return structuredClone(item);
  }

  async setActive(itemId: string, isActive: boolean): Promise<LibraryItem> {
    await new Promise((resolve) => setTimeout(resolve, 300));
    const item = this.find(itemId);
    item.isActive = isActive;
    return structuredClone(item);
  }
}
