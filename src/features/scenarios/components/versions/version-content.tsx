import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table } from "@/components/ui/table";

import type { ScenarioVersionDetail } from "../../version-types";

export const formatDateTime = (value: string | null | undefined) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" });
};

const operatorLabel: Record<string, string> = { gte: "≥", lte: "≤", eq: "=" };

function JsonBlock({ title, value }: { title: string; value: unknown }) {
  return <details>
    <summary style={{ cursor: "pointer", minHeight: 44, color: "var(--muted)", fontSize: 13 }}>{title}</summary>
    <pre className="ver-code" tabIndex={0} aria-label={`${title} (JSON, chỉ đọc)`}>{JSON.stringify(value, null, 2) ?? "null"}</pre>
  </details>;
}

/** Read-only view of the frozen snapshot: content, learner text and rubric. Nothing here is editable. */
export function VersionContent({ version }: { version: ScenarioVersionDetail }) {
  const rubric = version.rubric;
  const criteria = rubric?.criteria ?? [];
  const configuration = Object.entries(version.configuration ?? {});
  return <div className="ops-stack">
    <Panel title="Thông tin phiên bản" bodyClassName="ops-stack">
      <dl className="ver-dl">
        <dt>Phiên bản</dt><dd>v{version.versionNumber} · {version.name}</dd>
        <dt>Thời gian làm bài</dt><dd>{version.timeLimitSeconds} giây</dd>
        <dt>Tạo lúc</dt><dd>{formatDateTime(version.createdAt)}</dd>
      </dl>
      <details className="support-code">
        <summary>Thông tin cho bộ phận hỗ trợ</summary>
        <span>Mã phiên bản: <code className="ver-hash">{version.id}</code></span>
        <span>Mã nội dung: <code className="ver-hash" data-testid="scenario-hash">{version.scenarioHash}</code></span>
        <span>Bản IFC: <code className="ver-hash">{version.revisionId}</code></span>
        <span>Định dạng: <code className="ver-hash">{version.schemaVersion} / {version.algorithmVersion} · seed {version.randomSeed}</code></span>
      </details>
    </Panel>
    <Panel title="Mục tiêu và hướng dẫn cho người học">
      {version.learningObjectives?.length
        ? <ol className="ver-list">{version.learningObjectives.map((objective, index) => <li key={index}>{objective}</li>)}</ol>
        : <p className="ver-note">Phiên bản này không có mục tiêu học tập.</p>}
      <p className="ver-section-title" style={{ marginTop: 16 }}>Hướng dẫn</p>
      <p className="ver-note" style={{ whiteSpace: "pre-wrap" }}>{version.learnerInstructions || "Phiên bản này không có hướng dẫn."}</p>
    </Panel>
    <Panel
      title="Tiêu chí chấm điểm"
      description="Chỉ đọc. Muốn đổi, sửa bản nháp rồi tạo phiên bản mới."
      actions={rubric ? <StatusBadge tone="neutral">Ngưỡng đạt {rubric.pass_threshold ?? "—"}</StatusBadge> : undefined}
    >
      {criteria.length
        ? <Table caption="Tiêu chí chấm điểm">
          <thead><tr><th>Tiêu chí</th><th>Đo bằng</th><th>Điều kiện</th><th>Trọng số</th><th>Bắt buộc</th></tr></thead>
          <tbody>{criteria.map((criterion) => <tr key={criterion.id}>
            <td className="ops-cell-primary">{criterion.id}</td>
            <td>{criterion.metric}</td>
            <td>{operatorLabel[criterion.operator] ?? criterion.operator} {criterion.threshold}</td>
            <td>{criterion.weight}</td>
            <td>{criterion.mandatory ? "Có" : "Không"}</td>
          </tr>)}</tbody>
        </Table>
        : <p className="ver-note">Phiên bản này chưa có tiêu chí chấm nên không gửi duyệt được.</p>}
    </Panel>
    <Panel title="Cấu hình mô phỏng (cho kỹ thuật)" description="Dữ liệu gốc của phiên bản, chỉ đọc. Thường không cần xem." bodyClassName="ops-stack">
      {configuration.map(([key, value]) => <JsonBlock key={key} title={key} value={value} />)}
      {version.stateSnapshot != null && <JsonBlock title="stateSnapshot" value={version.stateSnapshot} />}
    </Panel>
  </div>;
}
