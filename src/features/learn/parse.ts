import type { LearnKind, PageOf, SituationRef, SourceRef } from "./types";
import { LEARN_KINDS } from "./types";

/*
 * The Learn endpoints are documented as raw JSON (OpenAPI says JsonElement), so every response is read defensively:
 * wrong-typed fields fall back to safe defaults instead of throwing inside a React render.
 */

export type Json = Record<string, unknown>;

export const isRecord = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);
export const str = (value: unknown, fallback = ""): string => (typeof value === "string" ? value : fallback);
export const strOrNull = (value: unknown): string | null => (typeof value === "string" ? value : null);
export const num = (value: unknown, fallback = 0): number => (typeof value === "number" && Number.isFinite(value) ? value : fallback);
export const bool = (value: unknown, fallback = false): boolean => (typeof value === "boolean" ? value : fallback);
export const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
export const kindOf = (value: unknown): LearnKind => (LEARN_KINDS as readonly string[]).includes(value as string) ? (value as LearnKind) : "Article";

export function parsePage<T>(raw: unknown, mapItem: (item: unknown) => T | null): PageOf<T> {
  const body = isRecord(raw) ? raw : {};
  const items = list(body.items).map(mapItem).filter((item): item is T => item !== null);
  return { items, total: num(body.total, items.length), page: num(body.page, 1), pageSize: num(body.pageSize, items.length || 20) };
}

export function parseSituationRef(raw: unknown): SituationRef | null {
  if (!isRecord(raw) || typeof raw.id !== "string") return null;
  return { id: raw.id, slug: str(raw.slug), name: str(raw.name, str(raw.slug)) };
}

export function parseSourceRef(raw: unknown): SourceRef | null {
  if (!isRecord(raw) || typeof raw.sourceId !== "string") return null;
  return { sourceId: raw.sourceId, title: str(raw.title, "Nguồn không rõ tên"), versionLabel: str(raw.versionLabel), role: str(raw.role, "Reference"), locator: isRecord(raw.locator) ? raw.locator : {} };
}
