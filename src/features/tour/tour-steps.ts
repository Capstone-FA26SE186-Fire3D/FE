/** Organization spotlight tour. Targets are `[data-tour="<key>"]` elements; a missing target skips the step. */
export type TourStep = {
  key: "nav-buildings" | "buildings-list" | "tab-journey" | "tab-ifc" | "upload-ifc";
  title: string;
  text: string;
  /** Steps 3–5 only make sense with a building open (`/workspace/buildings/[id]`). */
  requiresBuilding: boolean;
};

export const TOUR_STORAGE_KEY = "fire3d-org-tour";
export type TourPreference = "new" | "done" | "skipped";
export const isTourPreference = (value: string): value is TourPreference => value === "new" || value === "done" || value === "skipped";

export const BUILDING_ROUTE = /^\/workspace\/buildings\/([^/]+)/;

export const tourSteps: TourStep[] = [
  { key: "nav-buildings", requiresBuilding: false, title: "Mọi thứ bắt đầu từ Công trình", text: "Mỗi công trình đi qua sáu bước: thông tin, IFC, kịch bản, phiên bản, phát hành và sử dụng." },
  { key: "buildings-list", requiresBuilding: false, title: "Danh sách công trình của tổ chức", text: "Bấm vào một hàng để mở công trình; cột “Việc tiếp theo” cho biết bước đang chờ bạn." },
  { key: "tab-journey", requiresBuilding: true, title: "Tab Hành trình: bước tiếp theo luôn ở đầu", text: "Hành trình gom tiến độ sáu bước và điều kiện phát hành của công trình vào một chỗ." },
  { key: "tab-ifc", requiresBuilding: true, title: "Tab IFC: nơi tải và theo dõi mô hình", text: "Tải IFC bằng nút duy nhất ở đây. Tiến trình, QA, preview 3D và thiết bị phát hiện đều nằm trong tab này." },
  { key: "upload-ifc", requiresBuilding: true, title: "Tải mô hình IFC tại đây", text: "Đây là nơi duy nhất để tải IFC. Kéo thả tệp .ifc vào hộp thoại; tiến trình hiện ngay trong tab này." },
];

/** Shown instead of steps 3–5 when no building is open. */
export const TOUR_NEEDS_BUILDING_TEXT = "Mở một công trình để xem các bước tiếp theo";
