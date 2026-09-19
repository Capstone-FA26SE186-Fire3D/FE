import type { TokenSet } from "./types";

const tokenKey = "fire3d-auth-tokens";

function isTokenSet(value: unknown): value is TokenSet {
  return typeof value === "object" && value !== null
    && typeof (value as TokenSet).accessToken === "string"
    && typeof (value as TokenSet).refreshToken === "string";
}

export function readTokenSet(): TokenSet | null {
  try {
    const raw = window.sessionStorage.getItem(tokenKey);
    if (!raw) return null;
    const value = JSON.parse(raw) as unknown;
    return isTokenSet(value) ? value : null;
  } catch {
    return null;
  }
}

export function writeTokenSet(tokens: TokenSet): boolean {
  try {
    window.sessionStorage.setItem(tokenKey, JSON.stringify(tokens));
    return true;
  } catch {
    return false;
  }
}

export function clearTokenSet(): boolean {
  try {
    window.sessionStorage.removeItem(tokenKey);
    return true;
  } catch {
    return false;
  }
}
