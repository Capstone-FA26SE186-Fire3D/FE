import type { PageResponse } from "@/api/types/common";

export type { PageResponse };

export type Organization = {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type OrganizationProfile = Organization & {
  address: string | null;
  phoneNumber: string | null;
  profileRevision: number;
};

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
