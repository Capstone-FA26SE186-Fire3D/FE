"use client";

import Link from "next/link";
import { Bookmark, BookmarkMinus, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useAsyncData } from "@/api/use-async-data";
import { useUrlParams } from "@/api/use-url-params";
import { ApiError } from "@/api/types/common";
import { Button, buttonVariants } from "@/components/ui/button";
import { useAuthSession } from "@/features/auth/auth-session";
import { learnApi } from "@/features/learn/api";
import { LearnPagination } from "@/features/learn/components/learn-pagination";
import { PostCard, formatPostDate } from "@/features/learn/components/post-card";
import "@/features/learn/learn.css";
import { StateCard } from "./state-card";
import { savedAgo } from "./overview";

const PAGE_SIZE = 12;

function failureText(error: unknown): { title: string; message: string } {
  if (error instanceof ApiError && error.status === 403) return { title: "Bài đã lưu dành cho tài khoản học viên", message: "Tài khoản hiện tại không có danh sách bài đã lưu." };
  if (error instanceof ApiError && error.status === 401) return { title: "Phiên đăng nhập đã hết hạn", message: "Hãy đăng nhập lại để xem bài đã lưu." };
  if (error instanceof ApiError && error.isRateLimited) return { title: "Máy chủ đang bận", message: error.retryAfterSeconds ? `Thử lại sau ${error.retryAfterSeconds} giây.` : "Thử lại sau ít phút." };
  return { title: "Không tải được bài đã lưu", message: "Hãy kiểm tra kết nối rồi thử lại." };
}

/**
 * "Bài đã lưu" from the real bookmark list (server truth, paged). A bookmark whose post is no longer public comes back as
 * `available: false` without title or summary: it stays listed so the user can remove it.
 */
export function SavedPosts() {
  const { accessToken } = useAuthSession();
  const { page, setPage } = useUrlParams({ pageSize: PAGE_SIZE });
  const list = useAsyncData(`hub:saved:${page}`, (signal) => learnApi.bookmarks(accessToken ?? "", { page, pageSize: PAGE_SIZE }, signal), !!accessToken);
  const [removing, setRemoving] = useState<ReadonlySet<string>>(new Set());
  const [removeError, setRemoveError] = useState("");

  const remove = async (postId: string) => {
    if (!accessToken || removing.has(postId)) return;
    setRemoveError("");
    setRemoving((current) => new Set(current).add(postId));
    try {
      await learnApi.unbookmark(accessToken, postId);
      // The last row of a later page just left: step back instead of showing an empty page.
      if (page > 1 && (list.data?.items.length ?? 0) <= 1) setPage(page - 1); else list.reload();
    } catch {
      setRemoveError("Chưa bỏ lưu được. Hãy thử lại.");
    } finally {
      setRemoving((current) => { const next = new Set(current); next.delete(postId); return next; });
    }
  };

  if (list.error !== undefined) {
    const failure = failureText(list.error);
    return <StateCard icon={Bookmark} tone="danger" role="alert" kicker="Bài đã lưu · lỗi tải" title={failure.title} actions={<Button variant="secondary" onClick={list.reload}><RefreshCw size={16} aria-hidden="true" />Thử lại</Button>}>{failure.message}</StateCard>;
  }
  if (!list.data) {
    return <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 learn-grid" role="status" aria-live="polite" aria-label="Đang tải bài đã lưu">{Array.from({ length: 3 }, (_, index) => <div key={index} className="learn-card learn-skeleton" aria-hidden="true"><span /><span /><span /></div>)}</div>;
  }
  const { items, total } = list.data;
  if (items.length === 0 && total === 0) {
    return <StateCard icon={Bookmark} kicker="Bài đã lưu · chưa có bài" title="Bạn chưa lưu bài nào" actions={<Link className={buttonVariants({ variant: "primary" })} href="/learn">Khám phá Learn</Link>}>Mở Khám phá Learn, bấm Lưu trên bài bạn muốn đọc lại.</StateCard>;
  }
  if (items.length === 0) {
    return <div className="learn-state" role="status"><h2>Trang này không có bài</h2><Button variant="secondary" onClick={() => setPage(1)}>Về trang đầu</Button></div>;
  }

  return <>
    <p className="saved-posts-note">Danh sách lưu theo tài khoản của bạn trên máy chủ. Bài không còn công khai vẫn nằm ở đây cho tới khi bạn bỏ lưu.</p>
    {removeError && <p role="alert" className="saved-posts-note">{removeError}</p>}
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 learn-grid" aria-busy={list.loading}>
      {items.map((item) => item.available
        ? <PostCard key={item.postId} slug={item.slug} title={item.title} summary={item.summary} kind={item.kind} note={savedAgo(item.bookmarkedAt)} readLink action={
          <Button variant="secondary" size="md" className="ml-auto" disabled={removing.has(item.postId)} aria-label={`Bỏ lưu bài viết: ${item.title}`} onClick={() => void remove(item.postId)}><BookmarkMinus size={16} aria-hidden="true" /></Button>} />
        : <article key={item.postId} className="learn-card-unavailable" data-testid="saved-unavailable">
          <h2>Bài này không còn hiển thị</h2>
          <p>Bài đã bị ẩn hoặc gỡ khỏi trang công khai nên chưa thể đọc. Bạn đã lưu lúc {formatPostDate(item.bookmarkedAt) || "—"}. Nếu bài hiện lại, nó sẽ trở về đúng chỗ này.</p>
          <div className="learn-card-actions"><Button variant="secondary" disabled={removing.has(item.postId)} aria-label="Bỏ lưu bài không còn hiển thị" onClick={() => void remove(item.postId)}>{removing.has(item.postId) ? "Đang bỏ lưu…" : "Bỏ lưu"}</Button></div>
        </article>)}
    </div>
    <LearnPagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} disabled={list.loading} />
  </>;
}
