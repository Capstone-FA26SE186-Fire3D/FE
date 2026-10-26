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
};

export function capabilityLabel(id: string | null | undefined): string {
  return (id && CAPABILITY_LABELS[id]) || "Loại khác";
}
