import { apiClient } from "@/api/client";

/** `GET /api/qr/{qrToken}`: identifies a Building only. `hasAccess` is the caller's access right now, not a QR property. */
export type QrResolution = { buildingId: string; buildingName: string; visibility: string; hasAccess: boolean };

/** One Training of the QR Building (`GET /api/qr/{qrToken}/trainings`). Trainee sees only Active + Published, in schedule. */
export type QrTraining = {
  id: string;
  releaseId: string;
  name: string;
  description: string | null;
  status: string;
  startDate: string | null;
  endDate: string | null;
  allowedModes: string[];
  createdAt: string;
  releaseStatus?: string | null;
  scenarioVersionId?: string | null;
  reviewStatus?: string;
};

/** `POST /api/buildings/{id}/participation/verify` (Trainee only). */
export type ParticipationVerified = { buildingId: string; visibility: string; accessRevision: number; hasParticipationCode: boolean };

function headers(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

/**
 * The QR token goes in the path only (BE contract), never in a query string, header or error message. Callers must
 * have checked `isQrToken` first, so no encoding surprises reach the URL.
 */
export const qrLandingApi = {
  resolve(accessToken: string, qrToken: string, signal?: AbortSignal) {
    return apiClient.request<QrResolution>(`/api/qr/${qrToken}`, { headers: headers(accessToken), signal });
  },
  trainings(accessToken: string, qrToken: string, signal?: AbortSignal) {
    return apiClient.request<QrTraining[]>(`/api/qr/${qrToken}/trainings`, { headers: headers(accessToken), signal });
  },
  /** The code is sent once and never stored by the caller. 400 PARTICIPATION_CODE_INVALID when wrong or rotated. */
  verifyParticipation(accessToken: string, buildingId: string, code: string) {
    return apiClient.request<ParticipationVerified>(`/api/buildings/${buildingId}/participation/verify`, { headers: headers(accessToken), json: { code } });
  },
};
