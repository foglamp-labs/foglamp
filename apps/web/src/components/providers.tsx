"use client";

import { Toaster } from "@foglamp/ui/components/sonner";
import { QueryClientProvider } from "@tanstack/react-query";

import { queryClient } from "@/utils/trpc";

import { PostHogProvider } from "./posthog-provider";
import { ThemeProvider } from "./theme-provider";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
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
