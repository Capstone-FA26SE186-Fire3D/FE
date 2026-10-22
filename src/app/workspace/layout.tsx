import { Suspense, type ReactNode } from "react";
import "@/assets/styles/ops-org.css";
import { OperationsShell } from "@/layouts/operations-shell";

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return <Suspense fallback={<main className="page-main"><p role="status">Đang mở không gian tổ chức…</p></main>}><OperationsShell areaId="organization">{children}</OperationsShell></Suspense>;
}
