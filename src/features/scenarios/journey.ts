import type { Tone } from "@/components/ui/status-badge";
import { packageMissing, type PlaytestPackageState } from "@/features/playtest/use-playtest-package";

import { missingText, NO_DATA_TEXT, shortHash } from "./version-readiness";
import type { ScenarioDetail, ScenarioVersionSummary, VersionReadiness } from "./version-types";

/**
 * The create → publish journey as eight steps. Every step reads its own server field; a step the server did not report
 * says "Chưa có dữ liệu" and is never inferred from another step. The three gates (technical, approval, release) stay
 * separate: this is a map of where the work is, not a verdict.
 */
export type JourneyStepId = "draft" | "validate" | "snapshot" | "package" | "readiness" | "review" | "release" | "publish";

export type JourneyState = "done" | "active" | "todo" | "blocked" | "unknown";

/** Where the step's action lives: a tab of the versions page, the editor, or the snapshot drawer. */
export type JourneyTarget =
  | { kind: "tab"; tab: "build" | "readiness" | "review" | "release" | "playtest" }
  | { kind: "editor" }
  | { kind: "snapshot" };

export type JourneyStep = {
  id: JourneyStepId | "playtest";
  title: string;
  state: JourneyState;
  label: string;
  tone: Tone;
  detail: string;
  target: JourneyTarget;
  actionLabel: string;
  /** Never the "next step": the server keeps no record of it (draft validation) or it is an optional branch (playtest). */
  advisory?: boolean;
};

export type JourneyInput = {
  scenario?: ScenarioDetail;
  /** True once the version list was read successfully. */
  versionsLoaded: boolean;
  versionCount: number;
  version?: ScenarioVersionSummary;
  readiness?: VersionReadiness;
  /** True once releases were read successfully (list or detail), so "no release" is a server answer, not a guess. */
  releaseKnown: boolean;
  release?: { status: string; revokedReason?: string | null };
  playtestPackage?: PlaytestPackageState;
};

const NO_DATA_DETAIL = "Máy chủ chưa trả dữ liệu cho bước này. Tải lại trang; nếu vẫn thiếu, kiểm tra phiên bản triển khai của BE.";

const stateTone: Record<JourneyState, Tone> = { done: "success", active: "info", todo: "neutral", blocked: "danger", unknown: "pending" };

function step(id: JourneyStep["id"], title: string, target: JourneyTarget, actionLabel: string, state: JourneyState, label: string, detail: string, advisory = false): JourneyStep {
  return { id, title, state, label, tone: stateTone[state], detail, target, actionLabel, advisory };
}

const unknown = (id: JourneyStep["id"], title: string, target: JourneyTarget, actionLabel: string, detail = NO_DATA_DETAIL, advisory = false) =>
  step(id, title, target, actionLabel, "unknown", NO_DATA_TEXT, detail, advisory);

function needsVersion(id: JourneyStep["id"], title: string, target: JourneyTarget, actionLabel: string, input: JourneyInput) {
  return unknown(id, title, target, actionLabel, input.versionsLoaded && input.versionCount === 0 ? "Cần có phiên bản (snapshot) để máy chủ có dữ liệu cho bước này." : NO_DATA_DETAIL);
}

function playtestBranch(input: JourneyInput): JourneyStep {
  const target: JourneyTarget = { kind: "tab", tab: "playtest" };
  const state = input.playtestPackage;
  const make = (s: JourneyState, label: string, detail: string) => step("playtest", "Playtest (tùy chọn)", target, "Mở tab Playtest", s, label, detail, true);
  if (!input.version || !state || state.kind === "loading" || state.kind === "error") {
    return make("unknown", NO_DATA_TEXT, "Chưa đọc được trạng thái PlaytestPackage. Chạy thử trên Mobile là tùy chọn và không thay QA hay duyệt nội dung.");
  }
  if (state.kind === "succeeded" && state.qa === "passed") return make("done", "PlaytestPackage sẵn sàng", "Có thể tạo playtest và chuyển sang Mobile. Không thay QA hay duyệt nội dung.");
  const missing = packageMissing(state);
  if (state.kind === "none") return make("todo", "Chưa dựng PlaytestPackage", missing[0] ?? "Dựng package loại PlaytestPackage để chạy thử.");
  if (state.kind === "building" || (state.kind === "succeeded" && (state.qa === "checking" || state.qa === "none"))) return make("active", "Chờ package", missing[0] ?? "Đang chờ kết quả package.");
  return make("blocked", "Package chưa dùng được", missing[0] ?? "Xem tab Package build.");
}

/** Builds the eight journey steps plus the optional playtest branch (placed right after "Build package"). */
export function buildJourney(input: JourneyInput): JourneyStep[] {
  const { scenario, version, readiness } = input;
  const editor: JourneyTarget = { kind: "editor" };

  // 1. Draft: scenario detail (draftCount) is the only server record.
  let draft: JourneyStep;
  if (!scenario || scenario.draftCount === undefined) draft = unknown("draft", "Lưu draft", editor, "Mở trình soạn", "Máy chủ chưa báo số draft của kịch bản. Mở trình soạn để lưu hoặc xem draft.");
  else if (scenario.draftCount > 0) draft = step("draft", "Lưu draft", editor, "Mở trình soạn", "done", "Đã có draft", `${scenario.draftCount} draft${scenario.currentDraftVersion != null ? `, bản lưu mới nhất ở phiên bản draft ${scenario.currentDraftVersion}` : ""}.`);
  else draft = step("draft", "Lưu draft", editor, "Mở trình soạn", "todo", "Chưa có draft", "Mở trình soạn kịch bản, đặt điểm xuất phát, mối nguy hiểm và rubric rồi lưu draft.");

  // 2. Validate: the server never stores a draft validation result, so this is explicitly "no data".
  const validate = unknown("validate", "Kiểm tra", editor, "Kiểm tra trong trình soạn", "Máy chủ không lưu kết quả kiểm tra draft. Chạy kiểm tra trong trình soạn hoặc khi tạo snapshot; kết quả không được đọc lại từ đây.", true);

  // 3. Snapshot: the version list.
  let snapshot: JourneyStep;
  const snapshotTarget: JourneyTarget = { kind: "snapshot" };
  if (!input.versionsLoaded) snapshot = unknown("snapshot", "Snapshot", snapshotTarget, "Tạo snapshot");
  else if (version) snapshot = step("snapshot", "Snapshot", snapshotTarget, "Tạo snapshot mới", "done", `Đã có v${version.versionNumber}`, `Phiên bản bất biến #${shortHash(version.scenarioHash, 10)}. Sửa nội dung sẽ tạo phiên bản mới.`);
  else if (input.versionCount > 0) snapshot = step("snapshot", "Snapshot", snapshotTarget, "Tạo snapshot mới", "done", `Có ${input.versionCount} phiên bản`, "Chọn một phiên bản ở danh sách để xem các bước còn lại.");
  else snapshot = step("snapshot", "Snapshot", snapshotTarget, "Tạo snapshot", "todo", "Chưa có phiên bản", "Tạo snapshot từ draft để có phiên bản bất biến đầu tiên.");

  // 4. Package build: the package job the server reports for this version.
  const pkgTarget: JourneyTarget = { kind: "tab", tab: "build" };
  let pkg: JourneyStep;
  if (!version) pkg = needsVersion("package", "Build package", pkgTarget, "Mở Package build", input);
  else if (!readiness) pkg = unknown("package", "Build package", pkgTarget, "Mở Package build");
  else if (!readiness.packageJob) pkg = step("package", "Build package", pkgTarget, "Mở Package build", "todo", "Chưa dựng package", "Chạy package build để có kết quả QA kỹ thuật.");
  else {
    const status = readiness.packageJob.status.toLowerCase();
    if (status === "succeeded") pkg = step("package", "Build package", pkgTarget, "Mở Package build", "done", "Job Succeeded", "Job xong chưa phải QA Passed: xem bước Readiness kỹ thuật.");
    else if (status === "failed" || status === "cancelled" || status === "canceled") pkg = step("package", "Build package", pkgTarget, "Xem job và chạy lại", "blocked", status === "failed" ? "Job thất bại" : "Job đã hủy", "Xem nguyên nhân ở tab Package build rồi chạy lại.");
    else pkg = step("package", "Build package", pkgTarget, "Theo dõi job", "active", status === "queued" ? "Đang chờ" : "Đang chạy", "Job đang xử lý; chưa có kết quả QA.");
  }

  // 5. Technical readiness: only what the readiness endpoint says.
  const readyTarget: JourneyTarget = { kind: "tab", tab: "readiness" };
  let ready: JourneyStep;
  if (!version) ready = needsVersion("readiness", "Readiness kỹ thuật", readyTarget, "Mở Kết quả kỹ thuật", input);
  else if (!readiness) ready = unknown("readiness", "Readiness kỹ thuật", readyTarget, "Mở Kết quả kỹ thuật");
  else if (readiness.technicalReady) ready = step("readiness", "Readiness kỹ thuật", readyTarget, "Mở Kết quả kỹ thuật", "done", "Sẵn sàng kỹ thuật", "QA đạt và đã xác nhận kỹ thuật. Không thay duyệt nội dung.");
  else if (readiness.outcome && (readiness.outcome.toLowerCase() !== "passed" || readiness.blockerCount > 0)) ready = step("readiness", "Readiness kỹ thuật", readyTarget, "Xem lỗi QA", "blocked", "QA không đạt", readiness.blockerCount > 0 ? `${readiness.blockerCount} issue Error/Critical đang chặn.` : "Validation run không Passed.");
  else if (readiness.outcome) ready = step("readiness", "Readiness kỹ thuật", readyTarget, "Xác nhận kỹ thuật", "active", "QA đạt, chờ xác nhận", readiness.missing.length ? readiness.missing.map(missingText).join(" ") : "Cần xác nhận kỹ thuật.");
  else ready = step("readiness", "Readiness kỹ thuật", readyTarget, "Mở Kết quả kỹ thuật", "todo", "Chưa có kết quả QA", readiness.missing.length ? readiness.missing.map(missingText).join(" ") : "Chưa có validation run.");

  // 6. Content review: the version's own reviewStatus.
  const reviewTarget: JourneyTarget = { kind: "tab", tab: "review" };
  let review: JourneyStep;
  if (!version) review = needsVersion("review", "Gửi duyệt", reviewTarget, "Mở Gửi duyệt", input);
  else if (!version.reviewStatus) review = unknown("review", "Gửi duyệt", reviewTarget, "Mở Gửi duyệt");
  else {
    const status = version.reviewStatus.toLowerCase();
    if (status === "approved") review = step("review", "Gửi duyệt", reviewTarget, "Xem duyệt", "done", "Đã duyệt", "PlatformAdmin đã duyệt đúng hash nội dung và rubric.");
    else if (status === "submitted") review = step("review", "Gửi duyệt", reviewTarget, "Xem duyệt", "active", "Chờ duyệt", "Đã gửi, đang chờ PlatformAdmin.");
    else if (status === "rejected") review = step("review", "Gửi duyệt", reviewTarget, "Xem lý do", "blocked", "Bị từ chối", version.rejectReason ? `Lý do: ${version.rejectReason}` : "Sửa nội dung sẽ tạo phiên bản mới.");
    else if (status === "notsubmitted") review = step("review", "Gửi duyệt", reviewTarget, "Gửi duyệt", "todo", "Chưa gửi duyệt", "Gửi duyệt để PlatformAdmin duyệt nội dung và rubric.");
    else review = step("review", "Gửi duyệt", reviewTarget, "Mở Gửi duyệt", "active", version.reviewStatus, "Trạng thái duyệt do máy chủ báo.");
  }

  // 7 and 8. Release: the release the server lists/returns for this version.
  const releaseTarget: JourneyTarget = { kind: "tab", tab: "release" };
  const releaseStatus = input.release?.status.toLowerCase();
  let create: JourneyStep;
  let publish: JourneyStep;
  if (!version) {
    create = needsVersion("release", "Tạo release", releaseTarget, "Mở Release", input);
    publish = needsVersion("publish", "Phát hành", releaseTarget, "Mở Release", input);
  } else if (!input.releaseKnown) {
    create = unknown("release", "Tạo release", releaseTarget, "Mở Release");
    publish = unknown("publish", "Phát hành", releaseTarget, "Mở Release");
  } else if (!input.release) {
    create = step("release", "Tạo release", releaseTarget, "Mở Release", "todo", "Chưa có release", "Release cần nội dung đã duyệt và xác nhận kỹ thuật.");
    publish = step("publish", "Phát hành", releaseTarget, "Mở Release", "todo", "Chưa phát hành", "Phát hành chỉ làm được với release ở trạng thái Built.");
  } else {
    create = step("release", "Tạo release", releaseTarget, "Mở Release", "done", `Release ${input.release.status}`, "Đã có release cho phiên bản này.");
    if (releaseStatus === "published") publish = step("publish", "Phát hành", releaseTarget, "Mở Release", "done", "Đã phát hành", "Release Published.");
    else if (releaseStatus === "revoked") publish = step("publish", "Phát hành", releaseTarget, "Mở Release", "blocked", "Đã thu hồi", input.release.revokedReason ? `Lý do: ${input.release.revokedReason}` : "Release đã bị thu hồi.");
    else publish = step("publish", "Phát hành", releaseTarget, "Mở Release", "todo", "Built, chưa phát hành", "Built chỉ là gói đã dựng; phát hành còn qua cổng kiểm tra duyệt, readiness và quyền dịch vụ.");
  }

  return [draft, validate, snapshot, pkg, playtestBranch(input), ready, review, create, publish].sort((a, b) => order(a) - order(b));
}

const ORDER: Record<JourneyStep["id"], number> = { draft: 1, validate: 2, snapshot: 3, package: 4, playtest: 4.5, readiness: 5, review: 6, release: 7, publish: 8 };
const order = (item: JourneyStep) => ORDER[item.id];

/** The first main step that is not done: highlighted as "next". Advisory steps never count. Null when everything is done. */
export function nextJourneyStep(steps: JourneyStep[]): JourneyStep | null {
  return steps.find((item) => !item.advisory && item.state !== "done") ?? null;
}
