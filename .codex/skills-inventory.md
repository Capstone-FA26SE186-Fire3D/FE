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

## Runtime dependency

`@designcodeio/threeui` was added to `package.json` and `package-lock.json`.
It is a React/ThreeUI package, not a Codex skill. Keep Three.js usage inside FE;
do not add it to BE, AI, or Mobile.

## Safety

Only skill folders were copied. Impeccable/UI-UX hook files were not enabled.
Review scripts and references before executing them; never put API keys in this
inventory.
