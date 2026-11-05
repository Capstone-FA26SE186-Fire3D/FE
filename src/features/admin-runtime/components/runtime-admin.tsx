"use client";

import { Cpu, Plus } from "lucide-react";
import { useState } from "react";

import { useAsyncData } from "@/api/use-async-data";
import { useUrlParams } from "@/api/use-url-params";
import { formatDateTime } from "@/components/ops/detail-parts";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CellTitle, DataTable, type DataColumn } from "@/components/ui/data-table";
import { ConfirmDialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { LoadingBlock } from "@/components/ui/spinner";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";
import { routes } from "@/configs/routes";
import { useAuthSession } from "@/features/auth/auth-session";
import { runtimeCatalogApi } from "../api";
import { describeRuntimeError, type RuntimeCatalogEntry, type RuntimeErrorView } from "../model";
import { RegisterRuntimeModal } from "./register-runtime-modal";
import { RuntimeDetailModal } from "./runtime-detail-modal";
import "./runtime.css";

export const ACTIVATE_TEXT = "Trình soạn kịch bản, chạy thử và buổi huấn luyện mới được dùng phiên bản này.";
export const DEACTIVATE_TEXT = "Không ai bắt đầu được buổi chạy thử hay buổi huấn luyện MỚI trên phiên bản này, và trình soạn không chọn được nó nữa. Gói bài và buổi học đã gắn với phiên bản này giữ nguyên, không bị đổi.";

/**
 * `/admin/runtime`: the versions of the training program inside the app ("runtime") the server accepts. Rows come from
 * `GET /api/admin/runtime-catalog`; activate/deactivate is the only change a row allows (PATCH `isActive`). `?runtime=<id>`
 * opens the read-only detail popup. Role is checked here; the API enforces it on every call.
 */
export function RuntimeAdmin() {
  const { accessToken, ready, user } = useAuthSession();
  const { get, setParams } = useUrlParams();
  const toast = useToast();
  const [reloadKey, setReloadKey] = useState(0);
  const [registering, setRegistering] = useState(false);
  const [toggling, setToggling] = useState<RuntimeCatalogEntry | null>(null);
  const [toggleBusy, setToggleBusy] = useState(false);
  const [toggleError, setToggleError] = useState<RuntimeErrorView | null>(null);
  const allowed = ready && user?.role === 0 && Boolean(accessToken);
  const list = useAsyncData(`runtime-catalog:${reloadKey}`, (signal) => runtimeCatalogApi.list(accessToken ?? "", signal), allowed);
  const openId = get("runtime");

  if (!ready) return <LoadingBlock label="Đang kiểm tra phiên đăng nhập…" />;
  if (!allowed || !accessToken) return <Alert tone="danger" title="Không có quyền truy cập">Chỉ quản trị FET3D có thể quản lý phiên bản chương trình mô phỏng.</Alert>;

  const entries = list.data ?? [];
  const opened = openId ? entries.find((entry) => entry.id === openId) : undefined;
  const reload = () => setReloadKey((value) => value + 1);

  const runToggle = async () => {
    if (!toggling || toggleBusy) return;
    setToggleBusy(true);
    setToggleError(null);
    const next = !toggling.isActive;
    try {
      await runtimeCatalogApi.setActive(accessToken, toggling.id, next);
      toast.notify({ tone: "success", title: next ? "Đã bật phiên bản" : "Đã tắt phiên bản", description: `Phiên bản ${toggling.runtimeVersion}` });
      setToggling(null);
      reload();
    } catch (cause) {
      const view = describeRuntimeError(cause);
      setToggleError(view);
      if (view.kind === "notFound") reload();
    } finally {
      setToggleBusy(false);
    }
  };

  const columns: DataColumn<RuntimeCatalogEntry>[] = [
    { key: "version", header: "Phiên bản", primary: true, render: (entry) => <CellTitle title={`Phiên bản ${entry.runtimeVersion}`} sub={`${entry.capabilities.length} năng lực`} /> },
    { key: "status", header: "Trạng thái", width: 130, render: (entry) => <StatusBadge tone={entry.isActive ? "success" : "neutral"}>{entry.isActive ? "Đang dùng" : "Tắt"}</StatusBadge> },
    { key: "capabilities", header: "Số năng lực", width: 120, hideBelow: 900, render: (entry) => entry.capabilities.length.toLocaleString("vi-VN") },
    { key: "protocol", header: "Giao thức / định dạng gói", width: 190, hideBelow: 1100, render: (entry) => `${entry.protocolVersion || "—"} / ${entry.manifestSchemaVersion || "—"}` },
    { key: "created", header: "Ngày đăng ký", width: 160, hideBelow: 768, render: (entry) => formatDateTime(entry.createdAt) },
    { key: "toggle", header: "Bật / tắt", width: 120, align: "right", render: (entry) => <Button size="sm" variant={entry.isActive ? "secondary" : "primary"} data-testid={`runtime-toggle-${entry.runtimeVersion}`} onClick={() => { setToggleError(null); setToggling(entry); }}>{entry.isActive ? "Tắt" : "Bật"}</Button> },
  ];

  return <>
    <PageHeader eyebrow="Quản lý hệ thống" title="Phiên bản runtime"
      description="Runtime là phiên bản chương trình mô phỏng trong ứng dụng FET3D trên điện thoại. Mỗi phiên bản ghi những năng lực (thiết bị, sự kiện, thao tác) mà ứng dụng hỗ trợ; chỉ phiên bản đang dùng mới được chọn khi soạn kịch bản, chạy thử và bắt đầu buổi huấn luyện."
      breadcrumbs={[{ label: "Quản trị", href: routes.adminOverview }, { label: "Phiên bản runtime" }]}
      actions={<Button onClick={() => setRegistering(true)} data-testid="runtime-register"><Plus size={16} aria-hidden="true" />Đăng ký phiên bản</Button>} />
    {list.error !== undefined && <Alert tone="danger" className="mb-4" title="Không tải được danh sách phiên bản" action={<Button size="sm" variant="secondary" className="mt-3" onClick={list.reload}>Thử lại</Button>}>{describeRuntimeError(list.error).message}</Alert>}
    <DataTable
      caption="Danh sách phiên bản chương trình mô phỏng"
      data-testid="runtime-table"
      columns={columns}
      rows={entries}
      rowKey={(entry) => entry.id}
      loading={list.loading && !list.data}
      onRowClick={(entry) => setParams({ runtime: entry.id })}
      rowTone={(entry) => (entry.isActive ? undefined : "muted")}
      empty={<EmptyState icon={Cpu} title="Chưa có phiên bản nào" description="Đăng ký phiên bản bằng tệp xuất từ dự án Unity để trình soạn và ứng dụng dùng được." />}
    />
    <p className="ops-field-hint" style={{ margin: "10px 0 0" }}>Mới nhất ở trên. Bấm vào một hàng để xem năng lực của phiên bản. Phiên bản đã đăng ký không sửa được, chỉ bật hoặc tắt.</p>

    {opened && <RuntimeDetailModal entry={opened} onClose={() => setParams({ runtime: null })} />}
    {openId && list.data && !opened && <Alert tone="warning" className="mt-4" title="Không tìm thấy phiên bản" action={<Button size="sm" variant="secondary" className="mt-3" onClick={() => setParams({ runtime: null })}>Về danh sách</Button>}>Đường dẫn không trỏ tới phiên bản nào trong danh sách.</Alert>}
    {registering && <RegisterRuntimeModal accessToken={accessToken} onClose={() => setRegistering(false)} onRegistered={() => { setRegistering(false); reload(); }} />}

    {toggling && <ConfirmDialog open onOpenChange={(open) => { if (!open) { setToggling(null); setToggleError(null); } }} busy={toggleBusy}
      title={toggling.isActive ? `Tắt phiên bản ${toggling.runtimeVersion}?` : `Bật phiên bản ${toggling.runtimeVersion}?`}
      description={toggling.isActive ? DEACTIVATE_TEXT : ACTIVATE_TEXT}
      tone={toggling.isActive ? "danger" : "primary"} confirmLabel={toggleError?.kind === "retry" ? "Thử lại" : toggling.isActive ? "Tắt phiên bản" : "Bật phiên bản"} onConfirm={runToggle}>
      <div className="ops-stack">
        <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>Có thể {toggling.isActive ? "bật lại" : "tắt"} bất cứ lúc nào.</p>
        {toggleError && <Alert tone="danger" title={toggleError.title}>{toggleError.message}</Alert>}
      </div>
    </ConfirmDialog>}
  </>;
}
