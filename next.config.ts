import type { NextConfig } from "next";

// Local-only: the API allows browser calls from the deployed origin only, so to try the app against a real
// API from localhost set FET3D_DEV_API_PROXY=https://api.example (and NEXT_PUBLIC_API_BASE_URL empty).
// Requests to /api/* are then forwarded server-side. Unset in production, so nothing changes there.
const devApiProxy = process.env.FET3D_DEV_API_PROXY?.replace(/\/+$/, "");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    const staticAsset = [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }];
    return [
      // Public files are not fingerprinted by Next: a day of browser cache plus a week of background revalidation.
      { source: "/assets/:path*", headers: staticAsset },
      { source: "/brand/:path*", headers: staticAsset },
      { source: "/icons/:path*", headers: staticAsset },
      { source: "/ifc/:path*", headers: staticAsset },
      // Landing character models (~6 MB, not fingerprinted): keep them cached so a return visit does not download them again.
      { source: "/models/:path*", headers: staticAsset },
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      // The Building QR landing URL carries the QR token: keep it out of Referer headers, search indexes and caches.
      // Listed last so its Referrer-Policy overrides the site-wide one above.
      {
        source: "/qr/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
    ];
  },
  async rewrites() {
    return devApiProxy ? [{ source: "/api/:path*", destination: `${devApiProxy}/api/:path*` }] : [];
  },
};

export default nextConfig;
