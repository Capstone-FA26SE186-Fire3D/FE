import { apiClient } from "@/api/client";
import type { AuthUser, RegisterInput, TokenResponse } from "./types";

function bearer(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

export const authApi = {
  loginFirebase(firebaseIdToken: string) {
    return apiClient.request<TokenResponse>("/api/auth/login-firebase", { json: firebaseIdToken });
  },
  register(input: RegisterInput) {
    return apiClient.request<AuthUser>("/api/auth/register", { json: input });
  },
  refresh(refreshToken: string) {
    return apiClient.request<TokenResponse>("/api/auth/refresh", { json: { refreshToken } });
  },
  logout(accessToken: string) {
    return apiClient.request<void>("/api/auth/logout", { headers: bearer(accessToken), method: "POST" });
  },
  me(accessToken: string) {
    return apiClient.request<AuthUser>("/api/auth/me", { headers: bearer(accessToken) });
  },
};
