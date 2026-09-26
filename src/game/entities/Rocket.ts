import * as THREE from "three";
import type { ResourceBag } from "@/game/utils/dispose";
import { PICKUP_VISUAL } from "@/game/config/gameplay";

/**
 * Diwali Rocket pickup — the festival firecracker rocket standing in a glass
 * bottle (how rockets are launched on Diwali night), fuse fizzing. Grabbing
 * it starts the rocket ride. Pooled; every geometry/material is shared by the
 * factory and child references are cached (no per-frame scene lookups).
 */
export class Rocket {
  readonly mesh: THREE.Group;
  active = false;
  attracted = false;
  localZ = 0;
  baseY = 1.0;

  private age = Math.random() * 10;
  private phase = Math.random() * Math.PI * 2;
  private readonly body: THREE.Object3D;
  private readonly fuse: THREE.Mesh;
  private readonly fuseMaterial: THREE.MeshBasicMaterial;
  private readonly halo: THREE.Mesh;

  constructor(mesh: THREE.Group, parts: { body: THREE.Object3D; fuse: THREE.Mesh; halo: THREE.Mesh }) {
    this.mesh = mesh;
    this.body = parts.body;
    this.fuse = parts.fuse;
    this.fuseMaterial = parts.fuse.material as THREE.MeshBasicMaterial;
    this.halo = parts.halo;
  }

  get worldZ(): number {
    return this.localZ + (this.mesh.parent?.position.z ?? 0);
  }

  place(x: number, localZ: number, y: number = 1.0): void {
    this.localZ = localZ;
    this.baseY = y;
    this.active = true;
    this.attracted = false;
    this.age = Math.random() * 10;
    this.phase = Math.random() * Math.PI * 2;
    this.mesh.visible = true;
    this.mesh.scale.setScalar(PICKUP_VISUAL.rocketScale);
    this.mesh.position.set(x, y, localZ);
    this.mesh.rotation.y = Math.random() * 0.6 - 0.3;
  }

  updateVisual(delta: number): void {
    if (!this.active) return;
    this.age += delta;
    if (this.attracted) {
      this.mesh.rotation.y += 3.0 * delta;
      return;
    }
    this.mesh.rotation.y += 0.9 * delta;
    this.mesh.position.y = this.baseY + Math.sin(this.age * 2.0 + this.phase) * 0.12;
    // Rocket itches to launch: tiny hop + fizzing fuse glow.
    this.body.position.y = Math.max(0, Math.sin(this.age * 5.3 + this.phase)) * 0.035;
    const fizz = 0.75 + Math.sin(this.age * 31) * 0.15 + Math.sin(this.age * 17 + this.phase) * 0.1;
    this.fuse.scale.setScalar(fizz);
    this.fuseMaterial.opacity = 0.65 + fizz * 0.3;
    this.halo.rotation.z += delta * 0.8;
  }

  pullTowards(targetX: number, targetY: number, lambda: number, delta: number): void {
    const k = 1 - Math.exp(-lambda * delta);
    this.mesh.position.x += (targetX - this.mesh.position.x) * k;
    this.mesh.position.y += (targetY - this.mesh.position.y) * k;
  }
}

export class RocketFactory {
  private bottleGeo: THREE.LatheGeometry;
  private tubeGeo: THREE.CylinderGeometry;
  private noseGeo: THREE.ConeGeometry;
  private bandGeo: THREE.TorusGeometry;
  private stickGeo: THREE.CylinderGeometry;
  private fuseGeo: THREE.SphereGeometry;
  private haloGeo: THREE.RingGeometry;

  private glassMat: THREE.MeshStandardMaterial;
  private paperMat: THREE.MeshStandardMaterial;
  private foilMat: THREE.MeshStandardMaterial;
  private bambooMat: THREE.MeshStandardMaterial;
  private haloMat: THREE.MeshBasicMaterial;

  constructor(private bag: ResourceBag) {
    // Glass bottle silhouette (lathe profile, origin at the bottle base).
    const profile = [
      [0.0, 0.0],
      [0.13, 0.0],
      [0.14, 0.02],
      [0.14, 0.2],
      [0.12, 0.26],
      [0.055, 0.32],
      [0.045, 0.42],
      [0.05, 0.44],
      [0.0, 0.44],
    ].map(([r, h]) => new THREE.Vector2(r, h));
    this.bottleGeo = bag.geo(new THREE.LatheGeometry(profile, 20));
    this.tubeGeo = bag.geo(new THREE.CylinderGeometry(0.075, 0.08, 0.42, 16));
    this.noseGeo = bag.geo(new THREE.ConeGeometry(0.075, 0.16, 16));
    this.bandGeo = bag.geo(new THREE.TorusGeometry(0.079, 0.009, 6, 20));
    this.stickGeo = bag.geo(new THREE.CylinderGeometry(0.012, 0.012, 0.62, 6));
    this.fuseGeo = bag.geo(new THREE.SphereGeometry(0.05, 10, 8));
    this.haloGeo = bag.geo(new THREE.RingGeometry(0.3, 0.4, 24));

    this.glassMat = bag.mat(
      new THREE.MeshStandardMaterial({
        color: 0x3fbf7f,
        emissive: 0x0d3b24,
        emissiveIntensity: 0.6,
        roughness: 0.08,
        metalness: 0.2,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      })
    );
    const paper = bag.tex(new THREE.CanvasTexture(paintRocketPaper()));
    paper.colorSpace = THREE.SRGBColorSpace;
    paper.wrapS = THREE.RepeatWrapping;
    this.paperMat = bag.mat(
      new THREE.MeshStandardMaterial({
        map: paper,
        emissive: 0x3a1204,
        emissiveIntensity: PICKUP_VISUAL.rocketGlowEmissiveIntensity * 0.5,
        roughness: 0.55,
      })
    );
    this.foilMat = bag.mat(
      new THREE.MeshStandardMaterial({
        color: 0xf2c14e,
        emissive: 0x6b4a00,
        emissiveIntensity: 0.45,
        roughness: 0.2,
        metalness: 0.95,
      })
    );
    this.bambooMat = bag.mat(new THREE.MeshStandardMaterial({ color: 0xc8a165, roughness: 0.8 }));
    this.haloMat = bag.mat(
      new THREE.MeshBasicMaterial({
        color: 0xffb84f,
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
  }

  create(): Rocket {
    const root = new THREE.Group();
    root.name = "RocketPickup";

    const bottle = new THREE.Mesh(this.bottleGeo, this.glassMat);
    bottle.position.y = -0.42;
    bottle.renderOrder = 2;

    const body = new THREE.Group();
    body.name = "RocketBody";
    const stick = new THREE.Mesh(this.stickGeo, this.bambooMat);
    stick.position.set(0.05, -0.18, 0);
    const tube = new THREE.Mesh(this.tubeGeo, this.paperMat);
    tube.position.set(0.05, 0.28, 0);
    tube.castShadow = true;
    const nose = new THREE.Mesh(this.noseGeo, this.foilMat);
    nose.position.set(0.05, 0.57, 0);
    nose.castShadow = true;
    const bandTop = new THREE.Mesh(this.bandGeo, this.foilMat);
    bandTop.rotation.x = Math.PI / 2;
    bandTop.position.set(0.05, 0.45, 0);
    const bandLow = new THREE.Mesh(this.bandGeo, this.foilMat);
    bandLow.rotation.x = Math.PI / 2;
    bandLow.position.set(0.05, 0.1, 0);
    body.add(stick, tube, nose, bandTop, bandLow);

    // Fizzing fuse glow (per-instance material so each flickers alone).
    const fuse = new THREE.Mesh(
      this.fuseGeo,
      this.bag.mat(
        new THREE.MeshBasicMaterial({
          color: 0xffc46b,
          transparent: true,
          opacity: 0.9,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      )
    );
    fuse.position.set(0.05, 0.05, 0);
    body.add(fuse);

    const halo = new THREE.Mesh(this.haloGeo, this.haloMat);
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = -0.44;

    root.add(bottle, body, halo);
    root.visible = false;
    return new Rocket(root, { body, fuse, halo });
  }
}

/** Festival paper wrap for the pickup rocket (drawn once per factory). */
function paintRocketPaper(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  const colors = ["#d7263d", "#ffb300", "#1b998b", "#e4007c"];
  for (let i = -4; i < 12; i++) {
    ctx.fillStyle = colors[((i % colors.length) + colors.length) % colors.length];
    ctx.beginPath();
    ctx.moveTo(i * 14, 0);
    ctx.lineTo(i * 14 + 9, 0);
    ctx.lineTo(i * 14 + 9 + 24, 64);
    ctx.lineTo(i * 14 + 24, 64);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  for (let y = 8; y < 64; y += 16) {
    for (let x = 4; x < 128; x += 12) {
      ctx.beginPath();
      ctx.arc(x, y, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return canvas;
}
