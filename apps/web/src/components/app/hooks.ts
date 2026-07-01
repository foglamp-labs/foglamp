"use client";

import { useEffect, useMemo, useState } from "react";

// General-purpose UI hooks shared across list/table pages. These used to live in
// data-table.tsx, which leaked them as an implicit public API; they have nothing
// to do with the table component itself.

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
