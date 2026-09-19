import { apiClient } from "@/api";
import type { AuthUser, LoginInput, LoginResponse, TokenResponse } from "./types";

const bearer = (accessToken: string) => ({ Authorization: `Bearer ${accessToken}` });

export const authApi = {
  login: (input: LoginInput) => apiClient.request<LoginResponse>("/api/auth/login", { json: input }),
  refresh: (refreshToken: string) => apiClient.request<TokenResponse>("/api/auth/refresh", { json: { refreshToken } }),
  logout: (accessToken: string) => apiClient.request<void>("/api/auth/logout", { method: "POST", headers: bearer(accessToken) }),
  me: (accessToken: string) => apiClient.request<AuthUser>("/api/auth/me", { headers: bearer(accessToken) }),
  forgotPassword: (email: string) => apiClient.request<void>("/api/auth/forgot-password", { method: "POST", json: { email } }),
  resetPassword: (token: string, newPassword: string) => apiClient.request<void>("/api/auth/reset-password", { method: "POST", json: { token, newPassword } }),
};
