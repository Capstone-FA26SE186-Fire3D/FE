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

/** `GET /api/organizations/{id}` (PlatformAdmin): profile fields plus counts, all optional on older deployments. */
export type OrganizationDetail = Organization & {
  address?: string | null;
  phoneNumber?: string | null;
  profileRevision?: number;
  buildingCount?: number;
  accountCount?: number;
};

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

export type OrganizationFilters = {
  search?: string;
  isActive?: boolean;
  page?: number;
  pageSize?: number;
};
