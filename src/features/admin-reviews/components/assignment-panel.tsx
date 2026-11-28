"use client";

import { ClipboardCheck, Eye, UserRoundCog } from "lucide-react";
import { useState } from "react";

import { useAsyncData } from "@/api/use-async-data";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CellTitle, DataTable, type DataColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/panel";
import { assigneeLabel, KIND_LABEL, reviewTitle } from "@/features/expert-reviews/api";
import { formatDateTime } from "@/utils/date-range";

import { describeReadError, REVIEW_ASSIGNMENT_TAG, reviewsApi } from "../api";
import type { AssignedReview } from "../types";
import { ReassignDialog } from "./reassign-dialog";

const PAGE_SIZE = 20;

/**
 * "Đang chờ thẩm định — người được giao" (BE#242): every waiting item of BOTH kinds from `GET /api/admin/reviews`
 * (status Submitted, the server's default, oldest first) with the expert holding it and "Gán lại". The scenario list
 * above (`/api/admin/scenario-reviews`) has no hạ tầng PCCC and no assignee, so this panel is its own read.
 */
export function AssignmentPanel({ accessToken, enabled, onOpenScenario, onChanged }: { accessToken: string | null; enabled: boolean; onOpenScenario: (reviewId: string) => void; onChanged: () => void }) {
  const [page, setPage] = useState(1);
  const [reassigning, setReassigning] = useState<AssignedReview | null>(null);
  const list = useAsyncData(`reviews:assignments:${page}`, (signal) => reviewsApi.assignments(accessToken as string, { page, pageSize: PAGE_SIZE }, signal), enabled && Boolean(accessToken), { tags: [REVIEW_ASSIGNMENT_TAG] });
  const items = list.data?.items ?? [];
  const totalCount = list.data?.totalCount ?? 0;
  const failure = list.error !== undefined ? describeReadError(list.error, "queue") : null;

  const columns: DataColumn<AssignedReview>[] = [
    { key: "title", header: "Nội dung", primary: true, render: (row) => <CellTitle title={reviewTitle(row)} sub={`${KIND_LABEL[row.kind] ?? "Nội dung"} · phiên bản ${row.versionNumber}`} /> },
    { key: "organization", header: "Tổ chức · Công trình", hideBelow: 900, render: (row) => <span className="rev-cell-muted">{row.organizationName} · {row.buildingName}</span> },
    { key: "assignee", header: "Người được giao", width: 200, render: (row) => row.assigneeId
      ? <span title={row.assignedAt ? `Giao lúc ${formatDateTime(row.assignedAt)}` : undefined}>{assigneeLabel(row)}</span>
      : <span className="rev-cell-muted">Chưa giao</span> },
    { key: "submitted", header: "Gửi lúc", width: 150, render: (row) => <time className="rev-cell-muted" dateTime={row.submittedAt}>{formatDateTime(row.submittedAt)}</time> },
  ];

  return <Panel className="mt-6" title="Đang chờ thẩm định — người được giao" data-testid="assignment-panel"
    description="Tình huống và hạ tầng PCCC đang chờ, mỗi mục do một Chuyên viên PCCC giữ. Gán lại khi người đang giữ không xử lý được; chỉ người được giao mới cho Đạt hoặc Chưa đạt.">
    <DataTable data-testid="assignment-table" caption="Mục đang chờ thẩm định và người được giao" columns={columns} rows={items} rowKey={(row) => `${row.kind}:${row.reviewId}`}
      rowMenu={(row) => [
        ...(row.kind === "Scenario" ? [{ label: "Mở chi tiết", icon: Eye, onSelect: () => onOpenScenario(row.reviewId) }] : []),
        { label: "Gán lại", icon: UserRoundCog, onSelect: () => setReassigning(row) },
      ]}
      loading={list.loading && !list.data}
      error={failure && <Alert tone="danger" title={failure.title} action={failure.denied ? undefined : <Button size="sm" variant="secondary" className="mt-3" onClick={list.reload}>Thử lại</Button>}>{failure.message}</Alert>}
      empty={<EmptyState icon={ClipboardCheck} title={page > 1 && totalCount > 0 ? "Trang này không còn mục nào." : "Không có mục nào đang chờ thẩm định"}
        description={page > 1 && totalCount > 0 ? "Danh sách đã thay đổi kể từ lần tải trước." : "Khi một tổ chức gửi tình huống hoặc hạ tầng PCCC, mục đó được giao cho một Chuyên viên PCCC và hiện ở đây."}
        action={page > 1 && totalCount > 0 ? <Button variant="secondary" onClick={() => setPage(1)}>Về trang 1</Button> : undefined} />}
      pagination={totalCount > PAGE_SIZE ? { page, pageSize: PAGE_SIZE, totalCount, onPageChange: setPage } : undefined} />
    {reassigning && accessToken && <ReassignDialog key={`${reassigning.kind}:${reassigning.reviewId}`} review={reassigning} accessToken={accessToken} onClose={() => setReassigning(null)} onChanged={onChanged} />}
  </Panel>;
}
