import { apiClient } from "@/api/client";

/** A code of the Building's QR history. The token is NOT part of it: BE stores only its SHA-256. */
export type BuildingQrCode = {
  id: string;
  buildingId: string;
  label: string | null;
  /** "Active" | "Revoked" (open string: BE types it as string). */
  status: string;
  createdAt?: string | null;
  revokedAt?: string | null;
  /** Set on a rotated-away code: the Active code that replaced it. */
  replacedBy?: string | null;
  /** Set on the code created by a rotate: the code it replaced. */
  replacedId?: string | null;
};

export type BuildingQrPage = { items: BuildingQrCode[]; total: number; page: number; pageSize: number };

/** Create and rotate return the token exactly once; it is not retrievable afterwards. */
export type BuildingQrIssued = { code: BuildingQrCode; token: string; /** Full QR content (deep link) when the BE builds it. */ content?: string | null };

function headers(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

/**
 * Building QR management (OrganizationUser of the tenant, or PlatformAdmin). The OpenAPI declares no Idempotency-Key
 * or If-Match for these routes: a second create returns 409 QR_ALREADY_EXISTS and a second rotate/revoke of the same
 * code returns 409 QR_ALREADY_REVOKED, so a repeated request can never add a code.
 */
export const buildingQrApi = {
  list(accessToken: string, buildingId: string, page = 1, pageSize = 100, signal?: AbortSignal) {
    return apiClient.request<BuildingQrPage>(`/api/buildings/${buildingId}/qr-codes`, { headers: headers(accessToken), query: { page, pageSize }, signal });
  },
  create(accessToken: string, buildingId: string, label: string | null) {
    return apiClient.request<BuildingQrIssued>(`/api/buildings/${buildingId}/qr-codes`, { headers: headers(accessToken), json: { label } });
  },
  /** An empty label keeps the old one (BE `COALESCE(NULLIF(btrim(label),''), old.label)`). */
  rotate(accessToken: string, buildingId: string, qrId: string, label: string | null) {
    return apiClient.request<BuildingQrIssued>(`/api/buildings/${buildingId}/qr-codes/${qrId}/rotate`, { headers: headers(accessToken), json: { label }, method: "POST" });
  },
  revoke(accessToken: string, buildingId: string, qrId: string) {
    return apiClient.request<BuildingQrCode>(`/api/buildings/${buildingId}/qr-codes/${qrId}/revoke`, { headers: headers(accessToken), method: "POST" });
  },
};
