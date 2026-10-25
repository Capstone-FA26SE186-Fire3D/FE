"use client";

import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { routes } from "@/configs/routes";
import { useAuthSession } from "@/features/auth/auth-session";
import { SupportTabs } from "./organization-support";

/**
 * Support and feedback entry point for a Trainee inside the learning hub (FR-SUPPORT-01). The API allows Trainee and
 * OrganizationUser to create their own tickets/feedback (`POST /api/support/tickets`, `POST /api/feedback`); every list
 * and detail is creator-owned. Other roles are pointed to their own area.
 */
export function TraineeSupport() {
  const { accessToken, ready, user } = useAuthSession();

  if (!ready) return <p role="status">Đang kiểm tra phiên đăng nhập…</p>;
  if (user?.role !== 2 || !accessToken) {
    const other = user?.role === 1 ? { href: routes.workspaceSupport, label: "Mở hỗ trợ trong không gian tổ chức" } : user?.role === 0 ? { href: routes.adminSupport, label: "Mở hộp thư hỗ trợ của quản trị" } : null;
    return <Alert tone="info" title="Mục này dành cho học viên" action={other ? <Link className="mt-3 inline-block underline" href={other.href}>{other.label}</Link> : undefined}>Tài khoản tổ chức và quản trị dùng khu vực hỗ trợ riêng của mình.</Alert>;
  }

  // The hub topbar already carries the page heading.
  return <div className="ops-stack">
    <p className="ops-muted">Gửi yêu cầu hỗ trợ, theo dõi trao đổi với đội FET3D và góp ý về bài học hoặc ứng dụng. Chỉ bạn xem được các mục do bạn tạo.</p>
    <SupportTabs accessToken={accessToken} myId={user.id} audience="trainee" />
  </div>;
}
