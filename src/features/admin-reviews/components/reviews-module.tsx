"use client";

import { Building2, ClipboardCheck, Eye, RefreshCw, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useAsyncData } from "@/api/use-async-data";
import { useUrlParams } from "@/api/use-url-params";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox, stripAccents, type ComboboxOption } from "@/components/ui/combobox";
import { CellTitle, DataTable, TableSearch, type DataColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterChip, FilterChips } from "@/components/ui/filter-chip";
import { NumberPop } from "@/components/ui/number-pop";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { routes } from "@/configs/routes";
import { useAuthSession } from "@/features/auth/auth-session";
import { formatCount } from "@/features/admin-overview/format";
import { organizationsApi } from "@/features/organizations/api";
import { formatDateTime } from "@/utils/date-range";
import { describeReadError, reviewsApi } from "../api";
import { parseStatusParam, shortId, statusLabel, statusTone } from "../format";
import type { ReviewStatus, ReviewSummary } from "../types";
import { ReviewDrawer } from "./review-detail";
import "./reviews.css";
import { LoadingBlock } from "@/components/ui/spinner";

const PAGE_SIZE = 20;
const STATUSES: ReviewStatus[] = ["Submitted", "Approved", "Rejected"];
const chipLabel: Record<ReviewStatus, string> = { Submitted: "Chờ duyệt", Approved: "Đã duyệt", Rejected: "Từ chối" };

/** "23/10 10:50": the queue column is narrow; the full timestamp is the cell's title. */
const shortDateTime = (iso: string) => new Date(iso).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Total of one status across the whole system (page size 1: only `totalCount` is used). Null when it cannot be read. */
function useStatusTotal(status: ReviewStatus, token: string | null, enabled: boolean) {
  const result = useAsyncData(`reviews:total:${status}`, (signal) => reviewsApi.list(token as string, { status, page: 1, pageSize: 1 }, signal), enabled);
  return { value: result.data ? result.data.totalCount : null, loading: result.loading && !result.data && result.error === undefined, reload: result.reload };
}

/** KPI tile on the chart kit's `.ops-kpi`; null prints an em dash (the server total could not be read). */
function QueueKpi({ label, value, loading, hint, testId }: { label: string; value: number | null; loading: boolean; hint: string; testId: string }) {
  return <div className="ops-kpi" data-testid={testId} aria-busy={loading || undefined}>
    <span className="ops-kpi-label">{label}</span>
    <div className="ops-kpi-row">
      {loading
        ? <><Skeleton style={{ height: 30, width: 56 }} /><span className="ops-sr-only" role="status">Đang tải {label}…</span></>
        : <strong className="ops-kpi-value">{value === null ? <span className="adm-unavailable" title="Chưa lấy được từ máy chủ">—</span> : <NumberPop value={value} />}</strong>}
    </div>
    <span className="ops-kpi-hint">{hint}</span>
  </div>;
}

/**
 * `/admin/reviews` (Figma "Admin v2 · Duyệt kịch bản"): totals per status, the queue as a DataTable, and a 720px drawer
 * with the frozen content, hashes, readiness and the decision. Status, organization, page and the open review live in
 * the URL. The API filters by status and organizationId only (no search, no sort): the search box narrows the page on
 * the client and says so.
 */
export function ReviewsModule() {
  const { accessToken, ready, user } = useAuthSession();
  const { page, get, setParams, setPage } = useUrlParams({ pageSize: PAGE_SIZE });
  const statusFilter = parseStatusParam(get("status"));
  const organizationId = get("organizationId");
  const reviewId = get("review");
  const [search, setSearch] = useState("");

  const enabled = ready && user?.role === 0 && Boolean(accessToken);
  const status: ReviewStatus | undefined = statusFilter === "all" ? undefined : statusFilter;
  const list = useAsyncData(
    `reviews:${page}:${statusFilter}:${organizationId}`,
    (signal) => reviewsApi.list(accessToken as string, { status, organizationId: organizationId || undefined, page, pageSize: PAGE_SIZE }, signal),
    enabled,
  );
  const organizations = useAsyncData("reviews:organizations", () => organizationsApi.list(accessToken as string, { page: 1, pageSize: 100, isActive: true }), enabled);
  const submitted = useStatusTotal("Submitted", accessToken, enabled);
  const approved = useStatusTotal("Approved", accessToken, enabled);
  const rejected = useStatusTotal("Rejected", accessToken, enabled);
  const reloadAll = () => { list.reload(); submitted.reload(); approved.reload(); rejected.reload(); };
  const totals: Record<ReviewStatus, number | null> = { Submitted: submitted.value, Approved: approved.value, Rejected: rejected.value };

  const items = useMemo(() => list.data?.items ?? [], [list.data]);
  const orgItems = useMemo(() => organizations.data?.items ?? [], [organizations.data]);
  const orgOptions = useMemo<ComboboxOption[]>(() => {
    const options = orgItems.map((organization) => ({ value: organization.id, label: organization.name }));
    // A deep-linked id outside the first 100 active organizations keeps its value so the filter is not silently dropped.
    if (organizationId && !orgItems.some((organization) => organization.id === organizationId)) options.unshift({ value: organizationId, label: `Tổ chức ${shortId(organizationId)}` });
    return options;
  }, [orgItems, organizationId]);
  const needle = stripAccents(search.trim());
  const visible = useMemo(() => (needle ? items.filter((item) => stripAccents(`${item.scenarioName} ${item.organizationName} ${item.buildingName}`).includes(needle)) : items), [items, needle]);

  if (!ready) return <LoadingBlock label="Đang kiểm tra phiên đăng nhập…" />;
  if (user?.role !== 0) return <Alert tone="danger" title="Không có quyền truy cập">Chỉ quản trị FET3D duyệt được kịch bản.</Alert>;

  const totalCount = list.data?.totalCount ?? 0;
  const filtering = statusFilter !== "Submitted" || Boolean(organizationId);
  const failure = list.error !== undefined ? describeReadError(list.error, "queue") : null;
  const open = (id: string) => setParams({ review: id, page });
  const close = () => setParams({ review: null, page });
  const withCount = (value: ReviewStatus) => { const total = formatCount(totals[value]); return total === null ? chipLabel[value] : `${chipLabel[value]} · ${total}`; };

  const columns: DataColumn<ReviewSummary>[] = [
    { key: "scenario", header: "Kịch bản", primary: true, render: (row) => <CellTitle title={row.scenarioName} sub={`v${row.versionNumber}`} /> },
    { key: "organization", header: "Tổ chức · Công trình", hideBelow: 900, render: (row) => <span className="rev-cell-muted">{row.organizationName} · {row.buildingName}</span> },
    { key: "submitted", header: "Gửi lúc", width: 140, render: (row) => <time className="rev-cell-muted" dateTime={row.submittedAt} title={formatDateTime(row.submittedAt)}>{shortDateTime(row.submittedAt)}</time> },
    { key: "status", header: "Trạng thái", width: 170, render: (row) => <StatusBadge tone={statusTone(row.status)}>{statusLabel(row.status)}</StatusBadge> },
  ];

  const empty = failure ? null : needle
    ? <EmptyState icon={Search} title="Không có hàng nào khớp trên trang này" description="Ô tìm chỉ lọc trang đang xem. Xóa từ khóa hoặc đổi trạng thái / tổ chức để tìm trong toàn bộ hàng chờ." action={<Button variant="secondary" onClick={() => setSearch("")}>Xóa từ khóa</Button>} />
    : <EmptyState
      icon={filtering ? Search : ClipboardCheck}
      title={page > 1 && totalCount > 0 ? "Trang này không còn bản duyệt." : filtering ? "Không có bản duyệt phù hợp." : "Chưa có kịch bản nào chờ duyệt"}
      description={page > 1 && totalCount > 0 ? "Hàng chờ đã thay đổi kể từ lần tải trước." : filtering ? "Thử đổi trạng thái hoặc tổ chức, hoặc về bộ lọc mặc định." : "Khi một tổ chức gửi duyệt phiên bản kịch bản, bản đó sẽ xuất hiện ở đây."}
      action={page > 1 && totalCount > 0 ? <Button variant="secondary" onClick={() => setPage(1)}>Về trang 1</Button> : undefined}
    />;

  return <>
    <PageHeader
      eyebrow="Xử lý công việc"
      title="Duyệt kịch bản"
      description="Bấm một hàng để xem nội dung đã khóa và điều kiện kỹ thuật rồi duyệt hoặc từ chối."
      breadcrumbs={[{ label: "Quản trị", href: routes.adminOverview }, { label: "Duyệt kịch bản" }]}
      actions={<Button variant="quiet" onClick={reloadAll} disabled={list.loading}><RefreshCw size={16} aria-hidden="true" />{list.loading ? "Đang tải…" : "Tải lại"}</Button>}
    />

    <div className="adm-okpis adm-okpis--3" role="group" aria-label="Tổng theo trạng thái">
      <QueueKpi testId="kpi-submitted" label="Chờ duyệt" value={submitted.value} loading={submitted.loading} hint="Đã gửi, chưa quyết định" />
      <QueueKpi testId="kpi-approved" label="Đã duyệt" value={approved.value} loading={approved.loading} hint="Tổng mọi thời điểm" />
      <QueueKpi testId="kpi-rejected" label="Từ chối" value={rejected.value} loading={rejected.loading} hint="Kèm lý do bắt buộc" />
    </div>

    <DataTable
      data-testid="review-table"
      caption="Hàng chờ duyệt kịch bản"
      columns={columns}
      rows={visible}
      rowKey={(row) => row.reviewId}
      onRowClick={(row) => open(row.reviewId)}
      rowMenu={(row) => [
        { label: "Mở chi tiết", icon: Eye, onSelect: () => open(row.reviewId) },
        { label: "Chỉ xem tổ chức này", icon: Building2, onSelect: () => setParams({ organizationId: row.organizationId, page: 1 }), disabled: organizationId === row.organizationId, hint: organizationId === row.organizationId ? "Đang lọc theo tổ chức này" : undefined },
      ]}
      loading={list.loading && !list.data}
      error={failure && <Alert tone="danger" title={failure.title} action={failure.denied ? undefined : <Button size="sm" variant="secondary" className="mt-3" onClick={list.reload}>Thử lại</Button>}>{failure.message}</Alert>}
      empty={empty}
      toolbar={<>
        <TableSearch value={search} onChange={setSearch} placeholder="Tìm kịch bản hoặc tổ chức" label="Tìm trong trang đang xem" />
        <FilterChips label="Bộ lọc hàng chờ">
          <FilterChip
            label="Trạng thái"
            value={statusFilter === "all" ? "" : statusFilter}
            options={STATUSES.map((value) => ({ value, label: withCount(value) }))}
            allLabel="Tất cả"
            onChange={(value) => setParams({ status: value === "" ? "all" : value === "Submitted" ? null : value, page: 1 })}
          />
          <Combobox
            aria-label="Tổ chức"
            className="rev-org-filter"
            value={organizationId}
            onChange={(value) => setParams({ organizationId: value || null, page: 1 })}
            options={orgOptions}
            placeholder="Tổ chức: tất cả"
            searchPlaceholder="Tìm tổ chức…"
            emptyText="Không có tổ chức nào khớp"
            groupLabel="Tổ chức đang hoạt động"
            loading={organizations.loading && !organizations.data}
            clearable
          />
        </FilterChips>
        {filtering && <Button size="sm" variant="quiet" onClick={() => setParams({ status: null, organizationId: null, page: 1 })}>Về mặc định (chờ duyệt)</Button>}
      </>}
      pagination={totalCount > PAGE_SIZE ? { page, pageSize: PAGE_SIZE, totalCount, onPageChange: setPage } : undefined}
    />
    {organizations.error !== undefined && <p className="rev-note" role="status" style={{ marginTop: 8 }}>Không tải được danh sách tổ chức nên bộ lọc tổ chức chỉ giữ giá trị hiện tại. <Button size="sm" variant="quiet" onClick={organizations.reload}>Tải lại danh sách</Button></p>}
    {list.data && totalCount > 0 && <p className="adm-note" role="status">Hiển thị {visible.length} trên {formatCount(totalCount)} · trạng thái và tổ chức lọc toàn bộ hàng chờ; ô tìm chỉ lọc trang đang xem.</p>}

    <ReviewDrawer
      key={reviewId}
      open={Boolean(reviewId)}
      reviewId={reviewId}
      accessToken={accessToken}
      summary={items.find((item) => item.reviewId === reviewId)}
      onChanged={reloadAll}
      onClose={close}
    />
  </>;
}
