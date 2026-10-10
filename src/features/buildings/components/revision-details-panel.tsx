"use client";

import { CircleCheck, FileSearch, ListChecks } from "lucide-react";
import { useMemo, useState } from "react";
import { useAsyncData } from "@/api/use-async-data";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import { SkeletonRows } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableMessage } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { buildingsApi } from "../api";
import { describeApiError, formatDateTime, shortHash } from "../format";
import { countBySeverity, severityLabel, severityOrder, severityRank } from "../pipeline";
import type { RevisionIssue } from "../types";

type IssueState = { data: RevisionIssue[] | undefined; error: unknown; loading: boolean; reload: () => void };

function valueText(value: unknown) {
  if (value === null || value === undefined) return "—";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > 120 ? `${text.slice(0, 120)}…` : text;
}

function IssuesTab({ issues }: { issues: IssueState }) {
  const [severity, setSeverity] = useState("all");
  const [currentOnly, setCurrentOnly] = useState(true);
  const all = useMemo(() => issues.data ?? [], [issues.data]);
  const scoped = useMemo(() => (currentOnly ? all.filter((issue) => issue.isCurrentAttempt) : all), [all, currentOnly]);
  const counts = countBySeverity(scoped);
  const rows = useMemo(
    () => scoped.filter((issue) => severity === "all" || issue.severity === severity).sort((a, b) => severityRank(a.severity) - severityRank(b.severity)),
    [scoped, severity],
  );

  return <div className="ops-stack">
    <div className="ops-toolbar" style={{ marginBottom: 0 }}>
      {severityOrder.map((level) => {
        const label = severityLabel(level);
        return <StatusBadge key={level} tone={label.tone}>{label.label}: {counts[level] ?? 0}</StatusBadge>;
      })}
      <span className="ops-toolbar-grow" />
      <Select aria-label="Lọc theo mức độ" style={{ width: 190 }} value={severity} onChange={(event) => setSeverity(event.target.value)}>
        <option value="all">Mọi mức độ</option>
        {severityOrder.map((level) => <option key={level} value={level}>{severityLabel(level).label}</option>)}
      </Select>
      <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--muted)" }}>
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
          return <tr key={issue.id}>
            <td><StatusBadge tone={level.tone}>{level.label}</StatusBadge></td>
            <td className="ops-mono">{issue.issueCode}</td>
            <td>{issue.message}</td>
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
  return <div className="ops-stack">
    {facts.error !== undefined && <Alert tone="danger" title="Không tải được BIM facts" action={<Button size="sm" variant="secondary" className="mt-3" onClick={facts.reload}>Thử lại</Button>}>{describeApiError(facts.error, "Hãy thử lại sau.")}</Alert>}
    <Table caption="BIM facts">
      <thead><tr><th>IFC GlobalId</th><th>Thực thể</th><th>Thuộc tính</th><th>Giá trị</th></tr></thead>
      <tbody>
        {facts.loading && !facts.data && <TableMessage colSpan={4}><SkeletonRows rows={3} label="Đang tải BIM facts…" /></TableMessage>}
        {facts.data?.items.map((fact) => <tr key={fact.id}><td className="ops-mono">{fact.ifcGlobalId}</td><td>{fact.entityType}</td><td>{fact.propertyPath}</td><td>{valueText(fact.value)}</td></tr>)}
        {facts.data && facts.data.items.length === 0 && <TableMessage colSpan={4}><EmptyState icon={FileSearch} title="Chưa có BIM facts" description="Dữ liệu thuộc tính được worker trích xuất từ IFC sau khi xử lý." /></TableMessage>}
      </tbody>
    </Table>
    {total > 20 && <div className="ops-actions" style={{ justifyContent: "space-between" }}>
      <span className="ops-muted">Trang {page}/{Math.ceil(total / 20)} · {total} mục</span>
      <span className="ops-actions"><Button size="sm" variant="quiet" disabled={page <= 1 || facts.loading} onClick={() => setPage(page - 1)}>Trước</Button><Button size="sm" variant="quiet" disabled={page >= Math.ceil(total / 20) || facts.loading} onClick={() => setPage(page + 1)}>Sau</Button></span>
    </div>}
  </div>;
}

/** Technical detail of the selected revision: issues (severity filter), processing logs, artifacts, BIM facts. */
export function RevisionDetailsPanel({ accessToken, revisionId, issues, reloadKey }: { accessToken: string; revisionId: string; issues: IssueState; reloadKey: string }) {
  return <Panel title="Chi tiết kỹ thuật" description="Issue của validator, nhật ký worker, artifact và dữ liệu BIM của revision đang chọn.">
    <Tabs defaultValue="issues">
      <TabsList aria-label="Chi tiết kỹ thuật">
        <TabsTrigger value="issues">Issue</TabsTrigger>
        <TabsTrigger value="logs">Nhật ký</TabsTrigger>
        <TabsTrigger value="artifacts">Artifact</TabsTrigger>
        <TabsTrigger value="facts">BIM facts</TabsTrigger>
      </TabsList>
      <TabsContent value="issues"><IssuesTab issues={issues} /></TabsContent>
      <TabsContent value="logs"><LogsTab accessToken={accessToken} revisionId={revisionId} reloadKey={reloadKey} /></TabsContent>
      <TabsContent value="artifacts"><ArtifactsTab accessToken={accessToken} revisionId={revisionId} reloadKey={reloadKey} /></TabsContent>
      <TabsContent value="facts"><FactsTab accessToken={accessToken} revisionId={revisionId} reloadKey={reloadKey} /></TabsContent>
    </Tabs>
  </Panel>;
}
