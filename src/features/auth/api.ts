import { apiClient } from "@/api/client";
import type { AuthUser, AvatarResponse, RegisterInput, RegistrationOtpVerification, TokenResponse, UpdateProfileInput } from "./types";

type ApiUserRole = AuthUser["role"] | "PlatformAdmin" | "OrganizationUser" | "Trainee";
type ApiAuthUser = Omit<AuthUser, "role"> & { role: ApiUserRole };
type ApiTokenResponse = Omit<TokenResponse, "user"> & { user: ApiAuthUser };

type FirebaseLoginResponse = {
  status: "Authenticated" | "OnboardingRequired";
  authentication: ApiTokenResponse | null;
};

const roleByApiName = {
  OrganizationUser: 1,
  PlatformAdmin: 0,
  Trainee: 2,
} as const;

function normalizeUser(user: ApiAuthUser): AuthUser {
  const role = typeof user.role === "number" ? user.role : roleByApiName[user.role];
  if (role === undefined) throw new Error("Máy chủ trả về vai trò tài khoản không hợp lệ.");
  return { ...user, role };
}

function normalizeTokenResponse(response: ApiTokenResponse): TokenResponse {
  return { ...response, user: normalizeUser(response.user) };
}

function bearer(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

export const authApi = {
  async login(email: string, password: string) {
    return normalizeTokenResponse(await apiClient.request<ApiTokenResponse>("/api/auth/login", { json: { email, password } }));
  },
  async loginFirebase(firebaseIdToken: string) {
    const response = await apiClient.request<FirebaseLoginResponse>("/api/auth/login-firebase", { json: firebaseIdToken });
    if (response.status === "Authenticated" && response.authentication) return normalizeTokenResponse(response.authentication);
    throw new Error(response.status);
  },
  register(input: RegisterInput) {
    if (input.accountType === "organization") {
      return apiClient.request<ApiAuthUser>("/api/auth/register/organization", {
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
      }).then(normalizeUser);
    }

    return apiClient.request<ApiAuthUser>("/api/auth/register/trainee", {
      json: {
        email: input.email,
        password: input.password,
        confirmPassword: input.confirmPassword,
        fullName: input.fullName,
        username: input.username,
        registrationToken: input.registrationToken,
      },
    }).then(normalizeUser);
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
  async refresh(refreshToken: string) {
    return normalizeTokenResponse(await apiClient.request<ApiTokenResponse>("/api/auth/refresh", { json: { refreshToken } }));
  },
  logout(accessToken: string) {
    return apiClient.request<void>("/api/auth/logout", { headers: bearer(accessToken), method: "POST" });
  },
  async me(accessToken: string) {
    return normalizeUser(await apiClient.request<ApiAuthUser>("/api/auth/me", { headers: bearer(accessToken) }));
  },
  async meWithMeta(accessToken: string) {
    const response = await apiClient.requestWithMeta<ApiAuthUser>("/api/auth/me", { headers: bearer(accessToken) });
    return { ...response, data: normalizeUser(response.data) };
  },
  async updateProfile(accessToken: string, etag: string, input: UpdateProfileInput) {
    const response = await apiClient.requestWithMeta<ApiAuthUser>("/api/auth/me", {
      headers: { ...bearer(accessToken), "If-Match": etag },
      json: input,
      method: "PATCH",
    });
    return { ...response, data: normalizeUser(response.data) };
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
