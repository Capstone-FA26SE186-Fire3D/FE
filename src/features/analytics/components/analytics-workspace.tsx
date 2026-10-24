"use client";

import { Download, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAsyncData } from "@/api/use-async-data";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FilterChips } from "@/components/ui/filter-chip";
import { PageHeader, type Crumb } from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuthSession } from "@/features/auth/auth-session";
import { accountsApi } from "@/features/accounts/api";
import { describeApiError } from "@/api/describe-error";
import { analyticsApi } from "../api";
import type { AnalyticsScope, OperationsReport } from "../types";
import { readTrainingFilters, TrainingFilterBar, withDefaultGroup } from "./filters";
import { OperationsReportView } from "./operations-report";
import { PeriodMeta, RangeBar, RangeError, useAnalyticsRange } from "./range";
import { ReportShell } from "./report-shell";
import { RevenueReportView } from "./revenue-report";
import { TrainingReportView } from "./training-report";
import styles from "./analytics.module.css";
import { LoadingBlock } from "@/components/ui/spinner";

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
 * One reporting screen for the three scopes (Figma "Báo cáo"): the caller's own organization, the whole platform and
 * one organization seen by an Admin. The tenant is chosen by the route and the session, never by a client filter; the
 * period, the main tab and the training filters live in the URL.
 */
export function AnalyticsWorkspace({ variant, organizationId, title, description, breadcrumbs, eyebrow, sectionHeading, onOperations }: { variant: AnalyticsVariant; organizationId?: string; title: string; description: string; breadcrumbs: Crumb[]; eyebrow?: string; /** Render as a section of a larger page (an h2 plus the refresh button) instead of the page header. */ sectionHeading?: boolean; /** Receives each loaded operations report so a page around this one can show headline figures without a second request. */ onOperations?: (report: OperationsReport) => void }) {
  const { accessToken, ready, user } = useAuthSession();
  const { urlFrom, urlTo, hasRange, error: rangeError, range, get, setParams, apply } = useAnalyticsRange();
  const tabs = TABS[variant];
  const requested = get("tab");
  const tab: TabKey = (tabs as string[]).includes(requested) ? (requested as TabKey) : tabs[0];
  const allowed = ready && user?.role === ROLE[variant] && Boolean(accessToken);
  const scope = useMemo<AnalyticsScope>(() => variant === "organization" ? { kind: "organization" } : variant === "platform" ? { kind: "platform" } : { kind: "admin-organization", organizationId: organizationId ?? "" }, [variant, organizationId]);
  const enabled = allowed && !rangeError && (variant !== "admin-organization" || Boolean(organizationId));
  const filterable = variant === "organization";
  const filters = useMemo(() => readTrainingFilters(filterable ? get : () => ""), [filterable, get]);
  // Every scope asks for the daily cohorts (or the grouping in the URL): the sessions chart and the sparklines read them.
  const requestFilters = useMemo(() => withDefaultGroup(filters), [filters]);
  const key = `${variant}:${organizationId ?? ""}:${urlFrom}:${urlTo}`;
  const trainingKey = `${key}:${requestFilters.buildingId ?? ""}:${requestFilters.scenarioId ?? ""}:${requestFilters.groupBy ?? ""}`;

  const training = useAsyncData(`training:${trainingKey}`, (signal) => analyticsApi.training(accessToken as string, scope, range, signal, requestFilters), enabled && tab === "training", { keepWhenDenied: true });
  const operations = useAsyncData(`operations:${key}`, (signal) => analyticsApi.operations(accessToken as string, scope, range, signal), enabled && tab === "operations", { keepWhenDenied: true });
  const revenue = useAsyncData(`revenue:${key}`, (signal) => analyticsApi.revenue(accessToken as string, range, signal), enabled && tab === "revenue" && variant === "platform", { keepWhenDenied: true });
  const names = useAsyncData("analytics:organization-names", () => accountsApi.organizations(accessToken as string).then((page) => new Map(page.items.map((item) => [item.id, item.name]))), enabled && tab === "training" && variant === "platform");

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const exportCsv = async () => {
    if (!accessToken || exporting) return;
    setExporting(true);
    setExportError(null);
    try {
      const text = await analyticsApi.exportTraining(accessToken, scope, range, undefined, requestFilters);
      const url = URL.createObjectURL(new Blob(["﻿", text], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "bao-cao-huan-luyen.csv";
      link.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setExportError(describeApiError(cause, "Không xuất được CSV. Hãy thử lại sau."));
    } finally {
      setExporting(false);
    }
  };

  const operationsData = operations.data;
  useEffect(() => { if (operationsData) onOperations?.(operationsData); }, [operationsData, onOperations]);

  if (!ready) return <LoadingBlock label="Đang kiểm tra phiên đăng nhập…" />;
  if (user?.role !== ROLE[variant]) return <Alert tone="danger" title="Không có quyền truy cập">{variant === "organization" ? "Báo cáo này dành cho tài khoản tổ chức." : "Chỉ PlatformAdmin có thể xem báo cáo này."}</Alert>;

  const active = tab === "training" ? training : tab === "operations" ? operations : revenue;
  const meta = active.data;
  const identity = variant === "admin-organization" ? (training.data?.organization ?? operations.data?.organization ?? null) : null;

  const refresh = <Button variant="quiet" onClick={active.reload} disabled={active.loading || Boolean(rangeError)}><RefreshCw size={16} aria-hidden="true" />{active.loading ? "Đang tải…" : "Tải lại"}</Button>;

  const org = variant === "organization" && !sectionHeading;
  // CSV export exists for the training report only (`{training route}/export`); the operations tab has no export endpoint.
  const exportButton = org && tab === "training" ? <Button variant="secondary" onClick={() => void exportCsv()} disabled={exporting || Boolean(rangeError)}><Download size={16} aria-hidden="true" />{exporting ? "Đang xuất…" : "Xuất CSV"}</Button> : null;

  const toolbar = <div className={styles.toolbar}>
    <FilterChips label="Bộ lọc báo cáo">
      {filterable && tab === "training" && <TrainingFilterBar accessToken={accessToken} filters={filters} onChange={(patch) => setParams(patch)} />}
      <RangeBar key={`${urlFrom}|${urlTo}`} urlFrom={urlFrom} urlTo={urlTo} onApply={apply} />
    </FilterChips>
    <PeriodMeta data={meta} hasRange={hasRange} urlFrom={urlFrom} urlTo={urlTo} />
  </div>;

  return <div className={org ? "org" : undefined}>
    {sectionHeading
      ? <div className="ops-page-header" style={{ marginBottom: 14 }}><div><h2 className="adm-section-title" style={{ margin: 0 }}>{title}</h2><p className="ops-muted" style={{ marginTop: 6 }}>{description}</p></div><div className="ops-actions">{refresh}</div></div>
      : <PageHeader title={title} description={description} breadcrumbs={breadcrumbs} eyebrow={eyebrow} actions={<>{exportButton}{refresh}</>} />}
    {exportError && <Alert tone="danger" title="Không xuất được CSV">{exportError}</Alert>}
    {identity && <p className={styles.identity}>Tổ chức: <strong>{identity.name}</strong> · {identity.isActive ? "đang hoạt động" : "đã vô hiệu hóa (vẫn đọc được số liệu)"}</p>}

    <Tabs value={tab} onValueChange={(value) => setParams({ tab: value === tabs[0] ? null : value }, "replace")}>
      {tabs.length > 1 && <TabsList aria-label="Loại báo cáo">{tabs.map((key) => <TabsTrigger key={key} value={key}>{TAB_LABELS[key]}</TabsTrigger>)}</TabsList>}
      {toolbar}
      <RangeError message={rangeError} />
      <TabsContent value="training">{!rangeError && <ReportShell query={training} title="báo cáo huấn luyện">{(data) => <TrainingReportView data={data} groupBy={requestFilters.groupBy} organizationNames={names.data} showOrganizationLinks={variant === "platform"} />}</ReportShell>}</TabsContent>
      <TabsContent value="operations">{!rangeError && <ReportShell query={operations} title="báo cáo vận hành">{(data) => <OperationsReportView data={data} scope={variant === "organization" ? "organization" : variant === "platform" ? "platform" : "admin-organization"} organizationId={organizationId} />}</ReportShell>}</TabsContent>
      {variant === "platform" && <TabsContent value="revenue">{!rangeError && <ReportShell query={revenue} title="báo cáo doanh thu">{(data) => <RevenueReportView data={data} />}</ReportShell>}</TabsContent>}
    </Tabs>
  </div>;
}
