import * as THREE from "three";
import type { GameAction, GameState } from "@/types/game";
import { GameStore } from "./GameStore";
import { ResourceBag, disposeObjectTree } from "./utils/dispose";
import { createRenderer, type RendererHandle } from "./core/Renderer";
import { createSceneAndCamera, type SceneBundle } from "./core/GameScene";
import { CameraRig } from "./core/CameraRig";
import { AssetManager } from "./core/AssetManager";
import { Player } from "./player/Player";
import { CharacterAnimationController } from "./player/CharacterAnimationController";
import { InputSystem } from "./systems/InputSystem";
import { CollisionSystem } from "./systems/CollisionSystem";
import { ScoreSystem } from "./systems/ScoreSystem";
import { DifficultySystem } from "./systems/DifficultySystem";
import { ParticleSystem } from "./systems/ParticleSystem";
import { AudioSystem } from "./systems/AudioSystem";
import { SharedAssets } from "./world/SharedAssets";
import { WorldManager } from "./world/WorldManager";
import type { Coin } from "./entities/Coin";
import type { Obstacle } from "./entities/Obstacle";
import { MODEL_URL, SPEED, WORLD } from "./config/gameplay";
import { clamp } from "./utils/math";
import { StorageService } from "./core/StorageService";

const COUNTDOWN_STEP = 0.8;
const HUD_INTERVAL = 0.1;

/**
 * Authoritative game orchestrator: owns the render loop, the state machine and
 * every system. React never touches per-frame state — it talks to GameStore.
 */
export class Game {
  private bag = new ResourceBag();
  private rendererHandle: RendererHandle | null = null;
  private sceneBundle: SceneBundle | null = null;
  private cameraRig: CameraRig | null = null;

  private player = new Player();
  private world!: WorldManager;
  private input: InputSystem | null = null;
  private collision = new CollisionSystem();
  private score = new ScoreSystem();
  private difficulty = new DifficultySystem();
  private particles: ParticleSystem | null = null;
  private audio = new AudioSystem();

  private clock = new THREE.Clock();
  private resizeObserver: ResizeObserver | null = null;
  private countdownLeft = 0;
  private lastCountdownValue = -1;
  private hudAccumulator = 0;
  private deathSpeed = 0;
  private timeouts: number[] = [];
  private disposed = false;

  // Reusable per-frame scratch (avoid hot-loop allocations).
  private frameCoins: Coin[] = [];
  private nearObstacleScratch: Obstacle[] = [];

  constructor(
    private host: HTMLElement,
    private store: GameStore
  ) {}

  // ------------------------------------------------------------------ setup

  init(): void {
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

    const shared = new SharedAssets(this.bag);
    this.world = new WorldManager(bundle.scene, shared, this.bag);

    this.particles = new ParticleSystem(bundle.scene, this.bag);
    bundle.scene.add(this.player.root);

    this.input = new InputSystem(this.host, (action) => this.handleAction(action));
    this.audio.setMuted(this.store.getSnapshot().muted);
    this.player.onLand = (impact) => {
      if (this.particles) this.particles.emitDust(this.player.positionX, 0, Math.round(clamp(impact / 4, 2, 8)));
      this.audio.playLand();
    };

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.host);
    this.handleResize();

    window.addEventListener("visibilitychange", this.onVisibilityChange);

    rendererHandle.renderer.setAnimationLoop(() => this.frame());
    void this.loadCharacter();
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
    } catch (error) {
      // Model failed but the procedural fallback keeps the game playable.
      console.error("[NEON RUN] character load failed:", error);
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
      case "gameover":
        if (action === "confirm" || action === "jump") this.startRun();
        break;
      default:
        break;
    }
  }

  startRun(): void {
    this.audio.unlock();
    this.audio.playClick();
    this.score.reset();
    this.difficulty.reset();
    this.world.reset();
    this.player.reset();
    this.particles?.clear();
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

  /** From pause / game over back to the main menu (fresh ambient scene). */
  returnToMenu(): void {
    this.audio.stopMusic();
    this.audio.playClick();
    this.score.reset();
    this.difficulty.reset();
    this.world.reset();
    this.player.reset();
    this.particles?.clear();
    this.deathSpeed = 0;
    this.store.clearRunResult();
    this.pushHud(true);
    this.setState("menu");
    this.player.animation?.setState("idle");
  }

  toggleMute(): void {
    const next = !this.store.getSnapshot().muted;
    this.store.setMuted(next);
    this.audio.setMuted(next);
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
  private lastFps = 60;

  // ------------------------------------------------------------------- loop

  private setState(state: GameState): void {
    this.store.setState(state);
  }

  private frame(): void {
    const delta = clamp(this.clock.getDelta(), 0, 0.05); // tab-switch guard
    const nowMs = performance.now();
    this.store.flush(nowMs);
    if (!this.sceneBundle || !this.cameraRig) return;

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
      case "gameover":
        this.updateGameOver(delta);
        break;
    }

    this.rendererHandle!.renderer.render(this.sceneBundle!.scene, this.sceneBundle!.camera);
  }

  private fpsAccum = 0;
  private fpsFrames = 0;

  private updateAmbient(delta: number, speed: number): void {
    this.world.update(delta, speed, 0);
    this.particles?.update(delta, speed, 0);
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
    this.world.update(delta, speed, 0);
    this.difficulty.overrideSpeed(speed);
    this.player.update(delta, SPEED.countdownFactor);
    this.particles?.update(delta, speed, 0.15);
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

  private updatePlaying(delta: number): void {
    const speed = this.difficulty.update(delta, true);
    const ratio = this.difficulty.ratio;

    this.world.update(delta, speed, this.difficulty.tier.index);
    this.player.update(delta, ratio);

    // Gather nearby coins for collection tests (colliders were refreshed in world.update).
    this.frameCoins.length = 0;
    this.world.forEachCoin((coin) => {
      if (coin.active && !coin.collected && coin.worldZ > -30 && coin.worldZ < 6) {
        this.frameCoins.push(coin);
      }
    }, delta);

    const bounds = this.player.getBounds();
    const hit = this.collision.findHit(
      {
        minX: bounds.min.x,
        minY: bounds.min.y,
        minZ: bounds.min.z,
        maxX: bounds.max.x,
        maxY: bounds.max.y,
        maxZ: bounds.max.z,
      },
      this.nearObstacles()
    );
    if (hit) {
      this.onPlayerHit();
      return;
    }

    this.collision.collectCoins(
      { x: this.player.positionX, y: this.player.positionY, height: this.player.isSliding ? 0.95 : 1.9 },
      this.frameCoins,
      (coin) => {
        this.score.addCoin();
        this.store.registerCoinPopup();
        this.particles?.emitCoinBurst(coin.mesh.position.x, coin.mesh.position.y + 0.3, coin.worldZ);
        this.audio.playCoin();
      }
    );

    // Coin collection shrink animation.
    this.animateCollectingCoins(delta);

    this.score.addDistance(speed * delta);
    this.particles?.update(delta, speed, ratio);
    this.syncLights();
    this.cameraRig!.updatePlaying(delta, this.player, ratio, true);
    this.audio.update(ratio);

    this.hudAccumulator += delta;
    if (this.hudAccumulator >= HUD_INTERVAL) {
      this.hudAccumulator = 0;
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
    this.world.update(delta, this.deathSpeed, this.difficulty.tier.index);
    this.animateCollectingCoins(delta);
    this.player.update(delta, 0);
    this.particles?.update(delta, this.deathSpeed, 0);
    this.syncLights();
    this.cameraRig!.updatePlaying(delta, this.player, 0, false);
    this.audio.update(0);
  }

  private onPlayerHit(): void {
    if (this.store.getSnapshot().gameState !== "playing") return;

    this.audio.stopMusic();
    this.audio.playCrash();
    this.particles?.emitCrash(this.player.positionX, 1.1, 0);
    this.cameraRig?.addShake(0.55);
    this.player.die();

    this.deathSpeed = this.difficulty.speed;
    this.setState("gameover");

    const score = this.score.score;
    const distance = Math.floor(this.score.distance);
    const coins = this.score.coins;
    const prevBest = StorageService.getBestStats();
    const stats = StorageService.recordRun(score, distance, coins);

    const timeoutId = window.setTimeout(() => {
      if (this.disposed) return;
      this.store.finishRun(
        {
          score,
          distance,
          coins,
          isNewBestScore: score > 0 && score >= stats.bestScore && score > prevBest.bestScore,
          isNewBestDistance: distance > 0 && distance >= stats.bestDistance && distance > prevBest.bestDistance,
        },
        stats
      );
    }, 900);
    this.timeouts.push(timeoutId);
  }

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

  private syncLights(): void {
    if (!this.sceneBundle) return;
    this.sceneBundle.playerGlow.position.set(this.player.positionX, this.player.positionY + 3, 1.5);
  }

  // ---------------------------------------------------------------- cleanup

  dispose(): void {
    this.disposed = true;
    for (const id of this.timeouts) window.clearTimeout(id);
    this.timeouts = [];
    window.removeEventListener("visibilitychange", this.onVisibilityChange);
    this.resizeObserver?.disconnect();
    this.input?.dispose();
    this.audio.dispose();
    this.player.animation?.dispose();
    if (this.rendererHandle) {
      this.rendererHandle.renderer.setAnimationLoop(null);
    }
    if (this.world && this.sceneBundle) this.world.dispose(this.sceneBundle.scene);
    this.particles?.dispose(this.sceneBundle?.scene ?? new THREE.Scene());
    if (this.sceneBundle) disposeObjectTree(this.sceneBundle.scene);
    this.bag.dispose();
    this.rendererHandle?.dispose();
    this.host.replaceChildren();
  }
}
