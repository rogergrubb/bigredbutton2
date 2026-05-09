import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Capacitor/Tauri builds use static export. Web (Vercel) ignores this and runs SSR.
  // Set BUILD_TARGET=mobile in env when wrapping with Capacitor; otherwise web SSR is used.
  ...(process.env.BUILD_TARGET === "mobile"
    ? {
        output: "export" as const,
        images: { unoptimized: true },
        trailingSlash: true,
      }
    : {}),
};

export default nextConfig;
