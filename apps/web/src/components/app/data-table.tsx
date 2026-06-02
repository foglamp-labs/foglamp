"use client";

import { Button } from "@foglamp/ui/components/button";
import { Input } from "@foglamp/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@foglamp/ui/components/select";
import { TableHead } from "@foglamp/ui/components/table";
import { cn } from "@foglamp/ui/lib/utils";
import {
  type Icon,
  IconArrowDown,
  IconArrowsSort,
  IconArrowUp,
  IconSearch,
  IconX,
} from "@tabler/icons-react";
import { AnimatePresence, motion } from "motion/react";
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

export type SortDir = "asc" | "desc";
export type SortState<K extends string> = { key: K; dir: SortDir };

/**
 * Tri-state sort for a table. Each column cycles on click:
 * unsorted → descending → ascending → unsorted. `sort` is `null` while no
 * column is active (the table falls back to its natural/default order).
 * Returned `toggle` is wired to <SortableHead>.
 */
export function useTableSort<K extends string>(
  initial: SortState<K> | null = null
) {
  const [sort, setSort] = useState<SortState<K> | null>(initial);
  const toggle = (key: K) =>
    setSort((s) => {
      if (!s || s.key !== key) return { key, dir: "desc" };
      if (s.dir === "desc") return { key, dir: "asc" };
      return null; // was ascending → clear sorting
    });
  return { sort, toggle, setSort };
}

/** Stable client-side sort: nulls always sort last, numbers numerically, and
 * everything else lexicographically. A `null` sort leaves the rows in their
 * original order. Use for full-list tables (the server sorts the paginated
 * ones). */
export function sortRows<T, K extends string>(
  rows: readonly T[],
  sort: SortState<K> | null,
  accessors: Record<K, (row: T) => string | number | null | undefined>
): T[] {
  if (!sort) return [...rows];
  const get = accessors[sort.key];
  const sign = sort.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = get(a);
    const bv = get(b);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === "number" && typeof bv === "number")
      return (av - bv) * sign;
    return String(av).localeCompare(String(bv)) * sign;
  });
}

/** A header cell that cycles its column's sort on click (desc → asc → off),
 * with a direction arrow that brightens while the column is active. */
export function SortableHead<K extends string>({
  sortKey,
  sort,
  onSort,
  align = "left",
  className,
  children,
}: {
  sortKey: K;
  sort: SortState<K> | null;
  onSort: (key: K) => void;
  align?: "left" | "right" | "center";
  className?: string;
  children: React.ReactNode;
}) {
  const active = sort?.key === sortKey;
  const Arrow = active
    ? sort.dir === "asc"
      ? IconArrowUp
      : IconArrowDown
    : IconArrowsSort;
  // The whole header cell is the click/hover target (not just the label), so
  // sorting is easy to hit anywhere in the column header. Keyboard-operable via
  // tabIndex + Enter/Space.
  return (
    <TableHead
      align={align}
      aria-sort={
        active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"
      }
      tabIndex={0}
      onClick={() => onSort(sortKey)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSort(sortKey);
        }
      }}
      className={cn(
        "group cursor-pointer select-none outline-none focus-visible:ring-[1.5px] focus-visible:ring-inset focus-visible:ring-ring/50",
        className
      )}
    >
      <span
        className={cn(
          "inline-flex flex-row-reverse items-center gap-1.5 text-foreground"
        )}
      >
        <Arrow
          className="size-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
          stroke={1.5}
        />
        <span>{children}</span>
      </span>
    </TableHead>
  );
}

// ---------------------------------------------------------------------------
// Filter toolbar
// ---------------------------------------------------------------------------

// Coordinates the open state of the FilterSelects within one Toolbar so that,
// while any dropdown is open, hovering a sibling trigger switches straight to it
// (no need to click to close one and click again to open the next). `null` means
// nothing is open.
const FilterGroupContext = createContext<{
  openId: string | null;
  setOpenId: React.Dispatch<React.SetStateAction<string | null>>;
} | null>(null);

/** A horizontal bar of filter controls, sitting above a table. Wraps on narrow
 * widths. Also coordinates its FilterSelects' open state (see FilterGroupContext). */
export function Toolbar({ children }: { children: React.ReactNode }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const group = useMemo(() => ({ openId, setOpenId }), [openId]);
  return (
    <FilterGroupContext.Provider value={group}>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </FilterGroupContext.Provider>
  );
}

/** A compact search field with a leading icon and a clear button. */
export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative w-56", className)}>
      <IconSearch className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-neutral-500" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-8 rounded-full px-8 dark:bg-input/20"
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange("")}
          className="absolute top-1/2 right-2 flex size-4 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-muted-foreground/60 hover:text-foreground"
        >
          <IconX className="size-3.5" />
        </button>
      )}
    </div>
  );
}

/** A boolean filter toggle (e.g. "Errors only"). Inactive, it mirrors the
 * SelectTrigger surface (shadow in light / border in dark) so it sits uniformly
 * beside the FilterSelects; active, it takes a rose highlight. */
export function ToggleChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-2xl corner-squircle px-3 text-sm font-normal whitespace-nowrap shadow-(--custom-shadow) transition-colors dark:border dark:border-border/50 dark:shadow-none",
        active
          ? "bg-rose-500/10 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400"
          : "bg-transparent text-muted-foreground/50 [&_svg]:text-neutral-500 dark:bg-input/20 dark:hover:bg-input/50"
      )}
    >
      {children}
    </button>
  );
}

/** A compact dropdown filter with an "All" reset option (empty string). Sized to
 * match the other toolbar controls. */
export function FilterSelect<T extends string>({
  value,
  onChange,
  allLabel,
  options,
  icon: IconComp,
  className,
}: {
  value: T | "";
  onChange: (value: T | "") => void;
  /** Label for the reset option and the empty-state placeholder, e.g. "Any status". */
  allLabel: string;
  options: { value: T; label: string; icon?: Icon }[];
  /** Leading icon for the trigger; shown for the "all" state and as the
   * fallback for options that don't define their own. */
  icon?: Icon;
  className?: string;
}) {
  // The trigger leads with the selected option's icon, falling back to the
  // filter's own icon (the "all"/placeholder state).
  const TriggerIcon = options.find((o) => o.value === value)?.icon ?? IconComp;

  // Coordinate open state with sibling filters (see FilterGroupContext). Falls
  // back to Base UI's own uncontrolled state when used outside a Toolbar.
  const group = useContext(FilterGroupContext);
  const id = useId();

  return (
    <Select<T | "", false>
      value={value}
      onValueChange={(v) => onChange(v ?? "")}
      // Non-modal so sibling triggers stay hoverable while this one is open.
      modal={false}
      open={group ? group.openId === id : undefined}
      onOpenChange={(isOpen) =>
        group?.setOpenId((curr) => (isOpen ? id : curr === id ? null : curr))
      }
    >
      <SelectTrigger
        size="sm"
        className={cn("rounded-full dark:bg-input/20 min-w-36", className)}
        onMouseEnter={() => {
          // If another filter is already open, switch to this one on hover.
          if (group && group.openId !== null && group.openId !== id) {
            group.setOpenId(id);
          }
        }}
      >
        {TriggerIcon && (
          <TriggerIcon className="size-4 shrink-0 text-neutral-500" />
        )}
        <SelectValue placeholder={allLabel} />
      </SelectTrigger>
      <SelectContent className="min-w-44" align="start" sideOffset={8}>
        {/* Explicit `label` keeps the value→label map (and SelectValue) text
            only, so the icon in the children doesn't render twice in the
            trigger. */}
        <SelectItem value="" label={allLabel}>
          {IconComp && (
            <IconComp className="size-4 shrink-0 text-neutral-500 mt-0.5" />
          )}
          {allLabel}
        </SelectItem>
        {options.map((o) => {
          const OptIcon = o.icon;
          return (
            <SelectItem key={o.value} value={o.value} label={o.label}>
              {OptIcon && (
                <OptIcon className="size-4 shrink-0 text-neutral-500 mt-0.5" />
              )}
              {o.label}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}

/** A ghost button that clears all active filters. Render at the end of a
 * Toolbar; visible only when `show` is true (a filter is active), fading +
 * blurring + scaling in and out via AnimatePresence. */
export function ClearFiltersButton({
  show,
  onClick,
}: {
  show: boolean;
  onClick: () => void;
}) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, scale: 0.98, x: -4 }}
          animate={{ opacity: 1, scale: 1, x: 0 }}
          exit={{ opacity: 0, scale: 0.98, x: -4 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          className="inline-flex"
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={onClick}
            className="h-8 text-muted-foreground rounded-2xl corner-squircle"
          >
            <IconX className="size-3.5" />
            Clear filters
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Gates a loading skeleton behind a delay so quick loads don't flash one.
 * Returns true only once `loading` has stayed true for `delay` ms; loads that
 * resolve sooner never show the skeleton. Render `null` (not the empty state)
 * while loading but this is still false. */
export function useDelayedLoading(loading: boolean, delay = 700): boolean {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!loading) {
      setShow(false);
      return;
    }
    const id = setTimeout(() => setShow(true), delay);
    return () => clearTimeout(id);
  }, [loading, delay]);
  return show;
}

/** Debounces a rapidly-changing value (e.g. a search box) so server-backed
 * tables don't refetch on every keystroke. */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

/** Convenience: debounced-free filter for a free-text search over one or more
 * string fields of a row. Case-insensitive substring match. */
export function useTextFilter<T>(
  rows: readonly T[],
  query: string,
  fields: (row: T) => (string | null | undefined)[]
): T[] {
  return useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [...rows];
    return rows.filter((row) =>
      fields(row).some((f) => f?.toLowerCase().includes(q))
    );
    // `fields` is a stable inline accessor; intentionally omitted from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, query]);
}
