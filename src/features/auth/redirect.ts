import { getArticle } from "@/features/learn/data/articles";

export function safeNext(value: string | null): string {
  if (!value || !value.startsWith("/") || /[\\\s%]/.test(value.split("?")[0])) return "/learning-hub";
  try {
    const url = new URL(value, "https://fire3d.local");
    if (url.origin !== "https://fire3d.local") return "/learning-hub";
    const allowed = ["/learning-hub", "/learn", "/organizations", "/about", "/download", "/admin/accounts"];
    if (!allowed.includes(url.pathname) && !(url.pathname.startsWith("/learn/") && getArticle(url.pathname.slice(7)))) return "/learning-hub";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/learning-hub";
  }
}
