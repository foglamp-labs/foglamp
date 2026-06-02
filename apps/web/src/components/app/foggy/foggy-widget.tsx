"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { AnimatePresence, motion } from "motion/react";
import {
  IconAlertHexagonFilled,
  IconArrowUp,
  IconMessageFilled,
  IconPacmanFilled,
  IconPlus,
  IconX,
} from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { env } from "@foglamp/env/web";
import { Button } from "@foglamp/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@foglamp/ui/components/empty";
import { TextShimmerLoader } from "@foglamp/ui/components/loader";
import { cn } from "@foglamp/ui/lib/utils";

import { FoggyMessage } from "./foggy-message";

// The transport throws with the response body in `error.message`. Our server
// errors are JSON `{ error }`, so surface that reason when we can (e.g. "Foggy
// isn't configured", rate-limit messages) and fall back to a generic line.
function errorMessage(error: Error): string {
  try {
    const parsed = JSON.parse(error.message) as { error?: string };
    if (parsed.error) return parsed.error;
  } catch {
    // not JSON — fall through
  }
  return "Foggy hit a snag. Please try again in a moment.";
}

const SUGGESTIONS = [
  "What did I spend in the last 7 days?",
  "Show me my slowest traces",
  "Which model costs the most?",
  "How do I name a workflow?",
];

// Width of the chat panel when open. The inset (a flex sibling, flex-1) gives up
// exactly this much room, so the chat reads as carved out of the same canvas.
const PANEL_WIDTH = 384;

// Geometry of the notch carved into the inset's top-right corner. The inset's
// top edge drops vertically to a flat shelf where the button sits. The SVG is
// anchored to the inset's corner (its bottom-right is the inset corner); units
// are px. Tweak `w`/`floor` to resize the shelf (a larger `floor` leaves more
// gap below the button before the inset content begins).
const NOTCH = { w: 138, h: 77, floor: 43 };

// The cut's inset-facing boundary: a short stub left along the top edge (to
// overlap the inset's edge), a rounded turn into a vertical drop, a rounded
// turn onto the shelf floor, across, then a long tail down the right edge. The
// stub + tail overlap the inset's edge so the join stays seamless despite the
// box-shadow sitting at a slightly different offset between light and dark.
const NOTCH_EDGE = `M -18 0 L 0 0 q 12 0 12 12 V ${NOTCH.floor - 12} q 0 12 12 12 L ${NOTCH.w - 8} ${NOTCH.floor} q 8 0 8 8 v 28`;

// The cut as a closed region (boundary + the inset's top/right edges), filled
// with the canvas color to actually carve the shelf out of the corner.
const NOTCH_FILL = `M 0 0 q 12 0 12 12 V ${NOTCH.floor - 12} q 0 12 12 12 L ${NOTCH.w} ${NOTCH.floor} L ${NOTCH.w} 0 Z`;

/**
 * The launcher, carved into the inset's top-right corner (à la EvilCharts).
 * Rendered in the canvas layer *above* the inset (not inside it) so it can mask
 * the inset's top + right border within the cut and blend seamlessly. The SVG:
 * (1) paints the canvas color over the inset's top/right edge inside the cut,
 * (2) fills the ramped shelf with the canvas color, (3) strokes the hairline
 * edge that ramps down and rejoins the inset border. A ghost button sits on the
 * shelf. Anchored at the inset's corner (`right-2 top-2` ≈ the inset's `m-2`).
 */
export function FoggyLauncher({ onOpen }: { onOpen: () => void }) {
  return (
    <div
      // Anchor on the inset's box-shadow edge, which sits at a different offset
      // per theme: light's spread ring is ~1px outside the m-2 (8px) corner, so
      // 7.5px; dark's inset highlight is further in, so 8.5px.
      // pointer-events-none so the empty notch region (everything but the button)
      // doesn't swallow clicks meant for header buttons that slide under this
      // corner on smaller screens; the button itself re-enables them.
      className="pointer-events-none absolute right-[7.5px] top-[7.5px] z-30 select-none dark:right-[8.5px] dark:top-[8.5px]"
      style={{ width: NOTCH.w, height: NOTCH.h }}
    >
      <svg
        aria-hidden
        width={NOTCH.w}
        height={NOTCH.h}
        viewBox={`0 0 ${NOTCH.w} ${NOTCH.h}`}
        className="pointer-events-none absolute inset-0 overflow-visible [--ramp-from:#ECECEC] [--ramp-to:#E9E9E9] dark:[--ramp-from:#222222] dark:[--ramp-to:#191919]"
      >
        <defs>
          {/* Lighter at the top, darker toward the side — mirrors the inset's
              own shadow, which is lighter on top than on the right edge. */}
          <linearGradient
            id="foggy-ramp"
            gradientUnits="userSpaceOnUse"
            x1="0"
            y1="0"
            x2="0"
            y2={NOTCH.h}
          >
            <stop offset="0" stopColor="var(--ramp-from)" />
            <stop offset="1" stopColor="var(--ramp-to)" />
          </linearGradient>
        </defs>
        {/* Mask the inset's top + right edge across the cut (and past the
            overlap stubs) so the ramp is the only edge in this zone. */}
        <path
          d={`M ${NOTCH.w} 0 L -12 0`}
          stroke="var(--sidebar)"
          strokeWidth="3.5"
          strokeLinecap="round"
        />
        <path
          d={`M ${NOTCH.w} 0 L ${NOTCH.w} ${NOTCH.h}`}
          stroke="var(--sidebar)"
          strokeWidth="3.5"
          strokeLinecap="round"
        />
        {/* The carved shelf, in the canvas color. */}
        <path d={NOTCH_FILL} style={{ fill: "var(--sidebar)" }} />
        {/* The inset's edge, ramping down and along the shelf. */}
        <path
          d={NOTCH_EDGE}
          fill="none"
          stroke="url(#foggy-ramp)"
          strokeWidth="1"
        />
      </svg>
      {/* Only the button animates back in — the carved shelf stays put. Hold
          off after the chat closes: wait for the panel's 0.25s close to finish,
          then a beat more, so the button fades in rather than popping into the
          corner the instant the panel is dismissed. */}
      <motion.div
        className="pointer-events-auto absolute right-2 top-1"
        initial={{ opacity: 0, x: 4 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.15, delay: 0.1, ease: "easeOut" }}
      >
        <Button
          variant="ghost"
          size="sm"
          onClick={onOpen}
          aria-label="Ask Foggy"
          className="rounded-sm h-8"
        >
          <IconPacmanFilled className="size-4 text-[#0090FD]" />
          Ask Foggy
        </Button>
      </motion.div>
    </div>
  );
}

export function FoggyWidget({
  projectId,
  open,
  onOpenChange,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [input, setInput] = useState("");
  // Whether the message list is scrolled away from the top — gates the top fade.
  const [scrolled, setScrolled] = useState(false);

  // A stable id for the current conversation, sent to the server so each chat
  // becomes its own foglamp session. Regenerated on "new chat" (below) and on a
  // project switch (the parent keys this component by projectId, remounting it).
  // Not rendered to the DOM, so generating it during render is hydration-safe.
  const [threadId, setThreadId] = useState(() => crypto.randomUUID());

  // One transport per project + conversation; a new threadId resets the body.
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `${env.NEXT_PUBLIC_SERVER_URL}/foggy`,
        credentials: "include",
        body: { projectId, threadId },
      }),
    [projectId, threadId]
  );

  const { messages, sendMessage, setMessages, status, error, stop } = useChat({
    transport,
  });
  const busy = status === "submitted" || status === "streaming";

  // Reset to a fresh conversation — new threadId → new foglamp session.
  function newChat() {
    if (busy) void stop();
    setMessages([]);
    setInput("");
    setScrolled(false);
    setThreadId(crypto.randomUUID());
  }

  // Show the shimmer while we're waiting for (or tool-calling toward) a reply —
  // i.e. until the assistant actually starts emitting text.
  const last = messages[messages.length - 1];
  const replyStarted =
    last?.role === "assistant" &&
    last.parts.some((p) => p.type === "text" && p.text.length > 0);
  const thinking = busy && !replyStarted;

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, busy]);

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    void sendMessage({ text: trimmed });
    setInput("");
  }

  return (
    <motion.aside
      // Flat on the canvas (bg-sidebar) to the right of the inset; animating the
      // width makes the flex-1 inset shrink/grow smoothly to make room.
      initial={false}
      animate={{ width: open ? PANEL_WIDTH : 0 }}
      transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
      className="relative h-svh shrink-0 overflow-hidden"
      aria-hidden={!open}
    >
      {/* Fixed-width inner so content doesn't reflow while the panel animates. */}
      <div
        className="flex h-full flex-col py-2 pr-2"
        style={{ width: PANEL_WIDTH }}
      >
        <div className="flex items-center justify-between gap-2 px-2 pb-2 pt-1">
          {/* Unmount instantly on close (rather than animating out with the
              panel) so the icon + name vanish the moment the tab is closed. */}
          {open && (
            <div className="flex items-center gap-2 pl-1 text-sm font-medium">
              <IconPacmanFilled className="size-4 text-[#0090FD]" />
              Foggy
            </div>
          )}
          <div className="flex items-center gap-1">
            <AnimatePresence initial={false}>
              {messages.length > 0 && (
                <motion.div
                  key="new-chat"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                >
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    onClick={newChat}
                    aria-label="New chat"
                    title="New chat"
                  >
                    <IconPlus className="size-4" />
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              aria-label="Close"
            >
              <IconX className="size-4" />
            </Button>
          </div>
        </div>

        <div className="relative min-h-0 flex-1">
          {/* Fade + blur the first messages out behind the header, but only
              once the list is scrolled (mirrors the bottom fade). */}
          <div
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-x-0 top-0 z-10 h-12 bg-linear-to-b from-sidebar via-sidebar/50 to-transparent transition-opacity duration-200",
              scrolled ? "opacity-100" : "opacity-0"
            )}
            style={{
              maskImage: "linear-gradient(to bottom, black 35%, transparent)",
              WebkitMaskImage:
                "linear-gradient(to bottom, black 35%, transparent)",
            }}
          />
          <div
            ref={scrollRef}
            onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 8)}
            className="h-full overflow-y-auto px-2 py-4"
          >
            <AnimatePresence mode="wait" initial={false}>
              {messages.length === 0 ? (
                <motion.div
                  key="empty"
                  className="h-full"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                >
                  <Empty className="h-full border-0 p-0">
                    <EmptyHeader>
                      <EmptyMedia
                        variant="icon"
                        className="size-9 [&_svg:not([class*='size-'])]:size-5 corner-squircle bg-[#0090FD]/10 text-[#0090FD] shadow-[inset_0_0_0_1px_rgba(0,144,253,0.14),0_2px_6px_-2px_rgba(0,144,253,0.25)] dark:bg-[#0090FD]/15 dark:shadow-(--custom-shadow) rounded-2xl"
                      >
                        <IconPacmanFilled className="text-[#0090FD] size-6" />
                      </EmptyMedia>
                      <EmptyTitle>Ask Foggy</EmptyTitle>
                      <EmptyDescription>
                        I can dig through this project&apos;s traces, costs, and
                        agents - or explain how Foglamp works.
                      </EmptyDescription>
                    </EmptyHeader>
                    <EmptyContent className="mt-2 gap-2">
                      {SUGGESTIONS.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => send(s)}
                          className="w-fit rounded-xl corner-squircle  px-3 py-2 cursor-pointer text-left text-sm hover:bg-accent flex justify-center items-center gap-2"
                        >
                          <IconMessageFilled className="size-3.5 text-muted-foreground/50" />
                          {s}
                        </button>
                      ))}
                    </EmptyContent>
                  </Empty>
                </motion.div>
              ) : (
                <motion.div
                  key="messages"
                  className="flex flex-col gap-6"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                >
                  {messages.map((m) => (
                    <FoggyMessage key={m.id} message={m} />
                  ))}
                  {thinking && (
                    <TextShimmerLoader
                      text="Foggy is thinking…"
                      size="sm"
                      className="pl-4"
                    />
                  )}
                  {error && (
                    <div className="rounded-3xl corner-squircle bg-destructive/10 px-3 ml-3 py-2 text-sm text-destructive w-fit flex gap-2 items-center">
                      <IconAlertHexagonFilled className="size-3.5" />
                      {errorMessage(error)}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-linear-to-t from-sidebar via-sidebar/50 to-transparent"
            style={{
              maskImage: "linear-gradient(to top, black 35%, transparent)",
              WebkitMaskImage:
                "linear-gradient(to top, black 35%, transparent)",
            }}
          />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="relative flex items-end gap-2 p-1 pt-0"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={3}
            placeholder="Ask Foggy…"
            className="max-h-32 flex-1 resize-none rounded-4xl corner-squircle shadow-(--custom-shadow) dark:bg-muted/30 bg-background p-4 text-sm outline-none transition-colors focus-visible:border-ring"
          />
          {busy ? (
            <Button
              type="button"
              size="icon-xs"
              variant="secondary"
              onClick={() => void stop()}
              aria-label="Stop"
              className="absolute right-4 bottom-4"
            >
              <span className="size-2.5 rounded-[2px] bg-current" />
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon-xs"
              disabled={!input.trim()}
              aria-label="Send"
              className="absolute right-4 bottom-4"
            >
              <IconArrowUp className="size-4" />
            </Button>
          )}
        </form>
      </div>
    </motion.aside>
  );
}
