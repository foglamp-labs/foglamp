"use client";

import { Button } from "@foglamp/ui/components/button";
import { Kbd } from "@foglamp/ui/components/kbd";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "@foglamp/ui/components/navigation-menu";
import { cn } from "@foglamp/ui/lib/utils";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { authClient } from "@/lib/auth-client";
import { GITHUB_URL } from "@/lib/links";

import { GithubLogo } from "./github-logo";
import { Logo } from "./logo";
import { products } from "./products";
import {
  IconChevronRight,
  IconChevronRightFilled,
  IconCircleChevronRightFilled,
} from "@tabler/icons-react";

const DOCS_URL = "https://docs.foglamp.dev";
const HUD_URL = "https://hud.foglamp.dev";

function ProductsMenu() {
  return (
    <NavigationMenuItem>
      <NavigationMenuTrigger className="text-muted-foreground">
        Product
      </NavigationMenuTrigger>
      <NavigationMenuContent>
        <ul className="grid w-80 gap-1 p-1.5">
          {products.map((product) => {
            const Icon = product.icon;
            return (
              <li key={product.slug}>
                <NavigationMenuLink
                  render={<Link href={product.href} />}
                  className="items-start gap-3 py-2"
                >
                  <span
                    className={cn("mt-0.5 shrink-0", product.chipClassName)}
                  >
                    <Icon className="size-4" />
                  </span>
                  <span className="flex flex-col gap-0.5">
                    <span className="font-medium">{product.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {product.tagline}
                    </span>
                  </span>
                </NavigationMenuLink>
              </li>
            );
          })}
        </ul>
      </NavigationMenuContent>
    </NavigationMenuItem>
  );
}

export function MarketingNavbar() {
  // Swap the CTA for logged-in visitors. The marketing pages are public, so a
  // signed-in user landing here (e.g. via /homepage) gets a "Dashboard" link
  // instead of "Start monitoring".
  const { data: session } = authClient.useSession();
  const loggedIn = Boolean(session?.user);
  const router = useRouter();

  // Press "L" to jump to login. Only active for logged-out visitors (the
  // "Start monitoring" CTA, which advertises the shortcut, is hidden once
  // signed in). Ignored while typing in a field so it never hijacks input.
  useEffect(() => {
    if (loggedIn) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "l" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (
        t?.isContentEditable ||
        t?.tagName === "INPUT" ||
        t?.tagName === "TEXTAREA" ||
        t?.tagName === "SELECT"
      )
        return;
      e.preventDefault();
      router.push("/login");
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [loggedIn, router]);

  return (
    <header className="sticky top-0 z-50 bg-background/70 backdrop-blur-sm border-b border-border/50">
      <div className="relative mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-5 sm:px-8">
        <Link
          href="/homepage"
          aria-label="Foglamp home"
          className="flex items-center hover:opacity-80 transition-opacity"
        >
          <Logo />
        </Link>

        <NavigationMenu className="absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 md:flex">
          <NavigationMenuList>
            {/* <ProductsMenu /> */}
            <NavigationMenuItem>
              <NavigationMenuLink
                className={cn(
                  navigationMenuTriggerStyle(),
                  "text-muted-foreground"
                )}
                render={<Link href="/pricing" />}
              >
                Pricing
              </NavigationMenuLink>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavigationMenuLink
                className={cn(
                  navigationMenuTriggerStyle(),
                  "text-muted-foreground"
                )}
                render={<a href={DOCS_URL} target="_blank" />}
              >
                Docs
              </NavigationMenuLink>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavigationMenuLink
                className={cn(
                  navigationMenuTriggerStyle(),
                  "text-muted-foreground"
                )}
                render={<a href={HUD_URL} target="_blank" />}
              >
                HUD
              </NavigationMenuLink>
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>

        <div className="flex items-center gap-2">
          {/* Open-source signal: the same GitHub link as the footer, sitting
              right next to the primary CTA. Icon-only to stay compact. */}
          <Button
            variant="ghost"
            aria-label="Foglamp on GitHub"
            className="size-7.5"
            render={
              <a href={GITHUB_URL} target="_blank" rel="noreferrer noopener" />
            }
          >
            <GithubLogo className="size-4.5" />
          </Button>
          {loggedIn ? (
            <Button render={<Link href="/overview" />} className="h-7.5">
              Dashboard
              <IconCircleChevronRightFilled className="size-4.5 ml-0.5 opacity-90" />
            </Button>
          ) : (
            <>
              <Button render={<Link href="/login" />} className="h-7.5">
                Start monitoring
                <IconCircleChevronRightFilled className="size-4.5 ml-0.5 opacity-90" />
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
