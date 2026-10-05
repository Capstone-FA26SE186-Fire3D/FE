import { Suspense, type ReactNode } from "react";
import { OrganizationWorkspaceShell } from "@/features/organization-workspace/components/workspace-shell";

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return <Suspense fallback={<main className="page-main"><p role="status">Đang mở không gian tổ chức…</p></main>}><OrganizationWorkspaceShell>{children}</OrganizationWorkspaceShell></Suspense>;
}
