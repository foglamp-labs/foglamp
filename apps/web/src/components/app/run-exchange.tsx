"use client";

import { Button } from "@foglamp/ui/components/button";
import { Skeleton } from "@foglamp/ui/components/skeleton";
import { TableCell, TableRow } from "@foglamp/ui/components/table";
import {
  IconArrowUpRight,
  IconChevronRight,
  IconCpu,
  IconGhostFilled,
  IconMessage2Filled,
  IconTool,
  IconUserFilled,
} from "@tabler/icons-react";
import Link from "next/link";
import { useMemo } from "react";
import { Streamdown } from "streamdown";

import { DRAWER_BUTTON_CLASS } from "@/components/app/button-styles";
import { Chip } from "@/components/app/context-chip";
import { CopyButton } from "@/components/app/copy-button";
import { CustomerAvatar } from "@/components/app/customer-avatar";
import { markdownComponents } from "@/components/app/markdown";
import {
  type Message,
  type Part,
  fromHumanized,
  toMessages,
} from "@/components/app/payload-messages";
import { ClampedBody, JsonBlock } from "@/components/app/payload-view";
import { ModelLogo, formatModelName } from "@/components/model-logo";
import { cn } from "@/lib/utils";

/**
 * The shared "expanded run" drawer used under the runs tables (evals, agents,
 * workflows): a labelled-fields overview on the left and the run's exchange on
 * the right, laid out like a session. Each page composes these pieces with its
 * own left column; the exchange, bubbles, skeletons and row shell are common.
 */

/** Expand affordance for a table's first cell: a muted chevron that brightens
 * on row hover (the row needs `group`) and turns when open. */
export function ExpandChevron({ open }: { open: boolean }) {
  return (
    <IconChevronRight
      className={cn(
        "size-3.5 shrink-0 text-muted-foreground/50 transition-[rotate,color] duration-300 ease-out group-hover:text-muted-foreground",
        open && "rotate-90 text-muted-foreground",
      )}
    />
  );
}

/** Row classes for an open row: it loses its divider and shares the drawer's
 * tint so the two read as one unit. Light uses a recessed neutral (the page
 * is oklch .99 and the card 1.0, so `bg-card` would vanish there); dark keeps
 * the raised card. */
export const OPEN_ROW_CLASS =
  "border-b-transparent bg-neutral-100 dark:bg-card";

/** Row classes for a deep-linked (focused) row: a soft primary tint. */
export const FOCUSED_ROW_CLASS =
  "bg-primary/5 dark:bg-primary/10 data-interactive:hover:bg-primary/10 dark:data-interactive:hover:bg-primary/15";

/** The drawer row itself. `px-8` matches the row cells' inset so the content
 * lines up with the row text; the tint (see {@link OPEN_ROW_CLASS}) makes it
 * read as a drawer under the open row. */
export function DrawerRow({
  colSpan,
  children,
  className,
}: {
  colSpan: number;
  children: React.ReactNode;
  /** Extra cell classes — e.g. a taller `pt-*` to breathe under the row. */
  className?: string;
}) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell
        colSpan={colSpan}
        className={cn("bg-neutral-100 px-8 pt-2 pb-8 dark:bg-card", className)}
      >
        {children}
      </TableCell>
    </TableRow>
  );
}

/** Two-column drawer layout: the overview on the left (sized so the right
 * column starts under the table's second cell when the first is `w-96`), the
 * exchange filling the rest. */
export function DrawerColumns({
  overview,
  children,
}: {
  overview: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
      {/* w-88 + the 2rem column gap = a w-96 first column. */}
      <div className="flex shrink-0 flex-col gap-4 lg:w-88">{overview}</div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** A labelled field in the drawer's overview column. */
export function Meta({
  label,
  value,
  className,
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="min-w-0 text-[13px] tabular-nums">{value}</span>
    </div>
  );
}

/** Placeholder for a field with no value. */
export function MetaEmpty() {
  return <span className="text-muted-foreground/40">—</span>;
}

/** Customer field value: the avatar (tinted glyph or image, as the overview
 * breakdown card renders it) next to the name. */
export function CustomerValue({
  customerId,
  customerName,
  imageUrl,
}: {
  customerId: string | null;
  customerName?: string | null;
  imageUrl?: string | null;
}) {
  if (!customerId) return <MetaEmpty />;
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <CustomerAvatar
        customerId={customerId}
        customerName={customerName}
        imageUrl={imageUrl}
        filled
        className="size-3.5"
      />
      <span className="truncate">{customerName ?? customerId}</span>
    </span>
  );
}

/** Models field value, mirroring the trace page's model context chip: one
 * model shows its logo and name; several overlap their logos (first-use order,
 * capped at three) and read "n models", with the full list in the title. */
export function ModelsValue({ models }: { models: string[] }) {
  if (models.length === 0) return <MetaEmpty />;
  const only = models[0];
  if (models.length === 1 && only) {
    return (
      <span className="flex min-w-0 items-center gap-1.5">
        <ModelLogo modelId={only} className="size-3.5 shrink-0" />
        <span className="truncate">{formatModelName(only)}</span>
      </span>
    );
  }
  const shown = models.slice(0, 3);
  return (
    <span
      className="flex min-w-0 items-center gap-1.5"
      title={models.map((m) => formatModelName(m)).join(", ")}
    >
      <span className="flex items-center -space-x-1.5">
        {shown.map((m) => (
          <span
            key={m}
            className="flex size-4 items-center justify-center rounded-full bg-card ring-1 ring-card"
          >
            <ModelLogo modelId={m} className="size-3" />
          </span>
        ))}
        {models.length > shown.length && (
          <IconCpu className="size-3 text-muted-foreground" />
        )}
      </span>
      <span className="truncate">{models.length} models</span>
    </span>
  );
}

/** Secondary "See session" button — the sessions glyph in its blue, as on the
 * trace page's context chip. */
export function SessionButton({ sessionId }: { sessionId: string }) {
  return (
    <Button
      size="sm"
      variant="secondary"
      className={cn("w-fit", DRAWER_BUTTON_CLASS)}
      render={
        // biome-ignore lint/suspicious/noExplicitAny: typed-routes string href
        <Link href={`/sessions/${encodeURIComponent(sessionId)}` as any} />
      }
    >
      <IconMessage2Filled className="text-sky-500" />
      See session
      <IconArrowUpRight className="mt-px" />
    </Button>
  );
}

/** The run's exchange as a conversation. Earlier history folds behind a
 * disclosure so the drawer opens on the latest user turn and the answer;
 * payloads that aren't message-shaped fall back to the raw viewer. */
export function Conversation({
  input,
  output,
  emptyHint,
  clamp,
}: {
  input: string | null | undefined;
  output: string | null | undefined;
  emptyHint: string;
  /** Fold the input and the output past `clamp` pixels each behind a
   * "Show more", so one long payload can't stretch the drawer down the page. */
  clamp?: number;
}) {
  const outMessages = useMemo(
    () => (output ? toMessages(output) : null),
    [output],
  );
  // A payload that is not JSON is prose (the SDK stores plain strings
  // verbatim) — a bubble, not the raw viewer.
  const outputText = outMessages
    ? messagesText(outMessages)
    : (output?.trim() ?? "");
  // A structured answer (an output schema, a workflow's return value) has no
  // text part at all — show the JSON rather than claiming nothing came back.
  const outputJson = useMemo(
    () => (outputText ? [] : jsonParts(outMessages ?? [])),
    [outMessages, outputText],
  );
  const outputTools = useMemo(
    () =>
      outputText || outputJson.length > 0 ? [] : toolParts(outMessages ?? []),
    [outMessages, outputText, outputJson],
  );

  const fold = (node: React.ReactNode) =>
    clamp ? (
      <ClampedBody maxHeight={clamp} buttonClassName={DRAWER_BUTTON_CLASS}>
        {node}
      </ClampedBody>
    ) : (
      node
    );
  return (
    <div className="flex flex-col gap-4">
      {input ? fold(<Transcript input={input} />) : null}
      {outputText ? (
        fold(<Bubble who="assistant" text={outputText} />)
      ) : outputJson.length > 0 ? (
        fold(<JsonBubble data={outputJson} />)
      ) : outputTools.length > 0 ? (
        <div className="flex gap-3">
          <Avatar who="assistant" />
          <div className="min-w-0 flex-1 py-0.5">
            <ToolChips tools={outputTools} className="pl-0" />
          </div>
        </div>
      ) : (
        <div className="flex gap-3">
          <Avatar who="assistant" />
          <p className="inline-flex items-center gap-1.5 px-1 text-sm text-muted-foreground italic">
            <IconTool className="size-3.5 shrink-0 text-muted-foreground/60" />
            {emptyHint}
          </p>
        </div>
      )}
    </div>
  );
}

/** The input side of an exchange: message-shaped payloads become turns with
 * everything before the latest user message folded away; anything else is a
 * single user bubble. */
export function Transcript({ input }: { input: string }) {
  const messages = useMemo(
    () => toMessages(input) ?? fromHumanized(input),
    [input],
  );
  if (!messages) return <Bubble who="user" text={input} />;
  let lastUser = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "user") {
      lastUser = i;
      break;
    }
  }
  const history = lastUser > 0 ? messages.slice(0, lastUser) : [];
  const current = messages.slice(Math.max(0, lastUser));
  return (
    <div className="flex flex-col gap-4">
      {history.length > 0 && (
        <details className="group/history">
          <summary className="flex h-5 cursor-pointer select-none items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
            <IconChevronRight className="size-3.5 transition-transform group-open/history:rotate-90" />
            {history.length} earlier{" "}
            {history.length === 1 ? "message" : "messages"}
          </summary>
          <div className="mt-4 flex flex-col gap-4">
            {history.map((m, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: positional transcript
              <Turn key={i} message={m} />
            ))}
          </div>
        </details>
      )}
      {current.map((m, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: positional transcript
        <Turn key={i} message={m} />
      ))}
    </div>
  );
}

export function partsText(parts: Part[]): string {
  return parts
    .filter((p): p is Extract<Part, { kind: "text" }> => p.kind === "text")
    .map((p) => p.text)
    .join("\n\n")
    .trim();
}
export function messagesText(messages: Message[]): string {
  return messages
    .filter((m) => m.role !== "user" && m.role !== "system")
    .map((m) => partsText(m.parts))
    .filter(Boolean)
    .join("\n\n");
}

/** The model-side messages of a payload: everything the user and the system
 * didn't say. */
function answerMessages(messages: Message[]): Message[] {
  return messages.filter((m) => m.role !== "user" && m.role !== "system");
}
/** The raw JSON parts of the answer — the whole payload when it's a single
 * structured value, or each unrecognized object of a parts array. */
export function jsonParts(messages: Message[]): unknown[] {
  return answerMessages(messages).flatMap((m) =>
    m.parts.flatMap((p) => (p.kind === "json" ? [p.data] : [])),
  );
}
type ToolPart = Extract<
  Part,
  { kind: "tool-call" | "tool-result" | "tool-error" }
>;
export function toolParts(messages: Message[]): ToolPart[] {
  return answerMessages(messages).flatMap((m) =>
    m.parts.filter(
      (p): p is ToolPart =>
        p.kind === "tool-call" ||
        p.kind === "tool-result" ||
        p.kind === "tool-error",
    ),
  );
}

/** One message of the transcript. User turns get the bubble, assistant turns
 * prose; tool calls and results collapse to chips; system prompts and other
 * roles show as a muted note. */
export function Turn({ message }: { message: Message }) {
  const text = partsText(message.parts);
  const tools = message.parts.filter(
    (p) =>
      p.kind === "tool-call" ||
      p.kind === "tool-result" ||
      p.kind === "tool-error",
  ) as Extract<Part, { kind: "tool-call" | "tool-result" | "tool-error" }>[];
  if (message.role === "user") {
    return <Bubble who="user" text={text || "(no text)"} />;
  }
  if (message.role === "assistant" || message.role === null) {
    return (
      <div className="flex flex-col gap-2">
        {text && <Bubble who="assistant" text={text} />}
        {tools.length > 0 && <ToolChips tools={tools} />}
      </div>
    );
  }
  if (tools.length > 0 && !text) return <ToolChips tools={tools} />;
  return (
    <div className="flex gap-3">
      <span className="w-6 shrink-0 text-right text-[10px] font-medium uppercase leading-6 text-muted-foreground/60">
        {message.role}
      </span>
      <p className="max-h-40 min-w-0 flex-1 overflow-y-auto whitespace-pre-wrap wrap-break-word px-1 text-xs text-muted-foreground">
        {text || JSON.stringify(message.parts)}
      </p>
    </div>
  );
}

export function ToolChips({
  tools,
  className,
}: {
  tools: Extract<Part, { kind: "tool-call" | "tool-result" | "tool-error" }>[];
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5 pl-9", className)}>
      {tools.map((t, i) => (
        <Chip
          // biome-ignore lint/suspicious/noArrayIndexKey: positional
          key={i}
          tone={t.kind === "tool-error" ? "error" : "ok"}
          icon={
            <IconTool
              className={cn(
                "size-3 shrink-0 fill-current stroke-1 mb-px",
                t.kind === "tool-error" ? "text-current" : "text-blue-500",
              )}
            />
          }
          label={<span className="font-mono">{t.name}</span>}
          trailing={
            t.kind === "tool-call"
              ? undefined
              : t.kind === "tool-error"
                ? "error"
                : "result"
          }
        />
      ))}
    </div>
  );
}

/** Loading treatment shaped like the loaded conversation (same as the
 * session page): a user bubble and a few prose lines under real avatars. */
export function ConversationSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-3">
        <div className="mt-1.5 size-6 shrink-0 animate-pulse rounded-full bg-muted-foreground/15" />
        <Skeleton className="h-11 min-w-0 flex-1 corner-squircle rounded-lg squircle:rounded-2xl bg-muted-foreground/15" />
      </div>
      <div className="flex gap-3">
        <div className="size-6 shrink-0 animate-pulse rounded-full bg-muted-foreground/15" />
        <div className="flex min-w-0 flex-1 flex-col gap-2 px-1 pt-1">
          <Skeleton className="h-3.5 w-full bg-muted-foreground/15" />
          <Skeleton className="h-3.5 w-11/12 bg-muted-foreground/15" />
          <Skeleton className="h-3.5 w-2/3 bg-muted-foreground/15" />
        </div>
      </div>
    </div>
  );
}

/** Skeleton for the overview column: a few label/value pairs. */
export function MetaSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      {Array.from({ length: rows }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: positional skeleton
        <div key={i} className="flex flex-col gap-1.5">
          <Skeleton className="h-3 w-12 bg-muted-foreground/15" />
          <Skeleton className="h-3.5 w-20 bg-muted-foreground/15" />
        </div>
      ))}
    </div>
  );
}

export function Avatar({ who }: { who: "user" | "assistant" }) {
  const Icon = who === "user" ? IconUserFilled : IconGhostFilled;
  return (
    <div
      className={cn(
        who === "user" && "mt-1.5",
        "flex size-6 shrink-0 items-center justify-center rounded-full bg-muted-foreground/15 text-muted-foreground shadow-(--custom-shadow)",
      )}
    >
      <Icon className="size-3.5" />
    </div>
  );
}

// Same bubble as the session page: user text in a card, assistant markdown
// as prose with a hover copy button.
export function Bubble({
  who,
  text,
}: {
  who: "user" | "assistant";
  text: string;
}) {
  const isUser = who === "user";
  return (
    <div className="group/bubble flex gap-3">
      <Avatar who={who} />
      <div
        className={
          isUser
            ? "min-w-0 flex-1 corner-squircle rounded-lg squircle:rounded-2xl bg-card dark:bg-muted-foreground/10 shadow-(--custom-shadow) px-3 py-2.5"
            : "min-w-0 flex-1 px-1 py-0"
        }
      >
        {isUser ? (
          <p className="whitespace-pre-wrap wrap-break-word text-sm">{text}</p>
        ) : (
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1 text-sm leading-relaxed [&_li]:my-0.5 [&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1.5 [&_pre]:my-2 [&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5 *:last:mb-0 [&>*:first-child>*:first-child]:mt-0 [&>*:first-child>*:first-child>*:first-child]:mt-0">
              <Streamdown
                components={markdownComponents}
                controls={{ table: false }}
              >
                {text}
              </Streamdown>
            </div>
            <div className="shrink-0 opacity-0 transition-opacity group-hover/bubble:opacity-100">
              <CopyButton value={text} title="Copy output" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** The assistant slot for a structured answer: the same row as a prose
 * bubble, with the JSON viewer where the markdown would be. One block per
 * value, so an output that is a parts array reads as its pieces. The block's
 * own scroll cap is lifted — the drawer clamps the whole exchange instead. */
export function JsonBubble({ data }: { data: unknown[] }) {
  const copy = data
    .map((d) => {
      try {
        return JSON.stringify(d, null, 2);
      } catch {
        return String(d);
      }
    })
    .join("\n\n");
  return (
    <div className="group/bubble flex gap-3">
      <Avatar who="assistant" />
      <div className="flex min-w-0 flex-1 items-start justify-between gap-2 px-1">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {data.map((d, i) => (
            <JsonBlock
              // biome-ignore lint/suspicious/noArrayIndexKey: positional
              key={i}
              data={d}
              className="max-h-none corner-squircle rounded-lg squircle:rounded-2xl bg-card p-3 shadow-(--custom-shadow) dark:bg-muted-foreground/10"
            />
          ))}
        </div>
        <div className="shrink-0 opacity-0 transition-opacity group-hover/bubble:opacity-100">
          <CopyButton value={copy} title="Copy output" />
        </div>
      </div>
    </div>
  );
}

/** Why a run has no output: an agent run that stopped after a tool call
 * never produced a final answer (the usual case for a blank root span). */
export function emptyOutputHint(spans: { spanType: string }[]): string {
  return spans.some((s) => s.spanType === "tool")
    ? "No final answer, the run ended after a tool call."
    : "No output was recorded for this run.";
}
