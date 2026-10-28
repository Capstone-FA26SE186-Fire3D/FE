/*
 * Building QR landing contract (BE TrainingSessionsController `GET /api/qr/{qrToken}` + `/trainings`,
 * BuildingAccessController `POST /api/buildings/{id}/participation/verify`). Enum-like values stay `string`: the screen
 * maps known values to labels and shows an unknown one as received.
 */

/** `ServiceStatus` of the QR Building: Active (paid period running), Expired (paid before, none now) or NotPurchased. */
export type QrServiceStatus = "Active" | "Expired" | "NotPurchased";

/**
 * `GET /api/qr/{qrToken}` (BE `BuildingQrResolution`): identifies a Building only. `hasAccess` is the caller's access right
 * now, not a QR property. An Expired service still resolves; `canStartNewSessions` is true only with Active service and access.
 */
export type QrResolution = {
  buildingId: string;
  buildingName: string;
  /** Public | Private. */
  visibility: string;
  hasAccess: boolean;
  /** Absent on older servers: treat as unknown, never as Active. */
  serviceStatus?: QrServiceStatus | string;
  serviceEndsAt?: string | null;
  canStartNewSessions?: boolean;
};

/** One Training of the QR Building (`GET /api/qr/{qrToken}/trainings`, BE `TrainingDto`). Trainee sees only Active + Published, in schedule. */
export type QrTraining = {
  id: string;
  releaseId: string;
  name: string;
  description: string | null;
  /** TrainingStatus: Draft | Active | Closed | Archived. */
  status: string;
  startDate: string | null;
  endDate: string | null;
  /** Learn | Guided | Assessment. */
  allowedModes: string[];
  createdAt: string;
  releaseStatus?: string | null;
  scenarioVersionId?: string | null;
  reviewStatus?: string;
};

/** `POST /api/buildings/{id}/participation/verify` (Trainee only, BE `BuildingAccessResponse`). `code` is only sent to managers on rotate. */
export type ParticipationVerified = { buildingId: string; visibility: string; accessRevision: number; hasParticipationCode: boolean; code?: string | null };
