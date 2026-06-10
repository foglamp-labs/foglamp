import { Button } from "@foglamp/ui/components/button";
import { IconArrowRight } from "@tabler/icons-react";
import Link from "next/link";

import type { Product } from "../products";

// The top of every product page: the product's chip + label as an eyebrow, a
// big headline, a sub, two CTAs, and the page-owned hero visual beneath.
export function ProductHero({
  product,
  headline,
  sub,
  visual,
}: {
  product: Product;
  headline: string;
  sub: string;
  visual: React.ReactNode;
}) {
  const Icon = product.icon;
  return (
    <section className="relative overflow-hidden px-5 pt-20 pb-12 sm:px-8 sm:pt-28">
      <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
        <span className="inline-flex items-center gap-2 rounded-full bg-card px-3 py-1 text-sm font-medium shadow-(--custom-shadow)">
          <span className={product.chipClassName}>
            <Icon className="size-4" />
          </span>
          {product.label}
        </span>
        <h1 className="font-display mt-6 max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
          {headline}
        </h1>
        <p className="mt-5 max-w-xl text-lg text-muted-foreground text-pretty">
          {sub}
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button size="lg" render={<Link href="/login" />}>
            Start free
            <IconArrowRight className="size-4" />
          </Button>
          <Button size="lg" variant="outline" render={<Link href="/pricing" />}>
            See pricing
          </Button>
        </div>
      </div>

      {visual && <div className="mx-auto mt-14 w-full max-w-4xl">{visual}</div>}
    </section>
  );
}
