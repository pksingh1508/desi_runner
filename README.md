# DESI RUN

A production-quality, browser-based **3D endless runner**. Sprint through
shifting neon sectors: switch lanes, jump barriers, slide under beams, chain
combos, grab power-ups, unleash Overdrive, complete daily missions and level
up — then do it all again.

Built with **Next.js (App Router) + TypeScript + Three.js used directly** —
no React Three Fiber, no game engine.

## V2 at a glance

Three connected loops sit on top of the V1 core:

```text
CORE   Run → Dodge → Collect → Survive
RUN    Power-ups → Combos → Overdrive → Events → Score
META   Run → XP → Missions → Level Up → Unlock → Customize → Run Again
```

| System | What it does |
| ------ | ------------ |
| **Power-ups** | Magnet (8s coin pull), Shield (absorbs one hit), 2× Score (10s), Turbo (6s speed + smashing + protection). Rare weighted spawns with cooldown. |
| **Combo** | Grows only from skillful play; multiplier tiers ×1 → ×3; gentle decay, hard reset on unprotected hits. |
| **Skill events** | Perfect jumps/slides and near misses award score, combo and Overdrive energy. One award per obstacle, ever. |
| **Overdrive** | Charge by playing well; `E` / double-tap for 6s of boosted speed, FOV, destruction and auto-collection. Reinforced gates stay lethal. |
| **Missions** | 3 deterministic daily missions per calendar date; rewards banked at run end. |
| **Progression** | XP curve `80·L^1.35`, levels to 50, data-driven `LEVEL_REWARDS`. |
| **Achievements** | 26 data-driven lifetime milestones with XP/coin rewards. |
| **Customization** | 4 character variants (runtime material tints — GLB untouched) + 5 procedural trails. |
| **Biomes** | Neon City → Underground → Industrial District → Cyber Void, live-blended while you run. |
| **Run events** | Coin Storm, Drone Attack (telegraphed waves), Laser Grid (validated chains). Cooldown-gated. |
| **Run summary** | Animated counters, skill breakdown, XP bar, rewards, level-up reveals. Tap to skip. |

## Tech Stack

- Next.js 16 (App Router), React 19, TypeScript (strict)
- Three.js `WebGLRenderer`, `AnimationMixer` / `AnimationAction`,
  `QuaternionKeyframeTrack` / `VectorKeyframeTrack` / `AnimationClip`
- GLTFLoader for the character model
- Tailwind CSS v4 + CSS keyframes for UI effects
- Procedural WebAudio (all SFX & music synthesized at runtime — zero audio assets)

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

| Action       | Desktop                  | Mobile          |
| ------------ | ------------------------ | --------------- |
| Move left    | `A` / `←`                | Swipe left      |
| Move right   | `D` / `→`                | Swipe right     |
| Jump         | `W` / `↑` / `Space`      | Swipe up        |
| Slide        | `S` / `↓` (slam mid-air) | Swipe down      |
| **Overdrive**| `E`                      | Double-tap      |
| Pause        | `P` / `Esc`              | ❚❚ button       |
| Start/Retry  | `Enter`                  | PLAY button     |

Settings (music / SFX / screen shake / performance mode) live in the menu
footer. The game auto-pauses when the tab loses visibility.

## Architecture Overview

React owns menus/HUD/overlays; the engine owns everything per-frame.
They communicate through one external store (`GameStore`) that React reads via
`useSyncExternalStore`. HUD numbers and combat state (combo, power-up chips,
Overdrive meter) flush at ~10 Hz; state changes push immediately. **No React
state is touched per frame.**

```text
src/
├── app/                     # layout, page, global styles (CSS keyframes)
├── components/game/         # GameCanvas, LoadingScreen, MenuScreen (tabbed),
│                            # CountdownOverlay, GameHUD, PauseScreen,
│                            # RunSummaryScreen, DebugPanel, meta.ts
├── game/
│   ├── Game.ts              # orchestrator: loop, state machine, hit resolution
│   ├── GameStore.ts         # engine → React bridge (throttled HUD + combat)
│   ├── config/              # ALL tuning constants, data-driven content
│   │   ├── gameplay.ts      #   lanes, speeds, camera, difficulty tiers…
│   │   ├── powerups.ts      #   definitions, spawn rules, magnet/turbo tuning
│   │   ├── progression.ts   #   XP curve, level rewards, run-XP weights
│   │   ├── characters.ts    #   character + trail catalogs (unlock levels)
│   │   ├── missions.ts      #   templates + deterministic daily generation
│   │   ├── achievements.ts  #   lifetime achievements
│   │   ├── biomes.ts        #   palettes + distance schedule
│   │   └── events.ts        #   run-event cooldowns/durations
│   ├── core/
│   │   ├── Renderer.ts      # WebGLRenderer setup w/ WebGL-missing handling
│   │   ├── GameScene.ts     # scene, fog, lights, camera, star field
│   │   ├── CameraRig.ts     # follow/bob/FOV(+boost)/shake/impulse
│   │   ├── AssetManager.ts  # GLTF loading with byte-level progress
│   │   └── SaveService.ts   # versioned SaveDataV2 + V1 migration
│   ├── player/
│   │   ├── Player.ts                        # lane damp, jump physics, AABB,
│   │   │                                    # cosmetic character variants
│   │   ├── CharacterAnimationController.ts  # mixer, clips, crossfades
│   │   ├── PlayerFX.ts                      # shield bubble, magnet ring, OD aura
│   │   └── TrailRenderer.ts                 # pooled cosmetic trail particles
│   ├── world/
│   │   ├── WorldManager.ts  # segment ring + obstacle/coin/pickup pools,
│   │   │                    # dynamic storm coins, obstacle destruction
│   │   ├── TrackSegment.ts  # road/rails/posts/skyline/billboards
│   │   ├── BiomeManager.ts  # live fog/light/material blending
│   │   ├── SharedAssets.ts  # shared geo/mats/per-biome billboard textures
│   │   └── patterns.ts      # hand-authored survivable templates + lasers
│   ├── entities/            # Obstacle (destructible + skill flags),
│   │                        # Coin (+magnet attraction), Pickup (+factory)
│   └── systems/             # Input, Collision, Score, Difficulty,
│                            # PowerUp, Combo, Skill, Overdrive, Feedback,
│                            # RunEvent, Mission, Achievement, Progression,
│                            # ParticleSystem, AudioSystem
└── types/game.ts            # shared types (state machine, views, tally…)
```

### Key decisions

- **Moving world**: the player stays near `z=0`; segments slide toward the
  camera and teleport ahead when fully behind. Coordinates never grow —
  numerically stable for 30-minute runs.
- **One authoritative loop** via `renderer.setAnimationLoop`, delta clamped to
  50 ms so tab switches never explode the simulation. Hit-stop effects scale
  simulation time briefly instead of blocking JavaScript.
- **State machine**: `loading → menu → countdown → playing ⇄ paused → gameover`.
- **Animation**: actions created once; crossfades use weights (pattern adapted
  from the official three.js skinning-blending example). `Running` is never
  restarted while active. Slide is a custom `AnimationClip` built from
  `QuaternionKeyframeTrack`s targeting a `SlidePivot` node.
- **Never impossible**: obstacle layouts come from validated pattern templates;
  every row leaves at least one valid action by construction. Event drones
  always telegraph before attacking and never block every lane.
- **Pooling everywhere**: obstacles, coins, pickups, particles, trails and
  segments are pooled; hot loops reuse scratch arrays/vectors.
- **Score ≠ wallet**: run-score multipliers (combo ×2× power-up ×overdrive ×turbo)
  inflate only the run score. Coins banked, XP, and mission rewards always use
  raw values.

## Extending the Game

### Add a power-up

1. Add its definition to `POWERUP_DEFS` in `config/powerups.ts`
   (duration, weight, icon, color).
2. Handle its behavior in `PowerUpSystem` (active state lives there) and apply
   effects where they belong (`Game.updatePlaying` reads the system).
3. Give it a distinct core shape in `entities/Pickup.ts` (`CORE_BUILDERS`).

### Add a mission template

Add an entry to `MISSION_TEMPLATES` in `config/missions.ts` — type, title,
targets, rewards, mode. Daily generation picks from the pool automatically;
no other code changes needed.

### Add an achievement

Append to `ACHIEVEMENTS` in `config/achievements.ts` with a `metric` key from
`PlayerStatsData`. Checks are pure stat comparisons at run end.

### Add a biome

Add a `BiomeDefinition` to `config/biomes.ts` and extend the schedule builder
(`buildScheduleEntry`). Fog/lights/materials blend automatically.

### Add a run event

Implement a branch in `RunEventSystem` (`beginActive` / `tickActive`), add an
announcement label, and respect the cooldown/distance gates already there.

### Add a cosmetic

Characters: extend `CHARACTERS` in `config/characters.ts` (+ a level reward in
`progression.ts`). Trails: extend `TRAILS`; rendering is fully procedural.

### Replace the character model

1. Drop your `.glb` into `public/models/`.
2. Point `MODEL_URL` in `src/game/config/gameplay.ts` at it.
3. Ensure clips named like `Idle`, `Running`/`Run`, `Jump`, `Death`
   (fuzzy matching; the controller degrades gracefully).

## Persistence & Migration

`SaveService` stores a single versioned blob (`neonrun.save.v2`) containing
progression, stats, missions, achievements, customization and settings. On
first load it migrates legacy V1 keys (`neonrun.bestScore`,
`neonrun.bestDistance`, `neonrun.totalCoins`, `neonrun.muted`) without
deleting them, and any corrupted/partial JSON falls back to safe defaults.

Known limitation: daily missions use the local calendar date; a manipulated
device clock shifts mission days. Accepted for a backend-free V2.

## Performance Notes

- Capped device pixel ratio (performance mode drops to 1× and disables shadows)
- Single shadow-casting directional light; additive emissives instead of lights
- One pooled `Points` cloud drives all bursts, one drives the trail
- Biome blending mutates shared materials in place (zero allocations)
- Distance culling beyond fog; draw calls visible in the dev DebugPanel
- Mission UI / achievement checks / persistence run at run-end cadence,
  never per frame

## Asset Information

See [ASSETS.md](./ASSETS.md). Everything else (geometry, textures, audio,
trails, biomes) is generated procedurally in code.
