"use client";

import { MessageCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { routes } from "@/configs/routes";
import { useAuthSession } from "@/features/auth/auth-session";
import { useDemoSession } from "@/store/demo-session";
import { SaveArticleButton } from "./save-article-button";
import { ArticleDiagram } from "./article-diagram";

export function ArticleActions({ slug }: { slug: string }) {
  const router = useRouter();
  const { setPendingAction, ready } = useDemoSession();
  const { isAuthenticated } = useAuthSession();
  const ask = () => {
    if (!isAuthenticated) {
      setPendingAction({ type: "ask", slug });
      router.push(`${routes.login}?next=${encodeURIComponent(`${routes.learningHub}?article=${slug}`)}`);
      return;
    }
    router.push(`${routes.learningHub}?article=${encodeURIComponent(slug)}`);
  };
  return <><div className="article-actions"><SaveArticleButton slug={slug} /><Button disabled={!ready} onClick={ask} variant="secondary"><MessageCircle size={16} /> Hỏi về bài này</Button></div><ArticleDiagram slug={slug} /></>;
}
