"use client";

import { useAsyncData, type AsyncData } from "@/api/use-async-data";
import { trainingHistoryApi } from "./api";
import { isUuid } from "./filters";
import type { HistoryItem, NamedRef, ResultLoad, SessionState } from "./types";

/** Pages of 100 read for the Building filter; a learner with more Buildings than this keeps the URL `building=` working. */
const BUILDING_PAGES = 10;

/**
 * Building filter options from `GET /api/training/buildings`: every Building of the learner's own started sessions (not a
 * sample of the latest sessions), kept after Building access is lost. Shown alphabetically.
 */
export function useHistoryBuildings(accessToken: string | null, userId: string): NamedRef[] {
  const options = useAsyncData(
    `history:buildings:${userId}`,
    async (signal) => {
      const byId = new Map<string, NamedRef>();
      for (let page = 1; page <= BUILDING_PAGES; page += 1) {
        const result = await trainingHistoryApi.buildings(accessToken ?? "", page, 100, signal);
        for (const item of result.items) if (!byId.has(item.id)) byId.set(item.id, { id: item.id, name: item.name });
        if (page * 100 >= result.totalCount || result.items.length === 0) break;
      }
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
