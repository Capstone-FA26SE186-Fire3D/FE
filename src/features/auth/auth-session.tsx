"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ApiError } from "@/api";
import { env } from "@/configs/env";
import { useDemoSession } from "@/store/demo-session";
import { authApi } from "./api";
import { clearTokenSet, readTokenSet, writeTokenSet } from "./token-storage";
import type { AuthUser, LoginInput, TokenSet } from "./types";

type AuthSessionValue = {
  ready: boolean;
  pending: boolean;
  error: string | null;
  user: AuthUser | null;
  login: (input: LoginInput) => Promise<boolean>;
  logout: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  resetPassword: (token: string, newPassword: string) => Promise<void>;
};

const AuthSessionContext = createContext<AuthSessionValue | null>(null);
const mockUser: AuthUser = { id: "mock-user", email: "demo@fire3d.local", fullName: "Minh Anh", role: 0, organizationId: null };

function userName(user: AuthUser) {
  return user.fullName?.trim() || user.email;
}

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  const demo = useDemoSession();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const demoRef = useRef(demo);

  useEffect(() => { demoRef.current = demo; }, [demo]);

  useEffect(() => {
    let active = true;
    const restore = async () => {
      if (env.authMode === "mock") { if (active) setReady(true); return; }
      const tokens = readTokenSet();
      if (!tokens) { if (active) setReady(true); return; }
      try {
        let currentTokens: TokenSet = tokens;
        let currentUser: AuthUser;
        try { currentUser = await authApi.me(currentTokens.accessToken); }
        catch (cause) {
          if (!(cause instanceof ApiError) || cause.status !== 401) throw cause;
          const refreshed = await authApi.refresh(currentTokens.refreshToken);
          currentTokens = refreshed;
          writeTokenSet(refreshed);
          currentUser = refreshed.user;
        }
        if (active) { setUser(currentUser); demoRef.current.beginAuthenticatedSession(userName(currentUser)); }
      } catch { clearTokenSet(); }
      finally { if (active) setReady(true); }
    };
    void restore();
    return () => { active = false; };
  }, []);

  const value = useMemo<AuthSessionValue>(() => ({
    ready,
    pending,
    error,
    user,
    login: async (input) => {
      setPending(true); setError(null);
      try {
        if (env.authMode === "mock") {
          if (!demo.login(input.email, input.password)) throw new Error("Email hoặc mật khẩu mẫu chưa đúng.");
          setUser(mockUser);
          return true;
        }
        const response = await authApi.login(input);
        writeTokenSet(response);
        demo.beginAuthenticatedSession(userName(response.user));
        setUser(response.user);
        return true;
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Không thể đăng nhập. Vui lòng thử lại.");
        return false;
      } finally { setPending(false); }
    },
    logout: async () => {
      const tokens = env.authMode === "api" ? readTokenSet() : null;
      clearTokenSet(); setUser(null); demo.logout();
      if (tokens) { try { await authApi.logout(tokens.accessToken); } catch { /* local logout remains successful */ } }
    },
    requestPasswordReset: async (email) => {
      if (env.authMode === "api") await authApi.forgotPassword(email);
    },
    resetPassword: async (token, newPassword) => {
      if (env.authMode === "api") await authApi.resetPassword(token, newPassword);
    },
  }), [demo, error, pending, ready, user]);

  return <AuthSessionContext.Provider value={value}>{children}</AuthSessionContext.Provider>;
}

export function useAuthSession() {
  const context = useContext(AuthSessionContext);
  if (!context) throw new Error("useAuthSession must be used inside AuthSessionProvider");
  return context;
}
