"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ApiError } from "@/api/types/common";
import { authApi } from "./api";
import { signInWithFirebase, signInWithGoogle } from "./firebase";
import type { AuthUser, RegisterInput, TokenResponse } from "./types";

type StoredTokens = Pick<TokenResponse, "accessToken" | "refreshToken">;

type AuthSessionContextValue = {
  accessToken: string | null;
  isAuthenticated: boolean;
  pending: boolean;
  ready: boolean;
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  resetPassword: (token: string, newPassword: string) => Promise<void>;
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

function toMessage(error: unknown) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Không thể hoàn tất xác thực. Vui lòng thử lại.";
}

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [pending, setPending] = useState(false);
  const [ready, setReady] = useState(false);

  const saveSession = useCallback((response: TokenResponse) => {
    setAccessToken(response.accessToken);
    setUser(response.user);
    persistTokens({ accessToken: response.accessToken, refreshToken: response.refreshToken });
  }, []);

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
      const firebaseIdToken = await signInWithFirebase(email, password);
      saveSession(await authApi.loginFirebase(firebaseIdToken));
    } catch (error) {
      throw new Error(toMessage(error));
    }
  }, [saveSession]);

  const loginWithGoogle = useCallback(async () => {
    try {
      const firebaseIdToken = await signInWithGoogle();
      saveSession(await authApi.loginFirebase(firebaseIdToken));
    } catch (error) {
      throw new Error(toMessage(error));
    }
  }, [saveSession]);

  const register = useCallback(async (input: RegisterInput) => {
    try {
      await authApi.register(input);
      await login(input.email, input.password);
    } catch (error) {
      throw new Error(toMessage(error));
    }
  }, [login]);

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
    if (!token) return;
    try {
      await authApi.logout(token);
    } catch {
      // A local logout must succeed even if an expired token is rejected by the API.
    }
  }, [accessToken, clearSession]);

  const value = useMemo<AuthSessionContextValue>(() => ({
    accessToken,
    isAuthenticated: !!user,
    pending,
    ready,
    user,
    login,
    loginWithGoogle,
    logout,
    register,
    requestPasswordReset,
    resetPassword,
  }), [accessToken, login, loginWithGoogle, logout, pending, ready, register, requestPasswordReset, resetPassword, user]);

  return <AuthSessionContext.Provider value={value}>{children}</AuthSessionContext.Provider>;
}

export function useAuthSession() {
  const context = useContext(AuthSessionContext);
  if (!context) throw new Error("useAuthSession must be used inside AuthSessionProvider");
  return context;
}
