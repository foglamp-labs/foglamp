"use client";

import { Button } from "@foglamp/ui/components/button";
import { Calendar } from "@foglamp/ui/components/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@foglamp/ui/components/popover";
import { IconCalendarEventFilled, IconChevronDown } from "@tabler/icons-react";
import { useState } from "react";
import type { DateRange } from "react-day-picker";

import {
  customRange,
  RANGE_PRESETS,
  resolvePreset,
  type RangeValue,
} from "@/lib/range";

export function RangePicker({
  value,
  onChange,
}: {
  value: RangeValue;
  onChange: (value: RangeValue) => void;
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
            variant="outline"
            className="w-fit justify-start px-8 gap-2 active:scale-100"
          />
        }
      >
        <IconCalendarEventFilled className="text-muted-foreground ml-1.5" />
        <span className="truncate pr-4">{value.label}</span>
        <IconChevronDown className="ml-auto size-4 opacity-40 mr-1 mt-px stroke-1" />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="flex-row w-auto gap-0 overflow-hidden p-0"
      >
        <div className="flex w-40 flex-col gap-1 border-r dark:border-[#252525] border-[#EFEFEF] p-3">
          {RANGE_PRESETS.map((p) => (
            <Button
              key={p.key}
              variant={value.key === p.key ? "secondary" : "ghost"}
              size="sm"
              className="justify-start font-normal"
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
