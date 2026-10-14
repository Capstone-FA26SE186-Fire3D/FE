"use client";

import Link from "next/link";
import { useAsyncData } from "@/api/use-async-data";
import { Iconsax } from "@/components/ui/iconsax";
import { learnApi } from "../api";
import { httpsUrl } from "../safe-url";
import { formatPostDate } from "./post-card";
import "../learn.css";

/** "Đọc tiếp": other Published posts, preferring the same situation. Best effort: it renders nothing when it cannot load. */
export function RelatedPosts({ currentId, situation }: { currentId: string; situation?: string }) {
  const related = useAsyncData(`learn:related:${situation ?? ""}`, (signal) => learnApi.posts({ situation, page: 1, pageSize: 5 }, signal));
  const items = (related.data?.items ?? []).filter((item) => item.id !== currentId).slice(0, 4);
  if (!items.length) return null;
  return <aside className="reader-related" aria-labelledby="reader-related-heading">
    <h2 id="reader-related-heading">Đọc tiếp</h2>
    <ul>{items.map((item) => {
      const cover = httpsUrl(item.coverImageUrl);
      return <li key={item.id}>
        <Link className="reader-related-link" href={`/learn/${item.slug}`}>
          <span className="reader-related-cover">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {cover ? <img src={cover} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <Iconsax name="buildings" size={30} />}
          </span>
          <span className="reader-related-copy"><strong>{item.title}</strong><span>{formatPostDate(item.publishedAt)}</span></span>
        </Link>
      </li>;
    })}</ul>
    <Link className="reader-related-all" href="/learn">Xem thư viện Learn <span aria-hidden="true">↗</span></Link>
  </aside>;
}
