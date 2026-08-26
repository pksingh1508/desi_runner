import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { LaneIndex } from "@/types/game";
import { CharacterAnimationController } from "./CharacterAnimationController";
import { LANES, PLAYER, CENTER_LANE } from "@/game/config/gameplay";
import { clamp, damp } from "@/game/utils/math";

export type PlayerLandCallback = (impactSpeed: number) => void;

/**
 * Player simulation: lane interpolation, jump physics, slide timing and the
 * visual rig (GLB model or procedural fallback). The collision box follows
 * gameplay state (sliding shrinks it, jumping raises it).
 */
export class Player {
  readonly root = new THREE.Group();

  animation: CharacterAnimationController | null = null;
  onLand: PlayerLandCallback | null = null;

  private pivot = new THREE.Group(); // named "SlidePivot" — targeted by keyframe tracks
  private modelHolder = new THREE.Group();
  private fallbackBot: THREE.Group | null = null;
  private usingFallback = true;

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
    this.modelHolder.rotation.y = Math.PI; // face -Z (forward)
    this.pivot.add(this.modelHolder);
    this.root.add(this.pivot);

    this.fallbackBot = this.buildFallbackBot();
    this.modelHolder.add(this.fallbackBot);
  }

  /** Swap the procedural placeholder for the loaded GLB (normalized height). */
  attachModel(gltf: GLTF): void {
    if (this.fallbackBot) {
      this.modelHolder.remove(this.fallbackBot);
      this.disposeFallback(this.fallbackBot);
      this.fallbackBot = null;
    }
    const model = gltf.scene;
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
    const scale = size.y > 0 ? (PLAYER.standingHeight * 1.0) / size.y : 1;
    model.scale.setScalar(scale);
    model.position.x -= (box.min.x + box.max.x) / 2 * scale;
    model.position.z -= (box.min.z + box.max.z) / 2 * scale;
    model.position.y -= box.min.y * scale;

    this.modelHolder.add(model);
    this.usingFallback = false;
  }

  isUsingFallback(): boolean {
    return this.usingFallback;
  }

  // ------------------------------------------------------------------ input

  requestLane(direction: -1 | 1): void {
    if (this.dead) return;
    const next = (this.targetLane + direction) as LaneIndex;
    this.targetLane = clamp(next, 0, 2) as LaneIndex;
  }

  requestJump(): void {
    if (this.dead) return;
    if (this.grounded && !this.sliding) {
      this.launchJump();
    } else {
      this.jumpBufferLeft = PLAYER.jumpBufferTime;
    }
  }

  requestSlide(): void {
    if (this.dead) return;
    if (!this.grounded) {
      // Slam down and slide on landing.
      this.verticalVelocity = Math.min(this.verticalVelocity, -PLAYER.fastFallVelocity);
      this.slideQueuedFromAir = true;
      return;
    }
    this.beginSlide();
  }

  // --------------------------------------------------------------- sim loop

  update(delta: number, speedRatio: number): void {
    this.age += delta;
    // Lane interpolation (frame-rate independent damping).
    const targetX = LANES[this.targetLane];
    this.root.position.x = damp(this.root.position.x, targetX, PLAYER.laneDampSpeed, delta);
    // The visual rig must follow the simulated height exactly — collision,
    // camera and mesh all share this value so jumps read truthfully.
    this.root.position.y = this.y;

    if (this.dead) {
      this.animation?.update(delta);
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
    const targetRoll = -lateralOffset * PLAYER.laneRollFactor;
    this.pivot.rotation.z = damp(this.pivot.rotation.z, targetRoll, 12, delta);

    if (this.grounded && !this.sliding) {
      this.runPhase += delta * (6 + speedRatio * 9);
    }

    if (this.usingFallback) {
      this.animateFallbackBot();
    }

    this.refreshBounds();
    this.animation?.update(delta);
    this.animation?.setRunSpeedRatio(speedRatio);
  }

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

  die(): void {
    if (this.dead) return;
    this.dead = true;
    this.verticalVelocity = 0;
    this.sliding = false;
    this.slideTimeLeft = 0;
    this.animation?.forceFinishOneShot("slide");
    this.animation?.setState("death");
  }

  reset(): void {
    this.targetLane = CENTER_LANE;
    this.root.position.set(0, 0, 0);
    this.pivot.rotation.set(0, 0, 0);
    this.pivot.position.set(0, 0, 0);
    this.pivot.scale.set(1, 1, 1);
    this.y = 0;
    this.verticalVelocity = 0;
    this.grounded = true;
    this.sliding = false;
    this.slideTimeLeft = 0;
    this.jumpBufferLeft = 0;
    this.slideQueuedFromAir = false;
    this.dead = false;
    this.runPhase = 0;
    this.age = 0;
    this.jumpStartAge = -Infinity;
    this.animation?.reset();
    this.refreshBounds();
  }

  /**
   * Applies a cosmetic character variant: dark suit materials shift toward
   * the variant tint, bright/glow panels adopt the accent as a soft emissive.
   * The base GLB file is never modified; originals are cached so variants can
   * swap freely at runtime.
   */
  applyCharacterVariant(tintHex: string, accentHex: string): void {
    const tint = new THREE.Color(tintHex);
    const accent = new THREE.Color(accentHex);
    const scratch = new THREE.Color();
    const apply = (obj: THREE.Object3D): void => {
      obj.traverse((child) => {
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
    };
    apply(this.modelHolder);
    // Fallback bot materials live outside the model holder until a GLB lands.
    if (this.fallbackBot) apply(this.fallbackBot);
  }

  setAnimationController(controller: CharacterAnimationController): void {
    this.animation?.dispose();
    this.animation = controller;
    controller.setJumpReturnCallback(() => {
      if (!this.dead && this.currentStateIsJump()) this.playRun();
    });
    controller.setState("idle");
  }

  // ----------------------------------------------------------------- intern

  private currentStateIsJump(): boolean {
    return this.animation?.state === "jump";
  }

  private launchJump(): void {
    if (this.sliding) this.endSlideVisual();
    this.grounded = false;
    this.jumpStartAge = this.age;
    this.verticalVelocity = PLAYER.jumpVelocity;
    this.animation?.forceFinishOneShot("slide");
    this.animation?.setState("jump");
  }

  private beginSlide(): void {
    if (this.sliding || this.dead) return;
    this.sliding = true;
    this.slideTimeLeft = PLAYER.slideDuration;
    this.animation?.forceFinishOneShot("jump");
    this.animation?.setState("slide");
  }

  private endSlideVisual(): void {
    this.sliding = false;
    this.slideTimeLeft = 0;
  }

  private playRun(): void {
    if (this.dead) return;
    this.animation?.setState("run");
  }

  private refreshBounds(): void {
    const height = this.sliding ? PLAYER.slideHeight : PLAYER.standingHeight;
    const w = PLAYER.width / 2;
    const d = PLAYER.depth / 2;
    this.bounds.min.set(
      this.root.position.x - w,
      this.y,
      -d
    );
    this.bounds.max.set(
      this.root.position.x + w,
      this.y + height,
      d
    );
  }

  // -------------------------------------------------------- fallback visuals

  private buildFallbackBot(): THREE.Group {
    const group = new THREE.Group();
    group.name = "FallbackBot";

    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1a221b, roughness: 0.55, metalness: 0.35 });
    const glowMat = new THREE.MeshStandardMaterial({
      color: 0x14210f,
      emissive: 0xd9de7a,
      emissiveIntensity: 2.2,
      roughness: 0.3,
    });
    const accentMat = new THREE.MeshStandardMaterial({
      color: 0x11240f,
      emissive: 0x9fca7d,
      emissiveIntensity: 1.4,
      roughness: 0.4,
    });

    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.62, 4, 12), bodyMat);
    body.position.y = 1.05;
    body.castShadow = true;

    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.3), glowMat);
    visor.position.set(0, 1.58, -0.16);

    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.06, 10), accentMat);
    core.rotation.x = Math.PI / 2;
    core.position.set(0, 1.22, -0.3);

    const shoulderGeo = new THREE.SphereGeometry(0.13, 10, 8);
    const leftShoulder = new THREE.Mesh(shoulderGeo, accentMat);
    leftShoulder.position.set(-0.42, 1.38, 0);
    const rightShoulder = new THREE.Mesh(shoulderGeo, accentMat);
    rightShoulder.position.set(0.42, 1.38, 0);

    const legGeo = new THREE.CapsuleGeometry(0.11, 0.36, 4, 8);
    const legL = new THREE.Mesh(legGeo, bodyMat);
    legL.position.set(-0.16, 0.28, 0);
    legL.castShadow = true;
    const legR = new THREE.Mesh(legGeo, bodyMat);
    legR.position.set(0.16, 0.28, 0);
    legR.castShadow = true;

    group.add(body, visor, core, leftShoulder, rightShoulder, legL, legR);
    group.userData.legs = [legL, legR];
    return group;
  }

  private animateFallbackBot(): void {
    if (!this.fallbackBot) return;
    const legs = this.fallbackBot.userData.legs as THREE.Mesh[] | undefined;
    if (this.grounded && !this.sliding && legs) {
      const swing = Math.sin(this.runPhase * 2.4);
      legs[0].rotation.x = swing * 0.9;
      legs[1].rotation.x = -swing * 0.9;
      this.fallbackBot.position.y = Math.abs(Math.cos(this.runPhase * 2.4)) * 0.08;
    } else if (!this.grounded && legs) {
      legs[0].rotation.x = 0.5;
      legs[1].rotation.x = -0.35;
    }
  }

  private disposeFallback(bot: THREE.Group): void {
    bot.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat?.dispose();
    });
  }
}
