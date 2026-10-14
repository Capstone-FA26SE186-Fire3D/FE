"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Iconsax } from "@/components/ui/iconsax";
import { httpsUrl } from "../safe-url";
import { kindLabel, type LearnKind } from "../types";
import "../learn.css";

export const formatPostDate = (value: string | null | undefined) => {
  if (!value) return "";
  const time = Date.parse(value);
  return Number.isNaN(time) ? "" : new Date(time).toLocaleDateString("vi-VN", { year: "numeric", month: "2-digit", day: "2-digit" });
};

/** Cover from the API (https only) with a neutral placeholder when it is missing or fails to load. */
function Cover({ url, slug, title }: { url: string | null; slug: string; title: string }) {
  const [failed, setFailed] = useState(false);
  const safe = httpsUrl(url);
  return <Link className="learn-cover" href={`/learn/${slug}`} aria-label={`Đọc ${title}`}>
    {safe && !failed
      // eslint-disable-next-line @next/next/no-img-element
      ? <img src={safe} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      : <div className="learn-cover-placeholder"><Iconsax name="buildings" size={64} /><span>FET3D / LEARN</span></div>}
  </Link>;
}

/** One post in a Learn list. `action` is the bookmark control (or any per-row action). */
export function PostCard({ slug, title, summary, kind, coverImageUrl = null, publishedAt, action }: {
  slug: string; title: string; summary: string; kind: LearnKind; coverImageUrl?: string | null; publishedAt?: string | null; action?: ReactNode;
}) {
  const date = formatPostDate(publishedAt);
  return <article className="learn-card">
    <Cover url={coverImageUrl} slug={slug} title={title} />
    <div className="learn-card-body">
      <div className="learn-card-meta"><span>{kindLabel[kind]}</span>{date && <small>{date}</small>}{action}</div>
      <Link href={`/learn/${slug}`}><h2>{title}</h2></Link>
      <p className="learn-excerpt">{summary}</p>
    </div>
  </article>;
}
