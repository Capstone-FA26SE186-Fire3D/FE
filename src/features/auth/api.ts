import { apiClient } from "@/api/client";
import type { AuthUser, AvatarResponse, RegisterInput, RegistrationOtpVerification, TokenResponse, UpdateProfileInput } from "./types";

type FirebaseLoginResponse = {
  status: "Authenticated" | "OnboardingRequired";
  authentication: TokenResponse | null;
};

function bearer(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

export const authApi = {
  login(email: string, password: string) {
    return apiClient.request<TokenResponse>("/api/auth/login", { json: { email, password } });
  },
  async loginFirebase(firebaseIdToken: string) {
    const response = await apiClient.request<FirebaseLoginResponse>("/api/auth/login-firebase", { json: firebaseIdToken });
    if (response.status === "Authenticated" && response.authentication) return response.authentication;
    throw new Error(response.status);
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
          registrationToken: input.registrationToken,
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
        registrationToken: input.registrationToken,
      },
    });
  },
  requestRegistrationOtp(email: string) {
    return apiClient.request<void>("/api/auth/registration/request-otp", { json: { email } });
  },
  verifyRegistrationOtp(email: string, otp: string) {
    return apiClient.request<RegistrationOtpVerification>("/api/auth/registration/verify-otp", { json: { email, otp } });
  },
  resendVerification(email: string) {
    return apiClient.request<void>("/api/auth/resend-verification", { json: { email } });
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
  meWithMeta(accessToken: string) {
    return apiClient.requestWithMeta<AuthUser>("/api/auth/me", { headers: bearer(accessToken) });
  },
  updateProfile(accessToken: string, etag: string, input: UpdateProfileInput) {
    return apiClient.requestWithMeta<AuthUser>("/api/auth/me", {
      headers: { ...bearer(accessToken), "If-Match": etag },
      json: input,
      method: "PATCH",
    });
  },
  changePassword(accessToken: string, currentPassword: string, newPassword: string) {
    return apiClient.request<void>("/api/auth/change-password", {
      headers: bearer(accessToken),
      json: { currentPassword, newPassword },
    });
  },
  uploadAvatar(accessToken: string, etag: string, file: File) {
    const form = new FormData();
    form.append("file", file);
    return apiClient.requestWithMeta<AvatarResponse>("/api/me/avatar/upload", {
      body: form,
      headers: { ...bearer(accessToken), "If-Match": etag },
      method: "POST",
    });
  },
  deleteAvatar(accessToken: string, etag: string) {
    return apiClient.requestWithMeta<void>("/api/me/avatar", {
      headers: { ...bearer(accessToken), "If-Match": etag },
      method: "DELETE",
    });
  },
  forgotPassword(email: string) {
    return apiClient.request<void>("/api/auth/forgot-password", { method: "POST", json: { email } });
  },
  resetPassword(token: string, newPassword: string) {
    return apiClient.request<void>("/api/auth/reset-password", { method: "POST", json: { token, newPassword } });
  },
};
