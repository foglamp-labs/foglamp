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
  // The scan product used to live at /poster. /openapi.json gives agents a
  // predictable, name-guessable URL for the API spec (canonical copy lives on
  // the docs site so it can't drift from the API reference).
  redirects: async () => [
    { source: "/poster", destination: "/scan", permanent: true },
    { source: "/poster/:slug*", destination: "/scan/:slug*", permanent: true },
    {
      source: "/openapi.json",
      destination: "https://docs.foglamp.dev/api-reference/openapi.json",
      permanent: false,
    },
  ],
  // The marketing pages are content-negotiated (HTML ⇄ text/markdown, see
  // proxy.ts). Their HTML variant must also carry `Vary: Accept` so shared
  // caches never hand the HTML to an agent that asked for markdown (or vice
  // versa). Set here because Next replaces Vary values set from the proxy on
  // page responses; the router merges this one into its own Vary list.
  headers: async () => [
    {
      source:
        "/(|homepage|pricing|about|privacy|terms|features/cost-intelligence|features/evals|features/alerts|features/agents|features/distributed-traces|features/sdk)",
      headers: [{ key: "Vary", value: "Accept" }],
    },
  ],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "**" },
    ],
  },
};

export default nextConfig;
