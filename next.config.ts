import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin the workspace root to this project. A stray package-lock.json in a parent
  // directory otherwise makes Next infer the wrong root.
  outputFileTracingRoot: path.join(__dirname),
  experimental: {
    // Field delivery photos are downscaled client-side to ~150–300KB, but allow
    // headroom for the multipart server action that carries them.
    serverActions: { bodySizeLimit: "4mb" },
  },
  async headers() {
    return [
      {
        // Always serve the service worker fresh so clients pick up new versions.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
