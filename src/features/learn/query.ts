import { LEARN_KINDS } from "./types";

/*
 * URL state of the public Learn list. The names and limits follow GET /api/learn/posts (BE ContentController.Posts and
 * learn_public_gate, BE docs/learn-library.md): `search` 2-100 characters after trimming, `situation` repeated (<=10 slugs,
 * OR), `kind` repeated (Article/Tip/Video, OR, case-insensitive), the three filters combine with AND.
 */

export const LEARN_LIMITS = { searchMin: 2, searchMax: 100, situationMax: 10, situationSlugMax: 120 } as const;

export type LearnFilterField = "search" | "situation" | "kind";

export type LearnQuery = { search: string; situations: string[]; kinds: string[]; page: number };

type ParamSource = { get(name: string): string | null; getAll(name: string): string[] };

const unique = (values: string[]) => [...new Set(values)];

/**
 * Reads the URL. Values are kept as the user wrote them (trimmed, de-duplicated) so the API stays the judge of what is valid:
 * a kind the API does not know is sent as is and comes back as a 400 with a field error. The one exception is the case of a
 * known kind (`?kind=tip`), which the API accepts and the chips need in canonical form to show as pressed.
 */
export function parseLearnQuery(params: ParamSource): LearnQuery {
  const pageNumber = Number(params.get("page"));
  const kinds = params.getAll("kind").map((value) => value.trim()).filter(Boolean).map((value) => LEARN_KINDS.find((kind) => kind.toLowerCase() === value.toLowerCase()) ?? value);
  return {
    search: (params.get("search") ?? "").trim(),
    situations: unique(params.getAll("situation").map((value) => value.trim()).filter(Boolean)),
    kinds: unique(kinds),
    page: Number.isInteger(pageNumber) && pageNumber >= 1 ? pageNumber : 1,
  };
}

export function toSearchParams(query: LearnQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (query.search) params.set("search", query.search);
  for (const kind of query.kinds) params.append("kind", kind);
  for (const slug of query.situations) params.append("situation", slug);
  if (query.page > 1) params.set("page", String(query.page));
  return params;
}

export const hasLearnFilters = (query: Pick<LearnQuery, "search" | "situations" | "kinds">) => query.search !== "" || query.situations.length > 0 || query.kinds.length > 0;

/** Stable identity of a query for `useAsyncData`. */
export const learnQueryKey = (query: LearnQuery, pageSize: number) => JSON.stringify([query.search, query.kinds, query.situations, query.page, pageSize]);
