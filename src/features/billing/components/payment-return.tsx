"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { routes } from "@/configs/routes";
import { readPendingCheckout } from "../pending-payment";
import Link from "next/link";

/**
 * Target of the PayOS `returnUrl`/`cancelUrl` (set `PayOS__ReturnUrl` / `PayOS__CancelUrl` to this route).
 * Navigation only: the URL's query (`status=PAID`, `cancel=true`…) is never trusted. It finds the checkout the
 * user left for and sends them to the screen that polls the real payment status.
 */
export function PaymentReturn() {
  const router = useRouter();
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    const pending = readPendingCheckout();
    const timer = window.setTimeout(() => {
      if (!pending) { setMissing(true); return; }
      const url = new URL(pending.returnTo, window.location.origin);
      url.searchParams.set("quotation", pending.quotationId);
      if (pending.paymentRequestId) url.searchParams.set("payment", pending.paymentRequestId);
      router.replace(`${url.pathname}${url.search}`);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [router]);

  return <>
    <PageHeader title="Đang kiểm tra thanh toán" description="Việc quay lại từ PayOS chỉ là điều hướng. Kết quả thật được lấy từ hệ thống." />
    {missing
      ? <Alert tone="warning" title="Không tìm thấy giao dịch đang dở" action={<Link href={routes.workspaceBilling}><Button size="sm" variant="secondary" className="mt-3">Mở Dịch vụ & thanh toán</Button></Link>}>Mở báo giá trong Dịch vụ & thanh toán để xem trạng thái thanh toán và kích hoạt.</Alert>
      : <p role="status">Đang tìm giao dịch của bạn…</p>}
  </>;
}
