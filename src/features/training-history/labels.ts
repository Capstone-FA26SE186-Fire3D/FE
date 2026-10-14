import type { Tone } from "@/components/ui/status-badge";
import type { HistoryItem } from "./types";

/*
 * Vietnamese wording for the two things the history keeps apart:
 *   - the state of the SESSION (running, waiting for sync, completed, cancelled, crashed...), and
 *   - the stored RESULT (Passed / NotPassed / Incomplete / NotAssessed, or none).
 * "Đã hoàn thành" never reads as "Đạt", and none of the wording claims a certificate or a safety verdict.
 * Unknown values are shown as received, never mapped to a guess.
 */

export type StatusView = { label: string; tone: Tone; hint: string };

const sessionStatuses: Record<string, StatusView> = {
  Launching: { label: "Đang khởi động", tone: "info", hint: "Phiên đã bắt đầu trên thiết bị nhưng chưa vào bài." },
  Running: { label: "Đang chơi", tone: "info", hint: "Lượt tập đang diễn ra, hoặc thiết bị chưa báo kết thúc." },
  AwaitingSync: { label: "Chờ đồng bộ", tone: "warning", hint: "Thiết bị đã báo kết thúc nhưng máy chủ còn thiếu dữ liệu. Kết quả sẽ có sau khi thiết bị đồng bộ xong." },
  Completed: { label: "Đã hoàn thành", tone: "neutral", hint: "Hoàn thành lượt tập không có nghĩa là đạt." },
  CompletedWithSupersededRelease: { label: "Hoàn thành, bản phát hành đã thay", tone: "neutral", hint: "Lượt tập hoàn thành trên một bản phát hành sau đó đã được thay thế." },
  ScenarioUnsurvivable: { label: "Kịch bản không khả thi", tone: "warning", hint: "Máy chủ ghi nhận phiên này dừng vì kịch bản không thể hoàn thành. Đây không phải kết quả đánh giá." },
  Aborted: { label: "Đã hủy", tone: "warning", hint: "Lượt tập bị hủy nên không có kết quả hợp lệ." },
  Abandoned: { label: "Đã bỏ dở", tone: "warning", hint: "Lượt tập bị bỏ dở nên không có kết quả hợp lệ." },
  Crashed: { label: "Gặp lỗi", tone: "danger", hint: "Ứng dụng dừng đột ngột nên không có kết quả hợp lệ." },
  // Only reachable through GET /api/training/sessions/{id} with the id of a preparation (never listed).
  Prepared: { label: "Mới chuẩn bị", tone: "info", hint: "Đây là bản chuẩn bị, chưa phải một lượt tập đã bắt đầu." },
  Expired: { label: "Hết hạn chuẩn bị", tone: "neutral", hint: "Bản chuẩn bị đã hết hạn và chưa bao giờ bắt đầu. Hãy mở lại bài từ ứng dụng." },
};

export function sessionStatusView(status: string): StatusView {
  return sessionStatuses[status] ?? { label: status ? `Trạng thái khác: ${status}` : "Chưa rõ trạng thái", tone: "neutral", hint: "Web chưa nhận biết trạng thái này; hiển thị đúng giá trị máy chủ trả." };
}

const outcomes: Record<string, StatusView> = {
  Passed: { label: "Đạt", tone: "success", hint: "Đáp ứng các yêu cầu của bài theo máy chủ." },
  NotPassed: { label: "Chưa đạt", tone: "danger", hint: "Chưa đáp ứng các yêu cầu của bài. Bạn có thể làm lại." },
  Incomplete: { label: "Chưa hoàn tất", tone: "warning", hint: "Lượt tập kết thúc trước khi hoàn thành nên không được chấm." },
  NotAssessed: { label: "Không chấm điểm", tone: "neutral", hint: "Lượt tập này không được chấm đạt hoặc chưa đạt." },
};

export function outcomeView(outcome: string): StatusView {
  return outcomes[outcome] ?? { label: outcome ? `Kết quả khác: ${outcome}` : "Chưa rõ kết quả", tone: "neutral", hint: "Web chưa nhận biết kết quả này; hiển thị đúng giá trị máy chủ trả." };
}

const waiting = new Set(["Launching", "Running", "AwaitingSync"]);

/** What the result column shows: the stored outcome, or why there is none (kept apart from "Đạt/Chưa đạt"). */
export function resultCellView(item: Pick<HistoryItem, "status" | "resultStatus">): StatusView {
  if (item.resultStatus) return outcomeView(item.resultStatus);
  if (waiting.has(item.status) || item.status === "Completed" || item.status === "CompletedWithSupersededRelease") {
    return { label: "Chưa có kết quả", tone: "pending", hint: "Máy chủ chưa lưu kết quả cho lượt này." };
  }
  return { label: "Không có kết quả", tone: "neutral", hint: "Lượt này không tạo kết quả hợp lệ." };
}

const modes: Record<string, string> = { Learn: "Học (Learn)", Guided: "Luyện có hướng dẫn", Assessment: "Đánh giá" };
export const modeLabel = (mode: string) => modes[mode] ?? (mode || "Chưa rõ chế độ");

const endReasons: Record<string, string> = { Finished: "Hoàn thành bài", TimedOut: "Hết thời gian", Abandoned: "Rời bài giữa chừng" };
export const endReasonLabel = (reason: string | null) => (reason ? endReasons[reason] ?? reason : null);

/** `reason` of the result is a machine code; unknown codes are shown as received. */
const reasons: Record<string, string> = {
  MODE_NOT_ASSESSED: "Chế độ này không chấm đạt hoặc chưa đạt.",
  ENDED_BEFORE_COMPLETION: "Lượt tập kết thúc trước khi hoàn thành nên không được chấm.",
  RUBRIC_NOT_SCORABLE: "Bài này chưa có tiêu chí chấm điểm dùng được.",
  MANDATORY_CRITERION_FAILED: "Có tiêu chí bắt buộc chưa đạt.",
  BELOW_PASS_THRESHOLD: "Tỷ lệ tiêu chí đạt thấp hơn ngưỡng đạt của bài.",
  ALL_REQUIREMENTS_MET: "Đã đáp ứng các yêu cầu của bài.",
};
export const reasonText = (code: string) => reasons[code] ?? (code ? "Lý do do máy chủ trả (chưa có bản dịch)." : "Máy chủ không nêu lý do.");

const criterionReasons: Record<string, string> = { METRIC_UNAVAILABLE: "Không có số đo để so sánh nên tiêu chí tính là chưa đạt." };
export const criterionReasonText = (code: string) => criterionReasons[code] ?? code;

const operators: Record<string, string> = { gte: "≥", lte: "≤", eq: "=" };
export const operatorSymbol = (operator: string) => operators[operator] ?? operator;

const metricNames: Record<string, string> = {
  reached_exit: "Đã tới lối ra",
  completion_time_seconds: "Thời gian hoàn thành",
  wrong_exits: "Số lần ra sai lối",
  hazard_exposure: "Mức tiếp xúc nguy hiểm",
  distance_meters: "Quãng đường di chuyển",
};
export const metricName = (metric: string) => metricNames[metric] ?? metric;

function seconds(value: number): string {
  const total = Math.round(value);
  if (total < 60) return `${value.toLocaleString("vi-VN", { maximumFractionDigits: 1 })} giây`;
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return rest ? `${minutes} phút ${rest} giây` : `${minutes} phút`;
}

/** A measured value or threshold in the unit of its metric; non-numbers are shown as received, null as "Không có". */
export function formatMetricValue(metric: string, value: unknown): string {
  if (value === null || value === undefined) return "Không có";
  if (typeof value !== "number") return typeof value === "string" ? value : JSON.stringify(value);
  if (metric === "reached_exit") return value === 1 ? "Có" : value === 0 ? "Không" : String(value);
  if (metric === "completion_time_seconds") return seconds(value);
  if (metric === "distance_meters") return `${value.toLocaleString("vi-VN", { maximumFractionDigits: 2 })} m`;
  return value.toLocaleString("vi-VN", { maximumFractionDigits: 2 });
}

export function formatScore(score: number | null): string {
  return score === null ? "Chưa có" : `${score.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}%`;
}

const dateTime = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" });
export function formatWhen(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : dateTime.format(date);
}

/** Name of the exercise with its scenario and version, using only what the server returned. */
export function trainingTitle(item: Pick<HistoryItem, "training" | "scenario">): { title: string; sub: string } {
  const version = item.scenario.versionNumber === null ? "" : ` · phiên bản ${item.scenario.versionNumber}`;
  const title = item.training.name || item.scenario.name || "Bài tập huấn";
  const scenarioName = item.scenario.name && item.scenario.name !== item.training.name ? item.scenario.name : "";
  return { title, sub: `${scenarioName}${version}`.replace(/^ · /, "") };
}
