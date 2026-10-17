"use client";

import { DoorOpen, PackageSearch, RefreshCw } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { ApiError } from "@/api/types/common";
import { useAsyncData } from "@/api/use-async-data";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import { SkeletonRows } from "@/components/ui/skeleton";
import { StatusBadge, type Tone } from "@/components/ui/status-badge";
import { Table, TableMessage } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { scenarioEditorApi } from "@/features/scenario-editor/api";
import { parseRuntimeCatalog } from "@/features/scenario-editor/v1/catalog";

import { buildingsApi } from "../api";
import { describeApiError } from "../format";
import type { EquipmentCandidate, EquipmentCandidates, EquipmentDecisionInput, EquipmentDecisionKind } from "../types";

export const EXIT_KEY = "door.exit";
const isDoor = (candidate: EquipmentCandidate) => (candidate.ifcClass ?? "").startsWith("IfcDoor");

type Draft = { decision: EquipmentDecisionKind; catalogKey: string };

const DECISION: Record<string, { label: string; tone: Tone }> = {
  Confirmed: { label: "Đã xác nhận", tone: "success" },
  Retyped: { label: "Đã đổi loại", tone: "info" },
  Rejected: { label: "Đã loại bỏ", tone: "neutral" },
};

/** The key a decision leaves the candidate with: Retyped/Confirmed with a key use it, Confirmed alone keeps the detected one. */
function effectiveKey(candidate: EquipmentCandidate, draft?: Draft): string | null {
  const decision = draft ?? (candidate.decision ? { decision: candidate.decision.decision as EquipmentDecisionKind, catalogKey: candidate.decision.catalogKey ?? "" } : null);
  if (!decision || decision.decision === "Rejected") return decision ? null : candidate.catalogKey;
  return decision.catalogKey || candidate.catalogKey;
}

/**
 * Equipment the IFC worker proposed (IFC-04): the OrganizationUser confirms, retypes or rejects each candidate, and picks an
 * existing door as the exit when QA reported IFC_EXIT_UNKNOWN (option B: no re-upload; the BE moves the revision to
 * ReadyForScenario once an IfcDoor is `door.exit`). Decisions are saved together with If-Match; a 412 reloads the server
 * view and keeps the unsaved choices for review. Nothing here edits a scenario draft.
 */
export function EquipmentPanel({ accessToken, revisionId, onChanged, onHighlight }: {
  accessToken: string;
  revisionId: string;
  /** The revision status may have changed (NeedsFix ⇄ ReadyForScenario). */
  onChanged: () => void;
  onHighlight?: (ifcGlobalIds: string[]) => void;
}) {
  const toast = useToast();
  const [reload, setReload] = useState(0);
  const view = useAsyncData(`equipment:${revisionId}:${reload}`, (signal) => buildingsApi.getEquipmentCandidates(accessToken, revisionId, signal), true, { keepPrevious: false });
  const catalog = useAsyncData("equipment:catalog", (signal) => scenarioEditorApi.catalog(accessToken, signal));
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saved, setSaved] = useState<{ data: EquipmentCandidates; etag: string } | null>(null);
  const [error, setError] = useState<unknown>();
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);

  const current = saved && saved.data.revisionId === revisionId ? saved : view.data ? { data: view.data.data, etag: view.data.etag ?? `"${view.data.data.version}"` } : null;
  const data = current?.data;
  const equipmentKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const runtime of parseRuntimeCatalog(catalog.data)) for (const capability of runtime.capabilities) if (capability.objectKinds.includes("Equipment")) keys.add(capability.id);
    return [...keys].sort();
  }, [catalog.data]);
  const exitAllowed = equipmentKeys.includes(EXIT_KEY);
  const doors = (data?.items ?? []).filter(isDoor);
  const pending = Object.entries(drafts);
  const exitChosen = (data?.items ?? []).some((candidate) => isDoor(candidate) && effectiveKey(candidate, drafts[candidate.id]) === EXIT_KEY);

  const set = (candidate: EquipmentCandidate, draft: Draft | null) => setDrafts((all) => {
    const next = { ...all };
    if (draft) next[candidate.id] = draft;
    else delete next[candidate.id];
    return next;
  });
  const chooseExit = (candidate: EquipmentCandidate) => set(candidate, candidate.catalogKey === EXIT_KEY ? { decision: "Confirmed", catalogKey: "" } : { decision: "Retyped", catalogKey: EXIT_KEY });

  const save = async () => {
    if (!current || lock.current || pending.length === 0) return;
    lock.current = true;
    setBusy(true);
    setError(undefined);
    setConflict(false);
    const items: EquipmentDecisionInput[] = pending.map(([candidateId, draft]) => ({
      candidateId, decision: draft.decision, ...(draft.decision !== "Rejected" && draft.catalogKey ? { catalogKey: draft.catalogKey } : {}),
    }));
    try {
      const result = await buildingsApi.saveEquipmentDecisions(accessToken, revisionId, items, current.etag);
      setSaved({ data: result.data, etag: result.etag ?? `"${result.data.version}"` });
      setDrafts({});
      toast.notify({ tone: "success", title: "Đã lưu quyết định thiết bị", description: result.data.exitConfirmationRequired ? undefined : result.data.revisionStatus === "ReadyForScenario" ? "Revision đã sẵn sàng soạn kịch bản." : undefined });
      onChanged();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 412) {
        // Someone saved meanwhile: show their decisions, keep ours as unsaved choices to review and save again.
        setConflict(true);
        setSaved(null);
        setReload((value) => value + 1);
      } else setError(cause);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  const unavailable = view.error instanceof ApiError && view.error.code === "EQUIPMENT_CANDIDATES_UNAVAILABLE";

  return <Panel title="Thiết bị phát hiện từ IFC" description="Worker đề xuất thiết bị PCCC, nguồn nước, cửa và thang máy từ IFC. Xác nhận, đổi loại hoặc loại bỏ; mô hình 3D của thiết bị luôn lấy từ thư viện dùng chung." actions={<Button size="sm" variant="quiet" onClick={() => { setSaved(null); setReload((value) => value + 1); }} disabled={view.loading || busy}><RefreshCw size={14} aria-hidden="true" />Tải lại</Button>}>
    <div className="ops-stack" data-testid="equipment-panel">
      {view.loading && !view.data && <SkeletonRows rows={3} label="Đang tải thiết bị…" />}
      {unavailable && <Alert tone="info" title="Chưa có hình học được chấp nhận">Danh sách thiết bị có sau khi xử lý IFC xong và QA đạt (không còn lỗi Error/Critical).</Alert>}
      {view.error !== undefined && !unavailable && <Alert tone="danger" title="Không tải được thiết bị" action={<Button size="sm" variant="secondary" className="mt-3" onClick={view.reload}>Thử lại</Button>}>{describeApiError(view.error, "Hãy thử lại sau.")}</Alert>}
      {conflict && <Alert tone="warning" title="Danh sách vừa được lưu ở nơi khác">Đã tải bản mới nhất. Các lựa chọn chưa lưu của bạn vẫn được giữ (đánh dấu “Chưa lưu”); xem lại rồi bấm lưu lần nữa.</Alert>}

      {data?.exitConfirmationRequired && <div data-testid="exit-step"><Alert tone="warning" title="Chọn cửa thoát ra ngoài">
        QA không tìm thấy cửa thoát (IFC_EXIT_UNKNOWN) nên revision đang ở trạng thái Cần sửa. Chọn một cửa có sẵn làm lối thoát rồi lưu; không cần tải lại IFC.
        {!exitAllowed && catalog.data && " Runtime hiện hành chưa hỗ trợ loại door.exit, nên chưa chọn được; hãy báo PlatformAdmin."}
        {doors.length === 0 && " Worker không gửi cửa nào trong danh sách thiết bị; cần tải lại IFC có cửa (IfcDoor)."}
        {exitChosen && " Đã chọn ít nhất một cửa thoát; bấm “Lưu quyết định”."}
      </Alert></div>}

      {data && !data.metadataAvailable && <EmptyState icon={PackageSearch} title="Worker chưa gửi dữ liệu thiết bị" description="Revision này không có building_metadata. Đặt thiết bị trong trình soạn kịch bản." />}
      {data && data.metadataAvailable && data.items.length === 0 && <EmptyState icon={PackageSearch} title="IFC không có thiết bị nào" description="Không phát hiện thiết bị PCCC hay nguồn nước. Đặt chúng trong trình soạn kịch bản khi soạn kịch bản." />}

      {data && data.items.length > 0 && <Table caption="Thiết bị phát hiện từ IFC" data-testid="equipment-table">
        <thead><tr><th>Thiết bị</th><th>Độ tin cậy</th><th>Quyết định</th><th>Thao tác</th></tr></thead>
        <tbody>
          {data.items.map((candidate) => {
            const draft = drafts[candidate.id];
            const shown = candidate.decision ? DECISION[candidate.decision.decision] : null;
            const key = effectiveKey(candidate, draft);
            return <tr key={candidate.id} data-testid="equipment-row" data-candidate={candidate.id}>
              <td>
                <span className="ops-mono">{key ?? candidate.catalogKey}</span>{key && key !== candidate.catalogKey && <span className="ops-cell-sub">phát hiện: {candidate.catalogKey}</span>}
                <span className="ops-cell-sub">{candidate.ifcClass ?? "—"} · {candidate.ifcGlobalId}{candidate.floorId ? ` · tầng ${candidate.floorId}` : ""}{candidate.source === "inferred" ? " · suy luận" : ""}</span>
                {onHighlight && <Button type="button" size="sm" variant="quiet" onClick={() => onHighlight([candidate.ifcGlobalId])}>Xem trong mô hình</Button>}
              </td>
              <td>{Math.round(candidate.confidence * 100)}%{candidate.needsConfirmation && <span className="ops-cell-sub">Cần xác nhận</span>}</td>
              <td>
                {draft ? <StatusBadge tone="warning">Chưa lưu: {draft.decision === "Rejected" ? "loại bỏ" : draft.decision === "Retyped" ? `đổi sang ${draft.catalogKey}` : "xác nhận"}</StatusBadge>
                  : shown ? <StatusBadge tone={shown.tone}>{shown.label}{candidate.decision?.catalogKey ? ` (${candidate.decision.catalogKey})` : ""}</StatusBadge>
                  : <StatusBadge tone="neutral">Chưa quyết định</StatusBadge>}
                {!candidate.decision && !draft && candidate.suggestedDecision && <span className="ops-cell-sub" data-testid="equipment-suggestion">Gợi ý từ revision trước: {DECISION[candidate.suggestedDecision.decision]?.label ?? candidate.suggestedDecision.decision}{candidate.suggestedDecision.catalogKey ? ` (${candidate.suggestedDecision.catalogKey})` : ""} <Button type="button" size="sm" variant="quiet" onClick={() => set(candidate, { decision: candidate.suggestedDecision!.decision as EquipmentDecisionKind, catalogKey: candidate.suggestedDecision!.catalogKey ?? "" })}>Dùng gợi ý</Button></span>}
              </td>
              <td>
                <div className="ops-actions" style={{ flexWrap: "wrap", whiteSpace: "nowrap" }}>
                  <Button type="button" size="sm" variant="secondary" onClick={() => set(candidate, { decision: "Confirmed", catalogKey: "" })} disabled={busy} aria-label={`Xác nhận ${candidate.ifcGlobalId}`}>Xác nhận</Button>
                  <Select aria-label={`Đổi loại ${candidate.ifcGlobalId}`} style={{ width: 190 }} value={draft?.decision === "Retyped" ? draft.catalogKey : ""} disabled={busy || equipmentKeys.length === 0}
                    onChange={(event) => set(candidate, event.target.value ? { decision: "Retyped", catalogKey: event.target.value } : null)}>
                    <option value="">Đổi loại…</option>
                    {equipmentKeys.map((value) => <option key={value} value={value}>{value}</option>)}
                  </Select>
                  {isDoor(candidate) && exitAllowed && <Button type="button" size="sm" variant={key === EXIT_KEY ? "primary" : "quiet"} onClick={() => chooseExit(candidate)} disabled={busy} data-testid="equipment-exit" aria-label={`Chọn ${candidate.ifcGlobalId} làm cửa thoát`}><DoorOpen size={14} aria-hidden="true" />Làm cửa thoát</Button>}
                  <Button type="button" size="sm" variant="quiet" onClick={() => set(candidate, { decision: "Rejected", catalogKey: "" })} disabled={busy} aria-label={`Loại bỏ ${candidate.ifcGlobalId}`}>Loại bỏ</Button>
                  {draft && <Button type="button" size="sm" variant="quiet" onClick={() => set(candidate, null)} disabled={busy}>Bỏ chọn</Button>}
                </div>
              </td>
            </tr>;
          })}
          {view.loading && !data && <TableMessage colSpan={4}><SkeletonRows rows={2} label="Đang tải…" /></TableMessage>}
        </tbody>
      </Table>}

      {error !== undefined && <Alert tone="danger" title="Chưa lưu được quyết định">{describeApiError(error, "Hãy thử lại.")} Các lựa chọn vẫn được giữ.</Alert>}
      {data && data.items.length > 0 && <div className="ops-actions">
        <Button type="button" onClick={() => void save()} disabled={busy || pending.length === 0} data-testid="equipment-save">{busy ? "Đang lưu…" : `Lưu quyết định${pending.length ? ` (${pending.length})` : ""}`}</Button>
        {pending.length > 0 && <Button type="button" variant="quiet" onClick={() => setDrafts({})} disabled={busy}>Bỏ các lựa chọn chưa lưu</Button>}
      </div>}
      <p className="ops-muted">Quyết định không sửa IFC hay kịch bản; trình soạn kịch bản dùng thiết bị đã xác nhận làm đối tượng Thiết bị neo vào cấu kiện IFC.</p>
    </div>
  </Panel>;
}
