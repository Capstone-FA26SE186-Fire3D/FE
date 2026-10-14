"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAuthSession } from "@/features/auth/auth-session";
import { learnApi } from "../api";

/*
 * Which posts the signed-in Trainee has saved. The API has no per-post "is saved" read, so the set comes from the paged
 * bookmark list (up to MAX_PAGES x 100) and is corrected by every PUT/DELETE. Server truth, kept only in memory.
 */
const PAGE_SIZE = 100;
const MAX_PAGES = 10;

type Status = "off" | "loading" | "ready" | "error";
type BookmarksValue = {
  /** Only a signed-in Trainee can bookmark. */
  supported: boolean;
  status: Status;
  isSaved: (postId: string) => boolean;
  isBusy: (postId: string) => boolean;
  save: (postId: string) => Promise<void>;
  remove: (postId: string) => Promise<void>;
  reload: () => void;
};

const BookmarksContext = createContext<BookmarksValue | null>(null);

export function LearnBookmarksProvider({ children }: { children: ReactNode }) {
  const { accessToken, ready, user } = useAuthSession();
  const supported = ready && user?.role === 2 && !!accessToken;
  const [loaded, setLoaded] = useState<{ token: string; ids: Set<string>; failed: boolean } | null>(null);
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const [reloadToken, setReloadToken] = useState(0);
  const token = supported ? accessToken : null;
  const tokenRef = useRef(token);

  useEffect(() => { tokenRef.current = token; }, [token]);

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    void (async () => {
      const ids = new Set<string>();
      try {
        for (let page = 1; page <= MAX_PAGES; page += 1) {
          const result = await learnApi.bookmarks(token, { page, pageSize: PAGE_SIZE }, controller.signal);
          for (const item of result.items) ids.add(item.postId);
          if (result.items.length === 0 || page * PAGE_SIZE >= result.total) break;
        }
        if (!controller.signal.aborted) setLoaded({ token, ids, failed: false });
      } catch {
        if (!controller.signal.aborted) setLoaded({ token, ids, failed: true });
      }
    })();
    return () => controller.abort();
  }, [token, reloadToken]);

  const current = token && loaded?.token === token ? loaded : null;
  const status: Status = !token ? "off" : !current ? "loading" : current.failed ? "error" : "ready";

  const mutate = useCallback(async (postId: string, saved: boolean) => {
    const activeToken = tokenRef.current;
    if (!activeToken) return;
    setBusy((previous) => new Set(previous).add(postId));
    try {
      if (saved) await learnApi.bookmark(activeToken, postId);
      else await learnApi.unbookmark(activeToken, postId);
      setLoaded((previous) => {
        if (!previous || previous.token !== activeToken) return previous;
        const ids = new Set(previous.ids);
        if (saved) ids.add(postId); else ids.delete(postId);
        return { ...previous, ids };
      });
    } finally {
      setBusy((previous) => { const next = new Set(previous); next.delete(postId); return next; });
    }
  }, []);

  const value = useMemo<BookmarksValue>(() => ({
    supported,
    status,
    isSaved: (postId) => current?.ids.has(postId) ?? false,
    isBusy: (postId) => busy.has(postId),
    save: (postId) => mutate(postId, true),
    remove: (postId) => mutate(postId, false),
    reload: () => setReloadToken((value) => value + 1),
  }), [busy, current, mutate, status, supported]);

  return <BookmarksContext.Provider value={value}>{children}</BookmarksContext.Provider>;
}

export function useLearnBookmarks(): BookmarksValue {
  const context = useContext(BookmarksContext);
  if (!context) throw new Error("useLearnBookmarks must be used inside LearnBookmarksProvider");
  return context;
}
