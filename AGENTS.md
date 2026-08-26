# AGENT.md

## Project Mission

We are building a production-quality browser-based **3D endless runner game** using Next.js and native Three.js.

This is not a Three.js demo.

Every architectural and implementation decision should move the project toward a polished, responsive, maintainable, playable game.

The initial game is a three-lane futuristic endless runner with:

- continuous forward movement
- lane switching
- jumping
- sliding
- obstacles
- collectibles
- score
- distance
- increasing difficulty
- animated 3D character
- procedural/recycled world
- game-over/restart
- desktop controls
- mobile swipe controls

---

# Mandatory Technology

Use:

- Next.js
- App Router
- React
- TypeScript
- Three.js
- WebGLRenderer
- GLTFLoader
- AnimationMixer
- AnimationAction
- AnimationClip
- Three.js keyframes where appropriate
- CSS keyframes for UI where appropriate

Do not introduce another game engine.

Do NOT use:

- React Three Fiber
- Drei
- Unity
- Unreal
- Phaser
- Babylon.js

unless the project owner explicitly changes this requirement.

Three.js should be used directly.

---

# Three.js Reference

Character animation implementation should be informed by the official Three.js example:

https://threejs.org/examples/#webgl_animation_skinning_blending

Study and adapt concepts relating to:

- skeletal animation
- GLTF loading
- AnimationMixer
- AnimationAction
- animation clips
- animation weights
- crossfading
- idle/walk/run animation
- animation update loops

Do not blindly copy example code.

Adapt the patterns to our architecture.

Other official Three.js examples may be inspected when useful.

---

# Third-Party Asset Policy

Do not assume an asset is free merely because it appears in an open-source repository.

Before committing a third-party:

- model
- texture
- sound
- music file
- HDRI
- image

verify its license.

Document third-party assets in:

```text
ASSETS.md
```

Include:

```text
Name
Creator
Source
License
Modifications
```

Prefer:

```text
CC0
public domain
MIT-compatible assets
project-created assets
```

when possible.

A useful initial character candidate is the official Three.js `RobotExpressive` model because it has a clearly documented permissive CC0 license and useful animation clips.

Architecture must allow the character model to be replaced later.

---

# Architectural Principle

React and Three.js have different responsibilities.

## React / Next.js owns

- menus
- HUD
- overlays
- settings
- loading screen
- game-over interface
- high-level application integration

## Three.js/game modules own

- rendering
- render loop
- scene
- player movement
- world movement
- collisions
- camera
- animation mixers
- particles
- environment
- obstacles
- collectibles

Never drive frame-by-frame transforms using React state.

Never trigger React renders at 60 FPS for ordinary gameplay state.

---

# Client-Side Rule

Three.js is browser-side code.

Never access:

```text
window
document
localStorage
WebGL
```

from server-rendered code.

Use `"use client"` only where required.

Keep the client boundary intentional.

---

# Game Loop Rule

Maintain one authoritative game loop.

Use delta-time-based simulation.

Do not tie movement speed directly to frame count.

Clamp unusually large delta values.

Example:

```ts
const delta = Math.min(clock.getDelta(), 0.05);
```

All gameplay should behave approximately the same at:

```text
30 FPS
60 FPS
120 FPS
```

---

# Game State

Use an explicit state machine.

Expected states:

```ts
type GameState =
  | "loading"
  | "menu"
  | "countdown"
  | "playing"
  | "paused"
  | "gameover";
```

Do not create contradictory boolean state combinations.

---

# Player

Player supports exactly three lanes for the MVP.

Conceptually:

```text
LEFT
CENTER
RIGHT
```

Player functionality:

- continuous run
- left movement
- right movement
- jump
- slide
- collision
- animation state
- death

Lane movement must interpolate smoothly rather than teleport.

---

# Character Animation

Character animation logic belongs in one dedicated controller.

Expected responsibilities:

```text
load/discover clips
create AnimationMixer
create actions
map names
play actions
crossfade
one-shot actions
looping actions
update mixer
cleanup
```

Never restart `Running` every frame.

Change animation only when the animation state actually changes.

Typical transitions:

```text
Idle -> Running
Running -> Jump -> Running
Running -> Slide -> Running
Running -> Death
```

---

# Jump Physics

Jump is simulation-driven, not purely visual.

Track:

```text
verticalVelocity
gravity
grounded
jumpForce
```

Collision position and visible character position must remain synchronized.

---

# Slide

Slide temporarily changes gameplay collision bounds.

At the end of the slide:

- restore normal collider
- restore normal player state
- transition to Running

---

# Endless World

Never grow the world indefinitely.

Use recycled sections/segments.

When a segment is behind the player:

```text
move it forward
reset entities
generate next valid pattern
reuse it
```

Prefer pooling over continuous allocation.

---

# Obstacle Generation

The game must never intentionally generate an impossible path.

Prefer validated pattern templates over unconstrained randomness.

At every obstacle sequence there must be at least one valid player action.

Examples:

```text
lane change
jump
slide
```

Difficulty may increase complexity, but not make the game unfair.

---

# Collision

Use lightweight collision detection for the MVP.

A full physics engine is not required.

Use simple bounding volumes/custom hitboxes and only evaluate nearby gameplay entities.

Collision logic must understand player states including:

```text
jumping
sliding
normal
```

---

# Performance

Performance is a feature.

Target smooth 60 FPS where hardware permits.

Prefer:

- geometry reuse
- material reuse
- object pooling
- InstancedMesh
- limited shadows
- limited real-time lights
- capped pixel ratio
- frustum culling
- local assets

Do not allocate avoidable objects inside hot per-frame loops.

Reuse:

```ts
Vector3;
Box3;
Quaternion;
Matrix4;
```

temporary objects when appropriate.

---

# Renderer

Use WebGLRenderer.

Prefer high-performance configuration.

Cap expensive device pixel ratios.

Resize correctly when viewport dimensions change.

Never accidentally create multiple renderers or animation loops.

---

# Cleanup

Every system that registers something must be capable of removing it.

On unmount/destruction clean:

- animation loop
- keyboard listeners
- pointer listeners
- touch listeners
- resize listener
- geometry
- material
- texture
- AnimationMixer
- audio
- renderer

Development hot reload should not leave duplicate loops running.

---

# Input

Desktop:

```text
A / Left Arrow      left
D / Right Arrow     right
W / Up / Space      jump
S / Down Arrow      slide
Escape / P          pause
```

Mobile:

```text
Swipe Left
Swipe Right
Swipe Up
Swipe Down
```

Input processing should be centralized.

Do not bind game logic separately from multiple unrelated UI components.

---

# Visual Style

Target:

```text
stylized
futuristic
neon
dark
fast
clean
readable
premium
```

Do not copy branding, characters, environments, or distinctive assets from existing commercial endless runners.

Originality matters.

---

# Camera

Third-person runner camera.

Priorities:

1. obstacle visibility
2. smooth tracking
3. responsiveness
4. visual polish

Camera effects such as:

- FOV increase
- shake
- bob
- lane response

must remain subtle.

Never sacrifice gameplay readability for cinematic movement.

---

# Difficulty

Difficulty progresses gradually.

Increase combinations of:

```text
speed
obstacle density
pattern complexity
moving obstacles
```

Clamp maximum speed.

Do not create difficulty by making unavoidable patterns.

---

# UI

The game requires:

- loading screen
- menu
- countdown
- HUD
- pause UI
- game-over UI
- restart

Buttons must work.

Do not leave decorative/nonfunctional controls.

---

# Persistence

Use localStorage for MVP persistence of:

```text
best score
best distance
total coins
```

Guard browser APIs correctly under Next.js.

---

# Dependency Policy

Before adding a package ask:

```text
Can this be implemented cleanly using Next.js, browser APIs, or Three.js itself?
```

If yes, prefer that solution.

Avoid dependency bloat.

Do not add a large physics engine simply for basic AABB collisions.

Do not add an animation library merely for basic Three.js interpolation.

---

# Code Quality

Prefer:

- small focused classes/modules
- meaningful names
- TypeScript types
- configuration constants
- reusable utilities
- explicit ownership of resources

Avoid:

- giant files
- giant React components
- `any`
- duplicated logic
- magic numbers
- hidden global state
- cyclic dependencies
- unnecessary abstractions

---

# Suggested Modules

Maintain separation roughly around:

```text
Game
Renderer
Scene
Camera
AssetManager
Player
PlayerController
CharacterAnimationController
WorldManager
TrackSegment
InputSystem
CollisionSystem
ScoreSystem
DifficultySystem
ParticleSystem
AudioSystem
```

The exact names may change if a better architecture emerges.

---

# V2 Systems (current architecture)

V2 keeps every gameplay system modular and data-driven. All balance values
live in `src/game/config/*` — never scatter magic numbers into classes.

```text
PowerUpSystem        central active-state owner (magnet/shield/2x/turbo)
ComboSystem          combo count, multiplier tiers, milestones, decay
SkillSystem          near-miss arming + perfect jump/slide judging (once per obstacle)
OverdriveSystem      energy meter, activation, damped intensity ramp
FeedbackSystem       prioritized toast queue + event banner (max 3 visible)
RunEventSystem       Coin Storm / Drone Attack / Laser Grid + drone pool
MissionSystem        deterministic daily missions, mid-run progress, rewards at run end
AchievementSystem    stat-derived unlocks from config/achievements.ts
ProgressionSystem    XP curve, levels, LEVEL_REWARDS granting
BiomeManager         live fog/light/material blending across biome schedule
TrailRenderer        pooled cosmetic trail particles
PlayerFX             shield bubble / magnet ring / overdrive aura
SaveService          versioned SaveDataV2 blob + V1 key migration (localStorage)
```

Ownership rules that keep this sane:

- `Game` is the only orchestrator; systems never import each other.
- Score multipliers affect run score only — wallets and XP always use raw values.
- React reads via `GameStore`; meta screens re-read `SaveService` when
  `metaVersion` bumps (run end / equip).
- Persistence happens at meaningful moments (run end, equip), never per frame.

To add content without touching unrelated systems see README
"Extending the Game" (power-up / mission / achievement / biome / event /
cosmetic recipes).

---

# Development Workflow

For every substantial feature:

```text
inspect existing implementation
↓
understand dependencies
↓
implement smallest complete version
↓
run game
↓
test feature
↓
fix errors
↓
verify previous features
↓
refactor if necessary
↓
continue
```

Do not rewrite working architecture without a concrete reason.

---

# Never Stop at a Plan

When instructed to implement something, implement it.

Do not respond with only:

- suggestions
- pseudo-code
- architecture diagrams
- TODO lists

unless specifically asked for planning only.

Use the tools available to inspect and modify the repository.

---

# Debugging

Do not patch symptoms blindly.

When an error occurs:

1. reproduce it
2. identify root cause
3. inspect related code
4. implement proper fix
5. test it
6. ensure the fix did not break gameplay

---

# Validation

Before declaring work complete run appropriate checks including:

```bash
npm run lint
npm run build
```

Resolve significant errors.

Also manually verify gameplay when possible.

---

# Definition of Done

Core MVP is not done unless all of these work:

- game loads
- character renders
- character runs
- animation mixer works
- lane left
- lane right
- jump
- slide
- endless track
- recycled segments
- obstacles
- collision
- coins
- score
- distance
- difficulty progression
- death/game over
- restart
- pause
- keyboard controls
- swipe controls
- responsive canvas
- best-score persistence
- clean production build

---

# Current Priority

Do NOT work on:

- authentication
- backend
- database
- multiplayer
- accounts
- shop
- skins marketplace
- leaderboard server
- battle pass
- ads
- analytics
- monetization

until the core game is polished.

Our current priority is:

> Make running, dodging, jumping, sliding, collecting, collision, animation, camera movement, and procedural world generation feel excellent.

---

# Decision Making

Make reasonable implementation decisions autonomously.

Do not interrupt development for trivial choices.

Prefer solutions that are:

1. simple
2. performant
3. maintainable
4. type-safe
5. appropriate for a browser game

When uncertain about Three.js API behavior, inspect current official Three.js documentation/examples rather than relying on potentially outdated memory.

When uncertain about an asset license, do not use the asset until its license is verified.
