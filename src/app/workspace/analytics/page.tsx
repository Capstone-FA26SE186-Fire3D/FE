import { AnalyticsWorkspace } from "@/features/analytics/components/analytics-workspace";

export const metadata = { title: "Báo cáo" };

export default function WorkspaceAnalyticsPage() {
  return <AnalyticsWorkspace
    variant="organization"
    title="Báo cáo huấn luyện"
    description="Số liệu lấy từ API: chỉ hiển thị dữ liệu được cung cấp. Chỉ tính phiên học thật; playtest và bước chuẩn bị gói không được tính."
    eyebrow="Theo dõi" breadcrumbs={[{ label: "Báo cáo" }]}
  />;
}
