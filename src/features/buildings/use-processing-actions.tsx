"use client";

import { useRef, useState } from "react";
import { newIdempotencyKey, useIdempotencyKey } from "@/api/idempotency";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { buildingsApi } from "./api";
import { describeApiError } from "./format";
import type { BuildingRevision, ProcessingJob } from "./types";

export type ProcessingActions = ReturnType<typeof useProcessingActions>;

/**
 * Start processing (202, Idempotency-Key) and retry a Failed job (reason + stable requestId). The BE only requeues a Failed
 * job (JOB_NOT_CLAIMABLE otherwise), so the retry is offered for that status alone.
 */
export function useProcessingActions({ accessToken, revision, job, onChanged }: {
  accessToken: string;
  revision: BuildingRevision | null;
  job: ProcessingJob | null;
  onChanged: () => void;
}) {
  const toast = useToast();
  const processKey = useIdempotencyKey();
  const retryKey = useIdempotencyKey();
  const busy = useRef(false);
  const [working, setWorking] = useState<"process" | "retry" | null>(null);
  const [actionError, setActionError] = useState<{ revisionId: string; message: string } | null>(null);
  const [retryOpen, setRetryOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [retryError, setRetryError] = useState("");

  const start = async () => {
    if (busy.current || !revision) return;
    busy.current = true;
    setWorking("process");
    setActionError(null);
    try {
      await buildingsApi.processRevision(accessToken, revision.id, processKey.keyFor({ revisionId: revision.id }));
      processKey.done();
      toast.notify({ tone: "success", title: "Đã gửi yêu cầu xử lý", description: "Hệ thống đã nhận yêu cầu; mô hình sẽ được xử lý và trang tự cập nhật." });
      onChanged();
    } catch (error) {
      setActionError({ revisionId: revision.id, message: describeApiError(error, "Không thể gửi yêu cầu xử lý. Hãy thử lại; gửi lại sẽ không tạo lượt xử lý trùng.") });
    } finally {
      busy.current = false;
      setWorking(null);
    }
  };

  const openRetry = () => {
    setRetryError("");
    setRetryOpen(true);
  };

  const submitRetry = async () => {
    if (busy.current || !job) return;
    const text = reason.trim();
    if (!text) { setRetryError("Nhập lý do chạy lại."); return; }
    if (text.length > 1000) { setRetryError("Lý do tối đa 1000 ký tự."); return; }
    busy.current = true;
    setWorking("retry");
    setRetryError("");
    try {
      // requestId identifies one retry intent: same id + same reason is replayed by the server (AlreadyRequeued).
      const requestId = retryKey.keyFor({ jobId: job.id, reason: text });
      await buildingsApi.retryJob(accessToken, job.id, { requestId: isUuid(requestId) ? requestId : newIdempotencyKey(), reason: text });
      retryKey.done();
      setRetryOpen(false);
      setReason("");
      toast.notify({ tone: "success", title: "Đã yêu cầu chạy lại", description: "Mô hình sẽ được xử lý lại; trang tự cập nhật khi có kết quả." });
      onChanged();
    } catch (error) {
      setRetryError(describeApiError(error, "Không thể yêu cầu chạy lại lượt xử lý này."));
    } finally {
      busy.current = false;
      setWorking(null);
    }
  };

  const modal = <Modal
    open={retryOpen}
    onOpenChange={(open) => { if (!open && working !== "retry") setRetryOpen(false); }}
    title="Chạy lại lượt xử lý bị lỗi?"
    description="Mô hình sẽ được xếp hàng xử lý lại. Lý do được lưu lại để tra cứu; gửi lại cùng lý do sẽ không tạo thêm yêu cầu."
    footer={<><Button variant="quiet" onClick={() => setRetryOpen(false)} disabled={working === "retry"}>Hủy</Button><Button onClick={() => void submitRetry()} disabled={working === "retry"}>{working === "retry" ? "Đang gửi…" : "Chạy lại"}</Button></>}
  >
    <Field label="Lý do chạy lại" required error={retryError || undefined}>{(p) => <Textarea {...p} rows={3} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} />}</Field>
  </Modal>;

  return {
    working,
    actionError: actionError && actionError.revisionId === revision?.id ? actionError.message : "",
    canRetry: job?.status === "Failed",
    start,
    openRetry,
    modal,
  };
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
