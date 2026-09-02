import * as THREE from "three";
import type { PlayerAnimationState } from "@/types/game";
import { PLAYER } from "@/game/config/gameplay";

const FADE_FAST = 0.14;
const FADE_DEATH = 0.1;
/** Expected jump airtime from gameplay constants (v/g * 2). */
const EXPECTED_AIRTIME = (2 * PLAYER.jumpVelocity) / PLAYER.gravity;

interface ClipMapping {
  idle?: THREE.AnimationClip;
  run?: THREE.AnimationClip;
  walk?: THREE.AnimationClip;
  jump?: THREE.AnimationClip;
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
  private onJumpFinished?: () => void;

  constructor(root: THREE.Object3D, clips: THREE.AnimationClip[]) {
    if (clips.length === 0) {
      this.hasClips = false;
      return;
    }
    this.hasClips = true;
    const mixer = new THREE.AnimationMixer(root);
    this.mixer = mixer;

    const mapping: ClipMapping = {
      idle: findClip(clips, "idle"),
      run: findClip(clips, "running", "run"),
      walk: findClip(clips, "walking", "walk"),
      jump: findClip(clips, "jump"),
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
    register("death", mapping.death ?? mapping.idle, THREE.LoopOnce);

    this.jumpAction = this.actions.get("jump") ?? null;
    if (this.mixer && this.jumpAction) {
      this.mixer.addEventListener("finished", this.handleFinished);
    }

    this.buildSlideClip();

    // Start from Idle; every other state is entered via setState() crossfades.
    const idle = this.actions.get("idle");
    if (idle) {
      idle.setEffectiveWeight(1);
      idle.play();
    }
  }

  /**
   * Procedural keyframe clip (Vector/Quaternion tracks) that tips the runner
   * back onto the SlidePivot node — used because most GLB characters ship no
   * slide animation. Final keys return to identity so unclamping is seamless.
   */
  private buildSlideClip(): void {
    if (!this.mixer) return;
    const duration = PLAYER.slideDuration;
    // Forward crouch for slide — head forward like Subway, not backward lay.
    // Slight forward tilt (~42°) + clear dip so slide reads instantly outdoors.
    const tilt = new THREE.Quaternion();
    const tiltQ = tilt.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.72);
    const identity = new THREE.Quaternion();

    const quaternionTrack = new THREE.QuaternionKeyframeTrack(
      "SlidePivot.quaternion",
      [0, 0.14, duration - 0.18, duration],
      [
        identity.x, identity.y, identity.z, identity.w,
        tiltQ.x, tiltQ.y, tiltQ.z, tiltQ.w,
        tiltQ.x, tiltQ.y, tiltQ.z, tiltQ.w,
        identity.x, identity.y, identity.z, identity.w,
      ]
    );
    const dipTrack = new THREE.VectorKeyframeTrack(
      "SlidePivot.position",
      [0, 0.14, duration - 0.18, duration],
      [0, 0, 0, 0, -0.32, 0, 0, -0.32, 0, 0, 0, 0]
    );
    const clip = new THREE.AnimationClip("NeonSlide", duration, [quaternionTrack, dipTrack]);
    const action = this.mixer.clipAction(clip);
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = false;
    this.actions.set("slide", action);
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
    this.currentState = null;
  }
}
