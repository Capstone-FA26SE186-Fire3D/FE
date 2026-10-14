import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArticleReader } from "@/features/learn/components/article-reader";
import { postMetadata } from "@/features/learn/server-metadata";
import { isPostSlug } from "@/features/learn/slug";
import { SiteFooter } from "@/layouts/site-footer";
import { SiteHeader } from "@/layouts/site-header";

// Rendered per request: the post comes from the public Learn API, so a Hidden/Deleted post must disappear immediately.
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return postMetadata(slug);
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isPostSlug(slug)) notFound();
  return <div className="site-shell"><SiteHeader /><main className="page-main"><ArticleReader key={slug} slug={slug} /></main><SiteFooter /></div>;
}
