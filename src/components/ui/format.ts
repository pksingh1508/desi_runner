/**
 * Number formatting for the UI. Indian digit grouping (1,23,456) is a small
 * desi touch that also keeps big scores readable.
 */
const INT = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

export function fmtInt(value: number): string {
  return INT.format(Math.round(Number.isFinite(value) ? value : 0));
}

export function fmtMeters(value: number): string {
  return `${fmtInt(value)} m`;
}

/** 83 → "1m 23s", 42.7 → "42s". */
export function fmtClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(Number.isFinite(totalSeconds) ? totalSeconds : 0));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes > 0 ? `${minutes}m ${rest.toString().padStart(2, "0")}s` : `${rest}s`;
}

export type NumberFormatKind = "int" | "meters" | "xp" | "combo";

export function formatKind(kind: NumberFormatKind, value: number): string {
  switch (kind) {
    case "meters":
      return fmtMeters(value);
    case "xp":
      return `+${fmtInt(value)} XP`;
    case "combo":
      return `×${fmtInt(value)}`;
    default:
      return fmtInt(value);
  }
}
