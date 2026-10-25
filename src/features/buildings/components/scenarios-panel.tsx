"use client";

import { ClipboardList, PenLine, Plus, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { useIdempotencyKey } from "@/api/idempotency";
import { useAsyncData } from "@/api/use-async-data";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DataTable, CellTitle, type DataColumn } from "@/components/ui/data-table";
import { Modal } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/spinner";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";
import { routes } from "@/configs/routes";
import { buildingsApi } from "../api";
import { describeApiError } from "../format";

const shortDate = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
import type { ScenarioSummary } from "@/features/scenarios/types";

const PAGE_SIZE = 20;

function reviewTone(status: string | null | undefined) {
  switch (status?.toLowerCase()) {
    case "approved": return { label: "Đã duyệt", tone: "success" as const };
    case "submitted": return { label: "Chờ duyệt", tone: "warning" as const };
    case "rejected": return { label: "Bị từ chối", tone: "danger" as const };
    default: return null;
  }
}

function VersionSummary({ accessToken, scenarioId }: { accessToken: string; scenarioId: string }) {
  const versions = useAsyncData(`scenario-versions:${scenarioId}`, (signal) => buildingsApi.listScenarioVersions(accessToken, scenarioId, 1, 1, signal));
  if (versions.loading && !versions.data) return <span className="ops-muted">Đang tải…</span>;
  if (versions.error !== undefined) return <span className="ops-muted">Không đọc được</span>;
  const latest = versions.data?.items[0];
  if (!latest) return <StatusBadge tone="neutral">Chỉ có bản nháp</StatusBadge>;
  const review = reviewTone((latest as { reviewStatus?: string | null }).reviewStatus);
  return <span className="ops-actions" style={{ gap: 6 }}><StatusBadge tone={review?.tone ?? "info"}>v{latest.versionNumber}{review ? ` · ${review.label}` : ""}</StatusBadge><span className="ops-muted">{versions.data?.totalCount} phiên bản</span></span>;
}

/**
 * Figma "Kịch bản": table of the building's scenarios (click → editor) and a "Tạo kịch bản" modal (name only — that is
 * all the API takes). `?create=1` (from ⌘K) opens the modal. The 3D editor lives at `/workspace/buildings/[id]/scenarios/[scenarioId]`.
 */
export function ScenariosPanel({ accessToken, buildingId, revisionLabel, scenarios, onChanged, openCreate, onCreateHandled }: {
  accessToken: string;
  buildingId: string;
  revisionLabel?: string;
  scenarios: { data: { items: ScenarioSummary[]; totalCount: number } | undefined; error: unknown; loading: boolean; reload: () => void; page: number; setPage: (page: number) => void };
  onChanged: () => void;
  /** Open the create modal on mount (deep link). */
  openCreate?: boolean;
  onCreateHandled?: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const key = useIdempotencyKey();
  const busy = useRef(false);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState("");
  const { data, loading } = scenarios;
  const items = data?.items ?? [];

  // A deep link (?create=1) opens the modal without a state round-trip; closing it clears the param through the parent.
  const modalOpen = open || Boolean(openCreate);
  const closeModal = () => { setOpen(false); if (openCreate) onCreateHandled?.(); };

  const editorHref = (scenario: ScenarioSummary) => `${routes.workspaceBuildings}/${buildingId}/scenarios/${scenario.id}`;

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
      closeModal();
      toast.notify({ tone: "success", title: "Đã tạo kịch bản", description: trimmed });
      onChanged();
      router.push(`${routes.workspaceBuildings}/${buildingId}/scenarios/${created.id}`);
    } catch (cause) {
      setError(describeApiError(cause, "Không thể tạo kịch bản. Tên bạn nhập vẫn được giữ lại; thử lại sẽ không tạo bản trùng."));
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  const columns: DataColumn<ScenarioSummary>[] = [
    { key: "name", header: "Kịch bản", primary: true, render: (scenario) => <CellTitle title={scenario.name} sub={revisionLabel ? `Bản nháp trên ${revisionLabel}` : undefined} /> },
    { key: "version", header: "Phiên bản gần nhất", width: 240, render: (scenario) => <VersionSummary accessToken={accessToken} scenarioId={scenario.id} /> },
    { key: "created", header: "Tạo lúc", width: 120, hideBelow: 900, render: (scenario) => shortDate.format(new Date(scenario.createdAt)) },
  ];

  return <div className="ops-stack">
    {scenarios.error !== undefined && <Alert tone="danger" title="Không tải được danh sách kịch bản" action={<Button size="sm" variant="secondary" className="mt-3" onClick={scenarios.reload}>Thử lại</Button>}>{describeApiError(scenarios.error, "Hãy thử lại sau.")}</Alert>}
    <DataTable<ScenarioSummary>
      data-testid="scenarios-table"
      caption="Danh sách kịch bản"
      columns={columns}
      rows={items}
      rowKey={(scenario) => scenario.id}
      rowHref={editorHref}
      rowMenu={(scenario) => [{ label: "Mở trình soạn", icon: PenLine, onSelect: () => router.push(editorHref(scenario)) }]}
      toolbar={<>
        <p className="ops-muted" style={{ flex: "1 1 240px" }}>{revisionLabel ? `Kịch bản gắn với công trình; bản nháp dựa trên bản IFC đang chọn (${revisionLabel}).` : "Kịch bản gắn với công trình; bản nháp được tạo trong trình soạn."}</p>
        <Button variant="quiet" size="sm" onClick={scenarios.reload} disabled={loading}><RefreshCw size={14} aria-hidden="true" />Tải lại</Button>
        <Button onClick={() => { setError(""); setFieldError(""); setOpen(true); }} data-testid="scenario-create"><Plus size={16} aria-hidden="true" />Tạo kịch bản</Button>
      </>}
      loading={loading && !data}
      empty={<EmptyState icon={ClipboardList} title="Chưa có kịch bản" description="Tạo kịch bản đầu tiên cho công trình này rồi mở trình soạn để đặt điểm xuất phát, nguồn cháy và đường thoát." action={<Button onClick={() => setOpen(true)}><Plus size={16} aria-hidden="true" />Tạo kịch bản</Button>} />}
      pagination={(data?.totalCount ?? 0) > PAGE_SIZE ? { page: scenarios.page, pageSize: PAGE_SIZE, totalCount: data?.totalCount ?? 0, onPageChange: scenarios.setPage } : undefined}
    />

    <Modal open={modalOpen} onOpenChange={(next) => { if (!saving && !next) closeModal(); }} size="sm" title="Tạo kịch bản" description="Đặt tên; điểm xuất phát, nguồn lửa và đường thoát được đặt trong trình soạn ngay sau đó."
      footer={<><Button type="button" variant="ghost" onClick={closeModal} disabled={saving}>Hủy</Button><SubmitButton type="submit" form="scenario-create-form" state={saving ? "busy" : "idle"}>Tạo và mở trình soạn</SubmitButton></>}>
      <form id="scenario-create-form" onSubmit={(event) => void create(event)} noValidate className="ops-stack">
        <Field label="Tên kịch bản" required error={fieldError || undefined}>{(p) => <Input {...p} value={name} maxLength={220} autoFocus placeholder="Thoát hiểm tầng 1" onChange={(event) => setName(event.target.value)} />}</Field>
        {error && <Alert tone="danger">{error}</Alert>}
      </form>
    </Modal>
  </div>;
}
