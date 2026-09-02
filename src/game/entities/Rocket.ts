import * as THREE from "three";
import type { ResourceBag } from "@/game/utils/dispose";

/**
 * Rocket pickup — triggers flight (Subway jetpack style).
 * Pooled like Key/Pickup but parented to TrackSegment.
 */
export class Rocket {
  readonly mesh: THREE.Group;
  active = false;
  attracted = false;
  localZ = 0;
  baseY = 1.0;

  private age = Math.random() * 10;
  private phase = Math.random() * Math.PI * 2;

  constructor(mesh: THREE.Group) {
    this.mesh = mesh;
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
    this.mesh.scale.setScalar(1);
    this.mesh.position.set(x, y, localZ);
    this.mesh.rotation.y = Math.random() * 0.6 - 0.3;
  }

  updateVisual(delta: number): void {
    if (!this.active) return;
    if (this.attracted) {
      this.age += delta;
      this.mesh.rotation.y += 3.0 * delta;
      return;
    }
    this.age += delta;
    this.mesh.rotation.y += 1.1 * delta;
    this.mesh.position.y = this.baseY + Math.sin(this.age * 2.0 + this.phase) * 0.16;
    // pulse flame
    const flame = this.mesh.getObjectByName("rocketFlame") as THREE.Mesh | null;
    if (flame) {
      const s = 1 + Math.sin(this.age * 12) * 0.18;
      flame.scale.set(s, s * 0.9, s);
      (flame.material as THREE.MeshBasicMaterial).opacity = 0.72 + Math.sin(this.age * 14) * 0.18;
    }
    // hover bob for body
    const body = this.mesh.getObjectByName("rocketBody") as THREE.Group | null;
    if (body) body.position.y = Math.sin(this.age * 1.7 + this.phase) * 0.04;
  }

  pullTowards(targetX: number, targetY: number, lambda: number, delta: number): void {
    const k = 1 - Math.exp(-lambda * delta);
    this.mesh.position.x += (targetX - this.mesh.position.x) * k;
    this.mesh.position.y += (targetY - this.mesh.position.y) * k;
  }
}

export class RocketFactory {
  private bodyGeo: THREE.CylinderGeometry;
  private noseGeo: THREE.ConeGeometry;
  private finGeo: THREE.BoxGeometry;
  private flameGeo: THREE.ConeGeometry;

  private bodyMat: THREE.MeshStandardMaterial;
  private noseMat: THREE.MeshStandardMaterial;
  private finMat: THREE.MeshStandardMaterial;
  private detailMat: THREE.MeshStandardMaterial;
  private flameMat: THREE.MeshBasicMaterial;

  constructor(private bag: ResourceBag) {
    this.bodyGeo = bag.geo(new THREE.CylinderGeometry(0.14, 0.16, 0.58, 14));
    this.noseGeo = bag.geo(new THREE.ConeGeometry(0.14, 0.22, 14));
    this.finGeo = bag.geo(new THREE.BoxGeometry(0.04, 0.18, 0.14));
    this.flameGeo = bag.geo(new THREE.ConeGeometry(0.09, 0.26, 12));

    this.bodyMat = bag.mat(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0x1a3a5a,
        emissiveIntensity: 0.12,
        roughness: 0.32,
        metalness: 0.18,
      })
    );
    this.noseMat = bag.mat(
      new THREE.MeshStandardMaterial({
        color: 0xe31902,
        emissive: 0xe31902,
        emissiveIntensity: 0.35,
        roughness: 0.4,
        metalness: 0.2,
      })
    );
    this.finMat = bag.mat(
      new THREE.MeshStandardMaterial({
        color: 0x2eb5e5,
        roughness: 0.38,
        metalness: 0.22,
      })
    );
    this.detailMat = bag.mat(
      new THREE.MeshStandardMaterial({
        color: 0xfdd013,
        emissive: 0xb47a00,
        emissiveIntensity: 0.18,
        roughness: 0.35,
        metalness: 0.45,
      })
    );
    this.flameMat = bag.mat(
      new THREE.MeshBasicMaterial({
        color: 0xff9a1a,
        transparent: true,
        opacity: 0.78,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
  }

  create(): Rocket {
    const root = new THREE.Group();
    root.name = "RocketRoot";

    const bodyGroup = new THREE.Group();
    bodyGroup.name = "rocketBody";
    root.add(bodyGroup);

    // Body
    const body = new THREE.Mesh(this.bodyGeo, this.bodyMat);
    body.position.y = 0.12;
    body.castShadow = true;
    body.receiveShadow = true;
    bodyGroup.add(body);

    // Red stripe
    const stripeGeo = new THREE.CylinderGeometry(0.141, 0.161, 0.12, 14);
    const stripe = new THREE.Mesh(stripeGeo, this.noseMat);
    stripe.position.y = 0.02;
    bodyGroup.add(stripe);

    // Nose cone (top)
    const nose = new THREE.Mesh(this.noseGeo, this.noseMat);
    nose.position.y = 0.52;
    nose.castShadow = true;
    bodyGroup.add(nose);

    // Nose tip dark
    const tipGeo = new THREE.SphereGeometry(0.035, 8, 6);
    const tip = new THREE.Mesh(tipGeo, this.detailMat);
    tip.position.y = 0.635;
    bodyGroup.add(tip);

    // Window/porthole
    const windowGeo = new THREE.CircleGeometry(0.055, 12);
    const windowMat = new THREE.MeshStandardMaterial({
      color: 0x6aeefd,
      emissive: 0x6aeefd,
      emissiveIntensity: 1.0,
      roughness: 0.2,
      metalness: 0.3,
    });
    const win = new THREE.Mesh(windowGeo, this.bag.mat(windowMat));
    win.position.set(0, 0.18, 0.155);
    win.rotation.y = 0;
    bodyGroup.add(win);

    // Fins — 4 around body
    for (let i = 0; i < 4; i++) {
      const fin = new THREE.Mesh(this.finGeo, this.finMat);
      const ang = (i / 4) * Math.PI * 2;
      fin.position.set(Math.cos(ang) * 0.16, -0.18, Math.sin(ang) * 0.16);
      fin.rotation.y = -ang;
      fin.castShadow = true;
      bodyGroup.add(fin);
    }

    // Flame (bottom)
    const flame = new THREE.Mesh(this.flameGeo, this.flameMat);
    flame.name = "rocketFlame";
    flame.position.y = -0.32;
    flame.rotation.x = Math.PI;
    bodyGroup.add(flame);

    // Glow ring at base for visibility on bright road
    const ringGeo = new THREE.RingGeometry(0.20, 0.27, 16);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffb84f,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeo, this.bag.mat(ringMat));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -0.42;
    root.add(ring);

    // Overall tilt like key
    bodyGroup.rotation.x = 0.12;

    root.visible = false;
    return new Rocket(root);
  }
}
