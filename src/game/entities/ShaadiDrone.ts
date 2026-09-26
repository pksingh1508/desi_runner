import * as THREE from "three";
import type { ResourceBag } from "@/game/utils/dispose";
import { SHAADI_DRONE } from "@/game/config/events";
import {
  ModelBuilder,
  instantiateModel,
  withVertexColorEmissive,
  type BuiltModel,
  type MaterialLayer,
  type Vec3,
} from "./obstacles/ModelBuilder";
import { marigoldGarland } from "./obstacles/models/common";

export type DroneVisualState = "idle" | "warning" | "charging";

/** Per-drone visual handle (pooled with the drone). */
export interface DroneVisual {
  readonly group: THREE.Group;
  reset(): void;
  update(delta: number, state: DroneVisualState): void;
}

const MOTORS: readonly Vec3[] = [
  [0.36, 0.02, 0.36],
  [-0.36, 0.02, 0.36],
  [0.36, 0.02, -0.36],
  [-0.36, 0.02, -0.36],
];

/**
 * Wedding videography quadcopter ("shaadi drone"): pearl-and-gold body, four
 * spinning props, a camera gimbal aimed at the runner, a blinking red REC
 * light and a marigold garland. A red chevron strip telegraphs its lane.
 * Faces +Z (toward the runner); collider stays the event system's cube.
 */
export class ShaadiDroneFactory {
  private readonly model: BuiltModel;
  private readonly materials: Record<MaterialLayer, THREE.Material>;
  private readonly stripGeometry: THREE.PlaneGeometry;
  private readonly stripTexture: THREE.CanvasTexture;
  private readonly stripBaseMaterial: THREE.MeshBasicMaterial;

  constructor(private readonly bag: ResourceBag) {
    const body = withVertexColorEmissive(
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.2, emissive: 0xffffff, emissiveIntensity: 0.12 })
    );
    const metal = withVertexColorEmissive(
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.6, emissive: 0xffffff, emissiveIntensity: 0.1 })
    );
    const glow = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    const blur = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    // Additive red for the lock-on beam under the drone.
    const beam = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.materials = {
      paint: bag.mat(body),
      metal: bag.mat(metal),
      glow: bag.mat(glow),
      cloth: bag.mat(blur),
      clothArt: bag.mat(beam),
      art: body,
      glass: blur,
    };
    this.model = buildDroneModel();
    for (const part of this.model.parts) for (const mesh of part.meshes) bag.geo(mesh.geometry);

    this.stripTexture = bag.tex(chevronTexture());
    this.stripGeometry = bag.geo(new THREE.PlaneGeometry(SHAADI_DRONE.laneStripWidth, SHAADI_DRONE.laneStripLength));
    this.stripBaseMaterial = bag.mat(
      new THREE.MeshBasicMaterial({
        map: this.stripTexture,
        transparent: true,
        opacity: SHAADI_DRONE.laneStripOpacityWarning,
        depthWrite: false,
        toneMapped: false,
      })
    );
  }

  create(): DroneVisual {
    const { root, parts } = instantiateModel(
      this.model,
      (layer) => this.materials[layer],
      (mesh, layer) => {
        mesh.castShadow = layer === "paint" || layer === "metal";
      }
    );
    const props = [0, 1, 2, 3].map((i) => parts.get(`prop${i}`) ?? root);
    const rec = parts.get("rec") ?? root;
    const lock = parts.get("lock") ?? root;
    // Each drone owns its strip material so opacity can pulse per drone.
    const stripMaterial = this.bag.mat(this.stripBaseMaterial.clone());
    const strip = new THREE.Mesh(this.stripGeometry, stripMaterial);
    strip.rotation.x = -Math.PI / 2;
    strip.renderOrder = 2;
    return new ShaadiDroneVisual(root, props, rec, lock, strip, stripMaterial);
  }
}

class ShaadiDroneVisual implements DroneVisual {
  readonly group = new THREE.Group();
  private time = Math.random() * 10;

  constructor(
    private readonly body: THREE.Group,
    private readonly props: readonly THREE.Object3D[],
    private readonly rec: THREE.Object3D,
    private readonly lock: THREE.Object3D,
    private readonly strip: THREE.Mesh,
    private readonly stripMaterial: THREE.MeshBasicMaterial
  ) {
    this.group.name = "ShaadiDrone";
    this.group.add(body, strip);
    this.group.visible = false;
  }

  reset(): void {
    this.time = Math.random() * 10;
    this.body.rotation.set(0, 0, 0);
    this.strip.visible = true;
  }

  update(delta: number, state: DroneVisualState): void {
    this.time += delta;
    const t = this.time;
    const spin = SHAADI_DRONE.propSpin * delta;
    for (let i = 0; i < this.props.length; i++) this.props[i].rotation.y += i % 2 === 0 ? spin : -spin;
    // Hover bob + gentle wobble; the group (and collider) stays put.
    this.body.position.y = Math.sin(t * SHAADI_DRONE.bobSpeed) * SHAADI_DRONE.bobAmplitude;
    this.body.rotation.z = Math.sin(t * 1.7) * 0.06;

    // Ground telegraph sits on the road below, stretching toward the runner.
    const groundOffset = -this.group.position.y + 0.02;
    this.strip.position.set(0, groundOffset, SHAADI_DRONE.laneStripLength / 2);

    if (state === "warning") {
      // Lock-on: REC light and red halo blink fast, lane strip pulses.
      const blink = Math.sin(t * SHAADI_DRONE.recBlinkWarning * Math.PI * 2) > -0.2;
      this.rec.visible = blink;
      this.lock.visible = blink;
      const pulse = 0.5 + 0.5 * Math.sin(t * 14);
      this.stripMaterial.opacity = SHAADI_DRONE.laneStripOpacityWarning * (0.55 + 0.45 * pulse);
      this.body.rotation.x = 0;
    } else if (state === "charging") {
      this.rec.visible = true;
      this.lock.visible = true;
      this.stripMaterial.opacity = SHAADI_DRONE.laneStripOpacityCharging;
      this.body.rotation.x = SHAADI_DRONE.chargePitch;
    } else {
      this.rec.visible = Math.sin(t * SHAADI_DRONE.recBlink * Math.PI * 2) > 0;
      this.lock.visible = false;
    }
  }
}

function chevronTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const fill = ctx.createLinearGradient(0, 0, 64, 0);
    fill.addColorStop(0, "rgba(255,40,40,0)");
    fill.addColorStop(0.2, "rgba(255,40,40,0.6)");
    fill.addColorStop(0.8, "rgba(255,40,40,0.6)");
    fill.addColorStop(1, "rgba(255,40,40,0)");
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, 64, 256);
    // Chevrons pointing toward the runner (canvas bottom = +Z end).
    ctx.strokeStyle = "rgba(255,235,59,0.95)";
    ctx.lineWidth = 7;
    ctx.lineJoin = "round";
    for (let y = 20; y < 256; y += 42) {
      ctx.beginPath();
      ctx.moveTo(10, y);
      ctx.lineTo(32, y + 16);
      ctx.lineTo(54, y);
      ctx.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function buildDroneModel(): BuiltModel {
  const b = new ModelBuilder(null);
  const pearl = 0xf6f1e7;
  const gold = 0xd4a017;
  const dark = 0x2b2f37;

  // Body shell with a gold band and a domed canopy.
  b.rbox("paint", pearl, [0.34, 0.12, 0.44], 0.05, { p: [0, 0, 0] }, undefined, 2);
  b.box("metal", gold, [0.355, 0.024, 0.455], { p: [0, 0.005, 0] });
  b.sphere("paint", pearl, 1, { p: [0, 0.06, -0.02], s: [0.15, 0.07, 0.19] }, 14, 8);
  b.sphere("metal", gold, 0.028, { p: [0, 0.13, -0.02] }, 8, 6);

  // Arms, motors, prop-blur discs, nav LEDs.
  MOTORS.forEach((m, i) => {
    b.rod("paint", dark, [0, 0.01, 0], [m[0], m[1], m[2]], 0.022, 6);
    b.cyl("metal", dark, 0.046, 0.05, 0.07, { p: [m[0], m[1] + 0.02, m[2]] }, 10);
    b.cyl("metal", gold, 0.05, 0.05, 0.012, { p: [m[0], m[1] - 0.01, m[2]] }, 10);
    b.cyl("cloth", 0xe8f4ff, 0.17, 0.17, 0.003, { p: [m[0], m[1] + 0.07, m[2]] }, 22);
    const led = i < 2 ? (m[0] > 0 ? 0x33ff66 : 0xff3344) : 0xffffff;
    b.sphere("glow", led, 0.018, { p: [m[0], m[1] - 0.035, m[2]] }, 6, 4);
  });

  // Landing skids.
  for (const s of [-1, 1]) {
    b.rod("paint", dark, [s * 0.12, -0.15, -0.2], [s * 0.12, -0.15, 0.2], 0.012, 5);
    b.rod("paint", dark, [s * 0.1, -0.04, 0.1], [s * 0.12, -0.15, 0.12], 0.01, 4);
    b.rod("paint", dark, [s * 0.1, -0.04, -0.1], [s * 0.12, -0.15, -0.12], 0.01, 4);
  }

  // Gimbal camera aimed at the runner.
  b.rod("metal", dark, [0, -0.06, 0.14], [0, -0.1, 0.16], 0.012, 5);
  b.rbox("paint", 0x1b1b1f, [0.11, 0.08, 0.1], 0.02, { p: [0, -0.12, 0.17] });
  b.cyl("paint", 0x111111, 0.034, 0.038, 0.06, { p: [0, -0.12, 0.24], r: [Math.PI / 2, 0, 0] }, 12);
  b.cyl("glow", 0x5c9dff, 0.022, 0.022, 0.005, { p: [0, -0.12, 0.272], r: [Math.PI / 2, 0, 0] }, 10);

  // Shaadi touch: marigold garland slung between the skids.
  marigoldGarland(b, [-0.12, -0.16, 0.19], [0.12, -0.16, 0.19], 0.09, 6, 0.028);
  marigoldGarland(b, [-0.12, -0.16, -0.19], [0.12, -0.16, -0.19], 0.09, 6, 0.028);

  // Props (spin as parts).
  MOTORS.forEach((m, i) => {
    b.part(`prop${i}`, m[0], m[1] + 0.07, m[2]);
    b.box("paint", 0x1b1b1f, [0.3, 0.008, 0.034], { p: [m[0], m[1] + 0.072, m[2]], r: [0, i * 0.8, 0] });
    b.cyl("metal", gold, 0.016, 0.016, 0.02, { p: [m[0], m[1] + 0.078, m[2]] }, 8);
  });

  // Blinking REC light.
  b.part("rec");
  b.sphere("glow", 0xff1a1a, 0.026, { p: [0.13, 0.05, 0.2] }, 8, 6);
  // Lock-on halo + faint red beam to the road (within the collider cube).
  b.part("lock");
  b.torus("glow", 0xff2a2a, 0.5, 0.03, { r: [Math.PI / 2, 0, 0], p: [0, 0.02, 0] }, 4, 32);
  b.cyl("clothArt", 0xff3b3b, 0.12, 0.5, 1.1, { p: [0, -0.6, 0] }, 16, undefined, true);
  b.base();
  return b.build();
}
