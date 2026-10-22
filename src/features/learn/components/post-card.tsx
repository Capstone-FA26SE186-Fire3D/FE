"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { httpsUrl } from "../safe-url";
import { KIND_ART, KIND_ART_SIZE } from "../kind-art";
import { kindLabel, type LearnKind } from "../types";
import "../learn.css";

export const formatPostDate = (value: string | null | undefined) => {
  if (!value) return "";
  const time = Date.parse(value);
  return Number.isNaN(time) ? "" : new Date(time).toLocaleDateString("vi-VN", { year: "numeric", month: "2-digit", day: "2-digit" });
};

/** Cover from the API (https only); without one (or when it fails to load) the art of the post kind, in a fixed 3:2 box. */
function Cover({ url, slug, title, kind }: { url: string | null; slug: string; title: string; kind: LearnKind }) {
  const [failed, setFailed] = useState(false);
  const safe = httpsUrl(url);
  return <Link className="learn-cover" href={`/learn/${slug}`} aria-label={`Đọc ${title}`}>
    {safe && !failed
      // eslint-disable-next-line @next/next/no-img-element
      ? <img src={safe} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      // eslint-disable-next-line @next/next/no-img-element
      : <img className="learn-cover-art" src={KIND_ART[kind]} alt="" aria-hidden="true" width={KIND_ART_SIZE.width} height={KIND_ART_SIZE.height} loading="lazy" decoding="async" />}
  </Link>;
}

/** One post in a Learn list. `action` is the bookmark control (or any per-row action). */
export function PostCard({ slug, title, summary, kind, coverImageUrl = null, publishedAt, action, note, readLink = false }: {
  slug: string; title: string; summary: string; kind: LearnKind; coverImageUrl?: string | null; publishedAt?: string | null; action?: ReactNode;
  /** Small line under the summary (for example when the post was saved). */
  note?: string;
  /** Adds an explicit "Đọc bài" link under the text. */
  readLink?: boolean;
}) {
  const date = formatPostDate(publishedAt);
  return <article className="learn-card">
    <Cover url={coverImageUrl} slug={slug} title={title} kind={kind} />
    <div className="learn-card-body">
      <div className="learn-card-meta"><span data-kind={kind}>{kindLabel[kind]}</span>{date && <small>{date}</small>}{action}</div>
      <Link href={`/learn/${slug}`}><h2>{title}</h2></Link>
      <p className="learn-excerpt">{summary}</p>
      {note && <p className="learn-card-note">{note}</p>}
      {readLink && <Link className="learn-card-read" href={`/learn/${slug}`} aria-label={`Đọc bài: ${title}`}>Đọc bài<ChevronRight size={16} aria-hidden="true" /></Link>}
    </div>
  </article>;
}
