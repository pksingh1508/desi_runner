import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { POST_FX } from "@/game/config/gameplay";
import { damp } from "@/game/utils/math";

/**
 * Optional post-processing chain: MSAA HDR scene target → half-resolution
 * bloom (neon signs, diyas, rocket flames and fireworks glow) → output pass
 * (ACES tone mapping + sRGB). When disabled (performance mode / touch
 * devices) the game renders straight to the canvas instead.
 */
export class PostFX {
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private enabled = false;
  private strength: number = POST_FX.bloomStrength;
  private targetStrength: number = POST_FX.bloomStrength;

  constructor(
    private renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera
  ) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      samples: POST_FX.msaaSamples,
    });
    target.texture.name = "DesiRun.sceneHDR";
    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(scene, camera));
    // UnrealBloomPass already blurs at half the size it is given.
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(size.x, size.y),
      POST_FX.bloomStrength,
      POST_FX.bloomRadius,
      POST_FX.bloomThreshold
    );
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
  }

  /** Target bloom strength (e.g. brighter at night); eased in update(). */
  setBloomStrength(value: number): void {
    this.targetStrength = value;
  }

  /** CSS size + pixel ratio of the canvas (passes resize with the composer). */
  setSize(width: number, height: number, pixelRatio: number): void {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
  }

  render(scene: THREE.Scene, camera: THREE.Camera, delta: number): void {
    if (!this.enabled) {
      this.renderer.render(scene, camera);
      return;
    }
    this.strength = damp(this.strength, this.targetStrength, 2, delta);
    this.bloom.strength = this.strength;
    this.composer.render(delta);
  }

  dispose(): void {
    this.bloom.dispose();
    this.composer.dispose();
  }
}
