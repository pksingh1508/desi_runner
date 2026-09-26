import type { MemeSpeechPart } from "@/game/config/memes";

/** macOS / Chrome novelty voices that would wreck the delivery. */
const NOVELTY_VOICES =
  /\b(albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|fred|junior|ralph|kathy)\b/i;
const QUALITY_VOICES = /natural|neural|premium|enhanced|wavenet/i;
/** Delay before speaking after cancelling (Chrome drops same-tick speaks). */
const RESTART_DELAY_MS = 80;

function isHindi(lang: string): boolean {
  return lang.toLowerCase().startsWith("hi");
}

/** Hindi (Devanagari) first, then Indian English, then any English. */
function scoreVoice(voice: SpeechSynthesisVoice): number {
  const lang = voice.lang.toLowerCase().replace("_", "-");
  let score = lang === "hi-in" ? 100 : lang.startsWith("hi") ? 90 : lang === "en-in" ? 60 : lang.startsWith("en") ? 20 : 0;
  if (QUALITY_VOICES.test(voice.name)) score += 8;
  if (voice.localService) score += 3; // lower latency, works offline
  if (voice.default) score += 1;
  if (NOVELTY_VOICES.test(voice.name)) score -= 30;
  return score;
}

/**
 * Web Speech API wrapper for the meme lines — speech is generated on the
 * player's own device, so nothing copyrighted ships with the game. Picks
 * voices once (re-picking only when the browser's list changes), speaks
 * multi-part call-and-response lines and reports completion exactly once.
 * Browser-only: nothing touches `window` until `init()` (after a gesture).
 */
export class SpeechVoice {
  private synth: SpeechSynthesis | null = null;
  private main: SpeechSynthesisVoice | null = null;
  private alt: SpeechSynthesisVoice | null = null;
  private voicesKnown = false;
  private primed = false;
  private token = 0;
  /** Strong reference — Chrome drops events of garbage-collected utterances. */
  private utterance: SpeechSynthesisUtterance | null = null;
  private timer: number | null = null;

  init(): void {
    if (this.synth || typeof window === "undefined") return;
    if (!("speechSynthesis" in window) || typeof window.SpeechSynthesisUtterance !== "function") return;
    this.synth = window.speechSynthesis;
    this.synth.addEventListener("voiceschanged", this.onVoicesChanged);
    this.pickVoices();
    this.prime();
  }

  get available(): boolean {
    return this.synth !== null;
  }

  /** True while one of our lines is speaking or waiting between parts. */
  get busy(): boolean {
    return this.utterance !== null || this.timer !== null;
  }

  /** Voice names picked for main / alt (debugging and QA). */
  describe(): { main: string | null; alt: string | null; hindi: boolean } {
    if (!this.voicesKnown) this.pickVoices();
    return {
      main: this.main ? `${this.main.name} (${this.main.lang})` : null,
      alt: this.alt ? `${this.alt.name} (${this.alt.lang})` : null,
      hindi: this.main !== null && isHindi(this.main.lang),
    };
  }

  /**
   * Speaks the parts in order. `onEnd(completed)` fires exactly once unless
   * the line is cancelled first. Returns false when speech is unavailable.
   */
  speak(parts: readonly MemeSpeechPart[], onEnd: (completed: boolean) => void): boolean {
    const synth = this.synth;
    if (!synth || parts.length === 0) return false;
    if (!this.voicesKnown) this.pickVoices();
    const busy = synth.speaking || synth.pending;
    this.cancel();
    const token = this.token;
    if (synth.paused) synth.resume();
    if (busy) {
      this.timer = window.setTimeout(() => {
        this.timer = null;
        this.speakPart(parts, 0, token, onEnd);
      }, RESTART_DELAY_MS);
    } else {
      this.speakPart(parts, 0, token, onEnd);
    }
    return true;
  }

  /** Stops the current line silently (its onEnd will not fire). */
  cancel(): void {
    this.token++;
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
    this.utterance = null;
    const synth = this.synth;
    if (synth && (synth.speaking || synth.pending)) synth.cancel();
  }

  dispose(): void {
    this.cancel();
    this.synth?.removeEventListener("voiceschanged", this.onVoicesChanged);
    this.synth = null;
  }

  // ---------------------------------------------------------------- intern

  private speakPart(
    parts: readonly MemeSpeechPart[],
    index: number,
    token: number,
    onEnd: (completed: boolean) => void
  ): void {
    const synth = this.synth;
    if (!synth || token !== this.token) return;
    const part = parts[index];
    const voice = part.voice === "alt" ? (this.alt ?? this.main) : this.main;
    const hindi = voice !== null && isHindi(voice.lang);
    const utterance = new SpeechSynthesisUtterance(hindi ? part.hi : part.roman);
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    } else {
      utterance.lang = "en-IN";
    }
    // No second voice: exaggerate the pitch so the reply is another "person".
    const sameVoice = part.voice === "alt" && (this.alt === null || this.alt === this.main);
    utterance.pitch = sameVoice ? Math.min(2, part.pitch * 1.12) : part.pitch;
    utterance.rate = part.rate;
    utterance.volume = 1;
    utterance.onend = () => {
      if (token !== this.token) return;
      this.utterance = null;
      const next = index + 1;
      if (next >= parts.length) {
        onEnd(true);
        return;
      }
      this.timer = window.setTimeout(() => {
        this.timer = null;
        this.speakPart(parts, next, token, onEnd);
      }, Math.max(0, parts[next].pauseBefore * 1000));
    };
    utterance.onerror = () => {
      if (token !== this.token) return;
      this.utterance = null;
      onEnd(false);
    };
    this.utterance = utterance;
    synth.speak(utterance);
  }

  private onVoicesChanged = (): void => {
    this.pickVoices();
  };

  private pickVoices(): void {
    const synth = this.synth;
    if (!synth) return;
    let voices: SpeechSynthesisVoice[];
    try {
      voices = synth.getVoices();
    } catch {
      return;
    }
    if (voices.length === 0) return;
    this.voicesKnown = true;
    let best: SpeechSynthesisVoice | null = null;
    let bestScore = -Infinity;
    let second: SpeechSynthesisVoice | null = null;
    let secondScore = -Infinity;
    for (const voice of voices) {
      const score = scoreVoice(voice);
      if (score > bestScore) {
        second = best;
        secondScore = bestScore;
        best = voice;
        bestScore = score;
      } else if (score > secondScore) {
        second = voice;
        secondScore = score;
      }
    }
    this.main = best;
    // A second Hindi / Indian-English voice answers call-and-response lines.
    this.alt = second !== null && secondScore >= 50 ? second : best;
  }

  /** iOS only allows speech first triggered inside a gesture: speak silence. */
  private prime(): void {
    const synth = this.synth;
    if (this.primed || !synth) return;
    this.primed = true;
    try {
      const silent = new SpeechSynthesisUtterance("");
      silent.volume = 0;
      synth.speak(silent);
    } catch {
      /* speech stays best-effort */
    }
  }
}
