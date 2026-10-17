import { apiClient } from "@/api/client";
import { normalizePage, type RawPage } from "@/api/pagination";
import { ApiError, type PageResponse } from "@/api/types/common";
import { rangeQuery } from "./filters";
import { parseHistoryItem, parseResult, parseSessionState } from "./parse";
import type { HistoryBuilding, HistoryItem, HistoryQuery, ResultLoad, SessionState } from "./types";

/** Trainee only (Bearer). Reads are own-data only: the server answers 404 for an id that is not the caller's. */
const auth = (accessToken: string): HeadersInit => ({ Authorization: `Bearer ${accessToken}` });
const base = "/api/training/sessions";

const buildingOf = (raw: unknown): HistoryBuilding | null => {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  if (typeof item.id !== "string") return null;
  return { id: item.id, name: typeof item.name === "string" ? item.name : "", sessionCount: typeof item.sessionCount === "number" ? item.sessionCount : 0, lastSessionAt: typeof item.lastSessionAt === "string" ? item.lastSessionAt : null };
};

export const trainingHistoryApi = {
  /** `GET /api/training/buildings` (#96): Buildings of the caller's own started sessions for the filter, most recent first. */
  async buildings(accessToken: string, page: number, pageSize: number, signal?: AbortSignal): Promise<PageResponse<HistoryBuilding>> {
    const raw = await apiClient.request<RawPage<unknown>>("/api/training/buildings", { headers: auth(accessToken), query: { page, pageSize }, signal });
    const result = normalizePage(raw ?? {}, { page, pageSize });
    return { ...result, items: result.items.map(buildingOf).filter((item): item is HistoryBuilding => item !== null) };
  },

  /** `GET /api/training/sessions`, newest first. `from` is inclusive and `to` exclusive on startedAt (see `rangeQuery`). */
  async list(accessToken: string, query: HistoryQuery, signal?: AbortSignal): Promise<PageResponse<HistoryItem>> {
    const range = rangeQuery(query.from, query.to);
    const raw = await apiClient.request<RawPage<unknown>>(base, {
      headers: auth(accessToken),
      query: { status: query.status || undefined, mode: query.mode || undefined, buildingId: query.buildingId || undefined, from: range.from, to: range.to, page: query.page, pageSize: query.pageSize },
      signal,
    });
    const page = normalizePage(raw ?? {}, { page: query.page, pageSize: query.pageSize });
    const items = page.items.map(parseHistoryItem).filter((item): item is HistoryItem => item !== null);
    return { ...page, items };
  },

  /** `GET /api/training/sessions/{id}`: state of one of the caller's sessions (or a preparation: Prepared/Expired). */
  async state(accessToken: string, id: string, signal?: AbortSignal): Promise<SessionState> {
    const raw = await apiClient.request<unknown>(`${base}/${encodeURIComponent(id)}`, { headers: auth(accessToken), signal });
    const state = parseSessionState(raw);
    if (!state) throw new ApiError("Máy chủ trả về trạng thái lượt tập không hợp lệ.", 200, undefined, undefined, "INVALID_SESSION_STATE");
    return state;
  },

  /** `GET /api/training/sessions/{id}/result`. 409 RESULT_NOT_READY is a state (`not-ready`), every other error is thrown. */
  async result(accessToken: string, id: string, signal?: AbortSignal): Promise<ResultLoad> {
    try {
      const raw = await apiClient.request<unknown>(`${base}/${encodeURIComponent(id)}/result`, { headers: auth(accessToken), signal });
      const result = parseResult(raw);
      if (!result) throw new ApiError("Máy chủ trả về kết quả không hợp lệ.", 200, undefined, undefined, "INVALID_RESULT");
      return { kind: "result", result };
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409 && cause.code === "RESULT_NOT_READY") return { kind: "not-ready" };
      throw cause;
    }
  },
};
