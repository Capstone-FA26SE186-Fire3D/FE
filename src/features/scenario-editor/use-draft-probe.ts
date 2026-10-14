"use client";

import { useCallback, useEffect, useState } from "react";

import { ApiError } from "@/api/types/common";

import { scenarioEditorApi, type LoadedDraft } from "./api";
import { classifyDraft, type DraftMode } from "./v1/mode";
import { describeApiError } from "@/api/describe-error";

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
        setResult({ key, state: { phase: "error", status: cause instanceof ApiError ? cause.status : undefined, message: describeApiError(cause, "Không thể tải bản nháp.") } });
      });
    return () => controller.abort();
  }, [accessToken, draftId, key]);

  const reload = useCallback(() => setToken((value) => value + 1), []);
  const state: ProbeState = result && result.key === key ? result.state : { phase: "loading" };
  return { state, reload, key };
}
