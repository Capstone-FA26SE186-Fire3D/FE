"use client";

import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { useTheme, type ThemeMode } from "@/features/theme/theme-scope";

const options: Array<{ value: ThemeMode; label: string; icon: LucideIcon }> = [
  { value: "light", label: "Giao diện sáng", icon: Sun },
  { value: "dark", label: "Giao diện tối", icon: Moon },
  { value: "system", label: "Theo hệ thống", icon: Monitor },
];

export function ThemeToggle() {
  const { mode, setMode } = useTheme();
  return <div className="ops-segmented" role="group" aria-label="Giao diện">
    {options.map(({ value, label, icon: Icon }) => <button key={value} type="button" aria-pressed={mode === value} aria-label={label} title={label} onClick={() => setMode(value)}><Icon size={16} aria-hidden="true" /></button>)}
  </div>;
}
