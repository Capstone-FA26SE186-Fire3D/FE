"use client";

import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useAsyncData } from "@/api/use-async-data";
import { Button } from "@/components/ui/button";
import { routes } from "@/configs/routes";
import { describeReadError, learnApi } from "../api";
import { outlineOf, parseBlocks, readingMinutes } from "../blocks";
import { KIND_ART, KIND_ART_SIZE } from "../kind-art";
import { httpsUrl } from "../safe-url";
import { BlockRenderer } from "./block-renderer";
import { LearnBookmarksProvider } from "./bookmarks-context";
import { AskAboutArticle, LearnAiScope } from "./learn-ai";
import { formatPostDate } from "./post-card";
import { RelatedPosts } from "./related-posts";
import { SavePostButton } from "./save-post-button";
import { kindLabel, type LearnKind } from "../types";
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
      <Button asChild variant="quiet"><Link href={routes.learn}>Xem thư viện bài học</Link></Button>
    </div>
  </div>;
}

/** Wide cover: the post's https image, or the art of its kind when it has none or the image fails to load. */
function ReaderCover({ url, kind }: { url: string | null; kind: LearnKind }) {
  const [failed, setFailed] = useState(false);
  const safe = httpsUrl(url);
  return <div className="lv2-reader-cover">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {safe && !failed ? <img src={safe} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      // eslint-disable-next-line @next/next/no-img-element
      : <img className="learn-cover-art" src={KIND_ART[kind]} alt="" aria-hidden="true" width={KIND_ART_SIZE.width} height={KIND_ART_SIZE.height} decoding="async" />}
  </div>;
}

/**
 * Public article page (Figma "Bài học v2 · Đọc bài"): one `GET /api/learn/posts/{slug}`; only a Published post is ever readable.
 * Title, summary and meta over a wide cover; the body beside a sticky rail (contents, sources, the AI hint); related posts below.
 * A Trainee asks about the article in the floating Trợ lý AI, with the article as context.
 */
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
  const { blocks } = parseBlocks(version.blocks);
  const outline = outlineOf(blocks);
  const minutes = readingMinutes(blocks, version.summary);

  return <LearnBookmarksProvider><LearnAiScope>
    <article className="lv2-reader">
      <header className="lv2-reader-head">
        <nav className="reader-breadcrumb" aria-label="Đường dẫn">
          <Link href={routes.learn}>Khám phá bài học</Link><span aria-hidden="true">›</span><span aria-current="page">{kindLabel[version.kind]}</span>
        </nav>
        <ul className="learn-tags reader-chips" aria-label="Loại bài và tình huống">
          <li><span className="lv2-kind" data-kind={version.kind}>{kindLabel[version.kind]}</span></li>
          {version.situations.map((item) => <li key={item.id}><Link href={`${routes.learn}?situation=${encodeURIComponent(item.slug)}`}>{item.name}</Link></li>)}
        </ul>
        <h1>{version.title}</h1>
        {version.summary && <p className="lede">{version.summary}</p>}
        <div className="lv2-reader-meta">
          <span className="reader-published">{date ? `Xuất bản ${date} · ` : ""}{minutes} phút đọc</span>
          <SavePostButton postId={post.data.id} slug={post.data.slug} />
          <AskAboutArticle slug={post.data.slug} />
        </div>
      </header>
      <ReaderCover url={version.coverImageUrl} kind={version.kind} />
      <div className="lv2-reader-body">
        <div className="article-reading"><BlockRenderer blocks={version.blocks} fallbackSummary={version.summary} /></div>
        <aside className="lv2-reader-rail" aria-label="Công cụ của bài viết">
          {outline.length > 1 && <nav className="lv2-rail-card lv2-outline" aria-labelledby="lv2-outline-heading">
            <h2 id="lv2-outline-heading">Trong bài này</h2>
            <ol>{outline.map((item) => <li key={item.id}><a href={`#${item.id}`}>{item.text}</a></li>)}</ol>
          </nav>}
          {version.sources.length > 0 && <section className="lv2-rail-card learn-sources" aria-labelledby="learn-sources-heading">
            <h2 id="learn-sources-heading">Nguồn tham khảo</h2>
            <ul>{version.sources.map((source) => <li key={`${source.sourceId}-${source.role}`}><strong>{source.title}{source.versionLabel && <span> · {source.versionLabel}</span>}</strong><small>{roleLabel[source.role] ?? "Tham khảo"}</small></li>)}</ul>
          </section>}
          <section className="lv2-rail-card lv2-ai-hint" aria-labelledby="lv2-ai-heading">
            <h2 id="lv2-ai-heading">Có câu hỏi về bài này?</h2>
            <p>Mở Trợ lý AI ở góc màn hình: câu hỏi tự gắn với bài đang đọc. Câu trả lời chỉ để tham khảo, không thay chỉ dẫn khi có sự cố thật. Cần tài khoản học viên.</p>
          </section>
        </aside>
      </div>
      <RelatedPosts currentId={post.data.id} situation={firstSituation} />
    </article>
  </LearnAiScope></LearnBookmarksProvider>;
}
