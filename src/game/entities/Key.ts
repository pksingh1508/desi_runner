import * as THREE from "three";
import type { ResourceBag } from "@/game/utils/dispose";

/**
 * Life-Saver Key — the revive currency.
 * Pooled like Coin/Pickup but parented to TrackSegment so it scrolls with the world.
 * Visual: Subway-style golden skeleton key with cyan gem, high contrast on bright road.
 */
export class Key {
  readonly mesh: THREE.Group;
  active = false;
  attracted = false;
  localZ = 0;
  baseY = 1.05;

  private age = Math.random() * 10;
  private phase = Math.random() * Math.PI * 2;

  constructor(mesh: THREE.Group) {
    this.mesh = mesh;
  }

  get worldZ(): number {
    return this.localZ + (this.mesh.parent?.position.z ?? 0);
  }

  place(x: number, localZ: number, y: number = 1.05): void {
    this.localZ = localZ;
    this.baseY = y;
    this.active = true;
    this.age = Math.random() * 10;
    this.phase = Math.random() * Math.PI * 2;
    this.mesh.visible = true;
    this.mesh.scale.setScalar(1);
    this.mesh.position.set(x, y, localZ);
    // random face so not all keys sync
    this.mesh.rotation.y = Math.random() * Math.PI * 2;
  }

  updateVisual(delta: number): void {
    if (!this.active) return;
    if (this.attracted) {
      this.age += delta;
      this.mesh.rotation.y += 3.2 * delta;
      return;
    }
    this.age += delta;
    this.mesh.rotation.y += 1.8 * delta;
    this.mesh.position.y = this.baseY + Math.sin(this.age * 2.2 + this.phase) * 0.14;
    // gentle wobble
    const inner = this.mesh.getObjectByName("keySpin") as THREE.Group | null;
    if (inner) inner.rotation.z = Math.sin(this.age * 1.6 + this.phase) * 0.12;
  }

  pullTowards(targetX: number, targetY: number, lambda: number, delta: number): void {
    const k = 1 - Math.exp(-lambda * delta);
    this.mesh.position.x += (targetX - this.mesh.position.x) * k;
    this.mesh.position.y += (targetY - this.mesh.position.y) * k;
  }
}

export class KeyFactory {
  private bowGeo: THREE.TorusGeometry;
  private shaftGeo: THREE.BoxGeometry;
  private toothA: THREE.BoxGeometry;
  private toothB: THREE.BoxGeometry;
  private gemGeo: THREE.OctahedronGeometry;

  private goldMat: THREE.MeshStandardMaterial;
  private darkGoldMat: THREE.MeshStandardMaterial;
  private gemMat: THREE.MeshStandardMaterial;
  private gemBackMat: THREE.MeshStandardMaterial;

  constructor(private bag: ResourceBag) {
    this.bowGeo = bag.geo(new THREE.TorusGeometry(0.18, 0.035, 10, 18));
    this.shaftGeo = bag.geo(new THREE.BoxGeometry(0.06, 0.06, 0.46));
    this.toothA = bag.geo(new THREE.BoxGeometry(0.07, 0.07, 0.08));
    this.toothB = bag.geo(new THREE.BoxGeometry(0.07, 0.07, 0.05));
    this.gemGeo = bag.geo(new THREE.OctahedronGeometry(0.065, 0));

    this.goldMat = bag.mat(
      new THREE.MeshStandardMaterial({
        color: 0xfdd013,
        emissive: 0x8c6a00,
        emissiveIntensity: 0.18,
        metalness: 0.68,
        roughness: 0.28,
      })
    );
    this.darkGoldMat = bag.mat(
      new THREE.MeshStandardMaterial({
        color: 0xb47a00,
        metalness: 0.62,
        roughness: 0.34,
      })
    );
    this.gemMat = bag.mat(
      new THREE.MeshStandardMaterial({
        color: 0x7efff5,
        emissive: 0x37d3e0,
        emissiveIntensity: 1.2,
        roughness: 0.18,
        metalness: 0.15,
        transparent: true,
        opacity: 0.96,
      })
    );
    this.gemBackMat = bag.mat(
      new THREE.MeshStandardMaterial({
        color: 0x2eb5e5,
        metalness: 0.2,
        roughness: 0.4,
      })
    );
  }

  create(): Key {
    const root = new THREE.Group();
    root.name = "KeyRoot";

    const spin = new THREE.Group();
    spin.name = "keySpin";
    root.add(spin);

    // Bow (ring) — top
    const bow = new THREE.Mesh(this.bowGeo, this.goldMat);
    bow.position.set(0, 0.22, -0.14);
    bow.castShadow = true;
    bow.receiveShadow = true;
    spin.add(bow);

    // Inner gem in bow
    const gem = new THREE.Mesh(this.gemGeo, this.gemMat);
    gem.position.set(0, 0.22, -0.14);
    gem.scale.set(1, 1, 0.6);
    spin.add(gem);
    const gemBack = new THREE.Mesh(this.gemGeo, this.gemBackMat);
    gemBack.position.set(0, 0.22, -0.135);
    gemBack.scale.set(0.75, 0.75, 0.45);
    spin.add(gemBack);

    // Shaft — sticks out forward (toward camera when placed)
    const shaft = new THREE.Mesh(this.shaftGeo, this.goldMat);
    shaft.position.set(0, 0.05, 0.07);
    shaft.castShadow = true;
    spin.add(shaft);

    // Collar ring where bow meets shaft
    const collarGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.03, 12);
    // not pooled — small per-instance leak acceptable (<80 keys)
    const collar = new THREE.Mesh(collarGeo, this.darkGoldMat);
    collar.rotation.x = Math.PI / 2;
    collar.position.set(0, 0.12, -0.02);
    spin.add(collar);

    // Teeth
    const t1 = new THREE.Mesh(this.toothA, this.goldMat);
    t1.position.set(0, 0.09, 0.22);
    spin.add(t1);
    const t2 = new THREE.Mesh(this.toothB, this.goldMat);
    t2.position.set(0, -0.01, 0.26);
    spin.add(t2);
    const t3 = new THREE.Mesh(this.toothA, this.goldMat);
    t3.position.set(0, 0.02, 0.32);
    t3.scale.set(0.85, 0.85, 1);
    spin.add(t3);

    // Tilt the whole key so it reads as a 3D object from chase cam
    spin.rotation.x = Math.PI * 0.12;
    spin.rotation.z = Math.PI * 0.08;

    // Light halo ring at feet for outdoor visibility
    const haloGeo = new THREE.RingGeometry(0.22, 0.30, 18);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0xfdd013,
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const halo = new THREE.Mesh(haloGeo, haloMat);
    halo.rotation.x = -Math.PI / 2;
    halo.position.set(0, -0.92, 0);
    root.add(halo);

    // Animate halo pulse via userData
    root.userData.halo = halo;

    root.visible = false;
    return new Key(root);
  }
}
