"use client";

import { formatCount } from "@/lib/format";
import {
  useHeaderActionsSlot,
  usePendingShrink,
} from "@/components/app/header-slot";
import { Button, buttonVariants } from "@foglamp/ui/components/button";
import { Input } from "@foglamp/ui/components/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@foglamp/ui/components/input-group";
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
  IconArrowDown,
  IconArrowUp,
  IconArrowsSort,
  IconChevronLeft,
  IconChevronRight,
  IconSearch,
  IconX,
} from "@tabler/icons-react";
import { AnimatePresence, motion } from "motion/react";
import { createPortal } from "react-dom";
import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  type ComponentType,
  createContext,
  useCallback,
  useLayoutEffect,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

// ---------------------------------------------------------------------------
// URL state
// ---------------------------------------------------------------------------

/**
 * Keeps a list view's filter/search/sort/page state in the URL query string so
 * it survives reload and back-navigation and can be shared as a link.
 *
 * `defaults` declares the managed keys; a key at its default value is dropped
 * from the URL. `patch` merges updates via history replace (no history spam),
 * skips writes that change nothing, and — because changing a filter
 * invalidates the current page — clears `page` on every patch that doesn't set
 * it explicitly. Same-tick patches accumulate in a ref so they don't clobber
 * each other (the router's searchParams only update after navigation).
 */
export function useUrlFilters<K extends string>(
  defaults: Record<K, string>
): [Record<K, string>, (updates: Partial<Record<K, string>>) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const values = {} as Record<K, string>;
  for (const key of Object.keys(defaults) as K[]) {
    values[key] = searchParams.get(key) ?? defaults[key];
  }

  // Same-tick accumulator, keyed to the searchParams snapshot it started from.
  const pendingRef = useRef<{ base: string; params: URLSearchParams } | null>(
    null
  );
  const defaultsRef = useRef(defaults);
  defaultsRef.current = defaults;

  const patch = useCallback(
    (updates: Partial<Record<K, string>>) => {
      const base = searchParams.toString();
      const params =
        pendingRef.current?.base === base
          ? pendingRef.current.params
          : new URLSearchParams(base);

      const changed = Object.entries(updates).some(
        ([k, v]) => (params.get(k) ?? defaultsRef.current[k as K]) !== v
      );
      if (!changed) return;

      for (const [k, v] of Object.entries(updates) as [K, string][]) {
        if (v === defaultsRef.current[k]) params.delete(k);
        else params.set(k, v);
      }
      if (!("page" in updates)) params.delete("page");

      pendingRef.current = { base, params };
      const qs = params.toString();
      // The query string varies at runtime, which typed routes can't model.
      router.replace((qs ? `${pathname}?${qs}` : pathname) as Route, {
        scroll: false,
      });
    },
    [router, pathname, searchParams]
  );

  return [values, patch];
}

/** Parse a `key:dir` sort param ("cost:desc") back into a SortState; unknown
 * keys/dirs yield null (the table's natural order). */
export function parseSortParam<K extends string>(
  value: string,
  validKeys: readonly K[]
): SortState<K> | null {
  const [key, dir] = value.split(":");
  if (!validKeys.includes(key as K)) return null;
  if (dir !== "asc" && dir !== "desc") return null;
  return { key: key as K, dir };
}

/** The next sort param in the tri-state cycle (desc → asc → off), serialized
 * for the URL. Mirrors useTableSort's toggle. */
export function cycleSortParam<K extends string>(
  sort: SortState<K> | null,
  key: K
): string {
  if (!sort || sort.key !== key) return `${key}:desc`;
  if (sort.dir === "desc") return `${key}:asc`;
  return "";
}

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
      {/* The arrow sits after the label but takes no layout space on
			    right-aligned columns (-mr-5 = its size-3.5 + gap-1.5 footprint,
			    hanging into the cell's right padding), so the label's right edge
			    lines up exactly with the numbers below. It only appears on hover
			    or when the column is actively sorted, keeping the resting header
			    a clean flush-right label. */}
      <span
        className={cn(
          "inline-flex flex-row-reverse items-center gap-1.5 text-foreground",
          align === "right" && "-mr-5"
        )}
      >
        <Arrow
          className={cn(
            "size-3.5 shrink-0 transition-[color,opacity]",
            active
              ? "text-foreground"
              : "text-muted-foreground opacity-0 group-hover:opacity-100",
            "group-hover:text-primary"
          )}
          stroke={active ? 2 : 1.5}
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
 * widths. Also coordinates its FilterSelects' open state (see FilterGroupContext).
 *
 * `trailing` holds the right-aligned controls (range picker, "New …" button).
 * When the filters plus trailing controls no longer fit on one line, the
 * trailing group is lifted into the page header's actions area (top right,
 * aligned with the title — as on Overview) instead of wrapping under the
 * filters. The fit check always sums the widths of both groups regardless of
 * where the trailing group currently lives, so it can't oscillate. */
export function Toolbar({
  children,
  trailing,
  className,
}: {
  children: React.ReactNode;
  trailing?: React.ReactNode;
  className?: string;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const group = useMemo(() => ({ openId, setOpenId }), [openId]);
  const slot = useHeaderActionsSlot();
  const rootRef = useRef<HTMLDivElement>(null);
  const trailingRef = useRef<HTMLDivElement>(null);
  const [lifted, setLifted] = useState(false);
  const pendingShrink = usePendingShrink();

  const measure = useCallback(() => {
    const root = rootRef.current;
    const tr = trailingRef.current;
    if (!root || !tr) return;
    const cs = getComputedStyle(root);
    // Measure against the width the row is about to have, not the width it
    // has mid-tween (see usePendingShrink).
    const avail =
      root.clientWidth -
      parseFloat(cs.paddingLeft) -
      parseFloat(cs.paddingRight) -
      pendingShrink();
    const gap = parseFloat(cs.columnGap) || 0;
    // Fractional widths: offsetWidth truncates, and summing truncated widths
    // can under-count by several pixels — enough to say "fits" while the
    // browser actually wraps. A 2px margin covers layout rounding.
    let need = 0;
    let n = 0;
    for (const child of Array.from(root.children)) {
      if (child === tr) continue;
      const w = child.getBoundingClientRect().width;
      if (!w) continue;
      need += w + (n ? gap : 0);
      n++;
    }
    need += (n ? gap : 0) + tr.getBoundingClientRect().width;
    setLifted(need + 2 > avail);
  }, [pendingShrink]);

  // Re-check after every render (filters get added/removed) and whenever the
  // toolbar or the trailing group resizes.
  useLayoutEffect(measure);
  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    if (rootRef.current) ro.observe(rootRef.current);
    if (trailingRef.current) ro.observe(trailingRef.current);
    return () => ro.disconnect();
  }, [measure]);

  // Shared-layout id: lifting swaps which parent the group renders in (a
  // remount), so the new instance slides from the old one's position instead
  // of snapping. layout="position" keeps the controls from scaling in flight.
  //
  // layoutDependency limits the layout animation to the lift itself. Without
  // it, every re-render re-measures the group, and position mode anchors the
  // snapshot to the *left* edge — so when the range picker's label shrinks
  // (right-aligned group, right edge fixed), Motion reads it as "the group
  // moved right" and springs everything, including the trailing "New …"
  // button that never actually moved. The unmount path still snapshots
  // (Motion does so for any layoutId), so the lift keeps its slide.
  const layoutId = useId();
  const trailingNode = trailing ? (
    <motion.div
      ref={trailingRef}
      layoutId={layoutId}
      layout="position"
      layoutDependency={lifted}
      transition={{ type: "spring", stiffness: 520, damping: 44 }}
      className="ml-auto flex items-center gap-2"
    >
      {trailing}
    </motion.div>
  ) : null;
  const liftTarget = lifted && slot?.el ? slot.el : null;

  return (
    <FilterGroupContext.Provider value={group}>
      <div
        ref={rootRef}
        className={cn("flex flex-wrap items-center gap-2 pl-6 pr-6", className)}
      >
        {children}
        {trailingNode && liftTarget
          ? createPortal(trailingNode, liftTarget)
          : trailingNode}
      </div>
    </FilterGroupContext.Provider>
  );
}

/** Membership in a Toolbar's shared open-coordination group for dropdowns that
 * aren't FilterSelects (e.g. the "+ Filter" menu): wire `open`/`onOpenChange`
 * into the popup and `onTriggerMouseEnter` onto its trigger, and it joins the
 * hover-to-switch behavior between sibling filters. */
export function useFilterGroupItem() {
  const group = useContext(FilterGroupContext);
  const id = useId();
  return {
    open: group ? group.openId === id : undefined,
    onOpenChange: (isOpen: boolean) =>
      group?.setOpenId((curr) => (isOpen ? id : curr === id ? null : curr)),
    onTriggerMouseEnter: () => {
      // If a sibling filter is already open, switch to this one on hover.
      if (group && group.openId !== null && group.openId !== id) {
        group.setOpenId(id);
      }
    },
  };
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
    // corner-round! drops the group's default squircle corner-shape, which
    // otherwise flattens the fully-rounded pill ends. The shadow/bg/border
    // overrides swap the group's default surface for the outline-Button one so
    // it matches the sibling filters (which render that variant).
    <InputGroup
      className={cn(
        // dark:bg-card explicitly: InputGroup's base sets dark:bg-input/30 (a
        // translucent wash that lands a shade lighter than card), which would
        // otherwise win over the plain bg-card and mismatch the FilterSelects.
        "h-8 w-56 rounded-full squircle:rounded-full corner-round! shadow-(--custom-outline-shadow) dark:shadow-(--custom-outline-shadow) dark:border-0 bg-card dark:bg-card hover:bg-muted/50 dark:hover:bg-muted",
        className
      )}
    >
      <InputGroupAddon>
        <IconSearch className="size-3.5 dark:text-[#5B5B5B] text-[#B8B8B8]" />
      </InputGroupAddon>
      <InputGroupInput
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-8"
      />
      {value && (
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            size="icon-xs"
            aria-label="Clear search"
            onClick={() => onChange("")}
            className="rounded-full text-muted-foreground/60 hover:text-foreground"
          >
            <IconX className="size-3.5" />
          </InputGroupButton>
        </InputGroupAddon>
      )}
    </InputGroup>
  );
}

/** A boolean filter toggle (e.g. "Errors only"): the outline Button variant at
 * rest, the destructive one while active. */
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
    <Button
      variant={active ? "destructive" : "outline"}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        // transition-[color,box-shadow] (not the base transition-all) matches
        // the SearchInput surface: background hover flips instantly,
        // text/shadow still ease. State colors come from the variants, except
        // the inactive label/icon which dims to muted (outline would pin the
        // icon to neutral, hence the svg override).
        "font-normal transition-[color,box-shadow] active:scale-100",
        !active &&
          "text-muted-foreground/50 hover:text-muted-foreground/50 bg-card hover:bg-muted/50 aria-expanded:bg-muted/50 dark:hover:bg-muted dark:aria-expanded:bg-muted [&_svg:not([class*='text-'])]:text-muted-foreground/50 dark:[&_svg:not([class*='text-'])]:text-muted-foreground/50"
      )}
    >
      {children}
    </Button>
  );
}

// Dropdowns longer than this get an inline search input at the top.
const FILTER_SEARCH_THRESHOLD = 8;

/** A compact dropdown filter with an "All" reset option (empty string). Sized to
 * match the other toolbar controls. Long option lists (or `allowFreeText`) get
 * an inline typeahead that narrows the list as you type. */
export function FilterSelect<T extends string>({
  value,
  onChange,
  allLabel,
  options,
  icon: IconComp,
  className,
  allowFreeText = false,
}: {
  value: T | "";
  onChange: (value: T | "") => void;
  /** Label for the reset option and the empty-state placeholder, e.g. "Any status". */
  allLabel: string;
  options: {
    value: T;
    label: string;
    /** Muted "(hint)" after the label, e.g. "(current)". Not searched. */
    hint?: string;
    icon?: ComponentType<{ className?: string }>;
  }[];
  /** Leading icon for the trigger; shown for the "all" state and as the
   * fallback for options that don't define their own. */
  icon?: ComponentType<{ className?: string }>;
  className?: string;
  /** Accept a typed value (Enter) even when it matches no listed option — for
   * capped option lists where the full value set is larger than what's shown. */
  allowFreeText?: boolean;
}) {
  // A free-text value isn't among the listed options — surface it as a
  // synthetic first option so the trigger and list can render its label.
  const allOptions =
    value && !options.some((o) => o.value === value)
      ? [{ value: value as T, label: value as string }, ...options]
      : options;

  const selectedHint = (() => {
    const o = value ? allOptions.find((x) => x.value === value) : undefined;
    return o?.hint ? { label: o.label, hint: o.hint } : null;
  })();
  // The trigger leads with the selected option's icon, falling back to the
  // filter's own icon (the "all"/placeholder state).
  const TriggerIcon =
    allOptions.find((o) => o.value === value)?.icon ?? IconComp;

  // Coordinate open state with sibling filters (see FilterGroupContext). Falls
  // back to Base UI's own uncontrolled state when used outside a Toolbar.
  const group = useContext(FilterGroupContext);
  const id = useId();

  // Inline typeahead over the option labels; cleared whenever the dropdown
  // closes so it reopens unfiltered.
  const [query, setQuery] = useState("");
  const searchable = allowFreeText || options.length > FILTER_SEARCH_THRESHOLD;
  const q = query.trim().toLowerCase();
  const visibleOptions = q
    ? allOptions.filter((o) => o.label.toLowerCase().includes(q))
    : allOptions;

  return (
    <Select<T | "", false>
      value={value}
      onValueChange={(v) => onChange(v ?? "")}
      // Non-modal so sibling triggers stay hoverable while this one is open.
      modal={false}
      open={group ? group.openId === id : undefined}
      onOpenChange={(isOpen) => {
        if (!isOpen) setQuery("");
        group?.setOpenId((curr) => (isOpen ? id : curr === id ? null : curr));
      }}
    >
      <SelectTrigger
        size="sm"
        className={cn(
          // The outline Button surface, so the trigger matches ToggleChip (a
          // real Button can't be nested here — Base UI's render would merge two
          // conflicting class stacks). On top of it: the trigger's own layout
          // (value/chevron spread vs Button's centering, squircle off), no dark
          // border/shadow-none from the trigger base (Button outline has
          // neither), the SearchInput's exact hover/open surface (muted/50 in
          // light, muted in dark — the outline variant's plain muted reads
          // darker next to it), and no press scale.
          buttonVariants({ variant: "outline" }),
          "min-w-36 justify-between font-normal corner-round! bg-card hover:bg-muted/50 aria-expanded:bg-muted/50 dark:hover:bg-muted dark:aria-expanded:bg-muted transition-[color,box-shadow] active:scale-100 dark:border-0 dark:shadow-(--custom-outline-shadow)",
          className
        )}
        onMouseEnter={() => {
          // If another filter is already open, switch to this one on hover.
          if (group && group.openId !== null && group.openId !== id) {
            group.setOpenId(id);
          }
        }}
      >
        {TriggerIcon && (
          <TriggerIcon className="size-3.5 shrink-0 dark:text-[#5B5B5B] text-[#B8B8B8]" />
        )}
        {/* A custom value renderer replaces the placeholder, so only take
            over when the selected option carries a hint to render muted. */}
        {selectedHint ? (
          <SelectValue placeholder={allLabel}>
            {/* One span: the value slot is a gapped flex row, so separate
                children would sit a gap apart on top of the space. */}
            <span className="truncate">
              {selectedHint.label}{" "}
              <span className="text-muted-foreground">
                ({selectedHint.hint})
              </span>
            </span>
          </SelectValue>
        ) : (
          <SelectValue placeholder={allLabel} />
        )}
      </SelectTrigger>
      {/* w-auto: size to the longest option (instead of the trigger's width)
          so long names aren't clipped; the truncate span caps the extremes. */}
      <SelectContent
        className="w-auto min-w-44 max-w-80"
        align="start"
        sideOffset={8}
      >
        {searchable && (
          <div className="sticky -top-1 z-10 -mx-1 -mt-1 mb-1 border-b border-border/40 bg-popover p-1">
            <div className="relative">
              <IconSearch className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground/60" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search…"
                autoFocus
                className="h-7 rounded-md border-none bg-transparent pl-7 text-sm shadow-none focus-visible:ring-0 dark:bg-transparent"
                onKeyDown={(e) => {
                  // Free-text apply: Enter with no matching option filters by
                  // the typed value (capped lists hide the long tail).
                  if (
                    e.key === "Enter" &&
                    allowFreeText &&
                    query.trim() &&
                    visibleOptions.length === 0
                  ) {
                    e.preventDefault();
                    onChange(query.trim() as T);
                    group?.setOpenId(null);
                    return;
                  }
                  // Keep list navigation with the select; everything else
                  // (typing, Backspace, Home/End…) belongs to the input —
                  // otherwise Base UI's own typeahead hijacks the keystrokes.
                  if (
                    e.key !== "ArrowDown" &&
                    e.key !== "ArrowUp" &&
                    e.key !== "Enter" &&
                    e.key !== "Escape"
                  ) {
                    e.stopPropagation();
                  }
                }}
              />
            </div>
          </div>
        )}
        {/* Explicit `label` keeps the value→label map (and SelectValue) text
            only, so the icon in the children doesn't render twice in the
            trigger. */}
        <SelectItem value="" label={allLabel}>
          {IconComp && (
            <IconComp className="size-4 shrink-0 text-neutral-500 mt-0.5" />
          )}
          {allLabel}
        </SelectItem>
        {searchable && q && visibleOptions.length === 0 && (
          <div className="px-2 py-1.5 text-sm text-muted-foreground">
            {allowFreeText ? (
              <span>
                Press <span className="text-foreground">Enter</span> to use “
                {query.trim()}”
              </span>
            ) : (
              "No matches"
            )}
          </div>
        )}
        {visibleOptions.map((o) => {
          const OptIcon = o.icon;
          return (
            <SelectItem
              key={o.value}
              value={o.value}
              label={o.hint ? `${o.label} (${o.hint})` : o.label}
            >
              {OptIcon && (
                <OptIcon className="size-4 shrink-0 text-neutral-500 mt-0.5" />
              )}
              <span className="block max-w-64 truncate" title={o.label}>
                {o.label}
                {o.hint && (
                  <>
                    {" "}
                    <span className="text-muted-foreground">({o.hint})</span>
                  </>
                )}
              </span>
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
          transition={{ duration: 0.13, ease: "easeOut" }}
          className="inline-flex"
        >
          <Button
            variant="outline"
            onClick={onClick}
            className="text-muted-foreground gap-1 bg-card hover:bg-muted/50 aria-expanded:bg-muted/50 dark:hover:bg-muted dark:aria-expanded:bg-muted"
          >
            <IconX />
            Clear
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Minimal pagination footer: "1,240 traces · 1–25" in muted text plus two
 * ghost chevrons, right-aligned. The range doubles as a rows-per-page picker
 * when `onPageSizeChange` is provided. No page numbers — paginated lists here
 * are browsed sequentially or narrowed via filters, never jumped into. */
export function PaginationFooter({
  page,
  pageSize,
  total,
  shown,
  noun,
  onPageChange,
  onPageSizeChange,
  pageSizes = [25, 50, 100],
  isFetching = false,
}: {
  /** 0-based page index. */
  page: number;
  pageSize: number;
  /** Total row count across all pages (0 while it loads). */
  total: number;
  /** Row count on the current page. */
  shown: number;
  /** Singular/plural label, e.g. ["trace", "traces"]. */
  noun: [string, string];
  onPageChange: (page: number) => void;
  /** Enables the rows-per-page picker on the range text. */
  onPageSizeChange?: (size: number) => void;
  pageSizes?: number[];
  isFetching?: boolean;
}) {
  const totalPages = Math.max(page + 1, Math.ceil(total / pageSize) || 1);
  const range =
    shown === 0 ? "0" : `${page * pageSize + 1} to ${page * pageSize + shown}`;
  return (
    <div className="flex items-center justify-end gap-1 border-t border-border/50 px-6 pt-4 dark:border-border/40">
      <span className="text-xs text-muted-foreground/50 tabular-nums">
        {formatCount(total)} {total === 1 ? noun[0] : noun[1]}
      </span>
      <span className="text-xs text-muted-foreground/20 mx-3">/</span>
      {onPageSizeChange ? (
        <Select<string, false>
          value={String(pageSize)}
          onValueChange={(v) => v && onPageSizeChange(Number(v))}
        >
          <SelectTrigger
            title="Rows per page"
            // Strip the trigger surface down to bare text so it reads as part
            // of the count line, only revealing itself as a control on hover.
            className="h-auto data-[size=default]:h-auto gap-1.5 rounded-md squircle:rounded-md border-0 bg-transparent p-0 text-xs text-muted-foreground/50 tabular-nums shadow-none transition-[color,box-shadow] hover:text-foreground dark:border-0 dark:bg-transparent dark:shadow-none dark:hover:bg-transparent"
          >
            {range}
          </SelectTrigger>
          <SelectContent className="w-auto min-w-28" align="end" sideOffset={6}>
            {pageSizes.map((s) => (
              <SelectItem key={s} value={String(s)}>
                {s} per page
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <span className="text-xs text-muted-foreground/50 tabular-nums">
          {range}
        </span>
      )}
      <div className="ml-1.5 flex items-center gap-1">
        <Button
          variant={page === 0 || isFetching ? "ghost" : "outline"}
          size="icon-sm"
          aria-label="Previous page"
          disabled={page === 0 || isFetching}
          onClick={() => onPageChange(page - 1)}
        >
          <IconChevronLeft />
        </Button>
        <Button
          variant={page + 1 >= totalPages || isFetching ? "ghost" : "outline"}
          size="icon-sm"
          aria-label="Next page"
          disabled={page + 1 >= totalPages || isFetching}
          onClick={() => onPageChange(page + 1)}
        >
          <IconChevronRight />
        </Button>
      </div>
    </div>
  );
}

// General-purpose hooks (useDelayedLoading / useDebouncedValue / useTextFilter)
// moved to ./hooks — they were never table-specific.
