import * as THREE from "three";
import type { ResourceBag } from "@/game/utils/dispose";
import { COIN, COLORS } from "@/game/config/gameplay";

/**
 * Collectible energy token. Visuals are code-driven (spin + bob); collection
 * state is owned here so the pool can recycle instances cheaply.
 * A pure-gold disc (beveled rim + bright caps, no emblem) for maximum
 * outdoor readability.
 */
export class Coin {
  readonly mesh: THREE.Group;
  active = false;
  collected = false;
  /** When magnetized, visual bobbing is suspended so attraction stays smooth. */
  attracted = false;

  localZ = 0;
  baseY: number = COIN.baseY;
  bobOffset = 0;

  private phase = Math.random() * Math.PI * 2;
  private age = Math.random() * 10;

  constructor(mesh: THREE.Group) {
    this.mesh = mesh;
  }

  get worldX(): number {
    return this.mesh.position.x;
  }

  get worldZ(): number {
    return this.localZ + (this.mesh.parent?.position.z ?? 0);
  }

  /** x is a world-space lateral coordinate (fractional lanes allowed for curves). */
  place(x: number, localZ: number, y: number): void {
    this.localZ = localZ;
    this.baseY = y;
    this.active = true;
    this.collected = false;
    this.attracted = false;
    this.age = Math.random() * 10;
    this.phase = Math.random() * Math.PI * 2;
    this.mesh.visible = true;
    this.mesh.scale.setScalar(1);
    this.mesh.position.set(x, y, localZ);
  }

  updateVisual(delta: number): void {
    if (!this.active || this.collected) return;
    this.age += delta;
    if (this.attracted) return; // magnet owns the position while pulling
    this.mesh.rotation.y += COIN.spinSpeed * delta;
    this.bobOffset = Math.sin(this.age * COIN.bobSpeed + this.phase) * COIN.bobAmplitude;
    this.mesh.position.y = this.baseY + this.bobOffset;
  }

  /**
   * Smoothly accelerates toward the target (magnet pull). Frame-rate
   * independent damping; never teleports.
   */
  pullTowards(targetX: number, targetY: number, lambda: number, delta: number): void {
    const k = 1 - Math.exp(-lambda * delta);
    this.mesh.position.x += (targetX - this.mesh.position.x) * k;
    this.mesh.position.y += (targetY - this.mesh.position.y) * k;
    this.mesh.rotation.y += COIN.spinSpeed * 2.2 * delta;
  }

  /** Quick scale-out pop when collected; returns true once shrink finished. */
  playCollection(delta: number): boolean {
    const next = this.mesh.scale.x - delta * 6;
    if (next <= 0.02) {
      this.mesh.visible = false;
      this.mesh.scale.setScalar(1);
      this.collected = false;
      this.active = false;
      return true;
    }
    this.mesh.scale.setScalar(next);
    return false;
  }
}

/** Shares geometries/materials across every coin instance for a Game session. */
export class CoinFactory {
  private sideGeometry: THREE.CylinderGeometry;
  private capGeometry: THREE.CircleGeometry;
  private edgeGeometry: THREE.TorusGeometry;
  private sideMaterial: THREE.MeshStandardMaterial;
  private capMaterial: THREE.MeshStandardMaterial;
  private capMaterialBack: THREE.MeshStandardMaterial;
  private edgeMaterial: THREE.MeshStandardMaterial;
  private capOffset: number;

  constructor(bag: ResourceBag) {
    // Pure-gold disc — slightly larger than the old token for readability.
    const r = COIN.radius;
    const half = COIN.thickness / 2;
    this.sideGeometry = bag.geo(new THREE.CylinderGeometry(r, r, COIN.thickness, 26));
    this.capGeometry = bag.geo(new THREE.CircleGeometry(r - 0.015, 26));
    this.edgeGeometry = bag.geo(new THREE.TorusGeometry(r, 0.02, 10, 28));
    this.capOffset = half + 0.001;

    // Solid gold, no texture/emblem: bright face that survives daylight.
    this.sideMaterial = bag.mat(
      new THREE.MeshStandardMaterial({
        color: 0xd99a00,
        emissive: 0x6b4a00,
        emissiveIntensity: 0.35,
        metalness: 0.75,
        roughness: 0.3,
      })
    );
    this.capMaterial = bag.mat(
      new THREE.MeshStandardMaterial({
        color: 0xfdd013,
        emissive: 0x7a5c00,
        emissiveIntensity: 0.35,
        metalness: 0.7,
        roughness: 0.26,
      })
    );
    this.capMaterialBack = bag.mat(
      new THREE.MeshStandardMaterial({
        color: 0xfdd013,
        emissive: 0x7a5c00,
        emissiveIntensity: 0.35,
        metalness: 0.7,
        roughness: 0.26,
      })
    );
    this.edgeMaterial = bag.mat(
      new THREE.MeshStandardMaterial({
        color: 0xffe27a,
        emissive: 0x8c6a00,
        emissiveIntensity: 0.4,
        metalness: 0.65,
        roughness: 0.3,
      })
    );
  }

  create(): THREE.Group {
    const group = new THREE.Group();

    const rim = new THREE.Mesh(this.sideGeometry, this.sideMaterial);
    // Cylinder default axis is Y — rotate to face the camera (axis -> Z)
    rim.rotation.x = Math.PI / 2;
    rim.castShadow = true;
    rim.receiveShadow = true;
    group.add(rim);

    const top = new THREE.Mesh(this.capGeometry, this.capMaterial);
    top.position.z = this.capOffset;
    // Circle faces +Z by default — no rotation needed
    top.castShadow = true;
    top.receiveShadow = true;
    group.add(top);

    const bottom = new THREE.Mesh(this.capGeometry, this.capMaterialBack);
    bottom.position.z = -this.capOffset;
    bottom.rotation.y = Math.PI;
    group.add(bottom);

    // Bright outer rim torus for extra outdoor edge contrast (ring in XY)
    const edge = new THREE.Mesh(this.edgeGeometry, this.edgeMaterial);
    // Torus already lies in XY, perfect for a vertical disc facing Z
    group.add(edge);

    // Coins face the runner; group rotates around world Y for spin, but
    // keep the cylinder axis aligned to camera (layout matches original
    // rotateX(PI/2) → now handled by orientation of rim/top).
    // Keep group upright; WorldManager places via position only.
    return group;
  }
}

function makeCoinFaceTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const c = size / 2;

  // Deep gold rim background
  ctx.fillStyle = "#7a5200";
  ctx.beginPath();
  ctx.arc(c, c, c - 2, 0, Math.PI * 2);
  ctx.fill();

  // Radial gold gradient for the face
  const grad = ctx.createRadialGradient(c - 40, c - 55, 42, c, c, 218);
  grad.addColorStop(0, "#fff8cc");
  grad.addColorStop(0.22, "#ffe27a");
  grad.addColorStop(0.42, "#fdd013");
  grad.addColorStop(0.68, "#e8b800");
  grad.addColorStop(0.86, "#c99700");
  grad.addColorStop(1, "#8c6a00");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(c, c, 212, 0, Math.PI * 2);
  ctx.fill();

  // Bevel highlights
  ctx.strokeStyle = "rgba(255, 255, 255, 0.92)";
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(c, c, 206, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = "#6b4f00";
  ctx.lineWidth = 9;
  ctx.globalAlpha = 0.95;
  ctx.beginPath();
  ctx.arc(c, c, 217, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Inner decorative double ring
  ctx.strokeStyle = "rgba(58, 34, 0, 0.42)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(c, c, 162, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(c, c, 158, 0, Math.PI * 2);
  ctx.stroke();

  // Subtle radial pattern ticks (like real coin milling)
  ctx.strokeStyle = "rgba(92, 66, 0, 0.14)";
  ctx.lineWidth = 1.2;
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 20) {
    const r1 = 172, r2 = 188;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a) * r1, c + Math.sin(a) * r1);
    ctx.lineTo(c + Math.cos(a) * r2, c + Math.sin(a) * r2);
    ctx.stroke();
  }

  // Embossed symbol — ₹ (rupee) with strong drop emboss
  ctx.save();
  ctx.translate(c, c + 14);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // Outer hard shadow for punch
  ctx.fillStyle = "#2b1a00";
  ctx.font = "900 190px 'Geist', system-ui, sans-serif";
  // Slight offset for emboss depth
  ctx.fillText("₹", 3, 6);
  // Main glyph gradient (deep brown to warm gold edge)
  const glyphGrad = ctx.createLinearGradient(-64, -72, 64, 72);
  glyphGrad.addColorStop(0, "#3a2200");
  glyphGrad.addColorStop(0.5, "#5a3500");
  glyphGrad.addColorStop(1, "#2b1a00");
  ctx.fillStyle = glyphGrad as unknown as string;
  // Inner highlight stroke for beveled look
  ctx.shadowColor = "rgba(255, 244, 190, 0.9)";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 1.5;
  ctx.fillText("₹", 0, 0);
  ctx.shadowColor = "transparent";
  // Thin highlight edge
  ctx.strokeStyle = "rgba(255, 248, 210, 0.62)";
  ctx.lineWidth = 2.2;
  ctx.strokeText("₹", 0, 0);
  ctx.restore();

  // Specular glint (top-left)
  ctx.globalAlpha = 0.38;
  ctx.fillStyle = "#fffbe0";
  ctx.beginPath();
  ctx.ellipse(c - 78, c - 78, 52, 36, -0.65, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}
