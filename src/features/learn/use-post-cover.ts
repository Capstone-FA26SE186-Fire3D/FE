"use client";

import { useAsyncData } from "@/api/use-async-data";
import { learnApi } from "./api";

/**
 * Cover image of a saved post. A bookmark row from the server has no `coverImageUrl` yet (BE `LearnBookmarkView`), so the
 * cover is read from the public post; when the row carries it (even null), that value is used and nothing is fetched.
 * `null` while loading, on failure and for a post without a cover: the card then shows the art of its kind.
 */
export function usePostCover(slug: string, known: string | null | undefined): string | null {
  const fetched = useAsyncData(`learn:cover:${slug}`, async (signal) => (await learnApi.post(slug, signal)).version.coverImageUrl, known === undefined, { keepPrevious: false });
  return known === undefined ? fetched.data ?? null : known;
}
