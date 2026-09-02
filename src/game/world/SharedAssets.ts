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
  gradient.addColorStop(0, "#ffffff");
  gradient.addColorStop(1, "#e8f4ff");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 128);
  // Vivid Subway graffiti border for daylight readability
  ctx.strokeStyle = hue;
  ctx.lineWidth = 7;
  ctx.shadowColor = hue;
  ctx.shadowBlur = 12;
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
 * BiomeManager mutates the colors of these shared materials live during
 * transitions; billboard texture sets are pre-built per biome.
 */
export class SharedAssets {
  readonly roadMat: THREE.MeshStandardMaterial;
  readonly laneStripMat: THREE.MeshBasicMaterial;
  readonly edgeLimeMat: THREE.MeshBasicMaterial;
  readonly edgeGreenMat: THREE.MeshBasicMaterial;
  readonly dashMat: THREE.MeshBasicMaterial;
  readonly postMat: THREE.MeshStandardMaterial;
  readonly postHeadMat: THREE.MeshBasicMaterial;
  readonly buildingMat: THREE.MeshStandardMaterial;
  readonly bandMats: THREE.MeshBasicMaterial[];
  /** One billboard material set per biome (hue-tinted canvas textures). */
  readonly billboardSets: THREE.MeshBasicMaterial[][];

  /** Unit box with origin at its base — scale to size buildings. */
  readonly unitBoxBase: THREE.BoxGeometry;

  constructor(
    private bag: ResourceBag,
    billboardHueSets: readonly [string, string, string][]
  ) {
    this.roadMat = bag.mat(
      new THREE.MeshStandardMaterial({ color: 0xe6ddc3, roughness: 0.92, metalness: 0.05 })
    );
    this.laneStripMat = bag.mat(
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
      })
    );
    this.edgeLimeMat = bag.mat(
      new THREE.MeshBasicMaterial({ color: 0xfdd013 })
    );
    this.edgeGreenMat = bag.mat(
      new THREE.MeshBasicMaterial({ color: 0x2eb5e5 })
    );
    this.dashMat = bag.mat(
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
      })
    );
    this.postMat = bag.mat(
      new THREE.MeshStandardMaterial({ color: 0xc8c5b8, roughness: 0.48, metalness: 0.18 })
    );
    this.postHeadMat = bag.mat(new THREE.MeshBasicMaterial({ color: 0xfdd013 }));
    this.buildingMat = bag.mat(
      new THREE.MeshStandardMaterial({ color: 0xeae6da, roughness: 0.78, metalness: 0.06 })
    );
    this.bandMats = [0xfdd013, 0xe31902, 0x6aeefd].map((color) =>
      bag.mat(new THREE.MeshBasicMaterial({ color }))
    );
    this.billboardSets = billboardHueSets.map((hues) =>
      hues.map((hue) =>
        bag.mat(
          new THREE.MeshBasicMaterial({
            map: makeBillboardTexture(this.bag, hue, pickGlyph(hue)),
            transparent: true,
            opacity: 0.85,
            side: THREE.DoubleSide,
            depthWrite: false,
          })
        )
      )
    );
    this.unitBoxBase = bag.geo(new THREE.BoxGeometry(1, 1, 1));
    this.unitBoxBase.translate(0, 0.5, 0);
  }

  get segmentLength(): number {
    return WORLD.segmentLength;
  }
}

function pickGlyph(seedHue: string): "chevrons" | "rings" | "bars" {
  const sum = seedHue.charCodeAt(1) + seedHue.charCodeAt(3);
  return sum % 3 === 0 ? "chevrons" : sum % 3 === 1 ? "rings" : "bars";
}
