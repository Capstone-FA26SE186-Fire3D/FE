"use client";

import { Camera, RefreshCw, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { useIdempotencyKey } from "@/api";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";

import { changedTopLevelKeys, describeError, isUuid, type DescribedError } from "../../version-readiness";
import type { DraftForSnapshot, DraftValidation } from "../../version-types";
import { scenarioVersionsApi } from "../../versions-api";
import { formatDateTime } from "./version-content";

type LoadedDraft = { draft: DraftForSnapshot; eTag: string };
type Conflict = { stale: LoadedDraft; fresh: LoadedDraft; changed: string[] };

function DraftSummary({ loaded, label }: { loaded: LoadedDraft; label: string }) {
  const state = (loaded.draft.state && typeof loaded.draft.state === "object" ? loaded.draft.state : {}) as Record<string, unknown>;
  const criteria = (state.rubric as { criteria?: unknown[] } | undefined)?.criteria;
  const objectives = state.learningObjectives;
  return <dl className="ver-dl" aria-label={label}>
    <dt>Draft</dt><dd>#{loaded.draft.draftNumber}</dd>
    <dt>ETag</dt><dd className="ver-hash">{loaded.eTag}</dd>
    <dt>Cập nhật</dt><dd>{formatDateTime(loaded.draft.updatedAt)}</dd>
    <dt>Rubric</dt><dd>{Array.isArray(criteria) ? `${criteria.length} tiêu chí` : "Chưa có"}</dd>
    <dt>Mục tiêu</dt><dd>{Array.isArray(objectives) ? `${objectives.length} mục` : "Chưa có"}</dd>
  </dl>;
}

/**
 * Create an immutable snapshot (new version) from a draft. The draft id comes from the editor link or is pasted:
 * BE has no "list drafts" endpoint yet (BE#53). Snapshot needs the draft ETag in If-Match and an Idempotency-Key that
 * stays the same while the same draft revision is retried.
 */
export function SnapshotDrawer({ open, onOpenChange, accessToken, scenarioId, initialDraftId, onCreated }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accessToken: string;
  scenarioId: string;
  initialDraftId: string;
  onCreated: (versionId: string) => void;
}) {
  const toast = useToast();
  const { keyFor, done } = useIdempotencyKey();
  const [draftId, setDraftId] = useState(initialDraftId);
  const [loaded, setLoaded] = useState<LoadedDraft | null>(null);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [validation, setValidation] = useState<DraftValidation | null>(null);
  const [error, setError] = useState<DescribedError | null>(null);
  const [busy, setBusy] = useState<"load" | "validate" | "snapshot" | "">("");

  const trimmed = draftId.trim();
  const idError = trimmed && !isUuid(trimmed) ? "Mã draft phải là UUID." : undefined;

  const load = async () => {
    if (busy || !trimmed || idError) return;
    setBusy("load");
    setError(null);
    setValidation(null);
    setConflict(null);
    try {
      const result = await scenarioVersionsApi.getDraft(accessToken, trimmed);
      if (result.draft.scenarioId !== scenarioId) {
        setLoaded(null);
        setError({ message: "Draft này thuộc kịch bản khác. Hãy mở draft của đúng kịch bản.", fieldErrors: [] });
      } else {
        setLoaded(result);
      }
    } catch (cause) {
      setLoaded(null);
      setError(describeError(cause, "Không tải được draft."));
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
      setError(describeError(cause, "Không kiểm tra được draft."));
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
      toast.notify({ tone: "success", title: "Đã tạo phiên bản mới", description: "Snapshot bất biến. Chưa gửi duyệt." });
      onOpenChange(false);
      onCreated(created.id);
    } catch (cause) {
      const described = describeError(cause, "Không tạo được snapshot.");
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
      setError(describeError(cause, "Không tải được bản draft mới."));
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

  const precondition = error?.status === 412;

  return <Drawer
    open={open}
    onOpenChange={(next) => { if (!busy) onOpenChange(next); }}
    title="Tạo snapshot từ draft"
    description="Snapshot đóng băng nội dung và rubric thành một phiên bản bất biến. Việc này chưa gửi duyệt."
  >
    <div className="ops-stack">
      <fieldset className="ops-fieldset">
        <legend>1. Chọn draft</legend>
        <Field label="Mã draft" required error={idError} hint="Lấy từ trình soạn kịch bản. BE chưa có API liệt kê draft (BE#53).">
          {(p) => <Input {...p} value={draftId} placeholder="00000000-0000-0000-0000-000000000000" autoComplete="off" spellCheck={false} onChange={(event) => { setDraftId(event.target.value); setLoaded(null); setConflict(null); setValidation(null); setError(null); }} />}
        </Field>
        <div className="ver-actions-row">
          <Button variant="secondary" onClick={() => void load()} disabled={!trimmed || Boolean(idError) || busy !== ""}>
            <RefreshCw size={16} aria-hidden="true" />{busy === "load" ? "Đang tải…" : loaded ? "Tải lại draft" : "Tải draft"}
          </Button>
        </div>
      </fieldset>

      {loaded && <fieldset className="ops-fieldset">
        <legend>2. Kiểm tra</legend>
        <DraftSummary loaded={loaded} label="Tóm tắt draft đang xem" />
        <div className="ver-actions-row">
          <Button variant="quiet" onClick={() => void validate()} disabled={busy !== ""}><ShieldCheck size={16} aria-hidden="true" />{busy === "validate" ? "Đang kiểm tra…" : "Kiểm tra draft"}</Button>
          {validation && <StatusBadge tone={validation.isValid ? "success" : "danger"}>{validation.isValid ? "Draft hợp lệ" : `${validation.issues.length} vấn đề`}</StatusBadge>}
        </div>
        {validation && !validation.isValid && <ul className="ver-list" aria-label="Vấn đề của draft">
          {validation.issues.map((issue, index) => <li key={`${issue.code}-${index}`}><strong>{issue.code}</strong> <span className="ver-hash">{issue.path}</span> — {issue.message}</li>)}
        </ul>}
      </fieldset>}

      {error && !precondition && <Alert tone="danger" title={error.message}>
        {error.code && <>Mã lỗi: {error.code}. </>}
        {error.fieldErrors.length > 0 && <>{error.fieldErrors.map((item) => item.message).join(" ")}</>}
      </Alert>}

      {precondition && !conflict && <Alert tone="warning" title="Draft đã thay đổi từ lần bạn tải" action={<Button size="sm" variant="secondary" className="mt-3" onClick={() => void loadNewer()} disabled={busy !== ""}>Tải bản mới để đối chiếu</Button>}>
        Chưa có snapshot nào được tạo. Bản bạn đang xem vẫn được giữ nguyên bên dưới; hãy tải bản mới và đối chiếu trước khi tạo snapshot.
      </Alert>}

      {conflict && <fieldset className="ops-fieldset">
        <legend>Đối chiếu bản draft</legend>
        <div className="ver-compare">
          <div><p className="ver-section-title">Bản bạn đang xem</p><DraftSummary loaded={conflict.stale} label="Bản cũ" /></div>
          <div><p className="ver-section-title">Bản mới trên máy chủ</p><DraftSummary loaded={conflict.fresh} label="Bản mới" /></div>
        </div>
        <p className="ver-note">{conflict.changed.length ? <>Khác nhau ở: <strong>{conflict.changed.join(", ")}</strong>.</> : "Nội dung trạng thái giống nhau; chỉ metadata (ETag) đổi."}</p>
        <div className="ver-actions-row">
          <Button onClick={useNewer}>Dùng bản mới</Button>
          <Button variant="quiet" onClick={() => setConflict(null)}>Giữ bản cũ</Button>
        </div>
      </fieldset>}

      <p className="ver-note">Sau khi tạo, bạn sẽ chạy package build, kiểm tra kết quả kỹ thuật rồi gửi duyệt. Gửi lại cùng yêu cầu khi mạng lỗi sẽ không tạo thêm phiên bản (cùng Idempotency-Key).</p>

      <div className="ops-actions" style={{ justifyContent: "flex-end" }}>
        <Button variant="quiet" onClick={() => onOpenChange(false)} disabled={busy !== ""}>Hủy</Button>
        <Button onClick={() => void snapshot()} disabled={!loaded || busy !== "" || Boolean(conflict)}><Camera size={16} aria-hidden="true" />{busy === "snapshot" ? "Đang tạo…" : "Tạo snapshot"}</Button>
      </div>
    </div>
  </Drawer>;
}
