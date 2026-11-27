/**
 * Why one run of a processing job ended (`endReason` of a processing attempt or processing-log row). The server derives it
 * from the run status: Succeeded → Completed, Failed → WorkerFailed, Expired → LeaseExpired (the machine did not report
 * back in time, so the job was handed out again). People read the sentence, never the value.
 */
export type AttemptEndReason = "Completed" | "WorkerFailed" | "LeaseExpired";

/** Vietnamese sentence for why an attempt ended; null when there is nothing to say (running, completed, unknown value). */
export function attemptEndReasonText(endReason: string | null | undefined, worker: "xử lý" | "dựng"): string | null {
  if (endReason === "LeaseExpired") return `Máy ${worker} bị ngắt giữa chừng (khởi động lại hoặc mất kết nối) nên hệ thống đã giao lại việc.`;
  if (endReason === "WorkerFailed") return `Máy ${worker} báo lỗi.`;
  return null;
}
