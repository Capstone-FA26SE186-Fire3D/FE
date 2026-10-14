import { capabilitiesForKind, findRuntime, type RuntimeOption } from "./catalog";
import { CAPABILITY_REQUIRED_KINDS, OBJECT_KINDS, type ObjectKind } from "./contract";
import type { GeometryInfo } from "./geometry";

/**
 * What the editor can offer for each object kind, derived from REAL state only: the Geometry the revision actually has and
 * the capabilities the runtime catalog actually publishes. This replaces the former fixed "locked" flags. Nothing is seeded:
 * an empty catalog is reported as "configure the runtime", not papered over.
 */
export type GeometryState = "valid" | "loading" | "not-ready" | "reprocess" | "invalid";

export type KindStatus =
  | { state: "ready"; capabilities: number }
  | { state: "needs-geometry"; geometry: Exclude<GeometryState, "valid"> }
  | { state: "catalog-loading" }
  | { state: "catalog-error" }
  /** The catalog has no runtime or no capability for this kind: the operator must publish one. */
  | { state: "no-capability"; runtime: string | null; runtimes: number }
  /** Geometry has no semantic mapping, so no IFC element can be chosen as the anchor. */
  | { state: "no-anchor" };

export type AvailabilityInput = {
  geometry: GeometryState;
  geometryInfo: GeometryInfo | null;
  catalog: { loading: boolean; error: boolean; runtimes: RuntimeOption[] };
  runtimeVersion: string | undefined;
};

export function kindAvailability(input: AvailabilityInput): Record<ObjectKind, KindStatus> {
  const out = {} as Record<ObjectKind, KindStatus>;
  for (const kind of OBJECT_KINDS) {
    if (input.geometry !== "valid") { out[kind] = { state: "needs-geometry", geometry: input.geometry }; continue; }
    const required = (CAPABILITY_REQUIRED_KINDS as readonly ObjectKind[]).includes(kind);
    if (kind === "BlockedElement" && (input.geometryInfo?.semantic.length ?? 0) === 0) { out[kind] = { state: "no-anchor" }; continue; }
    const selected = findRuntime(input.catalog.runtimes, input.runtimeVersion);
    const offered = selected ? capabilitiesForKind(selected, kind).length : input.catalog.runtimes.reduce((sum, runtime) => sum + capabilitiesForKind(runtime, kind).length, 0);
    if (!required) { out[kind] = { state: "ready", capabilities: offered }; continue; }
    if (input.catalog.loading) { out[kind] = { state: "catalog-loading" }; continue; }
    if (input.catalog.error) { out[kind] = { state: "catalog-error" }; continue; }
    out[kind] = offered > 0 ? { state: "ready", capabilities: offered } : { state: "no-capability", runtime: selected?.runtimeVersion ?? null, runtimes: input.catalog.runtimes.length };
  }
  return out;
}

/** Placement is blocked only when the state says it cannot lead to a complete object (capability required but none exists). */
export function placementBlocked(status: KindStatus): boolean {
  return status.state === "needs-geometry" || status.state === "no-capability" || status.state === "no-anchor";
}
