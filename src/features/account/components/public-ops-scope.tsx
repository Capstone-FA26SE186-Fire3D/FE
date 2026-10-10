"use client";

import type { ReactNode } from "react";
import "@/assets/styles/ops.css";
import { ToastProvider } from "@/components/ui/toast";
import { ThemeScope } from "@/features/theme/theme-scope";

/** Lets the shared profile form use the operations primitives on the public /account page (kept dark like the site). */
export function PublicOpsScope({ children }: { children: ReactNode }) {
  return <ThemeScope className="ops-inline" forcedMode="dark"><ToastProvider>{children}</ToastProvider></ThemeScope>;
}
