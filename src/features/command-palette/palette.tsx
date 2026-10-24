"use client";

import { Search } from "lucide-react";
import dynamic from "next/dynamic";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DialogRoot } from "@/components/ui/dialog";

// cmdk, the building search and the nav list load the first time the palette opens; the shell only ships the shortcut.
const PaletteDialog = dynamic(() => import("./palette-dialog").then((module) => module.PaletteDialog), { ssr: false });

type PaletteApi = { open: () => void };
const PaletteContext = createContext<PaletteApi>({ open: () => undefined });

export function useCommandPalette() {
  return useContext(PaletteContext);
}

/** True while the key event comes from a text field, where Ctrl+K belongs to the editor. */
function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const api = useMemo<PaletteApi>(() => ({ open: () => setOpen(true) }), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== "k") return;
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      setOpen((current) => !current);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return <PaletteContext.Provider value={api}>
    {children}
    <DialogRoot open={open} onOpenChange={setOpen}>{open && <PaletteDialog onClose={() => setOpen(false)} />}</DialogRoot>
  </PaletteContext.Provider>;
}

/** Topbar "Tìm nhanh ⌘K" button. */
export function CommandPaletteButton() {
  const { open } = useCommandPalette();
  return <button type="button" className="ops-topbar-search" onClick={open} aria-label="Tìm nhanh (Ctrl K)"><Search size={16} aria-hidden="true" /><span>Tìm nhanh</span><kbd>⌘K</kbd></button>;
}
