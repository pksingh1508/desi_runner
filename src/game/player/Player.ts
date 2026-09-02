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

    this.animateProcedural();

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

  // -------------------------------------------------------- archetype visuals

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

    const jacketMat = new THREE.MeshStandardMaterial({ color: tint, roughness: 0.65, metalness: 0.18 });
    const accentMat = new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 1.2, roughness: 0.45 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xf0c8a8, roughness: 0.7 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: 0x22345a, roughness: 0.8 });
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.58, 4, 12), jacketMat);
    torso.position.y = 1.02;
    torso.castShadow = true;

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 10), skinMat);
    head.position.set(0, 1.58, -0.02);
    head.castShadow = true;

    const capTop = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.08, 12), accentMat);
    capTop.position.set(0, 1.78, -0.02);
    const capBrim = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.04, 0.22), accentMat);
    capBrim.position.set(0, 1.72, -0.2);

    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.08, 0.08), new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.2 }));
    visor.position.set(0, 1.5, -0.2);

    const shoulderGeo = new THREE.SphereGeometry(0.11, 10, 8);
    const leftShoulder = new THREE.Mesh(shoulderGeo, jacketMat);
    leftShoulder.position.set(-0.38, 1.32, 0);
    const rightShoulder = new THREE.Mesh(shoulderGeo, jacketMat);
    rightShoulder.position.set(0.38, 1.32, 0);

    const armGeo = new THREE.CapsuleGeometry(0.08, 0.28, 4, 8);
    const armL = new THREE.Mesh(armGeo, skinMat);
    armL.position.set(-0.38, 1.05, 0);
    const armR = new THREE.Mesh(armGeo, skinMat);
    armR.position.set(0.38, 1.05, 0);

    const legGeo = new THREE.CapsuleGeometry(0.12, 0.42, 4, 8);
    const legL = new THREE.Mesh(legGeo, pantsMat);
    legL.position.set(-0.16, 0.32, 0);
    legL.castShadow = true;
    const legR = new THREE.Mesh(legGeo, pantsMat);
    legR.position.set(0.16, 0.32, 0);
    legR.castShadow = true;

    const shoeGeo = new THREE.BoxGeometry(0.16, 0.09, 0.24);
    const shoeL = new THREE.Mesh(shoeGeo, shoeMat);
    shoeL.position.set(-0.16, 0.07, -0.04);
    const shoeR = new THREE.Mesh(shoeGeo, shoeMat);
    shoeR.position.set(0.16, 0.07, -0.04);

    // Small backpack / hood detail using accent
    const hood = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.05, 8, 14, Math.PI), accentMat);
    hood.position.set(0, 1.22, 0.18);
    hood.rotation.x = Math.PI * 0.15;

    group.add(torso, head, capTop, capBrim, visor, leftShoulder, rightShoulder, armL, armR, legL, legR, shoeL, shoeR, hood);
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
    const accentMat = new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 1.1, roughness: 0.45 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xf5d0b8, roughness: 0.68 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: 0x1d2a44, roughness: 0.8 });
    const hairMat = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.6, emissive: accent, emissiveIntensity: 0.35 });

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.58, 4, 12), topMat);
    torso.position.y = 1.04;
    torso.castShadow = true;

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 10), skinMat);
    head.position.set(0, 1.56, -0.02);
    head.castShadow = true;

    // Hair ponytail
    const ponytail = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.42, 10), hairMat);
    ponytail.position.set(0, 1.56, 0.22);
    ponytail.rotation.x = -0.35;
    const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat);
    hairCap.position.set(0, 1.66, -0.02);
    hairCap.rotation.x = Math.PI;

    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.07, 0.06), accentMat);
    visor.position.set(0, 1.52, -0.18);

    const shoulderGeo = new THREE.SphereGeometry(0.09, 10, 8);
    const leftShoulder = new THREE.Mesh(shoulderGeo, topMat);
    leftShoulder.position.set(-0.34, 1.32, 0);
    const rightShoulder = new THREE.Mesh(shoulderGeo, topMat);
    rightShoulder.position.set(0.34, 1.32, 0);

    const armGeo = new THREE.CapsuleGeometry(0.07, 0.26, 4, 8);
    const armL = new THREE.Mesh(armGeo, skinMat);
    armL.position.set(-0.34, 1.04, 0);
    const armR = new THREE.Mesh(armGeo, skinMat);
    armR.position.set(0.34, 1.04, 0);

    const legGeo = new THREE.CapsuleGeometry(0.1, 0.44, 4, 8);
    const legL = new THREE.Mesh(legGeo, pantsMat);
    legL.position.set(-0.14, 0.34, 0);
    legL.castShadow = true;
    const legR = new THREE.Mesh(legGeo, pantsMat);
    legR.position.set(0.14, 0.34, 0);
    legR.castShadow = true;

    const shoeGeo = new THREE.BoxGeometry(0.14, 0.08, 0.22);
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
    const shoeL = new THREE.Mesh(shoeGeo, shoeMat);
    shoeL.position.set(-0.14, 0.07, -0.03);
    const shoeR = new THREE.Mesh(shoeGeo, shoeMat);
    shoeR.position.set(0.14, 0.07, -0.03);

    // Belt accent
    const belt = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.03, 8, 16), accentMat);
    belt.position.set(0, 0.82, 0);
    belt.rotation.x = Math.PI / 2;

    group.add(torso, head, ponytail, hairCap, visor, leftShoulder, rightShoulder, armL, armR, legL, legR, shoeL, shoeR, belt);
    group.userData.legs = [legL, legR];
    group.userData.arms = [armL, armR];
    return group;
  }

  private buildAlienSlim(tintHex: string, accentHex: string): THREE.Group {
    const tint = new THREE.Color(tintHex);
    const accent = new THREE.Color(accentHex);
    const group = new THREE.Group();
    group.name = "AlienSlim";

    const bodyMat = new THREE.MeshStandardMaterial({ color: tint, roughness: 0.5, metalness: 0.25 });
    const glowMat = new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 1.6, roughness: 0.3 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x0c1a14, roughness: 0.75 });

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.21, 0.72, 4, 12), bodyMat);
    torso.position.y = 1.08;
    torso.castShadow = true;

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.31, 14, 10), bodyMat);
    head.position.set(0, 1.68, -0.02);
    head.scale.set(1, 1.18, 0.92);
    head.castShadow = true;

    // Large alien eyes
    const eyeGeo = new THREE.SphereGeometry(0.11, 10, 8);
    const eyeL = new THREE.Mesh(eyeGeo, glowMat);
    eyeL.position.set(-0.13, 1.68, -0.24);
    eyeL.scale.set(1, 1.3, 0.45);
    const eyeR = new THREE.Mesh(eyeGeo, glowMat);
    eyeR.position.set(0.13, 1.68, -0.24);
    eyeR.scale.set(1, 1.3, 0.45);

    // Antennae
    const stalkGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.38, 6);
    const stalkL = new THREE.Mesh(stalkGeo, darkMat);
    stalkL.position.set(-0.12, 1.96, 0);
    const stalkR = new THREE.Mesh(stalkGeo, darkMat);
    stalkR.position.set(0.12, 1.96, 0);
    const tipGeo = new THREE.SphereGeometry(0.06, 8, 6);
    const tipL = new THREE.Mesh(tipGeo, glowMat);
    tipL.position.set(-0.12, 2.16, 0);
    const tipR = new THREE.Mesh(tipGeo, glowMat);
    tipR.position.set(0.12, 2.16, 0);

    const shoulderGeo = new THREE.SphereGeometry(0.09, 10, 8);
    const leftShoulder = new THREE.Mesh(shoulderGeo, glowMat);
    leftShoulder.position.set(-0.33, 1.34, 0);
    const rightShoulder = new THREE.Mesh(shoulderGeo, glowMat);
    rightShoulder.position.set(0.33, 1.34, 0);

    const armGeo = new THREE.CapsuleGeometry(0.06, 0.32, 4, 8);
    const armL = new THREE.Mesh(armGeo, bodyMat);
    armL.position.set(-0.33, 1.06, 0);
    const armR = new THREE.Mesh(armGeo, bodyMat);
    armR.position.set(0.33, 1.06, 0);

    const legGeo = new THREE.CapsuleGeometry(0.09, 0.48, 4, 8);
    const legL = new THREE.Mesh(legGeo, darkMat);
    legL.position.set(-0.13, 0.34, 0);
    legL.castShadow = true;
    const legR = new THREE.Mesh(legGeo, darkMat);
    legR.position.set(0.13, 0.34, 0);
    legR.castShadow = true;

    const core = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), glowMat);
    core.position.set(0, 1.02, -0.2);

    group.add(torso, head, eyeL, eyeR, stalkL, stalkR, tipL, tipR, leftShoulder, rightShoulder, armL, armR, legL, legR, core);
    group.userData.legs = [legL, legR];
    group.userData.arms = [armL, armR];
    return group;
  }

  private buildAlienBrute(tintHex: string, accentHex: string): THREE.Group {
    const tint = new THREE.Color(tintHex);
    const accent = new THREE.Color(accentHex);
    const group = new THREE.Group();
    group.name = "AlienBrute";

    const bodyMat = new THREE.MeshStandardMaterial({ color: tint, roughness: 0.6, metalness: 0.2 });
    const hornMat = new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.9, roughness: 0.5 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x1a1214, roughness: 0.8 });

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.68, 0.42), bodyMat);
    torso.position.y = 1.06;
    torso.castShadow = true;

    const chestPlate = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.32, 0.06), hornMat);
    chestPlate.position.set(0, 1.1, -0.23);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), bodyMat);
    head.position.set(0, 1.64, -0.02);
    head.castShadow = true;

    const hornGeo = new THREE.ConeGeometry(0.08, 0.28, 8);
    const hornL = new THREE.Mesh(hornGeo, hornMat);
    hornL.position.set(-0.2, 1.82, -0.04);
    hornL.rotation.z = 0.35;
    const hornR = new THREE.Mesh(hornGeo, hornMat);
    hornR.position.set(0.2, 1.82, -0.04);
    hornR.rotation.z = -0.35;

    const eyeGeo = new THREE.SphereGeometry(0.07, 8, 6);
    const eyeMat = new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 1.8 });
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-0.12, 1.62, -0.22);
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    eyeR.position.set(0.12, 1.62, -0.22);

    const shoulderGeo = new THREE.SphereGeometry(0.16, 10, 8);
    const leftShoulder = new THREE.Mesh(shoulderGeo, darkMat);
    leftShoulder.position.set(-0.46, 1.34, 0);
    const rightShoulder = new THREE.Mesh(shoulderGeo, darkMat);
    rightShoulder.position.set(0.46, 1.34, 0);

    const armGeo = new THREE.CapsuleGeometry(0.11, 0.3, 4, 8);
    const armL = new THREE.Mesh(armGeo, bodyMat);
    armL.position.set(-0.46, 1.02, 0);
    const armR = new THREE.Mesh(armGeo, bodyMat);
    armR.position.set(0.46, 1.02, 0);

    const legGeo = new THREE.CapsuleGeometry(0.15, 0.4, 4, 8);
    const legL = new THREE.Mesh(legGeo, darkMat);
    legL.position.set(-0.18, 0.3, 0);
    legL.castShadow = true;
    const legR = new THREE.Mesh(legGeo, darkMat);
    legR.position.set(0.18, 0.3, 0);
    legR.castShadow = true;

    const kneeGeo = new THREE.SphereGeometry(0.1, 8, 6);
    const kneeL = new THREE.Mesh(kneeGeo, hornMat);
    kneeL.position.set(-0.18, 0.22, -0.12);
    const kneeR = new THREE.Mesh(kneeGeo, hornMat);
    kneeR.position.set(0.18, 0.22, -0.12);

    group.add(torso, chestPlate, head, hornL, hornR, eyeL, eyeR, leftShoulder, rightShoulder, armL, armR, legL, legR, kneeL, kneeR);
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

  private animateProcedural(): void {
    const active = this.currentArchetype === "robot"
      ? (this.usingFallback ? this.fallbackBot : null)
      : this.archetypeGroup;

    // Fallback robot before GLB load also animates via this path.
    const group: THREE.Group | null = active ?? (this.usingFallback ? this.fallbackBot : this.archetypeGroup);
    if (!group) return;
    const legs = group.userData.legs as THREE.Mesh[] | undefined;
    const arms = group.userData.arms as THREE.Mesh[] | undefined;
    if (this.grounded && !this.sliding && legs) {
      const swing = Math.sin(this.runPhase * 2.4);
      legs[0].rotation.x = swing * 0.9;
      legs[1].rotation.x = -swing * 0.9;
      if (arms && arms.length >= 2) {
        arms[0].rotation.x = -swing * 0.7;
        arms[1].rotation.x = swing * 0.7;
      }
      group.position.y = Math.abs(Math.cos(this.runPhase * 2.4)) * 0.06;
    } else if (!this.grounded && legs) {
      legs[0].rotation.x = 0.5;
      legs[1].rotation.x = -0.35;
      if (arms && arms.length >= 2) {
        arms[0].rotation.x = 0.8;
        arms[1].rotation.x = 0.8;
      }
    } else if (this.sliding) {
      group.position.y = -0.04;
    } else {
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
