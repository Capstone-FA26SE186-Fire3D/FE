"use client";

import { Iconsax } from "@/components/ui/iconsax";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { routes } from "@/configs/routes";
import { useAuthSession } from "@/features/auth/auth-session";
import { useDemoSession } from "@/store/demo-session";

export function SaveArticleButton({ slug, compact = false }: { slug: string; compact?: boolean }) {
  const router = useRouter();
  const { bookmarks, toggleBookmark, setPendingAction, ready } = useDemoSession();
  const { isAuthenticated } = useAuthSession();
  const saved = bookmarks.includes(slug);

  const save = () => {
    if (!isAuthenticated) {
      setPendingAction({ type: "save", slug });
      router.push(`${routes.login}?next=${encodeURIComponent(`/learn/${slug}`)}`);
      return;
    }
    toggleBookmark(slug);
  };

  return <Button disabled={!ready} onClick={save} variant={saved ? "secondary" : "quiet"} size="md" aria-pressed={saved} aria-label={saved ? "Bỏ lưu bài viết" : "Lưu bài viết"}><Iconsax name="archive-book" size={16} />{!compact && (saved ? "Đã lưu" : "Lưu bài viết")}</Button>;
}
