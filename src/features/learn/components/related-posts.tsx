"use client";

import { useAsyncData } from "@/api/use-async-data";
import { learnApi } from "../api";
import { PostCard } from "./post-card";
import "../learn.css";

/** "Bài liên quan": three other Published posts, preferring the same situation. Best effort: nothing renders when it cannot load. */
export function RelatedPosts({ currentId, situation }: { currentId: string; situation?: string }) {
  const related = useAsyncData(`learn:related:${situation ?? ""}`, (signal) => learnApi.posts({ situations: situation ? [situation] : undefined, page: 1, pageSize: 4 }, signal));
  const items = (related.data?.items ?? []).filter((item) => item.id !== currentId).slice(0, 3);
  if (!items.length) return null;
  return <section className="lv2-related" aria-labelledby="reader-related-heading">
    <h2 id="reader-related-heading" className="lv2-section-title">Bài liên quan</h2>
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((post) => <PostCard key={post.id} slug={post.slug} title={post.title} summary={post.summary} kind={post.kind} coverImageUrl={post.coverImageUrl} publishedAt={post.publishedAt} />)}
    </div>
  </section>;
}
