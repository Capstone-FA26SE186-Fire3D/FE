"use client";

import { ClipboardCheck, Eye, RefreshCw, Search, UserRoundCog } from "lucide-react";
import { useMemo, useState } from "react";
import { invalidateAsyncData, useAsyncData } from "@/api/use-async-data";
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
import { LoadingBlock } from "@/components/ui/spinner";
import { SubTabs } from "@/components/ui/sub-tabs";
import { routes } from "@/configs/routes";
import { accountsApi } from "@/features/accounts/api";
import { organizationsApi } from "@/features/organizations/api";
import { useAuthSession } from "@/features/auth/auth-session";
import { formatCount } from "@/features/admin-overview/format";
import { assigneeLabel } from "@/features/expert-reviews/api";
import { formatDateTime } from "@/utils/date-range";
import { describeReadError, REVIEW_ASSIGNMENT_TAG, REVIEW_QUEUE_TAG, reviewsApi } from "../api";
import { statusLabel } from "../format";
import type { AssignedReview, ReviewStatus } from "../types";
import { InfrastructureReviewDrawer } from "./infrastructure-review-drawer";
import { ReassignDialog } from "./reassign-dialog";
import { ReviewDrawer } from "./review-detail";
import "./reviews.css";

const PAGE_SIZE = 20;
const EXPERT_ROLE = 3;
type Kind = "Scenario" | "Infrastructure";
const STATUSES: ReviewStatus[] = ["Submitted", "Approved", "Rejected"];
const chipLabel: Record<ReviewStatus, string> = { Submitted: "Chờ thẩm định", Approved: "Đạt thẩm định", Rejected: "Chưa đạt" };
const KIND_TEXT: Record<Kind, { tab: string; noun: string; search: string; emptyWaiting: string }> = {
  Scenario: { tab: "Tình huống", noun: "tình huống", search: "Tìm tình huống, tổ chức hoặc công trình", emptyWaiting: "Khi một tổ chức gửi thẩm định phiên bản tình huống, mục đó được giao cho một Chuyên viên PCCC và hiện ở đây." },
  Infrastructure: { tab: "Hạ tầng PCCC", noun: "hạ tầng PCCC", search: "Tìm tổ chức hoặc công trình", emptyWaiting: "Khi một tổ chức gửi thẩm định hạ tầng PCCC của bản IFC, mục đó được giao cho một Chuyên viên PCCC và hiện ở đây." },
};
const parseKind = (value: string): Kind => (value === "infrastructure" ? "Infrastructure" : "Scenario");
const parseStatus = (value: string): ReviewStatus => ((STATUSES as string[]).includes(value) ? (value as ReviewStatus) : "Submitted");

/** "23/10 10:50": the time column is narrow; the full timestamp is the cell's title. */
const shortDateTime = (iso: string) => new Date(iso).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Server total of one kind + status (page size 1: only `totalCount` is used). Null when it cannot be read. */
function useTotal(kind: Kind, status: ReviewStatus, token: string | null, enabled: boolean) {
  const result = useAsyncData(`reviews:total:${kind}:${status}`, (signal) => reviewsApi.assignments(token as string, { kind, status, page: 1, pageSize: 1 }, signal), enabled, { tags: [REVIEW_ASSIGNMENT_TAG] });
  return { value: result.data ? result.data.totalCount : null, loading: result.loading && !result.data && result.error === undefined };
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
 * `/admin/reviews`: thẩm định is watched per kind, because the two are different jobs. "Hạ tầng PCCC" (exits, assembly
 * points, fixed equipment of one IFC revision) is reviewed first and locked for every scenario; "Tình huống" (a scenario
 * version with objectives and a rubric) is reviewed on top of it. Each tab reads only `GET /api/admin/reviews` (BE#242,
 * kind + status + assigneeId), so the tiles, the tab counts and the table always agree. Waiting rows show the expert
 * holding them and offer "Gán lại"; scenario rows open the frozen content drawer (`/api/admin/scenario-reviews/{id}`,
 * same reviewId). The admin never decides (BE#245). Kind, status, expert, page and the open review live in the URL;
 * organization is a server filter too (BE#247); the search box narrows the page on the client. Infrastructure rows open a
 * read-only drawer with the items on the 3D model (`/api/admin/reviews/{id}` + `/preview`, BE#247).
 */
export function ReviewsModule() {
  const { accessToken, ready, user } = useAuthSession();
  const { page, get, setParams, setPage } = useUrlParams({ pageSize: PAGE_SIZE });
  const kind = parseKind(get("kind"));
  const status = parseStatus(get("status"));
  const assigneeId = get("assigneeId");
  const organizationId = get("organizationId");
  const reviewId = get("review");
  const [search, setSearch] = useState("");
  const [reassigning, setReassigning] = useState<AssignedReview | null>(null);

  const enabled = ready && user?.role === 0 && Boolean(accessToken);
  const list = useAsyncData(
    `reviews:list:${kind}:${status}:${assigneeId}:${organizationId}:${page}`,
    (signal) => reviewsApi.assignments(accessToken as string, { kind, status, assigneeId: assigneeId || undefined, organizationId: organizationId || undefined, page, pageSize: PAGE_SIZE }, signal),
    enabled,
    { tags: [REVIEW_ASSIGNMENT_TAG] },
  );
  const experts = useAsyncData("reviews:experts", (signal) => accountsApi.list(accessToken as string, { role: EXPERT_ROLE, page: 1, pageSize: 100, sort: "fullName" }, signal), enabled);
  const organizations = useAsyncData("reviews:organizations", () => organizationsApi.list(accessToken as string, { page: 1, pageSize: 100, isActive: true }), enabled);
  const waitingScenario = useTotal("Scenario", "Submitted", accessToken, enabled);
  const waitingInfrastructure = useTotal("Infrastructure", "Submitted", accessToken, enabled);
  const approved = useTotal(kind, "Approved", accessToken, enabled);
  const rejected = useTotal(kind, "Rejected", accessToken, enabled);
  const waiting = kind === "Scenario" ? waitingScenario : waitingInfrastructure;
  const totals: Record<ReviewStatus, number | null> = { Submitted: waiting.value, Approved: approved.value, Rejected: rejected.value };
  // Tiles, tab counts, the table and the sidebar badge (REVIEW_QUEUE_TAG) re-read together.
  const reloadAll = () => invalidateAsyncData(REVIEW_ASSIGNMENT_TAG, REVIEW_QUEUE_TAG);

  const items = useMemo(() => list.data?.items ?? [], [list.data]);
  const expertOptions = useMemo<ComboboxOption[]>(() => {
    const options = (experts.data?.items ?? []).map((account) => ({ value: account.id, label: account.fullName?.trim() || account.email, hint: account.email, keywords: [account.email] }));
    if (assigneeId && !options.some((option) => option.value === assigneeId)) options.unshift({ value: assigneeId, label: "Chuyên viên đang lọc", hint: "", keywords: [] });
    return options;
  }, [experts.data, assigneeId]);
  const orgOptions = useMemo<ComboboxOption[]>(() => {
    const options: ComboboxOption[] = (organizations.data?.items ?? []).map((organization) => ({ value: organization.id, label: organization.name }));
    // A deep-linked id outside the first 100 active organizations keeps its value so the filter is not silently dropped.
    if (organizationId && !options.some((option) => option.value === organizationId)) options.unshift({ value: organizationId, label: "Tổ chức đang lọc" });
    return options;
  }, [organizations.data, organizationId]);
  const needle = stripAccents(search.trim());
  const visible = useMemo(() => (needle ? items.filter((item) => stripAccents(`${item.scenarioName ?? ""} ${item.organizationName} ${item.buildingName}`).includes(needle)) : items), [items, needle]);

  if (!ready) return <LoadingBlock label="Đang kiểm tra phiên đăng nhập…" />;
  if (user?.role !== 0) return <Alert tone="danger" title="Không có quyền truy cập">Chỉ quản trị FET3D xem được danh sách thẩm định.</Alert>;

  const text = KIND_TEXT[kind];
  const waitingView = status === "Submitted";
  const totalCount = list.data?.totalCount ?? 0;
  const filtering = status !== "Submitted" || Boolean(assigneeId) || Boolean(organizationId);
  const failure = list.error !== undefined ? describeReadError(list.error, "queue") : null;
  const open = (id: string) => setParams({ review: id, page });
  const close = () => setParams({ review: null, page });
  const withCount = (value: ReviewStatus) => { const total = formatCount(totals[value]); return total === null ? chipLabel[value] : `${chipLabel[value]} · ${total}`; };
  const decider = (row: AssignedReview) => row.decidedByName?.trim() || (row.decidedBy ? "Chuyên viên PCCC" : "—");

  const columns: DataColumn<AssignedReview>[] = [
    { key: "title", header: "Nội dung", primary: true, render: (row) => kind === "Scenario"
      ? <CellTitle title={row.scenarioName ?? "Tình huống"} sub={`Phiên bản ${row.versionNumber}`} />
      : <CellTitle title={row.buildingName} sub={`Hạ tầng PCCC · phiên bản ${row.versionNumber}`} /> },
    { key: "organization", header: kind === "Scenario" ? "Tổ chức · Công trình" : "Tổ chức", hideBelow: 900, render: (row) => <span className="rev-cell-muted">{kind === "Scenario" ? `${row.organizationName} · ${row.buildingName}` : row.organizationName}</span> },
    { key: "expert", header: waitingView ? "Người được giao" : "Người thẩm định", width: 200, render: (row) => waitingView
      ? row.assigneeId ? <span title={row.assignedAt ? `Giao lúc ${formatDateTime(row.assignedAt)}` : undefined}>{assigneeLabel(row)}</span> : <span className="rev-cell-muted">Chưa giao</span>
      : <span title={row.reason ? `Lý do: ${row.reason}` : undefined}><CellTitle title={decider(row)} sub={statusLabel(row.status)} /></span> },
    { key: "time", header: waitingView ? "Gửi lúc" : "Kết quả lúc", width: 130, render: (row) => {
      const at = waitingView ? row.submittedAt : row.decidedAt ?? row.submittedAt;
      return <time className="rev-cell-muted" dateTime={at} title={formatDateTime(at)}>{shortDateTime(at)}</time>;
    } },
  ];

  const empty = failure ? null : needle
    ? <EmptyState icon={Search} title="Không có hàng nào khớp trên trang này" description="Ô tìm chỉ lọc trang đang xem. Xóa từ khóa hoặc đổi bộ lọc để tìm trong toàn bộ danh sách." action={<Button variant="secondary" onClick={() => setSearch("")}>Xóa từ khóa</Button>} />
    : <EmptyState
      icon={filtering ? Search : ClipboardCheck}
      title={page > 1 && totalCount > 0 ? "Trang này không còn mục nào." : filtering ? "Không có mục nào phù hợp." : `Không có ${text.noun} nào chờ thẩm định`}
      description={page > 1 && totalCount > 0 ? "Danh sách đã thay đổi kể từ lần tải trước." : filtering ? "Thử đổi trạng thái, Chuyên viên hoặc tổ chức, hoặc về bộ lọc mặc định." : text.emptyWaiting}
      action={page > 1 && totalCount > 0 ? <Button variant="secondary" onClick={() => setPage(1)}>Về trang 1</Button> : undefined}
    />;

  return <>
    <PageHeader
      eyebrow="Xử lý công việc"
      title="Theo dõi thẩm định"
      description="Chuyên viên PCCC thẩm định hạ tầng PCCC của công trình trước, rồi tới từng tình huống. Quản trị theo dõi, xem nội dung đã khóa và gán lại mục đang chờ; chỉ người được giao mới cho Đạt hoặc Chưa đạt."
      breadcrumbs={[{ label: "Quản trị", href: routes.adminOverview }, { label: "Theo dõi thẩm định" }]}
      actions={<Button variant="quiet" onClick={reloadAll} disabled={list.loading}><RefreshCw size={16} aria-hidden="true" />{list.loading ? "Đang tải…" : "Tải lại"}</Button>}
    />

    <SubTabs label="Loại thẩm định" value={kind === "Scenario" ? "scenario" : "infrastructure"} className="mb-4" data-testid="review-kind-tabs"
      items={[
        { value: "scenario", label: "Tình huống", count: waitingScenario.value ?? undefined, "data-testid": "review-tab-scenario" },
        { value: "infrastructure", label: "Hạ tầng PCCC", count: waitingInfrastructure.value ?? undefined, "data-testid": "review-tab-infrastructure" },
      ]}
      onValueChange={(value) => { setSearch(""); setParams({ kind: value === "infrastructure" ? "infrastructure" : null, review: null, page: 1 }); }} />

    <div className="adm-okpis adm-okpis--3" role="group" aria-label={`Tổng theo trạng thái · ${text.tab}`}>
      <QueueKpi testId="kpi-submitted" label="Chờ thẩm định" value={waiting.value} loading={waiting.loading} hint={`${text.tab} đã gửi, chưa có kết quả`} />
      <QueueKpi testId="kpi-approved" label="Đạt thẩm định" value={approved.value} loading={approved.loading} hint="Tổng mọi thời điểm" />
      <QueueKpi testId="kpi-rejected" label="Chưa đạt" value={rejected.value} loading={rejected.loading} hint="Kèm lý do của Chuyên viên" />
    </div>

    <DataTable
      data-testid="review-table"
      caption={`Danh sách thẩm định ${text.noun}`}
      columns={columns}
      rows={visible}
      rowKey={(row) => `${row.kind}:${row.reviewId}`}
      onRowClick={(row) => open(row.reviewId)}
      rowMenu={(row) => [
        { label: "Mở chi tiết", icon: Eye, onSelect: () => open(row.reviewId) },
        ...(row.status === "Submitted" ? [{ label: "Gán lại", icon: UserRoundCog, onSelect: () => setReassigning(row) }] : []),
      ]}
      loading={list.loading && !list.data}
      error={failure && <Alert tone="danger" title={failure.title} action={failure.denied ? undefined : <Button size="sm" variant="secondary" className="mt-3" onClick={list.reload}>Thử lại</Button>}>{failure.message}</Alert>}
      empty={empty}
      toolbar={<>
        <TableSearch value={search} onChange={setSearch} placeholder={text.search} label="Tìm trong trang đang xem" />
        <FilterChips label="Bộ lọc thẩm định">
          {/* The server has no "every status" view: the chip's first option is the default, waiting items. */}
          <FilterChip
            label="Trạng thái"
            value={status === "Submitted" ? "" : status}
            allLabel={withCount("Submitted")}
            options={STATUSES.filter((value) => value !== "Submitted").map((value) => ({ value, label: withCount(value) }))}
            onChange={(value) => setParams({ status: value || null, page: 1 })}
          />
          <Combobox
            aria-label="Chuyên viên PCCC"
            className="rev-org-filter"
            value={assigneeId}
            onChange={(value) => setParams({ assigneeId: value || null, page: 1 })}
            options={expertOptions}
            placeholder="Chuyên viên: tất cả"
            searchPlaceholder="Tìm theo tên hoặc email…"
            emptyText="Không có Chuyên viên nào khớp"
            groupLabel="Chuyên viên PCCC"
            loading={experts.loading && !experts.data}
            clearable
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
        {filtering && <Button size="sm" variant="quiet" onClick={() => setParams({ status: null, assigneeId: null, organizationId: null, page: 1 })}>Về mặc định (chờ thẩm định)</Button>}
      </>}
      pagination={totalCount > PAGE_SIZE ? { page, pageSize: PAGE_SIZE, totalCount, onPageChange: setPage } : undefined}
    />
    {list.data && totalCount > 0 && <p className="adm-note" role="status">Hiển thị {visible.length} trên {formatCount(totalCount)} · trạng thái, Chuyên viên và tổ chức lọc toàn bộ danh sách; ô tìm chỉ lọc trang đang xem.</p>}

    {reassigning && accessToken && <ReassignDialog key={`${reassigning.kind}:${reassigning.reviewId}`} review={reassigning} accessToken={accessToken} onClose={() => setReassigning(null)} onChanged={reloadAll} />}

    {kind === "Infrastructure"
      ? <InfrastructureReviewDrawer key={reviewId} open={Boolean(reviewId)} reviewId={reviewId} accessToken={accessToken} summary={items.find((item) => item.reviewId === reviewId)} onClose={close} />
      : <ReviewDrawer key={reviewId} open={Boolean(reviewId)} reviewId={reviewId} accessToken={accessToken} onClose={close} />}
  </>;
}
