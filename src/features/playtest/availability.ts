import type { Tone } from "@/components/ui/status-badge";

import type { PlaytestAvailability, PlaytestEntitlementView } from "./types";

/** Blocker codes of `GET /api/scenarios/{id}/playtest-availability` (BE `PlaytestAvailability`) in plain words. */
const blockerText: Record<string, string> = {
  PLAYTEST_LAUNCH_UNAVAILABLE: "Chức năng chạy thử chưa được bật trên hệ thống.",
  PLAYTEST_HANDOFF_UNAVAILABLE: "Chức năng mở bài trên điện thoại chưa được bật trên hệ thống.",
  PLAYTEST_ENTITLEMENT_REQUIRED: "Công trình chưa có dịch vụ còn hiệu lực và gói dùng thử không còn lượt chạy thử.",
  PLAYTEST_PACKAGE_REQUIRED: "Phiên bản này chưa có gói chạy thử đã dựng và kiểm tra đạt.",
};

const UNKNOWN_BLOCKER = "Còn một điều kiện khác chưa đạt. Thử lại sau hoặc liên hệ bộ phận hỗ trợ.";

export type BlockerLine = { code: string; text: string };

/**
 * What stops a playtest, as the server listed it. `skipPackage` drops the package blocker when the page already lists the
 * exact missing package steps, so the same thing is not said twice.
 */
export function describeBlockers(availability: PlaytestAvailability, skipPackage = false): BlockerLine[] {
  const seen = new Set<string>();
  const lines: BlockerLine[] = [];
  for (const code of availability.blockers) {
    if (skipPackage && code === "PLAYTEST_PACKAGE_REQUIRED") continue;
    const text = blockerText[code] ?? UNKNOWN_BLOCKER;
    if (seen.has(text)) continue;
    seen.add(text);
    lines.push({ code, text });
  }
  // BE sets canCreate exactly when there is no blocker; if the two ever disagree the page still says why the button is off.
  if (!availability.canCreate && availability.blockers.length === 0) lines.push({ code: "", text: UNKNOWN_BLOCKER });
  return lines;
}

function until(endsAt: string | null) {
  if (!endsAt) return "";
  const date = new Date(endsAt);
  return Number.isNaN(date.getTime()) ? "" : ` đến ${date.toLocaleDateString("vi-VN")}`;
}

/** The Building's service as the server reported it; Web shows it and decides nothing. */
export function describeEntitlement(entitlement: PlaytestEntitlementView): { label: string; tone: Tone; detail: string } {
  switch (entitlement.kind) {
    case "Paid":
      return { label: "Đang có dịch vụ", tone: "success", detail: `Dịch vụ của công trình còn hiệu lực${until(entitlement.endsAt)}.` };
    case "Trial": {
      const left = entitlement.trialUnitsRemaining ?? 0;
      return left > 0
        ? { label: `Dùng thử: còn ${left} lượt chạy thử`, tone: "info", detail: `Gói dùng thử còn hiệu lực${until(entitlement.endsAt)}. Lượt chỉ bị trừ khi bắt đầu chơi trên điện thoại.` }
        : { label: "Dùng thử: hết lượt chạy thử", tone: "danger", detail: `Gói dùng thử còn hiệu lực${until(entitlement.endsAt)} nhưng đã dùng hết lượt chạy thử.` };
    }
    default:
      return { label: "Chưa có dịch vụ", tone: "danger", detail: "Công trình chưa có dịch vụ hoặc gói dùng thử còn hiệu lực." };
  }
}
