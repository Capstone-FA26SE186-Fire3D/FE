import type { NextConfig } from "next";

// Local-only: the API allows browser calls from the deployed origin only, so to try the app against a real
// API from localhost set FET3D_DEV_API_PROXY=https://api.example (and NEXT_PUBLIC_API_BASE_URL empty).
// Requests to /api/* are then forwarded server-side. Unset in production, so nothing changes there.
const devApiProxy = process.env.FET3D_DEV_API_PROXY?.replace(/\/+$/, "");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async rewrites() {
    return devApiProxy ? [{ source: "/api/:path*", destination: `${devApiProxy}/api/:path*` }] : [];
  },
};

export default nextConfig;
