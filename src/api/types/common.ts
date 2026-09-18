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

export class ApiError extends Error {
  readonly payload?: ApiErrorPayload;
  readonly status: number;

  constructor(message: string, status: number, payload?: ApiErrorPayload) {
    super(message);
    this.name = "ApiError";
    this.payload = payload;
    this.status = status;
  }
}
