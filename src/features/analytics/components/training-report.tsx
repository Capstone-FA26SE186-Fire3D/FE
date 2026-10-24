"use client";

import Link from "next/link";
import { useState } from "react";
import { ChartCard, legendOf } from "@/components/charts/chart-card";
import { colorAt, seriesColor, shortDate, type Series } from "@/components/charts/chart-config";
import { AreaChart, Donut, GroupedBars } from "@/components/charts/lazy";
import { RankedBars } from "@/components/charts/ranked-bars";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/dialog";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { routes } from "@/configs/routes";
import { fmt, formatRate, formatSeconds, shortId } from "../format";
import { OUTCOMES, type AiUsage, type GroupBy, type TrainingReport } from "../types";
import { GROUP_LABELS } from "./filters";
import { EmptyReport, KpiTile, MiniStat, Num, outcomeLabels, ReportTable } from "./charts";
import styles from "./analytics.module.css";

/** Mode names as the Figma axis prints them. */
const modeLabels: Record<string, string> = { Learn: "Learn", Guided: "Guided Drill", Assessment: "Assessment" };
// v7 request statuses (BE#89). analytics_ai_usage on BE main still keys `requests` by the pre-v7 names, which no row has
// after the migration (always 0): those keys are hidden rather than shown as statuses that no longer exist.
const aiStatusLabels: Record<string, string> = { Accepted: "Đang chờ", Processing: "Đang xử lý", Succeeded: "Thành công", Failed: "Thất bại", NeedsReconcile: "Cần đối soát", Rejected: "Bị từ chối" };
const LEGACY_AI_STATUSES = new Set(["Queued", "Running", "InsufficientEvidence", "SafetyRejected"]);

const TIME_GROUPS: ReadonlySet<GroupBy> = new Set<GroupBy>(["day", "week", "month"]);
const periodSeries: Series[] = [
  { key: "plays", label: "Lượt chơi", color: seriesColor.plays },
  { key: "completed", label: "Có kết quả", color: seriesColor.completed },
  { key: "passed", label: "Đạt", color: seriesColor.passed },
];
const modeSeries: Series[] = [{ key: "plays", label: "Lượt chơi", color: seriesColor.plays }, { key: "completed", label: "Có kết quả", color: seriesColor.completed }];
const outcomeColor = { Passed: seriesColor.passed, NotPassed: seriesColor.notPassed, Incomplete: seriesColor.incomplete, NotAssessed: seriesColor.notAssessed } as const;

function AiUsageCard({ usage }: { usage: AiUsage }) {
  const settled = usage.settledUnits;
  const statuses = Object.entries(usage.requests).filter(([status]) => !LEGACY_AI_STATUSES.has(status));
  const quota = (items: AiUsage["settledUnits"]) => (items.length ? items.map((item) => `${fmt(item.units)} ${item.quotaUnit}`).join(" · ") : "0");
  return <Panel title="Sử dụng AI" description="Đơn vị quota đã chốt trong kỳ; đặt trước và cần đối soát là số hiện tại, tính riêng." data-testid="card-ai-usage">
    <div className={styles.miniRow}>
      <MiniStat label="Đã chốt (trong kỳ)" value={quota(settled)} hint={settled.length ? undefined : "Chưa dùng quota nào trong kỳ"} />
      <MiniStat label="Đang đặt trước (hiện tại)" value={quota(usage.openReservations)} />
      <MiniStat label="Cần đối soát (hiện tại)" value={fmt(usage.needsReconcile.requests)} hint={`${fmt(usage.needsReconcile.reservedUnits)} đơn vị đang giữ chỗ`} />
    </div>
    {statuses.length > 0 && <ul className={styles.statusList} aria-label="Yêu cầu AI theo trạng thái (tạo trong kỳ)">
      {statuses.map(([status, count]) => <li key={status}><span>{aiStatusLabels[status] ?? status}</span><strong>{fmt(count)}</strong></li>)}
    </ul>}
  </Panel>;
}

/**
 * Training report (Figma "Báo cáo · Huấn luyện"): KPI tiles with the period trend, sessions per period beside the
 * outcome donut, then scenarios / modes / duration. Only real learner sessions started in the period are counted
 * (server definition); playtests and package preparation never are. An empty period is an explanation, not an error.
 */
export function TrainingReportView({ data, groupBy: requestedGroup, organizationNames, showOrganizationLinks }: { data: TrainingReport; /** Grouping the request asked for, used when the server does not echo `filters.groupBy`. */ groupBy?: GroupBy; organizationNames?: Map<string, string>; showOrganizationLinks?: boolean }) {
  const [scenarioTable, setScenarioTable] = useState(false);
  const empty = data.plays === 0;
  const groupBy = data.groupBy ?? requestedGroup ?? null;
  const timeSeries = Boolean(groupBy && TIME_GROUPS.has(groupBy));
  const timeline = data.cohorts && timeSeries ? data.cohorts : null;
  const periods = timeline?.map((row) => ({ period: row.label, plays: row.plays, completed: row.completed, passed: row.passed })) ?? [];
  const spark = (pick: (row: NonNullable<typeof timeline>[number]) => number) => timeline?.map(pick);
  // Figma also shows a "+12%" delta chip on the first tile: the API has no previous-period figure, so no delta is drawn.

  const outcomeTotal = OUTCOMES.reduce((sum, outcome) => sum + data.outcomes[outcome], 0);
  const assessmentText = data.assessment.assessed > 0 ? `${fmt(data.assessment.passed)} đạt / ${fmt(data.assessment.assessed)} phiên có chấm điểm` : "Chưa có phiên Đạt/Chưa đạt";
  const scenarios = [...data.byScenario].sort((a, b) => b.plays - a.plays);
  const scenarioName = (row: TrainingReport["byScenario"][number]) => row.scenarioName ?? `Kịch bản ${shortId(row.scenarioId)}`;
  const modes = data.byMode.map((row) => ({ mode: modeLabels[row.mode] ?? row.mode, plays: row.plays, completed: row.completed }));
  const organizationName = (id: string) => organizationNames?.get(id) ?? `Tổ chức ${shortId(id)}`;

  return <div className={styles.report}>
    <div className={styles.kpis} role="group" aria-label="Chỉ số huấn luyện">
      <KpiTile label="Lượt chơi (trong kỳ)" value={data.plays} hint="Phiên bắt đầu trong kỳ" spark={spark((row) => row.plays)} sparkColor={seriesColor.plays} data-testid="kpi-plays" />
      <KpiTile label="Học viên khác nhau" value={data.uniqueTrainees} hint="Đếm một lần dù chơi nhiều phiên" spark={spark((row) => row.uniqueTrainees)} sparkColor={seriesColor.plays} data-testid="kpi-trainees" />
      <KpiTile label="Đã có kết quả" value={data.completed} hint={`Tỷ lệ hoàn thành ${formatRate(data.completionRate, "chưa có mẫu (0 lượt chơi)")}`} spark={spark((row) => row.completed)} sparkColor={seriesColor.completed} data-testid="kpi-completed" />
      <KpiTile label="Đang chơi (hiện tại)" value={data.activeSessions} hint={data.activeWindowSeconds ? `Nhịp trong ${fmt(data.activeWindowSeconds)} giây gần nhất; không theo kỳ` : "Không theo kỳ"} data-testid="kpi-active" />
    </div>

    {empty && <EmptyReport title="Chưa có lượt chơi trong khoảng thời gian này">Đây là kết quả hợp lệ, không phải lỗi. Thử mở rộng khoảng thời gian (tối đa 90 ngày) hoặc kiểm tra công trình đã có kịch bản phát hành và học viên đã bắt đầu phiên. Playtest và bước chuẩn bị gói không được tính.</EmptyReport>}

    {!empty && <>
      <div className={styles.lead}>
        <ChartCard title={`Phiên theo ${(timeSeries && groupBy ? GROUP_LABELS[groupBy] : GROUP_LABELS.day).toLowerCase()}`} description="Lượt chơi · Có kết quả · Đạt" legend={legendOf(periodSeries, colorAt)} height={190} empty={periods.length === 0}
          emptyText={groupBy && !timeSeries ? "Nhóm theo công trình/kịch bản không có trục thời gian; xem bảng nhóm bên dưới." : "Chưa có dữ liệu trong khoảng này"} data-testid="chart-periods"
          table={timeline && <CohortTable rows={timeline} />}>
          <AreaChart data={periods} xKey="period" series={periodSeries} height={190} formatX={shortDate} />
        </ChartCard>

        <ChartCard title="Kết quả phiên" description="Do máy chủ ghi nhận" empty={outcomeTotal === 0} emptyText="Chưa có phiên nào có kết quả trong khoảng này" data-testid="chart-outcomes"
          footer={<>Tỷ lệ đạt = Đạt / (Đạt + Chưa đạt) = <strong>{formatRate(data.assessment.passRate, "chưa có mẫu")}</strong> · {assessmentText}{outcomeTotal < data.completed && <> · {fmt(data.completed - outcomeTotal)} phiên chưa có kết quả được máy chủ nhận.</>}</>}
          table={<ReportTable caption="Kết quả của phiên">
            <thead><tr><th>Kết quả</th><Num header>Số phiên</Num><Num header>Tỷ lệ</Num></tr></thead>
            <tbody>{OUTCOMES.map((outcome) => <tr key={outcome}><td>{outcomeLabels[outcome]}</td><Num>{fmt(data.outcomes[outcome])}</Num><Num>{outcomeTotal ? formatRate(data.outcomes[outcome] / outcomeTotal) : "—"}</Num></tr>)}</tbody>
          </ReportTable>}>
          <Donut size={140} slices={OUTCOMES.map((outcome) => ({ key: outcome, label: outcomeLabels[outcome], value: data.outcomes[outcome], color: outcomeColor[outcome] }))} center={{ value: fmt(outcomeTotal), caption: "phiên" }} />
        </ChartCard>
      </div>

      <div className={styles.trio}>
        <ChartCard title="Theo kịch bản" description="Top 8 theo lượt chơi" height={120} empty={scenarios.length === 0} emptyText="Chưa có kịch bản nào có lượt chơi trong kỳ" data-testid="chart-scenarios"
          actions={scenarios.length > 0 && <Button size="sm" variant="secondary" onClick={() => setScenarioTable(true)}>Xem bảng</Button>}>
          <RankedBars label="Lượt chơi theo kịch bản" rows={scenarios.slice(0, 8).map((row) => ({ key: row.scenarioId, label: scenarioName(row), value: row.plays, hint: `Có kết quả ${fmt(row.completed)} · Đạt ${fmt(row.passed)}` }))} />
        </ChartCard>

        <ChartCard title="Theo chế độ" description="Lượt chơi và phiên có kết quả" legend={legendOf(modeSeries, colorAt)} height={150} empty={modes.every((row) => row.plays === 0)} data-testid="chart-modes"
          table={<ReportTable caption="Lượt chơi theo chế độ">
            <thead><tr><th>Chế độ</th><Num header>Lượt chơi</Num><Num header>Có kết quả</Num></tr></thead>
            <tbody>{modes.map((row) => <tr key={row.mode}><td>{row.mode}</td><Num>{fmt(row.plays)}</Num><Num>{fmt(row.completed)}</Num></tr>)}</tbody>
          </ReportTable>}>
          <GroupedBars data={modes} xKey="mode" series={modeSeries} height={150} />
        </ChartCard>

        <ChartCard title="Thời lượng phiên" description="Từ lúc khởi chạy đến lúc kết thúc (giờ máy chủ)" height={120} data-testid="chart-duration">
          <div className={styles.miniRow}>
            <MiniStat label="Trung bình" value={formatSeconds(data.duration.averageSeconds)} />
            <MiniStat label="Trung vị" value={formatSeconds(data.duration.medianSeconds)} />
            <MiniStat label="Số phiên đo" value={fmt(data.duration.sessions)} />
          </div>
          {/* Figma also draws "Phân bố theo nhóm thời lượng": the API returns no duration histogram, so only the three figures are shown. */}
        </ChartCard>
      </div>

      {(data.byTraining.length > 0 || data.byBuilding.length > 0 || data.byOrganization) && <div className={styles.trio}>
        {data.byTraining.length > 0 && <ChartCard title="Theo bài huấn luyện" description="Tối đa 100 bài có nhiều lượt chơi nhất" height={120} data-testid="chart-trainings"
          table={<ReportTable caption="Lượt chơi theo bài huấn luyện">
            <thead><tr><th>Bài</th><Num header>Lượt chơi</Num><Num header>Có kết quả</Num><Num header>Đạt</Num></tr></thead>
            <tbody>{data.byTraining.map((row) => <tr key={row.trainingId}><td>{row.trainingName && <div>{row.trainingName}</div>}<span className={styles.mono}>{row.trainingId}</span></td><Num>{fmt(row.plays)}</Num><Num>{fmt(row.completed)}</Num><Num>{fmt(row.passed)}</Num></tr>)}</tbody>
          </ReportTable>}>
          <RankedBars label="Lượt chơi theo bài huấn luyện" color={seriesColor.plays} rows={data.byTraining.slice(0, 8).map((row) => ({ key: row.trainingId, label: row.trainingName ?? `Bài ${shortId(row.trainingId)}`, value: row.plays, hint: `Có kết quả ${fmt(row.completed)} · Đạt ${fmt(row.passed)}` }))} />
        </ChartCard>}
        {data.byBuilding.length > 0 && <ChartCard title="Theo công trình" description="Tối đa 100 công trình có nhiều lượt chơi nhất" height={120} data-testid="chart-buildings"
          table={<ReportTable caption="Lượt chơi theo công trình">
            <thead><tr><th>Công trình</th><Num header>Lượt chơi</Num><Num header>Học viên</Num><Num header>Có kết quả</Num></tr></thead>
            <tbody>{data.byBuilding.map((row) => <tr key={row.buildingId}><td>{row.buildingName ?? `Công trình ${shortId(row.buildingId)}`}</td><Num>{fmt(row.plays)}</Num><Num>{fmt(row.uniqueTrainees)}</Num><Num>{fmt(row.completed)}</Num></tr>)}</tbody>
          </ReportTable>}>
          <RankedBars label="Lượt chơi theo công trình" color={seriesColor.plays} rows={data.byBuilding.slice(0, 8).map((row) => ({ key: row.buildingId, label: row.buildingName ?? `Công trình ${shortId(row.buildingId)}`, value: row.plays, hint: `Học viên ${fmt(row.uniqueTrainees)} · Có kết quả ${fmt(row.completed)}` }))} />
        </ChartCard>}
        {data.byOrganization && <ChartCard title="Theo tổ chức" description="Tối đa 100 tổ chức có nhiều lượt chơi nhất trong kỳ" height={120} empty={data.byOrganization.length === 0} emptyText="Chưa có tổ chức nào có lượt chơi trong kỳ" data-testid="chart-organizations"
          table={<ReportTable caption="Lượt chơi theo tổ chức">
            <thead><tr><th>Tổ chức</th><Num header>Lượt chơi</Num><Num header>Học viên</Num><Num header>Có kết quả</Num></tr></thead>
            <tbody>{data.byOrganization.map((row) => <tr key={row.organizationId}><td>{organizationName(row.organizationId)}</td><Num>{fmt(row.plays)}</Num><Num>{fmt(row.uniqueTrainees)}</Num><Num>{fmt(row.completed)}</Num></tr>)}</tbody>
          </ReportTable>}>
          <RankedBars label="Lượt chơi theo tổ chức" color={seriesColor.plays} rows={data.byOrganization.slice(0, 8).map((row) => ({
            key: row.organizationId,
            label: showOrganizationLinks ? <Link href={`${routes.adminOrganizations}/${row.organizationId}/analytics`}>{organizationName(row.organizationId)}</Link> : organizationName(row.organizationId),
            value: row.plays,
            hint: `Học viên ${fmt(row.uniqueTrainees)} · Có kết quả ${fmt(row.completed)}`,
          }))} />
        </ChartCard>}
      </div>}
    </>}

    {data.cohorts && groupBy && !timeSeries && <Panel title={`Nhóm số liệu · theo ${GROUP_LABELS[groupBy].toLowerCase()}`} description="Mỗi nhóm đếm học viên khác nhau riêng, không cộng dồn giữa các nhóm." data-testid="card-cohorts">
      {data.cohorts.length ? <CohortTable rows={data.cohorts} /> : <p className={styles.muted}>Chưa có nhóm nào trong kỳ.</p>}
    </Panel>}

    {data.aiUsage && <AiUsageCard usage={data.aiUsage} />}

    {Object.keys(data.definitions).length > 0 && <details className={styles.definitions}>
      <summary>Định nghĩa số liệu (từ máy chủ)</summary>
      <dl>{Object.entries(data.definitions).map(([key, text]) => <div key={key}><dt><StatusBadge tone="neutral">{key}</StatusBadge></dt><dd>{text}</dd></div>)}</dl>
    </details>}

    <Drawer open={scenarioTable} onOpenChange={setScenarioTable} size="lg" title="Theo kịch bản" description={`${fmt(scenarios.length)} kịch bản có lượt chơi trong kỳ (tối đa 100).`} flush data-testid="drawer-scenarios">
      <ReportTable caption="Lượt chơi theo kịch bản" className={styles.drawerTable}>
        <thead><tr><th>Kịch bản</th><Num header>Lượt chơi</Num><Num header>Học viên</Num><Num header>Có kết quả</Num><Num header>Đạt</Num></tr></thead>
        <tbody>{scenarios.map((row) => <tr key={row.scenarioId}><td>{scenarioName(row)}</td><Num>{fmt(row.plays)}</Num><Num>{fmt(row.uniqueTrainees)}</Num><Num>{fmt(row.completed)}</Num><Num><StatusBadge tone={row.passed > 0 ? "success" : "neutral"}>{fmt(row.passed)}</StatusBadge></Num></tr>)}</tbody>
      </ReportTable>
    </Drawer>
  </div>;
}

function CohortTable({ rows }: { rows: NonNullable<TrainingReport["cohorts"]> }) {
  return <ReportTable caption="Số liệu theo nhóm">
    <thead><tr><th>Nhóm</th><Num header>Lượt chơi</Num><Num header>Học viên</Num><Num header>Có kết quả</Num><Num header>Bỏ dở</Num><Num header>Chờ đồng bộ</Num><Num header>Đạt / chấm</Num><Num header>Tỷ lệ đạt</Num><Num header>Thời lượng TB</Num></tr></thead>
    <tbody>{rows.map((row) => <tr key={row.key}><td>{row.label}</td><Num>{fmt(row.plays)}</Num><Num>{fmt(row.uniqueTrainees)}</Num><Num>{fmt(row.completed)}</Num><Num>{fmt(row.abandoned)}</Num><Num>{fmt(row.awaitingSync)}</Num><Num>{fmt(row.passed)} / {fmt(row.assessed)}</Num><Num>{formatRate(row.passRate, "—")}</Num><Num>{formatSeconds(row.averageDurationSeconds)}</Num></tr>)}</tbody>
  </ReportTable>;
}
