import { StatusBadge, type Tone } from "@/components/ui/status-badge";
import { Table } from "@/components/ui/table";
import { formatDateTime, formatVnd } from "../format";
import type { PayosLedgerItem, QuotationPurpose } from "../types";

type Label = { label: string; tone: Tone };

/** Checkout operation (the PayOS link), not the payment: `Completed` here means the link ended paid. */
export const checkoutLabels: Record<string, Label> = {
  Creating: { label: "Đang tạo liên kết", tone: "info" },
  Ready: { label: "Liên kết sẵn sàng", tone: "info" },
  NeedsReconcile: { label: "Cần đối soát", tone: "warning" },
  Cancelled: { label: "Đã hủy", tone: "neutral" },
  Expired: { label: "Hết hạn", tone: "neutral" },
  Completed: { label: "Đã hoàn tất", tone: "success" },
  Failed: { label: "Thất bại", tone: "danger" },
};

/** Payment request: money truth, confirmed only by a verified PayOS webhook. */
export const paymentLabels: Record<string, Label> = {
  Pending: { label: "Chờ thanh toán", tone: "info" },
  Paid: { label: "Đã nhận tiền", tone: "success" },
  Expired: { label: "Hết hạn", tone: "neutral" },
  Cancelled: { label: "Đã hủy", tone: "neutral" },
  Failed: { label: "Thất bại", tone: "danger" },
};

/** Provisioning of what was bought (entitlement/seats/quota). `Paid` alone never means this succeeded. */
export const provisioningLabels: Record<string, Label> = {
  NotStarted: { label: "Chưa bắt đầu", tone: "neutral" },
  Pending: { label: "Đang kích hoạt", tone: "info" },
  Partial: { label: "Kích hoạt một phần", tone: "warning" },
  NeedsReconcile: { label: "Cần đối soát", tone: "warning" },
  Succeeded: { label: "Đã kích hoạt", tone: "success" },
};

export const purposeLabels: Record<string, string> = { BuildingService: "Dịch vụ công trình", AIQuotaTopUp: "Top-up quota AI" };
export const purposeLabel = (purpose: QuotationPurpose | string | undefined) => purposeLabels[purpose ?? "BuildingService"] ?? String(purpose);

function badge(map: Record<string, Label>, value: string | null | undefined, prefix: string, empty: string) {
  if (!value) return <StatusBadge tone="neutral">{prefix}: {empty}</StatusBadge>;
  const item = map[value] ?? { label: value, tone: "neutral" as Tone };
  return <StatusBadge tone={item.tone}>{prefix}: {item.label}</StatusBadge>;
}

/** The three states stay separate on purpose: checkout (link) / payment (money) / provisioning (service granted). */
export function PaymentStateBadges({ item, className }: { item: Pick<PayosLedgerItem, "checkoutStatus" | "paymentStatus" | "provisioningStatus">; className?: string }) {
  return <span className={className ?? "bill-states"} data-testid="payment-states">
    {badge(checkoutLabels, item.checkoutStatus, "Checkout", "—")}
    {badge(paymentLabels, item.paymentStatus, "Thanh toán", "chưa có")}
    {badge(provisioningLabels, item.provisioningStatus, "Kích hoạt", "—")}
  </span>;
}

/**
 * Reconcile is offered only when something is stuck: the checkout needs reconciliation, or money arrived
 * (`Paid`) but provisioning has not finished. It only re-queues recovery; it never marks anything Paid.
 */
export function canReconcile(item: Pick<PayosLedgerItem, "checkoutId" | "checkoutStatus" | "paymentStatus" | "provisioningStatus">) {
  if (!item.checkoutId) return false;
  if (item.checkoutStatus === "NeedsReconcile") return true;
  return item.paymentStatus === "Paid" && item.provisioningStatus !== "Succeeded";
}

/** Every checkout of the quotation as the server lists it: link (checkout), money (payment) and service (provisioning) apart. */
export function CheckoutHistory({ rows }: { rows: PayosLedgerItem[] }) {
  if (rows.length === 0) return null;
  return <div className="ops-stack" data-testid="checkout-history">
    <p className="ops-field-label" style={{ margin: 0 }}>Lịch sử thanh toán của báo giá</p>
    <Table className="bill-table" caption="Các lần thanh toán của báo giá">
      <thead><tr><th>Tạo lúc</th><th className="bill-money">Số tiền</th><th>Trạng thái</th></tr></thead>
      <tbody>{rows.map((row) => <tr key={row.checkoutId ?? row.paymentRequestId ?? row.createdAt}>
        <td>{formatDateTime(row.createdAt)}{row.paidAt && <span className="ops-cell-sub">Nhận tiền {formatDateTime(row.paidAt)}</span>}</td>
        <td className="bill-money">{formatVnd(row.amount)}</td>
        <td><PaymentStateBadges item={row} /></td>
      </tr>)}</tbody>
    </Table>
  </div>;
}

