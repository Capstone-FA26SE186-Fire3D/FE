export type AuthUser = {
  id: string;
  email: string;
  fullName: string | null;
  role: number;
  organizationId: string | null;
};

export type LoginInput = {
  email: string;
  password: string;
};

export type TokenSet = {
  accessToken: string;
  refreshToken: string;
};

export type LoginResponse = TokenSet & {
  user: AuthUser;
};

export type TokenResponse = LoginResponse & {
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
};
