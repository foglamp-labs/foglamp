"use client";

import { useChat } from "@ai-sdk/react";
import {
  IconAlertHexagonFilled,
  IconArrowUp,
  IconHistory,
  IconMessageFilled,
  IconPacmanFilled,
  IconPlus,
  IconRefresh,
  IconX,
} from "@tabler/icons-react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";

import { env } from "@foglamp/env/web";
import { Button } from "@foglamp/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@foglamp/ui/components/dropdown-menu";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@foglamp/ui/components/empty";
import { Kbd } from "@foglamp/ui/components/kbd";
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
// The user can drag the panel's left edge to resize within these bounds.
const PANEL_WIDTH = 384;
const MIN_PANEL_WIDTH = 320;
const MAX_PANEL_WIDTH = 640;

// Geometry of the notch carved into the inset's bottom-right corner. The SVG
// is anchored so that x = w and y = h land exactly on the centerline of the
// inset's 0.5px ring shadow (see the container's right/bottom offsets); units
// are px. Tweak `w`/`floor` to resize the shelf (a larger `floor` leaves more
// gap above the button before the inset content begins).
const NOTCH = { w: 128, h: 77, floor: 43 };

// How far the hairline runs colinearly on top of the inset's ring at each end
// (its color matches the ring's rendered color, so the overlap is invisible and
// absorbs any sub-pixel drift), and how far the fill bleeds past the ring onto
// the canvas to fully cover the ring + its antialiasing inside the cut.
const OVERLAP = 6;
const BLEED = 4;

// The cut's boundary, one open path: in along the bottom edge, a rounded turn
// into a vertical rise, a rounded turn onto the shelf ceiling, across, then a
// rounded turn up into the right edge.
const NOTCH_EDGE = [
  `M ${-OVERLAP} ${NOTCH.h}`,
  `L 0 ${NOTCH.h}`,
  `q 12 0 12 -12`,
  `V ${NOTCH.h - NOTCH.floor + 12}`,
  `q 0 -12 12 -12`,
  `L ${NOTCH.w - 8} ${NOTCH.h - NOTCH.floor}`,
  `q 8 0 8 -8`,
  `V ${NOTCH.h - NOTCH.floor - 8 - OVERLAP}`,
].join(" ");

// The cut as a closed region: the boundary above, extended past the ring at
// the bottom/right so one fill both carves the shelf out of the corner and
// swallows the inset's ring inside the cut. The seams where it crosses the
// ring sit under the stroked boundary, which redraws the edge on top.
const NOTCH_FILL = [
  `M 0 ${NOTCH.h + BLEED}`,
  `L 0 ${NOTCH.h}`,
  `q 12 0 12 -12`,
  `V ${NOTCH.h - NOTCH.floor + 12}`,
  `q 0 -12 12 -12`,
  `L ${NOTCH.w - 8} ${NOTCH.h - NOTCH.floor}`,
  `q 8 0 8 -8`,
  `L ${NOTCH.w + BLEED} ${NOTCH.h - NOTCH.floor - 8}`,
  `L ${NOTCH.w + BLEED} ${NOTCH.h + BLEED}`,
  `Z`,
].join(" ");

/**
 * The launcher, carved into the inset's bottom-right corner (à la EvilCharts).
 * Rendered in the canvas layer *above* the inset (not inside it) so it can
 * cover the inset's bottom/right edge within the cut. Two paths: a canvas-color
 * fill that carves the corner (swallowing the ring inside the cut), and a 0.5px
 * hairline along the cut that sits exactly on the ring's centerline in the same
 * rendered color, so it reads as the inset's own edge flowing around the notch.
 * A ghost button sits on the shelf.
 */
export function FoggyLauncher({
  onOpen,
  showButton = true,
}: {
  onOpen: () => void;
  showButton?: boolean;
}) {
  // Press "f" to open. The launcher is only mounted while the panel is closed
  // (and a project exists), so listening here is naturally scoped to when the
  // shortcut should fire.
  useEffect(() => {
    if (!showButton) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "f" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (
        t?.isContentEditable ||
        t?.tagName === "INPUT" ||
        t?.tagName === "TEXTAREA" ||
        t?.tagName === "SELECT"
      )
        return;
      e.preventDefault();
      onOpen();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onOpen, showButton]);

  return (
    <div
      // The inset sits at m-2 (8px), so its ring — a 0.5px shadow spread just
      // outside its border — is centered 7.75px from the viewport edge. Anchor
      // there so the SVG's x = w / y = h lines land on the ring's centerline.
      // pointer-events-none so the empty notch region (everything but the button)
      // doesn't swallow clicks meant for header buttons that slide under this
      // corner on smaller screens; the button itself re-enables them.
      className="pointer-events-none absolute right-[7.75px] bottom-[7.75px] z-30 select-none"
      style={{ width: NOTCH.w, height: NOTCH.h }}
    >
      <svg
        aria-hidden
        width={NOTCH.w}
        height={NOTCH.h}
        viewBox={`0 0 ${NOTCH.w} ${NOTCH.h}`}
        className="pointer-events-none absolute inset-0 overflow-visible"
      >
        {/* The carved corner, in the canvas color. */}
        <path d={NOTCH_FILL} className="fill-sidebar" />
        {/* The cut's edge: same 0.5px weight as the inset's ring, in the
            ring's rendered color (ring alpha composited over the canvas). */}
        <path
          d={NOTCH_EDGE}
          fill="none"
          strokeWidth="0.5"
          className="stroke-[#E3E3E3] dark:stroke-[#1E1E1E]"
        />
      </svg>
      {showButton && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.12, ease: "easeOut" }}
          className="pointer-events-auto absolute right-0 bottom-1"
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={onOpen}
            aria-label="Foggy"
            className="rounded-sm h-8 pl-2 active:scale-100 hover:bg-white dark:hover:bg-muted/50"
          >
            <span className="inline-flex">
              <IconPacmanFilled className="size-4 text-[#0090FD]" />
            </span>
            <span>Foggy</span>
            <span className="ml-0.5 inline-flex">
              <Kbd className="text-[10px] dark:bg-card bg-white">F</Kbd>
            </span>
          </Button>
        </motion.div>
      )}
    </div>
  );
}

export function FoggyWidget({
  projectId,
  pathname,
  range,
  open,
  onOpenChange,
}: {
  projectId: string;
  pathname: string;
  range: { from: Date; to: Date };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [input, setInput] = useState("");
  // Whether the message list is scrolled away from the top — gates the top fade.
  const [scrolled, setScrolled] = useState(false);

  // User-adjustable panel width, driven by dragging the left edge. While a
  // drag is live we suppress the width tween so the panel tracks the pointer
  // 1:1 instead of easing toward it.
  const [panelWidth, setPanelWidth] = useState(PANEL_WIDTH);
  const [resizing, setResizing] = useState(false);

  function startResize(e: React.PointerEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = panelWidth;
    setResizing(true);
    // The pointer leaves the thin handle immediately while dragging, so pin
    // the resize cursor (and disable text selection) globally until release.
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    function onMove(ev: PointerEvent) {
      setPanelWidth(
        Math.min(
          MAX_PANEL_WIDTH,
          Math.max(MIN_PANEL_WIDTH, startWidth + (startX - ev.clientX))
        )
      );
    }
    function onUp() {
      setResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  // A stable id for the current conversation, sent to the server so each chat
  // becomes its own foglamp session. Regenerated on "new chat" (below) and on a
  // project switch (the parent keys this component by projectId, remounting it).
  // Not rendered to the DOM, so generating it during render is hydration-safe.
  const [threadId, setThreadId] = useState(() => crypto.randomUUID());

  // Messages to seed the chat with when the threadId changes — set when the
  // user resumes a conversation from history. useChat only reads this while
  // (re)creating its internal Chat, which happens exactly on an `id` change,
  // so pairing setSeedMessages + setThreadId swaps in the loaded thread.
  const [seedMessages, setSeedMessages] = useState<UIMessage[]>([]);

  // Past conversations for the history dropdown, fetched each time it opens.
  const [threads, setThreads] = useState<
    { id: string; title: string; updatedAt: string }[]
  >([]);
  const [threadsLoading, setThreadsLoading] = useState(false);

  // The page and the selected time range both change as the user navigates and
  // adjusts the range picker, but we don't want to rebuild the transport (and
  // risk disturbing the chat) each time. Hold them in refs the transport reads
  // at send time, so each message carries the live path + range.
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const rangeRef = useRef(range);
  rangeRef.current = range;

  // One transport per project + conversation; a new threadId resets the body.
  // prepareSendMessagesRequest re-creates the default body and tacks on the
  // current pathname + range, so the server knows which page the question came
  // from and which window to default its tools to.
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `${env.NEXT_PUBLIC_SERVER_URL}/foggy`,
        credentials: "include",
        body: { projectId, threadId },
        prepareSendMessagesRequest: ({
          body,
          messages,
          id,
          trigger,
          messageId,
        }) => ({
          body: {
            ...body,
            id,
            messages,
            trigger,
            messageId,
            pathname: pathnameRef.current,
            range: {
              from: rangeRef.current.from.toISOString(),
              to: rangeRef.current.to.toISOString(),
            },
          },
        }),
      }),
    [projectId, threadId]
  );

  const { messages, sendMessage, status, error, stop, regenerate } = useChat({
    // The id ties useChat to the conversation: changing it makes useChat build
    // a fresh internal Chat from the current transport + seed messages.
    // (Without it, useChat keeps the first transport forever and "new chat" /
    // "resume thread" would silently keep posting under the old threadId.)
    id: threadId,
    messages: seedMessages,
    transport,
  });
  const busy = status === "submitted" || status === "streaming";

  // Reset to a fresh conversation — new threadId → new foglamp session.
  function newChat() {
    if (busy) void stop();
    setInput("");
    setScrolled(false);
    setSeedMessages([]);
    setThreadId(crypto.randomUUID());
  }

  // Fetch the history list; called when the dropdown opens. Server scopes to
  // the signed-in user + this project and orders newest first.
  async function loadThreads() {
    setThreadsLoading(true);
    try {
      const res = await fetch(
        `${env.NEXT_PUBLIC_SERVER_URL}/foggy/threads?projectId=${encodeURIComponent(projectId)}`,
        { credentials: "include" }
      );
      if (!res.ok) return;
      const data = (await res.json()) as {
        threads?: { id: string; title: string; updatedAt: string }[];
      };
      setThreads(data.threads ?? []);
    } catch {
      // Leave the previous list; the dropdown just shows what it has.
    } finally {
      setThreadsLoading(false);
    }
  }

  // Resume a past conversation: load its messages, then swap the chat over to
  // that thread. Further replies upsert the same row server-side.
  async function openThread(id: string) {
    if (id === threadId) return;
    try {
      const res = await fetch(
        `${env.NEXT_PUBLIC_SERVER_URL}/foggy/threads/${encodeURIComponent(id)}`,
        { credentials: "include" }
      );
      if (!res.ok) return;
      const data = (await res.json()) as { messages?: UIMessage[] };
      if (!Array.isArray(data.messages)) return;
      if (busy) void stop();
      setInput("");
      setScrolled(false);
      setSeedMessages(data.messages);
      setThreadId(id);
    } catch {
      // Loading failed — keep the current conversation untouched.
    }
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

  // Focus the composer when the panel opens so the user can type right away.
  // Wait out the 0.25s width animation — focusing while the panel is still
  // sliding in scrolls the textarea into view and fights the transition.
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!open) {
      // Closing (e.g. via Escape) leaves the composer focused inside the
      // hidden panel, silently swallowing keystrokes — including the "f" that
      // would reopen it. Drop focus so typing reaches the page again.
      inputRef.current?.blur();
      return;
    }
    const t = setTimeout(() => inputRef.current?.focus(), 260);
    return () => clearTimeout(t);
  }, [open]);

  // Escape closes the panel (the overlay convention), mirroring the "f" open
  // shortcut. Window-level so it works even while the composer has focus.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.preventDefault();
      onOpenChange(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

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
      animate={{ width: open ? panelWidth : 0 }}
      transition={
        resizing
          ? { duration: 0 }
          : { duration: 0.25, ease: [0.32, 0.72, 0, 1] }
      }
      // No overflow-hidden here: the provider clips at the viewport, and the
      // resize handle needs to hang past this edge to cover the canvas gap.
      className="relative h-svh shrink-0"
      aria-hidden={!open}
    >
      {/* Drag the left edge to resize. Shows the col-resize cursor on hover.
          Hangs 8px left of the panel to span the canvas gap up to the inset's
          edge. The visual affordance is the inset's right edge lighting up —
          the app shell watches these data attributes via :has() to drive it. */}
      {open && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize panel"
          data-foggy-resize=""
          data-resizing={resizing || undefined}
          onPointerDown={startResize}
          className="absolute inset-y-0 -left-2 z-20 w-4 cursor-col-resize"
        />
      )}
      {/* Fixed-width inner so content doesn't reflow while the panel animates. */}
      <div
        className="flex h-full flex-col py-2 pr-2"
        style={{ width: panelWidth }}
      >
        <div className="flex items-center justify-end gap-2 px-2 pb-2 pt-1">
          <div className="flex items-center gap-1">
            {open && (
              <DropdownMenu
                onOpenChange={(o) => {
                  if (o) void loadThreads();
                }}
              >
                <DropdownMenuTrigger
                  render={
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label="History"
                      title="History"
                    >
                      <IconHistory className="size-4" />
                    </Button>
                  }
                />
                <DropdownMenuContent align="end" className="w-64">
                  {threads.length === 0 ? (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                      {threadsLoading ? "Loading…" : "No conversations yet"}
                    </div>
                  ) : (
                    threads.map((t) => (
                      <DropdownMenuItem
                        key={t.id}
                        onClick={() => void openThread(t.id)}
                        className={cn(
                          t.id === threadId && "bg-accent/80 dark:bg-accent/50"
                        )}
                      >
                        <span className="truncate">{t.title}</span>
                      </DropdownMenuItem>
                    ))
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
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
            {/* Keep the button slot mounted (fixed icon-sm size) so the header
                row doesn't reflow on close; only the icon drops, so the X
                vanishes the instant close is clicked without a layout flick. */}
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              aria-label="Close"
              className="active:ring-0"
            >
              {open && <IconX className="size-4" />}
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
                        className="size-9 [&_svg:not([class*='size-'])]:size-5 corner-squircle bg-[#0090FD]/10 text-[#0090FD] shadow-[inset_0_0_0_1px_rgba(0,144,253,0.14),0_2px_6px_-2px_rgba(0,144,253,0.25)] dark:bg-[#0090FD]/15 dark:shadow-(--custom-shadow) rounded-md squircle:rounded-2xl"
                      >
                        <IconPacmanFilled className="text-[#0090FD] size-5.5" />
                      </EmptyMedia>
                      <EmptyTitle>Ask Foggy!</EmptyTitle>
                    </EmptyHeader>
                  </Empty>
                </motion.div>
              ) : (
                <motion.div
                  key="messages"
                  className="flex flex-col gap-6 pb-8"
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
                    <div className="ml-3 flex w-fit flex-col gap-2">
                      <div className="rounded-lg squircle:rounded-3xl corner-squircle bg-destructive/10 px-3 py-2 text-sm text-destructive w-fit flex gap-2 items-center">
                        <IconAlertHexagonFilled className="size-3.5" />
                        {errorMessage(error)}
                      </div>
                      {/* The failed question is still in the thread — let the
                          user re-send it instead of retyping. */}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="w-fit"
                        onClick={() => void regenerate()}
                      >
                        <IconRefresh className="size-3.5" />
                        Try again
                      </Button>
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
          className="relative flex flex-col gap-2 p-1 pt-0"
        >
          <AnimatePresence>
            {messages.length === 0 && (
              <motion.div
                key="empty"
                className="h-full pl-2"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
              >
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    className="w-fit rounded-md squircle:rounded-xl corner-squircle px-2 py-1.5 cursor-pointer text-left text-sm dark:hover:bg-accent/40 hover:bg-accent/70 text-muted-foreground/50 flex justify-center items-center gap-2"
                  >
                    {s}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={2}
            placeholder="Ask Foggy…"
            className="max-h-32 min-h-20 flex-1 resize-none rounded-xl squircle:rounded-4xl corner-squircle shadow-(--custom-shadow) dark:bg-muted/30 bg-white p-4 text-sm outline-none transition-colors focus-visible:border-ring"
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
