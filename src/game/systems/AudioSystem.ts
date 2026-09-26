import type { MemeEvent } from "@/types/game";
import { buildAudioGraph, type AudioGraph } from "@/game/audio/AudioGraph";
import { DesiMusic, type BeatTiming } from "@/game/audio/DesiMusic";
import { DesiSfx } from "@/game/audio/DesiSfx";
import { MemeClips } from "@/game/audio/MemeClips";
import { MemeVoice } from "@/game/audio/MemeVoice";
import { SpeechVoice } from "@/game/audio/SpeechVoice";
import { MEME_TIMING } from "@/game/config/memes";
import { MUSIC_MIX, MUSIC_THEMES } from "@/game/config/music";

export type { BeatTiming } from "@/game/audio/DesiMusic";

const SFX_LEVEL = 0.9;
const VOICE_LEVEL = 1;
/** Time constant for toggle fades (click-free on/off). */
const TOGGLE_TIME = 0.04;
/** No update() for this long = game loop frozen (pause / hidden tab). */
const FREEZE_AFTER_MS = 300;
const WATCHDOG_MS = 250;
/** Thrust loop auto-stops if setRocketThrust(true) goes unasserted this long. */
const THRUST_SAFETY_MS = 12000;

/**
 * Desi soundtrack facade. Everything is synthesized at runtime — dhol /
 * tabla grooves, shehnai / bansuri leads, street SFX and the FAAAH shout —
 * and meme catchphrases are spoken by the player's own device (Web Speech),
 * so the game ships zero third-party audio. Optional user clips can be
 * dropped into public/sounds/memes (see README there).
 *
 * The AudioContext is created lazily in unlock() (first user gesture);
 * nothing here touches browser APIs during SSR. Every method is a safe
 * no-op before unlock and after dispose.
 */
export class AudioSystem {
  private ctx: AudioContext | null = null;
  private graph: AudioGraph | null = null;
  private sfx: DesiSfx | null = null;
  private music: DesiMusic | null = null;
  private memes: MemeVoice | null = null;
  private readonly speech = new SpeechVoice();
  private readonly clips = new MemeClips();

  private muted = false;
  private musicEnabled = true;
  private sfxEnabled = true;
  private voiceEnabled = true;
  private musicTheme = 0;
  private thrustWanted = false;
  private thrustAssertedAt = 0;
  private lastUpdateAt = 0;
  private frozen = false;
  private watchdog: number | null = null;

  /** Game shows meme subtitles in the HUD through this hook. */
  onMemeCaption: ((caption: string, sub?: string) => void) | null = null;

  unlock(): void {
    if (typeof window === "undefined") return;
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume().catch(() => undefined);
      return;
    }
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    let ctx: AudioContext;
    try {
      ctx = new Ctor({ latencyHint: "interactive" });
    } catch {
      try {
        ctx = new Ctor();
      } catch {
        return;
      }
    }
    this.ctx = ctx;
    const graph = buildAudioGraph(ctx);
    this.graph = graph;
    this.sfx = new DesiSfx(graph);
    this.music = new DesiMusic(graph);
    this.music.setTheme(this.musicTheme);
    this.speech.init();
    this.memes = new MemeVoice(graph, this.sfx, this.speech, this.clips, this.setDucked);
    this.memes.onCaption = (caption, sub) => this.onMemeCaption?.(caption, sub);
    this.applyLevels(true);
    this.clips.load(ctx);

    // Old iOS needs a sound started inside the gesture to fully unlock.
    const blip = ctx.createBufferSource();
    blip.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    blip.connect(ctx.destination);
    blip.start(0);
    if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);

    this.lastUpdateAt = performance.now();
    this.watchdog = window.setInterval(this.checkFrozen, WATCHDOG_MS);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyLevels(false);
  }

  // ------------------------------------------------------------------- SFX

  playCoin(): void {
    this.sfx?.coin();
  }

  playJump(): void {
    this.sfx?.jump();
  }

  playLand(): void {
    this.sfx?.land();
  }

  playSlide(): void {
    this.sfx?.slide();
  }

  playCrash(): void {
    this.sfx?.crash();
  }

  playClick(): void {
    this.sfx?.click();
  }

  /** 3-2-1 = rising tabla + dhol taps; `final` (GO!) = big dhol "DHA". */
  playCountdownBeep(final: boolean): void {
    this.sfx?.countdown(final);
  }

  // ------------------------------------------------------------- V2 SFX hooks

  /** Rising bell sparkle for power-up pickup. */
  playPowerup(): void {
    this.sfx?.powerup();
  }

  /** Glassy shatter + thump for the nimbu-mirchi shield breaking. */
  playShieldBreak(): void {
    this.sfx?.shieldBreak();
  }

  /** Stereo whoosh for near miss. */
  playNearMiss(): void {
    this.sfx?.nearMiss();
  }

  /** Bright bell tick for perfect actions. */
  playPerfect(): void {
    this.sfx?.perfect();
  }

  /** Combo milestone: bells rise with the combo tier. */
  playComboMilestone(tier: number): void {
    this.sfx?.comboMilestone(tier);
  }

  /** JOSH meter full: dhol pair + shehnai rise. */
  playOverdriveReady(): void {
    this.sfx?.overdriveReady();
  }

  /** JOSH activation: double dhol + sweep. */
  playOverdriveActivate(): void {
    this.sfx?.overdriveActivate();
  }

  /** Crunch for destroyed obstacles. */
  playSmash(): void {
    this.sfx?.smash();
  }

  playLevelUp(): void {
    this.sfx?.levelUp();
  }

  playMissionComplete(): void {
    this.sfx?.missionComplete();
  }

  playUnlock(): void {
    this.sfx?.unlock();
  }

  playBiomeShift(): void {
    this.sfx?.biomeShift();
  }

  /** Warning stinger for drone / laser events. */
  playWarn(): void {
    this.sfx?.warn();
  }

  // ------------------------------------------------- desi hooks (engine contract)

  /**
   * Plays a desi meme voice line for a gameplay moment. Owns its own
   * cooldowns / chances / priorities, so the engine may report every moment.
   * Returns true when the line was accepted (playing, or queued right behind
   * another high-priority line). With master mute on, the caption and
   * pacing still happen silently; with voice lines off it returns false.
   */
  playMeme(event: MemeEvent): boolean {
    return this.memes?.play(event) ?? false;
  }

  /** Voice-line toggle: gates TTS, the synthesized FAAAH and user clips. */
  setVoiceEnabled(enabled: boolean): void {
    this.voiceEnabled = enabled;
    this.applyLevels(false);
  }

  /** Diwali-rocket ignition: fuse hiss → FWOOSH + whistle + crackle. */
  playRocketLaunch(): void {
    this.sfx?.rocketLaunch();
  }

  /**
   * Continuous thrust loop while flying. Idempotent: safe to call every
   * frame with `player.isFlying`. Auto-stops if not re-asserted for 12 s.
   */
  setRocketThrust(on: boolean): void {
    if (on) this.thrustAssertedAt = performance.now();
    if (on === this.thrustWanted) return;
    this.thrustWanted = on;
    this.sfx?.setThrust(on);
  }

  playRocketLand(): void {
    this.sfx?.rocketLand();
  }

  /** Magnet (chumbak) switched on: resonant "vwooom". */
  playMagnetOn(): void {
    this.sfx?.magnetOn();
  }

  /** Auto-rickshaw bulb horn "pom-pom" (approaching vehicles). */
  playHonk(): void {
    this.sfx?.honk();
  }

  /** Cow moo (approaching cows). */
  playMoo(): void {
    this.sfx?.moo();
  }

  /** Bicycle / cycle-rickshaw bell "tring-tring". */
  playBell(): void {
    this.sfx?.bell();
  }

  /**
   * Biome-driven music flavour (index into BIOMES): 0 Chandni Chowk,
   * 1 Pink City, 2 Mumbai Monsoon, 3 Diwali Night. While playing, the switch
   * lands on the next bar after a drum fill.
   */
  setMusicTheme(themeIndex: number): void {
    const count = MUSIC_THEMES.length;
    const index = Number.isFinite(themeIndex) ? ((Math.floor(themeIndex) % count) + count) % count : 0;
    this.musicTheme = index;
    this.music?.setTheme(index);
  }

  /**
   * Where the groove is right now, as heard (output latency compensated):
   * `phase` 0 = on the beat (dhol hit) → 1 just before the next. Null while
   * the music isn't running. Allocation-free: returns one reused object.
   */
  getBeatTiming(): BeatTiming | null {
    const ctx = this.ctx;
    if (!ctx || !this.music) return null;
    const latency = ctx.outputLatency || ctx.baseLatency || 0;
    return this.music.beatTiming(ctx.currentTime - latency);
  }

  // ------------------------------------------------------------ channel toggles

  setMusicEnabled(enabled: boolean): void {
    this.musicEnabled = enabled;
    this.applyLevels(false);
  }

  setSfxEnabled(enabled: boolean): void {
    this.sfxEnabled = enabled;
    this.applyLevels(false);
  }

  // ----------------------------------------------------------------- music

  startMusic(): void {
    this.music?.start();
  }

  stopMusic(): void {
    this.music?.stop();
  }

  /** Called every frame; schedules the groove slightly ahead of playback. */
  update(speedRatio: number): void {
    this.lastUpdateAt = performance.now();
    if (this.frozen) this.setFrozen(false);
    this.music?.update(speedRatio);
  }

  dispose(): void {
    if (this.watchdog !== null) {
      window.clearInterval(this.watchdog);
      this.watchdog = null;
    }
    this.memes?.dispose();
    this.memes = null;
    this.speech.dispose();
    this.clips.dispose();
    this.music?.dispose();
    this.music = null;
    this.sfx?.dispose();
    this.sfx = null;
    this.thrustWanted = false;
    if (this.ctx) {
      void this.ctx.close().catch(() => undefined);
      this.ctx = null;
      this.graph = null;
    }
  }

  // ------------------------------------------------------------------ intern

  /** Pushes mute / toggle state into the graph and the sub-systems. */
  private applyLevels(immediate: boolean): void {
    const graph = this.graph;
    const ctx = this.ctx;
    if (!graph || !ctx) return;
    const t = ctx.currentTime;
    const set = (param: AudioParam, value: number) => {
      if (immediate) param.setValueAtTime(value, t);
      else param.setTargetAtTime(value, t, TOGGLE_TIME);
    };
    set(graph.master.gain, this.muted ? 0 : 1);
    set(graph.sfxBus.gain, this.sfxEnabled ? SFX_LEVEL : 0);
    set(graph.musicBus.gain, this.musicEnabled ? MUSIC_MIX.busGain : 0);
    set(graph.voiceBus.gain, this.voiceEnabled ? VOICE_LEVEL : 0);
    this.sfx?.setEnabled(this.sfxEnabled && !this.muted);
    this.music?.setAudible(this.musicEnabled && !this.muted);
    this.memes?.setEnabled(this.voiceEnabled);
    this.memes?.setMuted(this.muted);
  }

  /** Music ducks under voice lines (TTS can't be routed through Web Audio). */
  private setDucked = (on: boolean): void => {
    const graph = this.graph;
    if (!graph) return;
    const t = graph.ctx.currentTime;
    const gain = graph.musicDuck.gain;
    gain.cancelScheduledValues(t);
    gain.setTargetAtTime(
      on ? MEME_TIMING.duckGain : 1,
      t,
      on ? MEME_TIMING.duckAttack : MEME_TIMING.duckRelease
    );
  };

  /** Watchdog: silence loops while the game loop is frozen; thrust safety. */
  private checkFrozen = (): void => {
    const now = performance.now();
    if (this.thrustWanted && now - this.thrustAssertedAt > THRUST_SAFETY_MS) this.setRocketThrust(false);
    const frozen = now - this.lastUpdateAt > FREEZE_AFTER_MS;
    if (frozen !== this.frozen) this.setFrozen(frozen);
  };

  private setFrozen(frozen: boolean): void {
    this.frozen = frozen;
    this.music?.freeze(frozen);
    this.sfx?.freezeThrust(frozen);
  }
}
