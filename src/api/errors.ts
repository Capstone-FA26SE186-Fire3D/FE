import type { ApiFieldError } from "./types/common";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value : undefined);

function fromArray(items: unknown[], fallbackCode: string): ApiFieldError[] {
  const result: ApiFieldError[] = [];
  for (const item of items) {
    if (!isRecord(item)) continue;
    const message = text(item.message) ?? text(item.detail) ?? text(item.error);
    if (!message) continue;
    result.push({ code: text(item.code) ?? fallbackCode, path: text(item.path) ?? text(item.field) ?? text(item.property) ?? "", message });
  }
  return result;
}

function fromMap(map: Record<string, unknown>, fallbackCode: string): ApiFieldError[] {
  const result: ApiFieldError[] = [];
  for (const [path, value] of Object.entries(map)) {
    const messages = Array.isArray(value) ? value : [value];
    for (const message of messages) {
      const resolved = text(message);
      if (resolved) result.push({ code: fallbackCode, path, message: resolved });
    }
  }
  return result;
}

/** Reads `errors` as either `[{code,path,message}]` or `{ field: ["message"] }` (ProblemDetails). */
export function parseFieldErrors(payload: unknown): ApiFieldError[] {
  if (!isRecord(payload)) return [];
  const fallbackCode = text(payload.code) ?? "validation_error";
  const errors = payload.errors;
  if (Array.isArray(errors)) return fromArray(errors, fallbackCode);
  if (isRecord(errors)) return fromMap(errors, fallbackCode);
  return [];
}

export function parseErrorCode(payload: unknown): string | undefined {
  if (!isRecord(payload)) return undefined;
  return text(payload.code) ?? text(payload.errorCode) ?? text(payload.error_code);
}

export function parseErrorMessage(payload: unknown, fallback: string): string {
  if (!isRecord(payload)) return fallback;
  return text(payload.message) ?? text(payload.title) ?? text(payload.detail) ?? fallback;
}

/** `Retry-After` is either delta-seconds or an HTTP date. Returns whole seconds, never negative. */
export function parseRetryAfter(header: string | null, now = Date.now()): number | undefined {
  if (!header) return undefined;
  const value = header.trim();
  if (/^\d+$/.test(value)) {
    const seconds = Number(value);
    return Number.isSafeInteger(seconds) ? seconds : undefined;
  }
  const at = Date.parse(value);
  return Number.isNaN(at) ? undefined : Math.max(0, Math.ceil((at - now) / 1000));
}
