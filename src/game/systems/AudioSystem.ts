/**
 * Procedural WebAudio: all SFX and the music loop are synthesized at runtime,
 * so the project ships zero audio assets (and zero licensing questions).
 * The context is created lazily on first user gesture to satisfy autoplay
 * policies.
 */
export class AudioSystem {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private muted = false;

  // Music scheduler state
  private musicPlaying = false;
  private nextStepTime = 0;
  private stepIndex = 0;

  private static readonly BASS_PATTERN = [55, 0, 55, 65.41, 55, 0, 49, 82.41];
  private static readonly LEAD_NOTES = [220, 261.63, 329.63, 392, 440];

  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(this.ctx.destination);

    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = 0.9;
    this.sfxBus.connect(this.master);

    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = 0.32;
    this.musicBus.connect(this.master);

    const length = this.ctx.sampleRate;
    this.noiseBuffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.03);
    }
  }

  // ------------------------------------------------------------------- SFX

  playCoin(): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.exponentialRampToValueAtTime(1420, t + 0.09);
    gain.gain.setValueAtTime(0.16, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    osc.connect(gain).connect(this.sfxBus);
    osc.start(t);
    osc.stop(t + 0.15);
  }

  playJump(): void {
    this.chirp("square", 240, 520, 0.16, 0.09);
  }

  playLand(): void {
    this.thud(0.06, 120);
  }

  playSlide(): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus || !this.noiseBuffer) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(1600, t);
    filter.frequency.exponentialRampToValueAtTime(320, t + 0.28);
    filter.Q.value = 0.9;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    src.connect(filter).connect(gain).connect(this.sfxBus);
    src.start(t);
    src.stop(t + 0.32);
  }

  playCrash(): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus || !this.noiseBuffer) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(2600, t);
    filter.frequency.exponentialRampToValueAtTime(180, t + 0.5);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    src.connect(filter).connect(gain).connect(this.sfxBus);
    src.start(t);
    src.stop(t + 0.6);
    this.thud(0.35, 60);
  }

  playClick(): void {
    this.chirp("triangle", 900, 620, 0.07, 0.07);
  }

  playCountdownBeep(final: boolean): void {
    this.chirp("sine", final ? 880 : 440, final ? 880 : 440, final ? 0.4 : 0.12, 0.12);
  }

  // ------------------------------------------------------------- V2 SFX hooks

  /** Rising arpeggio for power-up pickup. */
  playPowerup(): void {
    this.chirp("square", 420, 980, 0.18, 0.12);
    this.chirpAt("sine", 700, 1400, 0.22, 0.08, 0.05);
  }

  /** Glassy burst + low thump for shield break. */
  playShieldBreak(): void {
    this.chirp("sawtooth", 1200, 220, 0.3, 0.14);
    this.thud(0.28, 70);
  }

  /** Soft whoosh for near miss. */
  playNearMiss(): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus || !this.noiseBuffer) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(2400, t);
    filter.frequency.exponentialRampToValueAtTime(500, t + 0.16);
    filter.Q.value = 1.4;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.09, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    src.connect(filter).connect(gain).connect(this.sfxBus);
    src.start(t);
    src.stop(t + 0.2);
  }

  /** Bright tick for perfect actions. */
  playPerfect(): void {
    this.chirp("sine", 1320, 1760, 0.1, 0.1);
  }

  /** Combo milestone: two quick ascending blips; pitch rises with combo tier. */
  playComboMilestone(tier: number): void {
    const base = 520 + Math.min(tier, 4) * 90;
    this.chirp("triangle", base, base * 1.25, 0.09, 0.1);
    this.chirpAt("triangle", base * 1.5, base * 1.8, 0.11, 0.09, 0.07);
  }

  /** Overdrive ready: urgent rising pair. */
  playOverdriveReady(): void {
    this.chirp("square", 300, 600, 0.16, 0.1);
    this.chirpAt("square", 450, 900, 0.2, 0.1, 0.12);
  }

  /** Overdrive activation: big sweep + sub drop. */
  playOverdriveActivate(): void {
    this.chirp("sawtooth", 160, 720, 0.45, 0.16);
    this.thud(0.32, 55);
  }

  /** Metal smash for destroyed obstacles. */
  playSmash(): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus || !this.noiseBuffer) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(3200, t);
    filter.frequency.exponentialRampToValueAtTime(400, t + 0.22);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.26, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
    src.connect(filter).connect(gain).connect(this.sfxBus);
    src.start(t);
    src.stop(t + 0.26);
    this.thud(0.2, 80);
  }

  playLevelUp(): void {
    this.chirp("triangle", 520, 780, 0.14, 0.12);
    this.chirpAt("triangle", 660, 1040, 0.18, 0.12, 0.1);
    this.chirpAt("triangle", 880, 1320, 0.24, 0.1, 0.2);
  }

  playMissionComplete(): void {
    this.chirp("sine", 700, 1050, 0.13, 0.11);
    this.chirpAt("sine", 1050, 1400, 0.16, 0.1, 0.09);
  }

  playUnlock(): void {
    this.chirp("triangle", 840, 1260, 0.16, 0.1);
  }

  playBiomeShift(): void {
    this.chirp("sine", 260, 520, 0.5, 0.06);
  }

  /** Warning stinger for drone/laser events. */
  playWarn(): void {
    this.chirp("square", 220, 180, 0.14, 0.09);
    this.chirpAt("square", 220, 180, 0.14, 0.09, 0.2);
  }

  // ------------------------------------------------------------ channel toggles

  setMusicEnabled(enabled: boolean): void {
    if (this.musicBus && this.ctx) {
      this.musicBus.gain.setTargetAtTime(enabled ? 0.32 : 0, this.ctx.currentTime, 0.04);
    }
  }

  setSfxEnabled(enabled: boolean): void {
    if (this.sfxBus && this.ctx) {
      this.sfxBus.gain.setTargetAtTime(enabled ? 0.9 : 0, this.ctx.currentTime, 0.04);
    }
  }

  // ----------------------------------------------------------------- music

  startMusic(): void {
    if (!this.ctx || this.musicPlaying) return;
    this.musicPlaying = true;
    this.nextStepTime = this.ctx.currentTime + 0.08;
    this.stepIndex = 0;
  }

  stopMusic(): void {
    this.musicPlaying = false;
  }

  /** Called every frame; schedules synth notes slightly ahead of playback. */
  update(speedRatio: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicPlaying || !this.musicBus) return;
    const bpm = 112 + speedRatio * 38;
    const stepDur = 60 / bpm / 2;
    while (this.nextStepTime < ctx.currentTime + 0.18) {
      this.scheduleStep(this.stepIndex % 8, this.nextStepTime, stepDur, speedRatio);
      this.stepIndex++;
      this.nextStepTime += stepDur;
    }
  }

  dispose(): void {
    this.stopMusic();
    if (this.ctx) {
      void this.ctx.close().catch(() => undefined);
      this.ctx = null;
      this.master = null;
      this.sfxBus = null;
      this.musicBus = null;
    }
  }

  // ------------------------------------------------------------------ intern

  private scheduleStep(step: number, time: number, stepDur: number, ratio: number): void {
    const ctx = this.ctx!;
    const bus = this.musicBus!;

    // Kick on quarters
    if (step % 2 === 0) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(130, time);
      osc.frequency.exponentialRampToValueAtTime(42, time + 0.11);
      gain.gain.setValueAtTime(0.5, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.13);
      osc.connect(gain).connect(bus);
      osc.start(time);
      osc.stop(time + 0.15);
    }

    // Bass line
    const bassNote = AudioSystem.BASS_PATTERN[step];
    if (bassNote > 0) {
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.value = bassNote;
      filter.type = "lowpass";
      filter.frequency.value = 260 + ratio * 900;
      filter.Q.value = 6;
      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.exponentialRampToValueAtTime(0.24, time + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, time + stepDur * 0.95);
      osc.connect(filter).connect(gain).connect(bus);
      osc.start(time);
      osc.stop(time + stepDur);
    }

    // Hats on offbeats
    if (step % 2 === 1 && this.noiseBuffer) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = "highpass";
      filter.frequency.value = 6500;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.05, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
      src.connect(filter).connect(gain).connect(bus);
      src.start(time);
      src.stop(time + 0.06);
    }

    // Sparse lead pluck
    if ((step === 3 || step === 7) && Math.random() < 0.75) {
      const freq = AudioSystem.LEAD_NOTES[Math.floor(Math.random() * AudioSystem.LEAD_NOTES.length)];
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.exponentialRampToValueAtTime(0.1, time + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.22);
      osc.connect(gain).connect(bus);
      osc.start(time);
      osc.stop(time + 0.25);
    }
  }

  private chirp(
    type: OscillatorType,
    from: number,
    to: number,
    duration: number,
    volume: number
  ): void {
    this.chirpAt(type, from, to, duration, volume, 0);
  }

  private chirpAt(
    type: OscillatorType,
    from: number,
    to: number,
    duration: number,
    volume: number,
    delaySeconds: number
  ): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus) return;
    const t = ctx.currentTime + delaySeconds;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(to, 1), t + duration);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(volume, 0.001), t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain).connect(this.sfxBus);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  private thud(volume: number, frequency: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(frequency, t);
    osc.frequency.exponentialRampToValueAtTime(38, t + 0.16);
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    osc.connect(gain).connect(this.sfxBus);
    osc.start(t);
    osc.stop(t + 0.22);
  }
}
