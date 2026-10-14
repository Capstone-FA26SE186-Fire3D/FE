"use client";

import { RefreshCw } from "lucide-react";
import { useAsyncData } from "@/api/use-async-data";
import { useUrlParams } from "@/api/use-url-params";
import { Button } from "@/components/ui/button";
import { describeReadError, learnApi } from "../api";
import { LearnBookmarksProvider } from "./bookmarks-context";
import { LearnPagination } from "./learn-pagination";
import { PostCard } from "./post-card";
import { SavePostButton } from "./save-post-button";
import "../learn.css";

const PAGE_SIZE = 12;

function CardSkeletons() {
  return <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 learn-grid" role="status" aria-live="polite" aria-label="Đang tải bài viết">
    {Array.from({ length: 6 }, (_, index) => <div key={index} className="learn-card learn-skeleton" aria-hidden="true"><span /><span /><span /></div>)}
  </div>;
}

/**
 * Public Learn list. Filter and page live in the URL. The API filters by ONE situation and pages; free-text search,
 * several situations and kind filters are not offered because the API cannot do them yet (BE#79), and they are not faked on one page.
 */
export function LearnBrowser() {
  const { page, get, setParams, setPage } = useUrlParams({ pageSize: PAGE_SIZE });
  const situation = get("situation");
  const situations = useAsyncData("learn:situations", (signal) => learnApi.situations(signal));
  const posts = useAsyncData(`learn:posts:${situation}:${page}`, (signal) => learnApi.posts({ situation, page, pageSize: PAGE_SIZE }, signal));
  const failure = posts.error !== undefined ? describeReadError(posts.error) : null;
  // After a failed reload the previous page is stale: show the error, not old cards.
  const items = failure ? [] : posts.data?.items ?? [];
  const total = posts.data?.total ?? 0;
  const selected = situations.data?.find((item) => item.slug === situation);
  const pageBeyondEnd = !!posts.data && !failure && items.length === 0 && total > 0 && page > 1;

  return <LearnBookmarksProvider>
    <div className="learn-toolbar" role="group" aria-label="Lọc theo tình huống">
      <span className="learn-filter-label">Tình huống</span>
      <div className="learn-chips">
        <button type="button" className="learn-chip" aria-pressed={!situation} onClick={() => setParams({ situation: null })}>Tất cả</button>
        {situations.data?.map((item) => <button key={item.id} type="button" className="learn-chip" aria-pressed={item.slug === situation} onClick={() => setParams({ situation: item.slug })}>{item.name}</button>)}
        {situation && situations.data && !selected && <button type="button" className="learn-chip" aria-pressed>{situation}</button>}
      </div>
      {situations.error !== undefined && <span className="source-note" role="status">Không tải được danh sách tình huống. <button type="button" className="learn-inline-action" onClick={situations.reload}>Thử lại</button></span>}
    </div>
    <p className="source-note learn-search-note">Tìm theo từ khóa và lọc theo nhiều tình huống hoặc loại bài sẽ được bổ sung khi máy chủ hỗ trợ.</p>

    {failure && <div className="learn-state" role="alert">
      <h2>{failure.title}</h2><p>{failure.message}</p>
      <Button variant="secondary" onClick={posts.reload}><RefreshCw size={16} aria-hidden="true" />Thử lại</Button>
    </div>}

    {posts.loading && !posts.data && !failure && <CardSkeletons />}

    {items.length > 0 && <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 learn-grid" aria-busy={posts.loading}>
      {items.map((post) => <PostCard key={post.id} slug={post.slug} title={post.title} summary={post.summary} kind={post.kind} coverImageUrl={post.coverImageUrl} publishedAt={post.publishedAt} action={<SavePostButton postId={post.id} slug={post.slug} compact />} />)}
    </div>}

    {posts.data && !failure && items.length === 0 && !pageBeyondEnd && <div className="learn-state" role="status">
      <h2>{situation ? "Chưa có bài trong tình huống này" : "Chưa có bài nào được đăng"}</h2>
      <p>{situation ? `Chưa có bài công khai thuộc “${selected?.name ?? situation}”.` : "Khi có bài được xuất bản, chúng sẽ xuất hiện ở đây."}</p>
      {situation && <Button variant="secondary" onClick={() => setParams({ situation: null })}>Xem tất cả bài</Button>}
    </div>}
    {pageBeyondEnd && <div className="learn-state" role="status"><h2>Trang này không có bài</h2><p>Danh sách chỉ có {Math.ceil(total / PAGE_SIZE)} trang.</p><Button variant="secondary" onClick={() => setPage(1)}>Về trang đầu</Button></div>}

    <LearnPagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} disabled={posts.loading} />
  </LearnBookmarksProvider>;
}
