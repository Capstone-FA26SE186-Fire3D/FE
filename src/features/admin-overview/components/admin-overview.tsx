"use client";

import { AnalyticsWorkspace } from "@/features/analytics/components/analytics-workspace";

/** Platform overview: operations, learner training and revenue, all from the analytics endpoints (period in the URL). */
export function AdminOverview() {
  return <AnalyticsWorkspace
    variant="platform"
    title="Tổng quan vận hành"
    description="Vận hành, huấn luyện của học viên và doanh thu toàn hệ thống lấy trực tiếp từ Fire3D API."
    breadcrumbs={[{ label: "Quản trị" }, { label: "Tổng quan" }]}
  />;
}
