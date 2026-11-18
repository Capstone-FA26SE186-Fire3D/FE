/**
 * Plain names for the runtime capability ids (`door.exit`, `alarm.call_point`…) of the Unity runtime catalog. The ids
 * are contract keys for the server and the app; people see these names. An id the list does not know is "Loại khác"
 * and keeps the id for support.
 */
const CAPABILITY_LABELS: Record<string, string> = {
  "alarm.call_point": "Nút báo cháy",
  "alarm.detector": "Đầu báo cháy",
  "extinguisher.portable": "Bình chữa cháy xách tay",
  "water.sink": "Bồn rửa",
  "water.bath": "Bồn tắm",
  "water.shower": "Vòi sen",
  "item.towel": "Khăn",
  "door.standard": "Cửa thường",
  "door.fire": "Cửa chống cháy",
  "door.exit": "Cửa thoát",
  "transport.elevator": "Thang máy",
  "exit.stair": "Cầu thang thoát hiểm",
  "exit.final": "Lối ra ngoài",
  "bait.belongings": "Đồ đạc cá nhân",
  "npc.guide": "Người hướng dẫn",
  "suppression.sprinkler": "Đầu phun nước chữa cháy",
  "fire.source": "Nguồn cháy",
  "smoke.source": "Nguồn khói",
  "event.power_outage": "Mất điện",
  "event.alarm": "Chuông báo cháy",
  "event.explosion": "Vụ nổ",
  // Batch 2 (runtime 2.1.0): named ahead so the editor reads right the day the runtime is registered.
  "extinguisher.hose_reel": "Tủ chữa cháy vách tường",
  "blanket.fire": "Chăn chữa cháy",
  "item.blanket": "Chăn",
  "item.clothing": "Quần áo, đồ vải",
  "power.breaker": "Tủ điện",
  "gas.valve": "Van gas",
  "door.fire_wedged": "Cửa chống cháy bị chèn mở",
  "door.exit_locked": "Cửa thoát bị khóa",
  "phone.emergency": "Điện thoại khẩn cấp",
  "signal.window": "Cửa sổ ra hiệu",
  "ppe.escape_hood": "Mặt nạ thoát hiểm",
  "firstaid.kit": "Hộp sơ cứu",
  "npc.injured": "Người bị thương",
  "npc.wheelchair": "Người ngồi xe lăn",
  "refuge.area": "Chỗ chờ cứu hộ",
  "assembly.point": "Điểm tập kết",
  "window.openable": "Cửa sổ mở được",
  // Runtime 2.3.0: beds the IFC carries give their blanket and sheet (like sinks give water).
  "furniture.bed": "Giường",
  // Runtime 2.4.0: the emergency hammer on the wall, and glass the player breaks with it (part of the building).
  "tool.emergency_hammer": "Búa thoát hiểm",
  "glass.pane": "Tấm kính",
  // Runtime 2.2.0: the player's own jumps, climbs and falls (declared on the spawn, not an object to place).
  "player.movement": "Di chuyển của người chơi",
};

export function capabilityLabel(id: string | null | undefined): string {
  return (id && CAPABILITY_LABELS[id]) || "Loại khác";
}

/** For text an admin typed (library requirements): the plain name when known, otherwise what they wrote. */
export function capabilityName(id: string): string {
  return CAPABILITY_LABELS[id] ?? id;
}

/**
 * What each capability does, in plain Vietnamese. The runtime catalog's own description is English and written for
 * developers, so the editor shows this instead; an id missing here shows no description rather than the English one.
 */
const CAPABILITY_DESCRIPTIONS: Record<string, string> = {
  "alarm.call_point": "Học viên bấm nút để báo cháy cho cả tòa nhà.",
  "alarm.detector": "Tự kêu khi khói tới mức đã đặt.",
  "extinguisher.portable": "Học viên cầm bình, rút chốt rồi giữ để phun.",
  "water.sink": "Nơi lấy nước: giữ để làm ướt khăn, chăn hoặc đồ vải.",
  "water.bath": "Nơi lấy nước: giữ để làm ướt khăn, chăn hoặc đồ vải.",
  "water.shower": "Nơi lấy nước: giữ để làm ướt khăn, chăn hoặc đồ vải.",
  "item.towel": "Học viên nhặt khăn, làm ướt rồi che mũi. Khăn khô thì không có tác dụng.",
  "door.standard": "Học viên sờ để kiểm tra nóng, mở, đóng; cửa kẹt đạp 3 lần thì bung, cửa bị chặn thì không.",
  "door.fire": "Cửa chống cháy: sờ kiểm tra nóng, mở, đóng; cửa kẹt đạp 3 lần thì bung.",
  "door.exit": "Cửa thoát: sờ kiểm tra nóng, mở, đóng; cửa kẹt đạp 3 lần thì bung.",
  "transport.elevator": "Bẫy: gọi thang máy khi cháy bị tính là sai. Nút bấm vẫn hiện như bình thường.",
  "exit.stair": "Cầu thang thoát hiểm; học viên vào đây là đã thoát.",
  "exit.final": "Lối ra ngoài tòa nhà; học viên tới đây là đã thoát.",
  "bait.belongings": "Bẫy: quay lại nhặt đồ đạc bị tính là sai.",
  "npc.guide": "Người trong tòa nhà; học viên gọi và dẫn họ tới lối thoát.",
  "suppression.sprinkler": "Đầu phun tự động, học viên không cần làm gì; tự phun khi đủ nóng.",
  "fire.source": "Chỗ bắt đầu cháy; lửa bùng lên sau số giây đã đặt.",
  "smoke.source": "Chỗ khói bốc ra; bắt đầu sau số giây đã đặt.",
  "event.power_outage": "Mất điện vào thời điểm đã đặt; chỉ còn đèn khẩn cấp. Vị trí đặt không ảnh hưởng.",
  "event.alarm": "Chuông báo cháy kêu vào thời điểm đã đặt, hoặc hỏng hẳn. Vị trí đặt không ảnh hưởng.",
  "event.explosion": "Vụ nổ tại chỗ đặt vào thời điểm đã đặt; không nổ nếu học viên đã khóa van gas liên quan.",
  "extinguisher.hose_reel": "Học viên kéo vòi, mở van rồi giữ để phun nước; nước không bao giờ hết.",
  "gas.valve": "Van gas; khóa lại thì vụ nổ gắn với van này không xảy ra.",
  "player.movement": "Học viên nhảy, trèo qua vật thấp; rơi từ 1,8 m trở lên thì bị thương.",
  "phone.emergency": "Điện thoại của học viên (nút trên màn hình) để gọi 114.",
  "firstaid.kit": "Hộp sơ cứu; cần có để sơ cứu người bị thương.",
  "npc.injured": "Người bị thương nằm trên sàn; học viên cầm hộp sơ cứu tới sơ cứu, sau đó họ tự đi ra.",
  "npc.wheelchair": "Người ngồi xe lăn chờ giúp; học viên đẩy tới chỗ chờ cứu hộ.",
  "refuge.area": "Ô vuông trên sàn cạnh cầu thang, nơi người cần giúp chờ cứu hộ; bài chưa kết thúc.",
  "blanket.fire": "Chăn chữa cháy treo tường; trùm lên đám cháy nhỏ phía trước để dập.",
  "power.breaker": "Tủ điện; gạt cầu dao tổng thì cả tòa mất điện, đèn khẩn cấp vẫn sáng.",
  "door.fire_wedged": "Cửa chống cháy bị chèn mở; rút nêm ra thì cửa tự đóng.",
  "door.exit_locked": "Bẫy: cửa thoát bị khóa; học viên tìm lối khác, đạp 3 lần hoặc đập khóa.",
  "signal.window": "Cửa sổ để vẫy gọi cứu hộ (vẫy khoảng 3 giây).",
  "window.openable": "Cửa sổ mở được; khói quanh cửa sổ thoát ra ngoài.",
  "assembly.point": "Điểm tập kết bên ngoài; học viên tới đây được tính điểm, bài chưa kết thúc.",
  "item.blanket": "Chăn: làm ướt rồi trùm người để che mũi và đỡ nóng, hoặc nhét khe cửa.",
  "item.clothing": "Quần áo, đồ vải: làm ướt để che mũi; tấm lớn thì trùm người hoặc nhét khe cửa.",
  "ppe.escape_hood": "Mặt nạ thoát hiểm: nhặt và đeo để lọc khói.",
  "furniture.bed": "Giường: lấy chăn rồi tới ga trải giường để dùng.",
  "tool.emergency_hammer": "Búa thoát hiểm treo tường: dùng đập kính hoặc phá khóa cửa thoát.",
  "glass.pane": "Tấm kính của tòa nhà; không cần đặt.",
};

export function capabilityDescription(id: string): string | undefined {
  return CAPABILITY_DESCRIPTIONS[id];
}

/** Plain name and hint for each capability parameter; the stored key stays the catalog's (`dischargeSeconds`…). */
const PARAMETER_LABELS: Record<string, { label: string; hint?: string }> = {
  smokeThreshold: { label: "Độ nhạy khói", hint: "Từ 0 đến 1; số nhỏ thì báo sớm hơn." },
  agent: { label: "Loại chất chữa cháy" },
  dischargeSeconds: { label: "Thời gian phun (giây)", hint: "Bình phun hết sau chừng này giây." },
  smokeIntakeMultiplierWhenCovered: { label: "Khói còn hít vào khi che mũi", hint: "Từ 0 đến 1; 0,3 nghĩa là chỉ còn hít 30% lượng khói." },
  smokeIntakeMultiplierWhenWorn: { label: "Khói còn hít vào khi đeo", hint: "Từ 0 đến 1; 0,1 nghĩa là chỉ còn hít 10% lượng khói." },
  dryAfterSeconds: { label: "Khô lại sau (giây)", hint: "Sau chừng này giây đồ vải khô, phải làm ướt lại." },
  heatMultiplierWhenWrapped: { label: "Sức nóng còn chịu khi trùm người", hint: "Từ 0 đến 1; 0,5 nghĩa là chỉ còn chịu một nửa sức nóng." },
  behaviour: { label: "Tâm lý" },
  mobilityImpaired: { label: "Đi lại khó khăn", hint: "Có: người này đi chậm, cần được dẫn." },
  state: { label: "Tình trạng" },
  activationTemperatureC: { label: "Nhiệt độ bắt đầu phun (°C)" },
  coverageRadiusMeters: { label: "Bán kính phun (m)" },
  fireIntensityReduction: { label: "Mức giảm lửa", hint: "Từ 0 đến 1; 1 là dập hẳn lửa trong vùng phun." },
  activationDelaySeconds: { label: "Chờ trước khi phun (giây)" },
  intensity: { label: "Cường độ lửa", hint: "Từ 0 đến 10; số càng lớn lửa càng mạnh." },
  activationSeconds: { label: "Bắt đầu sau (giây)", hint: "Tính từ lúc học viên vào bài." },
  ratePerSecond: { label: "Lượng khói mỗi giây", hint: "Số càng lớn khói càng dày." },
  atSeconds: { label: "Xảy ra lúc (giây)", hint: "Tính từ lúc học viên vào bài." },
  fails: { label: "Hệ thống báo cháy hỏng", hint: "Có: chuông không kêu và đầu báo khói im lặng." },
  hoseLengthMeters: { label: "Chiều dài vòi (m)", hint: "Đi xa hơn chừng này thì tuột vòi." },
  radius: { label: "Bán kính ảnh hưởng (m)" },
  fireIntensity: { label: "Lửa còn cháy sau vụ nổ", hint: "Từ 0 đến 10." },
  gasValveId: { label: "Van gas liên quan", hint: "Tên đối tượng van gas; học viên khóa van này trước thì không nổ." },
  sizeMeters: { label: "Kích thước ô (m)", hint: "Cạnh của ô vuông đánh dấu trên sàn." },
  ventRadiusMeters: { label: "Bán kính thoát khói (m)" },
  filterSeconds: { label: "Thời gian lọc (giây)", hint: "Để trống: lọc suốt bài." },
};

export function parameterLabel(name: string): string {
  return PARAMETER_LABELS[name]?.label ?? name;
}

export function parameterHint(name: string): string | undefined {
  return PARAMETER_LABELS[name]?.hint;
}

/** Plain words for parameter choices; the stored value stays the catalog's. */
const PARAMETER_OPTION_LABELS: Record<string, string> = {
  CO2: "CO2 (khí)", Powder: "Bột", Foam: "Bọt",
  calm: "Bình tĩnh", panic: "Hoảng loạn",
  Active: "Hoạt động", Disabled: "Bị tắt", Faulty: "Hỏng",
};

export function parameterOptionLabel(value: unknown): string {
  return typeof value === "string" ? PARAMETER_OPTION_LABELS[value] ?? value : JSON.stringify(value);
}

/** Plain names for IFC element types, so a building part is picked without IFC vocabulary. */
const IFC_TYPE_LABELS: Record<string, string> = {
  IfcDoor: "Cửa", IfcWindow: "Cửa sổ", IfcWall: "Tường", IfcWallStandardCase: "Tường", IfcCurtainWall: "Vách kính",
  IfcSlab: "Sàn", IfcColumn: "Cột", IfcBeam: "Dầm", IfcStair: "Cầu thang", IfcStairFlight: "Cầu thang", IfcRamp: "Dốc",
  IfcRampFlight: "Dốc", IfcRailing: "Lan can", IfcRoof: "Mái", IfcCovering: "Trần, ốp", IfcPlate: "Tấm", IfcMember: "Thanh",
  IfcFurniture: "Đồ nội thất", IfcFurnishingElement: "Đồ nội thất", IfcSanitaryTerminal: "Thiết bị vệ sinh", IfcSpace: "Phòng",
  IfcFlowTerminal: "Thiết bị", IfcBuildingElementProxy: "Bộ phận khác", IfcOpeningElement: "Lỗ mở",
};

export function ifcTypeLabel(type: string): string {
  return IFC_TYPE_LABELS[type] ?? "Bộ phận khác";
}
