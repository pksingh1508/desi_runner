# Third-Party Assets

NEON RUN deliberately ships almost no third-party assets: the track, skyline,
billboards, coins, obstacles, particles and all audio are generated
procedurally at runtime. The single external asset is listed below with full
provenance.

---

## RobotExpressive.glb (player character model)

| Field          | Value                                                                                                                             |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Name**       | RobotExpressive                                                                                                                   |
| **Creator**    | Tomás Laulhé ([Quaternius / Patreon](https://www.patreon.com/quaternius))                                                          |
| **Source**     | [three.js repo](https://github.com/mrdoob/three.js/tree/dev/examples/models/gltf/RobotExpressive) · also served at threejs.org examples |
| **License**    | **CC0 1.0 (Public Domain Dedication)** — verified from the model's own README in the three.js repository                            |
| **Local copy** | `public/models/robot_expressive.glb` (unmodified binary, 463 KB)                                                                   |

Original README text from the source repository:

> Model by Tomás Laulhé. Before using this model on a project, consider
> supporting the creator's Patreon. CC0 1.0.
>
> Modifications by Don McCurdy:
>
> - Added three facial expression morph targets
> - Converted with FBX2GLTF
> - Removed duplicate materials and reduced material metalness

### Our modifications

None to the file itself. All in-engine adjustments are runtime-only:

- normalized scale so the robot stands ≈1.9 units tall
- rotated to face the travel direction
- driven by our `CharacterAnimationController` (clips used: `Idle`,
  `Running`, `Jump`, `Death`)

The architecture allows replacing this model by pointing `MODEL_URL`
(`src/game/config/gameplay.ts`) at any GLB with compatible clips — see
README "Replacing the Character".
