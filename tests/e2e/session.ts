import type { Page } from "@playwright/test";

/**
 * The stored session exactly as the app reads it (`session-store.ts`): the shared `fire3d_session` cookie, then the
 * localStorage fallback, then the legacy sessionStorage key tests still seed. Returns the raw JSON or null.
 */
export const storedSession = (page: Page) => page.evaluate(() => {
  const cookie = document.cookie.split("; ").find((part) => part.startsWith("fire3d_session="));
  if (cookie) return decodeURIComponent(cookie.slice("fire3d_session=".length));
  return localStorage.getItem("fire3d-auth-tokens") ?? sessionStorage.getItem("fire3d-auth-tokens");
});
