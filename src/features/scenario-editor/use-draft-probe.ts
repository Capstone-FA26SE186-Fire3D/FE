"use client";

import { useCallback, useEffect, useState } from "react";

import { ApiError } from "@/api/types/common";

import { scenarioEditorApi, type LoadedDraft } from "./api";
import { isObject } from "./store/json";
import { SCHEMA_VERSION } from "./v1/contract";

/**
 * How the editor treats a draft, decided by what the SERVER stored:
 * - `v1`: `state.schemaVersion === "fet3d.editor/1"`.
 * - `empty`: a draft just created (`{}`); the first PUT must be a document that declares `schemaVersion`.
 * - `legacy`: no `schemaVersion` (the historical typed shape). Edited as before; never converted, never overwritten with v1.
 * - `unsupported`: a schemaVersion this editor does not know. Not editable here.
 */
export type DraftMode = "v1" | "empty" | "legacy" | "unsupported";

export function classifyDraft(state: unknown): { mode: DraftMode; schemaVersion: string | null } {
  if (!isObject(state)) return { mode: "unsupported", schemaVersion: null };
  if (Object.keys(state).length === 0) return { mode: "empty", schemaVersion: null };
  if (!("schemaVersion" in state)) return { mode: "legacy", schemaVersion: null };
  const declared = typeof state.schemaVersion === "string" ? state.schemaVersion : "";
  return { mode: declared === SCHEMA_VERSION ? "v1" : "unsupported", schemaVersion: declared };
}

export type ProbeState =
  | { phase: "loading" }
  | { phase: "ready"; loaded: LoadedDraft; mode: DraftMode; schemaVersion: string | null }
  | { phase: "error"; status?: number; message: string };

type Result = { key: string; state: ProbeState };

/** Reads the draft once to decide the mode; `reload` reads it again (the result of a reload replaces everything under it). */
export function useDraftProbe(accessToken: string | null, draftId: string | null) {
  const [result, setResult] = useState<Result | null>(null);
  const [token, setToken] = useState(0);
  const key = `${draftId ?? ""}:${token}`;

  useEffect(() => {
    if (!accessToken || !draftId) return;
    const controller = new AbortController();
    scenarioEditorApi.getDraft(accessToken, draftId, controller.signal)
      .then((loaded) => {
        if (controller.signal.aborted) return;
        const { mode, schemaVersion } = classifyDraft(loaded.draft.state);
        setResult({ key, state: { phase: "ready", loaded, mode, schemaVersion } });
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setResult({ key, state: { phase: "error", status: cause instanceof ApiError ? cause.status : undefined, message: cause instanceof Error && cause.message ? cause.message : "Không thể tải bản nháp." } });
      });
    return () => controller.abort();
  }, [accessToken, draftId, key]);

  const reload = useCallback(() => setToken((value) => value + 1), []);
  const state: ProbeState = result && result.key === key ? result.state : { phase: "loading" };
  return { state, reload, key };
}
