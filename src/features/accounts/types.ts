import type { PageResponse } from "@/api/types/common";
import type { UserRole } from "@/features/auth/types";

/**
 * BE `ManagedAccountResponse` (`GET /api/accounts`, `GET /api/accounts/{id}`, `PATCH /api/accounts/{id}/status`).
 * `role` arrives as a name ("OrganizationUser") and is normalized to the numeric `UserRole` by the API layer.
 * `avatarUrl` is always null in the list; the detail gives a 5-minute signed URL (null without an avatar or when inactive).
 * `profileRevision` is the detail ETag revision (same value as `/api/auth/me` of that user).
 */
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
  /** Present when the account set one (Trainee username, or a later profile update). */
  username?: string | null;
  phoneNumber?: string | null;
  avatarUrl?: string | null;
  profileRevision?: number;
};

/** BE `OrganizationResponse` as listed for filters/pickers (`GET /api/organizations`); only id/name are used here. */
export type Organization = {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  address?: string | null;
  phoneNumber?: string | null;
  profileRevision?: number;
  buildingCount?: number;
  accountCount?: number;
};

export type { PageResponse };

/** Body of `POST /api/accounts` (BE `CreateAccountRequest`). `role` is sent as the API name; role and organization never change later. */
export type CreateAccountInput = {
  email: string;
  password: string;
  fullName: string | null;
  role: UserRole;
  organizationId: string | null;
  username?: string | null;
};

/** BE `AccountResponse` returned by `POST /api/accounts` (201), with `role` normalized. */
export type CreatedAccount = {
  id: string;
  email: string;
  fullName: string | null;
  role: UserRole;
  organizationId: string | null;
  username: string | null;
  dob: string | null;
  gender: string | null;
  phoneNumber: string | null;
  avatarUrl: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  emailVerifiedAt: string | null;
  registrationExpiresAt: string | null;
  profileRevision: number;
  hasLocalLogin: boolean;
  googleLinked: boolean;
};
