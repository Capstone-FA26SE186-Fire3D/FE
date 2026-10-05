import { Suspense } from "react";
import { HubView } from "@/features/learning-hub/components/hub-view";

export const metadata = { title: "Thư viện cá nhân" };

export default function LearningHubPage() {
  return <Suspense fallback={<main className="page-main"><p role="status">Đang mở Thư viện cá nhân…</p></main>}><HubView /></Suspense>;
}
