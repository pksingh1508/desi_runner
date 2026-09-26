import * as THREE from "three";
import type { Player } from "@/game/player/Player";
import type { MenuFocus } from "@/types/game";
import { CAMERA_CFG, MENU_CAMERA } from "@/game/config/gameplay";
import { clamp, damp, lerp } from "@/game/utils/math";

/** Shortest-path angular damping. */
function dampAngle(current: number, target: number, lambda: number, delta: number): number {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * (1 - Math.exp(-lambda * delta));
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Third-person runner camera: smoothed follow, subtle run bob, lane-change
 * lean, jump response, speed-driven FOV and short impact shakes. V2 adds a
 * boostable FOV channel (turbo/overdrive) and tiny directional impulses.
 *
 * Menu: a showcase orbit in FRONT of the runner (their face to camera), with
 * a projection view-offset that frames them beside the UI; GEAR zooms in.
 * Starting a run swoops around the runner into the chase view.
 * Gameplay readability always wins.
 */
export class CameraRig {
  private lookTarget = new THREE.Vector3();
  private baseY = CAMERA_CFG.offset.y;
  private shake = 0;
  private time = 0;
  private fovBoost = 0;
  /** Smoothed FOV boost target — turbo/overdrive ramp this up. */
  private targetFovBoost = 0;
  /** Settings gate: screen shake can be disabled without losing feedback. */
  shakeEnabled = true;
  private impulseX = 0;

  // Orbit state around the runner (phi 0 = behind, PI = in front).
  private phi = 0;
  private radius: number = CAMERA_CFG.offset.z;
  private height: number = CAMERA_CFG.offset.y;
  private orbitLookY = 1.05;
  private menuFocus: MenuFocus = "home";
  /** 0 → 1 while swooping from the showcase into the chase view. */
  private runBlend = 1;
  private swoopFrom = { phi: 0, radius: 0, height: 0, lookY: 0, x: 0 };
  private swoopLook = new THREE.Vector3();
  private chaseLook = new THREE.Vector3();
  /** View offset as a fraction of the viewport (+x → runner shifts right). */
  private offsetX = 0;
  private offsetY = 0;
  private offsetApplied = false;

  constructor(private camera: THREE.PerspectiveCamera) {}

  addShake(amount: number): void {
    if (!this.shakeEnabled) return;
    this.shake = Math.min(this.shake + amount, CAMERA_CFG.shakeAmpOnHit);
  }

  /** Tiny directional kick (e.g. near-miss whoosh). Fades immediately. */
  addImpulse(x: number): void {
    if (!this.shakeEnabled) return;
    this.impulseX += x;
  }

  setFovBoost(target: number): void {
    this.targetFovBoost = target;
  }

  setMenuFocus(focus: MenuFocus): void {
    this.menuFocus = focus;
  }

  /** Called as a run starts: swoop from wherever the camera is to the chase view. */
  beginRunTransition(playerX: number): void {
    this.syncOrbitFromCamera(playerX);
    this.swoopFrom.phi = this.phi;
    this.swoopFrom.radius = this.radius;
    this.swoopFrom.height = this.height;
    this.swoopFrom.lookY = this.orbitLookY;
    this.swoopFrom.x = playerX;
    this.runBlend = 0;
  }

  /** Menu showcase framing in front of the runner. */
  updateMenu(delta: number, playerX: number): void {
    this.time += delta;
    const cfg = this.menuFocus === "gear" ? MENU_CAMERA.gear : this.menuFocus === "home" ? MENU_CAMERA.home : MENU_CAMERA.panel;
    const targetPhi = Math.PI - (cfg.angle + Math.sin(this.time * 0.25) * cfg.sway);
    const lambda = MENU_CAMERA.orbitDamp;
    this.phi = dampAngle(this.phi, targetPhi, lambda, delta);
    const radius = cfg.radius * (1 + (MENU_CAMERA.portraitRadiusScale - 1) * this.portraitFactor());
    this.radius = damp(this.radius, radius, lambda, delta);
    this.height = damp(this.height, cfg.height + Math.sin(this.time * 0.4) * 0.05, lambda, delta);
    this.orbitLookY = damp(this.orbitLookY, cfg.lookY, lambda, delta);
    this.placeOnOrbit(playerX);
    this.lookTarget.set(playerX, this.orbitLookY, 0);
    this.camera.lookAt(this.lookTarget);

    // Frame the runner beside the UI (right on landscape, higher on portrait).
    // Matches the UI breakpoint: column layout above 1:1, bottom sheet at/below.
    const landscape = this.camera.aspect > 1;
    this.offsetX = damp(this.offsetX, landscape ? MENU_CAMERA.landscapeShiftX : 0, 3, delta);
    this.offsetY = damp(this.offsetY, landscape ? 0 : MENU_CAMERA.portraitShiftY, 3, delta);
    this.applyViewOffset();

    this.fovTowards(cfg.fov, delta, 3);
    this.applyImpulse(delta);
    this.applyShake(delta);
  }

  updatePlaying(delta: number, player: Player, speedRatio: number, groundedBobEnabled: boolean): void {
    this.time += delta;

    const bob =
      groundedBobEnabled && player.isGrounded && !player.isSliding
        ? Math.sin(player.runCyclePhase * CAMERA_CFG.bobFrequencyPerUnit) * CAMERA_CFG.bobAmplitude
        : 0;

    const portrait = this.portraitFactor();
    const chaseZ = CAMERA_CFG.offset.z + CAMERA_CFG.portraitExtraZ * portrait;
    const desiredX = player.positionX * CAMERA_CFG.lateralFollow;
    const desiredY =
      this.baseY + CAMERA_CFG.portraitExtraY * portrait + player.positionY * CAMERA_CFG.jumpFollow + bob;
    this.chaseLook.set(
      player.positionX * 0.6,
      CAMERA_CFG.lookOffset.y + player.positionY * 0.45,
      CAMERA_CFG.lookOffset.z
    );
    const cam = this.camera.position;

    if (this.runBlend < 1) {
      // Countdown swoop: orbit from the showcase angle around to behind.
      this.runBlend = Math.min(1, this.runBlend + delta / MENU_CAMERA.swoopSeconds);
      const e = easeInOutCubic(this.runBlend);
      const from = this.swoopFrom;
      this.phi = lerp(from.phi, 0, e);
      this.radius = lerp(from.radius, chaseZ, e);
      this.height = lerp(from.height, desiredY, e);
      const centerX = lerp(from.x, desiredX, e);
      cam.set(centerX + Math.sin(this.phi) * this.radius, this.height, Math.cos(this.phi) * this.radius);
      this.swoopLook.set(player.positionX, lerp(from.lookY, this.chaseLook.y, e), 0);
      this.lookTarget.copy(this.swoopLook).lerp(this.chaseLook, e * e);
      this.camera.lookAt(this.lookTarget);
    } else {
      cam.x = damp(cam.x, desiredX, CAMERA_CFG.positionDamp, delta);
      cam.y = damp(cam.y, desiredY, CAMERA_CFG.positionDamp, delta);
      cam.z = damp(cam.z, chaseZ, CAMERA_CFG.positionDamp, delta);
      this.lookTarget.copy(this.chaseLook);
      this.camera.lookAt(this.lookTarget);
      this.syncOrbitFromCamera(player.positionX);
    }

    // Release the showcase framing.
    this.offsetX = damp(this.offsetX, 0, 4, delta);
    this.offsetY = damp(this.offsetY, 0, 4, delta);
    this.applyViewOffset();

    this.fovBoost = damp(this.fovBoost, this.targetFovBoost, 3.4, delta);
    const targetFov =
      lerp(CAMERA_CFG.fovNormal, CAMERA_CFG.fovMax, speedRatio) + this.fovBoost + CAMERA_CFG.portraitExtraFov * portrait;
    this.fovTowards(targetFov, delta, this.runBlend < 1 ? 3 : CAMERA_CFG.fovDamp);
    this.applyImpulse(delta);
    this.applyShake(delta);
  }

  /** 0 on landscape (aspect ≥ 1) → 1 on tall phones (aspect ≤ 0.5). */
  private portraitFactor(): number {
    return clamp((1 - this.camera.aspect) / 0.5, 0, 1);
  }

  private placeOnOrbit(centerX: number): void {
    this.camera.position.set(
      centerX + Math.sin(this.phi) * this.radius,
      this.height,
      Math.cos(this.phi) * this.radius
    );
  }

  /** Derive orbit parameters from the current camera position. */
  private syncOrbitFromCamera(centerX: number): void {
    const p = this.camera.position;
    const dx = p.x - centerX;
    this.phi = Math.atan2(dx, p.z);
    this.radius = Math.max(1.5, Math.sqrt(dx * dx + p.z * p.z));
    this.height = p.y;
    this.orbitLookY = clamp(this.lookTarget.y, 0.6, 3);
  }

  private applyViewOffset(): void {
    const active = Math.abs(this.offsetX) > 0.001 || Math.abs(this.offsetY) > 0.001;
    if (!active) {
      if (this.offsetApplied) {
        this.camera.clearViewOffset();
        this.offsetApplied = false;
      }
      return;
    }
    const height = 1000;
    const width = height * this.camera.aspect;
    this.camera.setViewOffset(width, height, -this.offsetX * width, this.offsetY * height, width, height);
    this.offsetApplied = true;
  }

  private fovTowards(value: number, delta: number, lambda: number): void {
    const fov = this.camera.fov;
    const next = damp(fov, value, lambda, delta);
    if (Math.abs(next - fov) > 0.001) {
      this.camera.fov = clamp(next, 30, 100);
      this.camera.updateProjectionMatrix();
    }
  }

  private applyImpulse(delta: number): void {
    if (Math.abs(this.impulseX) < 0.001) {
      this.impulseX = 0;
      return;
    }
    this.camera.position.x += this.impulseX;
    this.impulseX = damp(this.impulseX, 0, 9, delta);
  }

  private applyShake(delta: number): void {
    if (this.shake <= 0.001) {
      this.shake = 0;
      return;
    }
    this.shake = Math.max(0, this.shake - CAMERA_CFG.shakeDecay * delta * this.shake - 0.01 * delta);
    const amp = this.shake;
    this.camera.position.x += (Math.random() - 0.5) * amp;
    this.camera.position.y += (Math.random() - 0.5) * amp;
  }
}
