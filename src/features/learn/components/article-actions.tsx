"use client";

import { MessageCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { routes } from "@/configs/routes";
import { useAuthSession } from "@/features/auth/auth-session";
import { useDemoSession } from "@/store/demo-session";
import { SavePostButton } from "./save-post-button";

/**
 * Save (real bookmark API) and "ask about this article". Asking opens the Learning Hub chat, which is still a demo
 * with canned answers (F10 waits for BE#77/#78), so it keeps its own demo labels there.
 */
export function ArticleActions({ postId, slug }: { postId: string; slug: string }) {
  const router = useRouter();
  const { setPendingAction, ready } = useDemoSession();
  const { isAuthenticated } = useAuthSession();
  const ask = () => {
    const target = `${routes.learningHub}?article=${encodeURIComponent(slug)}`;
    if (!isAuthenticated) {
      setPendingAction({ type: "ask", slug });
      router.push(`${routes.login}?next=${encodeURIComponent(target)}`);
      return;
    }
    router.push(target);
  };
  return <div className="article-actions"><SavePostButton postId={postId} slug={slug} /><Button disabled={!ready} onClick={ask} variant="secondary"><MessageCircle size={16} /> Hỏi về bài này</Button></div>;
}
