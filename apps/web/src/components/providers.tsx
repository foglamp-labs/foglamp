"use client";

import { Toaster } from "@foglamp/ui/components/sonner";
import { QueryClientProvider } from "@tanstack/react-query";
import { usePathname } from "next/navigation";

import { queryClient } from "@/utils/trpc";

import { PostHogProvider } from "./posthog-provider";
import { ThemeProvider } from "./theme-provider";

// The marketing site (landing, pricing, features, legal) is dark-only — it has
// no theme toggle. Forcing it here keeps a single next-themes provider: nesting
// a second one is a no-op, and forcedTheme is applied by next-themes' own
// pre-hydration script (so there's no flash) and document-wide on <html> (so
// CSS tokens, chart vars, and overscroll all read dark). App and auth routes
// pass no forced theme and stay user-switchable.
const MARKETING_PATHS = new Set([
  "/",
  "/homepage",
  "/pricing",
  "/privacy",
  "/terms",
  // The poster LANDING page only — exact match, so /poster/[slug] (which has
  // its own theme toggle) stays user-switchable.
  "/poster",
]);

function isMarketingPath(pathname: string): boolean {
  return MARKETING_PATHS.has(pathname) || pathname.startsWith("/features");
}

export default function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const forcedTheme = isMarketingPath(pathname) ? "dark" : undefined;

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
      forcedTheme={forcedTheme}
    >
      <PostHogProvider>
        <QueryClientProvider client={queryClient}>
          {children}
          {/* <ReactQueryDevtools /> */}
        </QueryClientProvider>
        <Toaster />
      </PostHogProvider>
    </ThemeProvider>
  );
}
