import type { MemeEvent } from "@/types/game";
import { MEME_CLIPS, MEME_EVENTS } from "../config/memes";
import type { AudioClipLibrary } from "./AudioClipLibrary";

export interface MemeClip {
  buffer: AudioBuffer;
  caption?: string;
  sub?: string;
  gain: number;
}

/**
 * Local meme clips. After unlock the manifest
 * (public/sounds/memes/manifest.json) is fetched once;
 * listed files are decoded and preferred over the built-in TTS / synth
 * recreation for their event. Missing manifest, bad JSON, bad names and
 * undecodable files use the built-in recreation instead.
 */
export class MemeClips {
  private started = false;
  private readonly clips = new Map<MemeEvent, MemeClip[]>();
  private readonly lastPick = new Map<MemeEvent, number>();
  private aborter: AbortController | null = null;
  private disposed = false;

  constructor(private readonly library: AudioClipLibrary) {}

  /** Starts the lazy manifest fetch (idempotent, browser-only). */
  load(ctx: BaseAudioContext): void {
    if (this.started || this.disposed || typeof fetch !== "function") return;
    this.started = true;
    this.aborter = typeof AbortController === "function" ? new AbortController() : null;
    void this.loadAll(ctx, this.aborter?.signal).catch(() => undefined);
  }

  /** A decoded clip for the event (never the same one twice in a row), or null. */
  pick(event: MemeEvent): MemeClip | null {
    const list = this.clips.get(event);
    if (!list || list.length === 0) return null;
    let index = Math.floor(Math.random() * list.length);
    if (list.length > 1 && index === this.lastPick.get(event)) index = (index + 1) % list.length;
    this.lastPick.set(event, index);
    return list[index];
  }

  get count(): number {
    let total = 0;
    for (const list of this.clips.values()) total += list.length;
    return total;
  }

  dispose(): void {
    this.disposed = true;
    this.aborter?.abort();
    this.aborter = null;
    this.clips.clear();
    this.lastPick.clear();
  }

  private async loadAll(ctx: BaseAudioContext, signal: AbortSignal | undefined): Promise<void> {
    const response = await fetch(MEME_CLIPS.manifestUrl, { signal, cache: "no-cache" });
    if (!response.ok || this.disposed) return;
    let manifest: unknown;
    try {
      manifest = await response.json();
    } catch {
      return;
    }
    if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) return;
    const entries = manifest as Record<string, unknown>;

    for (const event of MEME_EVENTS) {
      const raw = entries[event];
      const names = Array.isArray(raw) ? raw : [raw];
      let loaded = 0;
      for (const name of names) {
        if (loaded >= MEME_CLIPS.maxClipsPerEvent) break;
        const entry = typeof name === "string" ? { file: name } : name;
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
        const fields = entry as Record<string, unknown>;
        if (typeof fields.file !== "string" || !MEME_CLIPS.fileNamePattern.test(fields.file)) continue;
        const buffer = await this.library.load(ctx, MEME_CLIPS.baseUrl + encodeURIComponent(fields.file));
        if (signal?.aborted || this.disposed) return;
        if (!buffer) continue;
        const list = this.clips.get(event) ?? [];
        list.push({
          buffer,
          caption: this.caption(fields.caption, MEME_CLIPS.maxCaptionLength),
          sub: this.caption(fields.sub, MEME_CLIPS.maxSubLength),
          gain: typeof fields.gain === "number" && Number.isFinite(fields.gain)
            ? Math.min(1, Math.max(0.05, fields.gain))
            : MEME_CLIPS.defaultGain,
        });
        this.clips.set(event, list);
        loaded++;
      }
    }
  }

  private caption(value: unknown, maxLength: number): string | undefined {
    return typeof value === "string" && value.trim() ? value.trim().slice(0, maxLength) : undefined;
  }
}
