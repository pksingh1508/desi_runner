import * as THREE from "three";
import type { GameAction, GameState, HudPowerUp, MenuFocus, RunTallyData, SkillEventKind } from "@/types/game";
import { GameStore } from "./GameStore";
import { ResourceBag, disposeObjectTree } from "./utils/dispose";
import { createRenderer, type RendererHandle } from "./core/Renderer";
import { createSceneAndCamera, type SceneBundle } from "./core/GameScene";
import { CameraRig } from "./core/CameraRig";
import { PostFX } from "./core/PostFX";
import { SaveService } from "./core/SaveService";
import { Player } from "./player/Player";
import { RunnerWardrobe } from "./player/RunnerWardrobe";
import { PlayerFX } from "./player/PlayerFX";
import { InputSystem } from "./systems/InputSystem";
import { CollisionSystem, type ColliderLike } from "./systems/CollisionSystem";
import { ScoreSystem } from "./systems/ScoreSystem";
import { DifficultySystem } from "./systems/DifficultySystem";
import { ParticleSystem } from "./systems/ParticleSystem";
import { AudioSystem } from "./systems/AudioSystem";
import { PowerUpSystem } from "./systems/PowerUpSystem";
import { ComboSystem } from "./systems/ComboSystem";
import { SkillSystem } from "./systems/SkillSystem";
import { OverdriveSystem, OVERDRIVE_CFG } from "./systems/OverdriveSystem";
import { FeedbackSystem } from "./systems/FeedbackSystem";
import { RunEventSystem } from "./systems/RunEventSystem";
import { MissionSystem, type MissionProgressInput } from "./systems/MissionSystem";
import { AchievementSystem } from "./systems/AchievementSystem";
import { ProgressionSystem } from "./systems/ProgressionSystem";
import { SharedAssets } from "./world/SharedAssets";
import { BiomeManager } from "./world/BiomeManager";
import { WorldManager } from "./world/WorldManager";
import type { Coin } from "./entities/Coin";
import type { Key } from "./entities/Key";
import type { Rocket } from "./entities/Rocket";
import type { Obstacle } from "./entities/Obstacle";
import type { Drone } from "./systems/RunEventSystem";
import { DESI_BONUS, POST_FX, REVIVE, ROCKET_FLIGHT, ROCKET_RIDE, SPEED, TAAL } from "./config/gameplay";
import { MAGNET, POWERUP_DEFS, TURBO } from "./config/powerups";
import { BIOMES } from "./config/biomes";
import { getCharacter } from "./config/characters";
import { clamp } from "./utils/math";

const COUNTDOWN_STEP = 0.8;
const HUD_INTERVAL = 0.1;
/** Period between mission progress pushes during a run. */
const MISSION_SYNC_INTERVAL = 2;
/** Perceived impact freeze for smashes/shield breaks (simulation scaled). */
const HIT_STOP_SCALE = 0.18;
/** The idling menu runner dances every this-many seconds. */
const MENU_FLOURISH_SECONDS = 14;
/** Approach cues (honks, moos) fire when an obstacle enters this z window. */
const APPROACH_CUE_FAR_Z = -46;
const APPROACH_CUE_NEAR_Z = -30;

/**
 * Authoritative game orchestrator: owns the render loop, the state machine
 * and every system. React never touches per-frame state — it talks to
 * GameStore.
 */
export class Game {
  private bag = new ResourceBag();
  private rendererHandle: RendererHandle | null = null;
  private sceneBundle: SceneBundle | null = null;
  private cameraRig: CameraRig | null = null;
  private postFX: PostFX | null = null;

  private player = new Player();
  private playerFX = new PlayerFX();
  /** Equipped-runner resolution, lazy rig assets, equip + GEAR previews. */
  private wardrobe = new RunnerWardrobe(this.player);
  private world!: WorldManager;
  private biomeManager: BiomeManager | null = null;
  private input: InputSystem | null = null;
  private collision = new CollisionSystem();
  private score = new ScoreSystem();
  private difficulty = new DifficultySystem();
  private particles: ParticleSystem | null = null;
  private audio = new AudioSystem();

  // V2 systems
  private powerups = new PowerUpSystem();
  private combo = new ComboSystem();
  private skills = new SkillSystem();
  private overdrive = new OverdriveSystem();
  private feedback = new FeedbackSystem();
  private events: RunEventSystem | null = null;
  private missions = new MissionSystem();
  private achievements = new AchievementSystem();
  private progression = new ProgressionSystem();

  private timer = new THREE.Timer();
  private resizeObserver: ResizeObserver | null = null;
  private countdownLeft = 0;
  private lastCountdownValue = -1;
  private hudAccumulator = 0;
  private deathSpeed = 0;
  /** Sim-time scale for hit-stop moments (shield break / smashes). */
  private hitStopTimer = 0;
  private timeouts: number[] = [];
  private disposed = false;
  private reviveCountdown = 0;
  private reviveInvuln = 0;
  /** Rocket HUD timer pushes at ~10 Hz (never per frame). */
  private rocketHudTimer = 0;
  /** Seconds until the idling menu runner breaks into a dance flourish. */
  private menuFlourishTimer = MENU_FLOURISH_SECONDS;
  /** Consecutive on-beat jumps and the last TAAL toast time. */
  private taalStreak = 0;
  private lastTaalToast = -10;

  // Run bookkeeping
  private runTime = 0;
  /** Increments every startRun so delayed callbacks can detect stale runs. */
  private runEpoch = 0;
  private tally: RunTallyData = emptyTally();
  private lastCoinAt = -10;
  private coinStreak = 0;
  private missionSyncTimer = 0;
  private missionDeltas: NonNullable<MissionProgressInput["deltas"]> = {};
  private lastFps = 60;
  private fpsAccum = 0;
  private fpsFrames = 0;

  // Reusable per-frame scratch (avoid hot-loop allocations).
  private frameCoins: Coin[] = [];
  private frameKeys: Key[] = [];
  private frameRockets: Rocket[] = [];
  private nearObstacleScratch: Obstacle[] = [];
  private nearColliders: ColliderLike[] = [];
  private hudPowerups: HudPowerUp[] = [];
  private magnetTargetY = 0;
  /** Latest composed world speed — used to size the rocket coin trail. */
  private lastEffectiveSpeed: number = SPEED.start;

  constructor(
    private host: HTMLElement,
    private store: GameStore
  ) {}

  // ------------------------------------------------------------------ setup

  init(): void {
    this.store.clearRunResult();
    this.store.setLoading(0, "BOOTING");
    this.store.setState("loading");

    let rendererHandle: RendererHandle;
    try {
      rendererHandle = createRenderer(this.host, this.bag);
    } catch (error) {
      this.store.setError(error instanceof Error ? error.message : String(error));
      return;
    }
    this.rendererHandle = rendererHandle;

    rendererHandle.renderer.info.autoReset = false;
    const bundle = createSceneAndCamera(this.bag, rendererHandle.renderer);
    this.sceneBundle = bundle;
    this.cameraRig = new CameraRig(bundle.camera);
    this.postFX = new PostFX(rendererHandle.renderer, bundle.scene, bundle.camera);

    const save = SaveService.get();
    this.cameraRig.shakeEnabled = save.settings.screenShake;
    this.applyPerformanceMode(save.settings.performanceMode);
    this.audio.setMuted(save.settings.muted);
    this.audio.setMusicEnabled(save.settings.music);
    this.audio.setSfxEnabled(save.settings.sound);
    this.audio.setVoiceEnabled(save.settings.voice);
    this.audio.onMemeCaption = (caption, sub) => {
      this.feedback.push(caption, "meme", sub);
      this.store.setFeedback(this.feedback.snapshot(), this.feedback.banner);
    };
    this.store.setKeys(save.keys);

    const shared = new SharedAssets(this.bag, BIOMES.map((b) => b.billboardHues));
    this.world = new WorldManager(bundle.scene, shared, this.bag);
    this.biomeManager = new BiomeManager(bundle, shared);
    this.biomeManager.onBiomeShift = (name) => {
      this.feedback.push(`ENTERING ${name}`, "good");
      this.audio.playBiomeShift();
      if (this.biomeManager) this.audio.setMusicTheme(this.biomeManager.billboardSetIndex);
    };

    this.particles = new ParticleSystem(bundle.scene, this.bag);
    bundle.scene.add(this.player.root);
    this.player.root.add(this.playerFX.root);

    this.events = new RunEventSystem(this.world, this.bag, this.feedback, this.audio);

    this.input = new InputSystem(this.host, (action) => this.handleAction(action));
    this.player.onRocketLanded = this.handleRocketLanded;
    this.player.onRocketDescend = () => this.audio.playMeme("rocketLand");
    this.player.onLand = (impact) => {
      if (this.particles) this.particles.emitDust(this.player.positionX, 0, Math.round(clamp(impact / 4, 2, 8)));
      this.audio.playLand();
    };

    // V2 system wiring.
    this.combo.onMilestone = (count, mult) => {
      this.feedback.push(`COMBO ×${count}`, "combo", `×${mult} SCORE`);
      this.audio.playComboMilestone(Math.round(mult));
      this.overdrive.gain(OVERDRIVE_CFG.gainComboMilestone);
    };
    this.overdrive.onReady = () => {
      this.feedback.push("⚡ JOSH IS HIGH ⚡", "epic", "PRESS E / DOUBLE-TAP");
      this.audio.playOverdriveReady();
    };
    this.overdrive.onActivated = () => {
      this.tally.overdrives += 1;
      this.feedback.push("FULL JOSH!", "epic", "SMASH THROUGH");
      this.audio.playOverdriveActivate();
      this.audio.playMeme("speedBoost");
      this.cameraRig?.addShake(0.22);
    };
    this.overdrive.onEnded = () => {
      this.feedback.push("JOSH COOLED", "good");
    };

    this.missions.ensureToday();
    this.biomeManager.update(0, 0);

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.host);
    this.handleResize();

    window.addEventListener("visibilitychange", this.onVisibilityChange);

    this.connectTimer();
    rendererHandle.renderer.setAnimationLoop(() => this.frame());
    void this.loadCharacter();
  }

  /** Page Visibility integration: no huge deltas after tab switches. */
  private connectTimer(): void {
    if (typeof document !== "undefined") this.timer.connect(document);
  }

  private async loadCharacter(): Promise<void> {
    await this.wardrobe.loadInitial((ratio) => this.store.setLoading(ratio * 0.97, "LOADING RUNNER"));
    if (this.disposed) return;
    this.player.setLocomotion("idle");
    this.store.setLoading(1, "READY");
    this.store.setState("menu");
    this.store.setHud({
      score: 0,
      distance: 0,
      coins: 0,
      speedRatio: 0,
      tierName: "CHALTA HAI",
      tierLabel: "I",
    });
  }

  private handleResize(): void {
    if (!this.rendererHandle || !this.sceneBundle) return;
    const width = this.host.clientWidth || window.innerWidth;
    const height = this.host.clientHeight || window.innerHeight;
    this.rendererHandle.resize(width, height);
    this.sceneBundle.resize(width / Math.max(height, 1));
    this.postFX?.setSize(width, height, this.rendererHandle.renderer.getPixelRatio());
  }

  private onVisibilityChange = (): void => {
    if (document.hidden && this.store.getSnapshot().gameState === "playing") {
      this.pause();
    }
  };

  // ----------------------------------------------------------------- actions

  handleAction(action: GameAction): void {
    switch (this.store.getSnapshot().gameState) {
      case "menu":
        if (action === "confirm" || action === "jump") this.startRun();
        break;
      case "countdown":
        break;
      case "playing":
        switch (action) {
          case "left":
            this.player.requestLane(-1);
            break;
          case "right":
            this.player.requestLane(1);
            break;
          case "jump":
            if (this.player.requestJump()) this.judgeTaal();
            this.audio.playJump();
            break;
          case "slide":
            if (this.player.requestSlide()) {
              this.audio.playSlide();
              this.audio.playMeme("slide");
            }
            break;
          case "overdrive":
            if (!this.overdrive.tryActivate()) {
              this.feedback.push("JOSH NOT READY", "warn");
            }
            break;
          case "pause":
            this.pause();
            break;
          default:
            break;
        }
        break;
      case "paused":
        if (action === "pause" || action === "confirm") this.resume();
        break;
      case "revive":
        if (action === "confirm" || action === "jump") this.tryRevive();
        else if (action === "pause") this.skipRevive();
        break;
      case "gameover":
        if (action === "confirm" || action === "jump") this.startRun();
        break;
      default:
        break;
    }
  }

  tryRevive(): void {
    if (this.store.getSnapshot().gameState !== "revive") return;
    const save = SaveService.get();
    if (save.keys <= 0) {
      this.skipRevive();
      return;
    }
    SaveService.update((s) => {
      s.keys = Math.max(0, s.keys - 1);
    });
    this.tally.keysUsed += 1;
    this.store.setKeys(SaveService.get().keys);
    this.store.setReviveCountdown(0);
    this.reviveCountdown = 0;
    this.reviveInvuln = REVIVE.invulnerableSeconds;
    this.world.clearObstaclesAhead(this.player.positionX, 2.8);
    // Also sweep drones from the immediate area
    if (this.events) {
      for (let i = this.events.drones.length - 1; i >= 0; i--) {
        const d = this.events.drones[i];
        if (Math.abs(d.group.position.x - this.player.positionX) < 2.9 && Math.abs(d.group.position.z) < 7) {
          d.group.visible = false;
          d.state = "idle";
          this.events.drones.splice(i, 1);
        }
      }
    }
    this.player.revive();
    this.combo.breakCombo();
    this.hitStopTimer = 0;
    this.deathSpeed = 0;
    this.cameraRig?.addShake(0.28);
    this.feedback.push("LIFE SAVER!", "epic", "CONTINUE!");
    this.audio.playPowerup();
    this.audio.playMeme("revive");
    this.audio.startMusic();
    this.particles?.emitBurst(this.player.positionX, 1.1, 0, 0.98, 0.82, 0.18, 20, 1.2);
    this.setState("playing");
  }

  skipRevive(): void {
    if (this.store.getSnapshot().gameState !== "revive") return;
    this.store.setReviveCountdown(0);
    this.reviveCountdown = 0;
    // Proceed to real gameover — now finalize
    this.deathSpeed = this.difficulty.speed;
    this.setState("gameover");
    this.flushMissionProgress();
    const epoch = this.runEpoch;
    const timeoutId = window.setTimeout(() => {
      if (this.disposed || this.runEpoch !== epoch) return;
      this.finalizeRun();
    }, 900);
    this.timeouts.push(timeoutId);
  }

  startRun(): void {
    this.audio.unlock();
    this.audio.playClick();
    // A GEAR preview may be showing — always run as the equipped runner.
    this.wardrobe.applyEquipped();
    this.runEpoch++;
    this.score.reset();
    this.difficulty.reset();
    // Biome first: the world re-decorates for the biome it is told about.
    this.biomeManager?.reset();
    if (this.biomeManager) this.world.setBillboardSet(this.biomeManager.upcomingBiomeIndex);
    this.world.reset();
    this.player.reset();
    this.particles?.clear();
    this.powerups.reset();
    this.combo.lifetimeBest = SaveService.get().stats.highestCombo;
    this.combo.reset();
    this.overdrive.reset();
    this.skills.reset();
    this.events?.reset();
    this.feedback.clear();
    this.store.setFeedback([], null);
    this.missions.resetRunFlags();
    this.progression.resetRunState();
    this.runTime = 0;
    this.tally = emptyTally();
    this.taalStreak = 0;
    this.lastTaalToast = -10;
    this.lastCoinAt = -10;
    this.coinStreak = 0;
    this.missionSyncTimer = 0;
    this.missionDeltas = {};
    this.hitStopTimer = 0;
    this.reviveCountdown = 0;
    this.reviveInvuln = 0;
    this.rocketHudTimer = 0;
    this.audio.setRocketThrust(false);
    this.audio.setMusicTheme(0);
    this.store.setReviveCountdown(0);
    this.store.setRunKeys(0);
    this.store.setKeys(SaveService.get().keys);
    this.store.setRocket(false, 0);
    this.cameraRig?.setFovBoost(0);
    this.deathSpeed = 0;
    this.countdownLeft = COUNTDOWN_STEP * 3;
    this.lastCountdownValue = -1;
    this.store.clearRunResult();
    this.pushHud(true);
    this.setState("countdown");
    this.player.setLocomotion("run");
    this.cameraRig?.beginRunTransition(this.player.positionX);
  }

  pause(): void {
    if (this.store.getSnapshot().gameState !== "playing") return;
    this.audio.playClick();
    this.audio.setRocketThrust(false);
    this.setState("paused");
  }

  resume(): void {
    if (this.store.getSnapshot().gameState !== "paused") return;
    this.audio.playClick();
    this.audio.setRocketThrust(this.player.isFlying);
    this.setState("playing");
  }

  /** From pause / game over / revive back to the main menu (fresh ambient scene). */
  returnToMenu(): void {
    this.audio.stopMusic();
    this.audio.playClick();
    this.score.reset();
    this.difficulty.reset();
    this.biomeManager?.reset();
    if (this.biomeManager) this.world.setBillboardSet(this.biomeManager.upcomingBiomeIndex);
    this.world.reset();
    this.player.reset();
    this.particles?.clear();
    this.powerups.reset();
    this.overdrive.reset();
    this.feedback.clear();
    this.store.setFeedback([], null);
    this.events?.reset();
    this.postFX?.setBloomStrength(POST_FX.bloomStrength);
    this.cameraRig?.setFovBoost(0);
    this.deathSpeed = 0;
    this.hitStopTimer = 0;
    this.reviveCountdown = 0;
    this.reviveInvuln = 0;
    this.rocketHudTimer = 0;
    this.audio.setRocketThrust(false);
    this.audio.setMusicTheme(0);
    this.store.setReviveCountdown(0);
    this.store.setKeys(SaveService.get().keys);
    this.store.setRocket(false, 0);
    this.store.clearRunResult();
    this.pushHud(true);
    this.setState("menu");
    this.player.setLocomotion("idle");
  }

  // ------------------------------------------------------- settings / gear

  toggleMute(): void {
    const next = !this.store.getSnapshot().muted;
    this.store.setMuted(next);
    this.audio.setMuted(next);
  }

  toggleShake(): boolean {
    const next = !SaveService.get().settings.screenShake;
    SaveService.update((s) => {
      s.settings.screenShake = next;
    });
    if (this.cameraRig) this.cameraRig.shakeEnabled = next;
    this.store.bumpMetaVersion();
    return next;
  }

  toggleMusic(): boolean {
    const next = !SaveService.get().settings.music;
    SaveService.update((s) => {
      s.settings.music = next;
    });
    this.audio.setMusicEnabled(next);
    this.store.bumpMetaVersion();
    return next;
  }

  toggleVoice(): boolean {
    const next = !SaveService.get().settings.voice;
    SaveService.update((s) => {
      s.settings.voice = next;
    });
    this.audio.unlock();
    this.audio.setVoiceEnabled(next);
    this.store.bumpMetaVersion();
    return next;
  }

  /**
   * Menu-only 3D preview of any runner (locked ones included) without
   * equipping it. `null` restores the equipped runner.
   */
  previewCharacter(id: string | null): void {
    if (this.store.getSnapshot().gameState !== "menu") return;
    if (id === null) this.wardrobe.applyEquipped();
    else this.wardrobe.preview(id);
  }

  /**
   * Menu camera framing per tab (GEAR zooms onto the runner for a closer
   * look at the equipped character).
   */
  setMenuFocus(focus: MenuFocus): void {
    this.cameraRig?.setMenuFocus(focus);
  }

  toggleSound(): boolean {
    const next = !SaveService.get().settings.sound;
    SaveService.update((s) => {
      s.settings.sound = next;
    });
    this.audio.setSfxEnabled(next);
    this.store.bumpMetaVersion();
    return next;
  }

  togglePerformanceMode(): boolean {
    const next = !SaveService.get().settings.performanceMode;
    SaveService.update((s) => {
      s.settings.performanceMode = next;
    });
    this.applyPerformanceMode(next);
    this.store.bumpMetaVersion();
    return next;
  }

  private applyPerformanceMode(on: boolean): void {
    if (!this.rendererHandle || !this.sceneBundle) return;
    const renderer = this.rendererHandle.renderer;
    const baseCap = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches ? 1.75 : 2;
    renderer.setPixelRatio(on ? 1 : Math.min(window.devicePixelRatio || 1, baseCap));
    renderer.shadowMap.enabled = !on;
    this.sceneBundle.sun.castShadow = !on;
    // Bloom/MSAA post chain only on capable (fine-pointer) devices.
    const coarse = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
    this.postFX?.setEnabled(!on && !coarse);
    this.handleResize();
  }

  /**
   * Equips a character only when the player's level has unlocked it.
   * Returns false (and changes nothing) for locked/unknown ids — the GEAR
   * tab disables those cards, this is the engine-side enforcement so a
   * locked runner can never reach the track.
   */
  equipCharacter(id: string): boolean {
    const def = getCharacter(id);
    if (def.id !== id) return false;
    if (SaveService.get().progression.level < def.unlockLevel) return false;
    SaveService.update((s) => {
      s.customization.character = id;
    });
    this.wardrobe.applyEquipped(true);
    this.audio.unlock();
    this.audio.playUnlock();
    this.store.bumpMetaVersion();
    return true;
  }

  getDebugInfo() {
    const info = this.rendererHandle?.renderer.info;
    return {
      fps: Math.round(this.lastFps),
      drawCalls: info?.render.calls ?? 0,
      triangles: info?.render.triangles ?? 0,
      speed: this.difficulty.speed.toFixed(1),
      lane: this.player.currentLane,
      state: this.store.getSnapshot().gameState,
      distance: Math.floor(this.score.distance),
      obstacles: this.world?.activeObstacleCount ?? 0,
      coinsActive: this.world?.activeCoinCount ?? 0,
      keysActive: this.world?.activeKeyCount ?? 0,
      rocketsActive: this.world?.activeRocketCount ?? 0,
      keys: SaveService.get().keys,
      isFlying: this.player.isFlying,
      usingFallback: this.player.isUsingFallback(),
    };
  }

  /** Menu-facing views (missions/achievements live in engine systems). */
  getMissionViews() {
    this.missions.ensureToday();
    return this.missions.view();
  }

  getAchievementViews() {
    return this.achievements.view();
  }

  getSettings() {
    return SaveService.get().settings;
  }

  // ------------------------------------------------------------------- loop

  private setState(state: GameState): void {
    this.store.setState(state);
  }

  private frame(): void {
    // Timer handles visibility spikes; the clamp is belt-and-braces.
    let delta = clamp(this.timer.update().getDelta(), 0, 0.05);
    const nowMs = performance.now();
    this.store.flush(nowMs);
    if (!this.sceneBundle || !this.cameraRig) return;

    // Hit-stop: brief perceived impact via simulation time scaling.
    if (this.hitStopTimer > 0) {
      this.hitStopTimer -= delta;
      delta *= HIT_STOP_SCALE;
    }

    const state = this.store.getSnapshot().gameState;

    // FPS estimate for the debug overlay.
    this.fpsAccum += delta;
    this.fpsFrames++;
    if (this.fpsAccum >= 0.5) {
      this.lastFps = this.fpsFrames / this.fpsAccum;
      this.fpsAccum = 0;
      this.fpsFrames = 0;
    }

    switch (state) {
      case "loading":
        break;
      case "menu":
        this.updateAmbient(delta, SPEED.menuSpeed);
        break;
      case "countdown":
        this.updateCountdown(delta);
        break;
      case "playing":
        this.updatePlaying(delta);
        break;
      case "paused":
        // Frozen simulation; keep rendering the last frame.
        break;
      case "revive":
        this.updateRevive(delta);
        break;
      case "gameover":
        this.updateGameOver(delta);
        break;
    }

    if (state !== "paused" && state !== "loading") {
      this.biomeManager?.updateAmbient(delta, this.currentWorldSpeed(state));
    }

    // Stats accumulate across every pass of the frame (post chain included).
    const renderer = this.rendererHandle!.renderer;
    renderer.info.reset();
    if (this.postFX) this.postFX.render(this.sceneBundle.scene, this.sceneBundle.camera, delta);
    else renderer.render(this.sceneBundle.scene, this.sceneBundle.camera);
  }

  /** World scroll speed for ambient effects in the given state. */
  private currentWorldSpeed(state: GameState): number {
    switch (state) {
      case "menu":
        return SPEED.menuSpeed;
      case "countdown":
        return SPEED.start * SPEED.countdownFactor;
      case "playing":
        return this.lastEffectiveSpeed;
      case "gameover":
        return this.deathSpeed;
      default:
        return 0;
    }
  }

  private updateAmbient(delta: number, speed: number): void {
    this.menuFlourishTimer -= delta;
    if (this.menuFlourishTimer <= 0) {
      this.menuFlourishTimer = MENU_FLOURISH_SECONDS;
      this.player.celebrate(2.6);
    }
    this.world.update(delta, speed, 0, 0);
    this.particles?.update(delta, speed, 0);
    this.playerFX.update(delta);
    this.player.setWorldSpeed(speed);
    this.player.update(delta, 0);
    this.syncLights();
    this.cameraRig!.updateMenu(delta, this.player.positionX);
    this.audio.update(0);
  }

  private updateCountdown(delta: number): void {
    this.countdownLeft -= delta;
    const elapsed = COUNTDOWN_STEP * 3 - this.countdownLeft;
    const value = 3 - Math.min(3, Math.floor(elapsed / COUNTDOWN_STEP));
    if (value !== this.lastCountdownValue && value > 0) {
      this.lastCountdownValue = value;
      this.store.setCountdown(value);
      this.audio.playCountdownBeep(false);
    }

    const speed = SPEED.start * SPEED.countdownFactor;
    this.world.update(delta, speed, 0, 0);
    this.difficulty.overrideSpeed(speed);
    this.player.setWorldSpeed(speed);
    this.player.update(delta, SPEED.countdownFactor);
    this.particles?.update(delta, speed, 0.15);
    this.playerFX.update(delta);
    this.syncLights();
    this.cameraRig!.updatePlaying(delta, this.player, 0.12, true);
    this.audio.update(0.12);

    if (this.countdownLeft <= 0) {
      this.store.setCountdown(0); // GO!
      this.audio.playCountdownBeep(true);
      this.audio.startMusic();
      this.audio.playMeme("start");
      this.setState("playing");
    }
  }

  private updatePlaying(rawDelta: number): void {
    const delta = rawDelta;
    this.runTime += delta;
    if (this.reviveInvuln > 0) this.reviveInvuln -= delta;

    // ---- speed composition: difficulty × turbo × overdrive (all damped)
    const baseSpeed = this.difficulty.update(delta, true);
    const effectiveSpeed =
      baseSpeed * this.powerups.turboSpeedFactor * (1 + (OVERDRIVE_CFG.speedFactor - 1) * this.overdrive.ramp);
    this.lastEffectiveSpeed = effectiveSpeed;
    const ratioRaw = (effectiveSpeed - SPEED.start) / (SPEED.max * 1.45 - SPEED.start);
    const ratio = clamp(ratioRaw, 0, 1);

    // Total run-score multiplier (never touches wallets or XP).
    const totalMult =
      this.combo.multiplier *
      this.powerups.scoreMultiplierBonus *
      (this.overdrive.active ? OVERDRIVE_CFG.scoreMultBonus : 1) *
      (this.powerups.turboProtects ? TURBO.scoreBonusMult : 1);

    this.world.update(delta, effectiveSpeed, this.difficulty.tier.index, this.score.distance);
    this.biomeManager?.update(delta, this.score.distance);
    if (this.biomeManager) {
      // Recycled segments sit ~400 m ahead: decorate them (and pick obstacle
      // variants) for the biome the runner will actually reach there.
      this.world.setBillboardSet(this.biomeManager.upcomingBiomeIndex);
      // Diwali Night (biome 3) glows harder.
      const current = this.biomeManager.billboardSetIndex;
      this.postFX?.setBloomStrength(current === 3 ? POST_FX.nightBloomStrength : POST_FX.bloomStrength);
    }
    this.events?.update(delta, this.score.distance, effectiveSpeed, this.difficulty.tier.index);
    this.player.setWorldSpeed(effectiveSpeed);
    this.player.update(delta, ratio);
    if (this.player.isFlying) this.keepLandingZoneClear();

    // ---- skill evaluation runs just before collision resolution
    const bounds = this.player.getBounds();
    const nearList = this.nearObstacles();
    const awards = this.skills.evaluate(
      {
        x: this.player.positionX,
        y: this.player.positionY,
        halfWidth: 0.35,
        airborne: !this.player.isGrounded,
        sliding: this.player.isSliding,
        flying: this.player.isFlying,
        secondsSinceJumpStart: this.player.secondsSinceJumpStart,
      },
      nearList,
      this.runTime
    );
    for (const event of awards.events) {
      if (!event.kind) continue;
      const sideSign =
        event.obstacle && event.obstacle.centerX > this.player.positionX ? -1 : 1;
      this.processSkillAward(event.kind, sideSign, event.obstacle);
    }

    // ---- collision resolution (obstacles + event drones)
    // Revive grace + rocket flight — ignore ground hits while invulnerable or flying
    let hit: ColliderLike | null = null;
    if (this.reviveInvuln <= 0 && !this.player.isFlying) {
      this.nearColliders.length = 0;
      for (const obstacle of nearList) this.nearColliders.push(obstacle);
      if (this.events) for (const drone of this.events.drones) this.nearColliders.push(drone);
      hit = this.collision.findHit(
        {
          minX: bounds.min.x,
          minY: bounds.min.y,
          minZ: bounds.min.z,
          maxX: bounds.max.x,
          maxY: bounds.max.y,
          maxZ: bounds.max.z,
        },
        this.nearColliders
      );
      if (hit && !this.resolveHit(hit)) {
        // Died — if Life Saver offered, we are now in revive state and should stop this frame
        return;
      }
    }

    // ---- coins & keys & rockets: magnet pull + collection
    this.gatherNearbyCoins(this.magnetFieldActive() ? -(MAGNET.reachMax + 4) : -30);
    this.gatherNearbyKeys();
    this.gatherNearbyRockets();
    this.applyMagnet(delta);
    // At flight height the air coins sit just above the rig (y + ~0.05), so the
    // window centers there; on the ground it stays chest-centered as before.
    const collectHeight = this.player.isSliding ? 0.95 : this.player.isFlying ? 0.6 : 1.9;
    this.collision.collectCoins(
      { x: this.player.positionX, y: this.player.positionY, height: collectHeight },
      this.frameCoins,
      (coin) => this.onCoinCollected(coin, totalMult)
    );

    // ---- pickups & keys & rockets
    this.checkPickupCollection();
    this.checkKeyCollection();
    this.checkRocketCollection();

    // ---- timers & meters
    this.powerups.update(delta);
    this.combo.update(delta);
    this.overdrive.update(delta);
    // Thrust loop is idempotent and self-stops if not re-asserted.
    this.audio.setRocketThrust(this.player.isFlying);
    // Rocket HUD timer at ~10 Hz — the HUD eases between pushes with CSS.
    if (this.player.isFlying) {
      this.rocketHudTimer -= delta;
      if (this.rocketHudTimer <= 0) {
        this.rocketHudTimer = ROCKET_RIDE.hudInterval;
        this.store.setRocket(true, this.player.rocketRemaining);
      }
    }

    const hasShield = this.powerups.hasShield();
    this.playerFX.setShield(hasShield || this.reviveInvuln > 0, !hasShield && this.reviveInvuln > 0);
    this.playerFX.setMagnet(this.powerups.isActive("magnet") || this.overdrive.active);
    this.playerFX.setOverdrive(this.overdrive.ramp);
    this.playerFX.update(delta);

    // ---- camera/audio channels driven by ramped intensities
    const rocketFov = this.player.isFlying ? 7 : 0;
    this.cameraRig!.setFovBoost(this.powerups.turboFovBoost + OVERDRIVE_CFG.fovBoost * this.overdrive.ramp + rocketFov);

    // Coin collection shrink animation.
    this.animateCollectingCoins(delta);

    // ---- score & distance
    const distanceDelta = effectiveSpeed * delta;
    this.score.addDistance(distanceDelta, totalMult);
    this.tally.distance += distanceDelta;
    this.missionDeltas.travelDistance = (this.missionDeltas.travelDistance ?? 0) + distanceDelta;

    this.particles?.update(delta, effectiveSpeed, ratio);
    this.syncLights();
    this.cameraRig!.updatePlaying(delta, this.player, ratio, true);
    this.audio.update(ratio);

    // ---- periodic mission sync
    this.missionSyncTimer -= delta;
    if (this.missionSyncTimer <= 0) {
      this.missionSyncTimer = MISSION_SYNC_INTERVAL;
      this.flushMissionProgress();
    }

    // Feedback expiry → store only when changed.
    if (this.feedback.update(delta)) {
      this.store.setFeedback(this.feedback.snapshot(), this.feedback.banner);
    }

    this.hudAccumulator += delta;
    if (this.hudAccumulator >= HUD_INTERVAL) {
      this.hudAccumulator = 0;
      this.pushCombat();
      this.pushHud(false);
    }
  }

  private nearObstacles(): Obstacle[] {
    this.nearObstacleScratch.length = 0;
    this.world.forEachObstacle(this.visitObstacle);
    return this.nearObstacleScratch;
  }

  /** Bound once — collects nearby colliders and fires approach cues. */
  private visitObstacle = (obstacle: Obstacle): void => {
    if (!obstacle.active) return;
    const c = obstacle.collider;
    if (c.maxZ > -14 && c.minZ < 6) this.nearObstacleScratch.push(obstacle);
    // Honk / moo / bell once as a vehicle or animal comes into view.
    if (obstacle.approachCue && !obstacle.cuePlayed && c.minZ > APPROACH_CUE_FAR_Z && c.minZ < APPROACH_CUE_NEAR_Z) {
      obstacle.cuePlayed = true;
      switch (obstacle.approachCue) {
        case "honk":
          this.audio.playHonk();
          break;
        case "moo":
          this.audio.playMoo();
          break;
        case "bell":
          this.audio.playBell();
          break;
      }
    }
  };

  /** Coin pop animation tick (scale-out), run over pooled instances. */
  private animateCollectingCoins(delta: number): void {
    this.world.forEachCoin((coin, d) => {
      if (coin.collected) coin.playCollection(d);
    }, delta);
  }

  private updateGameOver(delta: number): void {
    this.deathSpeed = Math.max(0, this.deathSpeed - SPEED.deathDeceleration * delta);
    this.world.update(delta, this.deathSpeed, this.difficulty.tier.index, this.score.distance);
    this.animateCollectingCoins(delta);
    this.player.setWorldSpeed(this.deathSpeed);
    this.player.update(delta, 0);
    this.particles?.update(delta, this.deathSpeed, 0);
    this.playerFX.update(delta);
    this.syncLights();
    this.cameraRig!.updatePlaying(delta, this.player, 0, false);
    this.audio.update(0);
  }

  private updateRevive(delta: number): void {
    this.reviveCountdown -= delta;
    const shown = Math.max(0, Math.ceil(this.reviveCountdown));
    if (shown !== this.store.getSnapshot().reviveCountdown) {
      this.store.setReviveCountdown(shown);
    }
    // Keep rendering the frozen death moment (gentle drift)
    this.world.update(delta * 0.12, 0, this.difficulty.tier.index, this.score.distance);
    this.player.setWorldSpeed(0);
    this.player.update(delta, 0);
    this.playerFX.update(delta);
    this.syncLights();
    this.cameraRig!.updatePlaying(delta, this.player, 0, false);
    if (this.reviveCountdown <= 0) {
      this.skipRevive();
    }
  }

  // ------------------------------------------------------------ coin flow

  /** Coins gathered this frame live within (coinGatherFarZ, 6). */
  private coinGatherFarZ = -30;

  /** Bound visitor — avoids allocating a closure every frame. */
  private gatherCoin = (coin: Coin): void => {
    if (!coin.active || coin.collected) return;
    const z = coin.worldZ;
    if (z > this.coinGatherFarZ && z < 6) this.frameCoins.push(coin);
  };

  private gatherNearbyCoins(farZ: number): void {
    this.frameCoins.length = 0;
    this.coinGatherFarZ = farZ;
    this.world.forEachCoin(this.gatherCoin, 0);
  }

  /** Any effect that pulls coins in from every lane. */
  private magnetFieldActive(): boolean {
    return this.powerups.isActive("magnet") || this.overdrive.active || this.player.isFlying;
  }

  private gatherNearbyKeys(): void {
    this.frameKeys.length = 0;
    this.world.forEachKey((key) => {
      if (key.active && key.worldZ > -30 && key.worldZ < 6) {
        this.frameKeys.push(key);
      }
    });
  }

  private gatherNearbyRockets(): void {
    this.frameRockets.length = 0;
    this.world.forEachRocket((rocket) => {
      if (rocket.active && rocket.worldZ > -30 && rocket.worldZ < 6) {
        this.frameRockets.push(rocket);
      }
    });
  }

  /**
   * Chumbak field. Coins that enter the field latch on and home in on the
   * runner's chest in full 3D (see Coin.home) until collected — even if the
   * power-up ends meanwhile, so no coin is ever left frozen in mid-air.
   * Magnet / JOSH / rocket flight cover every lane far ahead; turbo sweeps a
   * short, narrow cone. Keys and rockets are only vacuumed by JOSH / turbo /
   * flight (the magnet power-up pulls coins only).
   */
  private applyMagnet(delta: number): void {
    const fieldOn = this.magnetFieldActive();
    const turboOn = this.powerups.turboProtects;
    const px = this.player.positionX;
    const targetY = this.player.positionY + MAGNET.targetHeight;
    const speed = this.lastEffectiveSpeed;
    const lateral = fieldOn ? MAGNET.lateralReach : MAGNET.turboLateral;
    const reach = fieldOn
      ? Math.min(MAGNET.reachBase + speed * MAGNET.reachSeconds, MAGNET.reachMax)
      : MAGNET.turboReach;
    const canLatch = fieldOn || turboOn;
    const chase = MAGNET.chaseBase + speed * 0.25;
    for (const coin of this.frameCoins) {
      if (!coin.attracted) {
        if (!canLatch) continue;
        const z = coin.worldZ;
        if (z < -reach || z > 1.5) continue;
        if (Math.abs(coin.mesh.position.x - px) > lateral) continue;
        if (Math.abs(coin.mesh.position.y - targetY) > MAGNET.verticalReach) continue;
        coin.attracted = true;
        coin.magnetTime = 0;
      }
      coin.home(px, targetY, chase, MAGNET.chaseAccel, delta);
    }

    const vacuum = this.overdrive.active || turboOn || this.player.isFlying;
    if (!vacuum) return;
    const radius = this.overdrive.active ? OVERDRIVE_CFG.magnetRadiusBoost : this.player.isFlying ? 7 : 4.5;
    this.magnetTargetY = targetY;
    for (const key of this.frameKeys) {
      const dx = px - key.mesh.position.x;
      const dz = 0 - key.worldZ;
      const dy = targetY - key.mesh.position.y;
      if (dx * dx + dz * dz + dy * dy < radius * radius) {
        key.attracted = true;
        key.pullTowards(px, targetY, MAGNET.pullLambda, delta);
      }
    }
    for (const rocket of this.frameRockets) {
      const dx = px - rocket.mesh.position.x;
      const dz = 0 - rocket.worldZ;
      const dy = targetY - rocket.mesh.position.y;
      if (dx * dx + dz * dz + dy * dy < radius * radius) {
        rocket.attracted = true;
        rocket.pullTowards(px, targetY, MAGNET.pullLambda, delta);
      }
    }
  }

  private onCoinCollected(coin: Coin, multiplier: number): void {
    this.score.addCoin(multiplier);
    this.tally.coins += 1;
    this.missionDeltas.collectCoins = (this.missionDeltas.collectCoins ?? 0) + 1;
    this.store.registerCoinPopup();
    this.particles?.emitCoinSparkle(coin.mesh.position.x, coin.mesh.position.y + 0.2, coin.worldZ, this.runTime);
    this.audio.playCoin();
    this.overdrive.gain(OVERDRIVE_CFG.gainCoin);

    // Coin streak: rapid successive pickups feed combo every 12 coins.
    if (this.runTime - this.lastCoinAt < 1.0) {
      this.coinStreak += 1;
      if (this.coinStreak >= 12) {
        this.coinStreak = 0;
        this.combo.add(2, this.runTime);
        this.feedback.push("COIN STREAK!", "combo", "+COMBO");
        this.overdrive.gain(OVERDRIVE_CFG.gainPerfect);
      }
    } else {
      this.coinStreak = 1;
    }
    this.lastCoinAt = this.runTime;
  }

  private checkPickupCollection(): void {
    this.world.forEachPickup((pickup) => {
      if (!pickup.active) return;
      const z = pickup.worldZ;
      if (z < -1.6 || z > 1.6) return;
      if (Math.abs(pickup.mesh.position.x - this.player.positionX) > 1.3) return;
      if (Math.abs(pickup.baseY - (this.player.positionY + 1)) > 1.6) return;
      pickup.mesh.visible = false;
      pickup.active = false;
      this.activatePowerUp(pickup.type, pickup.mesh.position.x, pickup.baseY);
    });
  }

  private checkKeyCollection(): void {
    this.world.forEachKey((key) => {
      if (!key.active) return;
      const z = key.worldZ;
      if (z < -1.8 || z > 1.8) return;
      if (Math.abs(key.mesh.position.x - this.player.positionX) > 1.35) return;
      if (Math.abs(key.baseY - (this.player.positionY + 1)) > 1.7) return;
      key.mesh.visible = false;
      key.active = false;
      SaveService.update((s) => {
        s.keys = (s.keys ?? 2) + 1;
      });
      this.tally.keysCollected += 1;
      this.store.setKeys(SaveService.get().keys);
      this.store.setRunKeys(this.tally.keysCollected);
      this.feedback.push("KEY +1!", "epic", `${SaveService.get().keys} KEYS`);
      this.audio.playPowerup();
      // golden burst
      this.particles?.emitBurst(key.mesh.position.x, key.baseY + 0.3, 0, 0.98, 0.82, 0.18, 14, 1.0);
    });
  }

  private checkRocketCollection(): void {
    this.world.forEachRocket((rocket) => {
      if (!rocket.active) return;
      const z = rocket.worldZ;
      if (z < -1.8 || z > 1.8) return;
      if (Math.abs(rocket.mesh.position.x - this.player.positionX) > 1.4) return;
      if (Math.abs(rocket.baseY - (this.player.positionY + 1)) > 1.7) return;
      rocket.mesh.visible = false;
      rocket.active = false;
      this.activateRocket();
    });
  }

  private activateRocket(): void {
    this.tally.rocketsUsed += 1;
    // Escalating flight time per pickup this run: 5s, 6s, 7s … capped.
    const duration = Math.min(
      ROCKET_FLIGHT.firstSeconds + (this.tally.rocketsUsed - 1) * ROCKET_FLIGHT.stepSeconds,
      ROCKET_FLIGHT.maxSeconds
    );
    const speed = this.lastEffectiveSpeed;
    this.player.startRocket(duration);
    this.store.setRocket(true, duration, duration);
    this.rocketHudTimer = ROCKET_RIDE.hudInterval;
    this.keepLandingZoneClear();
    // Burst-gap air trail sized for the whole flight at current speed.
    this.world.spawnRocketCoinTrail(-10, duration, speed);
    this.feedback.push("DIWALI ROCKET!", "epic", `UDD CHALO · ${duration}s`);
    this.audio.playRocketLaunch();
    this.audio.setRocketThrust(true);
    this.audio.playMeme("rocket");
    this.particles?.emitBurst(this.player.positionX, 0.6, 0, 1.0, 0.62, 0.18, 26, 1.4);
    this.particles?.emitBurst(this.player.positionX, 0.3, 0.4, 1.0, 0.9, 0.55, 14, 0.9);
    this.cameraRig?.addShake(0.3);
  }

  /**
   * Guarantees an open landing zone: clears every obstacle that could sit
   * under the touchdown or the first moments after it (padded for mid-flight
   * speed boosts). Runs at launch and every flying frame, so rows recycled
   * into the window during long flights vanish while still far out of view.
   * Obstacles nearer than the window stay — flying over traffic is the fun
   * part.
   */
  private keepLandingZoneClear(): void {
    const speed = this.lastEffectiveSpeed;
    const remaining = this.player.rocketRemaining;
    const lead = Math.max(0, remaining - ROCKET_RIDE.descendSeconds - ROCKET_RIDE.clearLeadSeconds);
    const nearZ = -speed * lead;
    const farZ = -speed * ROCKET_RIDE.clearSpeedPadding * (remaining + ROCKET_RIDE.clearTrailSeconds);
    this.world.clearObstaclesInRange(farZ, nearZ, this.puffObstacle);
  }

  /** Small puff where a landing-zone obstacle is cleared (only if in view). */
  private puffObstacle = (x: number, y: number, z: number): void => {
    if (z > -95) this.particles?.emitBurst(x, y, z, 1.0, 0.78, 0.45, 10, 1.1);
  };

  /** Touchdown after a Diwali-rocket flight. */
  private handleRocketLanded = (): void => {
    this.store.setRocket(false, 0);
    this.rocketHudTimer = 0;
    this.reviveInvuln = Math.max(this.reviveInvuln, ROCKET_RIDE.landingGraceSeconds);
    this.audio.setRocketThrust(false);
    this.audio.playRocketLand();
    this.feedback.push("SAFE LANDING!", "good");
    this.cameraRig?.addShake(0.16);
    this.particles?.emitBurst(this.player.positionX, 0.25, 0, 1.0, 0.72, 0.35, 16, 1.0);
  };

  private activatePowerUp(type: HudPowerUp["type"], x: number, y: number): void {
    this.powerups.activate(type);
    this.tally.powerUps += 1;
    this.missionDeltas.collectPowerUps = (this.missionDeltas.collectPowerUps ?? 0) + 1;
    this.overdrive.gain(OVERDRIVE_CFG.gainPowerUp);
    this.feedback.push(`${POWERUP_DEFS[type].label}!`, "good");
    this.audio.playPowerup();
    if (type === "magnet") this.audio.playMagnetOn();
    if (type === "turbo") this.audio.playMeme("speedBoost");
    const color = new THREE.Color(powerUpColor(type));
    this.particles?.emitBurst(x, y + 0.4, 0, color.r, color.g, color.b, 16, 1.1);
  }

  // -------------------------------------------------------- collision flow

  /**
   * Resolves a dangerous hit. Returns true when the run survived
   * (obstacle smashed or shield absorbed); false means game over.
   */
  private resolveHit(hitSource: ColliderLike): boolean {
    const isDrone = !isObstacle(hitSource);
    const obstacle = isObstacle(hitSource) ? hitSource : null;

    // 1) Turbo / Overdrive shatter normal destructibles — never waste the
    //    shield on something we can simply smash.
    if (this.overdrive.active || this.powerups.turboProtects) {
      if (obstacle && obstacle.destructible) {
        this.smashObstacle(obstacle);
        return true;
      }
      if (isDrone) {
        this.smashDrone(hitSource as Drone);
        return true;
      }
      // Reinforced gates fall through to shield/death — slide under them.
    }

    // 2) Shield absorbs exactly one dangerous collision.
    if (this.powerups.consumeShield()) {
      if (obstacle) this.skills.notifyHit(obstacle);
      if (isDrone) this.releaseDrone(hitSource as Drone);
      this.feedback.push("SHIELD BROKEN!", "warn");
      this.audio.playShieldBreak();
      this.particles?.emitBurst(this.player.positionX, 1.1, 0, 0.31, 0.55, 1, 22, 1.3);
      this.cameraRig?.addShake(0.38);
      this.hitStopTimer = 0.05;
      return true;
    }

    // 3) Death.
    if (obstacle) this.skills.notifyHit(obstacle);
    this.onPlayerHit();
    return false;
  }

  private smashObstacle(obstacle: Obstacle): void {
    const x = obstacle.centerX;
    const y = obstacle.topY * 0.6;
    this.world.destroyObstacle(obstacle);
    this.tally.obstaclesSmashed += 1;
    this.score.addBonus(150, this.currentTotalMultiplier());
    this.overdrive.gain(OVERDRIVE_CFG.gainSmash);
    this.particles?.emitCrash(x, y, 0);
    this.cameraRig?.addShake(0.32);
    this.hitStopTimer = 0.045;
    this.audio.playSmash();
    this.feedback.push("SMASHED! +150", "good");
  }

  private smashDrone(drone: Drone): void {
    this.releaseDrone(drone);
    this.tally.obstaclesSmashed += 1;
    this.score.addBonus(200, this.currentTotalMultiplier());
    this.overdrive.gain(OVERDRIVE_CFG.gainSmash);
    this.particles?.emitCrash(drone.group.position.x, drone.group.position.y, drone.group.position.z);
    this.cameraRig?.addShake(0.34);
    this.hitStopTimer = 0.05;
    this.audio.playSmash();
    this.feedback.push("DRONE DOWN! +200", "good");
  }

  private releaseDrone(drone: Drone): void {
    const list = this.events?.drones;
    if (!list) return;
    const index = list.indexOf(drone);
    if (index !== -1) list.splice(index, 1);
    drone.group.visible = false;
    drone.state = "idle";
  }

  private currentTotalMultiplier(): number {
    return (
      this.combo.multiplier *
      this.powerups.scoreMultiplierBonus *
      (this.overdrive.active ? OVERDRIVE_CFG.scoreMultBonus : 1)
    );
  }

  private onPlayerHit(): void {
    if (this.store.getSnapshot().gameState !== "playing") return;

    this.audio.stopMusic();
    this.audio.setRocketThrust(false);
    this.audio.playCrash();
    this.audio.playMeme("crash");
    this.particles?.emitCrash(this.player.positionX, 1.1, 0);
    this.cameraRig?.addShake(0.55);
    this.combo.breakCombo();
    this.player.die();

    // Life Saver — offer to consume a key and continue from same spot
    if (SaveService.get().keys > 0) {
      this.reviveCountdown = REVIVE.seconds;
      this.store.setReviveCountdown(Math.ceil(REVIVE.seconds));
      this.setState("revive");
      this.feedback.push("LIFE SAVER AVAILABLE!", "epic", "USE KEY TO CONTINUE?");
      return;
    }

    this.deathSpeed = this.difficulty.speed;
    this.setState("gameover");

    // Flush remaining mission deltas with final absolutes.
    this.flushMissionProgress();

    // Let the death beat land before the summary slides in (V1 timing).
    const epoch = this.runEpoch;
    const timeoutId = window.setTimeout(() => {
      if (this.disposed || this.runEpoch !== epoch) return;
      this.finalizeRun();
    }, 900);
    this.timeouts.push(timeoutId);
  }

  // ---------------------------------------------------------- run finalize

  private flushMissionProgress(): void {
    const completed = this.missions.progress({
      deltas: this.missionDeltas,
      absolutes: {
        reachCombo: this.combo.bestThisRun,
        scoreInSingleRun: this.score.score,
        survivalTime: Math.floor(this.runTime),
      },
    });
    this.missionDeltas = {};
    for (const mission of completed) {
      this.feedback.push("MISSION COMPLETE!", "epic", mission.title);
      this.audio.playMissionComplete();
    }
  }

  private finalizeRun(): void {
    this.tally.survivalTime = this.runTime;
    this.tally.maxCombo = this.combo.bestThisRun;

    // Merge lifetime stats first so achievements see fresh numbers.
    const prevBest = SaveService.get().stats;
    const isNewBestScore = this.score.score > prevBest.bestScore && this.score.score > 0;
    const isNewBestDistance = this.tally.distance > prevBest.bestDistance;
    this.progression.mergeRunStats(this.tally, this.score.score);

    // Missions completed today grant their rewards now.
    const missionRewards = this.missions.claimRewards();
    let bonusCoins = 0;
    let bonusXp = 0;
    for (const reward of missionRewards) {
      bonusCoins += reward.rewardCoins;
      bonusXp += reward.rewardXp;
    }

    // Achievements (checked against updated stats).
    const achievementRewards = this.achievements.check(SaveService.get().stats);
    for (const reward of achievementRewards) {
      bonusCoins += reward.rewardCoins;
      bonusXp += reward.rewardXp;
    }

    // XP + levels (level rewards include their own coins).
    const runXp = this.progression.calculateRunXp(this.tally, this.score.score);
    const previousLevel = this.progression.level;
    const previousXp = this.progression.xpIntoLevel;
    const xpGain = this.progression.applyXp(runXp + bonusXp);
    void bonusXp;

    const levelUpCoins = xpGain.levelUps.reduce(
      (sum, lu) =>
        sum +
        lu.rewards.filter((r) => r.kind === "coins").reduce((s, r) => s + (r.amount ?? 0), 0),
      0
    );
    // Wallet: raw run coins + mission/achievement rewards + level-up coins.
    // Score multipliers never inflate the wallet by design.
    const totalWalletAddition = this.tally.coins + bonusCoins + levelUpCoins;
    SaveService.update((save) => {
      save.stats.totalCoins += totalWalletAddition;
    });

    if (isNewBestScore) this.audio.playMeme("newRecord");
    const stats = SaveService.get().stats;
    const keys = SaveService.get().keys;
    this.store.finishRun(
      {
        score: this.score.score,
        distance: Math.floor(this.tally.distance),
        coins: this.tally.coins,
        isNewBestScore,
        isNewBestDistance,
        nearMisses: this.tally.nearMisses,
        perfectJumps: this.tally.perfectJumps,
        perfectSlides: this.tally.perfectSlides,
        maxCombo: this.tally.maxCombo,
        overdrives: this.tally.overdrives,
        powerUps: this.tally.powerUps,
        obstaclesSmashed: this.tally.obstaclesSmashed,
        survivalTime: Math.floor(this.runTime),
        keysCollected: this.tally.keysCollected,
        keysUsed: this.tally.keysUsed,
        rocketsUsed: this.tally.rocketsUsed,
        xpEarned: xpGain.xpEarned,
        previousLevel,
        previousXp,
        missionsCompleted: missionRewards,
        achievementsCompleted: achievementRewards,
        levelUps: xpGain.levelUps,
        unlocks: xpGain.unlocks,
      },
      {
        bestScore: stats.bestScore,
        bestDistance: stats.bestDistance,
        totalCoins: stats.totalCoins,
        keys,
      }
    );
  }

  // ------------------------------------------------------------- HUD push

  private pushHud(immediate: boolean): void {
    const tier = this.difficulty.tier;
    this.store.setHud({
      score: this.score.score,
      distance: Math.floor(this.score.distance),
      coins: this.score.coins,
      speedRatio: this.difficulty.ratio,
      tierName: tier.name,
      tierLabel: tier.label,
    });
    if (immediate) this.store.flush(performance.now() + 1000);
  }

  private pushCombat(): void {
    this.store.setCombat({
      comboCount: Math.floor(this.combo.count),
      comboMult: this.combo.multiplier,
      powerups: this.powerups.snapshot(this.hudPowerups).map((chip) => ({ ...chip })),
      odEnergy: this.overdrive.energy / OVERDRIVE_CFG.maxEnergy,
      odReady: this.overdrive.isReady,
      odActive: this.overdrive.active,
      odRemaining: this.overdrive.remaining,
      shieldActive: this.powerups.hasShield(),
      sectorName: this.biomeManager?.name ?? BIOMES[0].name,
    });
  }

  private syncLights(): void {
    if (!this.sceneBundle) return;
    this.sceneBundle.playerGlow.position.set(this.player.positionX, this.player.positionY + 3, 1.5);
  }

  // --------------------------------------------------------- skill awards

  /** TAAL: a jump launched on the dhol beat (as heard) earns a streak bonus. */
  private judgeTaal(): void {
    const beat = this.audio.getBeatTiming();
    if (!beat) return;
    const offBeat = Math.min(beat.phase, 1 - beat.phase) * beat.secondsPerBeat;
    if (offBeat > TAAL.windowSeconds) {
      this.taalStreak = 0;
      return;
    }
    this.taalStreak += 1;
    const streak = Math.min(this.taalStreak, TAAL.maxStreak);
    const bonus = TAAL.bonus * streak;
    this.score.addBonus(bonus, this.currentTotalMultiplier());
    this.overdrive.gain(TAAL.joshGain);
    if (this.taalStreak >= 2 || this.runTime - this.lastTaalToast > TAAL.toastCooldown) {
      this.lastTaalToast = this.runTime;
      this.feedback.push(this.taalStreak >= 2 ? `TAAL ×${this.taalStreak}! 🥁` : "TAAL! 🥁", "combo", `+${bonus} ON THE BEAT`);
    }
  }

  private processSkillAward(kind: SkillEventKind, sideSign: number, obstacle: Obstacle | null = null): void {
    if (kind === "coinStreak" || kind === "obstacleChain") return; // handled inline
    switch (kind) {
      case "nearMiss": {
        this.tally.nearMisses += 1;
        this.missionDeltas.nearMisses = (this.missionDeltas.nearMisses ?? 0) + 1;
        this.missionDeltas.perfectActions = (this.missionDeltas.perfectActions ?? 0) + 1;
        this.combo.add(1, this.runTime);
        this.overdrive.gain(OVERDRIVE_CFG.gainNearMiss);
        this.score.addBonus(50, this.currentTotalMultiplier());
        this.audio.playNearMiss();
        // Desi street flavour: cows bless you, trucks demand a horn.
        if (obstacle?.approachCue === "moo") {
          this.score.addBonus(DESI_BONUS.cowBlessing, this.currentTotalMultiplier());
          this.overdrive.gain(OVERDRIVE_CFG.gainNearMiss * 0.5);
          this.feedback.push("GAU MATA KI JAI! 🐄", "epic", `+${50 + DESI_BONUS.cowBlessing} BLESSING`);
        } else if (obstacle?.approachCue === "honk") {
          this.score.addBonus(DESI_BONUS.hornOkPlease, this.currentTotalMultiplier());
          this.feedback.push("HORN OK PLEASE! 🚚", "combo", `+${50 + DESI_BONUS.hornOkPlease}`);
        } else {
          this.feedback.push("CLOSE CALL!", "warn", "+50");
        }
        this.audio.playMeme("nearMiss");
        this.cameraRig?.addImpulse(0.14 * sideSign);
        break;
      }
      case "perfectJump": {
        this.tally.perfectJumps += 1;
        this.missionDeltas.jumpObstacles = (this.missionDeltas.jumpObstacles ?? 0) + 1;
        this.missionDeltas.perfectActions = (this.missionDeltas.perfectActions ?? 0) + 1;
        this.combo.add(1, this.runTime);
        this.overdrive.gain(OVERDRIVE_CFG.gainPerfect);
        this.score.addBonus(75, this.currentTotalMultiplier());
        this.feedback.push("PERFECT JUMP!", "good", "+75");
        this.audio.playPerfect();
        break;
      }
      case "perfectSlide": {
        this.tally.perfectSlides += 1;
        this.missionDeltas.slideObstacles = (this.missionDeltas.slideObstacles ?? 0) + 1;
        this.missionDeltas.perfectActions = (this.missionDeltas.perfectActions ?? 0) + 1;
        this.combo.add(1, this.runTime);
        this.overdrive.gain(OVERDRIVE_CFG.gainPerfect);
        this.score.addBonus(75, this.currentTotalMultiplier());
        this.feedback.push("PERFECT SLIDE!", "good", "+75");
        this.audio.playPerfect();
        break;
      }
    }

    // Obstacle chain: three skillful passes in quick succession.
    if (this.skills.registerAward(this.runTime)) {
      this.combo.add(2, this.runTime);
      this.overdrive.gain(OVERDRIVE_CFG.gainComboMilestone);
      this.feedback.push("CHAIN BONUS!", "combo", "+COMBO");
    }
  }

  // -------------------------------------------------------------- cleanup

  dispose(): void {
    this.disposed = true;
    for (const id of this.timeouts) window.clearTimeout(id);
    this.timeouts = [];
    window.removeEventListener("visibilitychange", this.onVisibilityChange);
    this.timer.dispose();
    this.resizeObserver?.disconnect();
    this.input?.dispose();
    this.audio.dispose();
    this.playerFX.dispose();
    this.player.dispose();
    this.wardrobe.dispose();
    if (this.rendererHandle) {
      this.rendererHandle.renderer.setAnimationLoop(null);
    }
    this.postFX?.dispose();
    if (this.world && this.sceneBundle) this.world.dispose(this.sceneBundle.scene);
    this.particles?.dispose(this.sceneBundle?.scene ?? new THREE.Scene());
    if (this.sceneBundle) disposeObjectTree(this.sceneBundle.scene);
    this.bag.dispose();
    this.rendererHandle?.dispose();
    this.host.replaceChildren();
  }
}

function isObstacle(source: ColliderLike): source is Obstacle {
  return (source as Obstacle).kind !== undefined;
}

function emptyTally(): RunTallyData {
  return {
    coins: 0,
    distance: 0,
    perfectJumps: 0,
    perfectSlides: 0,
    nearMisses: 0,
    powerUps: 0,
    overdrives: 0,
    obstaclesSmashed: 0,
    maxCombo: 0,
    survivalTime: 0,
    keysCollected: 0,
    keysUsed: 0,
    rocketsUsed: 0,
  };
}

function powerUpColor(type: HudPowerUp["type"]): string {
  switch (type) {
    case "magnet": return "#2e9bff";
    case "shield": return "#4f8dff";
    case "scoreMultiplier": return "#e8c96a";
    case "turbo": return "#ff2d2d";
  }
}
