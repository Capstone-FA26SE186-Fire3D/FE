"use client";

import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { useEffect } from "react";
import { useAsyncData } from "@/api/use-async-data";
import { Button } from "@/components/ui/button";
import { routes } from "@/configs/routes";
import { describeReadError, learnApi } from "../api";
import { ArticleActions, AskAboutArticle } from "./article-actions";
import { BlockRenderer } from "./block-renderer";
import { LearnBookmarksProvider } from "./bookmarks-context";
import { formatPostDate } from "./post-card";
import { RelatedPosts } from "./related-posts";
import { kindLabel } from "../types";
import "../learn.css";

const roleLabel: Record<string, string> = { Primary: "Nguồn chính", Reference: "Tham khảo", Transcript: "Bản ghi lời" };

/** Keeps the tab title and description in step with the post the API returned (the server render only knows the slug). */
function useDocumentMeta(title: string | null, description: string | null) {
  useEffect(() => {
    if (!title) return;
    const previousTitle = document.title;
    document.title = `${title} — FET3D`;
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const created = !meta;
    const previousDescription = meta?.content ?? "";
    if (!meta) { meta = document.createElement("meta"); meta.name = "description"; document.head.appendChild(meta); }
    if (description) meta.content = description;
    return () => {
      document.title = previousTitle;
      if (created) meta.remove(); else meta.content = previousDescription;
    };
  }, [title, description]);
}

function ReaderState({ title, message, retry }: { title: string; message: string; retry?: () => void }) {
  return <div className="learn-state" role="alert">
    <h1>{title}</h1><p>{message}</p>
    <div className="learn-state-actions">
      {retry && <Button variant="secondary" onClick={retry}><RefreshCw size={16} aria-hidden="true" />Thử lại</Button>}
      <Button asChild variant="quiet"><Link href={routes.learn}>Xem thư viện Learn</Link></Button>
    </div>
  </div>;
}

/** Public article page body: one `GET /api/learn/posts/{slug}`; only a Published post is ever readable. */
export function ArticleReader({ slug }: { slug: string }) {
  const post = useAsyncData(`learn:post:${slug}`, (signal) => learnApi.post(slug, signal));
  const version = post.data?.version ?? null;
  useDocumentMeta(version?.title ?? null, version?.summary ?? null);

  if (post.error !== undefined) {
    const failure = describeReadError(post.error);
    return <div className="reader-layout reader-layout-single"><ReaderState title={failure.title} message={failure.message} retry={failure.status === 404 || failure.status === 410 ? undefined : post.reload} /></div>;
  }
  if (!post.data || !version) {
    return <div className="reader-layout"><div className="article-reading" role="status" aria-live="polite" aria-label="Đang tải bài viết"><div className="learn-skeleton-lines" aria-hidden="true"><span /><span /><span /><span /></div></div></div>;
  }
  const date = formatPostDate(version.publishedAt);
  const firstSituation = version.situations[0]?.slug;

  return <LearnBookmarksProvider>
    <div className="reader-layout">
      <article className="article-reading">
        <nav className="reader-breadcrumb" aria-label="Đường dẫn">
          <Link href={routes.learn}>Khám phá Learn</Link><span aria-hidden="true">›</span><span aria-current="page">{kindLabel[version.kind]}</span>
        </nav>
        <ul className="learn-tags reader-chips" aria-label="Loại bài và tình huống">
          <li><span className="reader-kind-chip" data-kind={version.kind}>{kindLabel[version.kind]}</span></li>
          {version.situations.map((item) => <li key={item.id}><Link href={`${routes.learn}?situation=${encodeURIComponent(item.slug)}`}>{item.name}</Link></li>)}
        </ul>
        <h1>{version.title}</h1>
        <p className="lede">{version.summary}{" "}<span className="reader-published">{date ? `Xuất bản ${date} · ` : ""}phiên bản {version.versionNumber}</span></p>
        <div className="reader-content-card"><BlockRenderer blocks={version.blocks} fallbackSummary={version.summary} /></div>
      </article>
      <aside className="reader-rail" aria-label="Công cụ của bài viết">
        <ArticleActions postId={post.data.id} slug={post.data.slug} />
        {version.sources.length > 0 && <section className="reader-card learn-sources" aria-labelledby="learn-sources-heading">
          <h2 id="learn-sources-heading">Nguồn tham khảo</h2>
          <ul>{version.sources.map((source) => <li key={`${source.sourceId}-${source.role}`}><strong>{source.title}{source.versionLabel && <span> · {source.versionLabel}</span>}</strong><small>{roleLabel[source.role] ?? source.role}</small></li>)}</ul>
        </section>}
        <AskAboutArticle slug={post.data.slug} />
        <RelatedPosts currentId={post.data.id} situation={firstSituation} />
      </aside>
    </div>
  </LearnBookmarksProvider>;
}
