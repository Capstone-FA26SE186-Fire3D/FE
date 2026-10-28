import { apiClient } from "@/api/client";
import type { ParticipationVerified, QrResolution, QrTraining } from "./types";

export type { ParticipationVerified, QrResolution, QrServiceStatus, QrTraining } from "./types";

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
