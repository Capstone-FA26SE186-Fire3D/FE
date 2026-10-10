import { getArticle } from "@/features/learn/data/articles";
import type { AuthUser } from "./types";

export function dashboardRouteFor(user: Pick<AuthUser, "role"> | null | undefined) {
  if (user?.role === 0) return "/admin/accounts";
  if (user?.role === 1) return "/workspace/buildings";
  if (user?.role === 2) return "/learning-hub";
  return "/learning-hub";
}

function canOpenRoleRoute(user: Pick<AuthUser, "role"> | null | undefined, path: string) {
  if (path.startsWith("/admin/")) return user?.role === 0;
  if (path === "/dashboard/organization" || path.startsWith("/workspace/")) return user?.role === 1;
  if (path === "/dashboard/trainee") return user?.role === 2;
  return true;
}

function validatedNext(value: string | null): string | null {
  if (!value || !value.startsWith("/") || /[\\\s%]/.test(value.split("?")[0])) return null;
  try {
    const url = new URL(value, "https://fire3d.local");
    if (url.origin !== "https://fire3d.local") return null;
    const allowed = ["/learning-hub", "/learn", "/organizations", "/about", "/download", "/dashboard/trainee", "/dashboard/organization", "/workspace/buildings", "/workspace/ifc", "/workspace/support", "/workspace/profile"];
    const adminRoute = /^\/admin\/(overview|accounts|organizations|reviews|learn|library|commerce|support)(?:\/[a-zA-Z0-9_-]+)?$/.test(url.pathname);
    const buildingRoute = /^\/workspace\/buildings\/[a-zA-Z0-9_-]+(?:\/scenarios(?:\/[a-zA-Z0-9_-]+)?)?$/.test(url.pathname);
    if (!allowed.includes(url.pathname) && !adminRoute && !buildingRoute && !(url.pathname.startsWith("/learn/") && getArticle(url.pathname.slice(7)))) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export function safeNext(value: string | null): string {
  return validatedNext(value) ?? "/learning-hub";
}

export function postLoginRoute(user: Pick<AuthUser, "role"> | null | undefined, next: string | null): string {
  const destination = validatedNext(next);
  return destination && canOpenRoleRoute(user, destination) ? destination : dashboardRouteFor(user);
}
