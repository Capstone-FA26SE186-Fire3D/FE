"use client";

import { Check, CircleAlert, Clock, Loader2, RefreshCw, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { usePolling } from "@/api/use-polling";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge, type Tone } from "@/components/ui/status-badge";
import { billingApi } from "../api";
import { billingCodeMessage, billingErrorText } from "../errors";
import { formatDateTime, formatVnd } from "../format";
import type { PayosPayment, ProvisioningLine } from "../types";
import "../billing.css";

type StepState = "done" | "active" | "warn" | "fail" | "todo";

export type PaymentSummary = { tone: "success" | "info" | "warning" | "danger"; title: string; detail: string; final: boolean };

const lineLabel: Record<string, { label: string; tone: Tone }> = {
  NotStarted: { label: "Chưa bắt đầu", tone: "neutral" },
  Pending: { label: "Đang kích hoạt", tone: "info" },
  NeedsReconcile: { label: "Cần đối soát", tone: "warning" },
  Succeeded: { label: "Đã kích hoạt", tone: "success" },
};

/**
 * `Paid` only proves money arrived. Service is provisioned per Building: success is declared only when
 * `provisioningStatus === "Succeeded"` (BE aggregates every line).
 */
export function summarizePayment(payment: PayosPayment): PaymentSummary {
  const lines = payment.items;
  const done = lines.filter((line) => line.status === "Succeeded").length;
  switch (payment.paymentStatus) {
    case "Paid":
      if (payment.provisioningStatus === "Succeeded") return { tone: "success", title: "Đã thanh toán và kích hoạt dịch vụ", detail: "Tất cả công trình trong báo giá đã được kích hoạt.", final: true };
      if (payment.provisioningStatus === "Pending") return { tone: "info", title: "Đã nhận tiền · đang kích hoạt dịch vụ", detail: `Dịch vụ chưa có hiệu lực cho tới khi từng công trình kích hoạt xong (${done}/${lines.length}). Trang tự cập nhật.`, final: false };
      return { tone: "warning", title: "Đã nhận tiền · kích hoạt đang cần đối soát", detail: `Tiền đã được ghi nhận nhưng dịch vụ chưa kích hoạt đủ (${done}/${lines.length} công trình). Hệ thống tự thử lại; nếu kéo dài hãy liên hệ hỗ trợ kèm mã đơn ${payment.orderCode}. Bạn không cần thanh toán lại.`, final: false };
    case "Pending":
      return { tone: "info", title: "Đang chờ PayOS xác nhận thanh toán", detail: "Hoàn tất trên trang PayOS. Việc quay lại từ PayOS chỉ là điều hướng; hệ thống chỉ ghi nhận khi PayOS xác nhận.", final: false };
    case "Expired":
      return { tone: "warning", title: "Liên kết thanh toán đã hết hạn", detail: "Chưa có khoản tiền nào được ghi nhận. Tạo lại thanh toán từ báo giá còn hiệu lực.", final: true };
    case "Cancelled":
      return { tone: "warning", title: "Thanh toán đã bị hủy", detail: "Chưa có khoản tiền nào được ghi nhận.", final: true };
    case "Failed":
      return { tone: "danger", title: "Thanh toán không thành công", detail: "Chưa có khoản tiền nào được ghi nhận. Thử tạo lại thanh toán.", final: true };
    default:
      return { tone: "info", title: `Trạng thái thanh toán: ${payment.paymentStatus}`, detail: "Trang tự cập nhật khi có thay đổi.", final: false };
  }
}

function Dot({ state }: { state: StepState }) {
  const Icon = state === "done" ? Check : state === "fail" ? X : state === "warn" ? CircleAlert : state === "active" ? Loader2 : Clock;
  return <span className="bill-step-dot"><Icon size={14} aria-hidden="true" className={state === "active" ? "bill-spin" : undefined} /></span>;
}

function lineBadge(line: ProvisioningLine) {
  const item = lineLabel[line.status] ?? { label: line.status, tone: "neutral" as Tone };
  return <StatusBadge tone={item.tone}>{item.label}</StatusBadge>;
}

/** Presentational timeline: quotation accepted -> payment -> provisioning of every Building line. */
export function PaymentStatusView({ payment, buildingNames }: { payment: PayosPayment; buildingNames: Record<string, string> }) {
  const summary = summarizePayment(payment);
  const paid = payment.paymentStatus === "Paid";
  const paymentState: StepState = paid ? "done" : payment.paymentStatus === "Pending" ? "active" : payment.paymentStatus === "Failed" ? "fail" : "warn";
  const provisioningState: StepState = !paid ? "todo" : payment.provisioningStatus === "Succeeded" ? "done" : payment.provisioningStatus === "Pending" ? "active" : "warn";

  return <div className="ops-stack" data-testid="payment-status" data-payment-status={payment.paymentStatus} data-provisioning-status={payment.provisioningStatus}>
    <Alert tone={summary.tone} title={summary.title}>{summary.detail}</Alert>
    <ol className="bill-steps" aria-label="Các bước thanh toán và kích hoạt">
      <li className="bill-step" data-state="done"><Dot state="done" /><div><h4>Chấp nhận báo giá</h4><p>Số tiền theo báo giá: {formatVnd(payment.amount)}</p></div></li>
      <li className="bill-step" data-state={paymentState}><Dot state={paymentState} /><div>
        <h4>Thanh toán qua PayOS</h4>
        <p>{paid ? `Đã ghi nhận ${payment.paidAt ? `lúc ${formatDateTime(payment.paidAt)}` : ""}${payment.transactionStatus ? ` · giao dịch ${payment.transactionStatus}` : ""}` : summary.title}</p>
      </div></li>
      <li className="bill-step" data-state={provisioningState}><Dot state={provisioningState} /><div>
        <h4>Kích hoạt dịch vụ từng công trình</h4>
        <p>{!paid ? "Bắt đầu sau khi PayOS xác nhận thanh toán." : payment.provisioningStatus === "Succeeded" ? "Hoàn tất cho mọi công trình." : "Chưa hoàn tất: chưa xem là đã có dịch vụ."}</p>
        {payment.items.length > 0 && <ul aria-label="Trạng thái kích hoạt theo công trình">
          {payment.items.map((line) => <li key={line.quotationItemId} data-testid="provisioning-line" data-line-status={line.status}>
            <span>{buildingNames[line.buildingId] ?? `Công trình ${line.buildingId.slice(0, 8)}`}{line.errorCode && <small className="bill-dim" style={{ display: "block" }}>{billingCodeMessage(line.errorCode) ?? `Mã lỗi: ${line.errorCode}`}</small>}</span>
            {lineBadge(line)}
          </li>)}
        </ul>}
      </div></li>
    </ol>
  </div>;
}

/** Polls the payment (3-5s, backs off on errors, pauses in hidden tabs) until it reaches a final state. */
export function PaymentProgress({ accessToken, paymentRequestId, buildingNames, onSettled, intervalMs = 4000 }: {
  accessToken: string;
  paymentRequestId: string;
  buildingNames: Record<string, string>;
  /** Called once per payment when it reaches a final state (e.g. to reload entitlements). */
  onSettled?: (payment: PayosPayment) => void;
  intervalMs?: number;
}) {
  const poll = usePolling<PayosPayment>({
    fetcher: (signal) => billingApi.getPayment(accessToken, paymentRequestId, signal),
    isDone: (payment) => summarizePayment(payment).final,
    intervalMs,
  });
  const settled = useRef<string | null>(null);
  const { data, finished } = poll;

  useEffect(() => {
    if (finished && data && settled.current !== data.id) {
      settled.current = data.id;
      onSettled?.(data);
    }
  }, [finished, data, onSettled]);

  if (!data) {
    if (poll.error) return <Alert tone="danger" title="Không đọc được trạng thái thanh toán" action={<Button size="sm" variant="secondary" className="mt-3" onClick={poll.refresh}>Thử lại</Button>}>{billingErrorText(poll.error)}</Alert>;
    return <div role="status" aria-live="polite" className="ops-stack"><span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Đang kiểm tra trạng thái thanh toán…</span><Skeleton style={{ height: 64 }} /><Skeleton style={{ height: 120 }} /></div>;
  }

  return <div className="ops-stack">
    <PaymentStatusView payment={data} buildingNames={buildingNames} />
    {poll.error !== undefined && <Alert tone="warning" title="Tạm thời không cập nhật được">{billingErrorText(poll.error)} Đang tự thử lại.</Alert>}
    {!finished && <div className="bill-row"><span className="bill-dim" aria-live="polite">Tự cập nhật mỗi vài giây khi trang đang mở.</span><Button size="sm" variant="quiet" onClick={poll.refresh}><RefreshCw size={14} aria-hidden="true" />Kiểm tra ngay</Button></div>}
  </div>;
}
