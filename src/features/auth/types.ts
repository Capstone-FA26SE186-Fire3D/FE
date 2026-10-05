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
