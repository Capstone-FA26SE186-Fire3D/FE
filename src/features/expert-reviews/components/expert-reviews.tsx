"use client";

import { CircleCheck, CircleX, ClipboardCheck, RefreshCw, Search } from "lucide-react";
import { useState } from "react";

import { describeApiError } from "@/api/describe-error";
import { useIdempotencyKey } from "@/api/idempotency";
import { useAsyncData } from "@/api/use-async-data";
import { useUrlParams } from "@/api/use-url-params";
import { formatDateTime } from "@/components/ops/detail-parts";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CellTitle, DataTable, type DataColumn } from "@/components/ui/data-table";
import { Drawer, Modal } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Textarea } from "@/components/ui/field";
import { FilterChip, FilterChips } from "@/components/ui/filter-chip";
import { PageHeader } from "@/components/ui/page-header";
import { SkeletonDetail } from "@/components/ui/skeleton";
import { LoadingBlock } from "@/components/ui/spinner";
import { StatusBadge } from "@/components/ui/status-badge";
import { SupportCode } from "@/components/ui/support-code";
import { useToast } from "@/components/ui/toast";
import { ReviewContent } from "@/features/admin-reviews/components/review-content";
import "@/features/admin-reviews/components/reviews.css";
import { useAuthSession } from "@/features/auth/auth-session";

import { describeDecisionError, expertReviewsApi, KIND_LABEL, REASON_MAX, reviewTitle, statusOf, validateReason, type DecisionFailure, type ExpertAction, type ExpertReviewItem, type ExpertReviewKind, type ExpertReviewStatus } from "../api";
import { ReviewModel } from "./review-model";

const PAGE_SIZE = 20;
const STATUSES: ExpertReviewStatus[] = ["Submitted", "Approved", "Rejected"];
const KINDS: ExpertReviewKind[] = ["Scenario", "Infrastructure"];
const parseStatus = (value: string): ExpertReviewStatus => ((STATUSES as string[]).includes(value) ? (value as ExpertReviewStatus) : "Submitted");
const parseKind = (value: string): ExpertReviewKind | undefined => ((KINDS as string[]).includes(value) ? (value as ExpertReviewKind) : undefined);

/**
 * `/expert/reviews`: the shared thẩm định queue of every Chuyên viên PCCC (BE#211, FR-PLAN-05). Kind, status, page and the
 * open item live in the URL. Waiting items come oldest first, decided ones newest first (the server's order).
 */
export function ExpertReviews() {
  const { accessToken, ready, user } = useAuthSession();
  const { page, get, setParams, setPage } = useUrlParams({ pageSize: PAGE_SIZE });
  const status = parseStatus(get("status"));
  const kind = parseKind(get("kind"));
  const reviewId = get("review");
  const enabled = ready && user?.role === 3 && Boolean(accessToken);
  const list = useAsyncData(`expert-reviews:${page}:${status}:${kind ?? ""}`, (signal) => expertReviewsApi.list(accessToken as string, { kind, status, page, pageSize: PAGE_SIZE }, signal), enabled);

  if (!ready) return <LoadingBlock label="Đang kiểm tra phiên đăng nhập…" />;
  if (user?.role !== 3) return <Alert tone="danger" title="Không có quyền truy cập">Chỉ Chuyên viên PCCC thẩm định được hạ tầng và tình huống.</Alert>;

  const items = list.data?.items ?? [];
  const totalCount = list.data?.totalCount ?? 0;
  const filtering = status !== "Submitted" || Boolean(kind);
  const open = (id: string) => setParams({ review: id, page });

  const columns: DataColumn<ExpertReviewItem>[] = [
    { key: "title", header: "Nội dung", primary: true, render: (row) => <CellTitle title={reviewTitle(row)} sub={`${KIND_LABEL[row.kind] ?? "Nội dung"} · phiên bản ${row.versionNumber}`} /> },
    { key: "organization", header: "Tổ chức · Công trình", hideBelow: 900, render: (row) => <span className="rev-cell-muted">{row.organizationName} · {row.buildingName}</span> },
    { key: "submitted", header: "Gửi lúc", width: 150, render: (row) => <time className="rev-cell-muted" dateTime={row.submittedAt}>{formatDateTime(row.submittedAt)}</time> },
    { key: "status", header: "Trạng thái", width: 150, render: (row) => <StatusBadge tone={statusOf(row.status).tone}>{statusOf(row.status).label}</StatusBadge> },
  ];

  return <>
    <PageHeader eyebrow="Thẩm định" title="Hàng chờ thẩm định"
      description="Hạ tầng PCCC và tình huống do các tổ chức gửi. Bấm một hàng để xem nội dung đã khoá rồi cho Đạt hoặc Chưa đạt. Hàng chờ dùng chung: ai thẩm định trước thì kết quả của người đó được ghi."
      actions={<Button variant="quiet" onClick={list.reload} disabled={list.loading}><RefreshCw size={16} aria-hidden="true" />{list.loading ? "Đang tải…" : "Tải lại"}</Button>} />

    <DataTable data-testid="expert-review-table" caption="Hàng chờ thẩm định" columns={columns} rows={items} rowKey={(row) => row.reviewId} onRowClick={(row) => open(row.reviewId)}
      loading={list.loading && !list.data}
      error={list.error !== undefined && !list.data && <Alert tone="danger" title="Không tải được hàng chờ thẩm định" action={<Button size="sm" variant="secondary" className="mt-3" onClick={list.reload}>Thử lại</Button>}>{describeApiError(list.error, "Hãy thử lại sau.")}</Alert>}
      empty={<EmptyState icon={filtering ? Search : ClipboardCheck}
        title={page > 1 && totalCount > 0 ? "Trang này không còn mục nào." : filtering ? "Không có mục nào phù hợp." : "Chưa có nội dung nào chờ thẩm định"}
        description={page > 1 && totalCount > 0 ? "Hàng chờ đã thay đổi kể từ lần tải trước." : filtering ? "Thử đổi loại hoặc trạng thái." : "Khi một tổ chức gửi hạ tầng PCCC hoặc tình huống, mục đó xuất hiện ở đây."}
        action={page > 1 && totalCount > 0 ? <Button variant="secondary" onClick={() => setPage(1)}>Về trang 1</Button> : undefined} />}
      toolbar={<FilterChips label="Bộ lọc hàng chờ">
        <FilterChip label="Loại" value={kind ?? ""} options={KINDS.map((value) => ({ value, label: KIND_LABEL[value] }))} allLabel="Tất cả" onChange={(value) => setParams({ kind: value || null, page: 1 })} />
        {/* The queue has no "every status" view: the chip's first option is the default, waiting items. */}
        <FilterChip label="Trạng thái" value={status === "Submitted" ? "" : status} allLabel={statusOf("Submitted").label} options={STATUSES.filter((value) => value !== "Submitted").map((value) => ({ value, label: statusOf(value).label }))} onChange={(value) => setParams({ status: value || null, page: 1 })} />
      </FilterChips>}
      pagination={totalCount > PAGE_SIZE ? { page, pageSize: PAGE_SIZE, totalCount, onPageChange: setPage } : undefined} />

    <ExpertReviewDrawer key={reviewId} open={Boolean(reviewId)} reviewId={reviewId} accessToken={accessToken} summary={items.find((item) => item.reviewId === reviewId)}
      onChanged={list.reload} onClose={() => setParams({ review: null, page })} />
  </>;
}

/**
 * One item of the queue: who sent it, the frozen content (on the 3D model and as text) and the decision. The decision
 * pins the revision this drawer read (`If-Match`): when another expert decided first the server answers 412 and the drawer
 * reloads to show that result. A decision is final; the organization fixes by sending a new version.
 */
function ExpertReviewDrawer({ open, reviewId, accessToken, summary, onChanged, onClose }: { open: boolean; reviewId: string; accessToken: string | null; summary?: ExpertReviewItem; onChanged: () => void; onClose: () => void }) {
  const toast = useToast();
  const { keyFor, done } = useIdempotencyKey();
  const loaded = useAsyncData(`expert-review:${reviewId}`, (signal) => expertReviewsApi.detail(accessToken as string, reviewId, signal), open && Boolean(reviewId) && Boolean(accessToken));
  const [action, setAction] = useState<ExpertAction | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<DecisionFailure | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const detail = loaded.data?.detail;
  const etag = loaded.data?.etag ?? null;
  const review = detail?.review ?? summary ?? null;
  const pending = detail?.review.status === "Submitted";
  const canDecide = Boolean(detail) && pending && Boolean(etag) && !loaded.loading && loaded.error === undefined;
  const isInfrastructure = review?.kind === "Infrastructure";

  const decide = async () => {
    if (!detail || !etag || !action || busy) return;
    if (action === "reject") {
      const error = validateReason(reason);
      setReasonError(error);
      if (error) return;
    }
    setBusy(true);
    setFailure(null);
    try {
      const sent = action === "reject" ? reason.trim() : undefined;
      await expertReviewsApi.decide(accessToken as string, action, reviewId, etag, keyFor({ reviewId, action, etag, reason: sent }), sent);
      done();
      toast.notify({ tone: "success", title: action === "approve" ? "Đã ghi: Đạt thẩm định" : "Đã ghi: Chưa đạt", description: reviewTitle(detail.review) });
      setAction(null);
      loaded.reload();
      onChanged();
    } catch (cause) {
      const described = describeDecisionError(cause);
      if (described.kind === "reload") {
        done();
        setAction(null);
        setNotice(described.message);
        loaded.reload();
        onChanged();
      } else {
        if (described.kind === "fix") setReasonError(described.message);
        setFailure(described);
      }
    } finally {
      setBusy(false);
    }
  };

  const status = review ? statusOf(review.status) : null;
  const footer = detail
    ? pending
      ? <>
        <Button variant="secondary" className="rev-btn-danger" onClick={() => { setFailure(null); setAction("reject"); }} disabled={!canDecide} data-testid="expert-reject"><CircleX size={16} aria-hidden="true" />Chưa đạt</Button>
        <Button onClick={() => { setFailure(null); setAction("approve"); }} disabled={!canDecide} data-testid="expert-approve"><CircleCheck size={16} aria-hidden="true" />Đạt thẩm định</Button>
      </>
      : <><p className="rev-note rev-foot-note">Kết quả đã được ghi và không đổi được.</p><Button variant="secondary" onClick={onClose}>Đóng</Button></>
    : undefined;

  return <Drawer open={open} onOpenChange={(next) => { if (!next && !action) onClose(); }} side="right" size="xl" className="rev-drawer" data-testid="expert-review-drawer"
    title={review ? reviewTitle(review) : loaded.error !== undefined ? "Không mở được mục này" : "Đang tải…"}
    description={review ? `${review.organizationName} · ${review.buildingName}` : undefined}
    eyebrow={review && status ? <><StatusBadge tone={status.tone}>{status.label}</StatusBadge><StatusBadge tone="neutral">{KIND_LABEL[review.kind] ?? "Nội dung"} · phiên bản {review.versionNumber}</StatusBadge></> : undefined}
    footer={footer}
    headerExtra={<Button size="icon" variant="ghost" onClick={loaded.reload} disabled={loaded.loading} aria-label="Làm mới chi tiết"><RefreshCw size={16} aria-hidden="true" className={loaded.loading ? "rev-spin" : undefined} /></Button>}>
    {!detail
      ? loaded.error !== undefined
        ? <Alert tone="danger" title="Không mở được mục này" action={<Button size="sm" variant="secondary" className="mt-3" onClick={loaded.reload}>Thử lại</Button>}>{describeApiError(loaded.error, "Hãy thử lại sau.")}</Alert>
        : <div role="status" aria-live="polite"><span className="ops-sr-only">Đang tải chi tiết…</span><SkeletonDetail rows={6} /></div>
      : <div className="ops-stack rev-body" data-testid="expert-review-detail" data-review-status={detail.review.status}>
        {notice && <Alert tone="warning" title="Kết quả của bạn chưa được ghi">{notice}</Alert>}
        {loaded.error !== undefined && <Alert tone="warning" title="Dữ liệu có thể đã cũ" action={<Button size="sm" variant="secondary" className="mt-3" onClick={loaded.reload}>Thử lại</Button>}>{describeApiError(loaded.error, "Hãy thử lại sau.")} Các nút thẩm định bị khoá cho tới khi tải lại được.</Alert>}

        <dl className="rev-dl">
          <dt>Người gửi</dt><dd>{detail.review.submittedByName ?? "Tài khoản tổ chức"}</dd>
          <dt>Gửi lúc</dt><dd>{formatDateTime(detail.review.submittedAt)}</dd>
        </dl>
        {pending && <p className="rev-note">Bạn thẩm định <strong>đúng nội dung đang xem</strong>. Kết quả không đổi được; nếu cần sửa, tổ chức tạo phiên bản mới và gửi lại. Thẩm định trên mô phỏng không thay việc người đứng đầu cơ sở phê duyệt phương án PC06.</p>}

        <ReviewModel accessToken={accessToken as string} detail={detail} />
        {!isInfrastructure && <ReviewContent detail={detail} />}

        {!pending && <section className="rev-decision" aria-label="Kết quả thẩm định">
          <h3>Kết quả</h3>
          <p className="rev-note" data-testid="expert-result">{detail.review.status === "Approved" ? (isInfrastructure ? "Hạ tầng đạt thẩm định và đã khoá. Tổ chức tạo được tình huống trên phiên bản này." : "Tình huống đạt thẩm định.") : "Chưa đạt thẩm định. Tổ chức cần sửa và gửi phiên bản mới."}</p>
          {detail.review.decidedAt && <dl className="rev-dl" style={{ marginTop: 10 }}>
            <dt>Chuyên viên PCCC</dt><dd>{detail.review.decidedByName ?? "—"}</dd>
            <dt>Thời điểm</dt><dd>{formatDateTime(detail.review.decidedAt)}</dd>
          </dl>}
          {detail.review.status === "Rejected" && <div className="rev-reason" style={{ marginTop: 10 }} data-testid="expert-reason"><strong>Lý do chưa đạt</strong><p>{detail.review.reason || "Không có lý do được lưu."}</p></div>}
        </section>}

        <SupportCode id={detail.review.reviewId} />
      </div>}

    {action && detail && <Modal open onOpenChange={(next) => { if (!next && !busy) setAction(null); }}
      title={action === "reject" ? "Ghi kết quả: Chưa đạt?" : "Ghi kết quả: Đạt thẩm định?"}
      description={`${reviewTitle(detail.review)} · ${detail.review.organizationName}`}
      className={action === "reject" ? "ops-dialog--danger" : undefined}
      footer={<>
        <Button variant="ghost" onClick={() => setAction(null)} disabled={busy}>Hủy</Button>
        <Button variant={action === "reject" ? "secondary" : "primary"} className={action === "reject" ? "rev-btn-danger" : undefined} onClick={() => void decide()} disabled={busy} data-testid="expert-confirm">
          {busy ? "Đang ghi…" : failure?.kind === "retry" ? "Thử lại" : action === "reject" ? "Ghi: Chưa đạt" : "Ghi: Đạt thẩm định"}
        </Button>
      </>}>
      <div className="ops-stack">
        <p className="rev-note">{action === "reject"
          ? "Tổ chức sẽ đọc được lý do và phải tạo phiên bản mới để gửi lại. Kết quả này không đổi được."
          : isInfrastructure ? "Hạ tầng sẽ được khoá: mọi tình huống của bản IFC này dùng chung lối thoát, điểm tập kết và thiết bị của nó. Kết quả này không đổi được." : "Tình huống được ghi là đạt thẩm định. Kết quả này không đổi được."}</p>
        {action === "reject" && <Field label="Lý do chưa đạt" required hint={`${reason.trim().length}/${REASON_MAX} ký tự. Nêu rõ cần sửa gì.`} error={reasonError}>
          {(props) => <Textarea {...props} rows={5} value={reason} disabled={busy} data-testid="expert-reason-input" onChange={(event) => { setReason(event.target.value); if (reasonError) setReasonError(undefined); }} />}
        </Field>}
        {failure && <Alert tone={failure.kind === "retry" ? "warning" : "danger"} title="Chưa ghi được kết quả">{failure.message}<SupportCode code={failure.code} /></Alert>}
      </div>
    </Modal>}
  </Drawer>;
}
