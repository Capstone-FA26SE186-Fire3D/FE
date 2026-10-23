import { Suspense, type ReactNode } from "react";
import "@/assets/styles/ops-org.css";
import { AiBubble } from "@/features/org-ai/floating/ai-bubble";
import { AiBubbleProvider } from "@/features/org-ai/floating/ai-bubble-context";
import { OperationsShell } from "@/layouts/operations-shell";

// The AI conversation state sits above the shell (which re-mounts its children per pathname), so it survives navigation.
export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return <Suspense fallback={<main className="page-main"><p role="status">Đang mở không gian tổ chức…</p></main>}><AiBubbleProvider><OperationsShell areaId="organization">{children}<AiBubble /></OperationsShell></AiBubbleProvider></Suspense>;
}
