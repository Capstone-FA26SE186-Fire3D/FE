"use client";

import { useId, useMemo, useState, type FormEvent } from "react";

import { describeApiError } from "@/api/describe-error";
import { useAsyncData } from "@/api/use-async-data";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Modal } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/spinner";
import { SupportCode } from "@/components/ui/support-code";
import { useToast } from "@/components/ui/toast";
import { accountsApi } from "@/features/accounts/api";

import { describeReassignError, reviewsApi } from "../api";
import { REASSIGN_REASON_MAX, type ReviewSummary } from "../types";

/** Role 3 = FireSafetyExpert (Chuyên viên PCCC). */
const EXPERT_ROLE = 3;

/**
 * "Gán lại" (BE#242): hand a waiting review to another active Chuyên viên PCCC with a reason. The choices come from the
 * admin accounts API (active experts only); the current holder is left out. After success, or when the server says the
 * item is no longer waiting, the caller re-reads the list.
 */
export function ReassignDialog({ review, accessToken, onClose, onChanged }: { review: ReviewSummary; accessToken: string; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const formId = useId();
  const [expertId, setExpertId] = useState("");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<{ expertId?: string; reason?: string }>({});
  const [failure, setFailure] = useState<{ message: string; code?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const experts = useAsyncData("reviews:reassign-experts", (signal) => accountsApi.list(accessToken, { role: EXPERT_ROLE, isActive: true, page: 1, pageSize: 100, sort: "fullName" }, signal));
  const holder = review.assignedTo?.id;
  const options = useMemo<ComboboxOption[]>(() => (experts.data?.items ?? [])
    .filter((account) => account.isActive && account.role === EXPERT_ROLE && account.id !== holder)
    .map((account) => ({ value: account.id, label: account.fullName?.trim() || account.email, hint: account.email, keywords: [account.email] })), [experts.data, holder]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const length = reason.trim().length;
    const next = {
      expertId: expertId ? undefined : "Chọn Chuyên viên PCCC nhận mục này.",
      reason: length === 0 ? `Nhập lý do gán lại (1–${REASSIGN_REASON_MAX} ký tự).` : length > REASSIGN_REASON_MAX ? `Lý do tối đa ${REASSIGN_REASON_MAX} ký tự (đang ${length}).` : undefined,
    };
    setErrors(next);
    if (next.expertId || next.reason) return;
    setBusy(true);
    setFailure(null);
    try {
      const updated = await reviewsApi.reassign(accessToken, review.reviewId, { expertId, reason });
      const name = updated?.assignedTo?.fullName ?? options.find((option) => option.value === expertId)?.label;
      toast.notify({ tone: "success", title: "Đã gán lại", description: name ? `${review.scenarioName} · giao cho ${name}` : review.scenarioName });
      onChanged();
      onClose();
    } catch (cause) {
      const described = describeReassignError(cause);
      if (described.reload) {
        toast.notify({ tone: "warning", title: "Chưa gán lại được", description: described.message });
        onChanged();
        onClose();
        return;
      }
      // A field problem shows under that field only; anything else in the alert at the bottom.
      if (described.field) setErrors((current) => ({ ...current, [described.field as string]: described.message }));
      else setFailure({ message: described.message, code: described.code });
    } finally {
      setBusy(false);
    }
  };

  return <Modal open onOpenChange={(open) => { if (!open && !busy) onClose(); }} size="md" title="Gán lại cho Chuyên viên khác"
    description={`${review.scenarioName} · ${review.organizationName}`}
    footer={<>
      <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>Hủy</Button>
      <SubmitButton type="submit" form={formId} state={busy ? "busy" : "idle"} data-testid="reassign-submit">Gán lại</SubmitButton>
    </>}>
    <form id={formId} onSubmit={(event) => void submit(event)} noValidate className="ops-stack" data-testid="reassign-form">
      <p className="rev-note">{review.assignedTo ? `Đang giao cho ${review.assignedTo.fullName?.trim() || "Chuyên viên PCCC"}.` : "Mục này chưa giao cho ai."} Người được chọn sẽ thẩm định mục này thay người đang giữ.</p>
      <Field label="Chuyên viên PCCC" required error={errors.expertId}>{(props) => <Combobox {...props} value={expertId} data-testid="reassign-expert"
        onChange={(value) => { setExpertId(value); if (errors.expertId) setErrors({ ...errors, expertId: undefined }); }}
        options={options} placeholder="Chọn Chuyên viên PCCC" searchPlaceholder="Tìm theo tên hoặc email…" groupLabel="Chuyên viên đang hoạt động"
        emptyText={experts.error !== undefined ? "Không tải được danh sách Chuyên viên" : "Không có Chuyên viên nào khác đang hoạt động"} loading={experts.loading && !experts.data} disabled={busy} />}</Field>
      {experts.error !== undefined && <Alert tone="warning" title="Không tải được danh sách Chuyên viên PCCC" action={<Button size="sm" variant="secondary" className="mt-3" onClick={experts.reload}>Thử lại</Button>}>{describeApiError(experts.error, "Hãy thử lại sau.")}</Alert>}
      <Field label="Lý do gán lại" required hint={`${reason.trim().length}/${REASSIGN_REASON_MAX} ký tự. Ghi lại vì sao đổi người, ví dụ người đang giữ nghỉ phép.`} error={errors.reason}>
        {(props) => <Textarea {...props} rows={4} value={reason} disabled={busy} data-testid="reassign-reason" onChange={(event) => { setReason(event.target.value); if (errors.reason) setErrors({ ...errors, reason: undefined }); }} />}
      </Field>
      {failure && <Alert tone="danger" title="Chưa gán lại được">{failure.message}<SupportCode code={failure.code} /></Alert>}
    </form>
  </Modal>;
}
