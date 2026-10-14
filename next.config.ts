import type { NextConfig } from "next";

// Local-only: the API allows browser calls from the deployed origin only, so to try the app against a real
// API from localhost set FET3D_DEV_API_PROXY=https://api.example (and NEXT_PUBLIC_API_BASE_URL empty).
// Requests to /api/* are then forwarded server-side. Unset in production, so nothing changes there.
const devApiProxy = process.env.FET3D_DEV_API_PROXY?.replace(/\/+$/, "");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The Building QR landing URL carries the QR token: keep it out of Referer headers, search indexes and caches.
  async headers() {
    return [{
      source: "/qr/:path*",
      headers: [
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        { key: "Cache-Control", value: "no-store" },
      ],
    }];
  },
  async rewrites() {
    return devApiProxy ? [{ source: "/api/:path*", destination: `${devApiProxy}/api/:path*` }] : [];
  },
};

export default nextConfig;
