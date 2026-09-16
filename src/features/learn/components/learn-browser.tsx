"use client";

import Link from "next/link";
import { Search, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SaveArticleButton } from "./save-article-button";
import type { LearnArticle } from "../types";

export function LearnBrowser({ articles }: { articles: LearnArticle[] }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return articles;
    return articles.filter((article) => `${article.title} ${article.excerpt} ${article.category}`.toLowerCase().includes(normalized));
  }, [articles, query]);

  return <>
    <div className="learn-toolbar"><label className="relative block w-full max-w-[380px]"><Search className="pointer-events-none absolute left-3 top-3.5 text-[var(--dim)]" size={17} /><input className="search-field pl-10" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm một chủ đề để bắt đầu" aria-label="Tìm bài Learn" /></label><span className="source-note"><Sparkles size={14} className="mr-1 inline text-[var(--ember)]" /> Bài mẫu do Fire3D biên soạn · chưa thẩm định chuyên môn</span></div>
    <div className="article-list">{filtered.map((article) => <Card className="article-card" key={article.slug}><div className="article-meta"><span>{article.category}</span><span>•</span><span>{article.readingTime}</span></div><div className="flex items-start justify-between gap-4"><Link href={`/learn/${article.slug}`} className="min-w-0"><h2>{article.title}</h2><p>{article.excerpt}</p></Link><SaveArticleButton slug={article.slug} compact /></div><div className="source-note mt-4">{article.source} · {article.date}</div></Card>)}</div>
    {!filtered.length && <Card className="p-6 text-[var(--muted)]">Chưa có bài phù hợp. Thử một từ khóa khác nhé.</Card>}
    <Badge className="mt-8 normal-case tracking-normal">Nội dung minh họa cho prototype web</Badge>
  </>;
}
