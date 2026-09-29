import * as THREE from "three";
import type { CharacterDefinition } from "@/game/config/characters";
import { BODY_LANDMARKS, HUMAN_CLIPS, HUMAN_RIG } from "@/game/config/humanRig";
import { CharacterAnimationController } from "../CharacterAnimationController";
import { createOutfitMaterial } from "./OutfitMaterial";
import { attachToBone, buildAccessories, type OwnedResources } from "./Accessories";
import type { ClothTail } from "./ClothTail";
import type { HumanAssetLibrary } from "./HumanAssets";

/**
 * A realistic desi runner: CC0 base body + data-driven outfit shader + hair +
 * bone-attached accessories + simulated cloth, animated by the Universal
 * Animation Library through its own AnimationMixer (rooted at this rig so
 * bone names never collide with other characters).
 *
 * The rig faces +Z like the source GLB; Player.modelHolder turns it to -Z.
 */
export class HumanRig {
  /** Visual root — added under Player.modelHolder. */
  readonly object = new THREE.Group();
  /** World-space cloth ribbons — added under Player.root (translation only). */
  readonly extras = new THREE.Group();
  readonly animation: CharacterAnimationController;
  readonly characterId: string;

  private tails: ClothTail[] = [];
  private owned: OwnedResources = { geometries: [], materials: [], textures: [] };

  constructor(def: CharacterDefinition, library: HumanAssetLibrary) {
    const outfit = def.outfit;
    if (!outfit) throw new Error(`[DESI RUN] character "${def.id}" has no outfit`);
    this.characterId = def.id;
    const land = BODY_LANDMARKS[outfit.body];
    this.object.name = `HumanRig_${def.id}`;
    this.extras.name = `HumanRigExtras_${def.id}`;

    const body = library.createBody(outfit.body);
    body.root.scale.setScalar(land.scale);
    this.object.add(body.root);

    // Body: clothing shader over the shared skin textures.
    const source = body.skinned.material as THREE.MeshStandardMaterial;
    const outfitMaterial = createOutfitMaterial(source, outfit, land);
    this.owned.materials.push(outfitMaterial);
    body.skinned.material = outfitMaterial;
    body.skinned.castShadow = true;
    body.skinned.receiveShadow = false;

    const hairColor = new THREE.Color(outfit.hairColor);
    if (body.eyebrows) {
      const browMat = (body.eyebrows.material as THREE.MeshStandardMaterial).clone();
      browMat.color.copy(hairColor);
      this.owned.materials.push(browMat);
      body.eyebrows.material = browMat;
    }
    if (body.eyes) body.eyes.castShadow = false;

    const skeleton = body.skinned.skeleton;
    const hairStyles: ("Beard" | NonNullable<typeof outfit.hair>)[] = [];
    if (outfit.hair) hairStyles.push(outfit.hair);
    if (outfit.accessories.includes("beard")) hairStyles.push("Beard");
    for (const style of hairStyles) {
      const sourceHair = library.hairMesh(style);
      if (!sourceHair) continue;
      const hairMat = (sourceHair.material as THREE.MeshStandardMaterial).clone();
      hairMat.color.copy(hairColor);
      hairMat.roughness = 0.58;
      hairMat.metalness = 0;
      hairMat.side = THREE.DoubleSide;
      this.owned.materials.push(hairMat);
      const hair = new THREE.Mesh(sourceHair.geometry, hairMat);
      hair.name = `Hair_${style}`;
      hair.castShadow = true;
      attachToBone(hair, skeleton, "Head");
    }

    const built = buildAccessories(body.skinned, body.eyes, outfit, land, this.owned);
    this.tails = built.tails;
    for (const tail of this.tails) this.extras.add(tail.mesh);

    const clips = library.clipsFor(outfit.body);
    const hasSlide = clips.some((clip) => clip.name === HUMAN_CLIPS.slide);
    this.animation = new CharacterAnimationController(this.object, clips, {
      clipMap: {
        idle: HUMAN_CLIPS.idle,
        run: HUMAN_CLIPS.run,
        jump: HUMAN_CLIPS.jump,
        slide: hasSlide ? HUMAN_CLIPS.slide : HUMAN_CLIPS.slideFallback,
        death: HUMAN_CLIPS.death,
        dance: HUMAN_CLIPS.dance,
        ride: HUMAN_CLIPS.ride,
      },
      slideOverlay: false,
      jumpLoops: true,
      runTimeScale: [HUMAN_RIG.runTimeScaleMin, HUMAN_RIG.runTimeScaleMax],
      fadeRun: HUMAN_RIG.fadeRun,
      fadeDeath: HUMAN_RIG.fadeDeath,
    });
  }

  /**
   * Secondary motion. Call after the mixer update.
   * @param origin world position of Player.root (cloth vertices are relative)
   * @param worldSpeed forward speed for the relative wind
   */
  updateSecondary(delta: number, origin: THREE.Vector3, worldSpeed: number): void {
    // Each tail refreshes its anchor bone's world matrix (parents first), so
    // anchors track this frame's root motion without a full-subtree update.
    for (const tail of this.tails) tail.update(delta, origin, worldSpeed);
  }

  /** Re-hang cloth after teleports (revive / run reset). */
  resetSecondary(): void {
    for (const tail of this.tails) tail.reset();
  }

  dispose(): void {
    this.animation.dispose();
    this.object.removeFromParent();
    this.extras.removeFromParent();
    for (const tail of this.tails) tail.dispose();
    for (const g of this.owned.geometries) g.dispose();
    for (const m of this.owned.materials) m.dispose();
    for (const t of this.owned.textures) t.dispose();
    this.tails = [];
    this.owned = { geometries: [], materials: [], textures: [] };
  }
}
