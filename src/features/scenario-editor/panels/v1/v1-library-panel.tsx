"use client";

import { ArrowLeft, Library } from "lucide-react";
import { useMemo, useState } from "react";

import { useAsyncData } from "@/api/use-async-data";
import { formatDateTime } from "@/components/ops/detail-parts";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton, SkeletonRows } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { actionLabel, changesFor, chosenAction, planApply, summarizeChoices, type ApplyAction, type ApplyGroup, type Change, type Choices } from "@/features/library/apply";
import { VersionPreview } from "@/features/library/components/version-preview";
import { libraryApi } from "@/features/library/api";
import { describeLibraryError } from "@/features/library/errors";
import { SCENARIO_LIBRARY_KINDS, kindHint, kindLabel, type LibraryItem, type LibraryKind, type LibraryVersion } from "@/features/library/types";

import type { JsonObject } from "../../store/json";
import { findRuntime, type RubricCatalogView, type RuntimeOption } from "../../v1/catalog";
import type { ObjectView } from "../../v1/state";

/** One sample copied into the draft during this editing session. The draft itself cannot carry provenance (closed schema), so this is a session record. */
export type AppliedSample = { kind: LibraryKind; code: string; versionNumber: number; versionId: string; payloadHash: string; name: string; at: number };

/** Where the author is in the Library tab. Held by the workspace so switching to another tab and back keeps the chosen sample and the choices. */
/** `nonce` changes on every choice so choosing the same sample again re-reads it from the server instead of showing a cached copy. */
export type LibraryUi = { kind: LibraryKind; page: number; chosen: string | null; nonce: number; choices: Choices };
export const initialLibraryUi: LibraryUi = { kind: "ScenarioTemplate", page: 1, chosen: null, nonce: 0, choices: {} };

const PAGE_SIZE = 10;
const statusText: Record<ApplyGroup["status"], { tone: "success" | "neutral" | "warning"; label: string }> = {
  new: { tone: "success", label: "Chưa có trong bản nháp" },
  same: { tone: "neutral", label: "Đã giống mẫu" },
  different: { tone: "warning", label: "Bản nháp đã có nội dung" },
};

function GroupCard({ group, action, onChoose }: { group: ApplyGroup; action: ApplyAction; onChoose: (action: ApplyAction) => void }) {
  const status = statusText[group.status];
  return <fieldset className="ops-fieldset se-group" data-testid={`apply-group-${group.id}`} data-status={group.status}>
    <legend>{group.label} <StatusBadge tone={status.tone}>{status.label}</StatusBadge></legend>
    <div className="ops-stack" style={{ gap: 8 }}>
      <div><span className="ops-field-hint">Bản nháp hiện tại</span><p style={{ margin: "2px 0 0", fontSize: 13, overflowWrap: "anywhere" }} data-testid={`apply-current-${group.id}`}>{group.current}</p></div>
      <div><span className="ops-field-hint">Từ mẫu</span><p style={{ margin: "2px 0 0", fontSize: 13, overflowWrap: "anywhere" }} data-testid={`apply-incoming-${group.id}`}>{group.incoming}</p></div>
    </div>
    {group.options.length > 1 && <div role="radiogroup" aria-label={`Cách xử lý ${group.label}`} className="ops-stack" style={{ gap: 0 }}>
      {group.options.map((option) => <label key={option} className="se-check"><input type="radio" name={`apply-${group.id}`} checked={action === option} onChange={() => onChoose(option)} data-testid={`apply-${group.id}-${option}`} /> {actionLabel[option]}</label>)}
    </div>}
    {group.notes.map((note) => <p key={note} className="ops-field-hint" style={{ margin: 0 }}>{note}</p>)}
    {group.warnings.map((warning) => <span key={warning} className="ops-field-error" role="status">{warning}</span>)}
  </fieldset>;
}

function Preview({ version, draft, object, runtimeVersion, runtimes, rubric, applied, canUndoLast, onUndo, onApply, onBack, choices, onChoices }: {
  version: LibraryVersion;
  draft: JsonObject;
  object: ObjectView | undefined;
  runtimeVersion: string | undefined;
  runtimes: RuntimeOption[] | null;
  rubric: RubricCatalogView | null;
  applied: AppliedSample[];
  canUndoLast: (label: string) => boolean;
  onUndo: () => void;
  onApply: (changes: Change[], sample: Omit<AppliedSample, "at">) => void;
  onBack: () => void;
  choices: Choices;
  onChoices: (update: (choices: Choices) => Choices) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const runtime = runtimes && runtimeVersion ? findRuntime(runtimes, runtimeVersion) : undefined;
  const plan = useMemo(() => planApply(version, draft, {
    metrics: rubric ? new Set(rubric.metrics.map((metric) => metric.id)) : null,
    schemaVersions: rubric?.supportedSchemaVersions ?? null,
    object: object ? { index: object.index, kind: object.kind, id: object.id, label: object.label, capability: object.capability } : null,
    runtimeCapabilities: runtime ? runtime.capabilities : null,
  }), [version, draft, rubric, object, runtime]);
  const changes = changesFor(plan, choices);
  const summary = summarizeChoices(plan, choices);
  const label = `Áp dụng ${version.code} v${version.versionNumber}`;
  const lastOfThis = applied.length > 0 && applied[applied.length - 1].versionId === version.id && canUndoLast(label);
  const hasOverwrite = summary.replaced.length > 0 || summary.merged.length > 0;

  return <div className="ops-stack" data-testid="library-preview">
    <div><Button type="button" variant="quiet" size="sm" onClick={onBack}><ArrowLeft size={14} aria-hidden="true" /> Chọn mẫu khác</Button></div>
    <div>
      <h3 style={{ margin: 0, fontSize: 15 }}>{version.name}</h3>
      <p className="ops-field-hint" style={{ margin: "2px 0 0" }}>{kindLabel[version.kind]} · {version.code} · phiên bản v{version.versionNumber}</p>
    </div>
    <Alert tone="info" title="Áp dụng là sao chép">Nội dung được sao chép vào bản nháp này (có thể hoàn tác). Cập nhật mẫu về sau không đổi bản nháp này, các bản đã chụp hay bài đã phát hành.</Alert>

    <h4 style={{ margin: 0, fontSize: 13 }}>Xem trước thay đổi</h4>
    {plan.blocker && <Alert tone="warning" title="Chưa thể áp dụng"><span data-testid="apply-blocker">{plan.blocker}</span></Alert>}
    {plan.groups.map((group) => <GroupCard key={group.id} group={group} action={chosenAction(group, choices)} onChoose={(action) => onChoices((current) => ({ ...current, [group.id]: action }))} />)}
    {plan.ignored.length > 0 && <Alert tone="info" title="Không áp dụng">Template còn mang {plan.ignored.join(", ")}; các phần phụ thuộc công trình này không được sao chép. Đối tượng và vị trí do bạn đặt trên mô hình của mình.</Alert>}
    {plan.notes.map((note) => <p key={note} className="ops-field-hint" style={{ margin: 0 }}>{note}</p>)}
    {plan.reference.length > 0 && <div className="ops-stack" style={{ gap: 4 }} data-testid="equipment-reference">
      <span className="ops-field-label">Thông tin tham khảo</span>
      <dl style={{ margin: 0, display: "grid", gap: 4 }}>{plan.reference.map((row, index) => <div key={`${row.label}-${index}`}><dt className="ops-field-hint" style={{ margin: 0 }}>{row.label}</dt><dd style={{ margin: 0, fontSize: 13, overflowWrap: "anywhere" }}>{row.value}</dd></div>)}</dl>
    </div>}
    {version.kind === "Equipment" && <Alert tone="info" title="Không thêm khả năng mới cho ứng dụng"><span data-testid="no-capability-notice">Mẫu thiết bị này chỉ cung cấp thông tin tham khảo. Khả năng của đối tượng vẫn chọn từ danh sách của ứng dụng.</span></Alert>}

    <div className="ops-actions">
      <Button type="button" disabled={changes.length === 0} onClick={() => setConfirming(true)} data-testid="apply-open">{changes.length === 0 ? "Không có thay đổi để áp dụng" : "Xem lại và áp dụng"}</Button>
      {lastOfThis && <Button type="button" variant="secondary" onClick={onUndo} data-testid="apply-undo">Hoàn tác lần áp dụng này</Button>}
    </div>

    {confirming && <Modal open onOpenChange={setConfirming} title="Áp dụng vào bản nháp?" description="Các thay đổi nằm trong bản nháp chưa lưu và hoàn tác được bằng một thao tác."
      footer={<><Button variant="quiet" onClick={() => setConfirming(false)}>Hủy</Button><Button onClick={() => { onApply(changes, { kind: version.kind, code: version.code, versionNumber: version.versionNumber, versionId: version.id, payloadHash: version.payloadHash, name: version.name }); setConfirming(false); }} data-testid="apply-confirm">Áp dụng {changes.length > 0 ? `${new Set(changes.map((change) => change.groupId)).size} nhóm` : ""}</Button></>}>
      <div className="ops-stack" data-testid="apply-summary">
        <p style={{ margin: 0, fontSize: 13 }}><strong>{version.code}</strong> · v{version.versionNumber} · {version.name}</p>
        {summary.filled.length > 0 && <p style={{ margin: 0, fontSize: 13 }}>Điền vào trường trống: <strong>{summary.filled.join(", ")}</strong></p>}
        {summary.replaced.length > 0 && <p style={{ margin: 0, fontSize: 13 }}>Thay nội dung của bạn: <strong>{summary.replaced.join(", ")}</strong></p>}
        {summary.merged.length > 0 && <p style={{ margin: 0, fontSize: 13 }}>Hợp nhất với nội dung của bạn: <strong>{summary.merged.join(", ")}</strong></p>}
        {summary.kept.length > 0 && <p style={{ margin: 0, fontSize: 13 }}>Giữ nguyên của bạn: <strong>{summary.kept.join(", ")}</strong></p>}
        {hasOverwrite && <Alert tone="warning" title="Có nội dung của bạn bị thay hoặc hợp nhất">Bạn đã chọn thay hoặc hợp nhất ít nhất một nhóm đã có nội dung. Có thể hoàn tác ngay sau đó.</Alert>}
      </div>
    </Modal>}
  </div>;
}

/**
 * Library tab of the editor: pick a PUBLISHED template, rubric sample or equipment, preview what it would change in THIS draft,
 * decide per field group (fill / replace / merge / keep) and apply it as one undoable command. Nothing is written silently and
 * a field that already has content defaults to "keep". Only non-spatial fields are ever filled.
 */
export function V1LibraryPanel({ accessToken, ui, onUi, draft, selectedObject, runtimeVersion, runtimes, rubric, applied, canUndoLast, onUndo, onApply }: {
  accessToken: string;
  ui: LibraryUi;
  onUi: (update: (ui: LibraryUi) => LibraryUi) => void;
  draft: JsonObject;
  selectedObject: ObjectView | undefined;
  runtimeVersion: string | undefined;
  runtimes: RuntimeOption[] | null;
  rubric: RubricCatalogView | null;
  applied: AppliedSample[];
  canUndoLast: (label: string) => boolean;
  onUndo: () => void;
  onApply: (changes: Change[], sample: Omit<AppliedSample, "at">) => void;
}) {
  const { kind, page, chosen, nonce } = ui;
  const setKind = (value: LibraryKind) => onUi((current) => ({ ...current, kind: value, page: 1 }));
  const setPage = (value: number) => onUi((current) => ({ ...current, page: value }));
  const setChosen = (value: string | null) => onUi((current) => ({ ...current, chosen: value, nonce: current.nonce + 1, choices: {} }));
  const list = useAsyncData(`library-apply:${kind}:${page}`, (signal) => libraryApi.listItems(accessToken, { kind, page, pageSize: PAGE_SIZE }, signal));
  const item = useAsyncData<{ nonce: number; item: LibraryItem | null }>(`library-apply-item:${chosen}:${nonce}`, async (signal) => ({ nonce, item: chosen ? await libraryApi.getItem(accessToken, chosen, signal) : null }), chosen !== null);
  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const fresh = item.data && item.data.nonce === nonce ? item.data.item : null;
  const current = chosen && fresh && fresh.id === chosen ? fresh : null;
  const itemError = chosen && item.error !== undefined && !current ? describeLibraryError(item.error) : null;

  return <div className="se-form" data-testid="library-panel">
    <div className="se-form-head"><div><h3>Thư viện mẫu</h3><p>Chọn mẫu đã xuất bản, xem trước thay đổi rồi mới áp dụng. Bạn vẫn có thể soạn hoàn toàn bằng tay.</p></div></div>

    {!chosen && <>
      <div role="group" aria-label="Loại mẫu" className="ops-actions" style={{ flexWrap: "wrap" }}>
        {SCENARIO_LIBRARY_KINDS.map((value) => <Button key={value} type="button" size="sm" variant={value === kind ? "primary" : "secondary"} aria-pressed={value === kind} onClick={() => setKind(value)} data-testid={`library-kind-${value}`}>{kindLabel[value]}</Button>)}
      </div>
      <p className="ops-field-hint" style={{ margin: 0 }}>{kindHint[kind]}</p>
      {list.error !== undefined && (() => {
        const view = describeLibraryError(list.error);
        return <Alert tone="danger" title={view.kind === "denied" ? "Không có quyền xem thư viện" : "Không tải được thư viện"} action={view.kind === "denied" ? undefined : <Button size="sm" variant="secondary" className="mt-3" onClick={list.reload}>Thử lại</Button>}>{view.message}</Alert>;
      })()}
      {list.loading && !list.data && <SkeletonRows rows={4} label="Đang tải thư viện…" />}
      {list.data && items.length === 0 && <EmptyState icon={Library} title="Chưa có mẫu nào được xuất bản" description="Thư viện không có dữ liệu sẵn. Bạn vẫn soạn kịch bản bằng tay; quản trị hệ thống sẽ bổ sung mẫu khi có." />}
      <ul className="se-list" style={{ gap: 8 }} data-testid="library-items">
        {items.map((entry) => <li key={entry.id} style={{ gridTemplateColumns: "minmax(0,1fr)" }}>
          <button type="button" className="ops-item-card" style={{ textAlign: "left", cursor: "pointer", minHeight: 44 }} onClick={() => setChosen(entry.id)} data-testid={`library-item-${entry.code}`} aria-label={`Chọn mẫu ${entry.code}`}>
            <strong style={{ display: "block", overflowWrap: "anywhere" }}>{entry.latestPublished?.name ?? entry.code}</strong>
            <span className="ops-field-hint">{entry.code} · v{entry.latestPublished?.versionNumber ?? "?"} · {formatDateTime(entry.latestPublished?.publishedAt)}</span>
          </button>
        </li>)}
      </ul>
      {total > PAGE_SIZE && <div className="ops-actions"><Button type="button" size="sm" variant="quiet" disabled={page <= 1 || list.loading} onClick={() => setPage(page - 1)}>Trước</Button><span className="ops-field-hint">Trang {page}/{pages}</span><Button type="button" size="sm" variant="quiet" disabled={page >= pages || list.loading} onClick={() => setPage(page + 1)}>Sau</Button></div>}
    </>}

    {chosen && !current && !itemError && <Skeleton style={{ height: 120 }} />}
    {chosen && itemError && <div className="ops-stack">
      <Alert tone={itemError.kind === "notFound" ? "warning" : "danger"} title={itemError.kind === "notFound" ? "Mẫu không còn khả dụng" : "Không tải được mẫu"} action={itemError.kind === "notFound" ? undefined : <Button size="sm" variant="secondary" className="mt-3" onClick={item.reload}>Thử lại</Button>}>{itemError.kind === "notFound" ? "Mẫu đã ngừng dùng hoặc không còn phiên bản đã xuất bản. Bản nháp của bạn không đổi." : itemError.message}</Alert>
      <div><Button type="button" variant="quiet" size="sm" onClick={() => { setChosen(null); list.reload(); }}><ArrowLeft size={14} aria-hidden="true" /> Chọn mẫu khác</Button></div>
    </div>}
    {current && !current.latestPublished && <Alert tone="warning" title="Mẫu chưa có phiên bản đã xuất bản">Chỉ phiên bản đã xuất bản mới áp dụng được.</Alert>}
    {current?.latestPublished && <Preview key={current.latestPublished.id} version={current.latestPublished} draft={draft} object={selectedObject} runtimeVersion={runtimeVersion} runtimes={runtimes} rubric={rubric} applied={applied} canUndoLast={canUndoLast} onUndo={onUndo} onApply={onApply} onBack={() => setChosen(null)} choices={ui.choices} onChoices={(update) => onUi((current) => ({ ...current, choices: update(current.choices) }))} />}

    {chosen && current?.latestPublished && <details>
      <summary style={{ cursor: "pointer", minHeight: 44, display: "flex", alignItems: "center", fontSize: 13 }}>Toàn bộ nội dung phiên bản này</summary>
      <VersionPreview version={current.latestPublished} compact />
    </details>}

    <section aria-label="Mẫu đã áp dụng" className="ops-stack" style={{ gap: 6 }} data-testid="applied-samples">
      <h4 style={{ margin: 0, fontSize: 13 }}>Đã áp dụng trong phiên soạn này</h4>
      {applied.length === 0 ? <p className="ops-field-hint" style={{ margin: 0 }}>Chưa áp dụng mẫu nào. Bản nháp không lưu nguồn mẫu; danh sách này chỉ có trong phiên soạn hiện tại.</p>
        : <ul style={{ margin: 0, paddingLeft: 18, listStyle: "disc", fontSize: 13 }}>{applied.map((entry) => <li key={`${entry.versionId}-${entry.at}`}>{kindLabel[entry.kind]} <strong>{entry.code}</strong> v{entry.versionNumber} ({entry.payloadHash.slice(0, 8) || "—"}) · {new Date(entry.at).toLocaleTimeString("vi-VN")}</li>)}</ul>}
      <p className="ops-field-hint" style={{ margin: 0 }}>Nội dung đã sao chép thuộc về bản nháp của bạn; cập nhật mẫu sau này không tự sửa kịch bản hay bài đã phát hành.</p>
    </section>
  </div>;
}
