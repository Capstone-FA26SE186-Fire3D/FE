import { AnalyticsWorkspace } from "@/features/analytics/components/analytics-workspace";

export const metadata = { title: "Báo cáo" };

export default function WorkspaceAnalyticsPage() {
  return <AnalyticsWorkspace
    variant="organization"
    title="Báo cáo"
    description="Số liệu do máy chủ ghi nhận; bấm biểu đồ để xem bảng chi tiết. Chỉ tính phiên học thật; playtest và bước chuẩn bị gói không được tính."
    eyebrow="Theo dõi" breadcrumbs={[{ label: "Báo cáo" }]}
  />;
}
