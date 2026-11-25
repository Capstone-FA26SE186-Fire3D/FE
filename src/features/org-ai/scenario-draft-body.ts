import type { ScenarioDraftInput } from "./types";

/** The situation the user has open: its Building and the fire infrastructure it is built on. */
export type DraftScope = { buildingId: string; infrastructureId: string };

/**
 * Body of `POST /api/ai/organization/scenario-draft`. A proposal asked from inside a situation names that situation's
 * fire infrastructure (BE#231), so the AI works on the same exits and fixed equipment the editor shows; the server then
 * pins that infrastructure's own IFC revision. Anywhere else the server picks the newest Approved infrastructure.
 */
export function scenarioDraftBody(buildingId: string, prompt: string, scope?: DraftScope | null): ScenarioDraftInput {
  return { buildingId, prompt, ...(scope && scope.buildingId === buildingId ? { infrastructureId: scope.infrastructureId } : {}) };
}
