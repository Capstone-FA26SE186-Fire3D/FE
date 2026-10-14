"use client";

import { useAsyncData, type AsyncData } from "@/api/use-async-data";
import { trainingHistoryApi } from "./api";
import { isUuid } from "./filters";
import type { HistoryItem, NamedRef, ResultLoad, SessionState } from "./types";

/**
 * Building filter options. A Trainee has no Building catalog (the API lists Buildings for organizations only), so the
 * choices are the Buildings of the learner's own latest sessions (one read of up to 100 sessions). A Building the learner
 * trained in long ago may be missing here; the filter then cannot select it, but the URL `building=` still works.
 */
export function useHistoryBuildings(accessToken: string | null, userId: string): NamedRef[] {
  const options = useAsyncData(
    `history:buildings:${userId}`,
    async (signal) => {
      const page = await trainingHistoryApi.list(accessToken ?? "", { status: "", mode: "", buildingId: "", from: "", to: "", page: 1, pageSize: 100 }, signal);
      const byId = new Map<string, NamedRef>();
      for (const item of page.items) if (item.building.id && !byId.has(item.building.id)) byId.set(item.building.id, item.building);
      return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, "vi"));
    },
    !!accessToken && !!userId,
    { scope: userId },
  );
  return options.data ?? [];
}

export type SessionDetail = {
  /** Present only when the list row was not at hand (deep link, another page): the state read from the server. */
  state: SessionState | null;
  /** null: the session has no stored result, so none was requested. */
  load: ResultLoad | null;
};

/**
 * Detail of ONE session id. The result is requested only when the server says a result exists (the list row's
 * `resultStatus`, or `hasResult` of the session state for a deep link); a 409 RESULT_NOT_READY from it is the "not ready"
 * state, not a failure. Data and errors of another id are never shown under this one (`keepPrevious: false`), and a late
 * answer for the previous id is dropped by the abort in `useAsyncData`.
 */
export function useSessionDetail(accessToken: string | null, sessionId: string, known: HistoryItem | null): AsyncData<SessionDetail> {
  const valid = isUuid(sessionId);
  // "n": the row is known and has no result yet; anything else loads the same data, so a list arriving late does not reload it.
  const key = `history:detail:${sessionId}:${known && known.resultStatus === null ? "n" : "x"}`;
  return useAsyncData<SessionDetail>(
    key,
    async (signal) => {
      const token = accessToken ?? "";
      let state: SessionState | null = null;
      let hasResult: boolean;
      if (known) hasResult = known.resultStatus !== null;
      else {
        state = await trainingHistoryApi.state(token, sessionId, signal);
        hasResult = state.hasResult;
      }
      return { state, load: hasResult ? await trainingHistoryApi.result(token, sessionId, signal) : null };
    },
    !!accessToken && valid,
    { keepPrevious: false },
  );
}
