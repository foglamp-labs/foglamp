"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import * as React from "react";

// React 19 (dev only) warns "Encountered a script tag while rendering React
// component" for next-themes' inline no-flash <script>. It's a false positive
// here — the script runs during SSR, exactly as intended — and next-themes is
// unmaintained (pacocoursey/next-themes#387), so we drop that one message.
// Module scope so it patches before the provider's first render; prod builds
// strip the whole branch.
if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
  const original = console.error;
  console.error = (...args: unknown[]) => {
    if (
      typeof args[0] === "string" &&
      args[0].startsWith("Encountered a script tag while rendering")
    ) {
      return;
    }
    original(...args);
  };
}

export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
