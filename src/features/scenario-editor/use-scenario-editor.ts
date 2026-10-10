"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";

import { ApiError } from "@/api/types/common";

import { scenarioEditorApi, type DraftResponse } from "./api";
import { type Command } from "./store/commands";
import { editorReducer, initialEditorState, isDirty, saveStatus, type EditorState } from "./store/editor-store";
import { compareDrafts, resolveMerge, type MergeChoice, type MergeUnit } from "./store/merge";
import { prepareForSave, type Selection } from "./store/model";
import { mergeIssues, normalizeServerIssues, validateDraftState, type Issue } from "./store/validation";
import { isObject, type JsonObject } from "./store/json";

export type LoadState = { phase: "loading" } | { phase: "ready" } | { phase: "error"; status?: number; message: string };

export type ConflictState = {
  loading: boolean;
  error: string | null;
  theirs: { state: JsonObject; etag: string; version: number } | null;
  units: MergeUnit[];
};

export type SaveResult = "saved" | "conflict" | "error" | "skipped";

export type EditorMeta = Pick<DraftResponse, "id" | "scenarioId" | "revisionId" | "buildingId" | "draftNumber" | "source" | "updatedAt">;

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError) return error.message || fallback;
  return error instanceof Error && error.message ? error.message : fallback;
}

/** Human text for the statuses `PUT /api/scenario-drafts/{id}` can answer with. */
export function describeSaveError(error: unknown): { message: string; conflict: boolean } {
  if (error instanceof ApiError) {
    if (error.status === 412) return { conflict: true, message: "Bản nháp đã được thay đổi ở nơi khác. Nội dung bạn đang nhập vẫn được giữ nguyên." };
    if (error.status === 428) return { conflict: false, message: "Thiếu If-Match: chưa có ETag của bản nháp. Hãy tải lại bản nháp." };
    if (error.status === 400 && error.code === "INVALID_IF_MATCH") return { conflict: false, message: "ETag của bản nháp không hợp lệ (INVALID_IF_MATCH). Hãy tải lại bản nháp." };
    if (error.status === 400) return { conflict: false, message: `Máy chủ từ chối dữ liệu: ${error.message}` };
    if (error.status === 401 || error.status === 403) return { conflict: false, message: "Phiên đăng nhập hết hạn hoặc không còn quyền sửa bản nháp này." };
    if (error.status === 404) return { conflict: false, message: "Bản nháp không còn tồn tại hoặc không thuộc tổ chức của bạn." };
    return { conflict: false, message: error.message || `Không thể lưu (mã ${error.status}).` };
  }
  return { conflict: false, message: error instanceof Error ? error.message : "Không thể lưu bản nháp." };
}

export function useScenarioEditor(accessToken: string | null, draftId: string | null) {
  const [state, dispatch] = useReducer(editorReducer, initialEditorState);
  const [load, setLoad] = useState<LoadState>({ phase: "loading" });
  const [meta, setMeta] = useState<EditorMeta | null>(null);
  const [serverIssues, setServerIssues] = useState<Issue[]>([]);
  const [validatedSnapshot, setValidatedSnapshot] = useState<JsonObject | null>(null);
  const [validating, setValidating] = useState(false);
  const [validateError, setValidateError] = useState<string | null>(null);
  const [lastValidation, setLastValidation] = useState<{ isValid: boolean; version: number } | null>(null);
  const [conflict, setConflict] = useState<ConflictState | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const stateRef = useRef<EditorState>(state);
  const savingRef = useRef(false);
  const clock = useRef(() => Date.now());

  useEffect(() => {
    stateRef.current = state;
  });

  useEffect(() => {
    if (!accessToken || !draftId) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoad({ phase: "loading" });
      scenarioEditorApi.getDraft(accessToken, draftId, controller.signal)
        .then(({ draft, etag }) => {
          if (controller.signal.aborted) return;
          const body = isObject(draft.state) ? draft.state : {};
          dispatch({ type: "loaded", draft: body, etag, version: draft.version });
          setMeta({ id: draft.id, scenarioId: draft.scenarioId, revisionId: draft.revisionId, buildingId: draft.buildingId, draftNumber: draft.draftNumber, source: draft.source, updatedAt: draft.updatedAt });
          setServerIssues([]);
          setValidatedSnapshot(null);
          setLastValidation(null);
          setLoad({ phase: "ready" });
        })
        .catch((cause: unknown) => {
          if (controller.signal.aborted) return;
          setLoad({ phase: "error", status: cause instanceof ApiError ? cause.status : undefined, message: errorMessage(cause, "Không thể tải bản nháp.") });
        });
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [accessToken, draftId, reloadToken]);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  const edit = useCallback((build: (draft: JsonObject, id: number, selection: Selection, now: number) => Command | null) => {
    dispatch({ type: "edit", build: (draft, id, selection) => build(draft, id, selection, clock.current()) });
  }, []);

  const dirty = useMemo(() => isDirty(state), [state]);
  const status = saveStatus(state, dirty);

  const save = useCallback(async (): Promise<SaveResult> => {
    const current = stateRef.current;
    if (!accessToken || !draftId || !current.etag || savingRef.current) return "skipped";
    if (!isDirty(current)) return "saved";
    savingRef.current = true;
    const payload = prepareForSave(current.draft);
    dispatch({ type: "save-start" });
    try {
      const { etag } = await scenarioEditorApi.putDraft(accessToken, draftId, payload, current.etag);
      let next = etag;
      if (!next) {
        // 204 without a readable ETag (proxy stripped it): the revision must come from the server, never be guessed.
        next = (await scenarioEditorApi.getDraft(accessToken, draftId)).etag;
      }
      dispatch({ type: "save-ok", payload, etag: next });
      return "saved";
    } catch (cause) {
      const { message, conflict: isConflict } = describeSaveError(cause);
      dispatch({ type: "save-fail", message, conflict: isConflict });
      return isConflict ? "conflict" : "error";
    } finally {
      savingRef.current = false;
    }
  }, [accessToken, draftId]);

  const validate = useCallback(async () => {
    if (!accessToken || !draftId) return;
    setValidateError(null);
    setValidating(true);
    try {
      // The BE validates the STORED draft, so unsaved edits are saved first (explicit in the button label).
      if (isDirty(stateRef.current) && (await save()) !== "saved") {
        setValidateError("Không thể kiểm tra vì chưa lưu được bản nháp.");
        return;
      }
      const result = await scenarioEditorApi.validate(accessToken, draftId);
      setServerIssues(normalizeServerIssues(result.issues));
      setValidatedSnapshot(stateRef.current.draft);
      setLastValidation({ isValid: result.isValid, version: result.version });
    } catch (cause) {
      setValidateError(errorMessage(cause, "Không thể kiểm tra bản nháp."));
    } finally {
      setValidating(false);
    }
  }, [accessToken, draftId, save]);

  const clientIssues = useMemo(() => validateDraftState(prepareForSave(state.draft)), [state.draft]);
  const serverStale = validatedSnapshot !== null && validatedSnapshot !== state.draft;
  const issues = useMemo(() => mergeIssues(clientIssues, serverIssues), [clientIssues, serverIssues]);

  /** Fetches the server's current draft and diffs it against the author's. Nothing is written. */
  const loadConflict = useCallback(async () => {
    if (!accessToken || !draftId) return;
    setConflict({ loading: true, error: null, theirs: null, units: [] });
    try {
      const { draft, etag } = await scenarioEditorApi.getDraft(accessToken, draftId);
      const theirs = isObject(draft.state) ? draft.state : {};
      const current = stateRef.current;
      const units = compareDrafts(prepareForSave(current.draft), prepareForSave(theirs), current.baseline);
      setConflict({ loading: false, error: null, theirs: { state: theirs, etag, version: draft.version }, units });
    } catch (cause) {
      setConflict({ loading: false, error: errorMessage(cause, "Không tải được bản mới từ máy chủ."), theirs: null, units: [] });
    }
  }, [accessToken, draftId]);

  /** Adopts the server revision (new ETag) and the author's chosen fields; the result is UNSAVED until the author saves. */
  const applyMerge = useCallback((choices: Record<string, MergeChoice>) => {
    const current = conflict;
    if (!current?.theirs) return;
    const merged = resolveMerge(current.theirs.state, current.units, choices);
    dispatch({ type: "replace", draft: merged, baseline: prepareForSave(current.theirs.state), etag: current.theirs.etag, version: current.theirs.version });
    setConflict(null);
  }, [conflict]);

  const closeConflict = useCallback(() => setConflict(null), []);

  return {
    state, dispatch, edit, dirty, status, load, meta, reload,
    save, validate, validating, validateError, lastValidation,
    issues, clientIssues, serverIssues, serverStale,
    conflict, loadConflict, applyMerge, closeConflict,
  };
}
