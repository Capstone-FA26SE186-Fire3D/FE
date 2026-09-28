import type { UserRole } from "@/features/auth/types";

type OrganizationIfcAccessInput = {
  ready: boolean;
  user: { role: UserRole } | null;
};

export function resolveOrganizationIfcAccess({ ready, user }: OrganizationIfcAccessInput) {
  if (!ready) return "loading" as const;
  if (!user) return "sign-in" as const;
  return user.role === 2 ? "denied" as const : "granted" as const;
}
