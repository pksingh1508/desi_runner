import * as THREE from "three";
import { PLAYER } from "@/game/config/gameplay";
import { HUMAN_CLIPS, HUMAN_SLIDE, type SlidePose } from "@/game/config/humanRig";

/** Bones point down their local +Y axis (joint → child joint). */
const BONE_AXIS = new THREE.Vector3(0, 1, 0);
/** Knees and elbows flex about their local +X axis. */
const HINGE_AXIS = new THREE.Vector3(1, 0, 0);
/** Finger / thumb bones keep the reference clip's relaxed hand. */
const HAND_BONE = /^(thumb|index|middle|ring|pinky)_/;
const LEAF_BONE = /_leaf_/;

const scratchQ = new THREE.Quaternion();
const scratchV = new THREE.Vector3();
const scratchTarget = new THREE.Vector3();

/**
 * Bakes HUMAN_SLIDE — a lean-back, feet-first slide — into a keyframe clip
 * for one body. The Universal Animation Library only ships a forward "Roll",
 * so each key pose is solved against this body's own rest skeleton:
 *
 *  - `aim` rotates a bone (shortest arc, keeping the twist it inherits) so
 *    it points along a rig-space direction — spine, head, thighs, arms;
 *  - `bend` flexes a hinge (knee / elbow) about its own axis, so joints only
 *    ever bend the way they can;
 *  - the pelvis translation drops the body onto the road.
 *
 * Returns null when the skeleton lacks the UAL root / pelvis bones.
 */
export function buildSlideClip(
  bodyScene: THREE.Object3D,
  clips: readonly THREE.AnimationClip[]
): THREE.AnimationClip | null {
  const rootBone = bodyScene.getObjectByName("root");
  const pelvis = bodyScene.getObjectByName("pelvis");
  if (!rootBone || !pelvis || pelvis.parent !== rootBone) return null;

  // Rig-space transform of the (Z-up) root bone the pelvis track lives in.
  const rootMatrix = new THREE.Matrix4();
  const chain: THREE.Object3D[] = [];
  for (let node: THREE.Object3D | null = rootBone; node && node !== bodyScene; node = node.parent) {
    chain.unshift(node);
  }
  for (const node of chain) {
    node.updateMatrix();
    rootMatrix.multiply(node.matrix);
  }
  const rootWorld = new THREE.Quaternion();
  rootMatrix.decompose(scratchV, rootWorld, new THREE.Vector3());
  const rootInverse = rootMatrix.clone().invert();

  // Pelvis subtree, parents first (the order the pose is solved in).
  const bones: THREE.Object3D[] = [];
  pelvis.traverse((node) => {
    if (!LEAF_BONE.test(node.name)) bones.push(node);
  });

  // Base local rotations: rest pose, relaxed running hands from the reference.
  const reference = clips.find((clip) => clip.name === HUMAN_SLIDE.handReference);
  const referenceTracks = new Map<string, THREE.KeyframeTrack>();
  if (reference) for (const track of reference.tracks) referenceTracks.set(track.name, track);
  const base = new Map<string, THREE.Quaternion>();
  for (const bone of bones) {
    const track = HAND_BONE.test(bone.name) ? referenceTracks.get(`${bone.name}.quaternion`) : undefined;
    base.set(
      bone.name,
      track && track.values.length >= 4
        ? new THREE.Quaternion(track.values[0], track.values[1], track.values[2], track.values[3])
        : bone.quaternion.clone()
    );
  }

  const keys = HUMAN_SLIDE.keys;
  const times = keys.map((key) => key.at * PLAYER.slideDuration);
  const solved = keys.map((key) => solvePose(key.pose, bones, base, rootWorld));

  const tracks: THREE.KeyframeTrack[] = [];
  for (const bone of bones) {
    const values: number[] = [];
    let previous: THREE.Quaternion | null = null;
    for (const pose of solved) {
      const q = pose.get(bone.name)!;
      // Keep neighbouring keys on the same hemisphere (shortest slerp).
      if (previous && previous.dot(q) < 0) q.set(-q.x, -q.y, -q.z, -q.w);
      values.push(q.x, q.y, q.z, q.w);
      previous = q;
    }
    tracks.push(new THREE.QuaternionKeyframeTrack(`${bone.name}.quaternion`, times, values));
  }

  const pelvisValues: number[] = [];
  for (const key of keys) {
    scratchV.fromArray(key.pose.pelvis).applyMatrix4(rootInverse);
    pelvisValues.push(scratchV.x, scratchV.y, scratchV.z);
  }
  tracks.push(new THREE.VectorKeyframeTrack("pelvis.position", times, pelvisValues));

  return new THREE.AnimationClip(HUMAN_CLIPS.slide, PLAYER.slideDuration, tracks);
}

/** Local rotations for one key pose (bones must be ordered parents first). */
function solvePose(
  pose: SlidePose,
  bones: readonly THREE.Object3D[],
  base: ReadonlyMap<string, THREE.Quaternion>,
  rootWorld: THREE.Quaternion
): Map<string, THREE.Quaternion> {
  const world = new Map<THREE.Object3D, THREE.Quaternion>();
  const locals = new Map<string, THREE.Quaternion>();
  for (const bone of bones) {
    const parentWorld = (bone.parent && world.get(bone.parent)) || rootWorld;
    const local = base.get(bone.name)!.clone();
    const bend = pose.bend[bone.name];
    if (bend) local.multiply(scratchQ.setFromAxisAngle(HINGE_AXIS, bend));

    const boneWorld = parentWorld.clone().multiply(local);
    const aim = pose.aim[bone.name];
    if (aim) {
      scratchV.copy(BONE_AXIS).applyQuaternion(boneWorld);
      scratchTarget.fromArray(aim).normalize();
      boneWorld.premultiply(scratchQ.setFromUnitVectors(scratchV, scratchTarget));
    }
    world.set(bone, boneWorld);
    locals.set(bone.name, parentWorld.clone().invert().multiply(boneWorld));
  }
  return locals;
}
