export type PageResponse<T> = {
  items: T[];
  totalCount: number;
  page: number;
  pageSize: number;
};

export type Organization = {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
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
