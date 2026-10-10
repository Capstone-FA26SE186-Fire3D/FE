"use client";

import { Building2, LifeBuoy, RefreshCw, Users } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ApiError } from "@/api";
import { useAsyncData } from "@/api/use-async-data";
import { useUrlParams } from "@/api/use-url-params";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { Panel, Stat } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge, type Tone } from "@/components/ui/status-badge";
import { routes } from "@/configs/routes";
import { useAuthSession } from "@/features/auth/auth-session";
import { ticketStatusLabel, ticketStatusTone } from "@/features/support/labels";
import { addDays, buildRange, formatDateTime, todayUtc } from "@/utils/date-range";
import { operationsAnalyticsApi, type OperationsAnalytics } from "../api";
import styles from "./overview.module.css";

const PRESETS = [7, 30, 90] as const;
const BE_ISSUE = "https://github.com/Capstone-FA26SE186-Fire3D/BE/issues/58";
const roleNames: Record<string, string> = { PlatformAdmin: "Platform admin", OrganizationUser: "Thành viên tổ chức", Trainee: "Học viên" };

const jobStatusLabel: Record<string, string> = { Queued: "Đang chờ", Running: "Đang chạy", Processing: "Đang xử lý", Succeeded: "Hoàn tất", Failed: "Thất bại", Cancelled: "Đã hủy", Canceled: "Đã hủy" };
function jobTone(status: string): Tone {
  if (/fail|error|dead/i.test(status)) return "danger";
  if (/succe|complete|done/i.test(status)) return "success";
  if (/run|process|claim/i.test(status)) return "info";
  return "neutral";
}

function RangeBar({ urlFrom, urlTo, onApply }: { urlFrom: string; urlTo: string; onApply: (from: string, to: string) => void }) {
  const [from, setFrom] = useState(urlFrom);
  const [to, setTo] = useState(urlTo);
  const [error, setError] = useState<{ field: "from" | "to" | "range"; message: string } | null>(null);
  const today = todayUtc();
  const activePreset = PRESETS.find((days) => urlTo === today && urlFrom === addDays(today, -(days - 1)));

  const apply = (event: FormEvent) => {
    event.preventDefault();
    const result = buildRange(from, to);
    if (!result.ok) { setError(result); return; }
    setError(null);
    onApply(from, to);
  };

  const pick = (days: number) => {
    const end = todayUtc();
    const start = addDays(end, -(days - 1));
    setFrom(start); setTo(end); setError(null);
    onApply(start, end);
  };

  return <form className={`ops-panel ${styles.range}`} onSubmit={apply} noValidate aria-label="Khoảng thời gian">
    <div className={styles.presets} role="group" aria-label="Khoảng nhanh">
      {PRESETS.map((days) => <button key={days} type="button" aria-pressed={activePreset === days} onClick={() => pick(days)}>{days} ngày</button>)}
    </div>
    <div className={styles.dates}>
      <Field label="Từ ngày" error={error?.field === "from" || error?.field === "range" ? error.message : undefined}>{(p) => <Input {...p} type="date" value={from} onChange={(event) => setFrom(event.target.value)} />}</Field>
      <Field label="Đến ngày" error={error?.field === "to" ? error.message : undefined}>{(p) => <Input {...p} type="date" value={to} onChange={(event) => setTo(event.target.value)} />}</Field>
    </div>
    <Button type="submit" variant="secondary">Áp dụng</Button>
  </form>;
}

function CountRows({ rows, label, empty }: { rows: Array<{ key: string; label: string; count: number; tone: Tone }>; label: string; empty: string }) {
  const max = Math.max(1, ...rows.map((row) => row.count));
  if (!rows.length) return <p style={{ margin: 0, color: "var(--muted)", fontSize: 14 }}>{empty}</p>;
  return <ul className={styles.rows} aria-label={label}>
    {rows.map((row) => <li key={row.key} className={styles.row}>
      <span><StatusBadge tone={row.tone}>{row.label}</StatusBadge></span>
      <strong>{row.count.toLocaleString("vi-VN")}</strong>
      <span className={styles.bar} data-tone={row.tone === "neutral" ? undefined : row.tone} aria-hidden="true"><span style={{ width: `${(row.count / max) * 100}%` }} /></span>
    </li>)}
  </ul>;
}

const sum = (items: Array<{ count: number }>) => items.reduce((total, item) => total + item.count, 0);

function Dashboard({ data }: { data: OperationsAnalytics }) {
  const accountsActive = sum(data.accounts.filter((item) => item.isActive));
  const accountsTotal = sum(data.accounts);
  const buildingsActive = sum(data.buildings.filter((item) => item.isActive));
  const buildingsTotal = sum(data.buildings);
  const jobsFailed = sum(data.ifcJobs.filter((item) => jobTone(item.status) === "danger"));
  const ticketsOpen = sum(data.tickets.filter((item) => item.status === "Open" || item.status === "InProgress"));
  const fmt = (value: number) => value.toLocaleString("vi-VN");

  const roles = Array.from(new Set(data.accounts.map((item) => item.role)));
  const accountRows = roles.flatMap((role) => [true, false].flatMap((isActive) => {
    const count = sum(data.accounts.filter((item) => item.role === role && item.isActive === isActive));
    return count || isActive ? [{ key: `${role}-${isActive}`, label: `${roleNames[role] ?? role} · ${isActive ? "hoạt động" : "vô hiệu"}`, count, tone: (isActive ? "success" : "neutral") as Tone }] : [];
  }));
  const buildingRows = [
    { key: "active", label: "Đang hoạt động", count: buildingsActive, tone: "success" as Tone },
    { key: "inactive", label: "Đã lưu trữ", count: buildingsTotal - buildingsActive, tone: "neutral" as Tone },
  ].filter((row) => buildingsTotal > 0 && (row.count > 0 || row.key === "active"));

  return <>
    <div className="ops-grid ops-grid-4" style={{ marginBottom: 16 }}>
      <Stat label="Tài khoản (hiện tại)" value={fmt(accountsTotal)} hint={`${fmt(accountsActive)} hoạt động · ${fmt(accountsTotal - accountsActive)} vô hiệu`} />
      <Stat label="Công trình (hiện tại)" value={fmt(buildingsTotal)} hint={buildingsTotal ? `${fmt(buildingsActive)} hoạt động · ${fmt(buildingsTotal - buildingsActive)} lưu trữ` : "Chưa có công trình"} />
      <Stat label="Tiến trình IFC (trong kỳ)" value={fmt(sum(data.ifcJobs))} hint={`${fmt(jobsFailed)} thất bại`} />
      <Stat label="Ticket hỗ trợ (trong kỳ)" value={fmt(sum(data.tickets))} hint={`${fmt(ticketsOpen)} chưa xử lý xong`} />
    </div>

    <div className="ops-grid ops-grid-2">
      <Panel title="Tài khoản theo vai trò" description="Ảnh chụp tại thời điểm cập nhật, không phụ thuộc khoảng thời gian." actions={<Button asChild size="sm" variant="quiet"><Link href={routes.adminAccounts}><Users size={16} aria-hidden="true" />Quản lý</Link></Button>}>
        <CountRows rows={accountRows} label="Tài khoản theo vai trò" empty="Chưa có tài khoản." />
      </Panel>
      <Panel title="Công trình" description="Ảnh chụp hiện tại; công trình đã xóa không được tính." actions={<Button asChild size="sm" variant="quiet"><Link href={routes.adminOrganizations}><Building2 size={16} aria-hidden="true" />Theo tổ chức</Link></Button>}>
        <CountRows rows={buildingRows} label="Công trình theo trạng thái" empty="Chưa có công trình." />
      </Panel>
      <Panel title="Tiến trình xử lý IFC" description="Tiến trình được tạo trong khoảng thời gian đã chọn. Hoàn tất xử lý không đồng nghĩa mô hình đã đạt QA.">
        <CountRows rows={data.ifcJobs.map((item) => ({ key: item.status, label: jobStatusLabel[item.status] ?? item.status, count: item.count, tone: jobTone(item.status) }))} label="Tiến trình IFC theo trạng thái" empty="Không có tiến trình IFC nào trong khoảng thời gian này." />
      </Panel>
      <Panel title="Ticket hỗ trợ" description="Ticket được tạo trong khoảng thời gian đã chọn." actions={<Button asChild size="sm" variant="quiet"><Link href={routes.adminSupport}><LifeBuoy size={16} aria-hidden="true" />Mở hộp thư</Link></Button>}>
        <CountRows rows={data.tickets.map((item) => ({ key: item.status, label: ticketStatusLabel(item.status), count: item.count, tone: ticketStatusTone(item.status) }))} label="Ticket theo trạng thái" empty="Không có ticket nào trong khoảng thời gian này." />
      </Panel>
    </div>

    <h2 style={{ margin: "28px 0 12px", fontSize: 16, fontWeight: 600 }}>Chưa có dữ liệu từ backend</h2>
    <div className="ops-grid ops-grid-3">
      {[
        { title: "Lượt chơi & hoàn thành", body: "Số phiên huấn luyện, tỷ lệ hoàn thành và kết quả học viên cần API analytics của học viên." },
        { title: "Doanh thu", body: "Doanh thu và thanh toán chưa có API tổng hợp cho toàn hệ thống; số liệu thanh toán được xem theo từng tổ chức." },
        { title: "Sử dụng AI", body: "Quota AI đã dùng và còn lại chưa có API tổng hợp." },
      ].map((card) => <div key={card.title} className={styles.pending}>
        <div className={styles.pendingHead}><h3>{card.title}</h3><StatusBadge tone="warning">Chờ BE</StatusBadge></div>
        <p>{card.body}</p>
        <a href={BE_ISSUE} target="_blank" rel="noreferrer">BE#58</a>
      </div>)}
    </div>
  </>;
}

export function AdminOverview() {
  const { accessToken, ready, user } = useAuthSession();
  const { get, setParams } = useUrlParams();
  const urlFrom = get("from");
  const urlTo = get("to");
  const hasRange = Boolean(urlFrom || urlTo);
  const range = hasRange ? buildRange(urlFrom, urlTo) : null;
  const rangeError = range && !range.ok ? range.message : null;
  const enabled = ready && user?.role === 0 && Boolean(accessToken) && !rangeError;

  const analytics = useAsyncData(
    `analytics:${urlFrom}:${urlTo}`,
    (signal) => operationsAnalyticsApi.get(accessToken as string, range?.ok ? { from: range.from, to: range.to } : {}, signal),
    enabled,
  );

  if (!ready) return <p role="status">Đang kiểm tra phiên đăng nhập…</p>;
  if (user?.role !== 0) return <Alert tone="danger" title="Không có quyền truy cập">Chỉ PlatformAdmin có thể xem tổng quan vận hành.</Alert>;

  const data = analytics.data;
  const failure = analytics.error;
  const failureMessage = failure instanceof ApiError
    ? failure.status === 403 ? "Phiên hiện tại không còn quyền PlatformAdmin." : failure.status === 400 ? "Khoảng thời gian không hợp lệ (tối đa 90 ngày)." : "Không tải được số liệu vận hành."
    : "Không tải được số liệu vận hành. Hãy kiểm tra kết nối rồi thử lại.";

  return <>
    <PageHeader
      title="Tổng quan vận hành"
      description="Tài khoản, công trình, tiến trình IFC và ticket hỗ trợ lấy trực tiếp từ Fire3D API."
      breadcrumbs={[{ label: "Quản trị" }, { label: "Tổng quan" }]}
      actions={<Button variant="quiet" onClick={analytics.reload} disabled={analytics.loading || Boolean(rangeError)}><RefreshCw size={16} aria-hidden="true" />{analytics.loading ? "Đang tải…" : "Tải lại"}</Button>}
    />

    <RangeBar key={`${urlFrom}|${urlTo}`} urlFrom={urlFrom} urlTo={urlTo} onApply={(from, to) => setParams({ from, to })} />

    <p className={styles.meta} aria-live="polite">
      {data ? <>
        <span>Khoảng thời gian: <strong>{formatDateTime(data.from)}</strong> – <strong>{formatDateTime(data.to)}</strong>{hasRange ? "" : " (mặc định 30 ngày gần nhất)"}</span>
        <span>Cập nhật lúc <strong>{formatDateTime(data.asOf)}</strong></span>
        <span>Ngày chọn tính theo UTC</span>
      </> : <span>Khoảng thời gian: {hasRange ? `${urlFrom} – ${urlTo}` : "30 ngày gần nhất (mặc định)"}</span>}
    </p>

    {rangeError && <Alert tone="danger" title="Khoảng thời gian trong đường dẫn không hợp lệ">{rangeError} Chọn lại khoảng thời gian ở trên.</Alert>}
    {failure !== undefined && !rangeError && <Alert tone="danger" title="Không tải được tổng quan" action={<Button size="sm" variant="secondary" className="mt-3" onClick={analytics.reload}>Thử lại</Button>}>{failureMessage}</Alert>}

    {!data && analytics.loading && !rangeError && <div role="status" aria-live="polite" className="ops-grid ops-grid-4">
      <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Đang tải số liệu vận hành…</span>
      {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} style={{ height: 92 }} />)}
    </div>}

    {data && <div style={{ opacity: analytics.loading ? 0.6 : 1, transition: "opacity 150ms" }} aria-busy={analytics.loading}><Dashboard data={data} /></div>}
  </>;
}
