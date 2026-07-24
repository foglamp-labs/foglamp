import "@foglamp/env/web";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  reactCompiler: true,
  experimental: {
    // Serve recently-visited routes from the client router cache so tab
    // switches swap in one paint instead of round-tripping to the server
    // (the Next 15 default keeps dynamic segments for 0s). Page content is
    // all client-side tRPC anyway, and those queries revalidate on mount.
    staleTimes: { dynamic: 30 },
  },
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
