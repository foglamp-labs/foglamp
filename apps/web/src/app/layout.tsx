import type { Metadata } from "next";
import { Geist_Mono, Host_Grotesk, Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";

import Providers from "@/components/providers";
import { cn } from "@foglamp/ui/lib/utils";
import "../index.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

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
  title: {
    default: "Foglamp — Observability for the Vercel AI SDK",
    template: "%s · Foglamp",
  },
  description:
    "The missing observability layer for the Vercel AI SDK. Costs, latency, tokens, distributed traces, evals, and alerts for every generateText / streamText call — in two lines.",
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
          "antialiased",
        )}
      >
        <Providers>{children}</Providers>
        <Analytics />
      </body>
    </html>
  );
}
