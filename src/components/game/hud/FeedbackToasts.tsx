import type { FeedbackItem } from "@/types/game";
import { cn } from "@/components/ui/cn";
import { EmojiText } from "@/components/ui/EmojiText";

/**
 * Gameplay toasts (good / combo / warn / epic). Meme captions render in
 * MemeLayer instead. Items fade out via CSS just before the engine's TTL.
 */
export function FeedbackToasts({ items }: { items: FeedbackItem[] }) {
  return (
    <div className="toasts">
      {uniqueById(items).map((item) =>
        item.tone === "meme" ? null : (
          <div key={item.id} className={cn("toast", `toast--${item.tone}`)}>
            <span className="toast__text">
              <EmojiText text={item.text} />
            </span>
            {item.sub && <span className="toast__sub">{item.sub}</span>}
          </div>
        )
      )}
    </div>
  );
}

/**
 * Defensive de-duplication: React keys must be unique, so a repeated id
 * (e.g. a re-created engine FeedbackSystem restarting its counter) can never
 * produce duplicate-key errors or ghost toasts.
 */
export function uniqueById(items: FeedbackItem[]): FeedbackItem[] {
  if (items.length < 2) return items;
  const seen = new Set<number>();
  const out: FeedbackItem[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

/** Festival ribbon for run events (COIN STORM, DRONE ATTACK …). */
export function EventRibbon({ text }: { text: string }) {
  return (
    <div className="ribbon-wrap" role="status">
      <div className="ribbon">
        <span className="ribbon__body">
          <span className="ribbon__spark" aria-hidden="true">
            ✦
          </span>
          <span className="ribbon__text">{text}</span>
          <span className="ribbon__spark" aria-hidden="true">
            ✦
          </span>
        </span>
        <span className="ribbon__fringe bunting" aria-hidden="true" />
      </div>
    </div>
  );
}
