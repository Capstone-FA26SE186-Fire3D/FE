"use client";

import { Bookmark, Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { routes } from "@/configs/routes";
import { useDemoSession } from "@/store/demo-session";

export function SaveArticleButton({ slug, compact = false }: { slug: string; compact?: boolean }) {
  const router = useRouter();
  const { isAuthenticated, bookmarks, toggleBookmark, setPendingAction, ready } = useDemoSession();
  const saved = bookmarks.includes(slug);

  const save = () => {
    if (!isAuthenticated) {
      setPendingAction({ type: "save", slug });
      router.push(`${routes.login}?next=${encodeURIComponent(`/learn/${slug}`)}`);
      return;
    }
    toggleBookmark(slug);
  };

  return <Button disabled={!ready} onClick={save} variant={saved ? "secondary" : "quiet"} size="md" aria-pressed={saved} aria-label={saved ? "Bỏ lưu bài viết" : "Lưu bài viết"}>{saved ? <Check size={16} /> : <Bookmark size={16} />}{!compact && (saved ? "Đã lưu" : "Lưu bài viết")}</Button>;
}
