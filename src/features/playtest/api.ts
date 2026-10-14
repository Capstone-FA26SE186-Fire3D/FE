import { apiClient } from "@/api/client";

import type { PlaytestHandoff, PlaytestPreparation, PlaytestStatus, PreparePlaytestInput } from "./types";

function headers(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

/**
 * Web side of the playtest lifecycle. Deliberately NOT here: `handoffs/redeem`, `start`, `launch-grants`, `launched`,
 * `heartbeat`, `events:batch` and `complete`. Those are the Mobile/Unity session's job and consume the grant or Trial;
 * the Web session must never call them.
 */
export const playtestApi = {
  /**
   * 201 `PlaytestPreparation`. Pins an accepted immutable PlaytestPackage; no Trial, no grant. `buildingId` is optional and
   * must match the scenario's building. Idempotency-Key required: one key per intent, reused unchanged when the same payload is retried.
   */
  prepare(accessToken: string, scenarioId: string, buildingId: string | undefined, input: PreparePlaytestInput, idempotencyKey: string) {
    return apiClient.request<PlaytestPreparation>(`/api/scenarios/${scenarioId}/playtests`, {
      headers: headers(accessToken),
      idempotencyKey,
      json: input,
      query: { buildingId },
    });
  },
  /** Status, pinned package, grant metadata, recovery flags and completion. The only source of truth after a reload. */
  get(accessToken: string, playtestId: string, signal?: AbortSignal) {
    return apiClient.request<PlaytestStatus>(`/api/playtests/${playtestId}`, { headers: headers(accessToken), signal });
  },
  /** 201 opaque 5-minute single-use code + deep link. A new code revokes earlier open codes. Only while status is Created. */
  createHandoff(accessToken: string, playtestId: string, idempotencyKey: string) {
    return apiClient.request<PlaytestHandoff>(`/api/playtests/${playtestId}/handoffs`, { headers: headers(accessToken), idempotencyKey, method: "POST" });
  },
  /** Ends the playtest as Cancelled from any non-terminal state; Trial is never refunded automatically. */
  cancel(accessToken: string, playtestId: string, idempotencyKey: string) {
    return apiClient.request<PlaytestStatus>(`/api/playtests/${playtestId}/cancel`, { headers: headers(accessToken), idempotencyKey, method: "POST" });
  },
};
