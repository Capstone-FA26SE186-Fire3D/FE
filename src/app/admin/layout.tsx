import { Suspense, type ReactNode } from "react";
import "@/features/admin-overview/components/admin-ui.css";
import { OperationsShell } from "@/layouts/operations-shell";
import { LoadingBlock } from "@/components/ui/spinner";
import { ThemeScope } from "@/features/theme/theme-scope";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <Suspense fallback={<ThemeScope><main className="ops-access"><LoadingBlock label="Đang mở khu quản trị…" /></main></ThemeScope>}><OperationsShell areaId="admin"><div className="adm">{children}</div></OperationsShell></Suspense>;
}
