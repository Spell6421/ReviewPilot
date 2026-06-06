import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow the cloudflared tunnel host to reach dev-only resources (HMR, etc.).
  // Dev-only; has no effect on production builds.
  allowedDevOrigins: ["dev.backbooked.com"],
};

export default nextConfig;
