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
  // BE#214
  IFC_NO_STOREYS: { title: "Mô hình không có tầng", guidance: "Khai báo tầng trong phần mềm thiết kế rồi xuất lại IFC.", action: "reupload" },
  IFC_NO_STAIRS_MULTISTOREY: { title: "Nhà nhiều tầng nhưng không có cầu thang", guidance: "Thêm cầu thang nối các tầng trong mô hình rồi xuất lại IFC.", action: "reupload" },
  IFC_UNIT_NOT_METRE: { title: "Đơn vị đo không phải mét", guidance: "Hệ thống đã tự quy đổi sang mét; kiểm tra kích thước ở bản xem trước 3D." },
  // BE#219: reported only by the server's quick scan at upload (`errors.qaCodes`).
  IFC_NO_DOORS: { title: "Mô hình không có cửa", guidance: "Xuất cửa cùng mô hình kiến trúc rồi tải lại IFC.", action: "reupload" },
  IFC_NO_WALLS_OR_SLABS: { title: "Mô hình không có tường và sàn", guidance: "Xuất mô hình kiến trúc đầy đủ, không phải tệp của riêng một bộ môn, rồi tải lại IFC.", action: "reupload" },
};

export function qaGuide(code: string): QaGuide | null {
  return CODES[code] ?? null;
}

export type QaCriterion = { id: string; label: string; passed: boolean; blocking: boolean; detail: string };

/** What the server checks on the processed model, as pass/fail rows; each row is the absence of its issue codes. */
const CRITERIA: Array<{ id: string; label: string; codes: string[] }> = [
  { id: "architectural", label: "Là mô hình kiến trúc", codes: ["IFC_NOT_ARCHITECTURAL", "IFC_UNSUPPORTED_FORMAT"] },
  { id: "storeys", label: "Có tầng", codes: ["IFC_NO_STOREYS"] },
  { id: "spaces", label: "Có phòng", codes: ["IFC_NO_SPACES"] },
  { id: "stairs", label: "Nhà nhiều tầng có cầu thang", codes: ["IFC_NO_STAIRS_MULTISTOREY"] },
  { id: "body", label: "Tường, sàn, cửa, cầu thang có hình khối 3D", codes: ["IFC_NO_BODY_GEOMETRY"] },
  { id: "exit", label: "Xác định được cửa thoát ra ngoài", codes: ["IFC_EXIT_UNKNOWN"] },
  { id: "floors", label: "Phòng có sàn bên dưới", codes: ["IFC_NO_FLOOR_UNDER_SPACE"] },
  { id: "openings", label: "Cắt được lỗ cửa trên tường", codes: ["IFC_EXCESSIVE_VOIDS"] },
  { id: "names", label: "Phòng có tên", codes: ["IFC_SPACE_UNNAMED"] },
  { id: "weight", label: "Mô hình đủ nhẹ cho điện thoại", codes: ["IFC_TRIANGLE_BUDGET_EXCEEDED"] },
  { id: "equipment", label: "Có thiết bị báo cháy, chữa cháy", codes: ["IFC_NO_FIRE_EQUIPMENT"] },
  { id: "units", label: "Đơn vị đo là mét", codes: ["IFC_UNIT_NOT_METRE"] },
];
// The exit stays a blocker while reported as a warning: the model cannot be used until a door is chosen as the exit.
const ALWAYS_BLOCKING = new Set(["IFC_EXIT_UNKNOWN"]);

/**
 * Pass/fail list of a processed model from the issues of its latest processing attempt. A failed row blocks when the
 * server reported it as an error (or it is the exit door); otherwise it is a note. Only meaningful once processing has
 * finished: before that an empty issue list does not mean "passed".
 */
export function qaCriteria(issues: Array<{ issueCode: string; severity: string; status?: string; isCurrentAttempt: boolean }>): QaCriterion[] {
  const open = issues.filter((issue) => issue.isCurrentAttempt && issue.status !== "Resolved" && issue.status !== "Superseded");
  return CRITERIA.map(({ id, label, codes }) => {
    const hits = open.filter((issue) => codes.includes(issue.issueCode));
    if (hits.length === 0) return { id, label, passed: true, blocking: false, detail: "Đạt" };
    const blocking = hits.some((issue) => issue.severity === "Error" || issue.severity === "Critical" || ALWAYS_BLOCKING.has(issue.issueCode));
    const guide = qaGuide(hits[0].issueCode);
    return { id, label, passed: false, blocking, detail: guide?.guidance ?? guide?.title ?? "Xem mục Vấn đề bên dưới." };
  });
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
