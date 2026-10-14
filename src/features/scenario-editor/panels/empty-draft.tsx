"use client";

import Link from "next/link";
import { useState } from "react";

import { ApiError } from "@/api/types/common";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { routes } from "@/configs/routes";

import type { LoadedDraft } from "../api";
import { initializeDraft } from "../v1/create-draft";
import { useRevisionFloors } from "../v1/use-revision-floors";
import { FloorsStatus } from "./geometry-status";
import { describeApiError } from "@/api/describe-error";

/**
 * A draft whose state is `{}` (just created). The first PUT must be a document that declares `schemaVersion`, so the editor
 * starts it as `fet3d.editor/1` with the pinned Geometry and nothing else: no object, no position, no default value.
 */
export function EmptyDraftPanel({ accessToken, buildingId, scenarioId, draftId, initial, onInitialized }: { accessToken: string; buildingId: string; scenarioId: string; draftId: string; initial: LoadedDraft; onInitialized: () => void }) {
  const revisionId = initial.draft.revisionId;
  const floors = useRevisionFloors(accessToken, revisionId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reading = floors.reading;

  const initialize = async () => {
    if (reading?.kind !== "valid" || busy) return;
    setBusy(true);
    setError(null);
    try {
      await initializeDraft(accessToken, draftId, initial.etag, reading.pin);
      onInitialized();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 412) setError("Bản nháp vừa được thay đổi ở nơi khác. Tải lại trang để xem nội dung mới nhất; chưa có gì bị ghi đè.");
      else setError(describeApiError(cause, "Không thể khởi tạo bản nháp."));
    } finally {
      setBusy(false);
    }
  };

  return <div className="se-start" data-testid="empty-draft">
    <h1>Khởi tạo bản nháp</h1>
    <p>Bản nháp này còn trống. Bản nháp mới dùng contract <code>fet3d.editor/1</code>: ghim Geometry của revision rồi đặt đối tượng trên mô hình.</p>
    <Panel title="Geometry của revision" description="Đối tượng được đặt theo tọa độ cục bộ của từng tầng nên cần Geometry hợp lệ.">
      <div className="ops-stack">
        <FloorsStatus reading={reading} loading={floors.loading} error={floors.error} reload={floors.reload} buildingId={buildingId} revisionId={revisionId} />
        {error && <Alert tone="danger" title="Khởi tạo thất bại">{error}</Alert>}
        <div className="ops-actions">
          <Button type="button" onClick={() => void initialize()} disabled={reading?.kind !== "valid" || busy} data-testid="initialize-draft">{busy ? "Đang khởi tạo…" : "Khởi tạo bản nháp theo fet3d.editor/1"}</Button>
          <Button asChild variant="quiet"><Link href={`${routes.workspaceBuildings}/${buildingId}/scenarios/${scenarioId}`}>Chọn bản nháp khác</Link></Button>
        </div>
      </div>
    </Panel>
  </div>;
}
