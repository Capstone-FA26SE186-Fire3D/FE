"use client";

import { FileX2, ShieldAlert } from "lucide-react";
import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { routes } from "@/configs/routes";

import type { LoadedDraft } from "../api";
import { useScenarioEditor } from "../use-scenario-editor";
import { EditorSkeleton } from "./editor-skeleton";
import { EditorWorkspace } from "./editor-workspace";

/**
 * Draft without `schemaVersion`: edited in the historical typed shape (spawnPoints / hazards / ...), exactly as before.
 * Nothing here writes a `fet3d.editor/1` document and no coordinate is converted.
 */
export function LegacyHost({ accessToken, buildingId, scenarioId, draftId, initial }: { accessToken: string; buildingId: string; scenarioId: string; draftId: string; initial: LoadedDraft }) {
  const editor = useScenarioEditor(accessToken, draftId, initial);
  if (editor.load.phase === "loading") return <EditorSkeleton />;
  if (editor.load.phase === "error") {
    const { status, message } = editor.load;
    const denied = status === 401 || status === 403;
    const missing = status === 404 || status === 400;
    return <div className="se-start">
      <EmptyState icon={denied ? ShieldAlert : FileX2} title={denied ? "Không có quyền mở bản nháp này" : missing ? "Không tìm thấy bản nháp" : "Không tải được bản nháp"}
        description={denied ? "Bản nháp thuộc tổ chức khác hoặc phiên đăng nhập đã hết hạn." : missing ? "Mã bản nháp không đúng hoặc không thuộc tổ chức của bạn." : message}
        action={<div className="ops-actions">{!denied && !missing && <Button type="button" onClick={editor.reload}>Thử lại</Button>}<Button asChild variant="secondary"><Link href={`${routes.workspaceBuildings}/${buildingId}/scenarios/${scenarioId}`}>Chọn bản nháp khác</Link></Button></div>} />
      {!denied && !missing && <Alert tone="danger" title="Chi tiết lỗi">{message}</Alert>}
    </div>;
  }
  return <EditorWorkspace accessToken={accessToken} buildingId={buildingId} scenarioId={scenarioId} editor={editor} />;
}
