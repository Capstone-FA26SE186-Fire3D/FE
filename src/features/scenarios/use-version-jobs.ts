"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useAsyncData } from "@/api/use-async-data";
import { usePolling } from "@/api/use-polling";

import { scenarioVersionsApi } from "./versions-api";
import { isJobSucceeded, isJobTerminal, qaVerdict, type QaVerdict } from "./version-readiness";
import type { JobQa, ProcessingJobDetail, ProcessingJobSummary, VersionIssuePage } from "./version-types";

type Snapshot = { detail: ProcessingJobDetail; qa?: JobQa; issues?: VersionIssuePage; qaAttempts: number };

/** After a job Succeeds, wait this many polls (about 15 s) for its validation run before reporting "no QA yet". */
const QA_WAIT_POLLS = 5;

export type VersionJobs = {
  jobs: ProcessingJobSummary[];
  jobsLoading: boolean;
  jobsError: unknown;
  reloadJobs: () => void;
  selectedJobId: string | undefined;
  /** Switch to a job (also used right after a build or retry is accepted). */
  selectJob: (jobId: string) => void;
  detail: ProcessingJobDetail | undefined;
  qa: JobQa | undefined;
  issues: VersionIssuePage | undefined;
  verdict: QaVerdict | undefined;
  /** True while the polling loop is still waiting for a final state. */
  watching: boolean;
  watchError: unknown;
  /** Succeeded job, polled several times, still without a validation run. */
  qaMissing: boolean;
  refresh: () => void;
};

/**
 * Package-build jobs of one scenario version and the live state of the selected one. Jobs are rediscovered from the
 * revision's job list (so they survive a reload); the selected job is polled every 3 s with backoff until it is final.
 * Succeeded is not Passed: the verdict comes only from the job's validation runs and their Error/Critical issues.
 */
export function useVersionJobs({ accessToken, revisionId, versionId, rememberedJobId }: {
  accessToken: string;
  revisionId: string;
  versionId: string;
  rememberedJobId?: string;
}): VersionJobs {
  const [chosen, setChosen] = useState<{ versionId: string; jobId: string } | null>(null);
  const jobsQuery = useAsyncData(`version-jobs:${revisionId}`, (signal) => scenarioVersionsApi.listRevisionJobs(accessToken, revisionId, signal));

  const jobs = useMemo(
    () => (jobsQuery.data?.items ?? []).filter((job) => job.scenarioVersionId === versionId && job.kind.endsWith("Package")),
    [jobsQuery.data, versionId],
  );

  const selectedJobId = (chosen?.versionId === versionId ? chosen.jobId : undefined) ?? rememberedJobId ?? jobs[0]?.id;
  const qaPolls = useRef<{ jobId?: string; count: number }>({ count: 0 });

  const polling = usePolling<Snapshot>({
    enabled: Boolean(selectedJobId),
    fetcher: async (signal) => {
      const jobId = selectedJobId as string;
      const detail = await scenarioVersionsApi.getJob(accessToken, jobId, signal);
      if (!isJobSucceeded(detail.job.status)) return { detail, qaAttempts: 0 };
      if (qaPolls.current.jobId !== jobId) qaPolls.current = { jobId, count: 0 };
      qaPolls.current.count += 1;
      const qa = await scenarioVersionsApi.getJobQa(accessToken, jobId, signal);
      const issues = qa.validationRuns.items.length ? await scenarioVersionsApi.listRevisionIssues(accessToken, revisionId, signal) : undefined;
      return { detail, qa, issues, qaAttempts: qaPolls.current.count };
    },
    isDone: (snapshot) => {
      if (!isJobTerminal(snapshot.detail.job.status)) return false;
      if (!isJobSucceeded(snapshot.detail.job.status)) return true;
      return (snapshot.qa?.validationRuns.items.length ?? 0) > 0 || snapshot.qaAttempts >= QA_WAIT_POLLS;
    },
  });

  const { refresh: restartPolling } = polling;
  const selectJob = useCallback((jobId: string) => {
    setChosen({ versionId, jobId });
    qaPolls.current = { count: 0 };
    restartPolling();
  }, [restartPolling, versionId]);

  const snapshot = polling.data && polling.data.detail.job.id === selectedJobId ? polling.data : undefined;
  const verdict = snapshot && isJobSucceeded(snapshot.detail.job.status) && snapshot.qa
    ? qaVerdict(snapshot.qa.validationRuns.items, snapshot.issues?.items ?? [])
    : undefined;
  const qaMissing = Boolean(snapshot && isJobSucceeded(snapshot.detail.job.status) && verdict?.kind === "none" && polling.finished);

  return {
    jobs,
    jobsLoading: jobsQuery.loading,
    jobsError: jobsQuery.error,
    reloadJobs: jobsQuery.reload,
    selectedJobId,
    selectJob,
    detail: snapshot?.detail,
    qa: snapshot?.qa,
    issues: snapshot?.issues,
    verdict,
    watching: Boolean(selectedJobId) && !polling.finished,
    watchError: polling.error,
    qaMissing,
    refresh: () => {
      qaPolls.current = { count: 0 };
      polling.refresh();
    },
  };
}
