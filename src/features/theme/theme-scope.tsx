"use client";

import { createContext, useContext, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { useLocalPreference } from "@/utils/local-preference";

export type ThemeMode = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "fire3d-ops-theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

const isThemeMode = (value: string): value is ThemeMode => value === "light" || value === "dark" || value === "system";

function subscribeSystem(listener: () => void) {
  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

type ThemeContextValue = { mode: ThemeMode; resolved: ResolvedTheme; setMode: (mode: ThemeMode) => void };

const ThemeContext = createContext<ThemeContextValue>({ mode: "system", resolved: "dark", setMode: () => undefined });
const PortalContext = createContext<HTMLElement | null>(null);

export function useTheme() {
  return useContext(ThemeContext);
}

/** Dialogs/toasts portal into the scope element so they inherit the theme tokens. */
export function usePortalContainer() {
  return useContext(PortalContext);
}

/**
 * Scopes the light/dark tokens to the operations area (Organization workspace and Admin).
 * "system" is resolved in CSS (`prefers-color-scheme`), so the first paint needs no script;
 * `resolved` is only for JS consumers such as the 3D viewport clear color.
 */
export function ThemeScope({ children, className = "", forcedMode }: { children: ReactNode; className?: string; /** Pin the theme (e.g. dark for a page that lives in the public site). */ forcedMode?: ThemeMode }) {
  const [storedMode, setMode] = useLocalPreference<ThemeMode>(STORAGE_KEY, "system", isThemeMode);
  const mode = forcedMode ?? storedMode;
  const systemDark = useSyncExternalStore(subscribeSystem, () => window.matchMedia(DARK_QUERY).matches, () => true);
  const resolved: ResolvedTheme = mode === "system" ? (systemDark ? "dark" : "light") : mode;
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const value = useMemo(() => ({ mode, resolved, setMode }), [mode, resolved, setMode]);

  return <ThemeContext.Provider value={value}><PortalContext.Provider value={container}><div ref={setContainer} className={`ops-theme ${className}`.trim()} data-theme={mode} data-resolved-theme={resolved}>{children}</div></PortalContext.Provider></ThemeContext.Provider>;
}
