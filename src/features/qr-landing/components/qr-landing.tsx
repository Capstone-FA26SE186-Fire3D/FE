"use client";

import { Building2, CircleSlash, LogIn, RefreshCw, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useAsyncData } from "@/api/use-async-data";
import { ApiError } from "@/api/types/common";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge, type Tone } from "@/components/ui/status-badge";
import { useAuthSession } from "@/features/auth/auth-session";
import { formatDate } from "@/features/buildings/format";
import { qrLandingApi } from "../api";
import { isQrToken, qrLandingPath } from "../token";
import { MobileGuide } from "./mobile-guide";
import { ParticipationForm } from "./participation-form";
import { TrainingList } from "./training-list";

const TRAINEE = 2;

/** BE `ServiceStatus` of the Building: a paid period is running, one ran before and none does now, or none was ever paid. */
const serviceInfo: Record<string, { label: string; tone: Tone }> = {
  Active: { label: "Dịch vụ đang hiệu lực", tone: "success" },
  Expired: { label: "Dịch vụ đã hết hạn", tone: "danger" },
  NotPurchased: { label: "Chưa có dịch vụ", tone: "warning" },
};

function loginHref(token: string) {
  return `/login?next=${encodeURIComponent(qrLandingPath(token))}`;
}

function StateCard({ title, children, action }: { title: string; children: string; action?: ReactNode }) {
  return <Panel bodyClassName="ops-stack"><div className="qrl-state"><CircleSlash size={28} aria-hidden="true" /><h1>{title}</h1><p>{children}</p>{action}</div></Panel>;
}

/**
 * Landing of a Building QR. The QR only identifies the Building: the page resolves it for the signed-in user, shows
 * whether they already have access (Private Building: participation code first) and lists the published Trainings.
 * It never starts a session: that is the app's online step. The token stays in this tree's props and requests (path
 * only); it is not written to storage, error text or any log.
 */
export function QrLanding({ token }: { token: string }) {
  const { accessToken, endSession, ready, user } = useAuthSession();
  const valid = isQrToken(token);
  const enabled = valid && ready && Boolean(accessToken);
  const resolution = useAsyncData(`qr:resolve:${token}`, (signal) => qrLandingApi.resolve(accessToken ?? "", token, signal), enabled);
  const [sessionLost, setSessionLost] = useState(false);
  const [justVerified, setJustVerified] = useState(false);

  const resolveStatus = resolution.error instanceof ApiError ? resolution.error.status : resolution.error !== undefined ? -1 : 0;
  const expired = sessionLost || resolveStatus === 401;

  // A 401 means the stored session is dead: drop it, or /login would bounce straight back to this page.
  useEffect(() => { if (resolveStatus === 401) endSession(); }, [resolveStatus, endSession]);
  const onSessionLost = useCallback(() => { setSessionLost(true); endSession(); }, [endSession]);
  const { reload } = resolution;
  const onVerified = useCallback(() => { setJustVerified(true); reload(); }, [reload]);

  if (!valid) {
    return <StateCard title="Liên kết QR không hợp lệ" action={<Button asChild variant="secondary"><Link href="/">Về trang chủ</Link></Button>}>Địa chỉ này không phải một mã QR công trình của FET3D. Hãy quét lại mã QR hoặc xin tổ chức quản lý công trình mã mới.</StateCard>;
  }
  if (!ready) return <Panel><div role="status" aria-live="polite" className="ops-stack"><span className="qrl-sr">Đang kiểm tra phiên đăng nhập…</span><Skeleton style={{ height: 28, width: "60%" }} /><Skeleton style={{ height: 90 }} /></div></Panel>;

  if (!user || expired) {
    return <>
      <Panel bodyClassName="ops-stack">
        <div className="qrl-state">
          <LogIn size={28} aria-hidden="true" />
          <h1>{expired ? "Phiên đăng nhập đã hết hạn" : "Đăng nhập để xem công trình"}</h1>
          <p>{expired ? "Hãy đăng nhập lại. Bạn sẽ quay về đúng trang này." : "Mã QR này dẫn tới một công trình tập huấn trên FET3D. Đăng nhập để xem công trình và các bài đã phát hành."}</p>
          <div className="ops-actions" style={{ justifyContent: "center" }}><Button asChild><Link href={loginHref(token)}><LogIn size={16} aria-hidden="true" />Đăng nhập</Link></Button></div>
        </div>
        <p className="ops-muted">Mã QR chỉ xác định công trình, không cấp quyền. Công trình Riêng tư còn cần mã tham gia do tổ chức cung cấp sau khi bạn đăng nhập.</p>
      </Panel>
      <MobileGuide />
    </>;
  }

  if (resolution.loading && !resolution.data) {
    return <Panel><div role="status" aria-live="polite" className="ops-stack"><span className="qrl-sr">Đang mở công trình từ mã QR…</span><Skeleton style={{ height: 28, width: "60%" }} /><Skeleton style={{ height: 90 }} /></div></Panel>;
  }

  if (resolution.error !== undefined && !resolution.data) {
    // BE tells a revoked or replaced code (410) from an unknown one (404). Neither is a service problem: an expired
    // service still resolves and is explained on the Building card below.
    if (resolveStatus === 410) {
      return <>
        <StateCard title="Mã QR này đã bị thu hồi">Tổ chức quản lý công trình đã thu hồi mã này hoặc thay bằng mã mới, nên mã không còn mở được công trình. Việc này không liên quan tới hạn dịch vụ của công trình. Hãy xin tổ chức mã QR mới nhất.</StateCard>
        <MobileGuide />
      </>;
    }
    if (resolveStatus === 404) {
      return <>
        <StateCard title="Không tìm thấy công trình">Mã QR này không mở được công trình nào: có thể mã sai hoặc công trình không còn hoạt động. Hãy xin tổ chức quản lý công trình mã QR mới nhất.</StateCard>
        <MobileGuide />
      </>;
    }
    if (resolveStatus === 403) {
      return <StateCard title="Tài khoản chưa được xem công trình này">Tài khoản của bạn không có quyền mở mã QR này. Hãy đăng nhập bằng tài khoản phù hợp.</StateCard>;
    }
    const busyServer = resolveStatus === 429 || resolveStatus === 503;
    return <Panel bodyClassName="ops-stack"><Alert tone="danger" title="Không mở được công trình" action={<Button size="sm" variant="secondary" className="mt-3" onClick={reload}><RefreshCw size={14} aria-hidden="true" />Thử lại</Button>}>{busyServer ? "Hệ thống đang bận. Hãy thử lại sau ít phút." : resolveStatus >= 500 ? "Máy chủ gặp lỗi. Hãy thử lại sau." : "Mất kết nối tới máy chủ. Kiểm tra mạng rồi thử lại."}</Alert></Panel>;
  }

  const building = resolution.data;
  if (!building) return null;
  const isPrivate = building.visibility !== "Public";
  const staff = user.role !== TRAINEE;
  // An older server sends no service fields: unknown is never shown as Active and never blocks the guide.
  const service = serviceInfo[building.serviceStatus ?? ""] ?? null;
  const serviceDate = building.serviceEndsAt ? formatDate(building.serviceEndsAt) : null;
  const serviceBlocked = service !== null && building.serviceStatus !== "Active";

  return <>
    <Panel bodyClassName="ops-stack">
      <div className="qrl-building">
        <Building2 size={28} aria-hidden="true" />
        <div>
          <p className="qrl-eyebrow">Công trình từ mã QR</p>
          <h1>{building.buildingName}</h1>
          <div className="qrl-badges">
            <StatusBadge tone={isPrivate ? "neutral" : "info"}>{isPrivate ? "Riêng tư" : "Công khai"}</StatusBadge>
            <StatusBadge tone={building.hasAccess ? "success" : "warning"}>{building.hasAccess ? "Bạn đã có quyền tham gia" : "Cần mã tham gia"}</StatusBadge>
            {service && <StatusBadge tone={service.tone} data-testid="qr-service-status">{service.label}</StatusBadge>}
          </div>
        </div>
      </div>
      {building.serviceStatus === "Expired" && <Alert tone="warning" title="Dịch vụ của công trình đã hết hạn">Dịch vụ tập huấn của công trình này đã hết hạn{serviceDate ? ` từ ngày ${serviceDate}` : ""}. Mã QR vẫn đúng và bạn vẫn xem được danh sách bài, nhưng chưa bắt đầu được bài nào. {staff ? "Hãy gia hạn dịch vụ cho công trình trong mục Dịch vụ & thanh toán để học viên tập tiếp." : "Hãy báo tổ chức quản lý công trình gia hạn dịch vụ, rồi quét lại mã QR này."}</Alert>}
      {building.serviceStatus === "NotPurchased" && <Alert tone="warning" title="Công trình chưa có dịch vụ tập huấn">Tổ chức chưa đăng ký dịch vụ tập huấn cho công trình này, nên chưa bắt đầu được bài nào. Mã QR vẫn đúng. {staff ? "Hãy mua dịch vụ cho công trình trong mục Dịch vụ & thanh toán." : "Hãy báo tổ chức quản lý công trình, rồi quét lại mã QR này khi dịch vụ đã có."}</Alert>}
      <p className="ops-muted"><ShieldCheck size={14} aria-hidden="true" style={{ display: "inline", verticalAlign: "-2px", marginRight: 6 }} />Mã QR chỉ xác định công trình, không cấp quyền. Khi bạn bắt đầu một bài trong ứng dụng, hệ thống kiểm tra lại quyền tham gia, hạn dịch vụ của công trình và số suất người học.{service === null ? " Hết hạn dịch vụ vẫn xem được trang này nhưng không bắt đầu được phiên mới." : building.serviceStatus === "Active" && serviceDate ? ` Dịch vụ của công trình có hiệu lực đến ngày ${serviceDate}.` : ""}</p>
      {resolution.error !== undefined && <Alert tone="warning" title="Trạng thái có thể đã cũ" action={<Button size="sm" variant="secondary" className="mt-3" onClick={reload}>Tải lại</Button>}>Không làm mới được thông tin công trình. Đang hiển thị lần tải gần nhất.</Alert>}
    </Panel>

    {building.hasAccess
      ? <>
        {justVerified && <Alert tone="success" title="Đã xác minh mã tham gia">Quyền tham gia của bạn đã được ghi nhận cho công trình này.</Alert>}
        <TrainingList accessToken={accessToken ?? ""} token={token} staff={staff} canStart={!serviceBlocked && building.canStartNewSessions !== false} onSessionLost={onSessionLost} onRecheckAccess={reload} />
      </>
      : user.role === TRAINEE
        ? <ParticipationForm accessToken={accessToken ?? ""} buildingId={building.buildingId} onVerified={onVerified} onSessionLost={onSessionLost} />
        : <EmptyState icon={CircleSlash} title="Tài khoản này không nhập được mã tham gia" description="Chỉ tài khoản học viên mới xác minh được mã tham gia để vào công trình Riêng tư." />}

    <MobileGuide canStart={!serviceBlocked} />
  </>;
}
