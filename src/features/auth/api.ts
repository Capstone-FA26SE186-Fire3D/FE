import { apiClient } from "@/api/client";
import type { AuthUser, RegisterInput, TokenResponse } from "./types";

function bearer(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

export const authApi = {
  login(email: string, password: string) {
    return apiClient.request<TokenResponse>("/api/auth/login", { json: { email, password } });
  },
  loginFirebase(firebaseIdToken: string) {
    return apiClient.request<TokenResponse>("/api/auth/login-firebase", { json: firebaseIdToken });
  },
  register(input: RegisterInput) {
    if (input.accountType === "organization") {
      return apiClient.request<AuthUser>("/api/auth/register/organization", {
        json: {
          email: input.email,
          password: input.password,
          confirmPassword: input.confirmPassword,
          fullName: input.fullName,
          organizationName: input.organizationName,
          organizationAddress: input.organizationAddress,
          organizationPhoneNumber: input.organizationPhoneNumber,
        },
      });
    }

    return apiClient.request<AuthUser>("/api/auth/register/trainee", {
      json: {
        email: input.email,
        password: input.password,
        confirmPassword: input.confirmPassword,
        fullName: input.fullName,
        username: input.username,
      },
    });
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
  forgotPassword(email: string) {
    return apiClient.request<void>("/api/auth/forgot-password", { method: "POST", json: { email } });
  },
  resetPassword(token: string, newPassword: string) {
    return apiClient.request<void>("/api/auth/reset-password", { method: "POST", json: { token, newPassword } });
  },
};
