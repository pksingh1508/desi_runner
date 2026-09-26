import * as THREE from "three";
import { damp } from "@/game/utils/math";

const FIELD_WAVES = 3;
const CHILLIES = 5;

/**
 * Runner-attached power-up visuals (zero shadow cost, additive materials):
 *  - NIMBU-MIRCHI shield: lime bubble + a lemon-and-chilli charm orbiting the
 *    runner (the classic ward against bad luck). Blinks during grace windows.
 *  - CHUMBAK magnet: magnetic field waves pulsing outward at chest height and
 *    a floating red horseshoe magnet above the head.
 *  - JOSH (overdrive): saffron fire ring at the feet.
 * Everything is built once and toggled; update() never allocates.
 */
export class PlayerFX {
  readonly root = new THREE.Group();

  private shield: THREE.Mesh;
  private shieldWire: THREE.Mesh;
  private charm = new THREE.Group();
  private magnetIcon = new THREE.Group();
  private waves: THREE.Mesh[] = [];
  private waveMats: THREE.MeshBasicMaterial[] = [];
  private odRing: THREE.Mesh;
  private odInner: THREE.Mesh;
  private time = 0;

  private shieldOn = false;
  private graceBlink = false;
  private magnetOn = false;
  private magnetPresence = 0;
  private odIntensity = 0;
  private geometries: THREE.BufferGeometry[] = [];
  private materials: THREE.Material[] = [];

  constructor() {
    this.root.name = "PlayerFX";

    // ---------------------------------------------------------- shield
    this.shield = new THREE.Mesh(
      this.geo(new THREE.SphereGeometry(1.3, 24, 16)),
      this.mat(
        new THREE.MeshBasicMaterial({
          color: 0xb5e61d,
          transparent: true,
          opacity: 0.16,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      )
    );
    this.shield.position.y = 1;
    this.shieldWire = new THREE.Mesh(
      this.geo(new THREE.IcosahedronGeometry(1.33, 1)),
      this.mat(
        new THREE.MeshBasicMaterial({
          color: 0xfff176,
          transparent: true,
          opacity: 0.22,
          wireframe: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      )
    );
    this.shieldWire.position.y = 1;
    this.buildCharm();
    this.shield.visible = this.shieldWire.visible = this.charm.visible = false;

    // ---------------------------------------------------------- magnet
    const waveGeo = this.geo(new THREE.TorusGeometry(0.75, 0.018, 6, 48));
    for (let i = 0; i < FIELD_WAVES; i++) {
      const mat = this.mat(
        new THREE.MeshBasicMaterial({
          color: i % 2 === 0 ? 0x2e9bff : 0xff3b3b,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      const wave = new THREE.Mesh(waveGeo, mat);
      wave.rotation.x = Math.PI / 2;
      wave.position.y = 1.05;
      wave.visible = false;
      this.waves.push(wave);
      this.waveMats.push(mat);
    }
    this.buildMagnetIcon();
    this.magnetIcon.visible = false;

    // ---------------------------------------------------------- JOSH aura
    this.odRing = new THREE.Mesh(
      this.geo(new THREE.RingGeometry(1.05, 1.5, 48)),
      this.mat(
        new THREE.MeshBasicMaterial({
          color: 0xff7a1a,
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      )
    );
    this.odRing.rotation.x = -Math.PI / 2;
    this.odRing.position.y = 0.05;
    this.odRing.visible = false;
    this.odInner = new THREE.Mesh(
      this.geo(new THREE.RingGeometry(0.55, 0.85, 40)),
      this.mat(
        new THREE.MeshBasicMaterial({
          color: 0xffd23f,
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      )
    );
    this.odInner.rotation.x = -Math.PI / 2;
    this.odInner.position.y = 0.06;
    this.odInner.visible = false;

    this.root.add(this.shield, this.shieldWire, this.charm, this.magnetIcon, this.odRing, this.odInner, ...this.waves);
  }

  setShield(on: boolean, graceBlink = false): void {
    this.graceBlink = graceBlink;
    if (this.shieldOn === on) return;
    this.shieldOn = on;
    this.shield.visible = on;
    this.shieldWire.visible = on;
    this.charm.visible = on;
  }

  setMagnet(on: boolean): void {
    this.magnetOn = on;
  }

  /** 0..1 smoothed JOSH intensity (drives the fire ring). */
  setOverdrive(intensity: number): void {
    this.odIntensity = intensity;
    const visible = intensity > 0.02;
    this.odRing.visible = visible;
    this.odInner.visible = visible;
  }

  update(delta: number): void {
    this.time += delta;
    const t = this.time;

    if (this.shieldOn) {
      const pulse = 1 + Math.sin(t * 6) * 0.03;
      this.shield.scale.setScalar(pulse);
      this.shieldWire.rotation.y += delta * 0.7;
      this.shieldWire.rotation.x += delta * 0.3;
      // Grace windows blink so "temporarily safe" reads at a glance.
      const blink = this.graceBlink ? (Math.sin(t * 22) > 0 ? 1 : 0.25) : 1;
      (this.shield.material as THREE.MeshBasicMaterial).opacity = 0.16 * blink;
      (this.shieldWire.material as THREE.MeshBasicMaterial).opacity = 0.22 * blink;
      // Charm orbits at head height, swinging on its thread.
      const orbit = t * 2.2;
      this.charm.position.set(Math.cos(orbit) * 0.95, 1.55 + Math.sin(t * 3.1) * 0.08, Math.sin(orbit) * 0.95);
      this.charm.rotation.y = -orbit;
      this.charm.rotation.z = Math.sin(t * 4.3) * 0.25;
    }

    // Magnet: fade the whole field in/out, waves expand and fade in turn.
    this.magnetPresence = damp(this.magnetPresence, this.magnetOn ? 1 : 0, 6, delta);
    const magnetVisible = this.magnetPresence > 0.02;
    this.magnetIcon.visible = magnetVisible;
    for (let i = 0; i < FIELD_WAVES; i++) {
      const wave = this.waves[i];
      wave.visible = magnetVisible;
      if (!magnetVisible) continue;
      const k = (t * 0.9 + i / FIELD_WAVES) % 1;
      const scale = 0.7 + k * 2.1;
      wave.scale.set(scale, scale, 1);
      wave.position.y = 1.05 + Math.sin(t * 2 + i) * 0.05;
      this.waveMats[i].opacity = (1 - k) * 0.55 * this.magnetPresence;
    }
    if (magnetVisible) {
      const s = 0.4 + this.magnetPresence * 0.6;
      this.magnetIcon.scale.setScalar(s);
      this.magnetIcon.position.y = 2.45 + Math.sin(t * 3) * 0.06;
      this.magnetIcon.rotation.y += delta * 2.2;
    }

    if (this.odRing.visible) {
      this.odRing.rotation.z -= delta * 3.2;
      this.odInner.rotation.z += delta * 5.1;
      const s = 1 + Math.sin(t * 9) * 0.09 * this.odIntensity;
      this.odRing.scale.setScalar(s);
      this.odInner.scale.setScalar(1 + Math.sin(t * 13) * 0.12 * this.odIntensity);
      const mat = this.odRing.material as THREE.MeshBasicMaterial;
      mat.opacity = damp(mat.opacity, 0.3 + this.odIntensity * 0.45, 6, delta);
      const inner = this.odInner.material as THREE.MeshBasicMaterial;
      inner.opacity = damp(inner.opacity, 0.2 + this.odIntensity * 0.5, 6, delta);
    }
  }

  // ------------------------------------------------------------ builders

  /** Lemon + green chillies strung on a black thread. */
  private buildCharm(): void {
    const thread = this.mat(new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 }));
    const lemon = this.mat(
      new THREE.MeshStandardMaterial({ color: 0xf6e041, emissive: 0x4a3f00, emissiveIntensity: 0.5, roughness: 0.45 })
    );
    const chilli = this.mat(
      new THREE.MeshStandardMaterial({ color: 0x2e9e3a, emissive: 0x0a2a0e, emissiveIntensity: 0.5, roughness: 0.35 })
    );
    const threadMesh = new THREE.Mesh(this.geo(new THREE.CylinderGeometry(0.006, 0.006, 0.5, 5)), thread);
    threadMesh.position.y = 0.05;
    const lemonMesh = new THREE.Mesh(this.geo(new THREE.SphereGeometry(0.075, 14, 10)), lemon);
    lemonMesh.scale.set(1, 1.15, 1);
    lemonMesh.position.y = 0.26;
    this.charm.add(threadMesh, lemonMesh);
    const chilliGeo = this.geo(new THREE.ConeGeometry(0.022, 0.16, 8));
    chilliGeo.rotateX(Math.PI);
    for (let i = 0; i < CHILLIES; i++) {
      const c = new THREE.Mesh(chilliGeo, chilli);
      c.position.set(0, 0.12 - i * 0.075, 0);
      c.rotation.z = (i % 2 === 0 ? 1 : -1) * 0.35;
      this.charm.add(c);
    }
    this.charm.scale.setScalar(0.9);
  }

  /** Red horseshoe with silver pole tips. */
  private buildMagnetIcon(): void {
    const red = this.mat(
      new THREE.MeshStandardMaterial({ color: 0xe0242e, emissive: 0x5a0508, emissiveIntensity: 0.8, roughness: 0.35, metalness: 0.2 })
    );
    const silver = this.mat(
      new THREE.MeshStandardMaterial({ color: 0xe8eef5, emissive: 0x6d8bb0, emissiveIntensity: 0.4, roughness: 0.25, metalness: 0.8 })
    );
    const bend = new THREE.Mesh(this.geo(new THREE.TorusGeometry(0.16, 0.06, 10, 24, Math.PI)), red);
    const poleGeo = this.geo(new THREE.CylinderGeometry(0.06, 0.06, 0.12, 12));
    const left = new THREE.Mesh(poleGeo, silver);
    left.position.set(-0.16, -0.06, 0);
    const right = new THREE.Mesh(poleGeo, silver);
    right.position.set(0.16, -0.06, 0);
    this.magnetIcon.add(bend, left, right);
    this.magnetIcon.position.y = 2.45;
  }

  private geo<T extends THREE.BufferGeometry>(g: T): T {
    this.geometries.push(g);
    return g;
  }

  private mat<T extends THREE.Material>(m: T): T {
    this.materials.push(m);
    return m;
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
    this.root.removeFromParent();
  }
}
