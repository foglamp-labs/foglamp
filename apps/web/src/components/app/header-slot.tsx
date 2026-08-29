"use client";

import {
  createContext,
  useContext,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

/**
 * Lets a page's `Toolbar` lift its trailing controls (range picker, "New …"
 * button) into the `PageHeader`'s actions area when they'd otherwise wrap
 * under the filters. The header registers its actions element here; the
 * toolbar portals into it. Provided once by the app shell, so the two can be
 * siblings anywhere in a page tree.
 */
const HeaderActionsSlotContext = createContext<{
  el: HTMLElement | null;
  setEl: (el: HTMLElement | null) => void;
} | null>(null);

export function HeaderActionsSlotProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const value = useMemo(() => ({ el, setEl }), [el]);
  return (
    <HeaderActionsSlotContext.Provider value={value}>
      {children}
    </HeaderActionsSlotContext.Provider>
  );
}

export function useHeaderActionsSlot() {
  return useContext(HeaderActionsSlotContext);
}

// ---------------------------------------------------------------------------
// Anticipated width changes
// ---------------------------------------------------------------------------

/**
 * Panels that animate their width (the Foggy chat) shrink the content area
 * over several frames. A toolbar measuring the *current* width would see the
 * row overflow — and wrap — a frame before it lifts its controls. Reporting
 * the panel's target width here lets the toolbar measure against the width
 * the content area is *about* to have, so it lifts on the first frame.
 */
type Reserve = { target: number; el: HTMLElement | null };

const LayoutReserveContext = createContext<{
  reserve: Reserve;
  setReserve: (r: Reserve) => void;
} | null>(null);

export function LayoutReserveProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [reserve, setReserve] = useState<Reserve>({ target: 0, el: null });
  const value = useMemo(() => ({ reserve, setReserve }), [reserve]);
  return (
    <LayoutReserveContext.Provider value={value}>
      {children}
    </LayoutReserveContext.Provider>
  );
}

/** Called by an animating panel: its final width and the element animating
 * toward it. */
export function useReportLayoutReserve(target: number) {
  const ctx = useContext(LayoutReserveContext);
  const ref = useRef<HTMLElement>(null);
  const setReserve = ctx?.setReserve;
  useLayoutEffect(() => {
    setReserve?.({ target, el: ref.current });
  }, [setReserve, target]);
  return ref;
}

/** Pixels the content area is still going to lose (0 while nothing is
 * shrinking — growth is never anticipated: staying lifted a moment longer
 * doesn't wrap anything). */
export function usePendingShrink(): () => number {
  const ctx = useContext(LayoutReserveContext);
  const reserve = ctx?.reserve;
  return useCallback(() => {
    if (!reserve?.el) return 0;
    return Math.max(
      0,
      reserve.target - reserve.el.getBoundingClientRect().width
    );
  }, [reserve]);
}
