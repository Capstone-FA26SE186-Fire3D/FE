export type ApiHttpMethod = "DELETE" | "GET" | "HEAD" | "PATCH" | "POST" | "PUT";

export type ApiQueryValue = boolean | number | string | null | undefined;
export type ApiQueryParams = Record<string, ApiQueryValue | ApiQueryValue[]>;

export type ApiErrorPayload = Record<string, unknown>;

/** One validation problem: stable `code`, JSON path of the offending field, human `message`. */
export type ApiFieldError = { code: string; path: string; message: string };

export type ApiRequestOptions = {
  body?: BodyInit;
  headers?: HeadersInit;
  json?: unknown;
  method?: ApiHttpMethod;
  query?: ApiQueryParams;
  signal?: AbortSignal;
  /** Sent as `Idempotency-Key`. Reuse the same key only for a retry of the same payload. */
  idempotencyKey?: string;
  /** Sent as `If-Match` (resource ETag from the last read). */
  ifMatch?: string;
};

export type PageResponse<T> = {
  items: T[];
  totalCount: number;
  page: number;
  pageSize: number;
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
  /** Stable machine code from the body (`code`, or ProblemDetails `errorCode`), if any. */
  readonly code?: string;
  /** Normalized field errors from `errors` (array of {code,path,message} or a field → messages map). */
  readonly fieldErrors: ApiFieldError[];

  constructor(message: string, status: number, payload?: ApiErrorPayload, retryAfterSeconds?: number, code?: string, fieldErrors: ApiFieldError[] = []) {
    super(message);
    this.name = "ApiError";
    this.payload = payload;
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
    this.code = code;
    this.fieldErrors = fieldErrors;
  }

  /** ETag/If-Match mismatch: keep the user's input and offer to reload the newer version. */
  get isPreconditionFailed() {
    return this.status === 412;
  }

  get isRateLimited() {
    return this.status === 429 || this.status === 503;
  }

  /** Message for one field (`path` compared case-insensitively, with or without a `$.` prefix). */
  fieldMessage(path: string): string | undefined {
    const normalize = (value: string) => value.replace(/^\$\.?/, "").toLowerCase();
    return this.fieldErrors.find((item) => normalize(item.path) === normalize(path))?.message;
  }
}
