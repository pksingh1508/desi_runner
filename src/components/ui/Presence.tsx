"use client";

import { useEffect, useState, type ReactNode } from "react";

type Phase = "in" | "out" | "gone";

/**
 * Keeps a screen mounted for a short exit animation after `show` turns off.
 * The wrapper is `display: contents`; screens style their own exit through
 * `.presence[data-phase="out"] …` selectors. Exiting content is inert.
 */
export function Presence({
  show,
  exitMs = 320,
  children,
}: {
  show: boolean;
  exitMs?: number;
  children: ReactNode;
}) {
  const [phase, setPhase] = useState<Phase>(show ? "in" : "gone");

  // Adjust state during render (no effect round-trip) when `show` flips.
  if (show && phase !== "in") setPhase("in");
  else if (!show && phase === "in") setPhase("out");

  useEffect(() => {
    if (phase !== "out") return;
    const id = window.setTimeout(() => setPhase("gone"), exitMs);
    return () => window.clearTimeout(id);
  }, [phase, exitMs]);

  if (phase === "gone") return null;
  return (
    <div className="presence" data-phase={phase} inert={phase === "out" ? true : undefined}>
      {children}
    </div>
  );
}
