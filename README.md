# DESI RUN · देसी रन

A browser-based **3D endless runner set in vibrant Indian streets**. Sprint
through the bazaars of Chandni Chowk, Jaipur's Pink City, rain-soaked Mumbai
lanes and a glowing Diwali night. Dodge cows, cycle-rickshaws and Horn-OK-Please
trucks, slide under railway phaataks and saree clotheslines, ride a Diwali
rocket, and get roasted by desi meme reactions along the way.

Built with **Next.js (App Router) + TypeScript + Three.js used directly** —
no React Three Fiber, no game engine.

## What makes it different

| Feature | What it does |
| ------- | ------------ |
| **Realistic desi runners** | 8 realistic 3D humans (RAJU, PRIYA, JASSI, MEERA, INSPECTOR, HERO, BABLI, SHERA) — CC0 base bodies + CC0 motion library (sprint, jump, death, dance, ride) + a lean-back, feet-first slide baked from code keyframes. Outfits are painted by a bind-pose clothing shader (tees, kurtas, track jackets, khaki uniform); turbans, mustaches, aviators, bindis, jhumkas, bangles and sneakers are bone-attached; dupattas and gamchas are simulated cloth that flies in the wind. The 15 legacy stylized rigs live on as the CLASSIC squad. |
| **Indian streets** | Four live-blended biomes — CHANDNI CHOWK, PINK CITY, MUMBAI MONSOON (rain, puddles, lightning), DIWALI NIGHT (fireworks, sky lanterns, bulb strings). Shophouses with Hindi/English signboards, balconies, water tanks, AC units, tangled wires, bunting, kites, pigeons, yellow-black kerbs. |
| **Street hazards** | Police barricades, sabzi thelas, road-work boards (jump) · cows and cycle-rickshaws crossing (jump / dodge) · HORN OK PLEASE trucks, chai tapris, loaded autos (dodge) · signboards, saree clotheslines, mela banners (slide) · railway phaatak and स्वागत arches (slide, unbreakable). Each variant's collider matches its model. |
| **Desi power-ups** | CHUMBAK magnet (coins from every lane home in on you), NIMBU-MIRCHI shield (wards off one crash), DOUBLE DHAMAKA ×2, CHAI BOOST turbo, and the **DIWALI ROCKET** — ride a festival firecracker (launch → cruise → smooth landing on a cleared street); flights last 5 s, +1 s for every further rocket in the same run (up to 10 s). |
| **JOSH** | The overdrive meter: fill it, then smash through at full speed — "DHOOM!" |
| **TAAL** | Jump on the dhol beat for a streak bonus; the soundtrack is part of the game. |
| **Meme reactions** | Short viral desi memes tied to what the runner does: "FAAAH!" on slides and last-second dodges, "Aasmaan ki unchaiyon mein!" on the Diwali rocket and "Land kara de!" as it comes down, "Jaldi wahan se hato!" before drone attacks / traffic jams, "DHOOM!" for CHAI BOOST / JOSH, "Moye moye" on a crash — plus "Bhaag Milkha bhaag!", "Tiger abhi zinda hai!", "Just looking like a wow!" and "Paisa hi paisa!" — with comic caption bubbles. License-free: formant synthesis + the device's own speech voice (see `public/sounds/memes/README.md`). |
| **Desi soundtrack** | Procedural dhol/tabla grooves, tanpura drone and shehnai/bansuri leads improvising in a raag flavour per biome; tempo rises with speed. Auto-rickshaw honks, cow moos and cycle bells announce traffic. |
| **Street moments** | Near-miss a cow: "GAU MATA KI JAI!" · squeeze past a truck: "HORN OK PLEASE!" · events: PAISA BAARISH (money rain), SHAADI DRONE ATTACK (wedding camera drones), TRAFFIC JAM. |
| **Meta** | Combos, daily missions, XP to level 50, achievements, Life-Saver keys, GEAR with live 3D preview of every runner (locked ones too). |

## Tech Stack

- Next.js 16 (App Router), React 19, TypeScript (strict)
- Three.js `WebGLRenderer`, `GLTFLoader`, `AnimationMixer` / `AnimationAction`,
  `SkeletonUtils`, `EffectComposer` (MSAA HDR + bloom + output pass)
- Tailwind CSS v4 + CSS keyframes for all UI motion
- Web Audio (music, SFX, formant vocals) + Web Speech API (meme lines)

## Getting Started

```bash
npm install
npm run dev        # http://localhost:3000
```

Production:

```bash
npm run build
npm start
```

Type checking:

```bash
npx tsc --noEmit
```

## Controls

| Action        | Desktop                  | Mobile          |
| ------------- | ------------------------ | --------------- |
| Move left     | `A` / `←`                | Swipe left      |
| Move right    | `D` / `→`                | Swipe right     |
| Jump          | `W` / `↑` / `Space`      | Swipe up        |
| Slide         | `S` / `↓` (slam mid-air) | Swipe down      |
| **JOSH**      | `E`                      | Double-tap      |
| Pause         | `P` / `Esc`              | ❚❚ button       |
| Start / retry | `Enter`                  | BHAAGO! button  |

Settings (SFX / music / meme voices / screen shake / performance mode) live in
the menu footer. The game auto-pauses when the tab loses visibility.

## Architecture Overview

React owns menus/HUD/overlays; the engine owns everything per-frame. They talk
through one external store (`GameStore`) read with `useSyncExternalStore`. HUD
numbers, combat state and coin pops flush at ~10 Hz; state changes push
immediately. **No React state is touched per frame.**

```text
src/
├── app/                       # layout (next/font), page, globals.css
├── components/
│   ├── game/                  # GameCanvas, screens (Loading, Menu, Countdown,
│   │   ├── hud/               #   HUD, Pause, Revive, RunSummary), HUD parts,
│   │   ├── menu/              #   menu tabs, summary panels, meta.ts
│   │   └── summary/
│   └── ui/                    # design system: Button, Ring, Logo, ornaments,
│       └── styles/            #   tokens / motion / primitives / menu / hud css
└── game/
    ├── Game.ts                # orchestrator: loop, state machine, hit resolution
    ├── GameStore.ts           # engine → React bridge (throttled)
    ├── config/                # ALL tuning + data-driven content
    │   ├── gameplay.ts        #   lanes, speeds, camera, rocket ride, TAAL, post FX…
    │   ├── characters.ts      #   desi + classic runners, outfits
    │   ├── humanRig.ts        #   realistic runner assets, clip map, landmarks
    │   ├── powerups.ts        #   power-ups, magnet field
    │   ├── obstacles.ts       #   obstacle variants + colliders per biome
    │   ├── biomes.ts          #   biome palettes + schedule
    │   ├── buildings.ts       #   street styles per biome
    │   ├── street.ts, ambient.ts
    │   ├── memes.ts, music.ts #   meme lines, raag themes
    │   └── missions / achievements / progression / events
    ├── core/                  # Renderer, GameScene, CameraRig (showcase + chase),
    │                          # PostFX (bloom), AssetManager, SaveService
    ├── player/
    │   ├── Player.ts          # lanes, jump physics, slide, rocket ride, rig swap
    │   ├── CharacterAnimationController.ts
    │   ├── human/             # HumanRig, OutfitMaterial, Accessories,
    │   │                      # ClothTail (verlet cloth), HumanAssets (lazy)
    │   ├── ClassicRigs.ts     # legacy procedural rigs
    │   ├── DiwaliRocket.ts    # the ridable rocket + spark trail
    │   └── PlayerFX.ts        # nimbu-mirchi shield, chumbak field, JOSH aura
    ├── world/                 # WorldManager (segment ring + pools),
    │   ├── street/            # merged street/building/decor geometry,
    │   ├── atmosphere/        # sky dome, skyline, kites, birds, rain,
    │   ├── textures/          # fireworks, lanterns, facade + street atlases
    │   └── gfx/
    ├── entities/              # Obstacle (+ obstacles/ models), Coin (homing),
    │                          # Pickup (+ pickups/), Key, Rocket, ShaadiDrone,
    │                          # PaisaRain
    ├── audio/                 # DesiMusic, DesiSfx, MemeVoice, FormantVoice,
    │                          # SpeechVoice, MemeClips, instruments
    └── systems/               # Input, Collision, Score, Difficulty, PowerUp,
                               # Combo, Skill, Overdrive (JOSH), Feedback,
                               # RunEvent, Mission, Achievement, Progression,
                               # Particle, Audio
```

### Key decisions

- **Moving world**: the runner stays near `z=0`; segments slide toward the
  camera and teleport ahead. Coordinates never grow.
- **One authoritative loop** (`renderer.setAnimationLoop`), delta clamped to
  50 ms; hit-stop scales simulation time instead of blocking.
- **State machine**: `loading → menu → countdown → playing ⇄ paused → revive → gameover`.
- **One rig at a time**: human runners own their `AnimationMixer`; the VECTOR
  robot's mixer is created only while equipped, so bone names never collide.
- **Never impossible**: obstacle rows come from validated templates; every row
  leaves at least one valid action; the rocket's landing zone is cleared.
- **Room to run**: consecutive rows keep a minimum *reaction time* (1.3 s at
  start speed easing to 1.05 s at top speed, measured at the speed the runner
  will have on arrival), a breather follows every 6 rows, and drone attacks /
  traffic jams run on reserved stretches of road announced as they arrive.
- **Pooling + merging everywhere**: obstacles, coins (one draw call each),
  pickups, particles, drones and street segments are pooled; the whole street
  is ~40–50 draw calls; hot loops reuse scratch objects.
- **Score ≠ wallet**: run multipliers never inflate coins banked or XP.

## Extending the Game

### Add a desi runner

Add a `CharacterDefinition` with `archetype: "human"` and an `outfit` to
`DESI_CHARACTERS` in `config/characters.ts` (body, skin tone, hair, top style
and sleeves, bottom, shoes, accessories, colors) and a level reward in
`config/progression.ts`. No new art is needed — the outfit shader and
accessories build the look.

### Add a meme line

Add an entry to `MEME_LINES` in `config/memes.ts` (Hindi + romanized text,
caption, cooldown, chance, priority, optional stinger) and trigger the event
with `audio.playMeme(event)` from `Game.ts`. Keep them short and tied to a
runner action — one word or one viral line.

### Add a biome

Add a `BiomeDefinition` to `BIOMES` in `config/biomes.ts` and a matching
`STREET_STYLES` entry (keyed by the biome `id`) in `config/buildings.ts`.
Atmosphere, fog, lights and street materials blend automatically.

### Add an obstacle variant

Add it to `OBSTACLE_VARIANTS` in `config/obstacles.ts` (kind, collider,
approach cue, biome weights) and build its model in
`entities/obstacles/models/`. Keep the collider inside the kind's fairness
envelope documented at the top of `config/obstacles.ts`.

### Add a power-up / mission / achievement

Power-ups: `POWERUP_DEFS` in `config/powerups.ts`, behavior in
`PowerUpSystem`, model in `entities/pickups/PickupModels.ts`. Missions:
`MISSION_TEMPLATES` in `config/missions.ts`. Achievements: `ACHIEVEMENTS` in
`config/achievements.ts`.

## Persistence & Migration

`SaveService` stores one versioned blob (`neonrun.save.v2`): progression,
stats, missions, achievements, customization and settings (incl. the meme
voice toggle). Legacy V1 keys are migrated; corrupted data falls back to safe
defaults. Saves that had a CLASSIC runner equipped switch once to RAJU (classics
stay unlocked in GEAR).

## Performance Notes

- Pixel ratio capped; performance mode drops to 1×, disables shadows and the
  post-processing chain (touch devices skip bloom by default)
- One shadow-casting sun; decor never casts shadows
- Merged/instanced street geometry built once per biome variant; recycling
  never allocates
- Coins are a single merged mesh; particle sprites are size-capped
- Human runners load lazily (the other body is warmed in the background);
  realistic runner assets total ~2.8 MB (WebP textures)
- Typical frame: ~190–230 draw calls during a run at 60 FPS on a laptop

## Asset Information

See [ASSETS.md](./ASSETS.md). The realistic runners and their animations are
CC0 (Quaternius); everything else — streets, obstacles, pickups, outfits,
accessories, music, SFX and meme voices — is generated in code.
`scripts/build-desi-assets.mjs` documents how the CC0 packs were optimized.
