"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { resetCommandKeys } from "@/api/command-keys";
import { ApiError } from "@/api/types/common";
import { routes } from "@/configs/routes";
import { clearPendingCheckout } from "@/features/billing/pending-payment";
import { useDemoSession } from "@/store/demo-session";
import { authApi } from "./api";
import { signInWithGoogle } from "./firebase";
import type { AuthUser, RegisterInput, TokenResponse, GoogleLoginResult, GoogleOnboardingInput } from "./types";

type StoredTokens = Pick<TokenResponse, "accessToken" | "refreshToken">;

type AuthSessionContextValue = {
  accessToken: string | null;
  isAuthenticated: boolean;
  pending: boolean;
  ready: boolean;
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<AuthUser>;
  loginWithGoogle: () => Promise<GoogleLoginResult>;
  completeGoogleOnboarding: (input: GoogleOnboardingInput) => Promise<AuthUser>;
  logout: () => Promise<void>;
  /** Drops the local session without navigating or calling the API (e.g. after a 401 on a public landing page). */
  endSession: () => void;
  register: (input: RegisterInput) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  resetPassword: (token: string, newPassword: string) => Promise<void>;
  updateUser: (user: AuthUser) => void;
};

const storageKey = "fire3d-auth-tokens";
const AuthSessionContext = createContext<AuthSessionContextValue | null>(null);

function readTokens(): StoredTokens | null {
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return null;
    const tokens = value as Record<string, unknown>;
    return typeof tokens.accessToken === "string" && typeof tokens.refreshToken === "string"
      ? { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken }
      : null;
  } catch {
    return null;
  }
}

function persistTokens(tokens: StoredTokens | null) {
  try {
    if (tokens) window.sessionStorage.setItem(storageKey, JSON.stringify(tokens));
    else window.sessionStorage.removeItem(storageKey);
  } catch {
    // The session continues in memory when browser storage is unavailable.
  }
}

/**
 * Browser storage that points at one tenant's business objects (the retry keys of unfinished commands, the checkout the
 * user left for PayOS). It must not survive a logout or an account switch: the next account in this tab would otherwise
 * replay the previous account's keys or be sent to its quotation.
 */
function forgetAccountBoundData() {
  resetCommandKeys();
  clearPendingCheckout();
}

function toMessage(error: unknown) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Không thể hoàn tất xác thực. Vui lòng thử lại.";
}

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { reset: resetDemo, resumePendingAction } = useDemoSession();
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [pending, setPending] = useState(false);
  const [ready, setReady] = useState(false);
  // The account this tab last held: a different account signing in (even without a logout in between) starts clean.
  const lastUserId = useRef<string | null>(null);

  const saveSession = useCallback((response: TokenResponse, explicitLogin = false) => {
    if (explicitLogin && lastUserId.current && lastUserId.current !== response.user.id) forgetAccountBoundData();
    lastUserId.current = response.user.id;
    setAccessToken(response.accessToken);
    setUser(response.user);
    persistTokens({ accessToken: response.accessToken, refreshToken: response.refreshToken });
    resumePendingAction();
  }, [resumePendingAction]);

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    persistTokens(null);
  }, []);

  useEffect(() => {
    let active = true;
    const restore = async () => {
      const tokens = readTokens();
      if (!tokens) {
        if (active) setReady(true);
        return;
      }
      try {
        const currentUser = await authApi.me(tokens.accessToken);
        if (!active) return;
        lastUserId.current = currentUser.id;
        setAccessToken(tokens.accessToken);
        setUser(currentUser);
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401) {
          if (active) clearSession();
          return;
        }
        try {
          const refreshed = await authApi.refresh(tokens.refreshToken);
          if (active) saveSession(refreshed);
        } catch {
          if (active) clearSession();
        }
      } finally {
        if (active) setReady(true);
      }
    };
    void restore();
    return () => { active = false; };
  }, [clearSession, saveSession]);

  const login = useCallback(async (email: string, password: string) => {
    try {
      const response = await authApi.login(email, password);
      saveSession(response, true);
      return response.user;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new Error(toMessage(error));
    }
  }, [saveSession]);

  const loginWithGoogle = useCallback(async () => {
    try {
      const firebaseIdToken = await signInWithGoogle();
      const response = await authApi.loginFirebase(firebaseIdToken);
      if (response.status === "Authenticated") saveSession(response.authentication, true);
      return response;
    } catch (error) {
      throw error;
    }
  }, [saveSession]);

  const completeGoogleOnboarding = useCallback(async (input: GoogleOnboardingInput) => {
    const response = await authApi.completeGoogleOnboarding(input);
    saveSession(response, true);
    return response.user;
  }, [saveSession]);

  const register = useCallback(async (input: RegisterInput) => {
    try {
      await authApi.register(input);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new Error(toMessage(error));
    }
  }, []);

  const requestPasswordReset = useCallback(async (email: string) => {
    setPending(true);
    try {
      await authApi.forgotPassword(email);
    } catch (error) {
      throw new Error(toMessage(error));
    } finally {
      setPending(false);
    }
  }, []);

  const resetPassword = useCallback(async (token: string, newPassword: string) => {
    setPending(true);
    try {
      await authApi.resetPassword(token, newPassword);
    } catch (error) {
      throw new Error(toMessage(error));
    } finally {
      setPending(false);
    }
  }, []);

  const logout = useCallback(async () => {
    const token = accessToken;
    clearSession();
    forgetAccountBoundData();
    lastUserId.current = null;
    resetDemo();
    router.replace(routes.home);
    if (!token) return;
    try {
      await authApi.logout(token);
    } catch {
      // A local logout must succeed even if an expired token is rejected by the API.
    }
  }, [accessToken, clearSession, resetDemo, router]);

  const endSession = useCallback(() => {
    clearSession();
    forgetAccountBoundData();
    lastUserId.current = null;
    resetDemo();
  }, [clearSession, resetDemo]);

  const updateUser = useCallback((nextUser: AuthUser) => {
    setUser(nextUser);
  }, []);

  const value = useMemo<AuthSessionContextValue>(() => ({
    accessToken,
    isAuthenticated: !!user,
    pending,
    ready,
    user,
    login,
    loginWithGoogle,
    completeGoogleOnboarding,
    logout,
    endSession,
    register,
    requestPasswordReset,
    resetPassword,
    updateUser,
  }), [accessToken, completeGoogleOnboarding, endSession, login, loginWithGoogle, logout, pending, ready, register, requestPasswordReset, resetPassword, updateUser, user]);

  return <AuthSessionContext.Provider value={value}>{children}</AuthSessionContext.Provider>;
}

export function useAuthSession() {
  const context = useContext(AuthSessionContext);
  if (!context) throw new Error("useAuthSession must be used inside AuthSessionProvider");
  return context;
}
