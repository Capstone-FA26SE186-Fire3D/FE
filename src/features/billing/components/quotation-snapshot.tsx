"use client";

import { Alert } from "@/components/ui/alert";
import { StatusBadge, type Tone } from "@/components/ui/status-badge";
import { Table } from "@/components/ui/table";
import { formatDateTime, formatVnd, isPast } from "../format";
import type { Quotation, QuotationStatus } from "../types";
import "../billing.css";

export const quotationStatus: Record<string, { label: string; tone: Tone }> = {
  Draft: { label: "Bản nháp · chờ phát hành", tone: "info" },
  Issued: { label: "Đã phát hành · chờ chấp nhận", tone: "ember" },
  Accepted: { label: "Đã chấp nhận", tone: "success" },
  Expired: { label: "Hết hạn", tone: "neutral" },
  Cancelled: { label: "Đã hủy", tone: "neutral" },
};

export function QuotationStatusBadge({ status }: { status: QuotationStatus }) {
  const item = quotationStatus[status] ?? { label: status, tone: "neutral" as Tone };
  return <StatusBadge tone={item.tone}>{item.label}</StatusBadge>;
}

const actionLabel = { New: "Mua mới", Renewal: "Gia hạn" } as const;

/**
 * Renders the quotation exactly as the backend returned it. Amounts are the server snapshot (whole VND);
 * the UI never recomputes subtotal, discount, tax or total.
 */
export function QuotationSnapshot({ quotation, organizationName }: { quotation: Quotation; organizationName?: string }) {
  const expired = quotation.status === "Issued" && isPast(quotation.validUntil);
  return <div className="ops-stack" data-testid="quotation-snapshot">
    <div className="bill-row">
      <div style={{ minWidth: 0 }}>
        <p className="bill-dim" style={{ margin: 0 }}>Số báo giá</p>
        <strong className="bill-wrap" style={{ fontSize: 15 }}>{quotation.quotationNumber}</strong>
        {organizationName && <p className="bill-muted bill-wrap">{organizationName}</p>}
      </div>
      <div className="ops-actions"><QuotationStatusBadge status={quotation.status} />{expired && <StatusBadge tone="danger">Đã quá hạn</StatusBadge>}</div>
    </div>

    <Table className="bill-table" caption={`Các dòng của báo giá ${quotation.quotationNumber}`}>
      <thead><tr><th>Công trình</th><th>Gói / kỳ</th><th className="bill-money">Đơn giá/tháng</th><th className="bill-money">Tạm tính</th><th className="bill-money">Giảm giá</th><th className="bill-money">Thành tiền</th></tr></thead>
      <tbody>
        {quotation.items.map((line) => <tr key={line.id}>
          <td><span className="ops-cell-primary">{line.buildingName || "—"}<span className="ops-cell-sub">{line.buildingAddress || "Chưa có địa chỉ"}</span></span></td>
          <td>{line.packageName}<span className="ops-cell-sub">{line.durationMonths} tháng · {actionLabel[line.purchaseAction] ?? line.purchaseAction}</span></td>
          <td className="bill-money">{formatVnd(line.unitPrice)}</td>
          <td className="bill-money">{formatVnd(line.subtotalAmount)}</td>
          <td className="bill-money">{line.discountAmount ? `− ${formatVnd(line.discountAmount)}` : formatVnd(0)}</td>
          <td className="bill-money"><strong>{formatVnd(line.totalAmount)}</strong></td>
        </tr>)}
      </tbody>
    </Table>

    <dl className="bill-totals" aria-label="Tổng tiền theo báo giá">
      <div><dt>Tạm tính</dt><dd>{formatVnd(quotation.subtotalAmount)}</dd></div>
      <div><dt>Giảm giá{quotation.discountRuleId ? " (quy tắc được áp dụng)" : ""}</dt><dd>{quotation.discountAmount ? `− ${formatVnd(quotation.discountAmount)}` : formatVnd(0)}</dd></div>
      <div><dt>Thuế</dt><dd>{quotation.status === "Draft" ? "Chưa xác định" : formatVnd(quotation.taxAmount)}</dd></div>
      <div className="bill-grand"><dt>Tổng thanh toán</dt><dd data-testid="quotation-total">{formatVnd(quotation.totalAmount)}</dd></div>
    </dl>

    {quotation.status === "Draft" && <Alert tone="info" title="Giá tạm tính">PlatformAdmin sẽ chốt thuế, điều khoản và thời hạn khi phát hành báo giá. Số tiền cuối cùng là số trên báo giá đã phát hành.</Alert>}

    <div className="bill-stats">
      <div className="ops-stat"><span>Hiệu lực đến</span><strong style={{ color: expired ? "var(--danger)" : undefined }}>{formatDateTime(quotation.validUntil)}</strong>{expired && <small>Báo giá đã quá hạn, không thể chấp nhận</small>}</div>
      {quotation.acceptedAt && <div className="ops-stat"><span>Chấp nhận lúc</span><strong>{formatDateTime(quotation.acceptedAt)}</strong></div>}
    </div>

    {quotation.terms && <div><p className="ops-field-label" style={{ margin: "0 0 6px" }}>Điều khoản</p><pre className="bill-terms">{quotation.terms}</pre></div>}
  </div>;
}
