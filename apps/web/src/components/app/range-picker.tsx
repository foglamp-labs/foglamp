"use client";

import { Button } from "@foglamp/ui/components/button";
import { Calendar } from "@foglamp/ui/components/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@foglamp/ui/components/popover";
import { cn } from "@foglamp/ui/lib/utils";
import {
  IconCalendar,
  IconCalendarEventFilled,
  IconCalendarFilled,
  IconChevronDown,
} from "@tabler/icons-react";
import { useState } from "react";
import type { DateRange } from "react-day-picker";

import {
  RANGE_PRESETS,
  type RangeValue,
  customRange,
  resolvePreset,
} from "@/lib/range";

// One-click range presets surfaced as chips beside the calendar picker.
const QUICK_PRESETS = ["24h", "3d", "7d"] as const;

/** Quick-range chips + the calendar RangePicker. While a chip is active the
 * picker collapses to its icon — the label would only repeat the chip. */
export function RangeControl({
  value,
  onChange,
}: {
  value: RangeValue;
  onChange: (value: RangeValue) => void;
}) {
  const quickActive = (QUICK_PRESETS as readonly string[]).includes(value.key);
  return (
    <div className="flex items-center gap-2">
      {QUICK_PRESETS.map((key) => {
        const active = value.key === key;
        return (
          <Button
            key={key}
            variant={active ? "secondary" : "outline"}
            aria-pressed={active}
            className={cn(
              // transition-[color,box-shadow] leaves background-color out of
              // Button's transition-all, so the hover bg snaps instantly —
              // intentional; the calendar trigger below matches it.
              "font-normal tabular-nums bg-card transition-[color,box-shadow] active:scale-100",
              !active && "text-muted-foreground/50"
            )}
            onClick={() => onChange(resolvePreset(key))}
          >
            {key}
          </Button>
        );
      })}
      <RangePicker value={value} onChange={onChange} compact={quickActive} />
    </div>
  );
}

export function RangePicker({
  value,
  onChange,
  compact = false,
}: {
  value: RangeValue;
  onChange: (value: RangeValue) => void;
  /** Icon-only trigger (the surrounding UI already conveys the range). */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  // The calendar shows the current range highlighted (draft seeded on open), but
  // the first click of a new selection starts fresh — selecting against a
  // complete range would otherwise extend it and close on the first click.
  // `picking` tracks whether we're mid-selection.
  const [draft, setDraft] = useState<DateRange | undefined>(undefined);
  const [picking, setPicking] = useState(false);

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setDraft({ from: value.from, to: value.to });
          setPicking(false);
        }
      }}
    >
      <PopoverTrigger
        render={
          <Button
            // Mirrors the quick chips: whichever segment holds the current
            // selection renders secondary. `compact` means a chip owns it,
            // so the picker drops back to the plain outline surface.
            variant={compact ? "outline" : "secondary"}
            // Instant hover bg (no ease), matching the quick chips above.
            className="w-fit justify-start transition-[color,box-shadow] bg-card aria-expanded:bg-muted/50 dark:hover:bg-muted dark:aria-expanded:bg-muted active:scale-100 font-normal gap-1.5"
          />
        }
      >
        <IconCalendarFilled
          className={cn(
            "ml-0.5 mb-px",
            compact ? "text-muted-foreground/50" : "text-foreground/95"
          )}
        />
        {!compact && (
          <span className="truncate pr-1 pl-0.5">{value.label}</span>
        )}
        <IconChevronDown className="ml-auto size-3.5 text-muted-foreground/50 mt-px" />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={10}
        className="flex-row w-auto gap-0 overflow-hidden p-0"
      >
        <div className="flex w-40 flex-col gap-1 border-r dark:border-[#252525] border-[#EFEFEF] p-3">
          {RANGE_PRESETS.map((p) => (
            <Button
              key={p.key}
              variant={value.key === p.key ? "secondary" : "ghost"}
              size="sm"
              className={cn("justify-start font-normal transition-transform")}
              onClick={() => {
                onChange(resolvePreset(p.key));
                setOpen(false);
              }}
            >
              {p.label}
            </Button>
          ))}
        </div>
        <div className="p-1">
          <Calendar
            mode="range"
            className="**:data-day:transition-none"
            numberOfMonths={2}
            defaultMonth={value.from}
            selected={draft}
            disabled={{ after: new Date() }}
            onSelect={(range, triggerDate) => {
              if (!picking) {
                // First click of a new selection: start fresh from the clicked
                // day instead of extending the highlighted range.
                setDraft({ from: triggerDate, to: undefined });
                setPicking(true);
                return;
              }
              // Second click: the range is complete → apply and close.
              setDraft(range);
              setPicking(false);
              if (range?.from && range.to) {
                onChange(customRange(range.from, range.to));
                setOpen(false);
              }
            }}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
