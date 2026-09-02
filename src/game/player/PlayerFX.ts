import * as THREE from "three";
import { damp } from "@/game/utils/math";

/**
 * Player-attached power-up visuals: shield bubble, magnet ground ring and an
 * Overdrive aura. All materials are additive/transparent with zero shadow
 * cost; the group rides the player root so no extra scene bookkeeping.
 */
export class PlayerFX {
  readonly root = new THREE.Group();

  private shield: THREE.Mesh;
  private shieldWire: THREE.Mesh;
  private magnetRing: THREE.Mesh;
  private odRing: THREE.Mesh;
  private time = 0;

  private shieldOn = false;
  private magnetOn = false;
  private odIntensity = 0;

  constructor() {
    this.root.name = "PlayerFX";

    const sphereGeo = new THREE.SphereGeometry(1.35, 20, 14);
    this.shield = new THREE.Mesh(
      sphereGeo,
      new THREE.MeshBasicMaterial({
        color: 0x4f8dff,
        transparent: true,
        opacity: 0.22,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.shield.position.y = 1;
    this.shieldWire = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.38, 1),
      new THREE.MeshBasicMaterial({
        color: 0x9fc0ff,
        transparent: true,
        opacity: 0.32,
        wireframe: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.shieldWire.position.y = 1;
    this.shield.visible = this.shieldWire.visible = false;

    const ringGeo = new THREE.RingGeometry(0.9, 1.15, 40);
    this.magnetRing = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({
        color: 0x37d3e0,
        transparent: true,
        opacity: 0.4,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.magnetRing.rotation.x = -Math.PI / 2;
    this.magnetRing.position.y = 0.06;
    this.magnetRing.visible = false;

    this.odRing = new THREE.Mesh(
      new THREE.RingGeometry(1.05, 1.45, 48),
      new THREE.MeshBasicMaterial({
        color: 0xc06bff,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.odRing.rotation.x = -Math.PI / 2;
    this.odRing.position.y = 0.05;
    this.odRing.visible = false;

    this.root.add(this.shield, this.shieldWire, this.magnetRing, this.odRing);
  }

  setShield(on: boolean): void {
    if (this.shieldOn === on) return;
    this.shieldOn = on;
    this.shield.visible = on;
    this.shieldWire.visible = on;
  }

  setMagnet(on: boolean): void {
    if (this.magnetOn === on) return;
    this.magnetOn = on;
    this.magnetRing.visible = on;
  }

  /** 0..1 smoothed Overdrive intensity (drives aura ring). */
  setOverdrive(intensity: number): void {
    this.odIntensity = intensity;
    this.odRing.visible = intensity > 0.02;
  }

  update(delta: number): void {
    this.time += delta;
    if (this.shieldOn) {
      const pulse = 1 + Math.sin(this.time * 6) * 0.03;
      this.shield.scale.setScalar(pulse);
      this.shieldWire.rotation.y += delta * 0.7;
      this.shieldWire.rotation.x += delta * 0.3;
    }
    if (this.magnetOn) {
      this.magnetRing.rotation.z += delta * 1.6;
      const breathe = 1 + Math.sin(this.time * 4) * 0.08;
      this.magnetRing.scale.setScalar(breathe);
    }
    if (this.odRing.visible) {
      this.odRing.rotation.z -= delta * 3.2;
      const s = 1 + Math.sin(this.time * 9) * 0.09 * this.odIntensity;
      this.odRing.scale.setScalar(s);
      const mat = this.odRing.material as THREE.MeshBasicMaterial;
      mat.opacity = damp(mat.opacity, 0.35 + this.odIntensity * 0.45, 6, delta);
    }
  }
}
