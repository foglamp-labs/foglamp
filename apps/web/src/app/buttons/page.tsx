"use client";

import { useEffect } from "react";
import {
  IconArrowRight,
  IconBell,
  IconBellFilled,
  IconBolt,
  IconBoltFilled,
  IconBookmark,
  IconBookmarkFilled,
  IconCamera,
  IconCircleCheckFilled,
  IconClock,
  IconCloud,
  IconCloudFilled,
  IconDownload,
  IconEyeFilled,
  IconFlag,
  IconFlagFilled,
  IconFolder,
  IconFolderFilled,
  IconHeart,
  IconHeartFilled,
  IconHome,
  IconHomeFilled,
  IconMail,
  IconMapPin,
  IconMapPinFilled,
  IconMoon,
  IconMoonFilled,
  IconPlayerPlayFilled,
  IconPlus,
  IconRocket,
  IconSettings,
  IconSettingsFilled,
  IconSparkles,
  IconStar,
  IconStarFilled,
  IconSun,
  IconSunFilled,
  IconThumbUp,
  IconThumbUpFilled,
  IconTrash,
  IconTrashFilled,
} from "@tabler/icons-react";
import { useTheme } from "next-themes";

import { Badge } from "@foglamp/ui/components/badge";
import { Button } from "@foglamp/ui/components/button";

// Dev-only playground for tweaking packages/ui button + badge styles.
// Press T anywhere on the page to flip light/dark.

const OUTLINED = [
  IconStar,
  IconHeart,
  IconPlus,
  IconArrowRight,
  IconDownload,
  IconSettings,
  IconTrash,
  IconBolt,
  IconBell,
  IconBookmark,
  IconCamera,
  IconClock,
  IconCloud,
  IconFlag,
  IconFolder,
  IconHome,
  IconMail,
  IconMapPin,
  IconMoon,
  IconSun,
  IconRocket,
  IconSparkles,
  IconThumbUp,
];

const FILLED = [
  IconStarFilled,
  IconHeartFilled,
  IconBellFilled,
  IconBookmarkFilled,
  IconBoltFilled,
  IconCircleCheckFilled,
  IconTrashFilled,
  IconSettingsFilled,
  IconPlayerPlayFilled,
  IconFlagFilled,
  IconFolderFilled,
  IconHomeFilled,
  IconMoonFilled,
  IconSunFilled,
  IconCloudFilled,
  IconMapPinFilled,
  IconEyeFilled,
  IconThumbUpFilled,
];

// Deterministic "random" assignment so server and client render the same
// markup (Math.random would break hydration). Each slot index gets a varied
// icon, alternates filled/outlined, and flips between leading/trailing.
function pick(i: number) {
  const filled = i % 2 === 1;
  const pool = filled ? FILLED : OUTLINED;
  const Icon = pool[(i * 7 + 3) % pool.length]!;
  const leading = i % 3 !== 1;
  return { Icon, leading };
}

const BUTTON_VARIANTS = [
  "default",
  "outline",
  "secondary",
  "ghost",
  "ghost-destructive",
  "destructive",
  "link",
] as const;

const BUTTON_SIZES = ["xs", "sm", "default", "lg"] as const;

const BADGE_VARIANTS = [
  "default",
  "secondary",
  "destructive",
  "green",
  "blue",
  "amber",
  "orange",
  "emerald",
  "rose",
  "violet",
  "outline",
] as const;

const BADGE_SIZES = ["md", "lg"] as const;

function useThemeHotkey() {
  const { resolvedTheme, setTheme } = useTheme();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "t" || e.metaKey || e.ctrlKey || e.altKey)
        return;
      const target = e.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
      )
        return;
      setTheme(resolvedTheme === "dark" ? "light" : "dark");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [resolvedTheme, setTheme]);
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-36 shrink-0 font-mono text-xs text-muted-foreground">
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

export default function ButtonsPage() {
  useThemeHotkey();

  // Monotonic slot counter across the whole page so no two adjacent
  // buttons/badges draw the same icon.
  let slot = 0;

  return (
    <main className="mx-auto max-w-4xl space-y-12 px-6 py-12">
      <div>
        <h1 className="text-lg font-semibold">Buttons & badges playground</h1>
        <p className="text-sm text-muted-foreground">
          Press <kbd className="rounded border px-1 font-mono text-xs">T</kbd>{" "}
          to toggle the theme
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground">Buttons</h2>
        <div className="space-y-3">
          {BUTTON_VARIANTS.map((variant) => (
            <Row key={variant} label={variant}>
              {BUTTON_SIZES.map((size) => {
                const { Icon, leading } = pick(slot++);
                return (
                  <Button key={size} variant={variant} size={size}>
                    {leading && <Icon />}
                    Button
                    {!leading && <Icon />}
                  </Button>
                );
              })}
            </Row>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground">Badges</h2>
        <div className="space-y-3">
          {BADGE_VARIANTS.map((variant) => (
            <Row key={variant} label={variant}>
              {BADGE_SIZES.map((size) => {
                const { Icon, leading } = pick(slot++);
                return (
                  <Badge key={size} variant={variant} size={size}>
                    {leading && <Icon />}
                    Badge
                    {!leading && <Icon />}
                  </Badge>
                );
              })}
            </Row>
          ))}
        </div>
      </section>
    </main>
  );
}
