import type { Route } from "next";
import Link from "next/link";

import { Cubes } from "./cubes";
import { GithubLogo } from "./github-logo";
import { Logo } from "./logo";
import { products } from "./products";

const GITHUB_URL = "https://github.com/foglamp/foglamp";
const DOCS_URL = "https://docs.foglamp.dev";

type FooterLink = { label: string; href: string; external?: boolean };

const productLinks: FooterLink[] = products.map((p) => ({
  label: p.label,
  href: p.href,
}));

const resourceLinks: FooterLink[] = [
  { label: "Pricing", href: "/pricing" },
  { label: "Docs", href: DOCS_URL, external: true },
  { label: "GitHub", href: GITHUB_URL, external: true },
];

const headingClassName = "text-sm font-medium tracking-wide text-foreground";

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
    <footer className="bg-card/50 dark:shadow-(--custom-shadow)">
      <div className="mx-auto max-w-7xl px-5 py-16 pb-12 sm:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.5fr_1.5fr_1fr]">
          <div className="flex flex-col gap-4">
            <Logo />
            <p className="max-w-xs text-sm text-muted-foreground">
              The missing observability layer for AI agents.
            </p>
            <a
              href={GITHUB_URL}
              aria-label="Foglamp on GitHub"
              className="text-muted-foreground transition-colors hover:text-foreground mt-2"
            >
              <GithubLogo className="size-4" />
            </a>
          </div>

          <div className="flex flex-col gap-3">
            <h3 className={headingClassName}>Product</h3>
            <ul className="grid grid-flow-col grid-rows-3 gap-x-8 gap-y-2.5">
              {productLinks.map((link) => (
                <li key={link.label}>
                  <FooterAnchor link={link} />
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-3">
            <h3 className={headingClassName}>Resources</h3>
            <ul className="flex flex-col gap-2.5">
              {resourceLinks.map((link) => (
                <li key={link.label}>
                  <FooterAnchor link={link} />
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12 flex items-center gap-4">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Foglamp
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
      </div>

      {/* Decorative cube field on the footer floor. The grid renders as a
          full-width square; the .cubes-band wrapper clips it to its top ~20%,
          so the cubes read as rising out of the footer surface. */}
      <div className="cubes-band" aria-hidden>
        <Cubes
          className="cubes-band__grid"
          gridSize={14}
          maxAngle={45}
          cellGap={0}
          autoAnimate
          borderStyle="1px solid var(--muted)"
          faceColor="#131313"
          rippleOnClick={false}
        />
      </div>
    </footer>
  );
}
