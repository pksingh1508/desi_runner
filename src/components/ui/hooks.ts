"use client";

import { useCallback, useId, useSyncExternalStore } from "react";

/** useId sanitized for SVG `url(#id)` references. */
export function useUid(): string {
  return useId().replace(/[^a-zA-Z0-9_-]/g, "");
}

/**
 * Subscribes to a media query without effects or extra renders. The server
 * snapshot is `serverValue`, so hydration never mismatches.
 */
export function useMediaQuery(query: string, serverValue = false): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query]
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => serverValue
  );
}

/** Touch-first devices get swipe/tap copy instead of keyboard hints. */
export function useCoarsePointer(): boolean {
  return useMediaQuery("(pointer: coarse)");
}
