import * as THREE from "three";
import type { GameAction, GameState, HudPowerUp, RunTallyData, SkillEventKind } from "@/types/game";
import { GameStore } from "./GameStore";
import { ResourceBag, disposeObjectTree } from "./utils/dispose";
import { createRenderer, type RendererHandle } from "./core/Renderer";
import { createSceneAndCamera, type SceneBundle } from "./core/GameScene";
import { CameraRig } from "./core/CameraRig";
import { AssetManager } from "./core/AssetManager";
import { SaveService } from "./core/SaveService";
import { Player } from "./player/Player";
import { CharacterAnimationController } from "./player/CharacterAnimationController";
import { PlayerFX } from "./player/PlayerFX";
import { TrailRenderer } from "./player/TrailRenderer";
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
import type { Obstacle } from "./entities/Obstacle";
import type { Drone } from "./systems/RunEventSystem";
import { MODEL_URL, SPEED } from "./config/gameplay";
import { MAGNET, TURBO } from "./config/powerups";
import { BIOMES } from "./config/biomes";
import { getCharacter, getTrail } from "./config/characters";
import { clamp } from "./utils/math";

const COUNTDOWN_STEP = 0.8;
const HUD_INTERVAL = 0.1;
/** Period between mission progress pushes during a run. */
const MISSION_SYNC_INTERVAL = 2;
/** Perceived impact freeze for smashes/shield breaks (simulation scaled). */
const HIT_STOP_SCALE = 0.18;
const REVIVE_TIME = 6;
const REVIVE_INVULN = 2.4;

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

  private player = new Player();
  private playerFX = new PlayerFX();
  private world!: WorldManager;
  private biomeManager: BiomeManager | null = null;
  private trail: TrailRenderer | null = null;
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
  private nearObstacleScratch: Obstacle[] = [];
  private nearColliders: ColliderLike[] = [];
  private hudPowerups: HudPowerUp[] = [];
  private magnetTargetY = 0;

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

    const bundle = createSceneAndCamera(this.bag);
    this.sceneBundle = bundle;
    this.cameraRig = new CameraRig(bundle.camera);

    const save = SaveService.get();
    this.cameraRig.shakeEnabled = save.settings.screenShake;
    this.applyPerformanceMode(save.settings.performanceMode);
    this.audio.setMuted(save.settings.muted);
    this.audio.setMusicEnabled(save.settings.music);
    this.audio.setSfxEnabled(save.settings.sound);

    const shared = new SharedAssets(this.bag, BIOMES.map((b) => b.billboardHues));
    this.world = new WorldManager(bundle.scene, shared, this.bag);
    this.biomeManager = new BiomeManager(bundle, shared);
    this.biomeManager.onBiomeShift = (name) => {
      this.feedback.push(`ENTERING ${name}`, "good");
      this.audio.playBiomeShift();
    };

    this.particles = new ParticleSystem(bundle.scene, this.bag);
    this.trail = new TrailRenderer(bundle.scene, this.bag);
    bundle.scene.add(this.player.root);
    this.player.root.add(this.playerFX.root);

    this.events = new RunEventSystem(this.world, this.bag, this.feedback, this.audio);

    this.input = new InputSystem(this.host, (action) => this.handleAction(action));
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
      this.feedback.push("⚡ OVERDRIVE READY ⚡", "epic", "PRESS E / DOUBLE-TAP");
      this.audio.playOverdriveReady();
    };
    this.overdrive.onActivated = () => {
      this.tally.overdrives += 1;
      this.feedback.push("OVERDRIVE!", "epic", "SMASH THROUGH");
      this.audio.playOverdriveActivate();
      this.cameraRig?.addShake(0.22);
    };
    this.overdrive.onEnded = () => {
      this.feedback.push("OVERDRIVE SPENT", "good");
    };

    this.missions.ensureToday();
    this.applyCustomizationFromSave();
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
    const manager = new AssetManager((ratio, label) => this.store.setLoading(ratio, label));
    try {
      const assets = await manager.loadAll({ character: MODEL_URL });
      if (this.disposed) return;
      this.player.attachModel(assets.character);
      const controller = new CharacterAnimationController(
        this.player.root,
        assets.character.animations
      );
      this.player.setAnimationController(controller);
      this.applyCustomizationFromSave();
    } catch (error) {
      // Model failed but the procedural fallback keeps the game playable.
      console.error("[DESI RUN] character load failed:", error);
    }
    this.store.setLoading(1, "READY");
    this.store.setState("menu");
    this.store.setHud({
      score: 0,
      distance: 0,
      coins: 0,
      speedRatio: 0,
      tierName: "WARM-UP",
      tierLabel: "I",
    });
  }

  private handleResize(): void {
    if (!this.rendererHandle || !this.sceneBundle) return;
    const width = this.host.clientWidth || window.innerWidth;
    const height = this.host.clientHeight || window.innerHeight;
    this.rendererHandle.resize(width, height);
    this.sceneBundle.resize(width / Math.max(height, 1));
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
            this.player.requestJump();
            this.audio.playJump();
            break;
          case "slide":
            if (!this.player.isSliding) this.audio.playSlide();
            this.player.requestSlide();
            break;
          case "overdrive":
            if (!this.overdrive.tryActivate()) {
              this.feedback.push("OVERDRIVE NOT READY", "warn");
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
    this.reviveInvuln = REVIVE_INVULN;
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
    this.cameraRig?.addShake(0.28);
    this.feedback.push("LIFE SAVER!", "epic", "CONTINUE!");
    this.audio.playPowerup();
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
    this.runEpoch++;
    this.score.reset();
    this.difficulty.reset();
    this.world.reset();
    this.player.reset();
    this.particles?.clear();
    this.trail?.clear();
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
    this.lastCoinAt = -10;
    this.coinStreak = 0;
    this.missionSyncTimer = 0;
    this.missionDeltas = {};
    this.hitStopTimer = 0;
    this.reviveCountdown = 0;
    this.reviveInvuln = 0;
    this.store.setReviveCountdown(0);
    this.store.setRunKeys(0);
    this.store.setKeys(SaveService.get().keys);
    this.cameraRig?.setFovBoost(0);
    this.deathSpeed = 0;
    this.countdownLeft = COUNTDOWN_STEP * 3;
    this.lastCountdownValue = -1;
    this.store.clearRunResult();
    this.pushHud(true);
    this.setState("countdown");
    this.player.animation?.setState("run");
  }

  pause(): void {
    if (this.store.getSnapshot().gameState !== "playing") return;
    this.audio.playClick();
    this.setState("paused");
  }

  resume(): void {
    if (this.store.getSnapshot().gameState !== "paused") return;
    this.audio.playClick();
    this.setState("playing");
  }

  /** From pause / game over / revive back to the main menu (fresh ambient scene). */
  returnToMenu(): void {
    this.audio.stopMusic();
    this.audio.playClick();
    this.score.reset();
    this.difficulty.reset();
    this.world.reset();
    this.player.reset();
    this.particles?.clear();
    this.trail?.clear();
    this.powerups.reset();
    this.overdrive.reset();
    this.feedback.clear();
    this.store.setFeedback([], null);
    this.events?.reset();
    this.biomeManager?.reset();
    this.cameraRig?.setFovBoost(0);
    this.deathSpeed = 0;
    this.hitStopTimer = 0;
    this.reviveCountdown = 0;
    this.reviveInvuln = 0;
    this.store.setReviveCountdown(0);
    this.store.setKeys(SaveService.get().keys);
    this.store.clearRunResult();
    this.pushHud(true);
    this.setState("menu");
    this.player.animation?.setState("idle");
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
  }

  equipCharacter(id: string): void {
    SaveService.update((s) => {
      s.customization.character = id;
    });
    this.applyCustomizationFromSave();
    this.audio.unlock();
    this.audio.playUnlock();
    this.store.bumpMetaVersion();
  }

  equipTrail(id: string): void {
    SaveService.update((s) => {
      s.customization.trail = id;
    });
    this.applyCustomizationFromSave();
    this.audio.unlock();
    this.audio.playUnlock();
    this.store.bumpMetaVersion();
  }

  private applyCustomizationFromSave(): void {
    const save = SaveService.get();
    const character = getCharacter(save.customization.character);
    // Distinct 3D rig per archetype (robot GLB vs boy/girl/alien procedurals).
    this.player.applyCharacter(character);
    this.trail?.setTrail(save.customization.trail);
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

    this.rendererHandle!.renderer.render(this.sceneBundle!.scene, this.sceneBundle!.camera);
  }

  private updateAmbient(delta: number, speed: number): void {
    this.world.update(delta, speed, 0, 0);
    this.particles?.update(delta, speed, 0);
    this.trail?.update(delta, this.player.positionX, 0, speed, false);
    this.playerFX.update(delta);
    this.player.update(delta, 0);
    this.syncLights();
    this.cameraRig!.updateMenu(delta);
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
    this.player.update(delta, SPEED.countdownFactor);
    this.particles?.update(delta, speed, 0.15);
    this.trail?.update(delta, this.player.positionX, 0, speed, false);
    this.playerFX.update(delta);
    this.syncLights();
    this.cameraRig!.updatePlaying(delta, this.player, 0.12, true);
    this.audio.update(0.12);

    if (this.countdownLeft <= 0) {
      this.store.setCountdown(0); // GO!
      this.audio.playCountdownBeep(true);
      this.audio.startMusic();
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
    this.events?.update(delta, this.score.distance, effectiveSpeed, this.difficulty.tier.index);
    this.player.update(delta, ratio);

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
        secondsSinceJumpStart: this.player.secondsSinceJumpStart,
      },
      nearList,
      this.runTime
    );
    for (const event of awards.events) {
      if (!event.kind) continue;
      const sideSign =
        event.obstacle && event.obstacle.centerX > this.player.positionX ? -1 : 1;
      this.processSkillAward(event.kind, sideSign);
    }

    // ---- collision resolution (obstacles + event drones)
    // Revive grace — ignore hits for REVIVE_INVULN seconds after a Life Saver
    let hit: ColliderLike | null = null;
    if (this.reviveInvuln <= 0) {
      this.nearColliders.length = 0;
      this.nearColliders.push(...nearList, ...(this.events?.drones ?? []));
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

    // ---- coins: magnet pull + collection
    this.gatherNearbyCoins();
    this.applyMagnet(delta);
    const collectHeight = this.player.isSliding ? 0.95 : 1.9;
    this.collision.collectCoins(
      { x: this.player.positionX, y: this.player.positionY, height: collectHeight },
      this.frameCoins,
      (coin) => this.onCoinCollected(coin, totalMult)
    );

    // ---- pickups
    this.checkPickupCollection();
    this.checkKeyCollection();

    // ---- timers & meters
    this.powerups.update(delta);
    this.combo.update(delta);
    this.overdrive.update(delta);
    this.playerFX.setShield(this.powerups.hasShield() || this.reviveInvuln > 0);
    this.playerFX.setMagnet(
      this.powerups.isActive("magnet") || this.overdrive.active || this.powerups.turboProtects
    );
    this.playerFX.setOverdrive(this.overdrive.ramp);
    this.playerFX.update(delta);

    // ---- camera/audio/trail channels driven by ramped intensities
    this.cameraRig!.setFovBoost(this.powerups.turboFovBoost + OVERDRIVE_CFG.fovBoost * this.overdrive.ramp);
    this.trail?.setIntensityBoost(this.overdrive.ramp * 1.6 + this.powerups.turboRamp * 1.1);
    this.trail?.update(delta, this.player.positionX, this.player.positionY, effectiveSpeed, true);

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
    this.world.forEachObstacle((obstacle) => {
      if (
        obstacle.active &&
        obstacle.collider.maxZ > -14 &&
        obstacle.collider.minZ < 6
      ) {
        this.nearObstacleScratch.push(obstacle);
      }
    });
    return this.nearObstacleScratch;
  }

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
    this.player.update(delta, 0);
    this.particles?.update(delta, this.deathSpeed, 0);
    this.trail?.update(delta, this.player.positionX, 0, this.deathSpeed, false);
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
    this.player.update(delta, 0);
    this.playerFX.update(delta);
    this.syncLights();
    this.cameraRig!.updatePlaying(delta, this.player, 0, false);
    if (this.reviveCountdown <= 0) {
      this.skipRevive();
    }
  }

  // ------------------------------------------------------------ coin flow

  private gatherNearbyCoins(): void {
    this.frameCoins.length = 0;
    this.world.forEachCoin((coin) => {
      if (coin.active && !coin.collected && coin.worldZ > -30 && coin.worldZ < 6) {
        this.frameCoins.push(coin);
      }
    }, 0);
  }

  private applyMagnet(delta: number): void {
    const magnetOn = this.powerups.isActive("magnet");
    const odOn = this.overdrive.active;
    if (!magnetOn && !odOn && !this.powerups.turboProtects) return;
    const radius = magnetOn ? MAGNET.radius : odOn ? OVERDRIVE_CFG.magnetRadiusBoost : 4.5;
    const targetY = this.player.positionY + 1;
    this.magnetTargetY = targetY;
    for (const coin of this.frameCoins) {
      const dx = this.player.positionX - coin.mesh.position.x;
      const dz = 0 - coin.worldZ;
      const dy = targetY - coin.mesh.position.y;
      if (dx * dx + dz * dz + dy * dy < radius * radius) {
        coin.attracted = true;
        coin.pullTowards(this.player.positionX, targetY, MAGNET.pullLambda, delta);
      }
    }
  }

  private onCoinCollected(coin: Coin, multiplier: number): void {
    this.score.addCoin(multiplier);
    this.tally.coins += 1;
    this.missionDeltas.collectCoins = (this.missionDeltas.collectCoins ?? 0) + 1;
    this.store.registerCoinPopup();
    this.particles?.emitBurst(coin.mesh.position.x, coin.mesh.position.y + 0.3, coin.worldZ, 1.0, 0.82, 0.25, 8, 0.8);
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

  private activatePowerUp(type: HudPowerUp["type"], x: number, y: number): void {
    this.powerups.activate(type);
    this.tally.powerUps += 1;
    this.missionDeltas.collectPowerUps = (this.missionDeltas.collectPowerUps ?? 0) + 1;
    this.overdrive.gain(OVERDRIVE_CFG.gainPowerUp);
    this.feedback.push(`${type === "scoreMultiplier" ? "2× SCORE" : type.toUpperCase()}!`, "good");
    this.audio.playPowerup();
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
    this.audio.playCrash();
    this.particles?.emitCrash(this.player.positionX, 1.1, 0);
    this.cameraRig?.addShake(0.55);
    this.combo.breakCombo();
    this.player.die();

    // Life Saver — offer to consume a key and continue from same spot
    if (SaveService.get().keys > 0) {
      this.reviveCountdown = REVIVE_TIME;
      this.store.setReviveCountdown(Math.ceil(REVIVE_TIME));
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
      sectorName: this.biomeManager?.name ?? "NEON CITY",
    });
  }

  private syncLights(): void {
    if (!this.sceneBundle) return;
    this.sceneBundle.playerGlow.position.set(this.player.positionX, this.player.positionY + 3, 1.5);
  }

  // --------------------------------------------------------- skill awards

  private processSkillAward(kind: SkillEventKind, sideSign: number): void {
    if (kind === "coinStreak" || kind === "obstacleChain") return; // handled inline
    switch (kind) {
      case "nearMiss": {
        this.tally.nearMisses += 1;
        this.missionDeltas.nearMisses = (this.missionDeltas.nearMisses ?? 0) + 1;
        this.missionDeltas.perfectActions = (this.missionDeltas.perfectActions ?? 0) + 1;
        this.combo.add(1, this.runTime);
        this.overdrive.gain(OVERDRIVE_CFG.gainNearMiss);
        this.score.addBonus(50, this.currentTotalMultiplier());
        this.feedback.push("CLOSE CALL!", "warn", "+50");
        this.audio.playNearMiss();
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
    this.player.animation?.dispose();
    if (this.rendererHandle) {
      this.rendererHandle.renderer.setAnimationLoop(null);
    }
    if (this.world && this.sceneBundle) this.world.dispose(this.sceneBundle.scene);
    this.trail?.dispose(this.sceneBundle?.scene ?? new THREE.Scene());
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
  };
}

function powerUpColor(type: HudPowerUp["type"]): string {
  switch (type) {
    case "magnet": return "#37d3e0";
    case "shield": return "#4f8dff";
    case "scoreMultiplier": return "#e8c96a";
    case "turbo": return "#c06bff";
  }
}
