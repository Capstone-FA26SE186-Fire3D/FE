"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { demoCredentials } from "@/features/auth/demo-auth";
import { getArticle } from "@/features/learn/data/articles";

type PendingAction = { type: "save" | "ask"; slug: string } | null;
export type DemoExchange = { id: string; question: string; articleSlug: string | null; createdAt: string };

export type DemoSession = {
  isAuthenticated: boolean;
  name: string;
  bookmarks: string[];
  pendingAction: PendingAction;
  chat: DemoExchange[];
};

type SessionContextValue = DemoSession & {
  ready: boolean;
  storageAvailable: boolean;
  login: (email: string, password: string) => boolean;
  beginAuthenticatedSession: (name: string) => void;
  logout: () => void;
  reset: () => void;
  toggleBookmark: (slug: string) => void;
  setPendingAction: (action: PendingAction) => void;
  askQuestion: (question: string, articleSlug: string | null) => void;
};

const initialSession: DemoSession = { isAuthenticated: false, name: "", bookmarks: [], pendingAction: null, chat: [] };
const storageKey = "fire3d-demo-session";
const SessionContext = createContext<SessionContextValue | null>(null);
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const validSlug = (value: unknown): value is string => typeof value === "string" && !!getArticle(value);

function parseSession(value: unknown): DemoSession {
  if (!record(value)) return initialSession;
  const authenticated = value.isAuthenticated === true;
  const pending = value.pendingAction;
  const pendingAction: PendingAction = record(pending) && (pending.type === "save" || pending.type === "ask") && validSlug(pending.slug)
    ? { type: pending.type, slug: pending.slug } : null;
  const chat: DemoExchange[] = [];
  if (authenticated && Array.isArray(value.chat)) {
    for (const item of value.chat.slice(-50)) {
      if (!record(item) || typeof item.id !== "string" || item.id.length > 80 || chat.some((entry) => entry.id === item.id)
        || typeof item.question !== "string" || !item.question.trim() || item.question.length > 1000
        || (item.articleSlug !== null && !validSlug(item.articleSlug))
        || typeof item.createdAt !== "string" || !Number.isFinite(Date.parse(item.createdAt))) continue;
      chat.push({ id: item.id, question: item.question, articleSlug: item.articleSlug, createdAt: item.createdAt });
    }
  }
  return {
    isAuthenticated: authenticated, name: authenticated ? "Minh Anh" : "",
    bookmarks: authenticated && Array.isArray(value.bookmarks) ? [...new Set(value.bookmarks.filter(validSlug))] : [],
    pendingAction, chat,
  };
}

export function DemoSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<DemoSession>(initialSession);
  const [ready, setReady] = useState(false);
  const [storageAvailable, setStorageAvailable] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = window.sessionStorage.getItem(storageKey);
        if (saved) {
          try { setSession(parseSession(JSON.parse(saved))); } catch { setSession(initialSession); }
        }
      } catch { setStorageAvailable(false); }
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (ready) {
      try { window.sessionStorage.setItem(storageKey, JSON.stringify(session)); }
      catch { if (storageAvailable) queueMicrotask(() => setStorageAvailable(false)); }
    }
  }, [ready, session, storageAvailable]);

  const value = useMemo<SessionContextValue>(() => ({
    ...session,
    ready,
    storageAvailable,
    login: (email, password) => {
      if (!ready || email.trim().toLowerCase() !== demoCredentials.email || password !== demoCredentials.password) return false;
      setSession((current) => ({
        ...current, isAuthenticated: true, name: "Minh Anh", pendingAction: null,
        bookmarks: current.pendingAction?.type === "save"
          ? [...new Set([...current.bookmarks, current.pendingAction.slug])] : current.bookmarks,
      }));
      return true;
    },
    beginAuthenticatedSession: (name) => {
      if (!ready) return;
      setSession((current) => ({ ...current, isAuthenticated: true, name: name.trim() || "Người dùng", pendingAction: null }));
    },
    logout: () => setSession(initialSession),
    reset: () => setSession(initialSession),
    toggleBookmark: (slug) => setSession((current) => !ready || !current.isAuthenticated || !validSlug(slug) ? current : ({
      ...current,
      bookmarks: current.bookmarks.includes(slug) ? current.bookmarks.filter((item) => item !== slug) : [...current.bookmarks, slug],
    })),
    setPendingAction: (pendingAction) => {
      if (ready && (!pendingAction || validSlug(pendingAction.slug))) setSession((current) => ({ ...current, pendingAction }));
    },
    askQuestion: (question, articleSlug) => {
      const trimmed = question.trim();
      if (!ready || !trimmed || trimmed.length > 1000 || (articleSlug !== null && !validSlug(articleSlug))) return;
      const exchange = { id: crypto.randomUUID(), question: trimmed, articleSlug, createdAt: new Date().toISOString() };
      setSession((current) => current.isAuthenticated ? { ...current, chat: [...current.chat, exchange].slice(-50) } : current);
    },
  }), [ready, session, storageAvailable]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useDemoSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error("useDemoSession must be used inside DemoSessionProvider");
  return context;
}
