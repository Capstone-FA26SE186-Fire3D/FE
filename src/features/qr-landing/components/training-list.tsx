"use client";

import { ClipboardList, RefreshCw } from "lucide-react";
import { useEffect } from "react";
import { useAsyncData } from "@/api/use-async-data";
import { ApiError } from "@/api/types/common";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge, type Tone } from "@/components/ui/status-badge";
import { formatDate } from "@/features/buildings/format";
import { qrLandingApi, type QrTraining } from "../api";

const modeLabels: Record<string, string> = { Learn: "Learn", Guided: "Guided Drill", Assessment: "Assessment" };
const trainingStatus: Record<string, { label: string; tone: Tone }> = {
  Active: { label: "Đang mở", tone: "success" },
  Draft: { label: "Nháp", tone: "neutral" },
  Closed: { label: "Đã đóng", tone: "neutral" },
  Archived: { label: "Đã lưu trữ", tone: "neutral" },
};
const releaseStatus: Record<string, { label: string; tone: Tone }> = {
  Published: { label: "Đã phát hành", tone: "success" },
  Built: { label: "Chưa phát hành", tone: "warning" },
  Revoked: { label: "Đã thu hồi", tone: "danger" },
};

function schedule(item: QrTraining) {
  if (item.startDate && item.endDate) return `${formatDate(item.startDate)} – ${formatDate(item.endDate)}`;
  if (item.startDate) return `Từ ${formatDate(item.startDate)}`;
  if (item.endDate) return `Đến ${formatDate(item.endDate)}`;
  return "Không giới hạn thời gian";
}

/**
 * Published Trainings of the QR Building (`GET /api/qr/{token}/trainings`). It is read-only: starting a session is the
 * app's online step, so there is deliberately no "Bắt đầu" button here.
 */
export function TrainingList({ accessToken, token, staff, onSessionLost, onRecheckAccess }: {
  accessToken: string;
  token: string;
  /** OrganizationUser / PlatformAdmin see every Training of the Building, not only what a Trainee may open. */
  staff: boolean;
  onSessionLost: () => void;
  onRecheckAccess: () => void;
}) {
  const list = useAsyncData(`qr:trainings:${token}`, (signal) => qrLandingApi.trainings(accessToken, token, signal));
  const status = list.error instanceof ApiError ? list.error.status : 0;
  useEffect(() => { if (status === 401) onSessionLost(); }, [status, onSessionLost]);

  if (list.loading && !list.data) return <Panel title="Bài tập huấn"><div role="status" aria-live="polite" style={{ display: "grid", gap: 10 }}><span className="qrl-sr">Đang tải danh sách bài…</span><Skeleton style={{ height: 76 }} /><Skeleton style={{ height: 76 }} /></div></Panel>;

  if (list.error !== undefined && !list.data) {
    if (status === 403) return <Panel title="Bài tập huấn"><Alert tone="warning" title="Chưa có quyền xem danh sách bài" action={<Button size="sm" variant="secondary" className="mt-3" onClick={onRecheckAccess}>Kiểm tra lại quyền</Button>}>Quyền tham gia công trình có thể đã thay đổi (ví dụ tổ chức vừa đổi mã hoặc chế độ truy cập). Hãy kiểm tra lại quyền, rồi nhập mã tham gia nếu được yêu cầu.</Alert></Panel>;
    if (status === 404) return <Panel title="Bài tập huấn"><Alert tone="warning" title="Không tìm thấy công trình">Mã QR có thể đã bị thu hồi hoặc thay bằng mã mới. Hãy quét lại mã QR hiện hành.</Alert></Panel>;
    return <Panel title="Bài tập huấn"><Alert tone="danger" title="Không tải được danh sách bài" action={<Button size="sm" variant="secondary" className="mt-3" onClick={list.reload}><RefreshCw size={14} aria-hidden="true" />Thử lại</Button>}>{status === 429 || status === 503 ? "Hệ thống đang bận. Hãy thử lại sau ít phút." : status >= 500 ? "Máy chủ gặp lỗi. Hãy thử lại sau." : "Mất kết nối tới máy chủ. Kiểm tra mạng rồi thử lại."}</Alert></Panel>;
  }

  const items = list.data ?? [];
  return <Panel title="Bài tập huấn" description={staff ? "Bạn xem với vai trò quản lý: danh sách gồm cả bài chưa mở cho học viên." : "Các bài đã phát hành và đang mở cho công trình này."} bodyClassName="ops-stack">
    {list.error !== undefined && <Alert tone="warning" title="Dữ liệu có thể đã cũ" action={<Button size="sm" variant="secondary" className="mt-3" onClick={list.reload}>Tải lại</Button>}>Không làm mới được danh sách. Đang hiển thị lần tải gần nhất.</Alert>}
    {items.length === 0
      ? <EmptyState icon={ClipboardList} title="Chưa có bài tập huấn nào" description="Tổ chức chưa phát hành bài cho công trình này, hoặc chưa tới thời gian mở bài. Hãy quay lại sau." action={<Button variant="secondary" onClick={list.reload}><RefreshCw size={16} aria-hidden="true" />Tải lại danh sách</Button>} />
      : <ul className="qrl-trainings" aria-label="Danh sách bài tập huấn">
        {items.map((item) => <li key={item.id} className="qrl-training">
          <h3>{item.name}</h3>
          <p className="qrl-desc">{item.description?.trim() || "Chưa có mô tả."}</p>
          <div className="qrl-meta">
            {item.allowedModes.length > 0
              ? <ul className="qrl-modes" aria-label="Chế độ cho phép">{item.allowedModes.map((mode) => <li key={mode}><StatusBadge tone="info">{modeLabels[mode] ?? mode}</StatusBadge></li>)}</ul>
              : <span className="ops-muted">Chưa có chế độ nào được cho phép.</span>}
            <span className="ops-muted">Thời gian mở: {schedule(item)}</span>
            <span className="ops-muted">Tạo ngày {formatDate(item.createdAt)}</span>
          </div>
          {staff && <div className="qrl-modes">
            <StatusBadge tone={(trainingStatus[item.status] ?? { tone: "neutral" as Tone }).tone}>Bài: {trainingStatus[item.status]?.label ?? item.status}</StatusBadge>
            {item.releaseStatus && <StatusBadge tone={(releaseStatus[item.releaseStatus] ?? { tone: "neutral" as Tone }).tone}>Bản phát hành: {releaseStatus[item.releaseStatus]?.label ?? item.releaseStatus}</StatusBadge>}
          </div>}
        </li>)}
      </ul>}
  </Panel>;
}
