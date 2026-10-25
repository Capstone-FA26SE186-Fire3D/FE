"use client";

import Link from "next/link";
import { History, RefreshCw, SearchX } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { useAsyncData } from "@/api/use-async-data";
import { useUrlParams } from "@/api/use-url-params";
import { SupportCode } from "@/components/ui/support-code";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonRows } from "@/components/ui/skeleton";
import { Pagination } from "@/components/ui/table";
import { routes } from "@/configs/routes";
import { useMediaQuery } from "@/utils/use-media-query";
import { trainingHistoryApi } from "../api";
import { describeFailure } from "../errors";
import { PAGE_SIZE, hasFilters, rangeError, readFilters } from "../filters";
import { useHistoryBuildings } from "../hooks";
import type { HistoryItem } from "../types";
import "../history.css";
import { HistoryFilterBar } from "./history-filters";
import { HistoryRow, HistoryTable } from "./history-list";
import { ResultDrawer } from "./result-drawer";

/** While a listed session is still running or waiting for the device to sync, re-read the list this often (visible tab only). */
const LIVE_REFRESH_MS = 15_000;
const LIVE_STATUSES = new Set(["Launching", "Running", "AwaitingSync"]);

const FILTER_PARAM = { status: "status", mode: "mode", buildingId: "building", from: "from", to: "to" } as const;

/**
 * "Lịch sử" of a Trainee: the learner's own started sessions from `GET /api/training/sessions`, newest first. Filters,
 * page and the open detail (`?session=`) are all in the URL, so reload, Back/Forward and a shared deep link restore them.
 */
export function TrainingHistory({ accessToken, userId }: { accessToken: string; userId: string }) {
  const { page, get, setParams, setPage } = useUrlParams({ pageSize: PAGE_SIZE });
  const filters = readFilters(get);
  const invalidRange = rangeError(filters) !== undefined;
  const sessionParam = get("session");

  const key = `history:list:${filters.status}:${filters.mode}:${filters.buildingId}:${filters.from}:${filters.to}:${page}`;
  const list = useAsyncData(key, (signal) => trainingHistoryApi.list(accessToken, { ...filters, page, pageSize: PAGE_SIZE }, signal), !invalidRange, { scope: userId });
  const buildings = useHistoryBuildings(accessToken, userId);

  const rows = list.data?.items;
  const items = useMemo(() => (invalidRange ? [] : rows ?? []), [invalidRange, rows]);
  const totalCount = list.data?.totalCount ?? 0;
  const names = useMemo(() => new Map(items.map((item) => [item.building.id, item.building.name])), [items]);
  const known = sessionParam ? items.find((item) => item.sessionId.toLowerCase() === sessionParam.toLowerCase()) ?? null : null;

  const wide = useMediaQuery("(min-width: 1100px)");
  const opener = useRef<HTMLElement | null>(null);
  const openSession = (item: HistoryItem, from?: HTMLElement) => { opener.current = from ?? null; setParams({ session: item.sessionId, page }); };
  // The inline pane is not a modal: give focus back to the row that opened it (the drawer restores focus itself).
  const closeSession = () => { setParams({ session: null, page }); if (wide) window.setTimeout(() => opener.current?.focus(), 0); };
  const changeFilter = (patch: Partial<Record<keyof typeof FILTER_PARAM, string>>) =>
    setParams(Object.fromEntries(Object.entries(patch).map(([name, value]) => [FILTER_PARAM[name as keyof typeof FILTER_PARAM], value])));
  const clearFilters = () => setParams({ status: null, mode: null, building: null, from: null, to: null });

  // A session that is still running or waiting for sync will change on the server without any action here: keep the list
  // fresh (paused while the tab is hidden or the detail drawer is open) instead of asking the learner to press "Tải lại".
  const live = items.some((item) => LIVE_STATUSES.has(item.status));
  const { reload: reloadList } = list;
  useEffect(() => {
    if (!live || sessionParam) return;
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") reloadList(); }, LIVE_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [live, sessionParam, reloadList]);

  const failure = list.error !== undefined ? describeFailure(list.error, "list") : null;

  let body;
  if (invalidRange) {
    body = null; // the field shows the problem; no request is sent
  } else if (failure) {
    body = <Alert tone="danger" title={failure.title} action={failure.retryable ? <Button size="sm" variant="secondary" className="mt-3" onClick={list.reload}><RefreshCw size={16} aria-hidden="true" />Thử lại</Button> : undefined}>
      {failure.message}<SupportCode code={failure.code} />
    </Alert>;
  } else if (!list.data) {
    body = <SkeletonRows rows={4} label="Đang tải lịch sử lượt tập…" />;
  } else if (items.length === 0 && totalCount === 0 && !hasFilters(filters)) {
    body = <div data-testid="history-empty"><EmptyState
      icon={History}
      title="Bạn chưa có lượt tập nào"
      description="Lượt tập xuất hiện ở đây sau khi bạn bắt đầu một bài trên ứng dụng. Quét mã QR của công trình hoặc mở ứng dụng FET3D, chọn bài rồi bắt đầu. Kết quả được lưu theo tài khoản của bạn."
      action={<div className="ops-actions"><Link className={buttonVariants({ variant: "primary" })} href={routes.download}>Xem trang ứng dụng</Link><Link className={buttonVariants({ variant: "secondary" })} href={routes.learn}>Đọc bài học</Link></div>}
    /></div>;
  } else if (items.length === 0 && totalCount === 0) {
    body = <div data-testid="history-filtered-empty"><EmptyState
      icon={SearchX}
      title="Không có lượt tập nào khớp bộ lọc"
      description="Bạn vẫn có thể có lượt tập khác ngoài bộ lọc này. Thử đổi hoặc xóa bộ lọc."
      action={<Button variant="secondary" onClick={clearFilters}>Xóa bộ lọc</Button>}
    /></div>;
  } else if (items.length === 0) {
    body = <div data-testid="history-page-empty"><EmptyState icon={History} title="Trang này không có lượt tập" description="Số lượt tập đã thay đổi so với lần xem trước." action={<Button variant="secondary" onClick={() => setPage(1)}>Về trang đầu</Button>} /></div>;
  } else {
    body = <>
      <p className="th-summary" aria-live="polite">{totalCount.toLocaleString("vi-VN")} lượt tập, mới nhất trước.</p>
      <HistoryTable busy={list.loading}>
        {items.map((item) => <HistoryRow key={item.sessionId} item={item} stale={list.loading} selected={item.sessionId.toLowerCase() === sessionParam.toLowerCase()} onOpen={openSession} />)}
      </HistoryTable>
      <Pagination page={page} pageSize={PAGE_SIZE} totalCount={totalCount} onPageChange={setPage} disabled={list.loading} className="mt-4" />
    </>;
  }

  return <div className="ops-stack" data-testid="training-history">
    <HistoryFilterBar filters={filters} buildings={buildings} knownBuildingNames={names} onChange={changeFilter} onClear={clearFilters}
      actions={!invalidRange && <Button variant="quiet" onClick={list.reload} disabled={list.loading}><RefreshCw size={16} aria-hidden="true" />{list.loading ? "Đang tải…" : "Tải lại"}</Button>} />
    <div className="th-split" data-open={Boolean(sessionParam && wide) || undefined}>
      <div className="th-main">{body}</div>
      {sessionParam && <ResultDrawer inline={wide} sessionId={sessionParam} known={known} accessToken={accessToken} onClose={closeSession} onRefresh={list.reload} />}
    </div>
    <p className="th-foot th-note">Danh sách lượt tập của riêng bạn. Trạng thái phiên cho biết lượt tập đang ở đâu; kết quả là điểm hoặc đánh giá đã được lưu. Hoàn thành lượt tập không có nghĩa là đạt. Kết quả mô phỏng không phải chứng nhận.</p>
  </div>;
}
