// Isolated browser fixture: no changes to the production Firebase integration.
export const destinations: string[] = [];
const router = { replace: (path: string) => destinations.push(path) };
export function useRouter() { return router; }
export function useSearchParams() { return new URLSearchParams(window.location.search); }
