"use client";

import dynamic from "next/dynamic";

// The whole dashboard replica is ~50–80kB and renders SSR-fragile charts, so we
// lazy-load it client-only behind a same-size skeleton. It anchors the hero's
// right side and deliberately bleeds off the right edge of the screen (the
// width + clipping is owned by <Hero>); here we only fill whatever box we're
// given. The skeleton reserves the frame's 660px so the page doesn't jump.
const DashboardDemo = dynamic(
  () => import("@/components/marketing/demo").then((m) => m.DashboardDemo),
  {
    ssr: false,
    loading: () => <DemoSkeleton />,
  },
);

function DemoSkeleton() {
  return (
    <div className="flex h-[660px] w-full overflow-hidden rounded-3xl corner-squircle bg-sidebar shadow-[0_1px_0_0_var(--border),0_24px_60px_-24px_rgba(0,0,0,0.35)]">
      <div className="hidden w-56 shrink-0 flex-col gap-2 p-3 md:flex">
        <div className="mb-2 h-8 animate-pulse rounded-xl corner-squircle bg-foreground/5" />
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="h-8 animate-pulse rounded-xl corner-squircle bg-foreground/5" />
        ))}
      </div>
      <div className="m-2 ml-0 flex-1 rounded-3xl corner-squircle bg-background p-8 shadow-(--custom-shadow) max-md:ml-2">
        <div className="mb-6 h-8 w-48 animate-pulse rounded-xl corner-squircle bg-foreground/5" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl corner-squircle bg-foreground/5" />
          ))}
        </div>
        <div className="mt-6 h-64 animate-pulse rounded-3xl corner-squircle bg-foreground/5" />
      </div>
    </div>
  );
}

export function HeroDemo() {
  return <DashboardDemo />;
}
