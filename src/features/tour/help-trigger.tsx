"use client";

import { CircleHelp } from "lucide-react";
import { useTour } from "./tour-provider";

/** Topbar "?" (Organization only): restarts the spotlight tour at any time. */
export function HelpTrigger() {
  const { start } = useTour();
  return <button type="button" className="ops-icon-button" aria-label="Xem hướng dẫn" title="Xem hướng dẫn" onClick={start} data-testid="help-trigger"><CircleHelp size={18} aria-hidden="true" /></button>;
}
