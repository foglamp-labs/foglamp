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
import {
  IconArrowBigRightFilled,
  IconChevronRight,
  IconChevronRightFilled,
  IconCircleChevronRightFilled,
  IconDirectionArrowsFilled,
  IconZoomScanFilled,
} from "@tabler/icons-react";

const DOCS_URL = "https://docs.foglamp.dev";

// The Product menu: each entry is a muted name over a one-line pitch, with
// the same icon its hero eyebrow uses.
const PRODUCT_ITEMS = [
  {
    href: "/scan" as const,
    name: "Scan",
    pitch: "Turn your repo into a shareable map",
    Icon: IconZoomScanFilled,
  },
  {
    href: "/hud" as const,
    name: "HUD",
    pitch: "Watch your agents while you build",
    Icon: IconDirectionArrowsFilled,
  },
] as const;

function ProductsMenu() {
  return (
    <NavigationMenuItem>
      <NavigationMenuTrigger className="text-muted-foreground">
        Product
      </NavigationMenuTrigger>
      <NavigationMenuContent>
        <ul className="grid w-72 gap-1 p-1.5">
          {PRODUCT_ITEMS.map((item) => (
            <li key={item.href}>
              <NavigationMenuLink
                render={<Link href={item.href} />}
                className="flex-col items-start gap-1 px-3 py-2.5"
              >
                <span className="flex items-center gap-1.5 font-medium">
                  <item.Icon className="size-3.5" />
                  {item.name}
                </span>
                <span className=" text-muted-foreground text-xs">
                  {item.pitch}
                </span>
              </NavigationMenuLink>
            </li>
          ))}
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
            <ProductsMenu />
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
          </NavigationMenuList>
        </NavigationMenu>

        <div className="flex items-center gap-4">
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
            </Button>
          ) : (
            <>
              <Button render={<Link href="/login" />} className="h-7.5">
                Start monitoring
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
