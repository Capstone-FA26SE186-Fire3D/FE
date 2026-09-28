"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { routes } from "@/configs/routes";
import { useAuthSession } from "@/features/auth/auth-session";
import { resolveOrganizationIfcAccess } from "../organization-access";

const IfcScanWorkspace = dynamic(
  () => import("./ifc-scan-workspace").then((module) => module.IfcScanWorkspace),
  { ssr: false, loading: () => <p role="status">Đang chuẩn bị bộ đọc IFC…</p> },
);

export function OrganizationIfcClient() {
  const { ready, user } = useAuthSession();
  const access = resolveOrganizationIfcAccess({ ready, user });

  if (access === "loading") {
    return <Card className="admin-card"><p role="status">Đang kiểm tra phiên đăng nhập…</p></Card>;
  }

  if (access === "sign-in") {
    return <Card className="admin-card"><h1>Mô hình IFC</h1><p>Hãy đăng nhập bằng tài khoản tổ chức để chuẩn bị mô hình IFC.</p><Button asChild><Link href={`${routes.login}?next=${routes.workspaceIfc}`}>Đăng nhập</Link></Button></Card>;
  }

  if (access === "denied") {
    return <Card className="admin-card"><h1>Không có quyền truy cập</h1><p>Tài khoản học viên không có quyền chuẩn bị mô hình IFC.</p></Card>;
  }

  return <IfcScanWorkspace eyebrow="Không gian tổ chức / IFC cục bộ" title="Chuẩn bị mô hình IFC" description="Quét mô hình ngay trong trình duyệt để rà soát cấu trúc, điểm neo và scenario nháp trước khi hệ thống backend lưu revision." />;
}
