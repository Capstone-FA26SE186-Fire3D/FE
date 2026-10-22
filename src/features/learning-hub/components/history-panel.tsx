"use client";

import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { routes } from "@/configs/routes";
import { useAuthSession } from "@/features/auth/auth-session";
import { TrainingHistory } from "@/features/training-history/components/training-history";

/**
 * "Lịch sử" and personal results: the learner's own sessions from `GET /api/training/sessions` with the session state and
 * the stored result shown apart (FR-WEB-04, FR-ANALYTICS-02, FR-TRAINING-08). Other roles are pointed to their own area.
 */
export function HistoryPanel() {
  const { accessToken, ready, user } = useAuthSession();

  if (!ready) return <p role="status">Đang kiểm tra phiên đăng nhập…</p>;
  if (user?.role !== 2 || !accessToken) {
    const other = user?.role === 1 ? { href: routes.workspaceBuildings, label: "Mở không gian tổ chức" } : user?.role === 0 ? { href: routes.adminOverview, label: "Mở khu quản trị" } : null;
    return <Alert tone="info" title="Lịch sử lượt tập dành cho tài khoản học viên" action={other ? <Link className="mt-3 inline-block underline" href={other.href}>{other.label}</Link> : undefined}>Tài khoản tổ chức và quản trị xem số liệu tập huấn trong khu vực của mình, không có lịch sử lượt tập cá nhân.</Alert>;
  }
  return <TrainingHistory accessToken={accessToken} userId={user.id} />;
}
