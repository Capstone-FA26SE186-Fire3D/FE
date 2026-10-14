"use client";

import { ClipboardCheck, RefreshCw, Search } from "lucide-react";
import { useAsyncData } from "@/api/use-async-data";
import { useUrlParams } from "@/api/use-url-params";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { SkeletonRows } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Pagination, Table, TableMessage } from "@/components/ui/table";
import { routes } from "@/configs/routes";
import { useAuthSession } from "@/features/auth/auth-session";
import { organizationsApi } from "@/features/organizations/api";
import { formatDateTime } from "@/utils/date-range";
import { describeReadError, reviewsApi } from "../api";
import { parseStatusParam, shortId, statusLabel, statusTone } from "../format";
import { reviewStatuses, type ReviewStatus } from "../types";
import { ReviewDetailView } from "./review-detail";
import "./reviews.css";

const PAGE_SIZE = 20;

/** `/admin/reviews`: PlatformAdmin queue of scenario content reviews. Filters, page and the open review live in the URL. */
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
  const organizations = useAsyncData("reviews:organizations", (signal) => organizationsApi.list(accessToken as string, { page: 1, pageSize: 100, isActive: true }, signal), enabled);

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

  return <>
    <PageHeader
      title="Duyệt kịch bản"
      description="PlatformAdmin duyệt nội dung và rubric đã đóng băng của từng phiên bản kịch bản. Đây là bước duyệt nội dung, tách biệt với readiness kỹ thuật và với việc phát hành."
      breadcrumbs={[{ label: "Quản trị", href: routes.adminOverview }, { label: "Duyệt kịch bản" }]}
      actions={<Button variant="quiet" onClick={list.reload} disabled={list.loading}><RefreshCw size={16} aria-hidden="true" />{list.loading ? "Đang tải…" : "Tải lại"}</Button>}
    />

    <div className="ops-toolbar">
      <Select aria-label="Trạng thái duyệt" style={{ width: 200 }} value={statusFilter} onChange={(event) => setParams({ status: event.target.value === "Submitted" ? null : event.target.value })}>
        {reviewStatuses.map((value) => <option key={value} value={value}>{statusLabel(value)}</option>)}
        <option value="all">Mọi trạng thái</option>
      </Select>
      <Select aria-label="Tổ chức" style={{ width: 240 }} value={organizationId} onChange={(event) => setParams({ organizationId: event.target.value })}>
        <option value="">Mọi tổ chức</option>
        {!orgKnown && <option value={organizationId}>Tổ chức {shortId(organizationId)}</option>}
        {orgItems.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
      </Select>
      {filtering && <Button variant="quiet" onClick={() => setParams({ status: null, organizationId: null })}>Về mặc định (chờ duyệt)</Button>}
    </div>
    {organizations.error !== undefined && <p className="rev-note" role="status">Không tải được danh sách tổ chức nên bộ lọc tổ chức chỉ giữ giá trị hiện tại. <Button size="sm" variant="quiet" onClick={organizations.reload}>Tải lại danh sách</Button></p>}

    {failure && <Alert tone="danger" title={failure.title} action={failure.denied ? undefined : <Button size="sm" variant="secondary" className="mt-3" onClick={list.reload}>Thử lại</Button>}>{failure.message}</Alert>}

    <Table caption="Hàng chờ duyệt kịch bản">
      <thead><tr><th>Tổ chức</th><th>Công trình</th><th>Kịch bản</th><th>Phiên bản</th><th>Người gửi</th><th>Gửi lúc</th><th>Trạng thái</th></tr></thead>
      <tbody>
        {list.loading && !list.data && <TableMessage colSpan={7}><SkeletonRows rows={6} label="Đang tải hàng chờ duyệt…" /></TableMessage>}
        {items.map((item) => <tr key={item.reviewId} data-testid="review-row">
          <td>{item.organizationName}</td>
          <td>{item.buildingName}</td>
          <td>
            <button type="button" className="rev-row-button" onClick={() => open(item.reviewId)} aria-label={`Mở bản duyệt ${item.scenarioName} phiên bản ${item.versionNumber}`}>{item.scenarioName}</button>
          </td>
          <td>v{item.versionNumber}</td>
          <td><span title={item.submittedBy}>{shortId(item.submittedBy)}</span></td>
          <td>{formatDateTime(item.submittedAt)}</td>
          <td><StatusBadge tone={statusTone(item.status)}>{statusLabel(item.status)}</StatusBadge></td>
        </tr>)}
        {list.data && !items.length && <TableMessage colSpan={7}><EmptyState
          icon={filtering ? Search : ClipboardCheck}
          title={page > 1 && totalCount > 0 ? "Trang này không còn bản duyệt." : filtering ? "Không có bản duyệt phù hợp." : "Chưa có kịch bản nào chờ duyệt"}
          description={page > 1 && totalCount > 0 ? "Hàng chờ đã thay đổi kể từ lần tải trước." : filtering ? "Thử đổi trạng thái hoặc tổ chức, hoặc về bộ lọc mặc định." : "Khi một tổ chức gửi duyệt phiên bản kịch bản, bản đó sẽ xuất hiện ở đây."}
          action={page > 1 && totalCount > 0 ? <Button variant="secondary" onClick={() => setPage(1)}>Về trang 1</Button> : undefined}
        /></TableMessage>}
      </tbody>
    </Table>
    {totalCount > PAGE_SIZE && <Pagination page={page} pageSize={PAGE_SIZE} totalCount={totalCount} onPageChange={setPage} disabled={list.loading} />}
    {list.data && totalCount > 0 && totalCount <= PAGE_SIZE && <p className="rev-note" role="status">{totalCount} bản duyệt.</p>}

    <Drawer open={Boolean(reviewId)} onOpenChange={(value) => { if (!value) close(); }} title="Chi tiết bản duyệt" description="Nội dung đã đóng băng, readiness kỹ thuật và quyết định." className="rev-drawer">
      {reviewId && accessToken && <ReviewDetailView key={reviewId} reviewId={reviewId} accessToken={accessToken} onChanged={list.reload} onClose={close} />}
    </Drawer>
  </>;
}
