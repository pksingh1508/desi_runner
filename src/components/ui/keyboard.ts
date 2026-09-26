import type { KeyboardEvent } from "react";

/**
 * The engine's InputSystem listens for Enter/Space on `window` (confirm /
 * jump). When a UI control has keyboard focus, those keys must activate the
 * focused control only — so overlays stop the event from reaching window.
 * React dispatches at the root container, so stopPropagation() here keeps
 * the native event away from window listeners.
 */
export function guardActivationKeys(event: KeyboardEvent<HTMLElement>): void {
  if (event.key !== "Enter" && event.key !== " ") return;
  const target = event.target as HTMLElement | null;
  if (target?.closest("button, a[href], [role='tab'], [role='button'], input, select, textarea")) {
    event.stopPropagation();
  }
}
