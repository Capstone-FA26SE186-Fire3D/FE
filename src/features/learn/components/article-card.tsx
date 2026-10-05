import Image from "next/image";
import Link from "next/link";
import { Iconsax } from "@/components/ui/iconsax";
import type { LearnArticle } from "../types";
import { SaveArticleButton } from "./save-article-button";

export function ArticleCard({ article }: { article: LearnArticle }) {
  return <article className="learn-card">
    <Link className="learn-cover" href={`/learn/${article.slug}`} aria-label={`Đọc ${article.title}`}>
      {article.cover ? <Image src={article.cover} alt="" fill sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" /> : <div className={`learn-cover-placeholder cover-${article.slug}`}><Iconsax name="buildings" size={64} /><span>FET3D / LEARN</span></div>}
    </Link>
    <div className="learn-card-body">
      <div className="learn-card-meta"><span>{article.category}</span><small>{article.readingTime}</small><SaveArticleButton slug={article.slug} compact /></div>
      <Link href={`/learn/${article.slug}`}><h2>{article.title}</h2></Link>
      <p className="learn-excerpt">{article.excerpt}</p>
      <footer className="learn-card-footer"><Image src="/icon.png" width={28} height={28} alt="" /><span>{article.author ?? "FET3D"}</span><span className="learn-card-date">{article.date}</span></footer>
      <p className="learn-card-source">{article.source}</p>
    </div>
  </article>;
}
