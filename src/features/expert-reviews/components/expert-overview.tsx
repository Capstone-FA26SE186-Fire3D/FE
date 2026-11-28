"use client";

import { ClipboardCheck, Inbox, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

import { describeApiError } from "@/api/describe-error";
import { useAsyncData } from "@/api/use-async-data";
import { ChartCard } from "@/components/charts/chart-card";
import { seriesColor } from "@/components/charts/chart-config";
import { Donut, GroupedBars } from "@/components/charts/lazy";
import { RankedBars } from "@/components/charts/ranked-bars";
import { formatDateTime } from "@/components/ops/detail-parts";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { LoadingBlock } from "@/components/ui/spinner";
import { routes } from "@/configs/routes";
import { ActionTile, SystemKpi } from "@/features/admin-overview/components/admin-overview";
import "@/features/admin-reviews/components/reviews.css";
import { useAuthSession } from "@/features/auth/auth-session";

import { expertReviewsApi, KIND_LABEL, reviewTitle, type ExpertReviewItem, type ExpertReviewStatus } from "../api";
import { decisionsByWeek, formatDuration, handlingBuckets, handlingMs, median, topOrganizations } from "../overview-stats";

/** The list endpoint caps a page at 100; five pages cover every decision so far with room to spare. */
const PAGE_SIZE = 100;
const MAX_PAGES = 5;

async function loadDecided(token: string, status: ExpertReviewStatus, signal: AbortSignal): Promise<{ items: ExpertReviewItem[]; total: number }> {
  const items: ExpertReviewItem[] = [];
  let total = 0;
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const result = await expertReviewsApi.list(token, { status, assignee: "all", page, pageSize: PAGE_SIZE }, signal);
    total = result.totalCount;
    items.push(...result.items);
    if (items.length >= total || result.items.length === 0) break;
  }
  return { items, total };
}

const percent = (part: number, whole: number) => `${((part / whole) * 100).toLocaleString("vi-VN", { maximumFractionDigits: 0 })}%`;

/**
 * `/expert/overview`: the dashboard of a Chuyên viên PCCC. Every number is read from `GET /api/expert/reviews` (the only list
 * the role has): waiting items of the caller and of the whole queue by `totalCount`, and the decided items (Approved +
 * Rejected, every expert) to count the caller's own decisions (`decidedBy`), per week, per kind, by handling time and by
 * organization. A read that fails shows an em dash, never a guessed 0.
 */
export function ExpertOverview() {
  const { accessToken, ready, user } = useAuthSession();
  const enabled = ready && user?.role === 3 && Boolean(accessToken);
  const token = accessToken as string;

  const mine = useAsyncData("expert-overview:mine", (signal) => expertReviewsApi.list(token, { status: "Submitted", assignee: "me", page: 1, pageSize: 5 }, signal), enabled);
  const queue = useAsyncData("expert-overview:queue", (signal) => expertReviewsApi.list(token, { status: "Submitted", assignee: "all", page: 1, pageSize: 1 }, signal), enabled);
  const decided = useAsyncData("expert-overview:decided", async (signal) => {
    const [approved, rejected] = await Promise.all([loadDecided(token, "Approved", signal), loadDecided(token, "Rejected", signal)]);
    return { items: [...approved.items, ...rejected.items], total: approved.total + rejected.total };
  }, enabled);

  const stats = useMemo(() => {
    if (!decided.data || !user) return null;
    const own = decided.data.items.filter((item) => item.decidedBy === user.id);
    const approved = own.filter((item) => item.status === "Approved").length;
    const times = own.map(handlingMs).filter((value): value is number => value !== null);
    const byKind = ["Scenario", "Infrastructure"].map((kind) => ({ key: kind, label: KIND_LABEL[kind], value: own.filter((item) => item.kind === kind).length }));
    return {
      own,
      approved,
      rejected: own.length - approved,
      median: median(times),
      weeks: decisionsByWeek(own, new Date()),
      buckets: handlingBuckets(own),
      byKind,
      organizations: topOrganizations([...own, ...(mine.data?.items ?? [])]),
    };
  }, [decided.data, mine.data, user]);

  if (!ready) return <LoadingBlock label="Đang kiểm tra phiên đăng nhập…" />;
  if (user?.role !== 3) return <Alert tone="danger" title="Không có quyền truy cập">Trang này dành cho Chuyên viên PCCC.</Alert>;

  const loadingDecided = decided.loading && !decided.data;
  const reload = () => { mine.reload(); queue.reload(); decided.reload(); };
  const oldest = mine.data?.items ?? [];
  const weeksEmpty = !stats || stats.weeks.every((row) => row.approved + row.rejected === 0);

  return <>
    <PageHeader eyebrow="Thẩm định" title="Tổng quan thẩm định"
      description="Việc đang chờ bạn và kết quả thẩm định bạn đã đưa ra. Số liệu lấy từ hàng chờ thẩm định, cập nhật mỗi lần mở trang."
      actions={<Button variant="quiet" onClick={reload} disabled={mine.loading || queue.loading || decided.loading}><RefreshCw size={16} aria-hidden="true" />{decided.loading ? "Đang tải…" : "Tải lại"}</Button>} />

    {decided.error !== undefined && !decided.data && <Alert tone="danger" title="Không tải được kết quả thẩm định" className="mb-4"
      action={<Button size="sm" variant="secondary" className="mt-3" onClick={decided.reload}>Thử lại</Button>}>{describeApiError(decided.error, "Hãy thử lại sau.")}</Alert>}

    <div className="adm-tiles" role="group" aria-label="Việc cần làm">
      <ActionTile testId="expert-tile-mine" href={routes.expertReviews} icon={ClipboardCheck} tone="warning" label="Đang chờ bạn" value={mine.data?.totalCount ?? null}
        loading={mine.loading && !mine.data} hint="mục giao cho bạn" />
      <ActionTile testId="expert-tile-queue" href={`${routes.expertReviews}?assignee=all`} icon={Inbox} tone="info" label="Cả hàng chờ" value={queue.data?.totalCount ?? null}
        loading={queue.loading && !queue.data} hint="của mọi Chuyên viên" />
    </div>

    <div className="adm-okpis" role="group" aria-label="Kết quả của bạn">
      <SystemKpi testId="expert-kpi-decided" label="Bạn đã thẩm định" value={stats ? stats.own.length : null} loading={loadingDecided} hint="Tổng số mục đã cho Đạt hoặc Chưa đạt" />
      <SystemKpi testId="expert-kpi-approved" label="Đạt" value={stats ? stats.approved : null} loading={loadingDecided} hint={stats && stats.own.length ? `${percent(stats.approved, stats.own.length)} số mục bạn đã thẩm định` : "Chưa có kết quả"} />
      <SystemKpi testId="expert-kpi-rejected" label="Chưa đạt" value={stats ? stats.rejected : null} loading={loadingDecided} hint={stats && stats.own.length ? `${percent(stats.rejected, stats.own.length)} số mục bạn đã thẩm định` : "Chưa có kết quả"} />
      <div className="ops-kpi" data-testid="expert-kpi-median" aria-busy={loadingDecided || undefined}>
        <span className="ops-kpi-label">Thời gian xử lý</span>
        <div className="ops-kpi-row"><strong className="ops-kpi-value">{stats?.median != null ? formatDuration(stats.median) : "—"}</strong></div>
        <span className="ops-kpi-hint">Trung vị, từ lúc nhận mục đến lúc ra kết quả</span>
      </div>
    </div>

    <div className="ops-grid ops-grid-2 mb-4">
      <ChartCard data-testid="expert-chart-weeks" title="Kết quả theo tuần" description="Số mục bạn cho Đạt và Chưa đạt trong 8 tuần gần nhất (tuần bắt đầu thứ Hai)" height={220}
        loading={loadingDecided} empty={weeksEmpty} emptyText="8 tuần gần nhất bạn chưa thẩm định mục nào"
        legend={[{ label: "Đạt", color: seriesColor.passed }, { label: "Chưa đạt", color: seriesColor.notPassed }]}>
        {stats && <GroupedBars data={stats.weeks} xKey="week" height={220} formatX={(week) => week} tooltipLabel={(week) => `Tuần từ ${week}`}
          series={[{ key: "approved", label: "Đạt", color: seriesColor.passed }, { key: "rejected", label: "Chưa đạt", color: seriesColor.notPassed }]} />}
      </ChartCard>
      <ChartCard data-testid="expert-chart-result" title="Tỉ lệ kết quả" description="Toàn bộ mục bạn đã thẩm định" height={180}
        loading={loadingDecided} empty={!stats || stats.own.length === 0} emptyText="Bạn chưa thẩm định mục nào">
        {stats && <Donut center={{ value: stats.own.length ? percent(stats.approved, stats.own.length) : "—", caption: "Đạt" }}
          slices={[{ key: "approved", label: "Đạt", value: stats.approved, color: seriesColor.passed }, { key: "rejected", label: "Chưa đạt", value: stats.rejected, color: seriesColor.notPassed }]} />}
      </ChartCard>
    </div>

    <div className="ops-grid ops-grid-2 mb-4">
      <ChartCard data-testid="expert-chart-time" title="Thời gian xử lý" description="Số mục theo thời gian từ lúc nhận đến lúc ra kết quả" height={200}
        loading={loadingDecided} empty={!stats || stats.own.length === 0} emptyText="Bạn chưa thẩm định mục nào">
        {stats && <GroupedBars data={stats.buckets} xKey="bucket" height={200} series={[{ key: "count", label: "Số mục", color: "var(--info)" }]} />}
      </ChartCard>
      <ChartCard data-testid="expert-chart-kind" title="Theo loại nội dung" description="Mục bạn đã thẩm định: tình huống và hạ tầng PCCC" height={180}
        loading={loadingDecided} empty={!stats || stats.own.length === 0} emptyText="Bạn chưa thẩm định mục nào">
        {stats && <Donut slices={stats.byKind.map((row, index) => ({ ...row, color: index === 0 ? "var(--ember)" : "var(--info)" }))} />}
      </ChartCard>
    </div>

    <div className="ops-grid ops-grid-2">
      <ChartCard data-testid="expert-chart-organizations" title="Tổ chức gửi tới bạn" description="Mục bạn đã thẩm định và đang chờ bạn, theo tổ chức (5 tổ chức nhiều nhất)" height={160}
        loading={loadingDecided} empty={!stats || stats.organizations.length === 0} emptyText="Chưa có mục nào giao cho bạn">
        {stats && <RankedBars label="Số mục theo tổ chức" rows={stats.organizations} />}
      </ChartCard>
      <ChartCard data-testid="expert-oldest" title="Chờ lâu nhất" description="Mục giao cho bạn, gửi sớm nhất ở trên" height={160}
        loading={mine.loading && !mine.data} empty={oldest.length === 0} emptyText="Không có mục nào đang chờ bạn">
        <ul className="ops-stack" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {oldest.map((item) => <li key={item.reviewId}>
            <Link href={routes.expertReview(item.reviewId)} className="ops-dt-link">{reviewTitle(item)}</Link>
            <div className="rev-cell-muted" style={{ whiteSpace: "normal", overflowWrap: "anywhere" }}>{KIND_LABEL[item.kind] ?? "Nội dung"} · {item.organizationName} · gửi {formatDateTime(item.submittedAt)}</div>
          </li>)}
        </ul>
      </ChartCard>
    </div>
  </>;
}
