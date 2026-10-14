"use client";

import { useCallback, useRef, useState } from "react";
import { learnAdminApi } from "./api";
import { describeLearnError } from "./errors";
import type { MediaDescriptor } from "./types";

/** Result of `POST /api/admin/learn/media/validate` for the URL a video block held at the time. */
export type MediaCheck = { url: string; state: "checking" | "ok" | "invalid" | "error"; descriptor?: MediaDescriptor; message?: string };

/**
 * Per-block video checks. A late answer for a URL the user has already changed is dropped (`latest`), so an old result
 * never decorates a new link. `invalid` means the backend refused the URL (LEARN_MEDIA_INVALID); `error` means the check
 * itself failed (network, 5xx), which proves nothing about the URL.
 */
export function useMediaChecks(accessToken: string) {
  const [checks, setChecks] = useState<Record<string, MediaCheck>>({});
  const latest = useRef<Record<string, string>>({});
  // Mirror of the state, read synchronously so a blur and a button click for the same link make one request.
  const settled = useRef<Record<string, MediaCheck>>({});
  const record = useCallback((blockId: string, entry: MediaCheck | null) => {
    if (entry) settled.current[blockId] = entry; else delete settled.current[blockId];
    setChecks((current) => {
      const next = { ...current };
      if (entry) next[blockId] = entry; else delete next[blockId];
      return next;
    });
  }, []);

  const check = useCallback(async (blockId: string, rawUrl: string) => {
    const url = rawUrl.trim();
    const known = settled.current[blockId];
    // The same link is already being checked or has an answer: only a failed check (network/5xx) is worth repeating.
    if (url && known && known.url === url && known.state !== "error") return;
    latest.current[blockId] = url;
    if (!url) { record(blockId, null); return; }
    record(blockId, { url, state: "checking" });
    try {
      const descriptor = await learnAdminApi.validateMedia(accessToken, url);
      if (latest.current[blockId] !== url) return;
      record(blockId, { url, state: "ok", descriptor });
    } catch (cause) {
      if (latest.current[blockId] !== url) return;
      const view = describeLearnError(cause);
      record(blockId, { url, state: view.code === "LEARN_MEDIA_INVALID" ? "invalid" : "error", message: view.code === "LEARN_MEDIA_INVALID" ? view.message : view.title });
    }
  }, [accessToken, record]);

  return { checks, check };
}

/** True when the backend already refused exactly the URL the block holds now. */
export function isMediaRefused(checks: Record<string, MediaCheck>, blockId: string, url: unknown): boolean {
  const entry = checks[blockId];
  return !!entry && entry.state === "invalid" && typeof url === "string" && entry.url === url.trim();
}
