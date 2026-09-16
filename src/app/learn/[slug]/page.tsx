import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteFooter } from "@/layouts/site-footer";
import { SiteHeader } from "@/layouts/site-header";
import { getArticle, articles } from "@/features/learn/data/articles";
import { ArticleActions } from "@/features/learn/components/article-actions";

export function generateStaticParams() { return articles.map((article) => ({ slug: article.slug })); }

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const article = getArticle(slug);
  return { title: article?.title ?? "Bài đọc" };
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = getArticle(slug);
  if (!article) notFound();
  return <div className="site-shell"><SiteHeader /><main className="page-main"><div className="article-reading"><div className="article-meta"><span>{article.category}</span><span>•</span><span>{article.readingTime}</span><span>•</span><span>{article.date}</span></div><h1>{article.title}</h1><p className="lede">{article.excerpt}</p><p className="source-note">Nguồn: {article.source}</p><ArticleActions slug={article.slug} /><div className="article-body">{article.body.map((section) => <section key={section.heading ?? section.paragraphs[0]}>{section.heading && <h2>{section.heading}</h2>}{section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</section>)}</div></div></main><SiteFooter /></div>;
}
