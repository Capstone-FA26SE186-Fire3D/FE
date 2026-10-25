"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";

import { ApiError } from "@/api/types/common";

import { scenarioEditorApi, type LoadedDraft } from "../api";
import { describeSaveError } from "../use-scenario-editor";
import type { ConflictState } from "../use-scenario-editor";
import { normalizeEtag } from "../store/etag";
import { isObject, type JsonObject } from "../store/json";
import { compareDrafts, resolveMerge, type MergeChoice } from "../store/merge";
import type { Issue } from "../store/validation";
import type { V1Command, V1Selection } from "./commands";
import { initialV1State, isV1Dirty, v1Reducer, type V1EditorState } from "./editor-state";
import { stateHash } from "./hash";
import { combineIssues, toIssues } from "./issues";
import { completenessIssues, isV1State, shapeIssues, type ReferenceContext } from "./state";
import { describeApiError } from "@/api/describe-error";

/**
 * What a server answer (validate-state or a refused PUT) says, and about WHICH body: `hash` is the SHA-256 of the checked
 * JSON. The report is current only while the draft still hashes to it; any later edit makes it stale, never wrong.
 */
export type ServerReport = {
  source: "validate" | "save";
  hash: string;
  isValid: boolean | null;
  issues: Issue[];
  storedVersion: number | null;
  at: number;
};

export type SaveResultV1 =
  | { status: "saved"; snapshot: JsonObject; etag: string }
  | { status: "conflict" | "error" | "skipped" | "invalid" };

export type DraftMetaV1 = { id: string; scenarioId: string; revisionId: string; buildingId: string; draftNumber: number; source: string; updatedAt: string };

function init(initial: LoadedDraft): V1EditorState {
  const draft = isObject(initial.draft.state) ? initial.draft.state : {};
  return { ...initialV1State, draft, baseline: draft, etag: initial.etag, version: initial.draft.version };
}

function message(error: unknown, fallback: string) {
  return describeApiError(error, fallback);
}

/** Human text for a PUT/validate failure that carries v1 error codes. */
export function describeV1Failure(error: unknown): { message: string; conflict: boolean; issues: Issue[] } {
  if (error instanceof ApiError) {
    const issues = toIssues(error.payload?.issues);
    if (error.status === 422 && error.code === "EDITOR_SCHEMA_INVALID") return { conflict: false, issues, message: `Hệ thống chưa nhận nội dung bản nháp: ${issues.length} lỗi cấu trúc. Nội dung của bạn vẫn được giữ.` };
    if (error.status === 422 && error.code === "EDITOR_SCHEMA_VERSION_UNSUPPORTED") return { conflict: false, issues, message: "Hệ thống chưa hỗ trợ định dạng của bản nháp này." };
    if (error.status === 400 && error.code === "EDITOR_JSON_MALFORMED") return { conflict: false, issues, message: "Hệ thống không đọc được nội dung đã gửi. Hãy tải lại trang rồi thử lại." };
    return { ...describeSaveError(error), issues };
  }
  return { ...describeSaveError(error), issues: [] };
}

export function useEditorV1({ accessToken, draftId, initial, context }: { accessToken: string; draftId: string; initial: LoadedDraft; context: ReferenceContext }) {
  const [state, dispatch] = useReducer(v1Reducer, initial, init);
  const [report, setReport] = useState<ServerReport | null>(null);
  const [validating, setValidating] = useState(false);
  const [validateError, setValidateError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<ConflictState | null>(null);
  const stateRef = useRef<V1EditorState>(state);
  const savingRef = useRef(false);
  const validatingRef = useRef(false);
  const scope = useRef<AbortController | null>(null);
  const clock = useRef(() => Date.now());
  const meta = useMemo<DraftMetaV1>(() => {
    const d = initial.draft;
    return { id: d.id, scenarioId: d.scenarioId, revisionId: d.revisionId, buildingId: d.buildingId, draftNumber: d.draftNumber, source: d.source, updatedAt: d.updatedAt };
  }, [initial]);

  useEffect(() => {
    stateRef.current = state;
  });

  // The scope owns every request of this draft: leaving or switching drafts aborts them and drops their results.
  useEffect(() => {
    const controller = new AbortController();
    scope.current = controller;
    savingRef.current = false;
    validatingRef.current = false;
    return () => controller.abort();
  }, [draftId, accessToken]);

  const edit = useCallback((build: (draft: JsonObject, id: number, selection: V1Selection, now: number) => V1Command | null) => {
    dispatch({ type: "edit", build: (draft, id, selection) => build(draft, id, selection, clock.current()) });
  }, []);

  const dirty = isV1Dirty(state);
  const shapeProblems = useMemo(() => shapeIssues(state.draft), [state.draft]);
  const advisory = useMemo(() => completenessIssues(state.draft, context), [state.draft, context]);

  const save = useCallback(async (): Promise<SaveResultV1> => {
    const current = stateRef.current;
    const controller = scope.current;
    if (!current.etag || savingRef.current || !controller || controller.signal.aborted) return { status: "skipped" };
    if (!isV1Dirty(current)) return { status: "saved", snapshot: current.baseline, etag: current.etag };
    // A body the server would refuse is not sent: the author sees why instead of a 422 after a round trip.
    if (shapeIssues(current.draft).length > 0) return { status: "invalid" };
    savingRef.current = true;
    const payload = current.draft;
    dispatch({ type: "save-start" });
    try {
      const { etag } = await scenarioEditorApi.putDraft(accessToken, draftId, payload, current.etag, controller.signal);
      let next = etag;
      let snapshot: JsonObject = payload;
      if (!next) {
        // 204 without a readable ETag (proxy stripped it): the revision must come from the server, never be guessed.
        const loaded = await scenarioEditorApi.getDraft(accessToken, draftId, controller.signal);
        next = loaded.etag;
        snapshot = isObject(loaded.draft.state) ? loaded.draft.state : payload;
      }
      if (controller.signal.aborted) return { status: "skipped" };
      dispatch({ type: "save-ok", payload: snapshot, etag: next });
      return { status: "saved", snapshot, etag: next };
    } catch (cause) {
      if (controller.signal.aborted) return { status: "skipped" };
      const failure = describeV1Failure(cause);
      if (failure.issues.length > 0) setReport({ source: "save", hash: stateHash(payload), isValid: false, issues: failure.issues, storedVersion: null, at: Date.now() });
      dispatch({ type: "save-fail", message: failure.message, conflict: failure.conflict });
      return { status: failure.conflict ? "conflict" : "error" };
    } finally {
      if (!controller.signal.aborted) savingRef.current = false;
    }
  }, [accessToken, draftId]);

  /**
   * Dry run of the CURRENT unsaved document (`validate-state`, same body as PUT). Nothing is stored and the ETag does not
   * change. Edits made while the request is in flight stay in the editor; the answer is tied to the hash of what was sent
   * and shows as stale as soon as the draft differs.
   */
  const validate = useCallback(async () => {
    const controller = scope.current;
    if (validatingRef.current || !controller || controller.signal.aborted) return;
    validatingRef.current = true;
    setValidateError(null);
    setValidating(true);
    const sent = stateRef.current.draft;
    const expected = stateHash(sent);
    try {
      const result = await scenarioEditorApi.validateState(accessToken, draftId, sent, controller.signal);
      if (controller.signal.aborted) return;
      if (result.draftId !== draftId) {
        setValidateError("Kết quả kiểm tra thuộc bản nháp khác nên không được áp dụng.");
        return;
      }
      if (result.stateHash !== expected) {
        setValidateError("Kết quả kiểm tra không khớp nội dung đã gửi (stateHash khác) nên không được áp dụng. Hãy kiểm tra lại.");
        return;
      }
      setReport({ source: "validate", hash: expected, isValid: result.isValid, issues: toIssues(result.issues), storedVersion: typeof result.storedVersion === "number" ? result.storedVersion : null, at: Date.now() });
    } catch (cause) {
      if (controller.signal.aborted) return;
      const failure = describeV1Failure(cause);
      setValidateError(failure.message || message(cause, "Không thể kiểm tra bản nháp."));
    } finally {
      if (!controller.signal.aborted) {
        validatingRef.current = false;
        setValidating(false);
      }
    }
  }, [accessToken, draftId]);

  const currentHash = useMemo(() => (report ? stateHash(state.draft) : null), [report, state.draft]);
  const reportStale = report !== null && currentHash !== report.hash;
  /** Server issues are mapped onto objects and fields only while they describe the current document (paths are indices into the sent body). */
  const serverIssues = useMemo(() => (report && !reportStale ? report.issues : []), [report, reportStale]);
  const issues = useMemo(() => combineIssues([...shapeProblems, ...advisory], serverIssues), [shapeProblems, advisory, serverIssues]);

  /** Fetches the server's current draft and diffs it against the author's. Nothing is written. */
  const loadConflict = useCallback(async () => {
    setConflict({ loading: true, error: null, theirs: null, units: [] });
    try {
      const { draft, etag } = await scenarioEditorApi.getDraft(accessToken, draftId);
      const theirs = isObject(draft.state) ? draft.state : {};
      const current = stateRef.current;
      setConflict({ loading: false, error: null, theirs: { state: theirs, etag, version: draft.version }, units: compareDrafts(current.draft, theirs, current.baseline) });
    } catch (cause) {
      setConflict({ loading: false, error: message(cause, "Không tải được bản mới từ máy chủ."), theirs: null, units: [] });
    }
  }, [accessToken, draftId]);

  /** Adopts the server revision (new ETag) and the author's chosen fields; the result stays UNSAVED until the author saves. */
  const applyMerge = useCallback((choices: Record<string, MergeChoice>) => {
    if (!conflict?.theirs) return;
    const merged = resolveMerge(conflict.theirs.state, conflict.units, choices);
    if (!isV1State(merged)) {
      setConflict({ ...conflict, error: "Kết quả ghép hai bản không còn là bản nháp soạn trên mô hình 3D (bản đã lưu theo định dạng khác). Hãy chọn lại hoặc tải lại trang." });
      return;
    }
    dispatch({ type: "replace", draft: merged, baseline: conflict.theirs.state, etag: conflict.theirs.etag, version: conflict.theirs.version });
    setConflict(null);
  }, [conflict]);

  const closeConflict = useCallback(() => setConflict(null), []);

  const status: "saved" | "dirty" | "saving" | "conflict" | "error" | "invalid" =
    state.phase === "saving" ? "saving" : state.phase === "conflict" ? "conflict" : state.phase === "error" ? "error" : dirty ? (shapeProblems.length > 0 ? "invalid" : "dirty") : "saved";

  return {
    state, dispatch, edit, dirty, status, meta,
    save, validate, validating, validateError,
    report, reportStale, serverIssues, shapeProblems, advisory, issues,
    conflict, loadConflict, applyMerge, closeConflict,
    normalizedEtag: normalizeEtag(state.etag),
  };
}

export type EditorV1 = ReturnType<typeof useEditorV1>;
