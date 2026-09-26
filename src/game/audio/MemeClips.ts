import type { MemeEvent } from "@/types/game";
import { MEME_CLIPS, MEME_EVENTS } from "@/game/config/memes";

/**
 * Optional user-provided meme clips. After unlock the manifest
 * (public/sounds/memes/manifest.json, shipped as `{}`) is fetched once;
 * listed files are decoded and preferred over the built-in TTS / synth
 * recreation for their event. Missing manifest, bad JSON, bad names and
 * undecodable files are ignored silently — clips are strictly opt-in.
 */
export class MemeClips {
  private started = false;
  private readonly clips = new Map<MemeEvent, AudioBuffer[]>();
  private readonly lastPick = new Map<MemeEvent, number>();
  private aborter: AbortController | null = null;

  /** Starts the lazy manifest fetch (idempotent, browser-only). */
  load(ctx: BaseAudioContext): void {
    if (this.started || typeof fetch !== "function") return;
    this.started = true;
    this.aborter = typeof AbortController === "function" ? new AbortController() : null;
    void this.loadAll(ctx, this.aborter?.signal).catch(() => undefined);
  }

  /** A decoded clip for the event (never the same one twice in a row), or null. */
  pick(event: MemeEvent): AudioBuffer | null {
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
    this.aborter?.abort();
    this.aborter = null;
    this.clips.clear();
  }

  private async loadAll(ctx: BaseAudioContext, signal: AbortSignal | undefined): Promise<void> {
    const response = await fetch(MEME_CLIPS.manifestUrl, { signal, cache: "no-cache" });
    if (!response.ok) return;
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
      const names = typeof raw === "string" ? [raw] : Array.isArray(raw) ? raw : [];
      let loaded = 0;
      for (const name of names) {
        if (loaded >= MEME_CLIPS.maxClipsPerEvent) break;
        if (typeof name !== "string" || !MEME_CLIPS.fileNamePattern.test(name)) continue;
        const buffer = await this.fetchClip(ctx, name, signal);
        if (signal?.aborted) return;
        if (!buffer) continue;
        const list = this.clips.get(event) ?? [];
        list.push(buffer);
        this.clips.set(event, list);
        loaded++;
      }
    }
  }

  private async fetchClip(ctx: BaseAudioContext, name: string, signal: AbortSignal | undefined): Promise<AudioBuffer | null> {
    try {
      const response = await fetch(MEME_CLIPS.baseUrl + encodeURIComponent(name), { signal });
      if (!response.ok) return null;
      const data = await response.arrayBuffer();
      if (data.byteLength === 0 || data.byteLength > MEME_CLIPS.maxClipBytes) return null;
      return await ctx.decodeAudioData(data);
    } catch {
      return null;
    }
  }
}
