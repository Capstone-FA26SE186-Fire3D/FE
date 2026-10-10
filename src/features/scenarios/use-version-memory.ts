"use client";

import { useCallback, useState } from "react";

import type { ContentReviewSubmission } from "./version-types";

/**
 * What this browser tab learned about a version from command responses. BE cannot read these back after a reload
 * (BE#52, BE#53), so they are remembered per tab in sessionStorage and always labelled as "trong phiên này".
 * This is client memory, never server truth.
 */
export type VersionMemory = {
  submission?: ContentReviewSubmission;
  confirmReviewId?: string;
  confirmRunId?: string;
  releaseId?: string;
  /** Latest job id started from this tab; other jobs are rediscovered through the revision's job list. */
  jobId?: string;
};

const PREFIX = "fire3d-version-memory:";

function read(versionId: string): VersionMemory {
  try {
    const raw = window.sessionStorage.getItem(PREFIX + versionId);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as VersionMemory) : {};
  } catch {
    return {};
  }
}

function write(versionId: string, value: VersionMemory) {
  try {
    window.sessionStorage.setItem(PREFIX + versionId, JSON.stringify(value));
  } catch {
    // Storage blocked: memory simply lasts until reload.
  }
}

/**
 * Mount this only after the version is loaded on the client (key it by version id): the first read happens in the
 * state initializer, so there is no SSR/hydration mismatch and no flash of empty memory.
 */
export function useVersionMemory(versionId: string) {
  const [memory, setMemory] = useState<VersionMemory>(() => read(versionId));

  const remember = useCallback((patch: VersionMemory) => {
    setMemory((current) => {
      const next = { ...current, ...patch };
      write(versionId, next);
      return next;
    });
  }, [versionId]);

  return { memory, remember };
}
