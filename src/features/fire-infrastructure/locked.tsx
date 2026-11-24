"use client";

import Link from "next/link";

import { useAsyncData } from "@/api/use-async-data";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/configs/routes";

import { fireInfrastructureApi, lockedVersion } from "./api";

export const infrastructureTabHref = (buildingId: string, revisionId: string) => `${routes.workspaceBuildings}/${buildingId}?tab=ifc&sub=infrastructure&revision=${encodeURIComponent(revisionId)}`;

/** The locked (Approved) infrastructure of a revision: a scenario draft can only be created on one (BE#213). */
export function useLockedInfrastructure(accessToken: string, revisionId: string | undefined) {
  const versions = useAsyncData(`fire-infrastructures:${revisionId ?? ""}`, (signal) => fireInfrastructureApi.list(accessToken, revisionId as string, signal), Boolean(accessToken && revisionId));
  return { locked: versions.data ? lockedVersion(versions.data) : null, loading: versions.loading && !versions.data, error: versions.error !== undefined && !versions.data, reload: versions.reload };
}

export type LockedInfrastructure = ReturnType<typeof useLockedInfrastructure>;

/** Says which locked infrastructure a new draft will build on, or what to do when the revision has none yet. */
export function LockedInfrastructureNote({ state, buildingId, revisionId }: { state: LockedInfrastructure; buildingId: string; revisionId: string }) {
  if (state.loading) return <div role="status" aria-label="Đang kiểm tra hạ tầng PCCC"><Skeleton style={{ height: 36 }} /></div>;
  if (state.error) return <Alert tone="danger" title="Không đọc được hạ tầng PCCC của bản IFC" action={<Button type="button" size="sm" variant="secondary" onClick={state.reload}>Thử lại</Button>} />;
  if (!state.locked) {
    return <div data-testid="infrastructure-required"><Alert tone="warning" title="Bản IFC này chưa có Hạ tầng PCCC đạt thẩm định"
      action={<div className="mt-3"><Button asChild variant="secondary" size="sm"><Link href={infrastructureTabHref(buildingId, revisionId)} data-testid="infrastructure-link">Mở Hạ tầng PCCC</Link></Button></div>}>
      Tình huống dùng chung lối thoát, điểm tập kết và thiết bị cố định của Hạ tầng PCCC. Hãy lập hạ tầng và gửi Chuyên viên PCCC thẩm định; khi đạt, hạ tầng được khoá và bạn tạo được tình huống.
    </Alert></div>;
  }
  return <div data-testid="infrastructure-locked"><Alert tone="success" title={`Dùng Hạ tầng PCCC phiên bản ${state.locked.version} (đã khoá)`}>
    Lối thoát, điểm tập kết và thiết bị cố định lấy từ hạ tầng này; trong tình huống bạn đặt điểm xuất phát, nguy cơ, nhân vật, vật cản, và chọn cửa nào đang bị khoá hoặc bị chèn mở.
  </Alert></div>;
}
