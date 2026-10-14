"use client";

import { createPortal } from "react-dom";
import { QrCode } from "@/components/ui/qr-code";

/**
 * A4 sheet for one freshly issued QR. It lives as a direct child of <body> and is `display: none` on screen; the
 * print stylesheet (qr.css) shows only this sheet while `html[data-print-qr]` is set by the Print button, so a
 * plain Ctrl+P on any other page is never affected. It exists only while the one-time token is in memory.
 */
export function QrPrintSheet({ buildingName, label, url }: { buildingName: string; label: string | null; url: string }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="qr-print-root" data-testid="qr-print-sheet" aria-hidden="true">
      <article className="qr-sheet">
        <p className="qr-sheet-kicker">FET3D · Tập huấn sơ tán</p>
        <h1>{buildingName}</h1>
        {label && <p className="qr-sheet-label">{label}</p>}
        <QrCode className="qr-sheet-code" value={url} size={340} label={`Mã QR của ${buildingName}`} />
        <h2>Quét mã bằng ứng dụng FET3D</h2>
        <ol>
          <li>Cài ứng dụng FET3D trên Android (chỉ cần một lần).</li>
          <li>Đăng nhập, rồi quét mã QR này trong ứng dụng.</li>
          <li>Chọn bài tập huấn đã được tổ chức phát hành.</li>
        </ol>
        <p className="qr-sheet-note">Mã QR chỉ xác định công trình, không cấp quyền truy cập. Công trình Riêng tư cần thêm mã tham gia do tổ chức cung cấp.</p>
      </article>
    </div>,
    document.body,
  );
}
