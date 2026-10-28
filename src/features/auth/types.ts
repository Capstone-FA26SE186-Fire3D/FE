export type UserRole = 0 | 1 | 2;
export type UserGender = 0 | 1 | 2 | 3;

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
  /** Reported by GET /api/auth/me. Absent on older responses; treat as unknown, never as false. */
  hasLocalLogin?: boolean;
  googleLinked?: boolean;
  role: UserRole;
  organizationId: string | null;
  /** Remaining `AccountResponse` fields (BE AuthContracts.cs). Not read by the web today; optional so older mocks still type-check. */
  isActive?: boolean;
  lastLoginAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  emailVerifiedAt?: string | null;
  registrationExpiresAt?: string | null;
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

export type AvatarUploadIntent = {
  uploadId: string;
  uploadUrl: string;
  expiresAt: string;
};

/**
 * BE `LoginResponse` / `TokenResponse` (login, refresh, Google). The BE sends only accessToken, refreshToken and user; the
 * two `*ExpiresAt` fields are not part of the contract (the access token expiry is read from the JWT `exp`, see token-expiry.ts).
 */
export type TokenResponse = {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt?: string;
  refreshTokenExpiresAt?: string;
  user: AuthUser;
};

/** `POST /api/auth/forgot-password` answers 202 with this body (the same message whether or not the account exists). */
export type ForgotPasswordAccepted = { message?: string };

// Deployed Google contract: BE PR #44.
// Proof is never a Fire3D session.
export type GoogleOnboardingProof = { token: string; expiresAt: string; email: string; displayName: string | null };
/**
 * Raw body of `POST /api/auth/login-firebase` and `POST /api/auth/google/onboarding/complete` (BE `GoogleExchangeResponse`).
 * `TAuth` is the token body before role/gender normalization. `onboardingToken`/`expiresAt` duplicate `onboarding` for older clients.
 */
export type GoogleExchangeResponse<TAuth = TokenResponse> = {
  status: "Authenticated" | "OnboardingRequired" | "ACCOUNT_LINK_REQUIRED";
  authentication: TAuth | null;
  onboarding?: GoogleOnboardingProof | null;
  onboardingToken?: string | null;
  expiresAt?: string | null;
};
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

// POST /api/me/link-google and POST /api/me/password. The Firebase idToken and passwords are request-only values.
export type GoogleLinkInput = { idToken: string; currentPassword: string };
export type GoogleLinkResult = { user: AuthUser; alreadyLinked: boolean; requiresLogin: boolean; etag: string | null };
export type SetLocalPasswordInput = { idToken: string; newPassword: string };
