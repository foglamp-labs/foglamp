import "@foglamp/env/web";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  reactCompiler: true,
  // The scan product used to live at /poster.
  redirects: async () => [
    { source: "/poster", destination: "/scan", permanent: true },
    { source: "/poster/:slug*", destination: "/scan/:slug*", permanent: true },
  ],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "**" },
    ],
  },
};

export default nextConfig;
