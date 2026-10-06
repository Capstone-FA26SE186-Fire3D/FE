export type ApiHttpMethod = "DELETE" | "GET" | "HEAD" | "PATCH" | "POST" | "PUT";

export type ApiQueryValue = boolean | number | string | null | undefined;
export type ApiQueryParams = Record<string, ApiQueryValue | ApiQueryValue[]>;

export type ApiErrorPayload = Record<string, unknown>;

export type ApiRequestOptions = {
  body?: BodyInit;
  headers?: HeadersInit;
  json?: unknown;
  method?: ApiHttpMethod;
  query?: ApiQueryParams;
  signal?: AbortSignal;
};

export type ApiResponse<T> = {
  data: T;
  headers: Headers;
  status: number;
};

export class ApiError extends Error {
  readonly payload?: ApiErrorPayload;
  readonly status: number;
  readonly retryAfterSeconds?: number;

  constructor(message: string, status: number, payload?: ApiErrorPayload, retryAfterSeconds?: number) {
    super(message);
    this.name = "ApiError";
    this.payload = payload;
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
