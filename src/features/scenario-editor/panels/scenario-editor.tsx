"use client";

import { FileX2, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { routes } from "@/configs/routes";
import { useAuthSession } from "@/features/auth/auth-session";
import { LIBRARY_USE_PARAM } from "@/features/library/use-param";
import { AI_PROPOSAL_PARAM } from "@/features/org-ai/proposal-param";

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
  const pathname = usePathname();
  const draftId = params.get("draft");
  // A stored AI proposal chosen on /workspace/ai, or a sample chosen on /workspace/library, follows the author to the draft they open; both are ids only.
  const aiRequest = params.get(AI_PROPOSAL_PARAM);
  const carried = [AI_PROPOSAL_PARAM, LIBRARY_USE_PARAM].flatMap((name) => { const value = params.get(name); return value ? [`&${name}=${encodeURIComponent(value)}`] : []; }).join("");
  const probe = useDraftProbe(accessToken, draftId);
  const backHref = `${routes.workspaceBuildings}/${buildingId}/scenarios/${scenarioId}`;

  if (!accessToken) return <EditorSkeleton />;
  if (!draftId) {
    return <DraftStart accessToken={accessToken} buildingId={buildingId} scenarioId={scenarioId} onOpen={(id) => window.history.replaceState(null, "", `${pathname}?draft=${encodeURIComponent(id)}${carried}`)} />;
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
      <EmptyState icon={FileX2} title="Bản nháp dùng định dạng chưa được hỗ trợ"
        description="Trình soạn này chỉ mở được bản nháp soạn trên mô hình 3D và bản nháp cũ. Nội dung không bị thay đổi."
        action={<Button asChild variant="secondary"><Link href={backHref}>Chọn bản nháp khác</Link></Button>} />
    </div>;
  }
  if (mode === "empty") {
    return <EmptyDraftPanel key={probe.key} accessToken={accessToken} buildingId={buildingId} scenarioId={scenarioId} draftId={draftId} initial={loaded} onInitialized={probe.reload} />;
  }
  if (mode === "v1") {
    return <V1Workspace key={`${probe.key}:${loaded.etag}`} accessToken={accessToken} buildingId={buildingId} scenarioId={scenarioId} draftId={draftId} initial={loaded} />;
  }
  return <>
    {aiRequest && <div className="se-banners"><Alert tone="warning" title="Đề xuất AI chỉ áp dụng được vào bản nháp soạn trên mô hình 3D">Bản nháp này theo định dạng cũ nên không nhận đề xuất AI. Chọn hoặc tạo bản nháp mới trên mô hình 3D của kịch bản, hoặc quay lại Trợ lý AI.</Alert></div>}
    <LegacyHost key={probe.key} accessToken={accessToken} buildingId={buildingId} scenarioId={scenarioId} draftId={draftId} initial={loaded} />
  </>;
}
