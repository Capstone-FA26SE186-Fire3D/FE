"use client";

import { Camera, RefreshCw, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useIdempotencyKey } from "@/api";
import { useAsyncData } from "@/api/use-async-data";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Field, Select } from "@/components/ui/field";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";

import { changedTopLevelKeys, describeError, type DescribedError } from "../../version-readiness";
import type { DraftForSnapshot, DraftValidation } from "../../version-types";
import { scenarioVersionsApi } from "../../versions-api";
import { SupportCode } from "@/components/ui/support-code";
import { formatDateTime } from "./version-content";

type LoadedDraft = { draft: DraftForSnapshot; eTag: string };
type Conflict = { stale: LoadedDraft; fresh: LoadedDraft; changed: string[] };

function DraftSummary({ loaded, label }: { loaded: LoadedDraft; label: string }) {
  const state = (loaded.draft.state && typeof loaded.draft.state === "object" ? loaded.draft.state : {}) as Record<string, unknown>;
  const criteria = (state.rubric as { criteria?: unknown[] } | undefined)?.criteria;
  const objectives = state.learningObjectives;
  return <dl className="ver-dl" aria-label={label}>
    <dt>Bản nháp</dt><dd>#{loaded.draft.draftNumber}</dd>
    <dt>Lần lưu</dt><dd>{loaded.eTag.replace(/"/g, "")}<span className="ver-sr">{loaded.eTag}</span></dd>
    <dt>Cập nhật</dt><dd>{formatDateTime(loaded.draft.updatedAt)}</dd>
    <dt>Tiêu chí chấm</dt><dd>{Array.isArray(criteria) ? `${criteria.length} tiêu chí` : "Chưa có"}</dd>
    <dt>Mục tiêu</dt><dd>{Array.isArray(objectives) ? `${objectives.length} mục` : "Chưa có"}</dd>
  </dl>;
}

/**
 * Create an immutable snapshot (new version) from a draft. Drafts are listed by the server (newest save first), so the
 * work can be found again after a reload or on another machine; `preferredDraftId` (the editor link, else the scenario's
 * current draft) is preselected. Snapshot needs the draft ETag in If-Match and an Idempotency-Key that stays the same
 * while the same draft revision is retried.
 */
export function SnapshotDrawer({ open, onOpenChange, accessToken, scenarioId, initialDraftId, preferredDraftId = "", editorHref, onCreated }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accessToken: string;
  scenarioId: string;
  /** Draft id from the URL (`?draft=`), if any. */
  initialDraftId: string;
  /** The scenario's most recently saved draft, used when the URL names none. */
  preferredDraftId?: string;
  /** Where to create or edit drafts when the list is empty. */
  editorHref?: string;
  onCreated: (versionId: string) => void;
}) {
  const toast = useToast();
  const { keyFor, done } = useIdempotencyKey();
  const drafts = useAsyncData(`snapshot-drafts:${scenarioId}`, (signal) => scenarioVersionsApi.listDrafts(accessToken, scenarioId, 1, 50, signal), open);
  const draftItems = drafts.data?.items ?? [];
  const [chosenDraftId, setDraftId] = useState(initialDraftId);
  const draftId = chosenDraftId || preferredDraftId || draftItems[0]?.id || "";
  const [loaded, setLoaded] = useState<LoadedDraft | null>(null);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [validation, setValidation] = useState<DraftValidation | null>(null);
  const [error, setError] = useState<DescribedError | null>(null);
  const [busy, setBusy] = useState<"load" | "validate" | "snapshot" | "">("");

  const trimmed = draftId.trim();

  const load = async () => {
    if (busy || !trimmed) return;
    setBusy("load");
    setError(null);
    setValidation(null);
    setConflict(null);
    try {
      const result = await scenarioVersionsApi.getDraft(accessToken, trimmed);
      if (result.draft.scenarioId !== scenarioId) {
        setLoaded(null);
        setError({ message: "Bản nháp này thuộc kịch bản khác. Hãy mở bản nháp của đúng kịch bản.", fieldErrors: [] });
      } else {
        setLoaded(result);
      }
    } catch (cause) {
      setLoaded(null);
      setError(describeError(cause, "Không tải được bản nháp."));
    } finally {
      setBusy("");
    }
  };

  const validate = async () => {
    if (busy || !loaded) return;
    setBusy("validate");
    setError(null);
    try {
      setValidation(await scenarioVersionsApi.validateDraft(accessToken, loaded.draft.id));
    } catch (cause) {
      setError(describeError(cause, "Không kiểm tra được bản nháp."));
    } finally {
      setBusy("");
    }
  };

  const snapshot = async () => {
    if (busy || !loaded) return;
    setBusy("snapshot");
    setError(null);
    try {
      const key = keyFor({ draftId: loaded.draft.id, eTag: loaded.eTag });
      const created = await scenarioVersionsApi.snapshotDraft(accessToken, loaded.draft.id, loaded.eTag, key);
      done();
      toast.notify({ tone: "success", title: "Đã tạo phiên bản mới", description: "Nội dung đã khóa. Chưa gửi duyệt." });
      onOpenChange(false);
      onCreated(created.id);
    } catch (cause) {
      const described = describeError(cause, "Không tạo được phiên bản.");
      setError(described);
      if (described.status === 412) {
        // Keep what the user was looking at; fetching the newer draft is a separate, explicit step.
        setConflict(null);
      }
    } finally {
      setBusy("");
    }
  };

  const loadNewer = async () => {
    if (busy || !loaded) return;
    setBusy("load");
    try {
      const fresh = await scenarioVersionsApi.getDraft(accessToken, loaded.draft.id);
      setConflict({ stale: loaded, fresh, changed: changedTopLevelKeys(loaded.draft.state, fresh.draft.state) });
    } catch (cause) {
      setError(describeError(cause, "Không tải được bản nháp mới."));
    } finally {
      setBusy("");
    }
  };

  const useNewer = () => {
    if (!conflict) return;
    setLoaded(conflict.fresh);
    setConflict(null);
    setError(null);
    setValidation(null);
  };

  // Opening the drawer (or picking another draft) loads that draft at once, so "Tạo snapshot" is usable without an extra
  // "Tải draft" click. It runs once per draft id and re-arms when the drawer closes (a reopened drawer reads a fresh ETag).
  const autoLoaded = useRef("");
  useEffect(() => {
    if (!open) { autoLoaded.current = ""; return; }
    if (!trimmed || busy || autoLoaded.current === trimmed) return;
    const timer = window.setTimeout(() => { autoLoaded.current = trimmed; void load(); }, 0);
    return () => window.clearTimeout(timer);
  });

  const precondition = error?.status === 412;
  // Why the primary button is off, shown next to it instead of leaving a dimmed button unexplained.
  const snapshotHint = busy === "load" ? "Đang tải bản nháp…"
    : conflict ? "Chọn bản nháp để dùng ở phần đối chiếu trước."
    : !loaded ? (draftItems.length === 0 && drafts.data ? "Chưa có draft để tạo phiên bản." : error ? "Chưa tải được bản nháp: bấm “Tải bản nháp” để thử lại." : "Cần tải bản nháp trước.")
    : "";

  return <Modal
    open={open}
    size="lg"
    onOpenChange={(next) => { if (!busy) onOpenChange(next); }}
    title="Tạo phiên bản mới từ bản nháp"
    description="Khóa nội dung và tiêu chí chấm của bản nháp đã chọn thành một phiên bản không sửa được nữa. Việc này chưa gửi duyệt."
  >
    <div className="ops-stack">
      <fieldset className="ops-fieldset">
        <legend>1. Chọn bản nháp</legend>
        {drafts.error !== undefined && !drafts.data && <Alert tone="danger" title="Không tải được danh sách bản nháp" action={<Button size="sm" variant="secondary" className="mt-3" onClick={drafts.reload}>Thử lại</Button>}>{describeError(drafts.error).message}</Alert>}
        {drafts.loading && !drafts.data && <p className="ver-note" role="status">Đang tải danh sách bản nháp…</p>}
        {drafts.data && draftItems.length === 0 && <p className="ver-note">Kịch bản này chưa có bản nháp. {editorHref ? <a href={editorHref} style={{ color: "var(--ember)" }}>Mở trình soạn để tạo bản nháp</a> : "Hãy tạo bản nháp ở trình soạn kịch bản."}</p>}
        {draftItems.length > 0 && <Field label="Bản nháp" required hint="Danh sách do máy chủ trả, bản lưu gần nhất trước.">
          {(p) => <Select {...p} value={trimmed} onChange={(event) => { setDraftId(event.target.value); setLoaded(null); setConflict(null); setValidation(null); setError(null); }}>
            {!draftItems.some((item) => item.id === trimmed) && trimmed && <option value={trimmed}>Draft theo liên kết ({trimmed.slice(0, 8)}…)</option>}
            {draftItems.map((item) => <option key={item.id} value={item.id}>{"#" + item.draftNumber + " · " + formatDateTime(item.updatedAt) + (item.lastEditedByName ? " · " + item.lastEditedByName : "") + (item.id === preferredDraftId ? " · hiện tại" : "")}</option>)}
          </Select>}
        </Field>}
        <div className="ver-actions-row">
          <Button variant="secondary" onClick={() => void load()} disabled={!trimmed || busy !== ""}>
            <RefreshCw size={16} aria-hidden="true" />{busy === "load" ? "Đang tải…" : loaded ? "Tải lại bản nháp" : "Tải bản nháp"}
          </Button>
        </div>
      </fieldset>

      {loaded && <fieldset className="ops-fieldset">
        <legend>2. Kiểm tra</legend>
        <DraftSummary loaded={loaded} label="Tóm tắt bản nháp đang xem" />
        <div className="ver-actions-row">
          <Button variant="quiet" onClick={() => void validate()} disabled={busy !== ""}><ShieldCheck size={16} aria-hidden="true" />{busy === "validate" ? "Đang kiểm tra…" : "Kiểm tra bản nháp"}</Button>
          {validation && <StatusBadge tone={validation.isValid ? "success" : "danger"}>{validation.isValid ? "Bản nháp hợp lệ" : `${validation.issues.length} vấn đề`}</StatusBadge>}
        </div>
        {validation && !validation.isValid && <ul className="ver-list" aria-label="Vấn đề của bản nháp">
          {validation.issues.map((issue, index) => <li key={`${issue.code}-${index}`}>{issue.message}<small className="ver-code-hint">{issue.code} · {issue.path}</small></li>)}
        </ul>}
      </fieldset>}

      {error && !precondition && <Alert tone="danger" title={error.message}>
        {error.fieldErrors.length > 0 && <>{error.fieldErrors.map((item) => item.message).join(" ")}</>}
        <SupportCode code={error.code} />
      </Alert>}

      {precondition && !conflict && <Alert tone="warning" title="Bản nháp đã thay đổi từ lần bạn tải" action={<Button size="sm" variant="secondary" className="mt-3" onClick={() => void loadNewer()} disabled={busy !== ""}>Tải bản mới để đối chiếu</Button>}>
        Chưa có phiên bản nào được tạo. Bản bạn đang xem vẫn được giữ nguyên bên dưới; hãy tải bản mới và đối chiếu trước khi tạo phiên bản.
      </Alert>}

      {conflict && <fieldset className="ops-fieldset">
        <legend>Đối chiếu bản nháp</legend>
        <div className="ver-compare">
          <div><p className="ver-section-title">Bản bạn đang xem</p><DraftSummary loaded={conflict.stale} label="Bản cũ" /></div>
          <div><p className="ver-section-title">Bản mới trên máy chủ</p><DraftSummary loaded={conflict.fresh} label="Bản mới" /></div>
        </div>
        <p className="ver-note">{conflict.changed.length ? <>Khác nhau ở: <strong>{conflict.changed.join(", ")}</strong>.</> : "Nội dung giống nhau; chỉ thời điểm lưu khác."}</p>
        <div className="ver-actions-row">
          <Button onClick={useNewer}>Dùng bản mới</Button>
          <Button variant="quiet" onClick={() => setConflict(null)}>Giữ bản cũ</Button>
        </div>
      </fieldset>}

      <p className="ver-note">Sau khi tạo, bạn dựng gói, xem kết quả kiểm tra rồi gửi duyệt. Bấm lại khi mạng lỗi không tạo thêm phiên bản trùng.</p>

      {snapshotHint && <p className="ver-note" role="status" id="snapshot-hint">{snapshotHint}</p>}
      <div className="ops-actions" style={{ justifyContent: "flex-end" }}>
        <Button variant="quiet" onClick={() => onOpenChange(false)} disabled={busy !== ""}>Hủy</Button>
        <Button onClick={() => void snapshot()} disabled={!loaded || busy !== "" || Boolean(conflict)} aria-describedby={snapshotHint ? "snapshot-hint" : undefined}><Camera size={16} aria-hidden="true" />{busy === "snapshot" ? "Đang tạo…" : "Tạo phiên bản"}</Button>
      </div>
    </div>
  </Modal>;
}
