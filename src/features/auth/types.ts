export type UserRole = 0 | 1 | 2;

export type AuthUser = {
  id: string;
  email: string;
  fullName: string | null;
  role: UserRole;
  organizationId: string | null;
};

export type TokenResponse = {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
  user: AuthUser;
};

export type RegisterInput = {
  email: string;
  password: string;
  fullName: string;
};
