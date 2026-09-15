# Installed project skills — FE

Updated: 2026-09-13

All skills in this file are copied project-local under `.agents/skills/`. The
generated `skills-lock.json` records the source paths and content hashes.

## React/web/3D skills

- `frontend-patterns` — `affaan-m/ecc`.
- `vercel-react-best-practices`, `web-design-guidelines` —
  `vercel-labs/agent-skills`.
- `3dviz-pro-max` — `viettranx/3dviz-pro-max`; Three.js/3D visualization.
- `scroll-craft` — `nateherkai/scroll-craft`; scroll-driven web UI.
- `impeccable` — `pbakaus/impeccable`; UI review and refinement.
- `ui-ux-pro-max` — `nextlevelbuilder/ui-ux-pro-max-skill`; design-system/UI
  generation. The installer reported High Risk; review its scripts before use.

## Taste skills

Installed from `Leonxlnx/taste-skill`: `design-taste-frontend`,
`design-taste-frontend-v1`, `gpt-taste`, `image-to-code`,
`redesign-existing-projects`, `high-end-visual-design`,
`full-output-enforcement`, `minimalist-ui`, `industrial-brutalist-ui`,
`stitch-design-taste`, `imagegen-frontend-web`, and `brandkit`.

Use `design-taste-frontend` as the default. Use v1 or a style-specific skill
explicitly, not several contradictory visual variants at once.

## Fire3D web UX execution map

- `design-taste-frontend`: translate the approved dark architectural visual system, Vietnamese typography and content hierarchy into tokens and components.
- `scroll-craft`: author the first-person building journey, one clear visual peak and the two audience branches; preserve readable pauses for copy.
- `3dviz-pro-max`: model the building landmarks, fire sources, smoke depth, occlusion, light response and camera path. Consult the local `motion-profile` records for state-derived playback and interruptible focus.
- `ecc:motion-foundations` + `ecc:motion-advanced`: define motion tokens, reduced-motion behavior, interruptible branch transitions and cleanup/visibility handling. Use `motion/react` for UI motion; do not use it as a WebGL renderer.
- `imagegen`: create concept plates, textures and fallback stills only when raster assets are needed. Keep generated assets separate from semantic HTML copy.
- `remotion-best-practices`: optional for storyboard/teaser/video assets; it is not a runtime dependency and must not replace scroll-controlled Three.js scene state.
- `vercel-react-best-practices` + `web-design-guidelines`: review loading, accessibility, mobile composition, focus order and performance before implementation.

Runtime boundary: `@designcodeio/threeui@1.2.0` is already declared and locked. Inspect a component before reuse; `EmberStorm`/particle components may provide visual references or bounded effects, but the Fire3D building scene remains custom Three.js and must have a fallback. Three.js stays in FE; Unity remains the Mobile gameplay runtime.

## Runtime dependency

`@designcodeio/threeui` is declared in `package.json` and locked in `pnpm-lock.yaml`.
It is a React/ThreeUI package, not a Codex skill. Keep Three.js usage inside FE;
do not add it to BE, AI, or Mobile.

## Safety

Only skill folders were copied. Impeccable/UI-UX hook files were not enabled.
Review scripts and references before executing them; never put API keys in this
inventory.
