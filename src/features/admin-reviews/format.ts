import type { Tone } from "@/components/ui/status-badge";
import { reviewStatuses, type ReviewStatus } from "./types";

/** Review lifecycle (content approval). This is NOT technical readiness and NOT publication. */
export function statusLabel(status: string): string {
  if (status === "Submitted") return "Chờ duyệt";
  if (status === "Approved") return "Đã duyệt nội dung";
  if (status === "Rejected") return "Đã từ chối";
  return "Không rõ";
}

export function statusTone(status: string): Tone {
  if (status === "Submitted") return "info";
  if (status === "Approved") return "success";
  if (status === "Rejected") return "danger";
  return "neutral";
}

/** URL param -> filter. Absent or unknown means the default queue (Submitted); `all` removes the status filter. */
export function parseStatusParam(value: string): ReviewStatus | "all" {
  if (value === "all") return "all";
  return (reviewStatuses as string[]).includes(value) ? (value as ReviewStatus) : "Submitted";
}

export function shortHash(hash: string): string {
  return hash.length > 20 ? `${hash.slice(0, 10)}…${hash.slice(-8)}` : hash;
}

export function shortId(id: string | null | undefined): string {
  return id ? `${id.slice(0, 8)}…` : "—";
}

export function outcomeLabel(outcome: string | null): string {
  if (!outcome) return "Chưa có kết quả kiểm tra tự động";
  if (outcome === "Passed") return "Kiểm tra tự động đạt";
  if (outcome === "Failed") return "Kiểm tra tự động không đạt";
  return "Chưa rõ kết quả kiểm tra";
}
