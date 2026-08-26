import type { EventBannerData, FeedbackItem, FeedbackTone } from "@/types/game";

interface InternalItem extends FeedbackItem {
  ttl: number;
  priority: number;
}

const PRIORITY: Record<FeedbackTone, number> = {
  good: 1,
  combo: 2,
  warn: 2,
  epic: 3,
};

const TTL: Record<FeedbackTone, number> = {
  good: 1.5,
  combo: 1.7,
  warn: 1.8,
  epic: 2.3,
};

/**
 * Gameplay toast queue with priorities — never more than `maxVisible`
 * messages at once; epic messages (OVERDRIVE READY, records) can displace
 * lesser ones but never each other.
 */
export class FeedbackSystem {
  private items = new Map<number, InternalItem>();
  private nextId = 1;
  private maxVisible = 3;

  banner: EventBannerData | null = null;
  private bannerTtl = 0;
  private bannerId = 0;

  push(text: string, tone: FeedbackTone, sub?: string): void {
    const item: InternalItem = {
      id: this.nextId++,
      text,
      sub,
      tone,
      ttl: TTL[tone],
      priority: PRIORITY[tone],
    };
    if (this.items.size >= this.maxVisible) {
      this.evictLowest(item.priority);
    }
    if (this.items.size < this.maxVisible) {
      this.items.set(item.id, item);
    }
  }

  showBanner(text: string, duration: number): void {
    this.banner = { id: ++this.bannerId, text };
    this.bannerTtl = duration;
  }

  /** Advances expiry; returns true when the visible set changed. */
  update(delta: number): boolean {
    let changed = false;
    for (const [id, item] of this.items) {
      item.ttl -= delta;
      if (item.ttl <= 0) {
        this.items.delete(id);
        changed = true;
      }
    }
    if (this.banner) {
      this.bannerTtl -= delta;
      if (this.bannerTtl <= 0) {
        this.banner = null;
        changed = true;
      }
    }
    return changed;
  }

  snapshot(): FeedbackItem[] {
    return Array.from(this.items.values()).map(({ id, text, sub, tone }) => ({
      id,
      text,
      sub,
      tone,
    }));
  }

  clear(): void {
    this.items.clear();
    this.banner = null;
    this.bannerTtl = 0;
  }

  private evictLowest(incomingPriority: number): void {
    let lowestId = -1;
    let lowestPriority = Number.POSITIVE_INFINITY;
    for (const [id, item] of this.items) {
      if (item.priority < lowestPriority) {
        lowestPriority = item.priority;
        lowestId = id;
      }
    }
    if (lowestId >= 0 && lowestPriority < incomingPriority) {
      this.items.delete(lowestId);
    } else if (lowestId >= 0) {
      // Same or higher priority than everything visible: replace the oldest.
      let oldestId = lowestId;
      let oldestTtl = Number.POSITIVE_INFINITY;
      for (const [id, item] of this.items) {
        if (item.ttl < oldestTtl) {
          oldestTtl = item.ttl;
          oldestId = id;
        }
      }
      this.items.delete(oldestId);
    }
  }
}
