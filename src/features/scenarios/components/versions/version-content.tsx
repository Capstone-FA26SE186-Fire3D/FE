import { Lock } from "lucide-react";

import { Alert } from "@/components/ui/alert";
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
    <summary style={{ cursor: "pointer", minHeight: 32, color: "var(--muted)", fontSize: 13 }}>{title}</summary>
    <pre className="ver-code" tabIndex={0} aria-label={`${title} (JSON, chỉ đọc)`}>{JSON.stringify(value, null, 2) ?? "null"}</pre>
  </details>;
}

/** Read-only view of the frozen snapshot: content, learner text and rubric. Nothing here is editable. */
export function VersionContent({ version }: { version: ScenarioVersionDetail }) {
  const rubric = version.rubric;
  const criteria = rubric?.criteria ?? [];
  const configuration = Object.entries(version.configuration ?? {});
  return <div className="ops-stack">
    <Alert tone="info" title="Phiên bản đã đóng băng">
      <Lock size={12} aria-hidden="true" style={{ display: "inline", marginRight: 4 }} />Nội dung bên dưới là snapshot bất biến. Muốn thay đổi, hãy sửa draft rồi tạo version mới; version mới phải gửi duyệt lại.
    </Alert>
    <Panel title="Thông tin phiên bản" bodyClassName="ops-stack">
      <dl className="ver-dl">
        <dt>Phiên bản</dt><dd>v{version.versionNumber} · {version.name}</dd>
        <dt>Mã version</dt><dd className="ver-hash">{version.id}</dd>
        <dt>Hash nội dung</dt><dd className="ver-hash" data-testid="scenario-hash">{version.scenarioHash}</dd>
        <dt>Revision IFC</dt><dd className="ver-hash">{version.revisionId}</dd>
        <dt>Schema / thuật toán</dt><dd>{version.schemaVersion} / {version.algorithmVersion}</dd>
        <dt>Giới hạn thời gian</dt><dd>{version.timeLimitSeconds} giây</dd>
        <dt>Seed ngẫu nhiên</dt><dd>{version.randomSeed}</dd>
        <dt>Tạo lúc</dt><dd>{formatDateTime(version.createdAt)}</dd>
      </dl>
    </Panel>
    <Panel title="Mục tiêu và hướng dẫn cho người học">
      {version.learningObjectives?.length
        ? <ol className="ver-list">{version.learningObjectives.map((objective, index) => <li key={index}>{objective}</li>)}</ol>
        : <p className="ver-note">Snapshot này không có mục tiêu học tập.</p>}
      <p className="ver-section-title" style={{ marginTop: 16 }}>Hướng dẫn</p>
      <p className="ver-note" style={{ whiteSpace: "pre-wrap" }}>{version.learnerInstructions || "Snapshot này không có hướng dẫn."}</p>
    </Panel>
    <Panel
      title="Rubric"
      description="Chỉ đọc. Hash rubric do BE tính khi gửi duyệt."
      actions={rubric ? <StatusBadge tone="neutral">Ngưỡng đạt {rubric.pass_threshold ?? "—"}</StatusBadge> : undefined}
    >
      {criteria.length
        ? <Table caption="Tiêu chí rubric">
          <thead><tr><th>Tiêu chí</th><th>Chỉ số</th><th>Điều kiện</th><th>Trọng số</th><th>Bắt buộc</th></tr></thead>
          <tbody>{criteria.map((criterion) => <tr key={criterion.id}>
            <td className="ops-cell-primary">{criterion.id}</td>
            <td>{criterion.metric}</td>
            <td>{operatorLabel[criterion.operator] ?? criterion.operator} {criterion.threshold}</td>
            <td>{criterion.weight}</td>
            <td>{criterion.mandatory ? "Có" : "Không"}</td>
          </tr>)}</tbody>
        </Table>
        : <p className="ver-note">Snapshot không có rubric. BE sẽ không nhận gửi duyệt khi thiếu rubric.</p>}
    </Panel>
    <Panel title="Cấu hình mô phỏng" description="JSON đã đóng băng, chỉ đọc." bodyClassName="ops-stack">
      {configuration.map(([key, value]) => <JsonBlock key={key} title={key} value={value} />)}
      {version.stateSnapshot != null && <JsonBlock title="stateSnapshot" value={version.stateSnapshot} />}
    </Panel>
  </div>;
}
