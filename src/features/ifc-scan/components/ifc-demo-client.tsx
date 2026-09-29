"use client";

import dynamic from "next/dynamic";

const IfcScanWorkspace = dynamic(
  () => import("./ifc-scan-workspace").then((module) => module.IfcScanWorkspace),
  { ssr: false, loading: () => <p className="page-main">Đang chuẩn bị bộ đọc IFC…</p> },
);

export function IfcDemoClient() {
  return <IfcScanWorkspace />;
}
