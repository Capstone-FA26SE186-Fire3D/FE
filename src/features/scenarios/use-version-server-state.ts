"use client";

import { useCallback, useMemo, useState } from "react";

import { ApiError } from "@/api/types/common";
import { useAsyncData, type AsyncData } from "@/api/use-async-data";

import type { Release, ReleaseSummary, ScenarioVersionSummary, VersionReadiness, VersionReview } from "./version-types";
import { scenarioVersionsApi } from "./versions-api";

export type ReleaseView = {
  /** Release of this version as the server reports it (never remembered by the browser). */
  release: Release | undefined;
  /** Newest listed release of this version, even while its detail is still loading. */
  summary: ReleaseSummary | undefined;
  loading: boolean;
  error: unknown;
  reload: () => void;
};

export type VersionServerState = {
  readiness: AsyncData<VersionReadiness>;
  /** Frozen submission. Only fetched once the server says the version was submitted. */
  review: AsyncData<VersionReview>;
  releaseView: ReleaseView;
  /** Tell the view a release was just created so its detail loads before the list refresh lands. */
  noteRelease: (releaseId: string) => void;
  /** Re-read everything the server owns about this version after a command. */
  refresh: () => void;
};

const RELEASE_PAGE_SIZE = 100;

/** A Built or Published release wins over a Revoked one; within a group the newest (list order) wins. */
function pickRelease(items: ReleaseSummary[], versionId: string): ReleaseSummary | undefined {
  const own = items.filter((item) => item.scenarioVersionId === versionId);
  return own.find((item) => item.status.toLowerCase() !== "revoked") ?? own[0];
}

function isNotFound(error: unknown) {
  return error instanceof ApiError && error.status === 404;
}

/**
 * Everything the server remembers about one scenario version: technical readiness, the frozen content review and the
 * release. All of it is re-read after a reload or on another machine, so nothing is stored in the browser: a command's
 * response only triggers `refresh()`, it is never kept as the source of truth.
 */
export function useVersionServerState({ accessToken, version }: { accessToken: string; version: ScenarioVersionSummary }): VersionServerState {
  const [noted, setNoted] = useState<string | undefined>();

  const readiness = useAsyncData(`version-readiness:${version.id}`, (signal) => scenarioVersionsApi.getVersionReadiness(accessToken, version.id, signal));

  // `reviewStatus` is missing only on deployments older than the review read API; then try the read and treat 404 as "not submitted".
  const submitted = version.reviewStatus ? version.reviewStatus.toLowerCase() !== "notsubmitted" : true;
  const review = useAsyncData(`version-review:${version.id}:${version.reviewStatus ?? "unknown"}:${version.reviewId ?? ""}`, (signal) => scenarioVersionsApi.getVersionReview(accessToken, version.id, signal), submitted);

  const releases = useAsyncData(`version-releases:${version.scenarioId}`, (signal) => scenarioVersionsApi.listReleases(accessToken, { scenarioId: version.scenarioId }, 1, RELEASE_PAGE_SIZE, signal));
  const summary = useMemo(() => pickRelease(releases.data?.items ?? [], version.id), [releases.data, version.id]);
  const releaseId = summary?.id ?? noted;
  const detail = useAsyncData(`release:${releaseId ?? "none"}`, (signal) => scenarioVersionsApi.getRelease(accessToken, releaseId as string, signal), Boolean(releaseId));
  const loaded = releaseId && detail.data?.id === releaseId && detail.data.scenarioVersionId === version.id ? detail.data : undefined;

  const { reload: reloadReadiness } = readiness;
  const { reload: reloadReview } = review;
  const { reload: reloadReleases } = releases;
  const { reload: reloadDetail } = detail;
  const reloadRelease = useCallback(() => { reloadReleases(); reloadDetail(); }, [reloadReleases, reloadDetail]);
  const refresh = useCallback(() => { reloadReadiness(); reloadReview(); reloadRelease(); }, [reloadReadiness, reloadReview, reloadRelease]);

  const releaseView: ReleaseView = {
    release: loaded,
    summary,
    loading: releases.loading && !releases.data ? true : Boolean(releaseId) && detail.loading && !loaded,
    error: releases.error ?? (releaseId ? detail.error : undefined),
    reload: reloadRelease,
  };

  return {
    readiness,
    review: submitted && !isNotFound(review.error) ? review : { ...review, error: undefined, data: undefined },
    releaseView,
    noteRelease: setNoted,
    refresh,
  };
}
