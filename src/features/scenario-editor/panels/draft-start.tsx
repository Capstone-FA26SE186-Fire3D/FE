"use client";

import { FilePlus2, FolderOpen } from "lucide-react";
import { useState, type FormEvent } from "react";

import { useAsyncData } from "@/api/use-async-data";
import { useIdempotencyKey } from "@/api/idempotency";
import { ApiError } from "@/api/types/common";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { buildingsApi } from "@/features/buildings/api";

import { scenarioEditorApi } from "../api";
import { BE_ISSUES } from "../config";

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Entry screen when the URL has no `?draft=`. The BE has no endpoint that lists the drafts of a scenario (BE#53), so the
 * editor can either create a new draft on a revision (Idempotency-Key, stable per scenario+revision) or open a draft by id.
 */
export function DraftStart({ accessToken, buildingId, scenarioId, onOpen }: { accessToken: string; buildingId: string; scenarioId: string; onOpen: (draftId: string) => void }) {
  const revisions = useAsyncData(`editor-revisions:${buildingId}`, () => buildingsApi.listRevisions(accessToken, buildingId, 1, 50));
  const { keyFor, done } = useIdempotencyKey();
  const [revisionId, setRevisionId] = useState("");
  const [draftId, setDraftId] = useState("");
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

  const open = (event: FormEvent) => {
    event.preventDefault();
    if (GUID.test(draftId.trim())) onOpen(draftId.trim());
  };

  return <div className="se-start">
    <h1>Soạn kịch bản</h1>
    <p>Chọn bản nháp để chỉnh sửa. Hệ thống chưa có danh sách bản nháp theo kịch bản nên bạn tạo bản mới trên một revision, hoặc mở lại bằng mã bản nháp đã lưu.</p>
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
    <Panel title="Mở bản nháp đã có" description={`Dùng mã bản nháp (GUID). Xem ${BE_ISSUES.draftLookup.label}.`}>
      <form className="ops-stack" onSubmit={open}>
        <Field label="Mã bản nháp" error={draftId && !GUID.test(draftId.trim()) ? "Mã phải có dạng GUID." : undefined}>
          {(props) => <Input {...props} value={draftId} onChange={(event) => setDraftId(event.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" autoComplete="off" spellCheck={false} />}
        </Field>
        <div><Button type="submit" variant="secondary" disabled={!GUID.test(draftId.trim())}><FolderOpen size={16} aria-hidden="true" /> Mở bản nháp</Button></div>
      </form>
    </Panel>
  </div>;
}
