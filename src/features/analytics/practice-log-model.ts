// Pure helpers of the practice log (no React), so they can be tested without a browser.

/** Shown under the table and as the first line of the exported file (Docs FR-PLAN-11). */
export const PRACTICE_LOG_NOTE = "Số liệu luyện tập trên mô phỏng, mang tính hỗ trợ, không thay buổi thực tập phương án.";

/**
 * The exported file always starts with the note. The server writes it itself since BE#218 (quoted, because it contains commas),
 * so it is added only when it is not already the first line.
 */
export const withPracticeLogNote = (csv: string) => (csv.replace(/^﻿/, "").replace(/^"/, "").startsWith(PRACTICE_LOG_NOTE) ? csv : `${PRACTICE_LOG_NOTE}\n${csv}`);

const DAY = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Ho_Chi_Minh" });
/** Date of the last practice in Vietnam time; null when the value is missing or not a date. */
export function lastPlayedText(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : DAY.format(date);
}
