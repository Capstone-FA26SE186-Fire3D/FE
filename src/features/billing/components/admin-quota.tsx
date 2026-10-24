"use client";

import { Gauge } from "lucide-react";
import { useAsyncData } from "@/api/use-async-data";
import { useUrlParams } from "@/api/use-url-params";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { organizationsApi } from "@/features/organizations/api";
import { billingErrorText } from "../errors";
import { AiQuotaView } from "./ai-quota-view";
import "../billing.css";

/** PlatformAdmin read of one organization's prepaid AI quota (balance, grants, usage). Read-only: top-up is bought by the organization. */
export function AdminQuotaSection({ accessToken }: { accessToken: string }) {
  const { get, setParams } = useUrlParams();
  const organizationId = get("org");
  const organizations = useAsyncData("commerce:orgs", () => organizationsApi.list(accessToken, { page: 1, pageSize: 100 }));
  const items = organizations.data?.items ?? [];

  return <div className="ops-stack">
    <p className="bill-muted">Xem quota AI trả trước dùng chung của một tổ chức: số dư theo đơn vị, các lần cấp và lượt dùng. Chỉ đọc; quota chỉ tăng khi thanh toán gói hoặc top-up được kích hoạt.</p>
    {organizations.error !== undefined && <Alert tone="danger" title="Không tải được danh sách tổ chức" action={<Button size="sm" variant="secondary" className="mt-3" onClick={organizations.reload}>Thử lại</Button>}>{billingErrorText(organizations.error)}</Alert>}
    <Field label="Tổ chức" className="bill-toolbar-pick">{(p) => <Combobox {...p} aria-label="Tổ chức" value={organizationId} onChange={(value) => setParams({ org: value })} options={items.map((item) => ({ value: item.id, label: item.name }))} placeholder="Chọn tổ chức" searchPlaceholder="Tìm tổ chức" groupLabel="Tổ chức" loading={organizations.loading && !organizations.data} clearable />}</Field>
    {!organizationId && <EmptyState icon={Gauge} title="Chọn một tổ chức" description="Số dư, lịch sử cấp và lượt dùng quota AI của tổ chức sẽ hiện ở đây." />}
    {organizationId && <AiQuotaView key={organizationId} accessToken={accessToken} organizationId={organizationId} />}
  </div>;
}
