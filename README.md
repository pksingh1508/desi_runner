# NEON RUN

A production-quality, browser-based **3D endless runner**. Sprint through an
infinite neon grid: switch lanes, jump barriers, slide under beams, collect
energy tokens and survive escalating difficulty.

Built with **Next.js (App Router) + TypeScript + Three.js used directly** —
no React Three Fiber, no game engine.

## Screenshots

> _Placeholder — drop screenshots/gifs here._

| Title screen | Gameplay | Game over |
| ------------ | -------- | --------- |
| todo         | todo     | todo      |

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
| Pause        | `P` / `Esc`              | ❚❚ button       |
| Start/Retry  | `Enter`                  | PLAY button     |
| Mute         | 🔊 button                 | 🔊 button        |

The game auto-pauses when the tab loses visibility.

## Architecture Overview

React owns menus/HUD/overlays; the engine owns everything per-frame.
They communicate through one external store (`GameStore`) that React reads via
`useSyncExternalStore`. HUD numbers are flushed at ~10 Hz; state changes push
immediately. **No React state is touched per frame.**

```text
src/
├── app/                     # layout, page, global styles (CSS keyframes)
├── components/game/         # GameCanvas + LoadingScreen, StartScreen,
│                            # CountdownOverlay, GameHUD, PauseScreen,
│                            # GameOverScreen, DebugPanel (dev only)
├── game/
│   ├── Game.ts              # orchestrator: loop, state machine, systems wiring
│   ├── GameStore.ts         # engine → React bridge (throttled HUD)
│   ├── config/gameplay.ts   # ALL tuning constants (lanes, speeds, tiers…)
│   ├── core/
│   │   ├── Renderer.ts      # WebGLRenderer setup w/ WebGL-missing handling
│   │   ├── GameScene.ts     # scene, fog, lights, camera, star field
│   │   ├── CameraRig.ts     # follow/bob/FOV/shake camera behavior
│   │   ├── AssetManager.ts  # GLTF loading with byte-level progress
│   │   └── StorageService.ts# guarded localStorage (best score, coins, mute)
│   ├── player/
│   │   ├── Player.ts                        # lane damp, jump physics, slide timer, AABB
│   │   └── CharacterAnimationController.ts # mixer, clip mapping, crossfades,
│   │                                       # procedural slide keyframes
│   ├── world/
│   │   ├── WorldManager.ts  # recycled segment ring + entity pooling
│   │   ├── TrackSegment.ts  # road/rails/posts/skyline/billboards per segment
│   │   ├── SharedAssets.ts  # shared geometries/materials/textures
│   │   └── patterns.ts      # hand-authored, always-survivable templates
│   ├── entities/            # Obstacle (kind + collider metadata), Coin (+pool)
│   └── systems/             # Input, Collision, Score, Difficulty,
│                            # ParticleSystem, AudioSystem
└── types/game.ts            # shared types (GameState machine, etc.)
```

### Key decisions

- **Moving world**: the player stays near `z=0`; segments slide toward the
  camera and teleport ahead when fully behind. Coordinates never grow —
  numerically stable for 30-minute runs.
- **One authoritative loop** via `renderer.setAnimationLoop`, delta clamped to
  50 ms so tab switches never explode the simulation.
- **State machine**: `loading → menu → countdown → playing ⇄ paused → gameover`.
- **Animation**: actions are created once; crossfades use weights
  (pattern adapted from the official three.js skinning-blending example).
  `Running` is never restarted while active. The slide animation is a custom
  `AnimationClip` built from `QuaternionKeyframeTrack`s targeting a
  `SlidePivot` node, since most GLB characters ship no slide clip.
- **Never impossible**: obstacle layouts come from validated pattern templates;
  every row leaves at least one valid action by construction.
- **Pooling everywhere**: obstacles, coins, particles and segments are pooled;
  hot loops reuse scratch arrays/vectors (no per-frame allocation).

## Performance Notes

- Capped device pixel ratio (2 desktop / 1.75 coarse-pointer devices)
- Single shadow-casting directional light with a tight frustum
- Distance culling of segments beyond fog; additive emissives instead of many lights
- One `Points` cloud drives every particle effect via a tiny shader
- Draw calls/triangles visible in the dev DebugPanel

## Replacing the Character

1. Drop your `.glb` into `public/models/`.
2. Point `MODEL_URL` in `src/game/config/gameplay.ts` to it.
3. Ensure clips named like `Idle`, `Running`/`Run`, `Jump`, `Death`
   (name matching is fuzzy, see `CharacterAnimationController`); if clips are
   missing, the controller degrades gracefully and the player falls back to a
   procedural bot if the model fails entirely.

## Adding an Obstacle Type

1. Extend `ObstacleKind` and add dimensions to `Obstacle.DIMENSIONS`
2. Build its mesh in `createObstacleMesh`
3. Reference it in a pattern in `world/patterns.ts`

## Adding a Track Pattern

Add a `PatternDef` to `PATTERNS` in `src/game/world/patterns.ts`:
obstacle rows plus coin lines/arcs. Set `minTier` to gate it behind difficulty.
Patterns are hand-authored, which guarantees a survivable route.

## Asset Information

See [ASSETS.md](./ASSETS.md). Everything else in the game (geometry,
textures, audio) is generated procedurally in code.
