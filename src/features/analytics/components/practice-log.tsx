"use client";

import { Panel } from "@/components/ui/panel";
import { fmt, formatRate, formatSeconds } from "../format";
import type { TrainingReport } from "../types";
import { Num, ReportTable } from "./charts";
import styles from "./analytics.module.css";

/** Shown under the table and as the first line of the exported file (Docs FR-PLAN-11). */
export const PRACTICE_LOG_NOTE = "Số liệu luyện tập trên mô phỏng, mang tính hỗ trợ, không thay buổi thực tập phương án.";

/** The exported file always starts with the note; the server will add the same line later (BE#218), so never twice. */
export const withPracticeLogNote = (csv: string) => (csv.replace(/^﻿/, "").startsWith(PRACTICE_LOG_NOTE) ? csv : `${PRACTICE_LOG_NOTE}\n${csv}`);

/**
 * Practice log: one row per scenario played in the period (the training report grouped by scenario). The last practice
 * date and scenarios nobody practised are not in the API yet (BE#218), so they are not drawn.
 */
export function PracticeLogView({ data }: { data: TrainingReport }) {
  const rows = data.cohorts ?? [];
  return <Panel title="Nhật ký luyện tập theo kịch bản" description="Mỗi dòng là một kịch bản có lượt luyện tập trong kỳ. Học viên được đếm riêng theo từng kịch bản." data-testid="card-practice-log">
    {rows.length
      ? <ReportTable caption="Nhật ký luyện tập theo kịch bản">
        <thead><tr><th>Kịch bản</th><Num header>Số lượt</Num><Num header>Số người</Num><Num header>Đạt / đã chấm</Num><Num header>Tỷ lệ đạt</Num><Num header>Thời gian trung bình</Num></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.key}><td>{row.label}</td><Num>{fmt(row.plays)}</Num><Num>{fmt(row.uniqueTrainees)}</Num><Num>{fmt(row.passed)} / {fmt(row.assessed)}</Num><Num>{formatRate(row.passRate, "—")}</Num><Num>{formatSeconds(row.averageDurationSeconds, "—")}</Num></tr>)}</tbody>
      </ReportTable>
      : <p className={styles.muted}>Chưa có lượt luyện tập nào trong kỳ này.</p>}
    <p className={styles.note} style={{ marginTop: 12 }}>{PRACTICE_LOG_NOTE}</p>
  </Panel>;
}
