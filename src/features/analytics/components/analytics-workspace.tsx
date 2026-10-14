"use client";

import { RefreshCw } from "lucide-react";
import { useMemo } from "react";
import { useAsyncData } from "@/api/use-async-data";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PageHeader, type Crumb } from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuthSession } from "@/features/auth/auth-session";
import { accountsApi } from "@/features/accounts/api";
import { analyticsApi } from "../api";
import type { AnalyticsScope } from "../types";
import { OperationsReportView } from "./operations-report";
import { PeriodMeta, RangeBar, RangeError, useAnalyticsRange } from "./range";
import { ReportShell } from "./report-shell";
import { RevenueReportView } from "./revenue-report";
import { TrainingReportView } from "./training-report";

export type AnalyticsVariant = "organization" | "platform" | "admin-organization";
type TabKey = "training" | "operations" | "revenue";

const TABS: Record<AnalyticsVariant, TabKey[]> = {
  organization: ["training", "operations"],
  "admin-organization": ["training", "operations"],
  platform: ["operations", "training", "revenue"],
};
const TAB_LABELS: Record<TabKey, string> = { training: "Huấn luyện", operations: "Vận hành", revenue: "Doanh thu" };
const ROLE: Record<AnalyticsVariant, 0 | 1> = { organization: 1, platform: 0, "admin-organization": 0 };

/**
 * One reporting screen for the three scopes: the caller's own organization, the whole platform and one organization seen
 * by an Admin. The tenant is chosen by the route and the session, never by a client filter; the period is the only query.
 */
export function AnalyticsWorkspace({ variant, organizationId, title, description, breadcrumbs }: { variant: AnalyticsVariant; organizationId?: string; title: string; description: string; breadcrumbs: Crumb[] }) {
  const { accessToken, ready, user } = useAuthSession();
  const { urlFrom, urlTo, hasRange, error: rangeError, range, get, setParams, apply } = useAnalyticsRange();
  const tabs = TABS[variant];
  const requested = get("tab");
  const tab: TabKey = (tabs as string[]).includes(requested) ? (requested as TabKey) : tabs[0];
  const allowed = ready && user?.role === ROLE[variant] && Boolean(accessToken);
  const scope = useMemo<AnalyticsScope>(() => variant === "organization" ? { kind: "organization" } : variant === "platform" ? { kind: "platform" } : { kind: "admin-organization", organizationId: organizationId ?? "" }, [variant, organizationId]);
  const enabled = allowed && !rangeError && (variant !== "admin-organization" || Boolean(organizationId));
  const key = `${variant}:${organizationId ?? ""}:${urlFrom}:${urlTo}`;

  const training = useAsyncData(`training:${key}`, (signal) => analyticsApi.training(accessToken as string, scope, range, signal), enabled && tab === "training", { keepWhenDenied: true });
  const operations = useAsyncData(`operations:${key}`, (signal) => analyticsApi.operations(accessToken as string, scope, range, signal), enabled && tab === "operations", { keepWhenDenied: true });
  const revenue = useAsyncData(`revenue:${key}`, (signal) => analyticsApi.revenue(accessToken as string, range, signal), enabled && tab === "revenue" && variant === "platform", { keepWhenDenied: true });
  const names = useAsyncData("analytics:organization-names", () => accountsApi.organizations(accessToken as string).then((page) => new Map(page.items.map((item) => [item.id, item.name]))), enabled && tab === "training" && variant === "platform");

  if (!ready) return <p role="status">Đang kiểm tra phiên đăng nhập…</p>;
  if (user?.role !== ROLE[variant]) return <Alert tone="danger" title="Không có quyền truy cập">{variant === "organization" ? "Báo cáo này dành cho tài khoản tổ chức." : "Chỉ PlatformAdmin có thể xem báo cáo này."}</Alert>;

  const active = tab === "training" ? training : tab === "operations" ? operations : revenue;
  const meta = active.data;
  const identity = variant === "admin-organization" ? (training.data?.organization ?? operations.data?.organization ?? null) : null;

  return <>
    <PageHeader
      title={title}
      description={description}
      breadcrumbs={breadcrumbs}
      actions={<Button variant="quiet" onClick={active.reload} disabled={active.loading || Boolean(rangeError)}><RefreshCw size={16} aria-hidden="true" />{active.loading ? "Đang tải…" : "Tải lại"}</Button>}
    />

    <RangeBar key={`${urlFrom}|${urlTo}`} urlFrom={urlFrom} urlTo={urlTo} onApply={apply} />
    <PeriodMeta data={meta} hasRange={hasRange} urlFrom={urlFrom} urlTo={urlTo} />
    <RangeError message={rangeError} />
    {identity && <p className="ops-muted" style={{ marginBottom: 14 }}>Tổ chức: <strong style={{ color: "var(--text)" }}>{identity.name}</strong> · {identity.isActive ? "đang hoạt động" : "đã vô hiệu hóa (vẫn đọc được số liệu)"}</p>}

    {tabs.length > 1 && <Tabs value={tab} onValueChange={(value) => setParams({ tab: value === tabs[0] ? null : value }, "replace")}>
      <TabsList aria-label="Loại báo cáo">{tabs.map((key) => <TabsTrigger key={key} value={key}>{TAB_LABELS[key]}</TabsTrigger>)}</TabsList>
      <TabsContent value="training">{!rangeError && <ReportShell query={training} title="báo cáo huấn luyện">{(data) => <TrainingReportView data={data} organizationNames={names.data} showOrganizationLinks={variant === "platform"} />}</ReportShell>}</TabsContent>
      <TabsContent value="operations">{!rangeError && <ReportShell query={operations} title="báo cáo vận hành">{(data) => <OperationsReportView data={data} scope={variant === "organization" ? "organization" : variant === "platform" ? "platform" : "admin-organization"} organizationId={organizationId} />}</ReportShell>}</TabsContent>
      <TabsContent value="revenue">{!rangeError && <ReportShell query={revenue} title="báo cáo doanh thu">{(data) => <RevenueReportView data={data} />}</ReportShell>}</TabsContent>
    </Tabs>}
  </>;
}
