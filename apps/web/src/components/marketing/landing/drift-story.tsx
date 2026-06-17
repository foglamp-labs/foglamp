"use client";

import {
  IconBrandWhatsapp,
  IconBrandX,
  type IconProps,
} from "@tabler/icons-react";
import { type MotionProps, motion, useReducedMotion } from "motion/react";
import type { ComponentType } from "react";

import { cn } from "@foglamp/ui/lib/utils";

// Slack's official multicolor mark. The other channels use monochrome glyphs on
// brand-colored chips, so this one rides a white chip instead (see PINGS).
function IconSlackColor({ size = 24 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 2447.6 2452.5"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <g clipRule="evenodd" fillRule="evenodd">
        <path
          d="m897.4 0c-135.3.1-244.8 109.9-244.7 245.2-.1 135.3 109.5 245.1 244.8 245.2h244.8v-245.1c.1-135.3-109.5-245.1-244.9-245.3.1 0 .1 0 0 0m0 654h-652.6c-135.3.1-244.9 109.9-244.8 245.2-.2 135.3 109.4 245.1 244.7 245.3h652.7c135.3-.1 244.9-109.9 244.8-245.2.1-135.4-109.5-245.2-244.8-245.3z"
          fill="#36c5f0"
        />
        <path
          d="m2447.6 899.2c.1-135.3-109.5-245.1-244.8-245.2-135.3.1-244.9 109.9-244.8 245.2v245.3h244.8c135.3-.1 244.9-109.9 244.8-245.3zm-652.7 0v-654c.1-135.2-109.4-245-244.7-245.2-135.3.1-244.9 109.9-244.8 245.2v654c-.2 135.3 109.4 245.1 244.7 245.3 135.3-.1 244.9-109.9 244.8-245.3z"
          fill="#2eb67d"
        />
        <path
          d="m1550.1 2452.5c135.3-.1 244.9-109.9 244.8-245.2.1-135.3-109.5-245.1-244.8-245.2h-244.8v245.2c-.1 135.2 109.5 245 244.8 245.2zm0-654.1h652.7c135.3-.1 244.9-109.9 244.8-245.2.2-135.3-109.4-245.1-244.7-245.3h-652.7c-135.3.1-244.9 109.9-244.8 245.2-.1 135.4 109.4 245.2 244.7 245.3z"
          fill="#ecb22e"
        />
        <path
          d="m0 1553.2c-.1 135.3 109.5 245.1 244.8 245.2 135.3-.1 244.9-109.9 244.8-245.2v-245.2h-244.8c-135.3.1-244.9 109.9-244.8 245.2zm652.7 0v654c-.2 135.3 109.4 245.1 244.7 245.3 135.3-.1 244.9-109.9 244.8-245.2v-653.9c.2-135.3-109.4-245.1-244.7-245.3-135.4 0-244.9 109.8-244.8 245.1 0 0 0 .1 0 0"
          fill="#e01e5a"
        />
      </g>
    </svg>
  );
}

// Discord's official mark, inverted — white glyph on a blurple chip (the
// viewBox isn't square; default xMidYMid keeps it centered in the slot).
function IconDiscordColor({ size = 24 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 256 199"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M216.856 16.597A208.502 208.502 0 0 0 164.042 0c-2.275 4.113-4.933 9.645-6.766 14.046-19.692-2.961-39.203-2.961-58.533 0-1.832-4.4-4.55-9.933-6.846-14.046a207.809 207.809 0 0 0-52.855 16.638C5.618 67.147-3.443 116.4 1.087 164.956c22.169 16.555 43.653 26.612 64.775 33.193A161.094 161.094 0 0 0 79.735 175.3a136.413 136.413 0 0 1-21.846-10.632 108.636 108.636 0 0 0 5.356-4.237c42.122 19.702 87.89 19.702 129.51 0a131.66 131.66 0 0 0 5.355 4.237 136.07 136.07 0 0 1-21.886 10.653c4.006 8.02 8.638 15.67 13.873 22.848 21.142-6.58 42.646-16.637 64.815-33.213 5.316-56.288-9.08-105.09-38.056-148.36ZM85.474 135.095c-12.645 0-23.015-11.805-23.015-26.18s10.149-26.2 23.015-26.2c12.867 0 23.236 11.804 23.015 26.2.02 14.375-10.148 26.18-23.015 26.18Zm85.051 0c-12.645 0-23.014-11.805-23.014-26.18s10.148-26.2 23.014-26.2c12.867 0 23.236 11.804 23.015 26.2 0 14.375-10.148 26.18-23.015 26.18Z"
        fill="#fff"
      />
    </svg>
  );
}

// A pause between the social-proof strip and the bento — dramatizes the pain
// (silent drift) so the feature grid below lands as relief. The left column
// tells the regression as a three-beat timeline on a vertical rail; the right
// column makes the punchline literal — instead of a dashboard alert, you find
// out from a pile of customer/teammate complaints across Slack, WhatsApp, X,
// and Discord. The two halves animate in as the band scrolls into view so the
// reader *feels* the drift surface the wrong way.
const BEATS = [
  { t: "Week 1", text: "Ships clean." },
  { t: "Week 3", text: "Costs doubled, answers worse." },
  { t: "Then", text: "Customers start complaining.", accent: true },
];

type Ping = {
  icon: ComponentType<IconProps>;
  badge: string;
  name: string;
  meta: string;
  text: string;
  time: string;
};

// The pings escalate from an internal nudge to a public callout. Copy is
// deliberately informal — this is what the failure actually sounds like.
const PINGS: Ping[] = [
  {
    icon: IconSlackColor,
    badge: "bg-white",
    name: "Dana",
    meta: "#support",
    text: "the assistant just quoted a refund window we killed in March 😤",
    time: "2m",
  },
  {
    icon: IconBrandWhatsapp,
    badge: "bg-[#25D366]/90 text-white",
    name: "+1 (415) 555-0148",
    meta: "Customer",
    text: "is this a bot? it gave me an order number that doesn't exist",
    time: "6m",
  },
  {
    icon: IconBrandX,
    badge: "bg-muted/30 text-foreground",
    name: "@jordanbuilds",
    meta: "12.4k followers",
    text: "@acme your “AI support” confidently invented a tracking link. yikes.",
    time: "14m",
  },
  {
    icon: IconDiscordColor,
    badge: "bg-[#5865F2]",
    name: "mara",
    meta: "community",
    text: "anyone else getting totally wrong answers from the bot today??",
    time: "21m",
  },
];

// Matches the hero's reveal curve so the whole landing shares one motion voice.
const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

export function DriftStory() {
  const reduce = useReducedMotion() ?? false;

  // Blur-up reveal as the element scrolls into view; `from` lets the timeline
  // rise and the pings slide in from the right. Reduced-motion users get the
  // content in place, no animation.
  const reveal = (
    delay: number,
    from: { x?: number; y?: number }
  ): MotionProps =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, filter: "blur(0px)", ...from },
          whileInView: { opacity: 1, x: 0, y: 0, filter: "blur(0px)" },
          viewport: { once: true, margin: "-80px" },
          transition: { duration: 0.6, ease: EASE, delay },
        };

  return (
    <section className="relative isolate overflow-hidden py-28 sm:py-36 bg-card/50 dark:shadow-(--custom-shadow)">
      <div className="relative z-10 mx-auto grid max-w-5xl items-center gap-14 px-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)] lg:gap-20">
        {/* Left: the drift timeline. No row gap — each row owns its full height
            so the rail segments stay contiguous and read as one line. */}
        <ol className="font-display flex flex-col">
          {BEATS.map((b, i) => {
            const first = i === 0;
            const last = i === BEATS.length - 1;

            // The rail draws downward at a constant rate, one row-segment after
            // another, so it reads as the story *evolving*. Each dot lights the
            // instant the leading edge reaches its center: middle dots sit at
            // their segment's midpoint (½ in), the final dot at its end.
            const STEP = 0.6;
            const lineDelay = i * STEP;
            const dotDelay = first
              ? 0
              : last
                ? i * STEP + STEP
                : i * STEP + STEP / 2;

            const lineMotion: MotionProps = reduce
              ? {}
              : {
                  initial: { scaleY: 0 },
                  whileInView: { scaleY: 1 },
                  viewport: { once: true, margin: "-80px" },
                  transition: {
                    duration: STEP,
                    ease: "linear",
                    delay: lineDelay,
                  },
                };
            const dotMotion: MotionProps = reduce
              ? {}
              : {
                  initial: { scale: 0, opacity: 0 },
                  whileInView: { scale: 1, opacity: 1 },
                  viewport: { once: true, margin: "-80px" },
                  transition: {
                    duration: 0.4,
                    ease: "backOut",
                    delay: dotDelay,
                  },
                };

            return (
              <li key={b.t} className="flex min-h-24 items-center sm:min-h-28">
                {/* Text rises in as the step activates (synced to the dot). */}
                <motion.span
                  className={cn(
                    "w-16 shrink-0 text-right  text-xs font-medium tracking-wide text-muted-foreground/70 sm:w-20 sm:text-sm",
                    b.accent && "text-rose-500 dark:text-rose-400"
                  )}
                  {...reveal(dotDelay, { y: 12 })}
                >
                  {b.t}
                </motion.span>
                {/* Rail cell: self-stretch fills the full row height (no padding
                    to exclude), so the segments meet across rows and draw as one
                    continuous line. Horizontal centering uses calc/margins, not
                    a transform, so Motion is free to drive scaleY / scale. */}
                <span className="relative w-8 shrink-0 self-stretch sm:w-10">
                  <motion.span
                    aria-hidden
                    className={cn(
                      "absolute left-[calc(50%-0.5px)] w-px origin-top bg-border",
                      first && "top-1/2 bottom-0",
                      last && "top-0 bottom-1/2",
                      !first && !last && "inset-y-0",
                      b.accent && "bg-rose-500/40 dark:bg-rose-400/40"
                    )}
                    {...lineMotion}
                  />
                  <motion.span
                    aria-hidden
                    className={cn(
                      "absolute top-1/2 left-1/2 -mt-1 -ml-1 size-2 rounded-full ring-4 ring-card",
                      b.accent
                        ? "bg-rose-500 shadow-[0_0_12px_2px_rgba(244,63,94,0.5)] dark:bg-rose-400"
                        : "bg-foreground shadow-[0_0_10px_1px_rgba(255,255,255,0.22)]"
                    )}
                    {...dotMotion}
                  />
                </span>
                <motion.span
                  className="text-2xl font-medium tracking-tight text-balance text-foreground sm:text-3xl ml-2"
                  {...reveal(dotDelay, { y: 12 })}
                >
                  {b.text}
                </motion.span>
              </li>
            );
          })}
        </ol>

        {/* Right: how you actually find out — a pile of incoming complaints. */}
        <div className="flex flex-col gap-4">
          {PINGS.map((p, i) => (
            <motion.div
              key={p.name}
              className="flex items-start gap-3 rounded-[36px] corner-squircle dark:shadow-(--custom-shadow) bg-card/50 p-3.5 shadow-sm backdrop-blur-sm"
              {...reveal(2.4 + i * 0.4, { x: 4 })}
            >
              <span
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-3xl corner-squircle dark:shadow-(--custom-shadow)",
                  p.badge
                )}
              >
                <p.icon size={20} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm">
                  <span className="truncate font-medium text-foreground">
                    {p.name}
                  </span>
                  <span className="truncate text-muted-foreground">
                    {p.meta}
                  </span>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground/50">
                    {p.time}
                  </span>
                </div>
                <p className="mt-0.5 text-sm text-pretty text-muted-foreground">
                  {p.text}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
