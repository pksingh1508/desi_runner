import * as THREE from "three";
import type { ResourceBag } from "@/game/utils/dispose";
import { PAISA_RAIN } from "@/game/config/events";

/** Paper tints (generic play-money colors, not real currency designs). */
const NOTE_TINTS = [0xff6fae, 0x6fd88a, 0xaf93ff, 0xffb347, 0x55d6ea] as const;

/** Per-note state layout inside one Float32Array. */
const STRIDE = 8;
const X = 0;
const Y = 1;
const Z = 2;
const VY = 3;
const SPIN = 4;
const PHASE = 5;
const ALIVE = 6;

function noteTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#f4f4f4";
    ctx.fillRect(0, 0, 128, 64);
    ctx.strokeStyle = "#8a8a8a";
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, 120, 56);
    ctx.strokeStyle = "#b5b5b5";
    ctx.lineWidth = 1.5;
    for (let x = 64; x < 118; x += 6) {
      ctx.beginPath();
      ctx.moveTo(x, 12);
      ctx.lineTo(x + 8, 52);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(34, 32, 17, 0, Math.PI * 2);
    ctx.fillStyle = "#d0d0d0";
    ctx.fill();
    ctx.fillStyle = "#555555";
    ctx.font = "900 26px 'Arial Black', Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("₹", 34, 33);
    ctx.font = "800 18px 'Arial Narrow', Arial, sans-serif";
    ctx.fillText("DESI", 92, 32);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * "PAISA BAARISH" confetti: rupee-style notes flutter down over the street
 * ahead, scroll with the world and shrink away before reaching the camera.
 * One InstancedMesh; per-note state lives in a flat typed array (no
 * per-frame allocation). Purely cosmetic — the collectible coins are
 * spawned by the WorldManager.
 */
export class PaisaRain {
  private readonly mesh: THREE.InstancedMesh;
  private readonly notes = new Float32Array(PAISA_RAIN.count * STRIDE);
  private readonly dummy = new THREE.Object3D();
  private spawnCarry = 0;
  private cursor = 0;
  private live = 0;
  private time = 0;

  constructor(parent: THREE.Object3D, bag: ResourceBag) {
    const geometry = bag.geo(new THREE.PlaneGeometry(PAISA_RAIN.width, PAISA_RAIN.height));
    const material = bag.mat(
      new THREE.MeshBasicMaterial({ map: bag.tex(noteTexture()), side: THREE.DoubleSide })
    );
    this.mesh = new THREE.InstancedMesh(geometry, material, PAISA_RAIN.count);
    this.mesh.name = "PaisaRain";
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // Instances span the whole street; per-instance culling is not worth it.
    this.mesh.frustumCulled = false;
    const tint = new THREE.Color();
    for (let i = 0; i < PAISA_RAIN.count; i++) {
      tint.setHex(NOTE_TINTS[i % NOTE_TINTS.length]);
      this.mesh.setColorAt(i, tint);
    }
    this.hideAll();
    parent.add(this.mesh);
  }

  /**
   * @param spawning true while the storm is live (notes keep coming)
   * @param worldSpeed street scroll speed so notes travel with the road
   */
  update(delta: number, worldSpeed: number, spawning: boolean): void {
    if (!spawning && this.live === 0) {
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;
    this.time += delta;
    if (spawning) {
      this.spawnCarry += PAISA_RAIN.spawnRate * delta;
      while (this.spawnCarry >= 1) {
        this.spawnCarry -= 1;
        this.spawnOne();
      }
    }

    const n = this.notes;
    const t = this.time;
    const d = this.dummy;
    for (let i = 0; i < PAISA_RAIN.count; i++) {
      const o = i * STRIDE;
      if (n[o + ALIVE] === 0) continue;
      const phase = n[o + PHASE];
      n[o + Y] -= n[o + VY] * delta;
      n[o + Z] += worldSpeed * delta;
      n[o + X] += Math.sin(t * 1.7 + phase) * 0.45 * delta;
      const z = n[o + Z];
      if (n[o + Y] <= 0.05 || z >= PAISA_RAIN.fadeEndZ) {
        n[o + ALIVE] = 0;
        this.live--;
        d.scale.setScalar(0);
        d.updateMatrix();
        this.mesh.setMatrixAt(i, d.matrix);
        continue;
      }
      const fade =
        z < PAISA_RAIN.fadeStartZ ? 1 : (PAISA_RAIN.fadeEndZ - z) / (PAISA_RAIN.fadeEndZ - PAISA_RAIN.fadeStartZ);
      d.position.set(n[o + X], n[o + Y], z);
      d.rotation.set(
        Math.sin(t * 3.1 + phase) * 1.1,
        t * n[o + SPIN] + phase,
        Math.sin(t * 2.3 + phase * 1.7) * 0.8
      );
      d.scale.setScalar(fade);
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear(): void {
    this.notes.fill(0);
    this.live = 0;
    this.spawnCarry = 0;
    this.hideAll();
  }

  private spawnOne(): void {
    const n = this.notes;
    for (let tries = 0; tries < PAISA_RAIN.count; tries++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % PAISA_RAIN.count;
      const o = i * STRIDE;
      if (n[o + ALIVE] !== 0) continue;
      n[o + X] = (Math.random() * 2 - 1) * PAISA_RAIN.halfX;
      n[o + Y] = PAISA_RAIN.minY + Math.random() * (PAISA_RAIN.maxY - PAISA_RAIN.minY);
      n[o + Z] = PAISA_RAIN.farZ + Math.random() * (PAISA_RAIN.nearZ - PAISA_RAIN.farZ);
      n[o + VY] = PAISA_RAIN.fallSpeedMin + Math.random() * (PAISA_RAIN.fallSpeedMax - PAISA_RAIN.fallSpeedMin);
      n[o + SPIN] = (Math.random() < 0.5 ? -1 : 1) * (1.5 + Math.random() * 2.5);
      n[o + PHASE] = Math.random() * Math.PI * 2;
      n[o + ALIVE] = 1;
      this.live++;
      return;
    }
  }

  private hideAll(): void {
    this.dummy.position.set(0, 0, 0);
    this.dummy.rotation.set(0, 0, 0);
    this.dummy.scale.setScalar(0);
    this.dummy.updateMatrix();
    for (let i = 0; i < PAISA_RAIN.count; i++) this.mesh.setMatrixAt(i, this.dummy.matrix);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.visible = false;
  }
}
