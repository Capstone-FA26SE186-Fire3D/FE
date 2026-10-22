"use client";

import { ClipboardCheck, RefreshCw, Search } from "lucide-react";
import { useAsyncData } from "@/api/use-async-data";
import { useUrlParams } from "@/api/use-url-params";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { SkeletonRows } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Pagination } from "@/components/ui/table";
import { routes } from "@/configs/routes";
import { useAuthSession } from "@/features/auth/auth-session";
import { Chip, Chips, DetailPane, KpiRow, KpiTile, Split } from "@/features/admin-overview/components/admin-kit";
import { formatCount, relativeTime } from "@/features/admin-overview/format";
import { organizationsApi } from "@/features/organizations/api";
import { describeReadError, reviewsApi } from "../api";
import { parseStatusParam, shortId, statusLabel, statusTone } from "../format";
import type { ReviewStatus } from "../types";
import { ReviewDetailView } from "./review-detail";
import "./reviews.css";

const PAGE_SIZE = 20;
const chipLabel: Record<ReviewStatus | "all", string> = { Submitted: "Chờ duyệt", Approved: "Đã duyệt", Rejected: "Từ chối", all: "Tất cả" };

/** Total of one status across the whole system (page size 1: only `totalCount` is used). Null when it cannot be read. */
function useStatusTotal(status: ReviewStatus, token: string | null, enabled: boolean) {
  const result = useAsyncData(`reviews:total:${status}`, (signal) => reviewsApi.list(token as string, { status, page: 1, pageSize: 1 }, signal), enabled);
  return { value: result.data ? result.data.totalCount : null, loading: result.loading && !result.data, reload: result.reload };
}

/**
 * `/admin/reviews`: PlatformAdmin queue of scenario content reviews (Figma "Duyệt kịch bản"): totals per status, a queue
 * on the left and the frozen content with the decision on the right. Filters, page and the open review live in the URL.
 * The API filters by status and organizationId only and has no sort, so the screen offers nothing else.
 */
export function ReviewsModule() {
  const { accessToken, ready, user } = useAuthSession();
  const { page, get, setParams, setPage } = useUrlParams({ pageSize: PAGE_SIZE });
  const statusFilter = parseStatusParam(get("status"));
  const organizationId = get("organizationId");
  const reviewId = get("review");

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

  if (!ready) return <p role="status">Đang kiểm tra phiên đăng nhập…</p>;
  if (user?.role !== 0) return <Alert tone="danger" title="Không có quyền truy cập">Chỉ PlatformAdmin duyệt được kịch bản.</Alert>;

  const items = list.data?.items ?? [];
  const totalCount = list.data?.totalCount ?? 0;
  const orgItems = organizations.data?.items ?? [];
  const orgKnown = !organizationId || orgItems.some((organization) => organization.id === organizationId);
  const filtering = statusFilter !== "Submitted" || Boolean(organizationId);
  const failure = list.error !== undefined ? describeReadError(list.error, "queue") : null;

  const open = (id: string) => setParams({ review: id, page });
  const close = () => setParams({ review: null, page });
  const withCount = (value: ReviewStatus) => { const total = formatCount(totals[value]); return total === null ? chipLabel[value] : `${chipLabel[value]} · ${total}`; };

  return <>
    <PageHeader
      eyebrow="Xử lý công việc"
      title="Duyệt kịch bản"
      description="Hàng đợi lấy từ máy chủ. Các con số là tổng toàn hệ thống, không phải số dòng của trang đang xem."
      breadcrumbs={[{ label: "Quản trị", href: routes.adminOverview }, { label: "Duyệt kịch bản" }]}
      actions={<Button variant="quiet" onClick={reloadAll} disabled={list.loading}><RefreshCw size={16} aria-hidden="true" />{list.loading ? "Đang tải…" : "Tải lại"}</Button>}
    />

    <KpiRow columns={3} label="Tổng theo trạng thái">
      <KpiTile label="Chờ duyệt" value={formatCount(submitted.value)} loading={submitted.loading} hint="Tổng từ máy chủ" />
      <KpiTile label="Đã duyệt" value={formatCount(approved.value)} loading={approved.loading} hint="Tổng từ máy chủ" />
      <KpiTile label="Từ chối" value={formatCount(rejected.value)} loading={rejected.loading} hint="Có lý do bắt buộc" />
    </KpiRow>

    <Split queue>
      <section className="ops-panel adm-queue-panel" aria-label="Hàng chờ duyệt">
        <div className="ops-panel-body">
          <Chips label="Trạng thái duyệt">
            {(["Submitted", "Approved", "Rejected"] as const).map((value) => <Chip key={value} active={statusFilter === value} onClick={() => setParams({ status: value === "Submitted" ? null : value, page: 1 })}>{withCount(value)}</Chip>)}
            <Chip active={statusFilter === "all"} onClick={() => setParams({ status: "all", page: 1 })}>{chipLabel.all}</Chip>
          </Chips>
          <Select aria-label="Tổ chức" value={organizationId} onChange={(event) => setParams({ organizationId: event.target.value, page: 1 })}>
            <option value="">Tổ chức: tất cả</option>
            {!orgKnown && <option value={organizationId}>Tổ chức {shortId(organizationId)}</option>}
            {orgItems.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
          </Select>
          {filtering && <div style={{ marginTop: 8 }}><Button size="sm" variant="quiet" onClick={() => setParams({ status: null, organizationId: null })}>Về mặc định (chờ duyệt)</Button></div>}
          {organizations.error !== undefined && <p className="rev-note" role="status" style={{ marginTop: 8 }}>Không tải được danh sách tổ chức nên bộ lọc tổ chức chỉ giữ giá trị hiện tại. <Button size="sm" variant="quiet" onClick={organizations.reload}>Tải lại danh sách</Button></p>}
          {list.data && totalCount > 0 && <p className="adm-note" role="status">Hiển thị {items.length} trên {formatCount(totalCount)} · bộ lọc áp dụng cho toàn bộ hàng đợi.</p>}

          {failure && <div style={{ marginTop: 12 }}><Alert tone="danger" title={failure.title} action={failure.denied ? undefined : <Button size="sm" variant="secondary" className="mt-3" onClick={list.reload}>Thử lại</Button>}>{failure.message}</Alert></div>}

          {list.loading && !list.data && <div style={{ marginTop: 12 }}><SkeletonRows rows={5} label="Đang tải hàng chờ duyệt…" /></div>}
          {items.length > 0 && <ul className="adm-queue" style={{ marginTop: 12 }} aria-label="Hàng chờ duyệt kịch bản">
            {items.map((item) => <li key={item.reviewId}>
              <button type="button" className="adm-queue-item" data-testid="review-row" aria-current={reviewId === item.reviewId ? "true" : undefined} onClick={() => open(item.reviewId)} aria-label={`Mở bản duyệt ${item.scenarioName} phiên bản ${item.versionNumber}`}>
                <span>
                  <span className="adm-queue-title">{item.scenarioName}</span>
                  <span className="adm-queue-sub">{item.organizationName} · {item.buildingName} · v{item.versionNumber}</span>
                </span>
                <span className="adm-queue-meta">
                  <span>{relativeTime(item.submittedAt)}</span>
                  <StatusBadge tone={statusTone(item.status)}>{statusLabel(item.status)}</StatusBadge>
                </span>
              </button>
            </li>)}
          </ul>}
          {list.data && !items.length && <div style={{ marginTop: 12 }}><EmptyState
            icon={filtering ? Search : ClipboardCheck}
            title={page > 1 && totalCount > 0 ? "Trang này không còn bản duyệt." : filtering ? "Không có bản duyệt phù hợp." : "Chưa có kịch bản nào chờ duyệt"}
            description={page > 1 && totalCount > 0 ? "Hàng chờ đã thay đổi kể từ lần tải trước." : filtering ? "Thử đổi trạng thái hoặc tổ chức, hoặc về bộ lọc mặc định." : "Khi một tổ chức gửi duyệt phiên bản kịch bản, bản đó sẽ xuất hiện ở đây."}
            action={page > 1 && totalCount > 0 ? <Button variant="secondary" onClick={() => setPage(1)}>Về trang 1</Button> : undefined}
          /></div>}
          {totalCount > PAGE_SIZE && <Pagination page={page} pageSize={PAGE_SIZE} totalCount={totalCount} onPageChange={setPage} disabled={list.loading} />}
        </div>
      </section>

      <DetailPane
        open={Boolean(reviewId)}
        label="Chi tiết bản duyệt"
        onClose={close}
        closeLabel="Đóng"
        placeholder={{ icon: ClipboardCheck, title: "Chọn một bản duyệt", text: "Nội dung đã đóng băng, hash và quyết định hiện ở đây." }}
      >
        {reviewId && accessToken && <ReviewDetailView key={reviewId} reviewId={reviewId} accessToken={accessToken} onChanged={reloadAll} onClose={close} />}
      </DetailPane>
    </Split>
  </>;
}
