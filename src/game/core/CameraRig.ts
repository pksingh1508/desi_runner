import * as THREE from "three";
import type { Player } from "@/game/player/Player";
import { CAMERA_CFG } from "@/game/config/gameplay";
import { clamp, damp, lerp } from "@/game/utils/math";

/**
 * Third-person runner camera: smoothed follow, subtle run bob, lane-change
 * lean, jump response, speed-driven FOV and short impact shakes.
 * Gameplay readability always wins over cinematic motion.
 */
export class CameraRig {
  private lookTarget = new THREE.Vector3();
  private baseY = CAMERA_CFG.offset.y;
  private shake = 0;
  private time = 0;

  constructor(private camera: THREE.PerspectiveCamera) {}

  addShake(amount: number): void {
    this.shake = Math.min(this.shake + amount, CAMERA_CFG.shakeAmpOnHit);
  }

  /** Menu framing: gentle lateral drift to make the title screen feel alive. */
  updateMenu(delta: number): void {
    this.time += delta;
    const targetX = Math.sin(this.time * 0.22) * 1.6;
    this.camera.position.x = damp(this.camera.position.x, targetX, 2, delta);
    this.camera.position.y = damp(this.camera.position.y, this.baseY + 0.7, 2, delta);
    this.camera.position.z = damp(this.camera.position.z, CAMERA_CFG.offset.z + 0.6, 2, delta);
    this.lookTarget.set(0, 1.6, -8);
    this.camera.lookAt(this.lookTarget);
    this.applyShake(delta);
    this.fovTowards(CAMERA_CFG.fovNormal, delta);
  }

  updatePlaying(
    delta: number,
    player: Player,
    speedRatio: number,
    groundedBobEnabled: boolean
  ): void {
    this.time += delta;

    const bob =
      groundedBobEnabled && player.isGrounded && !player.isSliding
        ? Math.sin(player.runCyclePhase * CAMERA_CFG.bobFrequencyPerUnit) *
          CAMERA_CFG.bobAmplitude
        : 0;

    const desiredX = player.positionX * CAMERA_CFG.lateralFollow;
    const desiredY =
      this.baseY +
      player.positionY * CAMERA_CFG.jumpFollow +
      bob;
    const cam = this.camera.position;
    cam.x = damp(cam.x, desiredX, CAMERA_CFG.positionDamp, delta);
    cam.y = damp(cam.y, desiredY, CAMERA_CFG.positionDamp, delta);
    cam.z = damp(cam.z, CAMERA_CFG.offset.z, CAMERA_CFG.positionDamp, delta);

    this.lookTarget.set(
      player.positionX * 0.6,
      CAMERA_CFG.lookOffset.y + player.positionY * 0.3,
      CAMERA_CFG.lookOffset.z
    );
    this.camera.lookAt(this.lookTarget);

    const targetFov = lerp(CAMERA_CFG.fovNormal, CAMERA_CFG.fovMax, speedRatio);
    this.fovTowards(targetFov, delta);
    this.applyShake(delta);
  }

  private fovTowards(value: number, delta: number): void {
    const fov = this.camera.fov;
    const next = damp(fov, value, CAMERA_CFG.fovDamp, delta);
    if (Math.abs(next - fov) > 0.001) {
      this.camera.fov = clamp(next, 40, 90);
      this.camera.updateProjectionMatrix();
    }
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
