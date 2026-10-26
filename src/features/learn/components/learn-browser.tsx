"use client";

import { RefreshCw } from "lucide-react";
import { useCallback } from "react";
import { useAsyncData } from "@/api/use-async-data";
import { SupportCode } from "@/components/ui/support-code";
import { Button } from "@/components/ui/button";
import { describeFilterError, describeReadError, learnApi } from "../api";
import { hasLearnFilters, learnQueryKey, type LearnFilterField } from "../query";
import { useLearnQuery } from "../use-learn-query";
import { LearnBookmarksProvider } from "./bookmarks-context";
import { LearnActiveFilters, LearnFilterPanel } from "./learn-filters";
import { LearnPagination } from "./learn-pagination";
import { LearnSearchBox } from "./learn-search-box";
import { FeaturedPosts } from "./featured-posts";
import { PostCard } from "./post-card";
import { SavePostButton } from "./save-post-button";
import "../learn.css";

const PAGE_SIZE = 12;
/**
 * Posts in the "Mới đăng" list beside the featured one (first page, no filter). 1 + 5 leaves 6 for the grid, so its rows are full
 * at 3 and at 2 columns, like the 12 of every other page: no half-empty row before "Sau".
 */
const RECENT = 5;

function CardSkeletons() {
  return <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 learn-grid" role="status" aria-live="polite" aria-label="Đang tải bài viết">
    {Array.from({ length: 6 }, (_, index) => <div key={index} className="learn-card learn-skeleton" aria-hidden="true"><span /><span /><span /></div>)}
  </div>;
}

/**
 * Public Learn list. Search, kind, situation and page live in the URL and are answered by the API (`GET /api/learn/posts`), which filters
 * before paging and returns the exact total; nothing is filtered in the browser. A newer query aborts the older request, so a late answer
 * never replaces what the reader asked for last.
 */
export function LearnBrowser() {
  const { query, update } = useLearnQuery();
  const situations = useAsyncData("learn:situations", (signal) => learnApi.situations(signal));
  const posts = useAsyncData(learnQueryKey(query, PAGE_SIZE), (signal) => learnApi.posts({ search: query.search, situations: query.situations, kinds: query.kinds, page: query.page, pageSize: PAGE_SIZE }, signal));
  const filtered = hasLearnFilters(query);
  const rejected = posts.error !== undefined ? describeFilterError(posts.error) : null;
  const failure = posts.error !== undefined && !rejected ? describeReadError(posts.error) : null;
  const broken = rejected !== null || failure !== null;
  // After a failed reload the previous page is stale: show the error, not old cards.
  const items = broken ? [] : posts.data?.items ?? [];
  const total = posts.data?.total ?? 0;
  const pageBeyondEnd = !!posts.data && !posts.loading && !broken && items.length === 0 && total > 0 && query.page > 1;
  const noMatch = !!posts.data && !posts.loading && !broken && items.length === 0 && !pageBeyondEnd;
  // The unfiltered first page opens with the newest post large and the next ones in a side list; the grid gets the rest.
  const hero = !filtered && query.page === 1 && items.length >= 2;
  const gridItems = hero ? items.slice(1 + RECENT) : items;

  const commitSearch = useCallback((search: string, mode: "push" | "replace") => update({ search }, mode), [update]);
  const clearAll = () => update({ search: "", kinds: [], situations: [] });
  const resetRejected = () => {
    const fields = new Set<LearnFilterField>(rejected?.fields.length ? rejected.fields : ["search", "situation", "kind"]);
    update({ ...(fields.has("search") ? { search: "" } : {}), ...(fields.has("kind") ? { kinds: [] } : {}), ...(fields.has("situation") ? { situations: [] } : {}), page: 1 });
  };

  return <LearnBookmarksProvider>
    <LearnSearchBox value={query.search} onCommit={commitSearch} />
    <LearnFilterPanel selection={query} situations={situations.data} situationsFailed={situations.error !== undefined} onRetrySituations={situations.reload} onChange={(patch) => update(patch)} />
    <LearnActiveFilters selection={query} situations={situations.data} onChange={(patch) => update(patch)} onClear={clearAll} />

    {!broken && <p className="learn-result-count" role="status" aria-live="polite">
      {posts.loading ? "Đang cập nhật kết quả…" : posts.data ? (filtered ? `${total} bài khớp bộ lọc` : `${total} bài`) : ""}
    </p>}

    {rejected && <div className="learn-state" role="alert">
      <h2>Bộ lọc không hợp lệ</h2>
      <p>{rejected.messages.length ? rejected.messages.join(" ") : "Đường dẫn có một bộ lọc không hợp lệ."}</p>
      <SupportCode code={rejected.code} />
      <Button variant="secondary" onClick={resetRejected}>{rejected.fields.length ? "Đặt lại tham số lỗi" : "Đặt lại bộ lọc"}</Button>
    </div>}

    {failure && <div className="learn-state" role="alert">
      <h2>{failure.title}</h2><p>{failure.message}</p>
      <Button variant="secondary" onClick={posts.reload}><RefreshCw size={16} aria-hidden="true" />Thử lại</Button>
    </div>}

    {posts.loading && !posts.data && !broken && <CardSkeletons />}

    {hero && <FeaturedPosts featured={items[0]} recent={items.slice(1, 1 + RECENT)} action={(post) => <SavePostButton postId={post.id} slug={post.slug} />} />}
    {hero && gridItems.length > 0 && <h2 className="lv2-section-title">Tất cả bài học</h2>}
    {gridItems.length > 0 && <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 learn-grid" aria-busy={posts.loading}>
      {gridItems.map((post) => <PostCard key={post.id} slug={post.slug} title={post.title} summary={post.summary} kind={post.kind} coverImageUrl={post.coverImageUrl} publishedAt={post.publishedAt} action={<SavePostButton postId={post.id} slug={post.slug} compact />} />)}
    </div>}

    {noMatch && !filtered && <div className="learn-state" role="status">
      <h2>Chưa có bài nào được đăng</h2>
      <p>Khi có bài được xuất bản, chúng sẽ xuất hiện ở đây.</p>
    </div>}
    {noMatch && filtered && <div className="learn-state" role="status">
      <h2>Không có bài khớp bộ lọc</h2>
      <p>Từ khóa được tìm nguyên cụm trong tiêu đề và mô tả, nên một từ ngắn hơn thường cho nhiều kết quả hơn. Chọn nhiều loại hoặc nhiều tình huống sẽ mở rộng kết quả; kết hợp từ khóa, loại và tình huống sẽ thu hẹp lại.</p>
      <Button variant="secondary" onClick={clearAll}>Xóa bộ lọc</Button>
    </div>}
    {pageBeyondEnd && <div className="learn-state" role="status"><h2>Trang này không có bài</h2><p>Kết quả chỉ có {Math.ceil(total / PAGE_SIZE)} trang.</p><Button variant="secondary" onClick={() => update({ page: 1 })}>Về trang đầu</Button></div>}

    {!broken && <LearnPagination page={query.page} pageSize={PAGE_SIZE} total={total} onPageChange={(page) => update({ page })} disabled={posts.loading} />}
  </LearnBookmarksProvider>;
}
