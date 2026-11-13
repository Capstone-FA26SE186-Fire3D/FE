"use client";

import { useEffect, useRef } from "react";

/**
 * The current access token without re-running effects when it is renewed. AuthSessionProvider replaces the token string
 * on every silent renewal (about hourly) and when another tab adopts a session; an effect that depends on the string itself
 * reloads its data and resets its state as if the page had just opened. Effects depend on `hasToken` and read
 * `tokenRef.current` when they run, so requests use the newest token and a renewal re-runs nothing.
 * Call this before the effects that read the ref (effects run in declaration order).
 */
export function useTokenRef(accessToken: string | null) {
  const tokenRef = useRef(accessToken);
  useEffect(() => {
    tokenRef.current = accessToken;
  });
  return { tokenRef, hasToken: Boolean(accessToken) };
}
