# Landing completion — acceptance ledger

Source of truth: ../../Docs/fire3d-web-ux-design.md and the approved corrective plan.
Direction: cinematic semi-realistic architecture, physically coherent scale and convincing materials/light. No backend management or web gameplay.

## Milestones

- [x] Diagnose WebGL fallback with runtime evidence; fix lifecycle, fonts, navigation.
- [x] Complete eye-level hallway, doors, connected stairs, source-bound fire/smoke and three reading beats.
- [x] Complete interruptible Android render-target reveal and same-building cutaway; explicit continue and return.
- [x] Complete sample auth/save/ask/hub and truthful public pages; preserve RAG contract.
- [ ] Verify production, actual rendered scenes, reduced motion, failures, keyboard, mobile and performance.

### Current verification — 2026-09-20

The implementation milestones above are covered by the production build and the full Playwright suite. From the FE repository, `pnpm typecheck`, `pnpm lint`, `pnpm build`, and `pnpm test:e2e -- --reporter=line` completed successfully; the suite ran 38 tests covering WebGL rendering, branch interruption and return, render-target handoff, reduced motion, context-loss fallback, keyboard/orbit controls, mobile layout, session recovery, RAG request handling, fire/weather timelines, authored paths and collapse/reset behavior.

The final verification milestone remains open for the visual four-viewport capture matrix, the full 143-second visual review, real-device performance measurements and contrast review. Automated tests establish behavior and lifecycle handling; they do not establish those visual or hardware targets.

## Acceptance

### Revision checkpoint — 2026-09-16 (not final acceptance)

- Implemented: wall-painted branch labels with opposite arrows, projected accessible click areas, no hover glow or card backgrounds at the junction.
- Implemented: connected cutaway exposing corridors, room-origin fire clusters offset across storeys, staggered outward spread, occupants on all three floors using the staircase path.
- Verified visually: live scene visible inside rounded phone after fixing display/bevel occlusion; desktop and mobile wall lettering (moved overlapping level sign).
- Orbit changes camera; pointerdown explicitly focuses without scrolling. Arrow/Home supported; orbit outline removed per user request. This does not establish complete keyboard accessibility.
- Current code checks: production build and TypeScript pass for the shared fire timeline, exterior/roof volumes and articulated, instanced occupants. Five non-browser tests cover ignition ordering, corridor crossings, local corner rounding, sampled wall clearance and joint/foot motion. These do not establish visual quality or full collision safety.
- Historical browser checks: wall controls, orbit and phone display were inspected before the newest renderer/NPC changes. RAG and sample-session tests passed in an earlier suite. A later six-test run had a missing volume shader and is not valid evidence that the complete scene rendered. The latest runtime now treats shader errors as failures; the complete production browser suite must be rerun.
- Latest production context-loss test initialized an actual canvas and verified usable fallback. Earlier Browser usage restrictions do not constitute current visual acceptance; latest full collapse and four-viewport review remain outstanding.

- Latest changes: corridor fire on all floors/both sides; facade bounds6m; dark smoke with feathered volume/sprite edges; 3 panic and3 cough reactions; cutaway soot65–105s and per-bay collapse110–143s. Shell visibility ownership and final glazing bounds corrected. Damage numerical regression tests cover staged fall/reset and cutaway visibility.
- The older full transition test timed out at90s after keyboard assertions. A timeout/session closure is not evidence that its expected hidden button was wrong. Current release checks are recorded below and in PRs; do not label visual/performance targets complete.
- Remaining: smooth phone-to-organization intermediate frames, full NPC collision/appearance pass, fire/material visual acceptance, complete four-viewport capture matrix, production performance/contrast/lifecycle evidence and snapshot continuity.

Opening: already inside corridor; exact headline; readable architecture and copy.
Journey: stable horizon, reverse camera only, ambient time forward, door/column occlusion, no wall crossings.
Junction: exact need labels; hold without selection; no automatic routing.
Trainee: actual 3D phone with live scene screen; login or existing sample session -> hub.
Organization: same three-floor building, stairs, scenario/spawn markers, ember links; snapshot route bridge.
Runtime: one renderer, ref/uniform frame updates, hidden/offscreen pause, owned resources disposed, no WebGL in reduced motion.
Fallback: real scene poster with normal document flow and working links, never CSS door substitution.
Evidence: opening/mid/junction/phone/cutaway at 1440x900, 1920x1080, 390x844 and 360x640; transition samples; retained outside build cache.
Quality gates: frozen install, typecheck, lint, build, production tests; no false pass from text-only or poster-only tests.
Performance targets: LCP <=2.5s, CLS <=0.1, interaction <=200ms, desktop 60fps/mobile >=30fps on explicitly tested hardware. Emulation is not real-device evidence.

## Delivery boundaries

### Release verification — 2026-09-16

- Tested application/test tree: 2c7d421. Frozen install, TypeScript, full ESLint and Next production build passed (14 generated pages).
- Stable completed production build: `pnpm test:e2e` passed all30 tests in3.8min, including real WebGL startup/context-loss, scroll reversal, branch interruption/return/login, pointer/Arrow/Home, mobile menu, session failures, RAG contracts and numerical fire/NPC/damage regressions.
- The original90s multi-flow test was split into three focused tests. Trace measured7–11s per rendered click on this runner; the two GPU-heavy functional cases allow120s and completed around72–78s. This is NOT evidence of meeting interaction/FPS targets.
- An intermediate suite overlapped a rebuild and had28/30 passes; it is not release evidence. The clean rerun above passed unchanged session assertions. Build first, then start the production test server.
- Documentation-only follow-up records these results and lessons. Docs companion PR5/6 merged. No remote CI was configured at review; these are local checks, not CI status.
- Remaining visual143s/four-viewport/real-device/performance acceptance above stays open. No backend or validated structural simulation claim.

Keep feature/landing-experience and existing relevant changes. No commit/push/PR unless requested.
Session data is demonstrative; no active QR/APK claims. Remotion only for separately requested video.
Runtime findings and remaining verification limits belong in the local handoff and verification report, not invented success claims.
