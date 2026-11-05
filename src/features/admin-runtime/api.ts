import { apiClient } from "@/api/client";

import { parseRuntimeEntry, sortEntries, type RuntimeCatalogEntry, type RuntimeRegistration } from "./model";

const auth = (accessToken: string): HeadersInit => ({ Authorization: `Bearer ${accessToken}` });

function entryOrThrow(raw: unknown): RuntimeCatalogEntry {
  const entry = parseRuntimeEntry(raw);
  if (!entry) throw new Error("Máy chủ trả về phiên bản không đọc được.");
  return entry;
}

/** PlatformAdmin runtime catalog (BE `PlatformServiceAdminController`). No ETag: a row is immutable except `isActive`. */
export const runtimeCatalogApi = {
  list: async (accessToken: string, signal?: AbortSignal) => {
    const raw = await apiClient.request<unknown>("/api/admin/runtime-catalog", { headers: auth(accessToken), signal });
    return sortEntries((Array.isArray(raw) ? raw : []).flatMap((item) => { const entry = parseRuntimeEntry(item); return entry ? [entry] : []; }));
  },
  create: async (accessToken: string, body: RuntimeRegistration) =>
    entryOrThrow(await apiClient.request<unknown>("/api/admin/runtime-catalog", { headers: auth(accessToken), method: "POST", json: body })),
  setActive: async (accessToken: string, id: string, isActive: boolean) =>
    entryOrThrow(await apiClient.request<unknown>(`/api/admin/runtime-catalog/${encodeURIComponent(id)}`, { headers: auth(accessToken), method: "PATCH", json: { isActive } })),
};
