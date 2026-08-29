"use client";

import * as React from "react";

import { cn } from "@foglamp/ui/lib/utils";

type TableContextValue = {
  stickyHeader: boolean;
};

const TableContext = React.createContext<TableContextValue>({
  stickyHeader: false,
});

const alignClass = {
  left: "text-left",
  center: "text-center",
  right: "text-right tabular-nums",
} as const;

type Align = keyof typeof alignClass;

function Table({
  className,
  maxHeight,
  stickyHeader,
  ...props
}: React.ComponentProps<"table"> & {
  /** Cap the table height so the body scrolls internally (enables a sticky header). */
  maxHeight?: number | string;
  /** Pin the header while the body scrolls. Auto-enabled when `maxHeight` is set. */
  stickyHeader?: boolean;
}) {
  const scrollable = maxHeight != null;
  const sticky = stickyHeader ?? scrollable;
  // A sticky header with no internal max-height pins against the *page*
  // scroll — any overflow on this wrapper would create a scroll container
  // that traps `position: sticky`, so the wrapper stays overflow-visible.
  const stickyPage = sticky && !scrollable;
  const containerRef = React.useRef<HTMLDivElement>(null);
  // When the table is wider than its container the horizontal scroll should
  // stay contained to the table, not spill into the page. CSS can't express
  // "overflow only when overflowing", so measure: restore overflow-x-auto
  // only while the table actually overflows (the pinned header is sacrificed
  // in that cramped state — sticky can't survive a scroll container).
  const [overflowing, setOverflowing] = React.useState(false);
  React.useEffect(() => {
    if (!stickyPage) return;
    const el = containerRef.current;
    const table = el?.querySelector("table");
    if (!el || !table) return;
    const measure = () =>
      setOverflowing(table.offsetWidth > el.clientWidth + 1);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    ro.observe(table);
    return () => ro.disconnect();
  }, [stickyPage]);
  return (
    <TableContext.Provider value={{ stickyHeader: sticky }}>
      <div
        ref={containerRef}
        data-slot="table-container"
        className={cn(
          "relative w-full",
          (!stickyPage || overflowing) && "overflow-x-auto",
          scrollable && "overflow-y-auto"
        )}
        style={scrollable ? { maxHeight } : undefined}
      >
        <table
          data-slot="table"
          className={cn(
            "w-full caption-bottom text-sm",
            // Extra right padding on the last column pulls its content in from
            // the screen edge so right-aligned values are easier to scan.
            // Applied here (not on TableHead/TableCell) so it wins over their
            // px-8 and covers any cell component in the last slot.
            "[&_th:last-child]:pr-9 [&_td:last-child]:pr-9",
            className
          )}
          {...props}
        />
      </div>
    </TableContext.Provider>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  const { stickyHeader } = React.useContext(TableContext);
  return (
    <thead
      data-slot="table-header"
      className={cn(
        // Height on the row too: Safari doesn't propagate a thead height down
        // to its tr the way Chromium does.
        "h-13 [&_tr]:h-13",
        // When sticky, a solid page bg so scrolling rows don't show through.
        // The row's border-b doesn't travel with a sticky thead under
        // border-collapse, so draw the bottom rule as an inset shadow on the
        // cells (same color as the body row borders) and drop the row's own
        // border so the two don't stack into a thicker line at rest.
        stickyHeader &&
          "sticky top-0 z-10 bg-background [&_tr]:border-b-0 [&_th]:shadow-[inset_0_-1px_0_0] [&_th]:shadow-border/50 dark:[&_th]:shadow-border/40",
        className
      )}
      {...props}
    />
  );
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  );
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t dark:border-[#1E1E1E] border-[#EBEBEB] bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  );
}

function TableRow({
  className,
  interactive,
  onClick,
  onKeyDown,
  tabIndex,
  ...props
}: React.ComponentProps<"tr"> & {
  /** Clickable row: adds hover/pointer, a focus ring, and Enter/Space activation. */
  interactive?: boolean;
}) {
  // Mirror a click on Enter/Space so interactive rows are keyboard-operable.
  const handleKeyDown =
    interactive && onClick
      ? (e: React.KeyboardEvent<HTMLTableRowElement>) => {
          onKeyDown?.(e);
          if (!e.defaultPrevented && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            e.currentTarget.click();
          }
        }
      : onKeyDown;

  return (
    <tr
      data-slot="table-row"
      data-interactive={interactive || undefined}
      tabIndex={interactive ? (tabIndex ?? 0) : tabIndex}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      className={cn(
        "[&_th:last-child]:border-0 border-b dark:border-border/40 border-border/50 data-[state=selected]:bg-muted has-aria-expanded:bg-muted/50",
        "data-interactive:cursor-pointer data-interactive:hover:bg-muted data-interactive:outline-none data-interactive:focus-visible:bg-muted/50 data-interactive:focus-visible:ring-[1.5px] data-interactive:focus-visible:ring-inset data-interactive:focus-visible:ring-ring/50",
        // Hide the hovered row's bottom border and the previous row's (which
        // draws the hovered row's top edge) so the highlight reads as one
        // seamless block instead of a stripe with lines through it. An
        // expanded row (aria-expanded=true) is already one block with the
        // drawer beneath it and keeps its top edge on hover.
        "data-interactive:hover:border-transparent has-[+tr[data-interactive]:not([aria-expanded=true]):hover]:border-transparent",
        className
      )}
      {...props}
    />
  );
}

function TableHead({
  className,
  align,
  ...props
}: Omit<React.ComponentProps<"th">, "align"> & { align?: Align }) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "text-left align-middle font-medium whitespace-nowrap has-[[role=checkbox]]:pr-0 px-8.25",
        // Vertical column dividers (none on the leftmost cell). More prominent
        // than the body cells to emphasize the header.
        // "border-l border-neutral-200 first:border-l-0 dark:border-neutral-800 [&_tr]:border-b",
        align && alignClass[align],
        className
      )}
      {...props}
    />
  );
}

function TableCell({
  className,
  align,
  ...props
}: Omit<React.ComponentProps<"td">, "align"> & { align?: Align }) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "align-middle whitespace-nowrap has-[[role=checkbox]]:pr-0 py-2 px-8.25",
        // Vertical column dividers (none on the leftmost cell).
        // "border-l border-[#EBEBEB] first:border-l-0 dark:border-[#1E1E1E]",
        align && alignClass[align],
        className
      )}
      {...props}
    />
  );
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn(
        "py-2 text-sm text-muted-foreground bg-muted/50 border-t dark:border-[#2A2A2A] border-[#EBEBEB]",
        className
      )}
      {...props}
    />
  );
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
};
