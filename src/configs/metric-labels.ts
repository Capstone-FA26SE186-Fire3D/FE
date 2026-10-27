/**
 * Plain names for the rubric metric ids (`alarm_raised`, `completion_time_seconds`…) the server scores a session by.
 * The ids are contract keys; people see these names. An id the list does not know is shown as received, never
 * mapped to a guess. Batch-2 metrics (hose reel, fire blanket…) are named ahead of runtime 2.1.0 so the editor and
 * the debrief read right the day they appear.
 */
const METRIC_LABELS: Record<string, string> = {
  reached_exit: "Đã tới lối ra",
  completion_time_seconds: "Thời gian hoàn thành",
  wrong_exits: "Số lần ra sai lối",
  hazard_exposure: "Mức tiếp xúc nguy hiểm",
  distance_meters: "Quãng đường di chuyển",
  alarm_raised: "Số lần kích hoạt báo cháy",
  extinguisher_used: "Số lần dùng bình chữa cháy",
  extinguish_attempt_large_fire: "Số lần dập đám cháy lớn",
  item_wetted: "Số lần làm ướt vật dụng",
  nose_covered_in_smoke: "Số lần che mũi khi có khói",
  checked_door_heat: "Số lần kiểm tra nhiệt cửa",
  closed_door: "Số lần đóng cửa",
  used_elevator: "Số lần dùng thang máy",
  went_back_for_belongings: "Số lần quay lại lấy đồ",
  npc_guided: "Số người được hướng dẫn",
  hose_reel_used: "Số lần dùng cuộn vòi",
  fire_blanket_used: "Số lần dùng chăn chữa cháy",
  blanket_covered: "Số lần trùm chăn ướt",
  power_cut_off: "Số lần ngắt điện",
  gas_valve_closed: "Số lần khóa gas",
  wedge_removed: "Số lần gỡ nêm cửa",
  locked_exit_tried: "Số lần thử cửa bị khóa",
  emergency_called: "Số lần gọi khẩn cấp",
  signaled_for_help: "Số lần ra hiệu cứu hộ",
  escape_hood_worn: "Số lần đeo mặt nạ",
  first_aid_used: "Số lần sơ cứu",
  injured_helped: "Số người bị thương được giúp",
  wheelchair_to_refuge: "Số người xe lăn tới chỗ chờ",
  assembly_point_reached: "Đã tới điểm tập kết",
  window_opened: "Số lần mở cửa sổ",
};

export const metricName = (metric: string) => METRIC_LABELS[metric] ?? metric;
