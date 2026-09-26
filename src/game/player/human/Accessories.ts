import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { Accessory, HumanOutfit } from "@/game/config/characters";
import type { BodyLandmarks } from "@/game/config/humanRig";
import { ClothTail } from "./ClothTail";

/**
 * Bone-attached desi accessories for the realistic runners.
 *
 * Everything is authored in the body's BIND space (T-pose, Y-up, face +Z),
 * using landmarks measured from the actual mesh (forehead, eyes, ears, wrist
 * radius…) so props sit correctly on either body. `attachToBone` bakes the
 * bone's inverse bind matrix into a holder, so a prop placed in bind space
 * follows its bone rigidly through every animation.
 */

export interface AccessoryBuildResult {
  tails: ClothTail[];
}

/** Resources created for one rig — disposed with it. */
export interface OwnedResources {
  geometries: THREE.BufferGeometry[];
  materials: THREE.Material[];
  textures: THREE.Texture[];
}

interface HeadLandmarks {
  eyeY: number;
  eyeX: number;
  eyeFrontZ: number;
  foreheadZ: number;
  noseTipZ: number;
  lipY: number;
  lipZ: number;
  earX: number;
  earY: number;
  earZ: number;
  skullCenter: THREE.Vector3;
  skullRadius: number;
  backZAtShoulder: number;
  neckRadius: number;
  neckCenterZ: number;
  wristRadius: number;
  armCenterZ: number;
  /** Bind-space foot box (per side, mirrored in x). */
  footCenterX: number;
  footMinZ: number;
  footMaxZ: number;
  footHalfWidth: number;
  footTopY: number;
}

export function attachToBone(object: THREE.Object3D, skeleton: THREE.Skeleton, boneName: string): boolean {
  const index = skeleton.bones.findIndex((bone) => bone.name === boneName);
  if (index < 0) return false;
  const holder = new THREE.Group();
  holder.name = `${object.name || "prop"}_holder`;
  holder.matrixAutoUpdate = false;
  holder.matrix.copy(skeleton.boneInverses[index]);
  holder.add(object);
  skeleton.bones[index].add(holder);
  return true;
}

export function boneLocalPoint(skeleton: THREE.Skeleton, boneName: string, bindPoint: THREE.Vector3): {
  bone: THREE.Bone;
  local: THREE.Vector3;
} | null {
  const index = skeleton.bones.findIndex((bone) => bone.name === boneName);
  if (index < 0) return null;
  return {
    bone: skeleton.bones[index],
    local: bindPoint.clone().applyMatrix4(skeleton.boneInverses[index]),
  };
}

/** Scans the bind-pose body mesh for face/arm landmarks (runs once per rig). */
export function measureBody(
  body: THREE.BufferGeometry,
  eyes: THREE.BufferGeometry | null,
  land: BodyLandmarks
): HeadLandmarks {
  const pos = body.getAttribute("position") as THREE.BufferAttribute;
  const count = pos.count;

  let eyeY = land.headY + 0.1;
  let eyeX = 0.032;
  let eyeFrontZ = 0.08;
  if (eyes) {
    eyes.computeBoundingBox();
    const box = eyes.boundingBox!;
    eyeY = (box.min.y + box.max.y) / 2;
    eyeX = Math.max(0.02, box.max.x * 0.62);
    eyeFrontZ = box.max.z;
  }

  const maxZNear = (x: number, y: number, tol: number): number => {
    let best = -Infinity;
    for (let i = 0; i < count; i++) {
      const vx = pos.getX(i);
      const vy = pos.getY(i);
      if (Math.abs(vx - x) > tol || Math.abs(vy - y) > tol) continue;
      const vz = pos.getZ(i);
      if (vz > best) best = vz;
    }
    return best === -Infinity ? eyeFrontZ : best;
  };
  const minZNear = (x: number, y: number, tol: number): number => {
    let best = Infinity;
    for (let i = 0; i < count; i++) {
      const vx = pos.getX(i);
      const vy = pos.getY(i);
      if (Math.abs(vx - x) > tol || Math.abs(vy - y) > tol) continue;
      const vz = pos.getZ(i);
      if (vz < best) best = vz;
    }
    return best === Infinity ? -0.12 : best;
  };

  const foreheadZ = maxZNear(0, eyeY + 0.035, 0.012);
  const noseTipZ = maxZNear(0, eyeY - 0.04, 0.012);
  const lipY = eyeY - 0.068;
  const lipZ = maxZNear(0, lipY, 0.01);

  // Ears: outermost head vertices around eye height, near the head's mid-plane.
  let earX = 0.075;
  let earZ = -0.01;
  let earBest = 0;
  for (let i = 0; i < count; i++) {
    const vy = pos.getY(i);
    if (vy < eyeY - 0.05 || vy > eyeY + 0.01) continue;
    const vz = pos.getZ(i);
    if (vz < -0.07 || vz > 0.05) continue;
    const vx = Math.abs(pos.getX(i));
    if (vx > 0.13) continue;
    if (vx > earBest) {
      earBest = vx;
      earZ = vz;
    }
  }
  if (earBest > 0.04) earX = earBest;
  const earY = eyeY - 0.045;

  // Skull: from forehead / crown / back of head.
  const backHeadZ = minZNear(0, eyeY + 0.02, 0.015);
  const skullCenter = new THREE.Vector3(0, (eyeY + land.headTopY) / 2, (foreheadZ + backHeadZ) / 2);
  const skullRadius = Math.max(0.085, (foreheadZ - backHeadZ) / 2);

  const backZAtShoulder = minZNear(land.shoulderX * 0.55, land.armY - 0.02, 0.03);

  // Neck: radius around its centre just below the jaw.
  let neckMinZ = Infinity;
  let neckMaxZ = -Infinity;
  let neckMaxX = 0;
  for (let i = 0; i < count; i++) {
    const vy = pos.getY(i);
    if (Math.abs(vy - (land.neckY + 0.02)) > 0.012) continue;
    const vx = Math.abs(pos.getX(i));
    if (vx > 0.1) continue;
    const vz = pos.getZ(i);
    neckMinZ = Math.min(neckMinZ, vz);
    neckMaxZ = Math.max(neckMaxZ, vz);
    neckMaxX = Math.max(neckMaxX, vx);
  }
  const neckRadius = Number.isFinite(neckMinZ) ? Math.max(0.045, Math.max(neckMaxX, (neckMaxZ - neckMinZ) / 2)) : 0.06;
  const neckCenterZ = Number.isFinite(neckMinZ) ? (neckMinZ + neckMaxZ) / 2 : -0.02;

  // Forearm just behind the wrist: centre + radius.
  let sumY = 0;
  let sumZ = 0;
  let n = 0;
  const x0 = land.wristX - 0.055;
  const x1 = land.wristX - 0.025;
  for (let i = 0; i < count; i++) {
    const vx = pos.getX(i);
    if (vx < x0 || vx > x1) continue;
    const vy = pos.getY(i);
    if (Math.abs(vy - land.armY) > 0.08) continue;
    sumY += vy;
    sumZ += pos.getZ(i);
    n++;
  }
  const armCenterY = n > 0 ? sumY / n : land.armY;
  const armCenterZ = n > 0 ? sumZ / n : -0.065;
  let wristRadius = 0.03;
  for (let i = 0; i < count; i++) {
    const vx = pos.getX(i);
    if (vx < x0 || vx > x1) continue;
    const dy = pos.getY(i) - armCenterY;
    const dz = pos.getZ(i) - armCenterZ;
    const r = Math.sqrt(dy * dy + dz * dz);
    if (r < 0.07) wristRadius = Math.max(wristRadius, r);
  }

  // Feet: everything below the ankle on the +x (left) side.
  let fMinZ = Infinity;
  let fMaxZ = -Infinity;
  let fMinX = Infinity;
  let fMaxX = -Infinity;
  const footTop = land.ankleY + 0.035;
  for (let i = 0; i < count; i++) {
    const vy = pos.getY(i);
    if (vy > footTop) continue;
    const vx = pos.getX(i);
    if (vx <= 0.01) continue;
    const vz = pos.getZ(i);
    fMinZ = Math.min(fMinZ, vz);
    fMaxZ = Math.max(fMaxZ, vz);
    fMinX = Math.min(fMinX, vx);
    fMaxX = Math.max(fMaxX, vx);
  }
  const footOk = Number.isFinite(fMinZ) && Number.isFinite(fMinX);

  return {
    footCenterX: footOk ? (fMinX + fMaxX) / 2 : land.hipX,
    footMinZ: footOk ? fMinZ : -0.13,
    footMaxZ: footOk ? fMaxZ : 0.15,
    footHalfWidth: footOk ? (fMaxX - fMinX) / 2 : 0.05,
    footTopY: footTop,
    eyeY,
    eyeX,
    eyeFrontZ,
    foreheadZ,
    noseTipZ,
    lipY,
    lipZ,
    earX,
    earY,
    earZ,
    skullCenter,
    skullRadius,
    backZAtShoulder,
    neckRadius,
    neckCenterZ,
    wristRadius,
    armCenterZ,
  };
}

// --------------------------------------------------------------- builders

export function buildAccessories(
  skinned: THREE.SkinnedMesh,
  eyes: THREE.Mesh | null,
  outfit: HumanOutfit,
  land: BodyLandmarks,
  owned: OwnedResources
): AccessoryBuildResult {
  const skeleton = skinned.skeleton;
  const m = measureBody(skinned.geometry, eyes?.geometry ?? null, land);
  const tails: ClothTail[] = [];
  const geo = <T extends THREE.BufferGeometry>(g: T): T => {
    owned.geometries.push(g);
    return g;
  };
  const mat = <T extends THREE.Material>(material: T): T => {
    owned.materials.push(material);
    return material;
  };
  const std = (color: THREE.ColorRepresentation, roughness = 0.8, metalness = 0, extra: THREE.MeshStandardMaterialParameters = {}) =>
    mat(new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra }));

  const has = (a: Accessory): boolean => outfit.accessories.includes(a);
  const gold = std(0xd4a52c, 0.32, 1.0);

  // Sneakers / shoes on every runner: rigid shells on the foot bones hide the
  // base mesh's bare toes and give a proper silhouette.
  {
    const upperMat = std(outfit.shoes.color, 0.55, 0.02);
    const soleMat = std(outfit.shoes.sole, 0.7);
    const trimMat = std(new THREE.Color(outfit.shoes.color).lerp(new THREE.Color(outfit.shoes.sole), 0.55), 0.6);
    const length = m.footMaxZ - m.footMinZ + 0.018;
    const width = m.footHalfWidth * 2 + 0.01;
    const radius = width / 2;
    // Capsule along Z = rounded toe + heel; flattened into a low sneaker.
    const upperGeo = geo(new THREE.CapsuleGeometry(radius, Math.max(0.01, length - width), 6, 14));
    upperGeo.rotateX(Math.PI / 2);
    const upperH = Math.max(0.065, m.footTopY * 0.75);
    const soleGeo = geo(new RoundedBoxGeometry(width + 0.004, 0.022, length - 0.004, 2, 0.01));
    // Ankle collar where the shoe opening meets the leg.
    const collarGeo = geo(new THREE.CylinderGeometry(radius * 0.86, radius * 0.95, upperH * 0.55, 14, 1, true));
    const centerZ = (m.footMinZ + m.footMaxZ) / 2;
    for (const side of [-1, 1] as const) {
      const shoe = new THREE.Group();
      shoe.name = "Sneaker";
      const x = side * m.footCenterX;
      const upper = new THREE.Mesh(upperGeo, upperMat);
      upper.scale.set(1, upperH / width, 1);
      upper.position.set(x, 0.02 + upperH * 0.36, centerZ + 0.004);
      upper.castShadow = true;
      const sole = new THREE.Mesh(soleGeo, soleMat);
      sole.position.set(x, 0.011, centerZ + 0.004);
      sole.castShadow = true;
      const collar = new THREE.Mesh(collarGeo, trimMat);
      collar.position.set(x, 0.026 + upperH * 0.78, m.footMinZ + radius * 1.25);
      shoe.add(upper, sole, collar);
      attachToBone(shoe, skeleton, side > 0 ? "foot_l" : "foot_r");
    }
  }

  if (has("turban")) {
    const group = buildTurban(m, outfit.accessoryColor, outfit.accessoryColor2, geo, std, owned);
    attachToBone(group, skeleton, "Head");
  }

  if (has("mustache")) {
    const y = m.lipY + 0.018;
    const z = Math.max(m.lipZ, m.noseTipZ - 0.02) + 0.004;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.052, y - 0.002, z - 0.03),
      new THREE.Vector3(-0.044, y - 0.012, z - 0.016),
      new THREE.Vector3(-0.024, y - 0.004, z - 0.004),
      new THREE.Vector3(0, y + 0.002, z),
      new THREE.Vector3(0.024, y - 0.004, z - 0.004),
      new THREE.Vector3(0.044, y - 0.012, z - 0.016),
      new THREE.Vector3(0.052, y - 0.002, z - 0.03),
    ]);
    const mesh = new THREE.Mesh(
      geo(new THREE.TubeGeometry(curve, 24, 0.0068, 8, false)),
      std(outfit.hairColor, 0.75)
    );
    mesh.name = "Mustache";
    mesh.scale.set(1, 0.72, 1);
    mesh.position.y = y * (1 - 0.72);
    attachToBone(mesh, skeleton, "Head");
  }

  if (has("aviators")) {
    const group = new THREE.Group();
    group.name = "Aviators";
    const lensMat = std(0x10161f, 0.06, 0.85, { envMapIntensity: 1.6 });
    const frameMat = std(0xc9a441, 0.28, 1.0);
    const lensGeo = geo(new THREE.CircleGeometry(0.0225, 24));
    const rimGeo = geo(new THREE.TorusGeometry(0.0225, 0.0022, 6, 28));
    const z = m.eyeFrontZ + 0.02;
    for (const side of [-1, 1]) {
      const lens = new THREE.Mesh(lensGeo, lensMat);
      lens.scale.set(1.18, 0.96, 1);
      lens.position.set(side * m.eyeX, m.eyeY - 0.003, z);
      const rim = new THREE.Mesh(rimGeo, frameMat);
      rim.scale.copy(lens.scale);
      rim.position.copy(lens.position);
      const templeLen = Math.max(0.04, z - m.earZ);
      const temple = new THREE.Mesh(geo(new THREE.BoxGeometry(0.003, 0.004, templeLen)), frameMat);
      temple.position.set(side * (m.earX - 0.004), m.eyeY + 0.004, z - templeLen / 2);
      group.add(lens, rim, temple);
    }
    const bridge = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.0018, 0.0018, m.eyeX * 2 - 0.05, 6)), frameMat);
    bridge.rotation.z = Math.PI / 2;
    bridge.position.set(0, m.eyeY + 0.008, z + 0.001);
    group.add(bridge);
    attachToBone(group, skeleton, "Head");
  }

  if (has("bindi")) {
    const bindi = new THREE.Mesh(geo(new THREE.CircleGeometry(0.0058, 18)), std(0xc4122f, 0.35, 0, { emissive: 0x3a0008 }));
    bindi.name = "Bindi";
    bindi.position.set(0, m.eyeY + 0.03, m.foreheadZ + 0.0025);
    attachToBone(bindi, skeleton, "Head");
  }

  if (has("tilak")) {
    const tilak = new THREE.Group();
    tilak.name = "Tilak";
    const line = new THREE.Mesh(geo(new THREE.PlaneGeometry(0.008, 0.042)), std(0xff6a00, 0.6, 0, { emissive: 0x401800 }));
    line.position.set(0, m.eyeY + 0.045, m.foreheadZ + 0.0015);
    line.rotation.x = -0.18;
    const dot = new THREE.Mesh(geo(new THREE.CircleGeometry(0.0048, 16)), std(0xb3001b, 0.4));
    dot.position.set(0, m.eyeY + 0.025, m.foreheadZ + 0.0035);
    tilak.add(line, dot);
    attachToBone(tilak, skeleton, "Head");
  }

  if (has("jhumka")) {
    const group = new THREE.Group();
    group.name = "Jhumka";
    const studGeo = geo(new THREE.SphereGeometry(0.0055, 10, 8));
    const bellGeo = geo(new THREE.ConeGeometry(0.011, 0.018, 12, 1, true));
    const beadGeo = geo(new THREE.SphereGeometry(0.0026, 6, 5));
    const beadMat = std(0xc2185b, 0.3, 0.1, { emissive: 0x2a0010 });
    for (const side of [-1, 1]) {
      const x = side * (m.earX - 0.004);
      const stud = new THREE.Mesh(studGeo, gold);
      stud.position.set(x, m.earY, m.earZ + 0.004);
      const bell = new THREE.Mesh(bellGeo, gold);
      bell.position.set(x, m.earY - 0.02, m.earZ + 0.004);
      const bead = new THREE.Mesh(beadGeo, beadMat);
      bead.position.set(x, m.earY - 0.032, m.earZ + 0.004);
      group.add(stud, bell, bead);
    }
    attachToBone(group, skeleton, "Head");
  }

  const wristRing = (side: -1 | 1, offset: number, radius: number, tube: number, material: THREE.Material, name: string): void => {
    const ring = new THREE.Mesh(geo(new THREE.TorusGeometry(radius, tube, 8, 28)), material);
    ring.name = name;
    ring.rotation.y = Math.PI / 2;
    ring.position.set(side * (land.wristX - offset), land.armY, m.armCenterZ);
    attachToBone(ring, skeleton, side < 0 ? "lowerarm_r" : "lowerarm_l");
  };

  if (has("bangles")) {
    const glass = std(outfit.accessoryColor2, 0.25, 0.1, { emissive: new THREE.Color(outfit.accessoryColor2).multiplyScalar(0.12) });
    for (const side of [-1, 1] as const) {
      wristRing(side, 0.03, m.wristRadius + 0.005, 0.0042, gold, "Bangle");
      wristRing(side, 0.041, m.wristRadius + 0.0055, 0.0042, glass, "Bangle");
      wristRing(side, 0.052, m.wristRadius + 0.006, 0.0042, gold, "Bangle");
    }
  }

  if (has("sweatband")) {
    const band = std(outfit.accessoryColor, 0.98);
    const stripe = std(outfit.accessoryColor2, 0.9);
    for (const side of [-1, 1] as const) {
      const r = m.wristRadius + 0.006;
      const cuff = new THREE.Mesh(geo(new THREE.CylinderGeometry(r, r, 0.05, 20)), band);
      cuff.name = "Sweatband";
      cuff.rotation.z = Math.PI / 2;
      cuff.position.set(side * (land.wristX - 0.045), land.armY, m.armCenterZ);
      attachToBone(cuff, skeleton, side < 0 ? "lowerarm_r" : "lowerarm_l");
      const line = new THREE.Mesh(geo(new THREE.CylinderGeometry(r + 0.0008, r + 0.0008, 0.01, 20)), stripe);
      line.rotation.z = Math.PI / 2;
      line.position.set(side * (land.wristX - 0.045), land.armY, m.armCenterZ);
      attachToBone(line, skeleton, side < 0 ? "lowerarm_r" : "lowerarm_l");
    }
  }

  if (has("gamcha") || has("dupatta")) {
    const isDupatta = has("dupatta");
    const texture = makeClothTexture(isDupatta ? "border" : "checks", outfit.accessoryColor, outfit.accessoryColor2);
    owned.textures.push(texture);
    const clothMat = std(0xffffff, 0.92, 0, { map: texture, side: THREE.DoubleSide });

    // Wrap around the neck/shoulders.
    const wrap = new THREE.Mesh(
      geo(new THREE.TorusGeometry(m.neckRadius + 0.03, isDupatta ? 0.02 : 0.024, 10, 28)),
      clothMat
    );
    wrap.name = isDupatta ? "DupattaWrap" : "GamchaWrap";
    wrap.rotation.x = Math.PI / 2 - 0.25;
    wrap.scale.set(1.12, 1, 1);
    wrap.position.set(0, land.neckY - 0.03, m.neckCenterZ + 0.005);
    attachToBone(wrap, skeleton, "spine_03");

    const anchors = isDupatta ? [-1, 1] : [1];
    for (const side of anchors) {
      const bindPoint = new THREE.Vector3(side * land.shoulderX * 0.5, land.armY - 0.01, m.backZAtShoulder - 0.012);
      const widthPoint = bindPoint.clone().add(new THREE.Vector3(side * 0.1, 0, 0));
      const anchor = boneLocalPoint(skeleton, "spine_03", bindPoint);
      const widthAnchor = boneLocalPoint(skeleton, "spine_03", widthPoint);
      if (!anchor || !widthAnchor) continue;
      tails.push(
        new ClothTail({
          bone: anchor.bone,
          anchorLocal: anchor.local,
          widthLocal: widthAnchor.local,
          length: isDupatta ? 1.1 : 0.55,
          width: isDupatta ? 0.3 : 0.14,
          material: clothMat,
          phase: side * 1.7,
        })
      );
    }
  }

  return { tails };
}

function buildTurban(
  m: HeadLandmarks,
  color: string,
  accent: string,
  geo: <T extends THREE.BufferGeometry>(g: T) => T,
  std: (c: THREE.ColorRepresentation, r?: number, mt?: number, extra?: THREE.MeshStandardMaterialParameters) => THREE.MeshStandardMaterial,
  owned: OwnedResources
): THREE.Group {
  const group = new THREE.Group();
  group.name = "Turban";
  const folds = makeTurbanTexture(color);
  owned.textures.push(folds);
  const cloth = std(0xffffff, 0.84, 0, { map: folds });
  const clothDark = std(new THREE.Color(color).multiplyScalar(0.78), 0.88);
  const trim = std(accent, 0.7);
  const c = m.skullCenter;
  const r = m.skullRadius * 1.3;
  const tilt = -0.3; // top leans back: rim rises at the forehead, drops to the nape
  const center = new THREE.Vector3(0, c.y - 0.02, c.z - 0.012);

  // Dome covering forehead → crown → nape.
  const crown = new THREE.Mesh(geo(new THREE.SphereGeometry(r, 36, 24, 0, Math.PI * 2, 0, Math.PI * 0.64)), cloth);
  crown.scale.set(0.97, 1.02, 1.14);
  crown.position.copy(center);
  crown.rotation.x = tilt;
  crown.castShadow = true;
  group.add(crown);

  // Wrapped layers: tilted rings hugging the dome for a stacked silhouette.
  const layers = 4;
  for (let i = 0; i < layers; i++) {
    const t = i / (layers - 1);
    const ringRadius = r * (0.96 - t * 0.14);
    const band = new THREE.Mesh(
      geo(new THREE.TorusGeometry(ringRadius, 0.014, 8, 40)),
      i % 2 === 0 ? cloth : clothDark
    );
    band.scale.set(0.97, 1.14, 1);
    band.rotation.set(Math.PI / 2 + tilt + (i % 2 === 0 ? 0.16 : -0.16), 0, 0);
    band.position.set(center.x, center.y - r * 0.18 + t * r * 0.55, center.z - t * 0.01);
    group.add(band);
  }

  // Front peak where the folds cross + a patka trim along the rim.
  const peak = new THREE.Mesh(geo(new THREE.ConeGeometry(0.032, 0.07, 4)), cloth);
  peak.position.set(0, center.y + r * 0.5, center.z + r * 0.95);
  peak.rotation.set(0.9, Math.PI / 4, 0);
  peak.scale.set(1, 1, 0.55);
  const rim = new THREE.Mesh(geo(new THREE.TorusGeometry(r * 0.935, 0.007, 6, 44)), trim);
  rim.scale.set(0.97, 1.14, 1);
  rim.rotation.set(Math.PI / 2 + tilt, 0, 0);
  rim.position.set(center.x, center.y - r * 0.36, center.z);
  group.add(peak, rim);
  return group;
}

/** Diagonal fold lines for the turban cloth. */
function makeTurbanTexture(color: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 128, 128);
  for (let i = -6; i < 14; i++) {
    const x = i * 12;
    const grad = ctx.createLinearGradient(x, 0, x + 12, 0);
    grad.addColorStop(0, "rgba(0,0,0,0.22)");
    grad.addColorStop(0.35, "rgba(255,255,255,0.10)");
    grad.addColorStop(1, "rgba(0,0,0,0.05)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 12, 0);
    ctx.lineTo(x + 12 + 40, 128);
    ctx.lineTo(x + 40, 128);
    ctx.closePath();
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.repeat.set(2, 1);
  return texture;
}

/** Small canvas prints: gamcha checks / dupatta with a gota border. */
function makeClothTexture(kind: "checks" | "border", colorA: string, colorB: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  if (kind === "checks") {
    ctx.fillStyle = colorB;
    ctx.fillRect(0, 0, 64, 128);
    ctx.fillStyle = colorA;
    for (let i = 0; i < 8; i++) {
      ctx.globalAlpha = 0.85;
      ctx.fillRect(i * 8, 0, 4, 128);
      ctx.fillRect(0, i * 16, 64, 6);
    }
    ctx.globalAlpha = 1;
  } else {
    const grad = ctx.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, colorA);
    grad.addColorStop(1, colorA);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 128);
    // Sheer fabric sheen stripes.
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    for (let i = 0; i < 6; i++) ctx.fillRect(10 + i * 8, 0, 2, 128);
    // Gota-patti border on both long edges + a tassel end.
    ctx.fillStyle = colorB;
    ctx.fillRect(0, 0, 7, 128);
    ctx.fillRect(57, 0, 7, 128);
    ctx.fillStyle = "#f7d774";
    for (let y = 2; y < 128; y += 6) {
      ctx.fillRect(2, y, 3, 3);
      ctx.fillRect(59, y, 3, 3);
    }
    ctx.fillStyle = colorB;
    ctx.fillRect(0, 118, 64, 10);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
