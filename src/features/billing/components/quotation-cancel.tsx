"use client";

import { Ban } from "lucide-react";
import { useRef, useState } from "react";
import { useIdempotencyKey } from "@/api/idempotency";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { billingApi, type QuotationScope } from "../api";
import { billingErrorText, hasCode, isStatus } from "../errors";
import { billingEtag } from "../format";
import type { Quotation, WithEtag } from "../types";

const CANCELLABLE = ["Draft", "Issued", "Accepted"];

/**
 * Cancel a quotation (organization owner or PlatformAdmin) with a recorded reason. The BE refuses once a payment is
 * Paid/Applied (409 `QUOTATION_ALREADY_PAID`) or while a checkout may still hold a live link (409
 * `QUOTATION_CHECKOUT_UNRESOLVED`); the screen explains the next step instead of retrying. One key per intent:
 * a retry of the same reason + revision replays the same cancellation.
 */
export function QuotationCancel({ accessToken, scope, quotation, etag, onChanged, onStale }: {
  accessToken: string;
  scope: QuotationScope;
  quotation: Quotation;
  etag: string | null;
  onChanged: (next: WithEtag<Quotation>) => void;
  /** Reload the quotation (412/409): the user's reason stays in the dialog. */
  onStale: () => void;
}) {
  const toast = useToast();
  const key = useIdempotencyKey();
  const lock = useRef(false);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  if (!CANCELLABLE.includes(quotation.status)) return null;

  const submit = async () => {
    if (lock.current) return;
    const text = reason.trim();
    if (!text || text.length > 1000) { setFieldError("Nhập lý do hủy (1–1000 ký tự)."); return; }
    setFieldError("");
    lock.current = true;
    setSaving(true);
    setError("");
    try {
      const sentEtag = etag ?? billingEtag(quotation.id, quotation.revision);
      const next = await billingApi.cancelQuotation(accessToken, scope, quotation.id, text, sentEtag, key.keyFor({ id: quotation.id, reason: text, etag: sentEtag }));
      key.done();
      setOpen(false);
      setReason("");
      onChanged(next);
      toast.notify({ tone: "success", title: "Đã hủy báo giá", description: "Báo giá không còn dùng để chấp nhận hoặc thanh toán." });
    } catch (cause) {
      setError(billingErrorText(cause));
      if (isStatus(cause, 412) || hasCode(cause, "BILLING_STATE_CONFLICT")) onStale();
    } finally {
      lock.current = false;
      setSaving(false);
    }
  };

  return <>
    <div className="ops-actions"><Button variant="quiet" onClick={() => { setError(""); setOpen(true); }}><Ban size={16} aria-hidden="true" />Hủy báo giá</Button></div>
    <Modal open={open} onOpenChange={(next) => { if (!saving) setOpen(next); }} title="Hủy báo giá?" description="Không thể hoàn tác. Nếu đã có thanh toán đang mở, hủy thanh toán đó trước; tiền đã nhận không tự hoàn lại."
      footer={<><Button variant="quiet" onClick={() => setOpen(false)} disabled={saving}>Giữ báo giá</Button><Button variant="danger" onClick={() => void submit()} disabled={saving}>{saving ? "Đang hủy…" : "Hủy báo giá"}</Button></>}>
      <div className="ops-stack">
        <Field label="Lý do hủy" required error={fieldError} hint="Được ghi vào nhật ký kiểm toán.">{(p) => <Textarea {...p} maxLength={1000} value={reason} onChange={(event) => { setReason(event.target.value); setFieldError(""); }} />}</Field>
        {error && <Alert tone="danger" title="Chưa hủy được báo giá">{error}</Alert>}
      </div>
    </Modal>
  </>;
}
