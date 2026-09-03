import * as THREE from "three";
import type { ResourceBag } from "@/game/utils/dispose";
import { WORLD } from "@/game/config/gameplay";
import {
  FACADE_PALETTES,
  HOUSE_ROOF_COLORS,
  NEON_SIGN_COLORS,
} from "@/game/config/buildings";

/**
 * Paints a stylized daytime facade: wall color, window grid with warm lit
 * + cool glass panes, and a ground-floor shop (door + striped awning).
 * `floors` picks the window-row density (low-rise houses vs tall blocks).
 */
function makeFacadeTexture(
  bag: ResourceBag,
  body: string,
  base: string,
  trim: string,
  windowLit: string,
  windowGlass: string,
  awning: string,
  floors: number
): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;

  // Wall with a soft top-light gradient.
  ctx.fillStyle = body;
  ctx.fillRect(0, 0, 128, 256);
  const shade = ctx.createLinearGradient(0, 0, 0, 256);
  shade.addColorStop(0, "rgba(255,255,255,0.16)");
  shade.addColorStop(0.55, "rgba(255,255,255,0)");
  shade.addColorStop(1, "rgba(0,0,0,0.14)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, 128, 256);

  // Window grid (kept clear of the shop band at the bottom).
  const shopH = 52;
  const topPad = 12;
  const cols = 3;
  const rows = floors;
  const gridH = 256 - shopH - topPad - 8;
  const cellW = 128 / cols;
  const cellH = gridH / rows;
  let seed = body.length * 31 + floors * 17 + base.length;
  const rand = (): number => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lit = rand() > 0.45;
      const x = c * cellW + cellW * 0.24;
      const y = topPad + r * cellH + cellH * 0.22;
      const w = cellW * 0.52;
      const h = cellH * 0.56;
      // White frame.
      ctx.fillStyle = trim;
      ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
      // Pane.
      ctx.fillStyle = lit ? windowLit : windowGlass;
      if (lit) {
        ctx.shadowColor = windowLit;
        ctx.shadowBlur = 6;
      }
      ctx.fillRect(x, y, w, h);
      ctx.shadowBlur = 0;
      // Glass shine slash on unlit panes.
      if (!lit) {
        ctx.fillStyle = "rgba(255,255,255,0.55)";
        ctx.beginPath();
        ctx.moveTo(x, y + h);
        ctx.lineTo(x + w * 0.45, y);
        ctx.lineTo(x + w * 0.7, y);
        ctx.lineTo(x + w * 0.25, y + h);
        ctx.closePath();
        ctx.fill();
      }
      // Tiny sill.
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.fillRect(x - 2, y + h + 2, w + 4, 2);
    }
  }

  // Ground-floor shop band.
  const bandY = 256 - shopH;
  ctx.fillStyle = base;
  ctx.fillRect(0, bandY, 128, shopH);
  ctx.fillStyle = "rgba(255,255,255,0.20)";
  ctx.fillRect(0, bandY, 128, 3);
  // Striped awning.
  const awnY = bandY + 6;
  const awnH = 12;
  const stripes = 8;
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = i % 2 === 0 ? awning : "#ffffff";
    ctx.fillRect((128 / stripes) * i, awnY, 128 / stripes + 1, awnH);
  }
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.fillRect(0, awnY + awnH, 128, 2);
  // Door + shop windows.
  ctx.fillStyle = "rgba(30,32,44,0.88)";
  ctx.fillRect(52, bandY + 24, 24, 28);
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.fillRect(54, bandY + 26, 9, 12);
  ctx.fillStyle = windowLit;
  ctx.fillRect(12, bandY + 26, 28, 16);
  ctx.fillRect(88, bandY + 26, 28, 16);
  ctx.strokeStyle = trim;
  ctx.lineWidth = 2;
  ctx.strokeRect(12, bandY + 26, 28, 16);
  ctx.strokeRect(88, bandY + 26, 28, 16);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return bag.tex(texture);
}

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

  // ---- Roadside buildings (procedural houses + city blocks) ----
  /** Low-rise facade variants (2-3 window rows + shopfront), one per palette. */
  readonly facadeLowMats: THREE.MeshStandardMaterial[];
  /** High-rise facade variants (6 window rows + shopfront), one per palette. */
  readonly facadeHighMats: THREE.MeshStandardMaterial[];
  /** Pitched house-roof colors. */
  readonly houseRoofMats: THREE.MeshStandardMaterial[];
  /** Flat-block parapet trim + rooftop tank. */
  readonly flatRoofMat: THREE.MeshStandardMaterial;
  readonly tankMat: THREE.MeshStandardMaterial;
  /** Neon shop signs (pulsed in TrackSegment.updateVisual). */
  readonly signMats: THREE.MeshBasicMaterial[];
  /** Rooftop beacon (blink via per-mesh scale, material stays shared). */
  readonly beaconMat: THREE.MeshBasicMaterial;
  /** Side aprons + sidewalks buildings sit on (no more floating slabs). */
  readonly sideGroundMat: THREE.MeshStandardMaterial;
  readonly sidewalkMat: THREE.MeshStandardMaterial;
  /** Shared detail geometries (all base-origin where it matters). */
  readonly pitchedRoofGeo: THREE.ConeGeometry;
  readonly tankGeo: THREE.CylinderGeometry;
  readonly beaconGeo: THREE.SphereGeometry;
  readonly signGeo: THREE.PlaneGeometry;

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

    this.facadeLowMats = FACADE_PALETTES.map((p) =>
      bag.mat(
        new THREE.MeshStandardMaterial({
          map: makeFacadeTexture(bag, p.body, p.base, p.trim, p.windowLit, p.windowGlass, p.awning, 3),
          roughness: 0.85,
          metalness: 0.04,
        })
      )
    );
    this.facadeHighMats = FACADE_PALETTES.map((p) =>
      bag.mat(
        new THREE.MeshStandardMaterial({
          map: makeFacadeTexture(bag, p.body, p.base, p.trim, p.windowLit, p.windowGlass, p.awning, 6),
          roughness: 0.85,
          metalness: 0.04,
        })
      )
    );
    this.houseRoofMats = HOUSE_ROOF_COLORS.map(
      (color) =>
        bag.mat(
          new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.08 })
        ) as THREE.MeshStandardMaterial
    );
    this.flatRoofMat = bag.mat(
      new THREE.MeshStandardMaterial({ color: 0xfff8ee, roughness: 0.8, metalness: 0.05 })
    );
    this.tankMat = bag.mat(
      new THREE.MeshStandardMaterial({ color: 0xb08968, roughness: 0.75, metalness: 0.1 })
    );
    this.signMats = NEON_SIGN_COLORS.map(
      (color) =>
        bag.mat(
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 })
        ) as THREE.MeshBasicMaterial
    );
    this.beaconMat = bag.mat(
      new THREE.MeshBasicMaterial({ color: 0xff5a3c, transparent: true, opacity: 0.95 })
    );
    this.sideGroundMat = bag.mat(
      new THREE.MeshStandardMaterial({ color: 0xcfd8cc, roughness: 0.95, metalness: 0 })
    );
    this.sidewalkMat = bag.mat(
      new THREE.MeshStandardMaterial({ color: 0xf2ede0, roughness: 0.9, metalness: 0 })
    );
    this.pitchedRoofGeo = bag.geo(new THREE.ConeGeometry(0.78, 1, 4, 1));
    this.pitchedRoofGeo.rotateY(Math.PI / 4);
    this.pitchedRoofGeo.translate(0, 0.5, 0);
    this.tankGeo = bag.geo(new THREE.CylinderGeometry(0.55, 0.6, 1.4, 10));
    this.tankGeo.translate(0, 0.7, 0);
    this.beaconGeo = bag.geo(new THREE.SphereGeometry(0.22, 10, 8));
    this.signGeo = bag.geo(new THREE.PlaneGeometry(0.9, 2.4));
  }

  get segmentLength(): number {
    return WORLD.segmentLength;
  }
}

function pickGlyph(seedHue: string): "chevrons" | "rings" | "bars" {
  const sum = seedHue.charCodeAt(1) + seedHue.charCodeAt(3);
  return sum % 3 === 0 ? "chevrons" : sum % 3 === 1 ? "rings" : "bars";
}
