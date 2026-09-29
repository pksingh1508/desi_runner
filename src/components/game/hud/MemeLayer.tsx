import type { FeedbackItem } from "@/types/game";
import { cssVars } from "@/components/ui/cn";
import { uniqueById } from "./FeedbackToasts";

/**
 * Desi meme captions ("FAAAH! 😱", "LAND KARA DE! 🙏") as comic
 * speech bubbles. Lives above the HUD/revive layers so the crash line is
 * readable, and pointer-transparent so swipes still reach the game.
 */
export function MemeLayer({ items }: { items: FeedbackItem[] }) {
  const memes = uniqueById(items).filter((item) => item.tone === "meme");
  if (memes.length === 0) return null;
  return (
    <div className="memes" aria-live="polite">
      {memes.map((item) => (
        <div
          key={item.id}
          className="meme"
          style={cssVars({ "--tilt": item.id % 2 === 0 ? "-3deg" : "2.5deg" })}
        >
          <span className="meme__text">{item.text}</span>
          {item.sub && <span className="meme__sub">{item.sub}</span>}
        </div>
      ))}
    </div>
  );
}
