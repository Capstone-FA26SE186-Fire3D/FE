"use client";

import { Search } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { useAsyncData } from "@/api/use-async-data";
import { useUrlParams } from "@/api/use-url-params";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { SubTabs } from "@/components/ui/sub-tabs";
import { routes } from "@/configs/routes";
import { useAuthSession } from "@/features/auth/auth-session";
import { KpiRow, KpiTile } from "@/features/admin-overview/components/admin-kit";
import { formatCount } from "@/features/admin-overview/format";
import { billingApi } from "../api";
import { DiscountsSection, PackagesSection } from "./admin-catalog";
import { EnterpriseAdminSection } from "./admin-enterprise";
import { PaymentsSection } from "./admin-payments";
import { PoliciesSection } from "./admin-policies";
import { AdminQuotaSection } from "./admin-quota";
import { QuotationsSection } from "./admin-sales";
import "../billing.css";
import "@/assets/styles/ops-v2.css";
import { LoadingBlock } from "@/components/ui/spinner";

/** Start of the 30-day window, read when a request runs (not during render). */
const since30 = () => new Date(Date.now() - 30 * 86_400_000).toISOString();
const TABS = ["payments", "packages", "policies", "discounts", "quotes", "enterprise", "quota"] as const;
type TabId = (typeof TABS)[number];
const GUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** Every URL parameter a tab owns; switching tabs clears them so a filter or an open drawer never leaks into another tab. */
const TAB_PARAMS = ["page", "kind", "status", "org", "q", "from", "to", "checkout", "payment", "quotation", "request"];

/** Header action (Figma "Tra cứu checkout"): paste a checkout id and open its detail on the payments tab. */
function LookupModal({ open, onClose, onFound }: { open: boolean; onClose: () => void; onFound: (checkoutId: string) => void }) {
  const formId = useId();
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const id = value.trim();
    if (!GUID.test(id)) { setError("Mã chưa đúng. Dán đủ mã lượt thanh toán gồm 36 ký tự."); return; }
    setError("");
    setValue("");
    onFound(id);
  };
  return <Modal open={open} onOpenChange={(next) => { if (!next) onClose(); }} size="sm" title="Tra cứu thanh toán" description="Dán mã lượt thanh toán (từ tổ chức, nhật ký thao tác hoặc bộ phận hỗ trợ); chi tiết mở trong ngăn bên phải."
    footer={<><Button type="button" variant="quiet" onClick={onClose}>Hủy</Button><Button type="submit" form={formId}><Search size={16} aria-hidden="true" />Tra cứu</Button></>}>
    <form id={formId} onSubmit={submit} noValidate>
      <Field label="Mã lượt thanh toán" error={error || undefined}>{(p) => <Input {...p} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" value={value} onChange={(event) => setValue(event.target.value)} autoComplete="off" spellCheck={false} className="font-mono" />}</Field>
    </form>
  </Modal>;
}

/**
 * PlatformAdmin "Dịch vụ và thanh toán" (Figma Admin v2 "Thương mại"): payment ledger with reconcile first, then the
 * catalog (packages, quota policies, discounts), quotations, enterprise requests and per-organization AI quota as
 * sub-tabs. Tab, filters and the open record live in the URL. Headline figures are ledger totals read with page size 1.
 */
export function CommerceAdmin() {
  const { accessToken, ready, user } = useAuthSession();
  const { get, setParams } = useUrlParams();
  const tabParam = get("tab");
  const tab: TabId = (TABS as readonly string[]).includes(tabParam) ? (tabParam as TabId) : "payments";
  const [lookup, setLookup] = useState(false);

  const enabled = ready && user?.role === 0 && Boolean(accessToken);
  const token = accessToken as string;
  const orders = useAsyncData("commerce:total:orders30", (signal) => billingApi.listLedger(token, "checkouts", { from: since30(), page: 1, pageSize: 1 }, signal), enabled);
  const paid = useAsyncData("commerce:total:paid30", (signal) => billingApi.listLedger(token, "requests", { status: "Paid", from: since30(), page: 1, pageSize: 1 }, signal), enabled);
  const stuck = useAsyncData("commerce:total:reconcile", (signal) => billingApi.listLedger(token, "checkouts", { status: "NeedsReconcile", page: 1, pageSize: 1 }, signal), enabled);
  const stuckCount = stuck.data?.totalCount ?? 0;

  if (!ready) return <LoadingBlock label="Đang kiểm tra phiên đăng nhập…" />;
  if (user?.role !== 0 || !accessToken) return <Alert tone="danger" title="Không có quyền truy cập">Chỉ quản trị FET3D có thể quản lý thương mại.</Alert>;

  const clearTabParams = () => Object.fromEntries(TAB_PARAMS.map((key) => [key, null]));
  const changeTab = (value: string) => {
    if (!(TABS as readonly string[]).includes(value) || value === tab) return;
    setParams({ ...clearTabParams(), tab: value === "payments" ? null : value });
  };

  return <>
    <PageHeader eyebrow="Thương mại" title="Dịch vụ và thanh toán" description="Gói dịch vụ, chính sách hạn mức AI, giảm giá, báo giá và thanh toán PayOS. Số tiền, kỳ và điều khoản giữ đúng như lúc phát hành báo giá." breadcrumbs={[{ label: "Quản trị", href: routes.adminOverview }, { label: "Thương mại" }]}
      actions={<Button variant="secondary" onClick={() => setLookup(true)}><Search size={16} aria-hidden="true" />Tra cứu thanh toán</Button>} />
    {stuckCount > 0 && <div className="adm-banner"><Alert tone="warning" title={`${formatCount(stuckCount)} thanh toán cần đối soát`} action={<Button size="sm" variant="secondary" className="mt-3" onClick={() => setParams({ ...clearTabParams(), tab: null, status: "NeedsReconcile" })}>Xem đơn cần đối soát</Button>}>Dịch vụ chỉ được cấp khi PayOS xác nhận đã nhận tiền. Việc người dùng quay lại từ trang PayOS không tự cấp dịch vụ.</Alert></div>}
    <KpiRow label="Tổng quan thanh toán" columns={3}>
      <KpiTile label="Đơn 30 ngày" value={formatCount(orders.data?.totalCount)} loading={orders.loading && !orders.data} hint="Lượt thanh toán tạo trong 30 ngày" />
      <KpiTile label="Đã nhận tiền 30 ngày" value={formatCount(paid.data?.totalCount)} loading={paid.loading && !paid.data} hint="Yêu cầu thanh toán đã được PayOS xác nhận" />
      <KpiTile label="Cần đối soát" value={formatCount(stuck.data?.totalCount)} loading={stuck.loading && !stuck.data} tone={stuckCount > 0 ? "warning" : undefined} hint="Lượt thanh toán đang chờ đối soát" />
    </KpiRow>
    <SubTabs label="Thương mại" value={tab} onValueChange={changeTab} items={[
      { value: "payments", label: "Thanh toán" },
      { value: "packages", label: "Gói dịch vụ" },
      { value: "policies", label: "Chính sách hạn mức" },
      { value: "discounts", label: "Giảm giá" },
      { value: "quotes", label: "Báo giá" },
      { value: "enterprise", label: "Liên hệ" },
      { value: "quota", label: "Hạn mức AI" },
    ]}>
      <div className="ops-subtabs-content">
        {tab === "payments" && <PaymentsSection accessToken={accessToken} />}
        {tab === "packages" && <PackagesSection accessToken={accessToken} />}
        {tab === "policies" && <PoliciesSection accessToken={accessToken} />}
        {tab === "discounts" && <DiscountsSection accessToken={accessToken} />}
        {tab === "quotes" && <QuotationsSection accessToken={accessToken} />}
        {tab === "enterprise" && <EnterpriseAdminSection accessToken={accessToken} />}
        {tab === "quota" && <AdminQuotaSection accessToken={accessToken} />}
      </div>
    </SubTabs>
    <LookupModal open={lookup} onClose={() => setLookup(false)} onFound={(checkoutId) => { setLookup(false); setParams({ ...clearTabParams(), tab: null, checkout: checkoutId }); }} />
  </>;
}
