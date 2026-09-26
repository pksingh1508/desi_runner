import * as THREE from "three";
import type { ResourceBag } from "@/game/utils/dispose";
import { AMBIENT } from "@/game/config/ambient";

/**
 * Monsoon rain: instanced camera-facing streaks animated entirely in the
 * vertex shader inside a box that follows the camera. World scroll slants
 * the streaks toward the camera so speed reads through the rain.
 */

const CFG = AMBIENT.rain;

const VERT = /* glsl */ `
attribute vec3 aOffset;
attribute float aSpeed;
uniform float uTime;
uniform float uFall;
uniform float uWorldOffset;
uniform float uWorldSpeed;
uniform float uLength;
uniform float uWidth;
uniform vec3 uCenter;
uniform vec3 uBox;
varying vec2 vUv;
void main() {
  vec3 o = aOffset * uBox;
  o.y = mod(o.y - uTime * uFall * aSpeed, uBox.y);
  o.z = mod(o.z + uWorldOffset, uBox.z);
  vec3 origin = uCenter + o - vec3(uBox.x * 0.5, uBox.y * 0.3, uBox.z * 0.5);
  vec3 vel = normalize(vec3(1.2, -uFall * aSpeed, uWorldSpeed));
  vec3 toCam = normalize(cameraPosition - origin);
  vec3 side = normalize(cross(toCam, vel));
  vec3 p = origin + side * position.x * uWidth - vel * position.y * uLength * aSpeed;
  vUv = vec2(position.x + 0.5, position.y);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;

const FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uIntensity;
varying vec2 vUv;
void main() {
  float a = (1.0 - abs(vUv.x * 2.0 - 1.0)) * smoothstep(0.0, 0.3, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y));
  a *= uIntensity * 0.55;
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor, a);
}
`;

export class Rain {
  readonly mesh: THREE.Mesh;
  private worldOffset = 0;
  private time = 0;
  private forward = new THREE.Vector3();
  private readonly uniforms = {
    uTime: { value: 0 },
    uFall: { value: CFG.fallSpeed },
    uWorldOffset: { value: 0 },
    uWorldSpeed: { value: 0 },
    uLength: { value: CFG.length },
    uWidth: { value: CFG.width },
    uCenter: { value: new THREE.Vector3() },
    uBox: { value: new THREE.Vector3(CFG.box[0], CFG.box[1], CFG.box[2]) },
    uColor: { value: new THREE.Color(0xd6e6ee) },
    uIntensity: { value: 0 },
  };

  constructor(bag: ResourceBag) {
    const base = new THREE.PlaneGeometry(1, 1);
    base.translate(0, 0.5, 0);
    const geometry = bag.geo(new THREE.InstancedBufferGeometry());
    geometry.index = base.index;
    geometry.setAttribute("position", base.getAttribute("position"));
    const offsets = new Float32Array(CFG.count * 3);
    const speeds = new Float32Array(CFG.count);
    for (let i = 0; i < CFG.count; i++) {
      offsets[i * 3] = Math.random();
      offsets[i * 3 + 1] = Math.random();
      offsets[i * 3 + 2] = Math.random();
      speeds[i] = 0.8 + Math.random() * 0.45;
    }
    geometry.setAttribute("aOffset", new THREE.InstancedBufferAttribute(offsets, 3));
    geometry.setAttribute("aSpeed", new THREE.InstancedBufferAttribute(speeds, 1));
    geometry.instanceCount = CFG.count;
    base.dispose();
    const material = bag.mat(
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        // Billboards may face either way depending on streak slant.
        side: THREE.DoubleSide,
        fog: false,
      })
    );
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.name = "Rain";
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.mesh.visible = false;
  }

  update(delta: number, worldSpeed: number, intensity: number, camera: THREE.Camera): void {
    this.mesh.visible = intensity > 0.01;
    if (!this.mesh.visible) return;
    this.time += delta;
    // Wrap on a multiple of the box depth so the pattern never jumps.
    this.worldOffset = (this.worldOffset + worldSpeed * delta) % (CFG.box[2] * 100);
    camera.getWorldDirection(this.forward);
    const u = this.uniforms;
    u.uTime.value = this.time;
    u.uWorldOffset.value = this.worldOffset;
    u.uWorldSpeed.value = worldSpeed;
    u.uIntensity.value = intensity;
    u.uCenter.value.set(
      camera.position.x + this.forward.x * 22,
      camera.position.y,
      camera.position.z + this.forward.z * 22
    );
  }
}
