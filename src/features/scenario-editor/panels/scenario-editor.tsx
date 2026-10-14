"use client";

import { FileX2, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { routes } from "@/configs/routes";
import { useAuthSession } from "@/features/auth/auth-session";

import "./editor.css";
import { useDraftProbe } from "../use-draft-probe";
import { DraftStart } from "./draft-start";
import { EditorSkeleton } from "./editor-skeleton";
import { EmptyDraftPanel } from "./empty-draft";
import { LegacyHost } from "./legacy-host";
import { V1Workspace } from "./v1/v1-workspace";

/**
 * Entry of the scenario editor. The draft is read once and the mode follows what the server stored:
 * `fet3d.editor/1` -> v1 editor; `{}` -> initialize as v1; no `schemaVersion` -> legacy editor (never converted).
 */
export function ScenarioEditor({ buildingId, scenarioId }: { buildingId: string; scenarioId: string }) {
  const { accessToken } = useAuthSession();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const draftId = params.get("draft");
  const probe = useDraftProbe(accessToken, draftId);
  const backHref = `${routes.workspaceBuildings}/${buildingId}/scenarios/${scenarioId}`;

  if (!accessToken) return <EditorSkeleton />;
  if (!draftId) {
    return <DraftStart accessToken={accessToken} buildingId={buildingId} scenarioId={scenarioId} onOpen={(id) => router.replace(`${pathname}?draft=${encodeURIComponent(id)}`)} />;
  }
  const state = probe.state;
  if (state.phase === "loading") return <EditorSkeleton />;
  if (state.phase === "error") {
    const { status, message } = state;
    const denied = status === 401 || status === 403;
    const missing = status === 404 || status === 400;
    return <div className="se-start">
      <EmptyState icon={denied ? ShieldAlert : FileX2} title={denied ? "Không có quyền mở bản nháp này" : missing ? "Không tìm thấy bản nháp" : "Không tải được bản nháp"}
        description={denied ? "Bản nháp thuộc tổ chức khác hoặc phiên đăng nhập đã hết hạn." : missing ? "Mã bản nháp không đúng hoặc không thuộc tổ chức của bạn." : message}
        action={<div className="ops-actions">{!denied && !missing && <Button type="button" onClick={probe.reload}>Thử lại</Button>}<Button asChild variant="secondary"><Link href={backHref}>Chọn bản nháp khác</Link></Button></div>} />
      {!denied && !missing && <Alert tone="danger" title="Chi tiết lỗi">{message}</Alert>}
    </div>;
  }
  const { loaded, mode } = state;
  if (mode === "unsupported") {
    return <div className="se-start">
      <EmptyState icon={FileX2} title="Bản nháp dùng schemaVersion chưa được hỗ trợ"
        description={`Bản nháp khai báo schemaVersion “${state.schemaVersion ?? "?"}”. Editor này chỉ mở fet3d.editor/1 và bản nháp cũ không có schemaVersion. Nội dung không bị thay đổi.`}
        action={<Button asChild variant="secondary"><Link href={backHref}>Chọn bản nháp khác</Link></Button>} />
    </div>;
  }
  if (mode === "empty") {
    return <EmptyDraftPanel key={probe.key} accessToken={accessToken} buildingId={buildingId} scenarioId={scenarioId} draftId={draftId} initial={loaded} onInitialized={probe.reload} />;
  }
  if (mode === "v1") {
    return <V1Workspace key={`${probe.key}:${loaded.etag}`} accessToken={accessToken} buildingId={buildingId} scenarioId={scenarioId} draftId={draftId} initial={loaded} />;
  }
  return <LegacyHost key={probe.key} accessToken={accessToken} buildingId={buildingId} scenarioId={scenarioId} draftId={draftId} initial={loaded} />;
}
