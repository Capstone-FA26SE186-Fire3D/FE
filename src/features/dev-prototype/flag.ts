/**
 * Prototype screens (sample data, simulated backends) exist only outside production builds.
 * Call sites that must disappear from the production bundle should still write the literal
 * `process.env.NODE_ENV !== "production"` (the bundler inlines it and removes the dead branch);
 * this helper is for runtime checks that merely hide UI.
 */
export function isPrototypeEnabled(): boolean {
  return process.env.NODE_ENV !== "production";
}
