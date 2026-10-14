"use client";

import { useMemo } from "react";

import { useAsyncData } from "@/api/use-async-data";

import { scenarioEditorApi } from "../api";
import { parseFloorsResponse, type FloorsReading } from "./geometry";

/**
 * `GET /api/revisions/{id}/floors`: whether the revision has an accepted `fet3d.editor/1` Geometry artifact, and its pin
 * (artifactId + sha256Hash). Reads metadata only (no storage access), so it is the check used before a v1 draft is created.
 */
export function useRevisionFloors(accessToken: string | null, revisionId: string | undefined) {
  const query = useAsyncData(`editor-floors:${revisionId ?? ""}`, (signal) => scenarioEditorApi.revisionFloors(accessToken ?? "", revisionId ?? "", signal), Boolean(accessToken && revisionId));
  const reading = useMemo<FloorsReading | null>(() => (query.data ? parseFloorsResponse(query.data) : null), [query.data]);
  return { reading, loading: query.loading && !query.data, error: query.error, reload: query.reload };
}
