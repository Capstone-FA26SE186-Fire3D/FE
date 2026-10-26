"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { MotionProvider } from "@/components/ui/motion";
import { ToastProvider } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { routes } from "@/configs/routes";
import { useAuthSession } from "@/features/auth/auth-session";
import { AiBubbleProvider, useOptionalAiBubble } from "@/features/org-ai/floating/ai-bubble-context";
import { ThemeScope } from "@/features/theme/theme-scope";
import { cn } from "@/utils/cn";

// The chat panel only loads for a signed-in Trainee; readers who never ask do not download it.
const AiBubble = dynamic(() => import("@/features/org-ai/floating/ai-bubble").then((module) => module.AiBubble), { ssr: false });

/**
 * The Trainee's floating Trợ lý AI on a public article (the same bubble as the learning hub). It is mounted for every reader
 * but enabled only for a signed-in Trainee; the public site is dark, so the bubble's theme is pinned to dark.
 */
export function LearnAiScope({ children }: { children: ReactNode }) {
  return <AiBubbleProvider audience="trainee">
    {children}
    <LearnAiBubble />
  </AiBubbleProvider>;
}

function LearnAiBubble() {
  const bubble = useOptionalAiBubble();
  if (!bubble?.enabled) return null;
  return <ThemeScope className="learning-scope learn-ai-scope" forcedMode="dark"><ToastProvider><MotionProvider><TooltipProvider><AiBubble /></TooltipProvider></MotionProvider></ToastProvider></ThemeScope>;
}

/**
 * "Hỏi Trợ lý AI về bài này": opens the bubble with this article as the question's context (the backend pins the
 * published version). A guest signs in first and comes back to the article; other roles have their own AI, so nothing shows.
 */
export function AskAboutArticle({ slug, className }: { slug: string; className?: string }) {
  const { isAuthenticated, ready, user } = useAuthSession();
  const bubble = useOptionalAiBubble();
  if (!ready || (isAuthenticated && user?.role !== 2)) return null;
  if (!isAuthenticated) {
    return <Link className={cn(buttonVariants({ variant: "secondary", size: "md" }), className)} href={`${routes.login}?next=${encodeURIComponent(`/learn/${slug}`)}`}>
      <Sparkles size={16} aria-hidden="true" />Đăng nhập để hỏi Trợ lý AI
    </Link>;
  }
  return <Button variant="secondary" size="md" className={className} disabled={!bubble?.enabled} onClick={() => bubble?.openWith({ article: slug })}>
    <Sparkles size={16} aria-hidden="true" />Hỏi Trợ lý AI về bài này
  </Button>;
}
