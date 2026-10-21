/**
 * Landscape phone: the device is modelled landscape (never a rotated portrait shell), the screen texture is rendered
 * at exactly the screen's aspect ratio, and the device is sized from the viewport so it is never cropped or stretched.
 */

export const DEVICE = { width: 3.42, height: 1.68, screenWidth: 3.29, screenHeight: 1.58, cornerRadius: 0.2 } as const;
export const SCREEN_ASPECT = DEVICE.screenWidth / DEVICE.screenHeight;

export type PhoneBox = { x: number; y: number; width: number; height: number };

/** Pixel box (top-left origin) for the device in a viewport, between a top and bottom inset. */
export function fitPhone(viewportWidth: number, viewportHeight: number, opts: { margin?: number; maxWidth?: number; top?: number; bottom?: number; align?: "center" | "right" } = {}): PhoneBox {
  const margin = opts.margin ?? 16, top = opts.top ?? margin, bottom = opts.bottom ?? margin;
  const maxWidth = opts.maxWidth ?? 760;
  const availableWidth = Math.max(1, viewportWidth - margin * 2);
  const availableHeight = Math.max(1, viewportHeight - top - bottom);
  const ratio = DEVICE.height / DEVICE.width;
  const width = Math.max(1, Math.min(maxWidth, availableWidth, availableHeight / ratio));
  const height = width * ratio;
  const x = opts.align === "right" ? viewportWidth - margin - width : (viewportWidth - width) / 2;
  return { x, y: top + (availableHeight - height) / 2, width, height };
}

/** Render-target size whose aspect matches the screen exactly. */
export function phoneTargetSize(longEdge: number): { width: number; height: number } {
  const width = Math.max(2, Math.round(longEdge / 2) * 2);
  return { width, height: Math.max(2, Math.round(width / SCREEN_ASPECT / 2) * 2) };
}
