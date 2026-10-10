"use client";

import { ClipboardList, Plus, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { useIdempotencyKey } from "@/api/idempotency";
import { useAsyncData } from "@/api/use-async-data";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import { SkeletonRows } from "@/components/ui/skeleton";
import { Pagination, Table, TableMessage } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { routes } from "@/configs/routes";
import { buildingsApi } from "../api";
import { describeApiError, formatDate } from "../format";
import type { ScenarioSummary } from "@/features/scenarios/types";

const PAGE_SIZE = 20;

function VersionSummary({ accessToken, scenarioId }: { accessToken: string; scenarioId: string }) {
  const versions = useAsyncData(`scenario-versions:${scenarioId}`, (signal) => buildingsApi.listScenarioVersions(accessToken, scenarioId, 1, 1, signal));
  if (versions.loading && !versions.data) return <span className="ops-muted">Đang tải…</span>;
  if (versions.error !== undefined) return <span className="ops-muted">Không đọc được</span>;
  const latest = versions.data?.items[0];
  if (!latest) return <span className="ops-muted">Chưa có phiên bản (chỉ có bản nháp)</span>;
  return <span>v{latest.versionNumber} · {latest.timeLimitSeconds}s<span className="ops-cell-sub">{versions.data?.totalCount} phiên bản · {formatDate(latest.createdAt)}</span></span>;
}

/** Scenario list of one building + create. The 3D editor lives at `/workspace/buildings/[id]/scenarios/[scenarioId]`. */
export function ScenariosPanel({ accessToken, buildingId, revisionLabel, scenarios, onChanged }: {
  accessToken: string;
  buildingId: string;
  revisionLabel?: string;
  scenarios: { data: { items: ScenarioSummary[]; totalCount: number } | undefined; error: unknown; loading: boolean; reload: () => void; page: number; setPage: (page: number) => void };
  onChanged: () => void;
}) {
  const toast = useToast();
  const key = useIdempotencyKey();
  const busy = useRef(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState("");
  const { data, loading } = scenarios;
  const items = data?.items ?? [];

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy.current) return;
    const trimmed = name.trim();
    if (!trimmed) { setFieldError("Nhập tên kịch bản."); return; }
    if (trimmed.length > 200) { setFieldError("Tên kịch bản tối đa 200 ký tự."); return; }
    setFieldError("");
    busy.current = true;
    setSaving(true);
    setError("");
    try {
      // Same name → same key: a double click or a retry after a lost response replays the first create.
      const created = await buildingsApi.createScenario(accessToken, { buildingId, name: trimmed }, key.keyFor({ buildingId, name: trimmed }));
      key.done();
      setName("");
      toast.notify({ tone: "success", title: "Đã tạo kịch bản", description: `${trimmed} · ${created.id}` });
      onChanged();
    } catch (cause) {
      setError(describeApiError(cause, "Không thể tạo kịch bản. Tên bạn nhập vẫn được giữ lại; thử lại sẽ không tạo bản trùng."));
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  return <div className="ops-stack">
    <Panel title="Tạo kịch bản" description={revisionLabel ? `Kịch bản gắn với công trình; bản nháp dựa trên revision đang chọn (${revisionLabel}).` : "Kịch bản gắn với công trình; bản nháp được tạo trong trình soạn."}>
      <form onSubmit={(event) => void create(event)} noValidate className="ops-stack">
        <Field label="Tên kịch bản" required error={fieldError || undefined}>{(p) => <Input {...p} value={name} maxLength={220} placeholder="Thoát hiểm tầng 1" onChange={(event) => setName(event.target.value)} />}</Field>
        {error && <Alert tone="danger">{error}</Alert>}
        <div className="ops-actions"><Button type="submit" disabled={saving}><Plus size={16} aria-hidden="true" />{saving ? "Đang tạo…" : "Tạo kịch bản"}</Button></div>
      </form>
    </Panel>

    <Panel title="Kịch bản của công trình" actions={<Button size="sm" variant="quiet" onClick={scenarios.reload} disabled={loading}><RefreshCw size={14} aria-hidden="true" />Tải lại</Button>} bodyClassName="ops-stack">
      {scenarios.error !== undefined && <Alert tone="danger" title="Không tải được danh sách kịch bản" action={<Button size="sm" variant="secondary" className="mt-3" onClick={scenarios.reload}>Thử lại</Button>}>{describeApiError(scenarios.error, "Hãy thử lại sau.")}</Alert>}
      <Table caption="Danh sách kịch bản">
        <thead><tr><th>Kịch bản</th><th>Phiên bản gần nhất</th><th>Tạo lúc</th><th aria-label="Thao tác" /></tr></thead>
        <tbody>
          {loading && !data && <TableMessage colSpan={4}><SkeletonRows rows={3} label="Đang tải kịch bản…" /></TableMessage>}
          {items.map((scenario) => <tr key={scenario.id}>
            <td><Link className="ops-cell-primary" href={`${routes.workspaceBuildings}/${buildingId}/scenarios/${scenario.id}`}>{scenario.name}</Link></td>
            <td><VersionSummary accessToken={accessToken} scenarioId={scenario.id} /></td>
            <td>{formatDate(scenario.createdAt)}</td>
            <td className="ops-cell-actions"><Button asChild size="sm" variant="quiet"><Link href={`${routes.workspaceBuildings}/${buildingId}/scenarios/${scenario.id}`} aria-label={`Mở trình soạn ${scenario.name}`}>Mở trình soạn</Link></Button></td>
          </tr>)}
          {data && items.length === 0 && <TableMessage colSpan={4}><EmptyState icon={ClipboardList} title="Chưa có kịch bản" description="Tạo kịch bản đầu tiên cho công trình này rồi mở trình soạn để đặt điểm xuất phát, nguồn cháy và đường thoát." /></TableMessage>}
        </tbody>
      </Table>
      {(data?.totalCount ?? 0) > PAGE_SIZE && <Pagination page={scenarios.page} pageSize={PAGE_SIZE} totalCount={data?.totalCount ?? 0} onPageChange={scenarios.setPage} disabled={loading} />}
    </Panel>
  </div>;
}
