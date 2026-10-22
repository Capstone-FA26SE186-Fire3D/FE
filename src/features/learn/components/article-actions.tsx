"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { routes } from "@/configs/routes";
import { useAuthSession } from "@/features/auth/auth-session";
import { cn } from "@/utils/cn";
import { SavePostButton } from "./save-post-button";

/** Right-rail card with the bookmark toggle (real bookmark API; a guest is sent to sign in and back to this article). */
export function ArticleActions({ postId, slug }: { postId: string; slug: string }) {
  return <section className="reader-card article-actions" aria-label="Lưu bài">
    <SavePostButton postId={postId} slug={slug} />
    <p className="reader-card-note">Lưu cần đăng nhập tài khoản học viên. Bài đã lưu nằm trong thư viện cá nhân của bạn.</p>
  </section>;
}

/**
 * "Hỏi AI về bài này": a link into the Trainee Q&A with `?article=<slug>`; the Q&A pins the post and its published version.
 * Only Trainee accounts can ask (organization/admin use their own AI), so those roles do not see this card; a guest is sent
 * to sign in and returns to the Q&A with the same article.
 */
export function AskAboutArticle({ slug }: { slug: string }) {
  const { isAuthenticated, ready, user } = useAuthSession();
  if (ready && isAuthenticated && user?.role !== 2) return null;
  const target = `${routes.learningHub}?view=questions&article=${encodeURIComponent(slug)}`;
  const guest = ready && !isAuthenticated;
  const href = guest ? `${routes.login}?next=${encodeURIComponent(target)}` : target;
  return <section className="reader-card" aria-labelledby="reader-ask-heading">
    <h2 id="reader-ask-heading">Hỏi AI về bài này</h2>
    <p className="reader-card-note">AI trả lời dựa trên đúng phiên bản bài đang đọc, chỉ để tham khảo và không thay chỉ dẫn khi có sự cố thật.</p>
    <Link className={cn(buttonVariants({ variant: "secondary", size: "md" }), "reader-ask-link")} href={href}>
      <Sparkles size={16} aria-hidden="true" />{guest ? "Đăng nhập để hỏi AI" : "Hỏi AI về bài này"}
    </Link>
  </section>;
}
