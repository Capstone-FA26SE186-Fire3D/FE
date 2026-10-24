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

const NO_DATA_DETAIL = "Chưa đọc được trạng thái bước này. Tải lại trang; nếu vẫn thiếu, liên hệ hỗ trợ.";

const stateTone: Record<JourneyState, Tone> = { done: "success", active: "info", todo: "neutral", blocked: "danger", unknown: "pending" };

function step(id: JourneyStep["id"], title: string, target: JourneyTarget, actionLabel: string, state: JourneyState, label: string, detail: string, advisory = false): JourneyStep {
  return { id, title, state, label, tone: stateTone[state], detail, target, actionLabel, advisory };
}

const unknown = (id: JourneyStep["id"], title: string, target: JourneyTarget, actionLabel: string, detail = NO_DATA_DETAIL, advisory = false) =>
  step(id, title, target, actionLabel, "unknown", NO_DATA_TEXT, detail, advisory);

function needsVersion(id: JourneyStep["id"], title: string, target: JourneyTarget, actionLabel: string, input: JourneyInput) {
  return unknown(id, title, target, actionLabel, input.versionsLoaded && input.versionCount === 0 ? "Cần tạo phiên bản trước." : NO_DATA_DETAIL);
}

function playtestBranch(input: JourneyInput): JourneyStep {
  const target: JourneyTarget = { kind: "tab", tab: "playtest" };
  const state = input.playtestPackage;
  const make = (s: JourneyState, label: string, detail: string) => step("playtest", "Chạy thử (tùy chọn)", target, "Mở Chạy thử", s, label, detail, true);
  if (!input.version || !state || state.kind === "loading" || state.kind === "error") {
    return make("unknown", NO_DATA_TEXT, "Chưa đọc được trạng thái gói chạy thử. Chạy thử trên điện thoại là tùy chọn.");
  }
  if (state.kind === "succeeded" && state.qa === "passed") return make("done", "Gói chạy thử sẵn sàng", "Có thể mở chạy thử trên điện thoại. Việc này không thay kiểm tra hay duyệt nội dung.");
  const missing = packageMissing(state);
  if (state.kind === "none") return make("todo", "Chưa dựng gói chạy thử", missing[0] ?? "Dựng loại gói chạy thử ở tab Dựng gói.");
  if (state.kind === "building" || (state.kind === "succeeded" && (state.qa === "checking" || state.qa === "none"))) return make("active", "Đang chờ gói", missing[0] ?? "Đang chờ gói chạy thử.");
  return make("blocked", "Gói chưa dùng được", missing[0] ?? "Xem tab Dựng gói.");
}

/** Builds the eight journey steps plus the optional playtest branch (placed right after "Build package"). */
export function buildJourney(input: JourneyInput): JourneyStep[] {
  const { scenario, version, readiness } = input;
  const editor: JourneyTarget = { kind: "editor" };

  // 1. Draft: scenario detail (draftCount) is the only server record.
  let draft: JourneyStep;
  if (!scenario || scenario.draftCount === undefined) draft = unknown("draft", "Lưu bản nháp", editor, "Mở trình soạn", "Chưa đọc được số bản nháp. Mở trình soạn để lưu hoặc xem.");
  else if (scenario.draftCount > 0) draft = step("draft", "Lưu bản nháp", editor, "Mở trình soạn", "done", "Đã có bản nháp", `${scenario.draftCount} bản nháp đã lưu.`);
  else draft = step("draft", "Lưu bản nháp", editor, "Mở trình soạn", "todo", "Chưa có bản nháp", "Mở trình soạn, đặt điểm xuất phát, nguy cơ, tiêu chí chấm rồi lưu.");

  // 2. Validate: the server never stores a draft validation result, so this is explicitly "no data".
  const validate = unknown("validate", "Kiểm tra bản nháp", editor, "Kiểm tra trong trình soạn", "Kết quả kiểm tra bản nháp không được lưu lại. Bấm Kiểm tra trong trình soạn trước khi tạo phiên bản.", true);

  // 3. Snapshot: the version list.
  let snapshot: JourneyStep;
  const snapshotTarget: JourneyTarget = { kind: "snapshot" };
  if (!input.versionsLoaded) snapshot = unknown("snapshot", "Tạo phiên bản", snapshotTarget, "Tạo phiên bản");
  else if (version) snapshot = step("snapshot", "Tạo phiên bản", snapshotTarget, "Tạo phiên bản mới", "done", `Đã có v${version.versionNumber}`, `Nội dung v${version.versionNumber} đã khóa (mã #${shortHash(version.scenarioHash, 8)}). Sửa nội dung sẽ tạo phiên bản mới.`);
  else if (input.versionCount > 0) snapshot = step("snapshot", "Tạo phiên bản", snapshotTarget, "Tạo phiên bản mới", "done", `Có ${input.versionCount} phiên bản`, "Chọn một phiên bản ở danh sách để xem các bước còn lại.");
  else snapshot = step("snapshot", "Tạo phiên bản", snapshotTarget, "Tạo phiên bản", "todo", "Chưa có phiên bản", "Tạo phiên bản từ bản nháp để khóa nội dung lần đầu.");

  // 4. Package build: the package job the server reports for this version.
  const pkgTarget: JourneyTarget = { kind: "tab", tab: "build" };
  let pkg: JourneyStep;
  if (!version) pkg = needsVersion("package", "Dựng gói", pkgTarget, "Mở Dựng gói", input);
  else if (!readiness) pkg = unknown("package", "Dựng gói", pkgTarget, "Mở Dựng gói");
  else if (!readiness.packageJob) pkg = step("package", "Dựng gói", pkgTarget, "Mở Dựng gói", "todo", "Chưa dựng gói", "Dựng gói để ứng dụng Android tải về; hệ thống sẽ tự kiểm tra gói.");
  else {
    const status = readiness.packageJob.status.toLowerCase();
    if (status === "succeeded") pkg = step("package", "Dựng gói", pkgTarget, "Mở Dựng gói", "done", "Dựng xong", "Gói đã dựng; xem kết quả kiểm tra ở bước sau.");
    else if (status === "failed" || status === "cancelled" || status === "canceled") pkg = step("package", "Dựng gói", pkgTarget, "Xem và dựng lại", "blocked", status === "failed" ? "Dựng lỗi" : "Đã hủy", "Xem ở tab Dựng gói rồi dựng lại.");
    else pkg = step("package", "Dựng gói", pkgTarget, "Xem tiến trình", "active", status === "queued" ? "Chờ máy dựng" : "Đang dựng", "Máy dựng đang xử lý; chưa có kết quả kiểm tra.");
  }

  // 5. Technical readiness: only what the readiness endpoint says.
  const readyTarget: JourneyTarget = { kind: "tab", tab: "readiness" };
  let ready: JourneyStep;
  if (!version) ready = needsVersion("readiness", "Kiểm tra và chốt gói", readyTarget, "Mở Kiểm tra", input);
  else if (!readiness) ready = unknown("readiness", "Kiểm tra và chốt gói", readyTarget, "Mở Kiểm tra");
  else if (readiness.technicalReady) ready = step("readiness", "Kiểm tra và chốt gói", readyTarget, "Mở Kiểm tra", "done", "Đã chốt gói", "Kiểm tra đạt và gói đã chốt để phát hành.");
  else if (readiness.outcome && (readiness.outcome.toLowerCase() !== "passed" || readiness.blockerCount > 0)) ready = step("readiness", "Kiểm tra và chốt gói", readyTarget, "Xem lỗi", "blocked", "Kiểm tra không đạt", readiness.blockerCount > 0 ? `Có ${readiness.blockerCount} lỗi chặn.` : "Lần kiểm tra mới nhất không đạt.");
  else if (readiness.outcome) ready = step("readiness", "Kiểm tra và chốt gói", readyTarget, "Chốt gói phát hành", "active", "Kiểm tra đạt, chờ chốt", readiness.missing.length ? readiness.missing.map(missingText).join(" ") : "Bấm Chốt gói phát hành ở tab Kiểm tra.");
  else ready = step("readiness", "Kiểm tra và chốt gói", readyTarget, "Mở Kiểm tra", "todo", "Chưa có kết quả kiểm tra", readiness.missing.length ? readiness.missing.map(missingText).join(" ") : "Chưa có lần kiểm tra nào.");

  // 6. Content review: the version's own reviewStatus.
  const reviewTarget: JourneyTarget = { kind: "tab", tab: "review" };
  let review: JourneyStep;
  if (!version) review = needsVersion("review", "Gửi duyệt", reviewTarget, "Mở Gửi duyệt", input);
  else if (!version.reviewStatus) review = unknown("review", "Gửi duyệt", reviewTarget, "Mở Gửi duyệt");
  else {
    const status = version.reviewStatus.toLowerCase();
    if (status === "approved") review = step("review", "Gửi duyệt", reviewTarget, "Xem duyệt", "done", "Đã duyệt", "Quản trị FET3D đã duyệt nội dung và tiêu chí chấm.");
    else if (status === "submitted") review = step("review", "Gửi duyệt", reviewTarget, "Xem duyệt", "active", "Chờ duyệt", "Đã gửi, đang chờ quản trị FET3D.");
    else if (status === "rejected") review = step("review", "Gửi duyệt", reviewTarget, "Xem lý do", "blocked", "Bị từ chối", version.rejectReason ? `Lý do: ${version.rejectReason}` : "Sửa nội dung sẽ tạo phiên bản mới.");
    else if (status === "notsubmitted") review = step("review", "Gửi duyệt", reviewTarget, "Gửi duyệt", "todo", "Chưa gửi duyệt", "Gửi để quản trị FET3D duyệt nội dung và tiêu chí chấm.");
    else review = step("review", "Gửi duyệt", reviewTarget, "Mở Gửi duyệt", "active", version.reviewStatus, "Trạng thái duyệt do hệ thống báo.");
  }

  // 7 and 8. Release: the release the server lists/returns for this version.
  const releaseTarget: JourneyTarget = { kind: "tab", tab: "release" };
  const releaseStatus = input.release?.status.toLowerCase();
  let create: JourneyStep;
  let publish: JourneyStep;
  if (!version) {
    create = needsVersion("release", "Tạo bản phát hành", releaseTarget, "Mở Phát hành", input);
    publish = needsVersion("publish", "Phát hành", releaseTarget, "Mở Phát hành", input);
  } else if (!input.releaseKnown) {
    create = unknown("release", "Tạo bản phát hành", releaseTarget, "Mở Phát hành");
    publish = unknown("publish", "Phát hành", releaseTarget, "Mở Phát hành");
  } else if (!input.release) {
    create = step("release", "Tạo bản phát hành", releaseTarget, "Mở Phát hành", "todo", "Chưa có bản phát hành", "Cần nội dung đã duyệt và gói đã chốt.");
    publish = step("publish", "Phát hành", releaseTarget, "Mở Phát hành", "todo", "Chưa phát hành", "Phát hành sau khi đã tạo bản phát hành.");
  } else {
    create = step("release", "Tạo bản phát hành", releaseTarget, "Mở Phát hành", "done", "Đã tạo", "Đã có bản phát hành cho phiên bản này.");
    if (releaseStatus === "published") publish = step("publish", "Phát hành", releaseTarget, "Mở Phát hành", "done", "Đã phát hành", "Học viên đã dùng được.");
    else if (releaseStatus === "revoked") publish = step("publish", "Phát hành", releaseTarget, "Mở Phát hành", "blocked", "Đã thu hồi", input.release.revokedReason ? `Lý do: ${input.release.revokedReason}` : "Bản phát hành đã bị thu hồi.");
    else publish = step("publish", "Phát hành", releaseTarget, "Mở Phát hành", "todo", "Đã tạo, chưa phát hành", "Học viên chưa dùng được. Bấm Phát hành; hệ thống kiểm tra lại duyệt, gói và dịch vụ của công trình.");
  }

  return [draft, validate, snapshot, pkg, playtestBranch(input), ready, review, create, publish].sort((a, b) => order(a) - order(b));
}

const ORDER: Record<JourneyStep["id"], number> = { draft: 1, validate: 2, snapshot: 3, package: 4, playtest: 4.5, readiness: 5, review: 6, release: 7, publish: 8 };
const order = (item: JourneyStep) => ORDER[item.id];

/** The first main step that is not done: highlighted as "next". Advisory steps never count. Null when everything is done. */
export function nextJourneyStep(steps: JourneyStep[]): JourneyStep | null {
  return steps.find((item) => !item.advisory && item.state !== "done") ?? null;
}
