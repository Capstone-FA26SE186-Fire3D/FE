/**
 * Scrolls to a section that may only mount after a tab switch (the tab panels load on demand), retrying for up to ~3 s,
 * then moves focus there.
 */
export function scrollToSection(id: string, attempt = 0) {
  const element = document.getElementById(id);
  if (!element) {
    if (attempt < 50) window.setTimeout(() => scrollToSection(id, attempt + 1), 60);
    return;
  }
  element.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  element.focus({ preventScroll: true });
}
