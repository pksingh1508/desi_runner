# Third-Party Assets

DESI RUN ships very few third-party assets: the streets, buildings, sky,
obstacles, pickups, particles, cloth, outfits, UI ornaments and ALL audio
(music, SFX and meme voice lines) are generated procedurally at runtime.
The external assets below are all **CC0 1.0 (public domain)**, listed with
full provenance.

---

## 1. Universal Base Characters [Standard] — realistic desi runners

| Field          | Value |
| -------------- | ----- |
| **Name**       | Universal Base Characters (Standard / free version) |
| **Creator**    | Quaternius ([quaternius.com](https://quaternius.com), [Patreon](https://www.patreon.com/quaternius)) |
| **Source**     | [quaternius.com/packs/universalbasecharacters.html](https://quaternius.com/packs/universalbasecharacters.html) · [itch.io](https://quaternius.itch.io/universal-base-characters) |
| **License**    | **CC0 1.0 Universal** — verified from `License_Standard.txt` inside the downloaded pack ("CC0 1.0 Universal (CC0 1.0) Public Domain Dedication") |
| **Local files** | `public/models/desi/runner_male.glb` (Superhero_Male_FullBody), `public/models/desi/runner_female.glb` (Superhero_Female_FullBody), `public/models/desi/hair.glb` (Hair_SimpleParted, Hair_Buzzed, Hair_Long, Hair_Buns, Hair_BuzzedFemale, Hair_Beard) |

### Modifications

Made offline with `scripts/build-desi-assets.mjs` (glTF-Transform):

- textures re-encoded to WebP (`EXT_texture_webp`) and resized (body 1024², hair 512²);
- unused vertex attributes removed (extra UV sets, vertex colors);
- the six hairstyles merged into one GLB, node transforms baked into the meshes.

At runtime (code only, files untouched): a bind-pose **clothing shader**
(`src/game/player/human/OutfitMaterial.ts`) paints each runner's outfit
(tees, kurtas, track jackets, khaki uniform, track pants…) and shifts the
skin albedo to warm desi tones; **accessories** (turban, mustache, aviators,
bindi, tilak, jhumkas, bangles, sweatbands, sneakers) and **simulated cloth**
(dupatta, gamcha) are built procedurally (`Accessories.ts`, `ClothTail.ts`).

## 2. Universal Animation Library [Standard] — runner animations

| Field          | Value |
| -------------- | ----- |
| **Name**       | Universal Animation Library (Standard / free version) |
| **Creator**    | Quaternius |
| **Source**     | [quaternius.com/packs/universalanimationlibrary.html](https://quaternius.com/packs/universalanimationlibrary.html) · [itch.io](https://quaternius.itch.io/universal-animation-library) · [OpenGameArt](https://opengameart.org/content/universal-animation-library) |
| **License**    | **CC0 1.0 Universal** — verified from `License.txt` inside the downloaded pack |
| **Local file** | `public/models/desi/anims.glb` (from `Unreal-Godot/UAL1_Standard.glb`) |

### Modifications

- kept 13 clips: `Idle_Loop`, `Sprint_Loop`, `Jog_Fwd_Loop`, `Jump_Start`,
  `Jump_Loop`, `Jump_Land`, `Roll`, `Death01`, `Dance_Loop`, `Hit_Chest`,
  `Driving_Loop`, `Swim_Fwd_Loop`, `Walk_Loop`;
- removed the mannequin mesh/skin, scale tracks, leaf-bone tracks and every
  bone translation except the pelvis (rotation-only clips retarget cleanly
  onto both body proportions; the pelvis track is re-offset per body at
  runtime in `HumanAssets.ts`);
- resampled to drop redundant keyframes.

Both packs share the same 65-bone humanoid skeleton, so the clips bind to the
bodies by bone name.

The slide is **not** from the pack (it only has a forward `Roll`, kept as a
fallback): the lean-back `Desi_Slide` clip is project-created — keyframe
poses in `src/game/config/humanRig.ts` are baked per body at runtime by
`src/game/player/human/SlideClip.ts`.

---

## 3. RobotExpressive.glb (CLASSIC squad: VECTOR)

| Field          | Value |
| -------------- | ----- |
| **Name**       | RobotExpressive |
| **Creator**    | Tomás Laulhé ([Quaternius / Patreon](https://www.patreon.com/quaternius)) |
| **Source**     | [three.js repo](https://github.com/mrdoob/three.js/tree/dev/examples/models/gltf/RobotExpressive) · also served at threejs.org examples |
| **License**    | **CC0 1.0 (Public Domain Dedication)** — verified from the model's own README in the three.js repository |
| **Local copy** | `public/models/robot_expressive.glb` (unmodified binary, 463 KB) |

Original README text from the source repository:

> Model by Tomás Laulhé. Before using this model on a project, consider
> supporting the creator's Patreon. CC0 1.0.
>
> Modifications by Don McCurdy:
>
> - Added three facial expression morph targets
> - Converted with FBX2GLTF
> - Removed duplicate materials and reduced material metalness

Our modifications: none to the file. Runtime-only: normalized to ≈1.9 units
tall, rotated to face the travel direction, tinted per cosmetic, and driven by
`CharacterAnimationController` (`Idle`, `Running`, `Jump`, `Death`). It is now
loaded lazily, only when VECTOR is equipped. The other CLASSIC runners are
procedural rigs in `src/game/player/ClassicRigs.ts`.

---

## Audio & meme voice lines

No audio files are shipped. Music and SFX are synthesized with Web Audio.
The desi meme reactions are license-free recreations: a synthesized vocal
effect ("FAAAH!") plus short catchphrases ("Aasmaan ki unchaiyon mein!",
"Land kara de!", "Jaldi wahan se hato!", "Moye moye"…) spoken by the
player's own device via the Web Speech API. No film/meme audio clips are
included — see
`public/sounds/memes/README.md` for how to plug in clips you have the rights
to use.
