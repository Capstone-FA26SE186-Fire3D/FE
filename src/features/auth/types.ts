export type UserRole = 0 | 1 | 2;
export type UserGender = 0 | 1 | 2;

export type AuthUser = {
  id: string;
  email: string;
  fullName: string | null;
  username?: string | null;
  dob?: string | null;
  gender?: UserGender | null;
  phoneNumber?: string | null;
  avatarUrl?: string | null;
  profileRevision?: number;
  role: UserRole;
  organizationId: string | null;
};

export type UpdateProfileInput = {
  fullName: string;
  username?: string;
  dob: string | null;
  gender: UserGender | null;
  phoneNumber: string | null;
};

export type AvatarResponse = {
  url: string;
  expiresAt: string;
  profileRevision: number;
};

export type TokenResponse = {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt?: string;
  refreshTokenExpiresAt?: string;
  user: AuthUser;
};

// Deployed Google contract: BE PR #44.
// Proof is never a Fire3D session.
export type GoogleOnboardingProof = { token: string; expiresAt: string; email: string; displayName: string | null };
export type GoogleLoginResult =
  | { status: "Authenticated"; authentication: TokenResponse }
  | { status: "OnboardingRequired"; onboarding: GoogleOnboardingProof | null }
  | { status: "AccountLinkRequired" };
export type GoogleOnboardingInput = { onboardingToken: string } & (
  | { accountType: "trainee"; username: string }
  | { accountType: "organization"; organizationName: string; organizationAddress: string; organizationPhoneNumber: string }
);

type RegisterBaseInput = {
  email: string;
  password: string;
  confirmPassword: string;
  fullName?: string;
  registrationToken: string;
};

export type RegistrationOtpVerification = {
  registrationToken: string;
  expiresAt: string;
};

export type RegisterInput =
  | (RegisterBaseInput & {
      accountType: "trainee";
      username: string;
    })
  | (RegisterBaseInput & {
      accountType: "organization";
      organizationName: string;
      organizationAddress: string;
      organizationPhoneNumber: string;
    });
