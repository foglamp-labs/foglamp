import { IconBrandGithub } from "@tabler/icons-react";
import type { Route } from "next";
import Link from "next/link";

import { ThemeSwitcher } from "@/components/theme-switcher";

import { products } from "./products";
import { Wordmark } from "./wordmark";

const GITHUB_URL = "https://github.com/foglamp/foglamp";
const DOCS_URL = "https://docs.foglamp.dev";

type FooterLink = { label: string; href: string; external?: boolean };

const columns: { heading: string; links: FooterLink[] }[] = [
  {
    heading: "Product",
    links: products.map((p) => ({ label: p.label, href: p.href })),
  },
  {
    heading: "Resources",
    links: [
      { label: "Pricing", href: "/pricing" },
      { label: "Docs", href: DOCS_URL, external: true },
      { label: "GitHub", href: GITHUB_URL, external: true },
    ],
  },
  {
    heading: "Get started",
    links: [
      { label: "Log in", href: "/login" },
      { label: "Start monitoring", href: "/login" },
    ],
  },
];

function FooterAnchor({ link }: { link: FooterLink }) {
  const className =
    "text-sm text-muted-foreground transition-colors hover:text-foreground";
  if (link.external) {
    return (
      <a href={link.href} className={className}>
        {link.label}
      </a>
    );
  }
  return (
    <Link href={link.href as Route} className={className}>
      {link.label}
    </Link>
  );
}

export function MarketingFooter() {
  return (
    <footer className="relative mt-24">
      <div className="shadow-[0_1px_0_0_var(--border)_inset]">
        <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
            <div className="flex flex-col gap-4">
              <Wordmark />
              <p className="max-w-xs text-sm text-muted-foreground">
                The missing observability layer for the Vercel AI SDK.
              </p>
              <a
                href={GITHUB_URL}
                aria-label="Foglamp on GitHub"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                <IconBrandGithub className="size-5" />
              </a>
            </div>

            {columns.map((column) => (
              <div key={column.heading} className="flex flex-col gap-3">
                <h3 className="text-xs font-medium tracking-wide text-foreground/70 uppercase">
                  {column.heading}
                </h3>
                <ul className="flex flex-col gap-2.5">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      <FooterAnchor link={link} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-12 flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="flex items-center gap-4">
              <p className="text-xs text-muted-foreground">
                © {new Date().getFullYear()} Foglamp. All rights reserved.
              </p>
              <Link
                href="/privacy"
                className="text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                Privacy
              </Link>
              <Link
                href="/terms"
                className="text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                Terms
              </Link>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">Theme</span>
              <ThemeSwitcher />
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
