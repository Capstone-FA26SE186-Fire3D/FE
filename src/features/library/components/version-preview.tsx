import { DetailList, formatDateTime } from "@/components/ops/detail-parts";
import { Alert } from "@/components/ui/alert";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table } from "@/components/ui/table";
import { isObject } from "@/features/scenario-editor/store/json";
import { summarizeField } from "../apply";
import { TEMPLATE_FIELDS, ignoredTemplateParts, templateFieldLabel } from "../payload";
import { kindLabel, type LibraryVersion } from "../types";
import { capabilityName } from "@/configs/capability-labels";
import { SupportCode } from "@/components/ui/support-code";
import { metricName, operatorSymbol } from "@/features/training-history/labels";

export const NO_CAPABILITY_NOTICE = "Thông tin thiết bị không thêm tính năng cho ứng dụng. Tính năng của đối tượng vẫn lấy từ danh mục của ứng dụng FET3D.";

function RubricTable({ rubric }: { rubric: unknown }) {
  const criteria = isObject(rubric) && Array.isArray(rubric.criteria) ? rubric.criteria.filter(isObject) : [];
  if (!isObject(rubric)) return null;
  return <div className="ops-stack" data-testid="rubric-view">
    <DetailList columns={3} items={[
      { label: "Phiên bản tiêu chí", value: typeof rubric.schema_version === "string" ? rubric.schema_version : "—" },
      { label: "Ngưỡng đạt", value: typeof rubric.pass_threshold === "number" ? rubric.pass_threshold : "—" },
      { label: "Số tiêu chí", value: criteria.length },
    ]} />
    {criteria.length > 0 && <Table caption="Tiêu chí chấm điểm">
      <thead><tr><th>Tiêu chí</th><th>Điều kiện</th><th>Trọng số</th><th>Bắt buộc</th></tr></thead>
      <tbody>{criteria.map((item, index) => <tr key={`${String(item.id)}-${index}`}>
        <td className="ops-cell-primary">{metricName(String(item.metric ?? ""))}<SupportCode code={String(item.id ?? "") || undefined} /></td><td>{operatorSymbol(String(item.operator ?? ""))} {String(item.threshold ?? "")}</td><td>{String(item.weight ?? "")}</td><td>{item.mandatory === true ? "Có" : "Không"}</td>
      </tr>)}</tbody>
    </Table>}
  </div>;
}

/**
 * Read-only view of one library version: what it carries per kind, its capabilities and its immutable hash. Used for a Published
 * version in the admin screen and for what an organization is about to apply, so both read the same words.
 */
export function VersionPreview({ version, compact = false }: { version: LibraryVersion; compact?: boolean }) {
  const payload = version.payload;
  const state = isObject(payload.state) ? payload.state : {};
  const ignored = version.kind === "ScenarioTemplate" ? ignoredTemplateParts(state) : [];
  const properties = isObject(payload.properties) ? Object.entries(payload.properties) : [];
  return <div className="ops-stack" data-testid="version-preview">
    <DetailList columns={3} items={[
      { label: "Loại", value: kindLabel[version.kind] },
      { label: "Phiên bản", value: <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>v{version.versionNumber}<StatusBadge tone={version.status === "Published" ? "success" : "warning"}>{version.status === "Published" ? "Đã xuất bản" : "Bản nháp"}</StatusBadge></span> },
      { label: "Xuất bản", value: formatDateTime(version.publishedAt) },
    ]} />
    {!compact && version.payloadHash && <SupportCode id={version.payloadHash} />}
    {typeof payload.description === "string" && <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, overflowWrap: "anywhere" }}>{payload.description}</p>}

    {version.kind === "ScenarioTemplate" && <>
      <dl className="ops-stack" style={{ margin: 0 }}>
        {TEMPLATE_FIELDS.filter((field) => field !== "rubric" && state[field] !== undefined).map((field) => <div key={field}><dt className="ops-field-hint" style={{ margin: 0 }}>{templateFieldLabel[field]}</dt><dd style={{ margin: "2px 0 0", fontSize: 14, overflowWrap: "anywhere" }}>{summarizeField(field, state[field])}</dd></div>)}
      </dl>
      {state.rubric !== undefined && <div><p className="ops-field-label" style={{ margin: "0 0 6px" }}>Tiêu chí chấm điểm (rubric)</p><RubricTable rubric={state.rubric} /></div>}
      {ignored.length > 0 && <Alert tone="info" title="Phần không áp dụng">Kịch bản mẫu này còn mang {ignored.join(", ")}. Các phần đó phụ thuộc công trình cụ thể nên tổ chức không nhận khi áp dụng.</Alert>}
    </>}

    {version.kind === "RubricSample" && <RubricTable rubric={payload.rubric} />}

    {version.kind === "Equipment" && <>
      {properties.length > 0 && <Table caption="Thuộc tính thiết bị"><thead><tr><th>Thuộc tính</th><th>Giá trị</th></tr></thead><tbody>{properties.map(([key, value]) => <tr key={key}><td className="ops-cell-primary">{key}</td><td>{String(value)}</td></tr>)}</tbody></Table>}
      <Alert tone="info" title="Không thêm tính năng cho ứng dụng">{NO_CAPABILITY_NOTICE}</Alert>
    </>}

    <div>
      <p className="ops-field-label" style={{ margin: "0 0 4px" }}>Yêu cầu của mẫu này</p>
      {version.requiredCapabilities.length === 0
        ? <p className="ops-field-hint" style={{ margin: 0 }}>Chưa ghi yêu cầu nào.</p>
        : <ul style={{ margin: 0, paddingLeft: 18, listStyle: "disc", fontSize: 14 }}>{version.requiredCapabilities.map((id) => <li key={id}>{capabilityName(id)}</li>)}</ul>}
    </div>
  </div>;
}
