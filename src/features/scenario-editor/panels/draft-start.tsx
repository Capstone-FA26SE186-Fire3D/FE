"use client";

import { FilePlus2, FolderOpen } from "lucide-react";
import { useState, type FormEvent } from "react";

import { useAsyncData } from "@/api/use-async-data";
import { useIdempotencyKey } from "@/api/idempotency";
import { ApiError } from "@/api/types/common";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Select } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { buildingsApi } from "@/features/buildings/api";
import { scenarioVersionsApi } from "@/features/scenarios/versions-api";

import { scenarioEditorApi } from "../api";

/**
 * Entry screen when the URL has no `?draft=`. Drafts of the scenario come from the server (newest save first), so work
 * is found again after a reload or on another machine; the editor can also create a new draft on a revision
 * (Idempotency-Key, stable per scenario+revision).
 */
export function DraftStart({ accessToken, buildingId, scenarioId, onOpen }: { accessToken: string; buildingId: string; scenarioId: string; onOpen: (draftId: string) => void }) {
  const revisions = useAsyncData(`editor-revisions:${buildingId}`, () => buildingsApi.listRevisions(accessToken, buildingId, 1, 50));
  const drafts = useAsyncData(`editor-drafts:${scenarioId}`, (signal) => scenarioVersionsApi.listDrafts(accessToken, scenarioId, 1, 50, signal));
  const scenario = useAsyncData(`editor-scenario:${scenarioId}`, (signal) => scenarioVersionsApi.getScenario(accessToken, scenarioId, signal));
  const { keyFor, done } = useIdempotencyKey();
  const [revisionId, setRevisionId] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const items = revisions.data?.items ?? [];
  const selected = revisionId || items[0]?.id || "";

  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected || creating) return;
    setCreating(true);
    setError(null);
    try {
      const created = await scenarioEditorApi.createDraft(accessToken, scenarioId, selected, keyFor({ scenarioId, revisionId: selected }));
      done();
      onOpen(created.id);
    } catch (cause) {
      setError(cause instanceof ApiError ? (cause.fieldErrors[0]?.message ?? cause.message) : "Không thể tạo bản nháp.");
    } finally {
      setCreating(false);
    }
  };

  return <div className="se-start">
    <h1>Soạn kịch bản</h1>
    <p>Tiếp tục một bản nháp đã lưu của kịch bản, hoặc tạo bản mới trên một revision IFC.</p>
    <Panel title="Bản nháp đã lưu" description="Danh sách do máy chủ trả, bản lưu gần nhất trước. Mở lại được sau khi tải lại trang hoặc đổi máy.">
      {drafts.loading && !drafts.data ? <div role="status"><Skeleton style={{ height: 42 }} /></div>
        : drafts.error ? <Alert tone="danger" title="Không tải được danh sách bản nháp" action={<Button type="button" size="sm" variant="secondary" onClick={drafts.reload}>Thử lại</Button>} />
          : (drafts.data?.items.length ?? 0) === 0 ? <EmptyState icon={FolderOpen} title="Chưa có bản nháp nào" description="Tạo bản nháp đầu tiên ở bên dưới." />
            : <ul className="ops-stack" aria-label="Bản nháp đã lưu" style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {drafts.data?.items.map((draft) => <li key={draft.id} className="ops-actions" style={{ justifyContent: "space-between" }}>
                <span>#{draft.draftNumber} · {new Date(draft.updatedAt).toLocaleString("vi-VN")}{draft.lastEditedByName ? " · " + draft.lastEditedByName : ""}{draft.schemaVersion ? " · " + draft.schemaVersion : " · cũ"}{draft.id === scenario.data?.currentDraftId ? " · hiện tại" : ""}</span>
                <Button type="button" size="sm" variant={draft.id === scenario.data?.currentDraftId ? "primary" : "secondary"} onClick={() => onOpen(draft.id)} data-testid={"open-draft-" + draft.id}><FolderOpen size={16} aria-hidden="true" /> Mở bản nháp</Button>
              </li>)}
            </ul>}
    </Panel>
    <Panel title="Tạo bản nháp mới" description="Mỗi bản nháp gắn với một revision IFC.">
      {revisions.loading && !revisions.data ? <div role="status"><Skeleton style={{ height: 42 }} /></div>
        : revisions.error ? <Alert tone="danger" title="Không tải được danh sách revision" action={<Button type="button" size="sm" variant="secondary" onClick={revisions.reload}>Thử lại</Button>} />
          : items.length === 0 ? <EmptyState icon={FilePlus2} title="Công trình chưa có revision IFC" description="Tải lên và xử lý một mô hình IFC trước khi tạo bản nháp kịch bản." />
            : <form className="ops-stack" onSubmit={create}>
              <Field label="Revision IFC" required>
                {(props) => <Select {...props} value={selected} onChange={(event) => setRevisionId(event.target.value)}>
                  {items.map((revision) => <option key={revision.id} value={revision.id}>{revision.versionLabel} · {revision.status}</option>)}
                </Select>}
              </Field>
              {error && <Alert tone="danger" title="Tạo bản nháp thất bại">{error}</Alert>}
              <div><Button type="submit" disabled={creating} data-testid="create-draft">{creating ? "Đang tạo…" : "Tạo bản nháp"}</Button></div>
            </form>}
    </Panel>
  </div>;
}
