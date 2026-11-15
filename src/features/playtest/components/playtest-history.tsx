"use client";

import { useAsyncData } from "@/api/use-async-data";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SkeletonRows } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDateTime } from "@/features/scenarios/components/versions/version-content";

import { playtestApi } from "../api";
import { describePlaytestError } from "../errors";
import { describeStatus, isPlaytestTerminal } from "../status";

const HISTORY_SIZE = 10;

/**
 * The signed-in user's playtests of this scenario, read from `GET /api/scenarios/{id}/playtests` (newest first, all
 * versions), so one that was started on another computer can be reopened without its link. BE never lists other users'
 * playtests. Opening a row only puts its id in the URL; the session view then reads it from the server.
 */
export function PlaytestHistory({ accessToken, scenarioId, versionId, onOpen }: {
  accessToken: string;
  scenarioId: string;
  /** The version on screen, to mark rows that belong to it. */
  versionId: string;
  onOpen: (playtestId: string) => void;
}) {
  const list = useAsyncData(`playtest-list:${scenarioId}`, (signal) => playtestApi.list(accessToken, scenarioId, { page: 1, pageSize: HISTORY_SIZE }, signal), true, { keepPrevious: false });
  const page = list.data;

  return <section className="pt-card" aria-labelledby="pt-history-title" data-testid="playtest-history">
    <h3 id="pt-history-title" className="ver-section-title">Lượt chạy thử bạn đã tạo</h3>
    {!page && list.error === undefined && <SkeletonRows rows={2} label="Đang tải các lượt chạy thử…" />}
    {!page && list.error !== undefined && <Alert tone="warning" title="Không tải được danh sách lượt chạy thử" action={<Button size="sm" variant="secondary" className="mt-3" onClick={list.reload}>Thử lại</Button>}>
      {describePlaytestError(list.error).message}
    </Alert>}
    {page && page.items.length === 0 && <p className="ver-note">Bạn chưa tạo lượt chạy thử nào cho kịch bản này.</p>}
    {page && page.items.length > 0 && <>
      <p className="ver-note">Mở lại một lượt đã tạo, kể cả khi bạn tạo nó trên máy tính khác.</p>
      <ul className="pt-history">
        {page.items.map((item) => {
          const view = describeStatus(item);
          const ended = isPlaytestTerminal(item.status);
          return <li key={item.id} data-testid="playtest-history-row">
            <div className="pt-history-main">
              <div className="ver-actions-row">
                <StatusBadge tone={view.tone}>{view.label}</StatusBadge>
                <span className="ver-note"><strong>Phiên bản {item.versionNumber}</strong>{item.scenarioVersionId === versionId ? " (đang xem)" : ""}</span>
              </div>
              <span className="ver-caption" style={{ margin: 0 }}>Tạo lúc {formatDateTime(item.createdAt)}{item.endedAt ? ` · kết thúc ${formatDateTime(item.endedAt)}` : ""}</span>
            </div>
            <Button size="sm" variant="secondary" onClick={() => onOpen(item.id)}>{ended ? "Xem lại" : "Mở lại"}</Button>
          </li>;
        })}
      </ul>
      {page.total > page.items.length && <p className="ver-caption" style={{ margin: 0 }}>Đang hiện {page.items.length} lượt mới nhất trong tổng số {page.total} lượt.</p>}
    </>}
  </section>;
}
