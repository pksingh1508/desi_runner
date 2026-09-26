"use client";

import { useEffect, useRef, type PointerEvent } from "react";
import type { CharacterOptionView } from "@/types/game";
import { cn, cssVars } from "@/components/ui/cn";
import { Icon } from "@/components/ui/Icon";

interface GearTabProps {
  characters: CharacterOptionView[];
  previewId: string | null;
  onEquip: (id: string) => void;
  /** Shows any runner (locked too) in 3D without equipping; null restores. */
  onPreview: (id: string | null) => void;
}

const HOVER_PREVIEW_MS = 240;
const HOVER_RESTORE_MS = 260;

/**
 * DESI SQUAD first, then CLASSIC. Unlocked cards equip on tap. Locked cards
 * preview the runner on the live 3D stage (hover with a mouse, tap on touch)
 * so players can see what they are working towards.
 */
export function GearTab({ characters, previewId, onEquip, onPreview }: GearTabProps) {
  const desi = characters.filter((c) => c.group === "desi");
  const classic = characters.filter((c) => c.group !== "desi");

  // Hover timers call the latest onPreview/previewId (render-time closures
  // would be stale by the time the debounce fires).
  const latest = useRef({ onPreview, previewId });
  useEffect(() => {
    latest.current = { onPreview, previewId };
  });
  const timers = useRef<{ enter: number; leave: number }>({ enter: 0, leave: 0 });
  useEffect(() => {
    const pending = timers.current;
    return () => {
      window.clearTimeout(pending.enter);
      window.clearTimeout(pending.leave);
    };
  }, []);

  const hoverIn = (option: CharacterOptionView) => {
    window.clearTimeout(timers.current.enter);
    // Unlocked cards let a pending restore run (they equip on click instead).
    if (!option.locked) return;
    window.clearTimeout(timers.current.leave);
    timers.current.enter = window.setTimeout(() => {
      if (latest.current.previewId !== option.id) latest.current.onPreview(option.id);
    }, HOVER_PREVIEW_MS);
  };

  const hoverOut = () => {
    window.clearTimeout(timers.current.enter);
    window.clearTimeout(timers.current.leave);
    timers.current.leave = window.setTimeout(() => {
      if (latest.current.previewId !== null) latest.current.onPreview(null);
    }, HOVER_RESTORE_MS);
  };

  const activate = (option: CharacterOptionView) => {
    window.clearTimeout(timers.current.enter);
    window.clearTimeout(timers.current.leave);
    if (option.locked) {
      // Tap toggles a sticky preview (touch has no hover).
      onPreview(previewId === option.id ? null : option.id);
      return;
    }
    if (!option.equipped) onEquip(option.id);
    else if (previewId !== null) onPreview(null);
  };

  const unlocked = desi.filter((c) => !c.locked).length;

  return (
    <div className="tab-stack stagger">
      <section className="gear-section" style={cssVars({ "--i": 0 })} aria-label="Desi squad">
        <h2 className="sec-title">
          DESI SQUAD <span className="sec-title__hi" lang="hi">देसी टोली</span>
          <span className="sec-title__count">
            {unlocked}/{desi.length} UNLOCKED
          </span>
        </h2>
        <p className="gear-note">
          Tap a runner to equip · hover or tap a <Icon name="lock" /> runner to preview
        </p>
        <div className="gear-grid stagger">
          {desi.map((option, index) => (
            <RunnerTile
              key={option.id}
              index={index}
              option={option}
              previewing={previewId === option.id}
              onActivate={() => activate(option)}
              onHoverIn={() => hoverIn(option)}
              onHoverOut={hoverOut}
            />
          ))}
        </div>
      </section>

      {classic.length > 0 && (
        <section className="gear-section" style={cssVars({ "--i": 1 })} aria-label="Classic runners">
          <h2 className="sec-title">
            CLASSIC <span className="sec-title__muted">RETRO RUNNERS</span>
          </h2>
          <div className="gear-grid gear-grid--classic stagger">
            {classic.map((option, index) => (
              <RunnerTile
                key={option.id}
                index={index}
                option={option}
                previewing={previewId === option.id}
                onActivate={() => activate(option)}
                onHoverIn={() => hoverIn(option)}
                onHoverOut={hoverOut}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function RunnerTile({
  index,
  option,
  previewing,
  onActivate,
  onHoverIn,
  onHoverOut,
}: {
  index: number;
  option: CharacterOptionView;
  previewing: boolean;
  onActivate: () => void;
  onHoverIn: () => void;
  onHoverOut: () => void;
}) {
  const state = option.equipped ? "equipped" : option.locked ? (previewing ? "previewing" : "locked") : "ready";
  const level = option.unlockLabel.replace(/^LEVEL\s*/i, "");

  // 3D tilt + glare follow the mouse via CSS vars (no React re-render).
  const onMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType !== "mouse") return;
    const el = event.currentTarget;
    const rect = el.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width;
    const py = (event.clientY - rect.top) / rect.height;
    el.style.setProperty("--ry", `${((px - 0.5) * 16).toFixed(2)}deg`);
    el.style.setProperty("--rx", `${((0.5 - py) * 12).toFixed(2)}deg`);
    el.style.setProperty("--mx", `${(px * 100).toFixed(1)}%`);
    el.style.setProperty("--my", `${(py * 100).toFixed(1)}%`);
  };
  const onEnter = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "mouse") onHoverIn();
  };
  const onLeave = (event: PointerEvent<HTMLButtonElement>) => {
    const el = event.currentTarget;
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
    if (event.pointerType === "mouse") onHoverOut();
  };

  const label = option.locked
    ? `${option.name} — locked, unlocks at level ${level}. ${previewing ? "Previewing now, tap to stop." : "Tap to preview."}`
    : option.equipped
      ? `${option.name} — equipped`
      : `Equip ${option.name}`;

  return (
    <button
      type="button"
      className={cn("rcard", option.group === "classic" && "rcard--classic")}
      data-state={state}
      aria-pressed={option.equipped || previewing}
      aria-label={label}
      onClick={onActivate}
      onPointerEnter={onEnter}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      style={cssVars({
        "--accent": option.accentHex,
        "--grad": option.gradient,
        "--i": Math.min(index, 10),
      })}
    >
      <span className="rcard__portrait" aria-hidden="true">
        <span className="rcard__pattern" />
        <span className="rcard__emoji">{option.icon}</span>
        <span className="rcard__glare" />
        {option.equipped && (
          <span className="rcard__badge">
            <Icon name="check" /> RUNNING
          </span>
        )}
        {option.locked && (
          <span className="rcard__lock">
            <Icon name="lock" /> LV {level}
          </span>
        )}
        {option.group === "classic" && <span className="rcard__species">{option.species}</span>}
      </span>
      <span className="rcard__body" aria-hidden="true">
        <span className="rcard__name">
          {option.name}
          {option.hindiName && (
            <span className="rcard__hi" lang="hi">
              {option.hindiName}
            </span>
          )}
        </span>
        <span className="rcard__tag">{option.tagline}</span>
        <span className="rcard__cta">
          {option.equipped ? (
            <>
              <Icon name="check" /> EQUIPPED
            </>
          ) : option.locked ? (
            previewing ? (
              <>
                <Icon name="sparkle" /> PREVIEWING
              </>
            ) : (
              <>
                <Icon name="lock" /> UNLOCKS AT LV {level}
              </>
            )
          ) : (
            <>
              <Icon name="shirt" /> TAP TO EQUIP
            </>
          )}
        </span>
      </span>
    </button>
  );
}
