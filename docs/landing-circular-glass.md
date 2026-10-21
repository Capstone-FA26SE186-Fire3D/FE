# Landing: circular glass building

Status: implemented on `feature/landing-circular-glass-lab` (not merged). Design source: Figma "FET3D — Circular Glass Landing"
(storyboard, 10 frames x 4 viewports). Numbers below are targets or local measurements, not acceptance on real devices.

## Experience

Scroll journey: aerial view of the three-storey circular glass building -> main door -> 3/4 turn of the ring corridor
(fire sign, evacuees, junction) -> two branch doors. A "Bỏ qua hành trình" button (top right, hidden once the choice is reached and in static mode) jumps straight to the choice; scrolling back retraces the journey.

- **Trainee**: the world is rendered into a *landscape* phone (device geometry, UVs and render target all use the screen aspect;
  see `phone-fit.ts`). Wide viewports put the phone right of the copy; narrow ones put it on top and the copy/CTA below.
- **Organization**: camera backs off and rises to an orbit-able overview that fits the whole building at any yaw/pitch (`orgOverview`).
  Only this branch has the fire spread and collapse, on the authored clock fire from ~0:02, collapse 1:50 to ~2:20.
  Leaving the branch resets the clock and rebuilds the building. Continue navigates as before.
- Static fallback (reduced motion, WebGL failure, context loss) shows posters `public/assets/landing-opening-v2.webp` /
  `landing-cutaway-v2.webp` (captured from this scene) and both CTAs.

## Code map (`src/features/landing/`)

| File | Role |
| --- | --- |
| `scene/layout.ts` | Shared floor plan: ring radii, door, route arc, camera path `journeyPose`, occupants, fire/smoke anchors, bays, collapse/fire timeline, branch doors, `orgOverview`. Pure, unit-tested. |
| `scene/building.ts` | Glass, slabs, frames, walls in 8 bays x 3 tiers. "Whole" merged meshes for the walk/overview; pivoted per-bay groups + instanced debris once the collapse starts. |
| `scene/smoke.ts` | Instanced smoke/flames/dust, animated in the vertex shader; emitters have start times. |
| `scene/characters.ts` | One-time GLB load (cached), skinned clones, animation LOD, foot-sync playback speed. |
| `scene/phone.ts`, `phone-fit.ts` | Landscape device overlay scene and sizing. |
| `scene/runtime.ts` | `createLandingRuntime`: one WebGLRenderer, quality controller + tier budgets (`budget.ts`), branches, diagnostics (`canvas.dataset.*`). |
| `components/*` | Scroll state, copy, choices, orbit surface, fallback. |

Dev measurement page: `/demo/landing-lab` (404 in production) - same runtime, switches for glass/smoke/characters/tier, live FPS,
draw calls, triangles, renderer/geometry/texture counts. `window.__landingLab` is the test hook.

## Performance design

One renderer, assets loaded once and reused across mounts and branches; no per-frame React state; render stops when the tab is
hidden or the canvas is off-screen; adaptive DPR (`quality.ts`) with a dwell before tier changes. Budgets: characters 12/8/6
(high/medium/low), smoke puffs 360/220/120, phone screen 60/30/20 Hz.

Measured (Chromium in the Claude desktop app, AMD Radeon iGPU, 1440x900 DPR 1.25): display-capped 72 FPS, p95 14.1 ms, 31-41 draw
calls, 63-90k triangles in the journey; the Organization overview uses ~134 draw calls once collapsing. Vsync-capped, so headroom is
unknown. No phone or other laptop measured. Software renderers must not be used to judge performance.

## Tests

`tests/e2e/landing-lab-layout.spec.ts` (camera path through the door, eye height, smoothness, occupants on the floor, phone aspect
and fit at 1440x900 / 1366x768 / 768x1024 / 390x844, collapse order, branch doors), `overview-regressions.spec.ts` (orbit keeps
every bay in frame), `landing-lab-gate.spec.ts` (404 in production; dev: one renderer after remounts, collapse then reset, no
resource growth when switching branches), `landing.spec.ts` (journey, branches, orbit, reduced motion, context loss).

## Characters

Player/NPC GLBs are produced by `scripts/export-landing-characters.py` and `scripts/export-landing-npcs.py` (Blender CLI) from
`artifacts/characters`. Seven NPCs are skinned to the NpcWorker skeleton with automatic weights (Security/Cleaner/Boy use a nearest-
surface weight transfer because heat weighting failed). **Known issue:** arm/hand poses in the walk and jog clips look wrong on the
non-PlayerMale rigs; rigs and clips are being fixed separately. Rig/animation fidelity after GLB export is not verified.

## Not done / not verified

Real-device FPS (laptop iGPU, mid-range phone), contrast review, a Figma side-by-side pass, tablet visual review, Docs repository
update, merge/release.

## Release

Merged to `develop` in #111 and to `main` in #112 on 2026-10-21 (`main` c310c87). Vercel did not create a Production deployment for that
merge commit, so this note was released again to retrigger it; check the Vercel Deployments list for the commit that carries it.
