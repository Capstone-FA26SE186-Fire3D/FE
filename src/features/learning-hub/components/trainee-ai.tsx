"use client";

import { History, Hourglass, Lock, Search, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

import { useAsyncData } from "@/api/use-async-data";
import { useUrlParams } from "@/api/use-url-params";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { CellTitle, DataTable, type DataColumn } from "@/components/ui/data-table";
import { Drawer } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/field";
import { StatusBadge } from "@/components/ui/status-badge";
import { routes } from "@/configs/routes";
import { useAuthSession } from "@/features/auth/auth-session";
import { formatDateTime, formatQuota } from "@/features/billing/format";
import { traineeAiApi } from "@/features/org-ai/api";
import { RequestPanel } from "@/features/org-ai/components/request-panel";
import { useOptionalAiBubble } from "@/features/org-ai/floating/ai-bubble-context";
import { aiErrorText, statusLabel, statusTone } from "@/features/org-ai/labels";
import { traineeBlock } from "@/features/org-ai/trainee";
import { AI_STATUSES, urlFilter, urlId, type AiRequest } from "@/features/org-ai/types";
import styles from "@/features/org-ai/org-ai.module.css";
import { StateCard } from "./state-card";

const PAGE_SIZE = 20;
/** Links into the assistant ("Hỏi AI về bài này", a result, the overview shortcut) carry these; they open the bubble. */
const HANDOVER = ["article", "session", "training", "q"] as const;

/**
 * "Trợ lý AI" of the learning hub, the Trainee's counterpart of `/workspace/ai`: the conversation is the floating bubble on
 * every hub page; this view manages it: today's allowance and the questions already asked (`GET /api/ai/trainee/requests`),
 * each one readable again in a drawer (`?request=`). Other roles are pointed to their own AI.
 */
export function TraineeAi() {
  const { accessToken, ready, user } = useAuthSession();
  if (!ready) return <p role="status">Đang kiểm tra phiên đăng nhập…</p>;
  if (user?.role !== 2 || !accessToken) {
    const other = user?.role === 1 ? { href: routes.workspaceAi, label: "Mở Trợ lý AI của tổ chức" } : user?.role === 0 ? { href: routes.adminAi, label: "Mở khu quản trị AI" } : null;
    return <Alert tone="info" title="Trợ lý AI ở đây dành cho tài khoản học viên" action={other ? <Link className="mt-3 inline-block underline" href={other.href}>{other.label}</Link> : undefined}>Tài khoản tổ chức và quản trị dùng trợ lý AI trong khu vực của mình.</Alert>;
  }
  return <Manager accessToken={accessToken} />;
}

function Manager({ accessToken }: { accessToken: string }) {
  const bubble = useOptionalAiBubble();
  const { page, get, setParams, setPage } = useUrlParams({ pageSize: PAGE_SIZE });
  const status = urlFilter(get("status"), AI_STATUSES);
  const requestId = urlId(get("request"));
  const settled = bubble?.settledCount ?? 0;

  const quota = useAsyncData(`trainee-ai:quota:${settled}`, (signal) => traineeAiApi.quota(accessToken, signal));
  const list = useAsyncData(`trainee-ai:list:${page}:${status}:${settled}`, (signal) => traineeAiApi.listRequests(accessToken, { page, pageSize: PAGE_SIZE, status: status || undefined }, signal));

  // A link that asks about something (an article, a result, a Training, a typed question) opens the bubble with it, then
  // the address goes back to the plain page so a reload does not open it again.
  const article = get("article"), session = get("session"), training = get("training"), draft = get("q");
  const openWith = bubble?.openWith;
  useEffect(() => {
    if (!openWith || !(article || session || training || draft)) return;
    openWith(article || session || training ? { article: article || undefined, session: session || undefined, training: training || undefined } : null, draft || undefined);
    setParams(Object.fromEntries(HANDOVER.map((key) => [key, null])), "replace");
  }, [article, session, training, draft, openWith, setParams]);

  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  const block = quota.data ? traineeBlock(quota.data) : null;
  const unit = quota.data?.quotaUnit ?? undefined;

  const columns: DataColumn<AiRequest>[] = [
    { key: "text", header: "Câu hỏi", primary: true, render: (row) => <CellTitle title={<span className={styles.clip} data-testid="ai-row-text">{row.input?.text?.trim() || "Câu hỏi không có nội dung xem trước"}</span>} /> },
    { key: "status", header: "Trạng thái", width: 190, render: (row) => <StatusBadge tone={statusTone(row.status, row.resultType)} data-testid="ai-row-status">{statusLabel(row.status, row.resultType)}</StatusBadge> },
    { key: "createdAt", header: "Thời gian", width: 170, render: (row) => formatDateTime(row.createdAt) },
  ];

  return <div className={styles.stack} data-testid="trainee-ai">
    <div className={styles.kpis} data-testid="trainee-ai-kpis">
      <div className="ops-kpi">
        <span className="ops-kpi-label">Lượt hỏi còn hôm nay</span>
        <div className="ops-kpi-row"><span className="ops-kpi-value" data-testid="trainee-ai-remaining">{quota.data ? (quota.data.policyActive ? formatQuota(quota.data.remainingUnits, unit) : "—") : quota.error !== undefined ? "—" : "…"}</span></div>
        <span className="ops-kpi-hint">{quota.data?.policyActive && quota.data.dailyUnits != null ? `Mỗi ngày ${formatQuota(quota.data.dailyUnits, unit)}` : quota.data && !quota.data.policyActive ? "Trợ lý AI chưa được bật" : "Hạn mức của riêng bạn"}</span>
      </div>
      <div className="ops-kpi">
        <span className="ops-kpi-label">Làm mới lúc</span>
        <div className="ops-kpi-row"><span className="ops-kpi-value">{quota.data?.policyActive ? formatDateTime(quota.data.resetsAt) : quota.error !== undefined ? "—" : quota.data ? "—" : "…"}</span></div>
        <span className="ops-kpi-hint">{quota.data?.policyActive && quota.data.estimatedReserve != null ? `Mỗi câu hỏi dùng khoảng ${formatQuota(quota.data.estimatedReserve, unit)}` : "Lượt hỏi được làm mới mỗi ngày"}</span>
      </div>
    </div>
    {quota.error !== undefined && <Alert tone="danger" title="Chưa kiểm tra được lượt hỏi hôm nay" action={<Button type="button" size="sm" variant="secondary" className="mt-3" onClick={quota.reload}>Thử lại</Button>}>{aiErrorText(quota.error)}</Alert>}
    {block && <StateCard icon={quota.data?.blockedByAssessment ? Lock : Hourglass} tone="warning" role="status" kicker="Trợ lý AI" title={block.title}
      actions={<Link className={buttonVariants({ variant: "secondary" })} href={routes.learn}>Đọc bài học</Link>}>{block.text}</StateCard>}

    <DataTable<AiRequest>
      data-testid="trainee-ai-history"
      caption="Câu hỏi bạn đã hỏi Trợ lý AI"
      columns={columns} rows={items} rowKey={(row) => row.requestId}
      onRowClick={(row) => setParams({ request: row.requestId })}
      loading={list.loading && !list.data}
      error={list.error !== undefined ? <Alert tone="danger" title="Không tải được câu hỏi đã hỏi" action={<Button size="sm" variant="secondary" className="mt-3" onClick={list.reload}>Thử lại</Button>}>{aiErrorText(list.error)}</Alert> : undefined}
      empty={<EmptyState icon={status ? Search : History} title={status ? "Không có câu hỏi phù hợp." : "Bạn chưa hỏi câu nào"} description={status ? "Thử đổi hoặc xóa bộ lọc." : "Bấm nút Trợ lý AI ở góc màn hình để đặt câu hỏi đầu tiên."} />}
      toolbar={<>
        <Select aria-label="Trạng thái" style={{ width: 200 }} value={status} onChange={(event) => setParams({ status: event.target.value })}>
          <option value="">Mọi trạng thái</option>{AI_STATUSES.map((value) => <option key={value} value={value}>{statusLabel(value)}</option>)}
        </Select>
        {status && <Button variant="quiet" onClick={() => setParams({ status: null })}>Xóa bộ lọc</Button>}
      </>}
      pagination={total > PAGE_SIZE ? { page, pageSize: PAGE_SIZE, totalCount: total, onPageChange: setPage } : undefined}
    />
    <p className={styles.dim}>Chỉ bạn xem được câu hỏi của mình. Bấm một hàng để đọc lại câu trả lời và nguồn.</p>

    <Drawer open={requestId !== ""} onOpenChange={(open) => { if (!open) setParams({ request: null }); }} size="md" title="Câu trả lời" description="Câu trả lời được lưu lại và tự cập nhật khi còn đang xử lý." data-testid="trainee-ai-request">
      {requestId && <RequestPanel key={requestId} accessToken={accessToken} requestId={requestId} trainee onSettled={() => { quota.reload(); list.reload(); }} />}
    </Drawer>
  </div>;
}

/** Header action of the view: opens the floating assistant. */
export function OpenAssistantButton() {
  const bubble = useOptionalAiBubble();
  if (!bubble?.enabled) return null;
  return <Button type="button" onClick={bubble.openPanel} data-testid="ai-open-bubble"><Sparkles size={16} aria-hidden="true" />Mở trợ lý</Button>;
}
