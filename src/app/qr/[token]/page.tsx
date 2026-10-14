import type { Metadata } from "next";
import { QrLandingShell } from "@/features/qr-landing/components/qr-landing-shell";

// The URL carries the QR token: never index it and never send it in a Referer (also set as headers in next.config.ts).
export const metadata: Metadata = {
  title: "Công trình từ mã QR",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default async function QrLandingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <QrLandingShell token={token} />;
}
