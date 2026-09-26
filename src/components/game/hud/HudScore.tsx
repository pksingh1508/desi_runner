import { fmtInt } from "@/components/ui/format";
import { Icon } from "@/components/ui/Icon";

/** Score panel; the number re-mounts every 1,000 points for a tick pulse. */
export function HudScore({ score }: { score: number }) {
  return (
    <div className="hud-score hud-area-score">
      <span className="hud-score__label">SCORE</span>
      <span className="hud-score__value" key={Math.floor(score / 1000)}>
        {fmtInt(score)}
      </span>
    </div>
  );
}

function multLabel(mult: number): string {
  return Number.isInteger(mult) ? `${mult}` : mult.toFixed(1);
}

/** Combo chip — pulses on every combo step, heats up with the multiplier. */
export function ComboChip({ count, mult }: { count: number; mult: number }) {
  const heat = mult >= 4 ? 4 : mult >= 3 ? 3 : mult >= 2 ? 2 : 1;
  return (
    <div className="combo hud-area-combo" data-heat={heat}>
      <Icon name="flame" className="combo__flame" />
      <span className="combo__count" key={`c${count}`}>
        {fmtInt(count)}
      </span>
      <span className="combo__label">COMBO</span>
      {mult > 1 && (
        <span className="combo__mult" key={`m${mult}`}>
          ×{multLabel(mult)}
        </span>
      )}
    </div>
  );
}
