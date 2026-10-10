"use client";

import { CreditCard, ExternalLink, RefreshCw, ShieldCheck } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { useAsyncData } from "@/api/use-async-data";
import { useIdempotencyKey } from "@/api/idempotency";
import { usePolling } from "@/api/use-polling";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { billingApi } from "../api";
import { billingCodeMessage, billingErrorText, isStatus } from "../errors";
import { billingEtag, formatDateTime, formatVnd, isPast } from "../format";
import { clearPendingCheckout, readPendingCheckout, savePendingCheckout } from "../pending-payment";
import type { PayosCheckout, PayosPayment, Quotation, WithEtag } from "../types";
import { PaymentProgress } from "./payment-progress";
import "../billing.css";

const TERMINAL: string[] = ["Cancelled", "Expired", "Failed", "Completed"];

/** Only https links go to the browser; the URL is provider-supplied. */
function safeCheckoutUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

/**
 * Accept terms -> create PayOS checkout -> redirect -> poll payment truth -> per-Building provisioning.
 * Redirecting back from PayOS (return/cancel URL) is navigation only; every success shown here comes from
 * `GET /api/payments/payos/requests/{id}`.
 */
export function CheckoutPanel({ accessToken, quotation, etag, canPurchase, returnTo, resumePaymentId, onQuotationChange, onReload, onSettled }: {
  accessToken: string;
  quotation: Quotation;
  etag: string | null;
  canPurchase: boolean;
  /** App path the PayOS return page should send the user back to. */
  returnTo: string;
  /** Payment request to poll right away (set when the user is back from PayOS). */
  resumePaymentId?: string | null;
  onQuotationChange: (next: WithEtag<Quotation>) => void;
  onReload: () => void;
  onSettled?: (payment: PayosPayment) => void;
}) {
  const toast = useToast();
  const acceptLock = useRef(false);
  const createKey = useIdempotencyKey();
  const cancelKey = useIdempotencyKey();
  const startLock = useRef(false);
  const cancelLock = useRef(false);

  const [agreed, setAgreed] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState("");
  const [starting, setStarting] = useState(false);
  const [payError, setPayError] = useState("");
  const [created, setCreated] = useState<PayosCheckout | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState("");
  const [redirecting, setRedirecting] = useState(false);

  const isAccepted = quotation.status === "Accepted";
  const pending = useMemo(() => {
    const value = typeof window === "undefined" ? null : readPendingCheckout();
    return value && value.quotationId === quotation.id ? value : null;
  }, [quotation.id]);

  // Returning from PayOS (or reopening the page): find the checkout we left for.
  const restored = useAsyncData(
    `checkout:${quotation.id}:${pending?.checkoutId ?? ""}`,
    (signal) => billingApi.getCheckout(accessToken, pending!.checkoutId, signal),
    isAccepted && Boolean(pending) && !created,
  );
  const base = created ?? restored.data ?? null;

  // 202: the link is still being created; poll the checkout until it has a URL or ends.
  const waitingForLink = Boolean(base) && base!.checkoutStatus === "Creating" && !base!.checkoutUrl;
  const linkPoll = usePolling<PayosCheckout>({
    fetcher: (signal) => billingApi.getCheckout(accessToken, base!.checkoutId, signal),
    isDone: (value) => Boolean(value.checkoutUrl) || TERMINAL.includes(value.checkoutStatus) || value.checkoutStatus === "NeedsReconcile",
    enabled: waitingForLink,
    intervalMs: 3000,
  });
  const live = base && linkPoll.data && linkPoll.data.checkoutId === base.checkoutId ? linkPoll.data : base;
  const paymentRequestId = live?.paymentRequestId ?? resumePaymentId ?? (pending?.paymentRequestId ?? null);
  const buildingNames = useMemo(() => Object.fromEntries(quotation.items.map((line) => [line.buildingId, line.buildingName])), [quotation.items]);
  const checkoutUrl = safeCheckoutUrl(live?.checkoutUrl ?? null);

  const accept = async () => {
    if (acceptLock.current || !agreed) return;
    acceptLock.current = true;
    setAccepting(true);
    setAcceptError("");
    try {
      const next = await billingApi.acceptQuotation(accessToken, quotation.id, etag ?? billingEtag(quotation.id, quotation.revision));
      onQuotationChange(next);
      toast.notify({ tone: "success", title: "Đã chấp nhận báo giá", description: "Chưa tính phí. Bước tiếp theo là thanh toán qua PayOS." });
    } catch (cause) {
      if (isStatus(cause, 409)) setAcceptError("Báo giá đã hết hạn hoặc không còn ở trạng thái chờ chấp nhận, nên không thể chấp nhận. Đã tải lại trạng thái mới nhất; hãy yêu cầu báo giá mới nếu cần.");
      else setAcceptError(billingErrorText(cause));
      if (isStatus(cause, 409) || isStatus(cause, 412)) onReload();
    } finally {
      acceptLock.current = false;
      setAccepting(false);
    }
  };

  const goToPayos = useCallback((url: string, checkout: PayosCheckout) => {
    savePendingCheckout({ checkoutId: checkout.checkoutId, paymentRequestId: checkout.paymentRequestId, quotationId: checkout.quotationId, returnTo });
    setRedirecting(true);
    window.location.assign(url);
  }, [returnTo]);

  const startCheckout = async () => {
    if (startLock.current) return;
    startLock.current = true;
    setStarting(true);
    setPayError("");
    try {
      // One key per intent: a retry of the same quotation replays the same checkout instead of creating a second one.
      const key = createKey.keyFor({ quotationId: quotation.id });
      const { checkout } = await billingApi.createCheckout(accessToken, quotation.id, key);
      createKey.done();
      setCreated(checkout);
      savePendingCheckout({ checkoutId: checkout.checkoutId, paymentRequestId: checkout.paymentRequestId, quotationId: checkout.quotationId, returnTo });
      const url = safeCheckoutUrl(checkout.checkoutUrl);
      if (url && checkout.checkoutStatus === "Ready") goToPayos(url, checkout);
    } catch (cause) {
      setPayError(billingErrorText(cause, "Không tạo được liên kết thanh toán. Bạn có thể bấm thử lại; yêu cầu được giữ nguyên nên sẽ không bị tính hai lần."));
    } finally {
      startLock.current = false;
      setStarting(false);
    }
  };

  const cancelPayment = async () => {
    if (cancelLock.current || !paymentRequestId) return;
    cancelLock.current = true;
    setCancelling(true);
    setCancelError("");
    try {
      const { checkout } = await billingApi.cancelPayment(accessToken, paymentRequestId, cancelKey.keyFor({ paymentRequestId }));
      cancelKey.done();
      setCreated(checkout);
      setConfirmCancel(false);
      if (checkout.checkoutStatus === "Completed") toast.notify({ tone: "warning", title: "Thanh toán đã hoàn tất trước khi hủy", description: "PayOS đã xác nhận tiền; hệ thống sẽ kích hoạt dịch vụ." });
      else if (checkout.checkoutStatus === "Cancelled" || checkout.checkoutStatus === "Expired") { clearPendingCheckout(); toast.notify({ tone: "success", title: "Đã hủy thanh toán", description: "Chưa có khoản tiền nào bị ghi nhận." }); }
      else toast.notify({ tone: "info", title: "Đã gửi yêu cầu hủy", description: "PayOS chưa xác nhận hủy. Trạng thái sẽ cập nhật khi có kết quả." });
    } catch (cause) {
      setCancelError(billingErrorText(cause));
    } finally {
      cancelLock.current = false;
      setCancelling(false);
    }
  };

  if (quotation.status === "Draft") {
    return <Alert tone="info" title="Đang chờ PlatformAdmin phát hành">Bạn chưa thể chấp nhận hoặc thanh toán. Khi báo giá được phát hành, trạng thái ở đây đổi thành “Đã phát hành” và có nút chấp nhận.<Button size="sm" variant="secondary" className="mt-3" onClick={onReload}><RefreshCw size={14} aria-hidden="true" />Tải lại trạng thái</Button></Alert>;
  }

  if (quotation.status === "Issued") {
    const expired = isPast(quotation.validUntil);
    if (!canPurchase) return <Alert tone="info" title="Chờ tổ chức chấp nhận">Chỉ tài khoản tổ chức đã tạo báo giá mới chấp nhận và thanh toán được.</Alert>;
    return <div className="ops-stack">
      {expired
        ? <Alert tone="warning" title="Báo giá đã hết hạn">Hạn chấp nhận là {formatDateTime(quotation.validUntil)}. Hãy yêu cầu báo giá mới; báo giá này không thể chấp nhận hay thanh toán.</Alert>
        : <label className="bill-check"><input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} />
          <span>Tôi đã đọc điều khoản và đồng ý với tổng thanh toán {formatVnd(quotation.totalAmount)}. Chấp nhận báo giá chưa phát sinh phí.</span></label>}
      {acceptError && <Alert tone="danger" title="Không chấp nhận được báo giá">{acceptError}</Alert>}
      <div className="ops-actions"><Button onClick={() => void accept()} disabled={expired || !agreed || accepting}><ShieldCheck size={16} aria-hidden="true" />{accepting ? "Đang chấp nhận…" : "Chấp nhận báo giá"}</Button></div>
    </div>;
  }

  if (!isAccepted) return <Alert tone="info" title="Báo giá không còn hiệu lực">Trạng thái {quotation.status}. Hãy tạo báo giá mới nếu vẫn cần mua dịch vụ.</Alert>;

  const status = live?.checkoutStatus;
  const notPayable = isPast(quotation.validUntil) && !paymentRequestId;

  return <div className="ops-stack">
    {!live && !paymentRequestId && <>
      {!canPurchase
        ? <Alert tone="info" title="Chỉ tài khoản tổ chức thanh toán">PlatformAdmin có thể xem trạng thái nhưng không tạo thanh toán thay tổ chức.</Alert>
        : notPayable
          ? <Alert tone="warning" title="Báo giá đã hết hạn">Không thể tạo thanh toán mới từ báo giá quá hạn. Hãy yêu cầu báo giá mới.</Alert>
          : <Alert tone="success" title="Đã chấp nhận · sẵn sàng thanh toán">Số tiền do máy chủ xác định theo báo giá: <strong>{formatVnd(quotation.totalAmount)}</strong>. Bạn sẽ được chuyển sang trang PayOS; sau khi thanh toán, quay lại đây để xem tiến trình kích hoạt.</Alert>}
      {payError && <Alert tone="danger" title="Chưa tạo được thanh toán">{payError}</Alert>}
      {canPurchase && !notPayable && <div className="ops-actions"><Button onClick={() => void startCheckout()} disabled={starting || redirecting}><CreditCard size={16} aria-hidden="true" />{starting ? "Đang tạo liên kết…" : payError ? "Thử lại thanh toán" : "Thanh toán qua PayOS"}</Button></div>}
    </>}

    {restored.error !== undefined && !live && <Alert tone="warning" title="Chưa đọc được thanh toán đang dở" action={<Button size="sm" variant="secondary" className="mt-3" onClick={restored.reload}>Thử lại</Button>}>{billingErrorText(restored.error)}</Alert>}

    {live && status === "Creating" && !live.checkoutUrl && <Alert tone="info" title="Đang tạo liên kết thanh toán">PayOS chưa trả liên kết. Trang tự kiểm tra lại; bạn không cần bấm lại.</Alert>}
    {live && status === "NeedsReconcile" && <Alert tone="warning" title="Liên kết thanh toán cần xử lý lại" action={canPurchase ? <Button size="sm" variant="secondary" className="mt-3" onClick={() => void startCheckout()} disabled={starting}>{starting ? "Đang thử lại…" : "Thử lại"}</Button> : undefined}>{billingCodeMessage(live.errorCode) ?? "Hệ thống đang đối soát với PayOS và sẽ tự thử lại."}</Alert>}
    {live && ["Cancelled", "Expired", "Failed"].includes(status ?? "") && <Alert tone="warning" title={status === "Cancelled" ? "Liên kết thanh toán đã hủy" : status === "Expired" ? "Liên kết thanh toán đã hết hạn" : "Tạo liên kết thanh toán thất bại"} action={canPurchase && !notPayable ? <Button size="sm" variant="secondary" className="mt-3" onClick={() => { setCreated(null); createKey.done(); void startCheckout(); }} disabled={starting}>{starting ? "Đang tạo…" : "Tạo lại thanh toán"}</Button> : undefined}>{billingCodeMessage(live.errorCode) ?? "Chưa có khoản tiền nào được ghi nhận từ liên kết này."}</Alert>}
    {live && status === "Ready" && checkoutUrl && <div className="ops-stack">
      <Alert tone="info" title="Liên kết thanh toán đã sẵn sàng">Liên kết hết hạn lúc {formatDateTime(live.expiresAt)}. Quay lại từ PayOS chỉ là điều hướng; trạng thái bên dưới mới là kết quả thật.</Alert>
      <div className="ops-actions">
        <Button onClick={() => goToPayos(checkoutUrl, live)} disabled={redirecting}><ExternalLink size={16} aria-hidden="true" />{redirecting ? "Đang chuyển tới PayOS…" : "Mở trang thanh toán PayOS"}</Button>
        {canPurchase && live.paymentRequestId && <Button variant="quiet" onClick={() => { setCancelError(""); setConfirmCancel(true); }}>Hủy thanh toán</Button>}
      </div>
    </div>}
    {cancelError && !confirmCancel && <Alert tone="danger" title="Không hủy được thanh toán">{cancelError}</Alert>}

    {paymentRequestId && <PaymentProgress accessToken={accessToken} paymentRequestId={paymentRequestId} buildingNames={buildingNames} onSettled={onSettled} />}

    <Modal open={confirmCancel} onOpenChange={(open) => { if (!open && !cancelling) setConfirmCancel(false); }} title="Hủy thanh toán?" description="Chỉ hủy được khi PayOS chưa xác nhận tiền. Nếu tiền đã vào, thanh toán sẽ hoàn tất và không bị hủy."
      footer={<><Button variant="quiet" onClick={() => setConfirmCancel(false)} disabled={cancelling}>Giữ thanh toán</Button><Button variant="danger" onClick={() => void cancelPayment()} disabled={cancelling}>{cancelling ? "Đang hủy…" : "Hủy thanh toán"}</Button></>}>
      {cancelError ? <Alert tone="danger" title="Không hủy được thanh toán">{cancelError}</Alert> : <p className="bill-muted">Bạn vẫn có thể tạo lại thanh toán từ báo giá này nếu còn hạn.</p>}
    </Modal>
  </div>;
}

