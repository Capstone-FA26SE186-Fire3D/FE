/**
 * Vietnamese meaning and guidance for IFC QA codes (BE `docs/ifc-qa-codes.md`, Docs IFC ingestion 5.9). The BE returns
 * codes only; any other code is shown generically with the worker message.
 */
export type QaAction = "equipment" | "reupload" | "editor";
export type QaGuide = { title: string; guidance: string | null; action?: QaAction };

const CODES: Record<string, QaGuide> = {
  IFC_NO_BODY_GEOMETRY: { title: "Cấu kiện không có hình khối 3D", guidance: "Xuất lại IFC có hình khối 3D cho tường, sàn, cửa và cầu thang.", action: "reupload" },
  IFC_BODY_NONSTANDARD_CONTEXT: { title: "Hình khối 3D được xuất theo cách không chuẩn", guidance: null },
  IFC_NO_SPACES: { title: "Mô hình không có phòng", guidance: "Bật xuất phòng trong phần mềm thiết kế rồi tải lại IFC.", action: "reupload" },
  IFC_SPACE_UNNAMED: { title: "Phòng chưa có tên", guidance: "Đặt tên phòng trong mô hình, hoặc ghi chú/phân loại phòng trong trình soạn kịch bản." },
  IFC_EXIT_UNKNOWN: { title: "Chưa xác định được cửa thoát ra ngoài", guidance: "Chọn một cửa có sẵn làm lối thoát ở mục Thiết bị phát hiện từ IFC; không cần tải lại IFC.", action: "equipment" },
  IFC_NO_FIRE_EQUIPMENT: { title: "IFC không có thiết bị báo cháy/chữa cháy", guidance: "Đặt thiết bị trong trình soạn kịch bản.", action: "editor" },
  IFC_NO_WATER_SOURCE: { title: "IFC không có nguồn nước", guidance: "Đặt nguồn nước trong trình soạn kịch bản nếu kịch bản cần.", action: "editor" },
  IFC_LOW_CONFIDENCE_DEVICE: { title: "Thiết bị phát hiện có độ tin cậy thấp", guidance: "Xác nhận hoặc loại bỏ ở mục Thiết bị phát hiện từ IFC.", action: "equipment" },
  IFC_UNMAPPED_MATERIAL: { title: "Vật liệu chưa có trong từ điển", guidance: "Quản trị FET3D bổ sung vật liệu này vào từ điển; mô hình vẫn dùng được." },
  IFC_EXCESSIVE_VOIDS: { title: "Không cắt được lỗ cửa", guidance: "Kiểm tra cửa và tường liên quan trong mô hình." },
  IFC_NOT_ARCHITECTURAL: { title: "Không phải mô hình kiến trúc", guidance: "Tệp chỉ có kết cấu hoặc cơ điện (không có cửa và phòng). Tải lên tệp IFC kiến trúc.", action: "reupload" },
  IFC_NO_FLOOR_UNDER_SPACE: { title: "Phòng không có sàn bên dưới", guidance: "Hệ thống đã tạo sàn từ đáy phòng; kiểm tra lại hoặc xuất IFC kèm sàn." },
  IFC_TRIANGLE_BUDGET_EXCEEDED: { title: "Mô hình quá nặng", guidance: "Xuất lại IFC với mức chi tiết thấp hơn.", action: "reupload" },
  IFC_DEFAULT_MASS_PRESENT: { title: "Có khối quy hoạch (đã loại bỏ)", guidance: null },
  IFC_UNSUPPORTED_FORMAT: { title: "Tệp không phải IFC", guidance: "Xuất IFC (IFC2X3, IFC4 hoặc IFC4X3) rồi tải lên lại.", action: "reupload" },
};

export function qaGuide(code: string): QaGuide | null {
  return CODES[code] ?? null;
}

/** IFC GlobalIds the worker named for an issue: `ifcGlobalIds`, or `evidence.ifcGlobalIds` for older responses. */
export function issueGlobalIds(issue: { ifcGlobalIds?: string[] | null; evidence?: unknown }): string[] {
  if (Array.isArray(issue.ifcGlobalIds)) return issue.ifcGlobalIds.filter((id): id is string => typeof id === "string" && id.length > 0);
  const evidence = issue.evidence;
  if (evidence && typeof evidence === "object" && Array.isArray((evidence as Record<string, unknown>).ifcGlobalIds)) {
    return ((evidence as Record<string, unknown>).ifcGlobalIds as unknown[]).filter((id): id is string => typeof id === "string" && id.length > 0);
  }
  return [];
}
