import { isObject, type JsonObject } from "../store/json";
import { scenarioEditorApi } from "../api";
import type { GeometryPin } from "./contract";
import { initialStateV1 } from "./state";

/**
 * Starts a `fet3d.editor/1` draft. The BE creates a draft with state `{}`; the first PUT must be a document that declares
 * `schemaVersion`, so the minimal state (schemaVersion + pinned Geometry, plus any carried-over NON-spatial fields) is
 * written right after the draft exists. A retry replays the same POST (same Idempotency-Key) and skips the PUT when the
 * draft was already initialized, so a lost response never produces two drafts or overwrites content.
 */
export type CreatedDraft = { id: string; initialized: boolean };

export function isEmptyState(state: unknown): boolean {
  return isObject(state) && Object.keys(state).length === 0;
}

/** PUT the initial v1 document into a draft whose state is still `{}`. Returns the new ETag when the server sent one. */
export async function initializeDraft(accessToken: string, draftId: string, etag: string, pin: GeometryPin, extras: JsonObject = {}, signal?: AbortSignal) {
  return scenarioEditorApi.putDraft(accessToken, draftId, initialStateV1(pin, extras), etag, signal);
}

export async function createDraftV1(accessToken: string, input: { scenarioId: string; revisionId: string; idempotencyKey: string; pin: GeometryPin; extras?: JsonObject }): Promise<CreatedDraft> {
  const created = await scenarioEditorApi.createDraft(accessToken, input.scenarioId, input.revisionId, input.idempotencyKey);
  try {
    const loaded = await scenarioEditorApi.getDraft(accessToken, created.id);
    if (!isEmptyState(loaded.draft.state)) return { id: created.id, initialized: true };
    await initializeDraft(accessToken, created.id, loaded.etag, input.pin, input.extras ?? {});
    return { id: created.id, initialized: true };
  } catch {
    // The draft exists; the editor offers "initialize" on an empty draft, so nothing is lost and nothing is created twice.
    return { id: created.id, initialized: false };
  }
}
