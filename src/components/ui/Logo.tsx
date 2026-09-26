import type { CSSProperties } from "react";
import { cn } from "./cn";

/**
 * Extruded 3D display text: a maroon depth layer (::before via data-text)
 * under a gradient face. The visual copy is aria-hidden; screen readers get
 * a single clean label.
 */
export function XText({
  text,
  className,
  style,
  srLabel = true,
}: {
  text: string;
  className?: string;
  style?: CSSProperties;
  /** Render a visually-hidden copy for assistive tech (default true). */
  srLabel?: boolean;
}) {
  return (
    <>
      <span className={cn("xtext", className)} data-text={text} style={style} aria-hidden="true">
        <span className="xtext__face">{text}</span>
      </span>
      {srLabel && <span className="sr-only">{text}</span>}
    </>
  );
}

/** "DESI RUN" wordmark with the "देसी रन" rani-pink sticker. */
export function Logo({
  size = "md",
  className,
}: {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  return (
    <div className={cn("logo", `logo--${size}`, className)} role="img" aria-label="Desi Run — देसी रन">
      <XText className="logo__en" text="DESI RUN" srLabel={false} />
      <span className="logo__hi" lang="hi" aria-hidden="true">
        देसी रन
      </span>
    </div>
  );
}
