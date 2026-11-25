"use client";

import { FileX2, Lock } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

import { describeApiError } from "@/api/describe-error";
import { ApiError } from "@/api/types/common";
import { useAsyncData } from "@/api/use-async-data";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useAuthSession } from "@/features/auth/auth-session";
import { EditorSkeleton } from "@/features/scenario-editor/panels/editor-skeleton";
import "@/features/scenario-editor/panels/editor.css";
import { V1Workspace } from "@/features/scenario-editor/panels/v1/v1-workspace";

import { fireInfrastructureApi, infrastructureBackend, toLoadedDraft } from "../api";
import { infrastructureTabHref } from "../locked";

/** 3D editor of one fire infrastructure version. Only a Draft is edited; any other status sends the author back to the list. */
export function InfrastructureEditor({ buildingId, infrastructureId }: { buildingId: string; infrastructureId: string }) {
  const { accessToken } = useAuthSession();
  // Read once per page: a silent token renewal must not reload the document under unsaved edits.
  const loaded = useAsyncData(`fire-infrastructure-edit:${infrastructureId}`, (signal) => fireInfrastructureApi.get(accessToken as string, infrastructureId, signal), Boolean(accessToken));
  const backend = useMemo(() => infrastructureBackend(infrastructureId), [infrastructureId]);

  if (!accessToken || (loaded.loading && !loaded.data)) return <EditorSkeleton />;
  const listHref = (revisionId: string) => infrastructureTabHref(buildingId, revisionId);
  if (!loaded.data) {
    const missing = loaded.error instanceof ApiError && (loaded.error.status === 404 || loaded.error.status === 400);
    return <div className="se-start">
      <EmptyState icon={FileX2} title={missing ? "Không tìm thấy phiên bản hạ tầng" : "Không tải được hạ tầng PCCC"} description={missing ? "Phiên bản không tồn tại hoặc không thuộc tổ chức của bạn." : describeApiError(loaded.error, "Hãy thử lại sau.")}
        action={<div className="ops-actions">{!missing && <Button type="button" onClick={loaded.reload}>Thử lại</Button>}<Button asChild variant="secondary"><Link href={`/workspace/buildings/${buildingId}?tab=ifc&sub=infrastructure`}>Về công trình</Link></Button></div>} />
    </div>;
  }
  const { infrastructure, etag } = loaded.data;
  if (infrastructure.status !== "Draft") {
    return <div className="se-start">
      <EmptyState icon={Lock} title={infrastructure.status === "Approved" ? "Phiên bản này đã khoá" : "Phiên bản này không còn sửa được"}
        description="Chỉ bản nháp mới sửa được. Sau khi có kết quả thẩm định, hãy tạo phiên bản mới ở danh sách."
        action={<Button asChild variant="secondary"><Link href={listHref(infrastructure.revisionId)}>Về danh sách phiên bản</Link></Button>} />
    </div>;
  }
  return <V1Workspace key={`${infrastructureId}:${etag}`} accessToken={accessToken} buildingId={buildingId} scenarioId="" draftId={infrastructureId}
    initial={toLoadedDraft(loaded.data)} infrastructure={{ backend, backHref: listHref(infrastructure.revisionId) }} />;
}
