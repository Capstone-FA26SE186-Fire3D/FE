import type { PageResponse } from "@/api/types/common";
import type { UserRole } from "@/features/auth/types";

export type ManagedAccount = {
  id: string;
  email: string;
  fullName: string | null;
  role: UserRole;
  organizationId: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Organization = {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type { PageResponse };

export type CreateAccountInput = {
  email: string;
  password: string;
  fullName: string;
  role: UserRole;
  organizationId: string | null;
};
