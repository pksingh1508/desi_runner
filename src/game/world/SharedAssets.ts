import * as THREE from "three";
import type { ResourceBag } from "@/game/utils/dispose";
import { WORLD } from "@/game/config/gameplay";

function makeBillboardTexture(
  bag: ResourceBag,
  hue: string,
  glyph: "chevrons" | "rings" | "bars"
): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createLinearGradient(0, 0, 256, 128);
  gradient.addColorStop(0, "#0b0f22");
  gradient.addColorStop(1, "#141033");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 128);
  ctx.strokeStyle = hue;
  ctx.lineWidth = 6;
  ctx.shadowColor = hue;
  ctx.shadowBlur = 18;
  if (glyph === "chevrons") {
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(60 + i * 52, 30);
      ctx.lineTo(104 + i * 52, 64);
      ctx.lineTo(60 + i * 52, 98);
      ctx.stroke();
    }
  } else if (glyph === "rings") {
    for (let i = 2; i >= 0; i--) {
      ctx.beginPath();
      ctx.arc(128, 64, 14 + i * 20, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else {
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(48 + i * 40, 96);
      ctx.lineTo(48 + i * 40, 96 - 24 - i * 12);
      ctx.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return bag.tex(texture);
}

/**
 * Per-session shared geometries/materials/textures used by track segments and
 * decorations. One instance per Game keeps disposal ownership unambiguous.
 */
export class SharedAssets {
  readonly roadMat: THREE.MeshStandardMaterial;
  readonly laneStripMat: THREE.MeshBasicMaterial;
  readonly edgeCyanMat: THREE.MeshBasicMaterial;
  readonly edgeMagentaMat: THREE.MeshBasicMaterial;
  readonly dashMat: THREE.MeshBasicMaterial;
  readonly postMat: THREE.MeshStandardMaterial;
  readonly postHeadMat: THREE.MeshBasicMaterial;
  readonly buildingMat: THREE.MeshStandardMaterial;
  readonly bandMats: THREE.MeshBasicMaterial[];
  readonly billboardMats: THREE.MeshBasicMaterial[];

  /** Unit box with origin at its base — scale to size buildings. */
  readonly unitBoxBase: THREE.BoxGeometry;

  constructor(private bag: ResourceBag) {
    this.roadMat = bag.mat(
      new THREE.MeshStandardMaterial({ color: 0x11131f, roughness: 0.85, metalness: 0.25 })
    );
    this.laneStripMat = bag.mat(
      new THREE.MeshBasicMaterial({
        color: 0x27e6ff,
        transparent: true,
        opacity: 0.4,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.edgeCyanMat = bag.mat(
      new THREE.MeshBasicMaterial({ color: 0x27e6ff })
    );
    this.edgeMagentaMat = bag.mat(
      new THREE.MeshBasicMaterial({ color: 0xa64bff })
    );
    this.dashMat = bag.mat(
      new THREE.MeshBasicMaterial({
        color: 0xbfd9ff,
        transparent: true,
        opacity: 0.1,
        depthWrite: false,
      })
    );
    this.postMat = bag.mat(
      new THREE.MeshStandardMaterial({ color: 0x1a2038, roughness: 0.5, metalness: 0.6 })
    );
    this.postHeadMat = bag.mat(new THREE.MeshBasicMaterial({ color: 0x27e6ff }));
    this.buildingMat = bag.mat(
      new THREE.MeshStandardMaterial({ color: 0x0a0d1c, roughness: 0.92, metalness: 0.15 })
    );
    this.bandMats = [0x27e6ff, 0xa64bff, 0xff3fa4].map((color) =>
      bag.mat(new THREE.MeshBasicMaterial({ color }))
    );
    this.billboardMats = (
      [
        ["#27e6ff", "chevrons"],
        ["#a64bff", "rings"],
        ["#ff3fa4", "bars"],
      ] as const
    ).map(([hue, glyph]) =>
      bag.mat(
        new THREE.MeshBasicMaterial({
          map: makeBillboardTexture(this.bag, hue, glyph),
          transparent: true,
          opacity: 0.85,
          side: THREE.DoubleSide,
          depthWrite: false,
        })
      )
    );
    this.unitBoxBase = bag.geo(new THREE.BoxGeometry(1, 1, 1));
    this.unitBoxBase.translate(0, 0.5, 0);
  }

  get segmentLength(): number {
    return WORLD.segmentLength;
  }
}
