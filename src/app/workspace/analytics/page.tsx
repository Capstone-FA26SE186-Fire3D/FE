import { AnalyticsWorkspace } from "@/features/analytics/components/analytics-workspace";

export const metadata = { title: "Báo cáo" };

export default function WorkspaceAnalyticsPage() {
  return <AnalyticsWorkspace
    variant="organization"
    title="Báo cáo"
    description="Lượt tập của học viên và vận hành của tổ chức bạn. Chỉ tính phiên học thật; playtest và bước chuẩn bị gói không được tính."
    eyebrow="Theo dõi" breadcrumbs={[{ label: "Báo cáo" }]}
  />;
}
