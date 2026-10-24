"use client";

import { CircleCheck, DoorOpen, FileSearch, ListChecks, PenLine, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { useAsyncData } from "@/api/use-async-data";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/field";
import { SkeletonRows } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableMessage } from "@/components/ui/table";
import { ChipTabs } from "@/components/ui/sub-tabs";
import { buildingsApi } from "../api";
import { entityLabel, propertyLabel, qualityFlagCodes, qualityFlagLabel, sortFacts } from "../bim-facts";
import { describeApiError, formatDateTime, shortHash } from "../format";
import { countBySeverity, severityLabel, severityOrder, severityRank } from "../pipeline";
import { issueGlobalIds, qaGuide, type QaAction } from "../qa-codes";
import type { RevisionIssue } from "../types";

type IssueState = { data: RevisionIssue[] | undefined; error: unknown; loading: boolean; reload: () => void };

function valueText(value: unknown) {
  if (value === null || value === undefined) return "—";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > 120 ? `${text.slice(0, 120)}…` : text;
}

const ISSUE_ACTIONS: Record<QaAction, { label: string; icon: typeof Upload }> = {
  equipment: { label: "Mở Thiết bị phát hiện từ IFC", icon: DoorOpen },
  reupload: { label: "Tải lên IFC mới", icon: Upload },
  editor: { label: "Đặt trong trình soạn kịch bản", icon: PenLine },
};

function IssueAction({ action, onAction }: { action: QaAction; onAction: (action: QaAction) => void }) {
  const { label, icon: Icon } = ISSUE_ACTIONS[action];
  return <Button type="button" size="sm" variant="secondary" onClick={() => onAction(action)} data-testid="issue-action" data-action={action}><Icon size={14} aria-hidden="true" />{label}</Button>;
}

function IssuesTab({ issues, onHighlight, onAction }: { issues: IssueState; onHighlight?: (ids: string[]) => void; onAction?: (action: QaAction) => void }) {
  const [severity, setSeverity] = useState("all");
  const [currentOnly, setCurrentOnly] = useState(true);
  const all = useMemo(() => issues.data ?? [], [issues.data]);
  const scoped = useMemo(() => (currentOnly ? all.filter((issue) => issue.isCurrentAttempt) : all), [all, currentOnly]);
  const rows = useMemo(
    () => scoped.filter((issue) => severity === "all" || issue.severity === severity).sort((a, b) => severityRank(a.severity) - severityRank(b.severity)),
    [scoped, severity],
  );

  return <div className="ops-stack">
    <div className="ops-toolbar" style={{ marginBottom: 0 }}>
      <span className="ops-toolbar-grow" />
      <Select aria-label="Lọc theo mức độ" style={{ width: 190 }} value={severity} onChange={(event) => setSeverity(event.target.value)}>
        <option value="all">Mọi mức độ</option>
        {severityOrder.map((level) => <option key={level} value={level}>{severityLabel(level).label}</option>)}
      </Select>
      <label style={{ display: "inline-flex", alignItems: "center", gap: 8, minHeight: 44, fontSize: 13, color: "var(--muted)" }}>
        <input type="checkbox" checked={currentOnly} onChange={(event) => setCurrentOnly(event.target.checked)} />Chỉ lần chạy hiện hành
      </label>
    </div>
    {issues.error !== undefined && <Alert tone="danger" title="Không tải được danh sách issue" action={<Button size="sm" variant="secondary" className="mt-3" onClick={issues.reload}>Thử lại</Button>}>{describeApiError(issues.error, "Hãy thử lại sau.")}</Alert>}
    <Table caption="Issue của revision">
      <thead><tr><th>Mức độ</th><th>Mã</th><th>Nội dung</th><th>Trạng thái</th><th>Nguồn</th></tr></thead>
      <tbody>
        {issues.loading && !issues.data && <TableMessage colSpan={5}><SkeletonRows rows={3} label="Đang tải issue…" /></TableMessage>}
        {rows.map((issue) => {
          const level = severityLabel(issue.severity);
          const guide = qaGuide(issue.issueCode);
          const ids = issueGlobalIds(issue);
          return <tr key={issue.id} data-testid="issue-row" data-code={issue.issueCode}>
            <td><StatusBadge tone={level.tone}>{level.label}</StatusBadge></td>
            <td className="ops-mono">{issue.issueCode}</td>
            <td>
              {guide ? <strong>{guide.title}</strong> : null}
              {issue.message && <span className={guide ? "ops-cell-sub" : undefined}>{issue.message}</span>}
              {guide?.guidance && <span className="ops-cell-sub" data-testid="issue-guidance">Cách xử lý: {guide.guidance}</span>}
              {guide?.action && onAction && <span className="ops-cell-sub"><IssueAction action={guide.action} onAction={onAction} /></span>}
              {ids.length > 0 && <span className="ops-cell-sub">Cấu kiện: <span className="ops-mono">{ids.slice(0, 3).join(", ")}{ids.length > 3 ? ` +${ids.length - 3}` : ""}</span>
                {onHighlight && <Button type="button" size="sm" variant="quiet" onClick={() => onHighlight(ids)} data-testid="issue-highlight">Đánh dấu trong preview</Button>}</span>}
            </td>
            <td>{issue.status}</td>
            <td>{issue.isCurrentAttempt ? "Hiện hành" : "Lịch sử"}<span className="ops-cell-sub">{formatDateTime(issue.createdAt)}</span></td>
          </tr>;
        })}
        {issues.data && rows.length === 0 && <TableMessage colSpan={5}><EmptyState icon={CircleCheck} title={all.length === 0 ? "Chưa có issue nào" : "Không có issue phù hợp bộ lọc"} description={all.length === 0 ? "Chưa có issue từ validator. Nếu job chưa chạy xong thì đây chưa phải kết quả QA." : "Đổi mức độ hoặc bỏ lọc “Chỉ lần chạy hiện hành”."} /></TableMessage>}
      </tbody>
    </Table>
  </div>;
}

function LogsTab({ accessToken, revisionId, reloadKey }: { accessToken: string; revisionId: string; reloadKey: string }) {
  const logs = useAsyncData(`logs:${revisionId}:${reloadKey}`, (signal) => buildingsApi.listProcessingLogs(accessToken, revisionId, 1, 50, signal));
  return <div className="ops-stack">
    {logs.error !== undefined && <Alert tone="danger" title="Không tải được nhật ký" action={<Button size="sm" variant="secondary" className="mt-3" onClick={logs.reload}>Thử lại</Button>}>{describeApiError(logs.error, "Hãy thử lại sau.")}</Alert>}
    <Table caption="Nhật ký xử lý">
      <thead><tr><th>Thời gian</th><th>Bước</th><th>Kết quả</th><th>Lần chạy</th><th>Thông điệp</th></tr></thead>
      <tbody>
        {logs.loading && !logs.data && <TableMessage colSpan={5}><SkeletonRows rows={3} label="Đang tải nhật ký…" /></TableMessage>}
        {logs.data?.items.map((log) => <tr key={log.id}><td>{formatDateTime(log.loggedAt)}</td><td>{log.step}</td><td><StatusBadge tone={log.status === "Failed" ? "danger" : log.status === "Success" ? "success" : "info"}>{log.status}</StatusBadge></td><td>#{log.attemptNumber}{log.durationMs !== null ? ` · ${log.durationMs} ms` : ""}</td><td>{log.message ?? "—"}</td></tr>)}
        {logs.data && logs.data.items.length === 0 && <TableMessage colSpan={5}><EmptyState icon={ListChecks} title="Chưa có nhật ký" description="Nhật ký xuất hiện khi worker bắt đầu xử lý revision." /></TableMessage>}
      </tbody>
    </Table>
  </div>;
}

function ArtifactsTab({ accessToken, revisionId, reloadKey }: { accessToken: string; revisionId: string; reloadKey: string }) {
  const artifacts = useAsyncData(`artifacts:${revisionId}:${reloadKey}`, (signal) => buildingsApi.listArtifacts(accessToken, revisionId, 1, 50, signal));
  return <div className="ops-stack">
    {artifacts.error !== undefined && <Alert tone="danger" title="Không tải được artifact" action={<Button size="sm" variant="secondary" className="mt-3" onClick={artifacts.reload}>Thử lại</Button>}>{describeApiError(artifacts.error, "Hãy thử lại sau.")}</Alert>}
    <Table caption="Artifact của revision">
      <thead><tr><th>Loại</th><th>SHA-256</th><th>Runtime</th><th>Nguồn</th><th>Tạo lúc</th></tr></thead>
      <tbody>
        {artifacts.loading && !artifacts.data && <TableMessage colSpan={5}><SkeletonRows rows={3} label="Đang tải artifact…" /></TableMessage>}
        {artifacts.data?.items.map((artifact) => <tr key={artifact.id}><td>{artifact.artifactType}</td><td className="ops-mono" title={artifact.sha256Hash}>{shortHash(artifact.sha256Hash, 14)}</td><td><StatusBadge tone={artifact.isRuntimeReady ? "success" : "neutral"}>{artifact.isRuntimeReady ? "Sẵn sàng runtime" : "Chưa runtime"}</StatusBadge></td><td>{artifact.isCurrentAttempt ? "Hiện hành" : "Lịch sử"}</td><td>{formatDateTime(artifact.createdAt)}</td></tr>)}
        {artifacts.data && artifacts.data.items.length === 0 && <TableMessage colSpan={5}><EmptyState icon={FileSearch} title="Chưa có artifact" description="Artifact (GLB, dữ liệu navmesh…) xuất hiện sau khi worker xử lý xong." /></TableMessage>}
      </tbody>
    </Table>
    <p className="ops-muted">Cờ “Sẵn sàng runtime” chỉ là trạng thái kỹ thuật, không thay QA hay duyệt nội dung.</p>
  </div>;
}

function FactsTab({ accessToken, revisionId, reloadKey }: { accessToken: string; revisionId: string; reloadKey: string }) {
  const [page, setPage] = useState(1);
  const facts = useAsyncData(`facts:${revisionId}:${reloadKey}:${page}`, (signal) => buildingsApi.listBimFacts(accessToken, revisionId, page, 20, signal));
  const total = facts.data?.totalCount ?? 0;
  const rows = useMemo(() => sortFacts(facts.data?.items ?? []), [facts.data]);
  const unnamed = rows.filter((fact) => qualityFlagCodes(fact.qualityFlags).includes("SPACE_UNNAMED")).length;
  const hasSpaces = rows.some((fact) => fact.entityType === "IfcSpace");
  return <div className="ops-stack">
    {facts.error !== undefined && <Alert tone="danger" title="Không tải được BIM facts" action={<Button size="sm" variant="secondary" className="mt-3" onClick={facts.reload}>Thử lại</Button>}>{describeApiError(facts.error, "Hãy thử lại sau.")}</Alert>}
    {unnamed > 0 && <div data-testid="facts-unnamed"><Alert tone="warning" title={`${unnamed} phòng chưa có tên trên trang này`}>{qaGuide("IFC_SPACE_UNNAMED")?.guidance}</Alert></div>}
    {hasSpaces && <p className="ops-muted" data-testid="facts-space-note">Mỗi phòng có ba dòng: tên, tên đầy đủ và loại phòng. Máy chủ phân trang theo dòng nên các dòng của một phòng có thể nằm ở trang khác.</p>}
    <Table caption="BIM facts" data-testid="facts-table">
      <thead><tr><th>IFC GlobalId</th><th>Thực thể</th><th>Thuộc tính</th><th>Giá trị</th><th>Cảnh báo</th></tr></thead>
      <tbody>
        {facts.loading && !facts.data && <TableMessage colSpan={5}><SkeletonRows rows={3} label="Đang tải BIM facts…" /></TableMessage>}
        {rows.map((fact) => {
          const flags = qualityFlagCodes(fact.qualityFlags);
          return <tr key={fact.id} data-testid="fact-row">
            <td className="ops-mono">{fact.ifcGlobalId}</td><td>{entityLabel(fact.entityType)}</td><td>{propertyLabel(fact)}</td><td>{valueText(fact.value)}</td>
            <td>{flags.length === 0 ? "—" : <span className="ops-actions">{flags.map((code) => <StatusBadge key={code} tone="warning" data-testid="fact-flag">{qualityFlagLabel(code)}</StatusBadge>)}</span>}</td>
          </tr>;
        })}
        {facts.data && facts.data.items.length === 0 && <TableMessage colSpan={5}><EmptyState icon={FileSearch} title="Chưa có BIM facts" description="Tên, tên đầy đủ và loại của từng phòng (IfcSpace) có sau khi xử lý IFC xong và QA đạt." /></TableMessage>}
      </tbody>
    </Table>
    {total > 20 && <div className="ops-actions" style={{ justifyContent: "space-between" }}>
      <span className="ops-muted">Trang {page}/{Math.ceil(total / 20)} · {total} mục</span>
      <span className="ops-actions"><Button size="sm" variant="quiet" disabled={page <= 1 || facts.loading} onClick={() => setPage(page - 1)}>Trước</Button><Button size="sm" variant="quiet" disabled={page >= Math.ceil(total / 20) || facts.loading} onClick={() => setPage(page + 1)}>Sau</Button></span>
    </div>}
  </div>;
}

/**
 * Figma "IFC · Kỹ thuật": one card, third-level navigation as chip tabs (Issue · Nhật ký · Artifact · BIM facts) instead
 * of a nested tab bar. Issues of the validator, worker logs, artifacts and BIM facts of the selected revision.
 */
export function RevisionDetailsPanel({ accessToken, revisionId, issues, reloadKey, onHighlight, onIssueAction, tab, onTabChange }: {
  accessToken: string;
  revisionId: string;
  issues: IssueState;
  reloadKey: string;
  onHighlight?: (ids: string[]) => void;
  /** Per-issue next step from the QA guide (equipment, re-upload, editor). */
  onIssueAction?: (action: QaAction) => void;
  tab: string;
  onTabChange: (tab: string) => void;
}) {
  const issueCount = issues.data?.filter((issue) => issue.isCurrentAttempt).length;
  const counts = countBySeverity(issues.data?.filter((issue) => issue.isCurrentAttempt) ?? []);
  return <section id="ifc-details" tabIndex={-1} className="ops-stack" aria-label="Chi tiết kỹ thuật">
    <div className="org-row">
      <ChipTabs label="Chi tiết kỹ thuật" value={tab} onValueChange={onTabChange} items={[
        { value: "issues", label: "Issue", count: issueCount, "data-testid": "details-tab-issues" },
        { value: "logs", label: "Nhật ký" },
        { value: "artifacts", label: "Artifact" },
        { value: "facts", label: "BIM facts" },
      ]} />
      {tab === "issues" && <span className="ops-actions" style={{ gap: 6 }}>{severityOrder.map((level) => { const label = severityLabel(level); return <StatusBadge key={level} tone={counts[level] ? label.tone : "neutral"}>{label.label} {counts[level] ?? 0}</StatusBadge>; })}</span>}
    </div>
    <div className="org-card">
      {tab === "issues" && <IssuesTab issues={issues} onHighlight={onHighlight} onAction={onIssueAction} />}
      {tab === "logs" && <LogsTab accessToken={accessToken} revisionId={revisionId} reloadKey={reloadKey} />}
      {tab === "artifacts" && <ArtifactsTab accessToken={accessToken} revisionId={revisionId} reloadKey={reloadKey} />}
      {tab === "facts" && <FactsTab accessToken={accessToken} revisionId={revisionId} reloadKey={reloadKey} />}
    </div>
  </section>;
}
