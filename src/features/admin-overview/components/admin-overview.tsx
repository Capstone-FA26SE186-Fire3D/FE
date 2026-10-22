"use client";

import { BookOpen, ClipboardCheck, CreditCard, LifeBuoy } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAsyncData } from "@/api/use-async-data";
import { Panel } from "@/components/ui/panel";
import { StatusBadge, type Tone } from "@/components/ui/status-badge";
import { PageHeader } from "@/components/ui/page-header";
import { routes } from "@/configs/routes";
import { AnalyticsWorkspace } from "@/features/analytics/components/analytics-workspace";
import { analyticsApi } from "@/features/analytics/api";
import type { OperationsReport } from "@/features/analytics/types";
import { useAuthSession } from "@/features/auth/auth-session";
import { learnAdminApi } from "@/features/admin-learn/api";
import { reviewsApi } from "@/features/admin-reviews/api";
import { billingApi } from "@/features/billing/api";
import { supportApi } from "@/features/support/api";
import { formatCount } from "../format";
import { KpiRow, KpiTile } from "./admin-kit";

const sum = (items: Array<{ count: number }>) => items.reduce((total, item) => total + item.count, 0);

/** One server total read with page size 1 (only `total`/`totalCount` is used). Null while unknown or when the read failed. */
function useTotal(key: string, load: (signal: AbortSignal) => Promise<number>, enabled: boolean) {
  const result = useAsyncData(key, load, enabled);
  return { value: result.data ?? null, loading: result.loading && result.data === undefined && result.error === undefined };
}

const kindLabel: Record<string, string> = { IfcProcessing: "Tác vụ IFC", PackageBuild: "Tác vụ build package" };

/** Failed beats running beats idle; the counts are the jobs created in the selected report period (default 30 days). */
function jobSummary(jobs: OperationsReport["processingJobs"], kind: string): { tone: Tone; label: string } {
  const own = jobs.filter((job) => job.kind === kind);
  const failed = sum(own.filter((job) => /fail|error|dead/i.test(job.status)));
  const running = sum(own.filter((job) => /run|process|claim|queue/i.test(job.status)));
  if (failed > 0) return { tone: "danger", label: `Thất bại ${formatCount(failed)}` };
  if (running > 0) return { tone: "warning", label: `Đang chạy ${formatCount(running)}` };
  return { tone: "success", label: "Bình thường" };
}

/**
 * Platform overview (Figma "Tổng quan"): what needs handling first (review queue, support, reconcile, unpublished Learn),
 * system totals, recent audit and job health, then the period reports. Every number comes from an admin endpoint; a read
 * that fails shows an em dash instead of a guess. The three ranges below it are the existing analytics reports.
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

  // The operations report is requested once, by the period section below, and shared here; the sessions tile reads the default
  // 30-day training report. Revenue is only requested when its tab opens (payments here come from the payment ledger).
  const [operations, setOperations] = useState<OperationsReport | null>(null);
  // Skeleton for a few seconds, then an em dash: the shared report has no error channel here (its own section shows the error).
  const [waited, setWaited] = useState(false);
  useEffect(() => { const timer = window.setTimeout(() => setWaited(true), 4000); return () => window.clearTimeout(timer); }, []);
  const training = useAsyncData("overview:training", (signal) => analyticsApi.training(token, { kind: "platform" }, {}, signal), enabled);
  const since = useMemo(() => new Date(Date.now() - 30 * 86_400_000).toISOString(), []);
  const paid = useTotal("overview:paid30", (signal) => billingApi.listLedger(token, "requests", { status: "Paid", from: since, page: 1, pageSize: 1 }, signal).then((page) => page.totalCount), enabled);
  const audit = useAsyncData("overview:audit", (signal) => supportApi.listAuditLogs(token, { page: 1, pageSize: 4 }, signal), enabled);

  const accounts = operations?.accounts ?? null;
  const organizations = operations?.organizations ?? null;
  const accountsTotal = accounts ? sum(accounts) : null;
  const organizationsTotal = organizations ? sum(organizations) : null;
  const organizationsActive = organizations ? sum(organizations.filter((item) => item.isActive)) : null;
  const traineeCount = accounts ? sum(accounts.filter((item) => item.role === "Trainee")) : null;
  const orgUserCount = accounts ? sum(accounts.filter((item) => item.role === "OrganizationUser")) : null;
  const jobs = operations?.processingJobs ?? [];
  const jobKinds = Array.from(new Set(jobs.map((job) => job.kind)));
  const auditItems = audit.data?.items ?? [];
  const timeOf = (iso: string) => new Date(iso).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const needs = (value: number | null) => (value !== null && value > 0 ? { label: "Cần xử lý", tone: "warning" as Tone } : undefined);

  return <>
    <PageHeader
      eyebrow="Xử lý công việc"
      title="Tổng quan vận hành"
      description="Việc cần xử lý đặt trước số liệu. Mọi con số lấy từ máy chủ, không suy ra từ một trang dữ liệu."
      breadcrumbs={[{ label: "Quản trị" }, { label: "Tổng quan" }]}
    />

    <KpiRow label="Việc cần xử lý">
      <KpiTile icon={ClipboardCheck} label="Duyệt kịch bản" badge={needs(reviews.value)} value={formatCount(reviews.value)} loading={reviews.loading} hint="đang chờ duyệt" href={routes.adminReviews} linkLabel="Mở hàng đợi" />
      <KpiTile icon={LifeBuoy} label="Hỗ trợ" badge={urgent.value ? { label: "Cần xử lý", tone: "danger" } : needs(tickets.value)} value={formatCount(tickets.value)} loading={tickets.loading} hint={urgent.value === null ? "đang mở" : `đang mở · ${formatCount(urgent.value)} khẩn`} href={routes.adminSupport} linkLabel="Mở hỗ trợ" />
      <KpiTile icon={CreditCard} label="Đối soát thanh toán" badge={needs(reconcile.value)} value={formatCount(reconcile.value)} loading={reconcile.loading} hint="checkout cần đối soát" href={routes.adminCommerce} linkLabel="Mở thương mại" />
      <KpiTile icon={BookOpen} label="Learn chưa xuất bản" badge={unpublished.value ? { label: "Cần xử lý", tone: "info" } : undefined} value={formatCount(unpublished.value)} loading={unpublished.loading} hint="bài chưa xuất bản" href={`${routes.adminLearn}?status=Unpublished`} linkLabel="Mở Learn CMS" />
    </KpiRow>

    <KpiRow label="Tổng quan hệ thống">
      <KpiTile label="Tổ chức" value={formatCount(organizationsTotal)} loading={operations === null && !waited} hint={organizationsActive === null ? undefined : `Đang hoạt động ${formatCount(organizationsActive)}`} />
      <KpiTile label="Tài khoản" value={formatCount(accountsTotal)} loading={operations === null && !waited} hint={traineeCount === null || orgUserCount === null ? undefined : `Học viên ${formatCount(traineeCount)} · Tổ chức ${formatCount(orgUserCount)}`} />
      <KpiTile label="Phiên 30 ngày" value={formatCount(training.data?.plays)} loading={training.loading && !training.data} hint="Toàn hệ thống" />
      <KpiTile label="Thanh toán 30 ngày" value={formatCount(paid.value)} loading={paid.loading} hint="giao dịch đã nhận tiền" />
    </KpiRow>

    <div className="adm-split" style={{ marginBottom: 8 }}>
      <Panel title="Hoạt động gần đây">
        {audit.loading && !audit.data && <p className="ops-muted" role="status">Đang tải hoạt động…</p>}
        {audit.error !== undefined && !audit.data && <p className="ops-muted" role="status">Không tải được nhật ký hoạt động.</p>}
        {audit.data && !auditItems.length && <p className="ops-muted" role="status">Chưa có hoạt động nào trong 30 ngày gần đây.</p>}
        {auditItems.length > 0 && <ul className="adm-list">
          {auditItems.map((log) => <li key={log.id}>
            <span className="adm-list-main"><time dateTime={log.createdAt}>{timeOf(log.createdAt)}</time><span>{log.actorDisplayName ?? log.organizationName ?? "—"} · {log.action}{log.targetEntity ? ` (${log.targetEntity})` : ""}</span></span>
            {log.organizationName && <StatusBadge tone="neutral">{log.organizationName}</StatusBadge>}
          </li>)}
        </ul>}
      </Panel>
      <Panel title="Tác vụ xử lý (kỳ báo cáo)">
        {operations === null && <p className="ops-muted" role="status">{waited ? "Chưa có báo cáo tác vụ (xem thông báo lỗi ở phần báo cáo theo kỳ)." : "Đang tải tác vụ…"}</p>}
        {operations !== null && !jobKinds.length && <p className="ops-muted" role="status">Không có tác vụ nào trong kỳ báo cáo.</p>}
        {jobKinds.length > 0 && <ul className="adm-list">
          {jobKinds.map((kind) => { const summary = jobSummary(jobs, kind); return <li key={kind}><span>{kindLabel[kind] ?? kind}</span><StatusBadge tone={summary.tone}>{summary.label}</StatusBadge></li>; })}
        </ul>}
      </Panel>
    </div>

    <div style={{ marginTop: 28 }}>
      <AnalyticsWorkspace
        variant="platform"
        sectionHeading
        title="Báo cáo theo kỳ"
        description="Vận hành, huấn luyện của học viên và doanh thu toàn hệ thống lấy trực tiếp từ Fire3D API."
        breadcrumbs={[]}
        onOperations={setOperations}
      />
    </div>
  </>;
}
