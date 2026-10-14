"use client";

import { useMemo, useRef } from "react";

import { useAsyncData } from "@/api/use-async-data";
import { usePolling } from "@/api/use-polling";
import { isJobSucceeded, isJobTerminal, qaVerdict } from "@/features/scenarios/version-readiness";
import type { JobQa, ProcessingJobDetail, ProcessingJobSummary, VersionIssuePage } from "@/features/scenarios/version-types";
import { scenarioVersionsApi } from "@/features/scenarios/versions-api";

/** After a job Succeeds, wait this many polls for its validation run before reporting "no QA yet". */
const QA_WAIT_POLLS = 5;

/**
 * What the server says about the PlaytestPackage of one version. It reports only: the real gate is BE
 * (`DRAFT_SNAPSHOT_REQUIRED`, `PLAYTEST_PACKAGE_REQUIRED`, `RUNTIME_INCOMPATIBLE` on prepare), and a Succeeded job or a
 * Built row alone is not an accepted package.
 */
export type PlaytestPackageState =
  | { kind: "loading" }
  | { kind: "error"; error: unknown }
  /** No PlaytestPackage job exists for this version. */
  | { kind: "none" }
  /** Queued or Running. */
  | { kind: "building"; job: ProcessingJobSummary }
  | { kind: "failed"; job: ProcessingJobSummary }
  /** Job Succeeded; `qa` is the verdict of its newest validation run (`checking` while the run is awaited). */
  | { kind: "succeeded"; job: ProcessingJobSummary; qa: "passed" | "failed" | "none" | "checking"; blockers: number };

export type PlaytestPackageWatch = { state: PlaytestPackageState; reload: () => void };

type Snapshot = { detail: ProcessingJobDetail; qa?: JobQa; issues?: VersionIssuePage; attempts: number };

/** Package-build jobs of the revision, newest first (BE order), narrowed to this version's PlaytestPackage jobs. */
export function usePlaytestPackage({ accessToken, revisionId, versionId, enabled = true }: { accessToken: string; revisionId: string; versionId: string; enabled?: boolean }): PlaytestPackageWatch {
  const jobsQuery = useAsyncData(`playtest-jobs:${revisionId}`, (signal) => scenarioVersionsApi.listRevisionJobs(accessToken, revisionId, signal), enabled);
  const job = useMemo(
    () => (jobsQuery.data?.items ?? []).find((item) => item.scenarioVersionId === versionId && item.kind === "PlaytestPackage"),
    [jobsQuery.data, versionId],
  );

  const attempts = useRef({ jobId: "", count: 0 });
  const polling = usePolling<Snapshot>({
    enabled: enabled && Boolean(job),
    resetKey: job?.id ?? "",
    fetcher: async (signal) => {
      const detail = await scenarioVersionsApi.getJob(accessToken, (job as ProcessingJobSummary).id, signal);
      if (!isJobSucceeded(detail.job.status)) return { detail, attempts: 0 };
      const qa = await scenarioVersionsApi.getJobQa(accessToken, detail.job.id, signal);
      const issues = qa.validationRuns.items.length ? await scenarioVersionsApi.listRevisionIssues(accessToken, revisionId, signal) : undefined;
      if (attempts.current.jobId !== detail.job.id) attempts.current = { jobId: detail.job.id, count: 0 };
      attempts.current.count += 1;
      return { detail, qa, issues, attempts: attempts.current.count };
    },
    isDone: (snapshot) => {
      if (!isJobTerminal(snapshot.detail.job.status)) return false;
      if (!isJobSucceeded(snapshot.detail.job.status)) return true;
      return (snapshot.qa?.validationRuns.items.length ?? 0) > 0 || snapshot.attempts >= QA_WAIT_POLLS;
    },
  });

  const { reload: reloadJobs } = jobsQuery;
  const { refresh } = polling;
  const reload = () => { reloadJobs(); refresh(); };

  const snapshot = polling.data && job && polling.data.detail.job.id === job.id ? polling.data : undefined;
  let state: PlaytestPackageState;
  if (jobsQuery.error !== undefined && !jobsQuery.data) state = { kind: "error", error: jobsQuery.error };
  else if (!jobsQuery.data) state = { kind: "loading" };
  else if (!job) state = { kind: "none" };
  else if (!snapshot) state = polling.error !== undefined ? { kind: "error", error: polling.error } : { kind: "loading" };
  else {
    const status = snapshot.detail.job.status;
    if (!isJobTerminal(status)) state = { kind: "building", job: snapshot.detail.job };
    else if (!isJobSucceeded(status)) state = { kind: "failed", job: snapshot.detail.job };
    else if (!snapshot.qa) state = { kind: "succeeded", job: snapshot.detail.job, qa: "checking", blockers: 0 };
    else {
      const verdict = qaVerdict(snapshot.qa.validationRuns.items, snapshot.issues?.items ?? []);
      const qa = verdict.kind === "none" ? (polling.finished ? "none" : "checking") : verdict.kind;
      state = { kind: "succeeded", job: snapshot.detail.job, qa, blockers: verdict.kind === "failed" ? verdict.blockingIssues.length : 0 };
    }
  }
  return { state, reload };
}

/** Lines naming what is still missing before a playtest can be prepared, from what the server reported. Empty = nothing known missing. */
export function packageMissing(state: PlaytestPackageState): string[] {
  switch (state.kind) {
    case "none": return ["Chưa có job dựng PlaytestPackage cho phiên bản này."];
    case "building": return ["PlaytestPackage đang được dựng (chưa có kết quả)."];
    case "failed": return ["Job dựng PlaytestPackage đã thất bại; chạy lại ở tab Package build."];
    case "succeeded":
      if (state.qa === "failed") return [`QA của PlaytestPackage không đạt${state.blockers ? ` (${state.blockers} issue Error/Critical)` : ""}.`];
      if (state.qa === "none") return ["Job xong nhưng chưa có validation run: Succeeded chưa phải QA Passed."];
      return [];
    default: return [];
  }
}
