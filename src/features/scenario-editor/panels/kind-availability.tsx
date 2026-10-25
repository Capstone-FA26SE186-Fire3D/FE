"use client";

import { CheckCircle2, CircleAlert, FileClock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StatusBadge, type Tone } from "@/components/ui/status-badge";

import { placementBlocked, type KindStatus } from "../v1/availability";
import { KIND_META, OBJECT_KINDS, type ObjectKind } from "../v1/contract";

function describe(status: KindStatus): { tone: Tone; badge: string; text: string } {
  switch (status.state) {
    case "ready":
      return { tone: "success", badge: "Sẵn sàng", text: status.capabilities > 0 ? `Ứng dụng có ${status.capabilities} khả năng dùng được cho loại này.` : "Loại này không cần chọn khả năng của ứng dụng." };
    case "needs-geometry":
      return {
        tone: "warning", badge: "Cần mô hình 3D",
        text: status.geometry === "reprocess" ? "Cần xử lý lại IFC; bản IFC này chưa có tọa độ để đặt đối tượng."
          : status.geometry === "loading" ? "Đang đọc mô hình 3D của bản IFC."
            : status.geometry === "invalid" ? "Mô hình 3D chưa đúng chuẩn của trình soạn nên không đặt được đối tượng."
              : "Bản IFC chưa có mô hình 3D đạt kiểm tra.",
      };
    case "catalog-loading":
      return { tone: "pending", badge: "Đang tải", text: "Đang tải danh sách khả năng của ứng dụng." };
    case "catalog-error":
      return { tone: "danger", badge: "Lỗi danh mục", text: "Không tải được danh sách khả năng của ứng dụng; chưa chọn được khả năng cho loại này." };
    case "no-capability":
      return {
        tone: "warning", badge: "Chưa có khả năng",
        text: status.runtimes === 0
          ? "Chưa có phiên bản ứng dụng nào được công bố. Quản trị FET3D cần cấu hình khả năng cho loại này; trình soạn không tự tạo."
          : status.runtime
            ? `Phiên bản ứng dụng ${status.runtime} chưa hỗ trợ loại này. Chọn phiên bản khác hoặc nhờ quản trị FET3D bổ sung.`
            : "Chưa phiên bản ứng dụng nào hỗ trợ loại này. Quản trị FET3D cần cấu hình thêm; trình soạn không tự tạo.",
      };
    case "no-anchor":
      return { tone: "warning", badge: "Chưa có cấu kiện neo", text: "Mô hình 3D chưa có danh sách cấu kiện nên chưa chọn được cấu kiện IFC để neo." };
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
    <p className="ops-field-hint">Loại đối tượng chỉ cho biết vị trí đặt. Đối tượng hoạt động thế nào trong ứng dụng là do khả năng bạn chọn cho nó.</p>
  </div>;
}

/** Legacy drafts have no Goal / NPC / blocked element / equipment: those exist only in fet3d.editor/1 documents. */
export function LegacyKinds() {
  return <div className="se-form" data-testid="legacy-kinds">
    <section className="se-locked" data-state="v1-only">
      <header><h3>Chỉ có khi soạn trên mô hình 3D</h3><StatusBadge tone="neutral"><FileClock size={12} aria-hidden="true" /> Bản nháp cũ</StatusBadge></header>
      <p>Điểm đến, NPC, cấu kiện bị chặn và thiết bị chỉ đặt được trong bản nháp soạn trên mô hình 3D, theo tọa độ của từng tầng.</p>
      <p>Bản nháp cũ không bị đổi hay chuyển tọa độ. Dùng nút “Tạo bản nháp mới trên mô hình 3D” ở đầu trang khi mô hình 3D của bản IFC hợp lệ.</p>
    </section>
  </div>;
}
