"use client";

import { Button } from "@foglamp/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@foglamp/ui/components/dropdown-menu";
import { cn } from "@foglamp/ui/lib/utils";
import { IconChevronDown } from "@tabler/icons-react";
import Link from "next/link";

import { authClient } from "@/lib/auth-client";

import { products } from "./products";
import { Wordmark } from "./wordmark";

const DOCS_URL = "https://docs.foglamp.dev";

function ProductsMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="sm" className="text-muted-foreground" />
        }
      >
        Product
        <IconChevronDown className="opacity-50 transition-transform group-aria-expanded/button:rotate-180" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={10} className="w-80 p-1.5">
        {products.map((product) => {
          const Icon = product.icon;
          return (
            <DropdownMenuItem
              key={product.slug}
              render={<Link href={product.href} />}
              className="items-start gap-3 py-2"
            >
              <span className={cn("mt-0.5 shrink-0", product.chipClassName)}>
                <Icon className="size-4" />
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="font-medium">{product.label}</span>
                <span className="text-xs text-muted-foreground">
                  {product.tagline}
                </span>
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function MarketingNavbar() {
  // Swap the CTA for logged-in visitors. The marketing pages are public, so a
  // signed-in user landing here (e.g. via /homepage) gets a "Dashboard" link
  // instead of "Start monitoring".
  const { data: session } = authClient.useSession();
  const loggedIn = Boolean(session?.user);

  return (
    <header className="sticky top-0 z-50 bg-background/70 backdrop-blur-md shadow-[0_1px_0_0_var(--border)]">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-5 sm:px-8">
        <Link href="/" aria-label="Foglamp home" className="flex items-center">
          <Wordmark priority />
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          <ProductsMenu />
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            render={<Link href="/pricing" />}
          >
            Pricing
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            render={<a href={DOCS_URL}>Docs</a>}
          >
            Docs
          </Button>
        </nav>

        <div className="flex items-center gap-2">
          {loggedIn ? (
            <Button size="sm" render={<Link href="/overview" />}>
              Dashboard
            </Button>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                render={<Link href="/login" />}
                className="hidden sm:inline-flex"
              >
                Log in
              </Button>
              <Button size="sm" render={<Link href="/login" />}>
                Start monitoring
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
