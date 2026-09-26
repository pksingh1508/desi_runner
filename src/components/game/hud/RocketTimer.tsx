import { clamp01, cssVars } from "@/components/ui/cn";

/**
 * DIWALI ROCKET flight timer: a burning fuse. The time arrives at ~10 Hz;
 * transform transitions interpolate the fuse and spark between updates.
 */
export function RocketTimer({ timeLeft, duration }: { timeLeft: number; duration: number }) {
  const value = clamp01(timeLeft / Math.max(duration, 0.01));
  const low = timeLeft <= 1.5;
  return (
    <div
      className="rocket"
      data-low={low}
      style={cssVars({ "--v": value.toFixed(3) })}
      role="timer"
      aria-label={`Diwali rocket, ${Math.max(0, timeLeft).toFixed(0)} seconds left`}
    >
      <span className="rocket__icon" aria-hidden="true">
        🚀
      </span>
      <span className="rocket__head" aria-hidden="true">
        <span className="rocket__label">DIWALI ROCKET</span>
        <span className="rocket__time">{Math.max(0, timeLeft).toFixed(1)}s</span>
      </span>
      <span className="fuse" aria-hidden="true">
        <span className="fuse__fill" />
        <span className="fuse__track">
          <span className="fuse__spark" />
        </span>
      </span>
    </div>
  );
}
