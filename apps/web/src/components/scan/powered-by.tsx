import Link from "next/link";

import { BrandMark } from "@/components/marketing/brand-mark";

// Small attribution pill at the top of the scan sidebar (where the
// personality card used to live — that may come back later).
export function PoweredBy() {
  return (
    <Link
      href="/"
      className="flex w-fit items-center gap-2 rounded-full bg-card px-4 py-2.5 shadow-(--custom-shadow) transition-opacity hover:opacity-80"
      target="_blank"
    >
      <span className="text-xs text-muted-foreground">Powered by</span>
      <span className="flex items-center gap-1.5">
        <BrandMark className="h-2.5 w-auto" />
        <span className="font-display text-sm font-semibold tracking-tight select-none">
          Foglamp
        </span>
      </span>
    </Link>
  );
}
