"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { isPostSlug } from "@/features/learn/slug";

/*
 * Prototype state of the Learning Hub chat (canned answers, F10 waits for BE#77/#78) and the "ask" intent that survives a
 * login redirect. Bookmarks are NOT here any more: they are real and live on the server (/api/learn/bookmarks).
 */
type PendingAction = { type: "ask"; slug: string } | null;
export type DemoExchange = { id: string; question: string; articleSlug: string | null; articleTitle: string | null; createdAt: string };

export type DemoSession = {
  pendingAction: PendingAction;
  chat: DemoExchange[];
};

type SessionContextValue = DemoSession & {
  ready: boolean;
  storageAvailable: boolean;
  reset: () => void;
  resumePendingAction: () => void;
  setPendingAction: (action: PendingAction) => void;
  askQuestion: (question: string, articleSlug: string | null, articleTitle?: string | null) => void;
};

const initialSession: DemoSession = { pendingAction: null, chat: [] };
const storageKey = "fire3d-prototype-content";
const SessionContext = createContext<SessionContextValue | null>(null);
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const validSlug = (value: unknown): value is string => typeof value === "string" && isPostSlug(value);

function parseSession(value: unknown): DemoSession {
  if (!record(value)) return initialSession;
  const pending = value.pendingAction;
  const pendingAction: PendingAction = record(pending) && pending.type === "ask" && validSlug(pending.slug)
    ? { type: "ask", slug: pending.slug } : null;
  const chat: DemoExchange[] = [];
  if (Array.isArray(value.chat)) {
    for (const item of value.chat.slice(-50)) {
      if (!record(item) || typeof item.id !== "string" || item.id.length > 80 || chat.some((entry) => entry.id === item.id)
        || typeof item.question !== "string" || !item.question.trim() || item.question.length > 1000
        || (item.articleSlug !== null && !validSlug(item.articleSlug))
        || typeof item.createdAt !== "string" || !Number.isFinite(Date.parse(item.createdAt))) continue;
      chat.push({ id: item.id, question: item.question, articleSlug: item.articleSlug, articleTitle: typeof item.articleTitle === "string" && item.articleTitle.length <= 255 ? item.articleTitle : null, createdAt: item.createdAt });
    }
  }
  return { pendingAction, chat };
}

export function DemoSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<DemoSession>(initialSession);
  const [ready, setReady] = useState(false);
  const [storageAvailable, setStorageAvailable] = useState(true);

  // After login the intent has been honoured by the redirect (`next`), so it is simply cleared.
  const resumePendingAction = useCallback(() => {
    setSession((current) => (current.pendingAction ? { ...current, pendingAction: null } : current));
  }, []);

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
    resumePendingAction,
    reset: () => setSession(initialSession),
    setPendingAction: (pendingAction) => {
      if (ready && (!pendingAction || validSlug(pendingAction.slug))) setSession((current) => ({ ...current, pendingAction }));
    },
    askQuestion: (question, articleSlug, articleTitle = null) => {
      const trimmed = question.trim();
      if (!ready || !trimmed || trimmed.length > 1000 || (articleSlug !== null && !validSlug(articleSlug))) return;
      const exchange = { id: crypto.randomUUID(), question: trimmed, articleSlug, articleTitle: articleTitle ? articleTitle.slice(0, 255) : null, createdAt: new Date().toISOString() };
      setSession((current) => ({ ...current, chat: [...current.chat, exchange].slice(-50) }));
    },
  }), [ready, resumePendingAction, session, storageAvailable]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useDemoSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error("useDemoSession must be used inside DemoSessionProvider");
  return context;
}
