"use client";

import { FilePlus2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { useIdempotencyKey } from "@/api/idempotency";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { routes } from "@/configs/routes";

import type { JsonObject } from "../store/json";
import { carryOverCandidates, carryOverExtras, type CarryKey } from "../v1/carry-over";
import { createDraftV1 } from "../v1/create-draft";
import { useRevisionFloors } from "../v1/use-revision-floors";
import { FloorsStatus, ReprocessGuide } from "./geometry-status";
import { describeApiError } from "@/api/describe-error";

/**
 * Shown above a draft that has no `schemaVersion`. The draft keeps its historical typed shape: it is edited as before, it is
 * never converted to v1 and no coordinate is reinterpreted (its positions have no declared frame or unit). A NEW draft in
 * `fet3d.editor/1` can be created when the revision has valid Geometry; only non-spatial fields can be copied, on request.
 */
export function LegacyBanner({ accessToken, buildingId, scenarioId, revisionId, draft, dirty }: { accessToken: string; buildingId: string; scenarioId: string; revisionId: string | undefined; draft: JsonObject; dirty: boolean }) {
  const floors = useRevisionFloors(accessToken, revisionId);
  const [open, setOpen] = useState(false);
  const reading = floors.reading;
  const canCreate = reading?.kind === "valid";

  return <Alert tone="warning" title="Bản nháp cũ (chưa soạn trên mô hình 3D)">
    <div className="ops-stack" data-testid="legacy-banner">
      <p style={{ margin: 0 }}>Tọa độ của bản nháp này không có khung tham chiếu hay đơn vị được khai báo nên <strong>không được tự chuyển đổi</strong>. Bạn vẫn sửa được theo cấu trúc cũ; lưu sẽ không đổi nó sang cấu trúc mới.</p>
      {reading?.kind === "reprocess" && revisionId ? <ReprocessGuide buildingId={buildingId} revisionId={revisionId} />
        : revisionId ? <FloorsStatus reading={reading} loading={floors.loading} error={floors.error} reload={floors.reload} buildingId={buildingId} revisionId={revisionId} /> : null}
      <div>
        <Button type="button" variant="secondary" size="sm" disabled={!canCreate} onClick={() => setOpen(true)} data-testid="create-v1-draft"
          title={canCreate ? undefined : "Cần mô hình 3D hợp lệ của bản IFC này"}>
          <FilePlus2 size={14} aria-hidden="true" /> Tạo bản nháp mới trên mô hình 3D
        </Button>
      </div>
    </div>
    {open && reading?.kind === "valid" && revisionId && (
      <ConvertDialog accessToken={accessToken} buildingId={buildingId} scenarioId={scenarioId} revisionId={revisionId} pin={reading.pin} draft={draft} dirty={dirty} onClose={() => setOpen(false)} />
    )}
  </Alert>;
}

function ConvertDialog({ accessToken, buildingId, scenarioId, revisionId, pin, draft, dirty, onClose }: {
  accessToken: string; buildingId: string; scenarioId: string; revisionId: string; pin: { artifactId: string; sha256Hash: string }; draft: JsonObject; dirty: boolean; onClose: () => void;
}) {
  const items = useMemo(() => carryOverCandidates(draft), [draft]);
  const [chosen, setChosen] = useState<Set<CarryKey>>(() => new Set());
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: string; initialized: boolean } | null>(null);
  const { keyFor, done } = useIdempotencyKey();

  const toggle = (key: CarryKey) => setChosen((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const create = async () => {
    if (creating || created) return;
    setCreating(true);
    setError(null);
    try {
      const extras = carryOverExtras(items, chosen);
      // One key per intention (scenario + revision + what is copied): a retry after a lost response replays the same POST.
      const result = await createDraftV1(accessToken, { scenarioId, revisionId, pin, extras, idempotencyKey: keyFor({ scenarioId, revisionId, copy: [...chosen].sort() }) });
      done();
      setCreated(result);
    } catch (cause) {
      setError(describeApiError(cause, "Không thể tạo bản nháp mới."));
    } finally {
      setCreating(false);
    }
  };

  const href = created ? `${routes.workspaceBuildings}/${buildingId}/scenarios/${scenarioId}?draft=${encodeURIComponent(created.id)}` : "";

  return <Modal open onOpenChange={(next) => { if (!next) onClose(); }} title="Tạo bản nháp mới trên mô hình 3D"
    description="Bản nháp mới được gắn với mô hình 3D hiện tại của bản IFC. Bản nháp cũ giữ nguyên, không bị ghi đè."
    footer={created
      ? <Button asChild><Link href={href} data-testid="open-new-draft">Mở bản nháp mới</Link></Button>
      : <><Button type="button" variant="quiet" onClick={onClose}>Hủy</Button><Button type="button" onClick={() => void create()} disabled={creating} data-testid="confirm-create-v1">{creating ? "Đang tạo…" : "Tạo bản nháp mới"}</Button></>}>
    <div className="ops-stack">
      <Alert tone="info" title="Không sao chép vị trí">Điểm xuất phát và nguy cơ cũ không được chuyển sang vì chưa biết khung tọa độ và đơn vị của chúng. Hãy đặt lại đối tượng trên mô hình.</Alert>
      {dirty && <Alert tone="warning" title="Có thay đổi chưa lưu ở bản nháp cũ">Các thay đổi này không được đưa vào bản nháp mới. Lưu bản cũ trước nếu bạn muốn giữ chúng.</Alert>}
      {items.length > 0 && !created && <fieldset className="ops-fieldset">
        <legend>Sao chép nội dung không gắn vị trí (tùy chọn)</legend>
        <ul className="se-list" style={{ listStyle: "none" }}>
          {items.map((item) => <li key={item.key} style={{ display: "block" }}>
            <label className="se-check"><input type="checkbox" checked={chosen.has(item.key)} onChange={() => toggle(item.key)} data-testid={`carry-${item.key}`} /> {item.label} <small className="ops-field-hint">({item.summary})</small></label>
          </li>)}
        </ul>
        <p className="ops-field-hint">Chỉ những mục đã đúng định dạng mới được đề nghị. Rubric cũ theo định dạng khác phải nhập lại.</p>
      </fieldset>}
      {error && <Alert tone="danger" title="Tạo bản nháp thất bại">{error}</Alert>}
      {created && <Alert tone="success" title={created.initialized ? "Đã tạo bản nháp mới" : "Đã tạo bản nháp, chưa khởi tạo xong"}>
        {created.initialized ? "Bản nháp mới đã gắn với mô hình 3D. Mở nó để đặt đối tượng." : "Mở bản nháp mới rồi bấm “Khởi tạo” để gắn mô hình 3D; không có gì bị mất."}
      </Alert>}
    </div>
  </Modal>;
}
