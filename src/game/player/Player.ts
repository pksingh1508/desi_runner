import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { LaneIndex } from "@/types/game";
import { CharacterAnimationController } from "./CharacterAnimationController";
import { LANES, PLAYER, CENTER_LANE } from "@/game/config/gameplay";
import { clamp, damp } from "@/game/utils/math";
import type { CharacterArchetype, CharacterDefinition } from "@/game/config/characters";

export type PlayerLandCallback = (impactSpeed: number) => void;

/**
 * Player simulation: lane interpolation, jump physics, slide timing and the
 * visual rig (GLB model or procedural fallback). The collision box follows
 * gameplay state (sliding shrinks it, jumping raises it).
 *
 * Distinct character archetypes:
 *  - "robot" (VECTOR) renders the loaded RobotExpressive GLB tinted at runtime.
 *  - "robot_ember" / "robot_wraith" / "robot_aurora" render distinct
 *    procedural variants so EMBER / WRAITH / AURORA are not just re-tints.
 *  - "boy" / "girl" / "alien_slim" / "alien_brute" render stylized low-poly
 *    procedural rigs so each selection feels like a real character swap.
 */
export class Player {
  readonly root = new THREE.Group();

  animation: CharacterAnimationController | null = null;
  onLand: PlayerLandCallback | null = null;

  private pivot = new THREE.Group(); // named "SlidePivot" — targeted by keyframe tracks
  private modelHolder = new THREE.Group();
  private fallbackBot: THREE.Group | null = null;
  private loadedModel: THREE.Group | null = null;
  private archetypeGroup: THREE.Group | null = null;
  private usingFallback = true;

  private currentCharacterId = "vector";
  private currentArchetype: CharacterArchetype = "robot";
  private currentTint = "#9fb86a";
  private currentAccent = "#d9de7a";

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

  /** Rocket flight (jetpack) */
  private rocketFlying = false;
  private rocketTimeLeft = 0;
  private rocketDuration = 0;
  private rocketPack: THREE.Group | null = null;
  private rocketFlame: THREE.Mesh | null = null;

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
    // Same yaw cancellation as procedural archetypes: faces are modeled at
    // local -Z but modelHolder already turns PI for the GLB.
    this.fallbackBot.rotation.y = Math.PI;
    this.modelHolder.add(this.fallbackBot);

    // Rocket jetpack (hidden until flight) — attached to modelHolder so it
    // rotates with the character when laying down
    this.rocketPack = this.buildRocketPack();
    this.rocketPack.visible = false;
    this.modelHolder.add(this.rocketPack);
  }

  /** Swap the procedural placeholder for the loaded GLB (normalized height). */
  attachModel(gltf: GLTF): void {
    // Remove the pre-load placeholder (always robot-shaped).
    if (this.fallbackBot) {
      this.modelHolder.remove(this.fallbackBot);
      this.disposeGroup(this.fallbackBot);
      this.fallbackBot = null;
    }
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
    const scale = size.y > 0 ? (PLAYER.standingHeight * 1.0) / size.y : 1;
    model.scale.setScalar(scale);
    model.position.x -= (box.min.x + box.max.x) / 2 * scale;
    model.position.z -= (box.min.z + box.max.z) / 2 * scale;
    model.position.y -= box.min.y * scale;

    this.loadedModel = model;
    this.modelHolder.add(model);
    this.usingFallback = false;

    // Respect the currently-equipped character (may be non-robot).
    this.syncModelVisibility();
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
    if (this.dead || this.rocketFlying) return;
    if (this.grounded) {
      // Slide-cancel jump (Subway Surfers behavior): pressing jump mid-slide
      // launches immediately instead of being swallowed by the input buffer.
      this.launchJump();
    } else {
      this.jumpBufferLeft = PLAYER.jumpBufferTime;
    }
  }

  requestSlide(): void {
    if (this.dead || this.rocketFlying) return;
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

    // Rocket flight overrides vertical simulation — lay down / sleep pose + jetpack
    if (this.rocketFlying) {
      if (this.rocketPack) this.rocketPack.visible = true;
      this.rocketTimeLeft -= delta;
      // Hover height with gentle sine
      const targetY = 4.4 + Math.sin(this.age * 3.0) * 0.12;
      this.y = damp(this.y, targetY, 4.5, delta);
      this.root.position.y = this.y;
      this.verticalVelocity = 0;
      this.grounded = false;
      this.sliding = false;
      // Lay down transition — modelHolder rotates to horizontal (sleep/superman)
      const targetRotX = -Math.PI / 2 + 0.12; // slight head-up tilt
      this.modelHolder.rotation.x = damp(this.modelHolder.rotation.x, targetRotX, 7, delta);
      this.modelHolder.position.z = damp(this.modelHolder.position.z, 0.92, 7, delta);
      this.modelHolder.position.y = damp(this.modelHolder.position.y, 0.18, 7, delta);
      // Keep rocket pack flame pulsing
      if (this.rocketPack) {
        const flameL = this.rocketPack.userData.flameL as THREE.Mesh | undefined;
        const flameR = this.rocketPack.userData.flameR as THREE.Mesh | undefined;
        const s = 1 + Math.sin(this.age * 18) * 0.22;
        if (flameL) {
          flameL.scale.set(s, s * 0.85, s);
          (flameL.material as THREE.MeshBasicMaterial).opacity = 0.78 + Math.sin(this.age * 20) * 0.14;
        }
        if (flameR) {
          const s2 = 1 + Math.sin(this.age * 18 + 1.2) * 0.22;
          flameR.scale.set(s2, s2 * 0.85, s2);
          (flameR.material as THREE.MeshBasicMaterial).opacity = 0.78 + Math.sin(this.age * 20 + 1) * 0.14;
        }
      }
      if (this.rocketTimeLeft <= 0) {
        this.rocketFlying = false;
        this.rocketTimeLeft = 0;
        this.verticalVelocity = -2;
      } else if (this.rocketTimeLeft < 0.9) {
        // Begin descending in last 0.9s
        this.y = damp(this.y, 0, 3.2, delta);
        this.root.position.y = this.y;
        if (this.y < 0.12) {
          this.y = 0;
          this.root.position.y = 0;
          this.rocketFlying = false;
          this.grounded = true;
          this.verticalVelocity = 0;
          this.onLand?.(2);
          this.playRun();
        }
      }
      // Visual roll still applies but softer
      const lateralOffset = targetX - this.root.position.x;
      const targetRoll = -lateralOffset * PLAYER.laneRollFactor * 0.45;
      this.pivot.rotation.z = damp(this.pivot.rotation.z, targetRoll, 12, delta);
      this.pivot.rotation.x = damp(this.pivot.rotation.x, -0.08, 6, delta);
      this.runPhase += delta * (9 + speedRatio * 6);
      this.animateProcedural(delta);
      this.refreshBounds();
      this.animation?.update(delta);
      this.animation?.setRunSpeedRatio(speedRatio * 1.15);
      return;
    } else {
      // Reset lay-down & lean when not flying
      this.pivot.rotation.x = damp(this.pivot.rotation.x, 0, 8, delta);
      this.modelHolder.rotation.x = damp(this.modelHolder.rotation.x, 0, 9, delta);
      this.modelHolder.position.z = damp(this.modelHolder.position.z, 0, 9, delta);
      this.modelHolder.position.y = damp(this.modelHolder.position.y, 0, 9, delta);
      if (this.rocketPack) {
        // Fade flame quickly when not flying
        this.rocketPack.visible = false;
      }
    }
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

    this.animateProcedural(delta);

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

  get isFlying(): boolean {
    return this.rocketFlying;
  }

  get rocketRemaining(): number {
    return this.rocketTimeLeft;
  }

  get rocketProgress(): number {
    if (!this.rocketFlying || this.rocketDuration <= 0) return 0;
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

  die(): void {
    if (this.dead) return;
    this.dead = true;
    this.rocketFlying = false;
    this.rocketTimeLeft = 0;
    this.verticalVelocity = 0;
    this.sliding = false;
    this.slideTimeLeft = 0;
    this.animation?.forceFinishOneShot("slide");
    this.animation?.setState("death");
  }

  /** Life-Saver revive — restores control at same lane/position with brief grace. */
  revive(): void {
    this.dead = false;
    this.rocketFlying = false;
    this.rocketTimeLeft = 0;
    this.sliding = false;
    this.slideTimeLeft = 0;
    this.y = 0;
    this.verticalVelocity = 0;
    this.grounded = true;
    this.jumpBufferLeft = 0;
    this.slideQueuedFromAir = false;
    this.jumpStartAge = -Infinity;
    this.root.position.y = 0;
    this.pivot.rotation.set(0, 0, 0);
    this.pivot.position.set(0, 0, 0);
    this.pivot.scale.set(1, 1, 1);
    this.modelHolder.rotation.x = 0;
    this.modelHolder.position.set(0, 0, 0);
    if (this.archetypeGroup) this.archetypeGroup.scale.set(1, 1, 1);
    if (this.fallbackBot) this.fallbackBot.scale.set(1, 1, 1);
    this.animation?.setState("run");
    this.refreshBounds();
  }

  startRocket(duration: number): void {
    if (this.dead) return;
    this.rocketFlying = true;
    this.rocketDuration = duration;
    this.rocketTimeLeft = duration;
    this.sliding = false;
    this.slideTimeLeft = 0;
    this.jumpBufferLeft = 0;
    this.slideQueuedFromAir = false;
    this.verticalVelocity = 0;
    // Small hop into flight
    this.grounded = false;
    this.animation?.setState("jump");
  }

  stopRocket(): void {
    this.rocketFlying = false;
    this.rocketTimeLeft = 0;
    this.rocketDuration = 0;
  }

  reset(): void {
    this.targetLane = CENTER_LANE;
    this.root.position.set(0, 0, 0);
    this.pivot.rotation.set(0, 0, 0);
    this.pivot.position.set(0, 0, 0);
    this.pivot.scale.set(1, 1, 1);
    this.modelHolder.rotation.x = 0;
    this.modelHolder.position.set(0, 0, 0);
    if (this.archetypeGroup) this.archetypeGroup.scale.set(1, 1, 1);
    if (this.fallbackBot) this.fallbackBot.scale.set(1, 1, 1);
    this.y = 0;
    this.verticalVelocity = 0;
    this.grounded = true;
    this.sliding = false;
    this.slideTimeLeft = 0;
    this.jumpBufferLeft = 0;
    this.slideQueuedFromAir = false;
    this.dead = false;
    this.rocketFlying = false;
    this.rocketTimeLeft = 0;
    this.rocketDuration = 0;
    this.runPhase = 0;
    this.age = 0;
    this.jumpStartAge = -Infinity;
    this.animation?.reset();
    this.refreshBounds();
  }

  /**
   * Primary cosmetic entry — swaps between the GLB robot and procedural
   * archetypes. Only VECTOR ("robot") uses the loaded GLB; every other
   * character (including EMBER / WRAITH / AURORA) rebuilds a distinct
   * procedural rig so selections are silhouette-level swaps, not re-tints.
   */
  applyCharacter(def: CharacterDefinition): void {
    this.currentCharacterId = def.id;
    this.currentArchetype = def.archetype;
    this.currentTint = def.tintHex;
    this.currentAccent = def.accentHex;

    const isVectorGLB = def.archetype === "robot";

    if (isVectorGLB) {
      // VECTOR — show GLB (or fallback before load), hide procedural archetype.
      if (this.archetypeGroup) {
        this.archetypeGroup.visible = false;
      }
      if (this.loadedModel) {
        this.loadedModel.visible = true;
        this.applyTintToObject(this.loadedModel, def.tintHex, def.accentHex);
      }
      if (this.usingFallback && this.fallbackBot) {
        // Before GLB load, tint the placeholder so menu preview matches.
        this.applyTintToObject(this.fallbackBot, def.tintHex, def.accentHex);
        this.fallbackBot.visible = true;
      }
      if (this.fallbackBot) this.fallbackBot.visible = this.usingFallback;
      this.syncModelVisibility();
      return;
    }

    // All non-VECTOR characters: hide GLB/fallback, (re)build distinct procedural group.
    if (this.loadedModel) this.loadedModel.visible = false;
    if (this.fallbackBot) this.fallbackBot.visible = false;

    if (this.archetypeGroup) {
      this.modelHolder.remove(this.archetypeGroup);
      this.disposeGroup(this.archetypeGroup);
      this.archetypeGroup = null;
    }
    this.archetypeGroup = this.buildArchetype(def.archetype, def.tintHex, def.accentHex);
    // Builders model faces toward local -Z. modelHolder already yaws PI for
    // the +Z-facing GLB, so procedural rigs need their own PI to cancel it —
    // otherwise every non-VECTOR character runs facing the camera.
    this.archetypeGroup.rotation.y = Math.PI;
    this.modelHolder.add(this.archetypeGroup);
    this.archetypeGroup.visible = true;
  }

  /**
   * Legacy tint-only path (still used if callers pass raw hex). For robot
   * archetypes it tints in place; for non-robot it rebuilds the procedural
   * rig so colour changes are visible.
   */
  applyCharacterVariant(tintHex: string, accentHex: string): void {
    this.currentTint = tintHex;
    this.currentAccent = accentHex;
    if (this.currentArchetype === "robot") {
      const target = this.loadedModel ?? this.fallbackBot;
      if (target) this.applyTintToObject(target, tintHex, accentHex);
      // Also tint anything under modelHolder (covers fallback before load)
      this.applyTintToObject(this.modelHolder, tintHex, accentHex);
    } else {
      // Rebuild current non-robot archetype with new palette.
      if (this.archetypeGroup) {
        this.modelHolder.remove(this.archetypeGroup);
        this.disposeGroup(this.archetypeGroup);
      }
      this.archetypeGroup = this.buildArchetype(this.currentArchetype, tintHex, accentHex);
      this.archetypeGroup.rotation.y = Math.PI; // cancel modelHolder yaw (see applyCharacter)
      this.modelHolder.add(this.archetypeGroup);
    }
  }

  private syncModelVisibility(): void {
    const isVector = this.currentArchetype === "robot";
    if (this.loadedModel) this.loadedModel.visible = isVector;
    if (this.archetypeGroup) this.archetypeGroup.visible = !isVector;
    if (this.fallbackBot) this.fallbackBot.visible = this.usingFallback && isVector;
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

  private applyTintToModelHolder(tintHex: string, accentHex: string): void {
    // Tint only the robot paths — archetype groups are built pre-tinted.
    if (this.loadedModel) this.applyTintToObject(this.loadedModel, tintHex, accentHex);
    else if (this.fallbackBot) this.applyTintToObject(this.fallbackBot, tintHex, accentHex);
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
    // No hard stop of the slide overlay here: setState() crossfades the
    // still-running overlay/action out (FADE_FAST), so a slide-cancel jump
    // untilts smoothly instead of snapping upright for one frame.
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

  // -------------------------------------------------------- archetype visuals

  /** Enables cast shadows on every opaque mesh of a procedural rig. */
  private shadowify(group: THREE.Group): void {
    group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
      const materials = Array.isArray(material) ? material : material ? [material] : [];
      if (materials.some((m) => m.transparent)) return;
      mesh.castShadow = true;
    });
  }

  private buildArchetype(archetype: CharacterArchetype, tintHex: string, accentHex: string): THREE.Group {
    switch (archetype) {
      case "boy":
        return this.buildBoy(tintHex, accentHex);
      case "girl":
        return this.buildGirl(tintHex, accentHex);
      case "alien_slim":
        return this.buildAlienSlim(tintHex, accentHex);
      case "alien_brute":
        return this.buildAlienBrute(tintHex, accentHex);
      case "robot_ember":
        return this.buildEmberBot(tintHex, accentHex);
      case "robot_wraith":
        return this.buildWraithBot(tintHex, accentHex);
      case "robot_aurora":
        return this.buildAuroraBot(tintHex, accentHex);
      case "robot":
      default:
        return this.buildFallbackBotTinted(tintHex, accentHex);
    }
  }

  private buildBoy(tintHex: string, accentHex: string): THREE.Group {
    const tint = new THREE.Color(tintHex);
    const accent = new THREE.Color(accentHex);
    const group = new THREE.Group();
    group.name = "Boy";

    const jacketMat = new THREE.MeshStandardMaterial({ color: tint, roughness: 0.6, metalness: 0.15 });
    const jacketDark = new THREE.MeshStandardMaterial({ color: tint.clone().multiplyScalar(0.55), roughness: 0.7, metalness: 0.1 });
    const accentMat = new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 1.1, roughness: 0.45 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xf0c8a8, roughness: 0.65 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: 0x22345a, roughness: 0.8 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x1a2436, roughness: 0.75 });
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf5f7fa, roughness: 0.5 });
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x4a3220, roughness: 0.85 });

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.58, 4, 12), jacketMat);
    torso.position.y = 1.02;

    // Open jacket: dark inner shirt panel on the chest + jacket hem.
    const shirt = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.42, 0.08), darkMat);
    shirt.position.set(0, 1.0, -0.24);
    const hem = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.3, 0.1, 12), jacketDark);
    hem.position.set(0, 0.62, 0);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 12), skinMat);
    head.position.set(0, 1.58, -0.02);

    // Cap readable from the rear camera: full dome + back strap + button.
    const capDome = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.52),
      jacketMat
    );
    capDome.position.set(0, 1.6, -0.02);
    const capBrim = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.045, 0.26), accentMat);
    capBrim.position.set(0, 1.68, -0.24);
    capBrim.rotation.x = 0.08;
    const capStrap = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.07, 0.06), accentMat);
    capStrap.position.set(0, 1.62, 0.24);
    const capButton = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), accentMat);
    capButton.position.set(0, 1.88, -0.02);
    // Hair fringe at the nape, below the cap line.
    const nape = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.14, 0.1), hairMat);
    nape.position.set(0, 1.42, 0.16);

    // Runner shades.
    const shades = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 0.09, 0.1),
      new THREE.MeshStandardMaterial({ color: 0x0a0e14, roughness: 0.15, metalness: 0.4 })
    );
    shades.position.set(0, 1.56, -0.22);

    // Street-runner backpack — the rear-view signature: body, front pocket,
    // top bedroll and shoulder straps.
    // Warm orange + slight emissive: flat rear faces go near-black under a
    // high sun, so the pack carries its own light and never reads as a void.
    const packMat = new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.45, roughness: 0.6 });
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.44, 0.2), packMat);
    pack.position.set(0, 1.06, 0.32);
    const packPocket = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.24, 0.07), jacketMat);
    packPocket.position.set(0, 0.98, 0.44);
    const packStrip = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.05, 0.02), whiteMat);
    packStrip.position.set(0, 1.06, 0.48);
    const bedroll = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.34, 10), jacketDark);
    bedroll.rotation.z = Math.PI / 2;
    bedroll.position.set(0, 1.32, 0.32);
    const strapGeo = new THREE.BoxGeometry(0.09, 0.34, 0.05);
    const strapL = new THREE.Mesh(strapGeo, accentMat);
    strapL.position.set(-0.18, 1.24, -0.29);
    strapL.rotation.x = -0.12;
    const strapR = new THREE.Mesh(strapGeo, accentMat);
    strapR.position.set(0.18, 1.24, -0.29);
    strapR.rotation.x = -0.12;
    // Resting hood roll under the pack.
    const hood = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.055, 8, 14, Math.PI), jacketDark);
    hood.position.set(0, 0.78, 0.2);
    hood.rotation.x = Math.PI * 0.1;

    // Arms pivot at the shoulder so sleeves + hands swing together.
    const buildArm = (side: -1 | 1): THREE.Group => {
      const arm = new THREE.Group();
      arm.position.set(side * 0.38, 1.32, 0);
      const pad = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), jacketMat);
      arm.add(pad);
      const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.2, 4, 8), jacketMat);
      sleeve.position.y = -0.2;
      arm.add(sleeve);
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.05, 10), accentMat);
      cuff.position.y = -0.34;
      arm.add(cuff);
      const forearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.14, 4, 8), skinMat);
      forearm.position.y = -0.44;
      arm.add(forearm);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), skinMat);
      hand.position.y = -0.56;
      arm.add(hand);
      return arm;
    };
    const armL = buildArm(-1);
    const armR = buildArm(1);

    // Legs pivot at the hip so sneakers swing with the run cycle.
    const buildLeg = (side: -1 | 1): THREE.Group => {
      const leg = new THREE.Group();
      leg.position.set(side * 0.16, 0.72, 0);
      const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.34, 4, 8), pantsMat);
      thigh.position.y = -0.32;
      leg.add(thigh);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.3, 0.03), accentMat);
      stripe.position.set(side * 0.12, -0.34, 0);
      leg.add(stripe);
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.1, 0.3), whiteMat);
      shoe.position.set(0, -0.64, -0.05);
      leg.add(shoe);
      const sole = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.045, 0.31), accentMat);
      sole.position.set(0, -0.695, -0.05);
      leg.add(sole);
      return leg;
    };
    const legL = buildLeg(-1);
    const legR = buildLeg(1);

    group.add(
      torso, shirt, hem, head, capDome, capBrim, capStrap, capButton, nape, shades,
      pack, packPocket, packStrip, bedroll, strapL, strapR, hood, armL, armR, legL, legR
    );
    this.shadowify(group);
    group.userData.legs = [legL, legR];
    group.userData.arms = [armL, armR];
    return group;
  }

  private buildGirl(tintHex: string, accentHex: string): THREE.Group {
    const tint = new THREE.Color(tintHex);
    const accent = new THREE.Color(accentHex);
    const group = new THREE.Group();
    group.name = "Girl";

    const topMat = new THREE.MeshStandardMaterial({ color: tint, roughness: 0.55, metalness: 0.16 });
    const topDark = new THREE.MeshStandardMaterial({ color: tint.clone().multiplyScalar(0.55), roughness: 0.65 });
    const accentMat = new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 1.3, roughness: 0.4 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xf5d0b8, roughness: 0.65 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: 0x1d2a44, roughness: 0.8 });
    const hairMat = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.55, emissive: accent, emissiveIntensity: 0.5 });
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf5f7fa, roughness: 0.5 });

    // Cropped athletic jacket + high waistband.
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.5, 4, 12), topMat);
    torso.position.y = 1.08;
    const jacketHem = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.26, 0.09, 12), accentMat);
    jacketHem.position.set(0, 0.86, 0);
    const waistband = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.23, 0.1, 12), topDark);
    waistband.position.set(0, 0.76, 0);
    // Glowing runner chevron on the back — rear visibility + style.
    const chevron = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.16, 4), accentMat);
    chevron.position.set(0, 1.12, 0.24);
    chevron.rotation.x = Math.PI / 2;
    chevron.rotation.y = Math.PI / 4;

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 12), skinMat);
    head.position.set(0, 1.58, -0.02);

    // Full hair volume: back-falling mass + long high ponytail + tie.
    const hairBack = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 10), hairMat);
    hairBack.position.set(0, 1.6, 0.05);
    hairBack.scale.set(1, 1.05, 0.95);
    const lockGeo = new THREE.CapsuleGeometry(0.055, 0.22, 4, 8);
    const lockL = new THREE.Mesh(lockGeo, hairMat);
    lockL.position.set(-0.22, 1.42, -0.06);
    const lockR = new THREE.Mesh(lockGeo, hairMat);
    lockR.position.set(0.22, 1.42, -0.06);
    const ponytail = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.6, 10), hairMat);
    ponytail.position.set(0, 1.72, 0.3);
    ponytail.rotation.x = 0.55; // tip streams high, clearing the head silhouette
    const hairTie = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.028, 8, 12), whiteMat);
    hairTie.position.set(0, 1.7, 0.29);
    hairTie.rotation.x = 1.02;

    // Sport visor.
    const visorBand = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.07, 12, 1, true), accentMat);
    visorBand.position.set(0, 1.66, -0.02);
    const visorBrim = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.2), accentMat);
    visorBrim.position.set(0, 1.62, -0.26);

    // Arms pivot at the shoulder: cap sleeves + forearms + wristbands + hands.
    const buildArm = (side: -1 | 1): THREE.Group => {
      const arm = new THREE.Group();
      arm.position.set(side * 0.33, 1.3, 0);
      const sleeve = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), topMat);
      arm.add(sleeve);
      const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.12, 4, 8), skinMat);
      upper.position.y = -0.14;
      arm.add(upper);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.05, 10), accentMat);
      band.position.y = -0.26;
      arm.add(band);
      const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.12, 4, 8), skinMat);
      fore.position.y = -0.36;
      arm.add(fore);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 8), skinMat);
      hand.position.y = -0.47;
      arm.add(hand);
      return arm;
    };
    const armL = buildArm(-1);
    const armR = buildArm(1);

    // Legs pivot at the hip: leggings + sneakers with neon soles.
    const buildLeg = (side: -1 | 1): THREE.Group => {
      const leg = new THREE.Group();
      leg.position.set(side * 0.14, 0.72, 0);
      const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.36, 4, 8), pantsMat);
      thigh.position.y = -0.34;
      leg.add(thigh);
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.09, 0.28), whiteMat);
      shoe.position.set(0, -0.65, -0.05);
      leg.add(shoe);
      const sole = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.29), accentMat);
      sole.position.set(0, -0.7, -0.05);
      leg.add(sole);
      return leg;
    };
    const legL = buildLeg(-1);
    const legR = buildLeg(1);

    group.add(
      torso, jacketHem, waistband, chevron, head, hairBack, lockL, lockR,
      ponytail, hairTie, visorBand, visorBrim, armL, armR, legL, legR
    );
    this.shadowify(group);
    group.userData.legs = [legL, legR];
    group.userData.arms = [armL, armR];
    return group;
  }

  private buildAlienSlim(tintHex: string, accentHex: string): THREE.Group {
    const tint = new THREE.Color(tintHex);
    const accent = new THREE.Color(accentHex);
    const group = new THREE.Group();
    group.name = "AlienSlim";

    const bodyMat = new THREE.MeshStandardMaterial({ color: tint, roughness: 0.45, metalness: 0.2 });
    const glowMat = new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 2.0, roughness: 0.3 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x0e2a1c, roughness: 0.7 });

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.21, 0.72, 4, 12), bodyMat);
    torso.position.y = 1.08;

    // Rear spine lights — the back-view signature.
    const spineGeo = new THREE.SphereGeometry(0.045, 8, 6);
    for (let i = 0; i < 3; i++) {
      const node = new THREE.Mesh(spineGeo, glowMat);
      node.position.set(0, 0.9 + i * 0.18, 0.2);
      group.add(node);
    }
    // Glowing collar ring at the neck.
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.03, 8, 14), glowMat);
    collar.position.set(0, 1.44, -0.02);
    collar.rotation.x = Math.PI / 2;

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.31, 16, 12), bodyMat);
    head.position.set(0, 1.68, -0.02);
    head.scale.set(1, 1.18, 0.92);

    // Large alien eyes (front).
    const eyeGeo = new THREE.SphereGeometry(0.11, 12, 8);
    const eyeL = new THREE.Mesh(eyeGeo, glowMat);
    eyeL.position.set(-0.13, 1.68, -0.24);
    eyeL.scale.set(1, 1.3, 0.45);
    const eyeR = new THREE.Mesh(eyeGeo, glowMat);
    eyeR.position.set(0.13, 1.68, -0.24);
    eyeR.scale.set(1, 1.3, 0.45);

    // Swept-back head ridges — classic alien silhouette from behind.
    const ridgeGeo = new THREE.ConeGeometry(0.07, 0.3, 8);
    const ridgeL = new THREE.Mesh(ridgeGeo, bodyMat);
    ridgeL.position.set(-0.16, 1.78, 0.2);
    ridgeL.rotation.x = 1.9;
    ridgeL.rotation.z = 0.35;
    const ridgeR = new THREE.Mesh(ridgeGeo, bodyMat);
    ridgeR.position.set(0.16, 1.78, 0.2);
    ridgeR.rotation.x = 1.9;
    ridgeR.rotation.z = -0.35;

    // Antennae — thicker body-colored stalks, angled out, big glow tips.
    const buildAntenna = (side: -1 | 1): THREE.Group => {
      const ant = new THREE.Group();
      ant.position.set(side * 0.1, 1.92, 0);
      ant.rotation.z = side * -0.22;
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.28, 8), bodyMat);
      stalk.position.y = 0.14;
      ant.add(stalk);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), glowMat);
      tip.position.y = 0.31;
      ant.add(tip);
      return ant;
    };
    const antL = buildAntenna(-1);
    const antR = buildAntenna(1);

    // Arms pivot at the shoulder: slim limbs with glowing hands.
    const buildArm = (side: -1 | 1): THREE.Group => {
      const arm = new THREE.Group();
      arm.position.set(side * 0.32, 1.32, 0);
      const pad = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), glowMat);
      arm.add(pad);
      const limb = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.3, 4, 8), bodyMat);
      limb.position.y = -0.26;
      arm.add(limb);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), glowMat);
      hand.position.y = -0.48;
      arm.add(hand);
      // Extra elbow joint for the lanky look.
      const finger = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12, 6), glowMat);
      finger.position.y = -0.58;
      finger.rotation.x = Math.PI;
      arm.add(finger);
      return arm;
    };
    const armL = buildArm(-1);
    const armR = buildArm(1);

    // Legs pivot at the hip: mint thighs into dark scout boots.
    const buildLeg = (side: -1 | 1): THREE.Group => {
      const leg = new THREE.Group();
      leg.position.set(side * 0.13, 0.74, 0);
      const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.095, 0.3, 4, 8), bodyMat);
      thigh.position.y = -0.3;
      leg.add(thigh);
      const boot = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.1, 0.22, 10), darkMat);
      boot.position.set(0, -0.58, -0.02);
      leg.add(boot);
      const toe = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), glowMat);
      toe.position.set(0, -0.68, -0.06);
      toe.scale.set(1, 0.6, 1.3);
      leg.add(toe);
      return leg;
    };
    const legL = buildLeg(-1);
    const legR = buildLeg(1);

    const core = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), glowMat);
    core.position.set(0, 1.02, -0.19);

    group.add(
      torso, collar, head, eyeL, eyeR, ridgeL, ridgeR, antL, antR,
      armL, armR, legL, legR, core
    );
    this.shadowify(group);
    group.userData.legs = [legL, legR];
    group.userData.arms = [armL, armR];
    return group;
  }

  private buildAlienBrute(tintHex: string, accentHex: string): THREE.Group {
    const tint = new THREE.Color(tintHex);
    const accent = new THREE.Color(accentHex);
    const group = new THREE.Group();
    group.name = "AlienBrute";

    // Deep brick hide so the hot-red glow reads; charcoal joints for contrast.
    const bodyMat = new THREE.MeshStandardMaterial({ color: tint.clone().multiplyScalar(0.72), roughness: 0.62, metalness: 0.15 });
    const glowMat = new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 2.2, roughness: 0.4 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x201416, roughness: 0.8 });
    const boneMat = new THREE.MeshStandardMaterial({ color: 0xe8d9c0, roughness: 0.55 });

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.68, 0.42), bodyMat);
    torso.position.y = 1.06;

    const chestPlate = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.32, 0.06), glowMat);
    chestPlate.position.set(0, 1.1, -0.23);

    // Rear signature: dorsal spine plates + glowing back emblem.
    const plateGeo = new THREE.ConeGeometry(0.13, 0.26, 4);
    for (let i = 0; i < 3; i++) {
      const plate = new THREE.Mesh(plateGeo, darkMat);
      plate.position.set(0, 0.98 + i * 0.22, 0.24);
      plate.rotation.x = -0.35;
      plate.rotation.y = Math.PI / 4;
      group.add(plate);
    }
    // Glow strips flanking the plates, flat on the torso back.
    const stripGeo = new THREE.BoxGeometry(0.05, 0.62, 0.04);
    const stripL = new THREE.Mesh(stripGeo, glowMat);
    stripL.position.set(-0.22, 1.2, 0.22);
    group.add(stripL);
    const stripR = new THREE.Mesh(stripGeo, glowMat);
    stripR.position.set(0.22, 1.2, 0.22);
    group.add(stripR);
    const emblem = new THREE.Mesh(new THREE.OctahedronGeometry(0.09, 0), glowMat);
    emblem.position.set(0, 1.28, 0.22);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 10), bodyMat);
    head.position.set(0, 1.64, -0.02);
    // Rear skull plate.
    const skull = new THREE.Mesh(
      new THREE.SphereGeometry(0.29, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5),
      darkMat
    );
    skull.position.set(0, 1.66, 0.0);
    skull.rotation.x = Math.PI * 0.72;

    // Horns — larger, swept out-back, bone with glowing bases.
    const buildHorn = (side: -1 | 1): THREE.Group => {
      const horn = new THREE.Group();
      horn.position.set(side * 0.2, 1.8, -0.02);
      horn.rotation.z = side * -0.55;
      horn.rotation.x = 0.3;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.42, 8), boneMat);
      spike.position.y = 0.21;
      horn.add(spike);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.08, 10), glowMat);
      horn.add(base);
      return horn;
    };
    const hornL = buildHorn(-1);
    const hornR = buildHorn(1);

    const eyeGeo = new THREE.SphereGeometry(0.07, 10, 8);
    const eyeL = new THREE.Mesh(eyeGeo, glowMat);
    eyeL.position.set(-0.12, 1.62, -0.22);
    const eyeR = new THREE.Mesh(eyeGeo, glowMat);
    eyeR.position.set(0.12, 1.62, -0.22);

    // Spiked pauldrons with glowing rims.
    const buildPauldron = (side: -1 | 1): THREE.Mesh => {
      const p = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.24, 8), darkMat);
      p.position.set(side * 0.47, 1.44, 0);
      return p;
    };

    // Arms pivot at the shoulder: heavy upper + dark fist.
    const buildArm = (side: -1 | 1): THREE.Group => {
      const arm = new THREE.Group();
      arm.position.set(side * 0.46, 1.3, 0);
      const pauldron = buildPauldron(side);
      pauldron.position.set(0, 0.14, 0);
      arm.add(pauldron);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.025, 8, 12), glowMat);
      rim.position.y = 0.04;
      rim.rotation.x = Math.PI / 2;
      arm.add(rim);
      const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.22, 4, 8), bodyMat);
      upper.position.y = -0.2;
      arm.add(upper);
      const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.16, 4, 8), bodyMat);
      fore.position.y = -0.44;
      arm.add(fore);
      const fist = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.15, 0.16), darkMat);
      fist.position.y = -0.6;
      arm.add(fist);
      return arm;
    };
    const armL = buildArm(-1);
    const armR = buildArm(1);

    // Legs pivot at the hip: pillar thighs + rear knee spikes + stompy boots.
    const buildLeg = (side: -1 | 1): THREE.Group => {
      const leg = new THREE.Group();
      leg.position.set(side * 0.18, 0.72, 0);
      const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.155, 0.3, 4, 8), darkMat);
      thigh.position.y = -0.3;
      leg.add(thigh);
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 6), boneMat);
      spike.position.set(0, -0.34, 0.15);
      spike.rotation.x = 0.9;
      leg.add(spike);
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.13, 0.34), darkMat);
      boot.position.set(0, -0.635, -0.05);
      leg.add(boot);
      const crack = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.045, 0.05), glowMat);
      crack.position.set(0, -0.62, 0.12);
      leg.add(crack);
      return leg;
    };
    const legL = buildLeg(-1);
    const legR = buildLeg(1);

    group.add(torso, chestPlate, head, skull, hornL, hornR, eyeL, eyeR, armL, armR, legL, legR);
    this.shadowify(group);
    group.userData.legs = [legL, legR];
    group.userData.arms = [armL, armR];
    return group;
  }

  // -------------------------------------------------------- robot variants

  private buildEmberBot(tintHex: string, accentHex: string): THREE.Group {
    const tint = new THREE.Color(tintHex);
    const accent = new THREE.Color(accentHex);
    const group = new THREE.Group();
    group.name = "EmberBot";

    const hullMat = new THREE.MeshStandardMaterial({ color: 0x3a2418, roughness: 0.6, metalness: 0.3 });
    const plateMat = new THREE.MeshStandardMaterial({ color: tint, roughness: 0.5, metalness: 0.25 });
    const glowMat = new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 2.2, roughness: 0.35 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x1c100a, roughness: 0.85 });

    // Boxy heat-forged torso with side heat seams.
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.64, 0.38), hullMat);
    torso.position.y = 1.06;
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 0.06), glowMat);
    chest.position.set(0, 1.18, -0.22);
    const seamGeo = new THREE.BoxGeometry(0.03, 0.44, 0.3);
    const seamL = new THREE.Mesh(seamGeo, glowMat);
    seamL.position.set(-0.285, 1.04, 0);
    const seamR = new THREE.Mesh(seamGeo, glowMat);
    seamR.position.set(0.285, 1.04, 0);

    // Rear signature: glowing spine + exhaust vent slits (faces the camera).
    const spine = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.05), glowMat);
    spine.position.set(0, 1.08, 0.2);
    const ventSlatGeo = new THREE.BoxGeometry(0.34, 0.045, 0.04);
    for (let i = 0; i < 3; i++) {
      const slat = new THREE.Mesh(ventSlatGeo, glowMat);
      slat.position.set(0, 0.72 + i * 0.09, 0.2);
      group.add(slat);
    }
    const ventFrame = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.34, 0.03), darkMat);
    ventFrame.position.set(0, 0.81, 0.185);

    // Shoulder flame armor — larger cones + rear spikes.
    const flameGeo = new THREE.ConeGeometry(0.15, 0.34, 6);
    const flameL = new THREE.Mesh(flameGeo, glowMat);
    flameL.position.set(-0.4, 1.52, 0);
    const flameR = new THREE.Mesh(flameGeo, glowMat);
    flameR.position.set(0.4, 1.52, 0);
    const spikeGeo = new THREE.ConeGeometry(0.07, 0.22, 6);
    const spikeL = new THREE.Mesh(spikeGeo, plateMat);
    spikeL.position.set(-0.44, 1.4, 0.14);
    spikeL.rotation.x = 0.5;
    const spikeR = new THREE.Mesh(spikeGeo, plateMat);
    spikeR.position.set(0.44, 1.4, 0.14);
    spikeR.rotation.x = 0.5;
    const shoulderPlateGeo = new THREE.BoxGeometry(0.2, 0.15, 0.24);
    const shoulderL = new THREE.Mesh(shoulderPlateGeo, plateMat);
    shoulderL.position.set(-0.43, 1.34, 0);
    const shoulderR = new THREE.Mesh(shoulderPlateGeo, plateMat);
    shoulderR.position.set(0.43, 1.34, 0);

    // Head — helmet with visor blaze + glowing nape vent + crest.
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 12), hullMat);
    head.position.set(0, 1.62, -0.02);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.11, 0.16), glowMat);
    visor.position.set(0, 1.6, -0.2);
    const napeVent = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.09, 0.08), glowMat);
    napeVent.position.set(0, 1.56, 0.22);
    const crest = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.2, 0.14), glowMat);
    crest.position.set(0, 1.84, -0.04);

    // Back flame jets — brighter, angled out.
    const jetGeo = new THREE.ConeGeometry(0.09, 0.3, 6);
    const jetL = new THREE.Mesh(jetGeo, glowMat);
    jetL.position.set(-0.17, 1.02, 0.26);
    jetL.rotation.x = Math.PI * 0.72;
    jetL.rotation.z = 0.18;
    const jetR = new THREE.Mesh(jetGeo, glowMat);
    jetR.position.set(0.17, 1.02, 0.26);
    jetR.rotation.x = Math.PI * 0.72;
    jetR.rotation.z = -0.18;

    // Arms pivot at the shoulder: plated upper + glowing cuff + fist.
    const buildArm = (side: -1 | 1): THREE.Group => {
      const arm = new THREE.Group();
      arm.position.set(side * 0.43, 1.3, 0);
      const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.22, 4, 8), hullMat);
      upper.position.y = -0.2;
      arm.add(upper);
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.06, 10), glowMat);
      cuff.position.y = -0.36;
      arm.add(cuff);
      const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.14, 4, 8), hullMat);
      fore.position.y = -0.46;
      arm.add(fore);
      const fist = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.12, 0.13), plateMat);
      fist.position.y = -0.58;
      arm.add(fist);
      return arm;
    };
    const armL = buildArm(-1);
    const armR = buildArm(1);

    // Legs pivot at the hip: reinforced thigh + rear calf glow + heeled boot.
    const buildLeg = (side: -1 | 1): THREE.Group => {
      const leg = new THREE.Group();
      leg.position.set(side * 0.17, 0.72, 0);
      const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.32, 4, 8), hullMat);
      thigh.position.y = -0.32;
      leg.add(thigh);
      const calfGlow = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.26, 0.04), glowMat);
      calfGlow.position.set(0, -0.4, 0.12);
      leg.add(calfGlow);
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.3), darkMat);
      boot.position.set(0, -0.64, -0.04);
      leg.add(boot);
      const heel = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.06), glowMat);
      heel.position.set(0, -0.66, 0.12);
      leg.add(heel);
      return leg;
    };
    const legL = buildLeg(-1);
    const legR = buildLeg(1);

    group.add(
      torso, chest, seamL, seamR, spine, ventFrame,
      flameL, flameR, spikeL, spikeR, shoulderL, shoulderR,
      head, visor, napeVent, crest, jetL, jetR, armL, armR, legL, legR
    );
    this.shadowify(group);
    group.userData.legs = [legL, legR];
    group.userData.arms = [armL, armR];
    void tint;
    return group;
  }

  private buildWraithBot(tintHex: string, accentHex: string): THREE.Group {
    const tint = new THREE.Color(tintHex);
    const accent = new THREE.Color(accentHex);
    const group = new THREE.Group();
    group.name = "WraithBot";

    const shellMat = new THREE.MeshStandardMaterial({
      color: tint,
      emissive: accent,
      emissiveIntensity: 0.6,
      roughness: 0.28,
      metalness: 0.55,
    });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x241d3a, roughness: 0.6, metalness: 0.3 });
    const glowMat = new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 2.4, roughness: 0.3 });

    // Sleek capsule torso + rear phase-seam + waist glow ring.
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.68, 4, 12), shellMat);
    torso.position.y = 1.08;
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.52, 0.05), glowMat);
    seam.position.set(0, 1.06, 0.24);
    const waist = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.028, 8, 16), glowMat);
    waist.position.set(0, 0.78, 0);
    waist.rotation.x = Math.PI / 2;
    const core = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.26, 0.05), glowMat);
    core.position.set(0, 1.12, -0.22);

    // Floating shoulder plates — larger, higher, brighter.
    const buildPlate = (side: -1 | 1): THREE.Group => {
      const plate = new THREE.Group();
      plate.position.set(side * 0.46, 1.5, 0);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.06, 0.26), glowMat);
      blade.rotation.y = side * 0.4;
      plate.add(blade);
      const under = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.12), darkMat);
      under.position.y = -0.07;
      plate.add(under);
      return plate;
    };
    const plateL = buildPlate(-1);
    const plateR = buildPlate(1);

    // Head — elongated, slit visor, glowing nape rune, bright tilted halo.
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 12), shellMat);
    head.position.set(0, 1.64, -0.02);
    head.scale.set(0.95, 1.15, 0.95);
    const slit = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.045, 0.06), glowMat);
    slit.position.set(0, 1.64, -0.22);
    const rune = new THREE.Mesh(new THREE.OctahedronGeometry(0.06, 0), glowMat);
    rune.position.set(0, 1.6, 0.24);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.028, 8, 20), glowMat);
    halo.position.set(0, 1.94, -0.02);
    halo.rotation.x = Math.PI / 2 - 0.18;

    // Arms pivot at the shoulder: dark limbs, glowing claws + wristbands.
    const buildArm = (side: -1 | 1): THREE.Group => {
      const arm = new THREE.Group();
      arm.position.set(side * 0.4, 1.3, 0);
      const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.22, 4, 8), darkMat);
      upper.position.y = -0.2;
      arm.add(upper);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.05, 10), glowMat);
      band.position.y = -0.36;
      arm.add(band);
      const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.16, 4, 8), darkMat);
      fore.position.y = -0.47;
      arm.add(fore);
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 8), glowMat);
      claw.position.y = -0.63;
      claw.rotation.x = Math.PI;
      arm.add(claw);
      return arm;
    };
    const armL = buildArm(-1);
    const armR = buildArm(1);

    // Legs pivot at the hip: two-tone limbs ending in glowing hover claws.
    const buildLeg = (side: -1 | 1): THREE.Group => {
      const leg = new THREE.Group();
      leg.position.set(side * 0.15, 0.74, 0);
      const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.105, 0.3, 4, 8), darkMat);
      thigh.position.y = -0.3;
      leg.add(thigh);
      const anklet = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.05, 10), glowMat);
      anklet.position.y = -0.52;
      leg.add(anklet);
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.24, 8), darkMat);
      claw.position.set(0, -0.62, -0.03);
      claw.rotation.x = Math.PI;
      leg.add(claw);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), glowMat);
      tip.position.set(0, -0.695, -0.03);
      leg.add(tip);
      return leg;
    };
    const legL = buildLeg(-1);
    const legR = buildLeg(1);

    // Trailing ghost ribbon — brighter, wider, clearly visible from behind.
    const ribbon = new THREE.Mesh(
      new THREE.PlaneGeometry(0.4, 0.62),
      new THREE.MeshStandardMaterial({
        color: accent, emissive: accent, emissiveIntensity: 1.4,
        transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false,
      })
    );
    ribbon.position.set(0, 0.66, 0.26);
    ribbon.rotation.x = Math.PI * 0.14;

    group.add(
      torso, seam, waist, core, plateL, plateR, head, slit, rune, halo,
      armL, armR, legL, legR, ribbon
    );
    this.shadowify(group);
    group.userData.legs = [legL, legR];
    group.userData.arms = [armL, armR];
    void tint;
    return group;
  }

  private buildAuroraBot(tintHex: string, accentHex: string): THREE.Group {
    const tint = new THREE.Color(tintHex);
    const accent = new THREE.Color(accentHex);
    const group = new THREE.Group();
    group.name = "AuroraBot";

    const hullMat = new THREE.MeshStandardMaterial({ color: 0xe8f4f8, roughness: 0.45, metalness: 0.22 });
    const jointMat = new THREE.MeshStandardMaterial({ color: 0x8fa8b5, roughness: 0.55, metalness: 0.35 });
    const trimMat = new THREE.MeshStandardMaterial({ color: tint, roughness: 0.5, metalness: 0.3 });
    const iceMat = new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 2.0, roughness: 0.22 });
    const tankMat = new THREE.MeshStandardMaterial({ color: 0x0e2836, roughness: 0.6, metalness: 0.4 });

    // Frost torso + glowing waist ring.
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.27, 0.6, 4, 12), hullMat);
    torso.position.y = 1.06;
    const chestPlate = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.18, 0.05), iceMat);
    chestPlate.position.set(0, 1.15, -0.24);
    const waist = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.03, 8, 16), iceMat);
    waist.position.set(0, 0.74, 0);
    waist.rotation.x = Math.PI / 2;

    // Ice crystal shoulders — larger + brighter.
    const crystalGeo = new THREE.OctahedronGeometry(0.17, 0);
    const crystalL = new THREE.Mesh(crystalGeo, iceMat);
    crystalL.position.set(-0.46, 1.42, 0);
    crystalL.rotation.y = 0.6;
    const crystalR = new THREE.Mesh(crystalGeo, iceMat);
    crystalR.position.set(0.46, 1.42, 0);
    crystalR.rotation.y = -0.6;
    // Signature back crystal cluster between the shoulders.
    const clusterGeo = new THREE.OctahedronGeometry(0.11, 0);
    const clusterC = new THREE.Mesh(clusterGeo, iceMat);
    clusterC.position.set(0, 1.44, 0.2);
    const clusterL = new THREE.Mesh(new THREE.OctahedronGeometry(0.07, 0), iceMat);
    clusterL.position.set(-0.12, 1.34, 0.2);
    clusterL.rotation.y = 0.5;
    const clusterR = new THREE.Mesh(new THREE.OctahedronGeometry(0.07, 0), iceMat);
    clusterR.position.set(0.12, 1.34, 0.2);
    clusterR.rotation.y = -0.5;

    // Head — cryo helmet with glowing rear frost vent.
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 12), hullMat);
    head.position.set(0, 1.62, -0.02);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.09, 0.12), iceMat);
    visor.position.set(0, 1.6, -0.2);
    const napeVent = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.07, 0.06), iceMat);
    napeVent.position.set(0, 1.56, 0.22);
    const frostCrest = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.22, 6), iceMat);
    frostCrest.position.set(0, 1.86, -0.02);

    // Back cryo tank — dark shell so the cyan core pops from behind.
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.36, 12), tankMat);
    tank.position.set(0, 1.0, 0.26);
    tank.rotation.x = Math.PI / 2;
    const tankCore = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.045, 0.32), iceMat);
    tankCore.position.set(0, 1.125, 0.26);
    const tankCap = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.05, 12), trimMat);
    tankCap.position.set(0, 1.0, 0.45);
    tankCap.rotation.x = Math.PI / 2;

    // Arms pivot at the shoulder: armored upper + joint + mitt.
    const buildArm = (side: -1 | 1): THREE.Group => {
      const arm = new THREE.Group();
      arm.position.set(side * 0.4, 1.3, 0);
      const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.2, 4, 8), hullMat);
      upper.position.y = -0.2;
      arm.add(upper);
      const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), jointMat);
      elbow.position.y = -0.36;
      arm.add(elbow);
      const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.14, 4, 8), hullMat);
      fore.position.y = -0.47;
      arm.add(fore);
      const mitt = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), trimMat);
      mitt.position.y = -0.6;
      arm.add(mitt);
      return arm;
    };
    const armL = buildArm(-1);
    const armR = buildArm(1);

    // Legs pivot at the hip: armored thigh + rear calf glow + frost boot.
    const buildLeg = (side: -1 | 1): THREE.Group => {
      const leg = new THREE.Group();
      leg.position.set(side * 0.16, 0.72, 0);
      const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.32, 4, 8), hullMat);
      thigh.position.y = -0.32;
      leg.add(thigh);
      const calfGlow = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.24, 0.04), iceMat);
      calfGlow.position.set(0, -0.42, 0.11);
      leg.add(calfGlow);
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.11, 0.28), jointMat);
      boot.position.set(0, -0.635, -0.04);
      leg.add(boot);
      const heel = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.05, 0.06), iceMat);
      heel.position.set(0, -0.655, 0.11);
      leg.add(heel);
      return leg;
    };
    const legL = buildLeg(-1);
    const legR = buildLeg(1);

    group.add(
      torso, chestPlate, waist, crystalL, crystalR, clusterC, clusterL, clusterR,
      head, visor, napeVent, frostCrest, tank, tankCore, tankCap, armL, armR, legL, legR
    );
    this.shadowify(group);
    group.userData.legs = [legL, legR];
    group.userData.arms = [armL, armR];
    return group;
  }

  private buildFallbackBotTinted(_tintHex: string, _accentHex: string): THREE.Group {
    // Reuse the original fallback but tinted — used when robot archetype requested
    // before GLB load and we want to reflect palette.
    const g = this.buildFallbackBot();
    this.applyTintToObject(g, _tintHex, _accentHex);
    return g;
  }

  private buildRocketPack(): THREE.Group {
    const pack = new THREE.Group();
    pack.name = "RocketPack";

    const metalMat = new THREE.MeshStandardMaterial({ color: 0xd0d6de, roughness: 0.32, metalness: 0.45 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x2a3440, roughness: 0.55, metalness: 0.3 });
    const accentMat = new THREE.MeshStandardMaterial({ color: 0xe31902, emissive: 0xe31902, emissiveIntensity: 0.6, roughness: 0.4 });
    const flameMat = new THREE.MeshBasicMaterial({
      color: 0xff9a1a,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    // Main backpack body — centered behind torso
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.42, 0.13), metalMat);
    body.position.set(0, 0, 0);
    body.castShadow = true;
    pack.add(body);

    // Red stripe
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.08, 0.135), accentMat);
    stripe.position.set(0, 0.08, 0.005);
    pack.add(stripe);

    // Side thrusters
    const nozzleGeo = new THREE.CylinderGeometry(0.07, 0.085, 0.18, 12);
    const nozzleL = new THREE.Mesh(nozzleGeo, darkMat);
    nozzleL.position.set(-0.11, -0.22, 0.02);
    nozzleL.castShadow = true;
    pack.add(nozzleL);
    const nozzleR = new THREE.Mesh(nozzleGeo, darkMat);
    nozzleR.position.set(0.11, -0.22, 0.02);
    nozzleR.castShadow = true;
    pack.add(nozzleR);

    // Nozzle rims
    const rimGeo = new THREE.TorusGeometry(0.07, 0.012, 8, 14);
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xfdd013, emissive: 0xfdd013, emissiveIntensity: 0.7 });
    const rimL = new THREE.Mesh(rimGeo, rimMat);
    rimL.position.set(-0.11, -0.31, 0.02);
    rimL.rotation.x = Math.PI / 2;
    pack.add(rimL);
    const rimR = new THREE.Mesh(rimGeo, rimMat);
    rimR.position.set(0.11, -0.31, 0.02);
    rimR.rotation.x = Math.PI / 2;
    pack.add(rimR);

    // Flames
    const flameGeo = new THREE.ConeGeometry(0.075, 0.32, 12);
    const flameL = new THREE.Mesh(flameGeo, flameMat);
    flameL.name = "rocketFlameL";
    flameL.position.set(-0.11, -0.44, 0.02);
    flameL.rotation.x = Math.PI;
    pack.add(flameL);
    const flameR = new THREE.Mesh(flameGeo, flameMat.clone());
    flameR.name = "rocketFlameR";
    flameR.position.set(0.11, -0.44, 0.02);
    flameR.rotation.x = Math.PI;
    pack.add(flameR);

    // Store flames for animation
    pack.userData.flameL = flameL;
    pack.userData.flameR = flameR;

    // Position behind character's back (standing)
    pack.position.set(0, 1.02, 0.26);
    return pack;
  }

  /** Eases a procedural rig's crouch scale back to upright (slide-cancel). */
  private relaxProceduralScale(group: THREE.Group, delta: number): void {
    const s = group.scale;
    s.x = damp(s.x, 1, 11, delta);
    s.y = damp(s.y, 1, 11, delta);
    s.z = damp(s.z, 1, 11, delta);
  }

  private animateProcedural(delta: number): void {
    const active = this.currentArchetype === "robot"
      ? (this.usingFallback ? this.fallbackBot : null)
      : this.archetypeGroup;

    // Fallback robot before GLB load also animates via this path.
    const group: THREE.Group | null = active ?? (this.usingFallback ? this.fallbackBot : this.archetypeGroup);
    if (!group) return;
    const legs = group.userData.legs as THREE.Mesh[] | undefined;
    const arms = group.userData.arms as THREE.Mesh[] | undefined;
    // Rocket flight — lay straight like sleeping/superman, no swing
    if (this.rocketFlying && legs) {
      this.relaxProceduralScale(group, delta);
      legs[0].rotation.x = 0.05;
      legs[1].rotation.x = 0.05;
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
      if (arms && arms.length >= 2) {
        // Arms thrown up-back (classic jump silhouette from the rear camera).
        arms[0].rotation.x = -2.2;
        arms[1].rotation.x = -2.2;
        arms[0].rotation.z = -0.25;
        arms[1].rotation.z = 0.25;
      }
    } else if (this.sliding) {
      // Subway-style baseball slide ON the track surface: crouch low via
      // scale (feet stay planted at y=0), legs extended forward (-Z),
      // arms swept back/out for balance. Nothing goes below y=0.
      group.position.y = 0;
      group.scale.set(1.05, 0.62, 1.05);
      if (legs) {
        // Limbs pivot at hip/shoulder joints now: a smaller angle already
        // throws the feet well forward without floating them off the track.
        legs[0].rotation.x = 0.55;
        legs[1].rotation.x = 0.55;
        legs[0].position.z = -0.1;
        legs[1].position.z = -0.1;
      }
      if (arms) {
        arms[0].rotation.x = -0.85;
        arms[1].rotation.x = -0.85;
        arms[0].rotation.z = -0.45;
        arms[1].rotation.z = 0.45;
      }
    } else {
      group.scale.set(1, 1, 1);
      if (legs) {
        legs[0].position.z = 0;
        legs[1].position.z = 0;
      }
      if (arms && arms.length >= 2) {
        arms[0].rotation.z = 0;
        arms[1].rotation.z = 0;
      }
      group.position.y = 0;
    }
  }

  // -------------------------------------------------------- fallback visuals (original)

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

  private disposeGroup(group: THREE.Group): void {
    group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat?.dispose();
    });
  }

  /** @deprecated use disposeGroup */
  private disposeFallback(bot: THREE.Group): void {
    this.disposeGroup(bot);
  }
}
