"use client";

import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import "./spinner.css";
import { cn } from "@/utils/cn";

/**
 * Brand spinner: an ember ring that rotates while three sparks blink around it (Figma "Loading / Brand spinner",
 * 1.2 s loop). Pure CSS; under reduced motion the ring stands still and only the sparks fade.
 */
export function Spinner({ size = 20, className, label }: { size?: number; className?: string; /** Announced to assistive tech when the spinner stands alone. */ label?: string }) {
  return <span className={cn("ops-spinner", className)} style={{ width: size, height: size }} role={label ? "status" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
    <svg viewBox="0 0 56 56" width={size} height={size} aria-hidden="true">
      <circle className="ops-spinner-track" cx="28" cy="28" r="20" />
      <circle className="ops-spinner-ring" cx="28" cy="28" r="20" />
      <circle className="ops-spinner-spark" cx="28" cy="4" r="2.4" />
      <circle className="ops-spinner-spark" cx="48" cy="40" r="1.8" style={{ animationDelay: "0.4s" }} />
      <circle className="ops-spinner-spark" cx="8" cy="40" r="2" style={{ animationDelay: "0.8s" }} />
    </svg>
  </span>;
}

/** Centered spinner with a caption for a whole panel or page section. */
export function LoadingBlock({ label = "Đang tải…", className, size = 44 }: { label?: string; className?: string; size?: number }) {
  return <div className={cn("ops-loading-block", className)} role="status" aria-live="polite"><Spinner size={size} /><p>{label}</p></div>;
}

/**
 * Submit button with its own feedback: idle → spinner inline → green check, then back to idle (Figma "nút gửi").
 * The caller drives `state`; "done" should be held ~1.2 s by the caller before resetting.
 */
export function SubmitButton({ state = "idle", children, doneLabel, disabled, className, ...props }: ButtonProps & { state?: "idle" | "busy" | "done"; doneLabel?: ReactNode }) {
  return <Button className={cn("ops-submit", className)} data-state={state} disabled={disabled || state !== "idle"} aria-busy={state === "busy" || undefined} {...props}>
    {state === "busy" && <Spinner size={16} />}
    {state === "done" && <Check size={16} aria-hidden="true" className="ops-submit-check" />}
    <span>{state === "done" && doneLabel ? doneLabel : children}</span>
  </Button>;
}
