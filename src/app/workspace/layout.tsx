import { Suspense, type ReactNode } from "react";
import "@/assets/styles/ops-org.css";
import { AiBubble } from "@/features/org-ai/floating/ai-bubble";
import { AiBubbleProvider } from "@/features/org-ai/floating/ai-bubble-context";
import { OperationsShell } from "@/layouts/operations-shell";
import { LoadingBlock } from "@/components/ui/spinner";
import { ThemeScope } from "@/features/theme/theme-scope";

// The AI conversation state sits above the shell (which re-mounts its children per pathname), so it survives navigation.
export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return <Suspense fallback={<ThemeScope><main className="ops-access"><LoadingBlock label="Đang mở không gian tổ chức…" /></main></ThemeScope>}><AiBubbleProvider><OperationsShell areaId="organization">{children}<AiBubble /></OperationsShell></AiBubbleProvider></Suspense>;
}
