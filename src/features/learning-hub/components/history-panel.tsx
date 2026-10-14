import { History } from "lucide-react";
import { routes } from "@/configs/routes";
import { CapabilityUnavailable } from "./capability-unavailable";

/**
 * "Lịch sử" and personal results. The web app has no Trainee session list yet (BE#78), so this explains that instead of an empty list that would read as "you have not trained". When the list
 * exists, the paged session list with its separate session status and result status mounts here.
 */
export function HistoryPanel() {
  return <CapabilityUnavailable
    icon={History}
    title="Lịch sử và kết quả cá nhân chưa khả dụng"
    reason="Danh sách lượt tập và kết quả cá nhân đang chờ hệ thống. Trang này chưa hiển thị được lượt tập nào, nên một danh sách trống không có nghĩa là bạn chưa tập."
    steps={[
      { label: "Đọc bài trong Learn", href: routes.learn },
      { label: "Xem bài đã lưu", href: "/learning-hub?view=saved" },
      { label: "Xem trang ứng dụng", href: routes.download },
    ]}
  />;
}
