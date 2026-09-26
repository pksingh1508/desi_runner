import * as THREE from "three";
import type { ResourceBag } from "@/game/utils/dispose";
import type { BiomeSky } from "@/game/config/biomes";

/**
 * Gradient sky dome: zenith→horizon gradient, horizon haze band, sun/moon
 * disc + glow, procedural fbm clouds and twinkling stars. Centered on the
 * camera and pushed to the far plane; drawn after all opaque geometry so
 * only visible sky pixels are shaded. Biome blending writes the uniforms.
 */

const VERT = /* glsl */ `
uniform float uRadius;
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 clip = projectionMatrix * viewMatrix * vec4(cameraPosition + position * uRadius, 1.0);
  clip.z = clip.w * 0.99995;
  gl_Position = clip;
}
`;

const FRAG = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunSize;
uniform float uSunGlow;
uniform float uHaze;
uniform float uCloudCover;
uniform float uCloudOpacity;
uniform vec3 uCloudColor;
uniform vec3 uCloudShade;
uniform float uStars;
uniform float uTime;
varying vec3 vDir;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float hash31(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
             mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * vnoise(p);
    p = p * 2.07 + vec2(3.1, 1.7);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec3 dir = normalize(vDir);
  float e = dir.y;
  float h = max(e, 0.0);
  vec3 col = mix(uHorizon, uZenith, pow(smoothstep(0.0, 1.0, h), 0.4));
  col = mix(col, uHorizon, exp(-h * uHaze) * 0.45);

  float sd = max(dot(dir, uSunDir), 0.0);
  col += uSunColor * (pow(sd, 6.0) * 0.3 + pow(sd, 48.0) * 0.6) * uSunGlow;
  if (uSunSize > 0.0) {
    float disc = smoothstep(cos(uSunSize), cos(uSunSize * 0.82), dot(dir, uSunDir));
    col = mix(col, uSunColor * 3.0 + vec3(0.3), disc);
  }

  if (uStars > 0.001 && e > 0.0) {
    vec3 sp = dir * 260.0;
    vec3 cell = floor(sp);
    float r = hash31(cell);
    vec3 f = fract(sp) - 0.5;
    float star = step(0.9955, r) * (1.0 - smoothstep(0.0, 0.32, length(f)));
    float tw = 0.55 + 0.45 * sin(uTime * (1.5 + r * 5.0) + r * 80.0);
    col += vec3(1.0, 0.95, 0.85) * star * tw * uStars * smoothstep(0.03, 0.3, e) * 2.2;
  }

  if (uCloudOpacity > 0.001 && e > 0.0) {
    vec2 p = dir.xz / (e + 0.16) * 0.9 + vec2(uTime * 0.005, uTime * 0.002);
    float n = fbm(p * 1.3);
    float cov = smoothstep(1.0 - uCloudCover, 1.0 - uCloudCover + 0.28, n);
    float fade = smoothstep(0.0, 0.22, e);
    float lit = clamp(0.3 + 0.7 * pow(sd, 3.0) + (n - 0.55) * 1.2, 0.0, 1.0);
    vec3 cc = mix(uCloudShade, uCloudColor, lit);
    col = mix(col, cc, cov * fade * uCloudOpacity);
  }

  // GLSL smoothstep needs edge0 < edge1 (reversed edges are undefined).
  col = mix(col, uGround, 1.0 - smoothstep(-0.07, 0.012, e));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export interface SkyUniforms {
  [name: string]: THREE.IUniform;
  uRadius: THREE.IUniform<number>;
  uZenith: THREE.IUniform<THREE.Color>;
  uHorizon: THREE.IUniform<THREE.Color>;
  uGround: THREE.IUniform<THREE.Color>;
  uSunDir: THREE.IUniform<THREE.Vector3>;
  uSunColor: THREE.IUniform<THREE.Color>;
  uSunSize: THREE.IUniform<number>;
  uSunGlow: THREE.IUniform<number>;
  uHaze: THREE.IUniform<number>;
  uCloudCover: THREE.IUniform<number>;
  uCloudOpacity: THREE.IUniform<number>;
  uCloudColor: THREE.IUniform<THREE.Color>;
  uCloudShade: THREE.IUniform<THREE.Color>;
  uStars: THREE.IUniform<number>;
  uTime: THREE.IUniform<number>;
}

export function createSkyUniforms(radius: number): SkyUniforms {
  return {
    uRadius: { value: radius },
    uZenith: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uGround: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color() },
    uSunSize: { value: 0 },
    uSunGlow: { value: 0 },
    uHaze: { value: 4 },
    uCloudCover: { value: 0 },
    uCloudOpacity: { value: 0 },
    uCloudColor: { value: new THREE.Color() },
    uCloudShade: { value: new THREE.Color() },
    uStars: { value: 0 },
    uTime: { value: 0 },
  };
}

export function createSkyMaterial(uniforms: SkyUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
}

/** Writes one biome's sky into the uniforms (no blending). */
export function applySkyPreset(u: SkyUniforms, sky: BiomeSky): void {
  u.uZenith.value.setHex(sky.zenith);
  u.uHorizon.value.setHex(sky.horizon);
  u.uGround.value.setHex(sky.ground);
  u.uSunDir.value.set(sky.sunDir[0], sky.sunDir[1], sky.sunDir[2]).normalize();
  u.uSunColor.value.setHex(sky.sunColor);
  u.uSunSize.value = sky.sunSize;
  u.uSunGlow.value = sky.sunGlow;
  u.uHaze.value = sky.haze;
  u.uCloudCover.value = sky.cloudCover;
  u.uCloudOpacity.value = sky.cloudOpacity;
  u.uCloudColor.value.setHex(sky.cloudColor);
  u.uCloudShade.value.setHex(sky.cloudShade);
  u.uStars.value = sky.stars;
}

export class SkyDome {
  readonly mesh: THREE.Mesh;
  readonly uniforms: SkyUniforms;

  constructor(bag: ResourceBag, radius = 480) {
    this.uniforms = createSkyUniforms(radius);
    const geometry = bag.geo(new THREE.SphereGeometry(1, 48, 24));
    const material = bag.mat(createSkyMaterial(this.uniforms));
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.name = "SkyDome";
    this.mesh.frustumCulled = false;
    // Drawn after every opaque object (early-z rejects hidden sky pixels).
    this.mesh.renderOrder = 1000;
    this.mesh.matrixAutoUpdate = false;
  }
}
