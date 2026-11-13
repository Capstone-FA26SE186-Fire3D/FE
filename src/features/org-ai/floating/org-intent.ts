/**
 * Which assistant operation an organization message is meant for, so a question asked in "Đề xuất kịch bản" mode is not
 * sent as a draft request (the BE accepts only a draft for that operation, so the answer came back as "Chưa đủ căn cứ")
 * and a "soạn kịch bản …" request asked in "Hỏi đáp" mode becomes a draft. Plain rules, no network: `null` when the text
 * gives no clear signal, and the selected mode decides.
 */
export type OrgIntent = "Answer" | "ScenarioDraft";

const fold = (text: string) =>
  text.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().replace(/\s+/g, " ").trim();

// A verb of making plus a scenario/drill noun: "tạo kịch bản", "đề xuất bài diễn tập", "soạn tình huống cháy"…
const MAKE = /(tao|soan|lap|de xuat|thiet ke|xay dung|viet|dung|goi y)( giup| cho)?( (toi|minh|em))?( (mot|1|cac|vai))? ?(kich ban|bai (tap|dien tap|huan luyen)|tinh huong|ban nhap|scenario)/;
const DRAFT_ONLY = /\b(ban nhap|draft|scenario)\b/;
// Question forms: "như nào", "thế nào", "là gì", "tại sao", "bao nhiêu", "có nên", "làm sao", "ở đâu", "khi nào"…
const QUESTION = /(\?$|\b(nhu nao|the nao|ra sao|la gi|tai sao|vi sao|bao nhieu|bao lau|co nen|co duoc|co phai|lam sao|lam the nao|o dau|khi nao|cach nao|nghia la|giai thich|quy dinh|quy chuan|tieu chuan|khac nhau|khac gi)\b)/;

export function detectOrgIntent(text: string): OrgIntent | null {
  const t = fold(text);
  if (!t) return null;
  if (MAKE.test(t) || DRAFT_ONLY.test(t)) return "ScenarioDraft";
  if (QUESTION.test(t)) return "Answer";
  return null;
}
