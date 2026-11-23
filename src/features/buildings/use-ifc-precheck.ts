"use client";

import { useEffect, useState } from "react";
import { precheckIfcFile, type IfcPrecheckResult } from "./ifc-precheck";

export type IfcPrecheckState =
  | { phase: "idle" }
  | { phase: "checking"; fraction: number }
  | { phase: "done"; result: IfcPrecheckResult }
  /** The browser could not read the file (removed, permission): the server checks still apply, so this does not block. */
  | { phase: "unreadable" };

/** Runs the in-browser IFC check each time another file is chosen; an older run is aborted. */
export function useIfcPrecheck(file: File | null): IfcPrecheckState {
  const [state, setState] = useState<{ file: File | null; value: IfcPrecheckState }>({ file: null, value: { phase: "idle" } });

  useEffect(() => {
    if (!file) return;
    const abort = new AbortController();
    let lastShown = 0;
    precheckIfcFile(file, {
      signal: abort.signal,
      onProgress: (fraction) => {
        // A large file reports thousands of chunks; repaint at most every 2 %.
        if (fraction - lastShown < 0.02 && fraction < 1) return;
        lastShown = fraction;
        if (!abort.signal.aborted) setState({ file, value: { phase: "checking", fraction } });
      },
    }).then(
      (result) => { if (!abort.signal.aborted) setState({ file, value: { phase: "done", result } }); },
      () => { if (!abort.signal.aborted) setState({ file, value: { phase: "unreadable" } }); },
    );
    return () => abort.abort();
  }, [file]);

  if (!file) return { phase: "idle" };
  // Until the first report for this file arrives the check is running; an older file's result is never shown.
  return state.file === file ? state.value : { phase: "checking", fraction: 0 };
}
