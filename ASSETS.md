# Third-Party Assets

DESI RUN uses local character assets and seven licensed MP3 sound effects.
Streets, buildings, sky, obstacles, pickups, particles, cloth, outfits and
UI ornaments are generated at runtime. The desi music and remaining effects
are synthesized, and some catchphrases use the device speech engine.
External assets and their individual licenses are documented below.

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

## 4. Downloaded sound effects and comic reactions

Downloaded through the Brave browser from SoundboardShop on **2026-10-01**.
Licenses were verified on each original creator's Freesound page linked below;
a free download listing alone was not treated as a reuse license. The shipped
files are SoundboardShop's MP3 renditions, renamed but otherwise unmodified.
Gain envelopes and the playback changes listed below happen only at runtime.

### Coin Jump

- **Name:** Coin Jump
- **Creator:** Jerimee (Jerimee Richir)
- **Source:** [Original Freesound upload](https://freesound.org/people/Jerimee/sounds/535890/) · [SoundboardShop download](https://www.soundboardshop.com/en/instant/coin-jump)
- **License:** [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) (shown on the original upload)
- **Local file:** `public/sounds/sfx/coin.mp3`
- **Modifications / use:** Coin pickups; gain adjusted during playback.

### Sound Effects 01 03 2015 - 4 Fast Slide 1.wav

- **Name:** Sound Effects 01 03 2015 - 4 Fast Slide 1.wav
- **Creator:** Bas Lamerichs (B_Lamerichs)
- **Source:** [Original Freesound upload](https://freesound.org/people/B_Lamerichs/sounds/265393/) · [SoundboardShop download](https://www.soundboardshop.com/en/instant/sound-effects-01-03-2015-4-fast-slide-1wav)
- **License:** [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) (shown on the original upload)
- **Local file:** `public/sounds/sfx/slide.mp3`
- **Modifications / use:** Slide; first 0.5 seconds played at 1.2× speed with gain adjustment and fades.

### Swing Woosh

- **Name:** Swing Woosh
- **Creator:** Jofae
- **Source:** [Original Freesound upload](https://freesound.org/people/Jofae/sounds/389590/) · [SoundboardShop download](https://www.soundboardshop.com/en/instant/swing-woosh)
- **License:** [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) (shown on the original upload)
- **Local file:** `public/sounds/sfx/whoosh.mp3`
- **Modifications / use:** Near misses; gain adjusted during playback.

### pling sound effect ui interface ding ting sound.wav

- **Name:** pling sound effect ui interface ding ting sound.wav
- **Creator:** Leonardmedia.nl
- **Source:** [Original Freesound upload](https://freesound.org/people/Leonardmedia.nl/sounds/627794/) · [SoundboardShop download](https://www.soundboardshop.com/en/instant/pling-sound-effect-ui-interface-ding-ting-soundwav)
- **License:** [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) (shown on the original upload)
- **Local file:** `public/sounds/sfx/reward.mp3`
- **Modifications / use:** Power-ups, perfect actions, missions and unlocks; playback speed/gain vary; perfect cue is a short excerpt.

### Bright Bounce

- **Name:** Bright Bounce
- **Creator:** Jerimee
- **Source:** [Original Freesound upload](https://freesound.org/people/Jerimee/sounds/527527/) · [SoundboardShop download](https://www.soundboardshop.com/en/instant/bright-bounce)
- **License:** [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) (shown on the original upload)
- **Local file:** `public/sounds/memes/bounce.mp3`
- **Modifications / use:** Jump at 1.12× speed; comic slide/near-miss reactions at original speed; gain adjusted.

### Fail.mp3

- **Name:** Fail.mp3
- **Creator:** LittleRainySeasons
- **Source:** [Original Freesound upload](https://freesound.org/people/LittleRainySeasons/sounds/335906/) · [SoundboardShop download](https://www.soundboardshop.com/en/instant/failmp3)
- **License:** [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) (shown on the original upload)
- **Local file:** `public/sounds/memes/fail.mp3`
- **Modifications / use:** Comic crash reaction; gain adjusted during playback.

### Fanfare - Rpg

- **Name:** Fanfare - Rpg
- **Creator:** colorsCrimsonTears
- **Source:** [Original Freesound upload](https://freesound.org/people/colorsCrimsonTears/sounds/566203/) · [SoundboardShop download](https://www.soundboardshop.com/en/instant/fanfare-rpg)
- **License:** [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) (shown on the original upload)
- **Local file:** `public/sounds/memes/fanfare.mp3`
- **Modifications / use:** Level-up and new-record celebration; gain adjusted during playback.

Public attribution is also shipped at `/sounds/credits.html`, linked from
menu and pause settings. The CC BY 4.0 slide sound must retain its creator,
source, license and modification credit in redistributed builds.

The original procedural soundtrack remains synchronized with TAAL gameplay.
Remaining speech/synth reactions are fallbacks and are configured in
`src/game/config/memes.ts`. File effects are configured in
`src/game/config/audioSamples.ts`; meme clips in
`public/sounds/memes/manifest.json`. See that folder's README for extension rules.
