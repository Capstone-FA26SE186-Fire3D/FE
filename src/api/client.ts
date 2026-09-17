import { env } from "@/configs/env";

import { ApiError, type ApiErrorPayload, type ApiQueryParams, type ApiRequestOptions } from "./types/common";

function buildUrl(path: string, query?: ApiQueryParams): string {
  const baseUrl = env.apiBaseUrl.replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const [pathname, existingQuery = ""] = `${baseUrl}${normalizedPath}`.split("?", 2);
  const searchParams = new URLSearchParams(existingQuery);

  for (const [key, value] of Object.entries(query ?? {})) {
    const values = Array.isArray(value) ? value : [value];

    for (const item of values) {
      if (item !== null && item !== undefined) {
        searchParams.append(key, String(item));
      }
    }
  }

  const search = searchParams.toString();
  return search ? `${pathname}?${search}` : pathname;
}

function isErrorPayload(value: unknown): value is ApiErrorPayload {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readResponseBody(response: Response): Promise<unknown> {
  if (response.status === 204 || response.headers.get("content-length") === "0") {
    return undefined;
  }

  const contentType = response.headers.get("content-type") ?? "";
  return contentType.includes("application/json") ? response.json() : response.text();
}

function errorMessage(payload: unknown, fallback: string): string {
  if (!isErrorPayload(payload)) {
    return fallback;
  }

  if (typeof payload.message === "string") {
    return payload.message;
  }

  return typeof payload.detail === "string" ? payload.detail : fallback;
}

export const apiClient = {
  async request<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
    if (options.body !== undefined && options.json !== undefined) {
      throw new TypeError("apiClient.request accepts either body or json, not both.");
    }

    const headers = new Headers(options.headers);
    headers.set("Accept", headers.get("Accept") ?? "application/json");

    const hasJsonBody = options.json !== undefined;
    if (hasJsonBody) {
      headers.set("Content-Type", headers.get("Content-Type") ?? "application/json");
    }

    const response = await fetch(buildUrl(path, options.query), {
      body: hasJsonBody ? JSON.stringify(options.json) : options.body,
      headers,
      method: options.method ?? (hasJsonBody || options.body ? "POST" : "GET"),
      signal: options.signal,
    });
    const payload = await readResponseBody(response);

    if (!response.ok) {
      const fallback = response.statusText || `Request failed with status ${response.status}.`;
      throw new ApiError(errorMessage(payload, fallback), response.status, isErrorPayload(payload) ? payload : undefined);
    }

    return payload as T;
  },
};
