/**
 * Playtest contract (BE `PlaytestsController` + `POST /api/scenarios/{id}/playtests`, OpenAPI @ 1eaf988).
 * Web only prepares, reads status, creates an opaque handoff code and cancels. Redeem/start/launch/heartbeat/events/complete
 * belong to Mobile and are intentionally absent from this module.
 */

/** Lifecycle as stored by BE: Created → Launching (Mobile start) → Running (runtime confirmed) → Completed | Cancelled. */
export type PlaytestStatusName = "Created" | "Launching" | "Running" | "Completed" | "Cancelled";

/** `POST /api/scenarios/{scenarioId}/playtests` body: exactly one of `scenarioVersionId` / `scenarioDraftId`. Web always pins a version. */
export type PreparePlaytestInput = { revisionId: string; scenarioVersionId: string };

/** 201 of prepare. No entitlement is assigned, no Trial consumed, no launch grant returned. */
export type PlaytestPreparation = {
  id: string;
  scenarioVersionId: string;
  artifactId: string;
  validationRunId: string;
  packageHash: string;
  manifestHash: string;
  buildTarget: string;
};

export type PlaytestPackageView = {
  artifactId: string;
  manifestArtifactId: string;
  validationRunId: string;
  packageHash: string;
  manifestHash: string;
  buildTarget: string;
  protocolVersion: string;
  manifestSchemaVersion: string;
};

/** Metadata of the current launch grant only; the grant JWT itself is never returned by GET and never shown by Web. */
export type PlaytestGrantView = { generation: number; issuedAt: string; expiresAt: string };

/** What the calling session may do. BE decides; Web only mirrors it. */
export type PlaytestRecoveryView = { canStart: boolean; canReissueGrant: boolean; canSync: boolean; canCancel: boolean };

/** `GET /api/playtests/{id}`. `completion` is an opaque JSON element (BE does not publish a schema). */
export type PlaytestStatus = {
  id: string;
  buildingId: string;
  revisionId: string;
  scenarioVersionId: string;
  status: PlaytestStatusName | string;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  runtimeVersion: string | null;
  package: PlaytestPackageView;
  grant: PlaytestGrantView | null;
  launchedAt: string | null;
  lastHeartbeatAt: string | null;
  acknowledgedSequence: number;
  boundToMobile: boolean;
  launchSession: boolean;
  openHandoffExpiresAt: string | null;
  recovery: PlaytestRecoveryView;
  completion: unknown;
};

/** 201 of `POST /api/playtests/{id}/handoffs`. The QR encodes only `deepLink`; `code` is 43 base64url chars, 5 minutes, single use. */
export type PlaytestHandoff = { handoffId: string; playtestId: string; code: string; deepLink: string; expiresAt: string };
