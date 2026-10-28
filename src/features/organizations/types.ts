import type { PageResponse } from "@/api/types/common";

export type { PageResponse };

export type Organization = {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  /** Active buildings / non-deleted accounts (BE `OrganizationResponse`, also in the list). Optional on older deployments. */
  buildingCount?: number;
  accountCount?: number;
};

export type OrganizationProfile = Organization & {
  address: string | null;
  phoneNumber: string | null;
  profileRevision: number;
};

/**
 * BE `OrganizationResponse` (PlatformAdmin `GET/POST /api/organizations`, `GET/PATCH /api/organizations/{id}`, `PATCH .../status`).
 * The API always serializes the profile fields and counts (defaults `profileRevision=1`, counts 0); `buildingCount` counts active
 * Buildings. `profileRevision` is the ETag revision shared with `/api/organizations/me`.
 */
export type AdminOrganization = Organization & {
  address: string | null;
  phoneNumber: string | null;
  profileRevision: number;
  buildingCount: number;
  accountCount: number;
};

/** Detail view of one organization (same shape as the list row). */
export type OrganizationDetail = AdminOrganization;

/** Admin PATCH: omitted fields keep their value; null or empty is rejected by the API, so only send what changed. */
export type AdminUpdateOrganizationInput = { name?: string; address?: string; phoneNumber?: string };

export type UpdateOrganizationProfileInput = {
  name: string;
  address: string | null;
  phoneNumber: string | null;
};

export type CreateOrganizationInput = {
  name: string;
  slug: string;
};

/** BE `OrganizationFilter`. `sort`: createdAt | updatedAt | name, '-' prefix for descending (default -createdAt); other values are 400. */
export type OrganizationFilters = {
  search?: string;
  isActive?: boolean;
  page?: number;
  pageSize?: number;
  sort?: string;
};
