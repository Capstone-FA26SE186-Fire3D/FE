"use client";

import { createContext, useContext } from "react";

/** The breadcrumb slot in the operations topbar. Pages render their breadcrumb into it (see `Breadcrumbs`); null outside the shell. */
export const TopbarSlotContext = createContext<HTMLElement | null>(null);

export function useTopbarSlot() {
  return useContext(TopbarSlotContext);
}
