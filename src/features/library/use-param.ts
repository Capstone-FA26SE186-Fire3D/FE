import { isKind, type LibraryKind } from "./types";

/** Query parameter "Dùng làm mẫu" on /workspace/library adds to the editor URL: `<kind>:<itemId>`, never the content. */
export const LIBRARY_USE_PARAM = "useSample";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const libraryUseValue = (kind: LibraryKind, itemId: string) => `${kind}:${itemId}`;

export function parseLibraryUse(value: string | null): { kind: LibraryKind; itemId: string } | null {
  const [kind, itemId] = (value ?? "").split(":");
  return isKind(kind) && UUID.test(itemId ?? "") ? { kind, itemId } : null;
}
