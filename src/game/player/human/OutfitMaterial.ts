import * as THREE from "three";
import type { HumanOutfit, TopStyle } from "@/game/config/characters";
import type { BodyLandmarks } from "@/game/config/humanRig";

/**
 * Data-driven clothing for the realistic base bodies.
 *
 * The CC0 base characters ship as athletes in underwear. Instead of shipping
 * a texture per outfit, the body material classifies every fragment by its
 * BIND-POSE position/normal (T-pose, Y-up, face +Z — captured before
 * skinning, so garments stay glued to the body while it animates) and paints
 * skin, top, bottom and shoes procedurally: sleeve length, neckline, hem,
 * waistband, track-pant stripes, cuffs, collar bands, back prints, fabric
 * grain and elbow/knee creases. Cloth gets its own roughness and a softened
 * normal map so muscles don't show through the fabric.
 *
 * One shader program serves every runner (all variation lives in uniforms).
 */

/** Mean linear albedo of the base skin texture (measured offline). */
const SKIN_ALBEDO_LINEAR = [0.395, 0.181, 0.084] as const;

const TOP_STYLE_INDEX: Record<TopStyle, number> = {
  tee: 0,
  tank: 1,
  kurta: 2,
  jacket: 3,
  shirt: 4,
};

const SLEEVE_T = { none: -0.12, short: 0.34, elbow: 0.56, long: 0.975 } as const;
const MOTIF_INDEX = { none: 0, stripes: 1, number: 2, chevron: 3, border: 4 } as const;

export interface OutfitUniforms {
  [name: string]: THREE.IUniform;
}

export function createOutfitMaterial(
  source: THREE.MeshStandardMaterial,
  outfit: HumanOutfit,
  land: BodyLandmarks
): THREE.MeshStandardMaterial {
  const material = source.clone();
  material.name = `Outfit_${outfit.body}`;
  // glTF metallicRoughness packs grayscale roughness in every channel;
  // metalness must stay off for skin/cloth.
  material.metalness = 0;
  material.metalnessMap = null;

  const top = outfit.top;
  const bottom = outfit.bottom;
  const hemY = topHemY(top.style, land);
  const cuffY =
    bottom.style === "full" ? land.ankleY + 0.04 : bottom.style === "capri" ? land.kneeY - 0.17 : land.kneeY + 0.08;
  const neckDrop = top.style === "kurta" ? 0.1 : top.style === "shirt" ? 0.07 : top.style === "tank" ? 0.08 : 0.025;

  const skinTarget = new THREE.Color(outfit.skinTone);
  const skinTint = new THREE.Vector3(
    THREE.MathUtils.clamp(skinTarget.r / SKIN_ALBEDO_LINEAR[0], 0.3, 1.9),
    THREE.MathUtils.clamp(skinTarget.g / SKIN_ALBEDO_LINEAR[1], 0.3, 1.9),
    THREE.MathUtils.clamp(skinTarget.b / SKIN_ALBEDO_LINEAR[2], 0.3, 1.9)
  );

  const uniforms: OutfitUniforms = {
    uSkinTint: { value: skinTint },
    uTopColor: { value: new THREE.Color(top.color) },
    uTopTrim: { value: new THREE.Color(top.trim) },
    uBottomColor: { value: new THREE.Color(bottom.color) },
    uBottomStripe: { value: new THREE.Color(bottom.stripe ?? bottom.color) },
    uShoeColor: { value: new THREE.Color(outfit.shoes.color) },
    uShoeSole: { value: new THREE.Color(outfit.shoes.sole) },
    uLand1: { value: new THREE.Vector4(land.shoulderX, land.elbowX, land.wristX, land.armY) },
    uLand2: { value: new THREE.Vector4(land.neckY, land.waistY, land.kneeY, land.ankleY) },
    uTop: {
      value: new THREE.Vector4(SLEEVE_T[top.sleeves], hemY, neckDrop, TOP_STYLE_INDEX[top.style]),
    },
    uBottom: {
      value: new THREE.Vector4(
        cuffY,
        bottom.stripe ? 1 : 0,
        MOTIF_INDEX[top.motif ?? "none"],
        land.ankleY + 0.05
      ),
    },
  };

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vBindPos;\nvarying vec3 vBindNormal;"
      )
      .replace(
        "#include <beginnormal_vertex>",
        "#include <beginnormal_vertex>\nvBindNormal = objectNormal;"
      )
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvBindPos = transformed;");

    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${OUTFIT_FRAGMENT_HEADER}`)
      .replace("#include <map_fragment>", `#include <map_fragment>\n${OUTFIT_FRAGMENT_BODY}`)
      .replace(
        "#include <roughnessmap_fragment>",
        "#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, mix(0.88, 0.5, oShoe), oCloth);"
      )
      .replace(
        "#include <normal_fragment_maps>",
        THREE.ShaderChunk.normal_fragment_maps.replace(
          "mapN.xy *= normalScale;",
          "mapN.xy *= normalScale * (1.0 - 0.82 * oCloth);"
        )
      );
  };
  material.customProgramCacheKey = () => "desi-outfit-v1";
  material.userData.outfitUniforms = uniforms;
  return material;
}

function topHemY(style: TopStyle, land: BodyLandmarks): number {
  switch (style) {
    case "kurta":
      // Kurti length: past the hips, just onto the thighs.
      return land.waistY - 0.15;
    case "jacket":
      return land.waistY - 0.06;
    case "shirt":
      return land.waistY - 0.03;
    case "tank":
      return land.waistY - 0.02;
    case "tee":
    default:
      return land.waistY - 0.07;
  }
}

const OUTFIT_FRAGMENT_HEADER = /* glsl */ `
varying vec3 vBindPos;
varying vec3 vBindNormal;
uniform vec3 uSkinTint;
uniform vec3 uTopColor;
uniform vec3 uTopTrim;
uniform vec3 uBottomColor;
uniform vec3 uBottomStripe;
uniform vec3 uShoeColor;
uniform vec3 uShoeSole;
uniform vec4 uLand1; // shoulderX, elbowX, wristX, armY
uniform vec4 uLand2; // neckY, waistY, kneeY, ankleY
uniform vec4 uTop;   // sleeveT, hemY, neckDrop, style
uniform vec4 uBottom;// cuffY, stripeOn, motif, shoeTopY

float oHash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float oNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(oHash(i), oHash(i + vec3(1, 0, 0)), f.x), mix(oHash(i + vec3(0, 1, 0)), oHash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(oHash(i + vec3(0, 0, 1)), oHash(i + vec3(1, 0, 1)), f.x), mix(oHash(i + vec3(0, 1, 1)), oHash(i + vec3(1, 1, 1)), f.x), f.y),
    f.z
  );
}

// Distance from p to segment ab.
float oSeg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

// Seven-segment style "07" jersey print on the back.
float oJerseyNumber(vec2 p) {
  float w = 0.0085;
  float d = 1.0;
  // "0" (left digit)
  vec2 o = p - vec2(-0.045, 0.0);
  d = min(d, oSeg(o, vec2(-0.028, 0.05), vec2(0.028, 0.05)));
  d = min(d, oSeg(o, vec2(-0.028, -0.05), vec2(0.028, -0.05)));
  d = min(d, oSeg(o, vec2(-0.028, -0.05), vec2(-0.028, 0.05)));
  d = min(d, oSeg(o, vec2(0.028, -0.05), vec2(0.028, 0.05)));
  // "7" (right digit)
  vec2 s = p - vec2(0.045, 0.0);
  d = min(d, oSeg(s, vec2(-0.028, 0.05), vec2(0.028, 0.05)));
  d = min(d, oSeg(s, vec2(0.028, 0.05), vec2(-0.01, -0.05)));
  return 1.0 - smoothstep(w - 0.002, w + 0.002, d);
}

float oCloth = 0.0;
float oShoe = 0.0;
`;

const OUTFIT_FRAGMENT_BODY = /* glsl */ `
{
  vec3 bp = vBindPos;
  vec3 bn = normalize(vBindNormal);
  float ax = abs(bp.x);
  float shoulderX = uLand1.x;
  float elbowX = uLand1.y;
  float wristX = uLand1.z;
  float armY = uLand1.w;
  float neckY = uLand2.x;
  float waistY = uLand2.y;
  float kneeY = uLand2.z;
  float ankleY = uLand2.w;
  float style = uTop.w;
  float aa = 0.004; // edge softness (meters)

  float front = smoothstep(-0.03, 0.05, bp.z);
  float isArm = step(shoulderX - 0.03, ax) * step(armY - 0.14, bp.y) * step(bp.y, armY + 0.16);
  float armT = (ax - shoulderX) / max(wristX - shoulderX, 0.001);
  float isHand = isArm * step(wristX - 0.004, ax);
  float isLeg = (1.0 - isArm) * step(bp.y, waistY - 0.015);
  float isTorso = (1.0 - isArm) * (1.0 - isLeg);

  // ---------------- top garment
  float neckLimit = neckY - 0.035 - uTop.z * front * (1.0 - smoothstep(0.0, 0.075, ax)) + 1.6 * ax * ax;
  float torsoTop = isTorso * (1.0 - smoothstep(neckLimit - aa, neckLimit + aa, bp.y));
  // Tank / vest: deep armholes and shoulder straps.
  float tankCut = step(0.5, style) * step(style, 1.5) *
    step(armY - 0.13, bp.y) * step(shoulderX - 0.075, ax);
  torsoTop *= 1.0 - tankCut;
  float hemMask = smoothstep(uTop.y - aa, uTop.y + aa, bp.y);
  // Kurta skirt continues over the thighs.
  float isKurta = step(1.5, style) * step(style, 2.5);
  float legTop = isLeg * isKurta * hemMask;
  float sleeve = isArm * (1.0 - isHand) * (1.0 - smoothstep(uTop.x - 0.012, uTop.x + 0.012, armT));
  float topMask = max(max(torsoTop * hemMask, legTop), sleeve);

  // ---------------- bottom garment
  float bottomMask = (isLeg + isTorso * (1.0 - smoothstep(waistY + 0.012 - aa, waistY + 0.012 + aa, bp.y))) *
    smoothstep(uBottom.x - aa, uBottom.x + aa, bp.y);
  bottomMask = clamp(bottomMask, 0.0, 1.0) * (1.0 - legTop);

  // ---------------- shoes
  float shoe = (1.0 - isArm) * (1.0 - smoothstep(uBottom.w - aa, uBottom.w + aa, bp.y));
  float sole = shoe * (1.0 - smoothstep(0.022, 0.03, bp.y));

  // ---------------- colors
  vec3 skin = diffuseColor.rgb * uSkinTint;
  float grain = oNoise(bp * vec3(180.0, 180.0, 180.0)) * 0.6 + oNoise(bp * 520.0) * 0.4;

  vec3 topCol = uTopColor;
  // Collar / neckline band, cuffs, hem band.
  float collar = torsoTop * smoothstep(neckLimit - 0.024, neckLimit - 0.016, bp.y);
  float cuff = sleeve * smoothstep(uTop.x - 0.07, uTop.x - 0.05, armT) * step(0.0, uTop.x);
  float hemBand = (torsoTop + legTop) * (1.0 - smoothstep(uTop.y + 0.022, uTop.y + 0.03, bp.y));
  float trim = max(max(collar, cuff), hemBand * (step(1.5, style) + step(style, 0.5) * 0.0 + step(2.5, style)));
  // Jacket: centre zip + sleeve stripes; kurta: embroidered placket.
  float isJacket = step(2.5, style) * step(style, 3.5);
  float zip = isJacket * torsoTop * front * (1.0 - smoothstep(0.004, 0.008, ax));
  float sleeveStripe = isJacket * sleeve * smoothstep(0.78, 0.86, bn.y);
  float placket = isKurta * torsoTop * front * (1.0 - smoothstep(0.012, 0.016, ax)) *
    step(neckLimit - 0.2, bp.y);
  // Shirt: button line + pocket flap + belt.
  float isShirt = step(3.5, style);
  float buttons = isShirt * torsoTop * front * (1.0 - smoothstep(0.003, 0.006, ax));
  float pocket = isShirt * torsoTop * front * step(0.05, ax) * step(ax, 0.12) *
    step(armY - 0.16, bp.y) * step(bp.y, armY - 0.12);
  trim = max(trim, max(max(zip, sleeveStripe), max(placket, max(buttons, pocket))));

  // Back prints.
  float back = 1.0 - front;
  vec2 bq = vec2(bp.x, bp.y - (waistY + armY) * 0.5);
  float onBack = torsoTop * back * step(ax, 0.16);
  float motif = uBottom.z;
  float print = 0.0;
  print += step(0.5, motif) * step(motif, 1.5) * onBack *
    (1.0 - smoothstep(0.012, 0.016, abs(ax - 0.055)));
  print += step(1.5, motif) * step(motif, 2.5) * onBack * oJerseyNumber(bq * vec2(1.0, 1.0));
  print += step(2.5, motif) * step(motif, 3.5) * onBack *
    (1.0 - smoothstep(0.012, 0.018, abs(bq.y - 0.05 + 0.9 * ax)));
  // Kurta border: gold diamonds along hem / neckline / cuffs.
  float diamonds = step(3.5, motif) * max(hemBand, max(collar, cuff)) *
    step(0.5, abs(fract(bp.x * 38.0 + bp.y * 14.0) - 0.5) + abs(fract(bp.y * 38.0) - 0.5));
  topCol = mix(topCol, uTopTrim, clamp(max(trim, print), 0.0, 1.0));
  topCol = mix(topCol, uTopColor * 0.55 + uTopTrim * 0.45, diamonds * 0.6);

  vec3 bottomCol = uBottomColor;
  float outward = bn.x * sign(bp.x);
  float stripe = uBottom.y * isLeg * smoothstep(0.86, 0.93, outward);
  bottomCol = mix(bottomCol, uBottomStripe, stripe);
  float waistband = step(waistY - 0.03, bp.y);
  bottomCol *= mix(1.0, 0.78, waistband * isTorso);
  bottomCol = mix(bottomCol, uTopTrim * 0.4 + vec3(0.06, 0.035, 0.02), waistband * isTorso * isShirt);

  vec3 shoeCol = mix(uShoeColor, uShoeSole, sole);
  // Laces / tongue hint on the top of the foot.
  shoeCol *= mix(1.0, 0.86, shoe * (1.0 - sole) * smoothstep(0.55, 0.8, bn.y) * step(0.02, bp.z));

  // Fabric grain + creases at elbows, knees and the waist.
  float elbowCrease = exp(-pow((ax - elbowX) / 0.045, 2.0)) * (0.5 + 0.5 * sin(ax * 260.0 + bp.y * 60.0));
  float kneeCrease = exp(-pow((bp.y - kneeY) / 0.05, 2.0)) * (0.5 + 0.5 * sin(bp.y * 310.0 + bp.x * 70.0));
  float waistCrease = exp(-pow((bp.y - waistY - 0.03) / 0.03, 2.0)) * (0.5 + 0.5 * sin(bp.y * 400.0 + ax * 90.0));
  float creases = sleeve * elbowCrease + bottomMask * kneeCrease + torsoTop * waistCrease * 0.6;
  float clothShade = (0.93 + 0.1 * grain) * (1.0 - 0.14 * creases);

  vec3 outCol = skin;
  outCol = mix(outCol, bottomCol * clothShade, bottomMask);
  outCol = mix(outCol, topCol * clothShade, topMask);
  outCol = mix(outCol, shoeCol * (0.95 + 0.08 * grain), shoe);

  oCloth = clamp(max(max(topMask, bottomMask), shoe), 0.0, 1.0);
  oShoe = shoe;
  diffuseColor.rgb = outCol;
}
`;
