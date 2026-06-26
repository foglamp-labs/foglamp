import type { Route } from "next";
import Link from "next/link";

import { GITHUB_URL } from "@/lib/links";

import { Cubes } from "./cubes";
import { GithubLogo } from "./github-logo";
import { Logo } from "./logo";
import { products } from "./products";

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

/** Brazilian flag glyph for the "Made in Brazil" mark. Sized via `className`
 * (defaults handled by the caller); decorative, so the adjacent text labels it. */
function BrazilFlag({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      className={className}
      aria-hidden="true"
    >
      <rect x="1" y="4" width="30" height="24" rx="4" ry="4" fill="#459a45" />
      <path
        d="M27,4H5c-2.209,0-4,1.791-4,4V24c0,2.209,1.791,4,4,4H27c2.209,0,4-1.791,4-4V8c0-2.209-1.791-4-4-4Zm3,20c0,1.654-1.346,3-3,3H5c-1.654,0-3-1.346-3-3V8c0-1.654,1.346-3,3-3H27c1.654,0,3,1.346,3,3V24Z"
        opacity=".15"
      />
      <path d="M3.472,16l12.528,8,12.528-8-12.528-8L3.472,16Z" fill="#fedf00" />
      <circle cx="16" cy="16" r="5" fill="#0a2172" />
      <path
        d="M14,14.5c-.997,0-1.958,.149-2.873,.409-.078,.35-.126,.71-.127,1.083,.944-.315,1.951-.493,2.999-.493,2.524,0,4.816,.996,6.519,2.608,.152-.326,.276-.666,.356-1.026-1.844-1.604-4.245-2.583-6.875-2.583Z"
        fill="#fff"
      />
      <path
        d="M27,5H5c-1.657,0-3,1.343-3,3v1c0-1.657,1.343-3,3-3H27c1.657,0,3,1.343,3,3v-1c0-1.657-1.343-3-3-3Z"
        fill="#fff"
        opacity=".2"
      />
    </svg>
  );
}

export function MarketingFooter() {
  return (
    <footer className="relative isolate bg-card/50 dark:shadow-(--custom-shadow)">
      {/* Subtle film-grain texture over the footer. feTurbulence fills the
          filter region with noise, grayscale strips its color, and
          mix-blend-screen lets only the light specks ride on top. The filter
          region is pinned to the element box (x/y/width/height) — without it,
          SVG's default -10% region bleeds noise above the footer's top border. */}
      <figure
        aria-hidden
        className="absolute inset-0 -z-10 pointer-events-none opacity-10 mix-blend-screen filter-[url('#noise-footer-fx')_grayscale(100%)]"
      >
        <svg className="size-full">
          <filter id="noise-footer-fx" x="0%" y="0%" width="100%" height="100%">
            <feTurbulence baseFrequency="0.8" />
          </filter>
        </svg>
      </figure>
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
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            Made in
            <BrazilFlag className="size-4" />
          </span>
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
