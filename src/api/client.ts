import { env } from "@/configs/env";

import { parseErrorCode, parseErrorMessage, parseFieldErrors, parseRetryAfter } from "./errors";
import { ApiError, type ApiErrorPayload, type ApiQueryParams, type ApiRequestOptions, type ApiResponse } from "./types/common";

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

/**
 * 204/empty bodies resolve to undefined. A body that claims JSON but is not (proxy HTML error page,
 * truncated response) falls back to text so error handling still gets a status and a message.
 */
async function readResponseBody(response: Response): Promise<unknown> {
  if (response.status === 204 || response.status === 205 || response.headers.get("content-length") === "0") {
    return undefined;
  }

  const mediaType = (response.headers.get("content-type") ?? "").split(";", 1)[0].trim().toLowerCase();
  if (mediaType === "application/json" || mediaType.endsWith("+json")) {
    const raw = await response.text();
    if (!raw) return undefined;
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  return response.text();
}

export const apiClient = {
  async requestWithMeta<T>(path: string, options: ApiRequestOptions = {}): Promise<ApiResponse<T>> {
    if (options.body !== undefined && options.json !== undefined) {
      throw new TypeError("apiClient.request accepts either body or json, not both.");
    }

    const headers = new Headers(options.headers);
    headers.set("Accept", headers.get("Accept") ?? "application/json");
    if (options.idempotencyKey) headers.set("Idempotency-Key", options.idempotencyKey);
    if (options.ifMatch) headers.set("If-Match", options.ifMatch);

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
      throw new ApiError(
        parseErrorMessage(payload, fallback),
        response.status,
        isErrorPayload(payload) ? payload : undefined,
        parseRetryAfter(response.headers.get("Retry-After")),
        parseErrorCode(payload),
        parseFieldErrors(payload),
      );
    }

    return { data: payload as T, headers: response.headers, status: response.status };
  },
  async request<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
    return (await this.requestWithMeta<T>(path, options)).data;
  },
};
