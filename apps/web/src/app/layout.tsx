import type { Metadata } from "next";
import { Geist_Mono, Host_Grotesk } from "next/font/google";
import localFont from "next/font/local";
import { Analytics } from "@vercel/analytics/next";

import Providers from "@/components/providers";
import { SITE_URL } from "@/lib/links";
import { cn } from "@foglamp/ui/lib/utils";
import "../index.css";

// Self-hosted Inter from the canonical source (github.com/rsms/inter), not
// Google Fonts. Google serves an older, feature-stripped build; this is the
// real InterVariable (weight 100–900 + the `opsz` optical-size axis) with all
// OpenType character variants intact. Update by dropping new .woff2 files from
// an rsms/inter release into ./fonts.
const inter = localFont({
  src: [
    { path: "./fonts/InterVariable.woff2", style: "normal" },
    { path: "./fonts/InterVariable-Italic.woff2", style: "italic" },
  ],
  variable: "--font-sans",
  display: "swap",
  weight: "100 900",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Display face for marketing headings only (applied via the `font-display`
// utility defined in index.css). The app dashboard keeps Inter for everything.
const hostGrotesk = Host_Grotesk({
  variable: "--font-host-grotesk",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // Absolute base for OG/Twitter image URLs and relative `alternates.canonical`
  // values. Override in prod via NEXT_PUBLIC_SITE_URL (see SITE_URL in links.ts).
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Foglamp - Observability for AI agents",
    template: "%s - Foglamp",
  },
  description:
    "The missing observability layer for AI agents built on the Vercel AI SDK. Costs, latency, tokens, distributed traces, evals, and alerts for every generateText / streamText call — in two lines.",
  // Swap in a visually distinct favicon during local development so dev tabs
  // are unmistakable. NODE_ENV is "development" under `next dev` and
  // "production" for builds/deploys, so no extra env config is needed.
  icons: {
    icon:
      process.env.NODE_ENV === "development"
        ? "/favicon-dev.ico"
        : "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("font-sans", inter.variable)}
    >
      {/* The viewport-height shell that used to wrap everything here now lives
          inside (app)/layout via <AppShell> (SidebarProvider is h-svh). Marketing
          pages, login, and pricing manage their own document flow. */}
      <body
        className={cn(
          inter.variable,
          geistMono.variable,
          hostGrotesk.variable,
          "antialiased"
        )}
      >
        <Providers>{children}</Providers>
        <Analytics />
      </body>
    </html>
  );
}
