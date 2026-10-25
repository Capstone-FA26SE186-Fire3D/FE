import { Suspense } from "react";
import "@/assets/styles/ops.css";
import { LoadingBlock } from "@/components/ui/spinner";
import { HubView } from "@/features/learning-hub/components/hub-view";
import { ThemeScope } from "@/features/theme/theme-scope";

export const metadata = { title: "Thư viện cá nhân" };

// Same brand spinner as `/workspace` and `/admin` while the page and the session load.
export default function LearningHubPage() {
  return <Suspense fallback={<ThemeScope><main className="ops-access"><LoadingBlock label="Đang mở thư viện cá nhân…" /></main></ThemeScope>}><HubView /></Suspense>;
}
