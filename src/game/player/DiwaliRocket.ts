import * as THREE from "three";
import { damp, randRange } from "@/game/utils/math";

const SPARK_COUNT = 96;

const SPARK_VERT = /* glsl */ `
attribute float aLife;
attribute float aSize;
varying float vLife;
void main() {
  vLife = aLife;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (90.0 / max(-mv.z, 0.1));
  gl_Position = projectionMatrix * mv;
}
`;

const SPARK_FRAG = /* glsl */ `
varying float vLife;
void main() {
  float d = length(gl_PointCoord - vec2(0.5));
  float a = (1.0 - smoothstep(0.05, 0.5, d)) * vLife;
  if (a < 0.02) discard;
  vec3 hot = vec3(1.0, 0.82, 0.45);
  vec3 ember = vec3(0.95, 0.32, 0.05);
  gl_FragColor = vec4(mix(ember, hot, vLife * vLife) * 0.8, a * 0.85);
}
`;

/**
 * The ride of the Diwali Rocket power-up: a giant festival firecracker rocket
 * (striped paper wrap, gold-foil nose, bamboo stick) the runner sits on. It
 * spits a flame cone plus a pooled spark trail that streams behind at world
 * speed. Built once, shown only during flights; stepping never allocates.
 *
 * Local frame: nose points +Z — parent it under a node yawed PI so the nose
 * faces the direction of travel (-Z in the world).
 */
export class DiwaliRocket {
  readonly group = new THREE.Group();

  private flame: THREE.Mesh;
  private flameCore: THREE.Mesh;
  private glow: THREE.Mesh;
  private sparks: THREE.Points;
  private sparkPos = new Float32Array(SPARK_COUNT * 3);
  private sparkVel = new Float32Array(SPARK_COUNT * 3);
  private sparkLife = new Float32Array(SPARK_COUNT);
  private sparkMaxLife = new Float32Array(SPARK_COUNT);
  private sparkSize = new Float32Array(SPARK_COUNT);
  private sparkCursor = 0;
  private emitAccumulator = 0;
  private time = 0;
  /** 0 hidden → 1 fully shown (scale-in/out). */
  private presence = 0;
  private targetPresence = 0;
  private thrust = 1;
  private geometries: THREE.BufferGeometry[] = [];
  private materials: THREE.Material[] = [];
  private textures: THREE.Texture[] = [];

  /** Nozzle position in the group's local frame. */
  private static readonly NOZZLE_Z = -0.86;

  constructor() {
    this.group.name = "DiwaliRocket";
    this.group.visible = false;

    const paper = this.track(new THREE.CanvasTexture(this.paintWrap()));
    paper.colorSpace = THREE.SRGBColorSpace;
    paper.wrapS = THREE.RepeatWrapping;
    paper.anisotropy = 4;
    this.textures.push(paper);

    const bodyMat = this.mat(new THREE.MeshStandardMaterial({ map: paper, roughness: 0.62, metalness: 0.05 }));
    const foilMat = this.mat(new THREE.MeshStandardMaterial({ color: 0xf2c14e, roughness: 0.22, metalness: 0.95 }));
    const redMat = this.mat(new THREE.MeshStandardMaterial({ color: 0xd7263d, roughness: 0.45, metalness: 0.2 }));
    const bambooMat = this.mat(new THREE.MeshStandardMaterial({ color: 0xc8a165, roughness: 0.85 }));

    const body = new THREE.Mesh(this.geo(new THREE.CylinderGeometry(0.17, 0.18, 1.5, 24)), bodyMat);
    body.rotation.x = Math.PI / 2;
    body.castShadow = true;
    const nose = new THREE.Mesh(this.geo(new THREE.ConeGeometry(0.17, 0.46, 24)), foilMat);
    nose.rotation.x = Math.PI / 2;
    nose.position.z = 0.98;
    nose.castShadow = true;
    const tip = new THREE.Mesh(this.geo(new THREE.SphereGeometry(0.035, 12, 8)), redMat);
    tip.position.z = 1.22;
    const bandGeo = this.geo(new THREE.TorusGeometry(0.178, 0.014, 8, 28));
    for (const z of [-0.62, 0.05, 0.66]) {
      const band = new THREE.Mesh(bandGeo, foilMat);
      band.position.z = z;
      this.group.add(band);
    }
    const tail = new THREE.Mesh(this.geo(new THREE.CylinderGeometry(0.18, 0.13, 0.14, 24)), redMat);
    tail.rotation.x = Math.PI / 2;
    tail.position.z = -0.8;
    // The classic bamboo guide stick of a festival rocket.
    const stick = new THREE.Mesh(this.geo(new THREE.CylinderGeometry(0.022, 0.018, 1.9, 8)), bambooMat);
    stick.rotation.x = Math.PI / 2;
    stick.position.set(0, -0.2, -0.95);
    stick.castShadow = true;
    const tie = new THREE.Mesh(this.geo(new THREE.TorusGeometry(0.05, 0.012, 6, 12)), redMat);
    tie.position.set(0, -0.19, -0.55);

    const flameMat = this.mat(
      new THREE.MeshBasicMaterial({
        color: 0xff7a1a,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    const coreMat = this.mat(
      new THREE.MeshBasicMaterial({
        color: 0xffd98a,
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.flame = new THREE.Mesh(this.geo(new THREE.ConeGeometry(0.15, 0.9, 18, 1, true)), flameMat);
    this.flame.rotation.x = -Math.PI / 2;
    this.flame.position.z = DiwaliRocket.NOZZLE_Z - 0.45;
    this.flameCore = new THREE.Mesh(this.geo(new THREE.ConeGeometry(0.07, 0.5, 14, 1, true)), coreMat);
    this.flameCore.rotation.x = -Math.PI / 2;
    this.flameCore.position.z = DiwaliRocket.NOZZLE_Z - 0.25;
    this.glow = new THREE.Mesh(
      this.geo(new THREE.SphereGeometry(0.2, 16, 12)),
      this.mat(
        new THREE.MeshBasicMaterial({
          color: 0xff9a3c,
          transparent: true,
          opacity: 0.35,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      )
    );
    this.glow.position.z = DiwaliRocket.NOZZLE_Z - 0.1;

    const sparkGeo = this.geo(new THREE.BufferGeometry());
    sparkGeo.setAttribute("position", new THREE.BufferAttribute(this.sparkPos, 3));
    sparkGeo.setAttribute("aLife", new THREE.BufferAttribute(this.sparkLife, 1));
    sparkGeo.setAttribute("aSize", new THREE.BufferAttribute(this.sparkSize, 1));
    this.sparks = new THREE.Points(
      sparkGeo,
      this.mat(
        new THREE.ShaderMaterial({
          vertexShader: SPARK_VERT,
          fragmentShader: SPARK_FRAG,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
      )
    );
    this.sparks.frustumCulled = false;

    this.group.add(body, nose, tip, tail, stick, tie, this.flame, this.flameCore, this.glow, this.sparks);
  }

  /** Show (flight) or hide (landed) with a short scale transition. */
  setActive(active: boolean): void {
    this.targetPresence = active ? 1 : 0;
    if (active) this.group.visible = true;
  }

  /** 0..1 engine intensity (launch burst > cruise > descent sputter). */
  setThrust(value: number): void {
    this.thrust = value;
  }

  get isVisible(): boolean {
    return this.group.visible;
  }

  /**
   * @param worldSpeed forward speed — sparks stream behind at this rate
   */
  update(delta: number, worldSpeed: number): void {
    this.time += delta;
    this.presence = damp(this.presence, this.targetPresence, this.targetPresence > 0 ? 9 : 6, delta);
    if (this.targetPresence === 0 && this.presence < 0.02) {
      this.presence = 0;
      this.group.visible = false;
      this.resetSparks();
      return;
    }
    this.group.scale.setScalar(0.35 + this.presence * 0.65);

    const flicker = 0.85 + Math.sin(this.time * 38) * 0.1 + Math.sin(this.time * 71) * 0.05;
    const power = this.thrust * this.presence;
    this.flame.scale.set(flicker, (0.7 + power * 0.6) * flicker, flicker);
    this.flameCore.scale.set(1, (0.8 + power * 0.5) * flicker, 1);
    (this.glow.material as THREE.MeshBasicMaterial).opacity = 0.1 + power * 0.14 * flicker;

    // Emit sparks at the nozzle; they drift back in the rocket's frame.
    const rate = 55 * power * (this.targetPresence > 0 ? 1 : 0);
    this.emitAccumulator += rate * delta;
    while (this.emitAccumulator >= 1) {
      this.emitAccumulator -= 1;
      this.emitSpark(worldSpeed);
    }
    const pos = this.sparkPos;
    const vel = this.sparkVel;
    for (let i = 0; i < SPARK_COUNT; i++) {
      if (this.sparkLife[i] <= 0) continue;
      const o = i * 3;
      vel[o + 1] -= 6 * delta;
      pos[o] += vel[o] * delta;
      pos[o + 1] += vel[o + 1] * delta;
      pos[o + 2] += vel[o + 2] * delta;
      this.sparkLife[i] = Math.max(0, this.sparkLife[i] - delta / this.sparkMaxLife[i]);
    }
    const geo = this.sparks.geometry;
    (geo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (geo.getAttribute("aLife") as THREE.BufferAttribute).needsUpdate = true;
    (geo.getAttribute("aSize") as THREE.BufferAttribute).needsUpdate = true;
  }

  private emitSpark(worldSpeed: number): void {
    const i = this.sparkCursor;
    this.sparkCursor = (this.sparkCursor + 1) % SPARK_COUNT;
    const o = i * 3;
    this.sparkPos[o] = randRange(-0.06, 0.06);
    this.sparkPos[o + 1] = randRange(-0.06, 0.06);
    this.sparkPos[o + 2] = DiwaliRocket.NOZZLE_Z;
    // Local -Z is "behind" (the group is yawed PI under its parent).
    this.sparkVel[o] = randRange(-1.4, 1.4);
    this.sparkVel[o + 1] = randRange(-0.6, 1.8);
    this.sparkVel[o + 2] = -(worldSpeed * randRange(0.55, 0.9) + randRange(2, 5));
    this.sparkMaxLife[i] = randRange(0.35, 0.7);
    this.sparkLife[i] = 1;
    this.sparkSize[i] = randRange(0.35, 0.9);
  }

  private resetSparks(): void {
    this.sparkLife.fill(0);
    this.emitAccumulator = 0;
  }

  /** Festival paper wrap: diagonal stripes + dots, drawn once. */
  private paintWrap(): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    const colors = ["#d7263d", "#ffb300", "#1b998b", "#e4007c", "#3a86ff"];
    ctx.fillStyle = "#fff4e0";
    ctx.fillRect(0, 0, 256, 128);
    ctx.save();
    ctx.translate(0, 0);
    for (let i = -8; i < 20; i++) {
      ctx.fillStyle = colors[((i % colors.length) + colors.length) % colors.length];
      ctx.beginPath();
      ctx.moveTo(i * 22, 0);
      ctx.lineTo(i * 22 + 14, 0);
      ctx.lineTo(i * 22 + 14 + 48, 128);
      ctx.lineTo(i * 22 + 48, 128);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    for (let y = 10; y < 128; y += 22) {
      for (let x = 6; x < 256; x += 18) {
        ctx.beginPath();
        ctx.arc(x + (y % 44 === 10 ? 9 : 0), y, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    return canvas;
  }

  private geo<T extends THREE.BufferGeometry>(g: T): T {
    this.geometries.push(g);
    return g;
  }

  private mat<T extends THREE.Material>(m: T): T {
    this.materials.push(m);
    return m;
  }

  private track<T extends THREE.Texture>(t: T): T {
    return t;
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
    for (const t of this.textures) t.dispose();
    this.group.removeFromParent();
  }
}
