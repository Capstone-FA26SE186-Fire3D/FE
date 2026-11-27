"use client";

import { ClipboardCheck, RefreshCw, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { describeApiError } from "@/api/describe-error";
import { useAsyncData } from "@/api/use-async-data";
import { useUrlParams } from "@/api/use-url-params";
import { formatDateTime } from "@/components/ops/detail-parts";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CellTitle, DataTable, type DataColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterChip, FilterChips } from "@/components/ui/filter-chip";
import { PageHeader } from "@/components/ui/page-header";
import { LoadingBlock } from "@/components/ui/spinner";
import { StatusBadge } from "@/components/ui/status-badge";
import { SubTabs } from "@/components/ui/sub-tabs";
import { routes } from "@/configs/routes";
import "@/features/admin-reviews/components/reviews.css";
import { useAuthSession } from "@/features/auth/auth-session";

import { assigneeName, expertReviewsApi, hasAssignment, KIND_LABEL, knownAssignment, pageHasAssignment, rememberAssignment, reviewTitle, statusOf, type ExpertAssigneeFilter, type ExpertReviewItem, type ExpertReviewKind, type ExpertReviewStatus } from "../api";

const PAGE_SIZE = 20;
const STATUSES: ExpertReviewStatus[] = ["Submitted", "Approved", "Rejected"];
const KINDS: ExpertReviewKind[] = ["Scenario", "Infrastructure"];
const parseStatus = (value: string): ExpertReviewStatus => ((STATUSES as string[]).includes(value) ? (value as ExpertReviewStatus) : "Submitted");
const parseKind = (value: string): ExpertReviewKind | undefined => ((KINDS as string[]).includes(value) ? (value as ExpertReviewKind) : undefined);

/**
 * `/expert/reviews`: the shared thẩm định queue of every Chuyên viên PCCC (BE#211, FR-PLAN-05). Kind, status and page live
 * in the URL; a row opens its own page (`/expert/reviews/[id]`), and an old `?review=` link is sent there.
 * Waiting items come oldest first, decided ones newest first (the server's order).
 */
export function ExpertReviews() {
  const { accessToken, ready, user } = useAuthSession();
  const router = useRouter();
  const { page, get, setParams, setPage } = useUrlParams({ pageSize: PAGE_SIZE });
  const status = parseStatus(get("status"));
  const kind = parseKind(get("kind"));
  const reviewId = get("review");
  const enabled = ready && user?.role === 3 && Boolean(accessToken) && !reviewId;
  useEffect(() => { if (reviewId) router.replace(routes.expertReview(reviewId)); }, [reviewId, router]);
  const assignee: ExpertAssigneeFilter = get("assignee") === "all" ? "all" : "me";
  // BE#242: the `assignee` query and the tabs exist only once a response proved the server assigns (`assignmentEnabled`
  // on the page, or the fields on an item or a detail).
  // Today's server never sends it, so the queue stays the shared one and the request is unchanged.
  const [detected, setDetected] = useState(false);
  const assigns = detected || (ready && knownAssignment());
  const list = useAsyncData(`expert-reviews:${page}:${status}:${kind ?? ""}:${assigns ? assignee : ""}`, async (signal) => {
    const result = await expertReviewsApi.list(accessToken as string, { kind, status, page, pageSize: PAGE_SIZE, ...(assigns ? { assignee } : {}) }, signal);
    if (pageHasAssignment(result)) { rememberAssignment(); setDetected(true); }
    return result;
  }, enabled);

  if (!ready) return <LoadingBlock label="Đang kiểm tra phiên đăng nhập…" />;
  if (reviewId) return <LoadingBlock label="Đang mở mục thẩm định…" />;
  if (user?.role !== 3) return <Alert tone="danger" title="Không có quyền truy cập">Chỉ Chuyên viên PCCC thẩm định được hạ tầng và tình huống.</Alert>;

  const items = list.data?.items ?? [];
  const totalCount = list.data?.totalCount ?? 0;
  const filtering = status !== "Submitted" || Boolean(kind);
  const mineOnly = assigns && assignee === "me";
  const open = (id: string) => router.push(routes.expertReview(id));
  const assignment = (row: ExpertReviewItem) => (!hasAssignment(row) ? "" : row.assignedTo ? ` · Giao cho: ${assigneeName(row.assignedTo)}` : " · Chưa giao");

  const columns: DataColumn<ExpertReviewItem>[] = [
    { key: "title", header: "Nội dung", primary: true, render: (row) => <CellTitle title={reviewTitle(row)} sub={`${KIND_LABEL[row.kind] ?? "Nội dung"} · phiên bản ${row.versionNumber}${assignment(row)}`} /> },
    { key: "organization", header: "Tổ chức · Công trình", hideBelow: 900, render: (row) => <span className="rev-cell-muted">{row.organizationName} · {row.buildingName}</span> },
    { key: "submitted", header: "Gửi lúc", width: 150, render: (row) => <time className="rev-cell-muted" dateTime={row.submittedAt}>{formatDateTime(row.submittedAt)}</time> },
    { key: "status", header: "Trạng thái", width: 150, render: (row) => <StatusBadge tone={statusOf(row.status).tone}>{statusOf(row.status).label}</StatusBadge> },
  ];

  return <>
    <PageHeader eyebrow="Thẩm định" title="Hàng chờ thẩm định"
      description={assigns
        ? "Hạ tầng PCCC và tình huống do các tổ chức gửi. Mỗi mục được giao lần lượt cho một Chuyên viên PCCC; bạn cho Đạt hoặc Chưa đạt những mục giao cho mình, các mục khác chỉ xem được."
        : "Hạ tầng PCCC và tình huống do các tổ chức gửi. Bấm một hàng để mở nội dung đã khoá trên mô hình 3D rồi cho Đạt hoặc Chưa đạt. Hàng chờ dùng chung: ai thẩm định trước thì kết quả của người đó được ghi."}
      actions={<Button variant="quiet" onClick={list.reload} disabled={list.loading}><RefreshCw size={16} aria-hidden="true" />{list.loading ? "Đang tải…" : "Tải lại"}</Button>} />

    {assigns && <SubTabs label="Mục được giao" value={assignee} className="mb-4" data-testid="expert-assignee-tabs"
      items={[{ value: "me", label: "Được giao cho bạn", "data-testid": "expert-tab-mine" }, { value: "all", label: "Tất cả", "data-testid": "expert-tab-all" }]}
      onValueChange={(value) => setParams({ assignee: value === "all" ? "all" : null, page: 1 })} />}

    <DataTable data-testid="expert-review-table" caption="Hàng chờ thẩm định" columns={columns} rows={items} rowKey={(row) => row.reviewId} onRowClick={(row) => open(row.reviewId)}
      loading={list.loading && !list.data}
      error={list.error !== undefined && !list.data && <Alert tone="danger" title="Không tải được hàng chờ thẩm định" action={<Button size="sm" variant="secondary" className="mt-3" onClick={list.reload}>Thử lại</Button>}>{describeApiError(list.error, "Hãy thử lại sau.")}</Alert>}
      empty={<EmptyState icon={filtering ? Search : ClipboardCheck}
        title={page > 1 && totalCount > 0 ? "Trang này không còn mục nào." : filtering ? "Không có mục nào phù hợp." : mineOnly ? "Chưa có mục nào giao cho bạn" : "Chưa có nội dung nào chờ thẩm định"}
        description={page > 1 && totalCount > 0 ? "Hàng chờ đã thay đổi kể từ lần tải trước." : filtering ? "Thử đổi loại hoặc trạng thái." : mineOnly ? "Mục mới được giao lần lượt cho từng Chuyên viên PCCC. Chọn Tất cả để xem cả hàng chờ." : "Khi một tổ chức gửi hạ tầng PCCC hoặc tình huống, mục đó xuất hiện ở đây."}
        action={page > 1 && totalCount > 0 ? <Button variant="secondary" onClick={() => setPage(1)}>Về trang 1</Button> : undefined} />}
      toolbar={<FilterChips label="Bộ lọc hàng chờ">
        <FilterChip label="Loại" value={kind ?? ""} options={KINDS.map((value) => ({ value, label: KIND_LABEL[value] }))} allLabel="Tất cả" onChange={(value) => setParams({ kind: value || null, page: 1 })} />
        {/* The queue has no "every status" view: the chip's first option is the default, waiting items. */}
        <FilterChip label="Trạng thái" value={status === "Submitted" ? "" : status} allLabel={statusOf("Submitted").label} options={STATUSES.filter((value) => value !== "Submitted").map((value) => ({ value, label: statusOf(value).label }))} onChange={(value) => setParams({ status: value || null, page: 1 })} />
      </FilterChips>}
      pagination={totalCount > PAGE_SIZE ? { page, pageSize: PAGE_SIZE, totalCount, onPageChange: setPage } : undefined} />
  </>;
}
