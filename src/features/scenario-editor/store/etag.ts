/**
 * Draft ETag handling. The BE sends the draft revision (Postgres xmin) as a strong quoted validator, e.g. `"52"`,
 * and requires exactly that form back in `If-Match` (`DraftPrecondition`: one quoted positive integer; no `W/`, no lists, no `*`).
 */
export function normalizeEtag(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim().replace(/^W\//i, "");
  const match = /^"?(\d+)"?$/.exec(value);
  return match && Number(match[1]) > 0 ? `"${match[1]}"` : null;
}

/** ETag header first (authoritative), then the `version` field of the body, which carries the same number. */
export function draftEtag(headers: Headers, version: number | null | undefined): string | null {
  return normalizeEtag(headers.get("etag")) ?? (typeof version === "number" ? normalizeEtag(String(version)) : null);
}
