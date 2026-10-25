"use client";

import { BookOpen, ChevronRight, ClipboardCheck, CreditCard, LifeBuoy, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useAsyncData } from "@/api/use-async-data";
import { seriesColor } from "@/components/charts/chart-config";
import { Sparkline } from "@/components/charts/sparkline";
import { NumberPop } from "@/components/ui/number-pop";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/configs/routes";
import { AnalyticsWorkspace } from "@/features/analytics/components/analytics-workspace";
import { analyticsApi } from "@/features/analytics/api";
import { formatMoney } from "@/features/analytics/format";
import type { OperationsReport } from "@/features/analytics/types";
import { useAuthSession } from "@/features/auth/auth-session";
import { learnAdminApi } from "@/features/admin-learn/api";
import { reviewsApi } from "@/features/admin-reviews/api";
import { billingApi } from "@/features/billing/api";
import { supportApi } from "@/features/support/api";
import { formatCount } from "../format";

const sum = (items: Array<{ count: number }>) => items.reduce((total, item) => total + item.count, 0);
/** Role order of the "Tài khoản" hint (Figma "Học viên 61 · Tổ chức 22 · Admin 1"). */
const roleOrder: Array<[role: string, label: string]> = [["Trainee", "Học viên"], ["OrganizationUser", "Tổ chức"], ["PlatformAdmin", "Quản trị FET3D"]];

/** One server total read with page size 1 (only `total`/`totalCount` is used). Null while unknown or when the read failed. */
function useTotal(key: string, load: (signal: AbortSignal) => Promise<number>, enabled: boolean) {
  const result = useAsyncData(key, load, enabled);
  return { value: result.data ?? null, loading: result.loading && result.data === undefined && result.error === undefined };
}

/** "—" with a title: the server value could not be read. Never a guessed 0. */
function Unavailable() {
  return <span className="adm-unavailable" title="Chưa lấy được từ máy chủ">—</span>;
}

/**
 * "Việc cần xử lý" tile (Figma Admin v2 · Tổng quan): icon tile, big number, hint and a chevron. The whole tile is the
 * link to the queue it counts.
 */
function ActionTile({ href, icon: Icon, tone, label, value, hint, loading, testId }: {
  href: string;
  icon: LucideIcon;
  tone: "warning" | "danger" | "success" | "info";
  label: string;
  value: number | null;
  hint: ReactNode;
  loading: boolean;
  testId: string;
}) {
  return <Link href={href} className="adm-tile" data-tone={tone} data-testid={testId} aria-busy={loading || undefined}>
    <span className="adm-tile-icon" aria-hidden="true"><Icon size={20} /></span>
    <span className="adm-tile-body">
      <span className="adm-tile-label">{label}</span>
      {loading
        ? <><Skeleton className="adm-tile-skeleton" /><span className="ops-sr-only" role="status">Đang tải {label}…</span></>
        : <strong className="adm-tile-value">{value === null ? <Unavailable /> : <NumberPop value={value} />}</strong>}
      <span className="adm-tile-hint">{hint}</span>
    </span>
    <ChevronRight size={16} aria-hidden="true" className="adm-tile-chevron" />
  </Link>;
}

/** System KPI tile on the chart kit's `.ops-kpi` (label, counted-up number, optional sparkline, hint). */
function SystemKpi({ label, value, hint, spark, sparkColor, loading, testId }: {
  label: string;
  value: number | null;
  hint?: ReactNode;
  spark?: number[];
  sparkColor?: string;
  loading: boolean;
  testId: string;
}) {
  const trend = spark && spark.length >= 2 ? spark : null;
  return <div className="ops-kpi" data-testid={testId} aria-busy={loading || undefined}>
    <span className="ops-kpi-label">{label}</span>
    <div className="ops-kpi-row">
      {loading
        ? <><Skeleton style={{ height: 30, width: 72 }} /><span className="ops-sr-only" role="status">Đang tải {label}…</span></>
        : <strong className="ops-kpi-value">{value === null ? <Unavailable /> : <NumberPop value={value} />}</strong>}
    </div>
    {trend && <Sparkline className="ops-kpi-spark" values={trend} height={36} color={sparkColor} />}
    {hint && <span className="ops-kpi-hint">{hint}</span>}
  </div>;
}

/**
 * Platform overview (Figma "Admin v2 · Tổng quan"): the four queues that need handling first, then system totals with
 * 30-day trends, then the period reports (operations / training / revenue charts). Every number comes from an admin
 * endpoint; a read that fails shows an em dash instead of a guess. The audit log is no longer here: it lives only in
 * "Hỗ trợ & audit".
 */
export function AdminOverview() {
  const { accessToken, ready, user } = useAuthSession();
  const enabled = ready && user?.role === 0 && Boolean(accessToken);
  const token = accessToken as string;

  const reviews = useTotal("overview:reviews", (signal) => reviewsApi.list(token, { status: "Submitted", page: 1, pageSize: 1 }, signal).then((page) => page.totalCount), enabled);
  const tickets = useTotal("overview:tickets-open", (signal) => supportApi.listTickets("admin", token, { status: "Open", page: 1, pageSize: 1 }, signal).then((page) => page.total), enabled);
  const urgent = useTotal("overview:tickets-urgent", (signal) => supportApi.listTickets("admin", token, { status: "Open", priority: "Urgent", page: 1, pageSize: 1 }, signal).then((page) => page.total), enabled);
  const reconcile = useTotal("overview:reconcile", (signal) => billingApi.listLedger(token, "checkouts", { status: "NeedsReconcile", page: 1, pageSize: 1 }, signal).then((page) => page.totalCount), enabled);
  const unpublished = useTotal("overview:learn-unpublished", (signal) => learnAdminApi.listPosts(token, { status: "Unpublished", page: 1, pageSize: 1 }, signal).then((page) => page.total), enabled);

  // The operations report is requested once, by the report section below, and shared here. The two trend tiles read the
  // default 30-day training report (daily cohorts) and the default 30-day revenue report (received payments by day).
  const [operations, setOperations] = useState<OperationsReport | null>(null);
  // Skeleton for a few seconds, then an em dash: the shared report has no error channel here (its own section shows the error).
  const [waited, setWaited] = useState(false);
  useEffect(() => { const timer = window.setTimeout(() => setWaited(true), 4000); return () => window.clearTimeout(timer); }, []);
  const training = useAsyncData("overview:training", (signal) => analyticsApi.training(token, { kind: "platform" }, {}, signal, { groupBy: "day" }), enabled);
  const revenue = useAsyncData("overview:revenue", (signal) => analyticsApi.revenue(token, {}, signal), enabled);

  const accounts = operations?.accounts ?? null;
  const organizations = operations?.organizations ?? null;
  const accountsTotal = accounts ? sum(accounts) : null;
  const organizationsTotal = organizations ? sum(organizations) : null;
  const organizationsActive = organizations ? sum(organizations.filter((item) => item.isActive)) : null;
  const accountsHint = accounts
    ? roleOrder.filter(([role]) => accounts.some((item) => item.role === role)).map(([role, label]) => `${label} ${formatCount(sum(accounts.filter((item) => item.role === role)))}`).join(" · ") || "Chưa có tài khoản"
    : undefined;
  const systemLoading = operations === null && !waited;

  const sessionsSpark = training.data?.cohorts?.map((row) => row.plays);
  const paymentsTotal = revenue.data ? revenue.data.totals.reduce((total, item) => total + item.transactions, 0) : null;
  const paymentsSpark = useMemo(() => {
    if (!revenue.data) return undefined;
    const byDate = new Map<string, number>();
    for (const day of revenue.data.byDay) byDate.set(day.date, (byDate.get(day.date) ?? 0) + day.transactions);
    return Array.from(byDate.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([, transactions]) => transactions);
  }, [revenue.data]);
  const paymentsHint = revenue.data
    ? revenue.data.totals.length ? `Đơn đã nhận tiền · ${revenue.data.totals.map((item) => formatMoney(item.amount, item.currency)).join(" · ")}` : "Đơn đã nhận tiền · chưa có khoản thu"
    : "Đơn đã nhận tiền";

  return <>
    <PageHeader
      eyebrow="Xử lý công việc"
      title="Tổng quan hệ thống"
      description="Việc cần xử lý ở trên cùng; nhật ký thao tác nằm ở trang Hỗ trợ & nhật ký."
      breadcrumbs={[{ label: "Quản trị" }, { label: "Tổng quan" }]}
    />

    <div className="adm-tiles" role="group" aria-label="Việc cần xử lý">
      <ActionTile testId="tile-reviews" href={routes.adminReviews} icon={ClipboardCheck} tone="warning" label="Duyệt kịch bản" value={reviews.value} loading={reviews.loading} hint="chờ duyệt" />
      <ActionTile testId="tile-support" href={routes.adminSupport} icon={LifeBuoy} tone="danger" label="Hỗ trợ" value={tickets.value} loading={tickets.loading} hint={urgent.value === null ? "yêu cầu đang mở" : `yêu cầu đang mở · ${formatCount(urgent.value)} khẩn`} />
      <ActionTile testId="tile-payments" href={`${routes.adminCommerce}?tab=payments`} icon={CreditCard} tone="success" label="Đối soát thanh toán" value={reconcile.value} loading={reconcile.loading} hint="cần đối soát" />
      <ActionTile testId="tile-learn" href={routes.adminLearn} icon={BookOpen} tone="info" label="Bài học chưa xuất bản" value={unpublished.value} loading={unpublished.loading} hint="bài nháp" />
    </div>

    <div className="adm-okpis" role="group" aria-label="Tổng quan hệ thống">
      <SystemKpi testId="kpi-organizations" label="Tổ chức" value={organizationsTotal} loading={systemLoading} hint={organizationsActive === null ? "Số liệu hiện tại" : `${formatCount(organizationsActive)} đang hoạt động`} />
      <SystemKpi testId="kpi-accounts" label="Tài khoản" value={accountsTotal} loading={systemLoading} hint={accountsHint ?? "Số liệu hiện tại"} />
      <SystemKpi testId="kpi-sessions" label="Lượt chơi 30 ngày" value={training.data?.plays ?? null} loading={training.loading && !training.data && training.error === undefined} spark={sessionsSpark} sparkColor={seriesColor.plays} hint="Toàn hệ thống" />
      <SystemKpi testId="kpi-payments" label="Thanh toán 30 ngày" value={paymentsTotal} loading={revenue.loading && !revenue.data && revenue.error === undefined} spark={paymentsSpark} sparkColor={seriesColor.revenue} hint={paymentsHint} />
    </div>

    <AnalyticsWorkspace
      variant="platform"
      sectionHeading
      title="Báo cáo theo kỳ"
      description="Vận hành, huấn luyện của học viên và doanh thu của toàn hệ thống FET3D."
      breadcrumbs={[]}
      onOperations={setOperations}
    />
  </>;
}
