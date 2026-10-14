"use client";

import { useEffect, useState } from "react";

import { ApiError } from "@/api/types/common";

import { Button } from "./button";

/**
 * "Thử lại" for a failed read. When the server answered 429/503 with `Retry-After`, the button stays disabled and counts
 * down until the server's window has passed, so a retry is not sent into a rate limit it was just told about.
 */
export function RetryButton({ error, onRetry, label = "Thử lại", className = "mt-3" }: { error: unknown; onRetry: () => void; label?: string; className?: string }) {
  const seconds = error instanceof ApiError && error.retryAfterSeconds && error.retryAfterSeconds > 0 ? Math.ceil(error.retryAfterSeconds) : 0;
  // Seconds elapsed since THIS error was shown; a new error object (another failed attempt) restarts the window.
  const [elapsed, setElapsed] = useState<{ error: unknown; seconds: number }>({ error, seconds: 0 });
  if (elapsed.error !== error) setElapsed({ error, seconds: 0 });

  useEffect(() => {
    if (!seconds) return;
    const timer = window.setInterval(() => setElapsed((current) => current.error === error ? { error, seconds: current.seconds + 1 } : current), 1000);
    return () => window.clearInterval(timer);
  }, [error, seconds]);

  const left = Math.max(0, seconds - (elapsed.error === error ? elapsed.seconds : 0));
  return <Button size="sm" variant="secondary" className={className} onClick={onRetry} disabled={left > 0} data-testid="retry-button">
    {left > 0 ? `${label} sau ${left} giây` : label}
  </Button>;
}
