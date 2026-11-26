import { apiClient } from "@/api/client";
import { ApiError } from "@/api/types/common";
import { normalizeRole } from "./roles";
import type { ForgotPasswordAccepted, GoogleExchangeResponse, GoogleLinkInput, GoogleLinkResult, GoogleLoginResult, GoogleOnboardingInput, SetLocalPasswordInput } from "./types";
import type { FirstLoginChallenge } from "./types";
import type { AuthUser, AvatarResponse, AvatarUploadIntent, RegisterInput, RegistrationOtpVerification, TokenResponse, UpdateProfileInput } from "./types";

type ApiUserRole = AuthUser["role"] | "PlatformAdmin" | "OrganizationUser" | "Trainee" | "FireSafetyExpert";
type ApiUserGender = AuthUser["gender"] | "Male" | "Female" | "Other" | "PreferNotToSay";
type ApiAuthUser = Omit<AuthUser, "role" | "gender"> & { role: ApiUserRole; gender?: ApiUserGender };
type ApiTokenResponse = Omit<TokenResponse, "user"> & { user: ApiAuthUser };

type FirebaseLoginResponse = GoogleExchangeResponse<ApiTokenResponse>;

const genderByApiName = {
  Male: 0,
  Female: 1,
  Other: 2,
  PreferNotToSay: 3,
} as const;

function normalizeUser(user: ApiAuthUser): AuthUser {
  const role = normalizeRole(user.role);
  const gender = typeof user.gender === "string" ? genderByApiName[user.gender] : user.gender;
  if (gender !== undefined && gender !== null && gender !== 0 && gender !== 1 && gender !== 2 && gender !== 3) throw new Error("Máy chủ trả về giới tính không hợp lệ.");
  return { ...user, role, gender };
}

function normalizeTokenResponse(response: ApiTokenResponse): TokenResponse {
  if (typeof response?.accessToken !== "string" || !response.accessToken.trim() || typeof response.refreshToken !== "string" || !response.refreshToken.trim() || !response.user) throw new Error("Máy chủ chưa trả phiên đăng nhập hợp lệ.");
  return { ...response, user: normalizeUser(response.user) };
}

/** The challenge of a first sign-in that still has to verify the email (BE#235), read from a login refusal or a resend. */
export function firstLoginChallengeOf(body: unknown): FirstLoginChallenge | null {
  if (typeof body !== "object" || body === null) return null;
  const value = body as Record<string, unknown>;
  if (typeof value.challengeToken !== "string" || !value.challengeToken.trim()) return null;
  const seconds = Number(value.resendAfterSeconds);
  return {
    challengeToken: value.challengeToken,
    challengeExpiresAt: typeof value.challengeExpiresAt === "string" ? value.challengeExpiresAt : "",
    codeExpiresAt: typeof value.codeExpiresAt === "string" ? value.codeExpiresAt : "",
    emailHint: typeof value.emailHint === "string" ? value.emailHint : "",
    resendAfterSeconds: Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : 0,
  };
}

function bearer(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

async function putAvatarObject(uploadUrl: string, file: File): Promise<void> {
  const response = await fetch(uploadUrl, {
    body: file,
    headers: { "Content-Type": file.type },
    method: "PUT",
  });

  if (!response.ok) {
    throw new Error("Không thể tải ảnh lên kho lưu trữ. Vui lòng thử lại.");
  }
}

export const authApi = {
  async login(email: string, password: string) {
    return normalizeTokenResponse(await apiClient.request<ApiTokenResponse>("/api/auth/login", { json: { email, password } }));
  },
  async loginFirebase(firebaseIdToken: string): Promise<GoogleLoginResult> {
    try {
      return googleResult(await apiClient.request<FirebaseLoginResponse>("/api/auth/login-firebase", { json: firebaseIdToken }));
    } catch (error) {
      if (error instanceof ApiError && error.payload?.code === "ACCOUNT_LINK_REQUIRED") return { status: "AccountLinkRequired" };
      throw error;
    }
  },
  /** BE#235: the 6-digit code sent to the account email finishes the first sign-in; the session is in "ChangePassword". */
  async verifyFirstLogin(challengeToken: string, code: string) {
    return normalizeTokenResponse(await apiClient.request<ApiTokenResponse>("/api/auth/first-login/verify", { json: { challengeToken, code } }));
  },
  /** BE#235: a Google identity of the account email instead of the code (the password was checked by the login before). */
  async verifyFirstLoginWithGoogle(challengeToken: string, idToken: string) {
    return normalizeTokenResponse(await apiClient.request<ApiTokenResponse>("/api/auth/first-login/google", { json: { challengeToken, idToken } }));
  },
  /** BE#235: a new code (one a minute, five an hour: 429 OTP_RATE_LIMITED + Retry-After). The challenge token stays the same. */
  async resendFirstLoginCode(challengeToken: string): Promise<FirstLoginChallenge> {
    const challenge = firstLoginChallengeOf(await apiClient.request<unknown>("/api/auth/first-login/resend", { json: { challengeToken } }));
    if (!challenge) throw new Error("Máy chủ chưa xác nhận đã gửi mã. Hãy thử lại.");
    return challenge;
  },
  /** Explicit link of a verified Google identity to the signed-in local account. A first link revokes every session (`requiresLogin`). */
  async linkGoogle(accessToken: string, input: GoogleLinkInput): Promise<GoogleLinkResult> {
    const response = await apiClient.requestWithMeta<{ user: ApiAuthUser; alreadyLinked: boolean; requiresLogin: boolean }>("/api/me/link-google", { headers: bearer(accessToken), json: { idToken: input.idToken, currentPassword: input.currentPassword } });
    const body = response.data;
    if (!body || typeof body.alreadyLinked !== "boolean" || typeof body.requiresLogin !== "boolean" || !body.user) throw new Error("Máy chủ trả kết quả liên kết Google không hợp lệ. Hãy tải lại hồ sơ để kiểm tra.");
    return { user: normalizeUser(body.user), alreadyLinked: body.alreadyLinked, requiresLogin: body.requiresLogin, etag: response.headers.get("etag") };
  },
  /** First local password of a Google-only account. 204 revokes every session. */
  setLocalPassword(accessToken: string, input: SetLocalPasswordInput) {
    return apiClient.request<void>("/api/me/password", { headers: bearer(accessToken), json: { idToken: input.idToken, newPassword: input.newPassword } });
  },
  async completeGoogleOnboarding(input: GoogleOnboardingInput) {
    const result = googleResult(await apiClient.request<FirebaseLoginResponse>("/api/auth/google/onboarding/complete", { json: input }));
    if (result.status !== "Authenticated") throw new Error("Máy chủ chưa hoàn tất tài khoản. Hãy thử lại Google.");
    return result.authentication;
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
  async me(accessToken: string, signal?: AbortSignal) {
    return normalizeUser(await apiClient.request<ApiAuthUser>("/api/auth/me", { headers: bearer(accessToken), signal }));
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
  async uploadAvatar(accessToken: string, etag: string, file: File) {
    const intent = await apiClient.request<AvatarUploadIntent>("/api/me/avatar/upload-intent", {
      headers: bearer(accessToken),
      json: { contentType: file.type, contentLength: file.size },
    });
    await putAvatarObject(intent.uploadUrl, file);
    return apiClient.requestWithMeta<AvatarResponse>("/api/me/avatar/complete", {
      headers: { ...bearer(accessToken), "If-Match": etag },
      json: { uploadId: intent.uploadId },
    });
  },
  deleteAvatar(accessToken: string, etag: string) {
    return apiClient.requestWithMeta<void>("/api/me/avatar", {
      headers: { ...bearer(accessToken), "If-Match": etag },
      method: "DELETE",
    });
  },
  forgotPassword(email: string) {
    return apiClient.request<ForgotPasswordAccepted | undefined>("/api/auth/forgot-password", { method: "POST", json: { email } });
  },
  resetPassword(token: string, newPassword: string) {
    return apiClient.request<void>("/api/auth/reset-password", { method: "POST", json: { token, newPassword } });
  },
};

function googleResult(response: FirebaseLoginResponse): GoogleLoginResult {
  if (response.status === "Authenticated" && response.authentication) return { status: "Authenticated", authentication: normalizeTokenResponse(response.authentication) };
  if (response.status === "ACCOUNT_LINK_REQUIRED") return { status: "AccountLinkRequired" };
  if (response.status === "OnboardingRequired") {
    const proof = response.onboarding;
    const valid = proof && typeof proof.token === "string" && !!proof.token.trim() && typeof proof.email === "string" && !!proof.email.trim() && (proof.displayName === null || typeof proof.displayName === "string") && typeof proof.expiresAt === "string" && Number.isFinite(Date.parse(proof.expiresAt));
    return { status: "OnboardingRequired", onboarding: valid ? proof : null };
  }
  throw new Error("Máy chủ trả trạng thái Google không hợp lệ. Hãy thử lại.");
}
