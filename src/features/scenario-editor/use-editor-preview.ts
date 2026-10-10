"use client";

import { useCallback, useEffect, useState } from "react";

import { ApiError } from "@/api/types/common";
import type { EditorPreview } from "@/features/buildings/types";

import { scenarioEditorApi } from "./api";

export type PreviewPhase = "idle" | "loading" | "ready" | "not-ready" | "error";

export type PreviewState = {
  phase: PreviewPhase;
  preview: EditorPreview | null;
  error: string | null;
  /** Bumped whenever a fresh signed URL was fetched; the viewport reloads the model when it changes. */
  nonce: number;
  attempts: number;
};

const POLL_MS = 5000;
const MAX_POLLS = 24; // ~2 minutes of light polling, then a manual retry button

function message(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 404) return "Không tìm thấy revision này trong công trình.";
    if (error.status === 401 || error.status === 403) return "Không có quyền xem mô hình của revision này.";
    return error.message || "Không tải được thông tin mô hình.";
  }
  return error instanceof Error ? error.message : "Không tải được thông tin mô hình.";
}

/**
 * `GET /api/buildings/{id}/editor-preview`. `NotReady` is a 200 with `downloadUrl: null` (polled lightly, paused in a hidden
 * tab). A `Ready` response carries a signed URL valid ~5 minutes: it is not cached beyond the request that needs it, and
 * `refresh()` fetches a new one (used when the model download is rejected as expired).
 */
export function useEditorPreview(accessToken: string | null, buildingId: string | undefined, revisionId: string | undefined) {
  const [state, setState] = useState<PreviewState>({ phase: "idle", preview: null, error: null, nonce: 0, attempts: 0 });
  const [kick, setKick] = useState(0);

  useEffect(() => {
    if (!accessToken || !buildingId || !revisionId) return;
    const controller = new AbortController();
    let timer: number | undefined;
    let polls = 0;
    let stopped = false;

    const run = async () => {
      if (stopped) return;
      if (document.visibilityState === "hidden") {
        timer = window.setTimeout(run, POLL_MS);
        return;
      }
      try {
        const preview = await scenarioEditorApi.editorPreview(accessToken, buildingId, revisionId, controller.signal);
        if (stopped) return;
        const ready = preview.status === "Ready" && Boolean(preview.downloadUrl);
        if (ready) {
          setState((current) => ({ phase: "ready", preview, error: null, nonce: current.nonce + 1, attempts: polls }));
          return;
        }
        polls += 1;
        setState((current) => ({ phase: "not-ready", preview, error: null, nonce: current.nonce, attempts: polls }));
        if (polls < MAX_POLLS) timer = window.setTimeout(run, POLL_MS);
      } catch (cause) {
        if (stopped || controller.signal.aborted) return;
        setState((current) => ({ ...current, phase: "error", error: message(cause), attempts: polls }));
      }
    };

    // Deferred: no synchronous setState in the effect body.
    timer = window.setTimeout(() => {
      setState((current) => ({ ...current, phase: "loading", error: null }));
      void run();
    }, 0);
    const onVisible = () => {
      if (document.visibilityState === "visible" && !stopped && polls > 0) {
        window.clearTimeout(timer);
        void run();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      controller.abort();
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [accessToken, buildingId, revisionId, kick]);

  const refresh = useCallback(() => {
    setKick((value) => value + 1);
  }, []);

  return { ...state, refresh };
}
