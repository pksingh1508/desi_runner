import type { CharacterOptionView } from "@/types/game";
import { cssVars } from "@/components/ui/cn";
import { Icon } from "@/components/ui/Icon";
import { XText } from "@/components/ui/Logo";

/**
 * Character-select style nameplate on the 3D stage (GEAR tab): names the
 * runner the camera is framing — equipped, or a locked one being previewed.
 */
export function RunnerNameplate({ option, previewing }: { option: CharacterOptionView; previewing: boolean }) {
  const level = option.unlockLabel.replace(/^LEVEL\s*/i, "");
  return (
    <div className="nameplate" style={cssVars({ "--accent": option.accentHex })} aria-live="polite">
      <span className="nameplate__kicker" data-preview={previewing}>
        {previewing ? (
          <>
            <Icon name="lock" /> PREVIEW · UNLOCKS AT LEVEL {level}
          </>
        ) : (
          <>
            <Icon name="check" /> NOW RUNNING
          </>
        )}
      </span>
      <XText className="nameplate__name" text={option.name} />
      {option.hindiName && (
        <span className="nameplate__hi" lang="hi">
          {option.hindiName}
        </span>
      )}
      <span className="nameplate__tag">“{option.tagline}”</span>
    </div>
  );
}
