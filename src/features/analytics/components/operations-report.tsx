"use client";

import { Building2, LifeBuoy, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ChartCard } from "@/components/charts/chart-card";
import { colorAt, seriesColor } from "@/components/charts/chart-config";
import { AreaChart, Donut, GroupedBars } from "@/components/charts/lazy";
import { RankedBars } from "@/components/charts/ranked-bars";
import { Stacked100 } from "@/components/charts/stacked-100";
import { Button } from "@/components/ui/button";
import type { Tone } from "@/components/ui/status-badge";
import { ChipTabs } from "@/components/ui/sub-tabs";
import { routes } from "@/configs/routes";
import { ticketStatusLabel, ticketStatusTone } from "@/features/support/labels";
import { fmt } from "../format";
import { fillPeriods, periodTick, periodTitle } from "../periods";
import type { OperationsReport, TrainingReport } from "../types";
import { KpiTile, Num, ReportTable, sumCounts, toneColor } from "./charts";
import styles from "./analytics.module.css";

const roleNames: Record<string, string> = { PlatformAdmin: "Quản trị FET3D", OrganizationUser: "Tổ chức", Trainee: "Học viên" };
/** Job kinds as the Figma chips name them; an unknown kind keeps its server name. */
const kindLabels: Record<string, string> = { IfcProcessing: "Dựng mô hình 3D", Geometry: "Dựng mô hình 3D", PlaytestPackage: "Gói chạy thử", ReleasePackage: "Gói phát hành", PackageBuild: "Dựng gói" };
const jobStatusLabel: Record<string, string> = { Queued: "Đang chờ", Running: "Đang chạy", Processing: "Đang xử lý", Succeeded: "Hoàn tất", Failed: "Thất bại", Cancelled: "Đã hủy", Canceled: "Đã hủy" };
const ticketOrder = ["Open", "InProgress", "Resolved", "Closed"];
/** "Tạo mới trong kỳ" rows, in this order; a key the server adds later keeps its own name. */
const createdLabels: Record<string, string> = { accounts: "Tài khoản", organizations: "Tổ chức", buildings: "Công trình", processingJobs: "Tiến trình xử lý", tickets: "Yêu cầu hỗ trợ" };
const activitySeries = [
  { key: "plays", label: "Lượt chơi", color: seriesColor.plays },
  { key: "trainees", label: "Học viên tham gia", color: seriesColor.passed },
  { key: "completed", label: "Hoàn thành", color: seriesColor.completed },
];

/** Daily cohorts of the operations period, read by the workspace next to the operations report (no training filters). */
export type OperationsActivity = { report?: TrainingReport; loading: boolean; failed: boolean };

function jobTone(status: string): Tone {
  if (/fail|error|dead/i.test(status)) return "danger";
  if (/succe|complete|done/i.test(status)) return "success";
  if (/run|process|claim/i.test(status)) return "info";
  if (/queue|wait|pending/i.test(status)) return "warning";
  return "neutral";
}
const jobPattern = (tone: Tone): "stripes" | "dots" | undefined => (tone === "danger" ? "stripes" : tone === "warning" ? "dots" : undefined);

/**
 * Operations (Figma "Báo cáo · Vận hành"): three snapshot/period KPIs, then buildings, processing jobs by kind and
 * support tickets. The platform variant adds accounts by role and organizations. Buildings, accounts and
 * organizations are a snapshot at the update time; jobs and tickets are those created in the period. A finished job is
 * not the same as a model that passed QA.
 */
export function OperationsReportView({ data, scope, organizationId, activity }: { data: OperationsReport; scope: "platform" | "organization" | "admin-organization"; organizationId?: string; activity?: OperationsActivity }) {
  const platform = scope === "platform";
  const accounts = data.accounts ?? [];
  const accountsActive = sumCounts(accounts.filter((item) => item.isActive));
  const accountsTotal = sumCounts(accounts);
  const buildingsActive = sumCounts(data.buildings.filter((item) => item.isActive));
  const buildingsTotal = sumCounts(data.buildings);
  const jobsTotal = sumCounts(data.processingJobs);
  const jobsFailed = sumCounts(data.processingJobs.filter((item) => jobTone(item.status) === "danger"));
  const ticketsTotal = sumCounts(data.tickets);
  const ticketsOpen = sumCounts(data.tickets.filter((item) => item.status === "Open" || item.status === "InProgress"));
  const organizations = data.organizations ?? [];
  const organizationsActive = sumCounts(organizations.filter((item) => item.isActive));

  const kinds = Array.from(new Set(data.processingJobs.map((item) => item.kind)));
  const [pickedKind, setPickedKind] = useState<string | null>(null);
  const kind = pickedKind && kinds.includes(pickedKind) ? pickedKind : kinds[0];
  const jobsOfKind = data.processingJobs.filter((item) => item.kind === kind);
  const kindLabel = kind ? kindLabels[kind] ?? kind : "";
  const kindItems = kinds.map((item) => ({ value: item, label: kindLabels[item] ?? item, count: sumCounts(data.processingJobs.filter((job) => job.kind === item)), "data-testid": `jobkind-${item}` }));
  const jobSegments = jobsOfKind.map((item) => { const tone = jobTone(item.status); return { key: item.status, label: jobStatusLabel[item.status] ?? item.status, value: item.count, color: toneColor[tone], pattern: jobPattern(tone) }; });

  const tickets = [...data.tickets].sort((a, b) => (ticketOrder.indexOf(a.status) + 1 || 99) - (ticketOrder.indexOf(b.status) + 1 || 99));
  const ticketSlices = tickets.map((item) => ({ key: item.status, label: ticketStatusLabel(item.status), value: item.count, color: toneColor[ticketStatusTone(item.status)] }));
  const ticketsHref = scope === "admin-organization" && organizationId ? `${routes.adminSupport}?organizationId=${organizationId}` : platform ? routes.adminSupport : routes.workspaceSupport;

  const roles = Array.from(new Set(accounts.map((item) => item.role)));
  const accountRows = roles.map((role) => ({ role: roleNames[role] ?? role, active: sumCounts(accounts.filter((item) => item.role === role && item.isActive)), inactive: sumCounts(accounts.filter((item) => item.role === role && !item.isActive)) }));
  const accountData = accountRows.map((row) => ({ role: row.role, count: row.active + row.inactive }));

  const report = activity?.report;
  const days = report?.cohorts ? fillPeriods(report.cohorts, "day", report.from, report.to) : [];
  const activityData = days.map((day) => ({ day: day.key, plays: day.plays, trainees: day.uniqueTrainees, completed: day.completed }));
  const createdRows = [...Object.keys(createdLabels).filter((key) => key in data.created), ...Object.keys(data.created).filter((key) => !(key in createdLabels))]
    .map((key) => ({ key, label: createdLabels[key] ?? key, value: data.created[key] }));

  return <div className={styles.report}>
    <div className={styles.kpis} data-count={platform ? 4 : 3} role="group" aria-label="Chỉ số vận hành">
      {platform && <KpiTile label="Tài khoản (hiện tại)" value={accountsTotal} hint={`${fmt(accountsActive)} hoạt động · ${fmt(accountsTotal - accountsActive)} vô hiệu`} data-testid="kpi-accounts" />}
      <KpiTile label="Công trình (hiện tại)" value={buildingsTotal} hint={buildingsTotal ? `${fmt(buildingsActive)} hoạt động · ${fmt(buildingsTotal - buildingsActive)} lưu trữ` : "Chưa có công trình"} data-testid="kpi-buildings" />
      <KpiTile label="Tiến trình xử lý (trong kỳ)" value={jobsTotal} hint={`${fmt(jobsFailed)} thất bại`} data-testid="kpi-jobs" />
      <KpiTile label="Yêu cầu hỗ trợ (trong kỳ)" value={ticketsTotal} hint={`${fmt(ticketsOpen)} chưa xử lý xong`} data-testid="kpi-tickets" />
    </div>

    {activity && <ChartCard title="Hoạt động huấn luyện theo ngày" description="Lượt chơi, số học viên tham gia và lượt hoàn thành mỗi ngày trong khoảng thời gian đã chọn" height={220} data-testid="chart-activity"
      loading={activity.loading} empty={activity.failed || !report?.plays} emptyText={activity.failed ? "Chưa lấy được số liệu huấn luyện. Bấm Tải lại để thử lại." : "Chưa có lượt chơi nào trong khoảng này"}
      legend={report ? [{ label: "Lượt chơi", color: seriesColor.plays, value: fmt(report.plays) }, { label: "Học viên tham gia", color: seriesColor.passed, value: fmt(report.uniqueTrainees) }, { label: "Hoàn thành", color: seriesColor.completed, value: fmt(report.completed) }] : undefined}
      table={<ReportTable caption="Hoạt động huấn luyện theo ngày">
        <thead><tr><th>Ngày</th><Num header>Lượt chơi</Num><Num header>Học viên</Num><Num header>Hoàn thành</Num></tr></thead>
        <tbody>{days.filter((day) => day.plays > 0).map((day) => <tr key={day.key}><td>{periodTitle(day.key, "day")}</td><Num>{fmt(day.plays)}</Num><Num>{fmt(day.uniqueTrainees)}</Num><Num>{fmt(day.completed)}</Num></tr>)}</tbody>
      </ReportTable>}>
      <AreaChart data={activityData} xKey="day" series={activitySeries} height={220} formatX={periodTick} />
    </ChartCard>}

    <div className={styles.trio}>
      <ChartCard title="Công trình" description="Ảnh chụp hiện tại; công trình đã xóa không được tính" height={140} empty={buildingsTotal === 0} emptyText="Chưa có công trình" data-testid="chart-buildings"
        actions={platform && <Button asChild size="sm" variant="quiet"><Link href={routes.adminOrganizations}><Building2 size={16} aria-hidden="true" />Theo tổ chức</Link></Button>}
        table={<ReportTable caption="Công trình theo trạng thái">
          <thead><tr><th>Trạng thái</th><Num header>Số công trình</Num></tr></thead>
          <tbody><tr><td>Đang hoạt động</td><Num>{fmt(buildingsActive)}</Num></tr><tr><td>Đã lưu trữ</td><Num>{fmt(buildingsTotal - buildingsActive)}</Num></tr></tbody>
        </ReportTable>}>
        <Donut size={140} slices={[{ key: "active", label: "Đang hoạt động", value: buildingsActive, color: seriesColor.passed }, { key: "archived", label: "Đã lưu trữ", value: buildingsTotal - buildingsActive, color: seriesColor.neutral }]} center={{ value: fmt(buildingsTotal), caption: "công trình" }} />
      </ChartCard>

      <ChartCard title="Tiến trình xử lý" description="Tạo trong kỳ đã chọn: xử lý IFC và dựng gói. Hoàn tất chưa có nghĩa là mô hình đã đạt kiểm tra." height={140} empty={kinds.length === 0} emptyText="Không có tiến trình nào trong khoảng thời gian này" data-testid="chart-jobs"
        table={<ReportTable caption="Tiến trình theo loại và trạng thái">
          <thead><tr><th>Loại</th><th>Trạng thái</th><Num header>Số tiến trình</Num></tr></thead>
          <tbody>{data.processingJobs.map((item) => <tr key={`${item.kind}-${item.status}`}><td>{kindLabels[item.kind] ?? item.kind}</td><td>{jobStatusLabel[item.status] ?? item.status}</td><Num>{fmt(item.count)}</Num></tr>)}</tbody>
        </ReportTable>}>
        <div className={styles.stackBody}>
          {kinds.length > 1 ? <ChipTabs label="Loại tiến trình" value={kind ?? ""} onValueChange={setPickedKind} items={kindItems} /> : <p className={styles.muted}>Loại: <strong>{kindLabel}</strong></p>}
          <Stacked100 label={`Tiến trình ${kindLabel} theo trạng thái`} segments={jobSegments} />
        </div>
      </ChartCard>

      <ChartCard title="Yêu cầu hỗ trợ" description={platform ? "Theo trạng thái · tạo trong khoảng thời gian đã chọn" : scope === "admin-organization" ? "Yêu cầu hỗ trợ của tổ chức này, tạo trong khoảng thời gian đã chọn" : "Yêu cầu hỗ trợ bạn tạo trong khoảng thời gian đã chọn"} height={140} empty={ticketsTotal === 0} emptyText="Chưa có yêu cầu hỗ trợ trong kỳ này" data-testid="chart-tickets"
        actions={<Button asChild size="sm" variant="quiet"><Link href={ticketsHref}><LifeBuoy size={16} aria-hidden="true" />{platform || scope === "admin-organization" ? "Mở hộp thư" : "Mở hỗ trợ"}</Link></Button>}
        table={<ReportTable caption="Yêu cầu hỗ trợ theo trạng thái">
          <thead><tr><th>Trạng thái</th><Num header>Số yêu cầu</Num></tr></thead>
          <tbody>{tickets.map((item) => <tr key={item.status}><td>{ticketStatusLabel(item.status)}</td><Num>{fmt(item.count)}</Num></tr>)}</tbody>
        </ReportTable>}>
        <Donut size={140} slices={ticketSlices} center={{ value: fmt(ticketsTotal), caption: "yêu cầu" }} />
      </ChartCard>
    </div>

    {platform && <div className={styles.trio}>
      <ChartCard title="Tài khoản theo vai trò" description="Ảnh chụp hiện tại, không phụ thuộc khoảng thời gian" height={160} empty={accountsTotal === 0} emptyText="Chưa có tài khoản" data-testid="chart-accounts"
        legend={accountRows.map((row, index) => ({ label: row.role, color: colorAt(index), value: fmt(row.active + row.inactive) }))}
        actions={<Button asChild size="sm" variant="quiet"><Link href={routes.adminAccounts}><Users size={16} aria-hidden="true" />Quản lý</Link></Button>}
        table={<ReportTable caption="Tài khoản theo vai trò">
          <thead><tr><th>Vai trò</th><Num header>Hoạt động</Num><Num header>Vô hiệu</Num><Num header>Tổng</Num></tr></thead>
          <tbody>{accountRows.map((row) => <tr key={row.role}><td>{row.role}</td><Num>{fmt(row.active)}</Num><Num>{fmt(row.inactive)}</Num><Num>{fmt(row.active + row.inactive)}</Num></tr>)}</tbody>
        </ReportTable>}>
        <GroupedBars data={accountData} xKey="role" series={[{ key: "count", label: "Tài khoản" }]} height={160} colorByCategory />
      </ChartCard>

      {data.organizations && <ChartCard title="Tổ chức" description="Đang hoạt động / vô hiệu · ảnh chụp hiện tại" height={140} empty={organizations.length === 0} emptyText="Chưa có tổ chức" data-testid="chart-organizations"
        table={<ReportTable caption="Tổ chức theo trạng thái">
          <thead><tr><th>Trạng thái</th><Num header>Số tổ chức</Num></tr></thead>
          <tbody><tr><td>Hoạt động</td><Num>{fmt(organizationsActive)}</Num></tr><tr><td>Vô hiệu</td><Num>{fmt(sumCounts(organizations) - organizationsActive)}</Num></tr></tbody>
        </ReportTable>}>
        <Donut size={140} slices={[{ key: "active", label: "Hoạt động", value: organizationsActive, color: seriesColor.passed }, { key: "inactive", label: "Vô hiệu", value: sumCounts(organizations) - organizationsActive, color: seriesColor.neutral }]} center={{ value: fmt(sumCounts(organizations)) }} />
      </ChartCard>}

      <ChartCard title="Tạo mới trong kỳ" description="Số mục được tạo trong khoảng thời gian đã chọn" height={140} empty={createdRows.length === 0} emptyText="Chưa có số liệu tạo mới" data-testid="chart-created">
        <RankedBars rows={createdRows} label="Số mục tạo mới trong kỳ" />
      </ChartCard>
    </div>}
  </div>;
}
