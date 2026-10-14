"use client";

import { CheckCircle2, CircleAlert, FileClock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StatusBadge, type Tone } from "@/components/ui/status-badge";

import { placementBlocked, type KindStatus } from "../v1/availability";
import { KIND_META, OBJECT_KINDS, type ObjectKind } from "../v1/contract";

function describe(status: KindStatus): { tone: Tone; badge: string; text: string } {
  switch (status.state) {
    case "ready":
      return { tone: "success", badge: "Sẵn sàng", text: status.capabilities > 0 ? `Runtime công bố ${status.capabilities} năng lực dùng được cho loại này.` : "Không cần năng lực runtime để đặt loại này." };
    case "needs-geometry":
      return {
        tone: "warning", badge: "Cần Geometry",
        text: status.geometry === "reprocess" ? "Revision cần xử lý lại IFC; chưa có tọa độ để đặt đối tượng."
          : status.geometry === "loading" ? "Đang đọc Geometry của revision."
            : status.geometry === "invalid" ? "Geometry không đạt contract nên không đặt được đối tượng."
              : "Revision chưa có Geometry được chấp nhận.",
      };
    case "catalog-loading":
      return { tone: "pending", badge: "Đang tải", text: "Đang đọc danh mục năng lực runtime." };
    case "catalog-error":
      return { tone: "danger", badge: "Lỗi danh mục", text: "Không tải được danh mục năng lực runtime; chưa chọn được năng lực cho loại này." };
    case "no-capability":
      return {
        tone: "warning", badge: "Chưa có năng lực",
        text: status.runtimes === 0
          ? "Danh mục runtime đang trống. Quản trị viên cần công bố runtime và capabilityContracts cho loại này; editor không tự tạo năng lực."
          : status.runtime
            ? `Runtime ${status.runtime} chưa công bố năng lực cho loại này. Chọn runtime khác hoặc nhờ quản trị viên công bố capabilityContracts.`
            : "Chưa runtime nào công bố năng lực cho loại này. Quản trị viên cần cấu hình capabilityContracts; editor không tự tạo năng lực.",
      };
    case "no-anchor":
      return { tone: "warning", badge: "Chưa có cấu kiện neo", text: "Geometry chưa có ánh xạ ngữ nghĩa (semanticMapping) nên không chọn được cấu kiện IFC để neo." };
    default:
      return { tone: "neutral", badge: "", text: "" };
  }
}

/** State of each object kind from real Geometry and the real runtime catalog (no fixed flags). */
export function KindAvailability({ statuses, onRetryCatalog }: { statuses: Record<ObjectKind, KindStatus>; onRetryCatalog: () => void }) {
  return <div className="se-form" data-testid="kind-availability">
    {OBJECT_KINDS.map((kind) => {
      const status = statuses[kind];
      const info = describe(status);
      return <section key={kind} className="se-locked" aria-labelledby={`kind-${kind}`} data-kind={kind} data-state={status.state} data-blocked={placementBlocked(status)}>
        <header>
          <h3 id={`kind-${kind}`}>{KIND_META[kind].label}</h3>
          <StatusBadge tone={info.tone}>{status.state === "ready" ? <CheckCircle2 size={12} aria-hidden="true" /> : <CircleAlert size={12} aria-hidden="true" />} {info.badge}</StatusBadge>
        </header>
        <p>{KIND_META[kind].description}</p>
        <p>{info.text}</p>
        {status.state === "catalog-error" && <Button type="button" variant="quiet" size="sm" onClick={onRetryCatalog}>Tải lại danh mục</Button>}
      </section>;
    })}
    <p className="ops-field-hint">Loại đối tượng chỉ là phân loại vị trí. Hành vi trong Unity do năng lực (capability) mà runtime công bố quyết định; editor không suy ra hành vi từ loại.</p>
  </div>;
}

/** Legacy drafts have no Goal / NPC / blocked element / equipment: those exist only in fet3d.editor/1 documents. */
export function LegacyKinds() {
  return <div className="se-form" data-testid="legacy-kinds">
    <section className="se-locked" data-state="v1-only">
      <header><h3>Chỉ có trong fet3d.editor/1</h3><StatusBadge tone="neutral"><FileClock size={12} aria-hidden="true" /> Bản nháp cũ</StatusBadge></header>
      <p>Mục tiêu (Goal), NPC, cấu kiện bị chặn và thiết bị chỉ được đặt trong bản nháp theo fet3d.editor/1, với tọa độ cục bộ của tầng và năng lực lấy từ runtime.</p>
      <p>Bản nháp cũ không bị đổi hay chuyển tọa độ. Dùng nút “Tạo bản nháp mới theo fet3d.editor/1” ở đầu trang khi Geometry của revision hợp lệ.</p>
    </section>
  </div>;
}
