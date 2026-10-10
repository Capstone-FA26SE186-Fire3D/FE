import type { UserRole } from "./types";

const roleByApiName: Record<string, UserRole> = { PlatformAdmin: 0, OrganizationUser: 1, Trainee: 2 };

/** The API returns role names ("OrganizationUser"); mocks and older code use numbers. Accepts both. */
export function normalizeRole(value: unknown): UserRole {
  if (value === 0 || value === 1 || value === 2) return value;
  if (typeof value === "string" && value in roleByApiName) return roleByApiName[value];
  throw new Error("Máy chủ trả về vai trò tài khoản không hợp lệ.");
}

const apiNameByRole = ["PlatformAdmin", "OrganizationUser", "Trainee"] as const;

/** Request bodies must use the role name: the API rejects numeric enum values. */
export function roleToApiName(role: UserRole): (typeof apiNameByRole)[number] {
  return apiNameByRole[role];
}
