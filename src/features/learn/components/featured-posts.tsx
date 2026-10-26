"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { kindLabel, type PublicPostSummary } from "../types";
import { formatPostDate, PostCover } from "./post-card";
import "../learn.css";

/**
 * Figma "Bài học v2 · Danh sách": the newest post large on the left (cover, kind, title, two-line summary, date and the
 * save control) and the next ones as a compact "Mới đăng" list on the right. Collapses to one column on small screens.
 */
export function FeaturedPosts({ featured, recent, action }: { featured: PublicPostSummary; recent: PublicPostSummary[]; action: (post: PublicPostSummary) => ReactNode }) {
  const date = formatPostDate(featured.publishedAt);
  return <section className="lv2-hero" aria-label="Bài nổi bật">
    <article className="lv2-featured" data-learn-post>
      <PostCover className="lv2-featured-cover" url={featured.coverImageUrl} slug={featured.slug} title={featured.title} kind={featured.kind} />
      <p className="lv2-kind" data-kind={featured.kind}>{kindLabel[featured.kind]}</p>
      <Link href={`/learn/${featured.slug}`}><h2 className="lv2-featured-title" data-learn-title>{featured.title}</h2></Link>
      {featured.summary && <p className="lv2-featured-summary">{featured.summary}</p>}
      <div className="lv2-featured-foot">{date && <span>Xuất bản {date}</span>}{action(featured)}</div>
    </article>
    {recent.length > 0 && <aside className="lv2-recent" aria-labelledby="lv2-recent-heading">
      <h2 id="lv2-recent-heading">Mới đăng</h2>
      <ul>{recent.map((post) => <li key={post.id} data-learn-post>
        <PostCover className="lv2-recent-cover" url={post.coverImageUrl} slug={post.slug} title={post.title} kind={post.kind} />
        <div>
          <p className="lv2-kind" data-kind={post.kind}>{kindLabel[post.kind]}</p>
          <Link href={`/learn/${post.slug}`}><h3 data-learn-title>{post.title}</h3></Link>
          <span>{formatPostDate(post.publishedAt)}</span>
        </div>
      </li>)}</ul>
    </aside>}
  </section>;
}
