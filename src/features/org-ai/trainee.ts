import { formatDateTime } from "@/features/billing/format";

import type { TraineeAiQuota } from "./types";

/** Why a Trainee cannot ask now, from `GET /api/ai/trainee/quota`; null when a question can be sent. */
export function traineeBlock(quota: TraineeAiQuota): { title: string; text: string } | null {
  if (!quota.policyActive) return { title: "Trợ lý AI chưa được bật", text: "Trợ lý AI chưa được mở cho học viên nên câu hỏi chưa được gửi. Bạn vẫn đọc bài học bình thường." };
  if (quota.blockedByAssessment) return { title: "AI tạm khóa trong bài đánh giá", text: "Bạn đang có một bài đánh giá chưa kết thúc. AI không hỗ trợ trong lúc làm bài; hãy hoàn tất bài rồi hỏi lại." };
  if (!quota.canSubmit) return { title: "Đã hết lượt hỏi hôm nay", text: `Hạn mức hôm nay đã dùng hết. Lượt mới có lại lúc ${formatDateTime(quota.resetsAt)}.` };
  return null;
}

/** Longest delay `setTimeout` accepts; a later reset is re-armed when the page reloads the quota. */
const MAX_TIMER_MS = 2_147_483_647;

/** Milliseconds from `now` until the quota resets (plus a small margin so the server has rolled over), or null if not ahead. */
export function quotaResetDelay(resetsAt: string, now: number): number | null {
  const at = Date.parse(resetsAt);
  if (Number.isNaN(at) || at <= now) return null;
  return Math.min(at - now + 1000, MAX_TIMER_MS);
}

/**
 * What a Trainee question is about, as the page handed it over (`?article=`, `?session=`, `?training=`). The article slug
 * is resolved to its post and version by the chat panel before anything is sent.
 */
export type TraineeTarget = { article?: string; session?: string; training?: string };

/** The Trainee's own AI page: history and today's allowance (the chat itself is the floating bubble). */
export const TRAINEE_AI_HREF = "/learning-hub?view=questions";
export const traineeRequestHref = (requestId: string) => `${TRAINEE_AI_HREF}&request=${encodeURIComponent(requestId)}`;
