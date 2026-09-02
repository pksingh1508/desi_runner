import * as THREE from "three";
import type { PlayerAnimationState } from "@/types/game";
import { PLAYER } from "@/game/config/gameplay";

const FADE_FAST = 0.14;
const FADE_DEATH = 0.1;
const SLIDE_ENTER_TIME = 0.14;
const SLIDE_EXIT_TIME = 0.16;
/** Expected jump airtime from gameplay constants (v/g * 2). */
const EXPECTED_AIRTIME = (2 * PLAYER.jumpVelocity) / PLAYER.gravity;

interface ClipMapping {
  idle?: THREE.AnimationClip;
  run?: THREE.AnimationClip;
  walk?: THREE.AnimationClip;
  jump?: THREE.AnimationClip;
  slide?: THREE.AnimationClip;
  death?: THREE.AnimationClip;
}

function findClip(clips: THREE.AnimationClip[], ...keywords: string[]): THREE.AnimationClip | undefined {
  const lower = clips.map((clip) => ({ clip, name: clip.name.toLowerCase() }));
  for (const keyword of keywords) {
    const match = lower.find((entry) => entry.name.includes(keyword));
    if (match) return match.clip;
  }
  return undefined;
}

/**
 * Owns the AnimationMixer, maps loaded clips to logical states and performs
 * crossfades. Adapted from three.js `webgl_animation_skinning_blending`:
 * actions are created once, weights are managed via setEffectiveWeight and
 * crossfades use fadeIn/fadeOut; looping actions are never restarted while
 * active, one-shots clamp on their final frame.
 *
 * If the GLB provides no clips (or loading failed) the controller degrades to
 * a no-op and Player drives a procedural fallback rig instead.
 */
export class CharacterAnimationController {
  readonly hasClips: boolean;

  private mixer: THREE.AnimationMixer | null = null;
  private actions = new Map<PlayerAnimationState, THREE.AnimationAction>();
  private currentState: PlayerAnimationState | null = null;
  private runRatio = 0;
  private jumpAction: THREE.AnimationAction | null = null;
  /** Root-motion overlay used when the model has no purpose-built slide clip. */
  private slideOverlayAction: THREE.AnimationAction | null = null;
  private onJumpFinished?: () => void;

  constructor(root: THREE.Object3D, clips: THREE.AnimationClip[]) {
    if (clips.length === 0) {
      this.hasClips = false;
      return;
    }
    this.hasClips = true;
    const mixer = new THREE.AnimationMixer(root);
    this.mixer = mixer;

    const nativeSlide = findClip(clips, "sliding", "slide", "crouch", "duck");
    const mapping: ClipMapping = {
      idle: findClip(clips, "idle"),
      run: findClip(clips, "running", "run"),
      walk: findClip(clips, "walking", "walk"),
      jump: findClip(clips, "jump"),
      // RobotExpressive has no slide, but its short Sitting transition gives
      // us a convincing bent-knee base pose for the procedural overlay.
      slide: nativeSlide ?? findClip(clips, "sitting", "sit"),
      death: findClip(clips, "death"),
    };

    const register = (
      state: PlayerAnimationState,
      clip: THREE.AnimationClip | undefined,
      loop: THREE.AnimationActionLoopStyles,
      timeScale = 1
    ): void => {
      if (!clip) return;
      const action = mixer.clipAction(clip);
      action.setLoop(loop, loop === THREE.LoopOnce ? 1 : Infinity);
      action.clampWhenFinished = loop === THREE.LoopOnce;
      action.timeScale = timeScale;
      this.actions.set(state, action);
    };

    register("idle", mapping.idle ?? mapping.walk, THREE.LoopRepeat);
    register("run", mapping.run ?? mapping.walk ?? mapping.idle, THREE.LoopRepeat);
    // Fit the jump clip length roughly onto the simulated airtime.
    const jumpFit = mapping.jump
      ? THREE.MathUtils.clamp(mapping.jump.duration / EXPECTED_AIRTIME, 0.75, 1.6)
      : 1;
    register("jump", mapping.jump, THREE.LoopOnce, jumpFit);
    if (mapping.slide) {
      const slideTimeScale = nativeSlide
        ? mapping.slide.duration / PLAYER.slideDuration
        : mapping.slide.duration / SLIDE_ENTER_TIME;
      register("slide", mapping.slide, THREE.LoopOnce, slideTimeScale);
    }
    register("death", mapping.death ?? mapping.idle, THREE.LoopOnce);

    this.jumpAction = this.actions.get("jump") ?? null;
    if (this.mixer && this.jumpAction) {
      this.mixer.addEventListener("finished", this.handleFinished);
    }

    // A native slide already owns the full body pose. Otherwise layer a
    // model-independent low/forward transform over Sitting (or use it alone).
    if (!nativeSlide) this.buildSlideOverlay();

    // Start from Idle; every other state is entered via setState() crossfades.
    const idle = this.actions.get("idle");
    if (idle) {
      idle.setEffectiveWeight(1);
      idle.play();
    }
  }

  /**
   * Procedural keyframe overlay (Vector/Quaternion/Scale tracks) that makes
   * the visible character occupy the same low silhouette as the slide
   * collider. Most GLB characters ship no dedicated slide animation, so this
   * is layered over a crouched skeletal pose when one is available. Final
   * keys return to identity so interruptions and unclamping are seamless.
   */
  private buildSlideOverlay(): void {
    if (!this.mixer) return;
    const duration = PLAYER.slideDuration;
    const holdUntil = duration - SLIDE_EXIT_TIME;
    // A strong forward lean plus vertical compression makes the rendered
    // silhouette truthfully match the half-height gameplay collider.
    const tilt = new THREE.Quaternion();
    const tiltQ = tilt.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.98);
    const identity = new THREE.Quaternion();

    const quaternionTrack = new THREE.QuaternionKeyframeTrack(
      "SlidePivot.quaternion",
      [0, SLIDE_ENTER_TIME, holdUntil, duration],
      [
        identity.x, identity.y, identity.z, identity.w,
        tiltQ.x, tiltQ.y, tiltQ.z, tiltQ.w,
        tiltQ.x, tiltQ.y, tiltQ.z, tiltQ.w,
        identity.x, identity.y, identity.z, identity.w,
      ]
    );
    const dipTrack = new THREE.VectorKeyframeTrack(
      "SlidePivot.position",
      [0, SLIDE_ENTER_TIME, holdUntil, duration],
      [0, 0, 0, 0, -0.06, -0.08, 0, -0.06, -0.08, 0, 0, 0]
    );
    const scaleTrack = new THREE.VectorKeyframeTrack(
      "SlidePivot.scale",
      [0, SLIDE_ENTER_TIME, holdUntil, duration],
      [1, 1, 1, 1, 0.72, 1, 1, 0.72, 1, 1, 1, 1]
    );
    const clip = new THREE.AnimationClip("NeonSlideOverlay", duration, [
      quaternionTrack,
      dipTrack,
      scaleTrack,
    ]);
    const action = this.mixer.clipAction(clip);
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = false;
    this.slideOverlayAction = action;
    if (!this.actions.has("slide")) this.actions.set("slide", action);
  }

  private handleFinished = (event: { action: THREE.AnimationAction }): void => {
    if (event.action === this.jumpAction && this.currentState === "jump") {
      this.onJumpFinished?.();
    }
  };

  setJumpReturnCallback(callback: () => void): void {
    this.onJumpFinished = callback;
  }

  /**
   * Crossfades into the requested state.
   *
   * Weight model (three.js): effectiveWeight = action.weight × fadeInterpolant,
   * so the BASE weight must be 1 and the fade interpolant does the 0→1 ramp
   * (fadeIn schedules exactly that). Setting base weight 0 here previously kept
   * looping actions at zero forever — the "sliding, not running" bug.
   *
   * Re-requesting an already-active state is allowed when its action has
   * stopped (re-triggers a finished/clamped one-shot like Jump).
   */
  setState(state: PlayerAnimationState): void {
    if (!this.mixer) return;
    const next = this.actions.get(state);
    if (!next) return;

    const isLooping = state === "run" || state === "idle";
    if (state === this.currentState && (isLooping || next.isRunning())) return;

    const prev = this.currentState !== null ? this.actions.get(this.currentState) : undefined;

    next.enabled = true;
    next.reset(); // restart clip; also clears any stale fades/warps
    if (state === "run") next.timeScale = this.currentRunTimeScale();
    next.setEffectiveWeight(1);
    next.fadeIn(isLooping ? FADE_FAST : FADE_FAST);
    next.play();

    if (state === "slide" && this.slideOverlayAction && this.slideOverlayAction !== next) {
      this.slideOverlayAction.enabled = true;
      this.slideOverlayAction.reset().setEffectiveWeight(1).fadeIn(FADE_FAST).play();
    } else if (state !== "slide" && this.slideOverlayAction?.isRunning()) {
      this.slideOverlayAction.fadeOut(FADE_FAST);
    }

    if (prev && prev !== next && prev.isRunning()) {
      prev.fadeOut(state === "death" ? FADE_DEATH : FADE_FAST);
    } else if (prev && prev !== next) {
      prev.stop();
    }

    this.currentState = state;
  }

  /** Called when the simulation ends a jump early (e.g. landing). */
  forceFinishOneShot(state: PlayerAnimationState): void {
    const action = this.actions.get(state);
    if (action && action.isRunning()) {
      action.enabled = false;
      action.stop();
    }
    if (state === "slide" && this.slideOverlayAction && this.slideOverlayAction !== action) {
      this.slideOverlayAction.enabled = false;
      this.slideOverlayAction.stop();
    }
  }

  setRunSpeedRatio(ratio: number): void {
    this.runRatio = ratio;
    const run = this.actions.get("run");
    if (run && this.currentState === "run") {
      run.timeScale = this.currentRunTimeScale();
    }
  }

  private currentRunTimeScale(): number {
    return THREE.MathUtils.clamp(0.85 + this.runRatio * 0.55, 0.85, 1.45);
  }

  update(delta: number): void {
    this.mixer?.update(delta);
  }

  reset(): void {
    if (!this.mixer) return;
    for (const action of this.actions.values()) {
      action.stop();
    }
    this.currentState = null;
    this.setState("idle");
  }

  get state(): PlayerAnimationState | null {
    return this.currentState;
  }

  dispose(): void {
    if (this.mixer) {
      this.mixer.removeEventListener("finished", this.handleFinished);
      this.mixer.stopAllAction();
      this.mixer.uncacheRoot(this.mixer.getRoot());
      this.mixer = null;
    }
    this.actions.clear();
    this.slideOverlayAction = null;
    this.currentState = null;
  }
}
