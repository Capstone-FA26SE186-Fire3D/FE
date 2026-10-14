"use client";

import QRCode from "qrcode";
import { useMemo } from "react";

const QUIET_ZONE = 4;

/**
 * Scannable QR code rendered as an inline SVG (no dangerouslySetInnerHTML, no network). Always dark-on-white with a
 * quiet zone so it scans in both themes. `value` must be an opaque string (a deep link or one-time code): never put
 * credentials, packages or business permissions in it.
 */
export function QrCode({ value, size = 192, label, className }: { value: string; size?: number; label: string; className?: string }) {
  const model = useMemo(() => {
    try {
      const qr = QRCode.create(value, { errorCorrectionLevel: "M" });
      return { count: qr.modules.size, data: qr.modules.data };
    } catch {
      return null;
    }
  }, [value]);

  if (!model) return <p role="alert">Không tạo được mã QR từ giá trị này.</p>;

  const total = model.count + QUIET_ZONE * 2;
  let path = "";
  for (let row = 0; row < model.count; row += 1) {
    for (let column = 0; column < model.count; column += 1) {
      if (model.data[row * model.count + column]) path += `M${column + QUIET_ZONE} ${row + QUIET_ZONE}h1v1h-1z`;
    }
  }

  return <svg
    role="img"
    aria-label={label}
    className={className}
    width={size}
    height={size}
    viewBox={`0 0 ${total} ${total}`}
    shapeRendering="crispEdges"
    data-testid="qr-code"
    data-qr-value-length={value.length}
  >
    <rect width={total} height={total} fill="#fff" />
    <path d={path} fill="#000" />
  </svg>;
}
