import { getArticle } from "@/features/learn/data/articles";
import type { AuthUser } from "./types";

export function dashboardRouteFor(user: Pick<AuthUser, "role"> | null | undefined) {
  if (user?.role === 0) return "/admin/accounts";
  if (user?.role === 1) return "/dashboard/organization";
  if (user?.role === 2) return "/learning-hub";
  return "/learning-hub";
}

function canOpenRoleRoute(user: Pick<AuthUser, "role"> | null | undefined, path: string) {
  if (path.startsWith("/admin/")) return user?.role === 0;
  if (path === "/dashboard/organization" || path.startsWith("/workspace/")) return user?.role === 1;
  if (path === "/dashboard/trainee") return user?.role === 2;
  return true;
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
  const destination = next ? safeNext(next) : null;
  return destination && canOpenRoleRoute(user, destination) ? destination : dashboardRouteFor(user);
}
