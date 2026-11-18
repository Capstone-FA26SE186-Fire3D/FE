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
  wedge_removed: "Số lần gỡ vật chèn cửa",
  door_gap_sealed: "Số lần chèn khe cửa",
  locked_exit_tried: "Số lần thử cửa bị khóa",
  door_forced: "Số lần phá cửa bị khóa",
  glass_broken: "Số lần đập kính",
  emergency_called: "Số lần gọi khẩn cấp",
  signaled_for_help: "Số lần ra hiệu cứu hộ",
  escape_hood_worn: "Số lần đeo mặt nạ",
  first_aid_used: "Số lần sơ cứu",
  injured_helped: "Số người bị thương được giúp",
  wheelchair_to_refuge: "Số người xe lăn tới chỗ chờ",
  assembly_point_reached: "Đã tới điểm tập kết",
  window_opened: "Số lần mở cửa sổ",
  jumped: "Số lần nhảy",
  obstacle_climbed: "Số lần leo qua vật cản",
  fell_from_height: "Số lần ngã từ trên cao",
};

export const metricName = (metric: string) => METRIC_LABELS[metric] ?? metric;

/**
 * Plain explanations shown under the metric picker. The server catalog only carries English text, so people see
 * these instead; a metric without an entry shows no explanation rather than the English one.
 */
const METRIC_HINTS: Record<string, string> = {
  reached_exit: "Bằng 1 khi học viên ra tới lối thoát, ngược lại bằng 0.",
  completion_time_seconds: "Số giây tới khi học viên ra tới lối thoát đầu tiên (chưa ra được thì tính tới thao tác cuối cùng).",
  wrong_exits: "Số lần học viên đi ra lối không phải lối thoát đúng.",
  hazard_exposure: "Tổng mức khói, nhiệt mà học viên phải chịu trong bài.",
  distance_meters: "Tổng quãng đường học viên đã đi, tính bằng mét.",
  alarm_raised: "Số lần học viên kích hoạt chuông báo cháy (lần không hợp lệ không được tính).",
  extinguisher_used: "Số lần học viên dùng bình chữa cháy (lần không hợp lệ không được tính).",
  extinguish_attempt_large_fire: "Số lần học viên cố dập đám cháy đã quá lớn, việc nên tránh.",
  item_wetted: "Số lần học viên làm ướt khăn hoặc vật dụng để che chắn.",
  nose_covered_in_smoke: "Số lần học viên che mũi miệng khi đi trong khói.",
  checked_door_heat: "Số lần học viên kiểm tra độ nóng của cửa trước khi mở.",
  closed_door: "Số lần học viên đóng cửa sau lưng để chặn khói lửa.",
  used_elevator: "Số lần học viên dùng thang máy khi có cháy, việc nên tránh.",
  went_back_for_belongings: "Số lần học viên quay lại lấy đồ đạc, việc nên tránh.",
  npc_guided: "Số người trong bài được học viên hướng dẫn thoát ra.",
  hose_reel_used: "Số lần học viên dùng cuộn vòi chữa cháy.",
  fire_blanket_used: "Số lần học viên dùng chăn chữa cháy.",
  blanket_covered: "Số lần học viên trùm chăn ướt lên người để đi qua khu cháy.",
  power_cut_off: "Số lần học viên ngắt cầu dao điện.",
  gas_valve_closed: "Số lần học viên khóa van gas.",
  wedge_removed: "Số lần học viên gỡ vật chèn giữ cửa chống cháy.",
  door_gap_sealed: "Số lần học viên chèn kín khe cửa để chặn khói.",
  locked_exit_tried: "Số lần học viên thử mở một cửa đang bị khóa.",
  door_forced: "Số lần học viên phá được cửa bị khóa.",
  glass_broken: "Số lần học viên đập kính để thoát hoặc lấy dụng cụ.",
  emergency_called: "Số lần học viên gọi số khẩn cấp 114.",
  signaled_for_help: "Số lần học viên ra hiệu cho lực lượng cứu hộ.",
  escape_hood_worn: "Số lần học viên đeo mặt nạ thoát hiểm.",
  first_aid_used: "Số lần học viên sơ cứu người bị thương.",
  injured_helped: "Số người bị thương được học viên giúp đỡ.",
  wheelchair_to_refuge: "Số người ngồi xe lăn được học viên đưa tới chỗ chờ cứu hộ.",
  assembly_point_reached: "Số lần học viên tới điểm tập kết an toàn.",
  window_opened: "Số lần học viên mở cửa sổ.",
  jumped: "Số lần học viên nhảy qua chỗ trống hoặc vật cản.",
  obstacle_climbed: "Số lần học viên leo qua vật cản.",
  fell_from_height: "Số lần học viên ngã từ trên cao, việc nên tránh.",
};

export const metricHint = (metric: string): string | undefined => METRIC_HINTS[metric];

/** Plain labels for the rubric comparison operators; the stored value stays `gte`/`lte`/`eq`. */
const OPERATOR_LABELS: Record<string, string> = {
  gte: "≥ (ít nhất bằng giá trị)",
  lte: "≤ (không quá giá trị)",
  eq: "= (đúng bằng giá trị)",
};

export const operatorLabel = (operator: string) => OPERATOR_LABELS[operator] ?? operator;
