import { apiClient } from "@/api/client";
import { scenarioEditorApi, type DraftValidationIssue, type LoadedDraft } from "@/features/scenario-editor/api";
import { draftEtag, normalizeEtag } from "@/features/scenario-editor/store/etag";
import { isObject, type JsonObject } from "@/features/scenario-editor/store/json";
import { findCapability, findRuntime, parseRuntimeCatalog } from "@/features/scenario-editor/v1/catalog";
import { SCHEMA_VERSION } from "@/features/scenario-editor/v1/contract";
import { stateHash } from "@/features/scenario-editor/v1/hash";
import { itemPathToObjectPath, itemsToObjects, objectsToItems } from "@/features/scenario-editor/v1/scope";
import type { EditorBackend } from "@/features/scenario-editor/v1/use-editor-v1";

import { FINAL_EXIT_CAPABILITY, withExitGoals } from "./exit-goals";

const auth = (accessToken: string): HeadersInit => ({ Authorization: `Bearer ${accessToken}` });

/** `Approved` is the lock: scenarios build only on an Approved version, and a decided version never changes. */
export type FireInfrastructureStatus = "Draft" | "Submitted" | "Approved" | "Rejected";

/** BE `FireInfrastructureResponse` (BE#213). `revision` is the ETag number; `version` counts the versions of one IFC revision. */
export type FireInfrastructure = {
  id: string;
  revisionId: string;
  buildingId: string;
  buildingName: string | null;
  organizationId: string;
  version: number;
  status: FireInfrastructureStatus | string;
  revision: number;
  geometry: JsonObject | null;
  runtimeVersion: string | null;
  items: unknown[];
  contentHash: string | null;
  createdAt: string;
  updatedAt: string;
  submittedByName: string | null;
  submittedAt: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  decisionReason: string | null;
  scenarioDraftCount: number;
};

export type LoadedInfrastructure = { infrastructure: FireInfrastructure; etag: string };
export type InfrastructureValidation = { id: string; revision: number; isValid: boolean; issues: DraftValidationIssue[] };

function loaded(response: { data: FireInfrastructure; headers: Headers }): LoadedInfrastructure {
  const etag = draftEtag(response.headers, response.data.revision);
  if (!etag) throw new Error("Chưa xác định được phiên bản của hạ tầng. Hãy tải lại trang.");
  return { infrastructure: response.data, etag };
}

export const fireInfrastructureApi = {
  /** Every version of one IFC revision, newest first. */
  async list(accessToken: string, revisionId: string, signal?: AbortSignal) {
    const response = await apiClient.request<{ revisionId: string; items: FireInfrastructure[] }>(`/api/revisions/${revisionId}/fire-infrastructures`, { headers: auth(accessToken), signal });
    return response.items ?? [];
  },
  /** New Draft: the first one is seeded from the confirmed IFC equipment, later ones copy the newest version. */
  create(accessToken: string, revisionId: string, idempotencyKey: string) {
    return apiClient.request<FireInfrastructure>(`/api/revisions/${revisionId}/fire-infrastructures`, { headers: auth(accessToken), method: "POST", idempotencyKey });
  },
  async get(accessToken: string, id: string, signal?: AbortSignal) {
    return loaded(await apiClient.requestWithMeta<FireInfrastructure>(`/api/fire-infrastructures/${id}`, { headers: auth(accessToken), signal }));
  },
  async update(accessToken: string, id: string, body: JsonObject, etag: string, signal?: AbortSignal) {
    return loaded(await apiClient.requestWithMeta<FireInfrastructure>(`/api/fire-infrastructures/${id}`, { headers: auth(accessToken), method: "PUT", json: body, ifMatch: etag, signal }));
  },
  /** Dry run of the submit checks on the STORED content. */
  validate(accessToken: string, id: string, signal?: AbortSignal) {
    return apiClient.request<InfrastructureValidation>(`/api/fire-infrastructures/${id}/validate`, { headers: auth(accessToken), method: "POST", signal });
  },
  /** Sends the stored Draft to the shared expert queue; its content is frozen from here on. */
  async submit(accessToken: string, id: string, etag: string, idempotencyKey: string) {
    return loaded(await apiClient.requestWithMeta<FireInfrastructure>(`/api/fire-infrastructures/${id}/submit`, { headers: auth(accessToken), method: "POST", ifMatch: etag, idempotencyKey }));
  },
};

/** The infrastructure as the `fet3d.editor/1` document the 3D editor edits: its items are the objects. */
export function toEditorState(infrastructure: FireInfrastructure): JsonObject {
  const state: JsonObject = { schemaVersion: SCHEMA_VERSION, objects: itemsToObjects(infrastructure.items) };
  if (isObject(infrastructure.geometry)) state.geometry = infrastructure.geometry;
  if (typeof infrastructure.runtimeVersion === "string") state.runtimeVersion = infrastructure.runtimeVersion;
  return state;
}

/** PUT body from the editor document. The category of each item is derived from the object (`categoryOf`). */
export function toUpdateBody(state: JsonObject): JsonObject {
  return { geometry: isObject(state.geometry) ? state.geometry : null, runtimeVersion: typeof state.runtimeVersion === "string" ? state.runtimeVersion : null, items: objectsToItems(state.objects) };
}

/** The editor's "draft" view of an infrastructure version, so the same workspace edits both. */
export function toLoadedDraft({ infrastructure, etag }: LoadedInfrastructure): LoadedDraft {
  return {
    etag,
    draft: {
      id: infrastructure.id, scenarioId: "", revisionId: infrastructure.revisionId, buildingId: infrastructure.buildingId, organizationId: infrastructure.organizationId,
      draftNumber: infrastructure.version, state: toEditorState(infrastructure), source: "FireInfrastructure", lastAiRequestId: null,
      createdAt: infrastructure.createdAt, updatedAt: infrastructure.updatedAt, version: infrastructure.revision,
    },
  };
}

/**
 * Once, right after "Lập hạ tầng PCCC": every seeded exit door gets its exit Goal (`withExitGoals`), saved with If-Match on
 * the revision the server just returned. The capability version is the runtime catalog's, as in the editor; without
 * `exit.final` in that runtime nothing is added. Any failure leaves the draft as created and the editor opens anyway.
 */
export async function addSeededExitGoals(accessToken: string, created: FireInfrastructure): Promise<boolean> {
  try {
    const state = toEditorState(created);
    const runtime = findRuntime(parseRuntimeCatalog(await scenarioEditorApi.catalog(accessToken)), created.runtimeVersion ?? undefined);
    const exit = findCapability(runtime, FINAL_EXIT_CAPABILITY);
    if (!exit || !exit.objectKinds.includes("Goal")) return false;
    const objects = withExitGoals(Array.isArray(state.objects) ? state.objects : [], exit);
    if (!objects) return false;
    await fireInfrastructureApi.update(accessToken, created.id, toUpdateBody({ ...state, objects }), `"${created.revision}"`);
    return true;
  } catch {
    return false;
  }
}

/** Storage of the 3D editor for one infrastructure version (`useEditorV1`). */
export function infrastructureBackend(id: string): EditorBackend {
  return {
    get: async (accessToken, signal) => toLoadedDraft(await fireInfrastructureApi.get(accessToken, id, signal)),
    put: async (accessToken, body, etag, signal) => ({ etag: normalizeEtag((await fireInfrastructureApi.update(accessToken, id, toUpdateBody(body), etag, signal)).etag) }),
    // The API validates what is STORED, so the workspace saves before it asks; the answer then describes exactly `body`.
    validate: async (accessToken, body, signal) => {
      const result = await fireInfrastructureApi.validate(accessToken, id, signal);
      return { draftId: id, storedVersion: result.revision, stateHash: stateHash(body), isValid: result.isValid, issues: result.issues.map((issue) => ({ ...issue, path: itemPathToObjectPath(issue.path) })) };
    },
  };
}

export const INFRASTRUCTURE_STATUS: Record<string, { label: string; tone: "neutral" | "info" | "success" | "danger" }> = {
  Draft: { label: "Bản nháp", tone: "neutral" },
  Submitted: { label: "Chờ thẩm định", tone: "info" },
  Approved: { label: "Đã khoá", tone: "success" },
  Rejected: { label: "Chưa đạt thẩm định", tone: "danger" },
};

/** The version scenarios build on: the newest Approved one of the revision, or null. */
export function lockedVersion(versions: readonly FireInfrastructure[]): FireInfrastructure | null {
  return [...versions].filter((item) => item.status === "Approved").sort((a, b) => b.version - a.version)[0] ?? null;
}
