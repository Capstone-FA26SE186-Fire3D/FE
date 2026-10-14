"use client";

import { Building2, LifeBuoy, Users } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Panel, Stat } from "@/components/ui/panel";
import type { Tone } from "@/components/ui/status-badge";
import { routes } from "@/configs/routes";
import { ticketStatusLabel, ticketStatusTone } from "@/features/support/labels";
import { fmt } from "../format";
import type { OperationsReport } from "../types";
import { CountRows } from "./charts";
import styles from "./analytics.module.css";

const roleNames: Record<string, string> = { PlatformAdmin: "Platform admin", OrganizationUser: "Thành viên tổ chức", Trainee: "Học viên" };
const jobStatusLabel: Record<string, string> = { Queued: "Đang chờ", Running: "Đang chạy", Processing: "Đang xử lý", Succeeded: "Hoàn tất", Failed: "Thất bại", Cancelled: "Đã hủy", Canceled: "Đã hủy" };

function jobTone(status: string): Tone {
  if (/fail|error|dead/i.test(status)) return "danger";
  if (/succe|complete|done/i.test(status)) return "success";
  if (/run|process|claim/i.test(status)) return "info";
  return "neutral";
}

const sum = (items: Array<{ count: number }>) => items.reduce((total, item) => total + item.count, 0);

/**
 * Operations of the platform (Admin), one organization (Admin) or the caller's tenant. Buildings and accounts are a
 * snapshot at the update time; jobs and tickets are those created in the period. Package builds are included in jobs, and
 * a finished job is not the same as a model that passed QA.
 */
export function OperationsReportView({ data, scope, organizationId }: { data: OperationsReport; scope: "platform" | "organization" | "admin-organization"; organizationId?: string }) {
  const platform = scope === "platform";
  const accounts = data.accounts ?? [];
  const accountsActive = sum(accounts.filter((item) => item.isActive));
  const accountsTotal = sum(accounts);
  const buildingsActive = sum(data.buildings.filter((item) => item.isActive));
  const buildingsTotal = sum(data.buildings);
  const jobsFailed = sum(data.processingJobs.filter((item) => jobTone(item.status) === "danger"));
  const ticketsOpen = sum(data.tickets.filter((item) => item.status === "Open" || item.status === "InProgress"));

  const roles = Array.from(new Set(accounts.map((item) => item.role)));
  const accountRows = roles.flatMap((role) => [true, false].flatMap((isActive) => {
    const count = sum(accounts.filter((item) => item.role === role && item.isActive === isActive));
    return count || isActive ? [{ key: `${role}-${isActive}`, label: `${roleNames[role] ?? role} · ${isActive ? "hoạt động" : "vô hiệu"}`, count, tone: (isActive ? "success" : "neutral") as Tone }] : [];
  }));
  const buildingRows = [
    { key: "active", label: "Đang hoạt động", count: buildingsActive, tone: "success" as Tone },
    { key: "inactive", label: "Đã lưu trữ", count: buildingsTotal - buildingsActive, tone: "neutral" as Tone },
  ].filter((row) => buildingsTotal > 0 && (row.count > 0 || row.key === "active"));
  const organizations = data.organizations ?? [];
  const organizationsActive = sum(organizations.filter((item) => item.isActive));
  const organizationRows = [
    { key: "active", label: "Đang hoạt động", count: organizationsActive, tone: "success" as Tone },
    { key: "inactive", label: "Đã vô hiệu hóa", count: sum(organizations) - organizationsActive, tone: "neutral" as Tone },
  ].filter((row) => organizations.length > 0 && (row.count > 0 || row.key === "active"));
  const kinds = Array.from(new Set(data.processingJobs.map((item) => item.kind)));

  return <>
    <div className="ops-grid ops-grid-4" style={{ marginBottom: 16 }}>
      {platform && <Stat label="Tài khoản (hiện tại)" value={fmt(accountsTotal)} hint={`${fmt(accountsActive)} hoạt động · ${fmt(accountsTotal - accountsActive)} vô hiệu`} />}
      <Stat label="Công trình (hiện tại)" value={fmt(buildingsTotal)} hint={buildingsTotal ? `${fmt(buildingsActive)} hoạt động · ${fmt(buildingsTotal - buildingsActive)} lưu trữ` : "Chưa có công trình"} />
      <Stat label="Tiến trình xử lý (trong kỳ)" value={fmt(sum(data.processingJobs))} hint={`${fmt(jobsFailed)} thất bại`} />
      <Stat label="Ticket hỗ trợ (trong kỳ)" value={fmt(sum(data.tickets))} hint={`${fmt(ticketsOpen)} chưa xử lý xong`} />
    </div>

    <div className="ops-grid ops-grid-2">
      {platform && <Panel title="Tài khoản theo vai trò" description="Ảnh chụp tại thời điểm cập nhật, không phụ thuộc khoảng thời gian." actions={<Button asChild size="sm" variant="quiet"><Link href={routes.adminAccounts}><Users size={16} aria-hidden="true" />Quản lý</Link></Button>}>
        <CountRows rows={accountRows} label="Tài khoản theo vai trò" empty="Chưa có tài khoản." />
      </Panel>}
      <Panel title="Công trình" description="Ảnh chụp hiện tại; công trình đã xóa không được tính." actions={platform ? <Button asChild size="sm" variant="quiet"><Link href={routes.adminOrganizations}><Building2 size={16} aria-hidden="true" />Theo tổ chức</Link></Button> : undefined}>
        <CountRows rows={buildingRows} label="Công trình theo trạng thái" empty="Chưa có công trình." />
      </Panel>
      {platform && organizations.length > 0 && <Panel title="Tổ chức" description="Ảnh chụp hiện tại; tổ chức đã xóa không được tính.">
        <CountRows rows={organizationRows} label="Tổ chức theo trạng thái" empty="Chưa có tổ chức." />
      </Panel>}
      <Panel title="Tiến trình xử lý" description="Tiến trình tạo trong khoảng thời gian đã chọn, gồm xử lý IFC và build gói. Hoàn tất xử lý không đồng nghĩa mô hình đã đạt QA.">
        {kinds.length ? <div className="ops-stack">{kinds.map((kind) => <div key={kind}>
          <h3 style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: "var(--muted)" }}>{kind}</h3>
          <CountRows label={`Tiến trình ${kind} theo trạng thái`} empty="" rows={data.processingJobs.filter((item) => item.kind === kind).map((item) => ({ key: `${kind}-${item.status}`, label: jobStatusLabel[item.status] ?? item.status, count: item.count, tone: jobTone(item.status) }))} />
        </div>)}</div> : <p className={styles.muted}>Không có tiến trình nào trong khoảng thời gian này.</p>}
      </Panel>
      <Panel title="Ticket hỗ trợ" description={platform ? "Ticket được tạo trong khoảng thời gian đã chọn." : scope === "admin-organization" ? "Ticket gắn với tổ chức này, tạo trong khoảng thời gian đã chọn." : "Ticket do bạn tạo trong khoảng thời gian đã chọn."} actions={platform || scope === "admin-organization" ? <Button asChild size="sm" variant="quiet"><Link href={scope === "admin-organization" && organizationId ? `${routes.adminSupport}?organizationId=${organizationId}` : routes.adminSupport}><LifeBuoy size={16} aria-hidden="true" />Mở hộp thư</Link></Button> : <Button asChild size="sm" variant="quiet"><Link href={routes.workspaceSupport}><LifeBuoy size={16} aria-hidden="true" />Mở hỗ trợ</Link></Button>}>
        <CountRows rows={data.tickets.map((item) => ({ key: item.status, label: ticketStatusLabel(item.status), count: item.count, tone: ticketStatusTone(item.status) }))} label="Ticket theo trạng thái" empty="Không có ticket nào trong khoảng thời gian này." />
      </Panel>
    </div>
  </>;
}
