import type { TraineeAiContext } from "../types";

/**
 * Ready-made questions for the trainee chat, by context. A Training gets guidance criterion by criterion (the AI sees each
 * criterion's name and description, never the thresholds or pass mark); a Result gets a review of each criterion.
 */
export function traineeSuggestions(context: TraineeAiContext | undefined): string[] {
  if (context?.kind === "Result") return ["Nhận xét từng tiêu chí của lượt này giúp tôi", "Lần sau tôi cần làm gì để đạt?"];
  if (context?.kind === "Training") return ["Hướng dẫn tôi hoàn thành từng tiêu chí của bài này", "Bài này cần chú ý những gì?"];
  return [];
}
