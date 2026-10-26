import { Lock } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table } from "@/components/ui/table";
import { SupportCode } from "@/components/ui/support-code";
import { fieldName } from "@/features/library/errors";
import { metricName } from "@/features/training-history/labels";
import type { ReviewDetail } from "../types";

const JSON_LIMIT = 30000;
const operatorLabel: Record<string, string> = { gte: "≥", lte: "≤", eq: "=" };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

function describe(value: unknown): string {
  if (Array.isArray(value)) return `${value.length} mục`;
  if (isRecord(value)) return `${Object.keys(value).length} thông tin`;
  if (typeof value === "string") return value.length > 80 ? `${value.slice(0, 80)}…` : value || "(rỗng)";
  return String(value);
}

/** Pretty JSON as TEXT (React escapes it; nothing here is ever parsed as HTML). Very large nodes are cut. */
function JsonText({ value, label }: { value: unknown; label: string }) {
  const text = JSON.stringify(value, null, 2) ?? "null";
  const cut = text.length > JSON_LIMIT;
  return <>
    <pre className="rev-code" tabIndex={0} aria-label={`${label} (thông tin kỹ thuật, chỉ đọc)`}>{cut ? text.slice(0, JSON_LIMIT) : text}</pre>
    {cut && <p className="rev-note">Đã cắt bớt {text.length - JSON_LIMIT} ký tự cuối để trang không bị chậm.</p>}
  </>;
}

/** Collapsible summary of a JSON node: one line per top-level field, each expandable. */
export function JsonSummary({ value, label }: { value: unknown; label: string }) {
  if (!isRecord(value)) {
    return <details className="rev-json"><summary>{label}: {describe(value)}</summary><JsonText value={value} label={label} /></details>;
  }
  const entries = Object.entries(value);
  if (!entries.length) return <p className="rev-note">Không có trường nào.</p>;
  return <ul className="rev-json-list">
    {entries.map(([key, item]) => <li key={key}>
      {isRecord(item) || Array.isArray(item)
        ? <details className="rev-json"><summary><span className="rev-json-key">{fieldName(key)}</span><span className="rev-json-sum">{describe(item)}</span></summary><JsonText value={item} label={`${label} · ${fieldName(key)}`} /></details>
        : <div className="rev-json-flat"><span className="rev-json-key">{fieldName(key)}</span><span className="rev-json-sum">{describe(item)}</span></div>}
    </li>)}
  </ul>;
}

function Objectives({ value }: { value: unknown }) {
  if (value == null) return <p className="rev-note">Phiên bản này không có mục tiêu học tập (bản cũ chưa lưu).</p>;
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return value.length ? <ol className="rev-list">{(value as string[]).map((objective, index) => <li key={index}>{objective}</li>)}</ol> : <p className="rev-note">Danh sách mục tiêu rỗng.</p>;
  }
  return <JsonSummary value={value} label="Mục tiêu học tập" />;
}

function Rubric({ value }: { value: unknown }) {
  if (value == null) return <p className="rev-note">Phiên bản này không có tiêu chí chấm điểm (bản cũ chưa lưu). Không có gì để duyệt ở phần này.</p>;
  const criteria = isRecord(value) && Array.isArray(value.criteria) ? value.criteria : null;
  if (!isRecord(value) || !criteria || !criteria.every(isRecord)) return <JsonSummary value={value} label="Tiêu chí chấm điểm" />;
  const threshold = value.pass_threshold;
  return <>
    {threshold !== undefined && <p className="rev-note">Ngưỡng đạt: <strong>{String(threshold)}</strong></p>}
    {criteria.length
      ? <Table caption="Tiêu chí chấm điểm đã khóa">
        <thead><tr><th>Tiêu chí</th><th>Điều kiện</th><th>Trọng số</th><th>Bắt buộc</th></tr></thead>
        <tbody>{(criteria as Record<string, unknown>[]).map((criterion, index) => <tr key={`${String(criterion.id ?? index)}-${index}`}>
          <td className="ops-cell-primary">{criterion.metric !== undefined ? metricName(String(criterion.metric)) : "—"}<SupportCode code={criterion.id !== undefined ? String(criterion.id) : undefined} /></td>
          <td>{criterion.operator !== undefined ? `${operatorLabel[String(criterion.operator)] ?? String(criterion.operator)} ${String(criterion.threshold ?? "")}` : "—"}</td>
          <td>{String(criterion.weight ?? "—")}</td>
          <td>{criterion.mandatory ? <StatusBadge tone="info">Bắt buộc</StatusBadge> : "Không"}</td>
        </tr>)}</tbody>
      </Table>
      : <p className="rev-note">Chưa có tiêu chí chấm điểm nào.</p>}
    {isRecord(value) && Object.keys(value).some((key) => key !== "criteria" && key !== "pass_threshold") && <JsonSummary value={Object.fromEntries(Object.entries(value).filter(([key]) => key !== "criteria" && key !== "pass_threshold"))} label="Thông tin khác của tiêu chí chấm điểm" />}
  </>;
}

/** Frozen content under review. Read-only: the decision applies to exactly these bytes (contentHash/rubricHash). */
export function ReviewContent({ detail }: { detail: ReviewDetail }) {
  return <div className="ops-stack">
    <Alert tone="info" title="Nội dung đã khóa">
      <Lock size={12} aria-hidden="true" style={{ display: "inline", marginRight: 4 }} />Đây là nội dung của đúng phiên bản được gửi và không thay đổi được. Nếu bị từ chối, tổ chức sửa bản nháp và tạo phiên bản mới để gửi duyệt lại.
    </Alert>
    <Panel title="Mục tiêu học tập" bodyClassName="ops-stack"><Objectives value={detail.learningObjectives} /></Panel>
    <Panel title="Hướng dẫn cho người học">
      {detail.learnerInstructions
        ? <p className="rev-text" data-testid="review-instructions">{detail.learnerInstructions}</p>
        : <p className="rev-note">Phiên bản này không có hướng dẫn (bản cũ chưa lưu).</p>}
    </Panel>
    <Panel title="Tiêu chí chấm điểm (rubric)" description="Tiêu chí chấm điểm đã khóa cùng phiên bản." bodyClassName="ops-stack"><Rubric value={detail.rubric} /></Panel>
    <Panel title="Nội dung kịch bản" description="Tóm tắt theo từng phần; mở từng mục để xem dữ liệu gốc (chỉ đọc)." bodyClassName="ops-stack">
      {detail.content == null
        ? <p className="rev-note">Phiên bản này không có nội dung kịch bản (bản cũ chưa lưu). Hệ thống không tự bổ sung dữ liệu.</p>
        : <JsonSummary value={detail.content} label="Nội dung kịch bản" />}
    </Panel>
  </div>;
}
