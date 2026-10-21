"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { resetCommandKeys } from "@/api/command-keys";
import { ApiError } from "@/api/types/common";
import { routes } from "@/configs/routes";
import { clearPendingCheckout } from "@/features/billing/pending-payment";
import { authApi } from "./api";
import { accessTokenExpiry } from "./token-expiry";
import { signInWithGoogle } from "./firebase";
import { openSessionChannel, persistTokens, readTokens, withRefreshLock, type SessionBroadcast } from "./session-store";
import type { AuthUser, RegisterInput, TokenResponse, GoogleLoginResult, GoogleOnboardingInput } from "./types";

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

const AuthSessionContext = createContext<AuthSessionContextValue | null>(null);

/**
 * Browser storage that points at one tenant's business objects (the retry keys of unfinished commands, the checkout the
 * user left for PayOS). It must not survive a logout or an account switch: the next account in this tab would otherwise
 * replay the previous account's keys or be sent to its quotation.
 */
function forgetAccountBoundData() {
  resetCommandKeys();
  clearPendingCheckout();
}

/** Refresh this long before the access token expires, so a request in flight never carries a token that just lapsed. */
const REFRESH_LEAD_MS = 60_000;
/** A transient refresh failure (network, 5xx, 429) is retried after this delay instead of signing the user out. */
const REFRESH_RETRY_MS = 30_000;

function toMessage(error: unknown) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Không thể hoàn tất xác thực. Vui lòng thử lại.";
}

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [pending, setPending] = useState(false);
  const [ready, setReady] = useState(false);
  // The account this tab last held: a different account signing in (even without a logout in between) starts clean.
  const lastUserId = useRef<string | null>(null);
  const channel = useRef<ReturnType<typeof openSessionChannel> | null>(null);

  const saveSession = useCallback((response: TokenResponse, explicitLogin = false) => {
    if (explicitLogin && lastUserId.current && lastUserId.current !== response.user.id) forgetAccountBoundData();
    lastUserId.current = response.user.id;
    setAccessToken(response.accessToken);
    setUser(response.user);
    const tokens = { accessToken: response.accessToken, refreshToken: response.refreshToken };
    persistTokens(tokens);
    channel.current?.post({ type: "session", tokens });
  }, []);

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    persistTokens(null);
    channel.current?.post({ type: "logout" });
  }, []);

  // The session cookie is shared by every tab: follow a sign-in, rotation or sign-out made in another one, so this tab
  // never replays a refresh token that another tab already consumed.
  useEffect(() => {
    const adopt = async (tokens: { accessToken: string; refreshToken: string }) => {
      try {
        const currentUser = await authApi.me(tokens.accessToken);
        lastUserId.current = currentUser.id;
        setAccessToken(tokens.accessToken);
        setUser(currentUser);
      } catch {
        // The owning tab keeps the session alive; this tab will pick it up on the next signal.
      }
    };
    const onMessage = (message: SessionBroadcast) => {
      if (message.type === "logout") {
        setAccessToken(null);
        setUser(null);
        forgetAccountBoundData();
        lastUserId.current = null;
      } else {
        void adopt(message.tokens);
      }
    };
    const session = openSessionChannel(onMessage);
    channel.current = session;
    return () => { session.close(); channel.current = null; };
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
          const refreshed = await withRefreshLock(async () => {
            // Another tab may have rotated the token while this one waited for the lock: use its session.
            const latest = readTokens();
            if (latest && latest.refreshToken !== tokens.refreshToken) {
              return { ...(await authApi.me(latest.accessToken).then((user) => ({ user }))), accessToken: latest.accessToken, refreshToken: latest.refreshToken };
            }
            return authApi.refresh(tokens.refreshToken);
          });
          if (active) saveSession(refreshed);
        } catch {
          // The session is really gone (expired/revoked): whoever signs in next may be another account.
          if (active) { clearSession(); forgetAccountBoundData(); }
        }
      } finally {
        if (active) setReady(true);
      }
    };
    void restore();
    return () => { active = false; };
  }, [clearSession, saveSession]);

  // Keep the session alive while the tab is open: renew the access token shortly before it expires (single flight).
  // A rejected refresh means the session family is gone (revoked/expired) and the user must sign in again; a transient
  // failure keeps the current session and tries again later.
  const refreshing = useRef(false);
  useEffect(() => {
    if (!accessToken) return;
    const expiry = accessTokenExpiry(accessToken);
    if (expiry === null) return;
    let cancelled = false;
    let timer = 0;
    const renew = async () => {
      if (cancelled || refreshing.current) return;
      const tokens = readTokens();
      if (!tokens || tokens.accessToken !== accessToken) return;
      refreshing.current = true;
      try {
        const refreshed = await withRefreshLock(async () => {
          const latest = readTokens();
          // A sibling tab already renewed: its broadcast delivers the new session, nothing to rotate here.
          if (!latest || latest.refreshToken !== tokens.refreshToken) return null;
          return authApi.refresh(tokens.refreshToken);
        });
        if (refreshed && !cancelled) saveSession(refreshed);
      } catch (error) {
        if (cancelled) return;
        const rejected = error instanceof ApiError && (error.status === 400 || error.status === 401 || error.status === 403);
        if (rejected) { clearSession(); forgetAccountBoundData(); lastUserId.current = null; }
        else timer = window.setTimeout(() => void renew(), REFRESH_RETRY_MS);
      } finally {
        refreshing.current = false;
      }
    };
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void renew(), Math.max(0, expiry - REFRESH_LEAD_MS - Date.now()));
    };
    // Background tabs throttle timers: re-check as soon as the tab is visible again.
    const onVisible = () => { if (document.visibilityState === "visible") schedule(); };
    schedule();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [accessToken, clearSession, saveSession]);

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
    router.replace(routes.home);
    if (!token) return;
    try {
      await authApi.logout(token);
    } catch {
      // A local logout must succeed even if an expired token is rejected by the API.
    }
  }, [accessToken, clearSession, router]);

  const endSession = useCallback(() => {
    clearSession();
    forgetAccountBoundData();
    lastUserId.current = null;
  }, [clearSession]);

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
