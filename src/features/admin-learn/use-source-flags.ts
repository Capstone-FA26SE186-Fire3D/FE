"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { learnAdminApi } from "./api";
import type { SourceEntry } from "./content";
import type { KnowledgeSource } from "./types";

/**
 * The backend's verdict (`canUseInDraft`, `canPublishReference`) for every source a version cites. A source picked from the
 * catalog arrives with it; one stored on a version (which only has id, title and label) is looked up by id so the verdict
 * survives a reload. `null` = could not be checked (the backend still checks at publish).
 */
export function useSourceFlags(accessToken: string, sources: SourceEntry[]) {
  const [flags, setFlags] = useState<Record<string, KnowledgeSource | null>>({});
  const requested = useRef(new Set<string>());
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const known = useCallback((items: KnowledgeSource[]) => {
    setFlags((current) => {
      const next = { ...current };
      for (const item of items) next[item.id] = item;
      return next;
    });
  }, []);

  useEffect(() => {
    for (const entry of sources) {
      if (requested.current.has(entry.sourceId)) continue;
      requested.current.add(entry.sourceId);
      learnAdminApi.getSource(accessToken, entry.sourceId)
        .then((source) => { if (alive.current) setFlags((current) => ({ ...current, [source.id]: source })); })
        .catch(() => {
          if (!alive.current) return;
          requested.current.delete(entry.sourceId);
          setFlags((current) => (entry.sourceId in current ? current : { ...current, [entry.sourceId]: null }));
        });
    }
  }, [accessToken, sources]);

  return { flags, known };
}
