// Offline asset pipeline for the DESI RUN realistic runners.
//
// NOT part of the app build. Re-creates public/models/desi/*.glb from the
// original CC0 Quaternius packs (see ASSETS.md for sources + licenses):
//   - "Universal Base Characters [Standard]"  (bodies, hair, eyes)
//   - "Universal Animation Library [Standard]" (Unreal-Godot/UAL1_Standard.glb)
//
// Prerequisites (install in a scratch folder, not the project):
//   npm i @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions sharp
// Usage:
//   UBC_DIR="/path/Universal Base Characters[Standard]" \
//   UAL_GLB="/path/UAL1_Standard.glb" \
//   node scripts/build-desi-assets.mjs public/models/desi
//
// Note: the pack's glTFs reference "T_Hair_1_Normal_png.png" and
// "T_Eye_Normal_png.png"; copy T_Hair_1_Normal.png / T_Eye_Normal.png to
// those names inside "Base Characters/Godot - UE" before running.
//
// What it does: WebP-compresses/resizes textures (1024 body, 512 hair),
// strips unused vertex attributes, merges hairstyles into one GLB with baked
// node transforms, and keeps only the needed animation clips with rotation
// tracks (+ pelvis translation) so clips retarget onto every body.
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import {
  prune,
  dedup,
  resample,
  textureCompress,
  clearNodeTransform,
  unpartition,
} from "@gltf-transform/functions";
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const OUT = process.argv[2];
if (!OUT) throw new Error("outDir required");
fs.mkdirSync(OUT, { recursive: true });

const UBC = process.env.UBC_DIR ?? "Universal Base Characters[Standard]";
const UAL = process.env.UAL_GLB ?? "UAL1_Standard.glb";

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

const EXTRA_ATTRS = ["TEXCOORD_1", "TEXCOORD_2", "TEXCOORD_3", "COLOR_0", "COLOR_1"];

function stripExtraAttributes(doc) {
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      for (const sem of EXTRA_ATTRS) {
        if (prim.getAttribute(sem)) prim.setAttribute(sem, null);
      }
    }
  }
}

async function compressTextures(doc, { baseSize, normalSize, otherSize }) {
  await doc.transform(
    textureCompress({ encoder: sharp, targetFormat: "webp", slots: /^baseColorTexture$/, resize: [baseSize, baseSize], quality: 84 }),
    textureCompress({ encoder: sharp, targetFormat: "webp", slots: /^normalTexture$/, resize: [normalSize, normalSize], quality: 90 }),
    textureCompress({ encoder: sharp, targetFormat: "webp", slots: /^metallicRoughnessTexture$/, resize: [otherSize, otherSize], quality: 80 })
  );
}

async function buildCharacter(srcName, outName) {
  const doc = await io.read(path.join(UBC, "Base Characters/Godot - UE", srcName));
  stripExtraAttributes(doc);
  // Eyes/eyebrows only need small textures; body gets 1024.
  await compressTextures(doc, { baseSize: 1024, normalSize: 1024, otherSize: 512 });
  await doc.transform(prune(), dedup());
  await io.write(path.join(OUT, outName), doc);
  console.log("wrote", outName, fs.statSync(path.join(OUT, outName)).size);
}

async function buildHair() {
  const dir = path.join(UBC, "Hairstyles/Origin at 0/glTF (Godot)");
  const files = [
    "Hair_SimpleParted",
    "Hair_Buzzed",
    "Hair_Long",
    "Hair_Buns",
    "Hair_BuzzedFemale",
    "Hair_Beard",
  ];
  // Merge all hairstyles into a single document (one request at runtime).
  const base = await io.read(path.join(dir, files[0] + ".gltf"));
  const baseScene = base.getRoot().getDefaultScene() ?? base.getRoot().listScenes()[0];
  const { mergeDocuments } = await import("@gltf-transform/functions");
  for (const name of files.slice(1)) {
    const other = await io.read(path.join(dir, name + ".gltf"));
    const map = mergeDocuments(base, other);
    // Move merged scene nodes into the base scene.
    for (const scene of other.getRoot().listScenes()) {
      const mergedScene = map.get(scene);
      for (const child of mergedScene.listChildren()) baseScene.addChild(child);
      mergedScene.dispose();
    }
  }
  // Bake node transforms (Buns / BuzzedFemale are authored in cm, Z-up).
  for (const node of base.getRoot().listNodes()) {
    if (node.getMesh()) clearNodeTransform(node);
  }
  // Name meshes after their node so the runtime can look them up.
  for (const node of base.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (mesh) mesh.setName(node.getName());
  }
  stripExtraAttributes(base);
  await compressTextures(base, { baseSize: 512, normalSize: 512, otherSize: 256 });
  await base.transform(prune(), dedup(), unpartition());
  await io.write(path.join(OUT, "hair.glb"), base);
  console.log("wrote hair.glb", fs.statSync(path.join(OUT, "hair.glb")).size);
}

const KEEP_CLIPS = new Set([
  "Idle_Loop",
  "Sprint_Loop",
  "Jog_Fwd_Loop",
  "Jump_Start",
  "Jump_Loop",
  "Jump_Land",
  "Roll",
  "Death01",
  "Dance_Loop",
  "Hit_Chest",
  "Driving_Loop",
  "Swim_Fwd_Loop",
  "Walk_Loop",
]);

async function buildAnimations() {
  const doc = await io.read(UAL);
  const root = doc.getRoot();
  for (const anim of root.listAnimations()) {
    if (!KEEP_CLIPS.has(anim.getName())) {
      for (const s of anim.listSamplers()) s.dispose();
      for (const c of anim.listChannels()) c.dispose();
      anim.dispose();
      continue;
    }
    for (const ch of anim.listChannels()) {
      const node = ch.getTargetNode();
      const name = node ? node.getName() : "";
      const p = ch.getTargetPath();
      // Rotations carry the motion. Bone translations/scales are rest data
      // of the mannequin and would distort other body proportions — only the
      // pelvis keeps its translation (bob + crouch), re-offset at runtime.
      const drop =
        p === "scale" ||
        (p === "translation" && name !== "pelvis") ||
        name === "root" ||
        name.includes("_leaf_");
      if (drop) {
        const s = ch.getSampler();
        ch.dispose();
        if (s && s.listParents().filter((x) => x.propertyType !== "Root").length === 0) s.dispose();
      }
    }
  }
  // Remove the mannequin mesh + skin; keep the joint hierarchy (targets).
  for (const node of root.listNodes()) {
    if (node.getMesh()) node.setMesh(null);
    if (node.getSkin()) node.setSkin(null);
  }
  for (const skin of root.listSkins()) skin.dispose();
  await doc.transform(resample({ tolerance: 1e-4 }), prune({ keepLeaves: true }), dedup());
  // Report pelvis rest translation for runtime retarget offsets.
  const pelvis = root.listNodes().find((n) => n.getName() === "pelvis");
  console.log("UAL pelvis rest", pelvis?.getTranslation());
  await io.write(path.join(OUT, "anims.glb"), doc);
  console.log("wrote anims.glb", fs.statSync(path.join(OUT, "anims.glb")).size);
  console.log("clips", root.listAnimations().map((a) => a.getName()).join(", "));
}

await buildCharacter("Superhero_Male_FullBody.gltf", "runner_male.glb");
await buildCharacter("Superhero_Female_FullBody.gltf", "runner_female.glb");
await buildHair();
await buildAnimations();
