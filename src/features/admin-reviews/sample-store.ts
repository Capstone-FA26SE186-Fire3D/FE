/*
 * SAMPLE DATA — development prototype only. Imported exclusively by the dynamically-loaded prototype chunk,
 * so it never ships in a production build. The store imitates the (not yet existing) read side of BE#52 and
 * the real behavior of the approve/reject commands (hash check, pending check, idempotency receipts).
 */
import { ApiError } from "@/api/types/common";
import { normalizeDecisionInput } from "./api";
import type { ContentReviewDecision, ContentReviewDecisionRequest, ReviewAction, ReviewDetail, ReviewFilters, ReviewStatus, ReviewSummary } from "./types";

/** Deterministic fake 64-hex digest (NOT a real SHA-256) so sample hashes look right and stay stable. */
export function sampleHash(seed: string): string {
  let a = 0x811c9dc5;
  let out = "";
  for (let round = 0; out.length < 64; round += 1) {
    for (let index = 0; index < seed.length; index += 1) { a ^= seed.charCodeAt(index) + round; a = Math.imul(a, 0x01000193) >>> 0; }
    out += a.toString(16).padStart(8, "0");
  }
  return out.slice(0, 64);
}

export const sampleOrganizations = [
  { id: "org-lequydon", name: "Trường THPT Lê Quý Đôn (mẫu)" },
  { id: "org-saomai", name: "Công ty CP Sao Mai (mẫu)" },
  { id: "org-anphuoc", name: "Bệnh viện Đa khoa An Phước (mẫu)" },
];

type Seed = { name: string; org: string; building: string; version: number; status: ReviewStatus; daysAgo: number; ready: boolean; reason?: string; hazards: number };

const seeds: Seed[] = [
  { name: "Sơ tán giờ ra chơi — khối nhà A", org: "org-lequydon", building: "Nhà A (4 tầng)", version: 2, status: "Submitted", daysAgo: 0, ready: true, hazards: 3 },
  { name: "Cháy phòng thí nghiệm hóa", org: "org-lequydon", building: "Nhà thực hành", version: 1, status: "Submitted", daysAgo: 1, ready: false, hazards: 4 },
  { name: "Cháy kho hàng giờ cao điểm", org: "org-saomai", building: "Kho trung tâm", version: 3, status: "Submitted", daysAgo: 1, ready: true, hazards: 5 },
  { name: "Mất điện và khói tại cầu thang bộ", org: "org-saomai", building: "Tòa văn phòng B", version: 1, status: "Submitted", daysAgo: 2, ready: true, hazards: 2 },
  { name: "Sơ tán khoa nội trú ban đêm", org: "org-anphuoc", building: "Khối nội trú", version: 1, status: "Submitted", daysAgo: 3, ready: false, hazards: 3 },
  { name: "Cháy bếp ăn tập thể", org: "org-saomai", building: "Nhà ăn công nhân", version: 2, status: "Approved", daysAgo: 5, ready: true, hazards: 2 },
  { name: "Sơ tán sảnh chờ khám bệnh", org: "org-anphuoc", building: "Khu khám ngoại trú", version: 2, status: "Approved", daysAgo: 6, ready: true, hazards: 3 },
  { name: "Tập huấn dùng bình chữa cháy", org: "org-lequydon", building: "Nhà A (4 tầng)", version: 1, status: "Rejected", daysAgo: 7, ready: true, hazards: 2, reason: "Rubric chưa có tiêu chí thời gian phản ứng và mục tiêu học tập còn chung chung. Bổ sung rồi tạo phiên bản mới." },
  { name: "Cháy tầng hầm để xe", org: "org-saomai", building: "Tòa văn phòng B", version: 2, status: "Rejected", daysAgo: 9, ready: false, hazards: 3, reason: "Hướng dẫn cho học viên khuyến khích quay lại lấy xe; cần loại bỏ bước này." },
  { name: "Sơ tán lớp học tầng 3", org: "org-lequydon", building: "Nhà A (4 tầng)", version: 3, status: "Approved", daysAgo: 12, ready: true, hazards: 2 },
  { name: "Cháy phòng máy chủ", org: "org-saomai", building: "Tòa văn phòng B", version: 1, status: "Submitted", daysAgo: 4, ready: true, hazards: 3 },
  { name: "Sơ tán phòng mổ", org: "org-anphuoc", building: "Khối phẫu thuật", version: 1, status: "Submitted", daysAgo: 5, ready: true, hazards: 4 },
  { name: "Cháy nhà xe sinh viên", org: "org-lequydon", building: "Bãi xe", version: 1, status: "Approved", daysAgo: 14, ready: true, hazards: 2 },
  { name: "Khói lan hành lang khu hành chính", org: "org-anphuoc", building: "Khu hành chính", version: 2, status: "Submitted", daysAgo: 6, ready: false, hazards: 3 },
];

const hazardTypes = ["Fire", "Smoke", "BlockedExit", "ElectricalFault", "GasLeak"];
const orgName = (id: string) => sampleOrganizations.find((org) => org.id === id)?.name ?? id;
const iso = (daysAgo: number, hour = 9) => new Date(Date.UTC(2026, 9, 10 - daysAgo, hour, 15)).toISOString();

function buildDetail(seed: Seed, index: number): ReviewDetail {
  const id = `sample-${index + 1}`;
  const content = `${seed.name}|${seed.version}|content`;
  const rubric = `${seed.name}|${seed.version}|rubric`;
  const decided = seed.status !== "Submitted";
  return {
    reviewId: `review-${id}`,
    versionId: `version-${id}`,
    scenarioName: seed.name,
    versionNumber: seed.version,
    organizationId: seed.org,
    organizationName: orgName(seed.org),
    buildingName: seed.building,
    status: seed.status,
    submittedAt: iso(seed.daysAgo + (decided ? 1 : 0)),
    submittedBy: "Người soạn kịch bản (mẫu)",
    decidedAt: decided ? iso(seed.daysAgo, 14) : null,
    decidedBy: decided ? "Platform Admin (mẫu)" : null,
    readinessReady: seed.ready,
    contentHash: sampleHash(content),
    rubricHash: sampleHash(rubric),
    reason: seed.reason ?? null,
    objectives: [
      "Nhận biết tín hiệu báo cháy và quyết định sơ tán ngay.",
      "Chọn đường thoát nạn không đi qua khu vực có khói.",
      "Hỗ trợ người di chuyển chậm mà không quay lại vùng nguy hiểm.",
    ],
    learnerInstructions: "Bạn đang ở khu vực làm việc khi chuông báo cháy vang lên. Quan sát môi trường, chọn lối thoát an toàn gần nhất và tập trung tại điểm tập kết. Không dùng thang máy.",
    hazards: Array.from({ length: seed.hazards }, (_, hazard) => ({ id: `hz-${hazard + 1}`, type: hazardTypes[(index + hazard) % hazardTypes.length], intensity: Math.round((0.35 + ((index + hazard) % 5) * 0.12) * 100) / 100, activationSeconds: 10 + hazard * 25 })),
    scoring: { baseScore: 100, timeLimitSeconds: 240 + (index % 3) * 60, penaltyPerMistake: 5 + (index % 3) * 2 },
    routes: ["Cầu thang bộ trục A", "Cầu thang thoát hiểm phía Đông"],
    requiredCapabilities: ["movement.walk", "door.open", index % 2 === 0 ? "extinguisher.use" : "assist.person"],
    rubric: [
      { name: "Thời gian phản ứng", weight: 30, description: "Bắt đầu di chuyển trong 15 giây sau tín hiệu báo cháy." },
      { name: "Chọn lối thoát an toàn", weight: 40, description: "Không đi qua khu vực khói dày hoặc lối bị chặn." },
      { name: "Hành vi an toàn", weight: 20, description: "Không dùng thang máy, không quay lại lấy đồ." },
      { name: "Hỗ trợ người khác", weight: 10, description: "Hỗ trợ người di chuyển chậm khi điều kiện cho phép." },
    ],
    readiness: { validationOutcome: seed.ready ? "Passed" : index % 2 ? "Failed" : "NotRun", blockingIssues: seed.ready ? 0 : 2, confirmForTraining: seed.ready, runtimeReady: seed.ready },
  };
}

const toSummary = ({ reviewId, versionId, scenarioName, versionNumber, organizationId, organizationName, buildingName, status, submittedAt, submittedBy, decidedAt, decidedBy, readinessReady }: ReviewDetail): ReviewSummary =>
  ({ reviewId, versionId, scenarioName, versionNumber, organizationId, organizationName, buildingName, status, submittedAt, submittedBy, decidedAt, decidedBy, readinessReady });

/** Failure injection for reviewing error states: a lost response, or the server reporting changed content. */
export type DecideSimulation = { networkFailure?: boolean; hashMismatch?: boolean };

export class SampleReviewStore {
  private details = new Map<string, ReviewDetail>();
  private receipts = new Map<string, { fingerprint: string; result: ContentReviewDecision }>();
  constructor() {
    seeds.forEach((seed, index) => { const detail = buildDetail(seed, index); this.details.set(detail.versionId, detail); });
  }

  list(filters: ReviewFilters): { items: ReviewSummary[]; totalCount: number; page: number; pageSize: number } {
    const all = [...this.details.values()]
      .filter((item) => (!filters.status || item.status === filters.status) && (!filters.organizationId || item.organizationId === filters.organizationId))
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
    const start = (filters.page - 1) * filters.pageSize;
    return { items: all.slice(start, start + filters.pageSize).map(toSummary), totalCount: all.length, page: filters.page, pageSize: filters.pageSize };
  }

  get(versionId: string): ReviewDetail | undefined {
    const detail = this.details.get(versionId);
    return detail ? structuredClone(detail) : undefined;
  }

  pendingCount() {
    return [...this.details.values()].filter((item) => item.status === "Submitted").length;
  }

  /** Mirrors the real command: validation → ownership → idempotency receipt → pending → hash match → write. */
  async decide(action: ReviewAction, versionId: string, input: ContentReviewDecisionRequest, idempotencyKey: string, simulate: DecideSimulation = {}): Promise<ContentReviewDecision> {
    await new Promise((resolve) => setTimeout(resolve, 420));
    if (simulate.networkFailure) {
      throw new TypeError("Failed to fetch (mô phỏng mất kết nối)");
    }
    if (!idempotencyKey) throw new ApiError("Idempotency-Key is required.", 400, undefined, undefined, "IDEMPOTENCY_KEY_REQUIRED");
    const body = normalizeDecisionInput(action, input);
    const reason = body.reason ?? "";
    if (action === "reject" && (reason.length < 1 || reason.length > 4000)) {
      throw new ApiError("Review validation failed.", 400, undefined, undefined, "VALIDATION_ERROR", [{ code: "VALIDATION_ERROR", path: "reason", message: "A rejection reason of 1-4000 characters is required." }]);
    }
    const detail = this.details.get(versionId);
    if (!detail) throw new ApiError("Not found.", 404, undefined, undefined, "NOT_FOUND");
    const fingerprint = JSON.stringify({ action, versionId, body });
    const receipt = this.receipts.get(`${action}:${idempotencyKey}`);
    if (receipt) {
      if (receipt.fingerprint !== fingerprint) throw new ApiError("Conflict.", 409, undefined, undefined, "IDEMPOTENCY_KEY_CONFLICT");
      return receipt.result;
    }
    if (detail.status !== "Submitted") throw new ApiError("Conflict.", 409, undefined, undefined, "CONTENT_REVIEW_NOT_PENDING");
    if (simulate.hashMismatch || body.contentHash !== detail.contentHash || body.rubricHash !== detail.rubricHash) {
      throw new ApiError("Conflict.", 409, undefined, undefined, "CONTENT_HASH_MISMATCH");
    }
    detail.status = action === "approve" ? "Approved" : "Rejected";
    detail.reason = action === "reject" ? reason : null;
    detail.decidedAt = new Date().toISOString();
    detail.decidedBy = "Platform Admin (mẫu)";
    const result: ContentReviewDecision = { code: "OK", reviewId: detail.reviewId, status: detail.status, contentHash: detail.contentHash, rubricHash: detail.rubricHash };
    this.receipts.set(`${action}:${idempotencyKey}`, { fingerprint, result });
    return result;
  }
}
