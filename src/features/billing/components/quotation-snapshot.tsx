"use client";

import { Alert } from "@/components/ui/alert";
import { StatusBadge, type Tone } from "@/components/ui/status-badge";
import { Table } from "@/components/ui/table";
import { formatDate, formatDateTime, formatNumber, formatQuota, formatVnd, isPast } from "../format";
import type { Quotation, QuotationLine, QuotationStatus } from "../types";
import "../billing.css";

export const quotationStatus: Record<string, { label: string; tone: Tone }> = {
  Draft: { label: "Bản nháp · chờ phát hành", tone: "info" },
  Issued: { label: "Đã phát hành · chờ chấp nhận", tone: "ember" },
  Accepted: { label: "Đã chấp nhận", tone: "success" },
  Expired: { label: "Hết hạn", tone: "neutral" },
  Cancelled: { label: "Đã hủy", tone: "neutral" },
};

export function QuotationStatusBadge({ status }: { status: QuotationStatus }) {
  const item = quotationStatus[status] ?? { label: "Không rõ", tone: "neutral" as Tone };
  return <StatusBadge tone={item.tone}>{item.label}</StatusBadge>;
}

export const actionLabel: Record<string, string> = { New: "Mua mới", Renewal: "Gia hạn kỳ mới", Upgrade: "Nâng cấp" };

function period(line: QuotationLine) {
  if (!line.startsAt || !line.endsAt) return null;
  return `${formatDate(line.startsAt)} – ${formatDate(line.endsAt)}`;
}

/** Capacity and quota exactly as snapshotted on the line; nothing here is derived from the package list. */
function Capacity({ line }: { line: QuotationLine }) {
  const upgrade = line.purchaseAction === "Upgrade";
  const hasQuota = typeof line.aiQuotaUnits === "number" && line.aiQuotaUnits > 0;
  if (line.learnerLimit == null && !hasQuota) return <span className="bill-dim">Chưa chốt</span>;
  return <span className="ops-cell-primary">
    {line.learnerLimit != null && <span>{upgrade && line.upgradePreviousLearnerLimit != null ? `${formatNumber(line.upgradePreviousLearnerLimit)} → ${formatNumber(line.learnerLimit)}` : formatNumber(line.learnerLimit)} học viên/kỳ</span>}
    {hasQuota && <span className="ops-cell-sub">Hạn mức AI {formatQuota(line.aiQuotaUnits, line.aiQuotaUnit)}</span>}
  </span>;
}

/**
 * Renders the quotation exactly as the backend returned it. Amounts are the server snapshot (whole VND);
 * the UI never recomputes subtotal, discount, tax, total, periods, learner limits or quota.
 */
export function QuotationSnapshot({ quotation, organizationName }: { quotation: Quotation; organizationName?: string }) {
  const expired = quotation.status === "Issued" && isPast(quotation.validUntil);
  const isTopUp = quotation.purpose === "AIQuotaTopUp";
  const topUp = quotation.topUp ?? null;
  const upgrade = quotation.items.some((line) => line.purchaseAction === "Upgrade");
  const estimate = quotation.pricingStatus === "Estimated" || (quotation.status === "Draft" && quotation.taxAmount === null);
  const legacyTax = quotation.pricingStatus === "LegacyUnknown";
  return <div className="ops-stack" data-testid="quotation-snapshot">
    <div className="bill-row">
      <div style={{ minWidth: 0 }}>
        <p className="bill-dim" style={{ margin: 0 }}>Số báo giá</p>
        <strong className="bill-wrap" style={{ fontSize: 15 }}>{quotation.quotationNumber}</strong>
        {organizationName && <p className="bill-muted bill-wrap">{organizationName}</p>}
      </div>
      <div className="ops-actions">
        <StatusBadge tone={isTopUp ? "ember" : "neutral"}>{isTopUp ? "Nạp thêm hạn mức AI" : upgrade ? "Nâng cấp gói" : "Dịch vụ công trình"}</StatusBadge>
        <QuotationStatusBadge status={quotation.status} />{expired && <StatusBadge tone="danger">Đã quá hạn</StatusBadge>}
      </div>
    </div>

    {isTopUp ? <dl className="bill-totals" aria-label="Chi tiết nạp thêm hạn mức AI" data-testid="topup-snapshot">
      <div><dt>Số lượng yêu cầu</dt><dd>{topUp?.requestedQuotaUnits != null ? formatNumber(topUp.requestedQuotaUnits) : "Không nêu"}</dd></div>
      <div><dt>Số lượng được cấp</dt><dd>{topUp?.quotaUnits != null ? formatQuota(topUp.quotaUnits, topUp.quotaUnit) : "Chờ quản trị FET3D chốt khi phát hành"}</dd></div>
      <div><dt>Hiệu lực hạn mức</dt><dd>{topUp?.startsAt && topUp.endsAt ? `${formatDateTime(topUp.startsAt)} – ${formatDateTime(topUp.endsAt)}` : "Chờ phát hành"}</dd></div>
      <div><dt>Chính sách</dt><dd className="bill-wrap">{topUp?.policyVersionId ? `Phiên bản ${topUp.policyVersionId.slice(0, 8)}` : "Chờ phát hành"}</dd></div>
    </dl> : <Table className="bill-table" caption={`Các dòng của báo giá ${quotation.quotationNumber}`}>
      <thead><tr><th>Công trình</th><th>Gói / kỳ</th><th>Học viên · hạn mức AI</th><th className="bill-money">{upgrade ? "Phí" : "Đơn giá/tháng"}</th><th className="bill-money">Tạm tính</th><th className="bill-money">Giảm giá</th><th className="bill-money">Thành tiền</th></tr></thead>
      <tbody>
        {quotation.items.map((line) => <tr key={line.id} data-testid="quotation-line" data-action={line.purchaseAction}>
          <td><span className="ops-cell-primary">{line.buildingName || "—"}<span className="ops-cell-sub">{line.buildingAddress || "Chưa có địa chỉ"}</span></span></td>
          <td>{line.packageName}<span className="ops-cell-sub">{line.durationMonths} tháng · {actionLabel[line.purchaseAction] ?? "Khác"}</span>{period(line) && <span className="ops-cell-sub">Kỳ {period(line)}</span>}{line.purchaseAction === "Upgrade" && <span className="ops-cell-sub">Giữ kỳ hiện tại và các suất đã dùng</span>}</td>
          <td><Capacity line={line} /></td>
          <td className="bill-money">{line.pricingBasis === "OneTime" ? <span>Một lần</span> : formatVnd(line.unitPrice)}</td>
          <td className="bill-money">{formatVnd(line.subtotalAmount)}</td>
          <td className="bill-money">{line.discountAmount ? `− ${formatVnd(line.discountAmount)}` : formatVnd(0)}</td>
          <td className="bill-money"><strong>{formatVnd(line.totalAmount)}</strong></td>
        </tr>)}
      </tbody>
    </Table>}

    <dl className="bill-totals" aria-label="Tổng tiền theo báo giá">
      {!isTopUp && <div><dt>Tạm tính</dt><dd>{formatVnd(quotation.subtotalAmount)}</dd></div>}
      {!isTopUp && <div><dt>Giảm giá{quotation.discountRuleId ? " (quy tắc được áp dụng)" : ""}</dt><dd>{quotation.discountAmount ? `− ${formatVnd(quotation.discountAmount)}` : formatVnd(0)}</dd></div>}
      <div><dt>Thuế</dt><dd data-testid="quotation-tax">{quotation.taxAmount === null ? (legacyTax ? "Không rõ (báo giá cũ)" : "Chưa xác định") : formatVnd(quotation.taxAmount)}</dd></div>
      <div className="bill-grand"><dt>{estimate ? "Tổng ước tính (chưa thuế)" : "Tổng thanh toán"}</dt><dd data-testid="quotation-total">{formatVnd(quotation.totalAmount)}</dd></div>
    </dl>

    {quotation.status === "Draft" && <Alert tone="info" title="Giá tạm tính">
      {isTopUp ? "Quản trị FET3D sẽ chốt số lượng hạn mức, giá, khoảng hiệu lực, thuế và điều khoản khi phát hành. Số tiền cuối cùng là số trên báo giá đã phát hành."
        : upgrade ? "Phí nâng cấp là một lần và do quản trị FET3D ấn định khi phát hành (không tính theo tháng). Số tiền, mức học viên mới và hiệu lực chỉ có giá trị sau khi phát hành."
          : "Quản trị FET3D sẽ chốt kỳ dịch vụ, thuế và điều khoản khi phát hành báo giá. Số tiền cuối cùng là số trên báo giá đã phát hành."}
    </Alert>}
    {legacyTax && <Alert tone="warning" title="Báo giá cũ">Thuế của báo giá này không có bằng chứng đã được duyệt nên không hiển thị như 0. Tạo báo giá mới nếu cần mua.</Alert>}

    <div className="bill-stats">
      <div className="ops-stat"><span>Hiệu lực đến</span><strong style={{ color: expired ? "var(--danger)" : undefined }}>{formatDateTime(quotation.validUntil)}</strong>{expired && <small>Báo giá đã quá hạn, không thể chấp nhận</small>}</div>
      {quotation.issuedAt && <div className="ops-stat"><span>Phát hành lúc</span><strong>{formatDateTime(quotation.issuedAt)}</strong></div>}
      {quotation.acceptedAt && <div className="ops-stat"><span>Chấp nhận lúc</span><strong>{formatDateTime(quotation.acceptedAt)}</strong></div>}
    </div>

    {quotation.terms && <div><p className="ops-field-label" style={{ margin: "0 0 6px" }}>Điều khoản</p><pre className="bill-terms">{quotation.terms}</pre></div>}
  </div>;
}
