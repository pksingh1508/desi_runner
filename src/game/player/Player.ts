import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { LaneIndex } from "@/types/game";
import { CharacterAnimationController } from "./CharacterAnimationController";
import { LANES, PLAYER, CENTER_LANE, ROCKET_RIDE } from "@/game/config/gameplay";
import { clamp, damp, lerp, smoothstep } from "@/game/utils/math";
import type { CharacterArchetype, CharacterDefinition } from "@/game/config/characters";
import { buildClassicRig, buildFallbackBot, disposeRigGroup } from "./ClassicRigs";
import { HumanRig } from "./human/HumanRig";
import type { HumanAssetLibrary } from "./human/HumanAssets";
import { DiwaliRocket } from "./DiwaliRocket";

export type PlayerLandCallback = (impactSpeed: number) => void;
type Locomotion = "idle" | "run";
type RocketPhase = "none" | "launch" | "cruise" | "descend";

/**
 * Player simulation: lane interpolation, jump physics, slide timing, the
 * Diwali-rocket flight and the visual rig. The collision box follows gameplay
 * state (sliding shrinks it, jumping raises it).
 *
 * Rig kinds (one active at a time, so bone names never collide):
 *  - "human"  — realistic desi runners (HumanRig: CC0 base body + outfit
 *               shader + accessories + cloth), own AnimationMixer.
 *  - "robot"  — VECTOR, the CC0 RobotExpressive GLB (tinted), with a mixer on
 *               the player root so its SlidePivot overlay can roll the rig.
 *  - classic procedural rigs (ClassicRigs.ts) animated by animateProcedural.
 */
export class Player {
  readonly root = new THREE.Group();

  /** Controller of the ACTIVE rig (null for procedural rigs). */
  animation: CharacterAnimationController | null = null;
  onLand: PlayerLandCallback | null = null;
  /** Fired once when a rocket flight touches down. */
  onRocketLanded: (() => void) | null = null;

  private pivot = new THREE.Group(); // named "SlidePivot" — targeted by keyframe tracks
  private modelHolder = new THREE.Group();
  private fallbackBot: THREE.Group | null = null;
  private loadedModel: THREE.Group | null = null;
  private robotClips: THREE.AnimationClip[] = [];
  private robotAnimation: CharacterAnimationController | null = null;
  private archetypeGroup: THREE.Group | null = null;
  private humanRig: HumanRig | null = null;
  private humanLibrary: HumanAssetLibrary | null = null;

  private currentArchetype: CharacterArchetype = "human";
  private currentDef: CharacterDefinition | null = null;

  private targetLane: LaneIndex = CENTER_LANE;
  private y = 0;
  private verticalVelocity = 0;
  private grounded = true;
  private sliding = false;
  private slideTimeLeft = 0;
  private jumpBufferLeft = 0;
  private slideQueuedFromAir = false;
  private dead = false;
  private runPhase = 0;
  private locomotion: Locomotion = "idle";
  private celebrateTimer = 0;
  private worldSpeed = 0;

  /** Diwali rocket ride */
  private rocket = new DiwaliRocket();
  private rocketPhase: RocketPhase = "none";
  private rocketTimeLeft = 0;
  private rocketDuration = 0;
  private rocketElapsed = 0;
  private rocketStartY = 0;
  private descendStartY = 0;

  /** Simulation age (seconds) and jump start age — used by SkillSystem. */
  private age = 0;
  private jumpStartAge = -Infinity;

  private bounds = new THREE.Box3();
  /** Original material colors, cached once so character tints are reversible. */
  private originalColors = new Map<THREE.MeshStandardMaterial, THREE.Color>();

  constructor() {
    this.root.name = "PlayerRoot";
    this.pivot.name = "SlidePivot";
    this.modelHolder.name = "ModelHolder";
    this.modelHolder.rotation.y = Math.PI; // GLB rigs face +Z; turn them to -Z (forward)
    this.pivot.add(this.modelHolder);
    this.root.add(this.pivot);

    // Placeholder until the first rig is ready (loading screen only).
    this.fallbackBot = buildFallbackBot();
    // Procedural rigs are modeled facing local -Z; cancel the holder's yaw.
    this.fallbackBot.rotation.y = Math.PI;
    this.modelHolder.add(this.fallbackBot);

    // The ridable rocket lives on the pivot (not the holder) so classic rigs
    // can lie on it while it stays level. Yaw PI → nose faces -Z.
    this.rocket.group.rotation.y = Math.PI;
    this.pivot.add(this.rocket.group);
  }

  /** Shared realistic-runner asset library (owned by Game). */
  setHumanLibrary(library: HumanAssetLibrary): void {
    this.humanLibrary = library;
  }

  /**
   * Registers the VECTOR robot GLB (normalized height). Its controller is
   * created only while VECTOR is equipped.
   */
  provideRobotModel(gltf: GLTF): void {
    const model = gltf.scene as THREE.Group;
    model.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = false;
      }
    });
    // Normalize: feet at y=0, height ~= standingHeight.
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);
    const scale = size.y > 0 ? PLAYER.standingHeight / size.y : 1;
    model.scale.setScalar(scale);
    model.position.x -= ((box.min.x + box.max.x) / 2) * scale;
    model.position.z -= ((box.min.z + box.max.z) / 2) * scale;
    model.position.y -= box.min.y * scale;
    this.loadedModel = model;
    this.robotClips = gltf.animations;
    if (this.currentDef?.archetype === "robot") this.applyCharacter(this.currentDef);
  }

  get hasRobotModel(): boolean {
    return this.loadedModel !== null;
  }

  isUsingFallback(): boolean {
    return this.fallbackBot !== null && this.fallbackBot.visible;
  }

  // ------------------------------------------------------------------ input

  requestLane(direction: -1 | 1): void {
    if (this.dead) return;
    const next = (this.targetLane + direction) as LaneIndex;
    this.targetLane = clamp(next, 0, 2) as LaneIndex;
  }

  /** Returns true when the jump launched immediately (not buffered). */
  requestJump(): boolean {
    if (this.dead || this.isFlying) return false;
    if (this.grounded) {
      // Slide-cancel jump (Subway Surfers behavior): pressing jump mid-slide
      // launches immediately instead of being swallowed by the input buffer.
      this.launchJump();
      return true;
    }
    this.jumpBufferLeft = PLAYER.jumpBufferTime;
    return false;
  }

  requestSlide(): void {
    if (this.dead || this.isFlying) return;
    if (!this.grounded) {
      // Slam down and slide on landing.
      this.verticalVelocity = Math.min(this.verticalVelocity, -PLAYER.fastFallVelocity);
      this.slideQueuedFromAir = true;
      return;
    }
    this.beginSlide();
  }

  /** Forward world speed (m/s) — drives cloth wind and rocket sparks. */
  setWorldSpeed(speed: number): void {
    this.worldSpeed = speed;
  }

  /** Idle (menu) vs run cycle; applied immediately and on rig swaps. */
  setLocomotion(state: Locomotion): void {
    this.locomotion = state;
    this.celebrateTimer = 0;
    if (!this.dead && !this.isFlying) this.animation?.setState(state);
  }

  /** Short dance flourish (menu equip, records) when the rig supports it. */
  celebrate(seconds: number): void {
    if (this.dead || !this.animation?.hasState("dance")) return;
    this.celebrateTimer = seconds;
    this.animation.setState("dance");
  }

  // --------------------------------------------------------------- sim loop

  update(delta: number, speedRatio: number): void {
    this.age += delta;
    // Lane interpolation (frame-rate independent damping).
    const targetX = LANES[this.targetLane];
    this.root.position.x = damp(this.root.position.x, targetX, PLAYER.laneDampSpeed, delta);

    if (this.rocketPhase !== "none") {
      this.updateRocketFlight(delta, speedRatio, targetX);
      return;
    }

    // Reset the whole-character pose when not flying. While sliding, the
    // right-side roll is owned by the mixer's overlay — except when no
    // overlay exists (human rigs roll via their own clip, procedural rigs
    // have no mixer), where the pose is eased manually or stays upright.
    const mixerOwnsSlidePivot = this.sliding && Boolean(this.animation?.ownsSlidePivot);
    const manualSlide = this.sliding && !this.animation?.hasClips;
    // AnimationMixer assumes exclusive ownership of a bound property. Do
    // not touch the pivot while its keyframe action is holding a pose: the
    // mixer's unchanged-output cache would otherwise let these damped
    // values leak through and slowly collapse the side roll.
    if (!mixerOwnsSlidePivot) {
      this.pivot.rotation.x = damp(
        this.pivot.rotation.x,
        manualSlide ? PLAYER.slidePitchAngle : 0,
        manualSlide ? 14 : 8,
        delta
      );
      this.pivot.position.y = damp(
        this.pivot.position.y,
        manualSlide ? PLAYER.slideVisualLift : 0,
        manualSlide ? 14 : 10,
        delta
      );
      this.pivot.position.z = damp(this.pivot.position.z, manualSlide ? PLAYER.slideShiftZ : 0, 10, delta);
    }
    this.modelHolder.rotation.x = damp(this.modelHolder.rotation.x, 0, 9, delta);
    this.modelHolder.position.z = damp(this.modelHolder.position.z, 0, 9, delta);
    this.modelHolder.position.y = damp(this.modelHolder.position.y, 0, 9, delta);
    this.rocket.update(delta, this.worldSpeed);

    // The visual rig must follow the simulated height exactly — collision,
    // camera and mesh all share this value so jumps read truthfully.
    this.root.position.y = this.y;

    if (this.dead) {
      this.finishFrame(delta, 0);
      return;
    }

    // Vertical physics.
    if (!this.grounded) {
      this.verticalVelocity -= PLAYER.gravity * delta;
      this.y += this.verticalVelocity * delta;
      if (this.y <= 0) {
        this.y = 0;
        const impact = -this.verticalVelocity;
        this.verticalVelocity = 0;
        this.grounded = true;
        this.onLand?.(impact);
        if (this.animation?.state === "jump") {
          this.animation.forceFinishOneShot("jump");
          this.playRun();
        }
        if (this.slideQueuedFromAir) {
          this.slideQueuedFromAir = false;
          this.beginSlide();
        }
      }
    }

    // Buffered jump input.
    if (this.jumpBufferLeft > 0) {
      this.jumpBufferLeft -= delta;
      if (this.grounded && !this.sliding && this.jumpBufferLeft > 0) {
        this.jumpBufferLeft = 0;
        this.launchJump();
      }
    }

    // Slide timer.
    if (this.sliding) {
      this.slideTimeLeft -= delta;
      if (this.slideTimeLeft <= 0) {
        this.sliding = false;
        this.slideTimeLeft = 0;
        this.playRun();
      }
    }

    // Visual polish.
    const lateralOffset = targetX - this.root.position.x;
    const laneRoll = -lateralOffset * PLAYER.laneRollFactor;
    const targetRoll = manualSlide ? PLAYER.slideRollAngle : laneRoll;
    if (!mixerOwnsSlidePivot) {
      this.pivot.rotation.z = damp(this.pivot.rotation.z, targetRoll, manualSlide ? 15 : 12, delta);
    }

    if (this.grounded && !this.sliding) {
      this.runPhase += delta * (6 + speedRatio * 9);
    }

    this.animateProcedural(delta);
    this.refreshBounds();
    this.finishFrame(delta, speedRatio);
  }

  /** Mixer, flourish timer and cloth — shared tail of every update path. */
  private finishFrame(delta: number, speedRatio: number): void {
    if (this.celebrateTimer > 0) {
      this.celebrateTimer -= delta;
      if (this.celebrateTimer <= 0 && !this.dead && !this.isFlying) {
        this.animation?.setState(this.locomotion);
      }
    }
    this.animation?.update(delta);
    this.animation?.setRunSpeedRatio(speedRatio);
    this.humanRig?.updateSecondary(delta, this.root.position, this.dead ? 0 : this.worldSpeed);
  }

  // ------------------------------------------------------------ rocket ride

  startRocket(duration: number): void {
    if (this.dead) return;
    this.rocketPhase = "launch";
    this.rocketDuration = duration;
    this.rocketTimeLeft = duration;
    this.rocketElapsed = 0;
    this.rocketStartY = this.y;
    this.sliding = false;
    this.slideTimeLeft = 0;
    this.jumpBufferLeft = 0;
    this.slideQueuedFromAir = false;
    this.verticalVelocity = 0;
    this.grounded = false;
    this.celebrateTimer = 0;
    this.animation?.forceFinishOneShot("slide");
    this.animation?.setState(this.animation.hasState("ride") ? "ride" : "jump");
    this.rocket.setActive(true);
    this.rocket.setThrust(1);
  }

  /** Ends a flight immediately (death / menu). */
  stopRocket(): void {
    this.rocketPhase = "none";
    this.rocketTimeLeft = 0;
    this.rocketDuration = 0;
    this.rocket.setActive(false);
  }

  private updateRocketFlight(delta: number, speedRatio: number, targetX: number): void {
    const cfg = ROCKET_RIDE;
    this.rocketElapsed += delta;
    this.rocketTimeLeft -= delta;
    let y = this.y;
    let pitch = 0;
    let thrust = 0.75;

    if (this.rocketPhase === "launch") {
      const t = clamp(this.rocketElapsed / cfg.launchSeconds, 0, 1);
      // Ease-out with a small overshoot: the rocket kicks up, then settles.
      const eased = 1 - Math.pow(1 - t, 3) + Math.sin(t * Math.PI) * 0.06;
      y = lerp(this.rocketStartY, cfg.cruiseY, eased);
      pitch = cfg.launchPitch * (1 - t);
      thrust = 1;
      if (t >= 1) this.rocketPhase = "cruise";
    }
    if (this.rocketPhase === "cruise") {
      y = cfg.cruiseY + Math.sin(this.age * cfg.bobFrequency) * cfg.bobAmplitude;
      pitch = Math.sin(this.age * cfg.bobFrequency + 0.8) * 0.025;
      if (this.rocketTimeLeft <= cfg.descendSeconds) {
        this.rocketPhase = "descend";
        this.descendStartY = y;
      }
    }
    if (this.rocketPhase === "descend") {
      const t = clamp(1 - this.rocketTimeLeft / cfg.descendSeconds, 0, 1);
      y = lerp(this.descendStartY, 0, smoothstep(t));
      pitch = cfg.descendPitch * Math.sin(t * Math.PI);
      thrust = 0.45 * (1 - t) + 0.15;
      if (t >= 1 || this.rocketTimeLeft <= 0) {
        this.touchDown();
        return;
      }
    }

    this.y = y;
    this.root.position.y = y;
    this.verticalVelocity = 0;
    this.grounded = false;
    this.sliding = false;

    // Bank into lane changes, pitch with the flight phase.
    const lateral = targetX - this.root.position.x;
    this.pivot.rotation.z = damp(this.pivot.rotation.z, -lateral * cfg.bankFactor, 10, delta);
    this.pivot.rotation.x = damp(this.pivot.rotation.x, pitch, 8, delta);
    this.pivot.position.y = damp(this.pivot.position.y, 0, 10, delta);
    this.pivot.position.z = damp(this.pivot.position.z, 0, 10, delta);

    if (this.humanRig) {
      // Sit astride the rocket (Driving pose), leaning into the wind.
      this.modelHolder.rotation.x = damp(this.modelHolder.rotation.x, -0.1, 7, delta);
      this.modelHolder.position.y = damp(this.modelHolder.position.y, cfg.seatHeight, 7, delta);
      this.modelHolder.position.z = damp(this.modelHolder.position.z, 0, 7, delta);
      this.rocket.group.position.set(0, 0.36, -0.1);
    } else {
      // Classic rigs lie superman-style along the rocket.
      this.modelHolder.rotation.x = damp(this.modelHolder.rotation.x, -Math.PI / 2 + 0.12, 7, delta);
      this.modelHolder.position.z = damp(this.modelHolder.position.z, 0.92, 7, delta);
      this.modelHolder.position.y = damp(this.modelHolder.position.y, 0.42, 7, delta);
      this.rocket.group.position.set(0, 0.22, -0.2);
    }
    this.rocket.setThrust(thrust);
    this.rocket.update(delta, this.worldSpeed);

    this.runPhase += delta * (9 + speedRatio * 6);
    this.animateProcedural(delta);
    this.refreshBounds();
    this.finishFrame(delta, speedRatio);
  }

  private touchDown(): void {
    this.rocketPhase = "none";
    this.rocketTimeLeft = 0;
    this.y = 0;
    this.root.position.y = 0;
    this.grounded = true;
    this.verticalVelocity = 0;
    this.rocket.setActive(false);
    this.onLand?.(6);
    this.playRun();
    this.onRocketLanded?.();
    this.refreshBounds();
  }

  // --------------------------------------------------------------- getters

  getBounds(): THREE.Box3 {
    return this.bounds;
  }

  get positionX(): number {
    return this.root.position.x;
  }

  get positionY(): number {
    return this.y;
  }

  get targetLaneX(): number {
    return LANES[this.targetLane];
  }

  get isGrounded(): boolean {
    return this.grounded;
  }

  get isSliding(): boolean {
    return this.sliding;
  }

  get isDead(): boolean {
    return this.dead;
  }

  get isFlying(): boolean {
    return this.rocketPhase !== "none";
  }

  /** True during the final glide down (HUD warning / coin placement). */
  get isDescending(): boolean {
    return this.rocketPhase === "descend";
  }

  get rocketRemaining(): number {
    return Math.max(0, this.rocketTimeLeft);
  }

  get rocketProgress(): number {
    if (!this.isFlying || this.rocketDuration <= 0) return 0;
    return 1 - this.rocketTimeLeft / this.rocketDuration;
  }

  get currentLane(): LaneIndex {
    return this.targetLane;
  }

  get runCyclePhase(): number {
    return this.runPhase;
  }

  /** Seconds since the current (or most recent) jump launch. */
  get secondsSinceJumpStart(): number {
    return this.grounded && this.verticalVelocity <= 0 ? Number.POSITIVE_INFINITY : this.age - this.jumpStartAge;
  }

  // ------------------------------------------------------------ lifecycle

  die(): void {
    if (this.dead) return;
    this.dead = true;
    this.stopRocket();
    this.verticalVelocity = 0;
    this.sliding = false;
    this.slideTimeLeft = 0;
    this.celebrateTimer = 0;
    this.animation?.forceFinishOneShot("slide");
    this.animation?.setState("death");
  }

  /** Life-Saver revive — restores control at same lane/position with brief grace. */
  revive(): void {
    this.dead = false;
    this.stopRocket();
    this.sliding = false;
    this.slideTimeLeft = 0;
    this.y = 0;
    this.verticalVelocity = 0;
    this.grounded = true;
    this.jumpBufferLeft = 0;
    this.slideQueuedFromAir = false;
    this.jumpStartAge = -Infinity;
    this.root.position.y = 0;
    this.resetPose();
    this.locomotion = "run";
    this.animation?.setState("run");
    this.humanRig?.resetSecondary();
    this.refreshBounds();
  }

  reset(): void {
    this.targetLane = CENTER_LANE;
    this.root.position.set(0, 0, 0);
    this.resetPose();
    this.y = 0;
    this.verticalVelocity = 0;
    this.grounded = true;
    this.sliding = false;
    this.slideTimeLeft = 0;
    this.jumpBufferLeft = 0;
    this.slideQueuedFromAir = false;
    this.dead = false;
    this.stopRocket();
    this.runPhase = 0;
    this.age = 0;
    this.jumpStartAge = -Infinity;
    this.celebrateTimer = 0;
    this.animation?.reset();
    this.animation?.setState(this.locomotion);
    this.humanRig?.resetSecondary();
    this.refreshBounds();
  }

  private resetPose(): void {
    this.pivot.rotation.set(0, 0, 0);
    this.pivot.position.set(0, 0, 0);
    this.pivot.scale.set(1, 1, 1);
    this.modelHolder.rotation.x = 0;
    this.modelHolder.position.set(0, 0, 0);
    if (this.archetypeGroup) this.archetypeGroup.scale.set(1, 1, 1);
    if (this.fallbackBot) this.fallbackBot.scale.set(1, 1, 1);
  }

  // ------------------------------------------------------------ characters

  /**
   * Swaps the visible rig. Human runners need their assets loaded in the
   * HumanAssetLibrary first (Game awaits `prepare()`); returns false when the
   * rig could not be built yet.
   */
  applyCharacter(def: CharacterDefinition): boolean {
    if (def.archetype === "human") {
      const library = this.humanLibrary;
      if (!library || !def.outfit || !library.isReady(def.outfit.body)) return false;
      this.currentDef = def;
      this.currentArchetype = def.archetype;
      if (this.humanRig?.characterId === def.id) return true;
      this.deactivateRobot();
      this.disposeArchetype();
      this.hideFallback();
      this.deactivateHuman();
      const rig = new HumanRig(def, library);
      this.humanRig = rig;
      this.modelHolder.add(rig.object);
      this.root.add(rig.extras);
      this.animation = rig.animation;
      this.animation.setJumpReturnCallback(() => {
        if (!this.dead && this.animation?.state === "jump") this.playRun();
      });
      this.applyLocomotion();
      return true;
    }

    this.currentDef = def;
    this.currentArchetype = def.archetype;
    this.deactivateHuman();

    if (def.archetype === "robot") {
      this.disposeArchetype();
      if (this.loadedModel) {
        this.hideFallback();
        if (!this.loadedModel.parent) this.modelHolder.add(this.loadedModel);
        this.loadedModel.visible = true;
        this.applyTintToObject(this.loadedModel, def.tintHex, def.accentHex);
        if (!this.robotAnimation) {
          // Created while no other rig is attached, so every track binds to
          // the robot's own bones (SlidePivot overlay included).
          this.robotAnimation = new CharacterAnimationController(this.root, this.robotClips);
          this.robotAnimation.setJumpReturnCallback(() => {
            if (!this.dead && this.animation?.state === "jump") this.playRun();
          });
        }
        this.animation = this.robotAnimation;
        this.applyLocomotion();
      } else {
        // GLB still loading: show the tinted placeholder bot.
        this.animation = null;
        this.showFallback(def.tintHex, def.accentHex);
      }
      return true;
    }

    // Classic procedural archetypes animate their own limbs.
    this.deactivateRobot();
    this.hideFallback();
    this.disposeArchetype();
    this.animation = null;
    this.archetypeGroup = buildClassicRig(def.archetype, def.tintHex, def.accentHex);
    // Builders model faces toward local -Z. modelHolder already yaws PI for
    // the GLB rigs, so procedural rigs need their own PI to cancel it.
    this.archetypeGroup.rotation.y = Math.PI;
    this.modelHolder.add(this.archetypeGroup);
    return true;
  }

  private applyLocomotion(): void {
    if (!this.animation) return;
    if (this.dead) this.animation.setState("death");
    else if (this.isFlying) this.animation.setState(this.animation.hasState("ride") ? "ride" : "jump");
    else this.animation.setState(this.locomotion);
  }

  private deactivateHuman(): void {
    if (!this.humanRig) return;
    if (this.animation === this.humanRig.animation) this.animation = null;
    this.humanRig.dispose();
    this.humanRig = null;
  }

  private deactivateRobot(): void {
    if (this.robotAnimation) {
      if (this.animation === this.robotAnimation) this.animation = null;
      this.robotAnimation.dispose();
      this.robotAnimation = null;
    }
    if (this.loadedModel?.parent) this.loadedModel.removeFromParent();
  }

  private disposeArchetype(): void {
    if (!this.archetypeGroup) return;
    this.modelHolder.remove(this.archetypeGroup);
    disposeRigGroup(this.archetypeGroup);
    this.archetypeGroup = null;
  }

  private hideFallback(): void {
    if (this.fallbackBot) this.fallbackBot.visible = false;
  }

  private showFallback(tintHex: string, accentHex: string): void {
    if (!this.fallbackBot) return;
    this.applyTintToObject(this.fallbackBot, tintHex, accentHex);
    this.fallbackBot.visible = true;
  }

  private applyTintToObject(root: THREE.Object3D, tintHex: string, accentHex: string): void {
    const tint = new THREE.Color(tintHex);
    const accent = new THREE.Color(accentHex);
    const scratch = new THREE.Color();
    root.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      const material = mesh.material as THREE.MeshStandardMaterial | THREE.MeshStandardMaterial[];
      const materials = Array.isArray(material) ? material : [material];
      for (const mat of materials) {
        if (!(mat instanceof THREE.MeshStandardMaterial)) continue;
        let original = this.originalColors.get(mat);
        if (!original) {
          original = mat.color.clone();
          this.originalColors.set(mat, original);
        }
        if (original.r + original.g + original.b < 0.45) {
          mat.color.copy(original).lerp(tint, 0.6);
        } else {
          scratch.copy(original).lerp(accent, 0.65);
          mat.color.copy(scratch);
          mat.emissive.copy(accent).multiplyScalar(0.22);
        }
      }
    });
  }

  // ----------------------------------------------------------------- intern

  private launchJump(): void {
    if (this.sliding) this.endSlideVisual();
    this.grounded = false;
    this.jumpStartAge = this.age;
    this.verticalVelocity = PLAYER.jumpVelocity;
    this.celebrateTimer = 0;
    // No hard stop of the slide overlay here: setState() crossfades the
    // still-running overlay/action out, so a slide-cancel jump untilts
    // smoothly instead of snapping upright for one frame.
    this.animation?.setState("jump");
  }

  private beginSlide(): void {
    if (this.sliding || this.dead) return;
    this.sliding = true;
    this.slideTimeLeft = PLAYER.slideDuration;
    this.celebrateTimer = 0;
    this.animation?.forceFinishOneShot("jump");
    this.animation?.setState("slide");
  }

  private endSlideVisual(): void {
    this.sliding = false;
    this.slideTimeLeft = 0;
  }

  private playRun(): void {
    if (this.dead) return;
    this.locomotion = "run";
    this.animation?.setState("run");
  }

  private refreshBounds(): void {
    const height = this.sliding ? PLAYER.slideHeight : PLAYER.standingHeight;
    const w = PLAYER.width / 2;
    const d = PLAYER.depth / 2;
    this.bounds.min.set(this.root.position.x - w, this.y, -d);
    this.bounds.max.set(this.root.position.x + w, this.y + height, d);
  }

  /** Eases a procedural rig's crouch scale back to upright (slide-cancel). */
  private relaxProceduralScale(group: THREE.Group, delta: number): void {
    const s = group.scale;
    s.x = damp(s.x, 1, 11, delta);
    s.y = damp(s.y, 1, 11, delta);
    s.z = damp(s.z, 1, 11, delta);
  }

  /** Limb animation for classic procedural rigs (and the loading placeholder). */
  private animateProcedural(delta: number): void {
    if (this.humanRig) return;
    const group: THREE.Group | null =
      this.archetypeGroup ?? (this.fallbackBot && this.fallbackBot.visible ? this.fallbackBot : null);
    if (!group) return;
    const legs = group.userData.legs as THREE.Mesh[] | undefined;
    const arms = group.userData.arms as THREE.Mesh[] | undefined;
    // Rocket flight — lie straight like superman, no swing.
    if (this.isFlying && legs) {
      this.relaxProceduralScale(group, delta);
      legs[0].rotation.x = 0.05;
      legs[1].rotation.x = 0.05;
      legs[0].rotation.z = 0;
      legs[1].rotation.z = 0;
      if (arms && arms.length >= 2) {
        arms[0].rotation.x = -0.15;
        arms[0].rotation.z = -0.25;
        arms[1].rotation.x = -0.15;
        arms[1].rotation.z = 0.25;
      }
      group.position.y = Math.sin(this.age * 3.5) * 0.015;
      return;
    }
    if (this.grounded && !this.sliding && legs) {
      const swing = Math.sin(this.runPhase * 2.4);
      // Restore the upright slide pose (scale/offsets) before running.
      group.scale.set(1, 1, 1);
      legs[0].rotation.x = swing * 0.9;
      legs[1].rotation.x = -swing * 0.9;
      legs[0].rotation.z = 0;
      legs[1].rotation.z = 0;
      legs[0].position.z = 0;
      legs[1].position.z = 0;
      if (arms && arms.length >= 2) {
        arms[0].rotation.x = -swing * 0.7;
        arms[1].rotation.x = swing * 0.7;
        arms[0].rotation.z = 0;
        arms[1].rotation.z = 0;
      }
      group.position.y = Math.abs(Math.cos(this.runPhase * 2.4)) * 0.06;
    } else if (!this.grounded && legs) {
      this.relaxProceduralScale(group, delta);
      legs[0].position.z = 0;
      legs[1].position.z = 0;
      legs[0].rotation.x = 0.5;
      legs[1].rotation.x = -0.35;
      legs[0].rotation.z = 0;
      legs[1].rotation.z = 0;
      if (arms && arms.length >= 2) {
        // Arms thrown up-back (classic jump silhouette from the rear camera).
        arms[0].rotation.x = -2.2;
        arms[1].rotation.x = -2.2;
        arms[0].rotation.z = -0.25;
        arms[1].rotation.z = 0.25;
      }
    } else if (this.sliding) {
      // Asymmetric shoulder slide: SlidePivot rolls the whole runner onto the
      // right side; the upper arm reaches outward while one leg drives
      // forward and the other tucks slightly. Full scale — a rotation, never
      // a vertical squash.
      group.position.y = 0;
      group.scale.set(1, 1, 1);
      const slideElapsed = PLAYER.slideDuration - this.slideTimeLeft;
      const enterWeight = clamp(slideElapsed / PLAYER.slideEnterTime, 0, 1);
      const exitWeight = clamp(this.slideTimeLeft / PLAYER.slideExitTime, 0, 1);
      const poseWeight = Math.min(enterWeight, exitWeight);
      const limbDamp = 18;
      if (legs) {
        legs[0].rotation.x = damp(legs[0].rotation.x, 0.95 * poseWeight, limbDamp, delta);
        legs[1].rotation.x = damp(legs[1].rotation.x, 0.38 * poseWeight, limbDamp, delta);
        legs[0].rotation.z = damp(legs[0].rotation.z, -0.12 * poseWeight, limbDamp, delta);
        legs[1].rotation.z = damp(legs[1].rotation.z, 0.28 * poseWeight, limbDamp, delta);
        legs[0].position.z = damp(legs[0].position.z, -0.14 * poseWeight, limbDamp, delta);
        legs[1].position.z = damp(legs[1].position.z, -0.04 * poseWeight, limbDamp, delta);
      }
      if (arms && arms.length >= 2) {
        arms[0].rotation.x = damp(arms[0].rotation.x, -0.38 * poseWeight, limbDamp, delta);
        arms[1].rotation.x = damp(arms[1].rotation.x, -0.72 * poseWeight, limbDamp, delta);
        arms[0].rotation.z = damp(arms[0].rotation.z, -1.12 * poseWeight, limbDamp, delta);
        arms[1].rotation.z = damp(arms[1].rotation.z, 0.3 * poseWeight, limbDamp, delta);
      }
    } else {
      group.scale.set(1, 1, 1);
      if (legs) {
        legs[0].position.z = 0;
        legs[1].position.z = 0;
        legs[0].rotation.z = 0;
        legs[1].rotation.z = 0;
      }
      if (arms && arms.length >= 2) {
        arms[0].rotation.z = 0;
        arms[1].rotation.z = 0;
      }
      group.position.y = 0;
    }
  }

  dispose(): void {
    this.deactivateHuman();
    this.deactivateRobot();
    this.disposeArchetype();
    if (this.fallbackBot) {
      disposeRigGroup(this.fallbackBot);
      this.fallbackBot.removeFromParent();
      this.fallbackBot = null;
    }
    this.rocket.dispose();
  }
}
