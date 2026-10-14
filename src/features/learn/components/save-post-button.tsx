"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiError } from "@/api/types/common";
import { Button } from "@/components/ui/button";
import { Iconsax } from "@/components/ui/iconsax";
import { routes } from "@/configs/routes";
import { useAuthSession } from "@/features/auth/auth-session";
import { useLearnBookmarks } from "./bookmarks-context";

function saveError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 404) return "Bài này không còn công khai nên không lưu được.";
    if (error.status === 401) return "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.";
    if (error.status === 403) return "Chỉ tài khoản học viên mới lưu được bài.";
  }
  return "Chưa lưu được. Hãy thử lại.";
}

/**
 * Bookmark toggle for the public Learn pages. A guest is sent to sign in and returns to this exact article;
 * only Trainee accounts can bookmark (the API answers 403 to anyone else), so other roles get an explained disabled state.
 */
export function SavePostButton({ postId, slug, compact = false }: { postId: string; slug: string; compact?: boolean }) {
  const router = useRouter();
  const { isAuthenticated, ready, user } = useAuthSession();
  const bookmarks = useLearnBookmarks();
  const [error, setError] = useState("");
  const saved = bookmarks.isSaved(postId);
  const busy = bookmarks.isBusy(postId);
  const otherRole = isAuthenticated && user?.role !== 2;
  const waiting = !ready || (bookmarks.supported && bookmarks.status === "loading");

  const click = async () => {
    if (!isAuthenticated) {
      router.push(`${routes.login}?next=${encodeURIComponent(`/learn/${slug}`)}`);
      return;
    }
    setError("");
    try {
      if (saved) await bookmarks.remove(postId); else await bookmarks.save(postId);
    } catch (cause) {
      setError(saveError(cause));
    }
  };

  const label = saved ? "Bỏ lưu bài viết" : "Lưu bài viết";
  return <div className="save-post">
    <Button onClick={() => void click()} disabled={waiting || busy || otherRole} variant={saved ? "secondary" : "quiet"} size="md" aria-pressed={saved} aria-label={label} aria-describedby={otherRole ? `save-hint-${postId}` : undefined}>
      <Iconsax name="archive-book" size={16} />{!compact && (busy ? "Đang cập nhật…" : saved ? "Đã lưu" : "Lưu bài viết")}
    </Button>
    {otherRole && <span id={`save-hint-${postId}`} className="save-post-hint">Chỉ tài khoản học viên lưu được bài.</span>}
    {error && <span className="save-post-hint" role="alert">{error}</span>}
  </div>;
}
