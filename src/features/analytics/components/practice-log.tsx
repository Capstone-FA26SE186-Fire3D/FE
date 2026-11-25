"use client";

import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { audienceLabel, workingHoursLabel } from "@/features/scenario-editor/v1/contract";

import { fmt, formatRate, formatSeconds } from "../format";
import { lastPlayedText, PRACTICE_LOG_NOTE } from "../practice-log-model";
import type { TrainingReport } from "../types";
import { Num, ReportTable } from "./charts";
import styles from "./analytics.module.css";

export { PRACTICE_LOG_NOTE, withPracticeLogNote } from "../practice-log-model";

/**
 * Practice log (BE#218, FR-PLAN-11): one row per situation over the last 12 months, the training report grouped by scenario.
 * A published situation nobody practised in that window is listed with 0 plays, so the Organization sees what Điều 16
 * Nghị định 105/2025/NĐ-CP asks to practise at least once a year.
 */
export function PracticeLogView({ data }: { data: TrainingReport }) {
  const rows = data.cohorts ?? [];
  const idle = rows.filter((row) => row.plays === 0).length;
  return <Panel title="Nhật ký luyện tập theo tình huống" description="12 tháng gần nhất. Mỗi dòng là một tình huống; tình huống đang phát hành mà chưa có lượt luyện nào cũng được liệt kê. Học viên được đếm riêng theo từng tình huống." data-testid="card-practice-log">
    {idle > 0 && <p className={styles.note} data-testid="practice-log-idle" style={{ marginBottom: 12 }}>Có {fmt(idle)} tình huống chưa được luyện trong 12 tháng gần nhất. Mỗi tình huống của phương án cần được luyện ít nhất một lần mỗi năm.</p>}
    {rows.length
      ? <ReportTable caption="Nhật ký luyện tập theo tình huống">
        <thead><tr><th>Tình huống</th><th>Đối tượng</th><th>Thời gian xảy ra</th><th>Lần luyện gần nhất</th><Num header>Số lượt</Num><Num header>Số người</Num><Num header>Đạt / đã chấm</Num><Num header>Tỷ lệ đạt</Num><Num header>Thời gian trung bình</Num></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.key} data-testid="practice-log-row">
          <td>{row.label}</td>
          <td>{audienceLabel(row.audience) ?? "—"}</td>
          <td>{workingHoursLabel(row.workingHours) ?? "—"}</td>
          <td>{row.plays === 0 ? <StatusBadge tone="warning">Chưa luyện trong năm</StatusBadge> : lastPlayedText(row.lastPlayedAt) ?? "—"}</td>
          <Num>{fmt(row.plays)}</Num><Num>{fmt(row.uniqueTrainees)}</Num><Num>{fmt(row.passed)} / {fmt(row.assessed)}</Num><Num>{formatRate(row.passRate, "—")}</Num><Num>{formatSeconds(row.averageDurationSeconds, "—")}</Num>
        </tr>)}</tbody>
      </ReportTable>
      : <p className={styles.muted}>Chưa có tình huống nào được phát hành hoặc luyện tập trong 12 tháng gần nhất.</p>}
    <p className={styles.note} style={{ marginTop: 12 }}>{PRACTICE_LOG_NOTE}</p>
  </Panel>;
}
