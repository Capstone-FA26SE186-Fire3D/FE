import type { Tone } from "@/components/ui/status-badge";
import type { ServiceState } from "@/features/billing/entitlements";
import { revisionLabel } from "./pipeline";
import type { Building, BuildingRevision } from "./types";

/**
 * The building journey: Thông tin → IFC → kịch bản → phiên bản → chuẩn bị phát hành → quản lý sử dụng.
 * Every state is derived from a field the BE returns (revision status, scenario draftCount, version reviewStatus,
 * release status, entitlement); a step never unlocks from a guess. The backend re-checks every gate anyway.
 */
export type JourneyStepKey = "info" | "ifc" | "scenario" | "version" | "release" | "usage";
export type JourneyStepState = "done" | "current" | "locked";

export type JourneyStepModel = {
  key: JourneyStepKey;
  index: number;
  title: string;
  state: JourneyStepState;
  /** One line under the title: what is true now (done/current) or why it is locked. */
  detail: string;
  /** Present only when `state === "locked"`. */
  lockReason?: string;
};

export type JourneyScenarioFacts = {
  id: string;
  name: string;
  /** From `GET /api/scenarios/{id}`; undefined while unknown. */
  draftCount?: number;
  versionNumber?: number | null;
  /** Review state of the newest version, as the server reports it. */
  reviewStatus?: string | null;
  rejectReason?: string | null;
};

export type JourneyInput = {
  building: Building;
  revision: BuildingRevision | null;
  scenarioCount: number | undefined;
  scenario: JourneyScenarioFacts | null;
  /** Newest release of the building (status `Built | Published | Revoked`), null when none. */
  releaseStatus: string | null;
  service: ServiceState | undefined;
};

export type JourneyCondition = { key: "technical" | "content" | "service"; title: string; description: string; label: string; tone: Tone };

const IFC_READY = ["ReadyForScenario", "ConfirmedForTraining"];

export const isIfcReady = (revision: BuildingRevision | null) => Boolean(revision && IFC_READY.includes(revision.status));
const isApproved = (input: JourneyInput) => input.scenario?.reviewStatus?.toLowerCase() === "approved";
const isPublished = (input: JourneyInput) => input.releaseStatus?.toLowerCase() === "published";
const hasDraft = (input: JourneyInput) => (input.scenario?.draftCount ?? 0) > 0 || input.scenario?.versionNumber != null;
const hasVersion = (input: JourneyInput) => input.scenario?.versionNumber != null;

export function buildJourney(input: JourneyInput): JourneyStepModel[] {
  const { building, revision, scenario } = input;
  const ifcReady = isIfcReady(revision);
  const address = [building.location?.address, building.location?.district, building.location?.city].filter(Boolean).join(", ");

  type Draft = Omit<JourneyStepModel, "state" | "index"> & { done: boolean; lockReason?: string };
  const drafts: Draft[] = [
    {
      key: "info", title: "Thông tin", done: true, detail: `${address || "Chưa nhập địa chỉ"} · ${building.totalFloors} tầng`,
    },
    {
      key: "ifc", title: "IFC và xử lý", done: ifcReady,
      detail: revision ? `${revision.versionLabel} · ${revisionLabel(revision.status).label}` : "Chưa có mô hình IFC. Tải lên tệp IFC đầu tiên.",
    },
    {
      key: "scenario", title: "Soạn kịch bản", done: hasDraft(input), lockReason: ifcReady ? undefined : "Cần mô hình IFC sẵn sàng trước",
      detail: scenario ? `${scenario.name}${scenario.draftCount !== undefined ? ` · ${scenario.draftCount} bản nháp` : ""}` : input.scenarioCount === 0 ? "Chưa có kịch bản" : "Mở trình soạn để lưu bản nháp",
    },
    {
      key: "version", title: "Phiên bản", done: hasVersion(input), lockReason: hasDraft(input) ? undefined : "Cần lưu bản nháp trước",
      detail: hasVersion(input) ? `Mới nhất v${scenario?.versionNumber}` : "Tạo phiên bản đóng băng từ bản nháp",
    },
    {
      key: "release", title: "Chuẩn bị phát hành", done: isPublished(input), lockReason: isApproved(input) ? undefined : "Cần nội dung được duyệt",
      detail: isPublished(input) ? "Đã phát hành" : input.releaseStatus ? `Release ${input.releaseStatus}` : "Tạo release rồi phát hành",
    },
    {
      key: "usage", title: "Quản lý sử dụng", done: false, lockReason: isPublished(input) ? undefined : "Mở sau khi phát hành",
      detail: "Theo dõi phiên học, báo cáo và dịch vụ",
    },
  ];

  let currentTaken = false;
  return drafts.map((step, position) => {
    let state: JourneyStepState;
    if (step.done) state = "done";
    else if (step.lockReason) state = "locked";
    else if (!currentTaken) { state = "current"; currentTaken = true; }
    else state = "locked";
    // A step after the current one that has no reason of its own is locked behind the current one.
    const lockReason = state === "locked" ? step.lockReason ?? "Hoàn thành bước trước" : undefined;
    return { key: step.key, index: position + 1, title: step.title, state, detail: state === "locked" ? lockReason ?? step.detail : step.detail, lockReason };
  });
}

export function journeyConditions(input: JourneyInput): JourneyCondition[] {
  const status = input.revision?.status;
  const technical: JourneyCondition = status === "ConfirmedForTraining"
    ? { key: "technical", title: "Sẵn sàng kỹ thuật (IFC QA)", description: "Kiểm tra mô hình, cửa thoát và thiết bị.", label: "Đạt · xác nhận", tone: "success" }
    : status === "ReadyForScenario"
      ? { key: "technical", title: "Sẵn sàng kỹ thuật (IFC QA)", description: "Kiểm tra mô hình, cửa thoát và thiết bị.", label: "Chờ xác nhận", tone: "warning" }
      : { key: "technical", title: "Sẵn sàng kỹ thuật (IFC QA)", description: "Kiểm tra mô hình, cửa thoát và thiết bị.", label: input.revision ? "Chưa đạt" : "Chưa có IFC", tone: "neutral" };

  const review = input.scenario?.reviewStatus?.toLowerCase();
  const v = input.scenario?.versionNumber;
  const content: JourneyCondition = review === "approved"
    ? { key: "content", title: "Duyệt nội dung", description: "PlatformAdmin đã duyệt đúng bản đóng băng. Sửa sẽ tạo phiên bản mới và duyệt lại.", label: `Đã duyệt v${v}`, tone: "success" }
    : review === "submitted"
      ? { key: "content", title: "Duyệt nội dung", description: "Đã gửi duyệt bản đóng băng; chờ PlatformAdmin.", label: `Chờ duyệt v${v}`, tone: "warning" }
      : review === "rejected"
        ? { key: "content", title: "Duyệt nội dung", description: input.scenario?.rejectReason ? `Lý do: ${input.scenario.rejectReason}` : "Sửa nội dung sẽ tạo phiên bản mới.", label: "Bị từ chối", tone: "danger" }
        : { key: "content", title: "Duyệt nội dung", description: "Gửi duyệt đóng băng nội dung; sửa sẽ tạo phiên bản mới và duyệt lại.", label: v != null ? "Chưa gửi duyệt" : "Chưa có phiên bản", tone: "neutral" };

  const serviceTone: Record<ServiceState, { label: string; tone: Tone }> = {
    effective: { label: "Đang hoạt động", tone: "success" },
    expiring: { label: "Sắp hết hạn", tone: "warning" },
    expired: { label: "Đã hết hạn", tone: "danger" },
    upcoming: { label: "Chưa đến kỳ", tone: "info" },
    none: { label: "Chưa có dịch vụ", tone: "neutral" },
  };
  const service: JourneyCondition = { key: "service", title: "Dịch vụ công trình", description: "Gói 6 hoặc 12 tháng; chỉ lần bắt đầu đầu tiên của mỗi Trainee tính một suất.", ...(input.service ? serviceTone[input.service] : { label: "Chưa có dữ liệu", tone: "neutral" as Tone }) };
  return [technical, content, service];
}

export type ChecklistItem = { key: string; label: string; state: "done" | "todo" | "locked"; tab?: "ifc" | "scenarios" };

/** Quick-start checklist; "locked" items wait for the previous one. Progress comes from server data only. */
export function journeyChecklist(input: JourneyInput): ChecklistItem[] {
  const status = input.revision?.status;
  const review = input.scenario?.reviewStatus?.toLowerCase();
  const raw: Array<{ key: string; label: string; done: boolean; tab?: "ifc" | "scenarios" }> = [
    { key: "upload", label: "Tải lên tệp IFC", done: Boolean(input.revision), tab: "ifc" },
    { key: "qa", label: "Xác nhận kiểm tra QA", done: status === "ConfirmedForTraining", tab: "ifc" },
    { key: "scenario", label: "Soạn kịch bản đầu tiên", done: hasDraft(input), tab: "scenarios" },
    { key: "submit", label: "Gửi duyệt nội dung", done: review === "submitted" || review === "approved" },
    { key: "publish", label: "Phát hành và tạo mã QR", done: isPublished(input) },
  ];
  let blocked = false;
  return raw.map((item) => {
    if (item.done) return { key: item.key, label: item.label, state: "done" as const, tab: item.tab };
    const state = blocked ? ("locked" as const) : ("todo" as const);
    blocked = true;
    return { key: item.key, label: item.label, state, tab: item.tab };
  });
}
