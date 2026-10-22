import { Suspense, type ReactNode } from "react";
import "@/features/admin-overview/components/admin-ui.css";
import { OperationsShell } from "@/layouts/operations-shell";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <Suspense fallback={<main className="page-main"><p role="status">Đang mở khu quản trị…</p></main>}><OperationsShell areaId="admin"><div className="adm">{children}</div></OperationsShell></Suspense>;
}
