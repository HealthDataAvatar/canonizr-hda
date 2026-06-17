"use client";

import { useState, useEffect } from "react";

/**
 * Observes an element's width via ResizeObserver and returns whether it is
 * at least `breakpointPx` wide.
 *
 * Uses a callback-ref pattern so it works even when the element mounts
 * after the first render (e.g. behind a loading gate).
 *
 * @param breakpointPx  Minimum width to be considered "wide". Pass 0 to
 *                      disable observation (always returns true).
 * @returns `[refCallback, wide]` — attach `refCallback` to the container
 *          element and read `wide` to branch on layout.
 *
 * @example
 * ```tsx
 * const [ref, wide] = useContainerWide(640);
 * return (
 *   <div ref={ref}>
 *     {wide ? <DesktopLayout /> : <MobileLayout />}
 *   </div>
 * );
 * ```
 */
export function useContainerWide(breakpointPx: number) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [wide, setWide] = useState(true);

  useEffect(() => {
    if (!el || breakpointPx <= 0) return;
    const check = (w: number) => setWide(w >= breakpointPx);
    check(el.clientWidth);
    const observer = new ResizeObserver(([e]) => check(e.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, [el, breakpointPx]);

  return [setEl, wide] as const;
}
