"use client";

import type {
  Confidence,
  DetectedPlan,
} from "@foglamp/contracts/instrumentation";
import { Card, CardContent } from "@foglamp/ui/components/card";
import { Checkbox } from "@foglamp/ui/components/checkbox";
import { Input } from "@foglamp/ui/components/input";
import { cn } from "@foglamp/ui/lib/utils";
import {
  IconGhostFilled,
  IconMessage2Filled,
  IconPencil,
  IconPencilFilled,
  type IconProps,
  IconSitemapFilled,
  IconUserFilled,
} from "@tabler/icons-react";
import { type ComponentType, memo, useState } from "react";

import type { EditsState, SetupFocus } from "./setup-board";

// What Foglamp decided, and why — one card, styled like the scan's left rail:
// airy sections instead of bordered rows, all scrolling inside the card so the
// page never scrolls. While the plan is awaiting approval every row is
// editable in place: names, one-off flags, and the run/session/customer id
// sources. Edits are overrides on top of the DETECTED values — the map keeps
// targeting the detected names, and clearing a field falls back to what the
// agent found.

/** Entries shown per section before folding behind "Show N more". */
const SHOWN = 4;

// Confidence renders only when it's a warning. A green "high" on every row is
// noise; an amber "medium"/"low" is exactly the row the user should read
// before approving.
function ConfidenceDot({ level }: { level: Confidence }) {
  if (level === "high") return null;
  return (
    <span
      className={cn(
        "flex shrink-0 items-center gap-1 text-[10px]",
        level === "medium"
          ? "text-amber-600 dark:text-amber-400"
          : "text-muted-foreground"
      )}
      title={`${level} confidence`}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {level}
    </span>
  );
}

/** One override commit from a row editor. `undefined` clears the override. */
export type EditPatch =
  | { kind: "agent"; id: string; name?: string; oneOff?: boolean }
  | { kind: "workflow"; id: string; name?: string; runIdSource?: string }
  | { kind: "session"; id: string; label?: string; sessionIdSource?: string }
  | { kind: "customer"; recommended?: boolean; idSource?: string };

/** A text field inside a row editor: label, current value, commit target. */
interface EditField {
  key: string;
  label: string;
  value: string;
  detected: string;
  maxLength: number;
  commit: (value: string | undefined) => void;
}

/** An on/off flag inside a row editor. */
interface EditFlag {
  label: string;
  value: boolean;
  detected: boolean;
  commit: (value: boolean | undefined) => void;
}

interface Entry {
  key: string;
  name: string;
  detail?: string;
  sourceRef?: string;
  rationale: string;
  confidence: Confidence;
  /** What this row spotlights on the map while hovered, if anything. */
  focus?: NonNullable<SetupFocus>;
  /** Any override currently diverging from the detected value. */
  edited?: boolean;
  fields?: EditField[];
  flag?: EditFlag;
}

// Committing on blur/Enter (not per keystroke) keeps the full-viewport map
// from re-rendering while the user types.
function FieldInput({ field }: { field: EditField }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] text-muted-foreground">{field.label}</span>
      <Input
        defaultValue={field.value}
        maxLength={field.maxLength}
        placeholder={field.detected}
        className="h-7 rounded-lg px-2 text-[12px] md:text-[12px]"
        onBlur={(e) => {
          const v = e.currentTarget.value.trim();
          field.commit(v === "" || v === field.detected ? undefined : v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
    </label>
  );
}

function RowEditor({
  entry,
  onDone,
  onReset,
}: {
  entry: Entry;
  onDone: () => void;
  onReset: () => void;
}) {
  return (
    <div
      className="mt-1.5 flex flex-col gap-2 rounded-lg bg-muted/60 p-2.5"
      // Clicks inside the editor must not fly the map or toggle the row.
      onClick={(e) => e.stopPropagation()}
    >
      {entry.fields?.map((f) => (
        <FieldInput key={f.key} field={f} />
      ))}
      {entry.flag ? (
        <label className="flex cursor-pointer items-center gap-2 py-0.5 text-[11px]">
          <Checkbox
            checked={entry.flag.value}
            onCheckedChange={(checked) =>
              entry.flag!.commit(
                checked === entry.flag!.detected ? undefined : checked
              )
            }
          />
          {entry.flag.label}
        </label>
      ) : null}
      <div className="flex items-center justify-end gap-3">
        {entry.edited ? (
          <button
            type="button"
            onClick={onReset}
            className="text-[10px] cursor-pointer text-muted-foreground/70 hover:text-foreground"
          >
            Reset
          </button>
        ) : null}
        <button
          type="button"
          onClick={onDone}
          className="text-[10px] font-medium cursor-pointer text-foreground/80 hover:text-foreground"
        >
          Done
        </button>
      </div>
    </div>
  );
}

function Row({
  entry,
  editable,
  onFocus,
  onSelect,
  onReset,
}: {
  entry: Entry;
  editable: boolean;
  onFocus?: (focus: SetupFocus) => void;
  onSelect?: (focus: NonNullable<SetupFocus>) => void;
  onReset?: (entry: Entry) => void;
}) {
  // The editor is uncontrolled and keyed by nothing, so closing it drops any
  // half-typed value that was never committed — exactly right for "Done".
  const [editing, setEditing] = useState(false);
  const hoverable = entry.focus !== undefined && onFocus !== undefined;
  const clickable =
    entry.focus !== undefined && onSelect !== undefined && !editing;
  const canEdit =
    editable && (entry.fields !== undefined || entry.flag !== undefined);
  return (
    <li
      className={cn(
        "group/row flex flex-col gap-0.5",
        // The row is the legend now: hovering it spotlights its subject on
        // the map, so give it a whisper of hover feedback of its own.
        (hoverable || canEdit) &&
          "-mx-3 rounded-md px-3 py-1.5 hover:bg-muted/60 select-none",
        clickable && "cursor-pointer"
      )}
      onMouseEnter={hoverable ? () => onFocus(entry.focus ?? null) : undefined}
      onMouseLeave={hoverable ? () => onFocus(null) : undefined}
      // Clicking flies the map to the row's subject (the hover only dims).
      onClick={clickable ? () => onSelect(entry.focus!) : undefined}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-baseline gap-1.5">
          <span className="truncate text-[13px]">{entry.name}</span>
          {entry.edited ? (
            <span
              className="shrink-0 text-[9px] font-medium text-sky-600 dark:text-sky-400"
              title="Changed from what was detected"
            >
              edited
            </span>
          ) : null}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <ConfidenceDot level={entry.confidence} />
          {canEdit ? (
            <button
              type="button"
              aria-label={`Edit ${entry.name}`}
              onClick={(e) => {
                e.stopPropagation();
                setEditing((v) => !v);
              }}
              className={cn(
                "cursor-pointer text-muted-foreground hover:text-foreground",
                // Reveal on row hover; stay visible while the editor is open.
                !editing &&
                  "opacity-0 transition-opacity group-hover/row:opacity-100",
                editing && "text-foreground"
              )}
            >
              <IconPencilFilled className="size-3.5" />
            </button>
          ) : null}
        </span>
      </div>
      {editing ? (
        <RowEditor
          entry={entry}
          onDone={() => setEditing(false)}
          onReset={() => onReset?.(entry)}
        />
      ) : (
        <>
          {entry.detail ? (
            <p className="text-[11px] line-clamp-2 text-muted-foreground">
              {entry.detail}
            </p>
          ) : null}
          <p className="line-clamp-1 text-[11px] leading-relaxed text-muted-foreground mt-0.75">
            {entry.rationale}
          </p>
          {entry.sourceRef ? (
            <p className="truncate font-mono text-[9px] text-muted-foreground/50 mt-0.5">
              {entry.sourceRef}
            </p>
          ) : null}
        </>
      )}
    </li>
  );
}

function Section({
  label,
  Icon,
  iconClassName,
  entries,
  editable,
  onFocus,
  onSelect,
  onReset,
}: {
  label: string;
  Icon: ComponentType<IconProps>;
  /** Map vocabulary: the same tint this thing carries on the flow map. */
  iconClassName: string;
  entries: Entry[];
  editable: boolean;
  onFocus?: (focus: SetupFocus) => void;
  onSelect?: (focus: NonNullable<SetupFocus>) => void;
  onReset?: (entry: Entry) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  if (entries.length === 0) return null;
  const shown = expanded ? entries : entries.slice(0, SHOWN);
  const hidden = entries.length - shown.length;

  return (
    <section className="mt-5 px-1 first:mt-1">
      <h2 className="mb-3 ml-px flex items-center gap-2 text-[13px] text-muted-foreground">
        <Icon className={cn("size-3.5 mb-px", iconClassName)} />
        <span className="leading-none font-medium text-foreground">
          {label} <span className="opacity-50">{entries.length}</span>
        </span>
      </h2>
      <ul className="flex list-none flex-col gap-0.5">
        {shown.map((e) => (
          <Row
            key={e.key}
            entry={e}
            editable={editable}
            onFocus={onFocus}
            onSelect={onSelect}
            onReset={onReset}
          />
        ))}
      </ul>
      {hidden > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-3 text-[11px] font-medium cursor-pointer text-muted-foreground/50 hover:text-foreground"
        >
          Show {hidden} more
        </button>
      ) : null}
    </section>
  );
}

/** Override wins unless it was cleared. */
function eff<T>(override: T | undefined, detected: T): T {
  return override ?? detected;
}

function isEdited<T>(override: T | undefined, detected: T): boolean {
  return override !== undefined && override !== detected;
}

// Memoized: hover-driven focus renders in the parent shouldn't re-render the
// list that's being hovered. Edit commits DO re-render it (the `edits` prop
// changes), which is the point.
export const DecisionList = memo(function DecisionList({
  plan,
  edits,
  editable,
  onEdit,
  onFocus,
  onSelect,
}: {
  plan: DetectedPlan;
  edits: EditsState;
  /** Rows accept changes only while the plan is awaiting approval. */
  editable: boolean;
  onEdit: (patch: EditPatch) => void;
  onFocus?: (focus: SetupFocus) => void;
  /** Click-to-focus: fly the map to the row's subject. */
  onSelect?: (focus: NonNullable<SetupFocus>) => void;
}) {
  const { agents, workflows, sessions, customer } = plan.decisions;
  const customerOn = eff(edits.customer?.recommended, customer.recommended);
  const customerIdSource = eff(edits.customer?.idSource, customer.idSource);

  return (
    <Card className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[36px] squircle:rounded-[36px] py-0">
      {/* Scroll (and all vertical padding) lives on the content so the fade
          mask reaches the card edges and dissolves rows, not the card. */}
      <CardContent className="scroll-fade no-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-5 pb-10">
        <Section
          label="Agents"
          Icon={IconGhostFilled}
          iconClassName="text-orange-500"
          editable={editable}
          onFocus={onFocus}
          onSelect={onSelect}
          onReset={(e) => onEdit({ kind: "agent", id: e.key })}
          entries={agents.map((a) => {
            const o = edits.agents[a.id];
            const oneOff = eff(o?.oneOff, a.oneOff ?? false);
            return {
              key: a.id,
              name: eff(o?.name, a.name),
              // The map draws the DETECTED graph — renaming the decision must
              // not break the row's spotlight, so focus keeps the found name.
              focus: { type: "agent" as const, name: a.name },
              // One-off is the unremarkable case — only a real agent loop
              // earns a label.
              detail: oneOff ? undefined : "Agent loop",
              sourceRef: a.sourceRef,
              rationale: a.rationale,
              confidence: a.confidence,
              edited:
                isEdited(o?.name, a.name) ||
                isEdited(o?.oneOff, a.oneOff ?? false),
              fields: [
                {
                  key: "name",
                  label: "Agent name",
                  value: eff(o?.name, a.name),
                  detected: a.name,
                  maxLength: 48,
                  commit: (name: string | undefined) =>
                    onEdit({
                      kind: "agent",
                      id: a.id,
                      name,
                      oneOff: o?.oneOff,
                    }),
                },
              ],
              flag: {
                label: "One-off trace (no agent loop)",
                value: oneOff,
                detected: a.oneOff ?? false,
                commit: (flag: boolean | undefined) =>
                  onEdit({
                    kind: "agent",
                    id: a.id,
                    name: o?.name,
                    oneOff: flag,
                  }),
              },
            };
          })}
        />
        <Section
          label="Workflows"
          Icon={IconSitemapFilled}
          iconClassName="text-emerald-500"
          editable={editable}
          onFocus={onFocus}
          onSelect={onSelect}
          onReset={(e) => onEdit({ kind: "workflow", id: e.key })}
          entries={workflows.map((w) => {
            const o = edits.workflows[w.id];
            const runIdSource = eff(o?.runIdSource, w.runIdSource);
            return {
              key: w.id,
              name: eff(o?.name, w.name),
              focus: { type: "workflow" as const, name: w.name },
              detail: `Run id from ${runIdSource}`,
              sourceRef: w.sourceRef,
              rationale: w.rationale,
              confidence: w.confidence,
              edited:
                isEdited(o?.name, w.name) ||
                isEdited(o?.runIdSource, w.runIdSource),
              fields: [
                {
                  key: "name",
                  label: "Workflow name",
                  value: eff(o?.name, w.name),
                  detected: w.name,
                  maxLength: 48,
                  commit: (name: string | undefined) =>
                    onEdit({
                      kind: "workflow",
                      id: w.id,
                      name,
                      runIdSource: o?.runIdSource,
                    }),
                },
                {
                  key: "runIdSource",
                  label: "Run id comes from",
                  value: runIdSource,
                  detected: w.runIdSource,
                  maxLength: 160,
                  commit: (src: string | undefined) =>
                    onEdit({
                      kind: "workflow",
                      id: w.id,
                      name: o?.name,
                      runIdSource: src,
                    }),
                },
              ],
            };
          })}
        />

        <Section
          label="Conversations"
          Icon={IconMessage2Filled}
          iconClassName="text-sky-500"
          editable={editable}
          onReset={(e) => onEdit({ kind: "session", id: e.key })}
          entries={sessions.map((s) => {
            const o = edits.sessions[s.id];
            const sessionIdSource = eff(o?.sessionIdSource, s.sessionIdSource);
            return {
              key: s.id,
              name: eff(o?.label, s.label),
              detail: `Thread id from ${sessionIdSource}`,
              sourceRef: s.sourceRef,
              rationale: s.rationale,
              confidence: s.confidence,
              edited:
                isEdited(o?.label, s.label) ||
                isEdited(o?.sessionIdSource, s.sessionIdSource),
              fields: [
                {
                  key: "label",
                  label: "Conversation label",
                  value: eff(o?.label, s.label),
                  detected: s.label,
                  maxLength: 48,
                  commit: (label: string | undefined) =>
                    onEdit({
                      kind: "session",
                      id: s.id,
                      label,
                      sessionIdSource: o?.sessionIdSource,
                    }),
                },
                {
                  key: "sessionIdSource",
                  label: "Thread id comes from",
                  value: sessionIdSource,
                  detected: s.sessionIdSource,
                  maxLength: 160,
                  commit: (src: string | undefined) =>
                    onEdit({
                      kind: "session",
                      id: s.id,
                      label: o?.label,
                      sessionIdSource: src,
                    }),
                },
              ],
            };
          })}
        />
        {/* Always shown, including the "no" answer — a user should be able to
            see that per-customer attribution was considered and skipped, and
            flip it on if they know better. */}
        <Section
          label="Customer attribution"
          Icon={IconUserFilled}
          iconClassName="text-violet-500"
          editable={editable}
          onReset={() => onEdit({ kind: "customer" })}
          entries={[
            {
              key: "customer",
              name: customerOn ? "Enabled" : "Not recommended",
              detail:
                customerOn && customerIdSource
                  ? `Customer id from ${customerIdSource}`
                  : customerOn
                    ? "Needs a customer id source before approving"
                    : undefined,
              rationale: customer.rationale,
              confidence: customer.confidence,
              edited:
                isEdited(edits.customer?.recommended, customer.recommended) ||
                isEdited(edits.customer?.idSource, customer.idSource),
              fields: [
                {
                  key: "idSource",
                  label: "Customer id comes from",
                  value: customerIdSource ?? "",
                  detected: customer.idSource ?? "",
                  maxLength: 160,
                  commit: (src: string | undefined) =>
                    onEdit({
                      kind: "customer",
                      recommended: edits.customer?.recommended,
                      idSource: src,
                    }),
                },
              ],
              flag: {
                label: "Attribute traces to customers",
                value: customerOn,
                detected: customer.recommended,
                commit: (on: boolean | undefined) =>
                  onEdit({
                    kind: "customer",
                    recommended: on,
                    idSource: edits.customer?.idSource,
                  }),
              },
            },
          ]}
        />
      </CardContent>
    </Card>
  );
});
