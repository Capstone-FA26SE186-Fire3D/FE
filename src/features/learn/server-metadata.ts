import type { Metadata } from "next";
import { env } from "@/configs/env";
import { isRecord, str } from "./parse";
import { isPostSlug } from "./slug";

const FALLBACK: Metadata = { title: "Bài đọc", robots: { index: false } };

/**
 * Title/description for `/learn/[slug]`, read from the public API at request time (never cached, so a post that turns
 * Hidden or Deleted stops advertising its title right away). It only works when the API base URL is absolute; with a
 * same-origin/proxied base (local dev, test builds) the server cannot reach the API, so it falls back to a generic,
 * non-indexed title and the page itself sets the real title after it loads in the browser.
 */
export async function postMetadata(slug: string): Promise<Metadata> {
  const base = env.apiBaseUrl.replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(base) || !isPostSlug(slug)) return FALLBACK;
  try {
    const response = await fetch(`${base}/api/learn/posts/${encodeURIComponent(slug)}`, { cache: "no-store", headers: { Accept: "application/json" }, signal: AbortSignal.timeout(4000) });
    if (!response.ok) return FALLBACK;
    const body: unknown = await response.json();
    const version = isRecord(body) && isRecord(body.publishedVersion) ? body.publishedVersion : null;
    const title = version ? str(version.title).trim() : "";
    if (!version || !title) return FALLBACK;
    const description = str(version.summary).trim().slice(0, 300);
    return { title, description: description || undefined, openGraph: { title, description: description || undefined, type: "article" } };
  } catch {
    return FALLBACK;
  }
}
