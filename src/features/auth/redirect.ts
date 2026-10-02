import { getArticle } from "@/features/learn/data/articles";
import type { AuthUser } from "./types";

export function dashboardRouteFor(user: Pick<AuthUser, "role"> | null | undefined) {
  if (user?.role === 1) return "/dashboard/organization";
  if (user?.role === 2) return "/dashboard/trainee";
  return "/admin/accounts";
}

export function safeNext(value: string | null): string {
  if (!value || !value.startsWith("/") || /[\\\s%]/.test(value.split("?")[0])) return "/learning-hub";
  try {
    const url = new URL(value, "https://fire3d.local");
    if (url.origin !== "https://fire3d.local") return "/learning-hub";
    const allowed = ["/learning-hub", "/learn", "/organizations", "/about", "/download", "/admin/accounts", "/dashboard/trainee", "/dashboard/organization", "/workspace/buildings", "/workspace/ifc"];
    if (!allowed.includes(url.pathname) && !(url.pathname.startsWith("/learn/") && getArticle(url.pathname.slice(7)))) return "/learning-hub";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/learning-hub";
  }
}

export function postLoginRoute(user: Pick<AuthUser, "role"> | null | undefined, next: string | null): string {
  return next ? safeNext(next) : dashboardRouteFor(user);
}
