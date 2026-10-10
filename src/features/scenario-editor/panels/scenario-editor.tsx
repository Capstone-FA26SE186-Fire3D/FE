"use client";

import { FileX2, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/configs/routes";
import { useAuthSession } from "@/features/auth/auth-session";

import "./editor.css";
import { useScenarioEditor } from "../use-scenario-editor";
import { DraftStart } from "./draft-start";
import { EditorWorkspace } from "./editor-workspace";

function remember(scenarioId: string, draftId: string | null) {
  try {
    const key = `fire3d-editor-draft:${scenarioId}`;
    if (draftId) window.localStorage.setItem(key, draftId);
  } catch {
    // Convenience only (BE#53: drafts cannot be listed); the editor works without it.
  }
}

function EditorSkeleton() {
  return <div className="se-root" role="status" aria-live="polite" aria-busy="true">
    <span className="se-sr">Đang tải bản nháp…</span>
    <Skeleton style={{ height: 28, width: 280, marginBottom: 12 }} />
    <Skeleton style={{ height: 48, marginBottom: 12 }} />
    <div className="se-body"><Skeleton style={{ height: "100%", minHeight: 360 }} /><Skeleton style={{ height: "100%", minHeight: 360 }} /><Skeleton style={{ height: "100%", minHeight: 360 }} /></div>
  </div>;
}

export function ScenarioEditor({ buildingId, scenarioId }: { buildingId: string; scenarioId: string }) {
  const { accessToken } = useAuthSession();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const draftId = params.get("draft");
  const editor = useScenarioEditor(accessToken, draftId);

  useEffect(() => {
    remember(scenarioId, draftId);
  }, [scenarioId, draftId]);

  if (!accessToken) return <EditorSkeleton />;
  if (!draftId) {
    return <DraftStart accessToken={accessToken} buildingId={buildingId} scenarioId={scenarioId} onOpen={(id) => router.replace(`${pathname}?draft=${encodeURIComponent(id)}`)} />;
  }
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
