"use client";

import { Search } from "lucide-react";
import { useState } from "react";
import { ArticleCard } from "./article-card";
import type { LearnArticle } from "../types";

export function LearnBrowser({ articles, saved = false }: { articles: LearnArticle[]; saved?: boolean }) {
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLocaleLowerCase("vi");
  const filtered = articles.filter((article) => `${article.title} ${article.excerpt} ${article.category}`.toLocaleLowerCase("vi").includes(normalized));
  return <>
    <div className="learn-toolbar"><label className="learn-search"><Search aria-hidden="true" size={18} /><input className="search-field" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={saved ? "Tìm trong bài đã lưu" : "Tìm một chủ đề để bắt đầu"} aria-label={saved ? "Tìm bài đã lưu" : "Tìm bài Learn"} /></label><span className="source-note">Nội dung mẫu · chưa thẩm định chuyên môn</span></div>
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 learn-grid">{filtered.map((article) => <ArticleCard article={article} key={article.slug} />)}</div>
    {!filtered.length && <p className="learn-no-results" role="status">Chưa có bài phù hợp. Thử một từ khóa khác nhé.</p>}
  </>;
}
