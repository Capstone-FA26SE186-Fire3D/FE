"use client";

import Link from "next/link";
import { Panel, Stat } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table } from "@/components/ui/table";
import { routes } from "@/configs/routes";
import { fmt, formatRate, formatSeconds, shortId } from "../format";
import type { AiUsage, TrainingReport } from "../types";
import { DataTable, EmptyReport, outcomeLabels, OutcomeBar, PairBars } from "./charts";
import styles from "./analytics.module.css";

const modeLabels: Record<string, string> = { Learn: "Learn", Guided: "Hướng dẫn (Guided Drill)", Assessment: "Đánh giá (Assessment)" };
// v7 request statuses (BE#89). analytics_ai_usage on BE main still keys `requests` by the pre-v7 names, which no row has
// after the migration (always 0): those keys are hidden rather than shown as statuses that no longer exist.
const aiStatusLabels: Record<string, string> = { Accepted: "Đang chờ", Processing: "Đang xử lý", Succeeded: "Thành công", Failed: "Thất bại", NeedsReconcile: "Cần đối soát", Rejected: "Bị từ chối" };
const LEGACY_AI_STATUSES = new Set(["Queued", "Running", "InsufficientEvidence", "SafetyRejected"]);

function AiUsagePanel({ usage }: { usage: AiUsage }) {
  const settled = usage.settledUnits;
  const statuses = Object.entries(usage.requests).filter(([status]) => !LEGACY_AI_STATUSES.has(status));
  return <Panel title="Sử dụng AI" description="Đơn vị quota đã chốt trong kỳ; đặt trước và cần đối soát là số hiện tại, tính riêng.">
    <div className="ops-stack">
      <div className="ops-grid ops-grid-3">
        <Stat label="Đã chốt (trong kỳ)" value={settled.length ? settled.map((item) => `${fmt(item.units)} ${item.quotaUnit}`).join(" · ") : "0"} hint={settled.length ? undefined : "Chưa dùng quota nào trong kỳ"} />
        <Stat label="Đang đặt trước (hiện tại)" value={usage.openReservations.length ? usage.openReservations.map((item) => `${fmt(item.units)} ${item.quotaUnit}`).join(" · ") : "0"} />
        <Stat label="Cần đối soát (hiện tại)" value={fmt(usage.needsReconcile.requests)} hint={`${fmt(usage.needsReconcile.reservedUnits)} đơn vị đang giữ chỗ`} />
      </div>
      {statuses.length > 0 && <>
        <ul className={styles.rows} aria-label="Yêu cầu AI theo trạng thái (tạo trong kỳ)">
          {statuses.map(([status, count]) => <li key={status} className={styles.row}><span>{aiStatusLabels[status] ?? status}</span><strong>{fmt(count)}</strong></li>)}
        </ul>
      </>}
    </div>
  </Panel>;
}

/**
 * Training report of the cohort of real learner sessions started in the period. Playtests and package preparation are
 * never counted (server definition). Empty periods are an explanation, not an error.
 */
export function TrainingReportView({ data, organizationNames, showOrganizationLinks }: { data: TrainingReport; organizationNames?: Map<string, string>; showOrganizationLinks?: boolean }) {
  const empty = data.plays === 0;
  const assessmentText = data.assessment.assessed > 0 ? `${fmt(data.assessment.passed)} đạt / ${fmt(data.assessment.assessed)} phiên có chấm điểm` : "Chưa có phiên Đạt/Chưa đạt";
  return <>
    <p className={styles.note}>
      Chỉ tính <strong>phiên học thật</strong> (học viên bắt đầu trong khoảng thời gian). <strong>Không tính</strong> playtest của tổ chức và bước chuẩn bị gói. Hoàn thành tách khỏi đạt/chưa đạt; không phải chứng chỉ.
    </p>

    <div className="ops-grid ops-grid-4" style={{ marginBottom: 16 }}>
      <Stat label="Lượt chơi (trong kỳ)" value={fmt(data.plays)} hint="Phiên bắt đầu trong kỳ" />
      <Stat label="Học viên khác nhau" value={fmt(data.uniqueTrainees)} hint="Đếm một lần dù chơi nhiều phiên" />
      <Stat label="Đã có kết quả" value={fmt(data.completed)} hint={`Tỷ lệ ${formatRate(data.completionRate, "chưa có mẫu (0 lượt chơi)")}`} />
      <Stat label="Đang chơi (hiện tại)" value={fmt(data.activeSessions)} hint={data.activeWindowSeconds ? `Có nhịp trong ${fmt(data.activeWindowSeconds)} giây gần nhất; không theo kỳ` : "Không theo kỳ"} />
    </div>

    {empty && <EmptyReport title="Chưa có lượt chơi trong khoảng thời gian này">Đây là kết quả hợp lệ, không phải lỗi. Thử mở rộng khoảng thời gian (tối đa 90 ngày) hoặc kiểm tra Building đã có kịch bản phát hành và học viên đã bắt đầu phiên. Playtest và bước chuẩn bị gói không được tính.</EmptyReport>}

    {!empty && <div className="ops-grid ops-grid-2">
      <Panel title="Kết quả của phiên" description="Kết quả do máy chủ ghi nhận. Phiên chưa có kết quả không nằm trong các nhóm này.">
        <OutcomeBar outcomes={data.outcomes} total={data.completed} />
        <p className={styles.note} style={{ marginTop: 12 }}>Tỷ lệ đạt = Đạt / (Đạt + Chưa đạt): <strong>{formatRate(data.assessment.passRate, "chưa có mẫu")}</strong> · {assessmentText}</p>
        <DataTable caption="Kết quả của phiên">
          <thead><tr><th>Kết quả</th><th className={styles.num}>Số phiên</th></tr></thead>
          <tbody>{(Object.keys(outcomeLabels) as Array<keyof typeof outcomeLabels>).map((outcome) => <tr key={outcome}><td>{outcomeLabels[outcome]}</td><td className={styles.num}>{fmt(data.outcomes[outcome])}</td></tr>)}</tbody>
        </DataTable>
      </Panel>

      <Panel title="Thời lượng" description="Từ lúc khởi chạy đến lúc kết thúc của phiên đã có kết quả (giờ máy chủ).">
        <div className="ops-grid ops-grid-3">
          <Stat label="Trung bình" value={formatSeconds(data.duration.averageSeconds)} />
          <Stat label="Trung vị" value={formatSeconds(data.duration.medianSeconds)} />
          <Stat label="Số phiên đo được" value={fmt(data.duration.sessions)} />
        </div>
      </Panel>

      <Panel title="Theo chế độ" description="Lượt chơi (thanh xanh) và số phiên đã có kết quả (thanh cam).">
        <PairBars label="Lượt chơi theo chế độ" rows={data.byMode.map((row) => ({ key: row.mode, label: modeLabels[row.mode] ?? row.mode, plays: row.plays, completed: row.completed }))} />
        <DataTable caption="Lượt chơi theo chế độ">
          <thead><tr><th>Chế độ</th><th className={styles.num}>Lượt chơi</th><th className={styles.num}>Có kết quả</th></tr></thead>
          <tbody>{data.byMode.map((row) => <tr key={row.mode}><td>{modeLabels[row.mode] ?? row.mode}</td><td className={styles.num}>{fmt(row.plays)}</td><td className={styles.num}>{fmt(row.completed)}</td></tr>)}</tbody>
        </DataTable>
      </Panel>

      <Panel title="Theo bài huấn luyện" description="Tối đa 100 bài có nhiều lượt chơi nhất. API chỉ trả mã bài, chưa có tên.">
        {data.byTraining.length ? <>
          <PairBars label="Lượt chơi theo bài huấn luyện" rows={data.byTraining.slice(0, 8).map((row) => ({ key: row.trainingId, label: `Bài ${shortId(row.trainingId)}`, plays: row.plays, completed: row.completed }))} />
          <DataTable caption="Lượt chơi theo bài huấn luyện" summary={`Xem bảng đầy đủ (${data.byTraining.length} bài)`}>
            <thead><tr><th>Mã bài</th><th className={styles.num}>Lượt chơi</th><th className={styles.num}>Có kết quả</th><th className={styles.num}>Đạt</th></tr></thead>
            <tbody>{data.byTraining.map((row) => <tr key={row.trainingId}><td><span className={styles.mono}>{row.trainingId}</span></td><td className={styles.num}>{fmt(row.plays)}</td><td className={styles.num}>{fmt(row.completed)}</td><td className={styles.num}>{fmt(row.passed)}</td></tr>)}</tbody>
          </DataTable>
        </> : <p className={styles.muted}>Chưa có bài huấn luyện nào có lượt chơi trong kỳ.</p>}
      </Panel>
    </div>}

    {data.byOrganization && <Panel title="Theo tổ chức" description="Tối đa 100 tổ chức có nhiều lượt chơi nhất trong kỳ." style={{ marginTop: 16 }}>
      {data.byOrganization.length ? <Table caption="Lượt chơi theo tổ chức">
        <thead><tr><th>Tổ chức</th><th className={styles.num}>Lượt chơi</th><th className={styles.num}>Học viên</th><th className={styles.num}>Có kết quả</th></tr></thead>
        <tbody>{data.byOrganization.map((row) => {
          const name = organizationNames?.get(row.organizationId);
          return <tr key={row.organizationId}>
            <td>{showOrganizationLinks ? <Link href={`${routes.adminOrganizations}/${row.organizationId}/analytics`}>{name ?? `Tổ chức ${shortId(row.organizationId)}`}</Link> : name ?? `Tổ chức ${shortId(row.organizationId)}`}</td>
            <td className={styles.num}>{fmt(row.plays)}</td><td className={styles.num}>{fmt(row.uniqueTrainees)}</td><td className={styles.num}>{fmt(row.completed)}</td>
          </tr>;
        })}</tbody>
      </Table> : <p className={styles.muted}>Chưa có tổ chức nào có lượt chơi trong kỳ.</p>}
    </Panel>}

    {data.aiUsage && <div style={{ marginTop: 16 }}><AiUsagePanel usage={data.aiUsage} /></div>}

    {Object.keys(data.definitions).length > 0 && <details className={styles.tableToggle}>
      <summary>Định nghĩa số liệu (từ máy chủ)</summary>
      <dl className="ops-stack" style={{ margin: "10px 0 0", gap: 8 }}>{Object.entries(data.definitions).map(([key, text]) => <div key={key}><dt><StatusBadge tone="neutral">{key}</StatusBadge></dt><dd style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: 13 }}>{text}</dd></div>)}</dl>
    </details>}
  </>;
}
