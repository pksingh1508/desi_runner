import type { CSSProperties, ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";

interface Hint {
  glyphs: ReactNode;
  label: string;
}

const KEYBOARD: Hint[] = [
  {
    glyphs: (
      <>
        <kbd className="kbd"><Icon name="arrowLeft" /></kbd>
        <kbd className="kbd"><Icon name="arrowRight" /></kbd>
      </>
    ),
    label: "MOVE",
  },
  {
    glyphs: (
      <>
        <kbd className="kbd"><Icon name="arrowUp" /></kbd>
        <kbd className="kbd">SPACE</kbd>
      </>
    ),
    label: "JUMP",
  },
  { glyphs: <kbd className="kbd"><Icon name="arrowDown" /></kbd>, label: "SLIDE" },
  { glyphs: <kbd className="kbd">E</kbd>, label: "JOSH" },
  { glyphs: <kbd className="kbd">ESC</kbd>, label: "PAUSE" },
];

const TOUCH: Hint[] = [
  {
    glyphs: (
      <>
        <Icon name="arrowLeft" />
        <Icon name="arrowRight" />
      </>
    ),
    label: "SWIPE · LANE",
  },
  { glyphs: <Icon name="arrowUp" />, label: "SWIPE · JUMP" },
  { glyphs: <Icon name="arrowDown" />, label: "SWIPE · SLIDE" },
  { glyphs: <Icon name="tap" />, label: "DOUBLE-TAP · JOSH" },
];

/** Keyboard keycaps on desktop, swipe glyphs on touch devices. */
export function ControlHints({ touch, style }: { touch: boolean; style?: CSSProperties }) {
  const hints = touch ? TOUCH : KEYBOARD;
  return (
    <section className="hints" style={style} aria-label="Controls">
      <h3 className="sec-title">
        {touch ? "SWIPE TO PLAY" : "CONTROLS"}
        {!touch && <span className="sec-title__muted">WASD WORKS TOO</span>}
      </h3>
      <ul className={touch ? "hints__list hints__list--touch" : "hints__list"}>
        {hints.map((hint) => (
          <li key={hint.label} className="hint">
            <span className="hint__glyphs" aria-hidden="true">
              {hint.glyphs}
            </span>
            <span className="hint__label">{hint.label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
